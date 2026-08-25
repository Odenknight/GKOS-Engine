import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { planMocApply } from "gkos-engine/navigation-effects";
import { NodeNavigationEffectsExecutor as RawNodeNavigationEffectsExecutor, SimulatedEffectCrash } from "gkos-engine/navigation-effects/node";
import { sha256Bytes } from "../dist/gkos-engine.mjs";

const H = {
  config: `sha256:${"1".repeat(64)}`,
  policy: `sha256:${"2".repeat(64)}`,
  corpus: `sha256:${"3".repeat(64)}`,
  source: `sha256:${"4".repeat(64)}`,
};

function NodeNavigationEffectsExecutor(options) {
  return new RawNodeNavigationEffectsExecutor({ pathThreatModel: "cooperative-vault", ...options });
}

function authority(capability = "moc:apply", root = "topics") {
  return {
    actor: { actorId: "human:oden", actorType: "human" },
    grantId: `grant:${capability}`,
    allowedRoot: root,
    capability,
    sensitivityCeiling: "secret",
    policyRef: { id: "effects", version: "1", digest: H.policy },
  };
}

async function makePlan(currentBytes, targetPath = "topics/index.md", runId = "run-node") {
  const result = await planMocApply({
    candidate: {
      artifactKind: "engine.moc-candidate", candidateId: "candidate:node", directory: "topics", targetPath,
      candidateBytes: "# Topics\n\n<!-- gkos-navigation:managed:start -->\n- [[topics/A|A]]\n<!-- gkos-navigation:managed:end -->\n",
      digest: "candidate-digest", sourceSnapshotDigest: H.source,
      configRef: { id: "config", version: 1, digest: H.config },
      policy: { id: "effects", version: "1", digest: H.policy }, sourceRefs: [],
    },
    currentBytes,
    ownership: { targetPath, ownership: "fully-managed", ...(currentBytes === null ? { creationAuthorized: true } : { adoptedDigest: await sha256Bytes(currentBytes), adoptedBy: { actorId: "human:oden", actorType: "human" }, adoptedAt: "2026-08-20T12:00:00Z", adoptionReceiptId: "receipt:adopt" }) },
    vaultId: "vault:node", corpusDigest: H.corpus,
    policyRef: { id: "effects", version: "1", digest: H.policy }, authority: authority("moc:apply", targetPath.split("/")[0]),
    authorityEvaluatedAt: "2026-08-20T12:00:00Z",
    archiveDate: "2026-08-20", runId,
  });
  assert.equal(result.status, "planned");
  return result;
}

async function fixture(t, name) {
  const root = await mkdtemp(join(tmpdir(), `gkos-effects-${name}-`));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, "topics"), { recursive: true });
  return root;
}

test("Node executor requires an explicit cooperative-vault path threat model", async (t) => {
  const root = await fixture(t, "threat-model");
  assert.throws(() => new RawNodeNavigationEffectsExecutor({ vaultRoot: root }), /PATH_THREAT_MODEL_ACKNOWLEDGEMENT_REQUIRED/);
});

test("Node executor journals, archives exact bytes, atomically replaces, verifies, receipts, and replays idempotently", async (t) => {
  const root = await fixture(t, "commit");
  const before = "# Before\r\nHuman bytes\r\n";
  await writeFile(join(root, "topics/index.md"), before, "utf8");
  const planned = await makePlan(before);
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  const result = await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes });
  assert.equal(result.status, "committed");
  assert.equal(await readFile(join(root, "topics/index.md"), "utf8"), planned.proposedBytes);
  assert.equal(await readFile(join(root, "_archive/moc-runs/2026-08-20/run-node/before/topics/index.md"), "utf8"), before);
  assert.equal(await readFile(join(root, "_archive/moc-runs/2026-08-20/run-node/after/topics/index.md"), "utf8"), planned.proposedBytes);
  for (const name of ["manifest.json", "diff.json", "result.json"]) await readFile(join(root, `_archive/moc-runs/2026-08-20/run-node/${name}`), "utf8");
  assert.equal(result.receipt.sourceContentIncluded, false);
  const states = (await executor.journal.load()).map((entry) => entry.state);
  assert.deepEqual(states, ["RECEIVED", "PLANNED", "PREPARED", "APPLYING", "VERIFIED", "COMMITTED"]);
  const replay = await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes });
  assert.equal(replay.status, "committed");
  assert.deepEqual(replay.reasonCodes, ["IDEMPOTENT_REPLAY"]);
  assert.equal((await executor.journal.load()).length, 6);
  await executor.releaseVaultLease();
});

