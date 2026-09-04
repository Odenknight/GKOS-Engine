import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, chownSync, closeSync, ftruncateSync, linkSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, statSync,
  symlinkSync, unlinkSync, utimesSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ensureWatcherDirectory,
  discardIncompleteWatcherLeaf,
  hardlinkWatcherLeafNoReplace,
  openWatcherDirectory,
  readWatcherFile,
  removeEmptyWatcherDirectory,
  replaceWatcherLeaf,
  revalidateWatcherDirectory,
  publishWatcherPointer,
  readWatcherPointer,
  recoverWatcherPointer,
  watcherDigest,
  watcherLeafExists,
  unlinkWatcherLeaf,
  withAuthorizedWatcherLeafTransition,
  writeExistingWatcherFile,
  writeNewWatcherFile,
  writeReservedWatcherFile,
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

const posixTest = process.platform === "win32" ? () => {} : test;

posixTest("POSIX transitions reject sibling aliases and owner changes", (t) => {
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
  const child = ensureWatcherDirectory(join(admitted.root, "child"), openWatcherDirectory(admitted.root));
  assert.doesNotThrow(() => revalidateWatcherDirectory(child));

  const leafOver = mutationAuthority(t, "gkos-watcher-authority-leaf-over-", false);
  sparseFile(join(leafOver.root, "oversized.bin"), 1_073_741_825);
  assert.throws(() => ensureWatcherDirectory(join(leafOver.root, "child"), openWatcherDirectory(leafOver.root)),
    { message: "GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED" });

  const aggregateOver = mutationAuthority(t, "gkos-watcher-authority-aggregate-over-", false);
  for (let index = 0; index < 4; index += 1) sparseFile(join(aggregateOver.root, `part-${index}.bin`), 1_073_741_824);
  sparseFile(join(aggregateOver.root, "part-4.bin"), 1);
  assert.throws(() => ensureWatcherDirectory(join(aggregateOver.root, "child"), openWatcherDirectory(aggregateOver.root)),
    { message: "GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED" });

  const affectedCount = mutationAuthority(t, "gkos-watcher-authority-affected-count-", false);
  assert.throws(() => withAuthorizedWatcherLeafTransition(
    affectedCount.parent,
    Array.from({ length: 100_001 }, (_, index) => `leaf-${index}.bin`),
    () => undefined,
    [],
    () => undefined,
  ), { message: "GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED" });

  const affectedAggregate = mutationAuthority(t, "gkos-watcher-authority-affected-aggregate-", false);
  const affectedLeaves = Array.from({ length: 5 }, (_, index) => `part-${index}.bin`);
  for (let index = 0; index < 4; index += 1) sparseFile(join(affectedAggregate.root, affectedLeaves[index]), 1_073_741_824);
  sparseFile(join(affectedAggregate.root, affectedLeaves[4]), 1);
  assert.throws(() => withAuthorizedWatcherLeafTransition(
    openWatcherDirectory(affectedAggregate.root), affectedLeaves, () => undefined, affectedLeaves, () => undefined,
  ), { message: "GKX_WATCHER_FS_ENTRY_LIMIT_EXCEEDED" });
});

