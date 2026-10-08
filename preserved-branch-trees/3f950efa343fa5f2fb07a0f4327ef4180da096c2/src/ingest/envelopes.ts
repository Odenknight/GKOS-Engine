import { isValidGkxTimestamp } from "../timestamps";
import { GKX23_RELATION_TYPES } from "../gkx23-relationship-types";
import { normalizeVaultRelative } from "../paths";
import { isValidRetrievalSourcePath } from "../retrieval/chunker";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, stableJson } from "../retrieval/digest";
import {
  INGEST_AUTHORITY_COORDINATES,
  INGEST_BUILTIN_EFFECTIVE_PROFILE_DIGEST,
  INGEST_CURRENT_PROFILE_SELECTOR,
  INGEST_FINDING_CODES,
  INGEST_FINDING_CONTRACT_VERSION,
  INGEST_FINDING_SEVERITY_FLOORS,
  INGEST_REJECTION_CONTRACT_VERSION,
  INGEST_SCAN_REJECTION_CODES,
  INGEST_SEVERITY_ORDER,
  INGEST_SOURCE_OBSERVATION_CONTRACT_VERSION,
  INGEST_VALIDATION_CONTRACT_VERSION,
  type IngestFindingCode,
} from "./contracts";
import { sealNormalizedIngestProfileEnvelope } from "./profile";
import type {
  IngestFinding,
  IngestFindingSeverity,
  IngestNormalizedProfileEnvelope,
  IngestProfileCoordinate,
  IngestRejection,
  IngestSourceObservation,
  IngestValidationResult,
} from "./types";

const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const PROFILE_ID_RE = /^[a-z][a-z0-9._-]{0,63}$/u;
const SAFE_FIELD_RE = /^[A-Za-z][A-Za-z0-9_.-]*(?:\[[0-9]+\](?:\.[A-Za-z][A-Za-z0-9_.-]*)?)?$/u;
const CANONICAL_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const FINDING_CODES = new Set<string>(INGEST_FINDING_CODES);
const SCAN_CODES = new Set<string>(INGEST_SCAN_REJECTION_CODES);
const BLOCKING = new Set<IngestFindingSeverity>(["error", "critical"]);
const PROFILE_RAISEABLE_FINDING_CODES = new Set<IngestFindingCode>([
  "GKX-AUTHORITY-ROLE-001", "GKX-AUTHORITY-ROLE-002", "GKX-EPISTEMIC-002", "GKX-EPISTEMIC-004",
  "GKX-EVIDENCE-002", "GKX-EVIDENCE-003", "GKX-IDENTITY-001", "GKX-IDENTITY-002",
  "GKX-PROVENANCE-001", "GKX-PROVENANCE-002", "GKX-SCHEMA-002", "GKX-SCHEMA-003", "GKX-SCHEMA-004",
  "GKX-SENSITIVITY-005", "GKX-TEMPORAL-001",
]);
const EXACT_FINDING_FIELDS = new Map<IngestFindingCode, string | null>([
  ["AUTHORED_LINK_REFERENCE_INVALID", null],
  ["CANONICAL_PROJECTION_INVALID", null],
  ["CANONICAL_SOURCE_UID_UNAVAILABLE", "uid"],
  ["CANONICAL_VALIDITY_BINDING_MISMATCH", "created_at"],
  ["CANONICAL_VALIDITY_REFERENCE_UNAVAILABLE", null],
  ["CANONICAL_VALIDITY_TIMESTAMP_NONPORTABLE", "created_at"],
  ["GKX-EPISTEMIC-002", "epistemic.state"],
  ["GKX-EPISTEMIC-004", "epistemic.state"],
  ["GKX-IDENTITY-001", "uid"],
  ["GKX-IDENTITY-002", "uid"],
  ["GKX-PROVENANCE-001", "provenance.source_refs"],
  ["GKX-PROVENANCE-002", "provenance.content_hash"],
  ["GKX-SCHEMA-002", "gkx_version"],
  ["GKX-SCHEMA-003", "gkx_version"],
  ["GKX-SENSITIVITY-001", "sensitivity.level"],
  ["GKX-SENSITIVITY-005", "sensitivity.level"],
  ["GKX_INGEST_PROFILE_VERSION_REQUIRED", "gkx_version"],
  ["GKX_INGEST_UID_REQUIRED", "uid"],
  ["GKX_PROFILE_SENSITIVITY_BELOW_MINIMUM", "sensitivity.level"],
]);
const AUTHORED_RELATIONSHIP_FINDING_BASE_FIELDS = new Set<string>([
  "relationships",
  "supersedes",
  "superseded_by",
  ...GKX23_RELATION_TYPES
    .filter((field) => field !== "supersedes" && field !== "superseded_by")
    .map((field) => `relationships.${field}`),
]);
const MAX_SOURCES = 1_000_000;
const MAX_FINDINGS = 1_000_000;
// A sealed frontmatter header contains at most 262,144 UTF-16 code units and
// 4,096 physical lines. Each parser issue consumes at least one authored code
// unit; duplicate-coordinate reporting can add at most one more issue per
// line, and the finite canonical/profile pass adds fewer than 1,024 findings.
const MAX_SOURCE_FINDINGS = 530_000;

