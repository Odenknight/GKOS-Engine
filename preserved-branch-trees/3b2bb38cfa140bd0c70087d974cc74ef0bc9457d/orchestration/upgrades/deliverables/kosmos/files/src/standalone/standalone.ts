/**
 * Kosmos standalone — entry point (§5, §19).
 *
 * A genuine offline single-file viewer: open kosmos-oden-stand-alone.html from disk,
 * click "Open Knowledge Folder", and the directory renders with the exact
 * same Kosmos Core semantics as the Obsidian plugin, the Agent API and the
 * kosmos-build CLI. No Obsidian, Node, server or network required.
 */
import { GkxIndex, type IndexChanges } from "gkos-engine";
import { buildGraphitiEpisodesWithContent } from "gkos-engine";
import { isNotePath } from "gkos-engine";
import type { GkxGraph, SourceFile } from "gkos-engine";
import { createKosmosApp } from "../renderer/renderer";
import {
  openDirectoryPersistent,
  sourceFromFileList,
  sourceFromHandle,
  supportsDirectoryPicker,
  type DirectorySnapshot,
  type KnowledgeSource,
  type SnapshotDiff,
} from "./directory-source";
import { DirectoryMonitor } from "./directory-monitor";
import {
  forgetStoredHandle,
  loadStoredHandle,
  permissionState,
  requestPermission,
  storeHandle,
} from "./persistence";
import { createStandaloneUI, downloadFile, type StandaloneUI } from "./ui";
import {
  connectToEngine,
  parseApiFeedParams,
  probeHealth,
  subscribeTraversalEvents,
  type ServiceFeatureCapability,
  type ViewerGraph,
} from "./api-feed";
import {
  TraversalReplay, TraversalSessionRecorder, TRAVERSAL_SESSION_MAX_BYTES,
  type TraversalEventEnvelope, type TraversalSessionExport,
} from "./observability";
import { KOSMOS_VERSION } from "../kosmos-version";

const app = createKosmosApp({ autoStart: "wait" });
// No settings context in this viewer-only surface, so projection options are
// omitted: the engine fail-closes unlabeled notes to secret (§ default-sensitivity).
const index = new GkxIndex();
let source: KnowledgeSource | null = null;
let monitor: DirectoryMonitor | null = null;
let sourceName = "Vault";
let connectivityTimer = 0;

/**
 * Live local-service feed state. The bearer credential is
 * held in memory only for this session — it is NEVER written to storage. Set
 * when a `/graph` fetch from the loopback service succeeds; cleared otherwise.
 */
let engine: { api: string; token: string | null } | null = null;
let engineCapabilities: any = null;
let eventSubscription: { close(): void; lastSequence(): number | null } | null = null;
const sessionRecorder = new TraversalSessionRecorder();
const sessionReplay = new TraversalReplay();
let replayMode = false, replayTimer = 0;
const liveDuringReplay: TraversalEventEnvelope[] = [];
let liveDuringReplayBytes = 0;
const MAX_LIVE_REPLAY_EVENTS = 5_000, MAX_LIVE_REPLAY_BYTES = 2_000_000;