test("authorized file transitions refresh the authentic parent across every leaf operation", (t) => {
  const authority = mutationAuthority(t, "gkos-watcher-file-transition-", false);
  const beforeNlink = statSync(authority.root).nlink;
  writeNewWatcherFile(authority.parent, "first.json", Buffer.from("first\n"));
  writeExistingWatcherFile(authority.parent, "first.json", Buffer.from("first-updated\n"));
  assert.equal(readWatcherFile(authority.parent, "first.json").bytes.toString(), "first-updated\n");
  assert.doesNotThrow(() => revalidateWatcherDirectory(authority.parent));
  writeReservedWatcherFile(authority.parent, "reserved.json", () => Buffer.from("reserved\n"));
  assert.doesNotThrow(() => revalidateWatcherDirectory(authority.parent));
  hardlinkWatcherLeafNoReplace(authority.parent, "first.json", "first-link.json");
  assert.equal(readWatcherFile(authority.parent, "first-link.json", { allowed_links: 2 }).bytes.toString(), "first-updated\n");
  unlinkWatcherLeaf(authority.parent, "first-link.json", { allowed_links: 2 });
  assert.equal(readWatcherFile(authority.parent, "first.json").bytes.toString(), "first-updated\n");
  replaceWatcherLeaf(authority.parent, "reserved.json", "final.json", readWatcherFile(authority.parent, "reserved.json").raw_sha256);
  assert.equal(readWatcherFile(authority.parent, "final.json").bytes.toString(), "reserved\n");
  writeNewWatcherFile(authority.parent, "incomplete.tmp", Buffer.from("partial"));
  discardIncompleteWatcherLeaf(authority.parent, "incomplete.tmp");
  unlinkWatcherLeaf(authority.parent, "first.json");
  unlinkWatcherLeaf(authority.parent, "final.json");
  assert.doesNotThrow(() => revalidateWatcherDirectory(authority.parent));
  assert.equal(statSync(authority.root).nlink, beforeNlink);
});

test("full-coordinate alias discovery admits a genuine hardlink and rejects an existing extra alias", (t) => {
  const positive = mutationAuthority(t, "gkos-watcher-file-full-alias-positive-", false);
  writeNewWatcherFile(positive.parent, "source.json", Buffer.from("source\n"));
  hardlinkWatcherLeafNoReplace(positive.parent, "source.json", "target.json");
  assert.equal(readWatcherFile(positive.parent, "source.json", { allowed_links: 2 }).bytes.toString(), "source\n");
  assert.equal(readWatcherFile(positive.parent, "target.json", { allowed_links: 2 }).bytes.toString(), "source\n");

  const negative = mutationAuthority(t, "gkos-watcher-file-full-alias-negative-", false);
  writeNewWatcherFile(negative.parent, "source.json", Buffer.from("source\n"));
  linkSync(join(negative.root, "source.json"), join(negative.root, "existing-alias.json"));
  const reopened = openWatcherDirectory(negative.root);
  assert.throws(() => hardlinkWatcherLeafNoReplace(reopened, "source.json", "target.json"),
    /GKX_WATCHER_FS_LINK_IDENTITY_INVALID/u);
  assert.throws(() => readFileSync(join(negative.root, "target.json")), /ENOENT/u);
});

posixTest("ordinary reads, cleanup, links, unlinks, and replacements reject non-private files", async (t) => {
  async function exercise(label, mutate) {
    await t.test(label, (child) => {
      const authority = mutationAuthority(child, `gkos-watcher-file-${label.replaceAll(" ", "-")}-`, false);
      const source = join(authority.root, "source.json");
      writeFileSync(source, "source\n", { mode: 0o600 });
      mutate(source);
      const parent = openWatcherDirectory(authority.root);
      assert.throws(() => readWatcherFile(parent, "source.json"), /GKX_WATCHER_FS_FILE_IDENTITY_INVALID/u);
      assert.throws(() => discardIncompleteWatcherLeaf(parent, "source.json"),
        /GKX_WATCHER_FS_INCOMPLETE_FILE_IDENTITY_INVALID/u);
      assert.throws(() => hardlinkWatcherLeafNoReplace(parent, "source.json", "target.json"),
        /GKX_WATCHER_FS_LINK_IDENTITY_INVALID/u);
      assert.throws(() => unlinkWatcherLeaf(parent, "source.json"), /GKX_WATCHER_FS_FILE_IDENTITY_INVALID/u);
      assert.throws(() => replaceWatcherLeaf(parent, "source.json", "final.json", D1),
        /GKX_WATCHER_FS_FILE_IDENTITY_INVALID/u);
      assert.equal(readFileSync(source, "utf8"), "source\n");
      assert.throws(() => readFileSync(join(authority.root, "target.json")), /ENOENT/u);
      assert.throws(() => readFileSync(join(authority.root, "final.json")), /ENOENT/u);
    });
  }

  await exercise("wrong mode", (source) => chmodSync(source, 0o644));
  if (process.geteuid?.() === 0) await exercise("wrong owner", (source) => chownSync(source, 1, 1));
});

