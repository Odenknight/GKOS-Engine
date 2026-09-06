import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeterministicMocAssistance, buildMocAssistance, ManagedMocCoordinator, planManagedMocBatch } from '../dist/navigation-effects.mjs';
import { buildVaultNavigationConfig } from '../dist/navigation.mjs';
import { sha256Bytes } from '../dist/gkos-engine.mjs';

const note = (uid, path, content = '', extra = {}) => ({ uid, path, content, title: uid, tags: [], sensitivity: 'public', ...extra });
const input = { notes: [note('a', 'a.md', '#science [[b]]'), note('b', 'b.md', '#science')], allowedSensitivities: ['public'] };

test('deterministic assistance is stable under corpus reordering and binds exact bytes', async () => {
  const first = await buildDeterministicMocAssistance(input);
  assert.deepEqual(first, await buildDeterministicMocAssistance({ ...input, notes: [...input.notes].reverse() }));
  assert.deepEqual(first.proposal.links, [{ from: 'a', to: 'b' }]);
  assert.deepEqual(first.proposal.sections, [{ title: 'science', uids: ['a', 'b'] }]);
  assert.equal(first.sourceContentEffect, 'none');
  const lf = await buildDeterministicMocAssistance({ ...input, notes: [note('a', 'a.md', 'x\ny')] });
  const crlf = await buildDeterministicMocAssistance({ ...input, notes: [note('a', 'a.md', 'x\r\ny')] });
  assert.notEqual(lf.snapshotDigest, crlf.snapshotDigest);
});

test('excludes archives, state and fail-closed sensitivity before model access', async () => {
  let request;
  const result = await buildMocAssistance({ ...input, notes: [...input.notes,
    note('secret', 'secret.md', 'SECRET', { sensitivity: 'secret' }),
    note('unlabeled', 'unlabeled.md', 'SECRET', { sensitivity: '' }),
    note('archive', '_archive/moc-runs/old.md', 'SECRET'), note('state', '.gkx/state.md', 'SECRET'),
  ] }, { enabled: true, allowProviderAccess: true, provider: { async suggest(r) { request = r; return { tags: [], links: [], sections: [] }; } } });
  assert.equal(result.status, 'ready');
  assert.equal(JSON.stringify(request).includes('SECRET'), false);
  assert.equal(result.advisory.markdown.includes('[[b|b]]'), true);
});

test('rejects duplicate identities and collision paths; never resolves ambiguous basename', async () => {
  await assert.rejects(buildDeterministicMocAssistance({ ...input, notes: [input.notes[0], input.notes[0]] }));
  await assert.rejects(buildDeterministicMocAssistance({ ...input, notes: [note('a', 'a.md'), note('b', 'A.md')] }));
  const result = await buildDeterministicMocAssistance({ ...input, notes: [note('a', 'a.md', '[[b]]'), note('b', 'one/b.md'), note('c', 'two/b.md')] });
  assert.deepEqual(result.proposal.links, []);
});

test('provider is optional and cannot overwrite deterministic output', async () => {
  let calls = 0;
  const provider = { async suggest() { calls++; return { tags: [], links: [], sections: [{ title: 'Ideas', uids: ['b'] }] }; } };
  for (const opts of [{}, { enabled: true }, { allowProviderAccess: true }]) {
    assert.equal((await buildMocAssistance(input, { provider, ...opts })).status, 'disabled');
  }
  assert.equal(calls, 0);
  const result = await buildMocAssistance(input, { provider, enabled: true, allowProviderAccess: true });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.deterministic, await buildDeterministicMocAssistance(input));
  assert.equal(result.advisory.requiresReview, true);
  assert.match(result.advisory.markdown, /Other notes/);
});

test('invalid, unauthorized and oversized model output falls back without leaking errors', async () => {
  for (const response of [null, { tags: [], links: [{ from: 'a', to: 'secret' }], sections: [] },
    { tags: [], links: [], sections: [], sensitivity: 'public' },
    { tags: [], links: [], sections: [{ title: 'x'.repeat(70000), uids: [] }] }]) {
    const result = await buildMocAssistance(input, { enabled: true, allowProviderAccess: true, provider: { async suggest() { return response; } } });
    assert.equal(result.status, 'fallback');
    assert.deepEqual(result.deterministic, await buildDeterministicMocAssistance(input));
  }
});