function feature(name: string): ServiceFeatureCapability | null { return engineCapabilities?.features?.[name] || null; }
function featureAvailable(name: string): boolean { return feature(name)?.available === true; }
function featureReady(name: string): boolean {
  const state = feature(name);
  return !!state && state.available && state.configured && state.authorized && state.enabled;
}
function stopEventStream(): void { eventSubscription?.close(); eventSubscription = null; ui?.setStatus({ eventStream: "unavailable" }); }
function stopReplayTimer(): void { if (replayTimer) { clearInterval(replayTimer); replayTimer = 0; } }
function leaveReplayForLive(): void {
  stopReplayTimer();
  replayMode = false;
  app.clearTraversalObservability();
  for (const event of liveDuringReplay.splice(0)) app.notifyAgentTraversal(event.paths, event.tool, event.agent_label, false, event.agent_id);
  liveDuringReplayBytes = 0;
}
function updateReplayUi(): void {
  const state = sessionReplay.state, record = sessionRecorder.status;
  ui.setObservability({
    recording: record.active, recordedEvents: record.events, replayLoaded: state.loaded,
    replayPlaying: state.playing, replayEnded: state.ended, replayPositionMs: state.positionMs,
    replayDurationMs: state.durationMs, replaySpeed: state.speed as 1 | 2 | 5,
  });
}
function ensureReplayTimer(): void {
  if (replayTimer) return;
  replayTimer = (setInterval(() => {
    if (!replayMode) return;
    for (const event of sessionReplay.tick()) app.notifyAgentTraversal(event.paths, event.tool, event.agent_label, true, event.agent_id);
    updateReplayUi();
    if (!sessionReplay.state.playing) stopReplayTimer();
  }, 30) as unknown) as number;
}
function loadReplaySession(value: TraversalSessionExport): void {
  if (value?.schema_version !== 1 || !Array.isArray(value.events)) throw new Error("unrecognized session shape");
  stopReplayTimer(); app.clearTraversalObservability(); sessionReplay.load(value);
  replayMode = true; liveDuringReplay.length = 0; liveDuringReplayBytes = 0; updateReplayUi();
}
function replayAction(action: "play" | "pause" | "restart" | "stop" | "live" | "stay"): void {
  if (action === "play") { replayMode = true; sessionReplay.play(); ensureReplayTimer(); }
  else if (action === "pause" || action === "stay") { sessionReplay.pause(); stopReplayTimer(); }
  else if (action === "restart") { replayMode = true; app.clearTraversalObservability(); sessionReplay.restart(); sessionReplay.play(); ensureReplayTimer(); }
  else if (action === "stop") { sessionReplay.stop(); leaveReplayForLive(); }
  else if (action === "live") { sessionReplay.pause(); leaveReplayForLive(); }
  updateReplayUi();
}
function receiveTraversalEvent(event: TraversalEventEnvelope): void {
  sessionRecorder.record(event); updateReplayUi();
  if (replayMode) {
    const bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength;
    liveDuringReplay.push(event); liveDuringReplayBytes += bytes;
    while (liveDuringReplay.length > MAX_LIVE_REPLAY_EVENTS || liveDuringReplayBytes > MAX_LIVE_REPLAY_BYTES) {
      const removed = liveDuringReplay.shift();
      if (!removed) break;
      liveDuringReplayBytes -= new TextEncoder().encode(JSON.stringify(removed)).byteLength;
    }
    return;
  }
  app.notifyAgentTraversal(event.paths, event.tool, event.agent_label, false, event.agent_id);
}
function startEventStream(): void {
  stopEventStream();
  if (!engine || !engine.token || !featureReady("events")) { ui.setStatus({ eventStream: "unavailable" }); return; }
  eventSubscription = subscribeTraversalEvents({ api: engine.api, token: engine.token }, {
    onEvent: receiveTraversalEvent,
    onState: (state) => ui.setStatus({ eventStream: state }),
    onError: (message) => ui.addError(message),
  });
}

/** Live connectivity dot. Snapshot/demo/graph.json are static data: always green.
 *  A live directory handle is probed by re-checking its read permission. */
function stopConnectivityProbe(): void {
  if (connectivityTimer) { clearInterval(connectivityTimer); connectivityTimer = 0; }
}
function startHandleConnectivityProbe(handle: any): void {
  stopConnectivityProbe();
  const probe = async () => {
    let connected = false;
    try { connected = (await permissionState(handle)) === "granted"; } catch (_) { connected = false; }
    app.setVaultStatus(connected);
  };
  void probe();
  connectivityTimer = (setInterval(() => void probe(), 10_000) as unknown) as number;
}

/* ---------------- status plumbing ---------------- */

function pickCoreNode(n: any) {
  return {
    id: n.id, kind: n.kind, path: n.path, label: n.label, area: n.area, depth: n.depth,
    extension: n.extension, size: n.size, createdAt: n.createdAt, updatedAt: n.updatedAt,
    validAt: n.validAt, gkx: n.gkx, type: n.type, status: n.status, priority: n.priority,
    tags: n.tags, aliases: n.aliases, color: n.color, outgoing: n.outgoing, incoming: n.incoming,
    unresolved: n.unresolved,
  };
}
function pickCoreLink(l: any) {
  return { id: l.id, source: l.source, target: l.target, kind: l.kind, label: l.label, sourcePath: l.sourcePath };
}
function exportableGraph(graph: GkxGraph) {
  return {
    nodes: graph.nodes.map(pickCoreNode),
    links: graph.links.map(pickCoreLink),
    stats: graph.stats,
    areas: graph.areas, tags: graph.tags, statuses: graph.statuses, types: graph.types,
    diagnostics: graph.diagnostics,
  };
}

