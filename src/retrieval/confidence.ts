import type { RetrievalConfidence, RetrievalProviderStageStatus, RetrievalStageScores } from "./types";

/** Draft reason-coded calibration. Thresholds are contract-visible, not probabilities. */
export function assessRetrievalConfidence(
  scores: readonly RetrievalStageScores[],
  stages: { vector: RetrievalProviderStageStatus; reranker: RetrievalProviderStageStatus },
  eligibleCount: number,
  stale = false,
): RetrievalConfidence {
  const reasons: string[] = [];
  if (!scores.length) reasons.push(eligibleCount === 0 ? "NO_ELIGIBLE_RESULTS" : "WEAK_LEXICAL_MATCH");
  if (stages.vector.state === "degraded") reasons.push("VECTOR_UNAVAILABLE");
  if (stages.reranker.state === "degraded") reasons.push("RERANKER_UNAVAILABLE");
  if (stale) reasons.push("STALE_PROJECTION");
  const first = scores[0];
  const lexical = first?.lexical_score ?? null;
  const semantic = first?.semantic_score ?? null;
  const reranker = first?.reranker_score ?? null;
  if (first && first.lexical_rank !== null && first.semantic_rank !== null && Math.abs(first.lexical_rank - first.semantic_rank) > 5) reasons.push("RANK_DISAGREEMENT");
  let level: RetrievalConfidence["level"];
  if (!first) level = "insufficient";
  else if ((first.lexical_rank === 1 && lexical !== null) || (first.semantic_rank === 1 && semantic !== null) || reranker !== null) level = "high";
  else if (first.lexical_rank !== null || first.semantic_rank !== null) level = "medium";
  else level = "low";
  if (stale && level === "high") level = "medium";
  return {
    level,
    low_confidence: level === "low" || level === "insufficient",
    reason_codes: [...new Set(reasons)].sort(),
    lexical_signal: lexical,
    semantic_signal: semantic,
    reranker_signal: reranker,
    coverage_signal: eligibleCount > 0 ? Math.min(1, scores.length / eligibleCount) : null,
  };
}
