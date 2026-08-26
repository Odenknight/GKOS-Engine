import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, truncateSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

import {
  ensureWatcherDirectory,
  closeWatcherJournal,
  createWatcherRemovalAdapterCapability,
  deliverWatcherSourceRemovals,
  openWatcherJournal,
  openWatcherDirectory,
  loadIngestProfile,
  readWatcherCoherentManifest,
  readWatcherCurrentActivationAuthority,
  readWatcherPointer,
  readWatcherTopology,
  resetWatcherJournalState,
  runGkosCli,
  secureWatcherSourceScan,
  releaseWatcherRemovalAdapterCapability,
  startWatcherHost,
  startWatcherService,
  validateWatcherJournalAdoptionProjection,
  watcherStatusRecord,
  watcherStatusText,
  watcherFailureRetryDelay,
  watcherWindowsScopedPollingAdmittedForTest,
  watcherDigest,
  writeNewWatcherFile,
} from "../dist/watcher-host.mjs";
import { runSearch } from "../bin/gkx.mjs";
import {
  detectSqliteLexicalCapability,
  retrievalCanonicalDigest,
  RETRIEVAL_GKX_PROJECTION_PROFILE,
  RETRIEVAL_GKX_STANDARD_COMMIT,
} from "../dist/retrieval.mjs";
import { acquireLegacyRetrievalWriter, releaseLegacyRetrievalWriter } from "../dist/retrieval-host.mjs";
import { main as runDesktopAgentMain } from "../dist/gkos-desktop-agent.mjs";

const DIGEST = `sha256:${"a".repeat(64)}`;
const SERVICE_ID = "019b2d14-4233-7db7-87d4-7d81cfaec932";
const LEXICAL_CAPABILITY = detectSqliteLexicalCapability();

test("Windows scoped polling admits only the governed bounded leaf set", () => {
  assert.equal(watcherWindowsScopedPollingAdmittedForTest(0), true);
  assert.equal(watcherWindowsScopedPollingAdmittedForTest(2_000), true);
  assert.equal(watcherWindowsScopedPollingAdmittedForTest(2_001), false);
  assert.equal(watcherWindowsScopedPollingAdmittedForTest(1_000_000), false);
  assert.throws(() => watcherWindowsScopedPollingAdmittedForTest(-1), /GKX_WATCHER_POLL_ADMISSION_INVALID/u);
});

test("Linux shutdown cannot reopen a native watcher after a refresh hook has yielded", {
  skip: process.platform !== "linux"
    ? "Linux native-watcher regression"
    : LEXICAL_CAPABILITY.fts5_available
      ? false
      : "physical SQLite FTS5 unavailable",
}, async () => {
  const watcherModule = new URL("../dist/watcher-host.mjs", import.meta.url).href;
  const childScript = `
    import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
    import { tmpdir } from "node:os";
    import { join } from "node:path";
    import { startWatcherHost } from ${JSON.stringify(watcherModule)};

    const digest = \`sha256:\${"a".repeat(64)}\`;
    const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-shutdown-refresh-"));
    chmodSync(sandbox, 0o700);
    const vault = join(sandbox, "vault");
    const status = join(sandbox, "status");
    mkdirSync(vault, { mode: 0o700 });
    mkdirSync(status, { mode: 0o700 });
    writeFileSync(join(status, "desktop-agent.token"), "shutdown-refresh-token\\n", { mode: 0o600 });
    writeFileSync(join(vault, "accepted.md"), \`---
gkx_version: "2.3"
uid: "019b2d14-4230-7db7-87d4-7d81cfaec932"
title: "Accepted"
type: "policy"
created_at: "2026-08-20T00:00:00Z"
epistemic_state: "reported"
sensitivity: "public"
---
# Accepted
Shutdown refresh body.
\`, { mode: 0o600 });

    let armed = false;
    let entered = false;
    let releaseRefresh;
    const refreshReleased = new Promise((resolve) => { releaseRefresh = resolve; });
    let markEntered;
    const refreshEntered = new Promise((resolve) => { markEntered = resolve; });
    const host = await startWatcherHost({
      vault_root: vault,
      status_file: join(status, "desktop-agent-status.json"),
      vault_id: "vault",
      configuration_digest: digest,
      policy_digest: digest,
      periodic_reconciliation_ms: 60_000,
      on_before_watcher_refresh: async () => {
        if (!armed || entered) return;
        entered = true;
        markEntered();
        await refreshReleased;
      },
      coordinator_options: {
        discoverability_policy: () => "allow",
        source_discoverability_policy: () => "allow",
      },
    });
    armed = true;
    const reconciliation = host.reconcile("event");
    await refreshEntered;
    const shutdown = host.shutdown();
    releaseRefresh();
    await reconciliation;
    await shutdown;
    await host.closed;
    rmSync(sandbox, { recursive: true, force: true });
    console.log("closed");
  `;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", childScript], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (part) => stdout.push(part));
  child.stderr.on("data", (part) => stderr.push(part));
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Linux watcher shutdown child did not exit naturally within 45 seconds"));
    }, 45_000);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("close", (status, signal) => { clearTimeout(timeout); resolve({ status, signal }); });
  });
  const stderrText = Buffer.concat(stderr).toString("utf8");
  assert.deepEqual(result, { status: 0, signal: null }, stderrText);
  if (stderrText !== "") {
    assert.match(stderrText,
      /^\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature and might change at any time\n\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)\n$/u,
      "the shutdown child may emit only Node 22's exact known SQLite experimental warning");
  }
  assert.equal(Buffer.concat(stdout).toString("utf8"), "closed\n");
});

function physicalWatcherFts5Available() {
  if (LEXICAL_CAPABILITY.fts5_available) return true;
  assert.equal(LEXICAL_CAPABILITY.default_backend, "sqlite_lexical_scan");
  return false;
}

async function defaultGkxSearchAuthorityCoordinates() {
  const configuration = {
    canonical_authority: {
      standard_commit: RETRIEVAL_GKX_STANDARD_COMMIT,
      projection_profile: RETRIEVAL_GKX_PROJECTION_PROFILE,
    },
    mode: "fts",
    chunker: { version: "gkos-heading-chunker/1", tokenizer: "gkos-ascii-whitespace/1", max_tokens: 400, overlap_tokens: 0 },
    lexical: {
      provider: LEXICAL_CAPABILITY.default_backend,
      tokenizer: LEXICAL_CAPABILITY.fts5_available ? "unicode61 remove_diacritics 2" : "gkos-unicode61-subset-scan/1",
      boosts: { title: 3, heading_path: 2, tags: 1.5, topic: 2, category: 2, text: 1 },
    },
    fusion: { rrf_k: 60 }, diversity: { enabled: false, mmr_lambda: 0.7 },
    parent_expansion: true, parent_expansion_max_child_tokens: 80, configured_host: null,
  };
  return {
    configuration_digest: retrievalCanonicalDigest(configuration),
    policy_digest: retrievalCanonicalDigest({ id: "engine.cli.public-only-discoverability", version: "1.0.0" }),
    effective_profile_digest: (await loadIngestProfile(null)).coordinate.effective_profile_digest,
  };
}

function directoryByteSnapshot(root, prefix = "") {
  const rows = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) rows.push(...directoryByteSnapshot(absolutePath, relativePath));
    else {
      assert.equal(entry.isFile(), true, `unexpected retrieval leaf type: ${relativePath}`);
      rows.push([relativePath, createHash("sha256").update(readFileSync(absolutePath)).digest("hex")]);
    }
  }
  return rows;
}

function statusDirectory(t) {
  const root = mkdtempSync(join(tmpdir(), "gkos-watcher-service-"));
  if (process.platform !== "win32") chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const parent = openWatcherDirectory(root);
  const directory = ensureWatcherDirectory(join(root, "status"), parent);
  writeNewWatcherFile(directory, "desktop-agent.token", Buffer.from("watcher-test-token\n", "utf8"));
  return directory;
}

function freshStatus() {
  return watcherStatusRecord({
    service_instance_id: SERVICE_ID,
    watcher_state: "serving",
    freshness: "fresh",
    reason_codes: [],
    document_count: 2,
    chunk_count: 3,
    embedding_model: null,
    last_sync: "2026-08-20T00:00:01.000Z",
    uptime_ms: 1_234,
    pid: process.pid,
    source_snapshot_digest: DIGEST,
    coherent_manifest_digest: DIGEST,
    configuration_digest: DIGEST,
    policy_digest: DIGEST,
  });
}

async function freeLoopbackPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitFor(check, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = check();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting for watcher host state");
}