function statusFromGraph(graph: GkxGraph) {
  const heads = graph.nodes.filter((n) => n.gkx && n.gkx.head).length;
  const superseded = graph.nodes.filter((n) => n.gkx && n.gkx.invalidAt).length;
  const rendererDiag = app.getDiagnostics();
  return {
    source: sourceName,
    notes: graph.stats.files,
    folders: graph.stats.folders,
    attachments: graph.diagnostics.attachments,
    unresolvedLinks: graph.diagnostics.unresolvedLinks,
    lineageEdges: graph.diagnostics.lineageEdges,
    headNotes: heads,
    supersededNotes: superseded,
    lineageWarnings: graph.diagnostics.lineageWarnings,
    residualCollisions: rendererDiag?.residualCollisions ?? graph.diagnostics.residualCollisions,
  };
}

/* ---------------- load paths ---------------- */

function renderSnapshot(snapshot: DirectorySnapshot, label: string): void {
  const update = index.setFiles(snapshot.files, snapshot.folders, snapshot.attachments);
  app.setAttachments(snapshot.attachments);
  app.renderGraph(update.graph, label);
  for (const w of update.graph.diagnostics.lineageWarnings) console.warn("Vault Kosmos lineage:", w);
}

async function loadSource(src: KnowledgeSource, snapshot: DirectorySnapshot): Promise<void> {
  stopEventStream(); engineCapabilities = null;
  engine = null; // opening a local folder supersedes any live engine feed
  source = src;
  sourceName = src.name;
  ui.hideStartup();
  ui.clearErrors();
  renderSnapshot(snapshot, src.name);
  for (const e of snapshot.errors) ui.addError(e);
  monitor?.stop();
  monitor = null;
  if (src.canRescan) {
    monitor = new DirectoryMonitor(src, snapshot, {
      onDiff: applyDiff,
      onError: (m) => ui.addError(m),
      onScan: () => ui.setStatus({ lastScanAt: Date.now() }),
    });
    monitor.start();
  }
  ui.setStatus({
    mode: src.mode,
    monitoring: src.canRescan ? "active" : "unavailable",
    lastScanAt: snapshot.scannedAt,
    ...statusFromGraph(index.graph!),
    graphConnected: false, mcpAvailable: false, eventStream: "unavailable", offlineFolderMode: true,
  });
  // Connectivity dot: a live directory handle is probed for read permission;
  // a file-snapshot import is static data and stays green.
  if (src.canRescan && (src as any).handle) startHandleConnectivityProbe((src as any).handle);
  else { stopConnectivityProbe(); app.setVaultStatus(true); }
}

/** Incremental pipeline (§10): only changed notes are re-parsed by the index. */
function applyDiff(diff: SnapshotDiff, snapshot: DirectorySnapshot): void {
  const byPath = new Map(snapshot.files.map((f) => [f.relativePath, f]));
  const changed: SourceFile[] = [];
  for (const p of [...diff.addedFiles, ...diff.changedFiles]) {
    if (!isNotePath(p)) continue;
    const f = byPath.get(p);
    if (f) changed.push(f);
  }
  const changes: IndexChanges = {
    changed,
    removed: diff.removedFiles.filter(isNotePath),
    folders: snapshot.folders,
    attachments: snapshot.attachments,
  };
  const update = index.applyChanges(changes);
  app.setAttachments(snapshot.attachments);
  app.renderGraph(update.graph, sourceName);
  ui.setStatus({ lastScanAt: snapshot.scannedAt, ...statusFromGraph(update.graph) });
  console.debug(
    `Vault Kosmos rescan: +${diff.addedFiles.length} ~${diff.changedFiles.length} -${diff.removedFiles.length} files, ` +
    `${diff.addedDirs.length} new / ${diff.removedDirs.length} removed folder(s); re-parsed ${update.delta.reparsed} note(s)`
  );
}

/* ---------------- live engine feed (loopback service) ---------------- */

