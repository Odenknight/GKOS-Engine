import { canonicalJson, deepFreeze, sha256Bytes } from "../canonical";
import { codeUnitCompare, normalizeVaultRelative } from "../paths";
import { canonicalNavigationSources, navigationSourceDigest } from "./determinism";
import type {
  NavigationCandidate,
  NavigationDiff,
  NavigationDiffItem,
  NavigationDiffReason,
  NavigationSnapshot,
  NavigationSource,
} from "./types";

const REASON_ORDER: NavigationDiffReason[] = [
  "MOVE_STABLE_ID", "MOVE_EXACT_CONTENT", "CONTENT_CHANGED", "RELATIONSHIP_CHANGED", "ORDER_CHANGED",
  "MANAGED_REGION_CHANGED", "HUMAN_REGION_CHANGED", "ADDED", "REMOVED", "POLICY_CHANGED", "CONFIG_CHANGED",
];

function itemCompare(a: NavigationDiffItem, b: NavigationDiffItem): number {
  return REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason)
    || codeUnitCompare(a.stableId ?? "", b.stableId ?? "")
    || codeUnitCompare(a.fromPath ?? "", b.fromPath ?? "")
    || codeUnitCompare(a.toPath ?? "", b.toPath ?? "");
}

function relationships(source: NavigationSource): string {
  return canonicalJson(source.relationships ?? []);
}

async function changedItems(before: NavigationSource, after: NavigationSource, identityEvidence: NavigationDiffItem["identityEvidence"]): Promise<NavigationDiffItem[]> {
  const items: NavigationDiffItem[] = [];
  const fromPath = normalizeVaultRelative(before.relativePath), toPath = normalizeVaultRelative(after.relativePath);
  const beforeDigest = await navigationSourceDigest(before), afterDigest = await navigationSourceDigest(after);
  if (beforeDigest !== afterDigest) items.push({ reason: "CONTENT_CHANGED", identityEvidence, ...(after.stableId ? { stableId: after.stableId } : {}), fromPath, toPath, beforeDigest, afterDigest });
  if (relationships(before) !== relationships(after)) items.push({ reason: "RELATIONSHIP_CHANGED", identityEvidence, ...(after.stableId ? { stableId: after.stableId } : {}), fromPath, toPath, beforeDigest, afterDigest });
  return items;
}

export async function diffNavigation(beforeSnapshot: NavigationSnapshot, afterSnapshot: NavigationSnapshot): Promise<NavigationDiff> {
  const before = canonicalNavigationSources(beforeSnapshot), after = canonicalNavigationSources(afterSnapshot);
  const usedBefore = new Set<NavigationSource>(), usedAfter = new Set<NavigationSource>();
  const items: NavigationDiffItem[] = [];

  const beforeStable = new Map<string, NavigationSource[]>(), afterStable = new Map<string, NavigationSource[]>();
  for (const source of before) if (source.stableId) beforeStable.set(source.stableId, [...(beforeStable.get(source.stableId) ?? []), source]);
  for (const source of after) if (source.stableId) afterStable.set(source.stableId, [...(afterStable.get(source.stableId) ?? []), source]);
  for (const stableId of [...new Set([...beforeStable.keys(), ...afterStable.keys()])].sort(codeUnitCompare)) {
    const left = beforeStable.get(stableId), right = afterStable.get(stableId);
    if (left?.length !== 1 || right?.length !== 1) continue;
    const a = left[0], b = right[0]; usedBefore.add(a); usedAfter.add(b);
    const fromPath = normalizeVaultRelative(a.relativePath), toPath = normalizeVaultRelative(b.relativePath);
    if (fromPath !== toPath) items.push({ reason: "MOVE_STABLE_ID", identityEvidence: "stable-id", stableId, fromPath, toPath, beforeDigest: await navigationSourceDigest(a), afterDigest: await navigationSourceDigest(b) });
    items.push(...await changedItems(a, b, "stable-id"));
  }

  const remainingBefore = before.filter((source) => !usedBefore.has(source));
  const remainingAfter = after.filter((source) => !usedAfter.has(source));
  const byDigestBefore = new Map<string, NavigationSource[]>(), byDigestAfter = new Map<string, NavigationSource[]>();
  for (const source of remainingBefore) { const digest = await navigationSourceDigest(source); byDigestBefore.set(digest, [...(byDigestBefore.get(digest) ?? []), source]); }
  for (const source of remainingAfter) { const digest = await navigationSourceDigest(source); byDigestAfter.set(digest, [...(byDigestAfter.get(digest) ?? []), source]); }
  for (const digest of [...new Set([...byDigestBefore.keys(), ...byDigestAfter.keys()])].sort(codeUnitCompare)) {
    const left = byDigestBefore.get(digest), right = byDigestAfter.get(digest);
    if (left?.length !== 1 || right?.length !== 1) continue;
    const a = left[0], b = right[0];
    const fromPath = normalizeVaultRelative(a.relativePath), toPath = normalizeVaultRelative(b.relativePath);
    if (fromPath === toPath) continue;
    usedBefore.add(a); usedAfter.add(b);
    items.push({ reason: "MOVE_EXACT_CONTENT", identityEvidence: "exact-content-observation", fromPath, toPath, beforeDigest: digest, afterDigest: digest });
  }

  const remainingByPath = new Map(after.filter((source) => !usedAfter.has(source)).map((source) => [normalizeVaultRelative(source.relativePath), source]));
  for (const a of before.filter((source) => !usedBefore.has(source))) {
    const path = normalizeVaultRelative(a.relativePath), b = remainingByPath.get(path);
    if (!b) continue;
    usedBefore.add(a); usedAfter.add(b); remainingByPath.delete(path);
    items.push(...await changedItems(a, b, "none"));
  }

  for (const source of before.filter((candidate) => !usedBefore.has(candidate))) items.push({
    reason: "REMOVED", identityEvidence: "none", ...(source.stableId ? { stableId: source.stableId } : {}),
    fromPath: normalizeVaultRelative(source.relativePath), beforeDigest: await navigationSourceDigest(source),
  });
  for (const source of after.filter((candidate) => !usedAfter.has(candidate))) items.push({
    reason: "ADDED", identityEvidence: "none", ...(source.stableId ? { stableId: source.stableId } : {}),
    toPath: normalizeVaultRelative(source.relativePath), afterDigest: await navigationSourceDigest(source),
  });
  items.sort(itemCompare);
  return deepFreeze({ artifactKind: "engine.navigation-diff", items, text: renderNavigationDiff(items) });
}

