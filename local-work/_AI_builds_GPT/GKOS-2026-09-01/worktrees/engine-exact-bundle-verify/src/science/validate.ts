import { codeUnitCompare } from "../paths";
import { isValidGkxTimestamp } from "../timestamps";
import type { GkxDiagnostic, GkxOrigin, GkxSensitivity } from "../types";
import {
  EXPERIMENTAL_SRTP_PROFILE,
  type ScientificRecord,
  type ScientificValidationOptions,
  type ScientificValidationResult,
} from "./types";

export const SCIENTIFIC_REFERENCE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[a-z][a-z0-9_.-]*:[a-z0-9][a-z0-9_.:/-]{1,})$/i;
export const SCIENTIFIC_DIGEST = /^sha256:[0-9a-f]{64}$/;
const SENSITIVITIES: GkxSensitivity[] = ["public", "internal", "restricted", "confidential", "regulated", "phi", "secret"];
const ORIGINS: GkxOrigin[] = ["authored", "derived", "proposed", "approved"];
const RESERVED_EXTENSION_KEYS = new Set(["approved", "approvedState", "effective", "effectiveSensitivity", "effective_sensitivity", "origin", "sensitivity", "digest", "authorization", "authorizedUse"]);
const RECORD_KINDS = new Set(["scientific_research_object", "dataset_snapshot", "environment_snapshot", "execution_request", "execution_event", "execution_manifest", "artifact_record", "reviewer_finding", "scientific_result", "negative_result", "rerun_comparison", "reentry_receipt"]);
const ARRAY_FIELDS = new Set(["sourceRefs", "codeRefs", "datasetRefs", "lockfileRefs", "inputRefs", "artifactRefs", "eventRefs", "citationRefs", "numericTraceRefs", "reviewRefs", "outputs", "components"]);

export function scienceDiagnostic(code: string, severity: GkxDiagnostic["severity"], message: string, field?: string, targetUid?: string): GkxDiagnostic {
  return { code, severity, message, field, targetUid, deterministic: true };
}

export function sortScienceDiagnostics(diagnostics: GkxDiagnostic[]): GkxDiagnostic[] {
  return diagnostics.sort((a, b) => codeUnitCompare(a.code, b.code) || codeUnitCompare(a.field ?? "", b.field ?? "") || codeUnitCompare(a.message, b.message));
}

function references(record: ScientificRecord): Array<[string, unknown]> {
  const output: Array<[string, unknown]> = [];
  const source = record as unknown as Record<string, unknown>;
  for (const field of ["sourceRef", "contextRef", "authorizationRef", "environmentRef", "requestRef", "producingEventRef", "runRef", "targetRef", "reviewerRef", "decidedByRef", "runARef", "runBRef", "runId"]) {
    if (source[field] !== undefined) output.push([field, source[field]]);
  }
  for (const field of ["sourceRefs", "codeRefs", "datasetRefs", "lockfileRefs", "inputRefs", "artifactRefs", "eventRefs", "citationRefs", "numericTraceRefs", "reviewRefs"]) {
    const list = source[field];
    if (Array.isArray(list)) list.forEach((value, index) => output.push([`${field}.${index}`, value]));
  }
  return output;
}

function requiredFields(record: ScientificRecord): string[] {
  switch (record.kind) {
    case "dataset_snapshot": return ["digest"];
    case "environment_snapshot": return ["digest"];
    case "execution_request": return ["inputRefs", "codeRefs", "environmentRef"];
    case "execution_event": return ["runId", "requestRef", "sequence", "eventType", "timestamp", "digest"];
    case "execution_manifest": return ["digest", "requestRef", "eventRefs", "inputRefs", "codeRefs", "environmentRef", "status"];
    case "artifact_record": return ["digest", "producingEventRef", "runRef", "codeRefs", "inputRefs", "environmentRef"];
    case "reviewer_finding": return ["targetRef", "reviewerRef", "finding"];
    case "scientific_result": return ["runRef", "artifactRefs", "sourceRefs"];
    case "negative_result": return ["runRef", "preserved"];
    case "rerun_comparison": return ["runARef", "runBRef", "policyId", "components", "overall"];
    case "reentry_receipt": return ["authorizedUse", "contextManifest", "executionManifest", "outputs"];
    default: return [];
  }
}

