import { open, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { TextDecoder } from "node:util";
import { canonicalPath, sameCanonicalPath } from "../retrieval/path-security";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, retrievalSha256, stableJson } from "../retrieval/digest";
import {
  INGEST_AUTHORITY_COORDINATES,
  INGEST_BUILTIN_EFFECTIVE_PROFILE_DIGEST,
  INGEST_CANONICAL_FIELDS,
  INGEST_CANONICAL_REQUIRED_FIELDS,
  INGEST_CURRENT_PROFILE_SELECTOR,
  INGEST_NORMALIZED_PROFILE_CONTRACT_VERSION,
  INGEST_PROFILE_MAX_ARRAY_ITEMS,
  INGEST_PROFILE_MAX_ASSIGNMENTS,
  INGEST_PROFILE_CONTRACT_VERSION,
  INGEST_PROFILE_MAX_BYTES,
  INGEST_PROFILE_MAX_LINES,
  INGEST_PROFILE_MAX_LINE_CODE_UNITS,
  INGEST_PROFILE_MAX_STRING_CODE_UNITS,
  INGEST_SENSITIVITY_ORDER,
  INGEST_SEVERITY_ORDER,
  INGEST_UNKNOWN_FIELD_ORDER,
} from "./contracts";
import type { IngestFindingSeverity, IngestNormalizedProfileEnvelope, IngestProfileCoordinate } from "./types";

export type IngestUnknownFieldPolicy = "allow" | "warn" | "reject";
export type IngestFieldType = "string" | "boolean" | "integer" | "array<string>";

export interface EffectiveIngestFieldRule {
  type: IngestFieldType;
  required: boolean;
  min_length: number | null;
  max_length: number | null;
  integer_minimum: number | null;
  integer_maximum: number | null;
  array_max_items: number | null;
  array_item_max_length: number | null;
  enum: readonly string[] | null;
  extension: boolean;
}

export interface EffectiveIngestProfile {
  profile_id: string;
  required_fields: readonly string[];
  unknown_fields: IngestUnknownFieldPolicy;
  minimum_sensitivity: typeof INGEST_SENSITIVITY_ORDER[number];
  severity: Readonly<Record<string, IngestFindingSeverity>>;
  fields: Readonly<Record<string, EffectiveIngestFieldRule>>;
}

export interface LoadedIngestProfile {
  effective: EffectiveIngestProfile;
  normalized: IngestNormalizedProfileEnvelope;
  coordinate: IngestProfileCoordinate;
}

const PROFILE_ID_RE = /^[a-z][a-z0-9._-]{0,63}$/u;
const EXTENSION_ID_RE = /^x-[a-z0-9][a-z0-9_-]{0,62}$/u;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const DIAGNOSTIC_CODE_RE = /^(?:GKX|CANONICAL|AUTHORED|SOURCE|RETRIEVAL)_[A-Z0-9_-]+$|^GKX-[A-Z0-9-]+$/u;
// Preserve an initial UTF-8 BOM as U+FEFF so the strict grammar can reject it
// as non-ASCII syntax whitespace instead of silently normalizing the bytes.
const FATAL_UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const canonicalFields = new Set<string>(INGEST_CANONICAL_FIELDS);
const LOADED_PROFILES = new WeakSet<object>();
const SOURCE_STRING_MAX_CODE_UNITS = 262_144;
const CANONICAL_ARRAY_MAX_ITEMS = 262_144;
const CANONICAL_ARRAY_ITEM_MAX_CODE_UNITS = 262_144;
const EXTENSION_INTEGER_MINIMUM = -2_147_483_648;
const EXTENSION_INTEGER_MAXIMUM = 2_147_483_647;
const EXTENSION_ARRAY_MAX_ITEMS = 256;
const EXTENSION_ARRAY_ITEM_MAX_CODE_UNITS = 1_024;

