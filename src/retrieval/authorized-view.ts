import { resolveGkxScopedCandidateDeclaration } from "../candidate-view";
import { computeTemporalState, projectAtTime } from "../temporal";
import type { LineageModel } from "../types";
import type {
  GkxRetrievalCandidateChunk,
  GkxRetrievalCandidateDeclaration,
  GkxRetrievalCandidateSource,
} from "./candidate-types";
import { retrievalCodeUnitCompare } from "./digest";
import { normalizeRetrievalAsOf, sealGkxRetrievalStoredSourceProvenance } from "./provenance";
import type {
  GkxRetrievalAuthorizedTemporalSource,
  GkxRetrievalStoredSourceProvenance,
} from "./types";

const AUTHORIZED_VIEW_CONFLICT = "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT";

export interface GkxRetrievalAuthorizedCandidateView {
  sources: GkxRetrievalStoredSourceProvenance[];
  temporal_sources: GkxRetrievalAuthorizedTemporalSource[];
  eligible_record_keys: string[];
  eligible_candidate_chunk_keys: string[];
  authorized_source_count: number;
  answerable_source_count: number;
}

function conflict(): never {
  // One deliberately non-content-bearing outcome covers every ratified
  // cross-record class. Do not attach a cause, UID, path, count, or receipt.
  throw new Error(AUTHORIZED_VIEW_CONFLICT);
}

function assertUniqueBy<T>(items: readonly T[], key: (item: T) => string): void {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) conflict();
    seen.add(value);
  }
}

function hasCycle(edges: readonly { newer: string; older: string }[]): boolean {
  const adjacent = new Map<string, string[]>();
  for (const edge of edges) adjacent.set(edge.newer, [...(adjacent.get(edge.newer) ?? []), edge.older]);
  const state = new Map<string, 0 | 1 | 2>();
  for (const start of adjacent.keys()) {
    if ((state.get(start) ?? 0) !== 0) continue;
    const stack: Array<{ key: string; offset: number }> = [{ key: start, offset: 0 }];
    state.set(start, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const next = (adjacent.get(frame.key) ?? [])[frame.offset++];
      if (next === undefined) {
        state.set(frame.key, 2);
        stack.pop();
      } else if ((state.get(next) ?? 0) === 1) {
        return true;
      } else if ((state.get(next) ?? 0) === 0) {
        state.set(next, 1);
        stack.push({ key: next, offset: 0 });
      }
    }
  }
  return false;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(retrievalCodeUnitCompare);
}

/**
 * Ratified Decision-A projection over an already source-policy, typed-filter,
 * and whole-source-chunk-policy authorized physical candidate subset.
 *
 * It consumes persisted parser receipts exactly as recorded. No raw reference
 * is reparsed, no candidate identity is invented, and no physical key escapes
 * the returned internal eligibility sets.
 */
