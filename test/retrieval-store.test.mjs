import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { access, chmod, link, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import {
  RETRIEVAL_MAX_CHUNK_BYTES,
  RetrievalCoordinator,
  buildRetrievalGeneration,
  chunkMarkdown,
  indexRetrievalGeneration,
  retrievalCanonicalDigest,
  retrievalSha256,
  vaultSourceReader,
} from "../dist/retrieval.mjs";
import * as retrievalPublic from "../dist/retrieval.mjs";

const digest = (value) => retrievalCanonicalDigest(value);
const generationInput = (state, chunks, extra = {}) => ({
  state_directory: state,
  vault_id: "fixture-vault",
  source_snapshot_digest: digest(chunks.map((chunk) => [chunk.source_id, chunk.source_path, chunk.source_digest])),
  configuration_digest: digest({ mode: "fts", fixture: extra.fixture ?? 1 }),
  policy_digest: digest({ policy: "public-only" }),
  chunks,
  ...extra,
});

async function source(root, name, uid, body, metadata = {}) {
  const text = `# ${name}\n${body}\n`;
  await writeFile(join(root, `${name}.md`), text, "utf8");
  return chunkMarkdown({ source_id: uid, source_path: `${name}.md`, text, metadata: { sensitivity: "public", title: name, ...metadata } });
}

const coordinatorOptions = (root, extra = {}) => ({
  discoverability_policy: () => "allow",
  source_reader: vaultSourceReader(root),
  ...extra,
});

test("SQLite FTS generation, active pointer replacement, accent scoring, and verification work", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-store-"));
  const state = join(root, "state");
  const chunks = [
    ...await source(root, "cafe", "018f0000-0000-7000-8000-000000000201", "Café evidence.", { topic: "beverage" }),
    ...await source(root, "policy", "018f0000-0000-7000-8000-000000000202", "Rules live here.", { topic: "governance" }),
  ];
  const first = buildRetrievalGeneration(generationInput(state, chunks));
  const firstCoordinator = new RetrievalCoordinator(first.database_path, coordinatorOptions(root));
  assert.equal((await firstCoordinator.search({ query: "cafe", limit: 5 })).hits[0].chunk.source_path, "cafe.md");
  assert.equal((await firstCoordinator.search({ query: "governance", limit: 5 })).hits[0].chunk.source_path, "policy.md");
  firstCoordinator.close();

  const second = buildRetrievalGeneration(generationInput(state, chunks, { fixture: 2 }));
  assert.notEqual(first.database_path, second.database_path);
  const active = RetrievalCoordinator.openActive(state, coordinatorOptions(root));
  assert.equal((await active.search({ query: "governance", limit: 5 })).projection_digest, second.manifest.projection_digest);
  active.close();
});

test("deferred parent FK accepts adversarial hash order and parent bindings remain verified", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-parent-"));
  let chunks;
  let text;
  for (let index = 0; index < 500; index++) {
    text = `# Parent ${index}\nParent body.\n\n## Child\nChild body.\n`;
    chunks = chunkMarkdown({
      source_id: "018f0000-0000-7000-8000-000000000203",
      source_path: "parent.md",
      text,
      metadata: { sensitivity: "public" },
    });
    if (chunks[1].chunk_id < chunks[0].chunk_id) break;
  }
  assert.ok(chunks[1].chunk_id < chunks[0].chunk_id, "fixture must insert child before parent by hash");
  await writeFile(join(root, "parent.md"), text, "utf8");
  const built = buildRetrievalGeneration(generationInput(join(root, "state"), chunks));
  const coordinator = new RetrievalCoordinator(built.database_path, coordinatorOptions(root));
  const result = await coordinator.search({ query: "Child body", limit: 1, parent_expansion: true });
  assert.equal(result.hits[0].chunk.parent_chunk_id, chunks[0].chunk_id);
  coordinator.close();
});

test("generation binds children only to the nearest structural ancestor's first chunk", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-parent-binding-"));
  const text = [
    "# Ancestor", "ancestor body", "", "## Parent",
    Array.from({ length: 48 }, (_, index) => `parent-${index}`).join(" "),
    "", "#### Child", "child evidence", "", "# Sibling", "sibling body", "",
  ].join("\n");
  await writeFile(join(root, "structural.md"), text, "utf8");
  const canonical = chunkMarkdown({
    source_id: "018f0000-0000-7000-8000-000000000231",
    source_path: "structural.md",
    text,
    metadata: { sensitivity: "public" },
  }, { max_tokens: 16 });
  const ancestor = canonical.find((chunk) => chunk.heading_path.at(-1) === "Ancestor");
  const child = canonical.find((chunk) => chunk.heading_path.at(-1) === "Child");
  const sibling = canonical.find((chunk) => chunk.heading_path.at(-1) === "Sibling");
  const parentParts = canonical.filter((chunk) => chunk.heading_path.at(-1) === "Parent")
    .sort((left, right) => left.part_ordinal - right.part_ordinal);
  assert.ok(ancestor && child && sibling && parentParts.length > 1);
  assert.equal(child.parent_chunk_id, parentParts[0].chunk_id, "skipped heading depths still bind to the nearest actual ancestor");
  const valid = buildRetrievalGeneration(generationInput(join(root, "valid"), canonical));
  assert.ok(existsSync(valid.pointer_path));

  const cases = [
    ["wrong-sibling", (chunks) => { chunks.find((chunk) => chunk.chunk_id === child.chunk_id).parent_chunk_id = sibling.chunk_id; }],
    ["wrong-ancestor-level", (chunks) => { chunks.find((chunk) => chunk.chunk_id === child.chunk_id).parent_chunk_id = ancestor.chunk_id; }],
    ["non-first-parent-part", (chunks) => { chunks.find((chunk) => chunk.chunk_id === child.chunk_id).parent_chunk_id = parentParts[1].chunk_id; }],
    ["missing-parent", (chunks) => { delete chunks.find((chunk) => chunk.chunk_id === child.chunk_id).parent_chunk_id; }],
    ["extra-top-level-parent", (chunks) => { chunks.find((chunk) => chunk.chunk_id === sibling.chunk_id).parent_chunk_id = ancestor.chunk_id; }],
  ];
  for (const [name, mutate] of cases) {
    const state = join(root, name);
    const forged = structuredClone(canonical);
    mutate(forged);
    assert.throws(() => buildRetrievalGeneration(generationInput(state, forged)), /RETRIEVAL_CHUNK_PARENT_INVALID/u, name);
    assert.equal(existsSync(state), false, `${name} must not create or publish derived state`);
  }
});

