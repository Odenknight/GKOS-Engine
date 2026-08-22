import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  RETRIEVAL_CONTRACT_VERSION,
  RETRIEVAL_LINEAGE_CONTRACT_VERSION,
  RetrievalCoordinator,
  chunkMarkdown,
  retrievalCanonicalDigest,
  stableJson,
  vaultSourceReader,
} from "../dist/retrieval.mjs";
import {
  bindGkxRetrievalCandidateChunks,
  buildGkxRetrievalGeneration,
  indexGkxRetrievalGeneration,
  projectGkxRetrievalCorpus,
} from "../dist/retrieval-host.mjs";

const OLD = "018f0000-0000-7000-8000-000000000301";
const NEW = "018f0000-0000-7000-8000-000000000302";
const FIXTURE_POLICY_DIGEST = retrievalCanonicalDigest({ policy: "fixture" });

function note(uid, title, createdAt, { extra = "", body = `# ${title}\nPolicy Café 😀\n`, sensitivity = "public" } = {}) {
  return `---\ngkx_version: "2.3"\nuid: "${uid}"\ntitle: "${title}"\ntype: "policy"\ncreated_at: "${createdAt}"\nepistemic_state: "reported"\nsensitivity: "${sensitivity}"\n${extra}---\n${body}`;
}

function source(relativePath, content, createdAt) {
  return { relativePath, extension: "md", content, createdTime: Date.parse(createdAt) };
}

function resealCandidateSource(candidate) {
  const { candidate_digest: _digest, ...base } = candidate;
  candidate.candidate_digest = retrievalCanonicalDigest(base);
}

function candidateChunksFor(projection) {
  return projection.sources.flatMap((item) => bindGkxRetrievalCandidateChunks(
    item.record_key,
    chunkMarkdown(item.chunk_input),
  ));
}

function candidateGenerationInput(root, name, projection, candidateChunks = candidateChunksFor(projection)) {
  return {
    state_directory: join(root, name),
    vault_id: "temporal-vault",
    source_snapshot_digest: retrievalCanonicalDigest(projection.sources.map((item) => ({
      record_key: item.record_key,
      candidate_digest: item.candidate_source.candidate_digest,
    }))),
    configuration_digest: retrievalCanonicalDigest({ mode: "fts", phase: 2 }),
    policy_digest: FIXTURE_POLICY_DIGEST,
    lexical_backend: "sqlite_lexical_scan",
    candidate_sources: projection.sources.map((item) => item.candidate_source),
    candidate_declarations: projection.declarations,
    candidate_chunks: candidateChunks,
    embedding_eligible_candidate_chunk_keys: candidateChunks.map((item) => item.candidate_chunk_key),
  };
}

async function buildProjected(root, name, files) {
  const projection = projectGkxRetrievalCorpus(files);
  assert.deepEqual(projection.rejections, []);
  for (const file of files) {
    const path = join(root, file.relativePath);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, file.content, "utf8");
  }
  const chunks = candidateChunksFor(projection);
  const sourceSnapshot = projection.sources.map((item) => ({
    record_key: item.record_key,
    source_id: item.candidate_source.source_id,
    source_path: item.candidate_source.source_path,
    source_digest: item.candidate_source.source_digest,
    assertion_time: item.candidate_source.assertion_time,
    valid_from: item.candidate_source.valid_from,
  }));
  const generation = buildGkxRetrievalGeneration({
    ...candidateGenerationInput(root, name, projection, chunks),
    source_snapshot_digest: retrievalCanonicalDigest(sourceSnapshot),
  });
  return { generation, projection, chunks };
}

function coordinator(databasePath, root, sourcePolicy = () => "allow", extra = {}) {
  return new RetrievalCoordinator(databasePath, {
    discoverability_policy: () => "allow",
    source_discoverability_policy: sourcePolicy,
    runtime_policy_digest: FIXTURE_POLICY_DIGEST,
    source_reader: vaultSourceReader(root),
    ...extra,
  });
}