const PROFILE_COORDINATE_FIELDS = [
  "contract_version", "effective_profile_digest", "engine_policy_hash", "engine_policy_id",
  "engine_projection_profile", "overlay_sha256", "profile_id", "selector_id", "standard_commit",
  "standard_common_defs_sha256", "standard_diagnostics_sha256", "standard_frontmatter_schema_sha256",
].sort(retrievalCodeUnitCompare);
const FINDING_FIELDS = [
  "classification", "code", "contract_version", "coordinate_basis", "deterministic", "field",
  "finding_id", "line", "scope", "severity", "source_observation_ordinal", "source_path",
].sort(retrievalCodeUnitCompare);
const REJECTION_FIELDS = [
  "canonical_assertion_time", "canonical_valid_from", "contract_version", "effective_sensitivity",
  "findings", "profile", "rejection_digest", "source_digest", "source_observation_ordinal",
  "source_path", "source_size_bytes",
].sort(retrievalCodeUnitCompare);
const RESULT_FIELDS = [
  "contract_version", "corpus_valid", "findings", "ingest_intrinsic_valid", "normalized_profile",
  "observations", "profile", "rejections", "status", "summary",
].sort(retrievalCodeUnitCompare);
const OBSERVATION_FIELDS = [
  "classification", "contract_version", "finding_ids", "intrinsic_blocking_finding_ids", "source_digest",
  "source_observation_ordinal", "source_path", "source_size_bytes",
].sort(retrievalCodeUnitCompare);
const SUMMARY_FIELDS = ["findings", "observed_source_count", "rejected_source_count", "valid_source_count"].sort(retrievalCodeUnitCompare);
const SEVERITY_COUNT_FIELDS = ["critical", "error", "info", "warning"].sort(retrievalCodeUnitCompare);

function inertClone<T>(value: unknown, code: string): T {
  try {
    const canonical = stableJson(value);
    assertNoNegativeZero(value);
    return JSON.parse(canonical) as T;
  } catch { throw new TypeError(code); }
}

function assertNoNegativeZero(value: unknown): void {
  if (typeof value === "number" && Object.is(value, -0)) throw new TypeError("GKX_INGEST_JSON_NEGATIVE_ZERO_INVALID");
  if (value === null || typeof value !== "object") return;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) assertNoNegativeZero(descriptor.value);
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  return Object.freeze(value);
}

function exactKeys(value: unknown, expected: readonly string[], code: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort(retrievalCodeUnitCompare).join("\0") !== expected.join("\0")) throw new TypeError(code);
}

function canonicalPath(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096 ||
      normalizeVaultRelative(value) !== value || !isValidRetrievalSourcePath(value)) throw new TypeError(code);
}

function canonicalUtc(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !CANONICAL_UTC_RE.test(value) || !isValidGkxTimestamp(value)) throw new TypeError(code);
  try {
    if (new Date(Date.parse(value)).toISOString() !== value) throw new TypeError(code);
  } catch { throw new TypeError(code); }
}

function safeInteger(value: unknown, maximum: number, code: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) throw new TypeError(code);
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function assertProfileSeverity(findings: readonly IngestFinding[], normalized: IngestNormalizedProfileEnvelope): void {
  const floors = new Map(normalized.severity.map((item) => [item.code, item.severity]));
  for (const item of findings) {
    const floor = floors.get(item.code);
    if (floor !== undefined && item.severity !== floor) {
      throw new TypeError("GKX_INGEST_FINDING_SEVERITY_PROFILE_MISMATCH");
    }
  }
}

function assertProfileFindingSemantics(findings: readonly IngestFinding[], normalized: IngestNormalizedProfileEnvelope): void {
  const fields = new Map(normalized.fields.map((item) => [item.field, item]));
  for (const item of findings) {
    if (item.code === "GKX_PROFILE_UNKNOWN_FIELD") {
      const severity = normalized.unknown_fields === "warn" ? "warning" : normalized.unknown_fields === "reject" ? "error" : null;
      if (severity === null || item.severity !== severity) throw new TypeError("GKX_INGEST_FINDING_PROFILE_UNKNOWN_POLICY_INVALID");
      continue;
    }
    if (item.code === "GKX_PROFILE_SENSITIVITY_BELOW_MINIMUM") {
      if (item.field !== "sensitivity.level" || normalized.minimum_sensitivity === "public") {
        throw new TypeError("GKX_INGEST_FINDING_PROFILE_SENSITIVITY_INVALID");
      }
      continue;
    }
    if (!["GKX_PROFILE_FIELD_REQUIRED", "GKX_PROFILE_TYPE_INVALID", "GKX_PROFILE_ENUM_INVALID", "GKX_PROFILE_LENGTH_INVALID"].includes(item.code)) continue;
    if (item.field === null) throw new TypeError("GKX_INGEST_FINDING_PROFILE_RULE_INVALID");
    const rule = fields.get(item.field);
    if (!rule ||
        (item.code === "GKX_PROFILE_FIELD_REQUIRED" && !normalized.required_fields.includes(item.field)) ||
        (item.code === "GKX_PROFILE_ENUM_INVALID" && rule.enum === null) ||
        (item.code === "GKX_PROFILE_LENGTH_INVALID" && (rule.type !== "string" ||
          (!rule.required && rule.min_length === null && rule.max_length === null)))) {
      throw new TypeError("GKX_INGEST_FINDING_PROFILE_RULE_INVALID");
    }
  }
}

