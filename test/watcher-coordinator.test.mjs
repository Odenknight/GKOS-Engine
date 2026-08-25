import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, chownSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  acquireWatcherHostLock,
  assertWatcherHostLock,
  bootstrapWatcherJournal,
  buildIngestValidationPlan,
  closeWatcherJournal,
  createWatcherPublicationFile,
  createWatcherIngestWriterCapability,
  deriveWatcherCoherentActivation,
  ensureWatcherDirectory,
  openWatcherDirectory,
  hardlinkWatcherPublicationFile,
  loadIngestProfile,
  publishWatcherCoherentActivation,
  recoverWatcherCoherentActivation,
  releaseWatcherIngestWriterCapability,
  readWatcherAuthority,
  readWatcherJournalActive,
  readWatcherPointer,
  replaceWatcherPublicationFile,
  releaseWatcherHostLock,
  stageWatcherValidatedGkxIngestGeneration,
  searchWatcherCoherentGeneration,
  takeWatcherIndexValidationOutcome,
  watcherDigest,
  watcherRawDigest,
  unlinkWatcherPublicationFile,
  withAuthorizedWatcherPublication,
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

test("coherent publication capability is unforgeable and enforces its exact declared sequence", (t) => {
  const { watcher } = roots(t);
  const first = Buffer.from("first\n");
  const second = Buffer.from("second\n");
  assert.throws(() => createWatcherPublicationFile(
    Object.freeze({ directory: watcher }), "one", "one.json", first,
  ), /GKX_WATCHER_FS_PUBLICATION_CAPABILITY_INVALID/u);
  const declaration = {
    operations: [
      {
        step_id: "one", operation: "create_file", leaf: "one.json",
        raw_sha256: watcherRawDigest(first), byte_size: first.byteLength, maximum_bytes: 1024,
      },
      {
        step_id: "two", operation: "create_file", leaf: "two.json",
        raw_sha256: watcherRawDigest(second), byte_size: second.byteLength, maximum_bytes: 1024,
      },
    ],
  };
  assert.throws(() => withAuthorizedWatcherPublication(watcher, declaration, (publication) => {
    createWatcherPublicationFile(publication, "two", "two.json", second);
  }), /GKX_WATCHER_FS_PUBLICATION_SEQUENCE_INVALID/u);
  assert.equal(readWatcherAuthority(watcher), null, "failed sequence cannot forge an authority side effect");
  assert.throws(() => withAuthorizedWatcherPublication(watcher, declaration, (publication) => {
    createWatcherPublicationFile(publication, "one", "one.json", second);
  }), /GKX_WATCHER_FS_PUBLICATION_DECLARATION_INVALID/u);
});

