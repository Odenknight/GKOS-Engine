import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { retainedGuardSeaAssets } from "../scripts/sea-native-assets.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("SEA native assets bind target, source, addon and exact CJS bundle", () => {
  const root = mkdtempSync(join(tmpdir(), "gkos-sea-assets-"));
  mkdirSync(join(root, "dist/native"), { recursive: true });
  mkdirSync(join(root, "native/windows"), { recursive: true });
  const native = Buffer.from("synthetic addon"), entry = Buffer.from("synthetic bundle"), source = Buffer.from("synthetic source");
  const digest = sha(native), filename = `retained-guard-${digest}.node`;
  const guard = { schemaVersion: 1, platform: "win32", arch: "x64", nodeApiVersion: 8,
    sha256: digest, filename, sourceSha256: sha(source) };
  const inventory = { schemaVersion: 1, retainedGuardSha256: digest,
    artifacts: [{ path: "dist/gkos-desktop-agent.cjs", sha256: sha(entry), bytes: entry.length }] };
  const write = (path, bytes) => writeFileSync(join(root, path), bytes);
  const reset = () => {
    write("dist/native/retained-guard.json", JSON.stringify(guard));
    write("dist/bundle-inputs.json", JSON.stringify(inventory));
    write(`dist/native/${filename}`, native); write("dist/gkos-desktop-agent.cjs", entry);
    write("native/windows/retained-guard.cpp", source);
  };
  reset();
  assert.deepEqual(retainedGuardSeaAssets(root, "linux", "x64"), {});
  assert.deepEqual(retainedGuardSeaAssets(root, "win32", "x64"), { [filename]: join(root, "dist/native", filename) });
  assert.throws(() => retainedGuardSeaAssets(root, "win32", "arm64"), /binding is invalid/);
  for (const mutate of [
    () => write(`dist/native/${filename}`, "changed"),
    () => write("dist/gkos-desktop-agent.cjs", "changed"),
    () => write("native/windows/retained-guard.cpp", "changed"),
    () => write("dist/bundle-inputs.json", JSON.stringify({ ...inventory, retainedGuardSha256: "0".repeat(64) })),
    () => write("dist/bundle-inputs.json", JSON.stringify({ ...inventory, artifacts: [...inventory.artifacts, ...inventory.artifacts] })),
    () => write("dist/native/retained-guard.json", JSON.stringify({ ...guard, filename: "../outside.node" })),
  ]) { reset(); mutate(); assert.throws(() => retainedGuardSeaAssets(root, "win32", "x64"), /binding is invalid/); }
});
