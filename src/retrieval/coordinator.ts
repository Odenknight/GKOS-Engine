import { lstat, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { isValidRetrievalSourcePath, retrievalLineCoordinates } from "./chunker";
import { RETRIEVAL_CONTRACT_VERSION, RETRIEVAL_LINEAGE_CONTRACT_VERSION, RETRIEVAL_MAX_RESULT_BYTES, RETRIEVAL_MMR_DEFAULT_LAMBDA, RETRIEVAL_PARENT_EXPANSION_MAX_CHILD_TOKENS, RETRIEVAL_RRF_DEFAULT_K } from "./contracts";
import { assessRetrievalConfidence } from "./confidence";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, retrievalSha256, stableJson } from "./digest";
import { appliedFilterNames, matchesRetrievalFilters, validateRetrievalFilters } from "./filters";
import { maximalMarginalRelevance, reciprocalRankFusion } from "./fusion";
import type { RankedInput } from "./fusion";
import { lexicalCitationSpans, lexicalQueryClauses } from "./lexical";
import { canonicalPath, canonicalPathContains } from "./path-security";
import { buildGkxRetrievalProvenance, normalizeRetrievalAsOf } from "./provenance";
import { buildGkxRetrievalAuthorizedCandidateView } from "./authorized-view";
import { buildGkxRetrievalGenerationWithWriter, buildRetrievalGenerationWithWriter, type BuiltRetrievalGeneration, type GkxRetrievalGenerationInput, type RetrievalGenerationInput, isGkxRetrievalProjectionManifest, openActiveRetrievalStore, preflightGkxRetrievalIndexInput, preflightRetrievalIndexInput, SqliteRetrievalStore } from "./sqlite-store";
import { openIngestAwareActiveRetrievalStore } from "../ingest/storage";
import {
  acquireLegacyRetrievalWriter,
  legacyRetrievalWriterIsHeld,
  releaseLegacyRetrievalWriter,
  type LegacyRetrievalWriterCapability,
} from "./state-writer-lock";
import type { GkxRetrievalCandidateSource } from "./candidate-types";
import type {
  DiscoverabilityDecision,
  DiscoverabilityPolicy,
  GkxRetrievalAuthorizedTemporalSource,
  GkxRetrievalHit,
  GkxRetrievalProvenance,
  GkxRetrievalProjectionManifest,
  GkxRetrievalStoredSourceProvenance,
  RerankProvider,
  RetrievalChunk,
  RetrievalConfidence,
  RetrievalHit,
  RetrievalParentContext,
  RetrievalProviderStageStatus,
  RetrievalSearchRequest,
  RetrievalSearchResult,
  RetrievalStageScores,
  RetrievalSourcePolicyRecord,
  SourceDiscoverabilityPolicy,
  SourceCitation,
  VectorProvider,
} from "./types";

export interface RetrievalCoordinatorOptions {
  discoverability_policy: DiscoverabilityPolicy;
  /** Required when opening an additive schema-3 lineage projection. */
  source_discoverability_policy?: SourceDiscoverabilityPolicy;
  vector_provider?: VectorProvider;
  rerank_provider?: RerankProvider;
  source_reader: (sourcePath: string) => Promise<Uint8Array>;
  stale?: boolean;
  max_parent_bytes?: number;
  max_result_bytes?: number;
  /** Trusted host evidence for this schema-3 authorized view; absent is unverified. */
  lineage_view_freshness?: "fresh" | "stale" | "unverified";
  /** Trusted identity of the source + chunk policy callbacks for schema 3. */
  runtime_policy_digest?: string;
}

export interface IndexRetrievalResult {
  generation: BuiltRetrievalGeneration;
  vector_stage: RetrievalProviderStageStatus;
}

const VERIFIED_STORE = Symbol("gkos.retrieval.verified-store");
const ACTIVE_STORE_PREFLIGHTS = new WeakMap<object, SqliteRetrievalStore>();

/** Opaque trusted-host capability holding one already verified active store. */
export interface ActiveRetrievalStorePreflight {
  readonly state_directory: string;
}
const SEARCH_REQUEST_FIELDS = new Set([
  "query", "limit", "lexical_top_k", "semantic_top_k", "filters", "rrf_k", "mmr", "mmr_lambda",
  "parent_expansion", "parent_expansion_max_child_tokens", "as_of",
]);

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function validateProviderIdentity(provider: VectorProvider | RerankProvider, family: "vector" | "rerank"): void {
  if (!provider || typeof provider !== "object" || !["openai_compatible", "local_onnx", "mcp"].includes(provider.kind) ||
      typeof provider.provider_id !== "string" || !provider.provider_id || provider.provider_id.length > 512 ||
      /[\u0000-\u001f\u007f]/u.test(provider.provider_id) || hasUnpairedSurrogate(provider.provider_id) ||
      typeof provider.model_id !== "string" || !provider.model_id || provider.model_id.length > 512 ||
      /[\u0000-\u001f\u007f]/u.test(provider.model_id) || hasUnpairedSurrogate(provider.model_id)) {
    throw new TypeError(`${family.toUpperCase()}_PROVIDER_IDENTITY_INVALID`);
  }
  effectiveProviderTimeout(provider);
  if (family === "vector") {
    const vector = provider as VectorProvider;
    if (!Number.isSafeInteger(vector.dimensions) || vector.dimensions < 1 || vector.dimensions > 1_000_000 || typeof vector.embed !== "function") {
      throw new TypeError("VECTOR_PROVIDER_CAPABILITY_INVALID");
    }
  } else if (typeof (provider as RerankProvider).rerank !== "function") {
    throw new TypeError("RERANK_PROVIDER_CAPABILITY_INVALID");
  }
}

function validateCoordinatorOptions(options: RetrievalCoordinatorOptions): void {
  if (typeof options.discoverability_policy !== "function") throw new TypeError("A discoverability policy is required.");
  if (typeof options.source_reader !== "function") throw new TypeError("A source reader is required for exact citation verification.");
  if (options.max_parent_bytes !== undefined && (!Number.isSafeInteger(options.max_parent_bytes) || options.max_parent_bytes < 256 || options.max_parent_bytes > 65_536)) throw new RangeError("max_parent_bytes is invalid.");
  if (options.max_result_bytes !== undefined && (!Number.isSafeInteger(options.max_result_bytes) || options.max_result_bytes < 16_384 || options.max_result_bytes > 1_048_576)) throw new RangeError("max_result_bytes is invalid.");
  if (options.lineage_view_freshness !== undefined && !["fresh", "stale", "unverified"].includes(options.lineage_view_freshness)) {
    throw new TypeError("lineage_view_freshness is invalid.");
  }
  if (options.runtime_policy_digest !== undefined && !/^sha256:[0-9a-f]{64}$/u.test(options.runtime_policy_digest)) {
    throw new TypeError("runtime_policy_digest is invalid.");
  }
  if (options.vector_provider) validateProviderIdentity(options.vector_provider, "vector");
  if (options.rerank_provider) validateProviderIdentity(options.rerank_provider, "rerank");
}

