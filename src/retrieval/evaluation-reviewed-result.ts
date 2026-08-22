import type { NormalizedRetrievalEvaluationQuery, RetrievalEvaluationEnvironmentCoordinate, RetrievalEvaluationTuningAxesCoordinate } from "./evaluation";
import type {
  RetrievalEvaluationFixedEmbeddingIndexTemplate,
  RetrievalEvaluationFixedEmbeddingQueryTemplate,
  RetrievalEvaluationFixedRerankQueryOracle,
} from "./evaluation-fixtures";
import type { GkxRetrievalCandidateChunk, GkxRetrievalCandidateDeclaration, GkxRetrievalCandidateSource } from "./candidate-types";
import type { GkxRetrievalProjectionManifest, GkxRetrievalSearchResult } from "./types";
import { buildGkxRetrievalAuthorizedCandidateView, type GkxRetrievalAuthorizedCandidateView } from "./authorized-view";
import { gkxRetrievalAuthorizedResultChunk, gkxRetrievalLineageResultCoordinate, gkxRetrievalVerifiedCitation } from "./coordinator";
import { buildGkxRetrievalProvenance } from "./provenance";
import { assessRetrievalConfidence } from "./confidence";
import { cosineSimilarity, maximalMarginalRelevance, reciprocalRankFusion } from "./fusion";
import { lexicalScanMatches, lexicalSignal } from "./lexical";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare } from "./digest";
import { RETRIEVAL_EVALUATION_FIXED_PROVIDER_REQUEST_VERSION } from "./evaluation-fixtures";

export interface RetrievalEvaluationReviewedResultDerivationInput {
  query: NormalizedRetrievalEvaluationQuery;
  manifest: GkxRetrievalProjectionManifest;
  environment: RetrievalEvaluationEnvironmentCoordinate;
  selected_axes: RetrievalEvaluationTuningAxesCoordinate;
  candidate_sources: GkxRetrievalCandidateSource[];
  candidate_declarations: GkxRetrievalCandidateDeclaration[];
  candidate_chunks: GkxRetrievalCandidateChunk[];
  source_bytes_by_path: ReadonlyMap<string, Uint8Array>;
  embedding_index_templates: RetrievalEvaluationFixedEmbeddingIndexTemplate[];
  embedding_query_template: RetrievalEvaluationFixedEmbeddingQueryTemplate;
  reranker_query_oracle: RetrievalEvaluationFixedRerankQueryOracle;
}

export interface RetrievalEvaluationReviewedResultDerivation {
  result: GkxRetrievalSearchResult;
  authorized_view: GkxRetrievalAuthorizedCandidateView;
  result_projection_id: string;
  result_projection_digest: string;
  reranker_request_digest: string;
  reranker_item_count: number;
  search_citation_verification_count: number;
  total_citation_verification_count: number;
}

function lexicalFields(chunk: GkxRetrievalCandidateChunk["chunk"]) {
  return {
    title: typeof chunk.metadata.title === "string" ? chunk.metadata.title : "",
    heading_path: chunk.heading_path.join(" / "),
    tags: Array.isArray(chunk.metadata.tags) ? chunk.metadata.tags.join(" ") : "",
    topic: typeof chunk.metadata.topic === "string" ? chunk.metadata.topic : "",
    category: typeof chunk.metadata.category === "string" ? chunk.metadata.category : "",
    text: chunk.text,
    token_count: chunk.token_count,
  };
}

/**
 * Host-private structural replay for the reviewed Slice-A fixture.  It uses
 * the same canonical authorized-view, result-coordinate, ranking, citation,
 * provenance, and confidence helpers as the public coordinator.  Slice B
 * must still differentially execute the coordinator and match these bytes.
 */
