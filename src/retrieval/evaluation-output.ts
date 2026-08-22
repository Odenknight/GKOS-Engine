import { randomBytes } from "node:crypto";
import { link, lstat, open, unlink } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseGkosToml } from "./config";
import { retrievalCanonicalDigest, retrievalSha256, stableJson } from "./digest";
import {
  retrievalEvaluationCandidateConfigMaterial,
  type RetrievalEvaluationTuneSelection,
} from "./evaluation";
import { retrievalEvaluationLocalPath } from "./evaluation-capability";
import { canonicalPath, canonicalPathContains, sameCanonicalPath } from "./path-security";

export const RETRIEVAL_EVALUATION_OUTPUT_GUARD_VERSION =
  "gkx-retrieval-evaluation-output-guard/1.0.0-draft.1" as const;

const MAX_OUTPUT_BASENAME_BYTES = 128;
const MAX_CANDIDATE_TOML_BYTES = 1024 * 1024;
const MAX_GUARD_BYTES = 16 * 1024;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const NONCE_RE = /^[0-9a-f]{32}$/u;
const DECIMAL_RE = /^(?:0|[1-9][0-9]*)$/u;
const FATAL_UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

interface OutputDirectoryIdentity {
  raw_path: string;
  canonical_path: string;
  device: bigint;
  inode: bigint;
  mode: bigint;
  owner: bigint;
  link_count: bigint;
}

interface OutputFileIdentity extends OutputDirectoryIdentity {
  size: bigint;
  mtime_ns: bigint;
  ctime_ns: bigint;
}

export interface RetrievalEvaluationOutputGuard {
  contract_version: typeof RETRIEVAL_EVALUATION_OUTPUT_GUARD_VERSION;
  operation: "retrieval_tune_candidate_publication";
  owner_nonce: string;
  output_basename: string;
  output_parent_device: string;
  output_parent_inode: string;
  output_parent_mode: number;
  execution_authority_digest: string;
  tune_selection_digest: string;
  candidate_config_digest: string;
  candidate_toml_digest: string;
  candidate_toml_size: number;
  guard_digest: string;
}

export interface RetrievalEvaluationOutputCapability {
  parent_path: string;
  final_path: string;
  output_basename: string;
  guard_path: string;
  guard_staging_path: string;
  temporary_path: string;
  revalidate(): Promise<void>;
  assert_unpublished(): Promise<void>;
  publish(input: {
    execution_authority_digest: string;
    selection: RetrievalEvaluationTuneSelection;
    candidate_config: ReturnType<typeof retrievalEvaluationCandidateConfigMaterial>;
    revalidate_authority(): Promise<void>;
  }): Promise<void>;
}

function failure(code: string): never { throw new Error(code); }

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function sameDevice(left: bigint, right: bigint): boolean {
  return left === right || process.platform === "win32" && (left === 0n || right === 0n);
}

function directoryIdentity(rawPath: string, canonicalPathValue: string, state: BigIntStats): OutputDirectoryIdentity {
  return {
    raw_path: rawPath,
    canonical_path: canonicalPathValue,
    device: state.dev,
    inode: state.ino,
    mode: state.mode,
    owner: state.uid,
    link_count: state.nlink,
  };
}

function fileIdentity(rawPath: string, canonicalPathValue: string, state: BigIntStats): OutputFileIdentity {
  return {
    ...directoryIdentity(rawPath, canonicalPathValue, state),
    size: state.size,
    mtime_ns: state.mtimeNs,
    ctime_ns: state.ctimeNs,
  };
}

function sameDirectoryIdentity(expected: OutputDirectoryIdentity, actual: BigIntStats): boolean {
  return actual.isDirectory() && !actual.isSymbolicLink() && sameDevice(expected.device, actual.dev) &&
    expected.inode === actual.ino && expected.mode === actual.mode && expected.owner === actual.uid;
}

function sameFileIdentity(expected: OutputFileIdentity, actual: BigIntStats): boolean {
  return actual.isFile() && !actual.isSymbolicLink() && sameDevice(expected.device, actual.dev) &&
    expected.inode === actual.ino && expected.mode === actual.mode && expected.owner === actual.uid &&
    expected.link_count === actual.nlink && expected.size === actual.size &&
    expected.mtime_ns === actual.mtimeNs && expected.ctime_ns === actual.ctimeNs;
}

function assertPrivateParent(state: BigIntStats): void {
  if (!state.isDirectory() || state.isSymbolicLink() || state.nlink < 1n) failure("GKX_EVAL_OUTPUT_PARENT_INVALID");
  if (process.platform !== "win32") {
    const euid = typeof process.geteuid === "function" ? BigInt(process.geteuid()) : -1n;
    if (state.uid !== euid || Number(state.mode & 0o7777n) !== 0o700) failure("GKX_EVAL_OUTPUT_PARENT_INVALID");
  }
}

function assertPrivateFile(state: BigIntStats, expectedLinks: 1n | 2n, code: string): void {
  if (!state.isFile() || state.isSymbolicLink() || state.nlink !== expectedLinks) failure(code);
  if (process.platform !== "win32") {
    const euid = typeof process.geteuid === "function" ? BigInt(process.geteuid()) : -1n;
    if (state.uid !== euid || Number(state.mode & 0o7777n) !== 0o600) failure(code);
  }
}