test("existing-leaf rewrite rejects hardlink and symlink substitution", (t) => {
  const linked = mutationAuthority(t, "gkos-watcher-existing-link-", false);
  writeNewWatcherFile(linked.parent, "status.json", Buffer.from("old\n"));
  linkSync(join(linked.root, "status.json"), join(linked.root, "alias.json"));
  assert.throws(() => writeExistingWatcherFile(
    openWatcherDirectory(linked.root), "status.json", Buffer.from("new\n"),
  ), /GKX_WATCHER_FS_(?:FILE_CHANGED|FILE_LINK_INVALID)/u);
  assert.equal(readFileSync(join(linked.root, "status.json"), "utf8"), "old\n");

  if (process.platform !== "win32") {
    const symlinked = mutationAuthority(t, "gkos-watcher-existing-symlink-", false);
    writeFileSync(join(symlinked.container, "outside.json"), "outside\n", { mode: 0o600 });
    symlinkSync(join(symlinked.container, "outside.json"), join(symlinked.root, "status.json"));
    assert.throws(() => writeExistingWatcherFile(
      openWatcherDirectory(symlinked.root), "status.json", Buffer.from("new\n"),
    ), /GKX_WATCHER_FS_(?:(?:FILE|DIRECTORY)_ALIAS_INVALID|DIRECTORY_CHANGED)/u);
    assert.equal(readFileSync(join(symlinked.container, "outside.json"), "utf8"), "outside\n");
  }
});

test("reserved derivation rejects retained authority swap-and-restore", (t) => {
  const authority = mutationAuthority(t, "gkos-watcher-reserved-derive-", true);
  assert.throws(() => writeReservedWatcherFile(authority.parent, "selector.json", () => {
    const held = `${authority.sibling}.held`;
    renameSync(authority.sibling, held);
    writeFileSync(authority.sibling, "sealed\n", { mode: 0o600 });
    unlinkSync(authority.sibling);
    renameSync(held, authority.sibling);
    return Buffer.from("selector\n");
  }), { message: "GKX_WATCHER_FS_DIRECTORY_CHANGED" });
});

posixTest("file-transition second boundary rejects sibling, target, link, and parent races", (t) => {
  const sibling = mutationAuthority(t, "gkos-watcher-file-sibling-");
  assert.throws(() => writeNewWatcherFile(sibling.parent, "new.json", Buffer.from("new\n"), undefined, {
    on_before_seal_refresh() { writeFileSync(sibling.sibling, "changed\n"); },
  }), { message: "GKX_WATCHER_FS_DIRECTORY_CHANGED" });

  const resurrected = mutationAuthority(t, "gkos-watcher-file-resurrect-", false);
  writeNewWatcherFile(resurrected.parent, "gone.json", Buffer.from("gone\n"));
  assert.throws(() => unlinkWatcherLeaf(resurrected.parent, "gone.json", {
    on_before_seal_refresh() { writeFileSync(join(resurrected.root, "gone.json"), "replacement\n", { mode: 0o600 }); },
  }), { message: "GKX_WATCHER_FS_DIRECTORY_CHANGED" });

  const linked = mutationAuthority(t, "gkos-watcher-file-third-link-", false);
  writeNewWatcherFile(linked.parent, "source.json", Buffer.from("source\n"));
  assert.throws(() => hardlinkWatcherLeafNoReplace(linked.parent, "source.json", "target.json", {
    on_before_seal_refresh() { linkSync(join(linked.root, "source.json"), join(linked.root, "third.json")); },
  }), { message: "GKX_WATCHER_FS_DIRECTORY_CHANGED" });

  const swapped = mutationAuthority(t, "gkos-watcher-file-parent-swap-", false);
  assert.throws(() => writeNewWatcherFile(swapped.parent, "new.json", Buffer.from("new\n"), undefined, {
    on_before_seal_refresh() {
      renameSync(swapped.root, `${swapped.root}.old`);
      mkdirSync(swapped.root, { mode: 0o700 });
    },
  }), /GKX_WATCHER_FS_DIRECTORY_(?:ALIAS_INVALID|CHANGED)/u);
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
