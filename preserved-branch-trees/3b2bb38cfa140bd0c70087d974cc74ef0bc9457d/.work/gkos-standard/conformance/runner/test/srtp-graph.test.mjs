import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { evaluateGraph, materialize, runSuite, schemaProgram } from "../srtp-graph.mjs";

const compatibility = JSON.parse(readFileSync(resolve("../../conformance/provisional-requirements/version-compatibility.matrix.json"), "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const codes = (trace) => [...new Set(evaluateGraph(trace, compatibility).map((item) => item.code))].sort();

test("SRTP draft graph suite catches every declared negative and remains non-qualifying", () => {
  const out = join(mkdtempSync(join(tmpdir(), "srtp-runner-")), "report.json");
  const report = runSuite({ outPath: out });
  const persisted = JSON.parse(readFileSync(out, "utf8"));

  assert.equal(report.executed, 22);
  assert.equal(report.failed, 0);
  assert.equal(report.evaluation_status, "PASS");
  assert.deepEqual(report.profiles_claimed, []);
  assert.equal(persisted.status, "provisional-draft-non-normative");
  assert.deepEqual(report.results.find((item) => item.fixture_id === "SRTP-N01").actual_diagnostics, ["SRTP-ARTIFACT-001", "SRTP-INPUT-001"]);
  assert.deepEqual(report.results.find((item) => item.fixture_id === "SRTP-N11").actual_diagnostics, ["SRTP-REENTRY-002"]);
  assert.deepEqual(report.results.find((item) => item.fixture_id === "SRTP-N12").actual_diagnostics, ["SRTP-VERSION-001"]);
  for (const fixtureId of ["SRTP-N13", "SRTP-N14", "SRTP-N15", "SRTP-N16"]) {
    assert.deepEqual(report.results.find((item) => item.fixture_id === fixtureId).actual_diagnostics, ["SRTP-REENTRY-001"]);
  }
});

test("complete SRTP trace preserves unknown extensions while validating", () => {
  const report = runSuite();
  const complete = report.results.find((item) => item.fixture_id === "SRTP-P01");
  assert.equal(complete.outcome, "pass");
  assert.deepEqual(complete.actual_diagnostics, []);
});

test("adversarial graph mutations cannot obtain a false PASS", () => {
  const base = materialize("srtp-p01-complete.json");

  const noReceipt = clone(base);
  noReceipt.reentry_receipts = [];
  assert.ok(codes(noReceipt).includes("SRTP-REENTRY-001"));

  const duplicateReceiptDigest = clone(base);
  duplicateReceiptDigest.reentry_receipts[0].new_source_digests.push("sha256:event-1");
  assert.ok(codes(duplicateReceiptDigest).includes("SRTP-REENTRY-001"));

  const unboundArtifact = clone(base);
  unboundArtifact.execution_events[1].output_digests = [];
  assert.ok(codes(unboundArtifact).includes("SRTP-ARTIFACT-001"));

  const wrongAuthorization = clone(base);
  const alternateUse = clone(wrongAuthorization.authorized_uses[0]);
  alternateUse.id = "d1000000-0000-4000-8000-00000000001d";
  wrongAuthorization.authorized_uses.push(alternateUse);
  wrongAuthorization.reentry_receipts[0].authorized_use_id = alternateUse.id;
  assert.ok(codes(wrongAuthorization).includes("SRTP-REENTRY-001"));

  const jointlyChangedInputAndAuthorization = clone(base);
  jointlyChangedInputAndAuthorization.execution_manifests[0].dataset_digests[0] = "sha256:dataset-v2";
  jointlyChangedInputAndAuthorization.authorized_uses[0].input_digests[1] = "sha256:dataset-v2";
  jointlyChangedInputAndAuthorization.artifacts[0].dataset_digests[0] = "sha256:dataset-v2";
  assert.ok(codes(jointlyChangedInputAndAuthorization).includes("SRTP-INPUT-001"));

  const orphanEvent = clone(base);
  const extraEvent = clone(orphanEvent.execution_events[1]);
  extraEvent.id = "71000000-0000-4000-8000-000000000017";
  orphanEvent.execution_events.push(extraEvent);
  assert.ok(codes(orphanEvent).includes("SRTP-EVENT-001"));

  const loweredReceipt = clone(base);
  loweredReceipt.reentry_receipts[0].sensitivity = "public";
  assert.ok(codes(loweredReceipt).includes("SRTP-SENSITIVITY-001"));

  const unauthorizedActor = clone(base);
  unauthorizedActor.execution_manifests[0].created_by = "agent:different-runner";
  assert.ok(codes(unauthorizedActor).includes("SRTP-EXEC-003"));

  const selfSupportedNumber = clone(base);
  selfSupportedNumber.results[0].numeric_claims[0].evidence_ids = [selfSupportedNumber.results[0].id];
  assert.ok(codes(selfSupportedNumber).includes("SRTP-CLAIM-001"));
});

test("schema rejects empty traces and tolerance reruns without a tolerance", () => {
  const ajv = schemaProgram();
  const validate = ajv.getSchema("https://github.com/Odenknight/gkos-standard/schemas/provisional/science/scientific-trace-manifest.draft.schema.json");
  const empty = materialize("srtp-p01-complete.json");
  for (const field of ["datasets", "environments", "execution_requests", "execution_manifests", "execution_events", "artifacts", "results", "reviewer_findings", "context_manifests", "authorized_uses", "reentry_receipts"]) empty[field] = [];
  assert.equal(validate(empty), false);

  const noTolerance = materialize("srtp-p06-tolerance-rerun.json");
  delete noTolerance.rerun_comparisons[0].tolerance;
  assert.equal(validate(noTolerance), false);
});

test("materialization and evaluation preserve unknown extensions without mutation", () => {
  const trace = materialize("srtp-p01-complete.json");
  const before = clone(trace);
  assert.equal(trace.x_top_level_extension, "unknown top-level extension must round-trip");
  assert.equal(trace.datasets[0].x_vendor_note, "unknown dataset extension must round-trip");
  evaluateGraph(trace, compatibility);
  assert.deepEqual(trace, before);
});
