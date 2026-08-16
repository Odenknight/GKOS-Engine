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
export * from "./gkx23";
export * from "./gkx-migration";
export * from "./gkx-enrichment";
export * from "./gkx-blocked-review";
export * from "./gkx-exclusions";
export * from "./gkx-network";
export * from "./resolver";
export * from "./lineage";
export * from "./temporal";
export * from "./timestamps";
export * from "./graph";
export * from "./graphiti";
export * from "./incremental";
export * from "./demo";
export * from "./intelligence";
export * from "./gkx";
export * from "./adapter";
export * from "./graphiti-adapter";
export * from "./navigation/index";
export * from "./governance/index";

/** Non-normative draft SRTP support. It is opt-in and does not alter GKX defaults. */
export * as experimentalScience from "./science/index";
