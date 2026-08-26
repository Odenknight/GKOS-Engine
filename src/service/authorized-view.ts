import { buildGraphitiEpisodes } from "../graphiti";
import { SENSITIVITY_RANK } from "../gkx23";
import type { GkxGraph, GkxLink, GkxNode, GkxSensitivity, GraphitiEpisode, LinkKind } from "../types";
import type {
  ServiceCorpusSnapshot,
  ServiceCredentialIdentity,
  ServiceOperation,
  ServiceReadCapability,
  ServiceAuthorizationConfiguration,
} from "./types";
import { isServiceVaultRelativePath } from "./paths";

const OPERATIONS: readonly ServiceOperation[] = [
  "health", "capabilities", "notes", "graph", "graphiti_episodes", "mcp", "events", "proposal_ingress",
];
const REQUIRED_CAPABILITY: Partial<Record<ServiceOperation, ServiceReadCapability>> = {
  health: "health.read",
  capabilities: "capabilities.read",
  notes: "notes.read",
  graph: "graph.read",
  graphiti_episodes: "graphiti.read",
  mcp: "mcp.read",
  events: "events.read",
};
const CONTROL = /[\u0000-\u001f\u007f]/u;
const LINK_KINDS = new Set<LinkKind>(["wikilink", "markdown", "property", "semantic", "lineage", "contains"]);

export class GkosServiceDeniedError extends Error {
  readonly code = "GKOS_SERVICE_ACCESS_DENIED";
  constructor() {
    super("GKOS_SERVICE_ACCESS_DENIED");
    this.name = "GkosServiceDeniedError";
  }
}

export interface AuthorizedNoteSummary {
  id: string;
  path: string;
  label: string;
  uid: string | null;
  type: string | null;
  sensitivity: GkxSensitivity;
}

export interface GkosAuthorizedView {
  schema_version: 1;
  operation: ServiceOperation;
  evaluated_at: string;
  credential_id: string;
  agent_id: string;
  sensitivity_ceiling: GkxSensitivity;
  notes: AuthorizedNoteSummary[];
  graph: GkxGraph;
  graphiti_episodes: GraphitiEpisode[];
  visible_counts: {
    notes: number;
    folders: number;
    links: number;
    episodes: number;
  };
}

export interface BuildAuthorizedViewInput {
  identity: ServiceCredentialIdentity | null;
  sensitivityCeiling: GkxSensitivity;
  corpus: ServiceCorpusSnapshot;
  authorization: ServiceAuthorizationConfiguration;
  operation: ServiceOperation;
  evaluationTime: string;
  vaultName?: string;
}

function deny(): never { throw new GkosServiceDeniedError(); }
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const unique = (values: readonly string[]): string[] => [...new Set(values)].sort(compare);

function validIdentityPart(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !CONTROL.test(value);
}

function sensitivity(node: GkxNode): GkxSensitivity {
  const projection = node.gkx?.projection;
  const candidate = projection
    ? projection.effective.sensitivity
    : node.gkx?.sensitivity;
  return typeof candidate === "string" && candidate in SENSITIVITY_RANK
    ? candidate as GkxSensitivity
    : "secret";
}

function validateRequest(input: BuildAuthorizedViewInput): ServiceCredentialIdentity {
  const identity = input.identity;
  if (!identity || identity.revoked || !OPERATIONS.includes(input.operation)) deny();
  if (!validIdentityPart(identity.credentialId, 160) || !validIdentityPart(identity.agentId, 160) || !validIdentityPart(identity.agentLabel, 80)) deny();
  if (!(identity.sensitivityCeiling in SENSITIVITY_RANK) || identity.sensitivityCeiling !== input.sensitivityCeiling) deny();
  if (!(input.sensitivityCeiling in SENSITIVITY_RANK)) deny();
  if (!input.authorization?.configured || !Number.isSafeInteger(input.authorization.generation) || Number(input.authorization.generation) < 0) deny();
  if (!/^sha256:[0-9a-f]{64}$/u.test(input.authorization.policyDigest ?? "")) deny();
  const capabilities = identity.capabilities;
  if (!Array.isArray(capabilities) || new Set(capabilities).size !== capabilities.length) deny();
  if (!capabilities.every((capability) => Object.values(REQUIRED_CAPABILITY).includes(capability))) deny();
  const evaluationTime = new Date(input.evaluationTime);
  if (!Number.isFinite(evaluationTime.getTime()) || evaluationTime.toISOString() !== input.evaluationTime) deny();
  const required = REQUIRED_CAPABILITY[input.operation];
  if (!required || !identity.capabilities.includes(required)) deny();
  return identity;
}

