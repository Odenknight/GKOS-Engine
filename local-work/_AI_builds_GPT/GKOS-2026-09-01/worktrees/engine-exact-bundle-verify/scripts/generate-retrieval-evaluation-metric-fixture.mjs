import { readFileSync, writeFileSync } from "node:fs";
import * as retrieval from "../dist/retrieval.mjs";
import * as retrievalHost from "../dist/retrieval-host.mjs";
import * as evaluationHost from "../dist/retrieval-evaluation-host.mjs";

const CONTRACT_VERSION = "gkos-retrieval-evaluation-metric-computation-fixture/1.0.0-draft.1";
const OUTPUT = new URL("../contracts/retrieval/gkos-retrieval-evaluation-1.0.0-draft.1/metric-computation-fixture.json", import.meta.url);
const PHASE4_PACK = new URL("../contracts/retrieval/gkos-retrieval-evaluation-1.0.0-draft.1/", import.meta.url);
const PHASE2 = JSON.parse(readFileSync(new URL(
  "../contracts/retrieval/gkos-retrieval-1.0.0-draft.2/conformance-fixture.json",
  import.meta.url,
), "utf8"));

function clone(value) {
  return structuredClone(value);
}

function reseal(record, digestField) {
  const material = { ...record };
  delete material[digestField];
  return { ...material, [digestField]: retrieval.retrievalCanonicalDigest(material) };
}

function sealQuery(material) {
  return { ...material, query_digest: retrieval.retrievalCanonicalDigest(material) };
}

function sealOracle(material) {
  return { ...material, oracle_digest: retrieval.retrievalCanonicalDigest(material) };
}

function provenanceFor(chunk, asOf = null) {
  const reasonCodes = [
    "ASSERTION_TIME_UNAVAILABLE",
    "LEDGER_BINDING_UNAVAILABLE",
    "LINEAGE_ID_UNAVAILABLE",
    chunk.supersedes.length || chunk.superseded_by.length ? "LINEAGE_PARTICIPANT" : "LINEAGE_NEUTRAL",
    "LINEAGE_VIEW_AUTHORIZED_ONLY",
    ...(asOf === null ? [] : ["TEMPORAL_SELECTION_AS_OF"]),
    "VALIDITY_UNKNOWN",
  ].sort();
  const material = {
    contract_version: "gkos-retrieval-provenance/1.0.0-draft.1",
    source_id: chunk.source_id,
    source_path: chunk.source_path,
    source_digest: chunk.source_digest,
    assertion_time: null,
    assertion_origin: null,
    valid_from: null,
    valid_to: null,
    validity_origin: "unknown",
    lineage_id: null,
    supersedes: [...chunk.supersedes],
    superseded_by: [...chunk.superseded_by],
    temporal_state: "unknown",
    ledger_binding_verified: false,
    lineage_neutral: chunk.supersedes.length === 0 && chunk.superseded_by.length === 0,
    reason_codes: reasonCodes,
    assertion: { chunk_id: chunk.chunk_id, content_digest: chunk.content_digest },
    interval_semantics: "[valid_from,valid_to)",
  };
  return { ...material, provenance_digest: retrieval.retrievalCanonicalDigest(material) };
}

function citationFor(chunk, matchedSpans = []) {
  return {
    source_id: chunk.source_id,
    path: chunk.source_path,
    source_digest: chunk.source_digest,
    heading_path: [...chunk.heading_path],
    start_byte: chunk.start_byte,
    end_byte: chunk.end_byte,
    start_line: chunk.start_line,
    end_line: chunk.end_line,
    verified: true,
    stale: false,
    matched_spans: matchedSpans,
  };
}

function resultFor(query, chunks, fixtureName, parentContext = null) {
  const projectionDigest = retrieval.retrievalCanonicalDigest({ fixture: fixtureName });
  const claimedSpans = new Set();
  const acceptedIntervals = [];
  const hits = [];
  const stages = {
    lexical: { kind: "sqlite_fts5", state: "active", reason_codes: [] },
    vector: { kind: "none", state: "disabled", reason_codes: ["VECTOR_DISABLED"] },
    reranker: { kind: "none", state: "skipped", reason_codes: ["RERANKER_NOT_CONFIGURED"] },
  };
  for (const [index, chunk] of chunks.entries()) {
    const matchedSpans = retrieval.lexicalCitationSpans(chunk.text, query).map((span) => ({
      start_byte: chunk.start_byte + span.start_byte,
      end_byte: chunk.start_byte + span.end_byte,
      text: span.text,
    }));
    const evidence = evaluationHost.gkxRetrievalDeduplicateOverlapEvidence(
      citationFor(chunk, matchedSpans),
      chunk,
      claimedSpans,
      acceptedIntervals,
    );
    if (!evidence) continue;
    hits.push({
      chunk,
      citation: evidence.citation,
      provenance: provenanceFor(chunk),
      stage_scores: {
        lexical_score: 1 / (index + 1),
        semantic_score: null,
        fusion_score: 1 / (61 + index),
        reranker_score: null,
        mmr_score: null,
        lexical_rank: index + 1,
        semantic_rank: null,
        fused_rank: index + 1,
        reranker_rank: null,
        final_rank: hits.length + 1,
      },
      ...(index === chunks.length - 1 && parentContext ? { parent_context: parentContext } : {}),
    });
    for (const key of evidence.span_keys) claimedSpans.add(key);
    acceptedIntervals.push({ source_id: chunk.source_id, start_byte: chunk.start_byte, end_byte: chunk.end_byte });
  }
  return {
    contract_version: "gkos-retrieval/1.0.0-draft.2",
    query_digest: retrieval.retrievalCanonicalDigest({ as_of: null, query }),
    projection_id: `retrieval:${projectionDigest.slice(7, 31)}`,
    projection_digest: projectionDigest,
    projection_freshness: "fresh",
    hits,
    confidence: retrieval.assessRetrievalConfidence(hits.map((hit) => hit.stage_scores), {
      vector: stages.vector,
      reranker: stages.reranker,
    }, chunks.length, false),
    temporal: { as_of: null, coverage: "not_requested", reason_codes: [] },
    applied_filters: [],
    eligible_result_count: chunks.length,
    stages,
  };
}

