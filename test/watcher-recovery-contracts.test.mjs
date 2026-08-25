import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync, copyFileSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync,
  statSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import esbuild from "esbuild";
import * as core from "../dist/gkos-engine.mjs";
import * as watcher from "../dist/watcher-contracts.mjs";

const PACK = new URL("../contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1/", import.meta.url);
const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCHEMA_ROOT = "https://gkos.example/contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1/";
const EXPECTED_FILES = [
  "README.md",
  "TECHNICAL_README.md",
  "authority.schema.json",
  "batch.schema.json",
  "coherent-manifest.schema.json",
  "conformance.schema.json",
  "journal.schema.json",
  "pack-manifest.json",
  "sample-plan.schema.json",
  "source-removal.schema.json",
  "status.schema.json",
  "topology.schema.json",
  "transition.schema.json",
  "watcher-cli-fixture.json",
  "watcher-conformance-fixture.json",
  "watcher-recovery-fixture.json",
  "watcher-sample-plan.json",
  "watcher-storage-fixture.json",
];

const readJson = (name) => JSON.parse(readFileSync(new URL(name, PACK), "utf8"));
const rawSha = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const clone = (value) => structuredClone(value);
const codeUnitCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    assert.equal(Number.isFinite(value), true);
    if (Number.isInteger(value)) assert.equal(Number.isSafeInteger(value), true);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort(codeUnitCompare).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
function assertSelfDigest(value, field) {
  const material = clone(value);
  const actual = material[field];
  delete material[field];
  assert.equal(actual, rawSha(Buffer.from(canonicalJson(material))));
}
function reseal(value, field, changes) {
  const material = { ...clone(value), ...changes };
  delete material[field];
  return { ...material, [field]: rawSha(Buffer.from(canonicalJson(material))) };
}

function expectPhase4ImmutabilityFailure(operation) {
  assert.throws(operation, { message: "GKX_EVAL_QUALIFICATION_IMMUTABILITY_INVALID" });
}

function phase5Ajv() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  for (const name of EXPECTED_FILES.filter((item) => item.endsWith(".schema.json"))) ajv.addSchema(readJson(name));
  return ajv;
}

function executeSemanticCase(row) {
  const args = row.input.arguments;
  if (row.operation === "derive_graphiti_projection") return watcher.deriveWatcherGraphitiProjection(...args);
  if (row.operation === "normalize_canonical_graph") return watcher.normalizeWatcherCanonicalGkxGraph(...args);
  if (row.operation === "normalize_graph_delta") return watcher.normalizeWatcherGraphDelta(...args);
  if (row.operation === "seal_transition_chain") return watcher.sealWatcherTransitionChain(...args);
  if (row.operation === "seal_coherent_activation_bundle") return watcher.sealWatcherCoherentActivationBundle(...args);
  if (row.operation === "seal_failure_retry_bundle") return watcher.sealWatcherFailureRetryBundle(...args);
  if (row.operation === "seal_failure_retry_noop_bundle") return watcher.sealWatcherFailureRetryNoopBundle(...args);
  if (row.operation === "seal_source_removal_event_set_bundle") return watcher.sealSourceRemovalEventSetBundle(...args);
  if (row.operation === "seal_journal_reset_bundle") return watcher.sealWatcherJournalResetBundle(...args);
  if (row.operation === "seal_journal_reset_reconciliation_adoption_bundle") return watcher.sealWatcherJournalResetReconciliationAdoptionBundle(...args);
  if (row.operation === "seal_source_removal_receipt_bundle") return watcher.sealWatcherAdapterReceiptBundle(...args);
  if (row.operation === "seal_source_removal_adapter_verification_bundle") return watcher.sealWatcherAdapterVerificationBundle(...args);
  if (row.operation === "seal_status_bundle") return watcher.sealWatcherStatusBundle(...args);
  if (row.operation === "seal_measurement" || row.operation === "seal_record") return watcher.sealWatcherRecoveryRecord(...args);
  if (row.operation === "seal_pointer_recovery") return watcher.classifyWatcherPointerRecovery(...args);
  if (row.operation === "validate_path") return watcher.validateWatcherSourcePath(...args);
  if (row.operation === "validate_sql_authority") return watcher.validateWatcherSqlAuthority(...args);
  if (row.operation === "validate_cli_fixture") return watcher.validateWatcherCliFixture(...args);
  if (row.operation === "validate_pack") return watcher.validateWatcherPackBundle(...args);
  throw new Error(`unknown watcher semantic operation ${row.operation}`);
}

function semanticOutputDigest(operation, result) {
  const resultKind = operation === "seal_transition_chain" ? "record_array"
    : operation.startsWith("validate_") ? "null" : "record";
  return rawSha(Buffer.from(canonicalJson({
    contract_version: "gkos-watcher-conformance-operation-result/1.0.0-draft.1", operation, result_kind: resultKind, result,
  })));
}

const SQLITE_PRAGMA_EXPECTATIONS = Object.freeze({
  page_size: 4096,
  auto_vacuum: 0,
  encoding: "UTF-8",
  user_version: 1,
  foreign_keys: 1,
  trusted_schema: 0,
  locking_mode: "exclusive",
  synchronous: 2,
  journal_mode: "wal",
  wal_autocheckpoint: 0,
  temp_store: 2,
  max_page_count: 500000,
});

function sqliteObjectName(statement) {
  const match = /^CREATE (?:TABLE|INDEX) ([a-z0-9_]+)/u.exec(statement);
  assert.ok(match, statement);
  return match[1];
}

function sqliteCanonicalSql(statement) {
  return statement.endsWith(";") ? statement.slice(0, -1) : statement;
}

function exactFsIdentity(path) {
  const value = statSync(path, { bigint: true });
  return {
    dev: String(value.dev),
    ino: String(value.ino),
    mode: Number(value.mode),
    nlink: Number(value.nlink),
  };
}

function createSqlAuthority(DatabaseSync, storage, meta) {
  const container = mkdtempSync(join(tmpdir(), "gkos-watcher-sql-"));
  const authorityRoot = join(container, "authority");
  mkdirSync(authorityRoot, { mode: 0o700 });
  const databasePath = join(authorityRoot, "watcher-journal.sqlite");
  const database = new DatabaseSync(databasePath);
  for (const statement of storage.pragmas) database.exec(statement);
  for (const statement of storage.ddl) database.exec(statement);
  const body = Buffer.from(canonicalJson(meta), "utf8");
  database.prepare("INSERT INTO watcher_meta(singleton,journal_instance_id,meta_digest,body) VALUES(1,?,?,?)")
    .run(meta.journal_instance_id, meta.meta_digest, body);
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  return {
    container,
    authorityRoot,
    databasePath,
    database,
    parentIdentity: exactFsIdentity(authorityRoot),
    databaseIdentity: exactFsIdentity(databasePath),
    movedRoot: null,
  };
}

