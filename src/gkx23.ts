/**
 * GKX v2.3 Validating Projection Profile.
 *
 * This module is deliberately source-preserving and read-only. It parses the
 * bounded YAML subset used by the v2.3 canonical examples, keeps unknown
 * extension fields, separates authored/derived/proposed/approved projections,
 * and calculates deterministic documentation-quality assessments. It is not a
 * governed writer and never changes a source note.
 */
import { ENGINE_VERSION } from "./version";
import { codeUnitCompare } from "./paths";
import { isValidGkxTimestamp } from "./timestamps";
import { GKX23_RELATION_TYPES } from "./gkx23-relationship-types";
import { bindGkxProjectionValidationReceipt } from "./validation-receipts";
import type { GkxAuthoredDeclarationIssueReceipt } from "./validation-receipts";
import type {
  GkxAssessment,
  GkxAssessmentScores,
  GkxData,
  GkxDiagnostic,
  GkxOrigin,
  GkxOriginProjection,
  GkxProjection,
  GkxSensitivity,
} from "./types";

export const GKX23_PROFILE = "gkx-2.3-validating-projection" as const;
export const GKX23_POLICY = Object.freeze({
  id: "policy:gkx23-default-v1",
  version: "1.0.0",
  // SHA-256 of the canonical policy JSON shipped in docs/GKX-PLUS-2.3-PROFILE.md.
  hash: "sha256:2c2d8ec1e6481cbd4476bcc544c4fd19be03d8f21e317e44d889ea46e940ec8b",
  compatibleGkxVersions: ["2.3"],
  missingValueBehavior: "exclude-null-and-renormalize",
  weights: Object.freeze({
    structural_completeness: 0.15,
    provenance_quality: 0.20,
    evidence_support: 0.20,
    relationship_integrity: 0.15,
    temporal_freshness: 0.10,
    contradiction_status: 0.10,
    review_readiness: 0.10,
  }),
  // HASH-LOCKED FIELD, NOT A RUNTIME KNOB. This mirrors `sensitivity_default`
  // in the canonical policy JSON whose SHA-256 is `hash` above; changing the
  // value here would desync the constant from the hash the engine publishes.
  // It is SUPERSEDED for the missing-sensitivity path: since v1.0.6 the engine
  // fails closed, and resolveDefaultSensitivity() returns
  // FAIL_CLOSED_SENSITIVITY_DEFAULT ("secret") — or a deployment's explicit
  // Gkx23ProjectionOptions.defaultSensitivity — never this value. Nothing in
  // the engine reads this field; it exists solely for policy-document fidelity.
  sensitivityDefault: "internal" as GkxSensitivity,
  assessmentThresholds: Object.freeze([
    [0.90, "assessment:strongly-documented"],
    [0.75, "assessment:well-documented"],
    [0.60, "assessment:partially-supported"],
    [0.40, "assessment:weakly-supported"],
    [0.01, "assessment:insufficient"],
    [0.00, "assessment:invalid-or-untraceable"],
  ] as const),
});

const CORE_FIELDS = new Set([
  "gkx_version", "uid", "title", "type", "created_at", "updated_at",
  "authorship", "epistemic", "sensitivity", "provenance", "relationships",
  "evidence", "lineage", "review", "assessment", "authorization", "labels",
]);
const LEGACY_FIELDS = new Set([
  "description", "timestamp", "epistemic_state", "authorship_origin", "scope", "scope_id", "resource",
  "tags", "aliases", "supersedes", "superseded_by", "supersededBy",
  "forked_from", "forked_to", "forked_by", "depends_on", "derives_from",
  "contradicts", "refines", "implements", "blocks", "documents", "cites", "related_to",
]);
const RELATION_TYPES = GKX23_RELATION_TYPES;
const INVERSES: Record<string, string> = {
  supports: "supported_by", contradicts: "contradicted_by", depends_on: "required_by",
  derived_from: "source_of", derives_from: "source_of", cites: "cited_by", quotes: "quoted_by",
  interprets: "interpreted_by", tests: "tested_by", replicates: "replicated_by",
  fails_to_replicate: "failed_replication_by", extends: "extended_by", narrows: "broadened_by",
  generalizes: "specialized_by", implements: "implemented_by", governed_by: "governs",
  reviewed_by: "reviews", approved_by: "approves", supersedes: "superseded_by",
  superseded_by: "supersedes", related_to: "related_to", part_of: "has_part", has_part: "part_of",
  // 2026-07-27 fix: inverses for the three previously-dropped relations, using the
  // standard's `_by` convention (mirrors supersedes→superseded_by,
  // contradicts→contradicted_by).
  refines: "refined_by", blocks: "blocked_by", documents: "documented_by",
};
const EPISTEMIC_STATES = new Set([
  "unknown", "observation", "reported", "inferred", "hypothesis", "modeled",
  "supported", "contested", "refuted", "retracted", "accepted", "superseded",
]);
const SENSITIVITY_LEVELS: GkxSensitivity[] = [
  "public", "internal", "restricted", "confidential", "regulated", "phi", "secret",
];
// Ordering used for "raise-only, never lower" comparisons. Higher index = more
// restrictive. Any automatic detection (none ships today — see below) may only
// move effective sensitivity UP this ladder, never down.
export const SENSITIVITY_RANK: Record<GkxSensitivity, number> = Object.freeze(
  Object.fromEntries(SENSITIVITY_LEVELS.map((level, index) => [level, index])) as Record<GkxSensitivity, number>,
);
// GKOS §11 fail-closed default: a note that declares NO sensitivity resolves to
// the most restrictive practical level out of the box. Deployments may relax
// this via Gkx23ProjectionOptions.defaultSensitivity (validated below), but the
// engine ships closed.
export const FAIL_CLOSED_SENSITIVITY_DEFAULT: GkxSensitivity = "secret";
// Fallback effective epistemic state for a value outside the frozen twelve-state
// vocabulary. "unknown" is one of the twelve states (see EPISTEMIC_STATES) and is
// the GKOS-designated null-weight state.
export const EPISTEMIC_FALLBACK_STATE = "unknown" as const;

/** Options controlling deterministic projection behavior. */
export interface Gkx23ProjectionOptions {
  /**
   * Effective sensitivity applied when a note declares no sensitivity field.
   * Fail-closed to {@link FAIL_CLOSED_SENSITIVITY_DEFAULT} ("secret") when
   * omitted. Validated against the seven-level vocabulary; an unrecognized
   * value falls back to "secret". Downstream plugins may surface this as a
   * user-facing "default sensitivity" setting.
   *
   * NOTE: the engine ships NO PII/sensitive-content detection. If a deployment
   * adds detection, it must only RAISE effective sensitivity above this default
   * (never lower it) — the projection enforces raise-only via SENSITIVITY_RANK.
   */
  defaultSensitivity?: GkxSensitivity;
}