test("Phase-2 is additive: schema-3 lineage search retains Phase-1 coordinates separately", async () => {
  assert.equal(RETRIEVAL_CONTRACT_VERSION, "gkos-retrieval/1.0.0-draft.1");
  assert.equal(RETRIEVAL_LINEAGE_CONTRACT_VERSION, "gkos-retrieval/1.0.0-draft.2");
  const root = await mkdtemp(join(tmpdir(), "gkos-temporal-boundary-"));
  const files = [
    source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
    source("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", { extra: `supersedes:\n  - "${OLD}"\n` }), "2026-08-01T00:00:00Z"),
  ];
  const { generation } = await buildProjected(root, "state", files);
  assert.equal(generation.manifest.contract_version, RETRIEVAL_LINEAGE_CONTRACT_VERSION);
  assert.equal(generation.manifest.projection_schema_version, 3);
  assert.equal(generation.manifest.candidate_source_count, 2);
  const service = coordinator(generation.database_path, root);
  const historical = await service.search({ query: "Policy Café", as_of: "2026-07-15T00:00-04:00" });
  assert.equal(historical.contract_version, RETRIEVAL_LINEAGE_CONTRACT_VERSION);
  assert.equal(historical.temporal.as_of, "2026-07-15T04:00:00.000Z");
  assert.equal(historical.temporal.coverage, "sufficient");
  assert.deepEqual(historical.hits.map((hit) => hit.chunk.source_id), [OLD]);
  assert.equal(historical.hits[0].chunk.valid_to, null, "future successor is outside the authorized temporal view");
  assert.equal(historical.hits[0].provenance.valid_to, historical.hits[0].chunk.valid_to);
  assert.deepEqual(historical.hits[0].chunk.superseded_by, []);
  assert.deepEqual(historical.hits[0].provenance.superseded_by, []);
  assert.equal(historical.hits[0].provenance.ledger_binding_verified, false);
  assert.equal("ledger_entry_sha256" in historical.hits[0].provenance, false);

  const boundary = await service.search({ query: "Policy Café", as_of: "2026-08-01T00:00Z" });
  assert.deepEqual(boundary.hits.map((hit) => hit.chunk.source_id), [NEW]);
  assert.equal(boundary.hits[0].provenance.temporal_state, "current");
  assert.deepEqual(boundary.hits[0].provenance.supersedes, [OLD], "a non-future authorized predecessor remains visible from its successor");
  service.close();
});

test("schema-3 freshness is scoped, validated, and defaults to unverified", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-temporal-freshness-"));
  const built = await buildProjected(root, "state", [
    source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
  ]);
  const request = { query: "Policy", as_of: "2026-07-15T00:00Z" };

  const unverifiedService = coordinator(built.generation.database_path, root);
  const unverified = await unverifiedService.search(request);
  assert.equal(unverified.projection_freshness, "unverified");
  assert.equal(unverified.confidence.low_confidence, true);
  assert.ok(unverified.confidence.reason_codes.includes("PROJECTION_FRESHNESS_UNVERIFIED"));
  unverifiedService.close();

  const freshService = coordinator(built.generation.database_path, root, () => "allow", { lineage_view_freshness: "fresh" });
  const fresh = await freshService.search(request);
  assert.equal(fresh.projection_freshness, "fresh");
  assert.equal(fresh.confidence.reason_codes.includes("PROJECTION_FRESHNESS_UNVERIFIED"), false);
  freshService.close();

  const staleService = coordinator(built.generation.database_path, root, () => "allow", { lineage_view_freshness: "stale" });
  const stale = await staleService.search(request);
  assert.equal(stale.projection_freshness, "stale");
  assert.ok(stale.confidence.reason_codes.includes("STALE_PROJECTION"));
  staleService.close();

  assert.throws(
    () => coordinator(built.generation.database_path, root, () => "allow", { lineage_view_freshness: "invented" }),
    /lineage_view_freshness is invalid/,
  );
});

test("schema-3 indexing degrades only provider failures and never retries publication failures as FTS", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-temporal-index-boundary-"));
  const projected = projectGkxRetrievalCorpus([
    source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
  ]);
  const chunks = candidateChunksFor(projected);
  const base = {
    ...candidateGenerationInput(root, "unused", projected, chunks),
    source_snapshot_digest: retrievalCanonicalDigest({ fixture: "provider-boundary" }),
  };
  delete base.state_directory;

  const degradedState = join(root, "degraded-state");
  const degraded = await indexGkxRetrievalGeneration({ ...base, state_directory: degradedState }, {
    kind: "mcp", provider_id: "unavailable", model_id: "fixture-2d", dimensions: 2, timeout_ms: 100,
    async embed() { throw new Error("provider unavailable"); },
  });
  assert.equal(degraded.vector_stage.state, "degraded");
  assert.deepEqual(degraded.vector_stage.reason_codes, ["VECTOR_UNAVAILABLE"]);
  assert.equal(existsSync(degraded.generation.pointer_path), true, "provider outage still publishes one coherent lexical generation");

  let dimensionReads = 0;
  let providerCalls = 0;
  const buildFailureProvider = {
    kind: "mcp", provider_id: "build-boundary", model_id: "fixture-2d", timeout_ms: 100,
    get dimensions() { dimensionReads++; return dimensionReads <= 4 ? 2 : 0; },
    async embed(texts) { providerCalls++; return texts.map(() => Float32Array.of(1, 0)); },
  };
  const rejectedState = join(root, "rejected-state");
  await assert.rejects(
    indexGkxRetrievalGeneration({ ...base, state_directory: rejectedState }, buildFailureProvider),
    /VECTOR_GENERATION_PARTIAL|VECTOR_MANIFEST_IDENTITY_INVALID/,
  );
  assert.ok(providerCalls > 0, "fixture reaches the vector-bearing publication boundary");
  assert.equal(existsSync(rejectedState), false, "publication failure creates no state or active pointer");
});