function forbiddenProfilePathNamespace(value: string): boolean {
  // Network UNC, Win32 device/extended-path, and NT object-manager spellings
  // are rejected lexically before resolve/lstat can cause remote or device I/O.
  if (/^(?:[\\/]{2}|[\\/]\?\?[\\/])/u.test(value)) return true;
  const portable = value.replace(/\\/gu, "/");
  const drive = /^[A-Za-z]:/u.test(portable);
  if (drive && !/^[A-Za-z]:\//u.test(portable)) return true; // C:relative
  const tail = drive ? portable.slice(2) : portable;
  if (tail.includes(":")) return true; // ADS and non-drive namespaces
  for (const component of tail.split("/")) {
    if (!component) continue;
    const portableComponent = component.replace(/[ .]+$/u, "");
    if (portableComponent !== component) return true;
    const stem = portableComponent.split(".", 1)[0].toUpperCase();
    if (/^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|CLOCK\$|COM(?:[1-9]|[¹²³])|LPT(?:[1-9]|[¹²³]))$/u.test(stem)) return true;
  }
  return false;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  return Object.freeze(value);
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

const EPISTEMIC_STATES = Object.freeze([
  "unknown", "observation", "reported", "inferred", "hypothesis", "modeled", "supported",
  "contested", "refuted", "retracted", "accepted", "superseded",
] as const);
const ORIGINS = Object.freeze(["authored", "derived", "proposed", "approved"] as const);

interface CanonicalFieldDomain {
  type: IngestFieldType;
  min_length?: number;
  max_length?: number;
  enum?: readonly string[];
}

const FIELD_DOMAINS: Readonly<Record<string, CanonicalFieldDomain>> = Object.freeze({
  gkx_version: { type: "string", enum: ["2.3"] },
  uid: { type: "string", min_length: 1 }, title: { type: "string", min_length: 1 }, type: { type: "string", min_length: 1 },
  created_at: { type: "string" }, updated_at: { type: "string" }, authorship_origin: { type: "string", enum: ORIGINS },
  epistemic_state: { type: "string", enum: EPISTEMIC_STATES },
  sensitivity: { type: "string", enum: INGEST_SENSITIVITY_ORDER },
  tags: { type: "array<string>" }, aliases: { type: "array<string>" },
});
const overlayCanonicalFields = new Set(Object.keys(FIELD_DOMAINS));

const CANONICAL_SEVERITY: Readonly<Record<string, IngestFindingSeverity>> = Object.freeze({
  "GKX-SCHEMA-002": "info", "GKX-SCHEMA-003": "warning", "GKX-SCHEMA-004": "error",
  "GKX-IDENTITY-001": "warning", "GKX-IDENTITY-002": "error",
  "GKX-EPISTEMIC-002": "error", "GKX-EPISTEMIC-004": "warning",
  "GKX-TEMPORAL-001": "warning", "GKX-SENSITIVITY-001": "warning", "GKX-SENSITIVITY-005": "error",
  "GKX-PROVENANCE-001": "warning", "GKX-PROVENANCE-002": "error",
  "GKX-EVIDENCE-002": "error", "GKX-EVIDENCE-003": "error",
  "GKX-AUTHORITY-ROLE-001": "critical", "GKX-AUTHORITY-ROLE-002": "error",
});
const FIXED_CANONICAL_SEVERITY_CODES = new Set<string>(["GKX-SENSITIVITY-001"]);

function rank<T extends string>(items: readonly T[], value: T): number {
  return items.indexOf(value);
}

function baseProfile(): EffectiveIngestProfile {
  return Object.freeze({
    profile_id: "gkos-current",
    required_fields: Object.freeze([...INGEST_CANONICAL_REQUIRED_FIELDS]),
    unknown_fields: "allow",
    minimum_sensitivity: "public",
    severity: Object.freeze({ ...CANONICAL_SEVERITY }),
    fields: Object.freeze(Object.fromEntries(Object.entries(FIELD_DOMAINS).map(([field, domain]) => [field, Object.freeze({
      type: domain.type,
      required: INGEST_CANONICAL_REQUIRED_FIELDS.includes(field as typeof INGEST_CANONICAL_REQUIRED_FIELDS[number]),
      min_length: domain.min_length ?? null,
      max_length: domain.type === "string" ? domain.max_length ?? SOURCE_STRING_MAX_CODE_UNITS : null,
      integer_minimum: null,
      integer_maximum: null,
      array_max_items: domain.type === "array<string>" ? CANONICAL_ARRAY_MAX_ITEMS : null,
      array_item_max_length: domain.type === "array<string>" ? CANONICAL_ARRAY_ITEM_MAX_CODE_UNITS : null,
      enum: domain.enum ? Object.freeze([...domain.enum]) : null,
      extension: false,
    })]))),
  });
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

function safeProfileString(value: string, code: string, max = INGEST_PROFILE_MAX_STRING_CODE_UNITS): string {
  if (value.length > max || /[\u0000-\u001f\u007f]/u.test(value) || hasUnpairedSurrogate(value)) throw new Error(code);
  return value;
}

function trimAsciiSpace(value: string): string {
  return value.replace(/^ +| +$/gu, "");
}

function trimEndAsciiSpace(value: string): string {
  return value.replace(/ +$/u, "");
}

function stripComment(line: string): string {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const ch = line[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && ch === "\\") { escaped = true; continue; }
    if (ch === '"') quoted = !quoted;
    else if (ch === "#" && !quoted) return trimEndAsciiSpace(line.slice(0, index));
  }
  if (quoted || escaped) throw new Error("GKX_INGEST_PROFILE_TOML_QUOTE_INVALID");
  return line;
}

function splitArray(value: string): string[] {
  const body = trimAsciiSpace(value.slice(1, -1));
  if (!body) return [];
  const out: string[] = [];
  let quoted = false;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < body.length; index++) {
    const ch = body[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && ch === "\\") { escaped = true; continue; }
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { out.push(trimAsciiSpace(body.slice(start, index))); start = index + 1; }
  }
  if (quoted || escaped) throw new Error("GKX_INGEST_PROFILE_TOML_ARRAY_INVALID");
  out.push(trimAsciiSpace(body.slice(start)));
  if (out.length > INGEST_PROFILE_MAX_ARRAY_ITEMS || out.some((item) => item.length === 0)) {
    throw new Error("GKX_INGEST_PROFILE_TOML_ARRAY_INVALID");
  }
  return out;
}

function validateBasicStringEscapes(value: string): void {
  for (let index = 1; index < value.length - 1; index++) {
    if (value[index] !== "\\") continue;
    const escape = value[++index];
    if (escape === undefined || !["b", "t", "n", "f", "r", '"', "\\", "u"].includes(escape)) {
      throw new Error("GKX_INGEST_PROFILE_TOML_STRING_INVALID");
    }
    if (escape === "u") {
      const hex = value.slice(index + 1, index + 5);
      if (!/^[0-9A-Fa-f]{4}$/u.test(hex)) throw new Error("GKX_INGEST_PROFILE_TOML_STRING_INVALID");
      index += 4;
    }
  }
}

function parseValue(raw: string): string | boolean | number | string[] {
  const value = trimAsciiSpace(raw);
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      validateBasicStringEscapes(value);
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed !== "string") throw new Error();
      return safeProfileString(parsed, "GKX_INGEST_PROFILE_TOML_STRING_INVALID");
    } catch { throw new Error("GKX_INGEST_PROFILE_TOML_STRING_INVALID"); }
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > 2_147_483_647) throw new Error("GKX_INGEST_PROFILE_INTEGER_INVALID");
    return parsed;
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return splitArray(value).map((item) => {
      const parsed = parseValue(item);
      if (typeof parsed !== "string") throw new Error("GKX_INGEST_PROFILE_TOML_ARRAY_INVALID");
      return parsed;
    });
  }
  throw new Error("GKX_INGEST_PROFILE_TOML_VALUE_UNSUPPORTED");
}

interface ParsedOverlay {
  root: Record<string, string | boolean | number | string[]>;
  severity: Record<string, string | boolean | number | string[]>;
  fields: Record<string, Record<string, string | boolean | number | string[]>>;
}

