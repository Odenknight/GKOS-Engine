import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { copyFile, link, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import * as retrieval from "../dist/retrieval.mjs";
import {
  bindGkxRetrievalCandidateChunks,
  buildGkxRetrievalGeneration,
  acquireLegacyRetrievalWriter,
  indexGkxRetrievalGeneration,
  recoverStaleLegacyRetrievalWriter,
  releaseLegacyRetrievalWriter,
  SqliteRetrievalStore,
} from "../dist/retrieval-host.mjs";
import {
  activateStagedGkxIngestGeneration,
  buildIngestValidationPlan,
  loadIngestProfile,
  openIngestOwnerState,
  preflightIngestAuthority,
  prepareValidatedGkxIngestGeneration,
  recordBlockedIngestAttempt,
  recoverStaleIngestAuthorityLock,
  releaseIngestAuthorityPreflight,
  sealIngestActivationRootEnvelope,
  sealIngestActivePointerEnvelope,
  sealIngestAuthorityLockEnvelope,
  sealIngestAuthorityWitnessEnvelope,
  sealIngestBlockedAttemptStatusEnvelope,
  sealIngestLegacyPointerTombstoneEnvelope,
  sealIngestMigrationRecordEnvelope,
  sealIngestIndexResultEnvelope,
  sealIngestOwnerGenerationManifestEnvelope,
  sealIngestRejectionJournalEnvelope,
  stageValidatedGkxIngestGeneration,
} from "../dist/ingest-host.mjs";

const CREATED = "2026-08-01T00:00:00Z";
const CREATED_MS = Date.parse(CREATED);
const INGEST_PACK = new URL("../contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/", import.meta.url);
const STORAGE_FIXTURE = JSON.parse(readFileSync(new URL("storage-conformance-fixture.json", INGEST_PACK), "utf8"));
const INGEST_CONTRACT = JSON.parse(readFileSync(new URL("contract.json", INGEST_PACK), "utf8"));

function storageSchemaValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  for (const path of [
    "../contracts/retrieval/gkos-retrieval-1.0.0-draft.1/projection.schema.json",
    "../contracts/retrieval/gkos-retrieval-1.0.0-draft.2/projection.schema.json",
  ]) ajv.addSchema(JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")));
  const names = [
    "profile-coordinate.schema.json", "normalized-profile.schema.json", "finding.schema.json", "rejection.schema.json",
    "result.schema.json", ...STORAGE_FIXTURE.schema_files,
  ];
  const schemas = Object.fromEntries(names.map((name) => [name,
    JSON.parse(readFileSync(new URL(name, INGEST_PACK), "utf8"))]));
  for (const schema of Object.values(schemas)) ajv.addSchema(schema);
  return {
    ajv,
    schemas,
    validate(name, value) {
      const validator = ajv.getSchema(schemas[name].$id);
      assert.ok(validator, name);
      return validator(value);
    },
  };
}

function note(uid, title = "Validated", extra = "") {
  return `---\ngkx_version: "2.3"\nuid: "${uid}"\ntitle: "${title}"\ntype: "policy"\ncreated_at: "${CREATED}"\nepistemic_state: "reported"\nsensitivity: "public"\n${extra}---\n# ${title}\nValidated body.\n`;
}

function source(relativePath, content) {
  return {
    relativePath,
    name: relativePath.split("/").at(-1),
    extension: "md",
    size: Buffer.byteLength(content, "utf8"),
    createdTime: CREATED_MS,
    content,
    kind: "note",
  };
}

async function temporaryState(t) {
  const root = await mkdtemp(join(tmpdir(), "gkos-ingest-storage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return join(root, "state");
}

async function planFor(files) {
  const profile = await loadIngestProfile();
  return buildIngestValidationPlan({ files, folders: [], attachments: [], scan_rejections: [] }, profile);
}

function generationInput(stateDirectory, plan, suffix = "base") {
  const candidateChunks = plan.accepted_sources.flatMap((sourceValue) => bindGkxRetrievalCandidateChunks(
    sourceValue.record_key,
    retrieval.chunkMarkdown(sourceValue.chunk_input, { max_tokens: 400, overlap_tokens: 0 }),
  ));
  return {
    state_directory: stateDirectory,
    vault_id: "vault:phase3-storage-test",
    source_snapshot_digest: plan.observation_snapshot_digest,
    configuration_digest: retrieval.retrievalCanonicalDigest({ test: "phase3-storage", suffix }),
    policy_digest: retrieval.retrievalCanonicalDigest({ policy: "public-only" }),
    candidate_sources: plan.accepted_sources.map((item) => item.candidate_source),
    candidate_declarations: plan.accepted_declarations,
    candidate_chunks: candidateChunks,
    embedding_eligible_candidate_chunk_keys: [],
    lexical_backend: "sqlite_lexical_scan",
  };
}

function ingestCoordinate(stateDirectory, plan, suffix = "base", eligibleKeys = []) {
  const input = generationInput(stateDirectory, plan, suffix);
  return {
    state_directory: input.state_directory,
    vault_id: input.vault_id,
    configuration_digest: input.configuration_digest,
    policy_digest: input.policy_digest,
    embedding_eligible_candidate_chunk_keys: [...eligibleKeys].sort(),
    lexical_backend: input.lexical_backend,
  };
}

function reseal(value, digestField, excludedFields = [digestField]) {
  const clone = structuredClone(value);
  clone[digestField] = retrieval.retrievalCanonicalDigest(Object.fromEntries(
    Object.entries(clone).filter(([key]) => !excludedFields.includes(key)),
  ));
  return clone;
}

function canonicalFileDigest(value) {
  return retrieval.retrievalSha256(Buffer.from(`${retrieval.stableJson(value)}\n`, "utf8"));
}

async function stagedFor(t, suffix = "base") {
  const state = await temporaryState(t);
  const uid = `018f0000-0000-7000-8000-${String(500 + suffix.length).padStart(12, "0")}`;
  const plan = await planFor([source(`${suffix}.md`, note(uid, suffix))]);
  const authority = preflightIngestAuthority(state);
  const prepared = prepareValidatedGkxIngestGeneration(authority, "non_strict", plan);
  const staged = await stageValidatedGkxIngestGeneration(authority, prepared, ingestCoordinate(state, plan, suffix));
  return { state, plan, authority, staged };
}

async function forceCaseRename(path, uppercasePath) {
  const intermediate = `${path}.case-transition`;
  await rename(path, intermediate);
  await rename(intermediate, uppercasePath);
}

test("frozen owner-state schemas and fixture bind every envelope, union, and semantic negative", () => {
  assert.equal(INGEST_CONTRACT.status, "frozen");
  assert.equal(INGEST_CONTRACT.frozen, true);
  assert.equal(INGEST_CONTRACT.hash_manifest_issued, true);
  assert.equal(STORAGE_FIXTURE.status, "frozen");
  assert.equal(STORAGE_FIXTURE.frozen, true);
  const { ajv, schemas, validate } = storageSchemaValidators();
  assert.deepEqual(STORAGE_FIXTURE.schema_files, INGEST_CONTRACT.owner_storage_envelopes.schemas);
  for (const name of STORAGE_FIXTURE.schema_files) {
    assert.match(schemas[name].$id,
      /^https:\/\/github\.com\/Odenknight\/GKOS-Engine\/contracts\/ingest\//u, name);
  }
  const envelopes = STORAGE_FIXTURE.valid_envelopes;
  const schemaByEnvelope = {
    rejection_journal: "rejection-journal.schema.json",
    owner_generation: "owner-generation.schema.json",
    active_pointer: "active-pointer.schema.json",
    migration: "migration.schema.json",
    migration_with_legacy: "migration.schema.json",
    legacy_tombstone: "legacy-tombstone.schema.json",
    activation_root: "activation-root.schema.json",
    authority_witness: "authority-witness.schema.json",
    authority_lock: "authority-lock.schema.json",
    attempt_status: "attempt-status.schema.json",
  };
  for (const [key, schema] of Object.entries(schemaByEnvelope)) {
    assert.equal(validate(schema, envelopes[key]), true, key);
  }
  for (const item of envelopes.index_results) assert.equal(validate("index-result.schema.json", item), true);
  const indexStatuses = ["blocked_strict", "operational_failure", "published", "published_with_rejections"];
  assert.deepEqual([...new Set(envelopes.index_results.map((item) => item.status))].sort(), indexStatuses);
  assert.deepEqual([...schemas["index-result.schema.json"].properties.status.enum].sort(), indexStatuses);
  assert.deepEqual([...INGEST_CONTRACT.owner_storage_envelopes.path_free_index_result.statuses].sort(), indexStatuses);

  assert.deepEqual(sealIngestRejectionJournalEnvelope(envelopes.rejection_journal,
    envelopes.rejection_journal.normalized_profile), envelopes.rejection_journal);
  assert.deepEqual(sealIngestOwnerGenerationManifestEnvelope(envelopes.owner_generation), envelopes.owner_generation);
  assert.deepEqual(sealIngestActivePointerEnvelope(envelopes.active_pointer), envelopes.active_pointer);
  assert.deepEqual(sealIngestMigrationRecordEnvelope(envelopes.migration), envelopes.migration);
  assert.deepEqual(sealIngestMigrationRecordEnvelope(envelopes.migration_with_legacy), envelopes.migration_with_legacy);
  assert.deepEqual(sealIngestLegacyPointerTombstoneEnvelope(envelopes.legacy_tombstone), envelopes.legacy_tombstone);
  assert.deepEqual(sealIngestActivationRootEnvelope(envelopes.activation_root), envelopes.activation_root);
  assert.deepEqual(sealIngestAuthorityWitnessEnvelope(envelopes.authority_witness), envelopes.authority_witness);
  assert.deepEqual(sealIngestAuthorityLockEnvelope(envelopes.authority_lock), envelopes.authority_lock);
  assert.deepEqual(sealIngestBlockedAttemptStatusEnvelope(envelopes.attempt_status), envelopes.attempt_status);
  for (const item of envelopes.index_results) {
    assert.deepEqual(sealIngestIndexResultEnvelope(
      item,
      item.status === "blocked_strict" ? envelopes.attempt_status : undefined,
    ), item);
  }

  const unions = STORAGE_FIXTURE.union_matrix;
  for (const item of unions.authority_witnesses) {
    assert.equal(validate("authority-witness.schema.json", item), true);
    assert.deepEqual(sealIngestAuthorityWitnessEnvelope(item), item);
  }
  for (const item of unions.authority_locks) {
    assert.equal(validate("authority-lock.schema.json", item), true);
    assert.deepEqual(sealIngestAuthorityLockEnvelope(item), item);
  }
  for (const item of unions.attempt_statuses) {
    assert.equal(validate("attempt-status.schema.json", item), true);
    assert.deepEqual(sealIngestBlockedAttemptStatusEnvelope(item), item);
  }
  for (const item of unions.migrations) {
    assert.equal(validate("migration.schema.json", item), true);
    assert.deepEqual(sealIngestMigrationRecordEnvelope(item), item);
  }
  for (const item of unions.index_results) {
    const context = item.status === "blocked_strict"
      ? unions.attempt_statuses.find((status) => status.status_digest === item.blocked_attempt.status_digest)
      : undefined;
    assert.equal(validate("index-result.schema.json", item), true);
    assert.deepEqual(sealIngestIndexResultEnvelope(item, context), item);
  }
  const priorActiveValidator = ajv.getSchema(
    `${schemas["state-common.schema.json"].$id}#/$defs/priorActive`,
  );
  assert.ok(priorActiveValidator);
  for (const item of unions.prior_active) assert.equal(priorActiveValidator(item), true);
  assert.deepEqual(unions.authority_witnesses.map((item) => item.state).sort(), ["activating", "active"]);
  assert.deepEqual([...new Set(unions.authority_locks.map((item) => item.operation))].sort(),
    ["activation", "blocked", "preflight"]);
  assert.deepEqual(unions.prior_active.map((item) => item?.kind ?? "null").sort(), ["ingest", "legacy", "null"]);
  assert.deepEqual(unions.attempt_statuses.map((item) => `${item.availability}:${item.prior_active?.kind ?? "null"}`).sort(),
    ["stale:ingest", "stale:legacy", "unavailable:null"]);
  assert.deepEqual(unions.migrations.map((item) => item.legacy_pointer === null ? "null" : "legacy").sort(),
    ["legacy", "null"]);
  assert.deepEqual([...new Set(unions.index_results.filter((item) => item.status.startsWith("published"))
    .map((item) => item.mode))].sort(), ["non_strict", "strict"]);
  const indexBytes = retrieval.stableJson(envelopes.index_results);
  for (const forbidden of ["source_path", "validation_result", "rejection_journal", "normalized_profile"]) {
    assert.equal(indexBytes.includes(forbidden), false, forbidden);
  }

  const digestWithout = (value, omitted) => retrieval.retrievalCanonicalDigest(Object.fromEntries(
    Object.entries(value).filter(([key]) => !omitted.includes(key)),
  ));
  for (const item of STORAGE_FIXTURE.semantic_negative_matrix) {
    const [rootName, selector] = item.envelope.split(".");
    let original = envelopes[rootName];
    if (selector !== undefined) {
      if (/^\d+$/u.test(selector)) original = original[Number(selector)];
      else {
        const fields = Object.fromEntries(selector.split(",").map((part) => part.split("=")));
        original = original.find((candidate) => Object.entries(fields).every(([key, value]) => candidate[key] === value));
      }
    }
    assert.ok(original, item.envelope);
    const forged = structuredClone(original);
    let schemaName = schemaByEnvelope[rootName] ?? "index-result.schema.json";
    let seal;
    switch (item.case) {
      case "active_pointer_owner_id_binding":
        forged.owner_generation_id = `ingest:${"f".repeat(24)}`;
        seal = () => sealIngestActivePointerEnvelope(forged);
        break;
      case "root_pointer_binding":
        forged.active_pointer_digest = `sha256:${"f".repeat(64)}`;
        forged.activation_root_digest = digestWithout(forged, ["activation_root_digest"]);
        seal = () => sealIngestActivationRootEnvelope(forged);
        break;
      case "witness_root_binding":
        forged.activation_root_digest = `sha256:${"f".repeat(64)}`;
        forged.witness_digest = digestWithout(forged, ["witness_digest"]);
        seal = () => sealIngestAuthorityWitnessEnvelope(forged);
        break;
      case "lock_target_pointer_binding":
        forged.target.pointer_digest = `sha256:${"f".repeat(64)}`;
        forged.lock_digest = digestWithout(forged, ["lock_digest"]);
        seal = () => sealIngestAuthorityLockEnvelope(forged);
        break;
      case "attempt_preimage_binding":
        forged.attempt_digest = `sha256:${"f".repeat(64)}`;
        forged.status_digest = digestWithout(forged, ["status_digest"]);
        seal = () => sealIngestBlockedAttemptStatusEnvelope(forged);
        break;
      case "journal_duplicate_observation":
        forged.rejections.push(structuredClone(forged.rejections[0]));
        forged.rejection_count = forged.rejections.length;
        forged.rejection_journal_digest = digestWithout(forged, ["rejection_journal_digest"]);
        seal = () => sealIngestRejectionJournalEnvelope(forged, forged.normalized_profile);
        break;
      case "owner_journal_coordinate": {
        const digest = `sha256:${"f".repeat(64)}`;
        forged.rejection_journal.rejection_journal_digest = digest;
        forged.rejection_journal.journal_file = `ingest-rejections-${digest.slice(7)}.json`;
        forged.owner_manifest_digest = digestWithout(forged, ["owner_generation_id", "owner_manifest_digest"]);
        forged.owner_generation_id = `ingest:${forged.owner_manifest_digest.slice(7, 31)}`;
        seal = () => sealIngestOwnerGenerationManifestEnvelope(forged);
        break;
      }
      case "legacy_database_projection_binding":
        forged.legacy_pointer.database_file = "evil:stream";
        forged.migration_digest = digestWithout(forged, ["migration_digest"]);
        seal = () => sealIngestMigrationRecordEnvelope(forged);
        break;
      case "index_owner_plane_forbidden":
        forged.validation_result = {};
        seal = () => sealIngestIndexResultEnvelope(forged);
        break;
      case "index_blocked_status_context":
        forged.blocked_attempt.status_digest = `sha256:${"f".repeat(64)}`;
        seal = () => sealIngestIndexResultEnvelope(forged, envelopes.attempt_status);
        break;
      default:
        assert.fail(`unhandled fixture mutation ${item.case}`);
    }
    assert.equal(validate(schemaName, forged), item.schema_outcome === "accept", `${item.case} schema`);
    assert.throws(seal, new RegExp(item.semantic_code), `${item.case} semantic`);
  }
});

test("outer generation stages inner+journal+manifest and publishes one owner pointer last", async (t) => {
  const state = await temporaryState(t);
  const plan = await planFor([source("valid.md", note("018f0000-0000-7000-8000-000000000401"))]);
  const authority = preflightIngestAuthority(state);
  const staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", plan), ingestCoordinate(state, plan));
  assert.equal((await readdir(state)).includes("active-retrieval.json"), false);
  assert.equal((await readdir(state)).includes("active-ingest.json"), false);
  const opened = activateStagedGkxIngestGeneration(staged);
  assert.equal(opened.source, "ingest");
  assert.equal(opened.owner_manifest.validation_result.summary.valid_source_count, 1);
  const owner = openIngestOwnerState(state);
  assert.equal(owner.active_generation.active.owner_generation_id, opened.active.owner_generation_id);
  assert.equal(JSON.parse(await readFile(join(state, "active-retrieval.json"), "utf8")).contract_version,
    "gkos-ingest-legacy-pointer-tombstone/1.0.0-draft.1");
  assert.equal((await readdir(state)).includes("retrieval-writer.lock"), false);
  assert.equal((await readdir(state)).includes("ingest-authority.lock"), false);
});

test("owner DB disappearance after its sealed snapshot has one finite changed-during-open error", async (t) => {
  const { state, staged } = await stagedFor(t, "db-disappears-during-open");
  activateStagedGkxIngestGeneration(staged);
  let hookCalls = 0;
  assert.throws(() => openIngestOwnerState(state, {
    on_after_database_snapshot(databasePath) {
      hookCalls += 1;
      assert.equal(basename(databasePath), staged.owner_manifest.inner.database_file);
      rmSync(databasePath);
    },
  }), /^Error: GKX_INGEST_INNER_DATABASE_CHANGED_DURING_OPEN$/u);
  assert.equal(hookCalls, 1);
});

test("strict intrinsic block writes only applicable unavailable owner status", async (t) => {
  const state = await temporaryState(t);
  const invalid = note("", "Invalid").replace('uid: ""\n', "");
  const plan = await planFor([source("invalid.md", invalid)]);
  assert.equal(plan.result.ingest_intrinsic_valid, false);
  const authority = preflightIngestAuthority(state);
  const status = recordBlockedIngestAttempt(authority, plan);
  assert.equal(status.availability, "unavailable");
  assert.equal(status.prior_active, null);
  const owner = openIngestOwnerState(state);
  assert.equal(owner.active_generation, null);
  assert.equal(owner.blocked_attempt.applicable, true);
  assert.deepEqual(owner.blocked_attempt.status, status);
  assert.deepEqual((await readdir(state)).sort(), ["ingest-attempt-status.json"]);
  const statusPath = join(state, "ingest-attempt-status.json");
  const firstBytes = await readFile(statusPath);
  const firstModified = (await stat(statusPath)).mtimeMs;
  const repeated = recordBlockedIngestAttempt(preflightIngestAuthority(state), plan);
  assert.deepEqual(repeated, status);
  assert.deepEqual(await readFile(statusPath), firstBytes);
  assert.equal((await stat(statusPath)).mtimeMs, firstModified, "an identical blocked attempt is a durable no-op");
  const forged = { ...status, attempt_digest: `sha256:${"f".repeat(64)}` };
  forged.status_digest = retrieval.retrievalCanonicalDigest(Object.fromEntries(
    Object.entries(forged).filter(([key]) => key !== "status_digest"),
  ));
  assert.throws(() => sealIngestBlockedAttemptStatusEnvelope(forged), /ATTEMPT_DIGEST_INVALID/);
  const machine = sealIngestIndexResultEnvelope({
    contract_version: "gkos-ingest-index-result/1.0.0-draft.1",
    status: "blocked_strict",
    mode: "strict",
    summary: plan.result.summary,
    active: status.prior_active,
    blocked_attempt: { attempt_digest: status.attempt_digest, status_digest: status.status_digest },
  }, status);
  assert.equal(machine.status, "blocked_strict");
  assert.throws(() => sealIngestIndexResultEnvelope({ ...machine, status: "published" }), /PUBLICATION_INVALID/);
});

test("strict block over an active owner is byte-idempotent and cannot disturb ordinary retrieval", async (t) => {
  const state = await temporaryState(t);
  const visible = source("strict-visible.md", note("018f0000-0000-7000-8000-000000000483", "Strict visible needle"));
  const plan = await planFor([visible]);
  const generation = generationInput(state, plan, "strict-existing");
  let authority = preflightIngestAuthority(state);
  const prepared = prepareValidatedGkxIngestGeneration(authority, "strict", plan);
  const eligible = prepared.candidate_chunks.map((item) => item.candidate_chunk_key).sort();
  let indexProviderCalls = 0;
  const vectorIdentity = {
    kind: "mcp", provider_id: "strict-existing-vector", model_id: "strict-existing-model",
    dimensions: 2, timeout_ms: 1000,
  };
  const staged = await stageValidatedGkxIngestGeneration(authority, prepared,
    ingestCoordinate(state, plan, "strict-existing", eligible), {
      ...vectorIdentity,
      async embed(texts) {
        indexProviderCalls += 1;
        return texts.map(() => Float32Array.from([1, 0]));
      },
    });
  activateStagedGkxIngestGeneration(staged);

  const existingFiles = (await readdir(state)).sort();
  const before = new Map(await Promise.all(existingFiles.map(async (name) => {
    const path = join(state, name);
    return [name, { bytes: await readFile(path), modified: (await stat(path)).mtimeMs }];
  })));
  const search = async () => {
    const calls = [];
    const coordinator = retrieval.RetrievalCoordinator.openActive(state, {
      discoverability_policy: () => "allow",
      source_discoverability_policy: () => "allow",
      runtime_policy_digest: generation.policy_digest,
      lineage_view_freshness: "fresh",
      source_reader: async (path) => {
        calls.push({ stage: "reader", path });
        return Buffer.from(visible.content, "utf8");
      },
      vector_provider: {
        ...vectorIdentity,
        async embed(texts) {
          calls.push({ stage: "query_vector", texts: [...texts] });
          return texts.map(() => Float32Array.from([1, 0]));
        },
      },
      rerank_provider: {
        kind: "mcp", provider_id: "strict-existing-rerank", model_id: "strict-existing-rerank-model", timeout_ms: 1000,
        async rerank(query, inputs) {
          calls.push({ stage: "rerank", query, inputs: structuredClone(inputs) });
          return inputs.map((item, index) => ({ chunk_id: item.chunk_id, score: inputs.length - index }));
        },
      },
    });
    try { return { result: await coordinator.search({ query: "needle", limit: 5 }), calls }; }
    finally { coordinator.close(); }
  };
  const baseline = await search();
  const invalid = await planFor([source("strict-invalid.md", note("", "Strict invalid").replace('uid: ""\n', ""))]);
  authority = preflightIngestAuthority(state);
  assert.throws(() => prepareValidatedGkxIngestGeneration(authority, "strict", invalid), /STRICT_VALIDATION_BLOCKED/);
  const firstStatus = recordBlockedIngestAttempt(authority, invalid);
  const statusPath = join(state, "ingest-attempt-status.json");
  const firstStatusBytes = await readFile(statusPath);
  const firstStatusModified = (await stat(statusPath)).mtimeMs;
  authority = preflightIngestAuthority(state);
  assert.throws(() => prepareValidatedGkxIngestGeneration(authority, "strict", invalid), /STRICT_VALIDATION_BLOCKED/);
  const repeatedStatus = recordBlockedIngestAttempt(authority, invalid);
  assert.deepEqual(repeatedStatus, firstStatus);
  assert.deepEqual(await readFile(statusPath), firstStatusBytes);
  assert.equal((await stat(statusPath)).mtimeMs, firstStatusModified);
  assert.equal(indexProviderCalls, 1, "strict rejection performs no additional provider work");
  for (const [name, snapshot] of before) {
    const path = join(state, name);
    assert.deepEqual(await readFile(path), snapshot.bytes, `${name} bytes`);
    assert.equal((await stat(path)).mtimeMs, snapshot.modified, `${name} mtime`);
  }
  assert.deepEqual((await readdir(state)).sort(), [...existingFiles, "ingest-attempt-status.json"].sort());
  const after = await search();
  assert.deepEqual(after, baseline);
  const owner = openIngestOwnerState(state);
  assert.equal(owner.blocked_attempt.applicable, true);
  assert.equal(owner.blocked_attempt.status.status_digest, firstStatus.status_digest);
});

test("legacy writers are excluded by an ingest authority lock before provider work", async (t) => {
  const state = await temporaryState(t);
  const plan = await planFor([source("valid.md", note("018f0000-0000-7000-8000-000000000402"))]);
  const input = generationInput(state, plan);
  const authority = preflightIngestAuthority(state);
  let providerCalls = 0;
  await assert.rejects(indexGkxRetrievalGeneration(input, {
    kind: "mcp",
    provider_id: "test.fixed",
    model_id: "test-model",
    dimensions: 2,
    embed: async () => { providerCalls += 1; return []; },
  }), /RETRIEVAL_PHASE3_AUTHORITY_ACTIVE|WRITER_LOCKED/);
  assert.equal(providerCalls, 0);
  assert.throws(() => buildGkxRetrievalGeneration(input), /RETRIEVAL_PHASE3_AUTHORITY_ACTIVE|WRITER_LOCKED/);
  releaseIngestAuthorityPreflight(authority);
});

test("ingest preflight and legacy writer use a two-way exclusive handshake", async (t) => {
  const state = await temporaryState(t);
  const writer = acquireLegacyRetrievalWriter(state);
  assert.throws(() => preflightIngestAuthority(state), /LEGACY_WRITER_LOCKED/);
  releaseLegacyRetrievalWriter(writer);
  const authority = preflightIngestAuthority(state);
  assert.throws(() => acquireLegacyRetrievalWriter(state), /PHASE3_AUTHORITY_ACTIVE|WRITER_LOCKED/);
  releaseIngestAuthorityPreflight(authority);
});

test("an explicitly confirmed stale pre-provider legacy guard recovers only unchanged prior state", async (t) => {
  const state = await temporaryState(t);
  acquireLegacyRetrievalWriter(state);
  const lockPath = join(state, "retrieval-writer.lock");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.throws(() => recoverStaleLegacyRetrievalWriter(state, lock.lock_digest), /PROCESS_LIVE/);
  assert.throws(() => recoverStaleLegacyRetrievalWriter(state, lock.lock_digest, {
    confirm_process_incarnation_stale: true,
    on_lock_path_lstat() {
      if (process.platform === "win32") {
        const forced = new Date(Date.now() + 5_000);
        utimesSync(lockPath, forced, forced);
      } else chmodSync(lockPath, 0o644);
    },
  }), /WRITER_(?:ALIAS|PERMISSION|LOCK_CHANGED)_REJECTED|WRITER_LOCK_CHANGED/);
  assert.equal((await readdir(state)).includes("retrieval-writer.lock"), true);
  assert.equal((await readdir(state)).includes("retrieval-writer.recovery"), false);
  if (process.platform !== "win32") chmodSync(lockPath, 0o600);
  recoverStaleLegacyRetrievalWriter(state, lock.lock_digest, { confirm_process_incarnation_stale: true });
  assert.equal((await readdir(state)).includes("retrieval-writer.lock"), false);
  const authority = preflightIngestAuthority(state);
  releaseIngestAuthorityPreflight(authority);
});

test("legacy stale recovery cleans sealed lock/pointer temps and rejects linked aliases", async (t) => {
  const state = await temporaryState(t);
  const plan = await planFor([source("legacy.md", note("018f0000-0000-7000-8000-000000000494", "Legacy temp"))]);
  buildGkxRetrievalGeneration(generationInput(state, plan, "legacy-temp"));
  acquireLegacyRetrievalWriter(state);
  await writeFile(join(state, "retrieval-writer.lock.777.0123456789abcdef.tmp"),
    await readFile(join(state, "retrieval-writer.lock")), { mode: 0o600 });
  await writeFile(join(state, "active-retrieval.json.777.tmp"),
    await readFile(join(state, "active-retrieval.json")), { mode: 0o600 });
  let lockValue = JSON.parse(await readFile(join(state, "retrieval-writer.lock"), "utf8"));
  recoverStaleLegacyRetrievalWriter(state, lockValue.lock_digest, { confirm_process_incarnation_stale: true });
  assert.deepEqual((await readdir(state)).filter((name) => name.endsWith(".tmp")), []);

  acquireLegacyRetrievalWriter(state);
  const linked = join(state, "active-retrieval.json.778.tmp");
  await link(join(state, "active-retrieval.json"), linked);
  lockValue = JSON.parse(await readFile(join(state, "retrieval-writer.lock"), "utf8"));
  assert.throws(() => recoverStaleLegacyRetrievalWriter(state, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
  }), /TEMP_ALIAS_REJECTED/);
  await rm(linked);
  recoverStaleLegacyRetrievalWriter(state, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
    confirm_recovery_claim_stale: true,
  });

  acquireLegacyRetrievalWriter(state);
  await writeFile(join(state, "ACTIVE-RETRIEVAL.JSON.779.tmp"),
    await readFile(join(state, "active-retrieval.json")), { mode: 0o600 });
  lockValue = JSON.parse(await readFile(join(state, "retrieval-writer.lock"), "utf8"));
  assert.throws(() => recoverStaleLegacyRetrievalWriter(state, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
  }), /ARTIFACT_NAME_INVALID/);
  await rm(join(state, "ACTIVE-RETRIEVAL.JSON.779.tmp"));
  recoverStaleLegacyRetrievalWriter(state, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
    confirm_recovery_claim_stale: true,
  });
});

