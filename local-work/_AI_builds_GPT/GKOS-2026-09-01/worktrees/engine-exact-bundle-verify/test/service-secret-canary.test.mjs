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
import {
  defaultCredentialStatusPaths,
  formatDefaultCredentialPaths,
} from "../dist/gkos-desktop-agent.mjs";

const HOST = "127.0.0.1";
const AT = "2026-08-26T12:00:00.000Z";
const HIDDEN_TITLE = "CANARY-HIDDEN-TITLE-4fce2f";
const HIDDEN_PATH_FRAGMENT = "CANARY-HIDDEN-PATH-e823c1";
const HIDDEN_PATH = `Restricted/${HIDDEN_PATH_FRAGMENT}.md`;
const HIDDEN_UID = "550e8400-e29b-41d4-a716-446655449991";
const HIDDEN_BODY = "CANARY-HIDDEN-BODY-7a129d";
const HIDDEN_DIAGNOSTIC = "CANARY-HIDDEN-DIAGNOSTIC-91bc77";
const VIEWER_TOKEN = `viewer.${"v".repeat(56)}`;
const AGENT_TOKEN = `agent.${"a".repeat(57)}`;
const WRONG_TOKEN = `wrong.${"w".repeat(57)}`;
const FORBIDDEN = Object.freeze([
  HIDDEN_TITLE,
  HIDDEN_PATH_FRAGMENT,
  HIDDEN_PATH,
  HIDDEN_UID,
  HIDDEN_BODY,
  HIDDEN_DIAGNOSTIC,
  VIEWER_TOKEN,
  AGENT_TOKEN,
  WRONG_TOKEN,
]);

const note = (uid, title, sensitivity, body, extra = "") => `---
gkx_version: "2.3"
uid: "${uid}"
title: "${title}"
type: note
created_at: ${AT}
epistemic_state: observation
sensitivity: ${sensitivity}
${extra}---
${body}`;

function sources() {
  return [
    {
      relativePath: "Visible/Older.md",
      kind: "note",
      content: note("550e8400-e29b-41d4-a716-446655449981", "Visible older", "internal", "Visible older body"),
    },
    {
      relativePath: "Visible/Newer.md",
      kind: "note",
      content: note(
        "550e8400-e29b-41d4-a716-446655449982",
        "Visible newer",
        "internal",
        "Visible newer body",
        "supersedes: [\"[[Older]]\"]\n",
      ),
    },
    {
      relativePath: "Visible/My-MOC.md",
      kind: "note",
      content: note("550e8400-e29b-41d4-a716-446655449983", "Visible MOC", "internal", "Visible MOC body"),
    },
    {
      relativePath: HIDDEN_PATH,
      kind: "note",
      content: note(HIDDEN_UID, HIDDEN_TITLE, "secret", HIDDEN_BODY),
    },
  ];
}

function bytes(value) {
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function assertCanaryFree(label, value) {
  const output = bytes(value);
  for (const canary of FORBIDDEN) {
    assert.equal(output.includes(canary), false, `${label} leaked ${canary}`);
  }
}

async function request(port, path, { token, method = "GET", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), "utf8");
    const req = http.request({
      host: HOST,
      port,
      path,
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "content-type": "application/json", "content-length": String(payload.length) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function openEvents(port) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: HOST,
      port,
      path: "/events",
      headers: { authorization: `Bearer ${VIEWER_TOKEN}` },
    }, (res) => resolve({ req, res }));
    req.on("error", reject);
    req.end();
  });
}

