import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  bindGkxRetrievalCandidateChunks,
  buildGkxRetrievalGeneration,
  openActiveRetrievalStore,
  projectGkxRetrievalCorpus,
} from "../dist/retrieval-host.mjs";
import { chunkMarkdown, detectSqliteLexicalCapability, retrievalCanonicalDigest } from "../dist/retrieval.mjs";

const OLD = "018f0000-0000-7000-8000-000000000701";
const NEW = "018f0000-0000-7000-8000-000000000702";
const DIGEST = `sha256:${"1".repeat(64)}`;

function note(uid, title, extra = "", body = "candidate body") {
  return `---\ngkx_version: "2.3"\nuid: "${uid}"\ntitle: "${title}"\ntype: "policy"\ncreated_at: "2026-08-01T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n${extra}---\n${body ? `# ${title}\n${body}\n` : ""}`;
}

function generationInput(stateDirectory, files, lexicalBackend = "sqlite_lexical_scan") {
  const projected = projectGkxRetrievalCorpus(files);
  const candidateChunks = projected.sources.flatMap((source) => bindGkxRetrievalCandidateChunks(
    source.record_key,
    chunkMarkdown(source.chunk_input),
  ));
  return {
    state_directory: stateDirectory,
    vault_id: "candidate-store-test",
    source_snapshot_digest: DIGEST,
    configuration_digest: `sha256:${"2".repeat(64)}`,
    policy_digest: `sha256:${"3".repeat(64)}`,
    lexical_backend: lexicalBackend,
    candidate_sources: projected.sources.map((source) => source.candidate_source),
    candidate_declarations: projected.declarations,
    candidate_chunks: candidateChunks,
    embedding_eligible_candidate_chunk_keys: candidateChunks.map((chunk) => chunk.candidate_chunk_key),
    embedding_provider_id: "test-provider",
    embedding_model_id: "test-model",
    embedding_dimensions: 2,
    vectors: candidateChunks.map((chunk) => ({ candidate_chunk_key: chunk.candidate_chunk_key, vector: [1, 0] })),
  };
}

async function fixture(stateDirectory) {
  return generationInput(stateDirectory, [
    { relativePath: "visible.md", content: note(OLD, "Visible", "", "parent body\n## Child\nchild body"), createdTime: 1 },
    { relativePath: "blank.md", content: note(NEW, "Blank", `supersedes:\n  - "${OLD}"\n`, ""), createdTime: 2 },
  ]);
}

test("schema-3 candidate store binds zero-chunk rows, receipts, lexical rows, and physical digest on reopen", async () => {
  const state = await mkdtemp(join(tmpdir(), "gkos-candidate-store-"));
  const input = await fixture(state);
  assert.equal(input.candidate_declarations.length, 1);
  input.candidate_declarations[0].raw_reference = "HIDDEN-DECLARATION-SENTINEL";
  const built = buildGkxRetrievalGeneration(input);
  assert.equal(built.manifest.projection_schema_version, 3);
  assert.equal(built.manifest.candidate_source_count, 2);
  assert.equal(built.manifest.candidate_declaration_count, input.candidate_declarations.length);
  assert.equal(built.manifest.represented_candidate_source_count, 1, "frontmatter-only successor is retained without a synthetic chunk");
  assert.equal(built.manifest.represented_candidate_source_count, new Set(input.candidate_chunks.map((item) => item.record_key)).size);
  assert.equal(built.manifest.candidate_chunk_count, input.candidate_chunks.length);

  const store = openActiveRetrievalStore(state);
  try {
    assert.deepEqual(store.listCandidateSources(), [...input.candidate_sources].sort((a, b) => a.record_key < b.record_key ? -1 : 1));
    assert.deepEqual(store.listCandidateChunks(), [...input.candidate_chunks].sort((a, b) => a.candidate_chunk_key < b.candidate_chunk_key ? -1 : 1));
    assert.equal(store.listCandidateDeclarations().length, input.candidate_declarations.length);
    const visibleRecordKey = input.candidate_sources.find((source) => source.source_id === OLD).record_key;
    const hiddenReceiptRecordKey = input.candidate_sources.find((source) => source.source_id === NEW).record_key;
    assert.deepEqual(store.listCandidateDeclarationsForRecordKeys([visibleRecordKey]), [], "denied receipt rows do not cross the scoped SQLite boundary");
    assert.equal(store.listCandidateDeclarationsForRecordKeys([hiddenReceiptRecordKey])[0].raw_reference, "HIDDEN-DECLARATION-SENTINEL");
    assert.deepEqual(store.listCandidateDeclarationsForRecordKeys([visibleRecordKey]), [], "the temp key set is replaced rather than retaining a prior hidden key");
    assert.equal(store.countChunks(), input.candidate_chunks.length);
  } finally {
    store.close();
  }
});

