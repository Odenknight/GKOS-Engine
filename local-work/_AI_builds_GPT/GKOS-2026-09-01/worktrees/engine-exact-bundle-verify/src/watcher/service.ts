import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { sealWatcherRecoveryRecord } from "./contracts";
import {
  discardIncompleteWatcherLeaf,
  hardlinkWatcherLeafNoReplace,
  listWatcherLeaves,
  parseCanonicalWatcherJson,
  readWatcherFile,
  revalidateWatcherDirectory,
  replaceWatcherLeaf,
  syncWatcherDirectory,
  unlinkWatcherLeaf,
  watcherCanonicalBytes,
  watcherDigest,
  watcherLeafExists,
  watcherRawDigest,
  watcherTimestamp,
  writeNewWatcherFile,
  type WatcherDirectoryCapability,
} from "./fs-authority";

type JsonRecord = Record<string, unknown>;

export const WATCHER_SERVICE_LOCATOR_FILE = "watcher-service-locator.json";
export const WATCHER_SERVICE_TOKEN_FILE = "desktop-agent.token";

function fail(code: string): never { throw new Error(code); }

function processIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

function equalToken(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearerToken(directory: WatcherDirectoryCapability): string {
  const file = readWatcherFile(directory, WATCHER_SERVICE_TOKEN_FILE, { maximum_bytes: 4_096 });
  const token = file.bytes.toString("utf8").trim();
  if (token.length < 1 || token.length > 1_024 || /[\u0000-\u001f\u007f]/u.test(token)) fail("GKX_WATCHER_SERVICE_TOKEN_INVALID");
  return token;
}

export function watcherStatusRecord(input: {
  readonly service_instance_id: string;
  readonly watcher_state: "starting" | "reconciling" | "serving" | "stopping" | "error";
  readonly freshness: "fresh" | "stale" | "degraded";
  readonly reason_codes: readonly string[];
  readonly document_count: number;
  readonly chunk_count: number;
  readonly embedding_model: string | null;
  readonly last_sync: string | null;
  readonly uptime_ms: number;
  readonly pid: number;
  readonly source_snapshot_digest: string | null;
  readonly coherent_manifest_digest: string | null;
  readonly configuration_digest: string | null;
  readonly policy_digest: string | null;
}): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-status/1.0.0-draft.1",
    service_instance_id: input.service_instance_id,
    watcher_state: input.watcher_state,
    freshness: input.freshness,
    reason_codes: [...input.reason_codes].sort(),
    document_count: input.document_count,
    chunk_count: input.chunk_count,
    embedding_model: input.embedding_model,
    last_sync: input.last_sync,
    uptime_ms: input.uptime_ms,
    pid: input.pid,
    source_snapshot_digest: input.source_snapshot_digest,
    coherent_manifest_digest: input.coherent_manifest_digest,
    configuration_digest: input.configuration_digest,
    policy_digest: input.policy_digest,
  };
  return sealWatcherRecoveryRecord({ ...base, status_digest: watcherDigest(base) });
}

export function watcherStatusText(statusInput: unknown): string {
  const status = sealWatcherRecoveryRecord(statusInput);
  return [
    "gkos status",
    `documents: ${String(status.document_count)}`,
    `chunks: ${String(status.chunk_count)}`,
    `embedding_model: ${String(status.embedding_model)}`,
    `watcher_state: ${String(status.watcher_state)}`,
    `freshness: ${String(status.freshness)}`,
    `last_sync: ${String(status.last_sync)}`,
    `uptime_ms: ${String(status.uptime_ms)}`,
    `pid: ${String(status.pid)}`,
    `reasons: ${JSON.stringify(status.reason_codes)}`,
    "",
  ].join("\n");
}

function locatorRecord(input: {
  readonly service_instance_id: string;
  readonly port: number;
  readonly started_at: string;
}): Readonly<JsonRecord> {
  const base = {
    contract_version: "gkos-watcher-service-locator/1.0.0-draft.1",
    service_instance_id: input.service_instance_id,
    pid: process.pid,
    loopback_host: "127.0.0.1",
    port: input.port,
    status_route: "/status",
    control_route: "/control/shutdown",
    started_at: input.started_at,
  };
  return sealWatcherRecoveryRecord({ ...base, locator_digest: watcherDigest(base) });
}