test("schema-3 vector eligibility is policy-bound before provider and fails closed on runtime-policy drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-temporal-vector-eligibility-"));
  const sentinel = "SENTINEL_DENIED_VECTOR_TEXT";
  const files = [
    source("public.md", note(OLD, "Public", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
    source("secret.md", note(NEW, "Secret", "2026-07-02T00:00:00Z", { sensitivity: "secret", body: `# Secret\n${sentinel}\n` }), "2026-07-02T00:00:00Z"),
  ];
  for (const file of files) await writeFile(join(root, file.relativePath), file.content, "utf8");
  const projected = projectGkxRetrievalCorpus(files);
  const chunks = candidateChunksFor(projected);
  const publicRecordKeys = new Set(projected.sources
    .filter((item) => item.candidate_source.source_metadata.sensitivity === "public")
    .map((item) => item.record_key));
  const embeddingEligible = chunks
    .filter((candidate) => publicRecordKeys.has(candidate.record_key))
    .map((candidate) => candidate.candidate_chunk_key);
  const seen = [];
  const provider = {
    kind: "mcp", provider_id: "fixture-vector", model_id: "fixture-2d", dimensions: 2, timeout_ms: 100,
    async embed(texts) { seen.push(...texts); return texts.map(() => Float32Array.of(1, 0)); },
  };
  const indexed = await indexGkxRetrievalGeneration({
    ...candidateGenerationInput(root, "state", projected, chunks),
    source_snapshot_digest: retrievalCanonicalDigest({ fixture: "vector-eligibility" }),
    configuration_digest: retrievalCanonicalDigest({ mode: "hybrid", phase: 2 }),
    embedding_eligible_candidate_chunk_keys: embeddingEligible,
  }, provider);
  assert.equal(indexed.generation.manifest.embedding_eligible_candidate_chunk_count, embeddingEligible.length);
  assert.equal(seen.some((text) => text.includes(sentinel)), false);

  const publicOnly = coordinator(indexed.generation.database_path, root, (record) => record.metadata.sensitivity === "public" ? "allow" : "deny", {
    discoverability_policy: (record) => record.metadata.sensitivity === "public" ? "allow" : "deny",
    vector_provider: provider,
  });
  const publicResult = await publicOnly.search({ query: "Policy" });
  assert.equal(publicResult.stages.vector.state, "active");
  assert.deepEqual(publicResult.hits.map((hit) => hit.chunk.source_id), [OLD]);
  publicOnly.close();

  const callsBeforeDrift = seen.length;
  const drifted = coordinator(indexed.generation.database_path, root, () => "allow", {
    discoverability_policy: () => "allow",
    vector_provider: provider,
  });
  await assert.rejects(drifted.search({ query: "Policy" }), /RETRIEVAL_RUNTIME_VECTOR_ELIGIBILITY_MISMATCH/);
  assert.equal(seen.length, callsBeforeDrift, "runtime policy drift fails before query provider work");
  drifted.close();

  const writer = new DatabaseSync(indexed.generation.database_path);
  try { writer.exec("DELETE FROM embedding_eligible_candidate_chunks;"); }
  finally { writer.close(); }
  assert.throws(
    () => coordinator(indexed.generation.database_path, root),
    /VECTOR_ELIGIBILITY_INVALID|VECTOR_GENERATION_PARTIAL|RETRIEVAL_PROJECTION_DIGEST_MISMATCH/,
    "tampered eligibility cannot reopen as a coherent policy-bound vector generation",
  );
});

