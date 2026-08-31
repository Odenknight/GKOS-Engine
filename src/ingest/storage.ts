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
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join, parse, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { canonicalPathSync, sameCanonicalPath } from "../retrieval/path-security";
import { bindGkxRetrievalCandidateChunks } from "../retrieval/candidate-types";
import { chunkMarkdown } from "../retrieval/chunker";
import { RETRIEVAL_CHUNKER_VERSION, RETRIEVAL_TOKENIZER_VERSION } from "../retrieval/contracts";
import {
  assertRetrievalProjectionManifest,
  buildGkxRetrievalGenerationUnactivated,
  isGkxRetrievalProjectionManifest,
  SqliteRetrievalStore,
  type BuiltUnactivatedRetrievalGeneration,
  type GkxRetrievalGenerationInput,
} from "../retrieval/sqlite-store";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, retrievalSha256, stableJson } from "../retrieval/digest";
import {
  assertCanonicalStateAuthorityNames,
  assertNoLegacyRetrievalWriter,
  assertNoWatcherCoherentWriter,
  INGEST_AUTHORITY_LOCK_FILE as AUTHORITY_LOCK_FILE,
  LEGACY_WRITER_LOCK_FILE,
  LEGACY_WRITER_RECOVERY_FILE,
} from "../retrieval/state-writer-lock";
import type { AnyRetrievalProjectionManifest, GkxRetrievalProjectionManifest, VectorProvider } from "../retrieval/types";
import {
  INGEST_ACTIVE_POINTER_CONTRACT_VERSION,
  INGEST_ACTIVATION_ROOT_CONTRACT_VERSION,
  INGEST_ATTEMPT_STATUS_CONTRACT_VERSION,
  INGEST_AUTHORITY_WITNESS_CONTRACT_VERSION,
  INGEST_AUTHORITY_LOCK_CONTRACT_VERSION,
  INGEST_INDEX_RESULT_CONTRACT_VERSION,
  INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION,
  INGEST_MIGRATION_CONTRACT_VERSION,
  INGEST_OWNER_GENERATION_CONTRACT_VERSION,
  INGEST_REJECTION_JOURNAL_CONTRACT_VERSION,
  INGEST_VALIDATION_CONTRACT_VERSION,
} from "./contracts";
import {
  sealIngestProfileCoordinate,
  sealIngestRejectionEnvelope,
  sealIngestValidationResultEnvelope,
} from "./envelopes";
import { sealNormalizedIngestProfileEnvelope } from "./profile";
import { assertIngestValidationPlan } from "./validation";
import type {
  IngestActiveProjectionCoordinate,
  IngestActivePointer,
  IngestActivationRoot,
  IngestAuthorityWitness,
  IngestAuthorityLock,
  IngestBlockedAttemptStatus,
  IngestChunkingCoordinate,
  IngestIndexMode,
  IngestIndexResult,
  IngestGenerationCoordinateInput,
  IngestLegacyPointerTombstone,
  IngestMigrationRecord,
  IngestOpenedGeneration,
  IngestOwnerState,
  IngestOwnerGenerationManifest,
  IngestPriorActive,
  PreparedIngestGeneration,
  IngestRejectionJournal,
  IngestValidationPlan,
} from "./types";
import {
  assertWatcherIngestWriterCapability,
  type WatcherIngestWriterCapability,
} from "../watcher/index-validation-hook";

const ACTIVE_RETRIEVAL_FILE = "active-retrieval.json";
const ACTIVE_INGEST_FILE = "active-ingest.json";
const AUTHORITY_WITNESS_FILE = "ingest-authority.json";
const ACTIVATION_ROOT_FILE = "ingest-activation-root.json";
const AUTHORITY_RECOVERY_CLAIM_FILE = "ingest-authority.recovery";
const ATTEMPT_STATUS_FILE = "ingest-attempt-status.json";
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const OWNER_GENERATION_ID_RE = /^ingest:[0-9a-f]{24}$/u;
const FATAL_UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const MAX_POINTER_BYTES = 1_048_576;
const MAX_OWNER_JSON_BYTES = 512 * 1024 * 1024;
const MAX_STATE_ARTIFACT_BYTES = 16 * 1024 * 1024 * 1024;

const STAGED_GENERATIONS = new WeakSet<object>();
const PREPARED_GENERATIONS = new WeakMap<object, { authority: IngestAuthorityPreflight; plan: IngestValidationPlan }>();
const AUTHORITY_PREFLIGHTS = new WeakSet<object>();
const STAGED_AUTHORITIES = new WeakMap<object, IngestAuthorityPreflight>();
const AUTHORITY_LOCKS = new WeakMap<object, { lock: IngestAuthorityLock; file_digest: string }>();
interface VaultRootIdentity {
  canonical_root: string;
  state_directory: string;
  device: number;
  inode: number;
  mode: number;
}
const VAULT_ROOT_PREFLIGHTS = new WeakMap<object, VaultRootIdentity>();
const AUTHORITY_ROOTS = new WeakMap<object, IngestVaultRootPreflight>();
interface ArtifactNamespaceEntry {
  name: string;
  /** Decimal strings avoid lossy/unsafe NTFS 64-bit identifiers in canonical JSON. */
  device: string;
  inode: string;
  size: number;
  mode: number;
  modified_ms: number;
  changed_ms: number;
}
interface ArtifactNamespaceSnapshot {
  entries: readonly ArtifactNamespaceEntry[];
  digest: string;
}
const AUTHORITY_NAMESPACES = new WeakMap<object, ArtifactNamespaceSnapshot>();

export interface IngestAuthorityPreflight {
  state_directory: string;
  active: IngestOpenedGeneration | null;
  authority_digest: string;
  artifact_namespace_digest: string;
}

export interface IngestVaultRootPreflight {
  vault_root: string;
  state_directory: string;
}

export interface IngestAuthorityPreflightOptions {
  /** Qualification hook executed before the root-bound state creation check. */
  on_before_state_creation?: () => void;
}

export interface IngestOwnerOpenOptions {
  /** Trusted qualification hook executed after the active DB snapshot and before its read-only open. */
  on_after_database_snapshot?: (database_path: string) => void;
}

export interface StagedIngestGeneration {
  state_directory: string;
  inner_database_path: string;
  journal_path: string;
  owner_manifest_path: string;
  owner_manifest: IngestOwnerGenerationManifest;
}

export type IngestActivationBoundary =
  | "outer_verified"
  | "activation_intent_bound"
  | "migration_prepared"
  | "activation_root_published"
  | "witness_activating"
  | "legacy_tombstoned"
  | "outer_pointer_published"
  | "witness_active";

export interface IngestActivationOptions {
  /** Trusted qualification hook; throwing models a process crash at the named durable boundary. */
  on_boundary?: (boundary: IngestActivationBoundary) => void;
}

export type IngestBlockedAttemptBoundary = "attempt_intent_bound" | "attempt_status_published";
export interface IngestBlockedAttemptOptions {
  /** Trusted qualification hook; throwing models a crash at the sealed status transition. */
  on_boundary?: (boundary: IngestBlockedAttemptBoundary) => void;
}

function assertNoNegativeZero(value: unknown): void {
  if (typeof value === "number" && Object.is(value, -0)) throw new TypeError("GKX_INGEST_STORAGE_NEGATIVE_ZERO_INVALID");
  if (value === null || typeof value !== "object") return;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) assertNoNegativeZero(descriptor.value);
  }
}

function inertClone<T>(value: unknown, code: string): T {
  try {
    assertNoNegativeZero(value);
    return JSON.parse(stableJson(value)) as T;
  } catch { throw new TypeError(code); }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  return Object.freeze(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort(retrievalCodeUnitCompare);
  const frozen = [...expected].sort(retrievalCodeUnitCompare);
  if (actual.length !== frozen.length || actual.some((key, index) => key !== frozen[index])) throw new TypeError(code);
}

function digestMaterial<T extends Record<string, unknown>>(value: T, omitted: readonly string[]): string {
  const material: Record<string, unknown> = {};
  for (const key of Object.keys(value)) if (!omitted.includes(key)) material[key] = value[key];
  return retrievalCanonicalDigest(material);
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
  if (/^(?:[\\/]{2}|[\\/]\?\?[\\/])/u.test(value)) return true;
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

function validateStateDirectory(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096 || /[\u0000-\u001f\u007f]/u.test(value) ||
      hasUnpairedSurrogate(value) || forbiddenStatePathNamespace(value)) {
    throw new TypeError("GKX_INGEST_STATE_DIRECTORY_INVALID");
  }
  const absolute = resolve(value);
  if (parse(absolute).root === absolute) throw new TypeError("GKX_INGEST_STATE_DIRECTORY_INVALID");
  return absolute;
}

function pathExists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function ensureStateDirectory(value: string): string {
  const requested = validateStateDirectory(value);
  const canonical = canonicalPathSync(requested, { allow_missing: true, alias_error: "GKX_INGEST_STATE_ANCESTOR_ALIAS_REJECTED" });
  const existed = pathExists(canonical);
  mkdirSync(canonical, { recursive: true, mode: 0o700 });
  const final = canonicalPathSync(canonical, { alias_error: "GKX_INGEST_STATE_DIRECTORY_ALIAS_REJECTED" });
  const state = lstatSync(final);
  if (!state.isDirectory() || state.isSymbolicLink()) throw new Error("GKX_INGEST_STATE_DIRECTORY_ALIAS_REJECTED");
  if (process.platform !== "win32") {
    if (existed && (state.mode & 0o777) !== 0o700) throw new Error("GKX_INGEST_STATE_DIRECTORY_PERMISSION_INVALID");
    if (!existed) chmodSync(final, 0o700);
  }
  return final;
}

function existingStateDirectory(value: string): string | null {
  const requested = validateStateDirectory(value);
  if (!pathExists(requested)) return null;
  const canonical = canonicalPathSync(requested, { alias_error: "GKX_INGEST_STATE_DIRECTORY_ALIAS_REJECTED" });
  const state = lstatSync(canonical);
  if (!state.isDirectory() || state.isSymbolicLink()) throw new Error("GKX_INGEST_STATE_DIRECTORY_ALIAS_REJECTED");
  if (process.platform !== "win32" && (state.mode & 0o777) !== 0o700) {
    throw new Error("GKX_INGEST_STATE_DIRECTORY_PERMISSION_INVALID");
  }
  return canonical;
}

function sameVaultRootIdentity(identity: VaultRootIdentity, state: ReturnType<typeof lstatSync>): boolean {
  const sameDevice = identity.device === state.dev ||
    (process.platform === "win32" && (identity.device === 0 || state.dev === 0));
  return state.isDirectory() && !state.isSymbolicLink() && sameDevice && identity.inode === state.ino && identity.mode === state.mode;
}

function revalidateVaultRootPreflight(capability: IngestVaultRootPreflight): VaultRootIdentity {
  const identity = VAULT_ROOT_PREFLIGHTS.get(capability);
  if (!identity) throw new TypeError("GKX_INGEST_VAULT_ROOT_PREFLIGHT_CAPABILITY_INVALID");
  let canonical: string;
  let state: ReturnType<typeof lstatSync>;
  try {
    canonical = canonicalPathSync(identity.canonical_root, { alias_error: "GKX_INGEST_VAULT_ROOT_ALIAS_REJECTED" });
    state = lstatSync(identity.canonical_root);
  } catch { throw new Error("GKX_INGEST_VAULT_ROOT_CHANGED"); }
  if (!sameCanonicalPath(canonical, identity.canonical_root) || !sameVaultRootIdentity(identity, state)) {
    throw new Error("GKX_INGEST_VAULT_ROOT_CHANGED");
  }
  return identity;
}

/** Opaque root identity bound into CLI authority acquisition and provider staging. */
export function preflightIngestVaultRoot(vaultRoot: string): IngestVaultRootPreflight {
  const requested = resolve(vaultRoot);
  let canonical: string;
  let state: ReturnType<typeof lstatSync>;
  try {
    canonical = canonicalPathSync(requested, { alias_error: "GKX_INGEST_VAULT_ROOT_ALIAS_REJECTED" });
    state = lstatSync(canonical);
  } catch { throw new Error("GKX_INGEST_VAULT_ROOT_INVALID"); }
  if (!state.isDirectory() || state.isSymbolicLink()) throw new Error("GKX_INGEST_VAULT_ROOT_INVALID");
  const stateDirectory = validateStateDirectory(join(canonical, ".gkx", "derived", "retrieval"));
  const capability = deepFreeze({ vault_root: canonical, state_directory: stateDirectory });
  VAULT_ROOT_PREFLIGHTS.set(capability, {
    canonical_root: canonical,
    state_directory: stateDirectory,
    device: state.dev,
    inode: state.ino,
    mode: state.mode,
  });
  return capability;
}

/**
 * Watcher bootstrap reuses the exact Phase-3 vault-root capability and state
 * directory creation authority. It creates/reopens only the governed
 * `.gkx/derived/retrieval` coordinate; watcher W/J roots are established by
 * their own direct-child capabilities after this returns.
 */
export function ensureWatcherIngestStateDirectory(capability: IngestVaultRootPreflight): string {
  const identity = revalidateVaultRootPreflight(capability);
  const directory = ensureStateDirectory(identity.state_directory);
  revalidateVaultRootPreflight(capability);
  if (!sameCanonicalPath(directory, identity.state_directory)) {
    throw new Error("GKX_INGEST_AUTHORITY_STATE_COORDINATE_CHANGED");
  }
  return directory;
}

function controlledArtifactName(name: string): boolean {
  // NTFS is case-insensitive: detect reserved spellings without case, then
  // acceptedArtifactName requires the one canonical lowercase spelling.
  return /^(?:active-(?:retrieval|ingest)\.json|ingest-|retrieval-)/iu.test(name);
}

function acceptedArtifactName(name: string): boolean {
  return name === ACTIVE_RETRIEVAL_FILE || name === ACTIVE_INGEST_FILE || name === AUTHORITY_WITNESS_FILE ||
    name === ATTEMPT_STATUS_FILE || name === ACTIVATION_ROOT_FILE || name === AUTHORITY_LOCK_FILE ||
    name === AUTHORITY_RECOVERY_CLAIM_FILE || name === LEGACY_WRITER_LOCK_FILE || name === LEGACY_WRITER_RECOVERY_FILE ||
    /^(?:ingest-(?:rejections|generation|migration)-[0-9a-f]{64}\.json|retrieval-[0-9a-f]{64}\.sqlite)$/u.test(name);
}

function captureArtifactNamespace(directory: string, allowAuthorityRecoveryClaim = false): ArtifactNamespaceSnapshot {
  const entries = readdirSync(directory, { withFileTypes: true });
  if (entries.length > 100_000) throw new Error("GKX_INGEST_STATE_DIRECTORY_ENTRY_LIMIT_EXCEEDED");
  const sealed: ArtifactNamespaceEntry[] = [];
  for (const entry of entries) {
    if (!controlledArtifactName(entry.name)) continue;
    if (!acceptedArtifactName(entry.name)) throw new Error("GKX_INGEST_STATE_ARTIFACT_NAME_INVALID");
    if (entry.name === AUTHORITY_LOCK_FILE) continue;
    if (entry.name === AUTHORITY_RECOVERY_CLAIM_FILE) {
      if (allowAuthorityRecoveryClaim) continue;
      throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_ALREADY_CLAIMED");
    }
    if (entry.name === LEGACY_WRITER_LOCK_FILE || entry.name === LEGACY_WRITER_RECOVERY_FILE) {
      throw new Error("GKX_INGEST_LEGACY_WRITER_LOCKED");
    }
    const path = join(directory, entry.name);
    const state = lstatSync(path);
    const canonical = canonicalPathSync(path, { alias_error: "GKX_INGEST_STATE_FILE_ALIAS_REJECTED" });
    if (!sameCanonicalPath(dirname(canonical), directory) || !state.isFile() || state.isSymbolicLink() || state.nlink !== 1 ||
        !Number.isSafeInteger(state.size) || state.size < 1 || state.size > MAX_STATE_ARTIFACT_BYTES) {
      throw new Error("GKX_INGEST_STATE_ARTIFACT_INVALID");
    }
    if (process.platform !== "win32" && (state.mode & 0o777) !== 0o600) {
      throw new Error("GKX_INGEST_STATE_ARTIFACT_PERMISSION_INVALID");
    }
    verifyArtifactNamespaceEntry(directory, entry.name, path);
    sealed.push({
      name: entry.name,
      device: String(state.dev),
      inode: String(state.ino),
      size: state.size,
      mode: state.mode & 0o777,
      modified_ms: state.mtimeMs,
      changed_ms: state.ctimeMs,
    });
  }
  sealed.sort((left, right) => retrievalCodeUnitCompare(left.name, right.name));
  return deepFreeze({ entries: sealed, digest: retrievalCanonicalDigest(sealed) });
}

function assertPlainContainedFile(path: string, directory: string): void {
  const canonical = canonicalPathSync(path, { allow_missing: true, alias_error: "GKX_INGEST_STATE_FILE_ALIAS_REJECTED" });
  if (!sameCanonicalPath(dirname(canonical), directory) || basename(canonical) !== basename(path)) {
    throw new Error("GKX_INGEST_STATE_PATH_ESCAPE_REJECTED");
  }
  if (!pathExists(canonical)) return;
  const link = lstatSync(canonical);
  if (!link.isFile() || link.isSymbolicLink() || statSync(canonical).nlink > 1) {
    throw new Error("GKX_INGEST_STATE_FILE_ALIAS_REJECTED");
  }
  if (process.platform !== "win32" && (link.mode & 0o777) !== 0o600) {
    throw new Error("GKX_INGEST_STATE_ARTIFACT_PERMISSION_INVALID");
  }
}

function sameFileState(left: ReturnType<typeof lstatSync>, right: ReturnType<typeof lstatSync>): boolean {
  const sameDevice = left.dev === right.dev || (process.platform === "win32" && (left.dev === 0 || right.dev === 0));
  return left.isFile() && right.isFile() && !left.isSymbolicLink() && !right.isSymbolicLink() &&
    left.nlink === 1 && right.nlink === 1 && sameDevice && left.ino === right.ino &&
    left.size === right.size && left.mode === right.mode &&
    left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function missingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function initialFileState(path: string, code: string): Stats {
  try { return lstatSync(path); }
  catch (error) {
    if (missingPathError(error)) throw new Error(`${code}_MISSING`);
    throw error;
  }
}

function openSealedStateDatabase(
  path: string,
  directory: string,
  code: string,
  onAfterSnapshot?: (database_path: string) => void,
): SqliteRetrievalStore {
  assertPlainContainedFile(path, directory);
  const before = initialFileState(path, code);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || !Number.isSafeInteger(before.size) ||
      before.size < 1 || before.size > MAX_STATE_ARTIFACT_BYTES ||
      (process.platform !== "win32" && (before.mode & 0o777) !== 0o600)) {
    throw new Error(`${code}_PERMISSION_OR_IDENTITY_INVALID`);
  }
  onAfterSnapshot?.(path);
  let store: SqliteRetrievalStore | undefined;
  try {
    store = new SqliteRetrievalStore(path);
    let after: Stats;
    let canonicalAfter: string;
    try {
      after = lstatSync(path);
      canonicalAfter = canonicalPathSync(path, { alias_error: "GKX_INGEST_STATE_FILE_ALIAS_REJECTED" });
    } catch (error) {
      if (missingPathError(error)) throw new Error(`${code}_CHANGED_DURING_OPEN`);
      throw error;
    }
    if (!sameCanonicalPath(canonicalAfter, path) || !sameCanonicalPath(dirname(canonicalAfter), directory) ||
        !sameCanonicalPath(store.database_path, path) || !sameFileState(before, after)) {
      throw new Error(`${code}_CHANGED_DURING_OPEN`);
    }
    return store;
  } catch (error) {
    try { store?.close(); } catch { /* retain the original sealed-open error */ }
    if (store === undefined && (missingPathError(error) ||
        (error instanceof Error && error.message === "RETRIEVAL_DATABASE_MISSING"))) {
      throw new Error(`${code}_CHANGED_DURING_OPEN`);
    }
    throw error;
  }
}

function hardenFile(path: string): void {
  if (process.platform !== "win32") chmodSync(path, 0o600);
}

function syncFile(path: string): void {
  const descriptor = openSync(path, "r+");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function syncDirectory(directory: string): void {
  try {
    const descriptor = openSync(directory, "r");
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
  } catch (error) {
    // Windows does not expose directory handles through fs.open; each file is
    // still fsync'd before and after its atomic rename.
    if (process.platform !== "win32") throw error;
  }
}

function writeCanonicalTemporary(finalPath: string, directory: string, value: unknown): string {
  assertPlainContainedFile(finalPath, directory);
  let ordinal = 0;
  let temporary = `${finalPath}.${process.pid}.tmp`;
  while (pathExists(temporary)) temporary = `${finalPath}.${process.pid}.${++ordinal}.tmp`;
  assertPlainContainedFile(temporary, directory);
  const bytes = canonicalBytes(value);
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error) {
    try { closeSync(descriptor); } catch { /* close best effort before cleanup */ }
    if (pathExists(temporary)) unlinkSync(temporary);
    throw error;
  }
  closeSync(descriptor);
  hardenFile(temporary);
  return temporary;
}

function readSealedBytes(path: string, directory: string, maximum: number, code: string): Buffer {
  assertPlainContainedFile(path, directory);
  const before = initialFileState(path, code);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || !Number.isSafeInteger(before.size) ||
      before.size < 1 || before.size > maximum) throw new Error(`${code}_SIZE_INVALID`);
  if (process.platform !== "win32" && (before.mode & 0o777) !== 0o600) {
    throw new Error(`${code}_PERMISSION_INVALID`);
  }
  let descriptor: number;
  try { descriptor = openSync(path, "r"); }
  catch (error) {
    if (missingPathError(error)) throw new Error(`${code}_CHANGED_DURING_READ`);
    throw error;
  }
  try {
    const opened = fstatSync(descriptor);
    if (!sameFileState(before, opened)) throw new Error(`${code}_IDENTITY_CHANGED`);
    const bytes = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, length);
      if (count === 0) break;
      length += count;
    }
    const openedAfter = fstatSync(descriptor);
    let pathAfter: Stats;
    let canonicalAfter: string;
    try {
      pathAfter = lstatSync(path);
      canonicalAfter = canonicalPathSync(path, { alias_error: "GKX_INGEST_STATE_FILE_ALIAS_REJECTED" });
    } catch (error) {
      if (missingPathError(error)) throw new Error(`${code}_CHANGED_DURING_READ`);
      throw error;
    }
    if (!sameCanonicalPath(canonicalAfter, path) || !sameCanonicalPath(dirname(canonicalAfter), directory) ||
        !sameFileState(before, openedAfter) || !sameFileState(before, pathAfter) || length !== before.size) {
      throw new Error(`${code}_CHANGED_DURING_READ`);
    }
    return bytes.subarray(0, length);
  } finally { closeSync(descriptor); }
}