function openedLocator(
  directory: WatcherDirectoryCapability,
  leaf: string,
  allowedLinks: 1 | 2 = 1,
): { readonly file: ReturnType<typeof readWatcherFile>; readonly locator: Readonly<JsonRecord> } {
  const file = readWatcherFile(directory, leaf, { allowed_links: allowedLinks, maximum_bytes: 1_048_576 });
  const locator = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(file));
  if (!file.bytes.equals(watcherCanonicalBytes(locator))) fail("GKX_WATCHER_SERVICE_LOCATOR_INVALID");
  return { file, locator };
}

function sameFileIdentity(
  left: ReturnType<typeof readWatcherFile>,
  right: ReturnType<typeof readWatcherFile>,
): boolean {
  return left.identity.device === right.identity.device && left.identity.inode === right.identity.inode;
}

function openedLocatorOneOrTwoLinks(
  directory: WatcherDirectoryCapability,
  leaf: string,
): ReturnType<typeof openedLocator> {
  try { return openedLocator(directory, leaf); }
  catch { return openedLocator(directory, leaf, 2); }
}

function classifyLocatorTemporary(
  directory: WatcherDirectoryCapability,
  leaf: string,
): { readonly kind: "incomplete"; readonly file: ReturnType<typeof readWatcherFile> } |
   { readonly kind: "complete"; readonly opened: ReturnType<typeof openedLocator> } {
  let file;
  try { file = readWatcherFile(directory, leaf, { maximum_bytes: 1_048_576 }); }
  catch { file = readWatcherFile(directory, leaf, { allowed_links: 2, maximum_bytes: 1_048_576 }); }
  let parsed: unknown;
  try { parsed = JSON.parse(file.bytes.toString("utf8")); }
  catch { return { kind: "incomplete", file }; }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) ||
      !file.bytes.equals(watcherCanonicalBytes(parsed))) return { kind: "incomplete", file };
  let locator: Readonly<JsonRecord>;
  try { locator = sealWatcherRecoveryRecord(parsed); }
  catch { fail("GKX_WATCHER_SERVICE_LOCATOR_RECOVERY_REQUIRED"); }
  return { kind: "complete", opened: { file, locator } };
}

