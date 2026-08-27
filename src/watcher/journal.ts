import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

import type { GkxGraph } from "../types";

import {
  deriveWatcherGraphitiProjection,
  normalizeWatcherCanonicalGkxGraph,
  sealSourceRemovalEventSetBundle,
  sealWatcherFailureRetryBundle,
  sealWatcherFailureRetryNoopBundle,
  sealWatcherJournalResetBundle,
  sealWatcherJournalResetReconciliationAdoptionBundle,
  sealWatcherRecoveryRecord,
  sealWatcherTransitionChain,
} from "./contracts";
import { stableJson } from "../retrieval/digest";
import {
  discardIncompleteWatcherLeaf,
  ensureWatcherDirectory,
  hardlinkWatcherLeafNoReplace,
  listWatcherLeaves,
  openWatcherDirectory,
  parseCanonicalWatcherJson,
  readWatcherFile,
  removeEmptyWatcherDirectory,
  revalidateWatcherDirectory,
  syncWatcherDirectory,
  unlinkWatcherLeaf,
  watcherCanonicalBytes,
  watcherDigest,
  watcherLeafExists,
  watcherRawDigest,
  watcherTimestamp,
  watcherUuid7,
  withAuthorizedWatcherLeafTransition,
  writeNewWatcherFile,
  writeReservedWatcherFile,
  type WatcherDirectoryCapability,
} from "./fs-authority";
import {
  persistWatcherPointerArtifact,
  prepareWatcherPointerGuard,
  publishWatcherPointer,
  recoverWatcherPointer,
  readWatcherPointer,
  watcherPointerArtifact,
  type WatcherPointerArtifact,
} from "./pointer";

type JsonRecord = Record<string, unknown>;

export const WATCHER_JOURNAL_DATABASE_FILE = "watcher-journal.sqlite";
export const WATCHER_HOST_LOCK_FILE = "watcher-authority.lock";
export const WATCHER_HOST_LOCK_RECOVERY_FILE = "watcher-authority.recovery";
export const WATCHER_BOOTSTRAP_GUARD_FILE = ".gkos-watcher-journal-bootstrap.guard";
export const WATCHER_BOOTSTRAP_GUARD_STAGE_FILE = ".gkos-watcher-journal-bootstrap.guard-stage";
export const WATCHER_BOOTSTRAP_POINTER_TEMP_FILE = ".watcher-journal-active.json.gkos-watcher.bootstrap-tmp";
export const WATCHER_BOOTSTRAP_AUTHORITY_FILE = "watcher-journal-bootstrap-authority.json";
export const WATCHER_BOOTSTRAP_AUTHORITY_TEMP_FILE = ".watcher-journal-bootstrap-authority.json.gkos-watcher.tmp";
export const WATCHER_BOOTSTRAP_TARGET_SELECTOR_FILE = "watcher-journal-bootstrap-target-selector.json";
export const WATCHER_BOOTSTRAP_RECOVERY_BRIDGE_FILE = "watcher-journal-bootstrap-recovery-bridge.json";
export const WATCHER_BOOTSTRAP_RECOVERY_BRIDGE_STAGE_FILE = ".watcher-journal-bootstrap-recovery-bridge.json.gkos-watcher.stage";
export const WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_FILE = "watcher-journal-bootstrap-recovery-executor.json";
export const WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_STAGE_FILE = ".watcher-journal-bootstrap-recovery-executor.json.gkos-watcher.stage";
export const WATCHER_RESET_GUARD_FILE = ".gkos-watcher-journal-reset.guard";
export const WATCHER_RESET_GUARD_STAGE_FILE = ".gkos-watcher-journal-reset.guard-stage";
export const WATCHER_RESET_RECOVERY_PLAN_FILE = "watcher-journal-reset-recovery-plan.json";
export const WATCHER_RESET_RECOVERY_PLAN_STAGE_FILE = ".watcher-journal-reset-recovery-plan.json.gkos-watcher.stage";
export const WATCHER_RESET_RECOVERY_EXECUTOR_FILE = "watcher-journal-reset-recovery-executor.json";
export const WATCHER_RESET_RECOVERY_EXECUTOR_STAGE_FILE = ".watcher-journal-reset-recovery-executor.json.gkos-watcher.stage";

export const WATCHER_JOURNAL_PRAGMAS = Object.freeze([
  "PRAGMA page_size = 4096;",
  "PRAGMA auto_vacuum = NONE;",
  "PRAGMA encoding = 'UTF-8';",
  "PRAGMA user_version = 1;",
  "PRAGMA foreign_keys = ON;",
  "PRAGMA trusted_schema = OFF;",
  "PRAGMA locking_mode = EXCLUSIVE;",
  "PRAGMA synchronous = FULL;",
  "PRAGMA journal_mode = WAL;",
  "PRAGMA wal_autocheckpoint = 0;",
  "PRAGMA temp_store = MEMORY;",
  "PRAGMA max_page_count = 500000;",
] as const);

export const WATCHER_JOURNAL_DDL = Object.freeze([
  "CREATE TABLE watcher_meta (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), journal_instance_id TEXT NOT NULL UNIQUE, meta_digest TEXT NOT NULL UNIQUE, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE TABLE batches (batch_id TEXT PRIMARY KEY, started_at TEXT NOT NULL, target_topology_snapshot_digest TEXT NULL, terminal_state TEXT NULL, terminal_transition_digest TEXT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE TABLE observations (batch_id TEXT PRIMARY KEY, observation_digest TEXT NOT NULL UNIQUE, authority_digest TEXT NOT NULL UNIQUE, artifact_file TEXT NOT NULL, raw_sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (batch_id) REFERENCES batches(batch_id)) STRICT;",
  "CREATE TABLE normalized_plans (batch_id TEXT PRIMARY KEY, plan_digest TEXT NOT NULL UNIQUE, authority_digest TEXT NOT NULL UNIQUE, artifact_file TEXT NOT NULL, raw_sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL, target_topology_snapshot_digest TEXT NOT NULL, source_removal_event_set_digest TEXT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (batch_id) REFERENCES batches(batch_id)) STRICT;",
  "CREATE TABLE transitions (batch_id TEXT NOT NULL, transition_ordinal INTEGER NOT NULL, state TEXT NOT NULL, prior_transition_digest TEXT NULL, transition_digest TEXT NOT NULL UNIQUE, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), PRIMARY KEY (batch_id, transition_ordinal), FOREIGN KEY (batch_id) REFERENCES batches(batch_id)) STRICT;",
  "CREATE TABLE activation_intents (intent_digest TEXT PRIMARY KEY, coherent_manifest_digest TEXT NOT NULL UNIQUE, target_complete_transition_digest TEXT NOT NULL UNIQUE, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE TABLE activation_outcomes (outcome_digest TEXT PRIMARY KEY, intent_digest TEXT NOT NULL UNIQUE, coherent_manifest_digest TEXT NOT NULL UNIQUE, outcome TEXT NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (intent_digest) REFERENCES activation_intents(intent_digest)) STRICT;",
  "CREATE TABLE active_coherent (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), active_digest TEXT NOT NULL UNIQUE, coherent_manifest_digest TEXT NOT NULL UNIQUE, pointer_digest TEXT NOT NULL UNIQUE, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE TABLE source_removal_occurrences (occurrence_digest TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_path TEXT NOT NULL, source_digest TEXT NOT NULL, prior_coherent_manifest_digest TEXT NOT NULL, prior_topology_snapshot_digest TEXT NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE TABLE source_removal_events (event_digest TEXT PRIMARY KEY, occurrence_digest TEXT NOT NULL UNIQUE, adapter_binding_digest TEXT NULL, delivery_mode TEXT NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (occurrence_digest) REFERENCES source_removal_occurrences(occurrence_digest)) STRICT;",
  "CREATE TABLE source_removal_event_sets (event_set_digest TEXT PRIMARY KEY, set_kind TEXT NOT NULL, origin_id TEXT NOT NULL, target_topology_snapshot_digest TEXT NULL, event_count INTEGER NOT NULL, membership_digest_sequence_digest TEXT NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE TABLE source_removal_event_set_members (event_set_digest TEXT NOT NULL, event_ordinal INTEGER NOT NULL, membership_digest TEXT NOT NULL UNIQUE, event_digest TEXT NOT NULL, original_membership_digest TEXT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), PRIMARY KEY (event_set_digest, event_ordinal), UNIQUE (event_set_digest, event_digest), FOREIGN KEY (event_set_digest) REFERENCES source_removal_event_sets(event_set_digest), FOREIGN KEY (event_digest) REFERENCES source_removal_events(event_digest)) STRICT;",
  "CREATE TABLE activated_source_removal_event_sets (event_set_digest TEXT PRIMARY KEY, coherent_manifest_digest TEXT NOT NULL, activated_at TEXT NOT NULL, activation_digest TEXT NOT NULL UNIQUE, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (event_set_digest) REFERENCES source_removal_event_sets(event_set_digest)) STRICT;",
  "CREATE TABLE source_removal_adapter_responses (response_digest TEXT PRIMARY KEY, binding_digest TEXT NOT NULL, occurrence_digest TEXT NOT NULL UNIQUE, status TEXT NOT NULL, adapter_event_id TEXT NOT NULL, adapter_result_digest TEXT NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (occurrence_digest) REFERENCES source_removal_occurrences(occurrence_digest)) STRICT;",
  "CREATE TABLE source_removal_receipts (receipt_digest TEXT PRIMARY KEY, event_digest TEXT NOT NULL UNIQUE, occurrence_digest TEXT NOT NULL UNIQUE, adapter_binding_digest TEXT NOT NULL, adapter_response_digest TEXT NOT NULL UNIQUE, adapter_result_digest TEXT NOT NULL, adapter_event_id TEXT NOT NULL, status TEXT NOT NULL, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432), FOREIGN KEY (event_digest) REFERENCES source_removal_events(event_digest), FOREIGN KEY (adapter_response_digest) REFERENCES source_removal_adapter_responses(response_digest)) STRICT;",
  "CREATE TABLE journal_resets (reset_digest TEXT PRIMARY KEY, prior_journal_generation_digest TEXT NOT NULL UNIQUE, new_journal_generation_digest TEXT NOT NULL UNIQUE, body BLOB NOT NULL CHECK (length(body) BETWEEN 1 AND 33554432)) STRICT;",
  "CREATE INDEX transitions_state_idx ON transitions (state, batch_id, transition_ordinal);",
  "CREATE INDEX batches_terminal_idx ON batches (terminal_state, batch_id);",
  "CREATE INDEX source_removal_ready_idx ON source_removal_events (delivery_mode, adapter_binding_digest, event_digest);",
] as const);

const TABLE_NAMES = Object.freeze([
  "watcher_meta", "batches", "observations", "normalized_plans", "transitions", "activation_intents",
  "activation_outcomes", "active_coherent", "source_removal_occurrences", "source_removal_events",
  "source_removal_event_sets", "source_removal_event_set_members", "activated_source_removal_event_sets",
  "source_removal_adapter_responses", "source_removal_receipts", "journal_resets",
].sort());
const INDEX_NAMES = Object.freeze(["transitions_state_idx", "batches_terminal_idx", "source_removal_ready_idx"].sort());
const HOST_LOCKS = new WeakMap<object, { readonly directory: WatcherDirectoryCapability; readonly lock: Readonly<JsonRecord>; readonly raw_sha256: string }>();

export interface WatcherHostLockCapability {
  readonly directory: string;
  readonly lock_digest: string;
}

export interface WatcherJournalCoordinates {
  readonly vault_id: string;
  readonly configuration_digest: string;
  readonly policy_digest: string;
  readonly effective_profile_digest: string;
  readonly anchor_coherent_manifest_digest: string | null;
}

export interface WatcherJournalHandle {
  readonly root: WatcherDirectoryCapability;
  readonly generation_directory: WatcherDirectoryCapability;
  readonly database_path: string;
  readonly database: DatabaseSync;
  readonly meta: Readonly<JsonRecord>;
  readonly generation: Readonly<JsonRecord>;
  readonly pointer: Readonly<JsonRecord>;
}

export type WatcherJournalBootstrapBoundary =
  | "planned_target_stage" | "planned_target" | "witness_stage" | "witness" | "guard_stage" | "guard" | "child" | "database"
  | "generation_descriptor" | "pointer_artifact" | "bootstrap_temp" | "fixed_pointer"
  | "bootstrap_authority" | "guard_removed";

function fail(code: string): never {
  throw new Error(code);
}

function exactKeys(value: JsonRecord, keys: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const expected = keys.slice().sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function sealPrivateRecord(value: JsonRecord, version: string, keys: readonly string[], digestField: string): Readonly<JsonRecord> {
  exactKeys(value, keys, "GKX_WATCHER_JOURNAL_RECORD_KEYS_INVALID");
  if (value.contract_version !== version || typeof value[digestField] !== "string") fail("GKX_WATCHER_JOURNAL_RECORD_INVALID");
  const material = { ...value };
  delete material[digestField];
  if (watcherDigest(material) !== value[digestField]) fail("GKX_WATCHER_JOURNAL_RECORD_DIGEST_INVALID");
  return Object.freeze(JSON.parse(JSON.stringify(value)) as JsonRecord);
}

function scalar(database: DatabaseSync, statement: string): unknown {
  const row = database.prepare(statement).get() as Record<string, unknown> | undefined;
  return row === undefined ? undefined : Object.values(row)[0];
}

function applyPragmas(database: DatabaseSync): void {
  for (const pragma of WATCHER_JOURNAL_PRAGMAS) {
    if (pragma === "PRAGMA journal_mode = WAL;") {
      const value = scalar(database, pragma);
      if (String(value).toLowerCase() !== "wal") fail("WATCHER_JOURNAL_SCHEMA_INVALID");
    } else if (pragma === "PRAGMA locking_mode = EXCLUSIVE;") {
      const value = scalar(database, pragma);
      if (String(value).toLowerCase() !== "exclusive") fail("WATCHER_JOURNAL_SCHEMA_INVALID");
    } else {
      database.exec(pragma);
    }
  }
}

function validateHistoricalWatcherJournalAuthority(database: DatabaseSync): void {
  if (pragmaNumber(database, "user_version") !== 1 || pragmaNumber(database, "page_size") !== 4096
      || pragmaNumber(database, "auto_vacuum") !== 0 || String(scalar(database, "PRAGMA encoding;")).toUpperCase() !== "UTF-8") {
    fail("WATCHER_JOURNAL_SCHEMA_INVALID");
  }
  const objects = database.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name;").all() as Array<{ type: string; name: string }>;
  const tables = objects.filter((row) => row.type === "table").map((row) => row.name).sort();
  const indexes = objects.filter((row) => row.type === "index" && !row.name.startsWith("sqlite_autoindex_")).map((row) => row.name).sort();
  if (JSON.stringify(tables) !== JSON.stringify(TABLE_NAMES) || JSON.stringify(indexes) !== JSON.stringify(INDEX_NAMES)
      || objects.some((row) => row.type !== "table" && row.type !== "index")
      || String(scalar(database, "PRAGMA integrity_check;")).toLowerCase() !== "ok"
      || database.prepare("PRAGMA foreign_key_check;").all().length !== 0) fail("WATCHER_JOURNAL_SCHEMA_INVALID");
}

function pragmaNumber(database: DatabaseSync, name: string): number {
  return Number(scalar(database, `PRAGMA ${name};`));
}

export function validateWatcherJournalAuthority(database: DatabaseSync): void {
  if (pragmaNumber(database, "user_version") !== 1 || pragmaNumber(database, "page_size") !== 4096 ||
      pragmaNumber(database, "auto_vacuum") !== 0 || String(scalar(database, "PRAGMA encoding;")).toUpperCase() !== "UTF-8" ||
      pragmaNumber(database, "foreign_keys") !== 1 || pragmaNumber(database, "trusted_schema") !== 0 ||
      String(scalar(database, "PRAGMA locking_mode;")).toLowerCase() !== "exclusive" ||
      pragmaNumber(database, "synchronous") !== 2 || String(scalar(database, "PRAGMA journal_mode;")).toLowerCase() !== "wal" ||
      pragmaNumber(database, "wal_autocheckpoint") !== 0 || pragmaNumber(database, "temp_store") !== 2 ||
      pragmaNumber(database, "max_page_count") !== 500000) fail("WATCHER_JOURNAL_SCHEMA_INVALID");

  const objects = database.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name;").all() as Array<{ type: string; name: string }>;
  const tables = objects.filter((row) => row.type === "table").map((row) => row.name).sort();
  const indexes = objects.filter((row) => row.type === "index" && !row.name.startsWith("sqlite_autoindex_")).map((row) => row.name).sort();
  if (JSON.stringify(tables) !== JSON.stringify(TABLE_NAMES) || JSON.stringify(indexes) !== JSON.stringify(INDEX_NAMES) ||
      objects.some((row) => row.type !== "table" && row.type !== "index")) fail("WATCHER_JOURNAL_SCHEMA_INVALID");
  if (String(scalar(database, "PRAGMA integrity_check;")).toLowerCase() !== "ok") fail("WATCHER_JOURNAL_INTEGRITY_INVALID");
  const foreign = database.prepare("PRAGMA foreign_key_check;").all();
  if (foreign.length !== 0) fail("WATCHER_JOURNAL_INTEGRITY_INVALID");
}

function secureDatabaseMode(path: string): void {
  if (process.platform !== "win32") chmodSync(path, 0o600);
  const state = lstatSync(path);
  if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1 || (process.platform !== "win32" && (state.mode & 0o777) !== 0o600)) {
    fail("WATCHER_JOURNAL_IDENTITY_INVALID");
  }
}

const WATCHER_JOURNAL_SQLITE_LEAVES = Object.freeze([
  WATCHER_JOURNAL_DATABASE_FILE,
  `${WATCHER_JOURNAL_DATABASE_FILE}-shm`,
  `${WATCHER_JOURNAL_DATABASE_FILE}-wal`,
]);

function withWatcherJournalNamespaceTransition<T>(
  directory: WatcherDirectoryCapability,
  mutate: () => T,
): T {
  const present = (): readonly string[] => WATCHER_JOURNAL_SQLITE_LEAVES.filter((leaf) => existsSync(join(directory.path, leaf)));
  return withAuthorizedWatcherLeafTransition(directory, WATCHER_JOURNAL_SQLITE_LEAVES, mutate, present, ({ after }) => {
    const names = present();
    if (!names.includes(WATCHER_JOURNAL_DATABASE_FILE)) fail("WATCHER_JOURNAL_IDENTITY_INVALID");
    for (const leaf of WATCHER_JOURNAL_SQLITE_LEAVES) {
      const row = after.get(leaf);
      if (!names.includes(leaf)) {
        if (row !== null) fail("WATCHER_JOURNAL_IDENTITY_INVALID");
        continue;
      }
      if (row?.kind !== "file" || Number(row.stat_coordinate[4]) !== 1 ||
          (process.platform !== "win32" && (Number(row.stat_coordinate[3]) & 0o777) !== 0o600) ||
          (process.platform !== "win32" && Number(row.stat_coordinate[8]) !== process.geteuid?.())) {
        fail("WATCHER_JOURNAL_IDENTITY_INVALID");
      }
    }
  }, { include_affected_file_digests: false });
}

function openLiveWatcherJournalDatabase(
  directory: WatcherDirectoryCapability,
  path: string,
): DatabaseSync {
  const opened = withWatcherJournalNamespaceTransition(directory, ():
    | Readonly<{ ok: true; database: DatabaseSync }>
    | Readonly<{ ok: false; error: unknown }> => {
    let database: DatabaseSync | null = null;
    try {
      database = new DatabaseSync(path);
      applyPragmas(database);
      return Object.freeze({ ok: true, database });
    } catch (error) {
      // Opening or applying WAL pragmas can mutate the DB/WAL/SHM namespace.
      // Close any constructed handle inside the authorized transition, then
      // let its final snapshot account for the complete resulting namespace
      // before propagating the original failure.
      if (database !== null) {
        try { database.close(); } catch { /* preserve the initiating error */ }
      }
      return Object.freeze({ ok: false, error });
    }
  });
  if (opened.ok === false) throw opened.error;
  return opened.database;
}

function closeLiveWatcherJournalDatabase(
  directory: WatcherDirectoryCapability,
  database: DatabaseSync,
  validate = true,
): void {
  withWatcherJournalNamespaceTransition(directory, () => {
    if (validate) {
      database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
      validateWatcherJournalAuthority(database);
    }
    database.close();
  });
}

function createWatcherJournalDatabase(
  directory: WatcherDirectoryCapability,
  meta: Readonly<JsonRecord>,
  onBoundary?: (boundary: "database_file" | "database_schema_commit" | "database_schema_checkpoint") => void,
): DatabaseSync {
  const path = join(directory.path, WATCHER_JOURNAL_DATABASE_FILE);
  return withWatcherJournalNamespaceTransition(directory, () => {
    const descriptor = openSync(path, "wx", 0o600);
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    secureDatabaseMode(path);
    onBoundary?.("database_file");
    const database = new DatabaseSync(path);
    try {
      applyPragmas(database);
    database.exec("BEGIN IMMEDIATE;");
    try {
      for (const statement of WATCHER_JOURNAL_DDL) database.exec(statement);
      const body = Buffer.from(stableBody(meta), "utf8");
      database.prepare("INSERT INTO watcher_meta(singleton,journal_instance_id,meta_digest,body) VALUES(1,?,?,?);")
        .run(String(meta.journal_instance_id), String(meta.meta_digest), body);
      database.exec("COMMIT;");
      onBoundary?.("database_schema_commit");
    } catch (error) {
      try { database.exec("ROLLBACK;"); } catch { /* transaction ended */ }
      throw error;
    }
    database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    onBoundary?.("database_schema_checkpoint");
    validateWatcherJournalAuthority(database);
      return database;
    } catch (error) {
      database.close();
      throw error;
    }
  });
}

function stableBody(value: unknown): string {
  return stableJson(value);
}

function canonicalBody(value: unknown): Buffer {
  return Buffer.from(stableJson(value), "utf8");
}

export function watcherJournalAdmission(input: {
  readonly current_database_bytes: number;
  readonly blob_bytes: number;
  readonly mutated_rows: number;
}): Readonly<{ dirty_page_upper: number; projected_database_bytes: number; wal_upper: number }> {
  const { current_database_bytes: current, blob_bytes: blobs, mutated_rows: rows } = input;
  if (![current, blobs, rows].every((value) => Number.isSafeInteger(value) && value >= 0) || blobs > 33_554_432 || rows > 10_000) {
    fail("WATCHER_JOURNAL_CAP_EXCEEDED");
  }
  const dirty = Math.ceil(blobs / 4096) + 4 * rows + 4096;
  const projected = current + dirty * 4096;
  const wal = 32 + dirty * 4120;
  if (!Number.isSafeInteger(projected) || projected > 2_048_000_000 || projected + wal + 67_108_864 > 4_294_967_296) {
    fail("WATCHER_JOURNAL_CAP_EXCEEDED");
  }
  return Object.freeze({ dirty_page_upper: dirty, projected_database_bytes: projected, wal_upper: wal });
}

export function watcherJournalTransaction(
  handle: WatcherJournalHandle,
  input: {
    readonly blob_bytes: number;
    readonly mutated_rows: number;
    readonly run: (database: DatabaseSync) => void;
    readonly after_commit?: () => void;
    readonly after_checkpoint?: () => void;
  },
): void {
  handle.database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  const size = lstatSync(handle.database_path).size;
  watcherJournalAdmission({ current_database_bytes: size, blob_bytes: input.blob_bytes, mutated_rows: input.mutated_rows });
  handle.database.exec("BEGIN IMMEDIATE;");
  try {
    input.run(handle.database);
    handle.database.exec("COMMIT;");
    input.after_commit?.();
  } catch (error) {
    try { handle.database.exec("ROLLBACK;"); } catch { /* transaction ended */ }
    throw error;
  }
  handle.database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  input.after_checkpoint?.();
  validateWatcherJournalAuthority(handle.database);
  const db = lstatSync(handle.database_path).size;
  const wal = watcherLeafSize(`${handle.database_path}-wal`);
  const shm = watcherLeafSize(`${handle.database_path}-shm`);
  if (db + wal + shm > 4_294_967_296) fail("WATCHER_JOURNAL_CAP_EXCEEDED");
}

function sealedBody(value: unknown): { record: Readonly<JsonRecord>; bytes: Buffer } {
  const record = sealWatcherRecoveryRecord(value);
  return { record, bytes: canonicalBody(record) };
}

function sqlString(value: unknown): string {
  if (typeof value !== "string") fail("WATCHER_JOURNAL_VALUE_INVALID");
  return value;
}