function publishImmutableJson(finalPath: string, directory: string, value: unknown): void {
  const expected = canonicalBytes(value);
  if (pathExists(finalPath)) {
    assertPlainContainedFile(finalPath, directory);
    const actual = readSealedBytes(finalPath, directory, expected.length, "GKX_INGEST_IMMUTABLE_FILE");
    if (!actual.equals(expected)) throw new Error("GKX_INGEST_IMMUTABLE_FILE_CONFLICT");
    hardenFile(finalPath);
    return;
  }
  const temporary = writeCanonicalTemporary(finalPath, directory, value);
  try {
    // A hard-link publication is a same-filesystem, no-replace operation. It
    // cannot overwrite an immutable artifact published by another process.
    linkSync(temporary, finalPath);
  } catch (error) {
    if (pathExists(temporary)) unlinkSync(temporary);
    if ((error as NodeJS.ErrnoException).code === "EEXIST" && pathExists(finalPath)) {
      const actual = readSealedBytes(finalPath, directory, expected.length, "GKX_INGEST_IMMUTABLE_FILE");
      if (actual.equals(expected)) return;
      throw new Error("GKX_INGEST_IMMUTABLE_FILE_CONFLICT");
    }
    throw error;
  }
  unlinkSync(temporary);
  hardenFile(finalPath);
  syncFile(finalPath);
  syncDirectory(directory);
}

function replaceCanonicalJson(finalPath: string, directory: string, value: unknown): void {
  assertPlainContainedFile(finalPath, directory);
  const temporary = writeCanonicalTemporary(finalPath, directory, value);
  renameSync(temporary, finalPath);
  hardenFile(finalPath);
  syncFile(finalPath);
  syncDirectory(directory);
}

function readCanonicalJson<T>(path: string, directory: string, maximum: number, code: string): { value: T; digest: string } {
  const bytes = readSealedBytes(path, directory, maximum, code);
  let raw: string;
  try { raw = FATAL_UTF8.decode(bytes); } catch { throw new Error(`${code}_UTF8_INVALID`); }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`${code}_JSON_INVALID`); }
  if (!bytes.equals(canonicalBytes(parsed))) throw new Error(`${code}_NONCANONICAL`);
  return { value: parsed as T, digest: retrievalSha256(bytes) };
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

export function sealIngestRejectionJournalEnvelope(
  value: unknown,
  normalizedProfile: unknown,
): IngestRejectionJournal {
  const normalized = sealNormalizedIngestProfileEnvelope(normalizedProfile);
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_REJECTION_JOURNAL_INVALID");
  exactKeys(inert, [
    "contract_version", "normalized_profile", "observation_snapshot_digest", "profile", "rejection_count", "rejections",
    "rejection_journal_digest",
  ], "GKX_INGEST_REJECTION_JOURNAL_FIELDS_INVALID");
  if (inert.contract_version !== INGEST_REJECTION_JOURNAL_CONTRACT_VERSION ||
      typeof inert.observation_snapshot_digest !== "string" || !SHA256_RE.test(inert.observation_snapshot_digest) ||
      !Number.isSafeInteger(inert.rejection_count) || (inert.rejection_count as number) < 0 ||
      !Array.isArray(inert.rejections) || inert.rejections.length !== inert.rejection_count ||
      typeof inert.rejection_journal_digest !== "string" || !SHA256_RE.test(inert.rejection_journal_digest)) {
    throw new TypeError("GKX_INGEST_REJECTION_JOURNAL_SHAPE_INVALID");
  }
  if (!sameJson(sealNormalizedIngestProfileEnvelope(inert.normalized_profile), normalized)) {
    throw new TypeError("GKX_INGEST_REJECTION_JOURNAL_PROFILE_INVALID");
  }
  const profile = sealIngestProfileCoordinate(inert.profile, normalized);
  const rejections = (inert.rejections as unknown[]).map((item) => sealIngestRejectionEnvelope(item, normalized));
  const expectedOrder = [...rejections].sort((left, right) => retrievalCodeUnitCompare(left.source_path, right.source_path) ||
    left.source_observation_ordinal - right.source_observation_ordinal || retrievalCodeUnitCompare(left.rejection_digest, right.rejection_digest));
  if (!sameJson(rejections, expectedOrder)) throw new TypeError("GKX_INGEST_REJECTION_JOURNAL_ORDER_INVALID");
  const observationCoordinates = new Set<string>();
  const rejectionDigests = new Set<string>();
  for (const rejection of rejections) {
    const coordinate = `${rejection.source_path}\0${rejection.source_observation_ordinal}`;
    if (observationCoordinates.has(coordinate) || rejectionDigests.has(rejection.rejection_digest)) {
      throw new TypeError("GKX_INGEST_REJECTION_JOURNAL_MULTIPLICITY_INVALID");
    }
    observationCoordinates.add(coordinate);
    rejectionDigests.add(rejection.rejection_digest);
  }
  const sealed: IngestRejectionJournal = {
    contract_version: INGEST_REJECTION_JOURNAL_CONTRACT_VERSION,
    observation_snapshot_digest: inert.observation_snapshot_digest as string,
    profile,
    normalized_profile: normalized,
    rejection_count: inert.rejection_count as number,
    rejections,
    rejection_journal_digest: inert.rejection_journal_digest as string,
  };
  if (digestMaterial(sealed as unknown as Record<string, unknown>, ["rejection_journal_digest"]) !== sealed.rejection_journal_digest) {
    throw new TypeError("GKX_INGEST_REJECTION_JOURNAL_DIGEST_INVALID");
  }
  return deepFreeze(sealed);
}

function journalForPlan(plan: IngestValidationPlan): IngestRejectionJournal {
  const material = {
    contract_version: INGEST_REJECTION_JOURNAL_CONTRACT_VERSION,
    observation_snapshot_digest: plan.observation_snapshot_digest,
    profile: plan.result.profile,
    normalized_profile: plan.result.normalized_profile,
    rejection_count: plan.result.rejections.length,
    rejections: plan.result.rejections,
  };
  return sealIngestRejectionJournalEnvelope({
    ...material,
    rejection_journal_digest: retrievalCanonicalDigest(material),
  }, plan.result.normalized_profile);
}

function sealInnerManifest(value: unknown): GkxRetrievalProjectionManifest {
  const inert = inertClone<AnyRetrievalProjectionManifest>(value, "GKX_INGEST_INNER_MANIFEST_INVALID");
  if (!isGkxRetrievalProjectionManifest(inert) || !SHA256_RE.test(inert.projection_digest) || inert.projection_schema_version !== 3) {
    throw new TypeError("GKX_INGEST_INNER_MANIFEST_INVALID");
  }
  assertRetrievalProjectionManifest(inert);
  return deepFreeze(inert);
}

export function sealIngestOwnerGenerationManifestEnvelope(value: unknown): IngestOwnerGenerationManifest {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_OWNER_MANIFEST_INVALID");
  exactKeys(inert, [
    "chunking", "configuration_digest", "contract_version", "inner", "mode", "normalized_profile", "observation_snapshot_digest",
    "owner_generation_id", "owner_manifest_digest", "policy_digest", "profile", "rejection_journal", "validation_result", "vault_id",
  ], "GKX_INGEST_OWNER_MANIFEST_FIELDS_INVALID");
  if (inert.contract_version !== INGEST_OWNER_GENERATION_CONTRACT_VERSION ||
      (inert.mode !== "strict" && inert.mode !== "non_strict") ||
      typeof inert.vault_id !== "string" || inert.vault_id.length < 1 || inert.vault_id.length > 512 ||
      typeof inert.observation_snapshot_digest !== "string" || !SHA256_RE.test(inert.observation_snapshot_digest) ||
      typeof inert.configuration_digest !== "string" || !SHA256_RE.test(inert.configuration_digest) ||
      typeof inert.policy_digest !== "string" || !SHA256_RE.test(inert.policy_digest) ||
      typeof inert.owner_generation_id !== "string" || !OWNER_GENERATION_ID_RE.test(inert.owner_generation_id) ||
      typeof inert.owner_manifest_digest !== "string" || !SHA256_RE.test(inert.owner_manifest_digest)) {
    throw new TypeError("GKX_INGEST_OWNER_MANIFEST_SHAPE_INVALID");
  }
  const chunkingRaw = inertClone<Record<string, unknown>>(inert.chunking, "GKX_INGEST_OWNER_MANIFEST_CHUNKING_INVALID");
  exactKeys(chunkingRaw, ["chunker_version", "max_tokens", "overlap_tokens", "tokenizer_version"],
    "GKX_INGEST_OWNER_MANIFEST_CHUNKING_FIELDS_INVALID");
  if (chunkingRaw.chunker_version !== RETRIEVAL_CHUNKER_VERSION || chunkingRaw.tokenizer_version !== RETRIEVAL_TOKENIZER_VERSION ||
      !Number.isSafeInteger(chunkingRaw.max_tokens) || (chunkingRaw.max_tokens as number) < 16 ||
      (chunkingRaw.max_tokens as number) > 4096 || !Number.isSafeInteger(chunkingRaw.overlap_tokens) ||
      (chunkingRaw.overlap_tokens as number) < 0 || (chunkingRaw.overlap_tokens as number) >= (chunkingRaw.max_tokens as number)) {
    throw new TypeError("GKX_INGEST_OWNER_MANIFEST_CHUNKING_INVALID");
  }
  const chunking = deepFreeze(chunkingRaw as unknown as IngestChunkingCoordinate);
  const normalized = sealNormalizedIngestProfileEnvelope(inert.normalized_profile);
  const profile = sealIngestProfileCoordinate(inert.profile, normalized);
  const result = sealIngestValidationResultEnvelope(inert.validation_result);
  if (!sameJson(profile, result.profile) || !sameJson(normalized, result.normalized_profile) ||
      profile.effective_profile_digest !== retrievalCanonicalDigest(normalized)) {
    throw new TypeError("GKX_INGEST_OWNER_MANIFEST_PROFILE_INVALID");
  }
  const expectedSnapshot = retrievalCanonicalDigest({
    contract_version: INGEST_VALIDATION_CONTRACT_VERSION,
    effective_profile_digest: profile.effective_profile_digest,
    sources: result.observations,
  });
  if (expectedSnapshot !== inert.observation_snapshot_digest) throw new TypeError("GKX_INGEST_OWNER_MANIFEST_SNAPSHOT_INVALID");
  if (inert.mode === "strict" && !result.ingest_intrinsic_valid) throw new TypeError("GKX_INGEST_OWNER_MANIFEST_STRICT_INVALID");
  const inner = inertClone<Record<string, unknown>>(inert.inner, "GKX_INGEST_OWNER_MANIFEST_INNER_INVALID");
  exactKeys(inner, ["database_file", "manifest", "manifest_digest"], "GKX_INGEST_OWNER_MANIFEST_INNER_FIELDS_INVALID");
  const innerManifest = sealInnerManifest(inner.manifest);
  if (typeof inner.database_file !== "string" || basename(inner.database_file) !== inner.database_file ||
      inner.database_file !== `retrieval-${innerManifest.projection_digest.slice("sha256:".length)}.sqlite` ||
      typeof inner.manifest_digest !== "string" || inner.manifest_digest !== retrievalCanonicalDigest(innerManifest) ||
      innerManifest.source_snapshot_digest !== inert.observation_snapshot_digest ||
      innerManifest.vault_id !== inert.vault_id || innerManifest.configuration_digest !== inert.configuration_digest ||
      innerManifest.policy_digest !== inert.policy_digest || innerManifest.candidate_source_count !== result.summary.valid_source_count) {
    throw new TypeError("GKX_INGEST_OWNER_MANIFEST_INNER_BINDING_INVALID");
  }
  const journal = inertClone<Record<string, unknown>>(inert.rejection_journal, "GKX_INGEST_OWNER_MANIFEST_JOURNAL_INVALID");
  exactKeys(journal, ["journal_file", "rejection_count", "rejection_journal_digest"], "GKX_INGEST_OWNER_MANIFEST_JOURNAL_FIELDS_INVALID");
  const expectedJournal = sealIngestRejectionJournalEnvelope({
    contract_version: INGEST_REJECTION_JOURNAL_CONTRACT_VERSION,
    observation_snapshot_digest: inert.observation_snapshot_digest,
    profile,
    normalized_profile: normalized,
    rejection_count: result.rejections.length,
    rejections: result.rejections,
    rejection_journal_digest: retrievalCanonicalDigest({
      contract_version: INGEST_REJECTION_JOURNAL_CONTRACT_VERSION,
      observation_snapshot_digest: inert.observation_snapshot_digest,
      profile,
      normalized_profile: normalized,
      rejection_count: result.rejections.length,
      rejections: result.rejections,
    }),
  }, normalized);
  if (journal.rejection_journal_digest !== expectedJournal.rejection_journal_digest ||
      journal.journal_file !== `ingest-rejections-${expectedJournal.rejection_journal_digest.slice("sha256:".length)}.json` ||
      journal.rejection_count !== expectedJournal.rejection_count) {
    throw new TypeError("GKX_INGEST_OWNER_MANIFEST_JOURNAL_BINDING_INVALID");
  }
  const sealed: IngestOwnerGenerationManifest = {
    contract_version: INGEST_OWNER_GENERATION_CONTRACT_VERSION,
    owner_generation_id: inert.owner_generation_id as string,
    owner_manifest_digest: inert.owner_manifest_digest as string,
    mode: inert.mode as IngestIndexMode,
    vault_id: inert.vault_id as string,
    observation_snapshot_digest: inert.observation_snapshot_digest as string,
    profile,
    normalized_profile: normalized,
    configuration_digest: inert.configuration_digest as string,
    policy_digest: inert.policy_digest as string,
    chunking,
    validation_result: result,
    inner: {
      database_file: inner.database_file as string,
      manifest: innerManifest,
      manifest_digest: inner.manifest_digest as string,
    },
    rejection_journal: {
      journal_file: journal.journal_file as string,
      rejection_journal_digest: journal.rejection_journal_digest as string,
      rejection_count: journal.rejection_count as number,
    },
  };
  const expectedDigest = digestMaterial(sealed as unknown as Record<string, unknown>, ["owner_generation_id", "owner_manifest_digest"]);
  if (expectedDigest !== sealed.owner_manifest_digest || sealed.owner_generation_id !== `ingest:${expectedDigest.slice("sha256:".length, "sha256:".length + 24)}`) {
    throw new TypeError("GKX_INGEST_OWNER_MANIFEST_DIGEST_INVALID");
  }
  return deepFreeze(sealed);
}

function ownerManifestFor(
  plan: IngestValidationPlan,
  mode: IngestIndexMode,
  artifact: BuiltUnactivatedRetrievalGeneration,
  journal: IngestRejectionJournal,
  chunking: IngestChunkingCoordinate,
): IngestOwnerGenerationManifest {
  const manifest = sealInnerManifest(artifact.manifest);
  const material = {
    contract_version: INGEST_OWNER_GENERATION_CONTRACT_VERSION,
    mode,
    vault_id: manifest.vault_id,
    observation_snapshot_digest: plan.observation_snapshot_digest,
    profile: plan.result.profile,
    normalized_profile: plan.result.normalized_profile,
    configuration_digest: manifest.configuration_digest,
    policy_digest: manifest.policy_digest,
    chunking,
    validation_result: plan.result,
    inner: {
      database_file: basename(artifact.database_path),
      manifest,
      manifest_digest: retrievalCanonicalDigest(manifest),
    },
    rejection_journal: {
      journal_file: `ingest-rejections-${journal.rejection_journal_digest.slice("sha256:".length)}.json`,
      rejection_journal_digest: journal.rejection_journal_digest,
      rejection_count: journal.rejection_count,
    },
  };
  const digest = retrievalCanonicalDigest(material);
  return sealIngestOwnerGenerationManifestEnvelope({
    ...material,
    owner_generation_id: `ingest:${digest.slice("sha256:".length, "sha256:".length + 24)}`,
    owner_manifest_digest: digest,
  });
}

function normalizeChunkingCoordinate(value: unknown): IngestChunkingCoordinate {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_CHUNKING_COORDINATE_INVALID");
  exactKeys(inert, ["max_tokens", "overlap_tokens"], "GKX_INGEST_CHUNKING_COORDINATE_FIELDS_INVALID");
  if (!Number.isSafeInteger(inert.max_tokens) || (inert.max_tokens as number) < 16 || (inert.max_tokens as number) > 4096 ||
      !Number.isSafeInteger(inert.overlap_tokens) || (inert.overlap_tokens as number) < 0 ||
      (inert.overlap_tokens as number) >= (inert.max_tokens as number)) {
    throw new TypeError("GKX_INGEST_CHUNKING_COORDINATE_INVALID");
  }
  return deepFreeze({
    chunker_version: RETRIEVAL_CHUNKER_VERSION,
    tokenizer_version: RETRIEVAL_TOKENIZER_VERSION,
    max_tokens: inert.max_tokens as number,
    overlap_tokens: inert.overlap_tokens as number,
  });
}

export function prepareValidatedGkxIngestGeneration(
  authority: IngestAuthorityPreflight,
  mode: IngestIndexMode,
  plan: IngestValidationPlan,
  chunkingOptions: unknown = { max_tokens: 400, overlap_tokens: 0 },
): PreparedIngestGeneration {
  assertAuthorityPreflight(authority);
  assertIngestValidationPlan(plan);
  if (mode !== "strict" && mode !== "non_strict") throw new TypeError("GKX_INGEST_INDEX_MODE_INVALID");
  if (mode === "strict" && !plan.result.ingest_intrinsic_valid) throw new Error("GKX_INGEST_STRICT_VALIDATION_BLOCKED");
  revalidateAuthorityPreflight(authority);
  const chunking = normalizeChunkingCoordinate(chunkingOptions);
  const candidateSources = inertClone<PreparedIngestGeneration["candidate_sources"]>(
    plan.accepted_sources.map((source) => source.candidate_source),
    "GKX_INGEST_PREPARED_CANDIDATE_SOURCES_INVALID");
  const candidateDeclarations = inertClone<PreparedIngestGeneration["candidate_declarations"]>(plan.accepted_declarations,
    "GKX_INGEST_PREPARED_CANDIDATE_DECLARATIONS_INVALID");
  const candidateChunks = plan.accepted_sources.flatMap((source) => bindGkxRetrievalCandidateChunks(
    source.record_key,
    chunkMarkdown(source.chunk_input, {
      max_tokens: chunking.max_tokens,
      overlap_tokens: chunking.overlap_tokens,
    }),
  )).sort((left, right) => retrievalCodeUnitCompare(left.candidate_chunk_key, right.candidate_chunk_key));
  const prepared = deepFreeze({
    mode,
    observation_snapshot_digest: plan.observation_snapshot_digest,
    validation_result: plan.result,
    chunking,
    candidate_sources: candidateSources,
    candidate_declarations: candidateDeclarations,
    candidate_chunks: candidateChunks,
  });
  PREPARED_GENERATIONS.set(prepared, { authority, plan });
  return prepared;
}

function assertPreparedGeneration(
  value: unknown,
  authority: IngestAuthorityPreflight,
): asserts value is PreparedIngestGeneration {
  if (value === null || typeof value !== "object" || !PREPARED_GENERATIONS.has(value) ||
      PREPARED_GENERATIONS.get(value)!.authority !== authority) {
    throw new TypeError("GKX_INGEST_PREPARED_GENERATION_CAPABILITY_INVALID");
  }
}

function comparePlanGeneration(
  prepared: PreparedIngestGeneration,
  input: GkxRetrievalGenerationInput,
  stateDirectory: string,
): void {
  const inputState = canonicalPathSync(validateStateDirectory(input.state_directory), {
    allow_missing: true,
    alias_error: "GKX_INGEST_STATE_ANCESTOR_ALIAS_REJECTED",
  });
  if (!sameCanonicalPath(inputState, stateDirectory) || input.source_snapshot_digest !== prepared.observation_snapshot_digest) {
    throw new Error("GKX_INGEST_INNER_INPUT_COORDINATE_MISMATCH");
  }
  const expectedSources = [...prepared.candidate_sources]
    .sort((left, right) => retrievalCodeUnitCompare(left.record_key, right.record_key));
  const actualSources = [...input.candidate_sources].sort((left, right) => retrievalCodeUnitCompare(left.record_key, right.record_key));
  const expectedDeclarations = [...prepared.candidate_declarations].sort((left, right) => retrievalCodeUnitCompare(stableJson(left), stableJson(right)));
  const actualDeclarations = [...input.candidate_declarations].sort((left, right) => retrievalCodeUnitCompare(stableJson(left), stableJson(right)));
  const expectedChunks = [...prepared.candidate_chunks]
    .sort((left, right) => retrievalCodeUnitCompare(left.candidate_chunk_key, right.candidate_chunk_key));
  const actualChunks = [...input.candidate_chunks]
    .sort((left, right) => retrievalCodeUnitCompare(left.candidate_chunk_key, right.candidate_chunk_key));
  if (!sameJson(expectedSources, actualSources) || !sameJson(expectedDeclarations, actualDeclarations) ||
      !sameJson(expectedChunks, actualChunks)) {
    throw new Error("GKX_INGEST_INNER_INPUT_CANDIDATE_MISMATCH");
  }
  const expectedChunkKeys = new Set(expectedChunks.map((chunk) => chunk.candidate_chunk_key));
  if (input.embedding_eligible_candidate_chunk_keys.some((key) => !expectedChunkKeys.has(key)) ||
      (expectedChunks.length === 0 && input.embedding_eligible_candidate_chunk_keys.length !== 0)) {
    throw new Error("GKX_INGEST_INNER_INPUT_CHUNK_MISMATCH");
  }
}