test("generation rejects source conflicts, partial/orphan vectors, and content tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-invalid-"));
  const chunks = await source(root, "one", "018f0000-0000-7000-8000-000000000204", "Body.");
  const conflict = chunkMarkdown({ source_id: chunks[0].source_id, source_path: "other.md", text: "# Other\nDifferent.\n", metadata: { sensitivity: "public" } });
  assert.throws(() => buildRetrievalGeneration(generationInput(join(root, "conflict"), [chunks[0], ...conflict])), /SOURCE_ID_BINDING_CONFLICT/);
  assert.throws(() => buildRetrievalGeneration(generationInput(join(root, "partial"), chunks, {
    vectors: [], embedding_provider_id: "p", embedding_model_id: "m", embedding_dimensions: 2,
  })), /PARTIAL/);
  assert.throws(() => buildRetrievalGeneration(generationInput(join(root, "orphan"), chunks, {
    vectors: [{ chunk_id: "missing", vector: [1, 0] }], embedding_provider_id: "p", embedding_model_id: "m", embedding_dimensions: 2,
  })), /PARTIAL|ORPHAN/);
  assert.throws(() => buildRetrievalGeneration(generationInput(join(root, "tampered"), [{ ...chunks[0], text: "Changed" }])), /CONTENT_BINDING/);
});

test("strict chunk envelopes reject malformed nested values before any generation or pointer is published", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-envelope-"));
  const chunks = await source(root, "strict", "018f0000-0000-7000-8000-000000000223", "Body.\n\n## Child\nChild body.", {
    tags: ["valid"],
    moc_relationships: ["topic:valid"],
    custom: { nested: ["safe", 1, true, null] },
  });
  assert.ok(chunks.length > 1, "fixture must prove whole-source rejection rather than a one-row failure");
  const cyclic = {};
  cyclic.self = cyclic;
  const cases = [
    ["heading-item", (chunk) => { chunk.heading_path = ["Heading", 42]; }],
    ["heading-unpaired-unicode", (chunk) => { chunk.heading_path = ["Heading", "\ud800"]; }],
    ["supersedes-item", (chunk) => { chunk.supersedes = [7]; }],
    ["superseded-by-item", (chunk) => { chunk.superseded_by = [{}]; }],
    ["parent-id", (chunk) => { chunk.parent_chunk_id = 42; }],
    ["lineage", (chunk) => { chunk.lineage_id = 42; }],
    ["valid-from", (chunk) => { chunk.valid_from = []; }],
    ["valid-to", (chunk) => { chunk.valid_to = {}; }],
    ["tags-item", (chunk) => { chunk.metadata.tags = ["valid", 3]; }],
    ["moc-item", (chunk) => { chunk.metadata.moc_relationships = [{}]; }],
    ["metadata-array", (chunk) => { chunk.metadata = []; }],
    ["metadata-unknown-undefined", (chunk) => { chunk.metadata.custom = { nested: undefined }; }],
    ["metadata-unknown-class", (chunk) => { chunk.metadata.custom = new Date(0); }],
    ["metadata-unsafe-number", (chunk) => { chunk.metadata.custom = 9_007_199_254_740_992; }],
    ["metadata-cycle", (chunk) => { chunk.metadata.custom = cyclic; }],
    ["structural-position", (chunk) => { chunk.structural_position = ""; }],
    ["unexpected-top-level", (chunk) => { chunk.unexpected = true; }],
  ];
  for (const [name, mutate] of cases) {
    const state = join(root, `state-${name}`);
    const malformed = structuredClone(chunks);
    mutate(malformed[1]);
    assert.throws(() => buildRetrievalGeneration(generationInput(state, malformed)), /RETRIEVAL_CHUNK_/u, name);
    assert.equal(existsSync(state), false, `${name} must not create derived state or publish a pointer`);
  }
});

