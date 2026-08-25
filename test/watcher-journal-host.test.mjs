import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";

import {
  WATCHER_JOURNAL_DDL,
  WATCHER_JOURNAL_PRAGMAS,
  acquireWatcherHostLock,
  assertWatcherHostLock,
  bootstrapWatcherJournal,
  closeWatcherJournal,
  commitWatcherFailureRetryNoop,
  deriveWatcherFailureAuthority,
  ensureWatcherDirectory,
  finalizeWatcherJournalActivation,
  openWatcherDirectory,
  openWatcherJournal,
  prepareWatcherJournalActivation,
  recordWatcherJournalFailure,
  readWatcherJournalActive,
  readWatcherFailureRetryEpoch,
  revalidateWatcherDirectory,
  releaseWatcherHostLock,
  recoverWatcherJournalBootstrap,
  recoverWatcherJournalReset,
  resetWatcherJournal,
  listWatcherLeaves,
  validateWatcherJournalAuthority,
  validateWatcherJournalAdoptionProjection,
  validateWatcherFailureRetryNoopPhysicalAuthority,
  watcherJournalAdmission,
  watcherJournalTransaction,
  persistWatcherFailureAuthorityArtifacts,
  watcherDigest,
  watcherCanonicalBytes,
  writeNewWatcherFile,
  validateWatcherBootstrapTerminalEvidence,
  watcherJournalResetRecoveryActive,
} from "../dist/watcher-host.mjs";
import { stableJson } from "../dist/retrieval.mjs";

const D = `sha256:${"a".repeat(64)}`;
const CONFORMANCE = JSON.parse(readFileSync(new URL(
  "../contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1/watcher-conformance-fixture.json",
  import.meta.url,
), "utf8"));

function roots(t) {
  const root = mkdtempSync(join(tmpdir(), "gkos-watcher-journal-"));
  if (process.platform !== "win32") chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const base = openWatcherDirectory(root);
  const watcher = ensureWatcherDirectory(join(root, "watcher"), base);
  const journals = ensureWatcherDirectory(join(watcher.path, "journals"), watcher);
  const retrieval = ensureWatcherDirectory(join(root, "retrieval"), base);
  return { watcher, journals, retrieval };
}

function completeActivationBundle() {
  const row = CONFORMANCE.semantic_cases.find((item) => item.case_id === "coherent-activation-complete");
  assert.ok(row?.expectation.accepted);
  return row.input.arguments[0];
}

function prepareResetFixture(watcher, journals) {
  const bundle = completeActivationBundle();
  const serviceLock = acquireWatcherHostLock(watcher, {
    operation: "service",
    service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932",
    prior_pointer_digest: null,
    prior_coherent_manifest_digest: null,
    prior_journal_pointer_digest: null,
  });
  const journal = bootstrapWatcherJournal({
    root: journals,
    host_lock: serviceLock,
    coordinates: {
      vault_id: bundle.manifest.vault_id,
      configuration_digest: bundle.manifest.configuration_digest,
      policy_digest: bundle.manifest.policy_digest,
      effective_profile_digest: bundle.manifest.effective_profile_digest,
      anchor_coherent_manifest_digest: null,
    },
  });
  prepareWatcherJournalActivation(journal, {
    batch: bundle.batch,
    observation_authority: bundle.observation_authority,
    plan_authority: bundle.plan_authority,
    transitions: bundle.transitions.slice(0, 6),
    intent: bundle.intent,
    source_removal_event_set_bundle: bundle.source_removal_event_set_bundle,
  });
  finalizeWatcherJournalActivation(journal, {
    complete_transition: bundle.transitions[6],
    outcome: bundle.outcome,
    active: bundle.active,
    source_removal_activation: bundle.source_removal_activation,
  });
  for (const [leaf, value] of [
    [`watcher-pointer-${bundle.pointer.pointer_digest.slice(7)}.json`, bundle.pointer],
    ["watcher-active.json", bundle.pointer],
    [bundle.pointer.coherent_manifest_file, bundle.manifest],
  ]) {
    writeNewWatcherFile(watcher, leaf, watcherCanonicalBytes(value));
  }
  releaseWatcherHostLock(serviceLock);
  const resetLock = acquireWatcherHostLock(watcher, {
    operation: "journal_reset",
    service_instance_id: null,
    prior_pointer_digest: bundle.pointer.pointer_digest,
    prior_coherent_manifest_digest: bundle.manifest.coherent_manifest_digest,
    prior_journal_pointer_digest: journal.pointer.pointer_digest,
  });
  return { bundle, journal, resetLock };
}

function resetCrashProgram(watcherPath, journalRootPath, boundary, exitCode, pause = false) {
  const moduleUrl = new URL("../dist/watcher-host.mjs", import.meta.url).href;
  const fixtureUrl = new URL(
    "../contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1/watcher-conformance-fixture.json",
    import.meta.url,
  ).href;
  const boundaryAction = pause
    ? 'process.stdout.write("READY\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);'
    : `process.exit(${exitCode});`;
  return `
    import { readFileSync } from "node:fs";
    import {
      acquireWatcherHostLock, bootstrapWatcherJournal, finalizeWatcherJournalActivation,
      openWatcherDirectory, prepareWatcherJournalActivation, releaseWatcherHostLock,
      resetWatcherJournal, watcherCanonicalBytes, writeNewWatcherFile,
    } from ${JSON.stringify(moduleUrl)};
    const fixture = JSON.parse(readFileSync(new URL(${JSON.stringify(fixtureUrl)}), "utf8"));
    const row = fixture.semantic_cases.find((item) => item.case_id === "coherent-activation-complete");
    if (!row?.expectation.accepted) throw new Error("missing coherent fixture");
    const bundle = row.input.arguments[0];
    const watcher = openWatcherDirectory(${JSON.stringify(watcherPath)});
    const journals = openWatcherDirectory(${JSON.stringify(journalRootPath)});
    const serviceLock = acquireWatcherHostLock(watcher, { operation: "service",
      service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932", prior_pointer_digest: null,
      prior_coherent_manifest_digest: null, prior_journal_pointer_digest: null });
    const journal = bootstrapWatcherJournal({ root: journals, host_lock: serviceLock, coordinates: {
      vault_id: bundle.manifest.vault_id, configuration_digest: bundle.manifest.configuration_digest,
      policy_digest: bundle.manifest.policy_digest, effective_profile_digest: bundle.manifest.effective_profile_digest,
      anchor_coherent_manifest_digest: null,
    }});
    prepareWatcherJournalActivation(journal, { batch: bundle.batch, observation_authority: bundle.observation_authority,
      plan_authority: bundle.plan_authority, transitions: bundle.transitions.slice(0, 6), intent: bundle.intent,
      source_removal_event_set_bundle: bundle.source_removal_event_set_bundle });
    finalizeWatcherJournalActivation(journal, { complete_transition: bundle.transitions[6], outcome: bundle.outcome,
      active: bundle.active, source_removal_activation: bundle.source_removal_activation });
    for (const [leaf, value] of [
      [\`watcher-pointer-\${bundle.pointer.pointer_digest.slice(7)}.json\`, bundle.pointer],
      ["watcher-active.json", bundle.pointer], [bundle.pointer.coherent_manifest_file, bundle.manifest],
    ]) {
      writeNewWatcherFile(watcher, leaf, watcherCanonicalBytes(value));
    }
    releaseWatcherHostLock(serviceLock);
    const resetLock = acquireWatcherHostLock(watcher, { operation: "journal_reset", service_instance_id: null,
      prior_pointer_digest: bundle.pointer.pointer_digest,
      prior_coherent_manifest_digest: bundle.manifest.coherent_manifest_digest,
      prior_journal_pointer_digest: journal.pointer.pointer_digest });
    resetWatcherJournal({ watcher_directory: watcher, journal, host_lock: resetLock,
      outer_pointer: bundle.pointer, outer_manifest: bundle.manifest,
      expected_journal_generation_digest: journal.generation.journal_generation_digest,
      expected_coherent_manifest_digest: bundle.manifest.coherent_manifest_digest,
      on_boundary(value) { if (value === ${JSON.stringify(boundary)}) { ${boundaryAction} } },
    });
    process.exit(0);
  `;
}