test("loopback watcher service publishes a sealed locator, serves status, and removes only its locator on shared shutdown", async (t) => {
  const directory = statusDirectory(t);
  const status = freshStatus();
  let shutdownCount = 0;
  const shutdownOrder = [];
  const service = await startWatcherService({
    status_directory: directory,
    service_instance_id: SERVICE_ID,
    host_lock_owner_nonce: "a".repeat(32),
    get_status: () => status,
    on_stopping() { shutdownOrder.push("stopping"); },
    on_shutdown({ signal, deadline_ms }) {
      assert.equal(signal.aborted, false);
      assert.ok(deadline_ms > Date.now());
      shutdownOrder.push("drained");
      shutdownCount += 1;
    },
  });
  const locatorPath = join(directory.path, "watcher-service-locator.json");
  const locator = JSON.parse(readFileSync(locatorPath, "utf8"));
  assert.deepEqual(locator, service.locator);
  assert.equal(locator.loopback_host, "127.0.0.1");
  const origin = `http://127.0.0.1:${locator.port}`;

  const unauthorized = await fetch(`${origin}/status`);
  assert.equal(unauthorized.status, 401);

  const response = await fetch(`${origin}/status`, {
    headers: { authorization: "Bearer watcher-test-token" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), status);
  assert.equal(watcherStatusText(status), [
    "gkos status",
    "documents: 2",
    "chunks: 3",
    "embedding_model: null",
    "watcher_state: serving",
    "freshness: fresh",
    "last_sync: 2026-08-20T00:00:01.000Z",
    "uptime_ms: 1234",
    `pid: ${process.pid}`,
    "reasons: []",
    "",
  ].join("\n"));

  const badBody = await fetch(`${origin}/control/shutdown`, {
    method: "POST",
    headers: { authorization: "Bearer watcher-test-token" },
    body: "x",
  });
  assert.equal(badBody.status, 400);

  const shutdown = await fetch(`${origin}/control/shutdown`, {
    method: "POST",
    headers: { authorization: "Bearer watcher-test-token" },
  });
  assert.equal(shutdown.status, 202);
  assert.equal(await shutdown.text(), '{"status":"stopping"}\n');
  await service.closed;
  assert.equal(shutdownCount, 1);
  assert.deepEqual(shutdownOrder, ["stopping", "drained"]);
  assert.throws(() => readFileSync(locatorPath), /ENOENT/u);
  assert.equal(readFileSync(join(directory.path, "desktop-agent.token"), "utf8"), "watcher-test-token\n");
});

test("desktop main delegates legacy routes to one coherent watcher host and shared shutdown", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-desktop-host-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  const vault = join(sandbox, "vault");
  const statusRoot = join(sandbox, "custom-state");
  const statusFile = join(statusRoot, "desktop-agent.status.json");
  mkdirSync(vault, { mode: 0o700 });
  mkdirSync(statusRoot, { mode: 0o700 });
  if (process.platform !== "win32") { chmodSync(vault, 0o700); chmodSync(statusRoot, 0o700); }
  writeFileSync(join(vault, "accepted.md"), `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\n---\n# Accepted\nDesktop coherent body.\n`, { mode: 0o600 });
  const port = await freeLoopbackPort();
  const child = spawn(process.execPath, [
    fileURLToPath(new URL("../dist/gkos-desktop-agent.mjs", import.meta.url)),
    "--notes", vault,
    "--default-sensitivity", "internal",
    "--port", String(port),
    "--status-file", statusFile,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8"); child.stderr.on("data", (chunk) => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null) child.kill();
    if (child.exitCode === null) await once(child, "exit").catch(() => undefined);
    rmSync(sandbox, { recursive: true, force: true });
  });

  const locator = await waitFor(() => {
    try { return JSON.parse(readFileSync(join(statusRoot, "watcher-service-locator.json"), "utf8")); }
    catch { return child.exitCode === null ? null : (() => { throw new Error(`desktop host exited ${String(child.exitCode)}: ${stderr}`); })(); }
  });
  assert.equal(locator.port, port);
  const token = readFileSync(join(statusRoot, "desktop-agent.token"), "utf8").trim();
  const headers = { authorization: `Bearer ${token}` };
  const rootResponse = await fetch(`http://127.0.0.1:${port}/`, { headers });
  assert.equal(rootResponse.status, 200);
  const safeHealth = await rootResponse.json();
  assert.equal(safeHealth.state, "serving");
  assert.equal(safeHealth.visible_counts.notes, 1);
  assert.equal(JSON.stringify(safeHealth).includes(statusRoot), false);
  const notes = await (await fetch(`http://127.0.0.1:${port}/notes`, { headers })).json();
  assert.equal(notes.count, 1);
  assert.equal(notes.notes[0].sensitivity, "internal");
  const graph = await (await fetch(`http://127.0.0.1:${port}/graph`, { headers })).json();
  assert.ok(graph.nodes.some((node) => node.path === "accepted.md"));
  const episodes = await (await fetch(`http://127.0.0.1:${port}/graphiti/episodes`, { headers })).json();
  assert.ok(episodes.count >= 1);
  const watcherStatus = await (await fetch(`http://127.0.0.1:${port}/status`, { headers })).json();
  assert.equal(watcherStatus.watcher_state, "serving");
  assert.equal(watcherStatus.freshness, "fresh");
  const absentRetrieval = await fetch(`http://127.0.0.1:${port}/retrieval`, { headers });
  assert.equal(absentRetrieval.status, 404);
  assert.equal(await absentRetrieval.text(), '{"error":"not_found"}');

  const mcpToken = readFileSync(join(statusRoot, "desktop-agent.mcp.token"), "utf8").trim();
  assert.notEqual(mcpToken, token);
  const viewerMcp = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}",
  });
  assert.equal(viewerMcp.status, 403);
  const agentGraph = await fetch(`http://127.0.0.1:${port}/graph`, { headers: { authorization: `Bearer ${mcpToken}` } });
  assert.equal(agentGraph.status, 403);

  const eventAbort = new AbortController();
  const eventResponse = await fetch(`http://127.0.0.1:${port}/events`, { headers, signal: eventAbort.signal });
  assert.equal(eventResponse.status, 200);
  const initialized = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${mcpToken}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "init", method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "watcher-fixture", version: "1" } } }),
  });
  assert.equal(initialized.status, 200);
  const mcpSession = initialized.headers.get("mcp-session-id");
  const mcpHeaders = { authorization: `Bearer ${mcpToken}`, "content-type": "application/json", "mcp-session-id": mcpSession, "mcp-protocol-version": "2025-11-25" };
  assert.equal((await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: mcpHeaders, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) })).status, 202);
  const discoveryResponse = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: mcpHeaders, body: JSON.stringify({ jsonrpc: "2.0", id: "discover", method: "tools/call", params: { name: "gkos_navigation_discover", arguments: { scope_ref: null, cursor: null, limit: 20 } } }) });
  const discovery = (await discoveryResponse.json()).result.structuredContent;
  assert.deepEqual(discovery.items.map((item) => item.canonical_path), ["accepted.md"]);
  const eventReader = eventResponse.body.getReader();
  const eventRead = eventReader.read();
  const eventChunk = await Promise.race([eventRead, new Promise((_, reject) => setTimeout(() => reject(new Error("event timeout")), 5000))]);
  const eventText = Buffer.from(eventChunk.value).toString("utf8");
  assert.match(eventText, /event: traversal/);
  const event = JSON.parse(/^data: (.+)$/mu.exec(eventText)[1]);
  assert.equal(event.operation_id, discovery.request_id);
  assert.deepEqual(event.paths, ["accepted.md"]);
  const shutdown = await fetch(`http://127.0.0.1:${port}/control/shutdown`, { method: "POST", headers });
  assert.equal(shutdown.status, 202);
  assert.equal(await shutdown.text(), '{"status":"stopping"}\n');
  const [exitCode] = await once(child, "exit");
  assert.equal(exitCode, 0, `${stdout}\n${stderr}`);
  const streamEnd = await eventReader.read().catch(() => ({ done: true }));
  assert.equal(streamEnd.done, true, "shutdown closes the active viewer stream before watcher cleanup");
  assert.equal(existsSync(join(statusRoot, "watcher-service-locator.json")), false);
  assert.equal(existsSync(join(vault, ".gkx", "derived", "watcher", "watcher-authority.lock")), false);
  const finalStatus = JSON.parse(readFileSync(statusFile, "utf8"));
  assert.equal(finalStatus.token_path, join(statusRoot, "desktop-agent.token"));
  assert.equal(finalStatus.mcp_token_path, join(statusRoot, "desktop-agent.mcp.token"));
  assert.equal(finalStatus.mcp_identity_path, join(statusRoot, "desktop-agent.mcp.identity.json"));
  const produced = `${stdout}\n${stderr}\n${JSON.stringify(finalStatus)}`;
  assert.equal(produced.includes(token), false);
  assert.equal(produced.includes(mcpToken), false);
  assert.match(stdout, /viewer credential: .*desktop-agent\.token/);
  assert.match(stdout, /MCP credential: .*desktop-agent\.mcp\.token/);
});

test("desktop rejects an unsafe custom S before token or status mutation", async (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-unsafe-status-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const vault = join(sandbox, "vault");
  const unsafeRoot = join(sandbox, "not-a-directory");
  mkdirSync(vault, { mode: 0o700 });
  writeFileSync(unsafeRoot, "sentinel\n", { mode: 0o600 });
  const statusFile = join(unsafeRoot, "desktop-agent.status.json");
  await assert.rejects(() => runDesktopAgentMain([
    "--notes", vault, "--status-file", statusFile, "--port", "4317",
  ]), /GKX_WATCHER_(?:FS_DIRECTORY|STATUS_DIRECTORY)/u);
  assert.equal(readFileSync(unsafeRoot, "utf8"), "sentinel\n");
  assert.equal(existsSync(join(unsafeRoot, "desktop-agent.token")), false);
  assert.equal(existsSync(statusFile), false);
});

