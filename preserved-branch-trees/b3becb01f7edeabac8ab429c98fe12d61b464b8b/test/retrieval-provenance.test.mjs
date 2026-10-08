import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  chunkMarkdown,
  detectSqliteLexicalCapability,
  normalizeRetrievalAsOf,
  projectRetrievalSourcesAtTime,
  retrievalCanonicalDigest,
  RetrievalCoordinator,
  vaultSourceReader,
} from "../dist/retrieval.mjs";
import {
  bindGkxRetrievalCandidateChunks,
  buildGkxRetrievalGeneration,
  projectGkxRetrievalCorpus,
} from "../dist/retrieval-host.mjs";

const OLD = "018f0000-0000-7000-8000-000000000201";
const NEW = "018f0000-0000-7000-8000-000000000202";
const CONFORMANCE = JSON.parse(readFileSync(new URL("../contracts/retrieval/gkos-retrieval-1.0.0-draft.2/conformance-fixture.json", import.meta.url), "utf8"));
const CONTRACT = JSON.parse(readFileSync(new URL("../contracts/retrieval/gkos-retrieval-1.0.0-draft.2/contract.json", import.meta.url), "utf8"));
const PROJECTION_SCHEMA = JSON.parse(readFileSync(new URL("../contracts/retrieval/gkos-retrieval-1.0.0-draft.2/projection.schema.json", import.meta.url), "utf8"));
const STORED_PROVENANCE_SCHEMA = JSON.parse(readFileSync(new URL("../contracts/retrieval/gkos-retrieval-1.0.0-draft.2/stored-provenance.schema.json", import.meta.url), "utf8"));
const PUBLIC_PROVENANCE_SCHEMA = JSON.parse(readFileSync(new URL("../contracts/retrieval/gkos-retrieval-1.0.0-draft.2/provenance.schema.json", import.meta.url), "utf8"));
const RESULT_SCHEMA = JSON.parse(readFileSync(new URL("../contracts/retrieval/gkos-retrieval-1.0.0-draft.2/result.schema.json", import.meta.url), "utf8"));
const CHUNK_SCHEMA = JSON.parse(readFileSync(new URL("../contracts/retrieval/gkos-retrieval-1.0.0-draft.2/chunk.schema.json", import.meta.url), "utf8"));

function draft2Validators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  for (const schema of [PROJECTION_SCHEMA, STORED_PROVENANCE_SCHEMA, PUBLIC_PROVENANCE_SCHEMA, CHUNK_SCHEMA, RESULT_SCHEMA]) ajv.addSchema(schema);
  return {
    ajv,
    manifest: ajv.getSchema(PROJECTION_SCHEMA.$id),
    stored: ajv.getSchema(STORED_PROVENANCE_SCHEMA.$id),
    provenance: ajv.getSchema(PUBLIC_PROVENANCE_SCHEMA.$id),
    chunk: ajv.getSchema(CHUNK_SCHEMA.$id),
    result: ajv.getSchema(RESULT_SCHEMA.$id),
  };
}

function sortedKeys(value) { return Object.keys(value).sort(); }

function note(uid, title, createdAt, extra = "", body = "Policy Café 😀") {
  return `---\ngkx_version: "2.3"\nuid: "${uid}"\ntitle: "${title}"\ntype: "policy"\ncreated_at: "${createdAt}"\nepistemic_state: "reported"\nsensitivity: "public"\n${extra}---\n# ${title}\n${body}\n`;
}

function file(relativePath, content, times = {}) {
  return { relativePath, extension: "md", content, ...times };
}

function candidateChunksFor(projected) {
  return projected.sources.flatMap((item) => bindGkxRetrievalCandidateChunks(
    item.record_key,
    chunkMarkdown(item.chunk_input),
  ));
}

function candidateGenerationInput(stateDirectory, projected, overrides = {}) {
  const candidateChunks = candidateChunksFor(projected);
  return {
    state_directory: stateDirectory,
    vault_id: "draft2-provenance-vault",
    source_snapshot_digest: retrievalCanonicalDigest(projected.sources.map((item) => ({
      record_key: item.record_key,
      candidate_digest: item.candidate_source.candidate_digest,
    }))),
    configuration_digest: retrievalCanonicalDigest({ mode: "draft2-provenance" }),
    policy_digest: retrievalCanonicalDigest({ policy: "draft2-provenance-public" }),
    lexical_backend: "sqlite_lexical_scan",
    candidate_sources: projected.sources.map((item) => item.candidate_source),
    candidate_declarations: projected.declarations,
    candidate_chunks: candidateChunks,
    embedding_eligible_candidate_chunk_keys: candidateChunks.map((item) => item.candidate_chunk_key),
    ...overrides,
  };
}

