import { loadLocalEmbeddingProvider } from "./service/local-embedding";
/**
 * GKOS-Engine — desktop agent sidecar (headless).
 *
 * A single self-contained entry point compiled per-platform into a Node SEA
 * binary (`gkos-agent`). It points the deterministic engine at a notes
 * folder, watches for changes, and serves a LOOPBACK-ONLY read-only agent API
 * for local agents (Claude Desktop, Cursor, etc.).
 *
 * Design constraints (GKOS §11.4 local-only default; desktop build spec
 * decision 2 — no cloud access of any kind):
 *   - The HTTP server binds 127.0.0.1 ONLY. `--host` is deliberately NOT an
 *     option; the address is hardcoded and never derived from input.
 *   - Every request requires the first-run bearer token (401 otherwise).
 *   - The engine surface is read-only; no governance surface is added and the
 *     raise-only / fail-closed sensitivity invariants are unchanged — the
 *     configured default only governs UNLABELED notes and may only raise, not
 *     lower, an authored classification.
 *
 * This module is transport-neutral engine glue: it reuses the engine's public
 * surface (`GkxIndex`, `parseSourceFile`, `buildGraphitiEpisodes`) rather
 * than reimplementing projection. The repo has no standalone agent-server
 * module to import (the agent server currently lives plugin-coupled in
 * Gkx-Oden), so the minimal loopback transport is defined here.
 */
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { AddressInfo } from "node:net";

import {
  GkxIndex,
  buildGraphitiEpisodes,
  DEFAULT_IGNORED_DIRS,
  shouldIgnoreVaultPath,
  normalizeVaultRelative,
  extensionFromPath,
  ENGINE_VERSION,
  type GkxSensitivity,
  type GkxGraph,
  type SourceFile,
} from "./index";
import { retrievalCanonicalDigest } from "./retrieval/digest";
import { buildVaultNavigationConfig } from "./navigation";
import {
  createLocalServiceRequestHandler,
  defaultMcpAgentBinding,
  legacyViewerBinding,
  ServiceCredentialRegistry,
} from "./service/node";
import { startWatcherHost } from "./watcher/host";
import {
  ensureWatcherStatusDirectory,
  openWatcherDirectory,
  readWatcherFile,
  revalidateWatcherDirectory,
  watcherNamespaceCoordinate,
  watcherLeafExists,
  writeExistingWatcherFile,
  writeNewWatcherFile,
  type WatcherDirectoryCapability,
} from "./watcher/fs-authority";

/** The seven-level sensitivity vocabulary (GKOS §11), fail-closed to secret. */
export const SENSITIVITY_LEVELS: readonly GkxSensitivity[] = [
  "public",
  "internal",
  "restricted",
  "confidential",
  "regulated",
  "phi",
  "secret",
];

export const DEFAULT_PORT = 4814;
/** Loopback only — never configurable (decision 2 / GKOS §11.4). */
export const LOOPBACK_HOST = "127.0.0.1";
export const DEBOUNCE_MS = 500;

/**
 * CORS allowlist for the loopback API. The sidecar is same-origin to no one:
 * the only legitimate cross-origin callers are the desktop shell's webview
 * (Tauri serves the app under `tauri://localhost` on mac/Linux and
 * `https://tauri.localhost` on Windows; some configurations use
 * `http://tauri.localhost`) and a viewer opened from the local filesystem
 * (a `file://` document reports the opaque Origin `null`). Only these origins
 * get CORS headers; every other Origin (a drive-by website, say) gets none, so
 * the browser blocks its fetch. The bearer token is still required on the
 * actual GET — CORS only decides whether the browser HANDS the response back.
 */
export const CORS_ALLOWLIST: readonly string[] = [
  "tauri://localhost",
  "https://tauri.localhost",
  "http://tauri.localhost",
  "null",
];

/** Extensions the engine parses as notes (mirrors graph.ts PARSEABLE). */
const NOTE_EXTS = new Set(["md", "markdown", "base"]);

export interface DesktopAgentArgs {
  notesDir: string;
  defaultSensitivity: GkxSensitivity;
  port: number;
  statusFile: string;
}

