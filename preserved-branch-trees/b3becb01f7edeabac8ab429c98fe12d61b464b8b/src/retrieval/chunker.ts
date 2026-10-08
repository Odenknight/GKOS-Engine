import { isValidGkxAuthoredUid } from "../gkx23";
import { normalizeVaultRelative } from "../paths";
import { types as utilTypes } from "node:util";
import { RETRIEVAL_CHUNKER_VERSION, RETRIEVAL_CONTRACT_VERSION, RETRIEVAL_MAX_CHUNK_BYTES, RETRIEVAL_TOKENIZER_VERSION } from "./contracts";
import { retrievalCanonicalDigest, retrievalSha256 } from "./digest";
import type { ChunkMarkdownInput, ChunkingOptions, RetrievalChunk, RetrievalChunkMetadata } from "./types";

const ASCII_SPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20]);
const DEFAULT_MAX_TOKENS = 400;
const DEFAULT_OVERLAP_TOKENS = 0;

interface ByteToken { start: number; end: number }
interface LineRecord { start: number; end: number; contentEnd: number; text: string }
interface HeadingEvent { start: number; depth: number; title: string }
interface Section { start: number; end: number; headingPath: string[]; depth: number; position: string; parentPosition?: string }

/**
 * Draft tokenizer: a token is a maximal UTF-8 byte sequence separated only by
 * ASCII HT/LF/VT/FF/CR/space. The byte definition is language-independent.
 */
export function asciiWhitespaceTokens(bytes: Uint8Array): ByteToken[] {
  const out: ByteToken[] = [];
  let start = -1;
  for (let index = 0; index <= bytes.length; index++) {
    const separated = index === bytes.length || ASCII_SPACE.has(bytes[index]);
    if (!separated && start < 0) start = index;
    if (separated && start >= 0) {
      out.push({ start, end: index });
      start = -1;
    }
  }
  return out;
}

function linesOf(text: string): LineRecord[] {
  const lines: LineRecord[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text.charCodeAt(index);
    if (char !== 0x0a && char !== 0x0d) continue;
    const width = char === 0x0d && text.charCodeAt(index + 1) === 0x0a ? 2 : 1;
    lines.push({ start, end: index + width, contentEnd: index, text: text.slice(start, index) });
    index += width - 1;
    start = index + 1;
  }
  if (start < text.length || lines.length === 0) lines.push({ start, end: text.length, contentEnd: text.length, text: text.slice(start) });
  return lines;
}

function frontmatterEnd(lines: readonly LineRecord[]): number {
  if (lines[0]?.text.replace(/^\uFEFF/, "").trim() !== "---") return 0;
  for (let index = 1; index < lines.length; index++) {
    if (lines[index].text.trim() === "---" || lines[index].text.trim() === "...") return lines[index].end;
  }
  return 0;
}

function headingEvents(lines: readonly LineRecord[], bodyStart: number): HeadingEvent[] {
  const events: HeadingEvent[] = [];
  let fence: "`" | "~" | null = null;
  let previousEligible: LineRecord | null = null;
  for (const line of lines) {
    if (line.start < bodyStart) continue;
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line.text);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as "`" | "~";
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      previousEligible = null;
      continue;
    }
    if (fence !== null) continue;
    const atx = /^\s{0,3}(#{1,6})(?:[\t ]+|$)(.*?)(?:[\t ]+#+[\t ]*)?$/.exec(line.text);
    if (atx) {
      events.push({ start: line.start, depth: atx[1].length, title: atx[2].trim() });
      previousEligible = null;
      continue;
    }
    const setext = /^\s{0,3}(=+|-+)[\t ]*$/.exec(line.text);
    if (setext && previousEligible && previousEligible.text.trim()) {
      events.push({ start: previousEligible.start, depth: setext[1][0] === "=" ? 1 : 2, title: previousEligible.text.trim() });
      previousEligible = null;
      continue;
    }
    previousEligible = line.text.trim() ? line : null;
  }
  return events.sort((a, b) => a.start - b.start);
}