function resetRecoveryCrashProgram(watcherPath, journalRootPath, boundary, exitCode) {
  const moduleUrl = new URL("../dist/watcher-host.mjs", import.meta.url).href;
  return `
    import { openWatcherDirectory, recoverWatcherJournalReset } from ${JSON.stringify(moduleUrl)};
    const watcher = openWatcherDirectory(${JSON.stringify(watcherPath)});
    const journals = openWatcherDirectory(${JSON.stringify(journalRootPath)});
    recoverWatcherJournalReset({ watcher_root: watcher, journal_root: journals,
      on_boundary(value) { if (value === ${JSON.stringify(boundary)}) process.exit(${exitCode}); } });
    process.exit(0);
  `;
}

function canonicalSqliteHeaderPrefix(size) {
  assert.ok(size >= 100 && size < 4096);
  const bytes = Buffer.alloc(size);
  Buffer.from("SQLite format 3\0", "binary").copy(bytes, 0);
  bytes.writeUInt16BE(4096, 16);
  bytes[18] = 2;
  bytes[19] = 2;
  bytes[20] = 0;
  bytes[21] = 64;
  bytes[22] = 32;
  bytes[23] = 32;
  return bytes;
}

function resetDatabaseCrashState(watcher, journals) {
  const exitCode = 89;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e",
    resetCrashProgram(watcher.path, journals.path, "database_file", exitCode)], { encoding: "utf8" });
  assert.equal(child.status, exitCode, child.stderr);
  const plan = JSON.parse(readFileSync(join(journals.path, "watcher-journal-reset-recovery-plan.json"), "utf8"));
  const childPath = join(journals.path, plan.new_generation.directory_leaf);
  return { plan, childPath, databasePath: join(childPath, "watcher-journal.sqlite") };
}

test("journal bootstrap publishes exact schema and reopens the committed generation", (t) => {
  assert.equal(WATCHER_JOURNAL_PRAGMAS.length, 12);
  assert.equal(WATCHER_JOURNAL_DDL.length, 19);
  const { watcher, journals } = roots(t);
  const lock = acquireWatcherHostLock(watcher, {
    operation: "service",
    service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932",
    prior_pointer_digest: null,
    prior_coherent_manifest_digest: null,
    prior_journal_pointer_digest: null,
  });
  const boundaries = [];
  const handle = bootstrapWatcherJournal({
    root: journals,
    host_lock: lock,
    coordinates: {
      vault_id: "vault",
      configuration_digest: D,
      policy_digest: D,
      effective_profile_digest: D,
      anchor_coherent_manifest_digest: null,
    },
    on_boundary(value) { boundaries.push(value); },
  });
  validateWatcherJournalAuthority(handle.database);
  assert.equal(handle.meta.anchor_coherent_manifest_digest, null);
  assert.equal(handle.generation.database_file, "watcher-journal.sqlite");
  closeWatcherJournal(handle);
  assert.doesNotThrow(() => revalidateWatcherDirectory(handle.generation_directory));
  releaseWatcherHostLock(lock);
  const reopened = openWatcherJournal(journals);
  assert.ok(reopened);
  assert.equal(reopened.pointer.journal_generation_digest, reopened.generation.journal_generation_digest);
  validateWatcherJournalAuthority(reopened.database);
  closeWatcherJournal(reopened);
  assert.doesNotThrow(() => revalidateWatcherDirectory(reopened.generation_directory));
  assert.deepEqual(boundaries, [
    "planned_target_stage", "planned_target", "witness_stage", "witness", "guard_stage", "guard", "child", "database", "generation_descriptor",
    "pointer_artifact", "bootstrap_temp", "fixed_pointer", "bootstrap_authority", "guard_removed",
  ]);
});

test("dead-owner recovery selects the exact staged PlannedTarget and reaches a normal nonnull journal lock", (t) => {
  const { watcher, journals } = roots(t);
  const moduleUrl = new URL("../dist/watcher-host.mjs", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { openWatcherDirectory, acquireWatcherHostLock, bootstrapWatcherJournal } from ${JSON.stringify(moduleUrl)};
    const watcher = openWatcherDirectory(${JSON.stringify(watcher.path)});
    const journals = openWatcherDirectory(${JSON.stringify(journals.path)});
    const lock = acquireWatcherHostLock(watcher, {
      operation: "service", service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932",
      prior_pointer_digest: null, prior_coherent_manifest_digest: null, prior_journal_pointer_digest: null,
    });
    bootstrapWatcherJournal({ root: journals, host_lock: lock, coordinates: {
      vault_id: "vault", configuration_digest: ${JSON.stringify(D)}, policy_digest: ${JSON.stringify(D)},
      effective_profile_digest: ${JSON.stringify(D)}, anchor_coherent_manifest_digest: null,
    }, on_boundary(boundary) { if (boundary === "planned_target_stage") process.exit(91); } });
  `], { encoding: "utf8" });
  assert.equal(child.status, 91, child.stderr);
  const recoveredWatcher = openWatcherDirectory(watcher.path);
  const recoveredJournals = openWatcherDirectory(journals.path);
  const recovered = recoverWatcherJournalBootstrap({
    watcher_root: recoveredWatcher, journal_root: recoveredJournals, service_instance_id: "019b2d14-4234-7db7-87d4-7d81cfaec932",
    prior_pointer_digest: null, prior_coherent_manifest_digest: null,
    coordinates: { vault_id: "vault", configuration_digest: D, policy_digest: D, effective_profile_digest: D, anchor_coherent_manifest_digest: null },
    revalidate_namespace() {},
  });
  assert.equal(recovered.journal.pointer.prior_pointer_digest, null);
  assert.equal(recovered.journal.generation.journal_instance_id, recovered.journal.meta.journal_instance_id);
  const leaves = listWatcherLeaves(recoveredWatcher);
  assert.ok(leaves.includes("watcher-journal-bootstrap-recovery-bridge.json"));
  assert.ok(!leaves.includes("watcher-authority.recovery"));
  assert.ok(!leaves.includes("watcher-journal-bootstrap-recovery-executor.json"));
  assert.equal(listWatcherLeaves(recoveredJournals).filter((leaf) => leaf === "watcher-journal-bootstrap-target-selector.json").length, 1);
  closeWatcherJournal(recovered.journal);
  releaseWatcherHostLock(recovered.host_lock);
  const lateIncomplete = `.watcher-journal-bootstrap-target-selector.${process.pid}.${"f".repeat(32)}.json.gkos-watcher.candidate`;
  writeFileSync(join(journals.path, lateIncomplete), "{", { flag: "wx", mode: 0o600 });
  if (process.platform !== "win32") chmodSync(join(journals.path, lateIncomplete), 0o600);
  validateWatcherBootstrapTerminalEvidence(openWatcherDirectory(watcher.path), openWatcherDirectory(journals.path));
  assert.equal(existsSync(join(journals.path, lateIncomplete)), false);
  const selected = JSON.parse(readFileSync(join(journals.path, "watcher-journal-bootstrap-target-selector.json"), "utf8"));
  const wrongMaterial = { ...selected, root_recovery_claim_digest: D };
  delete wrongMaterial.selector_digest;
  const wrong = { ...wrongMaterial, selector_digest: watcherDigest(wrongMaterial) };
  const wrongLeaf = `.watcher-journal-bootstrap-target-selector.${wrong.selector_process_id}.${wrong.owner_nonce}.json.gkos-watcher.candidate`;
  writeFileSync(join(journals.path, wrongLeaf), watcherCanonicalBytes(wrong), { flag: "wx", mode: 0o600 });
  if (process.platform !== "win32") chmodSync(join(journals.path, wrongLeaf), 0o600);
  assert.throws(() => validateWatcherBootstrapTerminalEvidence(openWatcherDirectory(watcher.path), openWatcherDirectory(journals.path)),
    /GKX_WATCHER_BOOTSTRAP_TARGET_SELECTOR_INVALID/u);
  assert.equal(existsSync(join(journals.path, wrongLeaf)), true);
});

test("dead-owner bootstrap recovery converges at every durable happy-path boundary", async (t) => {
  const boundaries = [
    "planned_target", "witness_stage", "witness", "guard_stage", "guard", "child", "database",
    "generation_descriptor", "pointer_artifact", "bootstrap_temp", "fixed_pointer", "bootstrap_authority", "guard_removed",
  ];
  const moduleUrl = new URL("../dist/watcher-host.mjs", import.meta.url).href;
  for (const boundary of boundaries) {
    await t.test(boundary, (childTest) => {
      const { watcher, journals } = roots(childTest);
      const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
        import { openWatcherDirectory, acquireWatcherHostLock, bootstrapWatcherJournal } from ${JSON.stringify(moduleUrl)};
        const watcher = openWatcherDirectory(${JSON.stringify(watcher.path)});
        const journals = openWatcherDirectory(${JSON.stringify(journals.path)});
        const lock = acquireWatcherHostLock(watcher, {
          operation: "service", service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932",
          prior_pointer_digest: null, prior_coherent_manifest_digest: null, prior_journal_pointer_digest: null,
        });
        bootstrapWatcherJournal({ root: journals, host_lock: lock, coordinates: {
          vault_id: "vault", configuration_digest: ${JSON.stringify(D)}, policy_digest: ${JSON.stringify(D)},
          effective_profile_digest: ${JSON.stringify(D)}, anchor_coherent_manifest_digest: null,
        }, on_boundary(value) { if (value === ${JSON.stringify(boundary)}) process.exit(92); } });
      `], { encoding: "utf8" });
      assert.equal(child.status, 92, `${boundary}: ${child.stderr}`);
      const recoveredWatcher = openWatcherDirectory(watcher.path);
      const recoveredJournals = openWatcherDirectory(journals.path);
      const recovered = recoverWatcherJournalBootstrap({
        watcher_root: recoveredWatcher, journal_root: recoveredJournals, service_instance_id: "019b2d14-4234-7db7-87d4-7d81cfaec932",
        prior_pointer_digest: null, prior_coherent_manifest_digest: null,
        coordinates: { vault_id: "vault", configuration_digest: D, policy_digest: D, effective_profile_digest: D, anchor_coherent_manifest_digest: null },
        revalidate_namespace() {},
      });
      assert.equal(recovered.journal.pointer.journal_generation_digest, recovered.journal.generation.journal_generation_digest);
      assert.ok(listWatcherLeaves(recoveredWatcher).includes("watcher-journal-bootstrap-recovery-bridge.json"));
      assert.ok(listWatcherLeaves(recoveredJournals).includes("watcher-journal-bootstrap-target-selector.json"));
      closeWatcherJournal(recovered.journal);
      releaseWatcherHostLock(recovered.host_lock);
    });
  }
});

