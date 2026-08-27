import { canonicalSha256, canonicalizeValue, deepFreeze } from "../canonical";
import { codeUnitCompare } from "../paths";
import {
  ADMISSION_POLICY_CONTRACT,
  ADMISSION_POLICY_CONTRACT_VERSION,
  ADMISSION_DECISION_REASON_CODES,
  AdmissionPolicyConfigurationError,
  type AdmissionDecisionReasonCodeV1,
  type AdmissionDecisionReceiptBodyV1,
  type AdmissionDecisionReceiptV1,
  type AdmissionEvaluationRequestV1,
  type AdmissionHashInputV1,
  type AdmissionPolicyBundleV1,
  type AdmissionPolicyValidationResult,
  type AdmissionTriggerV1,
  type ReviewerRecommendedLane,
} from "./types";

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,254}$/;

/** These pins are hashes of the distributed v1 contract artifacts. */
export const ADMISSION_POLICY_SCHEMA_HASHES = deepFreeze({
  request: "sha256:2288ae493a6fb3e60e0a6c5b89880c5c8f38c735c13949b7b8c67d309dada2f1",
  policy: "sha256:e08dd3d96c770a3568bae4ecf9bea37addde944c2c806d2467eac565588b8d48",
  decisionReceipt: "sha256:db32e1fc39233b09ba746be9123912bb0c47a1246e2609e992e02e090d66befb",
});

export const ADMISSION_POLICY_REASON_CODES_HASH = "sha256:5ce8da908102ddeebacb46d1aba0f62bb1776d7416fad89e4c8c5aae4f51a8e3";
export const ADMISSION_POLICY_SEMANTIC_RULES_HASH = "sha256:e191a663d29dd2e7f41a1e6b2881ddf4a01190498c980346799209e861246aae";

const POLICY_KEYS = [
  "schema", "contract", "contractVersion", "policyId", "policyVersion", "provider", "engine",
  "schemaHashes", "reasonCodesHash", "semanticRulesHash", "dependencyClosure", "priorityTriggerCodes", "humanReviewTriggerCodes", "autoAllowlist",
] as const;
const REQUEST_KEYS = [
  "schema", "contract", "contractVersion", "requestId", "idempotencyKey", "subject", "policyRef",
  "inputHashes", "validity", "artifact", "deterministicChecks", "reviewer",
] as const;
const RECEIPT_KEYS = [
  "schema", "contract", "contractVersion", "requestId", "idempotencyKey", "subjectId", "provider", "engine",
  "schemaHashes", "reasonCodesHash", "semanticRulesHash", "policy", "dependencyClosureHash", "requestHash", "inputHashes",
  "reviewerAssessmentHash", "reviewerRecommendedLane", "stage", "outcome", "reasonCodes", "triggerCodes",
  "validationIssues", "authorityState", "materializationAuthorized", "decisionReceiptHash",
] as const;
const DECISION_REASON_CODES = new Set<AdmissionDecisionReasonCodeV1>(ADMISSION_DECISION_REASON_CODES);
const INVALID_DECISION_REASON_CODES = new Set<AdmissionDecisionReasonCodeV1>([
  "INVALID_REQUEST_SCHEMA",
  "CONTRACT_BINDING_MISMATCH",
  "POLICY_BINDING_MISMATCH",
  "VALIDITY_GATE_FAILED",
  "UNKNOWN_TRIGGER_CODE",
]);
const HUMAN_DECISION_REASON_CODES = new Set<AdmissionDecisionReasonCodeV1>([
  "HUMAN_REVIEW_TRIGGER",
  "ARTIFACT_TYPE_NOT_ALLOWED",
  "REVIEWER_INDEPENDENCE_FAILED",
  "REVIEWER_CHECK_CONFLICT",
  "UNSUPPORTED_CLAIMS_PRESENT",
  "CONTRADICTION_PRESENT",
  "SCOPE_MISMATCH",
  "NOT_REVERSIBLE",
  "NOT_RECONSTRUCTABLE",
]);

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string, issues: string[]): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(`${path}.${key}:unknown-field`);
  for (const key of keys) if (!(key in value)) issues.push(`${path}.${key}:missing`);
}

function stringField(value: unknown, path: string, issues: string[], pattern: RegExp = TOKEN_RE): value is string {
  if (typeof value !== "string" || !pattern.test(value)) {
    issues.push(`${path}:invalid-string`);
    return false;
  }
  return true;
}

function booleanField(value: unknown, path: string, issues: string[]): value is boolean {
  if (typeof value !== "boolean") {
    issues.push(`${path}:invalid-boolean`);
    return false;
  }
  return true;
}

