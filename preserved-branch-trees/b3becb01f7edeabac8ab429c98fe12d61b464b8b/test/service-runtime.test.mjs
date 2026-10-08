import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

import { GkxIndex } from "../dist/gkos-engine.mjs";
import { buildVaultNavigationConfig } from "../dist/navigation.mjs";
import {
  createLocalServiceServer,
  defaultMcpAgentBinding,
  legacyViewerBinding,
  MCP_PROTOCOL_VERSION,
  ServiceCredentialRegistry,
} from "../dist/service-node.mjs";
import { ServiceTraversalEventRing } from "../dist/service.mjs";

const HOST = "127.0.0.1";
const AT = "2026-08-26T12:00:00.000Z";
const CANARY = "SERVICE-RUNTIME-SECRET-CANARY-5dd9";
const VIEWER_TOKEN = "v".repeat(64);
const AGENT_TOKEN = "a".repeat(64);

const note = (uid, title, sensitivity, body, lineage = "") => `---
gkx_version: "2.3"
uid: "${uid}"
title: "${title}"
type: note
created_at: ${AT}
epistemic_state: observation
sensitivity: ${sensitivity}
${lineage}---
${body}`;

function sourceFiles() {
  return [
    { relativePath: "A-Older.md", kind: "note", content: note("550e8400-e29b-41d4-a716-446655440000", "Older", "internal", "Visible older") },
    { relativePath: "B-Newer.md", kind: "note", content: note("550e8400-e29b-41d4-a716-446655440001", "Newer", "internal", "Visible newer", "supersedes: [\"[[A-Older]]\"]\n") },
    { relativePath: "My-MOC.md", kind: "note", content: note("550e8400-e29b-41d4-a716-446655440003", "MOC candidate", "internal", "Visible navigation candidate") },
    { relativePath: "Other-index.md", kind: "note", content: note("550e8400-e29b-41d4-a716-446655440004", "Index candidate", "internal", "Visible navigation candidate") },
    { relativePath: `Secret-${CANARY}.md`, kind: "note", content: note("550e8400-e29b-41d4-a716-446655440002", CANARY, "secret", CANARY) },
  ];
}

async function request(port, path, { token, method = "GET", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({ host: HOST, port, path, method, headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(payload ? { "content-type": "application/json", "content-length": String(payload.length) } : {}),
      ...headers,
    } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function fixtureServer(options = {}) {
  const liveSources = sourceFiles();
  const index = new GkxIndex({ defaultSensitivity: "secret" });
  index.setFiles(liveSources, []);
  index.graph.stats.indexedAt = AT;
  const events = new ServiceTraversalEventRing(32, Date.parse(AT), 2_097_152, () => Date.parse(AT));
  const credentials = new ServiceCredentialRegistry([
    legacyViewerBinding(VIEWER_TOKEN, "internal"),
    defaultMcpAgentBinding(AGENT_TOKEN, {
      credentialId: "credential:mcp-agent", agentId: "018f47a3-7b5e-7c9d-8a1b-123456789abe",
      agentLabel: "Alpha", sensitivityCeiling: "internal", revoked: false,
      limits: { concurrentRequests: 4, bucketCapacity: 50, refillMs: 1000 },
    }),
  ]);
  const navigationConfig = await buildVaultNavigationConfig({
    configId: "018f47a3-7b5e-7c9d-8a1b-123456789abf", version: 1, vaultId: "vault:test",
    promotedMocNames: [], createdAt: AT, createdBy: "system:test",
    policy: { id: "policy:test", version: "1.0.0", digest: `sha256:${"b".repeat(64)}` },
  });
  const snapshot = async () => ({
    graph: structuredClone(index.graph), sourceRecords: structuredClone(liveSources), generation: 7, evaluationTime: AT,
  });
  const server = createLocalServiceServer({
    credentials, snapshot, status: () => ({ state: "serving" }), vaultName: "test", vaultId: "vault:test",
    navigationConfig, eventRing: events, corsAllowlist: ["null"], requestTimeoutMs: options.requestTimeoutMs ?? 1000,
    authorization: async (committed) => {
      options.afterSnapshot?.(liveSources);
      return { configured: true, generation: committed.generation, policyDigest: `sha256:${"b".repeat(64)}` };
    },
  });
  server.listen(0, HOST);
  await once(server, "listening");
  return { server, port: server.address().port, events, credentials, liveSources };
}

async function close(server) { server.close(); await once(server, "close"); }

async function initialize(port) {
  const initialized = await request(port, "/mcp", { token: AGENT_TOKEN, method: "POST", body: {
    jsonrpc: "2.0", id: "init", method: "initialize",
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "fixture", version: "1" } },
  } });
  assert.equal(initialized.status, 200);
  const session = initialized.headers["mcp-session-id"];
  const headers = { "mcp-session-id": session, "mcp-protocol-version": MCP_PROTOCOL_VERSION };
  const notification = await request(port, "/mcp", { token: AGENT_TOKEN, method: "POST", headers, body: { jsonrpc: "2.0", method: "notifications/initialized" } });
  assert.equal(notification.status, 202);
  return headers;
}

async function call(port, headers, id, name, args) {
  const response = await request(port, "/mcp", { token: AGENT_TOKEN, method: "POST", headers, body: { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } } });
  assert.equal(response.status, 200);
  return JSON.parse(response.body).result;
}

