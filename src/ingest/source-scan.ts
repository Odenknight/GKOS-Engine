import { createHash } from "node:crypto";
import { lstat, open, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  codeUnitCompare,
  isAttachmentPath,
  isNotePath,
  normalizeVaultRelative,
  shouldIgnoreVaultPath,
} from "../paths";
import {
  canonicalPath,
  canonicalPathContains,
  sameCanonicalPath,
} from "../retrieval/path-security";
import { retrievalCanonicalDigest } from "../retrieval/digest";
import { validateWatcherSourcePath } from "../watcher/contracts";
import type { SourceFile } from "../types";

export const PHASE3_SCAN_REJECTIONS = Symbol.for("gkos.phase3.scan-rejections");
export const PHASE3_SCAN_ROOT = Symbol.for("gkos.phase3.scan-root");
export const PHASE3_NAMESPACE_EVIDENCE = Symbol.for("gkos.phase3.namespace-evidence");

interface Phase3FileEvidence {
  readonly plain_file: boolean;
  readonly link_count: number;
  readonly requested_path: string;
  readonly real_path: string;
  readonly aliased: boolean;
  readonly device: string;
  readonly inode: string;
  readonly mode: number;
  readonly changed_ms: number;
  readonly source_digest: string;
}

// Scanner evidence is capability material, not part of SourceFile's value
// domain. Keeping it in a module-private WeakMap preserves the exact Phase-3
// SourceFile key set while allowing the CLI and watcher to reopen the evidence
// produced by this one shared scanner implementation.
const phase3FileEvidenceByFile = new WeakMap<SourceFile, Phase3FileEvidence>();

export function phase3FileEvidence(file: SourceFile): Phase3FileEvidence | null {
  return phase3FileEvidenceByFile.get(file) ?? null;
}

const MAX_SCAN_NOTE_BYTES = 64 * 1024 * 1024;
const MAX_SOURCES = 1_000_000;
const MAX_PATH_BYTES = 1024;
const MAX_HINT_BYTES = 4096;
const FATAL_UTF8 = new TextDecoder("utf-8", { fatal: true });
const FATAL_UTF8_EXACT = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;
const WATCHER_ARCHIVE_EXCLUSION = "_archive/moc-runs";

