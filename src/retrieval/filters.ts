import type { GkxSensitivity } from "../types";
import { isValidGkxTimestamp } from "../timestamps";
import { retrievalCodeUnitCompare, stableJson } from "./digest";
import type { RetrievalChunk, RetrievalFilters } from "./types";

const SENSITIVITY_ORDER: readonly GkxSensitivity[] = [
  "public", "internal", "restricted", "confidential", "regulated", "phi", "secret",
];

const FILTER_FIELDS = new Set([
  "vault", "path_include", "path_exclude", "tags_any", "tags_all", "topics", "categories",
  "authored_from", "authored_to", "sensitivity_ceiling", "gkx_types", "epistemic_states",
  "governance_states", "review_states", "authoritative", "moc_relationships", "source_digests",
  "author_agent_ids", "minimum_quality", "include_archives",
]);
const FILTER_STRING_ARRAY_FIELDS = [
  "path_include", "path_exclude", "tags_any", "tags_all", "topics", "categories", "gkx_types",
  "epistemic_states", "governance_states", "review_states", "source_digests",
] as const;

function boundedFilterString(value: unknown, coordinate: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > 1024 || value.includes("\0")) {
    throw new TypeError(`RETRIEVAL_FILTER_INVALID:${coordinate}`);
  }
}

function boundedStringArray(value: unknown, coordinate: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length > 256) throw new TypeError(`RETRIEVAL_FILTER_INVALID:${coordinate}`);
  for (const item of value) boundedFilterString(item, coordinate);
}