test("REST routes are one-view filtered, deterministic, and generic denials do not enumerate", async () => {
  const fixture = await fixtureServer();
  try {
    for (const path of ["/graph", "/graphiti/episodes", "/capabilities"]) {
      const first = await request(fixture.port, path, { token: VIEWER_TOKEN });
      const second = await request(fixture.port, path, { token: VIEWER_TOKEN });
      assert.equal(first.status, 200);
      assert.equal(first.body, second.body, path);
      assert.equal(first.body.includes(CANARY), false);
      if (path === "/capabilities") {
        const capability = JSON.parse(first.body);
        assert.equal(capability.features.mcp.available, true);
        assert.equal(capability.features.mcp.configured, true);
        assert.equal(capability.features.mcp.authorized, false);
        assert.equal(capability.features.mcp.enabled, false);
        assert.equal(capability.features.events.authorized, true);
        assert.equal(capability.features.events.enabled, true);
      }
    }
    const missing = await request(fixture.port, "/graph");
    const wrong = await request(fixture.port, "/graph", { token: "x".repeat(64) });
    fixture.credentials.setRevoked("credential:legacy-viewer", true);
    const revoked = await request(fixture.port, "/graph", { token: VIEWER_TOKEN });
    assert.deepEqual([missing.status, wrong.status, revoked.status], [401, 401, 401]);
    assert.equal(missing.body, wrong.body);
    assert.equal(wrong.body, revoked.body);
  } finally { await close(fixture.server); }
});

test("viewer and MCP-agent credentials cannot be reused across authority surfaces", async () => {
  const fixture = await fixtureServer();
  try {
    assert.equal((await request(fixture.port, "/mcp", { token: VIEWER_TOKEN, method: "POST", body: {} })).status, 403);
    assert.equal((await request(fixture.port, "/graph", { token: AGENT_TOKEN })).status, 403);
    assert.equal((await request(fixture.port, "/events", { token: AGENT_TOKEN })).status, 403);
  } finally { await close(fixture.server); }
});

