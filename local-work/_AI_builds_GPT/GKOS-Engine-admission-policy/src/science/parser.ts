import { EXPERIMENTAL_SRTP_PROFILE, type ScientificRecord, type ScientificRecordKind, type ScientificValidationOptions } from "./types";

const KINDS = new Set<ScientificRecordKind>([
  "scientific_research_object", "dataset_snapshot", "environment_snapshot", "execution_request",
  "execution_event", "execution_manifest", "artifact_record", "reviewer_finding", "scientific_result",
  "negative_result", "rerun_comparison", "reentry_receipt",
]);

const ALIASES: Record<string, string> = {
  schema_version: "schemaVersion", created_at: "createdAt", updated_at: "updatedAt", source_refs: "sourceRefs",
  code_refs: "codeRefs", dataset_refs: "datasetRefs", context_ref: "contextRef", authorization_ref: "authorizationRef",
  source_ref: "sourceRef", media_type: "mediaType", lockfile_refs: "lockfileRefs", input_refs: "inputRefs",
  environment_ref: "environmentRef", parameters_digest: "parametersDigest", run_id: "runId", request_ref: "requestRef",
  event_type: "eventType", previous_digest: "previousDigest", artifact_refs: "artifactRefs", artifact_digests: "artifactDigests",
  event_refs: "eventRefs", root_event_digest: "rootEventDigest", final_event_digest: "finalEventDigest",
  producing_event_ref: "producingEventRef", run_ref: "runRef", bytes_available: "bytesAvailable", target_ref: "targetRef",
  code_digests: "codeDigests", input_digests: "inputDigests", environment_digest: "environmentDigest",
  reviewer_ref: "reviewerRef", decided_by_ref: "decidedByRef", citation_refs: "citationRefs", numeric_trace_refs: "numericTraceRefs",
  review_refs: "reviewRefs", policy_id: "policyId", run_a_ref: "runARef", run_b_ref: "runBRef",
  authorized_use: "authorizedUse", context_manifest: "contextManifest", execution_manifest: "executionManifest",
};

const BASE_FIELDS = ["id", "kind", "profile", "schemaVersion", "createdAt", "updatedAt", "sensitivity", "origin", "extensions"];
const KIND_FIELDS: Record<ScientificRecordKind, string[]> = {
  scientific_research_object: ["title", "sourceRefs", "codeRefs", "datasetRefs", "contextRef", "authorizationRef"],
  dataset_snapshot: ["digest", "sourceRef", "mediaType"],
  environment_snapshot: ["digest", "lockfileRefs"],
  execution_request: ["inputRefs", "codeRefs", "environmentRef", "parameters", "parametersDigest", "seed", "contextRef", "authorizationRef"],
  execution_event: ["runId", "requestRef", "sequence", "eventType", "timestamp", "previousDigest", "digest", "artifactRefs", "artifactDigests"],
  execution_manifest: ["digest", "requestRef", "eventRefs", "inputRefs", "codeRefs", "inputDigests", "codeDigests", "environmentRef", "environmentDigest", "parameters", "seed", "rootEventDigest", "finalEventDigest", "status", "artifactRefs", "artifactDigests", "contextRef", "authorizationRef"],
  artifact_record: ["digest", "producingEventRef", "runRef", "codeRefs", "inputRefs", "environmentRef", "codeDigests", "inputDigests", "environmentDigest", "mediaType", "bytesAvailable"],
  reviewer_finding: ["targetRef", "reviewerRef", "finding", "disposition", "decidedByRef"],
  scientific_result: ["runRef", "artifactRefs", "sourceRefs", "citationRefs", "numericTraceRefs", "reviewRefs", "conclusion"],
  negative_result: ["runRef", "artifactRefs", "sourceRefs", "reviewRefs", "reason", "preserved"],
  rerun_comparison: ["runARef", "runBRef", "policyId", "components", "overall"],
  reentry_receipt: ["authorizedUse", "contextManifest", "executionManifest", "outputs"],
};

const ARRAY_DEFAULTS = new Set(["sourceRefs", "codeRefs", "datasetRefs", "lockfileRefs", "inputRefs", "artifactRefs", "eventRefs", "citationRefs", "numericTraceRefs", "reviewRefs", "outputs", "components"]);

/**
 * Convert a provider JSON object into the neutral SRTP shape. Unknown fields are
 * retained under extensions; this parser does not grant them authored authority.
 */
export function parseScientificRecord(input: unknown, options: ScientificValidationOptions): ScientificRecord {
  if (!options?.experimentalScienceProfile) throw new Error("experimentalScienceProfile: true is required for draft SRTP parsing.");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Scientific record must be a JSON object.");
  const source = input as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  const aliasCollisions: Record<string, unknown> = {};
  // Canonical keys always win regardless of provider key order. A colliding
  // alias remains non-authoritative extension evidence instead of disappearing.
  for (const [key, value] of Object.entries(source)) if (!ALIASES[key]) normalized[key] = value;
  for (const [key, value] of Object.entries(source)) if (ALIASES[key]) {
    const canonical = ALIASES[key];
    if (Object.prototype.hasOwnProperty.call(normalized, canonical)) aliasCollisions[key] = value;
    else normalized[canonical] = value;
  }
  const kind = normalized.kind;
  if (typeof kind !== "string" || !KINDS.has(kind as ScientificRecordKind)) throw new TypeError(`Unknown scientific record kind: ${String(kind)}.`);
  const known = new Set([...BASE_FIELDS, ...KIND_FIELDS[kind as ScientificRecordKind]]);
  const suppliedExtensions = normalized.extensions && typeof normalized.extensions === "object" && !Array.isArray(normalized.extensions)
    ? { ...(normalized.extensions as Record<string, unknown>) }
    : {};
  if (normalized.extensions !== undefined && (!normalized.extensions || typeof normalized.extensions !== "object" || Array.isArray(normalized.extensions))) suppliedExtensions.__invalid_extensions = normalized.extensions;
  const extensionCollisions: Record<string, unknown> = {};
  const retainExtension = (key: string, value: unknown) => {
    if (Object.prototype.hasOwnProperty.call(suppliedExtensions, key)) extensionCollisions[key] = suppliedExtensions[key];
    suppliedExtensions[key] = value;
  };
  for (const [key, value] of Object.entries(normalized)) if (!known.has(key)) retainExtension(key, value);
  for (const [key, value] of Object.entries(aliasCollisions)) retainExtension(key, value);
  if (Object.keys(extensionCollisions).length) suppliedExtensions.__extension_collisions = extensionCollisions;
  const output: Record<string, unknown> = {
    id: normalized.id,
    kind,
    profile: normalized.profile ?? EXPERIMENTAL_SRTP_PROFILE,
    schemaVersion: normalized.schemaVersion ?? "experimental",
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    sensitivity: normalized.sensitivity,
    origin: normalized.origin,
    extensions: suppliedExtensions,
  };
  for (const field of KIND_FIELDS[kind as ScientificRecordKind]) {
    const value = normalized[field];
    if (value !== undefined) output[field] = value;
    else if (ARRAY_DEFAULTS.has(field)) output[field] = [];
  }
  return output as unknown as ScientificRecord;
}
