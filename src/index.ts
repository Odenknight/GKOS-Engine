/**
 * GKOS-Engine — public surface.
 *
 * Downstream products import this framework-neutral GKX surface instead of
 * engine internals.
 */
export * from "./types";
export * from "./version";
export * from "./canonical";
export * from "./paths";
export * from "./colors";
export * from "./markdown";
export * from "./gkx-parser";
export {
  GKX23_PROFILE,
  GKX23_POLICY,
  SENSITIVITY_RANK,
  FAIL_CLOSED_SENSITIVITY_DEFAULT,
  EPISTEMIC_FALLBACK_STATE,
  isValidGkxAuthoredUid,
  isValidGkxTargetIdentifier,
  parseGkx23Frontmatter,
  assessGkx23,
  buildGkx23Projection,
  refreshGkx23Assessment,
  gkx23RelationTargets,
  gkx23Inverse,
} from "./gkx23";
export type { Gkx23ProjectionOptions } from "./gkx23";
export * from "./gkx-migration";
export * from "./gkx-enrichment";
export * from "./gkx-blocked-review";
export * from "./gkx-exclusions";
export * from "./gkx-network";
export * from "./resolver";
export * from "./lineage";
export * from "./temporal";
export * from "./timestamps";
export {
  fileNodeId,
  folderNodeId,
  parseSourceFile,
  assembleGraph,
  buildGraph,
} from "./graph";
export type { NoteRecord, AssembleOptions } from "./graph";
export * from "./graphiti";
export * from "./incremental";
export * from "./demo";
export * from "./intelligence";
export * from "./ingestion";
export * from "./gkx";
export * from "./adapter";
export * from "./graphiti-adapter";
export * from "./navigation/index";
export * from "./navigation-effects/index";
export * from "./governance/index";

/** Non-normative draft SRTP support. It is opt-in and does not alter GKX defaults. */
export * as experimentalScience from "./science/index";
