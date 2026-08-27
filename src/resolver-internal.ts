import {
  basenameWithoutExtension,
  normalizeVaultRelative,
  posixBasename,
  posixDirname,
  posixJoin,
  toPosixPath,
  withoutExtension,
} from "./paths";

export type CanonicalResolutionBasis =
  | "path_exact"
  | "path_relative"
  | "path_without_extension_exact"
  | "path_without_extension_relative"
  | "basename_title"
  | "alias";

export interface CanonicalResolutionTier {
  basis: CanonicalResolutionBasis;
  candidate_keys: readonly string[];
}

export interface CanonicalResolverCandidateIndex {
  by_path: Map<string, string[]>;
  by_path_without_extension: Map<string, string[]>;
  by_basename: Map<string, string[]>;
  by_alias: Map<string, string[]>;
}

export function createCanonicalResolverCandidateIndex(): CanonicalResolverCandidateIndex {
  return {
    by_path: new Map(),
    by_path_without_extension: new Map(),
    by_basename: new Map(),
    by_alias: new Map(),
  };
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const current = map.get(key) ?? [];
  current.push(value);
  map.set(key, current);
}

export function addCanonicalResolverCandidate(
  index: CanonicalResolverCandidateIndex,
  relativePath: string,
  candidateKey: string,
  aliases: readonly string[] = [],
): void {
  const normalized = normalizeVaultRelative(relativePath);
  push(index.by_path, normalized.toLowerCase(), candidateKey);
  push(index.by_path_without_extension, withoutExtension(normalized).toLowerCase(), candidateKey);
  push(index.by_basename, basenameWithoutExtension(normalized).toLowerCase(), candidateKey);
  for (const alias of aliases) push(index.by_alias, alias.trim().toLowerCase(), candidateKey);
}

function sortedUnique(values: readonly string[] | undefined): readonly string[] {
  return Object.freeze([...new Set(values ?? [])].sort());
}

/** Exact existing lineage resolver precedence: path, path-no-ext, basename/title, alias. */
export function canonicalTitleResolutionTiers(
  index: CanonicalResolverCandidateIndex,
  reference: string,
): readonly CanonicalResolutionTier[] {
  const key = String(reference || "").trim().toLowerCase();
  return Object.freeze([
    Object.freeze({ basis: "path_exact" as const, candidate_keys: sortedUnique(index.by_path.get(key)) }),
    Object.freeze({ basis: "path_without_extension_exact" as const, candidate_keys: sortedUnique(index.by_path_without_extension.get(key)) }),
    Object.freeze({ basis: "basename_title" as const, candidate_keys: sortedUnique(index.by_basename.get(key)) }),
    Object.freeze({ basis: "alias" as const, candidate_keys: sortedUnique(index.by_alias.get(key)) }),
  ]);
}

function cleanLinkTarget(target: string): string {
  return normalizeVaultRelative(
    toPosixPath(target).replace(/^<|>$/g, "").split("#")[0].split("|")[0].trim(),
  );
}

/** Exact existing link precedence, including its source-relative path tiers. */
export function canonicalLinkResolutionTiers(
  index: CanonicalResolverCandidateIndex,
  sourcePath: string,
  target: string,
): readonly CanonicalResolutionTier[] {
  const normalizedTarget = cleanLinkTarget(target);
  if (!normalizedTarget) return Object.freeze([]);
  const direct = normalizedTarget.toLowerCase();
  const directory = posixDirname(normalizeVaultRelative(sourcePath));
  const relative = directory && directory !== "." ? posixJoin(directory, normalizedTarget).toLowerCase() : direct;
  const basename = posixBasename(withoutExtension(direct));
  return Object.freeze([
    Object.freeze({ basis: "path_exact" as const, candidate_keys: sortedUnique(index.by_path.get(direct)) }),
    Object.freeze({ basis: "path_relative" as const, candidate_keys: sortedUnique(index.by_path.get(relative)) }),
    Object.freeze({ basis: "path_without_extension_exact" as const, candidate_keys: sortedUnique(index.by_path_without_extension.get(direct)) }),
    Object.freeze({ basis: "path_without_extension_relative" as const, candidate_keys: sortedUnique(index.by_path_without_extension.get(relative)) }),
    Object.freeze({ basis: "alias" as const, candidate_keys: sortedUnique(index.by_alias.get(direct)) }),
    Object.freeze({ basis: "basename_title" as const, candidate_keys: sortedUnique(index.by_basename.get(basename)) }),
  ]);
}

export function firstCanonicalResolutionTier(
  tiers: readonly CanonicalResolutionTier[],
  allowed?: ReadonlySet<string>,
): CanonicalResolutionTier | null {
  for (const tier of tiers) {
    const candidates = allowed === undefined
      ? tier.candidate_keys
      : tier.candidate_keys.filter((candidate) => allowed.has(candidate));
    if (candidates.length > 0) return Object.freeze({ basis: tier.basis, candidate_keys: Object.freeze([...candidates]) });
  }
  return null;
}