test('timeout aborts provider and bounded request avoids sending any content', async () => {
  let signal, calls = 0;
  const provider = { suggest(_r, s) { calls++; signal = s; return new Promise(() => {}); } };
  assert.equal((await buildMocAssistance(input, { enabled: true, allowProviderAccess: true, provider, maxRequestBytes: 1 })).status, 'fallback');
  assert.equal(calls, 0);
  assert.equal((await buildMocAssistance(input, { enabled: true, allowProviderAccess: true, provider, timeoutMs: 5 })).status, 'fallback');
  assert.equal(signal.aborted, true);
});

function fixture(options) {
  let stored = null;
  const runs = [];
  const host = { async loadIntent() { return stored; }, async saveIntent(value) { stored = structuredClone(value); }, async recover() { return true; }, async reconcile(value) { runs.push(value); } };
  return { host, runs, get stored() { return stored; }, coordinator: new ManagedMocCoordinator(host, options) };
}

test('startup reconciles before readiness, coalesces events and respects maximum delay', async () => {
  const f = fixture();
  assert.equal(await f.coordinator.start(0), true);
  assert.equal(f.runs[0].full, true);
  await f.coordinator.notify('a.md', 100);
  await f.coordinator.notify('a.md', 500);
  await f.coordinator.tick(1000);
  assert.equal(f.runs.length, 1);
  await f.coordinator.tick(1250);
  assert.deepEqual(f.runs[1].paths, ['a.md']);
  for (let t = 2000; t <= 5000; t += 500) await f.coordinator.notify('b.md', t);
  await f.coordinator.tick(5000);
  assert.deepEqual(f.runs[2].paths, ['b.md']);
});

test('inflight events remain durable and failed work retries', async () => {
  const f = fixture(); await f.coordinator.start(0);
  let release;
  f.host.reconcile = async () => new Promise(resolve => { release = resolve; });
  await f.coordinator.notify('a.md', 1);
  const running = f.coordinator.tick(1000);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await f.coordinator.notify('b.md', 1001);
  release(); await running;
  assert.deepEqual(f.stored.paths, ['a.md', 'b.md']);
  f.host.reconcile = async () => { throw new Error('disk full'); };
  await assert.rejects(f.coordinator.tick(2000));
  assert.ok(f.stored);
  f.host.reconcile = async () => {};
  await f.coordinator.tick(3000);
  assert.equal(f.stored, null);
});

test('overflow persists full intent, ignored paths do not enqueue, recovery blocks', async () => {
  const f = fixture({ debounceMs: 750, maxDelayMs: 3000, periodicMs: 300000, maxPaths: 1 });
  await f.coordinator.start(0);
  await f.coordinator.notify('_archive/moc-runs/x.md', 1);
  await f.coordinator.notify('.gkx/x.md', 1);
  assert.equal(f.stored, null);
  await f.coordinator.notify('a.md', 1); await f.coordinator.notify('b.md', 2);
  assert.equal(f.stored.full, true);
  assert.deepEqual(f.stored.paths, []);
  const restarted = new ManagedMocCoordinator(f.host);
  f.host.recover = async () => false;
  assert.equal(await restarted.start(3), false);
  await restarted.tick(10000, true);
  assert.equal(f.runs.length, 1);
});

test('periodic reconciliation and shutdown preserve pending work', async () => {
  const f = fixture(); await f.coordinator.start(0);
  await f.coordinator.tick(300750);
  await f.coordinator.tick(301500);
  assert.equal(f.runs.length, 2);
  await f.coordinator.notify('pending.md', 302000);
  await f.coordinator.stop();
  assert.ok(f.stored);
  await assert.rejects(f.coordinator.notify('new.md', 302001));
  const restarted = new ManagedMocCoordinator(f.host);
  assert.equal(await restarted.start(303000), true);
  assert.equal(f.stored, null);
});