function closeSqlAuthority(authority) {
  if (authority.database !== null) {
    try { authority.database.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch {}
    authority.database.close();
    authority.database = null;
  }
}

function disposeSqlAuthority(authority) {
  closeSqlAuthority(authority);
  const expectedPrefix = `${resolve(tmpdir())}${sep}`;
  const target = resolve(authority.container);
  assert.equal(target.startsWith(expectedPrefix), true, "temporary SQLite authority remains inside the OS temp root");
  rmSync(target, { recursive: true, force: true });
}

function rebuildSqliteTable(database, objectName, mutate, columns) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(objectName);
  assert.equal(typeof row?.sql, "string", objectName);
  const next = mutate(row.sql);
  assert.notEqual(next, row.sql, objectName);
  const prior = `${objectName}_prior`;
  database.exec("PRAGMA foreign_keys=OFF");
  database.exec(`ALTER TABLE ${objectName} RENAME TO ${prior}`);
  database.exec(next);
  database.exec(`INSERT INTO ${objectName} (${columns.join(",")}) SELECT ${columns.join(",")} FROM ${prior}`);
  database.exec(`DROP TABLE ${prior}`);
  database.exec("PRAGMA foreign_keys=ON");
}

function applySqlAuthorityMutation(authority, row) {
  const { database, databasePath, authorityRoot } = authority;
  const mutation = row.recipe.mutation;
  if (row.recipe.recipe_kind === "body_scalar" && mutation === "body_digest_mismatch") {
    database.exec("UPDATE watcher_meta SET meta_digest='sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'");
    return;
  }
  if (row.recipe.recipe_kind === "body_scalar" && mutation === "noncanonical_body") {
    const body = database.prepare("SELECT body FROM watcher_meta WHERE singleton=1").get().body;
    database.prepare("UPDATE watcher_meta SET body=? WHERE singleton=1").run(Buffer.from(`${JSON.stringify(JSON.parse(Buffer.from(body).toString("utf8")), null, 2)}\n`, "utf8"));
    return;
  }
  if (mutation === "affinity_drift") {
    rebuildSqliteTable(database, "watcher_meta", (sql) => sql.replace("journal_instance_id TEXT NOT NULL", "journal_instance_id ANY NOT NULL"), ["singleton", "journal_instance_id", "meta_digest", "body"]);
    return;
  }
  if (mutation === "notnull_drift") {
    rebuildSqliteTable(database, "watcher_meta", (sql) => sql.replace("journal_instance_id TEXT NOT NULL UNIQUE", "journal_instance_id TEXT UNIQUE"), ["singleton", "journal_instance_id", "meta_digest", "body"]);
    return;
  }
  if (mutation === "column_order_drift") {
    rebuildSqliteTable(database, "watcher_meta", (sql) => sql.replace(
      "journal_instance_id TEXT NOT NULL UNIQUE, meta_digest TEXT NOT NULL UNIQUE",
      "meta_digest TEXT NOT NULL UNIQUE, journal_instance_id TEXT NOT NULL UNIQUE",
    ), ["singleton", "journal_instance_id", "meta_digest", "body"]);
    return;
  }
  if (mutation === "primary_key_drift") {
    rebuildSqliteTable(database, "watcher_meta", (sql) => sql.replace("singleton INTEGER PRIMARY KEY", "singleton INTEGER UNIQUE"), ["singleton", "journal_instance_id", "meta_digest", "body"]);
    return;
  }
  if (mutation === "foreign_key_drift") {
    rebuildSqliteTable(database, "observations", (sql) => sql.replace("REFERENCES batches(batch_id)", "REFERENCES normalized_plans(batch_id)"), ["batch_id", "observation_digest", "authority_digest", "artifact_file", "raw_sha256", "byte_size", "body"]);
    return;
  }
  if (mutation === "missing_object") {
    database.exec("DROP INDEX transitions_state_idx");
    return;
  }
  if (mutation === "extra_object") {
    database.exec("CREATE TABLE unexpected_table(value TEXT) STRICT");
    return;
  }
  if (mutation === "trigger_added") {
    database.exec("CREATE TRIGGER unexpected_trigger AFTER INSERT ON watcher_meta BEGIN SELECT 1; END");
    return;
  }
  if (mutation === "view_added") {
    database.exec("CREATE VIEW unexpected_view AS SELECT singleton FROM watcher_meta");
    return;
  }
  if (mutation === "virtual_table_added") {
    try {
      database.exec("CREATE VIRTUAL TABLE unexpected_virtual USING rtree(id,min_value,max_value)");
    } catch (error) {
      if (!/no such module: rtree/u.test(String(error?.message))) throw error;
      database.exec("PRAGMA writable_schema=ON");
      database.exec("INSERT INTO sqlite_schema(type,name,tbl_name,rootpage,sql) VALUES('table','unexpected_virtual','unexpected_virtual',0,'CREATE VIRTUAL TABLE unexpected_virtual USING unavailable_test_module')");
      database.exec("PRAGMA writable_schema=OFF");
    }
    return;
  }
  if (mutation === "pragma_drift") {
    database.exec("PRAGMA synchronous=NORMAL");
    return;
  }
  if (row.recipe.recipe_kind === "outbox" && mutation === "body_digest_mismatch") {
    database.prepare("INSERT INTO source_removal_occurrences(occurrence_digest,source_id,source_path,source_digest,prior_coherent_manifest_digest,prior_topology_snapshot_digest,body) VALUES(?,?,?,?,?,?,?)")
      .run("sha256:" + "1".repeat(64), "123e4567-e89b-42d3-a456-426614174000", "policy/deleted.md", "sha256:" + "2".repeat(64), "sha256:" + "3".repeat(64), "sha256:" + "4".repeat(64), Buffer.from("{}"));
    return;
  }
  if (mutation === "integrity_failure") {
    database.exec("PRAGMA foreign_keys=OFF");
    database.prepare("INSERT INTO source_removal_events(event_digest,occurrence_digest,adapter_binding_digest,delivery_mode,body) VALUES(?,?,?,?,?)")
      .run("sha256:" + "5".repeat(64), "sha256:" + "6".repeat(64), null, "local_only", Buffer.from("{}"));
    database.exec("PRAGMA foreign_keys=ON");
    return;
  }
  if (mutation === "unknown_reserved_leaf") {
    writeFileSync(join(authorityRoot, ".gkos-watcher-unknown.guard"), "retained evidence\n", { flag: "wx", mode: 0o600 });
    return;
  }
  if (["alias_swap", "hardlink", "mode_widened", "parent_swap", "reparse", "sqlite_replacement", "corrupt_database"].includes(mutation)) {
    closeSqlAuthority(authority);
  }
  if (mutation === "hardlink") {
    linkSync(databasePath, join(authorityRoot, "watcher-journal.sqlite.alias"));
    return;
  }
  if (mutation === "alias_swap") {
    const original = join(authorityRoot, "watcher-journal.sqlite.original");
    renameSync(databasePath, original);
    linkSync(original, databasePath);
    return;
  }
  if (mutation === "mode_widened") {
    chmodSync(databasePath, process.platform === "win32" ? 0o444 : 0o666);
    return;
  }
  if (mutation === "sqlite_replacement") {
    const bytes = readFileSync(databasePath);
    unlinkSync(databasePath);
    writeFileSync(databasePath, bytes, { flag: "wx", mode: 0o600 });
    return;
  }
  if (mutation === "parent_swap") {
    const oldRoot = join(authority.container, "authority-original");
    renameSync(authorityRoot, oldRoot);
    mkdirSync(authorityRoot, { mode: 0o700 });
    copyFileSync(join(oldRoot, basename(databasePath)), databasePath);
    authority.movedRoot = oldRoot;
    return;
  }
  if (mutation === "reparse") {
    const realRoot = join(authority.container, "authority-real");
    renameSync(authorityRoot, realRoot);
    symlinkSync(realRoot, authorityRoot, process.platform === "win32" ? "junction" : "dir");
    authority.movedRoot = realRoot;
    return;
  }
  if (mutation === "corrupt_database") {
    writeFileSync(databasePath, Buffer.from("not-a-sqlite-database", "utf8"));
    return;
  }
  assert.fail(`unimplemented SQLite authority mutation ${row.case_id}/${mutation}`);
}

