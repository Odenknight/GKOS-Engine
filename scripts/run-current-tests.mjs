import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { selectCurrentTests } from './current-test-plan.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// Q-GUARD: the unchanged historical test executes at its fixed checkout in
// the separate historical lane. Current integrity is tested by qualification.
const plan = selectCurrentTests(readdirSync(join(root, 'test')));
const files = plan.files;
if (!files.length) throw new Error('Current test inventory is empty');
for (const exemption of plan.exemptions) {
  process.stdout.write(`# qualification-exempt ${exemption.name}: ${exemption.reason}; enable with ${exemption.environment}\n`);
}
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files.map(name => join(root, 'test', name))], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
