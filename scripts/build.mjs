/**
 * GKOS Engine build.
 *
 * Bundles the modular TypeScript core (src/index.ts and its siblings) into a
 * single fully-inlined ESM bundle consumed by the CLI (bin/okf.mjs) and the
 * test suite:
 *
 *   dist/kosmos-core.mjs   ESM bundle of the deterministic GKOS Engine core
 *
 * Obsidian-free, DOM-free, platform-neutral — reusable from any Node consumer.
 *
 * Usage:
 *   node scripts/build.mjs        build dist/kosmos-core.mjs
 */
import esbuild from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

mkdirSync(resolve(root, "dist"), { recursive: true });

async function bundle(entry, opts = {}) {
  const res = await esbuild.build({
    entryPoints: [resolve(root, entry)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2020",
    minify: false,
    sourcemap: false,
    logLevel: "silent",
    ...opts,
  });
  return res.outputFiles[0].text;
}

try {
  const core = await bundle("src/index.ts");
  writeFileSync(resolve(root, "dist/kosmos-core.mjs"), core);
  console.log("built dist/kosmos-core.mjs");
} catch (e) {
  console.error(e);
  process.exit(1);
}