export function compareIngestFindings(left: IngestFinding, right: IngestFinding): number {
  return retrievalCodeUnitCompare(left.source_path ?? "", right.source_path ?? "") ||
    (left.source_observation_ordinal ?? -1) - (right.source_observation_ordinal ?? -1) ||
    (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER) ||
    retrievalCodeUnitCompare(left.code, right.code) || retrievalCodeUnitCompare(left.field ?? "", right.field ?? "") ||
    retrievalCodeUnitCompare(left.finding_id, right.finding_id);
}

export function compareIngestRejections(left: IngestRejection, right: IngestRejection): number {
  return retrievalCodeUnitCompare(left.source_path, right.source_path) ||
    left.source_observation_ordinal - right.source_observation_ordinal ||
    retrievalCodeUnitCompare(left.rejection_digest, right.rejection_digest);
}

function compareIngestObservations(left: IngestSourceObservation, right: IngestSourceObservation): number {
  return retrievalCodeUnitCompare(left.source_path, right.source_path) ||
    left.source_observation_ordinal - right.source_observation_ordinal;
}

export function sealIngestProfileCoordinate(
  value: unknown,
  normalizedValue: unknown,
): IngestProfileCoordinate {
  const normalized = sealNormalizedIngestProfileEnvelope(normalizedValue);
  const inert = inertClone<IngestProfileCoordinate>(value, "GKX_INGEST_PROFILE_COORDINATE_INVALID");
  exactKeys(inert, PROFILE_COORDINATE_FIELDS, "GKX_INGEST_PROFILE_COORDINATE_FIELDS_INVALID");
  if (inert.contract_version !== "gkos-frontmatter-profile-coordinate/1.0.0-draft.1" ||
      (inert.selector_id !== INGEST_CURRENT_PROFILE_SELECTOR && inert.selector_id !== "operator-overlay") ||
      typeof inert.profile_id !== "string" || !PROFILE_ID_RE.test(inert.profile_id) ||
      inert.profile_id !== normalized.profile_id || inert.standard_commit !== INGEST_AUTHORITY_COORDINATES.standard_commit ||
      inert.standard_frontmatter_schema_sha256 !== INGEST_AUTHORITY_COORDINATES.standard_frontmatter_schema_sha256 ||
      inert.standard_common_defs_sha256 !== INGEST_AUTHORITY_COORDINATES.standard_common_defs_sha256 ||
      inert.standard_diagnostics_sha256 !== INGEST_AUTHORITY_COORDINATES.standard_diagnostics_sha256 ||
      inert.engine_projection_profile !== INGEST_AUTHORITY_COORDINATES.engine_projection_profile ||
      inert.engine_policy_id !== INGEST_AUTHORITY_COORDINATES.engine_policy_id ||
      inert.engine_policy_hash !== INGEST_AUTHORITY_COORDINATES.engine_policy_hash ||
      inert.effective_profile_digest !== retrievalCanonicalDigest(normalized)) {
    throw new TypeError("GKX_INGEST_PROFILE_COORDINATE_BINDING_INVALID");
  }
  if (inert.selector_id === INGEST_CURRENT_PROFILE_SELECTOR) {
    if (inert.profile_id !== "gkos-current" || inert.overlay_sha256 !== null ||
        inert.effective_profile_digest !== INGEST_BUILTIN_EFFECTIVE_PROFILE_DIGEST) {
      throw new TypeError("GKX_INGEST_BUILTIN_PROFILE_COORDINATE_INVALID");
    }
  } else if (typeof inert.overlay_sha256 !== "string" || !SHA256_RE.test(inert.overlay_sha256)) {
    throw new TypeError("GKX_INGEST_OVERLAY_PROFILE_COORDINATE_INVALID");
  }
  return deepFreeze(inert);
}

function findingWithoutId(value: IngestFinding): Omit<IngestFinding, "finding_id"> {
  const { finding_id: _findingId, ...base } = value;
  return base;
}