/** Render a graph fetched live from the local service and set live status. */
function renderEngineGraph(graph: ViewerGraph, health: any): void {
  monitor?.stop();
  monitor = null;
  source = null;
  sourceName = "GKOS Engine";
  ui.hideStartup();
  ui.clearErrors();
  app.setAttachments(Array.isArray((graph as any).attachments) ? (graph as any).attachments : []);
  app.renderGraph(graph, sourceName);
  app.setVaultStatus(true);
  // `/graph` returns a full GkxGraph, so statusFromGraph applies as-is; when
  // an older engine omits stats we fall back to the health doc's notes count.
  let extra: Record<string, unknown>;
  try {
    extra = statusFromGraph(graph as unknown as GkxGraph);
  } catch {
    extra = { source: sourceName, notes: health?.notes_indexed };
  }
  ui.setStatus({
    mode: "live", monitoring: "unavailable", lastScanAt: Date.now(), ...extra,
    graphConnected: true, mcpAvailable: featureAvailable("mcp"), mcpEnabled: featureReady("mcp"), offlineFolderMode: false,
  });
}

/** Poll /health so the connectivity dot reflects a live engine going away. */
function startEngineConnectivityProbe(): void {
  stopConnectivityProbe();
  const probe = async () => {
    if (!engine) return;
    const r = await probeHealth(engine, fetch);
    app.setVaultStatus(r.ok);
    ui.setStatus({ graphConnected: r.ok });
    if (r.ok && r.health && typeof r.health.notes_indexed === "number") {
      ui.setStatus({ notes: r.health.notes_indexed });
    }
  };
  void probe();
  connectivityTimer = (setInterval(() => void probe(), 10_000) as unknown) as number;
}

/** Connect (or reconnect) to the loopback service and render its graph. */
async function connectEngine(api: string, token: string): Promise<void> {
  ui.clearErrors();
  const res = await connectToEngine({ api, token: token || null }, fetch);
  if (!res.ok || !res.graph) {
    stopEventStream(); engineCapabilities = null;
    engine = null;
    stopConnectivityProbe();
    app.setVaultStatus(false);
    // Keep the startup overlay up with the values prefilled so the user can retry.
    ui.showStartup({
      canPicker: supportsDirectoryPicker(),
      canReopen: false,
      apiPrefill: api,
      tokenPrefill: token,
      connectOpen: true,
    });
    ui.addError(res.error || "Could not connect to the engine.");
    return;
  }
  engine = { api, token: token || null };
  engineCapabilities = res.capabilities;
  renderEngineGraph(res.graph, res.health);
  startEngineConnectivityProbe();
  startEventStream();
}

/** Manual graph refresh; traversal activity has its own authenticated stream. */
async function refreshEngine(): Promise<void> {
  if (!engine) return;
  const res = await connectToEngine(engine, fetch);
  if (!res.ok || !res.graph) {
    app.setVaultStatus(false);
    ui.addError(res.error || "Could not refresh the engine graph.");
    return;
  }
  engineCapabilities = res.capabilities;
  renderEngineGraph(res.graph, res.health);
  if (!eventSubscription) startEventStream();
}

/* ---------------- UI handlers ---------------- */

