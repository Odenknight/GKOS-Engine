import { isValidGkxAuthoredUid } from "../gkx23";
import { isGkx23RelationType } from "../gkx23-relationship-types";
import { types as utilTypes } from "node:util";
import type { GkxOrigin } from "../types";
import type { GkxCanonicalResolutionBasis } from "../lineage-receipts";
import { isValidRetrievalSourcePath, validateRetrievalChunk, validateRetrievalChunkMetadata } from "./chunker";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, stableJson } from "./digest";
import type {
  GkxRetrievalAssertionOrigin,
  GkxRetrievalValidityOrigin,
  RetrievalChunk,
  RetrievalChunkMetadata,
} from "./types";

const RECORD_KEY_RE = /^gkx-record:[0-9a-f]{64}:[0-9]+$/u;
const CANDIDATE_CHUNK_KEY_RE = /^gkx-candidate-chunk:[0-9a-f]{64}$/u;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const PARSER_FINGERPRINT_RE = /^[0-9a-z]+:[0-9a-z]+$/u;
const NORMALIZED_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;
const SENSITIVITY_LEVELS = new Set(["public", "internal", "restricted", "confidential", "regulated", "phi", "secret"]);
const ORIGINS = new Set<GkxOrigin>(["authored", "derived", "proposed", "approved"]);
const VALIDITY_REASONS: Readonly<Record<GkxRetrievalValidityOrigin, string>> = {
  gkx_authored_timestamp: "VALIDITY_FROM_GKX_AUTHORED_TIMESTAMP",
  source_created_time: "VALIDITY_FROM_SOURCE_CREATED_TIME",
  source_modified_time: "VALIDITY_FROM_SOURCE_MODIFIED_TIME",
  projection_reference_time: "VALIDITY_FROM_PROJECTION_REFERENCE_TIME",
  unknown: "VALIDITY_UNKNOWN",
};
const CANDIDATE_SOURCE_FIELDS = [
  "assertion_origin", "assertion_time", "candidate_digest", "contract_version", "lineage_id",
  "parser_content_fingerprint", "reason_codes", "record_key", "source_digest", "source_id",
  "source_metadata", "source_path", "valid_from", "validity_origin",
].sort(retrievalCodeUnitCompare);
const CANDIDATE_SOURCE_INPUT_FIELDS = CANDIDATE_SOURCE_FIELDS.filter((field) => field !== "candidate_digest" && field !== "contract_version");
const DECLARATION_FIELDS = [
  "category", "declaration_index", "field", "origin", "raw_reference", "resolution_tiers", "source_record_key",
].sort(retrievalCodeUnitCompare);
const TIER_FIELDS = ["basis", "candidate_record_keys"].sort(retrievalCodeUnitCompare);
const CANDIDATE_CHUNK_FIELDS = ["candidate_chunk_key", "chunk", "parent_candidate_chunk_key", "record_key"].sort(retrievalCodeUnitCompare);

function exactPlainRecord(value: unknown, fields: readonly string[], code: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value)) throw new TypeError(code);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string") ||
      (keys as string[]).sort(retrievalCodeUnitCompare).join("\0") !== [...fields].sort(retrievalCodeUnitCompare).join("\0")) throw new TypeError(code);
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor) || descriptor.value === undefined) throw new TypeError(code);
  }
  // Recursively reject proxies, accessors, sparse arrays, cycles, exotic
  // objects, unsafe numbers, and malformed UTF-16 before semantic reads.
  try { stableJson(value); } catch { throw new TypeError(code); }
}

function denseArray(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(code);
  try { stableJson(value); } catch { throw new TypeError(code); }
  return value;
}

function normalizedTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !NORMALIZED_UTC_RE.test(value)) return false;
  try { return new Date(Date.parse(value)).toISOString() === value; } catch { return false; }
}

function sortedUniqueStrings(value: unknown, code: string): asserts value is string[] {
  const values = denseArray(value, code);
  if (values.some((item) => typeof item !== "string" || !item || item.length > 512 || CONTROL_RE.test(item)) ||
      new Set(values).size !== values.length || [...values].sort(retrievalCodeUnitCompare).join("\0") !== values.join("\0")) throw new TypeError(code);
}

/**
 * Internal physical source candidate. It is deliberately source-local: no
 * valid_to, resolved endpoint, temporal-state, or lineage-neutral claim is
 * minted before the authorization-scoped resolver runs.
 */
