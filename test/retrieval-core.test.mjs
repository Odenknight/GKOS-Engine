import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assessRetrievalConfidence,
  chunkMarkdown,
  createRerankProvider,
  createVectorProvider,
  isValidRetrievalSourcePath,
  lexicalQueryTerms,
  lexicalQueryClauses,
  lexicalCitationSpans,
  lexicalScanMatches,
  lexicalSignal,
  matchesRetrievalFilters,
  maximalMarginalRelevance,
  reciprocalRankFusion,
  RETRIEVAL_PARENT_EXPANSION_MAX_CHILD_TOKENS,
  RETRIEVAL_PROJECTION_SCHEMA_VERSION,
  retrievalCanonicalDigest,
  retrievalSha256,
  stableJson,
} from "../dist/retrieval.mjs";
import { isValidGkxTimestamp } from "../dist/gkos-engine.mjs";

const CONTRACT = new URL("../contracts/retrieval/gkos-retrieval-1.0.0-draft.1/", import.meta.url);

test("cross-language chunk, RRF, duplicate-collapse, and MMR fixture is exact", async () => {
  const fixture = JSON.parse(await readFile(new URL("conformance-fixture.json", CONTRACT), "utf8"));
  assert.deepEqual(chunkMarkdown(fixture.input, fixture.options), fixture.expected_chunks);
  const fused = reciprocalRankFusion(fixture.rrf.lexical, fixture.rrf.semantic, fixture.rrf.k);
  assert.deepEqual(fused, fixture.rrf.expected);
  assert.deepEqual(maximalMarginalRelevance(fused, fixture.mmr.limit, fixture.mmr.lambda), fixture.mmr.expected);
  const negative = maximalMarginalRelevance(fixture.mmr_negative_cosine.input, fixture.mmr_negative_cosine.limit, fixture.mmr_negative_cosine.lambda);
  assert.deepEqual(negative.map((item) => item.chunk_id), fixture.mmr_negative_cosine.expected_chunk_ids);
  assert.deepEqual(negative.map((item) => item.mmr_score), fixture.mmr_negative_cosine.expected_mmr_scores);
  const rerankRelevance = new Map(fixture.rerank_mmr.reranker_ranks.map((item) => [item.chunk_id, 1 / item.rank]));
  const reranked = maximalMarginalRelevance(fixture.rerank_mmr.input, fixture.rerank_mmr.limit, fixture.rerank_mmr.lambda, rerankRelevance);
  assert.deepEqual(reranked.map((item) => item.chunk_id), fixture.rerank_mmr.expected_chunk_ids);
  assert.deepEqual(reranked.map((item) => item.mmr_score), fixture.rerank_mmr.expected_mmr_scores);
  assert.equal(RETRIEVAL_PARENT_EXPANSION_MAX_CHILD_TOKENS, fixture.parent_expansion.default_max_child_tokens);
  assert.equal(RETRIEVAL_PROJECTION_SCHEMA_VERSION, fixture.lexical_backends.projection_schema_version);
  for (const item of fixture.lexical_backends.differential_queries) {
    const actual = fixture.lexical_backends.differential_rows
      .filter((row) => lexicalScanMatches(row, item.query))
      .map((row) => ({ chunk_id: row.chunk_id, score: lexicalSignal(row, item.query) }))
      .sort((left, right) => right.score - left.score || (left.chunk_id < right.chunk_id ? -1 : left.chunk_id > right.chunk_id ? 1 : 0));
    assert.deepEqual(actual, item.expected, item.query);
  }
  for (const query of fixture.lexical_backends.rejected_queries) {
    assert.throws(() => lexicalQueryClauses(query), /RETRIEVAL_QUERY_LEXICAL_INVALID/u, query);
    assert.throws(() => lexicalScanMatches(fixture.lexical_backends.differential_rows[0], query), /RETRIEVAL_QUERY_LEXICAL_INVALID/u, query);
  }
  assert.deepEqual(fixture.parent_expansion.examples.map((item) => item.child_token_count < RETRIEVAL_PARENT_EXPANSION_MAX_CHILD_TOKENS), fixture.parent_expansion.examples.map((item) => item.expand));
  for (const item of fixture.path_glob_filters) {
    const [chunk] = chunkMarkdown({
      source_id: "018f0000-0000-7000-8000-000000000199",
      source_path: item.path,
      text: "glob fixture",
      metadata: { sensitivity: "public" },
    });
    assert.equal(matchesRetrievalFilters(chunk, { path_include: [item.glob] }, { vault_id: "fixture" }), item.matches, `${item.glob} against ${item.path}`);
  }
  for (const item of fixture.citation_normalization) {
    assert.deepEqual(lexicalCitationSpans(item.source_text, item.query), item.expected_spans, item.id);
  }
  assert.deepEqual(
    assessRetrievalConfidence(
      fixture.confidence_zero_signal.scores,
      fixture.confidence_zero_signal.stages,
      fixture.confidence_zero_signal.eligible_count,
    ),
    fixture.confidence_zero_signal.expected,
  );
  assert.deepEqual(lexicalQueryTerms(fixture.lexical.query), fixture.lexical.expected_terms);
  assert.equal(lexicalSignal(fixture.lexical.fields, fixture.lexical.query), fixture.lexical.expected_score);
});