test("recovery-of-recovery hands off linearly at every claimant boundary", async (t) => {
  const recoveryBoundaries = [
    "claim", "selector", "recovery_planned_target", "recovery_witness", "bridge", "executor",
    "stale_lock_removed", "target_stable", "normal_lock", "executor_released",
  ];
  const moduleUrl = new URL("../dist/watcher-host.mjs", import.meta.url).href;
  for (const boundary of recoveryBoundaries) {
    await t.test(boundary, (childTest) => {
      const { watcher, journals } = roots(childTest);
      const first = spawnSync(process.execPath, ["--input-type=module", "-e", `
        import { openWatcherDirectory, acquireWatcherHostLock, bootstrapWatcherJournal } from ${JSON.stringify(moduleUrl)};
        const watcher = openWatcherDirectory(${JSON.stringify(watcher.path)});
        const journals = openWatcherDirectory(${JSON.stringify(journals.path)});
        const lock = acquireWatcherHostLock(watcher, { operation: "service",
          service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932", prior_pointer_digest: null,
          prior_coherent_manifest_digest: null, prior_journal_pointer_digest: null });
        bootstrapWatcherJournal({ root: journals, host_lock: lock, coordinates: { vault_id: "vault",
          configuration_digest: ${JSON.stringify(D)}, policy_digest: ${JSON.stringify(D)}, effective_profile_digest: ${JSON.stringify(D)},
          anchor_coherent_manifest_digest: null }, on_boundary(value) { if (value === "planned_target_stage") process.exit(93); } });
      `], { encoding: "utf8" });
      assert.equal(first.status, 93, first.stderr);
      const second = spawnSync(process.execPath, ["--input-type=module", "-e", `
        import { openWatcherDirectory, recoverWatcherJournalBootstrap } from ${JSON.stringify(moduleUrl)};
        const watcher = openWatcherDirectory(${JSON.stringify(watcher.path)});
        const journals = openWatcherDirectory(${JSON.stringify(journals.path)});
        recoverWatcherJournalBootstrap({ watcher_root: watcher, journal_root: journals,
          service_instance_id: "019b2d14-4234-7db7-87d4-7d81cfaec932", prior_pointer_digest: null,
          prior_coherent_manifest_digest: null, coordinates: { vault_id: "vault", configuration_digest: ${JSON.stringify(D)},
          policy_digest: ${JSON.stringify(D)}, effective_profile_digest: ${JSON.stringify(D)}, anchor_coherent_manifest_digest: null },
          revalidate_namespace() {}, on_boundary(value) { if (value === ${JSON.stringify(boundary)}) process.exit(94); } });
      `], { encoding: "utf8" });
      assert.equal(second.status, 94, `${boundary}: ${second.stderr}`);
      const recoveredWatcher = openWatcherDirectory(watcher.path);
      const recoveredJournals = openWatcherDirectory(journals.path);
      const recovered = recoverWatcherJournalBootstrap({
        watcher_root: recoveredWatcher, journal_root: recoveredJournals, service_instance_id: "019b2d14-4235-7db7-87d4-7d81cfaec932",
        prior_pointer_digest: null, prior_coherent_manifest_digest: null,
        coordinates: { vault_id: "vault", configuration_digest: D, policy_digest: D, effective_profile_digest: D, anchor_coherent_manifest_digest: null },
        revalidate_namespace() {},
      });
      const executorArtifacts = listWatcherLeaves(recoveredWatcher).filter((leaf) => /^watcher-journal-bootstrap-recovery-executor-[0-9a-f]{64}\.json$/u.test(leaf));
      assert.ok(executorArtifacts.length >= (recoveryBoundaries.indexOf(boundary) >= recoveryBoundaries.indexOf("executor") ? 2 : 1));
      closeWatcherJournal(recovered.journal);
      releaseWatcherHostLock(recovered.host_lock);
      validateWatcherBootstrapTerminalEvidence(recoveredWatcher, recoveredJournals);
    });
  }
});

test("journal cap admission uses only DB+WAL+SHM and rejects exact +1 boundaries", () => {
  const admitted = watcherJournalAdmission({ current_database_bytes: 1, blob_bytes: 0, mutated_rows: 0 });
  assert.equal(admitted.dirty_page_upper, 4096);
  assert.throws(
    () => watcherJournalAdmission({ current_database_bytes: 2_048_000_001, blob_bytes: 0, mutated_rows: 0 }),
    /WATCHER_JOURNAL_CAP_EXCEEDED/u,
  );
  assert.throws(
    () => watcherJournalAdmission({ current_database_bytes: 1, blob_bytes: 33_554_433, mutated_rows: 0 }),
    /WATCHER_JOURNAL_CAP_EXCEEDED/u,
  );
});

