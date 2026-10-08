import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { planMocApply } from "gkos-engine/navigation-effects";
import { NodeNavigationEffectsExecutor, SimulatedEffectCrash } from "gkos-engine/navigation-effects/node";
import { sha256Bytes } from "../dist/gkos-engine.mjs";

const H = {
  config: `sha256:${"1".repeat(64)}`,
  policy: `sha256:${"2".repeat(64)}`,
  corpus: `sha256:${"3".repeat(64)}`,
  source: `sha256:${"4".repeat(64)}`,
};

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
      assert.equal(retry.status, "committed");
      assert.equal(await readFile(join(root, "topics/index.md"), "utf8"), planned.proposedBytes);
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
      assert.equal((await recoveryExecutor.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes })).status, "committed");
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
