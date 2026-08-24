import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  acquireWatcherHostLock,
  assertWatcherHostLock,
  bootstrapWatcherJournal,
  buildIngestValidationPlan,
  closeWatcherJournal,
  createWatcherIngestWriterCapability,
  deriveWatcherCoherentActivation,
  ensureWatcherDirectory,
  openWatcherDirectory,
  loadIngestProfile,
  publishWatcherCoherentActivation,
  recoverWatcherCoherentActivation,
  releaseWatcherIngestWriterCapability,
  readWatcherAuthority,
  readWatcherJournalActive,
  readWatcherPointer,
  releaseWatcherHostLock,
  stageWatcherValidatedGkxIngestGeneration,
  searchWatcherCoherentGeneration,
  takeWatcherIndexValidationOutcome,
  watcherDigest,
} from "../dist/watcher-host.mjs";
import { watcherArtifactCoordinate } from "../dist/watcher-contracts.mjs";
import { detectSqliteLexicalCapability } from "../dist/retrieval.mjs";

const D = `sha256:${"a".repeat(64)}`;
const CONFORMANCE = JSON.parse(readFileSync(new URL(
  "../contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1/watcher-conformance-fixture.json",
  import.meta.url,
), "utf8"));

function roots(t) {
  const root = mkdtempSync(join(tmpdir(), "gkos-watcher-coordinator-"));
  if (process.platform !== "win32") chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const derived = openWatcherDirectory(root);
  const watcher = ensureWatcherDirectory(join(root, "watcher"), derived);
  const journals = ensureWatcherDirectory(join(watcher.path, "journals"), watcher);
  const retrieval = ensureWatcherDirectory(join(root, "retrieval"), derived);
  const vaultPath = join(root, "vault");
  mkdirSync(vaultPath, { mode: 0o700 });
  if (process.platform !== "win32") chmodSync(vaultPath, 0o700);
  return { watcher, journals, retrieval, vaultPath };
}

function reseal(record, field) {
  const material = { ...record };
  delete material[field];
  record[field] = watcherDigest(material);
}

function genesisBundle() {
  const semantic = CONFORMANCE.semantic_cases.find((row) => row.case_id === "single-add");
  assert.ok(semantic);
  const bundle = structuredClone(semantic.input.arguments[0]);
  bundle.pre_scan_state.active_pointer_digest = null;
  bundle.pre_scan_state.active_coherent_manifest_digest = null;
  bundle.pre_scan_state.topology_snapshot_digest = null;

  bundle.observation_authority.pre_scan_state_digest = watcherDigest(bundle.pre_scan_state);
  reseal(bundle.observation_authority, "authority_digest");
  bundle.batch.observation_authority_digest = bundle.observation_authority.authority_digest;
  reseal(bundle.batch, "batch_record_digest");
  bundle.plan.mutation_set_digest = watcherDigest({
    contract_version: "gkos-watcher-mutation-set/1.0.0-draft.1",
    pre_scan_state_digest: watcherDigest(bundle.pre_scan_state),
    topology_snapshot_digest: bundle.plan.topology_snapshot_digest,
    intended_source_mutations: bundle.plan.intended_source_mutations,
    folder_set_changed: bundle.plan.folder_set_changed,
    attachment_set_changed: bundle.plan.attachment_set_changed,
  });
  reseal(bundle.plan, "plan_digest");
  const planCoordinate = watcherArtifactCoordinate("plan", bundle.plan);
  Object.assign(bundle.plan_authority, {
    plan_digest: bundle.plan.plan_digest,
    plan_artifact_file: planCoordinate.file,
    plan_raw_sha256: planCoordinate.raw_sha256,
    plan_byte_size: planCoordinate.byte_size,
  });
  reseal(bundle.plan_authority, "authority_digest");

  let prior = null;
  for (const transition of bundle.transitions) {
    if (transition.transition_ordinal > 0) transition.plan_digest = bundle.plan.plan_digest;
    transition.prior_transition_digest = prior;
    reseal(transition, "transition_digest");
    prior = transition.transition_digest;
  }
  bundle.manifest.completed_transition_digest = bundle.transitions[6].transition_digest;
  reseal(bundle.manifest, "coherent_manifest_digest");
  Object.assign(bundle.pointer, {
    coherent_manifest_digest: bundle.manifest.coherent_manifest_digest,
    coherent_manifest_file: `watcher-coherent-${bundle.manifest.coherent_manifest_digest.slice(7)}.json`,
    prior_pointer_digest: null,
  });
  reseal(bundle.pointer, "pointer_digest");
  Object.assign(bundle.intent, {
    prepared_transition_digest: bundle.transitions[5].transition_digest,
    coherent_manifest_digest: bundle.manifest.coherent_manifest_digest,
    prior_pointer_digest: null,
    target_pointer: structuredClone(bundle.pointer),
    target_complete_transition: structuredClone(bundle.transitions[6]),
  });
  reseal(bundle.intent, "intent_digest");
  Object.assign(bundle.outcome, {
    intent_digest: bundle.intent.intent_digest,
    coherent_manifest_digest: bundle.manifest.coherent_manifest_digest,
    pointer_digest: bundle.pointer.pointer_digest,
  });
  reseal(bundle.outcome, "outcome_digest");
  Object.assign(bundle.active, {
    coherent_manifest_digest: bundle.manifest.coherent_manifest_digest,
    pointer_digest: bundle.pointer.pointer_digest,
    intent_digest: bundle.intent.intent_digest,
  });
  reseal(bundle.active, "active_digest");
  return bundle;
}