async function fixture() {
  const sourceRecords = sources();
  const index = new GkxIndex({ defaultSensitivity: "secret" });
  index.setFiles(sourceRecords, []);
  index.graph.stats.indexedAt = AT;

  const hidden = index.graph.nodes.find((node) => node.kind === "file" && node.path === HIDDEN_PATH);
  assert.ok(hidden?.gkx?.projection, "hidden fixture must have a governed projection");
  hidden.gkx.projection.diagnostics.push({
    code: HIDDEN_DIAGNOSTIC,
    severity: "critical",
    field: HIDDEN_DIAGNOSTIC,
    message: HIDDEN_DIAGNOSTIC,
    deterministic: true,
    sourcePath: HIDDEN_PATH,
  });
  index.graph.diagnostics.lineageWarnings.push(HIDDEN_DIAGNOSTIC);

  const events = new ServiceTraversalEventRing(64, Date.parse(AT), 2_097_152, () => Date.parse(AT));
  const viewerBinding = legacyViewerBinding(VIEWER_TOKEN, "internal");
  viewerBinding.identity.limits = { concurrentRequests: 4, bucketCapacity: 50, refillMs: 1000 };
  const credentials = new ServiceCredentialRegistry([
    viewerBinding,
    defaultMcpAgentBinding(AGENT_TOKEN, {
      credentialId: "credential:canary-agent",
      agentId: "018f47a3-7b5e-7c9d-8a1b-123456789abe",
      agentLabel: "Canary test agent",
      sensitivityCeiling: "internal",
      revoked: false,
      limits: { concurrentRequests: 4, bucketCapacity: 50, refillMs: 1000 },
    }),
  ]);
  const navigationConfig = await buildVaultNavigationConfig({
    configId: "018f47a3-7b5e-7c9d-8a1b-123456789abf",
    version: 1,
    vaultId: "vault:canary",
    promotedMocNames: [],
    createdAt: AT,
    createdBy: "system:canary-test",
    policy: { id: "policy:canary", version: "1.0.0", digest: `sha256:${"b".repeat(64)}` },
  });
  const server = createLocalServiceServer({
    credentials,
    snapshot: () => ({
      graph: structuredClone(index.graph),
      sourceRecords: structuredClone(sourceRecords),
      generation: 11,
      evaluationTime: AT,
    }),
    authorization: (snapshot) => ({
      configured: true,
      generation: snapshot.generation,
      policyDigest: `sha256:${"b".repeat(64)}`,
    }),
    status: () => ({ state: "serving" }),
    vaultName: "canary-vault",
    vaultId: "vault:canary",
    navigationConfig,
    eventRing: events,
    corsAllowlist: ["null"],
  });
  server.listen(0, HOST);
  await once(server, "listening");
  return { server, port: server.address().port, events, credentials };
}

async function initialize(port) {
  const response = await request(port, "/mcp", {
    token: AGENT_TOKEN,
    method: "POST",
    body: {
      jsonrpc: "2.0",
      id: "initialize",
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "secret-canary-test", version: "1" },
      },
    },
  });
  assert.equal(response.status, 200);
  assertCanaryFree("MCP initialize", response);
  const sessionId = response.headers["mcp-session-id"];
  assert.equal(typeof sessionId, "string");
  const headers = { "mcp-session-id": sessionId, "mcp-protocol-version": MCP_PROTOCOL_VERSION };
  const notification = await request(port, "/mcp", {
    token: AGENT_TOKEN,
    method: "POST",
    headers,
    body: { jsonrpc: "2.0", method: "notifications/initialized" },
  });
  assert.equal(notification.status, 202);
  assertCanaryFree("MCP initialized notification", notification);
  return headers;
}

async function mcp(port, headers, id, name, args) {
  const response = await request(port, "/mcp", {
    token: AGENT_TOKEN,
    method: "POST",
    headers,
    body: { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } },
  });
  assert.equal(response.status, 200, name);
  assertCanaryFree(`MCP ${name}`, response);
  return JSON.parse(response.body).result;
}

