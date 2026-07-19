/**
 * GKOS Engine build.
 *
 * Bundles the modular TypeScript core (src/index.ts and its siblings) into a
 * single fully-inlined ESM bundle consumed by the CLI (bin/okf.mjs) and the
 * test suite, and emits type declarations for TypeScript consumers:
 *
 *   dist/kosmos-core.mjs   ESM bundle of the deterministic GKOS Engine core
 *   dist/index.d.ts        type declarations (+ per-module .d.ts)
 *
 * Obsidian-free, DOM-free, platform-neutral — reusable from any Node consumer.
 *
 * Runs automatically via the "prepare" npm lifecycle script whenever this
 * package is installed as a git dependency (npm installs devDependencies and
 * runs "prepare" for git-sourced packages), so `dist/` never needs to be
 * committed to the repo despite being required by package.json's "main" and
 * "exports" fields.
 *
 * Usage:
 *   node scripts/build.mjs        build dist/kosmos-core.mjs + dist/*.d.ts
 */
import esbuild from "esbuild";
import { execFileSync } from "node:child_process";
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

  // Invoke TypeScript's JS entry point directly via node (not the .cmd/.sh
  // shim) so this works identically across platforms with no shell involved.
  const tscJs = resolve(root, "node_modules/typescript/bin/tsc");
  execFileSync(process.execPath, [tscJs, "-p", "tsconfig.declarations.json"], { cwd: root, stdio: "inherit" });
  console.log("built dist/*.d.ts");
} catch (e) {
  console.error(e);
  process.exit(1);
}