function stagePreparedGkxIngestGeneration(
  authority: IngestAuthorityPreflight,
  prepared: PreparedIngestGeneration,
  generationInput: GkxRetrievalGenerationInput,
): StagedIngestGeneration {
  assertAuthorityPreflight(authority);
  assertPreparedGeneration(prepared, authority);
  const plan = PREPARED_GENERATIONS.get(prepared)!.plan;
  const mode = prepared.mode;
  if (mode === "strict" && !plan.result.ingest_intrinsic_valid) throw new Error("GKX_INGEST_STRICT_VALIDATION_BLOCKED");
  revalidateAuthorityPreflight(authority);
  const inertInput = inertClone<GkxRetrievalGenerationInput>(generationInput, "GKX_INGEST_INNER_INPUT_INVALID");
  comparePlanGeneration(prepared, inertInput, authority.state_directory);
  const artifact = buildGkxRetrievalGenerationUnactivated(inertInput);
  const directory = ensureStateDirectory(authority.state_directory);
  if (!sameCanonicalPath(dirname(artifact.database_path), directory)) throw new Error("GKX_INGEST_INNER_DATABASE_PATH_INVALID");
  const journal = journalForPlan(plan);
  const journalPath = join(directory, `ingest-rejections-${journal.rejection_journal_digest.slice("sha256:".length)}.json`);
  publishImmutableJson(journalPath, directory, journal);
  const ownerManifest = ownerManifestFor(plan, mode, artifact, journal, prepared.chunking);
  const ownerManifestPath = join(directory, `ingest-generation-${ownerManifest.owner_manifest_digest.slice("sha256:".length)}.json`);
  publishImmutableJson(ownerManifestPath, directory, ownerManifest);
  const verifiedJournal = readCanonicalJson<unknown>(journalPath, directory, MAX_OWNER_JSON_BYTES, "GKX_INGEST_REJECTION_JOURNAL");
  const sealedJournal = sealIngestRejectionJournalEnvelope(verifiedJournal.value, ownerManifest.normalized_profile);
  const verifiedManifest = readCanonicalJson<unknown>(ownerManifestPath, directory, MAX_OWNER_JSON_BYTES, "GKX_INGEST_OWNER_MANIFEST");
  const sealedManifest = sealIngestOwnerGenerationManifestEnvelope(verifiedManifest.value);
  if (!sameJson(sealedJournal, journal) || !sameJson(sealedManifest, ownerManifest) ||
      sealedJournal.rejection_journal_digest !== ownerManifest.rejection_journal.rejection_journal_digest) {
    throw new Error("GKX_INGEST_STAGED_GENERATION_VERIFICATION_FAILED");
  }
  const store = openSealedStateDatabase(artifact.database_path, directory, "GKX_INGEST_INNER_DATABASE");
  try {
    if (!sameJson(store.manifest, ownerManifest.inner.manifest)) throw new Error("GKX_INGEST_INNER_DATABASE_MANIFEST_MISMATCH");
  } finally { store.close(); }
  advanceArtifactNamespace(authority, [artifact.database_path, journalPath, ownerManifestPath]);
  const staged = deepFreeze({
    state_directory: directory,
    inner_database_path: artifact.database_path,
    journal_path: journalPath,
    owner_manifest_path: ownerManifestPath,
    owner_manifest: ownerManifest,
  });
  STAGED_GENERATIONS.add(staged);
  STAGED_AUTHORITIES.set(staged, authority);
  return staged;
}

function generationCoordinate(value: unknown): IngestGenerationCoordinateInput {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_GENERATION_COORDINATE_INVALID");
  exactKeys(inert, [
    "configuration_digest", "embedding_eligible_candidate_chunk_keys", "lexical_backend", "policy_digest",
    "state_directory", "vault_id",
  ], "GKX_INGEST_GENERATION_COORDINATE_FIELDS_INVALID");
  if (typeof inert.state_directory !== "string" || typeof inert.vault_id !== "string" || !inert.vault_id ||
      inert.vault_id.length > 512 || typeof inert.configuration_digest !== "string" || !SHA256_RE.test(inert.configuration_digest) ||
      typeof inert.policy_digest !== "string" || !SHA256_RE.test(inert.policy_digest) ||
      (inert.lexical_backend !== "sqlite_fts5" && inert.lexical_backend !== "sqlite_lexical_scan") ||
      !Array.isArray(inert.embedding_eligible_candidate_chunk_keys) ||
      inert.embedding_eligible_candidate_chunk_keys.some((key) => typeof key !== "string")) {
    throw new TypeError("GKX_INGEST_GENERATION_COORDINATE_INVALID");
  }
  const eligible = inert.embedding_eligible_candidate_chunk_keys as string[];
  if (new Set(eligible).size !== eligible.length ||
      !sameJson(eligible, [...eligible].sort(retrievalCodeUnitCompare))) {
    throw new TypeError("GKX_INGEST_GENERATION_ELIGIBILITY_INVALID");
  }
  return deepFreeze({
    state_directory: inert.state_directory,
    vault_id: inert.vault_id,
    configuration_digest: inert.configuration_digest,
    policy_digest: inert.policy_digest,
    embedding_eligible_candidate_chunk_keys: eligible,
    lexical_backend: inert.lexical_backend,
  } as IngestGenerationCoordinateInput);
}

function validateIngestVectorProvider(provider: VectorProvider): void {
  if (!provider || typeof provider !== "object" || !["openai_compatible", "local_onnx", "mcp"].includes(provider.kind) ||
      typeof provider.provider_id !== "string" || !provider.provider_id || provider.provider_id.length > 512 ||
      /[\u0000-\u001f\u007f]/u.test(provider.provider_id) || hasUnpairedSurrogate(provider.provider_id) ||
      typeof provider.model_id !== "string" ||
      !provider.model_id || provider.model_id.length > 512 || /[\u0000-\u001f\u007f]/u.test(provider.model_id) ||
      hasUnpairedSurrogate(provider.model_id) ||
      !Number.isSafeInteger(provider.dimensions) || provider.dimensions < 1 || provider.dimensions > 1_000_000 ||
      !Number.isSafeInteger(provider.timeout_ms) || provider.timeout_ms < 1 || provider.timeout_ms > 300_000 ||
      typeof provider.embed !== "function") {
    throw new TypeError("GKX_INGEST_VECTOR_PROVIDER_INVALID");
  }
}

async function invokeIngestProvider(
  provider: VectorProvider,
  texts: readonly string[],
  requestId: string,
): Promise<readonly Float32Array[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const vectors = await Promise.race([
      provider.embed(texts, { request_id: requestId, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort("GKX_INGEST_EMBEDDING_TIMEOUT");
          reject(new Error("GKX_INGEST_EMBEDDING_TIMEOUT"));
        }, provider.timeout_ms);
      }),
    ]);
    if (!Array.isArray(vectors) || vectors.length !== texts.length || vectors.some((vector) =>
      !(vector instanceof Float32Array) || vector.length !== provider.dimensions || [...vector].some((part) => !Number.isFinite(part)))) {
      throw new Error("GKX_INGEST_EMBEDDING_RESPONSE_INVALID");
    }
    return vectors;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Phase-3 provider/cache seam. It consumes only the opaque accepted-source
 * preparation and always builds the inner schema-3 artifact unactivated.
 */
export async function stageValidatedGkxIngestGeneration(
  authority: IngestAuthorityPreflight,
  prepared: PreparedIngestGeneration,
  coordinateInput: unknown,
  vectorProvider?: VectorProvider,
): Promise<StagedIngestGeneration> {
  assertAuthorityPreflight(authority);
  assertPreparedGeneration(prepared, authority);
  revalidateAuthorityPreflight(authority);
  const coordinate = generationCoordinate(coordinateInput);
  const coordinateState = canonicalPathSync(validateStateDirectory(coordinate.state_directory), {
    allow_missing: true,
    alias_error: "GKX_INGEST_STATE_ANCESTOR_ALIAS_REJECTED",
  });
  if (!sameCanonicalPath(coordinateState, authority.state_directory)) {
    throw new Error("GKX_INGEST_INNER_INPUT_COORDINATE_MISMATCH");
  }
  const expectedKeys = new Set(prepared.candidate_chunks.map((candidate) => candidate.candidate_chunk_key));
  if (coordinate.embedding_eligible_candidate_chunk_keys.some((key) => !expectedKeys.has(key))) {
    throw new TypeError("GKX_INGEST_GENERATION_ELIGIBILITY_INVALID");
  }
  const base: Omit<GkxRetrievalGenerationInput, "vectors" | "embedding_provider_id" | "embedding_model_id" | "embedding_dimensions"> = {
    ...coordinate,
    source_snapshot_digest: prepared.observation_snapshot_digest,
    candidate_sources: prepared.candidate_sources,
    candidate_declarations: prepared.candidate_declarations,
    candidate_chunks: prepared.candidate_chunks,
  };
  if (vectorProvider) validateIngestVectorProvider(vectorProvider);
  if (!vectorProvider || coordinate.embedding_eligible_candidate_chunk_keys.length === 0) {
    return stagePreparedGkxIngestGeneration(authority, prepared, base);
  }
  const eligible = new Set(coordinate.embedding_eligible_candidate_chunk_keys);
  const providerCandidates = prepared.candidate_chunks.filter((candidate) => eligible.has(candidate.candidate_chunk_key));
  const unique = new Map<string, typeof providerCandidates[number]>();
  for (const candidate of providerCandidates) if (!unique.has(candidate.chunk.content_digest)) {
    unique.set(candidate.chunk.content_digest, candidate);
  }
  const uniqueCandidates = [...unique.values()].sort((left, right) =>
    retrievalCodeUnitCompare(left.chunk.content_digest, right.chunk.content_digest));
  const byDigest = new Map<string, Float32Array>();
  if (authority.active && authority.active.active.kind === "ingest") {
    const prior = openSealedStateDatabase(
      authority.active.database_path,
      authority.state_directory,
      "GKX_INGEST_PRIOR_DATABASE",
    );
    try {
      if (prior.manifest.vault_id === coordinate.vault_id) {
        const cached = prior.contentVectorCache(vectorProvider.provider_id, vectorProvider.model_id, vectorProvider.dimensions);
        if (cached) for (const [digest, vector] of cached) byDigest.set(digest, vector);
      }
    } finally { prior.close(); }
  }
  const missing = uniqueCandidates.filter((candidate) => !byDigest.has(candidate.chunk.content_digest));
  try {
    for (let offset = 0; offset < missing.length;) {
      const batch: typeof missing = [];
      let bytes = 0;
      while (offset + batch.length < missing.length && batch.length < 32) {
        const candidate = missing[offset + batch.length];
        const candidateBytes = Buffer.byteLength(candidate.chunk.text, "utf8");
        if (batch.length > 0 && bytes + candidateBytes > 262_144) break;
        batch.push(candidate);
        bytes += candidateBytes;
      }
      const requestId = retrievalSha256(`ingest-index\0${offset}\0${batch.map((item) => item.chunk.content_digest).join("\0")}`);
      const vectors = await invokeIngestProvider(vectorProvider, batch.map((item) => item.chunk.text), requestId);
      batch.forEach((candidate, index) => byDigest.set(candidate.chunk.content_digest, vectors[index]));
      offset += batch.length;
    }
  } catch {
    // Provider failure publishes one complete lexical generation. No partial
    // vector identity or cache is written.
    return stagePreparedGkxIngestGeneration(authority, prepared, base);
  }
  const vectors = providerCandidates.map((candidate) => ({
    candidate_chunk_key: candidate.candidate_chunk_key,
    vector: [...byDigest.get(candidate.chunk.content_digest)!],
  }));
  return stagePreparedGkxIngestGeneration(authority, prepared, {
    ...base,
    vectors,
    embedding_provider_id: vectorProvider.provider_id,
    embedding_model_id: vectorProvider.model_id,
    embedding_dimensions: vectorProvider.dimensions,
  });
}

export interface WatcherStagedIngestGeneration {
  readonly state_directory: string;
  readonly inner_database_path: string;
  readonly journal_path: string;
  readonly owner_manifest_path: string;
  readonly owner_manifest: IngestOwnerGenerationManifest;
  readonly embedding_work: {
    readonly provider_call_count: number;
    readonly provider_item_count: number;
    readonly reused_content_count: number;
    readonly provider_failed: boolean;
  };
}

function watcherCandidateChunks(
  plan: IngestValidationPlan,
  chunkingOptions: unknown,
): {
  readonly chunking: IngestChunkingCoordinate;
  readonly candidate_sources: PreparedIngestGeneration["candidate_sources"];
  readonly candidate_declarations: PreparedIngestGeneration["candidate_declarations"];
  readonly candidate_chunks: PreparedIngestGeneration["candidate_chunks"];
} {
  assertIngestValidationPlan(plan);
  const chunking = normalizeChunkingCoordinate(chunkingOptions);
  const candidateSources = inertClone<PreparedIngestGeneration["candidate_sources"]>(
    plan.accepted_sources.map((source) => source.candidate_source),
    "GKX_INGEST_PREPARED_CANDIDATE_SOURCES_INVALID",
  );
  const candidateDeclarations = inertClone<PreparedIngestGeneration["candidate_declarations"]>(
    plan.accepted_declarations,
    "GKX_INGEST_PREPARED_CANDIDATE_DECLARATIONS_INVALID",
  );
  const candidateChunks = plan.accepted_sources.flatMap((source) => bindGkxRetrievalCandidateChunks(
    source.record_key,
    chunkMarkdown(source.chunk_input, { max_tokens: chunking.max_tokens, overlap_tokens: chunking.overlap_tokens }),
  )).sort((left, right) => retrievalCodeUnitCompare(left.candidate_chunk_key, right.candidate_chunk_key));
  return deepFreeze({
    chunking,
    candidate_sources: candidateSources,
    candidate_declarations: candidateDeclarations,
    candidate_chunks: candidateChunks,
  });
}

/** Trusted local-only watcher override; caller must prove the executor before using it. */
export function watcherLocalEmbeddingEligibility(plan: IngestValidationPlan, ceiling: string): readonly string[] {
  const levels = ["public", "internal", "restricted", "confidential", "regulated", "phi", "secret"];
  const rank = levels.indexOf(ceiling);
  if (rank < 0) throw new Error("LOCAL_EMBEDDING_CEILING_INVALID");
  const prepared = watcherCandidateChunks(plan, { max_tokens: 400, overlap_tokens: 0 });
  const allowed = (value: unknown) => typeof value === "string" && levels.indexOf(value) >= 0 && levels.indexOf(value) <= rank;
  const disallowedRecords = new Set(prepared.candidate_chunks.filter(chunk => !allowed(chunk.chunk.metadata.sensitivity)).map(chunk => chunk.record_key));
  const accepted = new Set(prepared.candidate_sources.filter(source => allowed(source.source_metadata.sensitivity) && !disallowedRecords.has(source.record_key)).map(source => source.record_key));
  return Object.freeze(prepared.candidate_chunks.filter(chunk => accepted.has(chunk.record_key))
    .map(chunk => chunk.candidate_chunk_key).sort(retrievalCodeUnitCompare));
}

/** Exact Phase-3 public-only provider boundary, reused by the watcher host. */
export function watcherPublicEmbeddingEligibility(
  plan: IngestValidationPlan,
  chunkingOptions: unknown = { max_tokens: 400, overlap_tokens: 0 },
): readonly string[] {
  const prepared = watcherCandidateChunks(plan, chunkingOptions);
  const chunksByRecordKey = new Map<string, typeof prepared.candidate_chunks[number][]>();
  for (const candidate of prepared.candidate_chunks) {
    const group = chunksByRecordKey.get(candidate.record_key) ?? [];
    group.push(candidate);
    chunksByRecordKey.set(candidate.record_key, group);
  }
  const publicRecordKeys = new Set(prepared.candidate_sources
    .filter((source) => source.source_metadata.sensitivity === "public")
    .filter((source) => (chunksByRecordKey.get(source.record_key) ?? [])
      .every((candidate) => candidate.chunk.metadata.sensitivity === "public"))
    .map((source) => source.record_key));
  return Object.freeze(prepared.candidate_chunks
    .filter((candidate) => publicRecordKeys.has(candidate.record_key))
    .map((candidate) => candidate.candidate_chunk_key)
    .sort(retrievalCodeUnitCompare));
}

/**
 * Watcher-only inner-generation staging. The outer watcher HostLock remains
 * the sole writer authority; this function publishes only immutable Phase-3
 * owner/schema-3 material and never updates a Phase-3 active pointer.
 */
export async function stageWatcherValidatedGkxIngestGeneration(
  capability: WatcherIngestWriterCapability,
  plan: IngestValidationPlan,
  coordinateInput: unknown,
  chunkingOptions: unknown = { max_tokens: 400, overlap_tokens: 0 },
  vectorProvider?: VectorProvider,
  priorDatabasePath?: string | null,
): Promise<WatcherStagedIngestGeneration> {
  const coordinate = generationCoordinate(coordinateInput);
  assertWatcherIngestWriterCapability(capability, plan, coordinate.state_directory);
  const prepared = watcherCandidateChunks(plan, chunkingOptions);
  const { chunking, candidate_sources: candidateSources, candidate_declarations: candidateDeclarations,
    candidate_chunks: candidateChunks } = prepared;
  if (!vectorProvider && coordinate.embedding_eligible_candidate_chunk_keys.length !== 0) {
    throw new TypeError("GKX_WATCHER_INGEST_VECTOR_STAGE_REQUIRES_PROVIDER");
  }
  if (vectorProvider) validateIngestVectorProvider(vectorProvider);
  const expectedChunkKeys = new Set(candidateChunks.map((candidate) => candidate.candidate_chunk_key));
  if (coordinate.embedding_eligible_candidate_chunk_keys.some((key) => !expectedChunkKeys.has(key))) {
    throw new TypeError("GKX_INGEST_GENERATION_ELIGIBILITY_INVALID");
  }
  const directory = ensureStateDirectory(coordinate.state_directory);
  assertWatcherIngestWriterCapability(capability, plan, coordinate.state_directory);
  const base: GkxRetrievalGenerationInput = {
    ...coordinate,
    source_snapshot_digest: plan.observation_snapshot_digest,
    candidate_sources: candidateSources,
    candidate_declarations: candidateDeclarations,
    candidate_chunks: candidateChunks,
  };
  let providerCallCount = 0;
  let providerItemCount = 0;
  let reusedContentCount = 0;
  let providerFailed = false;
  let generationInput: GkxRetrievalGenerationInput = base;
  if (vectorProvider && coordinate.embedding_eligible_candidate_chunk_keys.length > 0) {
    const eligible = new Set(coordinate.embedding_eligible_candidate_chunk_keys);
    const providerCandidates = candidateChunks.filter((candidate) => eligible.has(candidate.candidate_chunk_key));
    const unique = new Map<string, typeof providerCandidates[number]>();
    for (const candidate of providerCandidates) if (!unique.has(candidate.chunk.content_digest)) {
      unique.set(candidate.chunk.content_digest, candidate);
    }
    const uniqueCandidates = [...unique.values()].sort((left, right) =>
      retrievalCodeUnitCompare(left.chunk.content_digest, right.chunk.content_digest));
    const byDigest = new Map<string, Float32Array>();
    if (priorDatabasePath != null) {
      if (!sameCanonicalPath(dirname(resolve(priorDatabasePath)), directory)) {
        throw new Error("GKX_WATCHER_PRIOR_DATABASE_PATH_INVALID");
      }
      const prior = openSealedStateDatabase(priorDatabasePath, directory, "GKX_WATCHER_PRIOR_DATABASE");
      try {
        if (prior.manifest.vault_id !== coordinate.vault_id) throw new Error("GKX_WATCHER_PRIOR_DATABASE_VAULT_INVALID");
        const cached = prior.contentVectorCache(vectorProvider.provider_id, vectorProvider.model_id, vectorProvider.dimensions);
        if (cached) for (const [digest, vector] of cached) byDigest.set(digest, vector);
      } finally { prior.close(); }
    }
    const missing = uniqueCandidates.filter((candidate) => !byDigest.has(candidate.chunk.content_digest));
    reusedContentCount = uniqueCandidates.length - missing.length;
    try {
      for (let offset = 0; offset < missing.length;) {
        const batch: typeof missing = [];
        let bytes = 0;
        while (offset + batch.length < missing.length && batch.length < 32) {
          const candidate = missing[offset + batch.length];
          const candidateBytes = Buffer.byteLength(candidate.chunk.text, "utf8");
          if (batch.length > 0 && bytes + candidateBytes > 262_144) break;
          batch.push(candidate);
          bytes += candidateBytes;
        }
        providerCallCount += 1;
        providerItemCount += batch.length;
        const requestId = retrievalSha256(`watcher-index\0${offset}\0${batch.map((item) => item.chunk.content_digest).join("\0")}`);
        const vectors = await invokeIngestProvider(vectorProvider, batch.map((item) => item.chunk.text), requestId);
        batch.forEach((candidate, index) => byDigest.set(candidate.chunk.content_digest, vectors[index]));
        offset += batch.length;
      }
      generationInput = {
        ...base,
        vectors: providerCandidates.map((candidate) => ({
          candidate_chunk_key: candidate.candidate_chunk_key,
          vector: [...byDigest.get(candidate.chunk.content_digest)!],
        })),
        embedding_provider_id: vectorProvider.provider_id,
        embedding_model_id: vectorProvider.model_id,
        embedding_dimensions: vectorProvider.dimensions,
      };
    } catch {
      providerFailed = true;
      reusedContentCount = 0;
      generationInput = base;
    }
  }
  const artifact = buildGkxRetrievalGenerationUnactivated(generationInput);
  if (!sameCanonicalPath(dirname(artifact.database_path), directory)) throw new Error("GKX_INGEST_INNER_DATABASE_PATH_INVALID");
  const journal = journalForPlan(plan);
  const journalPath = join(directory, `ingest-rejections-${journal.rejection_journal_digest.slice("sha256:".length)}.json`);
  publishImmutableJson(journalPath, directory, journal);
  const ownerManifest = ownerManifestFor(plan, "non_strict", artifact, journal, chunking);
  const ownerManifestPath = join(directory, `ingest-generation-${ownerManifest.owner_manifest_digest.slice("sha256:".length)}.json`);
  publishImmutableJson(ownerManifestPath, directory, ownerManifest);
  const store = openSealedStateDatabase(artifact.database_path, directory, "GKX_WATCHER_INNER_DATABASE");
  try {
    if (!sameJson(store.manifest, ownerManifest.inner.manifest)) throw new Error("GKX_INGEST_INNER_DATABASE_MANIFEST_MISMATCH");
  } finally {
    store.close();
  }
  assertWatcherIngestWriterCapability(capability, plan, coordinate.state_directory);
  return deepFreeze({
    state_directory: directory,
    inner_database_path: artifact.database_path,
    journal_path: journalPath,
    owner_manifest_path: ownerManifestPath,
    owner_manifest: ownerManifest,
    embedding_work: {
      provider_call_count: providerCallCount,
      provider_item_count: providerItemCount,
      reused_content_count: reusedContentCount,
      provider_failed: providerFailed,
    },
  });
}