export const DESKTOP_AGENT_USAGE = `gkos-agent (GKOS-Engine desktop helper) v${ENGINE_VERSION}

Runs the protected, read-only note map exposed by GKOS-Engine to downstream desktop surfaces.

Usage:
  gkos-agent --notes <folder> [options]

Options:
  --notes <folder>                 Notes folder to read (required)
  --default-sensitivity <level>    Privacy level for unlabeled notes (default: secret)
  --port <number>                  Local connection port (default: 4814)
  --status-file <path>             Default: <notes>/.gkx/desktop-agent.status.json
  --help                           Show this help

Environment (operator settings; restart required):
  GKOS_CODEX_MCP_ENABLED           Unset/0 disables; 1 enables a separate MCP identity
  GKOS_MCP_CONTENT_LIMITS          JSON: files, per_file_bytes, total_bytes
  GKOS_LOCAL_EMBEDDING_CONFIG      Protected local ONNX configuration path; unset disables

gkos.toml is not loaded by this helper. Use the flags/environment above.
Unknown/duplicate flags and positional arguments are rejected. Invalid sensitivity
falls back to secret; invalid port falls back to 4814 (no numeric-prefix parsing).
This helper reads notes but never edits them. It accepts connections from this
computer only. See docs/SETTINGS.md for bounds, defaults and runtime ownership.`;

/**
 * Parse CLI args. Mirrors the spec exactly:
 *   --notes <dir>                 REQUIRED (throws when absent)
 *   --default-sensitivity <level> validated against the seven-level vocab;
 *                                 invalid/missing → "secret" (fail-closed)
 *   --port <n>                    default 4814; invalid → default
 *   --status-file <path>          default <notesDir>/.gkx/desktop-agent.status.json
 * `--host` is intentionally unsupported.
 */
export function parseArgs(argv: string[]): DesktopAgentArgs {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!["--notes", "--default-sensitivity", "--port", "--status-file", "--host"].includes(a)) {
      throw new Error("Unsupported desktop-agent argument; see --help.");
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (map.has(key)) throw new Error("Duplicate desktop-agent option; see --help.");
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
      map.set(key, val);
    }
  }

  if (map.has("host")) {
    throw new Error("--host is not supported: the desktop agent binds 127.0.0.1 only (GKOS §11.4).");
  }

  const notesDir = map.get("notes");
  if (!notesDir) {
    throw new Error("--notes <dir> is required.");
  }

  const rawSensitivity = map.get("default-sensitivity");
  const defaultSensitivity: GkxSensitivity =
    rawSensitivity && SENSITIVITY_LEVELS.includes(rawSensitivity as GkxSensitivity)
      ? (rawSensitivity as GkxSensitivity)
      : "secret";

  const rawPort = map.get("port");
  const parsedPort = rawPort != null && /^[0-9]+$/u.test(rawPort) ? Number(rawPort) : NaN;
  const port =
    Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : DEFAULT_PORT;

  const statusFile = map.get("status-file")
    ? path.resolve(map.get("status-file")!)
    : path.resolve(notesDir, ".gkx", "desktop-agent.status.json");

  return { notesDir: path.resolve(notesDir), defaultSensitivity, port, statusFile };
}

/**
 * Coalescing debouncer. Filesystem events during a burst (bulk edit, git
 * checkout) are collected and flushed once after DEBOUNCE_MS of quiet, so a
 * storm of `fs.watch` callbacks costs a single `applyChanges`.
 */
export class Debouncer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending = new Set<string>();
  constructor(
    private readonly delayMs: number,
    private readonly onFlush: (paths: string[]) => void,
  ) {}

  /** Record a touched path and (re)arm the quiet-window timer. */
  schedule(touchedPath: string): void {
    this.pending.add(touchedPath);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0) return;
    const paths = [...this.pending];
    this.pending.clear();
    this.onFlush(paths);
  }

  /** Number of paths currently coalesced (test observability). */
  get pendingCount(): number {
    return this.pending.size;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
  }
}

export interface ScanResult {
  files: SourceFile[];
  folders: string[];
  attachments: string[];
}

/**
 * Recursively scan the notes directory into engine SourceFile inputs, honoring
 * DEFAULT_IGNORED_DIRS (incl. `.gkx`). Markdown/base files are loaded with
 * content (notes); everything else is recorded as an attachment path. Paths
 * are normalized vault-relative (POSIX) exactly as the plugin scanner does.
 */