function missing(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/** Deterministic, read-only validation for the experimental provider-neutral record shape. */
export function validateScientificRecord(record: ScientificRecord, options: ScientificValidationOptions): ScientificValidationResult {
  const diagnostics: GkxDiagnostic[] = [];
  if (!options?.experimentalScienceProfile) {
    diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EXPERIMENTAL-001", "error", "Draft SRTP validation requires experimentalScienceProfile: true.", "profile", record?.id));
    return { valid: false, diagnostics };
  }
  if (!record || typeof record !== "object") {
    diagnostics.push(scienceDiagnostic("GKX-SCIENCE-SCHEMA-001", "error", "Scientific record must be an object."));
    return { valid: false, diagnostics };
  }
  if (!RECORD_KINDS.has(record.kind)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-SCHEMA-003", "error", `Unknown scientific record kind ${String(record.kind)}.`, "kind", record.id));
  const allowed = options.allowedProfiles ?? [EXPERIMENTAL_SRTP_PROFILE];
  if (!allowed.includes(record.profile)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-PROFILE-001", "error", `Unsupported scientific profile ${String(record.profile)}.`, "profile", record.id));
  if (record.schemaVersion !== "experimental") diagnostics.push(scienceDiagnostic("GKX-SCIENCE-PROFILE-002", "error", "Draft records must declare schemaVersion experimental.", "schemaVersion", record.id));
  if (typeof record.id !== "string" || !SCIENTIFIC_REFERENCE.test(record.id)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-IDENTITY-001", "error", "Record id must be a UUID or namespaced stable identifier.", "id", record.id));
  if (!isValidGkxTimestamp(record.createdAt)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-TEMPORAL-001", "error", "createdAt must be an ISO-8601 timestamp with an explicit zone.", "createdAt", record.id));
  if (record.updatedAt && !isValidGkxTimestamp(record.updatedAt)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-TEMPORAL-001", "error", "updatedAt must be an ISO-8601 timestamp with an explicit zone.", "updatedAt", record.id));
  if (record.updatedAt && isValidGkxTimestamp(record.createdAt) && isValidGkxTimestamp(record.updatedAt) && Date.parse(record.updatedAt) < Date.parse(record.createdAt)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-TEMPORAL-002", "error", "updatedAt precedes createdAt.", "updatedAt", record.id));
  if (!SENSITIVITIES.includes(record.sensitivity)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-SENSITIVITY-001", "error", "Sensitivity must use the seven-level GKX vocabulary.", "sensitivity", record.id));
  if (!ORIGINS.includes(record.origin)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-ORIGIN-001", "error", "Origin must be authored, derived, proposed, or approved.", "origin", record.id));
  if (!record.extensions || typeof record.extensions !== "object" || Array.isArray(record.extensions)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EXTENSION-001", "error", "extensions must be an object.", "extensions", record.id));
  else {
    for (const key of Object.keys(record.extensions)) if (RESERVED_EXTENSION_KEYS.has(key)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EXTENSION-002", "warning", `Extension ${key} resembles an authoritative field but remains non-authoritative.`, `extensions.${key}`, record.id));
    const proposedEffective = record.extensions.effectiveSensitivity ?? record.extensions.effective_sensitivity;
    if (typeof proposedEffective === "string" && SENSITIVITIES.includes(proposedEffective as GkxSensitivity) && SENSITIVITIES.indexOf(proposedEffective as GkxSensitivity) < SENSITIVITIES.indexOf(record.sensitivity)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-SENSITIVITY-002", "error", "Extension attempts to lower effective sensitivity and is rejected.", "extensions.effectiveSensitivity", record.id));
  }

  const source = record as unknown as Record<string, unknown>;
  for (const field of requiredFields(record)) {
    if (missing(source[field])) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-SCHEMA-002", "error", `Required field ${field} is missing.`, field, record.id));
    else if (ARRAY_FIELDS.has(field) && !Array.isArray(source[field])) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-SCHEMA-003", "error", `${field} must be an array.`, field, record.id));
  }
  for (const [field, value] of references(record)) if (typeof value !== "string" || !SCIENTIFIC_REFERENCE.test(value)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REFERENCE-001", "error", `Invalid scientific reference ${String(value)}.`, field, record.id));
  for (const [field, value] of Object.entries(source)) if (/digest$/i.test(field) && value !== undefined && (typeof value !== "string" || !SCIENTIFIC_DIGEST.test(value))) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-DIGEST-001", "error", `${field} must be a lowercase sha256 digest.`, field, record.id));
  if (record.kind === "execution_event") {
    if (!Number.isSafeInteger(record.sequence) || record.sequence < 0) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-001", "error", "Event sequence must be a non-negative safe integer.", "sequence", record.id));
    if (!isValidGkxTimestamp(record.timestamp)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-TEMPORAL-001", "error", "Event timestamp must have an explicit zone.", "timestamp", record.id));
    if (record.previousDigest != null && !SCIENTIFIC_DIGEST.test(record.previousDigest)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-DIGEST-001", "error", "previousDigest must be a lowercase sha256 digest.", "previousDigest", record.id));
    for (const [artifactId, digest] of Object.entries(record.artifactDigests ?? {})) if (!SCIENTIFIC_REFERENCE.test(artifactId) || !SCIENTIFIC_DIGEST.test(digest)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-DIGEST-001", "error", `Invalid registered artifact binding ${artifactId}.`, `artifactDigests.${artifactId}`, record.id));
  }
  if (record.kind === "execution_manifest") {
    if (record.status === "closed" && (!record.rootEventDigest || !record.finalEventDigest)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-EVENT-014", "error", "A closed manifest requires root and final event digests.", "status", record.id));
    if (!["open", "completed", "failed", "closed"].includes(record.status)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-SCHEMA-003", "error", "Invalid execution manifest status.", "status", record.id));
    for (const [artifactId, digest] of Object.entries(record.artifactDigests ?? {})) if (!SCIENTIFIC_REFERENCE.test(artifactId) || !SCIENTIFIC_DIGEST.test(digest)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-DIGEST-001", "error", `Invalid manifest artifact binding ${artifactId}.`, `artifactDigests.${artifactId}`, record.id));
    for (const [field, bindings] of [["inputDigests", record.inputDigests], ["codeDigests", record.codeDigests]] as const) for (const [id, digest] of Object.entries(bindings ?? {})) if (!SCIENTIFIC_REFERENCE.test(id) || !SCIENTIFIC_DIGEST.test(digest)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-DIGEST-001", "error", `Invalid ${field} binding ${id}.`, `${field}.${id}`, record.id));
  }
  if (record.kind === "artifact_record") for (const [field, bindings] of [["inputDigests", record.inputDigests], ["codeDigests", record.codeDigests]] as const) for (const [id, digest] of Object.entries(bindings ?? {})) if (!SCIENTIFIC_REFERENCE.test(id) || !SCIENTIFIC_DIGEST.test(digest)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-DIGEST-001", "error", `Invalid ${field} binding ${id}.`, `${field}.${id}`, record.id));
  if (record.kind === "reviewer_finding" && record.decidedByRef && record.decidedByRef === record.reviewerRef) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REVIEW-001", "error", "A reviewer cannot decide their own finding.", "decidedByRef", record.id));
  if (record.kind === "negative_result" && record.preserved !== true) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-NEGATIVE-001", "error", "Negative results must be explicitly preserved.", "preserved", record.id));
  if (record.kind === "reentry_receipt") {
    for (const [field, binding] of [["authorizedUse", record.authorizedUse], ["contextManifest", record.contextManifest], ["executionManifest", record.executionManifest]] as const) {
      if (!binding || !SCIENTIFIC_REFERENCE.test(binding.id) || !SCIENTIFIC_DIGEST.test(binding.digest)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REENTRY-001", "error", `${field} must bind a stable id to a sha256 digest.`, field, record.id));
    }
    record.outputs?.forEach((binding, index) => {
      if (!binding || !SCIENTIFIC_REFERENCE.test(binding.id) || !SCIENTIFIC_DIGEST.test(binding.digest)) diagnostics.push(scienceDiagnostic("GKX-SCIENCE-REENTRY-001", "error", "Each output must bind a stable id to a sha256 digest.", `outputs.${index}`, record.id));
    });
  }
  sortScienceDiagnostics(diagnostics);
  return { valid: !diagnostics.some((item) => item.severity === "error" || item.severity === "critical"), diagnostics };
}