function resolveDefaultSensitivity(options?: Gkx23ProjectionOptions): GkxSensitivity {
  const configured = options?.defaultSensitivity;
  return configured && SENSITIVITY_LEVELS.includes(configured) ? configured : FAIL_CLOSED_SENSITIVITY_DEFAULT;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAMESPACED_ID = /^[a-z][a-z0-9_.-]*:[a-z0-9][a-z0-9_.:/-]{2,}$/i;

/**
 * Authored note identities use UUIDs. Namespaced identifiers remain valid
 * relationship/evidence targets but cannot become a note's canonical UID.
 */
export const isValidGkxAuthoredUid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

export const isValidGkxTargetIdentifier = (value: unknown): value is string =>
  typeof value === "string" && (UUID.test(value) || NAMESPACED_ID.test(value));
const SHA256 = /^sha256:[0-9a-f]{64}$/i;

interface YamlLine { indent: number; text: string; line: number }
interface ParserIssue { code: string; line: number; message: string }
interface ParsedFrontmatterInternal {
  data: Record<string, unknown>;
  issues: ParserIssue[];
  present: boolean;
  field_lines: Record<string, number>;
}

function diagnostic(
  code: string,
  severity: GkxDiagnostic["severity"],
  message: string,
  sourcePath: string,
  field?: string,
  remediation?: string,
): GkxDiagnostic {
  return { code, severity, field, message, deterministic: true, remediation, sourcePath };
}

function headerFromMarkdown(raw: string): { header: string | null; issue?: "unterminated" | "too-large" | "too-many-lines" } {
  const source = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const physicalLines = source.split(/\r?\n/u);
  if (physicalLines[0] !== "---") return { header: null };
  const end = physicalLines.findIndex((line, index) => index > 0 && line === "---");
  if (end < 0) return { header: null, issue: "unterminated" };
  if (end - 1 > 4096) return { header: null, issue: "too-many-lines" };
  const header = physicalLines.slice(1, end).join("\n");
  if (header.length > 262_144) return { header: null, issue: "too-large" };
  return { header };
}

function escapedAt(value: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor--) slashes++;
  return slashes % 2 === 1;
}

function stripYamlComment(value: string): string {
  let single = false, double = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "'" && !double) {
      if (single && value[i + 1] === "'") i++;
      else single = !single;
    }
    else if (ch === '"' && !single && !escapedAt(value, i)) double = !double;
    else if (ch === "#" && !single && !double && (i === 0 || /\s/.test(value[i - 1]))) return value.slice(0, i).trimEnd();
  }
  return value;
}

function splitInline(value: string): { values: string[]; valid: boolean } {
  const out: string[] = [];
  const stack: string[] = [];
  let buf = "", single = false, double = false, valid = true, endedWithSeparator = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "'" && !double) {
      if (single && value[i + 1] === "'") { buf += "''"; i++; continue; }
      single = !single;
      buf += ch;
      continue;
    }
    if (ch === '"' && !single && !escapedAt(value, i)) { double = !double; buf += ch; continue; }
    if (!single && !double) {
      if (ch === "[") stack.push("]");
      else if (ch === "{") stack.push("}");
      else if (ch === "]" || ch === "}") {
        if (stack.pop() !== ch) valid = false;
      }
      if (ch === "," && stack.length === 0) {
        const item = buf.trim();
        if (!item) valid = false;
        out.push(item);
        buf = "";
        endedWithSeparator = true;
        continue;
      }
    }
    buf += ch;
    if (!/\s/u.test(ch)) endedWithSeparator = false;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  else if (value.trim() && !endedWithSeparator) valid = false;
  return { values: out, valid: valid && !single && !double && stack.length === 0 };
}