function validateSearchRequest(value: unknown): asserts value is RetrievalSearchRequest {
  if (value === null || Array.isArray(value) || typeof value !== "object" ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError("RETRIEVAL_REQUEST_INVALID:object");
  }
  const request = value as Record<string, unknown>;
  for (const key of Reflect.ownKeys(request)) {
    if (typeof key !== "string" || !SEARCH_REQUEST_FIELDS.has(key)) throw new TypeError("RETRIEVAL_REQUEST_UNKNOWN_FIELD");
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(request, key) : undefined;
    if (!descriptor?.enumerable || !("value" in descriptor) || descriptor.value === undefined) throw new TypeError("RETRIEVAL_REQUEST_INVALID:object");
  }
  if (typeof request.query !== "string") throw new TypeError("RETRIEVAL_REQUEST_INVALID:query");
  if (request.as_of !== undefined && typeof request.as_of !== "string") throw new TypeError("RETRIEVAL_REQUEST_INVALID:as_of");
  if (Buffer.byteLength(request.query, "utf8") > 4096) throw new RangeError("query exceeds 4096 UTF-8 bytes.");
  for (const field of ["limit", "lexical_top_k", "semantic_top_k", "rrf_k", "parent_expansion_max_child_tokens"] as const) {
    if (request[field] !== undefined && !Number.isSafeInteger(request[field])) throw new TypeError(`RETRIEVAL_REQUEST_INVALID:${field}`);
  }
  for (const field of ["mmr", "parent_expansion"] as const) {
    if (request[field] !== undefined && typeof request[field] !== "boolean") throw new TypeError(`RETRIEVAL_REQUEST_INVALID:${field}`);
  }
  if (request.mmr_lambda !== undefined && (typeof request.mmr_lambda !== "number" || !Number.isFinite(request.mmr_lambda))) {
    throw new TypeError("RETRIEVAL_REQUEST_INVALID:mmr_lambda");
  }
  validateRetrievalFilters(request.filters);
  try { stableJson(request); }
  catch { throw new TypeError("RETRIEVAL_REQUEST_INVALID:json"); }
}

function stage(kind: RetrievalProviderStageStatus["kind"], state: RetrievalProviderStageStatus["state"], reasonCodes: string[], provider?: { provider_id: string; model_id: string }): RetrievalProviderStageStatus {
  return { kind, state, ...(provider ? { provider_id: provider.provider_id, model_id: provider.model_id } : {}), reason_codes: [...reasonCodes].sort(retrievalCodeUnitCompare) };
}

interface ResultProjectionCoordinate {
  projection_id: string;
  projection_digest: string;
}

type InternalRetrievalHit = Omit<RetrievalHit, "parent_context"> & {
  provenance?: GkxRetrievalProvenance;
  parent_context?: RetrievalParentContext & { provenance?: GkxRetrievalProvenance };
};

function emptyLineageSearchResult(
  store: SqliteRetrievalStore,
  options: RetrievalCoordinatorOptions,
  query: string,
  normalizedAsOf: string | null,
  filters: RetrievalSearchRequest["filters"],
  reasonCode: "NO_ELIGIBLE_RESULTS" | "TEMPORAL_COVERAGE_INSUFFICIENT",
  coverage: "not_requested" | "not_evaluated" | "sufficient" | "insufficient",
  coordinate: ResultProjectionCoordinate,
  freshness: RetrievalSearchResult["projection_freshness"] = "unverified",
): RetrievalSearchResult {
  const lexical = stage(store.manifest.lexical_backend, "skipped", [reasonCode]);
  const vector = options.vector_provider
    ? stage(options.vector_provider.kind, "skipped", [reasonCode], options.vector_provider)
    : stage("none", "disabled", ["VECTOR_DISABLED"]);
  const reranker = options.rerank_provider
    ? stage(options.rerank_provider.kind, "skipped", [reasonCode], options.rerank_provider)
    : stage("none", "skipped", ["RERANKER_NOT_CONFIGURED"]);
  const reasons = [
    reasonCode,
    ...(freshness === "stale" ? ["STALE_PROJECTION"] : []),
    ...(freshness === "unverified" ? ["PROJECTION_FRESHNESS_UNVERIFIED"] : []),
  ].sort(retrievalCodeUnitCompare);
  return {
    contract_version: RETRIEVAL_LINEAGE_CONTRACT_VERSION,
    query_digest: retrievalCanonicalDigest({ as_of: normalizedAsOf, query }),
    projection_id: coordinate.projection_id,
    projection_digest: coordinate.projection_digest,
    projection_freshness: freshness,
    hits: [],
    confidence: {
      level: "insufficient",
      low_confidence: true,
      reason_codes: reasons,
      lexical_signal: null,
      semantic_signal: null,
      reranker_signal: null,
      coverage_signal: null,
    },
    temporal: {
      as_of: normalizedAsOf,
      coverage,
      reason_codes: coverage === "insufficient" ? ["TEMPORAL_COVERAGE_INSUFFICIENT"] : [],
    },
    applied_filters: appliedFilterNames(filters),
    eligible_result_count: 0,
    stages: { lexical, vector, reranker },
  };
}

function confidenceForProjectionFreshness(
  confidence: RetrievalConfidence,
  freshness: RetrievalSearchResult["projection_freshness"],
): RetrievalConfidence {
  if (freshness !== "unverified") return confidence;
  return {
    ...confidence,
    level: confidence.level === "insufficient" ? "insufficient" : "low",
    low_confidence: true,
    reason_codes: [...new Set([...confidence.reason_codes, "PROJECTION_FRESHNESS_UNVERIFIED"])].sort(retrievalCodeUnitCompare),
  };
}

function allowed(policy: DiscoverabilityPolicy, chunk: RetrievalChunk): boolean {
  let decision: DiscoverabilityDecision;
  try { decision = policy(chunk); }
  catch { decision = "error"; }
  return decision === "allow";
}

function sourceAllowed(policy: SourceDiscoverabilityPolicy, source: RetrievalSourcePolicyRecord): boolean {
  let decision: DiscoverabilityDecision;
  try { decision = policy(source); }
  catch { decision = "error"; }
  return decision === "allow";
}

function deeplyFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value as Record<string, unknown>)) deeplyFreeze(item);
    Object.freeze(value);
  }
  return value;
}

const SAFE_RESULT_METADATA_KEYS = new Set([
  "archived",
  "authored_at",
  "authoritative",
  "category",
  "epistemic_state",
  "gkx_type",
  "governance_state",
  "quality",
  "review_state",
  "sensitivity",
  "tags",
  "title",
  "topic",
]);

function safeResultMetadata(metadata: RetrievalChunk["metadata"]): RetrievalChunk["metadata"] {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => SAFE_RESULT_METADATA_KEYS.has(key)),
  ) as RetrievalChunk["metadata"];
}

function sourcePolicyRecord(source: Readonly<GkxRetrievalStoredSourceProvenance | GkxRetrievalCandidateSource>): RetrievalSourcePolicyRecord {
  const record: RetrievalSourcePolicyRecord = {
    source_id: source.source_id,
    source_path: source.source_path,
    source_digest: source.source_digest,
    lineage_id: null,
    valid_from: source.valid_from,
    valid_to: null,
    supersedes: [],
    superseded_by: [],
    metadata: safeResultMetadata(source.source_metadata),
  };
  // Canonical JSON round-trip both severs persisted references and preserves
  // the exact validated data model. Deep freezing makes callback mutation a
  // denied/error decision without changing later temporal projection state.
  return deeplyFreeze(JSON.parse(stableJson(record)) as RetrievalSourcePolicyRecord);
}