test("legacy pointer database names are projection-derived before any target path I/O", async (t) => {
  const canonicalState = await temporaryState(t);
  const plan = await planFor([source("legacy-name.md",
    note("018f0000-0000-7000-8000-000000000483", "Legacy name"))]);
  buildGkxRetrievalGeneration(generationInput(canonicalState, plan, "legacy-name"));
  const pointer = JSON.parse(await readFile(join(canonicalState, "active-retrieval.json"), "utf8"));
  const variants = [
    `retrieval-${"f".repeat(64)}.sqlite`,
    "evil:stream",
    "CON",
    "retrieval-bad.sqlite. ",
    "retrieval-bad.sqlite.",
  ];
  for (const [index, database_file] of variants.entries()) {
    await t.test(String(index), async (child) => {
      const state = await temporaryState(child);
      await mkdir(state, { recursive: true, mode: 0o700 });
      await writeFile(join(state, "active-retrieval.json"),
        `${retrieval.stableJson({ ...pointer, database_file })}\n`, { mode: 0o600 });
      assert.throws(() => preflightIngestAuthority(state), /LEGACY_POINTER_BINDING_INVALID/);
      assert.deepEqual((await readdir(state)).sort(), ["active-retrieval.json"]);
    });
  }
  assert.equal(JSON.parse(await readFile(join(canonicalState, "active-retrieval.json"), "utf8")).database_file,
    `retrieval-${pointer.manifest.projection_digest.slice(7)}.sqlite`);
});

