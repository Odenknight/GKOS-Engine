import { DatabaseSync } from "node:sqlite";
import { chmodSync, linkSync, lstatSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, parse, resolve } from "node:path";
import { types as utilTypes } from "node:util";
import { ENGINE_VERSION } from "../version";
import {
  RETRIEVAL_CHUNKER_VERSION,
  RETRIEVAL_CONTRACT_VERSION,
  RETRIEVAL_LINEAGE_CONTRACT_VERSION,
  RETRIEVAL_LINEAGE_PROJECTION_SCHEMA_VERSION,
  RETRIEVAL_PROVENANCE_CONTRACT_VERSION,
  RETRIEVAL_PROJECTION_SCHEMA_VERSION,
  RETRIEVAL_GKX_PROJECTION_PROFILE,
  RETRIEVAL_GKX_STANDARD_COMMIT,
  RETRIEVAL_TOKENIZER_VERSION,
} from "./contracts";
import { validateRetrievalChunk } from "./chunker";
import { validateGkxRetrievalCanonicalSourceSet, validateGkxRetrievalStoredSourceProvenance } from "./provenance";
import {
  gkxRetrievalCandidateChunkKey,
  gkxRetrievalCandidateDeclarationDigest,
  validateGkxRetrievalCandidateChunk,
  validateGkxRetrievalCandidateDeclaration,
  validateGkxRetrievalCandidateSource,
  validateGkxRetrievalCandidateVector,
  type GkxRetrievalCandidateChunk,
  type GkxRetrievalCandidateDeclaration,
  type GkxRetrievalCandidateSource,
  type GkxRetrievalCandidateVector,
} from "./candidate-types";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, stableJson } from "./digest";
import { cosineSimilarity } from "./fusion";
import { lexicalQueryClauses, lexicalScanMatches, lexicalSignal } from "./lexical";
import { canonicalPathSync, sameCanonicalPath } from "./path-security";
import { assertRetrievalProjectionManifest, isGkxRetrievalProjectionManifest } from "./manifest";
import {
  acquireLegacyRetrievalWriter,
  assertLegacyRetrievalWriterCapability,
  assertLegacyRetrievalWriterCommit,
  bindLegacyRetrievalWriterTarget,
  legacyRetrievalWriterIsHeld,
  releaseLegacyRetrievalWriter,
  verifyLegacyRetrievalWriterTargetPublished,
  type LegacyRetrievalWriterCapability,
} from "./state-writer-lock";
import type { RankedInput } from "./fusion";
import type { AnyRetrievalProjectionManifest, GkxRetrievalProjectionManifest, GkxRetrievalStoredSourceProvenance, RetrievalChunk, RetrievalProjectionManifest, SqliteLexicalBackend } from "./types";

interface SqliteRow { [key: string]: unknown }
export interface StoredVector { chunk_id: string; vector: readonly number[] }
export interface RetrievalGenerationInput {
  state_directory: string;
  vault_id: string;
  source_snapshot_digest: string;
  configuration_digest: string;
  policy_digest: string;
  chunks: readonly RetrievalChunk[];
  vectors?: readonly StoredVector[];
  embedding_provider_id?: string | null;
  embedding_model_id?: string | null;
  embedding_dimensions?: number | null;
  /** Auto is the production default; explicit values support qualification. */
  lexical_backend?: "auto" | SqliteLexicalBackend;
}

/** Exact additive schema-3 candidate input; Phase-1 callers retain the input above. */
export interface GkxRetrievalGenerationInput extends Omit<RetrievalGenerationInput, "chunks" | "vectors"> {
  /** Every intrinsically valid parser candidate, including zero-chunk rows and identity collisions. */
  candidate_sources: readonly GkxRetrievalCandidateSource[];
  /** Parser-owned resolver receipts; raw references remain inside the trusted physical store. */
  candidate_declarations: readonly GkxRetrievalCandidateDeclaration[];
  /** Every local chunk keyed by opaque candidate identity. */
  candidate_chunks: readonly GkxRetrievalCandidateChunk[];
  /**
   * Exact policy-digest-bound candidate-chunk set an inference provider may see.
   * All candidate chunks remain in the local lexical projection; denied
   * chunks never receive a vector and cannot become vector-visible unless a
   * newly policy-bound generation is built.
   */
  embedding_eligible_candidate_chunk_keys: readonly string[];
  vectors?: readonly GkxRetrievalCandidateVector[];
}

export interface BuiltRetrievalGeneration {
  database_path: string;
  pointer_path: string;
  manifest: AnyRetrievalProjectionManifest;
}

/** Trusted-host artifact verified without advancing the Phase-1/2 pointer. */
export interface BuiltUnactivatedRetrievalGeneration {
  database_path: string;
  manifest: AnyRetrievalProjectionManifest;
}

export interface SqliteLexicalCapability {
  sqlite_version: string;
  fts5_available: boolean;
  default_backend: SqliteLexicalBackend;
}

const GENERATION_COMMON_REQUIRED_FIELDS = [
  "state_directory", "vault_id", "source_snapshot_digest", "configuration_digest", "policy_digest",
] as const;
const GENERATION_V2_REQUIRED_FIELDS = [...GENERATION_COMMON_REQUIRED_FIELDS, "chunks"] as const;
const GENERATION_V3_REQUIRED_FIELDS = [
  ...GENERATION_COMMON_REQUIRED_FIELDS,
  "candidate_sources", "candidate_declarations", "candidate_chunks", "embedding_eligible_candidate_chunk_keys",
] as const;
const GENERATION_OPTIONAL_FIELDS = [
  "vectors", "embedding_provider_id", "embedding_model_id", "embedding_dimensions", "lexical_backend",
] as const;
const GENERATION_VECTOR_FIELDS = ["vectors", "embedding_provider_id", "embedding_model_id", "embedding_dimensions"] as const;
const GENERATION_DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
const GENERATION_RECORD_KEY_RE = /^gkx-record:[0-9a-f]{64}:[0-9]+$/u;
const GENERATION_CANDIDATE_CHUNK_KEY_RE = /^gkx-candidate-chunk:[0-9a-f]{64}$/u;

const BASE_SCHEMA_V2 = `
    CREATE TABLE projection_manifest (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      manifest_json TEXT NOT NULL,
      contract_version TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      projection_id TEXT NOT NULL UNIQUE,
      projection_digest TEXT NOT NULL UNIQUE,
      lexical_backend TEXT NOT NULL
    );
    CREATE TABLE sources (
      source_id TEXT PRIMARY KEY,
      source_path TEXT NOT NULL,
      source_digest TEXT NOT NULL
    );
    CREATE TABLE chunks (
      chunk_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
      source_path TEXT NOT NULL,
      source_digest TEXT NOT NULL,
      heading_path_json TEXT NOT NULL,
      heading_depth INTEGER NOT NULL,
      ordinal_within_source INTEGER NOT NULL,
      structural_position TEXT NOT NULL,
      part_ordinal INTEGER NOT NULL,
      start_byte INTEGER NOT NULL,
      end_byte INTEGER NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      content_digest TEXT NOT NULL,
      text TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      parent_chunk_id TEXT REFERENCES chunks(chunk_id) DEFERRABLE INITIALLY DEFERRED,
      lineage_id TEXT,
      valid_from TEXT,
      valid_to TEXT,
      supersedes_json TEXT NOT NULL,
      superseded_by_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      UNIQUE(source_id, ordinal_within_source)
    );
    CREATE TABLE chunk_vectors (
      chunk_id TEXT PRIMARY KEY REFERENCES chunks(chunk_id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      vector_json TEXT NOT NULL
    );
    CREATE INDEX chunks_source_idx ON chunks(source_id);
    CREATE INDEX chunks_path_idx ON chunks(source_path);
    CREATE INDEX chunks_digest_idx ON chunks(source_digest);
    CREATE INDEX chunks_parent_idx ON chunks(parent_chunk_id);
  `;

const BASE_SCHEMA_V3 = `
    CREATE TABLE projection_manifest (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      manifest_json TEXT NOT NULL,
      contract_version TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      projection_id TEXT NOT NULL UNIQUE,
      projection_digest TEXT NOT NULL UNIQUE,
      lexical_backend TEXT NOT NULL
    );
    CREATE TABLE candidate_sources (
      record_key TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_path TEXT NOT NULL,
      source_digest TEXT NOT NULL,
      candidate_json TEXT NOT NULL,
      candidate_digest TEXT NOT NULL
    );
    CREATE TABLE candidate_declarations (
      declaration_digest TEXT PRIMARY KEY,
      source_record_key TEXT NOT NULL REFERENCES candidate_sources(record_key) ON DELETE CASCADE,
      declaration_json TEXT NOT NULL
    );
    CREATE TABLE candidate_chunks (
      candidate_chunk_key TEXT PRIMARY KEY,
      record_key TEXT NOT NULL REFERENCES candidate_sources(record_key) ON DELETE CASCADE,
      public_chunk_id TEXT NOT NULL,
      parent_candidate_chunk_key TEXT REFERENCES candidate_chunks(candidate_chunk_key) DEFERRABLE INITIALLY DEFERRED,
      chunk_json TEXT NOT NULL,
      chunk_digest TEXT NOT NULL,
      UNIQUE(record_key, public_chunk_id)
    );
    CREATE TABLE candidate_chunk_vectors (
      candidate_chunk_key TEXT PRIMARY KEY REFERENCES candidate_chunks(candidate_chunk_key) ON DELETE CASCADE,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      vector_json TEXT NOT NULL
    );
    CREATE TABLE embedding_eligible_candidate_chunks (
      candidate_chunk_key TEXT PRIMARY KEY REFERENCES candidate_chunks(candidate_chunk_key) ON DELETE CASCADE
    );
    CREATE INDEX candidate_sources_uid_idx ON candidate_sources(source_id);
    CREATE INDEX candidate_sources_path_idx ON candidate_sources(source_path);
    CREATE INDEX candidate_chunks_record_idx ON candidate_chunks(record_key);
    CREATE INDEX candidate_chunks_public_idx ON candidate_chunks(public_chunk_id);
    CREATE INDEX candidate_chunks_parent_idx ON candidate_chunks(parent_candidate_chunk_key);
  `;

const FTS5_SCHEMA = `
  CREATE VIRTUAL TABLE chunk_fts USING fts5(
    chunk_id UNINDEXED,
    title,
    heading_path,
    tags,
    topic,
    category,
    text,
    tokenize = 'unicode61 remove_diacritics 2'
  );
`;

const LEXICAL_SCAN_SCHEMA = `
  CREATE TABLE chunk_fts (
    chunk_id TEXT PRIMARY KEY REFERENCES chunks(chunk_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    heading_path TEXT NOT NULL,
    tags TEXT NOT NULL,
    topic TEXT NOT NULL,
    category TEXT NOT NULL,
    text TEXT NOT NULL
  );
`;

const LEXICAL_SCAN_SCHEMA_V3 = `
  CREATE TABLE chunk_fts (
    chunk_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    heading_path TEXT NOT NULL,
    tags TEXT NOT NULL,
    topic TEXT NOT NULL,
    category TEXT NOT NULL,
    text TEXT NOT NULL
  );
`;

function probeFts5(database: DatabaseSync): boolean {
  try {
    database.exec("CREATE VIRTUAL TABLE temp.gkos_fts5_probe USING fts5(value); DROP TABLE temp.gkos_fts5_probe;");
    return true;
  } catch (error) {
    try { database.exec("DROP TABLE IF EXISTS temp.gkos_fts5_probe;"); } catch { /* probe cleanup only */ }
    if (/no such module:\s*fts5/iu.test(String((error as Error).message))) return false;
    throw error;
  }
}

/** Probe the actual bundled SQLite module; no Node-version inference is used. */
export function detectSqliteLexicalCapability(): SqliteLexicalCapability {
  const database = new DatabaseSync(":memory:");
  try {
    const sqliteVersion = String((database.prepare("SELECT sqlite_version() AS version").get() as SqliteRow).version);
    const fts5 = probeFts5(database);
    return {
      sqlite_version: sqliteVersion,
      fts5_available: fts5,
      default_backend: fts5 ? "sqlite_fts5" : "sqlite_lexical_scan",
    };
  } finally {
    database.close();
  }
}

function resolveLexicalBackend(requested: RetrievalGenerationInput["lexical_backend"]): SqliteLexicalBackend {
  const capability = detectSqliteLexicalCapability();
  if (requested === undefined || requested === "auto") return capability.default_backend;
  if (requested !== "sqlite_fts5" && requested !== "sqlite_lexical_scan") throw new TypeError("RETRIEVAL_LEXICAL_BACKEND_INVALID");
  if (requested === "sqlite_fts5" && !capability.fts5_available) throw new Error("SQLITE_FTS5_UNAVAILABLE");
  return requested;
}

function validateStateDirectory(path: string): string {
  if (!path || path.includes("\0")) throw new TypeError("state_directory is invalid.");
  const absolute = resolve(path);
  if (parse(absolute).root === absolute) throw new TypeError("state_directory cannot be a filesystem root.");
  return absolute;
}

