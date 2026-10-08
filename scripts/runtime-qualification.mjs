import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HISTORICAL = '97ae3560a4fa2e771b60fa63d6dc0349d0b4c864';
export const AUDITED = '8207958047b3361ae21ac07c5a2abbd26a42a684';
export const VERSION = 'gkos-current-runtime-qualification/1';
export const MANIFEST = 'contracts/runtime-qualification/v1/change-inventory.json';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, maxBuffer: 128 * 1024 * 1024 });
const gitText = (root, ...args) => git(root, ...args).toString('utf8').trim();
const paths = (root, ...args) => git(root, ...args).toString('utf8').split('\0').filter(Boolean).sort();
export const treeEntries = (root, ref) => new Map(paths(root, 'ls-tree', '-r', '-z', ref).map(line => {
  const [header, path] = line.split('\t'); return [path, header.split(' ')[2]];
}));
const blob = (root, ref, path) => {
  try { return sha(git(root, 'show', `${ref}:${path}`)); } catch { return null; }
};
const current = (root, path) => {
  const target = join(root, path);
  if (!existsSync(target)) return null;
  if (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink()) throw new Error(`Non-regular qualification input: ${path}`);
  return sha(readFileSync(target));
};
const currentBlob = (root, path) => {
  if (current(root, path) === null) return null;
  const data = readFileSync(join(root, path));
  return createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
};