test('batch plans real managed MOCs with stable digests, no-ops and adoption protection', async () => {
  const policyRef = { id: 'policy', version: '1', digest: `sha256:${'b'.repeat(64)}` };
  const config = await buildVaultNavigationConfig({ configId: '01990ac0-0000-7000-8000-000000000001', version: 1, vaultId: 'vault', promotedMocNames: [], createdAt: '2026-09-05T12:00:00Z', createdBy: 'owner', policy: policyRef });
  const authority = { actor: { actorId: 'owner', actorType: 'human' }, grantId: 'moc', allowedRoot: 'topics', capability: 'moc:apply', sensitivityCeiling: 'public', policyRef };
  const ownership = { targetPath: 'topics/index.md', ownership: 'fully-managed', creationAuthorized: true };
  const request = { snapshot: { vaultId: 'vault', sources: [{ relativePath: 'topics/a.md', content: 'A', sensitivity: 'public' }, { relativePath: 'topics/b.md', content: 'B', sensitivity: 'public' }] }, config, targets: [{ path: 'topics/index.md', currentBytes: null, ownership, authority }], allowedSensitivities: ['public'], policyRef, authorityEvaluatedAt: '2026-09-05T12:00:00Z', archiveDate: '2026-09-05', runId: 'test-run' };
  const result = await planManagedMocBatch(request);
  assert.equal(result.results[0].status, 'planned');
  assert.match(result.results[0].proposedBytes, /\[\[topics\/a\|a\]\]/);
  assert.deepEqual(result, await planManagedMocBatch({ ...request, snapshot: { ...request.snapshot, sources: [...request.snapshot.sources].reverse() } }));
  const bytes = result.results[0].proposedBytes;
  const noOp = await planManagedMocBatch({ ...request, targets: [{ ...request.targets[0], currentBytes: bytes, ownership: { ...ownership, adoptedDigest: await sha256Bytes(bytes) } }] });
  assert.equal(noOp.results[0].status, 'no-op');
  const denied = await planManagedMocBatch({ ...request, targets: [{ ...request.targets[0], currentBytes: 'Human note', ownership: { ...ownership, ownership: 'unmanaged' } }] });
  assert.equal(denied.results[0].status, 'denied');
});

test('startup failure never advertises write readiness', async () => {
  const f = fixture();
  f.host.reconcile = async () => { assert.equal(f.coordinator.status.ready, false); throw new Error('conflict'); };
  await assert.rejects(f.coordinator.start(0));
  assert.equal(f.coordinator.status.ready, false);
  assert.ok(f.stored);
});

test('corrupt durable intent blocks startup without overwriting evidence', async () => {
  const f = fixture();
  await f.host.saveIntent({ revision: 1, full: false, paths: ['../escape'], firstAt: 0, lastAt: 1 });
  await assert.rejects(f.coordinator.start(2), /CORRUPT_RECONCILIATION_INTENT/);
  assert.deepEqual(f.stored.paths, ['../escape']);
  assert.equal(f.coordinator.status.ready, false);
});

test('concurrent admission coalesces into bounded durable batches', async () => {
  const f = fixture({ debounceMs: 750, maxDelayMs: 3000, periodicMs: 300000, maxPaths: 8 });
  await f.coordinator.start(0);
  let writes = 0;
  const save = f.host.saveIntent;
  f.host.saveIntent = async value => { writes++; await save(value); };
  await Promise.all(Array.from({ length: 10000 }, (_, i) => f.coordinator.notify(`n${i}.md`, 1)));
  assert.equal(writes, 1);
  assert.equal(f.stored.full, true);
  assert.deepEqual(f.stored.paths, []);
});

test('coordinator requires complete validated limits and detaches caller configuration', async () => {
  for (const options of [{}, { debounceMs: 1 }, null]) assert.throws(() => new ManagedMocCoordinator({}, options), /INVALID_COORDINATOR_OPTIONS/);
  const options = { debounceMs: 750, maxDelayMs: 3000, periodicMs: 300000, maxPaths: 1 };
  const f = fixture(options);
  await f.coordinator.start(0);
  options.maxPaths = Infinity;
  await Promise.all([f.coordinator.notify('one.md', 1), f.coordinator.notify('two.md', 1)]);
  assert.equal(f.stored.full, true);
  assert.deepEqual(f.stored.paths, []);
});

test('deterministic extraction ignores fenced examples, inline code, comments and frontmatter', async () => {
  const result = await buildDeterministicMocAssistance({ ...input, notes: [note('a', 'a.md', '---\ndescription: "#frontmatter"\n---\n# Heading\n#real\n```md\n#fenced [[b]]\n```\n`#inline`\n<!-- #comment -->'), input.notes[1]] });
  assert.deepEqual(result.proposal.tags.find(r => r.uid === 'a').tags, ['real']);
  assert.deepEqual(result.proposal.links, []);
});
