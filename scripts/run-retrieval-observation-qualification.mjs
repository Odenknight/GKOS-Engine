/**
 * Private Phase-4 Slice-C qualification runner.
 *
 * This file is bundled with esbuild before execution so it can consume the
 * repository-private coordinator observer seam without adding a package
 * export. It emits only bounded canonical JSON receipts; generated source,
 * SQLite, provider, query, and result bytes never enter the artifact root.
 */
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { arch, platform, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rm,
  rmdir,
} from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";

import {
  coordinatorFromRetrievalEvaluationDatabase,
  indexRetrievalGeneration,
} from "../src/retrieval/coordinator.ts";
import { detectSqliteLexicalCapability } from "../src/retrieval/sqlite-store.ts";
import { sealRetrievalEvaluationObservationReport } from "../src/retrieval/evaluation.ts";
import { retrievalCanonicalDigest, retrievalSha256, stableJson } from "../src/retrieval/digest.ts";
import { canonicalPath, canonicalPathContains, sameCanonicalPath } from "../src/retrieval/path-security.ts";
import {
  PERFORMANCE_CONFIGURATION_DIGEST,
  PERFORMANCE_EVALUATION_DIGEST,
  PERFORMANCE_FIXTURE_DIGEST,
  PERFORMANCE_GENERATOR_VERSION,
  PERFORMANCE_POLICY_DIGEST,
  PERFORMANCE_SAMPLE_PLAN_DIGEST,
  PERFORMANCE_SAMPLE_PLAN_VERSION,
  PERFORMANCE_VAULT_ID,
  buildPerformanceCorpus,
  expectedPerformanceCoordinates,
  indexRequestSequenceDigest,
  performanceFixtureMaterial,
  performanceQueryCycle,
  performanceSamplePlan,
  queryAttemptSetDigest,
  resultSetDigest,
  sampleVectorDigest,
} from "./generate-retrieval-observation-fixture.mjs";

const OBSERVATION_RECEIPT_VERSION = "gkos-retrieval-evaluation-phase4-observation-receipt/1.0.0";
const CLI_RECEIPT_VERSION = "gkos-retrieval-evaluation-phase4-qualification/1.0.0";
const CLI_SAMPLE_PLAN_VERSION = "gkos-retrieval-evaluation-phase4-qualification-sample-plan/1.0.0";
const CLI_SAMPLE_PLAN_DIGEST = "sha256:b37749ee2302fa5086769aa81234f89a4b180e7f2569a18d19c86178da8fb83d";
const PACK_MANIFEST_DIGEST = "sha256:6732519a4912714a432680c88219322c80413e4165b5e3f613f23e82cd7ee340";
const SLICE_A_PACK_COMMIT = "cac029a5b570135b26f3585bc86f4c9beb00c36d";
const PHASE3_BASE_COMMIT = "5396d46d";
const SLICE_B_EVIDENCE_COMMIT = "ed3a7552b1d4a705c1b1a722b07255e89ec42186";
const SLICE_B_PROTECTED_PATH_COUNT = 112;
const SLICE_B_PROTECTED_PATH_INVENTORY_DIGEST = "sha256:f88846fdaf91e59f3e80780b787340b82e5a7177c474518aa901f63046c9478f";
const SLICE_B_AUTHORIZED_ADDITION_PATHS = Object.freeze(["src/watcher/contracts.ts"]);
const SLICE_B_AUTHORIZED_ADDITION_INVENTORY_DIGEST = "sha256:d24887eb649f993deda0de31059a879de629906769bc1f4387302e13a662fe1b";
const SCAN_PRESENTATION_VERSION = "gkos-retrieval-evaluation-scan-presentation/1.0.0-draft.1";
const QUERY_REQUEST_SEQUENCE_VERSION = "gkos-retrieval-evaluation-performance-query-request-sequence/1.0.0";
const OBSERVATION_RUNNER_PATH = "scripts/run-retrieval-observation-qualification.mjs";
const OBSERVATION_PLAN_FILE = "performance-sample-plan.json";
const OBSERVATION_RECEIPT_FILE = "observation-receipt.json";
const OBSERVATION_REPORT_FILE = "observation-report.json";
const CLI_RECEIPT_FILE = "gkos-phase4-retrieval-qualification.json";
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const require = createRequire(import.meta.url);

const CLI_FAILURE_CODES = new Set([
  "QUAL_PACK_INVALID", "QUAL_CLI_FIXTURE_INVALID", "QUAL_ENVIRONMENT_INVALID",
  "QUAL_CLI_PROCESS_FAILED", "QUAL_CLI_TAP_INVALID", "QUAL_CLI_TEST_TOTAL_INVALID",
  "QUAL_TEMPORAL_TEST_MISSING", "QUAL_TUNE_TEST_MISSING", "QUAL_EVAL_BUDGET_EXCEEDED",
  "QUAL_TUNE_BUDGET_EXCEEDED", "QUAL_CLI_WALL_BUDGET_EXCEEDED",
  "QUAL_WINDOWS_PROCESS_FAILED", "QUAL_WINDOWS_TAP_INVALID", "QUAL_WINDOWS_TEST_TOTAL_INVALID",
  "QUAL_WINDOWS_WALL_BUDGET_EXCEEDED",
]);

const OBSERVATION_FAILURE_CODES = new Set([
  "OBS_SOURCE_PROVENANCE_INVALID", "OBS_PACK_IMMUTABILITY_INVALID", "OBS_FTS5_UNAVAILABLE",
  "OBS_FIXTURE_INVALID", "OBS_INDEX_FAILED", "OBS_INDEX_PROVIDER_LEDGER_INVALID",
  "OBS_UPDATE_FAILED", "OBS_UPDATE_REUSE_INVALID", "OBS_QUERY_FAILED", "OBS_QUERY_SAMPLE_INVALID",
  "OBS_QUERY_P95_EXCEEDED", "OBS_REBUILD_FAILED", "OBS_CONVERGENCE_INVALID",
  "OBS_NETWORK_ATTEMPTED", "OBS_REPORT_INVALID",
]);

const CLI_SAMPLE_PLAN = Object.freeze({
  contract_version: CLI_SAMPLE_PLAN_VERSION,
  warmup_count: 0,
  sample_count: 1,
  test_concurrency: 1,
  cli_test_files: ["test/retrieval-evaluation-cli.test.mjs"],
  cli_expected_test_count: 23,
  eval_test_name: "actual coordinator eval replay emits exact text and pretty canonical JSON offline",
  tune_test_name: "actual exhaustive tune replay publishes one durable exact candidate and no sidecars",
  windows_security_test_files: [
    "test/retrieval-windows-path-security.test.mjs",
    "test/retrieval-config.test.mjs",
    "test/retrieval-store.test.mjs",
  ],
  windows_security_expected_test_count: 49,
  thresholds_micros: {
    eval_test: 90_000_000,
    tune_test: 300_000_000,
    cli_wall: 600_000_000,
    windows_security_wall: 180_000_000,
  },
  sample_plan_digest: CLI_SAMPLE_PLAN_DIGEST,
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function assertExact(actual, expected, code) {
  if (stableJson(actual) !== stableJson(expected)) fail(code);
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function prettyCanonical(value) {
  return `${JSON.stringify(JSON.parse(stableJson(value)), null, 2)}\n`;
}

function elapsedMicros(start) {
  const delta = process.hrtime.bigint() - start;
  const value = (delta + 999n) / 1_000n;
  if (value < 0n || value > BigInt(MAX_SAFE)) fail("GKX_EVAL_OBSERVATION_TIMER_INVALID");
  return Number(value);
}

export function decimalMillisToCeilMicrosForTest(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)) {
    fail("GKX_EVAL_QUALIFICATION_DURATION_INVALID");
  }
  const [whole, fraction = ""] = value.split(".");
  const wholeMicros = BigInt(whole) * 1_000n;
  let fractionMicros = 0n;
  if (fraction !== "") {
    const numerator = BigInt(fraction) * 1_000n;
    const denominator = 10n ** BigInt(fraction.length);
    fractionMicros = (numerator + denominator - 1n) / denominator;
  }
  const result = wholeMicros + fractionMicros;
  if (result > BigInt(MAX_SAFE)) fail("GKX_EVAL_QUALIFICATION_DURATION_INVALID");
  return Number(result);
}

function sortedFailureCodes(codes, allowed) {
  const values = [...new Set(codes)];
  if (values.some((code) => !allowed.has(code))) fail("GKX_EVAL_QUALIFICATION_FAILURE_CODE_INVALID");
  return values.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function observationSamplePlanReceipt() {
  return Object.freeze({
    contract_version: PERFORMANCE_SAMPLE_PLAN_VERSION,
    sample_plan_digest: PERFORMANCE_SAMPLE_PLAN_DIGEST,
    warmup_count: 10,
    sample_count: 50,
    p95_strict_upper_bound_micros: 500_000,
  });
}

export function buildObservationReceiptForTest(value) {
  const failureCodes = sortedFailureCodes(value.failure_codes, OBSERVATION_FAILURE_CODES);
  const status = failureCodes.length === 0 ? "pass" : "fail";
  if (status === "pass" && [value.fixture, value.environment, value.indexing, value.query_latency,
    value.convergence, value.observation_report].some((child) => child === null)) {
    fail("GKX_EVAL_OBSERVATION_RECEIPT_NULLABILITY_INVALID");
  }
  if (status === "fail" && (value.publication_eligible !== false || value.observation_report !== null)) {
    fail("GKX_EVAL_OBSERVATION_RECEIPT_NULLABILITY_INVALID");
  }
  const material = {
    contract_version: OBSERVATION_RECEIPT_VERSION,
    status,
    failure_codes: failureCodes,
    publication_eligible: value.publication_eligible,
    source: value.source,
    sample_plan: observationSamplePlanReceipt(),
    fixture: value.fixture,
    environment: value.environment,
    indexing: value.indexing,
    query_latency: value.query_latency,
    convergence: value.convergence,
    observation_report: value.observation_report,
  };
  return Object.freeze({ ...material, receipt_digest: retrievalCanonicalDigest(material) });
}

function parseArgs(argv) {
  const parsed = { mode: null, artifact_root: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--mode" && index + 1 < argv.length) parsed.mode = argv[++index];
    else if (token === "--artifact-root" && index + 1 < argv.length) parsed.artifact_root = argv[++index];
    else fail("GKX_EVAL_QUALIFICATION_ARGUMENTS_INVALID");
  }
  if (!["observation", "cli", "windows-security", "immutability", "offline-self-test", "plan"].includes(parsed.mode)) {
    fail("GKX_EVAL_QUALIFICATION_ARGUMENTS_INVALID");
  }
  if (["observation", "cli", "windows-security"].includes(parsed.mode) && !parsed.artifact_root) {
    fail("GKX_EVAL_QUALIFICATION_ARGUMENTS_INVALID");
  }
  return parsed;
}

function git(repoRoot, args, optional = false) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", optional ? "ignore" : "pipe"] }).trim();
  } catch (error) {
    if (optional) return null;
    throw error;
  }
}

