import { DatabaseSync } from "node:sqlite";
import { chmodSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, parse, resolve } from "node:path";
import { ENGINE_VERSION } from "../version";
import {
  RETRIEVAL_CHUNKER_VERSION,
  RETRIEVAL_CONTRACT_VERSION,
  RETRIEVAL_PROJECTION_SCHEMA_VERSION,
  RETRIEVAL_TOKENIZER_VERSION,
} from "./contracts";
import { validateRetrievalChunk } from "./chunker";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, stableJson } from "./digest";
import { cosineSimilarity } from "./fusion";
import { lexicalSignal } from "./lexical";
import type { RankedInput } from "./fusion";
import type { RetrievalChunk, RetrievalProjectionManifest } from "./types";

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
}

export interface BuiltRetrievalGeneration {
  database_path: string;
  pointer_path: string;
  manifest: RetrievalProjectionManifest;
}

const MIGRATIONS = [
  `
    CREATE TABLE projection_manifest (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      manifest_json TEXT NOT NULL,
      contract_version TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      projection_id TEXT NOT NULL UNIQUE,
      projection_digest TEXT NOT NULL UNIQUE
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
  `,
] as const;

function validateStateDirectory(path: string): string {
  if (!path || path.includes("\0")) throw new TypeError("state_directory is invalid.");
  const absolute = resolve(path);
  if (parse(absolute).root === absolute) throw new TypeError("state_directory cannot be a filesystem root.");
  return absolute;
}

function sameFilesystemPath(left: string, right: string): boolean {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);
  return process.platform === "win32"
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function pathExists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function assertExistingAncestorIsUnaliased(target: string): void {
  let existing = resolve(target);
  while (!pathExists(existing)) {
    const parent = dirname(existing);
    if (parent === existing) throw new Error("RETRIEVAL_STATE_ANCESTOR_MISSING");
    existing = parent;
  }
  const link = lstatSync(existing);
  if (!link.isDirectory() || link.isSymbolicLink() || !sameFilesystemPath(realpathSync(existing), existing)) throw new Error("RETRIEVAL_STATE_ANCESTOR_ALIAS_REJECTED");
}

function assertRealStateDirectory(directory: string): string {
  const real = realpathSync(directory);
  if (!sameFilesystemPath(real, directory)) throw new Error("RETRIEVAL_STATE_DIRECTORY_SYMLINK_REJECTED");
  return real;
}

function assertPlainContainedFile(path: string, directory: string): void {
  if (!sameFilesystemPath(dirname(resolve(path)), directory)) throw new Error("RETRIEVAL_STATE_PATH_ESCAPE");
  if (pathExists(path)) {
    const link = lstatSync(path);
    if (link.isSymbolicLink() || !link.isFile()) throw new Error("RETRIEVAL_STATE_SYMLINK_REJECTED");
    if (statSync(path).nlink > 1) throw new Error("RETRIEVAL_STATE_HARDLINK_REJECTED");
  }
}

function hardenDirectoryPermissions(path: string): void {
  // POSIX mode bits are deterministic here. Windows requires an installer or
  // host-specific ACL and is qualified separately; chmod is not an ACL claim.
  if (process.platform !== "win32") chmodSync(path, 0o700);
}

function hardenFilePermissions(path: string): void {
  if (process.platform !== "win32") chmodSync(path, 0o600);
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
  const terms: string[] = [];
  const matcher = /"([^"]+)"|(\S+)/gu;
  for (const match of query.trim().matchAll(matcher)) {
    const value = (match[1] ?? match[2]).trim();
    if (value) terms.push(`"${value.replace(/"/g, '""')}"`);
  }
  if (!terms.length) throw new TypeError("Search query must contain at least one term.");
  return terms.join(" AND ");
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