function sectionsOf(text: string): Section[] {
  const lines = linesOf(text);
  const bodyStart = frontmatterEnd(lines);
  const events = headingEvents(lines, bodyStart);
  const sections: Section[] = [];
  if (!events.length) {
    if (text.slice(bodyStart).trim()) sections.push({ start: bodyStart, end: text.length, headingPath: [], depth: 0, position: "root" });
    return sections;
  }
  if (text.slice(bodyStart, events[0].start).trim()) {
    sections.push({ start: bodyStart, end: events[0].start, headingPath: [], depth: 0, position: "root" });
  }
  const stack: Array<{ depth: number; title: string; position: string }> = [];
  const childCounts = new Map<string, number>();
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    while (stack.length && stack[stack.length - 1].depth >= event.depth) stack.pop();
    const parent = stack[stack.length - 1];
    const parentPosition = parent?.position;
    const key = `${parentPosition ?? "root"}/${event.depth}`;
    const ordinal = (childCounts.get(key) ?? 0) + 1;
    childCounts.set(key, ordinal);
    const position = parentPosition ? `${parentPosition}.${event.depth}-${ordinal}` : `${event.depth}-${ordinal}`;
    const headingPath = [...stack.map((entry) => entry.title), event.title];
    sections.push({
      start: event.start,
      end: events[index + 1]?.start ?? text.length,
      headingPath,
      depth: event.depth,
      position,
      parentPosition,
    });
    stack.push({ depth: event.depth, title: event.title, position });
  }
  return sections;
}

function codeUnitToByte(text: string, offset: number): number {
  return Buffer.byteLength(text.slice(0, offset), "utf8");
}

function byteLineStarts(bytes: Uint8Array): number[] {
  const starts = [0];
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] === 0x0a) starts.push(index + 1);
    else if (bytes[index] === 0x0d) {
      if (bytes[index + 1] === 0x0a) index++;
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineAt(starts: readonly number[], byte: number): number {
  let low = 0, high = starts.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (starts[mid] <= byte) low = mid + 1;
    else high = mid;
  }
  return Math.max(1, low);
}

/** Recompute exact one-based citation lines from the indexed source bytes. */
export function retrievalLineCoordinates(bytes: Uint8Array, startByte: number, endByte: number): { start_line: number; end_line: number } {
  if (!Number.isSafeInteger(startByte) || !Number.isSafeInteger(endByte) || startByte < 0 || endByte <= startByte || endByte > bytes.length) {
    throw new RangeError("RETRIEVAL_LINE_COORDINATES_INVALID");
  }
  const starts = byteLineStarts(bytes);
  return { start_line: lineAt(starts, startByte), end_line: lineAt(starts, endByte - 1) };
}

function paragraphBoundaries(bytes: Uint8Array): number[] {
  const result: number[] = [];
  for (let index = 0; index < bytes.length - 1; index++) {
    if (bytes[index] === 0x0a && bytes[index + 1] === 0x0a) result.push(index + 1);
    else if (index < bytes.length - 3 && bytes[index] === 0x0d && bytes[index + 1] === 0x0a && bytes[index + 2] === 0x0d && bytes[index + 3] === 0x0a) result.push(index + 2);
  }
  return result;
}

function splitSection(bytes: Uint8Array, maxTokens: number, overlapTokens: number): Array<{ start: number; end: number; tokens: number }> {
  const tokens = asciiWhitespaceTokens(bytes);
  if (tokens.length <= maxTokens && bytes.length <= RETRIEVAL_MAX_CHUNK_BYTES) return bytes.length ? [{ start: 0, end: bytes.length, tokens: tokens.length }] : [];
  const paragraphs = paragraphBoundaries(bytes);
  const pieces: Array<{ start: number; end: number; tokens: number }> = [];
  let tokenStart = 0;
  while (tokenStart < tokens.length) {
    const hardEndToken = Math.min(tokens.length, tokenStart + maxTokens);
    let endByte = hardEndToken === tokens.length ? bytes.length : tokens[hardEndToken - 1].end;
    if (hardEndToken < tokens.length) {
      const minimum = tokens[tokenStart + Math.floor(maxTokens / 2)]?.end ?? tokens[tokenStart].end;
      const boundary = paragraphs.filter((candidate) => candidate >= minimum && candidate <= endByte).at(-1);
      if (boundary !== undefined) endByte = boundary;
    }
    let included = tokenStart;
    while (included < tokens.length && tokens[included].start < endByte) included++;
    if (included === tokenStart) included++;
    const startByte = tokenStart === 0 ? 0 : tokens[tokenStart].start;
    let boundedStart = startByte;
    while (endByte - boundedStart > RETRIEVAL_MAX_CHUNK_BYTES) {
      let boundedEnd = boundedStart + RETRIEVAL_MAX_CHUNK_BYTES;
      while (boundedEnd > boundedStart && (bytes[boundedEnd] & 0xc0) === 0x80) boundedEnd--;
      if (boundedEnd === boundedStart) throw new Error("UTF8_CHUNK_BOUNDARY_UNAVAILABLE");
      pieces.push({ start: boundedStart, end: boundedEnd, tokens: asciiWhitespaceTokens(bytes.subarray(boundedStart, boundedEnd)).length });
      boundedStart = boundedEnd;
    }
    pieces.push({ start: boundedStart, end: endByte, tokens: asciiWhitespaceTokens(bytes.subarray(boundedStart, endByte)).length });
    if (included >= tokens.length) break;
    tokenStart = Math.max(tokenStart + 1, included - overlapTokens);
  }
  return pieces;
}

