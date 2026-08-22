import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, parse, resolve } from "node:path";
import { canonicalPathSync, sameCanonicalPath } from "./path-security";
import { retrievalCanonicalDigest, retrievalSha256, stableJson } from "./digest";
import { assertRetrievalProjectionManifest } from "./manifest";
import type { AnyRetrievalProjectionManifest } from "./types";

/**
 * Cross-generation writer handshake. This is package-private infrastructure:
 * it is deliberately absent from every public entry point.
 */
export const LEGACY_WRITER_LOCK_FILE = "retrieval-writer.lock";
export const LEGACY_WRITER_RECOVERY_FILE = "retrieval-writer.recovery";
export const INGEST_AUTHORITY_LOCK_FILE = "ingest-authority.lock";

const LOCK_CONTRACT = "gkos-retrieval-writer-lock/1.0.0-draft.1" as const;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const MAX_LOCK_BYTES = 1_048_576;
const LOCK_CAPABILITIES = new WeakMap<object, {
  lock: LegacyWriterLock;
  file_digest: string;
  remove_empty_directory_on_release: boolean;
}>();
const AUTHORITY_EVIDENCE_NAMES = new Set([
  INGEST_AUTHORITY_LOCK_FILE,
  "ingest-authority.recovery",
  "ingest-activation-root.json",
  "ingest-authority.json",
  "ingest-attempt-status.json",
  "active-ingest.json",
  "active-retrieval.json",
]);

interface LegacyWriterLock {
  contract_version: typeof LOCK_CONTRACT;
  lock_id: string;
  process_id: number;
  prior_pointer_digest: string | null;
  target_pointer_digest: string | null;
  lock_digest: string;
}

interface SealedReadQualificationHooks {
  on_path_lstat?: () => void;
}

export interface LegacyRetrievalWriterCapability {
  readonly state_directory: string;
}