test("draft.2 executable as_of matrix matches the exact current Engine/GKX timestamp validator", () => {
  for (const item of CONFORMANCE.as_of_grammar) {
    if (item.accepted) assert.equal(normalizeRetrievalAsOf(item.value), item.normalized, item.value);
    else assert.throws(() => normalizeRetrievalAsOf(item.value), /RETRIEVAL_AS_OF_INVALID/, item.value);
  }
});

test("draft.2 schemas strictly bind the executable manifest, provenance, and result envelopes", () => {
  const fixture = CONFORMANCE.executable_projection;
  const manifests = [fixture.expected_manifest, fixture.expected_fts5_manifest];
  const results = [fixture.expected_result, fixture.expected_scan_without_fts5_result, fixture.expected_fts5_result];
  const validators = draft2Validators();
  assert.equal(PROJECTION_SCHEMA.additionalProperties, false);
  assert.equal(STORED_PROVENANCE_SCHEMA.additionalProperties, false);
  assert.equal(PUBLIC_PROVENANCE_SCHEMA.additionalProperties, false);
  assert.equal(RESULT_SCHEMA.additionalProperties, false);
  assert.equal(PROJECTION_SCHEMA.properties.gkx_standard_commit.const, fixture.authority.gkx_standard_commit);
  assert.equal(PROJECTION_SCHEMA.properties.gkx_projection_profile.const, fixture.authority.gkx_projection_profile);
  for (const manifest of manifests) {
    assert.deepEqual(sortedKeys(manifest), [...PROJECTION_SCHEMA.required].sort());
  }
  for (const stored of fixture.expected_stored_provenance) {
    assert.deepEqual(sortedKeys(stored), [...STORED_PROVENANCE_SCHEMA.required].sort());
    assert.ok(stored.reason_codes.every((code) => STORED_PROVENANCE_SCHEMA.$defs.reasons.items.enum.includes(code)));
  }
  for (const result of results) {
    assert.deepEqual(sortedKeys(result), [...RESULT_SCHEMA.required].sort());
  }
  const publicProvenance = fixture.expected_result.hits[0].provenance;
  assert.deepEqual(sortedKeys(publicProvenance), [...PUBLIC_PROVENANCE_SCHEMA.required].sort());
  assert.ok(publicProvenance.reason_codes.every((code) => PUBLIC_PROVENANCE_SCHEMA.$defs.publicReasons.items.enum.includes(code)));
  assert.equal(CONFORMANCE.branched_lineage.status, "ratified_decision_a");
  assert.equal(CONFORMANCE.branched_lineage.frozen, true);
  assert.equal(CONFORMANCE.authorization_dependent_diagnostics.status, "ratified_decision_a");
  assert.equal(CONFORMANCE.authorization_dependent_diagnostics.frozen, true);
  const ratifiedMatrix = CONFORMANCE.authorization_dependent_diagnostics.matrix
    .filter((item) => item.scope === "authorized_view_ratified_a");
  assert.ok(ratifiedMatrix.every((item) => item.required_owner_decision === false && item.frozen === true));
  assert.equal(CONTRACT.cross_record_topology_authority.status, "ratified_decision_a");
  assert.equal(CONTRACT.cross_record_topology_authority.frozen, true);
  assert.deepEqual(CONTRACT.cross_record_topology_authority.matrix_ids, ratifiedMatrix.map((item) => item.id));

  for (const manifest of manifests) {
    assert.equal(validators.manifest(manifest), true, JSON.stringify(validators.manifest.errors));
  }
  for (const stored of fixture.expected_stored_provenance) assert.equal(validators.stored(stored), true, JSON.stringify(validators.stored.errors));
  for (const result of results) {
    assert.equal(validators.result(result), true, JSON.stringify(validators.result.errors));
    for (const hit of result.hits) {
      assert.equal(validators.chunk(hit.chunk), true, JSON.stringify(validators.chunk.errors));
      assert.equal(validators.provenance(hit.provenance), true, JSON.stringify(validators.provenance.errors));
      if (hit.parent_context) assert.equal(validators.provenance(hit.parent_context.provenance), true, JSON.stringify(validators.provenance.errors));
    }
  }

  const badScore = structuredClone(fixture.expected_result);
  badScore.hits[0].stage_scores.final_rank = "1";
  assert.equal(validators.result(badScore), false, "nested score types are executable schema constraints");
  const forgedLedger = structuredClone(fixture.expected_result.hits[0].provenance);
  forgedLedger.ledger_entry_sha256 = `sha256:${"0".repeat(64)}`;
  assert.equal(validators.provenance(forgedLedger), false, "unverified ledger fields are forbidden");
  const wrongAuthority = { ...fixture.expected_manifest, gkx_projection_profile: "invented-profile" };
  assert.equal(validators.manifest(wrongAuthority), false, "authority consts are executable constraints");
  const badReason = structuredClone(fixture.expected_result.hits[0].provenance);
  badReason.reason_codes = ["HIDDEN_ENDPOINT_PRESENT"];
  assert.equal(validators.provenance(badReason), false, "runtime-safe public reasons and schema enum stay aligned");
  const stored = fixture.expected_stored_provenance[0];
  const missingTitle = structuredClone(stored);
  delete missingTitle.source_metadata.title;
  assert.equal(validators.stored(missingTitle), false, "stored source metadata requires a title");
  const missingSensitivity = structuredClone(stored);
  delete missingSensitivity.source_metadata.sensitivity;
  assert.equal(validators.stored(missingSensitivity), false, "stored source metadata requires sensitivity");
  const nonauthoritative = structuredClone(stored);
  nonauthoritative.source_metadata.authoritative = false;
  assert.equal(validators.stored(nonauthoritative), false, "stored source metadata is canonical-authoritative");
  const nullAssertionWithAuthoredMetadata = structuredClone(stored);
  nullAssertionWithAuthoredMetadata.assertion_time = null;
  nullAssertionWithAuthoredMetadata.assertion_origin = null;
  assert.equal(validators.stored(nullAssertionWithAuthoredMetadata), false, "null assertion forbids authored_at metadata");
  const assertionWithoutAuthoredMetadata = structuredClone(stored);
  delete assertionWithoutAuthoredMetadata.source_metadata.authored_at;
  assert.equal(validators.stored(assertionWithoutAuthoredMetadata), false, "non-null assertion requires authored_at metadata");
  for (const accepted of CONFORMANCE.stored_provenance_assertion_validity.accepted) {
    const candidate = { ...structuredClone(stored), ...accepted };
    if (accepted.valid_from === null) {
      candidate.valid_to = null;
      candidate.temporal_state = "unknown";
    }
    assert.equal(validators.stored(candidate), true, `accepted assertion/validity shape: ${JSON.stringify(accepted)}`);
  }
  for (const rejected of CONFORMANCE.stored_provenance_assertion_validity.rejected) {
    const { schema_expressible: schemaExpressible, ...fields } = rejected;
    const candidate = { ...structuredClone(stored), ...fields };
    if (fields.assertion_time === null) {
      candidate.assertion_origin = null;
      delete candidate.source_metadata.authored_at;
    }
    if (schemaExpressible) assert.equal(validators.stored(candidate), false, `schema assertion/validity rejection: ${JSON.stringify(fields)}`);
  }
  assert.throws(() => validators.ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://gkos.example/contracts/retrieval/gkos-retrieval-1.0.0-draft.2/broken-ref.schema.json",
    $ref: "missing.schema.json",
  }), /can't resolve reference|MissingRefError/u);
});

