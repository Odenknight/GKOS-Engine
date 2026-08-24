import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, chownSync, closeSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, renameSync, rmSync, statSync,
  symlinkSync, unlinkSync, utimesSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ensureWatcherDirectory,
  openWatcherDirectory,
  removeEmptyWatcherDirectory,
  revalidateWatcherDirectory,
  publishWatcherPointer,
  readWatcherPointer,
  recoverWatcherPointer,
  watcherDigest,
  watcherLeafExists,
} from "../dist/watcher-host.mjs";
import {
  acquireLegacyRetrievalWriter,
  releaseLegacyRetrievalWriter,
} from "../dist/retrieval-host.mjs";

const D1 = `sha256:${"1".repeat(64)}`;
const D2 = `sha256:${"2".repeat(64)}`;

test("directory capabilities are authentic and permit only sealed direct-child transitions", (t) => {
  const root = mkdtempSync(join(tmpdir(), "gkos-watcher-authority-"));
  if (process.platform !== "win32") chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const parent = openWatcherDirectory(root);
  assert.throws(() => revalidateWatcherDirectory({ ...parent }), { message: "GKX_WATCHER_FS_DIRECTORY_CAPABILITY_INVALID" });
  const child = ensureWatcherDirectory(join(root, "child"), parent);
  assert.doesNotThrow(() => revalidateWatcherDirectory(parent));
  removeEmptyWatcherDirectory(child, parent);
  assert.doesNotThrow(() => revalidateWatcherDirectory(parent));
  const reused = ensureWatcherDirectory(join(root, "child"), parent);
  assert.doesNotThrow(() => revalidateWatcherDirectory(reused));
});

test("authorized transitions reject retained sibling replacement and parent mode changes", (t) => {
  const root = mkdtempSync(join(tmpdir(), "gkos-watcher-authority-tamper-"));
  if (process.platform !== "win32") chmodSync(root, 0o700);
  const sibling = join(root, "retained.txt");
  writeFileSync(sibling, "sealed\n");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const parent = openWatcherDirectory(root);
  assert.throws(() => ensureWatcherDirectory(join(root, "replacement-attempt"), parent, {
    on_authorized_mutation() {
      renameSync(sibling, `${sibling}.old`);
      writeFileSync(sibling, "sealed\n");
    },
  }), { message: "GKX_WATCHER_FS_DIRECTORY_CHANGED" });

  const modeRoot = mkdtempSync(join(tmpdir(), "gkos-watcher-authority-mode-"));
  if (process.platform !== "win32") chmodSync(modeRoot, 0o700);
  t.after(() => rmSync(modeRoot, { recursive: true, force: true }));
  const modeParent = openWatcherDirectory(modeRoot);
  if (process.platform !== "win32") {
    assert.throws(() => ensureWatcherDirectory(join(modeRoot, "mode-attempt"), modeParent, {
      on_authorized_mutation() { chmodSync(modeRoot, 0o755); },
    }), { message: "GKX_WATCHER_FS_DIRECTORY_MODE_INVALID" });
  }
});

function mutationAuthority(t, prefix, withSibling = true) {
  const container = mkdtempSync(join(tmpdir(), prefix));
  const root = join(container, "authority");
  mkdirSync(root, { mode: 0o700 });
  if (process.platform !== "win32") chmodSync(root, 0o700);
  const sibling = join(root, "retained.txt");
  if (withSibling) writeFileSync(sibling, "sealed\n", { mode: 0o600 });
  t.after(() => rmSync(container, { recursive: true, force: true }));
  return { container, root, sibling, parent: openWatcherDirectory(root) };
}

test("authorized create proves the platform link-count transition and rejects every sibling delta", (t) => {
  const positive = mutationAuthority(t, "gkos-watcher-authority-link-", false);
  const before = statSync(positive.root).nlink;
  const child = ensureWatcherDirectory(join(positive.root, "child"), positive.parent);
  const afterCreate = statSync(positive.root).nlink;
  assert.equal(afterCreate, process.platform === "win32" ? before : before + 1);
  removeEmptyWatcherDirectory(child, positive.parent);
  assert.equal(statSync(positive.root).nlink, before);

  for (const [name, mutate] of [
    ["addition", ({ root }) => writeFileSync(join(root, "extra.txt"), "extra\n")],
    ["deletion", ({ sibling }) => unlinkSync(sibling)],
    ["content", ({ sibling }) => writeFileSync(sibling, "changed\n")],
    ["metadata", ({ sibling }) => utimesSync(sibling, new Date(1_700_000_000_000), new Date(1_700_000_000_000))],
  ]) {
    const authority = mutationAuthority(t, `gkos-watcher-authority-${name}-`);
    assert.throws(() => ensureWatcherDirectory(join(authority.root, "child"), authority.parent, {
      on_authorized_mutation() { mutate(authority); },
    }), { message: "GKX_WATCHER_FS_DIRECTORY_CHANGED" });
  }
});

