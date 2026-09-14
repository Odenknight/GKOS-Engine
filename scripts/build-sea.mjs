import { retainedGuardSeaAssets } from "./sea-native-assets.mjs";
/**
 * Build a Node SEA (Single Executable Application) of the desktop-agent
 * sidecar, for the host platform/arch or — on macOS — for the other arch.
 *
 * Flow (Node 22+ SEA, https://nodejs.org/api/single-executable-applications.html):
 *   1. write sea-config.json (main = the CJS bundle, SEA requires CommonJS)
 *   2. node --experimental-sea-config sea-config.json  → dist/sea-prep.blob
 *   3. obtain the base node binary for the TARGET:
 *        - host target  → copy the running process.execPath
 *        - cross target → download the official nodejs.org tarball for that
 *          arch, verify its sha256 against the release's SHASUMS256.txt, and
 *          extract bin/node from it
 *   4. postject-inject the blob into that binary under NODE_SEA_BLOB, using the
 *      standard fuse sentinel; on macOS also pass --macho-segment-name NODE_SEA
 *
 * Cross-ARCH is supported on macOS (an arm64 runner can produce the
 * x86_64-apple-darwin sidecar); cross-PLATFORM is not — each OS still builds on
 * its matching runner. UNSIGNED (build spec decision 1): no Developer ID
 * codesign/notarization step; macOS binaries carry only the ad-hoc signature
 * the loader requires for a modified Mach-O.
 *
 * Usage:
 *   node scripts/build.mjs                          # produce dist/gkos-desktop-agent.cjs
 *   node scripts/build-sea.mjs                      # host arch
 *   node scripts/build-sea.mjs --target-arch x64    # cross (macOS arm64 host → Intel)
 *   node scripts/build-sea.mjs --target-arch x64 --node-version v22.20.0
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { assertSameSeaAssets, observedFile, writeSeaBuildInputs } from "./sea-build-inputs.mjs";
import {
  findExpectedSha256,
  nodeBinaryPathInTarball,
  nodeTarballName,
  nodeTarballUrl,
  outputName,
  parseArgs,
  planNodeSource,
  resolveCrossNodeVersion,
  resolveTarget,
  shasumsUrl,
} from "./sea-target.mjs";

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

/**
 * Drop the Mach-O code signature so postject can rewrite the binary; the
 * caller re-signs ad-hoc afterwards. `codesign` is arch-agnostic — an arm64
 * host operates on an x86_64 Mach-O with no Rosetta involved, which is what
 * makes the cross-arch build possible. Runs unconditionally: both a
 * downloaded official tarball binary and the host runner's own node install
 * carry a signature that injection invalidates, and postject does not sign
 * anything itself.
 */
function removeMachoSignature(filePath) {
  try {
    execFileSync("codesign", ["--remove-signature", filePath], { stdio: "inherit" });
    console.log(`removed Mach-O signature from ${filePath}`);
  } catch (err) {
    // `--remove-signature` can exit non-zero on an already-unsigned binary,
    // which is benign. Anything else is fatal: we must not hand postject a
    // binary we failed to unsign.
    let stillSigned = false;
    try {
      execFileSync("codesign", ["--verify", filePath], { stdio: "ignore" });
      stillSigned = true; // verifies ⇒ a valid signature is still attached
    } catch {
      stillSigned = false;
    }
    if (stillSigned) throw err;
    console.log(`no Mach-O signature to remove from ${filePath}`);
  }
}

/** Re-apply an ad-hoc signature after injection (required on modern macOS). */
function adhocSignMacho(filePath) {
  execFileSync("codesign", ["--sign", "-", "--force", filePath], { stdio: "inherit" });
  console.log(`ad-hoc signed ${filePath}`);
}