const LOWERCASE_COMMIT_RE = /^[0-9a-f]{40}$/u;

export function resolveSourceHeadCommitForTest(checkoutCommit, suppliedSourceHeadCommit) {
  if (typeof checkoutCommit !== "string" || !LOWERCASE_COMMIT_RE.test(checkoutCommit)) {
    fail("GKX_EVAL_SOURCE_COMMIT_INVALID");
  }
  const sourceHeadCommit = suppliedSourceHeadCommit === undefined ? checkoutCommit : suppliedSourceHeadCommit;
  if (typeof sourceHeadCommit !== "string" || !LOWERCASE_COMMIT_RE.test(sourceHeadCommit)) {
    fail("GKX_EVAL_SOURCE_COMMIT_INVALID");
  }
  return sourceHeadCommit;
}

async function sourceState(repoRoot) {
  const checkoutCommit = git(repoRoot, ["rev-parse", "HEAD"]);
  const status = git(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const runnerBytes = await readFile(join(repoRoot, OBSERVATION_RUNNER_PATH));
  const runnerFileSha256 = sha256Bytes(runnerBytes);
  const committedObject = git(repoRoot, ["rev-parse", `HEAD:${OBSERVATION_RUNNER_PATH}`], true);
  let runnerCommittedBlobSha256 = null;
  let committedAtCheckout = false;
  if (committedObject !== null) {
    const committedBytes = execFileSync("git", ["show", `HEAD:${OBSERVATION_RUNNER_PATH}`], { cwd: repoRoot });
    runnerCommittedBlobSha256 = sha256Bytes(committedBytes);
    committedAtCheckout = Buffer.compare(runnerBytes, committedBytes) === 0;
  }
  const sourceHeadCommit = resolveSourceHeadCommitForTest(
    checkoutCommit,
    process.env.GKOS_PHASE4_SOURCE_HEAD_COMMIT,
  );
  const eventCommit = process.env.GITHUB_SHA ?? checkoutCommit;
  if (!LOWERCASE_COMMIT_RE.test(eventCommit)) fail("GKX_EVAL_SOURCE_COMMIT_INVALID");
  const worktreeClean = status === "";
  const executionProvenance = worktreeClean && committedAtCheckout ? "committed_clean" : "local_uncommitted";
  return Object.freeze({
    checkoutCommit,
    sourceHeadCommit,
    eventCommit,
    runnerFileSha256,
    runnerCommittedBlobSha256,
    committedAtCheckout,
    worktreeClean,
    executionProvenance,
  });
}

function eventName(allowed) {
  const value = process.env.GITHUB_ACTIONS === "true" ? process.env.GITHUB_EVENT_NAME : "local";
  if (typeof value !== "string" || !allowed.has(value)) fail("GKX_EVAL_SOURCE_EVENT_INVALID");
  return value;
}

async function qualificationSourceReceipt(repoRoot) {
  const state = await sourceState(repoRoot);
  return Object.freeze({
    checkout_commit: state.checkoutCommit,
    source_head_commit: state.sourceHeadCommit,
    event_commit: state.eventCommit,
    event_name: eventName(new Set(["local", "push", "pull_request", "workflow_dispatch"])),
    phase4_slice_b_evidence_commit: SLICE_B_EVIDENCE_COMMIT,
  });
}

async function observationSourceReceipt(repoRoot) {
  const state = await sourceState(repoRoot);
  return Object.freeze({
    checkout_commit: state.checkoutCommit,
    source_head_commit: state.sourceHeadCommit,
    event_commit: state.eventCommit,
    event_name: eventName(new Set(["local", "schedule", "workflow_dispatch"])),
    runner_file_sha256: state.runnerFileSha256,
    runner_committed_blob_sha256: state.runnerCommittedBlobSha256,
    runner_committed_at_checkout: state.committedAtCheckout,
    worktree_clean: state.worktreeClean,
    execution_provenance: state.executionProvenance,
  });
}

export function publicationEligibleForTest(source) {
  return process.env.GITHUB_ACTIONS === "true" &&
    ["schedule", "workflow_dispatch"].includes(source.event_name) &&
    source.execution_provenance === "committed_clean" && source.worktree_clean && source.runner_committed_at_checkout &&
    source.runner_committed_blob_sha256 === source.runner_file_sha256 &&
    source.checkout_commit === source.source_head_commit && source.source_head_commit === source.event_commit;
}

function gitDiffClean(repoRoot, commit, paths) {
  try {
    execFileSync("git", ["diff", "--quiet", "--no-renames", commit, "--", ...paths], { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch { return false; }
}

function splitLines(value) {
  return value === "" ? [] : value.split(/\r?\n/u).filter((row) => row !== "");
}

function codeUnitSortedUniquePaths(paths) {
  const sorted = [...paths].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (sorted.some((path, index) => path === "" || path.includes("\0") || (index > 0 && path === sorted[index - 1]))) {
    fail("GKX_EVAL_QUALIFICATION_IMMUTABILITY_INVALID");
  }
  return sorted;
}

function gitNulPathInventory(repoRoot, args) {
  let bytes;
  try {
    bytes = execFileSync("git", args, { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    fail("GKX_EVAL_QUALIFICATION_IMMUTABILITY_INVALID");
  }
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes) || (text !== "" && !text.endsWith("\0"))) {
    fail("GKX_EVAL_QUALIFICATION_IMMUTABILITY_INVALID");
  }
  return codeUnitSortedUniquePaths(text === "" ? [] : text.slice(0, -1).split("\0"));
}

function pathInventoryDigest(paths) {
  return sha256Bytes(Buffer.from(`${paths.join("\n")}\n`, "utf8"));
}

export function verifySliceBProtectedInputsForTest(repoRoot) {
  const protectedRoots = ["src", "bin"];
  const explicitProtectedPaths = [
    "package.json", "package-lock.json",
    "test/retrieval-evaluation-cli.test.mjs", "test/fixtures/retrieval-evaluation-cli-phase4.json",
  ];
  const baselineRootPaths = gitNulPathInventory(repoRoot, [
    "ls-tree", "-r", "--name-only", "-z", SLICE_B_EVIDENCE_COMMIT, "--", ...protectedRoots,
  ]);
  const baselineProtectedPaths = codeUnitSortedUniquePaths([...baselineRootPaths, ...explicitProtectedPaths]);
  const currentRootPaths = gitNulPathInventory(repoRoot, ["ls-files", "-z", "--", ...protectedRoots]);
  const baselineRootSet = new Set(baselineRootPaths);
  const currentRootSet = new Set(currentRootPaths);
  const authorizedAdditions = currentRootPaths.filter((path) => !baselineRootSet.has(path));
  if (baselineProtectedPaths.length !== SLICE_B_PROTECTED_PATH_COUNT ||
      pathInventoryDigest(baselineProtectedPaths) !== SLICE_B_PROTECTED_PATH_INVENTORY_DIGEST ||
      baselineRootPaths.some((path) => !currentRootSet.has(path)) ||
      authorizedAdditions.length !== SLICE_B_AUTHORIZED_ADDITION_PATHS.length ||
      authorizedAdditions.some((path, index) => path !== SLICE_B_AUTHORIZED_ADDITION_PATHS[index]) ||
      pathInventoryDigest(authorizedAdditions) !== SLICE_B_AUTHORIZED_ADDITION_INVENTORY_DIGEST ||
      !gitDiffClean(repoRoot, SLICE_B_EVIDENCE_COMMIT, baselineProtectedPaths)) {
    fail("GKX_EVAL_QUALIFICATION_IMMUTABILITY_INVALID");
  }
}

export async function verifyFrozenQualificationInputsForTest(repoRoot) {
  const packRoot = "contracts/retrieval/gkos-retrieval-evaluation-1.0.0-draft.1";
  const phase03 = [
    "contracts/ingest/gkos-ingest-validation-1.0.0-draft.1",
    "contracts/retrieval/gkos-retrieval-1.0.0-draft.1",
    "contracts/retrieval/gkos-retrieval-1.0.0-draft.2",
    "evidence/2026-08-20-functional-uplift-phase-0.md",
    "evidence/2026-08-21-functional-uplift-phase-1.md",
    "evidence/2026-08-21-functional-uplift-phase-2.md",
    "evidence/2026-08-21-functional-uplift-phase-3.md",
  ];
  verifySliceBProtectedInputsForTest(repoRoot);
  if (!gitDiffClean(repoRoot, SLICE_A_PACK_COMMIT, [packRoot]) ||
      !gitDiffClean(repoRoot, PHASE3_BASE_COMMIT, phase03)) {
    fail("GKX_EVAL_QUALIFICATION_IMMUTABILITY_INVALID");
  }
  const packFiles = splitLines(git(repoRoot, ["ls-files", packRoot]));
  const packUntracked = splitLines(git(repoRoot, ["ls-files", "--others", "--exclude-standard", "--", packRoot]));
  let packBytes = 0;
  for (const path of packFiles) packBytes += (await readFile(join(repoRoot, path))).length;
  if (packFiles.length !== 37 || packBytes !== 4_948_463 || packUntracked.length !== 0) {
    fail("GKX_EVAL_QUALIFICATION_PACK_INVALID");
  }

  const cliFixtureBytes = await readFile(join(repoRoot, "test/fixtures/retrieval-evaluation-cli-phase4.json"));
  const cliFixture = JSON.parse(cliFixtureBytes.toString("utf8"));
  if (cliFixtureBytes.length !== 23_770 ||
      sha256Bytes(cliFixtureBytes) !== "sha256:fce5308d252d9e693244250543f6642af1cc4a7ef9404ac604313f6f37f107be" ||
      cliFixture.fixture_digest !== "sha256:958c06ed5b2d063e6b9530261ed74fd17bba5e599d6326aafe5bc7f1ac6c0ff6") {
    fail("GKX_EVAL_QUALIFICATION_CLI_FIXTURE_INVALID");
  }
  const conformance = JSON.parse((await readFile(join(repoRoot, packRoot, "conformance-fixture.json"))).toString("utf8"));
  const reviewed = JSON.parse((await readFile(join(repoRoot, packRoot, "reviewed-bundle.json"))).toString("utf8"));
  const expected = {
    normalized_golden_digest: "sha256:f3de2536a3a6496aff6b4d6e7afca522cfd5e5b28b7b907a9b9e4d39ac1c8a9f",
    source_corpus_digest: "sha256:1d99bb7d9c2522d71f7c2e2633517753098be6f2698586b248f18d99affc285d",
    fixture_catalog_digest: "sha256:45addb4ab8b9634ffd22f2df099bc027a007130c11f109cb03c4e04ca38b5e16",
    fixed_provider_digest: "sha256:7c28de4be4ad24a116d4f07d9b86ea9b38ab3298700ee1563f3b861026dd5b41",
    environment_set_digest: "sha256:8269ad9e34b9704eaa724de4628d5667cb9ba4483ad08117a7a7549e202800c1",
    baseline_digest: "sha256:0e46a9a83c55563ca33c41e98257455aca0c62ac46adb7b9b35c1abf6f3b9126",
    metric_computation_fixture_digest: "sha256:6ea3a6b44d50efe60c2215a6bb30db60a5c29133474ddb0458c5ac4517c35e36",
    projection_manifest_set_digest: "sha256:e7285d07af3027c290151f864b8e46e3b468bc89017b67b74af77970f621dea9",
    result_origin_set_digest: "sha256:a5d357a9c236c37b86d79f099968724a5dc836db831d5506a1dda07c2877680c",
    reviewed_bundle_digest: "sha256:2a49075651e2a4b19e813e59a3d4546cc602f0e86c56d1e048f94d917cd6df2a",
  };
  for (const [key, value] of Object.entries(expected)) {
    const observed = key === "normalized_golden_digest" ? conformance.golden?.expected_normalized?.golden_digest : reviewed[key];
    if (observed !== value) fail("GKX_EVAL_QUALIFICATION_PACK_INVALID");
  }
  return Object.freeze({
    phase4_pack_file_count: 37,
    phase4_pack_total_bytes: 4_948_463,
    phase4_pack_manifest_digest: PACK_MANIFEST_DIGEST,
    cli_fixture_byte_size: 23_770,
    cli_fixture_raw_sha256: "sha256:fce5308d252d9e693244250543f6642af1cc4a7ef9404ac604313f6f37f107be",
    cli_fixture_digest: "sha256:958c06ed5b2d063e6b9530261ed74fd17bba5e599d6326aafe5bc7f1ac6c0ff6",
    normalized_golden_digest: expected.normalized_golden_digest,
    source_corpus_digest: expected.source_corpus_digest,
    fixture_catalog_digest: expected.fixture_catalog_digest,
    fixed_provider_digest: expected.fixed_provider_digest,
    environment_set_digest: expected.environment_set_digest,
    baseline_digest: expected.baseline_digest,
    metric_fixture_digest: expected.metric_computation_fixture_digest,
    projection_manifest_set_digest: expected.projection_manifest_set_digest,
    result_origin_set_digest: expected.result_origin_set_digest,
    reviewed_bundle_digest: expected.reviewed_bundle_digest,
  });
}

function qualificationEnvironment() {
  const capability = detectSqliteLexicalCapability();
  const os = normalizedPlatform();
  const architecture = arch();
  if (!(["linux", "windows", "darwin"].includes(os)) || !(["x64", "arm64"].includes(architecture))) {
    fail("GKX_EVAL_QUALIFICATION_ENVIRONMENT_INVALID");
  }
  return Object.freeze({
    runner_class: process.env.GITHUB_ACTIONS === "true" ? "github_hosted" : "local",
    runtime: "node",
    runtime_version: process.versions.node,
    os,
    arch: architecture,
    sqlite_version: capability.sqlite_version,
    physical_fts5_available: capability.fts5_available,
    scan_presentation_contract_version: SCAN_PRESENTATION_VERSION,
    scan_presentation_fts5_available: true,
  });
}

function posixMode(state) {
  return Number(state.mode & 0o7777n);
}

function sameDevice(left, right) {
  return left === right || process.platform === "win32" && (left === 0n || right === 0n);
}

function directoryIdentity(path, state) {
  return Object.freeze({
    canonical_path: path,
    device: state.dev,
    inode: state.ino,
    owner: state.uid,
    mode: state.mode,
    link_count: state.nlink,
  });
}

function sameDirectoryIdentity(expected, state) {
  return state.isDirectory() && !state.isSymbolicLink() && sameDevice(expected.device, state.dev) &&
    expected.inode === state.ino && expected.owner === state.uid && expected.mode === state.mode;
}

async function sealPrivateDirectory(path, code) {
  const canonical = await canonicalPath(path, { alias_error: code });
  const state = await lstat(canonical, { bigint: true });
  if (!state.isDirectory() || state.isSymbolicLink()) fail(code);
  if (process.platform !== "win32") {
    const euid = typeof process.geteuid === "function" ? BigInt(process.geteuid()) : -1n;
    if (state.uid !== euid || posixMode(state) !== 0o700) fail(code);
  }
  return directoryIdentity(canonical, state);
}

async function revalidateDirectory(identity, parent = null, code = "GKX_EVAL_OBSERVATION_TEMP_CAPABILITY_CHANGED") {
  const canonical = await canonicalPath(identity.canonical_path, { alias_error: code });
  const state = await lstat(identity.canonical_path, { bigint: true });
  if (!sameCanonicalPath(canonical, identity.canonical_path) || !sameDirectoryIdentity(identity, state)) fail(code);
  if (parent && (!canonicalPathContains(parent.canonical_path, canonical) || dirname(canonical) !== parent.canonical_path)) fail(code);
}

async function observationArtifactRoot(path) {
  const identity = await sealPrivateDirectory(resolve(path), "GKX_EVAL_OBSERVATION_ARTIFACT_ROOT_INVALID");
  return Object.freeze({
    identity,
    async write(name, value) {
      await revalidateDirectory(identity, null, "GKX_EVAL_OBSERVATION_ARTIFACT_ROOT_CHANGED");
      if (basename(name) !== name || !/^(?:performance-sample-plan|observation-(?:receipt|report)|gkos-phase4-retrieval-qualification)\.json$/u.test(name)) {
        fail("GKX_EVAL_OBSERVATION_ARTIFACT_NAME_INVALID");
      }
      const path = join(identity.canonical_path, name);
      const bytes = Buffer.from(prettyCanonical(value), "utf8");
      const handle = await open(path, "wx", 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      if (process.platform !== "win32") await chmod(path, 0o600);
      const state = await lstat(path, { bigint: true });
      if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1n || BigInt(bytes.length) !== state.size ||
          process.platform !== "win32" && posixMode(state) !== 0o600) fail("GKX_EVAL_OBSERVATION_ARTIFACT_INVALID");
      const verified = await readFile(path);
      if (Buffer.compare(bytes, verified) !== 0) fail("GKX_EVAL_OBSERVATION_ARTIFACT_CHANGED");
      await revalidateDirectory(identity, null, "GKX_EVAL_OBSERVATION_ARTIFACT_ROOT_CHANGED");
    },
  });
}

async function validateTempParent() {
  const raw = tmpdir();
  const canonical = await canonicalPath(raw, { alias_error: "GKX_EVAL_OBSERVATION_TEMP_PARENT_INVALID" });
  const state = await lstat(canonical, { bigint: true });
  if (!state.isDirectory() || state.isSymbolicLink()) fail("GKX_EVAL_OBSERVATION_TEMP_PARENT_INVALID");
  if (process.platform !== "win32") {
    const euid = typeof process.geteuid === "function" ? BigInt(process.geteuid()) : -1n;
    const mode = posixMode(state);
    if (!((state.uid === euid && mode === 0o700) || (state.uid === 0n && mode === 0o1777))) {
      fail("GKX_EVAL_OBSERVATION_TEMP_PARENT_INVALID");
    }
  }
  return directoryIdentity(canonical, state);
}

export async function createObservationTempCapabilityForTest() {
  const parent = await validateTempParent();
  let taskPath = null;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = join(parent.canonical_path, `gkx-retrieval-observation-${randomBytes(16).toString("hex")}`);
    try { await mkdir(candidate, { mode: 0o700 }); taskPath = candidate; break; }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
  }
  if (taskPath === null) fail("GKX_EVAL_OBSERVATION_TEMP_CREATE_FAILED");
  if (process.platform !== "win32") await chmod(taskPath, 0o700);
  const task = await sealPrivateDirectory(taskPath, "GKX_EVAL_OBSERVATION_TEMP_CAPABILITY_INVALID");
  if (!canonicalPathContains(parent.canonical_path, task.canonical_path) || dirname(task.canonical_path) !== parent.canonical_path) {
    fail("GKX_EVAL_OBSERVATION_TEMP_CAPABILITY_INVALID");
  }
  const children = {};
  for (const name of ["incremental-state", "clean-rebuild-state"]) {
    const child = join(task.canonical_path, name);
    await mkdir(child, { mode: 0o700 });
    if (process.platform !== "win32") await chmod(child, 0o700);
    children[name] = await sealPrivateDirectory(child, "GKX_EVAL_OBSERVATION_TEMP_CAPABILITY_INVALID");
    await revalidateDirectory(children[name], task);
  }
  let cleaned = false;
  return Object.freeze({
    task_path: task.canonical_path,
    incremental_state: children["incremental-state"].canonical_path,
    clean_rebuild_state: children["clean-rebuild-state"].canonical_path,
    async revalidate() {
      if (cleaned) fail("GKX_EVAL_OBSERVATION_TEMP_CAPABILITY_CHANGED");
      await revalidateDirectory(parent);
      await revalidateDirectory(task, parent);
      await revalidateDirectory(children["incremental-state"], task);
      await revalidateDirectory(children["clean-rebuild-state"], task);
    },
    async cleanup() {
      if (cleaned) fail("GKX_EVAL_OBSERVATION_TEMP_CAPABILITY_CHANGED");
      await revalidateDirectory(parent);
      await revalidateDirectory(task, parent);
      await revalidateDirectory(children["incremental-state"], task);
      await revalidateDirectory(children["clean-rebuild-state"], task);
      for (const name of ["incremental-state", "clean-rebuild-state"]) {
        const child = children[name];
        await revalidateDirectory(task, parent);
        await revalidateDirectory(child, task);
        await rm(child.canonical_path, { recursive: true, force: false });
        await revalidateDirectory(task, parent);
      }
      await revalidateDirectory(task, parent);
      await rmdir(task.canonical_path);
      cleaned = true;
      await revalidateDirectory(parent);
    },
  });
}

function patchMethod(restores, object, key, replacement) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) return;
  Object.defineProperty(object, key, { ...descriptor, value: replacement });
  restores.push(() => Object.defineProperty(object, key, descriptor));
}

export function installOfflineGuardsForTest() {
  const counters = Object.seal({
    fetch: 0,
    http: 0,
    https: 0,
    http2: 0,
    net: 0,
    tls: 0,
    dns: 0,
    dgram: 0,
    websocket: 0,
    child_process: 0,
  });
  const restores = [];
  const deny = (family) => function deniedPrimitive() {
    counters[family] += 1;
    fail(`GKX_EVAL_OBSERVATION_OFFLINE_VIOLATION:${family}`);
  };
  const globals = [
    [globalThis, "fetch", "fetch"],
    [globalThis, "WebSocket", "websocket"],
  ];
  for (const [object, key, family] of globals) patchMethod(restores, object, key, deny(family));
  const http = require("node:http");
  const https = require("node:https");
  const http2 = require("node:http2");
  const net = require("node:net");
  const tls = require("node:tls");
  const dns = require("node:dns");
  const dgram = require("node:dgram");
  const childProcess = require("node:child_process");
  for (const key of ["request", "get"]) patchMethod(restores, http, key, deny("http"));
  for (const key of ["request", "get"]) patchMethod(restores, https, key, deny("https"));
  for (const key of ["connect", "createServer", "createSecureServer"]) patchMethod(restores, http2, key, deny("http2"));
  for (const key of ["connect", "createConnection", "createServer"]) patchMethod(restores, net, key, deny("net"));
  for (const key of ["connect", "createServer"]) patchMethod(restores, tls, key, deny("tls"));
  for (const key of ["lookup", "resolve", "reverse"]) patchMethod(restores, dns, key, deny("dns"));
  for (const key of ["lookup", "resolve", "reverse"]) patchMethod(restores, dns.promises, key, deny("dns"));
  patchMethod(restores, dgram, "createSocket", deny("dgram"));
  for (const key of ["exec", "execFile", "fork", "spawn", "execSync", "execFileSync", "spawnSync"]) {
    patchMethod(restores, childProcess, key, deny("child_process"));
  }
  let restored = false;
  return Object.freeze({
    counters,
    restore() {
      if (restored) fail("GKX_EVAL_OBSERVATION_OFFLINE_GUARD_INVALID");
      for (const invoke of restores.reverse()) invoke();
      restored = true;
    },
  });
}

export function exerciseOfflineGuardFamiliesForTest() {
  const guard = installOfflineGuardsForTest();
  try {
    const http = require("node:http");
    const https = require("node:https");
    const http2 = require("node:http2");
    const net = require("node:net");
    const tls = require("node:tls");
    const dns = require("node:dns");
    const dgram = require("node:dgram");
    const childProcess = require("node:child_process");
    const calls = [
      ["fetch", () => globalThis.fetch("http://127.0.0.1")],
      ["http", () => http.request("http://127.0.0.1")],
      ["https", () => https.request("https://127.0.0.1")],
      ["http2", () => http2.connect("https://127.0.0.1")],
      ["net", () => net.connect(1, "127.0.0.1")],
      ["tls", () => tls.connect(1, "127.0.0.1")],
      ["dns", () => dns.lookup("localhost", () => {})],
      ["dgram", () => dgram.createSocket("udp4")],
      ["websocket", () => new globalThis.WebSocket("ws://127.0.0.1")],
      ["child_process", () => childProcess.spawn(process.execPath, ["--version"])],
    ];
    for (const [family, invoke] of calls) {
      try { invoke(); fail("GKX_EVAL_OBSERVATION_OFFLINE_NEGATIVE_MISSED"); }
      catch (error) {
        if (error.message !== `GKX_EVAL_OBSERVATION_OFFLINE_VIOLATION:${family}`) throw error;
      }
    }
    for (const [family, count] of Object.entries(guard.counters)) if (count !== 1) fail(`GKX_EVAL_OBSERVATION_OFFLINE_NEGATIVE_COUNT_INVALID:${family}`);
    return { ...guard.counters };
  } finally { guard.restore(); }
}

class ConstantEmbeddingProvider {
  kind = "local_onnx";
  provider_id = "phase4-observation-local";
  model_id = "phase4-observation-constant-v1";
  dimensions = 4;
  timeout_ms = 30_000;
  #phase = null;
  #records = [];
  #offset = 0;
  #attempt = null;
  #externalCacheReadCount = 0;

  get external_cache_read_count() { return this.#externalCacheReadCount; }

  beginIndexPhase(phase) {
    if (this.#phase !== null || this.#attempt !== null) fail("GKX_EVAL_OBSERVATION_PROVIDER_STATE_INVALID");
    this.#phase = phase;
    this.#records = [];
    this.#offset = 0;
  }

  endIndexPhase() {
    if (this.#phase === null || this.#attempt !== null) fail("GKX_EVAL_OBSERVATION_PROVIDER_STATE_INVALID");
    const phase = this.#phase;
    const records = this.#records;
    this.#phase = null;
    this.#records = [];
    this.#offset = 0;
    return { phase, records };
  }

  beginQueryAttempt(attempt) {
    if (this.#phase !== null || this.#attempt !== null) fail("GKX_EVAL_OBSERVATION_PROVIDER_STATE_INVALID");
    this.#attempt = attempt;
  }

  endQueryAttempt() {
    if (this.#attempt === null) fail("GKX_EVAL_OBSERVATION_PROVIDER_STATE_INVALID");
    const attempt = this.#attempt;
    this.#attempt = null;
    return attempt;
  }

  async embed(texts, context = {}) {
    if (!Array.isArray(texts) || texts.length < 1 || typeof context.request_id !== "string") fail("GKX_EVAL_OBSERVATION_PROVIDER_REQUEST_INVALID");
    if (this.#phase !== null) {
      const inputDigests = texts.map((text) => retrievalSha256(text));
      const expectedId = retrievalSha256(`index\0${this.#offset}\0${inputDigests.join("\0")}`);
      if (context.request_id !== expectedId) fail("GKX_EVAL_OBSERVATION_INDEX_REQUEST_ID_INVALID");
      this.#records.push({
        call_ordinal: this.#records.length + 1,
        batch_offset: this.#offset,
        request_id: context.request_id,
        item_count: texts.length,
        input_content_digests: inputDigests,
      });
      this.#offset += texts.length;
    } else if (this.#attempt !== null) {
      if (texts.length !== 1 || context.request_id !== retrievalSha256(texts[0])) fail("GKX_EVAL_OBSERVATION_QUERY_REQUEST_ID_INVALID");
      this.#attempt.embedding_call_count += 1;
      this.#attempt.embedding_item_count += texts.length;
      this.#attempt.embedding_request_id = context.request_id;
    } else fail("GKX_EVAL_OBSERVATION_PROVIDER_STATE_INVALID");
    return texts.map(() => Float32Array.of(1, 0, 0, 0));
  }
}

function indexInput(stateDirectory, corpus) {
  return {
    state_directory: stateDirectory,
    vault_id: PERFORMANCE_VAULT_ID,
    source_snapshot_digest: corpus.source_snapshot_digest,
    configuration_digest: PERFORMANCE_CONFIGURATION_DIGEST,
    policy_digest: PERFORMANCE_POLICY_DIGEST,
    chunks: corpus.chunks,
    lexical_backend: "sqlite_fts5",
  };
}

async function runIndexPhase(provider, phase, stateDirectory, corpus, expected) {
  provider.beginIndexPhase(phase);
  const start = process.hrtime.bigint();
  const indexed = await indexRetrievalGeneration(indexInput(stateDirectory, corpus), provider);
  const durationMicros = elapsedMicros(start);
  const observed = provider.endIndexPhase();
  const callCount = observed.records.length;
  const itemCount = observed.records.reduce((sum, row) => sum + row.item_count, 0);
  const requestSequenceDigest = indexRequestSequenceDigest(phase, observed.records);
  if (callCount !== expected.provider_call_count || itemCount !== expected.provider_item_count ||
      requestSequenceDigest !== expected.index_request_sequence_digest ||
      indexed.generation.manifest.projection_id !== expected.expected_projection_id ||
      indexed.generation.manifest.projection_digest !== expected.expected_projection_digest ||
      indexed.vector_stage.kind !== "local_onnx" || indexed.vector_stage.state !== "active") {
    fail("GKX_EVAL_OBSERVATION_INDEX_RECEIPT_MISMATCH");
  }
  return Object.freeze({
    phase,
    duration_micros: durationMicros,
    provider_call_count: callCount,
    provider_item_count: itemCount,
    index_request_sequence_digest: requestSequenceDigest,
    projection_id: indexed.generation.manifest.projection_id,
    projection_digest: indexed.generation.manifest.projection_digest,
    manifest: indexed.generation.manifest,
    database_path: indexed.generation.database_path,
  });
}

function queryRequestSequenceDigest(phase, requestIds) {
  return retrievalCanonicalDigest({
    contract_version: QUERY_REQUEST_SEQUENCE_VERSION,
    phase,
    request_ids: requestIds,
  });
}

function stageExpectation() {
  return performanceSamplePlan().execution.incremental_query_work.result_stage_expectation;
}

function normalizedPlatform() {
  if (platform() === "win32") return "windows";
  if (platform() === "darwin") return "darwin";
  if (platform() === "linux") return "linux";
  fail("GKX_EVAL_OBSERVATION_PLATFORM_INVALID");
}

function createQueryObserver() {
  let attempt = null;
  return Object.freeze({
    begin(value) { if (attempt !== null) fail("GKX_EVAL_OBSERVATION_QUERY_OBSERVER_INVALID"); attempt = value; },
    end() { if (attempt === null) fail("GKX_EVAL_OBSERVATION_QUERY_OBSERVER_INVALID"); const value = attempt; attempt = null; return value; },
    sql_stage(kind) {
      if (attempt === null) fail("GKX_EVAL_OBSERVATION_QUERY_OBSERVER_INVALID");
      if (kind === "lexical") attempt.fts_query_stage_count += 1;
      else if (kind === "vector") attempt.vector_query_stage_count += 1;
      else fail("GKX_EVAL_OBSERVATION_QUERY_OBSERVER_INVALID");
    },
    ranking() { if (attempt === null) fail("GKX_EVAL_OBSERVATION_QUERY_OBSERVER_INVALID"); attempt.ranking_call_count += 1; },
    confidence() { if (attempt === null) fail("GKX_EVAL_OBSERVATION_QUERY_OBSERVER_INVALID"); attempt.confidence_call_count += 1; },
    citation() { if (attempt === null) fail("GKX_EVAL_OBSERVATION_QUERY_OBSERVER_INVALID"); attempt.citation_verification_count += 1; },
  });
}

export function observedQueryCacheHitCountForTest(embeddingCallCount) {
  if (!Number.isSafeInteger(embeddingCallCount) || embeddingCallCount < 0 || embeddingCallCount > 1) {
    fail("GKX_EVAL_OBSERVATION_QUERY_CACHE_LEDGER_INVALID");
  }
  return embeddingCallCount === 0 ? 1 : 0;
}

async function runQueryPhase(phase, databasePath, corpus, provider, repeatCount, measuredFromRound) {
  const queryCycle = performanceQueryCycle();
  const sources = new Map(corpus.sources.map((source) => [source.source_path, source.bytes]));
  const observer = createQueryObserver();
  const coordinator = coordinatorFromRetrievalEvaluationDatabase(databasePath, {
    discoverability_policy: () => "allow",
    vector_provider: provider,
    source_reader: async (path) => {
      const bytes = sources.get(path);
      if (!bytes) fail("GKX_EVAL_OBSERVATION_SOURCE_READ_INVALID");
      return new Uint8Array(bytes);
    },
    stale: false,
  }, observer, true);
  const attempts = [];
  try {
    for (let round = 1; round <= repeatCount; round += 1) {
      for (let queryIndex = 0; queryIndex < queryCycle.queries.length; queryIndex += 1) {
        const query = queryCycle.queries[queryIndex];
        const mutable = {
          embedding_call_count: 0,
          embedding_item_count: 0,
          embedding_request_id: null,
          fts_query_stage_count: 0,
          vector_query_stage_count: 0,
          ranking_call_count: 0,
          confidence_call_count: 0,
          citation_verification_count: 0,
          query_cache_hit_count: null,
        };
        provider.beginQueryAttempt(mutable);
        observer.begin(mutable);
        const measured = round >= measuredFromRound;
        const start = measured ? process.hrtime.bigint() : 0n;
        const result = await coordinator.search({ query: query.query_text, ...queryCycle.request });
        const latencyMicros = measured ? elapsedMicros(start) : null;
        mutable.query_cache_hit_count = observedQueryCacheHitCountForTest(mutable.embedding_call_count);
        const providerReceipt = provider.endQueryAttempt();
        const observerReceipt = observer.end();
        if (providerReceipt !== observerReceipt || mutable.embedding_call_count !== 1 || mutable.embedding_item_count !== 1 ||
            mutable.embedding_request_id !== query.request_id || mutable.fts_query_stage_count !== 1 ||
            mutable.vector_query_stage_count !== 1 || mutable.ranking_call_count !== 1 || mutable.confidence_call_count !== 1 ||
            mutable.query_cache_hit_count !== 0 ||
            result.contract_version !== "gkos-retrieval/1.0.0-draft.1") {
          fail("GKX_EVAL_OBSERVATION_QUERY_WORK_MISMATCH");
        }
        assertExact({ result_contract_version: result.contract_version, ...result.stages }, stageExpectation(), "GKX_EVAL_OBSERVATION_RESULT_STAGE_MISMATCH");
        attempts.push({
          attempt_ordinal: attempts.length + 1,
          round_ordinal: round,
          query_ordinal: queryIndex + 1,
          query_id: query.query_id,
          query_text_digest: retrievalSha256(query.query_text),
          embedding_request_id: mutable.embedding_request_id,
          embedding_item_count: mutable.embedding_item_count,
          fts_query_stage_count: mutable.fts_query_stage_count,
          reranker_call_count: 0,
          reranker_item_count: 0,
          query_cache_hit_count: mutable.query_cache_hit_count,
          result_digest: retrievalCanonicalDigest(result),
          result_stage_digest: retrievalCanonicalDigest({ contract_version: result.contract_version, stages: result.stages }),
          measured_latency_micros: latencyMicros,
        });
      }
    }
  } finally { coordinator.close(); }
  const expectedWork = phase === "incremental_observation"
    ? performanceSamplePlan().execution.incremental_query_work
    : performanceSamplePlan().execution.clean_rebuild_query_work;
  const requestIds = attempts.map((row) => row.embedding_request_id);
  const requestSequenceDigest = queryRequestSequenceDigest(phase, requestIds);
  if (attempts.length !== expectedWork.attempt_count || requestSequenceDigest !== expectedWork.request_id_sequence_digest ||
      attempts.reduce((sum, row) => sum + (row.embedding_request_id === null ? 0 : 1), 0) !== expectedWork.embedding_call_count ||
      attempts.reduce((sum, row) => sum + row.embedding_item_count, 0) !== expectedWork.embedding_item_count ||
      attempts.reduce((sum, row) => sum + row.fts_query_stage_count, 0) !== expectedWork.fts_query_stage_count ||
      attempts.reduce((sum, row) => sum + row.query_cache_hit_count, 0) !== expectedWork.query_cache_hit_count) {
    fail("GKX_EVAL_OBSERVATION_QUERY_LEDGER_MISMATCH");
  }
  return Object.freeze({
    phase,
    expected_query_work_digest: expectedWork.query_work_digest,
    attempt_count: attempts.length,
    embedding_call_count: attempts.reduce((sum, row) => sum + (row.embedding_request_id === null ? 0 : 1), 0),
    embedding_item_count: attempts.reduce((sum, row) => sum + row.embedding_item_count, 0),
    embedding_request_id_sequence_digest: requestSequenceDigest,
    fts_query_stage_count: attempts.reduce((sum, row) => sum + row.fts_query_stage_count, 0),
    reranker_call_count: 0,
    reranker_item_count: 0,
    query_cache_hit_count: attempts.reduce((sum, row) => sum + row.query_cache_hit_count, 0),
    result_stage_assertion_count: attempts.length,
    result_stage_mismatch_count: 0,
    attempt_set_digest: queryAttemptSetDigest(phase, attempts),
    attempts,
  });
}

function nearestRank(samples, index) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[index];
}

function resultRows(ledger, firstAttemptOrdinal) {
  const cycle = performanceQueryCycle();
  return ledger.attempts.slice(firstAttemptOrdinal - 1, firstAttemptOrdinal - 1 + cycle.queries.length).map((attempt, index) => ({
    query_id: cycle.queries[index].query_id,
    query_text: cycle.queries[index].query_text,
    result_digest: attempt.result_digest,
  }));
}

export function measuredRoundsIdenticalForTest(attempts) {
  const byQuery = new Map();
  for (const attempt of attempts) {
    if (!byQuery.has(attempt.query_id)) byQuery.set(attempt.query_id, []);
    byQuery.get(attempt.query_id).push(attempt);
  }
  if (byQuery.size !== 10) return false;
  for (const rows of byQuery.values()) {
    rows.sort((left, right) => left.round_ordinal - right.round_ordinal);
    if (rows.length !== 6 || rows.some((row, index) => row.round_ordinal !== index + 1) ||
        rows.some((row) => row.result_digest !== rows[0].result_digest)) return false;
  }
  return true;
}

function throwObservation(code, error) {
  if (OBSERVATION_FAILURE_CODES.has(error?.message)) throw error;
  if (typeof error?.message === "string" && error.message.startsWith("GKX_EVAL_OBSERVATION_OFFLINE_VIOLATION:")) {
    fail("OBS_NETWORK_ATTEMPTED");
  }
  fail(code);
}

async function observationStage(code, operation) {
  try { return await operation(); }
  catch (error) { throwObservation(code, error); }
}

async function runObservation(repoRoot, artifactRoot, source) {
  try { await verifyFrozenQualificationInputsForTest(repoRoot); }
  catch (error) { throwObservation("OBS_PACK_IMMUTABILITY_INVALID", error); }
  if (normalizedPlatform() !== "linux" || arch() !== "x64") fail("OBS_REPORT_INVALID");
  const offline = installOfflineGuardsForTest();
  let temporary = null;
  let offlineRestored = false;
  try {
    let plan;
    try { plan = performanceSamplePlan(); }
    catch (error) { throwObservation("OBS_FIXTURE_INVALID", error); }
    await artifactRoot.write(OBSERVATION_PLAN_FILE, plan);
    const capability = detectSqliteLexicalCapability();
    if (!capability.fts5_available) fail("OBS_FTS5_UNAVAILABLE");
    temporary = await createObservationTempCapabilityForTest();
    let initial;
    let updated;
    try {
      initial = buildPerformanceCorpus(false);
      updated = buildPerformanceCorpus(true);
    } catch (error) { throwObservation("OBS_FIXTURE_INVALID", error); }
    await temporary.revalidate();
    const coordinates = expectedPerformanceCoordinates();
    const indexProvider = new ConstantEmbeddingProvider();
    const initialIndex = await observationStage("OBS_INDEX_FAILED", () =>
      runIndexPhase(indexProvider, "initial_index", temporary.incremental_state, initial, coordinates.index.initial));
    if (initialIndex.provider_call_count !== 313 || initialIndex.provider_item_count !== 10_000) {
      fail("OBS_INDEX_PROVIDER_LEDGER_INVALID");
    }
    const updateIndex = await observationStage("OBS_UPDATE_FAILED", () =>
      runIndexPhase(indexProvider, "incremental_update", temporary.incremental_state, updated, coordinates.index.incremental_update));
    if (updateIndex.provider_call_count !== 1 || updateIndex.provider_item_count !== 1) fail("OBS_UPDATE_REUSE_INVALID");
    const queryProvider = new ConstantEmbeddingProvider();
    const incrementalQueries = await observationStage("OBS_QUERY_FAILED", () =>
      runQueryPhase("incremental_observation", updateIndex.database_path, updated, queryProvider, 6, 2));
    const measuredRoundsIdentical = measuredRoundsIdenticalForTest(incrementalQueries.attempts);
    if (!measuredRoundsIdentical) fail("OBS_QUERY_SAMPLE_INVALID");
    const rebuildIndex = await observationStage("OBS_REBUILD_FAILED", () =>
      runIndexPhase(indexProvider, "clean_rebuild", temporary.clean_rebuild_state, updated, coordinates.index.clean_rebuild));
    const cleanQueries = await observationStage("OBS_QUERY_FAILED", () =>
      runQueryPhase("clean_rebuild_comparison", rebuildIndex.database_path, updated, queryProvider, 1, 2));
    const manifestEqual = stableJson(updateIndex.manifest) === stableJson(rebuildIndex.manifest);
    if (!manifestEqual) fail("OBS_CONVERGENCE_INVALID");
    const incrementalResults = resultRows(incrementalQueries, 51);
    const cleanResults = resultRows(cleanQueries, 1);
    if (stableJson(incrementalResults) !== stableJson(cleanResults)) fail("OBS_CONVERGENCE_INVALID");
    const incrementalResultSetDigest = resultSetDigest(incrementalResults);
    const cleanResultSetDigest = resultSetDigest(cleanResults);
    if (incrementalResultSetDigest !== cleanResultSetDigest) fail("OBS_CONVERGENCE_INVALID");
    const latencies = incrementalQueries.attempts.map((row) => row.measured_latency_micros).filter((value) => value !== null);
    if (latencies.length !== 50 || latencies.some((value) => !Number.isSafeInteger(value) || value < 0)) fail("OBS_QUERY_SAMPLE_INVALID");
    const p50 = nearestRank(latencies, 24);
    const p95 = nearestRank(latencies, 47);
    const p99 = nearestRank(latencies, 49);
    if (!(p95 < 500_000)) fail("OBS_QUERY_P95_EXCEEDED");
    const networkAttemptCount = Object.values(offline.counters).reduce((sum, count) => sum + count, 0);
    if (networkAttemptCount !== 0) fail("OBS_NETWORK_ATTEMPTED");
    const externalCacheReadCount = indexProvider.external_cache_read_count + queryProvider.external_cache_read_count;
    if (externalCacheReadCount !== 0 || incrementalQueries.query_cache_hit_count !== 0 || cleanQueries.query_cache_hit_count !== 0) {
      fail("OBS_QUERY_SAMPLE_INVALID");
    }
    await observationStage("OBS_REPORT_INVALID", () => temporary.cleanup());
    temporary = null;
    offline.restore();
    offlineRestored = true;
    const environment = {
      runtime: "node",
      runtime_version: process.versions.node,
      os: "linux",
      arch: "x64",
      sqlite_version: capability.sqlite_version,
      lexical_backend: "sqlite_fts5",
      fts5_available: true,
      runner_class: process.env.GITHUB_ACTIONS === "true" ? "github_hosted" : "local",
    };
    const reportMaterial = {
      contract_version: "gkos-retrieval-evaluation-observation/1.0.0-draft.1",
      evaluation_digest: PERFORMANCE_EVALUATION_DIGEST,
      fixed_sample_plan_digest: PERFORMANCE_SAMPLE_PLAN_DIGEST,
      environment,
      warmup_count: 10,
      sample_count: 50,
      query_latency_micros: { p50, p95, p99 },
      index_time_micros: initialIndex.duration_micros,
      update_time_micros: updateIndex.duration_micros,
      chunks_reprocessed: 1,
      chunks_reused: 9_999,
    };
    let observationReport;
    try {
      observationReport = sealRetrievalEvaluationObservationReport({
        ...reportMaterial,
        observation_digest: retrievalCanonicalDigest(reportMaterial),
      });
    } catch (error) { throwObservation("OBS_REPORT_INVALID", error); }
    const reportBytes = Buffer.from(prettyCanonical(observationReport), "utf8");
    const incrementalQueryWork = { ...incrementalQueries };
    const cleanQueryWork = { ...cleanQueries };
    delete incrementalQueryWork.attempts;
    delete cleanQueryWork.attempts;
    const receipt = buildObservationReceiptForTest({
      failure_codes: [],
      publication_eligible: publicationEligibleForTest(source),
      source,
      fixture: {
        fixture_digest: PERFORMANCE_FIXTURE_DIGEST,
        source_count: 1_000,
        sections_per_source: 10,
        chunk_count: 10_000,
        mutation: {
          global_chunk_ordinal: 5_555,
          source_ordinal: 555,
          section_ordinal: 5,
          from: "revisionalpha",
          to: "revisionomega",
        },
        changed_content_digest_count: 1,
        changed_source_chunk_record_count: 10,
        initial_source_snapshot_digest: initial.source_snapshot_digest,
        updated_source_snapshot_digest: updated.source_snapshot_digest,
        initial_chunk_set_digest: initial.chunk_set_digest,
        updated_chunk_set_digest: updated.chunk_set_digest,
      },
      environment,
      indexing: {
        index_time_micros: initialIndex.duration_micros,
        update_time_micros: updateIndex.duration_micros,
        network_attempt_count: networkAttemptCount,
        external_cache_read_count: externalCacheReadCount,
        initial: {
          index_request_sequence_digest: initialIndex.index_request_sequence_digest,
          provider_call_count: initialIndex.provider_call_count,
          provider_item_count: initialIndex.provider_item_count,
          projection_digest: initialIndex.projection_digest,
        },
        incremental_update: {
          index_request_sequence_digest: updateIndex.index_request_sequence_digest,
          provider_call_count: updateIndex.provider_call_count,
          provider_item_count: updateIndex.provider_item_count,
          projection_digest: updateIndex.projection_digest,
          chunks_reprocessed: 1,
          chunks_reused: 9_999,
        },
        clean_rebuild: {
          index_request_sequence_digest: rebuildIndex.index_request_sequence_digest,
          provider_call_count: rebuildIndex.provider_call_count,
          provider_item_count: rebuildIndex.provider_item_count,
          projection_digest: rebuildIndex.projection_digest,
        },
      },
      query_latency: {
        warmup_count: 10,
        sample_count: 50,
        samples_micros: latencies,
        sample_vector_digest: sampleVectorDigest(latencies),
        p50_micros: p50,
        p95_micros: p95,
        p99_micros: p99,
        p95_strict_upper_bound_micros: 500_000,
        incremental_query_work: incrementalQueryWork,
        clean_rebuild_query_work: cleanQueryWork,
      },
      convergence: {
        incremental_projection_digest: updateIndex.projection_digest,
        clean_rebuild_projection_digest: rebuildIndex.projection_digest,
        manifest_equal: manifestEqual,
        incremental_result_set_digest: incrementalResultSetDigest,
        clean_rebuild_result_set_digest: cleanResultSetDigest,
        result_set_equal: true,
        measured_rounds_identical: measuredRoundsIdentical,
      },
      observation_report: {
        observation_digest: observationReport.observation_digest,
        byte_size: reportBytes.length,
        raw_sha256: sha256Bytes(reportBytes),
      },
    });
    await artifactRoot.write(OBSERVATION_RECEIPT_FILE, receipt);
    await artifactRoot.write(OBSERVATION_REPORT_FILE, observationReport);
    return receipt;
  } finally {
    if (temporary !== null) {
      try { await temporary.cleanup(); } catch { /* fail-retain on capability ambiguity */ }
    }
    if (!offlineRestored) {
      try { offline.restore(); } catch { /* retain the original failure */ }
    }
  }
}

export function qualificationSamplePlanForTest() {
  const preimage = { ...CLI_SAMPLE_PLAN };
  delete preimage.sample_plan_digest;
  if (retrievalCanonicalDigest(preimage) !== CLI_SAMPLE_PLAN_DIGEST) fail("GKX_EVAL_QUALIFICATION_SAMPLE_PLAN_INVALID");
  return structuredClone(CLI_SAMPLE_PLAN);
}

export function parseTapForTest(output, wallDurationMicros = 0) {
  if (typeof output !== "string" || !Number.isSafeInteger(wallDurationMicros) || wallDurationMicros < 0) {
    fail("GKX_EVAL_QUALIFICATION_TAP_INVALID");
  }
  const headings = [];
  const outcomes = [];
  const durations = new Map();
  const summaryValues = new Map();
  let reporterDurationMicros = null;
  let activeName = null;
  for (const line of output.split(/\r?\n/u)) {
    const heading = /^# Subtest: (.+)$/u.exec(line);
    if (heading) { activeName = heading[1]; headings.push(activeName); continue; }
    const duration = /^\s+duration_ms: ((?:0|[1-9][0-9]*)(?:\.[0-9]+)?)$/u.exec(line);
    if (duration && activeName !== null) {
      if (durations.has(activeName)) fail("GKX_EVAL_QUALIFICATION_TAP_INVALID");
      durations.set(activeName, decimalMillisToCeilMicrosForTest(duration[1]));
      activeName = null;
      continue;
    }
    const outcome = /^(ok|not ok) ([1-9][0-9]*) - (.+?)(?: #.*)?$/u.exec(line);
    if (outcome) {
      const ordinal = Number(outcome[2]);
      if (!Number.isSafeInteger(ordinal)) fail("GKX_EVAL_QUALIFICATION_TAP_INVALID");
      outcomes.push({ ok: outcome[1] === "ok", ordinal, name: outcome[3] });
    }
    const summary = /^# (tests|pass|fail|cancelled|skipped|todo) ([0-9]+)$/u.exec(line);
    if (summary) {
      if (summaryValues.has(summary[1])) fail("GKX_EVAL_QUALIFICATION_TAP_INVALID");
      const count = Number(summary[2]);
      if (!Number.isSafeInteger(count)) fail("GKX_EVAL_QUALIFICATION_TAP_INVALID");
      summaryValues.set(summary[1], count);
    }
    const reporter = /^# duration_ms ((?:0|[1-9][0-9]*)(?:\.[0-9]+)?)$/u.exec(line);
    if (reporter) {
      if (reporterDurationMicros !== null) fail("GKX_EVAL_QUALIFICATION_TAP_INVALID");
      reporterDurationMicros = decimalMillisToCeilMicrosForTest(reporter[1]);
    }
  }
  const uniqueNames = new Set(headings);
  if (headings.length === 0 || uniqueNames.size !== headings.length || outcomes.length !== headings.length ||
      reporterDurationMicros === null || [...["tests", "pass", "fail", "cancelled", "skipped", "todo"]]
        .some((key) => !summaryValues.has(key))) fail("GKX_EVAL_QUALIFICATION_TAP_INVALID");
  for (let index = 0; index < outcomes.length; index += 1) {
    if (outcomes[index].ordinal !== index + 1 || outcomes[index].name !== headings[index] || !durations.has(headings[index])) {
      fail("GKX_EVAL_QUALIFICATION_TAP_INVALID");
    }
  }
  const summary = Object.freeze({
    tests: summaryValues.get("tests"),
    pass: summaryValues.get("pass"),
    fail: summaryValues.get("fail"),
    cancelled: summaryValues.get("cancelled"),
    skipped: summaryValues.get("skipped"),
    todo: summaryValues.get("todo"),
    reporter_duration_micros: reporterDurationMicros,
    wall_duration_micros: wallDurationMicros,
  });
  if (summary.tests !== headings.length) fail("GKX_EVAL_QUALIFICATION_TAP_INVALID");
  return Object.freeze({ summary, headings, outcomes, durations });
}

function runNodeTest(repoRoot, files) {
  return new Promise((resolvePromise, rejectPromise) => {
    const started = process.hrtime.bigint();
    const child = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...files], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    let stdoutBytes = 0;
    let stdoutOverflow = false;
    let watchdogTriggered = false;
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= 8 * 1024 * 1024) stdout.push(chunk);
      else stdoutOverflow = true;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    const timer = setTimeout(() => { watchdogTriggered = true; child.kill("SIGTERM"); }, 660_000);
    child.once("error", (error) => { clearTimeout(timer); rejectPromise(error); });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      const delta = process.hrtime.bigint() - started;
      const wallDurationMicros = Number((delta + 999n) / 1_000n);
      resolvePromise({
        wall_duration_micros: wallDurationMicros,
        exit_code: code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stdout_overflow: stdoutOverflow,
        watchdog_triggered: watchdogTriggered,
      });
    });
  });
}

