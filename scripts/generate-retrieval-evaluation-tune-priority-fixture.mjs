import { writeFileSync } from "node:fs";
import * as retrieval from "../dist/retrieval.mjs";
import * as evaluationHost from "../dist/retrieval-evaluation-host.mjs";

const OUTPUT = new URL(
  "../contracts/retrieval/gkos-retrieval-evaluation-1.0.0-draft.1/tune-priority-fixture.json",
  import.meta.url,
);
const VERSION = "gkos-retrieval-evaluation-tune-priority-fixture/1.0.0-draft.1";
const CLEAN = [];
const BASELINE = Object.freeze({
  rrf_k: 60,
  mmr: false,
  mmr_lambda_micros: null,
  semantic_top_k: 20,
  lexical_top_k: 20,
});

function digest(value) {
  return retrieval.retrievalCanonicalDigest(value);
}

function candidate(candidate_id, axes, {
  ndcg = 700_000,
  recall = 700_000,
  mrr = 700_000,
  failures = CLEAN,
} = {}) {
  return {
    candidate_id,
    axes,
    ndcg_at_k_micros: ndcg,
    recall_at_k_micros: recall,
    mrr_micros: mrr,
    zero_gate_failures: [...failures].sort(retrieval.retrievalCodeUnitCompare),
  };
}

function makeCase(case_id, candidatesValue, {
  baselineAxes = BASELINE,
  baselineNdcg = 500_000,
  winner,
} = {}) {
  const candidates = [...candidatesValue].sort((left, right) =>
    retrieval.retrievalCodeUnitCompare(left.candidate_id, right.candidate_id));
  const conforming = candidates.filter((item) => item.zero_gate_failures.length === 0 &&
    item.ndcg_at_k_micros >= baselineNdcg);
  const ordered = [...conforming].sort((left, right) =>
    evaluationHost.compareRetrievalEvaluationTunePriorityCandidates(left, right, baselineAxes));
  if ((ordered[0]?.candidate_id ?? null) !== (winner ?? null)) {
    throw new Error(`${case_id}: expected generated winner ${winner ?? "null"}, got ${ordered[0]?.candidate_id ?? "null"}`);
  }
  const material = {
    case_id,
    baseline_axes: baselineAxes,
    baseline_ndcg_at_k_micros: baselineNdcg,
    candidates,
    expected_conforming_candidate_ids: conforming.map((item) => item.candidate_id)
      .sort(retrieval.retrievalCodeUnitCompare),
    expected_ordered_candidate_ids: ordered.map((item) => item.candidate_id),
    expected_selected_candidate_id: ordered[0]?.candidate_id ?? null,
  };
  return { ...material, case_digest: digest(material) };
}

function axes(overrides = {}) {
  return { ...BASELINE, ...overrides };
}