function safeFileNode(node: GkxNode, level: GkxSensitivity): GkxNode {
  if (!isServiceVaultRelativePath(node.path) || !validIdentityPart(node.id, 1024) || !validIdentityPart(node.label, 512)) deny();
  const text = (value: unknown, max: number): string | undefined =>
    typeof value === "string" && value.length <= max && !CONTROL.test(value) ? value : undefined;
  const uid = text(node.gkx?.uid, 160);
  const type = text(node.gkx?.type ?? node.type, 160);
  const title = text(node.gkx?.title, 512) ?? node.label;
  const safe: GkxNode = {
    id: node.id,
    kind: "file",
    path: node.path,
    label: node.label,
    area: text(node.area, 512) ?? "",
    depth: Number.isSafeInteger(node.depth) && node.depth >= 0 ? node.depth : node.path.split("/").length - 1,
    extension: text(node.extension, 32),
    size: typeof node.size === "number" && Number.isSafeInteger(node.size) && node.size >= 0 ? node.size : undefined,
    createdAt: text(node.createdAt, 64),
    updatedAt: text(node.updatedAt, 64),
    validAt: text(node.validAt, 64),
    type,
    priority: text(node.priority, 160),
    tags: Array.isArray(node.tags) ? node.tags.filter((item) => validIdentityPart(item, 160)).sort(compare) : [],
    aliases: Array.isArray(node.aliases) ? node.aliases.filter((item) => validIdentityPart(item, 512)).sort(compare) : [],
    color: /^#[0-9a-f]{6}$/iu.test(node.color) ? node.color : "#808080",
    outgoing: 0,
    incoming: 0,
    gkx: {
      gkxVersion: text(node.gkx?.gkxVersion, 32),
      uid,
      type,
      title,
      timestamp: text(node.gkx?.timestamp, 64),
      epistemicState: text(node.gkx?.epistemicState, 160),
      sensitivity: level,
      supersedes: [],
      supersededBy: [],
      forkedFrom: [],
      forkedTo: [],
      related: [],
      relations: {},
      supersedesIds: [],
      supersededByIds: [],
    },
  };
  return Object.fromEntries(Object.entries(safe).filter(([, value]) => value !== undefined)) as unknown as GkxNode;
}

function safeFolderNode(node: GkxNode): GkxNode {
  if (!isServiceVaultRelativePath(node.path) || !validIdentityPart(node.id, 1024) || !validIdentityPart(node.label, 512)) deny();
  return {
    id: node.id, kind: "folder", path: node.path, label: node.label,
    area: typeof node.area === "string" && !CONTROL.test(node.area) ? node.area : "",
    depth: Number.isSafeInteger(node.depth) && node.depth >= 0 ? node.depth : node.path.split("/").length - 1,
    tags: [], aliases: [], color: /^#[0-9a-f]{6}$/iu.test(node.color) ? node.color : "#808080",
    outgoing: 0, incoming: 0,
  };
}

