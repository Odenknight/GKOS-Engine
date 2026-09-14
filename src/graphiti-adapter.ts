/** Optional Graphiti projection surface for consumers that need it. */
export {
  GRAPHITI_CORE_VERSION,
  GRAPHITI_ADAPTER_SCHEMA,
  DEFAULT_GRAPHITI_CONTENT_CHARS,
  DEFAULT_GRAPHITI_ATTRIBUTE_CHARS,
  measureGraphitiExtraction,
  deterministicUuid,
  graphitiIngestionProfile,
  buildGraphitiEpisodes,
  attachGraphitiContent,
  attachGraphitiSourceEvidence,
  buildGraphitiEpisodesWithContent,
  stripFrontmatter,
} from "./graphiti";

export type {
  GraphitiOptions,
  GraphitiIngestionProfile,
  GraphitiExtractionMetrics,
  ExtractedFactTriple,
} from "./graphiti";

export type { GraphitiEpisode } from "./types";
export { GRAPHITI_INGEST_SCRIPT } from "./graphiti-ingest-script";
export {
  GRAPHITI_QUERY_CONTRACT_VERSION,
  prepareGraphitiQueryRequest,
  acceptGraphitiQueryResult,
} from "./graphiti-query-contract";
export type {
  GraphitiQueryBinding, GraphitiQueryRequest, GraphitiQueryCitation,
  GraphitiQueryResult, GraphitiQueryStatus, GraphitiQueryContext,
} from "./graphiti-query-contract";

// Pure manifest identity helpers. Callers supply authorized source bytes;
// these functions neither authorize retrieval nor attest publication.
export { managedEpisodeJson, buildManagedGraphitiManifest, reconcileManagedGraphitiPublication } from "./graphiti-manifest";
export type { ManagedGraphitiEpisode } from "./graphiti-manifest";