test("schema-3 preflight rejects malformed candidate envelopes before state creation", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-candidate-invalid-"));
  const state = join(root, "state");
  const input = await fixture(state);
  const malformed = structuredClone(input);
  malformed.candidate_sources[0].parser_content_fingerprint = "not a parser fingerprint";
  assert.throws(() => buildGkxRetrievalGeneration(malformed), /CANDIDATE_SOURCE_IDENTITY_INVALID/u);
  await assert.rejects(readFile(join(state, "active-retrieval.json")), /ENOENT/u);
});

test("schema-3 rejects noncanonical declaration authority shapes and duplicate logical coordinates before state", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-candidate-declarations-"));
  const original = await fixture(join(root, "state"));
  assert.ok(original.candidate_declarations.length > 0);
  const cases = [];
  const reversed = structuredClone(original);
  reversed.candidate_declarations[0].resolution_tiers.reverse();
  cases.push(reversed);
  const proposed = structuredClone(original);
  proposed.candidate_declarations[0].origin = "proposed";
  cases.push(proposed);
  const impossible = structuredClone(original);
  impossible.candidate_declarations[0].category = "link";
  cases.push(impossible);
  const unknownRelationship = structuredClone(original);
  unknownRelationship.candidate_declarations[0].category = "relationship";
  unknownRelationship.candidate_declarations[0].field = "relationships.nonsense";
  cases.push(unknownRelationship);
  const oversized = structuredClone(original);
  oversized.candidate_declarations[0].raw_reference = "x".repeat(513);
  cases.push(oversized);
  const duplicateCoordinate = structuredClone(original);
  duplicateCoordinate.candidate_declarations.push({ ...structuredClone(duplicateCoordinate.candidate_declarations[0]), raw_reference: "another target" });
  cases.push(duplicateCoordinate);
  const indexGap = structuredClone(original);
  indexGap.candidate_declarations[0].declaration_index = 1;
  cases.push(indexGap);
  const duplicateRelationshipIndex = structuredClone(original);
  const relation = structuredClone(duplicateRelationshipIndex.candidate_declarations[0]);
  relation.category = "relationship";
  relation.field = "relationships.supports";
  relation.declaration_index = 0;
  const secondRelation = structuredClone(relation);
  secondRelation.field = "relationships.cites";
  duplicateRelationshipIndex.candidate_declarations = [relation, secondRelation];
  cases.push(duplicateRelationshipIndex);
  for (const candidate of cases) assert.throws(() => buildGkxRetrievalGeneration(candidate), /DECLARATION/u);
  await assert.rejects(readFile(join(root, "state", "active-retrieval.json")), /ENOENT/u);
});

test("schema-3 retains duplicate UID/path/exact multiplicity and binds parents within each candidate record", async () => {
  const state = await mkdtemp(join(tmpdir(), "gkos-candidate-multiplicity-"));
  const content = note(OLD, "Repeated", "", "parent\n## Child\nchild");
  const input = generationInput(state, [
    { relativePath: "same.md", content, createdTime: 1 },
    { relativePath: "same.md", content, createdTime: 1 },
    { relativePath: "other.md", content: note(OLD, "Other", "", "parent\n## Child\nchild"), createdTime: 2 },
  ]);
  assert.equal(input.candidate_sources.length, 3);
  const built = buildGkxRetrievalGeneration(input);
  assert.equal(built.manifest.candidate_source_count, 3);
  assert.equal(new Set(input.candidate_sources.map((item) => item.record_key)).size, 3);
  assert.ok(new Set(input.candidate_sources.map((item) => item.source_id)).size < 3);
  assert.ok(new Set(input.candidate_sources.map((item) => item.source_path)).size < 3);
  assert.ok(new Set(input.candidate_chunks.map((item) => item.chunk.chunk_id)).size < input.candidate_chunks.length);
  for (const candidate of input.candidate_chunks.filter((item) => item.parent_candidate_chunk_key !== null)) {
    const parent = input.candidate_chunks.find((item) => item.candidate_chunk_key === candidate.parent_candidate_chunk_key);
    assert.equal(parent.record_key, candidate.record_key);
    assert.equal(parent.chunk.chunk_id, candidate.chunk.parent_chunk_id);
  }
  const store = openActiveRetrievalStore(state);
  try { assert.equal(store.listCandidateSources().length, 3); } finally { store.close(); }
});