test("fresh executor performs a safe startup preflight before normal first use", async (t) => {
  const root = await fixture(t, "first-use-preflight");
  await writeFile(join(root, "topics/index.md"), "before");
  const planned = await makePlan("before", "topics/index.md", "run-first-use-preflight");
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  assert.equal((await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes })).status, "committed");
  const checkpoint = JSON.parse(await readFile(join(root, ".gkx/effects/checkpoints/latest.json"), "utf8"));
  assert.equal(checkpoint.cleanShutdown, false);
  await executor.releaseVaultLease();
});

test("precondition mismatch is stale and never overwrites external bytes", async (t) => {
  const root = await fixture(t, "stale");
  const before = "before";
  await writeFile(join(root, "topics/index.md"), before);
  const planned = await makePlan(before, "topics/index.md", "run-stale");
  await writeFile(join(root, "topics/index.md"), "external edit");
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  const result = await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes });
  assert.equal(result.status, "stale");
  assert.equal(await readFile(join(root, "topics/index.md"), "utf8"), "external edit");
  assert.equal(await readFile(join(root, ".gkx/effects/journal.jsonl"), "utf8").then((text) => text.includes("STALE")), true);
  await executor.releaseVaultLease();
});

test("stale receipts are journal-sealed and tampering blocks replay and startup", async (t) => {
  const root = await fixture(t, "stale-receipt-integrity");
  const before = "before stale integrity";
  await writeFile(join(root, "topics/index.md"), before);
  const planned = await makePlan(before, "topics/index.md", "run-stale-integrity");
  await writeFile(join(root, "topics/index.md"), "external stale bytes");
  const first = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  assert.equal((await first.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes })).status, "stale");
  await first.releaseVaultLease();
  const receiptPath = join(root, ".gkx/effects/receipts", `${planned.plan.effectId.replace(/[^0-9A-Za-z._-]/g, "_")}.json`);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  receipt.reasonCodes = ["TAMPERED"];
  await writeFile(receiptPath, `${JSON.stringify(receipt)}\n`);
  const replay = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  await assert.rejects(replay.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes }), /RECEIPT_CORRUPT/);
  await assert.rejects(replay.recoverStartup(), /RECEIPT_CORRUPT/);
  await replay.releaseVaultLease();
});

test("executor requires a current host precondition provider", async (t) => {
  const root = await fixture(t, "provider");
  await writeFile(join(root, "topics/index.md"), "before");
  const planned = await makePlan("before", "topics/index.md", "run-provider");
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root });
  const result = await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes });
  assert.deepEqual(result.reasonCodes, ["PRECONDITION_PROVIDER_MISSING"]);
  assert.equal(await readFile(join(root, "topics/index.md"), "utf8"), "before");
  await executor.releaseVaultLease();
});

test("vault lease excludes a second writer", async (t) => {
  const root = await fixture(t, "lease");
  const first = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  const second = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  await first.acquireVaultLease();
  await assert.rejects(second.acquireVaultLease(), /VAULT_LEASE_HELD/);
  await first.releaseVaultLease();
  await second.acquireVaultLease();
  await second.releaseVaultLease();
});

test("a verifiably dead same-host lease is quarantined with a cleanup receipt", async (t) => {
  const root = await fixture(t, "stale-lease");
  await mkdir(join(root, ".gkx/effects"), { recursive: true });
  await writeFile(join(root, ".gkx/effects/vault.lease"), JSON.stringify({ pid: 2147483647, host: hostname(), acquiredAt: "2026-08-20T00:00:00Z" }));
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  await executor.acquireVaultLease();
  const recoveryNames = await readdir(join(root, ".gkx/effects/recovery"));
  assert.equal(recoveryNames.some((name) => name.endsWith(".receipt.json")), true);
  assert.equal(recoveryNames.some((name) => name.startsWith("stale-lease-") && !name.endsWith(".receipt.json")), true);
  await executor.releaseVaultLease();
});

test("an external edit immediately before replace wins and the prepared image is not applied", async (t) => {
  const root = await fixture(t, "replace-race");
  const before = "before race";
  await writeFile(join(root, "topics/index.md"), before);
  const planned = await makePlan(before, "topics/index.md", "run-race");
  const executor = new NodeNavigationEffectsExecutor({
    vaultRoot: root,
    preconditionValidator: () => [],
    faultInjector: async (point) => { if (point === "after-temporary-write") await writeFile(join(root, "topics/index.md"), "external race winner"); },
  });
  const result = await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes });
  assert.equal(result.status, "stale");
  assert.deepEqual(result.reasonCodes, ["TARGET_CHANGED_BEFORE_REPLACE"]);
  assert.equal(await readFile(join(root, "topics/index.md"), "utf8"), "external race winner");
  const recovered = await executor.recoverStartup();
  assert.equal(recovered.safeToEnableWrites, true);
  assert.deepEqual(recovered.results[0].reasonCodes, ["VERIFIED_STALE_TEMP_REMOVED"]);
  const targetNames = await readdir(join(root, "topics"));
  assert.equal(targetNames.some((name) => name.startsWith(".gkx-effect-")), false);
  await executor.releaseVaultLease();
});

