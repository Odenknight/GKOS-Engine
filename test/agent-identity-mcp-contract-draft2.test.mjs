import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "56c11c50dde31d4b92d333223507f050ea72d994";
const QUALIFIED_DRAFT2_HEAD = "dc4e55e14a42b921fe73051b5e25555cfa1d46f4";
const PACK = "contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.2";
const DIR = join(ROOT, PACK);
const GENERATOR = "scripts/generate-agent-identity-mcp-contract.mjs";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (name) => JSON.parse(await readFile(join(DIR, name), "utf8"));

test("Draft.2 generator and manifest have exact closed reproducible bytes", async () => {
  execFileSync(process.execPath, [GENERATOR, "--check"], { cwd: ROOT, stdio: "pipe" });
  const names = (await readdir(DIR)).sort();
  assert.equal(names.length, 34);
  const manifest = await json("pack-manifest.json");
  assert.equal(manifest.contract_version, "1.0.0-draft.2");
  assert.equal(manifest.source_base_commit, BASE);
  assert.equal(manifest.leaf_count, 33);
  assert.deepEqual(names, ["pack-manifest.json", ...manifest.leaves.map((row) => row.path)].sort());
  for (const leaf of manifest.leaves) {
    const bytes = await readFile(join(DIR, leaf.path));
    assert.equal(bytes.length, leaf.size, leaf.path);
    assert.equal(sha(bytes), leaf.sha256, leaf.path);
    assert.equal(bytes.includes(Buffer.from("\r")), false, leaf.path);
  }
  assert.equal(manifest.generator_digest, `sha256:${sha(await readFile(join(ROOT, GENERATOR)))}`);
});

test("Draft.2 schemas compile and exact implemented/deferred inventories validate", async () => {
  const schemas = (await readdir(DIR)).filter((name) => name.endsWith(".schema.json")).sort();
  assert.equal(schemas.length, 18);
  const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  for (const name of schemas) ajv.addSchema(await json(name), name);
  for (const [instance, schema] of [
    ["operation-inventory.json", "operation-inventory.schema.json"],
    ["tool-registry.json", "tool-registry.schema.json"],
    ["transport.json", "transport.schema.json"],
    ["platform-matrix.json", "platform-matrix.schema.json"],
  ]) assert.equal(ajv.validate(schema, await json(instance)), true, `${instance}: ${ajv.errorsText(ajv.errors)}`);
  const operations = await json("operation-inventory.json");
  const tools = await json("tool-registry.json");
  const errors = await json("error-fixture.json");
  const vectors = await json("mcp-conformance-fixture.json");
  assert.equal(operations.operations.length, 32);
  assert.equal(tools.required_tools.length, 7);
  assert.equal(tools.deferred_tools.length, 16);
  assert.equal(errors.error_count, 53);
  assert.equal(vectors.vectors.length, 67);
});

test("Draft.2 reports transport availability and authority without conformance inflation", async () => {
  const transport = await json("transport.json");
  assert.equal(transport.standing, "integration_only");
  assert.deepEqual(transport.transports, [
    { authority: "delegates_to_loopback_service", availability: "package_available", credential_handoff: "private_token_file", implementation: "loopback_compatibility_bridge", name: "native_stdio", request_timeout_ms: 30000 },
    { authority: "credential_bound_local_service", availability: "integration_runtime", credential_handoff: "bearer_header", implementation: "authenticated_loopback_service", name: "loopback_streamable_http", request_timeout_ms: 30000 },
  ]);
  const readme = await readFile(join(DIR, "README.md"), "utf8");
  assert.match(readme, /seven read-only MCP tools/i);
  assert.match(readme, /(?:sixteen|16).*deferred/i);
  assert.match(readme, /not .*native-stdio conformance claim/i);
});

test("Draft.1 bytes remain frozen and Draft.2 changes stay inside exact inventory", async () => {
  execFileSync("git", ["merge-base", "--is-ancestor", QUALIFIED_DRAFT2_HEAD, "HEAD"], { cwd: ROOT });
  execFileSync("git", ["diff", "--quiet", BASE, QUALIFIED_DRAFT2_HEAD, "--", "contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1"], { cwd: ROOT });
  const draft1Manifest = JSON.parse(await readFile(join(ROOT, "contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1/pack-manifest.json"), "utf8"));
  assert.equal(draft1Manifest.generator_digest, `sha256:${sha(await readFile(join(ROOT, "scripts/generate-agent-identity-mcp-contract-draft1.mjs")))}`);
  const allowed = new Set((await readFile(join(DIR, "allowed-paths.txt"), "utf8")).trim().split("\n"));
  const changed = new Set(execFileSync("git", ["diff", "--name-only", BASE, QUALIFIED_DRAFT2_HEAD, "--"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean));
  for (const path of changed) assert.equal(allowed.has(path), true, `change outside Draft.2 inventory: ${path}`);
  const protectedPaths = (await readFile(join(DIR, "protected-paths.txt"), "utf8")).trim().split("\n");
  const protectedDiff = execFileSync("git", ["diff", "--name-only", BASE, QUALIFIED_DRAFT2_HEAD, "--", ...protectedPaths], { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(protectedDiff, "");
  for (const excluded of ["src/navigation-effects", "contracts/navigation-effects", "docker", ".dockerignore"]) {
    await assert.rejects(stat(join(ROOT, excluded)));
  }
});

test("Draft.2 workflow freezes all-and-only eleven governed jobs", async () => {
  const workflow = await readFile(join(ROOT, ".github/workflows/phase6-identity-contract-draft2.yml"), "utf8");
  assert.match(workflow, /^name: GKOS Phase 6 identity\/MCP Draft\.2 qualification$/m);
  assert.equal((workflow.match(/^  p6-d2-[a-z0-9-]+:/gm) || []).length, 11);
  assert.equal((workflow.match(/--qualification-job p6-d2-/g) || []).length, 11);
  assert.doesNotMatch(workflow, /p6-f1|draft\.1/);
  const inventory = await json("hosted-artifact-inventory.json");
  assert.equal(inventory.artifacts.length, 11);
  for (const artifact of inventory.artifacts) assert.match(workflow, new RegExp(`name: ${artifact}(?:[,}]|$)`, "m"));
});

test("Draft.2 pack and runtime surfaces contain no token-shaped secret", async () => {
  const patterns = [/gkos1_[A-Za-z0-9_-]{43}/, /-----BEGIN (?:OPENSSH|PRIVATE) KEY-----/, /"(?:secret|token|private_key|credential)"\s*:\s*"[^"\n]+"/i];
  for (const path of [DIR, join(ROOT, "src/service"), join(ROOT, "bin")]) {
    for (const name of await readdir(path)) {
      if (!/\.(?:json|md|mjs|ts)$/.test(name)) continue;
      const text = await readFile(join(path, name), "utf8");
      for (const pattern of patterns) assert.equal(pattern.test(text), false, `${name}: ${pattern}`);
    }
  }
});
