import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { experimentalScience as science } from "../dist/gkos-engine.mjs";

const timestamp = "2026-08-08T12:00:00.000Z";
const d = (letter) => `sha256:${letter.repeat(64)}`;
const base = (id, kind, extra = {}) => ({
  id, kind, profile: science.EXPERIMENTAL_SRTP_PROFILE, schemaVersion: "experimental",
  createdAt: timestamp, sensitivity: "internal", origin: "authored", extensions: {}, ...extra,
});
const request = base("request:alpha", "execution_request", {
  inputRefs: ["dataset:input"], codeRefs: ["code:alpha"], environmentRef: "environment:alpha",
  parameters: { threshold: 1 }, seed: 42, contextRef: "context:alpha", authorizationRef: "authorization:alpha",
});

async function eventChain() {
  const first = base("event:one", "execution_event", {
    runId: "run:alpha", requestRef: request.id, sequence: 0, eventType: "started", timestamp,
    previousDigest: null, digest: d("0"), artifactRefs: [],
  });
  first.digest = await science.calculateExecutionEventDigest(first, null);
  const second = base("event:two", "execution_event", {
    runId: "run:alpha", requestRef: request.id, sequence: 1, eventType: "closed", timestamp,
    previousDigest: first.digest, digest: d("0"), artifactRefs: [],
  });
  second.digest = await science.calculateExecutionEventDigest(second, first.digest);
  const manifest = base("run:alpha", "execution_manifest", {
    digest: d("f"), requestRef: request.id, eventRefs: [first.id, second.id], inputRefs: request.inputRefs,
    inputDigests: { "dataset:input": d("1") }, codeRefs: request.codeRefs, codeDigests: { "code:alpha": d("2") },
    environmentRef: request.environmentRef, environmentDigest: d("3"), parameters: request.parameters,
    seed: request.seed, rootEventDigest: first.digest, finalEventDigest: second.digest, status: "closed", artifactRefs: [],
    contextRef: request.contextRef, authorizationRef: request.authorizationRef,
  });
  return { first, second, manifest };
}

test("event-chain verification recomputes canonical root/final digests", async () => {
  const { first, second, manifest } = await eventChain();
  const result = await science.verifyExecutionEventChain(manifest, [first, second]);
  assert.equal(result.status, "PASS");
  assert.equal(result.calculatedRootDigest, first.digest);
  assert.equal(result.calculatedFinalDigest, second.digest);

  const reordered = await science.verifyExecutionEventChain(manifest, [second, first]);
  assert.equal(reordered.status, "FAIL");
  assert.ok(reordered.diagnostics.some((item) => item.code === "GKX-SCIENCE-EVENT-002"));

  const missing = await science.verifyExecutionEventChain(manifest, [first]);
  assert.equal(missing.status, "FAIL");
  assert.ok(missing.diagnostics.some((item) => item.code === "GKX-SCIENCE-EVENT-004"));
});

test("event-chain verification detects duplicate and post-closure events", async () => {
  const { first, second, manifest } = await eventChain();
  const duplicate = { ...second, id: "event:duplicate", previousDigest: second.digest };
  duplicate.digest = await science.calculateExecutionEventDigest(duplicate, second.digest);
  const expanded = { ...manifest, eventRefs: [...manifest.eventRefs, duplicate.id], finalEventDigest: duplicate.digest };
  const result = await science.verifyExecutionEventChain(expanded, [first, second, duplicate]);
  assert.equal(result.status, "FAIL");
  assert.ok(result.diagnostics.some((item) => item.code === "GKX-SCIENCE-EVENT-003"));
  assert.ok(result.diagnostics.some((item) => item.code === "GKX-SCIENCE-EVENT-007"));
});

