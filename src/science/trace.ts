import { codeUnitCompare } from "../paths";
import type { GkxDiagnostic } from "../types";
import {
  EXPERIMENTAL_SRTP_PROFILE,
  type ScientificAssessmentComponent,
  type ScientificAssessmentPolicy,
  type ScientificAssessmentStatus,
  type ScientificComponentResult,
  type ScientificRecord,
  type ScientificTraceAssessment,
  type ScientificTraceEdge,
  type ScientificTraceManifest,
} from "./types";
import { SCIENTIFIC_REFERENCE, scienceDiagnostic, sortScienceDiagnostics, validateScientificRecord } from "./validate";
import { canonicalizeScientificRecord, canonicalizeScientificValue } from "./canonicalize";

type Ref = { target: string; type: string; external?: boolean };

const SOURCE_MUST_NOT_PREDATE_TARGET = new Set([
  "uses_source", "uses_code", "uses_dataset", "snapshots", "requests_input", "requests_code",
  "requests_environment", "manifests_request", "binds_input", "binds_code", "binds_environment",
  "generated_by_event", "generated_by_run", "bound_to_code", "bound_to_input", "bound_to_environment",
  "reviews", "result_of", "negative_result_of", "supported_by_artifact", "supported_by_source",
  "cites", "numeric_trace", "reviewed_by_finding", "compares_run", "binds_execution", "reenters_output",
]);

function refs(record: ScientificRecord): Ref[] {
  const out: Ref[] = [];
  const add = (target: unknown, type: string, external = false) => { if (typeof target === "string" && target) out.push({ target, type, ...(external ? { external: true } : {}) }); };
  const many = (values: unknown, type: string) => { if (Array.isArray(values)) values.forEach((value) => add(value, type)); };
  switch (record.kind) {
    case "scientific_research_object":
      many(record.sourceRefs, "uses_source"); many(record.codeRefs, "uses_code"); many(record.datasetRefs, "uses_dataset"); add(record.contextRef, "governed_by_context", true); add(record.authorizationRef, "authorized_by", true); break;
    case "dataset_snapshot": add(record.sourceRef, "snapshots"); break;
    case "environment_snapshot": many(record.lockfileRefs, "binds_lockfile"); break;
    case "execution_request":
      many(record.inputRefs, "requests_input"); many(record.codeRefs, "requests_code"); add(record.environmentRef, "requests_environment"); add(record.contextRef, "governed_by_context", true); add(record.authorizationRef, "authorized_by", true); break;
    case "execution_event":
      add(record.requestRef, "executes_request"); add(record.runId, "part_of_run"); many(record.artifactRefs, "emits_artifact"); break;
    case "execution_manifest":
      add(record.requestRef, "manifests_request"); many(record.eventRefs, "includes_event"); many(record.inputRefs, "binds_input"); many(record.codeRefs, "binds_code"); add(record.environmentRef, "binds_environment"); many(record.artifactRefs, "registers_artifact"); add(record.contextRef, "governed_by_context", true); add(record.authorizationRef, "authorized_by", true); break;
    case "artifact_record":
      add(record.producingEventRef, "generated_by_event"); add(record.runRef, "generated_by_run"); many(record.codeRefs, "bound_to_code"); many(record.inputRefs, "bound_to_input"); add(record.environmentRef, "bound_to_environment"); break;
    case "reviewer_finding": add(record.targetRef, "reviews"); add(record.reviewerRef, "reviewed_by", true); add(record.decidedByRef, "decided_by", true); break;
    case "scientific_result":
      add(record.runRef, "result_of"); many(record.artifactRefs, "supported_by_artifact"); many(record.sourceRefs, "supported_by_source"); many(record.citationRefs, "cites"); many(record.numericTraceRefs, "numeric_trace"); many(record.reviewRefs, "reviewed_by_finding"); break;
    case "negative_result":
      add(record.runRef, "negative_result_of"); many(record.artifactRefs, "supported_by_artifact"); many(record.sourceRefs, "supported_by_source"); many(record.reviewRefs, "reviewed_by_finding"); break;
    case "rerun_comparison": add(record.runARef, "compares_run"); add(record.runBRef, "compares_run"); break;
    case "reentry_receipt":
      add(record.authorizedUse?.id, "binds_authorized_use", true); add(record.contextManifest?.id, "binds_context", true); add(record.executionManifest?.id, "binds_execution"); record.outputs?.forEach((binding) => add(binding.id, "reenters_output")); break;
  }
  return out;
}