test("schema-3 duplicate-content candidates require one identical vector payload", async () => {
  const files = [
    { relativePath: "same.md", content: note(OLD, "Repeated", "", "same body"), createdTime: 1 },
    { relativePath: "same.md", content: note(OLD, "Repeated", "", "same body"), createdTime: 1 },
  ];
  const rejectedState = await mkdtemp(join(tmpdir(), "gkos-candidate-vector-conflict-build-"));
  const rejected = generationInput(rejectedState, files);
  assert.equal(rejected.candidate_chunks.length, 2);
  assert.equal(new Set(rejected.candidate_chunks.map((item) => item.chunk.content_digest)).size, 1);
  rejected.vectors[1] = { ...rejected.vectors[1], vector: [0, 1] };
  assert.throws(() => buildGkxRetrievalGeneration(rejected), /CONTENT_VECTOR_CACHE_CONFLICT/u);
  assert.deepEqual(await readdir(rejectedState), [], "conflicting duplicate-content vectors publish no state");

  const persistedState = await mkdtemp(join(tmpdir(), "gkos-candidate-vector-conflict-reopen-"));
  const accepted = generationInput(persistedState, files);
  const built = buildGkxRetrievalGeneration(accepted);
  const pristine = openActiveRetrievalStore(persistedState);
  pristine.close();
  if (process.platform !== "win32") await chmod(built.database_path, 0o600);
  const db = new DatabaseSync(built.database_path);
  try {
    db.prepare("UPDATE candidate_chunk_vectors SET vector_json='[0,1]' WHERE candidate_chunk_key=?")
      .run(accepted.vectors[1].candidate_chunk_key);
  } finally {
    db.close();
  }
  assert.throws(() => openActiveRetrievalStore(persistedState), /CONTENT_VECTOR_CACHE_CONFLICT/u);
});

test("schema-3 forced FTS5 reopens exactly and rejects duplicate-for-missing candidate keys", async () => {
  const state = await mkdtemp(join(tmpdir(), "gkos-candidate-fts5-"));
  const input = { ...await fixture(state), lexical_backend: "sqlite_fts5" };
  if (!detectSqliteLexicalCapability().fts5_available) {
    assert.throws(() => buildGkxRetrievalGeneration(input), /SQLITE_FTS5_UNAVAILABLE/u);
    assert.deepEqual(await readdir(state), [], "missing FTS5 fails before pointer/database publication");
    return;
  }
  assert.ok(input.candidate_chunks.length >= 2, "fixture must exercise a true key-set swap");
  const built = buildGkxRetrievalGeneration(input);
  const pristine = openActiveRetrievalStore(state);
  pristine.close();

  if (process.platform !== "win32") await chmod(built.database_path, 0o600);
  const db = new DatabaseSync(built.database_path);
  try {
    const rows = db.prepare("SELECT chunk_id, title, heading_path, tags, topic, category, text FROM chunk_fts ORDER BY chunk_id").all();
    assert.ok(rows.length >= 2);
    const [duplicate, missing] = rows;
    db.prepare("DELETE FROM chunk_fts WHERE chunk_id=?").run(missing.chunk_id);
    db.prepare("INSERT INTO chunk_fts(chunk_id,title,heading_path,tags,topic,category,text) VALUES (?,?,?,?,?,?,?)")
      .run(duplicate.chunk_id, duplicate.title, duplicate.heading_path, duplicate.tags, duplicate.topic, duplicate.category, duplicate.text);
  } finally {
    db.close();
  }
  assert.throws(() => openActiveRetrievalStore(state), /LEXICAL_PROJECTION_MISMATCH/u);

  const tokenizerState = await mkdtemp(join(tmpdir(), "gkos-candidate-fts5-tokenizer-"));
  const tokenizerBuilt = buildGkxRetrievalGeneration({ ...input, state_directory: tokenizerState, configuration_digest: `sha256:${"4".repeat(64)}` });
  const tokenizerDb = new DatabaseSync(tokenizerBuilt.database_path);
  try {
    const rows = tokenizerDb.prepare("SELECT chunk_id,title,heading_path,tags,topic,category,text FROM chunk_fts").all();
    tokenizerDb.exec("DROP TABLE chunk_fts; CREATE VIRTUAL TABLE chunk_fts USING fts5(chunk_id UNINDEXED,title,heading_path,tags,topic,category,text,tokenize='porter')");
    const insert = tokenizerDb.prepare("INSERT INTO chunk_fts(chunk_id,title,heading_path,tags,topic,category,text) VALUES (?,?,?,?,?,?,?)");
    for (const row of rows) insert.run(row.chunk_id, row.title, row.heading_path, row.tags, row.topic, row.category, row.text);
  } finally { tokenizerDb.close(); }
  assert.throws(() => openActiveRetrievalStore(tokenizerState), /LEXICAL_SCHEMA_INVALID/u);
});