function scalar(raw: string, line: number, issues: ParserIssue[], depth = 0): unknown {
  if (depth > 64) {
    issues.push({ code: "GKX_YAML_NESTING_LIMIT", line, message: "Inline YAML nesting exceeds 64 levels." });
    return null;
  }
  const value = stripYamlComment(raw).trim();
  if (!value || value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    issues.push({ code: "GKX_YAML_NUMBER_NONFINITE", line, message: "YAML numeric scalar is outside the finite number range." });
    return null;
  }
  if (/^(?:[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+|\.inf|\.nan|0[xob][0-9a-f_]+|\d[\d_]*(?:\.[\d_]*)?)|nan|inf)$/iu.test(value)) {
    issues.push({ code: "GKX_YAML_NUMBER_UNSUPPORTED", line, message: "Unsupported or non-finite YAML numeric scalar." });
    return null;
  }
  if (value === "[]") return [];
  if (value === "{}") return {};
  // Preserve the historical raw-frontmatter shape for YAML-valid spaced
  // empty mappings.  Existing projection consumers already treat that scalar
  // as an empty record; normalizing it here would change Phase0-2 bytes.
  if (/^\{\s+\}$/u.test(value)) return value;
  if (value.startsWith("[") && value.endsWith("]")) {
    const inline = splitInline(value.slice(1, -1));
    if (!inline.valid) {
      issues.push({ code: "GKX_YAML_FLOW_INVALID", line, message: "Malformed inline YAML sequence." });
      return [];
    }
    return inline.values.map((item) => scalar(item, line, issues, depth + 1));
  }
  if (value.startsWith("[") || value.endsWith("]") || value.startsWith("{") || value.endsWith("}")) {
    issues.push({ code: "GKX_YAML_FLOW_INVALID", line, message: "Malformed or unsupported YAML flow value." });
    return null;
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch {
      issues.push({ code: "GKX_YAML_QUOTE_INVALID", line, message: "Malformed double-quoted YAML scalar." });
      return null;
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    const inner = value.slice(1, -1);
    for (let index = 0; index < inner.length; index++) {
      if (inner[index] !== "'") continue;
      if (inner[index + 1] !== "'") {
        issues.push({ code: "GKX_YAML_QUOTE_INVALID", line, message: "Malformed single-quoted YAML scalar." });
        return null;
      }
      index++;
    }
    return inner.replace(/''/g, "'");
  }
  if (value.startsWith("'") || value.endsWith("'") || value.startsWith('"') || value.endsWith('"')) {
    issues.push({ code: "GKX_YAML_QUOTE_INVALID", line, message: "Malformed quoted YAML scalar." });
    return null;
  }
  if (/^(?:&|\*|!|---$|\.\.\.$)/u.test(value)) {
    issues.push({ code: "GKX_YAML_FEATURE_UNSUPPORTED", line, message: "Executable or multi-document YAML features are unsupported." });
    return null;
  }
  return value;
}

function keyValue(text: string): { key: string; rest: string } | null {
  const m = /^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/.exec(text);
  return m ? { key: m[1], rest: m[2] ?? "" } : null;
}

function isSafeYamlKey(key: string): boolean {
  return key !== "__proto__" && key !== "prototype" && key !== "constructor";
}

function pointerFor(path: readonly string[]): string {
  return path.length === 0 ? "" : `/${path.map((segment) => segment.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`;
}

function recordLocation(locations: Map<string, number>, path: readonly string[], line: number): void {
  locations.set(pointerFor(path), line);
}

function fieldLineRecord(locations: ReadonlyMap<string, number> = new Map()): Record<string, number> {
  const out = Object.create(null) as Record<string, number>;
  for (const [pointer, line] of locations) out[pointer] = line;
  return out;
}

function setSafe(target: Record<string, unknown>, key: string, value: unknown, line: number, issues: ParserIssue[]): void {
  if (!isSafeYamlKey(key)) {
    issues.push({ code: "GKX_YAML_KEY_UNSAFE", line, message: "Unsafe YAML mapping key is not allowed." });
    return;
  }
  Object.defineProperty(target, key, { configurable: true, enumerable: true, writable: true, value });
}

function parseBlock(
  lines: YamlLine[],
  start: number,
  indent: number,
  issues: ParserIssue[],
  fieldLocations: Map<string, number>,
  parentPath: readonly string[] = [],
  depth = 0,
): { value: unknown; next: number } {
  if (depth > 64) {
    issues.push({ code: "GKX_YAML_NESTING_LIMIT", line: lines[start]?.line ?? 1, message: "Frontmatter nesting exceeds 64 levels." });
    return { value: null, next: lines.length };
  }
  const arrayMode = lines[start]?.indent === indent && lines[start].text.startsWith("-");
  if (arrayMode) {
    const out: unknown[] = [];
    let i = start;
    while (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith("-")) {
      const itemIndex = out.length;
      recordLocation(fieldLocations, [...parentPath, String(itemIndex)], lines[i].line);
      const itemText = lines[i].text.replace(/^-\s?/, "").trim();
      i++;
      const first = keyValue(itemText);
      if (!itemText) {
        if (i < lines.length && lines[i].indent > indent) { const child = parseBlock(lines, i, lines[i].indent, issues, fieldLocations, [...parentPath, String(itemIndex)], depth + 1); out.push(child.value); i = child.next; }
        else out.push(null);
      } else if (first) {
        const obj: Record<string, unknown> = {};
        const itemPath = [...parentPath, String(itemIndex), first.key];
        if (isSafeYamlKey(first.key)) recordLocation(fieldLocations, itemPath, lines[i - 1].line);
        if (first.rest) setSafe(obj, first.key, scalar(first.rest, lines[i - 1].line, issues), lines[i - 1].line, issues);
        else if (i < lines.length && lines[i].indent > indent) {
          const nestedLocations = isSafeYamlKey(first.key) ? fieldLocations : new Map<string, number>();
          const child = parseBlock(lines, i, lines[i].indent, issues, nestedLocations, isSafeYamlKey(first.key) ? itemPath : [], depth + 1);
          setSafe(obj, first.key, child.value, lines[i - 1].line, issues);
          i = child.next;
        }
        else setSafe(obj, first.key, null, lines[i - 1].line, issues);
        if (i < lines.length && lines[i].indent > indent) {
          const child = parseBlock(lines, i, lines[i].indent, issues, fieldLocations, [...parentPath, String(itemIndex)], depth + 1);
          if (child.value && typeof child.value === "object" && !Array.isArray(child.value)) {
            for (const [key, value] of Object.entries(child.value)) setSafe(obj, key, value, lines[i].line, issues);
          } else issues.push({ code: "GKX_YAML_LIST_MAPPING_CONTINUATION", line: lines[i].line, message: "A mapping list item has a non-mapping continuation." });
          i = child.next;
        }
        out.push(obj);
      } else {
        out.push(scalar(itemText, lines[i - 1].line, issues));
        if (i < lines.length && lines[i].indent > indent) {
          issues.push({ code: "GKX_YAML_LIST_SCALAR_CONTINUATION", line: lines[i].line, message: "A scalar list item has an unexpected nested continuation." });
          const child = parseBlock(lines, i, lines[i].indent, issues, fieldLocations, [...parentPath, String(itemIndex)], depth + 1); i = child.next;
        }
      }
    }
    return { value: out, next: i };
  }

  const out: Record<string, unknown> = {};
  let i = start;
  while (i < lines.length && lines[i].indent === indent && !lines[i].text.startsWith("-")) {
    const entry = keyValue(lines[i].text);
    if (!entry) { issues.push({ code: "GKX_YAML_MAPPING_UNSUPPORTED", line: lines[i].line, message: "Unsupported YAML mapping line." }); i++; continue; }
    const entryLine = lines[i].line;
    const entryPath = [...parentPath, entry.key];
    if (isSafeYamlKey(entry.key)) recordLocation(fieldLocations, entryPath, entryLine);
    i++;
    if (Object.prototype.hasOwnProperty.call(out, entry.key)) issues.push({ code: "GKX_YAML_DUPLICATE_KEY", line: lines[i - 1].line, message: `Duplicate key ${entry.key}.` });
    if (entry.rest) setSafe(out, entry.key, scalar(entry.rest, entryLine, issues), entryLine, issues);
    else if (i < lines.length && lines[i].indent > indent) {
      const nestedLocations = isSafeYamlKey(entry.key) ? fieldLocations : new Map<string, number>();
      const child = parseBlock(lines, i, lines[i].indent, issues, nestedLocations, isSafeYamlKey(entry.key) ? entryPath : [], depth + 1);
      setSafe(out, entry.key, child.value, entryLine, issues);
      i = child.next;
    }
    // Same-indent block sequence: a `- ` list whose items sit at the SAME
    // indent as the mapping key (standard YAML; Obsidian emits this). Only
    // valid when the key had no inline value and the next line at this indent
    // begins a sequence item. parseBlock's array loop terminates on the next
    // non-`-` line at this indent, so a following `key:` still ends the list.
    else if (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith("-")) {
      const nestedLocations = isSafeYamlKey(entry.key) ? fieldLocations : new Map<string, number>();
      const child = parseBlock(lines, i, indent, issues, nestedLocations, isSafeYamlKey(entry.key) ? entryPath : [], depth + 1);
      setSafe(out, entry.key, child.value, entryLine, issues);
      i = child.next;
    }
    else setSafe(out, entry.key, null, entryLine, issues);
  }
  return { value: out, next: i };
}

function parseGkx23FrontmatterInternal(raw: string): ParsedFrontmatterInternal {
  const bounded = headerFromMarkdown(raw);
  if (bounded.header === null) return {
    data: {}, present: false, field_lines: fieldLineRecord(),
    issues: bounded.issue ? [{
      code: bounded.issue === "too-large" ? "GKX_FRONTMATTER_SIZE_LIMIT" : bounded.issue === "too-many-lines" ? "GKX_FRONTMATTER_LINE_LIMIT" : "GKX_FRONTMATTER_UNTERMINATED",
      line: 1,
      message: bounded.issue === "too-large" ? "Frontmatter exceeds 256 KiB." : bounded.issue === "too-many-lines" ? "Frontmatter exceeds 4096 physical lines." : "Frontmatter is unterminated.",
    }] : [],
  };
  const issues: ParserIssue[] = [];
  const fieldLocations = new Map<string, number>();
  const lines: YamlLine[] = [];
  for (const [index, rawLine] of bounded.header.split(/\r?\n/).entries()) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    if (/\t/.test(rawLine.match(/^\s*/)?.[0] ?? "")) { issues.push({ code: "GKX_YAML_INDENT_TAB", line: index + 2, message: "Tabs are not allowed for YAML indentation." }); continue; }
    const indent = rawLine.match(/^ */)?.[0].length ?? 0;
    lines.push({ indent, text: rawLine.trim(), line: index + 2 });
  }
  if (!lines.length) return { data: {}, present: true, field_lines: fieldLineRecord(), issues };
  if (lines[0].indent !== 0) issues.push({ code: "GKX_YAML_TOP_LEVEL_INDENT", line: lines[0].line, message: "Top-level frontmatter must start at indentation zero." });
  const parsed = parseBlock(lines, 0, lines[0].indent, issues, fieldLocations);
  if (parsed.next < lines.length) issues.push({ code: "GKX_YAML_UNPARSED_CONTENT", line: lines[parsed.next].line, message: "Unparsed YAML content remains." });
  return {
    data: parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value) ? parsed.value as Record<string, unknown> : {},
    present: true,
    issues,
    field_lines: fieldLineRecord(fieldLocations),
  };
}

