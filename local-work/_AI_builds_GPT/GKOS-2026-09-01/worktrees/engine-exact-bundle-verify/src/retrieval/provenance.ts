import { isValidGkxAuthoredUid } from "../gkx23";
import { computeTemporalState, projectAtTime } from "../temporal";
import type { LineageModel } from "../types";
import { isValidGkxTimestamp } from "../timestamps";
import { types as utilTypes } from "node:util";
import { RETRIEVAL_PROVENANCE_CONTRACT_VERSION } from "./contracts";
import { isValidRetrievalSourcePath, validateRetrievalChunkMetadata } from "./chunker";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, stableJson } from "./digest";
import type {
  GkxRetrievalProvenance,
  GkxRetrievalAuthorizedTemporalSource,
  GkxRetrievalAuthorizedTemporalView,
  GkxRetrievalStoredSourceProvenance,
  GkxRetrievalTemporalState,
  GkxRetrievalValidityOrigin,
  RetrievalChunk,
} from "./types";

const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const NORMALIZED_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const REASON_CODE_RE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;
const PUBLIC_REASON_CODES = new Set([
  "ASSERTION_TIME_UNAVAILABLE",
  "LEDGER_BINDING_UNAVAILABLE",
  "LINEAGE_ID_UNAVAILABLE",
  "VALIDITY_FROM_GKX_AUTHORED_TIMESTAMP",
  "VALIDITY_FROM_PROJECTION_REFERENCE_TIME",
  "VALIDITY_FROM_SOURCE_CREATED_TIME",
  "VALIDITY_FROM_SOURCE_MODIFIED_TIME",
  "VALIDITY_UNKNOWN",
]);
const VALIDITY_REASON_BY_ORIGIN: Readonly<Record<GkxRetrievalValidityOrigin, string>> = {
  gkx_authored_timestamp: "VALIDITY_FROM_GKX_AUTHORED_TIMESTAMP",
  source_created_time: "VALIDITY_FROM_SOURCE_CREATED_TIME",
  source_modified_time: "VALIDITY_FROM_SOURCE_MODIFIED_TIME",
  projection_reference_time: "VALIDITY_FROM_PROJECTION_REFERENCE_TIME",
  unknown: "VALIDITY_UNKNOWN",
};
const STORED_FIELDS = [
  "assertion_origin", "assertion_time", "authored_superseded_by", "authored_supersedes",
  "contract_version", "ledger_binding_verified", "lineage_id", "lineage_neutral",
  "provenance_digest", "reason_codes", "resolved_superseded_by", "resolved_supersedes",
  "source_digest", "source_id", "source_metadata", "source_path", "temporal_state", "valid_from", "valid_to",
  "validity_origin",
].sort(retrievalCodeUnitCompare);
const STORED_INPUT_FIELDS = STORED_FIELDS.filter((field) => field !== "contract_version" && field !== "provenance_digest");

const VALIDITY_ORIGINS = new Set<GkxRetrievalValidityOrigin>([
  "gkx_authored_timestamp",
  "source_created_time",
  "source_modified_time",
  "projection_reference_time",
  "unknown",
]);
const TEMPORAL_STATES = new Set<GkxRetrievalTemporalState>(["current", "historical", "unknown"]);
const SENSITIVITY_LEVELS = new Set(["public", "internal", "restricted", "confidential", "regulated", "phi", "secret"]);

function isNormalizedRetrievalTimestamp(value: string): boolean {
  if (!NORMALIZED_UTC_RE.test(value)) return false;
  try {
    return normalizeRetrievalAsOf(value) === value;
  } catch {
    return false;
  }
}

function exactPlainRecord(value: unknown, fields: readonly string[], code: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || utilTypes.isProxy(value) || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError(code);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string") ||
      (keys as string[]).sort(retrievalCodeUnitCompare).join("\0") !== [...fields].sort(retrievalCodeUnitCompare).join("\0")) throw new TypeError(code);
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor) || descriptor.value === undefined) throw new TypeError(code);
  }
}

function sortedUniqueStrings(value: unknown, code: string, canonicalUids = false): asserts value is string[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) throw new TypeError(code);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key))) || Object.keys(value).length !== value.length) throw new TypeError(code);
  const items: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor) || typeof descriptor.value !== "string" || !descriptor.value || descriptor.value.length > 512 || CONTROL_RE.test(descriptor.value)) throw new TypeError(code);
    items.push(descriptor.value);
  }
  if (canonicalUids && items.some((item) => !isValidGkxAuthoredUid(item))) throw new TypeError(code);
  if (new Set(items).size !== items.length || [...items].sort(retrievalCodeUnitCompare).join("\0") !== items.join("\0")) throw new TypeError(code);
}