export interface GkxRetrievalCandidateSource {
  contract_version: "gkos-retrieval-candidate-source/1.0.0-draft.1";
  record_key: string;
  source_id: string;
  source_path: string;
  /** Legacy parser fingerprint retained only as a scoped conflict input. */
  parser_content_fingerprint: string;
  /** Cryptographic digest of the exact UTF-8 source bytes. */
  source_digest: string;
  source_metadata: RetrievalChunkMetadata;
  assertion_time: string | null;
  assertion_origin: GkxRetrievalAssertionOrigin;
  valid_from: string | null;
  validity_origin: GkxRetrievalValidityOrigin;
  lineage_id: null;
  reason_codes: string[];
  candidate_digest: string;
}

export function sealGkxRetrievalCandidateSource(
  value: Omit<GkxRetrievalCandidateSource, "contract_version" | "candidate_digest">,
): GkxRetrievalCandidateSource {
  exactPlainRecord(value, CANDIDATE_SOURCE_INPUT_FIELDS, "GKX_RETRIEVAL_CANDIDATE_SOURCE_INPUT_INVALID");
  const inert = JSON.parse(stableJson(value)) as Omit<GkxRetrievalCandidateSource, "contract_version" | "candidate_digest">;
  const base = {
    contract_version: "gkos-retrieval-candidate-source/1.0.0-draft.1" as const,
    ...inert,
  };
  const sealed = { ...base, candidate_digest: retrievalCanonicalDigest(base) };
  validateGkxRetrievalCandidateSource(sealed);
  return sealed;
}

export function validateGkxRetrievalCandidateSource(value: unknown): asserts value is GkxRetrievalCandidateSource {
  exactPlainRecord(value, CANDIDATE_SOURCE_FIELDS, "GKX_RETRIEVAL_CANDIDATE_SOURCE_INVALID");
  const item = value as unknown as GkxRetrievalCandidateSource;
  if (item.contract_version !== "gkos-retrieval-candidate-source/1.0.0-draft.1" || !RECORD_KEY_RE.test(item.record_key) ||
      !isValidGkxAuthoredUid(item.source_id) || typeof item.source_path !== "string" || item.source_path.length > 4096 || !isValidRetrievalSourcePath(item.source_path) ||
      typeof item.parser_content_fingerprint !== "string" || !PARSER_FINGERPRINT_RE.test(item.parser_content_fingerprint) ||
      !SHA256_RE.test(item.source_digest) || !SHA256_RE.test(item.candidate_digest) || item.lineage_id !== null) {
    throw new TypeError("GKX_RETRIEVAL_CANDIDATE_SOURCE_IDENTITY_INVALID");
  }
  validateRetrievalChunkMetadata(item.source_metadata);
  if (typeof item.source_metadata.title !== "string" || !item.source_metadata.title || item.source_metadata.title.length > 512 ||
      typeof item.source_metadata.sensitivity !== "string" || !SENSITIVITY_LEVELS.has(item.source_metadata.sensitivity) ||
      item.source_metadata.authoritative !== true) throw new TypeError("GKX_RETRIEVAL_CANDIDATE_SOURCE_METADATA_INVALID");
  if (item.assertion_time !== null && !normalizedTimestamp(item.assertion_time)) throw new TypeError("GKX_RETRIEVAL_CANDIDATE_ASSERTION_INVALID");
  if ((item.assertion_time === null) !== (item.assertion_origin === null) ||
      (item.assertion_origin !== null && item.assertion_origin !== "gkx_created_at") ||
      (item.assertion_time === null ? item.source_metadata.authored_at !== undefined : item.source_metadata.authored_at !== item.assertion_time)) {
    throw new TypeError("GKX_RETRIEVAL_CANDIDATE_ASSERTION_INVALID");
  }
  if (item.valid_from !== null && !normalizedTimestamp(item.valid_from)) throw new TypeError("GKX_RETRIEVAL_CANDIDATE_VALIDITY_INVALID");
  if (!Object.hasOwn(VALIDITY_REASONS, item.validity_origin) ||
      (item.valid_from === null) !== (item.validity_origin === "unknown") ||
      (item.validity_origin === "gkx_authored_timestamp" && (item.assertion_time === null || item.valid_from !== item.assertion_time)) ||
      (item.assertion_time !== null && item.valid_from !== null && (item.validity_origin !== "gkx_authored_timestamp" || item.valid_from !== item.assertion_time))) {
    throw new TypeError("GKX_RETRIEVAL_CANDIDATE_VALIDITY_INVALID");
  }
  sortedUniqueStrings(item.reason_codes, "GKX_RETRIEVAL_CANDIDATE_REASONS_INVALID");
  const expectedReasons = new Set([
    "LEDGER_BINDING_UNAVAILABLE",
    "LINEAGE_ID_UNAVAILABLE",
    VALIDITY_REASONS[item.validity_origin],
    ...(item.assertion_time === null ? ["ASSERTION_TIME_UNAVAILABLE"] : []),
  ]);
  if (expectedReasons.size !== item.reason_codes.length || item.reason_codes.some((reason) => !expectedReasons.has(reason))) {
    throw new TypeError("GKX_RETRIEVAL_CANDIDATE_REASONS_INVALID");
  }
  const { candidate_digest: _digest, ...base } = item;
  if (retrievalCanonicalDigest(base) !== item.candidate_digest) throw new TypeError("GKX_RETRIEVAL_CANDIDATE_DIGEST_MISMATCH");
}