test("draft.2 freezes Decision-A hidden-absence and all-authorized conflict outcomes for every cross-record class", () => {
  const matrix = CONFORMANCE.authorization_dependent_diagnostics;
  const cases = new Map(matrix.differential_cases.map((item) => [item.id, item]));
  assert.ok([...cases.values()].every((item) =>
    item.executable && item.frozen === true &&
    item.normative_retrieval_outcome.hidden_variant === "byte_identical_to_physical_absence" &&
    item.normative_retrieval_outcome.all_authorized_variant === "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT_BEFORE_QUERY_WORK"));

  const uniqueUid = projectGkxRetrievalCorpus([
    file("visible.md", note(OLD, "Visible", "2026-07-01T00:00:00Z"), { createdTime: 1 }),
  ]);
  const duplicateUid = projectGkxRetrievalCorpus([
    file("visible.md", note(OLD, "Visible", "2026-07-01T00:00:00Z"), { createdTime: 1 }),
    file("hidden.md", note(OLD, "Hidden duplicate", "2026-07-02T00:00:00Z", "", "Different bytes"), { createdTime: 2 }),
  ]);
  assert.notDeepEqual(duplicateUid.sources.map((item) => item.candidate_source.source_id), uniqueUid.sources.map((item) => item.candidate_source.source_id));

  const titleBaselineFiles = [
    file("a/Old Policy.md", note(OLD, "Old A", "2026-07-01T00:00:00Z"), { createdTime: 1 }),
    file("New.md", note(NEW, "New", "2026-08-01T00:00:00Z", "supersedes:\n  - \"Old Policy\"\n"), { createdTime: 2 }),
  ];
  const uniqueTitle = projectGkxRetrievalCorpus(titleBaselineFiles);
  const ambiguousTitle = projectGkxRetrievalCorpus([
    ...titleBaselineFiles,
    file("b/Old Policy.md", note("018f0000-0000-7000-8000-000000000205", "Old B", "2026-07-02T00:00:00Z"), { createdTime: 3 }),
  ]);
  assert.notDeepEqual(ambiguousTitle.sources.map((item) => item.candidate_source.source_id), uniqueTitle.sources.map((item) => item.candidate_source.source_id));

  const oneSuccessorFiles = [
    file("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), { createdTime: 1 }),
    file("new-a.md", note(NEW, "New A", "2026-08-01T00:00:00Z", `supersedes:\n  - "${OLD}"\n`), { createdTime: 2 }),
  ];
  const oneSuccessor = projectGkxRetrievalCorpus(oneSuccessorFiles);
  const split = projectGkxRetrievalCorpus([
    ...oneSuccessorFiles,
    file("new-b.md", note("018f0000-0000-7000-8000-000000000203", "New B", "2026-09-01T00:00:00Z", `supersedes:\n  - "${OLD}"\n`), { createdTime: 3 }),
  ]);
  assert.notDeepEqual(split.sources.map((item) => item.candidate_source.source_id), oneSuccessor.sources.map((item) => item.candidate_source.source_id));
});

test("draft.2 public declarations discriminate exact Phase-1 and Phase-2 result envelopes", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const tsc = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
  const fixture = fileURLToPath(new URL("./fixtures/types/retrieval-result-contract.ts", import.meta.url));
  execFileSync(process.execPath, [tsc, "--noEmit", "--skipLibCheck", "--target", "ES2020", "--module", "ESNext", "--moduleResolution", "bundler", fixture], {
    cwd: root,
    stdio: "pipe",
  });
});

