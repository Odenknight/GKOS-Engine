import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { main, runSearch, scanCorpus } from "../bin/gkx.mjs";
import { detectSqliteLexicalCapability } from "../dist/retrieval.mjs";

const VALID = `---
gkx_version: "2.3"
uid: "019b2d14-4230-7db7-87d4-7d81cfaecb01"
title: "Retrieval policy"
type: "note"
created_at: "2026-08-20T12:00:00Z"
epistemic_state: "hypothesis"
sensitivity: "public"
authorship_origin: "authored"
---
# Retrieval policy

Deterministic retrieval cites exact sources.
`;

const INVALID = `---
gkx_version: "2.3"
uid: "not-a-canonical-uid"
title: "Invalid"
type: "note"
created_at: "2026-08-20T12:00:00Z"
epistemic_state: "hypothesis"
sensitivity: "public"
---
# Invalid

Deterministic text from an invalid record must not be partially indexed.
`;

test("additive gkx search indexes valid records, rejects malformed records whole, and preserves source bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-cli-"));
  const validPath = join(root, "valid.md"), invalidPath = join(root, "invalid.md"), configPath = join(root, "gkos.toml");
  await Promise.all([
    writeFile(validPath, VALID, "utf8"),
    writeFile(invalidPath, INVALID, "utf8"),
    writeFile(configPath, "config_version = 1\n[retrieval]\nmode = \"fts\"\n", "utf8"),
  ]);
  const before = await Promise.all([readFile(validPath), readFile(invalidPath)]);
  const originalError = console.error;
  let warning = "";
  console.error = (...parts) => { warning += parts.join(" "); };
  let result;
  try { result = await runSearch("Deterministic", root, 5, { configPath }); }
  finally { console.error = originalError; }
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].chunk.source_id, "019b2d14-4230-7db7-87d4-7d81cfaecb01");
  assert.equal(result.contract_version, "gkos-retrieval/1.0.0-draft.2");
  assert.equal(result.hits[0].chunk.valid_from, "2026-08-20T12:00:00.000Z", "canonical authored created_at binds valid_from");
  assert.equal(result.hits[0].chunk.valid_to, null);
  assert.equal(result.hits[0].provenance.source_id, result.hits[0].chunk.source_id);
  assert.equal(result.hits[0].provenance.ledger_binding_verified, false);
  assert.deepEqual(result.temporal, { as_of: null, coverage: "not_requested", reason_codes: [] });
  assert.equal(result.hits[0].citation.verified, true);
  const lexicalCapability = detectSqliteLexicalCapability();
  assert.equal(result.stages.lexical.kind, lexicalCapability.default_backend);
  assert.equal(result.stages.lexical.state, lexicalCapability.fts5_available ? "active" : "degraded");
  assert.deepEqual(result.stages.lexical.reason_codes, lexicalCapability.fts5_available
    ? []
    : ["SQLITE_FTS5_UNAVAILABLE", "SQLITE_LEXICAL_SCAN_ACTIVE", "SQLITE_LEXICAL_SCAN_APPROXIMATION"]);
  assert.equal(warning, "", "pre-policy rejection counts are not an ordinary-output oracle");
  const after = await Promise.all([readFile(validPath), readFile(invalidPath)]);
  assert.deepEqual(after, before);
});

test("hidden malformed source presence is byte-noninterfering on ordinary CLI stdout and stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-cli-hidden-invalid-"));
  const configPath = join(root, "operator.toml");
  await writeFile(join(root, "valid.md"), VALID, "utf8");
  await writeFile(configPath, "config_version = 1\n[retrieval]\nmode = \"fts\"\n", "utf8");

  async function invoke() {
    const stdout = [];
    const stderr = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...parts) => { stdout.push(parts.join(" ")); };
    console.error = (...parts) => { stderr.push(parts.join(" ")); };
    try { assert.equal(await main(["search", "Deterministic", "--kb-path", root, "--config", configPath]), 0); }
    finally { console.log = originalLog; console.error = originalError; }
    return { stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  }

  const absent = await invoke();
  await writeFile(join(root, "hidden-invalid.md"), INVALID.replace('sensitivity: "public"', 'sensitivity: "secret"'), "utf8");
  const present = await invoke();
  assert.deepEqual(present, absent);
});