test("coherent publication rejects non-private entry files and post-syscall owner or mode drift", {
  skip: process.platform === "win32",
}, async (t) => {
  await t.test("preexisting mode", (child) => {
    const { watcher } = roots(child);
    const source = join(watcher.path, "source.json");
    writeFileSync(source, "source\n", { mode: 0o600 });
    chmodSync(source, 0o644);
    const authority = openWatcherDirectory(watcher.path);
    assert.throws(() => withAuthorizedWatcherPublication(authority, {
      operations: [{
        step_id: "link", operation: "hardlink", source_leaf: "source.json",
        target_leaf: "target.json", resulting_links: 2,
      }],
    }, (publication) => {
      hardlinkWatcherPublicationFile(publication, "link", "source.json", "target.json");
    }), { message: "GKX_WATCHER_FS_PUBLICATION_TARGET_INVALID" });
    assert.throws(() => readFileSync(join(watcher.path, "target.json")), /ENOENT/u);
  });

  await t.test("post-syscall mode drift", (child) => {
    const { watcher } = roots(child);
    const bytes = Buffer.from("created\n");
    const authority = openWatcherDirectory(watcher.path);
    let terminalRefreshBoundary = false;
    let failure;
    assert.throws(() => withAuthorizedWatcherPublication(authority, {
      operations: [{
        step_id: "create", operation: "create_file", leaf: "created.json",
        raw_sha256: watcherRawDigest(bytes), byte_size: bytes.byteLength, maximum_bytes: 1024,
      }],
    }, (publication) => {
      createWatcherPublicationFile(publication, "create", "created.json", bytes);
    }, {
      on_after_operation_syscall(stepId) {
        assert.equal(stepId, "create");
        chmodSync(join(watcher.path, "created.json"), 0o644);
        assert.equal(statSync(join(watcher.path, "created.json")).mode & 0o777, 0o644,
          "the adversarial seam must actually widen the created file mode");
      },
      on_before_seal_refresh() { terminalRefreshBoundary = true; },
    }), (error) => {
      failure = error;
      return /GKX_WATCHER_FS_(?:DIRECTORY_CHANGED|PUBLICATION_PREFIX_INVALID|PUBLICATION_TARGET_INVALID)/u.test(
        String(error?.message),
      );
    });
    assert.equal(terminalRefreshBoundary, false, "a widened created file cannot reach terminal seal refresh");
    assert.match(String(failure?.cause?.message ?? failure?.message), /GKX_WATCHER_FS_PUBLICATION_TARGET_INVALID/u,
      "the widened post snapshot remains the primary operation failure behind crash-prefix authentication");
  });

  async function exerciseTransitionSeams(label, mutate) {
    for (const operation of ["hardlink", "unlink", "replace"]) {
      await t.test(`${operation} post-syscall ${label}`, (child) => {
        const { watcher } = roots(child);
        const source = join(watcher.path, "source.json");
        const target = join(watcher.path, "target.json");
        writeFileSync(source, "source\n", { mode: 0o600 });
        if (operation === "unlink") linkSync(source, target);
        const authority = openWatcherDirectory(watcher.path);
        const digest = watcherRawDigest(Buffer.from("source\n"));
        const declaration = operation === "hardlink" ? {
          operations: [{
            step_id: "transition", operation: "hardlink", source_leaf: "source.json",
            target_leaf: "target.json", resulting_links: 2,
          }],
        } : operation === "unlink" ? {
          operations: [{
            step_id: "transition", operation: "unlink", leaf: "source.json",
            expected_raw_sha256: digest, allowed_links: 2, survivor_leaves: ["target.json"],
          }],
        } : {
          operations: [{
            step_id: "transition", operation: "replace", source_leaf: "source.json",
            target_leaf: "target.json", expected_raw_sha256: digest,
          }],
        };
        let terminalRefreshBoundary = false;
        let failure;
        assert.throws(() => withAuthorizedWatcherPublication(authority, declaration, (publication) => {
          if (operation === "hardlink") {
            hardlinkWatcherPublicationFile(publication, "transition", "source.json", "target.json");
          } else if (operation === "unlink") {
            unlinkWatcherPublicationFile(publication, "transition", "source.json");
          } else {
            replaceWatcherPublicationFile(publication, "transition", "source.json", "target.json");
          }
        }, {
          on_after_operation_syscall(stepId) {
            assert.equal(stepId, "transition");
            mutate(target);
          },
          on_before_seal_refresh() { terminalRefreshBoundary = true; },
        }), (error) => {
          failure = error;
          return /GKX_WATCHER_FS_(?:DIRECTORY_CHANGED|PUBLICATION_PREFIX_INVALID|PUBLICATION_TARGET_INVALID)/u.test(
            String(error?.message),
          );
        });
        assert.equal(terminalRefreshBoundary, false, "a mutated result cannot reach terminal seal refresh");
        assert.match(String(failure?.cause?.message ?? failure?.message), /GKX_WATCHER_FS_PUBLICATION_TARGET_INVALID/u,
          "the rejected post snapshot remains the primary operation failure behind crash-prefix authentication");
      });
    }
  }

  await exerciseTransitionSeams("mode drift", (path) => chmodSync(path, 0o644));

  if (process.geteuid?.() === 0) {
    await t.test("preexisting foreign owner", (child) => {
      const { watcher } = roots(child);
      const source = join(watcher.path, "source.json");
      writeFileSync(source, "source\n", { mode: 0o600 });
      chownSync(source, 1, 1);
      const authority = openWatcherDirectory(watcher.path);
      assert.throws(() => withAuthorizedWatcherPublication(authority, {
        operations: [{
          step_id: "link", operation: "hardlink", source_leaf: "source.json",
          target_leaf: "target.json", resulting_links: 2,
        }],
      }, (publication) => {
        hardlinkWatcherPublicationFile(publication, "link", "source.json", "target.json");
      }), { message: "GKX_WATCHER_FS_PUBLICATION_TARGET_INVALID" });
      assert.throws(() => readFileSync(join(watcher.path, "target.json")), /ENOENT/u);
    });

    await t.test("post-syscall owner drift", (child) => {
      const { watcher } = roots(child);
      const bytes = Buffer.from("created\n");
      const authority = openWatcherDirectory(watcher.path);
      let terminalRefreshBoundary = false;
      let failure;
      assert.throws(() => withAuthorizedWatcherPublication(authority, {
        operations: [{
          step_id: "create", operation: "create_file", leaf: "created.json",
          raw_sha256: watcherRawDigest(bytes), byte_size: bytes.byteLength, maximum_bytes: 1024,
        }],
      }, (publication) => {
        createWatcherPublicationFile(publication, "create", "created.json", bytes);
      }, {
        on_after_operation_syscall(stepId) {
          assert.equal(stepId, "create");
          chownSync(join(watcher.path, "created.json"), 1, 1);
          const changed = statSync(join(watcher.path, "created.json"));
          assert.equal(changed.uid, 1, "the adversarial seam must actually replace the created file owner");
          assert.equal(changed.gid, 1, "the adversarial seam must actually replace the created file group");
        },
        on_before_seal_refresh() { terminalRefreshBoundary = true; },
      }), (error) => {
        failure = error;
        return /GKX_WATCHER_FS_(?:DIRECTORY_CHANGED|PUBLICATION_PREFIX_INVALID|PUBLICATION_TARGET_INVALID)/u.test(
          String(error?.message),
        );
      });
      assert.equal(terminalRefreshBoundary, false, "a foreign-owned created file cannot reach terminal seal refresh");
      assert.match(String(failure?.cause?.message ?? failure?.message), /GKX_WATCHER_FS_PUBLICATION_TARGET_INVALID/u,
        "the foreign-owned post snapshot remains the primary failure behind crash-prefix authentication");
    });
    await exerciseTransitionSeams("owner drift", (path) => chownSync(path, 1, 1));
  }
});

