import { contentHash, codeUnitCompare } from "../paths";
import type { GkxSensitivity } from "../types";
import { canonicalizeScientificRecord } from "./canonicalize";
import {
  EXPERIMENTAL_SRTP_PROFILE,
  type ExecutionManifest,
  type RerunComparison,
  type RerunComparisonPolicy,
  type RerunComponentComparison,
  type ScientificAssessmentStatus,
} from "./types";
import { scienceDiagnostic } from "./validate";

const SENSITIVITY: GkxSensitivity[] = ["public", "internal", "restricted", "confidential", "regulated", "phi", "secret"];

function exact(component: string, a: unknown, b: unknown, policy: RerunComparisonPolicy | undefined): RerunComponentComparison {
  const nondeterministic = policy?.nondeterministicComponents?.includes(component);
  if (nondeterministic) return { component, comparison: "declared_nondeterministic", status: "INDETERMINATE", diagnostics: [], evidenceRefs: [], expected: a, actual: b };
  if (a === undefined && b === undefined) return { component, comparison: "unavailable", status: "UNEVALUATED", diagnostics: [scienceDiagnostic("GKX-SCIENCE-RERUN-004", "warning", `${component} evidence is unavailable in both runs.`, component)], evidenceRefs: [] };
  if (a === undefined || b === undefined) return { component, comparison: "unavailable", status: "FAIL", diagnostics: [scienceDiagnostic("GKX-SCIENCE-RERUN-002", "error", `${component} is present in only one run.`, component)], evidenceRefs: [], expected: a, actual: b };
  const same = canonicalizeScientificRecord(a) === canonicalizeScientificRecord(b);
  return { component, comparison: "exact", status: same ? "PASS" : "FAIL", diagnostics: same ? [] : [scienceDiagnostic("GKX-SCIENCE-RERUN-002", "error", `${component} differs between runs.`, component)], evidenceRefs: [], expected: a, actual: b };
}

function parameterComparisons(a: unknown, b: unknown, policy: RerunComparisonPolicy | undefined, component = "parameters"): RerunComponentComparison[] {
  const objectA = a && typeof a === "object" && !Array.isArray(a) ? a as Record<string, unknown> : undefined;
  const objectB = b && typeof b === "object" && !Array.isArray(b) ? b as Record<string, unknown> : undefined;
  if (objectA || objectB) {
    const keys = [...new Set([...Object.keys(objectA ?? {}), ...Object.keys(objectB ?? {})])].sort(codeUnitCompare);
    if (!keys.length) return [exact(component, a, b, policy)];
    return keys.flatMap((key) => parameterComparisons(objectA?.[key], objectB?.[key], policy, `${component}.${key}`));
  }
  if (policy?.nondeterministicComponents?.includes(component)) return [{ component, comparison: "declared_nondeterministic", status: "INDETERMINATE", diagnostics: [], evidenceRefs: [], expected: a, actual: b }];
  if (typeof a === "number" && typeof b === "number") {
    const configured = typeof policy?.numericTolerance === "number" ? policy.numericTolerance : policy?.numericTolerance?.[component] ?? 0;
    const tolerance = Number.isFinite(configured) && configured >= 0 ? configured : 0;
    const difference = Math.abs(a - b);
    const pass = difference <= tolerance;
    return [{ component, comparison: tolerance ? "numeric_tolerance" : "exact", status: pass ? "PASS" : "FAIL", diagnostics: pass ? [] : [scienceDiagnostic("GKX-SCIENCE-RERUN-003", "error", `${component} differs by ${difference}, exceeding tolerance ${tolerance}.`, component)], evidenceRefs: [], expected: a, actual: b, difference, tolerance }];
  }
  return [exact(component, a, b, policy)];
}