test("hidden successor is noninterfering in chunk, provenance, count, confidence, and policy input", async () => {
  const relatedRoot = await mkdtemp(join(tmpdir(), "gkos-temporal-hidden-"));
  const absentRoot = await mkdtemp(join(tmpdir(), "gkos-temporal-absent-"));
  const old = source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const hidden = source("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", {
    extra: `supersedes:\n  - "${OLD}"\n`, sensitivity: "secret",
  }), "2026-08-01T00:00:00Z");
  const related = await buildProjected(relatedRoot, "state", [old, hidden]);
  const absent = await buildProjected(absentRoot, "state", [old]);
  const observed = [];
  const publicOnly = (record) => {
    observed.push(record);
    return record.metadata.sensitivity === "public" ? "allow" : "deny";
  };
  const relatedService = coordinator(related.generation.database_path, relatedRoot, publicOnly);
  const absentService = coordinator(absent.generation.database_path, absentRoot, publicOnly);
  const request = { query: "Policy Café", as_of: "2026-08-15T00:00Z" };
  const withHidden = await relatedService.search(request);
  const withoutHidden = await absentService.search(request);
  assert.deepEqual(withHidden, withoutHidden, "denied successor cannot change any ordinary search byte/field");
  assert.deepEqual(withHidden.hits, withoutHidden.hits);
  assert.deepEqual(withHidden.confidence, withoutHidden.confidence);
  assert.equal(withHidden.eligible_result_count, withoutHidden.eligible_result_count);
  assert.deepEqual(withHidden.temporal, withoutHidden.temporal);
  assert.ok(observed.every((record) => record.valid_to === null && record.supersedes.length === 0 && record.superseded_by.length === 0));
  assert.ok(observed.every(Object.isFrozen));
  relatedService.close();
  absentService.close();
});

test("schema-3 requires source and sanitized chunk policy gates before temporal projection", async () => {
  const relatedRoot = await mkdtemp(join(tmpdir(), "gkos-temporal-dual-policy-"));
  const absentRoot = await mkdtemp(join(tmpdir(), "gkos-temporal-dual-policy-absent-"));
  const old = source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const successor = source("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", {
    extra: `supersedes:\n  - "${OLD}"\n`,
  }), "2026-08-01T00:00:00Z");
  const related = await buildProjected(relatedRoot, "state", [old, successor]);
  const absent = await buildProjected(absentRoot, "state", [old]);
  const observed = [];
  const denySuccessor = (chunk) => {
    observed.push(chunk);
    return chunk.source_id === NEW ? "deny" : "allow";
  };
  const relatedService = new RetrievalCoordinator(related.generation.database_path, {
    discoverability_policy: denySuccessor,
    source_discoverability_policy: () => "allow",
    runtime_policy_digest: FIXTURE_POLICY_DIGEST,
    lineage_view_freshness: "fresh",
    source_reader: vaultSourceReader(relatedRoot),
  });
  const absentService = new RetrievalCoordinator(absent.generation.database_path, {
    discoverability_policy: () => "allow",
    source_discoverability_policy: () => "allow",
    runtime_policy_digest: FIXTURE_POLICY_DIGEST,
    lineage_view_freshness: "fresh",
    source_reader: vaultSourceReader(absentRoot),
  });
  const request = { query: "Policy", as_of: "2026-08-15T00:00Z" };
  assert.deepEqual(await relatedService.search(request), await absentService.search(request), "chunk-denied successor is byte-identical to absence");
  assert.ok(observed.every((chunk) => Object.isFrozen(chunk) && chunk.valid_to === null && chunk.supersedes.length === 0 && chunk.superseded_by.length === 0));
  relatedService.close();
  absentService.close();

  for (const decision of ["deny", "indeterminate", "throw"]) {
    let reads = 0;
    const service = new RetrievalCoordinator(absent.generation.database_path, {
      discoverability_policy: decision === "throw" ? () => { throw new Error("policy failed"); } : () => decision,
      source_discoverability_policy: () => "allow",
      runtime_policy_digest: FIXTURE_POLICY_DIGEST,
      source_reader: async () => { reads++; return Buffer.from(old.content); },
    });
    const result = await service.search(request);
    assert.deepEqual(result.hits, []);
    assert.ok(result.confidence.reason_codes.includes("NO_ELIGIBLE_RESULTS"));
    assert.equal(reads, 0, `${decision} chunk policy must fail before live content work`);
    service.close();
  }

  assert.throws(() => new RetrievalCoordinator(absent.generation.database_path, {
    discoverability_policy: () => "allow",
    source_discoverability_policy: () => "allow",
    runtime_policy_digest: retrievalCanonicalDigest({ policy: "different" }),
    source_reader: vaultSourceReader(absentRoot),
  }), /RETRIEVAL_RUNTIME_POLICY_DIGEST_MISMATCH/);
});