export function sourceSnapshot(root = ROOT) {
  const files = [...new Set(paths(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'))];
  const inventory = files.map(path => ({ path, sha256: current(root, path) }));
  const source = { head: gitText(root, 'rev-parse', 'HEAD'), tree: gitText(root, 'rev-parse', 'HEAD^{tree}'), files: inventory };
  return { ...source, sha256: sha(JSON.stringify(source)) };
}

export function checkInventory(root = ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'));
  if (manifest.version !== VERSION || manifest.historical !== HISTORICAL || manifest.audited !== AUDITED) throw new Error('Qualification coordinates changed');
  if (gitText(root, 'merge-base', '--is-ancestor', AUDITED, 'HEAD') !== '') throw new Error('Unrelated candidate');
  const historicalTree = treeEntries(root, HISTORICAL), auditedTree = treeEntries(root, AUDITED);
  const expectedHistorical = paths(root, 'diff', '--name-only', '-z', HISTORICAL, AUDITED);
  if (JSON.stringify(manifest.historical_changes.map(x => x.path)) !== JSON.stringify(expectedHistorical)) throw new Error('Historical change inventory differs');
  for (const entry of manifest.historical_changes) {
    if (!entry.rationale || entry.before !== (historicalTree.get(entry.path) ?? null) || entry.after !== (auditedTree.get(entry.path) ?? null)) throw new Error(`Historical change not bound: ${entry.path}`);
  }
  // Freeze the entire original pack, generator, test and eleven-job workflow.
  for (const entry of manifest.frozen) {
    if (entry.sha256 !== blob(root, HISTORICAL, entry.path) || current(root, entry.path) !== entry.sha256) throw new Error(`Frozen evidence changed: ${entry.path}`);
  }
  const frozenExpected = paths(root, 'ls-tree', '-r', '--name-only', '-z', HISTORICAL, 'contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1', 'scripts/generate-agent-identity-mcp-contract-draft1.mjs', 'test/agent-identity-mcp-contract.test.mjs', '.github/workflows/phase6-identity-contract.yml');
  if (JSON.stringify(manifest.frozen.map(x => x.path)) !== JSON.stringify(frozenExpected)) throw new Error('Frozen inventory omitted an input');
  const all = [...new Set([...paths(root, 'ls-tree', '-r', '--name-only', '-z', AUDITED), ...paths(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard')])].sort();
  const changes = all.filter(path => path !== MANIFEST && (auditedTree.get(path) ?? null) !== currentBlob(root, path));
  if (JSON.stringify(changes) !== JSON.stringify(manifest.candidate_changes.map(x => x.path))) throw new Error('Unreviewed candidate change inventory');
  for (const entry of manifest.candidate_changes) {
    if (!entry.rationale || entry.before !== (auditedTree.get(entry.path) ?? null) || entry.after !== current(root, entry.path)) throw new Error(`Unreviewed candidate bytes: ${entry.path}`);
  }
  return { version: VERSION, historical: HISTORICAL, audited: AUDITED, manifest_sha256: sha(readFileSync(join(root, MANIFEST))), source: sourceSnapshot(root) };
}

export function counts(output) {
  const values = {};
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const matches = [...output.matchAll(new RegExp(`^(?:#|ℹ)\\s+${key}\\s+(\\d+)\\s*$`, 'gmu'))];
    if (matches.length !== 1) throw new Error(`Missing/ambiguous test count: ${key}`);
    values[key] = Number(matches[0][1]);
  }
  if (!values.tests || values.tests !== values.pass + values.fail + values.cancelled + values.skipped + values.todo) throw new Error('Incoherent test counts');
  return values;
}

export function executeQualification({ root = ROOT, output, historical = false }) {
  if (!output) throw new Error('An output directory outside the checkout is required');
  const out = resolve(output), checkout = resolve(root);
  if (out === checkout || out.startsWith(checkout + '/') || out.startsWith(checkout + '\\')) throw new Error('Receipt output must be outside source checkout');
  mkdirSync(out, { recursive: true });
  const receipt = { version: VERSION, lane: historical ? 'historical-contract-replay' : 'current-runtime', source: null, node: process.version, platform: process.platform, arch: process.arch, started_at: new Date().toISOString(), commands: [], status: 'FAIL', release_qualified: false };
  try {
    const initial = sourceSnapshot(root);
    receipt.source = initial;
    if (historical && (initial.head !== HISTORICAL || gitText(root, 'status', '--porcelain', '--untracked-files=all'))) throw new Error('Historical checkout must be exact and clean');
    if (!historical) checkInventory(root);
    const plan = historical
      ? [['--test', '--test-concurrency=1', 'test/agent-identity-mcp-contract.test.mjs']]
      : [['scripts/build.mjs'], ['scripts/run-current-tests.mjs']];
    for (const [index, args] of plan.entries()) {
      const start = performance.now();
      const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 20 * 60 * 1000 });
      const text = (run.stdout || '') + (run.stderr || '');
      const log = `${receipt.lane}-${index}.log`;
      writeFileSync(join(out, log), text);
      const command = { executable: process.execPath, args, exit_code: run.status, duration_ms: performance.now() - start, log, log_sha256: sha(text) };
      receipt.commands.push(command);
      if (args.includes('--test') || args.includes('scripts/run-current-tests.mjs')) command.counts = counts(text);
      if (run.error || run.status !== 0 || (command.counts && (command.counts.fail || command.counts.cancelled || command.counts.todo))) throw new Error(`Qualification command failed: ${args.join(' ')}`);
    }
    if (sourceSnapshot(root).sha256 !== initial.sha256) throw new Error('Source changed during qualification');
    if (historical && (gitText(root, 'rev-parse', 'HEAD') !== HISTORICAL || gitText(root, 'status', '--porcelain', '--untracked-files=all'))) throw new Error('Historical checkout changed during qualification');
    if (!historical) checkInventory(root);
    receipt.status = receipt.commands.some(x => x.counts?.skipped) ? 'INCOMPLETE_PLATFORM_COVERAGE' : 'PASS';
  } catch (error) { receipt.error = error.message; }
  receipt.ended_at = new Date().toISOString();
  const temporaryReceipt = join(out, `.${receipt.lane}-${randomUUID()}.tmp`);
  writeFileSync(temporaryReceipt, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  renameSync(temporaryReceipt, join(out, `${receipt.lane}.json`));
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--check') console.log(JSON.stringify(checkInventory()));
  else if (args.length === 2 && args[0] === '--output') {
    const result = executeQualification({ output: args[1] }); console.log(JSON.stringify({ status: result.status, commands: result.commands })); process.exitCode = result.status === 'PASS' ? 0 : 1;
  } else if (args.length === 4 && args[0] === '--historical-checkout' && args[2] === '--output') {
    const result = executeQualification({ root: resolve(args[1]), output: args[3], historical: true }); console.log(JSON.stringify({ status: result.status, commands: result.commands })); process.exitCode = result.status === 'PASS' ? 0 : 1;
  } else throw new Error('Usage: --check | --output DIR | --historical-checkout CHECKOUT --output DIR');
}