export interface GkxRetrievalCandidateResolutionTier {
  basis: GkxCanonicalResolutionBasis;
  candidate_record_keys: string[];
}

/** Parser-owned declaration receipt persisted only in the trusted host store. */
export interface GkxRetrievalCandidateDeclaration {
  source_record_key: string;
  category: "lineage" | "relationship" | "link";
  field: string;
  origin: GkxOrigin;
  declaration_index: number;
  raw_reference: string;
  resolution_tiers: GkxRetrievalCandidateResolutionTier[];
}

/** Internal physical chunk. Public chunk identity is nested and may collide before scoping. */
export interface GkxRetrievalCandidateChunk {
  candidate_chunk_key: string;
  record_key: string;
  parent_candidate_chunk_key: string | null;
  chunk: RetrievalChunk;
}

export interface GkxRetrievalCandidateVector {
  candidate_chunk_key: string;
  vector: readonly number[];
}

export function validateGkxRetrievalCandidateDeclaration(value: unknown): asserts value is GkxRetrievalCandidateDeclaration {
  exactPlainRecord(value, DECLARATION_FIELDS, "GKX_RETRIEVAL_CANDIDATE_DECLARATION_INVALID");
  const item = value as unknown as GkxRetrievalCandidateDeclaration;
  const categoryShapeValid = item.category === "lineage"
    ? (item.field === "supersedes" || item.field === "superseded_by") && item.origin !== "proposed"
    : item.category === "relationship"
      ? item.field.startsWith("relationships.") && isGkx23RelationType(item.field.slice("relationships.".length)) &&
        item.field !== "relationships.supersedes" && item.field !== "relationships.superseded_by" && item.origin !== "proposed"
      : item.category === "link"
        ? (item.field === "links.wikilink" || item.field === "links.markdown" || item.field === "links.property") && item.origin === "authored"
        : false;
  if (!RECORD_KEY_RE.test(item.source_record_key) || !categoryShapeValid ||
      typeof item.field !== "string" || !item.field || item.field.length > 128 || CONTROL_RE.test(item.field) ||
      !ORIGINS.has(item.origin) || !Number.isSafeInteger(item.declaration_index) || item.declaration_index < 0 ||
      typeof item.raw_reference !== "string" || !item.raw_reference || item.raw_reference.length > 512 ||
      item.raw_reference !== item.raw_reference.trim() || CONTROL_RE.test(item.raw_reference)) {
    throw new TypeError("GKX_RETRIEVAL_CANDIDATE_DECLARATION_INVALID");
  }
  const tiers = denseArray(item.resolution_tiers, "GKX_RETRIEVAL_CANDIDATE_DECLARATION_INVALID");
  const expectedBases = item.category === "link"
    ? ["path_exact", "path_relative", "path_without_extension_exact", "path_without_extension_relative", "alias", "basename_title"]
    : ["uid_exact", "path_exact", "path_without_extension_exact", "basename_title", "alias"];
  if (tiers.length !== expectedBases.length) throw new TypeError("GKX_RETRIEVAL_CANDIDATE_DECLARATION_INVALID");
  const bases = new Set<string>();
  for (const [index, tier] of tiers.entries()) {
    exactPlainRecord(tier, TIER_FIELDS, "GKX_RETRIEVAL_CANDIDATE_DECLARATION_INVALID");
    const record = tier as unknown as GkxRetrievalCandidateResolutionTier;
    if (record.basis !== expectedBases[index] || bases.has(record.basis)) {
      throw new TypeError("GKX_RETRIEVAL_CANDIDATE_DECLARATION_INVALID");
    }
    bases.add(record.basis);
    sortedUniqueStrings(record.candidate_record_keys, "GKX_RETRIEVAL_CANDIDATE_DECLARATION_INVALID");
    if (record.candidate_record_keys.some((key) => !RECORD_KEY_RE.test(key))) throw new TypeError("GKX_RETRIEVAL_CANDIDATE_DECLARATION_INVALID");
  }
}