test("chunkMarkdown rejects coercive source envelopes before derived publication", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-source-envelope-"));
  const base = {
    source_id: "018f0000-0000-7000-8000-000000000232",
    source_path: "source.md",
    text: "# Source\nBody.\n",
    lineage_id: null,
    valid_from: null,
    valid_to: null,
    supersedes: [],
    superseded_by: [],
    metadata: { sensitivity: "public", custom: { safe: true } },
  };
  let getterCalls = 0;
  const accessor = { ...base };
  Object.defineProperty(accessor, "metadata", {
    enumerable: true,
    get() { getterCalls++; return { sensitivity: "public" }; },
  });
  const symbolKey = { ...base };
  symbolKey[Symbol("hidden")] = "secret-id";
  const exotic = Object.assign(Object.create({ inherited: true }), base);
  const cases = [
    ["supersedes-string", { ...base, supersedes: "abc" }],
    ["superseded-by-item", { ...base, superseded_by: [7] }],
    ["metadata-array", { ...base, metadata: ["secret-id"] }],
    ["metadata-string", { ...base, metadata: "secret" }],
    ["metadata-known-shape", { ...base, metadata: { sensitivity: "public", tags: "not-an-array" } }],
    ["metadata-unsafe-quality", { ...base, metadata: { sensitivity: "public", quality: 2 } }],
    ["metadata-undefined", { ...base, metadata: { sensitivity: "public", custom: undefined } }],
    ["lineage-number", { ...base, lineage_id: 7 }],
    ["valid-from-array", { ...base, valid_from: [] }],
    ["unexpected-field", { ...base, unexpected: true }],
    ["unpaired-source-text", { ...base, text: "# Source\n\ud800" }],
    ["accessor", accessor],
    ["symbol-key", symbolKey],
    ["exotic-prototype", exotic],
  ];
  for (const [name, malformed] of cases) {
    const state = join(root, name);
    assert.throws(() => {
      const chunks = chunkMarkdown(malformed);
      buildRetrievalGeneration(generationInput(state, chunks));
    }, /RETRIEVAL_(?:SOURCE_ENVELOPE|CHUNK_METADATA)/u, name);
    assert.equal(existsSync(state), false, `${name} must not create a database or pointer`);
  }
  assert.equal(getterCalls, 0, "source-envelope validation must not invoke accessors");
});

test("tampered FTS projection is rejected and same-digest rebuild quarantines it", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-corrupt-"));
  const chunks = await source(root, "one", "018f0000-0000-7000-8000-000000000205", "Needle.");
  const input = generationInput(join(root, "state"), chunks);
  const built = buildRetrievalGeneration(input);
  const database = new DatabaseSync(built.database_path);
  database.exec("DELETE FROM chunk_fts");
  database.close();
  assert.throws(() => new RetrievalCoordinator(built.database_path, coordinatorOptions(root)), /FTS_PROJECTION_MISMATCH/);
  const rebuilt = buildRetrievalGeneration(input);
  const verified = new RetrievalCoordinator(rebuilt.database_path, coordinatorOptions(root));
  verified.close();
  assert.ok((await readdir(input.state_directory)).some((name) => name.includes(".corrupt-")));
});

test("direct SQLite store rejects hard-link aliases", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-hardlink-"));
  const chunks = await source(root, "one", "018f0000-0000-7000-8000-000000000216", "Needle.");
  const built = buildRetrievalGeneration(generationInput(join(root, "state"), chunks));
  const alias = join(root, "alias.sqlite");
  await link(built.database_path, alias);
  assert.throws(() => new RetrievalCoordinator(alias, coordinatorOptions(root)), /ALIAS_REJECTED/);
  await unlink(alias);
  const store = new RetrievalCoordinator(built.database_path, coordinatorOptions(root));
  store.close();
});

test("SQLite WAL/SHM sidecars are rejected and quarantined before same-name replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-sidecar-"));
  const chunks = await source(root, "one", "018f0000-0000-7000-8000-000000000217", "Needle.");
  const input = generationInput(join(root, "state"), chunks);
  const built = buildRetrievalGeneration(input);
  await writeFile(`${built.database_path}-wal`, "untrusted crash-era WAL", "utf8");
  assert.throws(() => new RetrievalCoordinator(built.database_path, coordinatorOptions(root)), /SIDECAR_REJECTED/);
  const rebuilt = buildRetrievalGeneration(input);
  const names = await readdir(input.state_directory);
  assert.ok(names.some((name) => name.includes(".corrupt-") && !name.endsWith("-wal") && !name.endsWith("-shm")));
  assert.ok(names.some((name) => name.includes(".corrupt-") && name.endsWith("-wal")));
  const store = new RetrievalCoordinator(rebuilt.database_path, coordinatorOptions(root));
  store.close();
});

test("verified generations remain read-only and never create WAL/SHM sidecars", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-readonly-"));
  const chunks = await source(root, "one", "018f0000-0000-7000-8000-00000000021a", "Needle.");
  const state = join(root, "state");
  const input = generationInput(state, chunks);
  const built = buildRetrievalGeneration(input);
  if (process.platform !== "win32") {
    assert.equal((await stat(state)).mode & 0o777, 0o700);
    assert.equal((await stat(built.database_path)).mode & 0o777, 0o600);
    assert.equal((await stat(built.pointer_path)).mode & 0o777, 0o600);
    await chmod(state, 0o777);
    await chmod(built.database_path, 0o666);
    await chmod(built.pointer_path, 0o666);
    buildRetrievalGeneration(input);
    assert.equal((await stat(state)).mode & 0o777, 0o700, "existing state mode is repaired");
    assert.equal((await stat(built.database_path)).mode & 0o777, 0o600, "existing database mode is repaired");
    assert.equal((await stat(built.pointer_path)).mode & 0o777, 0o600, "existing pointer mode is repaired");
  }
  assert.equal(existsSync(`${built.database_path}-wal`), false);
  assert.equal(existsSync(`${built.database_path}-shm`), false);

  const store = new RetrievalCoordinator(built.database_path, coordinatorOptions(root));
  assert.equal(store.store, undefined, "raw store is not a public coordinator property");
  assert.equal(store.database, undefined, "SQLite handle is not reflectively exposed");
  assert.equal((await store.search({ query: "Needle", limit: 1 })).hits.length, 1);
  assert.equal(existsSync(`${built.database_path}-wal`), false);
  assert.equal(existsSync(`${built.database_path}-shm`), false);
  store.close();

  assert.equal(existsSync(`${built.database_path}-wal`), false);
  assert.equal(existsSync(`${built.database_path}-shm`), false);
  await rm(root, { recursive: true, force: true });
});

