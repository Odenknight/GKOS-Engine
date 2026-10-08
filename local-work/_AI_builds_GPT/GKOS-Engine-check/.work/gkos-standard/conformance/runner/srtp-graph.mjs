#!/usr/bin/env node
/**
 * SRTP-DRAFT-0.1 graph fixture runner.
 *
 * This executable is informative and non-qualifying. It materializes fixture
 * overlays, validates the complete trace schema, evaluates cross-record rules,
 * and emits a draft evaluation report with profiles_claimed always empty.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const fixtureRoot = join(root, "fixtures", "provisional", "science");
const schemaRoot = join(root, "schemas");
const scienceSchemaRoot = join(schemaRoot, "provisional", "science");
const compatibilityPath = join(root, "conformance", "provisional-requirements", "version-compatibility.matrix.json");
const SENSITIVITY = ["public", "internal", "restricted", "confidential", "regulated", "phi", "secret"];

const clone = (value) => JSON.parse(JSON.stringify(value));
const decodePointer = (part) => part.replaceAll("~1", "/").replaceAll("~0", "~");

function applyMutation(document, mutation) {
  const parts = mutation.path.split("/").slice(1).map(decodePointer);
  const leaf = parts.pop();
  let target = document;
  for (const part of parts) target = target[part];
  if (mutation.op === "set") target[leaf] = clone(mutation.value);
  else if (mutation.op === "add" && leaf === "-") target.push(clone(mutation.value));
  else if (mutation.op === "add") target[leaf] = clone(mutation.value);
  else if (mutation.op === "remove") Array.isArray(target) ? target.splice(Number(leaf), 1) : delete target[leaf];
  else throw new Error(`Unsupported fixture mutation '${mutation.op}'`);
}

export function materialize(file, seen = new Set()) {
  if (seen.has(file)) throw new Error(`Fixture extends cycle at ${file}`);
  seen.add(file);
  const value = JSON.parse(readFileSync(join(fixtureRoot, file), "utf8"));
  if (!value.extends) return value;
  const graph = clone(materialize(value.extends, seen));
  for (const mutation of value.mutations ?? []) applyMutation(graph, mutation);
  return graph;
}

export function schemaProgram() {
  const ajv = new Ajv2020.default({ strict: false, allErrors: true });
  for (const file of readdirSync(schemaRoot).filter((name) => name.endsWith(".json"))) {
    const schema = JSON.parse(readFileSync(join(schemaRoot, file), "utf8"));
    ajv.addSchema(schema, schema.$id);
    if (!ajv.getSchema(basename(file))) ajv.addSchema(schema, basename(file));
  }
  for (const file of readdirSync(scienceSchemaRoot).filter((name) => name.endsWith(".json"))) {
    const schema = JSON.parse(readFileSync(join(scienceSchemaRoot, file), "utf8"));
    ajv.addSchema(schema, schema.$id);
  }
  return ajv;
}

const add = (diagnostics, code, message, path) => diagnostics.push({ code, message, ...(path ? { path } : {}) });
const sameDigestSet = (actual = [], expected = []) => {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return actual.length === actualSet.size
    && expected.length === expectedSet.size
    && actualSet.size === expectedSet.size
    && [...actualSet].every((digest) => expectedSet.has(digest));
};
const noLessSensitive = (candidate, baseline) => SENSITIVITY.indexOf(candidate) >= SENSITIVITY.indexOf(baseline);

export function evaluateGraph(trace, compatibility) {
  const diagnostics = [];
  const profileCompatibility = compatibility.profiles[trace.profile]?.compatible_with;
  if (trace.profile_status !== "provisional-draft-non-normative") {
    add(diagnostics, "SRTP-VERSION-001", `Unsupported profile status '${trace.profile_status}'`, "/profile_status");
  }
  for (const coordinate of ["gkos_publication", "gkx_namespace", "projection_profile", "engine_package"]) {
    if (!profileCompatibility?.[coordinate]?.includes(trace.version_coordinates?.[coordinate])) {
      add(diagnostics, "SRTP-VERSION-001", `Unsupported ${coordinate} '${trace.version_coordinates?.[coordinate]}'`, `/version_coordinates/${coordinate}`);
    }
  }

  const collections = ["research_objects", "datasets", "environments", "execution_requests", "execution_manifests", "execution_events", "artifacts", "results", "reviewer_findings", "rerun_comparisons"];
  const records = collections.flatMap((key) => trace[key] ?? []);
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const item of [...(trace.context_manifests ?? []), ...(trace.authorized_uses ?? [])]) byId.set(item.id, item);
  for (const receipt of trace.reentry_receipts ?? []) byId.set(receipt.receipt_id, receipt);
  const allIdentities = [
    ...records.map((record) => record.id),
    ...(trace.context_manifests ?? []).map((item) => item.id),
    ...(trace.authorized_uses ?? []).map((item) => item.id),
    ...(trace.reentry_receipts ?? []).map((item) => item.receipt_id)
  ];
  if (new Set(allIdentities).size !== allIdentities.length) {
    add(diagnostics, "SRTP-GRAPH-001", "Trace contains duplicate governed identities", "/");
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  for (const [index, relation] of (trace.relations ?? []).entries()) {
    if ((uuid.test(relation.from) && !byId.has(relation.from)) || (uuid.test(relation.to) && !byId.has(relation.to))) {
      add(diagnostics, "SRTP-GRAPH-001", "Relation contains an unresolved governed identity", `/relations/${index}`);
    }
  }

  for (const record of records) {
    if (record.derived_sensitivity && SENSITIVITY.indexOf(record.derived_sensitivity) < SENSITIVITY.indexOf(record.sensitivity)) {
      add(diagnostics, "SRTP-SENSITIVITY-001", `Derived sensitivity lowers ${record.sensitivity} to ${record.derived_sensitivity}`, `/id/${record.id}`);
    }
  }

  const contexts = new Map((trace.context_manifests ?? []).map((item) => [item.id, item]));
  const uses = new Map((trace.authorized_uses ?? []).map((item) => [item.id, item]));
  const requests = new Map((trace.execution_requests ?? []).map((item) => [item.id, item]));
  const manifests = new Map((trace.execution_manifests ?? []).map((item) => [item.id, item]));
  const datasets = new Map((trace.datasets ?? []).map((item) => [item.id, item]));
  const environments = new Map((trace.environments ?? []).map((item) => [item.id, item]));
  const events = new Map((trace.execution_events ?? []).map((item) => [item.id, item]));
  const artifacts = new Map((trace.artifacts ?? []).map((item) => [item.id, item]));
  const manifestDigests = (trace.execution_manifests ?? []).map((item) => item.content_digest);
  if (new Set(manifestDigests).size !== manifestDigests.length) {
    add(diagnostics, "SRTP-GRAPH-001", "Multiple execution manifests claim the same content digest", "/execution_manifests");
  }

  for (const request of trace.execution_requests ?? []) {
    const context = contexts.get(request.context_manifest_id);
    const use = uses.get(request.authorized_use_id);
    if (!context || !use || use.context_manifest_id !== context.id || use.context_manifest_digest !== context.digest || new Date(context.expires_at) <= new Date(use.authorized_at)) {
      add(diagnostics, "SRTP-CONTEXT-001", `Missing, mismatched, or expired context for request ${request.id}`, `/execution_requests/${request.id}`);
    }
    if ((context && !noLessSensitive(context.sensitivity, request.sensitivity)) || (use && !noLessSensitive(use.sensitivity, request.sensitivity))) {
      add(diagnostics, "SRTP-SENSITIVITY-001", `Context or authorization lowers request sensitivity for ${request.id}`, `/execution_requests/${request.id}`);
    }
  }

  const referencedEventIds = new Set();
  for (const manifest of trace.execution_manifests ?? []) {
    const request = requests.get(manifest.request_id);
    const use = request && uses.get(request.authorized_use_id);
    const environment = request && environments.get(request.environment_id);
    if (!use || manifest.created_by !== use.actor) {
      add(diagnostics, "SRTP-EXEC-003", `Execution ${manifest.id} actor does not match its authorization`, `/execution_manifests/${manifest.id}/created_by`);
    }
    if (!environment || manifest.environment_digest !== environment.snapshot_digest) {
      add(diagnostics, "SRTP-EXEC-001", `Execution ${manifest.id} lacks its authorized environment snapshot`, `/execution_manifests/${manifest.id}/environment_digest`);
    }
    if (!request || manifest.code_digest !== request.code_digest) {
      add(diagnostics, "SRTP-EXEC-002", `Execution ${manifest.id} code does not resolve to its request`, `/execution_manifests/${manifest.id}/code_digest`);
    }
    const expectedDatasetDigests = request
      ? request.dataset_ids.map((id) => datasets.get(id)?.snapshot_digest).filter(Boolean)
      : [];
    if (!request
      || expectedDatasetDigests.length !== request.dataset_ids.length
      || !sameDigestSet(manifest.dataset_digests, expectedDatasetDigests)
      || manifest.parameters_digest !== request.parameters_digest
      || manifest.seed !== request.seed) {
      add(diagnostics, "SRTP-INPUT-001", `Execution ${manifest.id} does not match its requested data, parameters, or seed`, `/execution_manifests/${manifest.id}`);
    }
    const materialInputs = [manifest.code_digest, ...(manifest.dataset_digests ?? []), manifest.environment_digest, manifest.parameters_digest];
    if (!use || materialInputs.some((digest) => !use.input_digests.includes(digest))) {
      add(diagnostics, "SRTP-INPUT-001", `Execution ${manifest.id} used a digest not bound by authorization`, `/execution_manifests/${manifest.id}`);
    }

    const ordered = (manifest.event_ids ?? []).map((id) => events.get(id));
    manifest.event_ids.forEach((id) => referencedEventIds.add(id));
    if (ordered.some((event) => !event) || ordered.some((event, index) => event.manifest_id !== manifest.id || event.sequence !== index || (index === 0 ? event.previous_event_digest !== null : event.previous_event_digest !== ordered[index - 1].event_digest))) {
      add(diagnostics, "SRTP-EVENT-001", `Execution ${manifest.id} event sequence is missing or not hash-linked`, `/execution_manifests/${manifest.id}/event_ids`);
    }
    if (manifest.state === "recovered" && (!manifest.recovery_of || !ordered.some((event) => event?.event_kind === "recovery"))) {
      add(diagnostics, "SRTP-RECOVERY-001", `Recovered execution ${manifest.id} lacks recovery evidence`, `/execution_manifests/${manifest.id}/state`);
    }
    if (request && !noLessSensitive(manifest.sensitivity, request.sensitivity)) {
      add(diagnostics, "SRTP-SENSITIVITY-001", `Execution ${manifest.id} lowers request sensitivity`, `/execution_manifests/${manifest.id}/sensitivity`);
    }
  }
  for (const event of trace.execution_events ?? []) {
    if (!referencedEventIds.has(event.id) || !manifests.has(event.manifest_id)) {
      add(diagnostics, "SRTP-EVENT-001", `Execution event ${event.id} is orphaned`, `/execution_events/${event.id}`);
    }
  }

  for (const artifact of trace.artifacts ?? []) {
    const event = events.get(artifact.generating_event_id);
    const manifest = event && manifests.get(event.manifest_id);
    if (artifact.artifact_digest !== artifact.registered_source_digest
      || !event
      || !event.output_digests?.includes(artifact.artifact_digest)
      || !manifest
      || !manifest.event_ids.includes(event.id)
      || artifact.code_digest !== manifest.code_digest
      || !sameDigestSet(artifact.dataset_digests, manifest.dataset_digests)
      || artifact.environment_digest !== manifest.environment_digest) {
      add(diagnostics, "SRTP-ARTIFACT-001", `Artifact ${artifact.id} does not match its registered source or producing event`, `/artifacts/${artifact.id}`);
    }
    if (manifest && !noLessSensitive(artifact.sensitivity, manifest.sensitivity)) {
      add(diagnostics, "SRTP-SENSITIVITY-001", `Artifact ${artifact.id} lowers execution sensitivity`, `/artifacts/${artifact.id}/sensitivity`);
    }
  }

  const numericEvidenceIds = new Set([
    ...artifacts.keys(),
    ...datasets.keys(),
    ...(trace.research_objects ?? []).filter((item) => item.srtp_type === "srtp:Observation").map((item) => item.id)
  ]);
  for (const result of trace.results ?? []) {
    for (const claim of result.numeric_claims ?? []) {
      if (!events.has(claim.calculation_event_id) || claim.evidence_ids.some((id) => !numericEvidenceIds.has(id))) {
        add(diagnostics, "SRTP-CLAIM-001", `Numeric claim in ${result.id} is not traceable`, `/results/${result.id}/numeric_claims`);
      }
    }
  }

  for (const finding of trace.reviewer_findings ?? []) {
    if (finding.approved_by && finding.approved_by === finding.reviewer) {
      add(diagnostics, "SRTP-REVIEW-001", `Reviewer ${finding.reviewer} attempted self-approval`, `/reviewer_findings/${finding.id}/approved_by`);
    }
    if (finding.conflicts_with_deterministic_finding_id) {
      const deterministic = byId.get(finding.conflicts_with_deterministic_finding_id);
      if (deterministic?.deterministic && deterministic.evaluation === "FAIL" && finding.evaluation === "PASS") {
        add(diagnostics, "SRTP-REVIEW-002", `Model finding ${finding.id} conflicts with deterministic failure`, `/reviewer_findings/${finding.id}`);
      }
    }
  }

  const manifestsByDigest = new Map((trace.execution_manifests ?? []).map((item) => [item.content_digest, item]));
  const receiptedManifestDigests = new Set();
  for (const receipt of trace.reentry_receipts ?? []) {
    const manifest = manifestsByDigest.get(receipt.execution_manifest_digest);
    if (manifest) receiptedManifestDigests.add(manifest.content_digest);
    if (receipt.receipt_status === "unavailable") {
      add(diagnostics, "SRTP-REENTRY-002", `Output exists but receipt ${receipt.receipt_id} is unavailable`, `/reentry_receipts/${receipt.receipt_id}`);
      continue;
    }
    const use = uses.get(receipt.authorized_use_id);
    const context = use && contexts.get(use.context_manifest_id);
    const request = manifest && requests.get(manifest.request_id);
    const orderedEvents = manifest?.event_ids.map((id) => events.get(id)) ?? [];
    const expectedSourceDigests = manifest && orderedEvents.every(Boolean)
      ? [manifest.content_digest, ...orderedEvents.map((event) => event.event_digest)]
      : [];
    const runEventIds = new Set(manifest?.event_ids ?? []);
    const expectedArtifactDigests = (trace.artifacts ?? [])
      .filter((artifact) => runEventIds.has(artifact.generating_event_id))
      .map((artifact) => artifact.artifact_digest);
    const complete = receipt.receipt_status === "complete"
      && use
      && context
      && request
      && request.authorized_use_id === receipt.authorized_use_id
      && request.context_manifest_id === use.context_manifest_id
      && receipt.context_manifest_digest === context.digest
      && manifest
      && orderedEvents.every(Boolean)
      && sameDigestSet(receipt.new_source_digests, expectedSourceDigests)
      && sameDigestSet(receipt.new_artifact_digests, expectedArtifactDigests);
    if (!complete) add(diagnostics, "SRTP-REENTRY-001", `Re-entry receipt ${receipt.receipt_id} is incomplete or unbound`, `/reentry_receipts/${receipt.receipt_id}`);
    const receiptBaseline = [use?.sensitivity, context?.sensitivity, manifest?.sensitivity]
      .filter(Boolean)
      .sort((a, b) => SENSITIVITY.indexOf(b) - SENSITIVITY.indexOf(a))[0];
    if (receiptBaseline && !noLessSensitive(receipt.sensitivity, receiptBaseline)) {
      add(diagnostics, "SRTP-SENSITIVITY-001", `Re-entry receipt ${receipt.receipt_id} lowers linked sensitivity`, `/reentry_receipts/${receipt.receipt_id}/sensitivity`);
    }
  }
  for (const manifest of trace.execution_manifests ?? []) {
    if (!receiptedManifestDigests.has(manifest.content_digest)) {
      add(diagnostics, "SRTP-REENTRY-001", `Execution ${manifest.id} has no re-entry receipt`, `/execution_manifests/${manifest.id}`);
    }
  }

  return diagnostics;
}

export function runSuite({ manifestPath = join(fixtureRoot, "fixtures.manifest.json"), outPath } = {}) {
  const catalog = JSON.parse(readFileSync(manifestPath, "utf8"));
  const compatibility = JSON.parse(readFileSync(compatibilityPath, "utf8"));
  const allowedCatalogs = compatibility.profiles[catalog.profile]?.compatible_with?.srtp_fixture_catalog ?? [];
  if (!allowedCatalogs.includes(catalog.catalog_version)) {
    throw new Error(`Fixture catalog '${catalog.catalog_version}' is not compatible with ${catalog.profile}`);
  }
  const ajv = schemaProgram();
  const validate = ajv.getSchema("https://github.com/Odenknight/gkos-standard/schemas/provisional/science/scientific-trace-manifest.draft.schema.json");
  const results = [];

  for (const fixture of catalog.fixtures) {
    const trace = materialize(fixture.file);
    const schemaValid = validate(trace);
    const graphDiagnostics = schemaValid ? evaluateGraph(trace, compatibility) : [];
    const actualCodes = [...new Set(graphDiagnostics.map((item) => item.code))].sort();
    const expectedCodes = [...(fixture.expect.diagnostics ?? [])].sort();
    const schemaMatches = fixture.expect.schema === (schemaValid ? "valid" : "invalid");
    const diagnosticsMatch = JSON.stringify(actualCodes) === JSON.stringify(expectedCodes);
    const outcome = schemaMatches && diagnosticsMatch ? "pass" : "fail";
    results.push({ fixture_id: fixture.fixture_id, class: fixture.class, outcome, expected_diagnostics: expectedCodes, actual_diagnostics: actualCodes, ...(schemaValid ? {} : { schema_errors: validate.errors }) });
    console.log(`${outcome.toUpperCase().padEnd(5)} ${fixture.fixture_id} — diagnostics: ${actualCodes.join(", ") || "none"}`);
  }

  const failed = results.filter((result) => result.outcome === "fail").length;
  const report = {
    report_type: "SRTP-draft-fixture-evaluation",
    status: "provisional-draft-non-normative",
    claim_language: "This implementation produced an SRTP draft trace evaluated by the named fixture suite; checks may pass, fail, or remain unevaluated.",
    catalog_version: catalog.catalog_version,
    profile_evaluated: catalog.profile,
    profiles_claimed: [],
    evaluation_status: failed ? "FAIL" : "PASS",
    executed: results.length,
    passed: results.length - failed,
    failed,
    results
  };
  if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag, fallback) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : fallback; };
  const report = runSuite({ manifestPath: value("--manifest", join(fixtureRoot, "fixtures.manifest.json")), outPath: value("--out") });
  process.exitCode = report.failed ? 1 : 0;
}
