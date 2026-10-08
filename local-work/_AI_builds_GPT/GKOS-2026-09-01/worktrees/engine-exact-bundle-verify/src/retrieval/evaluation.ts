import { isValidGkxAuthoredUid } from "../gkx23";
import { TextDecoder, types as utilTypes } from "node:util";
import {
  RETRIEVAL_CHUNKER_VERSION,
  RETRIEVAL_GKX_PROJECTION_PROFILE,
  RETRIEVAL_GKX_STANDARD_COMMIT,
  RETRIEVAL_LINEAGE_PROJECTION_SCHEMA_VERSION,
  RETRIEVAL_LINEAGE_CONTRACT_VERSION,
  RETRIEVAL_TOKENIZER_VERSION,
} from "./contracts";
import { ENGINE_VERSION } from "../version";
import {
  retrievalCanonicalDigest,
  retrievalCodeUnitCompare,
  retrievalSha256,
  stableJson,
} from "./digest";
import { isValidRetrievalSourcePath, validateRetrievalChunk } from "./chunker";
import { normalizeRetrievalAsOf } from "./provenance";
import type { GkxRetrievalSearchResult, SourceCitation } from "./types";
import { retrievalEvaluationDecodedBase64Length } from "./evaluation-bounds";
import { assessRetrievalConfidence } from "./confidence";
import { lexicalQueryClauses } from "./lexical";
import {
  gkxRetrievalDeduplicateOverlapEvidence,
  gkxRetrievalVerifiedCitation,
  type GkxRetrievalAcceptedCitationInterval,
} from "./coordinator";

export const RETRIEVAL_EVALUATION_CONTRACT_VERSION = "gkos-retrieval-evaluation/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_GOLDEN_VERSION = "gkos-retrieval-evaluation-golden/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_METRIC_VERSION = "gkos-retrieval-evaluation-metrics/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_QUERY_METRICS_VERSION = "gkos-retrieval-evaluation-query-metrics/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_AGGREGATE_VERSION = "gkos-retrieval-evaluation-aggregate/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_COMPARISON_VERSION = "gkos-retrieval-evaluation-comparison/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_TUNE_SELECTION_VERSION = "gkos-retrieval-evaluation-tune-selection/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_SCENARIO_OUTCOME_VERSION = "gkos-retrieval-evaluation-scenario-outcome/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_SCENARIO_COMPARISON_VERSION = "gkos-retrieval-evaluation-scenario-comparison/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_NDCG_TABLE_VERSION = "gkos-retrieval-evaluation-ndcg-table/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_ENVIRONMENT_VERSION = "gkos-retrieval-evaluation-environment/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_ENVIRONMENT_SET_VERSION = "gkos-retrieval-evaluation-environment-set/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_METRICS_SET_VERSION = "gkos-retrieval-evaluation-metrics-set/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_QUERY_METRICS_SET_VERSION = "gkos-retrieval-evaluation-query-metrics-set/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_BASELINE_VERSION = "gkos-retrieval-evaluation-baseline/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_EVALUATION_COORDINATE_VERSION = "gkos-retrieval-evaluation-evaluation-coordinate/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_BASE_CONFIGURATION_VERSION = "gkos-retrieval-evaluation-base-configuration/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_TUNING_AXES_VERSION = "gkos-retrieval-evaluation-tuning-axes/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_TUNING_GRID_VERSION = "gkos-retrieval-evaluation-tuning-grid/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_OBSERVATION_VERSION = "gkos-retrieval-evaluation-observation/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_QUERY_VIEW_AUDIT_ORACLE_VERSION = "gkos-retrieval-evaluation-query-view-audit-oracle/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_NDCG_DISCOUNT_SCALE = 1_000_000_000_000 as const;
export const RETRIEVAL_EVALUATION_METRIC_SCALE = 1_000_000 as const;
export const RETRIEVAL_EVALUATION_MAX_SOURCE_OBSERVATIONS = 4_096 as const;
export const RETRIEVAL_EVALUATION_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
export const RETRIEVAL_EVALUATION_MAX_TOTAL_SOURCE_BYTES = 512 * 1024 * 1024;

/**
 * Authoritative binary-DCG discounts. The checked-in generator uses Python
 * 3.11 Decimal precision 80 and ROUND_HALF_UP on
 * scale * ln(2) / ln(rank + 1). Runtime code never computes a logarithm.
 */
export const RETRIEVAL_EVALUATION_NDCG_DISCOUNT_SCALED = Object.freeze([
  1000000000000, 630929753571, 500000000000, 430676558073, 386852807235,
  356207187108, 333333333333, 315464876786, 301029995664, 289064826318,
  278942945651, 270238154427, 262649535037, 255958024810, 250000000000,
  244650542118, 239812466568, 235408913367, 231378213160, 227670248697,
  224243824218, 221064729458, 218104291986, 215338279037, 212746053553,
  210309917857, 208014597677, 205846832460, 203795047091, 201849086582,
  200000000000, 198239863171, 196561632233, 194959021894, 193426403617,
  191958720007, 190551412427, 189200359517, 187901824709, 186652411239,
  185449023415, 184288833149, 183169250914, 182087900470, 181042596780,
  180031326657, 179052231751, 178103593554, 177183820136, 176291434389,
  175425063582, 174583430048, 173765342871, 172969690445, 172195433794,
  171441600574, 170707279664, 169991616287, 169293807599, 168613098690,
  167948778957, 167300178810, 166666666667, 166047646216, 165442553919,
  164850856722, 164272049962, 163705655445, 163151219684, 162608312272,
  162076524393, 161555467443, 161044771756, 160544085434, 160053073255,
  159571415670, 159098807869, 158634958916, 158179590940, 157732438393,
  157293247350, 156861774859, 156437788342, 156021065022, 155611391402,
  155208562770, 154812382736, 154422662801, 154039221954, 153661886290,
  153290488653, 152924868303, 152564870601, 152210346713, 151861153331,
  151517152410, 151178210922, 150844200623, 150514997832, 150190483224,
] as const);

const NDCG_TABLE_MATERIAL = Object.freeze({
  contract_version: RETRIEVAL_EVALUATION_NDCG_TABLE_VERSION,
  ndcg_discount_scale: RETRIEVAL_EVALUATION_NDCG_DISCOUNT_SCALE,
  rank_count: 100,
  ndcg_discount_scaled: RETRIEVAL_EVALUATION_NDCG_DISCOUNT_SCALED,
  generator: Object.freeze({
    arithmetic: "decimal",
    precision: 80,
    rounding: "ROUND_HALF_UP",
    formula: "ndcg_discount_scale * ln(2) / ln(rank + 1)",
  }),
});

export const RETRIEVAL_EVALUATION_NDCG_TABLE = Object.freeze({
  ...NDCG_TABLE_MATERIAL,
  table_digest: retrievalCanonicalDigest(NDCG_TABLE_MATERIAL),
});

export const RETRIEVAL_EVALUATION_TUNING_GRID = Object.freeze({
  rrf_k: Object.freeze([5, 10, 20, 30, 60, 100]),
  mmr: Object.freeze([
    Object.freeze({ enabled: false, lambda_micros: null }),
    Object.freeze({ enabled: true, lambda_micros: 0 }),
    Object.freeze({ enabled: true, lambda_micros: 300_000 }),
    Object.freeze({ enabled: true, lambda_micros: 500_000 }),
    Object.freeze({ enabled: true, lambda_micros: 700_000 }),
    Object.freeze({ enabled: true, lambda_micros: 1_000_000 }),
  ]),
  semantic_top_k: Object.freeze([5, 10, 20, 40, 80]),
  lexical_top_k: Object.freeze([5, 10, 20, 40, 80]),
});

const TUNING_GRID_COORDINATE_MATERIAL = Object.freeze({
  contract_version: RETRIEVAL_EVALUATION_TUNING_GRID_VERSION,
  rrf_k: RETRIEVAL_EVALUATION_TUNING_GRID.rrf_k,
  mmr: RETRIEVAL_EVALUATION_TUNING_GRID.mmr,
  semantic_top_k: RETRIEVAL_EVALUATION_TUNING_GRID.semantic_top_k,
  lexical_top_k: RETRIEVAL_EVALUATION_TUNING_GRID.lexical_top_k,
  candidate_count: 900 as const,
});

export const RETRIEVAL_EVALUATION_TUNING_GRID_COORDINATE = Object.freeze({
  ...TUNING_GRID_COORDINATE_MATERIAL,
  tuning_grid_digest: retrievalCanonicalDigest(TUNING_GRID_COORDINATE_MATERIAL),
});

export type RetrievalEvaluationConfidence = "high" | "medium" | "low" | "insufficient";

export interface NormalizedRetrievalEvaluationQuery {
  id: string;
  text: string;
  vault_fixture: string;
  expected_files: string[];
  expected_source_ids: string[];
  expected_lineage_ids: [];
  forbidden_source_ids: string[];
  forbidden_lineage_ids: [];
  expected_top_k: number;
  expected_confidence: Exclude<RetrievalEvaluationConfidence, "insufficient">;
  as_of: string | null;
  query_digest: string;
}

export interface NormalizedRetrievalEvaluationGolden {
  contract_version: typeof RETRIEVAL_EVALUATION_GOLDEN_VERSION;
  queries: NormalizedRetrievalEvaluationQuery[];
  golden_digest: string;
}

export interface RetrievalEvaluationSourceObservation {
  source_id: string;
  source_path: string;
  source_digest: string;
  source_bytes_base64: string;
}

export interface RetrievalEvaluationQueryViewAuditOracle {
  contract_version: typeof RETRIEVAL_EVALUATION_QUERY_VIEW_AUDIT_ORACLE_VERSION;
  authorized_source_ids: string[];
  authorized_source_paths: string[];
  forbidden_source_ids: string[];
  forbidden_source_paths: string[];
  authorized_endpoint_ids: string[];
  forbidden_endpoint_ids: string[];
  expected_public_result_projection_id: string;
  expected_public_result_projection_digest: string;
  oracle_digest: string;
}

export interface RetrievalEvaluationExpectedTemporalHit {
  source_id: string;
  temporal_state: "current" | "historical" | "unknown";
  valid_from: string | null;
  valid_to: string | null;
  supersedes: string[];
  superseded_by: string[];
}

export interface RetrievalEvaluationExpectedTemporal {
  coverage: "not_requested" | "not_evaluated" | "sufficient" | "insufficient";
  hits: RetrievalEvaluationExpectedTemporalHit[];
}

export interface RetrievalEvaluationQueryInput {
  query: NormalizedRetrievalEvaluationQuery;
  result: GkxRetrievalSearchResult;
  source_observations: RetrievalEvaluationSourceObservation[];
  audit_oracle: RetrievalEvaluationQueryViewAuditOracle;
  expected_temporal: RetrievalEvaluationExpectedTemporal;
}

export interface RetrievalEvaluationCitationMetrics {
  applicability: "required" | "not_applicable";
  checked: number;
  passed: number;
  mismatch: number;
  stale: number;
  correctness_micros: number | null;
}

export interface RetrievalEvaluationPolicyMetrics {
  policy_identity_field_count: number;
  policy_leak_count: number;
  policy_leak_rate_micros: number;
}

export interface RetrievalEvaluationQueryMetrics {
  contract_version: typeof RETRIEVAL_EVALUATION_QUERY_METRICS_VERSION;
  query_id: string;
  expected_top_k: number;
  relevant_source_count: number;
  returned_unique_source_count: number;
  relevant_returned_source_count: number;
  relevant_source_ranks: number[];
  first_relevant_rank: number | null;
  recall_at_k_micros: number;
  mrr_micros: number;
  ndcg_at_k_micros: number;
  citation: RetrievalEvaluationCitationMetrics;
  policy: RetrievalEvaluationPolicyMetrics;
  confidence_mismatch_count: number;
  temporal_mismatch_count: number;
  stale_citation_query_count: number;
  stale_projection_query_count: number;
  unverified_projection_query_count: number;
  query_metrics_digest: string;
}

export interface RetrievalEvaluationAggregateMetrics {
  contract_version: typeof RETRIEVAL_EVALUATION_AGGREGATE_VERSION;
  query_count: number;
  recall_at_k_micros: number;
  mrr_micros: number;
  ndcg_at_k_micros: number;
  citation: RetrievalEvaluationCitationMetrics;
  policy: RetrievalEvaluationPolicyMetrics;
  confidence_mismatch_count: number;
  temporal_mismatch_count: number;
  stale_citation_query_count: number;
  stale_citation_query_rate_micros: number;
  stale_projection_query_count: number;
  unverified_projection_query_count: number;
  unverified_projection_rate_micros: number;
  aggregate_metrics_digest: string;
}

export type RetrievalEvaluationEmbeddingRole = {
  state: "disabled";
  provider_scenario_id: "disabled";
  provider_kind: null;
  provider_id: null;
  model_id: null;
  dimensions: null;
  fixed_provider_transcript_digest: null;
} | {
  state: "active";
  provider_scenario_id: string;
  provider_kind: "openai_compatible" | "local_onnx" | "mcp";
  provider_id: string;
  model_id: string;
  dimensions: number;
  fixed_provider_transcript_digest: string;
};

export type RetrievalEvaluationRerankerRole = {
  state: "disabled";
  provider_scenario_id: "disabled";
  provider_kind: null;
  provider_id: null;
  model_id: null;
  fixed_provider_transcript_digest: null;
} | {
  state: "active";
  provider_scenario_id: string;
  provider_kind: "openai_compatible" | "local_onnx" | "mcp";
  provider_id: string;
  model_id: string;
  fixed_provider_transcript_digest: string;
};

export interface RetrievalEvaluationEnvironmentCoordinate {
  contract_version: typeof RETRIEVAL_EVALUATION_ENVIRONMENT_VERSION;
  scenario_id: string;
  vault_fixture: string;
  retrieval_contract_version: typeof RETRIEVAL_LINEAGE_CONTRACT_VERSION;
  evaluation_contract_version: typeof RETRIEVAL_EVALUATION_CONTRACT_VERSION;
  golden_contract_version: typeof RETRIEVAL_EVALUATION_GOLDEN_VERSION;
  metric_contract_version: typeof RETRIEVAL_EVALUATION_METRIC_VERSION;
  engine_version: typeof ENGINE_VERSION;
  gkx_standard_commit: typeof RETRIEVAL_GKX_STANDARD_COMMIT;
  gkx_projection_profile: typeof RETRIEVAL_GKX_PROJECTION_PROFILE;
  projection_schema_version: typeof RETRIEVAL_LINEAGE_PROJECTION_SCHEMA_VERSION;
  chunker_version: typeof RETRIEVAL_CHUNKER_VERSION;
  tokenizer_version: typeof RETRIEVAL_TOKENIZER_VERSION;
  lexical_backend: "sqlite_fts5" | "sqlite_lexical_scan";
  normalized_golden_digest: string;
  fixture_catalog_digest: string;
  corpus_fixture_digest: string;
  source_snapshot_digest: string;
  runtime_policy_inputs_digest: string;
  evaluation_audit_oracle_digest: string;
  projection_id: string;
  projection_digest: string;
  embedding_role: RetrievalEvaluationEmbeddingRole;
  reranker_role: RetrievalEvaluationRerankerRole;
  ndcg_discount_table_digest: string;
  metric_scale: typeof RETRIEVAL_EVALUATION_METRIC_SCALE;
  environment_digest: string;
}

export interface RetrievalEvaluationEnvironmentSetMember {
  environment: RetrievalEvaluationEnvironmentCoordinate;
  query_partition: Array<{ query_id: string; query_digest: string }>;
  query_count: number;
  member_digest: string;
}

export interface RetrievalEvaluationEnvironmentSet {
  contract_version: typeof RETRIEVAL_EVALUATION_ENVIRONMENT_SET_VERSION;
  normalized_golden_digest: string;
  query_count: number;
  members: RetrievalEvaluationEnvironmentSetMember[];
  environment_set_digest: string;
}

export interface RetrievalEvaluationMetricsSetQueryEvaluation {
  environment_digest: string;
  golden_query_digest: string;
  query_metrics: RetrievalEvaluationQueryMetrics;
}

export interface RetrievalEvaluationEnvironmentAggregate {
  environment_digest: string;
  query_count: number;
  query_metrics_set_digest: string;
  aggregate_metrics: RetrievalEvaluationAggregateMetrics;
  environment_aggregate_digest: string;
}

export interface RetrievalEvaluationMetricsSet {
  contract_version: typeof RETRIEVAL_EVALUATION_METRICS_SET_VERSION;
  environment_set_digest: string;
  normalized_golden_digest: string;
  query_count: number;
  query_evaluations: RetrievalEvaluationMetricsSetQueryEvaluation[];
  query_metrics_set_digest: string;
  environment_aggregates: RetrievalEvaluationEnvironmentAggregate[];
  aggregate_metrics: RetrievalEvaluationAggregateMetrics;
  metrics_set_digest: string;
}

export interface RetrievalEvaluationBaseConfigurationCoordinate {
  contract_version: typeof RETRIEVAL_EVALUATION_BASE_CONFIGURATION_VERSION;
  effective_non_tunable_configuration_digest: string;
  base_configuration_digest: string;
}

export interface RetrievalEvaluationTuningAxesCoordinate extends RetrievalEvaluationTuningAxes {
  contract_version: typeof RETRIEVAL_EVALUATION_TUNING_AXES_VERSION;
  tuning_axes_digest: string;
}

export interface RetrievalEvaluationTuningGridCoordinate {
  contract_version: typeof RETRIEVAL_EVALUATION_TUNING_GRID_VERSION;
  rrf_k: number[];
  mmr: Array<{ enabled: boolean; lambda_micros: number | null }>;
  semantic_top_k: number[];
  lexical_top_k: number[];
  candidate_count: 900;
  tuning_grid_digest: string;
}

export interface RetrievalEvaluationRelativeNdcgBudget {
  numerator: number;
  denominator: number;
}

export interface RetrievalEvaluationBaseline {
  contract_version: typeof RETRIEVAL_EVALUATION_BASELINE_VERSION;
  environment_set: RetrievalEvaluationEnvironmentSet;
  normalized_golden: NormalizedRetrievalEvaluationGolden;
  base_configuration: RetrievalEvaluationBaseConfigurationCoordinate;
  tuning_grid: RetrievalEvaluationTuningGridCoordinate;
  selected_axes: RetrievalEvaluationTuningAxesCoordinate;
  candidate_config_digest: string;
  metrics_set: RetrievalEvaluationMetricsSet;
  relative_ndcg_budget: RetrievalEvaluationRelativeNdcgBudget;
  metric_contract_version: typeof RETRIEVAL_EVALUATION_METRIC_VERSION;
  ndcg_discount_table_digest: string;
  metric_scale: typeof RETRIEVAL_EVALUATION_METRIC_SCALE;
  query_count: number;
  maximum_expected_top_k: number;
  normalized_golden_digest: string;
  environment_set_digest: string;
  base_configuration_digest: string;
  tuning_grid_digest: string;
  tuning_axes_digest: string;
  query_metrics_set_digest: string;
  aggregate_metrics_digest: string;
  metrics_set_digest: string;
  baseline_evaluation_digest: string;
  baseline_digest: string;
}

export interface RetrievalEvaluationComparisonInput {
  current_environment_set: RetrievalEvaluationEnvironmentSet;
  current_base_configuration: RetrievalEvaluationBaseConfigurationCoordinate;
  current_tuning_grid: RetrievalEvaluationTuningGridCoordinate;
  current_tuning_axes: RetrievalEvaluationTuningAxesCoordinate;
  current_golden: NormalizedRetrievalEvaluationGolden;
  current_metrics_set: RetrievalEvaluationMetricsSet;
  current_relative_ndcg_budget: RetrievalEvaluationRelativeNdcgBudget;
  baseline: RetrievalEvaluationBaseline;
}

export interface RetrievalEvaluationComparison {
  contract_version: typeof RETRIEVAL_EVALUATION_COMPARISON_VERSION;
  status: "pass" | "regression" | "needs_human";
  reasons: string[];
  baseline_ndcg_at_k_micros: number;
  current_ndcg_at_k_micros: number;
  baseline_evaluation_digest: string;
  current_evaluation_digest: string;
  comparison_digest: string;
}

export interface RetrievalEvaluationTuningAxes {
  rrf_k: number;
  mmr: boolean;
  mmr_lambda_micros: number | null;
  semantic_top_k: number;
  lexical_top_k: number;
}

export interface RetrievalEvaluationTuneCandidate {
  candidate_config_digest: string;
  axes: RetrievalEvaluationTuningAxesCoordinate;
  metrics_set: RetrievalEvaluationMetricsSet;
  candidate_evaluation_digest: string;
}

export interface RetrievalEvaluationTuneSelectionInput {
  baseline: RetrievalEvaluationBaseline;
  candidates: RetrievalEvaluationTuneCandidate[];
}

export interface RetrievalEvaluationTuneSelection {
  contract_version: typeof RETRIEVAL_EVALUATION_TUNE_SELECTION_VERSION;
  evaluated_candidate_count: number;
  excluded_candidate_count: number;
  query_evaluation_count: number;
  conforming_candidate_count: number;
  query_count: number;
  maximum_expected_top_k: number;
  environment_set_digest: string;
  golden_digest: string;
  base_configuration_digest: string;
  tuning_grid_digest: string;
  baseline_metrics_set_digest: string;
  baseline_evaluation_digest: string;
  baseline_aggregate_metrics_digest: string;
  candidate_evaluation_set_digest: string;
  selected_candidate: RetrievalEvaluationTuneCandidate | null;
  tune_selection_digest: string;
}

export interface RetrievalEvaluationScenarioTemporalHit {
  source_id: string;
  temporal_state: "current" | "historical" | "unknown";
  valid_from: string | null;
  valid_to: string | null;
  supersedes: string[];
  superseded_by: string[];
}

export interface RetrievalEvaluationScenarioOutcome {
  contract_version: typeof RETRIEVAL_EVALUATION_SCENARIO_OUTCOME_VERSION;
  scenario_id: string;
  kind: "result" | "insufficient" | "authorized_view_conflict" | "operational_exclusion";
  public_result_digest: string | null;
  coverage: "not_requested" | "not_evaluated" | "sufficient" | "insufficient" | null;
  confidence: RetrievalEvaluationConfidence | null;
  reason_code: string | null;
  message: string | null;
  ordered_hit_projections: RetrievalEvaluationScenarioTemporalHit[];
  citation_applicability: "required" | "not_applicable";
  host_classification: "fixture_authority_failure" | "retrieval_authority_failure" | null;
  exit_code: 0 | 3;
  work_counters: {
    authority_input_snapshot_count: number;
    source_read_count: number;
    retrieval_sql_stage_count: number;
    vector_provider_call_count: number;
    vector_provider_item_count: number;
    rerank_provider_call_count: number;
    rerank_provider_item_count: number;
    ranking_call_count: number;
    confidence_call_count: number;
    citation_verification_count: number;
    metric_computation_count: number;
  };
  effects: {
    public_result_emitted: boolean;
    output_artifact_written: boolean;
    state_mutated: boolean;
  };
  outcome_digest: string;
}

export interface RetrievalEvaluationScenarioComparison {
  contract_version: typeof RETRIEVAL_EVALUATION_SCENARIO_COMPARISON_VERSION;
  status: "pass" | "regression";
  reasons: string[];
  expected_outcome_digest: string;
  observed_outcome_digest: string;
  scenario_comparison_digest: string;
}

export interface RetrievalEvaluationObservationReport {
  contract_version: typeof RETRIEVAL_EVALUATION_OBSERVATION_VERSION;
  evaluation_digest: string;
  fixed_sample_plan_digest: string;
  environment: {
    runtime: "node";
    runtime_version: string;
    os: "linux" | "windows" | "darwin";
    arch: "x64" | "arm64";
    sqlite_version: string;
    lexical_backend: "sqlite_fts5" | "sqlite_lexical_scan";
    fts5_available: boolean;
    runner_class: "github_hosted" | "local";
  };
  warmup_count: number;
  sample_count: number;
  query_latency_micros: { p50: number; p95: number; p99: number };
  index_time_micros: number;
  update_time_micros: number;
  chunks_reprocessed: number;
  chunks_reused: number;
  observation_digest: string;
}