test("configured removal adapter is process-verified and receives one durable idempotent occurrence", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-adapter-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  const vault = join(sandbox, "vault");
  const derived = join(vault, ".gkx", "derived");
  const statusRoot = join(sandbox, "status");
  mkdirSync(derived, { recursive: true, mode: 0o700 });
  mkdirSync(statusRoot, { mode: 0o700 });
  if (process.platform !== "win32") { chmodSync(derived, 0o700); chmodSync(statusRoot, 0o700); }
  writeFileSync(join(statusRoot, "desktop-agent.token"), "adapter-token\n", { flag: "wx", mode: 0o600 });
  const content = `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Accepted\nAdapter body.\n`;
  writeFileSync(join(vault, "accepted.md"), content, { mode: 0o600 });
  const applied = new Map();
  let applyCount = 0;
  const adapter = {
    adapter_kind: "durable_ledger",
    adapter_id: "test.ledger",
    adapter_contract_version: "test-ledger.1",
    authority_namespace: "test.ledger.events",
    prove({ challenge, binding }) {
      const base = {
        contract_version: "gkos-watcher-source-removal-adapter-proof/1.0.0-draft.1",
        challenge_digest: challenge.challenge_digest,
        binding_digest: binding.binding_digest,
        adapter_kind: binding.adapter_kind,
        adapter_id: binding.adapter_id,
        adapter_contract_version: binding.adapter_contract_version,
        authority_namespace: binding.authority_namespace,
        authorization_binding_digest: binding.authorization_binding_digest,
        capabilities: binding.capabilities,
      };
      return { ...base, proof_digest: watcherDigest(base) };
    },
    lookup_by_occurrence_digest(digest) { return applied.get(digest) ?? null; },
    project_source_removal(request) {
      applyCount += 1;
      const eventId = `event.${applyCount}`;
      applied.set(request.occurrence_digest, eventId);
      return eventId;
    },
  };
  const capability = await createWatcherRemovalAdapterCapability({
    trusted_configuration: true,
    adapter,
    vault_id: "vault",
    configuration_digest: DIGEST,
    policy_digest: DIGEST,
  });
  let host;
  t.after(async () => {
    try { if (host) await host.shutdown(); } catch { /* primary assertion owns failure */ }
    try { releaseWatcherRemovalAdapterCapability(capability); } catch { /* already released */ }
    await new Promise((resolve) => setImmediate(resolve));
    rmSync(sandbox, { recursive: true, force: true });
  });
  host = await startWatcherHost({
    vault_root: vault,
    status_file: join(statusRoot, "desktop-agent-status.json"),
    vault_id: "vault",
    configuration_digest: DIGEST,
    policy_digest: DIGEST,
    periodic_reconciliation_ms: 60_000,
    removal_adapter: capability,
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  });
  unlinkSync(join(vault, "accepted.md"));
  await host.reconcile("event");
  await host.reconcile("event");
  await host.shutdown();
  await host.closed;
  host = null;
  const reopened = openWatcherJournal(openWatcherDirectory(join(derived, "watcher", "journals")));
  assert.ok(reopened);
  assert.equal(await deliverWatcherSourceRemovals(reopened, capability), 0);
  assert.equal(applyCount, 1);
  assert.equal(reopened.database.prepare("SELECT COUNT(*) AS count FROM source_removal_adapter_responses;").get().count, 1);
  assert.equal(reopened.database.prepare("SELECT COUNT(*) AS count FROM source_removal_receipts;").get().count, 1);
  closeWatcherJournal(reopened);
  releaseWatcherRemovalAdapterCapability(capability);
});

test("reset carry reopens the immediate historical membership and delivers the same occurrence once", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-reset-carry-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  const vault = join(sandbox, "vault");
  const derived = join(vault, ".gkx", "derived");
  const watcherRoot = join(derived, "watcher");
  const journalRoot = join(watcherRoot, "journals");
  const statusRoot = join(sandbox, "status");
  mkdirSync(derived, { recursive: true, mode: 0o700 });
  mkdirSync(statusRoot, { mode: 0o700 });
  if (process.platform !== "win32") { chmodSync(derived, 0o700); chmodSync(statusRoot, 0o700); }
  writeFileSync(join(statusRoot, "desktop-agent.token"), "carry-token\n", { flag: "wx", mode: 0o600 });
  writeFileSync(join(vault, "accepted.md"), `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Accepted\nCarry body.\n`, { mode: 0o600 });
  const applied = new Map();
  let unavailable = true;
  let applyCount = 0;
  const adapter = {
    adapter_kind: "durable_ledger",
    adapter_id: "test.carry-ledger",
    adapter_contract_version: "test-carry-ledger.1",
    authority_namespace: "test.carry-ledger.events",
    prove({ challenge, binding }) {
      const base = {
        contract_version: "gkos-watcher-source-removal-adapter-proof/1.0.0-draft.1",
        challenge_digest: challenge.challenge_digest,
        binding_digest: binding.binding_digest,
        adapter_kind: binding.adapter_kind,
        adapter_id: binding.adapter_id,
        adapter_contract_version: binding.adapter_contract_version,
        authority_namespace: binding.authority_namespace,
        authorization_binding_digest: binding.authorization_binding_digest,
        capabilities: binding.capabilities,
      };
      return { ...base, proof_digest: watcherDigest(base) };
    },
    lookup_by_occurrence_digest(digest) { return applied.get(digest) ?? null; },
    project_source_removal(request) {
      if (unavailable) throw new Error("configured adapter unavailable");
      applyCount += 1;
      const eventId = `carry-event.${applyCount}`;
      applied.set(request.occurrence_digest, eventId);
      return eventId;
    },
  };
  const capability = await createWatcherRemovalAdapterCapability({
    trusted_configuration: true,
    adapter,
    vault_id: "vault",
    configuration_digest: DIGEST,
    policy_digest: DIGEST,
  });
  let host;
  t.after(async () => {
    try { if (host) await host.shutdown(); } catch { /* primary assertion owns failure */ }
    try { releaseWatcherRemovalAdapterCapability(capability); } catch { /* already released */ }
    await new Promise((resolve) => setImmediate(resolve));
    rmSync(sandbox, { recursive: true, force: true });
  });
  const hostOptions = {
    vault_root: vault,
    status_file: join(statusRoot, "desktop-agent-status.json"),
    vault_id: "vault",
    configuration_digest: DIGEST,
    policy_digest: DIGEST,
    periodic_reconciliation_ms: 60_000,
    removal_adapter: capability,
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  };
  host = await startWatcherHost(hostOptions);
  unlinkSync(join(vault, "accepted.md"));
  await host.reconcile("event");
  const degradedResponse = await fetch(`http://127.0.0.1:${host.service.locator.port}/status`, {
    headers: { authorization: "Bearer carry-token" },
  });
  const degraded = await degradedResponse.json();
  assert.equal(degraded.freshness, "degraded");
  await host.shutdown(); await host.closed; host = null;

  const prior = openWatcherJournal(openWatcherDirectory(journalRoot));
  assert.ok(prior);
  const priorGeneration = prior.generation.journal_generation_digest;
  assert.equal(prior.database.prepare("SELECT COUNT(*) AS count FROM source_removal_receipts;").get().count, 0);
  closeWatcherJournal(prior);
  const reset = await runGkosCli([
    "watcher", "journal-reset", "--state", watcherRoot,
    "--expected-journal-generation-digest", priorGeneration,
    "--expected-coherent-manifest-digest", degraded.coherent_manifest_digest,
    "--json",
  ], { reset_journal: resetWatcherJournalState });
  assert.equal(reset.exit_code, 0, reset.stderr);
  const carried = openWatcherJournal(openWatcherDirectory(journalRoot));
  assert.ok(carried);
  assert.equal(carried.database.prepare("SELECT set_kind FROM source_removal_event_sets;").get().set_kind, "reset_carry");
  assert.equal(carried.database.prepare("SELECT COUNT(*) AS count FROM source_removal_receipts;").get().count, 0);
  closeWatcherJournal(carried);

  unavailable = false;
  host = await startWatcherHost(hostOptions);
  await host.shutdown(); await host.closed; host = null;
  const delivered = openWatcherJournal(openWatcherDirectory(journalRoot));
  assert.ok(delivered);
  assert.equal(delivered.database.prepare("SELECT COUNT(*) AS count FROM source_removal_adapter_responses;").get().count, 1);
  assert.equal(delivered.database.prepare("SELECT COUNT(*) AS count FROM source_removal_receipts;").get().count, 1);
  assert.equal(applyCount, 1);
  closeWatcherJournal(delivered);
  releaseWatcherRemovalAdapterCapability(capability);
});