test("first activation recovery keeps the prior state before root and completes only after root", async (t) => {
  const boundaries = [
    "outer_verified", "activation_intent_bound", "migration_prepared", "activation_root_published", "witness_activating",
    "legacy_tombstoned", "outer_pointer_published", "witness_active",
  ];
  for (const boundary of boundaries) {
    await t.test(boundary, async (child) => {
      const { state, staged } = await stagedFor(child, boundary);
      assert.throws(() => activateStagedGkxIngestGeneration(staged, {
        on_boundary(value) { if (value === boundary) throw new Error(`CRASH_${boundary}`); },
      }), new RegExp(`CRASH_${boundary}`));
      const lock = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
      const recovered = recoverStaleIngestAuthorityLock(state, lock.lock_digest, {
        confirm_process_incarnation_stale: true,
      });
      const committed = boundaries.indexOf(boundary) >= boundaries.indexOf("activation_root_published");
      assert.equal(recovered.active_generation !== null, committed, boundary);
      assert.equal((await readdir(state)).includes("ingest-authority.lock"), false);
      assert.equal((await readdir(state)).includes("ingest-authority.recovery"), false);
      if (committed) assert.equal(openIngestOwnerState(state).active_generation.source, "ingest");
    });
  }
});

test("generic release aborts only before the irreversible activation boundary", async (t) => {
  const boundaries = [
    "outer_verified", "activation_intent_bound", "migration_prepared", "activation_root_published", "witness_activating",
    "legacy_tombstoned", "outer_pointer_published", "witness_active",
  ];
  for (const boundary of boundaries) {
    await t.test(boundary, async (child) => {
      const { state, authority, staged } = await stagedFor(child, `release-${boundary}`);
      assert.throws(() => activateStagedGkxIngestGeneration(staged, {
        on_boundary(value) { if (value === boundary) throw new Error(`CRASH_${boundary}`); },
      }), new RegExp(`CRASH_${boundary}`));
      const committed = boundaries.indexOf(boundary) >= boundaries.indexOf("activation_root_published");
      if (!committed) {
        releaseIngestAuthorityPreflight(authority);
        assert.equal((await readdir(state)).includes("ingest-authority.lock"), false);
        assert.equal(openIngestOwnerState(state).active_generation, null);
        return;
      }
      assert.throws(() => releaseIngestAuthorityPreflight(authority), /AUTHORITY_RECOVERY_REQUIRED/);
      assert.equal((await readdir(state)).includes("ingest-authority.lock"), true);
      const lock = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
      const recovered = recoverStaleIngestAuthorityLock(state, lock.lock_digest, {
        confirm_process_incarnation_stale: true,
      });
      assert.equal(recovered.active_generation.active.owner_generation_id, staged.owner_manifest.owner_generation_id);
    });
  }
});

test("later-pointer and blocked-status transitions retain intent after commit", async (t) => {
  const { state, staged: firstStaged } = await stagedFor(t, "release-later-first");
  activateStagedGkxIngestGeneration(firstStaged);
  const laterPlan = await planFor([source("release-later.md",
    note("018f0000-0000-7000-8000-000000000489", "Release later"))]);

  let authority = preflightIngestAuthority(state);
  let staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", laterPlan),
    ingestCoordinate(state, laterPlan, "release-later-intent"));
  assert.throws(() => activateStagedGkxIngestGeneration(staged, {
    on_boundary(value) { if (value === "activation_intent_bound") throw new Error("STOP_LATER_INTENT"); },
  }), /STOP_LATER_INTENT/);
  releaseIngestAuthorityPreflight(authority);
  assert.equal(openIngestOwnerState(state).active_generation.active.owner_generation_id,
    firstStaged.owner_manifest.owner_generation_id);

  authority = preflightIngestAuthority(state);
  staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", laterPlan),
    ingestCoordinate(state, laterPlan, "release-later-pointer"));
  assert.throws(() => activateStagedGkxIngestGeneration(staged, {
    on_boundary(value) { if (value === "outer_pointer_published") throw new Error("STOP_LATER_POINTER"); },
  }), /STOP_LATER_POINTER/);
  assert.throws(() => releaseIngestAuthorityPreflight(authority), /PREFLIGHT_CHANGED/);
  let lock = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
  recoverStaleIngestAuthorityLock(state, lock.lock_digest, { confirm_process_incarnation_stale: true });

  const invalid = await planFor([source("release-blocked.md", note("", "Release blocked").replace('uid: ""\n', ""))]);
  authority = preflightIngestAuthority(state);
  assert.throws(() => recordBlockedIngestAttempt(authority, invalid, {
    on_boundary(value) { if (value === "attempt_intent_bound") throw new Error("STOP_BLOCK_INTENT"); },
  }), /STOP_BLOCK_INTENT/);
  releaseIngestAuthorityPreflight(authority);

  authority = preflightIngestAuthority(state);
  assert.throws(() => recordBlockedIngestAttempt(authority, invalid, {
    on_boundary(value) { if (value === "attempt_status_published") throw new Error("STOP_BLOCK_STATUS"); },
  }), /STOP_BLOCK_STATUS/);
  assert.throws(() => releaseIngestAuthorityPreflight(authority), /PREFLIGHT_CHANGED/);
  lock = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
  const owner = recoverStaleIngestAuthorityLock(state, lock.lock_digest, { confirm_process_incarnation_stale: true });
  assert.equal(owner.blocked_attempt.applicable, true);
});

