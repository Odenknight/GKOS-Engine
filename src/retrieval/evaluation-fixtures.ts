import { types as utilTypes } from "node:util";
import { isValidGkxAuthoredUid } from "../gkx23";
import { extensionFromPath, isNotePath } from "../paths";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, retrievalSha256, stableJson } from "./digest";
import {
  RETRIEVAL_EVALUATION_TUNING_GRID_COORDINATE,
  sealNormalizedRetrievalEvaluationGolden,
  sealRetrievalEvaluationEnvironmentCoordinate,
  sealRetrievalEvaluationEnvironmentSet,
  isValidRetrievalEvaluationSourcePath,
  isValidRetrievalEvaluationOpaqueIdentity,
  retrievalEvaluationEffectiveQueryText,
  sealRetrievalEvaluationTuningAxesCoordinate,
  sealRetrievalEvaluationTuningGridCoordinate,
  type NormalizedRetrievalEvaluationGolden,
  type RetrievalEvaluationEnvironmentCoordinate,
  type RetrievalEvaluationEnvironmentSet,
  type RetrievalEvaluationTuningAxesCoordinate,
  type RetrievalEvaluationTuningGridCoordinate,
} from "./evaluation";
import { assertRetrievalProjectionManifest, isGkxRetrievalProjectionManifest } from "./manifest";
import { projectAuthoredGkxRetrievalCorpus } from "./gkx-provenance";
import { chunkMarkdown } from "./chunker";
import {
  bindGkxRetrievalCandidateChunks,
  type GkxRetrievalCandidateChunk,
  type GkxRetrievalCandidateSource,
} from "./candidate-types";
import { buildGkxRetrievalAuthorizedCandidateView } from "./authorized-view";
import { deriveGkxRetrievalProjectionManifest } from "./sqlite-store";
import type { AnyRetrievalProjectionManifest, GkxRetrievalProjectionManifest } from "./types";

export const RETRIEVAL_EVALUATION_FIXED_PROVIDER_VERSION = "gkos-retrieval-evaluation-fixed-provider/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_FIXTURE_CATALOG_VERSION = "gkos-retrieval-evaluation-fixture-catalog/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_RUNTIME_POLICY_INPUTS_VERSION = "gkos-retrieval-evaluation-runtime-policy-inputs/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_AUDIT_ORACLE_VERSION = "gkos-retrieval-evaluation-audit-oracle/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_FIXED_PROVIDER_SCHEDULE_VERSION = "gkos-retrieval-evaluation-fixed-provider-schedule/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_FIXED_PROVIDER_SCOPE_VERSION = "gkos-retrieval-evaluation-provider-scope/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_FIXED_PROVIDER_REQUEST_VERSION = "gkos-retrieval-evaluation-provider-request/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_FIXED_PROVIDER_OCCURRENCE_MATRIX_VERSION = "gkos-retrieval-evaluation-provider-occurrence-matrix/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_SOURCE_SNAPSHOT_VERSION = "gkos-retrieval-evaluation-source-snapshot/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_SOURCE_CORPUS_VERSION = "gkos-retrieval-evaluation-source-corpus/1.0.0-draft.1" as const;

const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PROVIDER_KINDS = ["openai_compatible", "local_onnx", "mcp"] as const;

export interface RetrievalEvaluationFixedEmbeddingResponse {
  input_digest: string;
  accepted_chunk_id: string | null;
  values_micros: number[];
}

export interface RetrievalEvaluationFixedEmbeddingIndexTemplate {
  template_id: string;
  phase: "index";
  embedding_call_ordinal: number;
  batch_offset: number;
  request_id: string;
  chunk_inputs: Array<{ accepted_chunk_id: string; input_digest: string }>;
  item_count: number;
  outcome: "success";
  responses: RetrievalEvaluationFixedEmbeddingResponse[];
  error_code: null;
  expected_vector_stage: { state: "active"; reason_codes: [] };
  template_digest: string;
}

export interface RetrievalEvaluationFixedEmbeddingQueryTemplate {
  template_id: string;
  phase: "evaluation";
  query_id: string;
  query_digest: string;
  effective_query_text: string;
  query_input_digest: string;
  request_id: string;
  item_count: 1;
  outcome: "success" | "failure";
  responses: RetrievalEvaluationFixedEmbeddingResponse[];
  error_code: "FIXED_EMBEDDING_FAILURE" | null;
  expected_vector_stage: { state: "active" | "degraded"; reason_codes: string[] };
  template_digest: string;
}

export interface RetrievalEvaluationFixedRerankQueryOracle {
  template_id: string;
  phase: "evaluation";
  query_id: string;
  query_digest: string;
  effective_query_text: string;
  query_input_digest: string;
  request_id: string;
  candidate_score_universe: Array<{ candidate_chunk_id: string; input_digest: string; score_micros: number }>;
  outcome: "success" | "failure";
  error_code: "FIXED_RERANKER_FAILURE" | null;
  expected_reranker_stage: { state: "active" | "degraded"; reason_codes: string[] };
  template_digest: string;
}

export type RetrievalEvaluationFixedProviderOccurrenceCell = readonly [
  embedding_query_call: 0 | 1,
  reranker_request_digest: string | null,
  reranker_item_count: number | null,
];

export interface RetrievalEvaluationFixedProviderCounters {
  vector_provider_call_count: number;
  vector_provider_item_count: number;
  rerank_provider_call_count: number;
  rerank_provider_item_count: number;
}

interface RetrievalEvaluationFixedProviderScheduleCommon {
  contract_version: typeof RETRIEVAL_EVALUATION_FIXED_PROVIDER_SCHEDULE_VERSION;
  operation: "eval" | "tune";
  normalized_golden_digest: string;
  query_partition: Array<{ query_id: string; query_digest: string }>;
  query_count: number;
  query_evaluation_count: number;
  occurrence_encoding: "implicit_axes_outer_query_inner_v1";
  occurrence_matrix: RetrievalEvaluationFixedProviderOccurrenceCell[];
  occurrence_matrix_digest: string;
  template_occurrences: Array<{ template_id: string; occurrence_count: number }>;
  reranker_oracle_coverage: Array<{ reranker_query_oracle_id: string; used_candidate_chunk_ids: string[] }>;
  expected_provider_counters: RetrievalEvaluationFixedProviderCounters;
  schedule_digest: string;
}

export interface RetrievalEvaluationFixedProviderEvalSchedule extends RetrievalEvaluationFixedProviderScheduleCommon {
  operation: "eval";
  evaluation_axes: RetrievalEvaluationTuningAxesCoordinate;
}

export interface RetrievalEvaluationFixedProviderTuneSchedule extends RetrievalEvaluationFixedProviderScheduleCommon {
  operation: "tune";
  tuning_grid: RetrievalEvaluationTuningGridCoordinate;
  maximum_expected_top_k: number;
  eligible_tuning_axes: RetrievalEvaluationTuningAxesCoordinate[];
  evaluated_candidate_count: number;
  excluded_candidate_count: number;
}

export type RetrievalEvaluationFixedProviderSchedule = RetrievalEvaluationFixedProviderEvalSchedule | RetrievalEvaluationFixedProviderTuneSchedule;

export interface RetrievalEvaluationFixedProviderScope {
  contract_version: typeof RETRIEVAL_EVALUATION_FIXED_PROVIDER_SCOPE_VERSION;
  vault_fixture: string;
  lexical_backend: "sqlite_fts5" | "sqlite_lexical_scan";
  normalized_golden_digest: string;
  normalized_golden_query_count: number;
  corpus_fixture_digest: string;
  source_snapshot_digest: string;
  runtime_policy_inputs_digest: string;
  evaluation_audit_oracle_digest: string;
  projection_id: string;
  projection_digest: string;
  embedding_role: { state: "disabled"; provider_scenario_id: "disabled"; provider_kind: null; provider_id: null; model_id: null; dimensions: null } |
    { state: "active"; provider_scenario_id: string; provider_kind: "openai_compatible" | "local_onnx" | "mcp"; provider_id: string; model_id: string; dimensions: number };
  reranker_role: { state: "disabled"; provider_scenario_id: "disabled"; provider_kind: null; provider_id: null; model_id: null } |
    { state: "active"; provider_scenario_id: string; provider_kind: "openai_compatible" | "local_onnx" | "mcp"; provider_id: string; model_id: string };
  environment_scope_digest: string;
}

export interface RetrievalEvaluationFixedProviderScenario {
  embedding_provider_scenario_id: string;
  reranker_provider_scenario_id: string;
  environment_scope: RetrievalEvaluationFixedProviderScope;
  embedding_role: "active" | "disabled";
  reranker_role: "active" | "disabled";
  embedding_index_templates: RetrievalEvaluationFixedEmbeddingIndexTemplate[];
  embedding_query_templates: RetrievalEvaluationFixedEmbeddingQueryTemplate[];
  reranker_query_oracles: RetrievalEvaluationFixedRerankQueryOracle[];
  eval_schedule: RetrievalEvaluationFixedProviderEvalSchedule;
  tune_schedule: RetrievalEvaluationFixedProviderTuneSchedule | null;
  disabled_vector_stage: { state: "disabled"; reason_codes: ["VECTOR_DISABLED"] } | null;
  disabled_reranker_stage: { state: "skipped"; reason_codes: ["RERANKER_NOT_CONFIGURED"] } | null;
  scenario_digest: string;
}

export interface RetrievalEvaluationSourceSnapshot {
  contract_version: typeof RETRIEVAL_EVALUATION_SOURCE_SNAPSHOT_VERSION;
  source_observations: Array<{ source_id: string; source_path: string; source_digest: string }>;
  source_snapshot_digest: string;
}

export interface RetrievalEvaluationSourceCorpus {
  contract_version: typeof RETRIEVAL_EVALUATION_SOURCE_CORPUS_VERSION;
  corpora: Array<{
    vault_fixture: string;
    source_files: Array<{
      source_id: string;
      source_path: string;
      source_digest: string;
      source_bytes_base64: string;
    }>;
    corpus_fixture_digest: string;
  }>;
  source_corpus_digest: string;
}

export interface RetrievalEvaluationFixedProviderTranscript {
  contract_version: typeof RETRIEVAL_EVALUATION_FIXED_PROVIDER_VERSION;
  provider_fixture_id: string;
  adapter_backend: "fixed_offline";
  embedding_provider: { provider_kind: "openai_compatible" | "local_onnx" | "mcp"; provider_id: string; model_id: string; dimensions: number };
  reranker_provider: { provider_kind: "openai_compatible" | "local_onnx" | "mcp"; provider_id: string; model_id: string };
  scenarios: RetrievalEvaluationFixedProviderScenario[];
  network: false;
  secrets: false;
  provider_fixture_digest: string;
}

export interface RetrievalEvaluationRuntimePolicyInputs {
  contract_version: typeof RETRIEVAL_EVALUATION_RUNTIME_POLICY_INPUTS_VERSION;
  source_discoverability: Array<{ source_id: string; source_path: string; discoverable: boolean }>;
  chunk_discoverability: Array<{ chunk_id: string; source_id: string; discoverable: boolean }>;
  runtime_policy_inputs_digest: string;
}

export interface RetrievalEvaluationCatalogAuditOracle {
  contract_version: typeof RETRIEVAL_EVALUATION_AUDIT_ORACLE_VERSION;
  authorized_source_ids: string[];
  authorized_source_paths: string[];
  forbidden_source_ids: string[];
  forbidden_source_paths: string[];
  authorized_endpoint_ids: string[];
  forbidden_endpoint_ids: string[];
  evaluation_audit_oracle_digest: string;
}

export interface RetrievalEvaluationFixtureCatalog {
  contract_version: typeof RETRIEVAL_EVALUATION_FIXTURE_CATALOG_VERSION;
  fixture_catalog_id: string;
  entries: Array<{
    vault_fixture: string;
    source_corpus_file: "source-corpus.json";
    corpus_fixture_digest: string;
    source_snapshot: RetrievalEvaluationSourceSnapshot;
    runtime_policy_inputs: RetrievalEvaluationRuntimePolicyInputs;
    evaluation_audit_oracle: RetrievalEvaluationCatalogAuditOracle;
    fixed_provider_transcript_digest: string | null;
    embedding_provider_scenario_id: string;
    reranker_provider_scenario_id: string;
    backend: "sqlite_fts5" | "sqlite_lexical_scan";
    entry_digest: string;
  }>;
  catalog_digest: string;
}

export interface RetrievalEvaluationEnvironmentBundle {
  environment_set: RetrievalEvaluationEnvironmentSet;
  normalized_golden: NormalizedRetrievalEvaluationGolden;
  fixture_catalog: RetrievalEvaluationFixtureCatalog;
  source_corpus: RetrievalEvaluationSourceCorpus;
  fixed_provider_transcript: RetrievalEvaluationFixedProviderTranscript | null;
  projection_manifests: AnyRetrievalProjectionManifest[];
}

function failure(code: string): never { throw new TypeError(code); }
function digest(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) failure(code);
}
function boundedId(value: unknown): value is string {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") >= 1 && Buffer.byteLength(value, "utf8") <= 128 && ID_RE.test(value);
}
function exactKeys(value: Record<string, unknown>, fields: readonly string[], code: string): void {
  if (stableJson(Object.keys(value).sort(retrievalCodeUnitCompare)) !== stableJson([...fields].sort(retrievalCodeUnitCompare))) failure(code);
}
function clone<T>(value: T): T {
  let nodes = 0;
  let canonicalBytes = 0;
  const addBytes = (count: number) => {
    canonicalBytes += count;
    if (canonicalBytes > 8 * 1024 * 1024) failure("GKX_EVAL_FIXTURE_SIZE_INVALID");
  };
  const visit = (item: unknown, depth: number, ancestors: Set<object>): void => {
    if (++nodes > 10_000_000 || depth > 24) failure("GKX_EVAL_FIXTURE_BOUND_INVALID");
    if (item === null || typeof item === "string" || typeof item === "boolean" || typeof item === "number") {
      addBytes(Buffer.byteLength(JSON.stringify(typeof item === "number" && Object.is(item, -0) ? 0 : item), "utf8"));
      return;
    }
    if (typeof item !== "object" || utilTypes.isProxy(item) || ancestors.has(item)) failure("GKX_EVAL_FIXTURE_DATA_INVALID");
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        const length = Object.getOwnPropertyDescriptor(item, "length");
        const keys = Reflect.ownKeys(item);
        if (!length || !("value" in length) || !Number.isSafeInteger(length.value) || length.value > 27_000 || Object.keys(item).length !== length.value ||
            keys.length !== length.value + 1 || keys.some((key) => typeof key !== "string" || key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key))) {
          failure("GKX_EVAL_FIXTURE_ARRAY_INVALID");
        }
        addBytes(2 + Math.max(0, length.value - 1));
        for (let index = 0; index < length.value; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
          if (!descriptor?.enumerable || !("value" in descriptor)) failure("GKX_EVAL_FIXTURE_ARRAY_INVALID");
          visit(descriptor.value, depth + 1, ancestors);
        }
      } else {
        const prototype = Object.getPrototypeOf(item);
        const keys = Reflect.ownKeys(item);
        if (prototype !== Object.prototype && prototype !== null || keys.length > 128 || keys.some((key) => typeof key !== "string")) failure("GKX_EVAL_FIXTURE_OBJECT_INVALID");
        addBytes(2 + Math.max(0, keys.length - 1));
        for (const key of keys as string[]) {
          const descriptor = Object.getOwnPropertyDescriptor(item, key);
          if (!descriptor?.enumerable || !("value" in descriptor)) failure("GKX_EVAL_FIXTURE_OBJECT_INVALID");
          addBytes(Buffer.byteLength(JSON.stringify(key), "utf8") + 1);
          visit(descriptor.value, depth + 1, ancestors);
        }
      }
    } finally { ancestors.delete(item); }
  };
  visit(value, 0, new Set());
  return JSON.parse(stableJson(value)) as T;
}
function sortedUniqueStrings(value: unknown, maximum: number, validator: (item: string) => boolean, code: string): string[] {
  if (!Array.isArray(value) || value.length > maximum || value.some((item) => typeof item !== "string" || !validator(item))) failure(code);
  const sorted = [...value].sort(retrievalCodeUnitCompare);
  if (new Set(sorted).size !== sorted.length || stableJson(value) !== stableJson(sorted)) failure(code);
  return value;
}
function uniqueStrings(value: unknown, maximum: number, validator: (item: string) => boolean, code: string): string[] {
  if (!Array.isArray(value) || value.length > maximum || value.some((item) => typeof item !== "string" || !validator(item)) ||
      new Set(value).size !== value.length) failure(code);
  return value;
}
function identity(value: unknown, code: string): asserts value is string {
  if (!isValidRetrievalEvaluationOpaqueIdentity(value)) failure(code);
}
function metricDigest(value: Record<string, unknown>, field: string): string {
  const material = { ...value };
  delete material[field];
  return retrievalCanonicalDigest(material);
}

function sourceCorpusDataRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) failure(code);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") failure(code);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) failure(code);
  }
  return value as Record<string, unknown>;
}

function sourceCorpusDenseArray(value: unknown, maximum: number, code: string): unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) failure(code);
  const length = Object.getOwnPropertyDescriptor(value, "length");
  if (!length || !("value" in length) || !Number.isSafeInteger(length.value) || length.value < 0 || length.value > maximum ||
      Reflect.ownKeys(value).length !== length.value + 1 || Object.keys(value).length !== length.value) failure(code);
  for (let index = 0; index < length.value; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) failure(code);
  }
  return value;
}

function sourceCorpusCanonicalBytes(value: unknown, key: string | null = null): number {
  if (typeof value === "string") {
    return key === "source_bytes_base64" ? value.length + 2 : Buffer.byteLength(JSON.stringify(value), "utf8");
  }
  if (Array.isArray(value)) {
    let total = 2 + Math.max(0, value.length - 1);
    for (let index = 0; index < value.length; index++) total += sourceCorpusCanonicalBytes(Object.getOwnPropertyDescriptor(value, String(index))!.value);
    return total;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort(retrievalCodeUnitCompare);
  let total = 2 + Math.max(0, keys.length - 1);
  for (const field of keys) {
    total += Buffer.byteLength(JSON.stringify(field), "utf8") + 1 +
      sourceCorpusCanonicalBytes(Object.getOwnPropertyDescriptor(record, field)!.value, field);
  }
  return total;
}

function preflightSourceCorpus(value: unknown): number {
  const top = sourceCorpusDataRecord(value, "GKX_EVAL_SOURCE_CORPUS_DATA_INVALID");
  exactKeys(top, ["contract_version", "corpora", "source_corpus_digest"], "GKX_EVAL_SOURCE_CORPUS_FIELDS_INVALID");
  if (top.contract_version !== RETRIEVAL_EVALUATION_SOURCE_CORPUS_VERSION) {
    failure("GKX_EVAL_SOURCE_CORPUS_COORDINATE_INVALID");
  }
  if (typeof top.source_corpus_digest !== "string" || top.source_corpus_digest.length !== 71 ||
      !SHA256_RE.test(top.source_corpus_digest)) failure("GKX_EVAL_SOURCE_CORPUS_DIGEST_INVALID");
  const corpora = sourceCorpusDenseArray(top.corpora, 256, "GKX_EVAL_SOURCE_CORPUS_COORDINATE_INVALID");
  if (corpora.length < 1) failure("GKX_EVAL_SOURCE_CORPUS_COORDINATE_INVALID");
  let estimatedDecodedTotal = 0;
  for (const raw of corpora) {
    const corpus = sourceCorpusDataRecord(raw, "GKX_EVAL_SOURCE_CORPUS_ENTRY_INVALID");
    exactKeys(corpus, ["vault_fixture", "source_files", "corpus_fixture_digest"], "GKX_EVAL_SOURCE_CORPUS_ENTRY_FIELDS_INVALID");
    if (!boundedId(corpus.vault_fixture)) failure("GKX_EVAL_SOURCE_CORPUS_ENTRY_INVALID");
    if (typeof corpus.corpus_fixture_digest !== "string" || corpus.corpus_fixture_digest.length !== 71 ||
        !SHA256_RE.test(corpus.corpus_fixture_digest)) failure("GKX_EVAL_SOURCE_CORPUS_ENTRY_DIGEST_INVALID");
    const files = sourceCorpusDenseArray(corpus.source_files, 4_096, "GKX_EVAL_SOURCE_CORPUS_ENTRY_INVALID");
    if (files.length < 1) failure("GKX_EVAL_SOURCE_CORPUS_ENTRY_INVALID");
    for (const sourceRaw of files) {
      const source = sourceCorpusDataRecord(sourceRaw, "GKX_EVAL_SOURCE_CORPUS_FILE_INVALID");
      exactKeys(source, ["source_id", "source_path", "source_digest", "source_bytes_base64"], "GKX_EVAL_SOURCE_CORPUS_FILE_FIELDS_INVALID");
      if (!isValidGkxAuthoredUid(source.source_id) || typeof source.source_path !== "string" || source.source_path.length > 1_024 ||
          !isValidRetrievalEvaluationSourcePath(source.source_path)) failure("GKX_EVAL_SOURCE_CORPUS_FILE_INVALID");
      if (typeof source.source_digest !== "string" || source.source_digest.length !== 71 || !SHA256_RE.test(source.source_digest)) {
        failure("GKX_EVAL_SOURCE_CORPUS_FILE_DIGEST_INVALID");
      }
      if (typeof source.source_bytes_base64 !== "string" || source.source_bytes_base64.length > 4 * Math.ceil((64 * 1024 * 1024) / 3) ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(source.source_bytes_base64)) {
        failure("GKX_EVAL_SOURCE_CORPUS_FILE_BYTES_INVALID");
      }
      const padding = source.source_bytes_base64.endsWith("==") ? 2 : source.source_bytes_base64.endsWith("=") ? 1 : 0;
      const estimated = source.source_bytes_base64.length / 4 * 3 - padding;
      if (!Number.isSafeInteger(estimated) || estimated < 0 || estimated > 64 * 1024 * 1024) failure("GKX_EVAL_SOURCE_CORPUS_FILE_BYTES_INVALID");
      estimatedDecodedTotal += estimated;
      if (estimatedDecodedTotal > 512 * 1024 * 1024) failure("GKX_EVAL_SOURCE_CORPUS_TOTAL_SIZE_INVALID");
    }
  }
  const canonicalBytes = sourceCorpusCanonicalBytes(value);
  if (canonicalBytes > 768 * 1024 * 1024) failure("GKX_EVAL_SOURCE_CORPUS_SERIALIZED_SIZE_INVALID");
  return canonicalBytes;
}

function sealExpectedProviderStage(value: unknown, family: "vector" | "reranker", outcome: "success" | "failure"): void {
  const item = value as Record<string, unknown>;
  exactKeys(item, ["state", "reason_codes"], "GKX_EVAL_FIXED_PROVIDER_STAGE_FIELDS_INVALID");
  const expected = outcome === "success" ? { state: "active", reason_codes: [] }
    : { state: "degraded", reason_codes: [family === "vector" ? "VECTOR_UNAVAILABLE" : "RERANKER_UNAVAILABLE"] };
  if (stableJson(item) !== stableJson(expected)) failure("GKX_EVAL_FIXED_PROVIDER_STAGE_RELATION_INVALID");
}

function sealEmbeddingResponses(
  value: unknown,
  dimensions: number,
  inputs: ReadonlyArray<{ input_digest: string; accepted_chunk_id: string | null }>,
  outcome: "success" | "failure",
): RetrievalEvaluationFixedEmbeddingResponse[] {
  if (!Array.isArray(value) || value.length > 4_096) failure("GKX_EVAL_FIXED_EMBED_RESPONSE_INVALID");
  const responses = value.map((raw, index) => {
    const response = raw as Record<string, unknown>;
    exactKeys(response, ["input_digest", "accepted_chunk_id", "values_micros"], "GKX_EVAL_FIXED_EMBED_RESPONSE_FIELDS_INVALID");
    if (!inputs[index] || response.input_digest !== inputs[index].input_digest || response.accepted_chunk_id !== inputs[index].accepted_chunk_id ||
        !Array.isArray(response.values_micros) || response.values_micros.length !== dimensions ||
        response.values_micros.some((entry) => !Number.isSafeInteger(entry) || entry < -1_000_000 || entry > 1_000_000)) {
      failure("GKX_EVAL_FIXED_EMBED_RESPONSE_INVALID");
    }
    return response as unknown as RetrievalEvaluationFixedEmbeddingResponse;
  });
  if (outcome === "success" ? responses.length !== inputs.length : responses.length !== 0) failure("GKX_EVAL_FIXED_EMBED_OUTCOME_INVALID");
  return responses;
}

function sealProviderScopeRole(value: unknown, family: "embedding" | "reranker"): RetrievalEvaluationFixedProviderScope["embedding_role"] | RetrievalEvaluationFixedProviderScope["reranker_role"] {
  const role = value as Record<string, unknown>;
  exactKeys(role, family === "embedding" ? ["state", "provider_scenario_id", "provider_kind", "provider_id", "model_id", "dimensions"] :
    ["state", "provider_scenario_id", "provider_kind", "provider_id", "model_id"], "GKX_EVAL_FIXED_PROVIDER_SCOPE_ROLE_FIELDS_INVALID");
  if (role.state === "disabled") {
    if (role.provider_scenario_id !== "disabled" || role.provider_kind !== null || role.provider_id !== null || role.model_id !== null ||
        family === "embedding" && role.dimensions !== null) {
      failure("GKX_EVAL_FIXED_PROVIDER_SCOPE_ROLE_DISABLED_INVALID");
    }
  } else if (role.state === "active") {
    if (!boundedId(role.provider_scenario_id) || role.provider_scenario_id === "disabled") failure("GKX_EVAL_FIXED_PROVIDER_SCOPE_ROLE_SCENARIO_INVALID");
    if (!PROVIDER_KINDS.includes(role.provider_kind as never)) failure("GKX_EVAL_FIXED_PROVIDER_SCOPE_ROLE_KIND_INVALID");
    identity(role.provider_id, "GKX_EVAL_FIXED_PROVIDER_SCOPE_ROLE_IDENTITY_INVALID");
    identity(role.model_id, "GKX_EVAL_FIXED_PROVIDER_SCOPE_ROLE_IDENTITY_INVALID");
    if (family === "embedding" && (!Number.isSafeInteger(role.dimensions) || (role.dimensions as number) < 1 || (role.dimensions as number) > 4_096)) {
      failure("GKX_EVAL_FIXED_PROVIDER_SCOPE_DIMENSIONS_INVALID");
    }
  } else failure("GKX_EVAL_FIXED_PROVIDER_SCOPE_ROLE_STATE_INVALID");
  return role as unknown as RetrievalEvaluationFixedProviderScope["embedding_role"] | RetrievalEvaluationFixedProviderScope["reranker_role"];
}

function sealProviderScope(value: unknown): RetrievalEvaluationFixedProviderScope {
  const item = value as Record<string, unknown>;
  exactKeys(item, ["contract_version", "vault_fixture", "lexical_backend", "normalized_golden_digest", "normalized_golden_query_count", "corpus_fixture_digest", "source_snapshot_digest",
    "runtime_policy_inputs_digest", "evaluation_audit_oracle_digest", "projection_id", "projection_digest", "embedding_role", "reranker_role",
    "environment_scope_digest"], "GKX_EVAL_FIXED_PROVIDER_SCOPE_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_FIXED_PROVIDER_SCOPE_VERSION || !boundedId(item.vault_fixture) ||
      !["sqlite_fts5", "sqlite_lexical_scan"].includes(item.lexical_backend as string) ||
      !Number.isSafeInteger(item.normalized_golden_query_count) || (item.normalized_golden_query_count as number) < 1 ||
      (item.normalized_golden_query_count as number) > 256) failure("GKX_EVAL_FIXED_PROVIDER_SCOPE_COORDINATE_INVALID");
  for (const field of ["normalized_golden_digest", "corpus_fixture_digest", "source_snapshot_digest", "runtime_policy_inputs_digest",
    "evaluation_audit_oracle_digest", "projection_digest", "environment_scope_digest"] as const) digest(item[field], "GKX_EVAL_FIXED_PROVIDER_SCOPE_DIGEST_INVALID");
  if (item.projection_id !== `retrieval:${(item.projection_digest as string).slice(7, 31)}`) failure("GKX_EVAL_FIXED_PROVIDER_SCOPE_PROJECTION_INVALID");
  item.embedding_role = sealProviderScopeRole(item.embedding_role, "embedding");
  item.reranker_role = sealProviderScopeRole(item.reranker_role, "reranker");
  if (metricDigest(item, "environment_scope_digest") !== item.environment_scope_digest) failure("GKX_EVAL_FIXED_PROVIDER_SCOPE_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationFixedProviderScope;
}

function sealEmbeddingIndexTemplate(value: unknown, dimensions: number, expectedOrdinal: number, expectedOffset: number): RetrievalEvaluationFixedEmbeddingIndexTemplate {
  const item = value as Record<string, unknown>;
  exactKeys(item, ["template_id", "phase", "embedding_call_ordinal", "batch_offset", "request_id", "chunk_inputs", "item_count", "outcome", "responses", "error_code", "expected_vector_stage", "template_digest"], "GKX_EVAL_FIXED_EMBED_INDEX_FIELDS_INVALID");
  if (!boundedId(item.template_id) || item.phase !== "index" || item.embedding_call_ordinal !== expectedOrdinal || item.batch_offset !== expectedOffset ||
      !Number.isSafeInteger(item.item_count) || (item.item_count as number) < 1 || (item.item_count as number) > 32 || item.outcome !== "success" ||
      !Array.isArray(item.chunk_inputs) || item.chunk_inputs.length !== item.item_count || item.error_code !== null) failure("GKX_EVAL_FIXED_EMBED_INDEX_INVALID");
  const inputs = (item.chunk_inputs as unknown[]).map((raw) => {
    const input = raw as Record<string, unknown>;
    exactKeys(input, ["accepted_chunk_id", "input_digest"], "GKX_EVAL_FIXED_EMBED_INDEX_INPUT_FIELDS_INVALID");
    if (!SHA256_RE.test(input.accepted_chunk_id as string) || !SHA256_RE.test(input.input_digest as string)) failure("GKX_EVAL_FIXED_EMBED_INDEX_INPUT_INVALID");
    return input as unknown as { accepted_chunk_id: string; input_digest: string };
  });
  if (new Set(inputs.map((input) => input.accepted_chunk_id)).size !== inputs.length || new Set(inputs.map((input) => input.input_digest)).size !== inputs.length ||
      item.request_id !== retrievalSha256(`index\0${expectedOffset}\0${inputs.map((input) => input.input_digest).join("\0")}`)) {
    failure("GKX_EVAL_FIXED_EMBED_INDEX_INPUT_RELATION_INVALID");
  }
  sealEmbeddingResponses(item.responses, dimensions, inputs, "success");
  sealExpectedProviderStage(item.expected_vector_stage, "vector", "success");
  digest(item.template_digest, "GKX_EVAL_FIXED_PROVIDER_TEMPLATE_DIGEST_INVALID");
  if (metricDigest(item, "template_digest") !== item.template_digest) failure("GKX_EVAL_FIXED_PROVIDER_TEMPLATE_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationFixedEmbeddingIndexTemplate;
}

function validQueryText(value: unknown): value is string {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") >= 1 && Buffer.byteLength(value, "utf8") <= 4_096 && !/[\u0000-\u001f\u007f]/u.test(value);
}

function embeddingRequestDigest(template: RetrievalEvaluationFixedEmbeddingQueryTemplate): string {
  return retrievalCanonicalDigest({
    contract_version: RETRIEVAL_EVALUATION_FIXED_PROVIDER_REQUEST_VERSION,
    call_kind: "embedding_query",
    request_id: template.request_id,
    query_id: template.query_id,
    query_digest: template.query_digest,
    query_text: template.effective_query_text,
    ordered_inputs: [{ input_digest: template.query_input_digest }],
  });
}

function sealEmbeddingQueryTemplate(value: unknown, dimensions: number): RetrievalEvaluationFixedEmbeddingQueryTemplate {
  const item = value as Record<string, unknown>;
  exactKeys(item, ["template_id", "phase", "query_id", "query_digest", "effective_query_text", "query_input_digest", "request_id", "item_count", "outcome", "responses", "error_code", "expected_vector_stage", "template_digest"], "GKX_EVAL_FIXED_EMBED_QUERY_FIELDS_INVALID");
  if (!boundedId(item.template_id) || item.phase !== "evaluation" || !boundedId(item.query_id) || !SHA256_RE.test(item.query_digest as string) ||
      !validQueryText(item.effective_query_text) || retrievalEvaluationEffectiveQueryText(item.effective_query_text as string) !== item.effective_query_text ||
      item.query_input_digest !== retrievalSha256(item.effective_query_text as string) || item.request_id !== item.query_input_digest ||
      item.item_count !== 1 || !["success", "failure"].includes(item.outcome as string)) failure("GKX_EVAL_FIXED_EMBED_QUERY_INVALID");
  sealEmbeddingResponses(item.responses, dimensions, [{ input_digest: item.query_input_digest as string, accepted_chunk_id: null }], item.outcome as "success" | "failure");
  if (item.outcome === "success" ? item.error_code !== null : item.error_code !== "FIXED_EMBEDDING_FAILURE") failure("GKX_EVAL_FIXED_EMBED_OUTCOME_INVALID");
  sealExpectedProviderStage(item.expected_vector_stage, "vector", item.outcome as "success" | "failure");
  digest(item.template_digest, "GKX_EVAL_FIXED_PROVIDER_TEMPLATE_DIGEST_INVALID");
  if (metricDigest(item, "template_digest") !== item.template_digest) failure("GKX_EVAL_FIXED_PROVIDER_TEMPLATE_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationFixedEmbeddingQueryTemplate;
}

function sealRerankQueryOracle(value: unknown): RetrievalEvaluationFixedRerankQueryOracle {
  const item = value as Record<string, unknown>;
  exactKeys(item, ["template_id", "phase", "query_id", "query_digest", "effective_query_text", "query_input_digest", "request_id", "candidate_score_universe", "outcome", "error_code", "expected_reranker_stage", "template_digest"], "GKX_EVAL_FIXED_RERANK_QUERY_FIELDS_INVALID");
  if (!boundedId(item.template_id) || item.phase !== "evaluation" || !boundedId(item.query_id) || !SHA256_RE.test(item.query_digest as string) ||
      !validQueryText(item.effective_query_text) || retrievalEvaluationEffectiveQueryText(item.effective_query_text as string) !== item.effective_query_text ||
      item.query_input_digest !== retrievalSha256(item.effective_query_text as string) ||
      item.request_id !== retrievalSha256(`rerank\0${item.effective_query_text as string}`) || !["success", "failure"].includes(item.outcome as string) ||
      !Array.isArray(item.candidate_score_universe) || item.candidate_score_universe.length > 160) failure("GKX_EVAL_FIXED_RERANK_QUERY_INVALID");
  const universe = (item.candidate_score_universe as unknown[]).map((raw) => {
    const candidate = raw as Record<string, unknown>;
    exactKeys(candidate, ["candidate_chunk_id", "input_digest", "score_micros"], "GKX_EVAL_FIXED_RERANK_SCORE_FIELDS_INVALID");
    if (!SHA256_RE.test(candidate.candidate_chunk_id as string) || !SHA256_RE.test(candidate.input_digest as string) || !Number.isSafeInteger(candidate.score_micros) ||
        (candidate.score_micros as number) < -1_000_000 || (candidate.score_micros as number) > 1_000_000) failure("GKX_EVAL_FIXED_RERANK_SCORE_INVALID");
    return candidate as unknown as { candidate_chunk_id: string; input_digest: string; score_micros: number };
  });
  const candidateIds = universe.map((candidate) => candidate.candidate_chunk_id);
  if (new Set(candidateIds).size !== candidateIds.length || stableJson(candidateIds) !== stableJson([...candidateIds].sort(retrievalCodeUnitCompare))) {
    failure("GKX_EVAL_FIXED_RERANK_UNIVERSE_ORDER_INVALID");
  }
  if (item.outcome === "success" ? item.error_code !== null : item.error_code !== "FIXED_RERANKER_FAILURE") failure("GKX_EVAL_FIXED_RERANK_OUTCOME_INVALID");
  sealExpectedProviderStage(item.expected_reranker_stage, "reranker", item.outcome as "success" | "failure");
  digest(item.template_digest, "GKX_EVAL_FIXED_PROVIDER_TEMPLATE_DIGEST_INVALID");
  if (metricDigest(item, "template_digest") !== item.template_digest) failure("GKX_EVAL_FIXED_PROVIDER_TEMPLATE_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationFixedRerankQueryOracle;
}

function allTuningAxesCoordinates(): RetrievalEvaluationTuningAxesCoordinate[] {
  const result: RetrievalEvaluationTuningAxesCoordinate[] = [];
  for (const rrf_k of RETRIEVAL_EVALUATION_TUNING_GRID_COORDINATE.rrf_k) {
    for (const mmr of RETRIEVAL_EVALUATION_TUNING_GRID_COORDINATE.mmr) {
      for (const semantic_top_k of RETRIEVAL_EVALUATION_TUNING_GRID_COORDINATE.semantic_top_k) {
        for (const lexical_top_k of RETRIEVAL_EVALUATION_TUNING_GRID_COORDINATE.lexical_top_k) {
          const material = {
            contract_version: "gkos-retrieval-evaluation-tuning-axes/1.0.0-draft.1",
            rrf_k, mmr: mmr.enabled, mmr_lambda_micros: mmr.lambda_micros, semantic_top_k, lexical_top_k,
          } as const;
          result.push({ ...material, tuning_axes_digest: retrievalCanonicalDigest(material) });
        }
      }
    }
  }
  return result;
}

function sealProviderQueryPartition(value: unknown, maximum: number): Array<{ query_id: string; query_digest: string }> {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) failure("GKX_EVAL_FIXED_PROVIDER_QUERY_PARTITION_INVALID");
  const partition = value.map((raw) => {
    const row = raw as Record<string, unknown>;
    exactKeys(row, ["query_id", "query_digest"], "GKX_EVAL_FIXED_PROVIDER_QUERY_PARTITION_FIELDS_INVALID");
    if (!boundedId(row.query_id) || !SHA256_RE.test(row.query_digest as string)) failure("GKX_EVAL_FIXED_PROVIDER_QUERY_PARTITION_INVALID");
    return row as unknown as { query_id: string; query_digest: string };
  });
  const ids = partition.map((row) => row.query_id);
  if (new Set(ids).size !== ids.length || stableJson(ids) !== stableJson([...ids].sort(retrievalCodeUnitCompare))) {
    failure("GKX_EVAL_FIXED_PROVIDER_QUERY_PARTITION_ORDER_INVALID");
  }
  return partition;
}

function sealProviderCounters(value: unknown): RetrievalEvaluationFixedProviderCounters {
  const counters = value as Record<string, unknown>;
  exactKeys(counters, ["vector_provider_call_count", "vector_provider_item_count", "rerank_provider_call_count", "rerank_provider_item_count"],
    "GKX_EVAL_FIXED_PROVIDER_COUNTER_FIELDS_INVALID");
  if (Object.values(counters).some((entry) => !Number.isSafeInteger(entry) || (entry as number) < 0) ||
      counters.vector_provider_call_count === 0 && counters.vector_provider_item_count !== 0 ||
      counters.rerank_provider_call_count === 0 && counters.rerank_provider_item_count !== 0) {
    failure("GKX_EVAL_FIXED_PROVIDER_COUNTER_INVALID");
  }
  return counters as unknown as RetrievalEvaluationFixedProviderCounters;
}

function sealProviderSchedule(
  value: unknown,
  scope: RetrievalEvaluationFixedProviderScope,
  indexTemplates: readonly RetrievalEvaluationFixedEmbeddingIndexTemplate[],
  embeddingTemplates: readonly RetrievalEvaluationFixedEmbeddingQueryTemplate[],
  rerankOracles: readonly RetrievalEvaluationFixedRerankQueryOracle[],
): RetrievalEvaluationFixedProviderSchedule {
  const item = value as Record<string, unknown>;
  const commonFields = ["contract_version", "operation", "normalized_golden_digest", "query_partition", "query_count", "query_evaluation_count",
    "occurrence_encoding", "occurrence_matrix", "occurrence_matrix_digest", "template_occurrences", "reranker_oracle_coverage",
    "expected_provider_counters", "schedule_digest"];
  const operation = item.operation;
  if (operation === "eval") exactKeys(item, [...commonFields, "evaluation_axes"], "GKX_EVAL_FIXED_PROVIDER_SCHEDULE_FIELDS_INVALID");
  else if (operation === "tune") exactKeys(item, [...commonFields, "tuning_grid", "maximum_expected_top_k", "eligible_tuning_axes",
    "evaluated_candidate_count", "excluded_candidate_count"], "GKX_EVAL_FIXED_PROVIDER_SCHEDULE_FIELDS_INVALID");
  else failure("GKX_EVAL_FIXED_PROVIDER_SCHEDULE_OPERATION_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_FIXED_PROVIDER_SCHEDULE_VERSION || item.normalized_golden_digest !== scope.normalized_golden_digest ||
      item.occurrence_encoding !== "implicit_axes_outer_query_inner_v1") failure("GKX_EVAL_FIXED_PROVIDER_SCHEDULE_COORDINATE_INVALID");

  const partition = sealProviderQueryPartition(item.query_partition, operation === "eval" ? 256 : 30);
  if (item.query_count !== partition.length) failure("GKX_EVAL_FIXED_PROVIDER_SCHEDULE_QUERY_COUNT_INVALID");
  const embeddingByQuery = new Map(embeddingTemplates.map((template) => [template.query_id, template]));
  const rerankByQuery = new Map(rerankOracles.map((oracle) => [oracle.query_id, oracle]));
  if (scope.embedding_role.state === "active") {
    if (embeddingTemplates.length !== partition.length || partition.some((query) => embeddingByQuery.get(query.query_id)?.query_digest !== query.query_digest)) {
      failure("GKX_EVAL_FIXED_PROVIDER_EMBED_QUERY_PARTITION_MISMATCH");
    }
  } else if (embeddingTemplates.length !== 0) failure("GKX_EVAL_FIXED_PROVIDER_DISABLED_EMBED_TEMPLATE_INVALID");
  if (scope.reranker_role.state === "active") {
    if (rerankOracles.length !== partition.length || partition.some((query) => rerankByQuery.get(query.query_id)?.query_digest !== query.query_digest)) {
      failure("GKX_EVAL_FIXED_PROVIDER_RERANK_QUERY_PARTITION_MISMATCH");
    }
  } else if (rerankOracles.length !== 0) failure("GKX_EVAL_FIXED_PROVIDER_DISABLED_RERANK_ORACLE_INVALID");

  let axes: RetrievalEvaluationTuningAxesCoordinate[];
  if (operation === "eval") {
    axes = [sealRetrievalEvaluationTuningAxesCoordinate(item.evaluation_axes)];
    if (item.query_evaluation_count !== partition.length) failure("GKX_EVAL_FIXED_PROVIDER_EVAL_COUNT_INVALID");
    item.evaluation_axes = axes[0];
  } else {
    const grid = sealRetrievalEvaluationTuningGridCoordinate(item.tuning_grid);
    if (!Number.isSafeInteger(item.maximum_expected_top_k) || (item.maximum_expected_top_k as number) < 1 ||
        (item.maximum_expected_top_k as number) > 100 || !Array.isArray(item.eligible_tuning_axes)) {
      failure("GKX_EVAL_FIXED_PROVIDER_TUNE_COORDINATE_INVALID");
    }
    const expectedAxes = allTuningAxesCoordinates().filter((candidate) => candidate.semantic_top_k >= (item.maximum_expected_top_k as number) &&
      candidate.lexical_top_k >= (item.maximum_expected_top_k as number));
    axes = (item.eligible_tuning_axes as unknown[]).map(sealRetrievalEvaluationTuningAxesCoordinate);
    if (stableJson(axes) !== stableJson(expectedAxes) || item.evaluated_candidate_count !== axes.length || item.excluded_candidate_count !== 900 - axes.length ||
        item.query_evaluation_count !== axes.length * partition.length || (item.query_evaluation_count as number) > 27_000) {
      failure("GKX_EVAL_FIXED_PROVIDER_TUNE_COUNT_INVALID");
    }
    item.tuning_grid = grid;
    item.eligible_tuning_axes = axes;
  }

  if (!Array.isArray(item.occurrence_matrix) || item.occurrence_matrix.length !== item.query_evaluation_count) {
    failure("GKX_EVAL_FIXED_PROVIDER_OCCURRENCE_MATRIX_COUNT_INVALID");
  }
  const matrix = (item.occurrence_matrix as unknown[]).map((raw) => {
    if (!Array.isArray(raw) || raw.length !== 3 || ![0, 1].includes(raw[0] as number) ||
        (raw[1] === null) !== (raw[2] === null) || raw[1] !== null && !SHA256_RE.test(raw[1] as string) ||
        raw[2] !== null && (!Number.isSafeInteger(raw[2]) || (raw[2] as number) < 0 || (raw[2] as number) > 160)) {
      failure("GKX_EVAL_FIXED_PROVIDER_OCCURRENCE_CELL_INVALID");
    }
    if (scope.embedding_role.state === "active" ? raw[0] !== 1 : raw[0] !== 0) failure("GKX_EVAL_FIXED_PROVIDER_EMBED_CALL_RELATION_INVALID");
    if (scope.reranker_role.state === "active" ? raw[1] === null : raw[1] !== null) failure("GKX_EVAL_FIXED_PROVIDER_RERANK_CALL_RELATION_INVALID");
    return raw as unknown as RetrievalEvaluationFixedProviderOccurrenceCell;
  });
  if (Buffer.byteLength(JSON.stringify(matrix), "utf8") > 8 * 1024 * 1024) failure("GKX_EVAL_FIXED_PROVIDER_OCCURRENCE_MATRIX_SIZE_INVALID");

  const embeddingTemplateDigests = partition.map((query) => embeddingByQuery.get(query.query_id)?.template_digest ?? null);
  const rerankerOracleDigests = partition.map((query) => rerankByQuery.get(query.query_id)?.template_digest ?? null);
  const matrixMaterial = {
    contract_version: RETRIEVAL_EVALUATION_FIXED_PROVIDER_OCCURRENCE_MATRIX_VERSION,
    operation,
    query_partition: partition,
    tuning_axes_digests: axes.map((candidate) => candidate.tuning_axes_digest),
    embedding_query_template_digests: embeddingTemplateDigests,
    reranker_query_oracle_digests: rerankerOracleDigests,
    occurrence_matrix: matrix,
  };
  digest(item.occurrence_matrix_digest, "GKX_EVAL_FIXED_PROVIDER_OCCURRENCE_MATRIX_DIGEST_INVALID");
  if (item.occurrence_matrix_digest !== retrievalCanonicalDigest(matrixMaterial)) failure("GKX_EVAL_FIXED_PROVIDER_OCCURRENCE_MATRIX_DIGEST_MISMATCH");

  // Every non-null operation replays the complete success-only index stream
  // once, including an all-excluded tune whose query occurrence matrix is empty.
  const indexReplayCount = 1;
  const expectedTemplateOccurrences = [
    ...indexTemplates.map((template) => ({ template_id: template.template_id, occurrence_count: indexReplayCount })),
    ...embeddingTemplates.map((template, queryIndex) => ({ template_id: template.template_id,
      occurrence_count: matrix.filter((cell, index) => index % partition.length === queryIndex && cell[0] === 1).length })),
    ...rerankOracles.map((oracle, queryIndex) => ({ template_id: oracle.template_id,
      occurrence_count: matrix.filter((cell, index) => index % partition.length === queryIndex && cell[1] !== null).length })),
  ].sort((left, right) => retrievalCodeUnitCompare(left.template_id, right.template_id));
  if (stableJson(item.template_occurrences) !== stableJson(expectedTemplateOccurrences) ||
      operation === "eval" && expectedTemplateOccurrences.some((entry) => entry.occurrence_count < 1) ||
      operation === "tune" && matrix.length > 0 && expectedTemplateOccurrences.some((entry) => entry.occurrence_count < 1)) {
    failure("GKX_EVAL_FIXED_PROVIDER_TEMPLATE_OCCURRENCES_INVALID");
  }

  if (!Array.isArray(item.reranker_oracle_coverage) || item.reranker_oracle_coverage.length !== rerankOracles.length) {
    failure("GKX_EVAL_FIXED_PROVIDER_RERANK_COVERAGE_INVALID");
  }
  const coverage = (item.reranker_oracle_coverage as unknown[]).map((raw, index) => {
    const entry = raw as Record<string, unknown>;
    exactKeys(entry, ["reranker_query_oracle_id", "used_candidate_chunk_ids"], "GKX_EVAL_FIXED_PROVIDER_RERANK_COVERAGE_FIELDS_INVALID");
    const oracle = rerankOracles[index];
    if (!oracle || entry.reranker_query_oracle_id !== oracle.template_id) failure("GKX_EVAL_FIXED_PROVIDER_RERANK_COVERAGE_ORACLE_INVALID");
    const ids = sortedUniqueStrings(entry.used_candidate_chunk_ids, 160, (candidate) => SHA256_RE.test(candidate), "GKX_EVAL_FIXED_PROVIDER_RERANK_COVERAGE_IDS_INVALID");
    const universe = new Set(oracle.candidate_score_universe.map((candidate) => candidate.candidate_chunk_id));
    const scheduledItemCount = matrix.reduce((sum, cell, cellIndex) => cellIndex % partition.length === index ? sum + (cell[2] ?? 0) : sum, 0);
    if (ids.some((candidate) => !universe.has(candidate)) || ids.length > scheduledItemCount) {
      failure("GKX_EVAL_FIXED_PROVIDER_RERANK_COVERAGE_SUBSET_INVALID");
    }
    return { reranker_query_oracle_id: oracle.template_id, used_candidate_chunk_ids: ids };
  });

  const embeddingCalls = matrix.filter((cell) => cell[0] === 1).length;
  const rerankCalls = matrix.filter((cell) => cell[1] !== null).length;
  const expectedCounters: RetrievalEvaluationFixedProviderCounters = {
    vector_provider_call_count: indexTemplates.length * indexReplayCount + embeddingCalls,
    vector_provider_item_count: indexTemplates.reduce((sum, template) => sum + template.item_count * indexReplayCount, 0) + embeddingCalls,
    rerank_provider_call_count: rerankCalls,
    rerank_provider_item_count: matrix.reduce((sum, cell) => sum + (cell[2] ?? 0), 0),
  };
  const counters = sealProviderCounters(item.expected_provider_counters);
  if (stableJson(counters) !== stableJson(expectedCounters)) failure("GKX_EVAL_FIXED_PROVIDER_COUNTER_RELATION_INVALID");

  item.query_partition = partition;
  item.occurrence_matrix = matrix;
  item.template_occurrences = expectedTemplateOccurrences;
  item.reranker_oracle_coverage = coverage;
  item.expected_provider_counters = counters;
  digest(item.schedule_digest, "GKX_EVAL_FIXED_PROVIDER_SCHEDULE_DIGEST_INVALID");
  if (metricDigest(item, "schedule_digest") !== item.schedule_digest) failure("GKX_EVAL_FIXED_PROVIDER_SCHEDULE_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationFixedProviderSchedule;
}

function sameProviderChunkDigest(bindings: Map<string, string>, chunkId: string, inputDigest: string): void {
  const prior = bindings.get(chunkId);
  if (prior !== undefined && prior !== inputDigest) failure("GKX_EVAL_FIXED_PROVIDER_CHUNK_DIGEST_CONFLICT");
  bindings.set(chunkId, inputDigest);
}

export function sealRetrievalEvaluationFixedProviderTranscript(value: unknown): RetrievalEvaluationFixedProviderTranscript {
  const item = clone(value) as unknown as Record<string, unknown>;
  exactKeys(item, ["contract_version", "provider_fixture_id", "adapter_backend", "embedding_provider", "reranker_provider", "scenarios", "network", "secrets",
    "provider_fixture_digest"], "GKX_EVAL_FIXED_PROVIDER_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_FIXED_PROVIDER_VERSION || !boundedId(item.provider_fixture_id) || item.adapter_backend !== "fixed_offline" ||
      item.network !== false || item.secrets !== false) failure("GKX_EVAL_FIXED_PROVIDER_COORDINATE_INVALID");
  const embedding = item.embedding_provider as Record<string, unknown>;
  exactKeys(embedding, ["provider_kind", "provider_id", "model_id", "dimensions"], "GKX_EVAL_FIXED_EMBEDDING_PROVIDER_FIELDS_INVALID");
  if (!PROVIDER_KINDS.includes(embedding.provider_kind as never)) failure("GKX_EVAL_FIXED_EMBEDDING_PROVIDER_KIND_INVALID");
  identity(embedding.provider_id, "GKX_EVAL_FIXED_EMBEDDING_PROVIDER_INVALID");
  identity(embedding.model_id, "GKX_EVAL_FIXED_EMBEDDING_PROVIDER_INVALID");
  if (!Number.isSafeInteger(embedding.dimensions) || (embedding.dimensions as number) < 1 || (embedding.dimensions as number) > 4_096) {
    failure("GKX_EVAL_FIXED_EMBEDDING_DIMENSIONS_INVALID");
  }
  const reranker = item.reranker_provider as Record<string, unknown>;
  exactKeys(reranker, ["provider_kind", "provider_id", "model_id"], "GKX_EVAL_FIXED_RERANKER_PROVIDER_FIELDS_INVALID");
  if (!PROVIDER_KINDS.includes(reranker.provider_kind as never)) failure("GKX_EVAL_FIXED_RERANKER_PROVIDER_KIND_INVALID");
  identity(reranker.provider_id, "GKX_EVAL_FIXED_RERANKER_PROVIDER_INVALID");
  identity(reranker.model_id, "GKX_EVAL_FIXED_RERANKER_PROVIDER_INVALID");
  if (!Array.isArray(item.scenarios) || item.scenarios.length < 1 || item.scenarios.length > 256) failure("GKX_EVAL_FIXED_PROVIDER_SCENARIOS_INVALID");

  const transcriptChunkBindings = new Map<string, string>();
  const scenarios = (item.scenarios as unknown[]).map((raw) => {
    const scenario = raw as Record<string, unknown>;
    exactKeys(scenario, ["embedding_provider_scenario_id", "reranker_provider_scenario_id", "environment_scope", "embedding_role", "reranker_role",
      "embedding_index_templates", "embedding_query_templates", "reranker_query_oracles", "eval_schedule", "tune_schedule", "disabled_vector_stage",
      "disabled_reranker_stage", "scenario_digest"], "GKX_EVAL_FIXED_PROVIDER_SCENARIO_FIELDS_INVALID");
    const scope = sealProviderScope(scenario.environment_scope);
    if (scenario.embedding_provider_scenario_id !== scope.embedding_role.provider_scenario_id ||
        scenario.reranker_provider_scenario_id !== scope.reranker_role.provider_scenario_id ||
        scenario.embedding_role !== scope.embedding_role.state || scenario.reranker_role !== scope.reranker_role.state ||
        !Array.isArray(scenario.embedding_index_templates) || !Array.isArray(scenario.embedding_query_templates) || !Array.isArray(scenario.reranker_query_oracles) ||
        scenario.embedding_index_templates.length > 4_096 || scenario.embedding_query_templates.length > 256 || scenario.reranker_query_oracles.length > 256) {
      failure("GKX_EVAL_FIXED_PROVIDER_SCENARIO_INVALID");
    }
    if (scope.embedding_role.state === "active" && (scope.embedding_role.provider_kind !== embedding.provider_kind ||
        scope.embedding_role.provider_id !== embedding.provider_id || scope.embedding_role.model_id !== embedding.model_id ||
        scope.embedding_role.dimensions !== embedding.dimensions) || scope.reranker_role.state === "active" &&
        (scope.reranker_role.provider_kind !== reranker.provider_kind || scope.reranker_role.provider_id !== reranker.provider_id ||
         scope.reranker_role.model_id !== reranker.model_id)) {
      failure("GKX_EVAL_FIXED_PROVIDER_SCOPE_ROLE_BINDING_INVALID");
    }

    let expectedOffset = 0;
    const indexTemplates = (scenario.embedding_index_templates as unknown[]).map((template, index) => {
      const sealed = sealEmbeddingIndexTemplate(template, embedding.dimensions as number, index + 1, expectedOffset);
      expectedOffset += sealed.item_count;
      return sealed;
    });
    const embeddingTemplates = (scenario.embedding_query_templates as unknown[]).map((template) => sealEmbeddingQueryTemplate(template, embedding.dimensions as number));
    const rerankOracles = (scenario.reranker_query_oracles as unknown[]).map(sealRerankQueryOracle);
    const templateIds = [...indexTemplates, ...embeddingTemplates, ...rerankOracles].map((template) => template.template_id);
    if (new Set(templateIds).size !== templateIds.length) failure("GKX_EVAL_FIXED_PROVIDER_TEMPLATE_ID_DUPLICATE");
    const scenarioChunkIds = new Set<string>();
    const scenarioInputDigests = new Set<string>();
    for (const template of indexTemplates) for (const input of template.chunk_inputs) {
      if (scenarioChunkIds.has(input.accepted_chunk_id) || scenarioInputDigests.has(input.input_digest)) failure("GKX_EVAL_FIXED_PROVIDER_INDEX_INPUT_DUPLICATE");
      scenarioChunkIds.add(input.accepted_chunk_id); scenarioInputDigests.add(input.input_digest);
      sameProviderChunkDigest(transcriptChunkBindings, input.accepted_chunk_id, input.input_digest);
    }
    for (const oracle of rerankOracles) for (const candidate of oracle.candidate_score_universe) {
      sameProviderChunkDigest(transcriptChunkBindings, candidate.candidate_chunk_id, candidate.input_digest);
    }

    const evalSchedule = sealProviderSchedule(scenario.eval_schedule, scope, indexTemplates, embeddingTemplates, rerankOracles) as RetrievalEvaluationFixedProviderEvalSchedule;
    if (evalSchedule.operation !== "eval") failure("GKX_EVAL_FIXED_PROVIDER_EVAL_SCHEDULE_INVALID");
    const orderedPartition = evalSchedule.query_partition.map((query) => ({ query_id: query.query_id, query_digest: query.query_digest }));
    if (scope.embedding_role.state === "active" && stableJson(embeddingTemplates.map((template) => ({ query_id: template.query_id, query_digest: template.query_digest }))) !== stableJson(orderedPartition) ||
        scope.reranker_role.state === "active" && stableJson(rerankOracles.map((oracle) => ({ query_id: oracle.query_id, query_digest: oracle.query_digest }))) !== stableJson(orderedPartition)) {
      failure("GKX_EVAL_FIXED_PROVIDER_QUERY_TEMPLATE_ORDER_INVALID");
    }
    const tuneRequired = scope.normalized_golden_query_count <= 30;
    if ((scenario.tune_schedule !== null) !== tuneRequired) failure("GKX_EVAL_FIXED_PROVIDER_TUNE_APPLICABILITY_INVALID");
    const tuneSchedule = scenario.tune_schedule === null ? null :
      sealProviderSchedule(scenario.tune_schedule, scope, indexTemplates, embeddingTemplates, rerankOracles) as RetrievalEvaluationFixedProviderTuneSchedule;
    if (tuneSchedule !== null && (tuneSchedule.operation !== "tune" || stableJson(tuneSchedule.query_partition) !== stableJson(evalSchedule.query_partition))) {
      failure("GKX_EVAL_FIXED_PROVIDER_TUNE_SCHEDULE_INVALID");
    }

    if (scope.embedding_role.state === "disabled") {
      if (indexTemplates.length !== 0 || embeddingTemplates.length !== 0 ||
          stableJson(scenario.disabled_vector_stage) !== stableJson({ state: "disabled", reason_codes: ["VECTOR_DISABLED"] })) {
        failure("GKX_EVAL_FIXED_PROVIDER_DISABLED_EMBED_INVALID");
      }
    } else if (indexTemplates.length < 1 || scenario.disabled_vector_stage !== null) failure("GKX_EVAL_FIXED_PROVIDER_ACTIVE_EMBED_INVALID");
    if (scope.reranker_role.state === "disabled") {
      if (rerankOracles.length !== 0 || stableJson(scenario.disabled_reranker_stage) !== stableJson({ state: "skipped", reason_codes: ["RERANKER_NOT_CONFIGURED"] })) {
        failure("GKX_EVAL_FIXED_PROVIDER_DISABLED_RERANK_INVALID");
      }
    } else if (scenario.disabled_reranker_stage !== null) failure("GKX_EVAL_FIXED_PROVIDER_ACTIVE_RERANK_INVALID");

    const coverageByOracle = (schedule: RetrievalEvaluationFixedProviderSchedule | null, oracleId: string): string[] =>
      schedule?.reranker_oracle_coverage.find((entry) => entry.reranker_query_oracle_id === oracleId)?.used_candidate_chunk_ids ?? [];
    for (const oracle of rerankOracles) {
      const used = [...new Set([...coverageByOracle(evalSchedule, oracle.template_id), ...coverageByOracle(tuneSchedule, oracle.template_id)])]
        .sort(retrievalCodeUnitCompare);
      if (stableJson(used) !== stableJson(oracle.candidate_score_universe.map((candidate) => candidate.candidate_chunk_id))) {
        failure("GKX_EVAL_FIXED_PROVIDER_RERANK_UNIVERSE_COVERAGE_INVALID");
      }
    }

    scenario.environment_scope = scope;
    scenario.embedding_index_templates = indexTemplates;
    scenario.embedding_query_templates = embeddingTemplates;
    scenario.reranker_query_oracles = rerankOracles;
    scenario.eval_schedule = evalSchedule;
    scenario.tune_schedule = tuneSchedule;
    digest(scenario.scenario_digest, "GKX_EVAL_FIXED_PROVIDER_SCENARIO_DIGEST_INVALID");
    if (metricDigest(scenario, "scenario_digest") !== scenario.scenario_digest) failure("GKX_EVAL_FIXED_PROVIDER_SCENARIO_DIGEST_MISMATCH");
    return scenario as unknown as RetrievalEvaluationFixedProviderScenario;
  });
  const scopeDigests = scenarios.map((scenario) => scenario.environment_scope.environment_scope_digest);
  if (new Set(scopeDigests).size !== scopeDigests.length || stableJson(scopeDigests) !== stableJson([...scopeDigests].sort(retrievalCodeUnitCompare))) {
    failure("GKX_EVAL_FIXED_PROVIDER_SCENARIO_ORDER_INVALID");
  }
  item.scenarios = scenarios;
  digest(item.provider_fixture_digest, "GKX_EVAL_FIXED_PROVIDER_DIGEST_INVALID");
  if (metricDigest(item, "provider_fixture_digest") !== item.provider_fixture_digest) failure("GKX_EVAL_FIXED_PROVIDER_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationFixedProviderTranscript;
}

export function verifyRetrievalEvaluationFixedProviderOccurrenceRequest(
  transcriptValue: unknown,
  value: unknown,
): {
  call_kind: "embedding_query" | "reranker_query";
  provider_call_ordinal: number;
  template_id: string;
  outcome: "success" | "failure";
  error_code: string | null;
  responses: RetrievalEvaluationFixedEmbeddingResponse[] | Array<{ candidate_chunk_id: string; score_micros: number }>;
  expected_stage: { state: "active" | "degraded"; reason_codes: string[] };
} {
  const transcript = sealRetrievalEvaluationFixedProviderTranscript(transcriptValue);
  const item = clone(value) as unknown as Record<string, unknown>;
  exactKeys(item, ["environment_scope_digest", "operation", "evaluation_occurrence_ordinal", "request"],
    "GKX_EVAL_FIXED_PROVIDER_REQUEST_CHECK_FIELDS_INVALID");
  if (!SHA256_RE.test(item.environment_scope_digest as string) || !["eval", "tune"].includes(item.operation as string) ||
      !Number.isSafeInteger(item.evaluation_occurrence_ordinal) || (item.evaluation_occurrence_ordinal as number) < 1) {
    failure("GKX_EVAL_FIXED_PROVIDER_REQUEST_CHECK_COORDINATE_INVALID");
  }
  const scenarios = transcript.scenarios.filter((scenario) => scenario.environment_scope.environment_scope_digest === item.environment_scope_digest);
  if (scenarios.length !== 1) failure("GKX_EVAL_FIXED_PROVIDER_REQUEST_CHECK_SCOPE_INVALID");
  const scenario = scenarios[0];
  const schedule = item.operation === "eval" ? scenario.eval_schedule : scenario.tune_schedule;
  if (schedule === null || (item.evaluation_occurrence_ordinal as number) > schedule.occurrence_matrix.length) {
    failure("GKX_EVAL_FIXED_PROVIDER_REQUEST_CHECK_OCCURRENCE_INVALID");
  }
  const occurrenceIndex = (item.evaluation_occurrence_ordinal as number) - 1;
  const queryIndex = occurrenceIndex % schedule.query_count;
  const cell = schedule.occurrence_matrix[occurrenceIndex];
  const request = item.request as Record<string, unknown>;
  exactKeys(request, ["contract_version", "call_kind", "request_id", "query_id", "query_digest", "query_text", "ordered_inputs"],
    "GKX_EVAL_FIXED_PROVIDER_REQUEST_FIELDS_INVALID");
  if (request.contract_version !== RETRIEVAL_EVALUATION_FIXED_PROVIDER_REQUEST_VERSION) failure("GKX_EVAL_FIXED_PROVIDER_REQUEST_COORDINATE_INVALID");
  const query = schedule.query_partition[queryIndex];
  if (request.query_id !== query.query_id || request.query_digest !== query.query_digest || !validQueryText(request.query_text) ||
      retrievalEvaluationEffectiveQueryText(request.query_text as string) !== request.query_text) {
    failure("GKX_EVAL_FIXED_PROVIDER_REQUEST_QUERY_INVALID");
  }
  const precedingCells = schedule.occurrence_matrix.slice(0, occurrenceIndex + 1);
  if (request.call_kind === "embedding_query") {
    if (cell[0] !== 1 || scenario.embedding_role !== "active") failure("GKX_EVAL_FIXED_PROVIDER_REQUEST_CALL_INVALID");
    const template = scenario.embedding_query_templates[queryIndex];
    if (!template || request.request_id !== template.request_id || request.query_text !== template.effective_query_text ||
        !Array.isArray(request.ordered_inputs) || stableJson(request.ordered_inputs) !== stableJson([{ input_digest: template.query_input_digest }]) ||
        retrievalCanonicalDigest(request) !== embeddingRequestDigest(template)) {
      failure("GKX_EVAL_FIXED_PROVIDER_REQUEST_MISMATCH");
    }
    return {
      call_kind: "embedding_query",
      provider_call_ordinal: scenario.embedding_index_templates.length + precedingCells.filter((candidate) => candidate[0] === 1).length,
      template_id: template.template_id,
      outcome: template.outcome,
      error_code: template.error_code,
      responses: template.responses,
      expected_stage: template.expected_vector_stage,
    };
  }
  if (request.call_kind !== "reranker_query" || cell[1] === null || scenario.reranker_role !== "active") {
    failure("GKX_EVAL_FIXED_PROVIDER_REQUEST_CALL_INVALID");
  }
  const oracle = scenario.reranker_query_oracles[queryIndex];
  if (!oracle || request.request_id !== oracle.request_id || request.query_text !== oracle.effective_query_text ||
      !Array.isArray(request.ordered_inputs) || request.ordered_inputs.length !== cell[2] || request.ordered_inputs.length > 160) {
    failure("GKX_EVAL_FIXED_PROVIDER_REQUEST_MISMATCH");
  }
  const universe = new Map(oracle.candidate_score_universe.map((candidate) => [candidate.candidate_chunk_id, candidate]));
  const seenCandidates = new Set<string>();
  const ordered = (request.ordered_inputs as unknown[]).map((raw) => {
    const input = raw as Record<string, unknown>;
    exactKeys(input, ["candidate_chunk_id", "input_digest"], "GKX_EVAL_FIXED_PROVIDER_RERANK_REQUEST_INPUT_FIELDS_INVALID");
    const candidate = typeof input.candidate_chunk_id === "string" ? universe.get(input.candidate_chunk_id) : undefined;
    if (!candidate || input.input_digest !== candidate.input_digest || seenCandidates.has(candidate.candidate_chunk_id)) {
      failure("GKX_EVAL_FIXED_PROVIDER_RERANK_REQUEST_INPUT_INVALID");
    }
    seenCandidates.add(candidate.candidate_chunk_id);
    return candidate;
  });
  if (retrievalCanonicalDigest(request) !== cell[1]) failure("GKX_EVAL_FIXED_PROVIDER_REQUEST_MISMATCH");
  return {
    call_kind: "reranker_query",
    provider_call_ordinal: precedingCells.filter((candidate) => candidate[1] !== null).length,
    template_id: oracle.template_id,
    outcome: oracle.outcome,
    error_code: oracle.error_code,
    responses: oracle.outcome === "success" ? ordered.map((candidate) => ({ candidate_chunk_id: candidate.candidate_chunk_id, score_micros: candidate.score_micros })) : [],
    expected_stage: oracle.expected_reranker_stage,
  };
}

function sealRuntimePolicyInputs(value: unknown): RetrievalEvaluationRuntimePolicyInputs {
  const item = value as Record<string, unknown>;
  exactKeys(item, ["contract_version", "source_discoverability", "chunk_discoverability", "runtime_policy_inputs_digest"], "GKX_EVAL_RUNTIME_POLICY_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_RUNTIME_POLICY_INPUTS_VERSION || !Array.isArray(item.source_discoverability) ||
      !Array.isArray(item.chunk_discoverability) || item.source_discoverability.length > 4_096 || item.chunk_discoverability.length > 16_384) {
    failure("GKX_EVAL_RUNTIME_POLICY_COORDINATE_INVALID");
  }
  for (const [rows, fields, code] of [
    [item.source_discoverability as unknown[], ["source_id", "source_path", "discoverable"], "GKX_EVAL_RUNTIME_SOURCE_POLICY_INVALID"],
    [item.chunk_discoverability as unknown[], ["chunk_id", "source_id", "discoverable"], "GKX_EVAL_RUNTIME_CHUNK_POLICY_INVALID"],
  ] as const) {
    for (const raw of rows) {
      const row = raw as Record<string, unknown>;
      exactKeys(row, fields, code);
      if (!isValidGkxAuthoredUid(row.source_id) || typeof row.discoverable !== "boolean" ||
          ("source_path" in row ? typeof row.source_path !== "string" || !isValidRetrievalEvaluationSourcePath(row.source_path) : !SHA256_RE.test(row.chunk_id as string))) failure(code);
    }
    const canonical = rows.map((row) => stableJson(row));
    if (new Set(canonical).size !== canonical.length || stableJson(canonical) !== stableJson([...canonical].sort(retrievalCodeUnitCompare))) failure(`${code}_ORDER`);
  }
  const chunkIds = (item.chunk_discoverability as Array<{ chunk_id: string }>).map((row) => row.chunk_id);
  if (new Set(chunkIds).size !== chunkIds.length) failure("GKX_EVAL_RUNTIME_CHUNK_POLICY_DUPLICATE");
  digest(item.runtime_policy_inputs_digest, "GKX_EVAL_RUNTIME_POLICY_DIGEST_INVALID");
  if (metricDigest(item, "runtime_policy_inputs_digest") !== item.runtime_policy_inputs_digest) failure("GKX_EVAL_RUNTIME_POLICY_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationRuntimePolicyInputs;
}

function sealSourceSnapshot(value: unknown): RetrievalEvaluationSourceSnapshot {
  const item = value as Record<string, unknown>;
  exactKeys(item, ["contract_version", "source_observations", "source_snapshot_digest"], "GKX_EVAL_SOURCE_SNAPSHOT_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_SOURCE_SNAPSHOT_VERSION || !Array.isArray(item.source_observations) ||
      item.source_observations.length < 1 || item.source_observations.length > 4_096) failure("GKX_EVAL_SOURCE_SNAPSHOT_COORDINATE_INVALID");
  const observations = (item.source_observations as unknown[]).map((raw) => {
    const observation = raw as Record<string, unknown>;
    exactKeys(observation, ["source_id", "source_path", "source_digest"], "GKX_EVAL_SOURCE_SNAPSHOT_OBSERVATION_FIELDS_INVALID");
    if (!isValidGkxAuthoredUid(observation.source_id) || typeof observation.source_path !== "string" ||
        !isValidRetrievalEvaluationSourcePath(observation.source_path)) failure("GKX_EVAL_SOURCE_SNAPSHOT_OBSERVATION_IDENTITY_INVALID");
    digest(observation.source_digest, "GKX_EVAL_SOURCE_SNAPSHOT_OBSERVATION_DIGEST_INVALID");
    return observation as unknown as { source_id: string; source_path: string; source_digest: string };
  });
  const keys = observations.map((observation) => `${observation.source_id}\0${observation.source_path}`);
  if (new Set(observations.map((observation) => observation.source_id)).size !== observations.length ||
      new Set(observations.map((observation) => observation.source_path)).size !== observations.length ||
      stableJson(keys) !== stableJson([...keys].sort(retrievalCodeUnitCompare))) failure("GKX_EVAL_SOURCE_SNAPSHOT_ONE_TO_ONE_INVALID");
  digest(item.source_snapshot_digest, "GKX_EVAL_SOURCE_SNAPSHOT_DIGEST_INVALID");
  if (metricDigest(item, "source_snapshot_digest") !== item.source_snapshot_digest) failure("GKX_EVAL_SOURCE_SNAPSHOT_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationSourceSnapshot;
}

export function sealRetrievalEvaluationSourceCorpus(value: unknown): RetrievalEvaluationSourceCorpus {
  const expectedCanonicalBytes = preflightSourceCorpus(value);
  const canonical = stableJson(value);
  if (Buffer.byteLength(canonical, "utf8") !== expectedCanonicalBytes) failure("GKX_EVAL_SOURCE_CORPUS_SERIALIZED_SIZE_INVALID");
  const item = JSON.parse(canonical) as Record<string, unknown>;
  exactKeys(item, ["contract_version", "corpora", "source_corpus_digest"], "GKX_EVAL_SOURCE_CORPUS_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_SOURCE_CORPUS_VERSION || !Array.isArray(item.corpora) ||
      item.corpora.length < 1 || item.corpora.length > 256) failure("GKX_EVAL_SOURCE_CORPUS_COORDINATE_INVALID");
  let totalBytes = 0;
  const corpora = (item.corpora as unknown[]).map((raw) => {
    const corpus = raw as Record<string, unknown>;
    exactKeys(corpus, ["vault_fixture", "source_files", "corpus_fixture_digest"], "GKX_EVAL_SOURCE_CORPUS_ENTRY_FIELDS_INVALID");
    if (!boundedId(corpus.vault_fixture) || !Array.isArray(corpus.source_files) || corpus.source_files.length < 1 || corpus.source_files.length > 4_096) {
      failure("GKX_EVAL_SOURCE_CORPUS_ENTRY_INVALID");
    }
    const sourceFiles = (corpus.source_files as unknown[]).map((sourceRaw) => {
      const source = sourceRaw as Record<string, unknown>;
      exactKeys(source, ["source_id", "source_path", "source_digest", "source_bytes_base64"], "GKX_EVAL_SOURCE_CORPUS_FILE_FIELDS_INVALID");
      if (!isValidGkxAuthoredUid(source.source_id) || typeof source.source_path !== "string" ||
          !isValidRetrievalEvaluationSourcePath(source.source_path) || typeof source.source_bytes_base64 !== "string" ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(source.source_bytes_base64)) {
        failure("GKX_EVAL_SOURCE_CORPUS_FILE_INVALID");
      }
      digest(source.source_digest, "GKX_EVAL_SOURCE_CORPUS_FILE_DIGEST_INVALID");
      const bytes = Buffer.from(source.source_bytes_base64, "base64");
      if (bytes.length > 64 * 1024 * 1024 || bytes.toString("base64") !== source.source_bytes_base64 ||
          retrievalSha256(bytes) !== source.source_digest) failure("GKX_EVAL_SOURCE_CORPUS_FILE_BYTES_INVALID");
      try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { failure("GKX_EVAL_SOURCE_CORPUS_FILE_UTF8_INVALID"); }
      totalBytes += bytes.length;
      if (totalBytes > 512 * 1024 * 1024) failure("GKX_EVAL_SOURCE_CORPUS_TOTAL_SIZE_INVALID");
      return source as unknown as RetrievalEvaluationSourceCorpus["corpora"][number]["source_files"][number];
    });
    const keys = sourceFiles.map((source) => `${source.source_id}\0${source.source_path}`);
    if (new Set(sourceFiles.map((source) => source.source_id)).size !== sourceFiles.length ||
        new Set(sourceFiles.map((source) => source.source_path)).size !== sourceFiles.length ||
        stableJson(keys) !== stableJson([...keys].sort(retrievalCodeUnitCompare))) failure("GKX_EVAL_SOURCE_CORPUS_FILE_ORDER_INVALID");
    digest(corpus.corpus_fixture_digest, "GKX_EVAL_SOURCE_CORPUS_ENTRY_DIGEST_INVALID");
    const corpusDigest = retrievalCanonicalDigest({
      contract_version: RETRIEVAL_EVALUATION_SOURCE_CORPUS_VERSION,
      vault_fixture: corpus.vault_fixture,
      source_files: corpus.source_files,
    });
    if (corpusDigest !== corpus.corpus_fixture_digest) failure("GKX_EVAL_SOURCE_CORPUS_ENTRY_DIGEST_MISMATCH");
    return corpus as unknown as RetrievalEvaluationSourceCorpus["corpora"][number];
  });
  const vaults = corpora.map((corpus) => corpus.vault_fixture);
  if (new Set(vaults).size !== vaults.length || stableJson(vaults) !== stableJson([...vaults].sort(retrievalCodeUnitCompare))) {
    failure("GKX_EVAL_SOURCE_CORPUS_ORDER_INVALID");
  }
  const globalSources = new Map<string, string>();
  for (const corpus of corpora) {
    for (const source of corpus.source_files) {
      const binding = stableJson({ source_path: source.source_path, source_digest: source.source_digest, source_bytes_base64: source.source_bytes_base64 });
      const prior = globalSources.get(source.source_id);
      if (prior !== undefined && prior !== binding) failure("GKX_EVAL_SOURCE_CORPUS_CROSS_SCOPE_BINDING_INVALID");
      globalSources.set(source.source_id, binding);
    }
  }
  digest(item.source_corpus_digest, "GKX_EVAL_SOURCE_CORPUS_DIGEST_INVALID");
  if (metricDigest(item, "source_corpus_digest") !== item.source_corpus_digest) failure("GKX_EVAL_SOURCE_CORPUS_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationSourceCorpus;
}

function sealCatalogAuditOracle(value: unknown): RetrievalEvaluationCatalogAuditOracle {
  const item = value as Record<string, unknown>;
  exactKeys(item, ["contract_version", "authorized_source_ids", "authorized_source_paths", "forbidden_source_ids", "forbidden_source_paths", "authorized_endpoint_ids", "forbidden_endpoint_ids", "evaluation_audit_oracle_digest"], "GKX_EVAL_CATALOG_ORACLE_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_AUDIT_ORACLE_VERSION) failure("GKX_EVAL_CATALOG_ORACLE_COORDINATE_INVALID");
  for (const field of ["authorized_source_ids", "forbidden_source_ids"] as const) sortedUniqueStrings(item[field], 4_096, isValidGkxAuthoredUid, "GKX_EVAL_CATALOG_ORACLE_IDS_INVALID");
  for (const field of ["authorized_endpoint_ids", "forbidden_endpoint_ids"] as const) sortedUniqueStrings(item[field], 4_096, isValidGkxAuthoredUid, "GKX_EVAL_CATALOG_ORACLE_ENDPOINT_IDS_INVALID");
  for (const field of ["authorized_source_paths", "forbidden_source_paths"] as const) sortedUniqueStrings(item[field], 4_096, isValidRetrievalEvaluationSourcePath, "GKX_EVAL_CATALOG_ORACLE_PATHS_INVALID");
  if ((item.authorized_source_ids as string[]).some((entry) => (item.forbidden_source_ids as string[]).includes(entry)) ||
      (item.authorized_source_paths as string[]).some((entry) => (item.forbidden_source_paths as string[]).includes(entry)) ||
      (item.authorized_endpoint_ids as string[]).some((entry) => (item.forbidden_endpoint_ids as string[]).includes(entry))) failure("GKX_EVAL_CATALOG_ORACLE_OVERLAP");
  digest(item.evaluation_audit_oracle_digest, "GKX_EVAL_CATALOG_ORACLE_DIGEST_INVALID");
  if (metricDigest(item, "evaluation_audit_oracle_digest") !== item.evaluation_audit_oracle_digest) failure("GKX_EVAL_CATALOG_ORACLE_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationCatalogAuditOracle;
}

export function sealRetrievalEvaluationFixtureCatalog(value: unknown): RetrievalEvaluationFixtureCatalog {
  const item = clone(value) as unknown as Record<string, unknown>;
  exactKeys(item, ["contract_version", "fixture_catalog_id", "entries", "catalog_digest"], "GKX_EVAL_FIXTURE_CATALOG_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_FIXTURE_CATALOG_VERSION || !boundedId(item.fixture_catalog_id) ||
      !Array.isArray(item.entries) || item.entries.length < 1 || item.entries.length > 256) failure("GKX_EVAL_FIXTURE_CATALOG_COORDINATE_INVALID");
  const entries = (item.entries as unknown[]).map((raw) => {
    const entry = raw as Record<string, unknown>;
    exactKeys(entry, ["vault_fixture", "source_corpus_file", "corpus_fixture_digest", "source_snapshot", "runtime_policy_inputs", "evaluation_audit_oracle", "fixed_provider_transcript_digest", "embedding_provider_scenario_id", "reranker_provider_scenario_id", "backend", "entry_digest"], "GKX_EVAL_FIXTURE_CATALOG_ENTRY_FIELDS_INVALID");
    if (!boundedId(entry.vault_fixture) || !["sqlite_fts5", "sqlite_lexical_scan"].includes(entry.backend as string) ||
        entry.source_corpus_file !== "source-corpus.json" || !boundedId(entry.embedding_provider_scenario_id) ||
        !boundedId(entry.reranker_provider_scenario_id)) failure("GKX_EVAL_FIXTURE_CATALOG_ENTRY_INVALID");
    for (const field of ["corpus_fixture_digest", "entry_digest"] as const) digest(entry[field], "GKX_EVAL_FIXTURE_CATALOG_ENTRY_DIGEST_INVALID");
    if (entry.fixed_provider_transcript_digest !== null) digest(entry.fixed_provider_transcript_digest, "GKX_EVAL_FIXTURE_CATALOG_PROVIDER_DIGEST_INVALID");
    if (entry.fixed_provider_transcript_digest === null ? entry.embedding_provider_scenario_id !== "disabled" || entry.reranker_provider_scenario_id !== "disabled" :
        entry.embedding_provider_scenario_id === "disabled" && entry.reranker_provider_scenario_id === "disabled") failure("GKX_EVAL_FIXTURE_CATALOG_PROVIDER_RELATION_INVALID");
    entry.source_snapshot = sealSourceSnapshot(entry.source_snapshot);
    entry.runtime_policy_inputs = sealRuntimePolicyInputs(entry.runtime_policy_inputs);
    entry.evaluation_audit_oracle = sealCatalogAuditOracle(entry.evaluation_audit_oracle);
    const snapshot = entry.source_snapshot as RetrievalEvaluationSourceSnapshot;
    const runtimePolicy = entry.runtime_policy_inputs as RetrievalEvaluationRuntimePolicyInputs;
    const auditOracle = entry.evaluation_audit_oracle as RetrievalEvaluationCatalogAuditOracle;
    const snapshotPairs = snapshot.source_observations.map((observation) => `${observation.source_id}\0${observation.source_path}`);
    const runtimePairs = runtimePolicy.source_discoverability.map((observation) => `${observation.source_id}\0${observation.source_path}`).sort(retrievalCodeUnitCompare);
    const oracleIds = [...auditOracle.authorized_source_ids, ...auditOracle.forbidden_source_ids].sort(retrievalCodeUnitCompare);
    const oraclePaths = [...auditOracle.authorized_source_paths, ...auditOracle.forbidden_source_paths].sort(retrievalCodeUnitCompare);
    if (stableJson(runtimePairs) !== stableJson([...snapshotPairs].sort(retrievalCodeUnitCompare)) ||
        runtimePolicy.chunk_discoverability.some((row) => !snapshot.source_observations.some((observation) => observation.source_id === row.source_id)) ||
        stableJson(oracleIds) !== stableJson(snapshot.source_observations.map((observation) => observation.source_id).sort(retrievalCodeUnitCompare)) ||
        stableJson(oraclePaths) !== stableJson(snapshot.source_observations.map((observation) => observation.source_path).sort(retrievalCodeUnitCompare)) ||
        snapshot.source_observations.some((observation) => {
          const authorizedId = auditOracle.authorized_source_ids.includes(observation.source_id);
          const authorizedPath = auditOracle.authorized_source_paths.includes(observation.source_path);
          const forbiddenId = auditOracle.forbidden_source_ids.includes(observation.source_id);
          const forbiddenPath = auditOracle.forbidden_source_paths.includes(observation.source_path);
          return authorizedId !== authorizedPath || forbiddenId !== forbiddenPath || authorizedId === forbiddenId;
        })) failure("GKX_EVAL_FIXTURE_CATALOG_SOURCE_PARTITION_INVALID");
    if (metricDigest(entry, "entry_digest") !== entry.entry_digest) failure("GKX_EVAL_FIXTURE_CATALOG_ENTRY_DIGEST_MISMATCH");
    return entry;
  });
  const keys = entries.map((entry) => `${entry.vault_fixture}\0${entry.backend}\0${entry.embedding_provider_scenario_id}\0${entry.reranker_provider_scenario_id}`);
  if (new Set(keys).size !== keys.length || stableJson(keys) !== stableJson([...keys].sort(retrievalCodeUnitCompare))) failure("GKX_EVAL_FIXTURE_CATALOG_ENTRY_ORDER_INVALID");
  digest(item.catalog_digest, "GKX_EVAL_FIXTURE_CATALOG_DIGEST_INVALID");
  if (metricDigest(item, "catalog_digest") !== item.catalog_digest) failure("GKX_EVAL_FIXTURE_CATALOG_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationFixtureCatalog;
}

export function sealRetrievalEvaluationEnvironmentBundle(value: unknown): RetrievalEvaluationEnvironmentBundle {
  const rawItem = sourceCorpusDataRecord(value, "GKX_EVAL_ENVIRONMENT_BUNDLE_DATA_INVALID");
  exactKeys(rawItem, ["environment_set", "normalized_golden", "fixture_catalog", "source_corpus", "fixed_provider_transcript", "projection_manifests"],
    "GKX_EVAL_ENVIRONMENT_BUNDLE_FIELDS_INVALID");
  preflightSourceCorpus(rawItem.source_corpus);
  // Each companion owns its ratified 8 MiB ceiling.  Do not combine otherwise
  // valid near-cap provider/catalog/environment artifacts under one accidental
  // aggregate clone limit.
  const item = {
    environment_set: clone(rawItem.environment_set),
    normalized_golden: clone(rawItem.normalized_golden),
    fixture_catalog: clone(rawItem.fixture_catalog),
    fixed_provider_transcript: rawItem.fixed_provider_transcript === null ? null : clone(rawItem.fixed_provider_transcript),
    projection_manifests: clone(rawItem.projection_manifests),
  } as Record<string, unknown>;
  const golden = sealNormalizedRetrievalEvaluationGolden(item.normalized_golden);
  const environmentSet = sealRetrievalEvaluationEnvironmentSet(item.environment_set, golden);
  const catalog = sealRetrievalEvaluationFixtureCatalog(item.fixture_catalog);
  const sourceCorpus = sealRetrievalEvaluationSourceCorpus(rawItem.source_corpus);
  const provider = item.fixed_provider_transcript === null ? null : sealRetrievalEvaluationFixedProviderTranscript(item.fixed_provider_transcript);
  if (!Array.isArray(item.projection_manifests) || item.projection_manifests.length !== environmentSet.members.length ||
      catalog.entries.length !== environmentSet.members.length || sourceCorpus.corpora.length !== catalog.entries.length) {
    failure("GKX_EVAL_ENVIRONMENT_BUNDLE_MEMBER_COUNT_INVALID");
  }
  const manifests = (item.projection_manifests as unknown[]).map((raw) => {
    const manifest = raw as AnyRetrievalProjectionManifest;
    assertRetrievalProjectionManifest(manifest);
    if (!isGkxRetrievalProjectionManifest(manifest)) failure("GKX_EVAL_ENVIRONMENT_PROJECTION_SCHEMA_INVALID");
    return manifest;
  });
  const usedCatalogEntries = new Set<string>();
  const usedProviderScopes = new Set<string>();
  const expectedMaximumTopK = Math.max(...golden.queries.map((query) => query.expected_top_k));
  for (const member of environmentSet.members) {
    const environment = member.environment;
    const matches = catalog.entries.filter((entry) => entry.vault_fixture === environment.vault_fixture && entry.backend === environment.lexical_backend &&
      entry.embedding_provider_scenario_id === environment.embedding_role.provider_scenario_id &&
      entry.reranker_provider_scenario_id === environment.reranker_role.provider_scenario_id);
    if (matches.length !== 1) failure("GKX_EVAL_ENVIRONMENT_CATALOG_ENTRY_MISMATCH");
    const entry = matches[0];
    usedCatalogEntries.add(entry.entry_digest);
    const corpusMatches = sourceCorpus.corpora.filter((corpus) => corpus.vault_fixture === entry.vault_fixture &&
      corpus.corpus_fixture_digest === entry.corpus_fixture_digest);
    if (entry.source_corpus_file !== "source-corpus.json" || corpusMatches.length !== 1 ||
        stableJson(corpusMatches[0].source_files.map(({ source_id, source_path, source_digest }) => ({ source_id, source_path, source_digest }))) !==
        stableJson(entry.source_snapshot.source_observations)) failure("GKX_EVAL_ENVIRONMENT_SOURCE_CORPUS_MISMATCH");
    const sourceById = new Map(corpusMatches[0].source_files.map((source) => [source.source_id, source]));
    const sourceByPath = new Map(corpusMatches[0].source_files.map((source) => [source.source_path, source]));
    for (const partition of member.query_partition) {
      const query = golden.queries.find((candidate) => candidate.id === partition.query_id)!;
      const expectedIds = new Set(query.expected_source_ids);
      for (const path of query.expected_files) {
        const source = sourceByPath.get(path);
        if (!source || !entry.evaluation_audit_oracle.authorized_source_ids.includes(source.source_id) ||
            !entry.evaluation_audit_oracle.authorized_source_paths.includes(source.source_path) ||
            entry.evaluation_audit_oracle.forbidden_source_ids.includes(source.source_id) ||
            entry.evaluation_audit_oracle.forbidden_source_paths.includes(source.source_path)) {
          failure("GKX_EVAL_ENVIRONMENT_GOLDEN_SOURCE_RESOLUTION_INVALID");
        }
        expectedIds.add(source.source_id);
      }
      if (expectedIds.size < 1 || [...expectedIds].some((id) => {
        const source = sourceById.get(id);
        return !source || query.forbidden_source_ids.includes(id) || !entry.evaluation_audit_oracle.authorized_source_ids.includes(id) ||
          !entry.evaluation_audit_oracle.authorized_source_paths.includes(source.source_path) ||
          entry.evaluation_audit_oracle.forbidden_source_ids.includes(id) ||
          entry.evaluation_audit_oracle.forbidden_source_paths.includes(source.source_path);
      }) ||
          query.expected_source_ids.some((id) => !sourceById.has(id)) || query.forbidden_source_ids.some((id) => {
            const source = sourceById.get(id);
            return !source || !entry.evaluation_audit_oracle.forbidden_source_ids.includes(id) ||
              !entry.evaluation_audit_oracle.forbidden_source_paths.includes(source.source_path);
          })) failure("GKX_EVAL_ENVIRONMENT_GOLDEN_SOURCE_RESOLUTION_INVALID");
    }
    const manifestMatches = manifests.filter((candidate) => candidate.vault_id === environment.vault_fixture &&
      candidate.lexical_backend === environment.lexical_backend);
    if (manifestMatches.length !== 1) failure("GKX_EVAL_ENVIRONMENT_PROJECTION_SCHEMA_INVALID");
    const manifest = manifestMatches[0];
    if (environment.normalized_golden_digest !== golden.golden_digest || environment.fixture_catalog_digest !== catalog.catalog_digest ||
        environment.corpus_fixture_digest !== entry.corpus_fixture_digest || environment.source_snapshot_digest !== entry.source_snapshot.source_snapshot_digest ||
        environment.runtime_policy_inputs_digest !== entry.runtime_policy_inputs.runtime_policy_inputs_digest ||
        environment.evaluation_audit_oracle_digest !== entry.evaluation_audit_oracle.evaluation_audit_oracle_digest ||
        environment.projection_id !== manifest.projection_id || environment.projection_digest !== manifest.projection_digest ||
        environment.source_snapshot_digest !== manifest.source_snapshot_digest || environment.runtime_policy_inputs_digest !== manifest.policy_digest ||
        environment.lexical_backend !== manifest.lexical_backend || environment.vault_fixture !== manifest.vault_id ||
        environment.gkx_standard_commit !== manifest.gkx_standard_commit || environment.gkx_projection_profile !== manifest.gkx_projection_profile ||
        environment.chunker_version !== manifest.chunker_version || environment.tokenizer_version !== manifest.tokenizer_version) {
      failure("GKX_EVAL_ENVIRONMENT_ARTIFACT_BINDING_MISMATCH");
    }
    const providerActive = environment.embedding_role.state === "active" || environment.reranker_role.state === "active";
    if (!providerActive) {
      if (entry.fixed_provider_transcript_digest !== null || manifest.embedding_provider_id !== null || manifest.embedding_model_id !== null ||
          manifest.embedding_dimensions !== null) failure("GKX_EVAL_ENVIRONMENT_DISABLED_PROVIDER_BINDING_INVALID");
      continue;
    }
    if (provider === null || entry.fixed_provider_transcript_digest !== provider.provider_fixture_digest) {
      failure("GKX_EVAL_ENVIRONMENT_ACTIVE_PROVIDER_BINDING_INVALID");
    }
    const providerScenarios = provider.scenarios.filter((scenario) => scenario.environment_scope.vault_fixture === environment.vault_fixture &&
      scenario.environment_scope.lexical_backend === environment.lexical_backend && scenario.environment_scope.projection_id === environment.projection_id &&
      scenario.environment_scope.projection_digest === environment.projection_digest &&
      scenario.embedding_provider_scenario_id === environment.embedding_role.provider_scenario_id &&
      scenario.reranker_provider_scenario_id === environment.reranker_role.provider_scenario_id);
    if (providerScenarios.length !== 1) failure("GKX_EVAL_ENVIRONMENT_ACTIVE_PROVIDER_BINDING_INVALID");
    const scenario = providerScenarios[0];
    usedProviderScopes.add(scenario.environment_scope.environment_scope_digest);
    const expectedScopeMaterial = {
      contract_version: RETRIEVAL_EVALUATION_FIXED_PROVIDER_SCOPE_VERSION,
      vault_fixture: environment.vault_fixture,
      lexical_backend: environment.lexical_backend,
      normalized_golden_digest: golden.golden_digest,
      normalized_golden_query_count: golden.queries.length,
      corpus_fixture_digest: entry.corpus_fixture_digest,
      source_snapshot_digest: entry.source_snapshot.source_snapshot_digest,
      runtime_policy_inputs_digest: entry.runtime_policy_inputs.runtime_policy_inputs_digest,
      evaluation_audit_oracle_digest: entry.evaluation_audit_oracle.evaluation_audit_oracle_digest,
      projection_id: environment.projection_id,
      projection_digest: environment.projection_digest,
      embedding_role: environment.embedding_role.state === "disabled"
        ? { state: "disabled", provider_scenario_id: "disabled", provider_kind: null, provider_id: null, model_id: null, dimensions: null }
        : { state: "active", provider_scenario_id: environment.embedding_role.provider_scenario_id, provider_kind: environment.embedding_role.provider_kind,
          provider_id: environment.embedding_role.provider_id,
          model_id: environment.embedding_role.model_id, dimensions: environment.embedding_role.dimensions },
      reranker_role: environment.reranker_role.state === "disabled"
        ? { state: "disabled", provider_scenario_id: "disabled", provider_kind: null, provider_id: null, model_id: null }
        : { state: "active", provider_scenario_id: environment.reranker_role.provider_scenario_id, provider_kind: environment.reranker_role.provider_kind,
          provider_id: environment.reranker_role.provider_id,
          model_id: environment.reranker_role.model_id },
    };
    const expectedScope = { ...expectedScopeMaterial, environment_scope_digest: retrievalCanonicalDigest(expectedScopeMaterial) };
    const embeddingBindingValid = environment.embedding_role.state === "active"
      ? environment.embedding_role.fixed_provider_transcript_digest === provider.provider_fixture_digest &&
        environment.embedding_role.provider_kind === provider.embedding_provider.provider_kind &&
        environment.embedding_role.provider_id === provider.embedding_provider.provider_id && environment.embedding_role.model_id === provider.embedding_provider.model_id &&
        environment.embedding_role.dimensions === provider.embedding_provider.dimensions && manifest.embedding_provider_id === provider.embedding_provider.provider_id &&
        manifest.embedding_model_id === provider.embedding_provider.model_id && manifest.embedding_dimensions === provider.embedding_provider.dimensions
      : manifest.embedding_provider_id === null && manifest.embedding_model_id === null && manifest.embedding_dimensions === null;
    const rerankerBindingValid = environment.reranker_role.state === "active"
      ? environment.reranker_role.fixed_provider_transcript_digest === provider.provider_fixture_digest &&
        environment.reranker_role.provider_kind === provider.reranker_provider.provider_kind &&
        environment.reranker_role.provider_id === provider.reranker_provider.provider_id && environment.reranker_role.model_id === provider.reranker_provider.model_id
      : true;
    const expectedQueries = member.query_partition.map((partition) => golden.queries.find((query) => query.id === partition.query_id)!);
    const templateBindingValid = environment.embedding_role.state === "disabled" || stableJson(scenario.embedding_query_templates.map((template) => ({
      query_id: template.query_id, query_digest: template.query_digest, effective_query_text: template.effective_query_text,
    }))) === stableJson(expectedQueries.map((query) => ({
      query_id: query.id, query_digest: query.query_digest, effective_query_text: retrievalEvaluationEffectiveQueryText(query.text),
    })));
    const rerankBindingValid = environment.reranker_role.state === "disabled" || stableJson(scenario.reranker_query_oracles.map((oracle) => ({
      query_id: oracle.query_id, query_digest: oracle.query_digest, effective_query_text: oracle.effective_query_text,
    }))) === stableJson(expectedQueries.map((query) => ({
      query_id: query.id, query_digest: query.query_digest, effective_query_text: retrievalEvaluationEffectiveQueryText(query.text),
    })));
    if (stableJson(scenario.environment_scope) !== stableJson(expectedScope) || stableJson(scenario.eval_schedule.query_partition) !== stableJson(member.query_partition) ||
        (scenario.tune_schedule === null) !== (golden.queries.length > 30) || scenario.tune_schedule !== null &&
          (scenario.tune_schedule.maximum_expected_top_k !== expectedMaximumTopK || stableJson(scenario.tune_schedule.query_partition) !== stableJson(member.query_partition)) ||
        !embeddingBindingValid || !rerankerBindingValid || !templateBindingValid || !rerankBindingValid) {
      failure("GKX_EVAL_ENVIRONMENT_ACTIVE_PROVIDER_BINDING_INVALID");
    }
  }
  if (usedCatalogEntries.size !== catalog.entries.length || provider !== null && usedProviderScopes.size !== provider.scenarios.length ||
      provider === null && usedProviderScopes.size !== 0) failure("GKX_EVAL_ENVIRONMENT_BUNDLE_EXHAUSTIVENESS_INVALID");
  return { environment_set: environmentSet, normalized_golden: golden, fixture_catalog: catalog, source_corpus: sourceCorpus, fixed_provider_transcript: provider,
    projection_manifests: manifests };
}

/**
 * Trusted-host executable seal for the private fixture companion.  The public
 * evaluation bundle deliberately contains no raw corpus or provider authority;
 * this host-only pass replays Full's canonical GKX projection and chunker over
 * the sealed source bytes, then proves the policy, manifest, and fixed-provider
 * coordinates are all-and-only bindings of those derived chunks.
 */
export interface RetrievalEvaluationExecutableEnvironmentDerivation {
  vault_fixture: string;
  projection: ReturnType<typeof projectAuthoredGkxRetrievalCorpus>;
  candidate_chunks: GkxRetrievalCandidateChunk[];
  policy_candidate_sources: GkxRetrievalCandidateSource[];
  policy_candidate_declarations: ReturnType<typeof projectAuthoredGkxRetrievalCorpus>["declarations"];
  policy_candidate_chunks: GkxRetrievalCandidateChunk[];
  source_bytes_by_path: ReadonlyMap<string, Uint8Array>;
  corpus: RetrievalEvaluationSourceCorpus["corpora"][number];
  catalog_entry: RetrievalEvaluationFixtureCatalog["entries"][number];
  environment_member: RetrievalEvaluationEnvironmentSet["members"][number];
  manifest: GkxRetrievalProjectionManifest;
  provider_scenario: RetrievalEvaluationFixedProviderScenario | null;
}

/**
 * Production-equivalent offline index receipt derivation. Content-equivalent
 * chunks share the first representative, representatives sort by content
 * digest, and calls use the coordinator's exact 32-item/262144-byte batching,
 * offsets, request IDs, and success-only response binding.
 */
export function deriveRetrievalEvaluationProviderIndexReceipts(
  candidates: readonly GkxRetrievalCandidateChunk[],
  responseOracleTemplates: readonly RetrievalEvaluationFixedEmbeddingIndexTemplate[],
): RetrievalEvaluationFixedEmbeddingIndexTemplate[] {
  const uniqueByContent = new Map<string, GkxRetrievalCandidateChunk>();
  for (const candidate of candidates) {
    if (!uniqueByContent.has(candidate.chunk.content_digest)) uniqueByContent.set(candidate.chunk.content_digest, candidate);
  }
  const representatives = [...uniqueByContent.values()].sort((left, right) =>
    retrievalCodeUnitCompare(left.chunk.content_digest, right.chunk.content_digest));
  const responseByDigest = new Map<string, RetrievalEvaluationFixedEmbeddingResponse>();
  for (const template of responseOracleTemplates) for (const response of template.responses) {
    const prior = responseByDigest.get(response.input_digest);
    if (prior && stableJson(prior) !== stableJson(response)) failure("GKX_EVAL_SOURCE_CORPUS_PROVIDER_VECTOR_BINDING_INVALID");
    responseByDigest.set(response.input_digest, response);
  }
  const result: RetrievalEvaluationFixedEmbeddingIndexTemplate[] = [];
  let offset = 0;
  while (offset < representatives.length) {
    const batch: GkxRetrievalCandidateChunk[] = [];
    let batchBytes = 0;
    while (offset + batch.length < representatives.length && batch.length < 32) {
      const candidate = representatives[offset + batch.length];
      const candidateBytes = Buffer.byteLength(candidate.chunk.text, "utf8");
      if (batch.length > 0 && batchBytes + candidateBytes > 262_144) break;
      batch.push(candidate);
      batchBytes += candidateBytes;
    }
    const chunkInputs = batch.map((candidate) => ({
      accepted_chunk_id: candidate.chunk.chunk_id,
      input_digest: candidate.chunk.content_digest,
    }));
    const responses = chunkInputs.map((input) => {
      const response = responseByDigest.get(input.input_digest);
      if (!response || response.accepted_chunk_id !== input.accepted_chunk_id) {
        failure("GKX_EVAL_SOURCE_CORPUS_PROVIDER_VECTOR_BINDING_INVALID");
      }
      return response;
    });
    const ordinal = result.length + 1;
    const material = {
      template_id: `embedding-index-${String(ordinal).padStart(3, "0")}`,
      phase: "index" as const,
      embedding_call_ordinal: ordinal,
      batch_offset: offset,
      request_id: retrievalSha256(`index\0${offset}\0${chunkInputs.map((input) => input.input_digest).join("\0")}`),
      chunk_inputs: chunkInputs,
      item_count: chunkInputs.length,
      outcome: "success" as const,
      responses,
      error_code: null,
      expected_vector_stage: { state: "active" as const, reason_codes: [] as [] },
    };
    result.push({ ...material, template_digest: retrievalCanonicalDigest(material) });
    offset += batch.length;
  }
  return result;
}

export function verifyRetrievalEvaluationProviderIndexReceipts(
  candidates: readonly GkxRetrievalCandidateChunk[],
  templates: readonly RetrievalEvaluationFixedEmbeddingIndexTemplate[],
): RetrievalEvaluationFixedEmbeddingIndexTemplate[] {
  const expected = deriveRetrievalEvaluationProviderIndexReceipts(candidates, templates);
  if (stableJson(expected) !== stableJson(templates)) failure("GKX_EVAL_SOURCE_CORPUS_PROVIDER_INDEX_BIJECTION_INVALID");
  return expected;
}

export function deriveRetrievalEvaluationExecutableEnvironmentBundle(value: unknown): {
  bundle: RetrievalEvaluationEnvironmentBundle;
  derivations: RetrievalEvaluationExecutableEnvironmentDerivation[];
} {
  const bundle = sealRetrievalEvaluationEnvironmentBundle(value);
  const derivations: RetrievalEvaluationExecutableEnvironmentDerivation[] = [];
  const provider = bundle.fixed_provider_transcript;
  const manifestByVault = new Map(bundle.projection_manifests.map((manifest) => [manifest.vault_id, manifest]));
  const catalogByVault = new Map(bundle.fixture_catalog.entries.map((entry) => [entry.vault_fixture, entry]));

  for (const corpus of bundle.source_corpus.corpora) {
    const entry = catalogByVault.get(corpus.vault_fixture);
    const manifest = manifestByVault.get(corpus.vault_fixture) as GkxRetrievalProjectionManifest | undefined;
    if (!entry || !manifest || corpus.source_files.some((source) => !isNotePath(source.source_path) || extensionFromPath(source.source_path) === undefined)) {
      failure("GKX_EVAL_SOURCE_CORPUS_CANONICAL_PROJECTION_INVALID");
    }
    let projection: ReturnType<typeof projectAuthoredGkxRetrievalCorpus>;
    try {
      projection = projectAuthoredGkxRetrievalCorpus(corpus.source_files.map((source) => ({
        relativePath: source.source_path,
        content: Buffer.from(source.source_bytes_base64, "base64").toString("utf8"),
        kind: "note" as const,
      })));
    } catch {
      failure("GKX_EVAL_SOURCE_CORPUS_CANONICAL_PROJECTION_INVALID");
    }
    if (projection.rejections.length !== 0 || projection.parse_count !== corpus.source_files.length ||
        projection.sources.length !== corpus.source_files.length) {
      failure("GKX_EVAL_SOURCE_CORPUS_CANONICAL_PROJECTION_INVALID");
    }

    const corpusByPair = new Map(corpus.source_files.map((source) => [`${source.source_id}\0${source.source_path}`, source]));
    const sourcePolicyByPair = new Map(entry.runtime_policy_inputs.source_discoverability.map((source) =>
      [`${source.source_id}\0${source.source_path}`, source]));
    const candidateChunks: GkxRetrievalCandidateChunk[] = [];
    const recordPolicy = new Map<string, boolean>();
    for (const projected of projection.sources) {
      const pair = `${projected.chunk_input.source_id}\0${projected.chunk_input.source_path}`;
      const source = corpusByPair.get(pair);
      const policy = sourcePolicyByPair.get(pair);
      if (!source || !policy || projected.chunk_input.text !== Buffer.from(source.source_bytes_base64, "base64").toString("utf8") ||
          retrievalSha256(projected.chunk_input.text) !== source.source_digest) {
        failure("GKX_EVAL_SOURCE_CORPUS_CANONICAL_SOURCE_BINDING_INVALID");
      }
      let chunks: ReturnType<typeof chunkMarkdown>;
      try { chunks = chunkMarkdown(projected.chunk_input); }
      catch { failure("GKX_EVAL_SOURCE_CORPUS_CANONICAL_CHUNKING_INVALID"); }
      if (chunks.length < 1) failure("GKX_EVAL_SOURCE_CORPUS_CANONICAL_CHUNKING_INVALID");
      const boundChunks = bindGkxRetrievalCandidateChunks(projected.record_key, chunks);
      candidateChunks.push(...boundChunks);
      recordPolicy.set(projected.record_key, policy.discoverable);
    }
    if (new Set(candidateChunks.map((candidate) => candidate.chunk.chunk_id)).size !== candidateChunks.length) {
      failure("GKX_EVAL_SOURCE_CORPUS_DERIVED_CHUNK_DUPLICATE");
    }

    // The catalog's endpoint role is a complete audit-only partition of the
    // canonical declaration view.  It is deliberately derived independently
    // of runtime discoverability so the oracle never becomes a policy input.
    // An endpoint occurrence is authorized only when both its owning source
    // and resolved target source are in the catalog's authorized source
    // partition; any occurrence touching a forbidden source is forbidden.
    let completeAuditView: ReturnType<typeof buildGkxRetrievalAuthorizedCandidateView>;
    try {
      completeAuditView = buildGkxRetrievalAuthorizedCandidateView(
        projection.sources.map((source) => source.candidate_source),
        projection.declarations,
        candidateChunks,
        null,
      );
    } catch {
      failure("GKX_EVAL_SOURCE_CORPUS_ENDPOINT_PARTITION_INVALID");
    }
    const authorizedSourceIds = new Set(entry.evaluation_audit_oracle.authorized_source_ids);
    const forbiddenSourceIds = new Set(entry.evaluation_audit_oracle.forbidden_source_ids);
    const authorizedEndpointIds = new Set<string>();
    const forbiddenEndpointIds = new Set<string>();
    for (const source of completeAuditView.temporal_sources) {
      const ownerAuthorized = authorizedSourceIds.has(source.source_id);
      const ownerForbidden = forbiddenSourceIds.has(source.source_id);
      if (ownerAuthorized === ownerForbidden) failure("GKX_EVAL_SOURCE_CORPUS_ENDPOINT_PARTITION_INVALID");
      for (const endpointId of [...source.supersedes, ...source.superseded_by]) {
        const targetAuthorized = authorizedSourceIds.has(endpointId);
        const targetForbidden = forbiddenSourceIds.has(endpointId);
        if (targetAuthorized === targetForbidden) failure("GKX_EVAL_SOURCE_CORPUS_ENDPOINT_PARTITION_INVALID");
        if (ownerAuthorized && targetAuthorized) authorizedEndpointIds.add(endpointId);
        else forbiddenEndpointIds.add(endpointId);
      }
    }
    for (const endpointId of forbiddenEndpointIds) authorizedEndpointIds.delete(endpointId);
    const expectedAuthorizedEndpoints = [...authorizedEndpointIds].sort(retrievalCodeUnitCompare);
    const expectedForbiddenEndpoints = [...forbiddenEndpointIds].sort(retrievalCodeUnitCompare);
    if (stableJson(expectedAuthorizedEndpoints) !== stableJson(entry.evaluation_audit_oracle.authorized_endpoint_ids) ||
        stableJson(expectedForbiddenEndpoints) !== stableJson(entry.evaluation_audit_oracle.forbidden_endpoint_ids)) {
      failure("GKX_EVAL_SOURCE_CORPUS_ENDPOINT_PARTITION_INVALID");
    }
    const expectedPolicyChunks = candidateChunks.map((candidate) => ({
      chunk_id: candidate.chunk.chunk_id,
      source_id: candidate.chunk.source_id,
      discoverable: recordPolicy.get(candidate.record_key)!,
    })).sort((left, right) => retrievalCodeUnitCompare(stableJson(left), stableJson(right)));
    if (stableJson(expectedPolicyChunks) !== stableJson(entry.runtime_policy_inputs.chunk_discoverability)) {
      failure("GKX_EVAL_SOURCE_CORPUS_CHUNK_POLICY_BIJECTION_INVALID");
    }

    // Production applies source policy first, then the established all-or-
    // nothing chunk policy per source.  The audit oracle is intentionally not
    // consulted here: a deliberately leaking runtime-policy mutation must
    // reach the post-result policy-leak metric instead of becoming a second
    // authorization input.
    const chunksByRecord = new Map<string, GkxRetrievalCandidateChunk[]>();
    for (const candidate of candidateChunks) {
      const group = chunksByRecord.get(candidate.record_key) ?? [];
      group.push(candidate);
      chunksByRecord.set(candidate.record_key, group);
    }
    const chunkPolicyById = new Map(entry.runtime_policy_inputs.chunk_discoverability.map((row) => [row.chunk_id, row]));
    const policyEligibleRecordKeys = new Set(projection.sources.filter((source) => {
      if (recordPolicy.get(source.record_key) !== true) return false;
      const group = chunksByRecord.get(source.record_key) ?? [];
      return group.length === 0 || group.every((candidate) => chunkPolicyById.get(candidate.chunk.chunk_id)?.discoverable === true);
    }).map((source) => source.record_key));
    const policyEligibleCandidates = candidateChunks.filter((candidate) => policyEligibleRecordKeys.has(candidate.record_key));

    const environmentMember = bundle.environment_set.members.find((member) => member.environment.vault_fixture === corpus.vault_fixture);
    if (!environmentMember) failure("GKX_EVAL_SOURCE_CORPUS_ENVIRONMENT_SCOPE_INVALID");
    const scenario = provider?.scenarios.find((candidate) =>
      candidate.environment_scope.vault_fixture === corpus.vault_fixture &&
      candidate.environment_scope.lexical_backend === environmentMember.environment.lexical_backend &&
      candidate.environment_scope.projection_id === environmentMember.environment.projection_id &&
      candidate.environment_scope.projection_digest === environmentMember.environment.projection_digest &&
      candidate.embedding_provider_scenario_id === environmentMember.environment.embedding_role.provider_scenario_id &&
      candidate.reranker_provider_scenario_id === environmentMember.environment.reranker_role.provider_scenario_id);
    const embeddingActive = environmentMember.environment.embedding_role.state === "active";
    const rerankerActive = environmentMember.environment.reranker_role.state === "active";
    if ((embeddingActive || rerankerActive) && !scenario || !embeddingActive && !rerankerActive && scenario) {
      failure("GKX_EVAL_SOURCE_CORPUS_PROVIDER_SCOPE_INVALID");
    }
    const indexTemplates = scenario?.embedding_index_templates ?? [];
    const expectedIndexTemplates = embeddingActive
      ? deriveRetrievalEvaluationProviderIndexReceipts(policyEligibleCandidates, indexTemplates)
      : [];
    if (embeddingActive) {
      if (!scenario || stableJson(indexTemplates) !== stableJson(expectedIndexTemplates)) {
        failure("GKX_EVAL_SOURCE_CORPUS_PROVIDER_INDEX_BIJECTION_INVALID");
      }
    } else if (indexTemplates.length !== 0) failure("GKX_EVAL_SOURCE_CORPUS_PROVIDER_INDEX_BIJECTION_INVALID");

    const responseByDigest = new Map<string, RetrievalEvaluationFixedEmbeddingResponse>();
    for (const template of expectedIndexTemplates) for (const response of template.responses) {
      const prior = responseByDigest.get(response.input_digest);
      if (prior && stableJson(prior.values_micros) !== stableJson(response.values_micros)) {
        failure("GKX_EVAL_SOURCE_CORPUS_PROVIDER_VECTOR_BINDING_INVALID");
      }
      responseByDigest.set(response.input_digest, response);
    }
    const expectedManifest = deriveGkxRetrievalProjectionManifest({
      vault_id: corpus.vault_fixture,
      source_snapshot_digest: entry.source_snapshot.source_snapshot_digest,
      configuration_digest: manifest.configuration_digest,
      policy_digest: entry.runtime_policy_inputs.runtime_policy_inputs_digest,
      candidate_sources: projection.sources.map((source) => source.candidate_source),
      candidate_declarations: projection.declarations,
      candidate_chunks: candidateChunks,
      embedding_eligible_candidate_chunk_keys: policyEligibleCandidates.map((candidate) => candidate.candidate_chunk_key),
      vectors: embeddingActive ? policyEligibleCandidates.map((candidate) => {
        const response = responseByDigest.get(candidate.chunk.content_digest);
        if (!response) failure("GKX_EVAL_SOURCE_CORPUS_PROVIDER_VECTOR_BINDING_INVALID");
        return {
          candidate_chunk_key: candidate.candidate_chunk_key,
          vector: Array.from(Float32Array.from(response.values_micros, (part) => part / 1_000_000)),
        };
      }) : [],
      embedding_provider_id: embeddingActive ? provider!.embedding_provider.provider_id : null,
      embedding_model_id: embeddingActive ? provider!.embedding_provider.model_id : null,
      embedding_dimensions: embeddingActive ? provider!.embedding_provider.dimensions : null,
    }, environmentMember.environment.lexical_backend);
    if (stableJson(expectedManifest) !== stableJson(manifest)) {
      failure("GKX_EVAL_SOURCE_CORPUS_MANIFEST_RELATION_INVALID");
    }

    const policySources = projection.sources.filter((source) => policyEligibleRecordKeys.has(source.record_key))
      .map((source) => source.candidate_source);
    const policyDeclarations = projection.declarations.filter((declaration) => policyEligibleRecordKeys.has(declaration.source_record_key));
    derivations.push({
      vault_fixture: corpus.vault_fixture,
      projection,
      candidate_chunks: candidateChunks,
      policy_candidate_sources: policySources,
      policy_candidate_declarations: policyDeclarations,
      policy_candidate_chunks: policyEligibleCandidates,
      source_bytes_by_path: new Map(corpus.source_files.map((source) => [
        source.source_path,
        Buffer.from(source.source_bytes_base64, "base64"),
      ])),
      corpus,
      catalog_entry: entry,
      environment_member: environmentMember,
      manifest,
      provider_scenario: scenario ?? null,
    });
    if (!scenario) continue;
    const expectedQueries = environmentMember.query_partition.map((queryCoordinate) => {
      const query = bundle.normalized_golden.queries.find((candidate) => candidate.id === queryCoordinate.query_id);
      if (!query || query.query_digest !== queryCoordinate.query_digest) failure("GKX_EVAL_SOURCE_CORPUS_ENVIRONMENT_SCOPE_INVALID");
      return query;
    });
    const oracleByQuery = new Map(scenario.reranker_query_oracles.map((oracle) => [oracle.query_id, oracle]));
    for (const query of expectedQueries) {
      let temporalView: ReturnType<typeof buildGkxRetrievalAuthorizedCandidateView>;
      try {
        temporalView = buildGkxRetrievalAuthorizedCandidateView(policySources, policyDeclarations, policyEligibleCandidates, query.as_of);
      } catch {
        failure("GKX_EVAL_SOURCE_CORPUS_QUERY_TEMPORAL_BINDING_INVALID");
      }
      const temporalEligibleKeys = new Set(temporalView.eligible_candidate_chunk_keys);
      const temporalEligibleById = new Map(policyEligibleCandidates
        .filter((candidate) => temporalEligibleKeys.has(candidate.candidate_chunk_key))
        .map((candidate) => [candidate.chunk.chunk_id, candidate]));
      const oracle = oracleByQuery.get(query.id);
      if (rerankerActive && !oracle || !rerankerActive && oracle) failure("GKX_EVAL_SOURCE_CORPUS_PROVIDER_RERANK_BIJECTION_INVALID");
      if (oracle && oracle.candidate_score_universe.some((candidate) => {
        const derivedCandidate = temporalEligibleById.get(candidate.candidate_chunk_id);
        return !derivedCandidate || derivedCandidate.chunk.content_digest !== candidate.input_digest;
      })) failure("GKX_EVAL_SOURCE_CORPUS_PROVIDER_RERANK_BIJECTION_INVALID");
    }

    for (const schedule of [scenario.eval_schedule, scenario.tune_schedule].filter((item): item is RetrievalEvaluationFixedProviderSchedule => item !== null)) {
      if (!rerankerActive) continue;
      for (let index = 0; index < schedule.occurrence_matrix.length; index++) {
        const cell = schedule.occurrence_matrix[index];
        const query = schedule.query_partition[index % schedule.query_partition.length];
        const oracle = oracleByQuery.get(query.query_id);
        if (!oracle || cell[2] === null || cell[2] > oracle.candidate_score_universe.length) {
          failure("GKX_EVAL_SOURCE_CORPUS_PROVIDER_REQUEST_BINDING_INVALID");
        }
        // The reviewed fixture's complete request can be inverted and bound
        // now. Smaller axis-specific subsets remain enforced later by the
        // occurrence verifier against this exact authorized universe.
        if (cell[2] === oracle.candidate_score_universe.length) {
          const requestMaterial = {
            contract_version: RETRIEVAL_EVALUATION_FIXED_PROVIDER_REQUEST_VERSION,
            call_kind: "reranker_query",
            request_id: oracle.request_id,
            query_id: oracle.query_id,
            query_digest: oracle.query_digest,
            query_text: oracle.effective_query_text,
            ordered_inputs: oracle.candidate_score_universe.map((candidate) => ({
              candidate_chunk_id: candidate.candidate_chunk_id,
              input_digest: candidate.input_digest,
            })),
          };
          if (cell[1] !== retrievalCanonicalDigest(requestMaterial)) {
            failure("GKX_EVAL_SOURCE_CORPUS_PROVIDER_REQUEST_BINDING_INVALID");
          }
        }
      }
    }
  }
  return { bundle, derivations };
}

export function sealRetrievalEvaluationExecutableEnvironmentBundle(value: unknown): RetrievalEvaluationEnvironmentBundle {
  return deriveRetrievalEvaluationExecutableEnvironmentBundle(value).bundle;
}