test("event-chain verification rejects a nonzero start and a closed manifest without closure", async () => {
  const { first, second, manifest } = await eventChain();
  const shifted = { ...first, sequence: 1 };
  shifted.digest = await science.calculateExecutionEventDigest(shifted, null);
  const shiftedManifest = { ...manifest, eventRefs: [shifted.id], rootEventDigest: shifted.digest, finalEventDigest: shifted.digest };
  const nonzero = await science.verifyExecutionEventChain(shiftedManifest, [shifted]);
  assert.equal(nonzero.status, "FAIL");
  assert.ok(nonzero.diagnostics.some((item) => item.code === "GKX-SCIENCE-EVENT-004" && /starts/.test(item.message)));

  const completed = { ...second, eventType: "completed" };
  completed.digest = await science.calculateExecutionEventDigest(completed, first.digest);
  const noClosureManifest = { ...manifest, finalEventDigest: completed.digest };
  const noClosure = await science.verifyExecutionEventChain(noClosureManifest, [first, completed]);
  assert.equal(noClosure.status, "FAIL");
  assert.ok(noClosure.diagnostics.some((item) => item.code === "GKX-SCIENCE-EVENT-017"));
});

test("event-chain verification rejects manifest reordering, duplicate refs, and temporal inversion", async () => {
  const { first, second, manifest } = await eventChain();
  const reordered = await science.verifyExecutionEventChain({ ...manifest, eventRefs: [second.id, first.id] }, [first, second]);
  assert.equal(reordered.status, "FAIL");
  assert.ok(reordered.diagnostics.some((item) => item.code === "GKX-SCIENCE-EVENT-019"));
  const duplicate = await science.verifyExecutionEventChain({ ...manifest, eventRefs: [first.id, second.id, second.id] }, [first, second]);
  assert.equal(duplicate.status, "FAIL");
  assert.ok(duplicate.diagnostics.some((item) => item.code === "GKX-SCIENCE-EVENT-003"));
  const earlier = { ...second, timestamp: "2026-08-08T11:59:59.000Z" };
  earlier.digest = await science.calculateExecutionEventDigest(earlier, first.digest);
  const temporal = await science.verifyExecutionEventChain({ ...manifest, finalEventDigest: earlier.digest }, [first, earlier]);
  assert.equal(temporal.status, "FAIL");
  assert.ok(temporal.diagnostics.some((item) => item.code === "GKX-SCIENCE-TEMPORAL-004"));
});

test("artifact verification detects swapped bytes and reports missing bytes as unevaluated", async () => {
  const content = "actual artifact bytes";
  const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  const { first, manifest } = await eventChain();
  first.artifactRefs = ["artifact:alpha"];
  first.artifactDigests = { "artifact:alpha": digest };
  manifest.artifactRefs = ["artifact:alpha"];
  manifest.artifactDigests = { "artifact:alpha": digest };
  const artifact = base("artifact:alpha", "artifact_record", {
    digest, producingEventRef: first.id, runRef: manifest.id, codeRefs: ["code:alpha"],
    inputRefs: ["dataset:input"], environmentRef: "environment:alpha", bytesAvailable: true,
  });
  const trace = science.buildScientificTrace([request, first, manifest, artifact], "trace:artifact");
  assert.equal((await science.verifyArtifactBindings(artifact, trace, { content })).status, "PASS");
  const swapped = await science.verifyArtifactBindings(artifact, trace, { content: "swapped bytes" });
  assert.equal(swapped.status, "FAIL");
  assert.ok(swapped.diagnostics.some((item) => item.code === "GKX-SCIENCE-ARTIFACT-008"));
  assert.equal((await science.verifyArtifactBindings(artifact, trace)).status, "UNEVALUATED");
  const conflictingEvidence = await science.verifyArtifactBindings(artifact, trace, { content, verifiedContentDigest: d("9") });
  assert.equal(conflictingEvidence.status, "FAIL");
  const changedBindings = { ...artifact, inputRefs: ["dataset:other"] };
  assert.equal((await science.verifyArtifactBindings(changedBindings, trace, { content })).status, "FAIL");
});