test("canonical JSON, portable path, and timestamp filter fixtures are exact", async () => {
  const fixture = JSON.parse(await readFile(new URL("canonical-fixture.json", CONTRACT), "utf8"));
  const values = new Map([
    ["numbers", { one: 1.0, negative_zero: -0, small: 1e-7, threshold: 1e-6, safe_max: 9007199254740991 }],
    ["utf16-key-order", { "\uE000": "bmp-private", "😀": "non-bmp", a: "ascii" }],
    ["unicode-values-no-normalization", { combining: "e\u0301", precomposed: "é" }],
  ]);
  for (const item of fixture.cases) {
    const canonical = stableJson(values.get(item.id));
    assert.equal(canonical, item.canonical_json, item.id);
    assert.equal(retrievalSha256(canonical), item.sha256, item.id);
  }
  for (const value of [9007199254740992, -9007199254740992, 1e21, Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => stableJson(value));
  for (const value of ["\ud800", "\udfff", { "\ud800": "key" }, { "\udfff": "key" }]) {
    assert.throws(() => stableJson(value), /unpaired UTF-16/u);
    assert.throws(() => retrievalCanonicalDigest(value), /unpaired UTF-16/u);
  }
  const astral = { "😀": "valid pair 😀" };
  assert.equal(stableJson(astral), '{"😀":"valid pair 😀"}');
  assert.equal(retrievalCanonicalDigest(astral), retrievalSha256('{"😀":"valid pair 😀"}'));
  const cyclic = {};
  cyclic.self = cyclic;
  const accessor = {};
  Object.defineProperty(accessor, "value", { enumerable: true, get: () => "hidden" });
  const nonEnumerable = {};
  Object.defineProperty(nonEnumerable, "value", { enumerable: false, value: "hidden" });
  for (const value of [Array(1), [, "sparse"], { omitted: undefined }, accessor, nonEnumerable, new Date(0), cyclic]) {
    assert.throws(() => stableJson(value));
    assert.throws(() => retrievalCanonicalDigest(value));
  }
  assert.notEqual(stableJson([null]), stableJson([]));
  assert.notEqual(stableJson({ omitted: null }), stableJson({}));
  for (const item of fixture.portable_source_paths) assert.equal(isValidRetrievalSourcePath(item.path), item.accepted, item.path);
  for (const item of fixture.timestamp_filters) assert.equal(isValidGkxTimestamp(item.value), item.accepted, item.value);
});

test("a one-section edit preserves every unaffected stable chunk identity", () => {
  const base = {
    source_id: "018f0000-0000-7000-8000-000000000120",
    source_path: "notes/draft..md",
    text: "# One\nUnchanged.\n\n## Two\nBefore.\n\n## Three\nAlso unchanged.\n",
    metadata: { sensitivity: "public" },
  };
  const before = chunkMarkdown(base);
  const after = chunkMarkdown({ ...base, text: base.text.replace("Before.", "After.") });
  assert.equal(before.length, 3);
  assert.equal(after.length, 3);
  assert.equal(before[0].chunk_id, after[0].chunk_id);
  assert.notEqual(before[1].chunk_id, after[1].chunk_id);
  assert.equal(before[2].chunk_id, after[2].chunk_id);
  assert.equal(before[1].structural_position, after[1].structural_position);
});

test("typed filters fail closed for invalid sensitivity and enforce vault/date/quality", () => {
  const [chunk] = chunkMarkdown({
    source_id: "018f0000-0000-7000-8000-000000000121",
    source_path: "notes/filter.md",
    text: "# Filter\nBody",
    metadata: { sensitivity: "public", quality: 0.8, authored_at: "2026-08-20T08:30:00-04:00", tags: ["alpha", "beta"] },
  });
  // The chunker/publication boundary rejects this malformed envelope; mutate
  // only after construction to prove the filter itself also fails closed when
  // handed an untrusted runtime object.
  chunk.metadata.sensitivity = "not-a-level";
  assert.equal(matchesRetrievalFilters(chunk, { sensitivity_ceiling: "public" }, { vault_id: "v" }), false);
  assert.equal(matchesRetrievalFilters(chunk, { vault: "other" }, { vault_id: "v" }), false);
  assert.equal(matchesRetrievalFilters(chunk, { tags_all: ["alpha", "beta"], minimum_quality: 0.7, authored_from: "2026-08-20T12:00Z" }, { vault_id: "v" }), true);
  assert.throws(() => matchesRetrievalFilters(chunk, { authored_from: "2026-08-20T12:00" }, { vault_id: "v" }), /timestamp/);
  assert.throws(() => matchesRetrievalFilters(chunk, { minimum_quality: Number.NaN }, { vault_id: "v" }), /minimum_quality/);
});

test("malformed authored metadata is ignored until a date filter is active", () => {
  const [chunk] = chunkMarkdown({
    source_id: "018f0000-0000-7000-8000-000000000228",
    source_path: "policy/malformed-authored.md",
    text: "# Filter\nBody",
    metadata: { sensitivity: "public", authored_at: "not-a-timestamp", tags: ["alpha"] },
  });
  assert.equal(matchesRetrievalFilters(chunk, { path_include: ["policy/**"], tags_any: ["alpha"] }, { vault_id: "v" }), true);
  assert.equal(matchesRetrievalFilters(chunk, { authored_from: "2026-08-20T00:00Z" }, { vault_id: "v" }), false);
  assert.equal(matchesRetrievalFilters(chunk, { authored_to: "2026-08-21T00:00Z" }, { vault_id: "v" }), false);
});

test("provider factory requires trusted provenance and strictly validates local responses", async () => {
  const config = {
    kind: "local_onnx",
    configuration_provenance: "trusted_operator",
    provider_id: "fixture-local",
    model_id: "fixture-model",
    dimensions: 2,
    model_path: "fixture-model.onnx",
    timeout_ms: 100,
  };
  assert.throws(() => createVectorProvider({ ...config, configuration_provenance: "vault" }, {}), /UNTRUSTED/);
  assert.throws(() => createVectorProvider({ ...config, kind: "surprise" }, {}), /KIND_INVALID/);
  assert.throws(() => createVectorProvider({ ...config, timeout_ms: 0 }, {}), /timeout/i);
  const provider = createVectorProvider(config, {
    local_embedding_executor: async ({ request_id, model_id, dimensions, texts }) => ({ request_id, model_id, dimensions, vectors: texts.map(() => [1, 0]) }),
  });
  assert.deepEqual([...(await provider.embed(["x"], { request_id: "r" }))[0]], [1, 0]);
  const bad = createVectorProvider(config, {
    local_embedding_executor: async ({ model_id, dimensions }) => ({ request_id: "wrong", model_id, dimensions, vectors: [[1, 0]] }),
  });
  await assert.rejects(bad.embed(["x"], { request_id: "r" }), /CORRELATION/);
  await assert.rejects(provider.embed(["x"], { request_id: "r".repeat(300) }), /256 UTF-8 bytes/);
});

test("OpenAI-compatible embedding accepts absent correlation echo but rejects malformed indexes", async () => {
  const config = {
    kind: "openai_compatible",
    configuration_provenance: "trusted_operator",
    provider_id: "configured-endpoint",
    model_id: "configured-model",
    dimensions: 2,
    endpoint: "https://operator.example/v1/embeddings",
  };
  const headers = new Headers();
  const ok = createVectorProvider(config, { fetch: async () => new Response(JSON.stringify({ model: "configured-model", data: [{ index: 0, embedding: [0.5, 0.25] }] }), { status: 200, headers }) });
  assert.deepEqual([...(await ok.embed(["x"], { request_id: "request" }))[0]], [0.5, 0.25]);
  const bad = createVectorProvider(config, { fetch: async () => new Response(JSON.stringify({ model: "configured-model", data: [{ index: 1, embedding: [0.5, 0.25] }] }), { status: 200 }) });
  await assert.rejects(bad.embed(["x"], { request_id: "request" }), /INDEX_INVALID/);
});

test("OpenAI-compatible adapters enforce their own deadline when injected fetch ignores abort", async () => {
  const fetch = () => new Promise(() => {});
  const common = {
    kind: "openai_compatible",
    configuration_provenance: "trusted_operator",
    provider_id: "configured-endpoint",
    model_id: "configured-model",
    endpoint: "https://operator.example/inference",
    timeout_ms: 10,
  };
  const vector = createVectorProvider({ ...common, dimensions: 2 }, { fetch });
  await assert.rejects(vector.embed(["x"]), /OPENAI_COMPATIBLE_EMBEDDING_TIMEOUT/);
  const reranker = createRerankProvider(common, { fetch });
  await assert.rejects(reranker.rerank("x", [{ chunk_id: "chunk", text: "x" }]), /OPENAI_COMPATIBLE_RERANK_TIMEOUT/);
});
