/**
 * Desktop-agent sidecar tests (build spec Repo A).
 *
 * Covers: arg validation (bad/missing level → secret; --notes required; --host
 * rejected; port defaulting), the coalescing watcher debounce, loopback-only
 * bind, and the mandatory bearer token (401 without / 200 with).
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

import {
  DESKTOP_AGENT_USAGE,
  parseArgs,
  Debouncer,
  createAgentServer,
  loadOrCreateToken,
  SENSITIVITY_LEVELS,
  DEFAULT_PORT,
  LOOPBACK_HOST,
  defaultCredentialStatusPaths,
  formatDefaultCredentialPaths,
  loadOrCreateDefaultMcpCredential,
  loadOptionalCodexMcpCredential,
  openValidatedCredentialDirectory,
  bindAuthorizedStatusDirectory,
  captureStatusDirectoryNamespace,
} from "../dist/gkos-desktop-agent.mjs";
import { GkxIndex } from "../dist/gkos-engine.mjs";
import { mkdtempSync, rmSync, readFileSync, statSync, writeFileSync, symlinkSync, existsSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---- arg validation ----------------------------------------------------

test("deployment helper has non-technical command help", () => {
  assert.match(DESKTOP_AGENT_USAGE, /protected, read-only note map/i);
  assert.match(DESKTOP_AGENT_USAGE, /never edits/i);
  assert.match(DESKTOP_AGENT_USAGE, /--notes <folder>/);
});

test("parseArgs: valid sensitivity is honored", () => {
  const a = parseArgs(["--notes", "/x", "--default-sensitivity", "internal"]);
  assert.equal(a.defaultSensitivity, "internal");
});

test("parseArgs: invalid sensitivity fails closed to secret", () => {
  const a = parseArgs(["--notes", "/x", "--default-sensitivity", "banana"]);
  assert.equal(a.defaultSensitivity, "secret");
});

test("parseArgs: missing sensitivity fails closed to secret", () => {
  const a = parseArgs(["--notes", "/x"]);
  assert.equal(a.defaultSensitivity, "secret");
});

test("parseArgs: --notes is required", () => {
  assert.throws(() => parseArgs(["--default-sensitivity", "public"]), /--notes/);
});

test("parseArgs: --host is rejected (loopback only)", () => {
  assert.throws(() => parseArgs(["--notes", "/x", "--host", "0.0.0.0"]), /host/);
});

test("parseArgs: port defaults to 4814; invalid falls back to default", () => {
  assert.equal(parseArgs(["--notes", "/x"]).port, DEFAULT_PORT);
  assert.equal(parseArgs(["--notes", "/x", "--port", "0"]).port, DEFAULT_PORT);
  assert.equal(parseArgs(["--notes", "/x", "--port", "not-a-number"]).port, DEFAULT_PORT);
  assert.equal(parseArgs(["--notes", "/x", "--port", "5000"]).port, 5000);
});

test("SENSITIVITY_LEVELS is the seven-level vocabulary ending at secret", () => {
  assert.equal(SENSITIVITY_LEVELS.length, 7);
  assert.equal(SENSITIVITY_LEVELS[SENSITIVITY_LEVELS.length - 1], "secret");
});

test("desktop settings reject ambiguity and do not parse numeric prefixes", () => {
  for (const tail of [["--prt", "5100"], ["extra"], ["--port", "5100", "--port", "5200"]]) {
    assert.throws(() => parseArgs(["--notes", "/x", ...tail]));
  }
  for (const port of ["5000junk", "5000.5", "5e3", " 5000", "65536", "-1"]) {
    assert.equal(parseArgs(["--notes", "/x", "--port", port]).port, DEFAULT_PORT);
  }
  assert.equal(parseArgs(["--notes", "/x", "--port", "65535"]).port, 65535);
  assert.match(DESKTOP_AGENT_USAGE, /gkos.toml is not loaded/);
  assert.match(DESKTOP_AGENT_USAGE, /GKOS_MCP_CONTENT_LIMITS/);
});

// ---- debounce -----------------------------------------------------------

test("Debouncer coalesces a burst into a single flush carrying every path", async () => {
  let flushes = 0;
  let lastPaths = [];
  const d = new Debouncer(30, (paths) => {
    flushes++;
    lastPaths = paths;
  });
  d.schedule("a.md");
  d.schedule("b.md");
  d.schedule("a.md"); // duplicate coalesced
  d.schedule("c.md");
  assert.equal(flushes, 0, "no flush before the quiet window elapses");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(flushes, 1, "exactly one flush for the whole burst");
  assert.deepEqual([...lastPaths].sort(), ["a.md", "b.md", "c.md"]);
});

test("Debouncer arms a fresh window per burst", async () => {
  let flushes = 0;
  const d = new Debouncer(30, () => flushes++);
  d.schedule("x");
  await new Promise((r) => setTimeout(r, 80));
  d.schedule("y");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(flushes, 2);
});

// ---- token persistence --------------------------------------------------

test("loadOrCreateToken generates a 64-hex token and reuses it on subsequent runs", () => {
  const dir = mkdtempSync(join(tmpdir(), "gkos-tok-"));
  try {
    const p = join(dir, "desktop-agent.token");
    const t1 = loadOrCreateToken(p);
    assert.match(t1, /^[0-9a-f]{64}$/);
    const t2 = loadOrCreateToken(p);
    assert.equal(t1, t2, "token persists across runs");
    assert.equal(readFileSync(p, "utf8").trim(), t1);
    assert.ok(statSync(p).isFile());
    if (process.platform !== "win32") assert.equal(statSync(p).mode & 0o777, 0o600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deleting the token file rotates it on recovery", () => {
  const dir = mkdtempSync(join(tmpdir(), "gkos-tok-rotate-"));
  try {
    const p = join(dir, "desktop-agent.token");
    const first = loadOrCreateToken(p);
    rmSync(p);
    const rotated = loadOrCreateToken(p);
    assert.notEqual(rotated, first);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("default MCP credential persists a distinct identity and status/startup expose paths only", () => {
  const dir = mkdtempSync(join(tmpdir(), "gkos-mcp-credential-"));
  try {
    const viewerPath = join(dir, "desktop-agent.token");
    const viewerToken = loadOrCreateToken(viewerPath);
    const first = loadOrCreateDefaultMcpCredential(dir);
    const second = loadOrCreateDefaultMcpCredential(dir);
    assert.equal(first.token, second.token);
    assert.equal(first.state.agent_id, second.state.agent_id);
    assert.notEqual(first.token, viewerToken);
    const status = defaultCredentialStatusPaths(viewerPath, first);
    const startup = formatDefaultCredentialPaths(viewerPath, first, join(dir, "status.json"));
    const bytes = JSON.stringify({ status, startup });
    assert.match(startup, /viewer credential: .*desktop-agent\.token/);
    assert.match(startup, /MCP credential: .*desktop-agent\.mcp\.token/);
    assert.match(startup, /MCP identity: .*desktop-agent\.mcp\.identity\.json/);
    assert.equal(bytes.includes(viewerToken), false);
    assert.equal(bytes.includes(first.token), false);
    openValidatedCredentialDirectory(dir, viewerToken, first);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("corrupt existing MCP identity blocks without overwrite", () => {
  const dir = mkdtempSync(join(tmpdir(), "gkos-mcp-corrupt-"));
  try {
    const credential = loadOrCreateDefaultMcpCredential(dir);
    writeFileSync(credential.identityPath, "corrupt-identity");
    assert.throws(() => loadOrCreateDefaultMcpCredential(dir));
    assert.equal(readFileSync(credential.identityPath, "utf8"), "corrupt-identity");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("protected credential reopen rejects a symlinked MCP identity without changing its target", () => {
  const dir = mkdtempSync(join(tmpdir(), "gkos-mcp-link-"));
  const external = mkdtempSync(join(tmpdir(), "gkos-mcp-external-"));
  try {
    const viewerPath = join(dir, "desktop-agent.token");
    const viewerToken = loadOrCreateToken(viewerPath);
    const credential = loadOrCreateDefaultMcpCredential(dir);
    const externalIdentity = join(external, "identity.json");
    const expected = readFileSync(credential.identityPath, "utf8");
    writeFileSync(externalIdentity, expected);
    rmSync(credential.identityPath);
    try { symlinkSync(externalIdentity, credential.identityPath, "file"); }
    catch { return; }
    assert.throws(() => loadOrCreateDefaultMcpCredential(dir), /CREDENTIAL_LEAF_INVALID|ELOOP/u);
    assert.throws(() => openValidatedCredentialDirectory(dir, viewerToken, credential));
    assert.equal(readFileSync(externalIdentity, "utf8"), expected);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

test("credential loaders reject symlinked viewer and MCP token leaves before reading targets", () => {
  const dir = mkdtempSync(join(tmpdir(), "gkos-token-links-"));
  const external = mkdtempSync(join(tmpdir(), "gkos-token-links-external-"));
  try {
    const externalToken = join(external, "token");
    const secret = "z".repeat(64);
    writeFileSync(externalToken, secret, { mode: 0o600 });
    const viewerPath = join(dir, "desktop-agent.token");
    try { symlinkSync(externalToken, viewerPath, "file"); }
    catch { return; }
    assert.throws(() => loadOrCreateToken(viewerPath), /CREDENTIAL_LEAF_INVALID|ELOOP/u);
    assert.equal(readFileSync(externalToken, "utf8"), secret);
    rmSync(viewerPath);

    loadOrCreateToken(viewerPath);
    const mcp = loadOrCreateDefaultMcpCredential(dir);
    rmSync(mcp.tokenPath);
    symlinkSync(externalToken, mcp.tokenPath, "file");
    assert.throws(() => loadOrCreateDefaultMcpCredential(dir), /CREDENTIAL_LEAF_INVALID|ELOOP/u);
    assert.equal(readFileSync(externalToken, "utf8"), secret);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

test("status capability handoff shares only the unchanged authorized directory and rejects an external leaf", () => {
  const dir = mkdtempSync(join(tmpdir(), "gkos-status-capability-"));
  try {
    const viewerPath = join(dir, "desktop-agent.token");
    const viewerToken = loadOrCreateToken(viewerPath);
    const credential = loadOrCreateDefaultMcpCredential(dir);
    const first = openValidatedCredentialDirectory(dir, viewerToken, credential);
    const second = openValidatedCredentialDirectory(dir, viewerToken, credential);
    const namespace = captureStatusDirectoryNamespace(first);
    assert.equal(bindAuthorizedStatusDirectory(first, second, namespace), second);

    const stale = openValidatedCredentialDirectory(dir, viewerToken, credential);
    const proposed = openValidatedCredentialDirectory(dir, viewerToken, credential);
    const expected = captureStatusDirectoryNamespace(stale);
    writeFileSync(join(dir, "external-race"), "untrusted", { mode: 0o600 });
    assert.throws(() => bindAuthorizedStatusDirectory(stale, proposed, expected), /GKX_WATCHER_(?:FS_DIRECTORY|STATUS_NAMESPACE)_CHANGED/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("server returns 401 with an incorrect bearer token", async () => {
  await withServer(async (_server, _token, addr) => {
    const res = await req(addr.port, "/health", { authorization: "Bearer incorrect" });
    assert.equal(res.status, 401);
  });
});

// ---- server: loopback bind + token gate ---------------------------------

// A note WITH frontmatter (so a projection is built) but NO sensitivity field
// — the unlabeled case the configured default governs.
const UNLABELED =
  '---\ngkx_version: "2.3"\nuid: "note:a"\ntitle: A\ntype: note\ncreated_at: 2026-01-01T00:00:00Z\nepistemic_state: observation\n---\nBody';

async function withServer(fn) {
  const index = new GkxIndex({ defaultSensitivity: "internal" });
  index.setFiles([{ relativePath: "a.md", content: UNLABELED, kind: "note" }], []);
  const token = "test-token-abc";
  const getStatus = () => ({
    pid: process.pid,
    port: 0,
    url: "",
    token_path: "",
    notes_dir: "/x",
    default_sensitivity: "internal",
    notes_indexed: index.noteCount,
    state: "serving",
    last_scan_iso: null,
  });
  const server = createAgentServer({ index, token, getStatus });
  server.listen(0, LOOPBACK_HOST);
  await once(server, "listening");
  try {
    await fn(server, token, server.address());
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("server binds 127.0.0.1 only (loopback)", async () => {
  await withServer(async (_server, _token, addr) => {
    assert.equal(addr.address, LOOPBACK_HOST);
  });
});

function req(port, path, headers = {}, method = "GET") {
  return new Promise((resolve, reject) => {
    const r = http.request(
      { host: LOOPBACK_HOST, port, path, method, headers },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body }),
        );
      },
    );
    r.on("error", reject);
    r.end();
  });
}

test("server returns 401 without a bearer token", async () => {
  await withServer(async (_server, _token, addr) => {
    const res = await req(addr.port, "/health");
    assert.equal(res.status, 401);
  });
});

test("server returns 200 with the bearer token and projects effective sensitivity", async () => {
  await withServer(async (_server, token, addr) => {
    const res = await req(addr.port, "/notes", { authorization: `Bearer ${token}` });
    assert.equal(res.status, 200);
    const parsed = JSON.parse(res.body);
    const note = parsed.notes.find((n) => n.path === "a.md");
    assert.equal(note.sensitivity, "internal", "unlabeled note takes the configured default");
  });
});

// ---- scoped CORS for the desktop viewer ---------------------------------

test("OPTIONS preflight from an allowed origin → 204 with reflected CORS headers, no token needed", async () => {
  await withServer(async (_server, _token, addr) => {
    for (const origin of [
      "tauri://localhost",
      "https://tauri.localhost",
      "http://tauri.localhost",
      "null",
    ]) {
      const res = await req(addr.port, "/graph", { origin }, "OPTIONS");
      assert.equal(res.status, 204, `preflight ${origin} → 204`);
      assert.equal(res.headers["access-control-allow-origin"], origin, "ACAO reflects origin");
      assert.equal(res.headers["vary"], "Origin");
      assert.equal(res.headers["access-control-allow-headers"], "Authorization");
      assert.equal(res.headers["access-control-allow-methods"], "GET, OPTIONS");
    }
  });
});

test("OPTIONS preflight from a disallowed origin → no ACAO (browser will block)", async () => {
  await withServer(async (_server, _token, addr) => {
    const res = await req(addr.port, "/graph", { origin: "https://evil.example" }, "OPTIONS");
    assert.equal(res.status, 204);
    assert.equal(res.headers["access-control-allow-origin"], undefined, "no CORS for evil origin");
  });
});

test("GET from an allowed origin with a valid token → 200 with ACAO reflected", async () => {
  await withServer(async (_server, token, addr) => {
    const res = await req(addr.port, "/graph", {
      origin: "tauri://localhost",
      authorization: `Bearer ${token}`,
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers["access-control-allow-origin"], "tauri://localhost");
    assert.equal(res.headers["vary"], "Origin");
  });
});

test("GET from an allowed origin WITHOUT a token → 401 (auth still enforced)", async () => {
  await withServer(async (_server, _token, addr) => {
    const res = await req(addr.port, "/graph", { origin: "tauri://localhost" });
    assert.equal(res.status, 401, "preflight bypass does not bypass auth on the real request");
    // CORS still reflected so the browser can surface the 401 to the page.
    assert.equal(res.headers["access-control-allow-origin"], "tauri://localhost");
  });
});

test("GET from a disallowed origin → no ACAO even with a valid token", async () => {
  await withServer(async (_server, token, addr) => {
    const res = await req(addr.port, "/graph", {
      origin: "https://evil.example",
      authorization: `Bearer ${token}`,
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });
});

test("GET with no Origin (same-origin / non-browser) → 200 and no CORS headers", async () => {
  await withServer(async (_server, token, addr) => {
    const res = await req(addr.port, "/graph", { authorization: `Bearer ${token}` });
    assert.equal(res.status, 200);
    assert.equal(res.headers["access-control-allow-origin"], undefined, "no behavior change");
  });
});


test("operator identity ceiling supports all seven levels without rotating identity or clearing revocation", () => {
  const dir = mkdtempSync(join(tmpdir(), "gkos-mcp-ceilings-"));
  try {
    const viewer = loadOrCreateToken(join(dir, "desktop-agent.token"));
    const initial = loadOrCreateDefaultMcpCredential(dir);
    assert.equal(initial.state.sensitivity_ceiling, "internal", "new credentials retain least default authority");
    for (const ceiling of SENSITIVITY_LEVELS) {
      const state = { ...initial.state, sensitivity_ceiling: ceiling, revoked: true };
      const bytes = JSON.stringify(state, null, 2);
      writeFileSync(initial.identityPath, bytes, { mode: 0o600 });
      const loaded = loadOrCreateDefaultMcpCredential(dir);
      assert.equal(loaded.state.sensitivity_ceiling, ceiling);
      assert.equal(loaded.state.revoked, true);
      assert.equal(loaded.state.credential_id, initial.state.credential_id);
      assert.equal(loaded.state.agent_id, initial.state.agent_id);
      assert.equal(loaded.token, initial.token);
      assert.equal(readFileSync(initial.identityPath, "utf8"), bytes);
      openValidatedCredentialDirectory(dir, viewer, loaded);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("invalid ceilings fail closed and existing byte-canonical identity check remains enforced", () => {
  const dir = mkdtempSync(join(tmpdir(), "gkos-mcp-invalid-ceiling-"));
  try {
    const viewer = loadOrCreateToken(join(dir, "desktop-agent.token"));
    const initial = loadOrCreateDefaultMcpCredential(dir);
    for (const ceiling of ["all", "SECRET", "secret ", "", null, 6, ["secret"]]) {
      const bytes = JSON.stringify({ ...initial.state, sensitivity_ceiling: ceiling }, null, 2);
      writeFileSync(initial.identityPath, bytes, { mode: 0o600 });
      assert.throws(() => loadOrCreateDefaultMcpCredential(dir), /GKX_WATCHER_MCP_IDENTITY_INVALID/u);
      assert.equal(readFileSync(initial.identityPath, "utf8"), bytes, "invalid operator configuration is never overwritten");
    }
    writeFileSync(initial.identityPath, JSON.stringify({ ...initial.state, sensitivity_ceiling: "secret" }, null, 2) + "\n", { mode: 0o600 });
    const loaded = loadOrCreateDefaultMcpCredential(dir);
    assert.throws(() => openValidatedCredentialDirectory(dir, viewer, loaded), /GKX_WATCHER_MCP_IDENTITY_INVALID/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test("optional Codex credential preserves existing identity and has independent full-access authority", () => {
  const dir = mkdtempSync(join(tmpdir(), "gkos-codex-identity-"));
  try {
    const viewer = loadOrCreateToken(join(dir, "desktop-agent.token"));
    const original = loadOrCreateDefaultMcpCredential(dir);
    const originalBytes = readFileSync(original.identityPath, "utf8");
    assert.equal(loadOptionalCodexMcpCredential(dir, "0"), null);
    assert.equal(existsSync(join(dir, "desktop-agent.codex.mcp.token")), false);
    assert.throws(() => loadOptionalCodexMcpCredential(dir, "true"), /CONFIGURATION_INVALID/);
    const codex = loadOptionalCodexMcpCredential(dir, "1");
    assert.equal(codex.state.agent_label, "Codex MCP Agent");
    assert.equal(codex.state.sensitivity_ceiling, "secret");
    assert.notEqual(codex.token, original.token);
    assert.notEqual(codex.state.agent_id, original.state.agent_id);
    assert.notEqual(codex.state.credential_id, original.state.credential_id);
    assert.equal(loadOptionalCodexMcpCredential(dir, "1").token, codex.token);
    assert.equal(readFileSync(original.identityPath, "utf8"), originalBytes);
    assert.equal(loadOrCreateDefaultMcpCredential(dir).token, original.token);
    openValidatedCredentialDirectory(dir, viewer, original, codex);
    writeFileSync(codex.identityPath, JSON.stringify({ ...codex.state, revoked: true }, null, 2));
    const revoked = loadOptionalCodexMcpCredential(dir, "1");
    assert.equal(revoked.state.revoked, true);
    assert.equal(loadOrCreateDefaultMcpCredential(dir).state.revoked, false);
    openValidatedCredentialDirectory(dir, viewer, original, revoked);
    writeFileSync(codex.identityPath, JSON.stringify(revoked.state, null, 2) + "\n");
    assert.throws(() => openValidatedCredentialDirectory(dir, viewer, original, loadOptionalCodexMcpCredential(dir, "1")), /MCP_IDENTITY_INVALID/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Codex credential duplicate tokens/identities and hard-link aliases fail closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "gkos-codex-duplicate-"));
  try {
    const viewer = loadOrCreateToken(join(dir, "desktop-agent.token"));
    const original = loadOrCreateDefaultMcpCredential(dir);
    const codex = loadOptionalCodexMcpCredential(dir, "1");
    writeFileSync(codex.tokenPath, original.token);
    assert.throws(() => openValidatedCredentialDirectory(dir, viewer, original, loadOptionalCodexMcpCredential(dir, "1")), /CREDENTIAL_DUPLICATE/);
    writeFileSync(codex.tokenPath, codex.token);
    for (const field of ["credential_id", "agent_id"]) {
      writeFileSync(codex.identityPath, JSON.stringify({ ...codex.state, [field]: original.state[field] }, null, 2));
      assert.throws(() => openValidatedCredentialDirectory(dir, viewer, original, loadOptionalCodexMcpCredential(dir, "1")), /CREDENTIAL_DUPLICATE/);
    }
    rmSync(codex.identityPath);
    linkSync(original.identityPath, codex.identityPath);
    assert.throws(() => loadOptionalCodexMcpCredential(dir, "1"), /CREDENTIAL_LEAF_INVALID/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test("separate default and Codex registry revocations do not affect the other credential", async () => {
  const { ServiceCredentialRegistry, defaultMcpAgentBinding } = await import("../dist/service-node.mjs");
  const dir = mkdtempSync(join(tmpdir(), "gkos-codex-revoke-"));
  try {
    const original = loadOrCreateDefaultMcpCredential(dir);
    const codex = loadOptionalCodexMcpCredential(dir, "1");
    const registry = new ServiceCredentialRegistry([original, codex].map(credential => defaultMcpAgentBinding(credential.token, {
      credentialId: credential.state.credential_id, agentId: credential.state.agent_id,
      agentLabel: credential.state.agent_label, sensitivityCeiling: credential.state.sensitivity_ceiling, revoked: false,
    })));
    registry.setRevoked(codex.state.credential_id, true);
    assert.equal(registry.resolve(codex.token).revoked, true);
    assert.equal(registry.resolve(original.token).revoked, false);
    registry.setRevoked(codex.state.credential_id, false);
    registry.setRevoked(original.state.credential_id, true);
    assert.equal(registry.resolve(codex.token).revoked, false);
    assert.equal(registry.resolve(original.token).revoked, true);
    assert.equal(registry.resolve(codex.token).sensitivityCeiling, "secret");
    assert.equal(registry.resolve(original.token).sensitivityCeiling, "internal");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("operator startup burst accepts 40 without raising concurrency or refill and rejects other limits", () => {
 const dir=mkdtempSync(join(tmpdir(),'gkos-startup-burst-'));
 try {
  const viewer=loadOrCreateToken(join(dir,'desktop-agent.token'));
  const original=loadOrCreateDefaultMcpCredential(dir);
  const widened={...original.state,limits:{concurrent_requests:4,bucket_capacity:40,refill_ms:1000}};
  writeFileSync(original.identityPath,JSON.stringify(widened,null,2));
  const loaded=loadOrCreateDefaultMcpCredential(dir);
  assert.equal(loaded.token,original.token);assert.equal(loaded.state.limits.bucket_capacity,40);
  openValidatedCredentialDirectory(dir,viewer,loaded);
  for(const limits of [{concurrent_requests:5,bucket_capacity:40,refill_ms:1000},{concurrent_requests:4,bucket_capacity:100,refill_ms:1000},{concurrent_requests:4,bucket_capacity:40,refill_ms:10}]) {
   writeFileSync(original.identityPath,JSON.stringify({...original.state,limits},null,2));
   assert.throws(()=>loadOrCreateDefaultMcpCredential(dir),/MCP_IDENTITY_INVALID/);
  }
 } finally {rmSync(dir,{recursive:true,force:true});}
});
