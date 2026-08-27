import { createHash, createHmac, randomBytes } from "node:crypto";
import { canonicalJson } from "../canonical";
import { auditNavigation, discoverNavigation, navigationSnapshotDigest } from "../navigation";
import { projectAtTime } from "../temporal";
import type { GkxNode, SourceFile } from "../types";
import type { VaultNavigationConfig, NavigationSnapshot } from "../navigation";
import type { GkosAuthorizedView } from "./authorized-view";
import type { ServiceCredentialIdentity, ServiceTraversalEvent } from "./types";
import { ServiceTraversalEventRing } from "./events";

export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const MCP_REQUEST_BYTES = 393_216;
export const MCP_RESULT_BYTES = 1_048_576;

const CONTRACT_VERSION = "1.0.0-draft.2";
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^(?:gkrec1|gkscp1)_[A-Za-z0-9_-]{21}[AQgw]$/u;
const CAPABILITY_NAMES = [
  "capability.read.self", "graph.temporal.read", "navigation.audit", "navigation.discover",
  "record.assess", "record.lineage.read", "record.validate",
] as const;

export interface ServiceMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: true; destructiveHint: false; idempotentHint: true; openWorldHint: false };
}

const annotations = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const);
const recordRefSchema = { type: "string", minLength: 29, maxLength: 29, pattern: "^gkrec1_[A-Za-z0-9_-]{21}[AQgw]$" };
const scopeRefSchema = { type: "string", minLength: 29, maxLength: 29, pattern: "^gkscp1_[A-Za-z0-9_-]{21}[AQgw]$" };