test("coherent activation cross-seals guard before prepared5 and publishes authority before complete6", (t) => {
  const { watcher, journals } = roots(t);
  const lock = acquireWatcherHostLock(watcher, {
    operation: "service",
    service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932",
    prior_pointer_digest: null,
    prior_coherent_manifest_digest: null,
    prior_journal_pointer_digest: null,
  });
  const journal = bootstrapWatcherJournal({
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
  const bundle = genesisBundle();
  const boundaries = [];
  const result = publishWatcherCoherentActivation({
    directory: watcher,
    journal,
    bundle,
    on_boundary(boundary) { boundaries.push(boundary); },
  });
  assert.deepEqual(readWatcherPointer(watcher, "outer"), result.pointer);
  assert.deepEqual(readWatcherJournalActive(journal), result.active);
  const authority = readWatcherAuthority(watcher);
  assert.ok(authority);
  assert.equal(authority.first_pointer_digest, result.pointer.pointer_digest);
  assert.ok(boundaries.indexOf("prepared_journal") < boundaries.indexOf("pointer:guard_stage"));
  assert.ok(boundaries.indexOf("authority") < boundaries.indexOf("pointer:target_prepared"));
  assert.ok(boundaries.indexOf("pointer:target_prepared") < boundaries.indexOf("pointer:fixed_pointer"));
  assert.ok(boundaries.indexOf("pointer:fixed_pointer") < boundaries.indexOf("complete_journal"));
  assert.ok(boundaries.indexOf("complete_journal") < boundaries.indexOf("pointer:guard_removed"));
  closeWatcherJournal(journal);
  releaseWatcherHostLock(lock);
});

test("coherent activation rejects an authority splice before filesystem or journal mutation", (t) => {
  const { watcher, journals } = roots(t);
  const lock = acquireWatcherHostLock(watcher, {
    operation: "service",
    service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932",
    prior_pointer_digest: null,
    prior_coherent_manifest_digest: null,
    prior_journal_pointer_digest: null,
  });
  const journal = bootstrapWatcherJournal({
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
  const invalid = genesisBundle();
  invalid.plan_authority.target_topology_snapshot_digest = D;
  assert.throws(() => publishWatcherCoherentActivation({
    directory: watcher,
    journal,
    bundle: invalid,
  }), (error) => error?.name === "WatcherRecoveryContractError");
  assert.equal(journal.database.prepare("SELECT COUNT(*) AS count FROM batches;").get().count, 0);
  assert.equal(readWatcherPointer(watcher, "outer"), null);
  assert.equal(readWatcherAuthority(watcher), null);
  closeWatcherJournal(journal);
  releaseWatcherHostLock(lock);
});

test("startup recovery finalizes fixed-new prepared5 without rerunning derivation", (t) => {
  const { watcher, journals } = roots(t);
  const lock = acquireWatcherHostLock(watcher, {
    operation: "service",
    service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932",
    prior_pointer_digest: null,
    prior_coherent_manifest_digest: null,
    prior_journal_pointer_digest: null,
  });
  const journal = bootstrapWatcherJournal({
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
  const bundle = genesisBundle();
  assert.throws(() => publishWatcherCoherentActivation({
    directory: watcher,
    journal,
    bundle,
    on_boundary(boundary) {
      if (boundary === "pointer:fixed_pointer") throw new Error("SIMULATED_CRASH");
    },
  }), /SIMULATED_CRASH/u);
  assert.equal(readWatcherPointer(watcher, "outer"), null, "guard still routes genesis");
  assert.equal(readWatcherJournalActive(journal), null);
  assert.equal(readWatcherAuthority(watcher).first_pointer_digest, bundle.pointer.pointer_digest);

  const active = recoverWatcherCoherentActivation({ directory: watcher, journal });
  assert.deepEqual(active, bundle.active);
  assert.deepEqual(readWatcherPointer(watcher, "outer"), bundle.pointer);
  assert.deepEqual(readWatcherJournalActive(journal), bundle.active);
  assert.equal(readWatcherAuthority(watcher).first_pointer_digest, bundle.pointer.pointer_digest);
  closeWatcherJournal(journal);
  releaseWatcherHostLock(lock);
});

test("one-pass Phase3 outcome derives and publishes a real genesis ServiceGeneration", async (t) => {
  const { watcher, journals, retrieval, vaultPath } = roots(t);
  const lock = acquireWatcherHostLock(watcher, {
    operation: "service",
    service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932",
    prior_pointer_digest: null,
    prior_coherent_manifest_digest: null,
    prior_journal_pointer_digest: null,
  });
  const configurationDigest = `sha256:${"b".repeat(64)}`;
  const policyDigest = `sha256:${"c".repeat(64)}`;
  const profile = await loadIngestProfile();
  const content = `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Accepted\nBody.\n`;
  const file = {
    relativePath: "accepted.md",
    name: "accepted.md",
    extension: "md",
    size: Buffer.byteLength(content),
    createdTime: Date.parse("2026-08-20T00:00:00Z"),
    modifiedTime: Date.parse("2026-08-20T00:00:00Z"),
    content,
    kind: "note",
  };
  writeFileSync(join(vaultPath, "accepted.md"), content, { mode: 0o600 });
  const plan = buildIngestValidationPlan({ files: [file], folders: [], attachments: [], scan_rejections: [] }, profile);
  const outcome = takeWatcherIndexValidationOutcome(plan);
  const writer = createWatcherIngestWriterCapability({
    plan,
    state_directory: retrieval.path,
    host_lock_digest: assertWatcherHostLock(lock).lock_digest,
    revalidate() { assertWatcherHostLock(lock); },
  });
  const stageOptions = {
    state_directory: retrieval.path,
    vault_id: "vault",
    configuration_digest: configurationDigest,
    policy_digest: policyDigest,
    embedding_eligible_candidate_chunk_keys: [],
    lexical_backend: "sqlite_fts5",
  };
  if (!detectSqliteLexicalCapability().fts5_available) {
    await assert.rejects(
      stageWatcherValidatedGkxIngestGeneration(writer, plan, stageOptions),
      (error) => error?.message === "SQLITE_FTS5_UNAVAILABLE",
    );
    releaseWatcherIngestWriterCapability(writer);
    releaseWatcherHostLock(lock);
    return;
  }
  const staged = await stageWatcherValidatedGkxIngestGeneration(writer, plan, stageOptions);
  releaseWatcherIngestWriterCapability(writer);
  const bundle = deriveWatcherCoherentActivation({
    vault_id: "vault",
    configuration_digest: configurationDigest,
    policy_digest: policyDigest,
    effective_profile_digest: profile.coordinate.effective_profile_digest,
    scan: {
      vault_root: vaultPath,
      files: [file], folders: [], attachments: [], identities: [], namespace_digest: D,
    },
    validation_plan: plan,
    validation_outcome: outcome,
    staged_owner_manifest: staged.owner_manifest,
    prior_pointer: null,
    prior_manifest: null,
    prior_topology: null,
    batch_kind: "startup_reconciliation",
    execution_kind: "set_files",
    observed_paths: [],
    unscoped: true,
    overflow: false,
    batch_id: "019b2d14-4234-7db7-87d4-7d81cfaec932",
    recorded_at: "2026-08-20T00:00:01.000Z",
  });
  assert.ok(bundle);
  assert.equal(bundle.topology.accepted_sources.length, 1);
  assert.equal(bundle.topology.rejected_sources.length, 0);
  assert.equal(bundle.raw_graph.graph.stats.files, 1);
  const journal = bootstrapWatcherJournal({
    root: journals,
    host_lock: lock,
    coordinates: {
      vault_id: "vault",
      configuration_digest: configurationDigest,
      policy_digest: policyDigest,
      effective_profile_digest: profile.coordinate.effective_profile_digest,
      anchor_coherent_manifest_digest: null,
    },
  });
  const published = publishWatcherCoherentActivation({ directory: watcher, journal, bundle });
  assert.equal(published.manifest.retrieval_projection_state.projection_digest, staged.owner_manifest.inner.manifest.projection_digest);
  assert.equal(readWatcherJournalActive(journal).pointer_digest, published.pointer.pointer_digest);
  const searched = await searchWatcherCoherentGeneration({
    watcher_directory: watcher,
    retrieval_directory: retrieval,
    vault_root: vaultPath,
    configuration_digest: configurationDigest,
    policy_digest: policyDigest,
    effective_profile_digest: profile.coordinate.effective_profile_digest,
    request: { query: "Body", limit: 5 },
    coordinator_options: {
      discoverability_policy: () => "allow",
      source_discoverability_policy: () => "allow",
    },
  });
  assert.equal(searched.pointer_digest, published.pointer.pointer_digest);
  assert.equal(searched.coherent_manifest_digest, published.manifest.coherent_manifest_digest);
  assert.equal(searched.result.hits.length, 1);
  assert.equal(searched.result.hits[0].chunk.source_path, "accepted.md");
  await assert.rejects(() => searchWatcherCoherentGeneration({
    watcher_directory: watcher,
    retrieval_directory: retrieval,
    vault_root: vaultPath,
    configuration_digest: `sha256:${"f".repeat(64)}`,
    policy_digest: policyDigest,
    effective_profile_digest: profile.coordinate.effective_profile_digest,
    request: { query: "Body", limit: 5 },
    freshness_wait_ms: 0,
    coordinator_options: {
      discoverability_policy: () => "allow",
      source_discoverability_policy: () => "allow",
    },
  }), /GKX_WATCHER_FRESHNESS_AUTHORITY_MISMATCH/u);
  closeWatcherJournal(journal);
  releaseWatcherHostLock(lock);
});
