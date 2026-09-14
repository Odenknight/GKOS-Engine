import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { buildWatcherObservationRunner } from "../scripts/build-watcher-observation-runner.mjs";
import { watcherCanonicalBytes, watcherDigest } from "../dist/watcher-host.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function rawSha(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

test("watcher runner packaging preserves existing output and validates its staged native bytes", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "gkos-watcher-runner-package-"));
  const output = join(temporary, "runner.mjs");
  try {
    await buildWatcherObservationRunner(output);
    const original = readFileSync(output);
    await assert.rejects(buildWatcherObservationRunner(output), { code: "EEXIST" });
    assert.deepEqual(readFileSync(output), original);
    if (process.platform === "win32") {
      const manifest = JSON.parse(readFileSync(join(ROOT, "dist/native/retained-guard.json"), "utf8"));
      const staged = join(temporary, "native", manifest.filename);
      assert.equal(rawSha(readFileSync(staged)), `sha256:${manifest.sha256}`);
      writeFileSync(staged, "changed native bytes");
      await assert.rejects(buildWatcherObservationRunner(join(temporary, "second.mjs")));
      assert.equal(readFileSync(staged, "utf8"), "changed native bytes");
      assert.equal(readdirSync(temporary).includes("second.mjs"), false);
    }
  } finally {
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("watcher observation runner emits exactly one sealed governed measurement", { timeout: 120_000 }, async () => {
  const temporary = mkdtempSync(join(tmpdir(), "gkos-watcher-observation-test-"));
  const artifactRoot = join(temporary, "artifacts");
  const bundlePath = join(temporary, "runner.mjs");
  try {
    await import("node:fs/promises").then(({ mkdir }) => mkdir(artifactRoot, { mode: 0o700 }));
    if (process.platform !== "win32") chmodSync(artifactRoot, 0o700);
    await buildWatcherObservationRunner(bundlePath);
    const runner = await import(pathToFileURL(bundlePath).href);
    assert.deepEqual(runner.EXTERNAL_SEARCH_NODE_WARNING_ARGS, [
      "--disable-warning=ExperimentalWarning", "--disable-warning=UNDICI-EHPA",
    ]);
    const ownedWarningProbe = spawnSync(process.execPath, [
      ...runner.EXTERNAL_SEARCH_NODE_WARNING_ARGS, "-e",
      "process.emitWarning('sqlite probe', 'ExperimentalWarning'); process.emitWarning('proxy probe', {code:'UNDICI-EHPA'})",
    ], { encoding: "utf8" });
    assert.equal(ownedWarningProbe.status, 0);
    assert.equal(ownedWarningProbe.stderr, "", "known Node-owned warnings cannot corrupt the strict child stderr channel");
    const unrelatedWarningProbe = spawnSync(process.execPath, [
      ...runner.EXTERNAL_SEARCH_NODE_WARNING_ARGS, "-e", "process.emitWarning('application probe')",
    ], { encoding: "utf8" });
    assert.match(unrelatedWarningProbe.stderr, /application probe/u,
      "unrelated warnings remain visible to the fail-closed stderr check");
    assert.deepEqual(runner.parseExternalSearchChildOutputForTest(
      Buffer.from('{"hits":[]}\n', "utf8"), Buffer.alloc(0),
    ), { hits: [] });
    assert.throws(() => runner.parseExternalSearchChildOutputForTest(
      Buffer.from('{"hits":[]}\n', "utf8"), Buffer.from("warning\n", "utf8"),
    ), /GKX_WATCHER_QUALIFICATION_QUERY_INVALID/u);
    // Native modules remain mapped until process exit on Windows. Run the
    // measurement in its own process, then verify and remove its full package.
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { pathToFileURL } from 'node:url';
      const [bundle, root, artifacts] = process.argv.slice(2);
      const runner = await import(pathToFileURL(bundle));
      try { process.stdout.write(JSON.stringify({ result: await runner.runWatcherObservationMeasurementForTest(root, artifacts), failure: null })); }
      catch (error) { process.stdout.write(JSON.stringify({ result: null, failure: { message: error.message, stack: error.stack } })); }
    `, "measurement-child", bundlePath, ROOT, artifactRoot], { encoding: "utf8", timeout: 110_000, windowsHide: true });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    const { result, failure } = JSON.parse(child.stdout);

    if (failure !== null && failure.message !== "GKX_WATCHER_QUALIFICATION_FTS5_REQUIRED") throw failure;

    assert.deepEqual(readdirSync(artifactRoot), ["watcher-observation-measurement.json"]);
    const bytes = readFileSync(join(artifactRoot, "watcher-observation-measurement.json"));
    assert.equal(bytes.at(-1), 0x0a);
    assert.equal(bytes.includes(0x00), false);
    assert.equal(bytes.includes(0x0d), false);
    const measurement = JSON.parse(bytes.toString("utf8"));
    assert.equal(measurement.contract_version, "gkos-watcher-observation-measurement/1.0.0-draft.1");
    assert.equal(measurement.sample_plan_digest, "sha256:75b011dc253a445ec9c5fc192f600f57ec62411e8125dfa20c74a08f5faf301b");

    if (failure !== null) {
      assert.equal(Number.parseInt(process.versions.node.split(".")[0], 10) >= 24, true);
      assert.equal(failure.message, "GKX_WATCHER_QUALIFICATION_FTS5_REQUIRED");
      assert.equal(measurement.status, "unavailable");
      return;
    }

    assert.equal(result.byte_size, bytes.byteLength);
    assert.equal(result.raw_sha256, rawSha(bytes));
    assert.deepEqual(result.measurement, measurement);
    if (measurement.status === "unavailable") {
      assert.equal(Number.parseInt(process.versions.node.split(".")[0], 10) < 24, true);
      assert.deepEqual(measurement.failure_codes, ["MEASURE_FTS_UNAVAILABLE"]);
      assert.equal(measurement.fts_qualification.index_generation_count, 0);
      assert.equal(measurement.fts_qualification.query_count, 0);
      assert.equal(measurement.fts_qualification.provider_call_count, 0);
    } else {
      assert.equal(measurement.status, "qualified");
      assert.deepEqual(measurement.failure_codes, []);
      assert.equal(measurement.edit_latency_micros.length, 20);
      assert.equal(measurement.edit_latency_micros.every((value) => Number.isSafeInteger(value) && value <= 5_000_000), true);
      assert.equal(measurement.percentiles_micros.p95, measurement.edit_latency_micros.slice().sort((a, b) => a - b)[18]);
      assert.equal(measurement.source_work.initial_generation_count, 1);
      assert.equal(measurement.source_work.mutation_generation_count, 22);
      assert.equal(measurement.source_work.total_generation_count, 23);
      assert.equal(measurement.source_work.query_count, 22);
      assert.equal(measurement.source_work.reparsed_source_count, 22);
      assert.deepEqual(measurement.embedding_work, {
        provider_call_count: 0,
        provider_item_count: 0,
        unchanged_chunk_reembedded_count: 0,
      });
      assert.equal(measurement.convergence.all_equal, true);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("terminal watcher observation audit accepts all-and-only six exact governed lanes", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "gkos-watcher-archive-audit-test-"));
  const archiveRoot = join(temporary, "archives");
  const bundlePath = join(temporary, "runner.mjs");
  try {
    mkdirSync(archiveRoot);
    await buildWatcherObservationRunner(bundlePath);
    const runner = await import(pathToFileURL(bundlePath).href);
    const fixture = JSON.parse(readFileSync(join(
      ROOT, "contracts", "watcher", "gkos-watcher-recovery-1.0.0-draft.1", "watcher-conformance-fixture.json",
    ), "utf8"));
    const qualified = fixture.schema_cases.find((row) => row.case_id === "measurement-valid").value;
    const unavailable = fixture.semantic_cases.find((row) => row.case_id === "measurement-unavailable-zero-work").input.arguments[0];
    const lanes = [
      ["Linux", "linux", 22], ["Linux", "linux", 24], ["Linux", "linux", 26],
      ["Windows", "windows", 22], ["Windows", "windows", 24], ["Windows", "windows", 26],
    ];
    for (const [archiveOs, recordOs, node] of lanes) {
      const template = archiveOs === "Linux" && node === 22 ? unavailable : qualified;
      const environmentBase = {
        ...template.environment, runtime_version: `${node}.0.0`, os: recordOs,
      };
      delete environmentBase.environment_digest;
      const environment = { ...environmentBase, environment_digest: watcherDigest(environmentBase) };
      const outcomeBase = {
        ...template.fts_qualification, lane_kind: node === 24 ? "reference" : "matrix",
        runtime_version: environment.runtime_version, os: recordOs,
      };
      delete outcomeBase.outcome_digest;
      const fts = { ...outcomeBase, outcome_digest: watcherDigest(outcomeBase) };
      const measurementBase = { ...template, environment, fts_qualification: fts };
      delete measurementBase.measurement_digest;
      const measurement = { ...measurementBase, measurement_digest: watcherDigest(measurementBase) };
      const archive = join(archiveRoot, `phase5-watcher-recovery-observation-${archiveOs}-node-${node}`);
      mkdirSync(archive);
      writeFileSync(join(archive, "watcher-observation-measurement.json"), watcherCanonicalBytes(measurement), { flag: "wx" });
    }
    const rows = runner.auditWatcherObservationArchivesForTest(archiveRoot);
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.map((row) => row.archive).sort(), readdirSync(archiveRoot).sort());

    mkdirSync(join(archiveRoot, "phase5-watcher-recovery-observation-Linux-node-25"));
    assert.throws(() => runner.auditWatcherObservationArchivesForTest(archiveRoot), /GKX_WATCHER_QUALIFICATION_ARCHIVE_INVALID/u);
    rmSync(join(archiveRoot, "phase5-watcher-recovery-observation-Linux-node-25"), { recursive: true });
    const linux24 = readFileSync(join(archiveRoot,
      "phase5-watcher-recovery-observation-Linux-node-24", "watcher-observation-measurement.json"));
    writeFileSync(join(archiveRoot,
      "phase5-watcher-recovery-observation-Windows-node-24", "watcher-observation-measurement.json"), linux24);
    assert.throws(() => runner.auditWatcherObservationArchivesForTest(archiveRoot), /GKX_WATCHER_QUALIFICATION_ARCHIVE_LANE_INVALID/u);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
