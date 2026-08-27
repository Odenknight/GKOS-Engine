import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import { canonicalSha256 } from "../dist/gkos-engine.mjs";
import {
  ADMISSION_DECISION_REASON_CODES,
  ADMISSION_OUTCOMES,
  ADMISSION_POLICY_CONTRACT,
  ADMISSION_POLICY_CONTRACT_VERSION,
  ADMISSION_POLICY_REASON_CODES_HASH,
  ADMISSION_POLICY_SCHEMA_HASHES,
  ADMISSION_POLICY_SEMANTIC_RULES_HASH,
  AdmissionPolicyConfigurationError,
  evaluateAdmissionPolicy,
  validateAdmissionDecisionReceipt,
  validateAdmissionEvaluationRequest,
  validateAdmissionPolicyBundle,
  verifyAdmissionDecisionReceipt,
  verifyAdmissionDecisionReceiptContext,
  verifyAdmissionDecisionReceiptSelfHash,
} from "gkos-engine/admission-policy";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractDir = join(root, "contracts", "admission-policy", "1.0.0");
const vectorDir = join(contractDir, "vectors");
const load = (path) => JSON.parse(readFileSync(path, "utf8"));
const vector = (name) => load(join(vectorDir, name));
const policy = vector("policy.json");
const sha256 = (path) => `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;

function applyPatches(value, patches) {
  const result = structuredClone(value);
  for (const patch of patches) {
    assert.equal(patch.op, "add");
    const segments = patch.path.split("/").slice(1)
      .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
    const leaf = segments.pop();
    let target = result;
    for (const segment of segments) target = target[segment];
    if (leaf === "-") target.push(structuredClone(patch.value));
    else target[leaf] = structuredClone(patch.value);
  }
  return result;
}

function assertStrictObjects(schema, path = "$") {
  if (!schema || typeof schema !== "object") return;
  if (schema.type === "object") assert.equal(schema.additionalProperties, false, `${path} must reject unknown fields`);
  for (const [key, value] of Object.entries(schema)) {
    if (key !== "properties" || schema.type !== "object") assertStrictObjects(value, `${path}.${key}`);
    else for (const [property, child] of Object.entries(value)) assertStrictObjects(child, `${path}.properties.${property}`);
  }
}

test("distributed schemas and reason registry match runtime pins", () => {
  assert.equal(sha256(join(contractDir, "request.schema.json")), ADMISSION_POLICY_SCHEMA_HASHES.request);
  assert.equal(sha256(join(contractDir, "policy.schema.json")), ADMISSION_POLICY_SCHEMA_HASHES.policy);
  assert.equal(sha256(join(contractDir, "decision-receipt.schema.json")), ADMISSION_POLICY_SCHEMA_HASHES.decisionReceipt);
  assert.equal(sha256(join(contractDir, "reason-codes.json")), ADMISSION_POLICY_REASON_CODES_HASH);
  assert.equal(sha256(join(contractDir, "semantic-validation-rules.json")), ADMISSION_POLICY_SEMANTIC_RULES_HASH);
  for (const name of ["request.schema.json", "policy.schema.json", "decision-receipt.schema.json"]) {
    const schema = load(join(contractDir, name));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assertStrictObjects(schema);
  }
  const requestSchema = load(join(contractDir, "request.schema.json"));
  const policySchema = load(join(contractDir, "policy.schema.json"));
  const receiptSchema = load(join(contractDir, "decision-receipt.schema.json"));
  const reviewerRecommendations = ["AUTO_ADMIT_CANDIDATE", "HUMAN_REVIEW", "PRIORITY_HUMAN_REVIEW"];
  assert.equal(policySchema.properties.contract.const, ADMISSION_POLICY_CONTRACT);
  assert.equal(policySchema.properties.contractVersion.const, ADMISSION_POLICY_CONTRACT_VERSION);
  assert.equal(policySchema.properties.semanticRulesHash.const, ADMISSION_POLICY_SEMANTIC_RULES_HASH);
  assert.equal(receiptSchema.properties.semanticRulesHash.const, ADMISSION_POLICY_SEMANTIC_RULES_HASH);
  assert.deepEqual(requestSchema.properties.reviewer.properties.recommendedLane.enum, reviewerRecommendations);
  assert.deepEqual(receiptSchema.properties.reviewerRecommendedLane.oneOf[0].enum, reviewerRecommendations);
  assert.deepEqual(receiptSchema.properties.outcome.enum, [...ADMISSION_OUTCOMES]);
  assert.deepEqual(receiptSchema.$defs.reasonCode.enum, [...ADMISSION_DECISION_REASON_CODES]);
  assert.deepEqual(load(join(contractDir, "reason-codes.json")).codes.map(({ code }) => code), [...ADMISSION_DECISION_REASON_CODES]);
  assert.deepEqual(receiptSchema.allOf[0].then.properties.reasonCodes.items,
    { $ref: "#/$defs/invalidReasonCode" });
  assert.deepEqual(receiptSchema.allOf[1].then.properties, {
    reasonCodes: { const: ["AUTO_ALLOWLIST_MATCH"] },
    triggerCodes: { type: "array", maxItems: 0 },
    validationIssues: { type: "array", maxItems: 0 },
  });
  assert.deepEqual(receiptSchema.allOf[2].then.properties, {
    reasonCodes: { const: ["PRIORITY_TRIGGER"] },
    triggerCodes: { type: "array", minItems: 1 },
    validationIssues: { type: "array", maxItems: 0 },
  });
  assert.deepEqual(receiptSchema.allOf[3].then.properties.reasonCodes.items,
    { $ref: "#/$defs/humanReasonCode" });
  assert.deepEqual(receiptSchema.allOf[3].then.properties.validationIssues, { type: "array", maxItems: 0 });
  const artifactManifest = load(join(contractDir, "artifact-manifest.json"));
  for (const artifact of artifactManifest.artifacts) {
    const path = join(contractDir, artifact.path);
    assert.equal(readFileSync(path).length, artifact.bytes, artifact.path);
    assert.equal(sha256(path), `sha256:${artifact.sha256}`, artifact.path);
  }
});

test("contract generation is byte-idempotent over its exact artifact closure", () => {
  const manifestPath = join(contractDir, "artifact-manifest.json");
  const beforeManifest = readFileSync(manifestPath);
  const beforeArtifacts = load(manifestPath).artifacts.map(({ path }) => [
    path,
    readFileSync(join(contractDir, path)),
  ]);
  execFileSync(process.execPath, [join(root, "scripts", "generate-admission-policy-v1.mjs")], {
    cwd: root,
    stdio: "pipe",
  });
  assert.deepEqual(readFileSync(manifestPath), beforeManifest);
  for (const [path, bytes] of beforeArtifacts) {
    assert.deepEqual(readFileSync(join(contractDir, path)), bytes, path);
  }
});

test("Draft 2020-12 schemas and mandatory semantic rules reject adversarial vectors", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validators = {
    policy: ajv.compile(load(join(contractDir, "policy.schema.json"))),
    request: ajv.compile(load(join(contractDir, "request.schema.json"))),
    receipt: ajv.compile(load(join(contractDir, "decision-receipt.schema.json"))),
  };
  const semanticRules = load(join(contractDir, "semantic-validation-rules.json"));
  assert.deepEqual(semanticRules.rules.map(({ id }) => id), [
    "POLICY_DEPENDENCY_ID_VERSION_UNIQUE",
    "POLICY_TRIGGER_LANES_DISJOINT",
    "REQUEST_INPUT_NAMES_UNIQUE",
    "REQUEST_TRIGGER_CODES_UNIQUE",
  ]);
  assert.equal(validators.policy(policy), true, JSON.stringify(validators.policy.errors));
  for (const fixture of vector("manifest.json").cases) {
    const request = vector(fixture.requestPath);
    assert.equal(validators.request(request), true, `${fixture.id}: ${JSON.stringify(validators.request.errors)}`);
  }

  const adversarial = vector("adversarial.json");
  for (const fixture of adversarial.cases) {
    const candidate = applyPatches(vector(fixture.basePath), fixture.patches);
    const schemaValid = validators[fixture.document](candidate);
    assert.equal(schemaValid, fixture.schemaValid,
      `${fixture.id}: ${JSON.stringify(validators[fixture.document].errors)}`);
    const result = fixture.document === "policy"
      ? validateAdmissionPolicyBundle(candidate)
      : validateAdmissionEvaluationRequest(candidate);
    assert.equal(result.valid, fixture.semanticValid, `${fixture.id}: ${JSON.stringify(result.issues)}`);
  }
});

test("golden vectors replay to the four allowed outcomes and byte-stable receipts", async () => {
  const manifest = vector("manifest.json");
  assert.equal(await canonicalSha256(policy), manifest.policy.canonicalHash);
  assert.deepEqual(validateAdmissionPolicyBundle(policy), { valid: true, issues: [] });
  for (const fixture of manifest.cases) {
    const request = vector(fixture.requestPath);
    assert.equal(await canonicalSha256(request), fixture.requestHash, fixture.id);
    assert.deepEqual(validateAdmissionEvaluationRequest(request), { valid: true, issues: [] }, fixture.id);
    const receipt = await evaluateAdmissionPolicy(request, policy);
    assert.deepEqual(await evaluateAdmissionPolicy(structuredClone(request), structuredClone(policy)), receipt, fixture.id);
    assert.equal(receipt.outcome, fixture.outcome, fixture.id);
    assert.deepEqual(receipt.reasonCodes, fixture.reasonCodes, fixture.id);
    assert.equal(receipt.decisionReceiptHash, fixture.decisionReceiptHash, fixture.id);
    assert.equal(receipt.authorityState, "NONE");
    assert.equal(receipt.materializationAuthorized, false);
    assert.equal(Object.isFrozen(receipt), true);
    assert.deepEqual(await validateAdmissionDecisionReceipt(receipt), { valid: true, issues: [] });
  }
});

test("priority dominates human and reviewer recommendation never selects a lane", async () => {
  const priority = vector("request-priority-review.json");
  priority.artifact.type = "not_allowlisted";
  priority.artifact.reversible = false;
  priority.reviewer.independent = false;
  const receipt = await evaluateAdmissionPolicy(priority, policy);
  assert.equal(receipt.outcome, "PRIORITY_HUMAN_REVIEW");
  assert.deepEqual(receipt.reasonCodes, ["PRIORITY_TRIGGER"]);
  assert.deepEqual(receipt.triggerCodes, ["new-factual-assertion", "suspected-secret"]);

  const auto = vector("request-auto-admit.json");
  assert.equal(auto.reviewer.recommendedLane, "HUMAN_REVIEW");
  assert.equal((await evaluateAdmissionPolicy(auto, policy)).outcome, "AUTO_ADMIT_DERIVED");
  const human = vector("request-human-review.json");
  assert.equal(human.reviewer.recommendedLane, "AUTO_ADMIT_CANDIDATE");
  assert.equal((await evaluateAdmissionPolicy(human, policy)).outcome, "HUMAN_REVIEW");
});

test("reviewer vocabulary is candidate evidence, never a disposition or validity result", () => {
  for (const lane of ["AUTO_ADMIT_CANDIDATE", "HUMAN_REVIEW", "PRIORITY_HUMAN_REVIEW"]) {
    const request = vector("request-auto-admit.json");
    request.reviewer.recommendedLane = lane;
    assert.deepEqual(validateAdmissionEvaluationRequest(request), { valid: true, issues: [] }, lane);
  }
  for (const forbidden of ["AUTO_ADMIT_DERIVED", "REVIEW_INVALID"]) {
    const request = vector("request-auto-admit.json");
    request.reviewer.recommendedLane = forbidden;
    assert.deepEqual(validateAdmissionEvaluationRequest(request).issues,
      ["request.reviewer.recommendedLane:invalid-enum"], forbidden);
  }
});

test("policy owns closed trigger lanes and a caller cannot downgrade priority", async () => {
  const priority = vector("request-auto-admit.json");
  priority.deterministicChecks.detectedTriggers.push({
    code: "suspected-secret",
    evidenceHash: `sha256:${"2".repeat(64)}`,
  });
  assert.equal((await evaluateAdmissionPolicy(priority, policy)).outcome, "PRIORITY_HUMAN_REVIEW");

  const disguised = vector("request-auto-admit.json");
  disguised.deterministicChecks.detectedTriggers.push({
    code: "ordinary:suspected-secret",
    evidenceHash: `sha256:${"3".repeat(64)}`,
  });
  const invalid = await evaluateAdmissionPolicy(disguised, policy);
  assert.equal(invalid.outcome, "REVIEW_INVALID");
  assert.deepEqual(invalid.reasonCodes, ["UNKNOWN_TRIGGER_CODE"]);

  const oldCallerBucket = vector("request-auto-admit.json");
  oldCallerBucket.deterministicChecks.humanReviewTriggers = [{
    code: "suspected-secret",
    evidenceHash: `sha256:${"4".repeat(64)}`,
  }];
  assert.ok(validateAdmissionEvaluationRequest(oldCallerBucket).issues.includes(
    "request.deterministicChecks.humanReviewTriggers:unknown-field"));

  const overlappingPolicy = structuredClone(policy);
  overlappingPolicy.humanReviewTriggerCodes.push("suspected-secret");
  assert.ok(validateAdmissionPolicyBundle(overlappingPolicy).issues.includes(
    "policy.humanReviewTriggerCodes[2]:lane-overlap"));
});

test("every ordinary prohibition is monotonic", async () => {
  const cases = [
    [(r) => r.deterministicChecks.detectedTriggers.push({ code: "new-factual-assertion", evidenceHash: `sha256:${"1".repeat(64)}` }), "HUMAN_REVIEW_TRIGGER"],
    [(r) => { r.artifact.type = "novel_type"; }, "ARTIFACT_TYPE_NOT_ALLOWED"],
    [(r) => { r.reviewer.independent = false; }, "REVIEWER_INDEPENDENCE_FAILED"],
    [(r) => { r.reviewer.conflictsWithDeterministicChecks = true; }, "REVIEWER_CHECK_CONFLICT"],
    [(r) => r.reviewer.unsupportedClaimIds.push("claim:1"), "UNSUPPORTED_CLAIMS_PRESENT"],
    [(r) => r.reviewer.contradictionIds.push("claim:2"), "CONTRADICTION_PRESENT"],
    [(r) => { r.reviewer.scopeMatch = false; }, "SCOPE_MISMATCH"],
    [(r) => { r.artifact.reversible = false; }, "NOT_REVERSIBLE"],
    [(r) => { r.artifact.reconstructable = false; }, "NOT_RECONSTRUCTABLE"],
  ];
  for (const [mutate, reason] of cases) {
    const request = vector("request-auto-admit.json");
    mutate(request);
    const receipt = await evaluateAdmissionPolicy(request, policy);
    assert.equal(receipt.outcome, "HUMAN_REVIEW", reason);
    assert.ok(receipt.reasonCodes.includes(reason), reason);
  }
});

test("invalid requests quarantine pre-adjudication; invalid policy and non-JSON fail closed", async () => {
  const malformed = vector("request-auto-admit.json");
  malformed.unrecognizedAuthority = true;
  malformed.requestId = "invalid request id";
  malformed.inputHashes[0].digest = "not-a-hash";
  malformed.reviewer.assessmentHash = "not-a-hash";
  malformed.reviewer.recommendedLane = "APPROVE";
  const invalid = await evaluateAdmissionPolicy(malformed, policy);
  assert.equal(invalid.stage, "PRE_ADJUDICATION");
  assert.equal(invalid.outcome, "REVIEW_INVALID");
  assert.deepEqual(invalid.reasonCodes, ["INVALID_REQUEST_SCHEMA"]);
  assert.ok(invalid.validationIssues.includes("request.unrecognizedAuthority:unknown-field"));
  assert.equal(invalid.requestId, null);
  assert.equal(invalid.reviewerAssessmentHash, null);
  assert.equal(invalid.reviewerRecommendedLane, null);
  assert.deepEqual(await validateAdmissionDecisionReceipt(invalid), { valid: true, issues: [] });

  const wrongPolicyRef = vector("request-auto-admit.json");
  wrongPolicyRef.policyRef.digest = `sha256:${"0".repeat(64)}`;
  assert.deepEqual((await evaluateAdmissionPolicy(wrongPolicyRef, policy)).reasonCodes, ["POLICY_BINDING_MISMATCH"]);

  const wrongSchema = structuredClone(policy);
  wrongSchema.schemaHashes.request = `sha256:${"0".repeat(64)}`;
  await assert.rejects(evaluateAdmissionPolicy(vector("request-auto-admit.json"), wrongSchema),
    (error) => error instanceof AdmissionPolicyConfigurationError && error.issues.includes("policy.schemaHashes.request:contract-pin-mismatch"));

  const duplicate = structuredClone(policy);
  duplicate.dependencyClosure.push({ ...duplicate.dependencyClosure[0], digest: `sha256:${"9".repeat(64)}` });
  await assert.rejects(evaluateAdmissionPolicy(vector("request-auto-admit.json"), duplicate),
    (error) => error instanceof AdmissionPolicyConfigurationError && error.issues.includes("policy.dependencyClosure[2]:duplicate"));

  const cyclic = vector("request-auto-admit.json");
  cyclic.self = cyclic;
  await assert.rejects(evaluateAdmissionPolicy(cyclic, policy), /Canonicalization rejects cyclic objects/);
});

test("receipt tampering and any bound-input change are detectable", async () => {
  const request = vector("request-auto-admit.json");
  const receipt = await evaluateAdmissionPolicy(request, policy);
  const tampered = structuredClone(receipt);
  tampered.outcome = "HUMAN_REVIEW";
  assert.equal(await verifyAdmissionDecisionReceipt(tampered), false);
  assert.equal(await verifyAdmissionDecisionReceiptSelfHash(tampered), false);
  assert.deepEqual((await validateAdmissionDecisionReceipt(tampered)).issues,
    ["receipt.decisionReceiptHash:mismatch", "receipt.reasonCodes:invalid-for-outcome"]);

  const repinned = structuredClone(receipt);
  repinned.schemaHashes.request = `sha256:${"0".repeat(64)}`;
  const { decisionReceiptHash: _, ...repinnedBody } = repinned;
  repinned.decisionReceiptHash = await canonicalSha256(repinnedBody);
  assert.deepEqual((await validateAdmissionDecisionReceipt(repinned)).issues,
    ["receipt.schemaHashes.request:contract-pin-mismatch"]);
  const changed = vector("request-auto-admit.json");
  changed.inputHashes[0].digest = `sha256:${"e".repeat(64)}`;
  const changedReceipt = await evaluateAdmissionPolicy(changed, policy);
  assert.notEqual(changedReceipt.requestHash, receipt.requestHash);
  assert.notEqual(changedReceipt.decisionReceiptHash, receipt.decisionReceiptHash);
});

test("context verification rejects self-consistent receipts outside their exact request and policy", async () => {
  const request = vector("request-auto-admit.json");
  const receipt = await evaluateAdmissionPolicy(request, policy);
  assert.equal(await verifyAdmissionDecisionReceiptSelfHash(receipt), true);
  assert.equal(await verifyAdmissionDecisionReceiptContext(receipt, request, policy), true);

  const changedRequest = structuredClone(request);
  changedRequest.inputHashes[0].digest = `sha256:${"d".repeat(64)}`;
  assert.equal(await verifyAdmissionDecisionReceiptContext(receipt, changedRequest, policy), false);

  const selfConsistentForgery = structuredClone(receipt);
  selfConsistentForgery.requestId = "forged-request";
  const { decisionReceiptHash: _, ...forgedBody } = selfConsistentForgery;
  selfConsistentForgery.decisionReceiptHash = await canonicalSha256(forgedBody);
  assert.equal(await verifyAdmissionDecisionReceiptSelfHash(selfConsistentForgery), true);
  assert.equal(await verifyAdmissionDecisionReceiptContext(selfConsistentForgery, request, policy), false);
});

test("repinned receipts cannot mix outcome reasons or weaken trigger and diagnostic relations", async () => {
  const repin = async (receipt, changes) => {
    const candidate = { ...structuredClone(receipt), ...changes };
    const { decisionReceiptHash: _, ...body } = candidate;
    candidate.decisionReceiptHash = await canonicalSha256(body);
    return candidate;
  };
  const evaluate = async (name) => evaluateAdmissionPolicy(vector(name), policy);
  const auto = await evaluate("request-auto-admit.json");
  const human = await evaluate("request-human-review.json");
  const priority = await evaluate("request-priority-review.json");
  const invalid = await evaluate("request-invalid.json");
  const cases = [
    [auto, { reasonCodes: ["AUTO_ALLOWLIST_MATCH", "VALIDITY_GATE_FAILED"] }, "receipt.reasonCodes:invalid-for-outcome"],
    [auto, { triggerCodes: ["new-factual-assertion"] }, "receipt.triggerCodes:invalid-for-outcome"],
    [auto, { validationIssues: ["repinned-diagnostic"] }, "receipt.validationIssues:invalid-for-outcome"],
    [priority, { reasonCodes: ["PRIORITY_TRIGGER", "HUMAN_REVIEW_TRIGGER"] }, "receipt.reasonCodes:invalid-for-outcome"],
    [priority, { triggerCodes: [] }, "receipt.triggerCodes:invalid-for-outcome"],
    [priority, { validationIssues: ["repinned-diagnostic"] }, "receipt.validationIssues:invalid-for-outcome"],
    [human, { reasonCodes: ["HUMAN_REVIEW_TRIGGER", "VALIDITY_GATE_FAILED"] }, "receipt.reasonCodes:invalid-for-outcome"],
    [human, { reasonCodes: ["HUMAN_REVIEW_TRIGGER", "PRIORITY_TRIGGER"] }, "receipt.reasonCodes:invalid-for-outcome"],
    [human, { reasonCodes: ["HUMAN_REVIEW_TRIGGER", "AUTO_ALLOWLIST_MATCH"] }, "receipt.reasonCodes:invalid-for-outcome"],
    [human, { validationIssues: ["repinned-diagnostic"] }, "receipt.validationIssues:invalid-for-outcome"],
    [invalid, { reasonCodes: ["VALIDITY_GATE_FAILED", "HUMAN_REVIEW_TRIGGER"] }, "receipt.reasonCodes:invalid-for-outcome"],
    [invalid, { reasonCodes: ["VALIDITY_GATE_FAILED", "PRIORITY_TRIGGER"] }, "receipt.reasonCodes:invalid-for-outcome"],
    [invalid, { reasonCodes: ["VALIDITY_GATE_FAILED", "AUTO_ALLOWLIST_MATCH"] }, "receipt.reasonCodes:invalid-for-outcome"],
  ];
  for (const [receipt, changes, expectedIssue] of cases) {
    const candidate = await repin(receipt, changes);
    const validation = await validateAdmissionDecisionReceipt(candidate);
    assert.equal(validation.valid, false, JSON.stringify(changes));
    assert.ok(validation.issues.includes(expectedIssue), JSON.stringify(changes));
    assert.ok(!validation.issues.includes("receipt.decisionReceiptHash:mismatch"), JSON.stringify(changes));
  }
});

test("provider source has no I/O, network, clock, randomness, model, or product coupling", () => {
  const sourceDir = join(root, "src", "admission-policy");
  const source = readdirSync(sourceDir).filter((name) => name.endsWith(".ts"))
    .map((name) => readFileSync(join(sourceDir, name), "utf8")).join("\n");
  for (const forbidden of [/from\s+["']node:/, /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bDate\s*\(/,
    /\bDate\.now\b/, /\bMath\.random\b/, /\bsetTimeout\b/, /\bmaterialize\s*\(/i]) {
    assert.doesNotMatch(source, forbidden);
  }
  assert.doesNotMatch(source, /hindsight/i);
});
