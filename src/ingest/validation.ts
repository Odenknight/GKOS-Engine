import { isValidGkxTimestamp } from "../timestamps";
import { types as utilTypes } from "node:util";
import { gkxCanonicalCandidateLedger } from "../lineage-receipts";
import { normalizeVaultRelative } from "../paths";
import { gkxCandidateValidationReceipt, type GkxParserLocationReceipt } from "../validation-receipts";
import { buildGkxRetrievalAuthorizedCandidateView } from "../retrieval/authorized-view";
import { isValidRetrievalSourcePath } from "../retrieval/chunker";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, stableJson } from "../retrieval/digest";
import {
  gkxRetrievalProjectionRejectionInvalidDeclarationLocations,
  gkxRetrievalProjectionRejectionRecordKey,
  projectGkxRetrievalCorpus,
  type GkxRetrievalInvalidDeclarationLocation,
} from "../retrieval/gkx-provenance";
import type { GkxDiagnostic, SourceFile } from "../types";
import {
  INGEST_CANONICAL_FIELDS,
  INGEST_FINDING_CODES,
  INGEST_FINDING_CONTRACT_VERSION,
  INGEST_REJECTION_CONTRACT_VERSION,
  INGEST_SCAN_REJECTION_CODES,
  INGEST_SENSITIVITY_ORDER,
  INGEST_SOURCE_OBSERVATION_CONTRACT_VERSION,
  INGEST_VALIDATION_CONTRACT_VERSION,
  type IngestFindingCode,
} from "./contracts";
import { applyIngestSeverityFloor, assertLoadedIngestProfile, type EffectiveIngestFieldRule, type LoadedIngestProfile } from "./profile";
import { compareIngestFindings, compareIngestRejections, sealIngestValidationResultEnvelope } from "./envelopes";
import type {
  IngestCoordinateBasis,
  IngestFinding,
  IngestFindingClassification,
  IngestFindingScope,
  IngestFindingSeverity,
  IngestRejection,
  IngestScanRejectionInput,
  IngestSourceObservation,
  IngestValidationInput,
  IngestValidationPlan,
} from "./types";

const findingCodes = new Set<string>(INGEST_FINDING_CODES);
const canonicalFields = new Set<string>(INGEST_CANONICAL_FIELDS);
const BLOCKING = new Set<IngestFindingSeverity>(["error", "critical"]);
const SAFE_FIELD_RE = /^[A-Za-z][A-Za-z0-9_.-]*(?:\[[0-9]+\](?:\.[A-Za-z][A-Za-z0-9_.-]*)?)?$/u;
const SOURCE_DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
const INPUT_FIELDS = new Set(["files", "folders", "attachments", "scan_rejections"]);
const FILE_FIELDS = new Set(["relativePath", "name", "extension", "size", "modifiedTime", "createdTime", "content", "kind"]);
const SCAN_FIELDS = new Set(["source_path", "source_digest", "size", "classification", "reason_codes"]);
const SCAN_REASONS = new Set<string>(INGEST_SCAN_REJECTION_CODES);
const MAX_DATE_MS = 8_640_000_000_000_000;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_OBSERVED_SOURCES = 1_000_000;
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;
const VALIDATION_PLANS = new WeakSet<object>();
// The canonical adapter needs a deterministic fallback to construct its one
// parser/index pass before authored created_at is known. Built-in validation
// requires created_at, so this value can never make a statless, unauthored
// source eligible; valid authored time remains the canonical authority.
const INGEST_CANONICAL_PARSE_REFERENCE_TIME = "1970-01-01T00:00:00.000Z";

function exactUtf8(value: string): boolean {
  return Buffer.from(value, "utf8").toString("utf8") === value;
}

function canonicalSourcePath(value: string, code: string): string {
  if (!value || value.length > 4096 || CONTROL_RE.test(value) || !exactUtf8(value)) throw new TypeError(code);
  let normalized: string;
  try { normalized = normalizeVaultRelative(value); } catch { throw new TypeError(code); }
  if (normalized !== value || !isValidRetrievalSourcePath(value)) throw new TypeError(code);
  return value;
}

function exactRecord(value: unknown, fields: ReadonlySet<string>, code: string): Map<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object" || utilTypes.isProxy(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError(code);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !fields.has(key))) throw new TypeError(code);
  const output = new Map<string, unknown>();
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor) || descriptor.value === undefined) throw new TypeError(code);
    output.set(key, descriptor.value);
  }
  return output;
}

function denseArray(value: unknown, code: string, maximum = MAX_OBSERVED_SOURCES): unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || value.length > maximum) throw new TypeError(code);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key))) || Object.keys(value).length !== value.length) {
    throw new TypeError(code);
  }
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError(code);
    output.push(descriptor.value);
  }
  return output;
}

function stringList(value: unknown, code: string): string[] {
  return denseArray(value, code).map((item) => {
    if (typeof item !== "string") throw new TypeError(code);
    return item;
  });
}