function chunkIdentity(sourceId: string, position: string, part: number, contentDigest: string): string {
  return retrievalCanonicalDigest({
    contract: RETRIEVAL_CONTRACT_VERSION,
    chunker: RETRIEVAL_CHUNKER_VERSION,
    source_id: sourceId,
    structural_position: position,
    part_ordinal: part,
    content_digest: contentDigest,
  });
}

/** Portable, already-normalized POSIX vault-relative source path grammar. */
export function isValidRetrievalSourcePath(value: string): boolean {
  if (!value || value.includes("\0") || value.includes("\\") || value.startsWith("/") || value.endsWith("/") || value.includes("//")) return false;
  const segments = value.split("/");
  return segments.every((segment) =>
    segment !== "." && segment !== ".." &&
    !/[\u0000-\u001f<>:"|?*]/u.test(segment) &&
    !/[. ]$/u.test(segment));
}

const RETRIEVAL_CHUNK_REQUIRED_FIELDS = [
  "chunk_id", "source_id", "source_path", "source_digest", "heading_path", "heading_depth",
  "ordinal_within_source", "structural_position", "part_ordinal", "start_byte", "end_byte",
  "start_line", "end_line", "content_digest", "text", "token_count", "lineage_id",
  "valid_from", "valid_to", "supersedes", "superseded_by", "metadata",
] as const;
const RETRIEVAL_CHUNK_ALLOWED_FIELDS = new Set<string>([...RETRIEVAL_CHUNK_REQUIRED_FIELDS, "parent_chunk_id"]);
const CHUNK_MARKDOWN_REQUIRED_FIELDS = ["source_id", "source_path", "text"] as const;
const CHUNK_MARKDOWN_ALLOWED_FIELDS = new Set<string>([
  ...CHUNK_MARKDOWN_REQUIRED_FIELDS,
  "lineage_id", "valid_from", "valid_to", "supersedes", "superseded_by", "metadata",
]);
const METADATA_STRING_FIELDS = [
  "title", "topic", "category", "authored_at", "gkx_type", "epistemic_state",
  "governance_state", "review_state", "author_agent_id",
] as const;
const METADATA_STRING_ARRAY_FIELDS = ["tags", "moc_relationships"] as const;
const METADATA_BOOLEAN_FIELDS = ["authoritative", "archived"] as const;
const RETRIEVAL_SENSITIVITIES = new Set(["public", "internal", "restricted", "confidential", "regulated", "phi", "secret"]);

function assertPlainJsonValue(value: unknown, label: string, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw new Error(`${label}_JSON_NUMBER_INVALID`);
    return;
  }
  if (typeof value !== "object") throw new Error(`${label}_JSON_VALUE_INVALID`);
  if (utilTypes.isProxy(value)) throw new Error(`${label}_JSON_PROXY_INVALID`);
  if (ancestors.has(value)) throw new Error(`${label}_JSON_CYCLE_INVALID`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key))) ||
          Object.keys(value).length !== value.length) throw new Error(`${label}_JSON_ARRAY_INVALID`);
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${label}_JSON_ARRAY_INVALID`);
        assertPlainJsonValue(descriptor.value, label, ancestors);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label}_JSON_OBJECT_INVALID`);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new Error(`${label}_JSON_OBJECT_INVALID`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${label}_JSON_OBJECT_INVALID`);
      assertPlainJsonValue(descriptor.value, label, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) throw new Error(`${label}_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key))) ||
      Object.keys(value).length !== value.length) throw new Error(`${label}_INVALID`);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor) || typeof descriptor.value !== "string") throw new Error(`${label}_INVALID`);
  }
}

