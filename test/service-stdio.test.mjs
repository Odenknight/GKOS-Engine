import assert from "node:assert/strict";
import { once } from "node:events";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { PassThrough, Writable } from "node:stream";
import { after, test } from "node:test";
import { build } from "esbuild";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const canonicalTemporaryRoot = realpathSync(tmpdir());
const bundleRoot = mkdtempSync(join(canonicalTemporaryRoot, "gkos-stdio-test-"));
const bundlePath = join(bundleRoot, "service-stdio.mjs");
const bundled = await build({
  entryPoints: [resolve(root, "src/service/stdio.ts")], bundle: true, write: false,
  format: "esm", platform: "node", target: "node22", logLevel: "silent",
});
writeFileSync(bundlePath, bundled.outputFiles[0].contents);
const bridge = await import(`${pathToFileURL(bundlePath).href}?test=${Date.now()}`);
after(() => rmSync(bundleRoot, { recursive: true, force: true }));

function privateTokenFile(token = "a".repeat(64)) {
  const directory = mkdtempSync(join(canonicalTemporaryRoot, "gkos-stdio-token-"));
  if (process.platform !== "win32") chmodSync(directory, 0o700);
  const file = join(directory, "desktop-agent.mcp.token");
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  if (process.platform !== "win32") chmodSync(file, 0o600);
  return { directory, file, token };
}

async function startServer(handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

async function closeServer(server) {
  server.close();
  await once(server, "close");
}

async function run(inputText, tokenFile, endpoint) {
  const input = new PassThrough();
  const output = new PassThrough();
  const diagnostics = new PassThrough();
  const outputChunks = [];
  const diagnosticChunks = [];
  output.on("data", (chunk) => outputChunks.push(Buffer.from(chunk)));
  diagnostics.on("data", (chunk) => diagnosticChunks.push(Buffer.from(chunk)));
  input.end(inputText);
  const code = await bridge.runStdioBridge({
    input, output, diagnostics, signals: null,
    environment: { GKOS_MCP_TOKEN_FILE: tokenFile, GKOS_MCP_URL: endpoint },
  });
  return {
    code,
    stdout: Buffer.concat(outputChunks).toString("utf8"),
    stderr: Buffer.concat(diagnosticChunks).toString("utf8"),
  };
}

function messages(count = 1) {
  const rows = [
    { jsonrpc: "2.0", id: "init", method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "fixture", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
  ];
  for (let index = 0; index < count; index++) rows.push({ jsonrpc: "2.0", id: `call-${index}`, method: "tools/list", params: {} });
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

test("endpoint and token handoff fail closed without raw credential channels", async () => {
  assert.equal(bridge.validateMcpEndpoint(undefined), "http://127.0.0.1:4814/mcp");
  assert.equal(bridge.validateMcpEndpoint("http://127.0.0.1:4914/mcp"), "http://127.0.0.1:4914/mcp");
  for (const value of [
    "https://127.0.0.1:4814/mcp", "http://localhost:4814/mcp", "http://[::1]:4814/mcp",
    "http://127.0.0.1:4814/", "http://127.0.0.1:4814/mcp?token=x",
    "http://user:secret@127.0.0.1:4814/mcp", "http://127.0.0.1:4814/mcp#fragment",
  ]) assert.throws(() => bridge.validateMcpEndpoint(value), /GKOS_STDIO_ENDPOINT_INVALID/);

  const input = new PassThrough(); input.end();
  const diagnostics = new PassThrough(); const chunks = [];
  diagnostics.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const code = await bridge.runStdioBridge({
    input, output: new PassThrough(), diagnostics, signals: null,
    environment: { GKOS_MCP_TOKEN: "s".repeat(64), GKOS_MCP_TOKEN_FILE: "ignored" },
  });
  assert.equal(code, 2);
  assert.equal(Buffer.concat(chunks).toString("utf8"), "gkos-mcp-stdio: configuration rejected\n");
  assert.equal(Buffer.concat(chunks).includes(Buffer.from("s".repeat(32))), false);
});

test("byte LF framer handles chunk boundaries and rejects an oversized frame", async () => {
  async function* split() { yield Buffer.from('{"a":1}\r'); yield Buffer.from('\n{"b":2}\n'); }
  const frames = [];
  for await (const frame of bridge.readStdioFrames(split())) frames.push(frame.toString("utf8"));
  assert.deepEqual(frames, ['{"a":1}', '{"b":2}']);
  async function* huge() { yield Buffer.alloc(bridge.STDIO_REQUEST_BYTES + 1, 0x61); }
  await assert.rejects(async () => { for await (const _ of bridge.readStdioFrames(huge())) void _; }, /GKOS_STDIO_FRAME_TOO_LARGE/);
});

test("bridge preserves one authenticated session, emits JSON only, and DELETEs on EOF", async (t) => {
  const credential = privateTokenFile();
  t.after(() => rmSync(credential.directory, { recursive: true, force: true }));
  const seen = [];
  const session = "018f47a3-7b5e-7c9d-8a1b-123456789abc";
  const server = await startServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    seen.push({ method: request.method, headers: request.headers, body });
    assert.equal(request.headers.authorization, `Bearer ${credential.token}`);
    if (request.method === "DELETE") { response.writeHead(204); response.end(); return; }
    if (body.method === "initialize") {
      response.writeHead(200, { "content-type": "application/json", "mcp-session-id": session, "mcp-protocol-version": "2025-11-25" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-11-25", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "gkos-engine", version: "2.1.2" } } }));
    } else if (body.method === "notifications/initialized") { response.writeHead(202); response.end(); }
    else {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [] } }));
    }
  });
  t.after(() => { if (server.listening) server.close(); });
  const endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
  const result = await run(messages(), credential.file, endpoint);
  await closeServer(server);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  const lines = result.stdout.trim().split("\n").map(JSON.parse);
  assert.deepEqual(lines.map((item) => item.id), ["init", "call-0"]);
  assert.equal(seen.length, 4);
  for (const request of seen.slice(1)) {
    assert.equal(request.headers["mcp-session-id"], session);
    assert.equal(request.headers["mcp-protocol-version"], "2025-11-25");
  }
  assert.equal(seen.at(-1).method, "DELETE");
  assert.equal(`${result.stdout}${result.stderr}`.includes(credential.token), false);
});

