import { randomBytes } from "node:crypto";

import { sealWatcherRecoveryRecord } from "./contracts";
import {
  hardlinkWatcherLeafNoReplace,
  listWatcherLeaves,
  parseCanonicalWatcherJson,
  readWatcherFile,
  replaceWatcherLeaf,
  revalidateWatcherDirectory,
  syncWatcherDirectory,
  unlinkWatcherLeaf,
  watcherCanonicalBytes,
  watcherDigest,
  watcherLeafExists,
  watcherRawDigest,
  writeNewWatcherFile,
  type WatcherDirectoryCapability,
  type WatcherSealedFile,
} from "./fs-authority";

type JsonRecord = Record<string, unknown>;

export type WatcherPointerNamespace = "outer" | "journal";

export interface WatcherPointerNames {
  readonly operation: "replace_watcher_active_pointer" | "replace_watcher_journal_pointer";
  readonly final: string;
  readonly guard: string;
  readonly guard_stage: string;
  readonly temporary: string;
  readonly immutable_prefix: string;
}

export const WATCHER_OUTER_POINTER_NAMES: WatcherPointerNames = Object.freeze({
  operation: "replace_watcher_active_pointer",
  final: "watcher-active.json",
  guard: ".watcher-active.json.gkos-watcher.guard",
  guard_stage: ".watcher-active.json.gkos-watcher.guard-stage",
  temporary: ".watcher-active.json.gkos-watcher.tmp",
  immutable_prefix: "watcher-pointer-",
});

export const WATCHER_JOURNAL_POINTER_NAMES: WatcherPointerNames = Object.freeze({
  operation: "replace_watcher_journal_pointer",
  final: "watcher-journal-active.json",
  guard: ".watcher-journal-active.json.gkos-watcher.guard",
  guard_stage: ".watcher-journal-active.json.gkos-watcher.guard-stage",
  temporary: ".watcher-journal-active.json.gkos-watcher.tmp",
  immutable_prefix: "watcher-journal-pointer-",
});

const CONTROLLED_NAMES = new Set([
  WATCHER_OUTER_POINTER_NAMES.final,
  WATCHER_OUTER_POINTER_NAMES.guard,
  WATCHER_OUTER_POINTER_NAMES.guard_stage,
  WATCHER_OUTER_POINTER_NAMES.temporary,
  WATCHER_JOURNAL_POINTER_NAMES.final,
  WATCHER_JOURNAL_POINTER_NAMES.guard,
  WATCHER_JOURNAL_POINTER_NAMES.guard_stage,
  WATCHER_JOURNAL_POINTER_NAMES.temporary,
]);

export interface WatcherPointerArtifact {
  readonly pointer: Readonly<JsonRecord>;
  readonly file: string;
  readonly bytes: Buffer;
  readonly raw_sha256: string;
  readonly byte_size: number;
}

export interface WatcherPointerPublicationOptions {
  readonly namespace: WatcherPointerNamespace;
  readonly directory: WatcherDirectoryCapability;
  readonly new_pointer: unknown;
  readonly old_pointer: unknown | null;
  readonly operation_intent_digest: string;
  readonly target_commit_digest: string;
  readonly prepared_guard?: unknown;
  readonly validate_guard?: (guard: Readonly<JsonRecord>) => void;
  /** Persist/reopen any irreversible target witness while the guard still routes readers to the old authority. */
  readonly prepare_target?: (targetCommitDigest: string) => void;
  readonly finalize_target: () => void;
  readonly on_boundary?: (boundary:
    | "immutable_pointer"
    | "guard_stage"
    | "guard_linked"
    | "guard_stage_removed"
    | "temporary_pointer"
    | "target_prepared"
    | "fixed_pointer"
    | "target_finalized"
    | "guard_removed") => void;
}

function fail(code: string): never {
  throw new Error(code);
}

function namesFor(namespace: WatcherPointerNamespace): WatcherPointerNames {
  return namespace === "outer" ? WATCHER_OUTER_POINTER_NAMES : WATCHER_JOURNAL_POINTER_NAMES;
}

function pointerDigest(pointer: Readonly<JsonRecord>): string {
  const value = pointer.pointer_digest;
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) fail("GKX_WATCHER_POINTER_DIGEST_INVALID");
  return value;
}