function inspectSqlAuthority(DatabaseSync, authority, storage) {
  const rootLstat = lstatSync(authority.authorityRoot);
  if (!rootLstat.isDirectory() || rootLstat.isSymbolicLink()) return "WATCHER_JOURNAL_IDENTITY_INVALID";
  const parentIdentity = exactFsIdentity(authority.authorityRoot);
  if (parentIdentity.dev !== authority.parentIdentity.dev || parentIdentity.ino !== authority.parentIdentity.ino) return "WATCHER_JOURNAL_IDENTITY_INVALID";
  if (readdirSync(authority.authorityRoot).some((leaf) => leaf === ".gkos-watcher-unknown.guard")) return "WATCHER_POINTER_RECOVERY_REQUIRED";
  const databaseLstat = lstatSync(authority.databasePath);
  const databaseIdentity = exactFsIdentity(authority.databasePath);
  if (!databaseLstat.isFile() || databaseLstat.isSymbolicLink() || databaseIdentity.dev !== authority.databaseIdentity.dev
      || databaseIdentity.ino !== authority.databaseIdentity.ino || databaseIdentity.nlink !== authority.databaseIdentity.nlink
      || databaseIdentity.mode !== authority.databaseIdentity.mode) return "WATCHER_JOURNAL_IDENTITY_INVALID";

  let database = authority.database;
  if (database === null) {
    try { database = new DatabaseSync(authority.databasePath, { readOnly: true }); }
    catch { return "WATCHER_JOURNAL_INTEGRITY_INVALID"; }
  }
  try {
    let integrity;
    try { integrity = database.prepare("PRAGMA integrity_check").get().integrity_check; }
    catch { return "WATCHER_JOURNAL_INTEGRITY_INVALID"; }
    if (integrity !== "ok" || database.prepare("PRAGMA foreign_key_check").all().length !== 0) return "WATCHER_JOURNAL_INTEGRITY_INVALID";

    for (const [name, expected] of Object.entries(SQLITE_PRAGMA_EXPECTATIONS)) {
      const actual = database.prepare(`PRAGMA ${name}`).get()[name];
      if (String(actual).toLowerCase() !== String(expected).toLowerCase()) return "WATCHER_JOURNAL_SCHEMA_INVALID";
    }
    const expectedObjects = new Map(storage.ddl.map((statement) => [sqliteObjectName(statement), sqliteCanonicalSql(statement)]));
    const actualObjects = database.prepare("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    if (actualObjects.length !== expectedObjects.size || actualObjects.some((row) => expectedObjects.get(row.name) !== row.sql)) {
      return "WATCHER_JOURNAL_SCHEMA_INVALID";
    }

    const metaRows = database.prepare("SELECT journal_instance_id,meta_digest,body FROM watcher_meta ORDER BY singleton").all();
    if (metaRows.length !== 1) return "WATCHER_JOURNAL_VALUE_INVALID";
    const metaBytes = Buffer.from(metaRows[0].body);
    let meta;
    try { meta = JSON.parse(metaBytes.toString("utf8")); } catch { return "WATCHER_JOURNAL_VALUE_INVALID"; }
    if (canonicalJson(meta) !== metaBytes.toString("utf8")) return "WATCHER_JOURNAL_VALUE_INVALID";
    try { watcher.sealWatcherRecoveryRecord(meta); } catch { return "WATCHER_JOURNAL_VALUE_INVALID"; }
    if (metaRows[0].journal_instance_id !== meta.journal_instance_id || metaRows[0].meta_digest !== meta.meta_digest) return "WATCHER_JOURNAL_VALUE_INVALID";

    const occurrences = database.prepare("SELECT occurrence_digest,source_id,source_path,source_digest,prior_coherent_manifest_digest,prior_topology_snapshot_digest,body FROM source_removal_occurrences").all();
    for (const row of occurrences) {
      let body;
      try { body = JSON.parse(Buffer.from(row.body).toString("utf8")); } catch { return "GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE"; }
      try { watcher.sealWatcherRecoveryRecord(body); } catch { return "GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE"; }
      if (row.occurrence_digest !== body.occurrence_digest || row.source_id !== body.source_id || row.source_path !== body.source_path
          || row.source_digest !== body.source_digest || row.prior_coherent_manifest_digest !== body.prior_coherent_manifest_digest
          || row.prior_topology_snapshot_digest !== body.prior_topology_snapshot_digest) return "GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE";
    }
    return null;
  } finally {
    if (authority.database === null) database.close();
  }
}