function sourceFile(value: unknown): IngestValidationInput["files"][number] {
  const fields = exactRecord(value, FILE_FIELDS, "GKX_INGEST_SOURCE_ENVELOPE_INVALID");
  const relativePath = fields.get("relativePath");
  const content = fields.get("content");
  const size = fields.get("size");
  if (typeof relativePath !== "string" || typeof content !== "string" || typeof size !== "number" ||
      !Number.isSafeInteger(size) || Object.is(size, -0) || size < 0 || size > MAX_SOURCE_BYTES || !exactUtf8(content) ||
      size !== Buffer.byteLength(content, "utf8")) {
    throw new TypeError("GKX_INGEST_SOURCE_BYTES_INVALID");
  }
  canonicalSourcePath(relativePath, "GKX_INGEST_SOURCE_PATH_INVALID");
  for (const field of ["name", "extension"] as const) {
    const item = fields.get(field);
    if (item !== undefined && (typeof item !== "string" || item.length > 512 || CONTROL_RE.test(item))) {
      throw new TypeError("GKX_INGEST_SOURCE_ENVELOPE_INVALID");
    }
  }
  const baseName = relativePath.split("/").at(-1)!;
  const dot = baseName.lastIndexOf(".");
  const expectedExtension = dot < 0 ? "" : baseName.slice(dot + 1);
  if (fields.has("name") && fields.get("name") !== baseName) throw new TypeError("GKX_INGEST_SOURCE_NAME_MISMATCH");
  if (fields.has("extension") && fields.get("extension") !== expectedExtension) throw new TypeError("GKX_INGEST_SOURCE_EXTENSION_MISMATCH");
  for (const field of ["createdTime", "modifiedTime"] as const) {
    const item = fields.get(field);
    if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item) || Object.is(item, -0) || Math.abs(item) > MAX_DATE_MS)) {
      throw new TypeError("GKX_INGEST_SOURCE_TIME_INVALID");
    }
  }
  if (fields.get("kind") !== undefined && fields.get("kind") !== "note") throw new TypeError("GKX_INGEST_SOURCE_KIND_INVALID");
  return {
    relativePath,
    content,
    size,
    ...(fields.has("name") ? { name: fields.get("name") as string } : {}),
    ...(fields.has("extension") ? { extension: fields.get("extension") as string } : {}),
    ...(fields.has("createdTime") ? { createdTime: fields.get("createdTime") as number } : {}),
    ...(fields.has("modifiedTime") ? { modifiedTime: fields.get("modifiedTime") as number } : {}),
    ...(fields.has("kind") ? { kind: "note" as const } : {}),
  };
}

function scanRejection(value: unknown): IngestScanRejectionInput {
  const fields = exactRecord(value, SCAN_FIELDS, "GKX_INGEST_SCAN_REJECTION_INVALID");
  const sourcePath = fields.get("source_path");
  const sourceDigest = fields.get("source_digest");
  const size = fields.get("size");
  if (typeof sourcePath !== "string" ||
      (sourceDigest !== null && (typeof sourceDigest !== "string" || !SOURCE_DIGEST_RE.test(sourceDigest))) ||
      (size !== null && (typeof size !== "number" || !Number.isSafeInteger(size) || Object.is(size, -0) || size < 0)) ||
      fields.get("classification") !== "rejected") {
    throw new TypeError("GKX_INGEST_SCAN_REJECTION_INVALID");
  }
  canonicalSourcePath(sourcePath, "GKX_INGEST_SCAN_REJECTION_INVALID");
  const reasons = denseArray(fields.get("reason_codes"), "GKX_INGEST_SCAN_REJECTION_REASONS_INVALID", INGEST_SCAN_REJECTION_CODES.length)
    .map((item) => {
      if (typeof item !== "string") throw new TypeError("GKX_INGEST_SCAN_REJECTION_REASONS_INVALID");
      return item;
    });
  if (reasons.length === 0 || new Set(reasons).size !== reasons.length || reasons.some((reason) => !SCAN_REASONS.has(reason)) ||
      reasons.some((reason, index) => index > 0 && retrievalCodeUnitCompare(reasons[index - 1], reason) >= 0)) {
    throw new TypeError("GKX_INGEST_SCAN_REJECTION_REASONS_INVALID");
  }
  return {
    source_path: sourcePath,
    source_digest: sourceDigest as string | null,
    size: size as number | null,
    classification: "rejected",
    reason_codes: reasons,
  };
}

function canonicalPathList(value: unknown, code: string): string[] {
  return stringList(value, code).map((item) => canonicalSourcePath(item, code));
}