function assertManifest(value: RetrievalProjectionManifest): void {
  if (!value || typeof value !== "object") throw new Error("RETRIEVAL_MANIFEST_INVALID");
  const keys = [
    "chunk_count", "chunker_version", "configuration_digest", "contract_version", "embedding_dimensions",
    "embedding_model_id", "embedding_provider_id", "engine_version", "policy_digest", "projection_digest",
    "projection_id", "projection_schema_version", "source_count", "source_snapshot_digest", "tokenizer_version", "vault_id",
  ];
  if (Object.keys(value).sort(retrievalCodeUnitCompare).join("\0") !== keys.sort(retrievalCodeUnitCompare).join("\0")) throw new Error("RETRIEVAL_MANIFEST_FIELDS_INVALID");
  if (value.contract_version !== RETRIEVAL_CONTRACT_VERSION) throw new Error("RETRIEVAL_CONTRACT_MISMATCH");
  if (value.projection_schema_version !== RETRIEVAL_PROJECTION_SCHEMA_VERSION) throw new Error("RETRIEVAL_SCHEMA_MISMATCH");
  if (value.chunker_version !== RETRIEVAL_CHUNKER_VERSION || value.tokenizer_version !== RETRIEVAL_TOKENIZER_VERSION) throw new Error("RETRIEVAL_CHUNKER_MISMATCH");
  if (value.engine_version !== ENGINE_VERSION || typeof value.vault_id !== "string" || !value.vault_id || value.vault_id.length > 512) throw new Error("RETRIEVAL_MANIFEST_IDENTITY_INVALID");
  for (const digest of [value.source_snapshot_digest, value.configuration_digest, value.policy_digest, value.projection_digest]) {
    if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) throw new Error("RETRIEVAL_MANIFEST_DIGEST_INVALID");
  }
  if (!Number.isSafeInteger(value.source_count) || value.source_count < 0 || !Number.isSafeInteger(value.chunk_count) || value.chunk_count < 0) throw new Error("RETRIEVAL_MANIFEST_COUNT_INVALID");
  const hasVectorIdentity = value.embedding_provider_id !== null || value.embedding_model_id !== null || value.embedding_dimensions !== null;
  if ((value.embedding_provider_id !== null && typeof value.embedding_provider_id !== "string") || (value.embedding_model_id !== null && typeof value.embedding_model_id !== "string")) throw new Error("VECTOR_MANIFEST_IDENTITY_INVALID");
  if (hasVectorIdentity && (!value.embedding_provider_id || !value.embedding_model_id || !Number.isSafeInteger(value.embedding_dimensions) || value.embedding_dimensions! <= 0)) throw new Error("VECTOR_MANIFEST_IDENTITY_INVALID");
  const expectedId = `retrieval:${value.projection_digest.slice("sha256:".length, "sha256:".length + 24)}`;
  if (value.projection_id !== expectedId) throw new Error("RETRIEVAL_PROJECTION_ID_INVALID");
}

function calculateProjectionDigest(manifest: Omit<RetrievalProjectionManifest, "projection_id" | "projection_digest">, chunks: readonly RetrievalChunk[], vectors: readonly StoredVector[]): string {
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
    embedding_provider_id: manifest.embedding_provider_id,
    embedding_model_id: manifest.embedding_model_id,
    embedding_dimensions: manifest.embedding_dimensions,
    source_count: manifest.source_count,
    chunk_count: manifest.chunk_count,
    chunks: [...chunks].sort((a, b) => retrievalCodeUnitCompare(a.chunk_id, b.chunk_id)),
    vectors: [...vectors].sort((a, b) => retrievalCodeUnitCompare(a.chunk_id, b.chunk_id)),
  });
}