test("host startup publishes one coherent generation, serves it through status/search, and checkpoints before releasing its lock", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-host-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  t.after(async () => {
    // Let Windows deliver any already-queued fs.watch completion after close;
    // the stopped host treats it as inert before the authority tree is removed.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    rmSync(sandbox, { recursive: true, force: true });
  });
  const vault = join(sandbox, "vault");
  const derived = join(vault, ".gkx", "derived");
  const statusRoot = join(sandbox, "status");
  mkdirSync(derived, { recursive: true, mode: 0o700 });
  mkdirSync(statusRoot, { mode: 0o700 });
  if (process.platform !== "win32") { chmodSync(derived, 0o700); chmodSync(statusRoot, 0o700); }
  writeFileSync(join(statusRoot, "desktop-agent.token"), "host-token\n", { flag: "wx", mode: 0o600 });
  const content = `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Accepted\nBody.\n`;
  writeFileSync(join(vault, "accepted.md"), content, { mode: 0o600 });

  const searchAuthority = await defaultGkxSearchAuthorityCoordinates();
  const hostExecutions = [];
  const host = await startWatcherHost({
    vault_root: vault,
    status_file: join(statusRoot, "desktop-agent-status.json"),
    vault_id: "vault",
    configuration_digest: searchAuthority.configuration_digest,
    policy_digest: searchAuthority.policy_digest,
    // Exercise the minimum governed interval: it must be re-armed only after
    // reconciliation completes and cannot invalidate this request mid-proof.
    periodic_reconciliation_ms: 500,
    on_index_execution: (receipt) => hostExecutions.push(receipt),
    coordinator_options: {
      discoverability_policy: () => "allow",
      source_discoverability_policy: () => "allow",
    },
  });
  let hostClosed = false;
  t.after(async () => {
    if (!hostClosed) {
      try { await host.shutdown(); await host.closed; } catch { /* primary assertion owns the failure */ }
    }
  });
  const origin = `http://127.0.0.1:${host.service.locator.port}`;
  const statusResponse = await fetch(`${origin}/status`, { headers: { authorization: "Bearer host-token" } });
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.equal(status.watcher_state, "serving");
  assert.equal(status.freshness, "fresh");
  assert.equal(status.document_count, 1);
  assert.ok(status.chunk_count >= 1);
  const cliStatus = await runGkosCli(["status", "--state", statusRoot]);
  assert.equal(cliStatus.exit_code, 0);
  assert.equal(cliStatus.stderr, "");
  assert.match(cliStatus.stdout, /^gkos status\ndocuments: 1\nchunks: [1-9][0-9]*\n/u);
  const cliJson = await runGkosCli(["status", "--state", statusRoot, "--json"]);
  assert.equal(cliJson.exit_code, 0, JSON.stringify(cliJson));
  const cliJsonStatus = JSON.parse(cliJson.stdout);
  assert.equal(cliJsonStatus.service_instance_id, status.service_instance_id);
  assert.equal(cliJsonStatus.coherent_manifest_digest, status.coherent_manifest_digest);
  assert.equal(cliJsonStatus.source_snapshot_digest, status.source_snapshot_digest);
  assert.ok(cliJsonStatus.uptime_ms >= status.uptime_ms);
  // Simulate a lost filesystem hint: the authenticated request itself must
  // securely scan and reconcile before it can report fresh authority.
  writeFileSync(join(vault, "accepted.md"), content.replace("Body.", "Body request-local refresh."), { mode: 0o600 });
  const requestFreshResponse = await fetch(`${origin}/status`, { headers: { authorization: "Bearer host-token" } });
  assert.equal(requestFreshResponse.status, 200);
  const requestFresh = await requestFreshResponse.json();
  assert.equal(requestFresh.freshness, "fresh", JSON.stringify({ requestFresh, hostExecutions }));
  assert.notEqual(requestFresh.source_snapshot_digest, status.source_snapshot_digest);
  assert.deepEqual(await runGkosCli(["status", "-h"]), {
    stdout: "", stderr: "gkos status: invalid arguments\n", exit_code: 2,
  });
  const result = await host.search({ query: "Body", limit: 5 });
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].chunk.source_path, "accepted.md");
  let watcherRoute = false;
  const external = await runSearch("Body", vault, 5, {
    onAuthorityRouteObserved(value) { watcherRoute = value; },
  });
  assert.equal(watcherRoute, true);
  assert.equal(external.hits.length, 1);
  assert.equal(external.hits[0].chunk.source_path, "accepted.md");
  writeFileSync(join(vault, "accepted.md"), content.replace("Body.", "Fresh external convergence."), { mode: 0o600 });
  const convergedExternal = await runSearch("Fresh external convergence", vault, 5, {
    onAuthorityRouteObserved(value) { watcherRoute = value; },
  });
  assert.equal(convergedExternal.hits.length, 1,
    "external gkx search must join watcher reconciliation instead of serving the stale generation");
  assert.equal(convergedExternal.hits[0].chunk.source_path, "accepted.md");
  unlinkSync(join(vault, "accepted.md"));
  await host.reconcile("event");
  const removed = await host.search({ query: "Body", limit: 5 });
  assert.equal(removed.hits.length, 0);
  await host.shutdown();
  await host.closed;
  hostClosed = true;
  assert.equal(existsSync(join(derived, "watcher", "watcher-authority.lock")), false);
  assert.equal(existsSync(join(statusRoot, "watcher-service-locator.json")), false);
  assert.equal(existsSync(join(derived, "watcher", "watcher-active.json")), true);
  const reopenedJournal = openWatcherJournal(openWatcherDirectory(join(derived, "watcher", "journals")));
  assert.ok(reopenedJournal);
  assert.equal(reopenedJournal.database.prepare("SELECT COUNT(*) AS count FROM source_removal_occurrences;").get().count, 1);
  assert.equal(reopenedJournal.database.prepare("SELECT delivery_mode FROM source_removal_events;").get().delivery_mode, "local_only");
  assert.equal(reopenedJournal.database.prepare("SELECT COUNT(*) AS count FROM activated_source_removal_event_sets;").get().count, 1);
  closeWatcherJournal(reopenedJournal);
});

test("periodic reconciliation is re-armed only after an intervening ordinary reconciliation completes", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-periodic-clock-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const vault = join(sandbox, "vault");
  const derived = join(vault, ".gkx", "derived");
  const statusRoot = join(sandbox, "status");
  mkdirSync(derived, { recursive: true, mode: 0o700 });
  mkdirSync(statusRoot, { mode: 0o700 });
  if (process.platform !== "win32") { chmodSync(derived, 0o700); chmodSync(statusRoot, 0o700); }
  writeFileSync(join(statusRoot, "desktop-agent.token"), "periodic-clock-token\n", { flag: "wx", mode: 0o600 });
  writeFileSync(join(vault, "accepted.md"), `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Accepted\nPeriodic clock body.\n`, { mode: 0o600 });

  let now = 0;
  const timers = [];
  const clock = {
    set_timeout(callback, delay_ms) {
      const handle = { callback, due: now + delay_ms, cancelled: false, fired: false };
      timers.push(handle);
      return handle;
    },
    clear_timeout(handle) { handle.cancelled = true; },
  };
  const fireDue = () => {
    for (const timer of timers.filter((value) => !value.cancelled && !value.fired && value.due <= now)
      .sort((left, right) => left.due - right.due)) {
      timer.fired = true;
      timer.callback();
    }
  };
  const executions = [];
  const host = await startWatcherHost({
    vault_root: vault,
    status_file: join(statusRoot, "desktop-agent-status.json"),
    vault_id: "vault",
    configuration_digest: DIGEST,
    policy_digest: DIGEST,
    periodic_reconciliation_ms: 500,
    periodic_clock: clock,
    on_index_execution(receipt) { executions.push(receipt); },
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  });
  let closed = false;
  t.after(async () => { if (!closed) try { await host.shutdown(); await host.closed; } catch { /* primary assertion */ } });
  executions.length = 0;
  const initialTimer = timers.find((value) => !value.cancelled && !value.fired);
  assert.ok(initialTimer, JSON.stringify(timers.map(({ due, cancelled, fired }) => ({ due, cancelled, fired }))));
  assert.equal(initialTimer.due, 500);

  now = 460;
  const ordinary = host.reconcile("event");
  assert.equal(initialTimer.cancelled, true, "ordinary reconciliation cancels the previously armed periodic deadline");
  now = 500;
  fireDue();
  await ordinary;
  assert.equal(executions.length, 1);
  const rearmed = timers.find((value) => !value.cancelled && !value.fired);
  assert.ok(rearmed);
  assert.equal(rearmed.due, 1_000, "periodic delay starts at the intervening reconciliation completion");

  now = 999;
  fireDue();
  assert.equal(executions.length, 1);
  now = 1_000;
  fireDue();
  await waitFor(() => executions.length === 2 ? true : null);
  assert.equal(executions.length, 2);
  await host.shutdown(); await host.closed; closed = true;
});

