import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GRAPHITI_QUERY_CONTRACT_VERSION,
  prepareGraphitiQueryRequest,
  acceptGraphitiQueryResult,
} from "../dist/graphiti-adapter.mjs";

const fixture = JSON.parse(readFileSync(new URL("../contracts/graphiti/query-draft1/fixture.json", import.meta.url), "utf8"));
const digest = "sha256:" + "f".repeat(64);
const clone = value => structuredClone(value);
function context() {
  return {
    status: clone(fixture.status), decision: "allow", complete_dependency_scope: true,
    authorized_episodes: new Map(fixture.authorized_episodes.map(row => [row.projection_episode_id, row])),
  };
}
const accept = (result = clone(fixture.result), current = context(), request = clone(fixture.request)) =>
  acceptGraphitiQueryResult(request, JSON.stringify(result), current);

test("draft fixture roundtrips through the optional entry point with unverified semantic support", () => {
  assert.equal(fixture.request.contract_version, GRAPHITI_QUERY_CONTRACT_VERSION);
  assert.deepEqual(prepareGraphitiQueryRequest("Where is the synthetic relay?", 5, "fixture-request-1", context()), fixture.request);
  assert.deepEqual(accept(), fixture.result);
  const empty = clone(fixture.result); empty.hits = [];
  assert.deepEqual(accept(empty), empty);
});

test("preflight refuses every unavailable or unapproved state before a provider can be called", async () => {
  const cases = [
    c => { c.decision = "deny"; }, c => { c.decision = "indeterminate"; }, c => { c.decision = "error"; },
    c => { c.complete_dependency_scope = false; }, c => { c.status.searchable = false; },
    c => { c.status.mode = "native-only"; }, c => { c.status.mode = "unavailable"; },
    c => { c.status.contract_version = "unknown"; }, c => { c.status.binding = null; },
    c => { c.status.binding.policy_digest = "not-a-digest"; },
  ];
  let calls = 0;
  for (const change of cases) {
    const current = context(); change(current);
    const request = prepareGraphitiQueryRequest("query", 5, "id", current);
    if (request) { calls++; await Promise.resolve(); }
    assert.equal(request, null);
    assert.equal(accept(clone(fixture.result), current), null);
  }
  assert.equal(calls, 0);
});

test("request limits and strict binding digest coordinates fail closed", () => {
  for (const query of ["", " ", "a".repeat(4097), "界".repeat(1366), "bad\u0000query"]) {
    assert.equal(prepareGraphitiQueryRequest(query, 5, "id", context()), null);
  }
  for (const limit of [0, -1, 51, 1.5, NaN, Infinity, "5"]) {
    assert.equal(prepareGraphitiQueryRequest("query", limit, "id", context()), null);
  }
  for (const id of ["", "x".repeat(129)]) assert.equal(prepareGraphitiQueryRequest("query", 5, id, context()), null);
  const current = context();
  const request = prepareGraphitiQueryRequest("query", 50, "id", current);
  current.status.binding.policy_digest = digest;
  assert.notEqual(request.binding.policy_digest, current.status.binding.policy_digest, "request owns its binding snapshot");
});

test("text fields reject unpaired surrogates while preserving Unicode scalar values", () => {
  for (const malformed of ["\ud800", "\udfff", "x\ud800y", "\ud800\ud800"]) {
    assert.equal(prepareGraphitiQueryRequest(malformed, 5, "id", context()), null);
    assert.equal(prepareGraphitiQueryRequest("query", 5, malformed, context()), null);
    for (const key of ["corpus_id", "projection_id"]) {
      const current = context(); current.status.binding[key] = malformed;
      assert.equal(prepareGraphitiQueryRequest("query", 5, "id", current), null);
    }
    const result = clone(fixture.result); result.hits[0].fact = malformed;
    assert.equal(accept(result), null);
    for (const key of ["projection_episode_id", "source_id"]) {
      const result = clone(fixture.result), current = context();
      const citation = result.hits[0].citations[0]; citation[key] = malformed;
      current.authorized_episodes.set(citation.projection_episode_id, citation);
      assert.equal(accept(result, current), null);
    }
  }
  const query = "😀界e\u0301";
  assert.equal(prepareGraphitiQueryRequest(query, 5, "id", context()).query, query);
  const result = clone(fixture.result); result.hits[0].fact = query;
  assert.deepEqual(accept(result), result);
});

