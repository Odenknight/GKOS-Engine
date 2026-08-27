import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");

test("importing Navigation and Effects surfaces creates no files or runtime authority", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gkos-effects-import-purity-"));
  try {
    const imports = [
      "dist/gkos-engine.mjs",
      "dist/navigation.mjs",
      "dist/navigation-effects.mjs",
      "dist/navigation-effects-node.mjs",
    ].map((path) => pathToFileURL(resolve(ROOT, path)).href);
    const script = `await Promise.all(${JSON.stringify(imports)}.map((href) => import(href)));`;
    const child = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd,
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, "");
    assert.equal(child.stderr, "");
    assert.deepEqual(await readdir(cwd), []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