export function exactTestTotalsForTest(summary, expected) {
  return summary !== null && summary.tests === expected && summary.pass === expected && summary.fail === 0 &&
    summary.cancelled === 0 && summary.skipped === 0 && summary.todo === 0;
}

export function buildQualificationReceiptForTest(value) {
  const failureCodes = sortedFailureCodes(value.failure_codes, CLI_FAILURE_CODES);
  if (failureCodes.length === 0) {
    const commonPresent = value.source !== null && value.environment !== null && value.immutable_inputs !== null;
    const cliPresent = value.cli_test_summary !== null && value.temporal_noninterference !== null &&
      value.tune_qualification !== null && value.windows_security === null;
    const windowsPresent = value.cli_test_summary === null && value.temporal_noninterference === null &&
      value.tune_qualification === null && value.windows_security !== null;
    if (!commonPresent || cliPresent === windowsPresent) fail("GKX_EVAL_QUALIFICATION_RECEIPT_NULLABILITY_INVALID");
  }
  const material = {
    contract_version: CLI_RECEIPT_VERSION,
    status: failureCodes.length === 0 ? "pass" : "fail",
    failure_codes: failureCodes,
    source: value.source,
    environment: value.environment,
    immutable_inputs: value.immutable_inputs,
    sample_plan: qualificationSamplePlanForTest(),
    cli_test_summary: value.cli_test_summary,
    temporal_noninterference: value.temporal_noninterference,
    tune_qualification: value.tune_qualification,
    windows_security: value.windows_security,
  };
  return Object.freeze({ ...material, qualification_digest: retrievalCanonicalDigest(material) });
}

