import assert from 'node:assert/strict';
import test from 'node:test';
import { parseManagedMocQualificationArgs, qualificationStatus, runManagedMocQualification, verifyObservationSource } from '../scripts/qualify-managed-moc.mjs';

test('source drift retains original bindings and completed observation rows', () => {
  const before = { commit: 'before' }, after = { commit: 'after' }, rows = [{ notes: 100 }];
  assert.doesNotThrow(() => verifyObservationSource(before, { ...before }, rows));
  assert.throws(() => verifyObservationSource(before, after, rows), error => {
    assert.equal(error.sourceBefore, before);
    assert.equal(error.sourceAfter, after);
    assert.equal(error.partialRows, rows);
    return /changed during observation/.test(error.message);
  });
});

test('managed MOC qualification arguments are bounded and explicit', () => {
  assert.deepEqual(parseManagedMocQualificationArgs(['--tiers', '10,20', '--samples', '2', '--soak-seconds', '3', '--restart-every', '1', '--timeout-ms', '50']).tiers, [10, 20]);
  assert.throws(() => parseManagedMocQualificationArgs(['--tiers', '10,10']), /Invalid tiers/);
  assert.throws(() => parseManagedMocQualificationArgs(['--soak-seconds', '-1']), /Invalid soak duration/);
  assert.throws(() => parseManagedMocQualificationArgs(['--tiers', '50001']), /Invalid tier/);
  assert.throws(() => parseManagedMocQualificationArgs(['--unknown', '1']), /Unknown argument/);
});

test('short runs cannot claim 24-hour soak evidence', () => {
  assert.equal(qualificationStatus(0, 3, 3), 'OBSERVED_SCALE_SAMPLES');
  assert.equal(qualificationStatus(60, 3, 3), 'OBSERVED_SHORT_SOAK');
  assert.equal(qualificationStatus(86400, 3, 3, 86399), 'OBSERVED_SHORT_SOAK');
  assert.equal(qualificationStatus(86400, 3, 3, 86400), 'OBSERVED_24H_SYNTHETIC');
  assert.equal(qualificationStatus(86400, 2, 3), 'FAIL');
});

test('small managed MOC smoke observes watcher convergence and restart recovery', { timeout: 30000 }, async () => {
  const receipt = await runManagedMocQualification({ tiers: [2], samples: 2, soakSeconds: 0, restartEvery: 1, timeoutMs: 10000, output: null });
  assert.equal(receipt.release_qualified, false);
  assert.equal(receipt.rows[0].status, 'OBSERVED_SCALE_SAMPLES');
  assert.equal(receipt.rows[0].completed_samples, 2);
  assert.equal(receipt.rows[0].restarts, 1);
  assert.ok(receipt.rows[0].event_to_convergence_ms.retained_first_samples[0] > 0);
  assert.ok(receipt.rows[0].source_scanning.source_reads >= 4);
  assert.equal(receipt.rows[0].source_scanning.parser_qualified, false);
  assert.equal(receipt.rows[0].final_runtime_status.errorCode, null);
});