/** Resolve a deterministic typed trace without dropping unresolved or ambiguous relations. */
export function buildScientificTrace(records: readonly ScientificRecord[], traceId: string): ScientificTraceManifest {
  const diagnostics: GkxDiagnostic[] = [];
  if (typeof traceId !== "string" || !SCIENTIFIC_REFERENCE.test(traceId)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-IDENTITY-004", "error", "Trace id must be a UUID or namespaced stable identifier.", "traceId", traceId));
  const ordered = [...records].sort((a, b) => codeUnitCompare(a.id ?? "", b.id ?? "") || codeUnitCompare(a.kind ?? "", b.kind ?? ""));
  const byId = new Map<string, ScientificRecord[]>();
  for (const record of ordered) {
    const validation = validateScientificRecord(record, { experimentalScienceProfile: true });
    diagnostics.push(...validation.diagnostics);
    const matches = byId.get(record.id) ?? [];
    matches.push(record);
    byId.set(record.id, matches);
  }
  for (const [id, matches] of byId) if (matches.length > 1) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-IDENTITY-002", "error", `Identity ${id} is declared by ${matches.length} records and is ambiguous.`, "id", id));

  const edges: ScientificTraceEdge[] = [];
  for (const record of ordered) for (const relation of refs(record)) {
    const matches = byId.get(relation.target) ?? [];
    const resolved = matches.length === 1;
    edges.push({ source: record.id, target: relation.target, type: relation.type, resolved, ...(relation.external ? { external: true } : {}) });
    if (!matches.length && relation.external) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-RELATION-003", "info", `External ${relation.type} binding ${relation.target} is retained for external verification.`, relation.type, record.id));
    else if (!matches.length) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-RELATION-001", "warning", `Unresolved ${relation.type} reference ${relation.target}.`, relation.type, record.id));
    else if (matches.length > 1) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-RELATION-002", "error", `Ambiguous ${relation.type} reference ${relation.target}.`, relation.type, record.id));
    else {
      const target = matches[0];
      const sourceTime = record.kind === "execution_event" ? record.timestamp : record.createdAt;
      const targetTime = target.kind === "execution_event" ? target.timestamp : target.createdAt;
      if (SOURCE_MUST_NOT_PREDATE_TARGET.has(relation.type) && Date.parse(sourceTime) < Date.parse(targetTime)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-TEMPORAL-003", "error", `${record.id} predates referenced evidence ${target.id}.`, relation.type, record.id));
      const ranks = ["public", "internal", "restricted", "confidential", "regulated", "phi", "secret"];
      if (ranks.indexOf(record.sensitivity) < ranks.indexOf(target.sensitivity)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-SENSITIVITY-002", "error", `${record.id} lowers sensitivity relative to ${target.id}.`, relation.type, record.id));
    }
  }
  edges.sort((a, b) => codeUnitCompare(a.source, b.source) || codeUnitCompare(a.type, b.type) || codeUnitCompare(a.target, b.target));
  sortScienceDiagnostics(diagnostics);
  return {
    profile: EXPERIMENTAL_SRTP_PROFILE,
    traceId,
    nodes: ordered.map((record) => ({ id: record.id, kind: record.kind, record: canonicalizeScientificValue(record) as ScientificRecord })),
    edges,
    diagnostics,
    summary: {
      nodeCount: ordered.length,
      edgeCount: edges.length,
      unresolvedReferences: edges.filter((edge) => !edge.external && !edge.resolved && !(byId.get(edge.target)?.length)).length,
      ambiguousIdentities: [...byId.values()].filter((matches) => matches.length > 1).length,
      negativeResults: ordered.filter((record) => record.kind === "negative_result").length,
    },
    extensions: {},
  };
}

const COMPONENTS: ScientificAssessmentComponent[] = [
  "sourceCompleteness", "reproducibilityBindings", "eventChainIntegrity", "artifactTraceability",
  "numericCitationTraceability", "reviewDispositionCompleteness", "reentryCompleteness",
  "negativeResultPreservation", "rerunEvidence", "contextAuthorizationLinkage",
];

function component(status: ScientificAssessmentStatus, diagnostics: GkxDiagnostic[] = [], evidenceRefs: string[] = []): ScientificComponentResult {
  return { status, diagnostics: sortScienceDiagnostics(diagnostics), evidenceRefs: [...new Set(evidenceRefs)].sort(codeUnitCompare) };
}

function verifiedComponent(
  requiredIds: string[],
  results: readonly (ScientificComponentResult & Record<string, unknown>)[] | undefined,
  idField: string,
  absentCode: string,
  absentMessage: string,
): ScientificComponentResult {
  const selected = (results ?? []).filter((result) => result && typeof result === "object" && requiredIds.includes(String(result[idField])));
  const covered = new Set(selected.filter((result) => Array.isArray(result.evidenceRefs) && result.evidenceRefs.includes(String(result[idField]))).map((result) => String(result[idField])));
  const missing = requiredIds.filter((id) => !covered.has(id));
  const diagnostics = selected.flatMap((result) => Array.isArray(result.diagnostics) ? result.diagnostics : []);
  const evidenceRefs = selected.flatMap((result) => Array.isArray(result.evidenceRefs) ? result.evidenceRefs : []);
  if (selected.some((result) => result.status === "FAIL") || diagnostics.some((item) => item?.severity === "error" || item?.severity === "critical")) return component("FAIL", diagnostics, evidenceRefs);
  if (missing.length) return component("UNEVALUATED", [...diagnostics, scienceDiagnostic(absentCode, "warning", absentMessage)], [...evidenceRefs, ...missing]);
  if (selected.some((result) => !["PASS", "FAIL", "UNEVALUATED", "INDETERMINATE", "NOT_APPLICABLE"].includes(result.status as string))) return component("INDETERMINATE", [...diagnostics, scienceDiagnostic(absentCode, "warning", "Verifier evidence contains an unsupported status.")], evidenceRefs);
  if (selected.some((result) => result.status === "INDETERMINATE" || result.status === "NOT_APPLICABLE")) return component("INDETERMINATE", diagnostics, evidenceRefs);
  if (selected.some((result) => result.status === "UNEVALUATED")) return component("UNEVALUATED", diagnostics, evidenceRefs);
  return component("PASS", diagnostics, evidenceRefs);
}

/** Component-by-component trace assessment. It evaluates trace evidence, never scientific truth. */
export function assessScientificTrace(trace: ScientificTraceManifest, policy: ScientificAssessmentPolicy): ScientificTraceAssessment {
  const suppliedRecords = Array.isArray(trace?.nodes) ? trace.nodes.map((node) => node.record) : [];
  const rebuiltTrace = buildScientificTrace(suppliedRecords, trace?.traceId ?? "trace:missing");
  const records = rebuiltTrace.nodes.map((node) => node.record);
  const kinds = (kind: ScientificRecord["kind"]) => records.filter((record) => record.kind === kind);
  const profileDiagnostics = trace?.profile !== EXPERIMENTAL_SRTP_PROFILE ? [scienceDiagnostic("GKX-SCIENCE-PROFILE-001", "error", "Trace does not declare the experimental SRTP profile.", "profile", trace?.traceId)] : [];
  const failedValidation = [...rebuiltTrace.diagnostics, ...(Array.isArray(trace?.diagnostics) ? trace.diagnostics : []), ...profileDiagnostics].filter((d) => d.severity === "error" || d.severity === "critical");
  const unresolved = rebuiltTrace.edges.filter((edge) => !edge.external && !edge.resolved);
  const components = {} as Record<ScientificAssessmentComponent, ScientificComponentResult>;
  components.sourceCompleteness = unresolved.length
    ? component("FAIL", [scienceDiagnostic("GKX-SCIENCE-ASSESS-001", "error", `${unresolved.length} scientific references are unresolved or ambiguous.`)], unresolved.map((edge) => edge.source))
    : records.length ? component("PASS", [], records.map((r) => r.id)) : component("UNEVALUATED", [scienceDiagnostic("GKX-SCIENCE-ASSESS-002", "warning", "No records were supplied.")]);

  const bindingRecords = records.filter((record) => record.kind === "execution_request" || record.kind === "execution_manifest" || record.kind === "artifact_record") as Array<any>;
  const incompleteBindings = bindingRecords.filter((record) => !record.environmentRef || !record.codeRefs?.length || !record.inputRefs?.length);
  components.reproducibilityBindings = !bindingRecords.length ? component("NOT_APPLICABLE") : incompleteBindings.length
    ? component("FAIL", [scienceDiagnostic("GKX-SCIENCE-BINDING-001", "error", "A reproducibility claim lacks code, input, or environment binding.")], incompleteBindings.map((r) => r.id))
    : component("PASS", [], bindingRecords.map((r) => r.id));

  const manifests = kinds("execution_manifest") as Array<any>;
  const events = kinds("execution_event") as Array<any>;
  const eventEvidence = (policy?.verificationEvidence?.eventChains ?? []).filter((verification) => {
    const manifest = manifests.find((item) => item.id === verification.manifestId);
    if (!manifest || verification.verifiedManifestCanonical !== canonicalizeScientificRecord(manifest)) return false;
    const boundEvents = events.filter((event) => manifest.eventRefs.includes(event.id)).sort((a, b) => a.sequence - b.sequence || codeUnitCompare(a.id, b.id));
    return verification.verifiedEventsCanonical === canonicalizeScientificRecord(boundEvents);
  });
  const incompleteChains = manifests.filter((m) => !m.eventRefs?.length || !m.rootEventDigest || !m.finalEventDigest);
  components.eventChainIntegrity = !manifests.length && !events.length ? component("NOT_APPLICABLE") : incompleteChains.length || (!manifests.length && events.length)
    ? component("FAIL", [scienceDiagnostic("GKX-SCIENCE-EVENT-006", "error", "Event-chain metadata is incomplete.")], [...incompleteChains, ...events].map((r) => r.id))
    : verifiedComponent(manifests.map((m) => m.id), eventEvidence as any, "manifestId", "GKX-SCIENCE-EVENT-018", "Event-chain verification evidence is missing or bound to different metadata; field presence is not verification.");

  const artifacts = kinds("artifact_record") as Array<any>;
  const artifactEvidence = (policy?.verificationEvidence?.artifactBindings ?? []).filter((verification) => {
    const artifact = artifacts.find((item) => item.id === verification.artifactId);
    const producer = records.find((item) => item.id === artifact?.producingEventRef);
    const run = records.find((item) => item.id === artifact?.runRef);
    return verification.traceId === trace.traceId && !!artifact
      && verification.verifiedArtifactCanonical === canonicalizeScientificRecord(artifact)
      && verification.verifiedProducerCanonical === (producer ? canonicalizeScientificRecord(producer) : undefined)
      && verification.verifiedRunCanonical === (run ? canonicalizeScientificRecord(run) : undefined);
  });
  const claimedArtifactRefs = records.flatMap((record: any) => record.artifactRefs ?? []);
  const incompleteArtifacts = artifacts.filter((a) => !a.digest || !a.producingEventRef || !a.runRef);
  components.artifactTraceability = !artifacts.length && claimedArtifactRefs.length ? component("FAIL", [scienceDiagnostic("GKX-SCIENCE-ARTIFACT-001", "error", "Records claim artifacts but no artifact records are present.")], claimedArtifactRefs)
    : !artifacts.length ? component("NOT_APPLICABLE") : incompleteArtifacts.length
    ? component("FAIL", [scienceDiagnostic("GKX-SCIENCE-ARTIFACT-001", "error", "Artifact lacks a digest or producing event/run binding.")], incompleteArtifacts.map((r) => r.id))
    : verifiedComponent(artifacts.map((a) => a.id), artifactEvidence as any, "artifactId", "GKX-SCIENCE-ARTIFACT-011", "Artifact verification evidence is missing or bound to different metadata; field presence is not verification.");

  const results = kinds("scientific_result") as Array<any>;
  const missingTrace = results.filter((r) => !r.citationRefs?.length || !r.numericTraceRefs?.length);
  components.numericCitationTraceability = !results.length ? component("NOT_APPLICABLE") : missingTrace.length
    ? component("UNEVALUATED", [scienceDiagnostic("GKX-SCIENCE-RESULT-001", "warning", "Numeric or citation traceability was not declared.")], missingTrace.map((r) => r.id))
    : component("PASS", [], results.map((r) => r.id));

  const reviews = kinds("reviewer_finding") as Array<any>;
  const openReviews = reviews.filter((r) => !r.disposition || r.disposition === "open" || !r.decidedByRef || r.decidedByRef === r.reviewerRef);
  components.reviewDispositionCompleteness = !reviews.length && (results.length || kinds("negative_result").length) ? component("UNEVALUATED", [scienceDiagnostic("GKX-SCIENCE-REVIEW-002", "warning", "Results are present without review findings.")], [...results, ...kinds("negative_result")].map((r) => r.id))
    : !reviews.length ? component("NOT_APPLICABLE") : openReviews.length
    ? component("FAIL", [scienceDiagnostic("GKX-SCIENCE-REVIEW-001", "error", "Review is open, undisposed, or self-decided.")], openReviews.map((r) => r.id))
    : component("PASS", [], reviews.map((r) => r.id));

  const receipts = kinds("reentry_receipt") as Array<any>;
  const reentryEvidence = (policy?.verificationEvidence?.reentryReceipts ?? []).filter((verification) => {
    const receipt = receipts.find((item) => item.id === verification.receiptId);
    return !!receipt && verification.verifiedReceiptCanonical === canonicalizeScientificRecord(receipt);
  });
  const invalidReceipts = receipts.filter((r) => !r.authorizedUse?.digest || !r.contextManifest?.digest || !r.executionManifest?.digest || !r.outputs?.length);
  const reentryExpected = manifests.some((manifest: any) => manifest.status === "closed") && (artifacts.length || results.length || kinds("negative_result").length);
  components.reentryCompleteness = !receipts.length && reentryExpected ? component("UNEVALUATED", [scienceDiagnostic("GKX-SCIENCE-REENTRY-014", "warning", "Closed scientific outputs are present without re-entry evidence.")], manifests.map((r) => r.id))
    : !receipts.length ? component("NOT_APPLICABLE") : invalidReceipts.length
    ? component("FAIL", [scienceDiagnostic("GKX-SCIENCE-REENTRY-002", "error", "Re-entry receipt is missing authority, context, execution, or output bindings.")], invalidReceipts.map((r) => r.id))
    : verifiedComponent(receipts.map((r) => r.id), reentryEvidence as any, "receiptId", "GKX-SCIENCE-REENTRY-011", "Re-entry verification evidence is missing or bound to a different receipt; field presence is not verification.");

  const negatives = kinds("negative_result") as Array<any>;
  const discarded = negatives.filter((r) => r.preserved !== true);
  components.negativeResultPreservation = !negatives.length ? component("NOT_APPLICABLE") : discarded.length
    ? component("FAIL", [scienceDiagnostic("GKX-SCIENCE-NEGATIVE-001", "error", "A negative result was not explicitly preserved.")], discarded.map((r) => r.id))
    : component("PASS", [], negatives.map((r) => r.id));

  const comparisons = kinds("rerun_comparison") as Array<any>;
  components.rerunEvidence = !manifests.length ? component("NOT_APPLICABLE") : !comparisons.length
    ? component("UNEVALUATED", [scienceDiagnostic("GKX-SCIENCE-RERUN-001", "warning", "No rerun comparison evidence is present.")], manifests.map((r) => r.id))
    : component(comparisons.some((r) => r.overall === "FAIL") ? "FAIL" : comparisons.some((r) => r.overall !== "PASS") ? "INDETERMINATE" : "PASS", [], comparisons.map((r) => r.id));

  const contextual = records.filter((r) => r.kind === "scientific_research_object" || r.kind === "execution_request" || r.kind === "execution_manifest") as Array<any>;
  const contextMissing = contextual.filter((r) => !r.contextRef || !r.authorizationRef);
  components.contextAuthorizationLinkage = !contextual.length ? component("NOT_APPLICABLE") : contextMissing.length
    ? component("FAIL", [scienceDiagnostic("GKX-SCIENCE-AUTH-001", "error", "Context or authorization linkage is missing.")], contextMissing.map((r) => r.id))
    : component("UNEVALUATED", [scienceDiagnostic("GKX-SCIENCE-AUTH-002", "warning", "Context and authorization identifiers are present but require external binding verification.")], contextual.map((r) => r.id));

  const mandatory = policy?.mandatoryComponents ?? COMPONENTS;
  const invalidMandatory = mandatory.filter((name) => !COMPONENTS.includes(name));
  let overall: ScientificAssessmentStatus = "PASS";
  const statuses = mandatory.filter((name) => COMPONENTS.includes(name)).map((name) => components[name].status);
  if (!policy?.id || invalidMandatory.length || failedValidation.length || statuses.includes("FAIL")) overall = "FAIL";
  else if (statuses.includes("INDETERMINATE")) overall = "INDETERMINATE";
  else if (statuses.includes("UNEVALUATED")) overall = "UNEVALUATED";
  else if (statuses.every((status) => status === "NOT_APPLICABLE")) overall = "NOT_APPLICABLE";
  const policyDiagnostics = !policy?.id || invalidMandatory.length ? [scienceDiagnostic("GKX-SCIENCE-ASSESS-003", "error", "Assessment policy id and mandatory component names must be valid.", "policy")] : [];
  const diagnostics = sortScienceDiagnostics([...failedValidation, ...policyDiagnostics, ...COMPONENTS.flatMap((name) => components[name].diagnostics)]);
  return { profile: EXPERIMENTAL_SRTP_PROFILE, traceId: trace.traceId, policyId: policy?.id ?? "policy:missing", components, overall, diagnostics, interpretation: "trace-completeness-and-binding-not-scientific-truth", extensions: {} };
}