const ui: StandaloneUI = createStandaloneUI({
  onOpenFolder: () => {
    void (async () => {
      try {
        const src = await openDirectoryPersistent();
        const snapshot = await src.scan();
        await loadSource(src, snapshot);
        try { await storeHandle(src.handle, src.name); } catch { /* private mode: persistence unavailable */ }
      } catch (e: any) {
        if (e?.name === "AbortError") return; // user dismissed the picker
        // Some browsers expose showDirectoryPicker but refuse it on file:// —
        // the snapshot picker (plain file input) always works from disk (§6.2).
        if (e?.name === "SecurityError" || e?.name === "NotAllowedError") {
          ui.addError("This browser does not allow persistent folder access for a page opened from disk — use “Open Folder Snapshot” below instead.");
        } else {
          ui.addError(`Could not open folder: ${e?.message || e}`);
        }
      }
    })();
  },
  onReopenLast: () => {
    void (async () => {
      try {
        const stored = await loadStoredHandle();
        if (!stored) { ui.addError("No previously opened folder is stored."); return; }
        const state = await permissionState(stored.handle);
        if (state !== "granted") {
          const ok = await requestPermission(stored.handle);
          if (!ok) { ui.addError("Folder permission was not granted."); return; }
        }
        const src = sourceFromHandle(stored.handle);
        const snapshot = await src.scan();
        await loadSource(src, snapshot);
      } catch (e: any) {
        ui.addError(`Could not reopen the last folder: ${e?.message || e}`);
      }
    })();
  },
  onOpenSnapshot: (files: FileList) => {
    void (async () => {
      try {
        const { source: src, snapshot } = await sourceFromFileList(files);
        await loadSource(src, snapshot);
      } catch (e: any) {
        ui.addError(`Could not import the folder snapshot: ${e?.message || e}`);
      }
    })();
  },
  onConnectEngine: (api: string, token: string) => { void connectEngine(api, token); },
  onRefreshEngine: () => { void refreshEngine(); },
  onLoadDemo: () => {
    sourceName = "Demo vault";
    engine = null;
    engineCapabilities = null; stopEventStream();
    ui.hideStartup();
    stopConnectivityProbe();
    app.showDemo();
    app.setVaultStatus(true);
    ui.setStatus({ source: "Demo vault", mode: "demo", monitoring: "unavailable", lastScanAt: Date.now(), graphConnected: false, mcpAvailable: false, eventStream: "unavailable", offlineFolderMode: true });
  },
  onRescan: () => { void monitor?.scanNow("manual"); },
  onPauseMonitor: () => { monitor?.pause(); ui.setMonitorState("paused"); },
  onResumeMonitor: () => { monitor?.resume(); ui.setMonitorState("active"); },
  onForgetFolder: () => {
    void (async () => {
      await forgetStoredHandle();
      monitor?.stop();
      monitor = null;
      ui.setMonitorState("unavailable");
      ui.addError("Stored folder handle removed. Reload the page to open a different folder.");
    })();
  },
  onExportGraph: () => {
    if (!index.graph) return;
    downloadFile("graph.json", JSON.stringify(exportableGraph(index.graph), null, 2));
  },
  onExportEpisodes: () => {
    if (!index.graph) return;
    const contents = new Map<string, string>();
    for (const [path, rec] of index.getRecords()) contents.set(path, rec.parsed.content);
    const episodes = buildGraphitiEpisodesWithContent(index.graph, contents, { vault: sourceName });
    downloadFile("graphiti-episodes.json", JSON.stringify(episodes, null, 2));
  },
  onTrafficHeatmap: (enabled) => { app.setTrafficHeatmapEnabled(enabled); ui.setObservability({ heatEnabled: enabled }); },
  onRecording: (enabled) => {
    if (enabled) {
      if (!engine || !featureReady("events")) { ui.addError("Recording requires an enabled, configured, and authorized traversal event stream."); return; }
      sessionRecorder.start({
        started_at: new Date().toISOString(),
        service_protocol: String(engineCapabilities?.protocol?.version || "unknown"),
        viewer_version: KOSMOS_VERSION,
        corpus_hash: engineCapabilities?.corpus_hash || null,
        redaction: "",
      });
    } else sessionRecorder.stop();
    updateReplayUi();
  },
  onExportSession: () => {
    const session = sessionRecorder.export();
    if (!session) { ui.addError("Start a recording before exporting a session."); return; }
    // Compact encoding is the byte-counted canonical export; pretty-printing
    // could push an otherwise bounded session over its configured cap.
    downloadFile("kosmos-traversal-session.json", JSON.stringify(session));
  },
  onLoadSession: (file) => {
    if (file.size > TRAVERSAL_SESSION_MAX_BYTES) { ui.addError(`Replay file exceeds ${TRAVERSAL_SESSION_MAX_BYTES} bytes.`); return; }
    void file.text().then((text) => {
      if (new TextEncoder().encode(text).byteLength > TRAVERSAL_SESSION_MAX_BYTES) throw new Error(`replay file exceeds ${TRAVERSAL_SESSION_MAX_BYTES} bytes`);
      const value = JSON.parse(text) as TraversalSessionExport;
      loadReplaySession(value);
    }).catch((error) => ui.addError(`Could not load replay: ${error?.message || error}`));
  },
  onReplayAction: (action) => {
    replayAction(action);
  },
  onReplaySeek: (offsetMs) => {
    replayMode = true; app.clearTraversalObservability(); sessionReplay.seek(offsetMs);
    for (const event of sessionReplay.tick()) app.notifyAgentTraversal(event.paths, event.tool, event.agent_label, true, event.agent_id);
    updateReplayUi();
  },
  onReplaySpeed: (speed) => { sessionReplay.setSpeed(speed); updateReplayUi(); },
});

/* ---------------- boot ---------------- */

