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