test("later activation recovery accepts only the exact prior or exact bound target", async (t) => {
  const { state, staged: firstStaged } = await stagedFor(t, "later-first");
  const first = activateStagedGkxIngestGeneration(firstStaged);
  const secondPlan = await planFor([source("later.md", note("018f0000-0000-7000-8000-000000000492", "Later target"))]);
  const secondInput = generationInput(state, secondPlan, "later-second");

  let authority = preflightIngestAuthority(state);
  let staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", secondPlan), ingestCoordinate(state, secondPlan, "later-second"));
  assert.throws(() => activateStagedGkxIngestGeneration(staged, {
    on_boundary(value) { if (value === "activation_intent_bound") throw new Error("CRASH_AFTER_INTENT"); },
  }), /CRASH_AFTER_INTENT/);
  let lock = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
  let recovered = recoverStaleIngestAuthorityLock(state, lock.lock_digest, { confirm_process_incarnation_stale: true });
  assert.equal(recovered.active_generation.active.owner_generation_id, first.active.owner_generation_id);

  authority = preflightIngestAuthority(state);
  staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", secondPlan), ingestCoordinate(state, secondPlan, "later-second"));
  assert.throws(() => activateStagedGkxIngestGeneration(staged, {
    on_boundary(value) { if (value === "outer_pointer_published") throw new Error("CRASH_AFTER_POINTER"); },
  }), /CRASH_AFTER_POINTER/);
  lock = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
  recovered = recoverStaleIngestAuthorityLock(state, lock.lock_digest, { confirm_process_incarnation_stale: true });
  assert.equal(recovered.active_generation.active.owner_generation_id, staged.owner_manifest.owner_generation_id);
  assert.notEqual(recovered.active_generation.active.owner_generation_id, first.active.owner_generation_id);
});

test("blocked attempt recovery and applicability follow the exact prior-active lifecycle", async (t) => {
  const state = await temporaryState(t);
  const invalidOne = await planFor([source("invalid-one.md", note("", "Invalid one").replace('uid: ""\n', ""))]);

  let authority = preflightIngestAuthority(state);
  assert.throws(() => recordBlockedIngestAttempt(authority, invalidOne, {
    on_boundary(value) { if (value === "attempt_intent_bound") throw new Error("CRASH_STATUS_INTENT"); },
  }), /CRASH_STATUS_INTENT/);
  let lock = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
  let owner = recoverStaleIngestAuthorityLock(state, lock.lock_digest, { confirm_process_incarnation_stale: true });
  assert.equal(owner.active_generation, null);
  assert.equal(owner.blocked_attempt, null);

  authority = preflightIngestAuthority(state);
  assert.throws(() => recordBlockedIngestAttempt(authority, invalidOne, {
    on_boundary(value) { if (value === "attempt_status_published") throw new Error("CRASH_STATUS_PUBLISHED"); },
  }), /CRASH_STATUS_PUBLISHED/);
  lock = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
  owner = recoverStaleIngestAuthorityLock(state, lock.lock_digest, { confirm_process_incarnation_stale: true });
  assert.equal(owner.blocked_attempt.applicable, true);
  assert.equal(owner.blocked_attempt.status.availability, "unavailable");
  const blockedDigest = owner.blocked_attempt.status.status_digest;

  const validPlan = await planFor([source("valid.md", note("018f0000-0000-7000-8000-000000000493", "Valid after block"))]);
  authority = preflightIngestAuthority(state);
  const staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "strict", validPlan), ingestCoordinate(state, validPlan, "after-block"));
  activateStagedGkxIngestGeneration(staged);
  owner = openIngestOwnerState(state);
  assert.equal(owner.blocked_attempt.status.status_digest, blockedDigest);
  assert.equal(owner.blocked_attempt.applicable, false);
});

test("stale recovery seals and removes every mutable temp and rejects hard-linked temps", async (t) => {
  const { state, staged } = await stagedFor(t, "mutable-temp");
  activateStagedGkxIngestGeneration(staged);
  const invalid = await planFor([source("invalid.md", note("", "Invalid").replace('uid: ""\n', ""))]);
  recordBlockedIngestAttempt(preflightIngestAuthority(state), invalid);

  let authority = preflightIngestAuthority(state);
  const copies = [
    ["active-ingest.json", "active-ingest.json.777.tmp"],
    ["active-retrieval.json", "active-retrieval.json.777.tmp"],
    ["ingest-attempt-status.json", "ingest-attempt-status.json.777.tmp"],
    ["ingest-authority.lock", "ingest-authority.lock.777.tmp"],
  ];
  for (const [from, to] of copies) {
    await writeFile(join(state, to), await readFile(join(state, from)), { mode: 0o600 });
  }
  let lockValue = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
  recoverStaleIngestAuthorityLock(state, lockValue.lock_digest, { confirm_process_incarnation_stale: true });
  assert.deepEqual((await readdir(state)).filter((name) => name.endsWith(".tmp")), []);

  authority = preflightIngestAuthority(state);
  const linkedTemp = join(state, "active-ingest.json.778.tmp");
  await link(join(state, "active-ingest.json"), linkedTemp);
  lockValue = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
  assert.throws(() => recoverStaleIngestAuthorityLock(state, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
  }), /MUTABLE_TEMP_ALIAS_INVALID/);
  await rm(linkedTemp);
  recoverStaleIngestAuthorityLock(state, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
    confirm_recovery_claim_stale: true,
  });
  assert.equal((await readdir(state)).includes("ingest-authority.lock"), false);

  authority = preflightIngestAuthority(state);
  await writeFile(join(state, "ACTIVE-INGEST.JSON.779.tmp"),
    await readFile(join(state, "active-ingest.json")), { mode: 0o600 });
  lockValue = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
  assert.throws(() => recoverStaleIngestAuthorityLock(state, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
  }), /ARTIFACT_NAME_INVALID/);
  await rm(join(state, "ACTIVE-INGEST.JSON.779.tmp"));
  recoverStaleIngestAuthorityLock(state, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
    confirm_recovery_claim_stale: true,
  });
});

test("immutable recovery applies the pointer cap before reading linked migration authority", async (t) => {
  const state = await temporaryState(t);
  preflightIngestAuthority(state);
  const finalPath = join(state, `ingest-migration-${"f".repeat(64)}.json`);
  const temporaryPath = `${finalPath}.777.tmp`;
  await writeFile(finalPath, Buffer.alloc(1_048_577, 0x20), { mode: 0o600 });
  await link(finalPath, temporaryPath);
  const lock = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
  assert.throws(() => recoverStaleIngestAuthorityLock(state, lock.lock_digest, {
    confirm_process_incarnation_stale: true,
  }), /IMMUTABLE_LINK_PAIR_INVALID/);
  assert.equal((await readdir(state)).includes("ingest-authority.lock"), true);
  await rm(temporaryPath);
  await rm(finalPath);
  recoverStaleIngestAuthorityLock(state, lock.lock_digest, {
    confirm_process_incarnation_stale: true,
    confirm_recovery_claim_stale: true,
  });
});

test("recovery claim pairs seal timestamps, device, mode, and both hard-link names", async (t) => {
  const state = await temporaryState(t);
  preflightIngestAuthority(state);
  const lockPath = join(state, "ingest-authority.lock");
  const claimPath = join(state, "ingest-authority.recovery");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const original = readFileSync(lockPath);
  assert.throws(() => recoverStaleIngestAuthorityLock(state, lock.lock_digest, {
    confirm_process_incarnation_stale: true,
    on_recovery_claim_descriptor_opened() {
      writeFileSync(lockPath, original);
      const forced = new Date(Date.now() + 5_000);
      utimesSync(lockPath, forced, forced);
    },
  }), /AUTHORITY_RECOVERY_CLAIM_CHANGED/);
  assert.equal((await readdir(state)).includes("ingest-authority.lock"), true);
  assert.equal((await readdir(state)).includes("ingest-authority.recovery"), true);
  recoverStaleIngestAuthorityLock(state, lock.lock_digest, {
    confirm_process_incarnation_stale: true,
    confirm_recovery_claim_stale: true,
  });

  if (process.platform !== "win32") {
    preflightIngestAuthority(state);
    const next = JSON.parse(await readFile(lockPath, "utf8"));
    await link(lockPath, claimPath);
    chmodSync(lockPath, 0o644);
    assert.throws(() => recoverStaleIngestAuthorityLock(state, next.lock_digest, {
      confirm_process_incarnation_stale: true,
      confirm_recovery_claim_stale: true,
    }), /AUTHORITY_RECOVERY_CLAIM_INVALID/);
    assert.equal((await readdir(state)).includes("ingest-authority.lock"), true);
    assert.equal((await readdir(state)).includes("ingest-authority.recovery"), true);
    chmodSync(lockPath, 0o600);
    recoverStaleIngestAuthorityLock(state, next.lock_digest, {
      confirm_process_incarnation_stale: true,
      confirm_recovery_claim_stale: true,
    });
  }
});

test("controlled artifact names are case-canonical before authority acquisition", async (t) => {
  const variants = [
    "INGEST-BOGUS",
    `RETRIEVAL-${"a".repeat(64)}.SQLITE`,
    "ACTIVE-INGEST.JSON.777.tmp",
    "INGEST-AUTHORITY.LOCK",
  ];
  for (const [index, variant] of variants.entries()) {
    await t.test(variant, async (child) => {
      const state = await temporaryState(child);
      await mkdir(state, { recursive: true, mode: 0o700 });
      await writeFile(join(state, variant), "{}\n", { mode: 0o600 });
      assert.throws(() => preflightIngestAuthority(state), /ARTIFACT_NAME_INVALID/);
      assert.equal((await readdir(state)).includes("ingest-authority.lock"), false, String(index));
    });
  }
});

test("owner open rejects case-renamed internal pointer, witness, tombstone, manifest, and database", async (t) => {
  const targets = ["active-ingest.json", "ingest-authority.json", "active-retrieval.json", "manifest", "database"];
  for (const target of targets) {
    await t.test(target, async (child) => {
      const { state, staged } = await stagedFor(child, `case-${target}`);
      activateStagedGkxIngestGeneration(staged);
      const pointer = JSON.parse(await readFile(join(state, "active-ingest.json"), "utf8"));
      const manifest = JSON.parse(await readFile(join(state, pointer.owner_generation_file), "utf8"));
      const name = target === "manifest" ? pointer.owner_generation_file :
        target === "database" ? manifest.inner.database_file : target;
      await forceCaseRename(join(state, name), join(state, name.toUpperCase()));
      const expected = target === "manifest" ?
        (process.platform === "win32" ? /GKX_INGEST_STATE_PATH_ESCAPE_REJECTED/ : /GKX_INGEST_OWNER_MANIFEST_MISSING/) :
        target === "database" ?
          (process.platform === "win32" ? /GKX_INGEST_STATE_PATH_ESCAPE_REJECTED/ : /GKX_INGEST_INNER_DATABASE_MISSING/) :
          /ALIAS|ESCAPE|MISSING|INVALID|WITNESS|POINTER|MANIFEST|DATABASE/;
      assert.throws(() => openIngestOwnerState(state), expected);
    });
  }
});

