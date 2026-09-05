import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { shouldRetryWatcherQualification } from './current-test-plan.mjs';

const [runnerInput, artifactRootInput, ...extra] = process.argv.slice(2);
if (!runnerInput || !artifactRootInput || extra.length) throw new Error('Expected runner and artifact-root paths');
const runner = resolve(runnerInput);
const artifactRoot = resolve(artifactRootInput);

for (let attempt = 0; attempt < 2; attempt += 1) {
  const result = spawnSync(process.execPath, [runner, '--artifact-root', artifactRoot], {
    encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.status === 0) break;
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const retry = shouldRetryWatcherQualification(result, output, readdirSync(artifactRoot).length, attempt);
  if (!retry) { process.exitCode = result.status ?? 1; break; }
  process.stdout.write('# qualification-retry dedicated watcher latency exceeded once; rerunning in a fresh process\n');
}