function publishLocator(
  directory: WatcherDirectoryCapability,
  ownerNonce: string,
  locator: Readonly<JsonRecord>,
  revalidateAuthority: () => void,
): string {
  const temporary = `.watcher-service-locator.${ownerNonce}.tmp`;
  const bytes = watcherCanonicalBytes(locator);
  const expectedRaw = watcherRawDigest(bytes);
  revalidateAuthority();
  revalidateWatcherDirectory(directory);
  const temporaries = listWatcherLeaves(directory).filter((leaf) => /^\.watcher-service-locator\.[0-9a-f]{32}\.tmp$/u.test(leaf));
  if (temporaries.length > 1) fail("GKX_WATCHER_SERVICE_LOCATOR_RECOVERY_REQUIRED");

  let final = watcherLeafExists(directory, WATCHER_SERVICE_LOCATOR_FILE)
    ? openedLocatorOneOrTwoLinks(directory, WATCHER_SERVICE_LOCATOR_FILE)
    : null;
  const priorTemporary = temporaries[0] ?? null;
  if (priorTemporary !== null && priorTemporary !== temporary) {
    const classified = classifyLocatorTemporary(directory, priorTemporary);
    let prior = classified.kind === "complete" ? classified.opened : null;
    if (classified.kind === "incomplete") {
      discardIncompleteWatcherLeaf(directory, priorTemporary);
      revalidateAuthority();
      final = watcherLeafExists(directory, WATCHER_SERVICE_LOCATOR_FILE)
        ? openedLocator(directory, WATCHER_SERVICE_LOCATOR_FILE)
        : null;
    }
    if (prior !== null) {
      if (final === null || !sameFileIdentity(prior.file, final.file) || processIsAlive(Number(final.locator.pid))) {
        fail("GKX_WATCHER_SERVICE_LOCATOR_RECOVERY_REQUIRED");
      }
      unlinkWatcherLeaf(directory, priorTemporary, { allowed_links: 2, expected_raw_sha256: prior.file.raw_sha256 });
      final = openedLocator(directory, WATCHER_SERVICE_LOCATOR_FILE);
    }
  }

  if (final !== null && final.file.bytes.equals(bytes)) {
    if (final.locator.pid !== process.pid || final.locator.service_instance_id !== locator.service_instance_id) {
      fail("GKX_WATCHER_SERVICE_LOCATOR_RECOVERY_REQUIRED");
    }
    if (watcherLeafExists(directory, temporary)) {
      const staged = openedLocator(directory, temporary, 2);
      const linkedFinal = openedLocator(directory, WATCHER_SERVICE_LOCATOR_FILE, 2);
      if (!sameFileIdentity(staged.file, linkedFinal.file) || !staged.file.bytes.equals(bytes)) {
        fail("GKX_WATCHER_SERVICE_LOCATOR_RECOVERY_REQUIRED");
      }
      unlinkWatcherLeaf(directory, temporary, { allowed_links: 2, expected_raw_sha256: expectedRaw });
    }
    revalidateAuthority();
    return expectedRaw;
  }
  if (final !== null && processIsAlive(Number(final.locator.pid))) fail("GKX_WATCHER_SERVICE_ALREADY_ACTIVE");

  if (watcherLeafExists(directory, temporary)) {
    const classified = classifyLocatorTemporary(directory, temporary);
    if (classified.kind === "incomplete") discardIncompleteWatcherLeaf(directory, temporary);
    else if (!classified.opened.file.bytes.equals(bytes)) fail("GKX_WATCHER_SERVICE_LOCATOR_RECOVERY_REQUIRED");
  }
  if (!watcherLeafExists(directory, temporary)) writeNewWatcherFile(directory, temporary, bytes, 1_048_576);
  revalidateAuthority();
  if (final === null) {
    hardlinkWatcherLeafNoReplace(directory, temporary, WATCHER_SERVICE_LOCATOR_FILE);
    const staged = openedLocator(directory, temporary, 2);
    const linked = openedLocator(directory, WATCHER_SERVICE_LOCATOR_FILE, 2);
    if (!sameFileIdentity(staged.file, linked.file) || !linked.file.bytes.equals(bytes)) {
      fail("GKX_WATCHER_SERVICE_LOCATOR_RECOVERY_REQUIRED");
    }
    unlinkWatcherLeaf(directory, temporary, { allowed_links: 2, expected_raw_sha256: expectedRaw });
  } else {
    replaceWatcherLeaf(directory, temporary, WATCHER_SERVICE_LOCATOR_FILE, expectedRaw);
  }
  revalidateAuthority();
  const reopened = readWatcherFile(directory, WATCHER_SERVICE_LOCATOR_FILE, { maximum_bytes: 1_048_576 });
  if (!reopened.bytes.equals(bytes)) fail("GKX_WATCHER_SERVICE_LOCATOR_INVALID");
  return reopened.raw_sha256;
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_024) request.destroy(new Error("GKX_WATCHER_CONTROL_BODY_INVALID"));
      else chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function send(response: ServerResponse, status: number, body: Uint8Array, contentType = "application/json; charset=utf-8"): void {
  response.writeHead(status, { "content-type": contentType, "content-length": body.byteLength });
  response.end(body);
}

export interface WatcherServiceHandle {
  readonly server: Server;
  readonly locator: Readonly<JsonRecord>;
  readonly shutdown: () => Promise<void>;
  readonly closed: Promise<void>;
}

/**
 * Repository-private compatibility seam for the pre-Phase-5 desktop routes.
 * A handler returns true only after it has completely answered the request;
 * false leaves the exact `/status` and `/control/shutdown` routes to this
 * service. The handler receives no locator or token authority from here.
 */
export interface WatcherServiceRequestHandler {
  (request: IncomingMessage, response: ServerResponse): boolean | Promise<boolean>;
  closeStreams?: () => void;
}