test("multi-file execution uses deterministic target lock order", async (t) => {
  const root = await fixture(t, "multi");
  await writeFile(join(root, "topics/a.md"), "a-before");
  await writeFile(join(root, "topics/z.md"), "z-before");
  const a = await makePlan("a-before", "topics/a.md", "run-batch");
  const z = await makePlan("z-before", "topics/z.md", "run-batch");
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  const results = await executor.executeMany([
    { plan: z.plan, proposedBytes: z.proposedBytes },
    { plan: a.plan, proposedBytes: a.proposedBytes },
  ]);
  assert.deepEqual(results.map((result) => result.status), ["committed", "committed"]);
  const receivedTargets = (await executor.journal.load()).filter((entry) => entry.state === "RECEIVED").map((entry) => entry.plan.targetPath);
  assert.deepEqual(receivedTargets, ["topics/a.md", "topics/z.md"]);
  const manifest = JSON.parse(await readFile(join(root, "_archive/moc-runs/2026-08-20/run-batch/manifest.json"), "utf8"));
  const diff = JSON.parse(await readFile(join(root, "_archive/moc-runs/2026-08-20/run-batch/diff.json"), "utf8"));
  assert.deepEqual(manifest.effects.map((effect) => effect.targetPath), ["topics/a.md", "topics/z.md"]);
  assert.deepEqual(diff.items.map((item) => item.targetPath), ["topics/a.md", "topics/z.md"]);
  await executor.releaseVaultLease();
});

test("concurrent execute calls serialize shared archive updates without losing effects", async (t) => {
  const root = await fixture(t, "concurrent-shared-archive");
  await writeFile(join(root, "topics/a.md"), "a-before");
  await writeFile(join(root, "topics/z.md"), "z-before");
  const a = await makePlan("a-before", "topics/a.md", "run-concurrent");
  const z = await makePlan("z-before", "topics/z.md", "run-concurrent");
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  const results = await Promise.all([
    executor.execute({ plan: z.plan, proposedBytes: z.proposedBytes }),
    executor.execute({ plan: a.plan, proposedBytes: a.proposedBytes }),
  ]);
  assert.deepEqual(results.map((result) => result.status), ["committed", "committed"]);
  const runRoot = join(root, "_archive/moc-runs/2026-08-20/run-concurrent");
  const manifest = JSON.parse(await readFile(join(runRoot, "manifest.json"), "utf8"));
  const diff = JSON.parse(await readFile(join(runRoot, "diff.json"), "utf8"));
  assert.deepEqual(manifest.effects.map((effect) => effect.targetPath), ["topics/a.md", "topics/z.md"]);
  assert.deepEqual(diff.items.map((item) => item.targetPath), ["topics/a.md", "topics/z.md"]);
  await executor.releaseVaultLease();
});

test("sequential shared-run commits retain immutable per-effect receipt bindings", async (t) => {
  const root = await fixture(t, "sequential-shared-archive");
  await writeFile(join(root, "topics/a.md"), "a-before");
  await writeFile(join(root, "topics/z.md"), "z-before");
  const a = await makePlan("a-before", "topics/a.md", "run-sequential");
  const z = await makePlan("z-before", "topics/z.md", "run-sequential");
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  assert.equal((await executor.execute({ plan: a.plan, proposedBytes: a.proposedBytes })).status, "committed");
  assert.equal((await executor.execute({ plan: z.plan, proposedBytes: z.proposedBytes })).status, "committed");
  assert.deepEqual(await executor.recoverStartup(), { safeToEnableWrites: true, results: [] });
  await executor.releaseVaultLease();
});

test("concurrent executeMany batches share one queue and merge a common archive", async (t) => {
  const root = await fixture(t, "concurrent-batches");
  await writeFile(join(root, "topics/a.md"), "a-before");
  await writeFile(join(root, "topics/z.md"), "z-before");
  const a = await makePlan("a-before", "topics/a.md", "run-concurrent-batches");
  const z = await makePlan("z-before", "topics/z.md", "run-concurrent-batches");
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  const batches = await Promise.all([
    executor.executeMany([{ plan: z.plan, proposedBytes: z.proposedBytes }]),
    executor.executeMany([{ plan: a.plan, proposedBytes: a.proposedBytes }]),
  ]);
  assert.deepEqual(batches.flat().map((result) => result.status), ["committed", "committed"]);
  const manifest = JSON.parse(await readFile(join(root, "_archive/moc-runs/2026-08-20/run-concurrent-batches/manifest.json"), "utf8"));
  assert.deepEqual(manifest.effects.map((effect) => effect.targetPath), ["topics/a.md", "topics/z.md"]);
  assert.deepEqual(await executor.recoverStartup(), { safeToEnableWrites: true, results: [] });
  await executor.releaseVaultLease();
});