function assertFindingCoordinate(inert: IngestFinding): void {
  if (inert.code === "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT") {
    if (inert.classification !== "cross_record_report_only" || inert.severity !== "error" ||
        inert.scope !== "corpus" || inert.coordinate_basis !== "corpus" || inert.source_path !== null ||
        inert.line !== null || inert.field !== null) throw new TypeError("GKX_INGEST_FINDING_CONFLICT_SHAPE_INVALID");
    return;
  }
  if (inert.classification !== "intrinsic" || inert.scope === "corpus" || inert.coordinate_basis === "corpus" || inert.source_path === null) {
    throw new TypeError("GKX_INGEST_FINDING_CLASSIFICATION_INVALID");
  }
  if (SCAN_CODES.has(inert.code)) {
    if (inert.severity !== "error" || inert.scope !== "file" || inert.coordinate_basis !== "file_observation" ||
        inert.line !== null || inert.field !== null) throw new TypeError("GKX_INGEST_FINDING_SCAN_SHAPE_INVALID");
    return;
  }
  if (inert.code.startsWith("GKX_YAML_") || [
    "GKX_FRONTMATTER_LINE_LIMIT", "GKX_FRONTMATTER_SIZE_LIMIT", "GKX_FRONTMATTER_UNTERMINATED",
  ].includes(inert.code)) {
    if (inert.severity !== "error" || inert.scope !== "frontmatter" || inert.coordinate_basis !== "document_line" ||
        inert.line === null || inert.field !== null) throw new TypeError("GKX_INGEST_FINDING_PARSER_SHAPE_INVALID");
    return;
  }
  if (inert.code === "GKX_FRONTMATTER_REQUIRED") {
    if (inert.severity !== "error" || inert.scope !== "frontmatter" || inert.coordinate_basis !== "missing_field" ||
        inert.line !== null || inert.field !== null) throw new TypeError("GKX_INGEST_FINDING_REQUIRED_SHAPE_INVALID");
    return;
  }
  if (inert.code === "GKX_PROFILE_FIELD_REQUIRED") {
    if (inert.severity !== "error" || inert.scope !== "field" || inert.field === null ||
        inert.coordinate_basis !== "missing_field" || inert.line !== null) {
      throw new TypeError("GKX_INGEST_FINDING_REQUIRED_FIELD_SHAPE_INVALID");
    }
    return;
  }
  if (["GKX_INGEST_PROFILE_VERSION_REQUIRED", "GKX_INGEST_UID_REQUIRED", "CANONICAL_SOURCE_UID_UNAVAILABLE"].includes(inert.code)) {
    if (inert.severity !== "error" || inert.scope !== "field" || inert.field === null ||
        !(["missing_field", "frontmatter_field"] as const).includes(inert.coordinate_basis as "missing_field") ||
        (inert.coordinate_basis === "missing_field") !== (inert.line === null)) {
      throw new TypeError("GKX_INGEST_FINDING_REQUIRED_FIELD_SHAPE_INVALID");
    }
    return;
  }
  if (["AUTHORED_RELATIONSHIP_REFERENCE_INVALID", "CANONICAL_VALIDITY_BINDING_MISMATCH", "CANONICAL_VALIDITY_TIMESTAMP_NONPORTABLE"].includes(inert.code)) {
    if (inert.severity !== "error" || inert.scope !== "field" || inert.coordinate_basis !== "frontmatter_field" ||
        inert.line === null || inert.field === null) throw new TypeError("GKX_INGEST_FINDING_CANONICAL_REASON_SHAPE_INVALID");
    if (inert.code === "AUTHORED_RELATIONSHIP_REFERENCE_INVALID" &&
        !AUTHORED_RELATIONSHIP_FINDING_BASE_FIELDS.has(inert.field.replace(/\[(?:0|[1-9][0-9]*)\]$/u, ""))) {
      throw new TypeError("GKX_INGEST_FINDING_AUTHORED_RELATIONSHIP_FIELD_INVALID");
    }
    return;
  }
  if (inert.code === "AUTHORED_LINK_REFERENCE_INVALID") {
    if (inert.severity !== "error" || inert.scope !== "file" || inert.coordinate_basis !== "document_line" ||
        inert.line === null || inert.field !== null) throw new TypeError("GKX_INGEST_FINDING_LINK_REASON_SHAPE_INVALID");
    return;
  }
  if (["CANONICAL_PROJECTION_INVALID", "CANONICAL_VALIDITY_REFERENCE_UNAVAILABLE"].includes(inert.code)) {
    if (inert.severity !== "error" || inert.scope !== "file" || inert.coordinate_basis !== "file_observation" ||
        inert.line !== null || inert.field !== null) throw new TypeError("GKX_INGEST_FINDING_CANONICAL_REASON_SHAPE_INVALID");
    return;
  }
  if (["GKX_PROFILE_ENUM_INVALID", "GKX_PROFILE_LENGTH_INVALID", "GKX_PROFILE_SENSITIVITY_BELOW_MINIMUM", "GKX_PROFILE_TYPE_INVALID"].includes(inert.code)) {
    if (inert.severity !== "error" || inert.scope !== "field" || inert.coordinate_basis !== "frontmatter_field" ||
        inert.line === null || inert.field === null) throw new TypeError("GKX_INGEST_FINDING_PROFILE_FIELD_SHAPE_INVALID");
    return;
  }
  if (inert.code === "GKX_PROFILE_UNKNOWN_FIELD") {
    if (!(["warning", "error"] as const).includes(inert.severity as "warning") || inert.scope !== "frontmatter" ||
        inert.coordinate_basis !== "frontmatter_field" || inert.line === null || inert.field !== null) {
      throw new TypeError("GKX_INGEST_FINDING_UNKNOWN_FIELD_SHAPE_INVALID");
    }
    return;
  }
  if (inert.code === "GKX_INGEST_CANONICAL_DIAGNOSTIC_UNMAPPED") {
    if (inert.severity !== "error" || inert.classification !== "intrinsic" ||
        inert.scope !== "frontmatter" || inert.coordinate_basis !== "file_observation" ||
        inert.line !== null || inert.field !== null) {
      throw new TypeError("GKX_INGEST_FINDING_UNMAPPED_SHAPE_INVALID");
    }
    return;
  }
  if (inert.code.startsWith("GKX-")) {
    if (inert.scope !== "field" || inert.field === null ||
        !((inert.coordinate_basis === "frontmatter_field" && inert.line !== null) ||
          (inert.coordinate_basis === "missing_field" && inert.line === null))) {
      throw new TypeError("GKX_INGEST_FINDING_CANONICAL_DIAGNOSTIC_SHAPE_INVALID");
    }
    if ((inert.code === "GKX-AUTHORITY-ROLE-001" && !/^gkx_assignment\.authority\.(?:may_approve|may_authorize_use|may_modify_originals|may_lower_sensitivity|may_promote_epistemic_state|may_change_authoritative_lineage)$/u.test(inert.field)) ||
        (inert.code === "GKX-AUTHORITY-ROLE-002" && inert.field !== "gkx_assignment.output.write_mode") ||
        (inert.code === "GKX-EVIDENCE-002" && !/^evidence\.(?:supports|contradicts)\[[0-9]+\]\.strength$/u.test(inert.field)) ||
        (inert.code === "GKX-EVIDENCE-003" && !/^evidence\.(?:supports|contradicts)\[[0-9]+\]\.relevance$/u.test(inert.field)) ||
        (inert.code === "GKX-TEMPORAL-001" && inert.field !== "created_at" && inert.field !== "updated_at") ||
        (inert.code === "GKX-SCHEMA-004" && !new Set([
          "gkx_version", "uid", "title", "type", "created_at", "authorship", "epistemic", "provenance",
          "relationships", "evidence", "lineage", "review", "assessment", "authorization", "labels",
          "sensitivity", "epistemic.state",
        ]).has(inert.field))) {
      throw new TypeError("GKX_INGEST_FINDING_CANONICAL_DIAGNOSTIC_FIELD_INVALID");
    }
    return;
  }
  if (inert.coordinate_basis === "document_line" || inert.coordinate_basis === "frontmatter_field") {
    if (inert.line === null) throw new TypeError("GKX_INGEST_FINDING_LINE_REQUIRED");
  } else if (inert.line !== null) throw new TypeError("GKX_INGEST_FINDING_LINE_FORBIDDEN");
  if (inert.scope === "field" && inert.field === null) throw new TypeError("GKX_INGEST_FINDING_FIELD_REQUIRED");
  if (inert.scope !== "field" && inert.field !== null) throw new TypeError("GKX_INGEST_FINDING_FIELD_FORBIDDEN");
}

