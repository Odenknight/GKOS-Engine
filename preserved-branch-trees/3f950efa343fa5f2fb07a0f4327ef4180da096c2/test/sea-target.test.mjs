import test from "node:test";
import assert from "node:assert/strict";

import {
  findExpectedSha256,
  nodeBinaryPathInTarball,
  nodeDistBaseName,
  nodeTarballName,
  nodeTarballUrl,
  normalizeNodeVersion,
  outputName,
  parseArgs,
  planNodeSource,
  resolveCrossNodeVersion,
  resolveTarget,
  shasumsUrl,
} from "../scripts/sea-target.mjs";

test("parseArgs defaults to the host arch when no flags are given", () => {
  assert.deepEqual(parseArgs([], "arm64"), { targetArch: "arm64", nodeVersion: null });
  assert.deepEqual(parseArgs([], "x64"), { targetArch: "x64", nodeVersion: null });
});

test("parseArgs accepts --target-arch in both spaced and = forms", () => {
  assert.equal(parseArgs(["--target-arch", "x64"], "arm64").targetArch, "x64");
  assert.equal(parseArgs(["--target-arch=x64"], "arm64").targetArch, "x64");
  assert.equal(parseArgs(["--target-arch=arm64"], "x64").targetArch, "arm64");
});

test("parseArgs accepts an explicit --node-version and canonicalises it", () => {
  assert.equal(parseArgs(["--node-version", "22.20.0"]).nodeVersion, "v22.20.0");
  assert.equal(parseArgs(["--node-version=v22.20.0"]).nodeVersion, "v22.20.0");
});

test("parseArgs rejects unknown flags, bad arches, positionals and missing values", () => {
  assert.throws(() => parseArgs(["--target-arch", "ppc64"]), /Unsupported --target-arch/);
  assert.throws(() => parseArgs(["--target-os", "linux"]), /Unknown argument/);
  assert.throws(() => parseArgs(["x64"]), /Unexpected positional/);
  assert.throws(() => parseArgs(["--target-arch"]), /Missing value/);
  assert.throws(() => parseArgs(["--node-version", "22"]), /Malformed Node version/);
});

test("normalizeNodeVersion canonicalises and rejects junk", () => {
  assert.equal(normalizeNodeVersion("v24.18.0"), "v24.18.0");
  assert.equal(normalizeNodeVersion(" 24.18.0 "), "v24.18.0");
  assert.throws(() => normalizeNodeVersion("latest"), /Malformed Node version/);
  assert.throws(() => normalizeNodeVersion("22.20"), /Malformed Node version/);
});

test("resolveTarget maps platform/arch to the shipped triples", () => {
  assert.deepEqual(resolveTarget("darwin", "arm64"), {
    triple: "aarch64-apple-darwin",
    exeSuffix: "",
    macho: true,
  });
  assert.deepEqual(resolveTarget("darwin", "x64"), {
    triple: "x86_64-apple-darwin",
    exeSuffix: "",
    macho: true,
  });
  assert.deepEqual(resolveTarget("win32", "x64"), {
    triple: "x86_64-pc-windows-msvc",
    exeSuffix: ".exe",
    macho: false,
  });
  assert.throws(() => resolveTarget("aix", "x64"), /Unsupported platform/);
});

test("outputName produces the exact release asset names the desktop build expects", () => {
  assert.equal(outputName(resolveTarget("darwin", "x64")), "gkos-agent-x86_64-apple-darwin");
  assert.equal(outputName(resolveTarget("darwin", "arm64")), "gkos-agent-aarch64-apple-darwin");
  assert.equal(
    outputName(resolveTarget("win32", "x64")),
    "gkos-agent-x86_64-pc-windows-msvc.exe",
  );
});

test("resolveCrossNodeVersion pins to the running node unless overridden", () => {
  assert.equal(resolveCrossNodeVersion(null, "v22.20.0"), "v22.20.0");
  assert.equal(resolveCrossNodeVersion("v24.18.0", "v22.20.0"), "v24.18.0");
});