function hashField(value: unknown, path: string, issues: string[]): value is string {
  return stringField(value, path, issues, SHA256_RE);
}

function validateIdentity(value: unknown, path: string, issues: string[]): void {
  const item = record(value);
  if (!item) {
    issues.push(`${path}:invalid-object`);
    return;
  }
  exactKeys(item, ["id", "version", "digest"], path, issues);
  stringField(item.id, `${path}.id`, issues);
  stringField(item.version, `${path}.version`, issues);
  hashField(item.digest, `${path}.digest`, issues);
}

function validateEngine(value: unknown, path: string, issues: string[]): void {
  const item = record(value);
  if (!item) {
    issues.push(`${path}:invalid-object`);
    return;
  }
  exactKeys(item, ["name", "version", "commit"], path, issues);
  stringField(item.name, `${path}.name`, issues);
  stringField(item.version, `${path}.version`, issues);
  stringField(item.commit, `${path}.commit`, issues, COMMIT_RE);
}

function validateSchemaHashes(value: unknown, path: string, issues: string[]): void {
  const item = record(value);
  if (!item) {
    issues.push(`${path}:invalid-object`);
    return;
  }
  exactKeys(item, ["request", "policy", "decisionReceipt"], path, issues);
  hashField(item.request, `${path}.request`, issues);
  hashField(item.policy, `${path}.policy`, issues);
  hashField(item.decisionReceipt, `${path}.decisionReceipt`, issues);
}

function validateUniqueStrings(value: unknown, path: string, issues: string[], allowEmpty = true): void {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    issues.push(`${path}:invalid-array`);
    return;
  }
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!stringField(entry, `${path}[${index}]`, issues)) continue;
    if (seen.has(entry)) issues.push(`${path}[${index}]:duplicate`);
    seen.add(entry);
  }
}

function validateUniqueMessages(value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path}:invalid-array`);
    return;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.length === 0) issues.push(`${path}[${index}]:invalid-string`);
    else if (seen.has(entry)) issues.push(`${path}[${index}]:duplicate`);
    seen.add(String(entry));
  });
}

function validateHashInputs(value: unknown, path: string, issues: string[], allowEmpty = false): void {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    issues.push(`${path}:invalid-array`);
    return;
  }
  const names = new Set<string>();
  value.forEach((raw, index) => {
    const item = record(raw);
    const itemPath = `${path}[${index}]`;
    if (!item) {
      issues.push(`${itemPath}:invalid-object`);
      return;
    }
    exactKeys(item, ["name", "digest"], itemPath, issues);
    if (stringField(item.name, `${itemPath}.name`, issues)) {
      if (names.has(item.name)) issues.push(`${itemPath}.name:duplicate`);
      names.add(item.name);
    }
    hashField(item.digest, `${itemPath}.digest`, issues);
  });
}

function validateTriggers(value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path}:invalid-array`);
    return;
  }
  const codes = new Set<string>();
  value.forEach((raw, index) => {
    const item = record(raw);
    const itemPath = `${path}[${index}]`;
    if (!item) {
      issues.push(`${itemPath}:invalid-object`);
      return;
    }
    exactKeys(item, ["code", "evidenceHash"], itemPath, issues);
    if (stringField(item.code, `${itemPath}.code`, issues)) {
      if (codes.has(item.code)) issues.push(`${itemPath}.code:duplicate`);
      codes.add(item.code);
    }
    hashField(item.evidenceHash, `${itemPath}.evidenceHash`, issues);
  });
}

