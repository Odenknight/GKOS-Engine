import { execFileSync } from "node:child_process";

const raw = execFileSync(
  process.execPath,
  [process.env.npm_execpath, "pack", "--dry-run", "--json"],
  {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: { ...process.env, npm_config_ignore_scripts: "true" },
  },
);
const jsonStart = raw.indexOf("[");
const jsonEnd = raw.lastIndexOf("]");
if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error(`npm pack did not return JSON:\n${raw}`);
const report = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))[0];
const files = report.files.map((entry) => entry.path);
const forbidden = files.filter((file) =>
  /(?:^|\/)(?:gkos-agent-[^/]+|sea-config\.json|sea-prep\.blob)$/.test(file),
);
if (forbidden.length) {
  throw new Error(`npm package contains platform-specific SEA artifacts:\n${forbidden.join("\n")}`);
}
for (const required of [
  "dist/gkos-engine.mjs",
  "dist/adapter.mjs",
  "dist/gkx.mjs",
  "dist/graphiti-adapter.mjs",
  "dist/gkos-desktop-agent.mjs",
  "services/gkos-intelligence/pyproject.toml",
  "services/gkos-intelligence/src/gkos_intelligence/server.py",
]) {
  if (!files.includes(required)) throw new Error(`npm package is missing ${required}`);
}
console.log(`package contents verified: ${files.length} files, ${report.size} bytes`);