function assertFindingFieldBinding(inert: IngestFinding): void {
  if (EXACT_FINDING_FIELDS.has(inert.code) && inert.field !== EXACT_FINDING_FIELDS.get(inert.code)) {
    throw new TypeError("GKX_INGEST_FINDING_FIELD_BINDING_INVALID");
  }
}

function assertFindingSeverityBinding(inert: IngestFinding): void {
  const floor = INGEST_FINDING_SEVERITY_FLOORS[inert.code];
  if (INGEST_SEVERITY_ORDER.indexOf(inert.severity) < INGEST_SEVERITY_ORDER.indexOf(floor) ||
      (!PROFILE_RAISEABLE_FINDING_CODES.has(inert.code) && inert.code !== "GKX_PROFILE_UNKNOWN_FIELD" && inert.severity !== floor)) {
    throw new TypeError("GKX_INGEST_FINDING_SEVERITY_BINDING_INVALID");
  }
}

export function sealIngestFindingEnvelope(value: unknown): IngestFinding {
  const inert = inertClone<IngestFinding>(value, "GKX_INGEST_FINDING_INVALID");
  exactKeys(inert, FINDING_FIELDS, "GKX_INGEST_FINDING_FIELDS_INVALID");
  if (inert.contract_version !== INGEST_FINDING_CONTRACT_VERSION || typeof inert.code !== "string" ||
      !FINDING_CODES.has(inert.code) || !INGEST_SEVERITY_ORDER.includes(inert.severity) ||
      !["intrinsic", "cross_record_report_only"].includes(inert.classification) ||
      !["file", "frontmatter", "field", "corpus"].includes(inert.scope) ||
      !["file_observation", "document_line", "frontmatter_field", "missing_field", "corpus"].includes(inert.coordinate_basis) ||
      inert.deterministic !== true || typeof inert.finding_id !== "string" || !SHA256_RE.test(inert.finding_id) ||
      (inert.line !== null && (!Number.isSafeInteger(inert.line) || inert.line <= 0 || inert.line > 2_147_483_647)) ||
      (inert.field !== null && (typeof inert.field !== "string" || inert.field.length > 256 || !SAFE_FIELD_RE.test(inert.field)))) {
    throw new TypeError("GKX_INGEST_FINDING_VALUE_INVALID");
  }
  if (inert.source_path !== null) canonicalPath(inert.source_path, "GKX_INGEST_FINDING_PATH_INVALID");
  if (inert.source_path === null) {
    if (inert.source_observation_ordinal !== null) throw new TypeError("GKX_INGEST_FINDING_OBSERVATION_INVALID");
  } else {
    safeInteger(inert.source_observation_ordinal, 999_999, "GKX_INGEST_FINDING_OBSERVATION_INVALID");
  }
  assertFindingCoordinate(inert);
  assertFindingFieldBinding(inert);
  assertFindingSeverityBinding(inert);
  if (inert.finding_id !== retrievalCanonicalDigest(findingWithoutId(inert))) throw new TypeError("GKX_INGEST_FINDING_DIGEST_INVALID");
  return deepFreeze(inert);
}

