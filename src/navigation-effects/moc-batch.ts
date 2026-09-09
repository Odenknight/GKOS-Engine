import { canonicalSha256, deepFreeze, sha256Bytes } from "../canonical";
import { generateNavigationCandidates, navigationSnapshotDigest, verifyVaultNavigationConfig, type NavigationSource, type NavigationSnapshot, type VaultNavigationConfig } from "../navigation";
import { posixDirname } from "../paths";
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
  recordNoChange?: boolean;
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
    if (!checked.valid || checked.normalized !== s.relativePath || /[\[\]|#^\r\n]/.test(s.relativePath) || /[\[\]|\r\n]/.test(s.title ?? "") || paths.has(key) || (s.stableId && ids.has(s.stableId)) || s.diagnostics?.some(d => d.severity === "error" || d.severity === "critical")) throw new Error("CORPUS_REQUIRES_REVIEW");
    paths.add(key); if (s.stableId) ids.add(s.stableId);
  }
  const eligible = sources.filter(s => s.sensitivity && value.allowedSensitivities.includes(s.sensitivity)).sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
  const snapshot: NavigationSnapshot = { vaultId: value.snapshot.vaultId, sources: await Promise.all(eligible.map(async s => ({ ...s, digest: await sha256Bytes(s.content) }))) };
  const corpusDigest = await canonicalSha256({ snapshot, configDigest: value.config.digest, policyRef: value.policyRef, allowedSensitivities: [...value.allowedSensitivities].sort() });
  const targets = [...value.targets].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const sourceDigest = await navigationSnapshotDigest(snapshot);
  const directories = new Map<string, NavigationSource[]>();
  const directoryOf = (path: string) => { const d = posixDirname(path); return d === "." ? "" : d; };
  for (const s of snapshot.sources) {
    const dir = directoryOf(s.relativePath);
    if (!directories.has(dir)) directories.set(dir, []);
    directories.get(dir)!.push(s);
  }
  // Only generate scopes containing registered targets. Existing managed MOCs
  // supply their current bytes so deleting the final ordinary note can produce
  // an empty managed region instead of leaving stale links indefinitely.
  for (const t of targets) {
    if (!validateVaultRelativePath(t.path).valid || t.path !== t.ownership.targetPath) throw new Error("INVALID_MOC_TARGET");
    const dir = directoryOf(t.path);
    if (!directories.has(dir)) directories.set(dir, []);
    const rows = directories.get(dir)!;
    if (t.currentBytes !== null && t.ownership.ownership !== "unmanaged" && !rows.some(s => s.relativePath === t.path)) rows.push({ relativePath: t.path, content: t.currentBytes, sensitivity: t.authority.sensitivityCeiling });
  }
  const candidates = new Map<string, Awaited<ReturnType<typeof generateNavigationCandidates>>["candidates"][number]>();
  for (const dir of [...new Set(targets.map(t => directoryOf(t.path)))].sort()) {
    const generation = await generateNavigationCandidates({ vaultId: snapshot.vaultId, sources: directories.get(dir)! }, value.config);
    if (generation.findings.some(f => f.severity === "error") || generation.classifications.filter(e => e.directory === dir && e.recognizedMocName).length > 1) throw new Error("NAVIGATION_REQUIRES_REVIEW");
    for (const c of generation.candidates) if (c.directory === dir) candidates.set(c.targetPath, { ...c, sourceSnapshotDigest: sourceDigest });
  }
  const unique = new Set<string>();
  const results: MocApplyPlanningResult[] = [];
  for (const t of targets) {
    const key = t.path.normalize("NFC").toLowerCase();
    if (unique.has(key)) throw new Error("DUPLICATE_TARGET");
    unique.add(key);
    const candidate = candidates.get(t.path);
    if (!candidate) { results.push({ status: "review-required", targetPath: t.path, reasonCodes: ["NO_DETERMINISTIC_CANDIDATE"] }); continue; }
    results.push(await planMocApply({ candidate, currentBytes: t.currentBytes, ownership: t.ownership, authority: t.authority, vaultId: snapshot.vaultId, corpusDigest, policyRef: value.policyRef, authorityEvaluatedAt: value.authorityEvaluatedAt, archiveDate: value.archiveDate, runId: value.runId, recordNoChange: value.recordNoChange }));
  }
  return deepFreeze({ corpusDigest, results });
}
