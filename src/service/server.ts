import { ServiceWorkScheduler, WorkScheduleError } from "./work-scheduler";
import type { ServiceRetrievalSearch } from "./retrieval";
import * as http from "node:http";
import type { VaultNavigationConfig } from "../navigation";
import { buildAuthorizedView, GkosServiceDeniedError, type GkosAuthorizedView } from "./authorized-view";
import { buildServiceCapabilities, type ServiceCapabilityConfiguration } from "./capabilities";
import { serializeServiceEventSse, ServiceTraversalEventRing } from "./events";
import { MCP_PROTOCOL_VERSION, MCP_REQUEST_BYTES, MCP_RESULT_BYTES, ServiceMcpRuntime } from "./mcp";
import type {
  ServiceAuthorizationConfiguration, ServiceCorpusSnapshot, ServiceCredentialIdentity, ServiceTraversalEvent,
} from "./types";
import { ServiceCredentialRegistry } from "./auth";

const GENERIC_DENIAL = Object.freeze({ error: "unauthorized" });
const GENERIC_FORBIDDEN = Object.freeze({ error: "forbidden" });
const POLICY_DECISION_ID = "018f47a3-7b5e-7c9d-8a1b-123456789abd";

export interface LocalServiceStatus {
  state: "indexing" | "serving" | "error";
}

export interface LocalServiceOptions {
  credentials: ServiceCredentialRegistry;
  snapshot: () => ServiceCorpusSnapshot | Promise<ServiceCorpusSnapshot>;
  authorization: (snapshot: ServiceCorpusSnapshot) => ServiceAuthorizationConfiguration | Promise<ServiceAuthorizationConfiguration>;
  status: () => LocalServiceStatus;
  vaultName?: string;
  vaultId?: string;
  retrievalSearch?: ServiceRetrievalSearch;
  navigationConfig?: VaultNavigationConfig;
  capabilities?: ServiceCapabilityConfiguration;
  eventRing?: ServiceTraversalEventRing;
  corsAllowlist?: readonly string[];
  reservedRoutes?: ReadonlySet<string>;
  requestTimeoutMs?: number;
  streamHeartbeatMs?: number;
  workQueueWaitMs?: number;
}

interface RateState { tokens: number; lastRefill: number; active: number }
export interface LocalServiceRequestHandler {
  (request: http.IncomingMessage, response: http.ServerResponse): boolean;
  closeStreams(): void;
}

const REST_RESPONSE_BYTES = 8_388_608;
const CLIENT_EVENT_QUEUE_BYTES = 524_288;
const CLIENT_EVENT_QUEUE_ITEMS = 256;

function waitForDrain(response: http.ServerResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      response.off("drain", drained);
      response.off("close", closed);
      response.off("error", failed);
    };
    const drained = (): void => { cleanup(); resolve(); };
    const closed = (): void => { cleanup(); reject(new Error("GKOS_SERVICE_EVENT_STREAM_CLOSED")); };
    const failed = (): void => { cleanup(); reject(new Error("GKOS_SERVICE_EVENT_STREAM_FAILED")); };
    response.once("drain", drained);
    response.once("close", closed);
    response.once("error", failed);
  });
}

function jsonBytes(value: unknown): Buffer { return Buffer.from(JSON.stringify(value), "utf8"); }
function exactIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function evaluationTime(snapshot: ServiceCorpusSnapshot, authorization: ServiceAuthorizationConfiguration): string {
  if (exactIso(snapshot.evaluationTime)) return snapshot.evaluationTime;
  if (exactIso(snapshot.graph?.stats.indexedAt)) return snapshot.graph.stats.indexedAt;
  const generation = Number.isSafeInteger(snapshot.generation) ? Number(snapshot.generation) : Number(authorization.generation);
  return new Date(Math.max(0, generation)).toISOString();
}

function bearer(request: http.IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (!header || Array.isArray(header)) return null;
  const match = /^Bearer ([A-Za-z0-9._~-]{32,512})$/u.exec(header);
  return match?.[1] ?? null;
}

function lastSequence(request: http.IncomingMessage): number | null {
  const raw = request.headers["last-event-id"];
  if (raw === undefined) return null;
  if (typeof raw !== "string" || !/^(?:0|[1-9][0-9]{0,15})$/u.test(raw)) throw new Error("GKOS_SERVICE_EVENT_SEQUENCE_INVALID");
  const sequence = Number(raw);
  if (!Number.isSafeInteger(sequence)) throw new Error("GKOS_SERVICE_EVENT_SEQUENCE_INVALID");
  return sequence;
}