export function temporalObservationForTest(parsed) {
  const name = CLI_SAMPLE_PLAN.eval_test_name;
  const matches = parsed.headings.filter((value) => value === name);
  const outcome = parsed.outcomes.find((value) => value.name === name);
  const duration = parsed.durations.get(name);
  if (matches.length !== 1 || !outcome?.ok || duration === undefined) return null;
  return Object.freeze({
    test_name: name,
    duration_micros: duration,
    reviewed_query_count: 24,
    absent_pair_count: 1,
    pair_id: "temporal-future-present-absent",
    query_id: "temporal-future-exclusion",
    public_view_digest: "sha256:6912095efe8518662a93267c240b65d3eceb7e864229adf959ff87e8bdc9360e",
    query_metrics_digest: "sha256:0afc69cc15152680205788b6354c8fd34f15812af1ecca030deecd90fc69c510",
    query_counter_digest: "sha256:8d7f3b5575bc79396d4d13b3cd3ed161cfef2621adb430071181160e957f5759",
    pair_digest: "sha256:3939b4d906b0b358cb41cade641b9407e0e014b2288cfe275e79853e120e732e",
    comparison_digest: "sha256:44333a25dc9c40a10e09316a3da2183fd2cb28b19736f269d410727fe1f5f3ae",
  });
}

