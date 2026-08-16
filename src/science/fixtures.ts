import { codeUnitCompare } from "../paths";
import { EXPERIMENTAL_SRTP_PROFILE, type ScientificValidationOptions } from "./types";

/** Exact workspace-draft coordinates reviewed over gkos-standard base commit 351330ce. */
export const SRTP_DRAFT_FIXTURE_BASELINE = Object.freeze({
  standardBaseCommit: "351330ce34ac6bf9f48ac340e3c259ea30e74715",
  catalogVersion: "SRTP-DRAFT-FIXTURES-0.1.1",
  catalogSha256: "ed9cc63b50ecf332b96c576af9139370a1c708b6145224d881cafefdde8aa651",
  profile: EXPERIMENTAL_SRTP_PROFILE,
  compatibleCoordinates: Object.freeze({
    gkos_publication: ["GKOS-2026-08-05 v0.78"],
    gkx_namespace: ["2.0"],
    projection_profile: ["gkx-2.0-validating-projection"],
    engine_package: ["2.0.1", "2.1.0"],
  }),
  qualifying: false,
});

export interface SrtpDraftDiagnostic { code: string; message: string; path?: string; deterministic: true }
export interface SrtpDraftEvaluation {
  profileEvaluated: typeof EXPERIMENTAL_SRTP_PROFILE;
  profilesClaimed: [];
  status: "PASS" | "FAIL";
  diagnostics: SrtpDraftDiagnostic[];
  interpretation: "draft-fixture-checks-not-scientific-truth";
}

type JsonObject = Record<string, any>;
const SENSITIVITY = ["public", "internal", "restricted", "confidential", "regulated", "phi", "secret"];

/**
 * Evaluate the graph-level rules in the provisional SRTP-DRAFT-0.1 suite.
 * This intentionally makes no qualifying profile claim and does not mutate the trace.
 */
