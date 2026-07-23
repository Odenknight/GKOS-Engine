/**
 * GKOS Engine — Desktop Agent sidecar (headless).
 *
 * A single self-contained entry point compiled per-platform into a Node SEA
 * binary (`kosmos-agent`). It points the deterministic engine at a notes
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
 * surface (`KosmosIndex`, `parseSourceFile`, `buildGraphitiEpisodes`) rather
 * than reimplementing projection. The repo has no standalone agent-server
 * module to import (the agent server currently lives plugin-coupled in
 * Kosmos-Oden), so the minimal loopback transport is defined here.
 */
import * as http from "node:http";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { AddressInfo } from "node:net";

import {
  KosmosIndex,
  buildGraphitiEpisodes,
  DEFAULT_IGNORED_DIRS,
  shouldIgnoreVaultPath,
  normalizeVaultRelative,
  extensionFromPath,
  ENGINE_VERSION,
  type OkfSensitivity,
  type SourceFile,
  type IndexChanges,
} from "./index";

/** The seven-level sensitivity vocabulary (GKOS §11), fail-closed to secret. */
export const SENSITIVITY_LEVELS: readonly OkfSensitivity[] = [
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
  defaultSensitivity: OkfSensitivity;
  port: number;
  statusFile: string;
}

/**
 * Parse CLI args. Mirrors the spec exactly:
 *   --notes <dir>                 REQUIRED (throws when absent)
 *   --default-sensitivity <level> validated against the seven-level vocab;
 *                                 invalid/missing → "secret" (fail-closed)
 *   --port <n>                    default 4814; invalid → default
 *   --status-file <path>          default <notesDir>/.okf/desktop-agent.status.json
 * `--host` is intentionally unsupported.
 */
export function parseArgs(argv: string[]): DesktopAgentArgs {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
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
  const defaultSensitivity: OkfSensitivity =
    rawSensitivity && SENSITIVITY_LEVELS.includes(rawSensitivity as OkfSensitivity)
      ? (rawSensitivity as OkfSensitivity)
      : "secret";

  const rawPort = map.get("port");
  const parsedPort = rawPort != null ? Number.parseInt(rawPort, 10) : NaN;
  const port =
    Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : DEFAULT_PORT;

  const statusFile = map.get("status-file")
    ? path.resolve(map.get("status-file")!)
    : path.resolve(notesDir, ".okf", "desktop-agent.status.json");

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
 * DEFAULT_IGNORED_DIRS (incl. `.okf`). Markdown/base files are loaded with
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
  notes_dir: string;
  default_sensitivity: OkfSensitivity;
  notes_indexed: number;
  state: "indexing" | "serving" | "error";
  last_scan_iso: string | null;
}

/** Load the persisted bearer token, or generate + persist one on first run. */
export function loadOrCreateToken(tokenPath: string): string {
  try {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    if (existing) return existing;
  } catch {
    /* first run */
  }
  const token = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  // 0600 intent: readable only by the owner. On Windows the mode is largely
  // advisory; we still pass it so POSIX CI runners get real permissions.
  fs.writeFileSync(tokenPath, token, { mode: 0o600 });
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

/**
 * Create the loopback-only read-only agent API. The `index` is the live
 * KosmosIndex; endpoints project its current graph. Every request requires the
 * bearer token (401 otherwise). The server binds 127.0.0.1 and nothing else.
 */
export function createAgentServer(opts: {
  index: KosmosIndex;
  token: string;
  getStatus: () => StatusDoc;
  vaultName?: string;
}): http.Server {
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

  return http.createServer((req, res) => {
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
      return;
    }

    // Token required on EVERY non-preflight request, no exceptions (spec). CORS
    // headers are still reflected on the 401 so a browser can read the status.
    if (!authorized(req)) {
      send(res, 401, { error: "unauthorized", detail: "Bearer token required." }, origin);
      return;
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
      return;
    }

    switch (route) {
      case "/":
      case "/health": {
        send(res, 200, getStatus(), origin);
        return;
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
            sensitivity: n.okf?.projection?.effective.sensitivity ?? null,
          }));
        send(res, 200, { notes, count: notes.length }, origin);
        return;
      }
      case "/graph": {
        send(res, 200, index.graph ?? { nodes: [], links: [] }, origin);
        return;
      }
      case "/graphiti/episodes": {
        const graph = index.graph;
        const episodes = graph ? buildGraphitiEpisodes(graph, { vault }) : [];
        send(res, 200, { episodes, count: episodes.length }, origin);
        return;
      }
      default:
        send(res, 404, { error: "not_found", detail: route }, origin);
    }
  });
}