export function tuneObservationForTest(parsed) {
  const name = CLI_SAMPLE_PLAN.tune_test_name;
  const matches = parsed.headings.filter((value) => value === name);
  const outcome = parsed.outcomes.find((value) => value.name === name);
  const duration = parsed.durations.get(name);
  if (matches.length !== 1 || !outcome?.ok || duration === undefined) return null;
  return Object.freeze({
    test_name: name,
    duration_micros: duration,
    evaluated_candidate_count: 900,
    query_evaluation_count: 21_600,
    candidate_config_digest: "sha256:6d55a381e2fb74b87e0cfabe010ff168f155d7b12258c062fcc08372f1934050",
    candidate_evaluation_digest: "sha256:0af5053fccb84ae0a9eb3b785a3760e20438300dd49d512c6ab480bfe299e433",
    tune_selection_digest: "sha256:7dc97fbdfe7c0d489622f17f1b1e0ed7b629c5d562f05a5c9b35ed6dd7a2d0e4",
  });
}

async function runCliQualification(repoRoot, artifactRoot, windowsSecurity) {
  const source = await qualificationSourceReceipt(repoRoot);
  const codes = [];
  let immutableInputs = null;
  let environment = null;
  try { immutableInputs = await verifyFrozenQualificationInputsForTest(repoRoot); }
  catch (error) {
    codes.push(error?.message === "GKX_EVAL_QUALIFICATION_CLI_FIXTURE_INVALID" ? "QUAL_CLI_FIXTURE_INVALID" : "QUAL_PACK_INVALID");
  }
  try { environment = qualificationEnvironment(); }
  catch { codes.push("QUAL_ENVIRONMENT_INVALID"); }
  if (windowsSecurity && (process.env.GKOS_REQUIRE_ALIAS_FIXTURE !== "1" || process.env.GKOS_REQUIRE_SHORT_PATH_FIXTURE !== "1")) {
    codes.push("QUAL_ENVIRONMENT_INVALID");
  }

  const files = windowsSecurity ? CLI_SAMPLE_PLAN.windows_security_test_files : CLI_SAMPLE_PLAN.cli_test_files;
  let child = null;
  let parsed = null;
  if (codes.length === 0) {
    try { child = await runNodeTest(repoRoot, files); }
    catch { codes.push(windowsSecurity ? "QUAL_WINDOWS_PROCESS_FAILED" : "QUAL_CLI_PROCESS_FAILED"); }
    if (child !== null) {
      if (child.exit_code !== 0 || child.signal !== null || child.stdout_overflow || child.watchdog_triggered) {
        codes.push(windowsSecurity ? "QUAL_WINDOWS_PROCESS_FAILED" : "QUAL_CLI_PROCESS_FAILED");
      }
      try { parsed = parseTapForTest(child.stdout, child.wall_duration_micros); }
      catch { codes.push(windowsSecurity ? "QUAL_WINDOWS_TAP_INVALID" : "QUAL_CLI_TAP_INVALID"); }
    }
  }

  let cliSummary = null;
  let temporal = null;
  let tune = null;
  let windows = null;
  if (parsed !== null) {
    if (windowsSecurity) {
      if (!exactTestTotalsForTest(parsed.summary, CLI_SAMPLE_PLAN.windows_security_expected_test_count)) {
        codes.push("QUAL_WINDOWS_TEST_TOTAL_INVALID");
      }
      if (parsed.summary.wall_duration_micros > CLI_SAMPLE_PLAN.thresholds_micros.windows_security_wall) {
        codes.push("QUAL_WINDOWS_WALL_BUDGET_EXCEEDED");
      }
      windows = {
        test_files: [...CLI_SAMPLE_PLAN.windows_security_test_files],
        expected_test_count: CLI_SAMPLE_PLAN.windows_security_expected_test_count,
        test_summary: parsed.summary,
        alias_fixture_required: true,
        short_path_fixture_required: true,
      };
    } else {
      cliSummary = parsed.summary;
      if (!exactTestTotalsForTest(parsed.summary, CLI_SAMPLE_PLAN.cli_expected_test_count)) codes.push("QUAL_CLI_TEST_TOTAL_INVALID");
      temporal = temporalObservationForTest(parsed);
      tune = tuneObservationForTest(parsed);
      if (temporal === null) codes.push("QUAL_TEMPORAL_TEST_MISSING");
      if (tune === null) codes.push("QUAL_TUNE_TEST_MISSING");
      if (temporal !== null && temporal.duration_micros > CLI_SAMPLE_PLAN.thresholds_micros.eval_test) codes.push("QUAL_EVAL_BUDGET_EXCEEDED");
      if (tune !== null && tune.duration_micros > CLI_SAMPLE_PLAN.thresholds_micros.tune_test) codes.push("QUAL_TUNE_BUDGET_EXCEEDED");
      if (parsed.summary.wall_duration_micros > CLI_SAMPLE_PLAN.thresholds_micros.cli_wall) codes.push("QUAL_CLI_WALL_BUDGET_EXCEEDED");
    }
  }
  const requiredPresent = windowsSecurity
    ? windows !== null
    : cliSummary !== null && temporal !== null && tune !== null;
  if (!requiredPresent && codes.length === 0) codes.push(windowsSecurity ? "QUAL_WINDOWS_TAP_INVALID" : "QUAL_CLI_TAP_INVALID");
  const receipt = buildQualificationReceiptForTest({
    failure_codes: codes,
    source,
    environment,
    immutable_inputs: immutableInputs,
    cli_test_summary: cliSummary,
    temporal_noninterference: temporal,
    tune_qualification: tune,
    windows_security: windows,
  });
  await artifactRoot.write(CLI_RECEIPT_FILE, receipt);
  return receipt;
}

