import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { watcherArtifactCoordinate } from '../dist/watcher-contracts.mjs';

test('artifact coordinates reject hostile digest properties without executing them', () => {
  let calls = 0;
  const accessor = Object.defineProperty({}, 'observation_digest', {
    enumerable: true, get() { calls++; return 'sha256:' + 'a'.repeat(64); },
  });
  const proxy = new Proxy({}, { get() { calls++; return 'sha256:' + 'a'.repeat(64); } });
  for (const value of [accessor, proxy]) assert.throws(() => watcherArtifactCoordinate('observation', value));
  assert.equal(calls, 0);
});

test('artifact coordinate bytes retain sorted JSON and the original digest identity', () => {
  const digest = 'sha256:' + 'a'.repeat(64);
  const input = { z: [1, { b: true, a: null }], observation_digest: digest };
  const bytes = JSON.stringify({ observation_digest: digest, z: [1, { a: null, b: true }] }, null, 2) + '\n';
  const result = watcherArtifactCoordinate('observation', input);
  assert.deepEqual(result, { file: 'watcher-observation-' + 'a'.repeat(64) + '.json',
    byte_size: Buffer.byteLength(bytes), raw_sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), bytes });
  assert.deepEqual(Object.keys(input), ['z', 'observation_digest']);
});
