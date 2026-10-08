import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import {
  link, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, symlink, truncate, unlink, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runIngestIndex, runIngestValidate, runSearch, validatePhase3KbPath } from "../bin/gkx.mjs";
import { preflightIngestAuthority, releaseIngestAuthorityPreflight } from "../dist/ingest-host.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "bin", "gkx.mjs");
const INGEST_PACK = new URL("../contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/", import.meta.url);
const CLI_FIXTURE = JSON.parse(readFileSync(new URL("cli-conformance-fixture.json", INGEST_PACK), "utf8"));
const VALIDATION_FIXTURE = JSON.parse(readFileSync(new URL("conformance-fixture.json", INGEST_PACK), "utf8"));
const STORAGE_FIXTURE = JSON.parse(readFileSync(new URL("storage-conformance-fixture.json", INGEST_PACK), "utf8"));
const PROFILE_CONTRACT = "gkos-frontmatter-profile/1.0.0-draft.1";
const UUID_A = "018f0000-0000-7000-8000-000000000601";
const UUID_B = "018f0000-0000-7000-8000-000000000602";

assert.equal(CLI_FIXTURE.status, "frozen");
assert.equal(CLI_FIXTURE.frozen, true);

const CONSUMED_CLI_FIXTURE_ROWS = Object.fromEntries([
  "invalid_argv_matrix", "presentation_matrix", "fixed_error_matrix", "search_routing_matrix", "local_kb_path.reject_inputs",
].map((name) => [name, new Set()]));

function fixtureRows(section) {
  if (section === "local_kb_path.reject_inputs") return CLI_FIXTURE.local_kb_path.reject_inputs;
  return CLI_FIXTURE[section];
}

function consumeFixtureRow(section, name) {
  const row = fixtureRows(section).find((item) => item.name === name);
  assert.ok(row, `${section}:${name}`);
  CONSUMED_CLI_FIXTURE_ROWS[section].add(name);
  return row;
}

function fixtureEncodedString(row) {
  if (typeof row.input === "string") return row.input;
  assert.equal(row.encoding, "utf16_code_units");
  assert.ok(Array.isArray(row.code_units));
  return String.fromCharCode(...row.code_units);
}

test.after(() => {
  for (const [section, consumed] of Object.entries(CONSUMED_CLI_FIXTURE_ROWS)) {
    const names = fixtureRows(section).map((item) => item.name);
    assert.equal(new Set(names).size, names.length, `${section} row names must be unique`);
    assert.deepEqual([...consumed].sort(), [...names].sort(), `${section} has unconsumed rows`);
  }
});

function note(uid, title = "Visible", body = "VISIBLE_PROVIDER_SENTINEL", sensitivity = "public") {
  return `---
gkx_version: "2.3"
uid: "${uid}"
title: "${title}"
type: "policy"
created_at: "2026-08-01T00:00:00Z"
epistemic_state: "reported"
sensitivity: "${sensitivity}"
---
# ${title}
${body}
`;
}

async function vault(t, prefix = "gkos-ingest-cli-") {
  const path = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

function isolatedEnv(root, extra = {}) {
  return {
    ...process.env,
    XDG_CONFIG_HOME: join(root, "isolated-config"),
    ...extra,
  };
}

function cli(args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: ROOT,
      env: options.env ?? process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (part) => stdout.push(part));
    child.stderr.on("data", (part) => stderr.push(part));
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => resolvePromise({
      code,
      signal,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
  });
}

async function fileSnapshot(path) {
  const metadata = await stat(path, { bigint: true });
  return { bytes: await readFile(path), mtimeNs: metadata.mtimeNs, size: metadata.size };
}

async function trustedFtsConfig(root, name = "operator.toml") {
  const path = join(root, name);
  await writeFile(path, "config_version = 1\n[retrieval]\nmode = \"fts\"\n", "utf8");
  return path;
}

function assertOperationalIndex(result) {
  assert.deepEqual(Object.keys(result).sort(), [
    "active", "blocked_attempt", "contract_version", "mode", "status", "summary",
  ]);
  assert.equal(result.status, "operational_failure");
  assert.equal(result.summary, null);
  assert.equal(result.active, null);
  assert.equal(result.blocked_attempt, null);
}

function exactJsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function materializeFixtureCorpus(root, name) {
  const corpus = CLI_FIXTURE.materializable_corpora[name];
  assert.ok(corpus, name);
  for (const file of corpus.files) {
    const path = join(root, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.content, "utf8");
  }
  return corpus;
}

function fixtureArgv(row, replacements) {
  return row.argv.map((item) => Object.hasOwn(replacements, item) ? replacements[item] : item);
}

function referencedIndexResult(row) {
  const match = /^storage-conformance-fixture\.json#\/valid_envelopes\/index_results\/status=([^,]+),mode=(.+)$/u
    .exec(row.result_reference);
  assert.ok(match, row.result_reference);
  const result = STORAGE_FIXTURE.valid_envelopes.index_results.find((item) => (
    item.status === match[1] && item.mode === match[2]
  ));
  assert.ok(result, row.result_reference);
  assert.equal(row.result_mutation, undefined, `${row.name} must reference a real sealed result`);
  const bytes = exactJsonBytes(result);
  assert.equal(sha256Bytes(bytes), row.expected_stdout_sha256, row.name);
  return result;
}

function exactValidationText(result) {
  const summary = result.summary;
  const lines = [
    `gkx validate: ${result.corpus_valid ? "VALID" : "INVALID"}`,
    `  sources: observed=${summary.observed_source_count} valid=${summary.valid_source_count} rejected=${summary.rejected_source_count}`,
    `  findings: critical=${summary.findings.critical} error=${summary.findings.error} warning=${summary.findings.warning} info=${summary.findings.info}`,
  ];
  for (const finding of result.findings) {
    const coordinate = finding.source_path === null
      ? "corpus"
      : `${finding.source_path}${finding.line === null ? "" : `:${finding.line}`}`;
    lines.push(`  [${finding.severity}] ${finding.code} ${coordinate}${finding.field === null ? "" : ` (${finding.field})`}`);
  }
  return `${lines.join("\n")}\n`;
}

async function isolatedFtsConfig(root) {
  const path = join(root, "isolated-config", "gkos", "gkos.toml");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "config_version = 1\n[retrieval]\nmode = \"fts\"\n", "utf8");
  return path;
}

