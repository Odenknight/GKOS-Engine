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
