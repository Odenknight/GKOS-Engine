import { canonicalJson, deepFreeze, sha256Bytes } from "../canonical";
import { codeUnitCompare, normalizeVaultRelative } from "../paths";
import type { GkxGraph } from "../types";
import { shouldIgnoreNavigationArchivePath } from "./archive-ignore";
import { generateNavigationCandidates } from "./candidate";
import { compileNavigationContext } from "./context-pack";
import { verifyVaultNavigationConfig } from "./config";
import { discoverNavigation } from "./names";
import type {
  DiscoverabilityPolicy,
  MocRunManifest,
  NavigationCandidate,
  NavigationContextPack,
  NavigationContextRequest,
  NavigationFinding,
  NavigationSnapshot,
  VaultNavigationConfig,
} from "./types";

export interface NavigationAuditOptions {
  candidates?: readonly NavigationCandidate[];
  runManifest?: MocRunManifest;
  contextPacks?: readonly NavigationContextPack[];
  graph?: GkxGraph;
  liveGraphPaths?: readonly string[];
  discoverabilityProbe?: { request: NavigationContextRequest; policy: DiscoverabilityPolicy; forbiddenMarkers: readonly string[] };
}

const finding = (code: string, severity: NavigationFinding["severity"], path: string, message: string): NavigationFinding => ({ code, severity, path, message, action: "review", autoFix: false });