async function readJson(request: http.IncomingMessage, timeoutMs: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; request.destroy(new Error("GKOS_SERVICE_REQUEST_TIMEOUT")); }, timeoutMs);
  try {
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.length;
      if (length > MCP_REQUEST_BYTES) throw new Error("GKOS_SERVICE_REQUEST_TOO_LARGE");
      chunks.push(bytes);
    }
  } finally {
    clearTimeout(timer);
  }
  if (timedOut) throw new Error("GKOS_SERVICE_REQUEST_TIMEOUT");
  if (length === 0) throw new Error("GKOS_SERVICE_BODY_REQUIRED");
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createLocalServiceRequestHandler(options: LocalServiceOptions):
  LocalServiceRequestHandler {
  if (typeof options.authorization !== "function") throw new TypeError("GKOS_SERVICE_AUTHORIZATION_REQUIRED");
  const events = options.eventRing ?? new ServiceTraversalEventRing();
  const mcp = new ServiceMcpRuntime(events);
  const rates = new Map<string, RateState>();
  const workRates = new Map<string, RateState>();
  const scheduler = new ServiceWorkScheduler(options.workQueueWaitMs);
  let ingressActive = 0;
  const origins = options.corsAllowlist ?? [];
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  const streams = new Map<http.ServerResponse, { credentialId: string; sessionId: string | null; close: () => void }>();
  const heartbeatMs = options.streamHeartbeatMs ?? 15000;
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs < 20 || heartbeatMs > 30000) throw new TypeError("GKOS_SERVICE_HEARTBEAT_INVALID");
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 10 || requestTimeoutMs > 30_000) throw new TypeError("GKOS_SERVICE_REQUEST_TIMEOUT_INVALID");

  const origin = (request: http.IncomingMessage): string | null => {
    const value = request.headers.origin;
    return typeof value === "string" && origins.includes(value) ? value : null;
  };
  const cors = (response: http.ServerResponse, value: string | null): void => {
    if (!value) return;
    response.setHeader("Access-Control-Allow-Origin", value);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Last-Event-ID, GKOS-Event-Session, MCP-Protocol-Version, Mcp-Session-Id");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    response.setHeader("Access-Control-Expose-Headers", "GKOS-Event-Session, Mcp-Session-Id, MCP-Protocol-Version, Retry-After");
  };
  const send = (response: http.ServerResponse, status: number, value: unknown, allowedOrigin: string | null, headers: Record<string, string> = {}): void => {
    let bytes = jsonBytes(value);
    if (status < 400 && bytes.length > REST_RESPONSE_BYTES) {
      status = 507;
      bytes = jsonBytes({ error: "response_too_large" });
    }
    cors(response, allowedOrigin);
    response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": String(bytes.length), ...headers });
    response.end(bytes);
  };
  const authorization = async (snapshot: ServiceCorpusSnapshot): Promise<ServiceAuthorizationConfiguration> => {
    return options.authorization(snapshot);
  };
  const view = async (identity: ServiceCredentialIdentity, operation: Parameters<typeof buildAuthorizedView>[0]["operation"], snapshot?: ServiceCorpusSnapshot): Promise<{ view: GkosAuthorizedView; snapshot: ServiceCorpusSnapshot; authorization: ServiceAuthorizationConfiguration }> => {
    const corpus = snapshot ?? await options.snapshot();
    const authority = await authorization(corpus);
    return {
      view: buildAuthorizedView({ identity, sensitivityCeiling: identity.sensitivityCeiling, corpus, authorization: authority, operation, evaluationTime: evaluationTime(corpus, authority), vaultName: options.vaultName }),
      snapshot: corpus,
      authorization: authority,
    };
  };
  const acquire = (identity: ServiceCredentialIdentity): { reason: "request_concurrency" | "request_rate"; retry: number } | null => {
    const now = Date.now();
    const limits = { concurrentRequests: 16, bucketCapacity: 80, refillMs: 100 };
    const state = rates.get(identity.credentialId) ?? { tokens: limits.bucketCapacity, lastRefill: now, active: 0 };
    const refill = Math.floor((now - state.lastRefill) / limits.refillMs);
    if (refill > 0) { state.tokens = Math.min(limits.bucketCapacity, state.tokens + refill); state.lastRefill += refill * limits.refillMs; }
    if ((state.active >= limits.concurrentRequests || ingressActive >= 32) || state.tokens < 1) {
      rates.set(identity.credentialId, state);
      return { reason: (state.active >= limits.concurrentRequests || ingressActive >= 32) ? "request_concurrency" : "request_rate", retry: (state.active >= limits.concurrentRequests || ingressActive >= 32) ? 1 : Math.max(1, Math.ceil((limits.refillMs - (now - state.lastRefill)) / 1000)) };
    }
    state.tokens -= 1; state.active += 1; ingressActive += 1; rates.set(identity.credentialId, state); return null;
  };
  const release = (identity: ServiceCredentialIdentity): void => {
    const state = rates.get(identity.credentialId);
    if (state) state.active = Math.max(0, state.active - 1);
    ingressActive = Math.max(0, ingressActive - 1);
  };
  const chargeWork = (identity: ServiceCredentialIdentity): number | null => {
    const now = Date.now(), limits = identity.limits ?? { bucketCapacity: 40, refillMs: 1000 };
    const state = workRates.get(identity.credentialId) ?? { tokens: limits.bucketCapacity, lastRefill: now, active: 0 };
    const refill = Math.floor((now - state.lastRefill) / limits.refillMs);
    if (refill > 0) { state.tokens = Math.min(limits.bucketCapacity, state.tokens + refill); state.lastRefill += refill * limits.refillMs; }
    workRates.set(identity.credentialId, state);
    if (state.tokens < 1) return Math.max(1, Math.ceil((limits.refillMs - (now - state.lastRefill)) / 1000));
    state.tokens--; return null;
  };
  const streamFull = (identity: ServiceCredentialIdentity): boolean => [...streams.values()].filter(stream => stream.credentialId === identity.credentialId).length >= 8 || streams.size >= 24;
  const registerStream = (response: http.ServerResponse, identity: ServiceCredentialIdentity, token: string, sessionId: string | null, onClose: () => void = () => undefined): (() => void) => {
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      streams.delete(response);
      onClose();
      if (!response.destroyed && !response.writableEnded) response.end();
    };
    const timer = setInterval(() => {
      const current = options.credentials.resolve(token);
      if (!current || current.revoked || current.credentialId !== identity.credentialId || current.agentId !== identity.agentId ||
          current.sensitivityCeiling !== identity.sensitivityCeiling || JSON.stringify(current.capabilities) !== JSON.stringify(identity.capabilities) ||
          (sessionId !== null && !mcp.has(sessionId, current))) { close(); return; }
      // Never queue heartbeats behind a slow client.
      if (response.destroyed || response.writableEnded || !response.write(": heartbeat\n\n")) close();
    }, heartbeatMs);
    timer.unref();
    streams.set(response, { credentialId: identity.credentialId, sessionId, close });
    response.once("close", close);
    return close;
  };
  const visibleEvent = async (identity: ServiceCredentialIdentity, event: ServiceTraversalEvent): Promise<ServiceTraversalEvent | null> => {
    const authorized = await view(identity, "events");
    const paths = event.paths.filter((path) => authorized.view.notes.some((note) => note.path === path));
    if (event.paths.length > 0 && paths.length === 0) return null;
    return { ...event, paths };
  };

  const handler = ((request: http.IncomingMessage, response: http.ServerResponse): boolean => {
    const requestOrigin = origin(request);
    let url: URL;
    try { url = new URL(request.url ?? "/", "http://127.0.0.1"); } catch { send(response, 400, { error: "bad_request" }, requestOrigin); return true; }
    const route = url.pathname.replace(/\/+$/u, "") || "/";
    if (options.reservedRoutes?.has(route)) return false;
    if (request.method === "OPTIONS") { cors(response, requestOrigin); response.writeHead(204); response.end(); return true; }
    const token = bearer(request);
    const identity = token ? options.credentials.resolve(token) : null;
    if (!identity || identity.revoked) { send(response, 401, GENERIC_DENIAL, requestOrigin); return true; }
    const limited = acquire(identity);
    if (limited) { send(response, 429, { error: "rate_limited", reason: limited.reason }, requestOrigin, { "Retry-After": String(limited.retry) }); return true; }
    void (async () => {
      let ingressHeld = true;
      let releaseWork: (() => void) | undefined;
      const relinquishIngress = (): void => { if (ingressHeld) { ingressHeld = false; release(identity); } };
      const disconnected = new AbortController();
      const onDisconnect = (): void => disconnected.abort();
      response.once("close", onDisconnect);
      try {
        if ([...url.searchParams.keys()].length > 0) { send(response, 400, { error: "bad_request" }, requestOrigin); return; }
        if (route === "/events") {
          if (request.method !== "GET") { send(response, 405, { error: "method_not_allowed" }, requestOrigin); return; }
          await view(identity, "events");
          const requestedSequence = lastSequence(request);
          const requestedSession = request.headers["gkos-event-session"];
          if (requestedSequence !== null && requestedSession === undefined) {
            send(response, 409, { error: "event_stream_reset_required", event_stream_session: events.sessionId }, requestOrigin);
            return;
          }
          if (requestedSession !== undefined && (typeof requestedSession !== "string" || requestedSession !== events.sessionId)) {
            send(response, 409, { error: "event_stream_reset_required", event_stream_session: events.sessionId }, requestOrigin);
            return;
          }
          const resumed = requestedSequence === null ? { events: [], gap: false } : events.resume(requestedSequence);
          if (resumed.gap) {
            send(response, 409, { error: "event_stream_reset_required", event_stream_session: events.sessionId }, requestOrigin);
            return;
          }
          const checked = token ? options.credentials.resolve(token) : null;
          if (!checked || checked.revoked || checked.credentialId !== identity.credentialId || checked.agentId !== identity.agentId || checked.sensitivityCeiling !== identity.sensitivityCeiling || JSON.stringify(checked.capabilities) !== JSON.stringify(identity.capabilities)) { send(response, 401, GENERIC_DENIAL, requestOrigin); return; }
          if (streamFull(identity)) { send(response, 429, { error: "rate_limited", reason: "stream_capacity" }, requestOrigin, { "Retry-After": "1" }); return; }
          cors(response, requestOrigin);
          response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "GKOS-Event-Session": events.sessionId });
          response.flushHeaders();
          let closed = false;
          let queuedItems = 0;
          let queuedBytes = 0;
          let delivery = Promise.resolve();
          let unsubscribe = (): void => undefined;
          const closeStream = registerStream(response, identity, token!, null, () => { closed = true; unsubscribe(); });
          const deliver = (event: ServiceTraversalEvent): void => {
            const estimatedBytes = jsonBytes(event).length;
            if (closed || ++queuedItems > CLIENT_EVENT_QUEUE_ITEMS || (queuedBytes += estimatedBytes) > CLIENT_EVENT_QUEUE_BYTES) {
              closeStream();
              if (!response.destroyed) response.end();
              return;
            }
            delivery = delivery.then(async () => {
            if (closed) return;
            const current = token ? options.credentials.resolve(token) : null;
            if (!current || current.revoked || current.credentialId !== identity.credentialId) {
              closeStream();
              if (!response.destroyed) response.end();
              return;
            }
            const filtered = await visibleEvent(current, event);
              const stillCurrent = token ? options.credentials.resolve(token) : null;
              if (!stillCurrent || stillCurrent.revoked || stillCurrent.credentialId !== identity.credentialId) {
                closeStream();
                if (!response.destroyed) response.end();
                return;
              }
              if (!closed && filtered && !response.destroyed && !response.write(serializeServiceEventSse(filtered))) await waitForDrain(response);
            }).catch(() => {
              closeStream();
              if (!response.destroyed) response.end();
            }).finally(() => { queuedItems = Math.max(0, queuedItems - 1); queuedBytes = Math.max(0, queuedBytes - estimatedBytes); });
          };
          unsubscribe = events.subscribe(deliver);
          for (const stored of resumed.events) deliver(stored);
          return;
        }
        if (route === "/mcp") {
          const sessionHeader = request.headers["mcp-session-id"];
          const sessionId = typeof sessionHeader === "string" ? sessionHeader : null;
          if (request.method === "GET") {
            if (!sessionId || !mcp.has(sessionId, identity)) { send(response, 404, GENERIC_FORBIDDEN, requestOrigin); return; }
            if (!identity.capabilities.includes("mcp.read")) { send(response, 403, GENERIC_FORBIDDEN, requestOrigin); return; }
            if (streamFull(identity)) { send(response, 429, { error: "rate_limited", reason: "stream_capacity" }, requestOrigin, { "Retry-After": "1" }); return; }
            cors(response, requestOrigin);
            response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" });
            const close = registerStream(response, identity, token!, sessionId);
            response.flushHeaders();
            if (!response.write(": connected\n\n")) close();
            return;
          }
          if (request.method === "DELETE") {
            if (!sessionId || !mcp.delete(sessionId, identity)) { send(response, 404, GENERIC_FORBIDDEN, requestOrigin); return; }
            scheduler.cancelSession(identity.credentialId, sessionId);
            for (const stream of [...streams.values()]) if (stream.credentialId === identity.credentialId && stream.sessionId === sessionId) stream.close();
            cors(response, requestOrigin); response.writeHead(204); response.end(); return;
          }
          if (request.method !== "POST") { send(response, 405, { error: "method_not_allowed" }, requestOrigin); return; }
          const contentType = request.headers["content-type"];
          if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/iu.test(contentType)) { send(response, 415, { error: "unsupported_media_type" }, requestOrigin); return; }
          if (sessionId && request.headers["mcp-protocol-version"] !== MCP_PROTOCOL_VERSION) { send(response, 400, { error: "protocol_version_invalid" }, requestOrigin); return; }
          const body = await readJson(request, requestTimeoutMs);
          // A slow upload must not retain the pre-upload credential or corpus.
          // Re-evaluate after receiving the bounded body, then check revocation
          // again after asynchronous snapshot/authorization work.
          const currentIdentity = token ? options.credentials.resolve(token) : null;
          if (!currentIdentity || currentIdentity.revoked || currentIdentity.credentialId !== identity.credentialId || currentIdentity.agentId !== identity.agentId) { send(response, 401, GENERIC_DENIAL, requestOrigin); return; }
          const message = body as Record<string, unknown>;
          const validWork = (): boolean => {
            const current = token ? options.credentials.resolve(token) : null;
            return !!current && !current.revoked && current.credentialId === currentIdentity.credentialId && current.agentId === currentIdentity.agentId && current.sensitivityCeiling === currentIdentity.sensitivityCeiling && JSON.stringify(current.capabilities) === JSON.stringify(currentIdentity.capabilities) && current.capabilities.includes("mcp.read") && !!sessionId && mcp.has(sessionId, current);
          };
          const isWork = message?.method === "tools/call";
          if (isWork) {
            if (!validWork()) { send(response, 403, GENERIC_FORBIDDEN, requestOrigin); return; }
            const retry = chargeWork(currentIdentity);
            if (retry !== null) { send(response, 429, { error: "rate_limited", reason: "work_rate" }, requestOrigin, { "Retry-After": String(retry) }); return; }
            relinquishIngress();
            releaseWork = await scheduler.acquire(identity.credentialId, sessionId!, validWork, disconnected.signal, Math.min(2, currentIdentity.limits?.concurrentRequests ?? 4));
            if (disconnected.signal.aborted || !validWork()) { if (!response.destroyed) send(response, 403, GENERIC_FORBIDDEN, requestOrigin); return; }
          }
          const snapshot = await options.snapshot();
          const authorized = await view(currentIdentity, "mcp", snapshot);
          if (isWork && !validWork()) { send(response, 403, GENERIC_FORBIDDEN, requestOrigin); return; }
          const checkedIdentity = token ? options.credentials.resolve(token) : null;
          if (!checkedIdentity || checkedIdentity.revoked || checkedIdentity.credentialId !== currentIdentity.credentialId || checkedIdentity.agentId !== currentIdentity.agentId || checkedIdentity.sensitivityCeiling !== currentIdentity.sensitivityCeiling || JSON.stringify(checkedIdentity.capabilities) !== JSON.stringify(currentIdentity.capabilities)) { send(response, 401, GENERIC_DENIAL, requestOrigin); return; }
          const reply = await mcp.handle(body, sessionId, {
            identity: checkedIdentity, view: authorized.view, generation: Math.max(1, Number(authorized.authorization.generation)),
            policyDecisionId: POLICY_DECISION_ID, policyDigest: authorized.authorization.policyDigest, sourceRecords: snapshot.sourceRecords,
            retrievalSearch: options.retrievalSearch ? async (request, guards) => {
              const before = await options.snapshot();
              if (before.generation !== snapshot.generation) throw new Error("GKOS_P6_CAPABILITY_UNAVAILABLE");
              const result = await options.retrievalSearch!(request, guards);
              const after = await options.snapshot();
              const currentAuthorization = await authorization(after);
              if (after.generation !== snapshot.generation || currentAuthorization.generation !== authorized.authorization.generation || currentAuthorization.policyDigest !== authorized.authorization.policyDigest || !currentAuthorization.configured) throw new Error("GKOS_P6_CAPABILITY_UNAVAILABLE");
              return result;
            } : undefined, navigationConfig: options.navigationConfig, vaultId: options.vaultId ?? "vault:local",
          });
          const finalIdentity = token ? options.credentials.resolve(token) : null;
          if (!finalIdentity || finalIdentity.revoked || finalIdentity.credentialId !== checkedIdentity.credentialId || finalIdentity.agentId !== checkedIdentity.agentId || finalIdentity.sensitivityCeiling !== checkedIdentity.sensitivityCeiling || JSON.stringify(finalIdentity.capabilities) !== JSON.stringify(checkedIdentity.capabilities)) { mcp.closeCredentialSessions(checkedIdentity.credentialId); send(response, 401, GENERIC_DENIAL, requestOrigin); return; }
          if (isWork && !validWork()) { if (!response.destroyed) send(response, 403, GENERIC_FORBIDDEN, requestOrigin); return; }
          if (response.destroyed) return;
          if (reply.body === null) { cors(response, requestOrigin); response.writeHead(reply.status ?? 202); response.end(); return; }
          const bytes = jsonBytes(reply.body);
          if (bytes.length > MCP_RESULT_BYTES) { send(response, 500, { error: "result_too_large" }, requestOrigin); return; }
          send(response, reply.status ?? 200, reply.body, requestOrigin, reply.sessionId ? { "Mcp-Session-Id": reply.sessionId, "MCP-Protocol-Version": MCP_PROTOCOL_VERSION } : {});
          return;
        }
        if (request.method !== "GET") { send(response, 405, { error: "method_not_allowed" }, requestOrigin); return; }
        if (route === "/capabilities") {
          const snapshot = await options.snapshot();
          await view(identity, "capabilities", snapshot);
          const ready = !!snapshot.graph;
          const has = (capability: ServiceCredentialIdentity["capabilities"][number]): boolean => identity.capabilities.includes(capability);
          send(response, 200, buildServiceCapabilities({
            graphConfigured: ready,
            identityRuntimeConfigured: true,
            mcpConfigured: true,
            eventStreamConfigured: true,
            navigationAvailable: !!options.navigationConfig && !!snapshot.sourceRecords,
            ...options.capabilities,
            graphAuthorized: has("graph.read"),
            notesAuthorized: has("notes.read"),
            graphitiAuthorized: has("graphiti.read"),
            mcpAuthorized: has("mcp.read"),
            eventsAuthorized: has("events.read"),
            navigationAuthorized: has("mcp.read"),
          }), requestOrigin);
          return;
        }
        if (route === "/" || route === "/health") {
          const authorized = await view(identity, "health");
          send(response, 200, { schema_version: 1, state: options.status().state, visible_counts: authorized.view.visible_counts }, requestOrigin);
          return;
        }
        if (route === "/notes") {
          const authorized = await view(identity, "notes");
          send(response, 200, { notes: authorized.view.notes, count: authorized.view.notes.length }, requestOrigin);
          return;
        }
        if (route === "/graph") { const authorized = await view(identity, "graph"); send(response, 200, authorized.view.graph, requestOrigin); return; }
        if (route === "/graphiti/episodes") { const authorized = await view(identity, "graphiti_episodes"); send(response, 200, { episodes: authorized.view.graphiti_episodes, count: authorized.view.graphiti_episodes.length }, requestOrigin); return; }
        send(response, 404, { error: "not_found" }, requestOrigin);
      } catch (error) {
        if (error instanceof WorkScheduleError && !response.headersSent && !response.destroyed) { send(response, 429, { error: "rate_limited", reason: error.reason }, requestOrigin, { "Retry-After": "1" }); return; }
        if (!response.headersSent && !response.destroyed) send(response, error instanceof GkosServiceDeniedError ? 403 : 400, error instanceof GkosServiceDeniedError ? GENERIC_FORBIDDEN : { error: "bad_request" }, requestOrigin);
        else if (!response.destroyed) response.end();
      } finally { response.off("close", onDisconnect); relinquishIngress(); releaseWork?.(); }
    })();
    return true;
  }) as LocalServiceRequestHandler;
  handler.closeStreams = (): void => {
    scheduler.close();
    for (const stream of [...streams.values()]) stream.close();
  };
  return handler;
}

export function createLocalServiceServer(options: LocalServiceOptions): http.Server {
  const handler = createLocalServiceRequestHandler(options);
  const server = http.createServer((request, response) => { handler(request, response); });
  const close = server.close.bind(server);
  server.close = ((callback?: (error?: Error) => void) => {
    handler.closeStreams();
    return close(callback);
  }) as typeof server.close;
  return server;
}