test("active pointer reads are bounded before JSON allocation", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-pointer-"));
  const chunks = await source(root, "one", "018f0000-0000-7000-8000-000000000218", "Needle.");
  const built = buildRetrievalGeneration(generationInput(join(root, "state"), chunks));
  await writeFile(built.pointer_path, Buffer.alloc(1_048_577, 0x20));
  assert.throws(() => RetrievalCoordinator.openActive(join(root, "state"), coordinatorOptions(root)), /POINTER_SIZE_EXCEEDED/);
});

test("vault source reader rejects a symlinked or junction vault root before child reads", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-vault-root-alias-"));
  const actualVault = join(root, "actual-vault");
  const aliasVault = join(root, "alias-vault");
  await mkdir(actualVault);
  await writeFile(join(actualVault, "note.md"), "# Note\nExact bytes.\n", "utf8");

  assert.equal((await vaultSourceReader(actualVault)("note.md")).toString(), "# Note\nExact bytes.\n");
  try {
    await symlink(actualVault, aliasVault, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EACCES", "EINVAL", "ENOTSUP", "EPERM"].includes(error?.code)) {
      t.skip(`directory aliases are unavailable on this host (${error.code})`);
      await rm(root, { recursive: true, force: true });
      return;
    }
    throw error;
  }

  await assert.rejects(vaultSourceReader(aliasVault)("note.md"), /SOURCE_ROOT_ALIAS_REJECTED/);
  await rm(root, { recursive: true, force: true });
});

test("state path comparison is platform-sensitive and parent-directory aliases are rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-path-case-"));
  const chunks = await source(root, "one", "018f0000-0000-7000-8000-000000000219", "Needle.");
  const actualState = join(root, "State");
  const built = buildRetrievalGeneration(generationInput(actualState, chunks));
  if (process.platform === "win32") {
    const alternateDriveCase = `${built.database_path[0] === built.database_path[0].toLowerCase() ? built.database_path[0].toUpperCase() : built.database_path[0].toLowerCase()}${built.database_path.slice(1)}`;
    const store = new RetrievalCoordinator(alternateDriveCase, coordinatorOptions(root));
    store.close();
    return;
  }
  let aliasState = join(root, "state");
  try { await symlink(actualState, aliasState, "dir"); }
  catch (error) {
    if (error.code === "EEXIST") {
      aliasState = join(root, "state-alias");
      await symlink(actualState, aliasState, "dir");
    } else {
      throw error;
    }
  }
  assert.throws(() => buildRetrievalGeneration(generationInput(aliasState, chunks)), /STATE_(?:DIRECTORY_SYMLINK|ANCESTOR_ALIAS)_REJECTED/);
  assert.throws(() => new RetrievalCoordinator(join(aliasState, basename(built.database_path)), coordinatorOptions(root)), /DATABASE_ALIAS_REJECTED/);
  assert.throws(() => buildRetrievalGeneration(generationInput(join(aliasState, "must-not-be-created", "state"), chunks)), /STATE_ANCESTOR_ALIAS_REJECTED/);
  await assert.rejects(access(join(actualState, "must-not-be-created")));
});

test("source envelopes are uniform and mixed per-chunk policy decisions deny the whole record", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-policy-"));
  const text = "# Hidden parent\nParent secret.\n\n## Public child\nNeedle visible.\n";
  await writeFile(join(root, "mixed.md"), text, "utf8");
  const chunks = chunkMarkdown({
    source_id: "018f0000-0000-7000-8000-000000000206", source_path: "mixed.md", text,
    metadata: { sensitivity: "public" },
  });
  const mixed = chunks.map((chunk) => ({ ...chunk, metadata: { ...chunk.metadata } }));
  mixed[0].metadata.sensitivity = "secret";
  assert.throws(() => buildRetrievalGeneration(generationInput(join(root, "mixed-state"), mixed)), /SOURCE_ENVELOPE_CONFLICT/);
  const indexed = await indexRetrievalGeneration(generationInput(join(root, "state"), chunks));
  const coordinator = new RetrievalCoordinator(indexed.generation.database_path, {
    discoverability_policy: (chunk) => chunk.heading_depth === 1 ? "deny" : "allow",
    source_reader: vaultSourceReader(root),
  });
  const result = await coordinator.search({ query: "Needle", limit: 5, parent_expansion: true, filters: { sensitivity_ceiling: "public" } });
  assert.equal(result.hits.length, 0);
  assert.equal(result.eligible_result_count, 0);
  coordinator.close();
});

test("stale source bytes are excluded before scoring and Unicode spans round-trip exactly", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-citation-"));
  const chunks = await source(root, "unicode", "018f0000-0000-7000-8000-000000000207", "İstanbul, Café, and Café remain exact.");
  const indexed = await indexRetrievalGeneration(generationInput(join(root, "state"), chunks));
  const coordinator = new RetrievalCoordinator(indexed.generation.database_path, coordinatorOptions(root));
  const exact = await coordinator.search({ query: "İSTANBUL", limit: 5 });
  assert.equal(exact.hits.length, 1);
  const span = exact.hits[0].citation.matched_spans[0];
  const live = await readFile(join(root, "unicode.md"));
  assert.equal(live.subarray(span.start_byte, span.end_byte).toString("utf8"), span.text);
  const accent = await coordinator.search({ query: "cafe", limit: 5 });
  assert.deepEqual(accent.hits[0].citation.matched_spans.map((item) => item.text), ["Café", "Café"]);
  for (const item of accent.hits[0].citation.matched_spans) {
    assert.equal(live.subarray(item.start_byte, item.end_byte).toString("utf8"), item.text);
  }
  await writeFile(join(root, "unicode.md"), "# unicode\nChanged.\n", "utf8");
  const stale = await coordinator.search({ query: "İSTANBUL", limit: 5 });
  assert.equal(stale.hits.length, 0);
  assert.equal(stale.projection_freshness, "stale");
  assert.ok(stale.confidence.reason_codes.includes("STALE_PROJECTION"));
  coordinator.close();
});

