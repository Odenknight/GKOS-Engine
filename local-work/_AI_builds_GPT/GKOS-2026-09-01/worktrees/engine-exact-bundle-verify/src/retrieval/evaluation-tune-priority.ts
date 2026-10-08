import { types as utilTypes } from "node:util";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, stableJson } from "./digest";
import {
  compareRetrievalEvaluationTunePriorityCandidates,
  retrievalEvaluationCandidateConfigMaterial,
  sealRetrievalEvaluationTuningAxesCoordinate,
  RETRIEVAL_EVALUATION_TUNING_AXES_VERSION,
  type RetrievalEvaluationTuningAxes,
  type RetrievalEvaluationTunePriorityComparable,
} from "./evaluation";

export const RETRIEVAL_EVALUATION_TUNE_PRIORITY_FIXTURE_VERSION =
  "gkos-retrieval-evaluation-tune-priority-fixture/1.0.0-draft.1" as const;

export const RETRIEVAL_EVALUATION_TUNE_PRIORITY_ZERO_GATES = Object.freeze([
  "CITATION_COVERAGE",
  "CITATION_MISMATCH",
  "CONFIDENCE_MISMATCH",
  "POLICY_LEAK",
  "STALE_CITATION",
  "STALE_PROJECTION",
  "TEMPORAL_MISMATCH",
  "UNVERIFIED_PROJECTION",
] as const);

export type RetrievalEvaluationTunePriorityZeroGate =
  typeof RETRIEVAL_EVALUATION_TUNE_PRIORITY_ZERO_GATES[number];

export interface RetrievalEvaluationTunePriorityCandidate {
  candidate_id: string;
  axes: RetrievalEvaluationTuningAxes;
  ndcg_at_k_micros: number;
  recall_at_k_micros: number;
  mrr_micros: number;
  zero_gate_failures: RetrievalEvaluationTunePriorityZeroGate[];
}

export interface RetrievalEvaluationTunePriorityCase {
  case_id: string;
  baseline_axes: RetrievalEvaluationTuningAxes;
  baseline_ndcg_at_k_micros: number;
  candidates: RetrievalEvaluationTunePriorityCandidate[];
  expected_conforming_candidate_ids: string[];
  expected_ordered_candidate_ids: string[];
  expected_selected_candidate_id: string | null;
  case_digest: string;
}

export interface RetrievalEvaluationTunePriorityFixture {
  contract_version: typeof RETRIEVAL_EVALUATION_TUNE_PRIORITY_FIXTURE_VERSION;
  cases: RetrievalEvaluationTunePriorityCase[];
  fixture_digest: string;
}

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
const AXES_KEYS = ["rrf_k", "mmr", "mmr_lambda_micros", "semantic_top_k", "lexical_top_k"] as const;
const CANDIDATE_KEYS = [
  "candidate_id", "axes", "ndcg_at_k_micros", "recall_at_k_micros", "mrr_micros", "zero_gate_failures",
] as const;
const CASE_KEYS = [
  "case_id", "baseline_axes", "baseline_ndcg_at_k_micros", "candidates", "expected_conforming_candidate_ids",
  "expected_ordered_candidate_ids", "expected_selected_candidate_id", "case_digest",
] as const;

function fail(code: string): never {
  throw new TypeError(code);
}

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownData(record: Record<string, unknown>, key: string, code: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !("value" in descriptor)) fail(code);
  return descriptor.value;
}

function exactOwnDataKeys(record: Record<string, unknown>, expected: readonly string[], code: string): void {
  const keys = Object.keys(record).sort(retrievalCodeUnitCompare);
  const wanted = [...expected].sort(retrievalCodeUnitCompare);
  if (stableJson(keys) !== stableJson(wanted)) fail(code);
  for (const key of expected) ownData(record, key, code);
}

function denseDataArray(value: unknown, maximum: number, code: string): unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || value.length < 1 || value.length > maximum) fail(code);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) fail(code);
  }
  if (Object.keys(value).length !== value.length) fail(code);
  return value;
}