test("second boundary rejects target reuse, target resurrection, and parent replacement", (t) => {
  const swapped = mutationAuthority(t, "gkos-watcher-authority-target-swap-", false);
  const target = join(swapped.root, "child");
  assert.throws(() => ensureWatcherDirectory(target, swapped.parent, {
    on_before_seal_refresh() {
      renameSync(target, `${target}.old`);
      mkdirSync(target, { mode: 0o700 });
      if (process.platform !== "win32") chmodSync(target, 0o700);
    },
  }), { message: "GKX_WATCHER_FS_DIRECTORY_CHANGED" });

  const removed = mutationAuthority(t, "gkos-watcher-authority-target-remove-", false);
  const removable = ensureWatcherDirectory(join(removed.root, "child"), removed.parent);
  assert.throws(() => removeEmptyWatcherDirectory(removable, removed.parent, {
    on_before_seal_refresh() {
      mkdirSync(removable.path, { mode: 0o700 });
      if (process.platform !== "win32") chmodSync(removable.path, 0o700);
    },
  }), { message: "GKX_WATCHER_FS_DIRECTORY_CHANGED" });

  const replaced = mutationAuthority(t, "gkos-watcher-authority-parent-swap-", false);
  assert.throws(() => ensureWatcherDirectory(join(replaced.root, "child"), replaced.parent, {
    on_before_seal_refresh() {
      renameSync(replaced.root, `${replaced.root}.old`);
      mkdirSync(replaced.root, { mode: 0o700 });
      if (process.platform !== "win32") chmodSync(replaced.root, 0o700);
    },
  }), /GKX_WATCHER_FS_DIRECTORY_(?:ALIAS_INVALID|CHANGED)/u);
});

test("POSIX transitions reject sibling aliases and owner changes", { skip: process.platform === "win32" }, (t) => {
  const aliased = mutationAuthority(t, "gkos-watcher-authority-alias-");
  assert.throws(() => ensureWatcherDirectory(join(aliased.root, "child"), aliased.parent, {
    on_authorized_mutation() {
      renameSync(aliased.sibling, `${aliased.sibling}.real`);
      symlinkSync(`${aliased.sibling}.real`, aliased.sibling);
    },
  }), /GKX_WATCHER_FS_DIRECTORY_(?:ALIAS_INVALID|CHANGED)/u);

  if (process.geteuid?.() === 0) {
    const owned = mutationAuthority(t, "gkos-watcher-authority-owner-", false);
    assert.throws(() => ensureWatcherDirectory(join(owned.root, "child"), owned.parent, {
      on_authorized_mutation() { chownSync(owned.root, 1, 1); },
    }), { message: "GKX_WATCHER_FS_DIRECTORY_OWNER_INVALID" });
  }
});

function sparseFile(path, size) {
  const descriptor = openSync(path, "w", 0o600);
  try { ftruncateSync(descriptor, size); } finally { closeSync(descriptor); }
}

test("transition snapshots admit the frozen Plan maximum and preflight ratified size caps", (t) => {
  const admitted = mutationAuthority(t, "gkos-watcher-authority-large-plan-", false);
  sparseFile(join(admitted.root, "watcher-journal-reset-recovery-plan.json"), 536_870_912);
  const child = ensureWatcherDirectory(join(admitted.root, "child"), admitted.parent);
  assert.doesNotThrow(() => revalidateWatcherDirectory(child));

  const leafOver = mutationAuthority(t, "gkos-watcher-authority-leaf-over-", false);
  sparseFile(join(leafOver.root, "oversized.bin"), 1_073_741_825);
  assert.throws(() => ensureWatcherDirectory(join(leafOver.root, "child"), leafOver.parent),
    { message: "GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED" });

  const aggregateOver = mutationAuthority(t, "gkos-watcher-authority-aggregate-over-", false);
  for (let index = 0; index < 4; index += 1) sparseFile(join(aggregateOver.root, `part-${index}.bin`), 1_073_741_824);
  sparseFile(join(aggregateOver.root, "part-4.bin"), 1);
  assert.throws(() => ensureWatcherDirectory(join(aggregateOver.root, "child"), aggregateOver.parent),
    { message: "GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED" });
});