export function scanNotesDir(rootDir: string): ScanResult {
  const files: SourceFile[] = [];
  const folders: string[] = [];
  const attachments: string[] = [];

  const walk = (absDir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(absDir, ent.name);
      const rel = normalizeVaultRelative(path.relative(rootDir, abs));
      if (!rel || shouldIgnoreVaultPath(rel)) continue;
      if (ent.isDirectory()) {
        folders.push(rel);
        walk(abs);
      } else if (ent.isFile()) {
        const ext = extensionFromPath(rel);
        if (ext && NOTE_EXTS.has(ext)) {
          let content = "";
          try {
            content = fs.readFileSync(abs, "utf8");
          } catch {
            content = "";
          }
          let size = content.length;
          let mtime: number | undefined;
          try {
            const st = fs.statSync(abs);
            size = st.size;
            mtime = st.mtimeMs;
          } catch {
            /* best effort */
          }
          files.push({
            relativePath: rel,
            name: ent.name,
            extension: ext,
            size,
            modifiedTime: mtime,
            content,
            kind: "note",
          });
        } else {
          attachments.push(rel);
        }
      }
    }
  };

  walk(rootDir);
  return { files, folders, attachments };
}

/** Health/state document written to the status file for the shell to poll. */
export interface StatusDoc {
  pid: number;
  port: number;
  url: string;
  token_path: string;
  mcp_token_path?: string;
  mcp_identity_path?: string;
  notes_dir: string;
  default_sensitivity: GkxSensitivity;
  notes_indexed: number;
  state: "indexing" | "serving" | "error";
  last_scan_iso: string | null;
}

export interface DefaultMcpCredentialState {
  schema_version: 1;
  credential_id: string;
  agent_id: string;
  agent_label: string;
  sensitivity_ceiling: GkxSensitivity;
  revoked: boolean;
  limits: { concurrent_requests: 4; bucket_capacity: 10 | 40; refill_ms: 1000 };
}

function readProtectedCredentialLeaf(leafPath: string, maximumBytes = 4_096): string | null {
  let before: fs.Stats;
  try { before = fs.lstatSync(leafPath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > maximumBytes) {
    throw new Error("GKX_WATCHER_CREDENTIAL_LEAF_INVALID");
  }
  if (process.platform !== "win32") {
    const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
    if (currentUid !== null && before.uid !== currentUid) throw new Error("GKX_WATCHER_CREDENTIAL_OWNER_INVALID");
    if ((before.mode & 0o077) !== 0) throw new Error("GKX_WATCHER_CREDENTIAL_MODE_INVALID");
  }
  const descriptor = fs.openSync(leafPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const after = fs.fstatSync(descriptor);
    if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size) {
      throw new Error("GKX_WATCHER_CREDENTIAL_LEAF_CHANGED");
    }
    return fs.readFileSync(descriptor, "utf8");
  } finally { fs.closeSync(descriptor); }
}