function validatePolicy(value: unknown): string[] {
  const issues: string[] = [];
  const policy = record(value);
  if (!policy) return ["policy:invalid-object"];
  exactKeys(policy, POLICY_KEYS, "policy", issues);
  if (policy.schema !== "gkos.admission-policy.policy.v1") issues.push("policy.schema:invalid-constant");
  if (policy.contract !== ADMISSION_POLICY_CONTRACT) issues.push("policy.contract:invalid-constant");
  if (policy.contractVersion !== ADMISSION_POLICY_CONTRACT_VERSION) issues.push("policy.contractVersion:invalid-constant");
  stringField(policy.policyId, "policy.policyId", issues);
  stringField(policy.policyVersion, "policy.policyVersion", issues);
  validateIdentity(policy.provider, "policy.provider", issues);
  validateEngine(policy.engine, "policy.engine", issues);
  validateSchemaHashes(policy.schemaHashes, "policy.schemaHashes", issues);
  hashField(policy.reasonCodesHash, "policy.reasonCodesHash", issues);
  hashField(policy.semanticRulesHash, "policy.semanticRulesHash", issues);
  if (!Array.isArray(policy.dependencyClosure) || policy.dependencyClosure.length === 0) {
    issues.push("policy.dependencyClosure:invalid-array");
  } else {
    const identities = new Set<string>();
    policy.dependencyClosure.forEach((dependency, index) => {
      const before = issues.length;
      validateIdentity(dependency, `policy.dependencyClosure[${index}]`, issues);
      const item = record(dependency);
      if (item && issues.length === before) {
        const identity = `${item.id}\u0000${item.version}`;
        if (identities.has(identity)) issues.push(`policy.dependencyClosure[${index}]:duplicate`);
        identities.add(identity);
      }
    });
  }
  validateUniqueStrings(policy.autoAllowlist, "policy.autoAllowlist", issues);
  validateUniqueStrings(policy.priorityTriggerCodes, "policy.priorityTriggerCodes", issues);
  validateUniqueStrings(policy.humanReviewTriggerCodes, "policy.humanReviewTriggerCodes", issues);
  if (Array.isArray(policy.priorityTriggerCodes) && Array.isArray(policy.humanReviewTriggerCodes)) {
    const priorityCodes = new Set(policy.priorityTriggerCodes);
    policy.humanReviewTriggerCodes.forEach((code, index) => {
      if (priorityCodes.has(code)) issues.push(`policy.humanReviewTriggerCodes[${index}]:lane-overlap`);
    });
  }
  if (record(policy.schemaHashes)) {
    for (const key of ["request", "policy", "decisionReceipt"] as const) {
      if (policy.schemaHashes[key] !== ADMISSION_POLICY_SCHEMA_HASHES[key]) {
        issues.push(`policy.schemaHashes.${key}:contract-pin-mismatch`);
      }
    }
  }
  if (policy.reasonCodesHash !== ADMISSION_POLICY_REASON_CODES_HASH) {
    issues.push("policy.reasonCodesHash:contract-pin-mismatch");
  }
  if (policy.semanticRulesHash !== ADMISSION_POLICY_SEMANTIC_RULES_HASH) {
    issues.push("policy.semanticRulesHash:contract-pin-mismatch");
  }
  return [...new Set(issues)].sort(codeUnitCompare);
}

function validateRequest(value: unknown): string[] {
  const issues: string[] = [];
  const request = record(value);
  if (!request) return ["request:invalid-object"];
  exactKeys(request, REQUEST_KEYS, "request", issues);
  if (request.schema !== "gkos.admission-policy.request.v1") issues.push("request.schema:invalid-constant");
  if (request.contract !== ADMISSION_POLICY_CONTRACT) issues.push("request.contract:invalid-constant");
  if (request.contractVersion !== ADMISSION_POLICY_CONTRACT_VERSION) issues.push("request.contractVersion:invalid-constant");
  stringField(request.requestId, "request.requestId", issues);
  stringField(request.idempotencyKey, "request.idempotencyKey", issues);

  const subject = record(request.subject);
  if (!subject) issues.push("request.subject:invalid-object");
  else {
    exactKeys(subject, ["id", "type", "contentHash"], "request.subject", issues);
    stringField(subject.id, "request.subject.id", issues);
    stringField(subject.type, "request.subject.type", issues);
    hashField(subject.contentHash, "request.subject.contentHash", issues);
  }

  const policyRef = record(request.policyRef);
  if (!policyRef) issues.push("request.policyRef:invalid-object");
  else {
    exactKeys(policyRef, ["id", "version", "digest"], "request.policyRef", issues);
    stringField(policyRef.id, "request.policyRef.id", issues);
    stringField(policyRef.version, "request.policyRef.version", issues);
    hashField(policyRef.digest, "request.policyRef.digest", issues);
  }
  validateHashInputs(request.inputHashes, "request.inputHashes", issues);

  const validity = record(request.validity);
  if (!validity) issues.push("request.validity:invalid-object");
  else {
    exactKeys(validity, ["valid", "receiptHash"], "request.validity", issues);
    booleanField(validity.valid, "request.validity.valid", issues);
    hashField(validity.receiptHash, "request.validity.receiptHash", issues);
  }

  const artifact = record(request.artifact);
  if (!artifact) issues.push("request.artifact:invalid-object");
  else {
    exactKeys(artifact, ["type", "reversible", "reconstructable"], "request.artifact", issues);
    stringField(artifact.type, "request.artifact.type", issues);
    booleanField(artifact.reversible, "request.artifact.reversible", issues);
    booleanField(artifact.reconstructable, "request.artifact.reconstructable", issues);
  }

  const checks = record(request.deterministicChecks);
  if (!checks) issues.push("request.deterministicChecks:invalid-object");
  else {
    exactKeys(checks, ["receiptHash", "detectedTriggers"], "request.deterministicChecks", issues);
    hashField(checks.receiptHash, "request.deterministicChecks.receiptHash", issues);
    validateTriggers(checks.detectedTriggers, "request.deterministicChecks.detectedTriggers", issues);
  }

  const reviewer = record(request.reviewer);
  if (!reviewer) issues.push("request.reviewer:invalid-object");
  else {
    exactKeys(reviewer, [
      "assessmentHash", "independent", "conflictsWithDeterministicChecks", "unsupportedClaimIds",
      "contradictionIds", "scopeMatch", "recommendedLane",
    ], "request.reviewer", issues);
    hashField(reviewer.assessmentHash, "request.reviewer.assessmentHash", issues);
    booleanField(reviewer.independent, "request.reviewer.independent", issues);
    booleanField(reviewer.conflictsWithDeterministicChecks, "request.reviewer.conflictsWithDeterministicChecks", issues);
    validateUniqueStrings(reviewer.unsupportedClaimIds, "request.reviewer.unsupportedClaimIds", issues);
    validateUniqueStrings(reviewer.contradictionIds, "request.reviewer.contradictionIds", issues);
    booleanField(reviewer.scopeMatch, "request.reviewer.scopeMatch", issues);
    if (!["AUTO_ADMIT_CANDIDATE", "HUMAN_REVIEW", "PRIORITY_HUMAN_REVIEW"].includes(String(reviewer.recommendedLane))) {
      issues.push("request.reviewer.recommendedLane:invalid-enum");
    }
  }
  return [...new Set(issues)].sort(codeUnitCompare);
}