function digestStoredProvenance(value: Omit<GkxRetrievalStoredSourceProvenance, "provenance_digest">): string {
  return retrievalCanonicalDigest(value);
}

export function sealGkxRetrievalStoredSourceProvenance(
  value: Omit<GkxRetrievalStoredSourceProvenance, "contract_version" | "provenance_digest">,
): GkxRetrievalStoredSourceProvenance {
  exactPlainRecord(value, STORED_INPUT_FIELDS, "GKX_RETRIEVAL_PROVENANCE_INPUT_INVALID");
  // stableJson performs recursive descriptor/proxy/cycle/JSON-data-model
  // validation before any caller-owned nested value is read. Parsing those
  // canonical bytes yields a fresh inert clone for sealing and publication.
  const inert = JSON.parse(stableJson(value)) as Omit<GkxRetrievalStoredSourceProvenance, "contract_version" | "provenance_digest">;
  const base = { contract_version: RETRIEVAL_PROVENANCE_CONTRACT_VERSION, ...inert };
  const sealed = { ...base, provenance_digest: digestStoredProvenance(base) };
  validateGkxRetrievalStoredSourceProvenance(sealed);
  return sealed;
}

export function validateGkxRetrievalStoredSourceProvenance(
  value: unknown,
): asserts value is GkxRetrievalStoredSourceProvenance {
  exactPlainRecord(value, STORED_FIELDS, "GKX_RETRIEVAL_PROVENANCE_INVALID");
  const item = value as unknown as GkxRetrievalStoredSourceProvenance;
  try { stableJson(item); } catch { throw new TypeError("GKX_RETRIEVAL_PROVENANCE_INVALID_JSON"); }
  if (item.contract_version !== RETRIEVAL_PROVENANCE_CONTRACT_VERSION ||
      !isValidGkxAuthoredUid(item.source_id) || typeof item.source_path !== "string" || !isValidRetrievalSourcePath(item.source_path) || item.source_path.length > 4096 ||
      !SHA256_RE.test(item.source_digest) || !SHA256_RE.test(item.provenance_digest)) throw new TypeError("GKX_RETRIEVAL_PROVENANCE_IDENTITY_INVALID");
  validateRetrievalChunkMetadata(item.source_metadata);
  if (typeof item.source_metadata.title !== "string" || !item.source_metadata.title || item.source_metadata.title.length > 512 ||
      typeof item.source_metadata.sensitivity !== "string" || !SENSITIVITY_LEVELS.has(item.source_metadata.sensitivity) ||
      item.source_metadata.authoritative !== true) throw new TypeError("GKX_RETRIEVAL_SOURCE_METADATA_REQUIRED_FIELDS_INVALID");
  if (item.assertion_time !== null && (typeof item.assertion_time !== "string" || !isNormalizedRetrievalTimestamp(item.assertion_time))) throw new TypeError("GKX_RETRIEVAL_ASSERTION_TIME_INVALID");
  if ((item.assertion_time === null) !== (item.assertion_origin === null) ||
      (item.assertion_origin !== null && item.assertion_origin !== "gkx_created_at")) throw new TypeError("GKX_RETRIEVAL_ASSERTION_ORIGIN_INVALID");
  if ((item.assertion_time === null && item.source_metadata.authored_at !== undefined) ||
      (item.assertion_time !== null && item.source_metadata.authored_at !== item.assertion_time)) {
    throw new TypeError("GKX_RETRIEVAL_SOURCE_METADATA_ASSERTION_TIME_MISMATCH");
  }
  if (item.valid_from !== null && (typeof item.valid_from !== "string" || !isNormalizedRetrievalTimestamp(item.valid_from))) throw new TypeError("GKX_RETRIEVAL_VALID_FROM_INVALID");
  if (item.valid_to !== null && (typeof item.valid_to !== "string" || !isNormalizedRetrievalTimestamp(item.valid_to))) throw new TypeError("GKX_RETRIEVAL_VALID_TO_INVALID");
  if (item.valid_from === null && item.valid_to !== null) throw new TypeError("GKX_RETRIEVAL_VALIDITY_INTERVAL_INVALID");
  if (item.valid_from !== null && item.valid_to !== null && Date.parse(item.valid_to) < Date.parse(item.valid_from)) throw new TypeError("GKX_RETRIEVAL_VALIDITY_INTERVAL_INVALID");
  if ((item.validity_origin === "gkx_authored_timestamp" &&
       (item.assertion_time === null || item.valid_from === null || item.valid_from !== item.assertion_time)) ||
      (item.assertion_time !== null && item.valid_from !== null &&
       (item.validity_origin !== "gkx_authored_timestamp" || item.valid_from !== item.assertion_time))) {
    throw new TypeError("GKX_RETRIEVAL_ASSERTION_VALIDITY_BINDING_INVALID");
  }
  if (!VALIDITY_ORIGINS.has(item.validity_origin) || !TEMPORAL_STATES.has(item.temporal_state)) throw new TypeError("GKX_RETRIEVAL_TEMPORAL_STATE_INVALID");
  if (item.valid_from === null && (item.validity_origin !== "unknown" || item.temporal_state !== "unknown")) throw new TypeError("GKX_RETRIEVAL_UNKNOWN_VALIDITY_INVALID");
  if (item.valid_from !== null && (item.validity_origin === "unknown" || item.temporal_state === "unknown")) throw new TypeError("GKX_RETRIEVAL_KNOWN_VALIDITY_INVALID");
  if (item.valid_to === null && item.valid_from !== null && item.temporal_state !== "current") throw new TypeError("GKX_RETRIEVAL_TEMPORAL_STATE_INVALID");
  if (item.valid_to !== null && item.temporal_state !== "historical") throw new TypeError("GKX_RETRIEVAL_TEMPORAL_STATE_INVALID");
  // The pinned Standard profile has no canonical serialized lineage-id field.
  // Keep the envelope slot nullable for future versioning, but do not permit a
  // derived host to mint identity in this contract coordinate.
  if (item.lineage_id !== null) throw new TypeError("GKX_RETRIEVAL_LINEAGE_ID_UNAVAILABLE");
  sortedUniqueStrings(item.authored_supersedes, "GKX_RETRIEVAL_AUTHORED_SUPERSEDES_INVALID");
  sortedUniqueStrings(item.authored_superseded_by, "GKX_RETRIEVAL_AUTHORED_SUPERSEDED_BY_INVALID");
  sortedUniqueStrings(item.resolved_supersedes, "GKX_RETRIEVAL_RESOLVED_SUPERSEDES_INVALID", true);
  sortedUniqueStrings(item.resolved_superseded_by, "GKX_RETRIEVAL_RESOLVED_SUPERSEDED_BY_INVALID", true);
  sortedUniqueStrings(item.reason_codes, "GKX_RETRIEVAL_PROVENANCE_REASONS_INVALID");
  if (item.reason_codes.some((code) => !REASON_CODE_RE.test(code))) throw new TypeError("GKX_RETRIEVAL_PROVENANCE_REASONS_INVALID");
  const neutral = item.authored_supersedes.length === 0 && item.authored_superseded_by.length === 0 &&
    item.resolved_supersedes.length === 0 && item.resolved_superseded_by.length === 0;
  if (typeof item.lineage_neutral !== "boolean" || item.lineage_neutral !== neutral || item.ledger_binding_verified !== false) throw new TypeError("GKX_RETRIEVAL_PROVENANCE_FLAGS_INVALID");
  const expectedReasons = new Set<string>([
    "LEDGER_BINDING_UNAVAILABLE",
    "LINEAGE_ID_UNAVAILABLE",
    VALIDITY_REASON_BY_ORIGIN[item.validity_origin],
    neutral ? "LINEAGE_NEUTRAL" : "LINEAGE_PARTICIPANT",
    ...(item.assertion_time === null ? ["ASSERTION_TIME_UNAVAILABLE"] : []),
  ]);
  if (expectedReasons.size !== item.reason_codes.length || item.reason_codes.some((code) => !expectedReasons.has(code))) {
    throw new TypeError("GKX_RETRIEVAL_PROVENANCE_REASONS_INVALID");
  }
  const { provenance_digest: _digest, ...base } = item;
  if (digestStoredProvenance(base) !== item.provenance_digest) throw new TypeError("GKX_RETRIEVAL_PROVENANCE_DIGEST_MISMATCH");
}