function sealActiveProjectionCoordinate(value: unknown): IngestActiveProjectionCoordinate {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_ACTIVE_PROJECTION_INVALID");
  exactKeys(inert, ["database_file", "manifest_digest", "projection_digest", "projection_id"],
    "GKX_INGEST_ACTIVE_PROJECTION_FIELDS_INVALID");
  if (typeof inert.manifest_digest !== "string" || !SHA256_RE.test(inert.manifest_digest) ||
      typeof inert.projection_digest !== "string" || !SHA256_RE.test(inert.projection_digest) ||
      inert.projection_id !== `retrieval:${inert.projection_digest.slice("sha256:".length, "sha256:".length + 24)}` ||
      inert.database_file !== `retrieval-${inert.projection_digest.slice("sha256:".length)}.sqlite`) {
    throw new TypeError("GKX_INGEST_ACTIVE_PROJECTION_BINDING_INVALID");
  }
  return deepFreeze(inert as unknown as IngestActiveProjectionCoordinate);
}

function activeProjectionFor(manifest: IngestOwnerGenerationManifest): IngestActiveProjectionCoordinate {
  return sealActiveProjectionCoordinate({
    database_file: manifest.inner.database_file,
    manifest_digest: manifest.inner.manifest_digest,
    projection_id: manifest.inner.manifest.projection_id,
    projection_digest: manifest.inner.manifest.projection_digest,
  });
}

export function sealActivePointer(value: unknown): IngestActivePointer {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_ACTIVE_POINTER_INVALID");
  exactKeys(inert, ["contract_version", "inner", "owner_generation_file", "owner_generation_id", "owner_manifest_digest"],
    "GKX_INGEST_ACTIVE_POINTER_FIELDS_INVALID");
  const inner = sealActiveProjectionCoordinate(inert.inner);
  if (inert.contract_version !== INGEST_ACTIVE_POINTER_CONTRACT_VERSION ||
      typeof inert.owner_generation_id !== "string" || !OWNER_GENERATION_ID_RE.test(inert.owner_generation_id) ||
      typeof inert.owner_manifest_digest !== "string" || !SHA256_RE.test(inert.owner_manifest_digest) ||
      inert.owner_generation_id !== `ingest:${inert.owner_manifest_digest.slice("sha256:".length, "sha256:".length + 24)}` ||
      inert.owner_generation_file !== `ingest-generation-${inert.owner_manifest_digest.slice("sha256:".length)}.json`) {
    throw new TypeError("GKX_INGEST_ACTIVE_POINTER_BINDING_INVALID");
  }
  return deepFreeze({ ...inert, inner } as unknown as IngestActivePointer);
}

function activePointerFor(manifest: IngestOwnerGenerationManifest): IngestActivePointer {
  return sealActivePointer({
    contract_version: INGEST_ACTIVE_POINTER_CONTRACT_VERSION,
    owner_generation_file: `ingest-generation-${manifest.owner_manifest_digest.slice("sha256:".length)}.json`,
    owner_generation_id: manifest.owner_generation_id,
    owner_manifest_digest: manifest.owner_manifest_digest,
    inner: activeProjectionFor(manifest),
  });
}

function rawCanonicalDigest(value: unknown): string {
  return retrievalSha256(canonicalBytes(value));
}

function derivedActivePointerDigest(
  ownerGenerationId: string,
  ownerManifestDigest: string,
  inner: IngestActiveProjectionCoordinate,
): string {
  return rawCanonicalDigest({
    contract_version: INGEST_ACTIVE_POINTER_CONTRACT_VERSION,
    inner,
    owner_generation_file: `ingest-generation-${ownerManifestDigest.slice("sha256:".length)}.json`,
    owner_generation_id: ownerGenerationId,
    owner_manifest_digest: ownerManifestDigest,
  });
}

function derivedTombstoneDigest(ownerGenerationId: string, ownerManifestDigest: string, migrationDigest: string): string {
  return retrievalCanonicalDigest({
    contract_version: INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION,
    target_owner_generation_id: ownerGenerationId,
    target_owner_manifest_digest: ownerManifestDigest,
    migration_file: `ingest-migration-${migrationDigest.slice("sha256:".length)}.json`,
    migration_digest: migrationDigest,
  });
}

function sealLegacyPointer(value: unknown): { database_file: string; manifest: AnyRetrievalProjectionManifest } {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_LEGACY_POINTER_INVALID");
  exactKeys(inert, ["database_file", "manifest"], "GKX_INGEST_LEGACY_POINTER_FIELDS_INVALID");
  if (inert.manifest === null || typeof inert.manifest !== "object") {
    throw new TypeError("GKX_INGEST_LEGACY_POINTER_BINDING_INVALID");
  }
  const manifest = inertClone<AnyRetrievalProjectionManifest>(inert.manifest, "GKX_INGEST_LEGACY_POINTER_MANIFEST_INVALID");
  try { assertRetrievalProjectionManifest(manifest); }
  catch { throw new TypeError("GKX_INGEST_LEGACY_POINTER_MANIFEST_INVALID"); }
  if (inert.database_file !== `retrieval-${manifest.projection_digest.slice("sha256:".length)}.sqlite`) {
    throw new TypeError("GKX_INGEST_LEGACY_POINTER_BINDING_INVALID");
  }
  return deepFreeze({ database_file: inert.database_file as string, manifest });
}

export function sealMigrationRecord(value: unknown): IngestMigrationRecord {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_MIGRATION_INVALID");
  exactKeys(inert, [
    "contract_version", "legacy_pointer", "legacy_pointer_digest", "migration_digest",
    "target_owner_generation_id", "target_owner_manifest_digest",
  ], "GKX_INGEST_MIGRATION_FIELDS_INVALID");
  if (inert.contract_version !== INGEST_MIGRATION_CONTRACT_VERSION ||
      typeof inert.target_owner_generation_id !== "string" || !OWNER_GENERATION_ID_RE.test(inert.target_owner_generation_id) ||
      typeof inert.target_owner_manifest_digest !== "string" || !SHA256_RE.test(inert.target_owner_manifest_digest) ||
      inert.target_owner_generation_id !== `ingest:${inert.target_owner_manifest_digest.slice("sha256:".length, "sha256:".length + 24)}` ||
      typeof inert.migration_digest !== "string" || !SHA256_RE.test(inert.migration_digest)) {
    throw new TypeError("GKX_INGEST_MIGRATION_SHAPE_INVALID");
  }
  const legacy = inert.legacy_pointer === null ? null : sealLegacyPointer(inert.legacy_pointer);
  const legacyDigest = inert.legacy_pointer_digest;
  if ((legacy === null) !== (legacyDigest === null) ||
      (legacy !== null && (typeof legacyDigest !== "string" || rawCanonicalDigest(legacy) !== legacyDigest))) {
    throw new TypeError("GKX_INGEST_MIGRATION_LEGACY_BINDING_INVALID");
  }
  const sealed: IngestMigrationRecord = {
    contract_version: INGEST_MIGRATION_CONTRACT_VERSION,
    target_owner_generation_id: inert.target_owner_generation_id as string,
    target_owner_manifest_digest: inert.target_owner_manifest_digest as string,
    legacy_pointer: legacy,
    legacy_pointer_digest: legacyDigest as string | null,
    migration_digest: inert.migration_digest as string,
  };
  if (digestMaterial(sealed as unknown as Record<string, unknown>, ["migration_digest"]) !== sealed.migration_digest) {
    throw new TypeError("GKX_INGEST_MIGRATION_DIGEST_INVALID");
  }
  return deepFreeze(sealed);
}

function migrationFor(
  manifest: IngestOwnerGenerationManifest,
  legacy: { pointer: { database_file: string; manifest: AnyRetrievalProjectionManifest }; digest: string } | null,
): IngestMigrationRecord {
  const material = {
    contract_version: INGEST_MIGRATION_CONTRACT_VERSION,
    target_owner_generation_id: manifest.owner_generation_id,
    target_owner_manifest_digest: manifest.owner_manifest_digest,
    legacy_pointer: legacy?.pointer ?? null,
    legacy_pointer_digest: legacy?.digest ?? null,
  };
  return sealMigrationRecord({ ...material, migration_digest: retrievalCanonicalDigest(material) });
}

export function sealTombstone(value: unknown): IngestLegacyPointerTombstone {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_LEGACY_TOMBSTONE_INVALID");
  exactKeys(inert, [
    "contract_version", "migration_digest", "migration_file", "target_owner_generation_id",
    "target_owner_manifest_digest", "tombstone_digest",
  ], "GKX_INGEST_LEGACY_TOMBSTONE_FIELDS_INVALID");
  if (inert.contract_version !== INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION ||
      typeof inert.target_owner_generation_id !== "string" || !OWNER_GENERATION_ID_RE.test(inert.target_owner_generation_id) ||
      typeof inert.target_owner_manifest_digest !== "string" || !SHA256_RE.test(inert.target_owner_manifest_digest) ||
      inert.target_owner_generation_id !== `ingest:${inert.target_owner_manifest_digest.slice("sha256:".length, "sha256:".length + 24)}` ||
      typeof inert.migration_digest !== "string" || !SHA256_RE.test(inert.migration_digest) ||
      inert.migration_file !== `ingest-migration-${inert.migration_digest.slice("sha256:".length)}.json` ||
      typeof inert.tombstone_digest !== "string" || !SHA256_RE.test(inert.tombstone_digest)) {
    throw new TypeError("GKX_INGEST_LEGACY_TOMBSTONE_SHAPE_INVALID");
  }
  const sealed = inert as unknown as IngestLegacyPointerTombstone;
  if (sealed.tombstone_digest !== derivedTombstoneDigest(
    sealed.target_owner_generation_id,
    sealed.target_owner_manifest_digest,
    sealed.migration_digest,
  )) throw new TypeError("GKX_INGEST_LEGACY_TOMBSTONE_BINDING_INVALID");
  if (digestMaterial(sealed as unknown as Record<string, unknown>, ["tombstone_digest"]) !== sealed.tombstone_digest) {
    throw new TypeError("GKX_INGEST_LEGACY_TOMBSTONE_DIGEST_INVALID");
  }
  return deepFreeze(sealed);
}

function tombstoneFor(manifest: IngestOwnerGenerationManifest, migration: IngestMigrationRecord): IngestLegacyPointerTombstone {
  const material = {
    contract_version: INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION,
    target_owner_generation_id: manifest.owner_generation_id,
    target_owner_manifest_digest: manifest.owner_manifest_digest,
    migration_file: `ingest-migration-${migration.migration_digest.slice("sha256:".length)}.json`,
    migration_digest: migration.migration_digest,
  };
  return sealTombstone({ ...material, tombstone_digest: retrievalCanonicalDigest(material) });
}

export function sealActivationRoot(value: unknown): IngestActivationRoot {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_ACTIVATION_ROOT_INVALID");
  exactKeys(inert, [
    "activation_root_digest", "active_pointer_digest", "authority_lock_digest", "contract_version",
    "first_inner", "first_owner_generation_id", "first_owner_manifest_digest", "legacy_pointer_digest", "migration_digest",
    "migration_file", "tombstone_digest",
  ], "GKX_INGEST_ACTIVATION_ROOT_FIELDS_INVALID");
  if (inert.contract_version !== INGEST_ACTIVATION_ROOT_CONTRACT_VERSION ||
      typeof inert.first_owner_generation_id !== "string" || !OWNER_GENERATION_ID_RE.test(inert.first_owner_generation_id) ||
      typeof inert.first_owner_manifest_digest !== "string" || !SHA256_RE.test(inert.first_owner_manifest_digest) ||
      inert.first_owner_generation_id !== `ingest:${inert.first_owner_manifest_digest.slice("sha256:".length, "sha256:".length + 24)}` ||
      typeof inert.migration_digest !== "string" || !SHA256_RE.test(inert.migration_digest) ||
      inert.migration_file !== `ingest-migration-${inert.migration_digest.slice("sha256:".length)}.json` ||
      !(inert.legacy_pointer_digest === null || (typeof inert.legacy_pointer_digest === "string" && SHA256_RE.test(inert.legacy_pointer_digest))) ||
      typeof inert.tombstone_digest !== "string" || !SHA256_RE.test(inert.tombstone_digest) ||
      typeof inert.active_pointer_digest !== "string" || !SHA256_RE.test(inert.active_pointer_digest) ||
      typeof inert.authority_lock_digest !== "string" || !SHA256_RE.test(inert.authority_lock_digest) ||
      typeof inert.activation_root_digest !== "string" || !SHA256_RE.test(inert.activation_root_digest)) {
    throw new TypeError("GKX_INGEST_ACTIVATION_ROOT_SHAPE_INVALID");
  }
  const sealed = { ...inert, first_inner: sealActiveProjectionCoordinate(inert.first_inner) } as unknown as IngestActivationRoot;
  if (sealed.active_pointer_digest !== derivedActivePointerDigest(
    sealed.first_owner_generation_id,
    sealed.first_owner_manifest_digest,
    sealed.first_inner,
  ) ||
      sealed.tombstone_digest !== derivedTombstoneDigest(
        sealed.first_owner_generation_id,
        sealed.first_owner_manifest_digest,
        sealed.migration_digest,
      )) throw new TypeError("GKX_INGEST_ACTIVATION_ROOT_BINDING_INVALID");
  if (digestMaterial(sealed as unknown as Record<string, unknown>, ["activation_root_digest"]) !== sealed.activation_root_digest) {
    throw new TypeError("GKX_INGEST_ACTIVATION_ROOT_DIGEST_INVALID");
  }
  return deepFreeze(sealed);
}

function activationRootFor(
  manifest: IngestOwnerGenerationManifest,
  migration: IngestMigrationRecord,
  tombstone: IngestLegacyPointerTombstone,
  pointer: IngestActivePointer,
  authorityLockDigest: string,
): IngestActivationRoot {
  const material = {
    contract_version: INGEST_ACTIVATION_ROOT_CONTRACT_VERSION,
    first_owner_generation_id: manifest.owner_generation_id,
    first_owner_manifest_digest: manifest.owner_manifest_digest,
    first_inner: pointer.inner,
    migration_file: `ingest-migration-${migration.migration_digest.slice("sha256:".length)}.json`,
    migration_digest: migration.migration_digest,
    legacy_pointer_digest: migration.legacy_pointer_digest,
    tombstone_digest: tombstone.tombstone_digest,
    active_pointer_digest: rawCanonicalDigest(pointer),
    authority_lock_digest: authorityLockDigest,
  };
  return sealActivationRoot({ ...material, activation_root_digest: retrievalCanonicalDigest(material) });
}

export function sealWitness(value: unknown): IngestAuthorityWitness {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_AUTHORITY_WITNESS_INVALID");
  exactKeys(inert, [
    "activation_root_digest", "active_pointer_digest", "authority_lock_digest", "contract_version", "first_inner", "first_owner_generation_id", "first_owner_manifest_digest",
    "legacy_pointer_digest", "migration_digest", "migration_file", "state", "tombstone_digest", "witness_digest",
  ], "GKX_INGEST_AUTHORITY_WITNESS_FIELDS_INVALID");
  if (inert.contract_version !== INGEST_AUTHORITY_WITNESS_CONTRACT_VERSION ||
      (inert.state !== "activating" && inert.state !== "active") ||
      typeof inert.first_owner_generation_id !== "string" || !OWNER_GENERATION_ID_RE.test(inert.first_owner_generation_id) ||
      typeof inert.first_owner_manifest_digest !== "string" || !SHA256_RE.test(inert.first_owner_manifest_digest) ||
      inert.first_owner_generation_id !== `ingest:${inert.first_owner_manifest_digest.slice("sha256:".length, "sha256:".length + 24)}` ||
      typeof inert.migration_digest !== "string" || !SHA256_RE.test(inert.migration_digest) ||
      inert.migration_file !== `ingest-migration-${inert.migration_digest.slice("sha256:".length)}.json` ||
      !(inert.legacy_pointer_digest === null || (typeof inert.legacy_pointer_digest === "string" && SHA256_RE.test(inert.legacy_pointer_digest))) ||
      typeof inert.tombstone_digest !== "string" || !SHA256_RE.test(inert.tombstone_digest) ||
      typeof inert.active_pointer_digest !== "string" || !SHA256_RE.test(inert.active_pointer_digest) ||
      typeof inert.authority_lock_digest !== "string" || !SHA256_RE.test(inert.authority_lock_digest) ||
      typeof inert.activation_root_digest !== "string" || !SHA256_RE.test(inert.activation_root_digest) ||
      typeof inert.witness_digest !== "string" || !SHA256_RE.test(inert.witness_digest)) {
    throw new TypeError("GKX_INGEST_AUTHORITY_WITNESS_SHAPE_INVALID");
  }
  const sealed = { ...inert, first_inner: sealActiveProjectionCoordinate(inert.first_inner) } as unknown as IngestAuthorityWitness;
  const expectedRootDigest = retrievalCanonicalDigest({
    contract_version: INGEST_ACTIVATION_ROOT_CONTRACT_VERSION,
    first_owner_generation_id: sealed.first_owner_generation_id,
    first_owner_manifest_digest: sealed.first_owner_manifest_digest,
    first_inner: sealed.first_inner,
    migration_file: sealed.migration_file,
    migration_digest: sealed.migration_digest,
    legacy_pointer_digest: sealed.legacy_pointer_digest,
    tombstone_digest: sealed.tombstone_digest,
    active_pointer_digest: sealed.active_pointer_digest,
    authority_lock_digest: sealed.authority_lock_digest,
  });
  if (sealed.active_pointer_digest !== derivedActivePointerDigest(
    sealed.first_owner_generation_id,
    sealed.first_owner_manifest_digest,
    sealed.first_inner,
  ) ||
      sealed.tombstone_digest !== derivedTombstoneDigest(
        sealed.first_owner_generation_id,
        sealed.first_owner_manifest_digest,
        sealed.migration_digest,
      ) || sealed.activation_root_digest !== expectedRootDigest) {
    throw new TypeError("GKX_INGEST_AUTHORITY_WITNESS_BINDING_INVALID");
  }
  if (digestMaterial(sealed as unknown as Record<string, unknown>, ["witness_digest"]) !== sealed.witness_digest) {
    throw new TypeError("GKX_INGEST_AUTHORITY_WITNESS_DIGEST_INVALID");
  }
  return deepFreeze(sealed);
}

function witnessFor(
  state: "activating" | "active",
  manifest: IngestOwnerGenerationManifest,
  migration: IngestMigrationRecord,
  tombstone: IngestLegacyPointerTombstone,
  pointer: IngestActivePointer,
  authorityLockDigest: string,
): IngestAuthorityWitness {
  const root = activationRootFor(manifest, migration, tombstone, pointer, authorityLockDigest);
  const material = {
    contract_version: INGEST_AUTHORITY_WITNESS_CONTRACT_VERSION,
    state,
    first_owner_generation_id: manifest.owner_generation_id,
    first_owner_manifest_digest: manifest.owner_manifest_digest,
    first_inner: pointer.inner,
    migration_file: `ingest-migration-${migration.migration_digest.slice("sha256:".length)}.json`,
    migration_digest: migration.migration_digest,
    legacy_pointer_digest: migration.legacy_pointer_digest,
    tombstone_digest: tombstone.tombstone_digest,
    active_pointer_digest: rawCanonicalDigest(pointer),
    authority_lock_digest: authorityLockDigest,
    activation_root_digest: root.activation_root_digest,
  };
  return sealWitness({ ...material, witness_digest: retrievalCanonicalDigest(material) });
}

function sealPriorActive(value: unknown): IngestPriorActive {
  if (value === null) return null;
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_PRIOR_ACTIVE_INVALID");
  if (inert.kind === "legacy") {
    exactKeys(inert, ["kind", "pointer_digest", "projection_digest", "projection_id"], "GKX_INGEST_PRIOR_ACTIVE_FIELDS_INVALID");
    if (typeof inert.projection_id !== "string" || typeof inert.projection_digest !== "string" || !SHA256_RE.test(inert.projection_digest) ||
        inert.projection_id !== `retrieval:${inert.projection_digest.slice("sha256:".length, "sha256:".length + 24)}` ||
        typeof inert.pointer_digest !== "string" || !SHA256_RE.test(inert.pointer_digest)) {
      throw new TypeError("GKX_INGEST_PRIOR_ACTIVE_LEGACY_INVALID");
    }
  } else if (inert.kind === "ingest") {
    exactKeys(inert, ["inner", "kind", "owner_generation_id", "owner_manifest_digest", "pointer_digest"],
      "GKX_INGEST_PRIOR_ACTIVE_FIELDS_INVALID");
    const inner = sealActiveProjectionCoordinate(inert.inner);
    if (typeof inert.owner_generation_id !== "string" || !OWNER_GENERATION_ID_RE.test(inert.owner_generation_id) ||
        typeof inert.owner_manifest_digest !== "string" || !SHA256_RE.test(inert.owner_manifest_digest) ||
        inert.owner_generation_id !== `ingest:${inert.owner_manifest_digest.slice("sha256:".length, "sha256:".length + 24)}` ||
        typeof inert.pointer_digest !== "string" || !SHA256_RE.test(inert.pointer_digest) ||
        inert.pointer_digest !== derivedActivePointerDigest(inert.owner_generation_id, inert.owner_manifest_digest, inner)) {
      throw new TypeError("GKX_INGEST_PRIOR_ACTIVE_OWNER_INVALID");
    }
    inert.inner = inner;
  } else throw new TypeError("GKX_INGEST_PRIOR_ACTIVE_KIND_INVALID");
  return deepFreeze(inert as unknown as Exclude<IngestPriorActive, null>);
}

