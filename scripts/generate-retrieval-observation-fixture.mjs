/**
 * Private Phase-4 Slice-C deterministic performance fixture.
 *
 * This module is bundled with the repository source by the observation
 * runner. It is not part of the package export map or the shipped contract
 * pack. Every byte-bearing coordinate below is the ratified SamplePlan input.
 */
import { chunkMarkdown } from "../src/retrieval/chunker.ts";
import { retrievalCanonicalDigest, retrievalSha256, stableJson } from "../src/retrieval/digest.ts";

export const PERFORMANCE_GENERATOR_VERSION = "gkos-retrieval-evaluation-performance-generator/1.0.0";
export const PERFORMANCE_FIXTURE_VERSION = "gkos-retrieval-evaluation-performance-fixture/1.0.0";
export const PERFORMANCE_SOURCE_SNAPSHOT_VERSION = "gkos-retrieval-evaluation-performance-source-snapshot/1.0.0";
export const PERFORMANCE_CHUNK_SET_VERSION = "gkos-retrieval-evaluation-performance-chunk-set/1.0.0";
export const PERFORMANCE_SAMPLE_PLAN_VERSION = "gkos-retrieval-evaluation-performance-sample-plan/1.0.0";
export const PERFORMANCE_RESULT_SET_VERSION = "gkos-retrieval-evaluation-performance-result-set/1.0.0";
export const PERFORMANCE_SAMPLE_VECTOR_VERSION = "gkos-retrieval-evaluation-performance-sample-vector/1.0.0";
export const PERFORMANCE_QUERY_CYCLE_VERSION = "gkos-retrieval-evaluation-performance-query-cycle/1.0.0";
export const PERFORMANCE_QUERY_WORK_VERSION = "gkos-retrieval-evaluation-performance-query-work/1.0.0";
export const PERFORMANCE_INDEX_REQUEST_SEQUENCE_VERSION = "gkos-retrieval-evaluation-performance-index-request-sequence/1.0.0";
export const PERFORMANCE_QUERY_ATTEMPT_SET_VERSION = "gkos-retrieval-evaluation-performance-query-attempt-set/1.0.0";

export const PERFORMANCE_VAULT_ID = "phase4-performance-v1";
export const PERFORMANCE_SAMPLE_PLAN_DIGEST = "sha256:7852c24bc2eeb057f3ae9ccfaf4b03c72e75b6556609dac7673e5626f238a534";
export const PERFORMANCE_FIXTURE_DIGEST = "sha256:e18741ea37bcaefdc981ab5b5b1b768ca0e1878f32a8f3e31f4324aad4244aa4";
export const PERFORMANCE_CONFIGURATION_DIGEST = "sha256:1ddbfb7e00052cc8967a36ed3cfa952caca0823a6130bdcb90c3de3568e58eec";
export const PERFORMANCE_POLICY_DIGEST = "sha256:615a92c8db758934c63e8671ee953989e9734c7085f4b066ddc2948368ae22f6";
export const PERFORMANCE_EVALUATION_DIGEST = "sha256:0af5053fccb84ae0a9eb3b785a3760e20438300dd49d512c6ab480bfe299e433";

const SOURCE_COUNT = 1_000;
const SECTIONS_PER_SOURCE = 10;
const CHUNK_COUNT = 10_000;
const MUTATED_SOURCE_ORDINAL = 555;
const MUTATED_SECTION_ORDINAL = 5;
const MUTATED_GLOBAL_ORDINAL = 5_555;

const INITIAL_SOURCE_SNAPSHOT = Object.freeze({
  bytes: 193_149,
  digest: "sha256:d87568bc14830e0646057690b2db23df07c437048a153c086a81dbb804fc98ce",
});
const UPDATED_SOURCE_SNAPSHOT = Object.freeze({
  bytes: 193_149,
  digest: "sha256:fef6de2b266428a70e1d3668c0cbbb7f0f99ac4841f02b663ead77eeadb44128",
});
const INITIAL_CHUNK_SET = Object.freeze({
  bytes: 9_912_142,
  digest: "sha256:321962e7dd2345895365db35b50ecf5478c169c489f1a92d9cd6647301d66e8a",
});
const UPDATED_CHUNK_SET = Object.freeze({
  bytes: 9_912_142,
  digest: "sha256:9563bfeb50827dd4d68242cdf73b992904aff7f3e429d29b7038155a3f5de1eb",
});