test("hidden agent, MOC, and extension metadata are noninterfering at both policy gates", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-temporal-policy-metadata-"));
  const canonical = source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  await writeFile(join(root, canonical.relativePath), canonical.content, "utf8");
  const projection = projectGkxRetrievalCorpus([canonical]);
  const projected = projection.sources[0];

  const buildVariant = (name, hiddenId) => {
    const metadata = {
      ...projected.candidate_source.source_metadata,
      moc_relationships: [hiddenId],
      author_agent_id: hiddenId,
      hidden_relationship_extension: { endpoint: hiddenId },
    };
    const candidateSource = structuredClone(projected.candidate_source);
    candidateSource.source_metadata = metadata;
    resealCandidateSource(candidateSource);
    const chunks = bindGkxRetrievalCandidateChunks(
      projected.record_key,
      chunkMarkdown({ ...projected.chunk_input, metadata }),
    );
    return buildGkxRetrievalGeneration({
      ...candidateGenerationInput(root, name, projection, chunks),
      source_snapshot_digest: retrievalCanonicalDigest({ source: candidateSource.source_digest }),
      candidate_sources: [candidateSource],
    });
  };
  const correct = buildVariant("correct", "018f0000-0000-7000-8000-000000009901");
  const wrong = buildVariant("wrong", "018f0000-0000-7000-8000-000000009902");
  assert.notEqual(correct.manifest.projection_digest, wrong.manifest.projection_digest, "physical stores bind the full trusted metadata");
  const observed = [];
  const options = {
    discoverability_policy: (record) => { observed.push(record); return "allow"; },
    source_discoverability_policy: (record) => { observed.push(record); return "allow"; },
    runtime_policy_digest: FIXTURE_POLICY_DIGEST,
    lineage_view_freshness: "fresh",
    source_reader: vaultSourceReader(root),
  };
  const correctService = new RetrievalCoordinator(correct.database_path, options);
  const wrongService = new RetrievalCoordinator(wrong.database_path, options);
  const correctResult = await correctService.search({ query: "Policy" });
  const wrongResult = await wrongService.search({ query: "Policy" });
  assert.deepEqual(correctResult, wrongResult, "guessed hidden identifiers cannot alter ordinary output or its scoped coordinate");
  for (const record of observed) {
    assert.equal("moc_relationships" in record.metadata, false);
    assert.equal("author_agent_id" in record.metadata, false);
    assert.equal("hidden_relationship_extension" in record.metadata, false);
  }
  correctService.close();
  wrongService.close();
});

test("zero-chunk successor participates in temporal projection without fabricating a hit", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-temporal-blank-"));
  const files = [
    source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
    source("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", {
      extra: `supersedes:\n  - "${OLD}"\n`, body: "",
    }), "2026-08-01T00:00:00Z"),
  ];
  const { generation, chunks } = await buildProjected(root, "state", files);
  assert.equal(chunks.filter((candidate) => candidate.chunk.source_id === NEW).length, 0);
  assert.equal(generation.manifest.represented_candidate_source_count, 1);
  assert.equal(generation.manifest.candidate_source_count, 2);
  const service = coordinator(generation.database_path, root);
  const result = await service.search({ query: "Policy", as_of: "2026-08-15T00:00Z" });
  assert.deepEqual(result.hits, []);
  assert.equal(result.temporal.coverage, "sufficient");
  assert.ok(result.confidence.reason_codes.includes("NO_ELIGIBLE_RESULTS"));
  service.close();
});

test("schema-3 store reopens zero-chunk candidates, retains collisions for scoped conflict, and rejects tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-temporal-store-integrity-"));
  const blankA = source("blank-a.md", note(OLD, "Blank A", "2026-07-01T00:00:00Z", { body: "" }), "2026-07-01T00:00:00Z");
  const blankB = source("blank-b.md", note(NEW, "Blank B", "2026-08-01T00:00:00Z", { body: "" }), "2026-08-01T00:00:00Z");
  const built = await buildProjected(root, "zero-state", [blankA]);
  assert.equal(built.generation.manifest.represented_candidate_source_count, 0);
  assert.equal(built.generation.manifest.candidate_source_count, 1);
  const reopened = coordinator(built.generation.database_path, root);
  assert.deepEqual((await reopened.search({ query: "missing" })).hits, []);
  reopened.close();

  const projected = projectGkxRetrievalCorpus([blankA, blankB]);
  const collidingSources = projected.sources.map((item) => structuredClone(item.candidate_source));
  collidingSources.find((item) => item.source_id === NEW).source_path = "blank-a.md";
  resealCandidateSource(collidingSources.find((item) => item.source_id === NEW));
  const collisionGeneration = buildGkxRetrievalGeneration({
    ...candidateGenerationInput(root, "duplicate-state", projected, []),
    source_snapshot_digest: retrievalCanonicalDigest({ fixture: "duplicate-path" }),
    candidate_sources: collidingSources,
  });
  assert.equal(collisionGeneration.manifest.candidate_source_count, 2, "physical candidates retain colliding public paths");
  const collisionService = coordinator(collisionGeneration.database_path, root);
  await assert.rejects(
    collisionService.search({ query: "missing" }),
    /RETRIEVAL_AUTHORIZED_VIEW_CONFLICT/,
  );
  collisionService.close();

  const writer = new DatabaseSync(built.generation.database_path);
  try {
    writer.prepare("UPDATE candidate_sources SET candidate_json = ? WHERE source_id = ?").run("{}", OLD);
  } finally {
    writer.close();
  }
  assert.throws(() => coordinator(built.generation.database_path, root), /GKX_RETRIEVAL_CANDIDATE|CANDIDATE_SOURCE/);
});