function expectedPointerVersion(namespace: WatcherPointerNamespace): string {
  return namespace === "outer"
    ? "gkos-watcher-active-pointer/1.0.0-draft.1"
    : "gkos-watcher-journal-active-pointer/1.0.0-draft.1";
}

export function sealWatcherPointer(namespace: WatcherPointerNamespace, value: unknown): Readonly<JsonRecord> {
  const pointer = sealWatcherRecoveryRecord(value);
  if (pointer.contract_version !== expectedPointerVersion(namespace)) fail("GKX_WATCHER_POINTER_VERSION_INVALID");
  return pointer;
}

export function watcherPointerArtifact(namespace: WatcherPointerNamespace, value: unknown): WatcherPointerArtifact {
  const pointer = sealWatcherPointer(namespace, value);
  const digest = pointerDigest(pointer);
  const bytes = watcherCanonicalBytes(pointer);
  const names = namesFor(namespace);
  const file = `${names.immutable_prefix}${digest.slice("sha256:".length)}.json`;
  return Object.freeze({ pointer, file, bytes, raw_sha256: watcherRawDigest(bytes), byte_size: bytes.byteLength });
}

function exactPointerFile(
  directory: WatcherDirectoryCapability,
  artifact: WatcherPointerArtifact,
  leaf = artifact.file,
): WatcherSealedFile {
  const file = readWatcherFile(directory, leaf);
  if (file.raw_sha256 !== artifact.raw_sha256 || file.bytes.byteLength !== artifact.byte_size || !file.bytes.equals(artifact.bytes)) {
    fail("GKX_WATCHER_POINTER_ARTIFACT_MISMATCH");
  }
  return file;
}

export function persistWatcherPointerArtifact(
  directory: WatcherDirectoryCapability,
  artifact: WatcherPointerArtifact,
): WatcherSealedFile {
  if (!watcherLeafExists(directory, artifact.file)) writeNewWatcherFile(directory, artifact.file, artifact.bytes);
  return exactPointerFile(directory, artifact);
}

function optionalFixed(
  directory: WatcherDirectoryCapability,
  names: WatcherPointerNames,
  oldArtifact: WatcherPointerArtifact | null,
): WatcherSealedFile | null {
  if (!watcherLeafExists(directory, names.final)) {
    if (oldArtifact !== null) fail("GKX_WATCHER_POINTER_OLD_FIXED_MISSING");
    return null;
  }
  if (oldArtifact === null) fail("GKX_WATCHER_POINTER_GENESIS_FIXED_PRESENT");
  const fixed = exactPointerFile(directory, oldArtifact, names.final);
  exactPointerFile(directory, oldArtifact);
  return fixed;
}

function guardMaterial(
  directory: WatcherDirectoryCapability,
  names: WatcherPointerNames,
  oldArtifact: WatcherPointerArtifact | null,
  oldFixed: WatcherSealedFile | null,
  next: WatcherPointerArtifact,
  operationIntentDigest: string,
  targetCommitDigest: string,
  ownerNonce = randomBytes(16).toString("hex"),
): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-pointer-replace-guard/1.0.0-draft.1",
    operation: names.operation,
    owner_nonce: ownerNonce,
    parent_device: directory.identity.device,
    parent_inode: directory.identity.inode,
    parent_mode: directory.identity.mode,
    final_basename: names.final,
    guard_basename: names.guard,
    guard_stage_basename: names.guard_stage,
    temp_basename: names.temporary,
    old_pointer_file: oldArtifact?.file ?? null,
    old_pointer_digest: oldArtifact === null ? null : pointerDigest(oldArtifact.pointer),
    old_pointer_raw_sha256: oldArtifact?.raw_sha256 ?? null,
    old_pointer_byte_size: oldArtifact?.byte_size ?? null,
    old_final_device: oldFixed?.identity.device ?? null,
    old_final_inode: oldFixed?.identity.inode ?? null,
    new_pointer_file: next.file,
    new_pointer_digest: pointerDigest(next.pointer),
    new_pointer_raw_sha256: next.raw_sha256,
    new_pointer_byte_size: next.byte_size,
    operation_intent_digest: operationIntentDigest,
    target_commit_digest: targetCommitDigest,
  };
  return sealWatcherRecoveryRecord({ ...base, guard_digest: watcherDigest(base) });
}