test("deterministic oversized scanner rejection publishes one coherent N-1 topology", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-oversized-rejection-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  const vault = join(sandbox, "vault");
  const derived = join(vault, ".gkx", "derived");
  const statusRoot = join(sandbox, "status");
  mkdirSync(derived, { recursive: true, mode: 0o700 });
  mkdirSync(statusRoot, { mode: 0o700 });
  if (process.platform !== "win32") { chmodSync(derived, 0o700); chmodSync(statusRoot, 0o700); }
  writeFileSync(join(statusRoot, "desktop-agent.token"), "oversized-token\n", { flag: "wx", mode: 0o600 });
  writeFileSync(join(vault, "accepted.md"), `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Accepted\nOversized-rejection control body.\n`, { mode: 0o600 });
  const oversizedPath = join(vault, "oversized.md");
  writeFileSync(oversizedPath, "", { mode: 0o600 });
  truncateSync(oversizedPath, 64 * 1024 * 1024 + 1);
  let host = await startWatcherHost({
    vault_root: vault,
    status_file: join(statusRoot, "desktop-agent-status.json"),
    vault_id: "vault",
    configuration_digest: DIGEST,
    policy_digest: DIGEST,
    periodic_reconciliation_ms: 60_000,
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  });
  let closed = false;
  t.after(async () => {
    if (!closed) try { await host.shutdown(); await host.closed; } catch { /* primary assertion */ }
    await new Promise((resolve) => setImmediate(resolve));
    rmSync(sandbox, { recursive: true, force: true });
  });
  const watcher = openWatcherDirectory(join(derived, "watcher"));
  const pointer = readWatcherPointer(watcher, "outer");
  assert.ok(pointer);
  const manifest = readWatcherCoherentManifest(watcher, pointer);
  const topology = readWatcherTopology(watcher, manifest);
  const rejected = topology.rejected_sources.find((row) => row.source_path === "oversized.md");
  assert.ok(rejected, "the deterministic pre-NoteRecord rejection must reach the coherent N-1 topology");
  assert.equal(rejected.rejection_class, "scan_rejection");
  assert.equal(rejected.source_size_bytes, null);
  assert.equal(host.status().document_count, 1);
  assert.equal(host.status().freshness, "degraded");
  unlinkSync(oversizedPath);
  await host.reconcile("event");
  assert.equal(host.status().freshness, "fresh");
  await host.shutdown(); await host.closed; closed = true;
});

test("durable failure retry uses exact backoff and unchanged success clears restart authority", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 20].map(watcherFailureRetryDelay), [500, 1_000, 2_000, 4_000, 5_000, 5_000, 5_000]);
  assert.throws(() => watcherFailureRetryDelay(-1), /GKX_WATCHER_RETRY_AUTHORITY_INVALID/u);
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-retry-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  t.after(async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    rmSync(sandbox, { recursive: true, force: true });
  });
  const vault = join(sandbox, "vault");
  const derived = join(vault, ".gkx", "derived");
  const statusRoot = join(sandbox, "status");
  mkdirSync(derived, { recursive: true, mode: 0o700 });
  mkdirSync(statusRoot, { mode: 0o700 });
  if (process.platform !== "win32") { chmodSync(derived, 0o700); chmodSync(statusRoot, 0o700); }
  writeFileSync(join(statusRoot, "desktop-agent.token"), "retry-token\n", { flag: "wx", mode: 0o600 });
  const acceptedPath = join(vault, "accepted.md");
  const acceptedBytes = `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Accepted\nRetry body.\n`;
  writeFileSync(acceptedPath, acceptedBytes, { mode: 0o600 });
  const timers = [];
  const clock = {
    set_timeout(callback, delay_ms) {
      const handle = { callback, delay_ms, cancelled: false };
      timers.push(handle); return handle;
    },
    clear_timeout(handle) { handle.cancelled = true; },
  };
  const executions = [];
  const hostOptions = {
    vault_root: vault, status_file: join(statusRoot, "desktop-agent-status.json"), vault_id: "vault",
    configuration_digest: DIGEST, policy_digest: DIGEST, periodic_reconciliation_ms: 60_000,
    retry_clock: clock,
    on_index_execution(receipt) { executions.push(receipt); },
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  };
  let host = await startWatcherHost(hostOptions);
  executions.length = 0;
  const retrievalBefore = directoryByteSnapshot(join(derived, "retrieval"));
  const pointerBefore = readFileSync(join(derived, "watcher", "watcher-active.json"));
  let closed = false;
  t.after(async () => {
    if (!closed) try { await host.shutdown(); await host.closed; } catch { /* primary assertion */ }
  });
  const unstable = join(vault, "unstable.md");
  const alias = join(vault, "unstable-alias.md");
  writeFileSync(unstable, "# unstable\n", { mode: 0o600 });
  linkSync(unstable, alias);
  await assert.rejects(() => host.reconcile("event"), /WATCHER_SOURCE_CAPABILITY_UNSTABLE/u);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay_ms, 500);
  assert.equal(timers[0].cancelled, false);
  assert.ok(host.status().reason_codes.includes("WATCHER_SOURCE_CAPABILITY_UNSTABLE"));
  await host.shutdown(); await host.closed; closed = true;
  assert.equal(timers[0].cancelled, true, "shutdown cancels only the in-process timer");

  const resumeTimers = [];
  const resumeClock = {
    set_timeout(callback, delay_ms) {
      const handle = { callback, delay_ms, cancelled: false };
      resumeTimers.push(handle); return handle;
    },
    clear_timeout(handle) { handle.cancelled = true; },
  };
  host = await startWatcherHost({ ...hostOptions, retry_clock: resumeClock });
  closed = false;
  assert.equal(resumeTimers.length, 1);
  assert.equal(resumeTimers[0].delay_ms, 1_000,
    "shutdown performs one immediate same-parent retry and restart reconstructs its durable n=1 tail");
  let joinedSettled = false;
  const joined = host.search({ query: "Retry", limit: 5 }).finally(() => { joinedSettled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(joinedSettled, false, "request-local freshness joins the durable timer rather than serving stale");
  resumeTimers[0].callback();
  for (let attempt = 0; attempt < 200 && resumeTimers.length < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(resumeTimers.length, 2);
  assert.equal(resumeTimers[1].delay_ms, 2_000);
  resumeTimers[0].callback();
  assert.equal(resumeTimers.length, 2, "stale timer callback is inert");
  unlinkSync(alias); unlinkSync(unstable);
  assert.doesNotThrow(() => secureWatcherSourceScan(vault));
  resumeTimers[1].callback();
  let retryTimeout;
  const timeout = new Promise((_, reject) => {
    retryTimeout = setTimeout(() => reject(new Error("retry timeout")), 20_000);
  });
  const joinedResult = await Promise.race([joined, timeout]).finally(() => clearTimeout(retryTimeout));
  assert.equal(joinedResult.hits.length, 1);
  assert.equal(resumeTimers.length, 2);
  assert.equal(host.status().reason_codes.includes("WATCHER_SOURCE_CAPABILITY_UNSTABLE"), false);
  assert.deepEqual(executions, [{ execution_kind: "set_files", reparsed_source_count: 1 }]);
  assert.deepEqual(directoryByteSnapshot(join(derived, "retrieval")), retrievalBefore);
  assert.deepEqual(readFileSync(join(derived, "watcher", "watcher-active.json")), pointerBefore);
  await host.shutdown(); await host.closed; closed = true;
  const journals = openWatcherDirectory(join(derived, "watcher", "journals"));
  const reopened = openWatcherJournal(journals);
  assert.ok(reopened);
  assert.equal(reopened.database.prepare("SELECT COUNT(*) AS count FROM transitions WHERE state='failure_reconciliation_noop_complete';").get().count, 1);
  closeWatcherJournal(reopened);

  const restartTimers = [];
  host = await startWatcherHost({ ...hostOptions, retry_clock: {
    set_timeout(callback, delay_ms) { const value = { callback, delay_ms }; restartTimers.push(value); return value; },
    clear_timeout() {},
  } });
  closed = false;
  assert.equal(restartTimers.length, 0);
  await host.shutdown(); await host.closed; closed = true;
});

test("external search never falls back after watcher authority is missing or corrupt", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-search-authority-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  t.after(async () => {
    await new Promise((resolve) => setImmediate(resolve));
    rmSync(sandbox, { recursive: true, force: true });
  });
  const vault = join(sandbox, "vault");
  const derived = join(vault, ".gkx", "derived");
  const watcherRoot = join(derived, "watcher");
  const statusRoot = join(sandbox, "status");
  mkdirSync(derived, { recursive: true, mode: 0o700 });
  mkdirSync(statusRoot, { mode: 0o700 });
  if (process.platform !== "win32") { chmodSync(derived, 0o700); chmodSync(statusRoot, 0o700); }
  writeFileSync(join(statusRoot, "desktop-agent.token"), "authority-token\n", { flag: "wx", mode: 0o600 });
  writeFileSync(join(vault, "accepted.md"), `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Accepted\nAuthority body.\n`, { mode: 0o600 });
  const host = await startWatcherHost({
    vault_root: vault, status_file: join(statusRoot, "desktop-agent-status.json"), vault_id: "vault",
    configuration_digest: DIGEST, policy_digest: DIGEST, periodic_reconciliation_ms: 60_000,
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  });
  await host.shutdown();
  await host.closed;

  const authorityPath = join(watcherRoot, "watcher-authority.json");
  const authorityBytes = readFileSync(authorityPath);
  writeFileSync(authorityPath, '{"unratified":true}\n');
  await assert.rejects(() => runSearch("Authority", vault, 5), /GKX_CLI_WATCHER_SEARCH_AUTHORITY_FAILURE/u);
  writeFileSync(authorityPath, authorityBytes);
  unlinkSync(authorityPath);
  await assert.rejects(() => runSearch("Authority", vault, 5), /GKX_CLI_WATCHER_SEARCH_AUTHORITY_FAILURE/u);
});

