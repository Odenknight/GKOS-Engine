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
export * from "./filters";
export * from "./fusion";
export * from "./confidence";
export * from "./lexical";
export * from "./providers";
// Raw derived-store readers are intentionally not part of the public subpath:
// external retrieval must flow through RetrievalCoordinator so policy and live
// citation verification precede all returned identifiers, content, and ranks.
// Building a disposable generation remains a trusted host/operator API.
export { buildRetrievalGeneration } from "./sqlite-store";
export type {
  BuiltRetrievalGeneration,
  RetrievalGenerationInput,
  StoredVector,
} from "./sqlite-store";
export * from "./coordinator";
export * from "./config";