function tempAuthority(t) {
  const root = mkdtempSync(join(tmpdir(), "gkos-watcher-pointer-"));
  if (process.platform !== "win32") chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const base = openWatcherDirectory(root);
  return ensureWatcherDirectory(join(root, "watcher"), base);
}

function pointer(uuid, manifestDigest, prior) {
  const base = {
    contract_version: "gkos-watcher-active-pointer/1.0.0-draft.1",
    kind: "watcher_coherent",
    service_generation_id: `watcher:${uuid}`,
    coherent_manifest_file: `watcher-coherent-${manifestDigest.slice(7)}.json`,
    coherent_manifest_digest: manifestDigest,
    prior_pointer_digest: prior,
  };
  return { ...base, pointer_digest: watcherDigest(base) };
}

test("outer pointer publication stores immutable artifacts and publishes guard-last", (t) => {
  const directory = tempAuthority(t);
  const first = pointer("019b2d14-4234-7db7-87d4-7d81cfaec932", D1, null);
  const second = pointer("019b2d14-4237-7db7-87d4-7d81cfaec932", D2, first.pointer_digest);
  const boundaries = [];
  publishWatcherPointer({
    namespace: "outer",
    directory,
    new_pointer: first,
    old_pointer: null,
    operation_intent_digest: D1,
    target_commit_digest: D1,
    finalize_target() {},
  });
  publishWatcherPointer({
    namespace: "outer",
    directory,
    new_pointer: second,
    old_pointer: first,
    operation_intent_digest: D2,
    target_commit_digest: D2,
    finalize_target() {},
    on_boundary(value) { boundaries.push(value); },
  });
  assert.equal(readWatcherPointer(directory, "outer").pointer_digest, second.pointer_digest);
  assert.equal(watcherLeafExists(directory, ".watcher-active.json.gkos-watcher.guard"), false);
  assert.deepEqual(boundaries, [
    "immutable_pointer", "guard_stage", "guard_linked", "guard_stage_removed", "temporary_pointer",
    "fixed_pointer", "target_finalized", "guard_removed",
  ]);
});

test("reader remains on guard-bound old pointer until fixed target finalization recovers", (t) => {
  const directory = tempAuthority(t);
  const first = pointer("019b2d14-4234-7db7-87d4-7d81cfaec932", D1, null);
  const second = pointer("019b2d14-4237-7db7-87d4-7d81cfaec932", D2, first.pointer_digest);
  publishWatcherPointer({ namespace: "outer", directory, new_pointer: first, old_pointer: null, operation_intent_digest: D1, target_commit_digest: D1, finalize_target() {} });
  assert.throws(() => publishWatcherPointer({
    namespace: "outer",
    directory,
    new_pointer: second,
    old_pointer: first,
    operation_intent_digest: D2,
    target_commit_digest: D2,
    finalize_target() { throw new Error("crash-after-fixed"); },
  }), /crash-after-fixed/u);
  assert.equal(readWatcherPointer(directory, "outer").pointer_digest, first.pointer_digest);
  let finalized = false;
  const recovered = recoverWatcherPointer({
    namespace: "outer",
    directory,
    finalize_target(digest) { assert.equal(digest, D2); finalized = true; },
  });
  assert.equal(finalized, true);
  assert.equal(recovered.pointer_digest, second.pointer_digest);
  assert.equal(readWatcherPointer(directory, "outer").pointer_digest, second.pointer_digest);
});

test("legacy retrieval writer handshakes exclude watcher authority evidence", (t) => {
  const vault = mkdtempSync(join(tmpdir(), "gkos-watcher-interlock-"));
  if (process.platform !== "win32") chmodSync(vault, 0o700);
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  const derived = join(vault, ".gkx", "derived");
  mkdirSync(derived, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") chmodSync(derived, 0o700);
  const derivedCapability = openWatcherDirectory(derived);
  const watcher = ensureWatcherDirectory(join(derived, "watcher"), derivedCapability);
  ensureWatcherDirectory(join(watcher.path, "journals"), watcher);
  const retrieval = join(derived, "retrieval");

  // Empty W/J roots are not authority. The watcher must still win its own
  // no-replace lock and repeat the global-genesis proof.
  const legacy = acquireLegacyRetrievalWriter(retrieval);
  releaseLegacyRetrievalWriter(legacy);

  writeFileSync(join(watcher.path, "watcher-authority.json"), "{}\n", { flag: "wx", mode: 0o600 });
  assert.throws(() => acquireLegacyRetrievalWriter(retrieval), /GKX_WATCHER_AUTHORITY_ACTIVE/u);
});