test("rerun comparison supports exact, numeric tolerance, and declared nondeterminism", async () => {
  const { manifest: a } = await eventChain();
  const b = { ...a, id: "run:beta", parameters: { threshold: 1.05 } };
  const comparison = science.compareScientificRuns(a, b, { id: "policy:tolerance", numericTolerance: { "parameters.threshold": 0.1 } });
  assert.equal(comparison.origin, "proposed");
  assert.equal(comparison.overall, "PASS");
  assert.equal(comparison.components.find((item) => item.component === "parameters.threshold").comparison, "numeric_tolerance");
  const nondeterministic = science.compareScientificRuns(a, { ...b, seed: 99 }, { id: "policy:nondeterministic", numericTolerance: 0.1, nondeterministicComponents: ["seed"] });
  assert.equal(nondeterministic.overall, "INDETERMINATE");
  const nested = science.compareScientificRuns({ ...a, parameters: { model: { value: 1 } } }, { ...b, parameters: { model: { value: 1.05 } } }, { id: "policy:nested", numericTolerance: { "parameters.model.value": 0.1 } });
  assert.equal(nested.components.find((item) => item.component === "parameters.model.value").status, "PASS");
  assert.equal(science.compareScientificRuns(a, a, { id: "policy:same" }).overall, "FAIL");
  assert.equal(science.compareScientificRuns(a, b, { id: "policy:invalid", numericTolerance: Number.POSITIVE_INFINITY }).overall, "FAIL");
  assert.equal(science.compareScientificRuns(a, { ...b, environmentDigest: d("4") }, { id: "policy:digest" }).overall, "FAIL");
});

test("re-entry verification binds authority, context, execution, and complete outputs", () => {
  const authority = { id: "authorization:alpha", digest: d("a") };
  const context = { id: "context:alpha", digest: d("b"), executionManifest: { id: "run:alpha", digest: d("c") } };
  const outputs = [{ id: "artifact:alpha", digest: d("d") }, { id: "source:alpha", digest: d("e") }];
  const receipt = base("receipt:alpha", "reentry_receipt", {
    authorizedUse: authority, contextManifest: { id: context.id, digest: context.digest },
    executionManifest: context.executionManifest, outputs,
  });
  assert.equal(science.verifyReentryReceipt(receipt, authority, context, outputs).status, "PASS");
  const omitted = science.verifyReentryReceipt({ ...receipt, outputs: outputs.slice(0, 1) }, authority, context, outputs);
  assert.equal(omitted.status, "FAIL");
  assert.deepEqual(omitted.omittedOutputs, ["source:alpha"]);
});

test("re-entry verification rejects duplicate produced and receipt output ids", () => {
  const authority = { id: "authorization:alpha", digest: d("a") };
  const context = { id: "context:alpha", digest: d("b"), executionManifest: { id: "run:alpha", digest: d("c") } };
  const output = { id: "artifact:alpha", digest: d("d") };
  const receipt = base("receipt:duplicate", "reentry_receipt", {
    authorizedUse: authority, contextManifest: { id: context.id, digest: context.digest },
    executionManifest: context.executionManifest, outputs: [output, output],
  });
  const result = science.verifyReentryReceipt(receipt, authority, context, [output, output]);
  assert.equal(result.status, "FAIL");
  assert.ok(result.diagnostics.some((item) => item.code === "GKX-SCIENCE-REENTRY-012"));
  assert.ok(result.diagnostics.some((item) => item.code === "GKX-SCIENCE-REENTRY-013"));
});