function chunksFor(source, maxTokens = 16) {
  return retrieval.chunkMarkdown({
    ...source,
    metadata: { title: source.source_path, sensitivity: "public", authoritative: true, tags: [] },
  }, { max_tokens: maxTokens, overlap_tokens: 0 });
}

function inputFor({
  queryText,
  queryId,
  result,
  sources,
  expectedSourceIds = [],
  expectedFiles = [],
  forbiddenSourceIds = [],
  expectedConfidence = "high",
  expectedTopK = Math.max(1, result.hits.length),
  asOf = null,
  vaultFixture = "evaluation-metric-v1",
}) {
  const observations = sources.map(({ source_id, source_path, text }) => ({
    source_id,
    source_path,
    source_digest: retrieval.retrievalSha256(Buffer.from(text, "utf8")),
    source_bytes_base64: Buffer.from(text, "utf8").toString("base64"),
  }));
  const query = sealQuery({
    id: queryId,
    text: queryText,
    vault_fixture: vaultFixture,
    expected_files: [...expectedFiles].sort(),
    expected_source_ids: [...expectedSourceIds].sort(),
    expected_lineage_ids: [],
    forbidden_source_ids: [...forbiddenSourceIds].sort(),
    forbidden_lineage_ids: [],
    expected_top_k: expectedTopK,
    expected_confidence: expectedConfidence,
    as_of: asOf,
  });
  const forbidden = new Set(forbiddenSourceIds);
  const authorizedRows = observations.filter((row) => !forbidden.has(row.source_id));
  const forbiddenRows = observations.filter((row) => forbidden.has(row.source_id));
  const endpointIds = [...new Set(result.hits.flatMap((hit) => [
    ...hit.provenance.supersedes,
    ...hit.provenance.superseded_by,
  ]))].sort();
  return {
    query,
    result,
    source_observations: observations,
    audit_oracle: sealOracle({
      contract_version: "gkos-retrieval-evaluation-query-view-audit-oracle/1.0.0-draft.1",
      authorized_source_ids: authorizedRows.map((row) => row.source_id).sort(),
      authorized_source_paths: authorizedRows.map((row) => row.source_path).sort(),
      forbidden_source_ids: forbiddenRows.map((row) => row.source_id).sort(),
      forbidden_source_paths: forbiddenRows.map((row) => row.source_path).sort(),
      authorized_endpoint_ids: endpointIds,
      forbidden_endpoint_ids: [],
      expected_public_result_projection_id: result.projection_id,
      expected_public_result_projection_digest: result.projection_digest,
    }),
    expected_temporal: {
      coverage: result.temporal.coverage,
      hits: result.hits.map(({ provenance }) => ({
        source_id: provenance.source_id,
        temporal_state: provenance.temporal_state,
        valid_from: provenance.valid_from,
        valid_to: provenance.valid_to,
        supersedes: [...provenance.supersedes],
        superseded_by: [...provenance.superseded_by],
      })),
    },
  };
}

const sourceA = {
  source_id: "018f0000-0000-7000-8000-000000000901",
  source_path: "metric/a.md",
  text: "# Alpha\none two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen\n\n## Alpha Two\nnineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty thirtyone thirtytwo thirtythree thirtyfour thirtyfive thirtysix\n",
};
const sourceB = {
  source_id: "018f0000-0000-7000-8000-000000000902",
  source_path: "metric/b.md",
  text: "# Beta\nrelevant target passage one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen\n",
};
const sourceForbidden = {
  source_id: "018f0000-0000-7000-8000-000000000903",
  source_path: "metric/forbidden.md",
  text: "# Forbidden\ntarget forbidden passage one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen\n",
};
const chunksA = chunksFor(sourceA);
const chunksB = chunksFor(sourceB);
const forbiddenChunks = chunksFor(sourceForbidden);

const cases = [];
function addCase(caseId, coverage, input, { parityGroup = null, expectedCode = null, inputSchemaValid = true } = {}) {
  let row;
  try {
    const expectedMetrics = retrieval.computeRetrievalEvaluationQueryMetrics(input);
    if (expectedCode !== null) throw new Error(`${caseId}: expected ${expectedCode}, received metrics`);
    row = {
      case_id: caseId,
      coverage: [...coverage].sort(),
      parity_group: parityGroup,
      input_schema_valid: inputSchemaValid,
      expected_status: "metrics",
      input,
      expected_metrics: expectedMetrics,
      expected_code: null,
    };
  } catch (error) {
    if (expectedCode === null) throw error;
    if (!(error instanceof Error) || error.message !== expectedCode) {
      throw new Error(`${caseId}: expected ${expectedCode}, received ${error instanceof Error ? error.message : String(error)}`);
    }
    row = {
      case_id: caseId,
      coverage: [...coverage].sort(),
      parity_group: parityGroup,
      input_schema_valid: inputSchemaValid,
      expected_status: "error",
      input,
      expected_metrics: null,
      expected_code: expectedCode,
    };
  }
  cases.push(reseal(row, "case_digest"));
}

const basicResult = resultFor("target", [chunksB[0]], "metric-basic");
addCase("file-only-relevance", ["relevance-file"], inputFor({
  queryText: "target", queryId: "file-only-relevance", result: basicResult,
  sources: [sourceA, sourceB], expectedFiles: [sourceB.source_path],
}));
addCase("source-only-relevance", ["relevance-source"], inputFor({
  queryText: "target", queryId: "source-only-relevance", result: basicResult,
  sources: [sourceA, sourceB], expectedSourceIds: [sourceB.source_id],
}));
addCase("file-source-overlap-union", ["relevance-dedupe", "relevance-file", "relevance-source"], inputFor({
  queryText: "target", queryId: "file-source-overlap-union", result: basicResult,
  sources: [sourceA, sourceB], expectedFiles: [sourceB.source_path], expectedSourceIds: [sourceB.source_id],
}));

const physicalResult = resultFor("target", [chunksA[0], chunksA[1], chunksB[0]], "metric-physical-rank");
addCase("first-physical-hit-no-backfill", ["first-physical-rank", "source-dedupe"], inputFor({
  queryText: "target", queryId: "first-physical-hit-no-backfill", result: physicalResult,
  sources: [sourceA, sourceB], expectedSourceIds: [sourceB.source_id],
}));