function chunkPolicyRecord(chunk: RetrievalChunk): RetrievalChunk {
  // Chunk policy retains source-local content and metadata for Phase-1 policy
  // compatibility, but cannot observe globally derived invalidAt or lineage
  // endpoints before the authorization-scoped temporal view exists.
  const record: RetrievalChunk = {
    ...chunk,
    lineage_id: null,
    valid_to: null,
    supersedes: [],
    superseded_by: [],
    metadata: safeResultMetadata(chunk.metadata),
  };
  return deeplyFreeze(JSON.parse(stableJson(record)) as RetrievalChunk);
}

function lineageResultCoordinate(
  store: SqliteRetrievalStore,
  eligibleSources: readonly GkxRetrievalStoredSourceProvenance[],
  eligibleTemporalSources: readonly GkxRetrievalAuthorizedTemporalSource[],
): ResultProjectionCoordinate {
  const manifest = store.manifest as GkxRetrievalProjectionManifest;
  const temporalById = new Map(eligibleTemporalSources.map((source) => [source.source_id, source]));
  const sources = eligibleSources
    .map((source) => {
      const temporal = temporalById.get(source.source_id);
      if (!temporal) throw new Error("GKX_RETRIEVAL_VIEW_TEMPORAL_BINDING_MISSING");
      return {
        source_id: source.source_id,
        source_path: source.source_path,
        source_digest: source.source_digest,
        metadata: safeResultMetadata(source.source_metadata),
        assertion_time: source.assertion_time,
        assertion_origin: source.assertion_origin,
        valid_from: temporal.valid_from,
        valid_to: temporal.valid_to,
        validity_origin: source.validity_origin,
        lineage_id: null,
        supersedes: [...temporal.supersedes],
        superseded_by: [...temporal.superseded_by],
        temporal_state: temporal.temporal_state,
        ledger_binding_verified: false,
        lineage_neutral: temporal.supersedes.length === 0 && temporal.superseded_by.length === 0,
      };
    })
    .sort((left, right) => retrievalCodeUnitCompare(left.source_id, right.source_id));
  const projectionDigest = retrievalCanonicalDigest({
    contract_version: RETRIEVAL_LINEAGE_CONTRACT_VERSION,
    engine_version: manifest.engine_version,
    projection_schema_version: manifest.projection_schema_version,
    provenance_contract_version: manifest.provenance_contract_version,
    gkx_standard_commit: manifest.gkx_standard_commit,
    gkx_projection_profile: manifest.gkx_projection_profile,
    vault_id: manifest.vault_id,
    configuration_digest: manifest.configuration_digest,
    policy_digest: manifest.policy_digest,
    chunker_version: manifest.chunker_version,
    tokenizer_version: manifest.tokenizer_version,
    lexical_backend: manifest.lexical_backend,
    embedding_provider_id: manifest.embedding_provider_id,
    embedding_model_id: manifest.embedding_model_id,
    embedding_dimensions: manifest.embedding_dimensions,
    sources,
  });
  return {
    projection_id: `retrieval:${projectionDigest.slice("sha256:".length, "sha256:".length + 24)}`,
    projection_digest: projectionDigest,
  };
}

function authorizedResultChunk(
  chunk: RetrievalChunk,
  eligibleById: ReadonlyMap<string, RetrievalChunk>,
  temporal?: Readonly<GkxRetrievalAuthorizedTemporalSource>,
): RetrievalChunk {
  // Phase 1 has no authorized endpoint resolver. Return only source-local,
  // non-relationship metadata; suppress all unknown keys, MOC/relationship
  // fields, and author-agent identifiers until their endpoints are separately
  // authorized by the later lineage/agent-access contracts.
  const metadata = safeResultMetadata(chunk.metadata);
  const { parent_chunk_id: parentChunkId, ...withoutParent } = chunk;
  return {
    ...withoutParent,
    ...(parentChunkId && eligibleById.has(parentChunkId) ? { parent_chunk_id: parentChunkId } : {}),
    valid_from: temporal ? temporal.valid_from : chunk.valid_from,
    valid_to: temporal ? temporal.valid_to : chunk.valid_to,
    supersedes: temporal ? [...temporal.supersedes] : [],
    superseded_by: temporal ? [...temporal.superseded_by] : [],
    metadata,
  };
}

function querySpans(query: string, chunk: RetrievalChunk, liveBytes: Uint8Array): SourceCitation["matched_spans"] {
  return lexicalCitationSpans(chunk.text, query).flatMap((span) => {
    const start = chunk.start_byte + span.start_byte;
    const end = chunk.start_byte + span.end_byte;
    const exact = Buffer.from(liveBytes).subarray(start, end).toString("utf8");
    // The live digest and persisted chunk digest have already been verified;
    // retain a final exact-slice guard so no purported quotation is emitted if
    // either boundary is ever inconsistent.
    return exact === span.text ? [{ start_byte: start, end_byte: end, text: exact }] : [];
  });
}

function verifiedCitation(chunk: RetrievalChunk, query: string, bytes: Uint8Array): SourceCitation {
  return {
    source_id: chunk.source_id,
    path: chunk.source_path,
    source_digest: chunk.source_digest,
    heading_path: [...chunk.heading_path],
    start_byte: chunk.start_byte,
    end_byte: chunk.end_byte,
    start_line: chunk.start_line,
    end_line: chunk.end_line,
    verified: true,
    stale: false,
    matched_spans: querySpans(query, chunk, bytes),
  };
}

interface AcceptedInterval { source_id: string; start_byte: number; end_byte: number }

function deduplicateOverlapEvidence(
  citation: SourceCitation,
  chunk: RetrievalChunk,
  claimedSpans: ReadonlySet<string>,
  acceptedIntervals: readonly AcceptedInterval[],
): { citation: SourceCitation; span_keys: string[] } | null {
  if (citation.matched_spans.length) {
    const unique = citation.matched_spans.filter((span) => !claimedSpans.has(`${citation.source_id}\0${span.start_byte}\0${span.end_byte}`));
    if (!unique.length) return null;
    return {
      citation: { ...citation, matched_spans: unique },
      span_keys: unique.map((span) => `${citation.source_id}\0${span.start_byte}\0${span.end_byte}`),
    };
  }
  const overlapsAccepted = acceptedIntervals.some((accepted) =>
    accepted.source_id === chunk.source_id
    && Math.max(accepted.start_byte, chunk.start_byte) < Math.min(accepted.end_byte, chunk.end_byte));
  return overlapsAccepted ? null : { citation, span_keys: [] };
}

function validateVectorBatch(vectors: readonly Float32Array[], count: number, dimensions: number): void {
  if (!Array.isArray(vectors) || vectors.length !== count) throw new Error("EMBEDDING_RESPONSE_ITEM_COUNT_MISMATCH");
  for (const vector of vectors) {
    if (!(vector instanceof Float32Array) || vector.length !== dimensions) throw new Error("EMBEDDING_RESPONSE_DIMENSION_MISMATCH");
    if ([...vector].some((value) => !Number.isFinite(value))) throw new Error("EMBEDDING_RESPONSE_NONFINITE");
  }
}

function effectiveProviderTimeout(provider: { timeout_ms?: number }): number {
  const timeout = provider.timeout_ms ?? 15_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) throw new RangeError("Provider timeout must be from 1 through 300000 ms.");
  return timeout;
}

function stateAuthorityFailure(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === "EACCES" || code === "EPERM" ||
    /(?:ALIAS|SYMLINK|HARDLINK|PATH_ESCAPE|PERMISSION|AUTHORITY)_REJECTED|RETRIEVAL_STATE_PATH_ESCAPE/u.test(String((error as Error)?.message));
}