test("Phase5 watcher pack is exact, self-bound, and generator-byte-reproducible", () => {
  assert.deepEqual(readdirSync(PACK).sort(), EXPECTED_FILES);
  const manifest = readJson("pack-manifest.json");
  watcher.sealWatcherRecoveryRecord(manifest);
  assert.equal(manifest.file_count, 17);
  assert.equal(manifest.files.some((row) => row.file === "pack-manifest.json"), false);
  assert.deepEqual(manifest.files.map((row) => row.file), EXPECTED_FILES.filter((name) => name !== "pack-manifest.json").sort());
  assert.equal(manifest.total_bytes, manifest.files.reduce((sum, row) => sum + row.byte_size, 0));
  const selfReferential = reseal(manifest, "pack_digest", {
    files: [...manifest.files, { file: "pack-manifest.json", byte_size: 1, raw_sha256: "sha256:" + "0".repeat(64) }],
    file_count: 18,
    total_bytes: manifest.total_bytes + 1,
  });
  assert.throws(() => watcher.sealWatcherRecoveryRecord(selfReferential), { code: "GKX_WATCHER_CONTRACT_PACK_INVALID" });
  const reordered = reseal(manifest, "pack_digest", { files: [manifest.files[1], manifest.files[0], ...manifest.files.slice(2)] });
  assert.throws(() => watcher.sealWatcherRecoveryRecord(reordered), { code: "GKX_WATCHER_CONTRACT_PACK_INVALID" });
  for (const [file, field] of [
    ["watcher-cli-fixture.json", "fixture_digest"],
    ["watcher-conformance-fixture.json", "conformance_digest"],
    ["watcher-recovery-fixture.json", "fixture_digest"],
    ["watcher-storage-fixture.json", "fixture_digest"],
  ]) assertSelfDigest(readJson(file), field);
  for (const row of manifest.files) {
    const bytes = readFileSync(new URL(row.file, PACK));
    assert.equal(bytes.length, row.byte_size, row.file);
    assert.equal(rawSha(bytes), row.raw_sha256, row.file);
    assert.equal(bytes.includes(0x0d), false, `${row.file} has no CR bytes`);
    assert.equal(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, false, `${row.file} has no BOM`);
    if (row.file === "watcher-sample-plan.json") assert.notEqual(bytes.at(-1), 0x0a, "ratified compact SamplePlan has no LF");
    else assert.equal(bytes.at(-1), 0x0a, `${row.file} has one terminal LF`);
    assert.equal(bytes.toString("utf8").toLowerCase().includes(["hyp", "atia"].join("")), false, `${row.file} is provider-neutral`);
  }
  const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
  const governedPaths = EXPECTED_FILES.map((name) => `contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1/${name}`);
  const attributes = execFileSync("git", ["check-attr", "eol", "--", ...governedPaths], {
    cwd: repositoryRoot, encoding: "utf8",
  }).trim().split(/\r?\n/u);
  assert.equal(attributes.length, EXPECTED_FILES.length);
  assert.equal(attributes.every((line) => line.endsWith(": eol: lf")), true, "all watcher pack leaves are checkout-stable LF");

  const before = new Map(EXPECTED_FILES.map((name) => [name, rawSha(readFileSync(new URL(name, PACK)))]));
  execFileSync(process.execPath, ["scripts/generate-watcher-recovery-source-bundle.mjs"], {
    cwd: repositoryRoot, stdio: "pipe",
  });
  assert.deepEqual(new Map(EXPECTED_FILES.map((name) => [name, rawSha(readFileSync(new URL(name, PACK)))])), before);
});

test("frozen Phase3 ingest pack is raw-byte stable on every checkout", () => {
  const root = new URL("../contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/", import.meta.url);
  const names = readdirSync(root).sort(codeUnitCompare);
  assert.equal(names.length, 21);
  const rows = names.map((name) => {
    const bytes = readFileSync(new URL(name, root));
    return `${name}|${bytes.length}|${rawSha(bytes)}`;
  });
  assert.equal(rows.reduce((total, row) => total + Number(row.split("|")[1]), 0), 248079);
  assert.equal(rawSha(Buffer.from(`${rows.join("\n")}\n`, "utf8")),
    "sha256:dd19bcc71ffb7b77f08603c37df352eb24a0381f3d233d718f1019ecf4f1e323");
  const paths = names.map((name) => `contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/${name}`);
  const attributes = execFileSync("git", ["check-attr", "text", "eol", "--", ...paths], {
    cwd: REPOSITORY_ROOT, encoding: "utf8",
  }).trim().split(/\r?\n/u);
  assert.equal(attributes.length, names.length * 2);
  for (let index = 0; index < attributes.length; index += 2) {
    assert.equal(attributes[index].endsWith(": text: set"), true);
    assert.equal(attributes[index + 1].endsWith(": eol: lf"), true);
  }
});

