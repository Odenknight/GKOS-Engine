import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { GraphitiQueryBroker } from '../dist/graphiti-broker.mjs';

const fixture = JSON.parse(readFileSync(new URL('../contracts/graphiti/query-draft1/fixture.json', import.meta.url)));
function context() {
  return { status: structuredClone(fixture.status), decision: 'allow', complete_dependency_scope: true,
    authorized_episodes: new Map(fixture.authorized_episodes.map(({ projection_episode_id, ...source }) => [projection_episode_id, source])) };
}
function input(extra = {}) {
  return { credential: 'fixture-credential', session: 'fixture-session', requestId: fixture.request.request_id,
    query: fixture.request.query, limit: fixture.request.limit, signal: new AbortController().signal, ...extra };
}

test('broker uses the frozen fixture and reauthorizes after provider work', async () => {
  const broker = new GraphitiQueryBroker();
  let current = context(), calls = 0;
  const host = { current: () => current, query: async request => {
    calls++; assert.deepEqual(request, fixture.request);
    assert.ok(Object.isFrozen(request.binding));
    return JSON.stringify(fixture.result);
  } };
  try {
    assert.deepEqual(await broker.search(host, input()), fixture.result);
    host.query = async () => { current.decision = 'deny'; return JSON.stringify(fixture.result); };
    assert.equal(await broker.search(host, input()), null);
    assert.equal(await broker.search(host, input()), null);
    assert.equal(calls, 1);
  } finally { broker.close(); }
});

test('revoked dependencies, stale generations, malformed/oversized results and errors fall back', async () => {
  const broker = new GraphitiQueryBroker();
  try {
    for (const scenario of ['revoked', 'stale', 'oversized', 'malformed', 'error']) {
      const current = context();
      const host = { current: () => current, query: async () => {
        if (scenario === 'revoked') current.authorized_episodes.clear();
        if (scenario === 'stale') current.status.binding.projection_id = 'new-generation';
        if (scenario === 'oversized') return 'x'.repeat(131073);
        if (scenario === 'malformed') return '{}';
        if (scenario === 'error') throw new Error('private-backend-detail');
        return JSON.stringify(fixture.result);
      } };
      assert.equal(await broker.search(host, input()), null);
    }
  } finally { broker.close(); }
});

test('timeout retains physical capacity until an uncooperative provider settles', async () => {
  const broker = new GraphitiQueryBroker();
  let calls = 0;
  const completions = [];
  const host = { current: context, query: () => { calls++; return new Promise(resolve => completions.push(resolve)); } };
  try {
    const results = await Promise.all(['one', 'two', 'three'].map(session => broker.search(host, input({ session, deadlineMs: 30 }))));
    assert.deepEqual(results, [null, null, null]);
    assert.equal(calls, 2);
    completions.forEach(resolve => resolve(JSON.stringify(fixture.result)));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(await broker.search({ current: context, query: async () => JSON.stringify(fixture.result) }, input()), fixture.result);
  } finally { broker.close(); }
});

test('caller cancellation and shutdown abort work and suppress late responses', async () => {
  const broker = new GraphitiQueryBroker();
  const caller = new AbortController();
  let finish, ready;
  const entered = new Promise(resolve => ready = resolve);
  const host = { current: context, query: (_request, signal) => {
    ready(signal); return new Promise(resolve => finish = resolve);
  } };
  const waiting = broker.search(host, input({ signal: caller.signal }));
  const signal = await entered;
  caller.abort();
  assert.equal(await waiting, null);
  assert.equal(signal.aborted, true);
  finish(JSON.stringify(fixture.result));
  broker.close();
  assert.equal(await broker.search(host, input()), null);
});