test("file-origin JavaScript can read event and MCP session response headers", async () => {
  const fixture = await fixtureServer();
  let eventRequest;
  let eventResponse;
  try {
    ({ req: eventRequest, res: eventResponse } = await new Promise((resolve, reject) => {
      const req = http.request({
        host: HOST, port: fixture.port, path: "/events",
        headers: { authorization: `Bearer ${VIEWER_TOKEN}`, origin: "null" },
      }, (res) => resolve({ req, res }));
      req.on("error", reject); req.end();
    }));
    assert.equal(eventResponse.statusCode, 200);
    assert.equal(eventResponse.headers["access-control-allow-origin"], "null");
    const eventExposed = new Set(String(eventResponse.headers["access-control-expose-headers"] ?? "").toLowerCase().split(/,\s*/u));
    assert.equal(eventExposed.has("gkos-event-session"), true);
    assert.match(String(eventResponse.headers["gkos-event-session"]), /^event-stream:/u);

    const initialized = await request(fixture.port, "/mcp", {
      token: AGENT_TOKEN, method: "POST", headers: { origin: "null" }, body: {
        jsonrpc: "2.0", id: "browser-init", method: "initialize",
        params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "file-viewer", version: "1" } },
      },
    });
    assert.equal(initialized.status, 200);
    assert.equal(initialized.headers["access-control-allow-origin"], "null");
    const mcpExposed = new Set(String(initialized.headers["access-control-expose-headers"] ?? "").toLowerCase().split(/,\s*/u));
    assert.equal(mcpExposed.has("mcp-session-id"), true);
    assert.equal(mcpExposed.has("mcp-protocol-version"), true);
    assert.match(String(initialized.headers["mcp-session-id"]), /^[0-9a-f-]{36}$/u);
    assert.equal(initialized.headers["mcp-protocol-version"], MCP_PROTOCOL_VERSION);
  } finally {
    eventResponse?.destroy(); eventRequest?.destroy();
    await close(fixture.server);
  }
});

test("MCP Navigation issues bounded refs, lineage/temporal neighbors, and a same-operation authorized event", async () => {
  const fixture = await fixtureServer();
  try {
    const headers = await initialize(fixture.port);
    const listed = await request(fixture.port, "/mcp", { token: AGENT_TOKEN, method: "POST", headers, body: { jsonrpc: "2.0", id: "list", method: "tools/list", params: {} } });
    assert.deepEqual(JSON.parse(listed.body).result.tools.map((tool) => tool.name), [
      "gkos_capabilities", "gkos_record_validate", "gkos_record_assess", "gkos_lineage_get",
      "gkos_graph_at_time", "gkos_navigation_discover", "gkos_navigation_audit",
    ]);
    const discovery = await call(fixture.port, headers, "discover", "gkos_navigation_discover", { scope_ref: null, cursor: null, limit: 1 });
    assert.equal(discovery.isError, false);
    assert.equal(JSON.stringify(discovery).includes(CANARY), false);
    const structured = discovery.structuredContent;
    assert.equal(structured.items.length, 1);
    assert.equal(structured.page.has_more, true);
    const event = fixture.events.after(0).at(-1);
    assert.equal(event.operation_id, structured.request_id);
    assert.deepEqual(event.paths, [structured.items[0].canonical_path]);
    const discoveryNext = await call(fixture.port, headers, "discover-next", "gkos_navigation_discover", { scope_ref: structured.scope_ref, cursor: structured.page.next_cursor, limit: 1 });
    assert.equal(discoveryNext.structuredContent.page.snapshot_id, structured.page.snapshot_id);
    assert.notEqual(discoveryNext.structuredContent.items[0].canonical_path, structured.items[0].canonical_path);

    const lineage = await call(fixture.port, headers, "lineage", "gkos_lineage_get", { record_ref: structured.items[0].record_ref, cursor: null, limit: 1 });
    assert.equal(lineage.isError, false);
    assert.equal(lineage.structuredContent.items.length, 1);
    assert.equal(lineage.structuredContent.page.has_more, true);
    assert.ok(lineage.structuredContent.items.every((item) => /^gkrec1_/.test(item.record_ref)));
    const lineageNext = await call(fixture.port, headers, "lineage-next", "gkos_lineage_get", { record_ref: structured.items[0].record_ref, cursor: lineage.structuredContent.page.next_cursor, limit: 1 });
    assert.equal(lineageNext.structuredContent.page.snapshot_id, lineage.structuredContent.page.snapshot_id);
    assert.equal(lineageNext.structuredContent.items.length, 1, "neighbor receives an opaque ref on first return");

    const temporal = await call(fixture.port, headers, "temporal", "gkos_graph_at_time", { scope_ref: structured.scope_ref, at: AT, state: "all", cursor: null, limit: 1 });
    assert.equal(temporal.isError, false);
    assert.equal(temporal.structuredContent.page.has_more, true);
    const temporalNext = await call(fixture.port, headers, "temporal-next", "gkos_graph_at_time", { scope_ref: structured.scope_ref, at: AT, state: "all", cursor: temporal.structuredContent.page.next_cursor, limit: 1 });
    assert.equal(temporalNext.structuredContent.page.snapshot_id, temporal.structuredContent.page.snapshot_id);
    const foreign = await call(fixture.port, headers, "foreign", "gkos_lineage_get", { record_ref: structured.items[0].record_ref, cursor: temporal.structuredContent.page.next_cursor, limit: 1 });
    assert.equal(foreign.isError, true);

    const audit = await call(fixture.port, headers, "audit", "gkos_navigation_audit", { scope_ref: structured.scope_ref, severity_at_least: "warning", cursor: null, limit: 1 });
    assert.equal(audit.isError, false);
    assert.equal(audit.structuredContent.page.has_more, true);
    const auditNext = await call(fixture.port, headers, "audit-next", "gkos_navigation_audit", { scope_ref: structured.scope_ref, severity_at_least: "warning", cursor: audit.structuredContent.page.next_cursor, limit: 1 });
    assert.equal(auditNext.structuredContent.page.snapshot_id, audit.structuredContent.page.snapshot_id);
  } finally { await close(fixture.server); }
});

