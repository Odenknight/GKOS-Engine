import { deepFreeze, sha256Bytes } from "../canonical";
import { UUID_V7_RE } from "../governance";
import { ENGINE_VERSION } from "../version";
import { codeUnitCompare, normalizeVaultRelative, posixBasename, posixDirname, withoutExtension } from "../paths";
import { isValidGkxTimestamp } from "../timestamps";
import { getNavigationCapabilities } from "./capabilities";
import { shouldIgnoreNavigationArchivePath } from "./archive-ignore";
import { discoverNavigation } from "./names";
import { canonicalNavigationSources, navigationSnapshotDigest, navigationSourceDigest } from "./determinism";
import type {
  MocRunManifest,
  NavigationCandidate,
  NavigationCandidateGeneration,
  NavigationSnapshot,
  VaultNavigationConfig,
} from "./types";

const MANAGED_START = "<!-- gkos-navigation:managed:start -->";
const MANAGED_END = "<!-- gkos-navigation:managed:end -->";

function directDirectory(path: string): string {
  const directory = posixDirname(normalizeVaultRelative(path));
  return directory === "." ? "" : directory;
}

function displayDirectory(directory: string): string {
  return directory ? posixBasename(directory) : "Root";
}

export async function generateNavigationCandidates(snapshot: NavigationSnapshot, config: VaultNavigationConfig): Promise<NavigationCandidateGeneration> {
  const discovery = discoverNavigation(snapshot, config);
  const sourceSnapshotDigest = await navigationSnapshotDigest(snapshot);
  const sources = canonicalNavigationSources(snapshot).filter((source) => discovery.entries.some((entry) => entry.path === source.relativePath));
  const entryByPath = new Map(discovery.entries.map((entry) => [entry.path, entry]));
  const directories = new Set<string>([""]);
  for (const source of sources) directories.add(directDirectory(source.relativePath));
  for (const raw of snapshot.directories ?? []) {
    const directory = normalizeVaultRelative(raw);
    if (directory && !shouldIgnoreNavigationArchivePath(directory)) directories.add(directory);
  }

  const candidates: NavigationCandidate[] = [];
  for (const directory of [...directories].sort(codeUnitCompare)) {
    const direct = sources
      .filter((source) => directDirectory(source.relativePath) === directory)
      .filter((source) => !entryByPath.get(source.relativePath)?.recognizedMocName)
      .sort((a, b) => codeUnitCompare(a.title ?? withoutExtension(posixBasename(a.relativePath)), b.title ?? withoutExtension(posixBasename(b.relativePath))) || codeUnitCompare(a.relativePath, b.relativePath));
    const recognized = discovery.entries.filter((entry) => entry.directory === directory && entry.recognizedMocName).sort((a, b) => codeUnitCompare(a.path, b.path));
    if (direct.length === 0 && recognized.length === 0) continue;
    const targetPath = recognized[0]?.path ?? (directory ? `${directory}/index.md` : "index.md");
    const lines = [`# ${displayDirectory(directory)}`, "", MANAGED_START];
    for (const source of direct) {
      const linkTarget = withoutExtension(source.relativePath);
      const title = source.title ?? withoutExtension(posixBasename(source.relativePath));
      lines.push(`- [[${linkTarget}|${title}]]`);
    }
    lines.push(MANAGED_END, "");
    const candidateBytes = lines.join("\n");
    const digest = await sha256Bytes(candidateBytes);
    const sourceRefs = [];
    for (const source of direct) sourceRefs.push({
      ...(source.stableId ? { id: source.stableId } : {}),
      path: source.relativePath,
      ...(source.version ? { version: source.version } : {}),
      digest: await navigationSourceDigest(source),
    });
    candidates.push({
      artifactKind: "engine.moc-candidate",
      candidateId: `moc-candidate:${digest.slice(7, 39)}`,
      directory,
      targetPath,
      candidateBytes,
      digest,
      sourceSnapshotDigest,
      configRef: { id: config.configId, version: config.version, digest: config.digest },
      policy: { ...config.policy },
      sourceRefs,
    });
  }
  candidates.sort((a, b) => codeUnitCompare(a.targetPath, b.targetPath));
  return deepFreeze({
    artifactKind: "engine.navigation-candidate-set",
    navigationContract: "1.0.0",
    engineVersion: ENGINE_VERSION,
    sourceSnapshotDigest,
    configRef: { id: config.configId, version: config.version, digest: config.digest },
    candidates,
    classifications: discovery.entries,
    findings: discovery.findings,
  });
}

export async function generateMocCandidate(snapshot: NavigationSnapshot, config: VaultNavigationConfig, directory: string): Promise<NavigationCandidate | null> {
  const normalized = normalizeVaultRelative(directory);
  return (await generateNavigationCandidates(snapshot, config)).candidates.find((candidate) => candidate.directory === normalized) ?? null;
}

export function buildMocRunManifest(input: {
  generation: NavigationCandidateGeneration;
  config: VaultNavigationConfig;
  runId: string;
  startedAt: string;
  completedAt: string;
  omissions?: readonly string[];
}): MocRunManifest {
  if (!UUID_V7_RE.test(input.runId)) throw new Error("MOC run ID must be UUIDv7.");
  if ([input.startedAt, input.completedAt].some((value) => !isValidGkxTimestamp(value))) throw new Error("MOC run timestamps must be portable zoned timestamps.");
  if (Date.parse(input.completedAt) < Date.parse(input.startedAt)) throw new Error("MOC run completion precedes its start.");
  return deepFreeze({
    artifactKind: "engine.moc-run-manifest",
    gkosContextManifest: false,
    runId: input.runId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    engineVersion: ENGINE_VERSION,
    navigationContract: "1.0.0",
    sourceSnapshotDigest: input.generation.sourceSnapshotDigest,
    vaultNavigationConfig: {
      id: input.config.configId,
      version: input.config.version,
      digest: input.config.digest,
      effectivePromotedNames: [...input.config.promotedMocNames].sort(codeUnitCompare),
    },
    policies: [{ ...input.config.policy }],
    candidateArtifacts: input.generation.candidates.map((candidate) => ({ candidateId: candidate.candidateId, digest: candidate.digest })),
    warnings: input.generation.findings,
    omissions: [...(input.omissions ?? [])].sort(codeUnitCompare),
    capabilities: getNavigationCapabilities(),
  });
}
