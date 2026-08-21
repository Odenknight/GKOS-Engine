import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { isValidRetrievalSourcePath, retrievalLineCoordinates } from "./chunker";
import { RETRIEVAL_CONTRACT_VERSION, RETRIEVAL_MAX_RESULT_BYTES, RETRIEVAL_MMR_DEFAULT_LAMBDA, RETRIEVAL_PARENT_EXPANSION_MAX_CHILD_TOKENS, RETRIEVAL_RRF_DEFAULT_K } from "./contracts";
import { assessRetrievalConfidence } from "./confidence";
import { retrievalCodeUnitCompare, retrievalSha256, stableJson } from "./digest";
import { appliedFilterNames, matchesRetrievalFilters, validateRetrievalFilters } from "./filters";
import { maximalMarginalRelevance, reciprocalRankFusion } from "./fusion";
import { lexicalCitationSpans, lexicalQueryClauses } from "./lexical";
import { buildRetrievalGeneration, type BuiltRetrievalGeneration, type RetrievalGenerationInput, openActiveRetrievalStore, SqliteRetrievalStore } from "./sqlite-store";
import type {
  DiscoverabilityDecision,
  DiscoverabilityPolicy,
  RerankProvider,
  RetrievalChunk,
  RetrievalHit,
  RetrievalProviderStageStatus,
  RetrievalSearchRequest,
  RetrievalSearchResult,
  RetrievalStageScores,
  SourceCitation,
  VectorProvider,
} from "./types";

export interface RetrievalCoordinatorOptions {
  discoverability_policy: DiscoverabilityPolicy;
  vector_provider?: VectorProvider;
  rerank_provider?: RerankProvider;
  source_reader: (sourcePath: string) => Promise<Uint8Array>;
  stale?: boolean;
  max_parent_bytes?: number;
  max_result_bytes?: number;
}

export interface IndexRetrievalResult {
  generation: BuiltRetrievalGeneration;
  vector_stage: RetrievalProviderStageStatus;
}

const VERIFIED_STORE = Symbol("gkos.retrieval.verified-store");
const SEARCH_REQUEST_FIELDS = new Set([
  "query", "limit", "lexical_top_k", "semantic_top_k", "filters", "rrf_k", "mmr", "mmr_lambda",
  "parent_expansion", "parent_expansion_max_child_tokens",
]);