/** Compare declared run evidence; similar prose is never treated as equivalence. */
export function compareScientificRuns(a: ExecutionManifest, b: ExecutionManifest, policy?: RerunComparisonPolicy): RerunComparison {
  const runIdentity: RerunComponentComparison = { component: "runIdentity", comparison: "exact", status: a.id !== b.id ? "PASS" : "FAIL", diagnostics: a.id !== b.id ? [] : [scienceDiagnostic("GKX-SCIENCE-RERUN-006", "error", "A rerun comparison requires two distinct run identities.", "runIdentity")], evidenceRefs: [], expected: a.id, actual: b.id };
  const components: RerunComponentComparison[] = [
    runIdentity,
    exact("inputs", [...a.inputRefs].sort(codeUnitCompare), [...b.inputRefs].sort(codeUnitCompare), policy),
    exact("inputDigests", a.inputDigests, b.inputDigests, policy),
    exact("code", [...a.codeRefs].sort(codeUnitCompare), [...b.codeRefs].sort(codeUnitCompare), policy),
    exact("codeDigests", a.codeDigests, b.codeDigests, policy),
    exact("environment", a.environmentRef, b.environmentRef, policy),
    exact("environmentDigest", a.environmentDigest, b.environmentDigest, policy),
    exact("seed", a.seed, b.seed, policy),
    ...parameterComparisons(a.parameters, b.parameters, policy),
    exact("artifacts", [...a.artifactRefs].sort(codeUnitCompare), [...b.artifactRefs].sort(codeUnitCompare), policy),
    exact("artifactDigests", a.artifactRefs.length || b.artifactRefs.length ? a.artifactDigests : {}, a.artifactRefs.length || b.artifactRefs.length ? b.artifactDigests : {}, policy),
  ].sort((left, right) => codeUnitCompare(left.component, right.component));
  if (!policy) components.unshift({ component: "policy", comparison: "unavailable", status: "UNEVALUATED", diagnostics: [scienceDiagnostic("GKX-SCIENCE-RERUN-001", "warning", "Rerun comparison policy is missing.", "policy")], evidenceRefs: [] });
  else {
    const tolerances = typeof policy.numericTolerance === "number" ? [policy.numericTolerance] : Object.values(policy.numericTolerance ?? {});
    if (!policy.id || tolerances.some((value) => !Number.isFinite(value) || value < 0)) components.unshift({ component: "policy", comparison: "unavailable", status: "FAIL", diagnostics: [scienceDiagnostic("GKX-SCIENCE-RERUN-005", "error", "Rerun policy id and tolerances must be present, finite, and non-negative.", "policy")], evidenceRefs: [] });
  }
  let overall: ScientificAssessmentStatus = "PASS";
  if (components.some((entry) => entry.status === "FAIL")) overall = "FAIL";
  else if (components.some((entry) => entry.status === "INDETERMINATE")) overall = "INDETERMINATE";
  else if (components.some((entry) => entry.status === "UNEVALUATED")) overall = "UNEVALUATED";
  const material = canonicalizeScientificRecord({ a: a.id, b: b.id, policy: policy?.id ?? "missing" });
  const sensitivityRanks = [SENSITIVITY.indexOf(a.sensitivity), SENSITIVITY.indexOf(b.sensitivity)];
  const sensitivity = sensitivityRanks.some((rank) => rank < 0) ? "secret" : SENSITIVITY[Math.max(...sensitivityRanks)];
  const createdAt = [a.createdAt, b.createdAt].sort((left, right) => Date.parse(left) - Date.parse(right) || codeUnitCompare(left, right)).at(-1)!;
  return {
    id: `rerun:${contentHash(material)}`,
    kind: "rerun_comparison",
    profile: EXPERIMENTAL_SRTP_PROFILE,
    schemaVersion: "experimental",
    createdAt,
    sensitivity,
    origin: "proposed",
    extensions: {},
    runARef: a.id,
    runBRef: b.id,
    policyId: policy?.id ?? "policy:missing",
    components,
    overall,
  };
}