export function sealAuthorityLock(value: unknown): IngestAuthorityLock {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_AUTHORITY_LOCK_INVALID");
  exactKeys(inert, [
    "contract_version", "lock_digest", "lock_id", "operation", "prior_active", "prior_authority_digest", "process_id", "target",
  ], "GKX_INGEST_AUTHORITY_LOCK_FIELDS_INVALID");
  const prior = sealPriorActive(inert.prior_active);
  let target: IngestAuthorityLock["target"];
  if (inert.target === null) target = null;
  else {
    const rawTarget = inertClone<Record<string, unknown>>(inert.target, "GKX_INGEST_AUTHORITY_LOCK_TARGET_INVALID");
    if (rawTarget.kind === "activation") {
      exactKeys(rawTarget, ["inner", "kind", "owner_generation_id", "owner_manifest_digest", "pointer_digest"],
        "GKX_INGEST_AUTHORITY_LOCK_TARGET_FIELDS_INVALID");
      const inner = sealActiveProjectionCoordinate(rawTarget.inner);
      if (typeof rawTarget.owner_generation_id !== "string" || !OWNER_GENERATION_ID_RE.test(rawTarget.owner_generation_id) ||
          typeof rawTarget.owner_manifest_digest !== "string" || !SHA256_RE.test(rawTarget.owner_manifest_digest) ||
          rawTarget.owner_generation_id !== `ingest:${rawTarget.owner_manifest_digest.slice("sha256:".length, "sha256:".length + 24)}` ||
          typeof rawTarget.pointer_digest !== "string" || !SHA256_RE.test(rawTarget.pointer_digest) ||
          rawTarget.pointer_digest !== derivedActivePointerDigest(rawTarget.owner_generation_id, rawTarget.owner_manifest_digest, inner)) {
        throw new TypeError("GKX_INGEST_AUTHORITY_LOCK_ACTIVATION_TARGET_INVALID");
      }
      rawTarget.inner = inner;
      target = rawTarget as unknown as Extract<IngestAuthorityLock["target"], { kind: "activation" }>;
    } else if (rawTarget.kind === "blocked") {
      exactKeys(rawTarget, ["kind", "status_digest"], "GKX_INGEST_AUTHORITY_LOCK_TARGET_FIELDS_INVALID");
      if (typeof rawTarget.status_digest !== "string" || !SHA256_RE.test(rawTarget.status_digest)) {
        throw new TypeError("GKX_INGEST_AUTHORITY_LOCK_BLOCKED_TARGET_INVALID");
      }
      target = rawTarget as unknown as Extract<IngestAuthorityLock["target"], { kind: "blocked" }>;
    } else throw new TypeError("GKX_INGEST_AUTHORITY_LOCK_TARGET_KIND_INVALID");
  }
  if (inert.contract_version !== INGEST_AUTHORITY_LOCK_CONTRACT_VERSION ||
      typeof inert.lock_id !== "string" || !SHA256_RE.test(inert.lock_id) ||
      !Number.isSafeInteger(inert.process_id) || (inert.process_id as number) <= 0 ||
      (inert.operation !== "preflight" && inert.operation !== "activation" && inert.operation !== "blocked") ||
      (inert.operation === "preflight" ? target !== null : target?.kind !== inert.operation) ||
      typeof inert.prior_authority_digest !== "string" || !SHA256_RE.test(inert.prior_authority_digest) ||
      typeof inert.lock_digest !== "string" || !SHA256_RE.test(inert.lock_digest)) {
    throw new TypeError("GKX_INGEST_AUTHORITY_LOCK_SHAPE_INVALID");
  }
  const sealed: IngestAuthorityLock = {
    contract_version: INGEST_AUTHORITY_LOCK_CONTRACT_VERSION,
    lock_id: inert.lock_id,
    process_id: inert.process_id,
    prior_active: prior,
    prior_authority_digest: inert.prior_authority_digest,
    operation: inert.operation,
    target,
    lock_digest: inert.lock_digest,
  } as IngestAuthorityLock;
  if (digestMaterial(sealed as unknown as Record<string, unknown>, ["lock_digest"]) !== sealed.lock_digest) {
    throw new TypeError("GKX_INGEST_AUTHORITY_LOCK_DIGEST_INVALID");
  }
  return deepFreeze(sealed);
}

function verifyUnboundRejectionJournal(value: unknown, name: string): void {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_REJECTION_JOURNAL_INVALID");
  const journal = sealIngestRejectionJournalEnvelope(inert, inert.normalized_profile);
  if (name !== `ingest-rejections-${journal.rejection_journal_digest.slice("sha256:".length)}.json`) {
    throw new Error("GKX_INGEST_REJECTION_JOURNAL_NAMESPACE_INVALID");
  }
}

function verifyOwnerBundle(
  directory: string,
  manifest: IngestOwnerGenerationManifest,
  onAfterDatabaseSnapshot?: (database_path: string) => void,
): void {
  const journalPath = join(directory, manifest.rejection_journal.journal_file);
  const journalRead = readCanonicalJson<unknown>(journalPath, directory, MAX_OWNER_JSON_BYTES,
    "GKX_INGEST_REJECTION_JOURNAL");
  const journal = sealIngestRejectionJournalEnvelope(journalRead.value, manifest.normalized_profile);
  if (journalRead.digest !== retrievalSha256(canonicalBytes(journal)) ||
      journal.rejection_journal_digest !== manifest.rejection_journal.rejection_journal_digest ||
      journal.observation_snapshot_digest !== manifest.observation_snapshot_digest ||
      !sameJson(journal.profile, manifest.profile) || !sameJson(journal.rejections, manifest.validation_result.rejections)) {
    throw new Error("GKX_INGEST_REJECTION_JOURNAL_MANIFEST_MISMATCH");
  }
  const databasePath = join(directory, manifest.inner.database_file);
  assertPlainContainedFile(databasePath, directory);
  const store = openSealedStateDatabase(
    databasePath,
    directory,
    "GKX_INGEST_INNER_DATABASE",
    onAfterDatabaseSnapshot,
  );
  try {
    if (!sameJson(store.manifest, manifest.inner.manifest)) {
      throw new Error("GKX_INGEST_INNER_DATABASE_MANIFEST_MISMATCH");
    }
    const expectedSources = manifest.validation_result.observations
      .filter((observation) => observation.classification === "accepted")
      .map((observation) => ({ source_path: observation.source_path, source_digest: observation.source_digest }))
      .sort((left, right) => retrievalCodeUnitCompare(left.source_path, right.source_path) ||
        retrievalCodeUnitCompare(left.source_digest ?? "", right.source_digest ?? ""));
    const storedSources = store.listCandidateSources()
      .map((source) => ({ source_path: source.source_path, source_digest: source.source_digest }))
      .sort((left, right) => retrievalCodeUnitCompare(left.source_path, right.source_path) ||
        retrievalCodeUnitCompare(left.source_digest, right.source_digest));
    if (!sameJson(storedSources, expectedSources)) {
      throw new Error("GKX_INGEST_INNER_DATABASE_SOURCE_BINDING_MISMATCH");
    }
  } finally { store.close(); }
}

/** Semantic verification for every controlled artifact happens before provider/cache work. */
function verifyArtifactNamespaceEntry(directory: string, name: string, path: string): void {
  if (name === ACTIVE_INGEST_FILE) {
    readActivePointer(directory);
    return;
  }
  if (name === ACTIVE_RETRIEVAL_FILE) {
    const read = readCanonicalJson<Record<string, unknown>>(path, directory, MAX_POINTER_BYTES, "GKX_INGEST_LEGACY_POINTER");
    if (read.value.contract_version === INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION) sealTombstone(read.value);
    else {
      const pointer = sealLegacyPointer(read.value);
      const store = openSealedStateDatabase(join(directory, pointer.database_file), directory, "GKX_INGEST_LEGACY_DATABASE");
      try {
        if (!sameJson(store.manifest, pointer.manifest)) throw new Error("GKX_INGEST_LEGACY_POINTER_MANIFEST_MISMATCH");
      } finally { store.close(); }
    }
    return;
  }
  if (name === AUTHORITY_WITNESS_FILE) { readWitness(directory); return; }
  if (name === ACTIVATION_ROOT_FILE) { readActivationRoot(directory); return; }
  if (name === ATTEMPT_STATUS_FILE) {
    const read = readCanonicalJson<unknown>(path, directory, MAX_POINTER_BYTES, "GKX_INGEST_ATTEMPT_STATUS");
    sealIngestBlockedAttemptStatusEnvelope(read.value);
    return;
  }
  if (/^retrieval-[0-9a-f]{64}\.sqlite$/u.test(name)) {
    const store = openSealedStateDatabase(path, directory, "GKX_INGEST_STATE_DATABASE");
    try {
      if (name !== `retrieval-${store.manifest.projection_digest.slice("sha256:".length)}.sqlite`) {
        throw new Error("GKX_INGEST_INNER_DATABASE_NAMESPACE_INVALID");
      }
    } finally { store.close(); }
    return;
  }
  if (/^ingest-generation-[0-9a-f]{64}\.json$/u.test(name)) {
    const read = readCanonicalJson<unknown>(path, directory, MAX_OWNER_JSON_BYTES, "GKX_INGEST_OWNER_MANIFEST");
    const manifest = sealIngestOwnerGenerationManifestEnvelope(read.value);
    if (name !== `ingest-generation-${manifest.owner_manifest_digest.slice("sha256:".length)}.json`) {
      throw new Error("GKX_INGEST_OWNER_MANIFEST_NAMESPACE_INVALID");
    }
    verifyOwnerBundle(directory, manifest);
    return;
  }
  if (/^ingest-rejections-[0-9a-f]{64}\.json$/u.test(name)) {
    const read = readCanonicalJson<unknown>(path, directory, MAX_OWNER_JSON_BYTES, "GKX_INGEST_REJECTION_JOURNAL");
    verifyUnboundRejectionJournal(read.value, name);
    return;
  }
  if (/^ingest-migration-[0-9a-f]{64}\.json$/u.test(name)) {
    const read = readCanonicalJson<unknown>(path, directory, MAX_POINTER_BYTES, "GKX_INGEST_MIGRATION");
    const migration = sealMigrationRecord(read.value);
    if (name !== `ingest-migration-${migration.migration_digest.slice("sha256:".length)}.json`) {
      throw new Error("GKX_INGEST_MIGRATION_NAMESPACE_INVALID");
    }
  }
}

function authorityLockFor(priorActive: IngestPriorActive, priorAuthorityDigest: string): IngestAuthorityLock {
  const material = {
    contract_version: INGEST_AUTHORITY_LOCK_CONTRACT_VERSION,
    lock_id: `sha256:${randomBytes(32).toString("hex")}`,
    process_id: process.pid,
    prior_active: priorActive,
    prior_authority_digest: priorAuthorityDigest,
    operation: "preflight" as const,
    target: null,
  };
  return sealAuthorityLock({ ...material, lock_digest: retrievalCanonicalDigest(material) });
}

function acquireAuthorityLock(
  directory: string,
  priorActive: IngestPriorActive,
  priorAuthorityDigest: string,
): { lock: IngestAuthorityLock; file_digest: string } {
  const path = join(directory, AUTHORITY_LOCK_FILE);
  assertPlainContainedFile(path, directory);
  const lock = authorityLockFor(priorActive, priorAuthorityDigest);
  const bytes = canonicalBytes(lock);
  try {
    writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("GKX_INGEST_AUTHORITY_LOCKED");
    throw error;
  }
  hardenFile(path);
  syncFile(path);
  syncDirectory(directory);
  return { lock, file_digest: retrievalSha256(bytes) };
}

function readAuthorityLock(directory: string): { lock: IngestAuthorityLock; file_digest: string } {
  const read = readCanonicalJson<unknown>(join(directory, AUTHORITY_LOCK_FILE), directory, MAX_POINTER_BYTES,
    "GKX_INGEST_AUTHORITY_LOCK");
  return { lock: sealAuthorityLock(read.value), file_digest: read.digest };
}

function readRecoveryClaimPair(
  directory: string,
  onDescriptorOpened?: () => void,
): { lock: IngestAuthorityLock; file_digest: string } {
  const lockPath = join(directory, AUTHORITY_LOCK_FILE);
  const claimPath = join(directory, AUTHORITY_RECOVERY_CLAIM_FILE);
  if (!sameCanonicalPath(dirname(lockPath), directory) || !sameCanonicalPath(dirname(claimPath), directory)) {
    throw new Error("GKX_INGEST_STATE_PATH_ESCAPE_REJECTED");
  }
  const lockState = lstatSync(lockPath);
  const claimState = lstatSync(claimPath);
  const sameDevice = lockState.dev === claimState.dev || (process.platform === "win32" && (lockState.dev === 0 || claimState.dev === 0));
  if (!lockState.isFile() || lockState.isSymbolicLink() || !claimState.isFile() || claimState.isSymbolicLink() ||
      lockState.nlink !== 2 || claimState.nlink !== 2 || !sameDevice || lockState.ino !== claimState.ino ||
      lockState.size !== claimState.size || lockState.mtimeMs !== claimState.mtimeMs ||
      lockState.ctimeMs !== claimState.ctimeMs || lockState.size < 1 || lockState.size > MAX_POINTER_BYTES ||
      (process.platform !== "win32" && ((lockState.mode & 0o777) !== 0o600 || (claimState.mode & 0o777) !== 0o600))) {
    throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_CLAIM_INVALID");
  }
  const descriptor = openSync(claimPath, "r");
  try {
    const opened = fstatSync(descriptor);
    const openedSameDevice = opened.dev === claimState.dev ||
      (process.platform === "win32" && (opened.dev === 0 || claimState.dev === 0));
    if (!opened.isFile() || opened.nlink !== 2 || opened.ino !== claimState.ino || !openedSameDevice ||
        opened.size !== claimState.size || opened.mtimeMs !== claimState.mtimeMs ||
        opened.ctimeMs !== claimState.ctimeMs ||
        (process.platform !== "win32" && (opened.mode & 0o777) !== 0o600)) {
      throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_CLAIM_CHANGED");
    }
    onDescriptorOpened?.();
    const bytes = Buffer.alloc(claimState.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, length);
      if (count === 0) break;
      length += count;
    }
    const lockAfter = lstatSync(lockPath);
    const claimAfter = lstatSync(claimPath);
    const openedAfter = fstatSync(descriptor);
    const lockAfterSameDevice = lockAfter.dev === claimState.dev ||
      (process.platform === "win32" && (lockAfter.dev === 0 || claimState.dev === 0));
    const claimAfterSameDevice = claimAfter.dev === claimState.dev ||
      (process.platform === "win32" && (claimAfter.dev === 0 || claimState.dev === 0));
    const openedAfterSameDevice = openedAfter.dev === claimState.dev ||
      (process.platform === "win32" && (openedAfter.dev === 0 || claimState.dev === 0));
    if (length !== claimState.size || lockAfter.nlink !== 2 || claimAfter.nlink !== 2 || openedAfter.nlink !== 2 ||
        lockAfter.ino !== claimState.ino || claimAfter.ino !== claimState.ino || openedAfter.ino !== claimState.ino ||
        !lockAfterSameDevice || !claimAfterSameDevice || !openedAfterSameDevice ||
        lockAfter.size !== claimState.size || claimAfter.size !== claimState.size || openedAfter.size !== claimState.size ||
        lockAfter.mtimeMs !== claimState.mtimeMs || claimAfter.mtimeMs !== claimState.mtimeMs ||
        openedAfter.mtimeMs !== claimState.mtimeMs || lockAfter.ctimeMs !== claimState.ctimeMs ||
        claimAfter.ctimeMs !== claimState.ctimeMs || openedAfter.ctimeMs !== claimState.ctimeMs ||
        (process.platform !== "win32" && ((lockAfter.mode & 0o777) !== 0o600 ||
          (claimAfter.mode & 0o777) !== 0o600 || (openedAfter.mode & 0o777) !== 0o600))) {
      throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_CLAIM_CHANGED");
    }
    let parsed: unknown;
    try { parsed = JSON.parse(FATAL_UTF8.decode(bytes.subarray(0, length))); }
    catch { throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_CLAIM_JSON_INVALID"); }
    if (!bytes.subarray(0, length).equals(canonicalBytes(parsed))) {
      throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_CLAIM_NONCANONICAL");
    }
    return { lock: sealAuthorityLock(parsed), file_digest: retrievalSha256(bytes.subarray(0, length)) };
  } finally { closeSync(descriptor); }
}

function readHeldAuthorityLock(directory: string): { lock: IngestAuthorityLock; file_digest: string } {
  return pathExists(join(directory, AUTHORITY_RECOVERY_CLAIM_FILE))
    ? readRecoveryClaimPair(directory)
    : readAuthorityLock(directory);
}

function readLinkedCanonicalJson(
  finalPath: string,
  temporaryPath: string,
  directory: string,
  maximumBytes: number,
): { value: Record<string, unknown>; digest: string } {
  if (!sameCanonicalPath(dirname(finalPath), directory) || !sameCanonicalPath(dirname(temporaryPath), directory)) {
    throw new Error("GKX_INGEST_STATE_PATH_ESCAPE_REJECTED");
  }
  const finalState = lstatSync(finalPath);
  const temporaryState = lstatSync(temporaryPath);
  const sameDevice = finalState.dev === temporaryState.dev ||
    (process.platform === "win32" && (finalState.dev === 0 || temporaryState.dev === 0));
  if (!finalState.isFile() || finalState.isSymbolicLink() || !temporaryState.isFile() || temporaryState.isSymbolicLink() ||
      finalState.nlink !== 2 || temporaryState.nlink !== 2 || !sameDevice || finalState.ino !== temporaryState.ino ||
      finalState.size !== temporaryState.size || finalState.size < 1 || finalState.size > maximumBytes) {
    throw new Error("GKX_INGEST_IMMUTABLE_LINK_PAIR_INVALID");
  }
  if (process.platform !== "win32" && ((finalState.mode & 0o777) !== 0o600 || (temporaryState.mode & 0o777) !== 0o600)) {
    throw new Error("GKX_INGEST_IMMUTABLE_LINK_PAIR_PERMISSION_INVALID");
  }
  const descriptor = openSync(finalPath, "r");
  try {
    const opened = fstatSync(descriptor);
    const openedSameDevice = opened.dev === finalState.dev ||
      (process.platform === "win32" && (opened.dev === 0 || finalState.dev === 0));
    if (!opened.isFile() || opened.nlink !== 2 || opened.ino !== finalState.ino || !openedSameDevice ||
        opened.size !== finalState.size || opened.mtimeMs !== finalState.mtimeMs || opened.ctimeMs !== finalState.ctimeMs) {
      throw new Error("GKX_INGEST_IMMUTABLE_LINK_PAIR_CHANGED");
    }
    const bytes = Buffer.alloc(finalState.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, length);
      if (count === 0) break;
      length += count;
    }
    const openedAfter = fstatSync(descriptor);
    const finalAfter = lstatSync(finalPath);
    const temporaryAfter = lstatSync(temporaryPath);
    const openedAfterSameDevice = openedAfter.dev === finalState.dev ||
      (process.platform === "win32" && (openedAfter.dev === 0 || finalState.dev === 0));
    const finalAfterSameDevice = finalAfter.dev === finalState.dev ||
      (process.platform === "win32" && (finalAfter.dev === 0 || finalState.dev === 0));
    const temporaryAfterSameDevice = temporaryAfter.dev === finalState.dev ||
      (process.platform === "win32" && (temporaryAfter.dev === 0 || finalState.dev === 0));
    if (length !== finalState.size || openedAfter.nlink !== 2 || finalAfter.nlink !== 2 || temporaryAfter.nlink !== 2 ||
        openedAfter.ino !== finalState.ino || finalAfter.ino !== finalState.ino || temporaryAfter.ino !== finalState.ino ||
        !openedAfterSameDevice || !finalAfterSameDevice || !temporaryAfterSameDevice ||
        openedAfter.size !== finalState.size || finalAfter.size !== finalState.size || temporaryAfter.size !== finalState.size ||
        openedAfter.mtimeMs !== finalState.mtimeMs || finalAfter.mtimeMs !== finalState.mtimeMs ||
        temporaryAfter.mtimeMs !== finalState.mtimeMs || openedAfter.ctimeMs !== finalState.ctimeMs ||
        finalAfter.ctimeMs !== finalState.ctimeMs || temporaryAfter.ctimeMs !== finalState.ctimeMs) {
      throw new Error("GKX_INGEST_IMMUTABLE_LINK_PAIR_CHANGED");
    }
    let value: unknown;
    try { value = JSON.parse(FATAL_UTF8.decode(bytes.subarray(0, length))); }
    catch { throw new Error("GKX_INGEST_IMMUTABLE_LINK_PAIR_JSON_INVALID"); }
    if (!bytes.subarray(0, length).equals(canonicalBytes(value)) || value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("GKX_INGEST_IMMUTABLE_LINK_PAIR_NONCANONICAL");
    }
    return { value: value as Record<string, unknown>, digest: retrievalSha256(bytes.subarray(0, length)) };
  } finally { closeSync(descriptor); }
}

function recoverInterruptedArtifactPublications(directory: string): void {
  const entries = readdirSync(directory, { withFileTypes: true });
  if (entries.length > 100_000) throw new Error("GKX_INGEST_STATE_DIRECTORY_ENTRY_LIMIT_EXCEEDED");
  for (const entry of entries) {
    const mutable = /^(ingest-authority\.lock|active-retrieval\.json|active-ingest\.json|ingest-attempt-status\.json)\.\d+(?:\.\d+)?\.tmp$/u.exec(entry.name);
    if (mutable) {
      const temporaryPath = join(directory, entry.name);
      const state = lstatSync(temporaryPath);
      if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1 || state.size < 1 || state.size > MAX_POINTER_BYTES) {
        throw new Error("GKX_INGEST_MUTABLE_TEMP_ALIAS_INVALID");
      }
      if (process.platform !== "win32" && (state.mode & 0o777) !== 0o600) {
        throw new Error("GKX_INGEST_MUTABLE_TEMP_PERMISSION_INVALID");
      }
      const read = readCanonicalJson<Record<string, unknown>>(temporaryPath, directory, MAX_POINTER_BYTES,
        "GKX_INGEST_MUTABLE_TEMP");
      if (mutable[1] === "ingest-authority.lock") sealAuthorityLock(read.value);
      else if (mutable[1] === "active-ingest.json") sealActivePointer(read.value);
      else if (mutable[1] === "ingest-attempt-status.json") sealIngestBlockedAttemptStatusEnvelope(read.value);
      else if (read.value.contract_version === INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION) sealTombstone(read.value);
      else sealLegacyPointer(read.value);
      unlinkSync(temporaryPath);
      continue;
    }
    const match = /^((?:(?:ingest-(?:rejections|generation|migration)-[0-9a-f]{64}|ingest-(?:activation-root|authority))\.json|retrieval-[0-9a-f]{64}\.sqlite))\.\d+(?:\.\d+)?\.tmp$/u.exec(entry.name);
    if (!match) {
      if (controlledArtifactName(entry.name) && !acceptedArtifactName(entry.name)) {
        throw new Error("GKX_INGEST_STATE_ARTIFACT_NAME_INVALID");
      }
      continue;
    }
    const temporaryPath = join(directory, entry.name);
    const finalPath = join(directory, match[1]);
    const temporaryState = lstatSync(temporaryPath);
    if (!temporaryState.isFile() || temporaryState.isSymbolicLink()) throw new Error("GKX_INGEST_IMMUTABLE_TEMP_ALIAS_INVALID");
    if (!pathExists(finalPath)) {
      if (temporaryState.nlink !== 1) throw new Error("GKX_INGEST_IMMUTABLE_TEMP_LINK_INVALID");
      unlinkSync(temporaryPath);
      continue;
    }
    const finalState = lstatSync(finalPath);
    if (temporaryState.nlink === 1 && finalState.ino !== temporaryState.ino) {
      unlinkSync(temporaryPath);
      continue;
    }
    if (basename(finalPath).endsWith(".sqlite")) {
      const sameDevice = finalState.dev === temporaryState.dev ||
        (process.platform === "win32" && (finalState.dev === 0 || temporaryState.dev === 0));
      if (!finalState.isFile() || finalState.isSymbolicLink() || finalState.nlink !== 2 || temporaryState.nlink !== 2 ||
          !sameDevice || finalState.ino !== temporaryState.ino || finalState.size !== temporaryState.size || finalState.size < 1) {
        throw new Error("GKX_INGEST_IMMUTABLE_DATABASE_LINK_PAIR_INVALID");
      }
      if (process.platform !== "win32" && ((finalState.mode & 0o777) !== 0o600 || (temporaryState.mode & 0o777) !== 0o600)) {
        throw new Error("GKX_INGEST_IMMUTABLE_DATABASE_LINK_PAIR_PERMISSION_INVALID");
      }
      unlinkSync(temporaryPath);
      hardenFile(finalPath);
      syncFile(finalPath);
      const store = openSealedStateDatabase(finalPath, directory, "GKX_INGEST_RECOVERED_DATABASE");
      store.close();
      continue;
    }
    const finalName = basename(finalPath);
    const linked = readLinkedCanonicalJson(finalPath, temporaryPath, directory,
      finalName.startsWith("ingest-rejections-") || finalName.startsWith("ingest-generation-")
        ? MAX_OWNER_JSON_BYTES
        : MAX_POINTER_BYTES);
    if (finalName.startsWith("ingest-rejections-")) {
      if (linked.value.rejection_journal_digest !== `sha256:${finalName.slice("ingest-rejections-".length, -".json".length)}`) {
        throw new Error("GKX_INGEST_IMMUTABLE_LINK_PAIR_BINDING_INVALID");
      }
    } else if (finalName.startsWith("ingest-generation-")) {
      if (linked.value.owner_manifest_digest !== `sha256:${finalName.slice("ingest-generation-".length, -".json".length)}`) {
        throw new Error("GKX_INGEST_IMMUTABLE_LINK_PAIR_BINDING_INVALID");
      }
    } else if (finalName.startsWith("ingest-migration-")) {
      if (linked.value.migration_digest !== `sha256:${finalName.slice("ingest-migration-".length, -".json".length)}`) {
        throw new Error("GKX_INGEST_IMMUTABLE_LINK_PAIR_BINDING_INVALID");
      }
    } else if (finalName === ACTIVATION_ROOT_FILE) sealActivationRoot(linked.value);
    else if (finalName === AUTHORITY_WITNESS_FILE) sealWitness(linked.value);
    else throw new Error("GKX_INGEST_IMMUTABLE_LINK_PAIR_PATH_INVALID");
    unlinkSync(temporaryPath);
    hardenFile(finalPath);
    syncFile(finalPath);
  }
  syncDirectory(directory);
}

