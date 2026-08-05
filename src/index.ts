/**
 * GKOS-Engine — public surface.
 *
 * Downstream products import this framework-neutral surface instead of engine
 * internals. Compatibility exports remain available alongside canonical GKX
 * names so existing consumers can migrate without changing serialized data.
 */
export * from "./types";
export * from "./version";
export * from "./paths";
export * from "./colors";
export * from "./markdown";
export * from "./okf";
export * from "./okf23";
export * from "./okf-migration";
export * from "./okf-enrichment";
export * from "./okf-blocked-review";
export * from "./okf-exclusions";
export * from "./okf-network";
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