test("startup recovery is serialized behind an in-flight execution", async (t) => {
  const root = await fixture(t, "recovery-execute-serialization");
  await writeFile(join(root, "topics/index.md"), "before");
  const planned = await makePlan("before", "topics/index.md", "run-recovery-serialization");
  let reachedResolve;
  let releaseResolve;
  const reached = new Promise((resolve) => { reachedResolve = resolve; });
  const release = new Promise((resolve) => { releaseResolve = resolve; });
  const executor = new NodeNavigationEffectsExecutor({
    vaultRoot: root,
    preconditionValidator: () => [],
    faultInjector: async (point) => { if (point === "after-prepared") { reachedResolve(); await release; } },
  });
  const execution = executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes });
  await reached;
  const recovery = executor.recoverStartup();
  releaseResolve();
  assert.equal((await execution).status, "committed");
  assert.deepEqual(await recovery, { safeToEnableWrites: true, results: [] });
  await executor.releaseVaultLease();
});

test("rollback is a separately authorized, preconditioned, archived effect", async (t) => {
  const root = await fixture(t, "rollback");
  const before = "original human bytes";
  await writeFile(join(root, "topics/index.md"), before);
  const planned = await makePlan(before, "topics/index.md", "run-forward");
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  assert.equal((await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes })).status, "committed");
  const rollback = await executor.rollback({ effectId: planned.plan.effectId, authority: authority("moc:rollback"), archiveDate: "2026-08-20", runId: "run-rollback" });
  assert.equal(rollback.status, "committed");
  assert.equal(rollback.receipt.operation, "moc:rollback");
  assert.equal(await readFile(join(root, "topics/index.md"), "utf8"), before);
  assert.equal(await readFile(join(root, "_archive/moc-runs/2026-08-20/run-rollback/before/topics/index.md"), "utf8"), planned.proposedBytes);
  await executor.releaseVaultLease();
});

test("startup recovery classifies every injected transition without silent overwrite", async (t) => {
  const points = ["after-received", "after-planned", "after-prepared", "after-archive", "after-temporary-write", "after-replace", "after-verified", "after-receipt"];
  for (const point of points) await t.test(point, async (t) => {
    const root = await fixture(t, point);
    const before = `before:${point}`;
    await writeFile(join(root, "topics/index.md"), before);
    const planned = await makePlan(before, "topics/index.md", `run-${point.replace(/^after-/, "")}`);
    let armed = true;
    const executor = new NodeNavigationEffectsExecutor({
      vaultRoot: root,
      preconditionValidator: () => [],
      faultInjector: (observed) => { if (armed && observed === point) { armed = false; throw new SimulatedEffectCrash(observed); } },
    });
    await assert.rejects(executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes }), new RegExp(`SIMULATED_EFFECT_CRASH:${point}`));
    const recovery = await executor.recoverStartup();
    if (["after-temporary-write", "after-replace", "after-verified", "after-receipt"].includes(point)) {
      assert.equal(recovery.safeToEnableWrites, true);
      assert.equal(recovery.results[0].classification, "effect-present-verified");
      assert.equal(await readFile(join(root, "topics/index.md"), "utf8"), planned.proposedBytes);
    } else {
      assert.equal(recovery.safeToEnableWrites, false);
      assert.equal(recovery.results[0].classification, "effect-absent-retryable");
      assert.equal(await readFile(join(root, "topics/index.md"), "utf8"), before);
      const retry = await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes });
      assert.deepEqual(retry.reasonCodes, ["RECOVERY_WRITE_LATCHED"]);
      assert.equal(await readFile(join(root, "topics/index.md"), "utf8"), before);
    }
    await executor.releaseVaultLease();
  });
});