const INDEX_CONFIGURATION = Object.freeze({
  contract_version: "gkos-retrieval-evaluation-performance-index-configuration/1.0.0",
  engine_version: "2.1.2",
  retrieval_contract_version: "gkos-retrieval/1.0.0-draft.1",
  projection_schema_version: 2,
  chunker: { version: "gkos-heading-chunker/1", max_tokens: 16, overlap_tokens: 0 },
  tokenizer_version: "gkos-ascii-whitespace/1",
  lexical_backend: "sqlite_fts5",
  embedding: {
    provider_kind: "local_onnx",
    provider_id: "phase4-observation-local",
    model_id: "phase4-observation-constant-v1",
    dimensions: 4,
    timeout_ms: 30_000,
  },
});

const INDEX_POLICY = Object.freeze({
  contract_version: "gkos-retrieval-evaluation-performance-index-policy/1.0.0",
  vault_id: PERFORMANCE_VAULT_ID,
  source_snapshot_contract_version: PERFORMANCE_SOURCE_SNAPSHOT_VERSION,
  source_count: SOURCE_COUNT,
  chunk_count: CHUNK_COUNT,
  authorization: {
    discoverability: "allow",
    sensitivity: ["public"],
    source_scope: "all_generated_sources",
    chunk_scope: "all_generated_chunks",
  },
  query_filters: null,
});

const QUERY_ORDINALS = Object.freeze([0, 1_111, 2_222, 3_333, 4_444, 5_555, 6_666, 7_777, 8_888, 9_999]);
const QUERY_REQUEST = Object.freeze({
  limit: 5,
  lexical_top_k: 5,
  semantic_top_k: 5,
  rrf_k: 60,
  mmr: false,
  mmr_lambda: 0.7,
  parent_expansion: false,
});

const RESULT_STAGE_EXPECTATION = Object.freeze({
  result_contract_version: "gkos-retrieval/1.0.0-draft.1",
  lexical: { kind: "sqlite_fts5", state: "active", reason_codes: [] },
  vector: {
    kind: "local_onnx",
    state: "active",
    provider_id: "phase4-observation-local",
    model_id: "phase4-observation-constant-v1",
    reason_codes: [],
  },
  reranker: { kind: "none", state: "skipped", reason_codes: ["RERANKER_NOT_CONFIGURED"] },
});

const EXPECTED_INDEX = Object.freeze({
  initial: {
    source_snapshot_digest: INITIAL_SOURCE_SNAPSHOT.digest,
    chunk_set_digest: INITIAL_CHUNK_SET.digest,
    provider_call_count: 313,
    provider_item_count: 10_000,
    index_request_sequence_digest: "sha256:972275154f0526defa4afd300d0acfd310a488efe074750b7e08bf7e5d9ef4d5",
    expected_projection_id: "retrieval:1f7d014b0dd57096f6437e1c",
    expected_projection_digest: "sha256:1f7d014b0dd57096f6437e1c446bcabe8a222fee62be984b1e0d4e7dddab5cb2",
  },
  incremental_update: {
    source_snapshot_digest: UPDATED_SOURCE_SNAPSHOT.digest,
    chunk_set_digest: UPDATED_CHUNK_SET.digest,
    prior_projection_digest: "sha256:1f7d014b0dd57096f6437e1c446bcabe8a222fee62be984b1e0d4e7dddab5cb2",
    provider_call_count: 1,
    provider_item_count: 1,
    chunks_reprocessed: 1,
    chunks_reused: 9_999,
    index_request_sequence_digest: "sha256:531d5ad686a8ce5b49b2884a9b0f5ed500de4a6a72f5493759f65a5bc4967965",
    expected_projection_id: "retrieval:a65e3710f614da0a33a2913e",
    expected_projection_digest: "sha256:a65e3710f614da0a33a2913e909c682d8485619f72f0954c86395b501202f5f8",
  },
  clean_rebuild: {
    source_snapshot_digest: UPDATED_SOURCE_SNAPSHOT.digest,
    chunk_set_digest: UPDATED_CHUNK_SET.digest,
    prior_projection_digest: null,
    provider_call_count: 313,
    provider_item_count: 10_000,
    index_request_sequence_digest: "sha256:d76bfae77f73bace73bde6d305b6103479093145d8283528721b5929cb32fcbb",
    expected_projection_id: "retrieval:a65e3710f614da0a33a2913e",
    expected_projection_digest: "sha256:a65e3710f614da0a33a2913e909c682d8485619f72f0954c86395b501202f5f8",
  },
});

