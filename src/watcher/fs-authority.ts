import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
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

interface WatcherDirectChildSnapshot {
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
  if (state.isFile()) {
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

function snapshotRetainedChildren(parent: WatcherDirectoryCapability, target: string): readonly WatcherDirectChildSnapshot[] {
  const leaves = readdirSync(parent.path).filter((leaf) => leaf !== target).sort();
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
  return retrievalCanonicalDigest({
    directory: directory.identity,
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
  if (!link.isFile() || link.isSymbolicLink() || !before.isFile() || !sameDevice(link.dev, before.dev) ||
      link.ino !== before.ino || link.mode !== before.mode || link.nlink !== before.nlink || before.nlink !== allowedLinks ||
      (process.platform !== "win32" && (before.mode & 0o777) !== WATCHER_FILE_MODE) ||
      !Number.isSafeInteger(before.size) || before.size < 1 || before.size > maximum) {
    fail("GKX_WATCHER_FS_FILE_IDENTITY_INVALID");
  }
  const descriptor = openSync(path, "r");
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || !sameDevice(opened.dev, before.dev) || opened.ino !== before.ino || opened.mode !== before.mode ||
        opened.nlink !== allowedLinks || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs || opened.ctimeMs !== before.ctimeMs) {
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
        after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
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
    readonly on_boundary?: (boundary: "created" | "partial_write" | "written" | "file_fsynced" | "parent_fsynced") => void;
  } = {},
): WatcherSealedFile {
  const path = containedPath(directory, leaf);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > maximumBytes) {
    throw new TypeError("GKX_WATCHER_FS_FILE_BYTES_INVALID");
  }
  const descriptor = openSync(path, "wx", WATCHER_FILE_MODE);
  try {
    options.on_boundary?.("created");
    const firstWrite = Math.max(1, Math.floor(bytes.byteLength / 2));
    let offset = 0;
    while (offset < firstWrite) offset += writeSync(descriptor, bytes, offset, firstWrite - offset, offset);
    options.on_boundary?.("partial_write");
    while (offset < bytes.byteLength) offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
    options.on_boundary?.("written");
    fsyncSync(descriptor);
    options.on_boundary?.("file_fsynced");
  } catch (error) {
    try { closeSync(descriptor); } catch { /* descriptor may already be closed */ }
    throw error;
  }
  closeSync(descriptor);
  if (process.platform !== "win32") chmodSync(path, WATCHER_FILE_MODE);
  syncWatcherDirectory(directory.path);
  options.on_boundary?.("parent_fsynced");
  return readWatcherFile(directory, leaf, { maximum_bytes: maximumBytes });
}

/** Reserves a no-replace leaf before the caller derives its canonical body. */
export function writeReservedWatcherFile(
  directory: WatcherDirectoryCapability,
  leaf: string,
  deriveBytes: () => Uint8Array,
  maximumBytes = WATCHER_MAX_AUTHORITY_BYTES,
): WatcherSealedFile {
  const path = containedPath(directory, leaf);
  const descriptor = openSync(path, "wx", WATCHER_FILE_MODE);
  try {
    const bytes = deriveBytes();
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > maximumBytes) {
      throw new TypeError("GKX_WATCHER_FS_FILE_BYTES_INVALID");
    }
    let offset = 0;
    while (offset < bytes.byteLength) offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
    fsyncSync(descriptor);
  } catch (error) {
    try { closeSync(descriptor); } catch { /* descriptor may already be closed */ }
    throw error;
  }
  closeSync(descriptor);
  if (process.platform !== "win32") chmodSync(path, WATCHER_FILE_MODE);
  syncWatcherDirectory(directory.path);
  return readWatcherFile(directory, leaf, { maximum_bytes: maximumBytes });
}

export function hardlinkWatcherLeafNoReplace(
  directory: WatcherDirectoryCapability,
  sourceLeaf: string,
  targetLeaf: string,
  options: { readonly resulting_links?: 2 | 3 } = {},
): void {
  const source = containedPath(directory, sourceLeaf);
  const target = containedPath(directory, targetLeaf);
  if (exists(target)) fail("GKX_WATCHER_FS_LINK_TARGET_EXISTS");
  linkSync(source, target);
  syncWatcherDirectory(directory.path);
  const resultingLinks = options.resulting_links ?? 2;
  const left = readWatcherFile(directory, sourceLeaf, { allowed_links: resultingLinks });
  const right = readWatcherFile(directory, targetLeaf, { allowed_links: resultingLinks });
  if (left.identity.device !== right.identity.device || left.identity.inode !== right.identity.inode ||
      !left.bytes.equals(right.bytes)) fail("GKX_WATCHER_FS_LINK_IDENTITY_INVALID");
}

export function replaceWatcherLeaf(
  directory: WatcherDirectoryCapability,
  temporaryLeaf: string,
  finalLeaf: string,
  expectedRawSha256: string,
): WatcherSealedFile {
  const temporary = readWatcherFile(directory, temporaryLeaf);
  if (temporary.raw_sha256 !== expectedRawSha256) fail("GKX_WATCHER_FS_FILE_DIGEST_CHANGED");
  const finalPath = containedPath(directory, finalLeaf);
  renameSync(temporary.path, finalPath);
  syncWatcherDirectory(directory.path);
  const final = readWatcherFile(directory, finalLeaf);
  if (final.raw_sha256 !== expectedRawSha256 || !final.bytes.equals(temporary.bytes)) {
    fail("GKX_WATCHER_FS_REPLACE_AMBIGUOUS");
  }
  return final;
}

export function unlinkWatcherLeaf(
  directory: WatcherDirectoryCapability,
  leaf: string,
  options: { readonly allowed_links?: 1 | 2 | 3; readonly expected_raw_sha256?: string; readonly maximum_bytes?: number } = {},
): void {
  const sealed = readWatcherFile(directory, leaf, {
    allowed_links: options.allowed_links ?? 1,
    maximum_bytes: options.maximum_bytes,
  });
  if (options.expected_raw_sha256 !== undefined && sealed.raw_sha256 !== options.expected_raw_sha256) {
    fail("GKX_WATCHER_FS_FILE_DIGEST_CHANGED");
  }
  unlinkSync(sealed.path);
  syncWatcherDirectory(directory.path);
  revalidateWatcherDirectory(directory);
}

/**
 * Removes only a securely identified, owner-private, single-link reserved leaf.
 * Callers use this after proving that the reserved leaf is incomplete rather
 * than a complete canonical authority record. It deliberately accepts an
 * empty file, which the ordinary authority reader rejects.
 */
export function discardIncompleteWatcherLeaf(directory: WatcherDirectoryCapability, leaf: string): void {
  const path = containedPath(directory, leaf);
  const linked = lstatSync(path);
  const before = statSync(path);
  if (!linked.isFile() || linked.isSymbolicLink() || !before.isFile() || !sameDevice(linked.dev, before.dev)
      || linked.ino !== before.ino || linked.mode !== before.mode || linked.nlink !== 1 || before.nlink !== 1
      || (process.platform !== "win32" && (before.mode & 0o777) !== WATCHER_FILE_MODE)) {
    fail("GKX_WATCHER_FS_INCOMPLETE_FILE_IDENTITY_INVALID");
  }
  const descriptor = openSync(path, "r");
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || !sameDevice(opened.dev, before.dev) || opened.ino !== before.ino
        || opened.mode !== before.mode || opened.nlink !== 1 || opened.size !== before.size
        || opened.mtimeMs !== before.mtimeMs || opened.ctimeMs !== before.ctimeMs) {
      fail("GKX_WATCHER_FS_INCOMPLETE_FILE_CHANGED");
    }
  } finally {
    closeSync(descriptor);
  }
  const after = lstatSync(path);
  if (!after.isFile() || after.isSymbolicLink() || !sameDevice(after.dev, before.dev) || after.ino !== before.ino
      || after.mode !== before.mode || after.nlink !== 1 || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
    fail("GKX_WATCHER_FS_INCOMPLETE_FILE_CHANGED");
  }
  unlinkSync(path);
  syncWatcherDirectory(directory.path);
  revalidateWatcherDirectory(directory);
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