function dictionary<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function parseStrictToml(raw: string): ParsedOverlay {
  if (/\u0000|\r(?!\n)|[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]|\t/u.test(raw)) {
    throw new Error("GKX_INGEST_PROFILE_TOML_CONTROL_INVALID");
  }
  const lines = raw.length === 0 ? [] : raw.split(/\r?\n/u);
  // A terminal LF/CRLF closes the preceding logical line; split()'s final
  // sentinel is not an additional line. Earlier blank/comment lines count.
  if (raw.endsWith("\n")) lines.pop();
  if (lines.length > INGEST_PROFILE_MAX_LINES || lines.some((line) => line.length > INGEST_PROFILE_MAX_LINE_CODE_UNITS)) {
    throw new Error("GKX_INGEST_PROFILE_TOML_BOUNDS_EXCEEDED");
  }
  const result: ParsedOverlay = { root: dictionary(), severity: dictionary(), fields: dictionary() };
  let section: { kind: "root" } | { kind: "severity" } | { kind: "field"; field: string } = { kind: "root" };
  const tables = new Set<string>();
  let assignments = 0;
  for (const rawLine of lines) {
    const line = trimAsciiSpace(stripComment(rawLine));
    if (!line) continue;
    if (line.startsWith("[")) {
      const table = /^\[([A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)?)\]$/u.exec(line)?.[1];
      if (!table || tables.has(table)) throw new Error("GKX_INGEST_PROFILE_TOML_TABLE_INVALID");
      tables.add(table);
      if (table === "severity") section = { kind: "severity" };
      else if (table.startsWith("fields.")) {
        const field = table.slice("fields.".length);
        if ((!overlayCanonicalFields.has(field) && !EXTENSION_ID_RE.test(field)) || Object.hasOwn(result.fields, field)) {
          throw new Error("GKX_INGEST_PROFILE_FIELD_ID_INVALID");
        }
        result.fields[field] = dictionary();
        section = { kind: "field", field };
      } else throw new Error("GKX_INGEST_PROFILE_TOML_TABLE_INVALID");
      continue;
    }
    const assignment = /^([A-Za-z][A-Za-z0-9_-]*) *= *(.+)$/u.exec(line);
    if (!assignment || !KEY_RE.test(assignment[1])) throw new Error("GKX_INGEST_PROFILE_TOML_ASSIGNMENT_INVALID");
    if (++assignments > INGEST_PROFILE_MAX_ASSIGNMENTS) throw new Error("GKX_INGEST_PROFILE_TOML_BOUNDS_EXCEEDED");
    const target = section.kind === "root" ? result.root : section.kind === "severity" ? result.severity : result.fields[section.field];
    if (Object.hasOwn(target, assignment[1])) throw new Error("GKX_INGEST_PROFILE_TOML_DUPLICATE_KEY");
    target[assignment[1]] = parseValue(assignment[2]);
  }
  return result;
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[], code: string): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new Error(code);
}

function strings(value: unknown, code: string, maxItems = 128, maxItemLength = 128): string[] {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || item.length === 0) || new Set(value).size !== value.length) {
    throw new Error(code);
  }
  return value.map((item) => safeProfileString(item as string, code, maxItemLength));
}