test("live CRLF and multibyte line verification rejects forged absolute citation lines", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-forged-lines-"));
  const text = "# Héading 😀\r\nFirst line.\r\n\r\n## Child\r\nNeedle café.\r\n";
  await writeFile(join(root, "lines.md"), text, "utf8");
  const chunks = chunkMarkdown({
    source_id: "018f0000-0000-7000-8000-000000000225",
    source_path: "lines.md",
    text,
    metadata: { sensitivity: "public" },
  });
  const valid = buildRetrievalGeneration(generationInput(join(root, "valid-state"), chunks));
  const validCoordinator = new RetrievalCoordinator(valid.database_path, coordinatorOptions(root));
  const validResult = await validCoordinator.search({ query: "cafe", limit: 1 });
  assert.equal(validResult.hits.length, 1);
  assert.equal(validResult.hits[0].citation.start_line, chunks[1].start_line);
  validCoordinator.close();

  const forged = structuredClone(chunks);
  forged[1].start_line += 1;
  forged[1].end_line += 1;
  const invalid = buildRetrievalGeneration(generationInput(join(root, "forged-state"), forged));
  const invalidCoordinator = new RetrievalCoordinator(invalid.database_path, coordinatorOptions(root));
  const rejected = await invalidCoordinator.search({ query: "cafe", limit: 1 });
  assert.equal(rejected.hits.length, 0);
  assert.equal(rejected.projection_freshness, "stale");
  assert.ok(rejected.confidence.reason_codes.includes("STALE_PROJECTION"));
  invalidCoordinator.close();
});

test("unresolved and unknown relationship metadata is suppressed from Phase 1 result chunks", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-relations-"));
  const chunks = await source(root, "relation", "018f0000-0000-7000-8000-000000000215", "Needle relation.", {
    moc_relationships: ["hidden-target"],
    related_to: ["hidden-related-target"],
    custom_relationship: { target: "hidden-custom-target" },
    hidden_path: "secret/hidden.md",
    author_agent_id: "hidden-agent",
  });
  chunks[0].supersedes = ["hidden-predecessor"];
  chunks[0].superseded_by = ["hidden-successor"];
  const indexed = await indexRetrievalGeneration(generationInput(join(root, "state"), chunks));
  const coordinator = new RetrievalCoordinator(indexed.generation.database_path, coordinatorOptions(root));
  const result = await coordinator.search({ query: "Needle", limit: 1 });
  assert.deepEqual(result.hits[0].chunk.supersedes, []);
  assert.deepEqual(result.hits[0].chunk.superseded_by, []);
  assert.equal(result.hits[0].chunk.metadata.moc_relationships, undefined);
  assert.equal(result.hits[0].chunk.metadata.related_to, undefined);
  assert.equal(result.hits[0].chunk.metadata.custom_relationship, undefined);
  assert.equal(result.hits[0].chunk.metadata.hidden_path, undefined);
  assert.equal(result.hits[0].chunk.metadata.author_agent_id, undefined);
  assert.equal(result.hits[0].chunk.metadata.title, "relation", "safe source-local metadata remains available");

  const guessedFilters = [
    { moc_relationships: ["hidden-target"] },
    { moc_relationships: ["wrong-target"] },
    { author_agent_ids: ["hidden-agent"] },
    { author_agent_ids: ["wrong-agent"] },
  ];
  const failures = [];
  for (const filters of guessedFilters) {
    await assert.rejects(coordinator.search({ query: "Needle", limit: 1, filters }), (error) => {
      failures.push({ name: error.name, message: error.message });
      return error.message === "RETRIEVAL_FILTER_AUTHORIZED_RESOLVER_REQUIRED";
    });
  }
  assert.deepEqual(failures, Array(guessedFilters.length).fill(failures[0]), "correct and incorrect guesses expose no result/count/confidence oracle");
  coordinator.close();
});

test("public search rejects unknown or malformed typed filters before policy, source, or provider work", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-request-validation-"));
  const chunks = await source(root, "request", "018f0000-0000-7000-8000-000000000224", "Needle request.");
  const indexed = await indexRetrievalGeneration(generationInput(join(root, "state"), chunks));
  const calls = { policy: 0, source: 0, vector: 0, rerank: 0 };
  const coordinator = new RetrievalCoordinator(indexed.generation.database_path, {
    discoverability_policy: () => { calls.policy++; return "allow"; },
    source_reader: async () => { calls.source++; return readFile(join(root, "request.md")); },
    vector_provider: {
      kind: "mcp", provider_id: "unused", model_id: "unused", dimensions: 2, timeout_ms: 100,
      async embed(texts) { calls.vector++; return texts.map(() => Float32Array.from([1, 0])); },
    },
    rerank_provider: {
      kind: "mcp", provider_id: "unused-rerank", model_id: "unused-rerank", timeout_ms: 100,
      async rerank(_query, inputs) { calls.rerank++; return inputs.map((item) => ({ chunk_id: item.chunk_id, score: 1 })); },
    },
  });
  const malformed = [
    { query: "Needle", unknown_request_key: true },
    { query: "Needle", limit: "5" },
    { query: "Needle", mmr: "true" },
    { query: "Needle", filters: null },
    { query: "Needle", filters: { typo: ["value"] } },
    { query: "Needle", filters: { topics: "topic" } },
    { query: "Needle", filters: { source_digests: "sha256:bad" } },
    { query: "Needle", filters: { authoritative: "true" } },
    { query: "Needle", filters: { include_archives: 1 } },
    { query: "Needle", filters: { minimum_quality: Number.NaN } },
    { query: "Needle", filters: { tags_any: ["safe", 7] } },
    { query: "Needle", filters: { path_include: ["../hidden/**"] } },
    { query: "Needle", filters: { path_exclude: ["folder\\hidden.md"] } },
    { query: "Needle", filters: { authored_from: "2026-08-20T12:00" } },
  ];
  for (const request of malformed) {
    await assert.rejects(coordinator.search(request), (error) => /^RETRIEVAL_(?:REQUEST|FILTER)_/u.test(error.message));
  }
  assert.deepEqual(calls, { policy: 0, source: 0, vector: 0, rerank: 0 });
  coordinator.close();
});