test("hard process termination at every transition recovers without losing the before-image", async (t) => {
  const points = ["after-received", "after-planned", "after-prepared", "after-archive", "after-temporary-write", "after-replace", "after-verified", "after-receipt"];
  for (const point of points) await t.test(point, async (t) => {
    const root = await fixture(t, `hard-kill-${point}`);
    const before = `hard-kill-before:${point}`;
    await writeFile(join(root, "topics/index.md"), before);
    const planned = await makePlan(before, "topics/index.md", `run-hard-${point.replace(/^after-/, "")}`);
    const sentinel = join(root, "child-at-transition");
    const configPath = join(root, "child-config.json");
    await writeFile(configPath, JSON.stringify({ vaultRoot: root, point, sentinel, plan: planned.plan, proposedBytes: planned.proposedBytes }));
    const child = spawn(process.execPath, [join(process.cwd(), "test/fixtures/navigation-effects-crash-child.mjs"), configPath], { cwd: process.cwd(), stdio: "ignore" });
    const deadline = Date.now() + 10_000;
    while (true) {
      try { await readFile(sentinel); break; }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (Date.now() >= deadline) { child.kill(); throw new Error(`child did not reach ${point}`); }
      await delay(20);
    }
    child.kill("SIGKILL");
    await new Promise((resolveExit) => child.once("exit", resolveExit));
    const recoveryExecutor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
    const recovery = await recoveryExecutor.recoverStartup();
    if (["after-temporary-write", "after-replace", "after-verified", "after-receipt"].includes(point)) {
      assert.equal(recovery.results[0].classification, "effect-present-verified");
      assert.equal(await readFile(join(root, "topics/index.md"), "utf8"), planned.proposedBytes);
    } else {
      assert.equal(recovery.results[0].classification, "effect-absent-retryable");
      assert.equal(await readFile(join(root, "topics/index.md"), "utf8"), before);
      assert.deepEqual((await recoveryExecutor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes })).reasonCodes, ["RECOVERY_WRITE_LATCHED"]);
    }
    await recoveryExecutor.releaseVaultLease();
  });
});

test("filesystem fault injection preserves recoverable intent and never silently overwrites", async (t) => {
  for (const operation of ["archive", "temporary-write", "replace", "verify", "receipt"]) await t.test(operation, async (t) => {
    const root = await fixture(t, `io-${operation}`);
    const before = `before:${operation}`;
    await writeFile(join(root, "topics/index.md"), before);
    const planned = await makePlan(before, "topics/index.md", `run-io-${operation}`);
    let armed = true;
    const executor = new NodeNavigationEffectsExecutor({
      vaultRoot: root,
      preconditionValidator: () => [],
      ioFaultInjector: (observed) => { if (armed && observed === operation) { armed = false; const error = new Error(`INJECTED_IO:${operation}`); error.code = operation === "archive" ? "ENOSPC" : "EACCES"; throw error; } },
    });
    const result = await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes });
    assert.equal(result.status, "recovery-required");
    const target = await readFile(join(root, "topics/index.md"), "utf8");
    if (["verify", "receipt"].includes(operation)) assert.equal(target, planned.proposedBytes);
    else assert.equal(target, before);
    const recovery = await executor.recoverStartup();
    if (["verify", "receipt"].includes(operation)) assert.equal(recovery.results[0].classification, "effect-present-verified");
    else assert.equal(recovery.results[0].classification, operation === "replace" ? "effect-present-verified" : "effect-absent-retryable");
    await executor.releaseVaultLease();
  });
});

test("tampered recovery-required receipt blocks recovery without being overwritten", async (t) => {
  const root = await fixture(t, "recovery-receipt-tamper");
  await writeFile(join(root, "topics/index.md"), "before");
  const planned = await makePlan("before", "topics/index.md", "run-recovery-receipt-tamper");
  let armed = true;
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [], ioFaultInjector: (operation) => { if (armed && operation === "archive") { armed = false; throw new Error("INJECTED_ARCHIVE_FAILURE"); } } });
  assert.equal((await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes })).status, "recovery-required");
  const receiptPath = join(root, ".gkx/effects/receipts", `${planned.plan.effectId.replace(/[^0-9A-Za-z._-]/g, "_")}.json`);
  const tampered = `${JSON.stringify({ ...(JSON.parse(await readFile(receiptPath, "utf8"))), reasonCodes: ["TAMPERED"] })}\n`;
  await writeFile(receiptPath, tampered);
  await assert.rejects(executor.recoverStartup(), /RECEIPT_CORRUPT/);
  assert.equal(await readFile(receiptPath, "utf8"), tampered);
  await executor.releaseVaultLease();
});

test("tampered post-write pre-commit receipt blocks recovery without being overwritten", async (t) => {
  const root = await fixture(t, "precommit-receipt-tamper");
  await writeFile(join(root, "topics/index.md"), "before");
  const planned = await makePlan("before", "topics/index.md", "run-precommit-receipt-tamper");
  let armed = true;
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [], faultInjector: (point) => { if (armed && point === "after-receipt") { armed = false; throw new SimulatedEffectCrash(point); } } });
  await assert.rejects(executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes }), /SIMULATED_EFFECT_CRASH/);
  const receiptPath = join(root, ".gkx/effects/receipts", `${planned.plan.effectId.replace(/[^0-9A-Za-z._-]/g, "_")}.json`);
  const tampered = `${JSON.stringify({ ...(JSON.parse(await readFile(receiptPath, "utf8"))), status: "denied" })}\n`;
  await writeFile(receiptPath, tampered);
  await assert.rejects(executor.recoverStartup(), /RECEIPT_CORRUPT/);
  assert.equal(await readFile(receiptPath, "utf8"), tampered);
  await executor.releaseVaultLease();
});