export function validateGkxRetrievalCandidateChunk(value: unknown): asserts value is GkxRetrievalCandidateChunk {
  exactPlainRecord(value, CANDIDATE_CHUNK_FIELDS, "GKX_RETRIEVAL_CANDIDATE_CHUNK_INVALID");
  const item = value as unknown as GkxRetrievalCandidateChunk;
  if (!CANDIDATE_CHUNK_KEY_RE.test(item.candidate_chunk_key) || !RECORD_KEY_RE.test(item.record_key) ||
      (item.parent_candidate_chunk_key !== null && !CANDIDATE_CHUNK_KEY_RE.test(item.parent_candidate_chunk_key))) {
    throw new TypeError("GKX_RETRIEVAL_CANDIDATE_CHUNK_INVALID");
  }
  validateRetrievalChunk(item.chunk);
  if (item.chunk.valid_to !== null || item.chunk.lineage_id !== null || item.chunk.supersedes.length !== 0 || item.chunk.superseded_by.length !== 0 ||
      gkxRetrievalCandidateChunkKey(item.record_key, item.chunk.chunk_id) !== item.candidate_chunk_key) {
    throw new TypeError("GKX_RETRIEVAL_CANDIDATE_CHUNK_BINDING_INVALID");
  }
}

export function validateGkxRetrievalCandidateVector(value: unknown): asserts value is GkxRetrievalCandidateVector {
  exactPlainRecord(value, ["candidate_chunk_key", "vector"], "GKX_RETRIEVAL_CANDIDATE_VECTOR_INVALID");
  const item = value as unknown as GkxRetrievalCandidateVector;
  const vector = denseArray(item.vector, "GKX_RETRIEVAL_CANDIDATE_VECTOR_INVALID");
  if (!CANDIDATE_CHUNK_KEY_RE.test(item.candidate_chunk_key) || vector.some((part) => typeof part !== "number" || !Number.isFinite(part))) {
    throw new TypeError("GKX_RETRIEVAL_CANDIDATE_VECTOR_INVALID");
  }
}

export function gkxRetrievalCandidateChunkKey(recordKey: string, chunkId: string): string {
  return `gkx-candidate-chunk:${retrievalCanonicalDigest({ record_key: recordKey, chunk_id: chunkId }).slice("sha256:".length)}`;
}

export function bindGkxRetrievalCandidateChunks(
  recordKey: string,
  chunks: readonly RetrievalChunk[],
): GkxRetrievalCandidateChunk[] {
  const byPublicId = new Map(chunks.map((chunk) => [chunk.chunk_id, gkxRetrievalCandidateChunkKey(recordKey, chunk.chunk_id)]));
  if (byPublicId.size !== chunks.length) throw new Error("GKX_CANDIDATE_CHUNK_PUBLIC_ID_DUPLICATE");
  return chunks.map((chunk) => ({
    candidate_chunk_key: byPublicId.get(chunk.chunk_id)!,
    record_key: recordKey,
    parent_candidate_chunk_key: chunk.parent_chunk_id ? byPublicId.get(chunk.parent_chunk_id) ?? null : null,
    chunk,
  }));
}

export function gkxRetrievalCandidateDeclarationDigest(value: GkxRetrievalCandidateDeclaration): string {
  validateGkxRetrievalCandidateDeclaration(value);
  return retrievalCanonicalDigest(value);
}