export function validateAdmissionPolicyBundle(value: unknown): AdmissionPolicyValidationResult {
  const issues = validatePolicy(value);
  return deepFreeze({ valid: issues.length === 0, issues });
}

export function validateAdmissionEvaluationRequest(value: unknown): AdmissionPolicyValidationResult {
  const issues = validateRequest(value);
  return deepFreeze({ valid: issues.length === 0, issues });
}

function validateNullableToken(value: unknown, path: string, issues: string[]): void {
  if (value !== null) stringField(value, path, issues);
}

function validateReceiptShape(value: unknown): string[] {
  const issues: string[] = [];
  const receipt = record(value);
  if (!receipt) return ["receipt:invalid-object"];
  exactKeys(receipt, RECEIPT_KEYS, "receipt", issues);
  if (receipt.schema !== "gkos.admission-policy.decision-receipt.v1") issues.push("receipt.schema:invalid-constant");
  if (receipt.contract !== ADMISSION_POLICY_CONTRACT) issues.push("receipt.contract:invalid-constant");
  if (receipt.contractVersion !== ADMISSION_POLICY_CONTRACT_VERSION) issues.push("receipt.contractVersion:invalid-constant");
  validateNullableToken(receipt.requestId, "receipt.requestId", issues);
  validateNullableToken(receipt.idempotencyKey, "receipt.idempotencyKey", issues);
  validateNullableToken(receipt.subjectId, "receipt.subjectId", issues);
  validateIdentity(receipt.provider, "receipt.provider", issues);
  validateEngine(receipt.engine, "receipt.engine", issues);
  validateSchemaHashes(receipt.schemaHashes, "receipt.schemaHashes", issues);
  hashField(receipt.reasonCodesHash, "receipt.reasonCodesHash", issues);
  hashField(receipt.semanticRulesHash, "receipt.semanticRulesHash", issues);
  const receiptSchemaHashes = record(receipt.schemaHashes);
  if (receiptSchemaHashes) {
    for (const key of ["request", "policy", "decisionReceipt"] as const) {
      if (receiptSchemaHashes[key] !== ADMISSION_POLICY_SCHEMA_HASHES[key]) {
        issues.push(`receipt.schemaHashes.${key}:contract-pin-mismatch`);
      }
    }
  }
  if (receipt.reasonCodesHash !== ADMISSION_POLICY_REASON_CODES_HASH) {
    issues.push("receipt.reasonCodesHash:contract-pin-mismatch");
  }
  if (receipt.semanticRulesHash !== ADMISSION_POLICY_SEMANTIC_RULES_HASH) {
    issues.push("receipt.semanticRulesHash:contract-pin-mismatch");
  }
  validateIdentity(receipt.policy, "receipt.policy", issues);
  hashField(receipt.dependencyClosureHash, "receipt.dependencyClosureHash", issues);
  hashField(receipt.requestHash, "receipt.requestHash", issues);
  validateHashInputs(receipt.inputHashes, "receipt.inputHashes", issues, true);
  if (receipt.reviewerAssessmentHash !== null) hashField(receipt.reviewerAssessmentHash, "receipt.reviewerAssessmentHash", issues);
  if (receipt.reviewerRecommendedLane !== null && ![
    "AUTO_ADMIT_CANDIDATE", "HUMAN_REVIEW", "PRIORITY_HUMAN_REVIEW",
  ].includes(String(receipt.reviewerRecommendedLane))) issues.push("receipt.reviewerRecommendedLane:invalid-enum");
  if (!["PRE_ADJUDICATION", "ADJUDICATION"].includes(String(receipt.stage))) issues.push("receipt.stage:invalid-enum");
  if (!["AUTO_ADMIT_DERIVED", "HUMAN_REVIEW", "PRIORITY_HUMAN_REVIEW", "REVIEW_INVALID"].includes(String(receipt.outcome))) {
    issues.push("receipt.outcome:invalid-enum");
  }
  if (receipt.outcome === "REVIEW_INVALID" && receipt.stage !== "PRE_ADJUDICATION") issues.push("receipt.stage:invalid-for-outcome");
  if (receipt.outcome !== "REVIEW_INVALID" && receipt.stage !== "ADJUDICATION") issues.push("receipt.stage:invalid-for-outcome");
  if (!Array.isArray(receipt.reasonCodes) || receipt.reasonCodes.length === 0) issues.push("receipt.reasonCodes:invalid-array");
  else {
    const seen = new Set<string>();
    receipt.reasonCodes.forEach((code, index) => {
      if (typeof code !== "string" || !DECISION_REASON_CODES.has(code as AdmissionDecisionReasonCodeV1)) {
        issues.push(`receipt.reasonCodes[${index}]:invalid-enum`);
      } else if (seen.has(code)) issues.push(`receipt.reasonCodes[${index}]:duplicate`);
      seen.add(String(code));
    });
  }
  if (Array.isArray(receipt.reasonCodes)) {
    const reasons = receipt.reasonCodes as AdmissionDecisionReasonCodeV1[];
    const exactReason = (expected: AdmissionDecisionReasonCodeV1): boolean =>
      reasons.length === 1 && reasons[0] === expected;
    const onlyReasonsFrom = (allowed: Set<AdmissionDecisionReasonCodeV1>): boolean =>
      reasons.length > 0 && reasons.every((reason) => allowed.has(reason));
    if (receipt.outcome === "REVIEW_INVALID" && !onlyReasonsFrom(INVALID_DECISION_REASON_CODES)) {
      issues.push("receipt.reasonCodes:invalid-for-outcome");
    } else if (receipt.outcome === "PRIORITY_HUMAN_REVIEW" && !exactReason("PRIORITY_TRIGGER")) {
      issues.push("receipt.reasonCodes:invalid-for-outcome");
    } else if (receipt.outcome === "HUMAN_REVIEW" && !onlyReasonsFrom(HUMAN_DECISION_REASON_CODES)) {
      issues.push("receipt.reasonCodes:invalid-for-outcome");
    } else if (receipt.outcome === "AUTO_ADMIT_DERIVED" && !exactReason("AUTO_ALLOWLIST_MATCH")) {
      issues.push("receipt.reasonCodes:invalid-for-outcome");
    }
  }
  validateUniqueStrings(receipt.triggerCodes, "receipt.triggerCodes", issues);
  validateUniqueMessages(receipt.validationIssues, "receipt.validationIssues", issues);
  if (Array.isArray(receipt.triggerCodes)) {
    if (receipt.outcome === "AUTO_ADMIT_DERIVED" && receipt.triggerCodes.length !== 0) {
      issues.push("receipt.triggerCodes:invalid-for-outcome");
    } else if (receipt.outcome === "PRIORITY_HUMAN_REVIEW" && receipt.triggerCodes.length === 0) {
      issues.push("receipt.triggerCodes:invalid-for-outcome");
    }
  }
  if (Array.isArray(receipt.validationIssues)
    && receipt.outcome !== "REVIEW_INVALID"
    && receipt.validationIssues.length !== 0) {
    issues.push("receipt.validationIssues:invalid-for-outcome");
  }
  if (receipt.authorityState !== "NONE") issues.push("receipt.authorityState:invalid-constant");
  if (receipt.materializationAuthorized !== false) issues.push("receipt.materializationAuthorized:invalid-constant");
  hashField(receipt.decisionReceiptHash, "receipt.decisionReceiptHash", issues);
  return [...new Set(issues)].sort(codeUnitCompare);
}