test("fixed vector provider is validated, hybrid search works, and failures degrade to FTS", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-vector-"));
  const chunks = [
    ...await source(root, "alpha", "018f0000-0000-7000-8000-000000000208", "Alpha lexical."),
    ...await source(root, "beta", "018f0000-0000-7000-8000-000000000209", "Beta semantic."),
  ];
  const vectorProvider = {
    kind: "mcp", provider_id: "fixed", model_id: "fixed-2d", dimensions: 2,
    async embed(texts) { return texts.map((text) => Float32Array.from(/beta|meaning/iu.test(text) ? [1, 0] : [0, 1])); },
  };
  const indexed = await indexRetrievalGeneration(generationInput(join(root, "state"), chunks), vectorProvider);
  assert.equal(indexed.vector_stage.state, "active");
  const coordinator = new RetrievalCoordinator(indexed.generation.database_path, coordinatorOptions(root, { vector_provider: vectorProvider }));
  const hybrid = await coordinator.search({ query: "meaning", limit: 2 });
  assert.equal(hybrid.stages.vector.state, "active");
  assert.equal(hybrid.hits[0].chunk.source_path, "beta.md");
  const malformed = { ...vectorProvider, async embed() { return [Float32Array.from([Number.NaN, 0])]; } };
  const degraded = new RetrievalCoordinator(indexed.generation.database_path, coordinatorOptions(root, { vector_provider: malformed }));
  const lexical = await degraded.search({ query: "Alpha", limit: 2 });
  assert.equal(lexical.stages.vector.state, "degraded");
  assert.equal(lexical.hits[0].chunk.source_path, "alpha.md");
  const mismatched = { ...vectorProvider, model_id: "different-space", async embed() { return [Float32Array.from([1, 0])]; } };
  const mismatchCoordinator = new RetrievalCoordinator(indexed.generation.database_path, coordinatorOptions(root, { vector_provider: mismatched }));
  await assert.rejects(mismatchCoordinator.search({ query: "Alpha", limit: 2 }), /VECTOR_SPACE_MISMATCH_REBUILD_REQUIRED/);
  coordinator.close();
  degraded.close();
  mismatchCoordinator.close();
});

test("provider failures degrade but post-open vector-store corruption propagates", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-vector-integrity-"));
  const chunks = await source(root, "vector-integrity", "018f0000-0000-7000-8000-000000000230", "Vector integrity evidence.");
  const provider = {
    kind: "mcp", provider_id: "integrity-provider", model_id: "integrity-2d", dimensions: 2,
    async embed(texts) { return texts.map(() => Float32Array.from([1, 0])); },
  };
  const indexed = await indexRetrievalGeneration(generationInput(join(root, "state"), chunks), provider);

  const unavailable = {
    ...provider,
    async embed() { throw new Error("provider unavailable"); },
  };
  const degraded = new RetrievalCoordinator(indexed.generation.database_path, coordinatorOptions(root, { vector_provider: unavailable }));
  const lexical = await degraded.search({ query: "integrity", limit: 1 });
  assert.equal(lexical.stages.vector.state, "degraded");
  assert.deepEqual(lexical.stages.vector.reason_codes, ["VECTOR_UNAVAILABLE"]);
  degraded.close();

  const coordinator = new RetrievalCoordinator(indexed.generation.database_path, coordinatorOptions(root, { vector_provider: provider }));
  const writer = new DatabaseSync(indexed.generation.database_path);
  try {
    writer.prepare("UPDATE chunk_vectors SET vector_json = ?").run("not-json");
  } finally {
    writer.close();
  }
  await assert.rejects(
    coordinator.search({ query: "integrity", limit: 1 }),
    (error) => error instanceof SyntaxError,
    "persisted vector corruption must not be swallowed as VECTOR_UNAVAILABLE",
  );
  coordinator.close();
});

test("vector retrieval joins only the policy-eligible ID set before rows reach scoring", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-vector-policy-"));
  const chunks = [
    ...await source(root, "public-vector", "018f0000-0000-7000-8000-000000000222", "Public semantic.", { sensitivity: "public" }),
    ...await source(root, "hidden-vector", "018f0000-0000-7000-8000-000000000223", "Hidden strongest semantic.", { sensitivity: "secret" }),
  ];
  const provider = {
    kind: "mcp", provider_id: "policy-vector", model_id: "policy-vector-2d", dimensions: 2,
    async embed(texts) {
      return texts.map((text) => Float32Array.from(/hidden|meaning/iu.test(text) ? [1, 0] : [0, 1]));
    },
  };
  const indexed = await indexRetrievalGeneration(generationInput(join(root, "state"), chunks), provider);
  const coordinator = new RetrievalCoordinator(indexed.generation.database_path, {
    discoverability_policy: (chunk) => chunk.metadata.sensitivity === "public" ? "allow" : "deny",
    source_reader: vaultSourceReader(root),
    vector_provider: provider,
  });
  const result = await coordinator.search({ query: "meaning", limit: 5 });
  assert.deepEqual(result.hits.map((hit) => hit.chunk.source_path), ["public-vector.md"]);
  coordinator.close();

  const implementation = await readFile(new URL("../src/retrieval/sqlite-store.ts", import.meta.url), "utf8");
  assert.match(
    implementation,
    /FROM chunk_vectors AS v\s+JOIN retrieval_eligible AS e ON e\.chunk_id = v\.chunk_id\s+JOIN chunks AS c/,
    "vector rows are policy-pruned by SQLite before JS scoring",
  );
  assert.match(implementation, /PRAGMA temp_store = MEMORY/, "eligible ID tables cannot spill outside protected state");
});

