import { normalizeRetrievalAsOf } from "./provenance";
import { retrievalCanonicalDigest, stableJson } from "./digest";
import {
  RETRIEVAL_EVALUATION_GOLDEN_VERSION,
  sealNormalizedRetrievalEvaluationGolden,
  type NormalizedRetrievalEvaluationGolden,
  type NormalizedRetrievalEvaluationQuery,
} from "./evaluation";

const MAX_GOLDEN_BYTES = 1_048_576;
const QUERY_KEYS = new Set([
  "id", "text", "vault_fixture", "expected_files", "expected_source_ids", "expected_lineage_ids",
  "forbidden_source_ids", "forbidden_lineage_ids", "expected_top_k", "expected_confidence", "as_of",
]);
const ARRAY_KEYS = new Set([
  "expected_files", "expected_source_ids", "expected_lineage_ids", "forbidden_source_ids", "forbidden_lineage_ids",
]);
const STRING_KEYS = new Set(["id", "text", "vault_fixture", "expected_confidence", "as_of"]);

function failure(code: string): Error {
  return new Error(`GKX_EVAL_GOLDEN_TOML_${code}`);
}

function trimAsciiWhitespace(value: string): string {
  return value.replace(/^[ \t]+|[ \t]+$/gu, "");
}

function stripComment(line: string): string {
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quote === null && (char === "'" || char === '"')) quote = char;
    else if (quote === "'" && char === "'") quote = null;
    else if (quote === '"' && char === '"') {
      let slashes = 0;
      for (let prior = index - 1; prior >= 0 && line[prior] === "\\"; prior--) slashes++;
      if (slashes % 2 === 0) quote = null;
    } else if (quote === null && char === "#") return line.slice(0, index);
  }
  if (quote !== null) throw failure("STRING_UNTERMINATED");
  return line;
}

function wellFormed(value: string): void {
  try { stableJson(value); }
  catch { throw failure("UNICODE_INVALID"); }
}

function parseBasicString(raw: string): string {
  if (raw.length < 2 || raw[0] !== '"' || raw.at(-1) !== '"') throw failure("BASIC_STRING_INVALID");
  let output = "";
  for (let index = 1; index < raw.length - 1; index++) {
    const char = raw[index];
    if (char === '"') throw failure("BASIC_STRING_INVALID");
    if (char !== "\\") {
      if (/[\u0000-\u001f\u007f]/u.test(char)) throw failure("STRING_CONTROL_INVALID");
      output += char;
      continue;
    }
    const escape = raw[++index];
    if (escape === undefined || index >= raw.length - 1) throw failure("BASIC_STRING_ESCAPE_INVALID");
    const simple: Record<string, string> = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };
    if (Object.hasOwn(simple, escape)) { output += simple[escape]; continue; }
    if (escape !== "u" && escape !== "U") throw failure("BASIC_STRING_ESCAPE_INVALID");
    const width = escape === "u" ? 4 : 8;
    const digits = raw.slice(index + 1, index + 1 + width);
    if (digits.length !== width || !/^[0-9A-Fa-f]+$/u.test(digits)) throw failure("UNICODE_ESCAPE_INVALID");
    const codePoint = Number.parseInt(digits, 16);
    if (codePoint > 0x10ffff || codePoint >= 0xd800 && codePoint <= 0xdfff) throw failure("UNICODE_ESCAPE_INVALID");
    output += String.fromCodePoint(codePoint);
    index += width;
  }
  wellFormed(output);
  return output;
}

function parseLiteralString(raw: string): string {
  if (raw.length < 2 || raw[0] !== "'" || raw.at(-1) !== "'" || raw.slice(1, -1).includes("'")) throw failure("LITERAL_STRING_INVALID");
  const output = raw.slice(1, -1);
  if (/[\u0000-\u001f\u007f]/u.test(output)) throw failure("STRING_CONTROL_INVALID");
  wellFormed(output);
  return output;
}

function stringEnd(value: string, offset: number): number {
  const quote = value[offset];
  for (let index = offset + 1; index < value.length; index++) {
    if (quote === "'" && value[index] === "'") return index;
    if (quote === '"' && value[index] === '"') {
      let slashes = 0;
      for (let prior = index - 1; prior > offset && value[prior] === "\\"; prior--) slashes++;
      if (slashes % 2 === 0) return index;
    }
  }
  return -1;
}

function parseString(raw: string): string {
  const value = trimAsciiWhitespace(raw);
  if (value.startsWith('"')) return parseBasicString(value);
  if (value.startsWith("'")) return parseLiteralString(value);
  throw failure("STRING_INVALID");
}