test("journal activation persists prepared5 before complete6 and reopens one active body", (t) => {
  const { watcher, journals } = roots(t);
  const lock = acquireWatcherHostLock(watcher, {
    operation: "service",
    service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932",
    prior_pointer_digest: null,
    prior_coherent_manifest_digest: null,
    prior_journal_pointer_digest: null,
  });
  const handle = bootstrapWatcherJournal({
    root: journals,
    host_lock: lock,
    coordinates: {
      vault_id: "vault",
      configuration_digest: D,
      policy_digest: D,
      effective_profile_digest: D,
      anchor_coherent_manifest_digest: null,
    },
  });
  const semantic = CONFORMANCE.semantic_cases.find((row) => row.case_id === "coherent-activation-complete");
  assert.ok(semantic);
  const bundle = semantic.input.arguments[0];
  prepareWatcherJournalActivation(handle, {
    batch: bundle.batch,
    observation_authority: bundle.observation_authority,
    plan_authority: bundle.plan_authority,
    transitions: bundle.transitions.slice(0, 6),
    intent: bundle.intent,
    source_removal_event_set_bundle: bundle.source_removal_event_set_bundle,
  });
  assert.equal(readWatcherJournalActive(handle), null);
  assert.equal(handle.database.prepare("SELECT COUNT(*) AS count FROM transitions;").get().count, 6);
  finalizeWatcherJournalActivation(handle, {
    complete_transition: bundle.transitions[6],
    outcome: bundle.outcome,
    active: bundle.active,
    source_removal_activation: bundle.source_removal_activation,
  });
  assert.deepEqual(readWatcherJournalActive(handle), bundle.active);
  closeWatcherJournal(handle);
  releaseWatcherHostLock(lock);

  const reopened = openWatcherJournal(journals);
  assert.ok(reopened);
  assert.deepEqual(readWatcherJournalActive(reopened), bundle.active);
  assert.equal(reopened.database.prepare("SELECT terminal_state FROM batches;").get().terminal_state, "complete");
  closeWatcherJournal(reopened);
});

test("journal reset publishes a recovery Plan before mutation and reaches the stable replacement generation", (t) => {
  const { watcher, journals } = roots(t);
  const { bundle, journal, resetLock } = prepareResetFixture(watcher, journals);
  const oldGenerationDigest = journal.generation.journal_generation_digest;
  const boundaries = [];
  const result = resetWatcherJournal({
    watcher_directory: watcher,
    journal,
    host_lock: resetLock,
    outer_pointer: bundle.pointer,
    outer_manifest: bundle.manifest,
    expected_journal_generation_digest: oldGenerationDigest,
    expected_coherent_manifest_digest: bundle.manifest.coherent_manifest_digest,
    on_boundary(value) { boundaries.push(value); },
  });
  assert.equal(result.status, "reset");
  assert.equal(result.prior_journal_generation_digest, oldGenerationDigest);
  assert.notEqual(result.new_journal_generation_digest, oldGenerationDigest);
  assert.equal(watcherJournalResetRecoveryActive(watcher, journals), false);
  assert.ok(boundaries.indexOf("plan") < boundaries.indexOf("guard"));
  assert.ok(boundaries.indexOf("guard_removed") < boundaries.indexOf("plan_removed"));
  assert.ok(boundaries.indexOf("plan_removed") < boundaries.indexOf("executor_released"));
  assert.ok(boundaries.indexOf("executor_released") < boundaries.indexOf("current_lock_released"));
  const reopened = openWatcherJournal(journals);
  assert.ok(reopened);
  assert.equal(reopened.generation.journal_generation_digest, result.new_journal_generation_digest);
  assert.equal(reopened.meta.anchor_coherent_manifest_digest, bundle.manifest.coherent_manifest_digest);
  assert.equal(readWatcherJournalActive(reopened), null);
  closeWatcherJournal(reopened);
  assert.equal(recoverWatcherJournalReset({ watcher_root: watcher, journal_root: journals }), null);
});

test("journal reset recovery converges from every exposed durable Plan, SQLite, pointer, and cleanup cut", async (t) => {
  const boundaries = [
    "plan_stage", "plan", "reset_guard_stage", "reset_guard", "guard", "child", "database_file",
    "database_schema_commit", "database_schema_checkpoint", "database_seed_commit", "database_seed_checkpoint", "database",
    "generation_descriptor", "pointer_artifact", "pointer_immutable_pointer", "pointer_guard_stage", "pointer_guard_linked",
    "pointer_guard_stage_removed", "pointer_temporary_pointer", "pointer_target_prepared", "pointer_fixed_pointer",
    "pointer_target_finalized", "pointer_guard_removed", "pointer", "guard_removed", "bridge_stage", "bridge",
    "executor_stage", "executor", "old_lock_removed", "current_lock", "plan_removed", "executor_released",
    "current_lock_released",
  ];
  for (const [index, boundary] of boundaries.entries()) {
    await t.test(boundary, (childTest) => {
      const { watcher, journals } = roots(childTest);
      const exitCode = 70 + index % 20;
      const child = spawnSync(process.execPath, ["--input-type=module", "-e",
        resetCrashProgram(watcher.path, journals.path, boundary, exitCode)], { encoding: "utf8" });
      assert.equal(child.status, exitCode, `${boundary}: ${child.stderr}`);
      const recoveredWatcher = openWatcherDirectory(watcher.path);
      const recoveredJournals = openWatcherDirectory(journals.path);
      const recovered = recoverWatcherJournalReset({ watcher_root: recoveredWatcher, journal_root: recoveredJournals });
      if (boundary === "current_lock_released") assert.equal(recovered, null);
      else assert.equal(recovered?.status, "reset", boundary);
      assert.equal(watcherJournalResetRecoveryActive(recoveredWatcher, recoveredJournals), false, boundary);
      const reopened = openWatcherJournal(recoveredJournals);
      assert.ok(reopened, boundary);
      assert.notEqual(reopened.pointer.prior_pointer_digest, null, boundary);
      assert.notEqual(reopened.meta.anchor_coherent_manifest_digest, null, boundary);
      assert.equal(readWatcherJournalActive(reopened), null, boundary);
      closeWatcherJournal(reopened);
      const watcherLeaves = listWatcherLeaves(recoveredWatcher);
      assert.equal(watcherLeaves.includes("watcher-authority.lock"), false, boundary);
      assert.equal(watcherLeaves.includes("watcher-authority.recovery"), false, boundary);
      assert.equal(watcherLeaves.includes("watcher-journal-reset-recovery-executor.json"), false, boundary);
    });
  }
});

test("journal reset recovers exact sub-write cuts without adopting ambiguous authority", async (t) => {
  const writeCuts = ["created", "partial_write", "written", "file_fsynced", "parent_fsynced"];
  for (const prefix of ["plan_stage", "bridge_stage", "executor_stage", "current_lock"]) {
    for (const [index, cut] of writeCuts.entries()) {
      const boundary = `${prefix}_${cut}`;
      await t.test(boundary, (childTest) => {
        const { watcher, journals } = roots(childTest);
        const exitCode = 110 + index;
        const child = spawnSync(process.execPath, ["--input-type=module", "-e",
          resetCrashProgram(watcher.path, journals.path, boundary, exitCode)], { encoding: "utf8" });
        assert.equal(child.status, exitCode, `${boundary}: ${child.stderr}`);
        const recoveredWatcher = openWatcherDirectory(watcher.path);
        const recoveredJournals = openWatcherDirectory(journals.path);
        const result = recoverWatcherJournalReset({ watcher_root: recoveredWatcher, journal_root: recoveredJournals });
        if (prefix === "plan_stage" && ["created", "partial_write"].includes(cut)) {
          assert.equal(result, null, boundary);
          assert.equal(watcherJournalResetRecoveryActive(recoveredWatcher, recoveredJournals), false, boundary);
          const old = openWatcherJournal(recoveredJournals);
          assert.ok(old, boundary);
          assert.equal(old.pointer.prior_pointer_digest, null, boundary);
          closeWatcherJournal(old);
        } else {
          assert.equal(result?.status, "reset", boundary);
          assert.equal(watcherJournalResetRecoveryActive(recoveredWatcher, recoveredJournals), false, boundary);
        }
      });
    }
  }

  for (const [index, cut] of writeCuts.entries()) {
    const boundary = `old_lock_${cut}`;
    await t.test(boundary, (childTest) => {
      const { watcher, journals } = roots(childTest);
      const original = spawnSync(process.execPath, ["--input-type=module", "-e",
        resetCrashProgram(watcher.path, journals.path, "plan", 117)], { encoding: "utf8" });
      assert.equal(original.status, 117, original.stderr);
      const recovery = spawnSync(process.execPath, ["--input-type=module", "-e",
        resetRecoveryCrashProgram(watcher.path, journals.path, boundary, 120 + index)], { encoding: "utf8" });
      assert.equal(recovery.status, 120 + index, `${boundary}: ${recovery.stderr}`);
      const recoveredWatcher = openWatcherDirectory(watcher.path);
      const recoveredJournals = openWatcherDirectory(journals.path);
      const result = recoverWatcherJournalReset({ watcher_root: recoveredWatcher, journal_root: recoveredJournals });
      assert.equal(result?.status, "reset", boundary);
      assert.equal(watcherJournalResetRecoveryActive(recoveredWatcher, recoveredJournals), false, boundary);
    });
  }
});