export function buildGkxRetrievalAuthorizedCandidateView(
  candidateSources: readonly GkxRetrievalCandidateSource[],
  declarations: readonly GkxRetrievalCandidateDeclaration[],
  candidateChunks: readonly GkxRetrievalCandidateChunk[],
  normalizedAsOf: string | null,
): GkxRetrievalAuthorizedCandidateView {
  if (normalizedAsOf !== null && normalizeRetrievalAsOf(normalizedAsOf) !== normalizedAsOf) {
    throw new Error("GKX_RETRIEVAL_AUTHORIZED_TEMPORAL_AS_OF_NOT_NORMALIZED");
  }
  const sourceByKey = new Map(candidateSources.map((source) => [source.record_key, source]));
  if (sourceByKey.size !== candidateSources.length) throw new Error("GKX_RETRIEVAL_AUTHORIZED_CANDIDATE_DUPLICATE_KEY");
  if (candidateChunks.some((chunk) => !sourceByKey.has(chunk.record_key))) {
    throw new Error("GKX_RETRIEVAL_AUTHORIZED_CANDIDATE_CHUNK_ORPHAN");
  }

  const at = normalizedAsOf === null ? null : Date.parse(normalizedAsOf);
  const knownCreated = new Set<string>();
  const future = new Set<string>();
  const unknown = new Set<string>();
  for (const source of candidateSources) {
    if (at === null) knownCreated.add(source.record_key);
    else if (source.valid_from === null) unknown.add(source.record_key);
    else if (Date.parse(source.valid_from) > at) future.add(source.record_key);
    else knownCreated.add(source.record_key);
  }

  // All four cross-record classes are evaluated only after explicit-as_of has
  // removed future/unknown records. Hidden rows were removed by the caller's
  // three policy gates and therefore behave exactly like physical absence.
  const knownSources = candidateSources.filter((source) => knownCreated.has(source.record_key));
  assertUniqueBy(knownSources, (source) => source.source_id);
  assertUniqueBy(knownSources, (source) => source.source_path);
  const digestByParserFingerprint = new Map<string, string>();
  for (const source of knownSources) {
    const prior = digestByParserFingerprint.get(source.parser_content_fingerprint);
    if (prior !== undefined && prior !== source.source_digest) conflict();
    digestByParserFingerprint.set(source.parser_content_fingerprint, source.source_digest);
  }
  assertUniqueBy(
    candidateChunks.filter((chunk) => knownCreated.has(chunk.record_key)),
    (chunk) => chunk.chunk.chunk_id,
  );

  const availability = { known_created: knownCreated, future, unknown };
  const edgeKeys = new Set<string>();
  const edges: Array<{ newer: string; older: string }> = [];
  const declarationsBySource = new Map<string, GkxRetrievalCandidateDeclaration[]>();
  for (const declaration of declarations) {
    if (!sourceByKey.has(declaration.source_record_key)) continue;
    const group = declarationsBySource.get(declaration.source_record_key) ?? [];
    group.push(declaration);
    declarationsBySource.set(declaration.source_record_key, group);
    if (!knownCreated.has(declaration.source_record_key) || declaration.category === "link") continue;
    const resolved = resolveGkxScopedCandidateDeclaration(declaration, availability);
    if (resolved.status === "suppressed_future" || resolved.status === "suppressed_unknown") continue;
    if (resolved.status === "unresolved" || resolved.status === "ambiguous") conflict();
    if (resolved.status === "self") {
      if (declaration.category === "relationship" && declaration.field === "relationships.related_to") continue;
      conflict();
    }
    if (resolved.status !== "resolved") conflict();
    if (declaration.category !== "lineage") continue;
    const edge = declaration.field === "supersedes"
      ? { newer: declaration.source_record_key, older: resolved.record_key }
      : { newer: resolved.record_key, older: declaration.source_record_key };
    const key = `${edge.newer}\0${edge.older}`;
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      edges.push(edge);
    }
  }
  edges.sort((left, right) => retrievalCodeUnitCompare(left.newer, right.newer) || retrievalCodeUnitCompare(left.older, right.older));

  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const edge of edges) {
    successors.set(edge.older, [...(successors.get(edge.older) ?? []), edge.newer]);
    predecessors.set(edge.newer, [...(predecessors.get(edge.newer) ?? []), edge.older]);
    const newer = sourceByKey.get(edge.newer)!;
    const older = sourceByKey.get(edge.older)!;
    if (newer.valid_from !== null && older.valid_from !== null && Date.parse(newer.valid_from) < Date.parse(older.valid_from)) conflict();
  }
  if ([...successors.values()].some((items) => new Set(items).size > 1) || hasCycle(edges)) conflict();
  for (const values of [...successors.values(), ...predecessors.values()]) values.sort(retrievalCodeUnitCompare);

  const includedKeys = at === null
    ? new Set(candidateSources.map((source) => source.record_key))
    : new Set([...knownCreated, ...unknown]);
  const includedSources = candidateSources.filter((source) => includedKeys.has(source.record_key));
  const lineage: LineageModel = {
    edges,
    supersedes: predecessors,
    supersededBy: successors,
    warnings: [],
    members: new Set(edges.flatMap((edge) => [edge.newer, edge.older])),
    cycles: 0,
  };
  const temporalInputs = includedSources
    .filter((source) => source.valid_from !== null)
    .map((source) => ({ id: source.record_key, validAtMs: Date.parse(source.valid_from!) }));
  const temporal = computeTemporalState(temporalInputs, lineage);
  const eligibleRecordKeys = at === null
    ? [...includedKeys]
    : projectAtTime(temporalInputs.map((item) => ({
      id: item.id,
      validAtMs: item.validAtMs,
      invalidAtMs: temporal.invalidAt.get(item.id) ?? null,
    })), at).valid;
  const eligible = new Set(eligibleRecordKeys);

  const temporalByKey = new Map<string, GkxRetrievalAuthorizedTemporalSource>();
  const storedByKey = new Map<string, GkxRetrievalStoredSourceProvenance>();
  for (const source of includedSources) {
    const resolvedSupersedes = sortedUnique((predecessors.get(source.record_key) ?? []).map((key) => sourceByKey.get(key)!.source_id));
    const resolvedSupersededBy = sortedUnique((successors.get(source.record_key) ?? []).map((key) => sourceByKey.get(key)!.source_id));
    const authored = declarationsBySource.get(source.record_key) ?? [];
    const authoredSupersedes = sortedUnique(authored
      .filter((item) => item.category === "lineage" && item.origin === "authored" && item.field === "supersedes")
      .map((item) => item.raw_reference));
    const authoredSupersededBy = sortedUnique(authored
      .filter((item) => item.category === "lineage" && item.origin === "authored" && item.field === "superseded_by")
      .map((item) => item.raw_reference));
    const invalidAt = source.valid_from === null ? null : temporal.invalidAt.get(source.record_key) ?? null;
    const temporalState = source.valid_from === null ? "unknown" as const : invalidAt === null ? "current" as const : "historical" as const;
    const validTo = invalidAt === null ? null : new Date(invalidAt).toISOString();
    const neutral = authoredSupersedes.length === 0 && authoredSupersededBy.length === 0 &&
      resolvedSupersedes.length === 0 && resolvedSupersededBy.length === 0;
    const stored = sealGkxRetrievalStoredSourceProvenance({
      source_id: source.source_id,
      source_path: source.source_path,
      source_digest: source.source_digest,
      source_metadata: source.source_metadata,
      assertion_time: source.assertion_time,
      assertion_origin: source.assertion_origin,
      valid_from: source.valid_from,
      valid_to: validTo,
      validity_origin: source.validity_origin,
      lineage_id: null,
      authored_supersedes: authoredSupersedes,
      authored_superseded_by: authoredSupersededBy,
      resolved_supersedes: resolvedSupersedes,
      resolved_superseded_by: resolvedSupersededBy,
      lineage_neutral: neutral,
      temporal_state: temporalState,
      ledger_binding_verified: false,
      reason_codes: sortedUnique([...source.reason_codes, neutral ? "LINEAGE_NEUTRAL" : "LINEAGE_PARTICIPANT"]),
    });
    storedByKey.set(source.record_key, stored);
    temporalByKey.set(source.record_key, {
      source_id: source.source_id,
      valid_from: source.valid_from,
      valid_to: validTo,
      temporal_state: temporalState,
      supersedes: resolvedSupersedes,
      superseded_by: resolvedSupersededBy,
    });
  }

  return {
    // Only record-key eligible rows cross this boundary. In particular, an
    // explicit-as_of unknown candidate may share a public UID/path with a
    // known row without entering the scoped coordinate through a later
    // public-identity lookup. Unknown rows survive solely in the two coverage
    // counts below.
    sources: [...eligible]
      .map((recordKey) => storedByKey.get(recordKey)!)
      .sort((left, right) => retrievalCodeUnitCompare(left.source_id, right.source_id)),
    temporal_sources: [...eligible]
      .map((recordKey) => temporalByKey.get(recordKey)!)
      .sort((left, right) => retrievalCodeUnitCompare(left.source_id, right.source_id)),
    eligible_record_keys: [...eligible].sort(retrievalCodeUnitCompare),
    eligible_candidate_chunk_keys: candidateChunks
      .filter((chunk) => eligible.has(chunk.record_key))
      .map((chunk) => chunk.candidate_chunk_key)
      .sort(retrievalCodeUnitCompare),
    authorized_source_count: includedSources.length,
    answerable_source_count: includedSources.filter((source) => source.valid_from !== null).length,
  };
}