test("draft.2 executable projection fixture locks exact scan and FTS5 generation/result envelopes", async () => {
  const fixture = CONFORMANCE.executable_projection;
  const files = fixture.input_files.map((item) => ({
    relativePath: item.relative_path,
    extension: "md",
    content: item.content,
    createdTime: item.created_time_ms,
  }));
  const projected = projectGkxRetrievalCorpus(files);
  assert.equal(projected.parse_count, fixture.expected_parse_count);
  assert.deepEqual(projected.rejections, fixture.expected_rejections);
  if (fixture.expected_candidate_sources) {
    assert.deepEqual(projected.sources.map((item) => item.candidate_source), fixture.expected_candidate_sources);
    assert.deepEqual(projected.declarations, fixture.expected_candidate_declarations);
  }

  const root = await mkdtemp(join(tmpdir(), "gkos-draft2-conformance-"));
  for (const item of files) await writeFile(join(root, item.relativePath), item.content, "utf8");
  const validators = draft2Validators();
  const chunks = candidateChunksFor(projected);
  const generationInput = fixture.generation_input;
  const capability = detectSqliteLexicalCapability();
  const variants = [
    [
      "sqlite_lexical_scan",
      fixture.expected_manifest,
      capability.fts5_available ? fixture.expected_result : fixture.expected_scan_without_fts5_result,
    ],
    ...(capability.fts5_available
      ? [["sqlite_fts5", fixture.expected_fts5_manifest, fixture.expected_fts5_result]]
      : []),
  ];
  for (const [backend, expectedManifest, expectedResult] of variants) {
    const built = buildGkxRetrievalGeneration({
      state_directory: join(root, `state-${backend}`),
      ...generationInput,
      lexical_backend: backend,
      candidate_sources: projected.sources.map((item) => item.candidate_source),
      candidate_declarations: projected.declarations,
      candidate_chunks: chunks,
      embedding_eligible_candidate_chunk_keys: chunks.map((candidate) => candidate.candidate_chunk_key),
    });
    assert.deepEqual(built.manifest, expectedManifest);
    assert.equal(validators.manifest(built.manifest), true, JSON.stringify(validators.manifest.errors));

    const service = new RetrievalCoordinator(built.database_path, {
      discoverability_policy: () => "allow",
      source_discoverability_policy: () => "allow",
      runtime_policy_digest: fixture.generation_input.policy_digest,
      lineage_view_freshness: "fresh",
      source_reader: vaultSourceReader(root),
    });
    try {
      const actualResult = await service.search(fixture.search_request);
      assert.equal(validators.result(actualResult), true, JSON.stringify(validators.result.errors));
      assert.deepEqual(actualResult, expectedResult);
    } finally {
      service.close();
    }
  }
});