test("production external search rejects configuration, policy, and effective-profile coordinate drift", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-search-coordinate-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  t.after(async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    rmSync(sandbox, { recursive: true, force: true });
  });
  const production = await defaultGkxSearchAuthorityCoordinates();
  const profilePath = join(sandbox, "profile-mismatch.toml");
  writeFileSync(profilePath,
    'contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"\nprofile_id = "search-mismatch"\n',
    { flag: "wx", mode: 0o600 });
  const mismatches = [
    { label: "configuration", configuration_digest: DIGEST, policy_digest: production.policy_digest },
    { label: "policy", configuration_digest: production.configuration_digest, policy_digest: DIGEST },
    {
      label: "effective-profile",
      configuration_digest: production.configuration_digest,
      policy_digest: production.policy_digest,
      profile_selector: profilePath,
    },
  ];
  for (const [index, mismatch] of mismatches.entries()) {
    const root = join(sandbox, `case-${index}`);
    const vault = join(root, "vault");
    const derived = join(vault, ".gkx", "derived");
    const statusRoot = join(root, "status");
    mkdirSync(derived, { recursive: true, mode: 0o700 });
    mkdirSync(statusRoot, { mode: 0o700 });
    if (process.platform !== "win32") { chmodSync(derived, 0o700); chmodSync(statusRoot, 0o700); }
    writeFileSync(join(statusRoot, "desktop-agent.token"), `coordinate-${index}-token\n`, { flag: "wx", mode: 0o600 });
    writeFileSync(join(vault, "accepted.md"), `---\ngkx_version: "2.3"\nuid: "019b2d14-423${index}-7db7-87d4-7d81cfaec932"\ntitle: "Coordinate mismatch"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Coordinate mismatch\nMismatch body.\n`, { mode: 0o600 });
    const host = await startWatcherHost({
      vault_root: vault,
      status_file: join(statusRoot, "desktop-agent-status.json"),
      vault_id: "vault",
      configuration_digest: mismatch.configuration_digest,
      policy_digest: mismatch.policy_digest,
      profile_selector: mismatch.profile_selector,
      periodic_reconciliation_ms: 60_000,
      coordinator_options: {
        discoverability_policy: (chunk) => chunk.metadata.sensitivity === "public" ? "allow" : "deny",
        source_discoverability_policy: (source) => source.metadata.sensitivity === "public" ? "allow" : "deny",
      },
    });
    try {
      await assert.rejects(
        () => runSearch("Mismatch", vault, 5, { asOf: "2026-08-20T00:00:00Z" }),
        /GKX_CLI_WATCHER_SEARCH_AUTHORITY_FAILURE/u,
        `${mismatch.label} drift must not select the old watcher generation`,
      );
    } finally {
      await host.shutdown();
      await host.closed;
    }
  }
});

test("watcher excludes a live legacy writer and admits an exact empty W/J genesis contender", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-writer-interlock-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  t.after(async () => { await new Promise((resolve) => setImmediate(resolve)); rmSync(sandbox, { recursive: true, force: true }); });
  const vault = join(sandbox, "vault");
  const derived = join(vault, ".gkx", "derived");
  const retrieval = join(derived, "retrieval");
  const statusRoot = join(sandbox, "status");
  mkdirSync(derived, { recursive: true, mode: 0o700 });
  mkdirSync(statusRoot, { mode: 0o700 });
  if (process.platform !== "win32") { chmodSync(derived, 0o700); chmodSync(statusRoot, 0o700); }
  writeFileSync(join(statusRoot, "desktop-agent.token"), "interlock-token\n", { flag: "wx", mode: 0o600 });
  const derivedCapability = openWatcherDirectory(derived);
  const watcher = ensureWatcherDirectory(join(derived, "watcher"), derivedCapability);
  ensureWatcherDirectory(join(watcher.path, "journals"), watcher);
  const legacy = acquireLegacyRetrievalWriter(retrieval);
  await assert.rejects(() => startWatcherHost({
    vault_root: vault, status_file: join(statusRoot, "desktop-agent-status.json"), vault_id: "vault",
    configuration_digest: DIGEST, policy_digest: DIGEST, periodic_reconciliation_ms: 60_000,
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  }), /GKX_WATCHER_WRITER_INTERLOCKED/u);
  releaseLegacyRetrievalWriter(legacy);

  const host = await startWatcherHost({
    vault_root: vault, status_file: join(statusRoot, "desktop-agent-status.json"), vault_id: "vault",
    configuration_digest: DIGEST, policy_digest: DIGEST, periodic_reconciliation_ms: 60_000,
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  });
  assert.equal(existsSync(join(watcher.path, "watcher-authority.json")), true,
    "precreated exact-empty W/J is a legal genesis contender, not corrupt authority");
  await host.shutdown(); await host.closed;
});

test("local_onnx watcher staging embeds only changed public content and reuses the stable chunk", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-vector-reuse-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  const vault = join(sandbox, "vault");
  const derived = join(vault, ".gkx", "derived");
  const statusRoot = join(sandbox, "status");
  mkdirSync(derived, { recursive: true, mode: 0o700 });
  mkdirSync(statusRoot, { mode: 0o700 });
  if (process.platform !== "win32") { chmodSync(derived, 0o700); chmodSync(statusRoot, 0o700); }
  writeFileSync(join(statusRoot, "desktop-agent.token"), "vector-token\n", { flag: "wx", mode: 0o600 });
  const note = (uid, title, body) => `---\ngkx_version: "2.3"\nuid: "${uid}"\ntitle: "${title}"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# ${title}\n${body}\n`;
  writeFileSync(join(vault, "alpha.md"), note("019b2d14-4230-7db7-87d4-7d81cfaec932", "Alpha", "alpha body"), { mode: 0o600 });
  writeFileSync(join(vault, "omega.md"), note("019b2d14-4231-7db7-87d4-7d81cfaec932", "Omega", "omega body"), { mode: 0o600 });
  const calls = [];
  const vectorProvider = {
    kind: "local_onnx",
    provider_id: "test.local-onnx",
    model_id: "test-two-dimensional",
    dimensions: 2,
    timeout_ms: 5_000,
    async embed(texts) {
      calls.push([...texts]);
      return texts.map((text) => Float32Array.from([text.length, text.charCodeAt(0) || 0]));
    },
  };
  let host;
  const indexExecutions = [];
  let injectedBeforeRefresh = false;
  t.after(async () => {
    try { if (host) await host.shutdown(); } catch { /* primary assertion owns failure */ }
    await new Promise((resolve) => setImmediate(resolve));
    rmSync(sandbox, { recursive: true, force: true });
  });
  host = await startWatcherHost({
    vault_root: vault, status_file: join(statusRoot, "desktop-agent-status.json"), vault_id: "vault",
    configuration_digest: DIGEST, policy_digest: DIGEST, periodic_reconciliation_ms: 60_000,
    on_index_execution: (receipt) => indexExecutions.push(receipt),
    on_before_watcher_refresh: () => {
      if (process.platform === "win32" && indexExecutions.length === 2 && !injectedBeforeRefresh) {
        injectedBeforeRefresh = true;
        writeFileSync(join(vault, "alpha.md"), note(
          "019b2d14-4230-7db7-87d4-7d81cfaec932", "Alpha", "second changed alpha body",
        ));
      }
    },
    coordinator_options: {
      discoverability_policy: () => "allow", source_discoverability_policy: () => "allow",
      vector_provider: vectorProvider,
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 2);
  assert.deepEqual(indexExecutions, [{ execution_kind: "set_files", reparsed_source_count: 2 }]);
  const startupPointer = readWatcherPointer(host.watcher_directory, "outer");
  const startupManifest = readWatcherCoherentManifest(host.watcher_directory, startupPointer);
  const startupTopology = readWatcherTopology(host.watcher_directory, startupManifest);
  assert.deepEqual(startupTopology.accepted_sources.map((row) => [row.source_path, row.source_observation_ordinal]), [
    ["alpha.md", 0],
    ["omega.md", 0],
  ]);
  const stableText = calls[0].find((text) => text.includes("omega body"));
  assert.ok(stableText);

  writeFileSync(join(vault, "alpha.md"), note("019b2d14-4230-7db7-87d4-7d81cfaec932", "Alpha", "changed alpha body"));
  await waitFor(() => indexExecutions.length >= 2 ? true : null);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].length, 1);
  assert.match(calls[1][0], /changed alpha body/u);
  assert.equal(calls[1].includes(stableText), false);
  assert.deepEqual(indexExecutions[1], { execution_kind: "apply_changes", reparsed_source_count: 1 });

  if (process.platform === "win32") {
    await waitFor(() => indexExecutions.length >= 3 ? true : null);
    assert.equal(injectedBeforeRefresh, true);
    assert.equal(calls.length, 3);
    assert.match(calls[2][0], /second changed alpha body/u);
    assert.deepEqual(indexExecutions[2], { execution_kind: "apply_changes", reparsed_source_count: 1 });
  }

  await host.reconcile("event");
  assert.equal(calls.length, process.platform === "win32" ? 3 : 2,
    "an unchanged secure reconciliation must make zero provider calls");
  assert.deepEqual(indexExecutions[process.platform === "win32" ? 3 : 2],
    { execution_kind: "set_files", reparsed_source_count: 2 });
  await host.shutdown();
  await host.closed;
  host = null;
});

