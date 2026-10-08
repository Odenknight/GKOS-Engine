import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  ftruncateSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeSync,
  type BigIntStats,
} from "node:fs";
import { basename, dirname, join, parse, resolve } from "node:path";

import { canonicalPathSync, sameCanonicalPath } from "../retrieval/path-security";
import { retrievalCanonicalDigest, retrievalSha256, stableJson } from "../retrieval/digest";

export const WATCHER_DIRECTORY_MODE = 0o700;
export const WATCHER_FILE_MODE = 0o600;
export const WATCHER_MAX_AUTHORITY_BYTES = 1_048_576;
const WATCHER_MAX_TRANSITION_ENTRIES = 100_000;
const WATCHER_MAX_TRANSITION_LEAF_BYTES = 1_073_741_824;
const WATCHER_MAX_TRANSITION_SNAPSHOT_BYTES = 4_294_967_296;

const CONTROL_RE = /[\u0000-\u001f\u007f]/u;
const DECIMAL_RE = /^(?:0|[1-9][0-9]*)$/u;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
const UUID7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ISO_MS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export interface WatcherIdentity {
  readonly device: string;
  readonly inode: string;
  readonly mode: number;
  readonly nlink: number;
  readonly byte_size: number;
}

export interface WatcherDirectoryCapability {
  readonly path: string;
  readonly identity: WatcherIdentity;
}

interface WatcherDirectorySeal {
  readonly canonical_path: string;
  readonly identity: WatcherIdentity;
  readonly uid: number | null;
}

export interface WatcherDirectChildSnapshot {
  readonly basename: string;
  readonly kind: "directory" | "file";
  readonly lstat_coordinate: readonly string[];
  readonly stat_coordinate: readonly string[];
  readonly raw_sha256: string | null;
}

interface WatcherOpenedDirectory {
  readonly descriptor: number | null;
  readonly seal: WatcherDirectorySeal;
}

interface WatcherDirectoryMutationOptions {
  readonly on_authorized_mutation?: () => void;
  readonly on_before_seal_refresh?: () => void;
}

const watcherDirectorySeals = new WeakMap<object, WatcherDirectorySeal>();

export interface WatcherSealedFile {
  readonly path: string;
  readonly basename: string;
  readonly identity: WatcherIdentity;
  readonly bytes: Buffer;
  readonly raw_sha256: string;
}

function fail(code: string): never {
  throw new Error(code);
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function sameDevice(left: number | bigint, right: number | bigint): boolean {
  return left === right || (process.platform === "win32" && (left === 0 || right === 0));
}

function sameDeviceCoordinate(left: string, right: string): boolean {
  return left === right || (process.platform === "win32" && (left === "0" || right === "0"));
}

function sameStatCoordinate(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) =>
    index === 1 ? sameDeviceCoordinate(value, right[index] ?? "") : value === right[index]);
}

function identityOf(state: ReturnType<typeof statSync>): WatcherIdentity {
  const size = Number(state.size);
  const nlink = Number(state.nlink);
  const mode = Number(state.mode);
  if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(nlink) || nlink < 1 || !Number.isSafeInteger(mode)) {
    fail("GKX_WATCHER_FS_IDENTITY_INVALID");
  }
  const device = String(state.dev);
  const inode = String(state.ino);
  if (!DECIMAL_RE.test(device) || !DECIMAL_RE.test(inode)) fail("GKX_WATCHER_FS_IDENTITY_INVALID");
  const portableMode = process.platform === "win32"
    ? state.isDirectory() ? WATCHER_DIRECTORY_MODE : WATCHER_FILE_MODE
    : mode & 0o777;
  return Object.freeze({ device, inode, mode: portableMode, nlink, byte_size: size });
}

function assertSafeAbsolutePath(input: string): string {
  if (typeof input !== "string" || input.length < 1 || input.length > 4096 || CONTROL_RE.test(input)) {
    throw new TypeError("GKX_WATCHER_FS_PATH_INVALID");
  }
  const absolute = resolve(input);
  if (absolute === parse(absolute).root) throw new TypeError("GKX_WATCHER_FS_PATH_INVALID");
  return absolute;
}

function effectiveOwnerUid(): number | null {
  if (process.platform === "win32") return null;
  const uid = process.geteuid?.();
  if (!Number.isSafeInteger(uid) || (uid as number) < 0) fail("GKX_WATCHER_FS_DIRECTORY_OWNER_INVALID");
  return uid as number;
}

function assertDirectoryState(path: string): WatcherDirectorySeal {
  const link = lstatSync(path);
  const state = statSync(path);
  if (!link.isDirectory() || link.isSymbolicLink() || !state.isDirectory() || !sameDevice(link.dev, state.dev) ||
      link.ino !== state.ino || link.mode !== state.mode || link.nlink !== state.nlink || link.uid !== state.uid) {
    fail("GKX_WATCHER_FS_DIRECTORY_ALIAS_INVALID");
  }
  if (process.platform !== "win32" && (state.mode & 0o777) !== WATCHER_DIRECTORY_MODE) {
    fail("GKX_WATCHER_FS_DIRECTORY_MODE_INVALID");
  }
  const uid = effectiveOwnerUid();
  if (uid !== null && (!Number.isSafeInteger(state.uid) || state.uid !== uid)) {
    fail("GKX_WATCHER_FS_DIRECTORY_OWNER_INVALID");
  }
  return Object.freeze({ canonical_path: path, identity: identityOf(state), uid });
}

function requireDirectorySeal(capability: WatcherDirectoryCapability): WatcherDirectorySeal {
  if (capability === null || typeof capability !== "object") {
    throw new TypeError("GKX_WATCHER_FS_DIRECTORY_CAPABILITY_INVALID");
  }
  const seal = watcherDirectorySeals.get(capability as object);
  if (seal === undefined) throw new TypeError("GKX_WATCHER_FS_DIRECTORY_CAPABILITY_INVALID");
  return seal;
}

function createDirectoryCapability(path: string, knownSeal?: WatcherDirectorySeal): WatcherDirectoryCapability {
  const capability = {
    path,
    get identity(): WatcherIdentity {
      return requireDirectorySeal(this).identity;
    },
  } as WatcherDirectoryCapability;
  const seal = knownSeal ?? assertDirectoryState(path);
  if (seal.canonical_path !== path) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  watcherDirectorySeals.set(capability as object, seal);
  return Object.freeze(capability);
}

function refreshDirectorySeal(capability: WatcherDirectoryCapability, seal: WatcherDirectorySeal): void {
  requireDirectorySeal(capability);
  watcherDirectorySeals.set(capability as object, seal);
}

function bigintDeviceEqual(left: bigint, right: bigint): boolean {
  return left === right || (process.platform === "win32" && (left === 0n || right === 0n));
}

function bigintStatCoordinate(state: BigIntStats): readonly string[] {
  return Object.freeze([
    state.isDirectory() ? "directory" : state.isFile() ? "file" : "other",
    String(state.dev), String(state.ino), String(state.mode), String(state.nlink), String(state.size),
    String(state.mtimeNs), String(state.ctimeNs), String(state.uid), String(state.gid),
  ]);
}

function openBoundDirectory(path: string): WatcherOpenedDirectory {
  const seal = assertDirectoryState(path);
  if (process.platform === "win32") return Object.freeze({ descriptor: null, seal });
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const state = fstatSync(descriptor);
    if (!state.isDirectory() || stableJson(identityOf(state)) !== stableJson(seal.identity) || state.uid !== seal.uid) {
      fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
    }
    return Object.freeze({ descriptor, seal });
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function revalidateOpenedDirectory(path: string, opened: WatcherOpenedDirectory, pathMustExist: boolean): void {
  if (opened.descriptor !== null) {
    const state = fstatSync(opened.descriptor);
    const liveIdentityMatches = pathMustExist && stableJson(identityOf(state)) === stableJson(opened.seal.identity);
    const removedIdentityMatches = !pathMustExist && state.isDirectory() && String(state.dev) === opened.seal.identity.device &&
      String(state.ino) === opened.seal.identity.inode && (state.mode & 0o777) === opened.seal.identity.mode &&
      state.uid === opened.seal.uid && state.nlink === 0;
    if (!state.isDirectory() || (!liveIdentityMatches && !removedIdentityMatches)) {
      fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
    }
  }
  if (pathMustExist) {
    if (stableJson(assertDirectoryState(path)) !== stableJson(opened.seal)) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  } else if (exists(path)) {
    fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  }
}

function closeOpenedDirectory(opened: WatcherOpenedDirectory): void {
  if (opened.descriptor !== null) closeSync(opened.descriptor);
}

function streamDescriptorDigest(descriptor: number, expectedSize: bigint): string {
  if (expectedSize < 0n || expectedSize > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  }
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let offset = 0n;
  while (offset < expectedSize) {
    const remaining = expectedSize - offset;
    const length = Number(remaining > BigInt(buffer.length) ? BigInt(buffer.length) : remaining);
    const count = readSync(descriptor, buffer, 0, length, Number(offset));
    if (count < 1) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
    hash.update(buffer.subarray(0, count));
    offset += BigInt(count);
  }
  if (readSync(descriptor, buffer, 0, 1, Number(offset)) !== 0) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  return `sha256:${hash.digest("hex")}`;
}

function snapshotDirectChild(
  parent: WatcherDirectoryCapability,
  leaf: string,
  maximumFileBytes = WATCHER_MAX_TRANSITION_LEAF_BYTES,
  includeFileDigest = true,
): WatcherDirectChildSnapshot {
  const path = join(parent.path, leaf);
  const canonicalParent = canonicalPathSync(dirname(path), { alias_error: "GKX_WATCHER_FS_DIRECTORY_ALIAS_INVALID" });
  if (!sameCanonicalPath(canonicalParent, parent.path) || basename(path) !== leaf) {
    fail("GKX_WATCHER_FS_DIRECTORY_CONTAINMENT_INVALID");
  }
  const link = lstatSync(path, { bigint: true });
  const state = statSync(path, { bigint: true });
  const linkCoordinate = bigintStatCoordinate(link);
  const stateCoordinate = bigintStatCoordinate(state);
  if (link.isSymbolicLink() || (!link.isDirectory() && !link.isFile()) ||
      link.isDirectory() !== state.isDirectory() || link.isFile() !== state.isFile() ||
      !bigintDeviceEqual(link.dev, state.dev) || link.ino !== state.ino || link.mode !== state.mode ||
      link.nlink !== state.nlink || link.size !== state.size || link.mtimeNs !== state.mtimeNs || link.ctimeNs !== state.ctimeNs) {
    fail("GKX_WATCHER_FS_DIRECTORY_ALIAS_INVALID");
  }
  const canonical = canonicalPathSync(path, { alias_error: "GKX_WATCHER_FS_DIRECTORY_ALIAS_INVALID" });
  if (!sameCanonicalPath(canonical, path) || !sameCanonicalPath(dirname(canonical), parent.path)) {
    fail("GKX_WATCHER_FS_DIRECTORY_CONTAINMENT_INVALID");
  }
  let rawSha256: string | null = null;
  if (state.isFile() && includeFileDigest) {
    if (state.size > BigInt(Math.min(maximumFileBytes, WATCHER_MAX_TRANSITION_LEAF_BYTES))) {
      fail("GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED");
    }
    const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const openedBefore = fstatSync(descriptor, { bigint: true });
      if (!openedBefore.isFile() || !bigintDeviceEqual(state.dev, openedBefore.dev) || state.ino !== openedBefore.ino ||
          state.mode !== openedBefore.mode || state.nlink !== openedBefore.nlink || state.size !== openedBefore.size ||
          state.mtimeNs !== openedBefore.mtimeNs || state.ctimeNs !== openedBefore.ctimeNs) {
        fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
      }
      rawSha256 = streamDescriptorDigest(descriptor, openedBefore.size);
      const openedAfter = fstatSync(descriptor, { bigint: true });
      const beforeTuple = [openedBefore.dev, openedBefore.ino, openedBefore.mode, openedBefore.nlink,
        openedBefore.size, openedBefore.mtimeNs, openedBefore.ctimeNs].map(String);
      const afterTuple = [openedAfter.dev, openedAfter.ino, openedAfter.mode, openedAfter.nlink,
        openedAfter.size, openedAfter.mtimeNs, openedAfter.ctimeNs].map(String);
      if (stableJson(beforeTuple) !== stableJson(afterTuple)) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
    } finally {
      closeSync(descriptor);
    }
  }
  const linkAfter = lstatSync(path, { bigint: true });
  const stateAfter = statSync(path, { bigint: true });
  if (stableJson(bigintStatCoordinate(linkAfter)) !== stableJson(linkCoordinate) ||
      stableJson(bigintStatCoordinate(stateAfter)) !== stableJson(stateCoordinate)) {
    fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  }
  return Object.freeze({
    basename: leaf,
    kind: state.isDirectory() ? "directory" : "file",
    lstat_coordinate: linkCoordinate,
    stat_coordinate: stateCoordinate,
    raw_sha256: rawSha256,
  });
}