function exact(value, expected, code) {
  if (value !== expected) throw new Error(`${code}:${String(value)}:${String(expected)}`);
}

function sourceId(ordinal) {
  return `00000000-0000-4000-8000-${String(ordinal + 1).padStart(12, "0")}`;
}

function sourcePath(ordinal) {
  return `phase4-performance/source-${String(ordinal).padStart(4, "0")}.md`;
}

function sourceText(sourceOrdinal, updated) {
  let text = "";
  for (let sectionOrdinal = 0; sectionOrdinal < SECTIONS_PER_SOURCE; sectionOrdinal += 1) {
    const globalOrdinal = sourceOrdinal * SECTIONS_PER_SOURCE + sectionOrdinal;
    const revision = updated && sourceOrdinal === MUTATED_SOURCE_ORDINAL && sectionOrdinal === MUTATED_SECTION_ORDINAL
      ? "revisionomega"
      : "revisionalpha";
    text += `# Section ${String(globalOrdinal).padStart(5, "0")}\n`;
    text += `phasefourshared phasefourtoken${String(globalOrdinal).padStart(5, "0")} ${revision}\n\n`;
  }
  return text;
}

function sourceMetadata(ordinal) {
  return {
    title: `Phase 4 performance ${String(ordinal).padStart(4, "0")}`,
    tags: ["phase4-performance"],
    topic: "retrieval",
    category: "qualification",
    authored_at: "2026-08-01T00:00:00Z",
    sensitivity: "public",
    gkx_type: "note",
    epistemic_state: "observation",
    authoritative: true,
  };
}

export function buildPerformanceCorpus(updated = false) {
  const sources = [];
  const chunks = [];
  const sourceRows = [];
  for (let ordinal = 0; ordinal < SOURCE_COUNT; ordinal += 1) {
    const source_id = sourceId(ordinal);
    const source_path = sourcePath(ordinal);
    const text = sourceText(ordinal, updated);
    const sourceChunks = chunkMarkdown({
      source_id,
      source_path,
      text,
      metadata: sourceMetadata(ordinal),
    }, { max_tokens: 16, overlap_tokens: 0 });
    exact(sourceChunks.length, SECTIONS_PER_SOURCE, "GKX_EVAL_OBSERVATION_CHUNK_COUNT_INVALID");
    sources.push(Object.freeze({ source_id, source_path, text, bytes: Buffer.from(text, "utf8") }));
    chunks.push(...sourceChunks);
    sourceRows.push({ source_id, source_path, source_digest: sourceChunks[0].source_digest });
  }
  exact(chunks.length, CHUNK_COUNT, "GKX_EVAL_OBSERVATION_CHUNK_COUNT_INVALID");
  const sourceSnapshot = {
    contract_version: PERFORMANCE_SOURCE_SNAPSHOT_VERSION,
    vault_id: PERFORMANCE_VAULT_ID,
    source_count: SOURCE_COUNT,
    sources: sourceRows,
  };
  const chunkSet = {
    contract_version: PERFORMANCE_CHUNK_SET_VERSION,
    vault_id: PERFORMANCE_VAULT_ID,
    chunk_count: CHUNK_COUNT,
    chunks,
  };
  const expectedSnapshot = updated ? UPDATED_SOURCE_SNAPSHOT : INITIAL_SOURCE_SNAPSHOT;
  const expectedChunkSet = updated ? UPDATED_CHUNK_SET : INITIAL_CHUNK_SET;
  const sourceSnapshotJson = stableJson(sourceSnapshot);
  const chunkSetJson = stableJson(chunkSet);
  exact(Buffer.byteLength(sourceSnapshotJson, "utf8"), expectedSnapshot.bytes, "GKX_EVAL_OBSERVATION_SOURCE_SNAPSHOT_SIZE_INVALID");
  exact(retrievalSha256(sourceSnapshotJson), expectedSnapshot.digest, "GKX_EVAL_OBSERVATION_SOURCE_SNAPSHOT_DIGEST_INVALID");
  exact(Buffer.byteLength(chunkSetJson, "utf8"), expectedChunkSet.bytes, "GKX_EVAL_OBSERVATION_CHUNK_SET_SIZE_INVALID");
  exact(retrievalSha256(chunkSetJson), expectedChunkSet.digest, "GKX_EVAL_OBSERVATION_CHUNK_SET_DIGEST_INVALID");
  return Object.freeze({
    updated,
    sources: Object.freeze(sources),
    chunks: Object.freeze(chunks),
    source_snapshot: Object.freeze(sourceSnapshot),
    source_snapshot_digest: expectedSnapshot.digest,
    chunk_set_digest: expectedChunkSet.digest,
  });
}

