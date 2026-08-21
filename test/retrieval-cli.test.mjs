import assert from "node:assert/strict";
import { link, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { main, runSearch } from "../bin/gkx.mjs";
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
  assert.equal(result.hits[0].chunk.valid_from, null, "filesystem-derived validAt is not canonical retrieval validity");
  assert.equal(result.hits[0].chunk.valid_to, null, "graph-derived invalidAt is not canonical retrieval validity");
  assert.equal(result.hits[0].citation.verified, true);
  const lexicalCapability = detectSqliteLexicalCapability();
  assert.equal(result.stages.lexical.kind, lexicalCapability.default_backend);
  assert.equal(result.stages.lexical.state, lexicalCapability.fts5_available ? "active" : "degraded");
  assert.deepEqual(result.stages.lexical.reason_codes, lexicalCapability.fts5_available
    ? []
    : ["SQLITE_FTS5_UNAVAILABLE", "SQLITE_LEXICAL_SCAN_ACTIVE", "SQLITE_LEXICAL_SCAN_APPROXIMATION"]);
  assert.match(warning, /1 source\(s\) were ineligible/);
  const after = await Promise.all([readFile(validPath), readFile(invalidPath)]);
  assert.deepEqual(after, before);
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
  assert.equal(pointer.manifest.source_count, 0);
  assert.equal(pointer.manifest.chunk_count, 0, "hard-link bytes never enter the derived database");
});