function validPortableGlob(value: string): boolean {
  if (value.includes("\\") || value.startsWith("/") || value.endsWith("/") || value.includes("//") || /[\u0000-\u001f<>:"|]/u.test(value)) return false;
  return value.split("/").every((segment) => segment !== "." && segment !== "..");
}

/** Strict JSON/MCP request validation performed once before policy or scoring. */
export function validateRetrievalFilters(value: unknown): asserts value is RetrievalFilters | undefined {
  if (value === undefined) return;
  if (value === null || Array.isArray(value) || typeof value !== "object" ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError("RETRIEVAL_FILTER_INVALID:object");
  }
  const filters = value as Record<string, unknown>;
  for (const key of Reflect.ownKeys(filters)) {
    if (typeof key !== "string" || !FILTER_FIELDS.has(key)) throw new TypeError("RETRIEVAL_FILTER_UNKNOWN_FIELD");
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(filters, key) : undefined;
    if (!descriptor?.enumerable || !("value" in descriptor) || descriptor.value === undefined) throw new TypeError("RETRIEVAL_FILTER_INVALID:object");
  }
  if (Object.hasOwn(filters, "moc_relationships") || Object.hasOwn(filters, "author_agent_ids")) {
    throw new Error("RETRIEVAL_FILTER_AUTHORIZED_RESOLVER_REQUIRED");
  }
  // Reject accessors, sparse arrays, lone surrogates, cycles, exotic objects,
  // and unsafe numbers before any field-specific iteration can observe them.
  try { stableJson(filters); }
  catch { throw new TypeError("RETRIEVAL_FILTER_INVALID:json"); }
  for (const field of FILTER_STRING_ARRAY_FIELDS) {
    if (filters[field] !== undefined) boundedStringArray(filters[field], field);
  }
  for (const field of ["path_include", "path_exclude"] as const) {
    if (filters[field] !== undefined && (filters[field] as string[]).some((glob) => !validPortableGlob(glob))) {
      throw new TypeError(`RETRIEVAL_FILTER_INVALID:${field}`);
    }
  }
  if (filters.source_digests !== undefined && (filters.source_digests as string[]).some((digest) => !/^sha256:[0-9a-f]{64}$/u.test(digest))) {
    throw new TypeError("RETRIEVAL_FILTER_INVALID:source_digests");
  }
  if (filters.vault !== undefined) boundedFilterString(filters.vault, "vault");
  for (const field of ["authored_from", "authored_to"] as const) {
    if (filters[field] !== undefined && (typeof filters[field] !== "string" || !isValidGkxTimestamp(filters[field] as string))) {
      throw new TypeError(`RETRIEVAL_FILTER_INVALID:${field}`);
    }
  }
  if (filters.sensitivity_ceiling !== undefined && (typeof filters.sensitivity_ceiling !== "string" || !SENSITIVITY_ORDER.includes(filters.sensitivity_ceiling as GkxSensitivity))) {
    throw new TypeError("RETRIEVAL_FILTER_INVALID:sensitivity_ceiling");
  }
  for (const field of ["authoritative", "include_archives"] as const) {
    if (filters[field] !== undefined && typeof filters[field] !== "boolean") throw new TypeError(`RETRIEVAL_FILTER_INVALID:${field}`);
  }
  if (filters.minimum_quality !== undefined && (typeof filters.minimum_quality !== "number" || !Number.isFinite(filters.minimum_quality) || filters.minimum_quality < 0 || filters.minimum_quality > 1)) {
    throw new TypeError("RETRIEVAL_FILTER_INVALID:minimum_quality");
  }
}

function same(left: string | undefined, candidates: readonly string[] | undefined): boolean {
  return !candidates?.length || (left !== undefined && candidates.includes(left));
}

function intersects(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  return !right?.length || right.some((value) => left?.includes(value));
}

function containsAll(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  return !right?.length || right.every((value) => left?.includes(value));
}

function anyGlob(path: string, globs: readonly string[] | undefined): boolean {
  return !!globs?.some((glob) => globMatches(path, glob.replace(/\\/g, "/")));
}

/** Memoized Unicode-code-point matcher shared with Lite's Rust adapter. */
function globMatches(path: string, glob: string): boolean {
  const pathPoints = [...path];
  const globPoints = [...glob];
  const memo = new Map<string, boolean>();
  const visit = (pathIndex: number, globIndex: number): boolean => {
    const key = `${pathIndex}:${globIndex}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const expected = globPoints[globIndex];
    let answer: boolean;
    if (expected === undefined) answer = pathIndex === pathPoints.length;
    else if (expected === "*" && globPoints[globIndex + 1] === "*") {
      answer = visit(pathIndex, globIndex + 2)
        || (pathIndex < pathPoints.length && visit(pathIndex + 1, globIndex));
    } else if (expected === "*") {
      answer = visit(pathIndex, globIndex + 1)
        || (pathPoints[pathIndex] !== undefined && pathPoints[pathIndex] !== "/" && visit(pathIndex + 1, globIndex));
    } else if (expected === "?") {
      answer = pathPoints[pathIndex] !== undefined
        && pathPoints[pathIndex] !== "/"
        && visit(pathIndex + 1, globIndex + 1);
    } else {
      answer = pathPoints[pathIndex] === expected && visit(pathIndex + 1, globIndex + 1);
    }
    memo.set(key, answer);
    return answer;
  };
  return visit(0, 0);
}

function validDate(value: string | undefined): number | null {
  if (value === undefined) return null;
  return isValidGkxTimestamp(value) ? Date.parse(value) : NaN;
}

/** Typed-only filters; no SQL fragments or executable predicates cross the contract. */
export function matchesRetrievalFilters(
  chunk: Readonly<RetrievalChunk>,
  filters: Readonly<RetrievalFilters> = {},
  context?: { vault_id: string },
): boolean {
  const metadata = chunk.metadata;
  if (filters.vault !== undefined && (!context || filters.vault !== context.vault_id)) return false;
  if (filters.path_include?.length && !anyGlob(chunk.source_path, filters.path_include)) return false;
  if (filters.path_exclude?.length && anyGlob(chunk.source_path, filters.path_exclude)) return false;
  if (!filters.include_archives && (metadata.archived === true || /(?:^|\/)(?:archive|archives)(?:\/|$)/i.test(chunk.source_path))) return false;
  if (!intersects(metadata.tags, filters.tags_any)) return false;
  if (!containsAll(metadata.tags, filters.tags_all)) return false;
  if (!same(metadata.topic, filters.topics)) return false;
  if (!same(metadata.category, filters.categories)) return false;
  if (!same(metadata.gkx_type, filters.gkx_types)) return false;
  if (!same(metadata.epistemic_state, filters.epistemic_states)) return false;
  if (!same(metadata.governance_state, filters.governance_states)) return false;
  if (!same(metadata.review_state, filters.review_states)) return false;
  if (!same(metadata.author_agent_id, filters.author_agent_ids)) return false;
  if (filters.authoritative !== undefined && metadata.authoritative !== filters.authoritative) return false;
  if (!intersects(metadata.moc_relationships, filters.moc_relationships)) return false;
  if (filters.source_digests?.length && !filters.source_digests.includes(chunk.source_digest)) return false;
  if (filters.minimum_quality !== undefined) {
    if (!Number.isFinite(filters.minimum_quality) || filters.minimum_quality < 0 || filters.minimum_quality > 1) throw new TypeError("minimum_quality must be finite and within [0, 1].");
    if (typeof metadata.quality !== "number" || !Number.isFinite(metadata.quality) || metadata.quality < filters.minimum_quality) return false;
  }
  if (filters.sensitivity_ceiling) {
    const ceiling = SENSITIVITY_ORDER.indexOf(filters.sensitivity_ceiling);
    if (ceiling < 0) throw new TypeError("sensitivity_ceiling is invalid.");
    const declared = SENSITIVITY_ORDER.indexOf(metadata.sensitivity as GkxSensitivity);
    const effective = declared < 0 ? SENSITIVITY_ORDER.length - 1 : declared;
    if (effective > ceiling) return false;
  }
  const from = validDate(filters.authored_from);
  const to = validDate(filters.authored_to);
  if (Number.isNaN(from) || Number.isNaN(to)) throw new TypeError("Authored date filters must be valid timestamps.");
  if (from !== null || to !== null) {
    const authored = validDate(metadata.authored_at);
    if (authored === null || Number.isNaN(authored)) return false;
    if (from !== null && authored < from) return false;
    if (to !== null && authored >= to) return false;
  }
  return true;
}

export function appliedFilterNames(filters: Readonly<RetrievalFilters> = {}): string[] {
  return Object.entries(filters)
    .filter(([, value]) => value !== undefined && (!Array.isArray(value) || value.length > 0))
    .map(([key]) => key)
    .sort(retrievalCodeUnitCompare);
}