function rejectionWithoutDigest(value: IngestRejection): Omit<IngestRejection, "rejection_digest"> {
  const { rejection_digest: _digest, ...base } = value;
  return base;
}

function sealIngestSourceObservationEnvelope(value: unknown): IngestSourceObservation {
  const inert = inertClone<IngestSourceObservation>(value, "GKX_INGEST_OBSERVATION_INVALID");
  exactKeys(inert, OBSERVATION_FIELDS, "GKX_INGEST_OBSERVATION_FIELDS_INVALID");
  if (inert.contract_version !== INGEST_SOURCE_OBSERVATION_CONTRACT_VERSION ||
      !["accepted", "rejected"].includes(inert.classification)) throw new TypeError("GKX_INGEST_OBSERVATION_VALUE_INVALID");
  canonicalPath(inert.source_path, "GKX_INGEST_OBSERVATION_PATH_INVALID");
  safeInteger(inert.source_observation_ordinal, 999_999, "GKX_INGEST_OBSERVATION_ORDINAL_INVALID");
  if (inert.source_digest !== null && (typeof inert.source_digest !== "string" || !SHA256_RE.test(inert.source_digest))) {
    throw new TypeError("GKX_INGEST_OBSERVATION_SOURCE_DIGEST_INVALID");
  }
  if (inert.source_size_bytes !== null) safeInteger(inert.source_size_bytes, Number.MAX_SAFE_INTEGER, "GKX_INGEST_OBSERVATION_SIZE_INVALID");
  if (inert.source_digest !== null && inert.source_size_bytes === null) throw new TypeError("GKX_INGEST_OBSERVATION_SOURCE_BINDING_INVALID");
  if (inert.classification === "accepted" && (inert.source_digest === null || inert.source_size_bytes === null)) {
    throw new TypeError("GKX_INGEST_OBSERVATION_ACCEPTED_SOURCE_BINDING_REQUIRED");
  }
  for (const [values, code] of [
    [inert.finding_ids, "GKX_INGEST_OBSERVATION_FINDINGS_INVALID"],
    [inert.intrinsic_blocking_finding_ids, "GKX_INGEST_OBSERVATION_BLOCKERS_INVALID"],
  ] as const) {
    if (!Array.isArray(values) || values.length > MAX_SOURCE_FINDINGS ||
        values.some((item) => typeof item !== "string" || !SHA256_RE.test(item)) ||
        new Set(values).size !== values.length ||
        values.some((item, index) => index > 0 && retrievalCodeUnitCompare(values[index - 1], item) >= 0)) {
      throw new TypeError(code);
    }
  }
  return deepFreeze(inert);
}