function snapshotRetainedChildren(
  parent: WatcherDirectoryCapability,
  excludedTargets: string | readonly string[],
): readonly WatcherDirectChildSnapshot[] {
  const excluded = new Set(typeof excludedTargets === "string" ? [excludedTargets] : excludedTargets);
  const leaves = readdirSync(parent.path).filter((leaf) => !excluded.has(leaf)).sort();
  if (leaves.length > WATCHER_MAX_TRANSITION_ENTRIES) fail("GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED");
  let admittedBytes = 0;
  for (const leaf of leaves) {
    const state = lstatSync(join(parent.path, leaf), { bigint: true });
    if (state.isFile()) admittedBytes += Number(state.size);
    if (!Number.isSafeInteger(admittedBytes) || state.size > BigInt(WATCHER_MAX_TRANSITION_LEAF_BYTES) ||
        admittedBytes > WATCHER_MAX_TRANSITION_SNAPSHOT_BYTES) {
      fail("GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED");
    }
  }
  const rows: WatcherDirectChildSnapshot[] = [];
  let snapshottedBytes = 0;
  for (const leaf of leaves) {
    const row = snapshotDirectChild(parent, leaf, WATCHER_MAX_TRANSITION_SNAPSHOT_BYTES - snapshottedBytes);
    if (row.kind === "file") snapshottedBytes += Number(row.stat_coordinate[5]);
    if (!Number.isSafeInteger(snapshottedBytes) || snapshottedBytes > WATCHER_MAX_TRANSITION_SNAPSHOT_BYTES) {
      fail("GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED");
    }
    rows.push(row);
  }
  if (snapshottedBytes !== admittedBytes) {
    fail("GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED");
  }
  return Object.freeze(rows);
}

interface WatcherLeafTransitionProof {
  readonly directory: WatcherDirectoryCapability;
  readonly before_seal: WatcherDirectorySeal;
  readonly opened_parent: WatcherOpenedDirectory;
  readonly affected_leaves: readonly string[];
  readonly retained_before: readonly WatcherDirectChildSnapshot[];
  readonly affected_before: ReadonlyMap<string, WatcherDirectChildSnapshot | null>;
}

export interface WatcherLeafTransitionSnapshot {
  readonly before: ReadonlyMap<string, WatcherDirectChildSnapshot | null>;
  readonly after: ReadonlyMap<string, WatcherDirectChildSnapshot | null>;
}

export interface WatcherLeafTransitionOptions {
  readonly on_before_seal_refresh?: () => void;
  readonly maximum_affected_file_bytes?: number;
  readonly include_affected_file_digests?: boolean;
}

/**
 * One operation in the private coherent-publication filesystem capability.
 * The complete ordered declaration is authenticated before any operation is
 * allowed.  Callers cannot widen it after entry.
 */
export type WatcherPublicationOperation =
  | Readonly<{
      step_id: string;
      operation: "ensure_file";
      leaf: string;
      raw_sha256: string;
      byte_size: number;
      maximum_bytes: number;
    }>
  | Readonly<{
      step_id: string;
      operation: "create_file";
      leaf: string;
      raw_sha256: string;
      byte_size: number;
      maximum_bytes: number;
    }>
  | Readonly<{
      step_id: string;
      operation: "hardlink";
      source_leaf: string;
      target_leaf: string;
      resulting_links: 2 | 3;
    }>
  | Readonly<{
      step_id: string;
      operation: "unlink";
      leaf: string;
      expected_raw_sha256: string;
      allowed_links: 1 | 2 | 3;
      survivor_leaves: readonly string[];
    }>
  | Readonly<{
      step_id: string;
      operation: "replace";
      source_leaf: string;
      target_leaf: string;
      expected_raw_sha256: string;
    }>;

export interface WatcherPublicationDeclaration {
  readonly operations: readonly WatcherPublicationOperation[];
  readonly sealed_input_leaves?: readonly Readonly<{ leaf: string; maximum_bytes: number }>[];
}

/** Opaque, unforgeable session token; its authority lives only in a WeakMap. */
export interface WatcherPublicationCapability {
  readonly directory: WatcherDirectoryCapability;
}

export interface WatcherPublicationOptions {
  readonly on_before_seal_refresh?: () => void;
  /** Private adversarial seam between the durable syscall and its post-snapshot. */
  readonly on_after_operation_syscall?: (stepId: string) => void;
}

interface WatcherPublicationState {
  readonly proof: WatcherLeafTransitionProof;
  readonly operations: readonly WatcherPublicationOperation[];
  readonly entry_affected: ReadonlyMap<string, WatcherDirectChildSnapshot | null>;
  readonly current_affected: Map<string, WatcherDirectChildSnapshot | null>;
  readonly sealed_inputs: ReadonlyMap<string, WatcherSealedFile>;
  readonly on_after_operation_syscall?: (stepId: string) => void;
  next_ordinal: number;
  active: boolean;
}

const watcherPublicationSessions = new WeakMap<object, WatcherPublicationState>();

function assertLeafBasename(directory: WatcherDirectoryCapability, leaf: string): string {
  if (typeof leaf !== "string" || leaf.length < 1 || leaf.length > 255 || CONTROL_RE.test(leaf) ||
      leaf === "." || leaf === ".." || basename(leaf) !== leaf || /[\\/]/u.test(leaf)) {
    throw new TypeError("GKX_WATCHER_FS_BASENAME_INVALID");
  }
  const path = join(directory.path, leaf);
  const canonicalParent = canonicalPathSync(dirname(path), { alias_error: "GKX_WATCHER_FS_DIRECTORY_ALIAS_INVALID" });
  if (!sameCanonicalPath(canonicalParent, directory.path)) fail("GKX_WATCHER_FS_FILE_CONTAINMENT_INVALID");
  return path;
}

function beginWatcherLeafTransition(
  directory: WatcherDirectoryCapability,
  affectedLeaves: readonly string[],
  maximumAffectedFileBytes = WATCHER_MAX_TRANSITION_LEAF_BYTES,
  includeAffectedFileDigests = true,
): WatcherLeafTransitionProof {
  revalidateWatcherDirectory(directory);
  const affected = [...affectedLeaves].sort();
  if (affected.length > WATCHER_MAX_TRANSITION_ENTRIES) fail("GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED");
  if (affected.length < 1 || new Set(affected).size !== affected.length) {
    throw new TypeError("GKX_WATCHER_FS_BASENAME_INVALID");
  }
  for (const leaf of affected) assertLeafBasename(directory, leaf);
  const beforeSeal = requireDirectorySeal(directory);
  const openedParent = openBoundDirectory(directory.path);
  if (stableJson(openedParent.seal) !== stableJson(beforeSeal)) {
    closeOpenedDirectory(openedParent);
    fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  }
  try {
    const retainedBefore = snapshotRetainedChildren(directory, affected);
    if (retainedBefore.length + affected.length > WATCHER_MAX_TRANSITION_ENTRIES) {
      fail("GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED");
    }
    const affectedBefore = new Map<string, WatcherDirectChildSnapshot | null>();
    let aggregateBytes = retainedBefore.reduce((total, row) =>
      total + (row.kind === "file" ? Number(row.stat_coordinate[5]) : 0), 0);
    for (const leaf of affected) {
      const row = exists(join(directory.path, leaf))
        ? snapshotDirectChild(directory, leaf, maximumAffectedFileBytes, includeAffectedFileDigests)
        : null;
      affectedBefore.set(leaf, row);
      if (row?.kind === "file") aggregateBytes += Number(row.stat_coordinate[5]);
      if (!Number.isSafeInteger(aggregateBytes) || aggregateBytes > WATCHER_MAX_TRANSITION_SNAPSHOT_BYTES) {
        fail("GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED");
      }
    }
    return Object.freeze({
      directory,
      before_seal: beforeSeal,
      opened_parent: openedParent,
      affected_leaves: Object.freeze(affected),
      retained_before: retainedBefore,
      affected_before: affectedBefore,
    });
  } catch (error) {
    closeOpenedDirectory(openedParent);
    throw error;
  }
}

function currentParentSealForLeafTransition(proof: WatcherLeafTransitionProof): WatcherDirectorySeal {
  const current = assertDirectoryState(proof.directory.path);
  const before = proof.before_seal;
  if (current.canonical_path !== before.canonical_path || current.uid !== before.uid ||
      current.identity.device !== before.identity.device || current.identity.inode !== before.identity.inode ||
      current.identity.mode !== before.identity.mode || current.identity.nlink !== before.identity.nlink) {
    fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  }
  if (proof.opened_parent.descriptor !== null) {
    const opened = fstatSync(proof.opened_parent.descriptor);
    if (!opened.isDirectory() || String(opened.dev) !== current.identity.device ||
        String(opened.ino) !== current.identity.inode || (opened.mode & 0o777) !== current.identity.mode ||
        opened.nlink !== current.identity.nlink || opened.uid !== current.uid || opened.size !== current.identity.byte_size) {
      fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
    }
  }
  return current;
}

function validateWatcherLeafTransition(
  proof: WatcherLeafTransitionProof,
  presentLeaves: readonly string[],
  maximumAffectedFileBytes: number,
  includeAffectedFileDigests = true,
): Readonly<{ seal: WatcherDirectorySeal; affected: ReadonlyMap<string, WatcherDirectChildSnapshot | null> }> {
  const present = [...presentLeaves].sort();
  if (new Set(present).size !== present.length || present.some((leaf) => !proof.affected_leaves.includes(leaf))) {
    throw new TypeError("GKX_WATCHER_FS_BASENAME_INVALID");
  }
  const expectedLeaves = [...proof.retained_before.map((row) => row.basename), ...present].sort();
  if (expectedLeaves.length > WATCHER_MAX_TRANSITION_ENTRIES) fail("GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED");
  if (stableJson(readdirSync(proof.directory.path).sort()) !== stableJson(expectedLeaves)) {
    fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  }
  if (stableJson(snapshotRetainedChildren(proof.directory, proof.affected_leaves)) !== stableJson(proof.retained_before)) {
    fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  }
  const affected = new Map<string, WatcherDirectChildSnapshot | null>();
  let aggregateBytes = proof.retained_before.reduce((total, row) =>
    total + (row.kind === "file" ? Number(row.stat_coordinate[5]) : 0), 0);
  for (const leaf of proof.affected_leaves) {
    const row = present.includes(leaf)
      ? snapshotDirectChild(proof.directory, leaf, maximumAffectedFileBytes, includeAffectedFileDigests)
      : null;
    affected.set(leaf, row);
    if (row?.kind === "file") aggregateBytes += Number(row.stat_coordinate[5]);
    if (!Number.isSafeInteger(aggregateBytes) || aggregateBytes > WATCHER_MAX_TRANSITION_SNAPSHOT_BYTES) {
      fail("GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED");
    }
  }
  return Object.freeze({ seal: currentParentSealForLeafTransition(proof), affected });
}

