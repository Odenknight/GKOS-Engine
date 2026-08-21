import { RETRIEVAL_MMR_DEFAULT_LAMBDA, RETRIEVAL_RRF_DEFAULT_K } from "./contracts";
import { assertFiniteNumber, retrievalCodeUnitCompare } from "./digest";
import type { RankedCandidate } from "./types";

export interface RankedInput {
  chunk_id: string;
  source_id: string;
  score: number;
  vector?: readonly number[];
}

function uniqueRanked(input: readonly RankedInput[]): RankedInput[] {
  const seen = new Set<string>();
  const out: RankedInput[] = [];
  for (const candidate of input) {
    assertFiniteNumber(candidate.score, `score for ${candidate.chunk_id}`);
    if (!seen.has(candidate.chunk_id)) { seen.add(candidate.chunk_id); out.push(candidate); }
  }
  return out;
}

/** 1-based deterministic Reciprocal Rank Fusion. Stage scores are not probabilities. */
export function reciprocalRankFusion(
  lexicalInput: readonly RankedInput[],
  semanticInput: readonly RankedInput[],
  k: number = RETRIEVAL_RRF_DEFAULT_K,
): RankedCandidate[] {
  if (!Number.isSafeInteger(k) || k <= 0) throw new RangeError("RRF k must be a positive integer.");
  const lexical = uniqueRanked(lexicalInput);
  const semantic = uniqueRanked(semanticInput);
  const candidates = new Map<string, RankedCandidate>();
  const add = (item: RankedInput, rank: number, stage: "lexical" | "semantic") => {
    const existing = candidates.get(item.chunk_id) ?? {
      chunk_id: item.chunk_id,
      source_id: item.source_id,
      lexical_rank: null,
      lexical_score: null,
      semantic_rank: null,
      semantic_score: null,
      fusion_score: 0,
    };
    if (existing.source_id !== item.source_id) throw new Error(`Chunk ${item.chunk_id} has conflicting source identities.`);
    existing[`${stage}_rank`] = rank;
    existing[`${stage}_score`] = item.score;
    existing.fusion_score += 1 / (k + rank);
    if (item.vector) existing.vector = item.vector;
    candidates.set(item.chunk_id, existing);
  };
  lexical.forEach((item, index) => add(item, index + 1, "lexical"));
  semantic.forEach((item, index) => add(item, index + 1, "semantic"));
  return [...candidates.values()].sort((left, right) =>
    right.fusion_score - left.fusion_score || retrievalCodeUnitCompare(left.chunk_id, right.chunk_id));
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) throw new RangeError("Cosine vectors must have equal nonzero dimensions.");
  let dot = 0, leftNorm = 0, rightNorm = 0;
  for (let index = 0; index < left.length; index++) {
    const a = assertFiniteNumber(left[index], `left vector item ${index}`);
    const b = assertFiniteNumber(right[index], `right vector item ${index}`);
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

/**
 * Deterministic MMR. Relevance is fused_score/max(fused_score); diversity is
 * cosine when both vectors exist, otherwise zero. Ties use fused score then ID.
 */
export function maximalMarginalRelevance(
  input: readonly RankedCandidate[],
  limit: number,
  lambda: number = RETRIEVAL_MMR_DEFAULT_LAMBDA,
  relevanceByChunk?: ReadonlyMap<string, number>,
): RankedCandidate[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("MMR limit must be a nonnegative integer.");
  if (!Number.isFinite(lambda) || lambda < 0 || lambda > 1) throw new RangeError("MMR lambda must be within [0, 1].");
  if (limit === 0 || input.length === 0) return [];
  const maximum = Math.max(...input.map((candidate) => candidate.fusion_score));
  const remaining = [...input];
  const selected: RankedCandidate[] = [];
  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < remaining.length; index++) {
      const candidate = remaining[index];
      const suppliedRelevance = relevanceByChunk?.get(candidate.chunk_id);
      if (suppliedRelevance !== undefined && !Number.isFinite(suppliedRelevance)) throw new TypeError("MMR relevance inputs must be finite.");
      const relevance = suppliedRelevance ?? (maximum > 0 ? candidate.fusion_score / maximum : 0);
      let similarity = 0;
      if (candidate.vector) {
        for (const prior of selected) {
          if (prior.vector) similarity = Math.max(similarity, Math.max(0, cosineSimilarity(candidate.vector, prior.vector)));
        }
      }
      const score = lambda * relevance - (1 - lambda) * similarity;
      const current = remaining[bestIndex];
      if (score > bestScore || (score === bestScore && (
        candidate.fusion_score > current.fusion_score ||
        (candidate.fusion_score === current.fusion_score && retrievalCodeUnitCompare(candidate.chunk_id, current.chunk_id) < 0)
      ))) {
        bestIndex = index;
        bestScore = score;
      }
    }
    const [winner] = remaining.splice(bestIndex, 1);
    selected.push({ ...winner, mmr_score: bestScore });
  }
  return selected;
}
