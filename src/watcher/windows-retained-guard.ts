import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { getAsset, isSea } from "node:sea";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalPathSync, sameCanonicalPath } from "../retrieval/path-security";

// Replaced by the build after compiling the native component. No environment
// variable or runtime manifest can select executable bytes for this loader.
declare const GKOS_RETAINED_GUARD_SHA256: string;
type NativeGuard = { withReadGuards<T>(paths: readonly string[], callback: () => T): T };
let loaded: NativeGuard | undefined;
let extractedPath: string | undefined;

function loadGuard(): NativeGuard {
  if (loaded) return loaded;
  const digest = GKOS_RETAINED_GUARD_SHA256;
  if (process.arch !== "x64" || !/^[0-9a-f]{64}$/.test(digest)) {
    throw new Error("GKX_WATCHER_NATIVE_GUARD_UNAVAILABLE");
  }
  const moduleFile = typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url);
  const filename = `retained-guard-${digest}.node`;
  let path = join(dirname(moduleFile), "native", filename);
  if (isSea()) {
    if (!extractedPath) {
      const bytes = Buffer.from(getAsset(filename));
      if (createHash("sha256").update(bytes).digest("hex") !== digest) {
        throw new Error("GKX_WATCHER_NATIVE_GUARD_UNAVAILABLE");
      }
      // Windows keeps a loaded DLL mapped until process exit. Retain this
      // process-private temporary package for OS/user temporary-file cleanup;
      // do not attempt to unlink a mapped module or reuse another run's file.
      const directory = mkdtempSync(join(tmpdir(), "gkos-retained-guard-"));
      const destination = join(directory, filename);
      writeFileSync(destination, bytes, { flag: "wx", mode: 0o600 });
      extractedPath = destination;
    }
    path = extractedPath;
  }
  const state = lstatSync(path);
  if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1 ||
      !sameCanonicalPath(canonicalPathSync(path, { alias_error: "GKX_WATCHER_NATIVE_GUARD_UNAVAILABLE" }), path) ||
      createHash("sha256").update(readFileSync(path)).digest("hex") !== digest) {
    throw new Error("GKX_WATCHER_NATIVE_GUARD_UNAVAILABLE");
  }
  // Installation files are trusted host code. This byte binding is not an
  // authorization boundary against a writer controlling the installation.
  const nativeModule = { exports: {} as NativeGuard };
  process.dlopen(nativeModule, path);
  if (typeof nativeModule.exports.withReadGuards !== "function") {
    throw new Error("GKX_WATCHER_NATIVE_GUARD_UNAVAILABLE");
  }
  loaded = nativeModule.exports;
  return loaded;
}

export function withWindowsRetainedGuards<T>(paths: readonly string[], callback: () => T): T {
  if (process.platform !== "win32") return callback();
  let guard: NativeGuard;
  try { guard = loadGuard(); }
  catch (cause) { throw new Error("GKX_WATCHER_NATIVE_GUARD_UNAVAILABLE", { cause }); }
  return guard.withReadGuards(paths, callback);
}