test("node dist names and URLs are built for the target, not the host", () => {
  assert.equal(nodeDistBaseName("v22.20.0", "darwin", "x64"), "node-v22.20.0-darwin-x64");
  assert.equal(nodeTarballName("22.20.0", "darwin", "x64"), "node-v22.20.0-darwin-x64.tar.gz");
  assert.equal(
    nodeBinaryPathInTarball("v22.20.0", "darwin", "x64"),
    "node-v22.20.0-darwin-x64/bin/node",
  );
  assert.equal(
    nodeTarballUrl("v22.20.0", "darwin", "x64"),
    "https://nodejs.org/dist/v22.20.0/node-v22.20.0-darwin-x64.tar.gz",
  );
  assert.equal(shasumsUrl("v22.20.0"), "https://nodejs.org/dist/v22.20.0/SHASUMS256.txt");
  // The checksum file must come from the same dist directory as the tarball.
  assert.equal(
    shasumsUrl("v22.20.0").replace(/\/SHASUMS256\.txt$/, ""),
    nodeTarballUrl("v22.20.0", "darwin", "x64").replace(/\/[^/]+$/, ""),
  );
  assert.throws(() => nodeTarballName("v22.20.0", "win32", "x64"), /No Node dist tarball layout/);
});

const SHASUMS_SAMPLE = [
  "1111111111111111111111111111111111111111111111111111111111111111  node-v22.20.0-darwin-arm64.tar.gz",
  "2222222222222222222222222222222222222222222222222222222222222222  node-v22.20.0-darwin-x64.tar.gz",
  "3333333333333333333333333333333333333333333333333333333333333333  node-v22.20.0-linux-x64.tar.gz",
  "",
].join("\n");

test("findExpectedSha256 selects the exact target entry", () => {
  assert.equal(
    findExpectedSha256(SHASUMS_SAMPLE, "node-v22.20.0-darwin-x64.tar.gz"),
    "2222222222222222222222222222222222222222222222222222222222222222",
  );
  assert.equal(
    findExpectedSha256(SHASUMS_SAMPLE, "node-v22.20.0-darwin-arm64.tar.gz"),
    "1111111111111111111111111111111111111111111111111111111111111111",
  );
});

test("findExpectedSha256 refuses anything it cannot verify", () => {
  assert.throws(
    () => findExpectedSha256(SHASUMS_SAMPLE, "node-v22.20.0-darwin-riscv.tar.gz"),
    /refusing to use an unverified binary/,
  );
  // A prefix of a real name must not match, and a truncated hash must not pass.
  assert.throws(() => findExpectedSha256(SHASUMS_SAMPLE, "node-v22.20.0-darwin-x64"), /No SHASUMS/);
  assert.throws(() => findExpectedSha256("abc  node-x.tar.gz", "node-x.tar.gz"), /No SHASUMS/);
});

test("planNodeSource copies the host binary only for an exact host match", () => {
  assert.deepEqual(planNodeSource("darwin", "arm64", "darwin", "arm64"), { mode: "host" });
  assert.deepEqual(planNodeSource("win32", "x64", "win32", "x64"), { mode: "host" });
});

test("planNodeSource downloads for a cross-arch macOS build", () => {
  assert.deepEqual(planNodeSource("darwin", "arm64", "darwin", "x64"), { mode: "download" });
});

test("planNodeSource refuses cross-arch builds off macOS", () => {
  assert.throws(
    () => planNodeSource("win32", "x64", "win32", "arm64"),
    /Cross-arch SEA is only supported on macOS/,
  );
  assert.throws(
    () => planNodeSource("linux", "arm64", "linux", "x64"),
    /Cross-arch SEA is only supported on macOS/,
  );
});

test("planNodeSource refuses cross-platform builds", () => {
  assert.throws(
    () => planNodeSource("win32", "x64", "darwin", "x64"),
    /Cross-platform SEA is not supported/,
  );
  assert.throws(
    () => planNodeSource("linux", "x64", "darwin", "arm64"),
    /Cross-platform SEA is not supported/,
  );
});