test("owner state sealers reject self-resealed inconsistent derived coordinates", async (t) => {
  const state = await temporaryState(t);
  const legacyPlan = await planFor([source("legacy.md", note("018f0000-0000-7000-8000-000000000496", "Legacy binding"))]);
  const generation = generationInput(state, legacyPlan, "binding-legacy");
  buildGkxRetrievalGeneration(generation);

  let authority = preflightIngestAuthority(state);
  const preflightLock = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
  const forgedPriorLock = structuredClone(preflightLock);
  forgedPriorLock.prior_active.projection_id = `retrieval:${"f".repeat(24)}`;
  forgedPriorLock.lock_digest = retrieval.retrievalCanonicalDigest(Object.fromEntries(
    Object.entries(forgedPriorLock).filter(([key]) => key !== "lock_digest"),
  ));
  assert.throws(() => sealIngestAuthorityLockEnvelope(forgedPriorLock), /PRIOR_ACTIVE_LEGACY_INVALID/);

  const staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", legacyPlan), ingestCoordinate(state, legacyPlan, "binding-legacy"));
  assert.throws(() => activateStagedGkxIngestGeneration(staged, {
    on_boundary(value) { if (value === "activation_intent_bound") throw new Error("STOP_AT_INTENT"); },
  }), /STOP_AT_INTENT/);
  const activationLock = JSON.parse(await readFile(join(state, "ingest-authority.lock"), "utf8"));
  const forgedTargetLock = structuredClone(activationLock);
  forgedTargetLock.target.pointer_digest = `sha256:${"f".repeat(64)}`;
  forgedTargetLock.lock_digest = retrieval.retrievalCanonicalDigest(Object.fromEntries(
    Object.entries(forgedTargetLock).filter(([key]) => key !== "lock_digest"),
  ));
  assert.throws(() => sealIngestAuthorityLockEnvelope(forgedTargetLock), /ACTIVATION_TARGET_INVALID/);
  recoverStaleIngestAuthorityLock(state, activationLock.lock_digest, { confirm_process_incarnation_stale: true });

  authority = preflightIngestAuthority(state);
  const restaged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", legacyPlan), ingestCoordinate(state, legacyPlan, "binding-legacy"));
  activateStagedGkxIngestGeneration(restaged);
  const pointer = JSON.parse(await readFile(join(state, "active-ingest.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(state, pointer.owner_generation_file), "utf8"));
  const root = JSON.parse(await readFile(join(state, "ingest-activation-root.json"), "utf8"));
  const witness = JSON.parse(await readFile(join(state, "ingest-authority.json"), "utf8"));
  const tombstone = JSON.parse(await readFile(join(state, "active-retrieval.json"), "utf8"));
  const migration = JSON.parse(await readFile(join(state, root.migration_file), "utf8"));

  const forgedManifest = structuredClone(manifest);
  forgedManifest.inner.manifest.engine_version = "forged";
  forgedManifest.inner.manifest_digest = retrieval.retrievalCanonicalDigest(forgedManifest.inner.manifest);
  const manifestMaterial = Object.fromEntries(Object.entries(forgedManifest)
    .filter(([key]) => key !== "owner_generation_id" && key !== "owner_manifest_digest"));
  forgedManifest.owner_manifest_digest = retrieval.retrievalCanonicalDigest(manifestMaterial);
  forgedManifest.owner_generation_id = `ingest:${forgedManifest.owner_manifest_digest.slice(7, 31)}`;
  assert.throws(() => sealIngestOwnerGenerationManifestEnvelope(forgedManifest), /INNER_MANIFEST|MANIFEST_IDENTITY/);

  const forgedJournalCoordinate = structuredClone(manifest);
  forgedJournalCoordinate.rejection_journal.rejection_journal_digest = `sha256:${"f".repeat(64)}`;
  forgedJournalCoordinate.rejection_journal.journal_file = `ingest-rejections-${"f".repeat(64)}.json`;
  const journalMaterial = Object.fromEntries(Object.entries(forgedJournalCoordinate)
    .filter(([key]) => key !== "owner_generation_id" && key !== "owner_manifest_digest"));
  forgedJournalCoordinate.owner_manifest_digest = retrieval.retrievalCanonicalDigest(journalMaterial);
  forgedJournalCoordinate.owner_generation_id = `ingest:${forgedJournalCoordinate.owner_manifest_digest.slice(7, 31)}`;
  assert.throws(() => sealIngestOwnerGenerationManifestEnvelope(forgedJournalCoordinate), /JOURNAL_BINDING_INVALID/);
  assert.throws(() => sealIngestIndexResultEnvelope({
    contract_version: "gkos-ingest-index-result/1.0.0-draft.1",
    status: "published",
    mode: "non_strict",
    summary: manifest.validation_result.summary,
    active: pointer,
    blocked_attempt: null,
    owner_generation: forgedJournalCoordinate,
  }), /INDEX_RESULT_FIELDS_INVALID/);

  const forgedTombstone = structuredClone(tombstone);
  forgedTombstone.target_owner_generation_id = `ingest:${"f".repeat(24)}`;
  forgedTombstone.tombstone_digest = retrieval.retrievalCanonicalDigest(Object.fromEntries(
    Object.entries(forgedTombstone).filter(([key]) => key !== "tombstone_digest"),
  ));
  assert.throws(() => sealIngestLegacyPointerTombstoneEnvelope(forgedTombstone), /SHAPE|BINDING/);

  const forgedRoot = reseal(root, "activation_root_digest");
  forgedRoot.active_pointer_digest = `sha256:${"f".repeat(64)}`;
  forgedRoot.activation_root_digest = retrieval.retrievalCanonicalDigest(Object.fromEntries(
    Object.entries(forgedRoot).filter(([key]) => key !== "activation_root_digest"),
  ));
  assert.throws(() => sealIngestActivationRootEnvelope(forgedRoot), /BINDING/);

  const forgedWitness = structuredClone(witness);
  forgedWitness.activation_root_digest = `sha256:${"f".repeat(64)}`;
  forgedWitness.witness_digest = retrieval.retrievalCanonicalDigest(Object.fromEntries(
    Object.entries(forgedWitness).filter(([key]) => key !== "witness_digest"),
  ));
  assert.throws(() => sealIngestAuthorityWitnessEnvelope(forgedWitness), /BINDING/);

  const forgedMigration = structuredClone(migration);
  forgedMigration.legacy_pointer.manifest.engine_version = "forged";
  forgedMigration.legacy_pointer_digest = canonicalFileDigest(forgedMigration.legacy_pointer);
  forgedMigration.migration_digest = retrieval.retrievalCanonicalDigest(Object.fromEntries(
    Object.entries(forgedMigration).filter(([key]) => key !== "migration_digest"),
  ));
  assert.throws(() => sealIngestMigrationRecordEnvelope(forgedMigration), /LEGACY_POINTER_MANIFEST_INVALID/);
});

test("owner reopen binds accepted validation observations to exact stored candidate rows", async (t) => {
  const state = await temporaryState(t);
  const planA = await planFor([source("source-a.md",
    note("018f0000-0000-7000-8000-000000000486", "Source A"))]);
  const authority = preflightIngestAuthority(state);
  const stagedA = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", planA), ingestCoordinate(state, planA, "source-binding"));
  activateStagedGkxIngestGeneration(stagedA);

  const stateB = await temporaryState(t);
  const planB = await planFor([source("source-b.md",
    note("018f0000-0000-7000-8000-000000000485", "Source B"))]);
  const substitutedInput = generationInput(stateB, planB, "source-binding-b");
  substitutedInput.source_snapshot_digest = planA.observation_snapshot_digest;
  substitutedInput.vault_id = stagedA.owner_manifest.vault_id;
  substitutedInput.configuration_digest = stagedA.owner_manifest.configuration_digest;
  substitutedInput.policy_digest = stagedA.owner_manifest.policy_digest;
  const builtB = buildGkxRetrievalGeneration(substitutedInput);
  const databaseFile = builtB.database_path.split(/[\\/]/u).at(-1);
  await copyFile(builtB.database_path, join(state, databaseFile));

  const forged = structuredClone(stagedA.owner_manifest);
  forged.inner = {
    database_file: databaseFile,
    manifest: builtB.manifest,
    manifest_digest: retrieval.retrievalCanonicalDigest(builtB.manifest),
  };
  const material = Object.fromEntries(Object.entries(forged)
    .filter(([key]) => key !== "owner_generation_id" && key !== "owner_manifest_digest"));
  forged.owner_manifest_digest = retrieval.retrievalCanonicalDigest(material);
  forged.owner_generation_id = `ingest:${forged.owner_manifest_digest.slice(7, 31)}`;
  const sealed = sealIngestOwnerGenerationManifestEnvelope(forged);
  const ownerFile = `ingest-generation-${sealed.owner_manifest_digest.slice(7)}.json`;
  await writeFile(join(state, ownerFile), `${retrieval.stableJson(sealed)}\n`, { mode: 0o600 });
  const bundleFiles = [databaseFile, sealed.rejection_journal.journal_file, ownerFile];

  const orphanState = await temporaryState(t);
  await mkdir(orphanState, { recursive: true, mode: 0o700 });
  for (const file of bundleFiles) await copyFile(join(state, file), join(orphanState, file));
  assert.throws(() => preflightIngestAuthority(orphanState), /SOURCE_BINDING_MISMATCH/);

  const recoveryState = await temporaryState(t);
  preflightIngestAuthority(recoveryState);
  const recoveryLock = JSON.parse(await readFile(join(recoveryState, "ingest-authority.lock"), "utf8"));
  for (const file of bundleFiles) await copyFile(join(state, file), join(recoveryState, file));
  assert.throws(() => recoverStaleIngestAuthorityLock(recoveryState, recoveryLock.lock_digest, {
    confirm_process_incarnation_stale: true,
  }), /SOURCE_BINDING_MISMATCH/);
  assert.equal((await readdir(recoveryState)).includes("ingest-authority.lock"), true);
  assert.equal((await readdir(recoveryState)).includes("ingest-authority.recovery"), true);
  for (const file of bundleFiles) await rm(join(recoveryState, file));
  recoverStaleIngestAuthorityLock(recoveryState, recoveryLock.lock_digest, {
    confirm_process_incarnation_stale: true,
    confirm_recovery_claim_stale: true,
  });

  const pointer = {
    contract_version: "gkos-ingest-active-pointer/1.0.0-draft.1",
    inner: {
      database_file: sealed.inner.database_file,
      manifest_digest: sealed.inner.manifest_digest,
      projection_id: sealed.inner.manifest.projection_id,
      projection_digest: sealed.inner.manifest.projection_digest,
    },
    owner_generation_file: ownerFile,
    owner_generation_id: sealed.owner_generation_id,
    owner_manifest_digest: sealed.owner_manifest_digest,
  };
  await writeFile(join(state, "active-ingest.json"), `${retrieval.stableJson(pointer)}\n`, { mode: 0o600 });
  assert.throws(() => openIngestOwnerState(state), /SOURCE_BINDING_MISMATCH/);
});

test("opaque preparation byte-binds accepted chunks before provider/cache work", async (t) => {
  const state = await temporaryState(t);
  const visible = source("visible.md", note("018f0000-0000-7000-8000-000000000497", "Visible provider text"));
  const hidden = source("hidden.md", note("", "EXFILTRATED_REJECTED_SOURCE_BYTES").replace('uid: ""\n', ""));
  const plan = await planFor([visible, hidden]);
  const authority = preflightIngestAuthority(state);
  const prepared = prepareValidatedGkxIngestGeneration(authority, "non_strict", plan);
  assert.equal(prepared.candidate_sources.length, 1);
  assert.ok(prepared.candidate_chunks.length > 0);
  assert.equal(retrieval.stableJson(prepared).includes("EXFILTRATED_REJECTED_SOURCE_BYTES"), false);

  let providerCalls = 0;
  const provider = {
    kind: "mcp",
    provider_id: "test.phase3-prepared",
    model_id: "test-model",
    dimensions: 2,
    timeout_ms: 1000,
    async embed(texts) {
      providerCalls += 1;
      assert.equal(texts.some((text) => text.includes("EXFILTRATED_REJECTED_SOURCE_BYTES")), false);
      return texts.map(() => Float32Array.from([1, 0]));
    },
  };
  const eligible = prepared.candidate_chunks.map((candidate) => candidate.candidate_chunk_key).sort();
  const coordinate = ingestCoordinate(state, plan, "prepared-provider", eligible);
  const mismatched = { ...coordinate, state_directory: `${state}-different` };
  await assert.rejects(stageValidatedGkxIngestGeneration(authority, prepared, mismatched, provider), /COORDINATE_MISMATCH/);
  assert.equal(providerCalls, 0);

  const forgeries = [
    (value) => { value.candidate_chunks[0].chunk.text = "EXFILTRATED_REJECTED_SOURCE_BYTES"; },
    (value) => { value.candidate_chunks.pop(); },
    (value) => { value.candidate_chunks.push(structuredClone(value.candidate_chunks[0])); },
    (value) => { value.candidate_chunks[0].parent_candidate_chunk_key = `gkx-candidate-chunk:${"f".repeat(64)}`; },
  ];
  for (const mutate of forgeries) {
    const forged = structuredClone(prepared);
    mutate(forged);
    await assert.rejects(stageValidatedGkxIngestGeneration(authority, forged, coordinate, provider), /CAPABILITY_INVALID/);
  }
  assert.equal(providerCalls, 0);
  assert.equal((await readdir(state)).some((name) => /^retrieval-|^ingest-(?:generation|rejections)-/u.test(name)), false);

  const staged = await stageValidatedGkxIngestGeneration(authority, prepared, coordinate, provider);
  assert.ok(providerCalls > 0);
  assert.equal(staged.owner_manifest.inner.manifest.embedding_provider_id, provider.provider_id);
  activateStagedGkxIngestGeneration(staged);
});

test("strict intrinsic invalidity returns no provider-readable preparation or derived artifact", async (t) => {
  const state = await temporaryState(t);
  const invalid = source("invalid.md", note("", "Strict secret").replace('uid: ""\n', ""));
  const plan = await planFor([invalid]);
  const authority = preflightIngestAuthority(state);
  assert.throws(() => prepareValidatedGkxIngestGeneration(authority, "strict", plan), /STRICT_VALIDATION_BLOCKED/);
  assert.deepEqual((await readdir(state)).sort(), ["ingest-authority.lock"]);
  releaseIngestAuthorityPreflight(authority);
});

test("strict outer publication accepts Decision-A corpus conflicts without rejecting physical records", async (t) => {
  const state = await temporaryState(t);
  const oldId = "018f0000-0000-7000-8000-000000000471";
  const newId = "018f0000-0000-7000-8000-000000000472";
  const otherId = "018f0000-0000-7000-8000-000000000473";
  const files = [
    source("decision-old.md", note(oldId, "Decision old", `superseded_by:\n  - "${otherId}"\n`)),
    source("decision-new.md", note(newId, "Decision new", `supersedes:\n  - "${oldId}"\n`)),
    source("decision-other.md", note(otherId, "Decision other")),
  ];
  const plan = await planFor(files);
  assert.equal(plan.result.corpus_valid, false);
  assert.equal(plan.result.ingest_intrinsic_valid, true);
  assert.equal(plan.result.rejections.length, 0);
  assert.equal(plan.accepted_sources.length, files.length);
  assert.equal(plan.accepted_declarations.filter((item) => item.category === "lineage").length, 2);

  const authority = preflightIngestAuthority(state);
  const staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "strict", plan),
    ingestCoordinate(state, plan, "decision-a-strict"));
  const opened = activateStagedGkxIngestGeneration(staged);
  assert.equal(opened.owner_manifest.validation_result.corpus_valid, false);
  assert.equal(opened.owner_manifest.validation_result.ingest_intrinsic_valid, true);
  assert.equal(opened.owner_manifest.rejection_journal.rejection_count, 0);
  assert.equal(opened.owner_manifest.inner.manifest.candidate_source_count, files.length);
  assert.equal(opened.owner_manifest.inner.manifest.candidate_declaration_count, plan.accepted_declarations.length);
  const store = new SqliteRetrievalStore(opened.database_path);
  try {
    assert.equal(store.listCandidateSources().length, files.length);
    assert.equal(store.listCandidateDeclarations().length, plan.accepted_declarations.length);
  } finally { store.close(); }
  const machine = sealIngestIndexResultEnvelope({
    contract_version: "gkos-ingest-index-result/1.0.0-draft.1",
    status: "published",
    mode: "strict",
    summary: plan.result.summary,
    active: opened.active,
    blocked_attempt: null,
  });
  assert.equal(machine.status, "published");
  assert.equal(machine.summary.rejected_source_count, 0);
});

test("empty eligibility still rejects malformed provider identity without a provider call", async (t) => {
  const state = await temporaryState(t);
  const invalid = source("invalid.md", note("", "No eligible chunks").replace('uid: ""\n', ""));
  const plan = await planFor([invalid]);
  const authority = preflightIngestAuthority(state);
  const prepared = prepareValidatedGkxIngestGeneration(authority, "non_strict", plan);
  assert.equal(prepared.candidate_chunks.length, 0);
  let calls = 0;
  await assert.rejects(stageValidatedGkxIngestGeneration(authority, prepared, ingestCoordinate(state, plan, "empty-provider"), {
    kind: "mcp", provider_id: "", model_id: "test", dimensions: 2, timeout_ms: 1000,
    async embed() { calls += 1; return []; },
  }), /VECTOR_PROVIDER_INVALID/);
  assert.equal(calls, 0);
  assert.deepEqual((await readdir(state)).sort(), ["ingest-authority.lock"]);
  releaseIngestAuthorityPreflight(authority);
});

test("provider identities are well-formed before accepted text can cross the provider boundary", async (t) => {
  const state = await temporaryState(t);
  const plan = await planFor([source("provider-id.md", note("018f0000-0000-7000-8000-000000000491", "Provider ID"))]);
  const authority = preflightIngestAuthority(state);
  const prepared = prepareValidatedGkxIngestGeneration(authority, "non_strict", plan);
  const coordinate = ingestCoordinate(state, plan, "provider-id",
    prepared.candidate_chunks.map((item) => item.candidate_chunk_key).sort());
  let calls = 0;
  for (const [providerId, modelId] of [["bad\ud800", "model"], ["provider", "bad\ud800"]]) {
    await assert.rejects(stageValidatedGkxIngestGeneration(authority, prepared, coordinate, {
      kind: "mcp", provider_id: providerId, model_id: modelId, dimensions: 2, timeout_ms: 1000,
      async embed() { calls += 1; return []; },
    }), /VECTOR_PROVIDER_INVALID/);
  }
  await assert.rejects(stageValidatedGkxIngestGeneration(authority, prepared, {
    ...coordinate,
    vault_id: "vault:bad\ud800",
  }, {
    kind: "mcp", provider_id: "provider", model_id: "model", dimensions: 2, timeout_ms: 1000,
    async embed() { calls += 1; return []; },
  }), /GENERATION_COORDINATE_INVALID/);
  assert.equal(calls, 0);
  assert.deepEqual((await readdir(state)).sort(), ["ingest-authority.lock"]);
  releaseIngestAuthorityPreflight(authority);
});

test("provider failure rolls back vectors and stages one complete lexical generation", async (t) => {
  const state = await temporaryState(t);
  const plan = await planFor([source("provider.md", note("018f0000-0000-7000-8000-000000000498", "Provider rollback"))]);
  const authority = preflightIngestAuthority(state);
  const prepared = prepareValidatedGkxIngestGeneration(authority, "non_strict", plan);
  let calls = 0;
  const staged = await stageValidatedGkxIngestGeneration(authority, prepared,
    ingestCoordinate(state, plan, "provider-rollback", prepared.candidate_chunks.map((item) => item.candidate_chunk_key).sort()), {
      kind: "mcp", provider_id: "test.failure", model_id: "test-model", dimensions: 2, timeout_ms: 1000,
      async embed() { calls += 1; throw new Error("PROVIDER_DOWN"); },
    });
  assert.ok(calls > 0);
  assert.equal(staged.owner_manifest.inner.manifest.embedding_provider_id, null);
  assert.equal(staged.owner_manifest.inner.manifest.embedding_model_id, null);
  assert.equal(staged.owner_manifest.inner.manifest.embedding_dimensions, null);
  activateStagedGkxIngestGeneration(staged);
});

test("authority preflight semantically seals the complete controlled artifact namespace", async (t) => {
  const corruptState = await temporaryState(t);
  await (await import("node:fs/promises")).mkdir(corruptState, { recursive: true, mode: 0o700 });
  await writeFile(join(corruptState, `ingest-generation-${"0".repeat(64)}.json`), "{}\n", { mode: 0o600 });
  assert.throws(() => preflightIngestAuthority(corruptState), /OWNER_MANIFEST|INVALID/);
  assert.equal((await readdir(corruptState)).includes("ingest-authority.lock"), false);

  const linkedState = await temporaryState(t);
  const plan = await planFor([source("linked.md", note("018f0000-0000-7000-8000-000000000495", "Linked"))]);
  const built = buildGkxRetrievalGeneration(generationInput(linkedState, plan, "linked-namespace"));
  await link(built.database_path, join(linkedState, `retrieval-${"f".repeat(64)}.sqlite`));
  assert.throws(() => preflightIngestAuthority(linkedState), /ARTIFACT_INVALID|ALIAS|HARDLINK/);
  assert.equal((await readdir(linkedState)).includes("ingest-authority.lock"), false);
});

test("normal authority release seals the complete namespace and retains its guard on failure", async (t) => {
  await t.test("corrupt controlled artifact", async (child) => {
    const state = await temporaryState(child);
    const authority = preflightIngestAuthority(state);
    const corrupt = join(state, `ingest-generation-${"0".repeat(64)}.json`);
    await writeFile(corrupt, "{}\n", { mode: 0o600 });
    assert.throws(() => releaseIngestAuthorityPreflight(authority), /OWNER_MANIFEST|INVALID/);
    assert.equal((await readdir(state)).includes("ingest-authority.lock"), true);
    await rm(corrupt);
    releaseIngestAuthorityPreflight(authority);
  });

  await t.test("hard-linked controlled artifact", async (child) => {
    const state = await temporaryState(child);
    const authority = preflightIngestAuthority(state);
    const ordinary = join(state, "ordinary.bin");
    const controlled = join(state, `retrieval-${"f".repeat(64)}.sqlite`);
    await writeFile(ordinary, "not-a-database\n", { mode: 0o600 });
    await link(ordinary, controlled);
    assert.throws(() => releaseIngestAuthorityPreflight(authority), /ARTIFACT_INVALID|ALIAS|HARDLINK/);
    assert.equal((await readdir(state)).includes("ingest-authority.lock"), true);
    await rm(controlled);
    releaseIngestAuthorityPreflight(authority);
  });

  await t.test("unsafe self-digested journal", async (child) => {
    const state = await temporaryState(child);
    const plan = await planFor([source("release-journal.md",
      note("018f0000-0000-7000-8000-000000000492", "Release Journal"))]);
    const authority = preflightIngestAuthority(state);
    const material = {
      contract_version: "gkos-ingest-rejection-journal/1.0.0-draft.1",
      observation_snapshot_digest: plan.observation_snapshot_digest,
      profile: plan.result.profile,
      normalized_profile: plan.result.normalized_profile,
      rejection_count: 1,
      rejections: [{ raw_yaml: "TOP SECRET: api_key=123" }],
    };
    const unsafe = { ...material, rejection_journal_digest: retrieval.retrievalCanonicalDigest(material) };
    const path = join(state, `ingest-rejections-${unsafe.rejection_journal_digest.slice(7)}.json`);
    await writeFile(path, `${retrieval.stableJson(unsafe)}\n`, { mode: 0o600 });
    assert.throws(() => releaseIngestAuthorityPreflight(authority), /REJECTION|INVALID/);
    assert.equal((await readdir(state)).includes("ingest-authority.lock"), true);
    await rm(path);
    releaseIngestAuthorityPreflight(authority);
  });

  await t.test("fully sealed staged orphan", async (child) => {
    const { state, authority, staged } = await stagedFor(child, "release-orphan");
    releaseIngestAuthorityPreflight(authority);
    const names = await readdir(state);
    assert.equal(names.includes("ingest-authority.lock"), false);
    assert.equal(names.includes(staged.owner_manifest.inner.database_file), true);
    assert.equal(names.includes(staged.owner_manifest.rejection_journal.journal_file), true);
    assert.equal(names.includes(`ingest-generation-${staged.owner_manifest.owner_manifest_digest.slice(7)}.json`), true);
  });

  await t.test("unexpected valid content-addressed artifact", async (child) => {
    const state = await temporaryState(child);
    const authority = preflightIngestAuthority(state);
    const builderState = await temporaryState(child);
    const plan = await planFor([source("unexpected.md",
      note("018f0000-0000-7000-8000-000000000488", "Unexpected valid artifact"))]);
    const built = buildGkxRetrievalGeneration(generationInput(builderState, plan, "unexpected-valid"));
    await copyFile(built.database_path, join(state, built.database_path.split(/[\\/]/u).at(-1)));
    assert.throws(() => releaseIngestAuthorityPreflight(authority), /PREFLIGHT_CHANGED|ARTIFACT_NAMESPACE_CHANGED/);
    assert.equal((await readdir(state)).includes("ingest-authority.lock"), true);
  });
});

test("stale recovery semantically seals corrupt and aliased controlled artifacts before releasing the guard", async (t) => {
  const corruptState = await temporaryState(t);
  preflightIngestAuthority(corruptState);
  let lockValue = JSON.parse(await readFile(join(corruptState, "ingest-authority.lock"), "utf8"));
  const corruptOwner = join(corruptState, `ingest-generation-${"0".repeat(64)}.json`);
  await writeFile(corruptOwner, "{}\n", { mode: 0o600 });
  assert.throws(() => recoverStaleIngestAuthorityLock(corruptState, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
  }), /OWNER_MANIFEST|INVALID/);
  assert.equal((await readdir(corruptState)).includes("ingest-authority.lock"), true);
  await rm(corruptOwner);
  recoverStaleIngestAuthorityLock(corruptState, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
    confirm_recovery_claim_stale: true,
  });

  const linkedState = await temporaryState(t);
  preflightIngestAuthority(linkedState);
  lockValue = JSON.parse(await readFile(join(linkedState, "ingest-authority.lock"), "utf8"));
  const ordinary = join(linkedState, "ordinary.bin");
  const controlled = join(linkedState, `retrieval-${"f".repeat(64)}.sqlite`);
  await writeFile(ordinary, "sealed-but-not-a-database\n", { mode: 0o600 });
  await link(ordinary, controlled);
  assert.throws(() => recoverStaleIngestAuthorityLock(linkedState, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
  }), /ARTIFACT_INVALID|ALIAS|HARDLINK/);
  assert.equal((await readdir(linkedState)).includes("ingest-authority.lock"), true);
  await rm(controlled);
  recoverStaleIngestAuthorityLock(linkedState, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
    confirm_recovery_claim_stale: true,
  });
});