/** Run one exact direct-file namespace transition and refresh only after proof. */
export function withAuthorizedWatcherLeafTransition<T>(
  directory: WatcherDirectoryCapability,
  affectedLeaves: readonly string[],
  mutate: (
    before: ReadonlyMap<string, WatcherDirectChildSnapshot | null>,
    authenticateIntermediate: (
      presentLeaves: readonly string[],
      assertIntermediateRelation: (snapshot: WatcherLeafTransitionSnapshot) => void,
    ) => WatcherDirectoryCapability,
  ) => T,
  expectedPresentLeaves: readonly string[] | ((result: T) => readonly string[]),
  assertRelation: (snapshot: WatcherLeafTransitionSnapshot) => void,
  options: WatcherLeafTransitionOptions = {},
): T {
  const maximum = options.maximum_affected_file_bytes ?? WATCHER_MAX_TRANSITION_LEAF_BYTES;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > WATCHER_MAX_TRANSITION_LEAF_BYTES) {
    throw new TypeError("GKX_WATCHER_FS_FILE_BYTES_INVALID");
  }
  const includeAffectedFileDigests = options.include_affected_file_digests ?? true;
  const proof = beginWatcherLeafTransition(directory, affectedLeaves, maximum, includeAffectedFileDigests);
  try {
    const authenticateIntermediate = (
      presentLeaves: readonly string[],
      assertIntermediateRelation: (snapshot: WatcherLeafTransitionSnapshot) => void,
    ): WatcherDirectoryCapability => {
      const first = validateWatcherLeafTransition(proof, presentLeaves, maximum, includeAffectedFileDigests);
      assertIntermediateRelation(Object.freeze({ before: proof.affected_before, after: first.affected }));
      const second = validateWatcherLeafTransition(proof, presentLeaves, maximum, includeAffectedFileDigests);
      assertIntermediateRelation(Object.freeze({ before: proof.affected_before, after: second.affected }));
      if (stableJson([...first.affected]) !== stableJson([...second.affected]) || stableJson(first.seal) !== stableJson(second.seal)) {
        fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
      }
      return createDirectoryCapability(directory.path, second.seal);
    };
    const result = mutate(proof.affected_before, authenticateIntermediate);
    const present = typeof expectedPresentLeaves === "function" ? expectedPresentLeaves(result) : expectedPresentLeaves;
    const after = validateWatcherLeafTransition(proof, present, maximum, includeAffectedFileDigests);
    assertRelation(Object.freeze({ before: proof.affected_before, after: after.affected }));
    options.on_before_seal_refresh?.();
    const final = validateWatcherLeafTransition(proof, present, maximum, includeAffectedFileDigests);
    assertRelation(Object.freeze({ before: proof.affected_before, after: final.affected }));
    if (stableJson([...after.affected]) !== stableJson([...final.affected]) || stableJson(after.seal) !== stableJson(final.seal)) {
      fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
    }
    refreshDirectorySeal(directory, final.seal);
    revalidateWatcherDirectory(directory);
    return result;
  } finally {
    closeOpenedDirectory(proof.opened_parent);
  }
}

