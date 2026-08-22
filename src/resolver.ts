/**
 * Gkx Core — link target resolution.
 * Resolves a link target (path / path-without-extension / basename / alias)
 * to a node id, tracking ambiguity so diagnostics can report it (§3.5, §32).
 */
import {
  basenameWithoutExtension,
  normalizeVaultRelative,
  posixBasename,
  posixDirname,
  posixJoin,
  toPosixPath,
  withoutExtension,
} from "./paths";
import {
  addCanonicalResolverCandidate,
  canonicalLinkResolutionTiers,
  canonicalTitleResolutionTiers,
  createCanonicalResolverCandidateIndex,
  firstCanonicalResolutionTier,
  type CanonicalResolverCandidateIndex,
} from "./resolver-internal";

export interface Resolver {
  byPath: Map<string, string>;
  byPathNoExt: Map<string, string>;
  byBasename: Map<string, string[]>;
  byAlias: Map<string, string[]>;
  /** Keys that resolved ambiguously at least once (for diagnostics). */
  ambiguous: Set<string>;
}

const CANDIDATE_INDEX = new WeakMap<Resolver, CanonicalResolverCandidateIndex>();

export function createResolver(): Resolver {
  const resolver: Resolver = {
    byPath: new Map(),
    byPathNoExt: new Map(),
    byBasename: new Map(),
    byAlias: new Map(),
    ambiguous: new Set(),
  };
  CANDIDATE_INDEX.set(resolver, createCanonicalResolverCandidateIndex());
  return resolver;
}

function pushMulti(map: Map<string, string[]>, key: string, val: string): void {
  const cur = map.get(key) ?? [];
  cur.push(val);
  map.set(key, cur);
}

export function addFileToResolver(idx: Resolver, relPath: string, nodeId: string, aliases: string[] = []): void {
  const n = normalizeVaultRelative(relPath);
  idx.byPath.set(n.toLowerCase(), nodeId);
  idx.byPathNoExt.set(withoutExtension(n).toLowerCase(), nodeId);
  pushMulti(idx.byBasename, basenameWithoutExtension(n).toLowerCase(), nodeId);
  for (const a of aliases) pushMulti(idx.byAlias, a.trim().toLowerCase(), nodeId);
  const candidates = CANDIDATE_INDEX.get(idx);
  if (candidates) addCanonicalResolverCandidate(candidates, relPath, nodeId, aliases);
}

export function cleanTarget(t: string): string {
  return normalizeVaultRelative(
    toPosixPath(t).replace(/^<|>$/g, "").split("#")[0].split("|")[0].trim()
  );
}

export const unresolvedId = (t: string): string => `unresolved:${cleanTarget(t).toLowerCase()}`;

/** Deterministically pick from ambiguous candidates (sorted-first), recording ambiguity. */
function pickCandidate(idx: Resolver, key: string, c: string[] | undefined): string | undefined {
  if (!c || !c.length) return undefined;
  const uniq = [...new Set(c)];
  if (uniq.length > 1) idx.ambiguous.add(key);
  return uniq.sort()[0];
}

/** Resolve a link target to a node id, or undefined when unresolved. */
export function resolveLinkTarget(idx: Resolver, sourcePath: string, target: string): string | undefined {
  const candidates = CANDIDATE_INDEX.get(idx);
  if (candidates) {
    const selected = firstCanonicalResolutionTier(canonicalLinkResolutionTiers(candidates, sourcePath, target));
    if (!selected) return undefined;
    if (selected.candidate_keys.length > 1) idx.ambiguous.add(cleanTarget(target).toLowerCase());
    return selected.candidate_keys[0];
  }
  const nt = cleanTarget(target);
  if (!nt) return undefined;
  const direct = nt.toLowerCase();
  const dir = posixDirname(normalizeVaultRelative(sourcePath));
  const rel = dir && dir !== "." ? posixJoin(dir, nt).toLowerCase() : direct;
  const base = posixBasename(withoutExtension(direct));
  return (
    idx.byPath.get(direct) ?? idx.byPath.get(rel) ??
    idx.byPathNoExt.get(direct) ?? idx.byPathNoExt.get(rel) ??
    pickCandidate(idx, direct, idx.byAlias.get(direct)) ??
    pickCandidate(idx, base, idx.byBasename.get(base))
  );
}

/**
 * Resolve an GKX lineage reference (title / basename / path / alias).
 * Reports whether the resolution was ambiguous so lineage validation can warn.
 */
export function resolveTitleRef(
  idx: Resolver,
  ref: string
): { id?: string; ambiguous: boolean } {
  const k = String(ref || "").trim().toLowerCase();
  if (!k) return { ambiguous: false };
  const candidates = CANDIDATE_INDEX.get(idx);
  if (candidates) {
    const selected = firstCanonicalResolutionTier(canonicalTitleResolutionTiers(candidates, ref));
    if (!selected) return { ambiguous: false };
    return {
      id: selected.candidate_keys[0],
      ambiguous: selected.candidate_keys.length > 1,
    };
  }
  // Compatibility for callers that constructed the public Resolver shape
  // directly rather than through createResolver(). This is the same frozen
  // path -> path-no-ext -> basename/title -> alias precedence.
  const direct = idx.byPath.get(k) ?? idx.byPathNoExt.get(k);
  if (direct) return { id: direct, ambiguous: false };
  const byBase = idx.byBasename.get(k);
  if (byBase?.length) {
    const uniq = [...new Set(byBase)].sort();
    return { id: uniq[0], ambiguous: uniq.length > 1 };
  }
  const byAlias = idx.byAlias.get(k);
  if (byAlias?.length) {
    const uniq = [...new Set(byAlias)].sort();
    return { id: uniq[0], ambiguous: uniq.length > 1 };
  }
  return { ambiguous: false };
}