test("one GkxIndex projection binds canonical uid, local validity, and exact title-resolution receipts", () => {
  const projected = projectGkxRetrievalCorpus([
    file("Old Policy.md", note(OLD, "Old Policy", "2026-07-01T00:00:00Z"), { createdTime: Date.parse("2026-07-01T00:00:00Z") }),
    file("New Policy.md", note(NEW, "New Policy", "2026-08-01T00:00:00Z", "supersedes:\n  - \"Old Policy\"\n"), { createdTime: Date.parse("2026-08-01T00:00:00Z") }),
  ]);
  assert.equal(projected.parse_count, 2);
  assert.equal(projected.delta.reparsed, 2);
  assert.deepEqual(projected.rejections, []);
  const old = projected.sources.find((source) => source.candidate_source.source_id === OLD).candidate_source;
  const successor = projected.sources.find((source) => source.candidate_source.source_id === NEW).candidate_source;
  assert.equal(old.valid_from, "2026-07-01T00:00:00.000Z");
  assert.equal(Object.hasOwn(old, "valid_to"), false, "physical candidates never pre-certify scoped invalidation");
  const declaration = projected.declarations.find((item) => item.source_record_key === successor.record_key);
  assert.equal(declaration.raw_reference, "Old Policy");
  assert.equal(declaration.category, "lineage");
  assert.equal(declaration.field, "supersedes");
  assert.deepEqual(
    declaration.resolution_tiers.find((tier) => tier.basis === "path_without_extension_exact").candidate_record_keys,
    [old.record_key],
  );
  assert.equal(successor.lineage_id, null);
  assert.equal(Object.hasOwn(successor, "ledger_entry_sha256"), false);
});

test("point-in-time selection delegates half-open boundaries and permits empty intervals", async () => {
  const files = [
    file("old.md", note(OLD, "old", "2026-08-01T00:00:00Z"), { createdTime: Date.parse("2026-08-01T00:00:00Z") }),
    file("new.md", note(NEW, "new", "2026-08-01T00:00:00Z", `supersedes:\n  - "${OLD}"\n`), { createdTime: Date.parse("2026-08-01T00:00:00Z") }),
  ];
  const equal = projectGkxRetrievalCorpus(files);
  assert.deepEqual(equal.rejections, []);
  const old = equal.sources.find((source) => source.candidate_source.source_id === OLD).candidate_source;
  const successor = equal.sources.find((source) => source.candidate_source.source_id === NEW).candidate_source;
  assert.equal(old.valid_from, successor.valid_from);
  const root = await mkdtemp(join(tmpdir(), "gkos-empty-half-open-"));
  for (const item of files) await writeFile(join(root, item.relativePath), item.content, "utf8");
  const input = candidateGenerationInput(join(root, "state"), equal);
  const built = buildGkxRetrievalGeneration(input);
  const service = new RetrievalCoordinator(built.database_path, {
    discoverability_policy: () => "allow",
    source_discoverability_policy: () => "allow",
    runtime_policy_digest: input.policy_digest,
    lineage_view_freshness: "fresh",
    source_reader: vaultSourceReader(root),
  });
  const result = await service.search({ query: "Policy", as_of: "2026-08-01T00:00Z" });
  assert.deepEqual(result.hits.map((hit) => hit.chunk.source_id), [NEW]);
  service.close();
});