test("standalone crash-orphan journals are fully safe-sealed before preflight or recovery", async (t) => {
  const plan = await planFor([source("journal.md", note("018f0000-0000-7000-8000-000000000499", "Journal"))]);
  const unsafeMaterial = {
    contract_version: "gkos-ingest-rejection-journal/1.0.0-draft.1",
    observation_snapshot_digest: plan.observation_snapshot_digest,
    profile: plan.result.profile,
    normalized_profile: plan.result.normalized_profile,
    rejection_count: 1,
    rejections: [{ raw_yaml: "TOP SECRET: api_key=123" }],
  };
  const unsafe = { ...unsafeMaterial, rejection_journal_digest: retrieval.retrievalCanonicalDigest(unsafeMaterial) };
  const unsafeName = `ingest-rejections-${unsafe.rejection_journal_digest.slice(7)}.json`;

  const preflightState = await temporaryState(t);
  await mkdir(preflightState, { recursive: true, mode: 0o700 });
  await writeFile(join(preflightState, unsafeName), `${retrieval.stableJson(unsafe)}\n`, { mode: 0o600 });
  assert.throws(() => preflightIngestAuthority(preflightState), /REJECTION|INVALID/);
  assert.equal((await readdir(preflightState)).includes("ingest-authority.lock"), false);

  const recoveryState = await temporaryState(t);
  preflightIngestAuthority(recoveryState);
  await writeFile(join(recoveryState, unsafeName), `${retrieval.stableJson(unsafe)}\n`, { mode: 0o600 });
  const lockValue = JSON.parse(await readFile(join(recoveryState, "ingest-authority.lock"), "utf8"));
  assert.throws(() => recoverStaleIngestAuthorityLock(recoveryState, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
  }), /REJECTION|INVALID/);
  await rm(join(recoveryState, unsafeName));
  recoverStaleIngestAuthorityLock(recoveryState, lockValue.lock_digest, {
    confirm_process_incarnation_stale: true,
    confirm_recovery_claim_stale: true,
  });

  const sourceState = await temporaryState(t);
  const sourceAuthority = preflightIngestAuthority(sourceState);
  const staged = await stageValidatedGkxIngestGeneration(sourceAuthority,
    prepareValidatedGkxIngestGeneration(sourceAuthority, "non_strict", plan), ingestCoordinate(sourceState, plan, "journal-orphan"));
  releaseIngestAuthorityPreflight(sourceAuthority);
  const orphanState = await temporaryState(t);
  preflightIngestAuthority(orphanState);
  await copyFile(staged.inner_database_path, join(orphanState, staged.owner_manifest.inner.database_file));
  await copyFile(staged.journal_path, join(orphanState, staged.owner_manifest.rejection_journal.journal_file));
  const orphanLock = JSON.parse(await readFile(join(orphanState, "ingest-authority.lock"), "utf8"));
  const recovered = recoverStaleIngestAuthorityLock(orphanState, orphanLock.lock_digest, {
    confirm_process_incarnation_stale: true,
  });
  assert.equal(recovered.active_generation, null);
  assert.ok((await readdir(orphanState)).includes(staged.owner_manifest.rejection_journal.journal_file));

  const invalidPlan = await planFor([source("duplicate-journal.md", note("", "Duplicate journal").replace('uid: ""\n', ""))]);
  const duplicateMaterial = {
    contract_version: "gkos-ingest-rejection-journal/1.0.0-draft.1",
    observation_snapshot_digest: invalidPlan.observation_snapshot_digest,
    profile: invalidPlan.result.profile,
    normalized_profile: invalidPlan.result.normalized_profile,
    rejection_count: 2,
    rejections: [invalidPlan.result.rejections[0], invalidPlan.result.rejections[0]],
  };
  assert.throws(() => sealIngestRejectionJournalEnvelope({
    ...duplicateMaterial,
    rejection_journal_digest: retrieval.retrievalCanonicalDigest(duplicateMaterial),
  }, invalidPlan.result.normalized_profile), /MULTIPLICITY_INVALID/);
});