function boundedId(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128 || !ID_RE.test(value)) fail(code);
  return value;
}

function metric(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 1_000_000) fail(code);
  return value as number;
}

function sealAxes(value: unknown, code: string): RetrievalEvaluationTuningAxes {
  if (!isPlainDataRecord(value)) fail(code);
  exactOwnDataKeys(value, AXES_KEYS, code);
  const material = Object.fromEntries(AXES_KEYS.map((key) => [key, ownData(value, key, code)]));
  const coordinateMaterial = { contract_version: RETRIEVAL_EVALUATION_TUNING_AXES_VERSION, ...material };
  try {
    const coordinate = sealRetrievalEvaluationTuningAxesCoordinate({
      ...coordinateMaterial,
      tuning_axes_digest: retrievalCanonicalDigest(coordinateMaterial),
    });
    return Object.fromEntries(AXES_KEYS.map((key) => [key, coordinate[key]])) as unknown as RetrievalEvaluationTuningAxes;
  } catch {
    fail(code);
  }
}

function sealIdArray(value: unknown, maximum: number, code: string): string[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || value.length > maximum) fail(code);
  const rows: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) fail(code);
    rows.push(boundedId(descriptor.value, code));
  }
  if (Object.keys(value).length !== value.length) fail(code);
  if (new Set(rows).size !== rows.length) fail(code);
  return rows;
}

function sealFailures(value: unknown): RetrievalEvaluationTunePriorityZeroGate[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || value.length > RETRIEVAL_EVALUATION_TUNE_PRIORITY_ZERO_GATES.length) {
    fail("GKX_EVAL_TUNE_PRIORITY_FAILURES_INVALID");
  }
  const failures: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string" ||
        !RETRIEVAL_EVALUATION_TUNE_PRIORITY_ZERO_GATES.includes(descriptor.value as RetrievalEvaluationTunePriorityZeroGate)) {
      fail("GKX_EVAL_TUNE_PRIORITY_FAILURES_INVALID");
    }
    failures.push(descriptor.value);
  }
  if (Object.keys(value).length !== value.length || new Set(failures).size !== failures.length ||
      stableJson(failures) !== stableJson([...failures].sort(retrievalCodeUnitCompare))) {
    fail("GKX_EVAL_TUNE_PRIORITY_FAILURES_INVALID");
  }
  return failures as RetrievalEvaluationTunePriorityZeroGate[];
}

function comparable(candidate: RetrievalEvaluationTunePriorityCandidate): RetrievalEvaluationTunePriorityComparable {
  return {
    axes: candidate.axes,
    ndcg_at_k_micros: candidate.ndcg_at_k_micros,
    recall_at_k_micros: candidate.recall_at_k_micros,
    mrr_micros: candidate.mrr_micros,
  };
}

function sealCandidate(value: unknown): RetrievalEvaluationTunePriorityCandidate {
  if (!isPlainDataRecord(value)) fail("GKX_EVAL_TUNE_PRIORITY_CANDIDATE_INVALID");
  exactOwnDataKeys(value, CANDIDATE_KEYS, "GKX_EVAL_TUNE_PRIORITY_CANDIDATE_FIELDS_INVALID");
  return {
    candidate_id: boundedId(ownData(value, "candidate_id", "GKX_EVAL_TUNE_PRIORITY_CANDIDATE_INVALID"),
      "GKX_EVAL_TUNE_PRIORITY_CANDIDATE_ID_INVALID"),
    axes: sealAxes(ownData(value, "axes", "GKX_EVAL_TUNE_PRIORITY_CANDIDATE_INVALID"),
      "GKX_EVAL_TUNE_PRIORITY_CANDIDATE_AXES_INVALID"),
    ndcg_at_k_micros: metric(ownData(value, "ndcg_at_k_micros", "GKX_EVAL_TUNE_PRIORITY_CANDIDATE_INVALID"),
      "GKX_EVAL_TUNE_PRIORITY_CANDIDATE_METRIC_INVALID"),
    recall_at_k_micros: metric(ownData(value, "recall_at_k_micros", "GKX_EVAL_TUNE_PRIORITY_CANDIDATE_INVALID"),
      "GKX_EVAL_TUNE_PRIORITY_CANDIDATE_METRIC_INVALID"),
    mrr_micros: metric(ownData(value, "mrr_micros", "GKX_EVAL_TUNE_PRIORITY_CANDIDATE_INVALID"),
      "GKX_EVAL_TUNE_PRIORITY_CANDIDATE_METRIC_INVALID"),
    zero_gate_failures: sealFailures(ownData(value, "zero_gate_failures", "GKX_EVAL_TUNE_PRIORITY_CANDIDATE_INVALID")),
  };
}