/** Download to a Buffer, failing loudly on any non-200. */
async function download(url) {
  console.log(`fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Fetch the official node build for a cross target, verify it against the
 * release's published SHASUMS256.txt, and extract bin/node.
 * No checksum match ⇒ no binary. There is no unverified fallback path.
 */
async function fetchCrossNodeBinary({ version, platform, arch, destPath }) {
  const tarName = nodeTarballName(version, platform, arch);
  const shasumsText = (await download(shasumsUrl(version))).toString("utf8");
  const tarball = await download(nodeTarballUrl(version, platform, arch));
  const expected = findExpectedSha256(shasumsText, tarName);
  const actual = createHash("sha256").update(tarball).digest("hex");
  if (actual !== expected) {
    throw new Error(
      `Checksum mismatch for ${tarName}\n  expected ${expected}\n  actual   ${actual}`,
    );
  }
  console.log(`sha256 verified for ${tarName}: ${actual}`);

  const work = mkdtempSync(join(tmpdir(), "gkos-sea-"));
  try {
    const tarPath = join(work, tarName);
    writeFileSync(tarPath, tarball);
    const member = nodeBinaryPathInTarball(version, platform, arch);
    execFileSync("tar", ["-xzf", tarPath, "-C", work, member], { stdio: "inherit" });
    copyFileSync(join(work, member), destPath);
    execFileSync("chmod", ["+x", destPath], { stdio: "inherit" });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return { tarball: tarName, sha256: actual, expectedSha256: expected,
    shasumsUrl: shasumsUrl(version), shasumsSha256: createHash("sha256").update(shasumsText).digest("hex") };
}

const { targetArch, nodeVersion } = parseArgs(process.argv.slice(2));
const targetPlatform = process.platform;
const source = planNodeSource(process.platform, process.arch, targetPlatform, targetArch);

const cjsEntry = resolve(dist, "gkos-desktop-agent.cjs");
if (!existsSync(cjsEntry)) {
  console.error(`missing ${cjsEntry} — run \`node scripts/build.mjs\` first.`);
  process.exit(1);
}

const target = resolveTarget(targetPlatform, targetArch);
const { macho } = target;
const outName = outputName(target);
const outPath = resolve(dist, outName);
const inventoryPath = resolve(dist, `${outName}.build-inputs.json`);
if (existsSync(inventoryPath)) throw new Error(`SEA build input inventory already exists: ${inventoryPath}`);
console.log(
  `SEA target: ${target.triple} (${source.mode} node) — host ${process.platform}/${process.arch}`,
);

const postjectCli = resolvePostject();
const packageInput = observedFile(resolve(root, "package.json"), "package.json");
const lockInput = observedFile(resolve(root, "package-lock.json"), "package-lock.json");
const buildScriptInput = observedFile(fileURLToPath(import.meta.url), "scripts/build-sea.mjs");
const nativeScriptInput = observedFile(resolve(root, "scripts/sea-native-assets.mjs"), "scripts/sea-native-assets.mjs");
const targetScriptInput = observedFile(resolve(root, "scripts/sea-target.mjs"), "scripts/sea-target.mjs");
const helperScriptInput = observedFile(resolve(root, "scripts/sea-build-inputs.mjs"), "scripts/sea-build-inputs.mjs");
const bundleInventoryInput = observedFile(resolve(root, "dist/bundle-inputs.json"), "dist/bundle-inputs.json");
const cjsInput = observedFile(cjsEntry, "dist/gkos-desktop-agent.cjs");
const bundleInventory = JSON.parse(readFileSync(resolve(root, "dist/bundle-inputs.json"), "utf8"));
const cjsRows = bundleInventory.artifacts?.filter(row => row.path === cjsInput.logicalName);
if (cjsRows?.length !== 1 || cjsRows[0].bytes !== cjsInput.bytes || cjsRows[0].sha256 !== cjsInput.sha256) {
  throw new Error("SEA desktop entry does not match bundle input inventory");
}
const initialAssets = retainedGuardSeaAssets(root, targetPlatform, targetArch);
const assetEntries = Object.entries(initialAssets).sort(([a], [b]) => a.localeCompare(b));
const assetInputs = assetEntries.map(([name, path]) => observedFile(path, `dist/native/${name}`));
if (targetPlatform === "win32") assetInputs.push(observedFile(resolve(root, "dist/native/retained-guard.json"), "dist/native/retained-guard.json"));
const postjectCliInput = observedFile(postjectCli, "tool/postject-cli.js");
const postjectPackagePath = require.resolve("postject/package.json");
const postjectPackageInput = observedFile(postjectPackagePath, "tool/postject-package.json");
const postjectPackage = JSON.parse(readFileSync(postjectPackagePath, "utf8"));
const hostBlobGeneratorExecutable = observedFile(process.execPath, "host-node-executable");

