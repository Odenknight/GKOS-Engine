import type { GkxSensitivity } from "../types";

export type RetrievalProviderKind = "none" | "openai_compatible" | "local_onnx" | "mcp";
export type RetrievalStageState = "active" | "disabled" | "skipped" | "degraded";
export type DiscoverabilityDecision = "allow" | "deny" | "indeterminate" | "error";

export interface RetrievalChunk {
  chunk_id: string;
  source_id: string;
  source_path: string;
  source_digest: string;
  heading_path: string[];
  heading_depth: number;
  ordinal_within_source: number;
  structural_position: string;
  part_ordinal: number;
  start_byte: number;
  end_byte: number;
  start_line: number;
  end_line: number;
  content_digest: string;
  text: string;
  token_count: number;
  parent_chunk_id?: string;
  lineage_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  supersedes: string[];
  superseded_by: string[];
  metadata: RetrievalChunkMetadata;
}

export interface RetrievalChunkMetadata {
  title?: string;
  tags?: string[];
  topic?: string;
  category?: string;
  authored_at?: string;
  sensitivity?: GkxSensitivity;
  gkx_type?: string;
  epistemic_state?: string;
  governance_state?: string;
  review_state?: string;
  authoritative?: boolean;
  moc_relationships?: string[];
  author_agent_id?: string;
  quality?: number;
  archived?: boolean;
  [key: string]: unknown;
}

export interface ChunkMarkdownInput {
  source_id: string;
  source_path: string;
  text: string;
  lineage_id?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  supersedes?: readonly string[];
  superseded_by?: readonly string[];
  metadata?: RetrievalChunkMetadata;
}

export interface ChunkingOptions {
  max_tokens?: number;
  overlap_tokens?: number;
}

export interface SourceCitation {
  source_id: string;
  path: string;
  source_digest: string;
  heading_path: string[];
  start_byte: number;
  end_byte: number;
  start_line: number;
  end_line: number;
  verified: true;
  stale: false;
  matched_spans: Array<{ start_byte: number; end_byte: number; text: string }>;
}

export interface RetrievalFilters {
  vault?: string;
  path_include?: string[];
  path_exclude?: string[];
  tags_any?: string[];
  tags_all?: string[];
  topics?: string[];
  categories?: string[];
  authored_from?: string;
  authored_to?: string;
  sensitivity_ceiling?: GkxSensitivity;
  gkx_types?: string[];
  epistemic_states?: string[];
  governance_states?: string[];
  review_states?: string[];
  authoritative?: boolean;
  moc_relationships?: string[];
  source_digests?: string[];
  author_agent_ids?: string[];
  minimum_quality?: number;
  include_archives?: boolean;
}

export interface RetrievalStageScores {
  lexical_score: number | null;
  semantic_score: number | null;
  fusion_score: number;
  reranker_score: number | null;
  mmr_score: number | null;
  lexical_rank: number | null;
  semantic_rank: number | null;
  fused_rank: number;
  reranker_rank: number | null;
  final_rank: number;
}

export interface RetrievalConfidence {
  level: "high" | "medium" | "low" | "insufficient";
  low_confidence: boolean;
  reason_codes: string[];
  lexical_signal: number | null;
  semantic_signal: number | null;
  reranker_signal: number | null;
  coverage_signal: number | null;
}

export interface RetrievalParentContext {
  chunk_id: string;
  text: string;
  citation: SourceCitation;
}

export interface RetrievalHit {
  chunk: RetrievalChunk;
  citation: SourceCitation;
  stage_scores: RetrievalStageScores;
  parent_context?: RetrievalParentContext;
}

export interface RetrievalProviderStageStatus {
  kind: RetrievalProviderKind | "sqlite_fts5";
  state: RetrievalStageState;
  provider_id?: string;
  model_id?: string;
  reason_codes: string[];
}