test("missing source stats reject only that intrinsic candidate unless a manifest reference is supplied", () => {
  const statless = file("old.md", note(OLD, "old", "2026-07-01T00:00:00Z"));
  const rejected = projectGkxRetrievalCorpus([statless]);
  assert.deepEqual(rejected.sources, []);
  assert.deepEqual(rejected.rejections, [{
    source_path: "old.md",
    source_id: null,
    reason_codes: ["CANONICAL_VALIDITY_REFERENCE_UNAVAILABLE"],
  }]);

  const visible = file("visible.md", note(NEW, "visible", "2026-08-01T00:00:00Z"), { createdTime: 1 });
  const absent = projectGkxRetrievalCorpus([visible]);
  const present = projectGkxRetrievalCorpus([visible, statless]);
  assert.deepEqual(present.sources, absent.sources);
  assert.deepEqual(present.declarations, absent.declarations);
  assert.deepEqual(present.graph.nodes.map(({ updatedAt, ...node }) => node), absent.graph.nodes.map(({ updatedAt, ...node }) => node));
  assert.deepEqual(present.graph.links, absent.graph.links);
  assert.deepEqual(present.graph.gkxUidIndex, absent.graph.gkxUidIndex);
  assert.equal(present.parse_count, absent.parse_count);

  const input = [statless];
  const first = projectGkxRetrievalCorpus(input, [], [], { projection_reference_time: "2026-08-20T12:34Z" });
  const second = projectGkxRetrievalCorpus(input, [], [], { projection_reference_time: "2026-08-20T08:34-04:00" });
  assert.deepEqual(first.sources, second.sources);
  assert.equal(first.sources[0].candidate_source.validity_origin, "gkx_authored_timestamp");
});

test("nonportable authored time cannot diverge from canonical node.validAt", () => {
  const bad = note(OLD, "old", "2026-07-01 00:00:00", "", "bad temporal source");
  const result = projectGkxRetrievalCorpus([file("old.md", bad, { createdTime: Date.parse("2026-06-01T00:00:00Z") })]);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.rejections[0].reason_codes, ["CANONICAL_VALIDITY_BINDING_MISMATCH", "CANONICAL_VALIDITY_TIMESTAMP_NONPORTABLE"]);
});

test("descriptor-safe source preflight rejects accessors and out-of-range dates before a read", () => {
  let reads = 0;
  const accessor = {};
  Object.defineProperty(accessor, "relativePath", { enumerable: true, get() { reads++; return "evil.md"; } });
  Object.defineProperty(accessor, "content", { enumerable: true, value: note(OLD, "old", "2026-07-01T00:00:00Z") });
  assert.throws(() => projectGkxRetrievalCorpus([accessor], [], [], { projection_reference_time: "2026-08-20T00:00Z" }), /SOURCE_FILE_DESCRIPTOR/);
  assert.equal(reads, 0);
  assert.throws(() => projectGkxRetrievalCorpus([
    file("bad.md", note(OLD, "old", "2026-07-01T00:00:00Z"), { createdTime: 8_640_000_000_000_001 }),
  ]), /SOURCE_FILE_TIME_INVALID/);
});

test("canonical path collisions retain every physical candidate without cross-binding bytes", () => {
  const result = projectGkxRetrievalCorpus([
    file("a.md", note(OLD, "A", "2026-07-01T00:00:00Z"), { createdTime: 1 }),
    file("a.md", note(NEW, "B", "2026-08-01T00:00:00Z"), { createdTime: 2 }),
  ]);
  assert.deepEqual(result.rejections, []);
  assert.equal(result.sources.length, 2);
  assert.deepEqual(new Set(result.sources.map((item) => item.candidate_source.source_path)), new Set(["a.md"]));
  assert.deepEqual(new Set(result.sources.map((item) => item.candidate_source.source_id)), new Set([OLD, NEW]));
  assert.equal(new Set(result.sources.map((item) => item.record_key)).size, 2);
});