function pathExists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function assertRealStateDirectory(directory: string): string {
  const canonical = canonicalPathSync(directory, { alias_error: "RETRIEVAL_STATE_DIRECTORY_SYMLINK_REJECTED" });
  if (!lstatSync(canonical).isDirectory()) throw new Error("RETRIEVAL_STATE_DIRECTORY_SYMLINK_REJECTED");
  return canonical;
}

function assertPlainContainedFile(path: string, directory: string): void {
  const canonical = canonicalPathSync(path, { allow_missing: true, alias_error: "RETRIEVAL_STATE_SYMLINK_REJECTED" });
  if (!sameCanonicalPath(dirname(canonical), directory)) throw new Error("RETRIEVAL_STATE_PATH_ESCAPE");
  if (pathExists(canonical)) {
    const link = lstatSync(canonical);
    if (link.isSymbolicLink() || !link.isFile()) throw new Error("RETRIEVAL_STATE_SYMLINK_REJECTED");
    if (statSync(canonical).nlink > 1) throw new Error("RETRIEVAL_STATE_HARDLINK_REJECTED");
  }
}

function hardenDirectoryPermissions(path: string): void {
  // POSIX mode bits are deterministic here. Windows requires an installer or
  // host-specific ACL and is qualified separately; chmod is not an ACL claim.
  if (process.platform !== "win32") chmodSync(path, 0o700);
}

function hardenFilePermissions(path: string): void {
  if (process.platform !== "win32" && (statSync(path).mode & 0o777) !== 0o600) chmodSync(path, 0o600);
}

function quarantineGenerationFiles(finalPath: string, directory: string): void {
  const suffixes = ["-wal", "-shm", ""].filter((suffix) => pathExists(`${finalPath}${suffix}`));
  if (!suffixes.length) return;
  for (const suffix of suffixes) assertPlainContainedFile(`${finalPath}${suffix}`, directory);
  let ordinal = 0;
  let quarantine = `${finalPath}.corrupt-${process.pid}`;
  while (suffixes.some((suffix) => pathExists(`${quarantine}${suffix}`))) quarantine = `${finalPath}.corrupt-${process.pid}-${++ordinal}`;
  for (const suffix of suffixes) {
    hardenFilePermissions(`${finalPath}${suffix}`);
    const destination = `${quarantine}${suffix}`;
    assertPlainContainedFile(destination, directory);
    renameSync(`${finalPath}${suffix}`, destination);
    hardenFilePermissions(destination);
  }
}

function ftsExpression(query: string): string {
  return lexicalQueryClauses(query).map((clause) => `"${clause.value}"`).join(" AND ");
}

function lexicalScore(row: SqliteRow, query: string): number {
  return lexicalSignal({
    title: String(row.fts_title ?? ""),
    heading_path: String(row.fts_heading_path ?? ""),
    tags: String(row.fts_tags ?? ""),
    topic: String(row.fts_topic ?? ""),
    category: String(row.fts_category ?? ""),
    text: String(row.text ?? ""),
    token_count: Number(row.token_count),
  }, query);
}

function lexicalFields(row: SqliteRow): Parameters<typeof lexicalScanMatches>[0] {
  return {
    title: String(row.fts_title ?? ""),
    heading_path: String(row.fts_heading_path ?? ""),
    tags: String(row.fts_tags ?? ""),
    topic: String(row.fts_topic ?? ""),
    category: String(row.fts_category ?? ""),
    text: String(row.text ?? ""),
    token_count: Number(row.token_count),
  };
}

function declaredLexicalBackend(database: DatabaseSync): SqliteLexicalBackend {
  const row = database.prepare("SELECT type, sql FROM sqlite_schema WHERE name = 'chunk_fts'").get() as SqliteRow | undefined;
  if (!row || row.type !== "table" || typeof row.sql !== "string") throw new Error("RETRIEVAL_LEXICAL_PROJECTION_MISSING");
  const sql = row.sql.trim();
  return /^CREATE\s+VIRTUAL\s+TABLE\s+chunk_fts\s+USING\s+fts5\b/iu.test(sql)
    ? "sqlite_fts5"
    : /^CREATE\s+TABLE\s+chunk_fts\s*\(/iu.test(sql)
      ? "sqlite_lexical_scan"
      : (() => { throw new Error("RETRIEVAL_LEXICAL_SCHEMA_INVALID"); })();
}

function validateLexicalTableColumns(database: DatabaseSync): void {
  const columns = (database.prepare("PRAGMA table_info(chunk_fts)").all() as SqliteRow[]).map((item) => String(item.name));
  if (columns.join("\0") !== "chunk_id\0title\0heading_path\0tags\0topic\0category\0text") throw new Error("RETRIEVAL_LEXICAL_SCHEMA_INVALID");
}

function normalizedSql(value: string): string {
  return value.trim().replace(/;$/u, "").replace(/\s+/gu, " ").replace(/\s*([(),=])\s*/gu, "$1").toLowerCase();
}

function validateLexicalProjectionSchema(database: DatabaseSync, manifest: AnyRetrievalProjectionManifest): void {
  const row = database.prepare("SELECT sql FROM sqlite_schema WHERE name = 'chunk_fts' AND type = 'table'").get() as SqliteRow | undefined;
  if (!row || typeof row.sql !== "string") throw new Error("RETRIEVAL_LEXICAL_SCHEMA_INVALID");
  const expected = manifest.lexical_backend === "sqlite_fts5"
    ? FTS5_SCHEMA
    : isGkxRetrievalProjectionManifest(manifest) ? LEXICAL_SCAN_SCHEMA_V3 : LEXICAL_SCAN_SCHEMA;
  if (normalizedSql(String(row.sql)) !== normalizedSql(expected)) throw new Error("RETRIEVAL_LEXICAL_SCHEMA_INVALID");
}

function rowToChunk(row: SqliteRow): RetrievalChunk {
  return {
    chunk_id: String(row.chunk_id),
    source_id: String(row.source_id),
    source_path: String(row.source_path),
    source_digest: String(row.source_digest),
    heading_path: JSON.parse(String(row.heading_path_json)),
    heading_depth: Number(row.heading_depth),
    ordinal_within_source: Number(row.ordinal_within_source),
    structural_position: String(row.structural_position),
    part_ordinal: Number(row.part_ordinal),
    start_byte: Number(row.start_byte),
    end_byte: Number(row.end_byte),
    start_line: Number(row.start_line),
    end_line: Number(row.end_line),
    content_digest: String(row.content_digest),
    text: String(row.text),
    token_count: Number(row.token_count),
    ...(row.parent_chunk_id ? { parent_chunk_id: String(row.parent_chunk_id) } : {}),
    lineage_id: row.lineage_id === null ? null : String(row.lineage_id),
    valid_from: row.valid_from === null ? null : String(row.valid_from),
    valid_to: row.valid_to === null ? null : String(row.valid_to),
    supersedes: JSON.parse(String(row.supersedes_json)),
    superseded_by: JSON.parse(String(row.superseded_by_json)),
    metadata: JSON.parse(String(row.metadata_json)),
  };
}

function rowToSourceProvenance(row: SqliteRow): GkxRetrievalStoredSourceProvenance {
  const provenance = JSON.parse(String(row.provenance_json)) as GkxRetrievalStoredSourceProvenance;
  validateGkxRetrievalStoredSourceProvenance(provenance);
  if (row.source_id !== provenance.source_id || row.source_path !== provenance.source_path ||
      row.source_digest !== provenance.source_digest || row.metadata_json !== stableJson(provenance.source_metadata) ||
      row.provenance_digest !== provenance.provenance_digest || row.provenance_json !== stableJson(provenance)) {
    throw new Error("RETRIEVAL_SOURCE_PROVENANCE_COLUMNS_MISMATCH");
  }
  return provenance;
}

function rowToCandidateSource(row: SqliteRow): GkxRetrievalCandidateSource {
  const source = JSON.parse(String(row.candidate_json)) as GkxRetrievalCandidateSource;
  validateGkxRetrievalCandidateSource(source);
  if (row.candidate_json !== stableJson(source) || row.record_key !== source.record_key || row.source_id !== source.source_id || row.source_path !== source.source_path ||
      row.source_digest !== source.source_digest || row.candidate_digest !== source.candidate_digest) {
    throw new Error("RETRIEVAL_CANDIDATE_SOURCE_COLUMNS_MISMATCH");
  }
  return source;
}

function rowToCandidateDeclaration(row: SqliteRow): GkxRetrievalCandidateDeclaration {
  const declaration = JSON.parse(String(row.declaration_json)) as GkxRetrievalCandidateDeclaration;
  validateGkxRetrievalCandidateDeclaration(declaration);
  if (row.declaration_json !== stableJson(declaration) || row.source_record_key !== declaration.source_record_key || row.declaration_digest !== gkxRetrievalCandidateDeclarationDigest(declaration)) {
    throw new Error("RETRIEVAL_CANDIDATE_DECLARATION_COLUMNS_MISMATCH");
  }
  return declaration;
}

function rowToCandidateChunk(row: SqliteRow): GkxRetrievalCandidateChunk {
  const candidate: GkxRetrievalCandidateChunk = {
    candidate_chunk_key: String(row.candidate_chunk_key),
    record_key: String(row.record_key),
    parent_candidate_chunk_key: row.parent_candidate_chunk_key === null ? null : String(row.parent_candidate_chunk_key),
    chunk: JSON.parse(String(row.chunk_json)) as RetrievalChunk,
  };
  validateGkxRetrievalCandidateChunk(candidate);
  if (row.chunk_json !== stableJson(candidate.chunk) || row.public_chunk_id !== candidate.chunk.chunk_id || row.chunk_digest !== retrievalCanonicalDigest(candidate)) {
    throw new Error("RETRIEVAL_CANDIDATE_CHUNK_COLUMNS_MISMATCH");
  }
  return candidate;
}

export { assertRetrievalProjectionManifest, isGkxRetrievalProjectionManifest } from "./manifest";

function calculateProjectionDigest(
  manifest: Omit<RetrievalProjectionManifest, "projection_id" | "projection_digest">,
  chunks: readonly RetrievalChunk[],
  vectors: readonly StoredVector[],
): string {
  return retrievalCanonicalDigest({
    contract_version: manifest.contract_version,
    projection_schema_version: manifest.projection_schema_version,
    engine_version: manifest.engine_version,
    vault_id: manifest.vault_id,
    source_snapshot_digest: manifest.source_snapshot_digest,
    configuration_digest: manifest.configuration_digest,
    policy_digest: manifest.policy_digest,
    chunker_version: manifest.chunker_version,
    tokenizer_version: manifest.tokenizer_version,
    lexical_backend: manifest.lexical_backend,
    embedding_provider_id: manifest.embedding_provider_id,
    embedding_model_id: manifest.embedding_model_id,
    embedding_dimensions: manifest.embedding_dimensions,
    source_count: manifest.source_count,
    chunk_count: manifest.chunk_count,
    chunks: [...chunks].sort((a, b) => retrievalCodeUnitCompare(a.chunk_id, b.chunk_id)),
    vectors: [...vectors].sort((a, b) => retrievalCodeUnitCompare(a.chunk_id, b.chunk_id)),
  });
}

function calculateLineageProjectionDigest(
  manifest: Omit<GkxRetrievalProjectionManifest, "projection_id" | "projection_digest">,
  sources: readonly GkxRetrievalCandidateSource[],
  declarations: readonly GkxRetrievalCandidateDeclaration[],
  chunks: readonly GkxRetrievalCandidateChunk[],
  embeddingEligibleChunkKeys: readonly string[],
  vectors: readonly GkxRetrievalCandidateVector[],
): string {
  return retrievalCanonicalDigest({
    contract_version: manifest.contract_version,
    projection_schema_version: manifest.projection_schema_version,
    provenance_contract_version: manifest.provenance_contract_version,
    gkx_standard_commit: manifest.gkx_standard_commit,
    gkx_projection_profile: manifest.gkx_projection_profile,
    engine_version: manifest.engine_version,
    vault_id: manifest.vault_id,
    source_snapshot_digest: manifest.source_snapshot_digest,
    configuration_digest: manifest.configuration_digest,
    policy_digest: manifest.policy_digest,
    chunker_version: manifest.chunker_version,
    tokenizer_version: manifest.tokenizer_version,
    lexical_backend: manifest.lexical_backend,
    embedding_provider_id: manifest.embedding_provider_id,
    embedding_model_id: manifest.embedding_model_id,
    embedding_dimensions: manifest.embedding_dimensions,
    candidate_source_count: manifest.candidate_source_count,
    candidate_declaration_count: manifest.candidate_declaration_count,
    represented_candidate_source_count: manifest.represented_candidate_source_count,
    candidate_chunk_count: manifest.candidate_chunk_count,
    embedding_eligible_candidate_chunk_count: manifest.embedding_eligible_candidate_chunk_count,
    candidate_sources: [...sources].sort((a, b) => retrievalCodeUnitCompare(a.record_key, b.record_key)),
    candidate_declarations: [...declarations].sort((a, b) => retrievalCodeUnitCompare(gkxRetrievalCandidateDeclarationDigest(a), gkxRetrievalCandidateDeclarationDigest(b))),
    embedding_eligible_candidate_chunk_keys: [...embeddingEligibleChunkKeys].sort(retrievalCodeUnitCompare),
    candidate_chunks: [...chunks].sort((a, b) => retrievalCodeUnitCompare(a.candidate_chunk_key, b.candidate_chunk_key)),
    vectors: [...vectors].sort((a, b) => retrievalCodeUnitCompare(a.candidate_chunk_key, b.candidate_chunk_key)),
  });
}

function validateContentVectorConsistency(
  bindings: readonly { content_digest: string; vector: readonly number[] }[],
): void {
  const vectorByContentDigest = new Map<string, readonly number[]>();
  for (const binding of bindings) {
    const prior = vectorByContentDigest.get(binding.content_digest);
    if (prior && (prior.length !== binding.vector.length || prior.some((value, index) => value !== binding.vector[index]))) {
      throw new Error("CONTENT_VECTOR_CACHE_CONFLICT");
    }
    vectorByContentDigest.set(binding.content_digest, binding.vector);
  }
}

function vectorIdentity(
  input: RetrievalGenerationInput,
  chunks: readonly RetrievalChunk[],
  vectors: readonly StoredVector[],
  embeddingEligibleChunkIds: readonly string[] = chunks.map((chunk) => chunk.chunk_id),
): void {
  const identityParts = [input.embedding_provider_id ?? null, input.embedding_model_id ?? null, input.embedding_dimensions ?? null];
  const activeVectorIdentity = identityParts.every((part) => part !== null);
  if (!activeVectorIdentity && identityParts.some((part) => part !== null)) throw new Error("VECTOR_MANIFEST_IDENTITY_INVALID");
  const chunkIds = new Set(chunks.map((chunk) => chunk.chunk_id));
  const eligibleIds = new Set(embeddingEligibleChunkIds);
  if (eligibleIds.size !== embeddingEligibleChunkIds.length || [...eligibleIds].some((id) => !chunkIds.has(id))) throw new Error("VECTOR_ELIGIBILITY_INVALID");
  const vectorIds = new Set(vectors.map((vector) => vector.chunk_id));
  if (vectorIds.size !== vectors.length || [...vectorIds].some((id) => !eligibleIds.has(id))) throw new Error("VECTOR_GENERATION_PARTIAL");
  if (activeVectorIdentity && eligibleIds.size !== vectorIds.size) throw new Error("VECTOR_GENERATION_PARTIAL");
  if (!activeVectorIdentity && vectors.length) throw new Error("VECTOR_GENERATION_IDENTITY_MISSING");
  const chunkById = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]));
  validateContentVectorConsistency(vectors.map((vector) => ({
    content_digest: chunkById.get(vector.chunk_id)!.content_digest,
    vector: vector.vector,
  })));
}