test("Phase4 qualification protects the exact reviewed Slice-B status and path inventories", async () => {
  const container = mkdtempSync(join(tmpdir(), "gkos-phase4-sliceb-compatibility-"));
  const target = resolve(container);
  assert.equal(target.startsWith(`${resolve(tmpdir())}${sep}`), true);
  const git = (cwd, args, options = {}) => execFileSync("git", args, {
    cwd,
    encoding: Object.hasOwn(options, "encoding") ? options.encoding : "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  try {
    const runnerFile = join(container, "phase4-qualification-runner.mjs");
    esbuild.buildSync({
      entryPoints: [join(REPOSITORY_ROOT, "scripts", "run-retrieval-observation-qualification.mjs")],
      bundle: true,
      write: true,
      outfile: runnerFile,
      format: "esm",
      platform: "node",
      target: "node22",
      logLevel: "silent",
    });
    const runner = await import(pathToFileURL(runnerFile).href);
    const head = "7b5262baee9fcda23d50b0cee0c4977d6e4305e7";
    assert.equal(git(REPOSITORY_ROOT, ["cat-file", "-t", head]).trim(), "commit");
    const main = join(container, "reviewed-slice-b");
    git(REPOSITORY_ROOT, ["clone", "--quiet", "--shared", REPOSITORY_ROOT, main]);
    git(main, ["checkout", "--quiet", "--detach", head]);
    assert.equal(git(main, ["status", "--porcelain=v1"]), "");
    assert.equal(git(main, ["rev-parse", "HEAD"]).trim(), head);
    assert.doesNotThrow(() => runner.verifySliceBProtectedInputsForTest(main, head));
    const immutable = await runner.verifyFrozenQualificationInputsForTest(main);
    assert.equal(immutable.phase4_pack_file_count, 37);

    const baselineRaw = git(main, [
      "ls-tree", "-r", "--name-only", "-z", "ed3a7552b1d4a705c1b1a722b07255e89ec42186", "--", "src", "bin",
    ], { encoding: null });
    const baselineRoots = baselineRaw.toString("utf8").slice(0, -1).split("\0");
    const baselinePaths = [...baselineRoots,
      "package.json", "package-lock.json",
      "test/retrieval-evaluation-cli.test.mjs", "test/fixtures/retrieval-evaluation-cli-phase4.json",
    ].sort(codeUnitCompare);
    assert.equal(baselinePaths.length, 112);
    assert.equal(rawSha(Buffer.from(`${baselinePaths.join("\n")}\n`, "utf8")),
      "sha256:f88846fdaf91e59f3e80780b787340b82e5a7177c474518aa901f63046c9478f");
    const currentRaw = git(main, ["ls-files", "-z", "--", "src", "bin"], { encoding: null });
    const currentRoots = currentRaw.toString("utf8").slice(0, -1).split("\0").sort(codeUnitCompare);
    const baselineRootSet = new Set(baselineRoots);
    const additions = currentRoots.filter((path) => !baselineRootSet.has(path));
    assert.deepEqual(additions, [
      "bin/gkos.mjs",
      "src/ingest/source-scan.ts",
      "src/watcher/cli.ts",
      "src/watcher/contracts.ts",
      "src/watcher/coordinator.ts",
      "src/watcher/fs-authority.ts",
      "src/watcher/host.ts",
      "src/watcher/index-validation-hook.ts",
      "src/watcher/journal.ts",
      "src/watcher/pointer.ts",
      "src/watcher/removal-adapter.ts",
      "src/watcher/service.ts",
    ]);
    assert.equal(rawSha(Buffer.from(`${additions.join("\n")}\n`, "utf8")),
      "sha256:a812a6378310da741ed009d3123498050794c4d7ff5f1e1d305ed10b0175fa54");

    const sourcePath = join(main, "src", "gkx23.ts");
    const sourceBytes = readFileSync(sourcePath);
    writeFileSync(sourcePath, Buffer.concat([sourceBytes, Buffer.from("\n", "utf8")]));
    expectPhase4ImmutabilityFailure(() => runner.verifySliceBProtectedInputsForTest(main));
    writeFileSync(sourcePath, sourceBytes);
    assert.doesNotThrow(() => runner.verifySliceBProtectedInputsForTest(main));

    const binPath = join(main, "bin", "gkx.mjs");
    const binBytes = readFileSync(binPath);
    const binMode = statSync(binPath).mode & 0o777;
    unlinkSync(binPath);
    expectPhase4ImmutabilityFailure(() => runner.verifySliceBProtectedInputsForTest(main));
    writeFileSync(binPath, binBytes, { mode: binMode });
    chmodSync(binPath, binMode);
    assert.doesNotThrow(() => runner.verifySliceBProtectedInputsForTest(main));

    const cliTestPath = join(main, "test", "retrieval-evaluation-cli.test.mjs");
    const renamedCliTestPath = `${cliTestPath}.moved`;
    renameSync(cliTestPath, renamedCliTestPath);
    expectPhase4ImmutabilityFailure(() => runner.verifySliceBProtectedInputsForTest(main));
    renameSync(renamedCliTestPath, cliTestPath);
    assert.doesNotThrow(() => runner.verifySliceBProtectedInputsForTest(main));

    git(main, ["update-index", "--chmod=+x", "src/gkx23.ts"]);
    expectPhase4ImmutabilityFailure(() => runner.verifySliceBProtectedInputsForTest(main));
    git(main, ["update-index", "--chmod=-x", "src/gkx23.ts"]);
    assert.doesNotThrow(() => runner.verifySliceBProtectedInputsForTest(main));

    const packagePath = join(main, "package.json");
    const packageBytes = readFileSync(packagePath);
    writeFileSync(packagePath, Buffer.concat([packageBytes, Buffer.from(" ", "utf8")]));
    expectPhase4ImmutabilityFailure(() => runner.verifySliceBProtectedInputsForTest(main));
    writeFileSync(packagePath, packageBytes);
    assert.doesNotThrow(() => runner.verifySliceBProtectedInputsForTest(main));

    for (const authorized of ["src/watcher/host.ts", "scripts/run-retrieval-observation-qualification.mjs"]) {
      const path = join(main, ...authorized.split("/"));
      const bytes = readFileSync(path);
      writeFileSync(path, Buffer.concat([bytes, Buffer.from("\n", "utf8")]));
      expectPhase4ImmutabilityFailure(() => runner.verifySliceBProtectedInputsForTest(main));
      writeFileSync(path, bytes);
      assert.doesNotThrow(() => runner.verifySliceBProtectedInputsForTest(main));
    }

    const createClone = (label) => {
      const cloneRoot = join(container, label);
      git(main, ["clone", "--quiet", "--shared", main, cloneRoot]);
      git(cloneRoot, ["config", "user.name", "GKOS qualification fixture"]);
      git(cloneRoot, ["config", "user.email", "fixture@example.invalid"]);
      git(cloneRoot, ["config", "commit.gpgsign", "false"]);
      return cloneRoot;
    };

    for (const [label, extraPath] of [
      ["extra-watcher", "src/watcher/extra.ts"],
      ["extra-nonwatcher", "src/unratified-phase5.ts"],
    ]) {
      const cloneRoot = createClone(label);
      writeFileSync(join(cloneRoot, extraPath), "export const unratified = true;\n", "utf8");
      git(cloneRoot, ["add", "--", extraPath]);
      git(cloneRoot, ["commit", "--quiet", "-m", `fixture: ${label}`]);
      expectPhase4ImmutabilityFailure(() => runner.verifySliceBProtectedInputsForTest(cloneRoot));
    }

    const missing = createClone("missing-authorized-addition");
    git(missing, ["rm", "--quiet", "src/watcher/host.ts"]);
    git(missing, ["commit", "--quiet", "-m", "fixture: missing authorized addition"]);
    expectPhase4ImmutabilityFailure(() => runner.verifySliceBProtectedInputsForTest(missing));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("the exact journal DDL is executable and all-and-only", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const storage = readJson("watcher-storage-fixture.json");
  const database = new DatabaseSync(":memory:");
  try {
    for (const statement of storage.pragmas.filter((value) => !value.startsWith("PRAGMA journal_mode=") && !value.startsWith("PRAGMA locking_mode="))) {
      database.exec(statement);
    }
    for (const statement of storage.ddl) database.exec(statement);
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
    assert.deepEqual(tables, ["activated_source_removal_event_sets", "activation_intents", "activation_outcomes", "active_coherent", "batches", "journal_resets", "normalized_plans", "observations", "source_removal_adapter_responses", "source_removal_event_set_members", "source_removal_event_sets", "source_removal_events", "source_removal_occurrences", "source_removal_receipts", "transitions", "watcher_meta"]);
    const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name").all().map((row) => row.name);
    assert.deepEqual(indexes, ["batches_terminal_idx", "source_removal_ready_idx", "transitions_state_idx"]);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  } finally {
    database.close();
  }
});

test("all 24 SQLite authority recipes execute one real mutation against a fresh canonical authority", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const storage = readJson("watcher-storage-fixture.json");
  const conformance = readJson("watcher-conformance-fixture.json");
  const resetCase = conformance.semantic_cases.find((row) => row.case_id === "journal-reset-all-and-only");
  const meta = resetCase.input.arguments[0].old_meta;
  assert.equal(storage.sqlite_authority_cases.length, 24);
  assert.equal(new Set(storage.sqlite_authority_cases.map((row) => row.case_id)).size, 24);
  const executed = [];
  for (const row of storage.sqlite_authority_cases) {
    const authority = createSqlAuthority(DatabaseSync, storage, meta);
    try {
      if (!row.expectation.expected_valid) applySqlAuthorityMutation(authority, row);
      const actualReason = inspectSqlAuthority(DatabaseSync, authority, storage);
      assert.equal(actualReason, row.expectation.expected_reason, row.case_id);
      let semanticCode = null;
      try { watcher.validateWatcherSqlAuthority(row.recipe); } catch (error) { semanticCode = error?.code ?? String(error); }
      const expectedCode = row.expectation.expected_valid ? null
        : row.expectation.expected_reason === "GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE" ? "GKX_WATCHER_CONTRACT_RESET_INVALID"
          : ["WATCHER_JOURNAL_IDENTITY_INVALID", "WATCHER_POINTER_RECOVERY_REQUIRED"].includes(row.expectation.expected_reason)
            ? "GKX_WATCHER_CONTRACT_POINTER_INVALID" : "GKX_WATCHER_CONTRACT_SQL_INVALID";
      assert.equal(semanticCode, expectedCode, `${row.case_id} pure recipe/error mapping`);
      executed.push(row.case_id);
    } finally {
      disposeSqlAuthority(authority);
    }
  }
  assert.deepEqual(executed, storage.sqlite_authority_cases.map((row) => row.case_id));
});

test("recovery, status CLI, storage limits, and reset matrices are exact", () => {
  const conformance = readJson("watcher-conformance-fixture.json");
  const recovery = readJson("watcher-recovery-fixture.json");
  const cli = readJson("watcher-cli-fixture.json");
  const storage = readJson("watcher-storage-fixture.json");
  const categories = ["event_cases", "transition_cases", "topology_cases", "pointer_cases", "crash_cases", "source_removal_cases", "status_control_cases", "provider_cases", "path_identity_cases", "shutdown_cases"];
  const caseIds = conformance.semantic_cases.map((row) => row.case_id);
  const categorized = categories.flatMap((name) => recovery[name]);
  assert.equal(new Set(categorized).size, categorized.length);
  assert.deepEqual(categorized.slice().sort(), caseIds.slice().sort());
  assert.equal(recovery.event_cases.length, 24);
  watcher.validateWatcherCliFixture(cli);
  assert.equal(cli.state_fixtures.length, 7);
  assert.equal(cli.commands.every((row) => row.argv_template.length >= 1 && row.argv_template.length <= 9), true);
  assert.deepEqual(storage.limits, {
    admission_formula: "projected_database_bytes<=2048000000&&projected_database_bytes+wal_upper+67108864<=4294967296", aggregate_bytes_max: 4294967296,
    blob_bytes_per_transaction_max: 33554432, database_projected_bytes_max: 2048000000,
    dirty_page_upper_formula: "ceil(blob_bytes/4096)+4*mutated_rows+4096", mutated_rows_per_transaction_max: 10000,
    observation_artifact_bytes_max: 4194304, page_size_bytes: 4096, plan_artifact_bytes_max: 536870912,
    post_reopen_formula: "current_database_bytes+wal_bytes+shm_bytes<=4294967296", projected_database_bytes_formula: "current_database_bytes+dirty_page_upper*4096",
    raw_graph_artifact_bytes_max: 536870912, shm_reservation_bytes: 67108864, source_rows_max: 1000000,
    topology_artifact_bytes_max: 536870912, wal_frame_bytes: 4120, wal_header_bytes: 32, wal_upper_formula: "32+dirty_page_upper*4120",
  });
  assert.deepEqual(storage.journal_reset_recovery.removal_order, [
    "nested_pointer_guard", "reset_guard", "terminal_host_lock_transition", "root_claim_if_any",
    "recovery_plan", "executor_selector", "current_host_lock",
  ]);
  assert.deepEqual(storage.journal_reset_recovery.authority_predicates,
    ["dead_owner_recovered", "live_original", "stable_cleanup"]);
  assert.equal(storage.journal_reset_recovery.recoverable_states.length, 8);
  assert.deepEqual(storage.journal_reset_recovery.sqlite_states.map((row) => row.state),
    ["C0", "C1", "C2a", "C2b", "C3", "C4", "C5"]);
  for (const row of [...storage.admission_boundary_cases, ...storage.sqlite_authority_cases]) {
    let code = null;
    try { watcher.validateWatcherSqlAuthority(row.recipe); } catch (error) { code = error.code; }
    assert.equal(code === null, row.expectation.expected_valid, row.case_id);
  }
});

test("all ten strict schemas consume the exhaustive structural case matrix", () => {
  const schemas = EXPECTED_FILES.filter((item) => item.endsWith(".schema.json"));
  assert.equal(schemas.length, 10);
  const ajv = phase5Ajv();
  const fixture = readJson("watcher-conformance-fixture.json");
  assert.equal(fixture.status, "frozen");
  assert.equal(fixture.frozen, true);
  const seenSchemas = new Set();
  const seenCases = new Set();
  const structurallyCoveredVersions = new Set();
  for (const row of fixture.schema_cases) {
    assert.equal(seenCases.has(row.case_id), false, row.case_id);
    seenCases.add(row.case_id);
    seenSchemas.add(row.schema_file);
    const schema = readJson(row.schema_file);
    const validate = ajv.getSchema(schema.$id);
    assert.ok(validate, row.schema_file);
    assert.equal(validate(row.value), row.expected_valid, `${row.case_id}: ${JSON.stringify(validate.errors)}`);
    if (row.expected_valid && typeof row.value?.contract_version === "string") {
      if (row.value.contract_version === watcher.WATCHER_CONVERGENCE_SAMPLE_PLAN_VERSION) {
        watcher.sealWatcherConvergenceSamplePlan(row.value);
      } else if (row.value.contract_version === "gkos-watcher-cli-fixture/1.0.0-draft.1") {
        watcher.validateWatcherCliFixture(row.value);
      } else if (["gkos-watcher-storage-fixture/1.0.0-draft.1", "gkos-watcher-recovery-fixture/1.0.0-draft.1"].includes(row.value.contract_version)) {
        assertSelfDigest(row.value, "fixture_digest");
      } else {
        watcher.sealWatcherRecoveryRecord(row.value);
        structurallyCoveredVersions.add(row.value.contract_version);
      }
    }
  }
  // The manifest is sealed by the private runtime because it describes the
  // other schema/fixture leaves and intentionally has no self-referential row.
  assert.deepEqual([...seenSchemas].sort(), schemas.sort());
  const conformanceSchema = readJson("conformance.schema.json");
  const validateConformance = ajv.getSchema(conformanceSchema.$id);
  assert.equal(validateConformance(fixture), true, JSON.stringify(validateConformance.errors));
  assert.deepEqual([...structurallyCoveredVersions].sort(), watcher.watcherContractVersions().filter((version) => ![
    "gkos-watcher-recovery-pack-manifest/1.0.0-draft.1",
    "gkos-watcher-source-removal-membership-sequence/1.0.0-draft.1",
  ].includes(version)));
});

test("schemas use absolute ownership-safe references and close only complete objects", () => {
  const schemaNames = EXPECTED_FILES.filter((item) => item.endsWith(".schema.json"));
  const ownerByDefinition = new Map();
  let absoluteReferenceCount = 0;
  let closedObjectCount = 0;
  const visit = (value, schemaName, partialCompositionArm = false) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, schemaName, partialCompositionArm);
      return;
    }
    if (value === null || typeof value !== "object") return;
    if (Object.hasOwn(value, "$ref")) {
      assert.equal(typeof value.$ref, "string", schemaName);
      assert.equal(value.$ref.startsWith(SCHEMA_ROOT), true, `${schemaName}: ${value.$ref}`);
      absoluteReferenceCount += 1;
    }
    if (!partialCompositionArm && value.type === "object" && Object.hasOwn(value, "properties") && Array.isArray(value.required)) {
      assert.equal(value.additionalProperties, false, `${schemaName} complete object additionalProperties`);
      assert.equal(value.unevaluatedProperties, false, `${schemaName} complete object unevaluatedProperties`);
      closedObjectCount += 1;
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, schemaName, partialCompositionArm || key === "if" || key === "then");
    }
  };
  for (const schemaName of schemaNames) {
    const schema = readJson(schemaName);
    for (const definition of Object.keys(schema.$defs ?? {})) {
      assert.equal(ownerByDefinition.has(definition), false, `${definition} duplicated by ${ownerByDefinition.get(definition)} and ${schemaName}`);
      ownerByDefinition.set(definition, schemaName);
    }
    visit(schema, schemaName);
  }
  assert.equal(ownerByDefinition.get("acceptedSource"), "topology.schema.json");
  assert.equal(ownerByDefinition.get("rejectedSource"), "topology.schema.json");
  assert.ok(absoluteReferenceCount > 50);
  assert.ok(closedObjectCount > 50);
  const topology = readJson("watcher-conformance-fixture.json").schema_cases.find((row) => row.case_id === "topology-valid").value;
  const validate = phase5Ajv().getSchema(readJson("topology.schema.json").$id);
  assert.equal(validate(topology), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...topology, accepted_sources: [{ ...topology.accepted_sources[0], unexpected: true }] }), false);
});