async function optionalState(path: string): Promise<BigIntStats | null> {
  try { return await lstat(path, { bigint: true }); }
  catch (error) { if (isMissing(error)) return null; throw error; }
}

async function syncDirectory(path: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (process.platform !== "win32") throw error;
  } finally { await handle?.close(); }
}

async function secureRead(
  parent: OutputDirectoryIdentity,
  path: string,
  name: string,
  maximumBytes: number,
  expectedLinks: 1n | 2n,
  code: string,
  allowEmpty = false,
): Promise<{ bytes: Buffer; identity: OutputFileIdentity }> {
  const canonical = await canonicalPath(path, { alias_error: code });
  if (!sameCanonicalPath(dirname(canonical), parent.canonical_path) || basename(canonical) !== name) failure(code);
  const before = await lstat(canonical, { bigint: true });
  assertPrivateFile(before, expectedLinks, code);
  if ((!allowEmpty && before.size < 1n) || before.size > BigInt(maximumBytes)) failure(code);
  const expected = fileIdentity(path, canonical, before);
  let handle: FileHandle | undefined;
  try {
    handle = await open(canonical, "r");
    const opened = await handle.stat({ bigint: true });
    if (!sameFileIdentity(expected, opened)) failure(code);
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (read.bytesRead === 0) break;
      offset += read.bytesRead;
    }
    const openedAfter = await handle.stat({ bigint: true });
    const pathAfter = await lstat(canonical, { bigint: true });
    const canonicalAfter = await canonicalPath(path, { alias_error: code });
    if (offset !== Number(before.size) || !sameFileIdentity(expected, openedAfter) ||
        !sameFileIdentity(expected, pathAfter) || !sameCanonicalPath(canonical, canonicalAfter) ||
        !sameCanonicalPath(dirname(canonicalAfter), parent.canonical_path) || basename(canonicalAfter) !== name) {
      failure(code);
    }
    return { bytes: bytes.subarray(0, offset), identity: expected };
  } finally { await handle?.close(); }
}

function sameCreatedFileIdentity(expected: OutputFileIdentity, actual: BigIntStats): boolean {
  return actual.isFile() && !actual.isSymbolicLink() && sameDevice(expected.device, actual.dev) &&
    expected.inode === actual.ino && expected.mode === actual.mode && expected.owner === actual.uid &&
    actual.nlink === 1n && expected.size === actual.size && expected.mtime_ns === actual.mtimeNs &&
    expected.ctime_ns === actual.ctimeNs;
}

async function cleanupCreatedFile(
  parent: OutputDirectoryIdentity,
  path: string,
  name: string,
  created: OutputFileIdentity,
  code: string,
): Promise<void> {
  const canonical = await canonicalPath(path, { alias_error: code });
  const state = await lstat(canonical, { bigint: true });
  if (!sameCanonicalPath(dirname(canonical), parent.canonical_path) || basename(canonical) !== name ||
      !sameCreatedFileIdentity(created, state)) failure(code);
  await unlink(canonical);
  await syncDirectory(parent.canonical_path);
}

async function writeNewFile(
  parent: OutputDirectoryIdentity,
  path: string,
  name: string,
  bytes: Uint8Array,
  code: string,
): Promise<OutputFileIdentity> {
  let handle: FileHandle | undefined;
  let created: OutputFileIdentity | undefined;
  try {
    handle = await open(path, "wx", 0o600);
    const opened = await handle.stat({ bigint: true });
    created = fileIdentity(path, path, opened);
    assertPrivateFile(opened, 1n, code);
    const canonical = await canonicalPath(path, { alias_error: code });
    if (!sameCanonicalPath(dirname(canonical), parent.canonical_path) || basename(canonical) !== name) failure(code);
    created = fileIdentity(path, canonical, opened);
    await handle.writeFile(bytes);
    await handle.sync();
    const written = await handle.stat({ bigint: true });
    assertPrivateFile(written, 1n, code);
    if (!sameDevice(created.device, written.dev) || created.inode !== written.ino ||
        created.owner !== written.uid || created.mode !== written.mode) failure(code);
    created = fileIdentity(path, canonical, written);
  } catch (error) {
    if (handle && created) {
      try {
        const failed = await handle.stat({ bigint: true });
        created = fileIdentity(path, created.canonical_path, failed);
      } catch { /* retain the original creation identity */ }
    }
    try { await handle?.close(); } catch { /* retain primary publication error */ }
    if (created) {
      try { await cleanupCreatedFile(parent, path, name, created, code); }
      catch { failure(`${code}_CLEANUP_INVALID`); }
    }
    if ((error as NodeJS.ErrnoException)?.code === "EEXIST") failure(`${code}_EXISTS`);
    throw error;
  }
  try {
    await handle.close();
    handle = undefined;
    const read = await secureRead(parent, path, name, Math.max(bytes.length, 1), 1n, code, bytes.length === 0);
    if (!read.bytes.equals(bytes)) failure(code);
    return read.identity;
  } catch (error) {
    if (created) {
      try { await cleanupCreatedFile(parent, path, name, created, code); }
      catch { failure(`${code}_CLEANUP_INVALID`); }
    }
    throw error;
  }
}