async function invokeProviderWithDeadline<T>(
  provider: { timeout_ms?: number },
  code: string,
  invoke: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeout = effectiveProviderTimeout(provider);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      invoke(controller.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(code);
          reject(new Error(code));
        }, timeout);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Build a complete lexical generation. FTS5 is preferred when the runtime
 * actually exposes it; otherwise the manifest-bound compatibility scan keeps
 * lexical retrieval functional and is reported as degraded. An explicitly
 * selected vector provider is one optional stage; provider failure preserves
 * the coherent lexical generation without mixed or partial vectors.
 */
async function indexGeneration(
  input: Omit<RetrievalGenerationInput, "vectors" | "embedding_provider_id" | "embedding_model_id" | "embedding_dimensions">,
  build: (value: RetrievalGenerationInput, writer: LegacyRetrievalWriterCapability) => BuiltRetrievalGeneration,
  preflight: (value: unknown) => void,
  vectorProvider?: VectorProvider,
): Promise<IndexRetrievalResult> {
  // Reject the complete inert input before cache access or any external
  // provider can observe source text. Publication revalidates independently.
  preflight(input);
  if (vectorProvider) validateProviderIdentity(vectorProvider, "vector");
  const writer = acquireLegacyRetrievalWriter(input.state_directory);
  try {
  if (!vectorProvider) {
    return {
      generation: build(input, writer),
      vector_stage: stage("none", "disabled", ["VECTOR_DISABLED"]),
    };
  }
  const providerChunks = input.chunks;
  const unique = new Map<string, RetrievalChunk>();
  for (const chunk of providerChunks) if (!unique.has(chunk.content_digest)) unique.set(chunk.content_digest, chunk);
  const uniqueChunks = [...unique.values()].sort((left, right) => retrievalCodeUnitCompare(left.content_digest, right.content_digest));
  const byDigest = new Map<string, Float32Array>();
  let prior: SqliteRetrievalStore | undefined;
  try {
    prior = openActiveRetrievalStore(input.state_directory);
    if (prior.manifest.vault_id === input.vault_id) {
      const verified = prior.contentVectorCache(vectorProvider.provider_id, vectorProvider.model_id, vectorProvider.dimensions);
      if (verified) for (const [contentDigest, vector] of verified) byDigest.set(contentDigest, vector);
    }
  } catch (error) {
    if (stateAuthorityFailure(error)) throw error;
    // A missing, corrupt, or differently-versioned prior cache is disposable.
    // It cannot block a fresh provider attempt or coherent lexical publication.
    byDigest.clear();
  } finally {
    if (prior) try { prior.close(); } catch { byDigest.clear(); }
  }
  const missingChunks = uniqueChunks.filter((chunk) => !byDigest.has(chunk.content_digest));
  const embedded: Float32Array[] = [];
  try {
    for (let offset = 0; offset < missingChunks.length;) {
      const batch: RetrievalChunk[] = [];
      let batchBytes = 0;
      while (offset + batch.length < missingChunks.length && batch.length < 32) {
        const candidate = missingChunks[offset + batch.length];
        const bytes = Buffer.byteLength(candidate.text, "utf8");
        if (batch.length && batchBytes + bytes > 262_144) break;
        batch.push(candidate);
        batchBytes += bytes;
      }
      const request_id = retrievalSha256(`index\0${offset}\0${batch.map((chunk) => chunk.content_digest).join("\0")}`);
      const result = await invokeProviderWithDeadline(
        vectorProvider,
        "INDEX_EMBEDDING_TIMEOUT",
        (signal) => vectorProvider.embed(batch.map((chunk) => chunk.text), { request_id, signal }),
      );
      validateVectorBatch(result as readonly Float32Array[], batch.length, vectorProvider.dimensions);
      embedded.push(...result);
      offset += batch.length;
    }
  } catch {
    return {
      generation: build(input, writer),
      vector_stage: stage(vectorProvider.kind, "degraded", ["VECTOR_UNAVAILABLE"], vectorProvider),
    };
  }
  missingChunks.forEach((chunk, index) => byDigest.set(chunk.content_digest, embedded[index]));
  const vectors = providerChunks.map((chunk) => {
    const vector = byDigest.get(chunk.content_digest);
    if (!vector) throw new Error("EMBEDDING_VECTOR_CACHE_INCOMPLETE");
    return { chunk_id: chunk.chunk_id, vector: [...vector] };
  });
  // Generation validation, SQLite writes, integrity verification, and pointer
  // publication are deliberately outside the provider failure boundary. Those
  // failures are not an inference outage and must never trigger an FTS retry.
  return {
    generation: build({
      ...input,
      vectors,
      embedding_provider_id: vectorProvider.provider_id,
      embedding_model_id: vectorProvider.model_id,
      embedding_dimensions: vectorProvider.dimensions,
    }, writer),
    vector_stage: stage(vectorProvider.kind, "active", [], vectorProvider),
  };
  } finally {
    if (legacyRetrievalWriterIsHeld(writer)) releaseLegacyRetrievalWriter(writer);
  }
}

class GkxRetrievalWriterAuthorityError extends Error {
  constructor(error: unknown) {
    super(String((error as Error)?.message ?? "GKX_RETRIEVAL_WRITER_AUTHORITY_FAILURE"));
    this.name = "GkxRetrievalWriterAuthorityError";
  }
}

/** Trusted-host discriminator; underlying path/lock evidence stays private. */
export function isGkxRetrievalWriterAuthorityError(error: unknown): boolean {
  return error instanceof GkxRetrievalWriterAuthorityError;
}