/** Exact current Engine/GKX timestamp grammar, normalized to UTC for results. */
export function normalizeRetrievalAsOf(value: string): string {
  if (typeof value !== "string" || !isValidGkxTimestamp(value)) throw new TypeError("RETRIEVAL_AS_OF_INVALID");
  const normalized = new Date(Date.parse(value)).toISOString();
  // GKX input retains the existing four-digit-year grammar, but an offset at
  // either boundary can normalize into an ECMAScript extended year. Draft.2
  // result/stored schemas deliberately expose only four-digit UTC years.
  if (!NORMALIZED_UTC_RE.test(normalized)) throw new TypeError("RETRIEVAL_AS_OF_INVALID");
  return normalized;
}

/** Half-open canonical interval test. Null validity is unknown, never all-time. */
export function retrievalSourceValidAt(
  source: Readonly<GkxRetrievalStoredSourceProvenance>,
  normalizedAsOf: string,
): boolean {
  if (source.valid_from === null) return false;
  const at = Date.parse(normalizedAsOf);
  return projectAtTime([{
    id: source.source_id,
    validAtMs: Date.parse(source.valid_from),
    invalidAtMs: source.valid_to === null ? null : Date.parse(source.valid_to),
  }], at).valid.includes(source.source_id);
}

/** Canonical corpus temporal selection delegated to the existing GKX projector. */
export function projectRetrievalSourcesAtTime(
  sources: readonly GkxRetrievalStoredSourceProvenance[],
  normalizedAsOf: string,
): { valid: string[]; historical: string[]; future: string[]; unknown: string[] } {
  const known = sources.filter((source) => source.valid_from !== null);
  const projected = projectAtTime(known.map((source) => ({
    id: source.source_id,
    validAtMs: Date.parse(source.valid_from!),
    invalidAtMs: source.valid_to === null ? null : Date.parse(source.valid_to),
  })), Date.parse(normalizedAsOf));
  return {
    valid: [...projected.valid].sort(retrievalCodeUnitCompare),
    historical: [...projected.superseded].sort(retrievalCodeUnitCompare),
    future: [...projected.notYetCreated].sort(retrievalCodeUnitCompare),
    unknown: sources.filter((source) => source.valid_from === null).map((source) => source.source_id).sort(retrievalCodeUnitCompare),
  };
}