const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const CANONICAL_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CONFIDENCE = new Set<RetrievalEvaluationConfidence>(["high", "medium", "low", "insufficient"]);
const ORDINARY_CONFIDENCE = new Set<NormalizedRetrievalEvaluationQuery["expected_confidence"]>(["high", "medium", "low"]);
const EFFECTIVE_QUERY_EDGE_WHITESPACE_RE = /^[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$/gu;

/** Exact coordinator-equivalent trim for normalized Phase-4 golden text. */
export function retrievalEvaluationEffectiveQueryText(authored: string): string {
  if (typeof authored !== "string") throw new TypeError("GKX_EVAL_QUERY_TEXT_INVALID");
  return authored.replace(EFFECTIVE_QUERY_EDGE_WHITESPACE_RE, "");
}

/** Provider/model coordinates are opaque inert identifiers, never routes. */
export function isValidRetrievalEvaluationOpaqueIdentity(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 512 || value.trim().length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  try { stableJson(value); } catch { return false; }
  return true;
}

function isBoundedEvaluationId(value: unknown): value is string {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") >= 1 && Buffer.byteLength(value, "utf8") <= 128 && ID_RE.test(value);
}

function isBoundedEnvironmentScenarioId(value: unknown): value is string {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") >= 1 && Buffer.byteLength(value, "utf8") <= 512 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*){3}$/u.test(value);
}

const MAX_EVALUATION_DATA_ARRAY_ITEMS = 4_096;
const MAX_EVALUATION_DATA_OBJECT_FIELDS = 128;
const MAX_EVALUATION_DATA_DEPTH = 32;
// Derived upper envelope: 27,000 bounded tune-query rows plus the largest
// 100-hit public temporal/citation endpoint projection remains below this.
const MAX_EVALUATION_DATA_NODES = 10_000_000;
const MAX_EVALUATION_DATA_STRING_CODE_UNITS = 4 * Math.ceil(RETRIEVAL_EVALUATION_MAX_SOURCE_BYTES / 3);

/**
 * Reject coercive or unbounded JavaScript shapes before canonical JSON is
 * allowed to enumerate, copy, or stringify them. Field-specific preflights
 * below apply the smaller contract bounds before this generic final seal.
 */
function preflightPlainEvaluationData(
  value: unknown,
  code: string,
  state = { nodes: 0 },
  depth = 0,
  ancestors = new Set<object>(),
): void {
  state.nodes++;
  if (state.nodes > MAX_EVALUATION_DATA_NODES || depth > MAX_EVALUATION_DATA_DEPTH) throw new TypeError(code);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (value.length > MAX_EVALUATION_DATA_STRING_CODE_UNITS) throw new TypeError(code);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) && !Number.isFinite(value)) throw new TypeError(code);
    return;
  }
  if (typeof value !== "object" || utilTypes.isProxy(value)) throw new TypeError(code);
  if (ancestors.has(value)) throw new TypeError(code);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const length = Object.getOwnPropertyDescriptor(value, "length");
      if (!length || !("value" in length) || !Number.isSafeInteger(length.value) || length.value < 0 ||
          length.value > MAX_EVALUATION_DATA_ARRAY_ITEMS) throw new TypeError(code);
      const keys = Reflect.ownKeys(value);
      if (keys.length !== length.value + 1 || keys.some((key) => typeof key !== "string" ||
          key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key))) throw new TypeError(code);
      for (let index = 0; index < length.value; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError(code);
        preflightPlainEvaluationData(descriptor.value, code, state, depth + 1, ancestors);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(code);
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_EVALUATION_DATA_OBJECT_FIELDS || keys.some((key) => typeof key !== "string")) throw new TypeError(code);
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError(code);
      preflightPlainEvaluationData(descriptor.value, code, state, depth + 1, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function inertClone<T>(value: T): T {
  preflightPlainEvaluationData(value, "GKX_EVAL_CANONICAL_DATA_INVALID");
  return JSON.parse(stableJson(value)) as T;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort(retrievalCodeUnitCompare);
  const wanted = [...expected].sort(retrievalCodeUnitCompare);
  if (stableJson(actual) !== stableJson(wanted)) throw new TypeError(code);
}

function assertDigest(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) throw new TypeError(code);
}

function assertSafeCount(value: unknown, code: string, maximum = Number.MAX_SAFE_INTEGER): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) throw new TypeError(code);
}

function assertMicros(value: unknown, code: string): asserts value is number {
  assertSafeCount(value, code, RETRIEVAL_EVALUATION_METRIC_SCALE);
}

function sortedUniqueStrings(value: unknown, code: string, maximum = 256): asserts value is string[] {
  if (!Array.isArray(value) || value.length > maximum || value.some((item) => typeof item !== "string")) throw new TypeError(code);
  const sorted = [...value].sort(retrievalCodeUnitCompare);
  if (new Set(sorted).size !== sorted.length || stableJson(value) !== stableJson(sorted)) throw new TypeError(code);
}

/** Exact portable path grammar shared by normalized golden and fixture seals. */
export function isValidRetrievalEvaluationSourcePath(value: string): boolean {
  if (Buffer.byteLength(value, "utf8") < 1 || Buffer.byteLength(value, "utf8") > 1024 || !isValidRetrievalSourcePath(value) || /\u007f/u.test(value)) return false;
  for (const component of value.split("/")) {
    const stem = component.split(".", 1)[0].toUpperCase();
    if (/^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|CLOCK\$|COM(?:[1-9]|[¹²³])|LPT(?:[1-9]|[¹²³]))$/u.test(stem)) return false;
  }
  try { stableJson(value); } catch { return false; }
  return true;
}

function queryDigestMaterial(query: Omit<NormalizedRetrievalEvaluationQuery, "query_digest">): unknown {
  return query;
}

function boundedStringDataArray(value: unknown, maximum: number, maximumUtf8Bytes: number, code: string): unknown[] {
  const array = boundedDenseDataArray(value, maximum, code);
  for (let index = 0; index < array.length; index++) {
    const item = Object.getOwnPropertyDescriptor(array, String(index))!.value;
    if (typeof item !== "string" || Buffer.byteLength(item, "utf8") > maximumUtf8Bytes) throw new TypeError(code);
  }
  return array;
}

function optionalRecordDataValue(record: unknown, key: string, code: string): { present: boolean; value: unknown } {
  if (!record || typeof record !== "object" || Array.isArray(record) || utilTypes.isProxy(record) ||
      (Object.getPrototypeOf(record) !== Object.prototype && Object.getPrototypeOf(record) !== null)) throw new TypeError(code);
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return { present: false, value: undefined };
  if (!descriptor.enumerable || !("value" in descriptor)) throw new TypeError(code);
  return { present: true, value: descriptor.value };
}

function assertCanonicalJsonUtf8Size(value: unknown, maximum: number, code: string): void {
  let total = 0;
  const add = (bytes: number) => {
    total += bytes;
    if (total > maximum) throw new TypeError(code);
  };
  const visit = (item: unknown): void => {
    if (item === null || typeof item === "boolean" || typeof item === "number" || typeof item === "string") {
      add(Buffer.byteLength(JSON.stringify(typeof item === "number" && Object.is(item, -0) ? 0 : item), "utf8"));
      return;
    }
    if (Array.isArray(item)) {
      add(2);
      for (let index = 0; index < item.length; index++) {
        if (index > 0) add(1);
        visit(Object.getOwnPropertyDescriptor(item, String(index))!.value);
      }
      return;
    }
    const record = item as Record<string, unknown>;
    const keys = (Reflect.ownKeys(record) as string[]).sort(retrievalCodeUnitCompare);
    add(2);
    for (let index = 0; index < keys.length; index++) {
      if (index > 0) add(1);
      add(Buffer.byteLength(JSON.stringify(keys[index]), "utf8") + 1);
      visit(Object.getOwnPropertyDescriptor(record, keys[index])!.value);
    }
  };
  visit(value);
}

function preflightNormalizedQueryBounds(value: unknown): void {
  preflightPlainEvaluationData(value, "GKX_EVAL_QUERY_INVALID");
  boundedStringDataArray(recordDataValue(value, "expected_files", "GKX_EVAL_QUERY_INVALID"), 256, 1_024, "GKX_EVAL_EXPECTED_FILES_INVALID");
  boundedStringDataArray(recordDataValue(value, "expected_source_ids", "GKX_EVAL_QUERY_INVALID"), 256, 64, "GKX_EVAL_EXPECTED_SOURCE_IDS_INVALID");
  boundedDenseDataArray(recordDataValue(value, "expected_lineage_ids", "GKX_EVAL_QUERY_INVALID"), 0, "GKX_EVAL_LINEAGE_ID_UNAVAILABLE");
  boundedStringDataArray(recordDataValue(value, "forbidden_source_ids", "GKX_EVAL_QUERY_INVALID"), 256, 64, "GKX_EVAL_FORBIDDEN_SOURCE_IDS_INVALID");
  boundedDenseDataArray(recordDataValue(value, "forbidden_lineage_ids", "GKX_EVAL_QUERY_INVALID"), 0, "GKX_EVAL_LINEAGE_ID_UNAVAILABLE");
  for (const [field, maximum] of [["id", 128], ["vault_fixture", 128], ["text", 4_096]] as const) {
    const fieldValue = recordDataValue(value, field, "GKX_EVAL_QUERY_INVALID");
    if (typeof fieldValue !== "string" || Buffer.byteLength(fieldValue, "utf8") > maximum) throw new TypeError("GKX_EVAL_QUERY_STRING_BOUND_INVALID");
  }
}

function preflightNormalizedGoldenBounds(value: unknown, maximum = 256): void {
  preflightPlainEvaluationData(value, "GKX_EVAL_GOLDEN_INVALID");
  const queries = boundedDenseDataArray(recordDataValue(value, "queries", "GKX_EVAL_GOLDEN_INVALID"), maximum, "GKX_EVAL_GOLDEN_QUERY_COUNT_INVALID");
  for (const query of queries) preflightNormalizedQueryBounds(query);
}

function preflightQueryMetricsBounds(value: unknown): void {
  preflightPlainEvaluationData(value, "GKX_EVAL_QUERY_METRICS_INVALID");
  boundedDenseDataArray(recordDataValue(value, "relevant_source_ranks", "GKX_EVAL_QUERY_METRICS_INVALID"), 100, "GKX_EVAL_RELEVANT_RANKS_INVALID");
  const queryId = recordDataValue(value, "query_id", "GKX_EVAL_QUERY_METRICS_INVALID");
  if (typeof queryId !== "string" || Buffer.byteLength(queryId, "utf8") > 128) throw new TypeError("GKX_EVAL_QUERY_METRICS_COORDINATE_INVALID");
}

function preflightExpectedTemporalBounds(value: unknown): void {
  const hits = boundedDenseDataArray(recordDataValue(value, "hits", "GKX_EVAL_EXPECTED_TEMPORAL_INVALID"), 100, "GKX_EVAL_EXPECTED_TEMPORAL_HITS_INVALID");
  for (const hit of hits) {
    boundedStringDataArray(recordDataValue(hit, "supersedes", "GKX_EVAL_EXPECTED_TEMPORAL_HIT_INVALID"), 4_096, 64, "GKX_EVAL_EXPECTED_TEMPORAL_SUPERSEDES_INVALID");
    boundedStringDataArray(recordDataValue(hit, "superseded_by", "GKX_EVAL_EXPECTED_TEMPORAL_HIT_INVALID"), 4_096, 64, "GKX_EVAL_EXPECTED_TEMPORAL_SUPERSEDED_BY_INVALID");
  }
  preflightPlainEvaluationData(value, "GKX_EVAL_EXPECTED_TEMPORAL_INVALID");
}

function preflightOracleBounds(value: unknown): void {
  boundedStringDataArray(recordDataValue(value, "authorized_source_ids", "GKX_EVAL_ORACLE_INVALID"), 4_096, 64, "GKX_EVAL_ORACLE_AUTHORIZED_SOURCE_IDS_INVALID");
  boundedStringDataArray(recordDataValue(value, "forbidden_source_ids", "GKX_EVAL_ORACLE_INVALID"), 4_096, 64, "GKX_EVAL_ORACLE_FORBIDDEN_SOURCE_IDS_INVALID");
  boundedStringDataArray(recordDataValue(value, "authorized_source_paths", "GKX_EVAL_ORACLE_INVALID"), 4_096, 1_024, "GKX_EVAL_ORACLE_AUTHORIZED_SOURCE_PATHS_INVALID");
  boundedStringDataArray(recordDataValue(value, "forbidden_source_paths", "GKX_EVAL_ORACLE_INVALID"), 4_096, 1_024, "GKX_EVAL_ORACLE_FORBIDDEN_SOURCE_PATHS_INVALID");
  boundedStringDataArray(recordDataValue(value, "authorized_endpoint_ids", "GKX_EVAL_ORACLE_INVALID"), 4_096, 64, "GKX_EVAL_ORACLE_AUTHORIZED_ENDPOINT_IDS_INVALID");
  boundedStringDataArray(recordDataValue(value, "forbidden_endpoint_ids", "GKX_EVAL_ORACLE_INVALID"), 4_096, 64, "GKX_EVAL_ORACLE_FORBIDDEN_ENDPOINT_IDS_INVALID");
  preflightPlainEvaluationData(value, "GKX_EVAL_ORACLE_INVALID");
}

function preflightCitationBounds(value: unknown): void {
  boundedStringDataArray(recordDataValue(value, "heading_path", "GKX_EVAL_PUBLIC_CITATION_INVALID"), 4_096, 4_096, "GKX_EVAL_PUBLIC_CITATION_HEADING_INVALID");
  const spans = boundedDenseDataArray(recordDataValue(value, "matched_spans", "GKX_EVAL_PUBLIC_CITATION_INVALID"), 8, "GKX_EVAL_PUBLIC_CITATION_SPANS_INVALID");
  let matchedSpanBytes = 0;
  for (const span of spans) {
    const text = recordDataValue(span, "text", "GKX_EVAL_PUBLIC_CITATION_SPANS_INVALID");
    if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 256) throw new TypeError("GKX_EVAL_PUBLIC_CITATION_SPANS_INVALID");
    matchedSpanBytes += Buffer.byteLength(text, "utf8");
  }
  if (matchedSpanBytes > 1_024) throw new TypeError("GKX_EVAL_PUBLIC_CITATION_SPANS_INVALID");
}

function preflightProvenanceBounds(value: unknown): void {
  boundedStringDataArray(recordDataValue(value, "supersedes", "GKX_EVAL_PUBLIC_PROVENANCE_INVALID"), 4_096, 64, "GKX_EVAL_PUBLIC_PROVENANCE_SUPERSEDES_INVALID");
  boundedStringDataArray(recordDataValue(value, "superseded_by", "GKX_EVAL_PUBLIC_PROVENANCE_INVALID"), 4_096, 64, "GKX_EVAL_PUBLIC_PROVENANCE_SUPERSEDED_BY_INVALID");
  boundedStringDataArray(recordDataValue(value, "reason_codes", "GKX_EVAL_PUBLIC_PROVENANCE_INVALID"), 4_096, 128, "GKX_EVAL_PUBLIC_PROVENANCE_REASON_CODES_INVALID");
}

function preflightResultBounds(value: unknown): void {
  boundedStringDataArray(recordDataValue(value, "applied_filters", "GKX_EVAL_PUBLIC_RESULT_INVALID"), 64, 64, "GKX_EVAL_PUBLIC_RESULT_FILTERS_INVALID");
  boundedStringDataArray(recordDataValue(recordDataValue(value, "temporal", "GKX_EVAL_PUBLIC_RESULT_INVALID"), "reason_codes", "GKX_EVAL_PUBLIC_RESULT_TEMPORAL_INVALID"), 1, 128, "GKX_EVAL_PUBLIC_RESULT_TEMPORAL_REASONS_INVALID");
  boundedStringDataArray(recordDataValue(recordDataValue(value, "confidence", "GKX_EVAL_PUBLIC_RESULT_INVALID"), "reason_codes", "GKX_EVAL_PUBLIC_CONFIDENCE_INVALID"), 64, 128, "GKX_EVAL_PUBLIC_CONFIDENCE_REASONS_INVALID");
  const stages = recordDataValue(value, "stages", "GKX_EVAL_PUBLIC_RESULT_INVALID");
  for (const stage of ["lexical", "vector", "reranker"] as const) {
    boundedStringDataArray(recordDataValue(recordDataValue(stages, stage, "GKX_EVAL_PUBLIC_RESULT_STAGES_INVALID"), "reason_codes", "GKX_EVAL_PUBLIC_RESULT_STAGE_INVALID"), 64, 128, "GKX_EVAL_PUBLIC_RESULT_STAGE_REASONS_INVALID");
  }
  const hits = boundedDenseDataArray(recordDataValue(value, "hits", "GKX_EVAL_PUBLIC_RESULT_INVALID"), 100, "GKX_EVAL_PUBLIC_RESULT_HITS_INVALID");
  for (const hit of hits) {
    const chunk = recordDataValue(hit, "chunk", "GKX_EVAL_PUBLIC_HIT_INVALID");
    boundedStringDataArray(recordDataValue(chunk, "heading_path", "GKX_EVAL_PUBLIC_CHUNK_INVALID"), 4_096, 4_096, "GKX_EVAL_PUBLIC_CHUNK_HEADING_INVALID");
    boundedStringDataArray(recordDataValue(chunk, "supersedes", "GKX_EVAL_PUBLIC_CHUNK_INVALID"), 4_096, 64, "GKX_EVAL_PUBLIC_CHUNK_SUPERSEDES_INVALID");
    boundedStringDataArray(recordDataValue(chunk, "superseded_by", "GKX_EVAL_PUBLIC_CHUNK_INVALID"), 4_096, 64, "GKX_EVAL_PUBLIC_CHUNK_SUPERSEDED_BY_INVALID");
    const chunkText = recordDataValue(chunk, "text", "GKX_EVAL_PUBLIC_CHUNK_INVALID");
    if (typeof chunkText !== "string" || Buffer.byteLength(chunkText, "utf8") > 16_384) throw new TypeError("GKX_EVAL_PUBLIC_CHUNK_TEXT_INVALID");
    preflightCitationBounds(recordDataValue(hit, "citation", "GKX_EVAL_PUBLIC_HIT_INVALID"));
    preflightProvenanceBounds(recordDataValue(hit, "provenance", "GKX_EVAL_PUBLIC_HIT_INVALID"));
    const parent = optionalRecordDataValue(hit, "parent_context", "GKX_EVAL_PUBLIC_HIT_INVALID");
    if (parent.present) {
      const parentText = recordDataValue(parent.value, "text", "GKX_EVAL_PUBLIC_PARENT_INVALID");
      if (typeof parentText !== "string" || Buffer.byteLength(parentText, "utf8") > 65_536) throw new TypeError("GKX_EVAL_PUBLIC_PARENT_TEXT_INVALID");
      preflightCitationBounds(recordDataValue(parent.value, "citation", "GKX_EVAL_PUBLIC_PARENT_INVALID"));
      preflightProvenanceBounds(recordDataValue(parent.value, "provenance", "GKX_EVAL_PUBLIC_PARENT_INVALID"));
    }
  }
  preflightPlainEvaluationData(value, "GKX_EVAL_PUBLIC_RESULT_INVALID");
  assertCanonicalJsonUtf8Size(value, 1_048_576, "GKX_EVAL_PUBLIC_RESULT_SIZE_INVALID");
}

function preflightQueryInputBounds(value: unknown): void {
  preflightNormalizedQueryBounds(recordDataValue(value, "query", "GKX_EVAL_QUERY_INPUT_INVALID"));
  preflightObservationBounds(value);
  preflightOracleBounds(recordDataValue(value, "audit_oracle", "GKX_EVAL_QUERY_INPUT_INVALID"));
  preflightExpectedTemporalBounds(recordDataValue(value, "expected_temporal", "GKX_EVAL_QUERY_INPUT_INVALID"));
  preflightResultBounds(recordDataValue(value, "result", "GKX_EVAL_QUERY_INPUT_INVALID"));
  preflightPlainEvaluationData(value, "GKX_EVAL_QUERY_INPUT_INVALID");
}

function preflightScenarioOutcomeBounds(value: unknown): void {
  const scenarioId = recordDataValue(value, "scenario_id", "GKX_EVAL_SCENARIO_OUTCOME_INVALID");
  if (typeof scenarioId !== "string" || Buffer.byteLength(scenarioId, "utf8") > 128) throw new TypeError("GKX_EVAL_SCENARIO_OUTCOME_COORDINATE_INVALID");
  const projections = boundedDenseDataArray(recordDataValue(value, "ordered_hit_projections", "GKX_EVAL_SCENARIO_OUTCOME_INVALID"), 100, "GKX_EVAL_SCENARIO_VALUE_INVALID");
  for (const projection of projections) {
    boundedStringDataArray(recordDataValue(projection, "supersedes", "GKX_EVAL_SCENARIO_OUTCOME_INVALID"), 4_096, 64, "GKX_EVAL_SCENARIO_PROJECTION_INVALID");
    boundedStringDataArray(recordDataValue(projection, "superseded_by", "GKX_EVAL_SCENARIO_OUTCOME_INVALID"), 4_096, 64, "GKX_EVAL_SCENARIO_PROJECTION_INVALID");
  }
  preflightPlainEvaluationData(value, "GKX_EVAL_SCENARIO_OUTCOME_INVALID");
}

export function sealNormalizedRetrievalEvaluationQuery(value: unknown): NormalizedRetrievalEvaluationQuery {
  preflightNormalizedQueryBounds(value);
  const query = inertClone(value) as unknown as Record<string, unknown>;
  if (!query || typeof query !== "object" || Array.isArray(query)) throw new TypeError("GKX_EVAL_QUERY_INVALID");
  exactKeys(query, [
    "id", "text", "vault_fixture", "expected_files", "expected_source_ids", "expected_lineage_ids",
    "forbidden_source_ids", "forbidden_lineage_ids", "expected_top_k", "expected_confidence", "as_of", "query_digest",
  ], "GKX_EVAL_QUERY_FIELDS_INVALID");
  if (typeof query.id !== "string" || !ID_RE.test(query.id) || Buffer.byteLength(query.id, "utf8") > 128) throw new TypeError("GKX_EVAL_QUERY_ID_INVALID");
  if (typeof query.vault_fixture !== "string" || !ID_RE.test(query.vault_fixture) || Buffer.byteLength(query.vault_fixture, "utf8") > 128) throw new TypeError("GKX_EVAL_VAULT_FIXTURE_INVALID");
  if (typeof query.text !== "string" || Buffer.byteLength(query.text, "utf8") < 1 || Buffer.byteLength(query.text, "utf8") > 4096 ||
      /[\u0000-\u001f\u007f]/u.test(query.text)) throw new TypeError("GKX_EVAL_QUERY_TEXT_INVALID");
  const effectiveQueryText = retrievalEvaluationEffectiveQueryText(query.text);
  if (Buffer.byteLength(effectiveQueryText, "utf8") < 1 || effectiveQueryText !== query.text.trim()) {
    throw new TypeError("GKX_EVAL_QUERY_EFFECTIVE_TEXT_INVALID");
  }
  let lexicalClauses: ReturnType<typeof lexicalQueryClauses>;
  try { lexicalClauses = lexicalQueryClauses(query.text); }
  catch { throw new TypeError("GKX_EVAL_QUERY_LEXICAL_INVALID"); }
  if (lexicalClauses.length > 64) throw new TypeError("GKX_EVAL_QUERY_LEXICAL_CLAUSE_COUNT_INVALID");
  if (lexicalClauses.some((clause) => Buffer.byteLength(clause.value, "utf8") > 256)) {
    throw new TypeError("GKX_EVAL_QUERY_LEXICAL_CLAUSE_SIZE_INVALID");
  }
  sortedUniqueStrings(query.expected_files, "GKX_EVAL_EXPECTED_FILES_INVALID");
  const expectedFiles = query.expected_files as string[];
  if (expectedFiles.some((item) => !isValidRetrievalEvaluationSourcePath(item))) throw new TypeError("GKX_EVAL_EXPECTED_FILE_INVALID");
  sortedUniqueStrings(query.expected_source_ids, "GKX_EVAL_EXPECTED_SOURCE_IDS_INVALID");
  sortedUniqueStrings(query.forbidden_source_ids, "GKX_EVAL_FORBIDDEN_SOURCE_IDS_INVALID");
  const expectedSourceIds = query.expected_source_ids as string[];
  const forbiddenSourceIds = query.forbidden_source_ids as string[];
  if (expectedSourceIds.some((item) => !isValidGkxAuthoredUid(item)) || forbiddenSourceIds.some((item) => !isValidGkxAuthoredUid(item))) {
    throw new TypeError("GKX_EVAL_SOURCE_ID_INVALID");
  }
  if (!Array.isArray(query.expected_lineage_ids) || query.expected_lineage_ids.length !== 0 ||
      !Array.isArray(query.forbidden_lineage_ids) || query.forbidden_lineage_ids.length !== 0) {
    throw new TypeError("GKX_EVAL_LINEAGE_ID_UNAVAILABLE");
  }
  if (expectedFiles.length + expectedSourceIds.length === 0) throw new TypeError("GKX_EVAL_RELEVANCE_EMPTY");
  if (expectedSourceIds.some((item) => forbiddenSourceIds.includes(item))) throw new TypeError("GKX_EVAL_RELEVANCE_FORBIDDEN_OVERLAP");
  if (!Number.isSafeInteger(query.expected_top_k) || (query.expected_top_k as number) < 1 || (query.expected_top_k as number) > 100) throw new TypeError("GKX_EVAL_TOP_K_INVALID");
  if (typeof query.expected_confidence !== "string" || !ORDINARY_CONFIDENCE.has(query.expected_confidence as NormalizedRetrievalEvaluationQuery["expected_confidence"])) {
    throw new TypeError("GKX_EVAL_CONFIDENCE_INVALID");
  }
  if (query.as_of !== null && (typeof query.as_of !== "string" || !CANONICAL_TIME_RE.test(query.as_of))) throw new TypeError("GKX_EVAL_AS_OF_INVALID");
  if (query.as_of !== null) {
    try {
      if (normalizeRetrievalAsOf(query.as_of as string) !== query.as_of) throw new TypeError("GKX_EVAL_AS_OF_INVALID");
    } catch { throw new TypeError("GKX_EVAL_AS_OF_INVALID"); }
  }
  assertDigest(query.query_digest, "GKX_EVAL_QUERY_DIGEST_INVALID");
  const { query_digest, ...material } = query;
  if (retrievalCanonicalDigest(queryDigestMaterial(material as unknown as Omit<NormalizedRetrievalEvaluationQuery, "query_digest">)) !== query_digest) {
    throw new TypeError("GKX_EVAL_QUERY_DIGEST_MISMATCH");
  }
  return query as unknown as NormalizedRetrievalEvaluationQuery;
}

export function sealNormalizedRetrievalEvaluationGolden(value: unknown): NormalizedRetrievalEvaluationGolden {
  preflightNormalizedGoldenBounds(value);
  const golden = inertClone(value) as unknown as Record<string, unknown>;
  if (!golden || typeof golden !== "object" || Array.isArray(golden)) throw new TypeError("GKX_EVAL_GOLDEN_INVALID");
  exactKeys(golden, ["contract_version", "queries", "golden_digest"], "GKX_EVAL_GOLDEN_FIELDS_INVALID");
  if (golden.contract_version !== RETRIEVAL_EVALUATION_GOLDEN_VERSION || !Array.isArray(golden.queries) || golden.queries.length < 1 || golden.queries.length > 256) {
    throw new TypeError("GKX_EVAL_GOLDEN_COORDINATE_INVALID");
  }
  const queries = golden.queries.map(sealNormalizedRetrievalEvaluationQuery);
  if (new Set(queries.map((query) => query.id)).size !== queries.length ||
      stableJson(queries.map((query) => query.id)) !== stableJson(queries.map((query) => query.id).sort(retrievalCodeUnitCompare))) {
    throw new TypeError("GKX_EVAL_GOLDEN_QUERY_ORDER_INVALID");
  }
  assertDigest(golden.golden_digest, "GKX_EVAL_GOLDEN_DIGEST_INVALID");
  const expected = retrievalCanonicalDigest({ contract_version: RETRIEVAL_EVALUATION_GOLDEN_VERSION, queries });
  if (golden.golden_digest !== expected) throw new TypeError("GKX_EVAL_GOLDEN_DIGEST_MISMATCH");
  return { contract_version: RETRIEVAL_EVALUATION_GOLDEN_VERSION, queries, golden_digest: expected };
}