function pathExists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function syncDirectory(path: string): void {
  // Windows does not permit opening a directory as a flushable file handle.
  if (process.platform === "win32") return;
  const descriptor = openSync(path, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${stableJson(value)}\n`, "utf8");
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

function forbiddenStatePathNamespace(value: string): boolean {
  const extendedLocalDrive = /^[\\/]{2}\?[\\/][A-Za-z]:[\\/]/u.test(value);
  if (extendedLocalDrive) {
    if (process.platform !== "win32") return true;
    value = value.slice(4);
  } else if (/^(?:[\\/]{2}|[\\/]\?\?[\\/])/u.test(value)) return true;
  const portable = value.replace(/\\/gu, "/");
  const drive = /^[A-Za-z]:/u.test(portable);
  if (drive && !/^[A-Za-z]:\//u.test(portable)) return true;
  const tail = drive ? portable.slice(2) : portable;
  if (tail.includes(":")) return true;
  for (const component of tail.split("/")) {
    if (!component) continue;
    const portableComponent = component.replace(/[ .]+$/u, "");
    if (portableComponent !== component) return true;
    const stem = portableComponent.split(".", 1)[0].toUpperCase();
    if (/^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|CLOCK\$|COM(?:[1-9]|[¹²³])|LPT(?:[1-9]|[¹²³]))$/u.test(stem)) return true;
  }
  return false;
}

function validateStateDirectory(input: string): string {
  if (typeof input !== "string" || input.length === 0 || input.length > 4096 || /[\u0000-\u001f\u007f]/u.test(input) ||
      hasUnpairedSurrogate(input) || forbiddenStatePathNamespace(input)) {
    throw new TypeError("RETRIEVAL_STATE_DIRECTORY_INVALID");
  }
  const absolute = resolve(input);
  if (parse(absolute).root === absolute) throw new TypeError("RETRIEVAL_STATE_DIRECTORY_INVALID");
  return absolute;
}

function ensureDirectory(input: string): string {
  const requested = validateStateDirectory(input);
  const canonical = canonicalPathSync(requested, {
    allow_missing: true,
    alias_error: "RETRIEVAL_STATE_ANCESTOR_ALIAS_REJECTED",
  });
  const existed = pathExists(canonical);
  mkdirSync(canonical, { recursive: true, mode: 0o700 });
  const directory = canonicalPathSync(canonical, { alias_error: "RETRIEVAL_STATE_DIRECTORY_ALIAS_REJECTED" });
  const state = lstatSync(directory);
  if (!state.isDirectory() || state.isSymbolicLink()) throw new Error("RETRIEVAL_STATE_DIRECTORY_ALIAS_REJECTED");
  if (process.platform !== "win32") {
    if (existed && (state.mode & 0o777) !== 0o700) throw new Error("RETRIEVAL_STATE_DIRECTORY_PERMISSION_REJECTED");
    if (!existed) chmodSync(directory, 0o700);
    if ((statSync(directory).mode & 0o777) !== 0o700) throw new Error("RETRIEVAL_STATE_DIRECTORY_PERMISSION_REJECTED");
  }
  return directory;
}

function assertContainedPlainFile(
  path: string,
  directory: string,
  allowMissing = false,
  allowedLinks = 1,
  qualificationHooks?: SealedReadQualificationHooks,
): ReturnType<typeof statSync> | null {
  const canonical = canonicalPathSync(path, {
    allow_missing: allowMissing,
    alias_error: "RETRIEVAL_STATE_WRITER_ALIAS_REJECTED",
  });
  if (!sameCanonicalPath(dirname(canonical), directory) || basename(canonical) !== basename(path)) {
    throw new Error("RETRIEVAL_STATE_WRITER_PATH_ESCAPE");
  }
  if (!pathExists(path)) {
    if (allowMissing) return null;
    throw new Error("RETRIEVAL_STATE_WRITER_LOCK_MISSING");
  }
  const link = lstatSync(path);
  qualificationHooks?.on_path_lstat?.();
  const state = statSync(path);
  const sameDevice = link.dev === state.dev ||
    (process.platform === "win32" && (link.dev === 0 || state.dev === 0));
  if (link.ino !== state.ino || !sameDevice || link.nlink !== state.nlink || link.mode !== state.mode ||
      link.size !== state.size || link.mtimeMs !== state.mtimeMs || link.ctimeMs !== state.ctimeMs) {
    throw new Error("RETRIEVAL_STATE_WRITER_ALIAS_REJECTED");
  }
  if (state.nlink !== allowedLinks) {
    if (allowedLinks === 1 && state.nlink > 1) throw new Error("RETRIEVAL_STATE_HARDLINK_REJECTED");
    throw new Error("RETRIEVAL_STATE_WRITER_ALIAS_REJECTED");
  }
  if (!link.isFile() || link.isSymbolicLink() || !state.isFile()) {
    throw new Error("RETRIEVAL_STATE_WRITER_ALIAS_REJECTED");
  }
  if (process.platform !== "win32" && (state.mode & 0o777) !== 0o600) {
    throw new Error("RETRIEVAL_STATE_WRITER_PERMISSION_REJECTED");
  }
  return state;
}

function readSealedBytes(
  path: string,
  directory: string,
  allowedLinks = 1,
  qualificationHooks?: SealedReadQualificationHooks,
): Buffer {
  const before = assertContainedPlainFile(path, directory, false, allowedLinks, qualificationHooks)!;
  if (!Number.isSafeInteger(before.size) || before.size < 1 || before.size > MAX_LOCK_BYTES) {
    throw new Error("RETRIEVAL_STATE_WRITER_LOCK_SIZE_INVALID");
  }
  const descriptor = openSync(path, "r");
  try {
    const opened = fstatSync(descriptor);
    const openedSameDevice = opened.dev === before.dev ||
      (process.platform === "win32" && (opened.dev === 0 || before.dev === 0));
    if (!opened.isFile() || opened.ino !== before.ino || !openedSameDevice || opened.nlink !== allowedLinks ||
        opened.mode !== before.mode ||
        (process.platform !== "win32" && (opened.mode & 0o777) !== 0o600) ||
        opened.size !== before.size || opened.mtimeMs !== before.mtimeMs || opened.ctimeMs !== before.ctimeMs) {
      throw new Error("RETRIEVAL_STATE_WRITER_LOCK_CHANGED");
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
    const afterSameDevice = after.dev === before.dev ||
      (process.platform === "win32" && (after.dev === 0 || before.dev === 0));
    const pathSameDevice = pathAfter.dev === before.dev ||
      (process.platform === "win32" && (pathAfter.dev === 0 || before.dev === 0));
    if (offset !== before.size || !after.isFile() || after.ino !== before.ino || !afterSameDevice ||
        after.nlink !== allowedLinks || after.mode !== before.mode ||
        (process.platform !== "win32" && (after.mode & 0o777) !== 0o600) ||
        after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs ||
        !pathAfter.isFile() || pathAfter.isSymbolicLink() || pathAfter.ino !== before.ino || !pathSameDevice ||
        pathAfter.nlink !== allowedLinks || pathAfter.mode !== before.mode ||
        (process.platform !== "win32" && (pathAfter.mode & 0o777) !== 0o600) ||
        pathAfter.size !== before.size || pathAfter.mtimeMs !== before.mtimeMs || pathAfter.ctimeMs !== before.ctimeMs) {
      throw new Error("RETRIEVAL_STATE_WRITER_LOCK_CHANGED");
    }
    const canonicalAfter = canonicalPathSync(path, { alias_error: "RETRIEVAL_STATE_WRITER_ALIAS_REJECTED" });
    if (!sameCanonicalPath(dirname(canonicalAfter), directory) || basename(canonicalAfter) !== basename(path)) {
      throw new Error("RETRIEVAL_STATE_WRITER_PATH_ESCAPE");
    }
    return bytes.subarray(0, offset);
  } finally { closeSync(descriptor); }
}

function pointerDigest(directory: string): string | null {
  const path = join(directory, "active-retrieval.json");
  if (!pathExists(path)) return null;
  const bytes = readSealedBytes(path, directory);
  return retrievalSha256(bytes);
}

function assertCanonicalLegacyPointer(bytes: Buffer): void {
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("RETRIEVAL_STATE_POINTER_JSON_INVALID"); }
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join("\0") !== "database_file\0manifest" || !bytes.equals(canonicalBytes(value))) {
    throw new Error("RETRIEVAL_STATE_POINTER_INVALID");
  }
  const raw = value as Record<string, unknown>;
  if ((raw as Record<string, unknown>).contract_version === "gkos-ingest-legacy-pointer-tombstone/1.0.0-draft.1" ||
      (raw.manifest as Record<string, unknown> | null)?.contract_version === "gkos-ingest-legacy-pointer-tombstone/1.0.0-draft.1") {
    throw new Error("RETRIEVAL_PHASE3_AUTHORITY_ACTIVE");
  }
  if (raw.manifest === null || typeof raw.manifest !== "object" || Array.isArray(raw.manifest)) {
    throw new Error("RETRIEVAL_STATE_POINTER_INVALID");
  }
  try { assertRetrievalProjectionManifest(raw.manifest as AnyRetrievalProjectionManifest); }
  catch { throw new Error("RETRIEVAL_STATE_POINTER_INVALID"); }
  const manifest = raw.manifest as AnyRetrievalProjectionManifest;
  if (raw.database_file !== `retrieval-${manifest.projection_digest.slice("sha256:".length)}.sqlite`) {
    throw new Error("RETRIEVAL_STATE_POINTER_INVALID");
  }
}

export function assertCanonicalStateAuthorityNames(directory: string): void {
  const entries = readdirSync(directory, { withFileTypes: true });
  if (entries.length > 100_000) throw new Error("RETRIEVAL_STATE_DIRECTORY_ENTRY_LIMIT_EXCEEDED");
  for (const entry of entries) {
    const canonical = [...AUTHORITY_EVIDENCE_NAMES].find((name) => name.toLowerCase() === entry.name.toLowerCase());
    if (canonical && canonical !== entry.name) throw new Error("RETRIEVAL_STATE_AUTHORITY_NAME_INVALID");
  }
}

function assertNoPhase3Authority(directory: string): void {
  assertCanonicalStateAuthorityNames(directory);
  for (const name of AUTHORITY_EVIDENCE_NAMES) if (name !== "active-retrieval.json" && pathExists(join(directory, name))) {
    throw new Error("RETRIEVAL_PHASE3_AUTHORITY_ACTIVE");
  }
  const legacy = join(directory, "active-retrieval.json");
  if (!pathExists(legacy)) return;
  const bytes = readSealedBytes(legacy, directory);
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("RETRIEVAL_STATE_POINTER_JSON_INVALID"); }
  if (value !== null && typeof value === "object" && !Array.isArray(value) &&
      (value as Record<string, unknown>).contract_version === "gkos-ingest-legacy-pointer-tombstone/1.0.0-draft.1") {
    throw new Error("RETRIEVAL_PHASE3_AUTHORITY_ACTIVE");
  }
  assertCanonicalLegacyPointer(bytes);
}

function sealLock(value: unknown): LegacyWriterLock {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("RETRIEVAL_STATE_WRITER_LOCK_INVALID");
  }
  const raw = value as Record<string, unknown>;
  if (Reflect.ownKeys(raw).length !== 6 || raw.contract_version !== LOCK_CONTRACT ||
      typeof raw.lock_id !== "string" || !SHA256_RE.test(raw.lock_id) ||
      typeof raw.process_id !== "number" || !Number.isSafeInteger(raw.process_id) || raw.process_id <= 0 ||
      (raw.prior_pointer_digest !== null && (typeof raw.prior_pointer_digest !== "string" || !SHA256_RE.test(raw.prior_pointer_digest))) ||
      (raw.target_pointer_digest !== null && (typeof raw.target_pointer_digest !== "string" || !SHA256_RE.test(raw.target_pointer_digest))) ||
      typeof raw.lock_digest !== "string" || !SHA256_RE.test(raw.lock_digest)) {
    throw new TypeError("RETRIEVAL_STATE_WRITER_LOCK_INVALID");
  }
  const material = {
    contract_version: LOCK_CONTRACT,
    lock_id: raw.lock_id,
    process_id: raw.process_id,
    prior_pointer_digest: raw.prior_pointer_digest as string | null,
    target_pointer_digest: raw.target_pointer_digest as string | null,
  };
  if (retrievalCanonicalDigest(material) !== raw.lock_digest) throw new TypeError("RETRIEVAL_STATE_WRITER_LOCK_DIGEST_INVALID");
  return Object.freeze({ ...material, lock_digest: raw.lock_digest }) as LegacyWriterLock;
}

function readLock(
  directory: string,
  path = join(directory, LEGACY_WRITER_LOCK_FILE),
  allowedLinks = 1,
  qualificationHooks?: SealedReadQualificationHooks,
): {
  lock: LegacyWriterLock;
  file_digest: string;
} {
  const bytes = readSealedBytes(path, directory, allowedLinks, qualificationHooks);
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")); }
  catch { throw new TypeError("RETRIEVAL_STATE_WRITER_LOCK_JSON_INVALID"); }
  const lock = sealLock(parsed);
  if (!bytes.equals(canonicalBytes(lock))) throw new Error("RETRIEVAL_STATE_WRITER_LOCK_NONCANONICAL");
  return { lock, file_digest: retrievalSha256(bytes) };
}

function replaceLock(directory: string, lock: LegacyWriterLock): { lock: LegacyWriterLock; file_digest: string } {
  const path = join(directory, LEGACY_WRITER_LOCK_FILE);
  const temporary = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const bytes = canonicalBytes(lock);
  writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
  if (process.platform !== "win32") chmodSync(temporary, 0o600);
  const descriptor = openSync(temporary, "r+");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, path);
  syncDirectory(directory);
  return readLock(directory);
}

export function assertNoLegacyRetrievalWriter(directory: string): void {
  if (pathExists(join(directory, LEGACY_WRITER_LOCK_FILE)) || pathExists(join(directory, LEGACY_WRITER_RECOVERY_FILE))) {
    throw new Error("GKX_INGEST_LEGACY_WRITER_LOCKED");
  }
}

export function acquireLegacyRetrievalWriter(stateDirectory: string): LegacyRetrievalWriterCapability {
  const requested = validateStateDirectory(stateDirectory);
  const requestedCanonical = canonicalPathSync(requested, {
    allow_missing: true,
    alias_error: "RETRIEVAL_STATE_ANCESTOR_ALIAS_REJECTED",
  });
  const created = !pathExists(requestedCanonical);
  const directory = ensureDirectory(stateDirectory);
  try { assertNoPhase3Authority(directory); }
  catch (error) {
    if (created && readdirSync(directory).length === 0) rmdirSync(directory);
    throw error;
  }
  const path = join(directory, LEGACY_WRITER_LOCK_FILE);
  if (pathExists(join(directory, LEGACY_WRITER_RECOVERY_FILE))) throw new Error("RETRIEVAL_STATE_WRITER_RECOVERY_ACTIVE");
  const material = {
    contract_version: LOCK_CONTRACT,
    lock_id: `sha256:${randomBytes(32).toString("hex")}`,
    process_id: process.pid,
    prior_pointer_digest: pointerDigest(directory),
    target_pointer_digest: null,
  };
  const lock = sealLock({ ...material, lock_digest: retrievalCanonicalDigest(material) });
  const bytes = canonicalBytes(lock);
  try { writeFileSync(path, bytes, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (created && readdirSync(directory).length === 0) rmdirSync(directory);
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("RETRIEVAL_STATE_WRITER_LOCKED");
    throw error;
  }
  if (process.platform !== "win32") chmodSync(path, 0o600);
  const descriptor = openSync(path, "r+");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
  syncDirectory(directory);
  try {
    // The second half of the handshake closes both create/check interleavings.
    assertNoPhase3Authority(directory);
    const reopened = readLock(directory);
    if (reopened.file_digest !== retrievalSha256(bytes)) throw new Error("RETRIEVAL_STATE_WRITER_LOCK_CHANGED");
    const capability = Object.freeze({ state_directory: directory });
    LOCK_CAPABILITIES.set(capability, { ...reopened, remove_empty_directory_on_release: created });
    return capability;
  } catch (error) {
    const reopened = readLock(directory);
    if (reopened.file_digest === retrievalSha256(bytes)) {
      unlinkSync(path);
      syncDirectory(directory);
    }
    if (created && readdirSync(directory).length === 0) rmdirSync(directory);
    throw error;
  }
}

export function assertLegacyRetrievalWriterCapability(
  value: unknown,
  stateDirectory?: string,
): asserts value is LegacyRetrievalWriterCapability {
  if (value === null || typeof value !== "object" || !LOCK_CAPABILITIES.has(value)) {
    throw new TypeError("RETRIEVAL_STATE_WRITER_CAPABILITY_INVALID");
  }
  const capability = value as LegacyRetrievalWriterCapability;
  if (stateDirectory !== undefined) {
    const requested = canonicalPathSync(validateStateDirectory(stateDirectory), {
      allow_missing: true,
      alias_error: "RETRIEVAL_STATE_ANCESTOR_ALIAS_REJECTED",
    });
    if (!sameCanonicalPath(requested, capability.state_directory)) throw new Error("RETRIEVAL_STATE_WRITER_COORDINATE_MISMATCH");
  }
  const expected = LOCK_CAPABILITIES.get(capability)!;
  const current = readLock(capability.state_directory);
  if (current.file_digest !== expected.file_digest || stableJson(current.lock) !== stableJson(expected.lock)) {
    throw new Error("RETRIEVAL_STATE_WRITER_LOCK_CHANGED");
  }
}

export function bindLegacyRetrievalWriterTarget(
  capability: LegacyRetrievalWriterCapability,
  targetPointerBytes: Uint8Array,
): void {
  assertLegacyRetrievalWriterCapability(capability);
  assertNoPhase3Authority(capability.state_directory);
  const expected = LOCK_CAPABILITIES.get(capability)!;
  if (expected.lock.target_pointer_digest !== null) throw new Error("RETRIEVAL_STATE_WRITER_TARGET_ALREADY_BOUND");
  if (pointerDigest(capability.state_directory) !== expected.lock.prior_pointer_digest) {
    throw new Error("RETRIEVAL_STATE_WRITER_PRIOR_POINTER_CHANGED");
  }
  const material = {
    contract_version: LOCK_CONTRACT,
    lock_id: expected.lock.lock_id,
    process_id: expected.lock.process_id,
    prior_pointer_digest: expected.lock.prior_pointer_digest,
    target_pointer_digest: retrievalSha256(targetPointerBytes),
  };
  const lock = sealLock({ ...material, lock_digest: retrievalCanonicalDigest(material) });
  const reopened = replaceLock(capability.state_directory, lock);
  LOCK_CAPABILITIES.set(capability, {
    ...reopened,
    remove_empty_directory_on_release: expected.remove_empty_directory_on_release,
  });
}

export function assertLegacyRetrievalWriterCommit(
  capability: LegacyRetrievalWriterCapability,
  targetPointerBytes: Uint8Array,
): void {
  assertLegacyRetrievalWriterCapability(capability);
  assertNoPhase3Authority(capability.state_directory);
  const held = LOCK_CAPABILITIES.get(capability)!;
  const targetDigest = retrievalSha256(targetPointerBytes);
  if (held.lock.target_pointer_digest !== targetDigest) throw new Error("RETRIEVAL_STATE_WRITER_TARGET_MISMATCH");
  if (pointerDigest(capability.state_directory) !== held.lock.prior_pointer_digest) {
    throw new Error("RETRIEVAL_STATE_WRITER_PRIOR_POINTER_CHANGED");
  }
  // Re-read after every authority/pointer observation; the guard remains held.
  assertLegacyRetrievalWriterCapability(capability);
}

export function verifyLegacyRetrievalWriterTargetPublished(
  capability: LegacyRetrievalWriterCapability,
  targetPointerBytes: Uint8Array,
): void {
  assertLegacyRetrievalWriterCapability(capability);
  const expected = retrievalSha256(targetPointerBytes);
  const held = LOCK_CAPABILITIES.get(capability)!;
  if (held.lock.target_pointer_digest !== expected || pointerDigest(capability.state_directory) !== expected) {
    throw new Error("RETRIEVAL_STATE_WRITER_TARGET_PUBLICATION_INVALID");
  }
  assertNoPhase3Authority(capability.state_directory);
  assertLegacyRetrievalWriterCapability(capability);
}

export function releaseLegacyRetrievalWriter(capability: LegacyRetrievalWriterCapability): void {
  assertLegacyRetrievalWriterCapability(capability);
  const held = LOCK_CAPABILITIES.get(capability)!;
  const currentPointer = pointerDigest(capability.state_directory);
  if (currentPointer !== held.lock.prior_pointer_digest && currentPointer !== held.lock.target_pointer_digest) {
    throw new Error("RETRIEVAL_STATE_WRITER_RELEASE_STATE_INVALID");
  }
  unlinkSync(join(capability.state_directory, LEGACY_WRITER_LOCK_FILE));
  syncDirectory(capability.state_directory);
  LOCK_CAPABILITIES.delete(capability);
  if (held.remove_empty_directory_on_release && readdirSync(capability.state_directory).length === 0) {
    rmdirSync(capability.state_directory);
  }
}

export function legacyRetrievalWriterIsHeld(capability: LegacyRetrievalWriterCapability): boolean {
  return LOCK_CAPABILITIES.has(capability);
}

function processIdAppearsLive(processId: number): boolean {
  if (processId === process.pid) return true;
  try { process.kill(processId, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}

function recoverLegacyWriterTemporaries(directory: string): void {
  const entries = readdirSync(directory, { withFileTypes: true });
  if (entries.length > 100_000) throw new Error("RETRIEVAL_STATE_DIRECTORY_ENTRY_LIMIT_EXCEEDED");
  for (const entry of entries) {
    const lockTemporary = /^retrieval-writer\.lock\.\d+\.[0-9a-f]{16}\.tmp$/u.test(entry.name);
    const pointerTemporary = /^active-retrieval\.json\.\d+\.tmp$/u.test(entry.name);
    if (!lockTemporary && !pointerTemporary) {
      const controlled = /^(?:retrieval-writer\.(?:lock|recovery)(?:\.|$)|active-retrieval\.json(?:\.|$))/iu.test(entry.name);
      const acceptedFixed = entry.name === LEGACY_WRITER_LOCK_FILE || entry.name === LEGACY_WRITER_RECOVERY_FILE ||
        entry.name === "active-retrieval.json";
      if (controlled && !acceptedFixed) throw new Error("RETRIEVAL_STATE_WRITER_ARTIFACT_NAME_INVALID");
      continue;
    }
    const path = join(directory, entry.name);
    const state = lstatSync(path);
    if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1 || state.size < 1 || state.size > MAX_LOCK_BYTES) {
      throw new Error("RETRIEVAL_STATE_WRITER_TEMP_ALIAS_REJECTED");
    }
    if (process.platform !== "win32" && (state.mode & 0o777) !== 0o600) {
      throw new Error("RETRIEVAL_STATE_WRITER_TEMP_PERMISSION_REJECTED");
    }
    if (lockTemporary) readLock(directory, path);
    else {
      const bytes = readSealedBytes(path, directory);
      try { assertCanonicalLegacyPointer(bytes); }
      catch { throw new Error("RETRIEVAL_STATE_WRITER_POINTER_TEMP_INVALID"); }
    }
    unlinkSync(path);
  }
  syncDirectory(directory);
}

export function recoverStaleLegacyRetrievalWriter(
  stateDirectory: string,
  expectedLockDigest: string,
  options: {
    confirm_process_incarnation_stale?: boolean;
    confirm_recovery_claim_stale?: boolean;
    /** Repository-private qualification seam: invoked once between lock-path lstat and stat. */
    on_lock_path_lstat?: () => void;
  } = {},
): void {
  if (!SHA256_RE.test(expectedLockDigest)) throw new TypeError("RETRIEVAL_STATE_WRITER_EXPECTED_DIGEST_INVALID");
  const directory = canonicalPathSync(validateStateDirectory(stateDirectory), {
    alias_error: "RETRIEVAL_STATE_DIRECTORY_ALIAS_REJECTED",
  });
  const lockPath = join(directory, LEGACY_WRITER_LOCK_FILE);
  const claimPath = join(directory, LEGACY_WRITER_RECOVERY_FILE);
  if (pathExists(claimPath) && options.confirm_recovery_claim_stale !== true) {
    throw new Error("RETRIEVAL_STATE_WRITER_RECOVERY_ALREADY_CLAIMED");
  }
  if (!pathExists(lockPath) && pathExists(claimPath)) linkSync(claimPath, lockPath);
  let qualificationHook = options.on_lock_path_lstat;
  const qualificationHooks = qualificationHook === undefined ? undefined : {
    on_path_lstat() {
      const hook = qualificationHook;
      qualificationHook = undefined;
      hook?.();
    },
  };
  const preliminary = pathExists(claimPath)
    ? readLock(directory, claimPath, pathExists(lockPath) ? 2 : 1, qualificationHooks)
    : readLock(directory, undefined, 1, qualificationHooks);
  if (preliminary.lock.lock_digest !== expectedLockDigest) throw new Error("RETRIEVAL_STATE_WRITER_LOCK_DIGEST_MISMATCH");
  if (processIdAppearsLive(preliminary.lock.process_id) && options.confirm_process_incarnation_stale !== true) {
    throw new Error("RETRIEVAL_STATE_WRITER_PROCESS_LIVE");
  }
  if (pathExists(claimPath)) {
    const pair = readLock(directory, claimPath, 2);
    if (pair.file_digest !== preliminary.file_digest) throw new Error("RETRIEVAL_STATE_WRITER_RECOVERY_CLAIM_CHANGED");
    unlinkSync(claimPath);
  }
  try { linkSync(lockPath, claimPath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("RETRIEVAL_STATE_WRITER_RECOVERY_ALREADY_CLAIMED");
    throw error;
  }
  syncDirectory(directory);
  const claimed = readLock(directory, claimPath, 2);
  if (claimed.file_digest !== preliminary.file_digest) throw new Error("RETRIEVAL_STATE_WRITER_RECOVERY_CLAIM_CHANGED");
  recoverLegacyWriterTemporaries(directory);
  assertNoPhase3Authority(directory);
  const current = pointerDigest(directory);
  if (current !== preliminary.lock.prior_pointer_digest && current !== preliminary.lock.target_pointer_digest) {
    throw new Error("RETRIEVAL_STATE_WRITER_RECOVERY_STATE_INVALID");
  }
  unlinkSync(lockPath);
  syncDirectory(directory);
  const finalClaim = readLock(directory, claimPath, 1);
  if (finalClaim.file_digest !== preliminary.file_digest) throw new Error("RETRIEVAL_STATE_WRITER_RECOVERY_CLAIM_CHANGED");
  unlinkSync(claimPath);
  syncDirectory(directory);
}