function generatorMaterial() {
  return {
    source_count: SOURCE_COUNT,
    sections_per_source: SECTIONS_PER_SOURCE,
    chunk_count: CHUNK_COUNT,
    source_uid_prefix: "00000000-0000-4000-8000-",
    source_uid_ordinal_base: 1,
    source_uid_decimal_width: 12,
    source_path_prefix: "phase4-performance/source-",
    source_path_decimal_width: 4,
    source_path_suffix: ".md",
    section_heading_prefix: "# Section ",
    global_section_decimal_width: 5,
    section_body_prefix: "phasefourshared phasefourtoken",
    section_body_suffix: " revisionalpha",
    line_ending: "LF",
    terminal_blank_line: true,
    metadata: {
      title_prefix: "Phase 4 performance ",
      tags: ["phase4-performance"],
      topic: "retrieval",
      category: "qualification",
      authored_at: "2026-08-01T00:00:00Z",
      sensitivity: "public",
      gkx_type: "note",
      epistemic_state: "observation",
      authoritative: true,
    },
    chunking: { max_tokens: 16, overlap_tokens: 0 },
  };
}

export function performanceFixtureMaterial() {
  const material = {
    contract_version: PERFORMANCE_FIXTURE_VERSION,
    generator_contract_version: PERFORMANCE_GENERATOR_VERSION,
    engine_version: "2.1.2",
    retrieval_contract_version: "gkos-retrieval/1.0.0-draft.1",
    chunker_version: "gkos-heading-chunker/1",
    tokenizer_version: "gkos-ascii-whitespace/1",
    vault_id: PERFORMANCE_VAULT_ID,
    generator: generatorMaterial(),
    mutation: {
      global_chunk_ordinal: MUTATED_GLOBAL_ORDINAL,
      source_ordinal: MUTATED_SOURCE_ORDINAL,
      section_ordinal: MUTATED_SECTION_ORDINAL,
      from: "revisionalpha",
      to: "revisionomega",
      changed_content_digest_count: 1,
      changed_source_chunk_record_count: 10,
    },
    initial: {
      source_snapshot_digest: INITIAL_SOURCE_SNAPSHOT.digest,
      chunk_set_digest: INITIAL_CHUNK_SET.digest,
    },
    updated: {
      source_snapshot_digest: UPDATED_SOURCE_SNAPSHOT.digest,
      chunk_set_digest: UPDATED_CHUNK_SET.digest,
    },
  };
  exact(Buffer.byteLength(stableJson(material), "utf8"), 1_783, "GKX_EVAL_OBSERVATION_FIXTURE_SIZE_INVALID");
  exact(retrievalCanonicalDigest(material), PERFORMANCE_FIXTURE_DIGEST, "GKX_EVAL_OBSERVATION_FIXTURE_DIGEST_INVALID");
  return material;
}

export function performanceIndexConfiguration() {
  exact(Buffer.byteLength(stableJson(INDEX_CONFIGURATION), "utf8"), 523, "GKX_EVAL_OBSERVATION_CONFIGURATION_SIZE_INVALID");
  exact(retrievalCanonicalDigest(INDEX_CONFIGURATION), PERFORMANCE_CONFIGURATION_DIGEST, "GKX_EVAL_OBSERVATION_CONFIGURATION_DIGEST_INVALID");
  return structuredClone(INDEX_CONFIGURATION);
}