function validationInput(value: unknown): IngestValidationInput {
  const fields = exactRecord(value, INPUT_FIELDS, "GKX_INGEST_VALIDATION_INPUT_INVALID");
  if (!fields.has("files")) throw new TypeError("GKX_INGEST_VALIDATION_INPUT_INVALID");
  const files = denseArray(fields.get("files"), "GKX_INGEST_SOURCE_FILES_INVALID").map(sourceFile);
  const folders = fields.has("folders") ? canonicalPathList(fields.get("folders"), "GKX_INGEST_FOLDERS_INVALID") : [];
  const attachments = fields.has("attachments") ? canonicalPathList(fields.get("attachments"), "GKX_INGEST_ATTACHMENTS_INVALID") : [];
  const scanRejections = fields.has("scan_rejections")
    ? denseArray(fields.get("scan_rejections"), "GKX_INGEST_SCAN_REJECTIONS_INVALID").map(scanRejection)
    : [];
  if (files.length + scanRejections.length > MAX_OBSERVED_SOURCES) throw new TypeError("GKX_INGEST_OBSERVATION_LIMIT_EXCEEDED");
  return { files, folders, attachments, scan_rejections: scanRejections };
}

interface FindingInput {
  code: string;
  severity: IngestFindingSeverity;
  classification?: IngestFindingClassification;
  scope: IngestFindingScope;
  coordinate_basis: IngestCoordinateBasis;
  source_path: string | null;
  source_observation_ordinal: number | null;
  line: number | null;
  field: string | null;
}

function finding(input: FindingInput): IngestFinding {
  const code = findingCodes.has(input.code) ? input.code as IngestFindingCode : "GKX_INGEST_CANONICAL_DIAGNOSTIC_UNMAPPED";
  const safeField = input.field !== null && input.field.length <= 256 && SAFE_FIELD_RE.test(input.field) ? input.field : null;
  const unmapped = code === "GKX_INGEST_CANONICAL_DIAGNOSTIC_UNMAPPED";
  const base = {
    contract_version: INGEST_FINDING_CONTRACT_VERSION,
    code,
    severity: unmapped ? "error" as const : input.severity,
    classification: unmapped ? "intrinsic" as const : input.classification ?? "intrinsic" as const,
    scope: unmapped ? "frontmatter" as const : input.scope,
    coordinate_basis: unmapped ? "file_observation" as const : input.coordinate_basis,
    source_path: input.source_path,
    source_observation_ordinal: input.source_observation_ordinal,
    line: unmapped ? null : input.line,
    field: unmapped ? null : safeField,
    deterministic: true as const,
  };
  return Object.freeze({ ...base, finding_id: retrievalCanonicalDigest(base) });
}

function logicalFieldAlternatives(field: string): readonly string[] {
  if (field === "epistemic_state" || field === "epistemic.state") return ["epistemic.state", "epistemic_state"];
  if (field === "authorship_origin" || field === "authorship.origin") return ["authorship.origin", "authorship_origin"];
  if (field === "sensitivity" || field === "sensitivity.level") return ["sensitivity.level", "sensitivity"];
  if (field === "created_at") return ["created_at", "timestamp"];
  return [field];
}

function fieldLine(receipt: GkxParserLocationReceipt | null, field: string | null | undefined): number | null {
  if (!receipt || !field) return null;
  const alternatives = logicalFieldAlternatives(field);
  const pointer = (value: string): string => `/${value
    .replace(/\[([0-9]+)\]/gu, ".$1")
    .split(".")
    .map((segment) => segment.replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("/")}`;
  for (const candidate of alternatives) {
    const exact = receipt.field_lines[pointer(candidate)];
    if (typeof exact === "number" && Number.isSafeInteger(exact) && exact > 0) return exact;
    let parent = candidate;
    while (parent.includes(".")) {
      parent = parent.slice(0, parent.lastIndexOf("."));
      const line = receipt.field_lines[pointer(parent)];
      if (typeof line === "number" && Number.isSafeInteger(line) && line > 0) return line;
    }
  }
  return null;
}

function fieldPresent(raw: Record<string, unknown>, field: string): boolean {
  for (const candidate of logicalFieldAlternatives(field)) {
    let value: unknown = raw;
    let present = true;
    for (const segment of candidate.replace(/\[([0-9]+)\]/gu, ".$1").split(".")) {
      if (value === null || typeof value !== "object" || !Object.hasOwn(value, segment)) { present = false; break; }
      value = (value as Record<string, unknown>)[segment];
    }
    if (present) return true;
  }
  return false;
}

function requiredPresentFieldLine(
  raw: Record<string, unknown>,
  receipt: GkxParserLocationReceipt | null,
  field: string,
): number | null {
  const line = fieldLine(receipt, field);
  if (fieldPresent(raw, field) && line === null) throw new Error("GKX_INGEST_PARSER_LOCATION_RECEIPT_MISSING");
  return line;
}

function requiredTopLevelLiteralLine(receipt: GkxParserLocationReceipt | null, field: string): number {
  const pointer = `/${field.replace(/~/gu, "~0").replace(/\//gu, "~1")}`;
  const line = receipt?.field_lines[pointer];
  if (typeof line !== "number" || !Number.isSafeInteger(line) || line <= 0) {
    throw new Error("GKX_INGEST_PARSER_LOCATION_RECEIPT_MISSING");
  }
  return line;
}