function exactKeys(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function guardMaterial(value: Omit<RetrievalEvaluationOutputGuard, "guard_digest">): Omit<RetrievalEvaluationOutputGuard, "guard_digest"> {
  return value;
}

export function sealRetrievalEvaluationOutputGuard(value: unknown): RetrievalEvaluationOutputGuard {
  if (!value || typeof value !== "object" || Array.isArray(value)) failure("GKX_EVAL_OUTPUT_GUARD_INVALID");
  const item = value as Record<string, unknown>;
  const fields = [
    "contract_version", "operation", "owner_nonce", "output_basename", "output_parent_device",
    "output_parent_inode", "output_parent_mode", "execution_authority_digest", "tune_selection_digest",
    "candidate_config_digest", "candidate_toml_digest", "candidate_toml_size", "guard_digest",
  ] as const;
  if (!exactKeys(item, fields) || item.contract_version !== RETRIEVAL_EVALUATION_OUTPUT_GUARD_VERSION ||
      item.operation !== "retrieval_tune_candidate_publication" || typeof item.owner_nonce !== "string" ||
      !NONCE_RE.test(item.owner_nonce) || typeof item.output_basename !== "string" ||
      Buffer.byteLength(item.output_basename, "utf8") < 1 || Buffer.byteLength(item.output_basename, "utf8") > MAX_OUTPUT_BASENAME_BYTES ||
      typeof item.output_parent_device !== "string" || !DECIMAL_RE.test(item.output_parent_device) ||
      typeof item.output_parent_inode !== "string" || !DECIMAL_RE.test(item.output_parent_inode) ||
      !Number.isSafeInteger(item.output_parent_mode) || (item.output_parent_mode as number) < 0 ||
      typeof item.execution_authority_digest !== "string" || !SHA256_RE.test(item.execution_authority_digest) ||
      typeof item.tune_selection_digest !== "string" || !SHA256_RE.test(item.tune_selection_digest) ||
      typeof item.candidate_config_digest !== "string" || !SHA256_RE.test(item.candidate_config_digest) ||
      typeof item.candidate_toml_digest !== "string" || !SHA256_RE.test(item.candidate_toml_digest) ||
      !Number.isSafeInteger(item.candidate_toml_size) || (item.candidate_toml_size as number) < 1 ||
      (item.candidate_toml_size as number) > MAX_CANDIDATE_TOML_BYTES ||
      typeof item.guard_digest !== "string" || !SHA256_RE.test(item.guard_digest)) {
    failure("GKX_EVAL_OUTPUT_GUARD_INVALID");
  }
  const { guard_digest, ...material } = item as unknown as RetrievalEvaluationOutputGuard;
  if (retrievalCanonicalDigest(material) !== guard_digest) failure("GKX_EVAL_OUTPUT_GUARD_DIGEST_MISMATCH");
  return { ...material, guard_digest };
}

function withoutRecoveryIdentity(guard: RetrievalEvaluationOutputGuard): Record<string, unknown> {
  const { owner_nonce: _ownerNonce, guard_digest: _guardDigest, ...coordinates } = guard;
  return coordinates;
}

function guardBytes(guard: RetrievalEvaluationOutputGuard): Buffer {
  return Buffer.from(`${stableJson(guard)}\n`, "utf8");
}

async function readGuard(
  parent: OutputDirectoryIdentity,
  path: string,
  name: string,
  expectedLinks: 1n | 2n = 1n,
): Promise<RetrievalEvaluationOutputGuard> {
  const read = await secureRead(parent, path, name, MAX_GUARD_BYTES, expectedLinks, "GKX_EVAL_OUTPUT_GUARD_INVALID");
  let parsed: unknown;
  try { parsed = JSON.parse(FATAL_UTF8.decode(read.bytes)); }
  catch { return failure("GKX_EVAL_OUTPUT_GUARD_INVALID"); }
  const guard = sealRetrievalEvaluationOutputGuard(parsed);
  if (!read.bytes.equals(guardBytes(guard))) failure("GKX_EVAL_OUTPUT_GUARD_NONCANONICAL");
  return guard;
}

async function verifyGuardLinkedPair(
  parent: OutputDirectoryIdentity,
  guardPath: string,
  guardName: string,
  stagingPath: string,
  stagingName: string,
): Promise<RetrievalEvaluationOutputGuard> {
  const guardRead = await secureRead(parent, guardPath, guardName, MAX_GUARD_BYTES, 2n,
    "GKX_EVAL_OUTPUT_GUARD_LINK_PAIR_INVALID");
  const stagingRead = await secureRead(parent, stagingPath, stagingName, MAX_GUARD_BYTES, 2n,
    "GKX_EVAL_OUTPUT_GUARD_LINK_PAIR_INVALID");
  if (!guardRead.bytes.equals(stagingRead.bytes) || !sameDevice(guardRead.identity.device, stagingRead.identity.device) ||
      guardRead.identity.inode !== stagingRead.identity.inode || guardRead.identity.mode !== stagingRead.identity.mode ||
      guardRead.identity.owner !== stagingRead.identity.owner || guardRead.identity.link_count !== stagingRead.identity.link_count ||
      guardRead.identity.size !== stagingRead.identity.size || guardRead.identity.mtime_ns !== stagingRead.identity.mtime_ns ||
      guardRead.identity.ctime_ns !== stagingRead.identity.ctime_ns) {
    failure("GKX_EVAL_OUTPUT_GUARD_LINK_PAIR_INVALID");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(FATAL_UTF8.decode(guardRead.bytes)); }
  catch { return failure("GKX_EVAL_OUTPUT_GUARD_INVALID"); }
  const guard = sealRetrievalEvaluationOutputGuard(parsed);
  if (!guardRead.bytes.equals(guardBytes(guard))) failure("GKX_EVAL_OUTPUT_GUARD_NONCANONICAL");
  return guard;
}

type GuardStagingInspection =
  | { kind: "discardable"; identity: OutputFileIdentity }
  | { kind: "guard"; guard: RetrievalEvaluationOutputGuard; identity: OutputFileIdentity };

async function inspectGuardStaging(
  parent: OutputDirectoryIdentity,
  path: string,
  name: string,
): Promise<GuardStagingInspection> {
  const canonical = await canonicalPath(path, { alias_error: "GKX_EVAL_OUTPUT_GUARD_STAGING_INVALID" });
  if (!sameCanonicalPath(dirname(canonical), parent.canonical_path) || basename(canonical) !== name) {
    failure("GKX_EVAL_OUTPUT_GUARD_STAGING_INVALID");
  }
  const state = await lstat(canonical, { bigint: true });
  assertPrivateFile(state, 1n, "GKX_EVAL_OUTPUT_GUARD_STAGING_INVALID");
  if (state.size > BigInt(MAX_GUARD_BYTES)) failure("GKX_EVAL_OUTPUT_GUARD_STAGING_INVALID");
  const read = await secureRead(parent, path, name, MAX_GUARD_BYTES, 1n,
    "GKX_EVAL_OUTPUT_GUARD_STAGING_INVALID", true);
  if (read.bytes.length === 0) return { kind: "discardable", identity: read.identity };
  let parsed: unknown;
  try { parsed = JSON.parse(FATAL_UTF8.decode(read.bytes)); }
  catch { return { kind: "discardable", identity: read.identity }; }
  let guard: RetrievalEvaluationOutputGuard;
  try { guard = sealRetrievalEvaluationOutputGuard(parsed); }
  catch { return failure("GKX_EVAL_OUTPUT_GUARD_STAGING_RECEIPT_INVALID"); }
  if (!read.bytes.equals(guardBytes(guard))) return { kind: "discardable", identity: read.identity };
  return { kind: "guard", guard, identity: read.identity };
}

function candidateLambda(value: number): string {
  const exact = new Map<number, string>([[0, "0.0"], [0.3, "0.3"], [0.5, "0.5"], [0.7, "0.7"], [1, "1.0"]]);
  return exact.get(value) ?? failure("GKX_EVAL_OUTPUT_CANDIDATE_CONFIG_INVALID");
}

export function renderRetrievalEvaluationCandidateToml(
  value: ReturnType<typeof retrievalEvaluationCandidateConfigMaterial>,
): Buffer {
  const config = retrievalEvaluationCandidateConfigMaterial({
    rrf_k: value.retrieval.rrf_k,
    mmr: value.retrieval.mmr,
    mmr_lambda_micros: value.retrieval.mmr ? Math.round((value.retrieval.mmr_lambda ?? NaN) * 1_000_000) : null,
    semantic_top_k: value.retrieval.semantic_top_k,
    lexical_top_k: value.retrieval.lexical_top_k,
  });
  const lines = [
    "config_version = 1",
    "",
    "[retrieval]",
    `rrf_k = ${config.retrieval.rrf_k}`,
    `mmr = ${config.retrieval.mmr ? "true" : "false"}`,
    ...(config.retrieval.mmr ? [`mmr_lambda = ${candidateLambda(config.retrieval.mmr_lambda!)}`] : []),
    `semantic_top_k = ${config.retrieval.semantic_top_k}`,
    `lexical_top_k = ${config.retrieval.lexical_top_k}`,
  ];
  const bytes = Buffer.from(`${lines.join("\n")}\n`, "utf8");
  const parsed = parseGkosToml(FATAL_UTF8.decode(bytes));
  const logical = { config_version: parsed[""].config_version, retrieval: parsed.retrieval };
  if (bytes.length < 1 || bytes.length > MAX_CANDIDATE_TOML_BYTES || stableJson(logical) !== stableJson(config)) {
    failure("GKX_EVAL_OUTPUT_CANDIDATE_CONFIG_ROUNDTRIP_INVALID");
  }
  return bytes;
}

async function verifyCandidateFile(
  parent: OutputDirectoryIdentity,
  path: string,
  name: string,
  bytes: Buffer,
  links: 1n | 2n,
  code: string,
): Promise<OutputFileIdentity> {
  const read = await secureRead(parent, path, name, MAX_CANDIDATE_TOML_BYTES, links, code);
  if (!read.bytes.equals(bytes) || retrievalSha256(read.bytes) !== retrievalSha256(bytes)) failure(code);
  return read.identity;
}

async function verifyLinkedPair(
  parent: OutputDirectoryIdentity,
  finalPath: string,
  finalName: string,
  temporaryPath: string,
  temporaryName: string,
  bytes: Buffer,
): Promise<OutputFileIdentity> {
  const final = await verifyCandidateFile(parent, finalPath, finalName, bytes, 2n, "GKX_EVAL_OUTPUT_LINK_PAIR_INVALID");
  const temporary = await verifyCandidateFile(parent, temporaryPath, temporaryName, bytes, 2n, "GKX_EVAL_OUTPUT_LINK_PAIR_INVALID");
  if (!sameDevice(final.device, temporary.device) || final.inode !== temporary.inode || final.mode !== temporary.mode ||
      final.owner !== temporary.owner || final.link_count !== temporary.link_count || final.size !== temporary.size ||
      final.mtime_ns !== temporary.mtime_ns || final.ctime_ns !== temporary.ctime_ns) {
    failure("GKX_EVAL_OUTPUT_LINK_PAIR_INVALID");
  }
  return final;
}

async function assertAbsent(path: string, code: string): Promise<void> {
  if (await optionalState(path) !== null) failure(code);
}

function overlaps(left: string, right: string): boolean {
  return canonicalPathContains(left, right) || canonicalPathContains(right, left);
}

export function retrievalEvaluationOutputPath(value: unknown, currentDirectory: string): {
  requested_final: string;
  output_basename: string;
} {
  const requestedFinal = retrievalEvaluationLocalPath(value, currentDirectory);
  const outputBasename = basename(requestedFinal);
  if (outputBasename.length <= ".toml".length || !outputBasename.endsWith(".toml") ||
      Buffer.byteLength(outputBasename, "utf8") > MAX_OUTPUT_BASENAME_BYTES) {
    failure("GKX_EVAL_CLI_PATH_INVALID");
  }
  return { requested_final: requestedFinal, output_basename: outputBasename };
}

export async function openRetrievalEvaluationOutputCapability(input: {
  output_path: unknown;
  current_directory: string;
  protected_paths: readonly string[];
}): Promise<RetrievalEvaluationOutputCapability> {
  const { requested_final: requestedFinal, output_basename: outputBasename } =
    retrievalEvaluationOutputPath(input.output_path, input.current_directory);
  const requestedParent = dirname(requestedFinal);
  const canonicalParent = await canonicalPath(requestedParent, { alias_error: "GKX_EVAL_OUTPUT_PARENT_ALIAS_REJECTED" });
  const parentState = await lstat(canonicalParent, { bigint: true });
  assertPrivateParent(parentState);
  const parent = directoryIdentity(requestedParent, canonicalParent, parentState);
  const canonicalFinal = await canonicalPath(requestedFinal, { allow_missing: true, alias_error: "GKX_EVAL_OUTPUT_PATH_ALIAS_REJECTED" });
  if (!sameCanonicalPath(dirname(canonicalFinal), canonicalParent) || basename(canonicalFinal) !== outputBasename) {
    failure("GKX_EVAL_OUTPUT_PATH_INVALID");
  }
  const guardName = `.${outputBasename}.gkx-retrieval-tune.guard`;
  const guardStagingName = `.${outputBasename}.gkx-retrieval-tune.guard-stage`;
  const temporaryName = `.${outputBasename}.gkx-retrieval-tune.tmp`;
  if (Buffer.byteLength(guardName, "utf8") > 255 || Buffer.byteLength(guardStagingName, "utf8") > 255 ||
      Buffer.byteLength(temporaryName, "utf8") > 255) {
    failure("GKX_EVAL_CLI_PATH_INVALID");
  }
  const guardPath = join(canonicalParent, guardName);
  const guardStagingPath = join(canonicalParent, guardStagingName);
  const temporaryPath = join(canonicalParent, temporaryName);
  for (const protectedPath of input.protected_paths) {
    const canonicalProtected = await canonicalPath(protectedPath, { alias_error: "GKX_EVAL_OUTPUT_PROTECTED_ALIAS_REJECTED" });
    if (overlaps(canonicalParent, canonicalProtected) || overlaps(canonicalFinal, canonicalProtected)) {
      failure("GKX_EVAL_OUTPUT_PROTECTED_ROOT_INVALID");
    }
  }
  const revalidate = async () => {
    const parentNow = await canonicalPath(requestedParent, { alias_error: "GKX_EVAL_OUTPUT_PARENT_CHANGED" });
    const stateNow = await lstat(canonicalParent, { bigint: true });
    const finalNow = await canonicalPath(requestedFinal, { allow_missing: true, alias_error: "GKX_EVAL_OUTPUT_PATH_CHANGED" });
    if (!sameCanonicalPath(parentNow, canonicalParent) || !sameDirectoryIdentity(parent, stateNow) ||
        !sameCanonicalPath(finalNow, canonicalFinal) || !sameCanonicalPath(dirname(finalNow), canonicalParent) ||
        basename(finalNow) !== outputBasename) failure("GKX_EVAL_OUTPUT_PARENT_CHANGED");
  };
  await revalidate();
  const initialGuardStaging = await optionalState(guardStagingPath);
  const initialGuard = await optionalState(guardPath);
  const initialTemporary = await optionalState(temporaryPath);
  const initialFinal = await optionalState(canonicalFinal);
  if (initialGuardStaging === null && initialGuard === null && initialTemporary === null && initialFinal !== null) {
    if (initialFinal.isFile() && !initialFinal.isSymbolicLink() && initialFinal.nlink === 1n) {
      failure("GKX_EVAL_OUTPUT_ALREADY_EXISTS");
    }
    failure("GKX_EVAL_OUTPUT_RECOVERY_STATE_INVALID");
  }
  if (initialGuardStaging === null && initialGuard === null && initialTemporary !== null) {
    failure("GKX_EVAL_OUTPUT_RECOVERY_STATE_INVALID");
  }

  const assertUnpublished = async () => {
    await revalidate();
    const [staging, guard, temporary, final] = await Promise.all([
      optionalState(guardStagingPath), optionalState(guardPath), optionalState(temporaryPath), optionalState(canonicalFinal),
    ]);
    if (staging === null && guard === null && temporary === null && final === null) return;
    if (staging === null && guard === null && temporary === null && final !== null && final.isFile() &&
        !final.isSymbolicLink() && final.nlink === 1n) failure("GKX_EVAL_OUTPUT_ALREADY_EXISTS");
    failure("GKX_EVAL_OUTPUT_RECOVERY_STATE_INVALID");
  };

  return {
    parent_path: canonicalParent,
    final_path: canonicalFinal,
    output_basename: outputBasename,
    guard_path: guardPath,
    guard_staging_path: guardStagingPath,
    temporary_path: temporaryPath,
    revalidate,
    assert_unpublished: assertUnpublished,
    async publish(publication) {
      await revalidate();
      const selected = publication.selection.selected_candidate;
      const { tune_selection_digest: selectionDigest, ...selectionMaterial } = publication.selection;
      if (retrievalCanonicalDigest(selectionMaterial) !== selectionDigest || !selected ||
          stableJson(retrievalEvaluationCandidateConfigMaterial(selected.axes)) !== stableJson(publication.candidate_config) ||
          selected.candidate_config_digest !==
          retrievalCanonicalDigest({
            base_configuration_digest: publication.selection.base_configuration_digest,
            candidate_config: publication.candidate_config,
          })) failure("GKX_EVAL_OUTPUT_SELECTION_INVALID");
      const candidateBytes = renderRetrievalEvaluationCandidateToml(publication.candidate_config);
      const baseGuard = {
        contract_version: RETRIEVAL_EVALUATION_OUTPUT_GUARD_VERSION,
        operation: "retrieval_tune_candidate_publication" as const,
        owner_nonce: "",
        output_basename: outputBasename,
        output_parent_device: parent.device.toString(10),
        output_parent_inode: parent.inode.toString(10),
        output_parent_mode: Number(parent.mode),
        execution_authority_digest: publication.execution_authority_digest,
        tune_selection_digest: publication.selection.tune_selection_digest,
        candidate_config_digest: selected.candidate_config_digest,
        candidate_toml_digest: retrievalSha256(candidateBytes),
        candidate_toml_size: candidateBytes.length,
      };
      if (!Number.isSafeInteger(baseGuard.output_parent_mode) || !SHA256_RE.test(baseGuard.execution_authority_digest)) {
        failure("GKX_EVAL_OUTPUT_COORDINATE_INVALID");
      }
      await publication.revalidate_authority();
      const expectedGuard = (nonce: string) => sealRetrievalEvaluationOutputGuard({
        ...baseGuard,
        owner_nonce: nonce,
        guard_digest: retrievalCanonicalDigest({ ...baseGuard, owner_nonce: nonce }),
      });
      const assertGuardCoordinates = (candidate: RetrievalEvaluationOutputGuard) => {
        const expected = expectedGuard(candidate.owner_nonce);
        if (stableJson(withoutRecoveryIdentity(candidate)) !== stableJson(withoutRecoveryIdentity(expected))) {
          failure("GKX_EVAL_OUTPUT_GUARD_COORDINATE_MISMATCH");
        }
      };
      const commitGuardFromStaging = async (candidate: RetrievalEvaluationOutputGuard) => {
        try { await link(guardStagingPath, guardPath); }
        catch { return failure("GKX_EVAL_OUTPUT_GUARD_LINK_FAILED"); }
        const linkedGuard = await verifyGuardLinkedPair(parent, guardPath, guardName, guardStagingPath, guardStagingName);
        if (stableJson(linkedGuard) !== stableJson(candidate)) failure("GKX_EVAL_OUTPUT_GUARD_CHANGED");
        await syncDirectory(canonicalParent);
        await unlink(guardStagingPath);
        await syncDirectory(canonicalParent);
        const committed = await readGuard(parent, guardPath, guardName);
        if (stableJson(committed) !== stableJson(candidate)) failure("GKX_EVAL_OUTPUT_GUARD_CHANGED");
        return committed;
      };
      let guard: RetrievalEvaluationOutputGuard;
      const existingGuardStaging = await optionalState(guardStagingPath);
      const existingGuard = await optionalState(guardPath);
      const existingTemporary = await optionalState(temporaryPath);
      const existingFinal = await optionalState(canonicalFinal);
      if (existingGuard === null && existingGuardStaging === null) {
        if (existingTemporary !== null) failure("GKX_EVAL_OUTPUT_RECOVERY_STATE_INVALID");
        if (existingFinal !== null) {
          if (existingFinal.isFile() && !existingFinal.isSymbolicLink() && existingFinal.nlink === 1n) {
            failure("GKX_EVAL_OUTPUT_ALREADY_EXISTS");
          }
          failure("GKX_EVAL_OUTPUT_RECOVERY_STATE_INVALID");
        }
        const material = guardMaterial({ ...baseGuard, owner_nonce: randomBytes(16).toString("hex") });
        guard = sealRetrievalEvaluationOutputGuard({ ...material, guard_digest: retrievalCanonicalDigest(material) });
        await writeNewFile(parent, guardStagingPath, guardStagingName, guardBytes(guard),
          "GKX_EVAL_OUTPUT_GUARD_STAGING_WRITE_INVALID");
        guard = await commitGuardFromStaging(guard);
      } else if (existingGuard === null) {
        if (existingTemporary !== null || existingFinal !== null) failure("GKX_EVAL_OUTPUT_RECOVERY_STATE_INVALID");
        const staged = await inspectGuardStaging(parent, guardStagingPath, guardStagingName);
        if (staged.kind === "discardable") {
          await cleanupCreatedFile(parent, guardStagingPath, guardStagingName, staged.identity,
            "GKX_EVAL_OUTPUT_GUARD_STAGING_CLEANUP_INVALID");
          const material = guardMaterial({ ...baseGuard, owner_nonce: randomBytes(16).toString("hex") });
          guard = sealRetrievalEvaluationOutputGuard({ ...material, guard_digest: retrievalCanonicalDigest(material) });
          await writeNewFile(parent, guardStagingPath, guardStagingName, guardBytes(guard),
            "GKX_EVAL_OUTPUT_GUARD_STAGING_WRITE_INVALID");
          guard = await commitGuardFromStaging(guard);
        } else {
          assertGuardCoordinates(staged.guard);
          guard = await commitGuardFromStaging(staged.guard);
        }
      } else if (existingGuardStaging !== null) {
        if (existingTemporary !== null || existingFinal !== null) failure("GKX_EVAL_OUTPUT_RECOVERY_STATE_INVALID");
        guard = await verifyGuardLinkedPair(parent, guardPath, guardName, guardStagingPath, guardStagingName);
        assertGuardCoordinates(guard);
        await syncDirectory(canonicalParent);
        await unlink(guardStagingPath);
        await syncDirectory(canonicalParent);
        const committed = await readGuard(parent, guardPath, guardName);
        if (stableJson(committed) !== stableJson(guard)) failure("GKX_EVAL_OUTPUT_GUARD_CHANGED");
        guard = committed;
      } else {
        guard = await readGuard(parent, guardPath, guardName);
        assertGuardCoordinates(guard);
      }

      const guardAgain = await readGuard(parent, guardPath, guardName);
      if (stableJson(guardAgain) !== stableJson(guard)) failure("GKX_EVAL_OUTPUT_GUARD_CHANGED");
      await assertAbsent(guardStagingPath, "GKX_EVAL_OUTPUT_GUARD_STAGING_REMAINS");
      let finalState = await optionalState(canonicalFinal);
      let temporaryState = await optionalState(temporaryPath);
      if (finalState === null && temporaryState === null) {
        await writeNewFile(parent, temporaryPath, temporaryName, candidateBytes, "GKX_EVAL_OUTPUT_TEMP_WRITE_INVALID");
        await syncDirectory(canonicalParent);
        temporaryState = await optionalState(temporaryPath);
      } else if (finalState === null && temporaryState !== null && temporaryState.nlink === 1n) {
        const canonicalTemporary = await canonicalPath(temporaryPath, { alias_error: "GKX_EVAL_OUTPUT_PRECOMMIT_INVALID" });
        if (!sameCanonicalPath(dirname(canonicalTemporary), parent.canonical_path) || basename(canonicalTemporary) !== temporaryName) {
          failure("GKX_EVAL_OUTPUT_PRECOMMIT_INVALID");
        }
        assertPrivateFile(temporaryState, 1n, "GKX_EVAL_OUTPUT_PRECOMMIT_INVALID");
        let exact = false;
        let temporaryIdentity = fileIdentity(temporaryPath, canonicalTemporary, temporaryState);
        if (temporaryState.size >= 1n && temporaryState.size <= BigInt(MAX_CANDIDATE_TOML_BYTES)) {
          const read = await secureRead(parent, temporaryPath, temporaryName, MAX_CANDIDATE_TOML_BYTES, 1n,
            "GKX_EVAL_OUTPUT_PRECOMMIT_INVALID");
          temporaryIdentity = read.identity;
          exact = read.bytes.equals(candidateBytes) && retrievalSha256(read.bytes) === retrievalSha256(candidateBytes);
        }
        if (!exact) {
          await cleanupCreatedFile(parent, temporaryPath, temporaryName, temporaryIdentity,
            "GKX_EVAL_OUTPUT_PRECOMMIT_CLEANUP_INVALID");
          await writeNewFile(parent, temporaryPath, temporaryName, candidateBytes, "GKX_EVAL_OUTPUT_TEMP_WRITE_INVALID");
          await syncDirectory(canonicalParent);
          temporaryState = await optionalState(temporaryPath);
        }
      }
      let linked = false;
      if (finalState === null && temporaryState !== null) {
        await verifyCandidateFile(parent, temporaryPath, temporaryName, candidateBytes, 1n, "GKX_EVAL_OUTPUT_PRECOMMIT_INVALID");
        await publication.revalidate_authority();
        await revalidate();
        try { await link(temporaryPath, canonicalFinal); }
        catch { return failure("GKX_EVAL_OUTPUT_LINK_FAILED"); }
        linked = true;
        await verifyLinkedPair(parent, canonicalFinal, outputBasename, temporaryPath, temporaryName, candidateBytes);
      } else if (finalState !== null && temporaryState !== null) {
        await verifyLinkedPair(parent, canonicalFinal, outputBasename, temporaryPath, temporaryName, candidateBytes);
        linked = true;
      } else if (finalState !== null && temporaryState === null) {
        await verifyCandidateFile(parent, canonicalFinal, outputBasename, candidateBytes, 1n, "GKX_EVAL_OUTPUT_FINALIZE_INVALID");
      } else failure("GKX_EVAL_OUTPUT_RECOVERY_STATE_INVALID");

      try {
        await publication.revalidate_authority();
        await revalidate();
      } catch (error) {
        if (linked) {
          await verifyLinkedPair(parent, canonicalFinal, outputBasename, temporaryPath, temporaryName, candidateBytes);
          await unlink(canonicalFinal);
          await syncDirectory(canonicalParent);
          await verifyCandidateFile(parent, temporaryPath, temporaryName, candidateBytes, 1n, "GKX_EVAL_OUTPUT_ROLLBACK_INVALID");
        }
        throw error;
      }

      let finalIdentity: OutputFileIdentity;
      if (linked) {
        await verifyLinkedPair(parent, canonicalFinal, outputBasename, temporaryPath, temporaryName, candidateBytes);
        await unlink(temporaryPath);
        await syncDirectory(canonicalParent);
        finalIdentity = await verifyCandidateFile(parent, canonicalFinal, outputBasename, candidateBytes, 1n,
          "GKX_EVAL_OUTPUT_FINAL_INVALID");
      } else {
        finalIdentity = await verifyCandidateFile(parent, canonicalFinal, outputBasename, candidateBytes, 1n,
          "GKX_EVAL_OUTPUT_FINAL_INVALID");
      }
      try {
        await publication.revalidate_authority();
        await revalidate();
      } catch (error) {
        await assertAbsent(temporaryPath, "GKX_EVAL_OUTPUT_ROLLBACK_TEMP_PRESENT");
        await verifyCandidateFile(parent, canonicalFinal, outputBasename, candidateBytes, 1n,
          "GKX_EVAL_OUTPUT_ROLLBACK_FINAL_INVALID");
        try { await link(canonicalFinal, temporaryPath); }
        catch { return failure("GKX_EVAL_OUTPUT_ROLLBACK_LINK_FAILED"); }
        await verifyLinkedPair(parent, canonicalFinal, outputBasename, temporaryPath, temporaryName, candidateBytes);
        await unlink(canonicalFinal);
        await syncDirectory(canonicalParent);
        await verifyCandidateFile(parent, temporaryPath, temporaryName, candidateBytes, 1n,
          "GKX_EVAL_OUTPUT_ROLLBACK_INVALID");
        throw error;
      }
      const guardFinal = await readGuard(parent, guardPath, guardName);
      if (stableJson(guardFinal) !== stableJson(guard)) failure("GKX_EVAL_OUTPUT_GUARD_CHANGED");
      await unlink(guardPath);
      await syncDirectory(canonicalParent);
      await revalidate();
      const finalVerified = await verifyCandidateFile(parent, canonicalFinal, outputBasename, candidateBytes, 1n,
        "GKX_EVAL_OUTPUT_FINAL_INVALID");
      if (!sameFileIdentity(finalIdentity, await lstat(finalVerified.canonical_path, { bigint: true }))) {
        failure("GKX_EVAL_OUTPUT_FINAL_CHANGED");
      }
      await assertAbsent(guardPath, "GKX_EVAL_OUTPUT_GUARD_REMAINS");
      await assertAbsent(guardStagingPath, "GKX_EVAL_OUTPUT_GUARD_STAGING_REMAINS");
      await assertAbsent(temporaryPath, "GKX_EVAL_OUTPUT_TEMP_REMAINS");
    },
  };
}
