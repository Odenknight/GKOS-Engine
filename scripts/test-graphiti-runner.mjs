import { GRAPHITI_INGEST_SCRIPT } from "../dist/graphiti-adapter.mjs";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const prefix = join(tmpdir(), "gkos-graphiti-runner-");
const directory = mkdtempSync(prefix);
try {
  const script = join(directory, "graphiti-ingest.py");
  writeFileSync(script, GRAPHITI_INGEST_SCRIPT);
  const result = spawnSync(process.platform === "win32" ? "python" : "python3",
    ["scripts/test-graphiti-runner.py", script], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (!resolve(directory).startsWith(resolve(prefix))) throw new Error("Temporary path escaped its prefix");
  rmSync(directory, { recursive: true, force: true });
}