function diagnosticFinding(
  diagnostic: GkxDiagnostic,
  sourcePath: string,
  sourceObservationOrdinal: number,
  receipt: GkxParserLocationReceipt | null,
  profile: LoadedIngestProfile,
  raw: Record<string, unknown>,
): IngestFinding {
  const line = diagnostic.field ? requiredPresentFieldLine(raw, receipt, diagnostic.field) : null;
  return finding({
    code: diagnostic.code,
    severity: applyIngestSeverityFloor(profile.effective, diagnostic.code, diagnostic.severity),
    scope: diagnostic.field ? "field" : "frontmatter",
    coordinate_basis: line === null ? diagnostic.field ? "missing_field" : "file_observation" : "frontmatter_field",
    source_path: sourcePath,
    source_observation_ordinal: sourceObservationOrdinal,
    line,
    field: diagnostic.field ?? null,
  });
}

function parserFindings(sourcePath: string, sourceObservationOrdinal: number, receipt: GkxParserLocationReceipt | null): IngestFinding[] {
  return (receipt?.issues ?? []).map((issue) => finding({
    code: issue.code,
    severity: "error",
    scope: "frontmatter",
    coordinate_basis: "document_line",
    source_path: sourcePath,
    source_observation_ordinal: sourceObservationOrdinal,
    line: issue.line,
    field: null,
  }));
}

function rawRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function fieldValue(raw: Record<string, unknown>, field: string): unknown {
  for (const candidate of logicalFieldAlternatives(field)) {
    let value: unknown = raw;
    let present = true;
    for (const segment of candidate.split(".")) {
      if (value === null || typeof value !== "object" || !Object.hasOwn(value, segment)) { present = false; break; }
      value = (value as Record<string, unknown>)[segment];
    }
    if (present) return value;
  }
  return undefined;
}

function typeMatches(value: unknown, rule: EffectiveIngestFieldRule): boolean {
  if (rule.type === "string") return typeof value === "string";
  if (rule.type === "boolean") return typeof value === "boolean";
  if (rule.type === "integer") return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) &&
    rule.integer_minimum !== null && value >= rule.integer_minimum &&
    rule.integer_maximum !== null && value <= rule.integer_maximum;
  return Array.isArray(value) && rule.array_max_items !== null && value.length <= rule.array_max_items &&
    rule.array_item_max_length !== null &&
    value.every((item) => typeof item === "string" && item.length <= rule.array_item_max_length!);
}

function fieldHasNegativeZero(receipt: GkxParserLocationReceipt | null, field: string): boolean {
  if (!receipt) return false;
  for (const candidate of logicalFieldAlternatives(field)) {
    const pointer = `/${candidate
      .replace(/\[([0-9]+)\]/gu, ".$1")
      .split(".")
      .map((segment) => segment.replace(/~/gu, "~0").replace(/\//gu, "~1"))
      .join("/")}`;
    if (receipt.negative_zero_fields.includes(pointer)) return true;
  }
  return false;
}