export function prepareWatcherPointerGuard(options: Omit<WatcherPointerPublicationOptions,
  "prepared_guard" | "validate_guard" | "prepare_target" | "finalize_target" | "on_boundary">): Readonly<JsonRecord> {
  const names = namesFor(options.namespace);
  revalidateWatcherDirectory(options.directory);
  assertNoUnknownPointerSidecars(options.directory, names);
  if (watcherLeafExists(options.directory, names.guard) || watcherLeafExists(options.directory, names.guard_stage) ||
      watcherLeafExists(options.directory, names.temporary)) fail("GKX_WATCHER_POINTER_RECOVERY_REQUIRED");
  const next = watcherPointerArtifact(options.namespace, options.new_pointer);
  const prior = options.old_pointer === null ? null : watcherPointerArtifact(options.namespace, options.old_pointer);
  const oldFixed = optionalFixed(options.directory, names, prior);
  return guardMaterial(
    options.directory,
    names,
    prior,
    oldFixed,
    next,
    options.operation_intent_digest,
    options.target_commit_digest,
  );
}

function persistGuard(
  directory: WatcherDirectoryCapability,
  names: WatcherPointerNames,
  guard: Readonly<JsonRecord>,
  onBoundary: WatcherPointerPublicationOptions["on_boundary"],
): void {
  if (watcherLeafExists(directory, names.guard) || watcherLeafExists(directory, names.guard_stage)) {
    fail("GKX_WATCHER_POINTER_RECOVERY_REQUIRED");
  }
  const bytes = watcherCanonicalBytes(guard);
  writeNewWatcherFile(directory, names.guard_stage, bytes);
  onBoundary?.("guard_stage");
  hardlinkWatcherLeafNoReplace(directory, names.guard_stage, names.guard);
  onBoundary?.("guard_linked");
  unlinkWatcherLeaf(directory, names.guard_stage, { allowed_links: 2, expected_raw_sha256: watcherRawDigest(bytes) });
  onBoundary?.("guard_stage_removed");
  const reopened = readWatcherFile(directory, names.guard);
  if (!reopened.bytes.equals(bytes)) fail("GKX_WATCHER_POINTER_GUARD_MISMATCH");
}

function assertNoUnknownPointerSidecars(directory: WatcherDirectoryCapability, names: WatcherPointerNames): void {
  const admitted = new Set([names.final, names.guard, names.guard_stage, names.temporary]);
  for (const leaf of listWatcherLeaves(directory)) {
    if ((leaf.startsWith(`.${names.final}.gkos-watcher.`) || CONTROLLED_NAMES.has(leaf)) && !admitted.has(leaf)) {
      fail("GKX_WATCHER_POINTER_RESERVED_LEAF_INVALID");
    }
  }
}

export function publishWatcherPointer(options: WatcherPointerPublicationOptions): WatcherPointerArtifact {
  const names = namesFor(options.namespace);
  revalidateWatcherDirectory(options.directory);
  assertNoUnknownPointerSidecars(options.directory, names);
  if (watcherLeafExists(options.directory, names.guard) || watcherLeafExists(options.directory, names.guard_stage) ||
      watcherLeafExists(options.directory, names.temporary)) fail("GKX_WATCHER_POINTER_RECOVERY_REQUIRED");

  const next = watcherPointerArtifact(options.namespace, options.new_pointer);
  const prior = options.old_pointer === null ? null : watcherPointerArtifact(options.namespace, options.old_pointer);
  const oldFixed = optionalFixed(options.directory, names, prior);
  persistWatcherPointerArtifact(options.directory, next);
  options.on_boundary?.("immutable_pointer");
  const suppliedGuard = options.prepared_guard === undefined ? null : sealWatcherRecoveryRecord(options.prepared_guard);
  const guard = guardMaterial(
    options.directory,
    names,
    prior,
    oldFixed,
    next,
    options.operation_intent_digest,
    options.target_commit_digest,
    suppliedGuard === null ? undefined : String(suppliedGuard.owner_nonce),
  );
  if (suppliedGuard !== null && !watcherCanonicalBytes(suppliedGuard).equals(watcherCanonicalBytes(guard))) {
    fail("GKX_WATCHER_POINTER_GUARD_MISMATCH");
  }
  options.validate_guard?.(guard);
  persistGuard(options.directory, names, guard, options.on_boundary);
  writeNewWatcherFile(options.directory, names.temporary, next.bytes);
  options.on_boundary?.("temporary_pointer");
  if (options.prepare_target !== undefined) {
    options.prepare_target(String(guard.target_commit_digest));
    options.on_boundary?.("target_prepared");
  }
  replaceWatcherLeaf(options.directory, names.temporary, names.final, next.raw_sha256);
  options.on_boundary?.("fixed_pointer");
  exactPointerFile(options.directory, next, names.final);
  options.finalize_target();
  options.on_boundary?.("target_finalized");
  exactPointerFile(options.directory, next, names.final);
  unlinkWatcherLeaf(options.directory, names.guard, { expected_raw_sha256: watcherRawDigest(watcherCanonicalBytes(guard)) });
  options.on_boundary?.("guard_removed");
  exactPointerFile(options.directory, next, names.final);
  return next;
}