test("schema-3 manifests bind and verify the pinned Standard and projection profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-temporal-authority-manifest-"));
  const fixture = source("authority.md", note(OLD, "Authority", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const expected = {
    gkx_standard_commit: "a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6",
    gkx_projection_profile: "gkx-2.3-validating-projection",
  };
  for (const field of Object.keys(expected)) {
    const built = await buildProjected(root, `state-${field}`, [fixture]);
    assert.equal(built.generation.manifest[field], expected[field]);
    const writer = new DatabaseSync(built.generation.database_path);
    try {
      const row = writer.prepare("SELECT manifest_json FROM projection_manifest WHERE singleton = 1").get();
      const manifest = JSON.parse(String(row.manifest_json));
      manifest[field] = `tampered-${field}`;
      writer.prepare("UPDATE projection_manifest SET manifest_json = ? WHERE singleton = 1").run(stableJson(manifest));
    } finally {
      writer.close();
    }
    assert.throws(() => coordinator(built.generation.database_path, root), /RETRIEVAL_GKX_AUTHORITY_COORDINATE_MISMATCH/);
  }
});

test("persisted schema-3 declaration tampering cannot disappear during reopen", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-temporal-inverse-tamper-"));
  const files = [
    source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
    source("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", { extra: `supersedes:\n  - "${OLD}"\n` }), "2026-08-01T00:00:00Z"),
  ];
  const built = await buildProjected(root, "state", files);
  assert.equal(built.projection.declarations.length, 1);
  const writer = new DatabaseSync(built.generation.database_path);
  try {
    writer.prepare("UPDATE candidate_declarations SET declaration_json = ?").run("{}");
  } finally {
    writer.close();
  }
  assert.throws(() => coordinator(built.generation.database_path, root), /GKX_RETRIEVAL_CANDIDATE_DECLARATION/);
});

test("unknown authorized validity and an empty temporal interval fail before source/provider work", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-temporal-coverage-"));
  const fixture = source("unknown.md", note(OLD, "Unknown", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  await writeFile(join(root, fixture.relativePath), fixture.content, "utf8");
  const projected = projectGkxRetrievalCorpus([fixture]);
  const unknown = structuredClone(projected.sources[0].candidate_source);
  unknown.valid_from = null;
  unknown.validity_origin = "unknown";
  unknown.reason_codes = unknown.reason_codes
    .filter((reason) => !reason.startsWith("VALIDITY_"))
    .concat("VALIDITY_UNKNOWN")
    .sort();
  resealCandidateSource(unknown);
  const chunks = candidateChunksFor(projected);
  for (const candidate of chunks) candidate.chunk.valid_from = null;
  const generation = buildGkxRetrievalGeneration({
    ...candidateGenerationInput(root, "state", projected, chunks),
    candidate_sources: [unknown],
  });
  let reads = 0;
  let providerCalls = 0;
  const service = new RetrievalCoordinator(generation.database_path, {
    discoverability_policy: () => "allow",
    source_discoverability_policy: () => "allow",
    runtime_policy_digest: FIXTURE_POLICY_DIGEST,
    source_reader: async () => { reads++; return Buffer.from(fixture.content); },
    vector_provider: {
      kind: "mcp", provider_id: "fixture", model_id: "fixture", dimensions: 1, timeout_ms: 100,
      async embed() { providerCalls++; return [Float32Array.of(1)]; },
    },
  });
  const result = await service.search({ query: "Policy", as_of: "2026-08-20T12:34Z" });
  assert.deepEqual(result.hits, []);
  assert.equal(result.temporal.coverage, "insufficient");
  assert.deepEqual(result.temporal.reason_codes, ["TEMPORAL_COVERAGE_INSUFFICIENT"]);
  assert.equal(reads, 0);
  assert.equal(providerCalls, 0);
  service.close();
});

test("source policy mutation and errors fail closed without changing the verified projection", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-temporal-policy-mutation-"));
  const built = await buildProjected(root, "state", [
    source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
  ]);
  const before = built.generation.manifest.projection_digest;
  const service = coordinator(built.generation.database_path, root, (record) => {
    record.metadata.sensitivity = "secret";
    return "allow";
  });
  const result = await service.search({ query: "Policy", as_of: "2026-07-15T00:00Z" });
  const repeated = await service.search({ query: "Policy", as_of: "2026-07-15T00:00Z" });
  assert.deepEqual(result.hits, []);
  assert.equal(result.temporal.coverage, "not_evaluated");
  assert.equal(result.projection_digest, repeated.projection_digest, "denied authorized-view coordinate is stable");
  assert.equal(built.generation.manifest.projection_digest, before, "policy callback cannot mutate the verified physical generation");
  service.close();
});