export function validateRetrievalChunkMetadata(value: unknown): asserts value is RetrievalChunkMetadata {
  assertPlainJsonValue(value, "RETRIEVAL_CHUNK_METADATA");
  if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error("RETRIEVAL_CHUNK_METADATA_INVALID");
  const metadata = value as Record<string, unknown>;
  for (const field of METADATA_STRING_FIELDS) {
    if (metadata[field] !== undefined && typeof metadata[field] !== "string") throw new Error(`RETRIEVAL_CHUNK_METADATA_${field.toUpperCase()}_INVALID`);
  }
  for (const field of METADATA_STRING_ARRAY_FIELDS) {
    if (metadata[field] !== undefined) assertStringArray(metadata[field], `RETRIEVAL_CHUNK_METADATA_${field.toUpperCase()}`);
  }
  for (const field of METADATA_BOOLEAN_FIELDS) {
    if (metadata[field] !== undefined && typeof metadata[field] !== "boolean") throw new Error(`RETRIEVAL_CHUNK_METADATA_${field.toUpperCase()}_INVALID`);
  }
  if (metadata.sensitivity !== undefined && (typeof metadata.sensitivity !== "string" || !RETRIEVAL_SENSITIVITIES.has(metadata.sensitivity))) {
    throw new Error("RETRIEVAL_CHUNK_METADATA_SENSITIVITY_INVALID");
  }
  if (metadata.quality !== undefined && (typeof metadata.quality !== "number" || !Number.isFinite(metadata.quality) || metadata.quality < 0 || metadata.quality > 1)) {
    throw new Error("RETRIEVAL_CHUNK_METADATA_QUALITY_INVALID");
  }
}

function validateChunkMarkdownInput(input: unknown): asserts input is ChunkMarkdownInput {
  // Inspect descriptors before reading any caller-controlled property. This
  // prevents accessors, symbols, exotic prototypes, sparse arrays, or other
  // coercive JS shapes from becoming retrieval lineage or metadata.
  assertPlainJsonValue(input, "RETRIEVAL_SOURCE_ENVELOPE");
  if (input === null || Array.isArray(input) || typeof input !== "object") throw new Error("RETRIEVAL_SOURCE_ENVELOPE_INVALID");
  const record = input as Record<string, unknown>;
  if (CHUNK_MARKDOWN_REQUIRED_FIELDS.some((field) => !Object.hasOwn(record, field)) ||
      Object.keys(record).some((field) => !CHUNK_MARKDOWN_ALLOWED_FIELDS.has(field))) {
    throw new Error("RETRIEVAL_SOURCE_ENVELOPE_FIELDS_INVALID");
  }
  if (typeof record.source_id !== "string" || typeof record.source_path !== "string" || typeof record.text !== "string") {
    throw new Error("RETRIEVAL_SOURCE_ENVELOPE_STRING_FIELD_INVALID");
  }
  for (const field of ["lineage_id", "valid_from", "valid_to"] as const) {
    if (record[field] !== undefined && record[field] !== null && typeof record[field] !== "string") {
      throw new Error(`RETRIEVAL_SOURCE_ENVELOPE_${field.toUpperCase()}_INVALID`);
    }
  }
  for (const field of ["supersedes", "superseded_by"] as const) {
    if (record[field] !== undefined) assertStringArray(record[field], `RETRIEVAL_SOURCE_ENVELOPE_${field.toUpperCase()}`);
  }
  if (record.metadata !== undefined) validateRetrievalChunkMetadata(record.metadata);
  // Also seal every source/top-level string to the canonical JSON data model,
  // including well-formed UTF-16 and safe numeric extension values.
  try { retrievalCanonicalDigest(record); }
  catch { throw new Error("RETRIEVAL_SOURCE_ENVELOPE_CANONICAL_JSON_INVALID"); }
}