function uuidV7(): string {
  const bytes = crypto.randomBytes(16);
  let value = BigInt(Date.now());
  for (let index = 5; index >= 0; index--) { bytes[index] = Number(value & 0xffn); value >>= 8n; }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function loadOrCreateProfileMcpCredential(directory: string, profile: "default" | "codex"): {
  token: string;
  tokenPath: string;
  identityPath: string;
  state: DefaultMcpCredentialState;
} {
  const stem = profile === "codex" ? "desktop-agent.codex.mcp" : "desktop-agent.mcp";
  const label = profile === "codex" ? "Codex MCP Agent" : "Local MCP Agent";
  const tokenPath = path.join(directory, `${stem}.token`);
  const identityPath = path.join(directory, `${stem}.identity.json`);
  const token = loadOrCreateToken(tokenPath);
  let state: DefaultMcpCredentialState;
  const existingIdentity = readProtectedCredentialLeaf(identityPath);
  if (existingIdentity !== null) {
    const parsed = JSON.parse(existingIdentity) as DefaultMcpCredentialState;
    if (parsed.schema_version !== 1 || !/^credential:[a-z0-9:-]{1,128}$/u.test(parsed.credential_id) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(parsed.agent_id) ||
      parsed.agent_label !== label || !SENSITIVITY_LEVELS.includes(parsed.sensitivity_ceiling) || typeof parsed.revoked !== "boolean" ||
      ![10, 40].includes(parsed.limits?.bucket_capacity) || JSON.stringify(parsed.limits) !== JSON.stringify({ concurrent_requests: 4, bucket_capacity: parsed.limits?.bucket_capacity, refill_ms: 1000 })) throw new Error("GKX_WATCHER_MCP_IDENTITY_INVALID");
    state = parsed;
  } else {
    state = {
      schema_version: 1,
      credential_id: `credential:${crypto.randomBytes(16).toString("hex")}`,
      agent_id: uuidV7(),
      agent_label: label,
      sensitivity_ceiling: profile === "codex" ? "secret" : "internal",
      revoked: false,
      limits: { concurrent_requests: 4, bucket_capacity: 10, refill_ms: 1000 },
    };
    const bytes = JSON.stringify(state, null, 2);
    fs.writeFileSync(identityPath, bytes, { flag: "wx", mode: 0o600 });
    try { fs.chmodSync(identityPath, 0o600); } catch { /* Windows best effort */ }
  }
  return { token, tokenPath, identityPath, state };
}

export function loadOrCreateDefaultMcpCredential(directory: string): ReturnType<typeof loadOrCreateProfileMcpCredential> {
  return loadOrCreateProfileMcpCredential(directory, "default");
}

/** Explicit operator opt-in only; disabled mode performs no credential I/O. */
export function loadOptionalCodexMcpCredential(directory: string, enabled = process.env.GKOS_CODEX_MCP_ENABLED): ReturnType<typeof loadOrCreateProfileMcpCredential> | null {
  if (enabled === undefined || enabled === "0") return null;
  if (enabled !== "1") throw new Error("GKX_WATCHER_CODEX_MCP_CONFIGURATION_INVALID");
  return loadOrCreateProfileMcpCredential(directory, "codex");
}

export function defaultCredentialStatusPaths(tokenPath: string, mcp: { tokenPath: string; identityPath: string }): Pick<StatusDoc, "token_path" | "mcp_token_path" | "mcp_identity_path"> {
  return { token_path: tokenPath, mcp_token_path: mcp.tokenPath, mcp_identity_path: mcp.identityPath };
}

export function formatDefaultCredentialPaths(tokenPath: string, mcp: { tokenPath: string; identityPath: string }, statusFile: string): string {
  return `viewer credential: ${tokenPath}  MCP credential: ${mcp.tokenPath}  MCP identity: ${mcp.identityPath}  status: ${statusFile}`;
}

export function openValidatedCredentialDirectory(directory: string, viewerToken: string, mcp: ReturnType<typeof loadOrCreateDefaultMcpCredential>, codex: ReturnType<typeof loadOptionalCodexMcpCredential> = null): ReturnType<typeof openWatcherDirectory> {
  const capability = openWatcherDirectory(directory);
  const reopenedToken = readWatcherFile(capability, "desktop-agent.token", { maximum_bytes: 4_096 });
  if (reopenedToken.bytes.toString("utf8").trim() !== viewerToken) throw new Error("GKX_WATCHER_SERVICE_TOKEN_INVALID");
  const reopenedMcpToken = readWatcherFile(capability, "desktop-agent.mcp.token", { maximum_bytes: 4_096 });
  if (reopenedMcpToken.bytes.toString("utf8").trim() !== mcp.token) throw new Error("GKX_WATCHER_MCP_TOKEN_INVALID");
  const reopenedMcpIdentity = readWatcherFile(capability, "desktop-agent.mcp.identity.json", { maximum_bytes: 4_096 });
  if (reopenedMcpIdentity.bytes.toString("utf8") !== JSON.stringify(mcp.state, null, 2)) throw new Error("GKX_WATCHER_MCP_IDENTITY_INVALID");
  if (codex) {
    if (new Set([viewerToken, mcp.token, codex.token]).size !== 3 || mcp.state.credential_id === codex.state.credential_id || mcp.state.agent_id === codex.state.agent_id) throw new Error("GKOS_SERVICE_CREDENTIAL_DUPLICATE");
    const codexToken = readWatcherFile(capability, "desktop-agent.codex.mcp.token", { maximum_bytes: 4096 });
    const codexIdentity = readWatcherFile(capability, "desktop-agent.codex.mcp.identity.json", { maximum_bytes: 4096 });
    if (codexToken.bytes.toString("utf8").trim() !== codex.token) throw new Error("GKX_WATCHER_MCP_TOKEN_INVALID");
    if (codexIdentity.bytes.toString("utf8") !== JSON.stringify(codex.state, null, 2)) throw new Error("GKX_WATCHER_MCP_IDENTITY_INVALID");
  }
  return capability;
}

/**
 * Accepts only a second live capability for the same already-bound directory.
 * The host supplies this before either owner can mutate S, after which both
 * owners share the same seal object. This never reopens or absorbs a delta.
 */
export function bindAuthorizedStatusDirectory(
  current: WatcherDirectoryCapability,
  hostDirectory: WatcherDirectoryCapability,
  expectedNamespace: string,
): WatcherDirectoryCapability {
  if (!/^sha256:[0-9a-f]{64}$/u.test(expectedNamespace)) throw new TypeError("GKX_WATCHER_STATUS_NAMESPACE_INVALID");
  revalidateWatcherDirectory(current);
  revalidateWatcherDirectory(hostDirectory);
  if (current.path !== hostDirectory.path || current.identity.device !== hostDirectory.identity.device ||
    current.identity.inode !== hostDirectory.identity.inode || current.identity.mode !== hostDirectory.identity.mode ||
    current.identity.nlink !== hostDirectory.identity.nlink) {
    throw new Error("GKX_WATCHER_STATUS_CAPABILITY_MISMATCH");
  }
  if (watcherNamespaceCoordinate(current) !== expectedNamespace ||
    watcherNamespaceCoordinate(hostDirectory) !== expectedNamespace) {
    throw new Error("GKX_WATCHER_STATUS_NAMESPACE_CHANGED");
  }
  return hostDirectory;
}

export function captureStatusDirectoryNamespace(directory: WatcherDirectoryCapability): string {
  return watcherNamespaceCoordinate(directory);
}

/** Load the persisted bearer token, or generate + persist one on first run. */
export function loadOrCreateToken(tokenPath: string): string {
  const existingBytes = readProtectedCredentialLeaf(tokenPath);
  if (existingBytes !== null) {
    const existing = existingBytes.trim();
    if (!/^[A-Za-z0-9._~-]{32,512}$/u.test(existing)) throw new Error("GKX_WATCHER_CREDENTIAL_INVALID");
    return existing;
  }
  const token = crypto.randomBytes(32).toString("hex");
  const directory = path.dirname(tokenPath);
  const directoryExisted = fs.existsSync(directory);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!directoryExisted && process.platform !== "win32") fs.chmodSync(directory, 0o700);
  // 0600 intent: readable only by the owner. On Windows the mode is largely
  // advisory; we still pass it so POSIX CI runners get real permissions.
  fs.writeFileSync(tokenPath, token, { flag: "wx", mode: 0o600 });
  try {
    fs.chmodSync(tokenPath, 0o600);
  } catch {
    /* Windows: best effort */
  }
  return token;
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export interface AgentServerHandle {
  server: http.Server;
  address(): AddressInfo;
  close(): Promise<void>;
}

interface AgentGraphView {
  readonly graph: GkxGraph | null;
}

function createAgentRequestHandler(opts: {
  index: AgentGraphView;
  token: string;
  getStatus: () => StatusDoc;
  vaultName?: string;
  reservedWatcherRoutes?: ReadonlySet<string>;
}): (request: http.IncomingMessage, response: http.ServerResponse) => boolean {
  const { index, token, getStatus } = opts;
  const vault = opts.vaultName ?? "vault";

  /**
   * Resolve the request's Origin against the allowlist. Returns the exact
   * origin string to reflect, or null when the request has no Origin (same
   * origin / non-browser caller — no CORS needed) or an Origin that is not
   * allowlisted (a drive-by site — deliberately no CORS headers so the browser
   * blocks it).
   */
  const allowedOrigin = (req: http.IncomingMessage): string | null => {
    const origin = req.headers["origin"];
    if (!origin || Array.isArray(origin)) return null;
    return CORS_ALLOWLIST.includes(origin) ? origin : null;
  };

  /** Apply the CORS response headers for an allowlisted origin. */
  const applyCorsHeaders = (res: http.ServerResponse, origin: string): void => {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  };

  const send = (
    res: http.ServerResponse,
    code: number,
    body: unknown,
    origin?: string | null,
  ): void => {
    const json = JSON.stringify(body);
    if (origin) applyCorsHeaders(res, origin);
    res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
    res.end(json);
  };

  const authorized = (req: http.IncomingMessage): boolean => {
    const header = req.headers["authorization"];
    if (!header || Array.isArray(header)) return false;
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m) return false;
    return constantTimeEqual(m[1].trim(), token);
  };

  return (req, res) => {
    if (opts.reservedWatcherRoutes?.has(req.url ?? "") === true) return false;
    const origin = allowedOrigin(req);

    // CORS preflight: the browser sends OPTIONS with no credentials to learn
    // whether the real request is permitted. It CANNOT carry the bearer token,
    // so we must answer it BEFORE the auth gate. Allowlisted origins get a 204
    // with the CORS headers; any other origin gets a bare 204 with no CORS
    // headers (the browser then blocks the real request). The subsequent GET
    // still enforces the token.
    if (req.method === "OPTIONS") {
      if (origin) applyCorsHeaders(res, origin);
      res.writeHead(204);
      res.end();
      return true;
    }

    // Token required on EVERY non-preflight request, no exceptions (spec). CORS
    // headers are still reflected on the 401 so a browser can read the status.
    if (!authorized(req)) {
      send(res, 401, { error: "unauthorized", detail: "Bearer token required." }, origin);
      return true;
    }

    const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}`);
    const route = url.pathname.replace(/\/+$/, "") || "/";

    if (req.method !== "GET") {
      send(
        res,
        405,
        { error: "method_not_allowed", detail: "Read-only agent API; GET only." },
        origin,
      );
      return true;
    }

    switch (route) {
      case "/":
      case "/health": {
        send(res, 200, getStatus(), origin);
        return true;
      }
      case "/notes": {
        const graph = index.graph;
        const notes = (graph?.nodes ?? [])
          .filter((n) => n.kind !== "folder")
          .map((n) => ({
            id: n.id,
            path: n.path,
            label: n.label,
            type: n.type ?? null,
            sensitivity: n.gkx?.projection?.effective.sensitivity ?? null,
          }));
        send(res, 200, { notes, count: notes.length }, origin);
        return true;
      }
      case "/graph": {
        send(res, 200, index.graph ?? { nodes: [], links: [] }, origin);
        return true;
      }
      case "/graphiti/episodes": {
        const graph = index.graph;
        const episodes = graph ? buildGraphitiEpisodes(graph, { vault }) : [];
        send(res, 200, { episodes, count: episodes.length }, origin);
        return true;
      }
      default:
        send(res, 404, { error: "not_found", detail: route }, origin);
        return true;
    }
  };
}

/**
 * Create the loopback-only read-only agent API. The `index` is the live
 * GkxIndex; endpoints project its current graph. Every request requires the
 * bearer token (401 otherwise). The server binds 127.0.0.1 and nothing else.
 */
export function createAgentServer(opts: {
  index: GkxIndex;
  token: string;
  getStatus: () => StatusDoc;
  vaultName?: string;
}): http.Server {
  const handle = createAgentRequestHandler(opts);
  return http.createServer((request, response) => { handle(request, response); });
}

function legacyStatusFromWatcher(
  status: Readonly<Record<string, unknown>>,
  args: DesktopAgentArgs,
  tokenPath: string,
  mcpCredential?: { tokenPath: string; identityPath: string },
): StatusDoc {
  const watcherState = String(status.watcher_state);
  return {
    pid: process.pid,
    port: args.port,
    url: `http://${LOOPBACK_HOST}:${args.port}/`,
    token_path: tokenPath,
    ...(mcpCredential ? { mcp_token_path: mcpCredential.tokenPath, mcp_identity_path: mcpCredential.identityPath } : {}),
    notes_dir: args.notesDir,
    default_sensitivity: args.defaultSensitivity,
    notes_indexed: Number.isSafeInteger(status.document_count) ? Number(status.document_count) : 0,
    state: watcherState === "error" ? "error" : watcherState === "serving" ? "serving" : "indexing",
    last_scan_iso: typeof status.last_sync === "string" ? status.last_sync : null,
  };
}