/** Strictly validate the receipt shape and its self-binding digest. */
export async function validateAdmissionDecisionReceipt(value: unknown): Promise<AdmissionPolicyValidationResult> {
  const issues = validateReceiptShape(value);
  const receiptRecord = record(value);
  if (receiptRecord && typeof receiptRecord.decisionReceiptHash === "string" && SHA256_RE.test(receiptRecord.decisionReceiptHash)) {
    const receipt = value as AdmissionDecisionReceiptV1;
    const { decisionReceiptHash, ...body } = receipt;
    try {
      if (await canonicalSha256(body) !== decisionReceiptHash) issues.push("receipt.decisionReceiptHash:mismatch");
    } catch {
      issues.push("receipt:non-canonical");
    }
  }
  const uniqueIssues = [...new Set(issues)].sort(codeUnitCompare);
  return deepFreeze({ valid: uniqueIssues.length === 0, issues: uniqueIssues });
}

function safeToken(value: unknown): string | null {
  return typeof value === "string" && TOKEN_RE.test(value) ? value : null;
}

function safeHash(value: unknown): string | null {
  return typeof value === "string" && SHA256_RE.test(value) ? value : null;
}

function safeRecommendedLane(value: unknown): ReviewerRecommendedLane | null {
  return ["AUTO_ADMIT_CANDIDATE", "HUMAN_REVIEW", "PRIORITY_HUMAN_REVIEW"].includes(String(value))
    ? value as ReviewerRecommendedLane
    : null;
}