// 1. sea-config.json
const seaConfigPath = resolve(dist, "sea-config.json");
const blobPath = resolve(dist, "sea-prep.blob");
writeFileSync(
  seaConfigPath,
  JSON.stringify(
    {
      main: cjsEntry,
      assets: initialAssets,
      output: blobPath,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
    },
    null,
    2,
  ),
);
const configInput = observedFile(seaConfigPath, "dist/sea-config.json");

// 2. generate the blob
console.log("generating SEA blob…");
execFileSync(process.execPath, ["--experimental-sea-config", seaConfigPath], { stdio: "inherit" });
const blobInput = observedFile(blobPath, "dist/sea-prep.blob");

// 3. obtain the base node binary for the target
let downloadProvenance = null;
if (source.mode === "host") {
  console.log(`copying node binary → ${outName}`);
  copyFileSync(process.execPath, outPath);
} else {
  const crossVersion = resolveCrossNodeVersion(nodeVersion);
  console.log(`cross build: downloading node ${crossVersion} for ${targetPlatform}/${targetArch}`);
  downloadProvenance = await fetchCrossNodeBinary({
    version: crossVersion,
    platform: targetPlatform,
    arch: targetArch,
    destPath: outPath,
  });
}
const baseNodeInput = observedFile(outPath, "base-node-before-signature-removal");

// 3b. On Windows the official node.exe is signed; strip it so postject can
// find the fuse sentinel. On macOS, injection invalidates whatever signature
// the binary already carries — the host runner's own node install (host
// mode) and a freshly downloaded tarball binary (download mode) alike — so
// remove it unconditionally before injecting (codesign is arch-agnostic, so
// an arm64 host can unsign an x86_64 Mach-O) and re-sign ad-hoc afterward.
if (targetPlatform === "win32") {
  stripPeSignature(outPath);
} else if (macho) {
  removeMachoSignature(outPath);
}
const preInjectionInput = observedFile(outPath, "base-node-pre-injection");

// 4. postject inject
const fuse = detectFuse(outPath);
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

if (macho) {
  adhocSignMacho(outPath);
}

const observedInputs = [configInput, blobInput, packageInput, lockInput, buildScriptInput, nativeScriptInput,
  targetScriptInput, helperScriptInput, bundleInventoryInput, cjsInput, postjectCliInput, postjectPackageInput, hostBlobGeneratorExecutable, ...assetInputs];
const recheck = () => {
  const currentAssets = retainedGuardSeaAssets(root, targetPlatform, targetArch);
  assertSameSeaAssets(initialAssets, currentAssets);
  return { observedInputs: [
  observedFile(seaConfigPath, "dist/sea-config.json"), observedFile(blobPath, "dist/sea-prep.blob"),
  observedFile(resolve(root, "package.json"), "package.json"), observedFile(resolve(root, "package-lock.json"), "package-lock.json"),
  observedFile(fileURLToPath(import.meta.url), "scripts/build-sea.mjs"), observedFile(resolve(root, "scripts/sea-native-assets.mjs"), "scripts/sea-native-assets.mjs"),
  observedFile(resolve(root, "scripts/sea-target.mjs"), "scripts/sea-target.mjs"), observedFile(resolve(root, "scripts/sea-build-inputs.mjs"), "scripts/sea-build-inputs.mjs"),
  observedFile(resolve(root, "dist/bundle-inputs.json"), "dist/bundle-inputs.json"), observedFile(cjsEntry, "dist/gkos-desktop-agent.cjs"),
  observedFile(postjectCli, "tool/postject-cli.js"), observedFile(postjectPackagePath, "tool/postject-package.json"), observedFile(process.execPath, "host-node-executable"),
  ...assetInputs.map(item => observedFile(resolve(root, item.logicalName), item.logicalName)),
], finalExecutable: observedFile(outPath, `dist/${outName}`) };
};
writeSeaBuildInputs(inventoryPath, {
  target: target.triple, sourceMode: source.mode, hostBlobGeneratorNodeVersion: process.version,
  targetNodeVersion: source.mode === "host" ? process.version : resolveCrossNodeVersion(nodeVersion),
  postjectVersion: postjectPackage.version,
  downloadedChecksumProvenance: downloadProvenance,
  baseNodeBeforeSignatureRemoval: baseNodeInput, preInjectionBinary: preInjectionInput,
  finalExecutable: observedFile(outPath, `dist/${outName}`), observedInputs,
}, recheck);

const sizeMb = (statSync(outPath).size / (1024 * 1024)).toFixed(1);
console.log(`built ${outPath} (${sizeMb} MB)`);