test("each generation coordinate must match both request and fresh host context", () => {
  for (const key of Object.keys(fixture.request.binding)) {
    const value = key.endsWith("digest") ? digest : "other";
    const result = clone(fixture.result); result.binding[key] = value;
    assert.equal(accept(result), null, `provider changed ${key}`);
    const current = context(); current.status.binding[key] = value;
    assert.equal(accept(clone(fixture.result), current), null, `host changed ${key}`);
  }
});

test("late authorization, generation and episode revocation invalidate a pending response", async () => {
  for (const change of [
    c => { c.decision = "deny"; },
    c => { c.status.binding.projection_id = "new-generation"; },
    c => { c.status.binding.policy_digest = digest; },
    c => { c.authorized_episodes.clear(); },
  ]) {
    const current = context();
    const request = prepareGraphitiQueryRequest(fixture.request.query, 5, fixture.request.request_id, current);
    const response = await Promise.resolve().then(() => { change(current); return JSON.stringify(fixture.result); });
    assert.equal(acceptGraphitiQueryResult(request, response, current), null);
  }
});

test("concurrent scopes cannot exchange otherwise identical names or episode IDs", async () => {
  const a = context(), b = context();
  b.status.binding.scope_digest = digest;
  const [ra, rb] = await Promise.all([Promise.resolve(prepareGraphitiQueryRequest("query", 5, "a", a)), Promise.resolve(prepareGraphitiQueryRequest("query", 5, "b", b))]);
  const resultA = { ...clone(fixture.result), request_id: "a" };
  const resultB = { ...clone(fixture.result), request_id: "b", binding: clone(b.status.binding) };
  assert.ok(accept(resultA, a, ra)); assert.ok(accept(resultB, b, rb));
  assert.equal(accept(resultB, a, ra), null); assert.equal(accept(resultA, b, rb), null);
});

test("all citations must match canonical identity, source revision and the authorized episode ledger", () => {
  const changes = [
    r => { r.hits[0].citations = []; },
    r => { r.hits[0].citations[0].projection_episode_id = "hidden-episode"; },
    r => { r.hits[0].citations[0].source_id = "another-canonical-source"; },
    r => { r.hits[0].citations[0].source_digest = digest; },
    r => { r.hits[0].citations.push(clone(r.hits[0].citations[0])); },
    r => { r.hits[0].semantic_support = "verified"; },
    r => { r.hits[0].citations[0].verified = true; },
    r => { r.hits.push({ ...clone(r.hits[0]), citations: [] }); },
  ];
  for (const change of changes) { const result = clone(fixture.result); change(result); assert.equal(accept(result), null); }
});

test("malformed, extended, oversized and cross-request responses return no partial content", () => {
  for (const json of ["{", "null", "[]", "0", " ".repeat(131073), '"' + "界".repeat(50000) + '"']) {
    assert.equal(acceptGraphitiQueryResult(fixture.request, json, context()), null);
  }
  for (const change of [
    r => { r.contract_version = "future"; }, r => { r.request_id = "replayed-request"; },
    r => { r.debug = "private provider diagnostic"; }, r => { r.hits[0].fact = "界".repeat(1366); },
    r => { r.hits = Array.from({ length: 6 }, () => clone(r.hits[0])); },
    r => { r.hits[0].citations = Array.from({ length: 17 }, () => clone(r.hits[0].citations[0])); },
  ]) { const result = clone(fixture.result); change(result); assert.equal(accept(result), null); }
  const request = clone(fixture.request); request.limit = 100;
  assert.equal(accept(clone(fixture.result), context(), request), null);
});
