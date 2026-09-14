import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("bundle inventory covers every built JavaScript artifact with its exact compilation graph", () => {
  const inventory = JSON.parse(read("dist/bundle-inputs.json"));
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.scope, "javascript-bundles-only");
  assert.equal(inventory.completeSbom, false);
  for (const [field, path] of [["packageManifestSha256", "package.json"],
    ["lockfileSha256", "package-lock.json"], ["buildScriptSha256", "scripts/build.mjs"]]) {
    assert.equal(inventory[field], sha(read(path)));
  }
  const names = readdirSync(new URL("dist/", root)).filter(name => /\.(?:mjs|cjs)$/.test(name)).sort();
  assert.ok(names.length > 0);
  assert.deepEqual(inventory.artifacts.map(a => a.path), names.map(name => `dist/${name}`));
  const used = new Set();
  for (const artifact of inventory.artifacts) {
    const bytes = read(artifact.path);
    assert.equal(artifact.bytes, bytes.length);
    assert.equal(artifact.sha256, sha(bytes));
    assert.ok(artifact.compilations.length > 0);
    for (const index of artifact.compilations) {
      assert.ok(Number.isInteger(index) && index >= 0 && index < inventory.compilations.length);
      used.add(index);
      const compilation = inventory.compilations[index];
      assert.equal(compilation.sha256, artifact.sha256);
      assert.equal(compilation.bytes, artifact.bytes);
      assert.ok(Object.keys(compilation.metafile.inputs).length > 0);
      assert.ok(Object.keys(compilation.metafile.outputs).length > 0);
      for (const path of [compilation.entry, ...Object.keys(compilation.metafile.inputs)]) {
        assert.ok(!path.startsWith("../") && !path.startsWith("/") && !/^[A-Za-z]:/.test(path), path);
      }
    }
  }
  assert.equal(used.size, inventory.compilations.length);
});