test("policy-bound schema-3 embedding never sends denied source text to the configured provider", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-cli-provider-policy-"));
  const configPath = join(root, "operator.toml");
  const secretPath = join(root, "secret.md");
  await writeFile(join(root, "valid.md"), VALID, "utf8");
  await writeFile(configPath, `config_version = 1
[vectors]
enabled = true
provider = "mcp"
provider_id = "operator-mcp"
model_id = "operator-model"
dimensions = 2
timeout_ms = 100
server = "operator-server"
tool = "embed-anything"
`, "utf8");
  const seen = [];
  const provider = {
    kind: "mcp", provider_id: "operator-mcp", model_id: "operator-model", dimensions: 2, timeout_ms: 100,
    async embed(texts) { seen.push(...texts); return texts.map(() => Float32Array.of(1, 0)); },
  };
  const absent = await runSearch("Deterministic", root, 5, { configPath, vectorProvider: provider });
  const sentinel = "SENTINEL_SECRET_BODY_MUST_NOT_REACH_PROVIDER";
  const secret = VALID
    .replace('sensitivity: "public"', 'sensitivity: "secret"')
    .replace("Deterministic retrieval cites exact sources.", sentinel);
  await writeFile(secretPath, secret, "utf8");
  const present = await runSearch("Deterministic", root, 5, { configPath, vectorProvider: provider });
  assert.equal(seen.some((text) => text.includes(sentinel)), false);
  assert.deepEqual(present, absent, "a denied duplicate-UID candidate remains local and cannot alter the public result envelope");
  const pointer = JSON.parse(await readFile(join(root, ".gkx", "derived", "retrieval", "active-retrieval.json"), "utf8"));
  assert.equal(pointer.manifest.candidate_source_count, 2, "both duplicate-UID physical candidates are retained");
  assert.equal(pointer.manifest.embedding_eligible_candidate_chunk_count, 1, "only the public record key is provider eligible");
  await rm(secretPath);
});

test("scanner rejects malformed UTF-8 before projection or provider-visible text exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-cli-invalid-utf8-"));
  await writeFile(join(root, "invalid.md"), Buffer.from([0x23, 0x20, 0xc3, 0x28, 0x0a]));
  const scan = await scanCorpus(root);
  assert.deepEqual(scan.files, []);
  assert.equal(existsSync(join(root, ".gkx")), false, "the read-only scan creates no derived state");
  const configPath = join(root, "operator.toml");
  await writeFile(configPath, `config_version = 1
[vectors]
enabled = true
provider = "mcp"
provider_id = "utf8-provider"
model_id = "utf8-model"
dimensions = 1
timeout_ms = 100
server = "operator-server"
tool = "embed-anything"
`, "utf8");
  let providerCalls = 0;
  const result = await runSearch("anything", root, 5, {
    configPath,
    vectorProvider: {
      kind: "mcp", provider_id: "utf8-provider", model_id: "utf8-model", dimensions: 1, timeout_ms: 100,
      async embed(texts) { providerCalls++; return texts.map(() => Float32Array.of(1)); },
    },
  });
  assert.deepEqual(result.hits, []);
  assert.equal(providerCalls, 0);
  const pointer = JSON.parse(await readFile(join(root, ".gkx", "derived", "retrieval", "active-retrieval.json"), "utf8"));
  assert.equal(pointer.manifest.candidate_source_count, 0);
  assert.equal(pointer.manifest.represented_candidate_source_count, 0);
  assert.equal(pointer.manifest.candidate_chunk_count, 0);
  const database = new DatabaseSync(join(root, ".gkx", "derived", "retrieval", pointer.database_file), { readOnly: true });
  try {
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM candidate_sources").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM candidate_chunks").get().count, 0);
  } finally {
    database.close();
  }
});

test("CLI provider selection comes only from trusted config and unavailable local runtime degrades to lexical retrieval", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-cli-provider-"));
  const configPath = join(root, "operator.toml");
  await writeFile(join(root, "valid.md"), VALID, "utf8");
  await writeFile(configPath, `config_version = 1
[vectors]
enabled = true
provider = "local_onnx"
provider_id = "operator-local"
model_id = "operator-model"
dimensions = 2
model_path = "C:/operator/models/model.onnx"
timeout_ms = 50
`, "utf8");
  const result = await runSearch("Deterministic", root, 5, { configPath });
  assert.equal(result.hits.length, 1);
  assert.equal(result.stages.vector.kind, "local_onnx");
  assert.equal(result.stages.vector.state, "degraded");
  assert.ok(result.stages.vector.reason_codes.includes("VECTOR_PROJECTION_UNAVAILABLE"));
});

test("search CLI validates required flags without changing legacy command dispatch", async () => {
  assert.equal(await main(["search"]), 1);
  assert.equal(await main(["search", "query"]), 1);
  assert.equal(await main(["search", "query", "--kb-path", ".", "--limit", "0"]), 2);
});