/**
 * Build the policy/filter/time-scoped view from canonical resolved edges only.
 * Restriction can suppress an edge but can never resolve or create one.
 */
export function buildAuthorizedGkxRetrievalTemporalView(
  sources: readonly GkxRetrievalStoredSourceProvenance[],
  normalizedAsOf: string | null,
): GkxRetrievalAuthorizedTemporalView {
  const byId = new Map<string, GkxRetrievalStoredSourceProvenance>();
  for (const source of sources) {
    validateGkxRetrievalStoredSourceProvenance(source);
    if (byId.has(source.source_id)) throw new Error("GKX_RETRIEVAL_AUTHORIZED_TEMPORAL_DUPLICATE_SOURCE");
    byId.set(source.source_id, source);
  }
  for (const source of sources) {
    for (const older of source.resolved_supersedes) {
      const endpoint = byId.get(older);
      // The authorized view receives a policy/filter-restricted subset. An
      // absent endpoint is suppressed, not evidence of corruption. If both
      // endpoints are visible, however, their canonical inverse must agree.
      if (endpoint && !endpoint.resolved_superseded_by.includes(source.source_id)) throw new Error("GKX_RETRIEVAL_CANONICAL_LINEAGE_INVERSE_MISMATCH");
    }
    for (const newer of source.resolved_superseded_by) {
      const endpoint = byId.get(newer);
      if (endpoint && !endpoint.resolved_supersedes.includes(source.source_id)) throw new Error("GKX_RETRIEVAL_CANONICAL_LINEAGE_INVERSE_MISMATCH");
    }
  }
  const at = normalizedAsOf === null ? null : Date.parse(normalizeRetrievalAsOf(normalizedAsOf));
  if (normalizedAsOf !== null && normalizeRetrievalAsOf(normalizedAsOf) !== normalizedAsOf) throw new Error("GKX_RETRIEVAL_AUTHORIZED_TEMPORAL_AS_OF_NOT_NORMALIZED");
  // Future and unknown sources cannot influence an as_of projection, including
  // predecessor invalidAt. Without as_of, every known authorized source is in
  // scope and unknown sources remain searchable but honestly unclassified.
  const knownVisible = sources.filter((source) => source.valid_from !== null && (at === null || Date.parse(source.valid_from) <= at));
  const visibleIds = new Set(knownVisible.map((source) => source.source_id));
  const supersedes = new Map<string, string[]>();
  const supersededBy = new Map<string, string[]>();
  const edges: Array<{ newer: string; older: string }> = [];
  const edgeKeys = new Set<string>();
  for (const source of knownVisible) {
    for (const older of source.resolved_supersedes) {
      if (!visibleIds.has(older)) continue;
      const key = `${source.source_id}\0${older}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({ newer: source.source_id, older });
      supersedes.set(source.source_id, [...(supersedes.get(source.source_id) ?? []), older]);
      supersededBy.set(older, [...(supersededBy.get(older) ?? []), source.source_id]);
    }
  }
  for (const values of [...supersedes.values(), ...supersededBy.values()]) values.sort(retrievalCodeUnitCompare);
  edges.sort((left, right) => retrievalCodeUnitCompare(left.newer, right.newer) || retrievalCodeUnitCompare(left.older, right.older));
  const lineage: LineageModel = {
    edges,
    supersedes,
    supersededBy,
    warnings: [],
    members: new Set(edges.flatMap((edge) => [edge.newer, edge.older])),
    cycles: 0,
  };
  const temporal = computeTemporalState(knownVisible.map((source) => ({ source, validAtMs: Date.parse(source.valid_from!) }))
    .map(({ source, validAtMs }) => ({ id: source.source_id, validAtMs })), lineage);
  const projected = at === null ? null : projectAtTime(knownVisible.map((source) => ({
    id: source.source_id,
    validAtMs: Date.parse(source.valid_from!),
    invalidAtMs: temporal.invalidAt.get(source.source_id) ?? null,
  })), at);
  const eligible = new Set(at === null ? sources.map((source) => source.source_id) : projected!.valid);
  const rows: GkxRetrievalAuthorizedTemporalSource[] = sources.map((source): GkxRetrievalAuthorizedTemporalSource => {
    if (source.valid_from === null) return { source_id: source.source_id, valid_from: null, valid_to: null, temporal_state: "unknown", supersedes: [], superseded_by: [] };
    if (!visibleIds.has(source.source_id)) return { source_id: source.source_id, valid_from: source.valid_from, valid_to: null, temporal_state: "future", supersedes: [], superseded_by: [] };
    const invalidAt = temporal.invalidAt.get(source.source_id) ?? null;
    return {
      source_id: source.source_id,
      valid_from: source.valid_from,
      valid_to: invalidAt === null ? null : new Date(invalidAt).toISOString(),
      temporal_state: invalidAt === null ? "current" : "historical",
      supersedes: [...(supersedes.get(source.source_id) ?? [])],
      superseded_by: [...(supersededBy.get(source.source_id) ?? [])],
    };
  }).sort((left, right) => retrievalCodeUnitCompare(left.source_id, right.source_id));
  return {
    sources: rows,
    eligible_source_ids: [...eligible].sort(retrievalCodeUnitCompare),
    authorized_source_count: sources.length,
    // Coverage is about whether every authorized source has a canonical
    // interval, not whether it was already created at the requested instant.
    // A fully known corpus can honestly answer "nothing existed yet".
    answerable_source_count: sources.filter((source) => source.valid_from !== null).length,
  };
}

/**
 * Whole-projection integrity check. Unlike an authorization-scoped view, a
 * persisted canonical projection must contain both endpoints of every resolved
 * relationship and both inverse declarations.
 */
export function validateGkxRetrievalCanonicalSourceSet(
  sources: readonly GkxRetrievalStoredSourceProvenance[],
): void {
  const byId = new Map<string, GkxRetrievalStoredSourceProvenance>();
  for (const source of sources) {
    validateGkxRetrievalStoredSourceProvenance(source);
    if (byId.has(source.source_id)) throw new Error("GKX_RETRIEVAL_CANONICAL_DUPLICATE_SOURCE");
    byId.set(source.source_id, source);
  }
  for (const source of sources) {
    for (const older of source.resolved_supersedes) {
      if (!byId.get(older)?.resolved_superseded_by.includes(source.source_id)) throw new Error("GKX_RETRIEVAL_CANONICAL_LINEAGE_INVERSE_MISMATCH");
    }
    for (const newer of source.resolved_superseded_by) {
      if (!byId.get(newer)?.resolved_supersedes.includes(source.source_id)) throw new Error("GKX_RETRIEVAL_CANONICAL_LINEAGE_INVERSE_MISMATCH");
    }
  }
}

export function buildGkxRetrievalProvenance(
  stored: Readonly<GkxRetrievalStoredSourceProvenance>,
  chunk: Readonly<RetrievalChunk>,
  authorizedTemporal: Readonly<GkxRetrievalAuthorizedTemporalSource>,
  normalizedAsOf: string | null,
): GkxRetrievalProvenance {
  validateGkxRetrievalStoredSourceProvenance(stored);
  if (stored.source_id !== chunk.source_id || stored.source_path !== chunk.source_path || stored.source_digest !== chunk.source_digest ||
      stored.valid_from !== chunk.valid_from || stored.valid_to !== chunk.valid_to || stored.lineage_id !== chunk.lineage_id ||
      stableJson(stored.resolved_supersedes) !== stableJson(chunk.supersedes) || stableJson(stored.resolved_superseded_by) !== stableJson(chunk.superseded_by)) {
    throw new Error("GKX_RETRIEVAL_PROVENANCE_CHUNK_MISMATCH");
  }
  if (authorizedTemporal.source_id !== stored.source_id || authorizedTemporal.valid_from !== stored.valid_from ||
      (authorizedTemporal.temporal_state !== "unknown" && authorizedTemporal.temporal_state !== "current" && authorizedTemporal.temporal_state !== "historical")) {
    throw new Error("GKX_RETRIEVAL_AUTHORIZED_TEMPORAL_BINDING_MISMATCH");
  }
  const resolvedSupersedes = [...authorizedTemporal.supersedes];
  const resolvedSupersededBy = [...authorizedTemporal.superseded_by];
  if (resolvedSupersedes.some((id) => !stored.resolved_supersedes.includes(id)) ||
      resolvedSupersededBy.some((id) => !stored.resolved_superseded_by.includes(id))) {
    throw new Error("GKX_RETRIEVAL_AUTHORIZED_TEMPORAL_ENDPOINT_BINDING_MISMATCH");
  }
  const reasonCodes = stored.reason_codes.filter((code) => PUBLIC_REASON_CODES.has(code));
  reasonCodes.push("LINEAGE_VIEW_AUTHORIZED_ONLY");
  const visibleLineageNeutral = resolvedSupersedes.length === 0 && resolvedSupersededBy.length === 0;
  reasonCodes.push(visibleLineageNeutral ? "LINEAGE_NEUTRAL" : "LINEAGE_PARTICIPANT");
  if (normalizedAsOf !== null) {
    if (normalizeRetrievalAsOf(normalizedAsOf) !== normalizedAsOf || authorizedTemporal.valid_from === null ||
        !projectAtTime([{
          id: stored.source_id,
          validAtMs: Date.parse(authorizedTemporal.valid_from),
          invalidAtMs: authorizedTemporal.valid_to === null ? null : Date.parse(authorizedTemporal.valid_to),
        }], Date.parse(normalizedAsOf)).valid.includes(stored.source_id)) {
      throw new Error("GKX_RETRIEVAL_PROVENANCE_TEMPORAL_SELECTION_INVALID");
    }
    reasonCodes.push("TEMPORAL_SELECTION_AS_OF");
  }
  const base: Omit<GkxRetrievalProvenance, "provenance_digest"> = {
    contract_version: RETRIEVAL_PROVENANCE_CONTRACT_VERSION,
    source_id: stored.source_id,
    source_path: stored.source_path,
    source_digest: stored.source_digest,
    assertion_time: stored.assertion_time,
    assertion_origin: stored.assertion_origin,
    valid_from: authorizedTemporal.valid_from,
    valid_to: authorizedTemporal.valid_to,
    validity_origin: stored.validity_origin,
    lineage_id: stored.lineage_id,
    supersedes: resolvedSupersedes,
    superseded_by: resolvedSupersededBy,
    temporal_state: authorizedTemporal.temporal_state,
    ledger_binding_verified: false,
    lineage_neutral: visibleLineageNeutral,
    reason_codes: [...new Set(reasonCodes)].sort(retrievalCodeUnitCompare),
    assertion: {
      chunk_id: chunk.chunk_id,
      content_digest: chunk.content_digest,
    },
    interval_semantics: "[valid_from,valid_to)",
  };
  return { ...base, provenance_digest: retrievalCanonicalDigest(base) };
}