/** Parse the non-executable YAML subset used by the GKX v2.3 profile. */
export function parseGkx23Frontmatter(raw: string): { data: Record<string, unknown>; issues: Array<{ line: number; message: string }>; present: boolean } {
  const parsed = parseGkx23FrontmatterInternal(raw);
  return {
    data: parsed.data,
    issues: parsed.issues.map(({ line, message }) => ({ line, message })),
    present: parsed.present,
  };
}

const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : v == null ? [] : [v];
const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
const number = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const clamp = (n: number): number => Math.max(0, Math.min(1, n));
const rounded = (n: number | null): number | null => n == null ? null : Math.round(clamp(n) * 10_000) / 10_000;

function relationTarget(item: unknown): string | null {
  const normalize = (value: string | null): string | null => {
    if (!value) return null;
    const raw = value.trim();
    const wiki = /^\[\[([^\]\r\n]+)\]\]$/.exec(raw);
    const target = (wiki?.[1] ?? raw).split("|")[0].split("#")[0].trim();
    return target || null;
  };
  if (typeof item === "string") return normalize(item);
  const obj = record(item);
  return normalize(text(obj.target) ?? text(obj.target_uid) ?? text(obj.uid));
}

function relationOrigin(item: unknown, fallback: GkxOrigin = "authored"): GkxOrigin {
  const value = text(record(item).origin);
  return value === "derived" || value === "proposed" || value === "approved" || value === "authored" ? value : fallback;
}

function blankProjection(): GkxOriginProjection { return { tags: [], labels: [], relationships: {} }; }

function splitRelations(source: Record<string, unknown>, origins: Record<GkxOrigin, GkxOriginProjection>, fallback: GkxOrigin): void {
  for (const type of RELATION_TYPES) {
    for (const item of list(source[type])) {
      const target = relationTarget(item);
      if (!target) continue;
      const origin = relationOrigin(item, fallback);
      (origins[origin].relationships[type] ??= []).push(item);
    }
  }
}

function appendAuthoredRelationships(target: GkxOriginProjection, type: string, values: string[]): void {
  if (!values.length) return;
  const existing = target.relationships[type] ?? [];
  const seen = new Set(existing.map(relationTarget).filter((value): value is string => Boolean(value)));
  for (const value of values) {
    const normalized = relationTarget(value);
    if (normalized && !seen.has(normalized)) { existing.push(normalized); seen.add(normalized); }
  }
  target.relationships[type] = existing;
}

function replaceAuthoredRelationships(target: GkxOriginProjection, type: string, values: string[]): void {
  const normalized = [...new Set(values.map(relationTarget).filter((value): value is string => Boolean(value)))];
  if (normalized.length) target.relationships[type] = normalized;
  else delete target.relationships[type];
}

function compatibleEpistemicState(value: string | null): string | null {
  if (value === "fact") return "reported";
  if (value === "verified_inference") return "inferred";
  if (value === "deprecated") return "superseded";
  return value;
}

function splitLabels(source: Record<string, unknown>, origins: Record<GkxOrigin, GkxOriginProjection>): void {
  for (const origin of ["authored", "derived", "proposed", "approved"] as GkxOrigin[]) {
    origins[origin].labels = list(source[origin]).filter((x) => typeof x === "string" || (x && typeof x === "object"));
  }
}

function splitEvidence(source: Record<string, unknown>, origins: Record<GkxOrigin, GkxOriginProjection>, fallback: GkxOrigin): void {
  for (const kind of ["supports", "contradicts"] as const) {
    for (const item of list(source[kind])) {
      const origin = relationOrigin(item, fallback);
      const evidence = record(origins[origin].evidence);
      const items = list(evidence[kind]);
      items.push(item);
      evidence[kind] = items;
      origins[origin].evidence = evidence;
    }
  }
}

function evidenceEntries(projection: GkxProjection, kind: "supports" | "contradicts"): unknown[] {
  const out: unknown[] = [];
  for (const origin of [projection.authored, projection.derived, projection.proposed, projection.approved]) {
    const evidence = record(origin.evidence);
    out.push(...list(evidence[kind]));
  }
  return out;
}

function groupedEvidence(items: unknown[]): number | null {
  if (!items.length) return null;
  const groups = new Map<string, number>();
  let assessable = 0;
  for (const [index, item] of items.entries()) {
    const obj = record(item);
    const strength = number(obj.strength), relevance = number(obj.relevance);
    if (strength == null || relevance == null || strength < 0 || strength > 1 || relevance < 0 || relevance > 1) continue;
    assessable++;
    // The built-in policy maps an explicitly referenced but unverified source to 0.45.
    const sourceQuality = text(obj.source_uid) || text(obj.target) ? 0.45 : 0.20;
    const weight = strength * relevance * sourceQuality;
    const group = text(obj.independence_group) ?? `ungrouped:${index}`;
    groups.set(group, Math.max(groups.get(group) ?? 0, weight));
  }
  if (!assessable) return null;
  let product = 1;
  for (const weight of groups.values()) product *= 1 - weight;
  return 1 - product;
}

function hasApproval(approved: GkxOriginProjection, authored: GkxOriginProjection): boolean {
  const authorization = record(authored.authorization);
  return approved.labels.length > 0 || Object.keys(approved.relationships).length > 0 || Boolean(text(authorization.decision_id));
}

function assessmentLabel(score: number | null): string {
  if (score == null) return "assessment:not-assessable";
  for (const [threshold, label] of GKX23_POLICY.assessmentThresholds) if (score >= threshold) return label;
  return "assessment:not-assessable";
}

