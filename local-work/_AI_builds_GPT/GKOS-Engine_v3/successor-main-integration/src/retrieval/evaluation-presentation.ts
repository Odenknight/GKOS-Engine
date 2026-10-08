import { stableJson } from "./digest";
import type {
  RetrievalEvaluationComparison,
  RetrievalEvaluationTuneSelection,
} from "./evaluation";

export const RETRIEVAL_EVALUATION_CLI_USAGE = `Usage:
  gkx retrieval eval --fixture <golden-toml> [--json]
  gkx retrieval tune --fixture <golden-toml> --output <candidate-config>`;

export interface RetrievalEvaluationCliPresentation {
  stdout: string;
  exit_code: 0 | 1 | 4;
}

function failure(): never {
  throw new TypeError("GKX_EVAL_CLI_PRESENTATION_INVALID");
}

/** Exact path-free presentation for one sealed baseline comparison. */
export function retrievalEvaluationEvalPresentation(
  comparison: RetrievalEvaluationComparison,
  json: boolean,
): RetrievalEvaluationCliPresentation {
  if (!comparison || !matchesEvalStatus(comparison.status) || !Array.isArray(comparison.reasons)) failure();
  const exitCode = comparison.status === "pass" ? 0 : comparison.status === "regression" ? 1 : 4;
  const stdout = json
    ? `${JSON.stringify(JSON.parse(stableJson(comparison)), null, 2)}\n`
    : `gkx retrieval eval\nstatus: ${comparison.status}\nreasons: ${stableJson(comparison.reasons)}\n` +
      `baseline_ndcg_at_k_micros: ${comparison.baseline_ndcg_at_k_micros}\n` +
      `current_ndcg_at_k_micros: ${comparison.current_ndcg_at_k_micros}\n` +
      `baseline_evaluation_digest: ${comparison.baseline_evaluation_digest}\n` +
      `current_evaluation_digest: ${comparison.current_evaluation_digest}\n` +
      `comparison_digest: ${comparison.comparison_digest}\n`;
  return { stdout, exit_code: exitCode };
}

function matchesEvalStatus(value: unknown): value is RetrievalEvaluationComparison["status"] {
  return value === "pass" || value === "regression" || value === "needs_human";
}

/** Exact path-free presentation for a completed deterministic tune selection. */
export function retrievalEvaluationTunePresentation(
  selection: RetrievalEvaluationTuneSelection,
): RetrievalEvaluationCliPresentation {
  if (!selection || !Number.isSafeInteger(selection.evaluated_candidate_count) ||
      !Number.isSafeInteger(selection.excluded_candidate_count) ||
      !Number.isSafeInteger(selection.query_evaluation_count) ||
      !Number.isSafeInteger(selection.conforming_candidate_count)) failure();
  const selected = selection.selected_candidate;
  const stdout = `gkx retrieval tune\nstatus: ${selected ? "proposed" : "no_candidate"}\n` +
    `evaluated_candidate_count: ${selection.evaluated_candidate_count}\n` +
    `excluded_candidate_count: ${selection.excluded_candidate_count}\n` +
    `query_evaluation_count: ${selection.query_evaluation_count}\n` +
    `conforming_candidate_count: ${selection.conforming_candidate_count}\n` +
    `candidate_config_digest: ${selected?.candidate_config_digest ?? "null"}\n` +
    `candidate_evaluation_digest: ${selected?.candidate_evaluation_digest ?? "null"}\n` +
    `tune_selection_digest: ${selection.tune_selection_digest}\n`;
  return { stdout, exit_code: selected ? 0 : 1 };
}

export function retrievalEvaluationTuneNeedsHumanPresentation(): RetrievalEvaluationCliPresentation {
  return {
    stdout: "gkx retrieval tune\nstatus: needs_human\nreason: GKX_EVAL_TUNE_BASELINE_NEEDS_HUMAN\n",
    exit_code: 4,
  };
}