export async function auditNavigation(snapshot: NavigationSnapshot, config: VaultNavigationConfig, options: NavigationAuditOptions = {}): Promise<NavigationFinding[]> {
  const discovery = discoverNavigation(snapshot, config);
  const findings = [...discovery.findings];
  if (!await verifyVaultNavigationConfig(config)) findings.push(finding("NAV_CONFIG_DIGEST_MISMATCH", "error", "", "Vault Navigation configuration digest does not match its canonical bytes."));

  const stable = new Map<string, string[]>(), mocs = new Map<string, string[]>();
  for (const entry of discovery.entries) {
    if (!entry.stableId) findings.push(finding("NAV_STABLE_ID_MISSING", "warning", entry.path, "Navigation source has no stable GKX identity; path changes cannot prove governed identity."));
    else stable.set(entry.stableId, [...(stable.get(entry.stableId) ?? []), entry.path]);
    if (entry.recognizedMocName) mocs.set(entry.directory, [...(mocs.get(entry.directory) ?? []), entry.path]);
  }
  for (const [id, paths] of stable) if (paths.length > 1) findings.push(finding("NAV_STABLE_ID_AMBIGUOUS", "error", paths.sort(codeUnitCompare)[0], `Stable identity ${id} occurs at multiple source paths.`));
  for (const [directory, paths] of mocs) if (paths.length > 1) findings.push(finding("NAV_MULTIPLE_MOC", "warning", directory, `Multiple effective MOCs exist: ${paths.sort(codeUnitCompare).join(", ")}.`));
  for (const path of options.liveGraphPaths ?? []) if (shouldIgnoreNavigationArchivePath(path)) findings.push(finding("NAV_ARCHIVE_IN_LIVE_GRAPH", "error", normalizeVaultRelative(path), "Navigation run archive entered the live graph."));

  for (const warning of options.graph?.diagnostics?.lineageWarnings ?? []) {
    const lower = warning.toLowerCase();
    if (lower.includes("unresolved")) findings.push(finding("NAV_LINEAGE_TARGET_UNRESOLVED", "warning", "", warning));
    else if (lower.includes("cycle")) findings.push(finding("NAV_LINEAGE_CYCLE", "warning", "", warning));
    else if (lower.includes("successor")) findings.push(finding("NAV_LINEAGE_MULTIPLE_SUCCESSORS", "warning", "", warning));
  }

  if (options.candidates || options.runManifest) {
    const expected = await generateNavigationCandidates(snapshot, config);
    const expectedByTarget = new Map(expected.candidates.map((candidate) => [candidate.targetPath, candidate]));
    const actualByTarget = new Map((options.candidates ?? []).map((candidate) => [candidate.targetPath, candidate]));
    for (const candidate of options.candidates ?? []) {
      const expectedCandidate = expectedByTarget.get(candidate.targetPath);
      if (!expectedCandidate) findings.push(finding("NAV_CANDIDATE_ORPHANED", "warning", candidate.targetPath, "Candidate has no live Navigation scope."));
      if (candidate.sourceSnapshotDigest !== expected.sourceSnapshotDigest) findings.push(finding("NAV_CANDIDATE_STALE", "error", candidate.targetPath, "Candidate source snapshot digest is stale."));
      if (candidate.configRef.digest !== config.digest || candidate.configRef.version !== config.version) findings.push(finding("NAV_CANDIDATE_CONFIG_MISMATCH", "error", candidate.targetPath, "Candidate was generated under a different Navigation configuration."));
      if (candidate.digest !== await sha256Bytes(candidate.candidateBytes)) findings.push(finding("NAV_CANDIDATE_DIGEST_MISMATCH", "error", candidate.targetPath, "Candidate bytes do not match their SHA-256 digest."));
      const starts = candidate.candidateBytes.split("<!-- gkos-navigation:managed:start -->").length - 1;
      const ends = candidate.candidateBytes.split("<!-- gkos-navigation:managed:end -->").length - 1;
      if (starts !== 1 || ends !== 1 || candidate.candidateBytes.indexOf("managed:start") > candidate.candidateBytes.indexOf("managed:end")) findings.push(finding("NAV_CANDIDATE_MARKERS_AMBIGUOUS", "error", candidate.targetPath, "Candidate managed markers are malformed or ambiguous."));
      if (expectedCandidate && candidate.digest !== expectedCandidate.digest) findings.push(finding("NAV_CANDIDATE_NONDETERMINISTIC", "error", candidate.targetPath, "Candidate differs from deterministic regeneration."));
    }
    for (const candidate of expected.candidates) if (options.candidates && !actualByTarget.has(candidate.targetPath)) findings.push(finding("NAV_CANDIDATE_MISSING", "warning", candidate.targetPath, "Expected Navigation candidate is missing."));
    if (options.runManifest) {
      if (options.runManifest.gkosContextManifest !== false || options.runManifest.artifactKind !== "engine.moc-run-manifest") findings.push(finding("NAV_RUN_MANIFEST_KIND_INVALID", "error", "", "MOC run manifest must not claim GKOS Context Manifest standing."));
      if (options.runManifest.sourceSnapshotDigest !== expected.sourceSnapshotDigest) findings.push(finding("NAV_RUN_MANIFEST_SOURCE_MISMATCH", "error", "", "Run manifest source snapshot digest does not match."));
      if (options.runManifest.vaultNavigationConfig.digest !== config.digest || options.runManifest.vaultNavigationConfig.version !== config.version) findings.push(finding("NAV_RUN_MANIFEST_CONFIG_MISMATCH", "error", "", "Run manifest configuration binding does not match."));
      const declared = canonicalJson([...options.runManifest.candidateArtifacts].sort((a, b) => codeUnitCompare(a.candidateId, b.candidateId)));
      const actual = canonicalJson([...(options.candidates ?? [])].map((candidate) => ({ candidateId: candidate.candidateId, digest: candidate.digest })).sort((a, b) => codeUnitCompare(a.candidateId, b.candidateId)));
      if (declared !== actual) findings.push(finding("NAV_RUN_MANIFEST_CANDIDATE_MISMATCH", "error", "", "Run manifest candidate digest bindings do not match supplied candidates."));
    }
  }

  for (const pack of options.contextPacks ?? []) {
    if (pack.artifact_kind !== "engine.navigation-context-pack" || pack.gkos_context_manifest !== false) findings.push(finding("NAV_CONTEXT_KIND_INVALID", "error", "", "Navigation Context Pack cannot claim Layer-6 Context Manifest type."));
    if (pack.budget.usedItems > pack.budget.items || pack.budget.usedTokens > pack.budget.tokens) findings.push(finding("NAV_CONTEXT_OVER_BUDGET", "error", "", "Navigation Context Pack exceeds its declared budget."));
    const { canonicalBytes: _bytes, digest: _digest, ...payload } = pack;
    if (canonicalJson(payload) !== pack.canonicalBytes || await sha256Bytes(pack.canonicalBytes) !== pack.digest) findings.push(finding("NAV_CONTEXT_DIGEST_MISMATCH", "error", "", "Navigation Context Pack canonical bytes or digest do not match."));
  }
  if (options.discoverabilityProbe) {
    const pack = await compileNavigationContext(snapshot, options.discoverabilityProbe.request, options.discoverabilityProbe.policy);
    for (const marker of options.discoverabilityProbe.forbiddenMarkers) if (pack.canonicalBytes.includes(marker)) findings.push(finding("NAV_DISCOVERABILITY_LEAK", "error", "", "A denied object's marker leaked into projected Navigation context."));
  }
  return deepFreeze(findings.sort((a, b) => codeUnitCompare(a.path, b.path) || codeUnitCompare(a.code, b.code) || codeUnitCompare(a.message, b.message)));
}