function profileFindings(
  sourcePath: string,
  sourceObservationOrdinal: number,
  raw: Record<string, unknown>,
  receipt: GkxParserLocationReceipt | null,
  profile: LoadedIngestProfile,
): IngestFinding[] {
  const out: IngestFinding[] = [];
  for (const field of profile.effective.required_fields) {
    const value = fieldValue(raw, field);
    if (value === undefined) {
      out.push(finding({
        code: "GKX_PROFILE_FIELD_REQUIRED", severity: "error", scope: "field", coordinate_basis: "missing_field",
        source_path: sourcePath, source_observation_ordinal: sourceObservationOrdinal, line: null, field,
      }));
    } else if (typeof value === "string" && value.trim().length === 0) {
      const line = requiredPresentFieldLine(raw, receipt, field);
      out.push(finding({
        code: "GKX_PROFILE_LENGTH_INVALID", severity: "error", scope: "field", coordinate_basis: "frontmatter_field",
        source_path: sourcePath, source_observation_ordinal: sourceObservationOrdinal, line, field,
      }));
    }
  }
  for (const [field, rule] of Object.entries(profile.effective.fields)) {
    const value = fieldValue(raw, field);
    if (value === undefined) continue;
    const line = requiredPresentFieldLine(raw, receipt, field);
    if (!typeMatches(value, rule) || (rule.type === "integer" && fieldHasNegativeZero(receipt, field))) {
      out.push(finding({ code: "GKX_PROFILE_TYPE_INVALID", severity: "error", scope: "field", coordinate_basis: line === null ? "file_observation" : "frontmatter_field", source_path: sourcePath, source_observation_ordinal: sourceObservationOrdinal, line, field }));
      continue;
    }
    if (typeof value === "string" && ((rule.min_length !== null && value.length < rule.min_length) || (rule.max_length !== null && value.length > rule.max_length))) {
      out.push(finding({ code: "GKX_PROFILE_LENGTH_INVALID", severity: "error", scope: "field", coordinate_basis: line === null ? "file_observation" : "frontmatter_field", source_path: sourcePath, source_observation_ordinal: sourceObservationOrdinal, line, field }));
    }
    if (rule.enum !== null && (typeof value !== "string" || !rule.enum.includes(value))) {
      out.push(finding({ code: "GKX_PROFILE_ENUM_INVALID", severity: "error", scope: "field", coordinate_basis: line === null ? "file_observation" : "frontmatter_field", source_path: sourcePath, source_observation_ordinal: sourceObservationOrdinal, line, field }));
    }
  }
  if (profile.effective.unknown_fields !== "allow") {
    const unknown = Object.keys(raw).filter((key) => !canonicalFields.has(key) && !Object.hasOwn(profile.effective.fields, key)).sort(retrievalCodeUnitCompare);
    if (unknown.length) {
      const line = requiredTopLevelLiteralLine(receipt, unknown[0]);
      out.push(finding({
        code: "GKX_PROFILE_UNKNOWN_FIELD",
        severity: profile.effective.unknown_fields === "reject" ? "error" : "warning",
        scope: "frontmatter", coordinate_basis: "frontmatter_field",
        source_path: sourcePath, source_observation_ordinal: sourceObservationOrdinal, line, field: null,
      }));
    }
  }
  const explicitSensitivity = typeof raw.sensitivity === "string" ? raw.sensitivity : rawRecord(raw.sensitivity).level;
  if (typeof explicitSensitivity === "string") {
    const actual = INGEST_SENSITIVITY_ORDER.indexOf(explicitSensitivity as typeof INGEST_SENSITIVITY_ORDER[number]);
    const minimum = INGEST_SENSITIVITY_ORDER.indexOf(profile.effective.minimum_sensitivity);
    if (actual >= 0 && actual < minimum) {
      const line = requiredPresentFieldLine(raw, receipt, "sensitivity.level");
      out.push(finding({ code: "GKX_PROFILE_SENSITIVITY_BELOW_MINIMUM", severity: "error", scope: "field", coordinate_basis: line === null ? "file_observation" : "frontmatter_field", source_path: sourcePath, source_observation_ordinal: sourceObservationOrdinal, line, field: "sensitivity.level" }));
    }
  }
  return out;
}

function reasonFinding(
  reason: string,
  sourcePath: string,
  sourceObservationOrdinal: number,
  receipt: GkxParserLocationReceipt | null,
  raw: Record<string, unknown>,
  declarationLocation?: GkxRetrievalInvalidDeclarationLocation,
): IngestFinding | null {
  if (reason === "CANONICAL_PROJECTION_INVALID") return null;
  const field = reason === "CANONICAL_SOURCE_UID_UNAVAILABLE" ? "uid"
    : reason === "CANONICAL_VALIDITY_TIMESTAMP_NONPORTABLE" || reason === "CANONICAL_VALIDITY_BINDING_MISMATCH" ? "created_at"
      : reason === "AUTHORED_RELATIONSHIP_REFERENCE_INVALID" ? declarationLocation === undefined ? null
        : declarationLocation.indexed ? `${declarationLocation.field}[${declarationLocation.declaration_index}]`
          : declarationLocation.field
        : null;
  let line = field === null ? null : requiredPresentFieldLine(raw, receipt, field);
  if (reason === "AUTHORED_RELATIONSHIP_REFERENCE_INVALID" || reason === "AUTHORED_LINK_REFERENCE_INVALID") {
    line = declarationLocation?.source_line ?? null;
    if (line === null) throw new Error("GKX_INGEST_PARSER_LOCATION_RECEIPT_MISSING");
  }
  return finding({
    code: reason,
    severity: "error",
    scope: reason === "AUTHORED_LINK_REFERENCE_INVALID" ? "file" : field ? "field" : "file",
    coordinate_basis: reason === "AUTHORED_LINK_REFERENCE_INVALID" ? "document_line"
      : line !== null ? "frontmatter_field" : field !== null ? "missing_field" : "file_observation",
    source_path: sourcePath,
    source_observation_ordinal: sourceObservationOrdinal,
    line,
    field: reason === "AUTHORED_LINK_REFERENCE_INVALID" ? null : field,
  });
}

function exactUtcOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !isValidGkxTimestamp(value)) return null;
  try {
    const normalized = new Date(Date.parse(value)).toISOString();
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(normalized) ? normalized : null;
  } catch { return null; }
}

function sortFindings(items: readonly IngestFinding[]): IngestFinding[] {
  const byId = new Map(items.map((item) => [item.finding_id, item]));
  return [...byId.values()].sort(compareIngestFindings);
}