test("coordinator deadlines abort and degrade hanging index, query, and rerank providers", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-provider-deadline-"));
  const chunks = await source(root, "deadline", "018f0000-0000-7000-8000-000000000224", "Deadline evidence.");
  const state = join(root, "state");
  const hanging = (identity, onAbort) => ({
    ...identity,
    timeout_ms: 20,
    embed(_texts, context) {
      return new Promise((_resolve, reject) => {
        context.signal.addEventListener("abort", () => { onAbort(); reject(new Error("aborted")); }, { once: true });
      });
    },
  });

  let indexAborted = false;
  const indexResult = await indexRetrievalGeneration(generationInput(state, chunks), hanging({
    kind: "mcp", provider_id: "deadline-provider", model_id: "deadline-model", dimensions: 2,
  }, () => { indexAborted = true; }));
  assert.equal(indexResult.vector_stage.state, "degraded");
  assert.equal(indexAborted, true);

  const working = {
    kind: "mcp", provider_id: "deadline-provider", model_id: "deadline-model", dimensions: 2, timeout_ms: 100,
    async embed(texts) { return texts.map(() => Float32Array.from([1, 0])); },
  };
  const hybrid = await indexRetrievalGeneration(generationInput(state, chunks, { fixture: 2 }), working);
  let queryAborted = false;
  const queryProvider = hanging(working, () => { queryAborted = true; });
  const queryCoordinator = new RetrievalCoordinator(hybrid.generation.database_path, coordinatorOptions(root, { vector_provider: queryProvider }));
  const queryResult = await queryCoordinator.search({ query: "Deadline", limit: 1 });
  assert.equal(queryResult.stages.vector.state, "degraded");
  assert.equal(queryAborted, true);
  queryCoordinator.close();

  let rerankAborted = false;
  const reranker = {
    kind: "mcp", provider_id: "deadline-reranker", model_id: "deadline-reranker-model", timeout_ms: 20,
    rerank(_query, _inputs, context) {
      return new Promise((_resolve, reject) => {
        context.signal.addEventListener("abort", () => { rerankAborted = true; reject(new Error("aborted")); }, { once: true });
      });
    },
  };
  const rerankCoordinator = new RetrievalCoordinator(hybrid.generation.database_path, coordinatorOptions(root, { rerank_provider: reranker }));
  const rerankResult = await rerankCoordinator.search({ query: "Deadline", limit: 1 });
  assert.equal(rerankResult.stages.reranker.state, "degraded");
  assert.equal(rerankAborted, true);
  rerankCoordinator.close();
});

test("verified active vectors are reused by provider/model/content digest across a one-section edit", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-vector-cache-"));
  const state = join(root, "state");
  const sourceId = "018f0000-0000-7000-8000-000000000220";
  const beforeText = "# One\nUnchanged one.\n\n## Two\nChanged before.\n\n## Three\nUnchanged three.\n";
  const afterText = beforeText.replace("Changed before.", "Changed after.");
  const chunksBefore = chunkMarkdown({ source_id: sourceId, source_path: "cache.md", text: beforeText, metadata: { sensitivity: "public" } });
  const chunksAfter = chunkMarkdown({ source_id: sourceId, source_path: "cache.md", text: afterText, metadata: { sensitivity: "public" } });
  const calls = [];
  const provider = {
    kind: "mcp", provider_id: "cache-provider", model_id: "cache-model", dimensions: 2,
    async embed(texts) { calls.push([...texts]); return texts.map(() => Float32Array.from([1, 0])); },
  };
  await indexRetrievalGeneration(generationInput(state, chunksBefore), provider);
  const second = await indexRetrievalGeneration(generationInput(state, chunksAfter), provider);
  assert.deepEqual(calls.map((batch) => batch.length), [3, 1]);
  assert.match(calls[1][0], /Changed after/);

  await writeFile(second.generation.pointer_path, "{corrupt active pointer", "utf8");
  const recovered = await indexRetrievalGeneration(generationInput(state, chunksAfter, { fixture: 2 }), provider);
  assert.equal(recovered.vector_stage.state, "active");
  assert.deepEqual(calls.map((batch) => batch.length), [3, 1, 3], "corrupt prior state is a cache miss, not mixed or fatal");

  const mismatchCalls = [];
  const differentSpace = {
    ...provider, model_id: "different-cache-model",
    async embed(texts) { mismatchCalls.push([...texts]); return texts.map(() => Float32Array.from([0, 1])); },
  };
  await indexRetrievalGeneration(generationInput(state, chunksAfter, { fixture: 3 }), differentSpace);
  assert.deepEqual(mismatchCalls.map((batch) => batch.length), [3]);
});

test("rerank order remains the relevance input when MMR is enabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-rerank-"));
  const chunks = [
    ...await source(root, "a", "018f0000-0000-7000-8000-000000000211", "Common one."),
    ...await source(root, "b", "018f0000-0000-7000-8000-000000000212", "Common two."),
    ...await source(root, "c", "018f0000-0000-7000-8000-000000000213", "Common three."),
  ];
  const indexed = await indexRetrievalGeneration(generationInput(join(root, "state"), chunks));
  const rerank = {
    kind: "mcp", provider_id: "fixed-rerank", model_id: "fixed-rerank-model",
    async rerank(_query, inputs) { return inputs.map((item) => ({ chunk_id: item.chunk_id, score: item.text.includes("three") ? 3 : item.text.includes("two") ? 2 : 1 })); },
  };
  const coordinator = new RetrievalCoordinator(indexed.generation.database_path, coordinatorOptions(root, { rerank_provider: rerank }));
  const result = await coordinator.search({ query: "Common", limit: 3, mmr: true });
  assert.deepEqual(result.hits.map((hit) => hit.chunk.source_path), ["c.md", "b.md", "a.md"]);
  assert.equal(result.stages.reranker.state, "active");
  coordinator.close();
});