export function assessGkx23(projection: GkxProjection): GkxAssessment {
  const a = projection.authored;
  const diagnostics = projection.diagnostics;
  const frontmatter = projection.rawFrontmatter;
  const uid = text(a.uid);
  const epistemic = record(a.epistemic);
  const provenance = record(a.provenance);
  const review = record(a.review);
  const relationships = record(frontmatter.relationships);

  const structureParts: Array<[number, boolean]> = [
    [0.15, isValidGkxAuthoredUid(uid)],
    [0.05, Boolean(text(a.title))], [0.10, Boolean(text(a.type))],
    [0.10, Boolean(text(a.createdAt) && !Number.isNaN(Date.parse(text(a.createdAt)!)))],
    [0.10, Object.keys(record(a.authorship)).length > 0], [0.10, Boolean(text(epistemic.state))],
    [0.10, Boolean(text(record(a.sensitivityBlock).level) || a.sensitivity)],
    [0.15, Object.keys(provenance).length > 0], [0.10, Object.keys(relationships).length > 0],
    [0.05, Object.keys(review).length > 0 && Object.keys(record(a.assessmentReference)).length > 0],
  ];
  const structural = structureParts.reduce((sum, [weight, valid]) => sum + (valid ? weight : 0), 0);

  let provenanceQuality = 0;
  const refs = list(provenance.source_refs).filter((x) => text(x));
  const locator = record(provenance.source_locator);
  const hash = text(provenance.content_hash);
  if (refs.length) provenanceQuality = Object.keys(locator).length ? (hash && SHA256.test(hash) ? 0.80 : 0.65) : 0.45;
  else if (text(provenance.source_kind)) provenanceQuality = 0.20;
  if (record(provenance.extraction).method == null) provenanceQuality -= 0.10;
  if (diagnostics.some((d) => d.code.startsWith("GKX-PROVENANCE") && d.severity === "error")) provenanceQuality -= 0.20;

  const support = groupedEvidence(evidenceEntries(projection, "supports"));
  const contradiction = groupedEvidence(evidenceEntries(projection, "contradicts"));
  const evidenceSupport = support == null ? null : support * (1 - 0.75 * (contradiction ?? 0));

  let relationshipIntegrity = 1;
  for (const d of diagnostics) {
    if (d.code === "GKX-IDENTITY-003" || d.code === "GKX-LINEAGE-002") relationshipIntegrity = 0;
    else if (d.code.startsWith("GKX-RELATIONSHIP") && d.severity === "error") relationshipIntegrity -= 0.20;
    else if (d.code.startsWith("GKX-LINEAGE") && d.severity === "error") relationshipIntegrity -= 0.30;
    else if (d.code.startsWith("GKX-RELATIONSHIP") || d.code.startsWith("GKX-LINEAGE")) relationshipIntegrity -= 0.10;
  }

  let freshness: number | null = null;
  const lastReview = text(review.last_reviewed_at), nextDue = text(review.next_review_due);
  if (lastReview && !Number.isNaN(Date.parse(lastReview))) {
    const anchor = text(a.updatedAt) ?? text(a.createdAt) ?? lastReview;
    const age = Math.max(0, Date.parse(anchor) - Date.parse(lastReview));
    freshness = clamp(1 - age / (395 * 86_400_000));
  } else if (nextDue && !Number.isNaN(Date.parse(nextDue))) freshness = 1;

  const contradictionStatus = contradiction == null ? null : clamp(1 - contradiction);
  const readinessParts: Array<[number, boolean]> = [
    [0.15, Boolean(text(a.title))], [0.20, refs.length > 0],
    [0.15, evidenceEntries(projection, "supports").length > 0],
    [0.15, evidenceEntries(projection, "contradicts").length > 0 || Boolean(record(a.evidence).contradicts)],
    [0.10, projection.proposed.labels.length > 0 || Object.keys(projection.proposed.relationships).length > 0],
    [0.10, Boolean(text(record(a.authorization).status))], [0.05, Boolean(a.sensitivity)],
    [0.05, Boolean(text(record(a.authorization).authorized_by))], [0.05, Boolean(record(a.assessmentReference).current_assessment_id)],
  ];
  const reviewReadiness = readinessParts.reduce((sum, [weight, valid]) => sum + (valid ? weight : 0), 0);

  const components: GkxAssessmentScores = {
    structural_completeness: rounded(structural), provenance_quality: rounded(provenanceQuality),
    evidence_support: rounded(evidenceSupport), relationship_integrity: rounded(relationshipIntegrity),
    temporal_freshness: rounded(freshness), contradiction_status: rounded(contradictionStatus),
    review_readiness: rounded(reviewReadiness), overall: null,
  };
  let weighted = 0, applied = 0;
  const exclusions: string[] = [];
  for (const [key, weight] of Object.entries(GKX23_POLICY.weights)) {
    const value = components[key as keyof GkxAssessmentScores];
    if (value == null) exclusions.push(key);
    else { weighted += value * weight; applied += weight; }
  }
  components.overall = applied ? rounded(weighted / applied) : null;
  const label = assessmentLabel(components.overall);
  const deterministicAt = text(a.updatedAt) ?? text(a.createdAt) ?? "1970-01-01T00:00:00.000Z";
  return {
    assessmentId: `assessment:${projection.contentHash.replace(/[^a-z0-9]/gi, "-")}`,
    targetUid: uid, profile: GKX23_PROFILE,
    policy: { id: GKX23_POLICY.id, version: GKX23_POLICY.version, hash: GKX23_POLICY.hash, weights: { ...GKX23_POLICY.weights }, missingValueBehavior: GKX23_POLICY.missingValueBehavior },
    assessor: { id: "tool:gkos-engine", engineVersion: ENGINE_VERSION }, inputHash: `fnv1a32:${projection.contentHash}`,
    calculatedAt: deterministicAt, scores: components, exclusions, labels: { derived: [label] }, diagnostics: [...diagnostics],
    interpretation: "documentation-and-support-quality-not-truth",
  };
}

export interface Gkx23CanonicalBuildResult {
  projection: GkxProjection | undefined;
  receipt: {
    applicable: true;
    present: boolean;
    field_lines: Record<string, number>;
    negative_zero_fields: string[];
    issues: Array<{ code: string; line: number }>;
    invalid_declarations: GkxAuthoredDeclarationIssueReceipt[];
  };
}

function receiptPointerSegment(value: string): string {
  return value.replace(/~/gu, "~0").replace(/\//gu, "~1");
}

function negativeZeroFieldPointers(value: unknown, path: readonly string[] = [], out: string[] = []): string[] {
  if (typeof value === "number" && Object.is(value, -0)) {
    out.push(`/${path.map(receiptPointerSegment).join("/")}`);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => negativeZeroFieldPointers(item, [...path, String(index)], out));
  } else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      negativeZeroFieldPointers(item, [...path, key], out);
    }
  }
  return out.sort(codeUnitCompare);
}