test("coherent publication rejects undeclared siblings, retained-byte mutation, and affected target swaps", async (t) => {
  for (const attack of ["extra_sibling", "retained_content", "target_swap"]) {
    await t.test(attack, (child) => {
      const { watcher, journals } = roots(child);
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
          if (attack === "extra_sibling" && boundary === "pointer:guard_stage") {
            writeFileSync(join(watcher.path, "undeclared.json"), "undeclared\n", { mode: 0o600 });
          }
          if (attack === "target_swap" && boundary === "pointer:immutable_pointer") {
            const pointerLeaf = String(bundle.pointer.pointer_digest).slice("sha256:".length);
            const path = join(watcher.path, `watcher-pointer-${pointerLeaf}.json`);
            rmSync(path);
            writeFileSync(path, "swapped\n", { mode: 0o600 });
          }
        },
        on_before_seal_refresh() {
          if (attack === "retained_content") {
            writeFileSync(join(watcher.path, "watcher-host.lock"), "tampered\n", { mode: 0o600 });
          }
        },
      }), /GKX_WATCHER_FS_(?:DIRECTORY_CHANGED|PUBLICATION_PREFIX_INVALID)/u);
      closeWatcherJournal(journal);
    });
  }
});

test("coherent publication authenticates an exact guard-linked crash prefix before recovery", (t) => {
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
      if (boundary === "pointer:guard_linked") throw new Error("SIMULATED_GUARD_LINKED_CRASH");
    },
  }), /SIMULATED_GUARD_LINKED_CRASH/u);
  assert.equal(readWatcherPointer(watcher, "outer"), null, "authenticated guard prefix continues to route genesis");
  const active = recoverWatcherCoherentActivation({ directory: watcher, journal });
  assert.deepEqual(active, bundle.active);
  assert.deepEqual(readWatcherPointer(watcher, "outer"), bundle.pointer);
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
    retrieval_directory: openWatcherDirectory(retrieval.path),
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
    retrieval_directory: openWatcherDirectory(retrieval.path),
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
