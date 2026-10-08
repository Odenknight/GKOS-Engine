import { spawnSync } from "node:child_process";
import { delimiter, resolve } from "node:path";

const source = resolve("services/gkos-intelligence/src");
const pythonPath = [source, process.env.PYTHONPATH].filter(Boolean).join(delimiter);
const result = spawnSync("python", ["-m", "unittest", "discover", "-s", "services/gkos-intelligence/tests", "-v"], {
  stdio: "inherit",
  env: { ...process.env, PYTHONPATH: pythonPath },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