/** Entry point: one governed watcher/index generation → one loopback service. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(DESKTOP_AGENT_USAGE);
    return;
  }
  const args = parseArgs(argv);
  const tokenPath = path.join(path.dirname(args.statusFile), "desktop-agent.token");
  // S is a security capability, not a side effect of token/status creation.
  // Existing unsafe custom roots fail before either legacy file is touched.
  let statusCapability = ensureWatcherStatusDirectory(args.statusFile);
  const vaultName = path.basename(args.notesDir) || "vault";
  const initialStatus: StatusDoc = {
    pid: process.pid,
    port: args.port,
    url: `http://${LOOPBACK_HOST}:${args.port}/`,
    ...defaultCredentialStatusPaths(tokenPath, {
      tokenPath: path.join(path.dirname(args.statusFile), "desktop-agent.mcp.token"),
      identityPath: path.join(path.dirname(args.statusFile), "desktop-agent.mcp.identity.json"),
    }),
    notes_dir: args.notesDir,
    default_sensitivity: args.defaultSensitivity,
    notes_indexed: 0,
    state: "indexing",
    last_scan_iso: null,
  };
  const token = loadOrCreateToken(tokenPath);
  const mcpCredential = loadOrCreateDefaultMcpCredential(path.dirname(args.statusFile));
  const codexCredential = loadOptionalCodexMcpCredential(path.dirname(args.statusFile));
  const credentialRegistry = new ServiceCredentialRegistry([
    legacyViewerBinding(token, "secret"),
    ...[mcpCredential, ...(codexCredential ? [codexCredential] : [])].map(credential => defaultMcpAgentBinding(credential.token, {
      credentialId: credential.state.credential_id,
      agentId: credential.state.agent_id,
      agentLabel: credential.state.agent_label,
      sensitivityCeiling: credential.state.sensitivity_ceiling,
      revoked: credential.state.revoked,
      limits: {
        concurrentRequests: credential.state.limits.concurrent_requests,
        bucketCapacity: credential.state.limits.bucket_capacity,
        refillMs: credential.state.limits.refill_ms,
      },
    })),
  ]);
  // Token creation is the one protected legacy mutation that precedes the
  // watcher service. On POSIX an initial create changes the S directory seal;
  // rebind only after securely reopening the exact token that was just loaded.
  const tokenDirectory = openValidatedCredentialDirectory(path.dirname(args.statusFile), token, mcpCredential, codexCredential);
  statusCapability = tokenDirectory;
  let latestStatus = initialStatus;
  const writeStatus = (status: StatusDoc): void => {
    latestStatus = status;
    try {
      revalidateWatcherDirectory(statusCapability);
      const bytes = Buffer.from(JSON.stringify(status, null, 2), "utf8");
      const statusLeaf = path.basename(args.statusFile);
      if (watcherLeafExists(statusCapability, statusLeaf)) {
        writeExistingWatcherFile(statusCapability, statusLeaf, bytes);
      } else {
        writeNewWatcherFile(statusCapability, statusLeaf, bytes);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("failed to write status file:", (e as Error).message);
    }
  };
  writeStatus(initialStatus);
  let expectedStatusNamespace: string | null = watcherNamespaceCoordinate(statusCapability);

  const localEmbedding = await loadLocalEmbeddingProvider(process.env.GKOS_LOCAL_EMBEDDING_CONFIG);
  const configurationDigest = retrievalCanonicalDigest({
    contract_version: "gkos-watcher-desktop-configuration/1.0.0-draft.1",
    default_sensitivity: args.defaultSensitivity,
    lexical_backend: "sqlite_fts5",
    ...(localEmbedding ? { local_embedding: localEmbedding.coordinate } : {}),
  });
  const policyDigest = retrievalCanonicalDigest({
    contract_version: "gkos-watcher-desktop-policy/1.0.0-draft.1",
    discoverability: "allow",
    default_sensitivity: args.defaultSensitivity,
  });
  const vaultId = `vault:${retrievalCanonicalDigest({
    contract_version: "gkos-watcher-desktop-vault-coordinate/1.0.0-draft.1",
    vault_root: args.notesDir,
  }).slice("sha256:".length, "sha256:".length + 24)}`;
  const configSeed = crypto.createHash("sha256").update(vaultId, "utf8").digest("hex");
  const navigationConfig = await buildVaultNavigationConfig({
    configId: `018f47a3-7b5e-7${configSeed.slice(0, 3)}-8${configSeed.slice(3, 6)}-${configSeed.slice(6, 18)}`,
    version: 1,
    vaultId,
    promotedMocNames: [],
    createdAt: "2026-08-26T00:00:00.000Z",
    createdBy: "system:gkos-standalone-service",
    policy: { id: "policy:gkos-standalone-navigation", version: "1.0.0", digest: policyDigest },
  });

  let host;
  try {
    host = await startWatcherHost({
      vault_root: args.notesDir,
      status_file: args.statusFile,
      vault_id: vaultId,
      configuration_digest: configurationDigest,
      policy_digest: policyDigest,
      projection_options: { defaultSensitivity: args.defaultSensitivity },
      port: args.port,
      unchanged_scan_fast_path: true,
      periodic_reconciliation_ms: 60000,
      local_embedding_sensitivity: localEmbedding?.indexingCeiling,
      coordinator_options: {
        vector_provider: localEmbedding?.provider,
        discoverability_policy: () => "allow",
        source_discoverability_policy: () => "allow",
      },
      on_status_directory_capability(directory) {
        // Bind once, before the host mutates S, to the host's exact live
        // capability. Both status writes and locator lifecycle now refresh the
        // same unforgeable seal. Never reopen S to absorb an unexplained delta.
        if (expectedStatusNamespace === null) throw new Error("GKX_WATCHER_STATUS_CAPABILITY_ALREADY_BOUND");
        statusCapability = bindAuthorizedStatusDirectory(statusCapability, directory, expectedStatusNamespace);
        expectedStatusNamespace = null;
      },
      on_status_change(status) { writeStatus(legacyStatusFromWatcher(status, args, tokenPath, mcpCredential)); },
      create_compatibility_request_handler(context) {
        const snapshot = () => {
          const committed = context.get_snapshot();
          const generationDigest = crypto.createHash("sha256").update(committed.service_generation_id, "utf8").digest("hex");
          const generation = Number.parseInt(generationDigest.slice(0, 13), 16) + 1;
          return {
            graph: committed.graph,
            sourceRecords: committed.sources,
            generation,
            evaluationTime: committed.graph.stats.indexedAt,
          };
        };
        return createLocalServiceRequestHandler({
          credentials: credentialRegistry,
          snapshot,
          authorization: (committed) => ({ configured: true, generation: committed.generation ?? 1, policyDigest: policyDigest as `sha256:${string}` }),
          status: () => ({ state: legacyStatusFromWatcher(context.get_status(), args, tokenPath, mcpCredential).state }),
          vaultName,
          vaultId,
          retrievalSearch: async (request, guards) => {
            const generation = context.get_snapshot().service_generation_id;
            return context.search_authorized(request, guards, generation);
          },
          navigationConfig,
          corsAllowlist: CORS_ALLOWLIST,
          reservedRoutes: new Set(["/status", "/control/shutdown"]),
        });
      },
    });
    writeStatus(legacyStatusFromWatcher(host.status(), args, tokenPath, mcpCredential));
  } catch (e) {
    writeStatus({ ...latestStatus, state: "error" });
    // eslint-disable-next-line no-console
    console.error("initial scan failed:", (e as Error).message);
    process.exitCode = 1;
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `gkos-agent v${ENGINE_VERSION} serving ${String(host.status().document_count)} notes on http://${LOOPBACK_HOST}:${args.port}/ (loopback only)`,
  );
  // eslint-disable-next-line no-console
  console.log(formatDefaultCredentialPaths(tokenPath, mcpCredential, args.statusFile));

  const shutdown = (): void => { void host.shutdown().catch((error: unknown) => {
    process.exitCode = 1;
    // eslint-disable-next-line no-console
    console.error("watcher shutdown failed:", (error as Error).message);
  }); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  void host.closed.finally(() => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  });
}

// Auto-run only for a real CLI/SEA invocation, never when imported by tests.
const invocationArgs = process.argv.slice(2);
if (invocationArgs.includes("--notes") || invocationArgs.includes("--help") || invocationArgs.includes("-h")) {
  void main();
}