function assertRecoveryAuthorityLock(directory: string, expected: IngestAuthorityLock): void {
  const current = readHeldAuthorityLock(directory);
  if (!sameJson(current.lock, expected)) throw new Error("GKX_INGEST_AUTHORITY_LOCK_CHANGED");
}

export function sealIngestBlockedAttemptStatusEnvelope(value: unknown): IngestBlockedAttemptStatus {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_ATTEMPT_STATUS_INVALID");
  exactKeys(inert, [
    "attempt_digest", "availability", "contract_version", "effective_profile_digest", "observation_snapshot_digest",
    "prior_active", "state", "status_digest",
  ], "GKX_INGEST_ATTEMPT_STATUS_FIELDS_INVALID");
  const prior = sealPriorActive(inert.prior_active);
  if (inert.contract_version !== INGEST_ATTEMPT_STATUS_CONTRACT_VERSION || inert.state !== "blocked" ||
      inert.availability !== (prior === null ? "unavailable" : "stale") ||
      typeof inert.attempt_digest !== "string" || !SHA256_RE.test(inert.attempt_digest) ||
      typeof inert.effective_profile_digest !== "string" || !SHA256_RE.test(inert.effective_profile_digest) ||
      typeof inert.observation_snapshot_digest !== "string" || !SHA256_RE.test(inert.observation_snapshot_digest) ||
      typeof inert.status_digest !== "string" || !SHA256_RE.test(inert.status_digest)) {
    throw new TypeError("GKX_INGEST_ATTEMPT_STATUS_SHAPE_INVALID");
  }
  const sealed: IngestBlockedAttemptStatus = {
    contract_version: INGEST_ATTEMPT_STATUS_CONTRACT_VERSION,
    state: "blocked",
    availability: inert.availability,
    prior_active: prior,
    attempt_digest: inert.attempt_digest,
    effective_profile_digest: inert.effective_profile_digest,
    observation_snapshot_digest: inert.observation_snapshot_digest,
    status_digest: inert.status_digest,
  } as IngestBlockedAttemptStatus;
  const expectedAttemptDigest = retrievalCanonicalDigest({
    contract_version: "gkos-ingest-attempt/1.0.0-draft.1",
    mode: "strict",
    observation_snapshot_digest: sealed.observation_snapshot_digest,
    effective_profile_digest: sealed.effective_profile_digest,
  });
  if (sealed.attempt_digest !== expectedAttemptDigest) {
    throw new TypeError("GKX_INGEST_ATTEMPT_STATUS_ATTEMPT_DIGEST_INVALID");
  }
  if (digestMaterial(sealed as unknown as Record<string, unknown>, ["status_digest"]) !== sealed.status_digest) {
    throw new TypeError("GKX_INGEST_ATTEMPT_STATUS_DIGEST_INVALID");
  }
  return deepFreeze(sealed);
}

export function sealIngestIndexResultEnvelope(
  value: unknown,
  blockedAttemptStatus?: unknown,
): IngestIndexResult {
  const inert = inertClone<Record<string, unknown>>(value, "GKX_INGEST_INDEX_RESULT_INVALID");
  exactKeys(inert, [
    "active", "blocked_attempt", "contract_version", "mode", "status", "summary",
  ], "GKX_INGEST_INDEX_RESULT_FIELDS_INVALID");
  if (inert.contract_version !== INGEST_INDEX_RESULT_CONTRACT_VERSION ||
      (inert.status !== "published" && inert.status !== "published_with_rejections" &&
        inert.status !== "blocked_strict" && inert.status !== "operational_failure") ||
      (inert.mode !== "strict" && inert.mode !== "non_strict")) {
    throw new TypeError("GKX_INGEST_INDEX_RESULT_SHAPE_INVALID");
  }
  const active = sealPriorActive(inert.active);
  let summary: IngestIndexResult["summary"] = null;
  if (inert.summary !== null) {
    const raw = inertClone<Record<string, unknown>>(inert.summary, "GKX_INGEST_INDEX_RESULT_SUMMARY_INVALID");
    exactKeys(raw, ["findings", "observed_source_count", "rejected_source_count", "valid_source_count"],
      "GKX_INGEST_INDEX_RESULT_SUMMARY_FIELDS_INVALID");
    const counts = inertClone<Record<string, unknown>>(raw.findings, "GKX_INGEST_INDEX_RESULT_SUMMARY_INVALID");
    exactKeys(counts, ["critical", "error", "info", "warning"], "GKX_INGEST_INDEX_RESULT_SUMMARY_FIELDS_INVALID");
    for (const count of [raw.observed_source_count, raw.valid_source_count, raw.rejected_source_count]) {
      if (!Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > 1_000_000) {
        throw new TypeError("GKX_INGEST_INDEX_RESULT_SUMMARY_INVALID");
      }
    }
    for (const count of Object.values(counts)) {
      if (!Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > 1_000_000) {
        throw new TypeError("GKX_INGEST_INDEX_RESULT_SUMMARY_INVALID");
      }
    }
    if (raw.observed_source_count !== (raw.valid_source_count as number) + (raw.rejected_source_count as number)) {
      throw new TypeError("GKX_INGEST_INDEX_RESULT_SUMMARY_INVALID");
    }
    summary = deepFreeze({ ...raw, findings: counts } as unknown as NonNullable<IngestIndexResult["summary"]>);
  }
  let blockedAttempt: IngestIndexResult["blocked_attempt"] = null;
  if (inert.blocked_attempt !== null) {
    const raw = inertClone<Record<string, unknown>>(inert.blocked_attempt, "GKX_INGEST_INDEX_RESULT_BLOCKED_INVALID");
    exactKeys(raw, ["attempt_digest", "status_digest"], "GKX_INGEST_INDEX_RESULT_BLOCKED_FIELDS_INVALID");
    if (typeof raw.attempt_digest !== "string" || !SHA256_RE.test(raw.attempt_digest) ||
        typeof raw.status_digest !== "string" || !SHA256_RE.test(raw.status_digest)) {
      throw new TypeError("GKX_INGEST_INDEX_RESULT_BLOCKED_INVALID");
    }
    blockedAttempt = deepFreeze(raw as unknown as NonNullable<IngestIndexResult["blocked_attempt"]>);
  }
  if (inert.status === "published" || inert.status === "published_with_rejections") {
    if (summary === null || active?.kind !== "ingest" || blockedAttempt !== null ||
        (inert.status === "published") !== (summary.rejected_source_count === 0) ||
        (inert.status === "published_with_rejections" &&
          (inert.mode !== "non_strict" || summary.rejected_source_count < 1))) {
      throw new TypeError("GKX_INGEST_INDEX_RESULT_PUBLICATION_INVALID");
    }
  } else if (inert.status === "blocked_strict") {
    if (summary === null || inert.mode !== "strict" || summary.rejected_source_count < 1 || blockedAttempt === null ||
        blockedAttemptStatus === undefined) {
      throw new TypeError("GKX_INGEST_INDEX_RESULT_BLOCKED_INVALID");
    }
    const status = sealIngestBlockedAttemptStatusEnvelope(blockedAttemptStatus);
    if (!sameJson(active, status.prior_active) || blockedAttempt.attempt_digest !== status.attempt_digest ||
        blockedAttempt.status_digest !== status.status_digest) {
      throw new TypeError("GKX_INGEST_INDEX_RESULT_BLOCKED_INVALID");
    }
  } else if (summary !== null || active !== null || blockedAttempt !== null) {
    // Operational execution failures are deliberately generic and path-free;
    // no unverified partial validation/publication envelope may be reported.
    throw new TypeError("GKX_INGEST_INDEX_RESULT_OPERATIONAL_INVALID");
  }
  return deepFreeze({
    contract_version: INGEST_INDEX_RESULT_CONTRACT_VERSION,
    status: inert.status,
    mode: inert.mode,
    summary,
    active,
    blocked_attempt: blockedAttempt,
  } as IngestIndexResult);
}

function readLegacyActive(directory: string): {
  pointer: { database_file: string; manifest: AnyRetrievalProjectionManifest };
  digest: string;
  database_path: string;
} | null {
  const path = join(directory, ACTIVE_RETRIEVAL_FILE);
  if (!pathExists(path)) return null;
  const read = readCanonicalJson<unknown>(path, directory, MAX_POINTER_BYTES, "GKX_INGEST_LEGACY_POINTER");
  const raw = inertClone<Record<string, unknown>>(read.value, "GKX_INGEST_LEGACY_POINTER_INVALID");
  if (raw.contract_version === INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION) {
    throw new Error("GKX_INGEST_LEGACY_TOMBSTONE_WITHOUT_AUTHORITY_WITNESS");
  }
  const pointer = sealLegacyPointer(raw);
  const databasePath = join(directory, pointer.database_file);
  assertPlainContainedFile(databasePath, directory);
  const store = openSealedStateDatabase(databasePath, directory, "GKX_INGEST_LEGACY_DATABASE");
  try {
    if (!sameJson(store.manifest, pointer.manifest) || !sameCanonicalPath(store.database_path, databasePath)) {
      throw new Error("GKX_INGEST_LEGACY_POINTER_VERIFICATION_FAILED");
    }
  } finally { store.close(); }
  return { pointer, digest: read.digest, database_path: databasePath };
}

function readOwnerManifest(
  directory: string,
  pointer: IngestActivePointer,
  onAfterDatabaseSnapshot?: (database_path: string) => void,
): IngestOwnerGenerationManifest {
  const path = join(directory, pointer.owner_generation_file);
  const read = readCanonicalJson<unknown>(path, directory, MAX_OWNER_JSON_BYTES, "GKX_INGEST_OWNER_MANIFEST");
  const manifest = sealIngestOwnerGenerationManifestEnvelope(read.value);
  if (manifest.owner_generation_id !== pointer.owner_generation_id || manifest.owner_manifest_digest !== pointer.owner_manifest_digest ||
      !sameJson(activeProjectionFor(manifest), pointer.inner)) {
    throw new Error("GKX_INGEST_ACTIVE_POINTER_MANIFEST_MISMATCH");
  }
  verifyOwnerBundle(directory, manifest, onAfterDatabaseSnapshot);
  return manifest;
}

function readActivePointer(
  directory: string,
  onAfterDatabaseSnapshot?: (database_path: string) => void,
): { pointer: IngestActivePointer; digest: string; manifest: IngestOwnerGenerationManifest } {
  const path = join(directory, ACTIVE_INGEST_FILE);
  const read = readCanonicalJson<unknown>(path, directory, MAX_POINTER_BYTES, "GKX_INGEST_ACTIVE_POINTER");
  const pointer = sealActivePointer(read.value);
  return { pointer, digest: read.digest, manifest: readOwnerManifest(directory, pointer, onAfterDatabaseSnapshot) };
}

function openProjectionFromActivePointer(directory: string): SqliteRetrievalStore {
  const read = readCanonicalJson<unknown>(join(directory, ACTIVE_INGEST_FILE), directory, MAX_POINTER_BYTES,
    "GKX_INGEST_ACTIVE_POINTER");
  const pointer = sealActivePointer(read.value);
  const databasePath = join(directory, pointer.inner.database_file);
  assertPlainContainedFile(databasePath, directory);
  const store = openSealedStateDatabase(databasePath, directory, "GKX_INGEST_ACTIVE_DATABASE");
  if (!isGkxRetrievalProjectionManifest(store.manifest) ||
      retrievalCanonicalDigest(store.manifest) !== pointer.inner.manifest_digest ||
      store.manifest.projection_id !== pointer.inner.projection_id ||
      store.manifest.projection_digest !== pointer.inner.projection_digest) {
    store.close();
    throw new Error("GKX_INGEST_ACTIVE_PROJECTION_MISMATCH");
  }
  return store;
}

/**
 * Ordinary retrieval resolver. It verifies only the durable migration
 * authority, the public-safe inner pointer coordinate, and the selected DB.
 * It never loads the owner manifest, rejection journal, or attempt status.
 */
function hasActivatedRetrievalAuthority(directory: string): boolean {
  assertCanonicalStateAuthorityNames(directory);
  const witnessPath = join(directory, AUTHORITY_WITNESS_FILE);
  const pointerPath = join(directory, ACTIVE_INGEST_FILE);
  const rootPath = join(directory, ACTIVATION_ROOT_FILE);
  const legacyPath = join(directory, ACTIVE_RETRIEVAL_FILE);
  if (!pathExists(witnessPath)) {
    let tombstoneEvidence = false;
    if (pathExists(legacyPath)) {
      if (lstatSync(legacyPath).size > MAX_POINTER_BYTES) throw new Error("RETRIEVAL_POINTER_SIZE_EXCEEDED");
      const probe = readCanonicalJson<Record<string, unknown>>(legacyPath, directory, MAX_POINTER_BYTES,
        "GKX_INGEST_SEARCH_LEGACY_PROBE");
      tombstoneEvidence = probe.value.contract_version === INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION;
    }
    if (pathExists(pointerPath) || pathExists(rootPath) || tombstoneEvidence) {
      throw new Error("GKX_INGEST_AUTHORITY_WITNESS_MISSING");
    }
    return false;
  }
  const witness = readWitness(directory);
  if (witness.state === "activating") throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_REQUIRED");
  if (witness.state !== "active") throw new Error("GKX_INGEST_AUTHORITY_WITNESS_STATE_INVALID");
  verifyWitnessAuthorityHistory(directory, witness);
  if (!pathExists(pointerPath)) throw new Error("GKX_INGEST_ACTIVE_POINTER_MISSING");
  return true;
}

/** Host-owned discriminator used by ordinary CLI retrieval before any legacy write. */
export function hasActivatedIngestRetrievalAuthority(stateDirectory: string): boolean {
  const directory = existingStateDirectory(stateDirectory);
  return directory === null ? false : hasActivatedRetrievalAuthority(directory);
}

/**
 * Host-owned CLI routing predicate. A first-ever strict block has no outer
 * pointer yet, but the controlled status artifact still forbids legacy
 * auto-reindexing. This routine validates only filesystem metadata for that
 * owner artifact; the ordinary resolver never reads or exposes its bytes.
 */
export function shouldOpenExistingIngestRetrievalAuthority(stateDirectory: string): boolean {
  const directory = existingStateDirectory(stateDirectory);
  if (directory === null) return false;
  if (hasActivatedRetrievalAuthority(directory)) return true;
  const statusPath = join(directory, ATTEMPT_STATUS_FILE);
  if (!pathExists(statusPath)) return false;
  // Public routing intentionally never opens, hashes, parses, or evaluates
  // the owner-only attempt status. Its exact controlled basename and sealed
  // filesystem metadata are sufficient to permanently suppress legacy
  // auto-reindexing; applicability remains an owner-plane concern.
  assertPlainContainedFile(statusPath, directory);
  const state = lstatSync(statusPath);
  if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1 || !Number.isSafeInteger(state.size) ||
      state.size < 1 || state.size > MAX_POINTER_BYTES ||
      (process.platform !== "win32" && (state.mode & 0o777) !== 0o600)) {
    throw new Error("GKX_INGEST_ATTEMPT_STATUS_ROUTE_INVALID");
  }
  return true;
}

export function openIngestAwareActiveRetrievalStore(stateDirectory: string): SqliteRetrievalStore {
  const directory = existingStateDirectory(stateDirectory);
  if (!directory) throw new Error("RETRIEVAL_ACTIVE_POINTER_MISSING");
  if (!hasActivatedRetrievalAuthority(directory)) {
    const legacy = readLegacyActive(directory);
    if (!legacy) throw new Error("RETRIEVAL_ACTIVE_POINTER_MISSING");
    const store = openSealedStateDatabase(legacy.database_path, directory, "GKX_INGEST_LEGACY_DATABASE");
    if (!sameJson(store.manifest, legacy.pointer.manifest)) {
      store.close();
      throw new Error("RETRIEVAL_POINTER_MANIFEST_MISMATCH");
    }
    return store;
  }
  return openProjectionFromActivePointer(directory);
}

function readMigration(directory: string, file: string, expectedDigest: string): IngestMigrationRecord {
  if (basename(file) !== file || file !== `ingest-migration-${expectedDigest.slice("sha256:".length)}.json`) {
    throw new Error("GKX_INGEST_MIGRATION_PATH_INVALID");
  }
  const read = readCanonicalJson<unknown>(join(directory, file), directory, MAX_POINTER_BYTES, "GKX_INGEST_MIGRATION");
  const migration = sealMigrationRecord(read.value);
  if (migration.migration_digest !== expectedDigest) throw new Error("GKX_INGEST_MIGRATION_BINDING_INVALID");
  return migration;
}

function verifyTombstone(directory: string, witness: IngestAuthorityWitness): IngestLegacyPointerTombstone {
  const read = readCanonicalJson<unknown>(join(directory, ACTIVE_RETRIEVAL_FILE), directory, MAX_POINTER_BYTES,
    "GKX_INGEST_LEGACY_TOMBSTONE");
  const tombstone = sealTombstone(read.value);
  if (tombstone.tombstone_digest !== witness.tombstone_digest || tombstone.migration_digest !== witness.migration_digest ||
      tombstone.target_owner_generation_id !== witness.first_owner_generation_id ||
      tombstone.target_owner_manifest_digest !== witness.first_owner_manifest_digest) {
    throw new Error("GKX_INGEST_LEGACY_TOMBSTONE_BINDING_INVALID");
  }
  return tombstone;
}

function readWitness(directory: string): IngestAuthorityWitness {
  const read = readCanonicalJson<unknown>(join(directory, AUTHORITY_WITNESS_FILE), directory, MAX_POINTER_BYTES,
    "GKX_INGEST_AUTHORITY_WITNESS");
  return sealWitness(read.value);
}

function readActivationRoot(directory: string): IngestActivationRoot {
  const read = readCanonicalJson<unknown>(join(directory, ACTIVATION_ROOT_FILE), directory, MAX_POINTER_BYTES,
    "GKX_INGEST_ACTIVATION_ROOT");
  return sealActivationRoot(read.value);
}

function verifyWitnessAuthorityHistory(directory: string, witness: IngestAuthorityWitness): {
  migration: IngestMigrationRecord;
  firstPointer: IngestActivePointer;
  tombstone: IngestLegacyPointerTombstone;
} {
  const migration = readMigration(directory, witness.migration_file, witness.migration_digest);
  if (migration.legacy_pointer_digest !== witness.legacy_pointer_digest ||
      migration.target_owner_generation_id !== witness.first_owner_generation_id ||
      migration.target_owner_manifest_digest !== witness.first_owner_manifest_digest) {
    throw new Error("GKX_INGEST_AUTHORITY_WITNESS_MIGRATION_MISMATCH");
  }
  const firstPointer = sealActivePointer({
    contract_version: INGEST_ACTIVE_POINTER_CONTRACT_VERSION,
    inner: witness.first_inner,
    owner_generation_file: `ingest-generation-${witness.first_owner_manifest_digest.slice("sha256:".length)}.json`,
    owner_generation_id: witness.first_owner_generation_id,
    owner_manifest_digest: witness.first_owner_manifest_digest,
  });
  if (rawCanonicalDigest(firstPointer) !== witness.active_pointer_digest) {
    throw new Error("GKX_INGEST_AUTHORITY_WITNESS_POINTER_MISMATCH");
  }
  const root = readActivationRoot(directory);
  if (root.activation_root_digest !== witness.activation_root_digest ||
      root.first_owner_generation_id !== witness.first_owner_generation_id ||
      root.first_owner_manifest_digest !== witness.first_owner_manifest_digest ||
      !sameJson(root.first_inner, witness.first_inner) ||
      root.migration_digest !== witness.migration_digest || root.migration_file !== witness.migration_file ||
      root.legacy_pointer_digest !== witness.legacy_pointer_digest || root.tombstone_digest !== witness.tombstone_digest ||
      root.active_pointer_digest !== witness.active_pointer_digest || root.authority_lock_digest !== witness.authority_lock_digest) {
    throw new Error("GKX_INGEST_AUTHORITY_WITNESS_ROOT_MISMATCH");
  }
  const tombstone = verifyTombstone(directory, witness);
  return { migration, firstPointer, tombstone };
}