test("non-strict all-invalid publication is a complete zero-candidate generation with one sealed rejection", async (t) => {
  const state = await temporaryState(t);
  const malformed = note("", "Rejected").replace('uid: ""\n', "");
  const plan = await planFor([source("rejected.md", malformed)]);
  assert.equal(plan.result.summary.valid_source_count, 0);
  assert.equal(plan.result.summary.rejected_source_count, 1);
  const authority = preflightIngestAuthority(state);
  const staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", plan), ingestCoordinate(state, plan, "all-invalid"));
  const opened = activateStagedGkxIngestGeneration(staged);
  assert.equal(opened.owner_manifest.inner.manifest.candidate_source_count, 0);
  assert.equal(opened.owner_manifest.inner.manifest.candidate_chunk_count, 0);
  assert.equal(opened.owner_manifest.rejection_journal.rejection_count, 1);
  const machine = sealIngestIndexResultEnvelope({
    contract_version: "gkos-ingest-index-result/1.0.0-draft.1",
    status: "published_with_rejections",
    mode: "non_strict",
    summary: plan.result.summary,
    active: opened.active,
    blocked_attempt: null,
  });
  assert.equal(machine.status, "published_with_rejections");
  assert.throws(() => sealIngestIndexResultEnvelope({ ...machine, status: "published" }), /PUBLICATION_INVALID/);
  assert.equal(sealIngestIndexResultEnvelope({
    contract_version: "gkos-ingest-index-result/1.0.0-draft.1",
    status: "operational_failure",
    mode: "non_strict",
    summary: null,
    active: null,
    blocked_attempt: null,
  }).status, "operational_failure");
});

test("deleting or corrupting a post-migration pointer never downgrades to planted legacy state", async (t) => {
  const state = await temporaryState(t);
  const plan = await planFor([source("legacy.md", note("018f0000-0000-7000-8000-000000000491", "Legacy"))]);
  const generation = generationInput(state, plan, "no-downgrade");
  buildGkxRetrievalGeneration(generation);
  const validLegacyPointer = await readFile(join(state, "active-retrieval.json"));
  const authority = preflightIngestAuthority(state);
  const staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", plan), ingestCoordinate(state, plan, "no-downgrade"));
  activateStagedGkxIngestGeneration(staged);
  const activePointer = await readFile(join(state, "active-ingest.json"));
  const coordinatorOptions = {
    discoverability_policy: () => "allow",
    source_discoverability_policy: () => "allow",
    runtime_policy_digest: generation.policy_digest,
    source_reader: async () => Buffer.from(plan.accepted_sources[0].chunk_input.text, "utf8"),
  };

  await rm(join(state, "active-ingest.json"));
  assert.throws(() => openIngestOwnerState(state), /ACTIVE_POINTER_MISSING/);
  assert.throws(() => retrieval.RetrievalCoordinator.openActive(state, coordinatorOptions), /ACTIVE_POINTER_MISSING/);
  await (await import("node:fs/promises")).writeFile(join(state, "active-ingest.json"),
    Buffer.concat([activePointer, Buffer.from(" ")]), { mode: 0o600 });
  assert.throws(() => openIngestOwnerState(state), /NONCANONICAL|JSON|POINTER/);
  assert.throws(() => retrieval.RetrievalCoordinator.openActive(state, coordinatorOptions), /NONCANONICAL|JSON|POINTER/);

  await (await import("node:fs/promises")).writeFile(join(state, "active-ingest.json"), activePointer, { mode: 0o600 });
  await rm(join(state, "ingest-authority.json"));
  await rm(join(state, "active-ingest.json"));
  await rm(join(state, "active-retrieval.json"));
  await (await import("node:fs/promises")).writeFile(join(state, "active-retrieval.json"), validLegacyPointer, { mode: 0o600 });
  assert.throws(() => openIngestOwnerState(state), /AUTHORITY_WITNESS_MISSING/);
  assert.throws(() => retrieval.RetrievalCoordinator.openActive(state, coordinatorOptions), /AUTHORITY_WITNESS_MISSING/);
});

test("legacy writers reject malformed fallback pointers and case-folded Phase3 evidence before provider work", async (t) => {
  const prepareMigrated = async (child, suffix) => {
    const state = await temporaryState(child);
    const plan = await planFor([source(`${suffix}.md`,
      note(`018f0000-0000-7000-8000-${String(700 + suffix.length).padStart(12, "0")}`, suffix))]);
    const input = generationInput(state, plan, suffix);
    buildGkxRetrievalGeneration(input);
    const legacy = await readFile(join(state, "active-retrieval.json"));
    const authority = preflightIngestAuthority(state);
    const staged = await stageValidatedGkxIngestGeneration(authority,
      prepareValidatedGkxIngestGeneration(authority, "non_strict", plan), ingestCoordinate(state, plan, suffix));
    activateStagedGkxIngestGeneration(staged);
    return { state, plan, input, legacy };
  };

  for (const [name, corrupt] of [
    ["malformed", Buffer.from("{bad\n", "utf8")],
    ["unknown", Buffer.from(`${retrieval.stableJson({ unknown: true })}\n`, "utf8")],
  ]) await t.test(name, async (child) => {
    const { state, plan, input } = await prepareMigrated(child, `corrupt-${name}`);
    for (const file of ["ingest-authority.json", "ingest-activation-root.json", "active-ingest.json"]) await rm(join(state, file));
    await writeFile(join(state, "active-retrieval.json"), corrupt, { mode: 0o600 });
    const before = (await readdir(state)).sort();
    let providerCalls = 0;
    const provider = {
      kind: "mcp", provider_id: "no-downgrade", model_id: "no-downgrade", dimensions: 2, timeout_ms: 1000,
      async embed() { providerCalls += 1; return []; },
    };
    assert.throws(() => buildGkxRetrievalGeneration(generationInput(state, plan, `retry-${name}`)),
      /STATE_POINTER|PHASE3_AUTHORITY/);
    await assert.rejects(indexGkxRetrievalGeneration({ ...input, state_directory: state }, provider),
      /STATE_POINTER|PHASE3_AUTHORITY/);
    assert.equal(providerCalls, 0);
    assert.deepEqual((await readdir(state)).sort(), before);
    assert.deepEqual(await readFile(join(state, "active-retrieval.json")), corrupt);
  });

  await t.test("case-folded-witness", async (child) => {
    const { state, plan, input, legacy } = await prepareMigrated(child, "case-evidence");
    await forceCaseRename(join(state, "ingest-authority.json"), join(state, "INGEST-AUTHORITY.JSON"));
    for (const file of ["ingest-activation-root.json", "active-ingest.json", "active-retrieval.json"]) await rm(join(state, file));
    await writeFile(join(state, "active-retrieval.json"), legacy, { mode: 0o600 });
    let reads = 0;
    let providerCalls = 0;
    const options = {
      discoverability_policy: () => "allow",
      source_discoverability_policy: () => "allow",
      runtime_policy_digest: input.policy_digest,
      source_reader: async () => { reads += 1; return Buffer.from(plan.accepted_sources[0].chunk_input.text, "utf8"); },
    };
    assert.throws(() => openIngestOwnerState(state), /AUTHORITY_NAME_INVALID/);
    assert.throws(() => retrieval.RetrievalCoordinator.openActive(state, options), /AUTHORITY_NAME_INVALID/);
    assert.throws(() => buildGkxRetrievalGeneration(generationInput(state, plan, "case-retry")), /AUTHORITY_NAME_INVALID/);
    await assert.rejects(indexGkxRetrievalGeneration({ ...input, state_directory: state }, {
      kind: "mcp", provider_id: "case", model_id: "case", dimensions: 2, timeout_ms: 1000,
      async embed() { providerCalls += 1; return []; },
    }), /AUTHORITY_NAME_INVALID/);
    assert.equal(reads, 0);
    assert.equal(providerCalls, 0);
    assert.equal((await readdir(state)).includes("retrieval-writer.lock"), false);
  });
});