test("host restart reclaims a dead normal service lock without changing the coherent generation", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-dead-host-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  t.after(async () => { await new Promise((resolve) => setImmediate(resolve)); rmSync(sandbox, { recursive: true, force: true }); });
  const vault = join(sandbox, "vault");
  const derived = join(vault, ".gkx", "derived");
  const statusRoot = join(sandbox, "status");
  mkdirSync(derived, { recursive: true, mode: 0o700 });
  mkdirSync(statusRoot, { mode: 0o700 });
  if (process.platform !== "win32") { chmodSync(derived, 0o700); chmodSync(statusRoot, 0o700); }
  writeFileSync(join(statusRoot, "desktop-agent.token"), "restart-token\n", { flag: "wx", mode: 0o600 });
  writeFileSync(join(vault, "accepted.md"), `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Accepted\nRestart body.\n`, { mode: 0o600 });
  const moduleUrl = new URL("../dist/watcher-host.mjs", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { startWatcherHost } from ${JSON.stringify(moduleUrl)};
    await startWatcherHost({ vault_root: ${JSON.stringify(vault)}, status_file: ${JSON.stringify(join(statusRoot, "desktop-agent-status.json"))},
      vault_id: "vault", configuration_digest: ${JSON.stringify(DIGEST)}, policy_digest: ${JSON.stringify(DIGEST)},
      periodic_reconciliation_ms: 60000, coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" } });
    process.exit(95);
  `], { encoding: "utf8", timeout: 30_000 });
  assert.equal(child.status, 95, child.stderr);
  const before = readWatcherPointer(openWatcherDirectory(join(derived, "watcher")), "outer");
  assert.ok(before);
  const resumed = await startWatcherHost({
    vault_root: vault, status_file: join(statusRoot, "desktop-agent-status.json"), vault_id: "vault",
    configuration_digest: DIGEST, policy_digest: DIGEST, periodic_reconciliation_ms: 60_000,
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  });
  const after = readWatcherPointer(openWatcherDirectory(join(derived, "watcher")), "outer");
  assert.equal(after.pointer_digest, before.pointer_digest);
  await resumed.shutdown();
  await resumed.closed;
});

test("host startup automatically completes a dead first-process journal bootstrap", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-bootstrap-host-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  t.after(async () => { await new Promise((resolve) => setImmediate(resolve)); rmSync(sandbox, { recursive: true, force: true }); });
  const vault = join(sandbox, "vault");
  const derived = join(vault, ".gkx", "derived");
  const statusRoot = join(sandbox, "status");
  mkdirSync(derived, { recursive: true, mode: 0o700 });
  mkdirSync(statusRoot, { mode: 0o700 });
  if (process.platform !== "win32") { chmodSync(derived, 0o700); chmodSync(statusRoot, 0o700); }
  writeFileSync(join(statusRoot, "desktop-agent.token"), "bootstrap-token\n", { flag: "wx", mode: 0o600 });
  writeFileSync(join(vault, "accepted.md"), `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Accepted\nBootstrap recovery body.\n`, { mode: 0o600 });
  const derivedCapability = openWatcherDirectory(derived);
  const watcher = ensureWatcherDirectory(join(derived, "watcher"), derivedCapability);
  const journals = ensureWatcherDirectory(join(watcher.path, "journals"), watcher);
  ensureWatcherDirectory(join(derived, "retrieval"), derivedCapability);
  const moduleUrl = new URL("../dist/watcher-host.mjs", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { openWatcherDirectory, acquireWatcherHostLock, bootstrapWatcherJournal } from ${JSON.stringify(moduleUrl)};
    const watcher = openWatcherDirectory(${JSON.stringify(watcher.path)}); const journals = openWatcherDirectory(${JSON.stringify(journals.path)});
    const lock = acquireWatcherHostLock(watcher, { operation: "service", service_instance_id: "019b2d14-4233-7db7-87d4-7d81cfaec932",
      prior_pointer_digest: null, prior_coherent_manifest_digest: null, prior_journal_pointer_digest: null });
    bootstrapWatcherJournal({ root: journals, host_lock: lock, coordinates: { vault_id: "vault",
      configuration_digest: ${JSON.stringify(DIGEST)}, policy_digest: ${JSON.stringify(DIGEST)}, effective_profile_digest: "sha256:9ab3b07da4cdfb584c2766762a32dc71653dffd87537ad0a4c9190e3a69015c5",
      anchor_coherent_manifest_digest: null }, on_boundary(value) { if (value === "guard_stage") process.exit(96); } });
  `], { encoding: "utf8", timeout: 30_000 });
  assert.equal(child.status, 96, child.stderr);
  const resumed = await startWatcherHost({
    vault_root: vault, status_file: join(statusRoot, "desktop-agent-status.json"), vault_id: "vault",
    configuration_digest: DIGEST, policy_digest: DIGEST, periodic_reconciliation_ms: 60_000,
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  });
  assert.ok(readWatcherPointer(openWatcherDirectory(watcher.path), "outer"));
  assert.ok(readdirSync(watcher.path).includes("watcher-journal-bootstrap-recovery-bridge.json"));
  await resumed.shutdown();
  await resumed.closed;
});

