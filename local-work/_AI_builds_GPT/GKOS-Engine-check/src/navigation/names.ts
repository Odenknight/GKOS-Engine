import { codeUnitCompare, normalizeVaultRelative, posixBasename, posixDirname } from "../paths";
import { deepFreeze } from "../canonical";
import { shouldIgnoreNavigationArchivePath } from "./archive-ignore";
import type {
  MocClassification,
  MocEvidence,
  MocManagement,
  MocNameStanding,
  NavigationDiscovery,
  NavigationEntry,
  NavigationFinding,
  NavigationSnapshot,
  NavigationSource,
  VaultNavigationConfig,
} from "./types";

export const CANONICAL_MOC_NAMES = Object.freeze(["index", "_index", "readme", "moc", "contents"] as const);
const CANONICAL = new Set<string>(CANONICAL_MOC_NAMES);
const FLAG_ONLY_NAMES = new Set(["home", "map", "overview", "dashboard", "start", "toc"]);
const DOCUMENT_EXTENSIONS = new Set(["md", "markdown"]);
const MANAGED_START = "<!-- gkos-navigation:managed:start -->";
const MANAGED_END = "<!-- gkos-navigation:managed:end -->";

export function normalizeMocBasename(value: string): string {
  // Contract 1.0 removes only a recognized document extension before this
  // comparison. Whitespace and Unicode normalization are not silently altered.
  return value.toLowerCase();
}

function observedBasename(path: string): { filename: string; basename: string; extensionRecognized: boolean } {
  const filename = posixBasename(normalizeVaultRelative(path));
  const dot = filename.lastIndexOf(".");
  const extension = dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
  return {
    filename,
    basename: dot > 0 && DOCUMENT_EXTENSIONS.has(extension) ? filename.slice(0, dot) : filename,
    extensionRecognized: dot > 0 && DOCUMENT_EXTENSIONS.has(extension),
  };
}

export function effectiveMocNames(config: VaultNavigationConfig): string[] {
  return [...new Set<string>([...CANONICAL_MOC_NAMES, ...config.promotedMocNames.map(normalizeMocBasename)])].sort(codeUnitCompare);
}

function classifyContent(source: NavigationSource, recognizedMocName: boolean): { classification: MocClassification; evidence: MocEvidence[] } {
  const normalized = source.content.replace(/\r\n?/g, "\n");
  const lower = normalized.toLowerCase();
  const wikilinks = (normalized.match(/\[\[[^\]]+\]\]/g) ?? []).length;
  if (/^---[\s\S]*?\btype\s*:\s*(?:operational|runbook|workflow)\b/im.test(normalized) || /(?:^|[/_-])(?:runbook|operations?|workflow)(?:$|[/_.-])/i.test(source.relativePath)) {
    return { classification: "operational", evidence: [{ code: "CLASS_OPERATIONAL_RULE", value: true }] };
  }
  if (!recognizedMocName && (wikilinks >= 2 || /\b(?:map of content|knowledge map|semantic index)\b/i.test(lower))) {
    return { classification: "semantic", evidence: [{ code: "CLASS_SEMANTIC_LINK_RULE", value: wikilinks }] };
  }
  return { classification: "directory", evidence: [{ code: "CLASS_DIRECTORY_RULE", value: recognizedMocName ? "recognized-name" : "default" }] };
}

function managementOf(content: string): { management: MocManagement; evidence: MocEvidence[]; malformed: boolean } {
  const start = content.indexOf(MANAGED_START), end = content.indexOf(MANAGED_END);
  if (start < 0 && end < 0) return { management: "unmanaged", evidence: [{ code: "MANAGEMENT_NO_MARKERS" }], malformed: false };
  if (start < 0 || end < 0 || end < start || content.indexOf(MANAGED_START, start + 1) >= 0 || content.indexOf(MANAGED_END, end + 1) >= 0) {
    return { management: "hybrid", evidence: [{ code: "MANAGEMENT_MARKERS_AMBIGUOUS" }], malformed: true };
  }
  const human = `${content.slice(0, start)}${content.slice(end + MANAGED_END.length)}`.trim();
  return human
    ? { management: "hybrid", evidence: [{ code: "MANAGEMENT_HUMAN_AND_MANAGED_REGIONS" }], malformed: false }
    : { management: "managed", evidence: [{ code: "MANAGEMENT_MANAGED_REGION_ONLY" }], malformed: false };
}

