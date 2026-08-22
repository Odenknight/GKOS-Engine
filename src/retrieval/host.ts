/**
 * Trusted GKOS-Engine retrieval host plane.
 *
 * This entry is bundled for the repository-owned CLI but is intentionally not
 * declared in package.json exports. It may handle canonical projection input
 * and stored raw authored-lineage receipts that must never cross the ordinary
 * policy-gated `gkos-engine/retrieval` surface.
 */
export { projectGkxRetrievalCorpus } from "./gkx-provenance";
export { bindGkxRetrievalCandidateChunks } from "./candidate-types";
// Trusted-host-only checkpoint seams for the canonical Decision-A adapter.
// They are intentionally absent from the package root, /gkx and /retrieval.
export { gkxCanonicalCandidateLedger as inspectCanonicalCandidateLedger } from "../lineage-receipts";
export { gkxCandidateValidationReceipt as inspectCandidateValidationReceipt } from "../validation-receipts";
export { resolveGkxScopedCandidateDeclaration as inspectScopedCandidateResolution } from "../candidate-view";
export { GkxIndex as TrustedCanonicalCandidateIndex } from "../incremental";
export {
  coordinatorFromActiveRetrievalStorePreflight,
  indexGkxRetrievalGeneration,
  isGkxRetrievalWriterAuthorityError,
  preflightActiveRetrievalStore,
  releaseActiveRetrievalStorePreflight,
} from "./coordinator";
export type { ActiveRetrievalStorePreflight } from "./coordinator";
export { buildGkxRetrievalGeneration, openActiveRetrievalStore, SqliteRetrievalStore } from "./sqlite-store";
// Qualification/recovery seams for the cross-generation writer handshake.
// The retrieval-host bundle is repository-private and absent from package exports.
export {
  acquireLegacyRetrievalWriter,
  recoverStaleLegacyRetrievalWriter,
  releaseLegacyRetrievalWriter,
} from "./state-writer-lock";
export type {
  GkxRetrievalCorpusProjection,
  GkxRetrievalProjectedSource,
  GkxRetrievalProjectionOptions,
  GkxRetrievalProjectionRejection,
} from "./gkx-provenance";
export type { GkxRetrievalGenerationInput } from "./sqlite-store";