test("first reset archives the immutable null-anchor genesis journal and anchors its replacement to the current outer generation", async (t) => {
  if (!physicalWatcherFts5Available()) return;
  const sandbox = mkdtempSync(join(tmpdir(), "gkos-watcher-first-reset-"));
  if (process.platform !== "win32") chmodSync(sandbox, 0o700);
  t.after(async () => {
    await new Promise((resolve) => setImmediate(resolve));
    rmSync(sandbox, { recursive: true, force: true });
  });
  const vault = join(sandbox, "vault");
  const derived = join(vault, ".gkx", "derived");
  const statusRoot = join(sandbox, "status");
  mkdirSync(derived, { recursive: true, mode: 0o700 });
  mkdirSync(statusRoot, { mode: 0o700 });
  if (process.platform !== "win32") { chmodSync(derived, 0o700); chmodSync(statusRoot, 0o700); }
  writeFileSync(join(statusRoot, "desktop-agent.token"), "reset-token\n", { flag: "wx", mode: 0o600 });
  writeFileSync(join(vault, "accepted.md"), `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Accepted\nReset body.\n`, { mode: 0o600 });
  const host = await startWatcherHost({
    vault_root: vault,
    status_file: join(statusRoot, "desktop-agent-status.json"),
    vault_id: "vault",
    configuration_digest: DIGEST,
    policy_digest: DIGEST,
    periodic_reconciliation_ms: 60_000,
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  });
  const statusResponse = await fetch(`http://127.0.0.1:${host.service.locator.port}/status`, {
    headers: { authorization: "Bearer reset-token" },
  });
  const status = await statusResponse.json();
  await host.shutdown();
  await host.closed;
  const watcherRoot = join(derived, "watcher");
  const journalRoot = join(watcherRoot, "journals");
  const outerPointerBeforeReset = readWatcherPointer(openWatcherDirectory(watcherRoot), "outer");
  assert.ok(outerPointerBeforeReset);
  const journalDirectory = openWatcherDirectory(journalRoot);
  const oldPointer = readWatcherPointer(journalDirectory, "journal");
  assert.ok(oldPointer);
  const oldHandle = openWatcherJournal(journalDirectory);
  assert.ok(oldHandle);
  assert.equal(oldHandle.meta.anchor_coherent_manifest_digest, null);
  const oldDirectory = oldHandle.generation_directory.path;
  const expectedJournalDigest = oldHandle.generation.journal_generation_digest;
  closeWatcherJournal(oldHandle);
  const retrievalBytesBeforeReset = directoryByteSnapshot(join(derived, "retrieval"));
  const mismatch = await runGkosCli([
    "watcher", "journal-reset", "--state", watcherRoot,
    "--expected-journal-generation-digest", `sha256:${"f".repeat(64)}`,
    "--expected-coherent-manifest-digest", status.coherent_manifest_digest,
  ], { reset_journal: resetWatcherJournalState });
  assert.equal(mismatch.exit_code, 2);
  assert.equal(mismatch.stderr, "gkos watcher journal-reset: expected coordinate mismatch\n");
  const reset = await runGkosCli([
    "watcher", "journal-reset", "--state", watcherRoot,
    "--expected-journal-generation-digest", expectedJournalDigest,
    "--expected-coherent-manifest-digest", status.coherent_manifest_digest,
    "--json",
  ], { reset_journal: resetWatcherJournalState });
  assert.equal(reset.exit_code, 0, reset.stderr);
  const result = JSON.parse(reset.stdout);
  assert.equal(result.prior_journal_generation_digest, expectedJournalDigest);
  assert.equal(result.outer_coherent_manifest_digest, status.coherent_manifest_digest);
  assert.equal(result.requires_reconciliation, true);
  assert.equal(existsSync(oldDirectory), true);
  const newHandle = openWatcherJournal(openWatcherDirectory(journalRoot));
  assert.ok(newHandle);
  assert.equal(newHandle.meta.anchor_coherent_manifest_digest, status.coherent_manifest_digest);
  assert.equal(newHandle.generation.anchor_coherent_manifest_digest, status.coherent_manifest_digest);
  assert.equal(newHandle.pointer.prior_pointer_digest, oldPointer.pointer_digest);
  assert.equal(newHandle.database.prepare("SELECT COUNT(*) AS count FROM journal_resets;").get().count, 1);
  assert.equal(newHandle.database.prepare("SELECT COUNT(*) AS count FROM active_coherent;").get().count, 0);
  assert.equal(newHandle.database.prepare("SELECT COUNT(*) AS count FROM batches;").get().count, 0);
  const firstReplacementGeneration = newHandle.generation.journal_generation_digest;
  const firstReplacementPointer = newHandle.pointer.pointer_digest;
  closeWatcherJournal(newHandle);

  const resumed = await startWatcherHost({
    vault_root: vault,
    status_file: join(statusRoot, "desktop-agent-status.json"),
    vault_id: "vault",
    configuration_digest: DIGEST,
    policy_digest: DIGEST,
    periodic_reconciliation_ms: 60_000,
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  });
  const resumedStatusResponse = await fetch(`http://127.0.0.1:${resumed.service.locator.port}/status`, {
    headers: { authorization: "Bearer reset-token" },
  });
  const resumedStatus = await resumedStatusResponse.json();
  await resumed.shutdown();
  await resumed.closed;
  const adoptedPointer = readWatcherPointer(openWatcherDirectory(watcherRoot), "outer");
  assert.equal(adoptedPointer.pointer_digest, outerPointerBeforeReset.pointer_digest);
  assert.equal(resumedStatus.coherent_manifest_digest, status.coherent_manifest_digest);
  assert.deepEqual(directoryByteSnapshot(join(derived, "retrieval")), retrievalBytesBeforeReset);
  const adoptedHandle = openWatcherJournal(openWatcherDirectory(journalRoot));
  assert.ok(adoptedHandle);
  assert.equal(adoptedHandle.database.prepare("SELECT COUNT(*) AS count FROM batches;").get().count, 1);
  assert.equal(adoptedHandle.database.prepare("SELECT COUNT(*) AS count FROM transitions;").get().count, 1);
  assert.equal(adoptedHandle.database.prepare("SELECT COUNT(*) AS count FROM active_coherent;").get().count, 1);
  assert.equal(adoptedHandle.database.prepare("SELECT COUNT(*) AS count FROM observations;").get().count, 0);
  assert.equal(adoptedHandle.database.prepare("SELECT COUNT(*) AS count FROM normalized_plans;").get().count, 0);
  assert.equal(adoptedHandle.database.prepare("SELECT COUNT(*) AS count FROM activation_intents;").get().count, 0);
  assert.equal(adoptedHandle.database.prepare("SELECT COUNT(*) AS count FROM activation_outcomes;").get().count, 0);
  const adoptedBatch = JSON.parse(Buffer.from(adoptedHandle.database.prepare("SELECT body FROM batches;").get().body).toString("utf8"));
  const adoptedTransition = JSON.parse(Buffer.from(adoptedHandle.database.prepare("SELECT body FROM transitions;").get().body).toString("utf8"));
  assert.equal(adoptedBatch.contract_version, "gkos-watcher-journal-reset-reconciliation-adoption/1.0.0-draft.1");
  assert.equal(adoptedTransition.contract_version, "gkos-watcher-journal-reset-reconciliation-transition/1.0.0-draft.1");
  const adoptedManifest = readWatcherCoherentManifest(openWatcherDirectory(watcherRoot), adoptedPointer);
  const adoptedActivation = readWatcherCurrentActivationAuthority(adoptedHandle, adoptedPointer, adoptedManifest);
  assert.equal(adoptedActivation.source_kind, "adopted_current");
  assert.equal(adoptedActivation.adoption_receipt.receipt_digest, adoptedBatch.receipt_digest);
  const assertAdoptionProjectionMutationRejected = (statement) => {
    adoptedHandle.database.exec("BEGIN IMMEDIATE;");
    try {
      adoptedHandle.database.exec(statement);
      assert.throws(
        () => validateWatcherJournalAdoptionProjection(adoptedHandle),
        /WATCHER_JOURNAL_VALUE_INVALID/u,
      );
    } finally {
      adoptedHandle.database.exec("ROLLBACK;");
    }
    assert.ok(validateWatcherJournalAdoptionProjection(adoptedHandle));
  };
  assertAdoptionProjectionMutationRejected("UPDATE batches SET terminal_state='failed';");
  assertAdoptionProjectionMutationRejected(`UPDATE batches SET target_topology_snapshot_digest='sha256:${"f".repeat(64)}';`);
  assertAdoptionProjectionMutationRejected(`UPDATE transitions SET prior_transition_digest='sha256:${"f".repeat(64)}';`);
  assertAdoptionProjectionMutationRejected("DELETE FROM active_coherent;");
  closeWatcherJournal(adoptedHandle);
  const second = await runGkosCli([
    "watcher", "journal-reset", "--state", watcherRoot,
    "--expected-journal-generation-digest", firstReplacementGeneration,
    "--expected-coherent-manifest-digest", resumedStatus.coherent_manifest_digest,
    "--json",
  ], { reset_journal: resetWatcherJournalState });
  assert.equal(second.exit_code, 0, second.stderr);
  const secondResult = JSON.parse(second.stdout);
  assert.equal(secondResult.prior_journal_generation_digest, firstReplacementGeneration);
  const secondHandle = openWatcherJournal(openWatcherDirectory(journalRoot));
  assert.ok(secondHandle);
  assert.equal(secondHandle.pointer.prior_pointer_digest, firstReplacementPointer);
  assert.equal(secondHandle.meta.anchor_coherent_manifest_digest, resumedStatus.coherent_manifest_digest);
  closeWatcherJournal(secondHandle);

  const twiceResumed = await startWatcherHost({
    vault_root: vault,
    status_file: join(statusRoot, "desktop-agent-status.json"),
    vault_id: "vault",
    configuration_digest: DIGEST,
    policy_digest: DIGEST,
    periodic_reconciliation_ms: 60_000,
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  });
  await twiceResumed.shutdown();
  await twiceResumed.closed;
  const flattenedHandle = openWatcherJournal(openWatcherDirectory(journalRoot));
  assert.ok(flattenedHandle);
  const flattenedReceipt = JSON.parse(Buffer.from(flattenedHandle.database.prepare("SELECT body FROM batches;").get().body).toString("utf8"));
  assert.equal(flattenedReceipt.source_journal_generation_digest, firstReplacementGeneration);
  assert.equal(flattenedReceipt.native_activation_journal_generation_digest, expectedJournalDigest);
  assert.equal(flattenedHandle.database.prepare("SELECT COUNT(*) AS count FROM transitions;").get().count, 1);
  assert.equal(flattenedHandle.database.prepare("SELECT COUNT(*) AS count FROM active_coherent;").get().count, 1);
  const secondReplacementGeneration = flattenedHandle.generation.journal_generation_digest;
  closeWatcherJournal(flattenedHandle);

  const third = await runGkosCli([
    "watcher", "journal-reset", "--state", watcherRoot,
    "--expected-journal-generation-digest", secondReplacementGeneration,
    "--expected-coherent-manifest-digest", resumedStatus.coherent_manifest_digest,
    "--json",
  ], { reset_journal: resetWatcherJournalState });
  assert.equal(third.exit_code, 0, third.stderr);
  writeFileSync(join(vault, "accepted.md"), `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Accepted\nChanged after reset.\n`, { mode: 0o600 });
  const changed = await startWatcherHost({
    vault_root: vault,
    status_file: join(statusRoot, "desktop-agent-status.json"),
    vault_id: "vault",
    configuration_digest: DIGEST,
    policy_digest: DIGEST,
    periodic_reconciliation_ms: 60_000,
    coordinator_options: { discoverability_policy: () => "allow", source_discoverability_policy: () => "allow" },
  });
  await changed.shutdown();
  await changed.closed;
  const changedPointer = readWatcherPointer(openWatcherDirectory(watcherRoot), "outer");
  assert.notEqual(changedPointer.pointer_digest, outerPointerBeforeReset.pointer_digest);
  const changedHandle = openWatcherJournal(openWatcherDirectory(journalRoot));
  assert.ok(changedHandle);
  const changedBatch = JSON.parse(Buffer.from(changedHandle.database.prepare("SELECT body FROM batches ORDER BY started_at DESC LIMIT 1;").get().body).toString("utf8"));
  assert.equal(changedBatch.contract_version, "gkos-watcher-batch-record/1.0.0-draft.1");
  assert.equal(changedHandle.database.prepare("SELECT COUNT(*) AS count FROM transitions;").get().count, 7);
  closeWatcherJournal(changedHandle);
});
