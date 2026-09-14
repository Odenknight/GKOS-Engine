import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");

/** Bind the Windows addon to the exact JavaScript bundle being embedded. */
export function retainedGuardSeaAssets(root, platform, arch) {
  if (platform !== "win32") return {};
  const fail = () => { throw new Error("SEA retained guard binding is invalid"); };
  const guard = JSON.parse(readFileSync(resolve(root, "dist/native/retained-guard.json"), "utf8"));
  const inventory = JSON.parse(readFileSync(resolve(root, "dist/bundle-inputs.json"), "utf8"));
  if (arch !== "x64" || guard.platform !== platform || guard.arch !== arch || guard.schemaVersion !== 1 ||
      guard.nodeApiVersion !== 8 || !/^[0-9a-f]{64}$/.test(guard.sha256) ||
      guard.filename !== `retained-guard-${guard.sha256}.node` || inventory.schemaVersion !== 1 ||
      inventory.retainedGuardSha256 !== guard.sha256 ||
      guard.sourceSha256 !== sha(readFileSync(resolve(root, "native/windows/retained-guard.cpp")))) fail();
  const entry = readFileSync(resolve(root, "dist/gkos-desktop-agent.cjs"));
  const artifacts = inventory.artifacts?.filter(row => row.path === "dist/gkos-desktop-agent.cjs");
  if (artifacts?.length !== 1 || artifacts[0].sha256 !== sha(entry) || artifacts[0].bytes !== entry.length) fail();
  const path = resolve(root, "dist/native", guard.filename), state = lstatSync(path);
  if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1 || sha(readFileSync(path)) !== guard.sha256) fail();
  return { [guard.filename]: path };
}