function looksNoncanonical(name: string): boolean {
  return FLAG_ONLY_NAMES.has(name) || /(?:^|[-_ ])(?:moc|index|contents|readme|toc|map)(?:$|[-_ ])/.test(name);
}

export function classifyNavigationSource(source: NavigationSource, config: VaultNavigationConfig): { entry: NavigationEntry; findings: NavigationFinding[] } {
  const path = normalizeVaultRelative(source.relativePath);
  const { filename, basename } = observedBasename(path);
  const normalizedName = normalizeMocBasename(basename);
  const promoted = new Set(config.promotedMocNames.map(normalizeMocBasename));
  const nameStanding: MocNameStanding = CANONICAL.has(normalizedName)
    ? "built-in"
    : promoted.has(normalizedName)
      ? "promoted"
      : looksNoncanonical(normalizedName)
        ? "noncanonical-like"
        : "ordinary";
  const recognizedMocName = nameStanding === "built-in" || nameStanding === "promoted";
  const classified = classifyContent(source, recognizedMocName);
  const management = managementOf(source.content);
  const findings: NavigationFinding[] = [];
  if (nameStanding === "noncanonical-like") findings.push({
    code: "MOC_NAME_NONCANONICAL",
    severity: "warning",
    path,
    observedName: basename,
    action: "flag",
    autoFix: false,
    message: "MOC-like basename is not built in; explicit human-governed promotion is required.",
  });
  if (recognizedMocName && basename !== normalizedName) findings.push({
    code: "MOC_NAME_CASE_ANOMALY",
    severity: "warning",
    path,
    observedName: basename,
    action: "review",
    autoFix: false,
    message: "The recognized MOC basename differs by case; Engine records the anomaly and does not rename it.",
  });
  if (basename !== basename.trim() || basename !== basename.normalize("NFC")) findings.push({
    code: "MOC_NAME_NORMALIZATION_ANOMALY",
    severity: "warning",
    path,
    observedName: basename,
    action: "review",
    autoFix: false,
    message: "The observed basename contains surrounding whitespace or non-NFC Unicode; Engine does not normalize or rename it.",
  });
  if (management.malformed) findings.push({
    code: "MOC_MANAGED_MARKERS_AMBIGUOUS",
    severity: "error",
    path,
    action: "review",
    autoFix: false,
    message: "Managed-region markers are missing, duplicated, or out of order.",
  });
  const entry: NavigationEntry = {
    path,
    observedFilename: filename,
    directory: posixDirname(path) === "." ? "" : posixDirname(path),
    basename,
    stableId: source.stableId ?? null,
    title: source.title ?? basename,
    recognizedMocName,
    nameStanding,
    classification: classified.classification,
    management: management.management,
    evidence: [
      { code: recognizedMocName ? "MOC_NAME_EFFECTIVE" : "MOC_NAME_NOT_EFFECTIVE", value: normalizedName },
      ...classified.evidence,
      ...management.evidence,
    ],
  };
  return deepFreeze({ entry, findings });
}

export function discoverNavigation(snapshot: NavigationSnapshot, config: VaultNavigationConfig): NavigationDiscovery {
  if (snapshot.vaultId !== config.vaultId) throw new Error("Navigation snapshot and configuration vault IDs differ.");
  const entries: NavigationEntry[] = [], findings: NavigationFinding[] = [];
  for (const source of snapshot.sources) {
    if (shouldIgnoreNavigationArchivePath(source.relativePath)) continue;
    const result = classifyNavigationSource(source, config);
    entries.push(result.entry);
    findings.push(...result.findings);
  }
  entries.sort((a, b) => codeUnitCompare(a.path, b.path));
  findings.sort((a, b) => codeUnitCompare(a.path, b.path) || codeUnitCompare(a.code, b.code));
  return deepFreeze({
    navigationContract: "1.0.0",
    vaultId: snapshot.vaultId,
    configRef: { id: config.configId, version: config.version, digest: config.digest },
    effectiveMocNames: effectiveMocNames(config),
    entries,
    findings,
  });
}

export function classifyNavigation(snapshot: NavigationSnapshot, config: VaultNavigationConfig): NavigationEntry[] {
  return discoverNavigation(snapshot, config).entries;
}