test("canonical resolver receipts are frozen for paths, wikilinks, ambiguity, and unresolved refs", () => {
  const pathResolved = projectGkxRetrievalCorpus([
    file("policies/Old Policy.md", note(OLD, "Old Policy", "2026-07-01T00:00:00Z"), { createdTime: 1 }),
    file("New.md", note(NEW, "New", "2026-08-01T00:00:00Z", "supersedes:\n  - \"policies/Old Policy\"\n"), { createdTime: 2 }),
  ]);
  assert.deepEqual(pathResolved.rejections, []);
  const pathOldKey = pathResolved.sources.find((item) => item.candidate_source.source_id === OLD).record_key;
  assert.deepEqual(pathResolved.declarations[0].resolution_tiers
    .find((tier) => tier.basis === "path_without_extension_exact").candidate_record_keys, [pathOldKey]);

  const wiki = projectGkxRetrievalCorpus([
    file("policies/Old Policy.md", note(OLD, "Old Policy", "2026-07-01T00:00:00Z"), { createdTime: 1 }),
    file("New.md", note(NEW, "New", "2026-08-01T00:00:00Z", "supersedes:\n  - \"[[policies/Old Policy]]\"\n"), { createdTime: 2 }),
  ]);
  assert.deepEqual(wiki.rejections, []);
  const wikiOldKey = wiki.sources.find((item) => item.candidate_source.source_id === OLD).record_key;
  assert.deepEqual(wiki.declarations[0].resolution_tiers
    .find((tier) => tier.basis === "path_without_extension_exact").candidate_record_keys, [wikiOldKey]);

  const ambiguous = projectGkxRetrievalCorpus([
    file("a/Old Policy.md", note(OLD, "Old A", "2026-07-01T00:00:00Z"), { createdTime: 1 }),
    file("b/Old Policy.md", note("018f0000-0000-7000-8000-000000000205", "Old B", "2026-07-02T00:00:00Z"), { createdTime: 2 }),
    file("New.md", note(NEW, "New", "2026-08-01T00:00:00Z", "supersedes:\n  - \"Old Policy\"\n"), { createdTime: 3 }),
  ]);
  assert.deepEqual(ambiguous.rejections, []);
  assert.equal(ambiguous.declarations[0].resolution_tiers
    .find((tier) => tier.basis === "basename_title").candidate_record_keys.length, 2);

  const unresolved = projectGkxRetrievalCorpus([
    file("New.md", note(NEW, "New", "2026-08-01T00:00:00Z", "supersedes:\n  - \"Missing Policy\"\n"), { createdTime: 3 }),
  ]);
  assert.deepEqual(unresolved.rejections, []);
  assert.deepEqual(unresolved.sources.map((item) => item.candidate_source.source_id), [NEW]);
  assert.ok(unresolved.declarations[0].resolution_tiers.every((tier) => tier.candidate_record_keys.length === 0));
});

test("a rejected successor cannot poison a valid predecessor's accepted temporal projection", () => {
  const predecessor = file("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), { createdTime: 1 });
  const absent = projectGkxRetrievalCorpus([predecessor]);
  const invalidSuccessor = note("not-a-canonical-uid", "Invalid", "2026-08-01T00:00:00Z", `supersedes:\n  - "${OLD}"\n`);
  const present = projectGkxRetrievalCorpus([
    predecessor,
    file("invalid.md", invalidSuccessor, { createdTime: 2 }),
  ]);
  assert.deepEqual(present.sources, absent.sources);
  assert.equal(Object.hasOwn(present.sources[0].candidate_source, "valid_to"), false);
  assert.ok(present.rejections.some((item) => item.source_path === "invalid.md"));
});

test("cross-record lineage conflicts remain physical candidates for the authorized-view decision", () => {
  const third = "018f0000-0000-7000-8000-000000000203";
  const split = projectGkxRetrievalCorpus([
    file("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), { createdTime: 1 }),
    file("new-a.md", note(NEW, "New A", "2026-08-01T00:00:00Z", `supersedes:\n  - "${OLD}"\n`), { createdTime: 2 }),
    file("new-b.md", note(third, "New B", "2026-09-01T00:00:00Z", `supersedes:\n  - "${OLD}"\n`), { createdTime: 3 }),
  ]);
  assert.deepEqual(split.rejections, []);
  assert.deepEqual(split.sources.map((item) => item.candidate_source.source_id).sort(), [OLD, NEW, third].sort());
  assert.equal(split.declarations.filter((item) => item.category === "lineage").length, 2);
});

test("canonical declaration receipts preserve aliases without raw-count rejection", () => {
  const projected = projectGkxRetrievalCorpus([
    file("Old Policy.md", note(OLD, "Old Policy", "2026-07-01T00:00:00Z"), { createdTime: 1 }),
    file("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", `relationships:
  supersedes:
    - target: "Old Policy"
      origin: "authored"
    - target: "Old Policy.md"
      origin: "authored"
`), { createdTime: 2 }),
  ]);
  assert.deepEqual(projected.rejections, []);
  const newer = projected.sources.find((item) => item.candidate_source.source_id === NEW);
  const older = projected.sources.find((item) => item.candidate_source.source_id === OLD);
  const receipts = projected.declarations.filter((item) => item.source_record_key === newer.record_key);
  assert.deepEqual(receipts.map((item) => item.raw_reference), ["Old Policy", "Old Policy.md"]);
  assert.ok(receipts.every((item) => item.resolution_tiers.some((tier) => tier.candidate_record_keys.includes(older.record_key))));
  assert.equal(JSON.stringify(projected.graph).includes("raw_reference"), false);
  assert.equal(Object.hasOwn(newer.candidate_source, "declaration_receipts"), false);
});

test("authored resolution failure receipts cannot be masked by a derived edge", () => {
  const projected = projectGkxRetrievalCorpus([
    file("Old Policy.md", note(OLD, "Old Policy", "2026-07-01T00:00:00Z"), { createdTime: 1 }),
    file("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", `relationships:
  supersedes:
    - target: "Missing Policy"
      origin: "authored"
    - target: "Old Policy"
      origin: "derived"
`), { createdTime: 2 }),
  ]);
  assert.deepEqual(projected.rejections, []);
  assert.deepEqual(projected.sources.map((item) => item.candidate_source.source_id).sort(), [OLD, NEW].sort());
  const newerKey = projected.sources.find((item) => item.candidate_source.source_id === NEW).record_key;
  const receipts = projected.declarations.filter((item) => item.source_record_key === newerKey);
  const authored = receipts.find((item) => item.origin === "authored");
  const derived = receipts.find((item) => item.origin === "derived");
  assert.ok(authored.resolution_tiers.every((tier) => tier.candidate_record_keys.length === 0));
  assert.ok(derived.resolution_tiers.some((tier) => tier.candidate_record_keys.length === 1));
});