export async function startWatcherService(options: {
  readonly status_directory: WatcherDirectoryCapability;
  readonly service_instance_id: string;
  readonly host_lock_owner_nonce: string;
  readonly get_status: () => Readonly<JsonRecord> | Promise<Readonly<JsonRecord>>;
  readonly on_stopping?: () => void;
  readonly on_shutdown: (context: { readonly signal: AbortSignal; readonly deadline_ms: number }) => Promise<void> | void;
  readonly revalidate_authority?: () => void;
  readonly compatibility_request_handler?: WatcherServiceRequestHandler;
  readonly port?: number;
}): Promise<WatcherServiceHandle> {
  const token = bearerToken(options.status_directory);
  const startedAt = watcherTimestamp();
  let shutdownPromise: Promise<void> | null = null;
  let resolveClosed!: () => void;
  let rejectClosed!: (error: unknown) => void;
  const closed = new Promise<void>((resolve, reject) => { resolveClosed = resolve; rejectClosed = reject; });
  let locator!: Readonly<JsonRecord>;
  let locatorRaw = "";
  let stopping = false;
  let shutdown!: () => Promise<void>;
  const server = createServer(async (request, response) => {
    try {
      if (stopping) {
        send(response, 503, Buffer.from('{"error":"operational_failure"}\n'));
        return;
      }
      if (options.compatibility_request_handler !== undefined &&
          await options.compatibility_request_handler(request, response)) return;
      const authorization = request.headers.authorization;
      if (typeof authorization !== "string" || !/^Bearer\s+/u.test(authorization) ||
          !equalToken(authorization.replace(/^Bearer\s+/u, ""), token)) {
        send(response, 401, Buffer.from('{"error":"unauthorized"}\n'));
        return;
      }
      const origin = request.headers.origin;
      if (origin !== undefined && origin !== `http://127.0.0.1:${String(locator.port)}`) {
        send(response, 403, Buffer.from('{"error":"origin_rejected"}\n'));
        return;
      }
      const body = await readBody(request);
      if (body.byteLength !== 0 || request.headers["content-type"] !== undefined) {
        send(response, 400, Buffer.from('{"error":"body_rejected"}\n'));
        return;
      }
      if (request.method === "GET" && request.url === "/status") {
        const currentFile = readWatcherFile(options.status_directory, WATCHER_SERVICE_LOCATOR_FILE, { maximum_bytes: 1_048_576 });
        const current = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(currentFile));
        if (currentFile.raw_sha256 !== locatorRaw || current.service_instance_id !== options.service_instance_id || current.pid !== process.pid) {
          fail("GKX_WATCHER_SERVICE_LOCATOR_CHANGED");
        }
        // A truthful `fresh` response is request-local authority, not a cached
        // timer observation. The host callback securely replays and, when
        // necessary, joins the sole reconciliation coordinator before this
        // response captures its immutable status record.
        send(response, 200, watcherCanonicalBytes(await options.get_status()));
        return;
      }
      if (request.method === "POST" && request.url === "/control/shutdown") {
        send(response, 202, Buffer.from('{"status":"stopping"}\n'));
        void shutdown();
        return;
      }
      send(response, 404, Buffer.from('{"error":"not_found"}\n'));
    } catch {
      if (!response.headersSent) send(response, 503, Buffer.from('{"error":"operational_failure"}\n'));
      else response.destroy();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (address === null || typeof address === "string") fail("GKX_WATCHER_SERVICE_LISTEN_INVALID");
  locator = locatorRecord({ service_instance_id: options.service_instance_id, port: address.port, started_at: startedAt });
  locatorRaw = publishLocator(
    options.status_directory,
    options.host_lock_owner_nonce,
    locator,
    options.revalidate_authority ?? (() => undefined),
  );

  shutdown = (): Promise<void> => {
    if (shutdownPromise !== null) return shutdownPromise;
    const controller = new AbortController();
    const deadlineMs = Date.now() + 10_000;
    stopping = true;
    options.on_stopping?.();
    shutdownPromise = (async () => {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const deadline = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("GKX_WATCHER_SHUTDOWN_UNSAFE"));
        }, 10_000);
      });
      const graceful = (async () => {
        options.compatibility_request_handler?.closeStreams?.();
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (controller.signal.aborted) fail("GKX_WATCHER_SHUTDOWN_UNSAFE");
        await options.on_shutdown({ signal: controller.signal, deadline_ms: deadlineMs });
        if (controller.signal.aborted) fail("GKX_WATCHER_SHUTDOWN_UNSAFE");
        const file = readWatcherFile(options.status_directory, WATCHER_SERVICE_LOCATOR_FILE, { maximum_bytes: 1_048_576 });
        if (file.raw_sha256 !== locatorRaw) fail("GKX_WATCHER_SERVICE_LOCATOR_CHANGED");
        unlinkWatcherLeaf(options.status_directory, WATCHER_SERVICE_LOCATOR_FILE, { expected_raw_sha256: locatorRaw });
        syncWatcherDirectory(options.status_directory.path);
      })();
      try {
        await Promise.race([graceful, deadline]);
        resolveClosed();
      } finally {
        if (timeout !== null) clearTimeout(timeout);
      }
    })().catch((error) => { rejectClosed(error); throw error; });
    return shutdownPromise;
  };
  return Object.freeze({ server, locator, shutdown, closed });
}