async function indexCandidateGeneration(
  input: Omit<GkxRetrievalGenerationInput, "vectors" | "embedding_provider_id" | "embedding_model_id" | "embedding_dimensions">,
  vectorProvider?: VectorProvider,
): Promise<IndexRetrievalResult> {
  preflightGkxRetrievalIndexInput(input);
  if (vectorProvider) validateProviderIdentity(vectorProvider, "vector");
  let writer: ReturnType<typeof acquireLegacyRetrievalWriter>;
  try { writer = acquireLegacyRetrievalWriter(input.state_directory); }
  catch (error) { throw new GkxRetrievalWriterAuthorityError(error); }
  try {
  if (!vectorProvider) return {
    generation: buildGkxRetrievalGenerationWithWriter(input, writer),
    vector_stage: stage("none", "disabled", ["VECTOR_DISABLED"]),
  };
  const eligible = new Set(input.embedding_eligible_candidate_chunk_keys);
  const providerCandidates = input.candidate_chunks.filter((item) => eligible.has(item.candidate_chunk_key));
  const unique = new Map<string, typeof providerCandidates[number]>();
  for (const candidate of providerCandidates) if (!unique.has(candidate.chunk.content_digest)) unique.set(candidate.chunk.content_digest, candidate);
  const uniqueCandidates = [...unique.values()].sort((left, right) => retrievalCodeUnitCompare(left.chunk.content_digest, right.chunk.content_digest));
  const byDigest = new Map<string, Float32Array>();
  let prior: SqliteRetrievalStore | undefined;
  try {
    prior = openActiveRetrievalStore(input.state_directory);
    if (prior.manifest.vault_id === input.vault_id) {
      const verified = prior.contentVectorCache(vectorProvider.provider_id, vectorProvider.model_id, vectorProvider.dimensions);
      if (verified) for (const [contentDigest, vector] of verified) byDigest.set(contentDigest, vector);
    }
  } catch (error) {
    if (stateAuthorityFailure(error)) throw error;
    byDigest.clear();
  } finally {
    if (prior) try { prior.close(); } catch { byDigest.clear(); }
  }
  const missing = uniqueCandidates.filter((candidate) => !byDigest.has(candidate.chunk.content_digest));
  const embedded: Float32Array[] = [];
  try {
    for (let offset = 0; offset < missing.length;) {
      const batch: typeof missing = [];
      let batchBytes = 0;
      while (offset + batch.length < missing.length && batch.length < 32) {
        const candidate = missing[offset + batch.length];
        const bytes = Buffer.byteLength(candidate.chunk.text, "utf8");
        if (batch.length && batchBytes + bytes > 262_144) break;
        batch.push(candidate);
        batchBytes += bytes;
      }
      const request_id = retrievalSha256(`index\0${offset}\0${batch.map((item) => item.chunk.content_digest).join("\0")}`);
      const result = await invokeProviderWithDeadline(vectorProvider, "INDEX_EMBEDDING_TIMEOUT",
        (signal) => vectorProvider.embed(batch.map((item) => item.chunk.text), { request_id, signal }));
      validateVectorBatch(result as readonly Float32Array[], batch.length, vectorProvider.dimensions);
      embedded.push(...result);
      offset += batch.length;
    }
  } catch {
    return {
      generation: buildGkxRetrievalGenerationWithWriter(input, writer),
      vector_stage: stage(vectorProvider.kind, "degraded", ["VECTOR_UNAVAILABLE"], vectorProvider),
    };
  }
  missing.forEach((candidate, index) => byDigest.set(candidate.chunk.content_digest, embedded[index]));
  const vectors = providerCandidates.map((candidate) => {
    const vector = byDigest.get(candidate.chunk.content_digest);
    if (!vector) throw new Error("EMBEDDING_VECTOR_CACHE_INCOMPLETE");
    return { candidate_chunk_key: candidate.candidate_chunk_key, vector: [...vector] };
  });
  return {
    generation: buildGkxRetrievalGenerationWithWriter({
      ...input,
      vectors,
      embedding_provider_id: vectorProvider.provider_id,
      embedding_model_id: vectorProvider.model_id,
      embedding_dimensions: vectorProvider.dimensions,
    }, writer),
    vector_stage: stage(vectorProvider.kind, "active", [], vectorProvider),
  };
  } finally {
    if (legacyRetrievalWriterIsHeld(writer)) releaseLegacyRetrievalWriter(writer);
  }
}

export async function indexRetrievalGeneration(
  input: Omit<RetrievalGenerationInput, "vectors" | "embedding_provider_id" | "embedding_model_id" | "embedding_dimensions">,
  vectorProvider?: VectorProvider,
): Promise<IndexRetrievalResult> {
  return indexGeneration(input, buildRetrievalGenerationWithWriter, preflightRetrievalIndexInput, vectorProvider);
}

export async function indexGkxRetrievalGeneration(
  input: Omit<GkxRetrievalGenerationInput, "vectors" | "embedding_provider_id" | "embedding_model_id" | "embedding_dimensions">,
  vectorProvider?: VectorProvider,
): Promise<IndexRetrievalResult> {
  return indexCandidateGeneration(input, vectorProvider);
}

export function vaultSourceReader(vaultRoot: string): (sourcePath: string) => Promise<Uint8Array> {
  const requestedRoot = resolve(vaultRoot);
  const rootPromise = (async () => {
    const actualRoot = await canonicalPath(requestedRoot, { alias_error: "SOURCE_ROOT_ALIAS_REJECTED" });
    const rootState = await lstat(actualRoot);
    if (!rootState.isDirectory() || rootState.isSymbolicLink()) throw new Error("SOURCE_ROOT_ALIAS_REJECTED");
    return actualRoot;
  })();
  return async (sourcePath) => {
    if (!isValidRetrievalSourcePath(sourcePath)) throw new Error("SOURCE_PATH_INVALID");
    const root = await rootPromise;
    const requestedPath = resolve(root, sourcePath);
    if (!canonicalPathContains(root, requestedPath)) throw new Error("SOURCE_PATH_OUTSIDE_VAULT");
    const actual = await canonicalPath(requestedPath, { alias_error: "SOURCE_ALIAS_REJECTED" });
    if (!canonicalPathContains(root, actual)) throw new Error("SOURCE_PATH_OUTSIDE_VAULT");
    const linkState = await lstat(actual);
    if (!linkState.isFile() || linkState.isSymbolicLink()) throw new Error("SOURCE_ALIAS_REJECTED");
    if ((await stat(actual)).nlink > 1) throw new Error("SOURCE_HARDLINK_REJECTED");
    return readFile(actual);
  };
}

export class RetrievalCoordinator {
  readonly #store: SqliteRetrievalStore;
  readonly #options: RetrievalCoordinatorOptions;

