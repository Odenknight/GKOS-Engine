/**
 * Canonical GKX-facing names for the stable compatibility implementation.
 *
 * Serialized profile names, `okf_version`, `.okf/`, `OKF-*` diagnostics and
 * the `okf` binary are intentionally unchanged. Existing `Okf*` TypeScript
 * names also remain exported for source compatibility.
 */
export type {
  OkfSensitivity as GkxSensitivity,
  OkfOrigin as GkxOrigin,
  OkfDiagnostic as GkxDiagnostic,
  OkfOriginProjection as GkxOriginProjection,
  OkfAssessmentScores as GkxAssessmentScores,
  OkfAssessment as GkxAssessment,
  OkfProjection as GkxProjection,
  OkfRelation as GkxRelation,
  OkfData as GkxData,
  OkfNodeState as GkxNodeState,
  KosmosNode as GkxNode,
  KosmosLink as GkxLink,
  KosmosDiagnostics as GkxDiagnostics,
  KosmosGraph as GkxGraph,
} from "./types";

export type { Okf23ProjectionOptions as Gkx23ProjectionOptions } from "./okf23";

export {
  parseOkfPlus as parseGkx,
  parseOkfTimestamp as parseGkxTimestamp,
} from "./okf";

export {
  OKF23_PROFILE as GKX23_PROFILE,
  OKF23_POLICY as GKX23_POLICY,
  assessOkf23 as assessGkx23,
  buildOkf23Projection as buildGkx23Projection,
  parseOkf23Frontmatter as parseGkx23Frontmatter,
  refreshOkf23Assessment as refreshGkx23Assessment,
  okf23RelationTargets as gkx23RelationTargets,
  okf23Inverse as gkx23Inverse,
} from "./okf23";

export { KosmosIndex as GkxIndex } from "./incremental";
export { makeGkxUuidV7 } from "./okf-migration";
