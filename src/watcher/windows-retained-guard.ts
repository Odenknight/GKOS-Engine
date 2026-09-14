import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalPathSync, sameCanonicalPath } from "../retrieval/path-security";

// Replaced by the build after compiling the native component. No environment
// variable or runtime manifest can select executable bytes for this loader.
declare const GKOS_RETAINED_GUARD_SHA256: string;
type NativeGuard = { withReadGuards<T>(paths: readonly string[], callback: () => T): T };
let loaded: NativeGuard | undefined;

function loadGuard(): NativeGuard {
  if (loaded) return loaded;
  const digest = GKOS_RETAINED_GUARD_SHA256;
  if (process.arch !== "x64" || !/^[0-9a-f]{64}$/.test(digest)) {
    throw new Error("GKX_WATCHER_NATIVE_GUARD_UNAVAILABLE");
  }
  const moduleFile = typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url);
  const path = join(dirname(moduleFile), "native", `retained-guard-${digest}.node`);
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