test("live reset owner prevents contender cleanup of created or partial Plan and Bridge stages", async (t) => {
  for (const boundary of [
    "plan_stage_created", "plan_stage_partial_write", "bridge_stage_created", "bridge_stage_partial_write",
  ]) {
    await t.test(boundary, async (childTest) => {
      const { watcher, journals } = roots(childTest);
      const child = spawn(process.execPath, ["--input-type=module", "-e",
        resetCrashProgram(watcher.path, journals.path, boundary, 126, true)], {
        encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      await new Promise((resolveReady, rejectReady) => {
        let stdout = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
          if (stdout.includes("READY\n")) resolveReady();
        });
        child.once("error", rejectReady);
        child.once("exit", (code) => rejectReady(new Error(`paused reset owner exited ${code}: ${stderr}`)));
      });
      const liveWatcher = openWatcherDirectory(watcher.path);
      const liveJournals = openWatcherDirectory(journals.path);
      const isPlan = boundary.startsWith("plan_");
      const leaf = isPlan
        ? ".watcher-journal-reset-recovery-plan.json.gkos-watcher.stage"
        : listWatcherLeaves(liveWatcher)
          .find((item) => /^\.watcher-journal-reset-recovery-bridge-[0-9a-f]{64}\.json\.gkos-watcher\.stage$/u.test(item));
      assert.equal(typeof leaf, "string");
      const path = join(isPlan ? journals.path : watcher.path, leaf);
      const before = readFileSync(path);
      assert.throws(
        () => recoverWatcherJournalReset({ watcher_root: liveWatcher, journal_root: liveJournals }),
        /GKX_WATCHER_HOST_LOCKED/u,
      );
      assert.deepEqual(readFileSync(path), before, `${boundary}: live-owner evidence changed`);
      const exited = once(child, "exit");
      assert.equal(child.kill(), true);
      await exited;
      const result = recoverWatcherJournalReset({ watcher_root: liveWatcher, journal_root: liveJournals });
      if (isPlan) {
        assert.equal(result, null);
        assert.equal(existsSync(path), false);
      } else {
        assert.equal(result?.status, "reset");
        assert.equal(watcherJournalResetRecoveryActive(liveWatcher, liveJournals), false);
      }
    });
  }
});

test("live-original reset stops before further mutation when recovery authority appears", (t) => {
  const { watcher, journals } = roots(t);
  const { bundle, journal, resetLock } = prepareResetFixture(watcher, journals);
  const original = assertWatcherHostLock(resetLock);
  let injected = false;
  assert.throws(() => resetWatcherJournal({
    watcher_directory: watcher, journal, host_lock: resetLock,
    outer_pointer: bundle.pointer, outer_manifest: bundle.manifest,
    expected_journal_generation_digest: journal.generation.journal_generation_digest,
    expected_coherent_manifest_digest: bundle.manifest.coherent_manifest_digest,
    on_boundary(boundary) {
      if (boundary !== "reset_guard_stage" || injected) return;
      injected = true;
      const claimBase = {
        contract_version: "gkos-watcher-host-lock-recovery/1.0.0-draft.1",
        claim_id: "019b2d14-4234-7db7-87d4-7d81cfaec932",
        observed_lock_digest: original.lock_digest,
        observed_process_id: process.pid,
        claimant_process_id: process.pid,
        owner_nonce: "1".repeat(32),
        created_at: "2026-08-20T00:00:00.000Z",
      };
      const claim = { ...claimBase, claim_digest: watcherDigest(claimBase) };
      writeNewWatcherFile(watcher, "watcher-authority.recovery", watcherCanonicalBytes(claim));
    },
  }), /GKX_WATCHER_RESET_RECOVERY_AUTHORITY_CONFLICT/u);
  assert.equal(injected, true);
  const plan = JSON.parse(readFileSync(join(journals.path, "watcher-journal-reset-recovery-plan.json"), "utf8"));
  assert.equal(existsSync(join(journals.path, plan.new_generation.directory_leaf)), false,
    "recovery interlock prevents child/DB/pointer mutation after Q appears");
  assert.equal(existsSync(join(journals.path, ".gkos-watcher-journal-reset.guard")), false,
    "the staged guard is not linked after Q appears");
});

test("journal reset recovery-of-recovery hands off dead executors through target and terminal cleanup", async (t) => {
  const boundaries = [
    "claim", "bridge_stage", "bridge", "executor_stage", "executor", "old_lock_removed", "old_lock",
    "reset_guard_stage", "database_schema_commit", "database_seed_commit", "pointer_guard_linked",
    "pointer_fixed_pointer", "guard_removed", "current_lock", "claim_removed", "plan_removed",
    "executor_released", "current_lock_released",
  ];
  for (const [index, boundary] of boundaries.entries()) {
    await t.test(boundary, (childTest) => {
      const { watcher, journals } = roots(childTest);
      const originalExit = 91;
      const original = spawnSync(process.execPath, ["--input-type=module", "-e",
        resetCrashProgram(watcher.path, journals.path, "plan", originalExit)], { encoding: "utf8" });
      assert.equal(original.status, originalExit, `${boundary}/original: ${original.stderr}`);
      const recoveryExit = 100 + index;
      const recovery = spawnSync(process.execPath, ["--input-type=module", "-e",
        resetRecoveryCrashProgram(watcher.path, journals.path, boundary, recoveryExit)], { encoding: "utf8" });
      assert.equal(recovery.status, recoveryExit, `${boundary}/recovery: ${recovery.stderr}`);
      const recoveredWatcher = openWatcherDirectory(watcher.path);
      const recoveredJournals = openWatcherDirectory(journals.path);
      const result = recoverWatcherJournalReset({ watcher_root: recoveredWatcher, journal_root: recoveredJournals });
      if (boundary === "current_lock_released") assert.equal(result, null);
      else assert.equal(result?.status, "reset", boundary);
      assert.equal(watcherJournalResetRecoveryActive(recoveredWatcher, recoveredJournals), false, boundary);
      const reopened = openWatcherJournal(recoveredJournals);
      assert.ok(reopened, boundary);
      assert.notEqual(reopened.pointer.prior_pointer_digest, null, boundary);
      assert.notEqual(reopened.meta.anchor_coherent_manifest_digest, null, boundary);
      closeWatcherJournal(reopened);
      const watcherLeaves = listWatcherLeaves(recoveredWatcher);
      assert.equal(watcherLeaves.includes("watcher-authority.lock"), false, boundary);
      assert.equal(watcherLeaves.includes("watcher-authority.recovery"), false, boundary);
      assert.equal(watcherLeaves.includes("watcher-journal-reset-recovery-executor.json"), false, boundary);
      const executorArtifacts = watcherLeaves.filter((leaf) => /^watcher-journal-reset-recovery-executor-[0-9a-f]{64}\.json$/u.test(leaf));
      const requiresHandoff = boundaries.indexOf(boundary) >= boundaries.indexOf("executor")
        && boundaries.indexOf(boundary) <= boundaries.indexOf("plan_removed");
      assert.ok(executorArtifacts.length >= (requiresHandoff ? 2 : 1), boundary);
    });
  }
});