function verifyWitnessHistory(directory: string, witness: IngestAuthorityWitness): {
  migration: IngestMigrationRecord;
  firstPointer: IngestActivePointer;
  firstManifest: IngestOwnerGenerationManifest;
  tombstone: IngestLegacyPointerTombstone;
} {
  const history = verifyWitnessAuthorityHistory(directory, witness);
  return { ...history, firstManifest: readOwnerManifest(directory, history.firstPointer) };
}

function recoverActivatingAuthority(
  directory: string,
  witness: IngestAuthorityWitness,
  authorityLock: IngestAuthorityLock,
): IngestAuthorityWitness {
  if (witness.state !== "activating") return witness;
  if (witness.authority_lock_digest !== authorityLock.lock_digest) {
    throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_LOCK_MISMATCH");
  }
  assertRecoveryAuthorityLock(directory, authorityLock);
  const activationRoot = readActivationRoot(directory);
  if (activationRoot.activation_root_digest !== witness.activation_root_digest ||
      activationRoot.authority_lock_digest !== witness.authority_lock_digest ||
      activationRoot.active_pointer_digest !== witness.active_pointer_digest ||
      activationRoot.migration_digest !== witness.migration_digest ||
      activationRoot.tombstone_digest !== witness.tombstone_digest) {
    throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_ROOT_MISMATCH");
  }
  const migration = readMigration(directory, witness.migration_file, witness.migration_digest);
  if (migration.legacy_pointer_digest !== witness.legacy_pointer_digest ||
      migration.target_owner_generation_id !== witness.first_owner_generation_id ||
      migration.target_owner_manifest_digest !== witness.first_owner_manifest_digest) {
    throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_MIGRATION_MISMATCH");
  }
  const firstPointer = sealActivePointer({
    contract_version: INGEST_ACTIVE_POINTER_CONTRACT_VERSION,
    inner: witness.first_inner,
    owner_generation_file: `ingest-generation-${witness.first_owner_manifest_digest.slice("sha256:".length)}.json`,
    owner_generation_id: witness.first_owner_generation_id,
    owner_manifest_digest: witness.first_owner_manifest_digest,
  });
  if (rawCanonicalDigest(firstPointer) !== witness.active_pointer_digest) {
    throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_POINTER_BINDING_INVALID");
  }
  readOwnerManifest(directory, firstPointer);
  const tombstone = sealTombstone({
    contract_version: INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION,
    target_owner_generation_id: witness.first_owner_generation_id,
    target_owner_manifest_digest: witness.first_owner_manifest_digest,
    migration_file: witness.migration_file,
    migration_digest: witness.migration_digest,
    tombstone_digest: witness.tombstone_digest,
  });
  const legacyPath = join(directory, ACTIVE_RETRIEVAL_FILE);
  if (pathExists(legacyPath)) {
    const current = readCanonicalJson<unknown>(legacyPath, directory, MAX_POINTER_BYTES, "GKX_INGEST_RECOVERY_LEGACY_POINTER");
    const currentRecord = inertClone<Record<string, unknown>>(current.value, "GKX_INGEST_RECOVERY_LEGACY_POINTER_INVALID");
    if (currentRecord.contract_version === INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION) {
      if (!sameJson(sealTombstone(currentRecord), tombstone)) throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_TOMBSTONE_MISMATCH");
    } else if (witness.legacy_pointer_digest === null || current.digest !== witness.legacy_pointer_digest ||
        !sameJson(sealLegacyPointer(currentRecord), migration.legacy_pointer)) {
      throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_LEGACY_MISMATCH");
    } else {
      assertRecoveryAuthorityLock(directory, authorityLock);
      replaceCanonicalJson(legacyPath, directory, tombstone);
    }
  } else if (witness.legacy_pointer_digest !== null) {
    throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_LEGACY_MISSING");
  } else {
    assertRecoveryAuthorityLock(directory, authorityLock);
    replaceCanonicalJson(legacyPath, directory, tombstone);
  }
  const pointerPath = join(directory, ACTIVE_INGEST_FILE);
  if (pathExists(pointerPath)) {
    const current = readCanonicalJson<unknown>(pointerPath, directory, MAX_POINTER_BYTES, "GKX_INGEST_RECOVERY_ACTIVE_POINTER");
    if (current.digest !== witness.active_pointer_digest || !sameJson(sealActivePointer(current.value), firstPointer)) {
      throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_POINTER_MISMATCH");
    }
  } else {
    assertRecoveryAuthorityLock(directory, authorityLock);
    replaceCanonicalJson(pointerPath, directory, firstPointer);
  }
  const activeWitness = witnessFor("active", firstManifestFromPointer(directory, firstPointer), migration, tombstone, firstPointer,
    witness.authority_lock_digest);
  assertRecoveryAuthorityLock(directory, authorityLock);
  replaceCanonicalJson(join(directory, AUTHORITY_WITNESS_FILE), directory, activeWitness);
  return activeWitness;
}

function firstManifestFromPointer(directory: string, pointer: IngestActivePointer): IngestOwnerGenerationManifest {
  return readOwnerManifest(directory, pointer);
}

function activationPointerFromLock(lock: IngestAuthorityLock): IngestActivePointer {
  if (lock.operation !== "activation" || lock.target?.kind !== "activation") {
    throw new Error("GKX_INGEST_AUTHORITY_LOCK_ACTIVATION_TARGET_MISSING");
  }
  const pointer = sealActivePointer({
    contract_version: INGEST_ACTIVE_POINTER_CONTRACT_VERSION,
    inner: lock.target.inner,
    owner_generation_file: `ingest-generation-${lock.target.owner_manifest_digest.slice("sha256:".length)}.json`,
    owner_generation_id: lock.target.owner_generation_id,
    owner_manifest_digest: lock.target.owner_manifest_digest,
  });
  if (rawCanonicalDigest(pointer) !== lock.target.pointer_digest) {
    throw new Error("GKX_INGEST_AUTHORITY_LOCK_ACTIVATION_POINTER_INVALID");
  }
  return pointer;
}

function assertMigrationPriorBinding(migration: IngestMigrationRecord, prior: IngestPriorActive): void {
  if (prior === null) {
    if (migration.legacy_pointer !== null || migration.legacy_pointer_digest !== null) {
      throw new Error("GKX_INGEST_MIGRATION_PRIOR_ACTIVE_MISMATCH");
    }
    return;
  }
  if (prior.kind !== "legacy" || migration.legacy_pointer === null ||
      migration.legacy_pointer_digest !== prior.pointer_digest ||
      migration.legacy_pointer.manifest.projection_id !== prior.projection_id ||
      migration.legacy_pointer.manifest.projection_digest !== prior.projection_digest) {
    throw new Error("GKX_INGEST_MIGRATION_PRIOR_ACTIVE_MISMATCH");
  }
}

function completeBoundActivationIntent(directory: string, lock: IngestAuthorityLock): void {
  const pointer = activationPointerFromLock(lock);
  const manifest = readOwnerManifest(directory, pointer);
  const activePath = join(directory, ACTIVE_INGEST_FILE);
  const witnessPath = join(directory, AUTHORITY_WITNESS_FILE);

  if (lock.prior_active?.kind === "ingest") {
    if (!pathExists(witnessPath)) throw new Error("GKX_INGEST_AUTHORITY_WITNESS_MISSING");
    const witness = readWitness(directory);
    if (witness.state !== "active") throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_UNRELATED_WITNESS");
    verifyWitnessHistory(directory, witness);
    const opened = readActivePointer(directory);
    const openedCoordinate: IngestPriorActive = {
      kind: "ingest",
      owner_generation_id: opened.pointer.owner_generation_id,
      owner_manifest_digest: opened.pointer.owner_manifest_digest,
      inner: opened.pointer.inner,
      pointer_digest: opened.digest,
    };
    if (sameJson(openedCoordinate, lock.prior_active)) {
      assertRecoveryAuthorityLock(directory, lock);
      replaceCanonicalJson(activePath, directory, pointer);
    } else if (!sameJson(openedCoordinate, {
      kind: "ingest",
      owner_generation_id: pointer.owner_generation_id,
      owner_manifest_digest: pointer.owner_manifest_digest,
      inner: pointer.inner,
      pointer_digest: rawCanonicalDigest(pointer),
    })) throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_TARGET_MISMATCH");
    return;
  }

  if (pathExists(witnessPath)) {
    let witness = readWitness(directory);
    if (witness.authority_lock_digest !== lock.lock_digest) {
      throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_LOCK_MISMATCH");
    }
    if (witness.state === "activating") witness = recoverActivatingAuthority(directory, witness, lock);
    if (witness.state !== "active") throw new Error("GKX_INGEST_AUTHORITY_WITNESS_STATE_INVALID");
    verifyWitnessHistory(directory, witness);
    const opened = readActivePointer(directory);
    if (!sameJson(opened.pointer, pointer) || opened.digest !== rawCanonicalDigest(pointer)) {
      throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_TARGET_MISMATCH");
    }
    return;
  }

  const committedRoot = readActivationRoot(directory);
  if (committedRoot.first_owner_generation_id !== manifest.owner_generation_id ||
      committedRoot.first_owner_manifest_digest !== manifest.owner_manifest_digest ||
      committedRoot.active_pointer_digest !== rawCanonicalDigest(pointer) ||
      committedRoot.authority_lock_digest !== lock.lock_digest) {
    throw new Error("GKX_INGEST_ACTIVATION_ROOT_TARGET_MISMATCH");
  }
  const migration = readMigration(directory, committedRoot.migration_file, committedRoot.migration_digest);
  assertMigrationPriorBinding(migration, lock.prior_active);
  const legacyPath = join(directory, ACTIVE_RETRIEVAL_FILE);

  const tombstone = tombstoneFor(manifest, migration);
  const root = activationRootFor(manifest, migration, tombstone, pointer, lock.lock_digest);
  if (!pathExists(join(directory, ACTIVATION_ROOT_FILE)) || !sameJson(readActivationRoot(directory), root)) {
    throw new Error("GKX_INGEST_ACTIVATION_ROOT_NOT_REACHED");
  }
  const activating = witnessFor("activating", manifest, migration, tombstone, pointer, lock.lock_digest);
  const active = witnessFor("active", manifest, migration, tombstone, pointer, lock.lock_digest);
  publishImmutableJson(witnessPath, directory, activating);
  assertRecoveryAuthorityLock(directory, lock);
  if (pathExists(legacyPath)) {
    const raw = readCanonicalJson<Record<string, unknown>>(legacyPath, directory, MAX_POINTER_BYTES, "GKX_INGEST_RECOVERY_LEGACY_POINTER");
    if (raw.value.contract_version === INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION) {
      if (!sameJson(sealTombstone(raw.value), tombstone)) throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_TOMBSTONE_MISMATCH");
    } else {
      const priorLegacy = sealLegacyPointer(raw.value);
      if (migration.legacy_pointer_digest === null || raw.digest !== migration.legacy_pointer_digest ||
          !sameJson(priorLegacy, migration.legacy_pointer)) throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_LEGACY_MISMATCH");
      replaceCanonicalJson(legacyPath, directory, tombstone);
    }
  } else {
    if (migration.legacy_pointer_digest !== null) throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_LEGACY_MISSING");
    replaceCanonicalJson(legacyPath, directory, tombstone);
  }
  assertRecoveryAuthorityLock(directory, lock);
  if (pathExists(activePath)) {
    const opened = readActivePointer(directory);
    if (!sameJson(opened.pointer, pointer) || opened.digest !== rawCanonicalDigest(pointer)) {
      throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_TARGET_MISMATCH");
    }
  } else replaceCanonicalJson(activePath, directory, pointer);
  assertRecoveryAuthorityLock(directory, lock);
  replaceCanonicalJson(witnessPath, directory, active);
}

function readAttemptStatus(
  directory: string,
  active: IngestPriorActive,
): { status: IngestBlockedAttemptStatus; applicable: boolean } | null {
  const path = join(directory, ATTEMPT_STATUS_FILE);
  if (!pathExists(path)) return null;
  const read = readCanonicalJson<unknown>(path, directory, MAX_POINTER_BYTES, "GKX_INGEST_ATTEMPT_STATUS");
  const status = sealIngestBlockedAttemptStatusEnvelope(read.value);
  return deepFreeze({ status, applicable: sameJson(status.prior_active, active) });
}

function currentActive(
  directory: string,
  recoveryLock?: IngestAuthorityLock,
  onAfterDatabaseSnapshot?: (database_path: string) => void,
): IngestOpenedGeneration | null {
  assertCanonicalStateAuthorityNames(directory);
  const witnessPath = join(directory, AUTHORITY_WITNESS_FILE);
  const tombstonePath = join(directory, ACTIVE_RETRIEVAL_FILE);
  const pointerPath = join(directory, ACTIVE_INGEST_FILE);
  const witnessExists = pathExists(witnessPath);
  const activationRootExists = pathExists(join(directory, ACTIVATION_ROOT_FILE));
  const pointerExists = pathExists(pointerPath);
  let tombstoneEvidence = false;
  if (pathExists(tombstonePath)) {
    const read = readCanonicalJson<Record<string, unknown>>(tombstonePath, directory, MAX_POINTER_BYTES, "GKX_INGEST_AUTHORITY_PROBE");
    tombstoneEvidence = read.value.contract_version === INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION;
  }
  if (!witnessExists) {
    if (pointerExists || tombstoneEvidence || activationRootExists) {
      throw new Error("GKX_INGEST_AUTHORITY_WITNESS_MISSING");
    }
    const legacy = readLegacyActive(directory);
    if (!legacy) return null;
    const active = deepFreeze({
      kind: "legacy" as const,
      projection_id: legacy.pointer.manifest.projection_id,
      projection_digest: legacy.pointer.manifest.projection_digest,
      pointer_digest: legacy.digest,
    });
    return deepFreeze({
      source: "legacy" as const,
      database_path: legacy.database_path,
      active,
      owner_manifest: null,
      blocked_attempt: readAttemptStatus(directory, active),
    });
  }
  let witness = readWitness(directory);
  if (witness.state === "activating") {
    if (!recoveryLock) throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_REQUIRED");
    witness = recoverActivatingAuthority(directory, witness, recoveryLock);
  }
  if (witness.state !== "active") throw new Error("GKX_INGEST_AUTHORITY_WITNESS_STATE_INVALID");
  verifyWitnessHistory(directory, witness);
  if (!pathExists(pointerPath)) throw new Error("GKX_INGEST_ACTIVE_POINTER_MISSING");
  const opened = readActivePointer(directory, onAfterDatabaseSnapshot);
  const active = deepFreeze({
    kind: "ingest" as const,
    owner_generation_id: opened.pointer.owner_generation_id,
    owner_manifest_digest: opened.pointer.owner_manifest_digest,
    inner: opened.pointer.inner,
    pointer_digest: opened.digest,
  });
  return deepFreeze({
    source: "ingest" as const,
    database_path: join(directory, opened.manifest.inner.database_file),
    active,
    owner_manifest: opened.manifest,
    blocked_attempt: readAttemptStatus(directory, active),
  });
}

function authorityFileDigest(directory: string, file: string): string | null {
  const path = join(directory, file);
  if (!pathExists(path)) return null;
  const read = readCanonicalJson<unknown>(path, directory, MAX_POINTER_BYTES, `GKX_INGEST_AUTHORITY_${file.replace(/[^A-Za-z0-9]/gu, "_")}`);
  if (file === ATTEMPT_STATUS_FILE) sealIngestBlockedAttemptStatusEnvelope(read.value);
  return read.digest;
}

function captureAuthorityDigest(directory: string): string {
  return retrievalCanonicalDigest({
    active_ingest: authorityFileDigest(directory, ACTIVE_INGEST_FILE),
    active_retrieval: authorityFileDigest(directory, ACTIVE_RETRIEVAL_FILE),
    authority_witness: authorityFileDigest(directory, AUTHORITY_WITNESS_FILE),
    attempt_status: authorityFileDigest(directory, ATTEMPT_STATUS_FILE),
  });
}

export function preflightIngestAuthority(
  stateDirectory: string,
  vaultRoot?: IngestVaultRootPreflight,
  options: IngestAuthorityPreflightOptions = {},
): IngestAuthorityPreflight {
  const requested = validateStateDirectory(stateDirectory);
  let boundRoot: VaultRootIdentity | undefined;
  if (vaultRoot !== undefined) {
    boundRoot = revalidateVaultRootPreflight(vaultRoot);
    if (!sameCanonicalPath(requested, boundRoot.state_directory)) {
      throw new Error("GKX_INGEST_VAULT_ROOT_STATE_COORDINATE_MISMATCH");
    }
  }
  const existing = existingStateDirectory(requested);
  const canonical = existing ?? canonicalPathSync(requested, {
    allow_missing: true,
    alias_error: "GKX_INGEST_STATE_ANCESTOR_ALIAS_REJECTED",
  });
  assertNoWatcherCoherentWriter(canonical);
  const namespaceBefore = existing === null
    ? deepFreeze({ entries: [] as ArtifactNamespaceEntry[], digest: retrievalCanonicalDigest([]) })
    : captureArtifactNamespace(existing);
  if (existing !== null && (pathExists(join(existing, AUTHORITY_LOCK_FILE)) ||
      pathExists(join(existing, AUTHORITY_RECOVERY_CLAIM_FILE)))) throw new Error("GKX_INGEST_AUTHORITY_LOCKED");
  if (existing !== null) assertNoLegacyRetrievalWriter(existing);
  const activeBefore = existing === null ? null : currentActive(existing);
  const authorityDigestBefore = existing === null
    ? retrievalCanonicalDigest({ active_ingest: null, active_retrieval: null, authority_witness: null, attempt_status: null })
    : captureAuthorityDigest(existing);
  options.on_before_state_creation?.();
  if (vaultRoot !== undefined) {
    boundRoot = revalidateVaultRootPreflight(vaultRoot);
    if (!sameCanonicalPath(canonical, boundRoot.state_directory)) {
      throw new Error("GKX_INGEST_VAULT_ROOT_STATE_COORDINATE_MISMATCH");
    }
  }
  const directory = ensureStateDirectory(canonical);
  if (vaultRoot !== undefined) revalidateVaultRootPreflight(vaultRoot);
  const held = acquireAuthorityLock(directory, activeBefore?.active ?? null, authorityDigestBefore);
  try {
    // Second half of the two-way legacy/ingest writer handshake. A legacy
    // guard created after the first observation cannot coexist with this lock.
    assertNoLegacyRetrievalWriter(directory);
    assertNoWatcherCoherentWriter(directory);
    const active = currentActive(directory);
    const authorityDigest = captureAuthorityDigest(directory);
    const namespaceSnapshot = captureArtifactNamespace(directory);
    if (authorityDigest !== authorityDigestBefore || !sameJson(active?.active ?? null, activeBefore?.active ?? null) ||
        namespaceSnapshot.digest !== namespaceBefore.digest) {
      throw new Error("GKX_INGEST_AUTHORITY_CHANGED_DURING_LOCK_ACQUISITION");
    }
    const snapshot = deepFreeze({
      state_directory: directory,
      active,
      authority_digest: authorityDigest,
      artifact_namespace_digest: namespaceSnapshot.digest,
    });
    AUTHORITY_PREFLIGHTS.add(snapshot);
    AUTHORITY_LOCKS.set(snapshot, held);
    AUTHORITY_NAMESPACES.set(snapshot, namespaceSnapshot);
    if (vaultRoot !== undefined) AUTHORITY_ROOTS.set(snapshot, vaultRoot);
    return snapshot;
  } catch (error) {
    const current = readAuthorityLock(directory);
    if (current.file_digest === held.file_digest && sameJson(current.lock, held.lock)) {
      unlinkSync(join(directory, AUTHORITY_LOCK_FILE));
      syncDirectory(directory);
    }
    throw error;
  }
}

function assertAuthorityPreflight(value: unknown): asserts value is IngestAuthorityPreflight {
  if (value === null || typeof value !== "object" || !AUTHORITY_PREFLIGHTS.has(value) || !AUTHORITY_LOCKS.has(value) ||
      !AUTHORITY_NAMESPACES.has(value)) {
    throw new TypeError("GKX_INGEST_AUTHORITY_PREFLIGHT_CAPABILITY_INVALID");
  }
}

function revalidateAuthorityPreflight(snapshot: IngestAuthorityPreflight): void {
  assertAuthorityPreflight(snapshot);
  const vaultRoot = AUTHORITY_ROOTS.get(snapshot);
  if (vaultRoot !== undefined) revalidateVaultRootPreflight(vaultRoot);
  assertNoWatcherCoherentWriter(snapshot.state_directory);
  assertNoLegacyRetrievalWriter(snapshot.state_directory);
  const held = AUTHORITY_LOCKS.get(snapshot)!;
  const currentLock = readAuthorityLock(snapshot.state_directory);
  if (currentLock.file_digest !== held.file_digest || !sameJson(currentLock.lock, held.lock)) {
    throw new Error("GKX_INGEST_AUTHORITY_LOCK_CHANGED");
  }
  const existing = existingStateDirectory(snapshot.state_directory);
  const canonical = existing ?? canonicalPathSync(snapshot.state_directory, {
    allow_missing: true,
    alias_error: "GKX_INGEST_STATE_ANCESTOR_ALIAS_REJECTED",
  });
  if (!sameCanonicalPath(canonical, snapshot.state_directory)) throw new Error("GKX_INGEST_AUTHORITY_STATE_COORDINATE_CHANGED");
  const active = existing === null ? null : currentActive(existing);
  const digest = existing === null
    ? retrievalCanonicalDigest({ active_ingest: null, active_retrieval: null, authority_witness: null, attempt_status: null })
    : captureAuthorityDigest(existing);
  const namespaceSnapshot = existing === null
    ? deepFreeze({ entries: [] as ArtifactNamespaceEntry[], digest: retrievalCanonicalDigest([]) })
    : captureArtifactNamespace(existing);
  const expectedNamespace = AUTHORITY_NAMESPACES.get(snapshot)!;
  if (digest !== snapshot.authority_digest || !sameJson(active?.active ?? null, snapshot.active?.active ?? null) ||
      namespaceSnapshot.digest !== expectedNamespace.digest) {
    throw new Error("GKX_INGEST_AUTHORITY_PREFLIGHT_CHANGED");
  }
  const finalLock = readAuthorityLock(snapshot.state_directory);
  if (finalLock.file_digest !== held.file_digest || !sameJson(finalLock.lock, held.lock)) {
    throw new Error("GKX_INGEST_AUTHORITY_LOCK_CHANGED");
  }
  assertNoLegacyRetrievalWriter(snapshot.state_directory);
  assertNoWatcherCoherentWriter(snapshot.state_directory);
}