test("recovery conflict is sealed stale, disables writes, and reopens validly", async (t) => {
  const root = await fixture(t, "recovery-conflict");
  await writeFile(join(root, "topics/index.md"), "before");
  const planned = await makePlan("before", "topics/index.md", "run-recovery-conflict");
  let armed = true;
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [], faultInjector: (point) => { if (armed && point === "after-prepared") { armed = false; throw new SimulatedEffectCrash(point); } } });
  await assert.rejects(executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes }), /SIMULATED_EFFECT_CRASH/);
  await writeFile(join(root, "topics/index.md"), "conflicting external bytes");
  const firstRecovery = await executor.recoverStartup();
  assert.equal(firstRecovery.safeToEnableWrites, false);
  assert.deepEqual(firstRecovery.results[0].reasonCodes, ["CONFLICTING_EXTERNAL_BYTES"]);
  const latest = (await executor.journal.load()).at(-1);
  assert.equal(latest.state, "STALE");
  assert.match(latest.receiptDigest, /^sha256:/);
  const sameEffect = await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes });
  assert.deepEqual(sameEffect, { status: "recovery-required", effectId: planned.plan.effectId, reasonCodes: ["RECOVERY_WRITE_LATCHED"] });
  await writeFile(join(root, "topics/other.md"), "other before");
  const other = await makePlan("other before", "topics/other.md", "run-recovery-conflict-other");
  const differentEffect = await executor.execute({ plan: other.plan, proposedBytes: other.proposedBytes });
  assert.deepEqual(differentEffect, { status: "recovery-required", effectId: other.plan.effectId, reasonCodes: ["RECOVERY_WRITE_LATCHED"] });
  assert.equal(await readFile(join(root, "topics/other.md"), "utf8"), "other before");
  const reopened = await executor.recoverStartup();
  assert.equal(reopened.safeToEnableWrites, false);
  assert.deepEqual(reopened.results[0].reasonCodes, ["CONFLICTING_EXTERNAL_BYTES"]);
  await executor.releaseVaultLease();
  const fresh = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  const restartAttempt = await fresh.execute({ plan: other.plan, proposedBytes: other.proposedBytes });
  assert.deepEqual(restartAttempt, { status: "recovery-required", effectId: other.plan.effectId, reasonCodes: ["RECOVERY_WRITE_LATCHED"] });
  assert.equal(await readFile(join(root, "topics/other.md"), "utf8"), "other before");
  await fresh.releaseVaultLease();
});

test("successful explicit recovery re-enables a fresh executor after a failed startup preflight", async (t) => {
  const root = await fixture(t, "recovery-reenable");
  await writeFile(join(root, "topics/index.md"), "before");
  const committedPlan = await makePlan("before", "topics/index.md", "run-recovery-reenable");
  const first = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  assert.equal((await first.execute({ plan: committedPlan.plan, proposedBytes: committedPlan.proposedBytes })).status, "committed");
  await first.releaseVaultLease();

  const manifestPath = join(root, committedPlan.plan.archiveRunPath, "manifest.json");
  const manifestBytes = await readFile(manifestPath, "utf8");
  await writeFile(manifestPath, "{}\n");
  await writeFile(join(root, "topics/other.md"), "other before");
  const other = await makePlan("other before", "topics/other.md", "run-recovery-reenable-other");
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  await assert.rejects(executor.execute({ plan: other.plan, proposedBytes: other.proposedBytes }), /ARCHIVE_CORRUPT/);
  await writeFile(manifestPath, manifestBytes);
  assert.equal((await executor.recoverStartup()).safeToEnableWrites, true);
  assert.equal((await executor.execute({ plan: other.plan, proposedBytes: other.proposedBytes })).status, "committed");
  await executor.releaseVaultLease();
});

