/**
 * Trusted Phase-4 evaluation host plane.
 *
 * This entry is deliberately absent from package.json exports. Slice A keeps
 * normalized verification public and raw fixture parsing private; Slice B adds
 * the equally private coordinator replay, filesystem capabilities, tuning,
 * presentation, and guarded candidate-publication surfaces used only by CLI.
 */
export { parseRetrievalEvaluationGoldenToml } from "./evaluation-golden";
export { retrievalEvaluationDecodedBase64Length } from "./evaluation-bounds";
export { projectAuthoredGkxRetrievalCorpus } from "./gkx-provenance";
export { buildGkxRetrievalAuthorizedCandidateView } from "./authorized-view";
export {
  gkxRetrievalLineageResultCoordinate,
  gkxRetrievalAuthorizedResultChunk,
  gkxRetrievalVerifiedCitation,
  gkxRetrievalDeduplicateOverlapEvidence,
  retrievalLexicalScanReasonCodes,
} from "./coordinator";
export { buildGkxRetrievalProvenance } from "./provenance";
export {
  buildGkxRetrievalGenerationUnactivated,
  deriveGkxRetrievalProjectionManifest,
  detectSqliteLexicalCapability,
} from "./sqlite-store";
export * from "./evaluation-fixtures";
export * from "./evaluation-tune-priority";
export * from "./evaluation-reviewed-result";
export * from "./evaluation-reviewed-bundle";
export * from "./evaluation-executor";
export * from "./evaluation-capability";
export * from "./evaluation-output";
export * from "./evaluation-presentation";
export {
  RETRIEVAL_EVALUATION_TUNE_SELECTION_VERSION,
  RETRIEVAL_EVALUATION_TUNING_GRID,
  RETRIEVAL_EVALUATION_TUNING_GRID_COORDINATE,
  assertRetrievalEvaluationTuneBaselineForHost,
  buildRetrievalEvaluationMetricsSetForHost,
  buildRetrievalEvaluationTuneCandidateForHost,
  compareRetrievalEvaluationTunePriorityCandidates,
  computeRetrievalEvaluationQueryMetricsForHost,
  retrievalEvaluationCandidateConfigMaterial,
  retrievalEvaluationExecutionBaseConfigurationForHost,
  retrievalEvaluationEligibleTuningAxesForHost,
  selectRetrievalEvaluationTuneCandidate,
} from "./evaluation";
export type {
  RetrievalEvaluationTuneCandidate,
  RetrievalEvaluationTuneSelectionInput,
  RetrievalEvaluationTuneSelection,
} from "./evaluation";
