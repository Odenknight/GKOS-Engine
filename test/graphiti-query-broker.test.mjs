import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GraphitiQueryBroker } from '../dist/graphiti-adapter.mjs';
const fixture = JSON.parse(readFileSync(new URL('../contracts/graphiti/query-draft1/fixture.json', import.meta.url), 'utf8'));
const context = () => ({status: structuredClone(fixture.status), decision: 'allow', complete_dependency_scope: true,
  authorized_episodes: new Map(fixture.authorized_episodes.map(row => [row.projection_episode_id, row]))});
const invoke = (broker, host, signal) => broker.query(fixture.request.query, 5, fixture.request.request_id, host, signal);
const response = async () => JSON.stringify(fixture.result);

test('broker authorizes twice, retains unverified evidence, and freezes provider request', async () => {
  let checks = 0;
  const broker = new GraphitiQueryBroker();
  const result = await invoke(broker, {authorize: async () => {checks++; return context();}, query: async request => {
    assert.ok(Object.isFrozen(request)); assert.ok(Object.isFrozen(request.binding)); return response();
  }});
  assert.equal(checks, 2); assert.equal(result.mode, 'semantic');
  assert.deepEqual(result.result, fixture.result); assert.equal(broker.outstanding, 0);
});

test('denied preflight never invokes provider; mid-query revocation discloses no facts', async () => {
  let calls = 0, checks = 0;
  const denied = context(); denied.decision = 'deny';
  const broker = new GraphitiQueryBroker();
  assert.deepEqual(await invoke(broker, {authorize: async () => denied, query: async () => {calls++; return response();}}),
    {mode:'native',reason:'unavailable'});
  assert.equal(calls, 0);
  assert.deepEqual(await invoke(broker, {authorize: async () => ++checks === 1 ? context() : denied, query: response}),
    {mode:'native',reason:'revalidation-failed'});
});

test('deadline bounds caller but retains physical capacity until late work settles', async () => {
  const broker = new GraphitiQueryBroker(1, 20);
  let release, signal;
  const host = {authorize: async () => context(), query: async (_r, s) => {
    signal = s; return new Promise(resolve => {release = resolve;});
  }};
  assert.deepEqual(await invoke(broker, host), {mode:'native',reason:'deadline'});
  assert.ok(signal.aborted); assert.equal(broker.outstanding, 1);
  assert.deepEqual(await invoke(broker, host), {mode:'native',reason:'capacity'});
  release(JSON.stringify(fixture.result)); await new Promise(resolve => setImmediate(resolve));
  assert.equal(broker.outstanding, 0);
});

test('caller cancellation suppresses late provider results and scrubs provider failures', async () => {
  const broker = new GraphitiQueryBroker();
  const controller = new AbortController();
  const outcome = invoke(broker, {authorize: async () => context(), query: async () => {
    controller.abort(); throw new Error('private provider secret');
  }}, controller.signal);
  assert.deepEqual(await outcome, {mode:'native',reason:'cancelled'});
  assert.deepEqual(await invoke(broker, {authorize: async () => {throw new Error('private');}, query: response}),
    {mode:'native',reason:'provider-failed'});
});

test('cross-scope response, oversized response and changed configuration are rejected whole', async () => {
  for (const mutation of [r => {r.binding.corpus_id='other';}, r => {r.hits[0].fact='x'.repeat(140000);}]) {
    const result = structuredClone(fixture.result); mutation(result);
    assert.deepEqual(await invoke(new GraphitiQueryBroker(), {authorize:async()=>context(),query:async()=>JSON.stringify(result)}),
      {mode:'native',reason:'revalidation-failed'});
  }
  let checks = 0;
  assert.deepEqual(await invoke(new GraphitiQueryBroker(), {authorize:async()=>{
    const c=context(); if (++checks>1)c.status.binding.configuration_digest='sha256:'+'f'.repeat(64); return c;
  },query:response}), {mode:'native',reason:'revalidation-failed'});
});

// A synchronous provider can delay timers, but cannot turn an overdue result into success.
test('elapsed deadline is checked even when provider blocks timer delivery', async () => {
  const broker = new GraphitiQueryBroker(1, 10);
  const outcome = await invoke(broker, {authorize:async()=>context(),query:async()=>{
    const end=performance.now()+25; while(performance.now()<end) {} return response();
  }});
  assert.deepEqual(outcome,{mode:'native',reason:'deadline'});
  assert.equal(broker.outstanding,0);
});