function parseStringArray(raw: string): string[] {
  const value = trimAsciiWhitespace(raw);
  if (!value.startsWith("[") || !value.endsWith("]")) throw failure("ARRAY_INVALID");
  const inner = trimAsciiWhitespace(value.slice(1, -1));
  if (!inner) return [];
  const output: string[] = [];
  let offset = 0;
  while (offset < inner.length) {
    while (inner[offset] === " " || inner[offset] === "\t") offset++;
    const quote = inner[offset];
    if (quote !== '"' && quote !== "'") throw failure("ARRAY_INVALID");
    const end = stringEnd(inner, offset);
    if (end < 0) throw failure("ARRAY_INVALID");
    output.push(parseString(inner.slice(offset, end + 1)));
    if (output.length > 256) throw failure("ARRAY_ITEM_COUNT_INVALID");
    offset = end + 1;
    while (inner[offset] === " " || inner[offset] === "\t") offset++;
    if (offset === inner.length) break;
    if (inner[offset] !== ",") throw failure("ARRAY_INVALID");
    offset++;
    while (inner[offset] === " " || inner[offset] === "\t") offset++;
    if (offset === inner.length) throw failure("ARRAY_TRAILING_COMMA_INVALID");
  }
  if (new Set(output).size !== output.length) throw failure("ARRAY_DUPLICATE_ITEM");
  return output;
}

function parsePositiveInteger(raw: string): number {
  const value = trimAsciiWhitespace(raw);
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) throw failure("INTEGER_INVALID");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw failure("INTEGER_INVALID");
  return parsed;
}

type RawQuery = Record<string, string | number | string[]>;

function normalizedQuery(raw: RawQuery): NormalizedRetrievalEvaluationQuery {
  const required = [...QUERY_KEYS].filter((key) => key !== "as_of");
  if (required.some((key) => !Object.hasOwn(raw, key))) throw failure("QUERY_REQUIRED_KEY_MISSING");
  const arrays = (key: string) => [...raw[key] as string[]].sort();
  let asOf: string | null = null;
  if (raw.as_of !== undefined) {
    try { asOf = normalizeRetrievalAsOf(raw.as_of as string); }
    catch { throw failure("AS_OF_INVALID"); }
  }
  const material: Omit<NormalizedRetrievalEvaluationQuery, "query_digest"> = {
    id: raw.id as string,
    text: raw.text as string,
    vault_fixture: raw.vault_fixture as string,
    expected_files: arrays("expected_files"),
    expected_source_ids: arrays("expected_source_ids"),
    expected_lineage_ids: arrays("expected_lineage_ids") as [],
    forbidden_source_ids: arrays("forbidden_source_ids"),
    forbidden_lineage_ids: arrays("forbidden_lineage_ids") as [],
    expected_top_k: raw.expected_top_k as number,
    expected_confidence: raw.expected_confidence as NormalizedRetrievalEvaluationQuery["expected_confidence"],
    as_of: asOf,
  };
  return { ...material, query_digest: retrievalCanonicalDigest(material) };
}

/**
 * Strict, dependency-light parser for the human Phase-4 golden subset.
 * Filesystem sealing is a separate trusted-host concern; this function accepts
 * only already-decoded text and returns a canonical inert envelope.
 */
export function parseRetrievalEvaluationGoldenToml(text: string): NormalizedRetrievalEvaluationGolden {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_GOLDEN_BYTES) throw failure("SIZE_INVALID");
  if (text.startsWith("\uFEFF")) throw failure("BOM_INVALID");
  if (/\r(?!\n)/u.test(text)) throw failure("NEWLINE_INVALID");
  wellFormed(text);
  const lines = text.replace(/\r\n/gu, "\n").split("\n");
  let contractVersion: string | null = null;
  let current: RawQuery | null = null;
  const queries: RawQuery[] = [];
  for (const [lineIndex, source] of lines.entries()) {
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(source)) throw failure(`LINE_${lineIndex + 1}_INVALID`);
    let line: string;
    try { line = trimAsciiWhitespace(stripComment(source)); }
    catch { throw failure(`LINE_${lineIndex + 1}_INVALID`); }
    if (!line) continue;
    if (line === "[[query]]") {
      current = {};
      queries.push(current);
      continue;
    }
    if (/^\[.*\]$/u.test(line)) throw failure("TABLE_INVALID");
    const assignment = /^([a-z][a-z0-9_]*)[ \t]*=[ \t]*([\s\S]+)$/u.exec(line);
    if (!assignment) throw failure(`SYNTAX_LINE_${lineIndex + 1}`);
    const [, key, rawValue] = assignment;
    if (!current) {
      if (key !== "contract_version" || contractVersion !== null || queries.length !== 0) throw failure("TOP_LEVEL_KEY_INVALID");
      contractVersion = parseString(rawValue);
      continue;
    }
    if (!QUERY_KEYS.has(key)) throw failure("QUERY_KEY_UNKNOWN");
    if (Object.hasOwn(current, key)) throw failure("QUERY_KEY_DUPLICATE");
    if (ARRAY_KEYS.has(key)) current[key] = parseStringArray(rawValue);
    else if (STRING_KEYS.has(key)) current[key] = parseString(rawValue);
    else if (key === "expected_top_k") current[key] = parsePositiveInteger(rawValue);
    else throw failure("QUERY_KEY_UNKNOWN");
  }
  if (contractVersion !== RETRIEVAL_EVALUATION_GOLDEN_VERSION || queries.length < 1 || queries.length > 256) throw failure("DOCUMENT_COORDINATE_INVALID");
  const normalized = queries.map(normalizedQuery).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const material = { contract_version: RETRIEVAL_EVALUATION_GOLDEN_VERSION, queries: normalized };
  return sealNormalizedRetrievalEvaluationGolden({ ...material, golden_digest: retrievalCanonicalDigest(material) });
}
