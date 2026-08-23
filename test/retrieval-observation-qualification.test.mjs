import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import esbuild from "esbuild";

import { retrievalSha256, stableJson } from "../dist/retrieval.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1));
const BUILD_ROOT = join(tmpdir(), `gkos-phase4-observation-test-${randomUUID().replaceAll("-", "")}`);

async function bundle(entry, output) {
  await mkdir(BUILD_ROOT, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(BUILD_ROOT, 0o700);
  await esbuild.build({
    entryPoints: [join(ROOT, entry)],
    bundle: true,
    write: true,
    outfile: join(BUILD_ROOT, output),
    format: "esm",
    platform: "node",
    target: "node22",
    logLevel: "silent",
  });
  return import(`${pathToFileURL(join(BUILD_ROOT, output)).href}?v=${randomUUID()}`);
}

const generatorPromise = bundle("scripts/generate-retrieval-observation-fixture.mjs", "generator.mjs");
const runnerPromise = bundle("scripts/run-retrieval-observation-qualification.mjs", "runner.mjs");

const EVAL_NAME = "actual coordinator eval replay emits exact text and pretty canonical JSON offline";
const TUNE_NAME = "actual exhaustive tune replay publishes one durable exact candidate and no sidecars";

function tapFixture(names, options = {}) {
  const durations = options.durations ?? new Map();
  const rows = ["TAP version 13"];
  names.forEach((name, index) => {
    rows.push(`# Subtest: ${name}`);
    rows.push(`${options.notOk?.has(name) ? "not ok" : "ok"} ${index + 1} - ${name}${options.suffix?.get(name) ?? ""}`);
    rows.push("  ---", `  duration_ms: ${durations.get(name) ?? "1.0"}`, "  ...");
  });
  rows.push(`1..${names.length}`);
  const fail = options.fail ?? 0;
  const skipped = options.skipped ?? 0;
  const todo = options.todo ?? 0;
  rows.push(`# tests ${names.length}`, `# suites 0`, `# pass ${names.length - fail}`, `# fail ${fail}`,
    `# cancelled ${options.cancelled ?? 0}`, `# skipped ${skipped}`, `# todo ${todo}`, `# duration_ms ${options.reporter ?? "10.0"}`, "");
  return rows.join("\n");
}

test.after(async () => {
  await rm(BUILD_ROOT, { recursive: true, force: true });
});

test("Slice-C SamplePlan and 10k fixture reproduce every frozen byte coordinate", { timeout: 30_000 }, async () => {
  const generator = await generatorPromise;
  const plan = generator.performanceSamplePlan();
  assert.equal(Object.keys(plan).length, 9);
  assert.equal(plan.sample_plan_digest, generator.PERFORMANCE_SAMPLE_PLAN_DIGEST);
  const preimage = { ...plan };
  delete preimage.sample_plan_digest;
  const preimageJson = stableJson(preimage);
  assert.equal(Buffer.byteLength(preimageJson, "utf8"), 9_449);
  assert.equal(retrievalSha256(preimageJson), "sha256:7852c24bc2eeb057f3ae9ccfaf4b03c72e75b6556609dac7673e5626f238a534");

  const initial = generator.buildPerformanceCorpus(false);
  const updated = generator.buildPerformanceCorpus(true);
  assert.equal(initial.sources.length, 1_000);
  assert.equal(initial.chunks.length, 10_000);
  assert.equal(updated.chunks.length, 10_000);
  assert.equal(initial.source_snapshot_digest, "sha256:d87568bc14830e0646057690b2db23df07c437048a153c086a81dbb804fc98ce");
  assert.equal(initial.chunk_set_digest, "sha256:321962e7dd2345895365db35b50ecf5478c169c489f1a92d9cd6647301d66e8a");
  assert.equal(updated.source_snapshot_digest, "sha256:fef6de2b266428a70e1d3668c0cbbb7f0f99ac4841f02b663ead77eeadb44128");
  assert.equal(updated.chunk_set_digest, "sha256:9563bfeb50827dd4d68242cdf73b992904aff7f3e429d29b7038155a3f5de1eb");
  assert.equal(initial.chunks.filter((chunk, index) => chunk.content_digest !== updated.chunks[index].content_digest).length, 1);
  assert.equal(initial.chunks.filter((chunk, index) => chunk.source_digest !== updated.chunks[index].source_digest).length, 10);

  const results = generator.performanceQueryCycle().queries.map((query) => ({
    query_id: query.query_id,
    query_text: query.query_text,
    result_digest: retrievalSha256(query.query_id),
  }));
  const exactResultSet = retrievalSha256(stableJson({
    contract_version: "gkos-retrieval-evaluation-performance-result-set/1.0.0",
    results,
  }));
  assert.equal(generator.resultSetDigest(results), exactResultSet);
  assert.notEqual(generator.resultSetDigest(results), retrievalSha256(stableJson({
    contract_version: "gkos-retrieval-evaluation-performance-result-set/1.0.0",
    query_count: results.length,
    results,
  })));
  const samples = Array.from({ length: 50 }, (_, index) => index + 1);
  assert.equal(generator.sampleVectorDigest(samples), retrievalSha256(stableJson({
    contract_version: "gkos-retrieval-evaluation-performance-sample-vector/1.0.0",
    sample_count: 50,
    samples_micros: samples,
  })));
});

test("Slice-C qualification TAP oracle enforces exact totals, unique names, and ceiling budgets", async () => {
  const runner = await runnerPromise;
  const names = [EVAL_NAME, TUNE_NAME, ...Array.from({ length: 21 }, (_, index) => `qualification case ${index + 1}`)];
  const tap = tapFixture(names, {
    durations: new Map([[EVAL_NAME, "90000.0"], [TUNE_NAME, "300000.0"]]),
    reporter: "600000.0",
  });
  const parsed = runner.parseTapForTest(tap, 600_000_000);
  assert.deepEqual(parsed.summary, {
    tests: 23,
    pass: 23,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
    reporter_duration_micros: 600_000_000,
    wall_duration_micros: 600_000_000,
  });
  assert.equal(runner.exactTestTotalsForTest(parsed.summary, 23), true);
  assert.equal(runner.temporalObservationForTest(parsed).duration_micros, 90_000_000);
  assert.equal(runner.tuneObservationForTest(parsed).duration_micros, 300_000_000);
  assert.equal(runner.decimalMillisToCeilMicrosForTest("0"), 0);
  assert.equal(runner.decimalMillisToCeilMicrosForTest("0.0001"), 1);
  assert.equal(runner.decimalMillisToCeilMicrosForTest("90000.0001"), 90_000_001);

  assert.throws(() => runner.parseTapForTest(tapFixture([...names.slice(0, -1), EVAL_NAME]), 1),
    /GKX_EVAL_QUALIFICATION_TAP_INVALID/u);
  const missingTarget = runner.parseTapForTest(tapFixture(names.map((name) => name === EVAL_NAME ? "renamed eval" : name)), 1);
  assert.equal(runner.temporalObservationForTest(missingTarget), null);
  for (const summaryMutation of [
    { fail: 1, notOk: new Set([names[2]]) },
    { skipped: 1, suffix: new Map([[names[2], " # SKIP"]]) },
    { todo: 1, suffix: new Map([[names[2], " # TODO"]]) },
  ]) {
    const mutated = runner.parseTapForTest(tapFixture(names, summaryMutation), 1);
    assert.equal(runner.exactTestTotalsForTest(mutated.summary, 23), false);
  }
});

test("Slice-C qualification receipt freezes exact keys, nullability, privacy, and digest", async () => {
  const runner = await runnerPromise;
  const samplePlan = runner.qualificationSamplePlanForTest();
  assert.equal(samplePlan.sample_plan_digest, "sha256:b37749ee2302fa5086769aa81234f89a4b180e7f2569a18d19c86178da8fb83d");
  const base = {
    source: { checkout_commit: "a".repeat(40), source_head_commit: "a".repeat(40), event_commit: "a".repeat(40), event_name: "local", phase4_slice_b_evidence_commit: "ed3a7552b1d4a705c1b1a722b07255e89ec42186" },
    environment: { runner_class: "local", runtime: "node", runtime_version: "24.0.0", os: "linux", arch: "x64", sqlite_version: "3.0.0", physical_fts5_available: true, scan_presentation_contract_version: "gkos-retrieval-evaluation-scan-presentation/1.0.0-draft.1", scan_presentation_fts5_available: true },
    immutable_inputs: { phase4_pack_file_count: 37 },
    cli_test_summary: null,
    temporal_noninterference: null,
    tune_qualification: null,
    windows_security: null,
  };
  const receipt = runner.buildQualificationReceiptForTest({ ...base, failure_codes: ["QUAL_TUNE_TEST_MISSING", "QUAL_TEMPORAL_TEST_MISSING", "QUAL_TUNE_TEST_MISSING"] });
  assert.deepEqual(Object.keys(receipt).sort(), ["cli_test_summary", "contract_version", "environment", "failure_codes", "immutable_inputs", "qualification_digest", "sample_plan", "source", "status", "temporal_noninterference", "tune_qualification", "windows_security"].sort());
  assert.deepEqual(receipt.failure_codes, ["QUAL_TEMPORAL_TEST_MISSING", "QUAL_TUNE_TEST_MISSING"]);
  assert.equal(receipt.status, "fail");
  const material = { ...receipt };
  delete material.qualification_digest;
  assert.equal(receipt.qualification_digest, retrievalSha256(stableJson(material)));
  const bytes = `${JSON.stringify(JSON.parse(stableJson(receipt)), null, 2)}\n`;
  assert.equal(bytes.includes("\\r"), false);
  assert.equal(/(?:absolute_path|credential|secret|raw_corpus|raw_provider|raw_result|raw_candidate)/u.test(bytes), false);
  assert.throws(() => runner.buildQualificationReceiptForTest({ ...base, failure_codes: [] }),
    /GKX_EVAL_QUALIFICATION_RECEIPT_NULLABILITY_INVALID/u);
});

test("Slice-C query authenticity rejects cache and measured-round substitutions", async () => {
  const runner = await runnerPromise;
  assert.equal(runner.observedQueryCacheHitCountForTest(1), 0);
  assert.equal(runner.observedQueryCacheHitCountForTest(0), 1);
  assert.throws(() => runner.observedQueryCacheHitCountForTest(2), /GKX_EVAL_OBSERVATION_QUERY_CACHE_LEDGER_INVALID/u);
  const attempts = [];
  for (let round = 1; round <= 6; round += 1) {
    for (let query = 1; query <= 10; query += 1) attempts.push({ query_id: `q${query}`, round_ordinal: round, result_digest: `sha256:${String(query).padStart(64, "0")}` });
  }
  assert.equal(runner.measuredRoundsIdenticalForTest(attempts), true);
  attempts[35] = { ...attempts[35], result_digest: `sha256:${"f".repeat(64)}` };
  assert.equal(runner.measuredRoundsIdenticalForTest(attempts), false);
});

test("Slice-C publication eligibility requires exact committed hosted provenance", async () => {
  const runner = await runnerPromise;
  const prior = process.env.GITHUB_ACTIONS;
  process.env.GITHUB_ACTIONS = "true";
  const source = {
    checkout_commit: "a".repeat(40),
    source_head_commit: "a".repeat(40),
    event_commit: "a".repeat(40),
    event_name: "workflow_dispatch",
    runner_file_sha256: `sha256:${"b".repeat(64)}`,
    runner_committed_blob_sha256: `sha256:${"b".repeat(64)}`,
    runner_committed_at_checkout: true,
    worktree_clean: true,
    execution_provenance: "committed_clean",
  };
  try {
    assert.equal(runner.publicationEligibleForTest(source), true);
    assert.equal(runner.publicationEligibleForTest({ ...source, runner_committed_blob_sha256: `sha256:${"c".repeat(64)}` }), false);
    assert.equal(runner.publicationEligibleForTest({ ...source, source_head_commit: "d".repeat(40) }), false);
    assert.equal(runner.publicationEligibleForTest({ ...source, event_name: "local" }), false);
    assert.equal(runner.publicationEligibleForTest({ ...source, worktree_clean: false }), false);
  } finally {
    if (prior === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = prior;
  }
});

test("Slice-C source provenance distinguishes push checkout from pull-request head", async () => {
  const runner = await runnerPromise;
  const pushCommit = "a".repeat(40);
  const pullRequestMergeCommit = "b".repeat(40);
  const pullRequestHeadCommit = "c".repeat(40);

  assert.equal(runner.resolveSourceHeadCommitForTest(pushCommit, undefined), pushCommit);
  assert.equal(runner.resolveSourceHeadCommitForTest(pushCommit, pushCommit), pushCommit);
  assert.equal(
    runner.resolveSourceHeadCommitForTest(pullRequestMergeCommit, pullRequestHeadCommit),
    pullRequestHeadCommit,
  );
  assert.notEqual(pullRequestMergeCommit, pullRequestHeadCommit);
  for (const invalid of ["", "A".repeat(40), "f".repeat(39), "g".repeat(40), null, 1]) {
    assert.throws(
      () => runner.resolveSourceHeadCommitForTest(pushCommit, invalid),
      /GKX_EVAL_SOURCE_COMMIT_INVALID/u,
    );
  }
  assert.throws(
    () => runner.resolveSourceHeadCommitForTest("A".repeat(40), pushCommit),
    /GKX_EVAL_SOURCE_COMMIT_INVALID/u,
  );
});

test("Slice-C Observation receipt freezes exact top/sample keys, digest, and failure nullability", async () => {
  const runner = await runnerPromise;
  const source = {
    checkout_commit: "a".repeat(40), source_head_commit: "a".repeat(40), event_commit: "a".repeat(40), event_name: "local",
    runner_file_sha256: `sha256:${"b".repeat(64)}`, runner_committed_blob_sha256: null,
    runner_committed_at_checkout: false, worktree_clean: false, execution_provenance: "local_uncommitted",
  };
  const failure = runner.buildObservationReceiptForTest({
    failure_codes: ["OBS_REPORT_INVALID"], publication_eligible: false, source,
    fixture: null, environment: null, indexing: null, query_latency: null, convergence: null, observation_report: null,
  });
  assert.deepEqual(Object.keys(failure).sort(), ["contract_version", "status", "failure_codes", "publication_eligible", "source", "sample_plan", "fixture", "environment", "indexing", "query_latency", "convergence", "observation_report", "receipt_digest"].sort());
  assert.deepEqual(Object.keys(failure.sample_plan).sort(), ["contract_version", "sample_plan_digest", "warmup_count", "sample_count", "p95_strict_upper_bound_micros"].sort());
  const material = { ...failure };
  delete material.receipt_digest;
  assert.equal(failure.receipt_digest, retrievalSha256(stableJson(material)));
  assert.throws(() => runner.buildObservationReceiptForTest({
    failure_codes: [], publication_eligible: false, source,
    fixture: null, environment: null, indexing: null, query_latency: null, convergence: null, observation_report: null,
  }), /GKX_EVAL_OBSERVATION_RECEIPT_NULLABILITY_INVALID/u);
  assert.throws(() => runner.buildObservationReceiptForTest({
    failure_codes: ["OBS_REPORT_INVALID"], publication_eligible: false, source,
    fixture: null, environment: null, indexing: null, query_latency: null, convergence: null, observation_report: {},
  }), /GKX_EVAL_OBSERVATION_RECEIPT_NULLABILITY_INVALID/u);
});

test("Slice-C Observation pass authority is Linux x64 only", async () => {
  const runner = await runnerPromise;
  if (process.platform !== "win32") {
    assert.notEqual(process.platform, "win32");
    return;
  }
  const artifactRoot = join(BUILD_ROOT, `non-linux-observation-${randomUUID().replaceAll("-", "")}`);
  await mkdir(artifactRoot, { mode: 0o700 });
  const priorExitCode = process.exitCode;
  try {
    await runner.main(["--mode", "observation", "--artifact-root", artifactRoot]);
    assert.equal(process.exitCode, 1);
    const receipt = JSON.parse(await readFile(join(artifactRoot, "observation-receipt.json"), "utf8"));
    assert.deepEqual(Object.keys(receipt).sort(), ["contract_version", "status", "failure_codes", "publication_eligible", "source", "sample_plan", "fixture", "environment", "indexing", "query_latency", "convergence", "observation_report", "receipt_digest"].sort());
    assert.equal(receipt.status, "fail");
    assert.deepEqual(receipt.failure_codes, ["OBS_REPORT_INVALID"]);
    assert.equal(receipt.publication_eligible, false);
    assert.equal(receipt.observation_report, null);
    await assert.rejects(readFile(join(artifactRoot, "observation-report.json")), (error) => error.code === "ENOENT");
    await assert.rejects(readFile(join(artifactRoot, "performance-sample-plan.json")), (error) => error.code === "ENOENT");
  } finally {
    process.exitCode = priorExitCode;
  }
});

test("Slice-C offline boundary denies every frozen network and process family", async () => {
  const runner = await runnerPromise;
  assert.deepEqual(runner.exerciseOfflineGuardFamiliesForTest(), {
    fetch: 1,
    http: 1,
    https: 1,
    http2: 1,
    net: 1,
    tls: 1,
    dns: 1,
    dgram: 1,
    websocket: 1,
    child_process: 1,
  });
});

test("Slice-C temp capability cleans exact roots and fail-retains identity substitutions", async () => {
  const runner = await runnerPromise;
  const ordinary = await runner.createObservationTempCapabilityForTest();
  const ordinaryRoot = ordinary.task_path;
  await ordinary.revalidate();
  await ordinary.cleanup();
  await assert.rejects(lstat(ordinaryRoot), (error) => error.code === "ENOENT");

  const substituted = await runner.createObservationTempCapabilityForTest();
  const held = `${substituted.incremental_state}-held`;
  try {
    await rename(substituted.incremental_state, held);
    await mkdir(substituted.incremental_state, { mode: 0o700 });
    if (process.platform !== "win32") await chmod(substituted.incremental_state, 0o700);
    await writeFile(join(substituted.incremental_state, "sentinel"), "retain\n", "utf8");
    await assert.rejects(
      substituted.cleanup(),
      (error) => error.message === "GKX_EVAL_OBSERVATION_TEMP_CAPABILITY_CHANGED",
    );
    assert.equal((await lstat(join(substituted.incremental_state, "sentinel"))).isFile(), true);
    assert.equal((await lstat(held)).isDirectory(), true);
  } finally {
    await rm(substituted.task_path, { recursive: true, force: true });
  }
});

test("Slice-C workflows freeze scheduled Observation and supplementary cross-runtime lanes", async () => {
  const observation = await readFile(join(ROOT, ".github", "workflows", "phase4-retrieval-observation.yml"), "utf8");
  const continuous = await readFile(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));

  assert.equal((observation.match(/cron: "17 4 \* \* \*"/gu) ?? []).length, 1);
  assert.equal((observation.match(/workflow_dispatch:/gu) ?? []).length, 1);
  assert.equal((observation.match(/actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/gu) ?? []).length, 1);
  assert.match(observation, /node-version: 24/u);
  assert.match(observation, /--mode observation/u);
  assert.match(observation, /timeout-minutes: 45/u);
  assert.match(observation, /fetch-depth: 0/u);
  assert.match(observation, /--mode immutability/u);
  assert.match(observation, /\.\/node_modules\/\.bin\/esbuild scripts\/run-retrieval-observation-qualification\.mjs/u);
  for (const coordinate of ["cac029a5b570135b26f3585bc86f4c9beb00c36d", "ed3a7552b1d4a705c1b1a722b07255e89ec42186", "5396d46d"] ) {
    assert.equal((await readFile(join(ROOT, "scripts", "run-retrieval-observation-qualification.mjs"), "utf8")).includes(coordinate), true);
  }
  for (const file of ["performance-sample-plan.json", "observation-receipt.json", "observation-report.json"]) {
    assert.match(observation, new RegExp(file.replace(".", "\\."), "u"));
  }

  assert.doesNotMatch(continuous, /phase4-retrieval-cli-qualification:/u);
  assert.match(continuous, /node: \[22, 23, 24\]/u);
  assert.equal((continuous.match(/fetch-depth: 0/gu) ?? []).length, 2);
  assert.equal((continuous.match(/timeout-minutes: 15/gu) ?? []).length, 2);
  assert.equal((continuous.match(/GKOS_PHASE4_SOURCE_HEAD_COMMIT:/gu) ?? []).length, 2);
  assert.equal((continuous.match(/github\.event\.pull_request\.head\.sha \|\| github\.sha/gu) ?? []).length, 2);
  assert.doesNotMatch(continuous, /timeout 900s/u);
  assert.match(continuous, /--mode cli/u);
  assert.match(continuous, /--mode windows-security/u);
  assert.match(continuous, /\.\/node_modules\/\.bin\/esbuild scripts\/run-retrieval-observation-qualification\.mjs/u);
  assert.match(continuous, /\.\\node_modules\\\.bin\\esbuild\.cmd scripts\/run-retrieval-observation-qualification\.mjs/u);
  assert.match(continuous, /gkos-phase4-retrieval-qualification\.json/u);
  assert.match(continuous, /phase4-retrieval-qualification-\$\{\{ runner\.os \}\}-node-\$\{\{ matrix\.node \}\}/u);
  assert.equal((continuous.match(/actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/gu) ?? []).length, 2);
  assert.equal(JSON.stringify(packageJson.exports).includes("observation"), false);
  assert.equal(JSON.stringify(packageJson.exports).includes("qualification"), false);
});

test("Slice-C frozen pack and CLI fixture retain LF bytes on autocrlf checkouts", () => {
  const packRoot = "contracts/retrieval/gkos-retrieval-evaluation-1.0.0-draft.1";
  const packFiles = execFileSync("git", ["ls-files", packRoot], { cwd: ROOT, encoding: "utf8" })
    .trim().split(/\r?\n/u).filter(Boolean);
  assert.equal(packFiles.length, 37);
  for (const path of [...packFiles, "test/fixtures/retrieval-evaluation-cli-phase4.json"]) {
    const attribute = execFileSync("git", ["check-attr", "eol", "--", path], { cwd: ROOT, encoding: "utf8" }).trim();
    assert.equal(attribute, `${path}: eol: lf`, path);
  }
});