test("portable schema source-path lengths are supplemented by exact UTF-8 byte sealing", () => {
  const fixture = readJson("watcher-conformance-fixture.json");
  const observation = fixture.schema_cases.find((row) => row.case_id === "observation-valid").value;
  const schema = readJson("batch.schema.json");
  const validate = phase5Ajv().getSchema(schema.$id);
  const exact1024 = reseal(observation, "observation_digest", { observed_paths: ["é".repeat(512)] });
  const bytes1026 = reseal(observation, "observation_digest", { observed_paths: ["é".repeat(513)] });
  assert.equal(validate(exact1024), true, JSON.stringify(validate.errors));
  assert.equal(validate(bytes1026), true, JSON.stringify(validate.errors));
  watcher.sealWatcherRecoveryRecord(exact1024);
  assert.throws(() => watcher.sealWatcherRecoveryRecord(bytes1026), { code: "GKX_WATCHER_CONTRACT_PATH_INVALID" });
  // A lone UTF-16 surrogate cannot be serialized into any governed fixture;
  // construct it only in memory and prove the portable path sealer rejects it.
  assert.throws(() => watcher.validateWatcherSourcePath("policy/bad\ud800.md"), {
    code: "GKX_WATCHER_CONTRACT_PATH_INVALID",
  });
});