test("retry retains immutable receipt bytes for every sealed journal terminal", async (t) => {
  const root = await fixture(t, "versioned-receipts");
  await writeFile(join(root, "topics/index.md"), "before");
  const planned = await makePlan("before", "topics/index.md", "run-versioned-receipts");
  let armed = true;
  const executor = new NodeNavigationEffectsExecutor({
    vaultRoot: root,
    preconditionValidator: () => [],
    ioFaultInjector: (operation) => { if (armed && operation === "archive") { armed = false; throw new Error("INJECTED_ARCHIVE_FAILURE"); } },
  });
  assert.equal((await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes })).status, "recovery-required");
  const firstTerminal = (await executor.journal.load()).at(-1);
  assert.equal(firstTerminal.state, "RECOVERY_REQUIRED");
  const firstVersionPath = join(root, ".gkx/effects/receipts/by-digest", `${firstTerminal.receiptDigest.slice(7)}.json`);
  const firstVersionBytes = await readFile(firstVersionPath, "utf8");
  assert.equal((await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes })).status, "committed");
  const committed = (await executor.journal.load()).at(-1);
  assert.equal(committed.state, "COMMITTED");
  assert.notEqual(committed.receiptDigest, firstTerminal.receiptDigest);
  assert.equal(await readFile(firstVersionPath, "utf8"), firstVersionBytes);
  await executor.releaseVaultLease();

  const replay = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  assert.equal((await replay.recoverStartup()).safeToEnableWrites, true);
  await replay.releaseVaultLease();
  await writeFile(firstVersionPath, "{}\n");
  const tampered = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  await assert.rejects(tampered.recoverStartup(), /RECEIPT_CORRUPT/);
  await tampered.releaseVaultLease();
});

test("stale-after-archive validates archive evidence before enabling writes", async (t) => {
  const root = await fixture(t, "stale-archive-validation");
  await writeFile(join(root, "topics/index.md"), "before");
  const planned = await makePlan("before", "topics/index.md", "run-stale-archive-validation");
  let changed = false;
  const executor = new NodeNavigationEffectsExecutor({
    vaultRoot: root,
    preconditionValidator: () => [],
    ioFaultInjector: async (operation) => {
      if (!changed && operation === "temporary-write") {
        changed = true;
        await writeFile(join(root, "topics/index.md"), "external after archive");
      }
    },
  });
  assert.equal((await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes })).status, "stale");
  await executor.releaseVaultLease();
  await writeFile(join(root, planned.plan.archiveRunPath, "manifest.json"), "{}\n");
  const recovery = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  await assert.rejects(recovery.recoverStartup(), /ARCHIVE_CORRUPT/);
  const blocked = await recovery.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes });
  assert.deepEqual(blocked.reasonCodes, ["RECOVERY_WRITE_LATCHED"]);
  await recovery.releaseVaultLease();
});

test("executor rejects noncanonical colliding effect IDs before durable I/O", async (t) => {
  const root = await fixture(t, "effect-id-collision");
  await writeFile(join(root, "topics/index.md"), "before");
  const planned = await makePlan("before", "topics/index.md", "run-effect-id-collision");
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  for (const effectId of ["effect:a/b", "effect:a?b"]) {
    const result = await executor.execute({ plan: { ...planned.plan, effectId }, proposedBytes: planned.proposedBytes });
    assert.deepEqual(result, { status: "denied", effectId, reasonCodes: ["EFFECT_ID_INVALID"] });
  }
  await assert.rejects(readdir(join(root, ".gkx/effects/receipts")), /ENOENT/);
  assert.equal(await readFile(join(root, "topics/index.md"), "utf8"), "before");
});

test("journal corruption blocks startup recovery", async (t) => {
  const root = await fixture(t, "corrupt");
  await mkdir(join(root, ".gkx/effects"), { recursive: true });
  await writeFile(join(root, ".gkx/effects/journal.jsonl"), "{not-json}\n");
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  await assert.rejects(executor.recoverStartup(), /JOURNAL_CORRUPT/);
  await executor.releaseVaultLease();
});