test("assessment never promotes unverified or corrupted chain, artifact, or receipt evidence", async () => {
  const { first, second, manifest } = await eventChain();
  const chainTrace = science.buildScientificTrace([request, manifest, first, second], "trace:chain-assessment");
  assert.equal(science.assessScientificTrace(chainTrace, { id: "policy:assessment" }).components.eventChainIntegrity.status, "UNEVALUATED");
  const corruptedEvent = { ...second, digest: d("e") };
  const corruptTrace = science.buildScientificTrace([request, manifest, first, corruptedEvent], "trace:corrupt-chain");
  const cleanVerification = await science.verifyExecutionEventChain(manifest, [first, second]);
  const replayedClean = science.assessScientificTrace(corruptTrace, { id: "policy:replay", verificationEvidence: { eventChains: [cleanVerification] } });
  assert.notEqual(replayedClean.components.eventChainIntegrity.status, "PASS");
  const corruptVerification = await science.verifyExecutionEventChain(manifest, [first, corruptedEvent]);
  const corruptAssessment = science.assessScientificTrace(corruptTrace, { id: "policy:assessment", verificationEvidence: { eventChains: [corruptVerification] } });
  assert.equal(corruptAssessment.components.eventChainIntegrity.status, "FAIL");

  const content = "bound artifact";
  const artifactDigest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  first.artifactRefs = ["artifact:assessed"];
  first.artifactDigests = { "artifact:assessed": artifactDigest };
  manifest.artifactRefs = ["artifact:assessed"];
  manifest.artifactDigests = { "artifact:assessed": artifactDigest };
  const artifact = base("artifact:assessed", "artifact_record", {
    digest: artifactDigest, producingEventRef: first.id, runRef: manifest.id, codeRefs: ["code:alpha"],
    inputRefs: ["dataset:input"], environmentRef: "environment:alpha",
  });
  const artifactTrace = science.buildScientificTrace([request, first, manifest, artifact], "trace:artifact-assessment");
  assert.equal(science.assessScientificTrace(artifactTrace, { id: "policy:assessment" }).components.artifactTraceability.status, "UNEVALUATED");
  const badArtifact = await science.verifyArtifactBindings(artifact, artifactTrace, { content: "different bytes" });
  assert.equal(science.assessScientificTrace(artifactTrace, { id: "policy:assessment", verificationEvidence: { artifactBindings: [badArtifact] } }).components.artifactTraceability.status, "FAIL");
  const cleanArtifact = await science.verifyArtifactBindings(artifact, artifactTrace, { content });
  const alteredArtifactTrace = science.buildScientificTrace([request, first, manifest, { ...artifact, digest: d("8") }], "trace:artifact-assessment");
  assert.notEqual(science.assessScientificTrace(alteredArtifactTrace, { id: "policy:replay", verificationEvidence: { artifactBindings: [cleanArtifact] } }).components.artifactTraceability.status, "PASS");

  const authority = { id: "authorization:alpha", digest: d("a") };
  const context = { id: "context:alpha", digest: d("b"), executionManifest: { id: "run:alpha", digest: d("c") } };
  const outputs = [{ id: "artifact:alpha", digest: d("d") }, { id: "source:alpha", digest: d("e") }];
  const receipt = base("receipt:assessed", "reentry_receipt", {
    authorizedUse: authority, contextManifest: { id: context.id, digest: context.digest }, executionManifest: context.executionManifest, outputs: outputs.slice(0, 1),
  });
  const receiptTrace = science.buildScientificTrace([receipt], "trace:receipt-assessment");
  assert.equal(science.assessScientificTrace(receiptTrace, { id: "policy:assessment" }).components.reentryCompleteness.status, "UNEVALUATED");
  const badReceipt = science.verifyReentryReceipt(receipt, authority, context, outputs);
  assert.equal(science.assessScientificTrace(receiptTrace, { id: "policy:assessment", verificationEvidence: { reentryReceipts: [badReceipt] } }).components.reentryCompleteness.status, "FAIL");
  const completeReceipt = { ...receipt, outputs };
  const cleanReceipt = science.verifyReentryReceipt(completeReceipt, authority, context, outputs);
  assert.notEqual(science.assessScientificTrace(receiptTrace, { id: "policy:replay", verificationEvidence: { reentryReceipts: [cleanReceipt] } }).components.reentryCompleteness.status, "PASS");
  const forged = science.assessScientificTrace(chainTrace, { id: "policy:forged", verificationEvidence: { eventChains: [{ manifestId: manifest.id, status: "PASS", diagnostics: [], evidenceRefs: [] }] } });
  assert.equal(forged.components.eventChainIntegrity.status, "UNEVALUATED");
});