test("Phase-3 argument normalization is unambiguous and leaves legacy positional validate unchanged", async (t) => {
  const root = await vault(t);
  const sourcePath = join(root, "valid.md");
  await writeFile(sourcePath, note(UUID_A), "utf8");
  const before = await readFile(sourcePath);
  const env = isolatedEnv(root);
  for (const fixture of CLI_FIXTURE.invalid_argv_matrix) {
    const row = consumeFixtureRow("invalid_argv_matrix", fixture.name);
    const args = row.argv.map((item) => item === "<vault>" ? root : item);
    const expected = consumeFixtureRow("fixed_error_matrix", row.error);
    const invoked = await cli(args, { env });
    assert.equal(invoked.code, expected.exit_code, args.join(" "));
    assert.equal(invoked.stderr, expected.stderr);
    assert.equal(invoked.stdout, expected.stdout);
  }
  const help = await cli(CLI_FIXTURE.help.argv, { env });
  assert.equal(help.code, CLI_FIXTURE.help.exit_code);
  assert.equal(help.stderr, CLI_FIXTURE.help.stderr);
  for (const line of CLI_FIXTURE.help.required_exact_lines) assert.ok(help.stdout.split("\n").includes(line), line);
  for (const fragment of CLI_FIXTURE.help.forbidden_fragments) assert.doesNotMatch(help.stdout, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.equal(CLI_FIXTURE.commands.validate, "gkx validate --kb-path <path> [--schema <path-or-id>] [--format text|json]");
  assert.equal(CLI_FIXTURE.commands.index, "gkx index --kb-path <path> [--schema <path-or-id>] [--strict]");
  assert.equal(existsSync(join(root, ".gkx")), false);
  assert.deepEqual(await readFile(sourcePath), before);

  const legacy = await cli(["validate", root], { env });
  assert.equal(legacy.code, 0);
  assert.match(legacy.stdout, /^gkx validate — engine /u);
  assert.doesNotMatch(legacy.stdout, /gkos-ingest-validation/u);
});

test("Phase-3 knowledge-base paths are local pre-I/O and canonical root spellings converge", async (t) => {
  for (const fixture of CLI_FIXTURE.local_kb_path.reject_inputs) {
    const row = consumeFixtureRow("local_kb_path.reject_inputs", fixture.name);
    assert.throws(() => validatePhase3KbPath(fixtureEncodedString(row)), /GKX_CLI_KB_PATH_INVALID/u, row.name);
  }
  if (process.platform !== "win32") for (const value of CLI_FIXTURE.local_kb_path.non_windows_reject_inputs) {
    assert.throws(() => validatePhase3KbPath(value), /GKX_CLI_KB_PATH_INVALID/u, value);
  }
  assert.throws(() => validatePhase3KbPath(resolve("/")), /GKX_CLI_KB_PATH_INVALID/u);

  const root = await vault(t, "gkos-ingest-cli-kb-path-");
  const malformedProfile = join(root, "must-not-be-read.toml");
  await writeFile(malformedProfile, `contract_version = "${PROFILE_CONTRACT}"\nprofile_id = `, "utf8");
  const env = isolatedEnv(root);
  for (const command of ["validate", "index"]) {
    for (const value of [String.raw`\\server\share\vault`, "NUL", "folder/trailing."]) {
      const invoked = await cli([command, "--kb-path", value, "--schema", malformedProfile], { env });
      const expected = consumeFixtureRow("fixed_error_matrix", `${command}_kb_path`);
      assert.equal(invoked.code, expected.exit_code, `${command} ${value}`);
      assert.equal(invoked.stdout, expected.stdout);
      assert.equal(invoked.stderr, expected.stderr);
    }
  }
  assert.equal(validatePhase3KbPath(root), resolve(root));
  assert.equal(validatePhase3KbPath(relative(ROOT, root)), resolve(root));
  if (process.platform === "win32") {
    const forbiddenResolution = CLI_FIXTURE.local_kb_path.windows_forbidden_base_resolution;
    assert.throws(
      () => validatePhase3KbPath(forbiddenResolution.relative, forbiddenResolution.base),
      /GKX_CLI_KB_PATH_INVALID/u,
    );
  }

  await writeFile(join(root, "visible.md"), note(UUID_A), "utf8");
  const configPath = await trustedFtsConfig(root, "trusted-fts.toml");
  const sourceBefore = await readFile(join(root, "visible.md"));
  const first = await runIngestIndex(root, { strict: true, configPath });
  const state = join(await realpath(root), ".gkx", "derived", "retrieval");
  const pointerPath = join(state, "active-ingest.json");
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const ownerPath = join(state, pointer.owner_generation_file);
  const pointerBefore = await fileSnapshot(pointerPath);
  const ownerBefore = await fileSnapshot(ownerPath);
  const second = await runIngestIndex(relative(ROOT, root), { strict: true, configPath });
  assert.deepEqual(second, first);
  assert.deepEqual((await fileSnapshot(pointerPath)).bytes, pointerBefore.bytes);
  assert.deepEqual(await fileSnapshot(ownerPath), ownerBefore);
  assert.deepEqual(await readFile(join(root, "visible.md")), sourceBefore);

  if (process.platform === "win32") {
    const canonicalRoot = await realpath(root);
    const variants = [...new Set([
      canonicalRoot,
      `${root[0] === root[0].toLowerCase() ? root[0].toUpperCase() : root[0].toLowerCase()}${root.slice(1)}`,
    ])];
    for (const spelling of variants) {
      assert.deepEqual(await runIngestIndex(spelling, { strict: true, configPath }), first);
      assert.deepEqual((await fileSnapshot(pointerPath)).bytes, pointerBefore.bytes);
      assert.deepEqual(await fileSnapshot(ownerPath), ownerBefore);
    }
    if (process.env.GKOS_REQUIRE_SHORT_PATH_FIXTURE === "1") {
      assert.notEqual(root.toLowerCase(), canonicalRoot.toLowerCase(), "qualification lane must exercise 8.3 expansion");
    }
  }

  const swapped = await vault(t, "gkos-ingest-cli-root-swap-");
  const saved = `${swapped}-saved`;
  t.after(() => rm(saved, { recursive: true, force: true }));
  await writeFile(join(swapped, "visible.md"), note(UUID_B), "utf8");
  const swappedConfig = await trustedFtsConfig(swapped);
  let providerCalls = 0;
  await assert.rejects(runIngestIndex(swapped, {
    strict: true,
    configPath: swappedConfig,
    vectorProvider: {
      kind: "mcp", provider_id: "root-swap", model_id: "root-swap", dimensions: 1, timeout_ms: 100,
      async embed(texts) { providerCalls++; return texts.map(() => Float32Array.of(1)); },
    },
    scan_options: {
      async on_before_root_recheck() {
        await rename(swapped, saved);
        await mkdir(swapped);
      },
    },
  }), /GKX_SCAN_ROOT_CHANGED_DURING_SCAN/u);
  assert.equal(providerCalls, 0);
  assert.equal(existsSync(join(swapped, ".gkx")), false);
  assert.equal(existsSync(join(saved, ".gkx")), false);
  await rm(swapped, { recursive: true });
  await rename(saved, swapped);

  const postPlan = await vault(t, "gkos-ingest-cli-post-plan-swap-");
  const postPlanSaved = `${postPlan}-saved`;
  t.after(() => rm(postPlanSaved, { recursive: true, force: true }));
  await writeFile(join(postPlan, "visible.md"), note(UUID_B), "utf8");
  const postPlanConfig = await trustedFtsConfig(postPlan);
  let postPlanProviderCalls = 0;
  await assert.rejects(runIngestIndex(postPlan, {
    strict: true,
    configPath: postPlanConfig,
    vectorProvider: {
      kind: "mcp", provider_id: "post-plan", model_id: "post-plan", dimensions: 1, timeout_ms: 100,
      async embed(texts) { postPlanProviderCalls++; return texts.map(() => Float32Array.of(1)); },
    },
    async on_after_validation_plan() {
      await rename(postPlan, postPlanSaved);
      await mkdir(postPlan);
    },
  }), /GKX_SCAN_ROOT_CHANGED_DURING_SCAN/u);
  assert.equal(postPlanProviderCalls, 0);
  assert.equal(existsSync(join(postPlan, ".gkx")), false);
  assert.equal(existsSync(join(postPlanSaved, ".gkx")), false);
  await rm(postPlan, { recursive: true });
  await rename(postPlanSaved, postPlan);

  const capabilityBoundary = await vault(t, "gkos-ingest-cli-capability-boundary-swap-");
  const capabilityBoundarySaved = `${capabilityBoundary}-saved`;
  t.after(() => rm(capabilityBoundarySaved, { recursive: true, force: true }));
  await writeFile(join(capabilityBoundary, "visible.md"), note(UUID_B), "utf8");
  const capabilityBoundaryConfig = await trustedFtsConfig(capabilityBoundary);
  let capabilityBoundaryProviderCalls = 0;
  await assert.rejects(runIngestIndex(capabilityBoundary, {
    strict: true,
    configPath: capabilityBoundaryConfig,
    vectorProvider: {
      kind: "mcp", provider_id: "capability-boundary", model_id: "capability-boundary", dimensions: 1, timeout_ms: 100,
      async embed(texts) { capabilityBoundaryProviderCalls++; return texts.map(() => Float32Array.of(1)); },
    },
    on_after_vault_root_preflight() {
      renameSync(capabilityBoundary, capabilityBoundarySaved);
      mkdirSync(capabilityBoundary);
    },
  }), /GKX_INGEST_VAULT_ROOT_CHANGED/u);
  assert.equal(capabilityBoundaryProviderCalls, 0);
  assert.equal(existsSync(join(capabilityBoundary, ".gkx")), false);
  assert.equal(existsSync(join(capabilityBoundarySaved, ".gkx")), false);
  await rm(capabilityBoundary, { recursive: true });
  await rename(capabilityBoundarySaved, capabilityBoundary);

  const authorityBoundary = await vault(t, "gkos-ingest-cli-authority-boundary-swap-");
  const authorityBoundarySaved = `${authorityBoundary}-saved`;
  t.after(() => rm(authorityBoundarySaved, { recursive: true, force: true }));
  await writeFile(join(authorityBoundary, "visible.md"), note(UUID_B), "utf8");
  const authorityBoundaryConfig = await trustedFtsConfig(authorityBoundary);
  let authorityBoundaryProviderCalls = 0;
  await assert.rejects(runIngestIndex(authorityBoundary, {
    strict: true,
    configPath: authorityBoundaryConfig,
    vectorProvider: {
      kind: "mcp", provider_id: "authority-boundary", model_id: "authority-boundary", dimensions: 1, timeout_ms: 100,
      async embed(texts) { authorityBoundaryProviderCalls++; return texts.map(() => Float32Array.of(1)); },
    },
    on_before_authority_state_creation() {
      renameSync(authorityBoundary, authorityBoundarySaved);
      mkdirSync(authorityBoundary);
    },
  }), /GKX_INGEST_VAULT_ROOT_CHANGED/u);
  assert.equal(authorityBoundaryProviderCalls, 0);
  assert.equal(existsSync(join(authorityBoundary, ".gkx")), false);
  assert.equal(existsSync(join(authorityBoundarySaved, ".gkx")), false);
  await rm(authorityBoundary, { recursive: true });
  await rename(authorityBoundarySaved, authorityBoundary);

  const preProvider = await vault(t, "gkos-ingest-cli-pre-provider-swap-");
  const preProviderSaved = `${preProvider}-saved`;
  t.after(() => rm(preProviderSaved, { recursive: true, force: true }));
  await writeFile(join(preProvider, "visible.md"), note(UUID_B), "utf8");
  const preProviderConfig = await trustedFtsConfig(preProvider);
  let boundaryProviderCalls = 0;
  await assert.rejects(runIngestIndex(preProvider, {
    strict: true,
    configPath: preProviderConfig,
    vectorProvider: {
      kind: "mcp", provider_id: "pre-provider", model_id: "pre-provider", dimensions: 1, timeout_ms: 100,
      async embed(texts) { boundaryProviderCalls++; return texts.map(() => Float32Array.of(1)); },
    },
    async on_before_provider_stage() {
      await rename(preProvider, preProviderSaved);
      await mkdir(preProvider);
    },
  }), /GKX_SCAN_ROOT_CHANGED_DURING_SCAN/u);
  assert.equal(boundaryProviderCalls, 0);
  assert.equal(existsSync(join(preProvider, ".gkx")), false);
  const preparedState = join(preProviderSaved, ".gkx", "derived", "retrieval");
  assert.deepEqual((await readdir(preparedState)).filter((name) => name !== "ingest-authority.lock"), []);
});

test("Phase-3 validate is deterministic, selector-parity exact, and source/state read-only", async (t) => {
  const root = await vault(t);
  const corpus = await materializeFixtureCorpus(root, "invalid");
  const validPath = join(root, corpus.files[0].path);
  const invalidPath = join(root, corpus.files[1].path);
  const before = await Promise.all([readFile(validPath), readFile(invalidPath)]);
  const env = isolatedEnv(root);
  const jsonRow = consumeFixtureRow("presentation_matrix", "validate_json_invalid");
  const textRow = consumeFixtureRow("presentation_matrix", "validate_text_invalid");
  assert.equal(jsonRow.input_reference, "cli-conformance-fixture.json#/materializable_corpora/invalid");
  assert.equal(textRow.input_reference, jsonRow.input_reference);

  const omitted = await cli(fixtureArgv(jsonRow, { "<fixture-vault>": root }), { env });
  const explicit = await cli([
    "validate", "--kb-path", root, "--schema", "gkos:frontmatter-profile/current", "--format", "json",
  ], { env });
  assert.equal(omitted.code, jsonRow.exit_code);
  assert.equal(explicit.code, jsonRow.exit_code);
  assert.equal(explicit.stdout, omitted.stdout);
  assert.equal(omitted.stderr, jsonRow.stderr);
  assert.equal(explicit.stderr, jsonRow.stderr);
  const result = JSON.parse(omitted.stdout);
  assert.equal(result.corpus_valid, false);
  assert.equal(result.summary.observed_source_count, 2);
  assert.equal(result.summary.valid_source_count, 1);
  assert.equal(result.summary.rejected_source_count, 1);
  assert.equal(result.rejections[0].source_path, "invalid.md");
  assert.equal(existsSync(join(root, ".gkx")), false);
  assert.deepEqual(await Promise.all([readFile(validPath), readFile(invalidPath)]), before);
  const direct = await runIngestValidate(root);
  assert.deepEqual(direct, result);
  assert.equal(omitted.stdout, exactJsonBytes(direct));
  assert.equal(sha256Bytes(omitted.stdout), jsonRow.expected_stdout_sha256);

  const text = await cli(fixtureArgv(textRow, { "<fixture-vault>": root }), { env });
  assert.equal(text.code, textRow.exit_code);
  assert.equal(text.stdout, exactValidationText(direct));
  assert.equal(text.stdout, textRow.expected_stdout);
  assert.equal(sha256Bytes(text.stdout), textRow.expected_stdout_sha256);
  assert.equal(text.stderr, textRow.stderr);

  const validRoot = await vault(t, "gkos-ingest-cli-output-valid-");
  const validCorpus = await materializeFixtureCorpus(validRoot, "valid");
  assert.equal(validCorpus.expected_behavior_reference, "conformance-fixture.json#/missing_sensitivity_case/expected");
  const validEnv = isolatedEnv(validRoot);
  const validJsonRow = consumeFixtureRow("presentation_matrix", "validate_json_valid");
  const validTextRow = consumeFixtureRow("presentation_matrix", "validate_text_valid");
  assert.equal(validJsonRow.input_reference, "cli-conformance-fixture.json#/materializable_corpora/valid");
  assert.equal(validTextRow.input_reference, validJsonRow.input_reference);
  const validJson = await cli(fixtureArgv(validJsonRow, { "<fixture-vault>": validRoot }), { env: validEnv });
  const validDirect = await runIngestValidate(validRoot);
  assert.equal(validJson.code, validJsonRow.exit_code);
  assert.equal(validJson.stdout, exactJsonBytes(validDirect));
  assert.equal(sha256Bytes(validJson.stdout), validJsonRow.expected_stdout_sha256);
  assert.equal(validJson.stderr, validJsonRow.stderr);
  const expectedValid = VALIDATION_FIXTURE.missing_sensitivity_case.expected;
  assert.equal(validDirect.corpus_valid, expectedValid.corpus_valid);
  assert.equal(validDirect.ingest_intrinsic_valid, expectedValid.ingest_intrinsic_valid);
  assert.equal(validDirect.summary.valid_source_count, expectedValid.valid_source_count);
  assert.equal(validDirect.summary.rejected_source_count, expectedValid.rejected_source_count);
  assert.ok(validDirect.findings.some((item) => (
    item.code === expectedValid.finding.code
    && item.severity === expectedValid.finding.severity
    && item.field === expectedValid.finding.field
  )));
  const validText = await cli(fixtureArgv(validTextRow, { "<fixture-vault>": validRoot }), { env: validEnv });
  assert.equal(validText.code, validTextRow.exit_code);
  assert.equal(validText.stdout, exactValidationText(validDirect));
  assert.equal(validText.stdout, validTextRow.expected_stdout);
  assert.equal(sha256Bytes(validText.stdout), validTextRow.expected_stdout_sha256);
  assert.equal(validText.stderr, validTextRow.stderr);
  assert.equal(existsSync(join(validRoot, ".gkx")), false);
});

test("Phase-3 index renders every status as exact deterministic path-free bytes", async (t) => {
  const strictRow = consumeFixtureRow("presentation_matrix", "index_published_strict");
  const nonStrictRow = consumeFixtureRow("presentation_matrix", "index_published_non_strict");
  const mixedRow = consumeFixtureRow("presentation_matrix", "index_published_with_rejections_non_strict");
  const blockedRow = consumeFixtureRow("presentation_matrix", "index_blocked_strict");
  const operationalNonStrictRow = consumeFixtureRow("presentation_matrix", "index_operational_non_strict");
  const operationalStrictRow = consumeFixtureRow("presentation_matrix", "index_operational_strict");
  for (const row of [strictRow, nonStrictRow, mixedRow, blockedRow, operationalNonStrictRow, operationalStrictRow]) {
    const fixtureResult = referencedIndexResult(row);
    assert.equal(fixtureResult.status, row.outcome);
    assert.equal(fixtureResult.mode, row.mode);
  }

  const publishedRoot = await vault(t, "gkos-ingest-cli-output-published-");
  await writeFile(join(publishedRoot, "visible.md"), note(UUID_A), "utf8");
  const publishedConfig = await isolatedFtsConfig(publishedRoot);
  const publishedExpected = await runIngestIndex(publishedRoot, { strict: true, configPath: publishedConfig });
  assert.equal(publishedExpected.status, strictRow.outcome);
  assert.equal(publishedExpected.mode, strictRow.mode);
  const published = await cli(fixtureArgv(strictRow, { "<fixture-vault>": publishedRoot }), {
    env: isolatedEnv(publishedRoot),
  });
  assert.equal(published.code, strictRow.exit_code);
  assert.equal(published.stdout, exactJsonBytes(publishedExpected));
  assert.equal(published.stderr, strictRow.stderr);

  const nonStrictRoot = await vault(t, "gkos-ingest-cli-output-published-nonstrict-");
  await writeFile(join(nonStrictRoot, "visible.md"), note(UUID_A), "utf8");
  const nonStrictConfig = await isolatedFtsConfig(nonStrictRoot);
  const nonStrictExpected = await runIngestIndex(nonStrictRoot, { configPath: nonStrictConfig });
  assert.equal(nonStrictExpected.status, nonStrictRow.outcome);
  assert.equal(nonStrictExpected.mode, nonStrictRow.mode);
  const nonStrict = await cli(fixtureArgv(nonStrictRow, { "<fixture-vault>": nonStrictRoot }), {
    env: isolatedEnv(nonStrictRoot),
  });
  assert.equal(nonStrict.code, nonStrictRow.exit_code);
  assert.equal(nonStrict.stdout, exactJsonBytes(nonStrictExpected));
  assert.equal(nonStrict.stderr, nonStrictRow.stderr);

  const mixedRoot = await vault(t, "gkos-ingest-cli-output-mixed-");
  await writeFile(join(mixedRoot, "visible.md"), note(UUID_A), "utf8");
  await writeFile(join(mixedRoot, "invalid.md"), note("invalid-authored-uid", "Invalid"), "utf8");
  const mixedConfig = await isolatedFtsConfig(mixedRoot);
  const mixedExpected = await runIngestIndex(mixedRoot, { configPath: mixedConfig });
  assert.equal(mixedExpected.status, mixedRow.outcome);
  assert.equal(mixedExpected.mode, mixedRow.mode);
  const mixed = await cli(fixtureArgv(mixedRow, { "<fixture-vault>": mixedRoot }), { env: isolatedEnv(mixedRoot) });
  assert.equal(mixed.code, mixedRow.exit_code);
  assert.equal(mixed.stdout, exactJsonBytes(mixedExpected));
  assert.equal(mixed.stderr, mixedRow.stderr);

  const blockedRoot = await vault(t, "gkos-ingest-cli-output-blocked-");
  await writeFile(join(blockedRoot, "invalid.md"), note("invalid-authored-uid", "Invalid"), "utf8");
  const blockedExpected = await runIngestIndex(blockedRoot, { strict: true });
  assert.equal(blockedExpected.status, blockedRow.outcome);
  assert.equal(blockedExpected.mode, blockedRow.mode);
  const blocked = await cli(fixtureArgv(blockedRow, { "<fixture-vault>": blockedRoot }), {
    env: isolatedEnv(blockedRoot),
  });
  assert.equal(blocked.code, blockedRow.exit_code);
  assert.equal(blocked.stdout, exactJsonBytes(blockedExpected));
  assert.equal(blocked.stderr, blockedRow.stderr);

  const missingRoot = join(await vault(t, "gkos-ingest-cli-output-operational-"), "missing-vault");
  for (const row of [operationalNonStrictRow, operationalStrictRow]) {
    const operational = await cli(fixtureArgv(row, { "<missing-vault>": missingRoot }), {
      env: isolatedEnv(dirname(missingRoot)),
    });
    assert.equal(operational.code, row.exit_code);
    assert.equal(operational.stdout, exactJsonBytes(referencedIndexResult(row)));
    assert.equal(operational.stderr, row.stderr);
  }
  assert.equal(existsSync(missingRoot), false);
});

test("profile selection is completed before corpus/state I/O and preserves the exit-2/exit-3 authority split", async (t) => {
  const root = await vault(t);
  const missingVault = join(root, "must-not-be-observed");
  const invalidProfile = join(root, "invalid.toml");
  await writeFile(invalidProfile, `contract_version = "${PROFILE_CONTRACT}"\nprofile_id = `, "utf8");
  const env = isolatedEnv(root);

  for (const command of ["validate", "index"]) {
    const expected = consumeFixtureRow("fixed_error_matrix", `${command}_profile`);
    const selected = await cli([command, "--kb-path", missingVault, "--schema", invalidProfile], { env });
    assert.equal(selected.code, expected.exit_code);
    assert.equal(selected.stdout, expected.stdout);
    assert.equal(selected.stderr, expected.stderr);
  }
  assert.equal(existsSync(missingVault), false);

  const selectedVault = join(root, "selected-vault");
  await mkdir(selectedVault);
  const overlay = join(root, "selected-profile.toml");
  await writeFile(overlay, `contract_version = "${PROFILE_CONTRACT}"
profile_id = "cli-selected"
[fields.x-owner]
type = "string"
required = true
max_length = 32
`, "utf8");
  await writeFile(join(selectedVault, "selected.md"), note(UUID_A), "utf8");
  let selected = await cli(["validate", "--kb-path", selectedVault, "--schema", overlay, "--format", "json"], { env });
  assert.equal(selected.code, 1);
  assert.ok(JSON.parse(selected.stdout).findings.some((item) => item.field === "x-owner"));
  await writeFile(join(selectedVault, "selected.md"), note(UUID_A).replace(
    'sensitivity: "public"', 'sensitivity: "public"\nx-owner: "operator"',
  ), "utf8");
  selected = await cli(["validate", "--kb-path", selectedVault, "--schema", overlay, "--format", "json"], { env });
  assert.equal(selected.code, 0);
  const selectedIndex = await cli(["index", "--kb-path", selectedVault, "--schema", overlay, "--strict"], { env });
  assert.equal(selectedIndex.code, 0);
  assert.equal(JSON.parse(selectedIndex.stdout).status, "published");
  const selectedState = join(selectedVault, ".gkx", "derived", "retrieval");
  const selectedPointer = JSON.parse(await readFile(join(selectedState, "active-ingest.json"), "utf8"));
  const selectedOwner = JSON.parse(await readFile(join(selectedState, selectedPointer.owner_generation_file), "utf8"));
  assert.equal(selectedOwner.profile.profile_id, "cli-selected");

  const profile = join(root, "profile.toml");
  const hardlink = join(root, "profile-hardlink.toml");
  await writeFile(profile, `contract_version = "${PROFILE_CONTRACT}"\nprofile_id = "operator"\n`, "utf8");
  try { await link(profile, hardlink); }
  catch (error) {
    if (["EPERM", "ENOTSUP", "EACCES"].includes(error?.code)) { t.skip(`hard links unavailable: ${error.code}`); return; }
    throw error;
  }
  const validate = await cli(["validate", "--kb-path", missingVault, "--schema", hardlink], { env });
  const validateOperational = consumeFixtureRow("fixed_error_matrix", "validate_operational");
  assert.equal(validate.code, validateOperational.exit_code);
  assert.equal(validate.stdout, validateOperational.stdout);
  assert.equal(validate.stderr, validateOperational.stderr);
  const index = await cli(["index", "--kb-path", missingVault, "--schema", hardlink], { env });
  assert.equal(index.code, 3);
  assertOperationalIndex(JSON.parse(index.stdout));
  assert.equal(index.stderr, "gkx index: operational failure\n");
  assert.doesNotMatch(`${validate.stderr}${index.stderr}${index.stdout}`, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.equal(existsSync(missingVault), false);
});

test("ingest scan receipts distinguish UTF-8, size, read, race, alias, and retain multi-reason rows", async (t) => {
  const root = await vault(t);
  const env = isolatedEnv(root);
  const malformedPath = join(root, "malformed.md");
  await writeFile(malformedPath, Buffer.from([0x23, 0x20, 0xc3, 0x28, 0x0a]));
  let invoked = await cli(["validate", "--kb-path", root, "--format", "json"], { env });
  assert.equal(invoked.code, 1);
  assert.ok(JSON.parse(invoked.stdout).findings.some((item) => item.code === "SOURCE_UTF8_INVALID"));
  await unlink(malformedPath);

  const oversized = join(root, "oversized.md");
  await writeFile(oversized, "x", "utf8");
  await truncate(oversized, 64 * 1024 * 1024 + 1);
  invoked = await cli(["validate", "--kb-path", root, "--format", "json"], { env });
  assert.equal(invoked.code, 1);
  assert.ok(JSON.parse(invoked.stdout).findings.some((item) => item.code === "SOURCE_SIZE_LIMIT_EXCEEDED"));
  await unlink(oversized);

  const race = join(root, "race.md");
  await writeFile(race, note(UUID_A), "utf8");
  const raced = await runIngestValidate(root, {
    scan_options: {
      async on_before_child_lstat(item) {
        if (item.relative_path === "race.md") await unlink(race);
      },
    },
  });
  assert.deepEqual(raced.findings.map((item) => item.code), ["SOURCE_SNAPSHOT_CHANGED_DURING_SCAN"]);

  const openRace = join(root, "open-race.md");
  await writeFile(openRace, note(UUID_A), "utf8");
  const openRaced = await runIngestValidate(root, {
    scan_options: {
      async on_before_file_open(item) {
        if (item.relative_path === "open-race.md") await unlink(openRace);
      },
    },
  });
  assert.deepEqual(openRaced.findings.map((item) => item.code), ["SOURCE_SNAPSHOT_CHANGED_DURING_SCAN"]);

  const typeRace = join(root, "type-race.md");
  await writeFile(typeRace, note(UUID_A), "utf8");
  const typeRaced = await runIngestValidate(root, {
    scan_options: {
      async on_before_file_open(item) {
        if (item.relative_path === "type-race.md") {
          await unlink(typeRace);
          await mkdir(typeRace);
        }
      },
    },
  });
  assert.deepEqual(typeRaced.findings.map((item) => item.code), ["SOURCE_SNAPSHOT_CHANGED_DURING_SCAN"]);
  await rm(typeRace, { recursive: true });

  const attachment = join(root, "receipt.pdf");
  await writeFile(attachment, "attachment", "utf8");
  const attachmentRace = await runIngestValidate(root, {
    scan_options: {
      async on_before_child_lstat(item) {
        if (item.relative_path === "receipt.pdf") await unlink(attachment);
      },
    },
  });
  assert.deepEqual(attachmentRace.findings.map((item) => item.code), ["SOURCE_SNAPSHOT_CHANGED_DURING_SCAN"]);

  const original = join(root, "linked-a.md");
  const alias = join(root, "linked-b.md");
  await writeFile(original, "x", "utf8");
  try { await link(original, alias); }
  catch (error) {
    if (["EPERM", "ENOTSUP", "EACCES"].includes(error?.code)) { t.skip(`hard links unavailable: ${error.code}`); return; }
    throw error;
  }
  await truncate(original, 64 * 1024 * 1024 + 1);
  const multiple = await runIngestValidate(root);
  for (const path of ["linked-a.md", "linked-b.md"]) {
    assert.deepEqual(multiple.findings.filter((item) => item.source_path === path).map((item) => item.code), [
      "SOURCE_FILESYSTEM_ALIAS_REJECTED", "SOURCE_SIZE_LIMIT_EXCEEDED",
    ]);
  }

  if (process.platform !== "win32" && process.getuid?.() !== 0) {
    await rm(original, { force: true });
    await rm(alias, { force: true });
    const unreadable = join(root, "unreadable.md");
    await writeFile(unreadable, note(UUID_B), "utf8");
    chmodSync(unreadable, 0o000);
    t.after(() => { try { chmodSync(unreadable, 0o600); } catch { /* cleanup */ } });
    const rejected = await runIngestValidate(root);
    assert.ok(rejected.findings.some((item) => item.source_path === "unreadable.md" && item.code === "SOURCE_READ_FAILED"));
  }
  assert.equal(existsSync(join(root, ".gkx")), false);
});

test("a first strict block over legacy state preserves the exact prior search generation", async (t) => {
  const legacyRoute = consumeFixtureRow("search_routing_matrix", "legacy_before_phase3");
  const statusRoute = consumeFixtureRow("search_routing_matrix", "attempt_status_with_legacy_prior");
  assert.equal(legacyRoute.route, "legacy_compatible_index_then_search");
  assert.equal(statusRoute.route, "metadata_only_existing_legacy_read");
  assert.equal(legacyRoute.attempt_status_bytes_loaded, false);
  assert.equal(statusRoute.attempt_status_bytes_loaded, false);
  const root = await vault(t);
  const env = isolatedEnv(root);
  await writeFile(join(root, "visible.md"), note(UUID_A), "utf8");
  const firstSearch = await cli(["search", "Visible", "--kb-path", root], { env });
  assert.equal(firstSearch.code, 0);
  const state = join(root, ".gkx", "derived", "retrieval");
  const pointerPath = join(state, "active-retrieval.json");
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const databasePath = join(state, pointer.database_file);
  const pointerBefore = await fileSnapshot(pointerPath);
  const databaseBefore = await fileSnapshot(databasePath);

  await writeFile(join(root, "invalid.md"), note("invalid-authored-uid", "Invalid", "STRICT_REJECTED_SENTINEL"), "utf8");
  const blocked = await cli(["index", "--kb-path", root, "--strict"], { env });
  assert.equal(blocked.code, 1);
  const blockedResult = JSON.parse(blocked.stdout);
  assert.equal(blockedResult.status, "blocked_strict");
  assert.equal(blockedResult.active.kind, "legacy");

  const secondSearch = await cli(["search", "Visible", "--kb-path", root], { env });
  assert.equal(secondSearch.code, 0);
  assert.deepEqual(JSON.parse(secondSearch.stdout), JSON.parse(firstSearch.stdout));
  assert.equal(secondSearch.stderr, firstSearch.stderr);
  assert.deepEqual(await fileSnapshot(pointerPath), pointerBefore);
  assert.deepEqual(await fileSnapshot(databasePath), databaseBefore);
  assert.equal(JSON.stringify(JSON.parse(secondSearch.stdout)).includes("STRICT_REJECTED_SENTINEL"), false);
});

test("a strict CLI block over an active Phase-3 owner preserves every ordinary-search authority byte", async (t) => {
  const route = consumeFixtureRow("search_routing_matrix", "active_phase3");
  assert.equal(route.route, "public_safe_inner_only");
  assert.equal(route.owner_bytes_loaded, false);
  const root = await vault(t, "gkos-ingest-cli-owner-block-");
  const env = isolatedEnv(root);
  await writeFile(join(root, "visible.md"), note(UUID_A), "utf8");
  const published = await cli(["index", "--kb-path", root, "--strict"], { env });
  assert.equal(published.code, 0);
  assert.equal(JSON.parse(published.stdout).status, "published");
  const baseline = await cli(["search", "Visible", "--kb-path", root], { env });
  assert.equal(baseline.code, 0);

  const state = join(root, ".gkx", "derived", "retrieval");
  const pointer = JSON.parse(await readFile(join(state, "active-ingest.json"), "utf8"));
  const authorityNames = [
    "active-ingest.json", "ingest-activation-root.json", "ingest-authority.json", "active-retrieval.json",
    pointer.owner_generation_file, pointer.inner.database_file,
  ];
  const authorityBefore = await Promise.all(authorityNames.map((name) => fileSnapshot(join(state, name))));
  const namesBefore = await readdir(state);

  await writeFile(join(root, "invalid.md"), note(
    "invalid-authored-uid", "Invalid", "OWNER_STRICT_REJECTED_SENTINEL",
  ), "utf8");
  const blocked = await cli(["index", "--kb-path", root, "--strict"], { env });
  assert.equal(blocked.code, 1);
  const blockedResult = JSON.parse(blocked.stdout);
  assert.equal(blockedResult.status, "blocked_strict");
  assert.equal(blockedResult.active.kind, "ingest");
  assert.equal(blockedResult.active.pointer_digest, JSON.parse(published.stdout).active.pointer_digest);
  assert.deepEqual(
    await Promise.all(authorityNames.map((name) => fileSnapshot(join(state, name)))),
    authorityBefore,
  );
  assert.deepEqual(
    (await readdir(state)).filter((name) => name !== "ingest-attempt-status.json").sort(),
    namesBefore.sort(),
  );

  const after = await cli(["search", "Visible", "--kb-path", root], { env });
  assert.equal(after.code, 0);
  assert.equal(after.stdout, baseline.stdout);
  assert.equal(after.stderr, baseline.stderr);
  assert.doesNotMatch(after.stdout, /OWNER_STRICT_REJECTED_SENTINEL|invalid\.md/u);
  assert.deepEqual(
    await Promise.all(authorityNames.map((name) => fileSnapshot(join(state, name)))),
    authorityBefore,
  );
  assert.equal(JSON.parse(await readFile(join(state, "active-retrieval.json"), "utf8")).contract_version,
    "gkos-ingest-legacy-pointer-tombstone/1.0.0-draft.1");
});

test("strict-block routing uses status metadata only, ignores its JSON bytes, and rejects aliases/case variants", async (t) => {
  const aliasRoute = consumeFixtureRow("search_routing_matrix", "aliased_or_case_noncanonical_evidence");
  const noPriorRoute = consumeFixtureRow("search_routing_matrix", "attempt_status_without_prior");
  const authorityError = consumeFixtureRow("fixed_error_matrix", "search_authority");
  assert.equal(aliasRoute.route, "fail_closed");
  assert.equal(noPriorRoute.route, "metadata_only_unavailable");
  assert.equal(aliasRoute.attempt_status_bytes_loaded, false);
  assert.equal(noPriorRoute.attempt_status_bytes_loaded, false);
  const root = await vault(t, "gkos-ingest-cli-status-route-");
  const env = isolatedEnv(root);
  await writeFile(join(root, "visible.md"), note(UUID_A), "utf8");
  const prior = await cli(["search", "Visible", "--kb-path", root], { env });
  assert.equal(prior.code, 0);
  await writeFile(join(root, "invalid.md"), note("invalid-authored-uid", "Invalid"), "utf8");
  assert.equal((await cli(["index", "--kb-path", root, "--strict"], { env })).code, 1);
  const state = join(root, ".gkx", "derived", "retrieval");
  const statusPath = join(state, "ingest-attempt-status.json");
  const canonicalStatus = await readFile(statusPath);

  await writeFile(statusPath, "this is intentionally not JSON\n", "utf8");
  if (process.platform !== "win32") chmodSync(statusPath, 0o600);
  const corruptButOpaque = await cli(["search", "Visible", "--kb-path", root], { env });
  assert.equal(corruptButOpaque.code, 0);
  assert.deepEqual(JSON.parse(corruptButOpaque.stdout), JSON.parse(prior.stdout));

  const alias = join(root, "status-hardlink");
  try { await link(statusPath, alias); }
  catch (error) {
    if (!["EPERM", "ENOTSUP", "EACCES"].includes(error?.code)) throw error;
  }
  if (existsSync(alias)) {
    const hardlinked = await cli(["search", "Visible", "--kb-path", root], { env });
    assert.equal(hardlinked.code, aliasRoute.exit_code ?? authorityError.exit_code);
    assert.equal(hardlinked.stdout, authorityError.stdout);
    assert.equal(hardlinked.stderr, authorityError.stderr);
    await unlink(alias);
  }

  const symlinkTarget = join(root, "status-symlink-target");
  await rename(statusPath, symlinkTarget);
  let linkedStatus = false;
  try {
    await symlink(symlinkTarget, statusPath, "file");
    linkedStatus = true;
  } catch (error) {
    if (!["EPERM", "ENOTSUP", "EACCES"].includes(error?.code)) throw error;
  }
  if (linkedStatus) {
    const symlinked = await cli(["search", "Visible", "--kb-path", root], { env });
    assert.equal(symlinked.code, aliasRoute.exit_code ?? authorityError.exit_code);
    assert.equal(symlinked.stdout, authorityError.stdout);
    assert.equal(symlinked.stderr, authorityError.stderr);
    await unlink(statusPath);
  }
  await rename(symlinkTarget, statusPath);

  const upper = join(state, "INGEST-ATTEMPT-STATUS.JSON");
  const outside = join(root, "status-case-temporary");
  await rename(statusPath, outside);
  await rename(outside, upper);
  const caseVariant = await cli(["search", "Visible", "--kb-path", root], { env });
  assert.equal(caseVariant.code, aliasRoute.exit_code ?? authorityError.exit_code);
  assert.equal(caseVariant.stdout, authorityError.stdout);
  assert.equal(caseVariant.stderr, authorityError.stderr);
  await rename(upper, outside);
  await rename(outside, statusPath);
  await writeFile(statusPath, canonicalStatus);
  if (process.platform !== "win32") chmodSync(statusPath, 0o600);

  const noPrior = await vault(t, "gkos-ingest-cli-status-no-prior-");
  const noPriorEnv = isolatedEnv(noPrior);
  await writeFile(join(noPrior, "invalid.md"), note("invalid-authored-uid", "Invalid"), "utf8");
  assert.equal((await cli(["index", "--kb-path", noPrior, "--strict"], { env: noPriorEnv })).code, 1);
  const noPriorStatus = join(noPrior, ".gkx", "derived", "retrieval", "ingest-attempt-status.json");
  const noPriorBefore = await fileSnapshot(noPriorStatus);
  const unavailable = await cli(["search", "anything", "--kb-path", noPrior], { env: noPriorEnv });
  assert.equal(unavailable.code, noPriorRoute.exit_code);
  assert.equal(unavailable.stdout, authorityError.stdout);
  assert.equal(unavailable.stderr, noPriorRoute.stderr);
  assert.deepEqual(await fileSnapshot(noPriorStatus), noPriorBefore);
});

test("route-to-open and route-to-legacy-writer races are typed operational failures before providers", async (t) => {
  const activeRoot = await vault(t, "gkos-ingest-cli-open-race-");
  await writeFile(join(activeRoot, "visible.md"), note(UUID_A), "utf8");
  const activeConfig = await trustedFtsConfig(activeRoot);
  assert.equal((await cli(["index", "--kb-path", activeRoot, "--strict"], { env: isolatedEnv(activeRoot) })).code, 0);
  const activePointer = join(activeRoot, ".gkx", "derived", "retrieval", "active-ingest.json");
  const savedPointer = join(activeRoot, "saved-active-pointer.json");
  let queryProviderCalls = 0;
  await assert.rejects(runSearch("Visible", activeRoot, 5, {
    configPath: activeConfig,
    onAuthorityRouteObserved: async (active) => {
      assert.equal(active, true);
      await rename(activePointer, savedPointer);
    },
    vectorProvider: {
      kind: "mcp", provider_id: "query-race", model_id: "query-race", dimensions: 1, timeout_ms: 100,
      async embed(texts) { queryProviderCalls++; return texts.map(() => Float32Array.of(1)); },
    },
  }), /GKX_CLI_INGEST_SEARCH_AUTHORITY_FAILURE/u);
  assert.equal(queryProviderCalls, 0);
  await rename(savedPointer, activePointer);

  const blockedRoot = await vault(t, "gkos-ingest-cli-writer-race-");
  await writeFile(join(blockedRoot, "visible.md"), note(UUID_A), "utf8");
  await writeFile(join(blockedRoot, "invalid.md"), note("invalid-authored-uid", "Invalid"), "utf8");
  const configPath = join(blockedRoot, "operator.toml");
  await writeFile(configPath, "config_version = 1\n[retrieval]\nmode = \"fts\"\n", "utf8");
  let indexProviderCalls = 0;
  await assert.rejects(runSearch("Visible", blockedRoot, 5, {
    configPath,
    async onAuthorityRouteObserved(active) {
      assert.equal(active, false);
      const blocked = await runIngestIndex(blockedRoot, { strict: true });
      assert.equal(blocked.status, "blocked_strict");
    },
    vectorProvider: {
      kind: "mcp", provider_id: "index-race", model_id: "index-race", dimensions: 1, timeout_ms: 100,
      async embed(texts) { indexProviderCalls++; return texts.map(() => Float32Array.of(1)); },
    },
  }), /GKX_CLI_INGEST_SEARCH_AUTHORITY_FAILURE/u);
  assert.equal(indexProviderCalls, 0);
  const blockedState = join(blockedRoot, ".gkx", "derived", "retrieval");
  assert.equal(existsSync(join(blockedState, "ingest-attempt-status.json")), true);
  assert.equal(existsSync(join(blockedState, "active-retrieval.json")), false);

  const lockedRoot = await vault(t, "gkos-ingest-cli-lock-race-");
  await writeFile(join(lockedRoot, "visible.md"), note(UUID_A), "utf8");
  const lockedConfig = await trustedFtsConfig(lockedRoot);
  const lockedState = join(lockedRoot, ".gkx", "derived", "retrieval");
  let heldAuthority;
  let lockProviderCalls = 0;
  try {
    await assert.rejects(runSearch("Visible", lockedRoot, 5, {
      configPath: lockedConfig,
      async onAuthorityRouteObserved(active) {
        assert.equal(active, false);
        heldAuthority = preflightIngestAuthority(lockedState);
      },
      vectorProvider: {
        kind: "mcp", provider_id: "lock-race", model_id: "lock-race", dimensions: 1, timeout_ms: 100,
        async embed(texts) { lockProviderCalls++; return texts.map(() => Float32Array.of(1)); },
      },
    }), /GKX_CLI_INGEST_SEARCH_AUTHORITY_FAILURE/u);
    assert.equal(lockProviderCalls, 0);
    assert.equal(existsSync(join(lockedState, "ingest-authority.lock")), true);
  } finally {
    if (heldAuthority) releaseIngestAuthorityPreflight(heldAuthority);
  }

  const activatedRoot = await vault(t, "gkos-ingest-cli-activation-race-");
  await writeFile(join(activatedRoot, "visible.md"), note(UUID_A), "utf8");
  const activatedConfig = await trustedFtsConfig(activatedRoot);
  const activatedState = join(activatedRoot, ".gkx", "derived", "retrieval");
  let committedSnapshots;
  let activationProviderCalls = 0;
  await assert.rejects(runSearch("Visible", activatedRoot, 5, {
    configPath: activatedConfig,
    async onAuthorityRouteObserved(active) {
      assert.equal(active, false);
      const published = await runIngestIndex(activatedRoot, { strict: true, configPath: activatedConfig });
      assert.equal(published.status, "published");
      committedSnapshots = await Promise.all([
        "ingest-activation-root.json", "ingest-authority.json", "active-retrieval.json", "active-ingest.json",
      ].map((name) => fileSnapshot(join(activatedState, name))));
    },
    vectorProvider: {
      kind: "mcp", provider_id: "activation-race", model_id: "activation-race", dimensions: 1, timeout_ms: 100,
      async embed(texts) { activationProviderCalls++; return texts.map(() => Float32Array.of(1)); },
    },
  }), /GKX_CLI_INGEST_SEARCH_AUTHORITY_FAILURE/u);
  assert.equal(activationProviderCalls, 0);
  assert.deepEqual(await Promise.all([
    "ingest-activation-root.json", "ingest-authority.json", "active-retrieval.json", "active-ingest.json",
  ].map((name) => fileSnapshot(join(activatedState, name)))), committedSnapshots);
});

test("non-strict CLI publication retains N-1 and all-invalid observations without exposing them in IndexResult", async (t) => {
  const mixed = await vault(t, "gkos-ingest-cli-mixed-");
  const mixedEnv = isolatedEnv(mixed);
  await writeFile(join(mixed, "visible.md"), note(UUID_A), "utf8");
  await writeFile(join(mixed, "invalid.md"), note("invalid-authored-uid", "Invalid", "HIDDEN_INVALID_SENTINEL"), "utf8");
  const published = await cli(["index", "--kb-path", mixed], { env: mixedEnv });
  assert.equal(published.code, 0);
  const mixedResult = JSON.parse(published.stdout);
  assert.equal(mixedResult.status, "published_with_rejections");
  assert.equal(mixedResult.summary.valid_source_count, 1);
  assert.equal(mixedResult.summary.rejected_source_count, 1);
  assert.equal(published.stderr, "");
  assert.doesNotMatch(published.stdout, /(?:visible|invalid)\.md|HIDDEN_INVALID_SENTINEL/u);
  const search = await cli(["search", "Visible", "--kb-path", mixed], { env: mixedEnv });
  assert.equal(search.code, 0);
  assert.equal(JSON.parse(search.stdout).hits.length, 1);

  const empty = await vault(t, "gkos-ingest-cli-empty-");
  const emptyEnv = isolatedEnv(empty);
  await writeFile(join(empty, "invalid.md"), note("invalid-authored-uid", "Invalid", "ALL_INVALID_SENTINEL"), "utf8");
  const allInvalid = await cli(["index", "--kb-path", empty], { env: emptyEnv });
  assert.equal(allInvalid.code, 0);
  const emptyResult = JSON.parse(allInvalid.stdout);
  assert.equal(emptyResult.status, "published_with_rejections");
  assert.equal(emptyResult.summary.valid_source_count, 0);
  assert.equal(emptyResult.summary.rejected_source_count, 1);
  const emptySearch = await cli(["search", "anything", "--kb-path", empty], { env: emptyEnv });
  assert.equal(emptySearch.code, 0);
  assert.deepEqual(JSON.parse(emptySearch.stdout).hits, []);
});

test("configured provider failure sees accepted public text only and degrades to one lexical publication", async (t) => {
  const root = await vault(t, "gkos-ingest-cli-provider-");
  const configRoot = join(root, "operator-config");
  const configPath = join(configRoot, "gkos", "gkos.toml");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(join(root, "visible.md"), note(UUID_A, "Visible", "VISIBLE_PROVIDER_SENTINEL"), "utf8");
  await writeFile(join(root, "invalid.md"), note("invalid-authored-uid", "Invalid", "REJECTED_PROVIDER_SENTINEL"), "utf8");
  const requests = [];
  const server = createServer((request, response) => {
    const parts = [];
    request.on("data", (part) => parts.push(part));
    request.on("end", () => {
      requests.push(JSON.parse(Buffer.concat(parts).toString("utf8")));
      response.writeHead(503, { "content-type": "application/json" });
      response.end('{"error":"qualified failure"}');
    });
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  t.after(() => new Promise((resolvePromise) => server.close(resolvePromise)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const env = isolatedEnv(root, { XDG_CONFIG_HOME: configRoot });

  // A strict intrinsic block precedes config discovery and provider work.
  await writeFile(configPath, "not valid trusted config", "utf8");
  const blocked = await cli(["index", "--kb-path", root, "--strict"], { env });
  assert.equal(blocked.code, 1);
  assert.equal(requests.length, 0);

  await writeFile(configPath, `config_version = 1
[vectors]
enabled = true
provider = "openai_compatible"
provider_id = "cli-provider"
model_id = "cli-model"
dimensions = 2
timeout_ms = 2000
endpoint = "http://127.0.0.1:${address.port}/embeddings"
`, "utf8");
  const invoked = await cli(["index", "--kb-path", root], { env });
  assert.equal(invoked.code, 0);
  const result = JSON.parse(invoked.stdout);
  assert.equal(result.status, "published_with_rejections");
  assert.equal(requests.length, 1);
  const providerText = requests.flatMap((item) => item.input);
  assert.ok(providerText.some((text) => text.includes("VISIBLE_PROVIDER_SENTINEL")));
  assert.equal(providerText.some((text) => text.includes("REJECTED_PROVIDER_SENTINEL")), false);
  assert.doesNotMatch(invoked.stdout, /PROVIDER_SENTINEL|\.md/u);

  const state = join(root, ".gkx", "derived", "retrieval");
  const active = JSON.parse(await readFile(join(state, "active-ingest.json"), "utf8"));
  const owner = JSON.parse(await readFile(join(state, active.owner_generation_file), "utf8"));
  assert.equal(owner.inner.manifest.embedding_provider_id, null);
  assert.equal(owner.inner.manifest.embedding_model_id, null);
  assert.equal(owner.inner.manifest.embedding_dimensions, null);
});

test("post-activation ordinary search fails closed with safe exit 3 for missing, corrupt, or case-aliased authority", async (t) => {
  const root = await vault(t, "gkos-ingest-cli-authority-");
  const env = isolatedEnv(root);
  await writeFile(join(root, "visible.md"), note(UUID_A), "utf8");
  const indexed = await cli(["index", "--kb-path", root, "--strict"], { env });
  assert.equal(indexed.code, 0);
  const state = join(root, ".gkx", "derived", "retrieval");
  const pointer = JSON.parse(await readFile(join(state, "active-ingest.json"), "utf8"));
  const backup = join(root, "authority-backup");
  await mkdir(backup);
  const targets = [
    "ingest-activation-root.json",
    "ingest-authority.json",
    "active-ingest.json",
    pointer.inner.database_file,
  ];
  for (const name of targets) {
    const path = join(state, name);
    const saved = join(backup, name);
    await rename(path, saved);
    const failed = await cli(["search", "Visible", "--kb-path", root], { env });
    assert.equal(failed.code, 3, name);
    assert.equal(failed.stdout, "", name);
    assert.equal(failed.stderr, "gkx search: operational authority failure\n", name);
    assert.doesNotMatch(failed.stderr, /(?:[A-Za-z]:\\|\/tmp\/|Error:|\s+at\s+)/u);
    await rename(saved, path);
  }

  const pointerPath = join(state, "active-ingest.json");
  const pointerBytes = await readFile(pointerPath);
  await writeFile(pointerPath, "{}\n", "utf8");
  if (process.platform !== "win32") chmodSync(pointerPath, 0o600);
  let failed = await cli(["search", "Visible", "--kb-path", root], { env });
  assert.equal(failed.code, 3);
  assert.equal(failed.stdout, "");
  await writeFile(pointerPath, pointerBytes);
  if (process.platform !== "win32") chmodSync(pointerPath, 0o600);

  const upper = join(state, "ACTIVE-INGEST.JSON");
  const outside = join(backup, "case-pointer");
  await rename(pointerPath, outside);
  await rename(outside, upper);
  failed = await cli(["search", "Visible", "--kb-path", root], { env });
  assert.equal(failed.code, 3);
  assert.equal(failed.stdout, "");
  await rename(upper, outside);
  await rename(outside, pointerPath);
});

test("ordinary search holds the verified active store before config or provider discovery", async (t) => {
  const activeRoot = await vault(t, "gkos-ingest-cli-preconfig-active-");
  const activeEnv = isolatedEnv(activeRoot);
  await writeFile(join(activeRoot, "visible.md"), note(UUID_A), "utf8");
  assert.equal((await cli(["index", "--kb-path", activeRoot, "--strict"], { env: activeEnv })).code, 0);
  const malformedActiveConfig = join(activeRoot, "malformed-config.toml");
  await writeFile(malformedActiveConfig, "this config must never be parsed", "utf8");
  const activeState = join(activeRoot, ".gkx", "derived", "retrieval");
  const activePointerPath = join(activeState, "active-ingest.json");
  const activePointer = JSON.parse(await readFile(activePointerPath, "utf8"));
  const activeDatabasePath = join(activeState, activePointer.inner.database_file);
  let providerCalls = 0;
  const provider = {
    kind: "mcp", provider_id: "preconfig-sentinel", model_id: "preconfig-sentinel", dimensions: 1, timeout_ms: 100,
    async embed(texts) { providerCalls++; return texts.map(() => Float32Array.of(1)); },
  };

  const activePointerBytes = await readFile(activePointerPath);
  await writeFile(activePointerPath, "{}\n", "utf8");
  if (process.platform !== "win32") chmodSync(activePointerPath, 0o600);
  const subprocess = await cli([
    "search", "Visible", "--kb-path", activeRoot, "--config", malformedActiveConfig,
  ], { env: activeEnv });
  assert.equal(subprocess.code, 3);
  assert.equal(subprocess.stdout, "");
  assert.equal(subprocess.stderr, "gkx search: operational authority failure\n");
  await writeFile(activePointerPath, activePointerBytes);
  if (process.platform !== "win32") chmodSync(activePointerPath, 0o600);

  const activeDatabaseBackup = join(activeRoot, "active-database-backup.sqlite");
  await rename(activeDatabasePath, activeDatabaseBackup);
  await writeFile(activeDatabasePath, "not a sqlite database", "utf8");
  if (process.platform !== "win32") chmodSync(activeDatabasePath, 0o600);
  await assert.rejects(runSearch("Visible", activeRoot, 5, {
    configPath: malformedActiveConfig,
    vectorProvider: provider,
  }), /GKX_CLI_INGEST_SEARCH_AUTHORITY_FAILURE/u);
  assert.equal(providerCalls, 0);
  await unlink(activeDatabasePath);
  await rename(activeDatabaseBackup, activeDatabasePath);

  const legacyRoot = await vault(t, "gkos-ingest-cli-preconfig-legacy-");
  const legacyEnv = isolatedEnv(legacyRoot);
  await writeFile(join(legacyRoot, "visible.md"), note(UUID_B), "utf8");
  assert.equal((await cli(["search", "Visible", "--kb-path", legacyRoot], { env: legacyEnv })).code, 0);
  await writeFile(join(legacyRoot, "invalid.md"), note("invalid-authored-uid", "Invalid"), "utf8");
  assert.equal((await cli(["index", "--kb-path", legacyRoot, "--strict"], { env: legacyEnv })).code, 1);
  const malformedLegacyConfig = join(legacyRoot, "malformed-config.toml");
  await writeFile(malformedLegacyConfig, "this legacy config must never be parsed", "utf8");
  const legacyState = join(legacyRoot, ".gkx", "derived", "retrieval");
  const legacyPointerPath = join(legacyState, "active-retrieval.json");
  const legacyPointerBytes = await readFile(legacyPointerPath);
  const legacyPointer = JSON.parse(legacyPointerBytes.toString("utf8"));
  const legacyDatabasePath = join(legacyState, legacyPointer.database_file);

  await writeFile(legacyPointerPath, "{}\n", "utf8");
  if (process.platform !== "win32") chmodSync(legacyPointerPath, 0o600);
  await assert.rejects(runSearch("Visible", legacyRoot, 5, {
    configPath: malformedLegacyConfig,
    vectorProvider: provider,
  }), /GKX_CLI_INGEST_SEARCH_AUTHORITY_FAILURE/u);
  await writeFile(legacyPointerPath, legacyPointerBytes);
  if (process.platform !== "win32") chmodSync(legacyPointerPath, 0o600);

  const legacyDatabaseBackup = join(legacyRoot, "legacy-database-backup.sqlite");
  await rename(legacyDatabasePath, legacyDatabaseBackup);
  await writeFile(legacyDatabasePath, "not a sqlite database", "utf8");
  if (process.platform !== "win32") chmodSync(legacyDatabasePath, 0o600);
  await assert.rejects(runSearch("Visible", legacyRoot, 5, {
    configPath: malformedLegacyConfig,
    vectorProvider: provider,
  }), /GKX_CLI_INGEST_SEARCH_AUTHORITY_FAILURE/u);
  assert.equal(providerCalls, 0);
  await unlink(legacyDatabasePath);
  await rename(legacyDatabaseBackup, legacyDatabasePath);
});
