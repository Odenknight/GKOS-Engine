/**
 * Trusted Phase-4 evaluation parser plane.
 *
 * This entry is deliberately absent from package.json exports. It parses only
 * the versioned human golden TOML subset; search execution, tuning, output
 * publication, and filesystem authority are not implemented in slice A.
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
export * from "./evaluation-fixtures";
export * from "./evaluation-tune-priority";
export * from "./evaluation-reviewed-result";
export * from "./evaluation-reviewed-bundle";
export {
  RETRIEVAL_EVALUATION_TUNE_SELECTION_VERSION,
  RETRIEVAL_EVALUATION_TUNING_GRID,
  RETRIEVAL_EVALUATION_TUNING_GRID_COORDINATE,
  compareRetrievalEvaluationTunePriorityCandidates,
  retrievalEvaluationCandidateConfigMaterial,
  selectRetrievalEvaluationTuneCandidate,
} from "./evaluation";
export type {
  RetrievalEvaluationTuneCandidate,
  RetrievalEvaluationTuneSelectionInput,
  RetrievalEvaluationTuneSelection,
} from "./evaluation";