test("search CLI defaults the omitted optional limit to five", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-cli-limit-"));
  const configPath = join(root, "operator.toml");
  await writeFile(join(root, "valid.md"), VALID, "utf8");
  await writeFile(configPath, "config_version = 1\n[retrieval]\nmode = \"fts\"\n", "utf8");
  const logs = [];
  const originalLog = console.log;
  console.log = (...parts) => { logs.push(parts.join(" ")); };
  try {
    assert.equal(await main(["search", "Deterministic", "--kb-path", root, "--config", configPath]), 0);
  } finally { console.log = originalLog; }
  const result = JSON.parse(logs.at(-1));
  assert.equal(result.hits.length, 1);
});

test("hard-linked source records are rejected whole before derived publication", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-cli-hardlink-"));
  const originalPath = join(root, "original.md");
  const aliasPath = join(root, "alias.md");
  const configPath = join(root, "operator.toml");
  await writeFile(originalPath, VALID.replaceAll("Deterministic", "HARDLINK_ONLY_TERM"), "utf8");
  try { await link(originalPath, aliasPath); }
  catch (error) {
    if (["EPERM", "ENOTSUP", "EACCES"].includes(error?.code)) { t.skip(`hard links unavailable: ${error.code}`); return; }
    throw error;
  }
  await writeFile(configPath, "config_version = 1\n[retrieval]\nmode = \"fts\"\n", "utf8");
  const originalError = console.error;
  console.error = () => {};
  let result;
  try { result = await runSearch("HARDLINK_ONLY_TERM", root, 5, { configPath }); }
  finally { console.error = originalError; }
  assert.equal(result.hits.length, 0);
  const pointer = JSON.parse(await readFile(join(root, ".gkx", "derived", "retrieval", "active-retrieval.json"), "utf8"));
  assert.equal(pointer.manifest.candidate_source_count, 0);
  assert.equal(pointer.manifest.candidate_chunk_count, 0, "hard-link bytes never enter the derived database");
});

test("source snapshot identity binds rejected observations without indexing their bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-cli-rejected-snapshot-"));
  const configPath = join(root, "operator.toml");
  const invalidPath = join(root, "invalid.md");
  await writeFile(join(root, "valid.md"), VALID, "utf8");
  await writeFile(invalidPath, INVALID, "utf8");
  await writeFile(configPath, "config_version = 1\n[retrieval]\nmode = \"fts\"\n", "utf8");
  const originalError = console.error;
  console.error = () => {};
  let first;
  let second;
  try {
    first = await runSearch("Deterministic", root, 5, { configPath });
    const firstPointer = JSON.parse(await readFile(join(root, ".gkx", "derived", "retrieval", "active-retrieval.json"), "utf8"));
    await writeFile(invalidPath, INVALID.replace("Deterministic text", "Changed rejected text"), "utf8");
    second = await runSearch("Deterministic", root, 5, { configPath });
    const secondPointer = JSON.parse(await readFile(join(root, ".gkx", "derived", "retrieval", "active-retrieval.json"), "utf8"));
    assert.notEqual(firstPointer.manifest.source_snapshot_digest, secondPointer.manifest.source_snapshot_digest);
    assert.notEqual(firstPointer.manifest.projection_digest, secondPointer.manifest.projection_digest);
    assert.notEqual(firstPointer.database_file, secondPointer.database_file);
    assert.equal(secondPointer.manifest.candidate_source_count, 1);
    assert.equal(secondPointer.manifest.represented_candidate_source_count, 1);
  } finally { console.error = originalError; }
  assert.deepEqual(second, first, "rejected bytes alter physical snapshot identity but not the authorized ordinary result");
});

