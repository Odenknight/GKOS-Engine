#!/usr/bin/env node
/** Repository-private Phase-5 watcher observation qualification. */
import {
  chmodSync, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeSync,
} from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  sealWatcherConvergenceSamplePlan,
  sealWatcherRecoveryRecord,
  validateWatcherPackBundle,
} from "../src/watcher/contracts";
import {
  openWatcherDirectory,
  readWatcherFile,
  syncWatcherDirectory,
  watcherCanonicalBytes,
  watcherDigest,
  watcherRawDigest,
} from "../src/watcher/fs-authority";
import { readWatcherPointer } from "../src/watcher/pointer";
import { closeWatcherJournal, openWatcherJournal } from "../src/watcher/journal";
import { readWatcherCoherentManifest } from "../src/watcher/coordinator";
import { startWatcherHost } from "../src/watcher/host";
import { verifyFrozenQualificationInputsForTest } from "./run-retrieval-observation-qualification.mjs";

const execFile = promisify(execFileCallback);
const PACK_RELATIVE = "contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1";
const SAMPLE_FILE = "watcher-sample-plan.json";
const MEASUREMENT_FILE = "watcher-observation-measurement.json";
const SAMPLE_DIGEST = "sha256:75b011dc253a445ec9c5fc192f600f57ec62411e8125dfa20c74a08f5faf301b";
const SAMPLE_BYTES = 4_363;
const MAX_LATENCY_MICROS = 5_000_000;

function fail(code) { throw new Error(code); }
function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }

function parseArgs(argv) {
  if (argv.length !== 2 || !["--artifact-root", "--archive-root"].includes(argv[0])
      || typeof argv[1] !== "string" || argv[1] === "") {
    fail("GKX_WATCHER_QUALIFICATION_ARGUMENT_INVALID");
  }
  return argv[0] === "--artifact-root"
    ? { mode: "measure", root: resolve(argv[1]) }
    : { mode: "audit", root: resolve(argv[1]) };
}

function assertOwnerDirectory(path) {
  const state = lstatSync(path, { bigint: true });
  if (!state.isDirectory() || state.isSymbolicLink()) fail("GKX_WATCHER_QUALIFICATION_ARTIFACT_ROOT_INVALID");
  if (process.platform !== "win32" && Number(state.mode & 0o777n) !== 0o700) {
    fail("GKX_WATCHER_QUALIFICATION_ARTIFACT_ROOT_INVALID");
  }
}

function sealRecord(base, digestField) {
  return sealWatcherRecoveryRecord({ ...base, [digestField]: watcherDigest(base) });
}

function physicalFts5() {
  let database;
  try {
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
    database = new DatabaseSync(":memory:");
    const sqliteVersion = String(database.prepare("SELECT sqlite_version() AS version;").get().version);
    database.exec("CREATE VIRTUAL TABLE physical_fts_probe USING fts5(body);");
    database.exec("DROP TABLE physical_fts_probe;");
    return { available: true, sqlite_version: sqliteVersion };
  } catch {
    return { available: false, sqlite_version: "unavailable" };
  } finally {
    try { database?.close(); } catch { /* probe failure is already represented */ }
  }
}

function environmentRecord(fts) {
  const os = process.platform === "win32" ? "windows" : process.platform;
  const base = {
    contract_version: "gkos-watcher-observation-environment/1.0.0-draft.1",
    runtime: "node",
    runtime_version: process.versions.node,
    os,
    arch: process.arch,
    sqlite_version: fts.sqlite_version,
    physical_fts5_available: fts.available,
    runner_class: process.env.GITHUB_ACTIONS === "true" ? "github_hosted" : "local",
  };
  return sealRecord(base, "environment_digest");
}