/** Entry point: scan → index → watch → serve. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const tokenPath = path.join(path.dirname(args.statusFile), "desktop-agent.token");
  const vaultName = path.basename(args.notesDir) || "vault";

  let state: StatusDoc["state"] = "indexing";
  let lastScanIso: string | null = null;
  const index = new KosmosIndex({ defaultSensitivity: args.defaultSensitivity });

  const token = loadOrCreateToken(tokenPath);

  const getStatus = (): StatusDoc => ({
    pid: process.pid,
    port: args.port,
    url: `http://${LOOPBACK_HOST}:${args.port}/`,
    token_path: tokenPath,
    notes_dir: args.notesDir,
    default_sensitivity: args.defaultSensitivity,
    notes_indexed: index.noteCount,
    state,
    last_scan_iso: lastScanIso,
  });

  const writeStatus = (): void => {
    try {
      fs.mkdirSync(path.dirname(args.statusFile), { recursive: true });
      fs.writeFileSync(args.statusFile, JSON.stringify(getStatus(), null, 2));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("failed to write status file:", (e as Error).message);
    }
  };

  writeStatus();

  // ---- initial scan ----
  try {
    const scan = scanNotesDir(args.notesDir);
    index.setFiles(scan.files, scan.folders, scan.attachments);
    lastScanIso = new Date().toISOString();
    state = "serving";
  } catch (e) {
    state = "error";
    writeStatus();
    // eslint-disable-next-line no-console
    console.error("initial scan failed:", (e as Error).message);
    process.exitCode = 1;
    return;
  }

  // ---- watch with coalescing debounce ----
  const rescanAndApply = (): void => {
    const scan = scanNotesDir(args.notesDir);
    const changes: IndexChanges = {
      changed: scan.files,
      folders: scan.folders,
      attachments: scan.attachments,
    };
    // Removals: any indexed record no longer present on disk.
    const present = new Set(scan.files.map((f) => normalizeVaultRelative(f.relativePath)));
    const removed: string[] = [];
    for (const rel of index.getRecords().keys()) {
      if (!present.has(rel)) removed.push(rel);
    }
    if (removed.length) changes.removed = removed;
    index.applyChanges(changes);
    lastScanIso = new Date().toISOString();
    writeStatus();
  };

  const debouncer = new Debouncer(DEBOUNCE_MS, () => {
    try {
      rescanAndApply();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("applyChanges failed:", (e as Error).message);
    }
  });

  try {
    fs.watch(args.notesDir, { recursive: true }, (_evt, filename) => {
      debouncer.schedule(filename ? String(filename) : "");
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("fs.watch failed (continuing without live updates):", (e as Error).message);
  }

  // ---- serve (loopback only) ----
  const server = createAgentServer({ index, token, getStatus, vaultName });
  server.listen(args.port, LOOPBACK_HOST, () => {
    writeStatus();
    // eslint-disable-next-line no-console
    console.log(
      `kosmos-agent v${ENGINE_VERSION} serving ${index.noteCount} notes on http://${LOOPBACK_HOST}:${args.port}/ (loopback only)`,
    );
    // eslint-disable-next-line no-console
    console.log(`token: ${tokenPath}  status: ${args.statusFile}`);
  });

  const shutdown = (): void => {
    debouncer.dispose();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Auto-run only for a real CLI/SEA invocation (always carries --notes), never
// when the module is imported by the test runner.
if (process.argv.slice(2).includes("--notes")) {
  void main();
}