export function deriveRetrievalEvaluationReviewedResult(
  input: RetrievalEvaluationReviewedResultDerivationInput,
): RetrievalEvaluationReviewedResultDerivation {
  const { query, manifest, environment, selected_axes: axes } = input;
  if (environment.lexical_backend !== "sqlite_lexical_scan" || environment.embedding_role.state !== "active" ||
      environment.reranker_role.state !== "active" || input.embedding_query_template.outcome !== "success" ||
      input.reranker_query_oracle.outcome !== "success" || input.embedding_query_template.query_id !== query.id ||
      input.embedding_query_template.query_digest !== query.query_digest || input.reranker_query_oracle.query_id !== query.id ||
      input.reranker_query_oracle.query_digest !== query.query_digest) {
    throw new TypeError("GKX_EVAL_REVIEWED_RESULT_PROVIDER_COORDINATE_INVALID");
  }
  const effectiveQuery = query.text.trim();
  if (input.embedding_query_template.effective_query_text !== effectiveQuery ||
      input.reranker_query_oracle.effective_query_text !== effectiveQuery) {
    throw new TypeError("GKX_EVAL_REVIEWED_RESULT_QUERY_BINDING_INVALID");
  }
  const view = buildGkxRetrievalAuthorizedCandidateView(
    input.candidate_sources,
    input.candidate_declarations,
    input.candidate_chunks,
    query.as_of,
  );
  const coordinate = gkxRetrievalLineageResultCoordinate(manifest, view.sources, view.temporal_sources);
  const candidateByKey = new Map(input.candidate_chunks.map((candidate) => [candidate.candidate_chunk_key, candidate]));
  const eligible = view.eligible_candidate_chunk_keys.map((key) => candidateByKey.get(key));
  if (eligible.some((candidate) => candidate === undefined) || eligible.length !== 1) {
    throw new TypeError("GKX_EVAL_REVIEWED_RESULT_ELIGIBILITY_INVALID");
  }
  const eligibleCandidates = eligible as GkxRetrievalCandidateChunk[];
  const indexVectorByDigest = new Map<string, number[]>();
  for (const template of input.embedding_index_templates) for (const response of template.responses) {
    const vector = Array.from(Float32Array.from(response.values_micros, (part) => part / 1_000_000));
    const prior = indexVectorByDigest.get(response.input_digest);
    if (prior !== undefined && retrievalCanonicalDigest(prior) !== retrievalCanonicalDigest(vector)) {
      throw new TypeError("GKX_EVAL_REVIEWED_RESULT_INDEX_VECTOR_INVALID");
    }
    indexVectorByDigest.set(response.input_digest, vector);
  }
  const queryResponse = input.embedding_query_template.responses[0];
  if (!queryResponse || queryResponse.accepted_chunk_id !== null) {
    throw new TypeError("GKX_EVAL_REVIEWED_RESULT_QUERY_VECTOR_INVALID");
  }
  const queryVector = Array.from(Float32Array.from(queryResponse.values_micros, (part) => part / 1_000_000));
  const lexical = eligibleCandidates
    .filter((candidate) => lexicalScanMatches(lexicalFields(candidate.chunk), effectiveQuery))
    .map((candidate) => ({
      chunk_id: candidate.chunk.chunk_id,
      source_id: candidate.chunk.source_id,
      score: lexicalSignal(lexicalFields(candidate.chunk), effectiveQuery),
    }))
    .sort((left, right) => right.score - left.score || retrievalCodeUnitCompare(left.chunk_id, right.chunk_id))
    .slice(0, axes.lexical_top_k);
  const semantic = eligibleCandidates.map((candidate) => {
    const vector = indexVectorByDigest.get(candidate.chunk.content_digest);
    if (!vector) throw new TypeError("GKX_EVAL_REVIEWED_RESULT_INDEX_VECTOR_INVALID");
    return {
      chunk_id: candidate.chunk.chunk_id,
      source_id: candidate.chunk.source_id,
      score: cosineSimilarity(queryVector, vector),
      vector,
    };
  }).sort((left, right) => right.score - left.score || retrievalCodeUnitCompare(left.chunk_id, right.chunk_id))
    .slice(0, axes.semantic_top_k);
  const fused = reciprocalRankFusion(lexical, semantic, axes.rrf_k);
  const fusedRanks = new Map(fused.map((candidate, index) => [candidate.chunk_id, index + 1]));
  const rerankerUniverse = new Map(input.reranker_query_oracle.candidate_score_universe
    .map((candidate) => [candidate.candidate_chunk_id, candidate]));
  if (fused.some((candidate) => {
    const oracle = rerankerUniverse.get(candidate.chunk_id);
    return !oracle || oracle.input_digest !== rawByCandidateId(eligibleCandidates, candidate.chunk_id).content_digest;
  })) {
    throw new TypeError("GKX_EVAL_REVIEWED_RESULT_RERANK_UNIVERSE_INVALID");
  }
  const rerankerRequestMaterial = {
    contract_version: RETRIEVAL_EVALUATION_FIXED_PROVIDER_REQUEST_VERSION,
    call_kind: "reranker_query",
    request_id: input.reranker_query_oracle.request_id,
    query_id: query.id,
    query_digest: query.query_digest,
    query_text: effectiveQuery,
    ordered_inputs: fused.map((candidate) => ({
      candidate_chunk_id: candidate.chunk_id,
      input_digest: rawByCandidateId(eligibleCandidates, candidate.chunk_id).content_digest,
    })),
  };
  const rerankerRequestDigest = retrievalCanonicalDigest(rerankerRequestMaterial);
  const rerankerScores = new Map([...rerankerUniverse].map(([chunkId, candidate]) => [chunkId, candidate.score_micros / 1_000_000]));
  const ordered = [...fused].sort((left, right) => rerankerScores.get(right.chunk_id)! - rerankerScores.get(left.chunk_id)! ||
    right.fusion_score - left.fusion_score || retrievalCodeUnitCompare(left.chunk_id, right.chunk_id));
  const rerankerRanks = new Map(ordered.map((candidate, index) => [candidate.chunk_id, index + 1]));
  const selected = axes.mmr
    ? maximalMarginalRelevance(ordered, ordered.length, axes.mmr_lambda_micros! / 1_000_000,
      new Map(ordered.map((candidate, index) => [candidate.chunk_id, 1 / (index + 1)])))
    : ordered;
  const rawById = new Map(eligibleCandidates.map((candidate) => [candidate.chunk.chunk_id, candidate.chunk]));
  const storedById = new Map(view.sources.map((source) => [source.source_id, source]));
  const temporalById = new Map(view.temporal_sources.map((source) => [source.source_id, source]));
  const hits = selected.slice(0, query.expected_top_k).map((candidate, index) => {
    const rawChunk = rawById.get(candidate.chunk_id)!;
    const temporal = temporalById.get(rawChunk.source_id)!;
    const stored = storedById.get(rawChunk.source_id)!;
    const bytes = input.source_bytes_by_path.get(rawChunk.source_path);
    if (!bytes || !temporal || !stored) throw new TypeError("GKX_EVAL_REVIEWED_RESULT_SOURCE_BINDING_INVALID");
    const chunk = gkxRetrievalAuthorizedResultChunk(rawChunk, rawById, temporal);
    const citation = gkxRetrievalVerifiedCitation(rawChunk, effectiveQuery, bytes);
    const provenance = buildGkxRetrievalProvenance(stored, chunk, temporal, query.as_of);
    return {
      chunk,
      citation,
      provenance,
      stage_scores: {
        lexical_score: candidate.lexical_score,
        semantic_score: candidate.semantic_score,
        fusion_score: candidate.fusion_score,
        reranker_score: rerankerScores.get(candidate.chunk_id)!,
        mmr_score: candidate.mmr_score ?? null,
        lexical_rank: candidate.lexical_rank,
        semantic_rank: candidate.semantic_rank,
        fused_rank: fusedRanks.get(candidate.chunk_id)!,
        reranker_rank: rerankerRanks.get(candidate.chunk_id)!,
        final_rank: index + 1,
      },
    };
  });
  const stages = {
    lexical: {
      kind: "sqlite_lexical_scan" as const,
      state: "degraded" as const,
      reason_codes: ["SQLITE_FTS5_UNAVAILABLE", "SQLITE_LEXICAL_SCAN_ACTIVE", "SQLITE_LEXICAL_SCAN_APPROXIMATION"],
    },
    vector: {
      kind: environment.embedding_role.provider_kind,
      state: "active" as const,
      provider_id: environment.embedding_role.provider_id,
      model_id: environment.embedding_role.model_id,
      reason_codes: [],
    },
    reranker: {
      kind: environment.reranker_role.provider_kind,
      state: "active" as const,
      provider_id: environment.reranker_role.provider_id,
      model_id: environment.reranker_role.model_id,
      reason_codes: [],
    },
  };
  const result: GkxRetrievalSearchResult = {
    contract_version: "gkos-retrieval/1.0.0-draft.2",
    query_digest: retrievalCanonicalDigest({ as_of: query.as_of, query: effectiveQuery }),
    projection_id: coordinate.projection_id,
    projection_digest: coordinate.projection_digest,
    projection_freshness: "fresh",
    hits,
    confidence: assessRetrievalConfidence(hits.map((hit) => hit.stage_scores), { vector: stages.vector, reranker: stages.reranker }, eligibleCandidates.length, false),
    temporal: { as_of: query.as_of, coverage: query.as_of === null ? "not_requested" : "sufficient", reason_codes: [] },
    applied_filters: [],
    eligible_result_count: eligibleCandidates.length,
    stages,
  };
  return {
    result,
    authorized_view: view,
    result_projection_id: coordinate.projection_id,
    result_projection_digest: coordinate.projection_digest,
    reranker_request_digest: rerankerRequestDigest,
    reranker_item_count: fused.length,
    search_citation_verification_count: Math.min(selected.length, query.expected_top_k),
    total_citation_verification_count: Math.min(selected.length, query.expected_top_k) + hits.length,
  };
}

function rawByCandidateId(candidates: readonly GkxRetrievalCandidateChunk[], chunkId: string): GkxRetrievalCandidateChunk["chunk"] {
  const candidate = candidates.find((item) => item.chunk.chunk_id === chunkId);
  if (!candidate) throw new TypeError("GKX_EVAL_REVIEWED_RESULT_CANDIDATE_BINDING_INVALID");
  return candidate.chunk;
}