function ftsOutcome(environment, status) {
  const base = {
    contract_version: "gkos-watcher-fts-qualification-outcome/1.0.0-draft.1",
    lane_kind: Number.parseInt(process.versions.node.split(".")[0], 10) === 24 ? "reference" : "matrix",
    runtime_version: environment.runtime_version,
    os: environment.os,
    arch: environment.arch,
    physical_fts5_available: status === "qualified",
    status,
    index_generation_count: status === "qualified" ? 23 : 0,
    query_count: status === "qualified" ? 22 : 0,
    provider_call_count: 0,
  };
  return sealRecord(base, "outcome_digest");
}

function unavailableMeasurement(environment) {
  const base = {
    contract_version: "gkos-watcher-observation-measurement/1.0.0-draft.1",
    status: "unavailable",
    failure_codes: ["MEASURE_FTS_UNAVAILABLE"],
    sample_plan_digest: SAMPLE_DIGEST,
    environment,
    fts_qualification: ftsOutcome(environment, "unavailable"),
    edit_latency_micros: null,
    percentiles_micros: null,
    source_work: null,
    embedding_work: null,
    convergence: null,
  };
  return sealRecord(base, "measurement_digest");
}

function writeMeasurement(artifactRoot, measurement) {
  assertOwnerDirectory(artifactRoot);
  const existing = readdirSync(artifactRoot);
  if (existing.length !== 0) fail("GKX_WATCHER_QUALIFICATION_ARTIFACT_ROOT_INVALID");
  const bytes = watcherCanonicalBytes(sealWatcherRecoveryRecord(measurement));
  const path = join(artifactRoot, MEASUREMENT_FILE);
  const descriptor = openSync(path, "wx", 0o600);
  try { writeSync(descriptor, bytes); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  if (process.platform !== "win32") chmodSync(path, 0o600);
  syncWatcherDirectory(artifactRoot);
  const directory = openWatcherDirectory(artifactRoot);
  const reopened = readWatcherFile(directory, MEASUREMENT_FILE, { maximum_bytes: 1_048_576 });
  const sealed = sealWatcherRecoveryRecord(JSON.parse(reopened.bytes.toString("utf8")));
  if (!reopened.bytes.equals(watcherCanonicalBytes(sealed))) fail("GKX_WATCHER_QUALIFICATION_MEASUREMENT_INVALID");
  if (readdirSync(artifactRoot).length !== 1) fail("GKX_WATCHER_QUALIFICATION_ARTIFACT_ROOT_INVALID");
  return Object.freeze({ byte_size: reopened.bytes.byteLength, raw_sha256: reopened.raw_sha256, measurement: sealed });
}

function validatePack(repoRoot) {
  const packRoot = join(repoRoot, PACK_RELATIVE);
  const manifestBytes = readFileSync(join(packRoot, "pack-manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const names = readdirSync(packRoot).sort();
  if (names.length !== 18 || names.filter((name) => name === "pack-manifest.json").length !== 1) {
    fail("GKX_WATCHER_QUALIFICATION_PACK_INVALID");
  }
  validateWatcherPackBundle({
    pack_root_manifest: manifest,
    files: names.filter((name) => name !== "pack-manifest.json").map((file) => ({
      file,
      bytes_base64: readFileSync(join(packRoot, file)).toString("base64"),
    })),
  });
  const planBytes = readFileSync(join(packRoot, SAMPLE_FILE));
  if (planBytes.byteLength !== SAMPLE_BYTES || watcherRawDigest(planBytes) !== SAMPLE_DIGEST || planBytes.at(-1) === 0x0a) {
    fail("GKX_WATCHER_QUALIFICATION_PLAN_INVALID");
  }
  return sealWatcherConvergenceSamplePlan(JSON.parse(planBytes.toString("utf8")), planBytes);
}

function durableReplace(path, bytes, ordinal) {
  const parent = dirname(path);
  const temporary = join(parent, `.agent-writing.md.gkos-watcher-observation.${String(ordinal).padStart(2, "0")}.tmp`);
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeSync(descriptor, bytes); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  if (process.platform !== "win32") chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  const finalDescriptor = openSync(path, "r+");
  try { fsyncSync(finalDescriptor); }
  finally { closeSync(finalDescriptor); }
  syncWatcherDirectory(parent);
}

function generationSignal() {
  let epoch = 0;
  const waiters = new Set();
  return Object.freeze({
    snapshot: () => epoch,
    notify() {
      epoch += 1;
      for (const wake of waiters) wake();
      waiters.clear();
    },
    async waitAfter(priorEpoch, timeoutMs) {
      if (epoch !== priorEpoch) return epoch;
      await new Promise((resolve) => {
        let timer = null;
        const wake = () => { if (timer !== null) clearTimeout(timer); waiters.delete(wake); resolve(); };
        waiters.add(wake);
        timer = setTimeout(wake, timeoutMs);
      });
      return epoch;
    },
  });
}

async function waitForPointer(directory, priorDigest, signal, priorEpoch, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let observedEpoch = priorEpoch;
  while (Date.now() <= deadline) {
    observedEpoch = await signal.waitAfter(observedEpoch, Math.max(0, deadline - Date.now()));
    const pointer = readWatcherPointer(directory, "outer");
    if (pointer !== null && pointer.pointer_digest !== priorDigest) return pointer;
  }
  fail("GKX_WATCHER_QUALIFICATION_GENERATION_TIMEOUT");
}

function searchAuthorityCoordinates(watcherDirectory) {
  const pointer = readWatcherPointer(watcherDirectory, "outer");
  if (pointer === null) fail("GKX_WATCHER_QUALIFICATION_GENERATION_INVALID");
  const manifest = readWatcherCoherentManifest(watcherDirectory, pointer);
  return Object.freeze({
    pointer_digest: pointer.pointer_digest,
    coherent_manifest_digest: manifest.coherent_manifest_digest,
    configuration_digest: manifest.configuration_digest,
    policy_digest: manifest.policy_digest,
    effective_profile_digest: manifest.effective_profile_digest,
  });
}

function assertSearchAuthority(plan, authority, expectedPointerDigest) {
  if (authority.pointer_digest !== expectedPointerDigest
      || authority.configuration_digest !== plan.watcher.configuration_digest
      || authority.policy_digest !== plan.watcher.policy_digest
      || authority.effective_profile_digest !== plan.watcher.effective_profile_digest) {
    fail("GKX_WATCHER_QUALIFICATION_GENERATION_INVALID");
  }
}

async function externalSearch(repoRoot, vault, query, sourceId, plan, watcherDirectory, expectedPointerDigest) {
  const before = searchAuthorityCoordinates(watcherDirectory);
  assertSearchAuthority(plan, before, expectedPointerDigest);
  const { stdout, stderr } = await execFile(process.execPath, [
    "--disable-warning=ExperimentalWarning",
    join(repoRoot, "bin", "gkx.mjs"), "search", query, "--kb-path", vault, "--limit", "5",
    "--as-of", plan.execution.as_of,
  ], { cwd: repoRoot, windowsHide: true, timeout: 5_000, maxBuffer: 16 * 1024 * 1024, encoding: "buffer" });
  const result = parseExternalSearchChildOutput(stdout, stderr);
  if (!Array.isArray(result.hits) || result.hits.length < 1 || result.hits[0].chunk?.source_id !== sourceId) {
    fail("GKX_WATCHER_QUALIFICATION_QUERY_INVALID");
  }
  const after = searchAuthorityCoordinates(watcherDirectory);
  assertSearchAuthority(plan, after, expectedPointerDigest);
  if (JSON.stringify(after) !== JSON.stringify(before)) fail("GKX_WATCHER_QUALIFICATION_GENERATION_INVALID");
}

function parseExternalSearchChildOutput(stdout, stderr) {
  if (!Buffer.isBuffer(stdout) || !Buffer.isBuffer(stderr) || stderr.byteLength !== 0) {
    fail("GKX_WATCHER_QUALIFICATION_QUERY_INVALID");
  }
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(stdout); }
  catch { fail("GKX_WATCHER_QUALIFICATION_QUERY_INVALID"); }
  try { return JSON.parse(text); }
  catch { fail("GKX_WATCHER_QUALIFICATION_QUERY_INVALID"); }
}

export function parseExternalSearchChildOutputForTest(stdout, stderr) {
  return parseExternalSearchChildOutput(stdout, stderr);
}

function coherentCoordinates(watcherDirectory) {
  const pointer = readWatcherPointer(watcherDirectory, "outer");
  if (pointer === null) fail("GKX_WATCHER_QUALIFICATION_GENERATION_INVALID");
  const manifest = readWatcherCoherentManifest(watcherDirectory, pointer);
  const retrieval = manifest.retrieval_projection_state;
  const graph = manifest.graph_projection_state;
  return Object.freeze({
    canonical_gkx_digest: manifest.gkx_snapshot_digest,
    retrieval_manifest_digest: retrieval.manifest_digest,
    canonical_graph_digest: graph.canonical_graph_digest,
    graphiti_digest: graph.graphiti_projection_digest,
  });
}

function convergenceRecord(incremental, clean) {
  const base = {
    contract_version: "gkos-watcher-observation-convergence/1.0.0-draft.1",
    incremental_canonical_gkx_digest: incremental.canonical_gkx_digest,
    clean_canonical_gkx_digest: clean.canonical_gkx_digest,
    incremental_retrieval_manifest_digest: incremental.retrieval_manifest_digest,
    clean_retrieval_manifest_digest: clean.retrieval_manifest_digest,
    incremental_canonical_graph_digest: incremental.canonical_graph_digest,
    clean_canonical_graph_digest: clean.canonical_graph_digest,
    incremental_graphiti_digest: incremental.graphiti_digest,
    clean_graphiti_digest: clean.graphiti_digest,
    all_equal: JSON.stringify(incremental) === JSON.stringify(clean),
  };
  return sealRecord(base, "convergence_digest");
}

function hostOptions(vault, statusFile, plan, onIndexExecution, signal) {
  return {
    vault_root: vault,
    status_file: statusFile,
    vault_id: plan.fixture.vault_id,
    configuration_digest: plan.watcher.configuration_digest,
    policy_digest: plan.watcher.policy_digest,
    periodic_reconciliation_ms: 60_000,
    ...(onIndexExecution === undefined ? {} : { on_index_execution: onIndexExecution }),
    ...(signal === undefined ? {} : { on_status_change: () => signal.notify() }),
    coordinator_options: {
      discoverability_policy: (chunk) => chunk.metadata.sensitivity === "public" ? "allow" : "deny",
      source_discoverability_policy: (source) => source.metadata.sensitivity === "public" ? "allow" : "deny",
    },
  };
}

function prepareVault(root, bytes) {
  const vault = join(root, "vault");
  const status = join(root, "status");
  const sourceParent = join(vault, "policy");
  mkdirSync(join(vault, ".gkx", "derived"), { recursive: true, mode: 0o700 });
  mkdirSync(sourceParent, { recursive: true, mode: 0o700 });
  mkdirSync(status, { mode: 0o700 });
  if (process.platform !== "win32") {
    chmodSync(join(vault, ".gkx", "derived"), 0o700);
    chmodSync(sourceParent, 0o700);
    chmodSync(status, 0o700);
  }
  const tokenPath = join(status, "desktop-agent.token");
  const tokenDescriptor = openSync(tokenPath, "wx", 0o600);
  try { writeSync(tokenDescriptor, Buffer.from("phase5-watcher-observation-token\n")); fsyncSync(tokenDescriptor); }
  finally { closeSync(tokenDescriptor); }
  const source = join(sourceParent, "agent-writing.md");
  const sourceDescriptor = openSync(source, "wx", 0o600);
  try { writeSync(sourceDescriptor, bytes); fsyncSync(sourceDescriptor); }
  finally { closeSync(sourceDescriptor); }
  syncWatcherDirectory(sourceParent);
  return { vault, status, source };
}

async function qualifiedMeasurement(repoRoot, plan, environment) {
  const root = mkdtempSync(join(tmpdir(), "gkos-watcher-observation-"));
  if (process.platform !== "win32") chmodSync(root, 0o700);
  let host = null;
  let cleanHost = null;
  try {
    const alpha = Buffer.from(plan.fixture.alpha.source_bytes_base64, "base64");
    const omega = Buffer.from(plan.fixture.omega.source_bytes_base64, "base64");
    if (alpha.byteLength !== 499 || omega.byteLength !== 499 || watcherRawDigest(alpha) !== plan.fixture.alpha.source_digest
        || watcherRawDigest(omega) !== plan.fixture.omega.source_digest) fail("GKX_WATCHER_QUALIFICATION_PLAN_INVALID");
    const active = prepareVault(join(root, "incremental"), alpha);
    const indexExecutions = [];
    const signal = generationSignal();
    host = await startWatcherHost(hostOptions(active.vault, join(active.status, "desktop-agent.status.json"), plan,
      (receipt) => indexExecutions.push(receipt), signal));
    const watcherDirectory = host.watcher_directory;
    const initialAuthority = searchAuthorityCoordinates(watcherDirectory);
    assertSearchAuthority(plan, initialAuthority, initialAuthority.pointer_digest);
    const samples = [];
    let queryCount = 0;
    let reparseCount = 0;
    for (let ordinal = 0; ordinal < 22; ordinal += 1) {
      const toOmega = ordinal % 2 === 0;
      const target = toOmega ? omega : alpha;
      const query = toOmega ? "phasefiveomega" : "phasefivealpha";
      const prior = readWatcherPointer(watcherDirectory, "outer");
      if (prior === null) fail("GKX_WATCHER_QUALIFICATION_GENERATION_INVALID");
      const priorEpoch = signal.snapshot();
      durableReplace(active.source, target, ordinal);
      const started = process.hrtime.bigint();
      const selected = await waitForPointer(watcherDirectory, prior.pointer_digest, signal, priorEpoch);
      await externalSearch(repoRoot, active.vault, query, plan.fixture.source_id, plan, watcherDirectory, selected.pointer_digest);
      const micros = Number((process.hrtime.bigint() - started + 999n) / 1_000n);
      if (!Number.isSafeInteger(micros) || micros > MAX_LATENCY_MICROS) fail("GKX_WATCHER_QUALIFICATION_LATENCY_EXCEEDED");
      if (ordinal >= 2) samples.push(micros);
      queryCount += 1;
    }
    reparseCount = indexExecutions.slice(1).reduce((sum, receipt) => sum + receipt.reparsed_source_count, 0);
    if (samples.length !== 20 || queryCount !== 22 || reparseCount !== 22 || indexExecutions.length !== 23
        || indexExecutions[0]?.execution_kind !== "set_files" || indexExecutions[0]?.reparsed_source_count !== 1
        || indexExecutions.slice(1).some((receipt) => receipt.execution_kind !== "apply_changes" || receipt.reparsed_source_count !== 1)) {
      fail("GKX_WATCHER_QUALIFICATION_WORK_COUNT_INVALID");
    }
    const incremental = coherentCoordinates(watcherDirectory);
    const journalDirectory = host.journal_directory;
    await host.shutdown();
    await host.closed;
    host = null;
    const journal = openWatcherJournal(journalDirectory);
    if (journal === null) fail("GKX_WATCHER_QUALIFICATION_GENERATION_INVALID");
    const generationCount = Number(journal.database.prepare("SELECT COUNT(*) AS count FROM batches;").get().count);
    closeWatcherJournal(journal);
    if (generationCount !== 23) fail("GKX_WATCHER_QUALIFICATION_GENERATION_INVALID");

    // Rebuild the same source capability from an empty derived-state root.  A
    // second physical source file would have a different birth-time identity
    // on Windows even when its bytes and portable path were identical, which
    // would make the clean-vs-incremental comparison measure fixture-copy
    // metadata instead of the production setFiles/applyChanges algorithms.
    const derivedRoot = join(active.vault, ".gkx", "derived");
    rmSync(derivedRoot, { recursive: true, force: true });
    mkdirSync(derivedRoot, { mode: 0o700 });
    if (process.platform !== "win32") chmodSync(derivedRoot, 0o700);
    syncWatcherDirectory(dirname(derivedRoot));
    cleanHost = await startWatcherHost(hostOptions(active.vault, join(active.status, "desktop-agent.status.json"), plan));
    const cleanAuthority = searchAuthorityCoordinates(cleanHost.watcher_directory);
    assertSearchAuthority(plan, cleanAuthority, cleanAuthority.pointer_digest);
    const cleanCoordinates = coherentCoordinates(cleanHost.watcher_directory);
    const convergence = convergenceRecord(incremental, cleanCoordinates);
    if (convergence.all_equal !== true) fail("GKX_WATCHER_QUALIFICATION_CONVERGENCE_INVALID");
    const sorted = samples.slice().sort((left, right) => left - right);
    const percentiles = { p50: sorted[9], p95: sorted[18], p99: sorted[19], max: sorted[19] };
    const base = {
      contract_version: "gkos-watcher-observation-measurement/1.0.0-draft.1",
      status: "qualified",
      failure_codes: [],
      sample_plan_digest: SAMPLE_DIGEST,
      environment,
      fts_qualification: ftsOutcome(environment, "qualified"),
      edit_latency_micros: samples,
      percentiles_micros: percentiles,
      source_work: { initial_generation_count: 1, mutation_generation_count: 22, total_generation_count: 23, query_count: 22, reparsed_source_count: 22 },
      embedding_work: { provider_call_count: 0, provider_item_count: 0, unchanged_chunk_reembedded_count: 0 },
      convergence,
    };
    return sealRecord(base, "measurement_digest");
  } finally {
    try { if (cleanHost !== null) { await cleanHost.shutdown(); await cleanHost.closed; } } catch { /* primary result governs */ }
    try { if (host !== null) { await host.shutdown(); await host.closed; } } catch { /* primary result governs */ }
    await sleep(0);
    rmSync(root, { recursive: true, force: true });
  }
}

export async function runWatcherObservationQualificationForTest(repoRootInput, artifactRootInput) {
  const repoRoot = resolve(repoRootInput);
  const artifactRoot = resolve(artifactRootInput);
  assertOwnerDirectory(artifactRoot);
  await verifyFrozenQualificationInputsForTest(repoRoot);
  return runWatcherObservationMeasurementForTest(repoRoot, artifactRoot);
}

/** Exercise the governed measurement only; the CLI never calls this test seam directly. */
export async function runWatcherObservationMeasurementForTest(repoRootInput, artifactRootInput) {
  const repoRoot = resolve(repoRootInput);
  const artifactRoot = resolve(artifactRootInput);
  assertOwnerDirectory(artifactRoot);
  const plan = validatePack(repoRoot);
  const fts = physicalFts5();
  const environment = environmentRecord(fts);
  if (!["linux", "windows"].includes(environment.os) || environment.arch !== "x64") {
    fail("GKX_WATCHER_QUALIFICATION_ENVIRONMENT_INVALID");
  }
  if (!fts.available) {
    const receipt = writeMeasurement(artifactRoot, unavailableMeasurement(environment));
    if (Number.parseInt(process.versions.node.split(".")[0], 10) === 24) {
      fail("GKX_WATCHER_QUALIFICATION_FTS5_REQUIRED");
    }
    return receipt;
  }
  return writeMeasurement(artifactRoot, await qualifiedMeasurement(repoRoot, plan, environment));
}

const ARCHIVE_LANES = Object.freeze([
  ["Linux", "linux", 22], ["Linux", "linux", 23], ["Linux", "linux", 24],
  ["Windows", "windows", 22], ["Windows", "windows", 23], ["Windows", "windows", 24],
].map(([archiveOs, recordOs, node]) => Object.freeze({
  archive: `phase5-watcher-recovery-observation-${archiveOs}-node-${node}`,
  record_os: recordOs,
  node,
})));

function sameDevice(left, right) {
  return left === right || (process.platform === "win32" && (left === 0n || right === 0n));
}

function securelyReadDownloadedMeasurement(archiveRoot, archiveName) {
  const directoryPath = join(archiveRoot, archiveName);
  const directory = lstatSync(directoryPath, { bigint: true });
  if (!directory.isDirectory() || directory.isSymbolicLink()) fail("GKX_WATCHER_QUALIFICATION_ARCHIVE_INVALID");
  const names = readdirSync(directoryPath);
  if (names.length !== 1 || names[0] !== MEASUREMENT_FILE) fail("GKX_WATCHER_QUALIFICATION_ARCHIVE_INVALID");
  const path = join(directoryPath, MEASUREMENT_FILE);
  const linked = lstatSync(path, { bigint: true });
  if (!linked.isFile() || linked.isSymbolicLink() || linked.nlink !== 1n || linked.size < 1n || linked.size > 1_048_576n) {
    fail("GKX_WATCHER_QUALIFICATION_ARCHIVE_INVALID");
  }
  const descriptor = openSync(path, "r");
  let bytes;
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || !sameDevice(opened.dev, linked.dev) || opened.ino !== linked.ino || opened.mode !== linked.mode
        || opened.nlink !== 1n || opened.size !== linked.size) fail("GKX_WATCHER_QUALIFICATION_ARCHIVE_INVALID");
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameDevice(after.dev, opened.dev) || after.ino !== opened.ino || after.mode !== opened.mode
        || after.nlink !== opened.nlink || after.size !== opened.size
        || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs) {
      fail("GKX_WATCHER_QUALIFICATION_ARCHIVE_INVALID");
    }
  } finally { closeSync(descriptor); }
  const pathAfter = lstatSync(path, { bigint: true });
  if (!sameDevice(pathAfter.dev, linked.dev) || pathAfter.ino !== linked.ino || pathAfter.mode !== linked.mode
      || pathAfter.nlink !== linked.nlink || pathAfter.size !== linked.size
      || pathAfter.mtimeNs !== linked.mtimeNs || pathAfter.ctimeNs !== linked.ctimeNs) {
    fail("GKX_WATCHER_QUALIFICATION_ARCHIVE_INVALID");
  }
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); }
  catch { fail("GKX_WATCHER_QUALIFICATION_MEASUREMENT_INVALID"); }
  const measurement = sealWatcherRecoveryRecord(parsed);
  if (!bytes.equals(watcherCanonicalBytes(measurement))) fail("GKX_WATCHER_QUALIFICATION_MEASUREMENT_INVALID");
  return Object.freeze({ measurement, byte_size: bytes.byteLength, raw_sha256: watcherRawDigest(bytes) });
}