function assertAuthorityLockUnchanged(snapshot: IngestAuthorityPreflight): void {
  assertAuthorityPreflight(snapshot);
  const held = AUTHORITY_LOCKS.get(snapshot)!;
  const current = readAuthorityLock(snapshot.state_directory);
  if (current.file_digest !== held.file_digest || !sameJson(current.lock, held.lock)) {
    throw new Error("GKX_INGEST_AUTHORITY_LOCK_CHANGED");
  }
}

function advanceArtifactNamespace(snapshot: IngestAuthorityPreflight, allowedPaths: readonly string[]): void {
  assertAuthorityLockUnchanged(snapshot);
  const allowed = new Set(allowedPaths.map((path) => basename(path)));
  const before = AUTHORITY_NAMESPACES.get(snapshot)!;
  const after = captureArtifactNamespace(snapshot.state_directory);
  const beforeByName = new Map(before.entries.map((entry) => [entry.name, entry]));
  const afterByName = new Map(after.entries.map((entry) => [entry.name, entry]));
  const names = new Set([...beforeByName.keys(), ...afterByName.keys()]);
  for (const name of names) {
    if (!sameJson(beforeByName.get(name) ?? null, afterByName.get(name) ?? null) && !allowed.has(name)) {
      throw new Error("GKX_INGEST_STATE_ARTIFACT_NAMESPACE_CHANGED");
    }
  }
  AUTHORITY_NAMESPACES.set(snapshot, after);
}

function bindAuthorityLockIntent(
  snapshot: IngestAuthorityPreflight,
  operation: "activation" | "blocked",
  target: Exclude<IngestAuthorityLock["target"], null>,
): IngestAuthorityLock {
  if (target.kind !== operation) throw new TypeError("GKX_INGEST_AUTHORITY_LOCK_INTENT_KIND_INVALID");
  revalidateAuthorityPreflight(snapshot);
  const held = AUTHORITY_LOCKS.get(snapshot)!;
  if (held.lock.operation !== "preflight" || held.lock.target !== null) {
    throw new Error("GKX_INGEST_AUTHORITY_LOCK_INTENT_ALREADY_BOUND");
  }
  const material = {
    contract_version: INGEST_AUTHORITY_LOCK_CONTRACT_VERSION,
    lock_id: held.lock.lock_id,
    process_id: held.lock.process_id,
    prior_active: held.lock.prior_active,
    prior_authority_digest: held.lock.prior_authority_digest,
    operation,
    target,
  };
  const lock = sealAuthorityLock({ ...material, lock_digest: retrievalCanonicalDigest(material) });
  replaceCanonicalJson(join(snapshot.state_directory, AUTHORITY_LOCK_FILE), snapshot.state_directory, lock);
  const reopened = readAuthorityLock(snapshot.state_directory);
  if (!sameJson(reopened.lock, lock)) throw new Error("GKX_INGEST_AUTHORITY_LOCK_INTENT_REOPEN_FAILED");
  AUTHORITY_LOCKS.set(snapshot, reopened);
  return lock;
}

function removeAuthorityGuard(snapshot: IngestAuthorityPreflight): void {
  unlinkSync(join(snapshot.state_directory, AUTHORITY_LOCK_FILE));
  syncDirectory(snapshot.state_directory);
  AUTHORITY_LOCKS.delete(snapshot);
  AUTHORITY_NAMESPACES.delete(snapshot);
  AUTHORITY_ROOTS.delete(snapshot);
  AUTHORITY_PREFLIGHTS.delete(snapshot);
}

function assertAuthorityGuardReadyForRelease(
  snapshot: IngestAuthorityPreflight,
  requireExpectedNamespace: boolean,
): IngestAuthorityLock {
  assertAuthorityPreflight(snapshot);
  // Release is an authority transition too: a caller must not be able to
  // discard the sole writer guard while a controlled artifact has become
  // corrupt, aliased, permission-widened, or noncanonical. Fully sealed
  // content-addressed stage orphans remain valid namespace members.
  const namespace = captureArtifactNamespace(snapshot.state_directory);
  if (requireExpectedNamespace && namespace.digest !== AUTHORITY_NAMESPACES.get(snapshot)!.digest) {
    throw new Error("GKX_INGEST_STATE_ARTIFACT_NAMESPACE_CHANGED");
  }
  const held = AUTHORITY_LOCKS.get(snapshot)!;
  const current = readAuthorityLock(snapshot.state_directory);
  if (current.file_digest !== held.file_digest || !sameJson(current.lock, held.lock)) {
    throw new Error("GKX_INGEST_AUTHORITY_LOCK_CHANGED");
  }
  assertNoLegacyRetrievalWriter(snapshot.state_directory);
  return held.lock;
}

/**
 * Abort a held preflight or a still-reversible transition. Once first
 * activation reaches its durable root, a later activation advances its
 * pointer, or a blocked attempt publishes status, only recovery or the
 * internal exact-target finalizer may remove the guard.
 */
export function releaseIngestAuthorityPreflight(snapshot: IngestAuthorityPreflight): void {
  assertAuthorityPreflight(snapshot);
  const held = AUTHORITY_LOCKS.get(snapshot)!.lock;
  if (held.operation === "activation" && held.prior_active?.kind !== "ingest" &&
      pathExists(join(snapshot.state_directory, ACTIVATION_ROOT_FILE))) {
    throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_REQUIRED");
  }
  // This succeeds only while the exact authority coordinate from preflight is
  // still current. It therefore permits activation/status intent aborts but
  // refuses every committed target transition.
  revalidateAuthorityPreflight(snapshot);
  assertAuthorityGuardReadyForRelease(snapshot, true);
  removeAuthorityGuard(snapshot);
}

function finalizeIngestAuthorityTransition(
  snapshot: IngestAuthorityPreflight,
  expectedOperation: "activation" | "blocked",
): void {
  const lock = assertAuthorityGuardReadyForRelease(snapshot, false);
  if (lock.operation !== expectedOperation || lock.target?.kind !== expectedOperation) {
    throw new Error("GKX_INGEST_AUTHORITY_FINALIZATION_TARGET_INVALID");
  }
  const opened = currentActive(snapshot.state_directory);
  const active = opened?.active ?? null;
  if (lock.target.kind === "activation") {
    const target = lock.target;
    const expected: IngestPriorActive = {
      kind: "ingest",
      owner_generation_id: target.owner_generation_id,
      owner_manifest_digest: target.owner_manifest_digest,
      inner: target.inner,
      pointer_digest: target.pointer_digest,
    };
    if (!sameJson(active, expected)) throw new Error("GKX_INGEST_AUTHORITY_FINALIZATION_TARGET_MISMATCH");
  } else {
    if (!sameJson(active, lock.prior_active)) throw new Error("GKX_INGEST_AUTHORITY_FINALIZATION_PRIOR_MISMATCH");
    const status = readAttemptStatus(snapshot.state_directory, lock.prior_active);
    if (!status?.applicable || status.status.status_digest !== lock.target.status_digest) {
      throw new Error("GKX_INGEST_AUTHORITY_FINALIZATION_STATUS_MISMATCH");
    }
  }
  // Close the final read/unlink race under the two-way writer handshake.
  const final = readAuthorityLock(snapshot.state_directory);
  const held = AUTHORITY_LOCKS.get(snapshot)!;
  if (final.file_digest !== held.file_digest || !sameJson(final.lock, held.lock)) {
    throw new Error("GKX_INGEST_AUTHORITY_LOCK_CHANGED");
  }
  assertNoLegacyRetrievalWriter(snapshot.state_directory);
  removeAuthorityGuard(snapshot);
}

function processIdAppearsLive(processId: number): boolean {
  if (processId === process.pid) return true;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

export interface IngestStaleLockRecoveryOptions {
  /**
   * Explicit owner assertion for PID reuse or an externally verified dead
   * process. The exact sealed lock digest is still mandatory.
   */
  confirm_process_incarnation_stale?: boolean;
  /** Explicit owner assertion that an existing recovery claimant died. */
  confirm_recovery_claim_stale?: boolean;
  /** Trusted qualification hook invoked after the claim descriptor is sealed and before it is read. */
  on_recovery_claim_descriptor_opened?: () => void;
}

export function recoverStaleIngestAuthorityLock(
  stateDirectory: string,
  expectedLockDigest: string,
  options: IngestStaleLockRecoveryOptions = {},
): IngestOwnerState {
  if (typeof expectedLockDigest !== "string" || !SHA256_RE.test(expectedLockDigest)) {
    throw new TypeError("GKX_INGEST_AUTHORITY_LOCK_EXPECTED_DIGEST_INVALID");
  }
  const directory = existingStateDirectory(stateDirectory);
  if (!directory) throw new Error("GKX_INGEST_AUTHORITY_LOCK_MISSING");
  const lockPath = join(directory, AUTHORITY_LOCK_FILE);
  const claimPath = join(directory, AUTHORITY_RECOVERY_CLAIM_FILE);
  const claimExists = pathExists(claimPath);
  let claimReadHook = options.on_recovery_claim_descriptor_opened;
  const readClaimPair = (): { lock: IngestAuthorityLock; file_digest: string } => {
    const hook = claimReadHook;
    claimReadHook = undefined;
    return readRecoveryClaimPair(directory, hook);
  };
  if (claimExists && options.confirm_recovery_claim_stale !== true) {
    throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_ALREADY_CLAIMED");
  }
  if (!pathExists(lockPath) && !claimExists) throw new Error("GKX_INGEST_AUTHORITY_LOCK_MISSING");
  let preliminary: { lock: IngestAuthorityLock; file_digest: string };
  if (claimExists && pathExists(lockPath)) preliminary = readClaimPair();
  else if (claimExists) {
    const read = readCanonicalJson<unknown>(claimPath, directory, MAX_POINTER_BYTES, "GKX_INGEST_AUTHORITY_RECOVERY_CLAIM");
    preliminary = { lock: sealAuthorityLock(read.value), file_digest: read.digest };
  } else preliminary = readAuthorityLock(directory);
  if (preliminary.lock.lock_digest !== expectedLockDigest) throw new Error("GKX_INGEST_AUTHORITY_LOCK_DIGEST_MISMATCH");
  if (processIdAppearsLive(preliminary.lock.process_id) && options.confirm_process_incarnation_stale !== true) {
    throw new Error("GKX_INGEST_AUTHORITY_LOCK_PROCESS_LIVE");
  }

  if (claimExists) {
    if (!pathExists(lockPath)) linkSync(claimPath, lockPath);
    const paired = readClaimPair();
    if (paired.file_digest !== preliminary.file_digest || !sameJson(paired.lock, preliminary.lock)) {
      throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_CLAIM_CHANGED");
    }
    unlinkSync(claimPath);
    syncDirectory(directory);
  }
  try { linkSync(lockPath, claimPath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_ALREADY_CLAIMED");
    throw error;
  }
  syncDirectory(directory);
  const held = readClaimPair();
  if (held.file_digest !== preliminary.file_digest || !sameJson(held.lock, preliminary.lock)) {
    throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_CLAIM_CHANGED");
  }
  recoverInterruptedArtifactPublications(directory);

  if (held.lock.operation === "activation" && held.lock.prior_active?.kind !== "ingest" &&
      pathExists(join(directory, ACTIVATION_ROOT_FILE))) {
    const root = readActivationRoot(directory);
    if (root.authority_lock_digest !== held.lock.lock_digest) {
      throw new Error("GKX_INGEST_AUTHORITY_LOCK_RECOVERY_ROOT_MISMATCH");
    }
    completeBoundActivationIntent(directory, held.lock);
  }
  const active = currentActive(directory, held.lock);
  const activeCoordinate = active?.active ?? null;
  const authorityDigest = captureAuthorityDigest(directory);
  const priorUnchanged = authorityDigest === held.lock.prior_authority_digest &&
    sameJson(activeCoordinate, held.lock.prior_active);
  let recoverable = priorUnchanged;
  if (held.lock.operation === "activation" && held.lock.target?.kind === "activation") {
    const target: IngestPriorActive = {
      kind: "ingest",
      owner_generation_id: held.lock.target.owner_generation_id,
      owner_manifest_digest: held.lock.target.owner_manifest_digest,
      inner: held.lock.target.inner,
      pointer_digest: held.lock.target.pointer_digest,
    };
    recoverable = priorUnchanged || sameJson(activeCoordinate, target);
    if (recoverable && !priorUnchanged && held.lock.prior_active?.kind !== "ingest") {
      const witness = readWitness(directory);
      recoverable = witness.state === "active" && witness.authority_lock_digest === held.lock.lock_digest;
    }
  } else if (held.lock.operation === "blocked" && held.lock.target?.kind === "blocked") {
    const blocked = readAttemptStatus(directory, held.lock.prior_active);
    recoverable = priorUnchanged || (sameJson(activeCoordinate, held.lock.prior_active) &&
      blocked?.applicable === true && blocked.status.status_digest === held.lock.target.status_digest);
  }
  if (!recoverable) throw new Error("GKX_INGEST_AUTHORITY_LOCK_RECOVERY_STATE_INVALID");

  // Prepared content-addressed artifacts may legitimately survive a crash as
  // unactivated orphans. They need not equal the preflight namespace, but
  // every controlled artifact must be fully sealed before the writer guard is
  // released. The live recovery claim is the sole temporary exception.
  captureArtifactNamespace(directory, true);

  const finalLock = readClaimPair();
  if (finalLock.file_digest !== held.file_digest || !sameJson(finalLock.lock, held.lock)) {
    throw new Error("GKX_INGEST_AUTHORITY_LOCK_CHANGED");
  }
  unlinkSync(lockPath);
  syncDirectory(directory);
  const finalClaim = readCanonicalJson<unknown>(claimPath, directory, MAX_POINTER_BYTES, "GKX_INGEST_AUTHORITY_RECOVERY_CLAIM");
  if (finalClaim.digest !== held.file_digest || !sameJson(sealAuthorityLock(finalClaim.value), held.lock)) {
    throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_CLAIM_CHANGED");
  }
  unlinkSync(claimPath);
  syncDirectory(directory);
  const blockedAttempt = active ? active.blocked_attempt : readAttemptStatus(directory, null);
  return deepFreeze({ active_generation: active, blocked_attempt: blockedAttempt });
}

export function openActiveIngestGeneration(stateDirectory: string): IngestOpenedGeneration {
  const owner = openIngestOwnerState(stateDirectory);
  if (!owner.active_generation) throw new Error("GKX_INGEST_ACTIVE_GENERATION_UNAVAILABLE");
  return owner.active_generation;
}

export function openIngestOwnerState(
  stateDirectory: string,
  options: IngestOwnerOpenOptions = {},
): IngestOwnerState {
  const directory = existingStateDirectory(stateDirectory);
  if (!directory) return deepFreeze({ active_generation: null, blocked_attempt: null });
  const active = currentActive(directory, undefined, options.on_after_database_snapshot);
  const blockedAttempt = active?.blocked_attempt ?? readAttemptStatus(directory, null);
  return deepFreeze({ active_generation: active, blocked_attempt: blockedAttempt });
}

function assertStaged(value: unknown): asserts value is StagedIngestGeneration {
  if (value === null || typeof value !== "object" || !STAGED_GENERATIONS.has(value)) {
    throw new TypeError("GKX_INGEST_STAGED_GENERATION_CAPABILITY_INVALID");
  }
}

function verifyStaged(staged: StagedIngestGeneration): void {
  const pointer = activePointerFor(staged.owner_manifest);
  const manifest = readOwnerManifest(staged.state_directory, pointer);
  if (!sameJson(manifest, staged.owner_manifest) || !sameCanonicalPath(join(staged.state_directory, manifest.inner.database_file), staged.inner_database_path)) {
    throw new Error("GKX_INGEST_STAGED_GENERATION_CHANGED");
  }
}

export function activateStagedGkxIngestGeneration(
  staged: StagedIngestGeneration,
  options: IngestActivationOptions = {},
): IngestOpenedGeneration {
  assertStaged(staged);
  const authority = STAGED_AUTHORITIES.get(staged);
  if (!authority) throw new TypeError("GKX_INGEST_STAGED_AUTHORITY_CAPABILITY_MISSING");
  const held = AUTHORITY_LOCKS.get(authority);
  if (!held) throw new TypeError("GKX_INGEST_STAGED_AUTHORITY_LOCK_MISSING");
  revalidateAuthorityPreflight(authority);
  verifyStaged(staged);
  const directory = staged.state_directory;
  options.on_boundary?.("outer_verified");
  const pointer = activePointerFor(staged.owner_manifest);
  const activationLock = bindAuthorityLockIntent(authority, "activation", {
    kind: "activation",
    owner_generation_id: pointer.owner_generation_id,
    owner_manifest_digest: pointer.owner_manifest_digest,
    inner: pointer.inner,
    pointer_digest: rawCanonicalDigest(pointer),
  });
  options.on_boundary?.("activation_intent_bound");
  const witnessPath = join(directory, AUTHORITY_WITNESS_FILE);
  const legacyPath = join(directory, ACTIVE_RETRIEVAL_FILE);
  const activePath = join(directory, ACTIVE_INGEST_FILE);
  if (pathExists(witnessPath)) {
    const witness = readWitness(directory);
    if (witness.state === "activating") throw new Error("GKX_INGEST_AUTHORITY_RECOVERY_REQUIRED");
    if (witness.state !== "active") throw new Error("GKX_INGEST_AUTHORITY_WITNESS_STATE_INVALID");
    verifyWitnessHistory(directory, witness);
    revalidateAuthorityPreflight(authority);
    replaceCanonicalJson(activePath, directory, pointer);
    options.on_boundary?.("outer_pointer_published");
    const opened = openActiveIngestGeneration(directory);
    finalizeIngestAuthorityTransition(authority, "activation");
    return opened;
  }
  if (pathExists(activePath)) throw new Error("GKX_INGEST_ACTIVE_POINTER_WITHOUT_AUTHORITY_WITNESS");
  let legacy: ReturnType<typeof readLegacyActive> = null;
  if (pathExists(legacyPath)) {
    const probe = readCanonicalJson<Record<string, unknown>>(legacyPath, directory, MAX_POINTER_BYTES, "GKX_INGEST_LEGACY_PROBE");
    if (probe.value.contract_version === INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION) {
      throw new Error("GKX_INGEST_LEGACY_TOMBSTONE_WITHOUT_AUTHORITY_WITNESS");
    }
    legacy = readLegacyActive(directory);
  }
  const migration = migrationFor(staged.owner_manifest, legacy === null ? null : { pointer: legacy.pointer, digest: legacy.digest });
  const migrationFile = `ingest-migration-${migration.migration_digest.slice("sha256:".length)}.json`;
  const migrationPath = join(directory, migrationFile);
  publishImmutableJson(migrationPath, directory, migration);
  advanceArtifactNamespace(authority, [migrationPath]);
  options.on_boundary?.("migration_prepared");
  const tombstone = tombstoneFor(staged.owner_manifest, migration);
  const activating = witnessFor("activating", staged.owner_manifest, migration, tombstone, pointer, activationLock.lock_digest);
  const active = witnessFor("active", staged.owner_manifest, migration, tombstone, pointer, activationLock.lock_digest);
  revalidateAuthorityPreflight(authority);
  const root = activationRootFor(staged.owner_manifest, migration, tombstone, pointer, activationLock.lock_digest);
  publishImmutableJson(join(directory, ACTIVATION_ROOT_FILE), directory, root);
  options.on_boundary?.("activation_root_published");
  assertAuthorityLockUnchanged(authority);
  publishImmutableJson(witnessPath, directory, activating);
  options.on_boundary?.("witness_activating");
  assertAuthorityLockUnchanged(authority);
  replaceCanonicalJson(legacyPath, directory, tombstone);
  options.on_boundary?.("legacy_tombstoned");
  assertAuthorityLockUnchanged(authority);
  replaceCanonicalJson(activePath, directory, pointer);
  options.on_boundary?.("outer_pointer_published");
  assertAuthorityLockUnchanged(authority);
  replaceCanonicalJson(witnessPath, directory, active);
  options.on_boundary?.("witness_active");
  const opened = openActiveIngestGeneration(directory);
  finalizeIngestAuthorityTransition(authority, "activation");
  return opened;
}

export function recordBlockedIngestAttempt(
  authority: IngestAuthorityPreflight,
  plan: IngestValidationPlan,
  options: IngestBlockedAttemptOptions = {},
): IngestBlockedAttemptStatus {
  assertAuthorityPreflight(authority);
  assertIngestValidationPlan(plan);
  if (plan.result.ingest_intrinsic_valid) throw new Error("GKX_INGEST_BLOCKED_ATTEMPT_NOT_BLOCKED");
  revalidateAuthorityPreflight(authority);
  const prior = authority.active?.active ?? null;
  const attemptMaterial = {
    contract_version: "gkos-ingest-attempt/1.0.0-draft.1",
    mode: "strict",
    observation_snapshot_digest: plan.observation_snapshot_digest,
    effective_profile_digest: plan.result.profile.effective_profile_digest,
  };
  const material = {
    contract_version: INGEST_ATTEMPT_STATUS_CONTRACT_VERSION,
    state: "blocked" as const,
    availability: prior === null ? "unavailable" as const : "stale" as const,
    prior_active: prior,
    attempt_digest: retrievalCanonicalDigest(attemptMaterial),
    effective_profile_digest: plan.result.profile.effective_profile_digest,
    observation_snapshot_digest: plan.observation_snapshot_digest,
  };
  const status = sealIngestBlockedAttemptStatusEnvelope({ ...material, status_digest: retrievalCanonicalDigest(material) });
  bindAuthorityLockIntent(authority, "blocked", { kind: "blocked", status_digest: status.status_digest });
  options.on_boundary?.("attempt_intent_bound");
  const directory = ensureStateDirectory(authority.state_directory);
  revalidateAuthorityPreflight(authority);
  const statusPath = join(directory, ATTEMPT_STATUS_FILE);
  if (pathExists(statusPath)) {
    const existing = readCanonicalJson<unknown>(statusPath, directory, MAX_POINTER_BYTES, "GKX_INGEST_ATTEMPT_STATUS");
    if (!sameJson(sealIngestBlockedAttemptStatusEnvelope(existing.value), status)) {
      replaceCanonicalJson(statusPath, directory, status);
    }
  } else replaceCanonicalJson(statusPath, directory, status);
  options.on_boundary?.("attempt_status_published");
  const reopened = readAttemptStatus(directory, prior);
  if (!reopened?.applicable || !sameJson(reopened.status, status)) throw new Error("GKX_INGEST_ATTEMPT_STATUS_REOPEN_FAILED");
  finalizeIngestAuthorityTransition(authority, "blocked");
  return status;
}
