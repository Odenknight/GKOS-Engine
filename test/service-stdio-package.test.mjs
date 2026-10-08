import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import test from "node:test";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CANONICAL_TEMPORARY_ROOT = realpathSync(tmpdir());

function resolveNpmCli(environment = process.env) {
  const candidates = [];
  if (environment.npm_execpath) candidates.push(environment.npm_execpath);
  const pathValue = environment.PATH ?? environment.Path ?? "";
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    if (process.platform === "win32") {
      if (existsSync(join(directory, "npm.cmd"))) candidates.push(join(directory, "node_modules", "npm", "bin", "npm-cli.js"));
    } else {
      const executable = join(directory, "npm");
      if (existsSync(executable)) {
        try { candidates.push(realpathSync(executable)); }
        catch { /* keep searching the bounded PATH inventory */ }
      }
    }
  }
  candidates.push(
    resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
  );
  const found = [...new Set(candidates.map((candidate) => resolve(candidate)))].find((candidate) => existsSync(candidate));
  if (!found) throw new Error("npm CLI not found in the current Node toolchain");
  return found;
}

test("npm CLI discovery works outside an npm lifecycle", () => {
  const npmCli = resolveNpmCli({ ...process.env, npm_execpath: undefined });
  assert.match(npmCli.replaceAll("\\", "/"), /\/npm(?:-cli\.js|\/bin\/npm-cli\.js)$/u);
});

test("packed installation runs the stdio bridge against one authenticated real process", { timeout: 90_000 }, async (t) => {
  const temporary = mkdtempSync(join(CANONICAL_TEMPORARY_ROOT, "gkos-stdio-package-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const npmCli = resolveNpmCli();
  // npm pack may run prepare even with ignore-scripts on some npm releases.
  // Build and pack a clean local clone so its dist recreation cannot race the
  // concurrently executing repository test processes.
  const source = join(temporary, "source");
  execFileSync("git", ["clone", "--quiet", "--shared", ROOT, source], { stdio: "pipe" });
  execFileSync(process.execPath, [npmCli, "ci", "--no-audit", "--no-fund"], { cwd: source, stdio: "pipe" });
  const packOutput = execFileSync(process.execPath, [npmCli, "pack", "--json", "--pack-destination", temporary], { cwd: source, encoding: "utf8" });
  const jsonStart = packOutput.indexOf("[");
  const jsonEnd = packOutput.lastIndexOf("]");
  assert.ok(jsonStart >= 0 && jsonEnd >= jsonStart, "npm pack did not emit its JSON report");
  const packReport = JSON.parse(packOutput.slice(jsonStart, jsonEnd + 1));
  const archive = join(temporary, packReport[0].filename);
  writeFileSync(join(temporary, "package.json"), '{"private":true}\n');
  execFileSync(process.execPath, [npmCli, "install", "--ignore-scripts", "--no-audit", "--no-fund", archive], { cwd: temporary, stdio: "pipe" });
  const launcher = join(temporary, "node_modules", "gkos-engine", "bin", "gkos-mcp-stdio.mjs");
  assert.match(readFileSync(launcher, "utf8"), /service-stdio\.mjs/);

  const token = "p".repeat(64);
  const tokenFile = join(temporary, "mcp.token");
  writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  if (process.platform !== "win32") chmodSync(tokenFile, 0o600);
  const session = "018f47a3-7b5e-7c9d-8a1b-123456789abf";
  const seen = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    seen.push({ method: request.method, authorization: request.headers.authorization, body });
    if (request.method === "DELETE") { response.writeHead(204); response.end(); return; }
    if (body.method === "initialize") {
      response.writeHead(200, { "content-type": "application/json", "mcp-session-id": session, "mcp-protocol-version": "2025-11-25" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-11-25", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "gkos-engine", version: "2.1.2" } } }));
    } else if (body.method === "notifications/initialized") { response.writeHead(202); response.end(); }
    else { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [] } })); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { if (server.listening) server.close(); });

  const child = spawn(process.execPath, [launcher], {
    cwd: temporary,
    env: { ...process.env, GKOS_MCP_TOKEN_FILE: tokenFile, GKOS_MCP_URL: `http://127.0.0.1:${server.address().port}/mcp` },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  child.stdin.end([
    JSON.stringify({ jsonrpc: "2.0", id: "init", method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "installed-fixture", version: "1" } } }),
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    JSON.stringify({ jsonrpc: "2.0", id: "list", method: "tools/list", params: {} }),
    "",
  ].join("\n"));
  const [code] = await once(child, "close");
  server.close();
  await once(server, "close");
  const out = Buffer.concat(stdout).toString("utf8");
  const err = Buffer.concat(stderr).toString("utf8");
  assert.equal(code, 0);
  assert.equal(err, "");
  assert.deepEqual(out.trim().split("\n").map(JSON.parse).map((message) => message.id), ["init", "list"]);
  assert.equal(seen.at(-1).method, "DELETE");
  assert.ok(seen.every((request) => request.authorization === `Bearer ${token}`));
  assert.equal(`${out}${err}`.includes(token), false);
});