test("journal reset finite SQLite states remove only exact incomplete authority and retain ambiguity", async (t) => {
  const convergent = [
    ["size-99", (state) => writeFileSync(state.databasePath, Buffer.alloc(99, 0xa5))],
    ["canonical-header-100", (state) => writeFileSync(state.databasePath, canonicalSqliteHeaderPrefix(100))],
    ["canonical-header-4095", (state) => writeFileSync(state.databasePath, canonicalSqliteHeaderPrefix(4095))],
    ["parseable-zero-object", (state) => {
      rmSync(state.databasePath);
      const database = new DatabaseSync(state.databasePath);
      database.exec("PRAGMA page_size=4096; PRAGMA auto_vacuum=NONE; VACUUM;");
      database.close();
      if (process.platform !== "win32") chmodSync(state.databasePath, 0o600);
    }],
  ];
  for (const [name, mutate] of convergent) {
    await t.test(name, (childTest) => {
      const { watcher, journals } = roots(childTest);
      const state = resetDatabaseCrashState(watcher, journals);
      mutate(state);
      if (process.platform !== "win32") chmodSync(state.databasePath, 0o600);
      const recoveredWatcher = openWatcherDirectory(watcher.path);
      const recoveredJournals = openWatcherDirectory(journals.path);
      const result = recoverWatcherJournalReset({ watcher_root: recoveredWatcher, journal_root: recoveredJournals });
      assert.equal(result?.status, "reset");
      const reopened = openWatcherJournal(recoveredJournals);
      assert.ok(reopened);
      assert.equal(reopened.generation.journal_generation_digest, result.new_journal_generation_digest);
      closeWatcherJournal(reopened);
    });
  }

  const rejected = [
    ["non-sqlite-4095", (state) => writeFileSync(state.databasePath, Buffer.alloc(4095, 0xa5)), /WATCHER_JOURNAL_INTEGRITY_INVALID/u],
    ["partial-schema", (state) => {
      rmSync(state.databasePath);
      const database = new DatabaseSync(state.databasePath);
      database.exec("PRAGMA page_size=4096; CREATE TABLE unratified(value TEXT);");
      database.close();
      if (process.platform !== "win32") chmodSync(state.databasePath, 0o600);
    }, /WATCHER_JOURNAL_SCHEMA_INVALID/u],
    ["wal-without-database", (state) => {
      rmSync(state.databasePath);
      writeFileSync(`${state.databasePath}-wal`, Buffer.from("not-authority"), { mode: 0o600 });
    }, /WATCHER_JOURNAL_IDENTITY_INVALID/u],
    ["extra-hardlink", (state) => linkSync(state.databasePath, `${state.databasePath}-wal`), /WATCHER_JOURNAL_IDENTITY_INVALID/u],
    ["unknown-child-leaf", (state) => writeFileSync(join(state.childPath, "unratified"), "x", { mode: 0o600 }), /WATCHER_JOURNAL_IDENTITY_INVALID/u],
  ];
  for (const [name, mutate, expected] of rejected) {
    await t.test(name, (childTest) => {
      const { watcher, journals } = roots(childTest);
      const state = resetDatabaseCrashState(watcher, journals);
      mutate(state);
      assert.throws(() => recoverWatcherJournalReset({
        watcher_root: openWatcherDirectory(watcher.path), journal_root: openWatcherDirectory(journals.path),
      }), expected);
      assert.equal(existsSync(join(journals.path, "watcher-journal-reset-recovery-plan.json")), true);
    });
  }
});

test("journal reset recovery retains Plan, Bridge, Executor, outer, and namespace ambiguity", async (t) => {
  for (const [name, boundary, locate] of [
    ["partial-plan-extra-link", "plan_stage_partial_write", (_watcher, journals) => join(journals.path, ".watcher-journal-reset-recovery-plan.json.gkos-watcher.stage")],
    ["partial-bridge-extra-link", "bridge_stage_partial_write", (watcher) => join(watcher.path,
      listWatcherLeaves(watcher).find((leaf) => /^\.watcher-journal-reset-recovery-bridge-[0-9a-f]{64}\.json\.gkos-watcher\.stage$/u.test(leaf)))],
    ["partial-executor-extra-link", "executor_stage_partial_write", (watcher) => join(watcher.path, ".watcher-journal-reset-recovery-executor.json.gkos-watcher.stage")],
    ["partial-current-lock-extra-link", "current_lock_partial_write", (watcher) => join(watcher.path, "watcher-authority.lock")],
  ]) {
    await t.test(name, (childTest) => {
      const { watcher, journals } = roots(childTest);
      const child = spawnSync(process.execPath, ["--input-type=module", "-e",
        resetCrashProgram(watcher.path, journals.path, boundary, 121)], { encoding: "utf8" });
      assert.equal(child.status, 121, child.stderr);
      const recoveredWatcher = openWatcherDirectory(watcher.path);
      const recoveredJournals = openWatcherDirectory(journals.path);
      const primary = locate(recoveredWatcher, recoveredJournals);
      assert.equal(typeof primary, "string");
      linkSync(primary, `${primary}.outside-link`);
      assert.throws(() => recoverWatcherJournalReset({
        watcher_root: openWatcherDirectory(watcher.path), journal_root: openWatcherDirectory(journals.path),
      }), /GKX_WATCHER_/u);
      assert.equal(existsSync(primary), true);
    });
  }

  await t.test("plan-extra-link", (childTest) => {
    const { watcher, journals } = roots(childTest);
    const exitCode = 88;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e",
      resetCrashProgram(watcher.path, journals.path, "plan", exitCode)], { encoding: "utf8" });
    assert.equal(child.status, exitCode, child.stderr);
    const planFile = join(journals.path, "watcher-journal-reset-recovery-plan.json");
    linkSync(planFile, join(journals.path, "watcher-journal-reset-recovery-plan.alias"));
    assert.throws(() => recoverWatcherJournalReset({
      watcher_root: openWatcherDirectory(watcher.path), journal_root: openWatcherDirectory(journals.path),
    }));
    assert.equal(existsSync(planFile), true);
  });

  await t.test("bridge-stage-final-distinct-inode", (childTest) => {
    const { watcher, journals } = roots(childTest);
    const original = spawnSync(process.execPath, ["--input-type=module", "-e",
      resetCrashProgram(watcher.path, journals.path, "plan", 86)], { encoding: "utf8" });
    assert.equal(original.status, 86, original.stderr);
    const recovery = spawnSync(process.execPath, ["--input-type=module", "-e",
      resetRecoveryCrashProgram(watcher.path, journals.path, "bridge_stage", 87)], { encoding: "utf8" });
    assert.equal(recovery.status, 87, recovery.stderr);
    const stageLeaf = listWatcherLeaves(openWatcherDirectory(watcher.path))
      .find((leaf) => /^\.watcher-journal-reset-recovery-bridge-[0-9a-f]{64}\.json\.gkos-watcher\.stage$/u.test(leaf));
    assert.ok(stageLeaf);
    const bytes = readFileSync(join(watcher.path, stageLeaf));
    const bridge = JSON.parse(bytes.toString("utf8"));
    writeFileSync(join(watcher.path, `watcher-journal-reset-recovery-bridge-${bridge.bridge_digest.slice(7)}.json`), bytes,
      { flag: "wx", mode: 0o600 });
    assert.throws(() => recoverWatcherJournalReset({
      watcher_root: openWatcherDirectory(watcher.path), journal_root: openWatcherDirectory(journals.path),
    }), /GKX_WATCHER_/u);
    assert.equal(existsSync(join(watcher.path, stageLeaf)), true);
  });

  await t.test("executor-third-link", (childTest) => {
    const { watcher, journals } = roots(childTest);
    const original = spawnSync(process.execPath, ["--input-type=module", "-e",
      resetCrashProgram(watcher.path, journals.path, "plan", 84)], { encoding: "utf8" });
    assert.equal(original.status, 84, original.stderr);
    const recovery = spawnSync(process.execPath, ["--input-type=module", "-e",
      resetRecoveryCrashProgram(watcher.path, journals.path, "executor", 85)], { encoding: "utf8" });
    assert.equal(recovery.status, 85, recovery.stderr);
    linkSync(join(watcher.path, "watcher-journal-reset-recovery-executor.json"),
      join(watcher.path, "watcher-journal-reset-recovery-executor.extra"));
    assert.throws(() => recoverWatcherJournalReset({
      watcher_root: openWatcherDirectory(watcher.path), journal_root: openWatcherDirectory(journals.path),
    }), /GKX_WATCHER_/u);
    assert.equal(existsSync(join(watcher.path, "watcher-journal-reset-recovery-executor.json")), true);
  });

  await t.test("outer-pointer-drift", (childTest) => {
    const { watcher, journals } = roots(childTest);
    const child = spawnSync(process.execPath, ["--input-type=module", "-e",
      resetCrashProgram(watcher.path, journals.path, "plan", 83)], { encoding: "utf8" });
    assert.equal(child.status, 83, child.stderr);
    writeFileSync(join(watcher.path, "watcher-active.json"), "{}\n");
    assert.throws(() => recoverWatcherJournalReset({
      watcher_root: openWatcherDirectory(watcher.path), journal_root: openWatcherDirectory(journals.path),
    }));
    assert.equal(existsSync(join(journals.path, "watcher-journal-reset-recovery-plan.json")), true);
  });

  await t.test("unknown-reset-reserved-leaf", (childTest) => {
    const { watcher, journals } = roots(childTest);
    const child = spawnSync(process.execPath, ["--input-type=module", "-e",
      resetCrashProgram(watcher.path, journals.path, "plan", 82)], { encoding: "utf8" });
    assert.equal(child.status, 82, child.stderr);
    writeFileSync(join(journals.path, ".gkos-watcher-journal-reset.unratified"), "x", { mode: 0o600 });
    assert.throws(() => recoverWatcherJournalReset({
      watcher_root: openWatcherDirectory(watcher.path), journal_root: openWatcherDirectory(journals.path),
    }),
      /GKX_WATCHER_RESET_RECOVERY_NAMESPACE_INVALID/u);
    assert.equal(existsSync(join(journals.path, "watcher-journal-reset-recovery-plan.json")), true);
  });
});

