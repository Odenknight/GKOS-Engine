import { canonicalJson, deepFreeze, sha256Bytes } from "../canonical";
import { ENGINE_VERSION } from "../version";
import { codeUnitCompare, normalizeVaultRelative, posixBasename, withoutExtension } from "../paths";
import { canonicalNavigationSources, navigationSourceDigest } from "./determinism";
import { shouldIgnoreNavigationArchivePath } from "./archive-ignore";
import type {
  DiscoverabilityPolicy,
  NavigationContextEntry,
  NavigationContextPack,
  NavigationContextRequest,
  NavigationRelationship,
  NavigationSnapshot,
} from "./types";

function estimatedTokens(value: string): number {
  return Math.ceil(new TextEncoder().encode(value).length / 4);
}

export async function compileNavigationContext(
  snapshot: NavigationSnapshot,
  request: NavigationContextRequest,
  policy: DiscoverabilityPolicy,
): Promise<NavigationContextPack> {
  if (!request.recipient?.id || !request.purpose || !policy?.id || !policy.version) throw new Error("Recipient, purpose, and discoverability policy are required.");
  if (!Number.isInteger(request.itemBudget) || request.itemBudget < 0 || !Number.isInteger(request.tokenBudget) || request.tokenBudget < 0) throw new Error("Context budgets must be non-negative integers.");

  // This is the security boundary: denied and indeterminate objects disappear
  // before relationship aggregation, counts, warnings, or omission reporting.
  const allowed = [];
  for (const source of canonicalNavigationSources(snapshot)) {
    const path = normalizeVaultRelative(source.relativePath);
    if (shouldIgnoreNavigationArchivePath(path)) continue;
    const id = source.stableId ?? `path:${path}`;
    const sensitivity = source.sensitivity ?? "secret";
    let decision: "allow" | "deny" | "indeterminate" = "indeterminate";
    try { decision = policy.canDiscover({ recipient: request.recipient, purpose: request.purpose, object: { id, path, sensitivity, kind: "source" } }); }
    catch { decision = "indeterminate"; }
    if (decision === "allow") allowed.push({ source, id, path, sensitivity });
  }
  const allowedIds = new Set(allowed.map((item) => item.id));
  const allowedPaths = new Set(allowed.map((item) => item.path));
  const entries: NavigationContextEntry[] = [];
  const omissions: NavigationContextPack["omissions"] = [];
  const warnings: string[] = [];
  let usedTokens = 0;
  for (const item of allowed) {
    const relationships: NavigationRelationship[] = (item.source.relationships ?? []).filter((relationship) =>
      (relationship.targetStableId ? allowedIds.has(relationship.targetStableId) : false)
      || (relationship.targetPath ? allowedPaths.has(normalizeVaultRelative(relationship.targetPath)) : false))
      .map((relationship) => ({ ...relationship, ...(relationship.targetPath ? { targetPath: normalizeVaultRelative(relationship.targetPath) } : {}) }))
      .sort((a, b) => codeUnitCompare(a.kind, b.kind) || codeUnitCompare(a.targetStableId ?? "", b.targetStableId ?? "") || codeUnitCompare(a.targetPath ?? "", b.targetPath ?? ""));
    const entry: NavigationContextEntry = {
      id: item.id,
      path: item.path,
      ...(item.source.version ? { version: item.source.version } : {}),
      digest: await navigationSourceDigest(item.source),
      title: item.source.title ?? withoutExtension(posixBasename(item.path)),
      content: item.source.content.replace(/\r\n?/g, "\n"),
      sensitivity: item.sensitivity,
      relationships,
    };
    const tokens = estimatedTokens(canonicalJson(entry));
    if (entries.length >= request.itemBudget) { omissions.push({ id: item.id, reason: "item-budget" }); continue; }
    if (usedTokens + tokens > request.tokenBudget) { omissions.push({ id: item.id, reason: "token-budget" }); continue; }
    entries.push(entry); usedTokens += tokens;
    if (!item.source.stableId) warnings.push(`ALLOWED_SOURCE_WITHOUT_STABLE_ID:${item.path}`);
  }
  const payload = {
    artifact_kind: "engine.navigation-context-pack" as const,
    gkos_context_manifest: false as const,
    navigation_contract: "1.0.0" as const,
    engine_version: ENGINE_VERSION,
    recipient: { ...request.recipient },
    purpose: request.purpose,
    generation_policy: { ...request.generationPolicy },
    budget: { items: request.itemBudget, tokens: request.tokenBudget, usedItems: entries.length, usedTokens },
    entries,
    omissions,
    warnings: warnings.sort(codeUnitCompare),
  };
  const canonicalBytes = canonicalJson(payload);
  return deepFreeze({ ...payload, canonicalBytes, digest: await sha256Bytes(canonicalBytes) });
}

export const compileNavigationContextPack = compileNavigationContext;
