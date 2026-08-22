import { randomBytes } from "node:crypto";
import { open, lstat, mkdir, rm } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, parse, resolve } from "node:path";
import { canonicalPath, canonicalPathContains, sameCanonicalPath } from "./path-security";
import { parseRetrievalEvaluationGoldenToml } from "./evaluation-golden";
import { retrievalCanonicalDigest, retrievalSha256, stableJson } from "./digest";
import { RETRIEVAL_EVALUATION_NDCG_TABLE, sealRetrievalEvaluationBaseline } from "./evaluation";
import {
  deriveRetrievalEvaluationExecutableEnvironmentBundle,
  sealRetrievalEvaluationFixedProviderTranscript,
  sealRetrievalEvaluationFixtureCatalog,
  sealRetrievalEvaluationSourceCorpus,
  type RetrievalEvaluationEnvironmentBundle,
} from "./evaluation-fixtures";
import {
  sealRetrievalEvaluationExecutableReviewedBundle,
  sealRetrievalEvaluationMetricComputationFixture,
  sealRetrievalEvaluationReviewedBundle,
  RETRIEVAL_EVALUATION_PROJECTION_MANIFEST_SET_VERSION,
  type RetrievalEvaluationMetricComputationFixture,
} from "./evaluation-reviewed-bundle";
import { sealRetrievalEvaluationTunePriorityFixture } from "./evaluation-tune-priority";
import {
  RETRIEVAL_EVALUATION_EXECUTION_AUTHORITY_VERSION,
  sealRetrievalEvaluationExecutionAuthority,
  type RetrievalEvaluationExecutableInput,
} from "./evaluation-executor";

const MAX_PATH_UNITS = 4096;
const MAX_GOLDEN_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_CORPUS_FILE_BYTES = 768 * 1024 * 1024;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const DOS_STEM_RE = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|CLOCK\$|COM(?:[1-9]|[¹²³])|LPT(?:[1-9]|[¹²³]))$/u;
const FATAL_UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

interface FileIdentity {
  raw_path: string;
  canonical_path: string;
  device: bigint;
  inode: bigint;
  mode: bigint;
  owner: bigint;
  link_count: bigint;
  size: bigint;
  mtime_ns: bigint;
  ctime_ns: bigint;
}

interface DirectoryIdentity extends Omit<FileIdentity, "size"> { size: bigint }

interface CompanionLocator { file: string; digest: string }

export interface RetrievalEvaluationFixtureCapability {
  input: RetrievalEvaluationExecutableInput;
  fixture_root: string;
  input_paths: readonly string[];
  revalidate(): Promise<void>;
}

export interface RetrievalEvaluationTemporaryCapability {
  path: string;
  identity: DirectoryIdentity;
  revalidate(): Promise<void>;
  cleanup(): Promise<void>;
}

function failure(code: string): never { throw new Error(code); }

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