function regions(bytes: string): { managed: string; human: string; order: string[] } {
  const normalized = bytes.replace(/\r\n?/g, "\n");
  const startToken = "<!-- gkos-navigation:managed:start -->", endToken = "<!-- gkos-navigation:managed:end -->";
  const start = normalized.indexOf(startToken), end = normalized.indexOf(endToken);
  if (start < 0 || end < start) return { managed: "", human: normalized, order: [] };
  const managed = normalized.slice(start + startToken.length, end);
  return {
    managed,
    human: `${normalized.slice(0, start)}${normalized.slice(end + endToken.length)}`,
    order: managed.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("- [[")),
  };
}

export async function diffNavigationArtifact(before: NavigationCandidate, after: NavigationCandidate): Promise<NavigationDiff> {
  const items: NavigationDiffItem[] = [];
  const base = { identityEvidence: "none" as const, fromPath: before.targetPath, toPath: after.targetPath, beforeDigest: before.digest, afterDigest: after.digest };
  if (before.configRef.digest !== after.configRef.digest) items.push({ reason: "CONFIG_CHANGED", ...base });
  if (canonicalJson(before.policy) !== canonicalJson(after.policy)) items.push({ reason: "POLICY_CHANGED", ...base });
  const a = regions(before.candidateBytes), b = regions(after.candidateBytes);
  if (await sha256Bytes(a.managed) !== await sha256Bytes(b.managed)) items.push({ reason: "MANAGED_REGION_CHANGED", ...base });
  if (await sha256Bytes(a.human) !== await sha256Bytes(b.human)) items.push({ reason: "HUMAN_REGION_CHANGED", ...base });
  if (a.order.length === b.order.length && canonicalJson([...a.order].sort(codeUnitCompare)) === canonicalJson([...b.order].sort(codeUnitCompare)) && canonicalJson(a.order) !== canonicalJson(b.order)) items.push({ reason: "ORDER_CHANGED", ...base });
  items.sort(itemCompare);
  return deepFreeze({ artifactKind: "engine.navigation-diff", items, text: renderNavigationDiff(items) });
}

export function renderNavigationDiff(items: readonly NavigationDiffItem[]): string {
  return items.map((item) => `${item.reason} ${item.stableId ?? "-"} ${item.fromPath ?? "-"} -> ${item.toPath ?? "-"}`).join("\n") + (items.length ? "\n" : "");
}
