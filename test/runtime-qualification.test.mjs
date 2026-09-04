import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { checkInventory, counts, sourceSnapshot, executeQualification, COMMAND_TIMEOUT_MS, MANIFEST } from '../scripts/runtime-qualification.mjs';
import { HISTORICAL_TEST, selectCurrentTests, STABILITY_PRIORITY_TESTS } from '../scripts/current-test-plan.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let fixture;
before(() => {
  fixture = mkdtempSync(join(tmpdir(), 'gkos-runtime-qualification-'));
  execFileSync('git', ['clone', '--shared', '--no-checkout', root, fixture], { stdio: 'pipe' });
  execFileSync('git', ['-c', 'core.autocrlf=false', 'checkout', '--detach', 'HEAD'], { cwd: fixture, stdio: 'pipe' });
  for (const file of sourceSnapshot(root).files) {
    const dest = join(fixture, file.path);
    if (file.sha256 === null) { rmSync(dest, { force: true }); continue; }
    mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, readFileSync(join(root, file.path)));
  }
});
after(() => { if (fixture) rmSync(fixture, { recursive: true, force: true }); });

test('versioned current inventory binds actual candidate and unchanged historical artifacts', () => {
  const reviewed = readFileSync(join(fixture, 'test', 'service-reference-freshness.test.mjs'));
  assert.equal(reviewed.includes(Buffer.from('\r\n')), false, 'reviewed source must retain canonical LF bytes');
  assert.equal(checkInventory(fixture).source.sha256, sourceSnapshot(root).sha256);
});
test('an unlisted new source or edited reviewed bytes fails the current gate', () => {
  const extra = join(fixture, 'src', 'unreviewed-probe.ts');
  writeFileSync(extra, 'export const unreviewed = true;\n');
  try { assert.throws(() => checkInventory(fixture), /Unreviewed candidate change inventory/); }
  finally { rmSync(extra); }
  const target = join(fixture, 'src', 'service', 'mcp.ts'), old = readFileSync(target);
  writeFileSync(target, Buffer.concat([old, Buffer.from('\n// unreviewed change\n')]));
  try { assert.throws(() => checkInventory(fixture), /Unreviewed candidate bytes/); }
  finally { writeFileSync(target, old); }
  const reviewed = join(fixture, 'test', 'service-reference-freshness.test.mjs'), lf = readFileSync(reviewed);
  writeFileSync(reviewed, Buffer.from(lf.toString('utf8').replaceAll('\n', '\r\n')));
  try { assert.throws(() => checkInventory(fixture), /Unreviewed candidate bytes/); }
  finally { writeFileSync(reviewed, lf); }
});
test('frozen evidence cannot be edited or omitted from the versioned inventory', () => {
  const target = join(fixture, 'test', 'agent-identity-mcp-contract.test.mjs'), old = readFileSync(target);
  writeFileSync(target, Buffer.concat([old, Buffer.from('\n// changed historical assertion\n')]));
  try { assert.throws(() => checkInventory(fixture), /Frozen evidence changed/); }
  finally { writeFileSync(target, old); }
  const manifestPath = join(fixture, MANIFEST), original = readFileSync(manifestPath), manifest = JSON.parse(original);
  manifest.frozen.pop(); writeFileSync(manifestPath, JSON.stringify(manifest));
  try { assert.throws(() => checkInventory(fixture), /Frozen inventory omitted/); }
  finally { writeFileSync(manifestPath, original); }
});
test('test receipt counts refuse missing, duplicate, empty and incoherent execution summaries', () => {
  assert.equal(COMMAND_TIMEOUT_MS, 30 * 60 * 1000);
  const valid = '# tests 3\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n';
  assert.deepEqual(counts(valid), { tests: 3, pass: 2, fail: 0, cancelled: 0, skipped: 1, todo: 0 });
  assert.throws(() => counts(valid.replace('# pass 2\n', '')), /Missing/);
  assert.throws(() => counts(valid + '# tests 3\n'), /ambiguous/);
  assert.throws(() => counts(valid.replace('# tests 3', '# tests 4')), /Incoherent/);
  assert.throws(() => counts(valid.replace('# tests 3', '# tests 0')), /Incoherent/);
});
test('current test selection exposes only the owner-supplied local-model observation exemption', () => {
  const names = [HISTORICAL_TEST, 'service-vector-real.test.mjs', 'runtime-qualification.test.mjs', 'not-a-test.txt'];
  const withoutModel = selectCurrentTests(names, {});
  assert.deepEqual(withoutModel.files, ['runtime-qualification.test.mjs']);
  assert.deepEqual(withoutModel.exemptions.map(({ name, environment }) => ({ name, environment })), [{
    name: 'service-vector-real.test.mjs', environment: 'GKOS_TEST_LOCAL_EMBEDDING_CONFIG',
  }]);
  assert.deepEqual(selectCurrentTests(names, { GKOS_TEST_LOCAL_EMBEDDING_CONFIG: 'operator-owned.json' }).files,
    ['runtime-qualification.test.mjs', 'service-vector-real.test.mjs']);
});
test('strict timing and shutdown oracles run before exhaustive suite load without changing coverage', () => {
  const ordinary = ['z-last.test.mjs', 'a-first.test.mjs'];
  const names = [...ordinary, ...STABILITY_PRIORITY_TESTS].reverse();
  const selected = selectCurrentTests(names, {});
  assert.deepEqual(selected.files, [...STABILITY_PRIORITY_TESTS, ...ordinary.sort()]);
  assert.equal(new Set(selected.files).size, names.length);
});
test('hosted current qualification restores canonical Engine and Standard bytes', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'runtime-qualification.yml'), 'utf8');
  assert.match(workflow, /GIT_CONFIG_COUNT: 1/);
  assert.match(workflow, /GIT_CONFIG_KEY_0: core\.autocrlf/);
  assert.match(workflow, /GIT_CONFIG_VALUE_0: "false"/);
});
test('command-scope Git configuration overrides autocrlf before checkout', () => {
  const checkout = mkdtempSync(join(tmpdir(), 'gkos-runtime-autocrlf-'));
  try {
    execFileSync('git', ['init'], { cwd: checkout, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.name', 'Qualification fixture'], { cwd: checkout });
    execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: checkout });
    writeFileSync(join(checkout, 'governed.txt'), 'alpha\nbeta\n');
    execFileSync('git', ['-c', 'core.autocrlf=false', 'add', 'governed.txt'], { cwd: checkout });
    execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture'], { cwd: checkout, stdio: 'pipe' });
    rmSync(join(checkout, 'governed.txt'));
    execFileSync('git', ['config', 'core.autocrlf', 'true'], { cwd: checkout });
    const uncontrolled = { ...process.env };
    delete uncontrolled.GIT_CONFIG_COUNT;
    delete uncontrolled.GIT_CONFIG_KEY_0;
    delete uncontrolled.GIT_CONFIG_VALUE_0;
    execFileSync('git', ['checkout-index', '--all', '--force'], { cwd: checkout, env: uncontrolled, stdio: 'pipe' });
    assert.equal(readFileSync(join(checkout, 'governed.txt'), 'utf8'), 'alpha\r\nbeta\r\n');
    rmSync(join(checkout, 'governed.txt'));
    execFileSync('git', ['checkout-index', '--all', '--force'], {
      cwd: checkout,
      env: { ...uncontrolled, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'false' },
      stdio: 'pipe',
    });
    assert.equal(readFileSync(join(checkout, 'governed.txt'), 'utf8'), 'alpha\nbeta\n');
  } finally { rmSync(checkout, { recursive: true, force: true }); }
});
test('preflight rejection replaces a stale PASS receipt with a bound FAIL receipt', () => {
  const out = mkdtempSync(join(tmpdir(), 'gkos-receipt-failure-'));
  const target = join(fixture, MANIFEST), original = readFileSync(target), manifest = JSON.parse(original);
  manifest.audited = '0000000000000000000000000000000000000000';
  writeFileSync(target, JSON.stringify(manifest));
  writeFileSync(join(out, 'current-runtime.json'), JSON.stringify({ status: 'PASS', stale: true }));
  try {
    const receipt = executeQualification({ root: fixture, output: out });
    assert.equal(receipt.status, 'FAIL'); assert.match(receipt.error, /coordinates changed/);
    assert.equal(receipt.commands.length, 0); assert.ok(receipt.source.sha256);
    assert.deepEqual(JSON.parse(readFileSync(join(out, 'current-runtime.json'))), receipt);
  } finally { writeFileSync(target, original); rmSync(out, { recursive: true, force: true }); }
});
test('source identity changes when HEAD changes even if file bytes are identical', () => {
  const before = sourceSnapshot(fixture);
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: fixture, encoding: 'utf8' }).trim();
  const commit = execFileSync('git', ['-c', 'user.name=Qualification fixture', '-c', 'user.email=fixture@example.invalid', 'commit-tree', tree, '-p', before.head, '-m', 'Disposable identity probe'], { cwd: fixture, encoding: 'utf8' }).trim();
  execFileSync('git', ['update-ref', 'HEAD', commit], { cwd: fixture });
  try {
    const after = sourceSnapshot(fixture); assert.deepEqual(after.files, before.files);
    assert.equal(after.tree, before.tree); assert.notEqual(after.head, before.head); assert.notEqual(after.sha256, before.sha256);
  } finally { execFileSync('git', ['update-ref', 'HEAD', before.head], { cwd: fixture }); }
});