test("failure-retry unchanged success commits exactly four rows and preserves Active", (t) => {
  const { watcher, journals, retrieval } = roots(t);
  const row = CONFORMANCE.semantic_cases.find((item) => item.case_id === "failure-retry-noop-complete");
  const adoptionRow = CONFORMANCE.semantic_cases.find((item) => item.case_id === "journal-reset-reconciliation-adoption-valid");
  assert.ok(row?.expectation.accepted);
  assert.ok(adoptionRow?.expectation.accepted);
  const bundle = row.input.arguments[0];
  const nativeTransitions = adoptionRow.input.arguments[0].native_transitions;
  const manifest = bundle.current_coherent_manifest;
  const pointer = bundle.current_outer_pointer;
  const retry = bundle.failure_retry_bundle;
  const put = (directory, leaf, value) => {
    writeNewWatcherFile(directory, leaf, watcherCanonicalBytes(value));
  };

  const lock = acquireWatcherHostLock(watcher, {
    operation: "service", service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932",
    prior_pointer_digest: null, prior_coherent_manifest_digest: null, prior_journal_pointer_digest: null,
  });
  const handle = bootstrapWatcherJournal({
    root: journals, host_lock: lock,
    coordinates: {
      vault_id: manifest.vault_id, configuration_digest: manifest.configuration_digest,
      policy_digest: manifest.policy_digest, effective_profile_digest: manifest.effective_profile_digest,
      anchor_coherent_manifest_digest: null,
    },
  });
  put(watcher, `watcher-pointer-${pointer.pointer_digest.slice(7)}.json`, pointer);
  put(watcher, "watcher-active.json", pointer);
  put(watcher, pointer.coherent_manifest_file, manifest);
  put(watcher, manifest.topology_artifact_file, bundle.current_topology);
  put(watcher, manifest.graph_projection_state.graph_artifact_file, bundle.current_raw_graph);
  const ownerPath = join(retrieval.path, `ingest-generation-${bundle.current_owner_manifest.owner_manifest_digest.slice(7)}.json`);
  writeNewWatcherFile(retrieval, `ingest-generation-${bundle.current_owner_manifest.owner_manifest_digest.slice(7)}.json`,
    Buffer.from(`${stableJson(bundle.current_owner_manifest)}\n`, "utf8"));
  put(watcher, retry.failed_observation_authority.observation_artifact_file, retry.failed_observation);
  put(watcher, retry.retry_observation_authority.observation_artifact_file, retry.retry_observation);
  put(watcher, bundle.retry_plan_authority.plan_artifact_file, bundle.retry_plan);

  const currentBatchBase = {
    contract_version: "gkos-watcher-batch-record/1.0.0-draft.1",
    batch_id: nativeTransitions[0].batch_id, batch_kind: "event",
    observation_authority_digest: `sha256:${"b".repeat(64)}`,
    started_at: nativeTransitions[0].recorded_at, execution_kind: "apply_changes", retry_of_batch_id: null,
  };
  const currentBatch = { ...currentBatchBase, batch_record_digest: watcherDigest(currentBatchBase) };
  const sqlBody = (value) => Buffer.from(JSON.stringify(JSON.parse(watcherCanonicalBytes(value).toString("utf8"))), "utf8");
  const currentBodies = [currentBatch, ...nativeTransitions, bundle.current_activation_intent,
    bundle.current_activation_outcome, bundle.current_active].map(sqlBody);
  watcherJournalTransaction(handle, {
    blob_bytes: currentBodies.reduce((sum, value) => sum + value.byteLength, 0), mutated_rows: currentBodies.length,
    run(database) {
      database.prepare("INSERT INTO batches(batch_id,started_at,target_topology_snapshot_digest,terminal_state,terminal_transition_digest,body) VALUES(?,?,?,?,?,?);")
        .run(currentBatch.batch_id, currentBatch.started_at, manifest.topology_snapshot_digest, "complete",
          nativeTransitions.at(-1).transition_digest, currentBodies[0]);
      const transition = database.prepare("INSERT INTO transitions(batch_id,transition_ordinal,state,prior_transition_digest,transition_digest,body) VALUES(?,?,?,?,?,?);");
      nativeTransitions.forEach((value, index) => transition.run(value.batch_id, value.transition_ordinal, value.state,
        value.prior_transition_digest, value.transition_digest, currentBodies[index + 1]));
      database.prepare("INSERT INTO activation_intents(intent_digest,coherent_manifest_digest,target_complete_transition_digest,body) VALUES(?,?,?,?);")
        .run(bundle.current_activation_intent.intent_digest, manifest.coherent_manifest_digest,
          nativeTransitions.at(-1).transition_digest, currentBodies[8]);
      database.prepare("INSERT INTO activation_outcomes(outcome_digest,intent_digest,coherent_manifest_digest,outcome,body) VALUES(?,?,?,?,?);")
        .run(bundle.current_activation_outcome.outcome_digest, bundle.current_activation_intent.intent_digest,
          manifest.coherent_manifest_digest, "published", currentBodies[9]);
      database.prepare("INSERT INTO active_coherent(singleton,active_digest,coherent_manifest_digest,pointer_digest,body) VALUES(1,?,?,?,?);")
        .run(bundle.current_active.active_digest, manifest.coherent_manifest_digest, pointer.pointer_digest, currentBodies[10]);
    },
  });
  recordWatcherJournalFailure(handle, {
    batch: retry.failed_batch, observation_authority: retry.failed_observation_authority,
    transitions: retry.failed_transitions,
  });
  const assertPhysicalMutationRejected = (statement) => {
    handle.database.exec("BEGIN IMMEDIATE;");
    try {
      handle.database.exec(statement);
      assert.throws(() => validateWatcherJournalAdoptionProjection(handle), /WATCHER_JOURNAL_VALUE_INVALID/u);
    } finally { handle.database.exec("ROLLBACK;"); }
    assert.equal(validateWatcherJournalAdoptionProjection(handle), null);
  };
  assertPhysicalMutationRejected(`UPDATE batches SET started_at='2026-08-20T00:00:09.000Z' WHERE batch_id='${retry.failed_batch.batch_id}';`);
  assertPhysicalMutationRejected(`UPDATE observations SET raw_sha256='sha256:${"f".repeat(64)}' WHERE batch_id='${retry.failed_batch.batch_id}';`);
  const makeFailed = (batchId, startedAt, retryOf = null) => deriveWatcherFailureAuthority({
    vault_id: manifest.vault_id, configuration_digest: manifest.configuration_digest,
    policy_digest: manifest.policy_digest, effective_profile_digest: manifest.effective_profile_digest,
    prior_pointer: pointer, prior_manifest: manifest, prior_topology: bundle.current_topology,
    batch_kind: retryOf === null ? "event" : "failure_reconciliation", execution_kind: "set_files",
    retry_of_batch_id: retryOf, observed_paths: [], unscoped: true, overflow: false,
    batch_id: batchId, started_at: startedAt, failed_at: startedAt,
  });
  const deleteFailed = (batchIds) => {
    handle.database.exec("BEGIN IMMEDIATE;");
    try {
      const transitions = handle.database.prepare("DELETE FROM transitions WHERE batch_id=?;");
      const observations = handle.database.prepare("DELETE FROM observations WHERE batch_id=?;");
      const batches = handle.database.prepare("DELETE FROM batches WHERE batch_id=?;");
      for (const batchId of batchIds) { transitions.run(batchId); observations.run(batchId); batches.run(batchId); }
      handle.database.exec("COMMIT;");
    } catch (error) { handle.database.exec("ROLLBACK;"); throw error; }
  };
  const secondRoot = makeFailed("019b2d14-4237-7db7-87d4-7d81cfaec932", "2026-08-20T00:00:07.000Z");
  persistWatcherFailureAuthorityArtifacts(watcher, secondRoot);
  recordWatcherJournalFailure(handle, { batch: secondRoot.batch, observation_authority: secondRoot.observation_authority,
    transitions: secondRoot.transitions });
  assert.throws(() => readWatcherFailureRetryEpoch({ watcher_directory: watcher, retrieval_directory: retrieval, journal: handle,
    current_outer_pointer: pointer }), /WATCHER_JOURNAL_VALUE_INVALID/u);
  deleteFailed([secondRoot.batch.batch_id]);
  const forkA = makeFailed("019b2d14-4238-7db7-87d4-7d81cfaec932", "2026-08-20T00:00:08.000Z", retry.failed_batch.batch_id);
  const forkB = makeFailed("019b2d14-4239-7db7-87d4-7d81cfaec932", "2026-08-20T00:00:09.000Z", retry.failed_batch.batch_id);
  for (const child of [forkA, forkB]) {
    persistWatcherFailureAuthorityArtifacts(watcher, child);
    recordWatcherJournalFailure(handle, { batch: child.batch, observation_authority: child.observation_authority,
      transitions: child.transitions });
  }
  assert.throws(() => readWatcherFailureRetryEpoch({ watcher_directory: watcher, retrieval_directory: retrieval, journal: handle,
    current_outer_pointer: pointer }), /WATCHER_JOURNAL_VALUE_INVALID/u);
  deleteFailed([forkA.batch.batch_id, forkB.batch.batch_id]);
  const unresolved = readWatcherFailureRetryEpoch({ watcher_directory: watcher, retrieval_directory: retrieval, journal: handle,
    current_outer_pointer: pointer });
  assert.equal(unresolved.failure_index, 0);
  assert.equal(unresolved.failed_authority.batch.batch_id, retry.failed_batch.batch_id);
  const ownerBytes = readFileSync(ownerPath);
  writeFileSync(ownerPath, '{"unratified":true}\n');
  assert.throws(() => validateWatcherFailureRetryNoopPhysicalAuthority({
    watcher_directory: watcher, retrieval_directory: openWatcherDirectory(retrieval.path), journal: handle, bundle,
  }), /GKX_|WATCHER_/u);
  writeFileSync(ownerPath, ownerBytes);
  const restoredRetrieval = openWatcherDirectory(retrieval.path);
  const activeBefore = readWatcherJournalActive(handle);
  const physical = validateWatcherFailureRetryNoopPhysicalAuthority({
    watcher_directory: watcher, retrieval_directory: restoredRetrieval, journal: handle, bundle,
  });
  assert.equal(physical.activation.source_kind, "local_native");
  const boundaries = [];
  const committed = commitWatcherFailureRetryNoop({
    watcher_directory: watcher, retrieval_directory: restoredRetrieval, journal: handle, bundle, revalidate_before_commit() {},
    on_boundary(value) { boundaries.push(value); },
  });
  assert.equal(committed.state, "failure_reconciliation_noop_complete");
  assert.deepEqual(boundaries, ["before_commit", "committed"]);
  assert.deepEqual(readWatcherJournalActive(handle), activeBefore);
  assert.equal(handle.database.prepare("SELECT COUNT(*) AS count FROM observations WHERE batch_id=?;").get(retry.retry_batch.batch_id).count, 1);
  assert.equal(handle.database.prepare("SELECT COUNT(*) AS count FROM normalized_plans WHERE batch_id=?;").get(retry.retry_batch.batch_id).count, 1);
  assert.equal(handle.database.prepare("SELECT COUNT(*) AS count FROM transitions WHERE batch_id=?;").get(retry.retry_batch.batch_id).count, 1);
  assert.deepEqual(commitWatcherFailureRetryNoop({ watcher_directory: watcher, retrieval_directory: retrieval, journal: handle, bundle,
    revalidate_before_commit() { throw new Error("must not run on idempotent replay"); } }), committed);
  assert.equal(readWatcherFailureRetryEpoch({
    watcher_directory: watcher, retrieval_directory: retrieval, journal: handle, current_outer_pointer: pointer,
  }), null, "only the physically revalidated Bundle17 no-op resolves the durable retry epoch");

  handle.database.prepare("UPDATE normalized_plans SET source_removal_event_set_digest=? WHERE batch_id=?;")
    .run(`sha256:${"f".repeat(64)}`, retry.retry_batch.batch_id);
  assert.throws(() => commitWatcherFailureRetryNoop({ watcher_directory: watcher, retrieval_directory: retrieval, journal: handle, bundle,
    revalidate_before_commit() {} }), /WATCHER_JOURNAL_VALUE_INVALID/u);
  handle.database.prepare("UPDATE normalized_plans SET source_removal_event_set_digest=NULL WHERE batch_id=?;")
    .run(retry.retry_batch.batch_id);
  handle.database.exec("BEGIN IMMEDIATE;");
  try {
    handle.database.prepare("DELETE FROM observations WHERE batch_id=?;").run(retry.retry_batch.batch_id);
    assert.throws(() => validateWatcherJournalAdoptionProjection(handle), /WATCHER_JOURNAL_VALUE_INVALID/u);
  } finally { handle.database.exec("ROLLBACK;"); }
  assert.ok(validateWatcherJournalAdoptionProjection(handle) === null);
  closeWatcherJournal(handle);
  releaseWatcherHostLock(lock);
});
