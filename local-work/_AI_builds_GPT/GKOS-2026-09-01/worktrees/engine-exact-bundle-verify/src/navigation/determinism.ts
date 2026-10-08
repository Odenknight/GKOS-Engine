import { canonicalJson, canonicalSha256, sha256Bytes } from "../canonical";
import { codeUnitCompare, normalizeVaultRelative } from "../paths";
import type { NavigationSnapshot, NavigationSource } from "./types";

export { canonicalJson as canonicalNavigationJson };

export function canonicalNavigationSources(snapshot: NavigationSnapshot): NavigationSource[] {
  return snapshot.sources.map((source) => ({
    ...source,
    relativePath: normalizeVaultRelative(source.relativePath),
    content: source.content.replace(/\r\n?/g, "\n"),
    relationships: source.relationships
      ? [...source.relationships].map((relationship) => ({ ...relationship })).sort((a, b) =>
          codeUnitCompare(a.kind, b.kind)
          || codeUnitCompare(a.targetStableId ?? "", b.targetStableId ?? "")
          || codeUnitCompare(a.targetPath ?? "", b.targetPath ?? ""))
      : undefined,
  })).sort((a, b) => codeUnitCompare(a.relativePath, b.relativePath));
}

export async function navigationSourceDigest(source: NavigationSource): Promise<string> {
  return source.digest ?? sha256Bytes(source.content);
}

export async function navigationSnapshotDigest(snapshot: NavigationSnapshot): Promise<string> {
  const rows = [];
  for (const source of canonicalNavigationSources(snapshot)) {
    rows.push({
      path: source.relativePath,
      stableId: source.stableId ?? null,
      version: source.version ?? null,
      digest: await navigationSourceDigest(source),
      relationships: source.relationships ?? [],
    });
  }
  return canonicalSha256({ vaultId: snapshot.vaultId, sources: rows, directories: [...(snapshot.directories ?? [])].map(normalizeVaultRelative).sort(codeUnitCompare) });
}