function safeHashInputs(value: unknown): AdmissionHashInputV1[] {
  if (!Array.isArray(value)) return [];
  const names = new Set<string>();
  return value.flatMap((entry) => {
    const item = record(entry);
    const name = safeToken(item?.name);
    const digest = safeHash(item?.digest);
    if (!name || !digest || names.has(name)) return [];
    names.add(name);
    return [{ name, digest }];
  });
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort(codeUnitCompare);
}

function triggerCodes(values: AdmissionTriggerV1[]): string[] {
  return sortedUnique(values.map((trigger) => trigger.code));
}

async function finishReceipt(body: AdmissionDecisionReceiptBodyV1): Promise<AdmissionDecisionReceiptV1> {
  const decisionReceiptHash = await canonicalSha256(body);
  return deepFreeze({ ...body, decisionReceiptHash });
}

/**
 * Verify only the receipt's shape, contract pins, and self-binding hash.
 * This does not establish that a particular request and policy produced it.
 */
export async function verifyAdmissionDecisionReceiptSelfHash(receipt: AdmissionDecisionReceiptV1): Promise<boolean> {
  return (await validateAdmissionDecisionReceipt(receipt)).valid;
}

/**
 * Backward-compatible self-hash-only verifier. Callers relying on a decision
 * must use verifyAdmissionDecisionReceiptContext instead.
 * @deprecated Use verifyAdmissionDecisionReceiptSelfHash for inspection or
 * verifyAdmissionDecisionReceiptContext for decision reliance.
 */
export async function verifyAdmissionDecisionReceipt(receipt: AdmissionDecisionReceiptV1): Promise<boolean> {
  return verifyAdmissionDecisionReceiptSelfHash(receipt);
}

/**
 * Verify a receipt against its exact request and policy by deterministic replay.
 * No authority is conferred; this only proves contextual consistency.
 */
export async function verifyAdmissionDecisionReceiptContext(
  receipt: AdmissionDecisionReceiptV1,
  requestValue: unknown,
  policyValue: unknown,
): Promise<boolean> {
  if (!(await verifyAdmissionDecisionReceiptSelfHash(receipt))) return false;
  try {
    const replayed = await evaluateAdmissionPolicy(requestValue, policyValue);
    return replayed.decisionReceiptHash === receipt.decisionReceiptHash
      && await canonicalSha256(replayed) === await canonicalSha256(receipt);
  } catch {
    return false;
  }
}

/**
 * Evaluate a ratified bundle without I/O, time, randomness, model calls, writes,
 * materialization, or authority creation. The reviewer lane is evidence only.
 */
