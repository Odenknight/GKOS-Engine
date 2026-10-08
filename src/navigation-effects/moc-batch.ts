import { canonicalSha256, deepFreeze, sha256Bytes } from "../canonical";
import { generateNavigationCandidates, verifyVaultNavigationConfig, type NavigationSnapshot, type VaultNavigationConfig } from "../navigation";
import { planMocApply } from "./planner";
import { validateVaultRelativePath } from "./path-policy";
import type { EffectAuthorityBinding, EffectsPolicyRef, MocApplyPlanningResult, MocOwnershipBinding } from "./types";

/** Snapshot current MOCs separately: corpus filtering must never turn a hidden
 * or human-owned target into an apparent create-only target.
 */
export interface ManagedMocTarget {
  path: string;
  currentBytes: string | null;
  ownership: MocOwnershipBinding;
  authority: EffectAuthorityBinding;
}

/** Pure batch plan. Execute only its planned results through the effects adapter.
 * Targets are explicit; neither discovery nor a model can adopt a human MOC.
 */
export async function planManagedMocBatch(input: {
  snapshot: NavigationSnapshot;
  config: VaultNavigationConfig;
  targets: readonly ManagedMocTarget[];
  allowedSensitivities: readonly string[];
  policyRef: EffectsPolicyRef;
  authorityEvaluatedAt: string;
  archiveDate: string;
  runId: string;
}): Promise<{ corpusDigest: string; results: MocApplyPlanningResult[] }> {
  const value = structuredClone(input);
  if (!await verifyVaultNavigationConfig(value.config) || value.snapshot.vaultId !== value.config.vaultId) throw new Error("INVALID_NAVIGATION_CONFIG");
  const paths = new Set<string>(), ids = new Set<string>();
  const sources = value.snapshot.sources.filter(s => !/^(?:\.gkx(?:\/|$)|_archive\/moc-runs(?:\/|$))/i.test(s.relativePath.replace(/\\/g, "/")));
  // Check collisions before sensitivity filtering so hidden identities cannot
  // silently disambiguate references. Errors contain no note content.
  for (const s of sources) {
    const checked = validateVaultRelativePath(s.relativePath);
    const key = s.relativePath.normalize("NFC").toLowerCase();
    if (!checked.valid || checked.normalized !== s.relativePath || paths.has(key) || (s.stableId && ids.has(s.stableId)) || s.diagnostics?.some(d => d.severity === "error" || d.severity === "critical")) throw new Error("CORPUS_REQUIRES_REVIEW");
    paths.add(key); if (s.stableId) ids.add(s.stableId);
  }
  const eligible = sources.filter(s => s.sensitivity && value.allowedSensitivities.includes(s.sensitivity)).sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
  const snapshot: NavigationSnapshot = { vaultId: value.snapshot.vaultId, sources: await Promise.all(eligible.map(async s => ({ ...s, digest: await sha256Bytes(s.content) }))) };
  const corpusDigest = await canonicalSha256({ snapshot, configDigest: value.config.digest, policyRef: value.policyRef, allowedSensitivities: [...value.allowedSensitivities].sort() });
  const generation = await generateNavigationCandidates(snapshot, value.config);
  if (generation.findings.some(f => f.severity === "error")) throw new Error("NAVIGATION_REQUIRES_REVIEW");
  const candidates = new Map(generation.candidates.map(c => [c.targetPath, c]));
  const targets = [...value.targets].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const unique = new Set<string>();
  const results: MocApplyPlanningResult[] = [];
  for (const t of targets) {
    const key = t.path.normalize("NFC").toLowerCase();
    if (unique.has(key)) throw new Error("DUPLICATE_TARGET");
    unique.add(key);
    const candidate = candidates.get(t.path);
    if (!candidate) { results.push({ status: "review-required", targetPath: t.path, reasonCodes: ["NO_DETERMINISTIC_CANDIDATE"] }); continue; }
    results.push(await planMocApply({ candidate, currentBytes: t.currentBytes, ownership: t.ownership, authority: t.authority, vaultId: snapshot.vaultId, corpusDigest, policyRef: value.policyRef, authorityEvaluatedAt: value.authorityEvaluatedAt, archiveDate: value.archiveDate, runId: value.runId }));
  }
  return deepFreeze({ corpusDigest, results });
}