function projectionManifest(input: RetrievalGenerationInput, lexicalBackend: SqliteLexicalBackend): RetrievalProjectionManifest {
  const chunks = [...input.chunks].sort((a, b) => retrievalCodeUnitCompare(a.chunk_id, b.chunk_id));
  const vectors = [...(input.vectors ?? [])].sort((a, b) => retrievalCodeUnitCompare(a.chunk_id, b.chunk_id));
  vectorIdentity(input, chunks, vectors);
  const base: Omit<RetrievalProjectionManifest, "projection_id" | "projection_digest"> = {
    contract_version: RETRIEVAL_CONTRACT_VERSION,
    projection_schema_version: RETRIEVAL_PROJECTION_SCHEMA_VERSION,
    engine_version: ENGINE_VERSION,
    vault_id: input.vault_id,
    source_snapshot_digest: input.source_snapshot_digest,
    configuration_digest: input.configuration_digest,
    policy_digest: input.policy_digest,
    chunker_version: RETRIEVAL_CHUNKER_VERSION,
    tokenizer_version: RETRIEVAL_TOKENIZER_VERSION,
    lexical_backend: lexicalBackend,
    embedding_provider_id: input.embedding_provider_id ?? null,
    embedding_model_id: input.embedding_model_id ?? null,
    embedding_dimensions: input.embedding_dimensions ?? null,
    source_count: new Set(chunks.map((chunk) => chunk.source_id)).size,
    chunk_count: chunks.length,
  };
  const digest = calculateProjectionDigest(base, chunks, vectors);
  return { ...base, projection_id: `retrieval:${digest.slice("sha256:".length, "sha256:".length + 24)}`, projection_digest: digest };
}

function lineageProjectionManifest(input: GkxRetrievalGenerationInput, lexicalBackend: SqliteLexicalBackend): GkxRetrievalProjectionManifest {
  const validated = validateCandidateGenerationBindings(input, false);
  const base: Omit<GkxRetrievalProjectionManifest, "projection_id" | "projection_digest"> = {
    contract_version: RETRIEVAL_LINEAGE_CONTRACT_VERSION,
    projection_schema_version: RETRIEVAL_LINEAGE_PROJECTION_SCHEMA_VERSION,
    provenance_contract_version: RETRIEVAL_PROVENANCE_CONTRACT_VERSION,
    gkx_standard_commit: RETRIEVAL_GKX_STANDARD_COMMIT,
    gkx_projection_profile: RETRIEVAL_GKX_PROJECTION_PROFILE,
    engine_version: ENGINE_VERSION,
    vault_id: input.vault_id,
    source_snapshot_digest: input.source_snapshot_digest,
    configuration_digest: input.configuration_digest,
    policy_digest: input.policy_digest,
    chunker_version: RETRIEVAL_CHUNKER_VERSION,
    tokenizer_version: RETRIEVAL_TOKENIZER_VERSION,
    lexical_backend: lexicalBackend,
    embedding_provider_id: input.embedding_provider_id ?? null,
    embedding_model_id: input.embedding_model_id ?? null,
    embedding_dimensions: input.embedding_dimensions ?? null,
    candidate_source_count: validated.sources.length,
    candidate_declaration_count: validated.declarations.length,
    represented_candidate_source_count: validated.representedRecordKeys.size,
    candidate_chunk_count: validated.chunks.length,
    embedding_eligible_candidate_chunk_count: validated.eligibleKeys.length,
  };
  const digest = calculateLineageProjectionDigest(base, validated.sources, validated.declarations, validated.chunks, validated.eligibleKeys, validated.vectors);
  return { ...base, projection_id: `retrieval:${digest.slice("sha256:".length, "sha256:".length + 24)}`, projection_digest: digest };
}

/**
 * Trusted-host, no-I/O manifestation of Full's schema-3 projection authority.
 * Phase-4 fixture qualification uses this exact production digest algebra
 * instead of reimplementing or shallowly resealing manifest coordinates.
 */
export function deriveGkxRetrievalProjectionManifest(
  value: Omit<GkxRetrievalGenerationInput, "state_directory" | "lexical_backend">,
  lexicalBackend: SqliteLexicalBackend,
): GkxRetrievalProjectionManifest {
  if (lexicalBackend !== "sqlite_fts5" && lexicalBackend !== "sqlite_lexical_scan" ||
      typeof value.vault_id !== "string" || value.vault_id.length < 1 || value.vault_id.length > 512 ||
      [value.source_snapshot_digest, value.configuration_digest, value.policy_digest].some((entry) =>
        typeof entry !== "string" || !GENERATION_DIGEST_RE.test(entry))) {
    throw new TypeError("RETRIEVAL_MANIFEST_DERIVATION_INPUT_INVALID");
  }
  return lineageProjectionManifest({ ...value, state_directory: ".", lexical_backend: lexicalBackend }, lexicalBackend);
}

function sourceEnvelope(chunk: RetrievalChunk): string {
  return stableJson({
    source_path: chunk.source_path,
    source_digest: chunk.source_digest,
    lineage_id: chunk.lineage_id,
    valid_from: chunk.valid_from,
    valid_to: chunk.valid_to,
    supersedes: chunk.supersedes,
    superseded_by: chunk.superseded_by,
    metadata: chunk.metadata,
  });
}

function structuralParentPosition(position: string): string | null {
  const separator = position.lastIndexOf(".");
  return separator < 0 ? null : position.slice(0, separator);
}

function validateParentBindings(chunks: readonly RetrievalChunk[]): void {
  const bySource = new Map<string, RetrievalChunk[]>();
  for (const chunk of chunks) {
    const group = bySource.get(chunk.source_id) ?? [];
    group.push(chunk);
    bySource.set(chunk.source_id, group);
  }
  for (const group of bySource.values()) {
    const firstByPosition = new Map<string, RetrievalChunk>();
    const structuralParts = new Set<string>();
    for (const chunk of group) {
      const partKey = `${chunk.structural_position}\0${chunk.part_ordinal}`;
      if (structuralParts.has(partKey)) throw new Error("RETRIEVAL_CHUNK_PARENT_INVALID");
      structuralParts.add(partKey);
      if (chunk.part_ordinal === 1) {
        if (firstByPosition.has(chunk.structural_position)) throw new Error("RETRIEVAL_CHUNK_PARENT_INVALID");
        firstByPosition.set(chunk.structural_position, chunk);
      }
    }
    for (const chunk of group) {
      // Every structural section starts at part one. A child binds only to the
      // first chunk of its nearest actual structural-prefix ancestor; a
      // shallower sibling or more distant ancestor is never an acceptable
      // substitute.
      if (!firstByPosition.has(chunk.structural_position)) throw new Error("RETRIEVAL_CHUNK_PARENT_INVALID");
      const parentPosition = structuralParentPosition(chunk.structural_position);
      const expectedParent = parentPosition === null ? undefined : firstByPosition.get(parentPosition);
      if (parentPosition !== null && !expectedParent) throw new Error("RETRIEVAL_CHUNK_PARENT_INVALID");
      if ((chunk.parent_chunk_id ?? null) !== (expectedParent?.chunk_id ?? null) ||
          (expectedParent !== undefined && expectedParent.heading_depth >= chunk.heading_depth)) {
        throw new Error("RETRIEVAL_CHUNK_PARENT_INVALID");
      }
    }
  }
}

function validateChunkBindings(chunks: readonly RetrievalChunk[]): {
  sourceBindings: Map<string, { path: string; digest: string; envelope: string }>;
  chunkIds: Set<string>;
} {
  const sourceBindings = new Map<string, { path: string; digest: string; envelope: string }>();
  const chunkIds = new Set<string>();
  for (const chunk of chunks) {
    validateRetrievalChunk(chunk);
    if (chunkIds.has(chunk.chunk_id)) throw new Error("DUPLICATE_CHUNK_ID");
    chunkIds.add(chunk.chunk_id);
    const prior = sourceBindings.get(chunk.source_id);
    const envelope = sourceEnvelope(chunk);
    if (prior && (prior.path !== chunk.source_path || prior.digest !== chunk.source_digest)) throw new Error("SOURCE_ID_BINDING_CONFLICT");
    if (prior && prior.envelope !== envelope) throw new Error("SOURCE_ENVELOPE_CONFLICT");
    sourceBindings.set(chunk.source_id, { path: chunk.source_path, digest: chunk.source_digest, envelope });
  }
  validateParentBindings(chunks);
  return { sourceBindings, chunkIds };
}