export async function evaluateAdmissionPolicy(
  requestValue: unknown,
  policyValue: unknown,
): Promise<AdmissionDecisionReceiptV1> {
  const policyIssues = validatePolicy(policyValue);
  if (policyIssues.length) throw new AdmissionPolicyConfigurationError(policyIssues);
  const policy = policyValue as AdmissionPolicyBundleV1;

  // Canonicalization is deliberately performed before narrowing. Cyclic,
  // non-JSON, or non-finite inputs fail closed by throwing.
  const canonicalRequest = canonicalizeValue(requestValue);
  const requestHash = await canonicalSha256(canonicalRequest);
  const policyHash = await canonicalSha256(policy);
  const dependencyClosureHash = await canonicalSha256(policy.dependencyClosure);
  const requestIssues = validateRequest(requestValue);
  const rawRequest = record(requestValue);
  const rawReviewer = record(rawRequest?.reviewer);

  if (requestIssues.length) {
    return finishReceipt({
      schema: "gkos.admission-policy.decision-receipt.v1",
      contract: ADMISSION_POLICY_CONTRACT,
      contractVersion: ADMISSION_POLICY_CONTRACT_VERSION,
      requestId: safeToken(rawRequest?.requestId),
      idempotencyKey: safeToken(rawRequest?.idempotencyKey),
      subjectId: safeToken(record(rawRequest?.subject)?.id),
      provider: { ...policy.provider },
      engine: { ...policy.engine },
      schemaHashes: { ...policy.schemaHashes },
      reasonCodesHash: policy.reasonCodesHash,
      semanticRulesHash: policy.semanticRulesHash,
      policy: { id: policy.policyId, version: policy.policyVersion, digest: policyHash },
      dependencyClosureHash,
      requestHash,
      inputHashes: safeHashInputs(rawRequest?.inputHashes),
      reviewerAssessmentHash: safeHash(rawReviewer?.assessmentHash),
      reviewerRecommendedLane: safeRecommendedLane(rawReviewer?.recommendedLane),
      stage: "PRE_ADJUDICATION",
      outcome: "REVIEW_INVALID",
      reasonCodes: ["INVALID_REQUEST_SCHEMA"],
      triggerCodes: [],
      validationIssues: requestIssues,
      authorityState: "NONE",
      materializationAuthorized: false,
    });
  }

  const request = requestValue as AdmissionEvaluationRequestV1;
  const bindingIssues: string[] = [];
  if (request.contract !== policy.contract || request.contractVersion !== policy.contractVersion) {
    bindingIssues.push("request.contract:policy-mismatch");
  }
  if (request.policyRef.id !== policy.policyId || request.policyRef.version !== policy.policyVersion || request.policyRef.digest !== policyHash) {
    bindingIssues.push("request.policyRef:policy-mismatch");
  }
  if (bindingIssues.length || !request.validity.valid) {
    const reasonCodes: AdmissionDecisionReasonCodeV1[] = [];
    if (bindingIssues.some((issue) => issue.startsWith("request.contract"))) reasonCodes.push("CONTRACT_BINDING_MISMATCH");
    if (bindingIssues.some((issue) => issue.startsWith("request.policyRef"))) reasonCodes.push("POLICY_BINDING_MISMATCH");
    if (!request.validity.valid) reasonCodes.push("VALIDITY_GATE_FAILED");
    return finishReceipt({
      schema: "gkos.admission-policy.decision-receipt.v1",
      contract: ADMISSION_POLICY_CONTRACT,
      contractVersion: ADMISSION_POLICY_CONTRACT_VERSION,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      subjectId: request.subject.id,
      provider: { ...policy.provider },
      engine: { ...policy.engine },
      schemaHashes: { ...policy.schemaHashes },
      reasonCodesHash: policy.reasonCodesHash,
      semanticRulesHash: policy.semanticRulesHash,
      policy: { id: policy.policyId, version: policy.policyVersion, digest: policyHash },
      dependencyClosureHash,
      requestHash,
      inputHashes: request.inputHashes.map((item) => ({ ...item })),
      reviewerAssessmentHash: request.reviewer.assessmentHash,
      reviewerRecommendedLane: request.reviewer.recommendedLane,
      stage: "PRE_ADJUDICATION",
      outcome: "REVIEW_INVALID",
      reasonCodes: sortedUnique(reasonCodes) as AdmissionDecisionReasonCodeV1[],
      triggerCodes: [],
      validationIssues: bindingIssues.sort(codeUnitCompare),
      authorityState: "NONE",
      materializationAuthorized: false,
    });
  }

  const knownTriggerCodes = new Set([...policy.priorityTriggerCodes, ...policy.humanReviewTriggerCodes]);
  const triggers = triggerCodes(request.deterministicChecks.detectedTriggers);
  const unknownTriggerCodes = triggers.filter((code) => !knownTriggerCodes.has(code));
  if (unknownTriggerCodes.length > 0) {
    return finishReceipt({
      schema: "gkos.admission-policy.decision-receipt.v1",
      contract: ADMISSION_POLICY_CONTRACT,
      contractVersion: ADMISSION_POLICY_CONTRACT_VERSION,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      subjectId: request.subject.id,
      provider: { ...policy.provider },
      engine: { ...policy.engine },
      schemaHashes: { ...policy.schemaHashes },
      reasonCodesHash: policy.reasonCodesHash,
      semanticRulesHash: policy.semanticRulesHash,
      policy: { id: policy.policyId, version: policy.policyVersion, digest: policyHash },
      dependencyClosureHash,
      requestHash,
      inputHashes: request.inputHashes.map((item) => ({ ...item })),
      reviewerAssessmentHash: request.reviewer.assessmentHash,
      reviewerRecommendedLane: request.reviewer.recommendedLane,
      stage: "PRE_ADJUDICATION",
      outcome: "REVIEW_INVALID",
      reasonCodes: ["UNKNOWN_TRIGGER_CODE"],
      triggerCodes: unknownTriggerCodes,
      validationIssues: unknownTriggerCodes.map((code) => `request.deterministicChecks.detectedTriggers:unknown-code:${code}`),
      authorityState: "NONE",
      materializationAuthorized: false,
    });
  }

  const priorityTriggers = triggers.filter((code) => policy.priorityTriggerCodes.includes(code));
  const humanTriggers = triggers.filter((code) => policy.humanReviewTriggerCodes.includes(code));
  const reasons: AdmissionDecisionReasonCodeV1[] = [];
  let outcome: AdmissionDecisionReceiptV1["outcome"];
  if (priorityTriggers.length > 0) {
    outcome = "PRIORITY_HUMAN_REVIEW";
    reasons.push("PRIORITY_TRIGGER");
  } else {
    if (humanTriggers.length > 0) reasons.push("HUMAN_REVIEW_TRIGGER");
    if (!policy.autoAllowlist.includes(request.artifact.type)) reasons.push("ARTIFACT_TYPE_NOT_ALLOWED");
    if (!request.reviewer.independent) reasons.push("REVIEWER_INDEPENDENCE_FAILED");
    if (request.reviewer.conflictsWithDeterministicChecks) reasons.push("REVIEWER_CHECK_CONFLICT");
    if (request.reviewer.unsupportedClaimIds.length > 0) reasons.push("UNSUPPORTED_CLAIMS_PRESENT");
    if (request.reviewer.contradictionIds.length > 0) reasons.push("CONTRADICTION_PRESENT");
    if (!request.reviewer.scopeMatch) reasons.push("SCOPE_MISMATCH");
    if (!request.artifact.reversible) reasons.push("NOT_REVERSIBLE");
    if (!request.artifact.reconstructable) reasons.push("NOT_RECONSTRUCTABLE");
    if (reasons.length > 0) outcome = "HUMAN_REVIEW";
    else {
      outcome = "AUTO_ADMIT_DERIVED";
      reasons.push("AUTO_ALLOWLIST_MATCH");
    }
  }

  const body: AdmissionDecisionReceiptBodyV1 = {
    schema: "gkos.admission-policy.decision-receipt.v1",
    contract: ADMISSION_POLICY_CONTRACT,
    contractVersion: ADMISSION_POLICY_CONTRACT_VERSION,
    requestId: request.requestId,
    idempotencyKey: request.idempotencyKey,
    subjectId: request.subject.id,
    provider: { ...policy.provider },
    engine: { ...policy.engine },
    schemaHashes: { ...policy.schemaHashes },
    reasonCodesHash: policy.reasonCodesHash,
    semanticRulesHash: policy.semanticRulesHash,
    policy: { id: policy.policyId, version: policy.policyVersion, digest: policyHash },
    dependencyClosureHash,
    requestHash,
    inputHashes: request.inputHashes.map((item) => ({ ...item })),
    reviewerAssessmentHash: request.reviewer.assessmentHash,
    reviewerRecommendedLane: request.reviewer.recommendedLane as ReviewerRecommendedLane,
    stage: "ADJUDICATION",
    outcome,
    reasonCodes: sortedUnique(reasons) as AdmissionDecisionReasonCodeV1[],
    triggerCodes: triggers,
    validationIssues: [],
    authorityState: "NONE",
    materializationAuthorized: false,
  };
  return finishReceipt(body);
}