function applyOverlay(parsed: ParsedOverlay): EffectiveIngestProfile {
  exactKeys(parsed.root, ["contract_version", "profile_id", "required_fields", "unknown_fields", "minimum_sensitivity"], "GKX_INGEST_PROFILE_ROOT_FIELDS_INVALID");
  if (parsed.root.contract_version !== INGEST_PROFILE_CONTRACT_VERSION || typeof parsed.root.profile_id !== "string" || !PROFILE_ID_RE.test(parsed.root.profile_id)) {
    throw new Error("GKX_INGEST_PROFILE_IDENTITY_INVALID");
  }
  const base = baseProfile();
  const requiredOverlay = parsed.root.required_fields === undefined ? [] : strings(parsed.root.required_fields, "GKX_INGEST_PROFILE_REQUIRED_FIELDS_INVALID");
  if (requiredOverlay.some((field) => !overlayCanonicalFields.has(field) && !EXTENSION_ID_RE.test(field))) throw new Error("GKX_INGEST_PROFILE_REQUIRED_FIELDS_INVALID");
  const unknown = parsed.root.unknown_fields ?? base.unknown_fields;
  if (typeof unknown !== "string" || !INGEST_UNKNOWN_FIELD_ORDER.includes(unknown as IngestUnknownFieldPolicy) ||
      rank(INGEST_UNKNOWN_FIELD_ORDER, unknown as IngestUnknownFieldPolicy) < rank(INGEST_UNKNOWN_FIELD_ORDER, base.unknown_fields)) throw new Error("GKX_INGEST_PROFILE_UNKNOWN_POLICY_INVALID");
  const minimum = parsed.root.minimum_sensitivity ?? base.minimum_sensitivity;
  if (typeof minimum !== "string" || !INGEST_SENSITIVITY_ORDER.includes(minimum as typeof INGEST_SENSITIVITY_ORDER[number]) ||
      rank(INGEST_SENSITIVITY_ORDER, minimum as typeof INGEST_SENSITIVITY_ORDER[number]) < rank(INGEST_SENSITIVITY_ORDER, base.minimum_sensitivity)) throw new Error("GKX_INGEST_PROFILE_SENSITIVITY_INVALID");

  const severity: Record<string, IngestFindingSeverity> = { ...base.severity };
  for (const [code, value] of Object.entries(parsed.severity)) {
    if (!DIAGNOSTIC_CODE_RE.test(code) || !Object.hasOwn(CANONICAL_SEVERITY, code) || typeof value !== "string" || !INGEST_SEVERITY_ORDER.includes(value as IngestFindingSeverity) ||
        rank(INGEST_SEVERITY_ORDER, value as IngestFindingSeverity) < rank(INGEST_SEVERITY_ORDER, CANONICAL_SEVERITY[code]) ||
        (FIXED_CANONICAL_SEVERITY_CODES.has(code) && value !== CANONICAL_SEVERITY[code])) {
      throw new Error("GKX_INGEST_PROFILE_SEVERITY_INVALID");
    }
    severity[code] = value as IngestFindingSeverity;
  }

  const fields: Record<string, EffectiveIngestFieldRule> = dictionary();
  for (const [field, rule] of Object.entries(base.fields)) fields[field] = rule;
  for (const [field, rule] of Object.entries(parsed.fields)) {
    exactKeys(rule, ["type", "required", "min_length", "max_length", "enum"], "GKX_INGEST_PROFILE_FIELD_RULE_INVALID");
    const canonical = FIELD_DOMAINS[field];
    const extension = EXTENSION_ID_RE.test(field);
    if (rule.required !== undefined && rule.required !== true) throw new Error("GKX_INGEST_PROFILE_FIELD_REQUIRED_INVALID");
    const type = rule.type ?? canonical?.type;
    if (typeof type !== "string" || !["string", "boolean", "integer", "array<string>"].includes(type) || (canonical && type !== canonical.type)) {
      throw new Error("GKX_INGEST_PROFILE_FIELD_TYPE_INVALID");
    }
    if (extension && rule.type === undefined) throw new Error("GKX_INGEST_PROFILE_FIELD_TYPE_INVALID");
    const minValue = rule.min_length;
    const maxValue = rule.max_length;
    if (minValue !== undefined && typeof minValue !== "number") throw new Error("GKX_INGEST_PROFILE_FIELD_LENGTH_INVALID");
    if (maxValue !== undefined && typeof maxValue !== "number") throw new Error("GKX_INGEST_PROFILE_FIELD_LENGTH_INVALID");
    const baseMin = canonical?.min_length ?? null;
    const baseMax = canonical?.type === "string" ? canonical.max_length ?? SOURCE_STRING_MAX_CODE_UNITS
      : extension && type === "string" ? SOURCE_STRING_MAX_CODE_UNITS : null;
    const requestedMin = typeof minValue === "number" ? minValue : null;
    const requestedMax = typeof maxValue === "number" ? maxValue : null;
    const min: number | null = requestedMin === null ? baseMin : baseMin === null ? requestedMin : Math.max(baseMin, requestedMin);
    const max: number | null = requestedMax === null ? baseMax : baseMax === null ? requestedMax : Math.min(baseMax, requestedMax);
    if ((min !== null && (!Number.isSafeInteger(min) || min < 0 || min > SOURCE_STRING_MAX_CODE_UNITS)) ||
        (max !== null && (!Number.isSafeInteger(max) || max < 0 || max > SOURCE_STRING_MAX_CODE_UNITS)) ||
        (requestedMin !== null && baseMin !== null && requestedMin < baseMin) ||
        (requestedMax !== null && baseMax !== null && requestedMax > baseMax) ||
        (min !== null && max !== null && min > max) || ((min !== null || max !== null) && type !== "string")) {
      throw new Error("GKX_INGEST_PROFILE_FIELD_LENGTH_INVALID");
    }
    const enumValues = rule.enum === undefined ? canonical?.enum ? [...canonical.enum] : null : strings(rule.enum, "GKX_INGEST_PROFILE_FIELD_ENUM_INVALID", INGEST_PROFILE_MAX_ARRAY_ITEMS, 512);
    if (enumValues !== null && (type !== "string" || enumValues.length === 0 || (canonical?.enum && enumValues.some((item) => !canonical.enum!.includes(item))))) {
      throw new Error("GKX_INGEST_PROFILE_FIELD_ENUM_INVALID");
    }
    if (enumValues !== null && !enumValues.some((item) =>
      (min === null || item.length >= min) && (max === null || item.length <= max))) {
      throw new Error("GKX_INGEST_PROFILE_FIELD_DOMAIN_EMPTY");
    }
    const required = base.fields[field]?.required === true || rule.required === true || requiredOverlay.includes(field);
    if (field === "sensitivity" && required) {
      throw new Error("GKX_INGEST_PROFILE_SENSITIVITY_REQUIRED_INVALID");
    }
    if (required && type === "string" && max === 0) {
      throw new Error("GKX_INGEST_PROFILE_FIELD_DOMAIN_EMPTY");
    }
    if (required && type === "string" && enumValues !== null && !enumValues.some((item) => item.trim().length > 0 &&
      (min === null || item.length >= min) && (max === null || item.length <= max))) {
      throw new Error("GKX_INGEST_PROFILE_FIELD_DOMAIN_EMPTY");
    }
    fields[field] = Object.freeze({
      type: type as IngestFieldType,
      required,
      min_length: min,
      max_length: max,
      integer_minimum: extension && type === "integer" ? EXTENSION_INTEGER_MINIMUM : null,
      integer_maximum: extension && type === "integer" ? EXTENSION_INTEGER_MAXIMUM : null,
      array_max_items: type === "array<string>"
        ? extension ? EXTENSION_ARRAY_MAX_ITEMS : CANONICAL_ARRAY_MAX_ITEMS
        : null,
      array_item_max_length: type === "array<string>"
        ? extension ? EXTENSION_ARRAY_ITEM_MAX_CODE_UNITS : CANONICAL_ARRAY_ITEM_MAX_CODE_UNITS
        : null,
      enum: enumValues === null ? null : Object.freeze([...enumValues].sort()),
      extension,
    });
  }
  for (const field of requiredOverlay) {
    const existing = fields[field];
    if (!existing) throw new Error("GKX_INGEST_PROFILE_REQUIRED_FIELD_RULE_MISSING");
    if (field === "sensitivity") throw new Error("GKX_INGEST_PROFILE_SENSITIVITY_REQUIRED_INVALID");
    fields[field] = Object.freeze({ ...existing, required: true });
  }
  if (Object.keys(fields).length > 256) throw new Error("GKX_INGEST_PROFILE_EFFECTIVE_FIELDS_LIMIT_EXCEEDED");
  const effectiveRequiredFields = Object.entries(fields).filter(([, rule]) => rule.required).map(([field]) => field).sort();
  if (effectiveRequiredFields.length > 256) throw new Error("GKX_INGEST_PROFILE_EFFECTIVE_REQUIRED_FIELDS_LIMIT_EXCEEDED");
  const sensitivityRule = fields.sensitivity;
  if (sensitivityRule?.enum !== null && !sensitivityRule.enum.some((value) =>
    rank(INGEST_SENSITIVITY_ORDER, value as typeof INGEST_SENSITIVITY_ORDER[number]) >=
      rank(INGEST_SENSITIVITY_ORDER, minimum as typeof INGEST_SENSITIVITY_ORDER[number]))) {
    throw new Error("GKX_INGEST_PROFILE_SENSITIVITY_DOMAIN_EMPTY");
  }
  return Object.freeze({
    profile_id: parsed.root.profile_id,
    required_fields: Object.freeze(effectiveRequiredFields),
    unknown_fields: unknown as IngestUnknownFieldPolicy,
    minimum_sensitivity: minimum as typeof INGEST_SENSITIVITY_ORDER[number],
    severity: Object.freeze(severity),
    fields: Object.freeze(fields),
  });
}