  constructor(databasePath: string, options: RetrievalCoordinatorOptions);
  constructor(databasePathOrStore: SqliteRetrievalStore, options: RetrievalCoordinatorOptions, capability: typeof VERIFIED_STORE);
  constructor(databasePathOrStore: string | SqliteRetrievalStore, options: RetrievalCoordinatorOptions, capability?: symbol) {
    validateCoordinatorOptions(options);
    if (typeof databasePathOrStore === "string") this.#store = new SqliteRetrievalStore(databasePathOrStore);
    else if (capability === VERIFIED_STORE) this.#store = databasePathOrStore;
    else throw new TypeError("Raw retrieval stores are not accepted by the public coordinator API.");
    if (isGkxRetrievalProjectionManifest(this.#store.manifest) && typeof options.source_discoverability_policy !== "function") {
      this.#store.close();
      throw new TypeError("A source discoverability policy is required for schema-3 lineage retrieval.");
    }
    if (isGkxRetrievalProjectionManifest(this.#store.manifest) && options.runtime_policy_digest !== this.#store.manifest.policy_digest) {
      this.#store.close();
      throw new Error("RETRIEVAL_RUNTIME_POLICY_DIGEST_MISMATCH");
    }
    this.#options = options;
  }

  /** Open an active generation without exposing its raw store reader. */
  static openActive(stateDirectory: string, options: RetrievalCoordinatorOptions): RetrievalCoordinator {
    validateCoordinatorOptions(options);
    const store = openIngestAwareActiveRetrievalStore(stateDirectory);
    try { return new RetrievalCoordinator(store, options, VERIFIED_STORE); }
    catch (error) { try { store.close(); } catch { /* constructor may already have closed it */ } throw error; }
  }

  close(): void { this.#store.close(); }

  async search(request: RetrievalSearchRequest): Promise<RetrievalSearchResult> {
    validateSearchRequest(request);
    if (!request.query) throw new TypeError("query is required.");
    // Validate the caller's exact bytes before deriving a trimmed ranking
    // query. Otherwise leading/trailing controls could be erased before the
    // shared lexical grammar has an opportunity to fail closed.
    const queryClauses = lexicalQueryClauses(request.query);
    const query = request.query.trim();
    const lineageProjection = isGkxRetrievalProjectionManifest(this.#store.manifest);
    const lineageViewFreshness = this.#options.lineage_view_freshness ?? "unverified";
    const normalizedAsOf = request.as_of === undefined ? null : normalizeRetrievalAsOf(request.as_of);
    if (normalizedAsOf !== null && !lineageProjection) throw new Error("RETRIEVAL_AS_OF_REQUIRES_LINEAGE_PROJECTION");
    if (queryClauses.length > 64) throw new RangeError("query exceeds 64 terms.");
    if (queryClauses.some((clause) => Buffer.byteLength(clause.value, "utf8") > 256)) throw new RangeError("a query term exceeds 256 UTF-8 bytes.");
    const limit = request.limit ?? 5;
    const lexicalTopK = request.lexical_top_k ?? Math.max(20, limit * 4);
    const semanticTopK = request.semantic_top_k ?? Math.max(20, limit * 4);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError("limit must be from 1 through 100.");
    if (!Number.isSafeInteger(lexicalTopK) || lexicalTopK < limit || lexicalTopK > 10_000) throw new RangeError("lexical_top_k is invalid.");
    if (!Number.isSafeInteger(semanticTopK) || semanticTopK < limit || semanticTopK > 10_000) throw new RangeError("semantic_top_k is invalid.");
    const rrfK = request.rrf_k ?? RETRIEVAL_RRF_DEFAULT_K;
    const mmrLambda = request.mmr_lambda ?? RETRIEVAL_MMR_DEFAULT_LAMBDA;
    if (!Number.isSafeInteger(rrfK) || rrfK < 1) throw new RangeError("rrf_k must be a positive safe integer.");
    if (!Number.isFinite(mmrLambda) || mmrLambda < 0 || mmrLambda > 1) throw new RangeError("mmr_lambda must be within [0, 1].");
    if (request.mmr !== undefined && typeof request.mmr !== "boolean") throw new TypeError("mmr must be boolean.");
    if (request.parent_expansion !== undefined && typeof request.parent_expansion !== "boolean") throw new TypeError("parent_expansion must be boolean.");
    const parentExpansionMaxChildTokens = request.parent_expansion_max_child_tokens ?? RETRIEVAL_PARENT_EXPANSION_MAX_CHILD_TOKENS;
    if (!Number.isSafeInteger(parentExpansionMaxChildTokens) || parentExpansionMaxChildTokens < 1 || parentExpansionMaxChildTokens > 4096) throw new RangeError("parent_expansion_max_child_tokens is invalid.");

    let chunks: RetrievalChunk[];
    const chunksBySource = new Map<string, RetrievalChunk[]>();
    let policyEligible: RetrievalChunk[];
    const provenanceBySource = new Map<string, GkxRetrievalStoredSourceProvenance>();
    const temporalBySource = new Map<string, GkxRetrievalAuthorizedTemporalSource>();
    let temporalCoverage: "not_requested" | "not_evaluated" | "sufficient" = "not_requested";
    let resultCoordinate: ResultProjectionCoordinate = {
      projection_id: this.#store.manifest.projection_id,
      projection_digest: this.#store.manifest.projection_digest,
    };
    const lineageCandidateKeyByPublicId = new Map<string, string>();
    if (lineageProjection) {
      const sourcePolicy = this.#options.source_discoverability_policy!;
      const sourceCandidates: GkxRetrievalCandidateSource[] = [];
      for (const source of this.#store.listCandidateSources()) {
        // Policy/filter input is deliberately source-local. Global invalidAt
        // and relationship endpoints can depend on hidden records and must not
        // become an allow/deny oracle before the authorized temporal view.
        const policyRecord = sourcePolicyRecord(source);
        if (!sourceAllowed(sourcePolicy, policyRecord)) continue;
        // Typed filters run only after source discoverability has allowed this
        // exact inert source-local record.
        if (!matchesRetrievalFilters(policyRecord, request.filters, { vault_id: this.#store.manifest.vault_id })) continue;
        sourceCandidates.push(source);
      }
      // The established chunk policy is additive and all-or-nothing per
      // source. Apply it before temporal projection so a denied successor can
      // neither influence validity nor reach provider/ranking/citation work.
      const candidateChunks = this.#store.listCandidateChunksForRecordKeys(sourceCandidates.map((source) => source.record_key));
      const candidateChunksByRecord = new Map<string, typeof candidateChunks>();
      for (const candidate of candidateChunks) {
        const group = candidateChunksByRecord.get(candidate.record_key) ?? [];
        group.push(candidate);
        candidateChunksByRecord.set(candidate.record_key, group);
      }
      const authorizedSources = sourceCandidates.filter((source) => {
        const group = candidateChunksByRecord.get(source.record_key) ?? [];
        return group.length === 0 || group.every((candidate) => allowed(this.#options.discoverability_policy, chunkPolicyRecord(candidate.chunk)));
      });
      const authorizedRecordKeys = new Set(authorizedSources.map((source) => source.record_key));
      const authorizedChunks = candidateChunks.filter((candidate) => authorizedRecordKeys.has(candidate.record_key));
      const temporalView = buildGkxRetrievalAuthorizedCandidateView(
        authorizedSources,
        this.#store.listCandidateDeclarationsForRecordKeys([...authorizedRecordKeys]),
        authorizedChunks,
        normalizedAsOf,
      );
      resultCoordinate = lineageResultCoordinate(this.#store, temporalView.sources, temporalView.temporal_sources);
      for (const source of temporalView.sources) provenanceBySource.set(source.source_id, source);
      for (const source of temporalView.temporal_sources) temporalBySource.set(source.source_id, source);
      if (normalizedAsOf !== null) {
        if (temporalView.authorized_source_count === 0) {
          return emptyLineageSearchResult(this.#store, this.#options, query, normalizedAsOf, request.filters, "NO_ELIGIBLE_RESULTS", "not_evaluated", resultCoordinate, lineageViewFreshness);
        }
        if (temporalView.answerable_source_count !== temporalView.authorized_source_count || temporalView.eligible_record_keys.length === 0) {
          return emptyLineageSearchResult(this.#store, this.#options, query, normalizedAsOf, request.filters, "TEMPORAL_COVERAGE_INSUFFICIENT", "insufficient", resultCoordinate, lineageViewFreshness);
        }
        temporalCoverage = "sufficient";
      }
      // The runtime policy identity promises that every source/chunk allowed
      // by this exact view was embedding-eligible at build time. Verify that
      // promise for the complete temporal set before live reads or any query
      // provider work; stale source suppression must not conceal a partial
      // vector-policy projection.
      if (this.#store.manifest.embedding_provider_id &&
          !this.#store.candidateVectorEligibilityCovers(temporalView.eligible_candidate_chunk_keys)) {
        throw new Error("RETRIEVAL_RUNTIME_VECTOR_ELIGIBILITY_MISMATCH");
      }
      const eligibleCandidates = this.#store.listCandidateChunksForKeys(temporalView.eligible_candidate_chunk_keys);
      for (const candidate of eligibleCandidates) lineageCandidateKeyByPublicId.set(candidate.chunk.chunk_id, candidate.candidate_chunk_key);
      chunks = eligibleCandidates.map((candidate) => candidate.chunk);
      policyEligible = chunks;
    } else {
      chunks = this.#store.listChunks();
      for (const chunk of chunks) {
        const group = chunksBySource.get(chunk.source_id) ?? [];
        group.push(chunk);
        chunksBySource.set(chunk.source_id, group);
      }
      policyEligible = [];
      for (const group of chunksBySource.values()) {
        if (group.every((chunk) => matchesRetrievalFilters(chunk, request.filters, { vault_id: this.#store.manifest.vault_id }) && allowed(this.#options.discoverability_policy, chunk))) policyEligible.push(...group);
      }
    }
    // The schema-3 SQL read is already restricted to source-level
    // policy/filter/time eligible IDs. Build groups only from those rows.
    if (lineageProjection) {
      for (const chunk of chunks) {
        const group = chunksBySource.get(chunk.source_id) ?? [];
        group.push(chunk);
        chunksBySource.set(chunk.source_id, group);
      }
    }
    const sourceBytes = new Map<string, Uint8Array>();
    const eligible: RetrievalChunk[] = [];
    let staleCitation = false;
    for (const group of new Map(policyEligible.map((chunk) => [chunk.source_id, chunksBySource.get(chunk.source_id)!])).values()) {
      const first = group[0];
      let bytes = sourceBytes.get(first.source_path);
      if (!bytes) {
        try { bytes = await this.#options.source_reader(first.source_path); sourceBytes.set(first.source_path, bytes); }
        catch { staleCitation = true; continue; }
      }
      if (retrievalSha256(bytes) !== first.source_digest || group.some((chunk) => {
        if (Buffer.from(bytes!).subarray(chunk.start_byte, chunk.end_byte).toString("utf8") !== chunk.text) return true;
        try {
          const lines = retrievalLineCoordinates(bytes!, chunk.start_byte, chunk.end_byte);
          return lines.start_line !== chunk.start_line || lines.end_line !== chunk.end_line;
        } catch {
          return true;
        }
      })) { staleCitation = true; continue; }
      eligible.push(...group);
    }
    if (lineageProjection && eligible.length === 0) {
      return emptyLineageSearchResult(
        this.#store,
        this.#options,
        query,
        normalizedAsOf,
        request.filters,
        "NO_ELIGIBLE_RESULTS",
        temporalCoverage,
        resultCoordinate,
        staleCitation ? "stale" : lineageViewFreshness,
      );
    }
    const eligibleIds = eligible.map((chunk) => chunk.chunk_id);
    const eligibleCandidateKeys = lineageProjection
      ? eligible.map((chunk) => lineageCandidateKeyByPublicId.get(chunk.chunk_id) ?? (() => { throw new Error("GKX_RETRIEVAL_CANDIDATE_CHUNK_BINDING_MISSING"); })())
      : [];
    const lexical = lineageProjection
      ? this.#store.candidateLexicalSearch(query, eligibleCandidateKeys, lexicalTopK)
      : this.#store.lexicalSearch(query, eligibleIds, lexicalTopK);
    const lexicalStage = this.#store.manifest.lexical_backend === "sqlite_fts5"
      ? stage("sqlite_fts5", "active", [])
      : stage("sqlite_lexical_scan", "degraded", [
        ...(!this.#store.fts5_available ? ["SQLITE_FTS5_UNAVAILABLE"] : []),
        "SQLITE_LEXICAL_SCAN_ACTIVE",
        "SQLITE_LEXICAL_SCAN_APPROXIMATION",
      ]);
    let vectorStage: RetrievalProviderStageStatus;
    let semantic: RankedInput[] = [];
    if (!this.#options.vector_provider) vectorStage = stage("none", "disabled", ["VECTOR_DISABLED"]);
    else if (!this.#store.manifest.embedding_provider_id) vectorStage = stage(this.#options.vector_provider.kind, "degraded", ["VECTOR_PROJECTION_UNAVAILABLE"], this.#options.vector_provider);
    else {
      const provider = this.#options.vector_provider;
      if (provider.provider_id !== this.#store.manifest.embedding_provider_id || provider.model_id !== this.#store.manifest.embedding_model_id || provider.dimensions !== this.#store.manifest.embedding_dimensions) throw new Error("VECTOR_SPACE_MISMATCH_REBUILD_REQUIRED");
      let queryVector: Float32Array | undefined;
      try {
        const [candidate] = await invokeProviderWithDeadline(
          provider,
          "QUERY_EMBEDDING_TIMEOUT",
          (signal) => provider.embed([query], { request_id: retrievalSha256(query), signal }),
        );
        validateVectorBatch([candidate], 1, provider.dimensions);
        queryVector = candidate;
      } catch {
        vectorStage = stage(provider.kind, "degraded", ["VECTOR_UNAVAILABLE"], provider);
      }
      if (queryVector) {
        // Provider failures may degrade to lexical-only retrieval. Persisted-store read, space,
        // or corruption failures are projection-integrity failures and must
        // propagate rather than being mislabeled as provider unavailability.
        semantic = lineageProjection
          ? this.#store.candidateVectorSearch([...queryVector], eligibleCandidateKeys, semanticTopK, provider.provider_id, provider.model_id)
          : this.#store.vectorSearch([...queryVector], eligibleIds, semanticTopK, provider.provider_id, provider.model_id);
        vectorStage = stage(provider.kind, "active", [], provider);
      }
    }

    const fused = reciprocalRankFusion(lexical, semantic, rrfK);
    const fusedRanks = new Map(fused.map((candidate, index) => [candidate.chunk_id, index + 1]));
    let ordered = [...fused];
    let rerankerStage: RetrievalProviderStageStatus;
    const rerankerScores = new Map<string, number>();
    const rerankerRanks = new Map<string, number>();
    if (!this.#options.rerank_provider) rerankerStage = stage("none", "skipped", ["RERANKER_NOT_CONFIGURED"]);
    else {
      const provider = this.#options.rerank_provider;
      try {
        const byId = new Map(eligible.map((chunk) => [chunk.chunk_id, chunk]));
        const scores = await invokeProviderWithDeadline(
          provider,
          "RERANK_TIMEOUT",
          (signal) => provider.rerank(
            query,
            ordered.map((candidate) => ({ chunk_id: candidate.chunk_id, text: byId.get(candidate.chunk_id)!.text })),
            { request_id: retrievalSha256(`rerank\0${query}`), signal },
          ),
        );
        if (!Array.isArray(scores) || scores.length !== ordered.length) throw new Error("RERANK_RESPONSE_ITEM_COUNT_MISMATCH");
        const expectedIds = new Set(ordered.map((candidate) => candidate.chunk_id));
        const seenIds = new Set<string>();
        for (const item of scores) {
          if (!expectedIds.has(item.chunk_id) || seenIds.has(item.chunk_id)) throw new Error("RERANK_RESPONSE_ID_MISMATCH");
          if (typeof item.score !== "number" || !Number.isFinite(item.score)) throw new Error("RERANK_RESPONSE_NONFINITE");
          seenIds.add(item.chunk_id);
        }
        scores.forEach((item) => rerankerScores.set(item.chunk_id, item.score));
        ordered.sort((left, right) => (rerankerScores.get(right.chunk_id)! - rerankerScores.get(left.chunk_id)!) || right.fusion_score - left.fusion_score || retrievalCodeUnitCompare(left.chunk_id, right.chunk_id));
        ordered.forEach((candidate, index) => rerankerRanks.set(candidate.chunk_id, index + 1));
        rerankerStage = stage(provider.kind, "active", [], provider);
      } catch {
        rerankerStage = stage(provider.kind, "degraded", ["RERANKER_UNAVAILABLE"], provider);
        ordered = [...fused];
      }
    }

    const rerankRelevance = rerankerStage.state === "active"
      ? new Map(ordered.map((candidate, index) => [candidate.chunk_id, 1 / (index + 1)]))
      : undefined;
    const selected = request.mmr ? maximalMarginalRelevance(ordered, ordered.length, mmrLambda, rerankRelevance) : ordered;
    const byId = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]));
    const eligibleById = new Map(eligible.map((chunk) => [chunk.chunk_id, chunk]));
    const hits: InternalRetrievalHit[] = [];
    // Draft.2 ordinary search freshness is scoped to the authorized request
    // view. A service-global stale flag can be influenced by denied sources
    // and belongs in a later authenticated operator/status capability.
    const projectionFreshness: RetrievalSearchResult["projection_freshness"] = lineageProjection
      ? (staleCitation ? "stale" : lineageViewFreshness)
      : (staleCitation || this.#options.stale ? "stale" : "fresh");
    const stale = projectionFreshness === "stale";
    const assembleResult = (resultHits: readonly InternalRetrievalHit[]): RetrievalSearchResult => {
      const confidence = assessRetrievalConfidence(resultHits.map((hit) => hit.stage_scores), { vector: vectorStage, reranker: rerankerStage }, eligible.length, stale);
      const common = {
        projection_id: resultCoordinate.projection_id,
        projection_digest: resultCoordinate.projection_digest,
        confidence: confidenceForProjectionFreshness(confidence, projectionFreshness),
        applied_filters: appliedFilterNames(request.filters),
        eligible_result_count: eligible.length,
        stages: { lexical: lexicalStage, vector: vectorStage, reranker: rerankerStage },
      };
      if (lineageProjection) return {
        ...common,
        contract_version: RETRIEVAL_LINEAGE_CONTRACT_VERSION,
        query_digest: retrievalCanonicalDigest({ as_of: normalizedAsOf, query }),
        projection_freshness: projectionFreshness,
        hits: [...resultHits] as GkxRetrievalHit[],
        temporal: {
          as_of: normalizedAsOf,
          coverage: temporalCoverage,
          reason_codes: [],
        },
      };
      return {
        ...common,
        contract_version: RETRIEVAL_CONTRACT_VERSION,
        query_digest: retrievalSha256(query),
        projection_freshness: projectionFreshness as "fresh" | "stale",
        hits: [...resultHits] as RetrievalHit[],
      };
    };
    const claimedMatchedSpans = new Set<string>();
    const acceptedIntervals: AcceptedInterval[] = [];
    for (const candidate of selected) {
      if (hits.length >= limit) break;
      const chunk = byId.get(candidate.chunk_id)!;
      const evidence = deduplicateOverlapEvidence(
        verifiedCitation(chunk, query, sourceBytes.get(chunk.source_path)!),
        chunk,
        claimedMatchedSpans,
        acceptedIntervals,
      );
      if (!evidence) continue;
      const citation = evidence.citation;
      const scores: RetrievalStageScores = {
        lexical_score: candidate.lexical_score,
        semantic_score: candidate.semantic_score,
        fusion_score: candidate.fusion_score,
        reranker_score: rerankerScores.get(candidate.chunk_id) ?? null,
        mmr_score: candidate.mmr_score ?? null,
        lexical_rank: candidate.lexical_rank,
        semantic_rank: candidate.semantic_rank,
        fused_rank: fusedRanks.get(candidate.chunk_id)!,
        reranker_rank: rerankerRanks.get(candidate.chunk_id) ?? null,
        final_rank: hits.length + 1,
      };
      const temporal = lineageProjection ? temporalBySource.get(chunk.source_id) : undefined;
      const storedProvenance = lineageProjection ? provenanceBySource.get(chunk.source_id) : undefined;
      if (lineageProjection && (!temporal || !storedProvenance)) throw new Error("GKX_RETRIEVAL_RESULT_PROVENANCE_MISSING");
      const resultChunk = authorizedResultChunk(chunk, eligibleById, temporal);
      const provenance = lineageProjection
        ? buildGkxRetrievalProvenance(storedProvenance!, resultChunk, temporal!, normalizedAsOf)
        : undefined;
      let parent_context: InternalRetrievalHit["parent_context"];
      if (request.parent_expansion && chunk.token_count < parentExpansionMaxChildTokens && chunk.parent_chunk_id) {
        const parent = eligibleById.get(chunk.parent_chunk_id);
        if (parent && Buffer.byteLength(parent.text, "utf8") <= (this.#options.max_parent_bytes ?? 8192)) {
          const parentCitation = verifiedCitation(parent, "", sourceBytes.get(parent.source_path)!);
          const parentTemporal = lineageProjection ? temporalBySource.get(parent.source_id) : undefined;
          const parentResultChunk = authorizedResultChunk(parent, eligibleById, parentTemporal);
          const parentProvenance = lineageProjection
            ? buildGkxRetrievalProvenance(provenanceBySource.get(parent.source_id)!, parentResultChunk, parentTemporal!, normalizedAsOf)
            : undefined;
          parent_context = {
            chunk_id: parent.chunk_id,
            text: parent.text,
            citation: parentCitation,
            ...(parentProvenance ? { provenance: parentProvenance } : {}),
          };
        }
      }
      const budget = this.#options.max_result_bytes ?? RETRIEVAL_MAX_RESULT_BYTES;
      let candidateHit: InternalRetrievalHit = {
        chunk: resultChunk,
        citation,
        ...(provenance ? { provenance } : {}),
        stage_scores: scores,
        ...(parent_context ? { parent_context } : {}),
      };
      let candidateResult = assembleResult([...hits, candidateHit]);
      if (Buffer.byteLength(stableJson(candidateResult), "utf8") > budget && candidateHit.parent_context) {
        const { parent_context: _parent, ...withoutParent } = candidateHit;
        candidateHit = withoutParent;
        candidateResult = assembleResult([...hits, candidateHit]);
      }
      if (Buffer.byteLength(stableJson(candidateResult), "utf8") > budget) continue;
      hits.push(candidateHit);
      for (const key of evidence.span_keys) claimedMatchedSpans.add(key);
      acceptedIntervals.push({ source_id: chunk.source_id, start_byte: chunk.start_byte, end_byte: chunk.end_byte });
    }
    return assembleResult(hits);
  }
}

/**
 * Verify and hold the exact active legacy/Phase-3 store before config or
 * provider discovery. The held SQLite handle is consumed without reopening
 * the pointer or database by path.
 */
export function preflightActiveRetrievalStore(stateDirectory: string): ActiveRetrievalStorePreflight {
  const store = openIngestAwareActiveRetrievalStore(stateDirectory);
  const capability = Object.freeze({ state_directory: resolve(stateDirectory) });
  ACTIVE_STORE_PREFLIGHTS.set(capability, store);
  return capability;
}

/** Consume a verified active-store capability exactly once. */
export function coordinatorFromActiveRetrievalStorePreflight(
  capability: ActiveRetrievalStorePreflight,
  options: RetrievalCoordinatorOptions,
): RetrievalCoordinator {
  const store = ACTIVE_STORE_PREFLIGHTS.get(capability);
  if (!store) throw new TypeError("RETRIEVAL_ACTIVE_STORE_PREFLIGHT_CAPABILITY_INVALID");
  ACTIVE_STORE_PREFLIGHTS.delete(capability);
  try { return new RetrievalCoordinator(store, options, VERIFIED_STORE); }
  catch (error) { try { store.close(); } catch { /* constructor may already have closed it */ } throw error; }
}

/** Release an unconsumed held store when later config preparation fails. */
export function releaseActiveRetrievalStorePreflight(capability: ActiveRetrievalStorePreflight): void {
  const store = ACTIVE_STORE_PREFLIGHTS.get(capability);
  if (!store) throw new TypeError("RETRIEVAL_ACTIVE_STORE_PREFLIGHT_CAPABILITY_INVALID");
  ACTIVE_STORE_PREFLIGHTS.delete(capability);
  store.close();
}