function roundNonnegativeRatio(numerator: bigint, denominator: bigint, scale = BigInt(RETRIEVAL_EVALUATION_METRIC_SCALE)): number {
  if (numerator < 0n || denominator <= 0n) throw new RangeError("GKX_EVAL_RATIO_INVALID");
  const scaled = numerator * scale;
  return Number((scaled + denominator / 2n) / denominator);
}

function roundNonnegativeIntegerRatio(numerator: bigint, denominator: bigint): number {
  if (numerator < 0n || denominator <= 0n) throw new RangeError("GKX_EVAL_RATIO_INVALID");
  return Number((numerator + denominator / 2n) / denominator);
}

function ndcgMicros(relevantRanks: readonly number[], relevantCount: number, topK: number): number {
  const dcg = relevantRanks.reduce((sum, rank) => sum + BigInt(RETRIEVAL_EVALUATION_NDCG_DISCOUNT_SCALED[rank - 1]), 0n);
  const idealCount = Math.min(relevantCount, topK);
  let idcg = 0n;
  for (let index = 0; index < idealCount; index++) idcg += BigInt(RETRIEVAL_EVALUATION_NDCG_DISCOUNT_SCALED[index]);
  return idcg === 0n ? 0 : roundNonnegativeRatio(dcg, idcg);
}

function metricDigest<T extends Record<string, unknown>>(value: T, digestKey: string): string {
  const material = { ...value };
  delete material[digestKey];
  return retrievalCanonicalDigest(material);
}

interface DecodedEvaluationObservation {
  source_id: string;
  source_path: string;
  source_digest: string;
  bytes: Buffer;
  line_coordinates: Map<string, { start_line: number; end_line: number }>;
}

function assertFatalUtf8(bytes: Uint8Array): void {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const chunkSize = 1_048_576;
    if (bytes.length === 0) decoder.decode(bytes);
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const end = Math.min(bytes.length, offset + chunkSize);
      decoder.decode(bytes.subarray(offset, end), { stream: end < bytes.length });
    }
  } catch {
    throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_UTF8_INVALID");
  }
}

function isUtf8ScalarBoundary(bytes: Uint8Array, offset: number): boolean {
  return offset >= 0 && offset <= bytes.length && (offset === bytes.length || (bytes[offset]! & 0xc0) !== 0x80);
}

function decodeObservation(value: unknown): DecodedEvaluationObservation {
  // `preflightObservationBounds` already proved this is a plain data record.
  // Do not canonical-clone the potentially 64 MiB base64 scalar: validate and
  // decode it once, then retain only the small identity coordinates.
  const item = value as Record<string, unknown>;
  exactKeys(item, ["source_id", "source_path", "source_digest", "source_bytes_base64"], "GKX_EVAL_SOURCE_OBSERVATION_FIELDS_INVALID");
  if (typeof item.source_id !== "string" || !isValidGkxAuthoredUid(item.source_id) || typeof item.source_path !== "string" || !isValidRetrievalEvaluationSourcePath(item.source_path)) {
    throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_IDENTITY_INVALID");
  }
  assertDigest(item.source_digest, "GKX_EVAL_SOURCE_OBSERVATION_DIGEST_INVALID");
  if (typeof item.source_bytes_base64 !== "string" || item.source_bytes_base64.length > 4 * Math.ceil(RETRIEVAL_EVALUATION_MAX_SOURCE_BYTES / 3) ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(item.source_bytes_base64)) {
    throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_BASE64_INVALID");
  }
  const bytes = Buffer.from(item.source_bytes_base64, "base64");
  if (bytes.length > RETRIEVAL_EVALUATION_MAX_SOURCE_BYTES || bytes.toString("base64") !== item.source_bytes_base64 || retrievalSha256(bytes) !== item.source_digest) {
    throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_BYTES_MISMATCH");
  }
  assertFatalUtf8(bytes);
  return {
    source_id: item.source_id as string,
    source_path: item.source_path as string,
    source_digest: item.source_digest as string,
    bytes,
    line_coordinates: new Map(),
  };
}

function preflightObservationBounds(input: unknown): void {
  if (!input || typeof input !== "object" || Array.isArray(input) || utilTypes.isProxy(input) ||
      (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) throw new TypeError("GKX_EVAL_QUERY_INPUT_INVALID");
  const descriptor = Object.getOwnPropertyDescriptor(input, "source_observations");
  if (!descriptor?.enumerable || !("value" in descriptor) || !Array.isArray(descriptor.value) || utilTypes.isProxy(descriptor.value)) {
    throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_COUNT_INVALID");
  }
  const observations = descriptor.value as unknown[];
  const lengthDescriptor = Object.getOwnPropertyDescriptor(observations, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value > RETRIEVAL_EVALUATION_MAX_SOURCE_OBSERVATIONS ||
      Reflect.ownKeys(observations).some((key) => typeof key !== "string" || key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key)) ||
      Object.keys(observations).length !== lengthDescriptor?.value) throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_COUNT_INVALID");
  let estimatedTotal = 0;
  for (let index = 0; index < lengthDescriptor.value; index++) {
    const observationDescriptor = Object.getOwnPropertyDescriptor(observations, String(index));
    if (!observationDescriptor?.enumerable || !("value" in observationDescriptor)) throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_INVALID");
    const observation = observationDescriptor.value;
    if (!observation || typeof observation !== "object" || Array.isArray(observation) || utilTypes.isProxy(observation)) throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_INVALID");
    const bytesDescriptor = Object.getOwnPropertyDescriptor(observation, "source_bytes_base64");
    if (!bytesDescriptor?.enumerable || !("value" in bytesDescriptor) || typeof bytesDescriptor.value !== "string" ||
        bytesDescriptor.value.length > 4 * Math.ceil(RETRIEVAL_EVALUATION_MAX_SOURCE_BYTES / 3)) throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_SIZE_INVALID");
    const padding = bytesDescriptor.value.endsWith("==") ? 2 : bytesDescriptor.value.endsWith("=") ? 1 : 0;
    const estimatedItem = retrievalEvaluationDecodedBase64Length(bytesDescriptor.value.length, padding);
    if (estimatedItem > RETRIEVAL_EVALUATION_MAX_SOURCE_BYTES) throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_SIZE_INVALID");
    estimatedTotal += estimatedItem;
    if (estimatedTotal > RETRIEVAL_EVALUATION_MAX_TOTAL_SOURCE_BYTES) throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_TOTAL_SIZE_INVALID");
  }
}

function sealOracle(value: unknown): RetrievalEvaluationQueryViewAuditOracle {
  const oracle = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(oracle, [
    "contract_version",
    "authorized_source_ids", "authorized_source_paths", "forbidden_source_ids", "forbidden_source_paths",
    "authorized_endpoint_ids", "forbidden_endpoint_ids",
    "expected_public_result_projection_id", "expected_public_result_projection_digest", "oracle_digest",
  ], "GKX_EVAL_ORACLE_FIELDS_INVALID");
  if (oracle.contract_version !== RETRIEVAL_EVALUATION_QUERY_VIEW_AUDIT_ORACLE_VERSION) {
    throw new TypeError("GKX_EVAL_ORACLE_CONTRACT_VERSION_INVALID");
  }
  for (const field of ["authorized_source_ids", "authorized_source_paths", "forbidden_source_ids", "forbidden_source_paths", "authorized_endpoint_ids", "forbidden_endpoint_ids"] as const) {
    sortedUniqueStrings(oracle[field], `GKX_EVAL_ORACLE_${field.toUpperCase()}_INVALID`, 4096);
  }
  const authorizedIds = oracle.authorized_source_ids as string[];
  const authorizedPaths = oracle.authorized_source_paths as string[];
  const forbiddenIds = oracle.forbidden_source_ids as string[];
  const forbiddenPaths = oracle.forbidden_source_paths as string[];
  const authorizedEndpointIds = oracle.authorized_endpoint_ids as string[];
  const forbiddenEndpointIds = oracle.forbidden_endpoint_ids as string[];
  if (authorizedIds.some((item) => !isValidGkxAuthoredUid(item)) || forbiddenIds.some((item) => !isValidGkxAuthoredUid(item)) ||
      authorizedEndpointIds.some((item) => !isValidGkxAuthoredUid(item)) || forbiddenEndpointIds.some((item) => !isValidGkxAuthoredUid(item)) ||
      authorizedPaths.some((item) => !isValidRetrievalEvaluationSourcePath(item)) || forbiddenPaths.some((item) => !isValidRetrievalEvaluationSourcePath(item))) {
    throw new TypeError("GKX_EVAL_ORACLE_IDENTITY_INVALID");
  }
  if (authorizedIds.some((item) => forbiddenIds.includes(item)) || authorizedPaths.some((item) => forbiddenPaths.includes(item)) ||
      authorizedEndpointIds.some((item) => forbiddenEndpointIds.includes(item))) {
    throw new TypeError("GKX_EVAL_ORACLE_AUTHORIZATION_OVERLAP");
  }
  if (typeof oracle.expected_public_result_projection_id !== "string" || !/^retrieval:[0-9a-f]{24}$/u.test(oracle.expected_public_result_projection_id)) {
    throw new TypeError("GKX_EVAL_ORACLE_PROJECTION_ID_INVALID");
  }
  assertDigest(oracle.expected_public_result_projection_digest, "GKX_EVAL_ORACLE_PROJECTION_DIGEST_INVALID");
  if (oracle.expected_public_result_projection_id !== `retrieval:${(oracle.expected_public_result_projection_digest as string).slice("sha256:".length, "sha256:".length + 24)}`) {
    throw new TypeError("GKX_EVAL_ORACLE_PROJECTION_BINDING_INVALID");
  }
  assertDigest(oracle.oracle_digest, "GKX_EVAL_ORACLE_DIGEST_INVALID");
  const { oracle_digest, ...material } = oracle;
  if (retrievalCanonicalDigest(material) !== oracle_digest) throw new TypeError("GKX_EVAL_ORACLE_DIGEST_MISMATCH");
  return oracle as unknown as RetrievalEvaluationQueryViewAuditOracle;
}

function assertFiniteNullable(value: unknown, code: string, minimum?: number): void {
  if (value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || minimum !== undefined && value < minimum) throw new TypeError(code);
}

function sealStage(value: unknown, family: "lexical" | "vector" | "reranker"): void {
  const item = value as Record<string, unknown>;
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_STAGE_INVALID");
  const providerKind = item.kind === "openai_compatible" || item.kind === "local_onnx" || item.kind === "mcp";
  exactKeys(item, providerKind ? ["kind", "state", "provider_id", "model_id", "reason_codes"] : ["kind", "state", "reason_codes"], "GKX_EVAL_PUBLIC_RESULT_STAGE_FIELDS_INVALID");
  const kinds = family === "lexical" ? ["sqlite_fts5", "sqlite_lexical_scan"] : family === "vector"
    ? ["none", "openai_compatible", "local_onnx", "mcp"] : ["none", "openai_compatible", "local_onnx", "mcp"];
  if (!kinds.includes(item.kind as string) || !["active", "disabled", "skipped", "degraded"].includes(item.state as string)) {
    throw new TypeError("GKX_EVAL_PUBLIC_RESULT_STAGE_COORDINATE_INVALID");
  }
  sortedUniqueStrings(item.reason_codes, "GKX_EVAL_PUBLIC_RESULT_STAGE_REASONS_INVALID", 64);
  if ((item.reason_codes as string[]).some((code) => !/^[A-Z][A-Z0-9_]{0,127}$/u.test(code))) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_STAGE_REASONS_INVALID");
  if (providerKind) {
    for (const field of ["provider_id", "model_id"] as const) {
      const identity = item[field];
      if (!isValidRetrievalEvaluationOpaqueIdentity(identity)) {
        throw new TypeError("GKX_EVAL_PUBLIC_RESULT_STAGE_IDENTITY_INVALID");
      }
    }
  }
}

function assertPublicStageAlgebra(
  stages: Record<string, unknown>,
  temporalCoverage: "not_requested" | "not_evaluated" | "sufficient" | "insufficient",
): void {
  const lexical = stages.lexical as Record<string, unknown>;
  const vector = stages.vector as Record<string, unknown>;
  const reranker = stages.reranker as Record<string, unknown>;
  const exactStage = (stageValue: Record<string, unknown>, state: string, reasonCodes: readonly string[]): boolean =>
    stageValue.state === state && stableJson(stageValue.reason_codes) === stableJson(reasonCodes);
  const providerKind = (stageValue: Record<string, unknown>): boolean =>
    ["openai_compatible", "local_onnx", "mcp"].includes(stageValue.kind as string);

  if (temporalCoverage === "not_evaluated" || temporalCoverage === "insufficient") {
    const reason = temporalCoverage === "insufficient" ? "TEMPORAL_COVERAGE_INSUFFICIENT" : "NO_ELIGIBLE_RESULTS";
    if (!exactStage(lexical, "skipped", [reason]) ||
        !(vector.kind === "none" ? exactStage(vector, "disabled", ["VECTOR_DISABLED"]) : providerKind(vector) && exactStage(vector, "skipped", [reason])) ||
        !(reranker.kind === "none" ? exactStage(reranker, "skipped", ["RERANKER_NOT_CONFIGURED"]) : providerKind(reranker) && exactStage(reranker, "skipped", [reason]))) {
      throw new TypeError("GKX_EVAL_PUBLIC_RESULT_STAGE_RELATION_INVALID");
    }
    return;
  }

  const lexicalValid = lexical.kind === "sqlite_fts5"
    ? exactStage(lexical, "active", [])
    : lexical.kind === "sqlite_lexical_scan" && exactStage(lexical, "degraded", ["SQLITE_LEXICAL_SCAN_ACTIVE", "SQLITE_LEXICAL_SCAN_APPROXIMATION"]) ||
      lexical.kind === "sqlite_lexical_scan" && exactStage(lexical, "degraded", ["SQLITE_FTS5_UNAVAILABLE", "SQLITE_LEXICAL_SCAN_ACTIVE", "SQLITE_LEXICAL_SCAN_APPROXIMATION"]);
  const vectorValid = vector.kind === "none"
    ? exactStage(vector, "disabled", ["VECTOR_DISABLED"])
    : providerKind(vector) && (exactStage(vector, "active", []) || exactStage(vector, "degraded", ["VECTOR_UNAVAILABLE"]) ||
      exactStage(vector, "degraded", ["VECTOR_PROJECTION_UNAVAILABLE"]));
  const rerankerValid = reranker.kind === "none"
    ? exactStage(reranker, "skipped", ["RERANKER_NOT_CONFIGURED"])
    : providerKind(reranker) && (exactStage(reranker, "active", []) || exactStage(reranker, "degraded", ["RERANKER_UNAVAILABLE"]));
  if (!lexicalValid || !vectorValid || !rerankerValid) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_STAGE_RELATION_INVALID");
}