function normalizedProfile(effective: EffectiveIngestProfile): IngestNormalizedProfileEnvelope {
  const severity = Object.entries(effective.severity)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([code, value]) => Object.freeze({ code, severity: value }));
  const fields = Object.entries(effective.fields)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([field, rule]) => Object.freeze({
      field,
      type: rule.type,
      required: rule.required,
      min_length: rule.min_length,
      max_length: rule.max_length,
      integer_minimum: rule.integer_minimum,
      integer_maximum: rule.integer_maximum,
      array_max_items: rule.array_max_items,
      array_item_max_length: rule.array_item_max_length,
      enum: rule.enum === null ? null : Object.freeze([...rule.enum].sort()),
      extension: rule.extension,
    }));
  return Object.freeze({
    contract_version: INGEST_NORMALIZED_PROFILE_CONTRACT_VERSION,
    profile_id: effective.profile_id,
    standard_commit: INGEST_AUTHORITY_COORDINATES.standard_commit,
    standard_frontmatter_schema_sha256: INGEST_AUTHORITY_COORDINATES.standard_frontmatter_schema_sha256,
    standard_common_defs_sha256: INGEST_AUTHORITY_COORDINATES.standard_common_defs_sha256,
    standard_diagnostics_sha256: INGEST_AUTHORITY_COORDINATES.standard_diagnostics_sha256,
    engine_projection_profile: INGEST_AUTHORITY_COORDINATES.engine_projection_profile,
    engine_policy_id: INGEST_AUTHORITY_COORDINATES.engine_policy_id,
    engine_policy_hash: INGEST_AUTHORITY_COORDINATES.engine_policy_hash,
    required_fields: Object.freeze([...effective.required_fields].sort()),
    unknown_fields: effective.unknown_fields,
    minimum_sensitivity: effective.minimum_sensitivity,
    identity_rules: Object.freeze({
      stable_authored_uid_required: true as const,
      uid_syntax_authority: "canonical_gkx_parser" as const,
      path_is_identity: false as const,
      duplicate_uid_or_path: "cross_record_report_only" as const,
      identity_mutation_or_defaulting: false as const,
    }),
    relationship_rules: Object.freeze({
      declaration_syntax_authority: "canonical_gkx_parser_receipts" as const,
      malformed_authored_reference: "intrinsic" as const,
      endpoint_resolution_and_topology: "cross_record_report_only" as const,
      ordinary_markdown_or_wikilink_unresolved: "non_conflicting" as const,
      second_resolution_pass: false as const,
    }),
    severity: Object.freeze(severity),
    fields: Object.freeze(fields),
  });
}

const NORMALIZED_PROFILE_FIELDS = [
  "contract_version", "engine_policy_hash", "engine_policy_id", "engine_projection_profile", "fields",
  "identity_rules", "minimum_sensitivity", "profile_id", "relationship_rules", "required_fields", "severity",
  "standard_commit", "standard_common_defs_sha256", "standard_diagnostics_sha256",
  "standard_frontmatter_schema_sha256", "unknown_fields",
].sort(retrievalCodeUnitCompare);
const NORMALIZED_FIELD_FIELDS = [
  "array_item_max_length", "array_max_items", "enum", "extension", "field", "integer_maximum",
  "integer_minimum", "max_length", "min_length", "required", "type",
].sort(retrievalCodeUnitCompare);
const NORMALIZED_SEVERITY_FIELDS = ["code", "severity"].sort(retrievalCodeUnitCompare);

function exactObjectKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  if (Object.keys(value).sort(retrievalCodeUnitCompare).join("\0") !== expected.join("\0")) throw new TypeError(code);
}

function sortedUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length && values.every((value, index) => index === 0 || retrievalCodeUnitCompare(values[index - 1], value) < 0);
}

/**
 * Descriptor-safe verifier for the machine-path-free normalized profile that
 * Full hands to conformant adapters.  It mechanically enforces every monotone
 * overlay floor without re-reading TOML or creating a second GKX authority.
 */