const missingExpected = inputFor({
  queryText: "target", queryId: "expected-source-unresolved", result: basicResult,
  sources: [sourceA, sourceB], expectedSourceIds: ["018f0000-0000-7000-8000-000000000999"],
});
addCase("expected-source-unresolved", ["relevance-resolution-negative"], missingExpected,
  { expectedCode: "GKX_EVAL_EXPECTED_SOURCE_RESOLUTION_INVALID" });

const missingForbidden = inputFor({
  queryText: "target", queryId: "forbidden-source-unresolved", result: basicResult,
  sources: [sourceA, sourceB], expectedSourceIds: [sourceB.source_id],
  forbiddenSourceIds: ["018f0000-0000-7000-8000-000000000998"],
});
addCase("forbidden-source-unresolved", ["forbidden-resolution-negative"], missingForbidden,
  { expectedCode: "GKX_EVAL_FORBIDDEN_SOURCE_RESOLUTION_INVALID" });

addCase("child-citation-pass-lf", ["citation-child", "citation-pass", "line-ending-lf"], inputFor({
  queryText: "target", queryId: "child-citation-pass-lf", result: basicResult,
  sources: [sourceA, sourceB], expectedSourceIds: [sourceB.source_id],
}));
const childMismatch = inputFor({
  queryText: "target", queryId: "child-citation-mismatch", result: clone(basicResult),
  sources: [sourceA, sourceB], expectedSourceIds: [sourceB.source_id],
});
childMismatch.result.hits[0].citation.source_digest = `sha256:${"1".repeat(64)}`;
addCase("child-citation-mismatch", ["citation-child", "citation-mismatch"], childMismatch);

const childStale = inputFor({
  queryText: "target", queryId: "child-citation-stale", result: clone(basicResult),
  sources: [sourceA, sourceB], expectedSourceIds: [sourceB.source_id],
});
const staleDigest = `sha256:${"2".repeat(64)}`;
childStale.result.hits[0].chunk.source_digest = staleDigest;
childStale.result.hits[0].citation.source_digest = staleDigest;
childStale.result.hits[0].provenance.source_digest = staleDigest;
childStale.result.hits[0].provenance = reseal(childStale.result.hits[0].provenance, "provenance_digest");
addCase("child-citation-stale", ["citation-child", "citation-stale", "stale-citation-query"], childStale);

const unrelatedSpan = inputFor({
  queryText: "target", queryId: "citation-unrelated-span", result: clone(basicResult),
  sources: [sourceA, sourceB], expectedSourceIds: [sourceB.source_id],
});
const unrelatedText = "relevant";
const unrelatedStart = Buffer.from(sourceB.text, "utf8").indexOf(Buffer.from(unrelatedText, "utf8"));
unrelatedSpan.result.hits[0].citation.matched_spans = [{
  start_byte: unrelatedStart,
  end_byte: unrelatedStart + Buffer.byteLength(unrelatedText, "utf8"),
  text: unrelatedText,
}];
addCase("citation-unrelated-span", ["citation-completeness", "citation-mismatch", "citation-unrelated"], unrelatedSpan);

const reorderedResult = resultFor("relevant target", [chunksB[0]], "metric-citation-reordered");
if (reorderedResult.hits[0].citation.matched_spans.length < 2) throw new Error("citation reorder fixture lacks spans");
reorderedResult.hits[0].citation.matched_spans.reverse();
addCase("citation-reordered-spans", ["citation-completeness", "citation-mismatch", "citation-reordered"], inputFor({
  queryText: "relevant target", queryId: "citation-reordered-spans", result: reorderedResult,
  sources: [sourceB], expectedSourceIds: [sourceB.source_id],
}));

const overlapSource = {
  source_id: "018f0000-0000-7000-8000-000000000930",
  source_path: "metric/overlap.md",
  text: `# Overlap\n${Array.from({ length: 60 }, (_, index) => index === 10 || index === 20 || index === 30 ? "target" : `word${index}`).join(" ")}\n`,
};
const overlapChunks = retrieval.chunkMarkdown({
  ...overlapSource,
  metadata: { title: overlapSource.source_path, sensitivity: "public", authoritative: true, tags: [] },
}, { max_tokens: 16, overlap_tokens: 8 });
const overlapResult = resultFor("target", overlapChunks, "metric-citation-overlap");
if (overlapChunks.length !== 7 || overlapResult.hits.length !== 4 ||
    overlapResult.hits.map((hit) => hit.citation.matched_spans.length).join(",") !== "1,1,1,0") {
  throw new Error("citation overlap production fixture drift");
}
addCase("citation-overlap-production", ["citation-completeness", "citation-overlap-dedup", "citation-pass", "citation-zero-span-overlap"], inputFor({
  queryText: "target", queryId: "citation-overlap-production", result: overlapResult,
  sources: [overlapSource], expectedSourceIds: [overlapSource.source_id],
  expectedConfidence: overlapResult.confidence.level, expectedTopK: overlapChunks.length,
}));
const missingSpan = inputFor({
  queryText: "target", queryId: "citation-missing-span", result: clone(overlapResult),
  sources: [overlapSource], expectedSourceIds: [overlapSource.source_id],
  expectedConfidence: overlapResult.confidence.level, expectedTopK: overlapChunks.length,
});
missingSpan.result.hits[1].citation.matched_spans = [];
addCase("citation-missing-span", ["citation-completeness", "citation-mismatch", "citation-missing"], missingSpan);
const extraSpan = inputFor({
  queryText: "target", queryId: "citation-extra-span", result: clone(overlapResult),
  sources: [overlapSource], expectedSourceIds: [overlapSource.source_id],
  expectedConfidence: overlapResult.confidence.level, expectedTopK: overlapChunks.length,
});
const extraText = "Overlap";
const extraStart = Buffer.from(overlapSource.text, "utf8").indexOf(Buffer.from(extraText, "utf8"));
extraSpan.result.hits[0].citation.matched_spans.push({
  start_byte: extraStart,
  end_byte: extraStart + Buffer.byteLength(extraText, "utf8"),
  text: extraText,
});
addCase("citation-extra-span", ["citation-completeness", "citation-extra", "citation-mismatch"], extraSpan);