/**
 * Best-effort convenience kept from the v4 standalone: when a `graph.json`
 * (produced by `node kosmos-build.mjs`) sits next to this HTML file AND the
 * page is served over http(s), auto-load it. On file:// the fetch fails
 * silently and the normal startup overlay appears — never an error.
 */
async function tryLocalGraphJson(): Promise<boolean> {
  if (location.protocol === "file:") return false;
  try {
    const r = await fetch("./graph.json", { cache: "no-store" });
    if (!r.ok) return false;
    const g = await r.json();
    if (!g || !Array.isArray(g.nodes)) return false;
    sourceName = "graph.json";
    ui.hideStartup();
    app.setAttachments(g.attachments || []);
    app.renderGraph(g, "graph.json");
    stopConnectivityProbe();
    app.setVaultStatus(true);
    ui.setStatus({ source: "graph.json", mode: "snapshot", monitoring: "unavailable", lastScanAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

async function boot(): Promise<void> {
  // Remove legacy/accidental URL credentials immediately. They are ignored by
  // parseApiFeedParams and must not remain in history or the visible URL bar.
  const sanitized = new URL(location.href);
  if (sanitized.searchParams.has("token")) {
    sanitized.searchParams.delete("token");
    try { history.replaceState(null, "", sanitized.href); }
    catch { location.replace(sanitized.href); return; }
  }
  // Deterministic visual-regression capture: the renderer boots the demo scene
  // itself, so suppress the startup overlay and leave the canvas clear.
  if (new URLSearchParams(location.search).has("capture")) { ui.hideStartup(); return; }

  // `?api=` is a non-secret convenience only. The credential comes from the
  // password field or a trusted-host IPC bridge and never appears in the URL.
  const feed = parseApiFeedParams(location.search);
  if (feed.api) {
    let ipcToken = "";
    try {
      const bridge = (window as any).__KOSMOS_DESKTOP_IPC__;
      if (bridge && typeof bridge.takeViewerToken === "function") ipcToken = String(await bridge.takeViewerToken() || "");
    } catch { /* secure IPC unavailable: ask in-page */ }
    if (ipcToken) { ui.hideStartup(); await connectEngine(feed.api, ipcToken); }
    else ui.showStartup({ canPicker: supportsDirectoryPicker(), canReopen: false, apiPrefill: feed.api, connectOpen: true });
    return;
  }

  if (await tryLocalGraphJson()) return;
  const canPicker = supportsDirectoryPicker();
  let reopenName: string | undefined;
  let canReopen = false;
  if (canPicker) {
    const stored = await loadStoredHandle();
    if (stored) { canReopen = true; reopenName = stored.name; }
  }
  ui.showStartup({ canPicker, canReopen, reopenName });
}
void boot();

/* Test/diagnostic hook (§25): drive the standalone pipeline without a picker. */
(window as any).__kosmosStandalone = {
  loadFromMemory(files: SourceFile[], folders: string[] = [], attachments: string[] = [], label = "Test vault"): void {
    sourceName = label;
    ui.hideStartup();
    const update = index.setFiles(files, folders, attachments);
    app.setAttachments(attachments);
    app.renderGraph(update.graph, label);
    app.setVaultStatus(true);
    ui.setStatus({ mode: "snapshot", monitoring: "unavailable", lastScanAt: Date.now(), ...statusFromGraph(update.graph) });
  },
  applyChanges(changes: IndexChanges): any {
    const update = index.applyChanges(changes);
    if (changes.attachments) app.setAttachments(changes.attachments);
    app.renderGraph(update.graph, sourceName);
    ui.setStatus({ lastScanAt: Date.now(), ...statusFromGraph(update.graph) });
    return { delta: update.delta, stats: update.graph.stats, diagnostics: update.graph.diagnostics };
  },
  getIndexInfo(): any {
    return {
      notes: index.noteCount,
      parseCount: index.parseCount,
      diagnostics: index.getDiagnostics(),
    };
  },
  getObservabilityInfo(): any {
    return { recorder: sessionRecorder.status, replay: sessionReplay.state, replayMode, bufferedLiveEvents: liveDuringReplay.length };
  },
  loadReplayForTest(session: TraversalSessionExport): void { loadReplaySession(session); },
  receiveTraversalForTest(event: TraversalEventEnvelope): void { receiveTraversalEvent(event); },
  replayActionForTest(action: "play" | "pause" | "restart" | "stop" | "live" | "stay"): void { replayAction(action); },
};