function sealCase(value: unknown): RetrievalEvaluationTunePriorityCase {
  if (!isPlainDataRecord(value)) fail("GKX_EVAL_TUNE_PRIORITY_CASE_INVALID");
  exactOwnDataKeys(value, CASE_KEYS, "GKX_EVAL_TUNE_PRIORITY_CASE_FIELDS_INVALID");
  const caseId = boundedId(ownData(value, "case_id", "GKX_EVAL_TUNE_PRIORITY_CASE_INVALID"),
    "GKX_EVAL_TUNE_PRIORITY_CASE_ID_INVALID");
  const baselineAxes = sealAxes(ownData(value, "baseline_axes", "GKX_EVAL_TUNE_PRIORITY_CASE_INVALID"),
    "GKX_EVAL_TUNE_PRIORITY_BASELINE_AXES_INVALID");
  const baselineNdcg = metric(ownData(value, "baseline_ndcg_at_k_micros", "GKX_EVAL_TUNE_PRIORITY_CASE_INVALID"),
    "GKX_EVAL_TUNE_PRIORITY_BASELINE_METRIC_INVALID");
  const candidates = denseDataArray(ownData(value, "candidates", "GKX_EVAL_TUNE_PRIORITY_CASE_INVALID"), 32,
    "GKX_EVAL_TUNE_PRIORITY_CANDIDATE_COUNT_INVALID").map(sealCandidate);
  const candidateIds = candidates.map((candidate) => candidate.candidate_id);
  if (new Set(candidateIds).size !== candidateIds.length || stableJson(candidateIds) !== stableJson([...candidateIds].sort(retrievalCodeUnitCompare))) {
    fail("GKX_EVAL_TUNE_PRIORITY_CANDIDATE_ORDER_INVALID");
  }
  const axesKeys = candidates.map((candidate) => stableJson(candidate.axes));
  const configKeys = candidates.map((candidate) => stableJson(retrievalEvaluationCandidateConfigMaterial(candidate.axes)));
  if (new Set(axesKeys).size !== candidates.length || new Set(configKeys).size !== candidates.length) {
    fail("GKX_EVAL_TUNE_PRIORITY_DUPLICATE_AXES_INVALID");
  }
  const expectedConforming = sealIdArray(
    ownData(value, "expected_conforming_candidate_ids", "GKX_EVAL_TUNE_PRIORITY_CASE_INVALID"),
    32,
    "GKX_EVAL_TUNE_PRIORITY_CONFORMING_IDS_INVALID",
  );
  const expectedOrdered = sealIdArray(
    ownData(value, "expected_ordered_candidate_ids", "GKX_EVAL_TUNE_PRIORITY_CASE_INVALID"),
    32,
    "GKX_EVAL_TUNE_PRIORITY_ORDERED_IDS_INVALID",
  );
  const rawSelected = ownData(value, "expected_selected_candidate_id", "GKX_EVAL_TUNE_PRIORITY_CASE_INVALID");
  const expectedSelected = rawSelected === null ? null : boundedId(rawSelected, "GKX_EVAL_TUNE_PRIORITY_SELECTED_ID_INVALID");
  const conforming = candidates.filter((candidate) => candidate.zero_gate_failures.length === 0 &&
    candidate.ndcg_at_k_micros >= baselineNdcg);
  const conformingIds = conforming.map((candidate) => candidate.candidate_id).sort(retrievalCodeUnitCompare);
  const ordered = [...conforming].sort((left, right) =>
    compareRetrievalEvaluationTunePriorityCandidates(comparable(left), comparable(right), baselineAxes));
  const orderedIds = ordered.map((candidate) => candidate.candidate_id);
  if (stableJson(expectedConforming) !== stableJson(conformingIds)) fail("GKX_EVAL_TUNE_PRIORITY_CONFORMING_MISMATCH");
  if (stableJson(expectedOrdered) !== stableJson(orderedIds)) fail("GKX_EVAL_TUNE_PRIORITY_ORDER_MISMATCH");
  if (expectedSelected !== (orderedIds[0] ?? null)) fail("GKX_EVAL_TUNE_PRIORITY_SELECTION_MISMATCH");
  const caseDigest = ownData(value, "case_digest", "GKX_EVAL_TUNE_PRIORITY_CASE_INVALID");
  if (typeof caseDigest !== "string" || !DIGEST_RE.test(caseDigest)) fail("GKX_EVAL_TUNE_PRIORITY_CASE_DIGEST_INVALID");
  const material = {
    case_id: caseId,
    baseline_axes: baselineAxes,
    baseline_ndcg_at_k_micros: baselineNdcg,
    candidates,
    expected_conforming_candidate_ids: expectedConforming,
    expected_ordered_candidate_ids: expectedOrdered,
    expected_selected_candidate_id: expectedSelected,
  };
  if (retrievalCanonicalDigest(material) !== caseDigest) fail("GKX_EVAL_TUNE_PRIORITY_CASE_DIGEST_MISMATCH");
  return { ...material, case_digest: caseDigest };
}