function authoredDeclarationIssueReceipts(
  data: Record<string, unknown>,
  fieldLines: Readonly<Record<string, number>>,
): GkxAuthoredDeclarationIssueReceipt[] {
  const issues: GkxAuthoredDeclarationIssueReceipt[] = [];
  const relationTypes = new Set<string>(RELATION_TYPES);
  const lineAt = (base: string, index: number, array: boolean): number => {
    const line = fieldLines[array ? `${base}/${index}` : base] ?? fieldLines[base];
    if (!Number.isSafeInteger(line) || line <= 0) throw new Error("GKX_CANONICAL_DECLARATION_LOCATION_MISSING");
    return line;
  };
  const slots = (value: unknown): Array<[number, unknown]> => Array.isArray(value)
    ? value.length === 0 ? [] : [...value.entries()]
    : [[0, value]];
  const validTarget = (item: unknown): boolean => {
    const target = relationTarget(item);
    return target !== null && target.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(target);
  };
  const validRelationshipItem = (item: unknown): boolean => {
    if (typeof item === "string") return validTarget(item);
    if (item === null || typeof item !== "object" || Array.isArray(item)) return false;
    const object = item as Record<string, unknown>;
    const keys = Object.keys(object);
    if (keys.some((key) => !["target", "target_uid", "uid", "origin"].includes(key))) return false;
    const targetKeys = ["target", "target_uid", "uid"].filter((key) => Object.hasOwn(object, key));
    if (targetKeys.length !== 1 || typeof object[targetKeys[0]] !== "string") return false;
    if (Object.hasOwn(object, "origin") && !["authored", "derived", "proposed", "approved"].includes(object.origin as string)) return false;
    return validTarget(item);
  };
  const inspect = (category: "lineage" | "relationship", field: string, base: string, value: unknown, forceInvalid = false): void => {
    const entries = slots(value);
    if (entries.length === 0 && forceInvalid) {
      issues.push({ category, field, declaration_index: 0, indexed: false, line: lineAt(base, 0, false) });
      return;
    }
    for (const [declaration_index, item] of entries) {
      if (!forceInvalid && validRelationshipItem(item)) continue;
      issues.push({ category, field, declaration_index, indexed: Array.isArray(value),
        line: lineAt(base, declaration_index, Array.isArray(value)) });
    }
  };
  const inspectScalarLineage = (field: "supersedes" | "superseded_by", base: string, value: unknown): void => {
    if (!Array.isArray(value) && typeof value === "string" && validTarget(value)) return;
    const entries = Array.isArray(value) && value.length > 0 ? [...value.entries()] : [[0, value] as [number, unknown]];
    for (const [declaration_index] of entries) {
      issues.push({ category: "lineage", field, declaration_index, indexed: Array.isArray(value),
        line: lineAt(base, declaration_index, Array.isArray(value)) });
    }
  };

  for (const type of RELATION_TYPES) {
    if (!Object.hasOwn(data, type)) continue;
    inspect(type === "supersedes" || type === "superseded_by" ? "lineage" : "relationship",
      type === "supersedes" || type === "superseded_by" ? type : `relationships.${type}`,
      `/${receiptPointerSegment(type)}`, data[type]);
  }
  const relationships = record(data.relationships);
  if (Object.hasOwn(data, "relationships") &&
      (data.relationships === null || typeof data.relationships !== "object" || Array.isArray(data.relationships))) {
    issues.push({ category: "relationship", field: "relationships", declaration_index: 0, indexed: false,
      line: lineAt("/relationships", 0, false) });
  } else if (data.relationships !== null && typeof data.relationships === "object" && !Array.isArray(data.relationships)) {
    for (const [type, value] of Object.entries(relationships)) {
      const known = relationTypes.has(type);
      inspect(type === "supersedes" || type === "superseded_by" ? "lineage" : "relationship",
        known && type !== "supersedes" && type !== "superseded_by" ? `relationships.${type}`
          : known ? type : "relationships",
        `/relationships/${receiptPointerSegment(type)}`, value, !known);
    }
  }
  const lineage = record(data.lineage);
  if (data.lineage !== null && typeof data.lineage === "object" && !Array.isArray(data.lineage)) {
    for (const field of ["predecessor_uid", "successor_uid"] as const) {
      if (!Object.hasOwn(lineage, field)) continue;
      inspectScalarLineage(field === "predecessor_uid" ? "supersedes" : "superseded_by", `/lineage/${field}`, lineage[field]);
    }
  }
  return issues.sort((left, right) => left.line - right.line || codeUnitCompare(left.category, right.category) ||
    codeUnitCompare(left.field, right.field) || left.declaration_index - right.declaration_index);
}

/** Package-private canonical-record path. Entry-point exports keep it sealed. */
export function buildGkx23ProjectionForCanonicalRecord(
  raw: string,
  sourcePath: string,
  contentHash: string,
  legacy: GkxData | null,
  options: Gkx23ProjectionOptions = {},
): Gkx23CanonicalBuildResult {
  const parsed = parseGkx23FrontmatterInternal(raw);
  const receipt = {
    applicable: true as const,
    present: parsed.present,
    field_lines: fieldLineRecord(new Map(Object.entries(parsed.field_lines))),
    negative_zero_fields: negativeZeroFieldPointers(parsed.data),
    issues: parsed.issues.map(({ code, line }) => ({ code, line })),
    invalid_declarations: authoredDeclarationIssueReceipts(parsed.data, parsed.field_lines),
  };
  return { projection: buildGkx23ProjectionFromParsed(parsed, raw, sourcePath, contentHash, legacy, options), receipt };
}

/** Build an origin-preserving projection for canonical v2.3 and legacy notes. */
export function buildGkx23Projection(raw: string, sourcePath: string, contentHash: string, legacy: GkxData | null, options: Gkx23ProjectionOptions = {}): GkxProjection | undefined {
  return buildGkx23ProjectionForCanonicalRecord(raw, sourcePath, contentHash, legacy, options).projection;
}