export const SERVICE_MCP_TOOLS: readonly ServiceMcpTool[] = Object.freeze([
  { name: "gkos_capabilities", title: "List effective GKOS capabilities", description: "Lists only effective capabilities for this authenticated identity.", inputSchema: { type: "object", additionalProperties: false, properties: {} }, annotations },
  { name: "gkos_record_validate", title: "Validate one discovered GKX record", description: "Returns bounded validation codes for an authority-issued record reference.", inputSchema: { type: "object", additionalProperties: false, properties: { record_ref: recordRefSchema }, required: ["record_ref"] }, annotations },
  { name: "gkos_record_assess", title: "Assess one discovered GKX record", description: "Returns deterministic documentation-quality assessment evidence; never truth authority.", inputSchema: { type: "object", additionalProperties: false, properties: { record_ref: recordRefSchema }, required: ["record_ref"] }, annotations },
  { name: "gkos_lineage_get", title: "Read discovered record lineage", description: "Returns policy-filtered lineage summaries for an issued record reference.", inputSchema: { type: "object", additionalProperties: false, properties: { record_ref: recordRefSchema, cursor: { type: ["string", "null"] }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["record_ref", "cursor", "limit"] }, annotations },
  { name: "gkos_graph_at_time", title: "Project the discovered graph at a time", description: "Applies the Engine temporal projector inside a previously issued scope.", inputSchema: { type: "object", additionalProperties: false, properties: { scope_ref: scopeRefSchema, at: { type: "string" }, state: { enum: ["valid", "superseded", "not_yet_created", "all"] }, cursor: { type: ["string", "null"] }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["scope_ref", "at", "state", "cursor", "limit"] }, annotations },
  { name: "gkos_navigation_discover", title: "Discover qualified Navigation entries", description: "Uses Navigation 1.0 over the authorized source snapshot and issues opaque references.", inputSchema: { type: "object", additionalProperties: false, properties: { scope_ref: { anyOf: [scopeRefSchema, { type: "null" }] }, cursor: { type: ["string", "null"] }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["scope_ref", "cursor", "limit"] }, annotations },
  { name: "gkos_navigation_audit", title: "Audit a qualified Navigation scope", description: "Runs Navigation 1.0 audit over an issued authorized scope without filesystem effects.", inputSchema: { type: "object", additionalProperties: false, properties: { scope_ref: scopeRefSchema, severity_at_least: { enum: ["info", "warning", "error"] }, cursor: { type: ["string", "null"] }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["scope_ref", "severity_at_least", "cursor", "limit"] }, annotations },
]);

interface McpSession {
  id: string;
  credentialId: string;
  agentId: string;
  initialized: boolean;
  lastUsedAt: number;
  secret: Buffer;
  records: Map<string, string>;
  scopes: Map<string, string>;
  cursors: Map<string, { kind: string; scopeRef: string; offset: number; generation: number; snapshotId: string }>;
}

export interface ServiceMcpExecutionContext {
  identity: ServiceCredentialIdentity;
  view: GkosAuthorizedView;
  generation: number;
  policyDecisionId: string;
  sourceRecords?: readonly SourceFile[];
  navigationConfig?: VaultNavigationConfig;
  vaultId: string;
}

export interface ServiceMcpReply {
  body: Record<string, unknown> | null;
  sessionId?: string;
  status?: number;
  event?: ServiceTraversalEvent;
}

function uuidV7(now = Date.now()): string {
  const bytes = randomBytes(16);
  let value = BigInt(now);
  for (let index = 5; index >= 0; index--) { bytes[index] = Number(value & 0xffn); value >>= 8n; }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function digest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

function seal<T extends Record<string, unknown>>(value: T): T & { result_digest: `sha256:${string}` } {
  return { ...value, result_digest: digest(value) };
}

function issuedRef(session: McpSession, prefix: "gkrec1" | "gkscp1", coordinate: string): string {
  const payload = createHmac("sha256", session.secret).update(`${prefix}\0${coordinate}`, "utf8").digest().subarray(0, 16).toString("base64url");
  return `${prefix}_${payload}`;
}

function exactObject(value: unknown, required: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value as object).sort();
  return keys.length === required.length && keys.every((key, index) => key === [...required].sort()[index]);
}

function issuedCursor(session: McpSession, kind: string, scopeRef: string, offset: number, generation: number, snapshotId: string): string {
  const payload = createHmac("sha256", session.secret).update(`cursor\0${kind}\0${scopeRef}\0${offset}\0${generation}\0${snapshotId}`, "utf8").digest().toString("base64url");
  const cursor = `gkcur1_${payload}`;
  session.cursors.set(cursor, { kind, scopeRef, offset, generation, snapshotId });
  return cursor;
}

function page(limit: number, generation: number, snapshotId: string, session?: McpSession, kind?: string, scopeRef?: string, nextOffset?: number): Record<string, unknown> {
  const hasMore = session !== undefined && kind !== undefined && scopeRef !== undefined && nextOffset !== undefined;
  return { limit, has_more: hasMore, next_cursor: hasMore ? issuedCursor(session, kind, scopeRef, nextOffset, generation, snapshotId) : null, snapshot_id: snapshotId };
}

function paginationStart(session: McpSession, cursorValue: unknown, kind: string, scopeRef: string, generation: number): { offset: number; snapshotId: string } | null {
  if (cursorValue === null) return { offset: 0, snapshotId: uuidV7() };
  if (typeof cursorValue !== "string") return null;
  const cursor = session.cursors.get(cursorValue);
  if (!cursor || cursor.kind !== kind || cursor.scopeRef !== scopeRef || cursor.generation !== generation) return null;
  return { offset: cursor.offset, snapshotId: cursor.snapshotId };
}

function recordSummary(session: McpSession, node: GkxNode): Record<string, unknown> {
  let recordRef = [...session.records.entries()].find(([, nodeId]) => nodeId === node.id)?.[0];
  if (!recordRef) {
    recordRef = issuedRef(session, "gkrec1", node.id);
    session.records.set(recordRef, node.id);
  }
  return {
    record_ref: recordRef,
    uid: typeof node.gkx?.uid === "string" ? node.gkx.uid : null,
    canonical_path: node.path,
    valid_at: typeof node.validAt === "string" ? node.validAt : null,
    head: node.gkx?.head === true,
    superseded: typeof node.gkx?.invalidAt === "string",
  };
}

function common(context: ServiceMcpExecutionContext, requestId: string): Record<string, unknown> {
  return {
    contract_version: CONTRACT_VERSION,
    request_id: requestId,
    agent_id: context.identity.agentId,
    auth_epoch: 1,
    authority_generation: Math.max(1, context.generation),
    policy_decision_id: context.policyDecisionId,
  };
}

function toolError(requestId: string, code: string): Record<string, unknown> {
  const error = {
    contract_version: CONTRACT_VERSION,
    error_code: code,
    request_id: UUID_V7.test(requestId) ? requestId : null,
    retryable: false,
    retry_after_ms: null,
  };
  return { ...error, error_digest: digest(error) };
}

function toolResult(structuredContent: Record<string, unknown>, isError = false): Record<string, unknown> {
  return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent, isError };
}

export class ServiceMcpRuntime {
  readonly #events: ServiceTraversalEventRing;
  readonly #sessions = new Map<string, McpSession>();
  readonly #maximumSessionsPerAgent: number;
  readonly #sessionTtlMs: number;
  readonly #clock: () => number;

  constructor(events: ServiceTraversalEventRing, maximumSessionsPerAgent = 8, sessionTtlMs = 30 * 60_000, clock: () => number = () => Date.now()) {
    if (!Number.isSafeInteger(maximumSessionsPerAgent) || maximumSessionsPerAgent < 1 || maximumSessionsPerAgent > 32) throw new TypeError("GKOS_SERVICE_MCP_SESSION_CAP_INVALID");
    if (!Number.isSafeInteger(sessionTtlMs) || sessionTtlMs < 1_000 || sessionTtlMs > 24 * 60 * 60_000) throw new TypeError("GKOS_SERVICE_MCP_SESSION_TTL_INVALID");
    this.#events = events;
    this.#maximumSessionsPerAgent = maximumSessionsPerAgent;
    this.#sessionTtlMs = sessionTtlMs;
    this.#clock = clock;
  }

  closeCredentialSessions(credentialId: string): void {
    for (const [id, session] of this.#sessions) if (session.credentialId === credentialId) this.#sessions.delete(id);
  }

  async handle(message: unknown, sessionId: string | null, context: ServiceMcpExecutionContext): Promise<ServiceMcpReply> {
    const now = this.#clock();
    if (!Number.isSafeInteger(now) || now < 0) return this.protocolError(null, -32000, "Request refused");
    for (const [key, held] of this.#sessions) if (now - held.lastUsedAt > this.#sessionTtlMs) this.#sessions.delete(key);
    if (!message || typeof message !== "object" || Array.isArray(message)) return this.protocolError(null, -32600, "Invalid Request");
    const request = message as Record<string, unknown>;
    const id = typeof request.id === "string" || typeof request.id === "number" ? request.id : null;
    if (request.jsonrpc !== "2.0" || typeof request.method !== "string") return this.protocolError(id, -32600, "Invalid Request");
    if (!sessionId) {
      if (request.method !== "initialize") return this.protocolError(id, -32600, "Invalid Request");
      const params = request.params;
      if (!params || typeof params !== "object" || Array.isArray(params)) return this.protocolError(id, -32602, "Invalid params");
      const initialize = params as Record<string, unknown>;
      const clientInfo = initialize.clientInfo;
      if (initialize.protocolVersion !== MCP_PROTOCOL_VERSION ||
        !initialize.capabilities || typeof initialize.capabilities !== "object" || Array.isArray(initialize.capabilities) ||
        !clientInfo || typeof clientInfo !== "object" || Array.isArray(clientInfo) ||
        typeof (clientInfo as Record<string, unknown>).name !== "string" || !(clientInfo as Record<string, unknown>).name ||
        typeof (clientInfo as Record<string, unknown>).version !== "string" || !(clientInfo as Record<string, unknown>).version) {
        return this.protocolError(id, -32602, "Invalid params");
      }
      if ([...this.#sessions.values()].filter((item) => item.agentId === context.identity.agentId).length >= this.#maximumSessionsPerAgent) {
        return this.protocolError(id, -32000, "Request refused");
      }
      const nextId = uuidV7();
      this.#sessions.set(nextId, { id: nextId, credentialId: context.identity.credentialId, agentId: context.identity.agentId, initialized: false, lastUsedAt: now, secret: randomBytes(32), records: new Map(), scopes: new Map(), cursors: new Map() });
      return { sessionId: nextId, body: { jsonrpc: "2.0", id, result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "gkos-engine", version: "2.1.2" } } } };
    }
    const session = this.#sessions.get(sessionId);
    if (!session || session.credentialId !== context.identity.credentialId || session.agentId !== context.identity.agentId) return this.protocolError(id, -32000, "Request refused");
    session.lastUsedAt = now;
    if (request.method === "notifications/initialized") {
      if (Object.keys(request).sort().join(",") !== "jsonrpc,method") return this.protocolError(id, -32602, "Invalid params");
      session.initialized = true;
      return { status: 202, body: null };
    }
    if (request.method === "ping") return { body: { jsonrpc: "2.0", id, result: {} } };
    if (!session.initialized) return this.protocolError(id, -32600, "Invalid Request");
    if (request.method === "tools/list") return { body: { jsonrpc: "2.0", id, result: { tools: SERVICE_MCP_TOOLS } } };
    if (request.method !== "tools/call") return this.protocolError(id, -32601, "Method not found");
    const params = request.params;
    if (!params || typeof params !== "object" || Array.isArray(params) || typeof (params as Record<string, unknown>).name !== "string") return this.protocolError(id, -32602, "Invalid params");
    const tool = String((params as Record<string, unknown>).name);
    if (!SERVICE_MCP_TOOLS.some((item) => item.name === tool)) return this.protocolError(id, -32602, "Invalid params");
    const args = (params as Record<string, unknown>).arguments ?? {};
    const operationId = uuidV7();
    let executed: { result: Record<string, unknown>; paths: string[]; isError: boolean; eventStatus?: ServiceTraversalEvent["status"] };
    try {
      executed = await this.executeTool(session, tool, args, context, operationId);
    } catch {
      executed = { result: toolError(operationId, "GKOS_P6_OPERATION_FAILED"), paths: [], isError: true, eventStatus: "failed" };
    }
    let result = toolResult(executed.result, executed.isError);
    if (Buffer.byteLength(JSON.stringify({ jsonrpc: "2.0", id, result }), "utf8") > MCP_RESULT_BYTES) {
      executed = { result: toolError(operationId, "GKOS_P6_RESULT_TOO_LARGE"), paths: [], isError: true, eventStatus: "failed" };
      result = toolResult(executed.result, true);
    }
    const event = this.#events.append({
      session_id: session.id, operation_id: operationId, agent_id: context.identity.agentId,
      agent_label: context.identity.agentLabel, tool, paths: executed.paths,
      status: executed.eventStatus ?? (executed.isError ? "denied" : "completed"), cost_units: null,
    });
    return { body: { jsonrpc: "2.0", id, result }, event };
  }

  delete(sessionId: string, identity: ServiceCredentialIdentity): boolean {
    const session = this.#sessions.get(sessionId);
    if (!session || session.credentialId !== identity.credentialId || session.agentId !== identity.agentId) return false;
    return this.#sessions.delete(sessionId);
  }

  has(sessionId: string, identity: ServiceCredentialIdentity): boolean {
    const session = this.#sessions.get(sessionId);
    return !!session && session.credentialId === identity.credentialId && session.agentId === identity.agentId;
  }

  private protocolError(id: unknown, code: number, message: string): ServiceMcpReply {
    return { body: { jsonrpc: "2.0", id, error: { code, message } } };
  }

  private async executeTool(session: McpSession, tool: string, args: unknown, context: ServiceMcpExecutionContext, requestId: string): Promise<{ result: Record<string, unknown>; paths: string[]; isError: boolean }> {
    const fail = (code: string) => ({ result: toolError(requestId, code), paths: [] as string[], isError: true });
    if (!UUID_V7.test(context.identity.agentId) || !UUID_V7.test(context.policyDecisionId)) return fail("GKOS_P6_AUTH_FAILED");
    if (tool === "gkos_capabilities") {
      if (!exactObject(args, [])) return fail("GKOS_P6_INVALID_PARAMS");
      const navigationReady = !!context.navigationConfig && !!context.sourceRecords;
      const names = navigationReady ? CAPABILITY_NAMES : ["capability.read.self"];
      return { result: seal({ ...common(context, requestId), capabilities: names.map((capability_name) => ({ capability_name, available: true, reason_code: null })) }), paths: [], isError: false };
    }
    if (tool === "gkos_navigation_discover") {
      if (!exactObject(args, ["cursor", "limit", "scope_ref"])) return fail("GKOS_P6_INVALID_PARAMS");
      const input = args as Record<string, unknown>;
      if (!(input.cursor === null || typeof input.cursor === "string") || !Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 100) return fail("GKOS_P6_INVALID_PARAMS");
      if (!context.navigationConfig || !context.sourceRecords) return fail("GKOS_P6_CAPABILITY_UNAVAILABLE");
      let scopeRef: string;
      let offset = 0;
      let snapshotId = uuidV7();
      if (input.scope_ref === null && input.cursor === null) {
        scopeRef = issuedRef(session, "gkscp1", "root");
        session.scopes.set(scopeRef, "");
      } else if (typeof input.scope_ref === "string" && REF.test(input.scope_ref) && session.scopes.has(input.scope_ref)) scopeRef = input.scope_ref;
      else return fail("GKOS_P6_REFERENCE_UNKNOWN");
      if (typeof input.cursor === "string") {
        const cursor = session.cursors.get(input.cursor);
        if (!cursor || cursor.kind !== "navigation_discover" || cursor.scopeRef !== scopeRef || cursor.generation !== context.generation) return fail("GKOS_P6_REFERENCE_UNKNOWN");
        offset = cursor.offset;
        snapshotId = cursor.snapshotId;
      }
      const visiblePaths = new Set(context.view.notes.map((note) => note.path));
      const snapshot: NavigationSnapshot = {
        vaultId: context.vaultId,
        sources: context.sourceRecords.filter((source) => visiblePaths.has(source.relativePath) && typeof source.content === "string").map((source) => ({ relativePath: source.relativePath, content: source.content!, stableId: context.view.notes.find((note) => note.path === source.relativePath)?.uid ?? undefined })),
        directories: context.view.graph.nodes.filter((node) => node.kind === "folder").map((node) => node.path),
      };
      const discovery = discoverNavigation(snapshot, context.navigationConfig);
      const limit = Number(input.limit);
      const items = discovery.entries.slice(offset, offset + limit).map((entry) => {
        const node = context.view.graph.nodes.find((candidate) => candidate.kind === "file" && candidate.path === entry.path);
        if (!node) throw new Error("GKOS_SERVICE_NAVIGATION_VIEW_MISMATCH");
        const recordRef = issuedRef(session, "gkrec1", node.id);
        session.records.set(recordRef, node.id);
        return { record_ref: recordRef, child_scope_ref: null, canonical_path: entry.path, classification: entry.classification, management: entry.management, name_standing: entry.nameStanding, recognized_moc_name: entry.recognizedMocName, evidence_codes: entry.evidence.map((item) => item.code).sort() };
      });
      const nextOffset = offset + items.length < discovery.entries.length ? offset + items.length : undefined;
      return { result: seal({ ...common(context, requestId), scope_ref: scopeRef, artifact_digest: await navigationSnapshotDigest(snapshot), items, page: page(limit, context.generation, snapshotId, session, "navigation_discover", scopeRef, nextOffset) }), paths: items.map((item) => item.canonical_path), isError: false };
    }
    const input = args as Record<string, unknown>;
    const recordNode = (value: unknown): GkxNode | null => {
      if (typeof value !== "string" || !REF.test(value)) return null;
      const nodeId = session.records.get(value);
      return nodeId ? context.view.graph.nodes.find((node) => node.id === nodeId && node.kind === "file") ?? null : null;
    };
    if (tool === "gkos_record_validate" || tool === "gkos_record_assess") {
      if (!exactObject(args, ["record_ref"])) return fail("GKOS_P6_INVALID_PARAMS");
      const node = recordNode(input.record_ref);
      if (!node) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      const evidence = context.view.record_evidence.find((item) => item.node_id === node.id);
      const recordDigest = digest(node);
      if (tool === "gkos_record_validate") {
        const diagnostics = (evidence?.diagnostic_codes ?? []).map((item) => ({ ...item, record_ref: input.record_ref }));
        return { result: seal({ ...common(context, requestId), record_ref: input.record_ref, record_digest: recordDigest, valid: !diagnostics.some((item) => item.severity === "error" || item.severity === "critical"), diagnostics }), paths: [node.path], isError: false };
      }
      const assessment = evidence?.assessment;
      if (!assessment) return fail("GKOS_P6_CAPABILITY_UNAVAILABLE");
      const scores = Object.fromEntries(Object.entries(assessment.scores).map(([key, value]) => [key, value === null ? null : Math.round(value * 10_000)]));
      return { result: seal({ ...common(context, requestId), record_ref: input.record_ref, record_digest: recordDigest, profile: "gkx-2.3-validating-projection", scores_basis_points: scores, exclusions: assessment.exclusions, diagnostic_codes: assessment.diagnostic_codes, interpretation: "documentation-and-support-quality-not-truth", truth_authority: false }), paths: [node.path], isError: false };
    }
    if (tool === "gkos_lineage_get") {
      if (!exactObject(args, ["cursor", "limit", "record_ref"]) || !(input.cursor === null || typeof input.cursor === "string") || !Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 100) return fail("GKOS_P6_INVALID_PARAMS");
      const root = recordNode(input.record_ref);
      if (!root) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      const pagination = paginationStart(session, input.cursor, "lineage", String(input.record_ref), context.generation);
      if (!pagination) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      const ids = new Set([root.id]);
      for (const link of context.view.graph.links) if (link.kind === "lineage" && (link.source === root.id || link.target === root.id)) { ids.add(link.source); ids.add(link.target); }
      const candidates = context.view.graph.nodes.filter((node) => ids.has(node.id) && node.kind === "file");
      const items = candidates.slice(pagination.offset, pagination.offset + Number(input.limit)).map((node) => recordSummary(session, node));
      const nextOffset = pagination.offset + items.length < candidates.length ? pagination.offset + items.length : undefined;
      return { result: seal({ ...common(context, requestId), root_record_ref: input.record_ref, items, page: page(Number(input.limit), context.generation, pagination.snapshotId, session, "lineage", String(input.record_ref), nextOffset) }), paths: items.map((item) => String(item.canonical_path)), isError: false };
    }
    if (tool === "gkos_graph_at_time") {
      if (!exactObject(args, ["at", "cursor", "limit", "scope_ref", "state"]) || !(input.cursor === null || typeof input.cursor === "string") || typeof input.scope_ref !== "string" || !session.scopes.has(input.scope_ref) || typeof input.at !== "string" || !Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 100 || !["valid", "superseded", "not_yet_created", "all"].includes(String(input.state))) return fail("GKOS_P6_INVALID_PARAMS");
      const at = new Date(input.at);
      if (!Number.isFinite(at.getTime()) || at.toISOString() !== input.at) return fail("GKOS_P6_INVALID_PARAMS");
      const paginationScope = `${input.scope_ref}\0${input.at}\0${input.state}`;
      const pagination = paginationStart(session, input.cursor, "graph_at_time", paginationScope, context.generation);
      if (!pagination) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      const temporalInputs = context.view.graph.nodes.filter((node) => node.kind === "file" && typeof node.validAt === "string").map((node) => {
        const validAt = new Date(node.validAt!);
        const invalidAt = typeof node.gkx?.invalidAt === "string" ? new Date(node.gkx.invalidAt) : null;
        if (!Number.isFinite(validAt.getTime()) || validAt.toISOString() !== node.validAt || invalidAt && (!Number.isFinite(invalidAt.getTime()) || invalidAt.toISOString() !== node.gkx?.invalidAt)) {
          throw new Error("GKOS_P6_TEMPORAL_INPUT_INVALID");
        }
        return { id: node.id, validAtMs: validAt.getTime(), invalidAtMs: invalidAt?.getTime() ?? null };
      });
      const projection = projectAtTime(temporalInputs, at.getTime());
      const selected = input.state === "all" ? [...projection.notYetCreated, ...projection.valid, ...projection.superseded] : input.state === "not_yet_created" ? projection.notYetCreated : input.state === "valid" ? projection.valid : projection.superseded;
      const candidates = context.view.graph.nodes.filter((node) => selected.includes(node.id));
      const items = candidates.slice(pagination.offset, pagination.offset + Number(input.limit)).map((node) => recordSummary(session, node));
      const nextOffset = pagination.offset + items.length < candidates.length ? pagination.offset + items.length : undefined;
      return { result: seal({ ...common(context, requestId), scope_ref: input.scope_ref, at: input.at, state: input.state, items, page: page(Number(input.limit), context.generation, pagination.snapshotId, session, "graph_at_time", paginationScope, nextOffset) }), paths: items.map((item) => String(item.canonical_path)), isError: false };
    }
    if (tool === "gkos_navigation_audit") {
      if (!exactObject(args, ["cursor", "limit", "scope_ref", "severity_at_least"]) || !(input.cursor === null || typeof input.cursor === "string") || typeof input.scope_ref !== "string" || !session.scopes.has(input.scope_ref) || !Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 100 || !["info", "warning", "error"].includes(String(input.severity_at_least))) return fail("GKOS_P6_INVALID_PARAMS");
      if (!context.navigationConfig || !context.sourceRecords) return fail("GKOS_P6_CAPABILITY_UNAVAILABLE");
      const paginationScope = `${input.scope_ref}\0${input.severity_at_least}`;
      const pagination = paginationStart(session, input.cursor, "navigation_audit", paginationScope, context.generation);
      if (!pagination) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      const visiblePaths = new Set(context.view.notes.map((note) => note.path));
      const snapshot: NavigationSnapshot = { vaultId: context.vaultId, sources: context.sourceRecords.filter((source) => visiblePaths.has(source.relativePath) && typeof source.content === "string").map((source) => ({ relativePath: source.relativePath, content: source.content! })), directories: context.view.graph.nodes.filter((node) => node.kind === "folder").map((node) => node.path) };
      const ranks = { info: 0, warning: 1, error: 2 } as const;
      const candidates = (await auditNavigation(snapshot, context.navigationConfig)).filter((finding) => ranks[finding.severity] >= ranks[input.severity_at_least as keyof typeof ranks]);
      const findings = candidates.slice(pagination.offset, pagination.offset + Number(input.limit));
      const items = findings.map((finding) => ({ code: finding.code.replace(/-/gu, "_"), severity: finding.severity, record_ref: [...session.records.entries()].find(([, nodeId]) => context.view.graph.nodes.find((node) => node.id === nodeId)?.path === finding.path)?.[0] ?? null }));
      const nextOffset = pagination.offset + items.length < candidates.length ? pagination.offset + items.length : undefined;
      return { result: seal({ ...common(context, requestId), scope_ref: input.scope_ref, artifact_digest: await navigationSnapshotDigest(snapshot), items, page: page(Number(input.limit), context.generation, pagination.snapshotId, session, "navigation_audit", paginationScope, nextOffset) }), paths: findings.map((finding) => finding.path).filter(Boolean), isError: false };
    }
    return fail("GKOS_P6_CAPABILITY_UNAVAILABLE");
  }
}