test("status identity UTF-16 and trim rules are mandatory semantic supplements", () => {
  const fixture = readJson("watcher-conformance-fixture.json");
  const status = fixture.schema_cases.find((row) => row.case_id === "status-valid").value;
  const schema = readJson("status.schema.json");
  const validate = phase5Ajv().getSchema(schema.$id);
  const astral514 = reseal(status, "status_digest", { embedding_model: "😀".repeat(257) });
  const allTrim = reseal(status, "status_digest", { embedding_model: "\u00a0" });
  assert.equal(validate(astral514), true, JSON.stringify(validate.errors));
  assert.equal(validate(allTrim), true, JSON.stringify(validate.errors));
  assert.throws(() => watcher.sealWatcherRecoveryRecord(astral514), { code: "GKX_WATCHER_CONTRACT_RELATION_INVALID" });
  assert.throws(() => watcher.sealWatcherRecoveryRecord(allTrim), { code: "GKX_WATCHER_CONTRACT_RELATION_INVALID" });
});

test("semantic seals return detached deeply frozen canonical authority", () => {
  const row = readJson("watcher-conformance-fixture.json").semantic_cases.find((item) => item.case_id === "coherent-activation-complete");
  const original = clone(row.input.arguments[0]);
  const guard = clone(row.input.arguments[1]);
  const sealed = watcher.sealWatcherCoherentActivationBundle(original, guard);
  original.plan.intended_source_mutations[0].from_path = "mutated.md";
  assert.equal(sealed.plan.intended_source_mutations[0].from_path, "policy/agent-writing.md");
  assert.equal(Object.isFrozen(sealed), true);
  assert.equal(Object.isFrozen(sealed.plan), true);
  assert.equal(Object.isFrozen(sealed.plan.intended_source_mutations), true);
  assert.equal(Object.isFrozen(sealed.plan.intended_source_mutations[0]), true);
  assert.throws(() => watcher.sealWatcherRecoveryRecord(new Proxy({}, {})), { code: "GKX_WATCHER_CONTRACT_RECORD_INVALID" });
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => watcher.sealWatcherTransitionChain(sparse), { code: "GKX_WATCHER_CONTRACT_RECORD_INVALID" });
});

test("every durable incomplete transition prefix reseals without inventing a terminal state", () => {
  const transitions = readJson("watcher-conformance-fixture.json").semantic_cases.find((item) => item.case_id === "transition-chain-complete").input.arguments[0];
  for (let length = 1; length < transitions.length; length++) {
    const prefix = watcher.sealWatcherTransitionPrefix(transitions.slice(0, length));
    assert.equal(prefix.length, length);
    assert.equal(prefix.at(-1).terminal_state, "open");
    assert.equal(Object.isFrozen(prefix), true);
  }
  assert.throws(() => watcher.sealWatcherTransitionPrefix(transitions), { code: "GKX_WATCHER_CONTRACT_TRANSITION_INVALID" });
});

