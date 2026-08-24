import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
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
} from "node:fs";
import { basename, dirname, join, parse, resolve } from "node:path";

import { canonicalPathSync, sameCanonicalPath } from "../retrieval/path-security";
import { retrievalCanonicalDigest, retrievalSha256, stableJson } from "../retrieval/digest";

export const WATCHER_DIRECTORY_MODE = 0o700;
export const WATCHER_FILE_MODE = 0o600;
export const WATCHER_MAX_AUTHORITY_BYTES = 1_048_576;

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

function assertDirectoryState(path: string): WatcherIdentity {
  const link = lstatSync(path);
  const state = statSync(path);
  if (!link.isDirectory() || link.isSymbolicLink() || !state.isDirectory() || !sameDevice(link.dev, state.dev) ||
      link.ino !== state.ino || link.mode !== state.mode || link.nlink !== state.nlink) {
    fail("GKX_WATCHER_FS_DIRECTORY_ALIAS_INVALID");
  }
  if (process.platform !== "win32" && (state.mode & 0o777) !== WATCHER_DIRECTORY_MODE) {
    fail("GKX_WATCHER_FS_DIRECTORY_MODE_INVALID");
  }
  return identityOf(state);
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
  return Object.freeze({ path: canonical, identity: assertDirectoryState(canonical) });
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
  if (!sameCanonicalPath(capability.path, requested)) fail("GKX_WATCHER_STATUS_DIRECTORY_ALIAS_INVALID");
  return capability;
}

export function ensureWatcherDirectory(input: string, parent?: WatcherDirectoryCapability): WatcherDirectoryCapability {
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
    mkdirSync(prospective, { recursive: false, mode: WATCHER_DIRECTORY_MODE });
    if (process.platform !== "win32") chmodSync(prospective, WATCHER_DIRECTORY_MODE);
    if (parent !== undefined) syncWatcherDirectory(parent.path);
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
): void {
  revalidateWatcherDirectory(parent);
  revalidateWatcherDirectory(directory);
  if (!sameCanonicalPath(dirname(directory.path), parent.path) || readdirSync(directory.path).length !== 0) {
    fail("GKX_WATCHER_FS_DIRECTORY_NOT_EMPTY");
  }
  const before = assertDirectoryState(directory.path);
  if (stableJson(before) !== stableJson(directory.identity)) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  rmdirSync(directory.path);
  syncWatcherDirectory(parent.path);
  revalidateWatcherDirectory(parent);
  if (exists(directory.path)) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
}

export function revalidateWatcherDirectory(capability: WatcherDirectoryCapability): void {
  if (capability === null || typeof capability !== "object" || typeof capability.path !== "string") {
    throw new TypeError("GKX_WATCHER_FS_DIRECTORY_CAPABILITY_INVALID");
  }
  const canonical = canonicalPathSync(capability.path, { alias_error: "GKX_WATCHER_FS_DIRECTORY_ALIAS_INVALID" });
  if (!sameCanonicalPath(canonical, capability.path)) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
  const current = assertDirectoryState(canonical);
  if (stableJson(current) !== stableJson(capability.identity)) fail("GKX_WATCHER_FS_DIRECTORY_CHANGED");
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