test("owner-only POSIX modes are sealed on public, owner, and preflight state reads", async (t) => {
  if (process.platform === "win32") return;
  const state = await temporaryState(t);
  const visible = source("permission.md", note("018f0000-0000-7000-8000-000000000474", "Permission needle"));
  const plan = await planFor([visible]);
  const generation = generationInput(state, plan, "permission-seal");
  const authority = preflightIngestAuthority(state);
  const staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", plan),
    ingestCoordinate(state, plan, "permission-seal"));
  activateStagedGkxIngestGeneration(staged);
  const root = JSON.parse(await readFile(join(state, "ingest-activation-root.json"), "utf8"));
  const publicArtifacts = [
    "active-ingest.json", "ingest-authority.json", "ingest-activation-root.json",
    "active-retrieval.json", root.migration_file, basename(staged.inner_database_path),
  ];
  const ownerArtifacts = [basename(staged.owner_manifest_path), basename(staged.journal_path)];
  let readerCalls = 0;
  let vectorCalls = 0;
  let rerankCalls = 0;
  const options = {
    discoverability_policy: () => "allow",
    source_discoverability_policy: () => "allow",
    runtime_policy_digest: generation.policy_digest,
    source_reader: async () => { readerCalls += 1; return Buffer.from(visible.content, "utf8"); },
    vector_provider: {
      kind: "mcp", provider_id: "permission-vector", model_id: "permission-model", dimensions: 2, timeout_ms: 1000,
      async embed(texts) { vectorCalls += 1; return texts.map(() => Float32Array.from([1, 0])); },
    },
    rerank_provider: {
      kind: "mcp", provider_id: "permission-rerank", model_id: "permission-rerank", timeout_ms: 1000,
      async rerank(_query, inputs) {
        rerankCalls += 1;
        return inputs.map((item, index) => ({ chunk_id: item.chunk_id, score: inputs.length - index }));
      },
    },
  };
  for (const name of publicArtifacts) {
    const path = join(state, name);
    chmodSync(path, 0o644);
    try {
      assert.throws(() => retrieval.RetrievalCoordinator.openActive(state, options), /PERMISSION/iu, name);
      assert.throws(() => openIngestOwnerState(state), /PERMISSION/iu, name);
      assert.throws(() => preflightIngestAuthority(state), /PERMISSION/iu, name);
      assert.equal((await readdir(state)).includes("ingest-authority.lock"), false, name);
    } finally { chmodSync(path, 0o600); }
  }
  for (const name of ownerArtifacts) {
    const path = join(state, name);
    chmodSync(path, 0o644);
    try {
      assert.throws(() => openIngestOwnerState(state), /PERMISSION/iu, name);
      assert.throws(() => preflightIngestAuthority(state), /PERMISSION/iu, name);
      assert.equal((await readdir(state)).includes("ingest-authority.lock"), false, name);
    } finally { chmodSync(path, 0o600); }
  }
  assert.deepEqual({ readerCalls, vectorCalls, rerankCalls }, { readerCalls: 0, vectorCalls: 0, rerankCalls: 0 });
});

test("public and owner opens reject an oversized sparse active database before retrieval work", async (t) => {
  const state = await temporaryState(t);
  const visible = source("oversized.md", note("018f0000-0000-7000-8000-000000000475", "Oversized needle"));
  const plan = await planFor([visible]);
  const generation = generationInput(state, plan, "oversized-database");
  const authority = preflightIngestAuthority(state);
  const staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", plan),
    ingestCoordinate(state, plan, "oversized-database"));
  activateStagedGkxIngestGeneration(staged);
  await truncate(staged.inner_database_path, 16 * 1024 * 1024 * 1024 + 1);
  let readerCalls = 0;
  let vectorCalls = 0;
  let rerankCalls = 0;
  const options = {
    discoverability_policy: () => "allow",
    source_discoverability_policy: () => "allow",
    runtime_policy_digest: generation.policy_digest,
    source_reader: async () => { readerCalls += 1; return Buffer.from(visible.content, "utf8"); },
    vector_provider: {
      kind: "mcp", provider_id: "oversized-vector", model_id: "oversized-model", dimensions: 2, timeout_ms: 1000,
      async embed(texts) { vectorCalls += 1; return texts.map(() => Float32Array.from([1, 0])); },
    },
    rerank_provider: {
      kind: "mcp", provider_id: "oversized-rerank", model_id: "oversized-rerank", timeout_ms: 1000,
      async rerank(_query, inputs) {
        rerankCalls += 1;
        return inputs.map((item, index) => ({ chunk_id: item.chunk_id, score: inputs.length - index }));
      },
    },
  };
  assert.throws(() => retrieval.RetrievalCoordinator.openActive(state, options), /ACTIVE_DATABASE_PERMISSION_OR_IDENTITY_INVALID/);
  assert.throws(() => openIngestOwnerState(state), /INNER_DATABASE_PERMISSION_OR_IDENTITY_INVALID/);
  assert.throws(() => preflightIngestAuthority(state), /(?:STATE_ARTIFACT_INVALID|INNER_DATABASE_PERMISSION_OR_IDENTITY_INVALID)/);
  assert.deepEqual({ readerCalls, vectorCalls, rerankCalls }, { readerCalls: 0, vectorCalls: 0, rerankCalls: 0 });
});

test("rejected hidden source is byte-noninterfering after real non-strict publish and reopen", async (t) => {
  const visible = source("visible.md", note("018f0000-0000-7000-8000-000000000490", "Visible needle"));
  const hiddenSentinel = "HIDDEN_REJECTED_SENTINEL";
  const invalid = source("hidden-invalid.md", note("", hiddenSentinel).replace('uid: ""\n', ""));
  const results = [];
  const callSequences = [];
  for (const files of [[visible], [visible, invalid]]) {
    const state = await temporaryState(t);
    const plan = await planFor(files);
    const generation = generationInput(state, plan, "noninterference");
    const authority = preflightIngestAuthority(state);
    const prepared = prepareValidatedGkxIngestGeneration(authority, "non_strict", plan);
    const eligible = prepared.candidate_chunks.map((item) => item.candidate_chunk_key).sort();
    const calls = [];
    const vectorIdentity = {
      kind: "mcp", provider_id: "noninterference-vector", model_id: "noninterference-model",
      dimensions: 2, timeout_ms: 1000,
    };
    const staged = await stageValidatedGkxIngestGeneration(authority, prepared,
      ingestCoordinate(state, plan, "noninterference", eligible), {
        ...vectorIdentity,
        async embed(texts) {
          calls.push({ stage: "index", texts: [...texts] });
          assert.equal(texts.some((text) => text.includes(hiddenSentinel)), false);
          return texts.map(() => Float32Array.from([1, 0]));
        },
      });
    activateStagedGkxIngestGeneration(staged);
    const coordinator = retrieval.RetrievalCoordinator.openActive(state, {
      discoverability_policy: () => "allow",
      source_discoverability_policy: () => "allow",
      runtime_policy_digest: generation.policy_digest,
      lineage_view_freshness: "fresh",
      source_reader: async (path) => {
        calls.push({ stage: "reader", path });
        assert.equal(path, visible.relativePath);
        return Buffer.from(visible.content, "utf8");
      },
      vector_provider: {
        ...vectorIdentity,
        async embed(texts) {
          calls.push({ stage: "query_vector", texts: [...texts] });
          assert.equal(texts.some((text) => text.includes(hiddenSentinel)), false);
          return texts.map(() => Float32Array.from([1, 0]));
        },
      },
      rerank_provider: {
        kind: "mcp", provider_id: "noninterference-rerank", model_id: "noninterference-rerank-model", timeout_ms: 1000,
        async rerank(query, inputs) {
          calls.push({ stage: "rerank", query, inputs: structuredClone(inputs) });
          assert.equal(inputs.some((item) => item.text.includes(hiddenSentinel)), false);
          return inputs.map((item, index) => ({ chunk_id: item.chunk_id, score: inputs.length - index }));
        },
      },
    });
    try { results.push(await coordinator.search({ query: "needle", limit: 5 })); }
    finally { coordinator.close(); }
    callSequences.push(calls);
  }
  assert.deepEqual(results[1], results[0]);
  assert.deepEqual(callSequences[1], callSequences[0]);
  assert.deepEqual(callSequences[0].map((call) => call.stage), ["index", "reader", "query_vector", "rerank"]);
  assert.equal(retrieval.stableJson(callSequences).includes(hiddenSentinel), false);
});

test("ordinary active search ignores owner-only blocked status and rejection-journal availability", async (t) => {
  const state = await temporaryState(t);
  const visible = source("ordinary.md", note("018f0000-0000-7000-8000-000000000487", "Ordinary needle"));
  const plan = await planFor([visible]);
  const coordinate = generationInput(state, plan, "ordinary-search");
  let authority = preflightIngestAuthority(state);
  const staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", plan), ingestCoordinate(state, plan, "ordinary-search"));
  activateStagedGkxIngestGeneration(staged);
  const options = {
    discoverability_policy: () => "allow",
    source_discoverability_policy: () => "allow",
    runtime_policy_digest: coordinate.policy_digest,
    lineage_view_freshness: "fresh",
    source_reader: async (path) => {
      assert.equal(path, visible.relativePath);
      return Buffer.from(visible.content, "utf8");
    },
  };
  let coordinator = retrieval.RetrievalCoordinator.openActive(state, options);
  const baseline = await coordinator.search({ query: "needle", limit: 5 });
  coordinator.close();

  const invalid = await planFor([source("blocked-hidden.md", note("", "Blocked hidden").replace('uid: ""\n', ""))]);
  authority = preflightIngestAuthority(state);
  recordBlockedIngestAttempt(authority, invalid);
  await rm(staged.journal_path);
  coordinator = retrieval.RetrievalCoordinator.openActive(state, options);
  const afterOwnerOnlyChanges = await coordinator.search({ query: "needle", limit: 5 });
  coordinator.close();
  assert.deepEqual(afterOwnerOnlyChanges, baseline);
  assert.throws(() => openIngestOwnerState(state), /REJECTION_JOURNAL|MISSING|ENOENT/);
});

test("ordinary active resolution caps migration authority before any reader or provider work", async (t) => {
  const state = await temporaryState(t);
  const visible = source("bounded.md", note("018f0000-0000-7000-8000-000000000484", "Bounded migration"));
  const plan = await planFor([visible]);
  const coordinate = generationInput(state, plan, "bounded-migration");
  const authority = preflightIngestAuthority(state);
  const staged = await stageValidatedGkxIngestGeneration(authority,
    prepareValidatedGkxIngestGeneration(authority, "non_strict", plan), ingestCoordinate(state, plan, "bounded-migration"));
  activateStagedGkxIngestGeneration(staged);
  const root = JSON.parse(await readFile(join(state, "ingest-activation-root.json"), "utf8"));
  await writeFile(join(state, root.migration_file), Buffer.alloc(1_048_577, 0x20));
  let readerCalls = 0;
  let providerCalls = 0;
  const options = {
    discoverability_policy: () => "allow",
    source_discoverability_policy: () => "allow",
    runtime_policy_digest: coordinate.policy_digest,
    source_reader: async () => { readerCalls += 1; return Buffer.from(visible.content, "utf8"); },
    vector_provider: {
      kind: "mcp", provider_id: "bounded-vector", model_id: "bounded-vector-model", dimensions: 2, timeout_ms: 1000,
      async embed() { providerCalls += 1; return []; },
    },
    rerank_provider: {
      kind: "mcp", provider_id: "bounded-rerank", model_id: "bounded-rerank-model", timeout_ms: 1000,
      async rerank() { providerCalls += 1; return []; },
    },
  };
  assert.throws(() => retrieval.RetrievalCoordinator.openActive(state, options), /MIGRATION_SIZE_INVALID/);
  assert.equal(readerCalls, 0);
  assert.equal(providerCalls, 0);
});