function validateCoordinatorOptions(options: RetrievalCoordinatorOptions): void {
  if (typeof options.discoverability_policy !== "function") throw new TypeError("A discoverability policy is required.");
  if (typeof options.source_reader !== "function") throw new TypeError("A source reader is required for exact citation verification.");
  if (options.max_parent_bytes !== undefined && (!Number.isSafeInteger(options.max_parent_bytes) || options.max_parent_bytes < 256 || options.max_parent_bytes > 65_536)) throw new RangeError("max_parent_bytes is invalid.");
  if (options.max_result_bytes !== undefined && (!Number.isSafeInteger(options.max_result_bytes) || options.max_result_bytes < 16_384 || options.max_result_bytes > 1_048_576)) throw new RangeError("max_result_bytes is invalid.");
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

function allowed(policy: DiscoverabilityPolicy, chunk: RetrievalChunk): boolean {
  let decision: DiscoverabilityDecision;
  try { decision = policy(chunk); }
  catch { decision = "error"; }
  return decision === "allow";
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

function authorizedResultChunk(chunk: RetrievalChunk, eligibleById: ReadonlyMap<string, RetrievalChunk>): RetrievalChunk {
  // Phase 1 has no authorized endpoint resolver. Return only source-local,
  // non-relationship metadata; suppress all unknown keys, MOC/relationship
  // fields, and author-agent identifiers until their endpoints are separately
  // authorized by the later lineage/agent-access contracts.
  const metadata = Object.fromEntries(
    Object.entries(chunk.metadata).filter(([key]) => SAFE_RESULT_METADATA_KEYS.has(key)),
  ) as RetrievalChunk["metadata"];
  const { parent_chunk_id: parentChunkId, ...withoutParent } = chunk;
  return {
    ...withoutParent,
    ...(parentChunkId && eligibleById.has(parentChunkId) ? { parent_chunk_id: parentChunkId } : {}),
    supersedes: [],
    superseded_by: [],
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
export async function indexRetrievalGeneration(
  input: Omit<RetrievalGenerationInput, "vectors" | "embedding_provider_id" | "embedding_model_id" | "embedding_dimensions">,
  vectorProvider?: VectorProvider,
): Promise<IndexRetrievalResult> {
  if (!vectorProvider) {
    return {
      generation: buildRetrievalGeneration(input),
      vector_stage: stage("none", "disabled", ["VECTOR_DISABLED"]),
    };
  }
  try {
    const unique = new Map<string, RetrievalChunk>();
    for (const chunk of input.chunks) if (!unique.has(chunk.content_digest)) unique.set(chunk.content_digest, chunk);
    const uniqueChunks = [...unique.values()].sort((left, right) => retrievalCodeUnitCompare(left.content_digest, right.content_digest));
    const byDigest = new Map<string, Float32Array>();
    let prior: SqliteRetrievalStore | undefined;
    try {
      prior = openActiveRetrievalStore(input.state_directory);
      if (prior.manifest.vault_id === input.vault_id) {
        const verified = prior.contentVectorCache(vectorProvider.provider_id, vectorProvider.model_id, vectorProvider.dimensions);
        if (verified) for (const [contentDigest, vector] of verified) byDigest.set(contentDigest, vector);
      }
    } catch {
      // A missing, corrupt, or differently-versioned prior cache is disposable.
      // It cannot block a fresh provider attempt or coherent lexical publication.
      byDigest.clear();
    } finally {
      if (prior) try { prior.close(); } catch { byDigest.clear(); }
    }
    const missingChunks = uniqueChunks.filter((chunk) => !byDigest.has(chunk.content_digest));
    const embedded: Float32Array[] = [];
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
    missingChunks.forEach((chunk, index) => byDigest.set(chunk.content_digest, embedded[index]));
    const vectors = input.chunks.map((chunk) => ({ chunk_id: chunk.chunk_id, vector: [...byDigest.get(chunk.content_digest)!] }));
    return {
      generation: buildRetrievalGeneration({
        ...input,
        vectors,
        embedding_provider_id: vectorProvider.provider_id,
        embedding_model_id: vectorProvider.model_id,
        embedding_dimensions: vectorProvider.dimensions,
      }),
      vector_stage: stage(vectorProvider.kind, "active", [], vectorProvider),
    };
  } catch {
    return {
      generation: buildRetrievalGeneration(input),
      vector_stage: stage(vectorProvider.kind, "degraded", ["VECTOR_UNAVAILABLE"], vectorProvider),
    };
  }
}

function filesystemPathKey(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

export function vaultSourceReader(vaultRoot: string): (sourcePath: string) => Promise<Uint8Array> {
  const requestedRoot = resolve(vaultRoot);
  const rootPromise = (async () => {
    const rootState = await lstat(requestedRoot);
    if (!rootState.isDirectory() || rootState.isSymbolicLink()) throw new Error("SOURCE_ROOT_ALIAS_REJECTED");
    const actualRoot = await realpath(requestedRoot);
    if (filesystemPathKey(actualRoot) !== filesystemPathKey(requestedRoot)) throw new Error("SOURCE_ROOT_ALIAS_REJECTED");
    return actualRoot;
  })();
  return async (sourcePath) => {
    if (!isValidRetrievalSourcePath(sourcePath)) throw new Error("SOURCE_PATH_INVALID");
    const root = await rootPromise;
    const path = resolve(root, sourcePath);
    const foldedRoot = filesystemPathKey(root);
    const foldedPath = filesystemPathKey(path);
    if (!foldedPath.startsWith(`${foldedRoot}${sep}`)) throw new Error("SOURCE_PATH_OUTSIDE_VAULT");
    const linkState = await lstat(path);
    if (!linkState.isFile() || linkState.isSymbolicLink()) throw new Error("SOURCE_ALIAS_REJECTED");
    const actual = await realpath(path);
    if (filesystemPathKey(actual) !== foldedPath) throw new Error("SOURCE_ALIAS_REJECTED");
    if ((await stat(path)).nlink > 1) throw new Error("SOURCE_HARDLINK_REJECTED");
    return readFile(path);
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
    this.#options = options;
  }

  /** Open an active generation without exposing its raw store reader. */
  static openActive(stateDirectory: string, options: RetrievalCoordinatorOptions): RetrievalCoordinator {
    validateCoordinatorOptions(options);
    const store = openActiveRetrievalStore(stateDirectory);
    try { return new RetrievalCoordinator(store, options, VERIFIED_STORE); }
    catch (error) { store.close(); throw error; }
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

    const chunks = this.#store.listChunks();
    const chunksBySource = new Map<string, RetrievalChunk[]>();
    for (const chunk of chunks) {
      const group = chunksBySource.get(chunk.source_id) ?? [];
      group.push(chunk);
      chunksBySource.set(chunk.source_id, group);
    }
    const policyEligible: RetrievalChunk[] = [];
    for (const group of chunksBySource.values()) {
      if (group.every((chunk) => matchesRetrievalFilters(chunk, request.filters, { vault_id: this.#store.manifest.vault_id }) && allowed(this.#options.discoverability_policy, chunk))) policyEligible.push(...group);
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
    const eligibleIds = eligible.map((chunk) => chunk.chunk_id);
    const lexical = this.#store.lexicalSearch(query, eligibleIds, lexicalTopK);
    const lexicalStage = this.#store.manifest.lexical_backend === "sqlite_fts5"
      ? stage("sqlite_fts5", "active", [])
      : stage("sqlite_lexical_scan", "degraded", [
        ...(!this.#store.fts5_available ? ["SQLITE_FTS5_UNAVAILABLE"] : []),
        "SQLITE_LEXICAL_SCAN_ACTIVE",
        "SQLITE_LEXICAL_SCAN_APPROXIMATION",
      ]);
    let vectorStage: RetrievalProviderStageStatus;
    let semantic: ReturnType<SqliteRetrievalStore["vectorSearch"]> = [];
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
        semantic = this.#store.vectorSearch([...queryVector], eligibleIds, semanticTopK, provider.provider_id, provider.model_id);
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
    const hits: RetrievalHit[] = [];
    let resultBytes = 0;
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
      let parent_context: RetrievalHit["parent_context"];
      if (request.parent_expansion && chunk.token_count < parentExpansionMaxChildTokens && chunk.parent_chunk_id) {
        const parent = eligibleById.get(chunk.parent_chunk_id);
        if (parent && Buffer.byteLength(parent.text, "utf8") <= (this.#options.max_parent_bytes ?? 8192)) {
          const parentCitation = verifiedCitation(parent, "", sourceBytes.get(parent.source_path)!);
          parent_context = { chunk_id: parent.chunk_id, text: parent.text, citation: parentCitation };
        }
      }
      const budget = this.#options.max_result_bytes ?? RETRIEVAL_MAX_RESULT_BYTES;
      const chunkBytes = Buffer.byteLength(chunk.text, "utf8");
      if (resultBytes + chunkBytes > budget) continue;
      if (parent_context && resultBytes + chunkBytes + Buffer.byteLength(parent_context.text, "utf8") > budget) parent_context = undefined;
      hits.push({ chunk: authorizedResultChunk(chunk, eligibleById), citation, stage_scores: scores, ...(parent_context ? { parent_context } : {}) });
      for (const key of evidence.span_keys) claimedMatchedSpans.add(key);
      acceptedIntervals.push({ source_id: chunk.source_id, start_byte: chunk.start_byte, end_byte: chunk.end_byte });
      resultBytes += chunkBytes + (parent_context ? Buffer.byteLength(parent_context.text, "utf8") : 0);
    }
    const stale = !!this.#options.stale || staleCitation;
    const resultScores = hits.map((hit) => hit.stage_scores);
    return {
      contract_version: RETRIEVAL_CONTRACT_VERSION,
      query_digest: retrievalSha256(query),
      projection_id: this.#store.manifest.projection_id,
      projection_digest: this.#store.manifest.projection_digest,
      projection_freshness: stale ? "stale" : "fresh",
      hits,
      confidence: assessRetrievalConfidence(resultScores, { vector: vectorStage, reranker: rerankerStage }, eligible.length, stale),
      applied_filters: appliedFilterNames(request.filters),
      eligible_result_count: eligible.length,
      stages: { lexical: lexicalStage, vector: vectorStage, reranker: rerankerStage },
    };
  }
}