function rejection(
  sourceObservationOrdinal: number,
  sourcePath: string,
  sourceDigest: string | null,
  size: number | null,
  assertionTime: string | null,
  validFrom: string | null,
  findings: readonly IngestFinding[],
  profile: LoadedIngestProfile,
): IngestRejection {
  const base = {
    contract_version: INGEST_REJECTION_CONTRACT_VERSION,
    source_observation_ordinal: sourceObservationOrdinal,
    source_path: sourcePath,
    source_digest: sourceDigest,
    source_size_bytes: Number.isSafeInteger(size) && size! >= 0 ? size : null,
    canonical_assertion_time: assertionTime,
    canonical_valid_from: validFrom,
    effective_sensitivity: "secret" as const,
    findings: Object.freeze(sortFindings(findings.filter((item) => item.classification === "intrinsic"))),
    profile: profile.coordinate,
  };
  return Object.freeze({ ...base, rejection_digest: retrievalCanonicalDigest(base) });
}

function scannerFindings(source: IngestScanRejectionInput, sourceObservationOrdinal: number): IngestFinding[] {
  return source.reason_codes.map((reason) => finding({
    code: reason,
    severity: "error",
    scope: "file",
    coordinate_basis: "file_observation",
    source_path: source.source_path,
    source_observation_ordinal: sourceObservationOrdinal,
    line: null,
    field: null,
  }));
}

function observationOrdinals(
  records: readonly { record_key: string; source_path: string; source_digest: string; snapshot: { size: number } }[],
  scanRejections: readonly IngestScanRejectionInput[],
): Map<string, number> {
  interface Seed {
    binding: string;
    source_path: string;
    source_digest: string | null;
    size: number | null;
    observation_kind: "candidate" | "scan_rejection";
    safe_detail: string;
    tie_breaker: string;
  }
  const groups = new Map<string, Seed[]>();
  for (const record of records) {
    const group = groups.get(record.source_path) ?? [];
    group.push({
      binding: record.record_key,
      source_path: record.source_path,
      source_digest: record.source_digest,
      size: record.snapshot.size,
      observation_kind: "candidate",
      safe_detail: "",
      tie_breaker: record.record_key,
    });
    groups.set(record.source_path, group);
  }
  scanRejections.forEach((source, index) => {
    const group = groups.get(source.source_path) ?? [];
    const binding = `scan:${index}`;
    group.push({
      binding,
      source_path: source.source_path,
      source_digest: source.source_digest,
      size: source.size,
      observation_kind: "scan_rejection",
      safe_detail: stableJson(source.reason_codes),
      // Identical scan receipts are intentionally indistinguishable. Their
      // internal bindings may follow input order because swapping them cannot
      // change any sealed observation, finding, or rejection byte.
      tie_breaker: binding,
    });
    groups.set(source.source_path, group);
  });
  const result = new Map<string, number>();
  for (const group of groups.values()) {
    group.sort((left, right) => retrievalCodeUnitCompare(left.source_digest ?? "", right.source_digest ?? "") ||
      (left.size ?? -1) - (right.size ?? -1) ||
      retrievalCodeUnitCompare(left.observation_kind, right.observation_kind) ||
      retrievalCodeUnitCompare(left.safe_detail, right.safe_detail) ||
      retrievalCodeUnitCompare(left.tie_breaker, right.tie_breaker));
    group.forEach((record, ordinal) => result.set(record.binding, ordinal));
  }
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  return Object.freeze(value);
}

function sealedClone<T>(value: T): T {
  return deepFreeze(JSON.parse(JSON.stringify(value)) as T);
}

export function assertIngestValidationPlan(value: unknown): asserts value is IngestValidationPlan {
  if (value === null || typeof value !== "object" || !VALIDATION_PLANS.has(value)) {
    throw new TypeError("GKX_INGEST_VALIDATION_PLAN_CAPABILITY_INVALID");
  }
}