test("post-initialize forwarding is bounded to four in-flight requests", async (t) => {
  const credential = privateTokenFile("b".repeat(64));
  t.after(() => rmSync(credential.directory, { recursive: true, force: true }));
  const session = "018f47a3-7b5e-7c9d-8a1b-123456789abd";
  let active = 0;
  let maximum = 0;
  const server = await startServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    if (request.method === "DELETE") { response.writeHead(204); response.end(); return; }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body.method === "initialize") {
      response.writeHead(200, { "content-type": "application/json", "mcp-session-id": session, "mcp-protocol-version": "2025-11-25" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-11-25", capabilities: {}, serverInfo: { name: "gkos-engine", version: "2.1.2" } } }));
      return;
    }
    if (body.method === "notifications/initialized") { response.writeHead(202); response.end(); return; }
    active += 1; maximum = Math.max(maximum, active);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
    active -= 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }));
  });
  t.after(() => { if (server.listening) server.close(); });
  const result = await run(messages(9), credential.file, `http://127.0.0.1:${server.address().port}/mcp`);
  await closeServer(server);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim().split("\n").length, 10);
  assert.equal(maximum, 4);
});

test("oversized upstream bodies are never copied to protocol output or diagnostics", async (t) => {
  const credential = privateTokenFile("c".repeat(64));
  t.after(() => rmSync(credential.directory, { recursive: true, force: true }));
  const session = "018f47a3-7b5e-7c9d-8a1b-123456789abe";
  const canary = "UPSTREAM-SECRET-CANARY";
  const server = await startServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    if (request.method === "DELETE") { response.writeHead(204); response.end(); return; }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body.method === "initialize") {
      response.writeHead(200, { "content-type": "application/json", "mcp-session-id": session, "mcp-protocol-version": "2025-11-25" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-11-25", capabilities: {}, serverInfo: { name: "gkos-engine", version: "2.1.2" } } }));
    } else if (body.method === "notifications/initialized") { response.writeHead(202); response.end(); }
    else {
      response.writeHead(200, { "content-type": "application/json", "content-length": String(bridge.STDIO_RESULT_BYTES + 1) });
      response.end(canary);
    }
  });
  t.after(() => { if (server.listening) server.close(); });
  const result = await run(messages(), credential.file, `http://127.0.0.1:${server.address().port}/mcp`);
  await closeServer(server);
  assert.equal(result.stdout.includes(canary), false);
  assert.equal(result.stderr.includes(canary), false);
  assert.match(result.stdout, /GKOS MCP transport unavailable/);
  assert.equal(result.stderr, "gkos-mcp-stdio: transport operation failed\n");
});

test("an output close while backpressured terminates without hanging or leaking", async (t) => {
  const credential = privateTokenFile("d".repeat(64));
  t.after(() => rmSync(credential.directory, { recursive: true, force: true }));
  const input = new PassThrough();
  input.end("{invalid-json}\n");
  let output;
  output = new Writable({
    highWaterMark: 1,
    write(_chunk, _encoding, _callback) {
      setImmediate(() => output.destroy());
    },
  });
  const diagnostics = new PassThrough();
  const code = await Promise.race([
    bridge.runStdioBridge({
      input, output, diagnostics, signals: null,
      environment: { GKOS_MCP_TOKEN_FILE: credential.file },
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("bridge hung after output close")), 1_000)),
  ]);
  assert.equal(code, 3);
});

test("launcher is explicitly a bounded non-conformant compatibility bridge", () => {
  const launcher = readFileSync(resolve(root, "bin/gkos-mcp-stdio.mjs"), "utf8");
  assert.match(launcher, /compatibility bridge/);
  assert.match(launcher, /does not claim native-stdio conformance/);
  assert.match(launcher, /\.\.\/dist\/service-stdio\.mjs/);
  assert.doesNotMatch(launcher, /TOKEN|Authorization|Bearer/);
});