interface FileState {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
  readonly mode: number;
  readonly nlink: number;
  readonly size: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
  readonly birthtimeMs: number;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

export interface Phase3ScanRootEvidence {
  readonly requested_path: string;
  readonly canonical_path: string;
  readonly device: number | bigint;
  readonly inode: number | bigint;
  readonly mode: number;
}

export interface Phase3ScanRejection {
  readonly source_path: string;
  readonly source_digest: string | null;
  readonly size: number | null;
  readonly created_time_ms: number | null;
  readonly modified_time_ms: number | null;
  readonly classification: "rejected";
  readonly reason_codes: readonly string[];
}

/**
 * Exact Phase-3 validation-envelope projection. Scanner timing coordinates are
 * capability evidence and must never leak into the five-key validation row.
 * Both the established CLI and the watcher use this one projection.
 */
export interface Phase3ValidationScanRejection {
  readonly source_path: string;
  readonly source_digest: string | null;
  readonly size: number | null;
  readonly classification: "rejected";
  readonly reason_codes: readonly string[];
}

export function projectPhase3ScanRejections(
  rows: readonly Phase3ScanRejection[],
): readonly Phase3ValidationScanRejection[] {
  return Object.freeze(rows.map((row) => Object.freeze({
    source_path: row.source_path,
    source_digest: row.source_digest,
    size: row.size,
    classification: "rejected" as const,
    reason_codes: Object.freeze([...row.reason_codes]),
  })));
}

export interface WatcherSourceIdentity {
  readonly source_path: string;
  readonly device: string;
  readonly inode: string;
  readonly mode: number;
  readonly nlink: number;
  readonly byte_size: number;
  readonly modified_ms: number;
  readonly changed_ms: number;
  readonly created_ms: number;
  readonly source_digest: string | null;
  readonly kind: "note" | "attachment";
}

interface Phase3NamespaceRow {
  readonly source_path: string;
  readonly kind: "folder" | "note" | "attachment";
  readonly device: string;
  readonly inode: string;
  readonly mode: number;
  readonly nlink: number;
  readonly byte_size: number;
  readonly modified_ms: number;
  readonly changed_ms: number;
  readonly created_ms: number;
}

export interface Phase3CorpusScan {
  readonly files: readonly SourceFile[];
  readonly folders: readonly string[];
  readonly attachments: readonly string[];
  readonly [PHASE3_SCAN_REJECTIONS]?: readonly Phase3ScanRejection[];
  readonly [PHASE3_SCAN_ROOT]?: Phase3ScanRootEvidence;
  readonly [PHASE3_NAMESPACE_EVIDENCE]?: readonly Phase3NamespaceRow[];
}

export interface Phase3CorpusScanOptions {
  readonly ingest?: boolean;
  readonly extra_exclusions?: readonly string[];
  readonly on_before_child_lstat?: (item: { readonly relative_path: string; readonly absolute_path: string }) => void | Promise<void>;
  readonly on_before_file_open?: (item: { readonly relative_path: string; readonly absolute_path: string }) => void | Promise<void>;
  readonly on_before_root_recheck?: (item: { readonly requested_path: string; readonly canonical_path: string }) => void | Promise<void>;
}

export interface WatcherSourceScan {
  readonly vault_root: string;
  readonly files: readonly SourceFile[];
  readonly folders: readonly string[];
  readonly attachments: readonly string[];
  readonly scan_rejections: readonly Phase3ScanRejection[];
  readonly identities: readonly WatcherSourceIdentity[];
  readonly namespace_digest: string;
}

export interface WatcherSourceScanOptions {
  readonly extra_exclusions?: readonly string[];
  readonly on_after_first_snapshot?: () => void | Promise<void>;
  readonly on_after_file_open?: (sourcePath: string) => void | Promise<void>;
}

function fail(code: string): never {
  throw new Error(code);
}

function identityNumber(value: number | bigint): string {
  const text = String(value);
  if (!/^(?:0|[1-9][0-9]*)$/u.test(text)) fail("WATCHER_SOURCE_CAPABILITY_UNSTABLE");
  return text;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function portablePath(value: string): string {
  if (typeof value !== "string" || value.length < 1 || CONTROL_RE.test(value) || hasUnpairedSurrogate(value)) {
    fail("WATCHER_SOURCE_CAPABILITY_UNSTABLE");
  }
  const normalized = normalizeVaultRelative(value);
  if (Buffer.byteLength(normalized, "utf8") > MAX_PATH_BYTES) fail("WATCHER_SOURCE_CAPABILITY_UNSTABLE");
  try { validateWatcherSourcePath(normalized); }
  catch { fail("WATCHER_SOURCE_CAPABILITY_UNSTABLE"); }
  return normalized;
}

function scanRootEvidence(requestedPath: string, canonical: string, state: FileState): Phase3ScanRootEvidence {
  return Object.freeze({
    requested_path: requestedPath,
    canonical_path: canonical,
    device: state.dev,
    inode: state.ino,
    mode: state.mode,
  });
}

function sameDirectoryIdentity(evidence: Phase3ScanRootEvidence, state: FileState): boolean {
  const sameDevice = evidence.device === state.dev ||
    (process.platform === "win32" && (evidence.device === 0 || state.dev === 0));
  return state.isDirectory() && !state.isSymbolicLink() && sameDevice && evidence.inode === state.ino && evidence.mode === state.mode;
}

function sameFileState(left: FileState, right: FileState): boolean {
  const sameDevice = left.dev === right.dev || (process.platform === "win32" && (left.dev === 0 || right.dev === 0));
  return left.isFile() && right.isFile() && !left.isSymbolicLink() && !right.isSymbolicLink() &&
    left.nlink === 1 && right.nlink === 1 && sameDevice && left.ino === right.ino &&
    left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function excluded(path: string, extra: ReadonlySet<string>): boolean {
  if (shouldIgnoreVaultPath(path)) return true;
  return [...extra].some((entry) => path === entry || path.startsWith(`${entry}/`));
}

/** Single Phase-3 scanner shared by the established CLI and the watcher. */
export async function scanPhase3Corpus(dir: string, options: Phase3CorpusScanOptions = {}): Promise<Phase3CorpusScan> {
  const files: SourceFile[] = [];
  const attachments: string[] = [];
  const folders: string[] = [];
  const rejectedSources: Phase3ScanRejection[] = [];
  const namespaceRows: Phase3NamespaceRow[] = [];
  const extra = new Set((options.extra_exclusions ?? []).map(portablePath));
  const requestedRoot = resolve(dir);
  const actualRoot = await canonicalPath(requestedRoot, { alias_error: "GKX_SCAN_ROOT_ALIAS_REJECTED" });
  const rootState = await lstat(actualRoot) as unknown as FileState;
  if (!rootState.isDirectory() || rootState.isSymbolicLink()) throw new Error("GKX_SCAN_ROOT_ALIAS_REJECTED");
  const rootEvidence = scanRootEvidence(requestedRoot, actualRoot, rootState);

  function rejection(childRel: string, state: FileState | null | undefined, reasons: string | readonly string[], sourceDigest: string | null = null): void {
    const reasonCodes = [...new Set(Array.isArray(reasons) ? reasons : [reasons])].sort(codeUnitCompare);
    rejectedSources.push(Object.freeze({
      source_path: childRel,
      source_digest: sourceDigest,
      size: Number.isSafeInteger(state?.size) && Number(state?.size) >= 0 ? Number(state?.size) : null,
      created_time_ms: Number.isFinite(state?.birthtimeMs) ? (Number(state?.birthtimeMs) || Number(state?.mtimeMs)) : null,
      modified_time_ms: Number.isFinite(state?.mtimeMs) ? Number(state?.mtimeMs) : null,
      classification: "rejected",
      reason_codes: Object.freeze(reasonCodes),
    }));
  }

  function namespaceRow(childRel: string, kind: Phase3NamespaceRow["kind"], state: FileState): void {
    namespaceRows.push(Object.freeze({
      source_path: childRel,
      kind,
      device: identityNumber(state.dev),
      inode: identityNumber(state.ino),
      mode: Number(state.mode),
      nlink: Number(state.nlink),
      byte_size: Number(state.size),
      modified_ms: Number(state.mtimeMs),
      changed_ms: Number(state.ctimeMs),
      created_ms: Number(state.birthtimeMs) || Number(state.mtimeMs),
    }));
  }

  async function inspectPlainContainedFile(childAbs: string, childRel: string, readContent: boolean): Promise<{
    readonly canonical: string;
    readonly state: FileState;
    readonly content?: string;
    readonly source_digest?: string;
  } | null> {
    let canonical: string;
    let before: FileState | undefined;
    try {
      canonical = await canonicalPath(childAbs, { alias_error: "GKX_SCAN_SOURCE_ALIAS_REJECTED" });
      if (!canonicalPathContains(actualRoot, canonical)) throw new Error("GKX_SCAN_SOURCE_PATH_ESCAPE");
    } catch (error) {
      const candidate = error as NodeJS.ErrnoException;
      const reason = options.ingest !== true
        ? "SOURCE_FILESYSTEM_ALIAS_REJECTED"
        : ["ENOENT", "ESTALE"].includes(candidate?.code ?? "")
          ? "SOURCE_SNAPSHOT_CHANGED_DURING_SCAN"
          : ["GKX_SCAN_SOURCE_ALIAS_REJECTED", "GKX_SCAN_SOURCE_PATH_ESCAPE"].includes(candidate?.message ?? "")
            ? "SOURCE_FILESYSTEM_ALIAS_REJECTED"
            : "SOURCE_READ_FAILED";
      rejection(childRel, before, reason);
      return null;
    }

    try { before = await lstat(canonical) as unknown as FileState; }
    catch (error) {
      const candidate = error as NodeJS.ErrnoException;
      rejection(childRel, null, options.ingest !== true
        ? "SOURCE_FILESYSTEM_ALIAS_REJECTED"
        : ["ENOENT", "ESTALE"].includes(candidate?.code ?? "")
          ? "SOURCE_SNAPSHOT_CHANGED_DURING_SCAN"
          : "SOURCE_READ_FAILED");
      return null;
    }
    const preflightReasons: string[] = [];
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) preflightReasons.push("SOURCE_FILESYSTEM_ALIAS_REJECTED");
    if (!Number.isSafeInteger(before.size) || before.size < 0 || (readContent && before.size > MAX_SCAN_NOTE_BYTES)) {
      preflightReasons.push("SOURCE_SIZE_LIMIT_EXCEEDED");
    }
    if (preflightReasons.length > 0) {
      rejection(childRel, before, options.ingest === true ? preflightReasons : preflightReasons[0]!);
      return null;
    }
    if (!readContent) return { canonical, state: before };

    let handle;
    try {
      await options.on_before_file_open?.({ relative_path: childRel, absolute_path: canonical });
      handle = await open(canonical, "r");
      const opened = await handle.stat() as unknown as FileState;
      if (!sameFileState(before, opened)) throw new Error("GKX_SCAN_SOURCE_CHANGED");
      const bytes = Buffer.alloc(before.size + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      let openedAfter: FileState;
      let pathAfter: FileState;
      let canonicalAfter: string;
      try {
        openedAfter = await handle.stat() as unknown as FileState;
        pathAfter = await lstat(canonical) as unknown as FileState;
        canonicalAfter = await canonicalPath(canonical, { alias_error: "GKX_SCAN_SOURCE_ALIAS_REJECTED" });
      } catch { throw new Error("GKX_SCAN_SOURCE_CHANGED"); }
      if (!canonicalPathContains(actualRoot, canonicalAfter) || !sameCanonicalPath(canonical, canonicalAfter) ||
          !sameFileState(before, openedAfter) || !sameFileState(before, pathAfter) || length !== before.size) {
        throw new Error("GKX_SCAN_SOURCE_CHANGED");
      }
      const sourceDigest = `sha256:${createHash("sha256").update(bytes.subarray(0, length)).digest("hex")}`;
      let content: string;
      try { content = (options.ingest === true ? FATAL_UTF8_EXACT : FATAL_UTF8).decode(bytes.subarray(0, length)); }
      catch {
        rejection(childRel, before, "SOURCE_UTF8_INVALID", sourceDigest);
        return null;
      }
      return { canonical, state: before, content, source_digest: sourceDigest };
    } catch (error) {
      const candidate = error as NodeJS.ErrnoException;
      if (options.ingest !== true) {
        rejection(childRel, before, "SOURCE_SNAPSHOT_CHANGED_DURING_SCAN");
        return null;
      }
      let changed = candidate?.message === "GKX_SCAN_SOURCE_CHANGED" || ["ENOENT", "ESTALE"].includes(candidate?.code ?? "");
      let aliased = false;
      if (!changed) {
        try {
          const pathNow = await lstat(canonical) as unknown as FileState;
          aliased = pathNow.isSymbolicLink() || pathNow.nlink !== 1;
          changed = aliased || !sameFileState(before, pathNow);
          if (!changed) {
            const canonicalNow = await canonicalPath(canonical, { alias_error: "GKX_SCAN_SOURCE_ALIAS_REJECTED" });
            changed = !canonicalPathContains(actualRoot, canonicalNow) || !sameCanonicalPath(canonical, canonicalNow);
          }
        } catch (probeError) {
          const probe = probeError as NodeJS.ErrnoException;
          changed = ["ENOENT", "ESTALE"].includes(probe?.code ?? "") ||
            ["GKX_SCAN_SOURCE_ALIAS_REJECTED", "GKX_SCAN_SOURCE_PATH_ESCAPE"].includes(probe?.message ?? "");
          aliased = probe?.message === "GKX_SCAN_SOURCE_ALIAS_REJECTED";
        }
      }
      rejection(childRel, before, changed
        ? [...(aliased ? ["SOURCE_FILESYSTEM_ALIAS_REJECTED"] : []), "SOURCE_SNAPSHOT_CHANGED_DURING_SCAN"]
        : "SOURCE_READ_FAILED");
      return null;
    } finally {
      if (handle) await handle.close();
    }
  }

  async function walk(absolute: string, relativePath: string): Promise<void> {
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((left, right) => codeUnitCompare(left.name, right.name));
    for (const entry of entries) {
      const childRel = portablePath(relativePath ? `${relativePath}/${entry.name}` : entry.name);
      if (excluded(childRel, extra)) continue;
      const childAbs = join(absolute, entry.name);
      await options.on_before_child_lstat?.({ relative_path: childRel, absolute_path: childAbs });
      let linkState: FileState;
      try { linkState = await lstat(childAbs) as unknown as FileState; }
      catch (error) {
        const candidate = error as NodeJS.ErrnoException;
        if (options.ingest === true && entry.isFile() && (isNotePath(childRel) || isAttachmentPath(childRel))) {
          rejection(childRel, null, ["ENOENT", "ESTALE"].includes(candidate?.code ?? "")
            ? "SOURCE_SNAPSHOT_CHANGED_DURING_SCAN"
            : "SOURCE_READ_FAILED");
          continue;
        }
        throw error;
      }
      if (options.ingest === true && ((entry.isFile() && !linkState.isFile()) || (entry.isDirectory() && !linkState.isDirectory()))) {
        rejection(childRel, linkState, [
          ...(linkState.isSymbolicLink() ? ["SOURCE_FILESYSTEM_ALIAS_REJECTED"] : []),
          "SOURCE_SNAPSHOT_CHANGED_DURING_SCAN",
        ]);
        continue;
      }
      if (linkState.isSymbolicLink()) {
        rejection(childRel, linkState, "SOURCE_FILESYSTEM_ALIAS_REJECTED");
        continue;
      }
      if (linkState.isDirectory()) {
        let canonicalDirectory: string;
        try {
          canonicalDirectory = await canonicalPath(childAbs, { alias_error: "GKX_SCAN_SOURCE_ALIAS_REJECTED" });
          if (!canonicalPathContains(actualRoot, canonicalDirectory)) throw new Error("GKX_SCAN_SOURCE_PATH_ESCAPE");
        } catch {
          rejection(childRel, linkState, "SOURCE_FILESYSTEM_ALIAS_REJECTED");
          continue;
        }
        folders.push(childRel);
        namespaceRow(childRel, "folder", linkState);
        await walk(canonicalDirectory, childRel);
      } else if (linkState.isFile() && isNotePath(childRel)) {
        namespaceRow(childRel, "note", linkState);
        const inspected = await inspectPlainContainedFile(childAbs, childRel, true);
        if (!inspected) continue;
        const file: SourceFile = {
          relativePath: childRel,
          name: entry.name,
          size: inspected.state.size,
          modifiedTime: inspected.state.mtimeMs,
          createdTime: inspected.state.birthtimeMs || inspected.state.mtimeMs,
          content: inspected.content,
          kind: "note",
        };
        phase3FileEvidenceByFile.set(file, Object.freeze({
          plain_file: linkState.isFile() && !linkState.isSymbolicLink(),
          link_count: inspected.state.nlink,
          requested_path: resolve(childAbs),
          real_path: inspected.canonical,
          aliased: false,
          device: identityNumber(inspected.state.dev),
          inode: identityNumber(inspected.state.ino),
          mode: Number(inspected.state.mode),
          changed_ms: Number(inspected.state.ctimeMs),
          source_digest: inspected.source_digest,
        }));
        files.push(Object.freeze(file));
      } else if (linkState.isFile() && isAttachmentPath(childRel)) {
        namespaceRow(childRel, "attachment", linkState);
        const inspected = await inspectPlainContainedFile(childAbs, childRel, false);
        if (inspected) attachments.push(childRel);
      }
      if (namespaceRows.length > MAX_SOURCES) fail("WATCHER_SOURCE_CAPABILITY_UNSTABLE");
    }
  }

  await walk(actualRoot, "");
  await options.on_before_root_recheck?.({ requested_path: requestedRoot, canonical_path: actualRoot });
  let rootAfter: FileState;
  let canonicalRootAfter: string;
  try {
    rootAfter = await lstat(actualRoot) as unknown as FileState;
    canonicalRootAfter = await canonicalPath(requestedRoot, { alias_error: "GKX_SCAN_ROOT_ALIAS_REJECTED" });
  } catch { throw new Error("GKX_SCAN_ROOT_CHANGED_DURING_SCAN"); }
  if (!sameDirectoryIdentity(rootEvidence, rootAfter) || !sameCanonicalPath(actualRoot, canonicalRootAfter)) {
    throw new Error("GKX_SCAN_ROOT_CHANGED_DURING_SCAN");
  }
  files.sort((left, right) => codeUnitCompare(left.relativePath, right.relativePath));
  attachments.sort(codeUnitCompare);
  folders.sort(codeUnitCompare);
  rejectedSources.sort((left, right) => codeUnitCompare(left.source_path, right.source_path));
  namespaceRows.sort((left, right) => codeUnitCompare(left.source_path, right.source_path));
  const result: { files: readonly SourceFile[]; attachments: readonly string[]; folders: readonly string[] } = {
    files: Object.freeze(files), attachments: Object.freeze(attachments), folders: Object.freeze(folders),
  };
  Object.defineProperty(result, PHASE3_SCAN_REJECTIONS, {
    enumerable: false, configurable: false, writable: false, value: Object.freeze(rejectedSources),
  });
  Object.defineProperty(result, PHASE3_SCAN_ROOT, {
    enumerable: false, configurable: false, writable: false, value: rootEvidence,
  });
  Object.defineProperty(result, PHASE3_NAMESPACE_EVIDENCE, {
    enumerable: false, configurable: false, writable: false, value: Object.freeze(namespaceRows),
  });
  return result as Phase3CorpusScan;
}

export async function revalidatePhase3ScanRoot(scan: Phase3CorpusScan): Promise<string> {
  const evidence = scan?.[PHASE3_SCAN_ROOT];
  if (!evidence || typeof evidence !== "object" || typeof evidence.requested_path !== "string" ||
      typeof evidence.canonical_path !== "string" || !["number", "bigint"].includes(typeof evidence.device) ||
      !["number", "bigint"].includes(typeof evidence.inode) || typeof evidence.mode !== "number") {
    throw new Error("GKX_CLI_SCAN_ROOT_EVIDENCE_MISSING");
  }
  let canonicalAfter: string;
  let stateAfter: FileState;
  try {
    canonicalAfter = await canonicalPath(evidence.requested_path, { alias_error: "GKX_SCAN_ROOT_ALIAS_REJECTED" });
    stateAfter = await lstat(evidence.canonical_path) as unknown as FileState;
  } catch { throw new Error("GKX_SCAN_ROOT_CHANGED_DURING_SCAN"); }
  if (!sameCanonicalPath(evidence.canonical_path, canonicalAfter) || !sameDirectoryIdentity(evidence, stateAfter)) {
    throw new Error("GKX_SCAN_ROOT_CHANGED_DURING_SCAN");
  }
  return evidence.canonical_path;
}

function watcherIdentity(row: Phase3NamespaceRow, sourceDigest: string | null): WatcherSourceIdentity {
  return Object.freeze({
    source_path: row.source_path,
    device: row.device,
    inode: row.inode,
    mode: row.mode,
    nlink: row.nlink,
    byte_size: row.byte_size,
    modified_ms: row.modified_ms,
    changed_ms: row.changed_ms,
    created_ms: row.created_ms,
    source_digest: sourceDigest,
    kind: row.kind === "note" ? "note" : "attachment",
  });
}

export async function secureWatcherSourceScan(vaultRoot: string, options: WatcherSourceScanOptions = {}): Promise<WatcherSourceScan> {
  const exclusions = [...new Set([WATCHER_ARCHIVE_EXCLUSION, ...(options.extra_exclusions ?? [])])];
  const first = await scanPhase3Corpus(vaultRoot, {
    ingest: true,
    extra_exclusions: exclusions,
    on_before_file_open: options.on_after_file_open === undefined
      ? undefined
      : async ({ relative_path }) => options.on_after_file_open?.(relative_path),
    on_before_root_recheck: options.on_after_first_snapshot,
  });
  const rejections = first[PHASE3_SCAN_REJECTIONS] ?? [];
  // Only the stable, pre-NoteRecord size rejection is eligible for the
  // deterministic N-1 validation path. Invalid UTF-8, read instability,
  // aliasing and snapshot/TOCTOU failures retain the prior generation.
  if (rejections.some((row) => row.reason_codes.some((reason) => reason !== "SOURCE_SIZE_LIMIT_EXCEEDED"))) {
    fail("WATCHER_SOURCE_CAPABILITY_UNSTABLE");
  }
  const second = await scanPhase3Corpus(vaultRoot, { ingest: true, extra_exclusions: exclusions });
  const firstRows = first[PHASE3_NAMESPACE_EVIDENCE] ?? [];
  const secondRows = second[PHASE3_NAMESPACE_EVIDENCE] ?? [];
  const firstRoot = first[PHASE3_SCAN_ROOT];
  const secondRoot = second[PHASE3_SCAN_ROOT];
  if (!firstRoot || !secondRoot || firstRoot.canonical_path !== secondRoot.canonical_path ||
      retrievalCanonicalDigest(firstRows) !== retrievalCanonicalDigest(secondRows) ||
      retrievalCanonicalDigest(rejections) !== retrievalCanonicalDigest(second[PHASE3_SCAN_REJECTIONS] ?? [])) {
    fail("WATCHER_SOURCE_CAPABILITY_UNSTABLE");
  }
  const filesByPath = new Map(first.files.map((file) => [file.relativePath, file]));
  const identities = firstRows.filter((row) => row.kind !== "folder").map((row) => {
    const sourceFile = filesByPath.get(row.source_path);
    const evidence = sourceFile === undefined ? null : phase3FileEvidence(sourceFile);
    return watcherIdentity(row, evidence?.source_digest ?? null);
  });
  return Object.freeze({
    vault_root: firstRoot.canonical_path,
    files: first.files,
    folders: first.folders,
    attachments: first.attachments,
    scan_rejections: Object.freeze([...rejections]),
    identities: Object.freeze(identities),
    namespace_digest: retrievalCanonicalDigest({
      root: { device: identityNumber(secondRoot.device), inode: identityNumber(secondRoot.inode), mode: secondRoot.mode },
      rows: secondRows,
      rejections: second[PHASE3_SCAN_REJECTIONS] ?? [],
    }),
  });
}

/**
 * Compare the securely reopened physical source namespace with the complete
 * source/folder/attachment coordinates sealed by one active Topology14.
 * Parser descriptors and rejection details remain topology authority; this
 * relation proves only that no source byte or admitted pathname changed.
 */
export function watcherScanMatchesTopology(scan: WatcherSourceScan, topology: Readonly<Record<string, unknown>>): boolean {
  const accepted = Array.isArray(topology.accepted_sources) ? topology.accepted_sources : [];
  const rejected = Array.isArray(topology.rejected_sources) ? topology.rejected_sources : [];
  if (!Array.isArray(topology.accepted_sources) || !Array.isArray(topology.rejected_sources)
      || !Array.isArray(topology.folder_paths) || !Array.isArray(topology.attachment_paths)) return false;
  const topologySources = [...accepted, ...rejected].map((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (typeof row.source_path !== "string" || typeof row.source_digest !== "string"
        || !Number.isSafeInteger(row.source_size_bytes)) return null;
    return `${row.source_path}\u0000${row.source_digest}\u0000${String(row.source_size_bytes)}`;
  });
  if (topologySources.some((value) => value === null)) return false;
  const rejectionByPath = new Map(scan.scan_rejections.map((row) => [row.source_path, row]));
  const scanSources = scan.identities.filter((row) => row.kind === "note").map((row) => {
    const rejection = rejectionByPath.get(row.source_path);
    const digest = rejection?.source_digest ?? row.source_digest;
    const size = rejection?.size ?? row.byte_size;
    return digest === null || size === null ? null : `${row.source_path}\u0000${digest}\u0000${String(size)}`;
  });
  if (scanSources.some((value) => value === null)) return false;
  const sorted = (values: readonly (string | null)[]): readonly string[] => Object.freeze(
    values.map((value) => value as string).sort((left, right) => left < right ? -1 : left > right ? 1 : 0),
  );
  const folders = [...scan.folders].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const attachments = [...scan.attachments].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return JSON.stringify(sorted(scanSources)) === JSON.stringify(sorted(topologySources))
    && JSON.stringify(folders) === JSON.stringify([...topology.folder_paths].sort())
    && JSON.stringify(attachments) === JSON.stringify([...topology.attachment_paths].sort());
}

export function normalizeWatcherHint(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || Buffer.byteLength(value, "utf8") > MAX_HINT_BYTES ||
      CONTROL_RE.test(value) || hasUnpairedSurrogate(value)) return null;
  try {
    const normalized = portablePath(value.replaceAll("\\", "/"));
    if (normalized === WATCHER_ARCHIVE_EXCLUSION || normalized.startsWith(`${WATCHER_ARCHIVE_EXCLUSION}/`)) return "";
    return shouldIgnoreVaultPath(normalized) ? "" : normalized;
  } catch {
    return null;
  }
}