export function sealIngestRejectionEnvelope(
  value: unknown,
  normalizedValue: unknown,
  expectedProfile?: unknown,
): IngestRejection {
  const inert = inertClone<IngestRejection>(value, "GKX_INGEST_REJECTION_INVALID");
  exactKeys(inert, REJECTION_FIELDS, "GKX_INGEST_REJECTION_FIELDS_INVALID");
  const profile = sealIngestProfileCoordinate(inert.profile, normalizedValue);
  if (expectedProfile !== undefined && !sameJson(profile, expectedProfile)) throw new TypeError("GKX_INGEST_REJECTION_PROFILE_MISMATCH");
  if (inert.contract_version !== INGEST_REJECTION_CONTRACT_VERSION || inert.effective_sensitivity !== "secret" ||
      typeof inert.rejection_digest !== "string" || !SHA256_RE.test(inert.rejection_digest)) {
    throw new TypeError("GKX_INGEST_REJECTION_VALUE_INVALID");
  }
  safeInteger(inert.source_observation_ordinal, 999_999, "GKX_INGEST_REJECTION_ORDINAL_INVALID");
  canonicalPath(inert.source_path, "GKX_INGEST_REJECTION_PATH_INVALID");
  if (inert.source_digest !== null && (typeof inert.source_digest !== "string" || !SHA256_RE.test(inert.source_digest))) {
    throw new TypeError("GKX_INGEST_REJECTION_SOURCE_DIGEST_INVALID");
  }
  if (inert.source_size_bytes !== null) safeInteger(inert.source_size_bytes, Number.MAX_SAFE_INTEGER, "GKX_INGEST_REJECTION_SIZE_INVALID");
  if (inert.source_digest !== null && inert.source_size_bytes === null) throw new TypeError("GKX_INGEST_REJECTION_SOURCE_BINDING_INVALID");
  if (inert.canonical_assertion_time !== null) canonicalUtc(inert.canonical_assertion_time, "GKX_INGEST_REJECTION_ASSERTION_TIME_INVALID");
  if (inert.canonical_valid_from !== null) canonicalUtc(inert.canonical_valid_from, "GKX_INGEST_REJECTION_VALID_FROM_INVALID");
  if (inert.canonical_valid_from !== null && inert.canonical_valid_from !== inert.canonical_assertion_time) {
    throw new TypeError("GKX_INGEST_REJECTION_TEMPORAL_BINDING_INVALID");
  }
  if (!Array.isArray(inert.findings) || inert.findings.length === 0 || inert.findings.length > MAX_SOURCE_FINDINGS) {
    throw new TypeError("GKX_INGEST_REJECTION_FINDINGS_INVALID");
  }
  const findings = inert.findings.map(sealIngestFindingEnvelope);
  const normalized = sealNormalizedIngestProfileEnvelope(normalizedValue);
  assertProfileSeverity(findings, normalized);
  assertProfileFindingSemantics(findings, normalized);
  if (findings.some((item) => item.classification !== "intrinsic" || item.source_path !== inert.source_path ||
        item.source_observation_ordinal !== inert.source_observation_ordinal) ||
      !findings.some((item) => BLOCKING.has(item.severity)) ||
      new Set(findings.map((item) => item.finding_id)).size !== findings.length ||
      findings.some((item, index) => index > 0 && compareIngestFindings(findings[index - 1], item) >= 0)) {
    throw new TypeError("GKX_INGEST_REJECTION_FINDINGS_INVALID");
  }
  inert.profile = profile;
  inert.findings = findings;
  if (inert.rejection_digest !== retrievalCanonicalDigest(rejectionWithoutDigest(inert))) {
    throw new TypeError("GKX_INGEST_REJECTION_DIGEST_INVALID");
  }
  return deepFreeze(inert);
}