const parent = chunksA[0];
const child = chunksA.find((chunk) => chunk.parent_chunk_id === parent.chunk_id);
if (!child) throw new Error("parent fixture lacks child chunk");
const parentContext = { chunk_id: parent.chunk_id, text: parent.text, citation: citationFor(parent), provenance: provenanceFor(parent) };
const parentResult = resultFor("alpha", [child], "metric-parent", parentContext);
const parentInput = inputFor({
  queryText: "alpha", queryId: "parent-child-citation-pass", result: parentResult,
  sources: [sourceA], expectedSourceIds: [sourceA.source_id],
});
addCase("parent-child-citation-pass", ["citation-child", "citation-parent", "citation-pass"], parentInput);
const parentMismatch = clone(parentInput);
parentMismatch.query = reseal({ ...parentMismatch.query, id: "parent-citation-mismatch" }, "query_digest");
parentMismatch.result.hits[0].parent_context.citation.start_byte += 1;
addCase("parent-citation-mismatch", ["citation-mismatch", "citation-parent"], parentMismatch);
const parentStale = clone(parentInput);
parentStale.query = { ...parentStale.query, id: "parent-citation-stale" };
parentStale.query = reseal(parentStale.query, "query_digest");
for (const location of [parentStale.result.hits[0]]) {
  location.chunk.source_digest = staleDigest;
  location.citation.source_digest = staleDigest;
  location.provenance.source_digest = staleDigest;
  location.provenance = reseal(location.provenance, "provenance_digest");
  location.parent_context.citation.source_digest = staleDigest;
  location.parent_context.provenance.source_digest = staleDigest;
  location.parent_context.provenance = reseal(location.parent_context.provenance, "provenance_digest");
}
addCase("parent-citation-stale", ["citation-child", "citation-parent", "citation-stale", "stale-citation-occurrence-vs-query"], parentStale);

function unicodeCase(lineEnding, id, path) {
  const source = {
    source_id: id,
    source_path: path,
    text: ["# Unicode", "alpha Café 😀 omega", "second line target", ""].join(lineEnding),
  };
  const chunk = chunksFor(source, 64)[0];
  const needle = "Café 😀";
  const query = `"${needle}"`;
  const result = resultFor(query, [chunk], `metric-${path}`);
  return { source, result, query };
}
const lfUnicode = unicodeCase("\n", "018f0000-0000-7000-8000-000000000911", "metric/unicode-lf.md");
const crlfUnicode = unicodeCase("\r\n", "018f0000-0000-7000-8000-000000000912", "metric/unicode-crlf.md");
addCase("unicode-citation-lf", ["citation-pass", "line-ending-lf", "matched-span", "utf8-boundary"], inputFor({
  queryText: lfUnicode.query, queryId: "unicode-citation-lf", result: lfUnicode.result,
  sources: [lfUnicode.source], expectedSourceIds: [lfUnicode.source.source_id],
}), { parityGroup: "unicode-line-ending-parity" });
addCase("unicode-citation-crlf", ["citation-pass", "line-ending-crlf", "matched-span", "utf8-boundary"], inputFor({
  queryText: crlfUnicode.query, queryId: "unicode-citation-crlf", result: crlfUnicode.result,
  sources: [crlfUnicode.source], expectedSourceIds: [crlfUnicode.source.source_id],
}), { parityGroup: "unicode-line-ending-parity" });
const splitSpan = inputFor({
  queryText: lfUnicode.query, queryId: "matched-span-split-utf8", result: clone(lfUnicode.result),
  sources: [lfUnicode.source], expectedSourceIds: [lfUnicode.source.source_id],
});
const eAcuteStart = Buffer.from(lfUnicode.source.text, "utf8").indexOf(Buffer.from("é", "utf8"));
splitSpan.result.hits[0].citation.matched_spans[0].start_byte = eAcuteStart + 1;
splitSpan.result.hits[0].citation.matched_spans[0].text = "invalid-split";
addCase("matched-span-split-utf8", ["citation-mismatch", "matched-span", "utf8-split-boundary"], splitSpan);
const splitCitation = inputFor({
  queryText: lfUnicode.query, queryId: "citation-split-utf8", result: clone(lfUnicode.result),
  sources: [lfUnicode.source], expectedSourceIds: [lfUnicode.source.source_id],
});
const emojiStart = Buffer.from(lfUnicode.source.text, "utf8").indexOf(Buffer.from("😀", "utf8"));
splitCitation.result.hits[0].citation.start_byte = emojiStart + 1;
splitCitation.result.hits[0].citation.matched_spans = [];
addCase("citation-split-utf8", ["citation-mismatch", "utf8-split-boundary"], splitCitation);

const endpointId = "018f0000-0000-7000-8000-000000000921";
const endpointSource = {
  source_id: "018f0000-0000-7000-8000-000000000922",
  source_path: "metric/endpoint.md",
  text: "# Endpoint\ntarget endpoint one two three four five six seven eight nine ten eleven twelve\n",
  supersedes: [endpointId],
};
const endpointChunk = chunksFor(endpointSource, 64)[0];
const endpointResult = resultFor("target", [endpointChunk], "metric-endpoint");
const endpointForbidden = inputFor({
  queryText: "target", queryId: "forbidden-endpoint-leak", result: endpointResult,
  sources: [endpointSource], expectedSourceIds: [endpointSource.source_id],
});
endpointForbidden.audit_oracle.authorized_endpoint_ids = [];
endpointForbidden.audit_oracle.forbidden_endpoint_ids = [endpointId];
endpointForbidden.audit_oracle = reseal(endpointForbidden.audit_oracle, "oracle_digest");
addCase("forbidden-endpoint-leak", ["endpoint-audit", "policy-leak"], endpointForbidden);

const crossRoleSource = { ...sourceA, supersedes: [sourceB.source_id] };
const crossRoleChunk = chunksFor(crossRoleSource, 64)[0];
const crossRoleResult = resultFor("target", [crossRoleChunk], "metric-cross-role");
const endpointNoFallback = inputFor({
  queryText: "target", queryId: "endpoint-no-source-fallback", result: crossRoleResult,
  sources: [crossRoleSource, sourceB], expectedSourceIds: [crossRoleSource.source_id],
});
endpointNoFallback.audit_oracle.authorized_endpoint_ids = [];
endpointNoFallback.audit_oracle = reseal(endpointNoFallback.audit_oracle, "oracle_digest");
addCase("endpoint-no-source-fallback", ["endpoint-audit", "role-no-fallback"], endpointNoFallback,
  { expectedCode: "GKX_EVAL_ORACLE_PARTITION_INCOMPLETE" });