export function validateRetrievalChunk(chunk: unknown): asserts chunk is RetrievalChunk {
  if (chunk === null || Array.isArray(chunk) || typeof chunk !== "object" || utilTypes.isProxy(chunk) ||
      (Object.getPrototypeOf(chunk) !== Object.prototype && Object.getPrototypeOf(chunk) !== null)) {
    throw new Error("RETRIEVAL_CHUNK_OBJECT_INVALID");
  }
  const record = chunk as Record<string, unknown>;
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.some((key) => typeof key !== "string") || ownKeys.some((key) => {
    if (typeof key !== "string") return true;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return !descriptor?.enumerable || !("value" in descriptor);
  })) throw new Error("RETRIEVAL_CHUNK_FIELDS_INVALID");
  if (RETRIEVAL_CHUNK_REQUIRED_FIELDS.some((field) => !Object.hasOwn(record, field)) ||
      Object.keys(record).some((field) => !RETRIEVAL_CHUNK_ALLOWED_FIELDS.has(field))) {
    throw new Error("RETRIEVAL_CHUNK_FIELDS_INVALID");
  }
  if (typeof record.chunk_id !== "string" || typeof record.source_id !== "string" ||
      typeof record.source_path !== "string" || typeof record.source_digest !== "string" ||
      typeof record.content_digest !== "string" || typeof record.structural_position !== "string" ||
      record.structural_position.length === 0 || typeof record.text !== "string") {
    throw new Error("RETRIEVAL_CHUNK_STRING_FIELD_INVALID");
  }
  assertStringArray(record.heading_path, "RETRIEVAL_CHUNK_HEADING_PATH");
  assertStringArray(record.supersedes, "RETRIEVAL_CHUNK_SUPERSEDES");
  assertStringArray(record.superseded_by, "RETRIEVAL_CHUNK_SUPERSEDED_BY");
  if (record.parent_chunk_id !== undefined && (typeof record.parent_chunk_id !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(record.parent_chunk_id))) {
    throw new Error("RETRIEVAL_CHUNK_PARENT_ID_INVALID");
  }
  for (const field of ["lineage_id", "valid_from", "valid_to"] as const) {
    if (record[field] !== null && typeof record[field] !== "string") throw new Error(`RETRIEVAL_CHUNK_${field.toUpperCase()}_INVALID`);
  }
  validateRetrievalChunkMetadata(record.metadata);
  const validated = record as unknown as RetrievalChunk;
  if (!isValidGkxAuthoredUid(validated.source_id)) throw new Error("RETRIEVAL_CHUNK_SOURCE_ID_INVALID");
  if (!isValidRetrievalSourcePath(validated.source_path)) throw new Error("RETRIEVAL_CHUNK_SOURCE_PATH_INVALID");
  if (!/^sha256:[0-9a-f]{64}$/u.test(validated.source_digest) || !/^sha256:[0-9a-f]{64}$/u.test(validated.content_digest)) throw new Error("RETRIEVAL_CHUNK_DIGEST_INVALID");
  if (!Number.isSafeInteger(validated.ordinal_within_source) || validated.ordinal_within_source < 1 ||
      !Number.isSafeInteger(validated.part_ordinal) || validated.part_ordinal < 1 ||
      !Number.isSafeInteger(validated.heading_depth) || validated.heading_depth < 0 || validated.heading_depth > 6 ||
      !Number.isSafeInteger(validated.start_byte) || !Number.isSafeInteger(validated.end_byte) || validated.start_byte < 0 || validated.end_byte <= validated.start_byte ||
      !Number.isSafeInteger(validated.start_line) || !Number.isSafeInteger(validated.end_line) || validated.start_line < 1 || validated.end_line < validated.start_line ||
      !Number.isSafeInteger(validated.token_count) || validated.token_count < 0) throw new Error("RETRIEVAL_CHUNK_COORDINATES_INVALID");
  const textBytes = Buffer.from(validated.text, "utf8");
  if (validated.end_byte - validated.start_byte !== textBytes.length || retrievalSha256(textBytes) !== validated.content_digest) throw new Error("RETRIEVAL_CHUNK_CONTENT_BINDING_INVALID");
  if (textBytes.length > RETRIEVAL_MAX_CHUNK_BYTES) throw new Error("RETRIEVAL_CHUNK_BYTE_LIMIT_EXCEEDED");
  if (asciiWhitespaceTokens(textBytes).length !== validated.token_count) throw new Error("RETRIEVAL_CHUNK_TOKEN_COUNT_INVALID");
  if (validated.chunk_id !== chunkIdentity(validated.source_id, validated.structural_position, validated.part_ordinal, validated.content_digest)) throw new Error("RETRIEVAL_CHUNK_ID_INVALID");
  // Seal every nested/top-level string and JSON value, not only metadata, to
  // the same interoperable canonical data model used by projection digests.
  try { retrievalCanonicalDigest(validated); }
  catch { throw new Error("RETRIEVAL_CHUNK_CANONICAL_JSON_INVALID"); }
}