function projectionManifest(input: RetrievalGenerationInput): RetrievalProjectionManifest {
  const chunks = [...input.chunks].sort((a, b) => retrievalCodeUnitCompare(a.chunk_id, b.chunk_id));
  const vectors = [...(input.vectors ?? [])].sort((a, b) => retrievalCodeUnitCompare(a.chunk_id, b.chunk_id));
  const identityParts = [input.embedding_provider_id ?? null, input.embedding_model_id ?? null, input.embedding_dimensions ?? null];
  const activeVectorIdentity = identityParts.every((part) => part !== null);
  if (!activeVectorIdentity && identityParts.some((part) => part !== null)) throw new Error("VECTOR_MANIFEST_IDENTITY_INVALID");
  if (activeVectorIdentity && chunks.length !== vectors.length) throw new Error("VECTOR_GENERATION_PARTIAL");
  if (!activeVectorIdentity && vectors.length) throw new Error("VECTOR_GENERATION_IDENTITY_MISSING");
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
    embedding_provider_id: input.embedding_provider_id ?? null,
    embedding_model_id: input.embedding_model_id ?? null,
    embedding_dimensions: input.embedding_dimensions ?? null,
    source_count: new Set(chunks.map((chunk) => chunk.source_id)).size,
    chunk_count: chunks.length,
  };
  const digest = calculateProjectionDigest(base, chunks, vectors);
  return { ...base, projection_id: `retrieval:${digest.slice("sha256:".length, "sha256:".length + 24)}`, projection_digest: digest };
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