test("no-as-of empty and stale views retain not_requested temporal coverage", async () => {
  const blankRoot = await mkdtemp(join(tmpdir(), "gkos-temporal-no-asof-blank-"));
  const blank = source("blank.md", note(OLD, "Blank", "2026-07-01T00:00:00Z", { body: "" }), "2026-07-01T00:00:00Z");
  const blankBuild = await buildProjected(blankRoot, "state", [blank]);
  const blankService = coordinator(blankBuild.generation.database_path, blankRoot);
  const empty = await blankService.search({ query: "Policy" });
  assert.deepEqual(empty.hits, []);
  assert.deepEqual(empty.temporal, { as_of: null, coverage: "not_requested", reason_codes: [] });
  blankService.close();

  const staleRoot = await mkdtemp(join(tmpdir(), "gkos-temporal-no-asof-stale-"));
  const staleSource = source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  const staleBuild = await buildProjected(staleRoot, "state", [staleSource]);
  await writeFile(join(staleRoot, "old.md"), `${staleSource.content}\nchanged`, "utf8");
  const staleService = coordinator(staleBuild.generation.database_path, staleRoot);
  const stale = await staleService.search({ query: "Policy" });
  assert.deepEqual(stale.hits, []);
  assert.equal(stale.projection_freshness, "stale");
  assert.deepEqual(stale.temporal, { as_of: null, coverage: "not_requested", reason_codes: [] });
  staleService.close();
});

test("complete provenance-bearing results and parent assertions obey the serialized byte budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-temporal-result-budget-"));
  const files = Array.from({ length: 24 }, (_, index) => {
    const suffix = String(index + 1).padStart(12, "0");
    const uid = `018f0000-0000-7000-8000-${suffix}`;
    const title = `Budget ${String(index + 1).padStart(2, "0")} ${"evidence".repeat(8)}`;
    return source(
      `budget-${String(index + 1).padStart(2, "0")}.md`,
      note(uid, title, "2026-07-01T00:00:00Z", {
        body: `# ${title}\nParent context ${"context ".repeat(16)}\n\n## Assertion\nPolicy bounded result evidence ${"detail ".repeat(12)}\n`,
      }),
      "2026-07-01T00:00:00Z",
    );
  });
  const built = await buildProjected(root, "state", files);
  const service = coordinator(built.generation.database_path, root, () => "allow", {
    lineage_view_freshness: "fresh",
    max_result_bytes: 16_384,
  });
  const result = await service.search({ query: "Policy", limit: 100, parent_expansion: true });
  assert.ok(result.hits.length > 0 && result.hits.length < files.length, "winner-first truncation retains only complete fitting hits");
  assert.ok(result.hits.some((hit) => hit.parent_context?.provenance), "a retained parent is lineage-sealed and included in accounting");
  assert.ok(Buffer.byteLength(stableJson(result), "utf8") <= 16_384, "the entire serialized envelope, not only text, is bounded");
  service.close();
});