test("archive or checkpoint corruption blocks write-plane startup", async (t) => {
  await t.test("archive manifest", async (t) => {
    const root = await fixture(t, "archive-corrupt");
    const before = "before archive corruption";
    await writeFile(join(root, "topics/index.md"), before);
    const planned = await makePlan(before, "topics/index.md", "run-archive-corrupt");
    const first = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
    assert.equal((await first.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes })).status, "committed");
    await first.releaseVaultLease();
    await writeFile(join(root, "_archive/moc-runs/2026-08-20/run-archive-corrupt/manifest.json"), "{}\n");
    const recovery = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
    await assert.rejects(recovery.recoverStartup(), /ARCHIVE_CORRUPT/);
    await recovery.releaseVaultLease();
  });

  await t.test("checkpoint binding", async (t) => {
    const root = await fixture(t, "checkpoint-corrupt");
    await mkdir(join(root, ".gkx/effects/checkpoints"), { recursive: true });
    await writeFile(join(root, ".gkx/effects/checkpoints/latest.json"), '{"sequence":99,"entryDigest":"sha256:bad"}\n');
    const recovery = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
    await assert.rejects(recovery.recoverStartup(), /CHECKPOINT_CORRUPT/);
    await recovery.releaseVaultLease();
  });

  for (const [name, tamper, expected] of [
    ["primary receipt", async (root, plan) => {
      const path = join(root, ".gkx/effects/receipts", `${plan.effectId.replace(/[^0-9A-Za-z._-]/g, "_")}.json`);
      const receipt = JSON.parse(await readFile(path, "utf8"));
      receipt.status = "denied";
      await writeFile(path, `${JSON.stringify(receipt)}\n`);
    }, /RECEIPT_CORRUPT/],
    ["archive receipt copy", async (root, plan) => {
      const path = join(root, plan.archiveRunPath, "receipts", `${plan.effectId.replace(/[^0-9A-Za-z._-]/g, "_")}.json`);
      await writeFile(path, "{}\n");
    }, /RECEIPT_CORRUPT/],
    ["immutable effect binding", async (root, plan) => {
      const path = join(root, plan.archiveRunPath, "bindings", `${plan.effectId.replace(/[^0-9A-Za-z._-]/g, "_")}.json`);
      await writeFile(path, "{}\n");
    }, /ARCHIVE_CORRUPT/],
    ["archive after image", async (root, plan) => {
      await writeFile(join(root, plan.archiveRunPath, "after", ...plan.targetPath.split("/")), "tampered archive after");
    }, /ARCHIVE_CORRUPT/],
    ["archive diff", async (root, plan) => {
      await writeFile(join(root, plan.archiveRunPath, "diff.json"), "{}\n");
    }, /ARCHIVE_CORRUPT/],
    ["archive result", async (root, plan) => {
      await writeFile(join(root, plan.archiveRunPath, "result.json"), "{}\n");
    }, /ARCHIVE_CORRUPT/],
    ["manifest security binding", async (root, plan) => {
      const path = join(root, plan.archiveRunPath, "manifest.json");
      const manifest = JSON.parse(await readFile(path, "utf8"));
      manifest.effects[0].authorityDigest = `sha256:${"0".repeat(64)}`;
      await writeFile(path, `${JSON.stringify(manifest)}\n`);
    }, /ARCHIVE_CORRUPT/],
    ["unowned manifest binding", async (root, plan) => {
      const path = join(root, plan.archiveRunPath, "manifest.json");
      const manifest = JSON.parse(await readFile(path, "utf8"));
      manifest.effects.push({ ...manifest.effects[0], effectId: "effect:unowned", targetPath: "topics/unowned.md" });
      await writeFile(path, `${JSON.stringify(manifest)}\n`);
    }, /ARCHIVE_CORRUPT/],
    ["committed target", async (root, plan) => {
      await writeFile(join(root, ...plan.targetPath.split("/")), "post-commit external bytes");
    }, /COMMITTED_TARGET_CORRUPT/],
  ]) await t.test(name, async (t) => {
    const root = await fixture(t, `receipt-integrity-${name.replaceAll(" ", "-")}`);
    const before = "before receipt integrity";
    await writeFile(join(root, "topics/index.md"), before);
    const planned = await makePlan(before, "topics/index.md", `run-${name.replaceAll(" ", "-")}`);
    const first = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
    assert.equal((await first.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes })).status, "committed");
    await first.releaseVaultLease();
    await tamper(root, planned.plan);
    const recovery = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
    await assert.rejects(recovery.recoverStartup(), expected);
    await recovery.releaseVaultLease();
  });
});

test("graceful shutdown durably checkpoints before refusing new work", async (t) => {
  const root = await fixture(t, "shutdown");
  await writeFile(join(root, "topics/index.md"), "before");
  const planned = await makePlan("before", "topics/index.md", "run-shutdown");
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  await executor.acquireVaultLease();
  await executor.shutdown();
  const checkpoint = JSON.parse(await readFile(join(root, ".gkx/effects/checkpoints/latest.json"), "utf8"));
  assert.equal(checkpoint.cleanShutdown, true);
  const denied = await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes });
  assert.deepEqual(denied.reasonCodes, ["EXECUTOR_SHUTTING_DOWN"]);
  assert.equal(await readFile(join(root, "topics/index.md"), "utf8"), "before");
});

test("symlink or junction targets fail closed when the platform permits creating one", async (t) => {
  const root = await fixture(t, "link");
  const outside = await mkdtemp(join(tmpdir(), "gkos-effects-outside-"));
  t.after(async () => { await rm(outside, { recursive: true, force: true }); });
  await writeFile(join(outside, "index.md"), "outside");
  try {
    await symlink(outside, join(root, "topics/link"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES"].includes(error.code)) return t.skip("platform did not permit creating a symlink/junction fixture");
    throw error;
  }
  const planned = await makePlan("outside", "topics/link/index.md", "run-link");
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: root, preconditionValidator: () => [] });
  const result = await executor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes });
  assert.equal(result.status, "denied");
  assert.match(result.reasonCodes[0], /LINK_ESCAPE|REPARSE_ESCAPE/);
  assert.equal(await readFile(join(outside, "index.md"), "utf8"), "outside");
  await executor.releaseVaultLease();
});