function readAndSealGuard(directory: WatcherDirectoryCapability, names: WatcherPointerNames): Readonly<JsonRecord> {
  const file = readWatcherFile(directory, names.guard, {
    allowed_links: watcherLeafExists(directory, names.guard_stage) ? 2 : 1,
  });
  const guard = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(file));
  if (guard.contract_version !== "gkos-watcher-pointer-replace-guard/1.0.0-draft.1" || guard.operation !== names.operation ||
      guard.parent_device !== directory.identity.device || guard.parent_inode !== directory.identity.inode ||
      guard.parent_mode !== directory.identity.mode || guard.final_basename !== names.final || guard.guard_basename !== names.guard ||
      guard.guard_stage_basename !== names.guard_stage || guard.temp_basename !== names.temporary) {
    fail("GKX_WATCHER_POINTER_GUARD_MISMATCH");
  }
  return guard;
}

function artifactFromGuard(directory: WatcherDirectoryCapability, namespace: WatcherPointerNamespace, guard: Readonly<JsonRecord>, which: "old" | "new"): WatcherPointerArtifact | null {
  const file = guard[`${which}_pointer_file`];
  const digest = guard[`${which}_pointer_digest`];
  const raw = guard[`${which}_pointer_raw_sha256`];
  const size = guard[`${which}_pointer_byte_size`];
  if (which === "old" && file === null && digest === null && raw === null && size === null) return null;
  if (typeof file !== "string" || typeof digest !== "string" || typeof raw !== "string" || typeof size !== "number") {
    fail("GKX_WATCHER_POINTER_GUARD_MISMATCH");
  }
  const sealed = readWatcherFile(directory, file);
  const pointer = sealWatcherPointer(namespace, parseCanonicalWatcherJson(sealed));
  const artifact = watcherPointerArtifact(namespace, pointer);
  if (artifact.file !== file || pointerDigest(pointer) !== digest || artifact.raw_sha256 !== raw || artifact.byte_size !== size ||
      sealed.raw_sha256 !== raw || sealed.bytes.byteLength !== size) fail("GKX_WATCHER_POINTER_GUARD_MISMATCH");
  return artifact;
}

export function readWatcherPointer(
  directory: WatcherDirectoryCapability,
  namespace: WatcherPointerNamespace,
): Readonly<JsonRecord> | null {
  const names = namesFor(namespace);
  revalidateWatcherDirectory(directory);
  const guarded = watcherLeafExists(directory, names.guard);
  if (guarded) {
    const guard = readAndSealGuard(directory, names);
    const old = artifactFromGuard(directory, namespace, guard, "old");
    if (!watcherLeafExists(directory, names.guard)) fail("GKX_WATCHER_POINTER_RETRY_REQUIRED");
    return old?.pointer ?? null;
  }
  if (!watcherLeafExists(directory, names.final)) return null;
  const fixed = readWatcherFile(directory, names.final);
  const pointer = sealWatcherPointer(namespace, parseCanonicalWatcherJson(fixed));
  const artifact = watcherPointerArtifact(namespace, pointer);
  exactPointerFile(directory, artifact);
  if (!fixed.bytes.equals(artifact.bytes) || watcherLeafExists(directory, names.guard)) {
    fail("GKX_WATCHER_POINTER_RETRY_REQUIRED");
  }
  revalidateWatcherDirectory(directory);
  return pointer;
}