export function evaluateSrtpDraftGraph(trace: JsonObject, options: ScientificValidationOptions): SrtpDraftEvaluation {
  if (!options?.experimentalScienceProfile) throw new Error("experimentalScienceProfile: true is required for draft SRTP evaluation.");
  const diagnostics: SrtpDraftDiagnostic[] = [];
  const add = (code: string, message: string, path?: string) => diagnostics.push({ code, message, ...(path ? { path } : {}), deterministic: true });
  const list = (value: unknown): JsonObject[] => Array.isArray(value) ? value : [];
  const collectionNames = ["datasets", "environments", "execution_requests", "execution_manifests", "execution_events", "artifacts", "results", "reviewer_findings", "rerun_comparisons", "context_manifests", "authorized_uses", "reentry_receipts", "relations"];
  if (!trace || typeof trace !== "object") {
    add("SRTP-SCHEMA-001", "Trace must be an object.", "/");
    return { profileEvaluated: EXPERIMENTAL_SRTP_PROFILE, profilesClaimed: [], status: "FAIL", diagnostics, interpretation: "draft-fixture-checks-not-scientific-truth" };
  }
  if (!trace.trace_id || !trace.created_at || !trace.version_coordinates || !trace.profile_status || !trace.evaluation_status || collectionNames.some((name) => !Array.isArray(trace[name]))) add("SRTP-SCHEMA-001", "Trace is missing a required draft field or collection.", "/");
  const compatible = SRTP_DRAFT_FIXTURE_BASELINE.compatibleCoordinates;
  if (trace.profile !== EXPERIMENTAL_SRTP_PROFILE) add("SRTP-VERSION-001", `Unsupported profile '${String(trace.profile)}'`, "/profile");
  if (trace.profile_status !== "provisional-draft-non-normative") add("SRTP-VERSION-001", `Unsupported profile status '${trace.profile_status}'`, "/profile_status");
  for (const coordinate of Object.keys(compatible) as Array<keyof typeof compatible>) {
    if (!(compatible[coordinate] as readonly string[]).includes(trace.version_coordinates?.[coordinate])) add("SRTP-VERSION-001", `Unsupported ${coordinate} '${trace.version_coordinates?.[coordinate]}'`, `/version_coordinates/${coordinate}`);
  }
  const collections = ["research_objects", "datasets", "environments", "execution_requests", "execution_manifests", "execution_events", "artifacts", "results", "reviewer_findings", "rerun_comparisons"];
  const records = collections.flatMap((key) => list(trace[key]));
  const byId = new Map(records.map((record: JsonObject) => [record.id, record]));
  for (const item of [...list(trace.context_manifests), ...list(trace.authorized_uses)]) byId.set(item.id, item);
  for (const receipt of list(trace.reentry_receipts)) byId.set(receipt.receipt_id, receipt);
  const allIdentities = [...records.map((record) => record.id), ...list(trace.context_manifests).map((item) => item.id), ...list(trace.authorized_uses).map((item) => item.id), ...list(trace.reentry_receipts).map((item) => item.receipt_id)];
  if (new Set(allIdentities).size !== allIdentities.length) add("SRTP-GRAPH-001", "Trace contains duplicate governed identities", "/");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  list(trace.relations).forEach((relation, index) => {
    if ((uuid.test(relation.from) && !byId.has(relation.from)) || (uuid.test(relation.to) && !byId.has(relation.to))) add("SRTP-GRAPH-001", "Relation contains an unresolved governed identity", `/relations/${index}`);
  });
  for (const record of records) if (record.derived_sensitivity && SENSITIVITY.indexOf(record.derived_sensitivity) < SENSITIVITY.indexOf(record.sensitivity)) add("SRTP-SENSITIVITY-001", `Derived sensitivity lowers ${record.sensitivity} to ${record.derived_sensitivity}`, `/id/${record.id}`);

  const contexts = new Map(list(trace.context_manifests).map((item: JsonObject) => [item.id, item]));
  const uses = new Map(list(trace.authorized_uses).map((item: JsonObject) => [item.id, item]));
  const requests = new Map(list(trace.execution_requests).map((item: JsonObject) => [item.id, item]));
  const manifests = new Map(list(trace.execution_manifests).map((item: JsonObject) => [item.id, item]));
  const datasets = new Map(list(trace.datasets).map((item: JsonObject) => [item.id, item]));
  const environments = new Map(list(trace.environments).map((item: JsonObject) => [item.id, item]));
  const events = new Map(list(trace.execution_events).map((item: JsonObject) => [item.id, item]));
  const artifacts = new Map(list(trace.artifacts).map((item: JsonObject) => [item.id, item]));
  const sameDigestSet = (actual: unknown[] = [], expected: unknown[] = []) => {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
    const actualSet = new Set(actual), expectedSet = new Set(expected);
    return actual.length === actualSet.size && expected.length === expectedSet.size && actualSet.size === expectedSet.size && [...actualSet].every((digest) => expectedSet.has(digest));
  };
  const noLessSensitive = (candidate: string, baseline: string) => SENSITIVITY.indexOf(candidate) >= SENSITIVITY.indexOf(baseline);
  const manifestDigests = list(trace.execution_manifests).map((item) => item.content_digest);
  if (new Set(manifestDigests).size !== manifestDigests.length) add("SRTP-GRAPH-001", "Multiple execution manifests claim the same content digest", "/execution_manifests");
  for (const request of list(trace.execution_requests)) {
    const context = contexts.get(request.context_manifest_id) as JsonObject | undefined;
    const use = uses.get(request.authorized_use_id) as JsonObject | undefined;
    if (!context || !use || use.context_manifest_id !== context.id || use.context_manifest_digest !== context.digest || new Date(context.expires_at) <= new Date(use.authorized_at)) add("SRTP-CONTEXT-001", `Missing, mismatched, or expired context for request ${request.id}`, `/execution_requests/${request.id}`);
    if ((context && !noLessSensitive(context.sensitivity, request.sensitivity)) || (use && !noLessSensitive(use.sensitivity, request.sensitivity))) add("SRTP-SENSITIVITY-001", `Context or authorization lowers request sensitivity for ${request.id}`, `/execution_requests/${request.id}`);
  }
  const referencedEventIds = new Set<string>();
  for (const manifest of list(trace.execution_manifests)) {
    const request = requests.get(manifest.request_id) as JsonObject | undefined;
    const use = request && uses.get(request.authorized_use_id) as JsonObject | undefined;
    const environment = request && environments.get(request.environment_id) as JsonObject | undefined;
    if (!use || manifest.created_by !== use.actor) add("SRTP-EXEC-003", `Execution ${manifest.id} actor does not match its authorization`, `/execution_manifests/${manifest.id}/created_by`);
    if (!environment || manifest.environment_digest !== environment.snapshot_digest) add("SRTP-EXEC-001", `Execution ${manifest.id} lacks its authorized environment snapshot`, `/execution_manifests/${manifest.id}/environment_digest`);
    if (!request || manifest.code_digest !== request.code_digest) add("SRTP-EXEC-002", `Execution ${manifest.id} code does not resolve to its request`, `/execution_manifests/${manifest.id}/code_digest`);
    const expectedDatasetDigests = request ? (request.dataset_ids ?? []).map((id: string) => (datasets.get(id) as JsonObject | undefined)?.snapshot_digest).filter(Boolean) : [];
    if (!request || expectedDatasetDigests.length !== request.dataset_ids.length || !sameDigestSet(manifest.dataset_digests, expectedDatasetDigests) || manifest.parameters_digest !== request.parameters_digest || manifest.seed !== request.seed) add("SRTP-INPUT-001", `Execution ${manifest.id} does not match its requested data, parameters, or seed`, `/execution_manifests/${manifest.id}`);
    const material = [manifest.code_digest, ...(manifest.dataset_digests ?? []), manifest.environment_digest, manifest.parameters_digest];
    if (!use || material.some((digest) => !Array.isArray(use.input_digests) || !use.input_digests.includes(digest))) add("SRTP-INPUT-001", `Execution ${manifest.id} used a digest not bound by authorization`, `/execution_manifests/${manifest.id}`);
    const ordered = (manifest.event_ids ?? []).map((id) => events.get(id) as JsonObject | undefined);
    (manifest.event_ids ?? []).forEach((id: string) => referencedEventIds.add(id));
    if (ordered.some((event) => !event) || ordered.some((event, index) => event!.manifest_id !== manifest.id || event!.sequence !== index || (index === 0 ? event!.previous_event_digest !== null : event!.previous_event_digest !== ordered[index - 1]!.event_digest))) add("SRTP-EVENT-001", `Execution ${manifest.id} event sequence is missing or not hash-linked`, `/execution_manifests/${manifest.id}/event_ids`);
    if (manifest.state === "recovered" && (!manifest.recovery_of || !ordered.some((event) => event?.event_kind === "recovery"))) add("SRTP-RECOVERY-001", `Recovered execution ${manifest.id} lacks recovery evidence`, `/execution_manifests/${manifest.id}/state`);
    if (request && !noLessSensitive(manifest.sensitivity, request.sensitivity)) add("SRTP-SENSITIVITY-001", `Execution ${manifest.id} lowers request sensitivity`, `/execution_manifests/${manifest.id}/sensitivity`);
  }
  for (const event of list(trace.execution_events)) if (!referencedEventIds.has(event.id) || !manifests.has(event.manifest_id)) add("SRTP-EVENT-001", `Execution event ${event.id} is orphaned`, `/execution_events/${event.id}`);
  for (const artifact of list(trace.artifacts)) {
    const event = events.get(artifact.generating_event_id) as JsonObject | undefined;
    const manifest = event && manifests.get(event.manifest_id) as JsonObject | undefined;
    if (artifact.artifact_digest !== artifact.registered_source_digest || !event || !event.output_digests?.includes(artifact.artifact_digest) || !manifest || !manifest.event_ids.includes(event.id) || artifact.code_digest !== manifest.code_digest || !sameDigestSet(artifact.dataset_digests, manifest.dataset_digests) || artifact.environment_digest !== manifest.environment_digest) add("SRTP-ARTIFACT-001", `Artifact ${artifact.id} does not match its registered source or producing event`, `/artifacts/${artifact.id}`);
    if (manifest && !noLessSensitive(artifact.sensitivity, manifest.sensitivity)) add("SRTP-SENSITIVITY-001", `Artifact ${artifact.id} lowers execution sensitivity`, `/artifacts/${artifact.id}/sensitivity`);
  }
  const numericEvidenceIds = new Set([...artifacts.keys(), ...datasets.keys(), ...list(trace.research_objects).filter((item) => item.srtp_type === "srtp:Observation").map((item) => item.id)]);
  for (const result of list(trace.results)) for (const claim of list(result.numeric_claims)) if (!events.has(claim.calculation_event_id) || !Array.isArray(claim.evidence_ids) || claim.evidence_ids.some((id) => !numericEvidenceIds.has(id))) add("SRTP-CLAIM-001", `Numeric claim in ${result.id} is not traceable`, `/results/${result.id}/numeric_claims`);
  for (const finding of list(trace.reviewer_findings)) {
    if (finding.approved_by && finding.approved_by === finding.reviewer) add("SRTP-REVIEW-001", `Reviewer ${finding.reviewer} attempted self-approval`, `/reviewer_findings/${finding.id}/approved_by`);
    const deterministic = finding.conflicts_with_deterministic_finding_id && byId.get(finding.conflicts_with_deterministic_finding_id) as JsonObject | undefined;
    if (deterministic?.deterministic && deterministic.evaluation === "FAIL" && finding.evaluation === "PASS") add("SRTP-REVIEW-002", `Model finding ${finding.id} conflicts with deterministic failure`, `/reviewer_findings/${finding.id}`);
  }
  const manifestsByDigest = new Map(list(trace.execution_manifests).map((item: JsonObject) => [item.content_digest, item]));
  const receiptedManifestDigests = new Set<string>();
  for (const receipt of list(trace.reentry_receipts)) {
    const manifest = manifestsByDigest.get(receipt.execution_manifest_digest) as JsonObject | undefined;
    if (manifest) receiptedManifestDigests.add(manifest.content_digest);
    if (receipt.receipt_status === "unavailable") { add("SRTP-REENTRY-002", `Output exists but receipt ${receipt.receipt_id} is unavailable`, `/reentry_receipts/${receipt.receipt_id}`); continue; }
    const use = uses.get(receipt.authorized_use_id) as JsonObject | undefined;
    const context = use && contexts.get(use.context_manifest_id) as JsonObject | undefined;
    const request = manifest && requests.get(manifest.request_id) as JsonObject | undefined;
    const orderedEvents = manifest?.event_ids.map((id: string) => events.get(id) as JsonObject | undefined) ?? [];
    const expectedSources = manifest && orderedEvents.every(Boolean) ? [manifest.content_digest, ...orderedEvents.map((event) => event!.event_digest)] : [];
    const runEventIds = new Set(manifest?.event_ids ?? []);
    const expectedArtifacts = list(trace.artifacts).filter((artifact) => runEventIds.has(artifact.generating_event_id)).map((artifact) => artifact.artifact_digest);
    const complete = receipt.receipt_status === "complete" && use && context && request && request.authorized_use_id === receipt.authorized_use_id && request.context_manifest_id === use.context_manifest_id && receipt.context_manifest_digest === context.digest && manifest && orderedEvents.every(Boolean) && sameDigestSet(receipt.new_source_digests, expectedSources) && sameDigestSet(receipt.new_artifact_digests, expectedArtifacts);
    if (!complete) add("SRTP-REENTRY-001", `Re-entry receipt ${receipt.receipt_id} is incomplete or unbound`, `/reentry_receipts/${receipt.receipt_id}`);
    const receiptBaseline = [use?.sensitivity, context?.sensitivity, manifest?.sensitivity].filter(Boolean).sort((a, b) => SENSITIVITY.indexOf(b) - SENSITIVITY.indexOf(a))[0];
    if (receiptBaseline && !noLessSensitive(receipt.sensitivity, receiptBaseline)) add("SRTP-SENSITIVITY-001", `Re-entry receipt ${receipt.receipt_id} lowers linked sensitivity`, `/reentry_receipts/${receipt.receipt_id}/sensitivity`);
  }
  for (const manifest of list(trace.execution_manifests)) if (!receiptedManifestDigests.has(manifest.content_digest)) add("SRTP-REENTRY-001", `Execution ${manifest.id} has no re-entry receipt`, `/execution_manifests/${manifest.id}`);
  diagnostics.sort((a, b) => codeUnitCompare(a.code, b.code) || codeUnitCompare(a.path ?? "", b.path ?? "") || codeUnitCompare(a.message, b.message));
  return { profileEvaluated: EXPERIMENTAL_SRTP_PROFILE, profilesClaimed: [], status: diagnostics.length ? "FAIL" : "PASS", diagnostics, interpretation: "draft-fixture-checks-not-scientific-truth" };
}