test("MCP initialize rejects unsupported protocol versions without opening a session", async () => {
  const fixture = await fixtureServer();
  try {
    const response = await request(fixture.port, "/mcp", { token: AGENT_TOKEN, method: "POST", body: {
      jsonrpc: "2.0", id: "unsupported", method: "initialize",
      params: { protocolVersion: "2099-01-01", capabilities: {}, clientInfo: { name: "fixture", version: "1" } },
    } });
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).error.code, -32602);
    assert.equal(response.headers["mcp-session-id"], undefined);
  } finally { await close(fixture.server); }
});

test("MCP uses source bytes cloned into the authorized generation, never later live content", async () => {
  let mutated = false;
  const fixture = await fixtureServer({ afterSnapshot(live) {
    if (!mutated) { live[0].content = CANARY; mutated = true; }
  } });
  try {
    const headers = await initialize(fixture.port);
    const result = await call(fixture.port, headers, "discover", "gkos_navigation_discover", { scope_ref: null, cursor: null, limit: 20 });
    assert.equal(result.isError, false);
    assert.equal(JSON.stringify(result).includes(CANARY), false);
    assert.ok(result.structuredContent.items.some((item) => item.canonical_path === "A-Older.md"));
  } finally { await close(fixture.server); }
});

test("event streams occupy bounded credential concurrency until close", async () => {
  const fixture = await fixtureServer();
  const held = [];
  try {
    for (let index = 0; index < 4; index++) {
      const pair = await new Promise((resolve, reject) => {
        const req = http.request({ host: HOST, port: fixture.port, path: "/events", headers: { authorization: `Bearer ${VIEWER_TOKEN}` } }, (res) => resolve({ req, res }));
        req.on("error", reject); req.end();
      });
      assert.equal(pair.res.statusCode, 200);
      held.push(pair);
    }
    const fifth = await request(fixture.port, "/events", { token: VIEWER_TOKEN });
    assert.equal(fifth.status, 429);
  } finally {
    for (const { req, res } of held) { res.destroy(); req.destroy(); }
    await close(fixture.server);
  }
});

