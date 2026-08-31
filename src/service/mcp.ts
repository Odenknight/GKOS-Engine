import { validateRetrievalFilters } from "../retrieval/filters";
import { lexicalQueryClauses } from "../retrieval/lexical";
import type { ServiceRetrievalSearch } from "./retrieval";
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
export const CONTENT_EXTENSION_VERSION = "observatory.mcp-content.v0";
export function contentLimits(raw = process.env.GKOS_MCP_CONTENT_LIMITS): { files: number; per_file_bytes: number; total_bytes: number } {
  const defaults = { files: 2000, per_file_bytes: 1048576, total_bytes: 8388608 };
  if (!raw) return defaults;
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("GKOS_MCP_CONTENT_LIMITS_INVALID"); }
  if (!value || Array.isArray(value) || Object.keys(value).sort().join() !== Object.keys(defaults).sort().join()) throw new Error("GKOS_MCP_CONTENT_LIMITS_INVALID");
  for (const [key, maximum] of Object.entries({ files: 20000, per_file_bytes: 67108864, total_bytes: 268435456 })) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 1 || value[key] > maximum) throw new Error("GKOS_MCP_CONTENT_LIMITS_INVALID");
  }
  return value;
}
const CONTENT_LIMITS = contentLimits();
const CONTENT_MAX_FILES = CONTENT_LIMITS.files;
const CONTENT_MAX_FILE_BYTES = CONTENT_LIMITS.per_file_bytes;
const CONTENT_MAX_READ_BYTES = 67_108_864;
const CONTENT_MAX_TOTAL_BYTES = CONTENT_LIMITS.total_bytes;
const SESSION_REFERENCE_LIMIT = 8_192;

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
  { name: "gkos_lineage_get", title: "Read discovered record lineage", description: "Returns the authorized root and its direct lineage neighbors, not transitive history. head means a terminal lineage participant; a standalone record can have head false.", inputSchema: { type: "object", additionalProperties: false, properties: { record_ref: recordRefSchema, cursor: { type: ["string", "null"] }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["record_ref", "cursor", "limit"] }, annotations },
  { name: "gkos_graph_at_time", title: "Project the discovered graph at a time", description: "Applies recorded validity time, not file modification time, inside an issued scope. Query at accepts explicit UTC/offset timestamps with optional fractional seconds up to milliseconds.", inputSchema: { type: "object", additionalProperties: false, properties: { scope_ref: scopeRefSchema, at: { type: "string" }, state: { enum: ["valid", "superseded", "not_yet_created", "all"] }, cursor: { type: ["string", "null"] }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["scope_ref", "at", "state", "cursor", "limit"] }, annotations },
  { name: "gkos_navigation_discover", title: "Discover qualified Navigation entries", description: "Navigation 1.0 over the admitted authorized snapshot; not the whole vault. Required cursor: null for first page, page.next_cursor thereafter in the same MCP session; scope_ref may be returned scope, null, or omitted. Reconnect is not a new MCP session. Optional path_prefix matches an exact canonical path or directory boundary; name_query matches every whitespace-separated term case-insensitively in admitted paths/titles, not note bodies. detail compact returns only path and read reference; default full preserves diagnostic rows. Repeat filters/detail on every page. Changed source/config/query or generation requires cursor null. artifact_digest covers the authorized source snapshot, not row serialization or request envelope.", inputSchema: { type: "object", additionalProperties: false, properties: { detail: { enum: ["full", "compact"] }, path_prefix: { type: "string", maxLength: 4096 }, name_query: { type: "string", minLength: 1, maxLength: 128 }, scope_ref: { anyOf: [scopeRefSchema, { type: "null" }] }, cursor: { type: ["string", "null"] }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["cursor", "limit"] }, annotations },
  { name: "gkos_navigation_audit", title: "Audit a qualified Navigation scope", description: "Runs Navigation 1.0 audit over an issued authorized scope without filesystem effects.", inputSchema: { type: "object", additionalProperties: false, properties: { scope_ref: scopeRefSchema, severity_at_least: { enum: ["info", "warning", "error"] }, cursor: { type: ["string", "null"] }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["scope_ref", "severity_at_least", "cursor", "limit"] }, annotations },
  { name: "gkos_note_read", title: "Read an authorized note body", description: "Observatory extension: paginated raw Markdown from a current authorized source snapshot, using a session-issued record reference. cursor is required and nullable. References bind the MCP session, generation and source bytes; recover a known canonical path with gkos_record_resolve. Includes frontmatter; record-level authorization, no per-span redaction.", inputSchema: { type: "object", additionalProperties: false, properties: { record_ref: recordRefSchema, cursor: { type: ["string", "null"] }, limit_bytes: { type: "integer", minimum: 4, maximum: 16384 } }, required: ["record_ref", "cursor", "limit_bytes"] }, annotations },
  { name: "gkos_record_resolve", title: "Resolve an admitted canonical path", description: "Observatory extension: resolve an exact known canonical vault-relative path to a current session-issued read reference, without enumeration. A path is a locator, not identity: renames/path reuse can change its meaning. Optional expected_uid guards a previously known UID; UIDs are not proof of uniqueness or authorship. Missing, restricted, moved and UID-mismatched targets share one non-disclosing refusal.", inputSchema: { type: "object", additionalProperties: false, properties: { canonical_path: { type: "string", minLength: 1, maxLength: 4096 }, expected_uid: { type: ["string", "null"], minLength: 1, maxLength: 128 } }, required: ["canonical_path"] }, annotations },
  { name: "gkos_search", title: "Search authorized note text", description: "Observatory extension: native Engine retrieval over authorized indexed chunks, with verified citations and actual ranking/stage confidence. Optional path_include explicitly narrows the search using native portable globs; omitted means the complete authorized view. Paginates a bounded top-100 retrieval window; only an operator-configured local ONNX embedding provider may be enabled; remote providers and reranking remain disabled.", inputSchema: { type: "object", additionalProperties: false, properties: { path_include: { type: "array", minItems: 1, maxItems: 16, items: { type: "string", minLength: 1, maxLength: 512 } }, query: { type: "string", minLength: 1, maxLength: 256 }, cursor: { type: ["string", "null"] }, limit: { type: "integer", minimum: 1, maximum: 50 } }, required: ["query", "cursor", "limit"] }, annotations },
]);

interface McpSession {
  id: string;
  credentialId: string;
  agentId: string;
  initialized: boolean;
  lastUsedAt: number;
  secret: Buffer;
  records: Map<string, string>;
  recordBindings: Map<string, { generation: number; sourceDigest: string | null }>;
  scopes: Map<string, string>;
  cursors: Map<string, { kind: string; scopeRef: string; offset: number; generation: number; snapshotId: string; queryKey: string }>;
}

export interface ServiceMcpExecutionContext {
  identity: ServiceCredentialIdentity;
  view: GkosAuthorizedView;
  generation: number;
  policyDecisionId: string;
  sourceRecords?: readonly SourceFile[];
  retrievalSearch?: ServiceRetrievalSearch;
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

interface ParameterIssue { field: string; code: string }
// Only schema-owned field names/codes: no caller values, unknown keys, or
// information about records outside the admitted view.
function parameterIssues(tool: string, args: unknown): ParameterIssue[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) return [{ field: "$", code: "INVALID_TYPE" }];
  const schema = SERVICE_MCP_TOOLS.find(item => item.name === tool)!.inputSchema;
  const properties = schema.properties as Record<string, Record<string, any>>;
  const input = args as Record<string, unknown>, issues: ParameterIssue[] = [];
  if (Object.keys(input).some(key => !Object.hasOwn(properties, key))) issues.push({ field: "$", code: "UNEXPECTED_FIELD" });
  for (const [field, spec] of Object.entries(properties)) {
    if (!Object.hasOwn(input, field)) {
      if ((schema.required as string[] | undefined)?.includes(field)) issues.push({ field, code: "MISSING_REQUIRED_FIELD" });
      continue;
    }
    const value = input[field], variants = spec.anyOf ?? [spec];
    const typeMatches = (s: Record<string, any>) => !s.type || (Array.isArray(s.type) ? s.type : [s.type]).some((type: string) =>
      type === "null" ? value === null : type === "integer" ? Number.isInteger(value) : type === "array" ? Array.isArray(value) : typeof value === type);
    if (!variants.some(typeMatches)) issues.push({ field, code: "INVALID_TYPE" });
    else if (spec.enum && !spec.enum.includes(value)) issues.push({ field, code: "INVALID_ENUM" });
    else if (typeof value === "number" && (value < spec.minimum || value > spec.maximum)) issues.push({ field, code: "OUT_OF_RANGE" });
    // Reference resolution retains its existing non-disclosing error contract.
    else if (!field.endsWith("_ref") && typeof value === "string" && (value.length < spec.minLength || value.length > spec.maxLength)) issues.push({ field, code: "INVALID_LENGTH" });
    else if (Array.isArray(value) && (value.length < spec.minItems || value.length > spec.maxItems || value.some(item => typeof item !== "string" || item.length < spec.items.minLength || item.length > spec.items.maxLength))) issues.push({ field, code: "INVALID_ITEMS" });
  }
  return issues.slice(0, 8);
}

// Query instants only. Source/admission timestamp validation is unchanged.
// Millisecond precision, optional fractional seconds, explicit UTC/offset.
function queryInstant(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?([Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 || Number(match[8]) > 23 || Number(match[9]) > 59) return null;
  const day = new Date(`${match[1]}T00:00:00.000Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]) return null;
  const at = new Date(value.toUpperCase());
  return Number.isFinite(at.getTime()) ? at : null;
}

// Exact catalog coordinates only: never decode, normalize traversal, or access
// the filesystem from a caller-supplied locator.
function canonicalLocator(value: string): boolean {
  return value.length > 0 && value.length <= 4096 && Buffer.from(value, "utf8").toString("utf8") === value &&
    !/[\\:\u0000-\u001f\u007f]/u.test(value) && value.split("/").every(part => part !== "" && part !== "." && part !== "..");
}

function authorizedNavigationSnapshot(context: ServiceMcpExecutionContext): NavigationSnapshot {
  const notes = new Map(context.view.notes.map(note => [note.path, note]));
  return {
    vaultId: context.vaultId,
    sources: context.sourceRecords!.filter(source => notes.has(source.relativePath) && typeof source.content === "string")
      .map(source => ({ relativePath: source.relativePath, content: source.content!, stableId: notes.get(source.relativePath)?.uid ?? undefined })),
    directories: context.view.graph.nodes.filter(node => node.kind === "folder").map(node => node.path),
  };
}

function issuedCursor(session: McpSession, kind: string, scopeRef: string, offset: number, generation: number, snapshotId: string, queryKey = ""): string {
  const payload = createHmac("sha256", session.secret).update(`cursor\0${kind}\0${scopeRef}\0${offset}\0${generation}\0${snapshotId}\0${queryKey}`, "utf8").digest().toString("base64url");
  const cursor = `gkcur1_${payload}`;
  if (!session.cursors.has(cursor) && session.cursors.size >= SESSION_REFERENCE_LIMIT) throw new Error("GKOS_OBS_CONTENT_LIMIT");
  session.cursors.set(cursor, { kind, scopeRef, offset, generation, snapshotId, queryKey });
  return cursor;
}

function page(limit: number, generation: number, snapshotId: string, session?: McpSession, kind?: string, scopeRef?: string, nextOffset?: number, queryKey = ""): Record<string, unknown> {
  const hasMore = session !== undefined && kind !== undefined && scopeRef !== undefined && nextOffset !== undefined;
  return { limit, has_more: hasMore, next_cursor: hasMore ? issuedCursor(session, kind, scopeRef, nextOffset, generation, snapshotId, queryKey) : null, snapshot_id: snapshotId };
}

function paginationStart(session: McpSession, cursorValue: unknown, kind: string, scopeRef: string, generation: number): { offset: number; snapshotId: string } | null {
  if (cursorValue === null) return { offset: 0, snapshotId: uuidV7() };
  if (typeof cursorValue !== "string") return null;
  const cursor = session.cursors.get(cursorValue);
  if (!cursor || cursor.kind !== kind || cursor.scopeRef !== scopeRef || cursor.generation !== generation) return null;
  return { offset: cursor.offset, snapshotId: cursor.snapshotId };
}

function sourceDigest(content: string): string { return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`; }

function issueRecord(session: McpSession, node: GkxNode, context: ServiceMcpExecutionContext): string {
  // Callers supply only a node already inside the authorized view. Never read
  // content for a source that does not match that authorized canonical path.
  const sources = context.sourceRecords?.filter((source) => source.relativePath === node.path) ?? [];
  const content = sources.length === 1 && typeof sources[0].content === "string" ? sources[0].content : null;
  const boundDigest = content !== null && Buffer.byteLength(content, "utf8") <= CONTENT_MAX_READ_BYTES ? sourceDigest(content) : null;
  const recordRef = issuedRef(session, "gkrec1", `${node.id}\0${context.generation}\0${boundDigest ?? "unavailable"}`);
  if (!session.records.has(recordRef) && session.records.size >= SESSION_REFERENCE_LIMIT) throw new Error("GKOS_OBS_CONTENT_LIMIT");
  session.records.set(recordRef, node.id);
  session.recordBindings.set(recordRef, { generation: context.generation, sourceDigest: boundDigest });
  return recordRef;
}

function recordSummary(session: McpSession, node: GkxNode, context: ServiceMcpExecutionContext): Record<string, unknown> {
  const recordRef = issueRecord(session, node, context);
  return {
    record_ref: recordRef,
    uid: typeof node.gkx?.uid === "string" ? node.gkx.uid : null,
    canonical_path: node.path,
    valid_at: typeof node.validAt === "string" ? node.validAt : null,
    head: node.gkx?.head === true,
    superseded: typeof node.gkx?.invalidAt === "string",
  };
}

interface AuthorizedContent { node: GkxNode; content: string; bytes: Buffer; sourceDigest: string }
function authorizedContent(context: ServiceMcpExecutionContext, target?: GkxNode): AuthorizedContent[] {
  if (!context.sourceRecords) throw new Error("GKOS_P6_CAPABILITY_UNAVAILABLE");
  const notes = target ? context.view.notes.filter((note) => note.id === target.id && note.path === target.path) : context.view.notes;
  if (target && notes.length !== 1) throw new Error("GKOS_P6_CAPABILITY_UNAVAILABLE");
  if (notes.length > CONTENT_MAX_FILES) throw new Error("GKOS_OBS_CONTENT_LIMIT");
  const visible = new Map<string, GkxNode>();
  for (const note of notes) {
    const nodes = context.view.graph.nodes.filter((node) => node.kind === "file" && node.path === note.path && node.id === note.id);
    if (nodes.length !== 1 || visible.has(note.path)) throw new Error("GKOS_P6_CAPABILITY_UNAVAILABLE");
    visible.set(note.path, nodes[0]);
  }
  const sources = new Map<string, SourceFile>();
  for (const source of context.sourceRecords) {
    if (!visible.has(source.relativePath)) continue;
    if (sources.has(source.relativePath)) throw new Error("GKOS_P6_CAPABILITY_UNAVAILABLE");
    sources.set(source.relativePath, source);
  }
  let totalBytes = 0;
  const result: AuthorizedContent[] = [];
  for (const [path, node] of visible) {
    const source = sources.get(path);
    if (!source || typeof source.content !== "string") throw new Error("GKOS_P6_CAPABILITY_UNAVAILABLE");
    const length = Buffer.byteLength(source.content, "utf8");
    totalBytes += length;
    if (length > (target ? CONTENT_MAX_READ_BYTES : CONTENT_MAX_FILE_BYTES) || totalBytes > (target ? CONTENT_MAX_READ_BYTES : CONTENT_MAX_TOTAL_BYTES)) throw new Error("GKOS_OBS_CONTENT_LIMIT");
    const bytes = Buffer.from(source.content, "utf8");
    // Reject malformed Unicode instead of silently replacing source bytes.
    if (bytes.toString("utf8") !== source.content) throw new Error("GKOS_P6_CAPABILITY_UNAVAILABLE");
    result.push({ node, content: source.content, bytes, sourceDigest: sourceDigest(source.content) });
  }
  return result.sort((a, b) => a.node.path < b.node.path ? -1 : a.node.path > b.node.path ? 1 : 0);
}

function contentSnapshot(context: ServiceMcpExecutionContext, records: AuthorizedContent[]): string {
  return digest({ vault: context.vaultId, generation: context.generation, policy: context.policyDecisionId,
    credential: context.identity.credentialId, ceiling: context.identity.sensitivityCeiling,
    records: records.map((record) => [record.node.id, record.node.path, record.sourceDigest]) });
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

function toolError(requestId: string, code: string, issues?: ParameterIssue[]): Record<string, unknown> {
  const error = {
    contract_version: CONTRACT_VERSION,
    error_code: code,
    request_id: UUID_V7.test(requestId) ? requestId : null,
    retryable: false,
    retry_after_ms: null,
    ...(issues?.length ? { parameter_issues: issues } : {}),
    ...(code === "GKOS_P6_REFERENCE_UNKNOWN" ? { recovery: {
      code: "RESOLVE_KNOWN_PATH_OR_REDISCOVER",
      message: "Reference unavailable in the current admitted view. This does not establish existence or a specific invalidation reason.",
      next_action: "Resolve a previously known canonical path with gkos_record_resolve, optionally guarded by expected_uid; otherwise restart discovery with cursor null. Do not reuse old cursors or another MCP session's references.",
    } } : {}),
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
    if (context.identity.revoked || !context.identity.capabilities.includes("mcp.read") ||
      context.view.credential_id !== context.identity.credentialId || context.view.agent_id !== context.identity.agentId ||
      context.view.sensitivity_ceiling !== context.identity.sensitivityCeiling) return this.protocolError(null, -32000, "Request refused");
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
      this.#sessions.set(nextId, { id: nextId, credentialId: context.identity.credentialId, agentId: context.identity.agentId, initialized: false, lastUsedAt: now, secret: randomBytes(32), records: new Map(), recordBindings: new Map(), scopes: new Map(), cursors: new Map() });
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
    } catch (error) {
      const code = error instanceof Error && error.message === "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT" ? "GKOS_P6_AUTHORIZED_VIEW_CONFLICT" : error instanceof Error && ["GKOS_OBS_CONTENT_LIMIT", "GKOS_P6_CAPABILITY_UNAVAILABLE"].includes(error.message) ? error.message : "GKOS_P6_OPERATION_FAILED";
      executed = { result: toolError(operationId, code), paths: [], isError: true, eventStatus: "failed" };
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
    if (!session || session.credentialId !== identity.credentialId || session.agentId !== identity.agentId) return false;
    const now = this.#clock();
    if (!Number.isSafeInteger(now) || now < 0 || now - session.lastUsedAt > this.#sessionTtlMs) {
      this.#sessions.delete(sessionId);
      return false;
    }
    return true;
  }

  private protocolError(id: unknown, code: number, message: string): ServiceMcpReply {
    return { body: { jsonrpc: "2.0", id, error: { code, message } } };
  }

  private async executeTool(session: McpSession, tool: string, args: unknown, context: ServiceMcpExecutionContext, requestId: string): Promise<{ result: Record<string, unknown>; paths: string[]; isError: boolean }> {
    const fail = (code: string, issues?: ParameterIssue[]) => ({ result: toolError(requestId, code, issues ?? (code === "GKOS_P6_INVALID_PARAMS" ? [{ field: "$", code: "INVALID_VALUE" }] : undefined)), paths: [] as string[], isError: true });
    if (!UUID_V7.test(context.identity.agentId) || !UUID_V7.test(context.policyDecisionId)) return fail("GKOS_P6_AUTH_FAILED");
    const issues = parameterIssues(tool, args);
    if (issues.length) return fail("GKOS_P6_INVALID_PARAMS", issues);
    if (tool === "gkos_capabilities") {
      if (!exactObject(args, [])) return fail("GKOS_P6_INVALID_PARAMS");
      const navigationReady = !!context.navigationConfig && !!context.sourceRecords;
      const names = navigationReady ? CAPABILITY_NAMES : ["capability.read.self"];
      const contentNames = context.sourceRecords ? ["note.content.read", "record.locator.resolve", ...(context.retrievalSearch ? ["note.fulltext.search"] : [])] : [];
      const discovery = {
        version: "observatory.discovery/1",
        view_boundary: "admitted_authorized_view_only",
        availability: "tool_available_does_not_imply_scope_coherent",
        references: "record refs are session/generation scoped; note_read also verifies source bytes; reconnect is not a new session",
        recovery_tool: "gkos_record_resolve",
        catalog_digest: "navigation_discover: authorized source snapshot; compare only same artifact kind and authorization context",
        result_digest: "request envelope, not a payload cache key",
        pagination: "required nullable cursor; repeat filters and detail on every page",
        limits: { request_bytes: MCP_REQUEST_BYTES, result_bytes: MCP_RESULT_BYTES, navigation_page: 100, search_page: 50, note_page_bytes: 16384 },
      };
      return { result: seal({ ...common(context, requestId), extension_version: CONTENT_EXTENSION_VERSION, discovery, capabilities: [...names, ...contentNames].map((capability_name) => ({ capability_name, available: true, reason_code: null })) }), paths: [], isError: false };
    }
    if (tool === "gkos_navigation_discover") {
      const input = args as Record<string, unknown>;
      if (!(input.cursor === null || typeof input.cursor === "string") || !Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 100) return fail("GKOS_P6_INVALID_PARAMS");
      if (!context.navigationConfig || !context.sourceRecords) return fail("GKOS_P6_CAPABILITY_UNAVAILABLE");
      const detail = input.detail ?? "full";
      const prefix = (input.path_prefix as string | undefined ?? "").replace(/\/$/u, "");
      if ((input.path_prefix !== undefined && input.path_prefix !== "" && prefix === "") || (prefix && !canonicalLocator(prefix))) return fail("GKOS_P6_INVALID_PARAMS", [{ field: "path_prefix", code: "INVALID_PATH" }]);
      const query = input.name_query as string | undefined;
      const terms = query?.trim().toLowerCase().split(/\s+/u) ?? [];
      if (query !== undefined && (!query.trim() || terms.length > 8 || Buffer.from(query, "utf8").toString("utf8") !== query || /[\u0000-\u001f\u007f]/u.test(query))) return fail("GKOS_P6_INVALID_PARAMS", [{ field: "name_query", code: "INVALID_VALUE" }]);
      const snapshot = authorizedNavigationSnapshot(context);
      const artifactDigest = await navigationSnapshotDigest(snapshot);
      const queryKey = digest({ artifactDigest, config: context.navigationConfig.digest, detail, prefix, terms });
      let scopeRef: string;
      let offset = 0;
      let snapshotId = uuidV7();
      if ((input.scope_ref === null || input.scope_ref === undefined) && input.cursor === null) {
        scopeRef = issuedRef(session, "gkscp1", "root");
        session.scopes.set(scopeRef, "");
      } else if ((input.scope_ref === null || input.scope_ref === undefined) && typeof input.cursor === "string") {
        // Resolve only through this session's issued cursor map, never decode
        // client text or look up another session's scope.
        const held = session.cursors.get(input.cursor);
        if (!held || held.kind !== "navigation_discover" || held.generation !== context.generation || !session.scopes.has(held.scopeRef)) return fail("GKOS_P6_REFERENCE_UNKNOWN");
        scopeRef = held.scopeRef;
      } else if (typeof input.scope_ref === "string" && REF.test(input.scope_ref) && session.scopes.has(input.scope_ref)) scopeRef = input.scope_ref;
      else return fail("GKOS_P6_REFERENCE_UNKNOWN");
      if (typeof input.cursor === "string") {
        const cursor = session.cursors.get(input.cursor);
        if (!cursor || cursor.kind !== "navigation_discover" || cursor.scopeRef !== scopeRef || cursor.generation !== context.generation || cursor.queryKey !== queryKey) return fail("GKOS_P6_REFERENCE_UNKNOWN");
        offset = cursor.offset;
        snapshotId = cursor.snapshotId;
      }
      const discovery = discoverNavigation(snapshot, context.navigationConfig);
      const labels = new Map(context.view.graph.nodes.filter(node => node.kind === "file").map(node => [node.path, `${node.label}\n${node.gkx?.title ?? ""}`]));
      const entries = discovery.entries.filter(entry => (!prefix || entry.path === prefix || entry.path.startsWith(`${prefix}/`)) && terms.every(term => `${entry.path}\n${labels.get(entry.path) ?? ""}`.toLowerCase().includes(term)));
      const limit = Number(input.limit);
      const items = entries.slice(offset, offset + limit).map((entry) => {
        const node = context.view.graph.nodes.find((candidate) => candidate.kind === "file" && candidate.path === entry.path);
        if (!node) throw new Error("GKOS_SERVICE_NAVIGATION_VIEW_MISMATCH");
        const recordRef = issueRecord(session, node, context);
        if (detail === "compact") return { record_ref: recordRef, canonical_path: entry.path };
        return { record_ref: recordRef, child_scope_ref: null, canonical_path: entry.path, classification: entry.classification, management: entry.management, name_standing: entry.nameStanding, recognized_moc_name: entry.recognizedMocName, evidence_codes: entry.evidence.map((item) => item.code).sort() };
      });
      const nextOffset = offset + items.length < entries.length ? offset + items.length : undefined;
      return { result: seal({ ...common(context, requestId), scope_ref: scopeRef, artifact_digest: artifactDigest, items, page: page(limit, context.generation, snapshotId, session, "navigation_discover", scopeRef, nextOffset, queryKey) }), paths: items.map((item) => item.canonical_path), isError: false };
    }
    const input = args as Record<string, unknown>;
    if (tool === "gkos_record_resolve") {
      if (!canonicalLocator(input.canonical_path as string)) return fail("GKOS_P6_INVALID_PARAMS", [{ field: "canonical_path", code: "INVALID_PATH" }]);
      if (!context.sourceRecords) return fail("GKOS_P6_CAPABILITY_UNAVAILABLE");
      const note = context.view.notes.find(item => item.path === input.canonical_path);
      const node = note && context.view.graph.nodes.find(item => item.kind === "file" && item.id === note.id && item.path === note.path);
      if (!node || (input.expected_uid !== undefined && input.expected_uid !== null && input.expected_uid !== node.gkx?.uid)) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      const record = authorizedContent(context, node).find(item => item.node.id === node.id);
      if (!record) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      return { result: seal({ ...common(context, requestId), extension_version: CONTENT_EXTENSION_VERSION,
        ...recordSummary(session, node, context), source_digest: record.sourceDigest }), paths: [node.path], isError: false };
    }
    const recordNode = (value: unknown): GkxNode | null => {
      if (typeof value !== "string" || !REF.test(value)) return null;
      if (session.recordBindings.get(value)?.generation !== context.generation) return null;
      const nodeId = session.records.get(value);
      return nodeId ? context.view.graph.nodes.find((node) => node.id === nodeId && node.kind === "file") ?? null : null;
    };
    if (tool === "gkos_note_read") {
      if (!exactObject(args, ["record_ref", "cursor", "limit_bytes"]) || !(input.cursor === null || typeof input.cursor === "string") || !Number.isInteger(input.limit_bytes) || Number(input.limit_bytes) < 4 || Number(input.limit_bytes) > 16384) return fail("GKOS_P6_INVALID_PARAMS");
      const node = recordNode(input.record_ref);
      if (!node) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      const records = authorizedContent(context, node);
      const record = records.find((item) => item.node.id === node.id);
      if (!record) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      const binding = session.recordBindings.get(String(input.record_ref));
      if (binding?.sourceDigest !== record.sourceDigest) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      const scope = `${String(input.record_ref)}\0${contentSnapshot(context, records)}`;
      const pagination = paginationStart(session, input.cursor, "note_read", scope, context.generation);
      if (!pagination) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      const start = pagination.offset;
      let end = Math.min(record.bytes.length, start + Number(input.limit_bytes));
      while (end < record.bytes.length && (record.bytes[end] & 0xc0) === 0x80) end--;
      const content = record.bytes.subarray(start, end).toString("utf8");
      const nextOffset = end < record.bytes.length ? end : undefined;
      return { result: seal({ ...common(context, requestId), extension_version: CONTENT_EXTENSION_VERSION,
        record_ref: input.record_ref, canonical_path: node.path, content_encoding: "utf-8", content,
        offset_bytes: start, returned_bytes: end - start, total_bytes: record.bytes.length, source_digest: record.sourceDigest,
        page: page(Number(input.limit_bytes), context.generation, pagination.snapshotId, session, "note_read", scope, nextOffset) }), paths: [node.path], isError: false };
    }
    if (tool === "gkos_search") {
      if ((!exactObject(args, ["query", "cursor", "limit"]) && !exactObject(args, ["query", "cursor", "limit", "path_include"])) || typeof input.query !== "string" || !input.query.trim() || input.query.length > 256 || Buffer.byteLength(input.query, "utf8") > 1024 || !(input.cursor === null || typeof input.cursor === "string") || !Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 50) return fail("GKOS_P6_INVALID_PARAMS");
      if (Buffer.from(input.query, "utf8").toString("utf8") !== input.query || /[\u0000-\u0008\u000e-\u001f\u007f]/u.test(input.query)) return fail("GKOS_P6_INVALID_PARAMS");
      let filters: { path_include: string[] } | undefined;
      if (Object.hasOwn(input, "path_include")) {
        if (!Array.isArray(input.path_include) || input.path_include.length < 1 || input.path_include.length > 16 || input.path_include.some(value => typeof value !== "string" || value.length < 1 || value.length > 512)) return fail("GKOS_P6_INVALID_PARAMS");
        filters = { path_include: [...input.path_include] as string[] };
        try { validateRetrievalFilters(filters); } catch { return fail("GKOS_P6_INVALID_PARAMS"); }
      }
      const query = input.query.trim();
      const terms = query.toLowerCase().split(/\s+/u);
      if (terms.length > 8) return fail("GKOS_P6_INVALID_PARAMS");
      try { lexicalQueryClauses(query); } catch { return fail("GKOS_P6_INVALID_PARAMS"); }
      if (!context.retrievalSearch) return fail("GKOS_P6_CAPABILITY_UNAVAILABLE");
      const records = authorizedContent(context);
      const scopeBase = `${query}\0${digest(filters ?? {})}\0${contentSnapshot(context, records)}`;
      if (typeof input.cursor === "string") {
        const prior = session.cursors.get(input.cursor);
        if (!prior || prior.kind !== "search" || prior.generation !== context.generation || !prior.scopeRef.startsWith(`${scopeBase}\0`)) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      }
      const byPath = new Map(records.map((record) => [record.node.path, record]));
      const permit = (value: { source_id: string; source_path: string; source_digest: string }) => {
        const record = byPath.get(value.source_path);
        return record && record.sourceDigest === value.source_digest && record.node.gkx?.uid === value.source_id ? "allow" as const : "deny" as const;
      };
      const native = await context.retrievalSearch({ query, limit: 100, ...(filters ? { filters } : {}) }, {
        source_discoverability_policy: permit,
        discoverability_policy: permit,
        source_reader: async (path) => {
          const record = byPath.get(path);
          if (!record) throw new Error("GKOS_P6_CAPABILITY_UNAVAILABLE");
          return new Uint8Array(record.bytes);
        },
      });
      if (native.projection_freshness !== "fresh") return fail("GKOS_P6_CAPABILITY_UNAVAILABLE");
      // Bind cursors to both the authorization snapshot and exact ranked window.
      const scope = `${scopeBase}\0${digest(native)}`;
      const pagination = paginationStart(session, input.cursor, "search", scope, context.generation);
      if (!pagination) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      for (const hit of native.hits) {
        const record = byPath.get(hit.citation.path);
        if (!record || hit.citation.source_digest !== record.sourceDigest || hit.citation.source_id !== record.node.gkx?.uid || hit.chunk.source_id !== record.node.gkx?.uid || !hit.citation.verified || hit.citation.stale ||
            hit.chunk.source_path !== record.node.path || hit.chunk.source_digest !== record.sourceDigest) return fail("GKOS_P6_CAPABILITY_UNAVAILABLE");
      }
      const selected = native.hits.slice(pagination.offset, pagination.offset + Number(input.limit));
      const items = selected.map((hit) => ({ ...hit, record_ref: issueRecord(session, byPath.get(hit.citation.path)!.node, context), canonical_path: hit.citation.path }));
      const nextOffset = pagination.offset + items.length < native.hits.length ? pagination.offset + items.length : undefined;
      const { hits: _hits, ...retrieval } = native;
      return { result: seal({ ...common(context, requestId), extension_version: "observatory.mcp-retrieval.v0",
        query, retrieval, retrieval_window: { limit: 100, returned_chunks: native.hits.length, exhaustive: false }, items,
        page: page(Number(input.limit), context.generation, pagination.snapshotId, session, "search", scope, nextOffset) }), paths: items.map((item) => item.canonical_path), isError: false };
    }
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
      const items = candidates.slice(pagination.offset, pagination.offset + Number(input.limit)).map((node) => recordSummary(session, node, context));
      const nextOffset = pagination.offset + items.length < candidates.length ? pagination.offset + items.length : undefined;
      return { result: seal({ ...common(context, requestId), root_record_ref: input.record_ref, items, page: page(Number(input.limit), context.generation, pagination.snapshotId, session, "lineage", String(input.record_ref), nextOffset) }), paths: items.map((item) => String(item.canonical_path)), isError: false };
    }
    if (tool === "gkos_graph_at_time") {
      if (!exactObject(args, ["at", "cursor", "limit", "scope_ref", "state"]) || !(input.cursor === null || typeof input.cursor === "string") || typeof input.scope_ref !== "string" || !session.scopes.has(input.scope_ref) || typeof input.at !== "string" || !Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 100 || !["valid", "superseded", "not_yet_created", "all"].includes(String(input.state))) return fail("GKOS_P6_INVALID_PARAMS");
      const at = queryInstant(input.at);
      if (!at) return fail("GKOS_P6_INVALID_PARAMS", [{ field: "at", code: "INVALID_TIMESTAMP" }]);
      const paginationScope = `${input.scope_ref}\0${at.toISOString()}\0${input.state}`;
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
      const items = candidates.slice(pagination.offset, pagination.offset + Number(input.limit)).map((node) => recordSummary(session, node, context));
      const nextOffset = pagination.offset + items.length < candidates.length ? pagination.offset + items.length : undefined;
      return { result: seal({ ...common(context, requestId), scope_ref: input.scope_ref, at: input.at, state: input.state, items, page: page(Number(input.limit), context.generation, pagination.snapshotId, session, "graph_at_time", paginationScope, nextOffset) }), paths: items.map((item) => String(item.canonical_path)), isError: false };
    }
    if (tool === "gkos_navigation_audit") {
      if (!exactObject(args, ["cursor", "limit", "scope_ref", "severity_at_least"]) || !(input.cursor === null || typeof input.cursor === "string") || typeof input.scope_ref !== "string" || !session.scopes.has(input.scope_ref) || !Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 100 || !["info", "warning", "error"].includes(String(input.severity_at_least))) return fail("GKOS_P6_INVALID_PARAMS");
      if (!context.navigationConfig || !context.sourceRecords) return fail("GKOS_P6_CAPABILITY_UNAVAILABLE");
      const paginationScope = `${input.scope_ref}\0${input.severity_at_least}`;
      const pagination = paginationStart(session, input.cursor, "navigation_audit", paginationScope, context.generation);
      if (!pagination) return fail("GKOS_P6_REFERENCE_UNKNOWN");
      const snapshot = authorizedNavigationSnapshot(context);
      const ranks = { info: 0, warning: 1, error: 2 } as const;
      const candidates = (await auditNavigation(snapshot, context.navigationConfig)).filter((finding) => ranks[finding.severity] >= ranks[input.severity_at_least as keyof typeof ranks]);
      const findings = candidates.slice(pagination.offset, pagination.offset + Number(input.limit));
      const items = findings.map((finding) => {
        const node = context.view.graph.nodes.find(node => node.kind === "file" && node.path === finding.path);
        return { code: finding.code.replace(/-/gu, "_"), severity: finding.severity, record_ref: node ? issueRecord(session, node, context) : null };
      });
      const nextOffset = pagination.offset + items.length < candidates.length ? pagination.offset + items.length : undefined;
      return { result: seal({ ...common(context, requestId), scope_ref: input.scope_ref, artifact_digest: await navigationSnapshotDigest(snapshot), items, page: page(Number(input.limit), context.generation, pagination.snapshotId, session, "navigation_audit", paginationScope, nextOffset) }), paths: findings.map((finding) => finding.path).filter(Boolean), isError: false };
    }
    return fail("GKOS_P6_CAPABILITY_UNAVAILABLE");
  }
}