function assertMeasurementLane(measurement, lane) {
  const environment = measurement.environment;
  const outcome = measurement.fts_qualification;
  const major = Number.parseInt(String(environment.runtime_version).split(".")[0], 10);
  if (measurement.sample_plan_digest !== SAMPLE_DIGEST || environment.runtime !== "node"
      || major !== lane.node || environment.os !== lane.record_os || environment.arch !== "x64"
      || environment.runner_class !== "github_hosted" || outcome.runtime_version !== environment.runtime_version
      || outcome.os !== environment.os || outcome.arch !== environment.arch
      || outcome.lane_kind !== (lane.node === 24 ? "reference" : "matrix")) {
    fail("GKX_WATCHER_QUALIFICATION_ARCHIVE_LANE_INVALID");
  }
  if (lane.node === 24 && (measurement.status !== "qualified" || environment.physical_fts5_available !== true)) {
    fail("GKX_WATCHER_QUALIFICATION_FTS5_REQUIRED");
  }
  if (measurement.status === "qualified") {
    if (environment.physical_fts5_available !== true || outcome.status !== "qualified"
        || outcome.physical_fts5_available !== true || outcome.index_generation_count !== 23
        || outcome.query_count !== 22 || outcome.provider_call_count !== 0
        || !Array.isArray(measurement.edit_latency_micros) || measurement.edit_latency_micros.length !== 20
        || measurement.edit_latency_micros.some((value) => !Number.isSafeInteger(value) || value < 0 || value > MAX_LATENCY_MICROS)
        || measurement.percentiles_micros.p95 > MAX_LATENCY_MICROS
        || measurement.source_work.total_generation_count !== 23 || measurement.source_work.query_count !== 22
        || measurement.embedding_work.provider_call_count !== 0 || measurement.convergence.all_equal !== true) {
      fail("GKX_WATCHER_QUALIFICATION_MEASUREMENT_INVALID");
    }
  } else if (measurement.status === "unavailable") {
    if (lane.node === 24 || environment.physical_fts5_available !== false || outcome.status !== "unavailable"
        || outcome.physical_fts5_available !== false || outcome.index_generation_count !== 0
        || outcome.query_count !== 0 || outcome.provider_call_count !== 0
        || JSON.stringify(measurement.failure_codes) !== JSON.stringify(["MEASURE_FTS_UNAVAILABLE"])) {
      fail("GKX_WATCHER_QUALIFICATION_MEASUREMENT_INVALID");
    }
  } else fail("GKX_WATCHER_QUALIFICATION_MEASUREMENT_INVALID");
}