test("schema-3 reopen rejects independently resealed candidate, declaration, chunk, FTS, vector and eligibility tampering", async () => {
  const mutations = [
    ["source", (db) => {
      const row = db.prepare("SELECT record_key, candidate_json FROM candidate_sources LIMIT 1").get();
      const source = JSON.parse(row.candidate_json);
      source.source_metadata.title = "tampered";
      const { candidate_digest: _old, ...base } = source;
      source.candidate_digest = retrievalCanonicalDigest(base);
      db.prepare("UPDATE candidate_sources SET candidate_json=?, candidate_digest=? WHERE record_key=?").run(JSON.stringify(source), source.candidate_digest, row.record_key);
    }],
    ["source-json-bytes", (db) => db.prepare("UPDATE candidate_sources SET candidate_json=' ' || candidate_json WHERE rowid=(SELECT rowid FROM candidate_sources LIMIT 1)").run()],
    ["declaration", (db) => {
      const row = db.prepare("SELECT declaration_digest, declaration_json FROM candidate_declarations LIMIT 1").get();
      const declaration = JSON.parse(row.declaration_json);
      declaration.raw_reference = `${declaration.raw_reference} `;
      const digest = retrievalCanonicalDigest(declaration);
      db.prepare("UPDATE candidate_declarations SET declaration_digest=?, declaration_json=? WHERE declaration_digest=?").run(digest, JSON.stringify(declaration), row.declaration_digest);
    }],
    ["declaration-json-bytes", (db) => db.prepare("UPDATE candidate_declarations SET declaration_json=' ' || declaration_json WHERE rowid=(SELECT rowid FROM candidate_declarations LIMIT 1)").run()],
    ["chunk", (db) => {
      const row = db.prepare("SELECT * FROM candidate_chunks LIMIT 1").get();
      const chunk = JSON.parse(row.chunk_json);
      chunk.valid_from = "2026-08-02T00:00:00.000Z";
      const wrapper = {
        candidate_chunk_key: row.candidate_chunk_key,
        record_key: row.record_key,
        parent_candidate_chunk_key: row.parent_candidate_chunk_key,
        chunk,
      };
      db.prepare("UPDATE candidate_chunks SET chunk_json=?, chunk_digest=? WHERE candidate_chunk_key=?")
        .run(JSON.stringify(chunk), retrievalCanonicalDigest(wrapper), row.candidate_chunk_key);
    }],
    ["chunk-json-bytes", (db) => db.prepare("UPDATE candidate_chunks SET chunk_json=' ' || chunk_json WHERE rowid=(SELECT rowid FROM candidate_chunks LIMIT 1)").run()],
    ["fts", (db) => db.prepare("UPDATE chunk_fts SET text='tampered' WHERE rowid=(SELECT rowid FROM chunk_fts LIMIT 1)").run()],
    ["vector", (db) => db.prepare("UPDATE candidate_chunk_vectors SET vector_json='[0,1]' WHERE rowid=(SELECT rowid FROM candidate_chunk_vectors LIMIT 1)").run()],
    ["vector-json-bytes", (db) => db.prepare("UPDATE candidate_chunk_vectors SET vector_json=' ' || vector_json WHERE rowid=(SELECT rowid FROM candidate_chunk_vectors LIMIT 1)").run()],
    ["vector-provider", (db) => db.prepare("UPDATE candidate_chunk_vectors SET provider_id='other-provider' WHERE rowid=(SELECT rowid FROM candidate_chunk_vectors LIMIT 1)").run()],
    ["eligibility", (db) => db.prepare("DELETE FROM embedding_eligible_candidate_chunks WHERE rowid=(SELECT rowid FROM embedding_eligible_candidate_chunks LIMIT 1)").run()],
    ["manifest-json-bytes", (db) => db.prepare("UPDATE projection_manifest SET manifest_json=' ' || manifest_json WHERE singleton=1").run()],
  ];
  for (const [label, mutate] of mutations) {
    const state = await mkdtemp(join(tmpdir(), `gkos-candidate-tamper-${label}-`));
    const input = await fixture(state);
    if (!input.candidate_declarations.length && label === "declaration") continue;
    const built = buildGkxRetrievalGeneration(input);
    if (process.platform !== "win32") await chmod(built.database_path, 0o600);
    const db = new DatabaseSync(built.database_path);
    try { mutate(db); } finally { db.close(); }
    assert.throws(() => openActiveRetrievalStore(state), /MISMATCH|INVALID|COUNT|DIGEST|PROJECTION|PARTIAL|NONCANONICAL/u, label);
  }
});