const sourceLeakResult = resultFor("target", [forbiddenChunks[0], chunksB[0]], "metric-source-leak");
addCase("forbidden-source-leak", ["policy-leak", "source-audit"], inputFor({
  queryText: "target", queryId: "forbidden-source-leak", result: sourceLeakResult,
  sources: [sourceForbidden, sourceB], expectedSourceIds: [sourceB.source_id], forbiddenSourceIds: [sourceForbidden.source_id],
}));

const nullLineage = inputFor({
  queryText: "target", queryId: "null-lineage-absence", result: basicResult,
  sources: [sourceA, sourceB], expectedSourceIds: [sourceB.source_id],
});
addCase("null-lineage-absence", ["absent-parent", "null-lineage", "policy-denominator"], nullLineage);

const malformedEndpoint = inputFor({
  queryText: "target", queryId: "malformed-audited-endpoint", result: clone(endpointResult),
  sources: [endpointSource], expectedSourceIds: [endpointSource.source_id],
});
malformedEndpoint.result.hits[0].chunk.supersedes = ["not-a-uid"];
malformedEndpoint.result.hits[0].provenance.supersedes = ["not-a-uid"];
malformedEndpoint.result.hits[0].provenance = reseal(malformedEndpoint.result.hits[0].provenance, "provenance_digest");
addCase("malformed-audited-endpoint", ["malformed-public-scalar", "public-envelope-negative"], malformedEndpoint,
  { expectedCode: "GKX_EVAL_PUBLIC_PROVENANCE_VALUE_INVALID", inputSchemaValid: false });

const temporalFixture = PHASE2.executable_projection;
const temporalResult = clone(temporalFixture.expected_result);
const temporalSource = temporalFixture.input_files.find((item) => item.relative_path === "new.md");
const temporalHit = temporalResult.hits[0];
const temporalInput = {
  query: sealQuery({
    id: "temporal-sufficient",
    text: "cafe",
    vault_fixture: "retrieval-temporal-v1",
    expected_files: ["new.md"],
    expected_source_ids: [temporalHit.chunk.source_id],
    expected_lineage_ids: [],
    forbidden_source_ids: [],
    forbidden_lineage_ids: [],
    expected_top_k: 5,
    expected_confidence: "high",
    as_of: temporalResult.temporal.as_of,
  }),
  result: temporalResult,
  source_observations: [{
    source_id: temporalHit.chunk.source_id,
    source_path: temporalHit.chunk.source_path,
    source_digest: temporalHit.chunk.source_digest,
    source_bytes_base64: Buffer.from(temporalSource.content, "utf8").toString("base64"),
  }],
  audit_oracle: sealOracle({
    contract_version: "gkos-retrieval-evaluation-query-view-audit-oracle/1.0.0-draft.1",
    authorized_source_ids: [temporalHit.chunk.source_id],
    authorized_source_paths: [temporalHit.chunk.source_path],
    forbidden_source_ids: [],
    forbidden_source_paths: [],
    authorized_endpoint_ids: [...new Set([...temporalHit.provenance.supersedes, ...temporalHit.provenance.superseded_by])].sort(),
    forbidden_endpoint_ids: [],
    expected_public_result_projection_id: temporalResult.projection_id,
    expected_public_result_projection_digest: temporalResult.projection_digest,
  }),
  expected_temporal: {
    coverage: temporalResult.temporal.coverage,
    hits: [{
      source_id: temporalHit.provenance.source_id,
      temporal_state: temporalHit.provenance.temporal_state,
      valid_from: temporalHit.provenance.valid_from,
      valid_to: temporalHit.provenance.valid_to,
      supersedes: [...temporalHit.provenance.supersedes],
      superseded_by: [...temporalHit.provenance.superseded_by],
    }],
  },
};
addCase("temporal-sufficient", ["confidence-match", "temporal-sufficient", "temporal-match"], temporalInput);
const temporalMismatch = clone(temporalInput);
temporalMismatch.query = reseal({ ...temporalMismatch.query, id: "temporal-mismatch" }, "query_digest");
temporalMismatch.expected_temporal.hits[0].temporal_state = "historical";
temporalMismatch.expected_temporal.hits[0].valid_to = "2026-09-01T00:00:00.000Z";
addCase("temporal-mismatch", ["temporal-mismatch", "temporal-sufficient"], temporalMismatch);
const confidenceMismatch = clone(temporalInput);
confidenceMismatch.query = reseal({ ...confidenceMismatch.query, id: "confidence-mismatch", expected_confidence: "medium" }, "query_digest");
addCase("confidence-mismatch", ["confidence-mismatch", "temporal-sufficient"], confidenceMismatch);

const staleProjection = inputFor({
  queryText: "target", queryId: "stale-projection", result: clone(basicResult),
  sources: [sourceA, sourceB], expectedSourceIds: [sourceB.source_id],
});
staleProjection.result.projection_freshness = "stale";
staleProjection.result.confidence = retrieval.assessRetrievalConfidence(
  staleProjection.result.hits.map((hit) => hit.stage_scores),
  { vector: staleProjection.result.stages.vector, reranker: staleProjection.result.stages.reranker },
  staleProjection.result.eligible_result_count,
  true,
);
addCase("stale-projection", ["projection-stale", "zero-gate"], staleProjection);
const unverifiedProjection = inputFor({
  queryText: "target", queryId: "unverified-projection", result: clone(basicResult),
  sources: [sourceA, sourceB], expectedSourceIds: [sourceB.source_id], expectedConfidence: "low",
});
unverifiedProjection.result.projection_freshness = "unverified";
unverifiedProjection.result.confidence = {
  ...unverifiedProjection.result.confidence,
  level: "low",
  low_confidence: true,
  reason_codes: ["PROJECTION_FRESHNESS_UNVERIFIED"],
};
addCase("unverified-projection", ["projection-unverified", "zero-gate"], unverifiedProjection);

