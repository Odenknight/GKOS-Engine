/**
 * Pure helpers for the SEA build (scripts/build-sea.mjs).
 *
 * Everything here is side-effect free and network free so it can be unit
 * tested without a runner, a download, or a matching host architecture.
 * build-sea.mjs owns all I/O; this module owns all decisions.
 */

/** Architectures we accept on the command line. */
export const SUPPORTED_ARCHES = ["x64", "arm64"];

/**
 * Parse `scripts/build-sea.mjs` arguments.
 *
 *   --target-arch x64|arm64   build for this arch instead of the host's
 *   --node-version <v>        exact Node version to download for a cross
 *                             build (default: the running node's exact
 *                             version — see resolveCrossNodeVersion)
 *
 * `--flag value` and `--flag=value` are both accepted. Unknown flags are a
 * hard error: a typo must never silently degrade into a host-arch build that
 * then publishes under the wrong asset name.
 */
export function parseArgs(argv, hostArch = process.arch) {
  const out = { targetArch: hostArch, nodeVersion: null };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) throw new Error(`Unexpected positional argument: ${raw}`);
    const eq = raw.indexOf("=");
    const name = eq === -1 ? raw : raw.slice(0, eq);
    const inlineValue = eq === -1 ? null : raw.slice(eq + 1);
    const takeValue = () => {
      if (inlineValue !== null) return inlineValue;
      const next = argv[++i];
      if (next === undefined) throw new Error(`Missing value for ${name}`);
      return next;
    };
    switch (name) {
      case "--target-arch": {
        const value = takeValue();
        if (!SUPPORTED_ARCHES.includes(value)) {
          throw new Error(
            `Unsupported --target-arch "${value}" (expected one of: ${SUPPORTED_ARCHES.join(", ")})`,
          );
        }
        out.targetArch = value;
        break;
      }
      case "--node-version": {
        out.nodeVersion = normalizeNodeVersion(takeValue());
        break;
      }
      default:
        throw new Error(`Unknown argument: ${name}`);
    }
  }
  return out;
}

/** Accept `22.20.0` or `v22.20.0`; return the canonical `v`-prefixed form. */
export function normalizeNodeVersion(version) {
  const v = String(version).trim();
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`Malformed Node version: ${version} (expected v<major>.<minor>.<patch>)`);
  return `v${m[1]}.${m[2]}.${m[3]}`;
}

/** Map a target platform/arch → { triple, exeSuffix, macho }. */
export function resolveTarget(platform, arch) {
  if (platform === "win32") {
    if (arch !== "x64") throw new Error(`Unsupported Windows SEA arch: ${arch}`);
    return { triple: "x86_64-pc-windows-msvc", exeSuffix: ".exe", macho: false };
  }
  if (platform === "darwin") {
    return {
      triple: arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin",
      exeSuffix: "",
      macho: true,
    };
  }
  if (platform === "linux") {
    // Not a shipped target (v1 non-goal), but keep the script runnable locally.
    return {
      triple: arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu",
      exeSuffix: "",
      macho: false,
    };
  }
  throw new Error(`Unsupported platform for SEA: ${platform}/${arch}`);
}

/** Output file name for a resolved target. */
export function outputName({ triple, exeSuffix }) {
  return `kosmos-agent-${triple}${exeSuffix}`;
}

/**
 * Which Node version to download for a cross build.
 *
 * Default: the EXACT version of the running node. The SEA blob is produced by
 * the host node and injected into the downloaded binary, and blob layout is
 * version-specific — pinning to a hardcoded constant that drifts away from the
 * runner's node would produce a binary that is byte-valid but broken at
 * startup. Deriving the pin from the host makes the pair provably matched, and
 * the resulting version is echoed in the build log and checksum-verified.
 * `--node-version` allows an explicit override for a reproducibility replay.
 */
export function resolveCrossNodeVersion(requested, runningVersion = process.version) {
  return requested ? normalizeNodeVersion(requested) : normalizeNodeVersion(runningVersion);
}

/** `node-v22.20.0-darwin-x64` — the tarball's top-level directory name too. */
export function nodeDistBaseName(version, platform, arch) {
  const os = { darwin: "darwin", linux: "linux" }[platform];
  if (!os) throw new Error(`No Node dist tarball layout for platform: ${platform}`);
  if (!SUPPORTED_ARCHES.includes(arch)) throw new Error(`No Node dist build for arch: ${arch}`);
  return `${normalizeNodeVersion(version)}-${os}-${arch}`.replace(/^v/, "node-v");
}

/** `node-v22.20.0-darwin-x64.tar.gz` */
export function nodeTarballName(version, platform, arch) {
  return `${nodeDistBaseName(version, platform, arch)}.tar.gz`;
}

/** Path of the node executable inside the extracted tarball. */
export function nodeBinaryPathInTarball(version, platform, arch) {
  return `${nodeDistBaseName(version, platform, arch)}/bin/node`;
}

export const NODE_DIST_BASE_URL = "https://nodejs.org/dist";

/** Download URL of the target tarball. */
export function nodeTarballUrl(version, platform, arch, base = NODE_DIST_BASE_URL) {
  return `${base}/${normalizeNodeVersion(version)}/${nodeTarballName(version, platform, arch)}`;
}

/** Download URL of the release's SHASUMS256.txt (same dist dir as the tarball). */
export function shasumsUrl(version, base = NODE_DIST_BASE_URL) {
  return `${base}/${normalizeNodeVersion(version)}/SHASUMS256.txt`;
}

/**
 * Extract the expected sha256 for `fileName` from a SHASUMS256.txt body.
 *
 * Format is `<64 hex>  <filename>` per line. A missing entry is an error, not
 * a skip: an unverifiable download must never be injected into a shipped
 * binary.
 */
export function findExpectedSha256(shasumsText, fileName) {
  for (const line of String(shasumsText).split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(\S+)$/.exec(line.trim());
    if (m && m[2] === fileName) return m[1];
  }
  throw new Error(`No SHASUMS256 entry for ${fileName} — refusing to use an unverified binary.`);
}

/**
 * Decide how to obtain the base node binary for a target.
 *  - "host": target matches the running process; copy process.execPath.
 *  - "download": cross build; fetch + verify the official target tarball.
 * Cross-building a darwin target requires a darwin host because the Mach-O
 * signature handling below shells out to `codesign`.
 */
export function planNodeSource(hostPlatform, hostArch, targetPlatform, targetArch) {
  if (hostPlatform === targetPlatform && hostArch === targetArch) return { mode: "host" };
  if (hostPlatform !== targetPlatform) {
    throw new Error(
      `Cross-platform SEA is not supported (host ${hostPlatform}, target ${targetPlatform}); ` +
        `build each OS on its matching runner.`,
    );
  }
  if (targetPlatform !== "darwin") {
    throw new Error(
      `Cross-arch SEA is only supported on macOS (asked for ${targetPlatform}/${targetArch} ` +
        `on a ${hostArch} host); build that target on a matching runner.`,
    );
  }
  return { mode: "download" };
}