export interface WatcherPointerRecoveryOptions {
  readonly namespace: WatcherPointerNamespace;
  readonly directory: WatcherDirectoryCapability;
  readonly prepare_target?: (targetCommitDigest: string) => void;
  readonly finalize_target: (targetCommitDigest: string) => void;
  readonly on_boundary?: WatcherPointerPublicationOptions["on_boundary"];
}

export function recoverWatcherPointer(options: WatcherPointerRecoveryOptions): Readonly<JsonRecord> | null {
  const names = namesFor(options.namespace);
  revalidateWatcherDirectory(options.directory);
  if (watcherLeafExists(options.directory, names.guard_stage) && !watcherLeafExists(options.directory, names.guard)) {
    const stage = readWatcherFile(options.directory, names.guard_stage);
    const stagedGuard = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(stage));
    if (stagedGuard.guard_stage_basename !== names.guard_stage || stagedGuard.guard_basename !== names.guard) {
      fail("GKX_WATCHER_POINTER_GUARD_MISMATCH");
    }
    hardlinkWatcherLeafNoReplace(options.directory, names.guard_stage, names.guard);
    options.on_boundary?.("guard_linked");
  }
  if (!watcherLeafExists(options.directory, names.guard)) return readWatcherPointer(options.directory, options.namespace);
  const guard = readAndSealGuard(options.directory, names);
  const old = artifactFromGuard(options.directory, options.namespace, guard, "old");
  const next = artifactFromGuard(options.directory, options.namespace, guard, "new");
  if (next === null) fail("GKX_WATCHER_POINTER_GUARD_MISMATCH");

  if (watcherLeafExists(options.directory, names.guard_stage)) {
    const stage = readWatcherFile(options.directory, names.guard_stage, { allowed_links: 2 });
    const committed = readWatcherFile(options.directory, names.guard, { allowed_links: 2 });
    if (stage.identity.device !== committed.identity.device || stage.identity.inode !== committed.identity.inode ||
        !stage.bytes.equals(committed.bytes)) fail("GKX_WATCHER_POINTER_GUARD_MISMATCH");
    unlinkWatcherLeaf(options.directory, names.guard_stage, { allowed_links: 2, expected_raw_sha256: stage.raw_sha256 });
    options.on_boundary?.("guard_stage_removed");
  }

  let fixedIsNew = false;
  if (watcherLeafExists(options.directory, names.final)) {
    const fixed = readWatcherFile(options.directory, names.final);
    fixedIsNew = fixed.bytes.equals(next.bytes);
    if (!fixedIsNew && (old === null || !fixed.bytes.equals(old.bytes))) fail("GKX_WATCHER_POINTER_FIXED_MISMATCH");
  } else if (old !== null) fail("GKX_WATCHER_POINTER_OLD_FIXED_MISSING");

  options.prepare_target?.(String(guard.target_commit_digest));
  options.on_boundary?.("target_prepared");
  if (!fixedIsNew) {
    if (!watcherLeafExists(options.directory, names.temporary)) {
      writeNewWatcherFile(options.directory, names.temporary, next.bytes);
      options.on_boundary?.("temporary_pointer");
    } else {
      exactPointerFile(options.directory, next, names.temporary);
    }
    replaceWatcherLeaf(options.directory, names.temporary, names.final, next.raw_sha256);
    options.on_boundary?.("fixed_pointer");
  } else if (watcherLeafExists(options.directory, names.temporary)) {
    fail("GKX_WATCHER_POINTER_NEW_AND_TEMP_INVALID");
  }
  options.finalize_target(String(guard.target_commit_digest));
  options.on_boundary?.("target_finalized");
  exactPointerFile(options.directory, next, names.final);
  unlinkWatcherLeaf(options.directory, names.guard, { expected_raw_sha256: watcherRawDigest(watcherCanonicalBytes(guard)) });
  options.on_boundary?.("guard_removed");
  syncWatcherDirectory(options.directory.path);
  return next.pointer;
}