test("schema-3 source snapshot binds topology and source stat inputs without changing scoped results", async () => {
  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-cli-snapshot-inputs-"));
  const sourcePath = join(root, "valid.md");
  const configPath = join(root, "operator.toml");
  await writeFile(sourcePath, VALID, "utf8");
  await writeFile(configPath, "config_version = 1\n[retrieval]\nmode = \"fts\"\n", "utf8");

  const first = await runSearch("Deterministic", root, 5, { configPath });
  const firstPointer = JSON.parse(await readFile(join(root, ".gkx", "derived", "retrieval", "active-retrieval.json"), "utf8"));
  assert.equal(firstPointer.manifest.gkx_standard_commit, "a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6");
  assert.equal(firstPointer.manifest.gkx_projection_profile, "gkx-2.3-validating-projection");

  await mkdir(join(root, "topology-only"));
  await writeFile(join(root, "topology-only", "diagram.png"), "attachment topology", "utf8");
  const withTopology = await runSearch("Deterministic", root, 5, { configPath });
  const topologyPointer = JSON.parse(await readFile(join(root, ".gkx", "derived", "retrieval", "active-retrieval.json"), "utf8"));
  assert.notEqual(topologyPointer.manifest.source_snapshot_digest, firstPointer.manifest.source_snapshot_digest);
  assert.notEqual(topologyPointer.manifest.projection_digest, firstPointer.manifest.projection_digest);
  assert.deepEqual(withTopology, first, "safe folder/attachment topology changes only physical snapshot identity");

  const changedTime = new Date("2026-08-21T12:34:56.000Z");
  await utimes(sourcePath, changedTime, changedTime);
  const withStatChange = await runSearch("Deterministic", root, 5, { configPath });
  const statPointer = JSON.parse(await readFile(join(root, ".gkx", "derived", "retrieval", "active-retrieval.json"), "utf8"));
  assert.notEqual(statPointer.manifest.source_snapshot_digest, topologyPointer.manifest.source_snapshot_digest);
  assert.notEqual(statPointer.manifest.projection_digest, topologyPointer.manifest.projection_digest);
  assert.deepEqual(withStatChange, first, "source stats remain physical inputs without leaking through the scoped result");
});

test("CLI as-of syntax fails before state and minute-only timestamps select the predecessor", async () => {
  const invalidRoot = await mkdtemp(join(tmpdir(), "gkos-retrieval-cli-asof-invalid-"));
  const errors = [];
  const originalError = console.error;
  const originalLog = console.log;
  console.error = (...parts) => { errors.push(parts.join(" ")); };
  console.log = () => {};
  try {
    assert.equal(await main(["search", "Policy", "--kb-path", invalidRoot, "--as-of"]), 2);
    assert.equal(await main(["search", "Policy", "--kb-path", invalidRoot, "--as-of", "not-a-time"]), 2);
  } finally { console.error = originalError; console.log = originalLog; }
  assert.equal(existsSync(join(invalidRoot, ".gkx")), false);
  assert.ok(errors.some((line) => line.includes("requires a GKX timestamp")));
  assert.ok(errors.some((line) => line.includes("canonical GKX timestamp grammar")));

  const root = await mkdtemp(join(tmpdir(), "gkos-retrieval-cli-asof-valid-"));
  const oldUid = "018f0000-0000-7000-8000-000000000211";
  const newUid = "018f0000-0000-7000-8000-000000000212";
  const old = VALID.replace("019b2d14-4230-7db7-87d4-7d81cfaecb01", oldUid)
    .replaceAll("2026-08-20T12:00:00Z", "2026-07-01T00:00:00Z")
    .replace("Deterministic retrieval", "Café 😀 deterministic retrieval");
  const newer = VALID.replace("019b2d14-4230-7db7-87d4-7d81cfaecb01", newUid)
    .replaceAll("2026-08-20T12:00:00Z", "2026-08-01T00:00:00Z")
    .replace("Deterministic retrieval", "Café 😀 deterministic retrieval")
    .replace("authorship_origin: \"authored\"\n", `authorship_origin: "authored"\nsupersedes:\n  - "${oldUid}"\n`);
  await writeFile(join(root, "old.md"), old, "utf8");
  await writeFile(join(root, "new.md"), newer, "utf8");
  const before = await Promise.all([readFile(join(root, "old.md")), readFile(join(root, "new.md"))]);
  const logs = [];
  console.log = (...parts) => { logs.push(parts.join(" ")); };
  try {
    assert.equal(await main(["search", "cafe", "--kb-path", root, "--as-of", "2026-07-15T00:00Z"]), 0);
  } finally { console.log = originalLog; }
  const result = JSON.parse(logs.at(-1));
  assert.equal(result.temporal.as_of, "2026-07-15T00:00:00.000Z");
  assert.deepEqual(result.hits.map((hit) => hit.chunk.source_id), [oldUid]);
  assert.deepEqual(result.hits[0].citation.matched_spans.map((span) => span.text), ["Café"]);
  const live = await readFile(join(root, "old.md"));
  const span = result.hits[0].citation.matched_spans[0];
  assert.equal(live.subarray(span.start_byte, span.end_byte).toString("utf8"), "Café");
  assert.deepEqual(await Promise.all([readFile(join(root, "old.md")), readFile(join(root, "new.md"))]), before);
});