function buildGkx23ProjectionFromParsed(
  parsed: ParsedFrontmatterInternal,
  raw: string,
  sourcePath: string,
  contentHash: string,
  legacy: GkxData | null,
  options: Gkx23ProjectionOptions,
): GkxProjection | undefined {
  const data = parsed.data;
  const version = text(data.gkx_version);
  if (!parsed.present && !legacy) return undefined;
  const mode: GkxProjection["mode"] = version === "2.3" ? "strict-v2.3" : version ? "compatible" : "legacy";
  const diagnostics: GkxDiagnostic[] = parsed.issues.map((issue) => diagnostic("GKX-SCHEMA-001", "error", `${issue.message} (line ${issue.line})`, sourcePath, "frontmatter"));
  if (version && version !== "2.3") diagnostics.push(diagnostic("GKX-SCHEMA-002", "info", `GKX compatibility input ${version} is read through the projection; the source note was not rewritten.`, sourcePath, "gkx_version"));
  if (!version) diagnostics.push(diagnostic("GKX-SCHEMA-003", "warning", "No GKX compatibility version is declared; legacy semantics apply.", sourcePath, "gkx_version"));

  const origins: Record<GkxOrigin, GkxOriginProjection> = {
    authored: blankProjection(), derived: blankProjection(), proposed: blankProjection(), approved: blankProjection(),
  };
  const authored = origins.authored;
  authored.uid = text(data.uid) ?? legacy?.uid ?? null;
  authored.title = text(data.title) ?? legacy?.title ?? null;
  authored.type = text(data.type) ?? legacy?.type ?? null;
  authored.createdAt = text(data.created_at) ?? legacy?.timestamp ?? null;
  authored.updatedAt = text(data.updated_at);
  authored.tags = list(data.tags).filter((value): value is string => typeof value === "string");
  // The flat editable 2.3 profile authors governance essentials as scalar
  // Obsidian Properties (authorship_origin, epistemic_state, sensitivity);
  // nested blocks, when present, always win over the flat equivalents.
  const flatOrigin = text(data.authorship_origin);
  authored.authorship = Object.keys(record(data.authorship)).length
    ? record(data.authorship)
    : flatOrigin ? { origin: flatOrigin } : {};
  const declaredOrigin = text(record(data.authorship).origin) ?? flatOrigin ?? "unknown";
  authored.assertionOrigin = declaredOrigin;
  const fallbackOrigin: GkxOrigin = declaredOrigin === "derived" || declaredOrigin === "proposed" || declaredOrigin === "approved" ? declaredOrigin : "authored";
  authored.epistemic = record(data.epistemic);
  authored.epistemicState = compatibleEpistemicState(text(record(data.epistemic).state) ?? text(data.epistemic_state) ?? legacy?.epistemicState ?? null);
  authored.sensitivityBlock = record(data.sensitivity);
  const flatSensitivity = typeof data.sensitivity === "string" ? text(data.sensitivity) : null;
  authored.sensitivity = (text(record(data.sensitivity).level) ?? flatSensitivity ?? legacy?.sensitivity ?? null) as GkxSensitivity | null;
  authored.provenance = record(data.provenance);
  authored.evidence = {};
  authored.lineage = record(data.lineage);
  authored.review = record(data.review);
  authored.assessmentReference = record(data.assessment);
  authored.authorization = record(data.authorization);
  splitLabels(record(data.labels), origins);
  splitRelations(record(data.relationships), origins, fallbackOrigin);
  splitEvidence(record(data.evidence), origins, fallbackOrigin);

  if (version === "2.3") {
    const requiredScalars = ["gkx_version", "uid", "title", "type", "created_at"];
    for (const key of requiredScalars) if (!text(data[key])) diagnostics.push(diagnostic("GKX-SCHEMA-004", "error", `Required GKX 2.3 field ${key} is missing or empty.`, sourcePath, key));
    // Governance blocks are optional in-note: the flat editable profile keeps
    // them out of frontmatter and the projection supplies in-memory defaults
    // (spec §2.1 permits derived metadata to live outside the source note).
    // When a block IS authored it must be a mapping, except sensitivity which
    // may be a flat scalar level.
    const optionalBlocks = ["authorship", "epistemic", "provenance", "relationships", "evidence", "lineage", "review", "assessment", "authorization", "labels"];
    for (const key of optionalBlocks) if (data[key] != null && (typeof data[key] !== "object" || Array.isArray(data[key]))) {
      diagnostics.push(diagnostic("GKX-SCHEMA-004", "error", `GKX 2.3 block ${key} must be a mapping when present.`, sourcePath, key));
    }
    if (data.sensitivity != null && typeof data.sensitivity !== "string" && (typeof data.sensitivity !== "object" || Array.isArray(data.sensitivity))) {
      diagnostics.push(diagnostic("GKX-SCHEMA-004", "error", "GKX 2.3 sensitivity must be a flat level or a mapping.", sourcePath, "sensitivity"));
    }
    if (!text(record(data.epistemic).state) && !text(data.epistemic_state)) {
      diagnostics.push(diagnostic("GKX-SCHEMA-004", "error", "GKX 2.3 requires an epistemic state (epistemic.state or flat epistemic_state).", sourcePath, "epistemic.state"));
    }
  }

  const assignment = record(data.gkx_assignment);
  const assignedRole = text(record(assignment.role).id);
  if (assignedRole === "specialist-reviewer") {
    const authority = record(assignment.authority);
    for (const key of ["may_approve", "may_authorize_use", "may_modify_originals", "may_lower_sensitivity", "may_promote_epistemic_state", "may_change_authoritative_lineage"]) {
      if (authority[key] === true) diagnostics.push(diagnostic("GKX-AUTHORITY-ROLE-001", "critical", `Specialist Reviewer assignment cannot grant ${key} without a separate accepted authority contract.`, sourcePath, `gkx_assignment.authority.${key}`));
    }
    if (text(record(assignment.output).write_mode) !== "proposal-sidecar-only") diagnostics.push(diagnostic("GKX-AUTHORITY-ROLE-002", "error", "Specialist Reviewer output must be proposal-sidecar-only.", sourcePath, "gkx_assignment.output.write_mode"));
  }
  // Flat Obsidian Properties remain the human-editable authoring surface even
  // when a native 2.3 note is present. This makes a tags/relationship edit take
  // effect on the next incremental vault update without editing nested YAML.
  if (legacy) {
    for (const kind of RELATION_TYPES) {
      const targets = legacy.relations[kind] ?? [];
      // Presence matters: an explicitly emptied Property removes the authored
      // nested declaration instead of silently resurrecting it.
      if (version === "2.3" && Object.prototype.hasOwnProperty.call(data, kind)) replaceAuthoredRelationships(authored, kind, targets);
      else appendAuthoredRelationships(authored, kind, targets);
    }
    if (!Object.prototype.hasOwnProperty.call(data, "related_to")) appendAuthoredRelationships(authored, "related_to", legacy.related);
  }

  const uid = text(authored.uid);
  if (!uid) diagnostics.push(diagnostic("GKX-IDENTITY-001", "warning", "The note has no canonical UID and remains path-bound.", sourcePath, "uid", "Assign a stable UUIDv7 through an authorized migration."));
  else if (!isValidGkxAuthoredUid(uid)) diagnostics.push(diagnostic("GKX-IDENTITY-002", "error", "An authored note UID must be a UUID; namespaced identifiers are valid only as relationship or evidence targets.", sourcePath, "uid"));
  // Epistemic state: the AUTHORED value (kept verbatim on authored.epistemicState
  // and echoed in the diagnostic below) is never silently erased, but a value
  // outside the frozen twelve-state vocabulary must not flow through as the
  // EFFECTIVE state. It falls back to "unknown" (null-weight) with a
  // machine-detectable defaulted-marking on the effective projection so a
  // consumer reading only effective state still treats the note as unknown.
  const authoredEpistemicState = text(authored.epistemicState);
  let effectiveEpistemicState = authoredEpistemicState;
  let epistemicStateDefaulted = false;
  if (authoredEpistemicState && !EPISTEMIC_STATES.has(authoredEpistemicState)) {
    diagnostics.push(diagnostic(
      "GKX-EPISTEMIC-002", "error",
      `Unknown epistemic state: ${authoredEpistemicState}. Effective state falls back to "${EPISTEMIC_FALLBACK_STATE}" (null-weight); the invalid value is retained here for repair.`,
      sourcePath, "epistemic.state",
      `Rewrite epistemic.state (or the flat epistemic_state property) to one of the twelve valid GKOS states, e.g. "hypothesis" or "${EPISTEMIC_FALLBACK_STATE}". An upgrade-all migration run rewrites invalid states to the conservative default automatically.`,
    ));
    effectiveEpistemicState = EPISTEMIC_FALLBACK_STATE;
    epistemicStateDefaulted = true;
  }
  if (authoredEpistemicState === "accepted" && !hasApproval(origins.approved, authored)) diagnostics.push(diagnostic("GKX-EPISTEMIC-004", "warning", "Accepted state lacks an approval or authorization record; acceptance is not treated as verified authority.", sourcePath, "epistemic.state"));

  // Temporal diagnostic (DIV-001): a naive wall-clock timestamp (no Z, no
  // numeric offset) is rejected by the schema and the stamper; the projection
  // must flag it too, using the SAME shared validator (isValidGkxTimestamp).
  for (const [field, value] of [
    ["created_at", text(data.created_at) ?? legacy?.timestamp ?? null],
    ["updated_at", text(data.updated_at)],
  ] as const) {
    if (value && !isValidGkxTimestamp(value)) {
      diagnostics.push(diagnostic(
        "GKX-TEMPORAL-001", "warning",
        `${field} "${value}" is not a portable timestamp: it lacks a UTC "Z" designator or a numeric ±HH:MM offset (naive wall-clock is rejected by the schema and the stamper).`,
        sourcePath, field,
        "Rewrite as ISO-8601 with an explicit zone, e.g. 2026-07-20T12:00:00Z or 2026-07-20T12:00:00-04:00.",
      ));
    }
  }

  // Fail-closed sensitivity (DIV-002 / GKOS §11): a note that declares no
  // sensitivity resolves to the configured restricted default ("secret" out of
  // the box), NOT to a mid-open level. The default is configurable per
  // deployment via options.defaultSensitivity but can only be relaxed
  // explicitly; the engine never silently defaults to an open level.
  // GKX-SENSITIVITY-001 keeps firing so the defaulting stays visible.
  const rawSensitivity = text(record(data.sensitivity).level) ?? flatSensitivity ?? legacy?.sensitivity ?? null;
  const defaultSensitivity = resolveDefaultSensitivity(options);
  let effectiveSensitivity: GkxSensitivity = defaultSensitivity;
  if (!rawSensitivity) diagnostics.push(diagnostic("GKX-SENSITIVITY-001", "warning", `Sensitivity is missing; effective sensitivity fails closed to the restricted default (${defaultSensitivity}).`, sourcePath, "sensitivity.level"));
  else if (SENSITIVITY_LEVELS.includes(rawSensitivity as GkxSensitivity)) effectiveSensitivity = rawSensitivity as GkxSensitivity;
  else { effectiveSensitivity = "secret"; diagnostics.push(diagnostic("GKX-SENSITIVITY-005", "error", "Invalid sensitivity fails closed to secret for effective access control.", sourcePath, "sensitivity.level")); }
  // Detection hook (raise-only, per SENSITIVITY_RANK): no PII/sensitive-content
  // detection ships in the engine today. If a deployment adds one, it plugs in
  // here and may only INCREASE effectiveSensitivity above the value resolved
  // from the authored/default classification — never lower it. An authored
  // classification (including a legitimately open one) is otherwise respected
  // as-is; the fail-closed default only governs the MISSING-sensitivity case.

  const provenance = record(authored.provenance);
  const refs = list(provenance.source_refs).filter((x) => text(x));
  const hash = text(provenance.content_hash);
  if (!refs.length) diagnostics.push(diagnostic("GKX-PROVENANCE-001", "warning", "No source reference is declared.", sourcePath, "provenance.source_refs"));
  if (hash && !SHA256.test(hash)) diagnostics.push(diagnostic("GKX-PROVENANCE-002", "error", "Provenance content_hash must use sha256 followed by 64 hexadecimal characters.", sourcePath, "provenance.content_hash"));

  for (const kind of ["supports", "contradicts"] as const) for (const [index, item] of evidenceEntries({ authored, derived: origins.derived, proposed: origins.proposed, approved: origins.approved } as GkxProjection, kind).entries()) {
    const obj = record(item), strength = number(obj.strength), relevance = number(obj.relevance);
    if (strength == null || strength < 0 || strength > 1) diagnostics.push(diagnostic("GKX-EVIDENCE-002", "error", `${kind}[${index}] strength must be within 0..1.`, sourcePath, `evidence.${kind}[${index}].strength`));
    if (relevance == null || relevance < 0 || relevance > 1) diagnostics.push(diagnostic("GKX-EVIDENCE-003", "error", `${kind}[${index}] relevance must be within 0..1.`, sourcePath, `evidence.${kind}[${index}].relevance`));
  }

  const extensions = Object.fromEntries(Object.entries(data).filter(([key]) => !CORE_FIELDS.has(key) && !LEGACY_FIELDS.has(key)));
  const derivedLabels = origins.derived.labels.filter((x): x is string => typeof x === "string");
  derivedLabels.push(uid ? (isValidGkxAuthoredUid(uid) ? "identity:stable" : "identity:invalid") : "identity:missing");
  derivedLabels.push(refs.length ? (hash && SHA256.test(hash) ? "provenance:traceable" : "provenance:partial") : "provenance:missing");
  derivedLabels.push(`sensitivity:${effectiveSensitivity}`);
  if (effectiveEpistemicState) derivedLabels.push(`epistemic:${effectiveEpistemicState}`);
  origins.derived.labels = [...new Set(derivedLabels)].sort();
  origins.derived.sensitivity = effectiveSensitivity;
  origins.derived.effectiveSensitivityReason = rawSensitivity ? "authored-source-classification" : "policy-default";
  const effective: GkxOriginProjection = {
    tags: [...(authored.tags ?? [])],
    labels: [...new Set([...origins.authored.labels, ...origins.derived.labels, ...origins.approved.labels])],
    relationships: {}, epistemicState: effectiveEpistemicState, epistemicStateDefaulted, sensitivity: effectiveSensitivity,
  };
  for (const origin of [origins.authored, origins.derived, origins.approved]) for (const [kind, items] of Object.entries(origin.relationships)) {
    effective.relationships[kind] = [...(effective.relationships[kind] ?? []), ...items];
  }
  effective.evidence = { supports: [], contradicts: [] };
  for (const origin of [origins.authored, origins.derived, origins.approved]) for (const kind of ["supports", "contradicts"] as const) {
    (effective.evidence as Record<string, unknown[]>)[kind].push(...list(record(origin.evidence)[kind]));
  }
  const projection: GkxProjection = {
    // Compatibility field: this names an implementation capability only. It
    // is not a GKOS GCP profile claim or independent conformance evidence.
    profile: GKX23_PROFILE, conformanceClaim: "reader-and-deterministic-assessor", mode,
    sourceVersion: version, sourcePath, contentHash, rawFrontmatter: data, extensions,
    authored, derived: origins.derived, proposed: origins.proposed, approved: origins.approved, effective,
    diagnostics, assessment: undefined as never,
  };
  projection.assessment = assessGkx23(projection);
  bindGkxProjectionValidationReceipt(projection, {
    applicable: true,
    present: parsed.present,
    field_lines: parsed.field_lines,
    negative_zero_fields: negativeZeroFieldPointers(parsed.data),
    issues: parsed.issues.map(({ code, line }) => ({ code, line })),
    invalid_declarations: authoredDeclarationIssueReceipts(parsed.data, parsed.field_lines),
  });
  return projection;
}