const emptyResult = clone(basicResult);
emptyResult.query_digest = retrieval.retrievalCanonicalDigest({ as_of: "2026-01-01T00:00:00.000Z", query: "target" });
emptyResult.projection_freshness = "unverified";
emptyResult.hits = [];
emptyResult.confidence = {
  level: "insufficient",
  low_confidence: true,
  reason_codes: ["NO_ELIGIBLE_RESULTS", "PROJECTION_FRESHNESS_UNVERIFIED"],
  lexical_signal: null,
  semantic_signal: null,
  reranker_signal: null,
  coverage_signal: null,
};
emptyResult.temporal = { as_of: "2026-01-01T00:00:00.000Z", coverage: "not_evaluated", reason_codes: [] };
emptyResult.eligible_result_count = 0;
emptyResult.stages = {
  lexical: { kind: "sqlite_fts5", state: "skipped", reason_codes: ["NO_ELIGIBLE_RESULTS"] },
  vector: { kind: "none", state: "disabled", reason_codes: ["VECTOR_DISABLED"] },
  reranker: { kind: "none", state: "skipped", reason_codes: ["RERANKER_NOT_CONFIGURED"] },
};
const emptyInput = inputFor({
  queryText: "target", queryId: "zero-hit-unverified", result: emptyResult,
  sources: [sourceB], expectedSourceIds: [sourceB.source_id], expectedConfidence: "low", expectedTopK: 5,
  asOf: "2026-01-01T00:00:00.000Z",
});
emptyInput.expected_temporal = { coverage: "not_evaluated", hits: [] };
addCase("zero-hit-unverified", ["citation-zero-coverage", "projection-unverified", "zero-hit"], emptyInput);

const invalidUtf8 = inputFor({
  queryText: "target", queryId: "invalid-source-utf8", result: basicResult,
  sources: [sourceA, sourceB], expectedSourceIds: [sourceB.source_id],
});
const invalidBytes = Buffer.from([0xc0, 0xaf]);
const invalidObservation = invalidUtf8.source_observations.find((row) => row.source_id === sourceA.source_id);
invalidObservation.source_digest = retrieval.retrievalSha256(invalidBytes);
invalidObservation.source_bytes_base64 = invalidBytes.toString("base64");
addCase("invalid-source-utf8", ["source-observation-utf8-negative"], invalidUtf8,
  { expectedCode: "GKX_EVAL_SOURCE_OBSERVATION_UTF8_INVALID" });

// The reviewed 24-query set is not a label-only baseline.  Every row below
// consumes the checked-in sealed corpus bytes, Full's one-pass authored GKX
// projection, and Full's canonical chunker, then recomputes the exact public
// result metric envelope from those bytes.
const reviewedConformance = JSON.parse(readFileSync(new URL("conformance-fixture.json", PHASE4_PACK), "utf8"));
const reviewedSourceCorpus = JSON.parse(readFileSync(new URL("source-corpus.json", PHASE4_PACK), "utf8"));
const reviewedCatalog = JSON.parse(readFileSync(new URL("fixture-catalog.json", PHASE4_PACK), "utf8"));
const reviewedProvider = JSON.parse(readFileSync(new URL("fixed-provider.json", PHASE4_PACK), "utf8"));
const reviewedEnvironmentSet = reviewedConformance.valid_envelopes.environment_set;
const reviewedManifests = new Map(reviewedConformance.valid_envelopes.projection_manifests.map((manifest) => [manifest.vault_id, manifest]));
const reviewedAxes = reviewedConformance.valid_envelopes.baseline.selected_axes;
const reviewedByVault = new Map();
for (const corpus of reviewedSourceCorpus.corpora) {
  const decoded = corpus.source_files.map((source) => ({
    ...source,
    text: Buffer.from(source.source_bytes_base64, "base64").toString("utf8"),
  }));
  const projection = evaluationHost.projectAuthoredGkxRetrievalCorpus(decoded.map((source) => ({
    relativePath: source.source_path,
    content: source.text,
    kind: "note",
  })));
  if (projection.rejections.length !== 0 || projection.sources.length !== decoded.length || projection.parse_count !== decoded.length) {
    throw new Error(`${corpus.vault_fixture}: reviewed source corpus projection mismatch`);
  }
  const projectedBySourceId = new Map();
  const candidateChunks = [];
  for (const projected of projection.sources) {
    const source = decoded.find((candidate) => candidate.source_id === projected.chunk_input.source_id && candidate.source_path === projected.chunk_input.source_path);
    if (!source || source.text !== projected.chunk_input.text || source.source_digest !== retrieval.retrievalSha256(Buffer.from(source.text, "utf8"))) {
      throw new Error(`${corpus.vault_fixture}: reviewed source observation mismatch`);
    }
    const chunks = retrieval.chunkMarkdown(projected.chunk_input);
    if (chunks.length < 1) throw new Error(`${corpus.vault_fixture}: reviewed source produced no chunks`);
    const candidates = retrievalHost.bindGkxRetrievalCandidateChunks(projected.record_key, chunks);
    candidateChunks.push(...candidates);
    projectedBySourceId.set(source.source_id, { source, projected, chunks, candidates });
  }
  const entry = reviewedCatalog.entries.find((candidate) => candidate.vault_fixture === corpus.vault_fixture);
  const member = reviewedEnvironmentSet.members.find((candidate) => candidate.environment.vault_fixture === corpus.vault_fixture);
  const manifest = reviewedManifests.get(corpus.vault_fixture);
  const scenario = reviewedProvider.scenarios.find((candidate) =>
    candidate.environment_scope.vault_fixture === corpus.vault_fixture &&
    candidate.environment_scope.lexical_backend === member?.environment.lexical_backend);
  if (!entry || !member || !manifest || !scenario) throw new Error(`${corpus.vault_fixture}: reviewed environment artifact missing`);
  const sourcePolicy = new Map(entry.runtime_policy_inputs.source_discoverability.map((row) => [row.source_id, row.discoverable]));
  const chunkPolicy = new Map(entry.runtime_policy_inputs.chunk_discoverability.map((row) => [row.chunk_id, row.discoverable]));
  const authorizedRecordKeys = new Set(projection.sources.filter((source) => {
    const scoped = projectedBySourceId.get(source.candidate_source.source_id);
    return scoped && sourcePolicy.get(source.candidate_source.source_id) === true &&
      scoped.candidates.every((candidate) => chunkPolicy.get(candidate.chunk.chunk_id) === true);
  }).map((source) => source.record_key));
  const authorizedSources = projection.sources.map((row) => row.candidate_source).filter((row) => authorizedRecordKeys.has(row.record_key));
  const authorizedDeclarations = projection.declarations.filter((row) => authorizedRecordKeys.has(row.source_record_key));
  const authorizedCandidates = candidateChunks.filter((row) => authorizedRecordKeys.has(row.record_key));
  const candidateByKey = new Map(authorizedCandidates.map((candidate) => [candidate.candidate_chunk_key, candidate]));
  const sourceBytesByPath = new Map(decoded.map((source) => [source.source_path, Buffer.from(source.source_bytes_base64, "base64")]));
  const indexResponseByContentDigest = new Map(scenario.embedding_index_templates.flatMap((template) => template.responses)
    .map((response) => [response.input_digest, Float32Array.from(response.values_micros, (part) => part / 1_000_000)]));
  reviewedByVault.set(corpus.vault_fixture, {
    corpus, decoded, projectedBySourceId, projection, candidateChunks, authorizedSources, authorizedDeclarations, authorizedCandidates,
    candidateByKey, sourceBytesByPath, indexResponseByContentDigest, entry, member, manifest, scenario,
  });
}

