import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ensureWatcherDirectory,
  openWatcherDirectory,
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