export interface RetrievalSearchRequest {
  query: string;
  limit?: number;
  lexical_top_k?: number;
  semantic_top_k?: number;
  filters?: RetrievalFilters;
  rrf_k?: number;
  mmr?: boolean;
  mmr_lambda?: number;
  parent_expansion?: boolean;
  parent_expansion_max_child_tokens?: number;
}

export interface RetrievalSearchResult {
  contract_version: string;
  query_digest: string;
  projection_id: string;
  projection_digest: string;
  projection_freshness: "fresh" | "stale";
  hits: RetrievalHit[];
  confidence: RetrievalConfidence;
  applied_filters: string[];
  eligible_result_count: number;
  stages: {
    lexical: RetrievalProviderStageStatus;
    vector: RetrievalProviderStageStatus;
    reranker: RetrievalProviderStageStatus;
  };
}

export interface RetrievalProjectionManifest {
  contract_version: string;
  projection_schema_version: number;
  projection_id: string;
  engine_version: string;
  vault_id: string;
  source_snapshot_digest: string;
  configuration_digest: string;
  policy_digest: string;
  chunker_version: string;
  tokenizer_version: string;
  embedding_provider_id: string | null;
  embedding_model_id: string | null;
  embedding_dimensions: number | null;
  source_count: number;
  chunk_count: number;
  projection_digest: string;
}

export interface VectorProvider {
  readonly kind: Exclude<RetrievalProviderKind, "none">;
  readonly provider_id: string;
  readonly model_id: string;
  readonly dimensions: number;
  readonly timeout_ms: number;
  embed(texts: readonly string[], context?: { request_id?: string; signal?: AbortSignal }): Promise<readonly Float32Array[]>;
}

export interface RerankInput {
  chunk_id: string;
  text: string;
}

export interface RerankScore {
  chunk_id: string;
  score: number;
}

export interface RerankProvider {
  readonly kind: Exclude<RetrievalProviderKind, "none">;
  readonly provider_id: string;
  readonly model_id: string;
  readonly timeout_ms: number;
  rerank(query: string, inputs: readonly RerankInput[], context?: { request_id?: string; signal?: AbortSignal }): Promise<readonly RerankScore[]>;
}

export type DiscoverabilityPolicy = (chunk: Readonly<RetrievalChunk>) => DiscoverabilityDecision;

export interface RankedCandidate {
  chunk_id: string;
  source_id: string;
  lexical_rank: number | null;
  lexical_score: number | null;
  semantic_rank: number | null;
  semantic_score: number | null;
  fusion_score: number;
  vector?: readonly number[];
  mmr_score?: number | null;
}

export interface OpenAiCompatibleProviderConfig {
  kind: "openai_compatible";
  configuration_provenance: "trusted_operator";
  provider_id: string;
  model_id: string;
  dimensions: number;
  endpoint: string;
  token?: string;
  timeout_ms?: number;
}

export interface LocalOnnxProviderConfig {
  kind: "local_onnx";
  configuration_provenance: "trusted_operator";
  provider_id: string;
  model_id: string;
  dimensions: number;
  model_path: string;
  timeout_ms?: number;
}

export interface McpProviderConfig {
  kind: "mcp";
  configuration_provenance: "trusted_operator";
  provider_id: string;
  model_id: string;
  dimensions: number;
  server: string;
  embedding_tool?: string;
  rerank_tool?: string;
  timeout_ms?: number;
}

export type VectorProviderConfig = OpenAiCompatibleProviderConfig | LocalOnnxProviderConfig | McpProviderConfig;

export type OpenAiCompatibleRerankProviderConfig = Omit<OpenAiCompatibleProviderConfig, "dimensions">;
export type LocalOnnxRerankProviderConfig = Omit<LocalOnnxProviderConfig, "dimensions">;
export type McpRerankProviderConfig = Omit<McpProviderConfig, "dimensions" | "embedding_tool">;
export type RerankProviderConfig = OpenAiCompatibleRerankProviderConfig | LocalOnnxRerankProviderConfig | McpRerankProviderConfig;