export function auditWatcherObservationArchivesForTest(archiveRootInput) {
  const archiveRoot = resolve(archiveRootInput);
  const root = lstatSync(archiveRoot, { bigint: true });
  if (!root.isDirectory() || root.isSymbolicLink()) fail("GKX_WATCHER_QUALIFICATION_ARCHIVE_INVALID");
  const expected = ARCHIVE_LANES.map((lane) => lane.archive).sort();
  if (JSON.stringify(readdirSync(archiveRoot).sort()) !== JSON.stringify(expected)) {
    fail("GKX_WATCHER_QUALIFICATION_ARCHIVE_INVALID");
  }
  const rows = ARCHIVE_LANES.map((lane) => {
    const row = securelyReadDownloadedMeasurement(archiveRoot, lane.archive);
    assertMeasurementLane(row.measurement, lane);
    return Object.freeze({ archive: lane.archive, file: MEASUREMENT_FILE, byte_size: row.byte_size, raw_sha256: row.raw_sha256 });
  });
  return Object.freeze(rows);
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.mode === "audit") {
    const rows = auditWatcherObservationArchivesForTest(parsed.root);
    process.stdout.write(`${JSON.stringify({ archive_count: rows.length, rows })}\n`);
    return;
  }
  const result = await runWatcherObservationQualificationForTest(resolve(process.cwd()), parsed.root);
  process.stdout.write(`${JSON.stringify({ file: MEASUREMENT_FILE, byte_size: result.byte_size, raw_sha256: result.raw_sha256 })}\n`);
}

const invoked = process.argv[1] === undefined ? null : resolve(process.argv[1]);
if (invoked !== null && invoked === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`phase5 watcher qualification: ${error?.message ?? "operational failure"}\n`);
    process.exitCode = 1;
  });
}