export function performanceIndexPolicy() {
  exact(retrievalCanonicalDigest(INDEX_POLICY), PERFORMANCE_POLICY_DIGEST, "GKX_EVAL_OBSERVATION_POLICY_DIGEST_INVALID");
  return structuredClone(INDEX_POLICY);
}

export function performanceQueryCycle() {
  const material = {
    contract_version: PERFORMANCE_QUERY_CYCLE_VERSION,
    queries: QUERY_ORDINALS.map((ordinal) => {
      const query_text = `phasefourtoken${String(ordinal).padStart(5, "0")}`;
      return {
        query_id: `phase4-perf-q-${String(ordinal).padStart(5, "0")}`,
        query_text,
        request_id: retrievalSha256(query_text),
      };
    }),
    request: { ...QUERY_REQUEST },
  };
  const query_cycle_digest = retrievalCanonicalDigest(material);
  exact(query_cycle_digest, "sha256:25672a55ebd688cfc2d35680376a352ac2504734af7ebdf40bb9971307bc8a03", "GKX_EVAL_OBSERVATION_QUERY_CYCLE_DIGEST_INVALID");
  return { ...material, query_cycle_digest };
}

function queryWork(phase, cycleRepeatCount, expectedDigest, expectedSequenceDigest) {
  const cycle = performanceQueryCycle();
  const attemptCount = cycle.queries.length * cycleRepeatCount;
  const material = {
    contract_version: PERFORMANCE_QUERY_WORK_VERSION,
    phase,
    query_cycle_digest: cycle.query_cycle_digest,
    cycle_repeat_count: cycleRepeatCount,
    attempt_count: attemptCount,
    embedding_call_count: attemptCount,
    embedding_item_count: attemptCount,
    request_id_sequence_digest: expectedSequenceDigest,
    fts_query_stage_count: attemptCount,
    reranker_call_count: 0,
    reranker_item_count: 0,
    query_cache_hit_count: 0,
    result_stage_expectation: structuredClone(RESULT_STAGE_EXPECTATION),
  };
  exact(retrievalCanonicalDigest(material), expectedDigest, "GKX_EVAL_OBSERVATION_QUERY_WORK_DIGEST_INVALID");
  return { ...material, query_work_digest: expectedDigest };
}