function validateLineageGenerationBindings(
  chunks: readonly RetrievalChunk[],
  sourceProvenance: readonly GkxRetrievalStoredSourceProvenance[],
): {
  sourceBindings: Map<string, { path: string; digest: string; envelope: string }>;
  provenanceById: Map<string, GkxRetrievalStoredSourceProvenance>;
  chunkIds: Set<string>;
} {
  const sourceBindings = new Map<string, { path: string; digest: string; envelope: string }>();
  const provenanceById = new Map<string, GkxRetrievalStoredSourceProvenance>();
  const provenanceByPath = new Map<string, string>();
  for (const provenance of sourceProvenance) {
    validateGkxRetrievalStoredSourceProvenance(provenance);
    if (provenanceById.has(provenance.source_id)) throw new Error("DUPLICATE_SOURCE_PROVENANCE");
    if (provenanceByPath.has(provenance.source_path)) throw new Error("DUPLICATE_SOURCE_PROVENANCE_PATH");
    provenanceById.set(provenance.source_id, provenance);
    provenanceByPath.set(provenance.source_path, provenance.source_id);
  }
  // Persisted global projections are complete canonical sets: every resolved
  // relationship endpoint and inverse must be present. Request-scoped views
  // use a separate suppressive validator after policy/filter restriction.
  validateGkxRetrievalCanonicalSourceSet(sourceProvenance);
  const chunkIds = new Set<string>();
  for (const chunk of chunks) {
    validateRetrievalChunk(chunk);
    if (chunkIds.has(chunk.chunk_id)) throw new Error("DUPLICATE_CHUNK_ID");
    chunkIds.add(chunk.chunk_id);
    const prior = sourceBindings.get(chunk.source_id);
    const envelope = sourceEnvelope(chunk);
    if (prior && (prior.path !== chunk.source_path || prior.digest !== chunk.source_digest)) throw new Error("SOURCE_ID_BINDING_CONFLICT");
    if (prior && prior.envelope !== envelope) throw new Error("SOURCE_ENVELOPE_CONFLICT");
    const provenance = provenanceById.get(chunk.source_id);
    if (!provenance || provenance.source_path !== chunk.source_path || provenance.source_digest !== chunk.source_digest ||
        provenance.lineage_id !== chunk.lineage_id || provenance.valid_from !== chunk.valid_from || provenance.valid_to !== chunk.valid_to ||
        stableJson(provenance.resolved_supersedes) !== stableJson(chunk.supersedes) ||
        stableJson(provenance.resolved_superseded_by) !== stableJson(chunk.superseded_by) ||
        stableJson(provenance.source_metadata) !== stableJson(chunk.metadata)) throw new Error("SOURCE_PROVENANCE_CHUNK_BINDING_MISMATCH");
    sourceBindings.set(chunk.source_id, { path: chunk.source_path, digest: chunk.source_digest, envelope });
  }
  validateParentBindings(chunks);
  return { sourceBindings, provenanceById, chunkIds };
}

function exactGenerationRecord(
  value: unknown,
  lineage: boolean,
  vectorFree: boolean,
): asserts value is RetrievalGenerationInput | GkxRetrievalGenerationInput {
  if (value === null || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError("RETRIEVAL_GENERATION_INPUT_INVALID");
  }
  const allowed = new Set<string>([
    ...(lineage ? GENERATION_V3_REQUIRED_FIELDS : GENERATION_V2_REQUIRED_FIELDS),
    ...GENERATION_OPTIONAL_FIELDS,
  ]);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
      (lineage ? GENERATION_V3_REQUIRED_FIELDS : GENERATION_V2_REQUIRED_FIELDS).some((field) => !Object.hasOwn(value, field)) ||
      (lineage === Object.hasOwn(value, "chunks")) ||
      Object.hasOwn(value, "source_provenance") ||
      Object.hasOwn(value, "embedding_eligible_chunk_ids") ||
      (vectorFree && GENERATION_VECTOR_FIELDS.some((field) => Object.hasOwn(value, field)))) {
    throw new TypeError("RETRIEVAL_GENERATION_INPUT_FIELDS_INVALID");
  }
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor) || descriptor.value === undefined) {
      throw new TypeError("RETRIEVAL_GENERATION_INPUT_DESCRIPTOR_INVALID");
    }
  }
}

function denseArrayValues(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) throw new TypeError(code);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key))) ||
      Object.keys(value).length !== value.length) throw new TypeError(code);
  const values: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError(code);
    values.push(descriptor.value);
  }
  return values;
}