test("event resume is session-bound, gap-aware, ordered, and absent sequence live-tails", async () => {
  const fixture = await fixtureServer();
  const open = (headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port: fixture.port, path: "/events", headers: { authorization: `Bearer ${VIEWER_TOKEN}`, ...headers } }, (res) => resolve({ req, res }));
    req.on("error", reject); req.end();
  });
  const input = (ordinal) => ({
    session_id: "session:resume", operation_id: `operation:${ordinal}`, agent_id: "agent:alpha",
    agent_label: "Alpha", tool: "gkos_navigation_discover", paths: ["A-Older.md"], status: "completed", cost_units: null,
  });
  try {
    fixture.events.append(input(1), Date.parse(AT));
    const live = await open();
    assert.equal(live.res.statusCode, 200);
    const session = live.res.headers["gkos-event-session"];
    let liveBytes = "";
    live.res.on("data", (chunk) => { liveBytes += chunk.toString("utf8"); });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(liveBytes, "", "absent Last-Event-ID does not replay retained history");
    fixture.events.append(input(2), Date.parse(AT) + 1);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("live event timeout")), 1_000);
      live.res.once("data", () => { clearTimeout(timeout); resolve(); });
    });
    assert.match(liveBytes, /"sequence":2/u);
    assert.equal(liveBytes.includes('"sequence":1'), false);
    live.res.destroy(); live.req.destroy();

    assert.equal((await request(fixture.port, "/events", { token: VIEWER_TOKEN, headers: { "last-event-id": "bad" } })).status, 400);
    assert.equal((await request(fixture.port, "/events", { token: VIEWER_TOKEN, headers: { "last-event-id": "1" } })).status, 409);
    assert.equal((await request(fixture.port, "/events", { token: VIEWER_TOKEN, headers: { "last-event-id": "1", "gkos-event-session": "event-stream:wrong" } })).status, 409);

    const resumed = await open({ "last-event-id": "1", "gkos-event-session": session });
    assert.equal(resumed.res.statusCode, 200);
    const resumedChunk = await once(resumed.res, "data");
    const resumedText = resumedChunk[0].toString("utf8");
    assert.ok(resumedText.indexOf('"sequence":2') >= 0);
    resumed.res.destroy(); resumed.req.destroy();

    for (let ordinal = 3; ordinal <= 40; ordinal++) fixture.events.append(input(ordinal), Date.parse(AT) + ordinal);
    const gap = await request(fixture.port, "/events", { token: VIEWER_TOKEN, headers: { "last-event-id": "1", "gkos-event-session": session } });
    assert.equal(gap.status, 409);
    assert.equal(JSON.parse(gap.body).error, "event_stream_reset_required");
  } finally { await close(fixture.server); }
});

test("revocation closes an active event stream before the next traversal and releases its slot", async () => {
  const fixture = await fixtureServer();
  const held = [];
  try {
    const opened = await new Promise((resolve, reject) => {
      const req = http.request({ host: HOST, port: fixture.port, path: "/events", headers: { authorization: `Bearer ${VIEWER_TOKEN}` } }, (res) => resolve({ req, res }));
      req.on("error", reject); req.end();
    });
    assert.equal(opened.res.statusCode, 200);
    const chunks = [];
    opened.res.on("data", (chunk) => chunks.push(chunk));
    fixture.credentials.setRevoked("credential:legacy-viewer", true);
    fixture.events.append({
      session_id: "session:revocation", operation_id: "operation:revocation", agent_id: "agent:alpha",
      agent_label: "Alpha", tool: "gkos_navigation_discover", paths: ["A-Older.md"], status: "completed", cost_units: null,
    }, Date.parse(AT));
    await once(opened.res, "end");
    assert.equal(Buffer.concat(chunks).toString("utf8").includes("A-Older.md"), false);
    assert.equal((await request(fixture.port, "/events", { token: VIEWER_TOKEN })).status, 401);

    fixture.credentials.setRevoked("credential:legacy-viewer", false);
    for (let index = 0; index < 4; index++) {
      const pair = await new Promise((resolve, reject) => {
        const req = http.request({ host: HOST, port: fixture.port, path: "/events", headers: { authorization: `Bearer ${VIEWER_TOKEN}` } }, (res) => resolve({ req, res }));
        req.on("error", reject); req.end();
      });
      assert.equal(pair.res.statusCode, 200);
      held.push(pair);
    }
  } finally {
    for (const { req, res } of held) { res.destroy(); req.destroy(); }
    await close(fixture.server);
  }
});

test("aborted slow MCP bodies release capacity without an unhandled response write", async () => {
  const fixture = await fixtureServer({ requestTimeoutMs: 25 });
  try {
    await new Promise((resolve) => {
      const req = http.request({ host: HOST, port: fixture.port, path: "/mcp", method: "POST", headers: { authorization: `Bearer ${AGENT_TOKEN}`, "content-type": "application/json", "content-length": "100" } });
      req.on("error", resolve);
      req.write("{");
    });
    const initialized = await initialize(fixture.port);
    assert.ok(initialized["mcp-session-id"]);
  } finally { await close(fixture.server); }
});