function projectGraph(graph: GkxGraph | null, ceiling: GkxSensitivity, evaluationTime: string): GkxGraph {
  if (!graph) return {
    nodes: [], links: [], stats: { indexedAt: evaluationTime, durationMs: 0, files: 0, folders: 0, unresolved: 0, links: 0, wikilinks: 0, markdownLinks: 0, propertyLinks: 0, orphans: 0 },
    areas: [], tags: [], statuses: [], types: [],
    diagnostics: { notes: 0, folders: 0, attachments: 0, unresolvedLinks: 0, ambiguousLinks: 0, lineageEdges: 0, lineageCycles: 0, lineageWarnings: [], residualCollisions: 0 },
  };
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.links)) deny();
  const byId = new Map<string, GkxNode>();
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== "string" || byId.has(node.id)) deny();
    byId.set(node.id, node);
  }
  const ceilingRank = SENSITIVITY_RANK[ceiling];
  const visibleFiles = graph.nodes.filter((node) => node.kind === "file" && SENSITIVITY_RANK[sensitivity(node)] <= ceilingRank);
  const visiblePaths = visibleFiles.map((node) => node.path);
  const visibleFolders = graph.nodes.filter((node) => node.kind === "folder" && isServiceVaultRelativePath(node.path) &&
    visiblePaths.some((filePath) => filePath.startsWith(`${node.path}/`)));
  const nodes = [
    ...visibleFiles.map((node) => safeFileNode(node, sensitivity(node))),
    ...visibleFolders.map(safeFolderNode),
  ].sort((left, right) => compare(left.id, right.id));
  const visibleIds = new Set(nodes.map((node) => node.id));
  const links: GkxLink[] = graph.links
    .filter((link) => link && visibleIds.has(link.source) && visibleIds.has(link.target))
    .map((link) => {
      if (!validIdentityPart(link.id, 1024) || !LINK_KINDS.has(link.kind)) deny();
      if (link.label !== undefined && !validIdentityPart(link.label, 512)) deny();
      return {
        id: link.id,
        source: link.source,
        target: link.target,
        kind: link.kind,
        ...(link.label !== undefined ? { label: link.label } : {}),
        // Never trust graph-carried sourcePath. The visible source node is the
        // sole path authority and transports can derive it by source id.
      };
    })
    .sort((left, right) => compare(left.id, right.id));
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const link of links) {
    outgoing.set(link.source, (outgoing.get(link.source) ?? 0) + 1);
    incoming.set(link.target, (incoming.get(link.target) ?? 0) + 1);
  }
  for (const node of nodes) {
    node.outgoing = outgoing.get(node.id) ?? 0;
    node.incoming = incoming.get(node.id) ?? 0;
  }
  const files = nodes.filter((node) => node.kind === "file");
  const folders = nodes.filter((node) => node.kind === "folder");
  const substantive = links.filter((link) => link.kind !== "contains");
  const orphans = files.filter((node) => !substantive.some((link) => link.source === node.id || link.target === node.id)).length;
  return {
    nodes,
    links,
    stats: {
      indexedAt: evaluationTime, durationMs: 0, files: files.length, folders: folders.length, unresolved: 0,
      links: links.length,
      wikilinks: links.filter((link) => link.kind === "wikilink").length,
      markdownLinks: links.filter((link) => link.kind === "markdown").length,
      propertyLinks: links.filter((link) => link.kind === "property").length,
      orphans,
    },
    areas: unique(nodes.map((node) => node.area).filter(Boolean)),
    tags: unique(files.flatMap((node) => node.tags)),
    statuses: unique(files.map((node) => node.status).filter((value): value is string => typeof value === "string")),
    types: unique(files.map((node) => node.type).filter((value): value is string => typeof value === "string")),
    diagnostics: {
      notes: files.length, folders: folders.length, attachments: 0, unresolvedLinks: 0,
      ambiguousLinks: 0, lineageEdges: links.filter((link) => link.kind === "lineage").length,
      lineageCycles: 0, lineageWarnings: [], residualCollisions: 0,
    },
  };
}

/** Build the only graph/note/episode serialization input for a credential. */
export function buildAuthorizedView(input: BuildAuthorizedViewInput): GkosAuthorizedView {
  const identity = validateRequest(input);
  const graph = projectGraph(input.corpus.graph, input.sensitivityCeiling, input.evaluationTime);
  const notes: AuthorizedNoteSummary[] = graph.nodes
    .filter((node) => node.kind === "file")
    .map((node) => ({
      id: node.id,
      path: node.path,
      label: node.label,
      uid: typeof node.gkx?.uid === "string" ? node.gkx.uid : null,
      type: typeof node.type === "string" ? node.type : null,
      sensitivity: node.gkx?.sensitivity ?? "secret",
    }))
    .sort((left, right) => compare(left.path, right.path));
  const graphiti = buildGraphitiEpisodes(graph, {
    vault: input.vaultName ?? "vault",
    processingTime: input.evaluationTime,
  });
  return {
    schema_version: 1,
    operation: input.operation,
    evaluated_at: input.evaluationTime,
    credential_id: identity.credentialId,
    agent_id: identity.agentId,
    sensitivity_ceiling: input.sensitivityCeiling,
    notes,
    graph,
    graphiti_episodes: graphiti,
    visible_counts: {
      notes: notes.length,
      folders: graph.stats.folders,
      links: graph.links.length,
      episodes: graphiti.length,
    },
  };
}