test("cross-surface secret canary never enters REST, MCP, SSE, denial, status, or log-safe bytes", async () => {
  const held = await fixture();
  let stream;
  try {
    for (const route of ["/health", "/capabilities", "/notes", "/graph", "/graphiti/episodes"]) {
      const response = await request(held.port, route, { token: VIEWER_TOKEN });
      assert.equal(response.status, 200, route);
      assertCanaryFree(`viewer ${route}`, response);
    }

    const missing = await request(held.port, "/graph");
    const wrong = await request(held.port, "/graph", { token: WRONG_TOKEN });
    const viewerMcp = await request(held.port, "/mcp", { token: VIEWER_TOKEN, method: "POST", body: {} });
    const agentGraph = await request(held.port, "/graph", { token: AGENT_TOKEN });
    const notFound = await request(held.port, "/not-a-route", { token: VIEWER_TOKEN });
    const queryRejected = await request(held.port, "/graph?token=not-accepted", { token: VIEWER_TOKEN });
    for (const [label, response] of Object.entries({ missing, wrong, viewerMcp, agentGraph, notFound, queryRejected })) {
      assertCanaryFree(label, response);
    }
    assert.deepEqual([missing.status, wrong.status, viewerMcp.status, agentGraph.status, notFound.status, queryRejected.status], [401, 401, 403, 403, 404, 400]);
    assert.equal(missing.body, wrong.body, "missing and wrong credentials use one generic denial body");

    const unsupported = await request(held.port, "/mcp", {
      token: AGENT_TOKEN,
      method: "POST",
      body: {
        jsonrpc: "2.0",
        id: "unsupported",
        method: "initialize",
        params: { protocolVersion: "2099-01-01", capabilities: {}, clientInfo: { name: "canary", version: "1" } },
      },
    });
    assert.equal(unsupported.status, 200);
    assertCanaryFree("unsupported MCP protocol", unsupported);

    const headers = await initialize(held.port);
    const listed = await request(held.port, "/mcp", {
      token: AGENT_TOKEN,
      method: "POST",
      headers,
      body: { jsonrpc: "2.0", id: "tools-list", method: "tools/list", params: {} },
    });
    assert.equal(listed.status, 200);
    assertCanaryFree("MCP tools/list", listed);
    assert.deepEqual(JSON.parse(listed.body).result.tools.map((tool) => tool.name), [
      "gkos_capabilities",
      "gkos_record_validate",
      "gkos_record_assess",
      "gkos_lineage_get",
      "gkos_graph_at_time",
      "gkos_navigation_discover",
      "gkos_navigation_audit",
      "gkos_note_read",
      "gkos_record_resolve",
      "gkos_search",
    ]);

    stream = await openEvents(held.port);
    assert.equal(stream.res.statusCode, 200);
    assertCanaryFree("SSE response headers", stream.res.headers);
    let sseBytes = "";
    stream.res.on("data", (chunk) => { sseBytes += chunk.toString("utf8"); });

    held.events.append({
      session_id: "session:canary-filter",
      operation_id: "operation:canary-filter",
      agent_id: "agent:canary",
      agent_label: "Canary agent",
      tool: "gkos_navigation_discover",
      paths: ["Visible/Older.md", HIDDEN_PATH],
      status: "completed",
      cost_units: null,
    }, Date.parse(AT));

    await mcp(held.port, headers, "capabilities", "gkos_capabilities", {});
    const discovery = await mcp(held.port, headers, "discover", "gkos_navigation_discover", {
      scope_ref: null,
      cursor: null,
      limit: 100,
    });
    assert.equal(discovery.isError, false);
    const scopeRef = discovery.structuredContent.scope_ref;
    const recordRef = discovery.structuredContent.items.find((item) => item.canonical_path === "Visible/Older.md")?.record_ref;
    assert.equal(typeof scopeRef, "string");
    assert.equal(typeof recordRef, "string");

    await mcp(held.port, headers, "validate", "gkos_record_validate", { record_ref: recordRef });
    await mcp(held.port, headers, "assess", "gkos_record_assess", { record_ref: recordRef });
    await mcp(held.port, headers, "lineage", "gkos_lineage_get", { record_ref: recordRef, cursor: null, limit: 100 });
    await mcp(held.port, headers, "temporal", "gkos_graph_at_time", { scope_ref: scopeRef, at: AT, state: "all", cursor: null, limit: 100 });
    await mcp(held.port, headers, "audit", "gkos_navigation_audit", { scope_ref: scopeRef, severity_at_least: "info", cursor: null, limit: 100 });
    const resolved = await mcp(held.port, headers, "resolve-visible", "gkos_record_resolve", { canonical_path: "Visible/Older.md" });
    assert.equal(resolved.isError, false);
    assert.equal((await mcp(held.port, headers, "resolve-hidden", "gkos_record_resolve", { canonical_path: HIDDEN_PATH })).isError, true);
    const compact = await mcp(held.port, headers, "compact-hidden", "gkos_navigation_discover", { cursor: null, limit: 100, detail: "compact", path_prefix: HIDDEN_PATH });
    assert.equal(compact.isError, false);
    assert.deepEqual(compact.structuredContent.items, []);
    const invalidReference = await mcp(held.port, headers, "invalid-ref", "gkos_record_validate", { record_ref: `gkrec1_${"A".repeat(21)}A` });
    assert.equal(invalidReference.isError, true);

    const unknownTool = await request(held.port, "/mcp", {
      token: AGENT_TOKEN,
      method: "POST",
      headers,
      body: { jsonrpc: "2.0", id: "unknown-tool", method: "tools/call", params: { name: "not_a_tool", arguments: {} } },
    });
    const unknownMethod = await request(held.port, "/mcp", {
      token: AGENT_TOKEN,
      method: "POST",
      headers,
      body: { jsonrpc: "2.0", id: "unknown-method", method: "not/a/method", params: {} },
    });
    assertCanaryFree("MCP unknown tool error", unknownTool);
    assertCanaryFree("MCP unknown method error", unknownMethod);
    assert.equal(JSON.parse(unknownTool.body).error.code, -32602);
    assert.equal(JSON.parse(unknownMethod.body).error.code, -32601);

    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("timed out waiting for bounded SSE canary fixture")), 2_000);
      const inspect = () => {
        const count = (sseBytes.match(/event: traversal/gu) ?? []).length;
        if (count >= 9) {
          clearTimeout(deadline);
          resolve();
        } else {
          setTimeout(inspect, 5);
        }
      };
      inspect();
    });
    assertCanaryFree("SSE traversal bytes", sseBytes);
    assert.match(sseBytes, /"paths":\["Visible\/Older\.md"\]/u, "mixed-path event preserves only its visible path");

    const malformedResume = await request(held.port, "/events", { token: VIEWER_TOKEN, headers: { "last-event-id": "invalid" } });
    const wrongSession = await request(held.port, "/events", {
      token: VIEWER_TOKEN,
      headers: { "last-event-id": "1", "gkos-event-session": "event-stream:wrong" },
    });
    assert.deepEqual([malformedResume.status, wrongSession.status], [400, 409]);
    assertCanaryFree("SSE malformed resume error", malformedResume);
    assertCanaryFree("SSE wrong-session error", wrongSession);

    stream.res.destroy();
    stream.req.destroy();
    stream = undefined;

    held.credentials.setRevoked("credential:legacy-viewer", true);
    const revokedViewer = await request(held.port, "/graph", { token: VIEWER_TOKEN });
    assert.equal(revokedViewer.status, 401);
    assert.equal(revokedViewer.body, missing.body);
    assertCanaryFree("revoked viewer denial", revokedViewer);

    held.credentials.setRevoked("credential:canary-agent", true);
    const revokedAgent = await request(held.port, "/mcp", {
      token: AGENT_TOKEN,
      method: "POST",
      headers,
      body: { jsonrpc: "2.0", id: "revoked", method: "ping" },
    });
    assert.equal(revokedAgent.status, 401);
    assertCanaryFree("revoked MCP denial", revokedAgent);

    const statusPaths = defaultCredentialStatusPaths(
      "C:/private-state/desktop-agent.token",
      {
        tokenPath: "C:/private-state/desktop-agent.mcp.token",
        identityPath: "C:/private-state/desktop-agent.mcp.identity.json",
      },
    );
    const logLine = formatDefaultCredentialPaths(
      statusPaths.token_path,
      { tokenPath: statusPaths.mcp_token_path, identityPath: statusPaths.mcp_identity_path },
      "C:/private-state/desktop-agent.status.json",
    );
    assertCanaryFree("status helper output", statusPaths);
    assertCanaryFree("log-safe helper output", logLine);
  } finally {
    if (stream) {
      stream.res.destroy();
      stream.req.destroy();
    }
    held.server.close();
    await once(held.server, "close");
  }
});