export function sealNormalizedIngestProfileEnvelope(value: unknown): IngestNormalizedProfileEnvelope {
  let inert: IngestNormalizedProfileEnvelope;
  try {
    const canonical = stableJson(value);
    assertNoNegativeZero(value);
    inert = JSON.parse(canonical) as IngestNormalizedProfileEnvelope;
  } catch {
    throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_INVALID");
  }
  if (inert === null || typeof inert !== "object" || Array.isArray(inert)) throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_INVALID");
  exactObjectKeys(inert as unknown as Record<string, unknown>, NORMALIZED_PROFILE_FIELDS, "GKX_INGEST_NORMALIZED_PROFILE_FIELDS_INVALID");
  const baseline = normalizedProfile(baseProfile());
  if (inert.contract_version !== INGEST_NORMALIZED_PROFILE_CONTRACT_VERSION ||
      !PROFILE_ID_RE.test(inert.profile_id) || inert.standard_commit !== baseline.standard_commit ||
      inert.standard_frontmatter_schema_sha256 !== baseline.standard_frontmatter_schema_sha256 ||
      inert.standard_common_defs_sha256 !== baseline.standard_common_defs_sha256 ||
      inert.standard_diagnostics_sha256 !== baseline.standard_diagnostics_sha256 ||
      inert.engine_projection_profile !== baseline.engine_projection_profile ||
      inert.engine_policy_id !== baseline.engine_policy_id || inert.engine_policy_hash !== baseline.engine_policy_hash ||
      !INGEST_UNKNOWN_FIELD_ORDER.includes(inert.unknown_fields) ||
      rank(INGEST_UNKNOWN_FIELD_ORDER, inert.unknown_fields) < rank(INGEST_UNKNOWN_FIELD_ORDER, baseline.unknown_fields) ||
      !INGEST_SENSITIVITY_ORDER.includes(inert.minimum_sensitivity) ||
      rank(INGEST_SENSITIVITY_ORDER, inert.minimum_sensitivity) < rank(INGEST_SENSITIVITY_ORDER, baseline.minimum_sensitivity) ||
      stableJson(inert.identity_rules) !== stableJson(baseline.identity_rules) ||
      stableJson(inert.relationship_rules) !== stableJson(baseline.relationship_rules)) {
    throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_AUTHORITY_INVALID");
  }

  if (!Array.isArray(inert.severity) || inert.severity.length !== baseline.severity.length) throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_SEVERITY_INVALID");
  const baselineSeverity = new Map(baseline.severity.map((item) => [item.code, item.severity]));
  const seenSeverity = new Set<string>();
  for (const item of inert.severity) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_SEVERITY_INVALID");
    exactObjectKeys(item as unknown as Record<string, unknown>, NORMALIZED_SEVERITY_FIELDS, "GKX_INGEST_NORMALIZED_PROFILE_SEVERITY_INVALID");
    if (typeof item.code !== "string" || typeof item.severity !== "string") throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_SEVERITY_INVALID");
    const floor = baselineSeverity.get(item.code);
    if (floor === undefined || seenSeverity.has(item.code) || !INGEST_SEVERITY_ORDER.includes(item.severity as IngestFindingSeverity) ||
        rank(INGEST_SEVERITY_ORDER, item.severity as IngestFindingSeverity) < rank(INGEST_SEVERITY_ORDER, floor) ||
        (FIXED_CANONICAL_SEVERITY_CODES.has(item.code) && item.severity !== floor)) {
      throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_SEVERITY_INVALID");
    }
    seenSeverity.add(item.code);
  }
  if (!sortedUnique(inert.severity.map((item) => item.code))) throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_ORDER_INVALID");

  if (!Array.isArray(inert.fields) || inert.fields.length < baseline.fields.length || inert.fields.length > 256) {
    throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELDS_INVALID");
  }
  const baselineFields = new Map(baseline.fields.map((item) => [item.field, item]));
  const seenFields = new Set<string>();
  for (const item of inert.fields) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_INVALID");
    exactObjectKeys(item as unknown as Record<string, unknown>, NORMALIZED_FIELD_FIELDS, "GKX_INGEST_NORMALIZED_PROFILE_FIELD_INVALID");
    if (typeof item.field !== "string" || typeof item.type !== "string" || seenFields.has(item.field) ||
        (!baselineFields.has(item.field) && !EXTENSION_ID_RE.test(item.field)) ||
        !["string", "boolean", "integer", "array<string>"].includes(item.type) || typeof item.required !== "boolean" ||
        typeof item.extension !== "boolean" || item.extension !== !baselineFields.has(item.field)) {
      throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_INVALID");
    }
    seenFields.add(item.field);
    const canonical = baselineFields.get(item.field);
    if (canonical && (item.type !== canonical.type || (canonical.required && !item.required))) {
      throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_WIDENING");
    }
    if (item.field === "sensitivity" && item.required) {
      throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_SENSITIVITY_REQUIRED_INVALID");
    }
    for (const bound of [item.min_length, item.max_length]) {
      if (bound !== null && (!Number.isSafeInteger(bound) || bound < 0 || bound > SOURCE_STRING_MAX_CODE_UNITS)) {
        throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_BOUND_INVALID");
      }
    }
    for (const bound of [item.integer_minimum, item.integer_maximum, item.array_max_items, item.array_item_max_length]) {
      if (bound !== null && (!Number.isSafeInteger(bound) || Object.is(bound, -0))) {
        throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_BOUND_INVALID");
      }
    }
    const isString = item.type === "string";
    const isInteger = item.type === "integer";
    const isArray = item.type === "array<string>";
    if ((!isString && (item.min_length !== null || item.max_length !== null || item.enum !== null)) ||
        (!isInteger && (item.integer_minimum !== null || item.integer_maximum !== null)) ||
        (!isArray && (item.array_max_items !== null || item.array_item_max_length !== null))) {
      throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_SHAPE_INVALID");
    }
    if (isString && (item.integer_minimum !== null || item.integer_maximum !== null ||
        item.array_max_items !== null || item.array_item_max_length !== null)) {
      throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_SHAPE_INVALID");
    }
    if (isString && item.max_length === null) {
      throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_DOMAIN_INVALID");
    }
    if (isInteger && (item.integer_minimum !== EXTENSION_INTEGER_MINIMUM ||
        item.integer_maximum !== EXTENSION_INTEGER_MAXIMUM || !item.extension)) {
      throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_DOMAIN_INVALID");
    }
    if (isArray) {
      const expectedItems = item.extension ? EXTENSION_ARRAY_MAX_ITEMS : CANONICAL_ARRAY_MAX_ITEMS;
      const expectedItemLength = item.extension ? EXTENSION_ARRAY_ITEM_MAX_CODE_UNITS : CANONICAL_ARRAY_ITEM_MAX_CODE_UNITS;
      if (item.array_max_items !== expectedItems || item.array_item_max_length !== expectedItemLength) {
        throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_DOMAIN_INVALID");
      }
    }
    if (item.type === "boolean" && (item.min_length !== null || item.max_length !== null || item.enum !== null ||
        item.integer_minimum !== null || item.integer_maximum !== null || item.array_max_items !== null ||
        item.array_item_max_length !== null)) {
      throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_SHAPE_INVALID");
    }
    if (item.min_length !== null && item.max_length !== null && item.min_length > item.max_length) {
      throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_BOUND_INVALID");
    }
    if (item.required && isString && item.max_length === 0) {
      throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_DOMAIN_EMPTY");
    }
    if (canonical?.min_length !== null && canonical?.min_length !== undefined &&
        (item.min_length === null || item.min_length < canonical.min_length)) throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_WIDENING");
    if (canonical?.max_length !== null && canonical?.max_length !== undefined &&
        (item.max_length === null || item.max_length > canonical.max_length)) throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_WIDENING");
    if (item.enum !== null) {
      if (!Array.isArray(item.enum) || item.enum.length === 0 || item.enum.length > INGEST_PROFILE_MAX_ARRAY_ITEMS ||
          item.enum.some((entry) => typeof entry !== "string" || entry.length === 0 || entry.length > 512 ||
            /[\u0000-\u001f\u007f]/u.test(entry) || hasUnpairedSurrogate(entry)) ||
          !sortedUnique(item.enum)) throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_ENUM_INVALID");
      if (canonical?.enum !== null && canonical?.enum !== undefined && item.enum.some((entry) => !canonical.enum!.includes(entry))) {
        throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_WIDENING");
      }
      if (!item.enum.some((entry) =>
        (item.min_length === null || entry.length >= item.min_length) &&
        (item.max_length === null || entry.length <= item.max_length))) {
        throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_DOMAIN_EMPTY");
      }
      if (item.required && !item.enum.some((entry) => entry.trim().length > 0 &&
        (item.min_length === null || entry.length >= item.min_length) &&
        (item.max_length === null || entry.length <= item.max_length))) {
        throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_DOMAIN_EMPTY");
      }
    } else if (canonical?.enum !== null && canonical?.enum !== undefined) {
      throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_FIELD_WIDENING");
    }
  }
  if (!sortedUnique(inert.fields.map((item) => item.field)) || [...baselineFields.keys()].some((field) => !seenFields.has(field))) {
    throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_ORDER_INVALID");
  }
  if (!Array.isArray(inert.required_fields) || inert.required_fields.length > 256 ||
      inert.required_fields.some((field) => typeof field !== "string") ||
      !sortedUnique(inert.required_fields) ||
      inert.required_fields.some((field) => !seenFields.has(field)) ||
      inert.required_fields.includes("sensitivity") ||
      inert.fields.some((field) => field.required !== inert.required_fields.includes(field.field))) {
    throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_REQUIRED_INVALID");
  }
  const sensitivity = inert.fields.find((item) => item.field === "sensitivity")!;
  if (sensitivity.enum !== null && !sensitivity.enum.some((value) =>
    rank(INGEST_SENSITIVITY_ORDER, value as typeof INGEST_SENSITIVITY_ORDER[number]) >=
      rank(INGEST_SENSITIVITY_ORDER, inert.minimum_sensitivity))) {
    throw new TypeError("GKX_INGEST_NORMALIZED_PROFILE_SENSITIVITY_DOMAIN_EMPTY");
  }
  return deepFreeze(inert);
}

