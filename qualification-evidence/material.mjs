// scripts/observation-2.2-material.mjs
import { createHash as createHash2 } from "node:crypto";

// src/version.ts
var ENGINE_VERSION = "2.2.0";
var GKX_PUBLIC_NAMESPACE = "2.0";
var VERSION_PROFILE_COMPATIBILITY = Object.freeze({
  enginePackageVersion: ENGINE_VERSION,
  publicExchangeNamespace: GKX_PUBLIC_NAMESPACE,
  validatingProjectionProfile: "gkx-2.3-validating-projection",
  validatingProjectionApi: "buildGkx23Projection",
  srtpDraftProjectionCoordinate: "gkx-2.0-validating-projection",
  legacyFlatRecordVersion: "2.2",
  experimentalScienceProfile: "SRTP-DRAFT-0.1"
});

// src/paths.ts
var toPosixPath = (s) => s.replace(/\\/g, "/").replace(/\/+/g, "/");
var normalizeVaultRelative = (s) => toPosixPath(s).replace(/^\/+/, "").replace(/^\.\//, "");

// src/gkx23-relationship-types.ts
var GKX23_RELATION_TYPES = [
  "supports",
  "contradicts",
  "depends_on",
  "derived_from",
  "derives_from",
  "cites",
  "quotes",
  "interprets",
  "tests",
  "replicates",
  "fails_to_replicate",
  "extends",
  "narrows",
  "generalizes",
  "implements",
  "governed_by",
  "reviewed_by",
  "approved_by",
  "supersedes",
  "superseded_by",
  "related_to",
  "part_of",
  "has_part",
  "refines",
  "blocks",
  "documents"
];
var GKX23_RELATION_TYPE_SET = new Set(GKX23_RELATION_TYPES);

// src/gkx23.ts
var GKX23_POLICY = Object.freeze({
  id: "policy:gkx23-default-v1",
  version: "1.0.0",
  // SHA-256 of the canonical policy JSON shipped in docs/GKX-PLUS-2.3-PROFILE.md.
  hash: "sha256:2c2d8ec1e6481cbd4476bcc544c4fd19be03d8f21e317e44d889ea46e940ec8b",
  compatibleGkxVersions: ["2.3"],
  missingValueBehavior: "exclude-null-and-renormalize",
  weights: Object.freeze({
    structural_completeness: 0.15,
    provenance_quality: 0.2,
    evidence_support: 0.2,
    relationship_integrity: 0.15,
    temporal_freshness: 0.1,
    contradiction_status: 0.1,
    review_readiness: 0.1
  }),
  // HASH-LOCKED FIELD, NOT A RUNTIME KNOB. This mirrors `sensitivity_default`
  // in the canonical policy JSON whose SHA-256 is `hash` above; changing the
  // value here would desync the constant from the hash the engine publishes.
  // It is SUPERSEDED for the missing-sensitivity path: since v1.0.6 the engine
  // fails closed, and resolveDefaultSensitivity() returns
  // FAIL_CLOSED_SENSITIVITY_DEFAULT ("secret") — or a deployment's explicit
  // Gkx23ProjectionOptions.defaultSensitivity — never this value. Nothing in
  // the engine reads this field; it exists solely for policy-document fidelity.
  sensitivityDefault: "internal",
  assessmentThresholds: Object.freeze([
    [0.9, "assessment:strongly-documented"],
    [0.75, "assessment:well-documented"],
    [0.6, "assessment:partially-supported"],
    [0.4, "assessment:weakly-supported"],
    [0.01, "assessment:insufficient"],
    [0, "assessment:invalid-or-untraceable"]
  ])
});
var SENSITIVITY_LEVELS = [
  "public",
  "internal",
  "restricted",
  "confidential",
  "regulated",
  "phi",
  "secret"
];
var SENSITIVITY_RANK = Object.freeze(
  Object.fromEntries(SENSITIVITY_LEVELS.map((level, index) => [level, index]))
);
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var isValidGkxAuthoredUid = (value) => typeof value === "string" && UUID.test(value);

// src/retrieval/chunker.ts
import { types as utilTypes2 } from "node:util";

// src/retrieval/contracts.ts
var RETRIEVAL_CONTRACT_VERSION = "gkos-retrieval/1.0.0-draft.1";
var RETRIEVAL_RESULT_SCHEMA_ID = "gkos-retrieval-result/1.0.0-draft.1";
var RETRIEVAL_PROJECTION_SCHEMA_VERSION = 2;
var RETRIEVAL_LINEAGE_CONTRACT_VERSION = "gkos-retrieval/1.0.0-draft.2";
var RETRIEVAL_LINEAGE_RESULT_SCHEMA_ID = "gkos-retrieval-result/1.0.0-draft.2";
var RETRIEVAL_PROVENANCE_CONTRACT_VERSION = "gkos-retrieval-provenance/1.0.0-draft.1";
var RETRIEVAL_LINEAGE_PROJECTION_SCHEMA_VERSION = 3;
var RETRIEVAL_GKX_STANDARD_COMMIT = "a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6";
var RETRIEVAL_GKX_PROJECTION_PROFILE = "gkx-2.3-validating-projection";
var RETRIEVAL_CHUNKER_VERSION = "gkos-heading-chunker/1";
var RETRIEVAL_TOKENIZER_VERSION = "gkos-ascii-whitespace/1";
var RETRIEVAL_MAX_CHUNK_BYTES = 16384;
var RETRIEVAL_PARENT_EXPANSION_MAX_CHILD_TOKENS = 80;
var RETRIEVAL_CONTRACT_COORDINATES = Object.freeze({
  contract_version: RETRIEVAL_CONTRACT_VERSION,
  result_schema: RETRIEVAL_RESULT_SCHEMA_ID,
  projection_schema_version: RETRIEVAL_PROJECTION_SCHEMA_VERSION,
  chunker_version: RETRIEVAL_CHUNKER_VERSION,
  tokenizer_version: RETRIEVAL_TOKENIZER_VERSION,
  parent_expansion_max_child_tokens: RETRIEVAL_PARENT_EXPANSION_MAX_CHILD_TOKENS
});
var RETRIEVAL_LINEAGE_CONTRACT_COORDINATES = Object.freeze({
  contract_version: RETRIEVAL_LINEAGE_CONTRACT_VERSION,
  result_schema: RETRIEVAL_LINEAGE_RESULT_SCHEMA_ID,
  provenance_contract: RETRIEVAL_PROVENANCE_CONTRACT_VERSION,
  projection_schema_version: RETRIEVAL_LINEAGE_PROJECTION_SCHEMA_VERSION,
  gkx_standard_commit: RETRIEVAL_GKX_STANDARD_COMMIT,
  gkx_projection_profile: RETRIEVAL_GKX_PROJECTION_PROFILE,
  chunker_version: RETRIEVAL_CHUNKER_VERSION,
  tokenizer_version: RETRIEVAL_TOKENIZER_VERSION,
  parent_expansion_max_child_tokens: RETRIEVAL_PARENT_EXPANSION_MAX_CHILD_TOKENS
});

// src/retrieval/digest.ts
import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
function retrievalSha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function retrievalCodeUnitCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function assertWellFormedUtf16(value) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343)) throw new TypeError("Retrieval canonical JSON rejects unpaired UTF-16 surrogates.");
      index++;
    } else if (code >= 56320 && code <= 57343) {
      throw new TypeError("Retrieval canonical JSON rejects unpaired UTF-16 surrogates.");
    }
  }
}
function stableJsonValue(value, ancestors) {
  if (value !== null && typeof value === "object" && utilTypes.isProxy(value)) {
    throw new TypeError("Retrieval canonical JSON rejects proxies.");
  }
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    assertWellFormedUtf16(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Retrieval canonical JSON rejects non-finite numbers.");
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new TypeError("Retrieval canonical JSON rejects unsafe integer-valued numbers.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("Retrieval canonical JSON rejects cycles.");
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string" || key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key)) || Object.keys(value).length !== value.length) throw new TypeError("Retrieval canonical JSON rejects sparse or extended arrays.");
    ancestors.add(value);
    try {
      const items = [];
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError("Retrieval canonical JSON rejects accessor or non-enumerable array items.");
        items.push(stableJsonValue(descriptor.value, ancestors));
      }
      return `[${items.join(",")}]`;
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Retrieval canonical JSON rejects exotic objects.");
    if (ancestors.has(value)) throw new TypeError("Retrieval canonical JSON rejects cycles.");
    const record = value;
    const keys = Reflect.ownKeys(record);
    if (keys.some((key) => typeof key !== "string")) throw new TypeError("Retrieval canonical JSON rejects symbol keys.");
    const entries = keys.sort(retrievalCodeUnitCompare);
    ancestors.add(value);
    try {
      return `{${entries.map((key) => {
        assertWellFormedUtf16(key);
        const descriptor = Object.getOwnPropertyDescriptor(record, key);
        if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError("Retrieval canonical JSON rejects accessor or non-enumerable object properties.");
        return `${JSON.stringify(key)}:${stableJsonValue(descriptor.value, ancestors)}`;
      }).join(",")}}`;
    } finally {
      ancestors.delete(value);
    }
  }
  throw new TypeError(`Retrieval canonical JSON rejects ${typeof value}.`);
}
function stableJson(value) {
  return stableJsonValue(value, /* @__PURE__ */ new Set());
}
function retrievalCanonicalDigest(value) {
  return retrievalSha256(stableJson(value));
}

// src/retrieval/chunker.ts
var ASCII_SPACE = /* @__PURE__ */ new Set([9, 10, 11, 12, 13, 32]);
var DEFAULT_MAX_TOKENS = 400;
var DEFAULT_OVERLAP_TOKENS = 0;
function asciiWhitespaceTokens(bytes) {
  const out = [];
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
function linesOf(text) {
  const lines = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text.charCodeAt(index);
    if (char !== 10 && char !== 13) continue;
    const width = char === 13 && text.charCodeAt(index + 1) === 10 ? 2 : 1;
    lines.push({ start, end: index + width, contentEnd: index, text: text.slice(start, index) });
    index += width - 1;
    start = index + 1;
  }
  if (start < text.length || lines.length === 0) lines.push({ start, end: text.length, contentEnd: text.length, text: text.slice(start) });
  return lines;
}
function frontmatterEnd(lines) {
  if (lines[0]?.text.replace(/^\uFEFF/, "").trim() !== "---") return 0;
  for (let index = 1; index < lines.length; index++) {
    if (lines[index].text.trim() === "---" || lines[index].text.trim() === "...") return lines[index].end;
  }
  return 0;
}
function headingEvents(lines, bodyStart) {
  const events = [];
  let fence = null;
  let previousEligible = null;
  for (const line of lines) {
    if (line.start < bodyStart) continue;
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line.text);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
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
function sectionsOf(text) {
  const lines = linesOf(text);
  const bodyStart = frontmatterEnd(lines);
  const events = headingEvents(lines, bodyStart);
  const sections = [];
  if (!events.length) {
    if (text.slice(bodyStart).trim()) sections.push({ start: bodyStart, end: text.length, headingPath: [], depth: 0, position: "root" });
    return sections;
  }
  if (text.slice(bodyStart, events[0].start).trim()) {
    sections.push({ start: bodyStart, end: events[0].start, headingPath: [], depth: 0, position: "root" });
  }
  const stack = [];
  const childCounts = /* @__PURE__ */ new Map();
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
      parentPosition
    });
    stack.push({ depth: event.depth, title: event.title, position });
  }
  return sections;
}
function codeUnitToByte(text, offset) {
  return Buffer.byteLength(text.slice(0, offset), "utf8");
}
function byteLineStarts(bytes) {
  const starts = [0];
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] === 10) starts.push(index + 1);
    else if (bytes[index] === 13) {
      if (bytes[index + 1] === 10) index++;
      starts.push(index + 1);
    }
  }
  return starts;
}
function lineAt(starts, byte) {
  let low = 0, high = starts.length;
  while (low < high) {
    const mid = low + high >>> 1;
    if (starts[mid] <= byte) low = mid + 1;
    else high = mid;
  }
  return Math.max(1, low);
}
function paragraphBoundaries(bytes) {
  const result = [];
  for (let index = 0; index < bytes.length - 1; index++) {
    if (bytes[index] === 10 && bytes[index + 1] === 10) result.push(index + 1);
    else if (index < bytes.length - 3 && bytes[index] === 13 && bytes[index + 1] === 10 && bytes[index + 2] === 13 && bytes[index + 3] === 10) result.push(index + 2);
  }
  return result;
}
function splitSection(bytes, maxTokens, overlapTokens) {
  const tokens = asciiWhitespaceTokens(bytes);
  if (tokens.length <= maxTokens && bytes.length <= RETRIEVAL_MAX_CHUNK_BYTES) return bytes.length ? [{ start: 0, end: bytes.length, tokens: tokens.length }] : [];
  const paragraphs = paragraphBoundaries(bytes);
  const pieces = [];
  let tokenStart = 0;
  while (tokenStart < tokens.length) {
    const hardEndToken = Math.min(tokens.length, tokenStart + maxTokens);
    let endByte = hardEndToken === tokens.length ? bytes.length : tokens[hardEndToken - 1].end;
    if (hardEndToken < tokens.length) {
      const minimum = tokens[tokenStart + Math.floor(maxTokens / 2)]?.end ?? tokens[tokenStart].end;
      const boundary = paragraphs.filter((candidate) => candidate >= minimum && candidate <= endByte).at(-1);
      if (boundary !== void 0) endByte = boundary;
    }
    let included = tokenStart;
    while (included < tokens.length && tokens[included].start < endByte) included++;
    if (included === tokenStart) included++;
    const startByte = tokenStart === 0 ? 0 : tokens[tokenStart].start;
    let boundedStart = startByte;
    while (endByte - boundedStart > RETRIEVAL_MAX_CHUNK_BYTES) {
      let boundedEnd = boundedStart + RETRIEVAL_MAX_CHUNK_BYTES;
      while (boundedEnd > boundedStart && (bytes[boundedEnd] & 192) === 128) boundedEnd--;
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
function chunkIdentity(sourceId2, position, part, contentDigest) {
  return retrievalCanonicalDigest({
    contract: RETRIEVAL_CONTRACT_VERSION,
    chunker: RETRIEVAL_CHUNKER_VERSION,
    source_id: sourceId2,
    structural_position: position,
    part_ordinal: part,
    content_digest: contentDigest
  });
}
function isValidRetrievalSourcePath(value) {
  if (!value || value.includes("\0") || value.includes("\\") || value.startsWith("/") || value.endsWith("/") || value.includes("//")) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment !== "." && segment !== ".." && !/[\u0000-\u001f<>:"|?*]/u.test(segment) && !/[. ]$/u.test(segment));
}
var RETRIEVAL_CHUNK_REQUIRED_FIELDS = [
  "chunk_id",
  "source_id",
  "source_path",
  "source_digest",
  "heading_path",
  "heading_depth",
  "ordinal_within_source",
  "structural_position",
  "part_ordinal",
  "start_byte",
  "end_byte",
  "start_line",
  "end_line",
  "content_digest",
  "text",
  "token_count",
  "lineage_id",
  "valid_from",
  "valid_to",
  "supersedes",
  "superseded_by",
  "metadata"
];
var RETRIEVAL_CHUNK_ALLOWED_FIELDS = /* @__PURE__ */ new Set([...RETRIEVAL_CHUNK_REQUIRED_FIELDS, "parent_chunk_id"]);
var CHUNK_MARKDOWN_REQUIRED_FIELDS = ["source_id", "source_path", "text"];
var CHUNK_MARKDOWN_ALLOWED_FIELDS = /* @__PURE__ */ new Set([
  ...CHUNK_MARKDOWN_REQUIRED_FIELDS,
  "lineage_id",
  "valid_from",
  "valid_to",
  "supersedes",
  "superseded_by",
  "metadata"
]);
var METADATA_STRING_FIELDS = [
  "title",
  "topic",
  "category",
  "authored_at",
  "gkx_type",
  "epistemic_state",
  "governance_state",
  "review_state",
  "author_agent_id"
];
var METADATA_STRING_ARRAY_FIELDS = ["tags", "moc_relationships"];
var METADATA_BOOLEAN_FIELDS = ["authoritative", "archived"];
var RETRIEVAL_SENSITIVITIES = /* @__PURE__ */ new Set(["public", "internal", "restricted", "confidential", "regulated", "phi", "secret"]);
function assertPlainJsonValue(value, label, ancestors = /* @__PURE__ */ new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)) throw new Error(`${label}_JSON_NUMBER_INVALID`);
    return;
  }
  if (typeof value !== "object") throw new Error(`${label}_JSON_VALUE_INVALID`);
  if (utilTypes2.isProxy(value)) throw new Error(`${label}_JSON_PROXY_INVALID`);
  if (ancestors.has(value)) throw new Error(`${label}_JSON_CYCLE_INVALID`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key !== "string" || key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key)) || Object.keys(value).length !== value.length) throw new Error(`${label}_JSON_ARRAY_INVALID`);
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
function assertStringArray(value, label) {
  if (!Array.isArray(value) || utilTypes2.isProxy(value)) throw new Error(`${label}_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key)) || Object.keys(value).length !== value.length) throw new Error(`${label}_INVALID`);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor) || typeof descriptor.value !== "string") throw new Error(`${label}_INVALID`);
  }
}
function validateRetrievalChunkMetadata(value) {
  assertPlainJsonValue(value, "RETRIEVAL_CHUNK_METADATA");
  if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error("RETRIEVAL_CHUNK_METADATA_INVALID");
  const metadata = value;
  for (const field of METADATA_STRING_FIELDS) {
    if (metadata[field] !== void 0 && typeof metadata[field] !== "string") throw new Error(`RETRIEVAL_CHUNK_METADATA_${field.toUpperCase()}_INVALID`);
  }
  for (const field of METADATA_STRING_ARRAY_FIELDS) {
    if (metadata[field] !== void 0) assertStringArray(metadata[field], `RETRIEVAL_CHUNK_METADATA_${field.toUpperCase()}`);
  }
  for (const field of METADATA_BOOLEAN_FIELDS) {
    if (metadata[field] !== void 0 && typeof metadata[field] !== "boolean") throw new Error(`RETRIEVAL_CHUNK_METADATA_${field.toUpperCase()}_INVALID`);
  }
  if (metadata.sensitivity !== void 0 && (typeof metadata.sensitivity !== "string" || !RETRIEVAL_SENSITIVITIES.has(metadata.sensitivity))) {
    throw new Error("RETRIEVAL_CHUNK_METADATA_SENSITIVITY_INVALID");
  }
  if (metadata.quality !== void 0 && (typeof metadata.quality !== "number" || !Number.isFinite(metadata.quality) || metadata.quality < 0 || metadata.quality > 1)) {
    throw new Error("RETRIEVAL_CHUNK_METADATA_QUALITY_INVALID");
  }
}
function validateChunkMarkdownInput(input) {
  assertPlainJsonValue(input, "RETRIEVAL_SOURCE_ENVELOPE");
  if (input === null || Array.isArray(input) || typeof input !== "object") throw new Error("RETRIEVAL_SOURCE_ENVELOPE_INVALID");
  const record = input;
  if (CHUNK_MARKDOWN_REQUIRED_FIELDS.some((field) => !Object.hasOwn(record, field)) || Object.keys(record).some((field) => !CHUNK_MARKDOWN_ALLOWED_FIELDS.has(field))) {
    throw new Error("RETRIEVAL_SOURCE_ENVELOPE_FIELDS_INVALID");
  }
  if (typeof record.source_id !== "string" || typeof record.source_path !== "string" || typeof record.text !== "string") {
    throw new Error("RETRIEVAL_SOURCE_ENVELOPE_STRING_FIELD_INVALID");
  }
  for (const field of ["lineage_id", "valid_from", "valid_to"]) {
    if (record[field] !== void 0 && record[field] !== null && typeof record[field] !== "string") {
      throw new Error(`RETRIEVAL_SOURCE_ENVELOPE_${field.toUpperCase()}_INVALID`);
    }
  }
  for (const field of ["supersedes", "superseded_by"]) {
    if (record[field] !== void 0) assertStringArray(record[field], `RETRIEVAL_SOURCE_ENVELOPE_${field.toUpperCase()}`);
  }
  if (record.metadata !== void 0) validateRetrievalChunkMetadata(record.metadata);
  try {
    retrievalCanonicalDigest(record);
  } catch {
    throw new Error("RETRIEVAL_SOURCE_ENVELOPE_CANONICAL_JSON_INVALID");
  }
}
function validateRetrievalChunk(chunk) {
  if (chunk === null || Array.isArray(chunk) || typeof chunk !== "object" || utilTypes2.isProxy(chunk) || Object.getPrototypeOf(chunk) !== Object.prototype && Object.getPrototypeOf(chunk) !== null) {
    throw new Error("RETRIEVAL_CHUNK_OBJECT_INVALID");
  }
  const record = chunk;
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.some((key) => typeof key !== "string") || ownKeys.some((key) => {
    if (typeof key !== "string") return true;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return !descriptor?.enumerable || !("value" in descriptor);
  })) throw new Error("RETRIEVAL_CHUNK_FIELDS_INVALID");
  if (RETRIEVAL_CHUNK_REQUIRED_FIELDS.some((field) => !Object.hasOwn(record, field)) || Object.keys(record).some((field) => !RETRIEVAL_CHUNK_ALLOWED_FIELDS.has(field))) {
    throw new Error("RETRIEVAL_CHUNK_FIELDS_INVALID");
  }
  if (typeof record.chunk_id !== "string" || typeof record.source_id !== "string" || typeof record.source_path !== "string" || typeof record.source_digest !== "string" || typeof record.content_digest !== "string" || typeof record.structural_position !== "string" || record.structural_position.length === 0 || typeof record.text !== "string") {
    throw new Error("RETRIEVAL_CHUNK_STRING_FIELD_INVALID");
  }
  assertStringArray(record.heading_path, "RETRIEVAL_CHUNK_HEADING_PATH");
  assertStringArray(record.supersedes, "RETRIEVAL_CHUNK_SUPERSEDES");
  assertStringArray(record.superseded_by, "RETRIEVAL_CHUNK_SUPERSEDED_BY");
  if (record.parent_chunk_id !== void 0 && (typeof record.parent_chunk_id !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(record.parent_chunk_id))) {
    throw new Error("RETRIEVAL_CHUNK_PARENT_ID_INVALID");
  }
  for (const field of ["lineage_id", "valid_from", "valid_to"]) {
    if (record[field] !== null && typeof record[field] !== "string") throw new Error(`RETRIEVAL_CHUNK_${field.toUpperCase()}_INVALID`);
  }
  validateRetrievalChunkMetadata(record.metadata);
  const validated = record;
  if (!isValidGkxAuthoredUid(validated.source_id)) throw new Error("RETRIEVAL_CHUNK_SOURCE_ID_INVALID");
  if (!isValidRetrievalSourcePath(validated.source_path)) throw new Error("RETRIEVAL_CHUNK_SOURCE_PATH_INVALID");
  if (!/^sha256:[0-9a-f]{64}$/u.test(validated.source_digest) || !/^sha256:[0-9a-f]{64}$/u.test(validated.content_digest)) throw new Error("RETRIEVAL_CHUNK_DIGEST_INVALID");
  if (!Number.isSafeInteger(validated.ordinal_within_source) || validated.ordinal_within_source < 1 || !Number.isSafeInteger(validated.part_ordinal) || validated.part_ordinal < 1 || !Number.isSafeInteger(validated.heading_depth) || validated.heading_depth < 0 || validated.heading_depth > 6 || !Number.isSafeInteger(validated.start_byte) || !Number.isSafeInteger(validated.end_byte) || validated.start_byte < 0 || validated.end_byte <= validated.start_byte || !Number.isSafeInteger(validated.start_line) || !Number.isSafeInteger(validated.end_line) || validated.start_line < 1 || validated.end_line < validated.start_line || !Number.isSafeInteger(validated.token_count) || validated.token_count < 0) throw new Error("RETRIEVAL_CHUNK_COORDINATES_INVALID");
  const textBytes = Buffer.from(validated.text, "utf8");
  if (validated.end_byte - validated.start_byte !== textBytes.length || retrievalSha256(textBytes) !== validated.content_digest) throw new Error("RETRIEVAL_CHUNK_CONTENT_BINDING_INVALID");
  if (textBytes.length > RETRIEVAL_MAX_CHUNK_BYTES) throw new Error("RETRIEVAL_CHUNK_BYTE_LIMIT_EXCEEDED");
  if (asciiWhitespaceTokens(textBytes).length !== validated.token_count) throw new Error("RETRIEVAL_CHUNK_TOKEN_COUNT_INVALID");
  if (validated.chunk_id !== chunkIdentity(validated.source_id, validated.structural_position, validated.part_ordinal, validated.content_digest)) throw new Error("RETRIEVAL_CHUNK_ID_INVALID");
  try {
    retrievalCanonicalDigest(validated);
  } catch {
    throw new Error("RETRIEVAL_CHUNK_CANONICAL_JSON_INVALID");
  }
}
function chunkMarkdown(input, options = {}) {
  validateChunkMarkdownInput(input);
  if (!isValidGkxAuthoredUid(input.source_id)) throw new TypeError("source_id must be a valid canonical GKX authored uid.");
  if (!isValidRetrievalSourcePath(input.source_path)) throw new TypeError("source_path must use the portable normalized vault-relative grammar.");
  const sourcePath2 = normalizeVaultRelative(input.source_path);
  if (sourcePath2 !== input.source_path) throw new TypeError("source_path must already be normalized.");
  const maxTokens = options.max_tokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = options.overlap_tokens ?? DEFAULT_OVERLAP_TOKENS;
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 16 || maxTokens > 4096) throw new RangeError("max_tokens must be an integer from 16 through 4096.");
  if (!Number.isSafeInteger(overlapTokens) || overlapTokens < 0 || overlapTokens >= maxTokens) throw new RangeError("overlap_tokens must be an integer from 0 through max_tokens - 1.");
  const sourceBytes = Buffer.from(input.text, "utf8");
  const sourceDigest = retrievalSha256(sourceBytes);
  const lineStarts = byteLineStarts(sourceBytes);
  const pending = [];
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
          source_path: sourcePath2,
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
          supersedes: [...input.supersedes ?? []],
          superseded_by: [...input.superseded_by ?? []],
          metadata: { ...input.metadata ?? {} }
        }
      });
    }
  }
  const firstByPosition = /* @__PURE__ */ new Map();
  for (const item of pending) if (!firstByPosition.has(item.chunk.structural_position)) firstByPosition.set(item.chunk.structural_position, item.chunk.chunk_id);
  for (const item of pending) {
    if (item.parentPosition) item.chunk.parent_chunk_id = firstByPosition.get(item.parentPosition);
  }
  const output = pending.map(({ chunk }) => chunk);
  for (const chunk of output) validateRetrievalChunk(chunk);
  return output;
}
var RETRIEVAL_TOKENIZATION_RULE = Object.freeze({
  version: RETRIEVAL_TOKENIZER_VERSION,
  separators_hex: ["09", "0a", "0b", "0c", "0d", "20"]
});

// scripts/generate-retrieval-observation-fixture.mjs
var PERFORMANCE_GENERATOR_VERSION = "gkos-retrieval-evaluation-performance-generator/1.0.0";
var PERFORMANCE_FIXTURE_VERSION = "gkos-retrieval-evaluation-performance-fixture/1.0.0";
var PERFORMANCE_SOURCE_SNAPSHOT_VERSION = "gkos-retrieval-evaluation-performance-source-snapshot/1.0.0";
var PERFORMANCE_CHUNK_SET_VERSION = "gkos-retrieval-evaluation-performance-chunk-set/1.0.0";
var PERFORMANCE_SAMPLE_PLAN_VERSION = "gkos-retrieval-evaluation-performance-sample-plan/1.0.0";
var PERFORMANCE_RESULT_SET_VERSION = "gkos-retrieval-evaluation-performance-result-set/1.0.0";
var PERFORMANCE_QUERY_CYCLE_VERSION = "gkos-retrieval-evaluation-performance-query-cycle/1.0.0";
var PERFORMANCE_QUERY_WORK_VERSION = "gkos-retrieval-evaluation-performance-query-work/1.0.0";
var PERFORMANCE_VAULT_ID = "phase4-performance-v1";
var PERFORMANCE_SAMPLE_PLAN_DIGEST = "sha256:7852c24bc2eeb057f3ae9ccfaf4b03c72e75b6556609dac7673e5626f238a534";
var PERFORMANCE_FIXTURE_DIGEST = "sha256:e18741ea37bcaefdc981ab5b5b1b768ca0e1878f32a8f3e31f4324aad4244aa4";
var PERFORMANCE_CONFIGURATION_DIGEST = "sha256:1ddbfb7e00052cc8967a36ed3cfa952caca0823a6130bdcb90c3de3568e58eec";
var PERFORMANCE_POLICY_DIGEST = "sha256:615a92c8db758934c63e8671ee953989e9734c7085f4b066ddc2948368ae22f6";
var SOURCE_COUNT = 1e3;
var SECTIONS_PER_SOURCE = 10;
var CHUNK_COUNT = 1e4;
var MUTATED_SOURCE_ORDINAL = 555;
var MUTATED_SECTION_ORDINAL = 5;
var MUTATED_GLOBAL_ORDINAL = 5555;
var INITIAL_SOURCE_SNAPSHOT = Object.freeze({
  bytes: 193149,
  digest: "sha256:d87568bc14830e0646057690b2db23df07c437048a153c086a81dbb804fc98ce"
});
var UPDATED_SOURCE_SNAPSHOT = Object.freeze({
  bytes: 193149,
  digest: "sha256:fef6de2b266428a70e1d3668c0cbbb7f0f99ac4841f02b663ead77eeadb44128"
});
var INITIAL_CHUNK_SET = Object.freeze({
  bytes: 9912142,
  digest: "sha256:321962e7dd2345895365db35b50ecf5478c169c489f1a92d9cd6647301d66e8a"
});
var UPDATED_CHUNK_SET = Object.freeze({
  bytes: 9912142,
  digest: "sha256:9563bfeb50827dd4d68242cdf73b992904aff7f3e429d29b7038155a3f5de1eb"
});
var INDEX_CONFIGURATION = Object.freeze({
  contract_version: "gkos-retrieval-evaluation-performance-index-configuration/1.0.0",
  engine_version: "2.1.2",
  retrieval_contract_version: "gkos-retrieval/1.0.0-draft.1",
  projection_schema_version: 2,
  chunker: { version: "gkos-heading-chunker/1", max_tokens: 16, overlap_tokens: 0 },
  tokenizer_version: "gkos-ascii-whitespace/1",
  lexical_backend: "sqlite_fts5",
  embedding: {
    provider_kind: "local_onnx",
    provider_id: "phase4-observation-local",
    model_id: "phase4-observation-constant-v1",
    dimensions: 4,
    timeout_ms: 3e4
  }
});
var INDEX_POLICY = Object.freeze({
  contract_version: "gkos-retrieval-evaluation-performance-index-policy/1.0.0",
  vault_id: PERFORMANCE_VAULT_ID,
  source_snapshot_contract_version: PERFORMANCE_SOURCE_SNAPSHOT_VERSION,
  source_count: SOURCE_COUNT,
  chunk_count: CHUNK_COUNT,
  authorization: {
    discoverability: "allow",
    sensitivity: ["public"],
    source_scope: "all_generated_sources",
    chunk_scope: "all_generated_chunks"
  },
  query_filters: null
});
var QUERY_ORDINALS = Object.freeze([0, 1111, 2222, 3333, 4444, 5555, 6666, 7777, 8888, 9999]);
var QUERY_REQUEST = Object.freeze({
  limit: 5,
  lexical_top_k: 5,
  semantic_top_k: 5,
  rrf_k: 60,
  mmr: false,
  mmr_lambda: 0.7,
  parent_expansion: false
});
var RESULT_STAGE_EXPECTATION = Object.freeze({
  result_contract_version: "gkos-retrieval/1.0.0-draft.1",
  lexical: { kind: "sqlite_fts5", state: "active", reason_codes: [] },
  vector: {
    kind: "local_onnx",
    state: "active",
    provider_id: "phase4-observation-local",
    model_id: "phase4-observation-constant-v1",
    reason_codes: []
  },
  reranker: { kind: "none", state: "skipped", reason_codes: ["RERANKER_NOT_CONFIGURED"] }
});
var EXPECTED_INDEX = Object.freeze({
  initial: {
    source_snapshot_digest: INITIAL_SOURCE_SNAPSHOT.digest,
    chunk_set_digest: INITIAL_CHUNK_SET.digest,
    provider_call_count: 313,
    provider_item_count: 1e4,
    index_request_sequence_digest: "sha256:972275154f0526defa4afd300d0acfd310a488efe074750b7e08bf7e5d9ef4d5",
    expected_projection_id: "retrieval:1f7d014b0dd57096f6437e1c",
    expected_projection_digest: "sha256:1f7d014b0dd57096f6437e1c446bcabe8a222fee62be984b1e0d4e7dddab5cb2"
  },
  incremental_update: {
    source_snapshot_digest: UPDATED_SOURCE_SNAPSHOT.digest,
    chunk_set_digest: UPDATED_CHUNK_SET.digest,
    prior_projection_digest: "sha256:1f7d014b0dd57096f6437e1c446bcabe8a222fee62be984b1e0d4e7dddab5cb2",
    provider_call_count: 1,
    provider_item_count: 1,
    chunks_reprocessed: 1,
    chunks_reused: 9999,
    index_request_sequence_digest: "sha256:531d5ad686a8ce5b49b2884a9b0f5ed500de4a6a72f5493759f65a5bc4967965",
    expected_projection_id: "retrieval:a65e3710f614da0a33a2913e",
    expected_projection_digest: "sha256:a65e3710f614da0a33a2913e909c682d8485619f72f0954c86395b501202f5f8"
  },
  clean_rebuild: {
    source_snapshot_digest: UPDATED_SOURCE_SNAPSHOT.digest,
    chunk_set_digest: UPDATED_CHUNK_SET.digest,
    prior_projection_digest: null,
    provider_call_count: 313,
    provider_item_count: 1e4,
    index_request_sequence_digest: "sha256:d76bfae77f73bace73bde6d305b6103479093145d8283528721b5929cb32fcbb",
    expected_projection_id: "retrieval:a65e3710f614da0a33a2913e",
    expected_projection_digest: "sha256:a65e3710f614da0a33a2913e909c682d8485619f72f0954c86395b501202f5f8"
  }
});
function exact(value, expected, code) {
  if (value !== expected) throw new Error(`${code}:${String(value)}:${String(expected)}`);
}
function sourceId(ordinal) {
  return `00000000-0000-4000-8000-${String(ordinal + 1).padStart(12, "0")}`;
}
function sourcePath(ordinal) {
  return `phase4-performance/source-${String(ordinal).padStart(4, "0")}.md`;
}
function sourceText(sourceOrdinal, updated) {
  let text = "";
  for (let sectionOrdinal = 0; sectionOrdinal < SECTIONS_PER_SOURCE; sectionOrdinal += 1) {
    const globalOrdinal = sourceOrdinal * SECTIONS_PER_SOURCE + sectionOrdinal;
    const revision = updated && sourceOrdinal === MUTATED_SOURCE_ORDINAL && sectionOrdinal === MUTATED_SECTION_ORDINAL ? "revisionomega" : "revisionalpha";
    text += `# Section ${String(globalOrdinal).padStart(5, "0")}
`;
    text += `phasefourshared phasefourtoken${String(globalOrdinal).padStart(5, "0")} ${revision}

`;
  }
  return text;
}
function sourceMetadata(ordinal) {
  return {
    title: `Phase 4 performance ${String(ordinal).padStart(4, "0")}`,
    tags: ["phase4-performance"],
    topic: "retrieval",
    category: "qualification",
    authored_at: "2026-08-01T00:00:00Z",
    sensitivity: "public",
    gkx_type: "note",
    epistemic_state: "observation",
    authoritative: true
  };
}
function buildPerformanceCorpus(updated = false) {
  const sources = [];
  const chunks = [];
  const sourceRows = [];
  for (let ordinal = 0; ordinal < SOURCE_COUNT; ordinal += 1) {
    const source_id = sourceId(ordinal);
    const source_path = sourcePath(ordinal);
    const text = sourceText(ordinal, updated);
    const sourceChunks = chunkMarkdown({
      source_id,
      source_path,
      text,
      metadata: sourceMetadata(ordinal)
    }, { max_tokens: 16, overlap_tokens: 0 });
    exact(sourceChunks.length, SECTIONS_PER_SOURCE, "GKX_EVAL_OBSERVATION_CHUNK_COUNT_INVALID");
    sources.push(Object.freeze({ source_id, source_path, text, bytes: Buffer.from(text, "utf8") }));
    chunks.push(...sourceChunks);
    sourceRows.push({ source_id, source_path, source_digest: sourceChunks[0].source_digest });
  }
  exact(chunks.length, CHUNK_COUNT, "GKX_EVAL_OBSERVATION_CHUNK_COUNT_INVALID");
  const sourceSnapshot = {
    contract_version: PERFORMANCE_SOURCE_SNAPSHOT_VERSION,
    vault_id: PERFORMANCE_VAULT_ID,
    source_count: SOURCE_COUNT,
    sources: sourceRows
  };
  const chunkSet = {
    contract_version: PERFORMANCE_CHUNK_SET_VERSION,
    vault_id: PERFORMANCE_VAULT_ID,
    chunk_count: CHUNK_COUNT,
    chunks
  };
  const expectedSnapshot = updated ? UPDATED_SOURCE_SNAPSHOT : INITIAL_SOURCE_SNAPSHOT;
  const expectedChunkSet = updated ? UPDATED_CHUNK_SET : INITIAL_CHUNK_SET;
  const sourceSnapshotJson = stableJson(sourceSnapshot);
  const chunkSetJson = stableJson(chunkSet);
  exact(Buffer.byteLength(sourceSnapshotJson, "utf8"), expectedSnapshot.bytes, "GKX_EVAL_OBSERVATION_SOURCE_SNAPSHOT_SIZE_INVALID");
  exact(retrievalSha256(sourceSnapshotJson), expectedSnapshot.digest, "GKX_EVAL_OBSERVATION_SOURCE_SNAPSHOT_DIGEST_INVALID");
  exact(Buffer.byteLength(chunkSetJson, "utf8"), expectedChunkSet.bytes, "GKX_EVAL_OBSERVATION_CHUNK_SET_SIZE_INVALID");
  exact(retrievalSha256(chunkSetJson), expectedChunkSet.digest, "GKX_EVAL_OBSERVATION_CHUNK_SET_DIGEST_INVALID");
  return Object.freeze({
    updated,
    sources: Object.freeze(sources),
    chunks: Object.freeze(chunks),
    source_snapshot: Object.freeze(sourceSnapshot),
    source_snapshot_digest: expectedSnapshot.digest,
    chunk_set_digest: expectedChunkSet.digest
  });
}
function generatorMaterial() {
  return {
    source_count: SOURCE_COUNT,
    sections_per_source: SECTIONS_PER_SOURCE,
    chunk_count: CHUNK_COUNT,
    source_uid_prefix: "00000000-0000-4000-8000-",
    source_uid_ordinal_base: 1,
    source_uid_decimal_width: 12,
    source_path_prefix: "phase4-performance/source-",
    source_path_decimal_width: 4,
    source_path_suffix: ".md",
    section_heading_prefix: "# Section ",
    global_section_decimal_width: 5,
    section_body_prefix: "phasefourshared phasefourtoken",
    section_body_suffix: " revisionalpha",
    line_ending: "LF",
    terminal_blank_line: true,
    metadata: {
      title_prefix: "Phase 4 performance ",
      tags: ["phase4-performance"],
      topic: "retrieval",
      category: "qualification",
      authored_at: "2026-08-01T00:00:00Z",
      sensitivity: "public",
      gkx_type: "note",
      epistemic_state: "observation",
      authoritative: true
    },
    chunking: { max_tokens: 16, overlap_tokens: 0 }
  };
}
function performanceFixtureMaterial() {
  const material = {
    contract_version: PERFORMANCE_FIXTURE_VERSION,
    generator_contract_version: PERFORMANCE_GENERATOR_VERSION,
    engine_version: "2.1.2",
    retrieval_contract_version: "gkos-retrieval/1.0.0-draft.1",
    chunker_version: "gkos-heading-chunker/1",
    tokenizer_version: "gkos-ascii-whitespace/1",
    vault_id: PERFORMANCE_VAULT_ID,
    generator: generatorMaterial(),
    mutation: {
      global_chunk_ordinal: MUTATED_GLOBAL_ORDINAL,
      source_ordinal: MUTATED_SOURCE_ORDINAL,
      section_ordinal: MUTATED_SECTION_ORDINAL,
      from: "revisionalpha",
      to: "revisionomega",
      changed_content_digest_count: 1,
      changed_source_chunk_record_count: 10
    },
    initial: {
      source_snapshot_digest: INITIAL_SOURCE_SNAPSHOT.digest,
      chunk_set_digest: INITIAL_CHUNK_SET.digest
    },
    updated: {
      source_snapshot_digest: UPDATED_SOURCE_SNAPSHOT.digest,
      chunk_set_digest: UPDATED_CHUNK_SET.digest
    }
  };
  exact(Buffer.byteLength(stableJson(material), "utf8"), 1783, "GKX_EVAL_OBSERVATION_FIXTURE_SIZE_INVALID");
  exact(retrievalCanonicalDigest(material), PERFORMANCE_FIXTURE_DIGEST, "GKX_EVAL_OBSERVATION_FIXTURE_DIGEST_INVALID");
  return material;
}
function performanceIndexConfiguration() {
  exact(Buffer.byteLength(stableJson(INDEX_CONFIGURATION), "utf8"), 523, "GKX_EVAL_OBSERVATION_CONFIGURATION_SIZE_INVALID");
  exact(retrievalCanonicalDigest(INDEX_CONFIGURATION), PERFORMANCE_CONFIGURATION_DIGEST, "GKX_EVAL_OBSERVATION_CONFIGURATION_DIGEST_INVALID");
  return structuredClone(INDEX_CONFIGURATION);
}
function performanceIndexPolicy() {
  exact(retrievalCanonicalDigest(INDEX_POLICY), PERFORMANCE_POLICY_DIGEST, "GKX_EVAL_OBSERVATION_POLICY_DIGEST_INVALID");
  return structuredClone(INDEX_POLICY);
}
function performanceQueryCycle() {
  const material = {
    contract_version: PERFORMANCE_QUERY_CYCLE_VERSION,
    queries: QUERY_ORDINALS.map((ordinal) => {
      const query_text = `phasefourtoken${String(ordinal).padStart(5, "0")}`;
      return {
        query_id: `phase4-perf-q-${String(ordinal).padStart(5, "0")}`,
        query_text,
        request_id: retrievalSha256(query_text)
      };
    }),
    request: { ...QUERY_REQUEST }
  };
  const query_cycle_digest = retrievalCanonicalDigest(material);
  exact(query_cycle_digest, "sha256:25672a55ebd688cfc2d35680376a352ac2504734af7ebdf40bb9971307bc8a03", "GKX_EVAL_OBSERVATION_QUERY_CYCLE_DIGEST_INVALID");
  return { ...material, query_cycle_digest };
}
function queryWork(phase, cycleRepeatCount, expectedDigest, expectedSequenceDigest) {
  const cycle = performanceQueryCycle();
  const attemptCount = cycle.queries.length * cycleRepeatCount;
  const material = {
    contract_version: PERFORMANCE_QUERY_WORK_VERSION,
    phase,
    query_cycle_digest: cycle.query_cycle_digest,
    cycle_repeat_count: cycleRepeatCount,
    attempt_count: attemptCount,
    embedding_call_count: attemptCount,
    embedding_item_count: attemptCount,
    request_id_sequence_digest: expectedSequenceDigest,
    fts_query_stage_count: attemptCount,
    reranker_call_count: 0,
    reranker_item_count: 0,
    query_cache_hit_count: 0,
    result_stage_expectation: structuredClone(RESULT_STAGE_EXPECTATION)
  };
  exact(retrievalCanonicalDigest(material), expectedDigest, "GKX_EVAL_OBSERVATION_QUERY_WORK_DIGEST_INVALID");
  return { ...material, query_work_digest: expectedDigest };
}
function performanceSamplePlan() {
  const fixture = performanceFixtureMaterial();
  const queryCycle = performanceQueryCycle();
  const material = {
    contract_version: PERFORMANCE_SAMPLE_PLAN_VERSION,
    fixture: {
      fixture_contract_version: PERFORMANCE_FIXTURE_VERSION,
      fixture_digest: PERFORMANCE_FIXTURE_DIGEST,
      generator_contract_version: PERFORMANCE_GENERATOR_VERSION,
      vault_id: PERFORMANCE_VAULT_ID,
      source_count: SOURCE_COUNT,
      sections_per_source: SECTIONS_PER_SOURCE,
      chunk_count: CHUNK_COUNT,
      mutation: structuredClone(fixture.mutation),
      initial: structuredClone(fixture.initial),
      updated: structuredClone(fixture.updated)
    },
    indexing: {
      index_coordinate_contract_version: "gkos-retrieval-evaluation-performance-index-coordinate/1.0.0",
      engine_version: "2.1.2",
      retrieval_contract_version: "gkos-retrieval/1.0.0-draft.1",
      projection_schema_version: 2,
      vault_id: PERFORMANCE_VAULT_ID,
      chunker_version: "gkos-heading-chunker/1",
      tokenizer_version: "gkos-ascii-whitespace/1",
      lexical_backend: "sqlite_fts5",
      configuration_preimage: performanceIndexConfiguration(),
      configuration_digest: PERFORMANCE_CONFIGURATION_DIGEST,
      policy_preimage: performanceIndexPolicy(),
      policy_digest: PERFORMANCE_POLICY_DIGEST,
      batching: { max_items: 32, max_utf8_bytes: 262144, content_digest_deduplication: true },
      initial: structuredClone(EXPECTED_INDEX.initial),
      incremental_update: structuredClone(EXPECTED_INDEX.incremental_update),
      clean_rebuild: structuredClone(EXPECTED_INDEX.clean_rebuild)
    },
    embedding_provider: {
      provider_kind: "local_onnx",
      provider_id: "phase4-observation-local",
      model_id: "phase4-observation-constant-v1",
      dimensions: 4,
      timeout_ms: 3e4,
      response_vector: [1, 0, 0, 0]
    },
    query_cycle: queryCycle,
    execution: {
      warmup_round_count: 1,
      warmup_count: 10,
      measured_round_count: 5,
      sample_count: 50,
      clean_rebuild_comparison_round_count: 1,
      incremental_query_work: queryWork(
        "incremental_observation",
        6,
        "sha256:4ced5909b5031871b9d4155cf9a691ae92dc3033a59efa973fbbd08757086905",
        "sha256:ee1ab2d1307bb1789a4aeecc54c40eefc9f8dab25184068dd9e96a4fc01ed7cc"
      ),
      clean_rebuild_query_work: queryWork(
        "clean_rebuild_comparison",
        1,
        "sha256:139557a622cf31cb08af1b2339a509d39e69f7a265ea9147248335e8a580973e",
        "sha256:c0e95ed6ee5752401913cc3ed1cb3bcdf85b29f942870acee20d5621ed14a812"
      ),
      total_query_embedding_call_count: 70,
      total_query_embedding_item_count: 70,
      total_fts_query_stage_count: 70,
      total_reranker_call_count: 0,
      total_reranker_item_count: 0,
      total_query_cache_hit_count: 0
    },
    percentile: {
      method: "nearest_rank",
      sort: "ascending_integer_micros",
      p50: { percentile_micros: 5e5, rank: 25, index: 24 },
      p95: { percentile_micros: 95e4, rank: 48, index: 47 },
      p99: { percentile_micros: 99e4, rank: 50, index: 49 },
      p95_strict_upper_bound_micros: 5e5
    },
    convergence: {
      manifest_comparison: "canonical_stable_json_byte_equality",
      database_bytes_compared: false,
      result_comparison_query_count: 10,
      result_set_contract_version: PERFORMANCE_RESULT_SET_VERSION
    }
  };
  const json = stableJson(material);
  exact(Buffer.byteLength(json, "utf8"), 9449, "GKX_EVAL_OBSERVATION_SAMPLE_PLAN_SIZE_INVALID");
  exact(retrievalSha256(json), PERFORMANCE_SAMPLE_PLAN_DIGEST, "GKX_EVAL_OBSERVATION_SAMPLE_PLAN_DIGEST_INVALID");
  return { ...material, sample_plan_digest: PERFORMANCE_SAMPLE_PLAN_DIGEST };
}

// scripts/observation-2.2-material.mjs
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
var digest = (value) => "sha256:" + createHash2("sha256").update(canonical(value)).digest("hex");
function observation22Material() {
  const plan = performanceSamplePlan();
  delete plan.sample_plan_digest;
  const fixture = performanceFixtureMaterial();
  fixture.contract_version = "gkos-retrieval-evaluation-performance-fixture/2.2.0";
  fixture.generator_contract_version = "gkos-retrieval-evaluation-performance-generator/2.2.0";
  fixture.engine_version = "2.2.0";
  fixture.projection_schema_version = 2;
  plan.contract_version = "gkos-retrieval-evaluation-performance-sample-plan/2.2.0";
  plan.fixture.fixture_contract_version = fixture.contract_version;
  plan.fixture.generator_contract_version = fixture.generator_contract_version;
  plan.fixture.fixture_digest = digest(fixture);
  plan.indexing.engine_version = "2.2.0";
  plan.indexing.configuration_preimage.engine_version = "2.2.0";
  plan.indexing.configuration_digest = digest(plan.indexing.configuration_preimage);
  const manifests = {};
  for (const updated of [false, true]) {
    const corpus = buildPerformanceCorpus(updated);
    const chunks = [...corpus.chunks].sort((a, b) => a.chunk_id < b.chunk_id ? -1 : a.chunk_id > b.chunk_id ? 1 : 0);
    const base = {
      contract_version: "gkos-retrieval/1.0.0-draft.1",
      projection_schema_version: 2,
      engine_version: "2.2.0",
      vault_id: plan.indexing.vault_id,
      source_snapshot_digest: corpus.source_snapshot_digest,
      configuration_digest: plan.indexing.configuration_digest,
      policy_digest: plan.indexing.policy_digest,
      chunker_version: "gkos-heading-chunker/1",
      tokenizer_version: "gkos-ascii-whitespace/1",
      lexical_backend: "sqlite_fts5",
      embedding_provider_id: "phase4-observation-local",
      embedding_model_id: "phase4-observation-constant-v1",
      embedding_dimensions: 4,
      source_count: 1e3,
      chunk_count: 1e4
    };
    const projection_digest = digest({ ...base, chunks, vectors: chunks.map((chunk) => ({ chunk_id: chunk.chunk_id, vector: [1, 0, 0, 0] })) });
    manifests[updated ? "updated" : "initial"] = { ...base, projection_id: "retrieval:" + projection_digest.slice(7, 31), projection_digest };
  }
  for (const phase of ["initial", "incremental_update", "clean_rebuild"]) {
    const manifest = manifests[phase === "initial" ? "initial" : "updated"];
    plan.indexing[phase].expected_projection_id = manifest.projection_id;
    plan.indexing[phase].expected_projection_digest = manifest.projection_digest;
  }
  plan.indexing.incremental_update.prior_projection_digest = manifests.initial.projection_digest;
  return { fixture, plan, manifests, pins: {
    fixture_digest: digest(fixture),
    configuration_digest: plan.indexing.configuration_digest,
    sample_plan_digest: digest(plan),
    initial_projection_digest: manifests.initial.projection_digest,
    updated_projection_digest: manifests.updated.projection_digest
  } };
}
export {
  canonical,
  digest,
  observation22Material
};