test("pure semantic cases accept exact bytes and reject self-resealed relational mutations", () => {
  const fixture = readJson("watcher-conformance-fixture.json");
  const seen = new Set();
  for (const row of fixture.semantic_cases) {
    assert.equal(seen.has(row.case_id), false, row.case_id);
    seen.add(row.case_id);
    let actualError = null;
    let actualResult;
    try {
      actualResult = executeSemanticCase(row);
    } catch (error) {
      actualError = error?.code ?? String(error);
    }
    assert.equal(actualError, row.expectation.error_code, row.case_id);
    if (row.expectation.accepted) assert.equal(semanticOutputDigest(row.operation, actualResult), row.expectation.output_digest, row.case_id);
    else assert.equal(row.expectation.output_digest, null, row.case_id);
  }
  const recovery = readJson("watcher-recovery-fixture.json");
  const categories = ["event_cases", "transition_cases", "topology_cases", "pointer_cases", "crash_cases", "source_removal_cases", "status_control_cases", "provider_cases", "path_identity_cases", "shutdown_cases"];
  assert.deepEqual([...seen].sort(), categories.flatMap((name) => recovery[name]).sort());
  assert.deepEqual([...new Set(fixture.semantic_cases.map((row) => row.operation))].sort(), [
    "derive_graphiti_projection",
    "normalize_canonical_graph",
    "normalize_graph_delta",
    "seal_coherent_activation_bundle",
    "seal_failure_retry_bundle",
    "seal_failure_retry_noop_bundle",
    "seal_journal_reset_bundle",
    "seal_journal_reset_reconciliation_adoption_bundle",
    "seal_measurement",
    "seal_pointer_recovery",
    "seal_record",
    "seal_source_removal_adapter_verification_bundle",
    "seal_source_removal_event_set_bundle",
    "seal_source_removal_receipt_bundle",
    "seal_status_bundle",
    "seal_transition_chain",
    "validate_cli_fixture",
    "validate_pack",
    "validate_path",
    "validate_sql_authority",
  ]);
});

test("the fixed convergence SamplePlan is the approved draft.2 canonical preimage", () => {
  const bytes = readFileSync(new URL("watcher-sample-plan.json", PACK));
  assert.equal(bytes.length, 4_363);
  assert.equal(rawSha(bytes), watcher.WATCHER_CONVERGENCE_SAMPLE_PLAN_DIGEST);
  assert.equal(bytes.at(-1), 0x7d);
  const value = JSON.parse(bytes.toString("utf8"));
  watcher.sealWatcherConvergenceSamplePlan(value, bytes);
  const changed = clone(value);
  changed.execution.limit = 6;
  assert.throws(() => watcher.sealWatcherConvergenceSamplePlan(changed), {
    code: "GKX_WATCHER_CONTRACT_SAMPLE_PLAN_INVALID",
  });
  assert.equal(value.fixture.alpha.byte_size, 499);
  assert.equal(value.fixture.omega.byte_size, 499);
  assert.equal(value.fixture.chunk_count, 2);
  assert.equal(value.execution.sample_count, 20);
  assert.equal(value.execution.as_of, "2026-08-20T00:00:00Z");
  assert.equal(value.execution.external_reader, "gkx_search_outer_coherent_authority");
  assert.equal(value.watcher.configuration_digest, "sha256:082dffdb5390813e9d4e0b43097f730ccb98ac2f18ebd3549e03986a860fcdba");
  assert.equal(value.watcher.policy_digest, "sha256:2a24f03ee235def9d6de500b8144f3660814be9aa3c8bf3d104b3fb57e808317");
  assert.equal(value.watcher.effective_profile_digest, "sha256:9ab3b07da4cdfb584c2766762a32dc71653dffd87537ad0a4c9190e3a69015c5");
  assert.deepEqual(value.percentile, {
    method: "nearest_rank",
    p50: { index: 9, rank: 10 },
    p95: { index: 18, rank: 19 },
    p99: { index: 19, rank: 20 },
    sort: "ascending_integer_micros",
  });
});

test("canonical graph, production GraphDelta, parser descriptor, and Graphiti projection remain one-algorithm authorities", () => {
  const bytes = Buffer.from(readJson("watcher-sample-plan.json").fixture.alpha.source_bytes_base64, "base64");
  const source = {
    relativePath: "policy/agent-writing.md",
    name: "agent-writing.md",
    extension: "md",
    size: bytes.length,
    modifiedTime: 1,
    content: bytes.toString("utf8"),
    kind: "note",
  };
  const graph = core.buildGraph([source], ["policy"], 1_700_000_000_000);
  const changedTiming = clone(graph);
  changedTiming.stats.indexedAt = "2099-01-01T00:00:00.000Z";
  changedTiming.stats.durationMs = 999;
  changedTiming.diagnostics.lastFullBuildMs = 888;
  changedTiming.diagnostics.lastIncrementalUpdateMs = 777;
  assert.equal(
    canonicalJson(watcher.normalizeWatcherCanonicalGkxGraph(graph)),
    canonicalJson(watcher.normalizeWatcherCanonicalGkxGraph(changedTiming)),
  );
  const normalizedDelta = watcher.normalizeWatcherGraphDelta({
    addedNodes: ["z", "a"], removedNodes: ["y", "b"], changedNodes: ["x", "c"], topologyChanged: true, reparsed: 1, fullRebuild: false,
  });
  assert.deepEqual(normalizedDelta.delta.addedNodes, ["a", "z"]);
  assert.deepEqual(normalizedDelta.delta.removedNodes, ["b", "y"]);
  assert.deepEqual(normalizedDelta.delta.changedNodes, ["c", "x"]);
  assert.match(watcher.watcherParserDescriptorDigest(source), /^sha256:[0-9a-f]{64}$/u);
  const graphiti = watcher.deriveWatcherGraphitiProjection(graph, "phase5-watcher-convergence-v1");
  assert.equal(graphiti.processing_time, "1970-01-01T00:00:00.000Z");
  assert.equal(graphiti.episodes.every((episode) =>
    episode.episode_metadata.processing_time === "1970-01-01T00:00:00.000Z"
      && JSON.parse(episode.episode_body).processing_time === "1970-01-01T00:00:00.000Z"), true);
  watcher.sealWatcherRecoveryRecord(graphiti);
});

test("timing and nearest-rank boundaries are integer-ceiling and exact", () => {
  assert.equal(watcher.watcherCeilMicrosFromNanoseconds(0n), 0);
  assert.equal(watcher.watcherCeilMicrosFromNanoseconds(1n), 1);
  assert.equal(watcher.watcherCeilMicrosFromNanoseconds(999n), 1);
  assert.equal(watcher.watcherCeilMicrosFromNanoseconds(1_000n), 1);
  assert.equal(watcher.watcherCeilMicrosFromNanoseconds(1_001n), 2);
  const samples = Array.from({ length: 20 }, (_, index) => index + 1);
  assert.equal(watcher.watcherNearestRank(samples, 50), 10);
  assert.equal(watcher.watcherNearestRank(samples, 95), 19);
  assert.equal(watcher.watcherNearestRank(samples, 99), 20);
});

test("Slice A is private and contains no host execution authority", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(Object.hasOwn(pkg.exports, "./watcher"), false);
  const privateBundle = readFileSync(new URL("../dist/watcher-contracts.mjs", import.meta.url), "utf8");
  for (const forbidden of ["node:fs", "node:sqlite", "fs.watch", "process.exit", "createServer", "listen(", "fetch("]) {
    assert.equal(privateBundle.includes(forbidden), false, forbidden);
  }
  assert.equal(typeof watcher.sealWatcherRecoveryRecord, "function");
  assert.equal(typeof watcher.sealWatcherTransitionChain, "function");
  assert.equal(typeof watcher.sealWatcherTransitionPrefix, "function");
});
