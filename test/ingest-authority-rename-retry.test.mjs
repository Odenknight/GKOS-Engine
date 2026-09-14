import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRELOAD = join(ROOT, 'test', 'support', 'ingest-authority-rename-fault.cjs');
const DRIVER = join(ROOT, 'test', 'support', 'ingest-authority-rename-driver.mjs');

function runScenario(scenario) {
  const child = spawnSync(process.execPath, [DRIVER], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: `--require=${PRELOAD}`, GKOS_TEST_AUTHORITY_RENAME_FAULT: scenario },
  });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

test('Windows active authority-witness rename retries remain atomic and fail closed', { skip: process.platform !== 'win32' }, () => {
  const transient = runScenario('transient');
  assert.equal(transient.attempts, 2);
  assert.equal(transient.result_status, 'published');
  assert.equal(transient.error, null);
  assert.equal(transient.entries.some((name) => name.endsWith('.tmp')), false);

  const persistent = runScenario('persistent');
  assert.equal(persistent.attempts, 7);
  assert.equal(persistent.error.code, 'EPERM');
  assert.equal(persistent.error.message, 'injected authority rename failure 1');
  assert.equal(JSON.parse(persistent.authority).state, 'activating');
  assert.equal(persistent.entries.filter((name) => name.endsWith('.tmp')).length, 1);
  assert.equal(persistent.entries.includes('active-ingest.json'), true);

  const changedTemporary = runScenario('temp-changed');
  assert.equal(changedTemporary.attempts, 1);
  assert.match(changedTemporary.error.message, /^GKX_INGEST_AUTHORITY_TEMP_/u);
  assert.equal(changedTemporary.entries.filter((name) => name.endsWith('.tmp')).length, 1);

  const nonretryable = runScenario('nonretryable');
  assert.equal(nonretryable.attempts, 1);
  assert.equal(nonretryable.error.code, 'EACCES');
  assert.equal(nonretryable.error.message, 'injected authority rename failure 1');
  assert.equal(nonretryable.entries.filter((name) => name.endsWith('.tmp')).length, 1);

  const duringWait = runScenario('pointer-changed-during-wait');
  assert.equal(duringWait.attempts, 1);
  assert.equal(duringWait.wait_mutations, 1);
  assert.match(duringWait.error.message, /POINTER/u);
  assert.equal(duringWait.entries.filter((name) => name.endsWith('.tmp')).length, 0);

  const driftErrors = {
    'witness-changed': /^GKX_INGEST_AUTHORITY_WITNESS_/u,
    'lock-changed': /^GKX_INGEST_AUTHORITY_LOCK_/u,
    'pointer-changed': /POINTER/u,
    'namespace-changed': /^GKX_INGEST_STATE_ARTIFACT_NAME_INVALID$/u,
  };
  for (const [scenario, expectedError] of Object.entries(driftErrors)) {
    const changed = runScenario(scenario);
    assert.equal(changed.attempts, 1, scenario);
    assert.notEqual(changed.error, null, scenario);
    assert.match(changed.error.message, expectedError, scenario);
    assert.equal(changed.entries.filter((name) => name.endsWith('.tmp')).length, 1, scenario);
    assert.equal(changed.result_status, null, scenario);
    if (scenario === 'namespace-changed') assert.equal(changed.entries.includes('ingest-foreign.json'), true);
    if (scenario === 'witness-changed') assert.equal(changed.authority, '{}\n');
  }
});