export function sealIngestValidationResultEnvelope(value: unknown): IngestValidationResult {
  const inert = inertClone<IngestValidationResult>(value, "GKX_INGEST_RESULT_INVALID");
  exactKeys(inert, RESULT_FIELDS, "GKX_INGEST_RESULT_FIELDS_INVALID");
  const normalized = sealNormalizedIngestProfileEnvelope(inert.normalized_profile);
  const profile = sealIngestProfileCoordinate(inert.profile, normalized);
  if (inert.contract_version !== INGEST_VALIDATION_CONTRACT_VERSION || !["valid", "invalid"].includes(inert.status) ||
      typeof inert.corpus_valid !== "boolean" || typeof inert.ingest_intrinsic_valid !== "boolean") {
    throw new TypeError("GKX_INGEST_RESULT_VALUE_INVALID");
  }
  exactKeys(inert.summary, SUMMARY_FIELDS, "GKX_INGEST_RESULT_SUMMARY_INVALID");
  exactKeys(inert.summary.findings, SEVERITY_COUNT_FIELDS, "GKX_INGEST_RESULT_FINDING_COUNTS_INVALID");
  safeInteger(inert.summary.observed_source_count, MAX_SOURCES, "GKX_INGEST_RESULT_SOURCE_COUNT_INVALID");
  safeInteger(inert.summary.valid_source_count, MAX_SOURCES, "GKX_INGEST_RESULT_SOURCE_COUNT_INVALID");
  safeInteger(inert.summary.rejected_source_count, MAX_SOURCES, "GKX_INGEST_RESULT_SOURCE_COUNT_INVALID");
  for (const severity of INGEST_SEVERITY_ORDER) safeInteger(inert.summary.findings[severity], MAX_FINDINGS, "GKX_INGEST_RESULT_FINDING_COUNTS_INVALID");
  if (!Array.isArray(inert.findings) || inert.findings.length > MAX_FINDINGS ||
      !Array.isArray(inert.observations) || inert.observations.length > MAX_SOURCES ||
      !Array.isArray(inert.rejections) || inert.rejections.length > MAX_SOURCES) {
    throw new TypeError("GKX_INGEST_RESULT_COLLECTION_INVALID");
  }
  const findings = inert.findings.map(sealIngestFindingEnvelope);
  assertProfileSeverity(findings, normalized);
  assertProfileFindingSemantics(findings, normalized);
  if (new Set(findings.map((item) => item.finding_id)).size !== findings.length ||
      findings.some((item, index) => index > 0 && compareIngestFindings(findings[index - 1], item) >= 0)) {
    throw new TypeError("GKX_INGEST_RESULT_FINDING_ORDER_INVALID");
  }
  const rejections = inert.rejections.map((item) => sealIngestRejectionEnvelope(item, normalized, profile));
  if (new Set(rejections.map((item) => item.rejection_digest)).size !== rejections.length ||
      rejections.some((item, index) => index > 0 && compareIngestRejections(rejections[index - 1], item) >= 0)) {
    throw new TypeError("GKX_INGEST_RESULT_REJECTION_ORDER_INVALID");
  }
  const findingById = new Map(findings.map((item) => [item.finding_id, item]));
  const observations = inert.observations.map(sealIngestSourceObservationEnvelope);
  if (observations.some((item, index) => index > 0 && compareIngestObservations(observations[index - 1], item) >= 0)) {
    throw new TypeError("GKX_INGEST_RESULT_OBSERVATION_ORDER_INVALID");
  }
  const observationByCoordinate = new Map<string, IngestSourceObservation>();
  const expectedOrdinalByPath = new Map<string, number>();
  const findingsByObservation = new Map<string, IngestFinding[]>();
  for (const item of findings) {
    if (item.source_path === null || item.source_observation_ordinal === null) continue;
    const coordinate = stableJson([item.source_path, item.source_observation_ordinal]);
    const group = findingsByObservation.get(coordinate) ?? [];
    group.push(item);
    findingsByObservation.set(coordinate, group);
  }
  for (const observation of observations) {
    const expectedOrdinal = expectedOrdinalByPath.get(observation.source_path) ?? 0;
    if (observation.source_observation_ordinal !== expectedOrdinal) {
      throw new TypeError("GKX_INGEST_RESULT_OBSERVATION_MULTIPLICITY_INVALID");
    }
    expectedOrdinalByPath.set(observation.source_path, expectedOrdinal + 1);
    const coordinate = stableJson([observation.source_path, observation.source_observation_ordinal]);
    const sourceFindings = findingsByObservation.get(coordinate) ?? [];
    const findingIds = sourceFindings.map((item) => item.finding_id).sort(retrievalCodeUnitCompare);
    const blockerIds = sourceFindings
      .filter((item) => item.classification === "intrinsic" && BLOCKING.has(item.severity))
      .map((item) => item.finding_id).sort(retrievalCodeUnitCompare);
    if (!sameJson(observation.finding_ids, findingIds) ||
        !sameJson(observation.intrinsic_blocking_finding_ids, blockerIds) ||
        observation.classification !== (blockerIds.length === 0 ? "accepted" : "rejected")) {
      throw new TypeError("GKX_INGEST_RESULT_OBSERVATION_BINDING_INVALID");
    }
    observationByCoordinate.set(coordinate, observation);
  }
  for (const coordinate of findingsByObservation.keys()) {
    if (!observationByCoordinate.has(coordinate)) {
      throw new TypeError("GKX_INGEST_RESULT_FINDING_OBSERVATION_INVALID");
    }
  }
  const rejectionFindingIds = new Set<string>();
  const rejectionCoordinates = new Set<string>();
  for (const rejection of rejections) {
    const coordinate = stableJson([rejection.source_path, rejection.source_observation_ordinal]);
    const observation = observationByCoordinate.get(coordinate);
    if (!observation || observation.classification !== "rejected" || rejectionCoordinates.has(coordinate) ||
        rejection.source_digest !== observation.source_digest || rejection.source_size_bytes !== observation.source_size_bytes ||
        !sameJson(rejection.findings, findingsByObservation.get(coordinate) ?? [])) {
      throw new TypeError("GKX_INGEST_RESULT_REJECTION_FINDING_SET_INVALID");
    }
    rejectionCoordinates.add(coordinate);
    for (const item of rejection.findings) {
      const resultFinding = findingById.get(item.finding_id);
      if (!resultFinding || !sameJson(resultFinding, item)) throw new TypeError("GKX_INGEST_RESULT_REJECTION_FINDING_MISMATCH");
      rejectionFindingIds.add(item.finding_id);
    }
  }
  if (observations.some((item) => item.classification === "rejected" &&
      !rejectionCoordinates.has(stableJson([item.source_path, item.source_observation_ordinal])))) {
    throw new TypeError("GKX_INGEST_RESULT_REJECTION_PARTITION_INVALID");
  }
  const blocking = findings.filter((item) => BLOCKING.has(item.severity));
  const intrinsicBlocking = blocking.filter((item) => item.classification === "intrinsic");
  if (intrinsicBlocking.some((item) => !rejectionFindingIds.has(item.finding_id))) {
    throw new TypeError("GKX_INGEST_RESULT_INTRINSIC_PARTITION_INVALID");
  }
  const expectedCounts = { info: 0, warning: 0, error: 0, critical: 0 };
  for (const item of findings) expectedCounts[item.severity]++;
  if (!sameJson(inert.summary.findings, expectedCounts) ||
      inert.summary.observed_source_count !== observations.length ||
      inert.summary.valid_source_count !== observations.filter((item) => item.classification === "accepted").length ||
      inert.summary.rejected_source_count !== observations.filter((item) => item.classification === "rejected").length ||
      inert.summary.rejected_source_count !== rejections.length ||
      inert.corpus_valid !== (blocking.length === 0) || inert.status !== (blocking.length === 0 ? "valid" : "invalid") ||
      inert.ingest_intrinsic_valid !== (intrinsicBlocking.length === 0) ||
      inert.ingest_intrinsic_valid !== (rejections.length === 0)) {
    throw new TypeError("GKX_INGEST_RESULT_DERIVATION_INVALID");
  }
  inert.normalized_profile = normalized;
  inert.profile = profile;
  inert.findings = findings;
  inert.observations = observations;
  inert.rejections = rejections;
  return deepFreeze(inert);
}