test("an unresolved derived-only receipt remains local and does not poison an unrelated valid source", () => {
  const projected = projectGkxRetrievalCorpus([
    file("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), { createdTime: 1 }),
    file("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", `relationships:
  supersedes:
    - target: "Missing Policy"
      origin: "derived"
`), { createdTime: 2 }),
  ]);
  assert.deepEqual(projected.rejections, []);
  const oldCandidate = projected.sources.find((item) => item.candidate_source.source_id === OLD).candidate_source;
  assert.equal(oldCandidate.valid_from, "2026-07-01T00:00:00.000Z");
  assert.equal(oldCandidate.validity_origin, "gkx_authored_timestamp");
  assert.equal(Object.hasOwn(oldCandidate, "valid_to"), false);
  const derived = projected.declarations.find((item) => item.origin === "derived");
  assert.ok(derived.resolution_tiers.every((tier) => tier.candidate_record_keys.length === 0));
  assert.equal(JSON.stringify(projected.graph).includes("raw_reference"), false);
});

test("candidate receipts retain canonical origins while physical sources mint no effective edge", () => {
  for (const origin of ["authored", "derived", "approved", "proposed"]) {
    const projected = projectGkxRetrievalCorpus([
      file("old.md", note(OLD, "Old", "2026-07-01T00:00:00Z"), { createdTime: 1 }),
      file("new.md", note(NEW, "New", "2026-08-01T00:00:00Z", `relationships:
  supersedes:
    - target: "${OLD}"
      origin: "${origin}"
`), { createdTime: 2 }),
    ]);
    assert.deepEqual(projected.rejections, [], origin);
    const oldNode = projected.graph.nodes.find((item) => item.id === "file:old.md");
    const newNode = projected.graph.nodes.find((item) => item.id === "file:new.md");
    const oldStored = projected.sources.find((item) => item.candidate_source.source_id === OLD).candidate_source;
    const newStored = projected.sources.find((item) => item.candidate_source.source_id === NEW).candidate_source;
    const effective = origin !== "proposed";
    assert.deepEqual(newNode.gkx.supersedesIds, effective ? ["file:old.md"] : [], origin);
    const receipt = projected.declarations.find((item) => item.source_record_key === newStored.record_key);
    if (origin === "proposed") assert.equal(receipt, undefined, "proposed edges remain outside the effective candidate declaration set");
    else assert.equal(receipt.origin, origin);
    assert.equal(Object.hasOwn(newStored, "resolved_supersedes"), false, origin);
    assert.equal(Object.hasOwn(oldStored, "valid_to"), false, origin);
    assert.equal(oldNode.gkx.invalidAt, effective ? "2026-08-01T00:00:00.000Z" : null, origin);
  }
});