function coordinate(normalized: IngestNormalizedProfileEnvelope, overlaySha: string | null): IngestProfileCoordinate {
  const base = {
    contract_version: "gkos-frontmatter-profile-coordinate/1.0.0-draft.1" as const,
    selector_id: overlaySha === null ? INGEST_CURRENT_PROFILE_SELECTOR : "operator-overlay" as const,
    profile_id: normalized.profile_id,
    standard_commit: INGEST_AUTHORITY_COORDINATES.standard_commit,
    standard_frontmatter_schema_sha256: INGEST_AUTHORITY_COORDINATES.standard_frontmatter_schema_sha256,
    standard_common_defs_sha256: INGEST_AUTHORITY_COORDINATES.standard_common_defs_sha256,
    standard_diagnostics_sha256: INGEST_AUTHORITY_COORDINATES.standard_diagnostics_sha256,
    engine_projection_profile: INGEST_AUTHORITY_COORDINATES.engine_projection_profile,
    engine_policy_id: INGEST_AUTHORITY_COORDINATES.engine_policy_id,
    engine_policy_hash: INGEST_AUTHORITY_COORDINATES.engine_policy_hash,
    overlay_sha256: overlaySha,
  };
  return Object.freeze({ ...base, effective_profile_digest: retrievalCanonicalDigest(normalized) });
}

function loadedProfile(effective: EffectiveIngestProfile, overlaySha: string | null): LoadedIngestProfile {
  const normalized = sealNormalizedIngestProfileEnvelope(normalizedProfile(effective));
  const effectiveDigest = retrievalCanonicalDigest(normalized);
  if (overlaySha === null && effectiveDigest !== INGEST_BUILTIN_EFFECTIVE_PROFILE_DIGEST) {
    throw new Error(`GKX_INGEST_BUILTIN_PROFILE_DIGEST_MISMATCH:${effectiveDigest}`);
  }
  const loaded = Object.freeze({ effective, normalized, coordinate: coordinate(normalized, overlaySha) });
  LOADED_PROFILES.add(loaded);
  return loaded;
}

export function assertLoadedIngestProfile(value: LoadedIngestProfile): void {
  if (value === null || typeof value !== "object" || !LOADED_PROFILES.has(value)) {
    throw new TypeError("GKX_INGEST_PROFILE_CAPABILITY_INVALID");
  }
}