function reviewedResultFor(query, artifact) {
  const queryIndex = artifact.scenario.eval_schedule.query_partition.findIndex((row) => row.query_id === query.id && row.query_digest === query.query_digest);
  if (queryIndex < 0) throw new Error(`${query.id}: provider eval query partition missing`);
  const queryTemplate = artifact.scenario.embedding_query_templates[queryIndex];
  const rerankerOracle = artifact.scenario.reranker_query_oracles[queryIndex];
  if (!queryTemplate || !rerankerOracle) throw new Error(`${query.id}: reviewed provider template missing`);
  const derived = evaluationHost.deriveRetrievalEvaluationReviewedResult({
    query,
    manifest: artifact.manifest,
    environment: artifact.member.environment,
    selected_axes: reviewedAxes,
    candidate_sources: artifact.authorizedSources,
    candidate_declarations: artifact.authorizedDeclarations,
    candidate_chunks: artifact.authorizedCandidates,
    source_bytes_by_path: artifact.sourceBytesByPath,
    embedding_index_templates: artifact.scenario.embedding_index_templates,
    embedding_query_template: queryTemplate,
    reranker_query_oracle: rerankerOracle,
  });
  return {
    result: derived.result,
    view: derived.authorized_view,
    coordinate: {
      projection_id: derived.result_projection_id,
      projection_digest: derived.result_projection_digest,
    },
    queryIndex,
    queryTemplate,
    rerankerOracle,
  };
}

for (const query of reviewedConformance.golden.expected_normalized.queries) {
  const vault = reviewedByVault.get(query.vault_fixture);
  if (!vault || query.expected_source_ids.length !== 1) throw new Error(`${query.id}: reviewed relevance source missing`);
  const reviewed = reviewedResultFor(query, vault);
  const result = reviewed.result;
  const input = inputFor({
    queryText: query.text,
    queryId: query.id,
    result,
    sources: vault.decoded,
    expectedSourceIds: query.expected_source_ids,
    expectedFiles: query.expected_files,
    forbiddenSourceIds: query.forbidden_source_ids,
    expectedConfidence: query.expected_confidence,
    expectedTopK: query.expected_top_k,
    asOf: query.as_of,
    vaultFixture: query.vault_fixture,
  });
  input.audit_oracle = sealOracle({
    contract_version: "gkos-retrieval-evaluation-query-view-audit-oracle/1.0.0-draft.1",
    authorized_source_ids: [...vault.entry.evaluation_audit_oracle.authorized_source_ids],
    authorized_source_paths: [...vault.entry.evaluation_audit_oracle.authorized_source_paths],
    forbidden_source_ids: [...vault.entry.evaluation_audit_oracle.forbidden_source_ids],
    forbidden_source_paths: [...vault.entry.evaluation_audit_oracle.forbidden_source_paths],
    authorized_endpoint_ids: [...vault.entry.evaluation_audit_oracle.authorized_endpoint_ids],
    forbidden_endpoint_ids: [...vault.entry.evaluation_audit_oracle.forbidden_endpoint_ids],
    expected_public_result_projection_id: reviewed.coordinate.projection_id,
    expected_public_result_projection_digest: reviewed.coordinate.projection_digest,
  });
  input.expected_temporal = {
    coverage: result.temporal.coverage,
    hits: result.hits.map((hit) => ({
      source_id: hit.provenance.source_id,
      temporal_state: hit.provenance.temporal_state,
      valid_from: hit.provenance.valid_from,
      valid_to: hit.provenance.valid_to,
      supersedes: [...hit.provenance.supersedes],
      superseded_by: [...hit.provenance.superseded_by],
    })),
  };
  if (retrieval.stableJson(input.query) !== retrieval.stableJson(query)) throw new Error(`${query.id}: reviewed golden query binding mismatch`);
  addCase(`reviewed-${query.id}`, [
    "canonical-corpus-bytes",
    "reviewed-24-query",
    query.as_of === null ? "ordinary-current" : "temporal-sufficient",
  ], input, { parityGroup: "reviewed-24-query-set" });
}

// Physical-absence side of the ratified future-version noninterference pair.
// It is a complete canonical reprojection of the temporal corpus with exactly
// the named future successor removed; index coordinates may differ, while the
// query-scoped public view, metrics, and attempt counters must not.
const futureSuccessorId = "019b2d14-4230-7db7-87d4-7d81cfaec934";
const temporalPresent = reviewedByVault.get("retrieval-temporal-v1");
const absenceQuery = reviewedConformance.golden.expected_normalized.queries.find((query) => query.id === "temporal-future-exclusion");
if (!temporalPresent || !absenceQuery) throw new Error("temporal noninterference fixture missing");
const absentDecoded = temporalPresent.decoded.filter((source) => source.source_id !== futureSuccessorId);
if (absentDecoded.length + 1 !== temporalPresent.decoded.length) throw new Error("future successor removal multiplicity invalid");
const absentProjection = evaluationHost.projectAuthoredGkxRetrievalCorpus(absentDecoded.map((source) => ({
  relativePath: source.source_path,
  content: source.text,
  kind: "note",
})));
if (absentProjection.rejections.length !== 0 || absentProjection.sources.length !== absentDecoded.length) {
  throw new Error("absent temporal corpus projection invalid");
}
const absentCandidates = absentProjection.sources.flatMap((source) =>
  retrievalHost.bindGkxRetrievalCandidateChunks(source.record_key, retrieval.chunkMarkdown(source.chunk_input)));