function validateGenerationChunkBindings(chunks: readonly RetrievalChunk[]): {
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

function insertGeneration(database: DatabaseSync, manifest: RetrievalProjectionManifest, chunks: readonly RetrievalChunk[], vectors: readonly StoredVector[]): void {
  const { chunkIds } = validateGenerationChunkBindings(chunks);
  const vectorIds = new Set<string>();
  for (const item of vectors) {
    if (vectorIds.has(item.chunk_id)) throw new Error("DUPLICATE_VECTOR_CHUNK_ID");
    if (!chunkIds.has(item.chunk_id)) throw new Error("ORPHAN_VECTOR_CHUNK_ID");
    vectorIds.add(item.chunk_id);
    if (item.vector.length !== manifest.embedding_dimensions || item.vector.some((value) => !Number.isFinite(value))) throw new Error("VECTOR_GENERATION_INVALID");
  }
  if (manifest.embedding_provider_id && vectorIds.size !== chunks.length) throw new Error("VECTOR_GENERATION_PARTIAL");
  if (!manifest.embedding_provider_id && vectorIds.size !== 0) throw new Error("VECTOR_GENERATION_IDENTITY_MISSING");
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; BEGIN IMMEDIATE;");
  try {
    for (let index = 0; index < MIGRATIONS.length; index++) {
      database.exec(MIGRATIONS[index]);
      database.exec(`PRAGMA user_version = ${index + 1}`);
    }
    database.prepare("INSERT INTO projection_manifest VALUES (1, ?, ?, ?, ?, ?)").run(stableJson(manifest), manifest.contract_version, manifest.projection_schema_version, manifest.projection_id, manifest.projection_digest);
    const insertSource = database.prepare("INSERT OR IGNORE INTO sources(source_id, source_path, source_digest) VALUES (?, ?, ?)");
    const insertChunk = database.prepare(`INSERT INTO chunks(
      chunk_id, source_id, source_path, source_digest, heading_path_json, heading_depth,
      ordinal_within_source, structural_position, part_ordinal, start_byte, end_byte,
      start_line, end_line, content_digest, text, token_count, parent_chunk_id,
      lineage_id, valid_from, valid_to, supersedes_json, superseded_by_json, metadata_json
    ) VALUES (${Array(23).fill("?").join(",")})`);
    const insertFts = database.prepare("INSERT INTO chunk_fts(chunk_id, title, heading_path, tags, topic, category, text) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const chunk of [...chunks].sort((a, b) => retrievalCodeUnitCompare(a.chunk_id, b.chunk_id))) {
      insertSource.run(chunk.source_id, chunk.source_path, chunk.source_digest);
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

/** Builds an immutable database then atomically advances a small active pointer. */
export function buildRetrievalGeneration(input: RetrievalGenerationInput): BuiltRetrievalGeneration {
  // Validate every record before creating or touching derived state. A single
  // malformed chunk rejects the whole source generation and cannot advance the
  // active pointer or leave a partial database behind.
  validateGenerationChunkBindings(input.chunks);
  const directory = validateStateDirectory(input.state_directory);
  assertExistingAncestorIsUnaliased(directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertRealStateDirectory(directory);
  hardenDirectoryPermissions(directory);
  const manifest = projectionManifest(input);
  assertManifest(manifest);
  const suffix = manifest.projection_digest.slice("sha256:".length);
  const finalPath = join(directory, `retrieval-${suffix}.sqlite`);
  assertPlainContainedFile(finalPath, directory);
  let needsBuild = !pathExists(finalPath);
  if (!needsBuild && (pathExists(`${finalPath}-wal`) || pathExists(`${finalPath}-shm`))) {
    quarantineGenerationFiles(finalPath, directory);
    needsBuild = true;
  }
  if (!needsBuild) {
    try {
      hardenFilePermissions(finalPath);
      const existing = new SqliteRetrievalStore(finalPath);
      existing.close();
    } catch {
      quarantineGenerationFiles(finalPath, directory);
      needsBuild = true;
    }
  }
  if (needsBuild) {
    // An interrupted prior replacement may leave WAL/SHM files without a main
    // database. Move them out of the active basename before creating it anew.
    quarantineGenerationFiles(finalPath, directory);
    const temporary = `${finalPath}.${process.pid}.tmp`;
    assertPlainContainedFile(temporary, directory);
    if (pathExists(temporary)) unlinkSync(temporary);
    // Pre-create owner-only: DatabaseSync's default create mode would otherwise
    // inherit a permissive process umask before note text is inserted.
    writeFileSync(temporary, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
    hardenFilePermissions(temporary);
    const database = new DatabaseSync(temporary);
    try { insertGeneration(database, manifest, input.chunks, input.vectors ?? []); }
    finally { database.close(); }
    hardenFilePermissions(temporary);
    renameSync(temporary, finalPath);
    hardenFilePermissions(finalPath);
  }
  const verified = new SqliteRetrievalStore(finalPath);
  try {
    if (verified.manifest.projection_digest !== manifest.projection_digest || verified.countChunks() !== manifest.chunk_count) throw new Error("RETRIEVAL_GENERATION_VERIFICATION_FAILED");
  } finally { verified.close(); }
  const pointerPath = join(directory, "active-retrieval.json");
  const pointerTemporary = `${pointerPath}.${process.pid}.tmp`;
  assertPlainContainedFile(pointerPath, directory);
  assertPlainContainedFile(pointerTemporary, directory);
  if (pathExists(pointerTemporary)) unlinkSync(pointerTemporary);
  writeFileSync(pointerTemporary, `${stableJson({ database_file: basename(finalPath), manifest })}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  hardenFilePermissions(pointerTemporary);
  renameSync(pointerTemporary, pointerPath);
  hardenFilePermissions(pointerPath);
  return { database_path: finalPath, pointer_path: pointerPath, manifest };
}

function statSafe(path: string): boolean {
  try { return statSync(path).isFile(); } catch { return false; }
}

export function openActiveRetrievalStore(stateDirectory: string): SqliteRetrievalStore {
  const directory = validateStateDirectory(stateDirectory);
  assertRealStateDirectory(directory);
  hardenDirectoryPermissions(directory);
  const pointerPath = join(directory, "active-retrieval.json");
  assertPlainContainedFile(pointerPath, directory);
  hardenFilePermissions(pointerPath);
  if (statSync(pointerPath).size > 1_048_576) throw new Error("RETRIEVAL_POINTER_SIZE_EXCEEDED");
  const pointer = JSON.parse(readFileSync(pointerPath, "utf8")) as { database_file: string; manifest: RetrievalProjectionManifest };
  if (basename(pointer.database_file) !== pointer.database_file) throw new Error("RETRIEVAL_POINTER_PATH_INVALID");
  assertManifest(pointer.manifest);
  const databasePath = join(directory, pointer.database_file);
  assertPlainContainedFile(databasePath, directory);
  hardenFilePermissions(databasePath);
  if (!sameFilesystemPath(realpathSync(databasePath), databasePath)) throw new Error("RETRIEVAL_DATABASE_SYMLINK_REJECTED");
  const store = new SqliteRetrievalStore(databasePath);
  if (stableJson(store.manifest) !== stableJson(pointer.manifest)) { store.close(); throw new Error("RETRIEVAL_POINTER_MANIFEST_MISMATCH"); }
  return store;
}

export class SqliteRetrievalStore {
  readonly #database: DatabaseSync;
  readonly manifest: RetrievalProjectionManifest;
  constructor(readonly database_path: string) {
    const databasePath = resolve(database_path);
    if (database_path.includes("\0") || !statSafe(databasePath)) throw new Error("RETRIEVAL_DATABASE_MISSING");
    const link = lstatSync(databasePath);
    if (!link.isFile() || link.isSymbolicLink() || statSync(databasePath).nlink > 1) throw new Error("RETRIEVAL_DATABASE_ALIAS_REJECTED");
    if (!sameFilesystemPath(realpathSync(databasePath), databasePath)) throw new Error("RETRIEVAL_DATABASE_ALIAS_REJECTED");
    if (pathExists(`${databasePath}-wal`) || pathExists(`${databasePath}-shm`)) throw new Error("RETRIEVAL_DATABASE_SIDECAR_REJECTED");
    hardenFilePermissions(databasePath);
    // Published generations are immutable derived artifacts.  Open them
    // read-only so verification and search cannot create WAL/SHM sidecars or
    // mutate a generation after its manifest digest has been accepted.
    this.#database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      this.#database.exec("PRAGMA foreign_keys = ON; PRAGMA temp_store = MEMORY;");
      const version = Number((this.#database.prepare("PRAGMA user_version").get() as SqliteRow).user_version);
      if (version !== RETRIEVAL_PROJECTION_SCHEMA_VERSION) throw new Error("RETRIEVAL_SCHEMA_MISMATCH");
      const integrity = this.#database.prepare("PRAGMA integrity_check").all() as SqliteRow[];
      if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") throw new Error("RETRIEVAL_SQLITE_INTEGRITY_FAILED");
      if ((this.#database.prepare("PRAGMA foreign_key_check").all() as SqliteRow[]).length) throw new Error("RETRIEVAL_SQLITE_FOREIGN_KEY_FAILED");
      const row = this.#database.prepare("SELECT * FROM projection_manifest WHERE singleton = 1").get() as SqliteRow | undefined;
      if (!row) throw new Error("RETRIEVAL_MANIFEST_MISSING");
      this.manifest = JSON.parse(String(row.manifest_json));
      assertManifest(this.manifest);
      if (row.contract_version !== this.manifest.contract_version || Number(row.schema_version) !== this.manifest.projection_schema_version || row.projection_id !== this.manifest.projection_id || row.projection_digest !== this.manifest.projection_digest) throw new Error("RETRIEVAL_MANIFEST_COLUMNS_MISMATCH");
      this.verifyPersistedProjection();
    } catch (error) {
      try { this.#database.close(); } catch { /* retain the original verification error */ }
      throw error;
    }
  }
  close(): void { this.#database.close(); }
  countChunks(): number { return Number((this.#database.prepare("SELECT count(*) AS count FROM chunks").get() as SqliteRow).count); }
  listChunks(): RetrievalChunk[] {
    return (this.#database.prepare("SELECT * FROM chunks ORDER BY chunk_id").all() as SqliteRow[]).map(rowToChunk);
  }
  getChunk(chunkId: string): RetrievalChunk | null {
    const row = this.#database.prepare("SELECT * FROM chunks WHERE chunk_id = ?").get(chunkId) as SqliteRow | undefined;
    return row ? rowToChunk(row) : null;
  }
  /** Verified cache keyed only within one exact embedding space. */
  contentVectorCache(providerId: string, modelId: string, dimensions: number): ReadonlyMap<string, Float32Array> | null {
    if (this.manifest.embedding_provider_id !== providerId || this.manifest.embedding_model_id !== modelId || this.manifest.embedding_dimensions !== dimensions) return null;
    const chunks = new Map(this.listChunks().map((chunk) => [chunk.chunk_id, chunk.content_digest]));
    const cache = new Map<string, Float32Array>();
    for (const item of this.storedVectors()) {
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
  private verifyPersistedProjection(): void {
    const chunks = this.listChunks();
    const { sourceBindings } = validateGenerationChunkBindings(chunks);
    const sources = this.#database.prepare("SELECT source_id, source_path, source_digest FROM sources ORDER BY source_id").all() as SqliteRow[];
    if (sources.length !== sourceBindings.size || sources.some((row) => {
      const expected = sourceBindings.get(String(row.source_id));
      return !expected || expected.path !== row.source_path || expected.digest !== row.source_digest;
    })) throw new Error("RETRIEVAL_SOURCE_TABLE_MISMATCH");
    const ftsRows = this.#database.prepare("SELECT chunk_id, title, heading_path, tags, topic, category, text FROM chunk_fts ORDER BY chunk_id").all() as SqliteRow[];
    const chunksById = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]));
    if (ftsRows.length !== chunks.length || ftsRows.some((row) => {
      const chunk = chunksById.get(String(row.chunk_id));
      return !chunk ||
        row.title !== (typeof chunk.metadata.title === "string" ? chunk.metadata.title : "") ||
        row.heading_path !== chunk.heading_path.join(" / ") ||
        row.tags !== (Array.isArray(chunk.metadata.tags) ? chunk.metadata.tags.join(" ") : "") ||
        row.topic !== (typeof chunk.metadata.topic === "string" ? chunk.metadata.topic : "") ||
        row.category !== (typeof chunk.metadata.category === "string" ? chunk.metadata.category : "") ||
        row.text !== chunk.text;
    })) throw new Error("RETRIEVAL_FTS_PROJECTION_MISMATCH");
    const vectors = this.storedVectors();
    if (this.manifest.embedding_provider_id ? vectors.length !== chunks.length : vectors.length !== 0) throw new Error("VECTOR_GENERATION_PARTIAL");
    if (chunks.length !== this.manifest.chunk_count || sourceBindings.size !== this.manifest.source_count) throw new Error("RETRIEVAL_MANIFEST_COUNT_MISMATCH");
    const { projection_id: _id, projection_digest: _digest, ...base } = this.manifest;
    if (calculateProjectionDigest(base, chunks, vectors) !== this.manifest.projection_digest) throw new Error("RETRIEVAL_PROJECTION_DIGEST_MISMATCH");
  }
  lexicalSearch(query: string, eligibleChunkIds: readonly string[], limit: number): RankedInput[] {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("lexical limit must be positive.");
    if (!eligibleChunkIds.length) return [];
    this.setEligibleChunkIds(eligibleChunkIds);
    const rows = this.#database.prepare(`
      SELECT c.*, f.title AS fts_title, f.heading_path AS fts_heading_path, f.tags AS fts_tags,
             f.topic AS fts_topic, f.category AS fts_category
      FROM chunk_fts AS f
      JOIN retrieval_eligible AS e ON e.chunk_id = f.chunk_id
      JOIN chunks AS c ON c.chunk_id = f.chunk_id
      WHERE chunk_fts MATCH ?
    `).all(ftsExpression(query)) as SqliteRow[];
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

  private setEligibleChunkIds(eligibleChunkIds: readonly string[]): void {
    this.#database.exec("DROP TABLE IF EXISTS temp.retrieval_eligible; CREATE TEMP TABLE retrieval_eligible(chunk_id TEXT PRIMARY KEY);");
    const insert = this.#database.prepare("INSERT OR IGNORE INTO retrieval_eligible(chunk_id) VALUES (?)");
    for (const chunkId of [...eligibleChunkIds].sort(retrievalCodeUnitCompare)) insert.run(chunkId);
  }
}
