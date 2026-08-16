import { GkxIndex, type IndexChanges } from "../incremental";
import { deepFreeze } from "../canonical";
import { codeUnitCompare, normalizeVaultRelative, posixDirname } from "../paths";
import type { GraphDelta } from "../types";
import { discoverNavigation } from "./names";
import type { NavigationInvalidationResult, NavigationSnapshot, VaultNavigationConfig } from "./types";

function pathFromNodeId(nodeId: string): { path: string; file: boolean } | null {
  if (nodeId.startsWith("file:")) return { path: normalizeVaultRelative(nodeId.slice(5)), file: true };
  if (nodeId.startsWith("folder:")) return { path: normalizeVaultRelative(nodeId.slice(7)), file: false };
  return null;
}

function scopesForPaths(paths: readonly { path: string; file: boolean }[]): string[] {
  const scopes = new Set<string>();
  for (const item of paths) {
    let scope = item.file ? posixDirname(item.path) : item.path;
    if (scope === ".") scope = "";
    while (true) {
      scopes.add(scope);
      if (!scope) break;
      scope = posixDirname(scope);
      if (scope === ".") scope = "";
    }
  }
  return [...scopes].sort(codeUnitCompare);
}

export function invalidateNavigation(previousState: { affectedScopes?: readonly string[] } | null, delta: GraphDelta): string[] {
  const paths = [...delta.addedNodes, ...delta.removedNodes, ...delta.changedNodes].map(pathFromNodeId).filter((path): path is { path: string; file: boolean } => path !== null);
  if (delta.fullRebuild) return deepFreeze([""]);
  const scopes = scopesForPaths(paths);
  return deepFreeze(scopes.length ? scopes : [...(previousState?.affectedScopes ?? [])].sort(codeUnitCompare));
}

export function createNavigationIndex(): GkxIndex {
  return new GkxIndex();
}

/**
 * The only change-detection call is GkxIndex.applyChanges(). The caller then
 * supplies the resulting source snapshot; Navigation keeps no watcher cache or
 * second semantic source of truth.
 */
export function applyNavigationIndexChanges(
  index: GkxIndex,
  changes: IndexChanges,
  snapshotAfterChange: NavigationSnapshot,
  config: VaultNavigationConfig,
): NavigationInvalidationResult {
  const update = index.applyChanges(changes);
  return deepFreeze({
    delta: update.delta,
    affectedScopes: invalidateNavigation(null, update.delta),
    discovery: discoverNavigation(snapshotAfterChange, config),
  });
}