test("schema-3 candidate envelopes reject accessors, proxies, exotic JSON, and forged invariants before state", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-temporal-envelope-invalid-"));
  const projected = projectGkxRetrievalCorpus([
    source("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z"),
  ]);
  const stored = projected.sources[0].candidate_source;
  const chunks = candidateChunksFor(projected);
  let reads = 0;
  const topAccessor = { ...stored };
  delete topAccessor.source_id;
  Object.defineProperty(topAccessor, "source_id", { enumerable: true, get() { reads++; return OLD; } });
  const proxied = new Proxy(stored, { get(target, key, receiver) { reads++; return Reflect.get(target, key, receiver); } });
  const nestedAccessorMetadata = { ...stored.source_metadata };
  delete nestedAccessorMetadata.title;
  Object.defineProperty(nestedAccessorMetadata, "title", { enumerable: true, get() { reads++; return "Old"; } });
  const sparseReasons = new Array(stored.reason_codes.length);
  sparseReasons[0] = stored.reason_codes[0];
  const symbolMetadata = { ...stored.source_metadata };
  symbolMetadata[Symbol("hidden")] = "secret";
  const cyclicMetadata = { ...stored.source_metadata };
  cyclicMetadata.loop = cyclicMetadata;
  const missingTitleMetadata = { ...stored.source_metadata };
  delete missingTitleMetadata.title;
  const missingSensitivityMetadata = { ...stored.source_metadata };
  delete missingSensitivityMetadata.sensitivity;
  const missingAuthoredMetadata = { ...stored.source_metadata };
  delete missingAuthoredMetadata.authored_at;
  const candidates = [
    topAccessor,
    proxied,
    { ...stored, source_metadata: nestedAccessorMetadata },
    { ...stored, reason_codes: sparseReasons },
    { ...stored, source_metadata: symbolMetadata },
    { ...stored, source_metadata: { ...stored.source_metadata, exotic: new Date(0) } },
    { ...stored, source_metadata: cyclicMetadata },
    { ...stored, source_metadata: { ...stored.source_metadata, quality: 9_007_199_254_740_992 } },
    { ...stored, lineage_id: "derived:forged-lineage" },
    { ...stored, assertion_time: "2026-06-30T20:00:00-04:00" },
    { ...stored, source_metadata: { ...stored.source_metadata, authored_at: "2026-07-02T00:00:00.000Z" } },
    { ...stored, source_metadata: missingTitleMetadata },
    { ...stored, source_metadata: missingSensitivityMetadata },
    { ...stored, source_metadata: { ...stored.source_metadata, authoritative: false } },
    { ...stored, assertion_time: null, assertion_origin: null },
    { ...stored, source_metadata: missingAuthoredMetadata },
    {
      ...stored,
      assertion_time: "2026-02-30T00:00:00.000Z",
      source_metadata: { ...stored.source_metadata, authored_at: "2026-02-30T00:00:00.000Z" },
    },
    { ...stored, valid_from: "2026-02-30T00:00:00.000Z" },
    { ...stored, valid_from: "2026-07-02T00:00:00.000Z" },
    { ...stored, validity_origin: "source_created_time" },
    {
      ...stored,
      assertion_time: null,
      assertion_origin: null,
      source_metadata: missingAuthoredMetadata,
    },
  ];
  for (const [index, candidate] of candidates.entries()) {
    const state = join(root, `state-${index}`);
    assert.throws(() => buildGkxRetrievalGeneration({
      ...candidateGenerationInput(root, `state-${index}`, projected, chunks),
      source_snapshot_digest: retrievalCanonicalDigest({ index }),
      candidate_sources: [candidate],
    }));
    assert.equal(existsSync(state), false, `candidate ${index} created derived state`);
  }
  assert.equal(reads, 0, "descriptor/proxy rejection executes no caller getter or proxy get trap");

  let providerCalls = 0;
  const provider = {
    kind: "mcp", provider_id: "preflight", model_id: "preflight-1d", dimensions: 1, timeout_ms: 100,
    async embed(texts) { providerCalls++; return texts.map(() => Float32Array.of(1)); },
  };
  const indexBase = (state) => ({
    ...candidateGenerationInput(root, "unused", projected, chunks),
    state_directory: state,
    source_snapshot_digest: retrievalCanonicalDigest({ fixture: "schema3-preflight" }),
  });
  const indexCases = [
    (state) => ({ ...indexBase(state), unexpected: "forbidden" }),
    (state) => new Proxy(indexBase(state), { get(target, key, receiver) { reads++; return Reflect.get(target, key, receiver); } }),
    (state) => ({ ...indexBase(state), candidate_chunks: [new Proxy(chunks[0], { get(target, key, receiver) { reads++; return Reflect.get(target, key, receiver); } })] }),
    (state) => ({ ...indexBase(state), candidate_sources: [proxied] }),
    (state) => {
      const value = indexBase(state);
      delete value.candidate_sources;
      Object.defineProperty(value, "candidate_sources", { enumerable: true, get() { reads++; return [stored]; } });
      return value;
    },
  ];
  for (const [index, create] of indexCases.entries()) {
    const state = join(root, `index-state-${index}`);
    await assert.rejects(indexGkxRetrievalGeneration(create(state), provider));
    assert.equal(existsSync(state), false);
  }
  assert.equal(providerCalls, 0, "schema-3 invalid input reaches no external provider");
  assert.equal(reads, 0, "schema-3 preflight executes no caller getter or proxy get trap");
});