export function buildIngestValidationPlan(
  input: unknown,
  profile: LoadedIngestProfile,
): IngestValidationPlan {
  assertLoadedIngestProfile(profile);
  const safeInput = validationInput(input);
  const files = safeInput.files as SourceFile[];
  const projected = projectGkxRetrievalCorpus(files, safeInput.folders ?? [], safeInput.attachments ?? [], {
    projection_reference_time: INGEST_CANONICAL_PARSE_REFERENCE_TIME,
  });
  const ledger = gkxCanonicalCandidateLedger(projected.graph);
  if (ledger.records.length !== files.length) throw new Error("GKX_INGEST_CANDIDATE_LEDGER_INCOMPLETE");
  const sourceByRecordKey = new Map(projected.sources.map((source) => [source.record_key, source]));
  const reasonsByRecordKey = new Map<string, readonly string[]>();
  const invalidDeclarationLocationsByRecordKey = new Map<string, readonly GkxRetrievalInvalidDeclarationLocation[]>();
  for (const item of projected.rejections) {
    const recordKey = gkxRetrievalProjectionRejectionRecordKey(item);
    if (recordKey === null || reasonsByRecordKey.has(recordKey)) {
      throw new Error("GKX_INGEST_PROJECTION_REJECTION_BINDING_INVALID");
    }
    reasonsByRecordKey.set(recordKey, item.reason_codes);
    invalidDeclarationLocationsByRecordKey.set(recordKey, gkxRetrievalProjectionRejectionInvalidDeclarationLocations(item));
  }
  const ordinalByRecordKey = observationOrdinals(ledger.records, safeInput.scan_rejections ?? []);
  const findingsByRecordKey = new Map<string, IngestFinding[]>();
  const acceptedRecordKeys = new Set<string>();
  const sourceObservations: IngestSourceObservation[] = [];
  const rejections: IngestRejection[] = [];

  for (const record of ledger.records) {
    const observationOrdinal = ordinalByRecordKey.get(record.record_key);
    if (observationOrdinal === undefined) throw new Error("GKX_INGEST_OBSERVATION_ORDINAL_MISSING");
    const receipt = gkxCandidateValidationReceipt(record.snapshot);
    const projection = record.snapshot.gkx?.projection;
    const raw = rawRecord(projection?.rawFrontmatter);
    const items: IngestFinding[] = [
      ...parserFindings(record.source_path, observationOrdinal, receipt),
      ...(projection?.diagnostics ?? [])
        .filter((diagnostic) => diagnostic.code !== "GKX-SCHEMA-001")
        .map((diagnostic) => diagnosticFinding(diagnostic, record.source_path, observationOrdinal, receipt, profile, raw)),
      ...profileFindings(record.source_path, observationOrdinal, raw, receipt, profile),
    ];
    if (!projection) {
      items.push(finding({ code: "GKX_FRONTMATTER_REQUIRED", severity: "error", scope: "frontmatter", coordinate_basis: "missing_field", source_path: record.source_path, source_observation_ordinal: observationOrdinal, line: null, field: null }));
    } else if (projection.mode !== "strict-v2.3") {
      items.push(finding({ code: "GKX_INGEST_PROFILE_VERSION_REQUIRED", severity: "error", scope: "field", coordinate_basis: fieldLine(receipt, "gkx_version") === null ? "missing_field" : "frontmatter_field", source_path: record.source_path, source_observation_ordinal: observationOrdinal, line: fieldLine(receipt, "gkx_version"), field: "gkx_version" }));
    }
    if (!record.source_uid) {
      items.push(finding({ code: "GKX_INGEST_UID_REQUIRED", severity: "error", scope: "field", coordinate_basis: fieldLine(receipt, "uid") === null ? "missing_field" : "frontmatter_field", source_path: record.source_path, source_observation_ordinal: observationOrdinal, line: fieldLine(receipt, "uid"), field: "uid" }));
    }
    for (const reason of reasonsByRecordKey.get(record.record_key) ?? []) {
      if (reason === "AUTHORED_RELATIONSHIP_REFERENCE_INVALID") {
        const locations = invalidDeclarationLocationsByRecordKey.get(record.record_key) ?? [];
        if (locations.length === 0) throw new Error("GKX_INGEST_INVALID_DECLARATION_RECEIPT_MISSING");
        for (const location of locations) {
          const findingCode = location.category === "link" ? "AUTHORED_LINK_REFERENCE_INVALID" : reason;
          const mapped = reasonFinding(findingCode, record.source_path, observationOrdinal, receipt, raw, location);
          if (mapped) items.push(mapped);
        }
      } else {
        const mapped = reasonFinding(reason, record.source_path, observationOrdinal, receipt, raw);
        if (mapped) items.push(mapped);
      }
    }
    const sorted = sortFindings(items);
    findingsByRecordKey.set(record.record_key, sorted);
    const blocked = sorted.some((item) => item.classification === "intrinsic" && BLOCKING.has(item.severity));
    const source = sourceByRecordKey.get(record.record_key);
    if (!blocked && !source) throw new Error("GKX_INGEST_VALID_SOURCE_BINDING_MISSING");
    if (!blocked && source) acceptedRecordKeys.add(record.record_key);
    const authoredTime = exactUtcOrNull(projection?.authored.createdAt);
    const assertionTime = source?.candidate_source.assertion_time ?? authoredTime;
    const validFrom = source?.candidate_source.validity_origin === "gkx_authored_timestamp" &&
      source.candidate_source.valid_from === assertionTime
      ? source.candidate_source.valid_from
      : source === undefined && authoredTime !== null && exactUtcOrNull(record.valid_at) === authoredTime
        ? authoredTime
        : null;
    sourceObservations.push({
      contract_version: INGEST_SOURCE_OBSERVATION_CONTRACT_VERSION,
      source_observation_ordinal: observationOrdinal,
      source_path: record.source_path,
      source_digest: record.source_digest,
      source_size_bytes: Number.isSafeInteger(record.snapshot.size) ? record.snapshot.size : null,
      classification: blocked ? "rejected" : "accepted",
      finding_ids: sorted.map((item) => item.finding_id).sort(retrievalCodeUnitCompare),
      intrinsic_blocking_finding_ids: sorted.filter((item) => item.classification === "intrinsic" && BLOCKING.has(item.severity))
        .map((item) => item.finding_id).sort(retrievalCodeUnitCompare),
    });
    if (blocked) rejections.push(rejection(observationOrdinal, record.source_path, record.source_digest, record.snapshot.size, assertionTime, validFrom, sorted, profile));
  }

  const scanFindings: IngestFinding[] = [];
  for (const [scanIndex, source] of (safeInput.scan_rejections ?? []).entries()) {
    const observationOrdinal = ordinalByRecordKey.get(`scan:${scanIndex}`);
    if (observationOrdinal === undefined) throw new Error("GKX_INGEST_OBSERVATION_ORDINAL_MISSING");
    const items = scannerFindings(source, observationOrdinal);
    scanFindings.push(...items);
    sourceObservations.push({
      contract_version: INGEST_SOURCE_OBSERVATION_CONTRACT_VERSION,
      source_observation_ordinal: observationOrdinal,
      source_path: source.source_path,
      source_digest: source.source_digest,
      source_size_bytes: Number.isSafeInteger(source.size) && source.size! >= 0 ? source.size : null,
      classification: "rejected",
      finding_ids: items.map((item) => item.finding_id).sort(retrievalCodeUnitCompare),
      intrinsic_blocking_finding_ids: items.map((item) => item.finding_id).sort(retrievalCodeUnitCompare),
    });
    rejections.push(rejection(observationOrdinal, source.source_path, source.source_digest, source.size, null, null, items, profile));
  }

  const acceptedSources = projected.sources.filter((source) => acceptedRecordKeys.has(source.record_key));
  const acceptedDeclarations = projected.declarations.filter((declaration) => acceptedRecordKeys.has(declaration.source_record_key));
  const crossRecord: IngestFinding[] = [];
  try {
    buildGkxRetrievalAuthorizedCandidateView(
      acceptedSources.map((source) => source.candidate_source),
      acceptedDeclarations,
      [],
      null,
    );
  } catch (error) {
    if (String((error as Error).message) !== "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT") throw error;
    crossRecord.push(finding({
      code: "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT", severity: "error", classification: "cross_record_report_only",
      scope: "corpus", coordinate_basis: "corpus", source_path: null, source_observation_ordinal: null, line: null, field: null,
    }));
  }

  const allFindings = sortFindings([
    ...[...findingsByRecordKey.values()].flat(),
    ...scanFindings,
    ...crossRecord,
  ]);
  if (allFindings.length > 1_000_000) throw new Error("GKX_INGEST_FINDING_LIMIT_EXCEEDED");
  const intrinsicBlocked = allFindings.some((item) => item.classification === "intrinsic" && BLOCKING.has(item.severity));
  const corpusBlocked = allFindings.some((item) => BLOCKING.has(item.severity));
  const counts = { critical: 0, error: 0, warning: 0, info: 0 };
  for (const item of allFindings) counts[item.severity]++;
  rejections.sort(compareIngestRejections);
  sourceObservations.sort((left, right) => retrievalCodeUnitCompare(left.source_path, right.source_path) ||
    left.source_observation_ordinal - right.source_observation_ordinal);
  const observationSnapshotDigest = retrievalCanonicalDigest({
    contract_version: INGEST_VALIDATION_CONTRACT_VERSION,
    effective_profile_digest: profile.coordinate.effective_profile_digest,
    sources: sourceObservations,
  });
  const result = sealIngestValidationResultEnvelope({
    contract_version: INGEST_VALIDATION_CONTRACT_VERSION,
    status: corpusBlocked ? "invalid" as const : "valid" as const,
    corpus_valid: !corpusBlocked,
    ingest_intrinsic_valid: !intrinsicBlocked,
    profile: profile.coordinate,
    normalized_profile: profile.normalized,
    summary: Object.freeze({
      observed_source_count: ledger.records.length + (safeInput.scan_rejections?.length ?? 0),
      valid_source_count: acceptedSources.length,
      rejected_source_count: rejections.length,
      findings: Object.freeze(counts),
    }),
    findings: Object.freeze(allFindings),
    observations: Object.freeze(sourceObservations.map(sealedClone)),
    rejections: Object.freeze(rejections),
  });
  const plan = Object.freeze({
    result: result as IngestValidationPlan["result"],
    accepted_sources: Object.freeze(acceptedSources.map(sealedClone)),
    accepted_declarations: Object.freeze(acceptedDeclarations.map(sealedClone)),
    observation_snapshot_digest: observationSnapshotDigest,
  });
  VALIDATION_PLANS.add(plan);
  return plan;
}
