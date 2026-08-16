import assert from "node:assert/strict";
import test from "node:test";

import {
  ENGINE_VERSION,
  GKX23_PROFILE,
  GKX_PUBLIC_NAMESPACE,
  VERSION_PROFILE_COMPATIBILITY,
  buildGraph,
  experimentalScience as science,
} from "../dist/gkos-engine.mjs";

const timestamp = "2026-08-08T12:00:00.000Z";
const digest = `sha256:${"a".repeat(64)}`;
const base = (id, kind, extra = {}) => ({
  id, kind, profile: science.EXPERIMENTAL_SRTP_PROFILE, schemaVersion: "experimental",
  createdAt: timestamp, sensitivity: "internal", origin: "authored", extensions: {}, ...extra,
});

test("experimental parser retains unknown fields without granting authority", () => {
  const source = {
    id: "dataset:alpha", kind: "dataset_snapshot", created_at: timestamp,
    sensitivity: "internal", origin: "authored", digest, future_provider_field: { x: 1 }, approved: true,
  };
  const record = science.parseScientificRecord(source, { experimentalScienceProfile: true });
  assert.deepEqual(record.extensions.future_provider_field, { x: 1 });
  assert.equal(record.extensions.approved, true);
  assert.equal(source.future_provider_field.x, 1, "source is not mutated");
  const result = science.validateScientificRecord(record, { experimentalScienceProfile: true });
  assert.equal(result.valid, true);
  assert.ok(result.diagnostics.some((item) => item.code === "GKX-SCIENCE-EXTENSION-002"));
});

test("parser preserves colliding aliases and malformed extension containers", () => {
  const record = science.parseScientificRecord({
    id: "dataset:collision", kind: "dataset_snapshot", createdAt: timestamp,
    created_at: "2026-08-07T12:00:00.000Z", sensitivity: "internal", origin: "authored",
    digest, extensions: ["provider", "data"],
  }, { experimentalScienceProfile: true });
  assert.equal(record.createdAt, timestamp, "canonical authored key wins deterministically");
  assert.equal(record.extensions.created_at, "2026-08-07T12:00:00.000Z", "colliding alias is retained");
  assert.deepEqual(record.extensions.__invalid_extensions, ["provider", "data"]);
});

test("canonicalization is stable across key order and platform line endings", () => {
  const a = science.canonicalizeScientificRecord({ z: "one\r\ntwo", a: { y: 2, x: 1 } });
  const b = science.canonicalizeScientificRecord({ a: { x: 1, y: 2 }, z: "one\ntwo" });
  assert.equal(a, b);
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => science.canonicalizeScientificRecord(cycle), /cyclic/);
});

test("validation fails closed for invalid identity, timestamp, sensitivity, and digest", () => {
  const record = base("not stable", "dataset_snapshot", { createdAt: "2026-08-08T12:00:00", sensitivity: "low", digest: "md5:no" });
  const result = science.validateScientificRecord(record, { experimentalScienceProfile: true });
  assert.equal(result.valid, false);
  assert.deepEqual(new Set(result.diagnostics.map((item) => item.code)), new Set([
    "GKX-SCIENCE-DIGEST-001", "GKX-SCIENCE-IDENTITY-001", "GKX-SCIENCE-SENSITIVITY-001", "GKX-SCIENCE-TEMPORAL-001",
  ]));
});

test("trace resolution and assessment preserve unresolved evidence as component failure", () => {
  const dataset = base("dataset:alpha", "dataset_snapshot", { digest });
  const object = base("research:alpha", "scientific_research_object", {
    sourceRefs: ["source:missing"], codeRefs: [], datasetRefs: [dataset.id],
  });
  const trace = science.buildScientificTrace([object, dataset], "trace:alpha");
  assert.deepEqual(trace.nodes.map((node) => node.id), ["dataset:alpha", "research:alpha"]);
  assert.equal(trace.summary.unresolvedReferences, 1);
  assert.deepEqual(trace.edges.map((edge) => [edge.type, edge.resolved]), [["uses_dataset", true], ["uses_source", false]]);
  const assessment = science.assessScientificTrace(trace, { id: "policy:science-test" });
  assert.equal(assessment.components.sourceCompleteness.status, "FAIL");
  assert.equal(assessment.components.contextAuthorizationLinkage.status, "FAIL");
  assert.equal(assessment.overall, "FAIL");
  assert.equal(assessment.interpretation, "trace-completeness-and-binding-not-scientific-truth");
});

test("review disposition requires an independent decision actor", () => {
  const target = base("result:reviewed", "scientific_result", { runRef: "run:missing", artifactRefs: [], sourceRefs: [], citationRefs: [], numericTraceRefs: [], reviewRefs: [] });
  const review = base("review:alpha", "reviewer_finding", { targetRef: target.id, reviewerRef: "tool:reviewer", finding: "Looks acceptable", disposition: "accepted" });
  const trace = science.buildScientificTrace([target, review], "trace:review");
  const assessment = science.assessScientificTrace(trace, { id: "policy:review" });
  assert.equal(assessment.components.reviewDispositionCompleteness.status, "FAIL");
});

test("external actor/context bindings do not become impossible record-resolution failures", () => {
  const target = base("result:external", "scientific_result", { runRef: "run:external", artifactRefs: [], sourceRefs: [], citationRefs: [], numericTraceRefs: [], reviewRefs: ["review:external"] });
  const review = base("review:external", "reviewer_finding", { targetRef: target.id, reviewerRef: "tool:reviewer", decidedByRef: "human:approver", finding: "Reviewed", disposition: "accepted" });
  const trace = science.buildScientificTrace([target, review], "trace:external");
  assert.equal(trace.edges.find((edge) => edge.type === "reviewed_by")?.external, true);
  assert.equal(trace.edges.find((edge) => edge.type === "decided_by")?.external, true);
  assert.ok(!trace.diagnostics.some((item) => item.code === "GKX-SCIENCE-RELATION-001" && ["reviewed_by", "decided_by"].includes(item.field)));
});

test("version/profile matrix locks distinct existing identifiers and default behavior", () => {
  assert.equal(ENGINE_VERSION, "2.1.0");
  assert.equal(GKX_PUBLIC_NAMESPACE, "2.0");
  assert.equal(GKX23_PROFILE, "gkx-2.3-validating-projection");
  assert.deepEqual(VERSION_PROFILE_COMPATIBILITY, {
    enginePackageVersion: "2.1.0",
    publicExchangeNamespace: "2.0",
    validatingProjectionProfile: "gkx-2.3-validating-projection",
    validatingProjectionApi: "buildGkx23Projection",
    srtpDraftProjectionCoordinate: "gkx-2.0-validating-projection",
    legacyFlatRecordVersion: "2.2",
    experimentalScienceProfile: "SRTP-DRAFT-0.1",
  });
  assert.equal(typeof science.validateScientificRecord, "function");
  const graph = buildGraph([{ relativePath: "plain.md", content: "# unchanged" }], [], new Date(timestamp));
  assert.equal(graph.nodes[0].gkx?.projection, undefined, "science support does not enter the default graph pipeline");
});