function sameFileState(left: Awaited<ReturnType<typeof lstat>>, right: Awaited<ReturnType<typeof lstat>>): boolean {
  const sameDevice = left.dev === right.dev || (process.platform === "win32" && (left.dev === 0 || right.dev === 0));
  return left.isFile() && right.isFile() && !left.isSymbolicLink() && !right.isSymbolicLink() && left.nlink === 1 && right.nlink === 1 &&
    sameDevice && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

async function readSealedProfile(path: string): Promise<Uint8Array> {
  let canonical: string;
  try {
    canonical = await canonicalPath(resolve(path), { alias_error: "GKX_INGEST_PROFILE_PATH_ALIAS_REJECTED" });
  } catch (error) {
    if ((error as Error)?.message === "GKX_INGEST_PROFILE_PATH_ALIAS_REJECTED") throw error;
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") throw new Error("GKX_INGEST_PROFILE_PATH_INVALID");
    throw new Error("GKX_INGEST_PROFILE_READ_FAILED");
  }
  let before: Awaited<ReturnType<typeof lstat>>;
  try { before = await lstat(canonical); }
  catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") throw new Error("GKX_INGEST_PROFILE_PATH_INVALID");
    throw new Error("GKX_INGEST_PROFILE_READ_FAILED");
  }
  if (!before.isFile() || before.isSymbolicLink() || !Number.isSafeInteger(before.size) || before.size < 0 || before.size > INGEST_PROFILE_MAX_BYTES) {
    throw new Error("GKX_INGEST_PROFILE_PATH_INVALID");
  }
  if (before.nlink !== 1) throw new Error("GKX_INGEST_PROFILE_PATH_HARDLINK_REJECTED");
  let handle: Awaited<ReturnType<typeof open>>;
  try { handle = await open(canonical, "r"); }
  catch { throw new Error("GKX_INGEST_PROFILE_READ_FAILED"); }
  try {
    const opened = await handle.stat();
    if (!sameFileState(before, opened)) throw new Error("GKX_INGEST_PROFILE_CHANGED_DURING_READ");
    const bytes = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, length);
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    let openedAfter: Awaited<ReturnType<typeof lstat>>;
    let pathAfter: Awaited<ReturnType<typeof lstat>>;
    let canonicalAfter: string;
    try {
      openedAfter = await handle.stat();
      pathAfter = await lstat(canonical);
      canonicalAfter = await canonicalPath(canonical, { alias_error: "GKX_INGEST_PROFILE_PATH_ALIAS_REJECTED" });
    } catch {
      throw new Error("GKX_INGEST_PROFILE_CHANGED_DURING_READ");
    }
    if (!sameCanonicalPath(canonical, canonicalAfter) || !sameFileState(before, openedAfter) || !sameFileState(before, pathAfter) || length !== before.size) {
      throw new Error("GKX_INGEST_PROFILE_CHANGED_DURING_READ");
    }
    return bytes.subarray(0, length);
  } catch (error) {
    if ((error as Error)?.message === "GKX_INGEST_PROFILE_CHANGED_DURING_READ" ||
        (error as Error)?.message === "GKX_INGEST_PROFILE_PATH_ALIAS_REJECTED") throw error;
    throw new Error("GKX_INGEST_PROFILE_READ_FAILED");
  } finally {
    try { await handle.close(); }
    catch { throw new Error("GKX_INGEST_PROFILE_READ_FAILED"); }
  }
}

/** Qualification-visible pure selector resolution; performs no filesystem I/O. */
export function validateIngestProfileLocalSelector(selector: string, baseDirectory?: string): string {
  if (typeof selector !== "string" || selector.length === 0 || selector.length > 4096 || /[\u0000-\u001f\u007f]/u.test(selector) ||
      hasUnpairedSurrogate(selector) || selector.startsWith("gkos:") || /^[a-z][a-z0-9+.-]*:\/\//iu.test(selector) ||
      forbiddenProfilePathNamespace(selector)) {
    throw new Error("GKX_INGEST_PROFILE_SELECTOR_INVALID");
  }
  const absolute = baseDirectory === undefined ? resolve(selector) : resolve(baseDirectory, selector);
  if (absolute.length > 4096 || /[\u0000-\u001f\u007f]/u.test(absolute) || hasUnpairedSurrogate(absolute) ||
      forbiddenProfilePathNamespace(absolute)) {
    throw new Error("GKX_INGEST_PROFILE_SELECTOR_INVALID");
  }
  return absolute;
}

const OPERATIONAL_PROFILE_LOAD_ERRORS = new Set([
  "GKX_INGEST_PROFILE_PATH_ALIAS_REJECTED",
  "GKX_INGEST_PROFILE_PATH_HARDLINK_REJECTED",
  "GKX_INGEST_PROFILE_CHANGED_DURING_READ",
  "GKX_INGEST_PROFILE_READ_FAILED",
]);

/** Host-only CLI classifier. It never exposes a selected profile path. */
export function classifyIngestProfileLoadError(error: unknown): "profile" | "operational" {
  return OPERATIONAL_PROFILE_LOAD_ERRORS.has(String((error as Error)?.message)) ? "operational" : "profile";
}

export async function loadIngestProfile(selector?: string | null): Promise<LoadedIngestProfile> {
  if (selector === undefined || selector === null || selector === INGEST_CURRENT_PROFILE_SELECTOR) {
    const effective = baseProfile();
    return loadedProfile(effective, null);
  }
  const resolvedSelector = validateIngestProfileLocalSelector(selector);
  const bytes = await readSealedProfile(resolvedSelector);
  let raw: string;
  try { raw = FATAL_UTF8.decode(bytes); } catch { throw new Error("GKX_INGEST_PROFILE_UTF8_INVALID"); }
  const effective = applyOverlay(parseStrictToml(raw));
  return loadedProfile(effective, retrievalSha256(bytes));
}

export function applyIngestSeverityFloor(
  profile: EffectiveIngestProfile,
  code: string,
  severity: IngestFindingSeverity,
): IngestFindingSeverity {
  const configured = profile.severity[code];
  return configured && rank(INGEST_SEVERITY_ORDER, configured) > rank(INGEST_SEVERITY_ORDER, severity) ? configured : severity;
}
