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
  NavigationContextRejection,
  NavigationProjectionEligibility,
  NavigationRelationship,
  NavigationSnapshot,
} from "./types";

export const NAVIGATION_CONTEXT_REJECTED_EXIT_CODE = 3;

export class NavigationContextRejectedError extends Error {
  readonly code = "NAV_CONTEXT_PROJECTION_REJECTED";
  readonly exitCode = NAVIGATION_CONTEXT_REJECTED_EXIT_CODE;
  readonly reasonCodes: string[];
  readonly rejection: NavigationContextRejection;

  constructor(reasonCodes: readonly string[]) {
    const stable = deepFreeze([...new Set(reasonCodes)].sort(codeUnitCompare));
    super("Navigation context generation rejected by the fail-closed projection gate.");
    this.name = "NavigationContextRejectedError";
    this.reasonCodes = stable;
    this.rejection = Object.freeze({
      artifact_kind: "engine.navigation-context-rejection",
      status: "rejected",
      reason_codes: stable,
    });
  }
}

type AllowedSource = { source: NavigationSnapshot["sources"][number]; id: string; path: string; sensitivity: string };

function discoverableSources(
  snapshot: NavigationSnapshot,
  request: NavigationContextRequest,
  policy: DiscoverabilityPolicy,
): AllowedSource[] {
  const allowed: AllowedSource[] = [];
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
  return allowed;
}

/** Shared deterministic gate used by the library and CLI before projection. */
export function evaluateNavigationProjectionEligibility(
  snapshot: NavigationSnapshot,
  request: NavigationContextRequest,
  policy: DiscoverabilityPolicy,
): NavigationProjectionEligibility {
  return projectionDecision(snapshot, request, policy).eligibility;
}

function projectionDecision(
  snapshot: NavigationSnapshot,
  request: NavigationContextRequest,
  policy: DiscoverabilityPolicy,
): { eligibility: NavigationProjectionEligibility; allowed: AllowedSource[] } {
  const allowed = discoverableSources(snapshot, request, policy);
  const blocking = new Set<string>();
  const allowedKeys = new Set(allowed.map((item) => `${item.path}\u0000${item.id}`));
  const identities = new Map<string, AllowedSource[]>();
  for (const source of canonicalNavigationSources(snapshot)) {
    const path = normalizeVaultRelative(source.relativePath);
    if (shouldIgnoreNavigationArchivePath(path)) continue;
    const id = source.stableId ?? `path:${path}`;
    const matches = identities.get(id);
    const item = { source, id, path, sensitivity: source.sensitivity ?? "secret" };
    if (matches) matches.push(item); else identities.set(id, [item]);
  }
  for (const item of allowed) {
    for (const diagnostic of item.source.diagnostics ?? []) {
      if (diagnostic.severity === "error" || diagnostic.severity === "critical") blocking.add(diagnostic.code);
    }
  }
  for (const matches of identities.values()) {
    if (matches.length < 2 || !matches.some((item) => allowedKeys.has(`${item.path}\u0000${item.id}`))) continue;
    blocking.add("GKX-IDENTITY-003");
    if (new Set(matches.map((item) => item.source.content.replace(/\r\n?/g, "\n"))).size > 1) blocking.add("GKX-IDENTITY-004");
  }
  const reasonCodes = [...blocking].sort(codeUnitCompare);
  return { eligibility: deepFreeze({ eligible: reasonCodes.length === 0, reasonCodes }), allowed };
}

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

  // Denied/indeterminate/archive sources disappear before the eligibility gate,
  // preventing their metadata or even their count from affecting a rejection.
  const { eligibility, allowed } = projectionDecision(snapshot, request, policy);
  if (!eligibility.eligible) throw new NavigationContextRejectedError(eligibility.reasonCodes);
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