function sqlInteger(value: unknown): number {
  if (!Number.isSafeInteger(value)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  return value as number;
}

function sqlNullableString(value: unknown): string | null {
  if (value === null) return null;
  return sqlString(value);
}

export function prepareWatcherJournalActivation(handle: WatcherJournalHandle, input: {
  readonly batch: unknown;
  readonly observation_authority: unknown;
  readonly plan_authority: unknown;
  readonly transitions: readonly unknown[];
  readonly intent: unknown;
  readonly source_removal_event_set_bundle?: unknown | null;
}): void {
  const batch = sealedBody(input.batch);
  const observation = sealedBody(input.observation_authority);
  const plan = sealedBody(input.plan_authority);
  const transitions = input.transitions.map(sealedBody);
  const intent = sealedBody(input.intent);
  const removalBundle = input.source_removal_event_set_bundle === null || input.source_removal_event_set_bundle === undefined
    ? null : sealSourceRemovalEventSetBundle(input.source_removal_event_set_bundle);
  const removalBodies = removalBundle === null ? [] : [
    sealedBody(removalBundle.event_set),
    ...(removalBundle.occurrences as readonly unknown[]).map(sealedBody),
    ...(removalBundle.events as readonly unknown[]).map(sealedBody),
    ...(removalBundle.memberships as readonly unknown[]).map(sealedBody),
  ];
  if (transitions.length !== 6 || transitions.some((row, index) => row.record.transition_ordinal !== index) ||
      transitions.at(-1)?.record.state !== "activation_prepared" || batch.record.batch_id !== observation.record.batch_id ||
      batch.record.batch_id !== plan.record.batch_id || transitions.some((row) => row.record.batch_id !== batch.record.batch_id) ||
      intent.record.prepared_transition_digest !== transitions.at(-1)?.record.transition_digest) {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  if ((removalBundle === null ? null : (removalBundle.event_set as JsonRecord).event_set_digest) !== plan.record.source_removal_event_set_digest) {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  const bodies = [batch, observation, plan, ...transitions, intent, ...removalBodies];
  watcherJournalTransaction(handle, {
    blob_bytes: bodies.reduce((sum, row) => sum + row.bytes.byteLength, 0),
    mutated_rows: bodies.length,
    run(database) {
      database.prepare("INSERT INTO batches(batch_id,started_at,target_topology_snapshot_digest,terminal_state,terminal_transition_digest,body) VALUES(?,?,?,?,?,?);")
        .run(sqlString(batch.record.batch_id), sqlString(batch.record.started_at), sqlString(plan.record.target_topology_snapshot_digest), null, null, batch.bytes);
      database.prepare("INSERT INTO observations(batch_id,observation_digest,authority_digest,artifact_file,raw_sha256,byte_size,body) VALUES(?,?,?,?,?,?,?);")
        .run(sqlString(observation.record.batch_id), sqlString(observation.record.observation_digest), sqlString(observation.record.authority_digest),
          sqlString(observation.record.observation_artifact_file), sqlString(observation.record.observation_raw_sha256),
          sqlInteger(observation.record.observation_byte_size), observation.bytes);
      database.prepare("INSERT INTO normalized_plans(batch_id,plan_digest,authority_digest,artifact_file,raw_sha256,byte_size,target_topology_snapshot_digest,source_removal_event_set_digest,body) VALUES(?,?,?,?,?,?,?,?,?);")
        .run(sqlString(plan.record.batch_id), sqlString(plan.record.plan_digest), sqlString(plan.record.authority_digest), sqlString(plan.record.plan_artifact_file),
          sqlString(plan.record.plan_raw_sha256), sqlInteger(plan.record.plan_byte_size), sqlString(plan.record.target_topology_snapshot_digest),
          sqlNullableString(plan.record.source_removal_event_set_digest), plan.bytes);
      const transitionStatement = database.prepare("INSERT INTO transitions(batch_id,transition_ordinal,state,prior_transition_digest,transition_digest,body) VALUES(?,?,?,?,?,?);");
      for (const transition of transitions) transitionStatement.run(
        sqlString(transition.record.batch_id), sqlInteger(transition.record.transition_ordinal), sqlString(transition.record.state),
        sqlNullableString(transition.record.prior_transition_digest), sqlString(transition.record.transition_digest), transition.bytes,
      );
      database.prepare("INSERT INTO activation_intents(intent_digest,coherent_manifest_digest,target_complete_transition_digest,body) VALUES(?,?,?,?);")
        .run(sqlString(intent.record.intent_digest), sqlString(intent.record.coherent_manifest_digest),
          sqlString((intent.record.target_complete_transition as JsonRecord).transition_digest), intent.bytes);
      if (removalBundle !== null) {
        const eventSet = sealedBody(removalBundle.event_set);
        database.prepare("INSERT INTO source_removal_event_sets(event_set_digest,set_kind,origin_id,target_topology_snapshot_digest,event_count,membership_digest_sequence_digest,body) VALUES(?,?,?,?,?,?,?);")
          .run(sqlString(eventSet.record.event_set_digest), sqlString(eventSet.record.set_kind), sqlString(eventSet.record.origin_id),
            sqlNullableString(eventSet.record.target_topology_snapshot_digest), sqlInteger(eventSet.record.event_count),
            sqlString(eventSet.record.membership_digest_sequence_digest), eventSet.bytes);
        const occurrenceStatement = database.prepare("INSERT INTO source_removal_occurrences(occurrence_digest,source_id,source_path,source_digest,prior_coherent_manifest_digest,prior_topology_snapshot_digest,body) VALUES(?,?,?,?,?,?,?);");
        const eventStatement = database.prepare("INSERT INTO source_removal_events(event_digest,occurrence_digest,adapter_binding_digest,delivery_mode,body) VALUES(?,?,?,?,?);");
        const membershipStatement = database.prepare("INSERT INTO source_removal_event_set_members(event_set_digest,event_ordinal,membership_digest,event_digest,original_membership_digest,body) VALUES(?,?,?,?,?,?);");
        for (let index = 0; index < (removalBundle.memberships as readonly unknown[]).length; index += 1) {
          const occurrence = sealedBody((removalBundle.occurrences as readonly unknown[])[index]);
          const event = sealedBody((removalBundle.events as readonly unknown[])[index]);
          const membership = sealedBody((removalBundle.memberships as readonly unknown[])[index]);
          occurrenceStatement.run(sqlString(occurrence.record.occurrence_digest), sqlString(occurrence.record.source_id),
            sqlString(occurrence.record.source_path), sqlString(occurrence.record.source_digest),
            sqlString(occurrence.record.prior_coherent_manifest_digest), sqlString(occurrence.record.prior_topology_snapshot_digest), occurrence.bytes);
          eventStatement.run(sqlString(event.record.event_digest), sqlString(event.record.occurrence_digest),
            sqlNullableString(event.record.adapter_binding_digest), sqlString(event.record.delivery_mode), event.bytes);
          membershipStatement.run(sqlString(eventSet.record.event_set_digest), sqlInteger(membership.record.event_ordinal),
            sqlString(membership.record.membership_digest), sqlString(membership.record.event_digest),
            sqlNullableString(membership.record.original_membership_digest), membership.bytes);
        }
      }
    },
  });
}

export function finalizeWatcherJournalActivation(handle: WatcherJournalHandle, input: {
  readonly complete_transition: unknown;
  readonly outcome: unknown;
  readonly active: unknown;
  readonly source_removal_activation?: unknown | null;
}): void {
  const transition = sealedBody(input.complete_transition);
  const outcome = sealedBody(input.outcome);
  const active = sealedBody(input.active);
  const removalActivation = input.source_removal_activation === null || input.source_removal_activation === undefined
    ? null : sealedBody(input.source_removal_activation);
  if (transition.record.state !== "complete" || transition.record.transition_ordinal !== 6 ||
      outcome.record.outcome !== "published" || outcome.record.pointer_digest !== active.record.pointer_digest ||
      outcome.record.coherent_manifest_digest !== active.record.coherent_manifest_digest) {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  const bodies = [transition, outcome, active, ...(removalActivation === null ? [] : [removalActivation])];
  watcherJournalTransaction(handle, {
    blob_bytes: bodies.reduce((sum, row) => sum + row.bytes.byteLength, 0),
    mutated_rows: 4 + (removalActivation === null ? 0 : 1),
    run(database) {
      database.prepare("INSERT INTO transitions(batch_id,transition_ordinal,state,prior_transition_digest,transition_digest,body) VALUES(?,?,?,?,?,?);")
        .run(sqlString(transition.record.batch_id), sqlInteger(transition.record.transition_ordinal), sqlString(transition.record.state),
          sqlNullableString(transition.record.prior_transition_digest), sqlString(transition.record.transition_digest), transition.bytes);
      database.prepare("UPDATE batches SET terminal_state=?,terminal_transition_digest=? WHERE batch_id=?;")
        .run("complete", sqlString(transition.record.transition_digest), sqlString(transition.record.batch_id));
      database.prepare("INSERT INTO activation_outcomes(outcome_digest,intent_digest,coherent_manifest_digest,outcome,body) VALUES(?,?,?,?,?);")
        .run(sqlString(outcome.record.outcome_digest), sqlString(outcome.record.intent_digest), sqlString(outcome.record.coherent_manifest_digest),
          sqlString(outcome.record.outcome), outcome.bytes);
      database.prepare("INSERT INTO active_coherent(singleton,active_digest,coherent_manifest_digest,pointer_digest,body) VALUES(1,?,?,?,?) ON CONFLICT(singleton) DO UPDATE SET active_digest=excluded.active_digest,coherent_manifest_digest=excluded.coherent_manifest_digest,pointer_digest=excluded.pointer_digest,body=excluded.body;")
        .run(sqlString(active.record.active_digest), sqlString(active.record.coherent_manifest_digest), sqlString(active.record.pointer_digest), active.bytes);
      if (removalActivation !== null) {
        if (removalActivation.record.coherent_manifest_digest !== active.record.coherent_manifest_digest) fail("WATCHER_JOURNAL_VALUE_INVALID");
        database.prepare("INSERT INTO activated_source_removal_event_sets(event_set_digest,coherent_manifest_digest,activated_at,activation_digest,body) VALUES(?,?,?,?,?);")
          .run(sqlString(removalActivation.record.event_set_digest), sqlString(removalActivation.record.coherent_manifest_digest),
            sqlString(removalActivation.record.activated_at), sqlString(removalActivation.record.activation_digest), removalActivation.bytes);
      }
    },
  });
}

/** Persist one terminal failed batch before any retry timer is armed. */
export function recordWatcherJournalFailure(handle: WatcherJournalHandle, input: {
  readonly batch: unknown;
  readonly observation_authority: unknown;
  readonly transitions: readonly unknown[];
}): Readonly<JsonRecord> {
  const batch = sealedBody(input.batch);
  const observation = sealedBody(input.observation_authority);
  const transitions = input.transitions.map(sealedBody);
  const chain = sealWatcherTransitionChain(transitions.map((item) => item.record));
  const terminal = chain.at(-1);
  if (batch.record.batch_id !== observation.record.batch_id || transitions.length < 1
      || chain.some((item) => item.batch_id !== batch.record.batch_id)
      || terminal?.state !== "failed" || terminal.terminal_state !== "failed"
      || batch.record.observation_authority_digest !== observation.record.authority_digest) {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  const existing = handle.database.prepare("SELECT body,terminal_state,terminal_transition_digest FROM batches WHERE batch_id=?;")
    .get(sqlString(batch.record.batch_id)) as Record<string, unknown> | undefined;
  if (existing !== undefined) {
    const current = canonicalSqlBody(existing.body).record;
    const currentTransitions = decodeBodyRows(handle.database, "transitions", "batch_id,transition_ordinal")
      .filter((item) => item.batch_id === batch.record.batch_id);
    if (stableBody(current) !== stableBody(batch.record) || existing.terminal_state !== "failed"
        || existing.terminal_transition_digest !== terminal.transition_digest
        || stableBody(currentTransitions) !== stableBody(chain)) fail("WATCHER_JOURNAL_VALUE_INVALID");
    return terminal;
  }
  watcherJournalTransaction(handle, {
    blob_bytes: batch.bytes.byteLength + observation.bytes.byteLength
      + transitions.reduce((sum, item) => sum + item.bytes.byteLength, 0),
    mutated_rows: 2 + transitions.length,
    run(database) {
      database.prepare("INSERT INTO batches(batch_id,started_at,target_topology_snapshot_digest,terminal_state,terminal_transition_digest,body) VALUES(?,?,?,?,?,?);")
        .run(sqlString(batch.record.batch_id), sqlString(batch.record.started_at), null, "failed",
          sqlString(terminal.transition_digest), batch.bytes);
      database.prepare("INSERT INTO observations(batch_id,observation_digest,authority_digest,artifact_file,raw_sha256,byte_size,body) VALUES(?,?,?,?,?,?,?);")
        .run(sqlString(observation.record.batch_id), sqlString(observation.record.observation_digest),
          sqlString(observation.record.authority_digest), sqlString(observation.record.observation_artifact_file),
          sqlString(observation.record.observation_raw_sha256), sqlInteger(observation.record.observation_byte_size), observation.bytes);
      const statement = database.prepare("INSERT INTO transitions(batch_id,transition_ordinal,state,prior_transition_digest,transition_digest,body) VALUES(?,?,?,?,?,?);");
      for (const transition of transitions) statement.run(
        sqlString(transition.record.batch_id), sqlInteger(transition.record.transition_ordinal), sqlString(transition.record.state),
        sqlNullableString(transition.record.prior_transition_digest), sqlString(transition.record.transition_digest), transition.bytes,
      );
    },
  });
  return terminal;
}

export function readWatcherJournalActive(handle: WatcherJournalHandle): Readonly<JsonRecord> | null {
  const row = handle.database.prepare("SELECT body FROM active_coherent WHERE singleton=1;").get() as { body?: Uint8Array } | undefined;
  if (!row?.body) return null;
  let value: unknown;
  try { value = JSON.parse(Buffer.from(row.body).toString("utf8")); } catch { fail("WATCHER_JOURNAL_VALUE_INVALID"); }
  const active = sealWatcherRecoveryRecord(value);
  if (!Buffer.from(row.body).equals(canonicalBody(active))) fail("WATCHER_JOURNAL_VALUE_INVALID");
  return active;
}

function journalTableCount(handle: WatcherJournalHandle, table: string): number {
  if (!TABLE_NAMES.includes(table)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const row = handle.database.prepare(`SELECT COUNT(*) AS count FROM ${table};`).get() as { count?: unknown } | undefined;
  if (row === undefined || typeof row.count !== "number" || !Number.isSafeInteger(row.count) || row.count < 0) {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  return row.count;
}

/**
 * Recognize only the durable state produced by a completed reset before its
 * mandatory startup reconciliation.  A missing Active row is never accepted
 * merely because the outer pointer is still readable.
 */
export function watcherJournalIsAnchoredResetPendingReconciliation(
  handle: WatcherJournalHandle,
  outerPointerInput: unknown,
  outerManifestInput: unknown,
): boolean {
  validateWatcherJournalAuthority(handle.database);
  const outerPointer = sealWatcherRecoveryRecord(outerPointerInput);
  const outerManifest = sealWatcherRecoveryRecord(outerManifestInput);
  const anchor = outerManifest.coherent_manifest_digest;
  if (outerPointer.contract_version !== "gkos-watcher-active-pointer/1.0.0-draft.1"
      || outerManifest.contract_version !== "gkos-watcher-coherent-manifest/1.0.0-draft.1"
      || outerPointer.coherent_manifest_digest !== anchor
      || handle.meta.anchor_coherent_manifest_digest !== anchor
      || handle.generation.anchor_coherent_manifest_digest !== anchor
      || handle.generation.meta_digest !== handle.meta.meta_digest
      || handle.pointer.journal_generation_digest !== handle.generation.journal_generation_digest
      || handle.pointer.prior_pointer_digest === null
      || handle.meta.vault_id !== outerManifest.vault_id
      || handle.meta.configuration_digest !== outerManifest.configuration_digest
      || handle.meta.policy_digest !== outerManifest.policy_digest
      || handle.meta.effective_profile_digest !== outerManifest.effective_profile_digest) return false;

  for (const table of [
    "batches", "observations", "normalized_plans", "transitions", "activation_intents",
    "activation_outcomes", "active_coherent",
  ]) if (journalTableCount(handle, table) !== 0) return false;

  const resets = decodeBodyRows(handle.database, "journal_resets", "reset_digest");
  if (resets.length !== 1) return false;
  const reset = resets[0];
  const resetRow = handle.database.prepare(
    "SELECT reset_digest,prior_journal_generation_digest,new_journal_generation_digest FROM journal_resets;",
  ).get() as Record<string, unknown> | undefined;
  if (resetRow === undefined
      || resetRow.reset_digest !== reset.reset_digest
      || resetRow.prior_journal_generation_digest !== reset.prior_journal_generation_digest
      || resetRow.new_journal_generation_digest !== reset.new_journal_generation_digest
      || reset.new_journal_meta_digest !== handle.meta.meta_digest
      || reset.new_journal_generation_digest !== handle.generation.journal_generation_digest
      || reset.target_journal_pointer_digest !== handle.pointer.pointer_digest
      || reset.outer_coherent_manifest_digest !== anchor) return false;

  const priorDigest = String(handle.pointer.prior_pointer_digest);
  const priorPointerFile = `watcher-journal-pointer-${priorDigest.slice("sha256:".length)}.json`;
  try {
    const priorPointer = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(readWatcherFile(handle.root, priorPointerFile)));
    if (priorPointer.contract_version !== "gkos-watcher-journal-active-pointer/1.0.0-draft.1"
        || priorPointer.pointer_digest !== priorDigest
        || priorPointer.journal_generation_digest !== reset.prior_journal_generation_digest) return false;
    const priorGeneration = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(
      readWatcherFile(handle.root, String(priorPointer.journal_generation_file)),
    ));
    if (priorGeneration.contract_version !== "gkos-watcher-journal-generation/1.0.0-draft.1"
        || priorGeneration.journal_generation_digest !== reset.prior_journal_generation_digest) return false;
  } catch {
    return false;
  }

  const sets = decodeBodyRows(handle.database, "source_removal_event_sets", "event_set_digest");
  const members = decodeMembershipRows(handle.database);
  const events = decodeBodyRows(handle.database, "source_removal_events", "event_digest");
  const occurrences = decodeBodyRows(handle.database, "source_removal_occurrences", "occurrence_digest");
  const activations = decodeBodyRows(handle.database, "activated_source_removal_event_sets", "event_set_digest");
  if (journalTableCount(handle, "source_removal_adapter_responses") !== 0
      || journalTableCount(handle, "source_removal_receipts") !== 0) return false;

  const readyCount = Number(reset.ready_event_count);
  if (!Number.isSafeInteger(readyCount) || readyCount < 0) return false;
  if (readyCount === 0) {
    return reset.reset_carry_event_set_digest === null && reset.reset_carry_activation_digest === null
      && sets.length === 0 && members.length === 0 && events.length === 0 && occurrences.length === 0 && activations.length === 0;
  }
  if (sets.length !== 1 || activations.length !== 1 || members.length !== readyCount
      || events.length !== readyCount || occurrences.length !== readyCount) return false;
  const eventSet = sets[0];
  const activation = activations[0];
  if (eventSet.set_kind !== "reset_carry" || eventSet.origin_id !== reset.reset_id
      || eventSet.target_topology_snapshot_digest !== null || eventSet.event_count !== readyCount
      || eventSet.event_set_digest !== reset.reset_carry_event_set_digest
      || activation.event_set_digest !== eventSet.event_set_digest
      || activation.activation_digest !== reset.reset_carry_activation_digest
      || activation.coherent_manifest_digest !== anchor || activation.activated_at !== reset.reset_at) return false;

  const eventByDigest = new Map(events.map((item) => [String(item.event_digest), item]));
  const occurrenceByDigest = new Map(occurrences.map((item) => [String(item.occurrence_digest), item]));
  if (eventByDigest.size !== readyCount || occurrenceByDigest.size !== readyCount) return false;
  const ordered = members.filter((item) => item.event_set_digest === eventSet.event_set_digest);
  if (ordered.length !== readyCount) return false;
  for (let index = 0; index < ordered.length; index += 1) {
    const membership = ordered[index].record;
    const event = eventByDigest.get(String(membership.event_digest));
    const occurrence = event === undefined ? undefined : occurrenceByDigest.get(String(event.occurrence_digest));
    if (membership.event_ordinal !== index + 1 || typeof membership.original_membership_digest !== "string"
        || event === undefined || occurrence === undefined || event.delivery_mode !== "adapter"
        || event.adapter_binding_digest === null) return false;
  }
  const sequenceDigest = watcherDigest({
    contract_version: "gkos-watcher-source-removal-membership-sequence/1.0.0-draft.1",
    membership_digests: ordered.map((item) => item.record.membership_digest),
  });
  return eventSet.membership_digest_sequence_digest === sequenceDigest;
}

function readJournalBody(
  handle: WatcherJournalHandle,
  sql: string,
  value: string,
): Readonly<JsonRecord> | null {
  const row = handle.database.prepare(sql).get(value) as { body?: Uint8Array } | undefined;
  if (!row?.body) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(row.body).toString("utf8")); } catch { fail("WATCHER_JOURNAL_VALUE_INVALID"); }
  const record = sealWatcherRecoveryRecord(parsed);
  if (!Buffer.from(row.body).equals(canonicalBody(record))) fail("WATCHER_JOURNAL_VALUE_INVALID");
  return record;
}

export function readWatcherJournalActivationIntent(
  handle: WatcherJournalHandle,
  targetCompleteTransitionDigest: string,
): Readonly<JsonRecord> | null {
  return readJournalBody(
    handle,
    "SELECT body FROM activation_intents WHERE target_complete_transition_digest=?;",
    targetCompleteTransitionDigest,
  );
}

export function finalizeWatcherJournalTarget(
  handle: WatcherJournalHandle,
  targetCompleteTransitionDigest: string,
): Readonly<JsonRecord> {
  const intent = readWatcherJournalActivationIntent(handle, targetCompleteTransitionDigest);
  if (intent === null) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const complete = sealWatcherRecoveryRecord(intent.target_complete_transition);
  const pointer = sealWatcherRecoveryRecord(intent.target_pointer);
  if (complete.transition_digest !== targetCompleteTransitionDigest || complete.state !== "complete" ||
      pointer.coherent_manifest_digest !== intent.coherent_manifest_digest) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const current = readWatcherJournalActive(handle);
  if (current !== null) {
    if (current.pointer_digest === pointer.pointer_digest) {
      if (current.intent_digest !== intent.intent_digest || current.coherent_manifest_digest !== intent.coherent_manifest_digest) {
        fail("WATCHER_JOURNAL_VALUE_INVALID");
      }
      return current;
    }
    if (current.pointer_digest !== intent.prior_pointer_digest) fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  const outcomeBase = {
    contract_version: "gkos-watcher-activation-outcome/1.0.0-draft.1",
    intent_digest: intent.intent_digest,
    coherent_manifest_digest: intent.coherent_manifest_digest,
    outcome: "published",
    pointer_digest: pointer.pointer_digest,
    reason_codes: [],
    recorded_at: intent.prepared_at,
  };
  const outcome = sealWatcherRecoveryRecord({ ...outcomeBase, outcome_digest: watcherDigest(outcomeBase) });
  const activeBase = {
    contract_version: "gkos-watcher-active-coherent/1.0.0-draft.1",
    service_generation_id: pointer.service_generation_id,
    coherent_manifest_digest: intent.coherent_manifest_digest,
    pointer_digest: pointer.pointer_digest,
    intent_digest: intent.intent_digest,
    activated_at: intent.prepared_at,
  };
  const active = sealWatcherRecoveryRecord({ ...activeBase, active_digest: watcherDigest(activeBase) });
  const planRow = handle.database.prepare("SELECT source_removal_event_set_digest FROM normalized_plans WHERE batch_id=?;")
    .get(String(complete.batch_id)) as { source_removal_event_set_digest?: string | null } | undefined;
  if (planRow === undefined) fail("WATCHER_JOURNAL_VALUE_INVALID");
  let removalActivation: Readonly<JsonRecord> | null = null;
  if (planRow.source_removal_event_set_digest !== null) {
    const eventSet = readJournalBody(handle, "SELECT body FROM source_removal_event_sets WHERE event_set_digest=?;", String(planRow.source_removal_event_set_digest));
    if (eventSet === null) fail("WATCHER_JOURNAL_VALUE_INVALID");
    const activationBase = {
      contract_version: "gkos-watcher-source-removal-event-set-activation/1.0.0-draft.1",
      event_set_digest: eventSet.event_set_digest,
      coherent_manifest_digest: intent.coherent_manifest_digest,
      activated_at: intent.prepared_at,
    };
    removalActivation = sealWatcherRecoveryRecord({ ...activationBase, activation_digest: watcherDigest(activationBase) });
  }
  finalizeWatcherJournalActivation(handle, { complete_transition: complete, outcome, active, source_removal_activation: removalActivation });
  return active;
}

function watcherLeafSize(path: string): number {
  try { return lstatSync(path).size; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

function hostLockRecord(input: {
  readonly operation: "service" | "journal_reset";
  readonly service_instance_id: string | null;
  readonly prior_pointer_digest: string | null;
  readonly prior_coherent_manifest_digest: string | null;
  readonly prior_journal_pointer_digest: string | null;
}): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-host-lock/1.0.0-draft.1",
    lock_id: watcherUuid7(),
    process_id: process.pid,
    operation: input.operation,
    service_instance_id: input.service_instance_id,
    prior_pointer_digest: input.prior_pointer_digest,
    prior_coherent_manifest_digest: input.prior_coherent_manifest_digest,
    prior_journal_pointer_digest: input.prior_journal_pointer_digest,
    owner_nonce: randomBytes(16).toString("hex"),
    created_at: watcherTimestamp(),
  };
  return sealHostLock({ ...base, lock_digest: watcherDigest(base) });
}

export function sealHostLock(value: JsonRecord): Readonly<JsonRecord> {
  const lock = sealPrivateRecord(value, "gkos-watcher-host-lock/1.0.0-draft.1", [
    "contract_version", "lock_id", "process_id", "operation", "service_instance_id", "prior_pointer_digest",
    "prior_coherent_manifest_digest", "prior_journal_pointer_digest", "owner_nonce", "created_at", "lock_digest",
  ], "lock_digest");
  if ((lock.operation !== "service" && lock.operation !== "journal_reset") ||
      (lock.operation === "service") !== (typeof lock.service_instance_id === "string") ||
      (lock.operation === "journal_reset" && lock.prior_journal_pointer_digest === null) ||
      (lock.prior_pointer_digest === null) !== (lock.prior_coherent_manifest_digest === null) ||
      typeof lock.process_id !== "number" || !Number.isSafeInteger(lock.process_id) || lock.process_id <= 0 ||
      typeof lock.owner_nonce !== "string" || !/^[0-9a-f]{32}$/u.test(lock.owner_nonce)) fail("GKX_WATCHER_HOST_LOCK_INVALID");
  return lock;
}

function processIsAlive(processId: number): boolean {
  if (!Number.isSafeInteger(processId) || processId <= 0) return false;
  try { process.kill(processId, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

function readHostLock(directory: WatcherDirectoryCapability): {
  readonly lock: Readonly<JsonRecord>;
  readonly raw_sha256: string;
} | null {
  if (!watcherLeafExists(directory, WATCHER_HOST_LOCK_FILE)) return null;
  const file = readWatcherFile(directory, WATCHER_HOST_LOCK_FILE);
  return Object.freeze({ lock: sealHostLock(parseCanonicalWatcherJson(file)), raw_sha256: file.raw_sha256 });
}

function registerHostLock(
  directory: WatcherDirectoryCapability,
  lock: Readonly<JsonRecord>,
  rawSha256: string,
): WatcherHostLockCapability {
  const capability = Object.freeze({ directory: directory.path, lock_digest: String(lock.lock_digest) });
  HOST_LOCKS.set(capability, { directory, lock, raw_sha256: rawSha256 });
  return capability;
}

function sealHostLockRecoveryClaim(value: JsonRecord): Readonly<JsonRecord> {
  const claim = sealPrivateRecord(value, "gkos-watcher-host-lock-recovery/1.0.0-draft.1", [
    "contract_version", "claim_id", "observed_lock_digest", "observed_process_id", "claimant_process_id", "owner_nonce",
    "created_at", "claim_digest",
  ], "claim_digest");
  if (typeof claim.claim_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(claim.claim_id)
      || typeof claim.observed_lock_digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(claim.observed_lock_digest)
      || !Number.isSafeInteger(claim.observed_process_id) || Number(claim.observed_process_id) <= 0
      || !Number.isSafeInteger(claim.claimant_process_id) || Number(claim.claimant_process_id) <= 0
      || typeof claim.owner_nonce !== "string" || !/^[0-9a-f]{32}$/u.test(claim.owner_nonce)
      || typeof claim.created_at !== "string" || Number.isNaN(Date.parse(claim.created_at))) {
    fail("GKX_WATCHER_HOST_LOCK_RECOVERY_CLAIM_INVALID");
  }
  return claim;
}

function recoveryClaimRecord(lock: Readonly<JsonRecord>): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-host-lock-recovery/1.0.0-draft.1",
    claim_id: watcherUuid7(),
    observed_lock_digest: lock.lock_digest,
    observed_process_id: lock.process_id,
    claimant_process_id: process.pid,
    owner_nonce: randomBytes(16).toString("hex"),
    created_at: watcherTimestamp(),
  };
  return sealHostLockRecoveryClaim({ ...base, claim_digest: watcherDigest(base) });
}

function readRecoveryClaim(directory: WatcherDirectoryCapability): {
  readonly claim: Readonly<JsonRecord>;
  readonly raw_sha256: string;
} | null {
  if (!watcherLeafExists(directory, WATCHER_HOST_LOCK_RECOVERY_FILE)) return null;
  const file = readWatcherFile(directory, WATCHER_HOST_LOCK_RECOVERY_FILE);
  return Object.freeze({ claim: sealHostLockRecoveryClaim(parseCanonicalWatcherJson(file)), raw_sha256: file.raw_sha256 });
}

function ensureRecoveryClaim(
  directory: WatcherDirectoryCapability,
  lock: Readonly<JsonRecord>,
): { readonly claim: Readonly<JsonRecord>; readonly raw_sha256: string } {
  let existing = readRecoveryClaim(directory);
  if (existing === null) {
    if (processIsAlive(Number(lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
    revalidateWatcherDirectory(directory);
    if (processIsAlive(Number(lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
    const claim = recoveryClaimRecord(lock);
    const file = writeNewWatcherFile(directory, WATCHER_HOST_LOCK_RECOVERY_FILE, watcherCanonicalBytes(claim));
    existing = Object.freeze({ claim, raw_sha256: file.raw_sha256 });
  }
  if (existing.claim.observed_lock_digest !== lock.lock_digest
      || existing.claim.observed_process_id !== lock.process_id) {
    fail("GKX_WATCHER_HOST_LOCK_RECOVERY_CLAIM_INVALID");
  }
  if (processIsAlive(Number(lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  revalidateWatcherDirectory(directory);
  if (processIsAlive(Number(lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  return existing;
}

export function acquireWatcherHostLock(
  directory: WatcherDirectoryCapability,
  input: Parameters<typeof hostLockRecord>[0],
): WatcherHostLockCapability {
  revalidateWatcherDirectory(directory);
  if (watcherLeafExists(directory, WATCHER_HOST_LOCK_RECOVERY_FILE)) fail("GKX_WATCHER_HOST_LOCK_RECOVERY_ACTIVE");
  const lock = hostLockRecord(input);
  const bytes = watcherCanonicalBytes(lock);
  let file;
  try { file = writeNewWatcherFile(directory, WATCHER_HOST_LOCK_FILE, bytes); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") fail("GKX_WATCHER_HOST_LOCKED");
    throw error;
  }
  return registerHostLock(directory, lock, file.raw_sha256);
}

export function assertWatcherHostLock(capability: WatcherHostLockCapability): Readonly<JsonRecord> {
  const held = HOST_LOCKS.get(capability);
  if (held === undefined) throw new TypeError("GKX_WATCHER_HOST_LOCK_CAPABILITY_INVALID");
  revalidateWatcherDirectory(held.directory);
  const file = readWatcherFile(held.directory, WATCHER_HOST_LOCK_FILE);
  const lock = sealHostLock(parseCanonicalWatcherJson(file));
  if (file.raw_sha256 !== held.raw_sha256 || lock.lock_digest !== held.lock.lock_digest) {
    fail("GKX_WATCHER_HOST_LOCK_CHANGED");
  }
  return held.lock;
}

export function releaseWatcherHostLock(capability: WatcherHostLockCapability): void {
  const held = HOST_LOCKS.get(capability);
  if (held === undefined) throw new TypeError("GKX_WATCHER_HOST_LOCK_CAPABILITY_INVALID");
  assertWatcherHostLock(capability);
  unlinkWatcherLeaf(held.directory, WATCHER_HOST_LOCK_FILE, { expected_raw_sha256: held.raw_sha256 });
  HOST_LOCKS.delete(capability);
}

function buildJournalRecords(coordinates: WatcherJournalCoordinates, priorPointerDigest: string | null = null): {
  meta: Readonly<JsonRecord>;
  generation: Readonly<JsonRecord>;
  pointer: Readonly<JsonRecord>;
  pointer_artifact: WatcherPointerArtifact;
} {
  const journalId = watcherUuid7();
  const createdAt = watcherTimestamp();
  const metaBase = {
    contract_version: "gkos-watcher-journal-meta/1.0.0-draft.1",
    journal_instance_id: journalId,
    vault_id: coordinates.vault_id,
    configuration_digest: coordinates.configuration_digest,
    policy_digest: coordinates.policy_digest,
    effective_profile_digest: coordinates.effective_profile_digest,
    anchor_coherent_manifest_digest: coordinates.anchor_coherent_manifest_digest,
    created_at: createdAt,
  };
  const meta = sealWatcherRecoveryRecord({ ...metaBase, meta_digest: watcherDigest(metaBase) });
  const generationBase = {
    contract_version: "gkos-watcher-journal-generation/1.0.0-draft.1",
    journal_instance_id: journalId,
    directory_leaf: `journal-${journalId}`,
    database_file: WATCHER_JOURNAL_DATABASE_FILE,
    meta_digest: meta.meta_digest,
    anchor_coherent_manifest_digest: coordinates.anchor_coherent_manifest_digest,
    created_at: createdAt,
  };
  const generation = sealWatcherRecoveryRecord({ ...generationBase, journal_generation_digest: watcherDigest(generationBase) });
  const generationFile = `watcher-journal-generation-${String(generation.journal_generation_digest).slice(7)}.json`;
  const pointerBase = {
    contract_version: "gkos-watcher-journal-active-pointer/1.0.0-draft.1",
    kind: "watcher_journal",
    journal_generation_file: generationFile,
    journal_generation_digest: generation.journal_generation_digest,
    prior_pointer_digest: priorPointerDigest,
  };
  const pointer = sealWatcherRecoveryRecord({ ...pointerBase, pointer_digest: watcherDigest(pointerBase) });
  return { meta, generation, pointer, pointer_artifact: watcherPointerArtifact("journal", pointer) };
}

function plannedTargetRecord(
  lock: Readonly<JsonRecord>,
  meta: Readonly<JsonRecord>,
  generation: Readonly<JsonRecord>,
  pointer: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-journal-bootstrap-planned-target/1.0.0-draft.1",
    watcher_host_lock_digest: lock.lock_digest,
    journal_meta: meta,
    journal_generation: generation,
    target_journal_pointer: pointer,
  };
  return sealWatcherRecoveryRecord({ ...base, planned_target_digest: watcherDigest(base) });
}

function ensureContentAddressedArtifact(
  root: WatcherDirectoryCapability,
  stage: string,
  final: string,
  bytes: Buffer,
  invalidCode: string,
  onStage?: () => void,
  maximumBytes = 1_048_576,
  onStageWriteBoundary?: (
    boundary: "created" | "partial_write" | "written" | "file_fsynced" | "parent_fsynced",
    transitionDirectory: WatcherDirectoryCapability,
  ) => void,
): ReturnType<typeof readWatcherFile> {
  const expectedRaw = watcherRawDigest(bytes);
  let stageExists = watcherLeafExists(root, stage);
  let finalExists = watcherLeafExists(root, final);
  if (!stageExists && !finalExists) {
    writeNewWatcherFile(root, stage, bytes, maximumBytes, { on_boundary: onStageWriteBoundary });
    stageExists = true;
    onStage?.();
  }
  if (stageExists && !finalExists) {
    let staged;
    try { staged = readWatcherFile(root, stage, { maximum_bytes: maximumBytes }); }
    catch {
      discardIncompleteWatcherLeaf(root, stage);
      writeNewWatcherFile(root, stage, bytes, maximumBytes, { on_boundary: onStageWriteBoundary });
      staged = readWatcherFile(root, stage, { maximum_bytes: maximumBytes });
      onStage?.();
    }
    if (!staged.bytes.equals(bytes)) {
      try { parseCanonicalWatcherJson(staged); } catch {
        discardIncompleteWatcherLeaf(root, stage);
        writeNewWatcherFile(root, stage, bytes, maximumBytes, { on_boundary: onStageWriteBoundary });
        staged = readWatcherFile(root, stage, { maximum_bytes: maximumBytes });
        onStage?.();
      }
      if (!staged.bytes.equals(bytes)) fail(invalidCode);
    }
    try { hardlinkWatcherLeafNoReplace(root, stage, final); }
    catch (error) {
      if (!watcherLeafExists(root, final)) throw error;
    }
    finalExists = true;
  }
  if (watcherLeafExists(root, stage) && finalExists) {
    try {
      const staged = readWatcherFile(root, stage, { allowed_links: 2, maximum_bytes: maximumBytes });
      const committed = readWatcherFile(root, final, { allowed_links: 2, maximum_bytes: maximumBytes });
      if (staged.identity.device !== committed.identity.device || staged.identity.inode !== committed.identity.inode
          || staged.raw_sha256 !== expectedRaw || committed.raw_sha256 !== expectedRaw
          || !staged.bytes.equals(bytes) || !committed.bytes.equals(bytes)) fail(invalidCode);
      unlinkWatcherLeaf(root, stage, { allowed_links: 2, expected_raw_sha256: expectedRaw, maximum_bytes: maximumBytes });
    } catch (error) {
      const committed = readWatcherFile(root, final, { maximum_bytes: maximumBytes });
      if (committed.raw_sha256 !== expectedRaw || !committed.bytes.equals(bytes)) throw error;
      let stageIsComplete = false;
      try {
        const staged = readWatcherFile(root, stage, { maximum_bytes: maximumBytes });
        parseCanonicalWatcherJson(staged);
        stageIsComplete = true;
      } catch { /* securely discard only an incomplete single-link stage */ }
      if (stageIsComplete) fail(invalidCode);
      discardIncompleteWatcherLeaf(root, stage);
    }
  }
  const committed = readWatcherFile(root, final, { maximum_bytes: maximumBytes });
  if (committed.raw_sha256 !== expectedRaw || !committed.bytes.equals(bytes)) fail(invalidCode);
  return committed;
}

function persistPlannedTarget(
  root: WatcherDirectoryCapability,
  target: Readonly<JsonRecord>,
  boundary?: (value: WatcherJournalBootstrapBoundary) => void,
): JsonRecord {
  const digest = String(target.planned_target_digest).slice(7);
  const final = `watcher-journal-bootstrap-planned-target-${digest}.json`;
  const stage = `.watcher-journal-bootstrap-planned-target-${digest}.json.gkos-watcher.stage`;
  const bytes = watcherCanonicalBytes(target);
  const reopened = ensureContentAddressedArtifact(
    root, stage, final, bytes, "GKX_WATCHER_BOOTSTRAP_PLANNED_TARGET_INVALID",
    () => boundary?.("planned_target_stage"),
  );
  const sealed = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(reopened));
  if (sealed.planned_target_digest !== target.planned_target_digest || !reopened.bytes.equals(bytes)) {
    fail("GKX_WATCHER_BOOTSTRAP_PLANNED_TARGET_INVALID");
  }
  boundary?.("planned_target");
  return {
    planned_target_file: final,
    planned_target_digest: target.planned_target_digest,
    planned_target_raw_sha256: reopened.raw_sha256,
    planned_target_byte_size: reopened.bytes.byteLength,
    watcher_host_lock_digest: target.watcher_host_lock_digest,
  };
}

function witnessRecord(
  lock: Readonly<JsonRecord>,
  plannedTargetRef: JsonRecord,
  meta: Readonly<JsonRecord>,
  generation: Readonly<JsonRecord>,
  pointer: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-journal-bootstrap-host-lock-witness/1.0.0-draft.2",
    watcher_host_lock: lock,
    watcher_host_lock_digest: lock.lock_digest,
    planned_target: plannedTargetRef,
    journal_instance_id: meta.journal_instance_id,
    journal_meta_digest: meta.meta_digest,
    journal_generation_digest: generation.journal_generation_digest,
    target_journal_pointer_digest: pointer.pointer_digest,
  };
  return sealWatcherRecoveryRecord({ ...base, witness_digest: watcherDigest(base) });
}

function persistWitness(root: WatcherDirectoryCapability, witness: Readonly<JsonRecord>, boundary?: (value: WatcherJournalBootstrapBoundary) => void): JsonRecord {
  const digest = String(witness.witness_digest).slice(7);
  const final = `watcher-journal-bootstrap-host-lock-${digest}.json`;
  const stage = `.watcher-journal-bootstrap-host-lock-${digest}.json.gkos-watcher.stage`;
  const bytes = watcherCanonicalBytes(witness);
  const reopened = ensureContentAddressedArtifact(
    root, stage, final, bytes, "GKX_WATCHER_BOOTSTRAP_WITNESS_INVALID", () => boundary?.("witness_stage"),
  );
  if (!reopened.bytes.equals(bytes)) fail("GKX_WATCHER_BOOTSTRAP_WITNESS_INVALID");
  boundary?.("witness");
  return {
    witness_file: final,
    witness_digest: witness.witness_digest,
    witness_raw_sha256: reopened.raw_sha256,
    witness_byte_size: reopened.bytes.byteLength,
    watcher_host_lock_digest: witness.watcher_host_lock_digest,
  };
}

function sealBootstrapTargetSelector(value: JsonRecord): Readonly<JsonRecord> {
  const selector = sealPrivateRecord(value, "gkos-watcher-journal-bootstrap-target-selector/1.0.0-draft.1", [
    "contract_version", "operation", "observed_host_lock_digest", "root_recovery_claim_digest", "selector_process_id",
    "owner_nonce", "journal_meta", "journal_generation", "target_journal_pointer", "selector_digest",
  ], "selector_digest");
  const meta = sealWatcherRecoveryRecord(selector.journal_meta);
  const generation = sealWatcherRecoveryRecord(selector.journal_generation);
  const pointer = sealWatcherRecoveryRecord(selector.target_journal_pointer);
  if (selector.operation !== "watcher_journal_bootstrap_target_select"
      || typeof selector.observed_host_lock_digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(selector.observed_host_lock_digest)
      || typeof selector.root_recovery_claim_digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(selector.root_recovery_claim_digest)
      || !Number.isSafeInteger(selector.selector_process_id) || Number(selector.selector_process_id) <= 0
      || typeof selector.owner_nonce !== "string" || !/^[0-9a-f]{32}$/u.test(selector.owner_nonce)
      || meta.anchor_coherent_manifest_digest !== null || generation.anchor_coherent_manifest_digest !== null
      || generation.journal_instance_id !== meta.journal_instance_id || generation.meta_digest !== meta.meta_digest
      || generation.directory_leaf !== `journal-${String(meta.journal_instance_id)}`
      || generation.database_file !== WATCHER_JOURNAL_DATABASE_FILE || generation.created_at !== meta.created_at
      || pointer.kind !== "watcher_journal" || pointer.prior_pointer_digest !== null
      || pointer.journal_generation_digest !== generation.journal_generation_digest
      || pointer.journal_generation_file !== `watcher-journal-generation-${String(generation.journal_generation_digest).slice(7)}.json`) {
    fail("GKX_WATCHER_BOOTSTRAP_TARGET_SELECTOR_INVALID");
  }
  return selector;
}

function selectorCandidateLeaf(selectorProcessId: number, ownerNonce: string): string {
  return `.watcher-journal-bootstrap-target-selector.${String(selectorProcessId)}.${ownerNonce}.json.gkos-watcher.candidate`;
}

function selectorRecord(
  lock: Readonly<JsonRecord>,
  claim: Readonly<JsonRecord>,
  records: ReturnType<typeof buildJournalRecords>,
  ownerNonce: string,
): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-journal-bootstrap-target-selector/1.0.0-draft.1",
    operation: "watcher_journal_bootstrap_target_select",
    observed_host_lock_digest: lock.lock_digest,
    root_recovery_claim_digest: claim.claim_digest,
    selector_process_id: process.pid,
    owner_nonce: ownerNonce,
    journal_meta: records.meta,
    journal_generation: records.generation,
    target_journal_pointer: records.pointer,
  };
  return sealBootstrapTargetSelector({ ...base, selector_digest: watcherDigest(base) });
}

function selectorFromPlannedTarget(
  lock: Readonly<JsonRecord>,
  claim: Readonly<JsonRecord>,
  planned: Readonly<JsonRecord>,
  ownerNonce: string,
): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-journal-bootstrap-target-selector/1.0.0-draft.1",
    operation: "watcher_journal_bootstrap_target_select",
    observed_host_lock_digest: lock.lock_digest,
    root_recovery_claim_digest: claim.claim_digest,
    selector_process_id: process.pid,
    owner_nonce: ownerNonce,
    journal_meta: planned.journal_meta,
    journal_generation: planned.journal_generation,
    target_journal_pointer: planned.target_journal_pointer,
  };
  return sealBootstrapTargetSelector({ ...base, selector_digest: watcherDigest(base) });
}

function selectorCandidates(root: WatcherDirectoryCapability): readonly string[] {
  return listWatcherLeaves(root).filter((leaf) => /^\.watcher-journal-bootstrap-target-selector\.(?:0|[1-9][0-9]*)\.[0-9a-f]{32}\.json\.gkos-watcher\.candidate$/u.test(leaf));
}

function readSelectedTarget(
  root: WatcherDirectoryCapability,
  lock: Readonly<JsonRecord>,
  claim: Readonly<JsonRecord>,
): { readonly selector: Readonly<JsonRecord>; readonly ref: JsonRecord } | null {
  if (!watcherLeafExists(root, WATCHER_BOOTSTRAP_TARGET_SELECTOR_FILE)) return null;
  let file;
  try { file = readWatcherFile(root, WATCHER_BOOTSTRAP_TARGET_SELECTOR_FILE); }
  catch { file = readWatcherFile(root, WATCHER_BOOTSTRAP_TARGET_SELECTOR_FILE, { allowed_links: 2 }); }
  const selector = sealBootstrapTargetSelector(parseCanonicalWatcherJson(file));
  if (selector.observed_host_lock_digest !== lock.lock_digest || selector.root_recovery_claim_digest !== claim.claim_digest) {
    fail("GKX_WATCHER_BOOTSTRAP_TARGET_SELECTOR_INVALID");
  }
  return Object.freeze({
    selector,
    ref: {
      selector_file: WATCHER_BOOTSTRAP_TARGET_SELECTOR_FILE,
      selector,
      selector_digest: selector.selector_digest,
      selector_raw_sha256: file.raw_sha256,
      selector_byte_size: file.bytes.byteLength,
      observed_host_lock_digest: selector.observed_host_lock_digest,
      root_recovery_claim_digest: selector.root_recovery_claim_digest,
    },
  });
}

function existingPlannedTarget(root: WatcherDirectoryCapability, lock: Readonly<JsonRecord>): Readonly<JsonRecord> | null {
  const leaves = listWatcherLeaves(root).filter((leaf) => /^(?:watcher-journal-bootstrap-planned-target-[0-9a-f]{64}\.json|\.watcher-journal-bootstrap-planned-target-[0-9a-f]{64}\.json\.gkos-watcher\.stage)$/u.test(leaf));
  if (leaves.length === 0) return null;
  const digests = new Set(leaves.map((leaf) => {
    const match = /planned-target-([0-9a-f]{64})\.json/u.exec(leaf);
    return match?.[1] ?? "";
  }));
  if (digests.size !== 1 || digests.has("")) fail("GKX_WATCHER_BOOTSTRAP_PLANNED_TARGET_INVALID");
  const digest = [...digests][0];
  const final = `watcher-journal-bootstrap-planned-target-${digest}.json`;
  const stage = `.watcher-journal-bootstrap-planned-target-${digest}.json.gkos-watcher.stage`;
  const source = watcherLeafExists(root, final) ? final : stage;
  const file = readWatcherFileWithLinks(root, source);
  const target = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(file));
  if (target.contract_version !== "gkos-watcher-journal-bootstrap-planned-target/1.0.0-draft.1"
      || target.planned_target_digest !== `sha256:${digest}`
      || target.watcher_host_lock_digest !== lock.lock_digest) fail("GKX_WATCHER_BOOTSTRAP_PLANNED_TARGET_INVALID");
  ensureContentAddressedArtifact(
    root, stage, final, watcherCanonicalBytes(target), "GKX_WATCHER_BOOTSTRAP_PLANNED_TARGET_INVALID",
  );
  return target;
}

function ensureSelectedTarget(
  root: WatcherDirectoryCapability,
  lock: Readonly<JsonRecord>,
  claim: Readonly<JsonRecord>,
  coordinates: WatcherJournalCoordinates,
): { readonly selector: Readonly<JsonRecord>; readonly ref: JsonRecord } {
  let selected = readSelectedTarget(root, lock, claim);
  if (selected === null) {
    const candidates = selectorCandidates(root);
    let candidateLeaf: string | null = null;
    let candidateSelector: Readonly<JsonRecord> | null = null;
    for (const leaf of candidates) {
      let file;
      try {
        file = readWatcherFile(root, leaf);
      } catch (error) {
        const match = /^\.watcher-journal-bootstrap-target-selector\.(0|[1-9][0-9]*)\.([0-9a-f]{32})\.json\.gkos-watcher\.candidate$/u.exec(leaf);
        if (match === null || processIsAlive(Number(match[1]))) throw error;
        discardIncompleteWatcherLeaf(root, leaf);
        continue;
      }
      let body: JsonRecord;
      try { body = parseCanonicalWatcherJson(file); }
      catch (error) {
        const match = /^\.watcher-journal-bootstrap-target-selector\.(0|[1-9][0-9]*)\.([0-9a-f]{32})\.json\.gkos-watcher\.candidate$/u.exec(leaf);
        if (match === null || processIsAlive(Number(match[1]))) throw error;
        discardIncompleteWatcherLeaf(root, leaf);
        continue;
      }
      const parsed = sealBootstrapTargetSelector(body);
      {
        const expectedLeaf = selectorCandidateLeaf(Number(parsed.selector_process_id), String(parsed.owner_nonce));
        if (leaf !== expectedLeaf || parsed.observed_host_lock_digest !== lock.lock_digest
            || parsed.root_recovery_claim_digest !== claim.claim_digest) fail("GKX_WATCHER_BOOTSTRAP_TARGET_SELECTOR_INVALID");
        if (candidateSelector === null) { candidateLeaf = leaf; candidateSelector = parsed; }
      }
    }
    if (candidateSelector === null) {
      const ownerNonce = randomBytes(16).toString("hex");
      candidateLeaf = selectorCandidateLeaf(process.pid, ownerNonce);
      const plannedBeforeReservation = existingPlannedTarget(root, lock);
      let created: Readonly<JsonRecord> | null = null;
      writeReservedWatcherFile(root, candidateLeaf, (reservedRoot) => {
        revalidateWatcherDirectory(reservedRoot);
        if (watcherLeafExists(reservedRoot, WATCHER_BOOTSTRAP_TARGET_SELECTOR_FILE)) fail("GKX_WATCHER_BOOTSTRAP_TARGET_SELECTOR_EXISTS");
        const planned = existingPlannedTarget(reservedRoot, lock);
        if (stableJson(planned) !== stableJson(plannedBeforeReservation)) fail("GKX_WATCHER_BOOTSTRAP_PLANNED_TARGET_INVALID");
        created = planned === null
          ? selectorRecord(lock, claim, buildJournalRecords(coordinates), ownerNonce)
          : selectorFromPlannedTarget(lock, claim, planned, ownerNonce);
        return watcherCanonicalBytes(created);
      });
      candidateSelector = created!;
    }
    const candidate = readWatcherFile(root, candidateLeaf!);
    if (stableJson(sealBootstrapTargetSelector(parseCanonicalWatcherJson(candidate))) !== stableJson(candidateSelector)) {
      fail("GKX_WATCHER_BOOTSTRAP_TARGET_SELECTOR_INVALID");
    }
    try { hardlinkWatcherLeafNoReplace(root, candidateLeaf!, WATCHER_BOOTSTRAP_TARGET_SELECTOR_FILE); }
    catch (error) { if (!watcherLeafExists(root, WATCHER_BOOTSTRAP_TARGET_SELECTOR_FILE)) throw error; }
    selected = readSelectedTarget(root, lock, claim);
    if (selected === null) fail("GKX_WATCHER_BOOTSTRAP_TARGET_SELECTOR_INVALID");
  }
  for (const leaf of selectorCandidates(root)) {
    const candidate = readWatcherFile(root, leaf, { allowed_links: leaf === selectorCandidateLeaf(
      Number(selected.selector.selector_process_id), String(selected.selector.owner_nonce),
    ) ? 2 : 1 });
    let parsed: Readonly<JsonRecord>;
    try { parsed = sealBootstrapTargetSelector(parseCanonicalWatcherJson(candidate)); }
    catch {
      if (candidate.identity.nlink !== 1) fail("GKX_WATCHER_BOOTSTRAP_TARGET_SELECTOR_INVALID");
      discardIncompleteWatcherLeaf(root, leaf);
      continue;
    }
    if (parsed.observed_host_lock_digest !== lock.lock_digest || parsed.root_recovery_claim_digest !== claim.claim_digest) {
      fail("GKX_WATCHER_BOOTSTRAP_TARGET_SELECTOR_INVALID");
    }
    unlinkWatcherLeaf(root, leaf, { allowed_links: candidate.identity.nlink === 2 ? 2 : 1, expected_raw_sha256: candidate.raw_sha256 });
  }
  return selected;
}

function recordsFromSelector(selector: Readonly<JsonRecord>): ReturnType<typeof buildJournalRecords> {
  const meta = sealWatcherRecoveryRecord(selector.journal_meta);
  const generation = sealWatcherRecoveryRecord(selector.journal_generation);
  const pointer = sealWatcherRecoveryRecord(selector.target_journal_pointer);
  return Object.freeze({ meta, generation, pointer, pointer_artifact: watcherPointerArtifact("journal", pointer) });
}

function sealBootstrapRecoveryBridge(value: JsonRecord): Readonly<JsonRecord> {
  const bridge = sealPrivateRecord(value, "gkos-watcher-journal-bootstrap-recovery-bridge/1.0.0-draft.2", [
    "contract_version", "kind", "root_recovery_claim_file", "root_recovery_claim", "root_recovery_claim_raw_sha256",
    "root_recovery_claim_byte_size", "target_selector", "host_lock_witness", "journal_instance_id", "journal_meta_digest",
    "journal_generation_digest", "target_journal_pointer_digest", "executor_attempt_limit", "bridge_digest",
  ], "bridge_digest");
  const claim = sealHostLockRecoveryClaim(bridge.root_recovery_claim as JsonRecord);
  const selectorRef = bridge.target_selector as JsonRecord;
  const witnessRef = bridge.host_lock_witness as JsonRecord;
  exactKeys(selectorRef, [
    "selector_file", "selector", "selector_digest", "selector_raw_sha256", "selector_byte_size",
    "observed_host_lock_digest", "root_recovery_claim_digest",
  ], "GKX_WATCHER_BOOTSTRAP_RECOVERY_BRIDGE_INVALID");
  const selector = sealBootstrapTargetSelector(selectorRef.selector as JsonRecord);
  exactKeys(witnessRef, [
    "witness_file", "witness_digest", "witness_raw_sha256", "witness_byte_size", "watcher_host_lock_digest",
  ], "GKX_WATCHER_BOOTSTRAP_RECOVERY_BRIDGE_INVALID");
  if (bridge.kind !== "journal_bootstrap_recovery" || bridge.root_recovery_claim_file !== WATCHER_HOST_LOCK_RECOVERY_FILE
      || typeof bridge.root_recovery_claim_raw_sha256 !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(bridge.root_recovery_claim_raw_sha256)
      || !Number.isSafeInteger(bridge.root_recovery_claim_byte_size) || Number(bridge.root_recovery_claim_byte_size) < 1
      || Number(bridge.root_recovery_claim_byte_size) > 1_048_576 || selectorRef.selector_file !== WATCHER_BOOTSTRAP_TARGET_SELECTOR_FILE
      || selectorRef.selector_digest !== selector.selector_digest || selectorRef.observed_host_lock_digest !== selector.observed_host_lock_digest
      || selectorRef.root_recovery_claim_digest !== claim.claim_digest || selector.root_recovery_claim_digest !== claim.claim_digest
      || witnessRef.watcher_host_lock_digest !== selector.observed_host_lock_digest
      || bridge.journal_instance_id !== (selector.journal_meta as JsonRecord).journal_instance_id
      || bridge.journal_meta_digest !== (selector.journal_meta as JsonRecord).meta_digest
      || bridge.journal_generation_digest !== (selector.journal_generation as JsonRecord).journal_generation_digest
      || bridge.target_journal_pointer_digest !== (selector.target_journal_pointer as JsonRecord).pointer_digest
      || bridge.executor_attempt_limit !== 4096) {
    fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_BRIDGE_INVALID");
  }
  return bridge;
}

function bootstrapRecoveryBridgeRecord(
  claimFile: ReturnType<typeof readRecoveryClaim> & object,
  selectorRef: JsonRecord,
  witnessRef: JsonRecord,
  records: ReturnType<typeof buildJournalRecords>,
): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-journal-bootstrap-recovery-bridge/1.0.0-draft.2",
    kind: "journal_bootstrap_recovery",
    root_recovery_claim_file: WATCHER_HOST_LOCK_RECOVERY_FILE,
    root_recovery_claim: claimFile.claim,
    root_recovery_claim_raw_sha256: claimFile.raw_sha256,
    root_recovery_claim_byte_size: watcherCanonicalBytes(claimFile.claim).byteLength,
    target_selector: selectorRef,
    host_lock_witness: witnessRef,
    journal_instance_id: records.meta.journal_instance_id,
    journal_meta_digest: records.meta.meta_digest,
    journal_generation_digest: records.generation.journal_generation_digest,
    target_journal_pointer_digest: records.pointer.pointer_digest,
    executor_attempt_limit: 4096,
  };
  return sealBootstrapRecoveryBridge({ ...base, bridge_digest: watcherDigest(base) });
}

function persistBootstrapRecoveryBridge(
  watcherRoot: WatcherDirectoryCapability,
  bridge: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const bytes = watcherCanonicalBytes(bridge);
  const file = ensureContentAddressedArtifact(
    watcherRoot,
    WATCHER_BOOTSTRAP_RECOVERY_BRIDGE_STAGE_FILE,
    WATCHER_BOOTSTRAP_RECOVERY_BRIDGE_FILE,
    bytes,
    "GKX_WATCHER_BOOTSTRAP_RECOVERY_BRIDGE_INVALID",
  );
  return sealBootstrapRecoveryBridge(parseCanonicalWatcherJson(file));
}

function readBootstrapRecoveryBridge(watcherRoot: WatcherDirectoryCapability): Readonly<JsonRecord> | null {
  if (!watcherLeafExists(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_BRIDGE_FILE)) return null;
  const file = readWatcherFile(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_BRIDGE_FILE);
  return sealBootstrapRecoveryBridge(parseCanonicalWatcherJson(file));
}

function sealBootstrapRecoveryExecutor(value: JsonRecord): Readonly<JsonRecord> {
  const executor = sealPrivateRecord(value, "gkos-watcher-journal-bootstrap-recovery-executor/1.0.0-draft.1", [
    "contract_version", "executor_id", "bridge_digest", "executor_ordinal", "prior_executor_digest", "process_id",
    "service_instance_id", "owner_nonce", "created_at", "executor_digest",
  ], "executor_digest");
  const uuid7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
  if (typeof executor.executor_id !== "string" || !uuid7.test(executor.executor_id)
      || typeof executor.bridge_digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(executor.bridge_digest)
      || !Number.isSafeInteger(executor.executor_ordinal) || Number(executor.executor_ordinal) < 0 || Number(executor.executor_ordinal) > 4095
      || (Number(executor.executor_ordinal) === 0) !== (executor.prior_executor_digest === null)
      || executor.prior_executor_digest !== null && (typeof executor.prior_executor_digest !== "string"
        || !/^sha256:[0-9a-f]{64}$/u.test(executor.prior_executor_digest))
      || !Number.isSafeInteger(executor.process_id) || Number(executor.process_id) <= 0
      || typeof executor.service_instance_id !== "string" || !uuid7.test(executor.service_instance_id)
      || typeof executor.owner_nonce !== "string" || !/^[0-9a-f]{32}$/u.test(executor.owner_nonce)
      || typeof executor.created_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(executor.created_at)
      || Number.isNaN(Date.parse(executor.created_at)) || new Date(Date.parse(executor.created_at)).toISOString() !== executor.created_at) {
    fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
  }
  return executor;
}

function readWatcherFileWithLinks(
  root: WatcherDirectoryCapability,
  leaf: string,
  maximumBytes = 1_048_576,
): ReturnType<typeof readWatcherFile> {
  for (const allowed_links of [1, 2, 3] as const) {
    try { return readWatcherFile(root, leaf, { allowed_links, maximum_bytes: maximumBytes }); }
    catch { /* try the next exact governed link count */ }
  }
  return fail("GKX_WATCHER_FS_FILE_IDENTITY_INVALID");
}

function executorArtifactFile(digest: string): string {
  return `watcher-journal-bootstrap-recovery-executor-${digest.slice("sha256:".length)}.json`;
}

function readExecutorChain(
  watcherRoot: WatcherDirectoryCapability,
  bridge: Readonly<JsonRecord>,
): readonly { readonly record: Readonly<JsonRecord>; readonly file: ReturnType<typeof readWatcherFile> }[] {
  const rows = listWatcherLeaves(watcherRoot)
    .filter((leaf) => /^watcher-journal-bootstrap-recovery-executor-[0-9a-f]{64}\.json$/u.test(leaf))
    .map((leaf) => {
      const file = readWatcherFileWithLinks(watcherRoot, leaf);
      const record = sealBootstrapRecoveryExecutor(parseCanonicalWatcherJson(file));
      if (leaf !== executorArtifactFile(String(record.executor_digest)) || record.bridge_digest !== bridge.bridge_digest) {
        fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
      }
      return { record, file };
    })
    .sort((left, right) => Number(left.record.executor_ordinal) - Number(right.record.executor_ordinal));
  if (rows.length > Number(bridge.executor_attempt_limit)) fail("WATCHER_JOURNAL_RECOVERY_REQUIRED");
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].record.executor_ordinal !== index
        || rows[index].record.prior_executor_digest !== (index === 0 ? null : rows[index - 1].record.executor_digest)) {
      fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
    }
  }
  return Object.freeze(rows);
}

function executorRecord(
  bridge: Readonly<JsonRecord>,
  prior: Readonly<JsonRecord> | null,
  serviceInstanceId: string,
): Readonly<JsonRecord> {
  const ordinal = prior === null ? 0 : Number(prior.executor_ordinal) + 1;
  if (ordinal >= Number(bridge.executor_attempt_limit)) fail("WATCHER_JOURNAL_RECOVERY_REQUIRED");
  const base = {
    contract_version: "gkos-watcher-journal-bootstrap-recovery-executor/1.0.0-draft.1",
    executor_id: watcherUuid7(), bridge_digest: bridge.bridge_digest, executor_ordinal: ordinal,
    prior_executor_digest: prior?.executor_digest ?? null, process_id: process.pid, service_instance_id: serviceInstanceId,
    owner_nonce: randomBytes(16).toString("hex"), created_at: watcherTimestamp(),
  };
  return sealBootstrapRecoveryExecutor({ ...base, executor_digest: watcherDigest(base) });
}

function readSelectedExecutor(
  watcherRoot: WatcherDirectoryCapability,
  bridge: Readonly<JsonRecord>,
): { readonly record: Readonly<JsonRecord>; readonly file: ReturnType<typeof readWatcherFile> } | null {
  if (!watcherLeafExists(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_FILE)) return null;
  const file = readWatcherFileWithLinks(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_FILE);
  const record = sealBootstrapRecoveryExecutor(parseCanonicalWatcherJson(file));
  if (record.bridge_digest !== bridge.bridge_digest) fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
  const artifact = readWatcherFileWithLinks(watcherRoot, executorArtifactFile(String(record.executor_digest)));
  if (artifact.identity.device !== file.identity.device || artifact.identity.inode !== file.identity.inode
      || !artifact.bytes.equals(file.bytes)) fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
  return Object.freeze({ record, file });
}

function finishExecutorStage(
  watcherRoot: WatcherDirectoryCapability,
  bridge: Readonly<JsonRecord>,
): void {
  if (!watcherLeafExists(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_STAGE_FILE)) return;
  let stage;
  try { stage = readWatcherFileWithLinks(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_STAGE_FILE); }
  catch {
    if (watcherLeafExists(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_FILE)
        || readExecutorChain(watcherRoot, bridge).length === 0) {
      discardIncompleteWatcherLeaf(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_STAGE_FILE);
      return;
    }
    return fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
  }
  const next = sealBootstrapRecoveryExecutor(parseCanonicalWatcherJson(stage));
  if (next.bridge_digest !== bridge.bridge_digest) fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
  const chain = readExecutorChain(watcherRoot, bridge);
  const prior = Number(next.executor_ordinal) === 0 ? null : chain.find((row) => row.record.executor_digest === next.prior_executor_digest) ?? null;
  if ((Number(next.executor_ordinal) === 0) !== (prior === null)
      || Number(next.executor_ordinal) !== (prior === null ? 0 : Number(prior.record.executor_ordinal) + 1)) {
    fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
  }
  const immutableLeaf = executorArtifactFile(String(next.executor_digest));
  if (!watcherLeafExists(watcherRoot, immutableLeaf)) {
    if (stage.identity.nlink !== 1) fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
    hardlinkWatcherLeafNoReplace(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_STAGE_FILE, immutableLeaf);
  }
  const current = readSelectedExecutor(watcherRoot, bridge);
  if (current !== null && current.record.executor_digest !== next.executor_digest) {
    if (next.prior_executor_digest !== current.record.executor_digest || processIsAlive(Number(current.record.process_id))) {
      fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
    }
    revalidateWatcherDirectory(watcherRoot);
    if (processIsAlive(Number(current.record.process_id))) fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
    unlinkWatcherLeaf(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_FILE, {
      allowed_links: 2, expected_raw_sha256: current.file.raw_sha256,
    });
  }
  if (!watcherLeafExists(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_FILE)) {
    hardlinkWatcherLeafNoReplace(watcherRoot, immutableLeaf, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_FILE, { resulting_links: 3 });
  }
  const staged = readWatcherFile(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_STAGE_FILE, { allowed_links: 3 });
  unlinkWatcherLeaf(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_STAGE_FILE, {
    allowed_links: 3, expected_raw_sha256: staged.raw_sha256,
  });
}

function selectBootstrapRecoveryExecutor(
  watcherRoot: WatcherDirectoryCapability,
  bridge: Readonly<JsonRecord>,
  serviceInstanceId: string,
): Readonly<JsonRecord> {
  finishExecutorStage(watcherRoot, bridge);
  let current = readSelectedExecutor(watcherRoot, bridge);
  if (current !== null && current.record.process_id === process.pid
      && current.record.service_instance_id === serviceInstanceId) return current.record;
  if (current !== null && processIsAlive(Number(current.record.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  if (current !== null) {
    revalidateWatcherDirectory(watcherRoot);
    if (processIsAlive(Number(current.record.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  }
  const chain = readExecutorChain(watcherRoot, bridge);
  const prior = chain.length === 0 ? null : chain[chain.length - 1].record;
  const next = executorRecord(bridge, prior, serviceInstanceId);
  writeNewWatcherFile(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_STAGE_FILE, watcherCanonicalBytes(next));
  finishExecutorStage(watcherRoot, bridge);
  current = readSelectedExecutor(watcherRoot, bridge);
  if (current === null || current.record.executor_digest !== next.executor_digest) {
    fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
  }
  return current.record;
}

function openBootstrapWitnessAuthority(
  journalRoot: WatcherDirectoryCapability,
  witnessRef: JsonRecord,
): {
  readonly witness: Readonly<JsonRecord>;
  readonly lock: Readonly<JsonRecord>;
  readonly planned_target: Readonly<JsonRecord>;
  readonly records: ReturnType<typeof buildJournalRecords>;
} {
  exactKeys(witnessRef, [
    "witness_file", "witness_digest", "witness_raw_sha256", "witness_byte_size", "watcher_host_lock_digest",
  ], "GKX_WATCHER_BOOTSTRAP_WITNESS_INVALID");
  const witnessFile = readWatcherFile(journalRoot, String(witnessRef.witness_file));
  const witness = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(witnessFile));
  if (witness.contract_version !== "gkos-watcher-journal-bootstrap-host-lock-witness/1.0.0-draft.2"
      || witness.witness_digest !== witnessRef.witness_digest || witnessFile.raw_sha256 !== witnessRef.witness_raw_sha256
      || witnessFile.bytes.byteLength !== witnessRef.witness_byte_size
      || witness.watcher_host_lock_digest !== witnessRef.watcher_host_lock_digest) {
    fail("GKX_WATCHER_BOOTSTRAP_WITNESS_INVALID");
  }
  const lock = sealHostLock(witness.watcher_host_lock as JsonRecord);
  const plannedRef = witness.planned_target as JsonRecord;
  exactKeys(plannedRef, [
    "planned_target_file", "planned_target_digest", "planned_target_raw_sha256", "planned_target_byte_size",
    "watcher_host_lock_digest",
  ], "GKX_WATCHER_BOOTSTRAP_PLANNED_TARGET_INVALID");
  const plannedFile = readWatcherFile(journalRoot, String(plannedRef.planned_target_file));
  const planned = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(plannedFile));
  if (planned.contract_version !== "gkos-watcher-journal-bootstrap-planned-target/1.0.0-draft.1"
      || planned.planned_target_digest !== plannedRef.planned_target_digest
      || plannedFile.raw_sha256 !== plannedRef.planned_target_raw_sha256
      || plannedFile.bytes.byteLength !== plannedRef.planned_target_byte_size
      || planned.watcher_host_lock_digest !== lock.lock_digest || plannedRef.watcher_host_lock_digest !== lock.lock_digest) {
    fail("GKX_WATCHER_BOOTSTRAP_PLANNED_TARGET_INVALID");
  }
  const records = Object.freeze({
    meta: sealWatcherRecoveryRecord(planned.journal_meta),
    generation: sealWatcherRecoveryRecord(planned.journal_generation),
    pointer: sealWatcherRecoveryRecord(planned.target_journal_pointer),
    pointer_artifact: watcherPointerArtifact("journal", planned.target_journal_pointer),
  });
  if (witness.journal_instance_id !== records.meta.journal_instance_id || witness.journal_meta_digest !== records.meta.meta_digest
      || witness.journal_generation_digest !== records.generation.journal_generation_digest
      || witness.target_journal_pointer_digest !== records.pointer.pointer_digest) fail("GKX_WATCHER_BOOTSTRAP_WITNESS_INVALID");
  return Object.freeze({ witness, lock, planned_target: planned, records });
}

function cleanupLateSelectorCandidates(
  journalRoot: WatcherDirectoryCapability,
  bridge: Readonly<JsonRecord>,
  lock: Readonly<JsonRecord>,
  claim: Readonly<JsonRecord>,
): void {
  const selected = readSelectedTarget(journalRoot, lock, claim);
  if (selected === null || selected.ref.selector_digest !== (bridge.target_selector as JsonRecord).selector_digest) {
    fail("GKX_WATCHER_BOOTSTRAP_TARGET_SELECTOR_INVALID");
  }
  let emptyPasses = 0;
  while (emptyPasses < 2) {
    const candidates = selectorCandidates(journalRoot);
    if (candidates.length > 4096) fail("WATCHER_JOURNAL_RECOVERY_REQUIRED");
    if (candidates.length === 0) {
      revalidateWatcherDirectory(journalRoot);
      emptyPasses += 1;
      continue;
    }
    emptyPasses = 0;
    for (const leaf of candidates) {
      let file;
      try { file = readWatcherFile(journalRoot, leaf); }
      catch {
        discardIncompleteWatcherLeaf(journalRoot, leaf);
        continue;
      }
      try {
        const candidate = sealBootstrapTargetSelector(parseCanonicalWatcherJson(file));
        if (leaf !== selectorCandidateLeaf(Number(candidate.selector_process_id), String(candidate.owner_nonce))
            || candidate.observed_host_lock_digest !== lock.lock_digest
            || candidate.root_recovery_claim_digest !== claim.claim_digest) {
          fail("GKX_WATCHER_BOOTSTRAP_TARGET_SELECTOR_INVALID");
        }
        unlinkWatcherLeaf(journalRoot, leaf, { expected_raw_sha256: file.raw_sha256 });
      } catch (error) {
        try { parseCanonicalWatcherJson(file); } catch {
          discardIncompleteWatcherLeaf(journalRoot, leaf);
          continue;
        }
        throw error;
      }
    }
  }
}

function bootstrapGuard(root: WatcherDirectoryCapability, witnessRef: JsonRecord, meta: Readonly<JsonRecord>, generation: Readonly<JsonRecord>, pointer: Readonly<JsonRecord>): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-journal-bootstrap-guard/1.0.0-draft.2",
    operation: "watcher_journal_bootstrap",
    owner_nonce: randomBytes(16).toString("hex"),
    parent_device: root.identity.device,
    parent_inode: root.identity.inode,
    parent_mode: root.identity.mode,
    guard_basename: WATCHER_BOOTSTRAP_GUARD_FILE,
    guard_stage_basename: WATCHER_BOOTSTRAP_GUARD_STAGE_FILE,
    host_lock_witness: witnessRef,
    journal_instance_id: meta.journal_instance_id,
    journal_directory_leaf: generation.directory_leaf,
    journal_meta_digest: meta.meta_digest,
    journal_generation_digest: generation.journal_generation_digest,
    target_journal_pointer_digest: pointer.pointer_digest,
  };
  return sealBootstrapGuardRuntime({ ...base, guard_digest: watcherDigest(base) }, root, witnessRef, meta, generation, pointer);
}

function sealBootstrapGuardRuntime(
  value: JsonRecord,
  root: WatcherDirectoryCapability,
  witnessRef: JsonRecord,
  meta: Readonly<JsonRecord>,
  generation: Readonly<JsonRecord>,
  pointer: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const guard = sealPrivateRecord(value, "gkos-watcher-journal-bootstrap-guard/1.0.0-draft.2", [
    "contract_version", "operation", "owner_nonce", "parent_device", "parent_inode", "parent_mode", "guard_basename",
    "guard_stage_basename", "host_lock_witness", "journal_instance_id", "journal_directory_leaf", "journal_meta_digest",
    "journal_generation_digest", "target_journal_pointer_digest", "guard_digest",
  ], "guard_digest");
  if (guard.operation !== "watcher_journal_bootstrap" || typeof guard.owner_nonce !== "string"
      || !/^[0-9a-f]{32}$/u.test(guard.owner_nonce) || guard.parent_device !== root.identity.device
      || guard.parent_inode !== root.identity.inode || guard.parent_mode !== root.identity.mode
      || guard.guard_basename !== WATCHER_BOOTSTRAP_GUARD_FILE || guard.guard_stage_basename !== WATCHER_BOOTSTRAP_GUARD_STAGE_FILE
      || stableJson(guard.host_lock_witness) !== stableJson(witnessRef) || guard.journal_instance_id !== meta.journal_instance_id
      || guard.journal_directory_leaf !== generation.directory_leaf || guard.journal_meta_digest !== meta.meta_digest
      || guard.journal_generation_digest !== generation.journal_generation_digest
      || guard.target_journal_pointer_digest !== pointer.pointer_digest) fail("GKX_WATCHER_BOOTSTRAP_GUARD_INVALID");
  return guard;
}

function bootstrapAuthority(witnessRef: JsonRecord, meta: Readonly<JsonRecord>, generation: Readonly<JsonRecord>, pointer: Readonly<JsonRecord>, committedAt: string): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-journal-bootstrap-authority/1.0.0-draft.2",
    host_lock_witness: witnessRef,
    journal_meta_digest: meta.meta_digest,
    journal_generation_digest: generation.journal_generation_digest,
    journal_generation_file: `watcher-journal-generation-${String(generation.journal_generation_digest).slice(7)}.json`,
    target_journal_pointer_digest: pointer.pointer_digest,
    target_journal_pointer_file: `watcher-journal-pointer-${String(pointer.pointer_digest).slice(7)}.json`,
    committed_at: committedAt,
  };
  return sealBootstrapAuthorityRuntime({ ...base, authority_digest: watcherDigest(base) }, witnessRef, meta, generation, pointer);
}

function sealBootstrapAuthorityRuntime(
  value: JsonRecord,
  witnessRef: JsonRecord,
  meta: Readonly<JsonRecord>,
  generation: Readonly<JsonRecord>,
  pointer: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const authority = sealPrivateRecord(value, "gkos-watcher-journal-bootstrap-authority/1.0.0-draft.2", [
    "contract_version", "host_lock_witness", "journal_meta_digest", "journal_generation_digest", "journal_generation_file",
    "target_journal_pointer_digest", "target_journal_pointer_file", "committed_at", "authority_digest",
  ], "authority_digest");
  if (stableJson(authority.host_lock_witness) !== stableJson(witnessRef) || authority.journal_meta_digest !== meta.meta_digest
      || authority.journal_generation_digest !== generation.journal_generation_digest
      || authority.journal_generation_file !== `watcher-journal-generation-${String(generation.journal_generation_digest).slice(7)}.json`
      || authority.target_journal_pointer_digest !== pointer.pointer_digest
      || authority.target_journal_pointer_file !== `watcher-journal-pointer-${String(pointer.pointer_digest).slice(7)}.json`
      || typeof authority.committed_at !== "string" || Number.isNaN(Date.parse(authority.committed_at))) {
    fail("GKX_WATCHER_BOOTSTRAP_AUTHORITY_INVALID");
  }
  return authority;
}

function openOrCreateBootstrapDatabase(
  child: WatcherDirectoryCapability,
  meta: Readonly<JsonRecord>,
): { readonly database: DatabaseSync; readonly path: string; readonly created: boolean } {
  const path = join(child.path, WATCHER_JOURNAL_DATABASE_FILE);
  if (!watcherLeafSize(path)) return Object.freeze({ database: createWatcherJournalDatabase(child, meta), path, created: true });
  secureDatabaseMode(path);
  const database = openLiveWatcherJournalDatabase(child, path);
  try {
    validateWatcherJournalAuthority(database);
    const rows = database.prepare("SELECT journal_instance_id,meta_digest,body FROM watcher_meta;").all() as Array<Record<string, unknown>>;
    if (rows.length !== 1 || rows[0].journal_instance_id !== meta.journal_instance_id || rows[0].meta_digest !== meta.meta_digest
        || !(rows[0].body instanceof Uint8Array) || !Buffer.from(rows[0].body).equals(canonicalBody(meta))) {
      fail("WATCHER_JOURNAL_VALUE_INVALID");
    }
    return Object.freeze({ database, path, created: false });
  } catch (error) {
    closeLiveWatcherJournalDatabase(child, database, false);
    throw error;
  }
}

function persistBootstrapAuthority(
  root: WatcherDirectoryCapability,
  witnessRef: JsonRecord,
  records: ReturnType<typeof buildJournalRecords>,
  boundary?: (value: WatcherJournalBootstrapBoundary) => void,
): Readonly<JsonRecord> {
  let authority: Readonly<JsonRecord>;
  if (watcherLeafExists(root, WATCHER_BOOTSTRAP_AUTHORITY_FILE)) {
    const final = readWatcherFileWithLinks(root, WATCHER_BOOTSTRAP_AUTHORITY_FILE);
    authority = sealBootstrapAuthorityRuntime(
      parseCanonicalWatcherJson(final), witnessRef, records.meta, records.generation, records.pointer,
    );
    if (watcherLeafExists(root, WATCHER_BOOTSTRAP_AUTHORITY_TEMP_FILE)) {
      const temporary = readWatcherFileWithLinks(root, WATCHER_BOOTSTRAP_AUTHORITY_TEMP_FILE);
      const parsed = sealBootstrapAuthorityRuntime(
        parseCanonicalWatcherJson(temporary), witnessRef, records.meta, records.generation, records.pointer,
      );
      if (parsed.authority_digest !== authority.authority_digest || !temporary.bytes.equals(final.bytes)
          || temporary.identity.device !== final.identity.device || temporary.identity.inode !== final.identity.inode
          || temporary.identity.nlink !== 2 || final.identity.nlink !== 2) {
        fail("GKX_WATCHER_BOOTSTRAP_AUTHORITY_INVALID");
      }
      unlinkWatcherLeaf(root, WATCHER_BOOTSTRAP_AUTHORITY_TEMP_FILE, { allowed_links: 2, expected_raw_sha256: temporary.raw_sha256 });
    }
    return authority;
  }
  if (watcherLeafExists(root, WATCHER_BOOTSTRAP_AUTHORITY_TEMP_FILE)) {
    const temporary = readWatcherFile(root, WATCHER_BOOTSTRAP_AUTHORITY_TEMP_FILE);
    authority = sealBootstrapAuthorityRuntime(
      parseCanonicalWatcherJson(temporary), witnessRef, records.meta, records.generation, records.pointer,
    );
  } else {
    authority = bootstrapAuthority(witnessRef, records.meta, records.generation, records.pointer, watcherTimestamp());
    writeNewWatcherFile(root, WATCHER_BOOTSTRAP_AUTHORITY_TEMP_FILE, watcherCanonicalBytes(authority));
  }
  const expectedRaw = watcherRawDigest(watcherCanonicalBytes(authority));
  const temporary = readWatcherFile(root, WATCHER_BOOTSTRAP_AUTHORITY_TEMP_FILE);
  if (temporary.raw_sha256 !== expectedRaw) fail("GKX_WATCHER_BOOTSTRAP_AUTHORITY_INVALID");
  try { hardlinkWatcherLeafNoReplace(root, WATCHER_BOOTSTRAP_AUTHORITY_TEMP_FILE, WATCHER_BOOTSTRAP_AUTHORITY_FILE); }
  catch (error) {
    if (!watcherLeafExists(root, WATCHER_BOOTSTRAP_AUTHORITY_FILE)) throw error;
  }
  const final = readWatcherFileWithLinks(root, WATCHER_BOOTSTRAP_AUTHORITY_FILE);
  const staged = readWatcherFileWithLinks(root, WATCHER_BOOTSTRAP_AUTHORITY_TEMP_FILE);
  if (final.raw_sha256 !== expectedRaw || staged.raw_sha256 !== expectedRaw ||
      final.identity.device !== staged.identity.device || final.identity.inode !== staged.identity.inode ||
      final.identity.nlink !== 2 || staged.identity.nlink !== 2 || !final.bytes.equals(staged.bytes)) {
    fail("GKX_WATCHER_BOOTSTRAP_AUTHORITY_INVALID");
  }
  unlinkWatcherLeaf(root, WATCHER_BOOTSTRAP_AUTHORITY_TEMP_FILE, { allowed_links: 2, expected_raw_sha256: expectedRaw });
  readWatcherFile(root, WATCHER_BOOTSTRAP_AUTHORITY_FILE);
  boundary?.("bootstrap_authority");
  return authority;
}

function resumeBootstrapTarget(
  root: WatcherDirectoryCapability,
  witnessRef: JsonRecord,
  records: ReturnType<typeof buildJournalRecords>,
  boundary?: (value: WatcherJournalBootstrapBoundary) => void,
): WatcherJournalHandle {
  revalidateWatcherDirectory(root);
  let guard: Readonly<JsonRecord> | null = null;
  if (watcherLeafExists(root, WATCHER_BOOTSTRAP_GUARD_FILE)) {
    const file = readWatcherFileWithLinks(root, WATCHER_BOOTSTRAP_GUARD_FILE);
    guard = sealBootstrapGuardRuntime(
      parseCanonicalWatcherJson(file), root, witnessRef, records.meta, records.generation, records.pointer,
    );
  } else if (watcherLeafExists(root, WATCHER_BOOTSTRAP_GUARD_STAGE_FILE)) {
    const file = readWatcherFileWithLinks(root, WATCHER_BOOTSTRAP_GUARD_STAGE_FILE);
    guard = sealBootstrapGuardRuntime(
      parseCanonicalWatcherJson(file), root, witnessRef, records.meta, records.generation, records.pointer,
    );
  } else if (!watcherLeafExists(root, WATCHER_BOOTSTRAP_AUTHORITY_FILE)) {
    guard = bootstrapGuard(root, witnessRef, records.meta, records.generation, records.pointer);
  }
  let guardRaw: string | null = null;
  if (guard !== null) {
    const guardBytes = watcherCanonicalBytes(guard);
    const file = ensureContentAddressedArtifact(
      root, WATCHER_BOOTSTRAP_GUARD_STAGE_FILE, WATCHER_BOOTSTRAP_GUARD_FILE, guardBytes,
      "GKX_WATCHER_BOOTSTRAP_GUARD_INVALID", () => boundary?.("guard_stage"),
    );
    guardRaw = file.raw_sha256;
    boundary?.("guard");
  }

  const child = ensureWatcherDirectory(join(root.path, String(records.generation.directory_leaf)), root);
  boundary?.("child");
  const opened = openOrCreateBootstrapDatabase(child, records.meta);
  syncWatcherDirectory(child.path);
  if (opened.created) boundary?.("database");

  const generationFile = String(records.pointer.journal_generation_file);
  const generationBytes = watcherCanonicalBytes(records.generation);
  if (!watcherLeafExists(root, generationFile)) {
    writeNewWatcherFile(root, generationFile, generationBytes, 536_870_912);
    boundary?.("generation_descriptor");
  } else if (!readWatcherFile(root, generationFile, { maximum_bytes: 536_870_912 }).bytes.equals(generationBytes)) {
    fail("GKX_WATCHER_JOURNAL_GENERATION_INVALID");
  }
  const pointerArtifact = persistWatcherPointerArtifact(root, records.pointer_artifact);
  if (pointerArtifact.raw_sha256 !== records.pointer_artifact.raw_sha256) fail("GKX_WATCHER_JOURNAL_POINTER_INVALID");
  boundary?.("pointer_artifact");
  const hadFixed = watcherLeafExists(root, "watcher-journal-active.json");
  ensureContentAddressedArtifact(
    root, WATCHER_BOOTSTRAP_POINTER_TEMP_FILE, "watcher-journal-active.json", records.pointer_artifact.bytes,
    "GKX_WATCHER_JOURNAL_POINTER_INVALID", () => boundary?.("bootstrap_temp"),
  );
  if (!hadFixed) boundary?.("fixed_pointer");
  persistBootstrapAuthority(root, witnessRef, records, boundary);
  if (guard !== null && watcherLeafExists(root, WATCHER_BOOTSTRAP_GUARD_FILE)) {
    unlinkWatcherLeaf(root, WATCHER_BOOTSTRAP_GUARD_FILE, { expected_raw_sha256: guardRaw! });
    boundary?.("guard_removed");
  }
  return Object.freeze({
    root, generation_directory: child, database_path: opened.path, database: opened.database,
    meta: records.meta, generation: records.generation, pointer: records.pointer,
  });
}

export function bootstrapWatcherJournal(options: {
  readonly root: WatcherDirectoryCapability;
  readonly host_lock: WatcherHostLockCapability;
  readonly coordinates: WatcherJournalCoordinates;
  readonly on_boundary?: (value: WatcherJournalBootstrapBoundary) => void;
}): WatcherJournalHandle {
  const lock = assertWatcherHostLock(options.host_lock);
  if (lock.operation !== "service" || lock.prior_journal_pointer_digest !== null) fail("GKX_WATCHER_BOOTSTRAP_HOST_LOCK_INVALID");
  revalidateWatcherDirectory(options.root);
  if (readWatcherPointer(options.root, "journal") !== null || watcherLeafExists(options.root, WATCHER_BOOTSTRAP_GUARD_FILE) ||
      watcherLeafExists(options.root, WATCHER_BOOTSTRAP_GUARD_STAGE_FILE)) fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  const records = buildJournalRecords(options.coordinates);
  const plannedTarget = plannedTargetRecord(lock, records.meta, records.generation, records.pointer);
  const plannedTargetRef = persistPlannedTarget(options.root, plannedTarget, options.on_boundary);
  const witness = witnessRecord(lock, plannedTargetRef, records.meta, records.generation, records.pointer);
  const witnessRef = persistWitness(options.root, witness, options.on_boundary);
  return resumeBootstrapTarget(options.root, witnessRef, records, options.on_boundary);
}

export interface WatcherRecoveredJournalBootstrap {
  readonly host_lock: WatcherHostLockCapability;
  readonly journal: WatcherJournalHandle;
}

export type WatcherJournalRecoveryBoundary =
  | "claim" | "selector" | "recovery_planned_target" | "recovery_witness" | "bridge" | "executor"
  | "stale_lock_removed" | "target_stable" | "normal_lock" | "executor_released" | "claim_removed";

function hostLockForExecutor(
  executor: Readonly<JsonRecord>,
  priorPointerDigest: string | null,
  priorCoherentManifestDigest: string | null,
  journalPointerDigest: string,
): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-host-lock/1.0.0-draft.1",
    lock_id: watcherUuid7(), process_id: executor.process_id, operation: "service",
    service_instance_id: executor.service_instance_id, prior_pointer_digest: priorPointerDigest,
    prior_coherent_manifest_digest: priorCoherentManifestDigest, prior_journal_pointer_digest: journalPointerDigest,
    owner_nonce: executor.owner_nonce, created_at: watcherTimestamp(),
  };
  return sealHostLock({ ...base, lock_digest: watcherDigest(base) });
}

function lockMatchesExecutor(lock: Readonly<JsonRecord>, executor: Readonly<JsonRecord>, pointerDigest: string): boolean {
  return lock.operation === "service" && lock.prior_journal_pointer_digest === pointerDigest
    && lock.process_id === executor.process_id && lock.service_instance_id === executor.service_instance_id
    && lock.owner_nonce === executor.owner_nonce;
}

function removeStaleBootstrapLock(
  watcherRoot: WatcherDirectoryCapability,
  originalLock: Readonly<JsonRecord>,
  selectedExecutor: Readonly<JsonRecord>,
  bridge: Readonly<JsonRecord>,
  pointerDigest: string,
): WatcherHostLockCapability | null {
  const current = readHostLock(watcherRoot);
  if (current === null) return null;
  if (current.lock.lock_digest === originalLock.lock_digest) {
    if (processIsAlive(Number(originalLock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
    revalidateWatcherDirectory(watcherRoot);
    if (processIsAlive(Number(originalLock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
    unlinkWatcherLeaf(watcherRoot, WATCHER_HOST_LOCK_FILE, { expected_raw_sha256: current.raw_sha256 });
    return null;
  }
  const chain = readExecutorChain(watcherRoot, bridge);
  const owner = chain.find((row) => lockMatchesExecutor(current.lock, row.record, pointerDigest));
  if (owner === undefined) fail("GKX_WATCHER_HOST_LOCK_RECOVERY_CLAIM_INVALID");
  if (owner.record.executor_digest === selectedExecutor.executor_digest && owner.record.process_id === process.pid) {
    return registerHostLock(watcherRoot, current.lock, current.raw_sha256);
  }
  if (processIsAlive(Number(current.lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  revalidateWatcherDirectory(watcherRoot);
  if (processIsAlive(Number(current.lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  unlinkWatcherLeaf(watcherRoot, WATCHER_HOST_LOCK_FILE, { expected_raw_sha256: current.raw_sha256 });
  return null;
}

/**
 * Completes a dead-owner true-genesis journal bootstrap through the permanent
 * selector/Bridge tombstones and the linear Executor handoff.
 */
export function recoverWatcherJournalBootstrap(options: {
  readonly watcher_root: WatcherDirectoryCapability;
  readonly journal_root: WatcherDirectoryCapability;
  readonly coordinates: WatcherJournalCoordinates;
  readonly service_instance_id: string;
  readonly prior_pointer_digest: string | null;
  readonly prior_coherent_manifest_digest: string | null;
  readonly revalidate_namespace: () => void;
  readonly on_boundary?: (boundary: WatcherJournalRecoveryBoundary) => void;
}): WatcherRecoveredJournalBootstrap {
  options.revalidate_namespace();
  let bridge = readBootstrapRecoveryBridge(options.watcher_root);
  let claimFile = readRecoveryClaim(options.watcher_root);
  let originalLock: Readonly<JsonRecord>;
  let witnessRef: JsonRecord;
  let records: ReturnType<typeof buildJournalRecords>;

  if (bridge === null) {
    const fixedLock = readHostLock(options.watcher_root);
    if (fixedLock === null || fixedLock.lock.operation !== "service" || fixedLock.lock.prior_journal_pointer_digest !== null) {
      fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
    }
    originalLock = fixedLock.lock;
    claimFile = ensureRecoveryClaim(options.watcher_root, originalLock);
    options.on_boundary?.("claim");
    options.revalidate_namespace();
    const selected = ensureSelectedTarget(options.journal_root, originalLock, claimFile.claim, options.coordinates);
    options.on_boundary?.("selector");
    records = recordsFromSelector(selected.selector);
    const planned = plannedTargetRecord(originalLock, records.meta, records.generation, records.pointer);
    const plannedRef = persistPlannedTarget(options.journal_root, planned);
    options.on_boundary?.("recovery_planned_target");
    const witness = witnessRecord(originalLock, plannedRef, records.meta, records.generation, records.pointer);
    witnessRef = persistWitness(options.journal_root, witness);
    options.on_boundary?.("recovery_witness");
    const witnessAuthority = openBootstrapWitnessAuthority(options.journal_root, witnessRef);
    if (witnessAuthority.lock.lock_digest !== originalLock.lock_digest
        || stableJson([witnessAuthority.records.meta, witnessAuthority.records.generation, witnessAuthority.records.pointer])
          !== stableJson([records.meta, records.generation, records.pointer])) fail("GKX_WATCHER_BOOTSTRAP_WITNESS_INVALID");
    const expectedBridge = bootstrapRecoveryBridgeRecord(claimFile, selected.ref, witnessRef, records);
    bridge = persistBootstrapRecoveryBridge(options.watcher_root, expectedBridge);
    options.on_boundary?.("bridge");
  } else {
    if (claimFile === null || bridge.root_recovery_claim_file !== WATCHER_HOST_LOCK_RECOVERY_FILE
        || bridge.root_recovery_claim_raw_sha256 !== claimFile.raw_sha256
        || bridge.root_recovery_claim_byte_size !== watcherCanonicalBytes(claimFile.claim).byteLength
        || stableJson(bridge.root_recovery_claim) !== stableJson(claimFile.claim)) {
      fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_BRIDGE_INVALID");
    }
    witnessRef = bridge.host_lock_witness as JsonRecord;
    const authority = openBootstrapWitnessAuthority(options.journal_root, witnessRef);
    originalLock = authority.lock;
    records = authority.records;
    const selected = readSelectedTarget(options.journal_root, originalLock, claimFile.claim);
    if (selected === null || stableJson(selected.ref) !== stableJson(bridge.target_selector)) {
      fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_BRIDGE_INVALID");
    }
  }
  if (claimFile === null || claimFile.claim.observed_lock_digest !== originalLock.lock_digest
      || claimFile.claim.observed_process_id !== originalLock.process_id) {
    fail("GKX_WATCHER_HOST_LOCK_RECOVERY_CLAIM_INVALID");
  }
  options.revalidate_namespace();
  cleanupLateSelectorCandidates(options.journal_root, bridge, originalLock, claimFile.claim);
  const executor = selectBootstrapRecoveryExecutor(options.watcher_root, bridge, options.service_instance_id);
  options.on_boundary?.("executor");
  options.revalidate_namespace();
  let hostLock = removeStaleBootstrapLock(
    options.watcher_root, originalLock, executor, bridge, String(records.pointer.pointer_digest),
  );
  options.on_boundary?.("stale_lock_removed");
  const journal = resumeBootstrapTarget(options.journal_root, witnessRef, records);
  options.on_boundary?.("target_stable");
  options.revalidate_namespace();
  if (hostLock === null) {
    const current = readHostLock(options.watcher_root);
    if (current !== null) fail("GKX_WATCHER_HOST_LOCKED");
    const next = hostLockForExecutor(
      executor, options.prior_pointer_digest, options.prior_coherent_manifest_digest, String(records.pointer.pointer_digest),
    );
    const file = writeNewWatcherFile(options.watcher_root, WATCHER_HOST_LOCK_FILE, watcherCanonicalBytes(next));
    hostLock = registerHostLock(options.watcher_root, next, file.raw_sha256);
  }
  options.on_boundary?.("normal_lock");
  assertWatcherHostLock(hostLock);
  const selectedFile = readWatcherFile(options.watcher_root, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_FILE, { allowed_links: 2 });
  const selected = sealBootstrapRecoveryExecutor(parseCanonicalWatcherJson(selectedFile));
  if (selected.executor_digest !== executor.executor_digest || !lockMatchesExecutor(
    assertWatcherHostLock(hostLock), executor, String(records.pointer.pointer_digest),
  )) fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
  unlinkWatcherLeaf(options.watcher_root, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_FILE, {
    allowed_links: 2, expected_raw_sha256: selectedFile.raw_sha256,
  });
  options.on_boundary?.("executor_released");
  const currentClaim = readRecoveryClaim(options.watcher_root);
  if (currentClaim === null || currentClaim.claim.claim_digest !== claimFile.claim.claim_digest) {
    fail("GKX_WATCHER_HOST_LOCK_RECOVERY_CLAIM_INVALID");
  }
  unlinkWatcherLeaf(options.watcher_root, WATCHER_HOST_LOCK_RECOVERY_FILE, { expected_raw_sha256: currentClaim.raw_sha256 });
  options.on_boundary?.("claim_removed");
  options.revalidate_namespace();
  return Object.freeze({ host_lock: hostLock, journal });
}

export function recoverWatcherHostLock(
  directory: WatcherDirectoryCapability,
  input: Parameters<typeof hostLockRecord>[0],
  options: { readonly revalidate_namespace?: () => void } = {},
): WatcherHostLockCapability {
  options.revalidate_namespace?.();
  const observed = readHostLock(directory);
  if (observed === null) return acquireWatcherHostLock(directory, input);
  if (processIsAlive(Number(observed.lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  const claim = ensureRecoveryClaim(directory, observed.lock);
  if (claim.claim.claimant_process_id !== process.pid) fail("GKX_WATCHER_HOST_LOCK_RECOVERY_ACTIVE");
  revalidateWatcherDirectory(directory);
  options.revalidate_namespace?.();
  if (processIsAlive(Number(observed.lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  unlinkWatcherLeaf(directory, WATCHER_HOST_LOCK_FILE, { expected_raw_sha256: observed.raw_sha256 });
  options.revalidate_namespace?.();
  const lock = hostLockRecord(input);
  const file = writeNewWatcherFile(directory, WATCHER_HOST_LOCK_FILE, watcherCanonicalBytes(lock));
  const capability = registerHostLock(directory, lock, file.raw_sha256);
  options.revalidate_namespace?.();
  const reopened = readRecoveryClaim(directory);
  if (reopened === null || reopened.claim.claim_digest !== claim.claim.claim_digest) {
    fail("GKX_WATCHER_HOST_LOCK_RECOVERY_CLAIM_INVALID");
  }
  unlinkWatcherLeaf(directory, WATCHER_HOST_LOCK_RECOVERY_FILE, { expected_raw_sha256: reopened.raw_sha256 });
  options.revalidate_namespace?.();
  return capability;
}

export function validateWatcherBootstrapTerminalEvidence(
  watcherRoot: WatcherDirectoryCapability,
  journalRoot: WatcherDirectoryCapability,
): void {
  const bridge = readBootstrapRecoveryBridge(watcherRoot);
  if (bridge === null) return;
  if (watcherLeafExists(watcherRoot, WATCHER_HOST_LOCK_RECOVERY_FILE)
      || watcherLeafExists(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_FILE)
      || watcherLeafExists(watcherRoot, WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_STAGE_FILE)) {
    fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  }
  const claim = sealHostLockRecoveryClaim(bridge.root_recovery_claim as JsonRecord);
  const authority = openBootstrapWitnessAuthority(journalRoot, bridge.host_lock_witness as JsonRecord);
  const selected = readSelectedTarget(journalRoot, authority.lock, claim);
  if (selected === null || stableJson(selected.ref) !== stableJson(bridge.target_selector)) {
    fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_BRIDGE_INVALID");
  }
  cleanupLateSelectorCandidates(journalRoot, bridge, authority.lock, claim);
  const fsel = readWatcherFile(journalRoot, WATCHER_BOOTSTRAP_TARGET_SELECTOR_FILE);
  if (fsel.identity.nlink !== 1) fail("GKX_WATCHER_BOOTSTRAP_TARGET_SELECTOR_INVALID");
  const chain = readExecutorChain(watcherRoot, bridge);
  if (chain.some((row) => row.file.identity.nlink !== 1)) fail("GKX_WATCHER_BOOTSTRAP_RECOVERY_EXECUTOR_INVALID");
  const bootstrap = readWatcherFile(journalRoot, WATCHER_BOOTSTRAP_AUTHORITY_FILE);
  sealBootstrapAuthorityRuntime(
    parseCanonicalWatcherJson(bootstrap), bridge.host_lock_witness as JsonRecord,
    authority.records.meta, authority.records.generation, authority.records.pointer,
  );
}

export function openWatcherJournal(root: WatcherDirectoryCapability): WatcherJournalHandle | null {
  const pointer = readWatcherPointer(root, "journal");
  if (pointer === null) return null;
  const generationFile = String(pointer.journal_generation_file);
  const generationFileRecord = readWatcherFile(root, generationFile, { maximum_bytes: 536_870_912 });
  const generation = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(generationFileRecord));
  if (generation.contract_version !== "gkos-watcher-journal-generation/1.0.0-draft.1" ||
      generation.journal_generation_digest !== pointer.journal_generation_digest ||
      generationFile !== `watcher-journal-generation-${String(generation.journal_generation_digest).slice(7)}.json`) {
    fail("GKX_WATCHER_JOURNAL_GENERATION_INVALID");
  }
  if (generation.anchor_coherent_manifest_digest === null) {
    const authorityFile = readWatcherFile(root, WATCHER_BOOTSTRAP_AUTHORITY_FILE);
    const authorityBody = parseCanonicalWatcherJson(authorityFile);
    const witnessRef = authorityBody.host_lock_witness as JsonRecord;
    const witness = openBootstrapWitnessAuthority(root, witnessRef);
    sealBootstrapAuthorityRuntime(authorityBody, witnessRef, witness.records.meta, witness.records.generation, witness.records.pointer);
    if (witness.records.generation.journal_generation_digest !== generation.journal_generation_digest
        || witness.records.pointer.pointer_digest !== pointer.pointer_digest) fail("GKX_WATCHER_BOOTSTRAP_AUTHORITY_INVALID");
  }
  const child = openWatcherDirectory(join(root.path, String(generation.directory_leaf)));
  const databasePath = join(child.path, String(generation.database_file));
  secureDatabaseMode(databasePath);
    const database = openLiveWatcherJournalDatabase(child, databasePath);
    try {
      validateWatcherJournalAuthority(database);
    const rows = database.prepare("SELECT journal_instance_id,meta_digest,body FROM watcher_meta;").all() as Array<Record<string, unknown>>;
    if (rows.length !== 1 || rows[0].journal_instance_id !== generation.journal_instance_id || rows[0].meta_digest !== generation.meta_digest ||
        !(rows[0].body instanceof Uint8Array)) fail("WATCHER_JOURNAL_VALUE_INVALID");
    const body = Buffer.from(rows[0].body as Uint8Array);
    let parsed: unknown;
    try { parsed = JSON.parse(body.toString("utf8")); } catch { fail("WATCHER_JOURNAL_VALUE_INVALID"); }
    const meta = sealWatcherRecoveryRecord(parsed);
    if (meta.meta_digest !== generation.meta_digest || !body.equals(canonicalBody(meta))) fail("WATCHER_JOURNAL_VALUE_INVALID");
    const handle = Object.freeze({ root, generation_directory: child, database_path: databasePath, database, meta, generation, pointer });
    validateWatcherJournalAdoptionProjection(handle);
    return handle;
  } catch (error) {
      closeLiveWatcherJournalDatabase(child, database, false);
    throw error;
  }
}

function readHistoricalJournalPointer(root: WatcherDirectoryCapability, pointerDigest: string): Readonly<JsonRecord> {
  if (!/^sha256:[0-9a-f]{64}$/u.test(pointerDigest)) fail("GKX_WATCHER_JOURNAL_GENERATION_INVALID");
  const leaf = `watcher-journal-pointer-${pointerDigest.slice("sha256:".length)}.json`;
  const file = readWatcherFile(root, leaf, { maximum_bytes: 536_870_912 });
  const pointer = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(file));
  if (pointer.contract_version !== "gkos-watcher-journal-active-pointer/1.0.0-draft.1"
      || pointer.pointer_digest !== pointerDigest || !file.bytes.equals(watcherCanonicalBytes(pointer))) {
    fail("GKX_WATCHER_JOURNAL_GENERATION_INVALID");
  }
  return pointer;
}

function openHistoricalWatcherJournal(
  root: WatcherDirectoryCapability,
  pointer: Readonly<JsonRecord>,
): WatcherJournalHandle {
  const generationFile = sqlString(pointer.journal_generation_file);
  const generationBytes = readWatcherFile(root, generationFile, { maximum_bytes: 536_870_912 });
  const generation = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(generationBytes));
  if (generation.contract_version !== "gkos-watcher-journal-generation/1.0.0-draft.1"
      || generation.journal_generation_digest !== pointer.journal_generation_digest
      || generationFile !== `watcher-journal-generation-${String(generation.journal_generation_digest).slice(7)}.json`
      || !generationBytes.bytes.equals(watcherCanonicalBytes(generation))) {
    fail("GKX_WATCHER_JOURNAL_GENERATION_INVALID");
  }
  const child = openWatcherDirectory(join(root.path, sqlString(generation.directory_leaf)));
  const databasePath = join(child.path, sqlString(generation.database_file));
  secureDatabaseMode(databasePath);
  const immutableUrl = pathToFileURL(databasePath);
  immutableUrl.searchParams.set("immutable", "1");
  const database = new DatabaseSync(immutableUrl, { readOnly: true });
  try {
    validateHistoricalWatcherJournalAuthority(database);
    const rows = database.prepare("SELECT journal_instance_id,meta_digest,body FROM watcher_meta;").all() as Array<Record<string, unknown>>;
    if (rows.length !== 1 || rows[0].journal_instance_id !== generation.journal_instance_id
        || rows[0].meta_digest !== generation.meta_digest) fail("WATCHER_JOURNAL_VALUE_INVALID");
    const body = canonicalSqlBody(rows[0].body);
    if (body.record.contract_version !== "gkos-watcher-journal-meta/1.0.0-draft.1"
        || body.record.meta_digest !== generation.meta_digest) fail("WATCHER_JOURNAL_VALUE_INVALID");
    const handle = Object.freeze({ root, generation_directory: child, database_path: databasePath, database,
      meta: body.record, generation, pointer });
    validateWatcherJournalAdoptionProjection(handle);
    return handle;
  } catch (error) {
    database.close();
    throw error;
  }
}

function closeHistoricalWatcherJournal(handle: WatcherJournalHandle): void {
  handle.database.close();
  secureDatabaseMode(handle.database_path);
}

export function closeWatcherJournal(handle: WatcherJournalHandle): void {
  closeLiveWatcherJournalDatabase(handle.generation_directory, handle.database);
  secureDatabaseMode(handle.database_path);
}

type ResetOutboxAudit = {
  readonly authority: Readonly<JsonRecord>;
  readonly ready: readonly {
    readonly membership: Readonly<JsonRecord>;
    readonly event: Readonly<JsonRecord>;
    readonly occurrence: Readonly<JsonRecord>;
  }[];
};

function decodeBodyRows(database: DatabaseSync, table: string, order: string): Readonly<JsonRecord>[] {
  if (!TABLE_NAMES.includes(table) || !/^[a-z_]+(?:,[a-z_]+)*$/u.test(order)) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  const rows = database.prepare(`SELECT body FROM ${table} ORDER BY ${order};`).all() as Array<{ body?: Uint8Array }>;
  return rows.map((row) => {
    if (!(row.body instanceof Uint8Array)) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    const bytes = Buffer.from(row.body);
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString("utf8")); } catch { fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE"); }
    let record: Readonly<JsonRecord>;
    try { record = sealWatcherRecoveryRecord(parsed); } catch { fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE"); }
    if (!bytes.equals(canonicalBody(record))) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    return record;
  });
}

function decodeMembershipRows(database: DatabaseSync): readonly { readonly event_set_digest: string; readonly record: Readonly<JsonRecord> }[] {
  const rows = database.prepare("SELECT event_set_digest,event_ordinal,membership_digest,event_digest,original_membership_digest,body FROM source_removal_event_set_members ORDER BY event_set_digest,event_ordinal;")
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => {
    if (!(row.body instanceof Uint8Array)) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    const bytes = Buffer.from(row.body as Uint8Array);
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString("utf8")); } catch { fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE"); }
    let record: Readonly<JsonRecord>;
    try { record = sealWatcherRecoveryRecord(parsed); } catch { fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE"); }
    if (!bytes.equals(canonicalBody(record)) || row.event_ordinal !== record.event_ordinal || row.membership_digest !== record.membership_digest
        || row.event_digest !== record.event_digest || row.original_membership_digest !== record.original_membership_digest
        || typeof row.event_set_digest !== "string") fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    return Object.freeze({ event_set_digest: row.event_set_digest, record });
  });
}

/**
 * Reconstruct one source-removal set from its durable rows. Reset-carry sets
 * bind their immediate predecessor membership in the immutable prior journal;
 * that predecessor is never copied into the replacement database.
 */
export function readWatcherSourceRemovalEventSetBundle(
  handle: WatcherJournalHandle,
  eventSetDigest: string,
): Readonly<JsonRecord> {
  const eventSet = readJournalBody(
    handle,
    "SELECT body FROM source_removal_event_sets WHERE event_set_digest=?;",
    eventSetDigest,
  );
  if (eventSet === null || eventSet.event_set_digest !== eventSetDigest) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  const memberships = decodeMembershipRows(handle.database)
    .filter((row) => row.event_set_digest === eventSetDigest)
    .map((row) => row.record);
  const eventByDigest = new Map(decodeBodyRows(handle.database, "source_removal_events", "event_digest")
    .map((record) => [String(record.event_digest), record]));
  const occurrenceByDigest = new Map(decodeBodyRows(handle.database, "source_removal_occurrences", "occurrence_digest")
    .map((record) => [String(record.occurrence_digest), record]));
  const events: Readonly<JsonRecord>[] = [];
  const occurrences: Readonly<JsonRecord>[] = [];
  for (const membership of memberships) {
    const event = eventByDigest.get(String(membership.event_digest));
    const occurrence = event === undefined ? undefined : occurrenceByDigest.get(String(event.occurrence_digest));
    if (event === undefined || occurrence === undefined) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    events.push(event); occurrences.push(occurrence);
  }

  const priorMemberships: Array<Readonly<JsonRecord> | null> = [];
  const priorEvents: Array<Readonly<JsonRecord> | null> = [];
  const priorOccurrences: Array<Readonly<JsonRecord> | null> = [];
  if (eventSet.set_kind === "reset_carry") {
    if (handle.pointer.prior_pointer_digest === null) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    const priorPointer = readHistoricalJournalPointer(handle.root, sqlString(handle.pointer.prior_pointer_digest));
    const priorHandle = openHistoricalWatcherJournal(handle.root, priorPointer);
    try {
      const priorMembershipByDigest = new Map(decodeMembershipRows(priorHandle.database)
        .map((row) => [String(row.record.membership_digest), row.record]));
      const priorEventByDigest = new Map(decodeBodyRows(priorHandle.database, "source_removal_events", "event_digest")
        .map((record) => [String(record.event_digest), record]));
      const priorOccurrenceByDigest = new Map(decodeBodyRows(priorHandle.database, "source_removal_occurrences", "occurrence_digest")
        .map((record) => [String(record.occurrence_digest), record]));
      for (let index = 0; index < memberships.length; index += 1) {
        const priorMembership = priorMembershipByDigest.get(String(memberships[index].original_membership_digest));
        const priorEvent = priorMembership === undefined ? undefined : priorEventByDigest.get(String(priorMembership.event_digest));
        const priorOccurrence = priorEvent === undefined ? undefined : priorOccurrenceByDigest.get(String(priorEvent.occurrence_digest));
        if (priorMembership === undefined || priorEvent === undefined || priorOccurrence === undefined
            || stableBody(priorEvent) !== stableBody(events[index])
            || stableBody(priorOccurrence) !== stableBody(occurrences[index])) {
          fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
        }
        priorMemberships.push(priorMembership); priorEvents.push(priorEvent); priorOccurrences.push(priorOccurrence);
      }
    } finally { closeHistoricalWatcherJournal(priorHandle); }
  } else {
    for (let index = 0; index < memberships.length; index += 1) {
      priorMemberships.push(null); priorEvents.push(null); priorOccurrences.push(null);
    }
  }
  return sealSourceRemovalEventSetBundle({
    event_set: eventSet,
    memberships,
    prior_memberships: priorMemberships,
    events,
    prior_events: priorEvents,
    occurrences,
    prior_occurrences: priorOccurrences,
  });
}

type AdoptionProjection = {
  readonly receipt: Readonly<JsonRecord>;
  readonly transition: Readonly<JsonRecord>;
  readonly active: Readonly<JsonRecord>;
  readonly current_source: "local_native" | "adopted_current";
};

function canonicalSqlBody(value: unknown): { readonly record: Readonly<JsonRecord>; readonly bytes: Buffer } {
  if (!(value instanceof Uint8Array)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const bytes = Buffer.from(value);
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch { fail("WATCHER_JOURNAL_VALUE_INVALID"); }
  const record = sealWatcherRecoveryRecord(parsed);
  if (!bytes.equals(canonicalBody(record))) fail("WATCHER_JOURNAL_VALUE_INVALID");
  return { record, bytes };
}

/**
 * Enforce the sole alternate journal body/scalar union admitted for reset
 * reconciliation. Ordinary Batch8/Transition17 rows retain their native
 * storage mapping; Receipt25/Transition16 are accepted only as one exact
 * paired adoption with no observation, Plan, or local activation-intent row.
 */
export function validateWatcherJournalAdoptionProjection(handle: WatcherJournalHandle): AdoptionProjection | null {
  const batchRows = handle.database.prepare(
    "SELECT batch_id,started_at,target_topology_snapshot_digest,terminal_state,terminal_transition_digest,body FROM batches ORDER BY batch_id;",
  ).all() as Array<Record<string, unknown>>;
  const transitionRows = handle.database.prepare(
    "SELECT batch_id,transition_ordinal,state,prior_transition_digest,transition_digest,body FROM transitions ORDER BY batch_id,transition_ordinal;",
  ).all() as Array<Record<string, unknown>>;
  const observationRows = handle.database.prepare(
    "SELECT batch_id,observation_digest,authority_digest,artifact_file,raw_sha256,byte_size,body FROM observations ORDER BY batch_id;",
  ).all() as Array<Record<string, unknown>>;
  const planRows = handle.database.prepare(
    "SELECT batch_id,plan_digest,authority_digest,artifact_file,raw_sha256,byte_size,target_topology_snapshot_digest,source_removal_event_set_digest,body FROM normalized_plans ORDER BY batch_id;",
  ).all() as Array<Record<string, unknown>>;
  for (const row of observationRows) {
    const body = canonicalSqlBody(row.body).record;
    if (body.contract_version !== "gkos-watcher-observation-authority/1.0.0-draft.1"
        || row.batch_id !== body.batch_id || row.observation_digest !== body.observation_digest
        || row.authority_digest !== body.authority_digest || row.artifact_file !== body.observation_artifact_file
        || row.raw_sha256 !== body.observation_raw_sha256 || row.byte_size !== body.observation_byte_size) {
      fail("WATCHER_JOURNAL_VALUE_INVALID");
    }
  }
  for (const row of planRows) {
    const body = canonicalSqlBody(row.body).record;
    if (body.contract_version !== "gkos-watcher-plan-authority/1.0.0-draft.1"
        || row.batch_id !== body.batch_id || row.plan_digest !== body.plan_digest
        || row.authority_digest !== body.authority_digest || row.artifact_file !== body.plan_artifact_file
        || row.raw_sha256 !== body.plan_raw_sha256 || row.byte_size !== body.plan_byte_size
        || row.target_topology_snapshot_digest !== body.target_topology_snapshot_digest
        || row.source_removal_event_set_digest !== body.source_removal_event_set_digest) {
      fail("WATCHER_JOURNAL_VALUE_INVALID");
    }
  }
  const transitionsByBatch = new Map<string, Array<{ row: Record<string, unknown>; body: Readonly<JsonRecord> }>>();
  for (const row of transitionRows) {
    const decoded = canonicalSqlBody(row.body).record;
    if (row.batch_id !== decoded.batch_id || row.transition_ordinal !== decoded.transition_ordinal || row.state !== decoded.state
        || row.prior_transition_digest !== (decoded.contract_version === "gkos-watcher-transition/1.0.0-draft.1"
          ? decoded.prior_transition_digest : null)
        || row.transition_digest !== decoded.transition_digest) fail("WATCHER_JOURNAL_VALUE_INVALID");
    const batchId = sqlString(row.batch_id);
    const entries = transitionsByBatch.get(batchId) ?? [];
    entries.push({ row, body: decoded });
    transitionsByBatch.set(batchId, entries);
  }

  let adoption: { receipt: Readonly<JsonRecord>; transition: Readonly<JsonRecord> } | null = null;
  for (const row of batchRows) {
    const body = canonicalSqlBody(row.body).record;
    const batchId = sqlString(row.batch_id);
    const transitions = transitionsByBatch.get(batchId) ?? [];
    if (body.contract_version === "gkos-watcher-batch-record/1.0.0-draft.1") {
      if (row.batch_id !== body.batch_id || row.started_at !== body.started_at) fail("WATCHER_JOURNAL_VALUE_INVALID");
      const plan = handle.database.prepare(
        "SELECT target_topology_snapshot_digest FROM normalized_plans WHERE batch_id=?;",
      ).get(batchId) as { target_topology_snapshot_digest?: unknown } | undefined;
      if (plan !== undefined && row.target_topology_snapshot_digest !== plan.target_topology_snapshot_digest) {
        fail("WATCHER_JOURNAL_VALUE_INVALID");
      }
      const noop = transitions.length === 1
        && transitions[0].body.contract_version === "gkos-watcher-failure-retry-noop-transition/1.0.0-draft.1";
      if (noop) {
        const transition = transitions[0].body;
        if (body.batch_kind !== "failure_reconciliation" || body.execution_kind !== "set_files"
            || transition.batch_id !== body.batch_id || transition.transition_ordinal !== 0
            || transition.state !== "failure_reconciliation_noop_complete" || transition.terminal_state !== "complete"
            || transition.prior_transition_digest !== null || row.target_topology_snapshot_digest === null
            || row.terminal_state !== "complete" || row.terminal_transition_digest !== transition.transition_digest
            || (transition.receipt as JsonRecord).retry_batch_id !== body.batch_id) fail("WATCHER_JOURNAL_VALUE_INVALID");
        const observations = Number((handle.database.prepare("SELECT COUNT(*) AS count FROM observations WHERE batch_id=?;")
          .get(batchId) as { count: number }).count);
        const plans = Number((handle.database.prepare("SELECT COUNT(*) AS count FROM normalized_plans WHERE batch_id=?;")
          .get(batchId) as { count: number }).count);
        if (observations !== 1 || plans !== 1) fail("WATCHER_JOURNAL_VALUE_INVALID");
        const reopenedNoop = readFailureRetryNoopRows(handle, batchId);
        if (reopenedNoop === null || stableBody(reopenedNoop.batch) !== stableBody(body)
            || stableBody(reopenedNoop.transition) !== stableBody(transition)) {
          fail("WATCHER_JOURNAL_VALUE_INVALID");
        }
        continue;
      }
      if (transitions.some((item) => item.body.contract_version !== "gkos-watcher-transition/1.0.0-draft.1")) {
        fail("WATCHER_JOURNAL_VALUE_INVALID");
      }
      if (transitions.length > 0) sealWatcherTransitionChain(transitions.map((item) => item.body));
      const terminal = transitions.at(-1)?.body;
      if (row.terminal_state === null || row.terminal_transition_digest === null) {
        if (row.terminal_state !== null || row.terminal_transition_digest !== null || terminal?.terminal_state !== "open") {
          fail("WATCHER_JOURNAL_VALUE_INVALID");
        }
      } else if (terminal === undefined || row.terminal_state !== terminal.terminal_state
          || row.terminal_transition_digest !== terminal.transition_digest || terminal.terminal_state === "open") {
        fail("WATCHER_JOURNAL_VALUE_INVALID");
      }
      continue;
    }
    if (body.contract_version !== "gkos-watcher-journal-reset-reconciliation-adoption/1.0.0-draft.1"
        || adoption !== null || transitions.length !== 1) fail("WATCHER_JOURNAL_VALUE_INVALID");
    const transition = transitions[0].body;
    if (transition.contract_version !== "gkos-watcher-journal-reset-reconciliation-transition/1.0.0-draft.1"
        || row.batch_id !== body.batch_id || row.started_at !== body.started_at
        || row.target_topology_snapshot_digest !== body.topology_snapshot_digest || row.terminal_state !== "complete"
        || row.terminal_transition_digest !== transition.transition_digest || transition.batch_id !== body.batch_id
        || transition.receipt_digest !== body.receipt_digest) fail("WATCHER_JOURNAL_VALUE_INVALID");
    const observations = Number((handle.database.prepare("SELECT COUNT(*) AS count FROM observations WHERE batch_id=?;").get(batchId) as { count: number }).count);
    const plans = Number((handle.database.prepare("SELECT COUNT(*) AS count FROM normalized_plans WHERE batch_id=?;").get(batchId) as { count: number }).count);
    if (observations !== 0 || plans !== 0) fail("WATCHER_JOURNAL_VALUE_INVALID");
    adoption = { receipt: body, transition };
  }
  for (const batchId of transitionsByBatch.keys()) if (!batchRows.some((row) => row.batch_id === batchId)) {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  if (adoption === null) return null;

  const activeRows = handle.database.prepare(
    "SELECT singleton,active_digest,coherent_manifest_digest,pointer_digest,body FROM active_coherent;",
  ).all() as Array<Record<string, unknown>>;
  if (activeRows.length !== 1 || activeRows[0].singleton !== 1) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const active = canonicalSqlBody(activeRows[0].body).record;
  if (active.contract_version !== "gkos-watcher-active-coherent/1.0.0-draft.1"
      || activeRows[0].active_digest !== active.active_digest
      || activeRows[0].coherent_manifest_digest !== active.coherent_manifest_digest
      || activeRows[0].pointer_digest !== active.pointer_digest) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const localIntent = handle.database.prepare("SELECT COUNT(*) AS count FROM activation_intents WHERE intent_digest=?;")
    .get(sqlString(active.intent_digest)) as { count?: unknown } | undefined;
  const localIntentCount = Number(localIntent?.count);
  if (!Number.isSafeInteger(localIntentCount) || (localIntentCount !== 0 && localIntentCount !== 1)) {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  if (localIntentCount === 0 && (adoption.receipt.prior_active_digest !== active.active_digest
      || adoption.receipt.current_pointer_digest !== active.pointer_digest
      || adoption.receipt.current_coherent_manifest_digest !== active.coherent_manifest_digest
      || adoption.transition.adopted_active_digest !== active.active_digest)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  return Object.freeze({ ...adoption, active, current_source: localIntentCount === 1 ? "local_native" : "adopted_current" });
}

function auditActivationDag(
  handle: WatcherJournalHandle,
  outerPointer: Readonly<JsonRecord>,
  outerManifest: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const intents = decodeBodyRows(handle.database, "activation_intents", "intent_digest");
  const outcomes = decodeBodyRows(handle.database, "activation_outcomes", "outcome_digest");
  const activeRows = decodeBodyRows(handle.database, "active_coherent", "singleton");
  if (activeRows.length !== 1 || intents.length !== outcomes.length) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  const active = activeRows[0];
  const intentByDigest = new Map(intents.map((item) => [String(item.intent_digest), item]));
  const outcomeByIntent = new Map<string, Readonly<JsonRecord>>();
  for (const outcome of outcomes) {
    if (outcomeByIntent.has(String(outcome.intent_digest))) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    outcomeByIntent.set(String(outcome.intent_digest), outcome);
    const intent = intentByDigest.get(String(outcome.intent_digest));
    if (intent === undefined || outcome.coherent_manifest_digest !== intent.coherent_manifest_digest) {
      fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    }
  }
  for (const intent of intents) if (!outcomeByIntent.has(String(intent.intent_digest))) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  const currentIntent = intentByDigest.get(String(active.intent_digest));
  const currentOutcome = outcomeByIntent.get(String(active.intent_digest));
  if (currentIntent === undefined || currentOutcome === undefined || currentOutcome.outcome !== "published"
      || currentOutcome.pointer_digest !== outerPointer.pointer_digest
      || currentOutcome.coherent_manifest_digest !== outerManifest.coherent_manifest_digest
      || active.pointer_digest !== outerPointer.pointer_digest
      || active.coherent_manifest_digest !== outerManifest.coherent_manifest_digest
      || active.service_generation_id !== outerManifest.service_generation_id
      || (currentIntent.target_pointer as JsonRecord).pointer_digest !== outerPointer.pointer_digest
      || currentIntent.coherent_manifest_digest !== outerManifest.coherent_manifest_digest) {
    fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  }
  const completed = decodeBodyRows(handle.database, "transitions", "batch_id,transition_ordinal")
    .find((item) => item.transition_digest === (currentIntent.target_complete_transition as JsonRecord).transition_digest);
  if (completed === undefined || completed.state !== "complete" || completed.terminal_state !== "complete") {
    fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  }
  return active;
}

function nativeActivationAuthority(
  handle: WatcherJournalHandle,
  outerPointer: Readonly<JsonRecord>,
  outerManifest: Readonly<JsonRecord>,
): Readonly<{
  meta: Readonly<JsonRecord>;
  generation: Readonly<JsonRecord>;
  pointer: Readonly<JsonRecord>;
  transitions: readonly Readonly<JsonRecord>[];
  intent: Readonly<JsonRecord>;
  outcome: Readonly<JsonRecord>;
  active: Readonly<JsonRecord>;
}> {
  const active = auditActivationDag(handle, outerPointer, outerManifest);
  const intent = readJournalBody(handle, "SELECT body FROM activation_intents WHERE intent_digest=?;", sqlString(active.intent_digest));
  const outcome = readJournalBody(handle, "SELECT body FROM activation_outcomes WHERE intent_digest=?;", sqlString(active.intent_digest));
  if (intent === null || outcome === null) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  const complete = sealWatcherRecoveryRecord(intent.target_complete_transition);
  const transitions = decodeBodyRows(handle.database, "transitions", "batch_id,transition_ordinal")
    .filter((item) => item.batch_id === complete.batch_id);
  if (transitions.length !== 7 || sealWatcherTransitionChain(transitions).at(-1)?.transition_digest !== complete.transition_digest
      || outcome.intent_digest !== intent.intent_digest || outcome.outcome !== "published") {
    fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  }
  return Object.freeze({ meta: handle.meta, generation: handle.generation, pointer: handle.pointer,
    transitions, intent, outcome, active });
}

function historicalPointerForGeneration(
  root: WatcherDirectoryCapability,
  start: Readonly<JsonRecord>,
  generationDigest: string,
): Readonly<JsonRecord> {
  const seen = new Set<string>();
  let pointer = start;
  for (let depth = 0; depth < 4096; depth += 1) {
    const digest = sqlString(pointer.pointer_digest);
    if (seen.has(digest)) fail("GKX_WATCHER_JOURNAL_GENERATION_INVALID");
    seen.add(digest);
    if (pointer.journal_generation_digest === generationDigest) return pointer;
    if (pointer.prior_pointer_digest === null) break;
    pointer = readHistoricalJournalPointer(root, sqlString(pointer.prior_pointer_digest));
  }
  fail("GKX_WATCHER_JOURNAL_GENERATION_INVALID");
}

/**
 * Reopen the reset replacement, its immediate source journal, and the one
 * flattened native activation journal. This is read-only authority material;
 * no caller may infer a missing historical pointer or adoption row.
 */
export function readWatcherJournalResetReconciliationAuthority(
  handle: WatcherJournalHandle,
  outerPointerInput: unknown,
  outerManifestInput: unknown,
): Readonly<JsonRecord> {
  const outerPointer = sealWatcherRecoveryRecord(outerPointerInput);
  const outerManifest = sealWatcherRecoveryRecord(outerManifestInput);
  if (!watcherJournalIsAnchoredResetPendingReconciliation(handle, outerPointer, outerManifest)) {
    fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  }
  const resets = decodeBodyRows(handle.database, "journal_resets", "reset_digest");
  if (resets.length !== 1 || handle.pointer.prior_pointer_digest === null) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  const reset = resets[0];
  const sourcePointer = readHistoricalJournalPointer(handle.root, sqlString(handle.pointer.prior_pointer_digest));
  const sourceHandle = openHistoricalWatcherJournal(handle.root, sourcePointer);
  let nativeHandle: WatcherJournalHandle | null = null;
  try {
    const sourceAdoption = validateWatcherJournalAdoptionProjection(sourceHandle);
    let nativePointer = sourcePointer;
    if (sourceAdoption !== null) {
      if (sourceAdoption.receipt.replacement_journal_generation_digest !== sourceHandle.generation.journal_generation_digest
          || sourceAdoption.receipt.current_pointer_digest !== outerPointer.pointer_digest
          || sourceAdoption.receipt.current_coherent_manifest_digest !== outerManifest.coherent_manifest_digest
          || sourceAdoption.active.pointer_digest !== outerPointer.pointer_digest
          || sourceAdoption.active.coherent_manifest_digest !== outerManifest.coherent_manifest_digest) {
        fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
      }
      nativePointer = historicalPointerForGeneration(
        handle.root,
        sourcePointer,
        sqlString(sourceAdoption.receipt.native_activation_journal_generation_digest),
      );
      nativeHandle = openHistoricalWatcherJournal(handle.root, nativePointer);
    }
    const native = nativeActivationAuthority(nativeHandle ?? sourceHandle, outerPointer, outerManifest);
    const sourceActive = sourceAdoption?.active ?? native.active;
    if (sourceHandle.generation.journal_generation_digest !== reset.prior_journal_generation_digest
        || reset.new_journal_generation_digest !== handle.generation.journal_generation_digest
        || reset.new_journal_meta_digest !== handle.meta.meta_digest || reset.target_journal_pointer_digest !== handle.pointer.pointer_digest
        || sourceActive.active_digest !== native.active.active_digest) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    return Object.freeze({
      replacement_meta: handle.meta,
      replacement_generation: handle.generation,
      replacement_pointer: handle.pointer,
      reset,
      source_meta: sourceHandle.meta,
      source_generation: sourceHandle.generation,
      source_pointer: sourcePointer,
      native_meta: native.meta,
      native_generation: native.generation,
      native_pointer: nativePointer,
      native_transitions: native.transitions,
      native_activation_intent: native.intent,
      native_activation_outcome: native.outcome,
      native_active: native.active,
      source_adoption_receipt: sourceAdoption?.receipt ?? null,
      source_adoption_transition: sourceAdoption?.transition ?? null,
      source_active: sourceActive,
    });
  } finally {
    if (nativeHandle !== null) closeHistoricalWatcherJournal(nativeHandle);
    closeHistoricalWatcherJournal(sourceHandle);
  }
}

function auditCurrentOrAdoptedActivationDag(
  handle: WatcherJournalHandle,
  outerPointer: Readonly<JsonRecord>,
  outerManifest: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const adoption = validateWatcherJournalAdoptionProjection(handle);
  if (adoption === null || adoption.current_source === "local_native") {
    return auditActivationDag(handle, outerPointer, outerManifest);
  }
  if (adoption.receipt.replacement_journal_generation_digest !== handle.generation.journal_generation_digest
      || adoption.receipt.current_pointer_digest !== outerPointer.pointer_digest
      || adoption.receipt.current_coherent_manifest_digest !== outerManifest.coherent_manifest_digest
      || adoption.active.pointer_digest !== outerPointer.pointer_digest
      || adoption.active.coherent_manifest_digest !== outerManifest.coherent_manifest_digest) {
    fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  }
  const nativePointer = historicalPointerForGeneration(
    handle.root,
    handle.pointer,
    sqlString(adoption.receipt.native_activation_journal_generation_digest),
  );
  const nativeHandle = openHistoricalWatcherJournal(handle.root, nativePointer);
  try {
    const native = nativeActivationAuthority(nativeHandle, outerPointer, outerManifest);
    if (adoption.receipt.native_activation_intent_digest !== native.intent.intent_digest
        || adoption.receipt.native_activation_outcome_digest !== native.outcome.outcome_digest
        || adoption.receipt.prior_active_digest !== native.active.active_digest
        || stableBody(adoption.active) !== stableBody(native.active)) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    return adoption.active;
  } finally { closeHistoricalWatcherJournal(nativeHandle); }
}

export type WatcherCurrentActivationAuthority = Readonly<{
  source_kind: "local_native" | "adopted_current";
  current_activation_intent: Readonly<JsonRecord>;
  current_activation_outcome: Readonly<JsonRecord>;
  current_active: Readonly<JsonRecord>;
  current_meta: Readonly<JsonRecord>;
  current_generation: Readonly<JsonRecord>;
  current_journal_pointer: Readonly<JsonRecord>;
  adoption_receipt: Readonly<JsonRecord> | null;
  adoption_transition: Readonly<JsonRecord> | null;
  native_meta: Readonly<JsonRecord>;
  native_generation: Readonly<JsonRecord>;
  native_journal_pointer: Readonly<JsonRecord>;
}>;

/**
 * Resolve the current activation provenance from the physical journal graph.
 * A historical adoption row is not treated as current once a later local
 * activation intent exists. The adopted-current branch always reopens the
 * exact native journal named by the paired receipt.
 */
export function readWatcherCurrentActivationAuthority(
  handle: WatcherJournalHandle,
  outerPointerInput: unknown,
  outerManifestInput: unknown,
): WatcherCurrentActivationAuthority {
  validateWatcherJournalAuthority(handle.database);
  const outerPointer = sealWatcherRecoveryRecord(outerPointerInput);
  const outerManifest = sealWatcherRecoveryRecord(outerManifestInput);
  const adoption = validateWatcherJournalAdoptionProjection(handle);
  if (adoption === null || adoption.current_source === "local_native") {
    const native = nativeActivationAuthority(handle, outerPointer, outerManifest);
    return Object.freeze({
      source_kind: "local_native", current_activation_intent: native.intent,
      current_activation_outcome: native.outcome, current_active: native.active,
      current_meta: handle.meta, current_generation: handle.generation, current_journal_pointer: handle.pointer,
      adoption_receipt: null, adoption_transition: null,
      native_meta: handle.meta, native_generation: handle.generation, native_journal_pointer: handle.pointer,
    });
  }
  const resets = decodeBodyRows(handle.database, "journal_resets", "reset_digest");
  if (resets.length !== 1 || resets[0].reset_digest !== adoption.receipt.reset_digest
      || resets[0].new_journal_generation_digest !== handle.generation.journal_generation_digest
      || adoption.receipt.replacement_journal_generation_digest !== handle.generation.journal_generation_digest
      || adoption.receipt.current_pointer_digest !== outerPointer.pointer_digest
      || adoption.receipt.current_coherent_manifest_digest !== outerManifest.coherent_manifest_digest
      || adoption.active.pointer_digest !== outerPointer.pointer_digest
      || adoption.active.coherent_manifest_digest !== outerManifest.coherent_manifest_digest) {
    fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  }
  const nativePointer = historicalPointerForGeneration(
    handle.root,
    handle.pointer,
    sqlString(adoption.receipt.native_activation_journal_generation_digest),
  );
  const nativeHandle = openHistoricalWatcherJournal(handle.root, nativePointer);
  try {
    const native = nativeActivationAuthority(nativeHandle, outerPointer, outerManifest);
    if (adoption.receipt.native_activation_intent_digest !== native.intent.intent_digest
        || adoption.receipt.native_activation_outcome_digest !== native.outcome.outcome_digest
        || adoption.receipt.prior_active_digest !== native.active.active_digest
        || stableBody(adoption.active) !== stableBody(native.active)) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    return Object.freeze({
      source_kind: "adopted_current", current_activation_intent: native.intent,
      current_activation_outcome: native.outcome, current_active: adoption.active,
      current_meta: handle.meta, current_generation: handle.generation, current_journal_pointer: handle.pointer,
      adoption_receipt: adoption.receipt, adoption_transition: adoption.transition,
      native_meta: native.meta, native_generation: native.generation, native_journal_pointer: native.pointer,
    });
  } finally { closeHistoricalWatcherJournal(nativeHandle); }
}

function reopenWatcherArtifact(
  directory: WatcherDirectoryCapability,
  authority: Readonly<JsonRecord>,
  role: "observation" | "plan",
): Readonly<JsonRecord> {
  const fileField = role === "observation" ? "observation_artifact_file" : "plan_artifact_file";
  const digestField = role === "observation" ? "observation_digest" : "plan_digest";
  const rawField = role === "observation" ? "observation_raw_sha256" : "plan_raw_sha256";
  const sizeField = role === "observation" ? "observation_byte_size" : "plan_byte_size";
  const expectedFile = `watcher-${role}-${String(authority[digestField]).slice(7)}.json`;
  if (authority[fileField] !== expectedFile) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const file = readWatcherFile(directory, expectedFile);
  const record = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(file));
  if (record[digestField] !== authority[digestField] || file.raw_sha256 !== authority[rawField]
      || file.bytes.byteLength !== authority[sizeField] || !file.bytes.equals(watcherCanonicalBytes(record))) {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  return record;
}

function reopenCurrentOuterMaterial(
  directory: WatcherDirectoryCapability,
  bundle: Readonly<JsonRecord>,
): Readonly<{ pointer: Readonly<JsonRecord>; manifest: Readonly<JsonRecord>; topology: Readonly<JsonRecord>; raw_graph: Readonly<JsonRecord> }> {
  const pointer = bundle.current_outer_pointer as Readonly<JsonRecord>;
  const manifest = bundle.current_coherent_manifest as Readonly<JsonRecord>;
  const topology = bundle.current_topology as Readonly<JsonRecord>;
  const rawGraph = bundle.current_raw_graph as Readonly<JsonRecord>;
  const fixed = readWatcherPointer(directory, "outer");
  if (fixed === null || stableBody(fixed) !== stableBody(pointer)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const manifestFile = readWatcherFile(directory, sqlString(pointer.coherent_manifest_file));
  const reopenedManifest = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(manifestFile));
  const topologyFile = readWatcherFile(directory, sqlString(manifest.topology_artifact_file));
  const reopenedTopology = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(topologyFile));
  const graphFile = readWatcherFile(directory, sqlString((manifest.graph_projection_state as JsonRecord).graph_artifact_file));
  const reopenedGraph = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(graphFile));
  if (stableBody(reopenedManifest) !== stableBody(manifest) || stableBody(reopenedTopology) !== stableBody(topology)
      || stableBody(reopenedGraph) !== stableBody(rawGraph)
      || topologyFile.raw_sha256 !== manifest.topology_artifact_raw_sha256
      || graphFile.raw_sha256 !== watcherRawDigest(watcherCanonicalBytes(rawGraph))) fail("WATCHER_JOURNAL_VALUE_INVALID");
  return Object.freeze({ pointer: fixed, manifest: reopenedManifest, topology: reopenedTopology, raw_graph: reopenedGraph });
}

export type WatcherFailureRetryNoopPhysicalAuthority = Readonly<{
  bundle: Readonly<JsonRecord>;
  observation: Readonly<JsonRecord>;
  plan: Readonly<JsonRecord>;
  current_owner_manifest: Readonly<JsonRecord>;
  activation: WatcherCurrentActivationAuthority;
}>;

function reopenCurrentOwnerManifest(
  retrievalDirectory: WatcherDirectoryCapability,
  manifest: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const retrievalState = manifest.retrieval_projection_state as Readonly<JsonRecord>;
  const ownerFile = readWatcherFile(
    retrievalDirectory,
    `ingest-generation-${sqlString(retrievalState.owner_manifest_digest).slice(7)}.json`,
    { maximum_bytes: 536_870_912 },
  );
  try {
    const parsed = JSON.parse(ownerFile.bytes.toString("utf8")) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
        || !ownerFile.bytes.equals(Buffer.from(`${stableJson(parsed)}\n`, "utf8"))) {
      fail("WATCHER_JOURNAL_VALUE_INVALID");
    }
    return parsed as Readonly<JsonRecord>;
  } catch {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
}

/**
 * Physical prerequisite for the pure no-op sealer. This reconstructs current
 * versus adopted activation provenance, securely reopens the external
 * Observation/Plan and current outer artifacts, and derives the sole current
 * PreScan8 body rather than accepting a caller-selected history branch.
 */
export function validateWatcherFailureRetryNoopPhysicalAuthority(options: {
  readonly watcher_directory: WatcherDirectoryCapability;
  readonly retrieval_directory: WatcherDirectoryCapability;
  readonly journal: WatcherJournalHandle;
  readonly bundle: unknown;
}): WatcherFailureRetryNoopPhysicalAuthority {
  const bundle = sealWatcherFailureRetryNoopBundle(options.bundle);
  const failureRetry = bundle.failure_retry_bundle as Readonly<JsonRecord>;
  const observationAuthority = failureRetry.retry_observation_authority as Readonly<JsonRecord>;
  const planAuthority = bundle.retry_plan_authority as Readonly<JsonRecord>;
  const observation = reopenWatcherArtifact(options.watcher_directory, observationAuthority, "observation");
  const plan = reopenWatcherArtifact(options.watcher_directory, planAuthority, "plan");
  const outer = reopenCurrentOuterMaterial(options.watcher_directory, bundle);
  const currentOwner = reopenCurrentOwnerManifest(options.retrieval_directory, outer.manifest);
  const activation = readWatcherCurrentActivationAuthority(options.journal, outer.pointer, outer.manifest);
  const expectedPreScan = sealWatcherRecoveryRecord({
    contract_version: "gkos-watcher-pre-scan-state/1.0.0-draft.1",
    vault_id: outer.manifest.vault_id,
    active_pointer_digest: outer.pointer.pointer_digest,
    active_coherent_manifest_digest: outer.manifest.coherent_manifest_digest,
    topology_snapshot_digest: outer.topology.topology_snapshot_digest,
    configuration_digest: outer.manifest.configuration_digest,
    policy_digest: outer.manifest.policy_digest,
    effective_profile_digest: outer.manifest.effective_profile_digest,
  });
  if (stableBody(failureRetry.failed_pre_scan_state) !== stableBody(expectedPreScan)
      || stableBody(failureRetry.retry_pre_scan_state) !== stableBody(expectedPreScan)
      || stableBody(observation) !== stableBody(failureRetry.retry_observation)
      || stableBody(plan) !== stableBody(bundle.retry_plan)
      || stableBody(currentOwner) !== stableBody(bundle.current_owner_manifest)
      || stableBody(activation.current_activation_intent) !== stableBody(bundle.current_activation_intent)
      || stableBody(activation.current_activation_outcome) !== stableBody(bundle.current_activation_outcome)
      || stableBody(activation.current_active) !== stableBody(bundle.current_active)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  return Object.freeze({ bundle, observation, plan, current_owner_manifest: currentOwner, activation });
}

export type WatcherFailureRetryEpoch = Readonly<{
  failed_authority: Readonly<JsonRecord>;
  failure_index: number;
}>;

function preScanCandidates(
  handle: WatcherJournalHandle,
  watcherDirectory: WatcherDirectoryCapability,
  currentPointerInput: Readonly<JsonRecord> | null,
  requiredDigests: ReadonlySet<string>,
): readonly Readonly<JsonRecord>[] {
  const candidates: Readonly<JsonRecord>[] = [];
  if (handle.meta.anchor_coherent_manifest_digest === null
      && handle.generation.anchor_coherent_manifest_digest === null) {
    candidates.push(sealWatcherRecoveryRecord({
      contract_version: "gkos-watcher-pre-scan-state/1.0.0-draft.1", vault_id: handle.meta.vault_id,
      active_pointer_digest: null, active_coherent_manifest_digest: null, topology_snapshot_digest: null,
      configuration_digest: handle.meta.configuration_digest, policy_digest: handle.meta.policy_digest,
      effective_profile_digest: handle.meta.effective_profile_digest,
    }));
  }
  const resolved = (): boolean => {
    const digests = new Set(candidates.map((candidate) => watcherDigest(candidate)));
    return [...requiredDigests].every((digest) => digests.has(digest));
  };
  let pointer = currentPointerInput === null ? null : sealWatcherRecoveryRecord(currentPointerInput);
  if (pointer !== null && pointer.contract_version !== "gkos-watcher-active-pointer/1.0.0-draft.1") {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  const seen = new Set<string>();
  for (let depth = 0; pointer !== null && depth < 4096; depth += 1) {
    const pointerDigest = sqlString(pointer.pointer_digest);
    if (seen.has(pointerDigest)) fail("WATCHER_JOURNAL_VALUE_INVALID");
    seen.add(pointerDigest);
    const manifestFile = readWatcherFile(watcherDirectory, sqlString(pointer.coherent_manifest_file));
    const manifest = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(manifestFile));
    const topologyFile = readWatcherFile(watcherDirectory, sqlString(manifest.topology_artifact_file));
    const topology = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(topologyFile));
    if (pointer.coherent_manifest_digest !== manifest.coherent_manifest_digest
        || manifest.topology_snapshot_digest !== topology.topology_snapshot_digest
        || topologyFile.raw_sha256 !== manifest.topology_artifact_raw_sha256) fail("WATCHER_JOURNAL_VALUE_INVALID");
    candidates.push(sealWatcherRecoveryRecord({
      contract_version: "gkos-watcher-pre-scan-state/1.0.0-draft.1", vault_id: manifest.vault_id,
      active_pointer_digest: pointer.pointer_digest, active_coherent_manifest_digest: manifest.coherent_manifest_digest,
      topology_snapshot_digest: topology.topology_snapshot_digest, configuration_digest: manifest.configuration_digest,
      policy_digest: manifest.policy_digest, effective_profile_digest: manifest.effective_profile_digest,
    }));
    if (resolved()) break;
    if (pointer.prior_pointer_digest === null) break;
    const priorDigest = String(pointer.prior_pointer_digest);
    const priorFile = readWatcherFile(watcherDirectory, `watcher-pointer-${priorDigest.slice(7)}.json`);
    const prior = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(priorFile));
    if (prior.pointer_digest !== priorDigest) fail("WATCHER_JOURNAL_VALUE_INVALID");
    pointer = prior;
  }
  return candidates;
}

function resolvePreScanBody(
  authority: Readonly<JsonRecord>,
  candidates: readonly Readonly<JsonRecord>[],
): Readonly<JsonRecord> {
  const matching = candidates.filter((candidate) => watcherDigest(candidate) === authority.pre_scan_state_digest);
  if (matching.length !== 1) fail("WATCHER_JOURNAL_VALUE_INVALID");
  return matching[0];
}

function reopenOuterRetryMaterial(
  directory: WatcherDirectoryCapability,
  currentPointerInput: Readonly<JsonRecord>,
): Readonly<{
  pointer: Readonly<JsonRecord>;
  manifest: Readonly<JsonRecord>;
  topology: Readonly<JsonRecord>;
  raw_graph: Readonly<JsonRecord>;
}> {
  const pointer = readWatcherPointer(directory, "outer");
  if (pointer === null || stableBody(pointer) !== stableBody(currentPointerInput)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const manifestFile = readWatcherFile(directory, sqlString(pointer.coherent_manifest_file), { maximum_bytes: 536_870_912 });
  const manifest = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(manifestFile));
  const topologyFile = readWatcherFile(directory, sqlString(manifest.topology_artifact_file), { maximum_bytes: 536_870_912 });
  const topology = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(topologyFile));
  const graphState = manifest.graph_projection_state as Readonly<JsonRecord>;
  const graphFile = readWatcherFile(directory, sqlString(graphState.graph_artifact_file), { maximum_bytes: 536_870_912 });
  const rawGraph = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(graphFile));
  if (manifest.coherent_manifest_digest !== pointer.coherent_manifest_digest
      || manifest.service_generation_id !== pointer.service_generation_id
      || topology.topology_snapshot_digest !== manifest.topology_snapshot_digest
      || topologyFile.raw_sha256 !== manifest.topology_artifact_raw_sha256
      || rawGraph.graph_artifact_digest !== graphState.graph_artifact_digest
      || graphFile.raw_sha256 !== watcherRawDigest(watcherCanonicalBytes(rawGraph))) {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  return Object.freeze({ pointer, manifest, topology, raw_graph: rawGraph });
}

function pointerOnCurrentOuterChain(
  directory: WatcherDirectoryCapability,
  currentPointerInput: Readonly<JsonRecord> | null,
  targetDigest: string,
): Readonly<JsonRecord> {
  let pointer = currentPointerInput === null ? null : sealWatcherRecoveryRecord(currentPointerInput);
  const seen = new Set<string>();
  for (let depth = 0; pointer !== null && depth < 4096; depth += 1) {
    const digest = sqlString(pointer.pointer_digest);
    if (seen.has(digest)) fail("WATCHER_JOURNAL_VALUE_INVALID");
    seen.add(digest);
    const artifact = watcherPointerArtifact("outer", pointer);
    const file = readWatcherFile(directory, artifact.file, { maximum_bytes: 536_870_912 });
    if (!file.bytes.equals(artifact.bytes)) fail("WATCHER_JOURNAL_VALUE_INVALID");
    if (digest === targetDigest) return pointer;
    if (pointer.prior_pointer_digest === null) break;
    const priorDigest = sqlString(pointer.prior_pointer_digest);
    const priorFile = readWatcherFile(directory, `watcher-pointer-${priorDigest.slice(7)}.json`, { maximum_bytes: 536_870_912 });
    pointer = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(priorFile));
    if (pointer.pointer_digest !== priorDigest || !priorFile.bytes.equals(watcherCanonicalBytes(pointer))) {
      fail("WATCHER_JOURNAL_VALUE_INVALID");
    }
  }
  fail("WATCHER_JOURNAL_VALUE_INVALID");
}

function validateResolvedCompleteRetry(options: {
  readonly watcher_directory: WatcherDirectoryCapability;
  readonly journal: WatcherJournalHandle;
  readonly current_outer_pointer: Readonly<JsonRecord> | null;
  readonly retry_batch: Readonly<JsonRecord>;
  readonly transitions: readonly Readonly<JsonRecord>[];
}): void {
  if (options.transitions.length !== 7) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const chain = sealWatcherTransitionChain(options.transitions);
  const complete = chain.at(-1);
  if (complete === undefined || complete.contract_version !== "gkos-watcher-transition/1.0.0-draft.1"
      || complete.batch_id !== options.retry_batch.batch_id || complete.transition_ordinal !== 6
      || complete.state !== "complete" || complete.terminal_state !== "complete") fail("WATCHER_JOURNAL_VALUE_INVALID");
  const intentRows = options.journal.database.prepare(
    "SELECT body FROM activation_intents WHERE target_complete_transition_digest=?;",
  ).all(sqlString(complete.transition_digest)) as Array<{ body?: Uint8Array }>;
  if (intentRows.length !== 1) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const intent = canonicalSqlBody(intentRows[0].body).record;
  const outcomeRows = options.journal.database.prepare(
    "SELECT body FROM activation_outcomes WHERE intent_digest=?;",
  ).all(sqlString(intent.intent_digest)) as Array<{ body?: Uint8Array }>;
  if (outcomeRows.length !== 1) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const outcome = canonicalSqlBody(outcomeRows[0].body).record;
  const pointer = pointerOnCurrentOuterChain(
    options.watcher_directory,
    options.current_outer_pointer,
    sqlString(outcome.pointer_digest),
  );
  const manifestFile = readWatcherFile(options.watcher_directory, sqlString(pointer.coherent_manifest_file), { maximum_bytes: 536_870_912 });
  const manifest = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(manifestFile));
  if (intent.contract_version !== "gkos-watcher-activation-intent/1.0.0-draft.1"
      || outcome.contract_version !== "gkos-watcher-activation-outcome/1.0.0-draft.1"
      || stableBody(intent.target_complete_transition) !== stableBody(complete)
      || stableBody(intent.target_pointer) !== stableBody(pointer)
      || intent.coherent_manifest_digest !== manifest.coherent_manifest_digest
      || outcome.intent_digest !== intent.intent_digest || outcome.outcome !== "published"
      || outcome.pointer_digest !== pointer.pointer_digest
      || outcome.coherent_manifest_digest !== manifest.coherent_manifest_digest
      || pointer.coherent_manifest_digest !== manifest.coherent_manifest_digest
      || pointer.service_generation_id !== manifest.service_generation_id
      || manifest.completed_batch_id !== options.retry_batch.batch_id
      || manifest.completed_transition_digest !== complete.transition_digest
      || !manifestFile.bytes.equals(watcherCanonicalBytes(manifest))) fail("WATCHER_JOURNAL_VALUE_INVALID");
  if (options.current_outer_pointer !== null && pointer.pointer_digest === options.current_outer_pointer.pointer_digest) {
    const active = readWatcherCurrentActivationAuthority(options.journal, pointer, manifest);
    if (stableBody(active.current_activation_intent) !== stableBody(intent)
        || stableBody(active.current_activation_outcome) !== stableBody(outcome)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
}

function validateResolvedNoopRetry(options: {
  readonly watcher_directory: WatcherDirectoryCapability;
  readonly retrieval_directory: WatcherDirectoryCapability;
  readonly journal: WatcherJournalHandle;
  readonly current_outer_pointer: Readonly<JsonRecord> | null;
  readonly failure_retry_bundle: Readonly<JsonRecord>;
  readonly retry_batch: Readonly<JsonRecord>;
  readonly retry_plan_authority: Readonly<JsonRecord>;
  readonly transitions: readonly Readonly<JsonRecord>[];
}): void {
  if (options.current_outer_pointer === null || options.transitions.length !== 1) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const transition = options.transitions[0];
  if (transition.contract_version !== "gkos-watcher-failure-retry-noop-transition/1.0.0-draft.1"
      || transition.batch_id !== options.retry_batch.batch_id || transition.state !== "failure_reconciliation_noop_complete"
      || transition.terminal_state !== "complete") fail("WATCHER_JOURNAL_VALUE_INVALID");
  const rows = readFailureRetryNoopRows(options.journal, sqlString(options.retry_batch.batch_id));
  if (rows === null || stableBody(rows.batch) !== stableBody(options.retry_batch)
      || stableBody(rows.plan_authority) !== stableBody(options.retry_plan_authority)
      || stableBody(rows.transition) !== stableBody(transition)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const retryPlan = reopenWatcherArtifact(options.watcher_directory, options.retry_plan_authority, "plan");
  const outer = reopenOuterRetryMaterial(options.watcher_directory, options.current_outer_pointer);
  const activation = readWatcherCurrentActivationAuthority(options.journal, outer.pointer, outer.manifest);
  const currentOwner = reopenCurrentOwnerManifest(options.retrieval_directory, outer.manifest);
  const currentCanonical = normalizeWatcherCanonicalGkxGraph(outer.raw_graph.graph as GkxGraph);
  const currentGraphiti = deriveWatcherGraphitiProjection(outer.raw_graph.graph as GkxGraph, sqlString(outer.manifest.vault_id));
  validateWatcherFailureRetryNoopPhysicalAuthority({
    watcher_directory: options.watcher_directory,
    retrieval_directory: options.retrieval_directory,
    journal: options.journal,
    bundle: {
      failure_retry_bundle: options.failure_retry_bundle,
      retry_plan: retryPlan,
      retry_plan_authority: options.retry_plan_authority,
      retry_topology: outer.topology,
      retry_canonical_graph: currentCanonical,
      current_topology: outer.topology,
      current_outer_pointer: outer.pointer,
      current_coherent_manifest: outer.manifest,
      current_activation_intent: activation.current_activation_intent,
      current_activation_outcome: activation.current_activation_outcome,
      current_active: activation.current_active,
      current_owner_manifest: currentOwner,
      current_canonical_graph: currentCanonical,
      current_raw_graph: outer.raw_graph,
      current_graphiti_projection: currentGraphiti,
      receipt: transition.receipt,
      transition,
    },
  });
}

/**
 * Reconstruct the unique unresolved causal retry tail without UUID/time
 * ordering. Every retry edge is re-sealed through exact FailureRetryBundle9;
 * forks, orphans, cycles and a second unresolved root fail closed.
 */
export function readWatcherFailureRetryEpoch(options: {
  readonly watcher_directory: WatcherDirectoryCapability;
  readonly retrieval_directory: WatcherDirectoryCapability;
  readonly journal: WatcherJournalHandle;
  readonly current_outer_pointer: Readonly<JsonRecord> | null;
}): WatcherFailureRetryEpoch | null {
  validateWatcherJournalAuthority(options.journal.database);
  validateWatcherJournalAdoptionProjection(options.journal);
  const batches = decodeBodyRows(options.journal.database, "batches", "batch_id");
  const observations = decodeBodyRows(options.journal.database, "observations", "batch_id");
  const plans = decodeBodyRows(options.journal.database, "normalized_plans", "batch_id");
  const transitions = decodeBodyRows(options.journal.database, "transitions", "batch_id,transition_ordinal");
  const observationByBatch = new Map(observations.map((item) => [String(item.batch_id), item]));
  const planByBatch = new Map(plans.map((item) => [String(item.batch_id), item]));
  const batchById = new Map(batches.map((item) => [String(item.batch_id), item]));
  if (batchById.size !== batches.length || observationByBatch.size !== observations.length
      || planByBatch.size !== plans.length) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const transitionsByBatch = new Map<string, Readonly<JsonRecord>[]>();
  for (const transition of transitions) {
    const key = String(transition.batch_id);
    const rows = transitionsByBatch.get(key) ?? [];
    rows.push(transition); transitionsByBatch.set(key, rows);
  }
  const failed = new Map<string, Readonly<JsonRecord>>();
  for (const batch of batches) {
    const chain = transitionsByBatch.get(String(batch.batch_id)) ?? [];
    const terminal = chain.at(-1);
    if (terminal?.contract_version === "gkos-watcher-transition/1.0.0-draft.1" && terminal.terminal_state === "failed") {
      sealWatcherTransitionChain(chain);
      failed.set(String(batch.batch_id), batch);
    }
  }
  if (failed.size === 0) return null;
  const children = new Map<string, Readonly<JsonRecord>[]>();
  for (const batch of batches) {
    if (batch.retry_of_batch_id === null) continue;
    if (!failed.has(String(batch.retry_of_batch_id))) fail("WATCHER_JOURNAL_VALUE_INVALID");
    const rows = children.get(String(batch.retry_of_batch_id)) ?? [];
    rows.push(batch); children.set(String(batch.retry_of_batch_id), rows);
  }
  if ([...children.values()].some((rows) => rows.length !== 1)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const causalBatchIds = new Set<string>([
    ...failed.keys(),
    ...[...children.values()].flat().map((item) => String(item.batch_id)),
  ]);
  const requiredPreScanDigests = new Set<string>();
  for (const batchId of causalBatchIds) {
    const authority = observationByBatch.get(batchId);
    if (authority === undefined || typeof authority.pre_scan_state_digest !== "string") {
      fail("WATCHER_JOURNAL_VALUE_INVALID");
    }
    requiredPreScanDigests.add(authority.pre_scan_state_digest);
  }
  const candidates = preScanCandidates(
    options.journal, options.watcher_directory, options.current_outer_pointer, requiredPreScanDigests,
  );
  const retryIds = new Set(batches.filter((item) => item.retry_of_batch_id !== null).map((item) => String(item.batch_id)));
  const roots = [...failed.values()].filter((item) => !retryIds.has(String(item.batch_id)));
  const unresolved: Array<{ tail: Readonly<JsonRecord>; depth: number }> = [];
  const visited = new Set<string>();
  for (const root of roots) {
    let node = root;
    let depth = 0;
    const path = new Set<string>();
    for (;;) {
      const nodeId = String(node.batch_id);
      if (path.has(nodeId) || visited.has(nodeId)) fail("WATCHER_JOURNAL_VALUE_INVALID");
      path.add(nodeId); visited.add(nodeId);
      const next = children.get(nodeId)?.[0];
      if (next === undefined) { unresolved.push({ tail: node, depth }); break; }
      const failedObservationAuthority = observationByBatch.get(nodeId);
      const retryObservationAuthority = observationByBatch.get(String(next.batch_id));
      if (failedObservationAuthority === undefined || retryObservationAuthority === undefined) fail("WATCHER_JOURNAL_VALUE_INVALID");
      const failedObservation = reopenWatcherArtifact(options.watcher_directory, failedObservationAuthority, "observation");
      const retryObservation = reopenWatcherArtifact(options.watcher_directory, retryObservationAuthority, "observation");
      const failedPreScan = resolvePreScanBody(failedObservationAuthority, candidates);
      const retryPreScan = resolvePreScanBody(retryObservationAuthority, candidates);
      const failureRetry = sealWatcherFailureRetryBundle({
        failed_batch: node, failed_observation: failedObservation, failed_observation_authority: failedObservationAuthority,
        failed_pre_scan_state: failedPreScan, failed_transitions: transitionsByBatch.get(nodeId),
        retry_batch: next, retry_observation: retryObservation, retry_observation_authority: retryObservationAuthority,
        retry_pre_scan_state: retryPreScan,
      });
      if (!failed.has(String(next.batch_id))) {
        const nextId = String(next.batch_id);
        const childTransitions = Object.freeze([...(transitionsByBatch.get(nextId) ?? [])]);
        const noop = childTransitions.length === 1
          && childTransitions[0].contract_version === "gkos-watcher-failure-retry-noop-transition/1.0.0-draft.1";
        if (noop) {
          const planAuthority = planByBatch.get(nextId);
          if (planAuthority === undefined) fail("WATCHER_JOURNAL_VALUE_INVALID");
          validateResolvedNoopRetry({
            watcher_directory: options.watcher_directory,
            retrieval_directory: options.retrieval_directory,
            journal: options.journal,
            current_outer_pointer: options.current_outer_pointer,
            failure_retry_bundle: failureRetry,
            retry_batch: next,
            retry_plan_authority: planAuthority,
            transitions: childTransitions,
          });
        } else {
          validateResolvedCompleteRetry({
            watcher_directory: options.watcher_directory,
            journal: options.journal,
            current_outer_pointer: options.current_outer_pointer,
            retry_batch: next,
            transitions: childTransitions,
          });
        }
        break;
      }
      node = next; depth += 1;
    }
  }
  if (visited.size !== failed.size || unresolved.length > 1) fail("WATCHER_JOURNAL_VALUE_INVALID");
  if (unresolved.length === 0) return null;
  const tail = unresolved[0];
  const tailId = String(tail.tail.batch_id);
  const observationAuthority = observationByBatch.get(tailId);
  if (observationAuthority === undefined) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const observation = reopenWatcherArtifact(options.watcher_directory, observationAuthority, "observation");
  const preScan = resolvePreScanBody(observationAuthority, candidates);
  const currentCandidates = candidates.filter((candidate) => options.current_outer_pointer === null
    ? candidate.active_pointer_digest === null && candidate.active_coherent_manifest_digest === null
      && candidate.topology_snapshot_digest === null
    : candidate.active_pointer_digest === options.current_outer_pointer.pointer_digest);
  if (currentCandidates.length !== 1 || stableBody(preScan) !== stableBody(currentCandidates[0])) {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  return Object.freeze({
    failure_index: tail.depth,
    failed_authority: Object.freeze({ batch: tail.tail, observation, observation_authority: observationAuthority,
      pre_scan_state: preScan, transitions: Object.freeze([...(transitionsByBatch.get(tailId) ?? [])]) }),
  });
}

function auditResetOutbox(
  handle: WatcherJournalHandle,
  outerPointer: Readonly<JsonRecord>,
  outerManifest: Readonly<JsonRecord>,
  historical = false,
): ResetOutboxAudit {
  if (historical) validateHistoricalWatcherJournalAuthority(handle.database);
  else validateWatcherJournalAuthority(handle.database);
  const active = auditCurrentOrAdoptedActivationDag(handle, outerPointer, outerManifest);
  const sets = decodeBodyRows(handle.database, "source_removal_event_sets", "event_set_digest");
  const membershipRows = decodeMembershipRows(handle.database);
  const memberships = membershipRows.map((row) => row.record);
  const events = decodeBodyRows(handle.database, "source_removal_events", "event_digest");
  const occurrences = decodeBodyRows(handle.database, "source_removal_occurrences", "occurrence_digest");
  const activations = decodeBodyRows(handle.database, "activated_source_removal_event_sets", "event_set_digest");
  const responses = decodeBodyRows(handle.database, "source_removal_adapter_responses", "response_digest");
  const receipts = decodeBodyRows(handle.database, "source_removal_receipts", "receipt_digest");
  const eventByDigest = new Map(events.map((item) => [String(item.event_digest), item]));
  const occurrenceByDigest = new Map(occurrences.map((item) => [String(item.occurrence_digest), item]));
  const activationBySet = new Map(activations.map((item) => [String(item.event_set_digest), item]));
  const membershipDigestSet = new Set(memberships.map((item) => String(item.membership_digest)));
  if (eventByDigest.size !== events.length || occurrenceByDigest.size !== occurrences.length || membershipDigestSet.size !== memberships.length
      || activationBySet.size !== activations.length) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  const usedEvents = new Set<string>();
  const usedOccurrences = new Set<string>();
  const activated: JsonRecord[] = [];
  for (const eventSet of sets) {
    const members = membershipRows.filter((item) => item.event_set_digest === eventSet.event_set_digest).map((item) => item.record);
    if (members.length !== eventSet.event_count) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    const bundle = readWatcherSourceRemovalEventSetBundle(handle, String(eventSet.event_set_digest));
    if (stableBody(bundle.event_set) !== stableBody(eventSet)
        || stableBody(bundle.memberships) !== stableBody(members)) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    for (let index = 0; index < members.length; index += 1) {
      const event = (bundle.events as readonly Readonly<JsonRecord>[])[index];
      const occurrence = (bundle.occurrences as readonly Readonly<JsonRecord>[])[index];
      usedEvents.add(String(event.event_digest)); usedOccurrences.add(String(occurrence.occurrence_digest));
    }
    const activation = activationBySet.get(String(eventSet.event_set_digest));
    if (activation !== undefined) activated.push({ event_set_bundle: bundle, activation });
  }
  if (usedEvents.size !== events.length || usedOccurrences.size !== occurrences.length
      || activations.some((item) => !sets.some((set) => set.event_set_digest === item.event_set_digest))) {
    fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  }
  let bootstrap: Readonly<JsonRecord> | null = null;
  if (handle.meta.anchor_coherent_manifest_digest === null) {
    const file = readWatcherFile(handle.root, WATCHER_BOOTSTRAP_AUTHORITY_FILE);
    bootstrap = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(file));
  }
  const authority = Object.freeze({
    journal_bootstrap_authority: bootstrap,
    outer_pointer: outerPointer,
    outer_coherent_manifest: outerManifest,
    active_coherent: active,
    activated_event_set_bundles: activated,
    responses,
    receipts,
  });
  const deliveredEvents = new Set(receipts.map((item) => String(item.event_digest)));
  const referenced = new Set(memberships.map((item) => item.original_membership_digest).filter((item): item is string => typeof item === "string"));
  const terminal = membershipRows.filter((item) => !referenced.has(String(item.record.membership_digest)));
  const ready = terminal.map(({ record: membership, event_set_digest: eventSetDigest }) => {
    const event = eventByDigest.get(String(membership.event_digest));
    const occurrence = event === undefined ? undefined : occurrenceByDigest.get(String(event.occurrence_digest));
    const activation = activations.find((item) => item.event_set_digest === eventSetDigest);
    return { membership, event, occurrence, activation };
  }).filter((row): row is { membership: Readonly<JsonRecord>; event: Readonly<JsonRecord>; occurrence: Readonly<JsonRecord>; activation: Readonly<JsonRecord> } =>
    row.event !== undefined && row.occurrence !== undefined && row.activation !== undefined
      && row.event.delivery_mode === "adapter" && !deliveredEvents.has(String(row.event.event_digest))
      && row.activation.coherent_manifest_digest === outerManifest.coherent_manifest_digest)
    .map(({ membership, event, occurrence }) => ({ membership, event, occurrence }))
    .sort((left, right) => {
      const a = `${String(left.occurrence.source_path)}\u0000${String(left.occurrence.occurrence_digest)}\u0000${String(left.membership.membership_digest)}`;
      const b = `${String(right.occurrence.source_path)}\u0000${String(right.occurrence.occurrence_digest)}\u0000${String(right.membership.membership_digest)}`;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  return { authority, ready };
}

function resetCarryBundle(
  ready: ResetOutboxAudit["ready"],
  resetId: string,
  outerManifestDigest: string,
  resetAt: string,
): Readonly<JsonRecord> | null {
  if (ready.length === 0) return null;
  const memberships = ready.map((row, index) => {
    const base = {
      contract_version: "gkos-watcher-source-removal-event-membership/1.0.0-draft.1",
      event_ordinal: index + 1,
      event_digest: row.event.event_digest,
      causal_batch_id: row.membership.causal_batch_id,
      target_topology_snapshot_digest: row.membership.target_topology_snapshot_digest,
      prepared_at: row.membership.prepared_at,
      original_membership_digest: row.membership.membership_digest,
    };
    return sealWatcherRecoveryRecord({ ...base, membership_digest: watcherDigest(base) });
  });
  const sequence = watcherDigest({
    contract_version: "gkos-watcher-source-removal-membership-sequence/1.0.0-draft.1",
    membership_digests: memberships.map((item) => item.membership_digest),
  });
  const setBase = {
    contract_version: "gkos-watcher-source-removal-event-set/1.0.0-draft.1",
    set_kind: "reset_carry",
    origin_id: resetId,
    target_topology_snapshot_digest: null,
    event_count: memberships.length,
    membership_digest_sequence_digest: sequence,
    prepared_at: resetAt,
  };
  const eventSet = sealWatcherRecoveryRecord({ ...setBase, event_set_digest: watcherDigest(setBase) });
  const activationBase = {
    contract_version: "gkos-watcher-source-removal-event-set-activation/1.0.0-draft.1",
    event_set_digest: eventSet.event_set_digest,
    coherent_manifest_digest: outerManifestDigest,
    activated_at: resetAt,
  };
  const activation = sealWatcherRecoveryRecord({ ...activationBase, activation_digest: watcherDigest(activationBase) });
  return Object.freeze({
    event_set_bundle: sealSourceRemovalEventSetBundle({
      event_set: eventSet,
      memberships,
      prior_memberships: ready.map((row) => row.membership),
      events: ready.map((row) => row.event),
      prior_events: ready.map((row) => row.event),
      occurrences: ready.map((row) => row.occurrence),
      prior_occurrences: ready.map((row) => row.occurrence),
    }),
    activation,
  });
}

function stableJournalFileIdentity(
  directory: WatcherDirectoryCapability,
  leaf: "watcher-journal.sqlite" | "watcher-journal.sqlite-wal" | "watcher-journal.sqlite-shm",
  role: "database" | "wal" | "shm",
): Readonly<JsonRecord> {
  revalidateWatcherDirectory(directory);
  const path = join(directory.path, leaf);
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || (process.platform !== "win32" && (before.mode & 0o777) !== 0o600)
      || !Number.isSafeInteger(before.size) || before.size < (role === "database" ? 1 : 0)
      || before.size > (role === "database" ? 2_048_000_000 : Number.MAX_SAFE_INTEGER)) fail("WATCHER_JOURNAL_IDENTITY_INVALID");
  const descriptor = openSync(path, "r");
  const hash = createHash("sha256");
  const sameDevice = (left: number, right: number): boolean =>
    left === right || (process.platform === "win32" && (left === 0 || right === 0));
  try {
    const opened = fstatSync(descriptor);
    if (!sameDevice(opened.dev, before.dev) || opened.ino !== before.ino || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs || opened.ctimeMs !== before.ctimeMs) {
      fail("WATCHER_JOURNAL_IDENTITY_INVALID");
    }
    const chunk = Buffer.alloc(1_048_576);
    let position = 0;
    while (position < before.size) {
      const count = readSync(descriptor, chunk, 0, Math.min(chunk.length, before.size - position), position);
      if (count < 1) fail("WATCHER_JOURNAL_IDENTITY_INVALID");
      hash.update(chunk.subarray(0, count)); position += count;
    }
    const after = fstatSync(descriptor);
    const pathAfter = statSync(path);
    if (!sameDevice(after.dev, before.dev) || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
        || !sameDevice(pathAfter.dev, before.dev) || pathAfter.ino !== before.ino || pathAfter.size !== before.size) fail("WATCHER_JOURNAL_IDENTITY_INVALID");
  } finally { closeSync(descriptor); }
  revalidateWatcherDirectory(directory);
  const base = {
    contract_version: "gkos-watcher-journal-file-identity/1.0.0-draft.1",
    role,
    leaf,
    device: String(before.dev),
    inode: String(before.ino),
    mode: 384,
    byte_size: before.size,
    raw_sha256: `sha256:${hash.digest("hex")}`,
  };
  return sealWatcherRecoveryRecord({ ...base, identity_digest: watcherDigest(base) });
}

function optionalJournalFileIdentity(directory: WatcherDirectoryCapability, leaf: "watcher-journal.sqlite-wal" | "watcher-journal.sqlite-shm", role: "wal" | "shm"): Readonly<JsonRecord> | null {
  if (!watcherLeafExists(directory, leaf)) return null;
  return stableJournalFileIdentity(directory, leaf, role);
}

function resetPlanBundle(plan: Readonly<JsonRecord>): Readonly<JsonRecord> {
  return Object.freeze({
    old_meta: plan.old_meta,
    old_generation: plan.old_generation,
    old_pointer: plan.old_pointer,
    archive: plan.archive,
    reset: plan.reset,
    guard: plan.reset_guard,
    new_meta: plan.new_meta,
    new_generation: plan.new_generation,
    target_pointer: plan.target_pointer,
    reset_carry_bundle: plan.reset_carry_bundle,
  });
}

function sealResetRecoveryPlan(value: unknown): Readonly<JsonRecord> {
  const plan = sealWatcherRecoveryRecord(value);
  if (plan.contract_version !== "gkos-watcher-journal-reset-recovery-plan/1.0.0-draft.1") {
    fail("GKX_WATCHER_RESET_RECOVERY_PLAN_INVALID");
  }
  sealWatcherJournalResetBundle(resetPlanBundle(plan), plan.old_journal_authority, plan.pointer_replace_guard);
  return plan;
}

function resetRecoveryPlanRecord(input: {
  readonly lock: Readonly<JsonRecord>;
  readonly old_meta: Readonly<JsonRecord>;
  readonly old_generation: Readonly<JsonRecord>;
  readonly old_pointer: Readonly<JsonRecord>;
  readonly outer_pointer: Readonly<JsonRecord>;
  readonly outer_manifest: Readonly<JsonRecord>;
  readonly old_journal_authority: Readonly<JsonRecord>;
  readonly archive: Readonly<JsonRecord>;
  readonly reset: Readonly<JsonRecord>;
  readonly reset_guard: Readonly<JsonRecord>;
  readonly pointer_guard: Readonly<JsonRecord>;
  readonly new_meta: Readonly<JsonRecord>;
  readonly new_generation: Readonly<JsonRecord>;
  readonly target_pointer: Readonly<JsonRecord>;
  readonly reset_carry_bundle: Readonly<JsonRecord> | null;
}): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-journal-reset-recovery-plan/1.0.0-draft.1",
    watcher_host_lock: input.lock,
    old_meta: input.old_meta,
    old_generation: input.old_generation,
    old_pointer: input.old_pointer,
    outer_pointer: input.outer_pointer,
    outer_coherent_manifest: input.outer_manifest,
    old_journal_authority: input.old_journal_authority,
    archive: input.archive,
    reset: input.reset,
    reset_guard: input.reset_guard,
    pointer_replace_guard: input.pointer_guard,
    new_meta: input.new_meta,
    new_generation: input.new_generation,
    target_pointer: input.target_pointer,
    reset_carry_bundle: input.reset_carry_bundle,
  };
  return sealResetRecoveryPlan({ ...base, plan_digest: watcherDigest(base) });
}

function persistResetRecoveryPlan(
  root: WatcherDirectoryCapability,
  plan: Readonly<JsonRecord>,
  onBoundary?: (boundary: WatcherJournalResetBoundary, transitionDirectory?: WatcherDirectoryCapability) => void,
): ReturnType<typeof readWatcherFile> {
  const bytes = watcherCanonicalBytes(sealResetRecoveryPlan(plan));
  const file = ensureContentAddressedArtifact(
    root,
    WATCHER_RESET_RECOVERY_PLAN_STAGE_FILE,
    WATCHER_RESET_RECOVERY_PLAN_FILE,
    bytes,
    "GKX_WATCHER_RESET_RECOVERY_PLAN_INVALID",
    () => onBoundary?.("plan_stage"),
    536_870_912,
    (boundary, transitionDirectory) => onBoundary?.(
      `plan_stage_${boundary}` as WatcherJournalResetBoundary,
      transitionDirectory,
    ),
  );
  if (!file.bytes.equals(bytes)) fail("GKX_WATCHER_RESET_RECOVERY_PLAN_INVALID");
  onBoundary?.("plan");
  return file;
}

function resetRecoveryNamespaceSnapshot(
  watcherRoot: WatcherDirectoryCapability,
  journalRoot: WatcherDirectoryCapability,
): string {
  const rows = (root: WatcherDirectoryCapability): readonly Readonly<JsonRecord>[] => {
    revalidateWatcherDirectory(root);
    return Object.freeze(listWatcherLeaves(root).map((leaf) => {
      const state = lstatSync(join(root.path, leaf));
      return Object.freeze({
        leaf,
        device: String(state.dev),
        inode: String(state.ino),
        mode: Number(state.mode),
        nlink: Number(state.nlink),
        byte_size: Number(state.size),
        modified_ms: Number(state.mtimeMs),
        changed_ms: Number(state.ctimeMs),
      });
    }));
  };
  return stableJson({
    watcher_root: watcherRoot.identity,
    watcher_rows: rows(watcherRoot),
    journal_root: journalRoot.identity,
    journal_rows: rows(journalRoot),
  });
}

function assertResetIncompleteCleanupAuthority(options: {
  readonly watcher_root: WatcherDirectoryCapability;
  readonly journal_root: WatcherDirectoryCapability;
  readonly expected_plan?: Readonly<JsonRecord>;
  readonly revalidate_namespace?: () => void;
}): void {
  assertResetControlledNamespace(options.watcher_root, options.journal_root);
  options.revalidate_namespace?.();
  const before = resetRecoveryNamespaceSnapshot(options.watcher_root, options.journal_root);
  const first = readHostLock(options.watcher_root);
  if (first === null || first.lock.operation !== "journal_reset") {
    fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  }
  if (options.expected_plan === undefined) {
    const outer = readWatcherPointer(options.watcher_root, "outer");
    const journal = readWatcherPointer(options.journal_root, "journal");
    if (outer === null || journal === null
        || outer.pointer_digest !== first.lock.prior_pointer_digest
        || outer.coherent_manifest_digest !== first.lock.prior_coherent_manifest_digest
        || journal.pointer_digest !== first.lock.prior_journal_pointer_digest) {
      fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
    }
  } else {
    const plan = sealResetRecoveryPlan(options.expected_plan);
    const original = sealHostLock(plan.watcher_host_lock as JsonRecord);
    const outer = readWatcherPointer(options.watcher_root, "outer");
    const journal = readWatcherPointer(options.journal_root, "journal");
    if (first.lock.lock_digest !== original.lock_digest || outer === null || journal === null
        || stableBody(outer) !== stableBody(plan.outer_pointer)
        || ![stableBody(plan.old_pointer), stableBody(plan.target_pointer)].includes(stableBody(journal))) {
      fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
    }
  }
  if (processIsAlive(Number(first.lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  options.revalidate_namespace?.();
  const middle = resetRecoveryNamespaceSnapshot(options.watcher_root, options.journal_root);
  const second = readHostLock(options.watcher_root);
  if (before !== middle || second === null || second.raw_sha256 !== first.raw_sha256
      || second.lock.lock_digest !== first.lock.lock_digest) fail("GKX_WATCHER_HOST_LOCK_CHANGED");
  if (processIsAlive(Number(second.lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  options.revalidate_namespace?.();
  const after = resetRecoveryNamespaceSnapshot(options.watcher_root, options.journal_root);
  if (after !== before) fail("GKX_WATCHER_HOST_LOCK_CHANGED");
}

function readResetRecoveryPlan(
  root: WatcherDirectoryCapability,
  authorizeIncompleteCleanup?: () => void,
): {
  readonly plan: Readonly<JsonRecord>;
  readonly file: ReturnType<typeof readWatcherFile>;
} | null {
  const hasStage = watcherLeafExists(root, WATCHER_RESET_RECOVERY_PLAN_STAGE_FILE);
  const hasFinal = watcherLeafExists(root, WATCHER_RESET_RECOVERY_PLAN_FILE);
  if (!hasStage && !hasFinal) return null;
  const discardIsolatedIncompleteStage = (): null => {
    // The Plan is the first durable reset authority.  An incomplete stage can
    // be abandoned only while no later reset namespace exists; otherwise its
    // body may be the missing parent of already-durable evidence.
    if (authorizeIncompleteCleanup === undefined) fail("GKX_WATCHER_RESET_RECOVERY_PLAN_INVALID");
    authorizeIncompleteCleanup();
    if (watcherLeafExists(root, WATCHER_RESET_RECOVERY_PLAN_FILE)
        || watcherLeafExists(root, WATCHER_RESET_GUARD_FILE)
        || watcherLeafExists(root, WATCHER_RESET_GUARD_STAGE_FILE)
        || resetPointerSidecarsPresent(root)) {
      fail("GKX_WATCHER_RESET_RECOVERY_PLAN_INVALID");
    }
    const linked = lstatSync(join(root.path, WATCHER_RESET_RECOVERY_PLAN_STAGE_FILE));
    if (linked.size > 536_870_912) fail("GKX_WATCHER_RESET_RECOVERY_PLAN_INVALID");
    discardIncompleteWatcherLeaf(root, WATCHER_RESET_RECOVERY_PLAN_STAGE_FILE);
    return null;
  };
  let source;
  try {
    if (hasFinal) source = readWatcherFile(root, WATCHER_RESET_RECOVERY_PLAN_FILE, { maximum_bytes: 536_870_912 });
    else source = readWatcherFile(root, WATCHER_RESET_RECOVERY_PLAN_STAGE_FILE, { maximum_bytes: 536_870_912 });
  } catch (error) {
    if (!hasFinal) return discardIsolatedIncompleteStage();
    throw error;
  }
  let parsed: JsonRecord;
  try { parsed = parseCanonicalWatcherJson(source); }
  catch (error) {
    if (!hasFinal) return discardIsolatedIncompleteStage();
    throw error;
  }
  // Once canonical JSON exists, a record/key/relation mismatch is evidence,
  // never an "incomplete" file eligible for deletion.
  const plan = sealResetRecoveryPlan(parsed);
  const file = persistResetRecoveryPlan(root, plan);
  return Object.freeze({ plan, file });
}

function sealResetRecoveryBridge(value: JsonRecord): Readonly<JsonRecord> {
  const bridge = sealPrivateRecord(value, "gkos-watcher-journal-reset-recovery-bridge/1.0.0-draft.1", [
    "contract_version", "kind", "recovery_plan_file", "recovery_plan", "recovery_plan_digest",
    "recovery_plan_raw_sha256", "recovery_plan_byte_size", "root_recovery_claim_file", "root_recovery_claim",
    "root_recovery_claim_raw_sha256", "root_recovery_claim_byte_size", "original_reset_host_lock_digest",
    "executor_attempt_limit", "bridge_digest",
  ], "bridge_digest");
  const plan = sealResetRecoveryPlan(bridge.recovery_plan);
  const lock = sealHostLock(plan.watcher_host_lock as JsonRecord);
  const claimGroup = [bridge.root_recovery_claim_file, bridge.root_recovery_claim,
    bridge.root_recovery_claim_raw_sha256, bridge.root_recovery_claim_byte_size];
  const claimAbsent = claimGroup.every((item) => item === null);
  let claim: Readonly<JsonRecord> | null = null;
  if (!claimAbsent) {
    if (bridge.root_recovery_claim_file !== WATCHER_HOST_LOCK_RECOVERY_FILE
        || typeof bridge.root_recovery_claim !== "object" || bridge.root_recovery_claim === null
        || typeof bridge.root_recovery_claim_raw_sha256 !== "string"
        || !/^sha256:[0-9a-f]{64}$/u.test(bridge.root_recovery_claim_raw_sha256)
        || !Number.isSafeInteger(bridge.root_recovery_claim_byte_size)
        || Number(bridge.root_recovery_claim_byte_size) < 1 || Number(bridge.root_recovery_claim_byte_size) > 1_048_576) {
      fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
    }
    claim = sealHostLockRecoveryClaim(bridge.root_recovery_claim as JsonRecord);
  }
  if (bridge.recovery_plan_file !== WATCHER_RESET_RECOVERY_PLAN_FILE
      || bridge.recovery_plan_digest !== plan.plan_digest
      || typeof bridge.recovery_plan_raw_sha256 !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(bridge.recovery_plan_raw_sha256)
      || !Number.isSafeInteger(bridge.recovery_plan_byte_size) || Number(bridge.recovery_plan_byte_size) < 1
      || Number(bridge.recovery_plan_byte_size) > 536_870_912
      || bridge.original_reset_host_lock_digest !== lock.lock_digest || bridge.executor_attempt_limit !== 4096
      || (bridge.kind === "journal_reset_recovery") !== (claim !== null)
      || (bridge.kind === "journal_reset_live_cleanup") !== claimAbsent
      || bridge.kind !== "journal_reset_recovery" && bridge.kind !== "journal_reset_live_cleanup"
      || claim !== null && (claim.observed_lock_digest !== lock.lock_digest || claim.observed_process_id !== lock.process_id)) {
    fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
  }
  return bridge;
}

function resetRecoveryBridgeRecord(input: {
  readonly kind: "journal_reset_recovery" | "journal_reset_live_cleanup";
  readonly plan_entry: NonNullable<ReturnType<typeof readResetRecoveryPlan>>;
  readonly claim_entry: ReturnType<typeof readRecoveryClaim>;
}): Readonly<JsonRecord> {
  const plan = input.plan_entry.plan;
  const lock = sealHostLock(plan.watcher_host_lock as JsonRecord);
  if ((input.kind === "journal_reset_recovery") !== (input.claim_entry !== null)) {
    fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
  }
  const claimBytes = input.claim_entry === null ? null : watcherCanonicalBytes(input.claim_entry.claim);
  const base = {
    contract_version: "gkos-watcher-journal-reset-recovery-bridge/1.0.0-draft.1",
    kind: input.kind,
    recovery_plan_file: WATCHER_RESET_RECOVERY_PLAN_FILE,
    recovery_plan: plan,
    recovery_plan_digest: plan.plan_digest,
    recovery_plan_raw_sha256: input.plan_entry.file.raw_sha256,
    recovery_plan_byte_size: input.plan_entry.file.bytes.byteLength,
    root_recovery_claim_file: input.claim_entry === null ? null : WATCHER_HOST_LOCK_RECOVERY_FILE,
    root_recovery_claim: input.claim_entry?.claim ?? null,
    root_recovery_claim_raw_sha256: input.claim_entry?.raw_sha256 ?? null,
    root_recovery_claim_byte_size: claimBytes?.byteLength ?? null,
    original_reset_host_lock_digest: lock.lock_digest,
    executor_attempt_limit: 4096,
  };
  return sealResetRecoveryBridge({ ...base, bridge_digest: watcherDigest(base) });
}

function resetRecoveryBridgeLeaf(digest: string): string {
  return `watcher-journal-reset-recovery-bridge-${digest.slice("sha256:".length)}.json`;
}

function resetRecoveryBridgeStageLeaf(digest: string): string {
  return `.watcher-journal-reset-recovery-bridge-${digest.slice("sha256:".length)}.json.gkos-watcher.stage`;
}

function persistResetRecoveryBridge(
  watcherRoot: WatcherDirectoryCapability,
  bridge: Readonly<JsonRecord>,
  onBoundary?: (boundary: WatcherJournalResetBoundary) => void,
): Readonly<JsonRecord> {
  const sealed = sealResetRecoveryBridge(bridge as JsonRecord);
  const bytes = watcherCanonicalBytes(sealed);
  const digest = String(sealed.bridge_digest);
  const file = ensureContentAddressedArtifact(
    watcherRoot, resetRecoveryBridgeStageLeaf(digest), resetRecoveryBridgeLeaf(digest), bytes,
    "GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID", () => onBoundary?.("bridge_stage"), 1_073_741_824,
    (boundary) => onBoundary?.(`bridge_stage_${boundary}` as WatcherJournalResetBoundary),
  );
  const reopened = sealResetRecoveryBridge(parseCanonicalWatcherJson(file));
  if (reopened.bridge_digest !== digest || !file.bytes.equals(bytes)) fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
  onBoundary?.("bridge");
  return reopened;
}

function readResetRecoveryBridge(
  watcherRoot: WatcherDirectoryCapability,
  plan: Readonly<JsonRecord>,
  authorizeIncompleteCleanup?: () => void,
): Readonly<JsonRecord> | null {
  const allLeaves = listWatcherLeaves(watcherRoot);
  const stageLeaves = allLeaves
    .filter((leaf) => /^\.watcher-journal-reset-recovery-bridge-[0-9a-f]{64}\.json\.gkos-watcher\.stage$/u.test(leaf));
  if (stageLeaves.length > 1) fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
  const leaves = allLeaves
    .filter((leaf) => /^watcher-journal-reset-recovery-bridge-[0-9a-f]{64}\.json$/u.test(leaf));
  if (leaves.length > 4096) fail("WATCHER_JOURNAL_RECOVERY_REQUIRED");
  const matches: Readonly<JsonRecord>[] = [];
  for (const leaf of leaves) {
    const file = readWatcherFile(watcherRoot, leaf, { maximum_bytes: 1_073_741_824 });
    const bridge = sealResetRecoveryBridge(parseCanonicalWatcherJson(file));
    if (leaf !== resetRecoveryBridgeLeaf(String(bridge.bridge_digest))) fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
    if ((bridge.recovery_plan as JsonRecord).plan_digest === plan.plan_digest) matches.push(bridge);
  }
  if (matches.length > 1) fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
  if (stageLeaves.length === 1) {
    const stageLeaf = stageLeaves[0];
    const discardIncompleteStage = (): null => {
      if (authorizeIncompleteCleanup === undefined) fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
      authorizeIncompleteCleanup();
      if (lstatSync(join(watcherRoot.path, stageLeaf)).size > 1_073_741_824) {
        fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
      }
      discardIncompleteWatcherLeaf(watcherRoot, stageLeaf);
      return null;
    };
    const encodedDigest = `sha256:${stageLeaf.slice(
      ".watcher-journal-reset-recovery-bridge-".length,
      -".json.gkos-watcher.stage".length,
    )}`;
    const committed = matches[0];
    if (committed !== undefined) {
      if (committed.bridge_digest !== encodedDigest) fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
      return persistResetRecoveryBridge(watcherRoot, committed);
    }
    let stage;
    try { stage = readWatcherFileWithLinks(watcherRoot, stageLeaf, 1_073_741_824); }
    catch {
      // A Bridge stage is deterministic from the complete Plan/claim.  With
      // no final for this Plan, an owner-private single-link sub-write is inert
      // and may be discarded; identity, mode, link or alias ambiguity is
      // rejected by the discard primitive itself.
      return discardIncompleteStage();
    }
    let parsed: JsonRecord;
    try { parsed = parseCanonicalWatcherJson(stage); }
    catch {
      return discardIncompleteStage();
    }
    const stagedBridge = sealResetRecoveryBridge(parsed);
    if (stageLeaves[0] !== resetRecoveryBridgeStageLeaf(String(stagedBridge.bridge_digest))
        || (stagedBridge.recovery_plan as JsonRecord).plan_digest !== plan.plan_digest) {
      fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
    }
    return persistResetRecoveryBridge(watcherRoot, stagedBridge);
  }
  return matches[0] ?? null;
}

function sealResetRecoveryExecutor(value: JsonRecord): Readonly<JsonRecord> {
  const executor = sealPrivateRecord(value, "gkos-watcher-journal-reset-recovery-executor/1.0.0-draft.1", [
    "contract_version", "executor_id", "bridge_digest", "executor_ordinal", "prior_executor_digest", "process_id",
    "recovery_instance_id", "owner_nonce", "created_at", "executor_digest",
  ], "executor_digest");
  const uuid7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
  if (typeof executor.executor_id !== "string" || !uuid7.test(executor.executor_id)
      || typeof executor.bridge_digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(executor.bridge_digest)
      || !Number.isSafeInteger(executor.executor_ordinal) || Number(executor.executor_ordinal) < 0 || Number(executor.executor_ordinal) > 4095
      || (Number(executor.executor_ordinal) === 0) !== (executor.prior_executor_digest === null)
      || executor.prior_executor_digest !== null && (typeof executor.prior_executor_digest !== "string"
        || !/^sha256:[0-9a-f]{64}$/u.test(executor.prior_executor_digest))
      || !Number.isSafeInteger(executor.process_id) || Number(executor.process_id) <= 0
      || typeof executor.recovery_instance_id !== "string" || !uuid7.test(executor.recovery_instance_id)
      || typeof executor.owner_nonce !== "string" || !/^[0-9a-f]{32}$/u.test(executor.owner_nonce)
      || typeof executor.created_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(executor.created_at)
      || Number.isNaN(Date.parse(executor.created_at)) || new Date(Date.parse(executor.created_at)).toISOString() !== executor.created_at) {
    fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
  }
  return executor;
}

function resetExecutorArtifactFile(digest: string): string {
  return `watcher-journal-reset-recovery-executor-${digest.slice("sha256:".length)}.json`;
}

function readResetExecutorChain(
  watcherRoot: WatcherDirectoryCapability,
  bridge: Readonly<JsonRecord>,
): readonly { readonly record: Readonly<JsonRecord>; readonly file: ReturnType<typeof readWatcherFile> }[] {
  const rows = listWatcherLeaves(watcherRoot)
    .filter((leaf) => /^watcher-journal-reset-recovery-executor-[0-9a-f]{64}\.json$/u.test(leaf))
    .map((leaf) => {
      const file = readWatcherFileWithLinks(watcherRoot, leaf);
      const record = sealResetRecoveryExecutor(parseCanonicalWatcherJson(file));
      if (leaf !== resetExecutorArtifactFile(String(record.executor_digest))) {
        fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
      }
      return { record, file };
    })
    .filter((row) => row.record.bridge_digest === bridge.bridge_digest)
    .sort((left, right) => Number(left.record.executor_ordinal) - Number(right.record.executor_ordinal));
  if (rows.length > Number(bridge.executor_attempt_limit)) fail("WATCHER_JOURNAL_RECOVERY_REQUIRED");
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].record.executor_ordinal !== index
        || rows[index].record.prior_executor_digest !== (index === 0 ? null : rows[index - 1].record.executor_digest)) {
      fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
    }
  }
  return Object.freeze(rows);
}

function readSelectedResetExecutor(
  watcherRoot: WatcherDirectoryCapability,
  bridge: Readonly<JsonRecord>,
): { readonly record: Readonly<JsonRecord>; readonly file: ReturnType<typeof readWatcherFile> } | null {
  if (!watcherLeafExists(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_FILE)) return null;
  const file = readWatcherFileWithLinks(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_FILE);
  const record = sealResetRecoveryExecutor(parseCanonicalWatcherJson(file));
  if (record.bridge_digest !== bridge.bridge_digest) fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
  const artifact = readWatcherFileWithLinks(watcherRoot, resetExecutorArtifactFile(String(record.executor_digest)));
  if (artifact.identity.device !== file.identity.device || artifact.identity.inode !== file.identity.inode
      || file.identity.nlink !== 2 || artifact.identity.nlink !== 2
      || !artifact.bytes.equals(file.bytes)) fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
  return Object.freeze({ record, file });
}

function resetExecutorRecord(
  bridge: Readonly<JsonRecord>,
  prior: Readonly<JsonRecord> | null,
  initialOwnerNonce?: string,
): Readonly<JsonRecord> {
  const ordinal = prior === null ? 0 : Number(prior.executor_ordinal) + 1;
  if (ordinal >= Number(bridge.executor_attempt_limit)) fail("WATCHER_JOURNAL_RECOVERY_REQUIRED");
  const base = {
    contract_version: "gkos-watcher-journal-reset-recovery-executor/1.0.0-draft.1",
    executor_id: watcherUuid7(), bridge_digest: bridge.bridge_digest, executor_ordinal: ordinal,
    prior_executor_digest: prior?.executor_digest ?? null, process_id: process.pid,
    recovery_instance_id: watcherUuid7(), owner_nonce: initialOwnerNonce ?? randomBytes(16).toString("hex"),
    created_at: watcherTimestamp(),
  };
  return sealResetRecoveryExecutor({ ...base, executor_digest: watcherDigest(base) });
}

function finishResetExecutorStage(watcherRoot: WatcherDirectoryCapability, bridge: Readonly<JsonRecord>): void {
  if (!watcherLeafExists(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_STAGE_FILE)) return;
  const discardIfRecoverablyIncomplete = (): void => {
    if (!watcherLeafExists(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_FILE)
        && readResetExecutorChain(watcherRoot, bridge).length !== 0) {
      fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
    }
    if (lstatSync(join(watcherRoot.path, WATCHER_RESET_RECOVERY_EXECUTOR_STAGE_FILE)).size > 1_048_576) {
      fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
    }
    discardIncompleteWatcherLeaf(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_STAGE_FILE);
  };
  let stage;
  try { stage = readWatcherFileWithLinks(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_STAGE_FILE); }
  catch {
    discardIfRecoverablyIncomplete();
    return;
  }
  let parsed: JsonRecord;
  try { parsed = parseCanonicalWatcherJson(stage); }
  catch {
    discardIfRecoverablyIncomplete();
    return;
  }
  // Canonical complete but invalid executor bytes are evidence and fail closed.
  const next = sealResetRecoveryExecutor(parsed);
  if (next.bridge_digest !== bridge.bridge_digest) fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
  const chain = readResetExecutorChain(watcherRoot, bridge);
  const prior = Number(next.executor_ordinal) === 0 ? null
    : chain.find((row) => row.record.executor_digest === next.prior_executor_digest) ?? null;
  if ((Number(next.executor_ordinal) === 0) !== (prior === null)
      || Number(next.executor_ordinal) !== (prior === null ? 0 : Number(prior.record.executor_ordinal) + 1)) {
    fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
  }
  const immutableLeaf = resetExecutorArtifactFile(String(next.executor_digest));
  if (!watcherLeafExists(watcherRoot, immutableLeaf)) {
    if (stage.identity.nlink !== 1) fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
    hardlinkWatcherLeafNoReplace(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_STAGE_FILE, immutableLeaf);
  }
  const current = readSelectedResetExecutor(watcherRoot, bridge);
  if (current !== null && current.record.executor_digest !== next.executor_digest) {
    if (next.prior_executor_digest !== current.record.executor_digest || processIsAlive(Number(current.record.process_id))) {
      fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
    }
    revalidateWatcherDirectory(watcherRoot);
    if (processIsAlive(Number(current.record.process_id))) fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
    unlinkWatcherLeaf(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_FILE, {
      allowed_links: 2, expected_raw_sha256: current.file.raw_sha256,
    });
  }
  if (!watcherLeafExists(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_FILE)) {
    hardlinkWatcherLeafNoReplace(watcherRoot, immutableLeaf, WATCHER_RESET_RECOVERY_EXECUTOR_FILE, { resulting_links: 3 });
  }
  const staged = readWatcherFile(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_STAGE_FILE, { allowed_links: 3 });
  unlinkWatcherLeaf(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_STAGE_FILE, {
    allowed_links: 3, expected_raw_sha256: staged.raw_sha256,
  });
}

function selectResetRecoveryExecutor(
  watcherRoot: WatcherDirectoryCapability,
  bridge: Readonly<JsonRecord>,
  initialOwnerNonce?: string,
  onBoundary?: (boundary: WatcherJournalResetBoundary) => void,
): Readonly<JsonRecord> {
  finishResetExecutorStage(watcherRoot, bridge);
  let current = readSelectedResetExecutor(watcherRoot, bridge);
  if (current !== null && current.record.process_id === process.pid) return current.record;
  if (current !== null && processIsAlive(Number(current.record.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  if (current !== null) {
    revalidateWatcherDirectory(watcherRoot);
    if (processIsAlive(Number(current.record.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  }
  const chain = readResetExecutorChain(watcherRoot, bridge);
  const prior = chain.length === 0 ? null : chain[chain.length - 1].record;
  const next = resetExecutorRecord(bridge, prior, prior === null ? initialOwnerNonce : undefined);
  writeNewWatcherFile(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_STAGE_FILE, watcherCanonicalBytes(next), 1_048_576, {
    on_boundary(boundary) { onBoundary?.(`executor_stage_${boundary}` as WatcherJournalResetBoundary); },
  });
  onBoundary?.("executor_stage");
  finishResetExecutorStage(watcherRoot, bridge);
  current = readSelectedResetExecutor(watcherRoot, bridge);
  if (current === null || current.record.executor_digest !== next.executor_digest) {
    fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
  }
  onBoundary?.("executor");
  return current.record;
}

function resetHostLockForExecutor(
  executor: Readonly<JsonRecord>,
  plan: Readonly<JsonRecord>,
  journalPointerDigest: string,
): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-host-lock/1.0.0-draft.1", lock_id: watcherUuid7(), process_id: executor.process_id,
    operation: "journal_reset", service_instance_id: null, prior_pointer_digest: (plan.outer_pointer as JsonRecord).pointer_digest,
    prior_coherent_manifest_digest: (plan.outer_coherent_manifest as JsonRecord).coherent_manifest_digest,
    prior_journal_pointer_digest: journalPointerDigest, owner_nonce: executor.owner_nonce, created_at: watcherTimestamp(),
  };
  return sealHostLock({ ...base, lock_digest: watcherDigest(base) });
}

function resetLockMatchesExecutor(
  lock: Readonly<JsonRecord>,
  executor: Readonly<JsonRecord>,
  plan: Readonly<JsonRecord>,
  pointerDigest: string,
): boolean {
  return lock.operation === "journal_reset" && lock.service_instance_id === null
    && lock.process_id === executor.process_id && lock.owner_nonce === executor.owner_nonce
    && lock.prior_pointer_digest === (plan.outer_pointer as JsonRecord).pointer_digest
    && lock.prior_coherent_manifest_digest === (plan.outer_coherent_manifest as JsonRecord).coherent_manifest_digest
    && lock.prior_journal_pointer_digest === pointerDigest;
}

function persistResetGuard(
  root: WatcherDirectoryCapability,
  guard: Readonly<JsonRecord>,
  onBoundary?: (boundary: WatcherJournalResetBoundary) => void,
): Buffer {
  const bytes = watcherCanonicalBytes(guard);
  ensureContentAddressedArtifact(
    root, WATCHER_RESET_GUARD_STAGE_FILE, WATCHER_RESET_GUARD_FILE, bytes,
    "GKX_WATCHER_RESET_GUARD_INVALID", () => onBoundary?.("reset_guard_stage"),
  );
  onBoundary?.("reset_guard");
  return bytes;
}

function seedResetDatabase(
  handle: WatcherJournalHandle,
  reset: Readonly<JsonRecord>,
  carry: Readonly<JsonRecord> | null,
  onBoundary?: (boundary: "database_seed_commit" | "database_seed_checkpoint") => void,
): void {
  const resetBody = sealedBody(reset);
  const bundle = carry === null ? null : sealSourceRemovalEventSetBundle(carry.event_set_bundle);
  const activation = carry === null ? null : sealedBody(carry.activation);
  const bodies = [resetBody, ...(bundle === null ? [] : [
    sealedBody(bundle.event_set), ...(bundle.occurrences as readonly unknown[]).map(sealedBody),
    ...(bundle.events as readonly unknown[]).map(sealedBody), ...(bundle.memberships as readonly unknown[]).map(sealedBody), activation!,
  ])];
  watcherJournalTransaction(handle, {
    blob_bytes: bodies.reduce((sum, item) => sum + item.bytes.byteLength, 0),
    mutated_rows: bodies.length,
    run(database) {
      database.prepare("INSERT INTO journal_resets(reset_digest,prior_journal_generation_digest,new_journal_generation_digest,body) VALUES(?,?,?,?);")
        .run(sqlString(resetBody.record.reset_digest), sqlString(resetBody.record.prior_journal_generation_digest), sqlString(resetBody.record.new_journal_generation_digest), resetBody.bytes);
      if (bundle === null || activation === null) return;
      const eventSet = sealedBody(bundle.event_set);
      database.prepare("INSERT INTO source_removal_event_sets(event_set_digest,set_kind,origin_id,target_topology_snapshot_digest,event_count,membership_digest_sequence_digest,body) VALUES(?,?,?,?,?,?,?);")
        .run(sqlString(eventSet.record.event_set_digest), sqlString(eventSet.record.set_kind), sqlString(eventSet.record.origin_id), null,
          sqlInteger(eventSet.record.event_count), sqlString(eventSet.record.membership_digest_sequence_digest), eventSet.bytes);
      const occurrenceStatement = database.prepare("INSERT INTO source_removal_occurrences(occurrence_digest,source_id,source_path,source_digest,prior_coherent_manifest_digest,prior_topology_snapshot_digest,body) VALUES(?,?,?,?,?,?,?);");
      const eventStatement = database.prepare("INSERT INTO source_removal_events(event_digest,occurrence_digest,adapter_binding_digest,delivery_mode,body) VALUES(?,?,?,?,?);");
      const memberStatement = database.prepare("INSERT INTO source_removal_event_set_members(event_set_digest,event_ordinal,membership_digest,event_digest,original_membership_digest,body) VALUES(?,?,?,?,?,?);");
      for (let index = 0; index < (bundle.memberships as readonly unknown[]).length; index += 1) {
        const occurrence = sealedBody((bundle.occurrences as readonly unknown[])[index]);
        const event = sealedBody((bundle.events as readonly unknown[])[index]);
        const membership = sealedBody((bundle.memberships as readonly unknown[])[index]);
        occurrenceStatement.run(sqlString(occurrence.record.occurrence_digest), sqlString(occurrence.record.source_id), sqlString(occurrence.record.source_path), sqlString(occurrence.record.source_digest),
          sqlString(occurrence.record.prior_coherent_manifest_digest), sqlString(occurrence.record.prior_topology_snapshot_digest), occurrence.bytes);
        eventStatement.run(sqlString(event.record.event_digest), sqlString(event.record.occurrence_digest), sqlNullableString(event.record.adapter_binding_digest), sqlString(event.record.delivery_mode), event.bytes);
        memberStatement.run(sqlString(eventSet.record.event_set_digest), sqlInteger(membership.record.event_ordinal), sqlString(membership.record.membership_digest),
          sqlString(membership.record.event_digest), sqlNullableString(membership.record.original_membership_digest), membership.bytes);
      }
      database.prepare("INSERT INTO activated_source_removal_event_sets(event_set_digest,coherent_manifest_digest,activated_at,activation_digest,body) VALUES(?,?,?,?,?);")
        .run(sqlString(activation.record.event_set_digest), sqlString(activation.record.coherent_manifest_digest), sqlString(activation.record.activated_at), sqlString(activation.record.activation_digest), activation.bytes);
    },
    after_commit() { onBoundary?.("database_seed_commit"); },
    after_checkpoint() { onBoundary?.("database_seed_checkpoint"); },
  });
}

function resetTargetLaterEvidence(root: WatcherDirectoryCapability, plan: Readonly<JsonRecord>): boolean {
  const pointer = plan.target_pointer as JsonRecord;
  const generationFile = String(pointer.journal_generation_file);
  const pointerFile = `watcher-journal-pointer-${String(pointer.pointer_digest).slice("sha256:".length)}.json`;
  const sidecars = [
    generationFile, pointerFile, ".watcher-journal-active.json.gkos-watcher.guard",
    ".watcher-journal-active.json.gkos-watcher.guard-stage", ".watcher-journal-active.json.gkos-watcher.tmp",
  ];
  if (sidecars.some((leaf) => watcherLeafExists(root, leaf))) return true;
  if (!watcherLeafExists(root, "watcher-journal-active.json")) return false;
  const fixed = readWatcherFile(root, "watcher-journal-active.json");
  return fixed.bytes.equals(watcherCanonicalBytes(pointer));
}

function canonicalTruncatedSqliteHeader(bytes: Buffer): boolean {
  if (bytes.byteLength < 100 || bytes.byteLength >= 4096) return false;
  const magic = Buffer.from("SQLite format 3\u0000", "binary");
  if (!bytes.subarray(0, 16).equals(magic) || bytes.readUInt16BE(16) !== 4096
      || bytes[18] !== 2 || bytes[19] !== 2 || bytes[20] !== 0
      || bytes[21] !== 64 || bytes[22] !== 32 || bytes[23] !== 32) return false;
  const zeroOr = (offset: number, admitted: readonly number[]): boolean => {
    if (offset + 4 > bytes.byteLength) return true;
    return admitted.includes(bytes.readUInt32BE(offset));
  };
  return zeroOr(44, [0, 1, 4]) && zeroOr(56, [0, 1]) && zeroOr(60, [0, 1])
    && zeroOr(68, [0]) && zeroOr(92, [0, 1]);
}

function removeResetTargetChild(child: WatcherDirectoryCapability, root: WatcherDirectoryCapability): void {
  const leaves = listWatcherLeaves(child);
  const admitted = new Set([WATCHER_JOURNAL_DATABASE_FILE, "watcher-journal.sqlite-wal", "watcher-journal.sqlite-shm"]);
  if (leaves.some((leaf) => !admitted.has(leaf))) fail("WATCHER_JOURNAL_IDENTITY_INVALID");
  for (const leaf of ["watcher-journal.sqlite-wal", "watcher-journal.sqlite-shm", WATCHER_JOURNAL_DATABASE_FILE]) {
    if (watcherLeafExists(child, leaf)) discardIncompleteWatcherLeaf(child, leaf);
  }
  if (listWatcherLeaves(child).length !== 0) fail("WATCHER_JOURNAL_IDENTITY_INVALID");
  removeEmptyWatcherDirectory(child, root);
}

function validateResetTargetRows(handle: WatcherJournalHandle, plan: Readonly<JsonRecord>): "unseeded" | "seeded" {
  validateWatcherJournalAuthority(handle.database);
  const metaRows = handle.database.prepare("SELECT journal_instance_id,meta_digest,body FROM watcher_meta;").all() as Array<Record<string, unknown>>;
  const expectedMeta = sealedBody(plan.new_meta);
  if (metaRows.length !== 1 || metaRows[0].journal_instance_id !== expectedMeta.record.journal_instance_id
      || metaRows[0].meta_digest !== expectedMeta.record.meta_digest || !(metaRows[0].body instanceof Uint8Array)
      || !Buffer.from(metaRows[0].body as Uint8Array).equals(expectedMeta.bytes)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  for (const table of [
    "batches", "observations", "normalized_plans", "transitions", "activation_intents", "activation_outcomes",
    "active_coherent", "source_removal_adapter_responses", "source_removal_receipts",
  ]) if (journalTableCount(handle, table) !== 0) fail("WATCHER_JOURNAL_VALUE_INVALID");

  const resets = decodeBodyRows(handle.database, "journal_resets", "reset_digest");
  const sourceCounts = [
    "source_removal_occurrences", "source_removal_events", "source_removal_event_sets",
    "source_removal_event_set_members", "activated_source_removal_event_sets",
  ].map((table) => journalTableCount(handle, table));
  if (resets.length === 0 && sourceCounts.every((count) => count === 0)) return "unseeded";
  if (resets.length !== 1 || stableBody(resets[0]) !== stableBody(plan.reset)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  const carry = plan.reset_carry_bundle;
  if (carry === null) {
    if (sourceCounts.some((count) => count !== 0)) fail("WATCHER_JOURNAL_VALUE_INVALID");
    return "seeded";
  }
  const carryRecord = carry as JsonRecord;
  exactKeys(carryRecord, ["event_set_bundle", "activation"], "WATCHER_JOURNAL_VALUE_INVALID");
  const bundle = sealSourceRemovalEventSetBundle(carryRecord.event_set_bundle);
  const activation = sealWatcherRecoveryRecord(carryRecord.activation);
  const expectedSets = [bundle.event_set];
  const expectedOccurrences = bundle.occurrences as readonly unknown[];
  const expectedEvents = bundle.events as readonly unknown[];
  const expectedMembers = bundle.memberships as readonly unknown[];
  const actualSets = decodeBodyRows(handle.database, "source_removal_event_sets", "event_set_digest");
  const actualOccurrences = decodeBodyRows(handle.database, "source_removal_occurrences", "occurrence_digest");
  const actualEvents = decodeBodyRows(handle.database, "source_removal_events", "event_digest");
  const actualMembers = decodeMembershipRows(handle.database).map((row) => row.record);
  const actualActivations = decodeBodyRows(handle.database, "activated_source_removal_event_sets", "event_set_digest");
  if (stableBody(actualSets) !== stableBody(expectedSets)
      || stableBody(actualOccurrences) !== stableBody(expectedOccurrences)
      || stableBody(actualEvents) !== stableBody(expectedEvents)
      || stableBody(actualMembers) !== stableBody(expectedMembers)
      || stableBody(actualActivations) !== stableBody([activation])) fail("WATCHER_JOURNAL_VALUE_INVALID");
  return "seeded";
}

function openOrCreateResetTarget(
  root: WatcherDirectoryCapability,
  plan: Readonly<JsonRecord>,
  onBoundary?: (boundary: WatcherJournalResetBoundary) => void,
  assertAuthority?: () => void,
): WatcherJournalHandle {
  const generation = sealWatcherRecoveryRecord(plan.new_generation);
  const meta = sealWatcherRecoveryRecord(plan.new_meta);
  const pointer = sealWatcherRecoveryRecord(plan.target_pointer);
  const childPath = join(root.path, String(generation.directory_leaf));
  const childExisted = existsSync(childPath);
  assertAuthority?.();
  let child = ensureWatcherDirectory(childPath, root);
  if (!childExisted) onBoundary?.("child");
  assertAuthority?.();
  const allowed = new Set([WATCHER_JOURNAL_DATABASE_FILE, "watcher-journal.sqlite-wal", "watcher-journal.sqlite-shm"]);
  let leaves = listWatcherLeaves(child);
  if (leaves.some((leaf) => !allowed.has(leaf))) fail("WATCHER_JOURNAL_IDENTITY_INVALID");
  const databasePath = join(child.path, WATCHER_JOURNAL_DATABASE_FILE);
  if (!watcherLeafExists(child, WATCHER_JOURNAL_DATABASE_FILE)) {
    if (leaves.length !== 0 || resetTargetLaterEvidence(root, plan)) fail("WATCHER_JOURNAL_IDENTITY_INVALID");
    const database = createWatcherJournalDatabase(child, meta, (boundary) => {
      onBoundary?.(boundary);
      assertAuthority?.();
    });
    const handle = Object.freeze({ root, generation_directory: child, database_path: databasePath, database, meta, generation, pointer });
    if (validateResetTargetRows(handle, plan) !== "unseeded") fail("WATCHER_JOURNAL_VALUE_INVALID");
    seedResetDatabase(handle, plan.reset as JsonRecord, plan.reset_carry_bundle as JsonRecord | null, (boundary) => {
      onBoundary?.(boundary);
      assertAuthority?.();
    });
    if (validateResetTargetRows(handle, plan) !== "seeded") fail("WATCHER_JOURNAL_VALUE_INVALID");
    return handle;
  }

  const state = lstatSync(databasePath);
  if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1
      || (process.platform !== "win32" && (state.mode & 0o777) !== 0o600)) fail("WATCHER_JOURNAL_IDENTITY_INVALID");
  if (state.size < 4096) {
    if (leaves.some((leaf) => leaf !== WATCHER_JOURNAL_DATABASE_FILE) || resetTargetLaterEvidence(root, plan)) {
      fail("WATCHER_JOURNAL_INTEGRITY_INVALID");
    }
    if (state.size >= 100) {
      const file = readWatcherFile(child, WATCHER_JOURNAL_DATABASE_FILE, { maximum_bytes: 4095 });
      if (!canonicalTruncatedSqliteHeader(file.bytes)) fail("WATCHER_JOURNAL_INTEGRITY_INVALID");
      let rejected = false;
      try {
        const immutableUrl = pathToFileURL(databasePath); immutableUrl.searchParams.set("immutable", "1");
        const probe = new DatabaseSync(immutableUrl, { readOnly: true });
        try { probe.prepare("PRAGMA integrity_check;").all(); } finally { probe.close(); }
      } catch { rejected = true; }
      if (!rejected) fail("WATCHER_JOURNAL_INTEGRITY_INVALID");
    }
    removeResetTargetChild(child, root);
    onBoundary?.("database_incomplete_removed");
    assertAuthority?.();
    return openOrCreateResetTarget(root, plan, onBoundary, assertAuthority);
  }

  let objects: Array<{ type: string; name: string }>;
  try {
    const immutableUrl = pathToFileURL(databasePath); immutableUrl.searchParams.set("immutable", "1");
    const probe = new DatabaseSync(immutableUrl, { readOnly: true });
    try {
      if (pragmaNumber(probe, "page_size") !== 4096 || pragmaNumber(probe, "auto_vacuum") !== 0
          || ![0, 1].includes(pragmaNumber(probe, "user_version"))
          || String(scalar(probe, "PRAGMA encoding;")).toUpperCase() !== "UTF-8"
          || String(scalar(probe, "PRAGMA integrity_check;")).toLowerCase() !== "ok") fail("WATCHER_JOURNAL_INTEGRITY_INVALID");
      objects = probe.prepare("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name;").all() as Array<{ type: string; name: string }>;
    } finally { probe.close(); }
  } catch { return fail("WATCHER_JOURNAL_INTEGRITY_INVALID"); }
  if (objects.length === 0) {
    if (resetTargetLaterEvidence(root, plan)) fail("WATCHER_JOURNAL_INTEGRITY_INVALID");
    removeResetTargetChild(child, root);
    onBoundary?.("database_empty_removed");
    assertAuthority?.();
    return openOrCreateResetTarget(root, plan, onBoundary, assertAuthority);
  }
  secureDatabaseMode(databasePath);
  const database = openLiveWatcherJournalDatabase(child, databasePath);
  try {
    const handle = Object.freeze({ root, generation_directory: child, database_path: databasePath, database, meta, generation, pointer });
    const stateKind = validateResetTargetRows(handle, plan);
    if (stateKind === "unseeded") seedResetDatabase(handle, plan.reset as JsonRecord, plan.reset_carry_bundle as JsonRecord | null, (boundary) => {
      onBoundary?.(boundary);
      assertAuthority?.();
    });
    if (validateResetTargetRows(handle, plan) !== "seeded") fail("WATCHER_JOURNAL_VALUE_INVALID");
    return handle;
  } catch (error) {
    closeLiveWatcherJournalDatabase(child, database, false);
    throw error;
  }
}

export type WatcherResetReconciliationAdoptionBoundary = "before_commit" | "committed";

/**
 * Atomically installs only the reset-adoption Receipt25, Transition16 and the
 * byte-identical native Active7. It never creates an outer pointer, retrieval
 * stage, observation/Plan row, or local activation intent/outcome.
 */
export function adoptWatcherJournalResetReconciliation(options: {
  readonly journal: WatcherJournalHandle;
  readonly bundle: unknown;
  readonly revalidate_before_commit: () => void;
  readonly on_boundary?: (boundary: WatcherResetReconciliationAdoptionBoundary) => void;
}): Readonly<JsonRecord> {
  const bundle = sealWatcherJournalResetReconciliationAdoptionBundle(options.bundle);
  const receipt = sealedBody(bundle.adoption_receipt);
  const transition = sealedBody(bundle.adoption_transition);
  const active = sealedBody(bundle.adopted_active);
  if (bundle.replacement_meta === null || bundle.replacement_generation === null || bundle.replacement_pointer === null
      || (bundle.replacement_meta as JsonRecord).meta_digest !== options.journal.meta.meta_digest
      || (bundle.replacement_generation as JsonRecord).journal_generation_digest !== options.journal.generation.journal_generation_digest
      || (bundle.replacement_pointer as JsonRecord).pointer_digest !== options.journal.pointer.pointer_digest) {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  const existing = validateWatcherJournalAdoptionProjection(options.journal);
  if (existing !== null) {
    if (stableBody(existing.receipt) !== stableBody(receipt.record)
        || stableBody(existing.transition) !== stableBody(transition.record)
        || stableBody(existing.active) !== stableBody(active.record)) fail("WATCHER_JOURNAL_VALUE_INVALID");
    return existing.active;
  }
  for (const table of ["batches", "observations", "normalized_plans", "transitions", "activation_intents", "activation_outcomes", "active_coherent"]) {
    if (journalTableCount(options.journal, table) !== 0) fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  watcherJournalTransaction(options.journal, {
    blob_bytes: receipt.bytes.byteLength + transition.bytes.byteLength + active.bytes.byteLength,
    mutated_rows: 3,
    run(database) {
      options.revalidate_before_commit();
      options.on_boundary?.("before_commit");
      database.prepare("INSERT INTO batches(batch_id,started_at,target_topology_snapshot_digest,terminal_state,terminal_transition_digest,body) VALUES(?,?,?,?,?,?);")
        .run(sqlString(receipt.record.batch_id), sqlString(receipt.record.started_at), sqlString(receipt.record.topology_snapshot_digest),
          "complete", sqlString(transition.record.transition_digest), receipt.bytes);
      database.prepare("INSERT INTO transitions(batch_id,transition_ordinal,state,prior_transition_digest,transition_digest,body) VALUES(?,?,?,?,?,?);")
        .run(sqlString(transition.record.batch_id), 0, "reset_reconciliation_adopted", null,
          sqlString(transition.record.transition_digest), transition.bytes);
      database.prepare("INSERT INTO active_coherent(singleton,active_digest,coherent_manifest_digest,pointer_digest,body) VALUES(1,?,?,?,?);")
        .run(sqlString(active.record.active_digest), sqlString(active.record.coherent_manifest_digest),
          sqlString(active.record.pointer_digest), active.bytes);
    },
  });
  const reopened = validateWatcherJournalAdoptionProjection(options.journal);
  if (reopened === null || stableBody(reopened.receipt) !== stableBody(receipt.record)
      || stableBody(reopened.transition) !== stableBody(transition.record)
      || stableBody(reopened.active) !== stableBody(active.record)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  options.on_boundary?.("committed");
  return reopened.active;
}

export type WatcherFailureRetryNoopBoundary = "before_commit" | "committed";

function readFailureRetryNoopRows(handle: WatcherJournalHandle, batchId: string): Readonly<{
  batch: Readonly<JsonRecord>;
  observation_authority: Readonly<JsonRecord>;
  plan_authority: Readonly<JsonRecord>;
  transition: Readonly<JsonRecord>;
}> | null {
  const batchRow = handle.database.prepare(
    "SELECT batch_id,started_at,target_topology_snapshot_digest,terminal_state,terminal_transition_digest,body FROM batches WHERE batch_id=?;",
  ).get(batchId) as Record<string, unknown> | undefined;
  const observationRow = handle.database.prepare(
    "SELECT batch_id,observation_digest,authority_digest,artifact_file,raw_sha256,byte_size,body FROM observations WHERE batch_id=?;",
  ).get(batchId) as Record<string, unknown> | undefined;
  const planRow = handle.database.prepare(
    "SELECT batch_id,plan_digest,authority_digest,artifact_file,raw_sha256,byte_size,target_topology_snapshot_digest,source_removal_event_set_digest,body FROM normalized_plans WHERE batch_id=?;",
  ).get(batchId) as Record<string, unknown> | undefined;
  const transitionRows = handle.database.prepare(
    "SELECT batch_id,transition_ordinal,state,prior_transition_digest,transition_digest,body FROM transitions WHERE batch_id=? ORDER BY transition_ordinal;",
  ).all(batchId) as Array<Record<string, unknown>>;
  const present = [batchRow, observationRow, planRow].filter((item) => item !== undefined).length + transitionRows.length;
  if (present === 0) return null;
  if (batchRow === undefined || observationRow === undefined || planRow === undefined || transitionRows.length !== 1) {
    fail("WATCHER_JOURNAL_VALUE_INVALID");
  }
  const batch = canonicalSqlBody(batchRow.body).record;
  const observation = canonicalSqlBody(observationRow.body).record;
  const plan = canonicalSqlBody(planRow.body).record;
  const transition = canonicalSqlBody(transitionRows[0].body).record;
  if (batch.contract_version !== "gkos-watcher-batch-record/1.0.0-draft.1"
      || batch.batch_kind !== "failure_reconciliation" || batch.execution_kind !== "set_files"
      || observation.contract_version !== "gkos-watcher-observation-authority/1.0.0-draft.1"
      || plan.contract_version !== "gkos-watcher-plan-authority/1.0.0-draft.1"
      || transition.contract_version !== "gkos-watcher-failure-retry-noop-transition/1.0.0-draft.1"
      || batchRow.batch_id !== batch.batch_id || batchRow.started_at !== batch.started_at
      || batchRow.target_topology_snapshot_digest !== plan.target_topology_snapshot_digest
      || batchRow.terminal_state !== "complete" || batchRow.terminal_transition_digest !== transition.transition_digest
      || observationRow.batch_id !== observation.batch_id || observationRow.observation_digest !== observation.observation_digest
      || observationRow.authority_digest !== observation.authority_digest
      || observationRow.artifact_file !== observation.observation_artifact_file
      || observationRow.raw_sha256 !== observation.observation_raw_sha256
      || observationRow.byte_size !== observation.observation_byte_size
      || planRow.batch_id !== plan.batch_id || planRow.plan_digest !== plan.plan_digest
      || planRow.authority_digest !== plan.authority_digest || planRow.artifact_file !== plan.plan_artifact_file
      || planRow.raw_sha256 !== plan.plan_raw_sha256 || planRow.byte_size !== plan.plan_byte_size
      || planRow.target_topology_snapshot_digest !== plan.target_topology_snapshot_digest
      || planRow.source_removal_event_set_digest !== null || plan.source_removal_event_count !== 0
      || plan.source_removal_event_set_digest !== null
      || transitionRows[0].batch_id !== transition.batch_id || transitionRows[0].transition_ordinal !== 0
      || transitionRows[0].state !== "failure_reconciliation_noop_complete"
      || transitionRows[0].prior_transition_digest !== null
      || transitionRows[0].transition_digest !== transition.transition_digest) fail("WATCHER_JOURNAL_VALUE_INVALID");
  return Object.freeze({ batch, observation_authority: observation, plan_authority: plan, transition });
}

/**
 * Atomically terminates an unchanged failure-reconciliation epoch with the
 * exact four-row projection. No activation, outer, retrieval, graph, provider
 * or source-removal row is written. Exact replay is idempotent.
 */
export function commitWatcherFailureRetryNoop(options: {
  readonly watcher_directory: WatcherDirectoryCapability;
  readonly retrieval_directory: WatcherDirectoryCapability;
  readonly journal: WatcherJournalHandle;
  readonly bundle: unknown;
  readonly revalidate_before_commit: () => void;
  readonly on_boundary?: (boundary: WatcherFailureRetryNoopBoundary) => void;
}): Readonly<JsonRecord> {
  const physical = validateWatcherFailureRetryNoopPhysicalAuthority(options);
  const bundle = physical.bundle;
  const failureRetry = bundle.failure_retry_bundle as Readonly<JsonRecord>;
  const batch = sealedBody(failureRetry.retry_batch);
  const observation = sealedBody(failureRetry.retry_observation_authority);
  const plan = sealedBody(bundle.retry_plan_authority);
  const transition = sealedBody(bundle.transition);
  const batchId = sqlString(batch.record.batch_id);
  const activeBefore = readWatcherJournalActive(options.journal);
  const existing = readFailureRetryNoopRows(options.journal, batchId);
  if (existing !== null) {
    if (stableBody(existing.batch) !== stableBody(batch.record)
        || stableBody(existing.observation_authority) !== stableBody(observation.record)
        || stableBody(existing.plan_authority) !== stableBody(plan.record)
        || stableBody(existing.transition) !== stableBody(transition.record)) fail("WATCHER_JOURNAL_VALUE_INVALID");
    return existing.transition;
  }
  watcherJournalTransaction(options.journal, {
    blob_bytes: batch.bytes.byteLength + observation.bytes.byteLength + plan.bytes.byteLength + transition.bytes.byteLength,
    mutated_rows: 4,
    run(database) {
      options.revalidate_before_commit();
      const reopened = validateWatcherFailureRetryNoopPhysicalAuthority(options);
      if (stableBody(reopened.bundle) !== stableBody(bundle)) fail("WATCHER_JOURNAL_VALUE_INVALID");
      options.on_boundary?.("before_commit");
      database.prepare("INSERT INTO batches(batch_id,started_at,target_topology_snapshot_digest,terminal_state,terminal_transition_digest,body) VALUES(?,?,?,?,?,?);")
        .run(batchId, sqlString(batch.record.started_at), sqlString(plan.record.target_topology_snapshot_digest),
          "complete", sqlString(transition.record.transition_digest), batch.bytes);
      database.prepare("INSERT INTO observations(batch_id,observation_digest,authority_digest,artifact_file,raw_sha256,byte_size,body) VALUES(?,?,?,?,?,?,?);")
        .run(batchId, sqlString(observation.record.observation_digest), sqlString(observation.record.authority_digest),
          sqlString(observation.record.observation_artifact_file), sqlString(observation.record.observation_raw_sha256),
          sqlInteger(observation.record.observation_byte_size), observation.bytes);
      database.prepare("INSERT INTO normalized_plans(batch_id,plan_digest,authority_digest,artifact_file,raw_sha256,byte_size,target_topology_snapshot_digest,source_removal_event_set_digest,body) VALUES(?,?,?,?,?,?,?,?,?);")
        .run(batchId, sqlString(plan.record.plan_digest), sqlString(plan.record.authority_digest),
          sqlString(plan.record.plan_artifact_file), sqlString(plan.record.plan_raw_sha256), sqlInteger(plan.record.plan_byte_size),
          sqlString(plan.record.target_topology_snapshot_digest), null, plan.bytes);
      database.prepare("INSERT INTO transitions(batch_id,transition_ordinal,state,prior_transition_digest,transition_digest,body) VALUES(?,?,?,?,?,?);")
        .run(batchId, 0, "failure_reconciliation_noop_complete", null,
          sqlString(transition.record.transition_digest), transition.bytes);
    },
  });
  validateWatcherJournalAdoptionProjection(options.journal);
  const committed = readFailureRetryNoopRows(options.journal, batchId);
  const activeAfter = readWatcherJournalActive(options.journal);
  if (committed === null || stableBody(committed.batch) !== stableBody(batch.record)
      || stableBody(committed.observation_authority) !== stableBody(observation.record)
      || stableBody(committed.plan_authority) !== stableBody(plan.record)
      || stableBody(committed.transition) !== stableBody(transition.record)
      || stableBody(activeAfter) !== stableBody(activeBefore)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  options.on_boundary?.("committed");
  return committed.transition;
}

function resetPointerSidecarsPresent(root: WatcherDirectoryCapability): boolean {
  return [
    ".watcher-journal-active.json.gkos-watcher.guard",
    ".watcher-journal-active.json.gkos-watcher.guard-stage",
    ".watcher-journal-active.json.gkos-watcher.tmp",
  ].some((leaf) => watcherLeafExists(root, leaf));
}

function assertResetControlledNamespace(
  watcherRoot: WatcherDirectoryCapability,
  journalRoot: WatcherDirectoryCapability,
): void {
  const watcherAllowed = /^(?:watcher-journal-reset-recovery-bridge-[0-9a-f]{64}\.json|\.watcher-journal-reset-recovery-bridge-[0-9a-f]{64}\.json\.gkos-watcher\.stage|watcher-journal-reset-recovery-executor\.json|\.watcher-journal-reset-recovery-executor\.json\.gkos-watcher\.stage|watcher-journal-reset-recovery-executor-[0-9a-f]{64}\.json)$/u;
  for (const leaf of listWatcherLeaves(watcherRoot)) {
    if (/^\.?watcher-journal-reset-recovery-/iu.test(leaf) && !watcherAllowed.test(leaf)) {
      fail("GKX_WATCHER_RESET_RECOVERY_NAMESPACE_INVALID");
    }
  }
  const journalAllowed = new Set([
    WATCHER_RESET_RECOVERY_PLAN_FILE, WATCHER_RESET_RECOVERY_PLAN_STAGE_FILE,
    WATCHER_RESET_GUARD_FILE, WATCHER_RESET_GUARD_STAGE_FILE,
  ]);
  for (const leaf of listWatcherLeaves(journalRoot)) {
    if ((/^\.?watcher-journal-reset-/iu.test(leaf) || /^\.gkos-watcher-journal-reset/iu.test(leaf))
        && !journalAllowed.has(leaf)) fail("GKX_WATCHER_RESET_RECOVERY_NAMESPACE_INVALID");
  }
}

function assertLiveOriginalResetRecoveryNamespaceAbsent(
  watcherRoot: WatcherDirectoryCapability,
  plan: Readonly<JsonRecord>,
): void {
  if (watcherLeafExists(watcherRoot, WATCHER_HOST_LOCK_RECOVERY_FILE)
      || watcherLeafExists(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_FILE)
      || watcherLeafExists(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_STAGE_FILE)) {
    fail("GKX_WATCHER_RESET_RECOVERY_AUTHORITY_CONFLICT");
  }
  const planDigest = String(plan.plan_digest);
  for (const leaf of listWatcherLeaves(watcherRoot)) {
    if (/^\.watcher-journal-reset-recovery-bridge-[0-9a-f]{64}\.json\.gkos-watcher\.stage$/u.test(leaf)) {
      // A Bridge stage is an active handoff interlock even if a sub-write has
      // not yet become parseable.
      fail("GKX_WATCHER_RESET_RECOVERY_AUTHORITY_CONFLICT");
    }
    if (!/^watcher-journal-reset-recovery-bridge-[0-9a-f]{64}\.json$/u.test(leaf)) continue;
    const file = readWatcherFile(watcherRoot, leaf, { maximum_bytes: 1_073_741_824 });
    const bridge = sealResetRecoveryBridge(parseCanonicalWatcherJson(file));
    if (leaf !== resetRecoveryBridgeLeaf(String(bridge.bridge_digest))) {
      fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
    }
    if ((bridge.recovery_plan as JsonRecord).plan_digest === planDigest) {
      fail("GKX_WATCHER_RESET_RECOVERY_AUTHORITY_CONFLICT");
    }
  }
}

function validateResetPlanPhysical(
  watcherRoot: WatcherDirectoryCapability,
  journalRoot: WatcherDirectoryCapability,
  plan: Readonly<JsonRecord>,
): void {
  const sealed = sealResetRecoveryPlan(plan);
  const currentOuter = readWatcherPointer(watcherRoot, "outer");
  if (currentOuter === null || stableBody(currentOuter) !== stableBody(sealed.outer_pointer)) {
    fail("GKX_WATCHER_EXPECTED_COORDINATE_MISMATCH");
  }
  const manifestFile = readWatcherFile(watcherRoot, String((sealed.outer_pointer as JsonRecord).coherent_manifest_file), {
    maximum_bytes: 536_870_912,
  });
  const manifest = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(manifestFile));
  if (stableBody(manifest) !== stableBody(sealed.outer_coherent_manifest)) {
    fail("GKX_WATCHER_EXPECTED_COORDINATE_MISMATCH");
  }
  const oldPointer = sealWatcherRecoveryRecord(sealed.old_pointer);
  const historical = openHistoricalWatcherJournal(journalRoot, oldPointer);
  try {
    const archive = sealWatcherRecoveryRecord(sealed.archive);
    if (historical.generation_directory.identity.device !== archive.directory_device
        || historical.generation_directory.identity.inode !== archive.directory_inode
        || historical.generation_directory.identity.mode !== archive.directory_mode
        || stableBody(stableJournalFileIdentity(historical.generation_directory, WATCHER_JOURNAL_DATABASE_FILE, "database"))
          !== stableBody(archive.database_identity)
        || stableBody(optionalJournalFileIdentity(historical.generation_directory, "watcher-journal.sqlite-wal", "wal"))
          !== stableBody(archive.wal_identity)
        || stableBody(optionalJournalFileIdentity(historical.generation_directory, "watcher-journal.sqlite-shm", "shm"))
          !== stableBody(archive.shm_identity)) fail("WATCHER_JOURNAL_IDENTITY_INVALID");
    const audit = auditResetOutbox(historical, currentOuter, manifest, true);
    if (stableBody(audit.authority) !== stableBody(sealed.old_journal_authority)) {
      fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    }
  } finally {
    closeHistoricalWatcherJournal(historical);
  }
}

function assertResetGuardBytes(root: WatcherDirectoryCapability, plan: Readonly<JsonRecord>): void {
  const expected = watcherCanonicalBytes(plan.reset_guard);
  for (const leaf of [WATCHER_RESET_GUARD_STAGE_FILE, WATCHER_RESET_GUARD_FILE]) {
    if (!watcherLeafExists(root, leaf)) continue;
    const file = readWatcherFileWithLinks(root, leaf);
    if (!file.bytes.equals(expected)) fail("GKX_WATCHER_RESET_GUARD_INVALID");
  }
}

function assertResetPointerGuardBytes(root: WatcherDirectoryCapability, plan: Readonly<JsonRecord>): void {
  const expected = watcherCanonicalBytes(plan.pointer_replace_guard);
  for (const leaf of [".watcher-journal-active.json.gkos-watcher.guard-stage", ".watcher-journal-active.json.gkos-watcher.guard"]) {
    if (!watcherLeafExists(root, leaf)) continue;
    const file = readWatcherFileWithLinks(root, leaf);
    if (!file.bytes.equals(expected)) fail("GKX_WATCHER_POINTER_GUARD_MISMATCH");
  }
}

function validateResetTargetComplete(handle: WatcherJournalHandle, plan: Readonly<JsonRecord>): void {
  if (stableBody(handle.meta) !== stableBody(plan.new_meta)
      || stableBody(handle.generation) !== stableBody(plan.new_generation)
      || stableBody(handle.pointer) !== stableBody(plan.target_pointer)
      || validateResetTargetRows(handle, plan) !== "seeded") fail("WATCHER_JOURNAL_VALUE_INVALID");
}

function resetTargetIsStable(root: WatcherDirectoryCapability, plan: Readonly<JsonRecord>): boolean {
  if (watcherLeafExists(root, WATCHER_RESET_GUARD_FILE) || watcherLeafExists(root, WATCHER_RESET_GUARD_STAGE_FILE)
      || resetPointerSidecarsPresent(root)) return false;
  const fixed = readWatcherPointer(root, "journal");
  if (fixed === null || stableBody(fixed) !== stableBody(plan.target_pointer)) return false;
  const handle = openWatcherJournal(root);
  if (handle === null) return false;
  try {
    validateResetTargetComplete(handle, plan);
    return watcherJournalIsAnchoredResetPendingReconciliation(
      handle, plan.outer_pointer, plan.outer_coherent_manifest,
    );
  } finally { closeWatcherJournal(handle); }
}

function readResetRecoveryBridgeByDigest(
  watcherRoot: WatcherDirectoryCapability,
  digest: string,
): Readonly<JsonRecord> {
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
  const file = readWatcherFile(watcherRoot, resetRecoveryBridgeLeaf(digest), { maximum_bytes: 1_073_741_824 });
  const bridge = sealResetRecoveryBridge(parseCanonicalWatcherJson(file));
  if (bridge.bridge_digest !== digest) fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
  return bridge;
}

function activeResetRecoveryContext(watcherRoot: WatcherDirectoryCapability): {
  readonly bridge: Readonly<JsonRecord>;
  readonly executor: Readonly<JsonRecord>;
} | null {
  if (!watcherLeafExists(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_FILE)) return null;
  const file = readWatcherFileWithLinks(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_FILE);
  const executor = sealResetRecoveryExecutor(parseCanonicalWatcherJson(file));
  const bridge = readResetRecoveryBridgeByDigest(watcherRoot, String(executor.bridge_digest));
  const selected = readSelectedResetExecutor(watcherRoot, bridge);
  if (selected === null || selected.record.executor_digest !== executor.executor_digest) {
    fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
  }
  return Object.freeze({ bridge, executor });
}

function resetTerminalHostLockEvidence(
  watcherRoot: WatcherDirectoryCapability,
  journalRoot: WatcherDirectoryCapability,
): boolean {
  if (watcherLeafExists(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_FILE)
      || watcherLeafExists(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_STAGE_FILE)) return false;
  const fixedLock = readHostLock(watcherRoot);
  if (fixedLock === null || fixedLock.lock.operation !== "journal_reset") return false;
  const fixedPointer = readWatcherPointer(journalRoot, "journal");
  if (fixedPointer === null || resetPointerSidecarsPresent(journalRoot)) return false;
  let matches = 0;
  for (const leaf of listWatcherLeaves(watcherRoot)
    .filter((item) => /^watcher-journal-reset-recovery-bridge-[0-9a-f]{64}\.json$/u.test(item))) {
    const file = readWatcherFile(watcherRoot, leaf, { maximum_bytes: 1_073_741_824 });
    const bridge = sealResetRecoveryBridge(parseCanonicalWatcherJson(file));
    if (leaf !== resetRecoveryBridgeLeaf(String(bridge.bridge_digest))) fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
    const plan = sealResetRecoveryPlan(bridge.recovery_plan);
    const chain = readResetExecutorChain(watcherRoot, bridge);
    const latest = chain.at(-1)?.record;
    if (latest !== undefined && stableBody(fixedPointer) === stableBody(plan.target_pointer)
        && resetLockMatchesExecutor(fixedLock.lock, latest, plan, String((plan.target_pointer as JsonRecord).pointer_digest))) matches += 1;
  }
  if (matches > 1) fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  return matches === 1;
}

export function watcherJournalResetRecoveryActive(
  watcherRoot: WatcherDirectoryCapability,
  journalRoot: WatcherDirectoryCapability,
): boolean {
  assertResetControlledNamespace(watcherRoot, journalRoot);
  return watcherLeafExists(journalRoot, WATCHER_RESET_RECOVERY_PLAN_FILE)
    || watcherLeafExists(journalRoot, WATCHER_RESET_RECOVERY_PLAN_STAGE_FILE)
    || watcherLeafExists(journalRoot, WATCHER_RESET_GUARD_FILE)
    || watcherLeafExists(journalRoot, WATCHER_RESET_GUARD_STAGE_FILE)
    || resetPointerSidecarsPresent(journalRoot)
    || watcherLeafExists(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_FILE)
    || watcherLeafExists(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_STAGE_FILE)
    || resetTerminalHostLockEvidence(watcherRoot, journalRoot);
}

function readHostLockForResetExecutor(
  watcherRoot: WatcherDirectoryCapability,
  bridge: Readonly<JsonRecord>,
  executor: Readonly<JsonRecord>,
  plan: Readonly<JsonRecord>,
): ReturnType<typeof readHostLock> {
  if (!watcherLeafExists(watcherRoot, WATCHER_HOST_LOCK_FILE)) return null;
  const discardIncomplete = (): null => {
    const selected = readSelectedResetExecutor(watcherRoot, bridge);
    if (selected === null || selected.record.executor_digest !== executor.executor_digest
        || executor.process_id !== process.pid
        || (bridge.recovery_plan as JsonRecord).plan_digest !== plan.plan_digest
        || lstatSync(join(watcherRoot.path, WATCHER_HOST_LOCK_FILE)).size > 1_048_576) {
      fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
    }
    discardIncompleteWatcherLeaf(watcherRoot, WATCHER_HOST_LOCK_FILE);
    return null;
  };
  let file;
  try { file = readWatcherFile(watcherRoot, WATCHER_HOST_LOCK_FILE); }
  catch { return discardIncomplete(); }
  let parsed: JsonRecord;
  try { parsed = parseCanonicalWatcherJson(file); }
  catch { return discardIncomplete(); }
  // A complete canonical but wrong lock is never inferred to be an interrupted
  // executor publication.
  const lock = sealHostLock(parsed);
  return Object.freeze({ lock, raw_sha256: file.raw_sha256 });
}

function resetExecutorHostLock(
  watcherRoot: WatcherDirectoryCapability,
  bridge: Readonly<JsonRecord>,
  executor: Readonly<JsonRecord>,
  plan: Readonly<JsonRecord>,
  pointerDigest: string,
  onBoundary?: (boundary: WatcherJournalResetBoundary) => void,
): WatcherHostLockCapability {
  let current = readHostLockForResetExecutor(watcherRoot, bridge, executor, plan);
  if (current !== null && resetLockMatchesExecutor(current.lock, executor, plan, pointerDigest)
      && current.lock.process_id === process.pid) {
    return registerHostLock(watcherRoot, current.lock, current.raw_sha256);
  }
  if (current !== null) {
    const chain = readResetExecutorChain(watcherRoot, bridge);
    const owner = chain.find((row) => resetLockMatchesExecutor(current!.lock, row.record, plan, String(current!.lock.prior_journal_pointer_digest)));
    if (owner === undefined || processIsAlive(Number(current.lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
    revalidateWatcherDirectory(watcherRoot);
    if (processIsAlive(Number(current.lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
    unlinkWatcherLeaf(watcherRoot, WATCHER_HOST_LOCK_FILE, { expected_raw_sha256: current.raw_sha256 });
    current = null;
  }
  const lock = resetHostLockForExecutor(executor, plan, pointerDigest);
  const prefix = pointerDigest === (plan.target_pointer as JsonRecord).pointer_digest ? "current_lock" : "old_lock";
  const file = writeNewWatcherFile(watcherRoot, WATCHER_HOST_LOCK_FILE, watcherCanonicalBytes(lock), 1_048_576, {
    on_boundary(boundary) { onBoundary?.(`${prefix}_${boundary}` as WatcherJournalResetBoundary); },
  });
  return registerHostLock(watcherRoot, lock, file.raw_sha256);
}

function assertResetExecutorAuthority(options: {
  readonly watcher_root: WatcherDirectoryCapability;
  readonly journal_root: WatcherDirectoryCapability;
  readonly plan: Readonly<JsonRecord>;
  readonly bridge: Readonly<JsonRecord>;
  readonly executor: Readonly<JsonRecord>;
  readonly host_lock: WatcherHostLockCapability;
  readonly pointer_digest: string;
  readonly require_plan?: boolean;
  readonly allow_missing_root_claim?: boolean;
}): void {
  assertResetControlledNamespace(options.watcher_root, options.journal_root);
  const selected = readSelectedResetExecutor(options.watcher_root, options.bridge);
  if (selected === null || selected.record.executor_digest !== options.executor.executor_digest
      || !resetLockMatchesExecutor(assertWatcherHostLock(options.host_lock), options.executor, options.plan, options.pointer_digest)) {
    fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
  }
  const reopenedBridge = readResetRecoveryBridgeByDigest(options.watcher_root, String(options.bridge.bridge_digest));
  if (stableBody(reopenedBridge) !== stableBody(options.bridge)) fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
  if (options.require_plan !== false) {
    const planEntry = readResetRecoveryPlan(options.journal_root);
    if (planEntry === null || stableBody(planEntry.plan) !== stableBody(options.plan)
        || planEntry.file.raw_sha256 !== options.bridge.recovery_plan_raw_sha256
        || planEntry.file.bytes.byteLength !== options.bridge.recovery_plan_byte_size) {
      fail("GKX_WATCHER_RESET_RECOVERY_PLAN_INVALID");
    }
  }
  if (options.bridge.kind === "journal_reset_recovery") {
    const claim = readRecoveryClaim(options.watcher_root);
    if (claim === null && options.allow_missing_root_claim === true) return;
    if (claim === null || claim.raw_sha256 !== options.bridge.root_recovery_claim_raw_sha256
        || stableBody(claim.claim) !== stableBody(options.bridge.root_recovery_claim)) {
      fail("GKX_WATCHER_HOST_LOCK_RECOVERY_CLAIM_INVALID");
    }
  }
}

function resetResultFromPlan(plan: Readonly<JsonRecord>): Readonly<JsonRecord> {
  const reset = plan.reset as JsonRecord;
  const base = {
    contract_version: "gkos-watcher-journal-reset-result/1.0.0-draft.1", status: "reset",
    prior_journal_generation_digest: (plan.old_generation as JsonRecord).journal_generation_digest,
    archive_manifest_digest: (plan.archive as JsonRecord).archive_manifest_digest,
    new_journal_generation_digest: (plan.new_generation as JsonRecord).journal_generation_digest,
    outer_coherent_manifest_digest: (plan.outer_coherent_manifest as JsonRecord).coherent_manifest_digest,
    reset_digest: reset.reset_digest, requires_reconciliation: true,
  };
  return sealWatcherRecoveryRecord({ ...base, result_digest: watcherDigest(base) });
}

function finishResetRecoveryCleanup(options: {
  readonly watcher_root: WatcherDirectoryCapability;
  readonly journal_root: WatcherDirectoryCapability;
  readonly plan: Readonly<JsonRecord>;
  readonly bridge: Readonly<JsonRecord>;
  readonly executor: Readonly<JsonRecord>;
  readonly host_lock: WatcherHostLockCapability;
  readonly plan_already_removed?: boolean;
  readonly claim_already_removed?: boolean;
  readonly on_boundary?: (boundary: WatcherJournalResetBoundary) => void;
}): Readonly<JsonRecord> {
  assertResetExecutorAuthority({ ...options, pointer_digest: String((options.plan.target_pointer as JsonRecord).pointer_digest),
    require_plan: options.plan_already_removed !== true, allow_missing_root_claim: options.claim_already_removed === true });
  if (options.plan_already_removed === true) {
    if (readRecoveryClaim(options.watcher_root) !== null) fail("GKX_WATCHER_HOST_LOCK_RECOVERY_CLAIM_INVALID");
  } else if (options.bridge.kind === "journal_reset_recovery" && options.claim_already_removed !== true) {
    const claim = readRecoveryClaim(options.watcher_root);
    if (claim === null || claim.claim.claim_digest !== (options.bridge.root_recovery_claim as JsonRecord).claim_digest) {
      fail("GKX_WATCHER_HOST_LOCK_RECOVERY_CLAIM_INVALID");
    }
    unlinkWatcherLeaf(options.watcher_root, WATCHER_HOST_LOCK_RECOVERY_FILE, { expected_raw_sha256: claim.raw_sha256 });
    options.on_boundary?.("claim_removed");
  }
  if (options.plan_already_removed !== true) {
    const planEntry = readResetRecoveryPlan(options.journal_root);
    if (planEntry === null || stableBody(planEntry.plan) !== stableBody(options.plan)) {
      fail("GKX_WATCHER_RESET_RECOVERY_PLAN_INVALID");
    }
    unlinkWatcherLeaf(options.journal_root, WATCHER_RESET_RECOVERY_PLAN_FILE, {
      expected_raw_sha256: planEntry.file.raw_sha256, maximum_bytes: 536_870_912,
    });
    options.on_boundary?.("plan_removed");
  }
  const selected = readSelectedResetExecutor(options.watcher_root, options.bridge);
  if (selected === null || selected.record.executor_digest !== options.executor.executor_digest) {
    fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
  }
  unlinkWatcherLeaf(options.watcher_root, WATCHER_RESET_RECOVERY_EXECUTOR_FILE, {
    allowed_links: 2, expected_raw_sha256: selected.file.raw_sha256,
  });
  options.on_boundary?.("executor_released");
  releaseWatcherHostLock(options.host_lock);
  options.on_boundary?.("current_lock_released");
  return resetResultFromPlan(options.plan);
}

function recoverResetTerminalHostLock(
  watcherRoot: WatcherDirectoryCapability,
  journalRoot: WatcherDirectoryCapability,
  onBoundary?: (boundary: WatcherJournalResetBoundary) => void,
): Readonly<JsonRecord> | null {
  if (watcherLeafExists(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_FILE)
      || watcherLeafExists(watcherRoot, WATCHER_RESET_RECOVERY_EXECUTOR_STAGE_FILE)) return null;
  const fixed = readHostLock(watcherRoot);
  if (fixed === null || fixed.lock.operation !== "journal_reset") return null;
  const matches: Array<{ readonly bridge: Readonly<JsonRecord>; readonly executor: Readonly<JsonRecord>; readonly plan: Readonly<JsonRecord> }> = [];
  for (const leaf of listWatcherLeaves(watcherRoot)
    .filter((item) => /^watcher-journal-reset-recovery-bridge-[0-9a-f]{64}\.json$/u.test(item))) {
    const file = readWatcherFile(watcherRoot, leaf, { maximum_bytes: 1_073_741_824 });
    const bridge = sealResetRecoveryBridge(parseCanonicalWatcherJson(file));
    if (leaf !== resetRecoveryBridgeLeaf(String(bridge.bridge_digest))) fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
    const plan = sealResetRecoveryPlan(bridge.recovery_plan);
    const chain = readResetExecutorChain(watcherRoot, bridge);
    const latest = chain.at(-1)?.record;
    if (latest !== undefined && resetTargetIsStable(journalRoot, plan)
        && resetLockMatchesExecutor(fixed.lock, latest, plan, String((plan.target_pointer as JsonRecord).pointer_digest))) {
      matches.push({ bridge, executor: latest, plan });
    }
  }
  // A dead reset lock with no complete Plan/Bridge and no later reset evidence
  // is the admitted pre-Plan abandonment state; ordinary stale-lock recovery
  // owns it.  More than one terminal bridge is ambiguous authority.
  if (matches.length === 0) return null;
  if (matches.length !== 1) fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  const match = matches[0];
  const chain = readResetExecutorChain(watcherRoot, match.bridge);
  if (chain.length === 0 || chain.some((row) => row.file.identity.nlink !== 1)
      || watcherLeafExists(journalRoot, WATCHER_RESET_RECOVERY_PLAN_FILE)
      || watcherLeafExists(journalRoot, WATCHER_RESET_RECOVERY_PLAN_STAGE_FILE)) {
    fail("GKX_WATCHER_RESET_RECOVERY_EXECUTOR_INVALID");
  }
  const claim = ensureRecoveryClaim(watcherRoot, fixed.lock);
  onBoundary?.("terminal_claim");
  if (processIsAlive(Number(fixed.lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  revalidateWatcherDirectory(watcherRoot);
  if (processIsAlive(Number(fixed.lock.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
  const reopened = readHostLock(watcherRoot);
  if (reopened === null || reopened.lock.lock_digest !== fixed.lock.lock_digest) fail("GKX_WATCHER_HOST_LOCK_CHANGED");
  unlinkWatcherLeaf(watcherRoot, WATCHER_HOST_LOCK_FILE, { expected_raw_sha256: reopened.raw_sha256 });
  onBoundary?.("terminal_lock_removed");
  const reopenedClaim = readRecoveryClaim(watcherRoot);
  if (reopenedClaim === null || stableBody(reopenedClaim.claim) !== stableBody(claim.claim)) {
    fail("GKX_WATCHER_HOST_LOCK_RECOVERY_CLAIM_INVALID");
  }
  unlinkWatcherLeaf(watcherRoot, WATCHER_HOST_LOCK_RECOVERY_FILE, { expected_raw_sha256: reopenedClaim.raw_sha256 });
  onBoundary?.("terminal_claim_removed");
  return resetResultFromPlan(match.plan);
}

export function recoverWatcherJournalReset(options: {
  readonly watcher_root: WatcherDirectoryCapability;
  readonly journal_root: WatcherDirectoryCapability;
  readonly expected_journal_generation_digest?: string;
  readonly expected_coherent_manifest_digest?: string;
  readonly current_host_lock?: WatcherHostLockCapability;
  readonly revalidate_namespace?: () => void;
  readonly on_boundary?: (boundary: WatcherJournalResetBoundary) => void;
}): Readonly<JsonRecord> | null {
  assertResetControlledNamespace(options.watcher_root, options.journal_root);
  options.revalidate_namespace?.();
  const authorizeIncompleteCleanup = (expectedPlan?: Readonly<JsonRecord>): void => {
    assertResetIncompleteCleanupAuthority({
      watcher_root: options.watcher_root,
      journal_root: options.journal_root,
      ...(expectedPlan === undefined ? {} : { expected_plan: expectedPlan }),
      ...(options.revalidate_namespace === undefined ? {} : { revalidate_namespace: options.revalidate_namespace }),
    });
  };
  let planEntry = readResetRecoveryPlan(options.journal_root, () => authorizeIncompleteCleanup());
  const planAlreadyRemoved = planEntry === null;
  let active = activeResetRecoveryContext(options.watcher_root);
  if (planEntry === null && active === null) {
    return recoverResetTerminalHostLock(options.watcher_root, options.journal_root, options.on_boundary);
  }
  const plan = planEntry?.plan ?? sealResetRecoveryPlan(active!.bridge.recovery_plan);
  if (options.expected_journal_generation_digest !== undefined
      && options.expected_journal_generation_digest !== (plan.old_generation as JsonRecord).journal_generation_digest
      || options.expected_coherent_manifest_digest !== undefined
      && options.expected_coherent_manifest_digest !== (plan.outer_coherent_manifest as JsonRecord).coherent_manifest_digest) {
    fail("GKX_WATCHER_EXPECTED_COORDINATE_MISMATCH");
  }
  if (planEntry !== null) validateResetPlanPhysical(options.watcher_root, options.journal_root, plan);
  let bridge = active?.bridge ?? readResetRecoveryBridge(
    options.watcher_root, plan, () => authorizeIncompleteCleanup(plan),
  );
  const original = sealHostLock(plan.watcher_host_lock as JsonRecord);

  if (bridge === null) {
    const fixed = readHostLock(options.watcher_root);
    if (fixed === null || fixed.lock.lock_digest !== original.lock_digest) fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
    if (processIsAlive(Number(original.process_id))) {
      if (process.pid !== original.process_id || options.current_host_lock === undefined || !resetTargetIsStable(options.journal_root, plan)) {
        fail("GKX_WATCHER_HOST_LOCKED");
      }
      bridge = persistResetRecoveryBridge(options.watcher_root, resetRecoveryBridgeRecord({
        kind: "journal_reset_live_cleanup", plan_entry: planEntry!, claim_entry: null,
      }), options.on_boundary);
    } else {
      const claim = ensureRecoveryClaim(options.watcher_root, original);
      options.on_boundary?.("claim");
      bridge = persistResetRecoveryBridge(options.watcher_root, resetRecoveryBridgeRecord({
        kind: "journal_reset_recovery", plan_entry: planEntry!, claim_entry: claim,
      }), options.on_boundary);
    }
  }

  if (bridge.kind === "journal_reset_live_cleanup" && !resetTargetIsStable(options.journal_root, plan)) {
    fail("GKX_WATCHER_RESET_RECOVERY_BRIDGE_INVALID");
  }
  let claimAlreadyRemoved = false;
  if (bridge.kind === "journal_reset_recovery") {
    const claim = readRecoveryClaim(options.watcher_root);
    if (claim === null) {
      claimAlreadyRemoved = true;
      if (active === null || !resetTargetIsStable(options.journal_root, plan)) {
        fail("GKX_WATCHER_HOST_LOCK_RECOVERY_CLAIM_INVALID");
      }
    } else if (stableBody(claim.claim) !== stableBody(bridge.root_recovery_claim)) {
      fail("GKX_WATCHER_HOST_LOCK_RECOVERY_CLAIM_INVALID");
    }
  }
  const initialNonce = bridge.kind === "journal_reset_live_cleanup" && process.pid === original.process_id
    ? String(original.owner_nonce) : undefined;
  const executor = selectResetRecoveryExecutor(options.watcher_root, bridge, initialNonce, options.on_boundary);
  active = Object.freeze({ bridge, executor });
  options.revalidate_namespace?.();

  let fixed = readHostLockForResetExecutor(options.watcher_root, bridge, executor, plan);
  if (fixed !== null && fixed.lock.lock_digest === original.lock_digest) {
    if (bridge.kind === "journal_reset_recovery") {
      if (processIsAlive(Number(original.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
      revalidateWatcherDirectory(options.watcher_root);
      if (processIsAlive(Number(original.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
      unlinkWatcherLeaf(options.watcher_root, WATCHER_HOST_LOCK_FILE, { expected_raw_sha256: fixed.raw_sha256 });
    } else if (options.current_host_lock !== undefined && process.pid === original.process_id) {
      releaseWatcherHostLock(options.current_host_lock);
    } else {
      if (processIsAlive(Number(original.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
      revalidateWatcherDirectory(options.watcher_root);
      if (processIsAlive(Number(original.process_id))) fail("GKX_WATCHER_HOST_LOCKED");
      unlinkWatcherLeaf(options.watcher_root, WATCHER_HOST_LOCK_FILE, { expected_raw_sha256: fixed.raw_sha256 });
    }
    options.on_boundary?.("old_lock_removed");
    fixed = null;
  }

  const stableBefore = resetTargetIsStable(options.journal_root, plan);
  const initialPointerDigest = String(((stableBefore ? plan.target_pointer : plan.old_pointer) as JsonRecord).pointer_digest);
  let hostLock = resetExecutorHostLock(
    options.watcher_root, bridge, executor, plan, initialPointerDigest, options.on_boundary,
  );
  options.on_boundary?.(stableBefore ? "current_lock" : "old_lock");
  if (!stableBefore) {
    const oldDigest = String((plan.old_pointer as JsonRecord).pointer_digest);
    assertResetExecutorAuthority({
      watcher_root: options.watcher_root, journal_root: options.journal_root, plan, bridge, executor,
      host_lock: hostLock, pointer_digest: oldDigest,
    });
    resumeResetPlanTarget({
      journal_root: options.journal_root, plan,
      assert_authority() {
        assertResetExecutorAuthority({
          watcher_root: options.watcher_root, journal_root: options.journal_root, plan, bridge, executor,
          host_lock: hostLock, pointer_digest: oldDigest,
        });
        options.revalidate_namespace?.();
      },
      on_boundary: options.on_boundary,
    });
    releaseWatcherHostLock(hostLock);
    hostLock = resetExecutorHostLock(
      options.watcher_root, bridge, executor, plan, String((plan.target_pointer as JsonRecord).pointer_digest), options.on_boundary,
    );
    options.on_boundary?.("current_lock");
  }
  if (!resetTargetIsStable(options.journal_root, plan)) fail("WATCHER_JOURNAL_VALUE_INVALID");
  return finishResetRecoveryCleanup({
    watcher_root: options.watcher_root, journal_root: options.journal_root, plan, bridge, executor,
    host_lock: hostLock, plan_already_removed: planAlreadyRemoved, claim_already_removed: claimAlreadyRemoved,
    on_boundary: options.on_boundary,
  });
}

function resumeResetPlanTarget(options: {
  readonly journal_root: WatcherDirectoryCapability;
  readonly plan: Readonly<JsonRecord>;
  readonly assert_authority: () => void;
  readonly on_boundary?: (boundary: WatcherJournalResetBoundary) => void;
}): void {
  const { journal_root: root, plan } = options;
  options.assert_authority();
  assertResetGuardBytes(root, plan);
  assertResetPointerGuardBytes(root, plan);
  let fixed = readWatcherPointer(root, "journal");
  const oldPointer = sealWatcherRecoveryRecord(plan.old_pointer);
  const targetPointer = sealWatcherRecoveryRecord(plan.target_pointer);
  if (fixed === null || stableBody(fixed) !== stableBody(oldPointer) && stableBody(fixed) !== stableBody(targetPointer)) {
    fail("GKX_WATCHER_POINTER_FIXED_MISMATCH");
  }
  if (stableBody(fixed) === stableBody(targetPointer) && !resetPointerSidecarsPresent(root)
      && !watcherLeafExists(root, WATCHER_RESET_GUARD_FILE) && !watcherLeafExists(root, WATCHER_RESET_GUARD_STAGE_FILE)) {
    if (!resetTargetIsStable(root, plan)) fail("WATCHER_JOURNAL_VALUE_INVALID");
    return;
  }
  if (!watcherLeafExists(root, WATCHER_RESET_GUARD_FILE)) {
    if (stableBody(fixed) !== stableBody(oldPointer) || resetPointerSidecarsPresent(root)) {
      fail("GKX_WATCHER_RESET_GUARD_INVALID");
    }
    persistResetGuard(root, sealWatcherRecoveryRecord(plan.reset_guard), options.on_boundary);
    options.on_boundary?.("guard");
  } else {
    persistResetGuard(root, sealWatcherRecoveryRecord(plan.reset_guard), options.on_boundary);
  }
  options.assert_authority();

  const handle = openOrCreateResetTarget(root, plan, options.on_boundary, options.assert_authority);
  try {
    options.on_boundary?.("database");
    validateResetTargetComplete(handle, plan);
    const generationFile = String(targetPointer.journal_generation_file);
    const generationBytes = watcherCanonicalBytes(plan.new_generation);
    if (!watcherLeafExists(root, generationFile)) {
      writeNewWatcherFile(root, generationFile, generationBytes, 536_870_912);
      options.on_boundary?.("generation_descriptor");
    } else if (!readWatcherFile(root, generationFile, { maximum_bytes: 536_870_912 }).bytes.equals(generationBytes)) {
      fail("GKX_WATCHER_JOURNAL_GENERATION_INVALID");
    }
    const artifact = watcherPointerArtifact("journal", targetPointer);
    const persisted = persistWatcherPointerArtifact(root, artifact);
    if (!persisted.bytes.equals(artifact.bytes)) fail("GKX_WATCHER_JOURNAL_POINTER_INVALID");
    options.on_boundary?.("pointer_artifact");
    options.assert_authority();
    assertResetPointerGuardBytes(root, plan);
    if (resetPointerSidecarsPresent(root)) {
      recoverWatcherPointer({
        namespace: "journal", directory: root,
        prepare_target(commitDigest) {
          if (commitDigest !== (plan.reset as JsonRecord).reset_digest) fail("GKX_WATCHER_POINTER_GUARD_MISMATCH");
          options.assert_authority(); validateResetTargetComplete(handle, plan);
        },
        finalize_target(commitDigest) {
          if (commitDigest !== (plan.reset as JsonRecord).reset_digest) fail("GKX_WATCHER_POINTER_GUARD_MISMATCH");
          options.assert_authority(); validateResetTargetComplete(handle, plan);
        },
        on_boundary(boundary) { options.on_boundary?.(`pointer_${boundary}` as WatcherJournalResetBoundary); },
      });
    } else if (stableBody(fixed) === stableBody(oldPointer)) {
      publishWatcherPointer({
        namespace: "journal", directory: root, new_pointer: targetPointer, old_pointer: oldPointer,
        operation_intent_digest: String((plan.reset_guard as JsonRecord).guard_digest),
        target_commit_digest: String((plan.reset as JsonRecord).reset_digest),
        prepared_guard: plan.pointer_replace_guard,
        validate_guard(value) {
          if (stableBody(value) !== stableBody(plan.pointer_replace_guard)) fail("GKX_WATCHER_POINTER_GUARD_MISMATCH");
          sealWatcherJournalResetBundle(resetPlanBundle(plan), plan.old_journal_authority, value);
        },
        prepare_target() { options.assert_authority(); validateResetTargetComplete(handle, plan); },
        finalize_target() { options.assert_authority(); validateResetTargetComplete(handle, plan); },
        on_boundary(boundary) { options.on_boundary?.(`pointer_${boundary}` as WatcherJournalResetBoundary); },
      });
    }
    options.on_boundary?.("pointer");
  } finally {
    if (handle.database.isOpen) closeWatcherJournal(handle);
  }
  options.assert_authority();
  fixed = readWatcherPointer(root, "journal");
  if (fixed === null || stableBody(fixed) !== stableBody(targetPointer) || resetPointerSidecarsPresent(root)) {
    fail("GKX_WATCHER_POINTER_FIXED_MISMATCH");
  }
  if (watcherLeafExists(root, WATCHER_RESET_GUARD_FILE)) {
    const guard = readWatcherFile(root, WATCHER_RESET_GUARD_FILE);
    if (!guard.bytes.equals(watcherCanonicalBytes(plan.reset_guard))) fail("GKX_WATCHER_RESET_GUARD_INVALID");
    unlinkWatcherLeaf(root, WATCHER_RESET_GUARD_FILE, { expected_raw_sha256: guard.raw_sha256 });
    options.on_boundary?.("guard_removed");
  }
  if (!resetTargetIsStable(root, plan)) fail("WATCHER_JOURNAL_VALUE_INVALID");
}

type WatcherResetAuthorityWriteBoundary = `${"plan_stage" | "bridge_stage" | "executor_stage" | "old_lock" | "current_lock"}_${
  "created" | "partial_write" | "written" | "file_fsynced" | "parent_fsynced"
}`;

export type WatcherJournalResetBoundary = WatcherResetAuthorityWriteBoundary
  | "plan_stage" | "plan" | "claim" | "bridge_stage" | "bridge" | "executor_stage" | "executor"
  | "old_lock_removed" | "old_lock" | "current_lock" | "guard" | "reset_guard_stage" | "reset_guard"
  | "child" | "database_file" | "database_schema_commit" | "database_schema_checkpoint"
  | "database_seed_commit" | "database_seed_checkpoint" | "database_incomplete_removed" | "database_empty_removed" | "database"
  | "generation_descriptor" | "pointer_artifact" | "pointer" | "guard_removed" | "claim_removed"
  | "pointer_immutable_pointer" | "pointer_guard_stage" | "pointer_guard_linked" | "pointer_guard_stage_removed"
  | "pointer_temporary_pointer" | "pointer_target_prepared" | "pointer_fixed_pointer" | "pointer_target_finalized"
  | "pointer_guard_removed" | "plan_removed" | "executor_released" | "current_lock_released"
  | "terminal_claim" | "terminal_lock_removed" | "terminal_claim_removed";

export function resetWatcherJournal(options: {
  readonly watcher_directory: WatcherDirectoryCapability;
  readonly journal: WatcherJournalHandle;
  readonly host_lock: WatcherHostLockCapability;
  readonly outer_pointer: unknown;
  readonly outer_manifest: unknown;
  readonly expected_journal_generation_digest: string;
  readonly expected_coherent_manifest_digest: string;
  readonly on_boundary?: (boundary: WatcherJournalResetBoundary) => void;
}): Readonly<JsonRecord> {
  const lock = assertWatcherHostLock(options.host_lock);
  const outerPointer = sealWatcherRecoveryRecord(options.outer_pointer);
  const outerManifest = sealWatcherRecoveryRecord(options.outer_manifest);
  if (lock.operation !== "journal_reset" || lock.prior_journal_pointer_digest !== options.journal.pointer.pointer_digest
      || lock.prior_pointer_digest !== outerPointer.pointer_digest || lock.prior_coherent_manifest_digest !== outerManifest.coherent_manifest_digest
      || options.expected_journal_generation_digest !== options.journal.generation.journal_generation_digest
      || options.expected_coherent_manifest_digest !== outerManifest.coherent_manifest_digest) fail("GKX_WATCHER_EXPECTED_COORDINATE_MISMATCH");
  const audit = auditResetOutbox(options.journal, outerPointer, outerManifest);
  closeWatcherJournal(options.journal);
  secureDatabaseMode(options.journal.database_path);
  const databaseIdentity = stableJournalFileIdentity(options.journal.generation_directory, WATCHER_JOURNAL_DATABASE_FILE, "database");
  const walIdentity = optionalJournalFileIdentity(options.journal.generation_directory, "watcher-journal.sqlite-wal", "wal");
  const shmIdentity = optionalJournalFileIdentity(options.journal.generation_directory, "watcher-journal.sqlite-shm", "shm");
  const resetAt = watcherTimestamp();
  const resetId = watcherUuid7();
  const archiveBase = {
    contract_version: "gkos-watcher-journal-archive/1.0.0-draft.1",
    journal_instance_id: options.journal.generation.journal_instance_id,
    directory_leaf: options.journal.generation.directory_leaf,
    directory_device: options.journal.generation_directory.identity.device,
    directory_inode: options.journal.generation_directory.identity.inode,
    directory_mode: options.journal.generation_directory.identity.mode,
    database_identity: databaseIdentity,
    wal_identity: walIdentity,
    shm_identity: shmIdentity,
    outer_coherent_manifest_digest: outerManifest.coherent_manifest_digest,
    archived_at: resetAt,
  };
  const archive = sealWatcherRecoveryRecord({ ...archiveBase, archive_manifest_digest: watcherDigest(archiveBase) });
  const records = buildJournalRecords({
    vault_id: String(options.journal.meta.vault_id),
    configuration_digest: String(options.journal.meta.configuration_digest),
    policy_digest: String(options.journal.meta.policy_digest),
    effective_profile_digest: String(options.journal.meta.effective_profile_digest),
    anchor_coherent_manifest_digest: String(outerManifest.coherent_manifest_digest),
  }, String(options.journal.pointer.pointer_digest));
  const carry = resetCarryBundle(audit.ready, resetId, String(outerManifest.coherent_manifest_digest), resetAt);
  const carrySet = carry === null ? null : (carry.event_set_bundle as JsonRecord).event_set as JsonRecord;
  const carryActivation = carry === null ? null : carry.activation as JsonRecord;
  const resetBase = {
    contract_version: "gkos-watcher-journal-reset/1.0.0-draft.1",
    reset_id: resetId,
    prior_journal_generation_digest: options.journal.generation.journal_generation_digest,
    archive_manifest_digest: archive.archive_manifest_digest,
    new_journal_meta_digest: records.meta.meta_digest,
    new_journal_generation_digest: records.generation.journal_generation_digest,
    target_journal_pointer_digest: records.pointer.pointer_digest,
    outer_coherent_manifest_digest: outerManifest.coherent_manifest_digest,
    ready_event_count: audit.ready.length,
    reset_carry_event_set_digest: carrySet?.event_set_digest ?? null,
    reset_carry_activation_digest: carryActivation?.activation_digest ?? null,
    reset_at: resetAt,
  };
  const reset = sealWatcherRecoveryRecord({ ...resetBase, reset_digest: watcherDigest(resetBase) });
  const guardBase = {
    contract_version: "gkos-watcher-journal-reset-guard/1.0.0-draft.1",
    operation: "watcher_journal_reset",
    owner_nonce: randomBytes(16).toString("hex"),
    parent_device: options.journal.root.identity.device,
    parent_inode: options.journal.root.identity.inode,
    parent_mode: options.journal.root.identity.mode,
    guard_basename: WATCHER_RESET_GUARD_FILE,
    guard_stage_basename: WATCHER_RESET_GUARD_STAGE_FILE,
    old_journal_pointer_digest: options.journal.pointer.pointer_digest,
    old_journal_generation_digest: options.journal.generation.journal_generation_digest,
    outer_coherent_manifest_digest: outerManifest.coherent_manifest_digest,
    archive_manifest_digest: archive.archive_manifest_digest,
    new_journal_instance_id: records.meta.journal_instance_id,
    new_journal_directory_leaf: records.generation.directory_leaf,
    new_journal_meta_digest: records.meta.meta_digest,
    new_journal_generation_digest: records.generation.journal_generation_digest,
    reset_digest: reset.reset_digest,
    target_journal_pointer_digest: records.pointer.pointer_digest,
    ready_event_count: audit.ready.length,
    reset_carry_event_set_digest: carrySet?.event_set_digest ?? null,
    reset_carry_activation_digest: carryActivation?.activation_digest ?? null,
  };
  const guard = sealWatcherRecoveryRecord({ ...guardBase, guard_digest: watcherDigest(guardBase) });
  const pointerGuard = prepareWatcherPointerGuard({
    namespace: "journal", directory: options.journal.root,
    new_pointer: records.pointer, old_pointer: options.journal.pointer,
    operation_intent_digest: String(guard.guard_digest), target_commit_digest: String(reset.reset_digest),
  });
  const bundle = Object.freeze({
    old_meta: options.journal.meta, old_generation: options.journal.generation, old_pointer: options.journal.pointer,
    archive, reset, guard, new_meta: records.meta, new_generation: records.generation,
    target_pointer: records.pointer, reset_carry_bundle: carry,
  });
  sealWatcherJournalResetBundle(bundle, audit.authority, pointerGuard);
  const plan = resetRecoveryPlanRecord({
    lock, old_meta: options.journal.meta, old_generation: options.journal.generation, old_pointer: options.journal.pointer,
    outer_pointer: outerPointer, outer_manifest: outerManifest, old_journal_authority: audit.authority,
    archive, reset, reset_guard: guard, pointer_guard: pointerGuard, new_meta: records.meta,
    new_generation: records.generation, target_pointer: records.pointer, reset_carry_bundle: carry,
  });
  const assertLiveOriginalInterlock = (journalRoot = options.journal.root): void => {
    assertResetControlledNamespace(options.watcher_directory, journalRoot);
    assertLiveOriginalResetRecoveryNamespaceAbsent(options.watcher_directory, plan);
    const current = assertWatcherHostLock(options.host_lock);
    if (current.lock_digest !== lock.lock_digest) fail("GKX_WATCHER_HOST_LOCK_CHANGED");
  };
  const liveBoundary = (
    boundary: WatcherJournalResetBoundary,
    transitionDirectory?: WatcherDirectoryCapability,
  ): void => {
    options.on_boundary?.(boundary);
    // Recovery evidence appearing at any durable cut immediately retires the
    // live-original branch before it can perform the next mutation.
    assertLiveOriginalInterlock(transitionDirectory);
  };
  assertLiveOriginalInterlock();
  persistResetRecoveryPlan(options.journal.root, plan, liveBoundary);
  assertLiveOriginalInterlock();
  validateResetPlanPhysical(options.watcher_directory, options.journal.root, plan);
  resumeResetPlanTarget({
    journal_root: options.journal.root, plan,
    assert_authority() {
      assertLiveOriginalInterlock();
      const reopened = readResetRecoveryPlan(options.journal.root);
      if (reopened === null || stableBody(reopened.plan) !== stableBody(plan)) {
        fail("GKX_WATCHER_RESET_RECOVERY_PLAN_INVALID");
      }
    },
    on_boundary: liveBoundary,
  });
  const result = recoverWatcherJournalReset({
    watcher_root: options.watcher_directory, journal_root: options.journal.root,
    expected_journal_generation_digest: options.expected_journal_generation_digest,
    expected_coherent_manifest_digest: options.expected_coherent_manifest_digest,
    current_host_lock: options.host_lock, on_boundary: options.on_boundary,
  });
  if (result === null) fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  return result;
}

export function watcherJournalControlledLeaves(root: WatcherDirectoryCapability): readonly string[] {
  return listWatcherLeaves(root).filter((leaf) => leaf.startsWith("watcher-") || leaf.startsWith(".watcher-") || leaf.startsWith(".gkos-watcher-"));
}