export function performanceSamplePlan() {
  const fixture = performanceFixtureMaterial();
  const queryCycle = performanceQueryCycle();
  const material = {
    contract_version: PERFORMANCE_SAMPLE_PLAN_VERSION,
    fixture: {
      fixture_contract_version: PERFORMANCE_FIXTURE_VERSION,
      fixture_digest: PERFORMANCE_FIXTURE_DIGEST,
      generator_contract_version: PERFORMANCE_GENERATOR_VERSION,
      vault_id: PERFORMANCE_VAULT_ID,
      source_count: SOURCE_COUNT,
      sections_per_source: SECTIONS_PER_SOURCE,
      chunk_count: CHUNK_COUNT,
      mutation: structuredClone(fixture.mutation),
      initial: structuredClone(fixture.initial),
      updated: structuredClone(fixture.updated),
    },
    indexing: {
      index_coordinate_contract_version: "gkos-retrieval-evaluation-performance-index-coordinate/1.0.0",
      engine_version: "2.1.2",
      retrieval_contract_version: "gkos-retrieval/1.0.0-draft.1",
      projection_schema_version: 2,
      vault_id: PERFORMANCE_VAULT_ID,
      chunker_version: "gkos-heading-chunker/1",
      tokenizer_version: "gkos-ascii-whitespace/1",
      lexical_backend: "sqlite_fts5",
      configuration_preimage: performanceIndexConfiguration(),
      configuration_digest: PERFORMANCE_CONFIGURATION_DIGEST,
      policy_preimage: performanceIndexPolicy(),
      policy_digest: PERFORMANCE_POLICY_DIGEST,
      batching: { max_items: 32, max_utf8_bytes: 262_144, content_digest_deduplication: true },
      initial: structuredClone(EXPECTED_INDEX.initial),
      incremental_update: structuredClone(EXPECTED_INDEX.incremental_update),
      clean_rebuild: structuredClone(EXPECTED_INDEX.clean_rebuild),
    },
    embedding_provider: {
      provider_kind: "local_onnx",
      provider_id: "phase4-observation-local",
      model_id: "phase4-observation-constant-v1",
      dimensions: 4,
      timeout_ms: 30_000,
      response_vector: [1, 0, 0, 0],
    },
    query_cycle: queryCycle,
    execution: {
      warmup_round_count: 1,
      warmup_count: 10,
      measured_round_count: 5,
      sample_count: 50,
      clean_rebuild_comparison_round_count: 1,
      incremental_query_work: queryWork(
        "incremental_observation",
        6,
        "sha256:4ced5909b5031871b9d4155cf9a691ae92dc3033a59efa973fbbd08757086905",
        "sha256:ee1ab2d1307bb1789a4aeecc54c40eefc9f8dab25184068dd9e96a4fc01ed7cc",
      ),
      clean_rebuild_query_work: queryWork(
        "clean_rebuild_comparison",
        1,
        "sha256:139557a622cf31cb08af1b2339a509d39e69f7a265ea9147248335e8a580973e",
        "sha256:c0e95ed6ee5752401913cc3ed1cb3bcdf85b29f942870acee20d5621ed14a812",
      ),
      total_query_embedding_call_count: 70,
      total_query_embedding_item_count: 70,
      total_fts_query_stage_count: 70,
      total_reranker_call_count: 0,
      total_reranker_item_count: 0,
      total_query_cache_hit_count: 0,
    },
    percentile: {
      method: "nearest_rank",
      sort: "ascending_integer_micros",
      p50: { percentile_micros: 500_000, rank: 25, index: 24 },
      p95: { percentile_micros: 950_000, rank: 48, index: 47 },
      p99: { percentile_micros: 990_000, rank: 50, index: 49 },
      p95_strict_upper_bound_micros: 500_000,
    },
    convergence: {
      manifest_comparison: "canonical_stable_json_byte_equality",
      database_bytes_compared: false,
      result_comparison_query_count: 10,
      result_set_contract_version: PERFORMANCE_RESULT_SET_VERSION,
    },
  };
  const json = stableJson(material);
  exact(Buffer.byteLength(json, "utf8"), 9_449, "GKX_EVAL_OBSERVATION_SAMPLE_PLAN_SIZE_INVALID");
  exact(retrievalSha256(json), PERFORMANCE_SAMPLE_PLAN_DIGEST, "GKX_EVAL_OBSERVATION_SAMPLE_PLAN_DIGEST_INVALID");
  return { ...material, sample_plan_digest: PERFORMANCE_SAMPLE_PLAN_DIGEST };
}

export function indexRequestSequenceDigest(phase, requests) {
  return retrievalCanonicalDigest({
    contract_version: PERFORMANCE_INDEX_REQUEST_SEQUENCE_VERSION,
    phase,
    requests,
  });
}

export function queryAttemptSetDigest(phase, attempts) {
  return retrievalCanonicalDigest({
    contract_version: PERFORMANCE_QUERY_ATTEMPT_SET_VERSION,
    phase,
    attempts,
  });
}

export function resultSetDigest(results) {
  return retrievalCanonicalDigest({
    contract_version: PERFORMANCE_RESULT_SET_VERSION,
    results,
  });
}

export function sampleVectorDigest(samplesMicros) {
  return retrievalCanonicalDigest({
    contract_version: PERFORMANCE_SAMPLE_VECTOR_VERSION,
    sample_count: 50,
    samples_micros: samplesMicros,
  });
}

export function expectedPerformanceCoordinates() {
  return Object.freeze({
    source_count: SOURCE_COUNT,
    chunk_count: CHUNK_COUNT,
    initial_source_snapshot: INITIAL_SOURCE_SNAPSHOT,
    updated_source_snapshot: UPDATED_SOURCE_SNAPSHOT,
    initial_chunk_set: INITIAL_CHUNK_SET,
    updated_chunk_set: UPDATED_CHUNK_SET,
    index: EXPECTED_INDEX,
    stage: RESULT_STAGE_EXPECTATION,
  });
}