async function assertExactSiblingAbsent(root: DirectoryIdentity, name: string): Promise<void> {
  const path = join(root.canonical_path, name);
  try {
    await lstat(path, { bigint: true });
    failure("GKX_EVAL_CLI_OPTIONAL_COMPANION_PRESENT");
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
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

function forbiddenLocalNamespace(value: string): boolean {
  if (/^(?:[\\/]{2}|[\\/]\?\?[\\/])/u.test(value)) return true;
  if (/^(?:[a-z][a-z0-9+.-]*):\/\//iu.test(value)) return true;
  const portable = value.replaceAll("\\", "/");
  if (portable.includes("//")) return true;
  const drive = /^[A-Za-z]:/u.test(portable);
  if (drive && (process.platform !== "win32" || !/^[A-Za-z]:\//u.test(portable))) return true;
  const tail = drive ? portable.slice(2) : portable;
  if (tail.includes(":")) return true;
  for (const component of tail.split("/")) {
    if (!component || component === "." || component === "..") continue;
    if (/[ .]$/u.test(component) || DOS_STEM_RE.test(component.split(".", 1)[0].toUpperCase())) return true;
  }
  return false;
}

/** Exact local path grammar shared by fixture, temp, and output capabilities. */
export function retrievalEvaluationLocalPath(value: unknown, baseDirectory: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_PATH_UNITS ||
      /[\u0000-\u001f\u007f]/u.test(value) || hasUnpairedSurrogate(value) || forbiddenLocalNamespace(value)) {
    failure("GKX_EVAL_CLI_PATH_INVALID");
  }
  const absolute = resolve(baseDirectory, value);
  if (absolute.length > MAX_PATH_UNITS || parse(absolute).root === absolute || forbiddenLocalNamespace(absolute)) {
    failure("GKX_EVAL_CLI_PATH_INVALID");
  }
  return absolute;
}

function sameDevice(left: bigint, right: bigint): boolean {
  return left === right || process.platform === "win32" && (left === 0n || right === 0n);
}

function identity(path: string, canonical: string, state: BigIntStats): FileIdentity {
  return {
    raw_path: path,
    canonical_path: canonical,
    device: state.dev,
    inode: state.ino,
    mode: state.mode,
    owner: state.uid,
    link_count: state.nlink,
    size: state.size,
    mtime_ns: state.mtimeNs,
    ctime_ns: state.ctimeNs,
  };
}

function sameIdentity(expected: FileIdentity, actual: BigIntStats, kind: "file" | "directory"): boolean {
  return (kind === "file" ? actual.isFile() : actual.isDirectory()) && !actual.isSymbolicLink() &&
    sameDevice(expected.device, actual.dev) && expected.inode === actual.ino && expected.mode === actual.mode &&
    expected.owner === actual.uid && expected.link_count === actual.nlink && expected.size === actual.size &&
    expected.mtime_ns === actual.mtimeNs && expected.ctime_ns === actual.ctimeNs;
}

function sameMutableDirectoryIdentity(expected: DirectoryIdentity, actual: BigIntStats): boolean {
  return actual.isDirectory() && !actual.isSymbolicLink() && sameDevice(expected.device, actual.dev) &&
    expected.inode === actual.ino && expected.mode === actual.mode && expected.owner === actual.uid;
}

function assertOwnedMode(state: BigIntStats, mode: number, code: string): void {
  if (process.platform === "win32") return;
  const euid = typeof process.geteuid === "function" ? BigInt(process.geteuid()) : -1n;
  if (state.uid !== euid || Number(state.mode & 0o7777n) !== mode) failure(code);
}

async function sealDirectory(rawPath: string, code: string): Promise<DirectoryIdentity> {
  const canonical = await canonicalPath(rawPath, { alias_error: code });
  const state = await lstat(canonical, { bigint: true });
  if (!state.isDirectory() || state.isSymbolicLink()) failure(code);
  assertOwnedMode(state, 0o700, code);
  return identity(rawPath, canonical, state);
}

async function readExactFile(
  root: DirectoryIdentity,
  name: string,
  maximumBytes: number,
): Promise<{ bytes: Buffer; identity: FileIdentity }> {
  await revalidateDirectory(root);
  if (basename(name) !== name || name.length < 1) failure("GKX_EVAL_CLI_FIXTURE_NAME_INVALID");
  const rawPath = join(root.canonical_path, name);
  const canonical = await canonicalPath(rawPath, { alias_error: "GKX_EVAL_CLI_FIXTURE_ALIAS_REJECTED" });
  if (!canonicalPathContains(root.canonical_path, canonical) || dirname(canonical) !== root.canonical_path || basename(canonical) !== name) {
    failure("GKX_EVAL_CLI_FIXTURE_NAME_INVALID");
  }
  const before = await lstat(canonical, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size < 1n || before.size > BigInt(maximumBytes)) {
    failure("GKX_EVAL_CLI_FIXTURE_FILE_INVALID");
  }
  assertOwnedMode(before, 0o600, "GKX_EVAL_CLI_FIXTURE_MODE_INVALID");
  const expected = identity(rawPath, canonical, before);
  let handle: FileHandle | undefined;
  try {
    handle = await open(canonical, "r");
    const opened = await handle.stat({ bigint: true });
    if (!sameIdentity(expected, opened, "file")) failure("GKX_EVAL_CLI_FIXTURE_CHANGED");
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    const openedAfter = await handle.stat({ bigint: true });
    const pathAfter = await lstat(canonical, { bigint: true });
    const canonicalAfter = await canonicalPath(rawPath, { alias_error: "GKX_EVAL_CLI_FIXTURE_ALIAS_REJECTED" });
    if (offset !== Number(before.size) || !sameIdentity(expected, openedAfter, "file") ||
        !sameIdentity(expected, pathAfter, "file") || !sameCanonicalPath(canonical, canonicalAfter)) {
      failure("GKX_EVAL_CLI_FIXTURE_CHANGED");
    }
    await revalidateDirectory(root);
    return { bytes: bytes.subarray(0, offset), identity: expected };
  } finally { await handle?.close(); }
}

function decodeUtf8(bytes: Uint8Array, code: string): string {
  try { return FATAL_UTF8.decode(bytes); }
  catch { return failure(code); }
}

function parseJson(bytes: Uint8Array, code: string): unknown {
  try { return JSON.parse(decodeUtf8(bytes, code)); }
  catch { return failure(code); }
}

function companionLocator(value: unknown, file: string, nullable: boolean): CompanionLocator | null {
  if (value === null && nullable) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) failure("GKX_EVAL_CLI_COMPANION_BINDING_INVALID");
  const item = value as Record<string, unknown>;
  if (stableJson(Object.keys(item).sort()) !== stableJson(["digest", "file"]) || item.file !== file ||
      typeof item.digest !== "string" || !SHA256_RE.test(item.digest)) {
    failure("GKX_EVAL_CLI_COMPANION_BINDING_INVALID");
  }
  return { file, digest: item.digest };
}

type SourceCorpusObjectKind = "root" | "corpus" | "source";

const SOURCE_CORPUS_STRING_LIMITS = {
  contract_version: 128,
  source_corpus_digest: 128,
  vault_fixture: 128,
  corpus_fixture_digest: 128,
  source_id: 128,
  source_path: 1_024,
  source_digest: 128,
  source_bytes_base64: 4 * Math.ceil((64 * 1024 * 1024) / 3),
} as const;

class SourceCorpusJsonReader {
  readonly #handle: FileHandle;
  readonly #expectedBytes: number;
  readonly #decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  #byteOffset = 0;
  #text = "";
  #textOffset = 0;
  #finished = false;

  constructor(handle: FileHandle, expectedBytes: number) {
    this.#handle = handle;
    this.#expectedBytes = expectedBytes;
  }

  async #fill(): Promise<boolean> {
    while (this.#textOffset >= this.#text.length && !this.#finished) {
      this.#text = "";
      this.#textOffset = 0;
      if (this.#byteOffset < this.#expectedBytes) {
        const size = Math.min(64 * 1024, this.#expectedBytes - this.#byteOffset);
        const bytes = Buffer.allocUnsafe(size);
        const read = await this.#handle.read(bytes, 0, size, this.#byteOffset);
        if (read.bytesRead === 0) failure("GKX_EVAL_CLI_FIXTURE_CHANGED");
        this.#byteOffset += read.bytesRead;
        try { this.#text = this.#decoder.decode(bytes.subarray(0, read.bytesRead), { stream: true }); }
        catch { failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID"); }
        continue;
      }
      const extra = Buffer.allocUnsafe(1);
      const beyond = await this.#handle.read(extra, 0, 1, this.#expectedBytes);
      if (beyond.bytesRead !== 0) failure("GKX_EVAL_CLI_FIXTURE_CHANGED");
      try { this.#text = this.#decoder.decode(); }
      catch { failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID"); }
      this.#finished = true;
    }
    return this.#textOffset < this.#text.length;
  }

  async #peek(): Promise<string | null> {
    return await this.#fill() ? this.#text[this.#textOffset] : null;
  }

  async #take(): Promise<string> {
    const value = await this.#peek();
    if (value === null) failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID");
    this.#textOffset += 1;
    return value;
  }

  async #whitespace(): Promise<void> {
    while (true) {
      const value = await this.#peek();
      if (value !== " " && value !== "\t" && value !== "\n" && value !== "\r") return;
      this.#textOffset += 1;
    }
  }

  async #expect(expected: string): Promise<void> {
    if (await this.#take() !== expected) failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID");
  }

  async #string(maximumUnits: number): Promise<string> {
    await this.#expect('"');
    const parts: string[] = [];
    let units = 0;
    while (true) {
      if (!await this.#fill()) failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID");
      const start = this.#textOffset;
      while (this.#textOffset < this.#text.length) {
        const code = this.#text.charCodeAt(this.#textOffset);
        if (code === 0x22 || code === 0x5c || code <= 0x1f) break;
        this.#textOffset += 1;
      }
      if (this.#textOffset > start) {
        const part = this.#text.slice(start, this.#textOffset);
        units += part.length;
        if (units > maximumUnits) failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID");
        parts.push(part);
      }
      if (this.#textOffset >= this.#text.length) continue;
      const marker = await this.#take();
      if (marker === '"') return parts.join("");
      if (marker !== "\\") failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID");
      const escape = await this.#take();
      const simple = new Map<string, string>([
        ['"', '"'], ["\\", "\\"], ["/", "/"], ["b", "\b"], ["f", "\f"],
        ["n", "\n"], ["r", "\r"], ["t", "\t"],
      ]);
      let decoded = simple.get(escape);
      if (decoded === undefined && escape === "u") {
        let hex = "";
        for (let index = 0; index < 4; index += 1) hex += await this.#take();
        if (!/^[0-9A-Fa-f]{4}$/u.test(hex)) failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID");
        decoded = String.fromCharCode(Number.parseInt(hex, 16));
      }
      if (decoded === undefined) failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID");
      units += decoded.length;
      if (units > maximumUnits) failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID");
      parts.push(decoded);
    }
  }

  async #array(kind: "corpus" | "source", maximum: number): Promise<unknown[]> {
    await this.#expect("[");
    await this.#whitespace();
    const values: unknown[] = [];
    if (await this.#peek() === "]") { await this.#take(); return values; }
    while (true) {
      if (values.length >= maximum) failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID");
      values.push(await this.#object(kind));
      await this.#whitespace();
      const separator = await this.#take();
      if (separator === "]") return values;
      if (separator !== ",") failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID");
      await this.#whitespace();
    }
  }

  async #object(kind: SourceCorpusObjectKind): Promise<Record<string, unknown>> {
    const allowed = kind === "root"
      ? new Set(["contract_version", "corpora", "source_corpus_digest"])
      : kind === "corpus"
        ? new Set(["vault_fixture", "source_files", "corpus_fixture_digest"])
        : new Set(["source_id", "source_path", "source_digest", "source_bytes_base64"]);
    await this.#expect("{");
    await this.#whitespace();
    const result: Record<string, unknown> = {};
    if (await this.#peek() === "}") { await this.#take(); return result; }
    while (true) {
      const key = await this.#string(64);
      if (!allowed.has(key) || Object.hasOwn(result, key)) failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID");
      await this.#whitespace();
      await this.#expect(":");
      await this.#whitespace();
      if (key === "corpora") result[key] = await this.#array("corpus", 256);
      else if (key === "source_files") result[key] = await this.#array("source", 4_096);
      else result[key] = await this.#string(SOURCE_CORPUS_STRING_LIMITS[key as keyof typeof SOURCE_CORPUS_STRING_LIMITS]);
      await this.#whitespace();
      const separator = await this.#take();
      if (separator === "}") return result;
      if (separator !== ",") failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID");
      await this.#whitespace();
    }
  }

  async parse(): Promise<Record<string, unknown>> {
    await this.#whitespace();
    const value = await this.#object("root");
    await this.#whitespace();
    if (await this.#peek() !== null) failure("GKX_EVAL_CLI_SOURCE_CORPUS_INVALID");
    return value;
  }
}

async function readSourceCorpusFile(
  root: DirectoryIdentity,
  name: string,
): Promise<{ value: unknown; identity: FileIdentity }> {
  await revalidateDirectory(root);
  const rawPath = join(root.canonical_path, name);
  const canonical = await canonicalPath(rawPath, { alias_error: "GKX_EVAL_CLI_FIXTURE_ALIAS_REJECTED" });
  if (!canonicalPathContains(root.canonical_path, canonical) || dirname(canonical) !== root.canonical_path || basename(canonical) !== name) {
    failure("GKX_EVAL_CLI_FIXTURE_NAME_INVALID");
  }
  const before = await lstat(canonical, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size < 1n ||
      before.size > BigInt(MAX_SOURCE_CORPUS_FILE_BYTES)) failure("GKX_EVAL_CLI_FIXTURE_FILE_INVALID");
  assertOwnedMode(before, 0o600, "GKX_EVAL_CLI_FIXTURE_MODE_INVALID");
  const expected = identity(rawPath, canonical, before);
  let handle: FileHandle | undefined;
  try {
    handle = await open(canonical, "r");
    const opened = await handle.stat({ bigint: true });
    if (!sameIdentity(expected, opened, "file")) failure("GKX_EVAL_CLI_FIXTURE_CHANGED");
    const value = await new SourceCorpusJsonReader(handle, Number(before.size)).parse();
    const openedAfter = await handle.stat({ bigint: true });
    const pathAfter = await lstat(canonical, { bigint: true });
    const canonicalAfter = await canonicalPath(rawPath, { alias_error: "GKX_EVAL_CLI_FIXTURE_ALIAS_REJECTED" });
    if (!sameIdentity(expected, openedAfter, "file") || !sameIdentity(expected, pathAfter, "file") ||
        !sameCanonicalPath(canonical, canonicalAfter)) failure("GKX_EVAL_CLI_FIXTURE_CHANGED");
    await revalidateDirectory(root);
    return { value, identity: expected };
  } finally { await handle?.close(); }
}

async function revalidateDirectory(expected: DirectoryIdentity): Promise<void> {
  const canonical = await canonicalPath(expected.raw_path, { alias_error: "GKX_EVAL_CLI_FIXTURE_CHANGED" });
  const state = await lstat(expected.canonical_path, { bigint: true });
  if (!sameCanonicalPath(canonical, expected.canonical_path) || !sameIdentity(expected, state, "directory")) {
    failure("GKX_EVAL_CLI_FIXTURE_CHANGED");
  }
}

async function revalidateFile(expected: FileIdentity): Promise<void> {
  const canonical = await canonicalPath(expected.raw_path, { alias_error: "GKX_EVAL_CLI_FIXTURE_CHANGED" });
  const state = await lstat(expected.canonical_path, { bigint: true });
  if (!sameCanonicalPath(canonical, expected.canonical_path) || !sameIdentity(expected, state, "file")) {
    failure("GKX_EVAL_CLI_FIXTURE_CHANGED");
  }
}

export async function openRetrievalEvaluationFixtureCapability(
  fixturePathValue: unknown,
  currentDirectory = process.cwd(),
): Promise<RetrievalEvaluationFixtureCapability> {
  const rawGolden = retrievalEvaluationLocalPath(fixturePathValue, currentDirectory);
  const rawGoldenLeaf = basename(rawGolden);
  const canonicalGolden = await canonicalPath(rawGolden, { alias_error: "GKX_EVAL_CLI_FIXTURE_ALIAS_REJECTED" });
  const goldenLeaf = basename(canonicalGolden);
  if (goldenLeaf.length < 1 || Buffer.byteLength(goldenLeaf, "utf8") > 255) failure("GKX_EVAL_CLI_FIXTURE_NAME_INVALID");
  const fixtureRoot = await sealDirectory(dirname(rawGolden), "GKX_EVAL_CLI_FIXTURE_ROOT_INVALID");
  if (!sameCanonicalPath(dirname(canonicalGolden), fixtureRoot.canonical_path) ||
      rawGoldenLeaf !== goldenLeaf && rawGoldenLeaf.toLowerCase() === goldenLeaf.toLowerCase()) {
    failure("GKX_EVAL_CLI_FIXTURE_NAME_INVALID");
  }
  const fileIdentities: FileIdentity[] = [];
  const read = async (name: string, limit = MAX_JSON_BYTES): Promise<Buffer> => {
    const result = await readExactFile(fixtureRoot, name, limit);
    fileIdentities.push(result.identity);
    return result.bytes;
  };
  const goldenRead = await readExactFile(fixtureRoot, goldenLeaf, MAX_GOLDEN_BYTES);
  if (!sameCanonicalPath(goldenRead.identity.canonical_path, canonicalGolden)) failure("GKX_EVAL_CLI_FIXTURE_NAME_INVALID");
  fileIdentities.push(goldenRead.identity);
  const golden = parseRetrievalEvaluationGoldenToml(decodeUtf8(goldenRead.bytes, "GKX_EVAL_CLI_FIXTURE_UTF8_INVALID"));
  const conformanceBytes = await read("conformance-fixture.json");
  const conformance = parseJson(conformanceBytes, "GKX_EVAL_CLI_CONFORMANCE_INVALID") as Record<string, any>;
  if (conformance?.golden?.toml_file !== goldenLeaf || stableJson(conformance.golden.expected_normalized) !== stableJson(golden)) {
    failure("GKX_EVAL_CLI_GOLDEN_BINDING_INVALID");
  }
  const fixtureFiles = conformance.fixture_files as Record<string, unknown> | undefined;
  if (!fixtureFiles || typeof fixtureFiles !== "object" || Array.isArray(fixtureFiles)) {
    failure("GKX_EVAL_CLI_COMPANION_BINDING_INVALID");
  }
  if (stableJson(Object.keys(fixtureFiles).sort()) !== stableJson([
    "fixed_provider", "fixture_catalog", "metric_computation", "reviewed_bundle", "source_corpus", "tune_priority",
  ])) failure("GKX_EVAL_CLI_COMPANION_BINDING_INVALID");
  const providerLocator = companionLocator(fixtureFiles.fixed_provider, "fixed-provider.json", true);
  const catalogLocator = companionLocator(fixtureFiles.fixture_catalog, "fixture-catalog.json", false)!;
  const sourceLocator = companionLocator(fixtureFiles.source_corpus, "source-corpus.json", false)!;
  const metricLocator = companionLocator(fixtureFiles.metric_computation, "metric-computation-fixture.json", false)!;
  const priorityLocator = companionLocator(fixtureFiles.tune_priority, "tune-priority-fixture.json", false)!;
  const reviewedLocator = companionLocator(fixtureFiles.reviewed_bundle, "reviewed-bundle.json", true);
  if (conformance.ndcg?.table_file !== "ndcg-discount-table.json") failure("GKX_EVAL_CLI_NDCG_BINDING_INVALID");
  const [catalogRaw, metricRaw, priorityRaw, ndcgRaw] = await Promise.all([
    read("fixture-catalog.json"),
    read("metric-computation-fixture.json"),
    read("tune-priority-fixture.json"),
    read("ndcg-discount-table.json"),
  ]);
  const readLocatedOptional = async (locator: CompanionLocator): Promise<Buffer> => {
    try {
      return await read(locator.file);
    } catch (error) {
      if (isMissing(error)) failure("GKX_EVAL_CLI_OPTIONAL_COMPANION_MISSING");
      throw error;
    }
  };
  const providerRaw = providerLocator === null ? null : await readLocatedOptional(providerLocator);
  const reviewedRaw = reviewedLocator === null ? null : await readLocatedOptional(reviewedLocator);
  const absentCompanions: string[] = [];
  if (providerLocator === null) {
    await assertExactSiblingAbsent(fixtureRoot, "fixed-provider.json");
    absentCompanions.push("fixed-provider.json");
  }
  if (reviewedLocator === null) {
    await assertExactSiblingAbsent(fixtureRoot, "reviewed-bundle.json");
    absentCompanions.push("reviewed-bundle.json");
  }
  const sourceRead = await readSourceCorpusFile(fixtureRoot, "source-corpus.json");
  fileIdentities.push(sourceRead.identity);
  const provider = providerRaw === null ? null :
    sealRetrievalEvaluationFixedProviderTranscript(parseJson(providerRaw, "GKX_EVAL_CLI_PROVIDER_INVALID"));
  const catalog = sealRetrievalEvaluationFixtureCatalog(parseJson(catalogRaw, "GKX_EVAL_CLI_CATALOG_INVALID"));
  const sourceCorpus = sealRetrievalEvaluationSourceCorpus(sourceRead.value);
  const metricFixture = sealRetrievalEvaluationMetricComputationFixture(
    parseJson(metricRaw, "GKX_EVAL_CLI_METRIC_FIXTURE_INVALID"),
  );
  const priorityFixture = sealRetrievalEvaluationTunePriorityFixture(parseJson(priorityRaw, "GKX_EVAL_CLI_TUNE_PRIORITY_INVALID"));
  const reviewed = reviewedRaw === null ? null :
    sealRetrievalEvaluationReviewedBundle(parseJson(reviewedRaw, "GKX_EVAL_CLI_REVIEWED_BUNDLE_INVALID"));
  const ndcg = parseJson(ndcgRaw, "GKX_EVAL_CLI_NDCG_INVALID");
  if (providerLocator?.digest !== (provider?.provider_fixture_digest ?? undefined) ||
      catalogLocator.digest !== catalog.catalog_digest || sourceLocator.digest !== sourceCorpus.source_corpus_digest ||
      metricLocator.digest !== metricFixture.fixture_digest || priorityLocator.digest !== priorityFixture.fixture_digest ||
      reviewedLocator?.digest !== (reviewed?.reviewed_bundle_digest ?? undefined) ||
      conformance.ndcg.table_digest !== RETRIEVAL_EVALUATION_NDCG_TABLE.table_digest ||
      stableJson(ndcg) !== stableJson(RETRIEVAL_EVALUATION_NDCG_TABLE)) {
    failure("GKX_EVAL_CLI_COMPANION_DIGEST_MISMATCH");
  }
  if (reviewed !== null && (reviewed.conformance_file !== "conformance-fixture.json" ||
      reviewed.golden_toml_file !== goldenLeaf || reviewed.source_corpus_file !== sourceLocator.file ||
      reviewed.fixture_catalog_file !== catalogLocator.file || reviewed.fixed_provider_file !== providerLocator?.file ||
      reviewed.metric_computation_file !== metricLocator.file)) {
    failure("GKX_EVAL_CLI_COMPANION_DIGEST_MISMATCH");
  }
  const baseline = sealRetrievalEvaluationBaseline(conformance.valid_envelopes?.baseline);
  const environmentBundle: RetrievalEvaluationEnvironmentBundle = {
    environment_set: conformance.valid_envelopes?.environment_set,
    normalized_golden: golden,
    fixture_catalog: catalog,
    source_corpus: sourceCorpus,
    fixed_provider_transcript: provider,
    projection_manifests: conformance.valid_envelopes?.projection_manifests,
  };
  const derivedEnvironment = deriveRetrievalEvaluationExecutableEnvironmentBundle(environmentBundle);
  const sealedEnvironment = derivedEnvironment.bundle;
  if (baseline.normalized_golden_digest !== sealedEnvironment.normalized_golden.golden_digest ||
      baseline.environment_set_digest !== sealedEnvironment.environment_set.environment_set_digest) {
    failure("GKX_EVAL_CLI_BASELINE_BINDING_INVALID");
  }
  if (derivedEnvironment.derivations.some((derivation) => derivation.provider_scenario !== null &&
      stableJson(derivation.provider_scenario.eval_schedule.evaluation_axes) !== stableJson(baseline.selected_axes))) {
    failure("GKX_EVAL_CLI_BASELINE_BINDING_INVALID");
  }
  const anyActiveRole = sealedEnvironment.environment_set.members.some((member) =>
    member.environment.embedding_role.state === "active" || member.environment.reranker_role.state === "active");
  if (anyActiveRole !== (provider !== null)) failure("GKX_EVAL_CLI_PROVIDER_CONDITIONAL_INVALID");
  const projectionManifestSetDigest = retrievalCanonicalDigest({
    contract_version: RETRIEVAL_EVALUATION_PROJECTION_MANIFEST_SET_VERSION,
    manifests: sealedEnvironment.environment_set.members.map((member) => {
      const derivation = derivedEnvironment.derivations.find((item) =>
        item.vault_fixture === member.environment.vault_fixture) ?? failure("GKX_EVAL_CLI_PROJECTION_BINDING_INVALID");
      return {
        vault_fixture: derivation.vault_fixture,
        projection_id: derivation.manifest.projection_id,
        projection_digest: derivation.manifest.projection_digest,
      };
    }),
  });
  const authorityMaterial = {
    contract_version: RETRIEVAL_EVALUATION_EXECUTION_AUTHORITY_VERSION,
    golden_toml_digest: retrievalSha256(goldenRead.bytes),
    normalized_golden_digest: golden.golden_digest,
    conformance_fixture_digest: retrievalSha256(conformanceBytes),
    environment_set_digest: sealedEnvironment.environment_set.environment_set_digest,
    baseline_digest: baseline.baseline_digest,
    fixture_catalog_digest: catalog.catalog_digest,
    source_corpus_digest: sourceCorpus.source_corpus_digest,
    fixed_provider_digest: provider?.provider_fixture_digest ?? null,
    metric_computation_fixture_digest: metricFixture.fixture_digest,
    tune_priority_fixture_digest: priorityFixture.fixture_digest,
    ndcg_table_digest: RETRIEVAL_EVALUATION_NDCG_TABLE.table_digest,
    projection_manifest_set_digest: projectionManifestSetDigest,
    reviewed_bundle_digest: reviewed?.reviewed_bundle_digest ?? null,
  };
  const executionAuthority = sealRetrievalEvaluationExecutionAuthority({
    ...authorityMaterial,
    execution_authority_digest: retrievalCanonicalDigest(authorityMaterial),
  });
  const input: RetrievalEvaluationExecutableInput = {
    environment_bundle: sealedEnvironment,
    baseline,
    metric_computation_fixture: metricFixture,
    reviewed_bundle: reviewed,
    execution_authority: executionAuthority,
  };
  if (reviewed !== null) {
    sealRetrievalEvaluationExecutableReviewedBundle({
      reviewed_bundle: reviewed,
      environment_bundle: sealedEnvironment,
      baseline,
      metric_computation_fixture: metricFixture,
    });
  }
  await revalidateDirectory(fixtureRoot);
  for (const file of fileIdentities) await revalidateFile(file);
  for (const name of absentCompanions) await assertExactSiblingAbsent(fixtureRoot, name);
  await revalidateDirectory(fixtureRoot);
  const revalidateRawGolden = async () => {
    const canonical = await canonicalPath(rawGolden, { alias_error: "GKX_EVAL_CLI_FIXTURE_CHANGED" });
    if (!sameCanonicalPath(canonical, canonicalGolden) || basename(canonical) !== goldenLeaf) {
      failure("GKX_EVAL_CLI_FIXTURE_CHANGED");
    }
  };
  await revalidateRawGolden();
  return {
    input,
    fixture_root: fixtureRoot.canonical_path,
    input_paths: Object.freeze(fileIdentities.map((item) => item.canonical_path)),
    async revalidate() {
      await revalidateRawGolden();
      await revalidateDirectory(fixtureRoot);
      for (const file of fileIdentities) await revalidateFile(file);
      for (const name of absentCompanions) await assertExactSiblingAbsent(fixtureRoot, name);
      await revalidateDirectory(fixtureRoot);
    },
  };
}

function validTempParent(state: BigIntStats): boolean {
  if (process.platform === "win32") return state.isDirectory() && !state.isSymbolicLink();
  const euid = typeof process.geteuid === "function" ? BigInt(process.geteuid()) : -1n;
  const mode = Number(state.mode & 0o7777n);
  return state.isDirectory() && !state.isSymbolicLink() &&
    (state.uid === euid && mode === 0o700 || state.uid === 0n && mode === 0o1777);
}

export async function createRetrievalEvaluationTemporaryCapability(): Promise<RetrievalEvaluationTemporaryCapability> {
  const rawParent = retrievalEvaluationLocalPath(tmpdir(), process.cwd());
  const parentCanonical = await canonicalPath(rawParent, { alias_error: "GKX_EVAL_TEMP_PARENT_ALIAS_REJECTED" });
  const parentState = await lstat(parentCanonical, { bigint: true });
  if (!validTempParent(parentState)) failure("GKX_EVAL_TEMP_PARENT_INVALID");
  const sealedParent = identity(rawParent, parentCanonical, parentState) as DirectoryIdentity;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const name = `gkx-retrieval-evaluation-${randomBytes(16).toString("hex")}`;
    const child = join(parentCanonical, name);
    try { await mkdir(child, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") continue; throw error; }
    const canonical = await canonicalPath(child, { alias_error: "GKX_EVAL_TEMP_CHILD_ALIAS_REJECTED" });
    const state = await lstat(canonical, { bigint: true });
    if (!canonicalPathContains(parentCanonical, canonical) || dirname(canonical) !== parentCanonical || basename(canonical) !== name ||
        !state.isDirectory() || state.isSymbolicLink()) failure("GKX_EVAL_TEMP_CHILD_INVALID");
    assertOwnedMode(state, 0o700, "GKX_EVAL_TEMP_CHILD_MODE_INVALID");
    const sealed = identity(child, canonical, state);
    const revalidate = async () => {
      const parentNow = await canonicalPath(rawParent, { alias_error: "GKX_EVAL_TEMP_PARENT_CHANGED" });
      const parentMetadata = await lstat(parentCanonical, { bigint: true });
      const now = await canonicalPath(child, { alias_error: "GKX_EVAL_TEMP_CHILD_CHANGED" });
      const metadata = await lstat(canonical, { bigint: true });
      if (!sameCanonicalPath(parentNow, parentCanonical) || !sameMutableDirectoryIdentity(sealedParent, parentMetadata) ||
          !sameCanonicalPath(now, canonical) || dirname(now) !== parentCanonical ||
          !sameMutableDirectoryIdentity(sealed, metadata)) {
        failure("GKX_EVAL_TEMP_CHILD_CHANGED");
      }
    };
    return {
      path: canonical,
      identity: sealed,
      revalidate,
      async cleanup() {
        await revalidate();
        await rm(canonical, { recursive: true, force: false });
      },
    };
  }
  return failure("GKX_EVAL_TEMP_CHILD_COLLISION");
}