function validateStoredVectors(value: unknown): asserts value is readonly StoredVector[] {
  for (const item of denseArrayValues(value, "RETRIEVAL_GENERATION_VECTORS_INVALID")) {
    if (item === null || typeof item !== "object" || Array.isArray(item) || utilTypes.isProxy(item) ||
        (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) ||
        Reflect.ownKeys(item).some((key) => typeof key !== "string" || (key !== "chunk_id" && key !== "vector"))) {
      throw new TypeError("RETRIEVAL_GENERATION_VECTOR_INVALID");
    }
    for (const key of ["chunk_id", "vector"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError("RETRIEVAL_GENERATION_VECTOR_INVALID");
    }
    const record = item as Record<string, unknown>;
    if (typeof record.chunk_id !== "string" || !GENERATION_DIGEST_RE.test(record.chunk_id)) throw new TypeError("RETRIEVAL_GENERATION_VECTOR_INVALID");
    const vector = denseArrayValues(record.vector, "RETRIEVAL_GENERATION_VECTOR_INVALID");
    if (vector.some((part) => typeof part !== "number" || !Number.isFinite(part))) throw new TypeError("RETRIEVAL_GENERATION_VECTOR_INVALID");
  }
}

interface ValidatedCandidateGeneration {
  sources: GkxRetrievalCandidateSource[];
  declarations: GkxRetrievalCandidateDeclaration[];
  chunks: GkxRetrievalCandidateChunk[];
  eligibleKeys: string[];
  vectors: GkxRetrievalCandidateVector[];
  representedRecordKeys: Set<string>;
}

function validateCandidateGenerationBindings(
  input: GkxRetrievalGenerationInput,
  vectorFree: boolean,
): ValidatedCandidateGeneration {
  const sources = denseArrayValues(input.candidate_sources, "RETRIEVAL_GENERATION_CANDIDATE_SOURCES_INVALID") as GkxRetrievalCandidateSource[];
  const declarations = denseArrayValues(input.candidate_declarations, "RETRIEVAL_GENERATION_CANDIDATE_DECLARATIONS_INVALID") as GkxRetrievalCandidateDeclaration[];
  const chunks = denseArrayValues(input.candidate_chunks, "RETRIEVAL_GENERATION_CANDIDATE_CHUNKS_INVALID") as GkxRetrievalCandidateChunk[];
  const eligibleKeys = denseArrayValues(input.embedding_eligible_candidate_chunk_keys, "RETRIEVAL_GENERATION_VECTOR_ELIGIBILITY_INVALID") as string[];
  const vectors = vectorFree || input.vectors === undefined
    ? []
    : denseArrayValues(input.vectors, "RETRIEVAL_GENERATION_CANDIDATE_VECTORS_INVALID") as GkxRetrievalCandidateVector[];

  const sourceByKey = new Map<string, GkxRetrievalCandidateSource>();
  for (const source of sources) {
    validateGkxRetrievalCandidateSource(source);
    if (sourceByKey.has(source.record_key)) throw new Error("DUPLICATE_CANDIDATE_SOURCE_KEY");
    sourceByKey.set(source.record_key, source);
  }
  const declarationDigests = new Set<string>();
  const declarationCoordinates = new Set<string>();
  const declarationIndices = new Map<string, number[]>();
  for (const declaration of declarations) {
    validateGkxRetrievalCandidateDeclaration(declaration);
    if (!sourceByKey.has(declaration.source_record_key)) throw new Error("ORPHAN_CANDIDATE_DECLARATION_SOURCE");
    const digest = gkxRetrievalCandidateDeclarationDigest(declaration);
    if (declarationDigests.has(digest)) throw new Error("DUPLICATE_CANDIDATE_DECLARATION");
    const coordinate = `${declaration.source_record_key}\0${declaration.category}\0${declaration.field}\0${declaration.declaration_index}`;
    if (declarationCoordinates.has(coordinate)) throw new Error("DUPLICATE_CANDIDATE_DECLARATION_COORDINATE");
    declarationDigests.add(digest);
    declarationCoordinates.add(coordinate);
    const sequence = `${declaration.source_record_key}\0${declaration.category}\0${declaration.category === "lineage" ? declaration.field : "*"}`;
    const indices = declarationIndices.get(sequence) ?? [];
    indices.push(declaration.declaration_index);
    declarationIndices.set(sequence, indices);
  }
  for (const indices of declarationIndices.values()) {
    indices.sort((left, right) => left - right);
    if (indices.some((value, index) => value !== index)) throw new Error("CANDIDATE_DECLARATION_INDEX_SEQUENCE_INVALID");
  }

  const chunkByKey = new Map<string, GkxRetrievalCandidateChunk>();
  const publicIdsByRecord = new Map<string, Set<string>>();
  const representedRecordKeys = new Set<string>();
  for (const candidate of chunks) {
    validateGkxRetrievalCandidateChunk(candidate);
    const source = sourceByKey.get(candidate.record_key);
    if (!source) throw new Error("ORPHAN_CANDIDATE_CHUNK_SOURCE");
    if (chunkByKey.has(candidate.candidate_chunk_key)) throw new Error("DUPLICATE_CANDIDATE_CHUNK_KEY");
    if (candidate.chunk.source_id !== source.source_id || candidate.chunk.source_path !== source.source_path ||
        candidate.chunk.source_digest !== source.source_digest || candidate.chunk.valid_from !== source.valid_from ||
        stableJson(candidate.chunk.metadata) !== stableJson(source.source_metadata)) throw new Error("CANDIDATE_SOURCE_CHUNK_BINDING_MISMATCH");
    const publicIds = publicIdsByRecord.get(candidate.record_key) ?? new Set<string>();
    if (publicIds.has(candidate.chunk.chunk_id)) throw new Error("DUPLICATE_CANDIDATE_PUBLIC_CHUNK_ID");
    publicIds.add(candidate.chunk.chunk_id);
    publicIdsByRecord.set(candidate.record_key, publicIds);
    representedRecordKeys.add(candidate.record_key);
    chunkByKey.set(candidate.candidate_chunk_key, candidate);
  }
  for (const candidate of chunks) {
    const nestedParent = candidate.chunk.parent_chunk_id ?? null;
    if (candidate.parent_candidate_chunk_key === null) {
      if (nestedParent !== null) throw new Error("CANDIDATE_PARENT_BINDING_MISMATCH");
    } else {
      const parent = chunkByKey.get(candidate.parent_candidate_chunk_key);
      if (!parent || parent.record_key !== candidate.record_key || parent.chunk.chunk_id !== nestedParent) throw new Error("CANDIDATE_PARENT_BINDING_MISMATCH");
    }
  }
  for (const recordKey of representedRecordKeys) {
    validateParentBindings(chunks.filter((item) => item.record_key === recordKey).map((item) => item.chunk));
  }

  if (eligibleKeys.some((key) => typeof key !== "string" || !GENERATION_CANDIDATE_CHUNK_KEY_RE.test(key)) ||
      new Set(eligibleKeys).size !== eligibleKeys.length || eligibleKeys.some((key) => !chunkByKey.has(key))) {
    throw new Error("VECTOR_ELIGIBILITY_INVALID");
  }
  const eligible = new Set(eligibleKeys);
  const vectorKeys = new Set<string>();
  for (const vector of vectors) {
    validateGkxRetrievalCandidateVector(vector);
    if (!eligible.has(vector.candidate_chunk_key) || vectorKeys.has(vector.candidate_chunk_key)) throw new Error("VECTOR_GENERATION_PARTIAL");
    vectorKeys.add(vector.candidate_chunk_key);
  }
  const identity = [input.embedding_provider_id ?? null, input.embedding_model_id ?? null, input.embedding_dimensions ?? null];
  const activeIdentity = identity.every((part) => part !== null);
  if (!activeIdentity && identity.some((part) => part !== null)) throw new Error("VECTOR_MANIFEST_IDENTITY_INVALID");
  if (activeIdentity && (!input.embedding_provider_id || !input.embedding_model_id || !Number.isSafeInteger(input.embedding_dimensions) || input.embedding_dimensions! <= 0 ||
      vectors.length !== eligible.size || vectors.some((vector) => vector.vector.length !== input.embedding_dimensions))) throw new Error("VECTOR_GENERATION_PARTIAL");
  if (!activeIdentity && vectors.length) throw new Error("VECTOR_GENERATION_IDENTITY_MISSING");

  // A content digest is the cache identity inside one exact provider/model/
  // dimension space. Candidate multiplicity may legitimately bind several
  // physical chunk keys to that digest, but it must never bind conflicting
  // payloads; otherwise cache reuse would depend on row order.
  validateContentVectorConsistency(vectors.map((vector) => ({
    content_digest: chunkByKey.get(vector.candidate_chunk_key)!.chunk.content_digest,
    vector: vector.vector,
  })));

  return { sources, declarations, chunks, eligibleKeys, vectors, representedRecordKeys };
}

function preflightGenerationInput(value: unknown, lineage: boolean, vectorFree: boolean): void {
  exactGenerationRecord(value, lineage, vectorFree);
  const input = value as RetrievalGenerationInput | GkxRetrievalGenerationInput;
  if (typeof input.state_directory !== "string") throw new TypeError("RETRIEVAL_GENERATION_STATE_DIRECTORY_INVALID");
  const requestedStateDirectory = validateStateDirectory(input.state_directory);
  const canonicalStateDirectory = canonicalPathSync(requestedStateDirectory, {
    allow_missing: true,
    alias_error: "RETRIEVAL_STATE_ANCESTOR_ALIAS_REJECTED",
  });
  if (pathExists(canonicalStateDirectory)) {
    const state = lstatSync(canonicalStateDirectory);
    if (!state.isDirectory() || state.isSymbolicLink()) throw new Error("RETRIEVAL_STATE_DIRECTORY_SYMLINK_REJECTED");
  }
  if (typeof input.vault_id !== "string" || !input.vault_id || input.vault_id.length > 512) throw new TypeError("RETRIEVAL_GENERATION_VAULT_ID_INVALID");
  for (const digest of [input.source_snapshot_digest, input.configuration_digest, input.policy_digest]) {
    if (typeof digest !== "string" || !GENERATION_DIGEST_RE.test(digest)) throw new TypeError("RETRIEVAL_GENERATION_DIGEST_INVALID");
  }
  if (input.lexical_backend !== undefined && input.lexical_backend !== "auto" && input.lexical_backend !== "sqlite_fts5" && input.lexical_backend !== "sqlite_lexical_scan") {
    throw new TypeError("RETRIEVAL_LEXICAL_BACKEND_INVALID");
  }
  if (lineage) {
    validateCandidateGenerationBindings(input as GkxRetrievalGenerationInput, vectorFree);
  } else {
    const phase1 = input as RetrievalGenerationInput;
    const chunks = denseArrayValues(phase1.chunks, "RETRIEVAL_GENERATION_CHUNKS_INVALID") as RetrievalChunk[];
    validateChunkBindings(chunks);
    if (!vectorFree && phase1.vectors !== undefined) validateStoredVectors(phase1.vectors);
    for (const field of ["embedding_provider_id", "embedding_model_id"] as const) {
      if (input[field] !== undefined && input[field] !== null && (typeof input[field] !== "string" || !input[field])) throw new TypeError("VECTOR_MANIFEST_IDENTITY_INVALID");
    }
    if (input.embedding_dimensions !== undefined && input.embedding_dimensions !== null &&
        (!Number.isSafeInteger(input.embedding_dimensions) || input.embedding_dimensions <= 0)) throw new TypeError("VECTOR_MANIFEST_IDENTITY_INVALID");
    if (!vectorFree) vectorIdentity(phase1, chunks, phase1.vectors ?? []);
  }
}

/** Internal, no-state validation before any provider/cache work. */
export function preflightRetrievalIndexInput(value: unknown): asserts value is Omit<RetrievalGenerationInput, "vectors" | "embedding_provider_id" | "embedding_model_id" | "embedding_dimensions"> {
  preflightGenerationInput(value, false, true);
}

/** Internal schema-3 counterpart; raw provenance never crosses the public subpath. */
export function preflightGkxRetrievalIndexInput(value: unknown): asserts value is Omit<GkxRetrievalGenerationInput, "vectors" | "embedding_provider_id" | "embedding_model_id" | "embedding_dimensions"> {
  preflightGenerationInput(value, true, true);
}

function insertGeneration(
  database: DatabaseSync,
  manifest: RetrievalProjectionManifest,
  chunks: readonly RetrievalChunk[],
  sourceProvenance: readonly GkxRetrievalStoredSourceProvenance[] | undefined,
  embeddingEligibleChunkIds: readonly string[] | undefined,
  vectors: readonly StoredVector[],
): void {
  const lineage = isGkxRetrievalProjectionManifest(manifest);
  const { chunkIds } = lineage
    ? validateLineageGenerationBindings(chunks, sourceProvenance ?? (() => { throw new Error("RETRIEVAL_SOURCE_PROVENANCE_REQUIRED"); })())
    : validateChunkBindings(chunks);
  const vectorIds = new Set<string>();
  for (const item of vectors) {
    if (vectorIds.has(item.chunk_id)) throw new Error("DUPLICATE_VECTOR_CHUNK_ID");
    if (!chunkIds.has(item.chunk_id)) throw new Error("ORPHAN_VECTOR_CHUNK_ID");
    vectorIds.add(item.chunk_id);
    if (item.vector.length !== manifest.embedding_dimensions || item.vector.some((value) => !Number.isFinite(value))) throw new Error("VECTOR_GENERATION_INVALID");
  }
  const eligibleIds = new Set(embeddingEligibleChunkIds ?? chunks.map((chunk) => chunk.chunk_id));
  if (eligibleIds.size !== (embeddingEligibleChunkIds ?? chunks).length || [...eligibleIds].some((id) => !chunkIds.has(id))) throw new Error("VECTOR_ELIGIBILITY_INVALID");
  if (manifest.embedding_provider_id && (vectorIds.size !== eligibleIds.size || [...eligibleIds].some((id) => !vectorIds.has(id)))) throw new Error("VECTOR_GENERATION_PARTIAL");
  if (!manifest.embedding_provider_id && vectorIds.size !== 0) throw new Error("VECTOR_GENERATION_IDENTITY_MISSING");
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; BEGIN IMMEDIATE;");
  try {
    database.exec(lineage ? BASE_SCHEMA_V3 : BASE_SCHEMA_V2);
    database.exec(manifest.lexical_backend === "sqlite_fts5" ? FTS5_SCHEMA : LEXICAL_SCAN_SCHEMA);
    database.exec(`PRAGMA user_version = ${manifest.projection_schema_version}`);
    database.prepare("INSERT INTO projection_manifest VALUES (1, ?, ?, ?, ?, ?, ?)").run(
      stableJson(manifest), manifest.contract_version, manifest.projection_schema_version,
      manifest.projection_id, manifest.projection_digest, manifest.lexical_backend,
    );
    const insertSource = database.prepare(lineage
      ? "INSERT INTO sources(source_id, source_path, source_digest, metadata_json, provenance_json, provenance_digest) VALUES (?, ?, ?, ?, ?, ?)"
      : "INSERT OR IGNORE INTO sources(source_id, source_path, source_digest) VALUES (?, ?, ?)");
    const insertChunk = database.prepare(`INSERT INTO chunks(
      chunk_id, source_id, source_path, source_digest, heading_path_json, heading_depth,
      ordinal_within_source, structural_position, part_ordinal, start_byte, end_byte,
      start_line, end_line, content_digest, text, token_count, parent_chunk_id,
      lineage_id, valid_from, valid_to, supersedes_json, superseded_by_json, metadata_json
    ) VALUES (${Array(23).fill("?").join(",")})`);
    const insertFts = database.prepare("INSERT INTO chunk_fts(chunk_id, title, heading_path, tags, topic, category, text) VALUES (?, ?, ?, ?, ?, ?, ?)");
    if (lineage) {
      for (const provenance of [...sourceProvenance!].sort((a, b) => retrievalCodeUnitCompare(a.source_id, b.source_id))) {
        insertSource.run(provenance.source_id, provenance.source_path, provenance.source_digest,
          stableJson(provenance.source_metadata), stableJson(provenance), provenance.provenance_digest);
      }
    }
    for (const chunk of [...chunks].sort((a, b) => retrievalCodeUnitCompare(a.chunk_id, b.chunk_id))) {
      if (!lineage) insertSource.run(chunk.source_id, chunk.source_path, chunk.source_digest);
      insertChunk.run(
        chunk.chunk_id, chunk.source_id, chunk.source_path, chunk.source_digest,
        stableJson(chunk.heading_path), chunk.heading_depth, chunk.ordinal_within_source,
        chunk.structural_position, chunk.part_ordinal, chunk.start_byte, chunk.end_byte,
        chunk.start_line, chunk.end_line, chunk.content_digest, chunk.text, chunk.token_count,
        chunk.parent_chunk_id ?? null, chunk.lineage_id, chunk.valid_from, chunk.valid_to,
        stableJson(chunk.supersedes), stableJson(chunk.superseded_by), stableJson(chunk.metadata),
      );
      insertFts.run(
        chunk.chunk_id,
        typeof chunk.metadata.title === "string" ? chunk.metadata.title : "",
        chunk.heading_path.join(" / "),
        Array.isArray(chunk.metadata.tags) ? chunk.metadata.tags.join(" ") : "",
        typeof chunk.metadata.topic === "string" ? chunk.metadata.topic : "",
        typeof chunk.metadata.category === "string" ? chunk.metadata.category : "",
        chunk.text,
      );
    }
    const vectorByChunk = new Map(vectors.map((item) => [item.chunk_id, item.vector]));
    if (embeddingEligibleChunkIds) {
      const insertEligible = database.prepare("INSERT INTO embedding_eligible_chunks(chunk_id) VALUES (?)");
      for (const chunkId of [...embeddingEligibleChunkIds].sort(retrievalCodeUnitCompare)) insertEligible.run(chunkId);
    }
    const insertVector = database.prepare("INSERT INTO chunk_vectors(chunk_id, provider_id, model_id, dimensions, vector_json) VALUES (?, ?, ?, ?, ?)");
    for (const chunk of chunks) {
      const vector = vectorByChunk.get(chunk.chunk_id);
      if (!vector) continue;
      if (!manifest.embedding_provider_id || !manifest.embedding_model_id || !manifest.embedding_dimensions) throw new Error("VECTOR_MANIFEST_IDENTITY_MISSING");
      if (vector.length !== manifest.embedding_dimensions || vector.some((value) => !Number.isFinite(value))) throw new Error("VECTOR_GENERATION_INVALID");
      insertVector.run(chunk.chunk_id, manifest.embedding_provider_id, manifest.embedding_model_id, manifest.embedding_dimensions, stableJson(vector));
    }
    database.exec("COMMIT");
    // WAL is a build-time durability mode only.  Checkpoint the temporary
    // writer and return the completed generation to DELETE mode before it is
    // renamed and subsequently opened read-only.
    database.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE;");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* transaction already ended */ }
    throw error;
  }
}

function insertCandidateGeneration(
  database: DatabaseSync,
  manifest: GkxRetrievalProjectionManifest,
  input: GkxRetrievalGenerationInput,
): void {
  const validated = validateCandidateGenerationBindings(input, false);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; BEGIN IMMEDIATE;");
  try {
    database.exec(BASE_SCHEMA_V3);
    database.exec(manifest.lexical_backend === "sqlite_fts5" ? FTS5_SCHEMA : LEXICAL_SCAN_SCHEMA_V3);
    database.exec(`PRAGMA user_version = ${manifest.projection_schema_version}`);
    database.prepare("INSERT INTO projection_manifest VALUES (1, ?, ?, ?, ?, ?, ?)").run(
      stableJson(manifest), manifest.contract_version, manifest.projection_schema_version,
      manifest.projection_id, manifest.projection_digest, manifest.lexical_backend,
    );
    const insertSource = database.prepare(`INSERT INTO candidate_sources(
      record_key, source_id, source_path, source_digest, candidate_json, candidate_digest
    ) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const source of [...validated.sources].sort((a, b) => retrievalCodeUnitCompare(a.record_key, b.record_key))) {
      insertSource.run(source.record_key, source.source_id, source.source_path, source.source_digest, stableJson(source), source.candidate_digest);
    }
    const insertDeclaration = database.prepare(`INSERT INTO candidate_declarations(
      declaration_digest, source_record_key, declaration_json
    ) VALUES (?, ?, ?)`);
    for (const declaration of [...validated.declarations].sort((a, b) =>
      retrievalCodeUnitCompare(gkxRetrievalCandidateDeclarationDigest(a), gkxRetrievalCandidateDeclarationDigest(b)))) {
      insertDeclaration.run(gkxRetrievalCandidateDeclarationDigest(declaration), declaration.source_record_key, stableJson(declaration));
    }
    const insertChunk = database.prepare(`INSERT INTO candidate_chunks(
      candidate_chunk_key, record_key, public_chunk_id, parent_candidate_chunk_key, chunk_json, chunk_digest
    ) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertFts = database.prepare("INSERT INTO chunk_fts(chunk_id, title, heading_path, tags, topic, category, text) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const candidate of [...validated.chunks].sort((a, b) => retrievalCodeUnitCompare(a.candidate_chunk_key, b.candidate_chunk_key))) {
      const chunk = candidate.chunk;
      insertChunk.run(candidate.candidate_chunk_key, candidate.record_key, chunk.chunk_id, candidate.parent_candidate_chunk_key,
        stableJson(chunk), retrievalCanonicalDigest(candidate));
      insertFts.run(candidate.candidate_chunk_key,
        typeof chunk.metadata.title === "string" ? chunk.metadata.title : "",
        chunk.heading_path.join(" / "), Array.isArray(chunk.metadata.tags) ? chunk.metadata.tags.join(" ") : "",
        typeof chunk.metadata.topic === "string" ? chunk.metadata.topic : "",
        typeof chunk.metadata.category === "string" ? chunk.metadata.category : "", chunk.text);
    }
    const insertEligible = database.prepare("INSERT INTO embedding_eligible_candidate_chunks(candidate_chunk_key) VALUES (?)");
    for (const key of [...validated.eligibleKeys].sort(retrievalCodeUnitCompare)) insertEligible.run(key);
    const insertVector = database.prepare(`INSERT INTO candidate_chunk_vectors(
      candidate_chunk_key, provider_id, model_id, dimensions, vector_json
    ) VALUES (?, ?, ?, ?, ?)`);
    for (const item of [...validated.vectors].sort((a, b) => retrievalCodeUnitCompare(a.candidate_chunk_key, b.candidate_chunk_key))) {
      if (!manifest.embedding_provider_id || !manifest.embedding_model_id || !manifest.embedding_dimensions) throw new Error("VECTOR_MANIFEST_IDENTITY_MISSING");
      insertVector.run(item.candidate_chunk_key, manifest.embedding_provider_id, manifest.embedding_model_id,
        manifest.embedding_dimensions, stableJson(item.vector));
    }
    database.exec("COMMIT");
    database.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE;");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* transaction already ended */ }
    throw error;
  }
}

function buildGenerationArtifact(
  input: RetrievalGenerationInput | GkxRetrievalGenerationInput,
  lineage: boolean,
  immutableNoReplace = false,
): BuiltUnactivatedRetrievalGeneration {
  // Validate every record before creating or touching derived state. A single
  // malformed chunk rejects the whole source generation and cannot advance the
  // active pointer or leave a partial database behind.
  if (lineage) validateCandidateGenerationBindings(input as GkxRetrievalGenerationInput, false);
  else validateChunkBindings((input as RetrievalGenerationInput).chunks);
  const lexicalBackend = resolveLexicalBackend(input.lexical_backend);
  const requestedDirectory = validateStateDirectory(input.state_directory);
  const manifest = lineage
    ? lineageProjectionManifest(input as GkxRetrievalGenerationInput, lexicalBackend)
    : projectionManifest(input as RetrievalGenerationInput, lexicalBackend);
  assertRetrievalProjectionManifest(manifest);
  const directory = canonicalPathSync(requestedDirectory, { allow_missing: true, alias_error: "RETRIEVAL_STATE_ANCESTOR_ALIAS_REJECTED" });
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertRealStateDirectory(directory);
  hardenDirectoryPermissions(directory);
  const suffix = manifest.projection_digest.slice("sha256:".length);
  const finalPath = join(directory, `retrieval-${suffix}.sqlite`);
  assertPlainContainedFile(finalPath, directory);
  let needsBuild = !pathExists(finalPath);
  if (!needsBuild && (pathExists(`${finalPath}-wal`) || pathExists(`${finalPath}-shm`))) {
    if (immutableNoReplace) throw new Error("RETRIEVAL_IMMUTABLE_GENERATION_SIDECAR_CONFLICT");
    quarantineGenerationFiles(finalPath, directory);
    needsBuild = true;
  }
  if (!needsBuild) {
    try {
      hardenFilePermissions(finalPath);
      const existing = new SqliteRetrievalStore(finalPath);
      existing.close();
    } catch {
      if (immutableNoReplace) throw new Error("RETRIEVAL_IMMUTABLE_GENERATION_CONFLICT");
      quarantineGenerationFiles(finalPath, directory);
      needsBuild = true;
    }
  }
  if (needsBuild) {
    // An interrupted prior replacement may leave WAL/SHM files without a main
    // database. Move them out of the active basename before creating it anew.
    if (immutableNoReplace) {
      if (pathExists(`${finalPath}-wal`) || pathExists(`${finalPath}-shm`)) {
        throw new Error("RETRIEVAL_IMMUTABLE_GENERATION_SIDECAR_CONFLICT");
      }
    } else quarantineGenerationFiles(finalPath, directory);
    const temporary = `${finalPath}.${process.pid}.tmp`;
    assertPlainContainedFile(temporary, directory);
    if (pathExists(temporary)) {
      if (immutableNoReplace) throw new Error("RETRIEVAL_IMMUTABLE_GENERATION_TEMP_CONFLICT");
      unlinkSync(temporary);
    }
    // Pre-create owner-only: DatabaseSync's default create mode would otherwise
    // inherit a permissive process umask before note text is inserted.
    writeFileSync(temporary, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
    hardenFilePermissions(temporary);
    const database = new DatabaseSync(temporary);
    try {
      if (lineage) insertCandidateGeneration(database, manifest as GkxRetrievalProjectionManifest, input as GkxRetrievalGenerationInput);
      else insertGeneration(database, manifest as RetrievalProjectionManifest, (input as RetrievalGenerationInput).chunks, undefined, undefined, (input as RetrievalGenerationInput).vectors ?? []);
    }
    finally { database.close(); }
    hardenFilePermissions(temporary);
    if (immutableNoReplace) {
      try { linkSync(temporary, finalPath); }
      catch (error) {
        unlinkSync(temporary);
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const winner = new SqliteRetrievalStore(finalPath);
        try {
          if (stableJson(winner.manifest) !== stableJson(manifest)) {
            throw new Error("RETRIEVAL_IMMUTABLE_GENERATION_CONFLICT");
          }
        } finally { winner.close(); }
      }
      if (pathExists(temporary)) unlinkSync(temporary);
    } else renameSync(temporary, finalPath);
    hardenFilePermissions(finalPath);
  }
  const verified = new SqliteRetrievalStore(finalPath);
  try {
    const expectedChunks = isGkxRetrievalProjectionManifest(manifest) ? manifest.candidate_chunk_count : manifest.chunk_count;
    if (verified.manifest.projection_digest !== manifest.projection_digest || verified.countChunks() !== expectedChunks ||
        (immutableNoReplace && stableJson(verified.manifest) !== stableJson(manifest))) {
      throw new Error("RETRIEVAL_GENERATION_VERIFICATION_FAILED");
    }
  } finally { verified.close(); }
  return { database_path: finalPath, manifest };
}

function activateRetrievalGeneration(
  artifact: BuiltUnactivatedRetrievalGeneration,
  writer: LegacyRetrievalWriterCapability,
): BuiltRetrievalGeneration {
  const directory = dirname(artifact.database_path);
  const { manifest } = artifact;
  const finalPath = artifact.database_path;
  const pointerPath = join(directory, "active-retrieval.json");
  const pointerTemporary = `${pointerPath}.${process.pid}.tmp`;
  assertPlainContainedFile(pointerPath, directory);
  assertPlainContainedFile(pointerTemporary, directory);
  const pointerBytes = Buffer.from(`${stableJson({ database_file: basename(finalPath), manifest })}\n`, "utf8");
  bindLegacyRetrievalWriterTarget(writer, pointerBytes);
  assertLegacyRetrievalWriterCommit(writer, pointerBytes);
  if (pathExists(pointerTemporary)) unlinkSync(pointerTemporary);
  writeFileSync(pointerTemporary, pointerBytes, { flag: "wx", mode: 0o600 });
  hardenFilePermissions(pointerTemporary);
  // The exact guard is revalidated immediately before the only mutable commit.
  assertLegacyRetrievalWriterCommit(writer, pointerBytes);
  renameSync(pointerTemporary, pointerPath);
  hardenFilePermissions(pointerPath);
  verifyLegacyRetrievalWriterTargetPublished(writer, pointerBytes);
  return { database_path: finalPath, pointer_path: pointerPath, manifest };
}

function buildGeneration(
  input: RetrievalGenerationInput | GkxRetrievalGenerationInput,
  lineage: boolean,
  writer: LegacyRetrievalWriterCapability,
): BuiltRetrievalGeneration {
  assertLegacyRetrievalWriterCapability(writer, input.state_directory);
  return activateRetrievalGeneration(buildGenerationArtifact(input, lineage), writer);
}

function withLegacyWriter<T>(stateDirectory: string, invoke: (writer: LegacyRetrievalWriterCapability) => T): T {
  const writer = acquireLegacyRetrievalWriter(stateDirectory);
  try { return invoke(writer); }
  finally { if (legacyRetrievalWriterIsHeld(writer)) releaseLegacyRetrievalWriter(writer); }
}

/** Trusted coordinator seam: caller already holds the pre-provider writer guard. */
export function buildRetrievalGenerationWithWriter(
  input: RetrievalGenerationInput,
  writer: LegacyRetrievalWriterCapability,
): BuiltRetrievalGeneration {
  preflightGenerationInput(input, false, false);
  return buildGeneration(input, false, writer);
}

/** Trusted coordinator seam: caller already holds the pre-provider writer guard. */
export function buildGkxRetrievalGenerationWithWriter(
  input: GkxRetrievalGenerationInput,
  writer: LegacyRetrievalWriterCapability,
): BuiltRetrievalGeneration {
  preflightGenerationInput(input, true, false);
  return buildGeneration(input, true, writer);
}

/** Frozen Phase-1/schema-2 generation builder. */
export function buildRetrievalGeneration(input: RetrievalGenerationInput): BuiltRetrievalGeneration {
  preflightGenerationInput(input, false, false);
  return withLegacyWriter(input.state_directory, (writer) => buildGeneration(input, false, writer));
}

/** Additive Phase-2/schema-3 generation builder. */
export function buildGkxRetrievalGeneration(input: GkxRetrievalGenerationInput): BuiltRetrievalGeneration {
  preflightGenerationInput(input, true, false);
  return withLegacyWriter(input.state_directory, (writer) => buildGeneration(input, true, writer));
}

/**
 * Trusted Phase-3 seam: build and fully verify schema-3 bytes without
 * publishing or changing active-retrieval.json. It is intentionally absent
 * from every ordinary package entry point.
 */
export function buildGkxRetrievalGenerationUnactivated(
  input: GkxRetrievalGenerationInput,
): BuiltUnactivatedRetrievalGeneration {
  preflightGenerationInput(input, true, false);
  return buildGenerationArtifact(input, true, true);
}

function statSafe(path: string): boolean {
  try { return statSync(path).isFile(); } catch { return false; }
}

export function openActiveRetrievalStore(stateDirectory: string): SqliteRetrievalStore {
  const directory = assertRealStateDirectory(validateStateDirectory(stateDirectory));
  hardenDirectoryPermissions(directory);
  const pointerPath = join(directory, "active-retrieval.json");
  assertPlainContainedFile(pointerPath, directory);
  hardenFilePermissions(pointerPath);
  if (statSync(pointerPath).size > 1_048_576) throw new Error("RETRIEVAL_POINTER_SIZE_EXCEEDED");
  const pointer = JSON.parse(readFileSync(pointerPath, "utf8")) as { database_file: string; manifest: AnyRetrievalProjectionManifest };
  if (basename(pointer.database_file) !== pointer.database_file) throw new Error("RETRIEVAL_POINTER_PATH_INVALID");
  assertRetrievalProjectionManifest(pointer.manifest);
  const databasePath = join(directory, pointer.database_file);
  assertPlainContainedFile(databasePath, directory);
  hardenFilePermissions(databasePath);
  const store = new SqliteRetrievalStore(databasePath);
  if (stableJson(store.manifest) !== stableJson(pointer.manifest)) { store.close(); throw new Error("RETRIEVAL_POINTER_MANIFEST_MISMATCH"); }
  return store;
}

export class SqliteRetrievalStore {
  readonly #database: DatabaseSync;
  readonly manifest: AnyRetrievalProjectionManifest;
  readonly fts5_available: boolean;
  readonly database_path: string;
  constructor(database_path: string) {
    if (database_path.includes("\0") || !statSafe(resolve(database_path))) throw new Error("RETRIEVAL_DATABASE_MISSING");
    const databasePath = canonicalPathSync(database_path, { alias_error: "RETRIEVAL_DATABASE_ALIAS_REJECTED" });
    this.database_path = databasePath;
    const link = lstatSync(databasePath);
    if (!link.isFile() || link.isSymbolicLink() || statSync(databasePath).nlink > 1) throw new Error("RETRIEVAL_DATABASE_ALIAS_REJECTED");
    if (pathExists(`${databasePath}-wal`) || pathExists(`${databasePath}-shm`)) throw new Error("RETRIEVAL_DATABASE_SIDECAR_REJECTED");
    hardenFilePermissions(databasePath);
    // Published generations are immutable derived artifacts.  Open them
    // read-only so verification and search cannot create WAL/SHM sidecars or
    // mutate a generation after its manifest digest has been accepted.
    this.#database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      this.#database.exec("PRAGMA foreign_keys = ON; PRAGMA temp_store = MEMORY;");
      const version = Number((this.#database.prepare("PRAGMA user_version").get() as SqliteRow).user_version);
      if (version !== RETRIEVAL_PROJECTION_SCHEMA_VERSION && version !== RETRIEVAL_LINEAGE_PROJECTION_SCHEMA_VERSION) throw new Error("RETRIEVAL_SCHEMA_MISMATCH");
      const row = this.#database.prepare("SELECT * FROM projection_manifest WHERE singleton = 1").get() as SqliteRow | undefined;
      if (!row) throw new Error("RETRIEVAL_MANIFEST_MISSING");
      this.manifest = JSON.parse(String(row.manifest_json));
      assertRetrievalProjectionManifest(this.manifest);
      if (row.manifest_json !== stableJson(this.manifest)) throw new Error("RETRIEVAL_MANIFEST_JSON_NONCANONICAL");
      if (version !== this.manifest.projection_schema_version) throw new Error("RETRIEVAL_SCHEMA_MISMATCH");
      const declaredBackend = declaredLexicalBackend(this.#database);
      this.fts5_available = probeFts5(this.#database);
      if (declaredBackend === "sqlite_fts5" && !this.fts5_available) throw new Error("SQLITE_FTS5_UNAVAILABLE");
      if (row.contract_version !== this.manifest.contract_version || Number(row.schema_version) !== this.manifest.projection_schema_version || row.projection_id !== this.manifest.projection_id || row.projection_digest !== this.manifest.projection_digest || row.lexical_backend !== this.manifest.lexical_backend) throw new Error("RETRIEVAL_MANIFEST_COLUMNS_MISMATCH");
      if (declaredBackend !== this.manifest.lexical_backend) throw new Error("RETRIEVAL_LEXICAL_BACKEND_MISMATCH");
      validateLexicalTableColumns(this.#database);
      validateLexicalProjectionSchema(this.#database, this.manifest);
      const integrity = this.#database.prepare("PRAGMA integrity_check").all() as SqliteRow[];
      if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") throw new Error("RETRIEVAL_SQLITE_INTEGRITY_FAILED");
      if ((this.#database.prepare("PRAGMA foreign_key_check").all() as SqliteRow[]).length) throw new Error("RETRIEVAL_SQLITE_FOREIGN_KEY_FAILED");
      this.verifyPersistedProjection();
    } catch (error) {
      try { this.#database.close(); } catch { /* retain the original verification error */ }
      // Some SQLite operations (notably integrity_check) may resolve a virtual
      // table before normal manifest verification. Normalize the bundled-
      // module gap so cross-runtime active-state recovery sees one stable
      // capability error rather than a raw SQLite implementation message.
      if (/no such module:\s*fts5/iu.test(String((error as Error).message))) {
        throw new Error("SQLITE_FTS5_UNAVAILABLE", { cause: error });
      }
      throw error;
    }
  }
  close(): void { this.#database.close(); }
  countChunks(): number {
    const table = isGkxRetrievalProjectionManifest(this.manifest) ? "candidate_chunks" : "chunks";
    return Number((this.#database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as SqliteRow).count);
  }
  listChunks(): RetrievalChunk[] {
    if (isGkxRetrievalProjectionManifest(this.manifest)) return this.listCandidateChunks().map((item) => item.chunk);
    return (this.#database.prepare("SELECT * FROM chunks ORDER BY chunk_id").all() as SqliteRow[]).map(rowToChunk);
  }
  listCandidateSources(): GkxRetrievalCandidateSource[] {
    if (!isGkxRetrievalProjectionManifest(this.manifest)) throw new Error("RETRIEVAL_CANDIDATE_PROJECTION_UNAVAILABLE");
    return (this.#database.prepare("SELECT * FROM candidate_sources ORDER BY record_key").all() as SqliteRow[]).map(rowToCandidateSource);
  }
  listCandidateDeclarations(): GkxRetrievalCandidateDeclaration[] {
    if (!isGkxRetrievalProjectionManifest(this.manifest)) throw new Error("RETRIEVAL_CANDIDATE_PROJECTION_UNAVAILABLE");
    return (this.#database.prepare("SELECT * FROM candidate_declarations ORDER BY declaration_digest").all() as SqliteRow[]).map(rowToCandidateDeclaration);
  }
  listCandidateDeclarationsForRecordKeys(recordKeys: readonly string[]): GkxRetrievalCandidateDeclaration[] {
    if (!isGkxRetrievalProjectionManifest(this.manifest)) throw new Error("RETRIEVAL_CANDIDATE_PROJECTION_UNAVAILABLE");
    if (!recordKeys.length) return [];
    this.setCandidateRecordKeys(recordKeys);
    return (this.#database.prepare(`
      SELECT d.* FROM candidate_declarations AS d
      JOIN retrieval_candidate_records AS e ON e.record_key = d.source_record_key
      ORDER BY d.declaration_digest
    `).all() as SqliteRow[]).map(rowToCandidateDeclaration);
  }
  listCandidateChunks(): GkxRetrievalCandidateChunk[] {
    if (!isGkxRetrievalProjectionManifest(this.manifest)) throw new Error("RETRIEVAL_CANDIDATE_PROJECTION_UNAVAILABLE");
    return (this.#database.prepare("SELECT * FROM candidate_chunks ORDER BY candidate_chunk_key").all() as SqliteRow[]).map(rowToCandidateChunk);
  }
  listCandidateChunksForRecordKeys(recordKeys: readonly string[]): GkxRetrievalCandidateChunk[] {
    if (!isGkxRetrievalProjectionManifest(this.manifest)) throw new Error("RETRIEVAL_CANDIDATE_PROJECTION_UNAVAILABLE");
    if (!recordKeys.length) return [];
    this.setCandidateRecordKeys(recordKeys);
    return (this.#database.prepare(`
      SELECT c.* FROM candidate_chunks AS c
      JOIN retrieval_candidate_records AS e ON e.record_key = c.record_key
      ORDER BY c.candidate_chunk_key
    `).all() as SqliteRow[]).map(rowToCandidateChunk);
  }
  listCandidateChunksForKeys(candidateChunkKeys: readonly string[]): GkxRetrievalCandidateChunk[] {
    if (!isGkxRetrievalProjectionManifest(this.manifest)) throw new Error("RETRIEVAL_CANDIDATE_PROJECTION_UNAVAILABLE");
    if (!candidateChunkKeys.length) return [];
    this.setEligibleChunkIds(candidateChunkKeys);
    return (this.#database.prepare(`
      SELECT c.* FROM candidate_chunks AS c
      JOIN retrieval_eligible AS e ON e.chunk_id = c.candidate_chunk_key
      ORDER BY c.candidate_chunk_key
    `).all() as SqliteRow[]).map(rowToCandidateChunk);
  }
  listSourceProvenance(): GkxRetrievalStoredSourceProvenance[] {
    throw new Error("RETRIEVAL_AUTHORIZED_VIEW_REQUIRED");
  }
  listChunksForSourceIds(sourceIds: readonly string[]): RetrievalChunk[] {
    if (isGkxRetrievalProjectionManifest(this.manifest)) throw new Error("RETRIEVAL_AUTHORIZED_VIEW_REQUIRED");
    if (!sourceIds.length) return [];
    this.#database.exec("DROP TABLE IF EXISTS temp.retrieval_eligible_sources; CREATE TEMP TABLE retrieval_eligible_sources(source_id TEXT PRIMARY KEY);");
    const insert = this.#database.prepare("INSERT OR IGNORE INTO retrieval_eligible_sources(source_id) VALUES (?)");
    for (const sourceId of [...sourceIds].sort(retrievalCodeUnitCompare)) insert.run(sourceId);
    return (this.#database.prepare(`
      SELECT c.* FROM chunks AS c
      JOIN retrieval_eligible_sources AS e ON e.source_id = c.source_id
      ORDER BY c.chunk_id
    `).all() as SqliteRow[]).map(rowToChunk);
  }
  getChunk(chunkId: string): RetrievalChunk | null {
    if (isGkxRetrievalProjectionManifest(this.manifest)) throw new Error("RETRIEVAL_AUTHORIZED_VIEW_REQUIRED");
    const row = this.#database.prepare("SELECT * FROM chunks WHERE chunk_id = ?").get(chunkId) as SqliteRow | undefined;
    return row ? rowToChunk(row) : null;
  }
  /** Verified cache keyed only within one exact embedding space. */
  contentVectorCache(providerId: string, modelId: string, dimensions: number): ReadonlyMap<string, Float32Array> | null {
    if (this.manifest.embedding_provider_id !== providerId || this.manifest.embedding_model_id !== modelId || this.manifest.embedding_dimensions !== dimensions) return null;
    const candidate = isGkxRetrievalProjectionManifest(this.manifest);
    const chunks = candidate
      ? new Map(this.listCandidateChunks().map((item) => [item.candidate_chunk_key, item.chunk.content_digest]))
      : new Map(this.listChunks().map((chunk) => [chunk.chunk_id, chunk.content_digest]));
    const cache = new Map<string, Float32Array>();
    const vectors = candidate
      ? this.storedCandidateVectors().map((item) => ({ chunk_id: item.candidate_chunk_key, vector: item.vector }))
      : this.storedVectors();
    for (const item of vectors) {
      const contentDigest = chunks.get(item.chunk_id);
      if (!contentDigest) throw new Error("ORPHAN_VECTOR_CHUNK_ID");
      const vector = Float32Array.from(item.vector);
      const prior = cache.get(contentDigest);
      if (prior && (prior.length !== vector.length || prior.some((value, index) => value !== vector[index]))) throw new Error("CONTENT_VECTOR_CACHE_CONFLICT");
      cache.set(contentDigest, vector);
    }
    return cache;
  }
  private storedVectors(): StoredVector[] {
    return (this.#database.prepare("SELECT chunk_id, provider_id, model_id, dimensions, vector_json FROM chunk_vectors ORDER BY chunk_id").all() as SqliteRow[]).map((row) => {
      if (row.provider_id !== this.manifest.embedding_provider_id || row.model_id !== this.manifest.embedding_model_id || Number(row.dimensions) !== this.manifest.embedding_dimensions) throw new Error("VECTOR_SPACE_MISMATCH");
      const vector = JSON.parse(String(row.vector_json)) as number[];
      if (!Array.isArray(vector) || vector.length !== this.manifest.embedding_dimensions || vector.some((value) => !Number.isFinite(value))) throw new Error("VECTOR_GENERATION_INVALID");
      return { chunk_id: String(row.chunk_id), vector };
    });
  }
  private storedCandidateVectors(): GkxRetrievalCandidateVector[] {
    return (this.#database.prepare("SELECT candidate_chunk_key, provider_id, model_id, dimensions, vector_json FROM candidate_chunk_vectors ORDER BY candidate_chunk_key").all() as SqliteRow[]).map((row) => {
      if (row.provider_id !== this.manifest.embedding_provider_id || row.model_id !== this.manifest.embedding_model_id || Number(row.dimensions) !== this.manifest.embedding_dimensions) throw new Error("VECTOR_SPACE_MISMATCH");
      const item = { candidate_chunk_key: String(row.candidate_chunk_key), vector: JSON.parse(String(row.vector_json)) as number[] };
      validateGkxRetrievalCandidateVector(item);
      if (row.vector_json !== stableJson(item.vector) || item.vector.length !== this.manifest.embedding_dimensions) throw new Error("VECTOR_GENERATION_INVALID");
      return item;
    });
  }
  private verifyPersistedProjection(): void {
    if (isGkxRetrievalProjectionManifest(this.manifest)) {
      this.verifyPersistedCandidateProjection();
      return;
    }
    const chunks = this.listChunks();
    const sourceBindings = validateChunkBindings(chunks).sourceBindings;
    const sources = this.#database.prepare("SELECT source_id, source_path, source_digest FROM sources ORDER BY source_id").all() as SqliteRow[];
    if (sources.length !== sourceBindings.size || sources.some((row) => {
      const expected = sourceBindings.get(String(row.source_id));
      return !expected || expected.path !== row.source_path || expected.digest !== row.source_digest;
    })) throw new Error("RETRIEVAL_SOURCE_TABLE_MISMATCH");
    const ftsRows = this.#database.prepare("SELECT chunk_id, title, heading_path, tags, topic, category, text FROM chunk_fts ORDER BY chunk_id").all() as SqliteRow[];
    const chunksById = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]));
    const seenFtsIds = new Set<string>();
    if (ftsRows.length !== chunks.length || ftsRows.some((row) => {
      const id = String(row.chunk_id);
      if (seenFtsIds.has(id)) return true;
      seenFtsIds.add(id);
      const chunk = chunksById.get(id);
      return !chunk ||
        row.title !== (typeof chunk.metadata.title === "string" ? chunk.metadata.title : "") ||
        row.heading_path !== chunk.heading_path.join(" / ") ||
        row.tags !== (Array.isArray(chunk.metadata.tags) ? chunk.metadata.tags.join(" ") : "") ||
        row.topic !== (typeof chunk.metadata.topic === "string" ? chunk.metadata.topic : "") ||
        row.category !== (typeof chunk.metadata.category === "string" ? chunk.metadata.category : "") ||
        row.text !== chunk.text;
    }) || seenFtsIds.size !== chunksById.size || [...chunksById.keys()].some((id) => !seenFtsIds.has(id))) throw new Error("RETRIEVAL_LEXICAL_PROJECTION_MISMATCH");
    const vectors = this.storedVectors();
    const embeddingEligibleChunkIds = chunks.map((chunk) => chunk.chunk_id);
    const vectorIds = new Set(vectors.map((vector) => vector.chunk_id));
    if (this.manifest.embedding_provider_id
      ? vectors.length !== embeddingEligibleChunkIds.length || embeddingEligibleChunkIds.some((id) => !vectorIds.has(id))
      : vectors.length !== 0) throw new Error("VECTOR_GENERATION_PARTIAL");
    validateContentVectorConsistency(vectors.map((vector) => ({
      content_digest: chunksById.get(vector.chunk_id)!.content_digest,
      vector: vector.vector,
    })));
    if (chunks.length !== this.manifest.chunk_count || sourceBindings.size !== this.manifest.source_count) throw new Error("RETRIEVAL_MANIFEST_COUNT_MISMATCH");
    const { projection_id: _id, projection_digest: _digest, ...base } = this.manifest;
    const digest = calculateProjectionDigest(base, chunks, vectors);
    if (digest !== this.manifest.projection_digest) throw new Error("RETRIEVAL_PROJECTION_DIGEST_MISMATCH");
  }

  private verifyPersistedCandidateProjection(): void {
    const manifest = this.manifest as GkxRetrievalProjectionManifest;
    const sources = this.listCandidateSources();
    const declarations = this.listCandidateDeclarations();
    const chunks = this.listCandidateChunks();
    const eligibleKeys = (this.#database.prepare("SELECT candidate_chunk_key FROM embedding_eligible_candidate_chunks ORDER BY candidate_chunk_key").all() as SqliteRow[])
      .map((row) => String(row.candidate_chunk_key));
    const vectors = this.storedCandidateVectors();
    const validated = validateCandidateGenerationBindings({
      state_directory: dirname(this.database_path),
      vault_id: manifest.vault_id,
      source_snapshot_digest: manifest.source_snapshot_digest,
      configuration_digest: manifest.configuration_digest,
      policy_digest: manifest.policy_digest,
      lexical_backend: manifest.lexical_backend,
      embedding_provider_id: manifest.embedding_provider_id,
      embedding_model_id: manifest.embedding_model_id,
      embedding_dimensions: manifest.embedding_dimensions,
      candidate_sources: sources,
      candidate_declarations: declarations,
      candidate_chunks: chunks,
      embedding_eligible_candidate_chunk_keys: eligibleKeys,
      vectors,
    }, false);
    const ftsRows = this.#database.prepare("SELECT chunk_id, title, heading_path, tags, topic, category, text FROM chunk_fts ORDER BY chunk_id").all() as SqliteRow[];
    const chunksByKey = new Map(chunks.map((item) => [item.candidate_chunk_key, item.chunk]));
    const seenFtsKeys = new Set<string>();
    if (ftsRows.length !== chunks.length || ftsRows.some((row) => {
      const key = String(row.chunk_id);
      if (seenFtsKeys.has(key)) return true;
      seenFtsKeys.add(key);
      const chunk = chunksByKey.get(key);
      return !chunk || row.title !== (typeof chunk.metadata.title === "string" ? chunk.metadata.title : "") ||
        row.heading_path !== chunk.heading_path.join(" / ") || row.tags !== (Array.isArray(chunk.metadata.tags) ? chunk.metadata.tags.join(" ") : "") ||
        row.topic !== (typeof chunk.metadata.topic === "string" ? chunk.metadata.topic : "") ||
        row.category !== (typeof chunk.metadata.category === "string" ? chunk.metadata.category : "") || row.text !== chunk.text;
    }) || seenFtsKeys.size !== chunksByKey.size || [...chunksByKey.keys()].some((key) => !seenFtsKeys.has(key))) throw new Error("RETRIEVAL_LEXICAL_PROJECTION_MISMATCH");
    if (sources.length !== manifest.candidate_source_count || declarations.length !== manifest.candidate_declaration_count ||
        chunks.length !== manifest.candidate_chunk_count || validated.representedRecordKeys.size !== manifest.represented_candidate_source_count ||
        eligibleKeys.length !== manifest.embedding_eligible_candidate_chunk_count) {
      throw new Error("RETRIEVAL_MANIFEST_COUNT_MISMATCH");
    }
    const { projection_id: _id, projection_digest: _digest, ...base } = manifest;
    if (calculateLineageProjectionDigest(base, sources, declarations, chunks, eligibleKeys, vectors) !== manifest.projection_digest) {
      throw new Error("RETRIEVAL_PROJECTION_DIGEST_MISMATCH");
    }
  }
  lexicalSearch(query: string, eligibleChunkIds: readonly string[], limit: number): RankedInput[] {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("lexical limit must be positive.");
    if (!eligibleChunkIds.length) return [];
    this.setEligibleChunkIds(eligibleChunkIds);
    const select = `
      SELECT c.*, f.title AS fts_title, f.heading_path AS fts_heading_path, f.tags AS fts_tags,
             f.topic AS fts_topic, f.category AS fts_category
      FROM chunk_fts AS f
      JOIN retrieval_eligible AS e ON e.chunk_id = f.chunk_id
      JOIN chunks AS c ON c.chunk_id = f.chunk_id
    `;
    // The compatibility scan receives only rows already joined to the
    // policy-eligible temporary ID set. Denied rows never cross the SQLite
    // boundary into JavaScript matching, scoring, counts, or result timing.
    const rows = this.manifest.lexical_backend === "sqlite_fts5"
      ? this.#database.prepare(`${select} WHERE chunk_fts MATCH ?`).all(ftsExpression(query)) as SqliteRow[]
      : (this.#database.prepare(`${select} ORDER BY f.chunk_id`).all() as SqliteRow[])
        .filter((row) => lexicalScanMatches(lexicalFields(row), query));
    return rows.map((row) => ({ chunk_id: String(row.chunk_id), source_id: String(row.source_id), score: lexicalScore(row, query) }))
      .sort((a, b) => b.score - a.score || retrievalCodeUnitCompare(a.chunk_id, b.chunk_id)).slice(0, limit);
  }
  vectorSearch(queryVector: readonly number[], eligibleChunkIds: readonly string[], limit: number, providerId: string, modelId: string): RankedInput[] {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("vector limit must be positive.");
    if (this.manifest.embedding_provider_id !== providerId || this.manifest.embedding_model_id !== modelId || this.manifest.embedding_dimensions !== queryVector.length) throw new Error("VECTOR_SPACE_MISMATCH");
    if (queryVector.some((value) => !Number.isFinite(value))) throw new Error("QUERY_VECTOR_NONFINITE");
    if (!eligibleChunkIds.length) return [];
    // Populate independently of lexical search: denied vector rows must never
    // cross the SQLite boundary into JS memory, scoring, or timing aggregates.
    this.setEligibleChunkIds(eligibleChunkIds);
    const rows = this.#database.prepare(`
      SELECT v.*, c.source_id
      FROM chunk_vectors AS v
      JOIN retrieval_eligible AS e ON e.chunk_id = v.chunk_id
      JOIN chunks AS c ON c.chunk_id = v.chunk_id
      ORDER BY v.chunk_id
    `).all() as SqliteRow[];
    return rows.map((row) => {
      if (row.provider_id !== providerId || row.model_id !== modelId || Number(row.dimensions) !== queryVector.length) throw new Error("VECTOR_SPACE_MISMATCH");
      const vector = JSON.parse(String(row.vector_json)) as number[];
      return { chunk_id: String(row.chunk_id), source_id: String(row.source_id), score: cosineSimilarity(queryVector, vector), vector };
    }).sort((a, b) => b.score - a.score || retrievalCodeUnitCompare(a.chunk_id, b.chunk_id)).slice(0, limit);
  }

  candidateLexicalSearch(query: string, eligibleCandidateChunkKeys: readonly string[], limit: number): RankedInput[] {
    if (!isGkxRetrievalProjectionManifest(this.manifest)) throw new Error("RETRIEVAL_CANDIDATE_PROJECTION_UNAVAILABLE");
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("lexical limit must be positive.");
    if (!eligibleCandidateChunkKeys.length) return [];
    this.setEligibleChunkIds(eligibleCandidateChunkKeys);
    const select = `
      SELECT c.*, f.title AS fts_title, f.heading_path AS fts_heading_path, f.tags AS fts_tags,
             f.topic AS fts_topic, f.category AS fts_category
      FROM chunk_fts AS f
      JOIN retrieval_eligible AS e ON e.chunk_id = f.chunk_id
      JOIN candidate_chunks AS c ON c.candidate_chunk_key = f.chunk_id
    `;
    const rows = this.manifest.lexical_backend === "sqlite_fts5"
      ? this.#database.prepare(`${select} WHERE chunk_fts MATCH ?`).all(ftsExpression(query)) as SqliteRow[]
      : (this.#database.prepare(`${select} ORDER BY f.chunk_id`).all() as SqliteRow[]).filter((row) => {
        const candidate = rowToCandidateChunk(row);
        return lexicalScanMatches(lexicalFields({ ...row, text: candidate.chunk.text, token_count: candidate.chunk.token_count }), query);
      });
    return rows.map((row) => {
      const candidate = rowToCandidateChunk(row);
      return {
        chunk_id: candidate.chunk.chunk_id,
        source_id: candidate.chunk.source_id,
        score: lexicalScore({ ...row, text: candidate.chunk.text, token_count: candidate.chunk.token_count }, query),
      };
    }).sort((a, b) => b.score - a.score || retrievalCodeUnitCompare(a.chunk_id, b.chunk_id)).slice(0, limit);
  }

  candidateVectorSearch(
    queryVector: readonly number[],
    eligibleCandidateChunkKeys: readonly string[],
    limit: number,
    providerId: string,
    modelId: string,
  ): RankedInput[] {
    if (!isGkxRetrievalProjectionManifest(this.manifest)) throw new Error("RETRIEVAL_CANDIDATE_PROJECTION_UNAVAILABLE");
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("vector limit must be positive.");
    if (this.manifest.embedding_provider_id !== providerId || this.manifest.embedding_model_id !== modelId || this.manifest.embedding_dimensions !== queryVector.length) {
      throw new Error("VECTOR_SPACE_MISMATCH");
    }
    if (queryVector.some((value) => !Number.isFinite(value))) throw new Error("QUERY_VECTOR_NONFINITE");
    if (!eligibleCandidateChunkKeys.length) return [];
    this.setEligibleChunkIds(eligibleCandidateChunkKeys);
    const rows = this.#database.prepare(`
      SELECT v.*, c.chunk_json
      FROM candidate_chunk_vectors AS v
      JOIN retrieval_eligible AS e ON e.chunk_id = v.candidate_chunk_key
      JOIN candidate_chunks AS c ON c.candidate_chunk_key = v.candidate_chunk_key
      ORDER BY v.candidate_chunk_key
    `).all() as SqliteRow[];
    return rows.map((row) => {
      if (row.provider_id !== providerId || row.model_id !== modelId || Number(row.dimensions) !== queryVector.length) throw new Error("VECTOR_SPACE_MISMATCH");
      const chunk = JSON.parse(String(row.chunk_json)) as RetrievalChunk;
      validateRetrievalChunk(chunk);
      const vector = JSON.parse(String(row.vector_json)) as number[];
      if (!Array.isArray(vector) || vector.length !== queryVector.length || vector.some((value) => !Number.isFinite(value))) throw new Error("VECTOR_GENERATION_INVALID");
      return { chunk_id: chunk.chunk_id, source_id: chunk.source_id, score: cosineSimilarity(queryVector, vector), vector };
    }).sort((a, b) => b.score - a.score || retrievalCodeUnitCompare(a.chunk_id, b.chunk_id)).slice(0, limit);
  }

  /**
   * Schema-3 policy/provider boundary check. It probes only caller-authorized
   * IDs and never materializes the denied eligibility table into JavaScript.
   */
  vectorEligibilityCovers(authorizedChunkIds: readonly string[]): boolean {
    if (isGkxRetrievalProjectionManifest(this.manifest)) return false;
    return true;
  }

  candidateVectorEligibilityCovers(authorizedCandidateChunkKeys: readonly string[]): boolean {
    if (!isGkxRetrievalProjectionManifest(this.manifest)) throw new Error("RETRIEVAL_CANDIDATE_PROJECTION_UNAVAILABLE");
    const contains = this.#database.prepare("SELECT 1 AS present FROM embedding_eligible_candidate_chunks WHERE candidate_chunk_key = ?");
    return authorizedCandidateChunkKeys.every((candidateChunkKey) => contains.get(candidateChunkKey) !== undefined);
  }

  private setEligibleChunkIds(eligibleChunkIds: readonly string[]): void {
    this.#database.exec("DROP TABLE IF EXISTS temp.retrieval_eligible; CREATE TEMP TABLE retrieval_eligible(chunk_id TEXT PRIMARY KEY);");
    const insert = this.#database.prepare("INSERT OR IGNORE INTO retrieval_eligible(chunk_id) VALUES (?)");
    for (const chunkId of [...eligibleChunkIds].sort(retrievalCodeUnitCompare)) insert.run(chunkId);
  }

  private setCandidateRecordKeys(recordKeys: readonly string[]): void {
    this.#database.exec("DROP TABLE IF EXISTS temp.retrieval_candidate_records; CREATE TEMP TABLE retrieval_candidate_records(record_key TEXT PRIMARY KEY);");
    const insert = this.#database.prepare("INSERT OR IGNORE INTO retrieval_candidate_records(record_key) VALUES (?)");
    for (const recordKey of [...recordKeys].sort(retrievalCodeUnitCompare)) insert.run(recordKey);
  }
}