function sealPublicProvenance(value: unknown, binding: {
  source_id: string;
  source_path: string;
  source_digest: string;
  chunk_id: string;
  content_digest: string;
  lineage_id: null;
  valid_from: string | null;
  valid_to: string | null;
  supersedes: readonly string[];
  superseded_by: readonly string[];
}, asOf: string | null): void {
  const item = value as Record<string, unknown>;
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_INVALID");
  exactKeys(item, [
    "contract_version", "source_id", "source_path", "source_digest", "assertion_time", "assertion_origin", "valid_from", "valid_to",
    "validity_origin", "lineage_id", "supersedes", "superseded_by", "temporal_state", "ledger_binding_verified", "lineage_neutral",
    "reason_codes", "assertion", "interval_semantics", "provenance_digest",
  ], "GKX_EVAL_PUBLIC_PROVENANCE_FIELDS_INVALID");
  if (item.contract_version !== "gkos-retrieval-provenance/1.0.0-draft.1" || item.source_id !== binding.source_id ||
      item.source_path !== binding.source_path || item.source_digest !== binding.source_digest || item.lineage_id !== null ||
      item.valid_from !== binding.valid_from || item.valid_to !== binding.valid_to || item.interval_semantics !== "[valid_from,valid_to)" ||
      item.ledger_binding_verified !== false || stableJson(item.supersedes) !== stableJson(binding.supersedes) ||
      stableJson(item.superseded_by) !== stableJson(binding.superseded_by)) throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_BINDING_INVALID");
  assertDigest(item.source_digest, "GKX_EVAL_PUBLIC_PROVENANCE_DIGEST_INVALID");
  for (const field of ["assertion_time", "valid_from", "valid_to"] as const) {
    const timestamp = item[field];
    if (timestamp !== null) {
      if (typeof timestamp !== "string") throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_TIME_INVALID");
      try { if (normalizeRetrievalAsOf(timestamp) !== timestamp) throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_TIME_INVALID"); }
      catch { throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_TIME_INVALID"); }
    }
  }
  if ((item.assertion_time === null) !== (item.assertion_origin === null) ||
      item.assertion_origin !== null && item.assertion_origin !== "gkx_created_at" ||
      !["gkx_authored_timestamp", "source_created_time", "source_modified_time", "projection_reference_time", "unknown"].includes(item.validity_origin as string) ||
      !["current", "historical", "unknown"].includes(item.temporal_state as string)) throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_TIME_INVALID");
  if ((item.validity_origin === "gkx_authored_timestamp" &&
       (item.assertion_time === null || item.valid_from === null || item.valid_from !== item.assertion_time)) ||
      (item.assertion_time !== null && item.valid_from !== null &&
       (item.validity_origin !== "gkx_authored_timestamp" || item.valid_from !== item.assertion_time))) {
    throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_ASSERTION_VALIDITY_MISMATCH");
  }
  if (item.valid_from === null && item.validity_origin !== "unknown" || item.valid_from !== null && item.validity_origin === "unknown") {
    throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_VALIDITY_ORIGIN_INVALID");
  }
  if (item.valid_from === null ? item.temporal_state !== "unknown" : item.valid_to === null ? item.temporal_state !== "current" : item.temporal_state !== "historical") {
    throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_TEMPORAL_STATE_INVALID");
  }
  if (item.valid_from === null && item.valid_to !== null) throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_INTERVAL_INVALID");
  if (typeof item.valid_from === "string" && typeof item.valid_to === "string" && Date.parse(item.valid_to) < Date.parse(item.valid_from)) {
    throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_INTERVAL_INVALID");
  }
  if (asOf !== null && (typeof item.valid_from !== "string" ||
      Date.parse(item.valid_from) > Date.parse(asOf) || typeof item.valid_to === "string" && Date.parse(asOf) >= Date.parse(item.valid_to))) {
    throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_AS_OF_INVALID");
  }
  for (const field of ["supersedes", "superseded_by", "reason_codes"] as const) sortedUniqueStrings(item[field], `GKX_EVAL_PUBLIC_PROVENANCE_${field.toUpperCase()}_INVALID`, 4096);
  if ([...(item.supersedes as string[]), ...(item.superseded_by as string[])].some((id) => !isValidGkxAuthoredUid(id)) ||
      (item.reason_codes as string[]).some((code) => !/^[A-Z][A-Z0-9_]{0,127}$/u.test(code))) throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_VALUE_INVALID");
  const neutral = (item.supersedes as string[]).length === 0 && (item.superseded_by as string[]).length === 0;
  if (item.lineage_neutral !== neutral) throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_NEUTRAL_INVALID");
  const validityReason: Record<string, string> = {
    gkx_authored_timestamp: "VALIDITY_FROM_GKX_AUTHORED_TIMESTAMP",
    source_created_time: "VALIDITY_FROM_SOURCE_CREATED_TIME",
    source_modified_time: "VALIDITY_FROM_SOURCE_MODIFIED_TIME",
    projection_reference_time: "VALIDITY_FROM_PROJECTION_REFERENCE_TIME",
    unknown: "VALIDITY_UNKNOWN",
  };
  const expectedReasons = [
    "LEDGER_BINDING_UNAVAILABLE",
    "LINEAGE_ID_UNAVAILABLE",
    "LINEAGE_VIEW_AUTHORIZED_ONLY",
    neutral ? "LINEAGE_NEUTRAL" : "LINEAGE_PARTICIPANT",
    validityReason[item.validity_origin as string],
    ...(item.assertion_time === null ? ["ASSERTION_TIME_UNAVAILABLE"] : []),
    ...(asOf === null ? [] : ["TEMPORAL_SELECTION_AS_OF"]),
  ].sort(retrievalCodeUnitCompare);
  if (stableJson(item.reason_codes) !== stableJson(expectedReasons)) throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_REASONS_MISMATCH");
  const assertion = item.assertion as Record<string, unknown>;
  if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_ASSERTION_INVALID");
  exactKeys(assertion, ["chunk_id", "content_digest"], "GKX_EVAL_PUBLIC_PROVENANCE_ASSERTION_FIELDS_INVALID");
  if (assertion.chunk_id !== binding.chunk_id || assertion.content_digest !== binding.content_digest) throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_ASSERTION_BINDING_INVALID");
  assertDigest(assertion.chunk_id, "GKX_EVAL_PUBLIC_PROVENANCE_ASSERTION_INVALID");
  assertDigest(assertion.content_digest, "GKX_EVAL_PUBLIC_PROVENANCE_ASSERTION_INVALID");
  assertDigest(item.provenance_digest, "GKX_EVAL_PUBLIC_PROVENANCE_DIGEST_INVALID");
  const { provenance_digest: _digest, ...material } = item;
  if (retrievalCanonicalDigest(material) !== item.provenance_digest) throw new TypeError("GKX_EVAL_PUBLIC_PROVENANCE_DIGEST_MISMATCH");
}

function sealPublicCitationShape(value: unknown): void {
  const item = value as Record<string, unknown>;
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("GKX_EVAL_PUBLIC_CITATION_INVALID");
  exactKeys(item, ["source_id", "path", "source_digest", "heading_path", "start_byte", "end_byte", "start_line", "end_line", "verified", "stale", "matched_spans"], "GKX_EVAL_PUBLIC_CITATION_FIELDS_INVALID");
  if (typeof item.source_id !== "string" || !isValidGkxAuthoredUid(item.source_id) || typeof item.path !== "string" || !isValidRetrievalEvaluationSourcePath(item.path) ||
      item.verified !== true || item.stale !== false) throw new TypeError("GKX_EVAL_PUBLIC_CITATION_IDENTITY_INVALID");
  assertDigest(item.source_digest, "GKX_EVAL_PUBLIC_CITATION_DIGEST_INVALID");
  if (!Array.isArray(item.heading_path) || item.heading_path.some((part) => typeof part !== "string")) throw new TypeError("GKX_EVAL_PUBLIC_CITATION_HEADING_INVALID");
  for (const field of ["start_byte", "end_byte", "start_line", "end_line"] as const) assertSafeCount(item[field], "GKX_EVAL_PUBLIC_CITATION_COORDINATE_INVALID");
  if ((item.end_byte as number) <= (item.start_byte as number) || (item.start_line as number) < 1 || (item.end_line as number) < (item.start_line as number)) {
    throw new TypeError("GKX_EVAL_PUBLIC_CITATION_COORDINATE_INVALID");
  }
  if (!Array.isArray(item.matched_spans) || item.matched_spans.length > 8) throw new TypeError("GKX_EVAL_PUBLIC_CITATION_SPANS_INVALID");
  for (const rawSpan of item.matched_spans) {
    const span = rawSpan as Record<string, unknown>;
    if (!span || typeof span !== "object" || Array.isArray(span)) throw new TypeError("GKX_EVAL_PUBLIC_CITATION_SPANS_INVALID");
    exactKeys(span, ["start_byte", "end_byte", "text"], "GKX_EVAL_PUBLIC_CITATION_SPANS_INVALID");
    if (!Number.isSafeInteger(span.start_byte) || !Number.isSafeInteger(span.end_byte) || (span.start_byte as number) < (item.start_byte as number) ||
        (span.end_byte as number) > (item.end_byte as number) || (span.end_byte as number) <= (span.start_byte as number) || typeof span.text !== "string") {
      throw new TypeError("GKX_EVAL_PUBLIC_CITATION_SPANS_INVALID");
    }
  }
}

function sealPublicStageScores(value: unknown, finalRank: number): void {
  const item = value as Record<string, unknown>;
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("GKX_EVAL_PUBLIC_SCORES_INVALID");
  exactKeys(item, ["lexical_score", "semantic_score", "fusion_score", "reranker_score", "mmr_score", "lexical_rank", "semantic_rank", "fused_rank", "reranker_rank", "final_rank"], "GKX_EVAL_PUBLIC_SCORES_FIELDS_INVALID");
  for (const field of ["lexical_score", "semantic_score", "reranker_score", "mmr_score"] as const) assertFiniteNullable(item[field], "GKX_EVAL_PUBLIC_SCORE_INVALID");
  assertFiniteNullable(item.fusion_score, "GKX_EVAL_PUBLIC_SCORE_INVALID", 0);
  for (const field of ["lexical_rank", "semantic_rank", "reranker_rank"] as const) {
    if (item[field] !== null && (!Number.isSafeInteger(item[field]) || (item[field] as number) < 1)) throw new TypeError("GKX_EVAL_PUBLIC_RANK_INVALID");
  }
  if (!Number.isSafeInteger(item.fused_rank) || (item.fused_rank as number) < 1 || item.final_rank !== finalRank) throw new TypeError("GKX_EVAL_PUBLIC_RANK_INVALID");
}

function sealEvaluationPublicResult(value: unknown, query: NormalizedRetrievalEvaluationQuery): GkxRetrievalSearchResult {
  const result = value as Record<string, unknown>;
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_INVALID");
  exactKeys(result, ["contract_version", "query_digest", "projection_id", "projection_digest", "projection_freshness", "hits", "confidence", "temporal", "applied_filters", "eligible_result_count", "stages"], "GKX_EVAL_PUBLIC_RESULT_FIELDS_INVALID");
  if (result.contract_version !== RETRIEVAL_LINEAGE_CONTRACT_VERSION || !["fresh", "stale", "unverified"].includes(result.projection_freshness as string)) {
    throw new TypeError("GKX_EVAL_PUBLIC_RESULT_COORDINATE_INVALID");
  }
  assertDigest(result.query_digest, "GKX_EVAL_PUBLIC_RESULT_QUERY_DIGEST_INVALID");
  const expectedQueryDigest = retrievalCanonicalDigest({ as_of: query.as_of, query: retrievalEvaluationEffectiveQueryText(query.text) });
  if (result.query_digest !== expectedQueryDigest) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_QUERY_DIGEST_MISMATCH");
  assertDigest(result.projection_digest, "GKX_EVAL_PUBLIC_RESULT_PROJECTION_DIGEST_INVALID");
  if (result.projection_id !== `retrieval:${(result.projection_digest as string).slice("sha256:".length, "sha256:".length + 24)}`) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_PROJECTION_ID_MISMATCH");
  assertSafeCount(result.eligible_result_count, "GKX_EVAL_PUBLIC_RESULT_ELIGIBLE_COUNT_INVALID");
  if (!Array.isArray(result.applied_filters)) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_FILTERS_INVALID");
  sortedUniqueStrings(result.applied_filters, "GKX_EVAL_PUBLIC_RESULT_FILTERS_INVALID", 64);
  if ((result.applied_filters as string[]).some((name) => !/^[a-z][a-z0-9_]{0,63}$/u.test(name))) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_FILTERS_INVALID");
  const temporal = result.temporal as Record<string, unknown>;
  if (!temporal || typeof temporal !== "object" || Array.isArray(temporal)) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_TEMPORAL_INVALID");
  exactKeys(temporal, ["as_of", "coverage", "reason_codes"], "GKX_EVAL_PUBLIC_RESULT_TEMPORAL_FIELDS_INVALID");
  if (temporal.as_of !== query.as_of || !["not_requested", "not_evaluated", "sufficient", "insufficient"].includes(temporal.coverage as string)) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_TEMPORAL_INVALID");
  if (query.as_of === null ? temporal.coverage !== "not_requested" : temporal.coverage === "not_requested") {
    throw new TypeError("GKX_EVAL_PUBLIC_RESULT_TEMPORAL_COVERAGE_INVALID");
  }
  sortedUniqueStrings(temporal.reason_codes, "GKX_EVAL_PUBLIC_RESULT_TEMPORAL_REASONS_INVALID", 1);
  const expectedTemporalReasons = temporal.coverage === "insufficient" ? ["TEMPORAL_COVERAGE_INSUFFICIENT"] : [];
  if (stableJson(temporal.reason_codes) !== stableJson(expectedTemporalReasons)) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_TEMPORAL_REASONS_INVALID");
  const stages = result.stages as Record<string, unknown>;
  if (!stages || typeof stages !== "object" || Array.isArray(stages)) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_STAGES_INVALID");
  exactKeys(stages, ["lexical", "vector", "reranker"], "GKX_EVAL_PUBLIC_RESULT_STAGES_FIELDS_INVALID");
  sealStage(stages.lexical, "lexical"); sealStage(stages.vector, "vector"); sealStage(stages.reranker, "reranker");
  assertPublicStageAlgebra(stages, temporal.coverage as "not_requested" | "not_evaluated" | "sufficient" | "insufficient");
  if (!Array.isArray(result.hits) || result.hits.length > query.expected_top_k || result.hits.length > 100) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_HITS_INVALID");
  if ((result.eligible_result_count as number) < result.hits.length) throw new TypeError("GKX_EVAL_PUBLIC_RESULT_ELIGIBLE_COUNT_INVALID");
  if ((temporal.coverage === "insufficient" || temporal.coverage === "not_evaluated") && result.hits.length !== 0) {
    throw new TypeError("GKX_EVAL_PUBLIC_RESULT_TEMPORAL_HITS_INVALID");
  }
  if ((temporal.coverage === "insufficient" || temporal.coverage === "not_evaluated") && result.eligible_result_count !== 0) {
    throw new TypeError("GKX_EVAL_PUBLIC_RESULT_TEMPORAL_ELIGIBLE_INVALID");
  }
  const seenChunks = new Set<string>();
  for (const [index, rawHit] of result.hits.entries()) {
    const hit = rawHit as Record<string, unknown>;
    if (!hit || typeof hit !== "object" || Array.isArray(hit)) throw new TypeError("GKX_EVAL_PUBLIC_HIT_INVALID");
    exactKeys(hit, Object.hasOwn(hit, "parent_context") ? ["chunk", "citation", "provenance", "stage_scores", "parent_context"] : ["chunk", "citation", "provenance", "stage_scores"], "GKX_EVAL_PUBLIC_HIT_FIELDS_INVALID");
    validateRetrievalChunk(hit.chunk);
    const chunk = hit.chunk;
    if (chunk.lineage_id !== null || seenChunks.has(chunk.chunk_id)) throw new TypeError("GKX_EVAL_PUBLIC_CHUNK_INVALID");
    seenChunks.add(chunk.chunk_id);
    sealPublicCitationShape(hit.citation);
    sealPublicProvenance(hit.provenance, {
      source_id: chunk.source_id,
      source_path: chunk.source_path,
      source_digest: chunk.source_digest,
      chunk_id: chunk.chunk_id,
      content_digest: chunk.content_digest,
      lineage_id: null,
      valid_from: chunk.valid_from,
      valid_to: chunk.valid_to,
      supersedes: chunk.supersedes,
      superseded_by: chunk.superseded_by,
    }, query.as_of);
    sealPublicStageScores(hit.stage_scores, index + 1);
    if (Object.hasOwn(hit, "parent_context")) {
      const parent = hit.parent_context as Record<string, unknown>;
      if (!parent || typeof parent !== "object" || Array.isArray(parent)) throw new TypeError("GKX_EVAL_PUBLIC_PARENT_INVALID");
      exactKeys(parent, ["chunk_id", "text", "citation", "provenance"], "GKX_EVAL_PUBLIC_PARENT_FIELDS_INVALID");
      assertDigest(parent.chunk_id, "GKX_EVAL_PUBLIC_PARENT_CHUNK_ID_INVALID");
      if (typeof parent.text !== "string" || chunk.parent_chunk_id !== parent.chunk_id || parent.chunk_id === chunk.chunk_id) {
        throw new TypeError("GKX_EVAL_PUBLIC_PARENT_BINDING_INVALID");
      }
      sealPublicCitationShape(parent.citation);
      const parentCitation = parent.citation as SourceCitation;
      if (parentCitation.source_id !== chunk.source_id || parentCitation.path !== chunk.source_path || parentCitation.source_digest !== chunk.source_digest) {
        throw new TypeError("GKX_EVAL_PUBLIC_PARENT_SOURCE_BINDING_INVALID");
      }
      const parentProvenance = parent.provenance as Record<string, unknown>;
      sealPublicProvenance(parent.provenance, {
        source_id: parentCitation.source_id,
        source_path: parentCitation.path,
        source_digest: parentCitation.source_digest,
        chunk_id: parent.chunk_id as string,
        content_digest: retrievalSha256(Buffer.from(parent.text, "utf8")),
        lineage_id: null,
        valid_from: parentProvenance.valid_from as string | null,
        valid_to: parentProvenance.valid_to as string | null,
        supersedes: parentProvenance.supersedes as string[],
        superseded_by: parentProvenance.superseded_by as string[],
      }, query.as_of);
      const childProvenance = hit.provenance as Record<string, unknown>;
      for (const field of [
        "source_id", "source_path", "source_digest", "assertion_time", "assertion_origin", "valid_from", "valid_to", "validity_origin",
        "lineage_id", "supersedes", "superseded_by", "temporal_state", "ledger_binding_verified", "lineage_neutral", "reason_codes", "interval_semantics",
      ] as const) {
        if (stableJson(parentProvenance[field]) !== stableJson(childProvenance[field])) throw new TypeError("GKX_EVAL_PUBLIC_PARENT_PROVENANCE_BINDING_INVALID");
      }
    }
  }
  const confidence = result.confidence as Record<string, unknown>;
  if (!confidence || typeof confidence !== "object" || Array.isArray(confidence)) throw new TypeError("GKX_EVAL_PUBLIC_CONFIDENCE_INVALID");
  exactKeys(confidence, ["level", "low_confidence", "reason_codes", "lexical_signal", "semantic_signal", "reranker_signal", "coverage_signal"], "GKX_EVAL_PUBLIC_CONFIDENCE_FIELDS_INVALID");
  if (!CONFIDENCE.has(confidence.level as RetrievalEvaluationConfidence) || confidence.low_confidence !== (confidence.level === "low" || confidence.level === "insufficient")) {
    throw new TypeError("GKX_EVAL_PUBLIC_CONFIDENCE_COORDINATE_INVALID");
  }
  sortedUniqueStrings(confidence.reason_codes, "GKX_EVAL_PUBLIC_CONFIDENCE_REASONS_INVALID", 64);
  if ((confidence.reason_codes as string[]).some((code) => !/^[A-Z][A-Z0-9_]{0,127}$/u.test(code))) throw new TypeError("GKX_EVAL_PUBLIC_CONFIDENCE_REASONS_INVALID");
  for (const field of ["lexical_signal", "semantic_signal", "reranker_signal", "coverage_signal"] as const) assertFiniteNullable(confidence[field], "GKX_EVAL_PUBLIC_CONFIDENCE_SIGNAL_INVALID");
  if (typeof confidence.coverage_signal === "number" && (confidence.coverage_signal < 0 || confidence.coverage_signal > 1)) throw new TypeError("GKX_EVAL_PUBLIC_CONFIDENCE_SIGNAL_INVALID");
  const baseExpectedConfidence = temporal.coverage === "not_evaluated" || temporal.coverage === "insufficient"
    ? {
        level: "insufficient",
        low_confidence: true,
        reason_codes: [
          temporal.coverage === "insufficient" ? "TEMPORAL_COVERAGE_INSUFFICIENT" : "NO_ELIGIBLE_RESULTS",
          ...(result.projection_freshness === "stale" ? ["STALE_PROJECTION"] : []),
        ].sort(retrievalCodeUnitCompare),
        lexical_signal: null,
        semantic_signal: null,
        reranker_signal: null,
        coverage_signal: null,
      }
    : assessRetrievalConfidence(
        (result.hits as GkxRetrievalSearchResult["hits"]).map((hit) => hit.stage_scores),
        {
          vector: stages.vector as GkxRetrievalSearchResult["stages"]["vector"],
          reranker: stages.reranker as GkxRetrievalSearchResult["stages"]["reranker"],
        },
        result.eligible_result_count as number,
        result.projection_freshness === "stale",
      );
  const expectedConfidence = result.projection_freshness !== "unverified"
    ? baseExpectedConfidence
    : {
        ...baseExpectedConfidence,
        level: baseExpectedConfidence.level === "insufficient" ? "insufficient" : "low",
        low_confidence: true,
        reason_codes: [...new Set([...baseExpectedConfidence.reason_codes, "PROJECTION_FRESHNESS_UNVERIFIED"])].sort(retrievalCodeUnitCompare),
      };
  if (stableJson(confidence) !== stableJson(expectedConfidence)) throw new TypeError("GKX_EVAL_PUBLIC_CONFIDENCE_RELATION_INVALID");
  return result as unknown as GkxRetrievalSearchResult;
}

function citationCheck(
  citation: SourceCitation,
  expected: {
    source_id: string;
    source_path: string;
    source_digest: string;
    content_digest: string;
    text: string;
    heading_path?: readonly string[];
    start_byte?: number;
    end_byte?: number;
    start_line?: number;
    end_line?: number;
    matched_spans: SourceCitation["matched_spans"] | null;
  },
  observations: Map<string, DecodedEvaluationObservation>,
): { passed: number; mismatch: number; stale: number } {
  const observation = observations.get(`${expected.source_id}\0${expected.source_path}`);
  if (!observation) return { passed: 0, mismatch: 1, stale: 0 };
  const currentDigest = observation.source_digest;
  if (expected.source_digest !== currentDigest) return { passed: 0, mismatch: 0, stale: 1 };
  let mismatch = citation.verified !== true || citation.stale !== false || citation.source_id !== expected.source_id || citation.path !== expected.source_path ||
    citation.source_digest !== expected.source_digest ||
    !Number.isSafeInteger(citation.start_byte) || !Number.isSafeInteger(citation.end_byte) || citation.start_byte < 0 || citation.end_byte <= citation.start_byte ||
    citation.end_byte > observation.bytes.length || !isUtf8ScalarBoundary(observation.bytes, citation.start_byte) ||
    !isUtf8ScalarBoundary(observation.bytes, citation.end_byte);
  if (expected.start_byte !== undefined && (citation.start_byte !== expected.start_byte || citation.end_byte !== expected.end_byte ||
      citation.start_line !== expected.start_line || citation.end_line !== expected.end_line)) mismatch = true;
  if (!mismatch) {
    const slice = observation.bytes.subarray(citation.start_byte, citation.end_byte);
    mismatch = slice.toString("utf8") !== expected.text || retrievalSha256(slice) !== expected.content_digest;
    const lines = observation.line_coordinates.get(`${citation.start_byte}:${citation.end_byte}`);
    mismatch ||= !lines || lines.start_line !== citation.start_line || lines.end_line !== citation.end_line;
  }
  if (expected.heading_path && stableJson(citation.heading_path) !== stableJson(expected.heading_path)) mismatch = true;
  if (expected.matched_spans === null || stableJson(citation.matched_spans) !== stableJson(expected.matched_spans)) mismatch = true;
  if (!Array.isArray(citation.matched_spans)) mismatch = true;
  else {
    for (const span of citation.matched_spans) {
      if (!Number.isSafeInteger(span.start_byte) || !Number.isSafeInteger(span.end_byte) || span.start_byte < citation.start_byte || span.end_byte > citation.end_byte || span.end_byte <= span.start_byte ||
          !isUtf8ScalarBoundary(observation.bytes, span.start_byte) || !isUtf8ScalarBoundary(observation.bytes, span.end_byte) ||
          typeof span.text !== "string" || observation.bytes.subarray(span.start_byte, span.end_byte).toString("utf8") !== span.text) mismatch = true;
    }
  }
  return mismatch ? { passed: 0, mismatch: 1, stale: 0 } : { passed: 1, mismatch: 0, stale: 0 };
}

function prepareCitationLineCoordinates(result: GkxRetrievalSearchResult, observations: Map<string, DecodedEvaluationObservation>): void {
  const requests = new Map<DecodedEvaluationObservation, Array<{ start: number; end: number }>>();
  const add = (sourceId: string, sourcePath: string, citation: SourceCitation) => {
    const observation = observations.get(`${sourceId}\0${sourcePath}`);
    if (!observation || !Number.isSafeInteger(citation.start_byte) || !Number.isSafeInteger(citation.end_byte) ||
        citation.start_byte < 0 || citation.end_byte <= citation.start_byte || citation.end_byte > observation.bytes.length) return;
    const current = requests.get(observation) ?? [];
    current.push({ start: citation.start_byte, end: citation.end_byte });
    requests.set(observation, current);
  };
  for (const hit of result.hits) {
    add(hit.chunk.source_id, hit.chunk.source_path, hit.citation);
    if (hit.parent_context) add(hit.parent_context.provenance.source_id, hit.parent_context.citation.path, hit.parent_context.citation);
  }
  for (const [observation, pairs] of requests) {
    const positions = [...new Set(pairs.flatMap(({ start, end }) => [start, end - 1]))].sort((left, right) => left - right);
    const lineByPosition = new Map<number, number>();
    let positionIndex = 0;
    let line = 1;
    for (let byteIndex = 0; byteIndex < observation.bytes.length && positionIndex < positions.length; byteIndex++) {
      let boundary: number | null = null;
      if (observation.bytes[byteIndex] === 0x0d) {
        boundary = observation.bytes[byteIndex + 1] === 0x0a ? byteIndex + 2 : byteIndex + 1;
        if (boundary === byteIndex + 2) byteIndex++;
      } else if (observation.bytes[byteIndex] === 0x0a) boundary = byteIndex + 1;
      if (boundary === null) continue;
      while (positionIndex < positions.length && positions[positionIndex] < boundary) {
        lineByPosition.set(positions[positionIndex++], line);
      }
      line++;
    }
    while (positionIndex < positions.length) lineByPosition.set(positions[positionIndex++], line);
    for (const { start, end } of pairs) {
      observation.line_coordinates.set(`${start}:${end}`, { start_line: lineByPosition.get(start)!, end_line: lineByPosition.get(end - 1)! });
    }
  }
}

function boundedDenseDataArray(value: unknown, maximum: number, code: string): unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) throw new TypeError(code);
  const length = Object.getOwnPropertyDescriptor(value, "length");
  if (!length || !("value" in length) || !Number.isSafeInteger(length.value) || length.value < 0 || length.value > maximum) throw new TypeError(code);
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string" || key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key)) ||
      Object.keys(value).length !== length.value) throw new TypeError(code);
  for (let index = 0; index < length.value; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError(code);
  }
  return value;
}

function recordDataValue(record: unknown, key: string, code: string): unknown {
  if (!record || typeof record !== "object" || Array.isArray(record) || utilTypes.isProxy(record) ||
      (Object.getPrototypeOf(record) !== Object.prototype && Object.getPrototypeOf(record) !== null)) throw new TypeError(code);
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError(code);
  return descriptor.value;
}

function preflightTuneSelectionBounds(input: unknown): void {
  const baseline = recordDataValue(input, "baseline", "GKX_EVAL_TUNE_INPUT_INVALID");
  preflightBaselineBounds(baseline);
  const golden = recordDataValue(baseline, "normalized_golden", "GKX_EVAL_TUNE_INPUT_INVALID");
  const goldenQueries = boundedDenseDataArray(recordDataValue(golden, "queries", "GKX_EVAL_TUNE_GOLDEN_INVALID"), 30, "GKX_EVAL_TUNE_QUERY_COUNT_INVALID");
  for (const query of goldenQueries) preflightNormalizedQueryBounds(query);
  const baselineMetricsSet = recordDataValue(baseline, "metrics_set", "GKX_EVAL_TUNE_INPUT_INVALID");
  if ((recordDataValue(baselineMetricsSet, "query_evaluations", "GKX_EVAL_TUNE_INPUT_INVALID") as unknown[]).length !== goldenQueries.length) {
    throw new TypeError("GKX_EVAL_TUNE_QUERY_METRICS_COUNT_INVALID");
  }
  const candidates = boundedDenseDataArray(recordDataValue(input, "candidates", "GKX_EVAL_TUNE_INPUT_INVALID"), 900, "GKX_EVAL_TUNE_CANDIDATE_COUNT_INVALID");
  let queryEvaluationCount = 0;
  for (const candidate of candidates) {
    const metricsSet = recordDataValue(candidate, "metrics_set", "GKX_EVAL_TUNE_CANDIDATE_INVALID");
    preflightMetricsSetBounds(metricsSet);
    const rows = boundedDenseDataArray(recordDataValue(metricsSet, "query_evaluations", "GKX_EVAL_TUNE_CANDIDATE_INVALID"), 30,
      "GKX_EVAL_TUNE_QUERY_METRICS_COUNT_INVALID");
    queryEvaluationCount += rows.length;
    if (rows.length !== goldenQueries.length || queryEvaluationCount > 27_000) throw new TypeError("GKX_EVAL_TUNE_QUERY_EVALUATION_COUNT_INVALID");
    for (const row of rows) preflightQueryMetricsBounds(recordDataValue(row, "query_metrics", "GKX_EVAL_TUNE_CANDIDATE_INVALID"));
  }
  preflightPlainEvaluationData(input, "GKX_EVAL_TUNE_INPUT_INVALID");
}