async function writeObservationFailureReceipt(artifactRoot, source, code) {
  const receipt = buildObservationReceiptForTest({
    failure_codes: [code],
    publication_eligible: false,
    source,
    fixture: null,
    environment: null,
    indexing: null,
    query_latency: null,
    convergence: null,
    observation_report: null,
  });
  try { await artifactRoot.write(OBSERVATION_RECEIPT_FILE, receipt); } catch { /* original failure governs */ }
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  const repoRoot = resolve(process.cwd());
  if (parsed.mode === "plan") {
    process.stdout.write(prettyCanonical(performanceSamplePlan()));
    return;
  }
  if (parsed.mode === "offline-self-test") {
    process.stdout.write(`${stableJson(exerciseOfflineGuardFamiliesForTest())}\n`);
    return;
  }
  if (parsed.mode === "immutability") {
    await verifyFrozenQualificationInputsForTest(repoRoot);
    return;
  }
  const artifactRoot = await observationArtifactRoot(parsed.artifact_root);
  if (parsed.mode === "cli" || parsed.mode === "windows-security") {
    const receipt = await runCliQualification(repoRoot, artifactRoot, parsed.mode === "windows-security");
    if (receipt.status !== "pass") process.exitCode = 1;
    return;
  }
  const source = await observationSourceReceipt(repoRoot);
  try { await runObservation(repoRoot, artifactRoot, source); }
  catch (error) {
    const code = typeof error?.message === "string" && OBSERVATION_FAILURE_CODES.has(error.message)
      ? error.message
      : "OBS_REPORT_INVALID";
    await writeObservationFailureReceipt(artifactRoot, source, code);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath !== null && invokedPath === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`phase4 retrieval qualification: ${error?.message ?? "operational failure"}\n`);
    process.exitCode = 2;
  });
}
