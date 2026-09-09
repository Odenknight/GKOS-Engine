import { promisify } from "node:util";
import { rm } from "node:fs/promises";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
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

const execFileAsync = promisify(execFile);
async function setupPhase(t, phase, executable, args, options = {}, onChild) {
  assert.match(phase, /^[a-z_]+$/u);
  const start = performance.now();
  t.diagnostic(JSON.stringify({ phase, status: "START" }));
  try {
    const pending = execFileAsync(executable, args, { ...options, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true, signal: t.signal });
    onChild?.(pending.child);
    const result = await pending;
    t.diagnostic(JSON.stringify({ phase, status: "PASS", elapsed_ms: performance.now() - start }));
    return result.stdout;
  } catch {
    t.diagnostic(JSON.stringify({ phase, status: "FAIL", elapsed_ms: performance.now() - start }));
    throw new Error("PACKAGE_QUALIFICATION_" + phase.toUpperCase() + "_FAILED");
  }
}
function packedFilename(output) {
  const start = output.search(/^[ \t]*[\[{]/mu);
  assert.ok(start >= 0, "npm pack did not emit its JSON report");
  const report = JSON.parse(output.slice(start));
  if (Array.isArray(report)) assert.equal(report.length, 1);
  const entry = Array.isArray(report) ? report[0] : report;
  assert.match(entry?.filename ?? "", /^gkos-engine-[0-9][A-Za-z0-9.+-]*\.tgz$/u);
  return entry.filename;
}
test("package setup cancellation terminates the spawned process", async () => {
  const controller = new AbortController(); let closed;
  const pending = setupPhase({ signal: controller.signal, diagnostic() {} }, "abort_probe", process.execPath,
    ["-e", "setInterval(() => {}, 1000)"], {}, child => {
      closed = new Promise(resolveClose => child.once("close", resolveClose));
      child.once("spawn", () => controller.abort());
    });
  await assert.rejects(pending, { message: "PACKAGE_QUALIFICATION_ABORT_PROBE_FAILED" });
  await closed;
});
test("npm pack JSON accepts one array or object report and refuses unsafe filenames", () => {
  for (const value of [{ filename: "gkos-engine-2.2.0.tgz" }, [{ filename: "gkos-engine-2.2.0.tgz" }]]) {
    assert.equal(packedFilename(JSON.stringify(value)), "gkos-engine-2.2.0.tgz");
  }
  for (const value of [[], [{ filename: "a.tgz" }, { filename: "b.tgz" }], { filename: "../outside.tgz" }]) {
    assert.throws(() => packedFilename(JSON.stringify(value)));
  }
});

test("npm CLI discovery works outside an npm lifecycle", () => {
  const npmCli = resolveNpmCli({ ...process.env, npm_execpath: undefined });
  assert.match(npmCli.replaceAll("\\", "/"), /\/npm(?:-cli\.js|\/bin\/npm-cli\.js)$/u);
});

// A clean clone, install, pack, reinstall, and authenticated process round-trip
// can exceed 90 seconds on a saturated hosted Windows runner. Keep a finite
// per-test ceiling while leaving headroom below the runtime job's outer bound.
test("packed installation runs the stdio bridge against one authenticated real process", { timeout: 180_000 }, async (t) => {
  const temporary = mkdtempSync(join(CANONICAL_TEMPORARY_ROOT, "gkos-stdio-package-"));
  let server, child, bridgeClosed;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) child.kill();
    if (bridgeClosed) await bridgeClosed;
    if (server) {
      server.closeAllConnections();
      await new Promise(resolveClose => server.close(() => resolveClose()));
    }
    assert.ok(resolve(temporary).startsWith(CANONICAL_TEMPORARY_ROOT + (process.platform === "win32" ? "\\" : "/")));
    await rm(temporary, { recursive: true, force: true });
  });
  const npmCli = resolveNpmCli();
  // Build once in an isolated clean clone. Every setup subprocess observes
  // the unchanged test deadline, rather than blocking timeout delivery.
  const source = join(temporary, "source");
  await setupPhase(t, "clone", "git", ["clone", "--quiet", "--shared", ROOT, source]);
  await setupPhase(t, "install_source", process.execPath, [npmCli, "ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: source });
  await setupPhase(t, "build_source", process.execPath, ["scripts/build.mjs"], { cwd: source });
  const packOutput = await setupPhase(t, "pack", process.execPath, [npmCli, "pack", "--ignore-scripts", "--json", "--pack-destination", temporary], { cwd: source });
  const archive = join(temporary, packedFilename(packOutput));
  writeFileSync(join(temporary, "package.json"), '{"private":true}\n');
  await setupPhase(t, "install_consumer", process.execPath, [npmCli, "install", "--ignore-scripts", "--no-audit", "--no-fund", archive], { cwd: temporary });
  const launcher = join(temporary, "node_modules", "gkos-engine", "bin", "gkos-mcp-stdio.mjs");
  assert.match(readFileSync(launcher, "utf8"), /service-stdio\.mjs/);

  const token = "p".repeat(64);
  const tokenFile = join(temporary, "mcp.token");
  writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  if (process.platform !== "win32") chmodSync(tokenFile, 0o600);
  const session = "018f47a3-7b5e-7c9d-8a1b-123456789abf";
  const seen = [];
  server = http.createServer(async (request, response) => {
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
  await once(server, "listening", { signal: t.signal });

  child = spawn(process.execPath, [launcher], {
    cwd: temporary,
    env: { ...process.env, GKOS_MCP_TOKEN_FILE: tokenFile, GKOS_MCP_URL: `http://127.0.0.1:${server.address().port}/mcp` },
    stdio: ["pipe", "pipe", "pipe"],
    signal: t.signal,
    windowsHide: true,
  });
  bridgeClosed = new Promise(resolveClose => child.once("close", code => resolveClose(code)));
  child.on("error", () => {}); // Abort is reported by the unchanged test deadline.
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
  const code = await bridgeClosed;
  await new Promise(resolveClose => server.close(() => resolveClose()));
  const out = Buffer.concat(stdout).toString("utf8");
  const err = Buffer.concat(stderr).toString("utf8");
  assert.equal(code, 0);
  assert.equal(err, "");
  assert.deepEqual(out.trim().split("\n").map(JSON.parse).map((message) => message.id), ["init", "list"]);
  assert.equal(seen.at(-1).method, "DELETE");
  assert.ok(seen.every((request) => request.authorization === `Bearer ${token}`));
  assert.equal(`${out}${err}`.includes(token), false);
});
