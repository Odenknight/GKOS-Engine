import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { selectCurrentTests, shouldRetryCurrentTestGroup, STABILITY_PRIORITY_TESTS } from './current-test-plan.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// Q-GUARD: the unchanged historical test executes at its fixed checkout in
// the separate historical lane. Current integrity is tested by qualification.
const plan = selectCurrentTests(readdirSync(join(root, 'test')));
const files = plan.files;
if (!files.length) throw new Error('Current test inventory is empty');
for (const exemption of plan.exemptions) {
  process.stdout.write(`# qualification-exempt ${exemption.name}: ${exemption.reason}; enable with ${exemption.environment}\n`);
}
const priority = new Set(STABILITY_PRIORITY_TESTS);
const groups = [
  ...STABILITY_PRIORITY_TESTS.filter((name) => files.includes(name)).map((name) => [name]),
  files.filter((name) => !priority.has(name)),
].filter((group) => group.length);
const countKeys = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
const totals = Object.fromEntries(countKeys.map((key) => [key, 0]));
const countLine = /^(?:#|ℹ)\s+(tests|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$/u;
let failed = false;

for (const [index, group] of groups.entries()) {
  process.stdout.write(`# qualification-group ${index + 1}/${groups.length}: ${group.join(',')}\n`);
  let attempt = 0;
  let result;
  for (;;) {
    result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...group.map(name => join(root, 'test', name))], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    if (!shouldRetryCurrentTestGroup(group, result, combined, attempt)) break;
    process.stdout.write('# qualification-retry watcher latency exceeded once; rerunning in a fresh process\n');
    attempt += 1;
  }
  const seen = new Set();
  const output = (result.stdout ?? '').split(/(?<=\n)/u).filter((line) => {
    const match = line.trimEnd().match(countLine);
    if (!match) return true;
    if (seen.has(match[1])) throw new Error(`Ambiguous ${match[1]} count in qualification group`);
    seen.add(match[1]);
    totals[match[1]] += Number(match[2]);
    return false;
  }).join('');
  if (seen.size !== countKeys.length) throw new Error('Incomplete qualification group counts');
  process.stdout.write(output);
  process.stderr.write(result.stderr ?? '');
  if (result.status !== 0) failed = true;
}

if (!totals.tests || totals.tests !== totals.pass + totals.fail + totals.cancelled + totals.skipped + totals.todo) {
  throw new Error('Incoherent aggregate current-runtime counts');
}
for (const key of countKeys) process.stdout.write(`# ${key} ${totals[key]}\n`);
process.exitCode = failed ? 1 : 0;
