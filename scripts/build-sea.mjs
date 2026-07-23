/**
 * Build a Node SEA (Single Executable Application) of the desktop-agent
 * sidecar for the CURRENT platform.
 *
 * Flow (Node 22+ SEA, https://nodejs.org/api/single-executable-applications.html):
 *   1. write sea-config.json (main = the CJS bundle, SEA requires CommonJS)
 *   2. node --experimental-sea-config sea-config.json  → dist/sea-prep.blob
 *   3. copy the running node binary to the target output name
 *   4. postject-inject the blob into the copy under NODE_SEA_BLOB, using the
 *      standard fuse sentinel; on macOS also pass --macho-segment-name NODE_SEA
 *
 * Cross-compilation is NOT supported by SEA: each target is built on its
 * matching CI OS (windows-latest / macos-latest). This script is OS-agnostic —
 * it derives the target triple and output name from process.platform/arch, so
 * the same script runs unchanged on every runner. UNSIGNED (build spec
 * decision 1): no codesign/signtool step.
 *
 * Usage:
 *   node scripts/build.mjs          # produce dist/kosmos-desktop-agent.cjs
 *   node scripts/build-sea.mjs      # produce dist/<target-name>
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
mkdirSync(dist, { recursive: true });

/**
 * The fuse sentinel postject writes into is compiled into node and its exact
 * value is node-version-specific (e.g. it changed between Node 20/22 and 24).
 * Detect it from the target binary instead of hardcoding, so the script keeps
 * working across the Node versions CI runners ship. The on-disk form carries a
 * `:0` state suffix which we drop.
 */
function detectFuse(filePath) {
  const buf = readFileSync(filePath);
  const m = /NODE_SEA_FUSE_[0-9a-f]{32}/.exec(buf.toString("latin1"));
  if (!m) throw new Error("Could not locate the SEA fuse sentinel in the node binary.");
  return m[0];
}

/** Map process.platform/arch → { triple, exeSuffix }. */
function resolveTarget() {
  const { platform, arch } = process;
  if (platform === "win32") {
    return { triple: "x86_64-pc-windows-msvc", exeSuffix: ".exe", macho: false };
  }
  if (platform === "darwin") {
    const triple = arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
    return { triple, exeSuffix: "", macho: true };
  }
  if (platform === "linux") {
    // Not a shipped target (v1 non-goal), but keep the script runnable locally.
    const triple = arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
    return { triple, exeSuffix: "", macho: false };
  }
  throw new Error(`Unsupported platform for SEA: ${platform}/${arch}`);
}

function resolvePostject() {
  // Resolve postject's CLI entry via Node so no shell shim is involved and it
  // works identically on every OS.
  return require.resolve("postject/dist/cli.js");
}

/**
 * Remove the Authenticode signature from a PE (.exe). The official Windows
 * SEA node.exe is signed, and postject's PE parser cannot find the fuse
 * sentinel inside a signed binary ("signature seems corrupted"). The signature
 * lives in the Certificate Table (data directory index 4), stored as an overlay
 * at the end of the file. We zero that directory entry and truncate the overlay
 * — equivalent to `signtool remove /s`, but with no SDK dependency so it runs
 * on any Windows runner. No-op when there is no signature.
 */
function stripPeSignature(filePath) {
  const buf = readFileSync(filePath);
  if (buf.readUInt16LE(0) !== 0x5a4d) return; // not MZ
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.toString("ascii", peOff, peOff + 4) !== "PE\0\0") return;
  const optHeaderOff = peOff + 24;
  const magic = buf.readUInt16LE(optHeaderOff);
  const dataDirOff = optHeaderOff + (magic === 0x20b ? 112 : 96); // PE32+ vs PE32
  const securityDirOff = dataDirOff + 4 * 8; // index 4, 8 bytes each
  const certOffset = buf.readUInt32LE(securityDirOff);
  const certSize = buf.readUInt32LE(securityDirOff + 4);
  if (certOffset === 0 || certSize === 0) return; // already unsigned
  // Zero the security directory entry and the optional-header checksum.
  buf.writeUInt32LE(0, securityDirOff);
  buf.writeUInt32LE(0, securityDirOff + 4);
  buf.writeUInt32LE(0, optHeaderOff + 64); // CheckSum field
  const truncated = buf.subarray(0, certOffset);
  writeFileSync(filePath, truncated);
  console.log(`stripped Authenticode signature (${certSize} bytes) from ${filePath}`);
}

const cjsEntry = resolve(dist, "kosmos-desktop-agent.cjs");
if (!existsSync(cjsEntry)) {
  console.error(`missing ${cjsEntry} — run \`node scripts/build.mjs\` first.`);
  process.exit(1);
}

const { triple, exeSuffix, macho } = resolveTarget();
const outName = `kosmos-agent-${triple}${exeSuffix}`;
const outPath = resolve(dist, outName);

// 1. sea-config.json
const seaConfigPath = resolve(dist, "sea-config.json");
const blobPath = resolve(dist, "sea-prep.blob");
writeFileSync(
  seaConfigPath,
  JSON.stringify(
    {
      main: cjsEntry,
      output: blobPath,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
    },
    null,
    2,
  ),
);

// 2. generate the blob
console.log("generating SEA blob…");
execFileSync(process.execPath, ["--experimental-sea-config", seaConfigPath], { stdio: "inherit" });

// 3. copy the node binary
console.log(`copying node binary → ${outName}`);
copyFileSync(process.execPath, outPath);

// 3b. On Windows the official node.exe is signed; strip it so postject can
// find the fuse sentinel. (macOS is re-signed ad-hoc by postject itself.)
if (process.platform === "win32") {
  stripPeSignature(outPath);
}

// 4. postject inject
const fuse = detectFuse(outPath);
const postjectCli = resolvePostject();
const injectArgs = [
  postjectCli,
  outPath,
  "NODE_SEA_BLOB",
  blobPath,
  "--sentinel-fuse",
  fuse,
];
if (macho) injectArgs.push("--macho-segment-name", "NODE_SEA");

console.log("injecting blob with postject…");
execFileSync(process.execPath, injectArgs, { stdio: "inherit" });

const sizeMb = (statSync(outPath).size / (1024 * 1024)).toFixed(1);
console.log(`built ${outPath} (${sizeMb} MB)`);