export function sealRetrievalEvaluationTunePriorityFixture(value: unknown): RetrievalEvaluationTunePriorityFixture {
  if (!isPlainDataRecord(value)) fail("GKX_EVAL_TUNE_PRIORITY_FIXTURE_INVALID");
  exactOwnDataKeys(value, ["contract_version", "cases", "fixture_digest"], "GKX_EVAL_TUNE_PRIORITY_FIXTURE_FIELDS_INVALID");
  if (ownData(value, "contract_version", "GKX_EVAL_TUNE_PRIORITY_FIXTURE_INVALID") !==
      RETRIEVAL_EVALUATION_TUNE_PRIORITY_FIXTURE_VERSION) fail("GKX_EVAL_TUNE_PRIORITY_FIXTURE_VERSION_INVALID");
  const cases = denseDataArray(ownData(value, "cases", "GKX_EVAL_TUNE_PRIORITY_FIXTURE_INVALID"), 32,
    "GKX_EVAL_TUNE_PRIORITY_CASE_COUNT_INVALID").map(sealCase);
  const caseIds = cases.map((item) => item.case_id);
  if (new Set(caseIds).size !== caseIds.length || stableJson(caseIds) !== stableJson([...caseIds].sort(retrievalCodeUnitCompare))) {
    fail("GKX_EVAL_TUNE_PRIORITY_CASE_ORDER_INVALID");
  }
  const fixtureDigest = ownData(value, "fixture_digest", "GKX_EVAL_TUNE_PRIORITY_FIXTURE_INVALID");
  if (typeof fixtureDigest !== "string" || !DIGEST_RE.test(fixtureDigest)) fail("GKX_EVAL_TUNE_PRIORITY_FIXTURE_DIGEST_INVALID");
  const material = { contract_version: RETRIEVAL_EVALUATION_TUNE_PRIORITY_FIXTURE_VERSION, cases };
  if (retrievalCanonicalDigest(material) !== fixtureDigest) fail("GKX_EVAL_TUNE_PRIORITY_FIXTURE_DIGEST_MISMATCH");
  return { ...material, fixture_digest: fixtureDigest };
}