/** Chunk exact source bytes without assigning identity or lineage. */
export function chunkMarkdown(input: ChunkMarkdownInput, options: ChunkingOptions = {}): RetrievalChunk[] {
  validateChunkMarkdownInput(input);
  if (!isValidGkxAuthoredUid(input.source_id)) throw new TypeError("source_id must be a valid canonical GKX authored uid.");
  if (!isValidRetrievalSourcePath(input.source_path)) throw new TypeError("source_path must use the portable normalized vault-relative grammar.");
  const sourcePath = normalizeVaultRelative(input.source_path);
  if (sourcePath !== input.source_path) throw new TypeError("source_path must already be normalized.");
  const maxTokens = options.max_tokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = options.overlap_tokens ?? DEFAULT_OVERLAP_TOKENS;
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 16 || maxTokens > 4096) throw new RangeError("max_tokens must be an integer from 16 through 4096.");
  if (!Number.isSafeInteger(overlapTokens) || overlapTokens < 0 || overlapTokens >= maxTokens) throw new RangeError("overlap_tokens must be an integer from 0 through max_tokens - 1.");

  const sourceBytes = Buffer.from(input.text, "utf8");
  const sourceDigest = retrievalSha256(sourceBytes);
  const lineStarts = byteLineStarts(sourceBytes);
  const pending: Array<{ chunk: RetrievalChunk; parentPosition?: string }> = [];
  let ordinal = 0;
  for (const section of sectionsOf(input.text)) {
    const sectionStartByte = codeUnitToByte(input.text, section.start);
    const sectionEndByte = codeUnitToByte(input.text, section.end);
    const sectionBytes = sourceBytes.subarray(sectionStartByte, sectionEndByte);
    const pieces = splitSection(sectionBytes, maxTokens, overlapTokens);
    for (let part = 0; part < pieces.length; part++) {
      const piece = pieces[part];
      const startByte = sectionStartByte + piece.start;
      const endByte = sectionStartByte + piece.end;
      const text = sourceBytes.subarray(startByte, endByte).toString("utf8");
      if (!text.trim()) continue;
      const contentDigest = retrievalSha256(Buffer.from(text, "utf8"));
      ordinal++;
      pending.push({
        parentPosition: section.parentPosition,
        chunk: {
          chunk_id: chunkIdentity(input.source_id, section.position, part + 1, contentDigest),
          source_id: input.source_id,
          source_path: sourcePath,
          source_digest: sourceDigest,
          heading_path: [...section.headingPath],
          heading_depth: section.depth,
          ordinal_within_source: ordinal,
          structural_position: section.position,
          part_ordinal: part + 1,
          start_byte: startByte,
          end_byte: endByte,
          start_line: lineAt(lineStarts, startByte),
          end_line: lineAt(lineStarts, Math.max(startByte, endByte - 1)),
          content_digest: contentDigest,
          text,
          token_count: piece.tokens,
          lineage_id: input.lineage_id ?? null,
          valid_from: input.valid_from ?? null,
          valid_to: input.valid_to ?? null,
          supersedes: [...(input.supersedes ?? [])],
          superseded_by: [...(input.superseded_by ?? [])],
          metadata: { ...(input.metadata ?? {}) },
        },
      });
    }
  }
  const firstByPosition = new Map<string, string>();
  for (const item of pending) if (!firstByPosition.has(item.chunk.structural_position)) firstByPosition.set(item.chunk.structural_position, item.chunk.chunk_id);
  for (const item of pending) {
    if (item.parentPosition) item.chunk.parent_chunk_id = firstByPosition.get(item.parentPosition);
  }
  const output = pending.map(({ chunk }) => chunk);
  for (const chunk of output) validateRetrievalChunk(chunk);
  return output;
}

export const RETRIEVAL_TOKENIZATION_RULE = Object.freeze({
  version: RETRIEVAL_TOKENIZER_VERSION,
  separators_hex: ["09", "0a", "0b", "0c", "0d", "20"],
});
