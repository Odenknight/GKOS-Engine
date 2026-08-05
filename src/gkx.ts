/** Canonical GKX public surface for the GKOS-Engine 2.x line. */
export type {
  GkxSensitivity,
  GkxOrigin,
  GkxDiagnostic,
  GkxOriginProjection,
  GkxAssessmentScores,
  GkxAssessment,
  GkxProjection,
  GkxRelation,
  GkxData,
  GkxNodeState,
  GkxNode,
  GkxLink,
  GkxDiagnostics,
  GkxGraph,
} from "./types";

export type { Gkx23ProjectionOptions } from "./gkx23";

export { parseGkx, parseGkxTimestamp } from "./gkx-parser";

export {
  GKX23_PROFILE,
  GKX23_POLICY,
  assessGkx23,
  buildGkx23Projection,
  parseGkx23Frontmatter,
  refreshGkx23Assessment,
  gkx23RelationTargets,
  gkx23Inverse,
} from "./gkx23";

export { GkxIndex } from "./incremental";
export { makeGkxUuidV7 } from "./gkx-migration";
