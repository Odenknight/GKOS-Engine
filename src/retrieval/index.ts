/**
 * GKOS-Engine retrieval reference implementation.
 *
 * This host-plane subpath is intentionally separate from NavigationCore and
 * from the platform-neutral root bundle because its derived store uses SQLite.
 */
export * from "./contracts";
export * from "./types";
export * from "./digest";
export * from "./chunker";
// Authorization-scoped temporal/provenance builders are intentionally
// coordinator-internal. Exporting them would let an external caller mint an
// "authorized" view from caller-selected IDs. Only the request timestamp
// normalizer and non-authorizing interval diagnostics are public.
export { normalizeRetrievalAsOf, projectRetrievalSourcesAtTime, retrievalSourceValidAt } from "./provenance";
export * from "./filters";
export * from "./fusion";
export * from "./confidence";
// Phase-4 evaluation exports are pure normalized-envelope and integer-math
// operations. Raw golden TOML, filesystem fixtures, search execution, tuning,
// and output publication remain in the non-exported trusted-host bundle.
export {
  RETRIEVAL_EVALUATION_CONTRACT_VERSION,
  RETRIEVAL_EVALUATION_GOLDEN_VERSION,
  RETRIEVAL_EVALUATION_METRIC_VERSION,
  RETRIEVAL_EVALUATION_QUERY_METRICS_VERSION,
  RETRIEVAL_EVALUATION_AGGREGATE_VERSION,
  RETRIEVAL_EVALUATION_COMPARISON_VERSION,
  RETRIEVAL_EVALUATION_SCENARIO_OUTCOME_VERSION,
  RETRIEVAL_EVALUATION_SCENARIO_COMPARISON_VERSION,
  RETRIEVAL_EVALUATION_NDCG_TABLE_VERSION,
  RETRIEVAL_EVALUATION_ENVIRONMENT_VERSION,
  RETRIEVAL_EVALUATION_ENVIRONMENT_SET_VERSION,
  RETRIEVAL_EVALUATION_METRICS_SET_VERSION,
  RETRIEVAL_EVALUATION_QUERY_METRICS_SET_VERSION,
  RETRIEVAL_EVALUATION_BASELINE_VERSION,
  RETRIEVAL_EVALUATION_EVALUATION_COORDINATE_VERSION,
  RETRIEVAL_EVALUATION_BASE_CONFIGURATION_VERSION,
  RETRIEVAL_EVALUATION_TUNING_AXES_VERSION,
  RETRIEVAL_EVALUATION_TUNING_GRID_VERSION,
  RETRIEVAL_EVALUATION_OBSERVATION_VERSION,
  RETRIEVAL_EVALUATION_QUERY_VIEW_AUDIT_ORACLE_VERSION,
  RETRIEVAL_EVALUATION_NDCG_DISCOUNT_SCALE,
  RETRIEVAL_EVALUATION_METRIC_SCALE,
  RETRIEVAL_EVALUATION_MAX_SOURCE_OBSERVATIONS,
  RETRIEVAL_EVALUATION_MAX_SOURCE_BYTES,
  RETRIEVAL_EVALUATION_MAX_TOTAL_SOURCE_BYTES,
  RETRIEVAL_EVALUATION_NDCG_DISCOUNT_SCALED,
  RETRIEVAL_EVALUATION_NDCG_TABLE,
  RETRIEVAL_EVALUATION_COORDINATES,
  retrievalEvaluationEffectiveQueryText,
  isValidRetrievalEvaluationOpaqueIdentity,
  isValidRetrievalEvaluationSourcePath,
  sealNormalizedRetrievalEvaluationQuery,
  sealNormalizedRetrievalEvaluationGolden,
  computeRetrievalEvaluationQueryMetrics,
  sealRetrievalEvaluationQueryMetrics,
  aggregateRetrievalEvaluationMetrics,
  sealRetrievalEvaluationAggregateMetrics,
  sealRetrievalEvaluationScenarioOutcome,
  compareRetrievalEvaluationScenarioOutcome,
  sealRetrievalEvaluationObservationReport,
  sealRetrievalEvaluationBaseline,
  compareRetrievalEvaluationBaseline,
  sealRetrievalEvaluationTuningAxesCoordinate,
  sealRetrievalEvaluationTuningGridCoordinate,
  sealRetrievalEvaluationEnvironmentCoordinate,
  sealRetrievalEvaluationEnvironmentSet,
  sealRetrievalEvaluationMetricsSet,
  sealRetrievalEvaluationBaseConfigurationCoordinate,
} from "./evaluation";
export type {
  RetrievalEvaluationConfidence,
  NormalizedRetrievalEvaluationQuery,
  NormalizedRetrievalEvaluationGolden,
  RetrievalEvaluationSourceObservation,
  RetrievalEvaluationQueryViewAuditOracle,
  RetrievalEvaluationExpectedTemporalHit,
  RetrievalEvaluationExpectedTemporal,
  RetrievalEvaluationQueryInput,
  RetrievalEvaluationCitationMetrics,
  RetrievalEvaluationPolicyMetrics,
  RetrievalEvaluationQueryMetrics,
  RetrievalEvaluationAggregateMetrics,
  RetrievalEvaluationEmbeddingRole,
  RetrievalEvaluationRerankerRole,
  RetrievalEvaluationEnvironmentCoordinate,
  RetrievalEvaluationEnvironmentSetMember,
  RetrievalEvaluationEnvironmentSet,
  RetrievalEvaluationMetricsSetQueryEvaluation,
  RetrievalEvaluationEnvironmentAggregate,
  RetrievalEvaluationMetricsSet,
  RetrievalEvaluationBaseConfigurationCoordinate,
  RetrievalEvaluationTuningAxes,
  RetrievalEvaluationTuningAxesCoordinate,
  RetrievalEvaluationTuningGridCoordinate,
  RetrievalEvaluationRelativeNdcgBudget,
  RetrievalEvaluationBaseline,
  RetrievalEvaluationComparisonInput,
  RetrievalEvaluationComparison,
  RetrievalEvaluationScenarioTemporalHit,
  RetrievalEvaluationScenarioOutcome,
  RetrievalEvaluationScenarioComparison,
  RetrievalEvaluationObservationReport,
} from "./evaluation";
export * from "./lexical";
export * from "./providers";
// Raw derived-store readers are intentionally not part of the public subpath:
// external retrieval must flow through RetrievalCoordinator so policy and live
// citation verification precede all returned identifiers, content, and ranks.
// Draft.1 building remains a compatibility API. Draft.2 corpus projection and
// stored-provenance publication are confined to the non-exported trusted-host
// bundle because their envelopes contain raw authored relationship receipts.
export { buildRetrievalGeneration, detectSqliteLexicalCapability, isGkxRetrievalProjectionManifest } from "./sqlite-store";
export type {
  BuiltRetrievalGeneration,
  RetrievalGenerationInput,
  SqliteLexicalCapability,
  StoredVector,
} from "./sqlite-store";
export { RetrievalCoordinator, indexRetrievalGeneration, vaultSourceReader } from "./coordinator";
export type { IndexRetrievalResult, RetrievalCoordinatorOptions } from "./coordinator";
export * from "./config";