test("hard chunk and result byte limits remain UTF-8 safe", async () => {
  const text = `# Huge\n${"😀".repeat(RETRIEVAL_MAX_CHUNK_BYTES)}\n`;
  const chunks = chunkMarkdown({
    source_id: "018f0000-0000-7000-8000-000000000214", source_path: "huge.md", text,
    metadata: { sensitivity: "public" },
  });
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(Buffer.byteLength(chunk.text, "utf8") <= RETRIEVAL_MAX_CHUNK_BYTES);
    assert.equal(Buffer.from(chunk.text, "utf8").toString("utf8"), chunk.text);
  }

  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-result-budget-"));
  const budgetText = `# Parent\n${"p".repeat(12_000)}\n\n## Child\nNeedle ${"c".repeat(6_000)}\n`;
  await writeFile(join(root, "budget.md"), budgetText, "utf8");
  const budgetChunks = chunkMarkdown({
    source_id: "018f0000-0000-7000-8000-000000000221", source_path: "budget.md", text: budgetText,
    metadata: { sensitivity: "public" },
  });
  const indexed = await indexRetrievalGeneration(generationInput(join(root, "state"), budgetChunks));
  const roomyCoordinator = new RetrievalCoordinator(indexed.generation.database_path, {
    discoverability_policy: () => "allow", source_reader: vaultSourceReader(root), max_parent_bytes: 65_536, max_result_bytes: 65_536,
  });
  const roomy = await roomyCoordinator.search({ query: "Needle", limit: 1, parent_expansion: true });
  assert.ok(roomy.hits[0].parent_context, "undersized child should expand when its parent fits");
  const childTokens = roomy.hits[0].chunk.token_count;
  const thresholdCoordinator = new RetrievalCoordinator(indexed.generation.database_path, {
    discoverability_policy: () => "allow", source_reader: vaultSourceReader(root), max_parent_bytes: 65_536, max_result_bytes: 65_536,
  });
  const thresholded = await thresholdCoordinator.search({ query: "Needle", limit: 1, parent_expansion: true, parent_expansion_max_child_tokens: childTokens });
  assert.equal(thresholded.hits[0].parent_context, undefined, "threshold comparison is strictly less than");
  const boundedCoordinator = new RetrievalCoordinator(indexed.generation.database_path, {
    discoverability_policy: () => "allow", source_reader: vaultSourceReader(root), max_parent_bytes: 65_536, max_result_bytes: 16_384,
  });
  const bounded = await boundedCoordinator.search({ query: "Needle", limit: 1, parent_expansion: true });
  assert.equal(bounded.hits.length, 1, "a fitting winner is retained");
  assert.equal(bounded.hits[0].parent_context, undefined, "optional parent is omitted when it exceeds the remaining budget");
  assert.ok(bounded.hits.reduce((sum, hit) => sum + Buffer.byteLength(hit.chunk.text, "utf8") + (hit.parent_context ? Buffer.byteLength(hit.parent_context.text, "utf8") : 0), 0) <= 16_384);
  roomyCoordinator.close();
  thresholdCoordinator.close();
  boundedCoordinator.close();
});

test("overlap-region evidence is cited once after deterministic ranked de-duplication", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-overlap-dedup-"));
  const text = "# Overlap\none two three four five six seven eight nine ten eleven twelve thirteen NEEDLE fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive\n";
  await writeFile(join(root, "overlap.md"), text, "utf8");
  const chunks = chunkMarkdown({
    source_id: "018f0000-0000-7000-8000-000000000225",
    source_path: "overlap.md",
    text,
    metadata: { sensitivity: "public" },
  }, { max_tokens: 16, overlap_tokens: 4 });
  assert.equal(chunks.filter((chunk) => chunk.text.includes("NEEDLE")).length, 2, "fixture term lies in both overlapping chunks");
  const indexed = await indexRetrievalGeneration(generationInput(join(root, "state"), chunks));
  const coordinator = new RetrievalCoordinator(indexed.generation.database_path, coordinatorOptions(root));
  const first = await coordinator.search({ query: "NEEDLE", limit: 5 });
  const second = await coordinator.search({ query: "NEEDLE", limit: 5 });
  assert.equal(first.hits.length, 1);
  assert.deepEqual(first.hits.map((hit) => hit.chunk.chunk_id), second.hits.map((hit) => hit.chunk.chunk_id));
  const expectedStart = Buffer.byteLength(text.slice(0, text.indexOf("NEEDLE")), "utf8");
  assert.deepEqual(first.hits.flatMap((hit) => hit.citation.matched_spans).map((span) => [span.start_byte, span.end_byte]), [[expectedStart, expectedStart + 6]]);
  coordinator.close();
});

test("public retrieval surface exposes only policy-gated search, never raw store readers", () => {
  for (const forbidden of [
    "SqliteRetrievalStore",
    "openActiveRetrievalStore",
    "listChunks",
    "getChunk",
    "lexicalSearch",
    "vectorSearch",
  ]) assert.equal(forbidden in retrievalPublic, false, `${forbidden} must not be exported`);
  assert.equal(typeof retrievalPublic.RetrievalCoordinator, "function");
  assert.equal(typeof retrievalPublic.buildRetrievalGeneration, "function");
});
