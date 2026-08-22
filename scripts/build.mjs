/**
 * GKOS-Engine build.
 *
 * Bundles the modular TypeScript core (src/index.ts and its siblings) into a
 * single fully-inlined ESM bundle consumed by the CLI (bin/gkx.mjs) and the
 * test suite, and emits type declarations for TypeScript consumers:
 *
 *   dist/gkos-engine.mjs   canonical ESM bundle of GKOS-Engine
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
 *   node scripts/build.mjs        build dist/gkos-engine.mjs + declarations
 */
import esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// A breaking namespace migration must not leave stale generated modules in
// the published package. Recreate dist from source on every build.
rmSync(resolve(root, "dist"), { recursive: true, force: true });
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
  writeFileSync(resolve(root, "dist/gkos-engine.mjs"), core);
  console.log("built dist/gkos-engine.mjs");

  for (const [entry, output] of [
    ["src/adapter.ts", "dist/adapter.mjs"],
    ["src/gkx.ts", "dist/gkx.mjs"],
    ["src/graphiti-adapter.ts", "dist/graphiti-adapter.mjs"],
    ["src/navigation/index.ts", "dist/navigation.mjs"],
    ["src/governance/index.ts", "dist/governance.mjs"],
  ]) {
    writeFileSync(resolve(root, output), await bundle(entry));
    console.log(`built ${output}`);
  }

  // Retrieval is a host-plane bundle. Keep node:sqlite and filesystem state
  // outside the platform-neutral root and NavigationCore bundles.
  writeFileSync(resolve(root, "dist/retrieval.mjs"), await bundle("src/retrieval/index.ts", { platform: "node" }));
  console.log("built dist/retrieval.mjs");
  writeFileSync(resolve(root, "dist/retrieval-host.mjs"), await bundle("src/retrieval/host.ts", { platform: "node" }));
  console.log("built dist/retrieval-host.mjs");
  // The CLI corpus scanner needs the same alias/reparse/8.3 semantics as the
  // retrieval host, but legacy commands must not eagerly load node:sqlite.
  // Keep the small filesystem boundary in its own lazily imported bundle.
  writeFileSync(resolve(root, "dist/retrieval-path-security.mjs"), await bundle("src/retrieval/path-security.ts", { platform: "node" }));
  console.log("built dist/retrieval-path-security.mjs");
  // Phase-4 raw golden parsing is repository-host-only. Keep it outside the
  // package export map and ordinary retrieval bundle authority surface.
  writeFileSync(resolve(root, "dist/retrieval-evaluation-host.mjs"), await bundle("src/retrieval/evaluation-host.ts", { platform: "node" }));
  console.log("built dist/retrieval-evaluation-host.mjs");
  // Phase-3 validation/journal authority is a trusted CLI host plane. Keep
  // parser receipts and rejection envelopes out of ordinary package exports.
  writeFileSync(resolve(root, "dist/ingest-host.mjs"), await bundle("src/ingest/host.ts", { platform: "node" }));
  console.log("built dist/ingest-host.mjs");

  // Desktop-agent sidecar entry. Two node-platform bundles from the same
  // source: an ESM bundle for `node dist/...mjs` runs and the test suite, and
  // a CJS bundle that the Node SEA flow (scripts/build-sea.mjs) requires as its
  // single-file entry (SEA only accepts CommonJS).
  const desktopEsm = await bundle("src/desktop-agent.ts", { platform: "node", format: "esm" });
  writeFileSync(resolve(root, "dist/gkos-desktop-agent.mjs"), desktopEsm);
  console.log("built dist/gkos-desktop-agent.mjs");

  const desktopCjs = await bundle("src/desktop-agent.ts", { platform: "node", format: "cjs" });
  writeFileSync(resolve(root, "dist/gkos-desktop-agent.cjs"), desktopCjs);
  console.log("built dist/gkos-desktop-agent.cjs");

  // Invoke TypeScript's JS entry point directly via node (not the .cmd/.sh
  // shim) so this works identically across platforms with no shell involved.
  const tscJs = resolve(root, "node_modules/typescript/bin/tsc");
  execFileSync(process.execPath, [tscJs, "-p", "tsconfig.declarations.json"], { cwd: root, stdio: "inherit" });
  console.log("built dist/*.d.ts");
} catch (e) {
  console.error(e);
  process.exit(1);
}