const absentSourceSnapshotMaterial = {
  contract_version: "gkos-retrieval-evaluation-source-snapshot/1.0.0-draft.1",
  source_observations: absentDecoded.map(({ source_id, source_path, source_digest }) => ({ source_id, source_path, source_digest })),
};
const absentPolicyMaterial = {
  contract_version: "gkos-retrieval-evaluation-runtime-policy-inputs/1.0.0-draft.1",
  source_discoverability: absentDecoded.map(({ source_id, source_path }) => ({ source_id, source_path, discoverable: true })),
  chunk_discoverability: absentCandidates.map((candidate) => ({
    chunk_id: candidate.chunk.chunk_id,
    source_id: candidate.chunk.source_id,
    discoverable: true,
  })).sort((left, right) => retrieval.retrievalCodeUnitCompare(retrieval.stableJson(left), retrieval.stableJson(right))),
};
const absentManifest = retrievalHost.deriveGkxRetrievalProjectionManifest({
  vault_id: temporalPresent.manifest.vault_id,
  source_snapshot_digest: retrieval.retrievalCanonicalDigest(absentSourceSnapshotMaterial),
  configuration_digest: temporalPresent.manifest.configuration_digest,
  policy_digest: retrieval.retrievalCanonicalDigest(absentPolicyMaterial),
  candidate_sources: absentProjection.sources.map((source) => source.candidate_source),
  candidate_declarations: absentProjection.declarations,
  candidate_chunks: absentCandidates,
  embedding_eligible_candidate_chunk_keys: absentCandidates.map((candidate) => candidate.candidate_chunk_key),
  vectors: absentCandidates.map((candidate) => ({
    candidate_chunk_key: candidate.candidate_chunk_key,
    vector: [...temporalPresent.indexResponseByContentDigest.get(candidate.chunk.content_digest)],
  })),
  embedding_provider_id: temporalPresent.manifest.embedding_provider_id,
  embedding_model_id: temporalPresent.manifest.embedding_model_id,
  embedding_dimensions: temporalPresent.manifest.embedding_dimensions,
}, temporalPresent.manifest.lexical_backend);
const absentCandidateByKey = new Map(absentCandidates.map((candidate) => [candidate.candidate_chunk_key, candidate]));
const absentArtifact = {
  ...temporalPresent,
  decoded: absentDecoded,
  projection: absentProjection,
  candidateChunks: absentCandidates,
  authorizedSources: absentProjection.sources.map((source) => source.candidate_source),
  authorizedDeclarations: absentProjection.declarations,
  authorizedCandidates: absentCandidates,
  candidateByKey: absentCandidateByKey,
  sourceBytesByPath: new Map(absentDecoded.map((source) => [source.source_path, Buffer.from(source.source_bytes_base64, "base64")])),
  manifest: absentManifest,
  entry: {
    ...temporalPresent.entry,
    evaluation_audit_oracle: {
      ...temporalPresent.entry.evaluation_audit_oracle,
      authorized_source_ids: absentDecoded.map((source) => source.source_id).sort(retrieval.retrievalCodeUnitCompare),
      authorized_source_paths: absentDecoded.map((source) => source.source_path).sort(retrieval.retrievalCodeUnitCompare),
      forbidden_source_ids: [],
      forbidden_source_paths: [],
      authorized_endpoint_ids: [],
      forbidden_endpoint_ids: [],
    },
  },
};
const absentReviewed = reviewedResultFor(absenceQuery, absentArtifact);
const absentInput = inputFor({
  queryText: absenceQuery.text,
  queryId: absenceQuery.id,
  result: absentReviewed.result,
  sources: absentDecoded,
  expectedSourceIds: absenceQuery.expected_source_ids,
  expectedFiles: absenceQuery.expected_files,
  forbiddenSourceIds: absenceQuery.forbidden_source_ids,
  expectedConfidence: absenceQuery.expected_confidence,
  expectedTopK: absenceQuery.expected_top_k,
  asOf: absenceQuery.as_of,
  vaultFixture: absenceQuery.vault_fixture,
});
absentInput.audit_oracle = sealOracle({
  contract_version: "gkos-retrieval-evaluation-query-view-audit-oracle/1.0.0-draft.1",
  authorized_source_ids: absentArtifact.entry.evaluation_audit_oracle.authorized_source_ids,
  authorized_source_paths: absentArtifact.entry.evaluation_audit_oracle.authorized_source_paths,
  forbidden_source_ids: [],
  forbidden_source_paths: [],
  authorized_endpoint_ids: [],
  forbidden_endpoint_ids: [],
  expected_public_result_projection_id: absentReviewed.coordinate.projection_id,
  expected_public_result_projection_digest: absentReviewed.coordinate.projection_digest,
});
absentInput.expected_temporal = {
  coverage: absentReviewed.result.temporal.coverage,
  hits: absentReviewed.result.hits.map((hit) => ({
    source_id: hit.provenance.source_id,
    temporal_state: hit.provenance.temporal_state,
    valid_from: hit.provenance.valid_from,
    valid_to: hit.provenance.valid_to,
    supersedes: [...hit.provenance.supersedes],
    superseded_by: [...hit.provenance.superseded_by],
  })),
};
addCase("reviewed-temporal-future-absent", ["canonical-corpus-bytes", "physical-absence", "temporal-noninterference"], absentInput,
  { parityGroup: "temporal-future-present-absent" });

cases.sort((left, right) => left.case_id < right.case_id ? -1 : left.case_id > right.case_id ? 1 : 0);
const material = { contract_version: CONTRACT_VERSION, cases };
const fixture = { ...material, fixture_digest: retrieval.retrievalCanonicalDigest(material) };
const bytes = `${JSON.stringify(fixture, null, 2)}\n`;
if (process.argv.includes("--write")) writeFileSync(OUTPUT, bytes, "utf8");
else process.stdout.write(bytes);