/** Recalculate derived assessment after corpus-level diagnostics/resolution. */
export function refreshGkx23Assessment(projection: GkxProjection): void {
  projection.diagnostics.sort((a, b) => codeUnitCompare(a.code, b.code) || codeUnitCompare(a.field ?? "", b.field ?? "") || codeUnitCompare(a.message, b.message));
  projection.assessment = assessGkx23(projection);
  projection.derived.labels = [...new Set([
    ...projection.derived.labels.filter((x): x is string => typeof x === "string" && !x.startsWith("assessment:")),
    ...projection.assessment.labels.derived,
  ])].sort();
  projection.effective.labels = [...new Set([
    ...projection.authored.labels, ...projection.derived.labels, ...projection.approved.labels,
  ])];
  projection.effective.tags = [...(projection.authored.tags ?? [])];
  projection.effective.relationships = {};
  for (const origin of [projection.authored, projection.derived, projection.approved]) {
    for (const [kind, items] of Object.entries(origin.relationships)) {
      projection.effective.relationships[kind] = [...(projection.effective.relationships[kind] ?? []), ...items];
    }
  }
  projection.effective.evidence = { supports: [], contradicts: [] };
  for (const origin of [projection.authored, projection.derived, projection.approved]) for (const kind of ["supports", "contradicts"] as const) {
    (projection.effective.evidence as Record<string, unknown[]>)[kind].push(...list(record(origin.evidence)[kind]));
  }
}

export function gkx23RelationTargets(projection: GkxProjection): Array<{ type: string; target: string; origin: GkxOrigin; raw: unknown }> {
  const out: Array<{ type: string; target: string; origin: GkxOrigin; raw: unknown }> = [];
  for (const origin of ["authored", "derived", "proposed", "approved"] as GkxOrigin[]) {
    for (const [type, items] of Object.entries(projection[origin].relationships)) for (const item of items) {
      const target = relationTarget(item); if (target) out.push({ type, target, origin, raw: item });
    }
  }
  return out;
}

export function gkx23Inverse(type: string): string | undefined { return INVERSES[type]; }