function normalizeWatcherPublicationDeclaration(
  directory: WatcherDirectoryCapability,
  declaration: WatcherPublicationDeclaration,
): Readonly<{
  operations: readonly WatcherPublicationOperation[];
  affected_leaves: readonly string[];
  sealed_inputs: readonly Readonly<{ leaf: string; maximum_bytes: number }>[];
}> {
  if (declaration === null || typeof declaration !== "object" || !Array.isArray(declaration.operations) ||
      declaration.operations.length < 1 || declaration.operations.length > WATCHER_MAX_TRANSITION_ENTRIES) {
    throw new TypeError("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
  }
  const stepIds = new Set<string>();
  const affected = new Set<string>();
  const operations = declaration.operations.map((candidate): WatcherPublicationOperation => {
    if (candidate === null || typeof candidate !== "object" || typeof candidate.step_id !== "string" ||
        candidate.step_id.length < 1 || candidate.step_id.length > 128 || CONTROL_RE.test(candidate.step_id) ||
        stepIds.has(candidate.step_id)) {
      throw new TypeError("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
    }
    stepIds.add(candidate.step_id);
    if (candidate.operation === "ensure_file" || candidate.operation === "create_file") {
      assertLeafBasename(directory, candidate.leaf);
      if (!DIGEST_RE.test(candidate.raw_sha256) || !Number.isSafeInteger(candidate.byte_size) || candidate.byte_size < 1 ||
          !Number.isSafeInteger(candidate.maximum_bytes) || candidate.maximum_bytes < candidate.byte_size ||
          candidate.maximum_bytes > WATCHER_MAX_TRANSITION_LEAF_BYTES) {
        throw new TypeError("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
      }
      affected.add(candidate.leaf);
      return Object.freeze({ ...candidate });
    }
    if (candidate.operation === "hardlink") {
      assertLeafBasename(directory, candidate.source_leaf);
      assertLeafBasename(directory, candidate.target_leaf);
      if (candidate.source_leaf === candidate.target_leaf || (candidate.resulting_links !== 2 && candidate.resulting_links !== 3)) {
        throw new TypeError("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
      }
      affected.add(candidate.source_leaf);
      affected.add(candidate.target_leaf);
      return Object.freeze({ ...candidate });
    }
    if (candidate.operation === "unlink") {
      assertLeafBasename(directory, candidate.leaf);
      if (!DIGEST_RE.test(candidate.expected_raw_sha256) ||
          (candidate.allowed_links !== 1 && candidate.allowed_links !== 2 && candidate.allowed_links !== 3) ||
          !Array.isArray(candidate.survivor_leaves) || candidate.survivor_leaves.length !== candidate.allowed_links - 1) {
        throw new TypeError("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
      }
      const survivors = [...candidate.survivor_leaves].sort();
      if (new Set(survivors).size !== survivors.length || survivors.includes(candidate.leaf)) {
        throw new TypeError("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
      }
      for (const leaf of survivors) assertLeafBasename(directory, leaf);
      affected.add(candidate.leaf);
      for (const leaf of survivors) affected.add(leaf);
      return Object.freeze({ ...candidate, survivor_leaves: Object.freeze(survivors) });
    }
    if (candidate.operation === "replace") {
      assertLeafBasename(directory, candidate.source_leaf);
      assertLeafBasename(directory, candidate.target_leaf);
      if (candidate.source_leaf === candidate.target_leaf || !DIGEST_RE.test(candidate.expected_raw_sha256)) {
        throw new TypeError("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
      }
      affected.add(candidate.source_leaf);
      affected.add(candidate.target_leaf);
      return Object.freeze({ ...candidate });
    }
    throw new TypeError("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
  });
  const sealedInputCandidates = declaration.sealed_input_leaves ?? [];
  if (!Array.isArray(sealedInputCandidates) || sealedInputCandidates.length > WATCHER_MAX_TRANSITION_ENTRIES) {
    throw new TypeError("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
  }
  const sealedNames = new Set<string>();
  const sealedInputs = sealedInputCandidates.map((candidate) => {
    if (candidate === null || typeof candidate !== "object") {
      throw new TypeError("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
    }
    assertLeafBasename(directory, candidate.leaf);
    if (sealedNames.has(candidate.leaf) || !Number.isSafeInteger(candidate.maximum_bytes) ||
        candidate.maximum_bytes < 1 || candidate.maximum_bytes > WATCHER_MAX_TRANSITION_LEAF_BYTES) {
      throw new TypeError("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
    }
    sealedNames.add(candidate.leaf);
    return Object.freeze({ leaf: candidate.leaf, maximum_bytes: candidate.maximum_bytes });
  });
  const affectedLeaves = [...affected].sort();
  if (affectedLeaves.length < 1 || affectedLeaves.length > WATCHER_MAX_TRANSITION_ENTRIES) {
    throw new TypeError("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
  }
  return Object.freeze({
    operations: Object.freeze(operations),
    affected_leaves: Object.freeze(affectedLeaves),
    sealed_inputs: Object.freeze(sealedInputs),
  });
}

function requireWatcherPublicationSession(capability: WatcherPublicationCapability): WatcherPublicationState {
  if (capability === null || typeof capability !== "object") {
    throw new TypeError("GKX_WATCHER_FS_PUBLICATION_CAPABILITY_INVALID");
  }
  const state = watcherPublicationSessions.get(capability as object);
  if (state === undefined || !state.active) throw new TypeError("GKX_WATCHER_FS_PUBLICATION_CAPABILITY_INVALID");
  return state;
}

function publicationEntryRow(
  proof: WatcherLeafTransitionProof,
  leaf: string,
): WatcherDirectChildSnapshot | null {
  if (proof.affected_before.has(leaf)) return proof.affected_before.get(leaf) ?? null;
  return proof.retained_before.find((row) => row.basename === leaf) ?? null;
}

function sealWatcherPublicationInput(
  proof: WatcherLeafTransitionProof,
  leaf: string,
  maximumBytes: number,
): WatcherSealedFile {
  const row = publicationEntryRow(proof, leaf);
  if (row?.kind !== "file" || row.raw_sha256 === null || Number(row.stat_coordinate[4]) !== 1) {
    fail("GKX_WATCHER_FS_PUBLICATION_INPUT_INVALID");
  }
  const size = Number(row.stat_coordinate[5]);
  if (!Number.isSafeInteger(size) || size < 1 || size > maximumBytes) {
    fail("GKX_WATCHER_FS_PUBLICATION_INPUT_INVALID");
  }
  const path = assertLeafBasename(proof.directory, leaf);
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || !sameStatCoordinate(bigintStatCoordinate(before), row.stat_coordinate)) {
      fail("GKX_WATCHER_FS_PUBLICATION_INPUT_CHANGED");
    }
    const bytes = Buffer.alloc(size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    const pathLink = lstatSync(path, { bigint: true });
    const pathState = statSync(path, { bigint: true });
    const exact = bytes.subarray(0, Math.min(offset, size));
    if (offset !== size || !sameStatCoordinate(bigintStatCoordinate(after), row.stat_coordinate) ||
        stableJson(bigintStatCoordinate(pathLink)) !== stableJson(row.lstat_coordinate) ||
        !sameStatCoordinate(bigintStatCoordinate(pathState), row.stat_coordinate) || watcherRawDigest(exact) !== row.raw_sha256) {
      fail("GKX_WATCHER_FS_PUBLICATION_INPUT_CHANGED");
    }
    return Object.freeze({
      path,
      basename: leaf,
      identity: identityOf(fstatSync(descriptor)),
      bytes: Buffer.from(exact),
      raw_sha256: row.raw_sha256,
    });
  } finally {
    closeSync(descriptor);
  }
}

function consumeWatcherPublicationStep<T extends WatcherPublicationOperation["operation"]>(
  state: WatcherPublicationState,
  stepId: string,
  operation: T,
): Extract<WatcherPublicationOperation, { operation: T }> {
  const step = state.operations[state.next_ordinal];
  if (step === undefined || step.step_id !== stepId || step.operation !== operation) {
    fail("GKX_WATCHER_FS_PUBLICATION_SEQUENCE_INVALID");
  }
  return step as Extract<WatcherPublicationOperation, { operation: T }>;
}

function authenticateWatcherPublicationLeaf(
  state: WatcherPublicationState,
  leaf: string,
): WatcherDirectChildSnapshot | null {
  const expected = state.current_affected.get(leaf);
  if (expected === undefined && !state.current_affected.has(leaf)) {
    fail("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
  }
  const actual = exists(join(state.proof.directory.path, leaf))
    ? snapshotDirectChild(state.proof.directory, leaf)
    : null;
  if (stableJson(actual) !== stableJson(expected)) fail("GKX_WATCHER_FS_PUBLICATION_PREFIX_INVALID");
  if (actual !== null) assertWatcherPublicationPrivateFile(actual);
  return actual;
}

function assertWatcherPublicationPrivateFile(
  row: WatcherDirectChildSnapshot,
  code = "GKX_WATCHER_FS_PUBLICATION_TARGET_INVALID",
): asserts row is WatcherDirectChildSnapshot {
  const mode = Number(row.stat_coordinate[3]);
  const nlink = Number(row.stat_coordinate[4]);
  const size = Number(row.stat_coordinate[5]);
  const uid = Number(row.stat_coordinate[8]);
  const gid = Number(row.stat_coordinate[9]);
  const owner = effectiveOwnerUid();
  if (row.kind !== "file" || row.raw_sha256 === null || !Number.isSafeInteger(mode) ||
      !Number.isSafeInteger(nlink) || nlink < 1 || !Number.isSafeInteger(size) || size < 0 ||
      !Number.isSafeInteger(uid) || uid < 0 || !Number.isSafeInteger(gid) || gid < 0 ||
      (process.platform !== "win32" && ((mode & 0o777) !== WATCHER_FILE_MODE || uid !== owner))) {
    fail(code);
  }
}

function assertWatcherPublicationFileTransition(
  before: WatcherDirectChildSnapshot,
  after: WatcherDirectChildSnapshot,
  expectedAfterLinks: number,
  code = "GKX_WATCHER_FS_PUBLICATION_TARGET_INVALID",
): void {
  assertWatcherPublicationPrivateFile(before, code);
  assertWatcherPublicationPrivateFile(after, code);
  const left = before.stat_coordinate;
  const right = after.stat_coordinate;
  if (before.raw_sha256 !== after.raw_sha256 || !sameDeviceCoordinate(left[1] ?? "", right[1] ?? "") ||
      left[2] !== right[2] || left[3] !== right[3] || Number(right[4]) !== expectedAfterLinks ||
      left[5] !== right[5] || left[6] !== right[6] || left[8] !== right[8] || left[9] !== right[9]) {
    fail(code);
  }
}

function assertWatcherPublicationFile(
  row: WatcherDirectChildSnapshot | null,
  rawSha256: string,
  byteSize: number,
): asserts row is WatcherDirectChildSnapshot {
  if (row === null) fail("GKX_WATCHER_FS_PUBLICATION_TARGET_INVALID");
  assertWatcherPublicationPrivateFile(row);
  if (row.raw_sha256 !== rawSha256 || Number(row.stat_coordinate[4]) !== 1 ||
      Number(row.stat_coordinate[5]) !== byteSize) {
    fail("GKX_WATCHER_FS_PUBLICATION_TARGET_INVALID");
  }
}

function writeWatcherPublicationFile(path: string, bytes: Uint8Array): void {
  const descriptor = openSync(path, "wx", WATCHER_FILE_MODE);
  try {
    let offset = 0;
    while (offset < bytes.byteLength) offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  if (process.platform !== "win32") chmodSync(path, WATCHER_FILE_MODE);
}

/** Return a copy of bytes sealed at publication entry; this never path-rereads. */
export function readWatcherPublicationEntryFile(
  capability: WatcherPublicationCapability,
  leaf: string,
): WatcherSealedFile {
  const state = requireWatcherPublicationSession(capability);
  const sealed = state.sealed_inputs.get(leaf);
  if (sealed === undefined) fail("GKX_WATCHER_FS_PUBLICATION_INPUT_INVALID");
  return Object.freeze({ ...sealed, identity: Object.freeze({ ...sealed.identity }), bytes: Buffer.from(sealed.bytes) });
}

/** Entry namespace names, sealed before the first declared operation. */
export function watcherPublicationEntryLeaves(capability: WatcherPublicationCapability): readonly string[] {
  const state = requireWatcherPublicationSession(capability);
  return Object.freeze([
    ...state.proof.retained_before.map((row) => row.basename),
    ...[...state.entry_affected].filter(([, row]) => row !== null).map(([leaf]) => leaf),
  ].sort());
}

export function ensureWatcherPublicationFile(
  capability: WatcherPublicationCapability,
  stepId: string,
  leaf: string,
  bytes: Uint8Array,
): WatcherSealedFile {
  const state = requireWatcherPublicationSession(capability);
  const step = consumeWatcherPublicationStep(state, stepId, "ensure_file");
  if (step.leaf !== leaf || !(bytes instanceof Uint8Array) || bytes.byteLength !== step.byte_size ||
      bytes.byteLength > step.maximum_bytes || watcherRawDigest(bytes) !== step.raw_sha256) {
    fail("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
  }
  currentParentSealForLeafTransition(state.proof);
  let row = authenticateWatcherPublicationLeaf(state, leaf);
  if (row === null) {
    writeWatcherPublicationFile(assertLeafBasename(state.proof.directory, leaf), bytes);
    syncWatcherDirectory(state.proof.directory.path);
    state.on_after_operation_syscall?.(step.step_id);
    row = snapshotDirectChild(state.proof.directory, leaf, step.maximum_bytes);
  }
  assertWatcherPublicationFile(row, step.raw_sha256, step.byte_size);
  currentParentSealForLeafTransition(state.proof);
  state.current_affected.set(leaf, row);
  state.next_ordinal += 1;
  return Object.freeze({
    path: join(state.proof.directory.path, leaf), basename: leaf,
    identity: Object.freeze({
      device: row.stat_coordinate[1], inode: row.stat_coordinate[2],
      mode: process.platform === "win32" ? WATCHER_FILE_MODE : Number(row.stat_coordinate[3]) & 0o777,
      nlink: Number(row.stat_coordinate[4]), byte_size: Number(row.stat_coordinate[5]),
    }),
    bytes: Buffer.from(bytes), raw_sha256: step.raw_sha256,
  });
}

export function createWatcherPublicationFile(
  capability: WatcherPublicationCapability,
  stepId: string,
  leaf: string,
  bytes: Uint8Array,
): WatcherSealedFile {
  const state = requireWatcherPublicationSession(capability);
  const step = consumeWatcherPublicationStep(state, stepId, "create_file");
  if (step.leaf !== leaf || !(bytes instanceof Uint8Array) || bytes.byteLength !== step.byte_size ||
      bytes.byteLength > step.maximum_bytes || watcherRawDigest(bytes) !== step.raw_sha256) {
    fail("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
  }
  currentParentSealForLeafTransition(state.proof);
  if (authenticateWatcherPublicationLeaf(state, leaf) !== null) fail("GKX_WATCHER_FS_LINK_TARGET_EXISTS");
  writeWatcherPublicationFile(assertLeafBasename(state.proof.directory, leaf), bytes);
  syncWatcherDirectory(state.proof.directory.path);
  state.on_after_operation_syscall?.(step.step_id);
  const row = snapshotDirectChild(state.proof.directory, leaf, step.maximum_bytes);
  assertWatcherPublicationFile(row, step.raw_sha256, step.byte_size);
  currentParentSealForLeafTransition(state.proof);
  state.current_affected.set(leaf, row);
  state.next_ordinal += 1;
  return Object.freeze({
    path: join(state.proof.directory.path, leaf), basename: leaf,
    identity: Object.freeze({
      device: row.stat_coordinate[1], inode: row.stat_coordinate[2],
      mode: process.platform === "win32" ? WATCHER_FILE_MODE : Number(row.stat_coordinate[3]) & 0o777,
      nlink: Number(row.stat_coordinate[4]), byte_size: Number(row.stat_coordinate[5]),
    }),
    bytes: Buffer.from(bytes), raw_sha256: step.raw_sha256,
  });
}

export function hardlinkWatcherPublicationFile(
  capability: WatcherPublicationCapability,
  stepId: string,
  sourceLeaf: string,
  targetLeaf: string,
): void {
  const state = requireWatcherPublicationSession(capability);
  const step = consumeWatcherPublicationStep(state, stepId, "hardlink");
  if (step.source_leaf !== sourceLeaf || step.target_leaf !== targetLeaf) {
    fail("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
  }
  currentParentSealForLeafTransition(state.proof);
  const source = authenticateWatcherPublicationLeaf(state, sourceLeaf);
  const target = authenticateWatcherPublicationLeaf(state, targetLeaf);
  if (source?.kind !== "file" || source.raw_sha256 === null || Number(source.stat_coordinate[4]) !== step.resulting_links - 1 ||
      target !== null) fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
  linkSync(join(state.proof.directory.path, sourceLeaf), join(state.proof.directory.path, targetLeaf));
  syncWatcherDirectory(state.proof.directory.path);
  state.on_after_operation_syscall?.(step.step_id);
  const nextSource = snapshotDirectChild(state.proof.directory, sourceLeaf);
  const nextTarget = snapshotDirectChild(state.proof.directory, targetLeaf);
  assertWatcherPublicationFileTransition(source, nextSource, step.resulting_links);
  if (nextTarget.raw_sha256 !== source.raw_sha256 || !sameStatCoordinate(nextSource.stat_coordinate, nextTarget.stat_coordinate)) {
    fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
  }
  assertWatcherPublicationPrivateFile(nextTarget);
  currentParentSealForLeafTransition(state.proof);
  state.current_affected.set(sourceLeaf, nextSource);
  state.current_affected.set(targetLeaf, nextTarget);
  state.next_ordinal += 1;
}

export function unlinkWatcherPublicationFile(
  capability: WatcherPublicationCapability,
  stepId: string,
  leaf: string,
): void {
  const state = requireWatcherPublicationSession(capability);
  const step = consumeWatcherPublicationStep(state, stepId, "unlink");
  if (step.leaf !== leaf) fail("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
  currentParentSealForLeafTransition(state.proof);
  const target = authenticateWatcherPublicationLeaf(state, leaf);
  if (target?.kind !== "file" || target.raw_sha256 !== step.expected_raw_sha256 ||
      Number(target.stat_coordinate[4]) !== step.allowed_links) fail("GKX_WATCHER_FS_FILE_CHANGED");
  for (const survivorLeaf of step.survivor_leaves) {
    const survivor = authenticateWatcherPublicationLeaf(state, survivorLeaf);
    if (survivor?.kind !== "file" || survivor.raw_sha256 !== target.raw_sha256 ||
        !sameStatCoordinate(survivor.stat_coordinate, target.stat_coordinate)) {
      fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
    }
  }
  unlinkSync(join(state.proof.directory.path, leaf));
  syncWatcherDirectory(state.proof.directory.path);
  state.on_after_operation_syscall?.(step.step_id);
  if (exists(join(state.proof.directory.path, leaf))) fail("GKX_WATCHER_FS_FILE_CHANGED");
  const nextSurvivors = new Map<string, WatcherDirectChildSnapshot>();
  for (const survivorLeaf of step.survivor_leaves) {
    const survivor = snapshotDirectChild(state.proof.directory, survivorLeaf);
    assertWatcherPublicationFileTransition(target, survivor, step.allowed_links - 1);
    nextSurvivors.set(survivorLeaf, survivor);
  }
  currentParentSealForLeafTransition(state.proof);
  state.current_affected.set(leaf, null);
  for (const [survivorLeaf, survivor] of nextSurvivors) state.current_affected.set(survivorLeaf, survivor);
  state.next_ordinal += 1;
}

export function replaceWatcherPublicationFile(
  capability: WatcherPublicationCapability,
  stepId: string,
  sourceLeaf: string,
  targetLeaf: string,
): void {
  const state = requireWatcherPublicationSession(capability);
  const step = consumeWatcherPublicationStep(state, stepId, "replace");
  if (step.source_leaf !== sourceLeaf || step.target_leaf !== targetLeaf) {
    fail("GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID");
  }
  currentParentSealForLeafTransition(state.proof);
  const source = authenticateWatcherPublicationLeaf(state, sourceLeaf);
  authenticateWatcherPublicationLeaf(state, targetLeaf);
  if (source?.kind !== "file" || source.raw_sha256 !== step.expected_raw_sha256 ||
      Number(source.stat_coordinate[4]) !== 1) fail("GKX_WATCHER_FS_REPLACE_AMBIGUOUS");
  renameSync(join(state.proof.directory.path, sourceLeaf), join(state.proof.directory.path, targetLeaf));
  syncWatcherDirectory(state.proof.directory.path);
  state.on_after_operation_syscall?.(step.step_id);
  if (exists(join(state.proof.directory.path, sourceLeaf))) fail("GKX_WATCHER_FS_REPLACE_AMBIGUOUS");
  const target = snapshotDirectChild(state.proof.directory, targetLeaf);
  assertWatcherPublicationFileTransition(source, target, 1);
  currentParentSealForLeafTransition(state.proof);
  state.current_affected.set(sourceLeaf, null);
  state.current_affected.set(targetLeaf, target);
  state.next_ordinal += 1;
}

function authenticateWatcherPublicationPrefix(
  state: WatcherPublicationState,
): Readonly<{ seal: WatcherDirectorySeal; affected: ReadonlyMap<string, WatcherDirectChildSnapshot | null> }> {
  const present = [...state.current_affected].filter(([, row]) => row !== null).map(([leaf]) => leaf);
  const authenticated = validateWatcherLeafTransition(state.proof, present, WATCHER_MAX_TRANSITION_LEAF_BYTES, true);
  if (stableJson([...authenticated.affected]) !== stableJson([...state.current_affected])) {
    fail("GKX_WATCHER_FS_PUBLICATION_PREFIX_INVALID");
  }
  return authenticated;
}

/**
 * Execute one finite W publication. Retained leaves are raw-hashed once at
 * entry and twice around the terminal pre-seal hook; individual operations
 * authenticate only their declared targets plus the held parent descriptor.
 */
export function withAuthorizedWatcherPublication<T>(
  directory: WatcherDirectoryCapability,
  declaration: WatcherPublicationDeclaration,
  execute: (capability: WatcherPublicationCapability) => T,
  options: WatcherPublicationOptions = {},
): T {
  const normalized = normalizeWatcherPublicationDeclaration(directory, declaration);
  const proof = beginWatcherLeafTransition(directory, normalized.affected_leaves);
  let capability: WatcherPublicationCapability | null = null;
  let state: WatcherPublicationState | null = null;
  try {
    for (const row of proof.affected_before.values()) {
      if (row !== null) assertWatcherPublicationPrivateFile(row);
    }
    const sealedInputs = new Map<string, WatcherSealedFile>();
    for (const input of normalized.sealed_inputs) {
      sealedInputs.set(input.leaf, sealWatcherPublicationInput(proof, input.leaf, input.maximum_bytes));
    }
    currentParentSealForLeafTransition(proof);
    capability = Object.freeze({ directory });
    state = {
      proof,
      operations: normalized.operations,
      entry_affected: new Map(proof.affected_before),
      current_affected: new Map(proof.affected_before),
      sealed_inputs: sealedInputs,
      on_after_operation_syscall: options.on_after_operation_syscall,
      next_ordinal: 0,
      active: true,
    };
    watcherPublicationSessions.set(capability as object, state);
    try {
      const result = execute(capability);
      if (state.next_ordinal !== state.operations.length) fail("GKX_WATCHER_FS_PUBLICATION_SEQUENCE_INVALID");
      const first = authenticateWatcherPublicationPrefix(state);
      options.on_before_seal_refresh?.();
      const second = authenticateWatcherPublicationPrefix(state);
      if (stableJson([...first.affected]) !== stableJson([...second.affected]) ||
          stableJson(first.seal) !== stableJson(second.seal)) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
      refreshDirectorySeal(directory, second.seal);
      revalidateWatcherDirectory(directory);
      return result;
    } catch (primary) {
      try {
        const crashPrefix = authenticateWatcherPublicationPrefix(state);
        refreshDirectorySeal(directory, crashPrefix.seal);
        revalidateWatcherDirectory(directory);
      } catch (authenticationError) {
        if (authenticationError !== null && typeof authenticationError === "object") {
          try { Object.defineProperty(authenticationError, "cause", { value: primary, configurable: true }); } catch { /* immutable error */ }
        }
        throw authenticationError;
      }
      throw primary;
    } finally {
      state.active = false;
      watcherPublicationSessions.delete(capability as object);
    }
  } finally {
    closeOpenedDirectory(proof.opened_parent);
  }
}

function assertAuthorizedParentTransition(
  parent: WatcherDirectoryCapability,
  beforeSeal: WatcherDirectorySeal,
  retainedBefore: readonly WatcherDirectChildSnapshot[],
  target: string,
  operation: "create" | "remove",
  targetBefore: WatcherDirectChildSnapshot | null,
  openedTarget: WatcherOpenedDirectory,
  onBeforeSealRefresh?: () => void,
): WatcherDirectorySeal {
  const validate = (): { readonly parent: WatcherDirectorySeal; readonly target: WatcherDirectChildSnapshot | null } => {
    const parentState = assertDirectoryState(parent.path);
    const expectedLeaves = [...retainedBefore.map((row) => row.basename), ...(operation === "create" ? [target] : [])].sort();
    if (stableJson(readdirSync(parent.path).sort()) !== stableJson(expectedLeaves)) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
    if (stableJson(snapshotRetainedChildren(parent, target)) !== stableJson(retainedBefore)) {
      fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
    }
    const targetState = operation === "create" ? snapshotDirectChild(parent, target) : null;
    if (operation === "create" && (targetState?.kind !== "directory" || stableJson(targetState) !== stableJson(targetBefore))) {
      fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
    }
    revalidateOpenedDirectory(join(parent.path, target), openedTarget, operation === "create");
    return Object.freeze({ parent: parentState, target: targetState });
  };
  const after = validate();
  const afterSeal = after.parent;
  if (afterSeal.canonical_path !== beforeSeal.canonical_path || afterSeal.uid !== beforeSeal.uid ||
      afterSeal.identity.device !== beforeSeal.identity.device || afterSeal.identity.inode !== beforeSeal.identity.inode ||
      afterSeal.identity.mode !== beforeSeal.identity.mode) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  const expectedNlink = process.platform === "win32" ? beforeSeal.identity.nlink
    : beforeSeal.identity.nlink + (operation === "create" ? 1 : -1);
  if (afterSeal.identity.nlink !== expectedNlink) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  onBeforeSealRefresh?.();
  const final = validate();
  if (stableJson(final.parent) !== stableJson(afterSeal) || stableJson(final.target) !== stableJson(after.target)) {
    fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  }
  return final.parent;
}

export function syncWatcherDirectory(directory: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function openWatcherDirectory(input: string): WatcherDirectoryCapability {
  const absolute = assertSafeAbsolutePath(input);
  const canonical = canonicalPathSync(absolute, { alias_error: "GKX_WATCHER_FS_DIRECTORY_ALIAS_INVALID" });
  return createDirectoryCapability(canonical);
}

/** Validate/create the caller-selected desktop status capability before use. */
export function ensureWatcherStatusDirectory(statusFile: string): WatcherDirectoryCapability {
  if (typeof statusFile !== "string" || statusFile.length < 1 || CONTROL_RE.test(statusFile)) {
    throw new TypeError("GKX_WATCHER_STATUS_DIRECTORY_INVALID");
  }
  const requested = dirname(resolve(statusFile));
  const canonical = canonicalPathSync(requested, {
    allow_missing: true,
    alias_error: "GKX_WATCHER_STATUS_DIRECTORY_ALIAS_INVALID",
  });
  const existed = exists(canonical);
  if (!existed) {
    mkdirSync(canonical, { recursive: true, mode: WATCHER_DIRECTORY_MODE });
    if (process.platform !== "win32") chmodSync(canonical, WATCHER_DIRECTORY_MODE);
    syncWatcherDirectory(dirname(canonical));
  }
  const capability = openWatcherDirectory(canonical);
  if (!sameCanonicalPath(capability.path, canonical)) fail("GKX_WATCHER_STATUS_DIRECTORY_ALIAS_INVALID");
  return capability;
}

export function ensureWatcherDirectory(
  input: string,
  parent?: WatcherDirectoryCapability,
  options: WatcherDirectoryMutationOptions = {},
): WatcherDirectoryCapability {
  const absolute = assertSafeAbsolutePath(input);
  const prospective = canonicalPathSync(absolute, {
    allow_missing: true,
    alias_error: "GKX_WATCHER_FS_DIRECTORY_ALIAS_INVALID",
  });
  if (parent !== undefined) {
    revalidateWatcherDirectory(parent);
    const expectedParent = canonicalPathSync(dirname(prospective), { alias_error: "GKX_WATCHER_FS_DIRECTORY_ALIAS_INVALID" });
    if (!sameCanonicalPath(expectedParent, parent.path) || basename(prospective) !== basename(absolute)) {
      fail("GKX_WATCHER_FS_DIRECTORY_CONTAINMENT_INVALID");
    }
  }
  if (!exists(prospective)) {
    const parentSeal = parent === undefined ? null : requireDirectorySeal(parent);
    const retained = parent === undefined ? null : snapshotRetainedChildren(parent, basename(prospective));
    mkdirSync(prospective, { recursive: false, mode: WATCHER_DIRECTORY_MODE });
    if (process.platform !== "win32") chmodSync(prospective, WATCHER_DIRECTORY_MODE);
    const createdSnapshot = parent === undefined ? null : snapshotDirectChild(parent, basename(prospective));
    const opened = openBoundDirectory(prospective);
    try {
      if (parent !== undefined) syncWatcherDirectory(parent.path);
      options.on_authorized_mutation?.();
      if (parent !== undefined && parentSeal !== null && retained !== null) {
        const refreshed = assertAuthorizedParentTransition(parent, parentSeal, retained, basename(prospective), "create",
          createdSnapshot, opened, options.on_before_seal_refresh);
        refreshDirectorySeal(parent, refreshed);
        const result = createDirectoryCapability(prospective, opened.seal);
        revalidateWatcherDirectory(parent);
        revalidateWatcherDirectory(result);
        return result;
      }
    } finally {
      closeOpenedDirectory(opened);
    }
  }
  const result = openWatcherDirectory(prospective);
  if (parent !== undefined) {
    revalidateWatcherDirectory(parent);
    if (!sameCanonicalPath(dirname(result.path), parent.path)) fail("GKX_WATCHER_FS_DIRECTORY_CONTAINMENT_INVALID");
  }
  return result;
}

/** Remove only an exact, securely reopened, empty direct child directory. */
export function removeEmptyWatcherDirectory(
  directory: WatcherDirectoryCapability,
  parent: WatcherDirectoryCapability,
  options: WatcherDirectoryMutationOptions = {},
): void {
  revalidateWatcherDirectory(parent);
  revalidateWatcherDirectory(directory);
  if (!sameCanonicalPath(dirname(directory.path), parent.path) || readdirSync(directory.path).length !== 0) {
    fail("GKX_WATCHER_FS_DIRECTORY_NOT_EMPTY");
  }
  const opened = openBoundDirectory(directory.path);
  if (stableJson(opened.seal) !== stableJson(requireDirectorySeal(directory))) {
    closeOpenedDirectory(opened);
    fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  }
  const parentSeal = requireDirectorySeal(parent);
  const target = basename(directory.path);
  const retained = snapshotRetainedChildren(parent, target);
  try {
    revalidateOpenedDirectory(directory.path, opened, true);
    rmdirSync(directory.path);
    syncWatcherDirectory(parent.path);
    options.on_authorized_mutation?.();
    refreshDirectorySeal(parent, assertAuthorizedParentTransition(parent, parentSeal, retained, target, "remove",
      null, opened, options.on_before_seal_refresh));
    if (exists(directory.path)) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  } finally {
    closeOpenedDirectory(opened);
  }
}

export function revalidateWatcherDirectory(capability: WatcherDirectoryCapability): void {
  const seal = requireDirectorySeal(capability);
  if (typeof capability.path !== "string") throw new TypeError("GKX_WATCHER_FS_DIRECTORY_CAPABILITY_INVALID");
  const canonical = canonicalPathSync(capability.path, { alias_error: "GKX_WATCHER_FS_DIRECTORY_ALIAS_INVALID" });
  if (!sameCanonicalPath(canonical, capability.path) || !sameCanonicalPath(canonical, seal.canonical_path)) {
    fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  }
  const current = assertDirectoryState(canonical);
  if (stableJson(current) !== stableJson(seal)) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
}

export function watcherCanonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(JSON.parse(stableJson(value)), null, 2)}\n`, "utf8");
}

export function watcherDigest(value: unknown): string {
  return retrievalCanonicalDigest(value);
}

export function watcherRawDigest(bytes: Uint8Array): string {
  return retrievalSha256(bytes);
}

function containedPath(directory: WatcherDirectoryCapability, leaf: string): string {
  revalidateWatcherDirectory(directory);
  if (typeof leaf !== "string" || leaf.length < 1 || leaf.length > 255 || CONTROL_RE.test(leaf) ||
      leaf === "." || leaf === ".." || basename(leaf) !== leaf || /[\\/]/u.test(leaf)) {
    throw new TypeError("GKX_WATCHER_FS_BASENAME_INVALID");
  }
  const path = join(directory.path, leaf);
  const canonicalParent = canonicalPathSync(dirname(path), { alias_error: "GKX_WATCHER_FS_DIRECTORY_ALIAS_INVALID" });
  if (!sameCanonicalPath(canonicalParent, directory.path)) fail("GKX_WATCHER_FS_FILE_CONTAINMENT_INVALID");
  return path;
}

export function watcherLeafExists(directory: WatcherDirectoryCapability, leaf: string): boolean {
  return exists(containedPath(directory, leaf));
}

export function listWatcherLeaves(directory: WatcherDirectoryCapability): readonly string[] {
  revalidateWatcherDirectory(directory);
  const entries = readdirSync(directory.path, { withFileTypes: true });
  if (entries.length > 100_000) fail("GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED");
  return Object.freeze(entries.map((entry) => entry.name).sort((left, right) => left < right ? -1 : left > right ? 1 : 0));
}

/** Stable, non-content namespace coordinate for before/after race proofs. */
export function watcherNamespaceCoordinate(
  directory: WatcherDirectoryCapability,
  excludedLeaves: readonly string[] = [],
  options: { readonly exclude_parent_byte_size?: boolean } = {},
): string {
  revalidateWatcherDirectory(directory);
  const excluded = new Set(excludedLeaves);
  const entries = readdirSync(directory.path, { withFileTypes: true })
    .filter((entry) => !excluded.has(entry.name))
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  if (entries.length > 100_000) fail("GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED");
  const rows = entries.map((entry) => {
    const path = containedPath(directory, entry.name);
    const link = lstatSync(path);
    const state = statSync(path);
    if (link.isSymbolicLink() || !sameDevice(link.dev, state.dev) || link.ino !== state.ino ||
        link.mode !== state.mode || link.nlink !== state.nlink || link.size !== state.size ||
        link.mtimeMs !== state.mtimeMs || link.ctimeMs !== state.ctimeMs ||
        entry.isDirectory() !== state.isDirectory() || entry.isFile() !== state.isFile()) {
      fail("GKX_WATCHER_FS_NAMESPACE_CHANGED");
    }
    return Object.freeze({
      basename: entry.name,
      kind: state.isDirectory() ? "directory" : state.isFile() ? "file" : "other",
      device: String(state.dev),
      inode: String(state.ino),
      mode: process.platform === "win32" ? state.isDirectory() ? WATCHER_DIRECTORY_MODE : WATCHER_FILE_MODE : state.mode & 0o777,
      nlink: Number(state.nlink),
      byte_size: Number(state.size),
      modified_ms: state.mtimeMs,
      changed_ms: state.ctimeMs,
    });
  });
  revalidateWatcherDirectory(directory);
  const directoryIdentity = directory.identity;
  return retrievalCanonicalDigest({
    // Direct-file lock/claim transitions legitimately change a POSIX
    // directory's implementation-defined byte_size. Callers that explicitly
    // exclude those leaves may exclude only that coordinate; the bound
    // capability still proves device/inode/mode/nlink/owner on every pass.
    directory: options.exclude_parent_byte_size === true ? {
      device: directoryIdentity.device,
      inode: directoryIdentity.inode,
      mode: directoryIdentity.mode,
      nlink: directoryIdentity.nlink,
    } : directoryIdentity,
    excluded_leaves: [...excluded].sort((left, right) => left < right ? -1 : left > right ? 1 : 0),
    rows,
  });
}

export function readWatcherFile(
  directory: WatcherDirectoryCapability,
  leaf: string,
  options: { readonly allowed_links?: 1 | 2 | 3; readonly maximum_bytes?: number } = {},
): WatcherSealedFile {
  const path = containedPath(directory, leaf);
  const allowedLinks = options.allowed_links ?? 1;
  const maximum = options.maximum_bytes ?? WATCHER_MAX_AUTHORITY_BYTES;
  const link = lstatSync(path);
  const before = statSync(path);
  const owner = effectiveOwnerUid();
  if (!link.isFile() || link.isSymbolicLink() || !before.isFile() || !sameDevice(link.dev, before.dev) ||
      link.ino !== before.ino || link.mode !== before.mode || link.nlink !== before.nlink ||
      link.size !== before.size || link.mtimeMs !== before.mtimeMs || link.ctimeMs !== before.ctimeMs ||
      link.uid !== before.uid || link.gid !== before.gid || before.nlink !== allowedLinks ||
      (process.platform !== "win32" && ((before.mode & 0o777) !== WATCHER_FILE_MODE || before.uid !== owner)) ||
      !Number.isSafeInteger(before.size) || before.size < 1 || before.size > maximum) {
    fail("GKX_WATCHER_FS_FILE_IDENTITY_INVALID");
  }
  const descriptor = openSync(path, "r");
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || !sameDevice(opened.dev, before.dev) || opened.ino !== before.ino || opened.mode !== before.mode ||
        opened.nlink !== allowedLinks || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs ||
        opened.ctimeMs !== before.ctimeMs || opened.uid !== before.uid || opened.gid !== before.gid ||
        (process.platform !== "win32" && opened.uid !== owner)) {
      fail("GKX_WATCHER_FS_FILE_CHANGED");
    }
    const bytes = Buffer.alloc(before.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(descriptor);
    const pathAfter = lstatSync(path);
    if (offset !== before.size || !after.isFile() || !pathAfter.isFile() || pathAfter.isSymbolicLink() ||
        !sameDevice(after.dev, before.dev) || !sameDevice(pathAfter.dev, before.dev) ||
        after.ino !== before.ino || pathAfter.ino !== before.ino || after.mode !== before.mode || pathAfter.mode !== before.mode ||
        after.nlink !== allowedLinks || pathAfter.nlink !== allowedLinks || after.size !== before.size || pathAfter.size !== before.size ||
        after.mtimeMs !== before.mtimeMs || pathAfter.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs || pathAfter.ctimeMs !== before.ctimeMs ||
        after.uid !== before.uid || pathAfter.uid !== before.uid || after.gid !== before.gid || pathAfter.gid !== before.gid ||
        (process.platform !== "win32" && (after.uid !== owner || pathAfter.uid !== owner))) {
      fail("GKX_WATCHER_FS_FILE_CHANGED");
    }
    revalidateWatcherDirectory(directory);
    const exact = bytes.subarray(0, offset);
    return Object.freeze({
      path,
      basename: leaf,
      identity: identityOf(after),
      bytes: exact,
      raw_sha256: watcherRawDigest(exact),
    });
  } finally {
    closeSync(descriptor);
  }
}

export function writeNewWatcherFile(
  directory: WatcherDirectoryCapability,
  leaf: string,
  bytes: Uint8Array,
  maximumBytes = WATCHER_MAX_AUTHORITY_BYTES,
  options: {
    readonly on_boundary?: (
      boundary: "created" | "partial_write" | "written" | "file_fsynced" | "parent_fsynced",
      transitionDirectory: WatcherDirectoryCapability,
    ) => void;
    readonly on_before_seal_refresh?: () => void;
  } = {},
): WatcherSealedFile {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > maximumBytes) {
    throw new TypeError("GKX_WATCHER_FS_FILE_BYTES_INVALID");
  }
  const path = assertLeafBasename(directory, leaf);
  withAuthorizedWatcherLeafTransition(directory, [leaf], (before, authenticateIntermediate) => {
    if (before.get(leaf) !== null) fail("GKX_WATCHER_FS_LINK_TARGET_EXISTS");
    const boundary = (
      value: "created" | "partial_write" | "written" | "file_fsynced" | "parent_fsynced",
      expectedSize: number,
    ): void => {
      // The caller may need to re-open sibling authority at an injected crash
      // boundary.  The original capability is deliberately not refreshed until
      // the complete transition proof below succeeds. Authenticate the exact
      // intermediate file and all retained siblings twice before exposing the
      // minimum read/interlock capability to the private callback.
      const transitionDirectory = authenticateIntermediate([leaf], ({ before: intermediateBefore, after }) => {
        const file = after.get(leaf);
        const parentUid = requireDirectorySeal(directory).uid;
        if (intermediateBefore.get(leaf) !== null || file?.kind !== "file" ||
            Number(file.stat_coordinate[4]) !== 1 || Number(file.stat_coordinate[5]) !== expectedSize ||
            (process.platform !== "win32" && ((Number(file.stat_coordinate[3]) & 0o777) !== WATCHER_FILE_MODE ||
              Number(file.stat_coordinate[8]) !== parentUid))) {
          fail("GKX_WATCHER_FS_FILE_CHANGED");
        }
      });
      options.on_boundary?.(value, transitionDirectory);
    };
    const descriptor = openSync(path, "wx", WATCHER_FILE_MODE);
    try {
      boundary("created", 0);
      const firstWrite = Math.max(1, Math.floor(bytes.byteLength / 2));
      let offset = 0;
      while (offset < firstWrite) offset += writeSync(descriptor, bytes, offset, firstWrite - offset, offset);
      boundary("partial_write", firstWrite);
      while (offset < bytes.byteLength) offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
      boundary("written", bytes.byteLength);
      fsyncSync(descriptor);
      boundary("file_fsynced", bytes.byteLength);
    } finally {
      closeSync(descriptor);
    }
    if (process.platform !== "win32") chmodSync(path, WATCHER_FILE_MODE);
    syncWatcherDirectory(directory.path);
    boundary("parent_fsynced", bytes.byteLength);
  }, [leaf], ({ after }) => {
    const file = after.get(leaf);
    if (file !== null) assertWatcherPublicationPrivateFile(file, "GKX_WATCHER_FS_FILE_CHANGED");
    if (file?.kind !== "file" || file.raw_sha256 !== watcherRawDigest(bytes) ||
        Number(file.stat_coordinate[4]) !== 1 || Number(file.stat_coordinate[5]) !== bytes.byteLength ||
        (process.platform !== "win32" && (Number(file.stat_coordinate[3]) & 0o777) !== WATCHER_FILE_MODE)) {
      fail("GKX_WATCHER_FS_FILE_CHANGED");
    }
  }, { maximum_affected_file_bytes: maximumBytes, on_before_seal_refresh: options.on_before_seal_refresh });
  return readWatcherFile(directory, leaf, { maximum_bytes: maximumBytes });
}

/** Rewrites one already-authenticated owner file without permitting replacement or aliasing. */
export function writeExistingWatcherFile(
  directory: WatcherDirectoryCapability,
  leaf: string,
  bytes: Uint8Array,
  maximumBytes = WATCHER_MAX_AUTHORITY_BYTES,
): WatcherSealedFile {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > maximumBytes) {
    throw new TypeError("GKX_WATCHER_FS_FILE_BYTES_INVALID");
  }
  const path = assertLeafBasename(directory, leaf);
  withAuthorizedWatcherLeafTransition(directory, [leaf], (before) => {
    const prior = before.get(leaf);
    if (prior !== null) assertWatcherPublicationPrivateFile(prior, "GKX_WATCHER_FS_FILE_CHANGED");
    if (prior?.kind !== "file" || Number(prior.stat_coordinate[4]) !== 1 ||
        Number(prior.stat_coordinate[5]) > maximumBytes ||
        (process.platform !== "win32" && (Number(prior.stat_coordinate[3]) & 0o777) !== WATCHER_FILE_MODE)) {
      fail("GKX_WATCHER_FS_FILE_CHANGED");
    }
    const descriptor = openSync(path, "r+");
    try {
      const opened = bigintStatCoordinate(fstatSync(descriptor, { bigint: true }));
      if (!sameStatCoordinate(opened, prior.stat_coordinate)) fail("GKX_WATCHER_FS_FILE_CHANGED");
      let offset = 0;
      while (offset < bytes.byteLength) offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
      ftruncateSync(descriptor, bytes.byteLength);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }, [leaf], ({ before, after }) => {
    const prior = before.get(leaf);
    const current = after.get(leaf);
    if (prior !== null) assertWatcherPublicationPrivateFile(prior, "GKX_WATCHER_FS_FILE_CHANGED");
    if (current !== null) assertWatcherPublicationPrivateFile(current, "GKX_WATCHER_FS_FILE_CHANGED");
    if (prior?.kind !== "file" || current?.kind !== "file" ||
        !sameDeviceCoordinate(prior.stat_coordinate[1] ?? "", current.stat_coordinate[1] ?? "") ||
        prior.stat_coordinate[2] !== current.stat_coordinate[2] || prior.stat_coordinate[3] !== current.stat_coordinate[3] ||
        prior.stat_coordinate[4] !== current.stat_coordinate[4] || prior.stat_coordinate[8] !== current.stat_coordinate[8] ||
        prior.stat_coordinate[9] !== current.stat_coordinate[9] || Number(current.stat_coordinate[4]) !== 1 ||
        Number(current.stat_coordinate[5]) !== bytes.byteLength || current.raw_sha256 !== watcherRawDigest(bytes)) {
      fail("GKX_WATCHER_FS_FILE_CHANGED");
    }
  }, { maximum_affected_file_bytes: maximumBytes });
  return readWatcherFile(directory, leaf, { maximum_bytes: maximumBytes });
}

/** Reserves a no-replace leaf before the caller derives its canonical body. */
export function writeReservedWatcherFile(
  directory: WatcherDirectoryCapability,
  leaf: string,
  deriveBytes: (reservedDirectory: WatcherDirectoryCapability) => Uint8Array,
  maximumBytes = WATCHER_MAX_AUTHORITY_BYTES,
  options: WatcherLeafTransitionOptions = {},
): WatcherSealedFile {
  const path = assertLeafBasename(directory, leaf);
  let expected = Buffer.alloc(0);
  withAuthorizedWatcherLeafTransition(directory, [leaf], (before, authenticateIntermediate) => {
    if (before.get(leaf) !== null) fail("GKX_WATCHER_FS_LINK_TARGET_EXISTS");
    const descriptor = openSync(path, "wx", WATCHER_FILE_MODE);
    try {
      if (process.platform !== "win32") chmodSync(path, WATCHER_FILE_MODE);
      const reservedDirectory = authenticateIntermediate([leaf], ({ before: prior, after }) => {
        const reserved = after.get(leaf);
        if (prior.get(leaf) !== null || reserved?.kind !== "file" || Number(reserved.stat_coordinate[4]) !== 1 ||
            Number(reserved.stat_coordinate[5]) !== 0 ||
            (process.platform !== "win32" && (Number(reserved.stat_coordinate[3]) & 0o777) !== WATCHER_FILE_MODE)) {
          fail("GKX_WATCHER_FS_FILE_CHANGED");
        }
      });
      const bytes = deriveBytes(reservedDirectory);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > maximumBytes) {
        throw new TypeError("GKX_WATCHER_FS_FILE_BYTES_INVALID");
      }
      expected = Buffer.from(bytes);
      let offset = 0;
      while (offset < bytes.byteLength) offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    syncWatcherDirectory(directory.path);
  }, [leaf], ({ after }) => {
    const file = after.get(leaf);
    if (file !== null) assertWatcherPublicationPrivateFile(file, "GKX_WATCHER_FS_FILE_CHANGED");
    if (file?.kind !== "file" || file.raw_sha256 !== watcherRawDigest(expected) || Number(file.stat_coordinate[4]) !== 1 ||
        Number(file.stat_coordinate[5]) !== expected.byteLength ||
        (process.platform !== "win32" && (Number(file.stat_coordinate[3]) & 0o777) !== WATCHER_FILE_MODE)) {
      fail("GKX_WATCHER_FS_FILE_CHANGED");
    }
  }, { ...options, maximum_affected_file_bytes: maximumBytes });
  return readWatcherFile(directory, leaf, { maximum_bytes: maximumBytes });
}

export function hardlinkWatcherLeafNoReplace(
  directory: WatcherDirectoryCapability,
  sourceLeaf: string,
  targetLeaf: string,
  options: { readonly resulting_links?: 2 | 3; readonly on_before_seal_refresh?: () => void } = {},
): void {
  const resultingLinks = options.resulting_links ?? 2;
  const source = assertLeafBasename(directory, sourceLeaf);
  const target = assertLeafBasename(directory, targetLeaf);
  const sourceSnapshot = snapshotDirectChild(directory, sourceLeaf);
  assertWatcherPublicationPrivateFile(sourceSnapshot, "GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
  const sourceCoordinate = sourceSnapshot.stat_coordinate;
  const aliases = readdirSync(directory.path).filter((candidate) => {
    const path = join(directory.path, candidate);
    const linked = lstatSync(path, { bigint: true });
    const state = statSync(path, { bigint: true });
    if (!linked.isFile() || linked.isSymbolicLink() || !state.isFile() ||
        !sameStatCoordinate(bigintStatCoordinate(linked), bigintStatCoordinate(state)) ||
        !sameStatCoordinate(bigintStatCoordinate(state), sourceCoordinate)) return false;
    const linkedAfter = lstatSync(path, { bigint: true });
    const stateAfter = statSync(path, { bigint: true });
    return sameStatCoordinate(bigintStatCoordinate(linkedAfter), bigintStatCoordinate(linked)) &&
      sameStatCoordinate(bigintStatCoordinate(stateAfter), bigintStatCoordinate(state)) &&
      sameStatCoordinate(bigintStatCoordinate(linked), bigintStatCoordinate(state)) &&
      sameStatCoordinate(bigintStatCoordinate(state), sourceCoordinate);
  }).sort();
  if (aliases.length !== resultingLinks - 1 || !aliases.includes(sourceLeaf) || aliases.includes(targetLeaf)) {
    fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
  }
  const affected = [...aliases, targetLeaf].sort();
  withAuthorizedWatcherLeafTransition(directory, affected, (before) => {
    const prior = before.get(sourceLeaf);
    if (prior !== null) assertWatcherPublicationPrivateFile(prior, "GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
    if (prior?.kind !== "file" || before.get(targetLeaf) !== null || Number(prior.stat_coordinate[4]) !== resultingLinks - 1) {
      fail("GKX_WATCHER_FS_LINK_TARGET_EXISTS");
    }
    for (const alias of aliases) {
      const row = before.get(alias);
      if (row === null) fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
      assertWatcherPublicationPrivateFile(row, "GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
      if (!sameStatCoordinate(row.stat_coordinate, prior.stat_coordinate) || row.raw_sha256 !== prior.raw_sha256) {
        fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
      }
    }
    linkSync(source, target);
    syncWatcherDirectory(directory.path);
  }, affected, ({ before, after }) => {
    const prior = before.get(sourceLeaf);
    const targetRow = after.get(targetLeaf);
    if (prior?.kind !== "file" || targetRow?.kind !== "file" || Number(prior.stat_coordinate[4]) !== resultingLinks - 1) {
      fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
    }
    for (const alias of affected) {
      const row = after.get(alias);
      if (row === null) fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
      assertWatcherPublicationFileTransition(prior, row, resultingLinks, "GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
      if (row.kind !== "file" || Number(row.stat_coordinate[4]) !== resultingLinks ||
          !sameStatCoordinate(row.stat_coordinate, targetRow.stat_coordinate) || row.raw_sha256 !== prior.raw_sha256) {
        fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
      }
    }
  }, { on_before_seal_refresh: options.on_before_seal_refresh });
  const left = readWatcherFile(directory, sourceLeaf, { allowed_links: resultingLinks });
  const right = readWatcherFile(directory, targetLeaf, { allowed_links: resultingLinks });
  if (!sameDeviceCoordinate(left.identity.device, right.identity.device) || left.identity.inode !== right.identity.inode ||
      !left.bytes.equals(right.bytes)) fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
}

export function replaceWatcherLeaf(
  directory: WatcherDirectoryCapability,
  temporaryLeaf: string,
  finalLeaf: string,
  expectedRawSha256: string,
  options: WatcherLeafTransitionOptions = {},
): WatcherSealedFile {
  const temporary = readWatcherFile(directory, temporaryLeaf);
  if (temporary.raw_sha256 !== expectedRawSha256) fail("GKX_WATCHER_FS_FILE_DIGEST_CHANGED");
  const finalPath = assertLeafBasename(directory, finalLeaf);
  withAuthorizedWatcherLeafTransition(directory, [temporaryLeaf, finalLeaf], (before) => {
    const source = before.get(temporaryLeaf);
    const displaced = before.get(finalLeaf);
    if (source !== null) assertWatcherPublicationPrivateFile(source, "GKX_WATCHER_FS_REPLACE_AMBIGUOUS");
    if (displaced !== null) assertWatcherPublicationPrivateFile(displaced, "GKX_WATCHER_FS_REPLACE_AMBIGUOUS");
    if (source?.kind !== "file" || source.raw_sha256 !== expectedRawSha256 || Number(source.stat_coordinate[4]) !== 1) {
      fail("GKX_WATCHER_FS_REPLACE_AMBIGUOUS");
    }
    renameSync(temporary.path, finalPath);
    syncWatcherDirectory(directory.path);
  }, [finalLeaf], ({ before, after }) => {
    const source = before.get(temporaryLeaf);
    const final = after.get(finalLeaf);
    if (source !== null && final !== null) {
      assertWatcherPublicationFileTransition(source, final, 1, "GKX_WATCHER_FS_REPLACE_AMBIGUOUS");
    }
    if (source?.kind !== "file" || after.get(temporaryLeaf) !== null || final?.kind !== "file" ||
        source.raw_sha256 !== expectedRawSha256 || final.raw_sha256 !== expectedRawSha256 ||
        !sameDeviceCoordinate(source.stat_coordinate[1] ?? "", final.stat_coordinate[1] ?? "") ||
        source.stat_coordinate[2] !== final.stat_coordinate[2] ||
        Number(final.stat_coordinate[4]) !== 1) fail("GKX_WATCHER_FS_REPLACE_AMBIGUOUS");
  }, options);
  const final = readWatcherFile(directory, finalLeaf);
  if (final.raw_sha256 !== expectedRawSha256 || !final.bytes.equals(temporary.bytes)) {
    fail("GKX_WATCHER_FS_REPLACE_AMBIGUOUS");
  }
  return final;
}

export function unlinkWatcherLeaf(
  directory: WatcherDirectoryCapability,
  leaf: string,
  options: { readonly allowed_links?: 1 | 2 | 3; readonly expected_raw_sha256?: string; readonly maximum_bytes?: number;
    readonly on_before_seal_refresh?: () => void } = {},
): void {
  const allowedLinks = options.allowed_links ?? 1;
  const maximum = options.maximum_bytes ?? WATCHER_MAX_AUTHORITY_BYTES;
  revalidateWatcherDirectory(directory);
  const path = containedPath(directory, leaf);
  const sourceSnapshot = snapshotDirectChild(directory, leaf, maximum);
  assertWatcherPublicationPrivateFile(sourceSnapshot, "GKX_WATCHER_FS_FILE_IDENTITY_INVALID");
  const sourceCoordinate = sourceSnapshot.stat_coordinate;
  if (Number(sourceCoordinate[4]) !== allowedLinks || Number(sourceCoordinate[5]) < 1 ||
      Number(sourceCoordinate[5]) > maximum) fail("GKX_WATCHER_FS_FILE_CHANGED");
  if (options.expected_raw_sha256 !== undefined && sourceSnapshot.raw_sha256 !== options.expected_raw_sha256) {
    fail("GKX_WATCHER_FS_FILE_DIGEST_CHANGED");
  }
  const aliases = readdirSync(directory.path).filter((candidate) => {
    const path = join(directory.path, candidate);
    const linked = lstatSync(path, { bigint: true });
    const state = statSync(path, { bigint: true });
    if (!linked.isFile() || linked.isSymbolicLink() || !state.isFile() ||
        !sameStatCoordinate(bigintStatCoordinate(linked), bigintStatCoordinate(state)) ||
        !sameStatCoordinate(bigintStatCoordinate(state), sourceCoordinate)) return false;
    const linkedAfter = lstatSync(path, { bigint: true });
    const stateAfter = statSync(path, { bigint: true });
    return sameStatCoordinate(bigintStatCoordinate(linkedAfter), bigintStatCoordinate(linked)) &&
      sameStatCoordinate(bigintStatCoordinate(stateAfter), bigintStatCoordinate(state)) &&
      sameStatCoordinate(bigintStatCoordinate(linked), bigintStatCoordinate(state)) &&
      sameStatCoordinate(bigintStatCoordinate(state), sourceCoordinate);
  }).sort();
  if (aliases.length !== allowedLinks || !aliases.includes(leaf)) fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
  const survivors = aliases.filter((candidate) => candidate !== leaf);
  withAuthorizedWatcherLeafTransition(directory, aliases, (before) => {
    const exact = before.get(leaf);
    if (exact !== null) assertWatcherPublicationPrivateFile(exact, "GKX_WATCHER_FS_FILE_CHANGED");
    if (exact?.kind !== "file" || exact.raw_sha256 !== sourceSnapshot.raw_sha256 ||
        Number(exact.stat_coordinate[4]) !== allowedLinks) fail("GKX_WATCHER_FS_FILE_CHANGED");
    for (const alias of aliases) {
      const row = before.get(alias);
      if (row !== null) assertWatcherPublicationPrivateFile(row, "GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
      if (row?.kind !== "file" || row.raw_sha256 !== sourceSnapshot.raw_sha256 ||
          !sameDeviceCoordinate(row.stat_coordinate[1] ?? "", exact.stat_coordinate[1] ?? "") ||
          row.stat_coordinate[2] !== exact.stat_coordinate[2] || !sameStatCoordinate(row.stat_coordinate, exact.stat_coordinate)) {
        fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
      }
    }
    unlinkSync(path);
    syncWatcherDirectory(directory.path);
  }, survivors, ({ before, after }) => {
    if (after.get(leaf) !== null) fail("GKX_WATCHER_FS_FILE_CHANGED");
    const prior = before.get(leaf);
    for (const alias of survivors) {
      const row = after.get(alias);
      if (prior !== null && row !== null) {
        assertWatcherPublicationFileTransition(prior, row, allowedLinks - 1, "GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
      }
      if (prior?.kind !== "file" || row?.kind !== "file" || row.raw_sha256 !== sourceSnapshot.raw_sha256 ||
          !sameDeviceCoordinate(row.stat_coordinate[1] ?? "", prior.stat_coordinate[1] ?? "") ||
          row.stat_coordinate[2] !== prior.stat_coordinate[2] ||
          Number(row.stat_coordinate[4]) !== allowedLinks - 1) fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
    }
  }, { maximum_affected_file_bytes: options.maximum_bytes, on_before_seal_refresh: options.on_before_seal_refresh });
}

/**
 * Removes only a securely identified, owner-private, single-link reserved leaf.
 * Callers use this after proving that the reserved leaf is incomplete rather
 * than a complete canonical authority record. It deliberately accepts an
 * empty file, which the ordinary authority reader rejects.
 */
export function discardIncompleteWatcherLeaf(
  directory: WatcherDirectoryCapability,
  leaf: string,
  options: WatcherLeafTransitionOptions = {},
): void {
  const path = containedPath(directory, leaf);
  const initialSnapshot = snapshotDirectChild(
    directory,
    leaf,
    options.maximum_affected_file_bytes ?? WATCHER_MAX_TRANSITION_LEAF_BYTES,
    false,
  );
  const linked = lstatSync(path);
  const before = statSync(path);
  const owner = effectiveOwnerUid();
  if (!linked.isFile() || linked.isSymbolicLink() || !before.isFile() || !sameDevice(linked.dev, before.dev)
      || linked.ino !== before.ino || linked.mode !== before.mode || linked.nlink !== 1 || before.nlink !== 1
      || linked.size !== before.size || linked.mtimeMs !== before.mtimeMs || linked.ctimeMs !== before.ctimeMs
      || linked.uid !== before.uid || linked.gid !== before.gid
      || (process.platform !== "win32" && ((before.mode & 0o777) !== WATCHER_FILE_MODE || before.uid !== owner))) {
    fail("GKX_WATCHER_FS_INCOMPLETE_FILE_IDENTITY_INVALID");
  }
  const descriptor = openSync(path, "r");
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || !sameDevice(opened.dev, before.dev) || opened.ino !== before.ino
        || opened.mode !== before.mode || opened.nlink !== 1 || opened.size !== before.size
        || opened.mtimeMs !== before.mtimeMs || opened.ctimeMs !== before.ctimeMs
        || opened.uid !== before.uid || opened.gid !== before.gid
        || (process.platform !== "win32" && opened.uid !== owner)) {
      fail("GKX_WATCHER_FS_INCOMPLETE_FILE_CHANGED");
    }
  } finally {
    closeSync(descriptor);
  }
  const after = lstatSync(path);
  if (!after.isFile() || after.isSymbolicLink() || !sameDevice(after.dev, before.dev) || after.ino !== before.ino
      || after.mode !== before.mode || after.nlink !== 1 || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
      || after.uid !== before.uid || after.gid !== before.gid
      || (process.platform !== "win32" && after.uid !== owner)) {
    fail("GKX_WATCHER_FS_INCOMPLETE_FILE_CHANGED");
  }
  withAuthorizedWatcherLeafTransition(directory, [leaf], (beforeRows) => {
    const exact = beforeRows.get(leaf);
    if (exact?.kind !== "file" || Number(exact.stat_coordinate[4]) !== 1 || stableJson(exact) !== stableJson(initialSnapshot)) {
      fail("GKX_WATCHER_FS_INCOMPLETE_FILE_CHANGED");
    }
    unlinkSync(path);
    syncWatcherDirectory(directory.path);
  }, [], ({ after: afterRows }) => {
    if (afterRows.get(leaf) !== null) fail("GKX_WATCHER_FS_INCOMPLETE_FILE_CHANGED");
  }, { ...options, include_affected_file_digests: false });
}

export function parseCanonicalWatcherJson(file: WatcherSealedFile): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.bytes.toString("utf8"));
  } catch {
    throw new TypeError("GKX_WATCHER_FS_JSON_INVALID");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) ||
      !file.bytes.equals(watcherCanonicalBytes(parsed))) {
    throw new TypeError("GKX_WATCHER_FS_JSON_NONCANONICAL");
  }
  return parsed as Record<string, unknown>;
}

export function assertWatcherDigest(value: unknown, code = "GKX_WATCHER_DIGEST_INVALID"): asserts value is string {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) throw new TypeError(code);
}

export function assertWatcherUuid7(value: unknown, code = "GKX_WATCHER_UUID_INVALID"): asserts value is string {
  if (typeof value !== "string" || !UUID7_RE.test(value)) throw new TypeError(code);
}

export function assertWatcherTimestamp(value: unknown, code = "GKX_WATCHER_TIMESTAMP_INVALID"): asserts value is string {
  if (typeof value !== "string" || !ISO_MS_RE.test(value)) throw new TypeError(code);
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value) throw new TypeError(code);
}

export function watcherTimestamp(now = Date.now()): string {
  const value = new Date(now).toISOString();
  assertWatcherTimestamp(value);
  return value;
}

export function watcherUuid7(now = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffff_ffff_ffff) throw new TypeError("GKX_WATCHER_UUID_INVALID");
  const bytes = randomBytes(16);
  let time = BigInt(now);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(time & 0xffn);
    time >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  const value = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  assertWatcherUuid7(value);
  return value;
}