const cases = [
  makeCase("priority-01-ndcg", [
    candidate("higher-ndcg", axes({ rrf_k: 30 }), { ndcg: 800_000, recall: 100_000, mrr: 100_000 }),
    candidate("lower-ndcg", axes({ rrf_k: 100 }), { ndcg: 700_000, recall: 1_000_000, mrr: 1_000_000 }),
  ], { winner: "higher-ndcg" }),
  makeCase("priority-02-recall", [
    candidate("higher-recall", axes({ rrf_k: 30 }), { recall: 800_000, mrr: 100_000 }),
    candidate("lower-recall", axes({ rrf_k: 100 }), { recall: 700_000, mrr: 1_000_000 }),
  ], { winner: "higher-recall" }),
  makeCase("priority-03-mrr", [
    candidate("higher-mrr", axes({ rrf_k: 30 }), { mrr: 800_000 }),
    candidate("lower-mrr", axes({ rrf_k: 100 }), { mrr: 700_000 }),
  ], { winner: "higher-mrr" }),
  makeCase("priority-04-changed-axis-count", [
    candidate("fewer-changes", axes()),
    candidate("more-changes", axes({ semantic_top_k: 40 })),
  ], { winner: "fewer-changes" }),
  makeCase("priority-05-top-k-sum", [
    candidate("larger-top-k", axes({ semantic_top_k: 40, lexical_top_k: 40 })),
    candidate("smaller-top-k", axes({ semantic_top_k: 10, lexical_top_k: 10 })),
  ], { winner: "smaller-top-k" }),
  makeCase("priority-06-rrf-distance", [
    candidate("farther-rrf", axes({ rrf_k: 100 })),
    candidate("nearer-rrf", axes({ rrf_k: 30 })),
  ], { winner: "nearer-rrf" }),
  makeCase("priority-07-disabled-mmr", [
    candidate("disabled-mmr", {
      rrf_k: 60, mmr: false, mmr_lambda_micros: null, semantic_top_k: 10, lexical_top_k: 40,
    }),
    candidate("enabled-mmr", {
      rrf_k: 60, mmr: true, mmr_lambda_micros: 700_000, semantic_top_k: 40, lexical_top_k: 10,
    }),
  ], {
    baselineAxes: { rrf_k: 60, mmr: true, mmr_lambda_micros: 700_000, semantic_top_k: 10, lexical_top_k: 40 },
    winner: "disabled-mmr",
  }),
  makeCase("priority-08-lambda-distance", [
    candidate("farther-lambda", {
      rrf_k: 60, mmr: true, mmr_lambda_micros: 300_000, semantic_top_k: 20, lexical_top_k: 20,
    }),
    candidate("nearer-lambda", {
      rrf_k: 60, mmr: true, mmr_lambda_micros: 700_000, semantic_top_k: 20, lexical_top_k: 20,
    }),
  ], {
    baselineAxes: { rrf_k: 60, mmr: true, mmr_lambda_micros: 500_000, semantic_top_k: 20, lexical_top_k: 20 },
    winner: "nearer-lambda",
  }),
  makeCase("priority-09-canonical-config", [
    candidate("rrf-one-hundred", axes({ rrf_k: 100 })),
    candidate("rrf-twenty", axes({ rrf_k: 20 })),
  ], { winner: "rrf-one-hundred" }),
  makeCase("priority-10-zero-gates", [
    candidate("citation-coverage", axes({ rrf_k: 5 }), { ndcg: 1_000_000, failures: ["CITATION_COVERAGE"] }),
    candidate("citation-mismatch", axes({ rrf_k: 10 }), { ndcg: 1_000_000, failures: ["CITATION_MISMATCH"] }),
    candidate("clean", axes(), { ndcg: 600_000 }),
    candidate("confidence-mismatch", axes({ rrf_k: 20 }), { ndcg: 1_000_000, failures: ["CONFIDENCE_MISMATCH"] }),
    candidate("policy-leak", axes({ rrf_k: 30 }), { ndcg: 1_000_000, failures: ["POLICY_LEAK"] }),
    candidate("stale-citation", axes({ semantic_top_k: 5 }), { ndcg: 1_000_000, failures: ["STALE_CITATION"] }),
    candidate("stale-projection", axes({ semantic_top_k: 10 }), { ndcg: 1_000_000, failures: ["STALE_PROJECTION"] }),
    candidate("temporal-mismatch", axes({ semantic_top_k: 40 }), { ndcg: 1_000_000, failures: ["TEMPORAL_MISMATCH"] }),
    candidate("unverified-projection", axes({ semantic_top_k: 80 }), { ndcg: 1_000_000, failures: ["UNVERIFIED_PROJECTION"] }),
  ], { winner: "clean" }),
  makeCase("priority-11-no-conforming", [
    candidate("below-baseline", axes({ rrf_k: 30 }), { ndcg: 499_999 }),
    candidate("zero-gate", axes({ rrf_k: 100 }), { ndcg: 1_000_000, failures: ["POLICY_LEAK"] }),
  ], { winner: null }),
].sort((left, right) => retrieval.retrievalCodeUnitCompare(left.case_id, right.case_id));

const material = { contract_version: VERSION, cases };
const fixture = { ...material, fixture_digest: digest(material) };
evaluationHost.sealRetrievalEvaluationTunePriorityFixture(fixture);
const bytes = `${JSON.stringify(fixture, null, 2)}\n`;
if (process.argv.includes("--write")) writeFileSync(OUTPUT, bytes);
else process.stdout.write(bytes);