function publicTemporalProjection(result: GkxRetrievalSearchResult): RetrievalEvaluationExpectedTemporal {
  return {
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
}

function sealExpectedTemporal(value: unknown, asOf: string | null): RetrievalEvaluationExpectedTemporal {
  preflightExpectedTemporalBounds(value);
  const temporal = inertClone(value) as unknown as Record<string, unknown>;
  if (!temporal || typeof temporal !== "object" || Array.isArray(temporal)) throw new TypeError("GKX_EVAL_EXPECTED_TEMPORAL_INVALID");
  exactKeys(temporal, ["coverage", "hits"], "GKX_EVAL_EXPECTED_TEMPORAL_FIELDS_INVALID");
  if (!["not_requested", "not_evaluated", "sufficient", "insufficient"].includes(temporal.coverage as string) ||
      (asOf === null ? temporal.coverage !== "not_requested" : temporal.coverage === "not_requested") || !Array.isArray(temporal.hits) || temporal.hits.length > 100) {
    throw new TypeError("GKX_EVAL_EXPECTED_TEMPORAL_COORDINATE_INVALID");
  }
  if ((temporal.coverage === "insufficient" || temporal.coverage === "not_evaluated") && temporal.hits.length !== 0) {
    throw new TypeError("GKX_EVAL_EXPECTED_TEMPORAL_HITS_INVALID");
  }
  const hits = temporal.hits.map((rawHit) => {
    const hit = rawHit as Record<string, unknown>;
    if (!hit || typeof hit !== "object" || Array.isArray(hit)) throw new TypeError("GKX_EVAL_EXPECTED_TEMPORAL_HIT_INVALID");
    exactKeys(hit, ["source_id", "temporal_state", "valid_from", "valid_to", "supersedes", "superseded_by"], "GKX_EVAL_EXPECTED_TEMPORAL_HIT_FIELDS_INVALID");
    if (typeof hit.source_id !== "string" || !isValidGkxAuthoredUid(hit.source_id) || !["current", "historical", "unknown"].includes(hit.temporal_state as string)) {
      throw new TypeError("GKX_EVAL_EXPECTED_TEMPORAL_HIT_COORDINATE_INVALID");
    }
    for (const field of ["valid_from", "valid_to"] as const) {
      if (hit[field] !== null) {
        if (typeof hit[field] !== "string") throw new TypeError("GKX_EVAL_EXPECTED_TEMPORAL_HIT_TIME_INVALID");
        try { if (normalizeRetrievalAsOf(hit[field] as string) !== hit[field]) throw new TypeError("GKX_EVAL_EXPECTED_TEMPORAL_HIT_TIME_INVALID"); }
        catch { throw new TypeError("GKX_EVAL_EXPECTED_TEMPORAL_HIT_TIME_INVALID"); }
      }
    }
    if (hit.valid_from === null ? hit.temporal_state !== "unknown" : hit.valid_to === null ? hit.temporal_state !== "current" : hit.temporal_state !== "historical") {
      throw new TypeError("GKX_EVAL_EXPECTED_TEMPORAL_HIT_STATE_INVALID");
    }
    if (hit.valid_from === null && hit.valid_to !== null) throw new TypeError("GKX_EVAL_EXPECTED_TEMPORAL_HIT_INTERVAL_INVALID");
    if (typeof hit.valid_from === "string" && typeof hit.valid_to === "string" && Date.parse(hit.valid_to) < Date.parse(hit.valid_from)) {
      throw new TypeError("GKX_EVAL_EXPECTED_TEMPORAL_HIT_INTERVAL_INVALID");
    }
    if (asOf !== null && (typeof hit.valid_from !== "string" || Date.parse(hit.valid_from) > Date.parse(asOf) ||
        typeof hit.valid_to === "string" && Date.parse(asOf) >= Date.parse(hit.valid_to))) {
      throw new TypeError("GKX_EVAL_EXPECTED_TEMPORAL_HIT_AS_OF_INVALID");
    }
    sortedUniqueStrings(hit.supersedes, "GKX_EVAL_EXPECTED_TEMPORAL_SUPERSEDES_INVALID", 4096);
    sortedUniqueStrings(hit.superseded_by, "GKX_EVAL_EXPECTED_TEMPORAL_SUPERSEDED_BY_INVALID", 4096);
    if ([...(hit.supersedes as string[]), ...(hit.superseded_by as string[])].some((id) => !isValidGkxAuthoredUid(id))) {
      throw new TypeError("GKX_EVAL_EXPECTED_TEMPORAL_ENDPOINT_INVALID");
    }
    return hit as unknown as RetrievalEvaluationExpectedTemporalHit;
  });
  return { coverage: temporal.coverage as RetrievalEvaluationExpectedTemporal["coverage"], hits };
}

function policyMetrics(result: GkxRetrievalSearchResult, query: NormalizedRetrievalEvaluationQuery, oracle: RetrievalEvaluationQueryViewAuditOracle): RetrievalEvaluationPolicyMetrics {
  const forbiddenIds = new Set([...query.forbidden_source_ids, ...oracle.forbidden_source_ids]);
  const forbiddenPaths = new Set(oracle.forbidden_source_paths);
  const authorizedIds = new Set(oracle.authorized_source_ids);
  const authorizedPaths = new Set(oracle.authorized_source_paths);
  const forbiddenEndpointIds = new Set(oracle.forbidden_endpoint_ids);
  const authorizedEndpointIds = new Set(oracle.authorized_endpoint_ids);
  let identityFieldCount = 0;
  let leakCount = 0;
  let unknownCount = 0;
  const identifier = (value: unknown) => {
    if (typeof value !== "string") return;
    identityFieldCount++;
    if (forbiddenIds.has(value)) leakCount++;
    else if (!authorizedIds.has(value)) unknownCount++;
  };
  const endpoint = (value: unknown) => {
    if (value === null || value === undefined) return;
    if (typeof value !== "string" || !isValidGkxAuthoredUid(value)) throw new TypeError("GKX_EVAL_POLICY_ENDPOINT_INVALID");
    identityFieldCount++;
    if (forbiddenEndpointIds.has(value)) leakCount++;
    else if (!authorizedEndpointIds.has(value)) unknownCount++;
  };
  const path = (value: unknown) => {
    if (typeof value !== "string") return;
    identityFieldCount++;
    if (forbiddenPaths.has(value)) leakCount++;
    else if (!authorizedPaths.has(value)) unknownCount++;
  };
  identityFieldCount += 2;
  if (result.projection_id !== oracle.expected_public_result_projection_id) leakCount++;
  if (result.projection_digest !== oracle.expected_public_result_projection_digest) leakCount++;
  const visitProvenance = (provenance: GkxRetrievalSearchResult["hits"][number]["provenance"]) => {
    identifier(provenance.source_id);
    path(provenance.source_path);
    endpoint(provenance.lineage_id);
    provenance.supersedes.forEach(endpoint);
    provenance.superseded_by.forEach(endpoint);
  };
  for (const hit of result.hits) {
    identifier(hit.chunk.source_id);
    path(hit.chunk.source_path);
    endpoint(hit.chunk.lineage_id);
    hit.chunk.supersedes.forEach(endpoint);
    hit.chunk.superseded_by.forEach(endpoint);
    identifier(hit.citation.source_id);
    path(hit.citation.path);
    visitProvenance(hit.provenance);
    if (hit.parent_context) {
      identifier(hit.parent_context.citation.source_id);
      path(hit.parent_context.citation.path);
      visitProvenance(hit.parent_context.provenance);
    }
  }
  if (unknownCount !== 0) throw new TypeError("GKX_EVAL_ORACLE_PARTITION_INCOMPLETE");
  return {
    policy_identity_field_count: identityFieldCount,
    policy_leak_count: leakCount,
    policy_leak_rate_micros: identityFieldCount === 0 ? 0 : roundNonnegativeRatio(BigInt(leakCount), BigInt(identityFieldCount)),
  };
}

function computeRetrievalEvaluationQueryMetricsInternal(
  input: RetrievalEvaluationQueryInput,
  onCitationVerification?: () => void,
): RetrievalEvaluationQueryMetrics {
  preflightQueryInputBounds(input);
  const inputRecord = input as unknown as Record<string, unknown>;
  exactKeys(inputRecord, ["query", "result", "source_observations", "audit_oracle", "expected_temporal"], "GKX_EVAL_QUERY_INPUT_FIELDS_INVALID");
  const query = sealNormalizedRetrievalEvaluationQuery(recordDataValue(inputRecord, "query", "GKX_EVAL_QUERY_INPUT_INVALID"));
  const oracle = sealOracle(recordDataValue(inputRecord, "audit_oracle", "GKX_EVAL_QUERY_INPUT_INVALID"));
  const result = sealEvaluationPublicResult(inertClone(recordDataValue(inputRecord, "result", "GKX_EVAL_QUERY_INPUT_INVALID")), query);
  const sourceObservations = boundedDenseDataArray(recordDataValue(inputRecord, "source_observations", "GKX_EVAL_QUERY_INPUT_INVALID"), RETRIEVAL_EVALUATION_MAX_SOURCE_OBSERVATIONS, "GKX_EVAL_SOURCE_OBSERVATION_COUNT_INVALID");
  const decoded: DecodedEvaluationObservation[] = [];
  let totalSourceBytes = 0;
  for (const observation of sourceObservations) {
    const item = decodeObservation(observation);
    totalSourceBytes += item.bytes.length;
    if (totalSourceBytes > RETRIEVAL_EVALUATION_MAX_TOTAL_SOURCE_BYTES) throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_TOTAL_SIZE_INVALID");
    decoded.push(item);
  }
  const observations = new Map<string, DecodedEvaluationObservation>();
  const observationsByPath = new Map<string, typeof decoded>();
  const observationsBySource = new Map<string, typeof decoded>();
  for (const item of decoded) {
    const key = `${item.source_id}\0${item.source_path}`;
    if (observations.has(key)) throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_DUPLICATE");
    observations.set(key, item);
    const paths = observationsByPath.get(item.source_path) ?? [];
    paths.push(item);
    observationsByPath.set(item.source_path, paths);
    const sources = observationsBySource.get(item.source_id) ?? [];
    sources.push(item);
    observationsBySource.set(item.source_id, sources);
  }
  if ([...observationsByPath.values()].some((items) => items.length !== 1) || [...observationsBySource.values()].some((items) => items.length !== 1)) {
    throw new TypeError("GKX_EVAL_SOURCE_OBSERVATION_ONE_TO_ONE_INVALID");
  }
  const observedSourceIds = decoded.map((item) => item.source_id).sort(retrievalCodeUnitCompare);
  const observedSourcePaths = decoded.map((item) => item.source_path).sort(retrievalCodeUnitCompare);
  const oracleSourceIds = [...oracle.authorized_source_ids, ...oracle.forbidden_source_ids].sort(retrievalCodeUnitCompare);
  const oracleSourcePaths = [...oracle.authorized_source_paths, ...oracle.forbidden_source_paths].sort(retrievalCodeUnitCompare);
  if (stableJson(observedSourceIds) !== stableJson(oracleSourceIds) || stableJson(observedSourcePaths) !== stableJson(oracleSourcePaths)) {
    throw new TypeError("GKX_EVAL_ORACLE_CATALOG_PARTITION_INCOMPLETE");
  }
  if (decoded.some((item) => {
    const authorizedId = oracle.authorized_source_ids.includes(item.source_id);
    const authorizedPath = oracle.authorized_source_paths.includes(item.source_path);
    const forbiddenId = oracle.forbidden_source_ids.includes(item.source_id);
    const forbiddenPath = oracle.forbidden_source_paths.includes(item.source_path);
    return authorizedId !== authorizedPath || forbiddenId !== forbiddenPath || authorizedId === forbiddenId;
  })) {
    throw new TypeError("GKX_EVAL_ORACLE_CATALOG_PARTITION_INCOMPLETE");
  }
  const relevant = new Set(query.expected_source_ids);
  for (const expectedSourceId of query.expected_source_ids) {
    if ((observationsBySource.get(expectedSourceId) ?? []).length !== 1) throw new TypeError("GKX_EVAL_EXPECTED_SOURCE_RESOLUTION_INVALID");
  }
  for (const forbiddenSourceId of query.forbidden_source_ids) {
    const matches = observationsBySource.get(forbiddenSourceId) ?? [];
    if (matches.length !== 1 || !oracle.forbidden_source_ids.includes(forbiddenSourceId) ||
        !oracle.forbidden_source_paths.includes(matches[0].source_path)) {
      throw new TypeError("GKX_EVAL_FORBIDDEN_SOURCE_RESOLUTION_INVALID");
    }
  }
  for (const expectedPath of query.expected_files) {
    const matches = observationsByPath.get(expectedPath) ?? [];
    if (matches.length !== 1) throw new TypeError("GKX_EVAL_EXPECTED_FILE_RESOLUTION_INVALID");
    relevant.add(matches[0].source_id);
  }
  const relevantObservations = [...relevant].map((sourceId) => observationsBySource.get(sourceId)?.[0]);
  if (relevant.size === 0 || relevantObservations.some((item) => !item) || [...relevant].some((sourceId) =>
      query.forbidden_source_ids.includes(sourceId) || oracle.forbidden_source_ids.includes(sourceId)) ||
      relevantObservations.some((item) => oracle.forbidden_source_paths.includes(item!.source_path))) throw new TypeError("GKX_EVAL_RELEVANCE_INVALID");

  const firstSourceRanks = new Map<string, number>();
  for (const [index, hit] of result.hits.entries()) {
    if (hit.chunk.source_id !== hit.citation.source_id || hit.chunk.source_id !== hit.provenance.source_id || hit.chunk.source_path !== hit.citation.path) {
      throw new TypeError("GKX_EVAL_PUBLIC_RESULT_IDENTITY_MISMATCH");
    }
    if (!firstSourceRanks.has(hit.chunk.source_id)) firstSourceRanks.set(hit.chunk.source_id, index + 1);
  }
  const relevantRanks = [...firstSourceRanks].flatMap(([sourceId, rank]) => relevant.has(sourceId) ? [rank] : []);
  const firstRelevantRank = relevantRanks[0] ?? null;
  const recall = roundNonnegativeRatio(BigInt(relevantRanks.length), BigInt(relevant.size));
  const mrr = firstRelevantRank === null ? 0 : roundNonnegativeRatio(1n, BigInt(firstRelevantRank));
  const ndcg = ndcgMicros(relevantRanks, relevant.size, query.expected_top_k);

  prepareCitationLineCoordinates(result, observations);
  let checked = 0;
  let passed = 0;
  let mismatch = 0;
  let stale = 0;
  const claimedMatchedSpans = new Set<string>();
  const acceptedIntervals: GkxRetrievalAcceptedCitationInterval[] = [];
  const effectiveQuery = retrievalEvaluationEffectiveQueryText(query.text);
  for (const hit of result.hits) {
    const observation = observations.get(`${hit.chunk.source_id}\0${hit.chunk.source_path}`);
    const expectedEvidence = observation
      ? gkxRetrievalDeduplicateOverlapEvidence(
          gkxRetrievalVerifiedCitation(hit.chunk, effectiveQuery, observation.bytes),
          hit.chunk,
          claimedMatchedSpans,
          acceptedIntervals,
        )
      : null;
    onCitationVerification?.();
    const child = citationCheck(hit.citation, {
      source_id: hit.chunk.source_id,
      source_path: hit.chunk.source_path,
      source_digest: hit.chunk.source_digest,
      content_digest: hit.chunk.content_digest,
      text: hit.chunk.text,
      heading_path: hit.chunk.heading_path,
      start_byte: hit.chunk.start_byte,
      end_byte: hit.chunk.end_byte,
      start_line: hit.chunk.start_line,
      end_line: hit.chunk.end_line,
      matched_spans: expectedEvidence?.citation.matched_spans ?? null,
    }, observations);
    checked++; passed += child.passed; mismatch += child.mismatch; stale += child.stale;
    if (expectedEvidence) {
      for (const key of expectedEvidence.span_keys) claimedMatchedSpans.add(key);
      acceptedIntervals.push({ source_id: hit.chunk.source_id, start_byte: hit.chunk.start_byte, end_byte: hit.chunk.end_byte });
    }
    if (hit.parent_context) {
      onCitationVerification?.();
      const parent = citationCheck(hit.parent_context.citation, {
        source_id: hit.parent_context.provenance.source_id,
        source_path: hit.parent_context.citation.path,
        source_digest: hit.parent_context.provenance.source_digest,
        content_digest: hit.parent_context.provenance.assertion.content_digest,
        text: hit.parent_context.text,
        matched_spans: [],
      }, observations);
      checked++; passed += parent.passed; mismatch += parent.mismatch; stale += parent.stale;
    }
  }
  const citation: RetrievalEvaluationCitationMetrics = {
    applicability: result.hits.length === 0 ? "not_applicable" : "required",
    checked,
    passed,
    mismatch,
    stale,
    correctness_micros: checked === 0 ? null : roundNonnegativeRatio(BigInt(passed), BigInt(checked)),
  };
  const policy = policyMetrics(result, query, oracle);
  const expectedTemporal = sealExpectedTemporal(recordDataValue(inputRecord, "expected_temporal", "GKX_EVAL_QUERY_INPUT_INVALID"), query.as_of);
  const temporalMismatch = stableJson(publicTemporalProjection(result)) === stableJson(expectedTemporal) ? 0 : 1;
  const material: Omit<RetrievalEvaluationQueryMetrics, "query_metrics_digest"> = {
    contract_version: RETRIEVAL_EVALUATION_QUERY_METRICS_VERSION,
    query_id: query.id,
    expected_top_k: query.expected_top_k,
    relevant_source_count: relevant.size,
    returned_unique_source_count: firstSourceRanks.size,
    relevant_returned_source_count: relevantRanks.length,
    relevant_source_ranks: relevantRanks,
    first_relevant_rank: firstRelevantRank,
    recall_at_k_micros: recall,
    mrr_micros: mrr,
    ndcg_at_k_micros: ndcg,
    citation,
    policy,
    confidence_mismatch_count: result.confidence.level === query.expected_confidence ? 0 : 1,
    temporal_mismatch_count: temporalMismatch,
    stale_citation_query_count: citation.stale > 0 ? 1 : 0,
    stale_projection_query_count: result.projection_freshness === "stale" ? 1 : 0,
    unverified_projection_query_count: result.projection_freshness === "unverified" ? 1 : 0,
  };
  return sealRetrievalEvaluationQueryMetrics({ ...material, query_metrics_digest: retrievalCanonicalDigest(material) });
}

export function computeRetrievalEvaluationQueryMetrics(input: RetrievalEvaluationQueryInput): RetrievalEvaluationQueryMetrics {
  return computeRetrievalEvaluationQueryMetricsInternal(input);
}

/** Host-private metric replay with exact evaluator citation-operation evidence. */
export function computeRetrievalEvaluationQueryMetricsForHost(
  input: RetrievalEvaluationQueryInput,
  onCitationVerification: () => void,
): RetrievalEvaluationQueryMetrics {
  if (typeof onCitationVerification !== "function") throw new TypeError("GKX_EVAL_HOST_CITATION_OBSERVER_INVALID");
  return computeRetrievalEvaluationQueryMetricsInternal(input, onCitationVerification);
}

function sealCitationMetrics(value: unknown): RetrievalEvaluationCitationMetrics {
  const item = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(item, ["applicability", "checked", "passed", "mismatch", "stale", "correctness_micros"], "GKX_EVAL_CITATION_METRICS_FIELDS_INVALID");
  if (item.applicability !== "required" && item.applicability !== "not_applicable") throw new TypeError("GKX_EVAL_CITATION_APPLICABILITY_INVALID");
  for (const field of ["checked", "passed", "mismatch", "stale"] as const) assertSafeCount(item[field], `GKX_EVAL_CITATION_${field.toUpperCase()}_INVALID`, 51_200);
  if ((item.correctness_micros === null) !== (item.checked === 0)) throw new TypeError("GKX_EVAL_CITATION_CORRECTNESS_APPLICABILITY_INVALID");
  if (item.correctness_micros !== null) assertMicros(item.correctness_micros, "GKX_EVAL_CITATION_CORRECTNESS_INVALID");
  if ((item.passed as number) + (item.mismatch as number) + (item.stale as number) !== item.checked) throw new TypeError("GKX_EVAL_CITATION_COUNT_MISMATCH");
  if (item.applicability === "not_applicable" && (item.checked !== 0 || item.passed !== 0 || item.mismatch !== 0 || item.stale !== 0)) {
    throw new TypeError("GKX_EVAL_CITATION_NOT_APPLICABLE_INVALID");
  }
  const expectedCorrectness = item.checked === 0 ? null : roundNonnegativeRatio(BigInt(item.passed as number), BigInt(item.checked as number));
  if (item.correctness_micros !== expectedCorrectness) throw new TypeError("GKX_EVAL_CITATION_CORRECTNESS_MISMATCH");
  return item as unknown as RetrievalEvaluationCitationMetrics;
}

function sealPolicyMetrics(value: unknown): RetrievalEvaluationPolicyMetrics {
  const item = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(item, ["policy_identity_field_count", "policy_leak_count", "policy_leak_rate_micros"], "GKX_EVAL_POLICY_METRICS_FIELDS_INVALID");
  assertSafeCount(item.policy_identity_field_count, "GKX_EVAL_POLICY_FIELD_COUNT_INVALID");
  assertSafeCount(item.policy_leak_count, "GKX_EVAL_POLICY_LEAK_COUNT_INVALID");
  assertMicros(item.policy_leak_rate_micros, "GKX_EVAL_POLICY_LEAK_RATE_INVALID");
  if ((item.policy_leak_count as number) > (item.policy_identity_field_count as number) ||
      item.policy_leak_rate_micros !== ((item.policy_identity_field_count as number) === 0 ? 0 : roundNonnegativeRatio(BigInt(item.policy_leak_count as number), BigInt(item.policy_identity_field_count as number)))) {
    throw new TypeError("GKX_EVAL_POLICY_RATE_MISMATCH");
  }
  return item as unknown as RetrievalEvaluationPolicyMetrics;
}

export function sealRetrievalEvaluationQueryMetrics(value: unknown): RetrievalEvaluationQueryMetrics {
  preflightQueryMetricsBounds(value);
  const item = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(item, [
    "contract_version", "query_id", "expected_top_k", "relevant_source_count", "returned_unique_source_count",
    "relevant_returned_source_count", "relevant_source_ranks", "first_relevant_rank", "recall_at_k_micros", "mrr_micros", "ndcg_at_k_micros",
    "citation", "policy", "confidence_mismatch_count", "temporal_mismatch_count", "stale_citation_query_count", "stale_projection_query_count",
    "unverified_projection_query_count", "query_metrics_digest",
  ], "GKX_EVAL_QUERY_METRICS_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_QUERY_METRICS_VERSION || !isBoundedEvaluationId(item.query_id)) throw new TypeError("GKX_EVAL_QUERY_METRICS_COORDINATE_INVALID");
  for (const field of ["expected_top_k", "relevant_source_count", "returned_unique_source_count", "relevant_returned_source_count"] as const) {
    assertSafeCount(item[field], `GKX_EVAL_QUERY_METRICS_${field.toUpperCase()}_INVALID`);
  }
  for (const field of ["confidence_mismatch_count", "temporal_mismatch_count", "stale_citation_query_count", "stale_projection_query_count", "unverified_projection_query_count"] as const) {
    assertSafeCount(item[field], `GKX_EVAL_QUERY_METRICS_${field.toUpperCase()}_INVALID`, 1);
  }
  if ((item.expected_top_k as number) < 1 || (item.expected_top_k as number) > 100) throw new TypeError("GKX_EVAL_QUERY_METRICS_TOP_K_INVALID");
  if (!Array.isArray(item.relevant_source_ranks) || item.relevant_source_ranks.some((rank) => !Number.isSafeInteger(rank) || rank < 1 || rank > item.expected_top_k) ||
      item.relevant_source_ranks.some((rank, index, ranks) => index > 0 && rank <= ranks[index - 1]) || item.relevant_source_ranks.length !== item.relevant_returned_source_count) {
    throw new TypeError("GKX_EVAL_RELEVANT_RANKS_INVALID");
  }
  for (const field of ["recall_at_k_micros", "mrr_micros", "ndcg_at_k_micros"] as const) assertMicros(item[field], `GKX_EVAL_QUERY_METRICS_${field.toUpperCase()}_INVALID`);
  if (item.first_relevant_rank !== null) assertSafeCount(item.first_relevant_rank, "GKX_EVAL_FIRST_RELEVANT_RANK_INVALID", 100);
  const ranks = item.relevant_source_ranks as number[];
  if ((item.relevant_source_count as number) < 1 || (item.relevant_source_count as number) > 512 ||
      (item.returned_unique_source_count as number) > (item.expected_top_k as number) ||
      (item.relevant_returned_source_count as number) > (item.relevant_source_count as number) || (item.relevant_returned_source_count as number) > (item.returned_unique_source_count as number) ||
      item.first_relevant_rank !== (ranks[0] ?? null) ||
      item.recall_at_k_micros !== roundNonnegativeRatio(BigInt(item.relevant_returned_source_count as number), BigInt(item.relevant_source_count as number)) ||
      item.mrr_micros !== (item.first_relevant_rank === null ? 0 : roundNonnegativeRatio(1n, BigInt(item.first_relevant_rank as number))) ||
      item.ndcg_at_k_micros !== ndcgMicros(ranks, item.relevant_source_count as number, item.expected_top_k as number)) {
    throw new TypeError("GKX_EVAL_QUERY_METRICS_RELATION_INVALID");
  }
  item.citation = sealCitationMetrics(item.citation);
  item.policy = sealPolicyMetrics(item.policy);
  if (item.stale_citation_query_count !== ((item.citation as RetrievalEvaluationCitationMetrics).stale > 0 ? 1 : 0)) {
    throw new TypeError("GKX_EVAL_STALE_CITATION_QUERY_COUNT_MISMATCH");
  }
  if ((item.policy as RetrievalEvaluationPolicyMetrics).policy_identity_field_count <
      2 + 6 * (item.returned_unique_source_count as number)) throw new TypeError("GKX_EVAL_QUERY_POLICY_FIELD_COUNT_INVALID");
  const noReturnedSource = (item.returned_unique_source_count as number) === 0;
  const citation = item.citation as RetrievalEvaluationCitationMetrics;
  if (noReturnedSource
    ? citation.applicability !== "not_applicable" || citation.checked !== 0 || citation.correctness_micros !== null
    : citation.applicability !== "required" || citation.checked < 1 || citation.checked > (item.expected_top_k as number) * 2) {
    throw new TypeError("GKX_EVAL_QUERY_CITATION_APPLICABILITY_RELATION_INVALID");
  }
  assertDigest(item.query_metrics_digest, "GKX_EVAL_QUERY_METRICS_DIGEST_INVALID");
  if (metricDigest(item, "query_metrics_digest") !== item.query_metrics_digest) throw new TypeError("GKX_EVAL_QUERY_METRICS_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationQueryMetrics;
}

export function aggregateRetrievalEvaluationMetrics(values: readonly RetrievalEvaluationQueryMetrics[]): RetrievalEvaluationAggregateMetrics {
  preflightPlainEvaluationData(values, "GKX_EVAL_AGGREGATE_QUERY_COUNT_INVALID");
  const boundedValues = boundedDenseDataArray(values, 256, "GKX_EVAL_AGGREGATE_QUERY_COUNT_INVALID");
  if (boundedValues.length < 1) throw new TypeError("GKX_EVAL_AGGREGATE_QUERY_COUNT_INVALID");
  for (const value of boundedValues) preflightQueryMetricsBounds(value);
  const queries = values.map(sealRetrievalEvaluationQueryMetrics);
  if (new Set(queries.map((item) => item.query_id)).size !== queries.length) throw new TypeError("GKX_EVAL_AGGREGATE_QUERY_DUPLICATE");
  const mean = (field: "recall_at_k_micros" | "mrr_micros" | "ndcg_at_k_micros") =>
    roundNonnegativeIntegerRatio(queries.reduce((sum, item) => sum + BigInt(item[field]), 0n), BigInt(queries.length));
  const checked = queries.reduce((sum, item) => sum + item.citation.checked, 0);
  const passed = queries.reduce((sum, item) => sum + item.citation.passed, 0);
  const mismatch = queries.reduce((sum, item) => sum + item.citation.mismatch, 0);
  const stale = queries.reduce((sum, item) => sum + item.citation.stale, 0);
  const fieldsBigInt = queries.reduce((sum, item) => sum + BigInt(item.policy.policy_identity_field_count), 0n);
  const leaksBigInt = queries.reduce((sum, item) => sum + BigInt(item.policy.policy_leak_count), 0n);
  if (fieldsBigInt > BigInt(Number.MAX_SAFE_INTEGER) || leaksBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError("GKX_EVAL_AGGREGATE_POLICY_COUNT_OVERFLOW");
  }
  const fields = Number(fieldsBigInt);
  const leaks = Number(leaksBigInt);
  const material: Omit<RetrievalEvaluationAggregateMetrics, "aggregate_metrics_digest"> = {
    contract_version: RETRIEVAL_EVALUATION_AGGREGATE_VERSION,
    query_count: queries.length,
    recall_at_k_micros: mean("recall_at_k_micros"),
    mrr_micros: mean("mrr_micros"),
    ndcg_at_k_micros: mean("ndcg_at_k_micros"),
    citation: {
      applicability: queries.every((item) => item.citation.applicability === "not_applicable") ? "not_applicable" : "required",
      checked,
      passed,
      mismatch,
      stale,
      correctness_micros: checked === 0 ? null : roundNonnegativeRatio(BigInt(passed), BigInt(checked)),
    },
    policy: {
      policy_identity_field_count: fields,
      policy_leak_count: leaks,
      policy_leak_rate_micros: fields === 0 ? 0 : roundNonnegativeRatio(BigInt(leaks), BigInt(fields)),
    },
    confidence_mismatch_count: queries.reduce((sum, item) => sum + item.confidence_mismatch_count, 0),
    temporal_mismatch_count: queries.reduce((sum, item) => sum + item.temporal_mismatch_count, 0),
    stale_citation_query_count: queries.reduce((sum, item) => sum + item.stale_citation_query_count, 0),
    stale_citation_query_rate_micros: roundNonnegativeRatio(
      BigInt(queries.reduce((sum, item) => sum + item.stale_citation_query_count, 0)),
      BigInt(queries.length),
    ),
    stale_projection_query_count: queries.reduce((sum, item) => sum + item.stale_projection_query_count, 0),
    unverified_projection_query_count: queries.reduce((sum, item) => sum + item.unverified_projection_query_count, 0),
    unverified_projection_rate_micros: roundNonnegativeRatio(
      BigInt(queries.reduce((sum, item) => sum + item.unverified_projection_query_count, 0)),
      BigInt(queries.length),
    ),
  };
  return sealRetrievalEvaluationAggregateMetrics({ ...material, aggregate_metrics_digest: retrievalCanonicalDigest(material) });
}

export function sealRetrievalEvaluationAggregateMetrics(value: unknown): RetrievalEvaluationAggregateMetrics {
  preflightPlainEvaluationData(value, "GKX_EVAL_AGGREGATE_INVALID");
  const item = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(item, [
    "contract_version", "query_count", "recall_at_k_micros", "mrr_micros", "ndcg_at_k_micros", "citation", "policy",
    "confidence_mismatch_count", "temporal_mismatch_count", "stale_citation_query_count", "stale_citation_query_rate_micros",
    "stale_projection_query_count", "unverified_projection_query_count",
    "unverified_projection_rate_micros", "aggregate_metrics_digest",
  ], "GKX_EVAL_AGGREGATE_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_AGGREGATE_VERSION) throw new TypeError("GKX_EVAL_AGGREGATE_COORDINATE_INVALID");
  assertSafeCount(item.query_count, "GKX_EVAL_AGGREGATE_QUERY_COUNT_INVALID", 256);
  if ((item.query_count as number) < 1) throw new TypeError("GKX_EVAL_AGGREGATE_QUERY_COUNT_INVALID");
  for (const field of ["recall_at_k_micros", "mrr_micros", "ndcg_at_k_micros"] as const) assertMicros(item[field], `GKX_EVAL_AGGREGATE_${field.toUpperCase()}_INVALID`);
  for (const field of ["confidence_mismatch_count", "temporal_mismatch_count", "stale_citation_query_count", "stale_projection_query_count", "unverified_projection_query_count"] as const) assertSafeCount(item[field], `GKX_EVAL_AGGREGATE_${field.toUpperCase()}_INVALID`);
  assertMicros(item.stale_citation_query_rate_micros, "GKX_EVAL_AGGREGATE_STALE_CITATION_QUERY_RATE_INVALID");
  assertMicros(item.unverified_projection_rate_micros, "GKX_EVAL_AGGREGATE_UNVERIFIED_PROJECTION_RATE_INVALID");
  if ([item.confidence_mismatch_count, item.temporal_mismatch_count, item.stale_citation_query_count, item.stale_projection_query_count, item.unverified_projection_query_count]
      .some((count) => (count as number) > (item.query_count as number))) {
    throw new TypeError("GKX_EVAL_AGGREGATE_QUERY_FAILURE_COUNT_INVALID");
  }
  if (item.unverified_projection_rate_micros !== roundNonnegativeRatio(
    BigInt(item.unverified_projection_query_count as number),
    BigInt(item.query_count as number),
  )) throw new TypeError("GKX_EVAL_AGGREGATE_UNVERIFIED_PROJECTION_RATE_MISMATCH");
  if (item.stale_citation_query_rate_micros !== roundNonnegativeRatio(
    BigInt(item.stale_citation_query_count as number),
    BigInt(item.query_count as number),
  )) throw new TypeError("GKX_EVAL_AGGREGATE_STALE_CITATION_QUERY_RATE_MISMATCH");
  item.citation = sealCitationMetrics(item.citation);
  item.policy = sealPolicyMetrics(item.policy);
  const aggregateCitation = item.citation as RetrievalEvaluationCitationMetrics;
  if (aggregateCitation.checked === 0
    ? aggregateCitation.applicability !== "not_applicable" || aggregateCitation.correctness_micros !== null
    : aggregateCitation.applicability !== "required") {
    throw new TypeError("GKX_EVAL_AGGREGATE_CITATION_APPLICABILITY_RELATION_INVALID");
  }
  if ((item.stale_citation_query_count as number) > (item.citation as RetrievalEvaluationCitationMetrics).stale ||
      (((item.citation as RetrievalEvaluationCitationMetrics).stale === 0) !== (item.stale_citation_query_count === 0))) {
    throw new TypeError("GKX_EVAL_AGGREGATE_STALE_CITATION_QUERY_COUNT_MISMATCH");
  }
  assertDigest(item.aggregate_metrics_digest, "GKX_EVAL_AGGREGATE_DIGEST_INVALID");
  if (metricDigest(item, "aggregate_metrics_digest") !== item.aggregate_metrics_digest) throw new TypeError("GKX_EVAL_AGGREGATE_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationAggregateMetrics;
}

export function sealRetrievalEvaluationScenarioOutcome(value: unknown): RetrievalEvaluationScenarioOutcome {
  preflightScenarioOutcomeBounds(value);
  const item = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(item, [
    "contract_version", "scenario_id", "kind", "public_result_digest", "coverage", "confidence", "reason_code", "message",
    "ordered_hit_projections", "citation_applicability", "host_classification", "exit_code", "work_counters", "effects", "outcome_digest",
  ], "GKX_EVAL_SCENARIO_OUTCOME_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_SCENARIO_OUTCOME_VERSION || !isBoundedEvaluationId(item.scenario_id) ||
      !["result", "insufficient", "authorized_view_conflict", "operational_exclusion"].includes(item.kind as string)) {
    throw new TypeError("GKX_EVAL_SCENARIO_OUTCOME_COORDINATE_INVALID");
  }
  if (item.public_result_digest !== null) assertDigest(item.public_result_digest, "GKX_EVAL_SCENARIO_RESULT_DIGEST_INVALID");
  if (item.coverage !== null && !["not_requested", "not_evaluated", "sufficient", "insufficient"].includes(item.coverage as string)) {
    throw new TypeError("GKX_EVAL_SCENARIO_COVERAGE_INVALID");
  }
  if (item.citation_applicability !== "required" && item.citation_applicability !== "not_applicable") throw new TypeError("GKX_EVAL_SCENARIO_CITATION_APPLICABILITY_INVALID");
  if (item.confidence !== null && !CONFIDENCE.has(item.confidence as RetrievalEvaluationConfidence)) throw new TypeError("GKX_EVAL_SCENARIO_CONFIDENCE_INVALID");
  if (item.reason_code !== null && (typeof item.reason_code !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(item.reason_code)) ||
      item.message !== null && (typeof item.message !== "string" || item.message.length < 1 || item.message.length > 256 || /[\u0000-\u001f\u007f]/u.test(item.message)) ||
      item.host_classification !== null && item.host_classification !== "fixture_authority_failure" && item.host_classification !== "retrieval_authority_failure" ||
      item.exit_code !== 0 && item.exit_code !== 3 || !Array.isArray(item.ordered_hit_projections) || item.ordered_hit_projections.length > 100) {
    throw new TypeError("GKX_EVAL_SCENARIO_VALUE_INVALID");
  }
  const projections = sealExpectedTemporal({ coverage: "not_requested", hits: item.ordered_hit_projections }, null).hits;
  item.ordered_hit_projections = projections;
  const counters = item.work_counters as Record<string, unknown>;
  if (!counters || typeof counters !== "object" || Array.isArray(counters)) throw new TypeError("GKX_EVAL_SCENARIO_COUNTERS_INVALID");
  const counterFields = [
    "authority_input_snapshot_count", "source_read_count", "retrieval_sql_stage_count", "vector_provider_call_count", "vector_provider_item_count", "rerank_provider_call_count",
    "rerank_provider_item_count", "ranking_call_count", "confidence_call_count", "citation_verification_count", "metric_computation_count",
  ] as const;
  exactKeys(counters, counterFields, "GKX_EVAL_SCENARIO_COUNTER_FIELDS_INVALID");
  for (const field of counterFields) assertSafeCount(counters[field], `GKX_EVAL_SCENARIO_${field.toUpperCase()}_INVALID`);
  if ((counters.vector_provider_call_count === 0 && counters.vector_provider_item_count !== 0) ||
      (counters.rerank_provider_call_count === 0 && counters.rerank_provider_item_count !== 0)) {
    throw new TypeError("GKX_EVAL_SCENARIO_PROVIDER_COUNTER_RELATION_INVALID");
  }
  const effects = item.effects as Record<string, unknown>;
  if (!effects || typeof effects !== "object" || Array.isArray(effects)) throw new TypeError("GKX_EVAL_SCENARIO_EFFECTS_INVALID");
  exactKeys(effects, ["public_result_emitted", "output_artifact_written", "state_mutated"], "GKX_EVAL_SCENARIO_EFFECT_FIELDS_INVALID");
  if (typeof effects.public_result_emitted !== "boolean" || typeof effects.output_artifact_written !== "boolean" || typeof effects.state_mutated !== "boolean") {
    throw new TypeError("GKX_EVAL_SCENARIO_EFFECT_VALUE_INVALID");
  }
  const countersZero = counterFields.every((field) => counters[field] === 0);
  const downstreamCountersZero = counterFields.filter((field) => field !== "authority_input_snapshot_count").every((field) => counters[field] === 0);
  if (item.kind === "result") {
    const ordinary = (item.coverage === "not_requested" || item.coverage === "sufficient") &&
      (item.confidence === "high" || item.confidence === "medium" || item.confidence === "low") && projections.length > 0 &&
      item.citation_applicability === "required" && (counters.citation_verification_count as number) > 0 && (counters.metric_computation_count as number) > 0;
    const emptyAuthorized = item.coverage === "not_evaluated" && item.confidence === "insufficient" && projections.length === 0 &&
      item.citation_applicability === "not_applicable" && counters.citation_verification_count === 0;
    if (typeof item.public_result_digest !== "string" || counters.authority_input_snapshot_count !== 1 || item.reason_code !== null || item.message !== null || item.host_classification !== null ||
        item.exit_code !== 0 || effects.public_result_emitted !== true || effects.output_artifact_written !== false || effects.state_mutated !== false ||
        (!ordinary && !emptyAuthorized) ||
        (item.coverage === "sufficient" && projections.some((projection) => projection.valid_from === null || projection.temporal_state === "unknown"))) {
      throw new TypeError("GKX_EVAL_SCENARIO_RESULT_RELATION_INVALID");
    }
  } else if (item.kind === "insufficient") {
    if (typeof item.public_result_digest !== "string" || item.coverage !== "insufficient" || item.confidence !== "insufficient" ||
        item.reason_code !== "TEMPORAL_COVERAGE_INSUFFICIENT" || item.message !== null || projections.length !== 0 ||
        item.citation_applicability !== "not_applicable" || item.host_classification !== null || item.exit_code !== 0 ||
        counters.authority_input_snapshot_count !== 1 || !downstreamCountersZero ||
        effects.public_result_emitted !== true || effects.output_artifact_written !== false || effects.state_mutated !== false) {
      throw new TypeError("GKX_EVAL_SCENARIO_INSUFFICIENT_RELATION_INVALID");
    }
  } else if (item.kind === "authorized_view_conflict") {
    if (item.public_result_digest !== null || item.coverage !== null || item.confidence !== null || item.reason_code !== "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT" ||
        item.message !== "Authorized retrieval view conflict." || projections.length !== 0 || item.citation_applicability !== "not_applicable" ||
        item.host_classification !== null || item.exit_code !== 0 || counters.authority_input_snapshot_count !== 1 || !downstreamCountersZero || effects.public_result_emitted !== false ||
        effects.output_artifact_written !== false || effects.state_mutated !== false) throw new TypeError("GKX_EVAL_SCENARIO_CONFLICT_RELATION_INVALID");
  } else {
    if (item.public_result_digest !== null || item.coverage !== null || item.confidence !== null ||
        item.reason_code !== "GKX_RETRIEVAL_EVALUATION_OPERATIONAL_FAILURE" || item.message !== "Retrieval evaluation failed safely." ||
        projections.length !== 0 || item.citation_applicability !== "not_applicable" || item.host_classification === null || item.exit_code !== 3 ||
        !countersZero || effects.public_result_emitted !== false || effects.output_artifact_written !== false || effects.state_mutated !== false) {
      throw new TypeError("GKX_EVAL_SCENARIO_OPERATIONAL_RELATION_INVALID");
    }
  }
  assertDigest(item.outcome_digest, "GKX_EVAL_SCENARIO_OUTCOME_DIGEST_INVALID");
  if (metricDigest(item, "outcome_digest") !== item.outcome_digest) throw new TypeError("GKX_EVAL_SCENARIO_OUTCOME_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationScenarioOutcome;
}

export function compareRetrievalEvaluationScenarioOutcome(
  expectedValue: unknown,
  observedValue: unknown,
): RetrievalEvaluationScenarioComparison {
  const expected = sealRetrievalEvaluationScenarioOutcome(expectedValue);
  const observed = sealRetrievalEvaluationScenarioOutcome(observedValue);
  if (expected.scenario_id !== observed.scenario_id) throw new TypeError("GKX_EVAL_SCENARIO_COMPARISON_COORDINATE_INVALID");
  const status = expected.outcome_digest === observed.outcome_digest ? "pass" : "regression";
  const material: Omit<RetrievalEvaluationScenarioComparison, "scenario_comparison_digest"> = {
    contract_version: RETRIEVAL_EVALUATION_SCENARIO_COMPARISON_VERSION,
    status,
    reasons: status === "pass" ? [] : [
      ...(expected.kind === observed.kind ? [] : ["SCENARIO_KIND_MISMATCH"]),
      "SCENARIO_OUTCOME_MISMATCH",
    ],
    expected_outcome_digest: expected.outcome_digest,
    observed_outcome_digest: observed.outcome_digest,
  };
  return { ...material, scenario_comparison_digest: retrievalCanonicalDigest(material) };
}

export function sealRetrievalEvaluationObservationReport(value: unknown): RetrievalEvaluationObservationReport {
  preflightPlainEvaluationData(value, "GKX_EVAL_OBSERVATION_INVALID");
  const item = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(item, [
    "contract_version", "evaluation_digest", "fixed_sample_plan_digest", "environment", "warmup_count", "sample_count",
    "query_latency_micros", "index_time_micros", "update_time_micros", "chunks_reprocessed", "chunks_reused", "observation_digest",
  ], "GKX_EVAL_OBSERVATION_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_OBSERVATION_VERSION) throw new TypeError("GKX_EVAL_OBSERVATION_COORDINATE_INVALID");
  assertDigest(item.evaluation_digest, "GKX_EVAL_OBSERVATION_EVALUATION_DIGEST_INVALID");
  assertDigest(item.fixed_sample_plan_digest, "GKX_EVAL_OBSERVATION_SAMPLE_PLAN_DIGEST_INVALID");
  const environment = item.environment as Record<string, unknown>;
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) throw new TypeError("GKX_EVAL_OBSERVATION_ENVIRONMENT_INVALID");
  exactKeys(environment, ["runtime", "runtime_version", "os", "arch", "sqlite_version", "lexical_backend", "fts5_available", "runner_class"], "GKX_EVAL_OBSERVATION_ENVIRONMENT_FIELDS_INVALID");
  if (environment.runtime !== "node" || typeof environment.runtime_version !== "string" ||
      !/^[A-Za-z0-9._-]{1,32}$/u.test(environment.runtime_version) || !["linux", "windows", "darwin"].includes(environment.os as string) ||
      !["x64", "arm64"].includes(environment.arch as string) || typeof environment.sqlite_version !== "string" ||
      !/^[A-Za-z0-9._-]{1,32}$/u.test(environment.sqlite_version) || !["sqlite_fts5", "sqlite_lexical_scan"].includes(environment.lexical_backend as string) ||
      typeof environment.fts5_available !== "boolean" || !["github_hosted", "local"].includes(environment.runner_class as string) ||
      environment.lexical_backend === "sqlite_fts5" && environment.fts5_available !== true) throw new TypeError("GKX_EVAL_OBSERVATION_ENVIRONMENT_INVALID");
  assertSafeCount(item.warmup_count, "GKX_EVAL_OBSERVATION_WARMUP_COUNT_INVALID", 1_000_000);
  assertSafeCount(item.sample_count, "GKX_EVAL_OBSERVATION_SAMPLE_COUNT_INVALID", 1_000_000);
  if ((item.sample_count as number) < 1) throw new TypeError("GKX_EVAL_OBSERVATION_SAMPLE_COUNT_INVALID");
  const latency = item.query_latency_micros as Record<string, unknown>;
  if (!latency || typeof latency !== "object" || Array.isArray(latency)) throw new TypeError("GKX_EVAL_OBSERVATION_LATENCY_INVALID");
  exactKeys(latency, ["p50", "p95", "p99"], "GKX_EVAL_OBSERVATION_LATENCY_FIELDS_INVALID");
  for (const field of ["p50", "p95", "p99"] as const) assertSafeCount(latency[field], `GKX_EVAL_OBSERVATION_${field.toUpperCase()}_INVALID`);
  if ((latency.p50 as number) > (latency.p95 as number) || (latency.p95 as number) > (latency.p99 as number)) {
    throw new TypeError("GKX_EVAL_OBSERVATION_PERCENTILE_ORDER_INVALID");
  }
  for (const field of ["index_time_micros", "update_time_micros", "chunks_reprocessed", "chunks_reused"] as const) {
    assertSafeCount(item[field], `GKX_EVAL_OBSERVATION_${field.toUpperCase()}_INVALID`);
  }
  assertDigest(item.observation_digest, "GKX_EVAL_OBSERVATION_DIGEST_INVALID");
  if (metricDigest(item, "observation_digest") !== item.observation_digest) throw new TypeError("GKX_EVAL_OBSERVATION_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationObservationReport;
}

function zeroGateFailures(metrics: RetrievalEvaluationAggregateMetrics): string[] {
  const failures: string[] = [];
  if (metrics.policy.policy_leak_count !== 0) failures.push("POLICY_LEAK");
  if (metrics.citation.mismatch !== 0) failures.push("CITATION_MISMATCH");
  if (metrics.citation.stale !== 0) failures.push("STALE_CITATION");
  if (metrics.citation.applicability === "required" && (metrics.citation.checked === 0 ||
      metrics.citation.correctness_micros !== RETRIEVAL_EVALUATION_METRIC_SCALE)) failures.push("CITATION_COVERAGE");
  if (metrics.confidence_mismatch_count !== 0) failures.push("CONFIDENCE_MISMATCH");
  if (metrics.temporal_mismatch_count !== 0) failures.push("TEMPORAL_MISMATCH");
  if (metrics.stale_projection_query_count !== 0) failures.push("STALE_PROJECTION");
  if (metrics.unverified_projection_query_count !== 0) failures.push("UNVERIFIED_PROJECTION");
  return failures;
}

function querySetZeroGateFailures(queries: readonly RetrievalEvaluationQueryMetrics[]): string[] {
  return queries.some((query) => query.returned_unique_source_count === 0
    ? query.citation.applicability !== "not_applicable" || query.citation.checked !== 0 || query.citation.correctness_micros !== null
    : query.citation.applicability !== "required" || query.citation.checked === 0 ||
      query.citation.correctness_micros !== RETRIEVAL_EVALUATION_METRIC_SCALE) ? ["CITATION_COVERAGE"] : [];
}

function metricsSetZeroGateFailures(metricsSet: RetrievalEvaluationMetricsSet): string[] {
  return [...new Set([
    ...zeroGateFailures(metricsSet.aggregate_metrics),
    ...metricsSet.environment_aggregates.flatMap((entry) => zeroGateFailures(entry.aggregate_metrics)),
    ...querySetZeroGateFailures(metricsSet.query_evaluations.map((entry) => entry.query_metrics)),
  ])];
}

function preflightComparisonBounds(input: unknown): void {
  preflightEnvironmentSetBounds(recordDataValue(input, "current_environment_set", "GKX_EVAL_COMPARISON_INPUT_INVALID"));
  preflightMetricsSetBounds(recordDataValue(input, "current_metrics_set", "GKX_EVAL_COMPARISON_INPUT_INVALID"));
  preflightNormalizedGoldenBounds(recordDataValue(input, "current_golden", "GKX_EVAL_COMPARISON_INPUT_INVALID"));
  preflightBaselineBounds(recordDataValue(input, "baseline", "GKX_EVAL_COMPARISON_INPUT_INVALID"));
  preflightPlainEvaluationData(input, "GKX_EVAL_COMPARISON_INPUT_INVALID");
}

function sealRelativeNdcgBudget(value: unknown): RetrievalEvaluationRelativeNdcgBudget {
  preflightPlainEvaluationData(value, "GKX_EVAL_RELATIVE_NDCG_BUDGET_INVALID");
  const budget = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(budget, ["numerator", "denominator"], "GKX_EVAL_RELATIVE_NDCG_BUDGET_FIELDS_INVALID");
  assertSafeCount(budget.numerator, "GKX_EVAL_RELATIVE_NDCG_BUDGET_NUMERATOR_INVALID", 1_000_000);
  assertSafeCount(budget.denominator, "GKX_EVAL_RELATIVE_NDCG_BUDGET_DENOMINATOR_INVALID", 1_000_000);
  if ((budget.denominator as number) < 1 || (budget.numerator as number) > (budget.denominator as number)) {
    throw new TypeError("GKX_EVAL_RELATIVE_NDCG_BUDGET_RELATION_INVALID");
  }
  return budget as unknown as RetrievalEvaluationRelativeNdcgBudget;
}

function defaultRelativeNdcgBudget(value: RetrievalEvaluationRelativeNdcgBudget): boolean {
  return value.numerator === 2 && value.denominator === 100;
}

function evaluationCoordinateMaterial(input: {
  environment_set_digest: string;
  normalized_golden_digest: string;
  base_configuration_digest: string;
  tuning_grid_digest: string;
  tuning_axes_digest: string;
  candidate_config_digest: string;
  query_metrics_set_digest: string;
  aggregate_metrics_digest: string;
  metrics_set_digest: string;
  relative_ndcg_budget: RetrievalEvaluationRelativeNdcgBudget;
  query_count: number;
  maximum_expected_top_k: number;
}): Record<string, unknown> {
  return {
    contract_version: RETRIEVAL_EVALUATION_EVALUATION_COORDINATE_VERSION,
    environment_set_digest: input.environment_set_digest,
    normalized_golden_digest: input.normalized_golden_digest,
    base_configuration_digest: input.base_configuration_digest,
    tuning_grid_digest: input.tuning_grid_digest,
    tuning_axes_digest: input.tuning_axes_digest,
    candidate_config_digest: input.candidate_config_digest,
    query_metrics_set_digest: input.query_metrics_set_digest,
    aggregate_metrics_digest: input.aggregate_metrics_digest,
    metrics_set_digest: input.metrics_set_digest,
    relative_ndcg_budget: input.relative_ndcg_budget,
    metric_contract_version: RETRIEVAL_EVALUATION_METRIC_VERSION,
    ndcg_discount_table_digest: RETRIEVAL_EVALUATION_NDCG_TABLE.table_digest,
    metric_scale: RETRIEVAL_EVALUATION_METRIC_SCALE,
    query_count: input.query_count,
    maximum_expected_top_k: input.maximum_expected_top_k,
  };
}

function evaluationCoordinateDigest(input: Parameters<typeof evaluationCoordinateMaterial>[0]): string {
  return retrievalCanonicalDigest(evaluationCoordinateMaterial(input));
}

function preflightBaselineBounds(value: unknown): void {
  preflightNormalizedGoldenBounds(recordDataValue(value, "normalized_golden", "GKX_EVAL_BASELINE_INVALID"));
  preflightEnvironmentSetBounds(recordDataValue(value, "environment_set", "GKX_EVAL_BASELINE_INVALID"));
  preflightMetricsSetBounds(recordDataValue(value, "metrics_set", "GKX_EVAL_BASELINE_INVALID"));
  preflightPlainEvaluationData(value, "GKX_EVAL_BASELINE_INVALID");
}

export function sealRetrievalEvaluationBaseline(value: unknown): RetrievalEvaluationBaseline {
  preflightBaselineBounds(value);
  const item = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(item, [
    "contract_version", "environment_set", "normalized_golden", "base_configuration", "tuning_grid", "selected_axes",
    "candidate_config_digest", "metrics_set", "relative_ndcg_budget", "metric_contract_version", "ndcg_discount_table_digest",
    "metric_scale", "query_count", "maximum_expected_top_k", "normalized_golden_digest", "environment_set_digest",
    "base_configuration_digest", "tuning_grid_digest", "tuning_axes_digest", "query_metrics_set_digest",
    "aggregate_metrics_digest", "metrics_set_digest", "baseline_evaluation_digest", "baseline_digest",
  ], "GKX_EVAL_BASELINE_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_BASELINE_VERSION ||
      item.metric_contract_version !== RETRIEVAL_EVALUATION_METRIC_VERSION ||
      item.ndcg_discount_table_digest !== RETRIEVAL_EVALUATION_NDCG_TABLE.table_digest ||
      item.metric_scale !== RETRIEVAL_EVALUATION_METRIC_SCALE) throw new TypeError("GKX_EVAL_BASELINE_COORDINATE_INVALID");
  const golden = sealNormalizedRetrievalEvaluationGolden(item.normalized_golden);
  const environmentSet = sealRetrievalEvaluationEnvironmentSet(item.environment_set, golden);
  const baseConfiguration = sealRetrievalEvaluationBaseConfigurationCoordinate(item.base_configuration);
  const tuningGrid = sealRetrievalEvaluationTuningGridCoordinate(item.tuning_grid);
  const selectedAxes = sealRetrievalEvaluationTuningAxesCoordinate(item.selected_axes);
  const metricsSet = sealRetrievalEvaluationMetricsSet(item.metrics_set, environmentSet, golden);
  const budget = sealRelativeNdcgBudget(item.relative_ndcg_budget);
  const queryCount = golden.queries.length;
  const maximumExpectedTopK = Math.max(...golden.queries.map((query) => query.expected_top_k));
  const candidateConfigDigest = retrievalCanonicalDigest({
    base_configuration_digest: baseConfiguration.base_configuration_digest,
    candidate_config: candidateConfigMaterial(selectedAxes),
  });
  assertDigest(item.candidate_config_digest, "GKX_EVAL_BASELINE_CANDIDATE_CONFIG_DIGEST_INVALID");
  if (item.candidate_config_digest !== candidateConfigDigest) throw new TypeError("GKX_EVAL_BASELINE_CANDIDATE_CONFIG_DIGEST_MISMATCH");
  const repeated = {
    query_count: queryCount,
    maximum_expected_top_k: maximumExpectedTopK,
    normalized_golden_digest: golden.golden_digest,
    environment_set_digest: environmentSet.environment_set_digest,
    base_configuration_digest: baseConfiguration.base_configuration_digest,
    tuning_grid_digest: tuningGrid.tuning_grid_digest,
    tuning_axes_digest: selectedAxes.tuning_axes_digest,
    query_metrics_set_digest: metricsSet.query_metrics_set_digest,
    aggregate_metrics_digest: metricsSet.aggregate_metrics.aggregate_metrics_digest,
    metrics_set_digest: metricsSet.metrics_set_digest,
  } as const;
  for (const [field, expected] of Object.entries(repeated)) {
    if (item[field] !== expected) throw new TypeError("GKX_EVAL_BASELINE_REPEATED_COORDINATE_MISMATCH");
  }
  const expectedEvaluationDigest = evaluationCoordinateDigest({
    environment_set_digest: environmentSet.environment_set_digest,
    normalized_golden_digest: golden.golden_digest,
    base_configuration_digest: baseConfiguration.base_configuration_digest,
    tuning_grid_digest: tuningGrid.tuning_grid_digest,
    tuning_axes_digest: selectedAxes.tuning_axes_digest,
    candidate_config_digest: candidateConfigDigest,
    query_metrics_set_digest: metricsSet.query_metrics_set_digest,
    aggregate_metrics_digest: metricsSet.aggregate_metrics.aggregate_metrics_digest,
    metrics_set_digest: metricsSet.metrics_set_digest,
    relative_ndcg_budget: budget,
    query_count: queryCount,
    maximum_expected_top_k: maximumExpectedTopK,
  });
  assertDigest(item.baseline_evaluation_digest, "GKX_EVAL_BASELINE_EVALUATION_DIGEST_INVALID");
  if (item.baseline_evaluation_digest !== expectedEvaluationDigest) throw new TypeError("GKX_EVAL_BASELINE_EVALUATION_DIGEST_MISMATCH");
  item.environment_set = environmentSet;
  item.normalized_golden = golden;
  item.base_configuration = baseConfiguration;
  item.tuning_grid = tuningGrid;
  item.selected_axes = selectedAxes;
  item.metrics_set = metricsSet;
  item.relative_ndcg_budget = budget;
  assertDigest(item.baseline_digest, "GKX_EVAL_BASELINE_DIGEST_INVALID");
  if (metricDigest(item, "baseline_digest") !== item.baseline_digest) throw new TypeError("GKX_EVAL_BASELINE_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationBaseline;
}

export function compareRetrievalEvaluationBaseline(input: RetrievalEvaluationComparisonInput): RetrievalEvaluationComparison {
  preflightComparisonBounds(input);
  const inputRecord = inertClone(input) as unknown as Record<string, unknown>;
  exactKeys(inputRecord, [
    "current_environment_set", "current_base_configuration", "current_tuning_grid", "current_tuning_axes", "current_golden",
    "current_metrics_set", "current_relative_ndcg_budget", "baseline",
  ], "GKX_EVAL_COMPARISON_INPUT_FIELDS_INVALID");
  const inert = inputRecord as unknown as RetrievalEvaluationComparisonInput;
  const baselineEnvelope = sealRetrievalEvaluationBaseline(inert.baseline);
  const currentBase = sealRetrievalEvaluationBaseConfigurationCoordinate(inert.current_base_configuration);
  const currentGrid = sealRetrievalEvaluationTuningGridCoordinate(inert.current_tuning_grid);
  const currentAxes = sealRetrievalEvaluationTuningAxesCoordinate(inert.current_tuning_axes);
  const currentGolden = sealNormalizedRetrievalEvaluationGolden(inert.current_golden);
  const currentEnvironmentSet = sealRetrievalEvaluationEnvironmentSet(inert.current_environment_set, currentGolden);
  const currentMetricsSet = sealRetrievalEvaluationMetricsSet(inert.current_metrics_set, currentEnvironmentSet, currentGolden);
  const currentBudget = sealRelativeNdcgBudget(inert.current_relative_ndcg_budget);
  const current = currentMetricsSet.aggregate_metrics;
  const baseline = baselineEnvelope.metrics_set.aggregate_metrics;
  const baselineFailures = metricsSetZeroGateFailures(baselineEnvelope.metrics_set);
  const currentMaximumExpectedTopK = Math.max(...currentGolden.queries.map((query) => query.expected_top_k));
  const coordinateChanged = currentEnvironmentSet.environment_set_digest !== baselineEnvelope.environment_set_digest ||
    currentBase.base_configuration_digest !== baselineEnvelope.base_configuration_digest ||
    currentGrid.tuning_grid_digest !== baselineEnvelope.tuning_grid_digest ||
    currentAxes.tuning_axes_digest !== baselineEnvelope.tuning_axes_digest ||
    currentGolden.golden_digest !== baselineEnvelope.normalized_golden_digest ||
    current.query_count !== baselineEnvelope.query_count || currentMaximumExpectedTopK !== baselineEnvelope.maximum_expected_top_k ||
    !defaultRelativeNdcgBudget(currentBudget) || !defaultRelativeNdcgBudget(baselineEnvelope.relative_ndcg_budget);
  const human = coordinateChanged || baselineFailures.length > 0;
  const reasons = human ? [
    ...(baselineFailures.length ? ["BASELINE_ZERO_GATE_INVALID"] : []),
    ...(current.query_count !== baselineEnvelope.query_count ? ["QUERY_COUNT_CHANGED"] : []),
    ...(coordinateChanged ? ["COMPARABILITY_COORDINATE_CHANGED"] : []),
  ] : [
    ...metricsSetZeroGateFailures(currentMetricsSet),
    ...(BigInt(current.ndcg_at_k_micros) * BigInt(currentBudget.denominator) <
      BigInt(baseline.ndcg_at_k_micros) * BigInt(currentBudget.denominator - currentBudget.numerator) ? ["NDCG_RELATIVE_REGRESSION"] : []),
  ];
  const currentCandidateConfigDigest = retrievalCanonicalDigest({
    base_configuration_digest: currentBase.base_configuration_digest,
    candidate_config: candidateConfigMaterial(currentAxes),
  });
  const currentEvaluationDigest = evaluationCoordinateDigest({
    environment_set_digest: currentEnvironmentSet.environment_set_digest,
    normalized_golden_digest: currentGolden.golden_digest,
    base_configuration_digest: currentBase.base_configuration_digest,
    tuning_grid_digest: currentGrid.tuning_grid_digest,
    tuning_axes_digest: currentAxes.tuning_axes_digest,
    candidate_config_digest: currentCandidateConfigDigest,
    query_metrics_set_digest: currentMetricsSet.query_metrics_set_digest,
    aggregate_metrics_digest: current.aggregate_metrics_digest,
    metrics_set_digest: currentMetricsSet.metrics_set_digest,
    relative_ndcg_budget: currentBudget,
    query_count: currentGolden.queries.length,
    maximum_expected_top_k: currentMaximumExpectedTopK,
  });
  const status: RetrievalEvaluationComparison["status"] = human ? "needs_human" : reasons.length ? "regression" : "pass";
  const material: Omit<RetrievalEvaluationComparison, "comparison_digest"> = {
    contract_version: RETRIEVAL_EVALUATION_COMPARISON_VERSION,
    status,
    reasons: reasons.sort(retrievalCodeUnitCompare),
    baseline_ndcg_at_k_micros: baseline.ndcg_at_k_micros,
    current_ndcg_at_k_micros: current.ndcg_at_k_micros,
    baseline_evaluation_digest: baselineEnvelope.baseline_evaluation_digest,
    current_evaluation_digest: currentEvaluationDigest,
  };
  return { ...material, comparison_digest: retrievalCanonicalDigest(material) };
}

function sealAxesMaterial(value: unknown): RetrievalEvaluationTuningAxes {
  const axes = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(axes, ["rrf_k", "mmr", "mmr_lambda_micros", "semantic_top_k", "lexical_top_k"], "GKX_EVAL_TUNING_AXES_FIELDS_INVALID");
  if (!RETRIEVAL_EVALUATION_TUNING_GRID.rrf_k.includes(axes.rrf_k as never) || typeof axes.mmr !== "boolean" ||
      !RETRIEVAL_EVALUATION_TUNING_GRID.semantic_top_k.includes(axes.semantic_top_k as never) ||
      !RETRIEVAL_EVALUATION_TUNING_GRID.lexical_top_k.includes(axes.lexical_top_k as never)) throw new TypeError("GKX_EVAL_TUNING_AXES_INVALID");
  const mmrMatch = RETRIEVAL_EVALUATION_TUNING_GRID.mmr.some((item) => item.enabled === axes.mmr && item.lambda_micros === axes.mmr_lambda_micros);
  if (!mmrMatch) throw new TypeError("GKX_EVAL_TUNING_MMR_INVALID");
  return axes as unknown as RetrievalEvaluationTuningAxes;
}

export function sealRetrievalEvaluationTuningAxesCoordinate(value: unknown): RetrievalEvaluationTuningAxesCoordinate {
  preflightPlainEvaluationData(value, "GKX_EVAL_TUNING_AXES_INVALID");
  const coordinate = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(coordinate, [
    "contract_version", "rrf_k", "mmr", "mmr_lambda_micros", "semantic_top_k", "lexical_top_k", "tuning_axes_digest",
  ], "GKX_EVAL_TUNING_AXES_COORDINATE_FIELDS_INVALID");
  if (coordinate.contract_version !== RETRIEVAL_EVALUATION_TUNING_AXES_VERSION) throw new TypeError("GKX_EVAL_TUNING_AXES_COORDINATE_INVALID");
  const { contract_version, tuning_axes_digest, ...rawAxes } = coordinate;
  const axes = sealAxesMaterial(rawAxes);
  assertDigest(tuning_axes_digest, "GKX_EVAL_TUNING_AXES_DIGEST_INVALID");
  const material = { contract_version, ...axes };
  if (retrievalCanonicalDigest(material) !== tuning_axes_digest) throw new TypeError("GKX_EVAL_TUNING_AXES_DIGEST_MISMATCH");
  return { ...material, tuning_axes_digest } as RetrievalEvaluationTuningAxesCoordinate;
}

function axesMaterial(axes: RetrievalEvaluationTuningAxes): RetrievalEvaluationTuningAxes {
  return {
    rrf_k: axes.rrf_k,
    mmr: axes.mmr,
    mmr_lambda_micros: axes.mmr_lambda_micros,
    semantic_top_k: axes.semantic_top_k,
    lexical_top_k: axes.lexical_top_k,
  };
}

/** Exact canonical candidate JSON used by the final deterministic tie-break. */
export function retrievalEvaluationCandidateConfigMaterial(axesValue: unknown): {
  config_version: 1;
  retrieval: { rrf_k: number; mmr: boolean; semantic_top_k: number; lexical_top_k: number; mmr_lambda?: number };
} {
  preflightPlainEvaluationData(axesValue, "GKX_EVAL_TUNING_AXES_INVALID");
  const axes = axesValue !== null && typeof axesValue === "object" && !Array.isArray(axesValue) && Object.hasOwn(axesValue, "contract_version")
    ? sealRetrievalEvaluationTuningAxesCoordinate(axesValue)
    : sealAxesMaterial(axesValue);
  return {
    config_version: 1,
    retrieval: {
      rrf_k: axes.rrf_k,
      mmr: axes.mmr,
      ...(axes.mmr ? { mmr_lambda: axes.mmr_lambda_micros! / RETRIEVAL_EVALUATION_METRIC_SCALE } : {}),
      semantic_top_k: axes.semantic_top_k,
      lexical_top_k: axes.lexical_top_k,
    },
  };
}

function candidateConfigMaterial(axes: RetrievalEvaluationTuningAxes): ReturnType<typeof retrievalEvaluationCandidateConfigMaterial> {
  return {
    config_version: 1,
    retrieval: {
      rrf_k: axes.rrf_k,
      mmr: axes.mmr,
      ...(axes.mmr ? { mmr_lambda: axes.mmr_lambda_micros! / RETRIEVAL_EVALUATION_METRIC_SCALE } : {}),
      semantic_top_k: axes.semantic_top_k,
      lexical_top_k: axes.lexical_top_k,
    },
  };
}

export function sealRetrievalEvaluationTuningGridCoordinate(value: unknown): RetrievalEvaluationTuningGridCoordinate {
  preflightPlainEvaluationData(value, "GKX_EVAL_TUNING_GRID_INVALID");
  const coordinate = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(coordinate, [
    "contract_version", "rrf_k", "mmr", "semantic_top_k", "lexical_top_k", "candidate_count", "tuning_grid_digest",
  ], "GKX_EVAL_TUNING_GRID_FIELDS_INVALID");
  for (const field of ["rrf_k", "mmr", "semantic_top_k", "lexical_top_k"] as const) {
    boundedDenseDataArray(coordinate[field], field === "mmr" ? 6 : 6, "GKX_EVAL_TUNING_GRID_ARRAY_INVALID");
  }
  const expectedMaterial = inertClone(TUNING_GRID_COORDINATE_MATERIAL) as unknown as Omit<RetrievalEvaluationTuningGridCoordinate, "tuning_grid_digest">;
  assertDigest(coordinate.tuning_grid_digest, "GKX_EVAL_TUNING_GRID_DIGEST_INVALID");
  const { tuning_grid_digest: _digest, ...material } = coordinate;
  if (stableJson(material) !== stableJson(expectedMaterial) || coordinate.tuning_grid_digest !== retrievalCanonicalDigest(expectedMaterial)) {
    throw new TypeError("GKX_EVAL_TUNING_GRID_MISMATCH");
  }
  return { ...expectedMaterial, tuning_grid_digest: coordinate.tuning_grid_digest as string };
}

function sealEvaluationProviderRole(value: unknown, family: "embedding" | "reranker"): RetrievalEvaluationEmbeddingRole | RetrievalEvaluationRerankerRole {
  const role = inertClone(value) as unknown as Record<string, unknown>;
  const fields = family === "embedding"
    ? ["state", "provider_scenario_id", "provider_kind", "provider_id", "model_id", "dimensions", "fixed_provider_transcript_digest"]
    : ["state", "provider_scenario_id", "provider_kind", "provider_id", "model_id", "fixed_provider_transcript_digest"];
  exactKeys(role, fields, `GKX_EVAL_${family.toUpperCase()}_ROLE_FIELDS_INVALID`);
  if (role.state === "disabled") {
    if (role.provider_scenario_id !== "disabled" || role.provider_kind !== null || role.provider_id !== null || role.model_id !== null ||
        role.fixed_provider_transcript_digest !== null || family === "embedding" && role.dimensions !== null) {
      throw new TypeError(`GKX_EVAL_${family.toUpperCase()}_ROLE_DISABLED_INVALID`);
    }
  } else if (role.state === "active") {
    if (!isBoundedEvaluationId(role.provider_scenario_id) || role.provider_scenario_id === "disabled") {
      throw new TypeError(`GKX_EVAL_${family.toUpperCase()}_ROLE_SCENARIO_INVALID`);
    }
    if (!["openai_compatible", "local_onnx", "mcp"].includes(role.provider_kind as string)) {
      throw new TypeError(`GKX_EVAL_${family.toUpperCase()}_ROLE_KIND_INVALID`);
    }
    for (const field of ["provider_id", "model_id"] as const) {
      const identity = role[field];
      if (!isValidRetrievalEvaluationOpaqueIdentity(identity)) {
        throw new TypeError(`GKX_EVAL_${family.toUpperCase()}_ROLE_IDENTITY_INVALID`);
      }
    }
    assertDigest(role.fixed_provider_transcript_digest, `GKX_EVAL_${family.toUpperCase()}_ROLE_TRANSCRIPT_DIGEST_INVALID`);
    if (family === "embedding") {
      assertSafeCount(role.dimensions, "GKX_EVAL_EMBEDDING_ROLE_DIMENSIONS_INVALID", 4_096);
      if ((role.dimensions as number) < 1) throw new TypeError("GKX_EVAL_EMBEDDING_ROLE_DIMENSIONS_INVALID");
    }
  } else throw new TypeError(`GKX_EVAL_${family.toUpperCase()}_ROLE_STATE_INVALID`);
  return role as unknown as RetrievalEvaluationEmbeddingRole | RetrievalEvaluationRerankerRole;
}

export function sealRetrievalEvaluationEnvironmentCoordinate(value: unknown): RetrievalEvaluationEnvironmentCoordinate {
  preflightPlainEvaluationData(value, "GKX_EVAL_ENVIRONMENT_INVALID");
  const item = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(item, [
    "contract_version", "scenario_id", "vault_fixture", "retrieval_contract_version", "evaluation_contract_version",
    "golden_contract_version", "metric_contract_version", "engine_version", "gkx_standard_commit", "gkx_projection_profile",
    "projection_schema_version", "chunker_version", "tokenizer_version", "lexical_backend", "normalized_golden_digest",
    "fixture_catalog_digest", "corpus_fixture_digest", "source_snapshot_digest", "runtime_policy_inputs_digest",
    "evaluation_audit_oracle_digest", "projection_id", "projection_digest", "embedding_role", "reranker_role",
    "ndcg_discount_table_digest", "metric_scale", "environment_digest",
  ], "GKX_EVAL_ENVIRONMENT_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_ENVIRONMENT_VERSION ||
      item.retrieval_contract_version !== RETRIEVAL_LINEAGE_CONTRACT_VERSION ||
      item.evaluation_contract_version !== RETRIEVAL_EVALUATION_CONTRACT_VERSION ||
      item.golden_contract_version !== RETRIEVAL_EVALUATION_GOLDEN_VERSION ||
      item.metric_contract_version !== RETRIEVAL_EVALUATION_METRIC_VERSION || item.engine_version !== ENGINE_VERSION ||
      item.gkx_standard_commit !== RETRIEVAL_GKX_STANDARD_COMMIT || item.gkx_projection_profile !== RETRIEVAL_GKX_PROJECTION_PROFILE ||
      item.projection_schema_version !== RETRIEVAL_LINEAGE_PROJECTION_SCHEMA_VERSION || item.chunker_version !== RETRIEVAL_CHUNKER_VERSION ||
      item.tokenizer_version !== RETRIEVAL_TOKENIZER_VERSION || item.ndcg_discount_table_digest !== RETRIEVAL_EVALUATION_NDCG_TABLE.table_digest ||
      item.metric_scale !== RETRIEVAL_EVALUATION_METRIC_SCALE || !["sqlite_fts5", "sqlite_lexical_scan"].includes(item.lexical_backend as string) ||
      !isBoundedEvaluationId(item.vault_fixture)) throw new TypeError("GKX_EVAL_ENVIRONMENT_COORDINATE_INVALID");
  for (const field of [
    "normalized_golden_digest", "fixture_catalog_digest", "corpus_fixture_digest", "source_snapshot_digest", "runtime_policy_inputs_digest",
    "evaluation_audit_oracle_digest", "projection_digest", "environment_digest",
  ] as const) assertDigest(item[field], `GKX_EVAL_ENVIRONMENT_${field.toUpperCase()}_INVALID`);
  if (item.projection_id !== `retrieval:${(item.projection_digest as string).slice("sha256:".length, "sha256:".length + 24)}`) {
    throw new TypeError("GKX_EVAL_ENVIRONMENT_PROJECTION_BINDING_INVALID");
  }
  const embeddingRole = sealEvaluationProviderRole(item.embedding_role, "embedding") as RetrievalEvaluationEmbeddingRole;
  const rerankerRole = sealEvaluationProviderRole(item.reranker_role, "reranker") as RetrievalEvaluationRerankerRole;
  const backend = item.lexical_backend === "sqlite_fts5" ? "sqlite-fts5" : "sqlite-lexical-scan";
  const expectedScenario = `${item.vault_fixture}--${backend}--vector-${embeddingRole.provider_scenario_id}--reranker-${rerankerRole.provider_scenario_id}`;
  if (!isBoundedEnvironmentScenarioId(item.scenario_id) || item.scenario_id !== expectedScenario) throw new TypeError("GKX_EVAL_ENVIRONMENT_SCENARIO_INVALID");
  item.embedding_role = embeddingRole;
  item.reranker_role = rerankerRole;
  if (metricDigest(item, "environment_digest") !== item.environment_digest) throw new TypeError("GKX_EVAL_ENVIRONMENT_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationEnvironmentCoordinate;
}

function preflightEnvironmentSetBounds(value: unknown): void {
  const members = boundedDenseDataArray(recordDataValue(value, "members", "GKX_EVAL_ENVIRONMENT_SET_INVALID"), 256,
    "GKX_EVAL_ENVIRONMENT_SET_MEMBERS_INVALID");
  if (members.length < 1) throw new TypeError("GKX_EVAL_ENVIRONMENT_SET_MEMBERS_INVALID");
  for (const member of members) {
    const partition = boundedDenseDataArray(recordDataValue(member, "query_partition", "GKX_EVAL_ENVIRONMENT_SET_MEMBER_INVALID"), 256,
      "GKX_EVAL_ENVIRONMENT_SET_QUERY_PARTITION_INVALID");
    if (partition.length < 1) throw new TypeError("GKX_EVAL_ENVIRONMENT_SET_QUERY_PARTITION_INVALID");
  }
  preflightPlainEvaluationData(value, "GKX_EVAL_ENVIRONMENT_SET_INVALID");
}

export function sealRetrievalEvaluationEnvironmentSet(
  value: unknown,
  goldenValue: unknown,
): RetrievalEvaluationEnvironmentSet {
  preflightEnvironmentSetBounds(value);
  preflightNormalizedGoldenBounds(goldenValue);
  const golden = sealNormalizedRetrievalEvaluationGolden(goldenValue);
  const item = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(item, ["contract_version", "normalized_golden_digest", "query_count", "members", "environment_set_digest"],
    "GKX_EVAL_ENVIRONMENT_SET_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_ENVIRONMENT_SET_VERSION || item.normalized_golden_digest !== golden.golden_digest ||
      item.query_count !== golden.queries.length || !Array.isArray(item.members) || item.members.length < 1 || item.members.length > 256) {
    throw new TypeError("GKX_EVAL_ENVIRONMENT_SET_COORDINATE_INVALID");
  }
  const queryById = new Map(golden.queries.map((query) => [query.id, query]));
  const seenQueries = new Set<string>();
  const members = (item.members as unknown[]).map((raw) => {
    const member = raw as Record<string, unknown>;
    exactKeys(member, ["environment", "query_partition", "query_count", "member_digest"], "GKX_EVAL_ENVIRONMENT_SET_MEMBER_FIELDS_INVALID");
    const environment = sealRetrievalEvaluationEnvironmentCoordinate(member.environment);
    if (environment.normalized_golden_digest !== golden.golden_digest || !Array.isArray(member.query_partition) || member.query_partition.length < 1 ||
        member.query_partition.length > 256 || member.query_count !== member.query_partition.length) {
      throw new TypeError("GKX_EVAL_ENVIRONMENT_SET_MEMBER_COORDINATE_INVALID");
    }
    const partition = (member.query_partition as unknown[]).map((rawRow) => {
      const row = rawRow as Record<string, unknown>;
      exactKeys(row, ["query_id", "query_digest"], "GKX_EVAL_ENVIRONMENT_SET_QUERY_FIELDS_INVALID");
      const query = typeof row.query_id === "string" ? queryById.get(row.query_id) : undefined;
      if (!query || row.query_digest !== query.query_digest || query.vault_fixture !== environment.vault_fixture || seenQueries.has(query.id)) {
        throw new TypeError("GKX_EVAL_ENVIRONMENT_SET_QUERY_BINDING_INVALID");
      }
      seenQueries.add(query.id);
      return { query_id: query.id, query_digest: query.query_digest };
    });
    const expectedPartition = golden.queries.filter((query) => query.vault_fixture === environment.vault_fixture)
      .map((query) => ({ query_id: query.id, query_digest: query.query_digest }));
    if (stableJson(partition) !== stableJson(expectedPartition)) throw new TypeError("GKX_EVAL_ENVIRONMENT_SET_QUERY_ORDER_INVALID");
    member.environment = environment;
    member.query_partition = partition;
    assertDigest(member.member_digest, "GKX_EVAL_ENVIRONMENT_SET_MEMBER_DIGEST_INVALID");
    if (metricDigest(member, "member_digest") !== member.member_digest) throw new TypeError("GKX_EVAL_ENVIRONMENT_SET_MEMBER_DIGEST_MISMATCH");
    return member as unknown as RetrievalEvaluationEnvironmentSetMember;
  });
  const environmentDigests = members.map((member) => member.environment.environment_digest);
  if (new Set(environmentDigests).size !== members.length || new Set(members.map((member) => member.environment.scenario_id)).size !== members.length ||
      new Set(members.map((member) => member.environment.vault_fixture)).size !== members.length ||
      stableJson(environmentDigests) !== stableJson([...environmentDigests].sort(retrievalCodeUnitCompare)) ||
      seenQueries.size !== golden.queries.length) {
    throw new TypeError("GKX_EVAL_ENVIRONMENT_SET_PARTITION_INVALID");
  }
  item.members = members;
  assertDigest(item.environment_set_digest, "GKX_EVAL_ENVIRONMENT_SET_DIGEST_INVALID");
  if (metricDigest(item, "environment_set_digest") !== item.environment_set_digest) throw new TypeError("GKX_EVAL_ENVIRONMENT_SET_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationEnvironmentSet;
}

function preflightMetricsSetBounds(value: unknown): void {
  const evaluations = boundedDenseDataArray(recordDataValue(value, "query_evaluations", "GKX_EVAL_METRICS_SET_INVALID"), 256,
    "GKX_EVAL_METRICS_SET_QUERY_EVALUATIONS_INVALID");
  const aggregates = boundedDenseDataArray(recordDataValue(value, "environment_aggregates", "GKX_EVAL_METRICS_SET_INVALID"), 256,
    "GKX_EVAL_METRICS_SET_ENVIRONMENT_AGGREGATES_INVALID");
  if (evaluations.length < 1 || aggregates.length < 1) throw new TypeError("GKX_EVAL_METRICS_SET_COUNT_INVALID");
  for (const row of evaluations) preflightQueryMetricsBounds(recordDataValue(row, "query_metrics", "GKX_EVAL_METRICS_SET_QUERY_INVALID"));
  preflightPlainEvaluationData(value, "GKX_EVAL_METRICS_SET_INVALID");
}

function globalQueryMetricsSetDigest(
  environmentSetDigest: string,
  rows: readonly RetrievalEvaluationMetricsSetQueryEvaluation[],
): string {
  return retrievalCanonicalDigest({
    contract_version: RETRIEVAL_EVALUATION_QUERY_METRICS_SET_VERSION,
    environment_set_digest: environmentSetDigest,
    query_count: rows.length,
    query_evaluations: rows.map((row) => ({
      environment_digest: row.environment_digest,
      golden_query_digest: row.golden_query_digest,
      query_metrics_digest: row.query_metrics.query_metrics_digest,
    })),
  });
}

function scopedQueryMetricsSetDigest(
  environmentDigest: string,
  rows: readonly RetrievalEvaluationMetricsSetQueryEvaluation[],
): string {
  return retrievalCanonicalDigest({
    contract_version: RETRIEVAL_EVALUATION_QUERY_METRICS_SET_VERSION,
    environment_digest: environmentDigest,
    query_count: rows.length,
    query_evaluations: rows.map((row) => ({
      golden_query_digest: row.golden_query_digest,
      query_metrics_digest: row.query_metrics.query_metrics_digest,
    })),
  });
}

export function sealRetrievalEvaluationMetricsSet(
  value: unknown,
  environmentSetValue: unknown,
  goldenValue: unknown,
): RetrievalEvaluationMetricsSet {
  preflightMetricsSetBounds(value);
  const golden = sealNormalizedRetrievalEvaluationGolden(goldenValue);
  const environmentSet = sealRetrievalEvaluationEnvironmentSet(environmentSetValue, golden);
  const item = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(item, ["contract_version", "environment_set_digest", "normalized_golden_digest", "query_count", "query_evaluations",
    "query_metrics_set_digest", "environment_aggregates", "aggregate_metrics", "metrics_set_digest"], "GKX_EVAL_METRICS_SET_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_METRICS_SET_VERSION || item.environment_set_digest !== environmentSet.environment_set_digest ||
      item.normalized_golden_digest !== golden.golden_digest || item.query_count !== golden.queries.length ||
      !Array.isArray(item.query_evaluations) || item.query_evaluations.length !== golden.queries.length) {
    throw new TypeError("GKX_EVAL_METRICS_SET_COORDINATE_INVALID");
  }
  const environmentByQuery = new Map(environmentSet.members.flatMap((member) => member.query_partition
    .map((query) => [query.query_id, member.environment.environment_digest] as const)));
  const evaluations = (item.query_evaluations as unknown[]).map((raw, index) => {
    const row = raw as Record<string, unknown>;
    exactKeys(row, ["environment_digest", "golden_query_digest", "query_metrics"], "GKX_EVAL_METRICS_SET_QUERY_FIELDS_INVALID");
    const expected = golden.queries[index];
    const metrics = sealRetrievalEvaluationQueryMetrics(row.query_metrics);
    if (row.environment_digest !== environmentByQuery.get(expected.id) || row.golden_query_digest !== expected.query_digest ||
        metrics.query_id !== expected.id || metrics.expected_top_k !== expected.expected_top_k) {
      throw new TypeError("GKX_EVAL_METRICS_SET_QUERY_BINDING_INVALID");
    }
    return { environment_digest: row.environment_digest as string, golden_query_digest: expected.query_digest, query_metrics: metrics };
  });
  assertDigest(item.query_metrics_set_digest, "GKX_EVAL_METRICS_SET_QUERY_SET_DIGEST_INVALID");
  if (item.query_metrics_set_digest !== globalQueryMetricsSetDigest(environmentSet.environment_set_digest, evaluations)) {
    throw new TypeError("GKX_EVAL_METRICS_SET_QUERY_SET_DIGEST_MISMATCH");
  }
  if (!Array.isArray(item.environment_aggregates) || item.environment_aggregates.length !== environmentSet.members.length) {
    throw new TypeError("GKX_EVAL_METRICS_SET_ENVIRONMENT_AGGREGATES_INVALID");
  }
  const environmentAggregates = (item.environment_aggregates as unknown[]).map((raw, index) => {
    const entry = raw as Record<string, unknown>;
    exactKeys(entry, ["environment_digest", "query_count", "query_metrics_set_digest", "aggregate_metrics", "environment_aggregate_digest"],
      "GKX_EVAL_METRICS_SET_ENVIRONMENT_AGGREGATE_FIELDS_INVALID");
    const member = environmentSet.members[index];
    const memberRows = evaluations.filter((row) => row.environment_digest === member.environment.environment_digest);
    if (entry.environment_digest !== member.environment.environment_digest || entry.query_count !== memberRows.length ||
        memberRows.length !== member.query_count) throw new TypeError("GKX_EVAL_METRICS_SET_ENVIRONMENT_AGGREGATE_COORDINATE_INVALID");
    assertDigest(entry.query_metrics_set_digest, "GKX_EVAL_METRICS_SET_ENVIRONMENT_QUERY_SET_DIGEST_INVALID");
    if (entry.query_metrics_set_digest !== scopedQueryMetricsSetDigest(member.environment.environment_digest, memberRows)) {
      throw new TypeError("GKX_EVAL_METRICS_SET_ENVIRONMENT_QUERY_SET_DIGEST_MISMATCH");
    }
    const aggregate = sealRetrievalEvaluationAggregateMetrics(entry.aggregate_metrics);
    const expectedAggregate = aggregateRetrievalEvaluationMetrics(memberRows.map((row) => row.query_metrics));
    if (stableJson(aggregate) !== stableJson(expectedAggregate)) throw new TypeError("GKX_EVAL_METRICS_SET_ENVIRONMENT_AGGREGATE_MISMATCH");
    entry.aggregate_metrics = aggregate;
    assertDigest(entry.environment_aggregate_digest, "GKX_EVAL_METRICS_SET_ENVIRONMENT_AGGREGATE_DIGEST_INVALID");
    if (metricDigest(entry, "environment_aggregate_digest") !== entry.environment_aggregate_digest) {
      throw new TypeError("GKX_EVAL_METRICS_SET_ENVIRONMENT_AGGREGATE_DIGEST_MISMATCH");
    }
    return entry as unknown as RetrievalEvaluationEnvironmentAggregate;
  });
  const aggregate = sealRetrievalEvaluationAggregateMetrics(item.aggregate_metrics);
  const expectedAggregate = aggregateRetrievalEvaluationMetrics(evaluations.map((row) => row.query_metrics));
  if (stableJson(aggregate) !== stableJson(expectedAggregate)) throw new TypeError("GKX_EVAL_METRICS_SET_AGGREGATE_MISMATCH");
  item.query_evaluations = evaluations;
  item.environment_aggregates = environmentAggregates;
  item.aggregate_metrics = aggregate;
  assertDigest(item.metrics_set_digest, "GKX_EVAL_METRICS_SET_DIGEST_INVALID");
  if (metricDigest(item, "metrics_set_digest") !== item.metrics_set_digest) throw new TypeError("GKX_EVAL_METRICS_SET_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationMetricsSet;
}

/**
 * Trusted-host constructor for the one authoritative MetricsSet shape.  It is
 * intentionally omitted from the public `/retrieval` allowlist; callers hand
 * it actual sealed per-query metric rows in normalized-golden order.
 */
export function buildRetrievalEvaluationMetricsSetForHost(input: {
  environment_set: unknown;
  normalized_golden: unknown;
  query_metrics: readonly unknown[];
}): RetrievalEvaluationMetricsSet {
  const golden = sealNormalizedRetrievalEvaluationGolden(input.normalized_golden);
  const environmentSet = sealRetrievalEvaluationEnvironmentSet(input.environment_set, golden);
  if (!Array.isArray(input.query_metrics) || input.query_metrics.length !== golden.queries.length) {
    throw new TypeError("GKX_EVAL_HOST_QUERY_METRICS_COUNT_INVALID");
  }
  const environmentByQuery = new Map(environmentSet.members.flatMap((member) => member.query_partition
    .map((query) => [query.query_id, member.environment.environment_digest] as const)));
  const evaluations: RetrievalEvaluationMetricsSetQueryEvaluation[] = golden.queries.map((query, index) => {
    const metrics = sealRetrievalEvaluationQueryMetrics(input.query_metrics[index]);
    if (metrics.query_id !== query.id || metrics.expected_top_k !== query.expected_top_k) {
      throw new TypeError("GKX_EVAL_HOST_QUERY_METRICS_BINDING_INVALID");
    }
    const environmentDigest = environmentByQuery.get(query.id);
    if (!environmentDigest) throw new TypeError("GKX_EVAL_HOST_QUERY_ENVIRONMENT_MISSING");
    return { environment_digest: environmentDigest, golden_query_digest: query.query_digest, query_metrics: metrics };
  });
  const environmentAggregates: RetrievalEvaluationEnvironmentAggregate[] = environmentSet.members.map((member) => {
    const rows = evaluations.filter((row) => row.environment_digest === member.environment.environment_digest);
    const aggregate = aggregateRetrievalEvaluationMetrics(rows.map((row) => row.query_metrics));
    const material = {
      environment_digest: member.environment.environment_digest,
      query_count: rows.length,
      query_metrics_set_digest: scopedQueryMetricsSetDigest(member.environment.environment_digest, rows),
      aggregate_metrics: aggregate,
    };
    return { ...material, environment_aggregate_digest: retrievalCanonicalDigest(material) };
  });
  const aggregate = aggregateRetrievalEvaluationMetrics(evaluations.map((row) => row.query_metrics));
  const material = {
    contract_version: RETRIEVAL_EVALUATION_METRICS_SET_VERSION,
    environment_set_digest: environmentSet.environment_set_digest,
    normalized_golden_digest: golden.golden_digest,
    query_count: evaluations.length,
    query_evaluations: evaluations,
    query_metrics_set_digest: globalQueryMetricsSetDigest(environmentSet.environment_set_digest, evaluations),
    environment_aggregates: environmentAggregates,
    aggregate_metrics: aggregate,
  };
  return sealRetrievalEvaluationMetricsSet(
    { ...material, metrics_set_digest: retrievalCanonicalDigest(material) },
    environmentSet,
    golden,
  );
}

export function sealRetrievalEvaluationBaseConfigurationCoordinate(value: unknown): RetrievalEvaluationBaseConfigurationCoordinate {
  preflightPlainEvaluationData(value, "GKX_EVAL_BASE_CONFIGURATION_INVALID");
  const item = inertClone(value) as unknown as Record<string, unknown>;
  exactKeys(item, ["contract_version", "effective_non_tunable_configuration_digest", "base_configuration_digest"], "GKX_EVAL_BASE_CONFIGURATION_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_BASE_CONFIGURATION_VERSION) throw new TypeError("GKX_EVAL_BASE_CONFIGURATION_COORDINATE_INVALID");
  assertDigest(item.effective_non_tunable_configuration_digest, "GKX_EVAL_BASE_CONFIGURATION_EFFECTIVE_DIGEST_INVALID");
  assertDigest(item.base_configuration_digest, "GKX_EVAL_BASE_CONFIGURATION_DIGEST_INVALID");
  if (metricDigest(item, "base_configuration_digest") !== item.base_configuration_digest) throw new TypeError("GKX_EVAL_BASE_CONFIGURATION_DIGEST_MISMATCH");
  return item as unknown as RetrievalEvaluationBaseConfigurationCoordinate;
}

/** Exact non-tunable coordinate of the private offline Phase-4 executor. */
export function retrievalEvaluationExecutionBaseConfigurationForHost(): RetrievalEvaluationBaseConfigurationCoordinate {
  const material = {
    contract_version: RETRIEVAL_EVALUATION_BASE_CONFIGURATION_VERSION,
    effective_non_tunable_configuration_digest: retrievalCanonicalDigest({
      effective_non_tunable_configuration: "phase4-fixed-offline-v1",
    }),
  };
  return sealRetrievalEvaluationBaseConfigurationCoordinate({
    ...material,
    base_configuration_digest: retrievalCanonicalDigest(material),
  });
}

function allTuningAxes(): RetrievalEvaluationTuningAxes[] {
  const axes: RetrievalEvaluationTuningAxes[] = [];
  for (const rrf_k of RETRIEVAL_EVALUATION_TUNING_GRID.rrf_k) {
    for (const mmr of RETRIEVAL_EVALUATION_TUNING_GRID.mmr) {
      for (const semantic_top_k of RETRIEVAL_EVALUATION_TUNING_GRID.semantic_top_k) {
        for (const lexical_top_k of RETRIEVAL_EVALUATION_TUNING_GRID.lexical_top_k) {
          axes.push({ rrf_k, mmr: mmr.enabled, mmr_lambda_micros: mmr.lambda_micros, semantic_top_k, lexical_top_k });
        }
      }
    }
  }
  return axes;
}

/** Exact eligible grid coordinates for the trusted tuning executor. */
export function retrievalEvaluationEligibleTuningAxesForHost(
  baselineValue: unknown,
): RetrievalEvaluationTuningAxesCoordinate[] {
  const baseline = sealRetrievalEvaluationBaseline(baselineValue);
  return allTuningAxes()
    .filter((axes) => axes.semantic_top_k >= baseline.maximum_expected_top_k && axes.lexical_top_k >= baseline.maximum_expected_top_k)
    .map((axes) => {
      const material = { contract_version: RETRIEVAL_EVALUATION_TUNING_AXES_VERSION, ...axes };
      return sealRetrievalEvaluationTuningAxesCoordinate({ ...material, tuning_axes_digest: retrievalCanonicalDigest(material) });
    });
}

/** Fail before state/provider work when the immutable tuning baseline needs human review. */
export function assertRetrievalEvaluationTuneBaselineForHost(baselineValue: unknown): RetrievalEvaluationBaseline {
  const baseline = sealRetrievalEvaluationBaseline(baselineValue);
  if (baseline.query_count > 30) throw new TypeError("GKX_EVAL_TUNE_QUERY_COUNT_INVALID");
  if (baseline.base_configuration_digest !== retrievalEvaluationExecutionBaseConfigurationForHost().base_configuration_digest ||
      !defaultRelativeNdcgBudget(baseline.relative_ndcg_budget) ||
      metricsSetZeroGateFailures(baseline.metrics_set).length > 0) {
    throw new TypeError("GKX_EVAL_TUNE_BASELINE_NEEDS_HUMAN");
  }
  return baseline;
}

/** Construct and independently seal one exhaustive trusted-host candidate. */
export function buildRetrievalEvaluationTuneCandidateForHost(input: {
  baseline: unknown;
  axes: unknown;
  metrics_set: unknown;
}): RetrievalEvaluationTuneCandidate {
  const baseline = sealRetrievalEvaluationBaseline(input.baseline);
  const axes = sealRetrievalEvaluationTuningAxesCoordinate(input.axes);
  const metricsSet = sealRetrievalEvaluationMetricsSet(input.metrics_set, baseline.environment_set, baseline.normalized_golden);
  const candidateConfigDigest = retrievalCanonicalDigest({
    base_configuration_digest: baseline.base_configuration_digest,
    candidate_config: candidateConfigMaterial(axes),
  });
  return {
    candidate_config_digest: candidateConfigDigest,
    axes,
    metrics_set: metricsSet,
    candidate_evaluation_digest: evaluationCoordinateDigest({
      environment_set_digest: baseline.environment_set_digest,
      normalized_golden_digest: baseline.normalized_golden_digest,
      base_configuration_digest: baseline.base_configuration_digest,
      tuning_grid_digest: baseline.tuning_grid_digest,
      tuning_axes_digest: axes.tuning_axes_digest,
      candidate_config_digest: candidateConfigDigest,
      query_metrics_set_digest: metricsSet.query_metrics_set_digest,
      aggregate_metrics_digest: metricsSet.aggregate_metrics.aggregate_metrics_digest,
      metrics_set_digest: metricsSet.metrics_set_digest,
      relative_ndcg_budget: baseline.relative_ndcg_budget,
      query_count: baseline.query_count,
      maximum_expected_top_k: baseline.maximum_expected_top_k,
    }),
  };
}

function changedAxisCount(candidate: RetrievalEvaluationTuningAxes, baseline: RetrievalEvaluationTuningAxes): number {
  return (["rrf_k", "mmr", "mmr_lambda_micros", "semantic_top_k", "lexical_top_k"] as const)
    .reduce((count, key) => count + (candidate[key] === baseline[key] ? 0 : 1), 0);
}

export interface RetrievalEvaluationTunePriorityComparable {
  axes: RetrievalEvaluationTuningAxes;
  ndcg_at_k_micros: number;
  recall_at_k_micros: number;
  mrr_micros: number;
}

/**
 * Trusted-host comparator shared by the exhaustive selector and its compact
 * cross-language priority fixture. It is intentionally absent from the
 * public `/retrieval` allowlist.
 */
export function compareRetrievalEvaluationTunePriorityCandidates(
  left: RetrievalEvaluationTunePriorityComparable,
  right: RetrievalEvaluationTunePriorityComparable,
  baseline: RetrievalEvaluationTuningAxes,
): number {
  const numeric = (a: number, b: number) => a < b ? -1 : a > b ? 1 : 0;
  return numeric(right.ndcg_at_k_micros, left.ndcg_at_k_micros) ||
    numeric(right.recall_at_k_micros, left.recall_at_k_micros) ||
    numeric(right.mrr_micros, left.mrr_micros) ||
    numeric(changedAxisCount(left.axes, baseline), changedAxisCount(right.axes, baseline)) ||
    numeric(left.axes.semantic_top_k + left.axes.lexical_top_k, right.axes.semantic_top_k + right.axes.lexical_top_k) ||
    numeric(Math.abs(left.axes.rrf_k - 60), Math.abs(right.axes.rrf_k - 60)) ||
    numeric(left.axes.mmr ? 1 : 0, right.axes.mmr ? 1 : 0) ||
    numeric(Math.abs((left.axes.mmr_lambda_micros ?? 700_000) - 700_000), Math.abs((right.axes.mmr_lambda_micros ?? 700_000) - 700_000)) ||
    retrievalCodeUnitCompare(stableJson(candidateConfigMaterial(left.axes)), stableJson(candidateConfigMaterial(right.axes)));
}

function tuneCompare(left: RetrievalEvaluationTuneCandidate, right: RetrievalEvaluationTuneCandidate, baseline: RetrievalEvaluationTuningAxes): number {
  return compareRetrievalEvaluationTunePriorityCandidates(
    {
      axes: left.axes,
      ndcg_at_k_micros: left.metrics_set.aggregate_metrics.ndcg_at_k_micros,
      recall_at_k_micros: left.metrics_set.aggregate_metrics.recall_at_k_micros,
      mrr_micros: left.metrics_set.aggregate_metrics.mrr_micros,
    },
    {
      axes: right.axes,
      ndcg_at_k_micros: right.metrics_set.aggregate_metrics.ndcg_at_k_micros,
      recall_at_k_micros: right.metrics_set.aggregate_metrics.recall_at_k_micros,
      mrr_micros: right.metrics_set.aggregate_metrics.mrr_micros,
    },
    baseline,
  );
}

export function selectRetrievalEvaluationTuneCandidate(input: RetrievalEvaluationTuneSelectionInput): RetrievalEvaluationTuneSelection {
  preflightTuneSelectionBounds(input);
  const inputRecord = inertClone(input) as unknown as Record<string, unknown>;
  exactKeys(inputRecord, ["baseline", "candidates"], "GKX_EVAL_TUNE_INPUT_FIELDS_INVALID");
  const inert = inputRecord as unknown as RetrievalEvaluationTuneSelectionInput;
  const baselineEnvelope = sealRetrievalEvaluationBaseline(inert.baseline);
  const baseConfiguration = baselineEnvelope.base_configuration;
  const tuningGrid = baselineEnvelope.tuning_grid;
  const golden = baselineEnvelope.normalized_golden;
  const environmentSet = baselineEnvelope.environment_set;
  const queryCount = golden.queries.length;
  if (queryCount > 30) throw new TypeError("GKX_EVAL_TUNE_QUERY_COUNT_INVALID");
  const maximumExpectedTopK = baselineEnvelope.maximum_expected_top_k;
  const baselineAxes = baselineEnvelope.selected_axes;
  const baselineMetricsSet = baselineEnvelope.metrics_set;
  const baselineMetrics = baselineMetricsSet.aggregate_metrics;
  if (!defaultRelativeNdcgBudget(baselineEnvelope.relative_ndcg_budget) || metricsSetZeroGateFailures(baselineMetricsSet).length > 0) {
    throw new TypeError("GKX_EVAL_TUNE_BASELINE_NEEDS_HUMAN");
  }
  const allAxes = allTuningAxes();
  const eligibleAxes = allAxes.filter((axes) => axes.semantic_top_k >= maximumExpectedTopK && axes.lexical_top_k >= maximumExpectedTopK);
  if (!Array.isArray(inert.candidates) || inert.candidates.length !== eligibleAxes.length) throw new TypeError("GKX_EVAL_TUNE_CANDIDATE_COUNT_INVALID");
  const candidates = inert.candidates.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new TypeError("GKX_EVAL_TUNE_CANDIDATE_INVALID");
    exactKeys(candidate as unknown as Record<string, unknown>, [
      "candidate_config_digest", "axes", "metrics_set", "candidate_evaluation_digest",
    ], "GKX_EVAL_TUNE_CANDIDATE_FIELDS_INVALID");
    const axes = sealRetrievalEvaluationTuningAxesCoordinate(candidate.axes);
    const metricsSet = sealRetrievalEvaluationMetricsSet(candidate.metrics_set, environmentSet, golden);
    assertDigest(candidate.candidate_config_digest, "GKX_EVAL_TUNE_CANDIDATE_DIGEST_INVALID");
    assertDigest(candidate.candidate_evaluation_digest, "GKX_EVAL_TUNE_CANDIDATE_EVALUATION_DIGEST_INVALID");
    if (candidate.candidate_config_digest !== retrievalCanonicalDigest({ base_configuration_digest: baseConfiguration.base_configuration_digest, candidate_config: candidateConfigMaterial(axes) })) {
      throw new TypeError("GKX_EVAL_TUNE_CANDIDATE_DIGEST_MISMATCH");
    }
    const expectedEvaluationDigest = evaluationCoordinateDigest({
      environment_set_digest: environmentSet.environment_set_digest,
      normalized_golden_digest: golden.golden_digest,
      base_configuration_digest: baseConfiguration.base_configuration_digest,
      tuning_grid_digest: tuningGrid.tuning_grid_digest,
      tuning_axes_digest: axes.tuning_axes_digest,
      candidate_config_digest: candidate.candidate_config_digest,
      query_metrics_set_digest: metricsSet.query_metrics_set_digest,
      aggregate_metrics_digest: metricsSet.aggregate_metrics.aggregate_metrics_digest,
      metrics_set_digest: metricsSet.metrics_set_digest,
      relative_ndcg_budget: baselineEnvelope.relative_ndcg_budget,
      query_count: queryCount,
      maximum_expected_top_k: maximumExpectedTopK,
    });
    if (candidate.candidate_evaluation_digest !== expectedEvaluationDigest) throw new TypeError("GKX_EVAL_TUNE_CANDIDATE_EVALUATION_DIGEST_MISMATCH");
    return {
      candidate_config_digest: candidate.candidate_config_digest,
      axes,
      metrics_set: metricsSet,
      candidate_evaluation_digest: candidate.candidate_evaluation_digest,
    };
  });
  if (new Set(candidates.map((candidate) => stableJson(candidate.axes))).size !== candidates.length) throw new TypeError("GKX_EVAL_TUNE_CANDIDATE_DUPLICATE");
  const actualAxes = candidates.map((candidate) => stableJson(axesMaterial(candidate.axes))).sort(retrievalCodeUnitCompare);
  const expectedAxes = eligibleAxes.map((axes) => stableJson(axes)).sort(retrievalCodeUnitCompare);
  if (stableJson(actualAxes) !== stableJson(expectedAxes)) throw new TypeError("GKX_EVAL_TUNE_CANDIDATE_SET_INCOMPLETE");
  const baselineCandidates = candidates.filter((candidate) => stableJson(axesMaterial(candidate.axes)) === stableJson(axesMaterial(baselineAxes)));
  const baselineIsEligible = baselineAxes.semantic_top_k >= maximumExpectedTopK && baselineAxes.lexical_top_k >= maximumExpectedTopK;
  if (baselineCandidates.length !== (baselineIsEligible ? 1 : 0) || baselineIsEligible &&
      (baselineCandidates[0].candidate_evaluation_digest !== baselineEnvelope.baseline_evaluation_digest ||
       baselineCandidates[0].metrics_set.metrics_set_digest !== baselineMetricsSet.metrics_set_digest)) {
    throw new TypeError("GKX_EVAL_TUNE_BASELINE_CANDIDATE_MISMATCH");
  }
  const conforming = candidates.filter((candidate) => metricsSetZeroGateFailures(candidate.metrics_set).length === 0 &&
    candidate.metrics_set.aggregate_metrics.ndcg_at_k_micros >= baselineMetrics.ndcg_at_k_micros);
  conforming.sort((left, right) => tuneCompare(left, right, baselineAxes));
  const material: Omit<RetrievalEvaluationTuneSelection, "tune_selection_digest"> = {
    contract_version: RETRIEVAL_EVALUATION_TUNE_SELECTION_VERSION,
    evaluated_candidate_count: candidates.length,
    excluded_candidate_count: allAxes.length - candidates.length,
    query_evaluation_count: candidates.length * queryCount,
    conforming_candidate_count: conforming.length,
    query_count: queryCount,
    maximum_expected_top_k: maximumExpectedTopK,
    environment_set_digest: environmentSet.environment_set_digest,
    golden_digest: golden.golden_digest,
    base_configuration_digest: baseConfiguration.base_configuration_digest,
    tuning_grid_digest: tuningGrid.tuning_grid_digest,
    baseline_metrics_set_digest: baselineMetricsSet.metrics_set_digest,
    baseline_evaluation_digest: baselineEnvelope.baseline_evaluation_digest,
    baseline_aggregate_metrics_digest: baselineMetrics.aggregate_metrics_digest,
    candidate_evaluation_set_digest: retrievalCanonicalDigest(
      candidates.map((candidate) => candidate.candidate_evaluation_digest).sort(retrievalCodeUnitCompare),
    ),
    selected_candidate: conforming[0] ?? null,
  };
  return { ...material, tune_selection_digest: retrievalCanonicalDigest(material) };
}

export const RETRIEVAL_EVALUATION_COORDINATES = Object.freeze({
  contract_version: RETRIEVAL_EVALUATION_CONTRACT_VERSION,
  metric_contract_version: RETRIEVAL_EVALUATION_METRIC_VERSION,
  environment_set_contract_version: RETRIEVAL_EVALUATION_ENVIRONMENT_SET_VERSION,
  metrics_set_contract_version: RETRIEVAL_EVALUATION_METRICS_SET_VERSION,
  query_metrics_set_contract_version: RETRIEVAL_EVALUATION_QUERY_METRICS_SET_VERSION,
  baseline_contract_version: RETRIEVAL_EVALUATION_BASELINE_VERSION,
  evaluation_coordinate_contract_version: RETRIEVAL_EVALUATION_EVALUATION_COORDINATE_VERSION,
  observation_contract_version: RETRIEVAL_EVALUATION_OBSERVATION_VERSION,
  retrieval_contract_version: RETRIEVAL_LINEAGE_CONTRACT_VERSION,
  gkx_standard_commit: RETRIEVAL_GKX_STANDARD_COMMIT,
  gkx_projection_profile: RETRIEVAL_GKX_PROJECTION_PROFILE,
  ndcg_discount_scale: RETRIEVAL_EVALUATION_NDCG_DISCOUNT_SCALE,
  ndcg_discount_table_digest: RETRIEVAL_EVALUATION_NDCG_TABLE.table_digest,
  tuning_grid_digest: RETRIEVAL_EVALUATION_TUNING_GRID_COORDINATE.tuning_grid_digest,
  aggregate_ndcg_relative_budget: Object.freeze({ numerator: 2, denominator: 100 }),
});
