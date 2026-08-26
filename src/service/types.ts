import type { GkxGraph, GkxSensitivity, SourceFile } from "../types";

export const GKOS_LOCAL_SERVICE_PROTOCOL = Object.freeze({
  id: "gkos-local-service",
  version: "1.0.0-draft.1",
});

export type ServiceOperation =
  | "health"
  | "capabilities"
  | "notes"
  | "graph"
  | "graphiti_episodes"
  | "mcp"
  | "events"
  | "proposal_ingress";

export type ServiceReadCapability =
  | "health.read"
  | "capabilities.read"
  | "notes.read"
  | "graph.read"
  | "graphiti.read"
  | "mcp.read"
  | "events.read";

/** Host-authenticated identity. Tokens and credential material never enter this value. */
export interface ServiceCredentialIdentity {
  credentialId: string;
  agentId: string;
  agentLabel: string;
  sensitivityCeiling: GkxSensitivity;
  capabilities: readonly ServiceReadCapability[];
  revoked: boolean;
  limits?: {
    concurrentRequests: number;
    bucketCapacity: number;
    refillMs: number;
  };
}
export interface ServiceAuthorizationConfiguration {
  configured: boolean;
  generation: number | null;
  policyDigest: `sha256:${string}` | null;
}

export interface ServiceCorpusSnapshot {
  graph: GkxGraph | null;
  sourceRecords?: readonly SourceFile[];
  attachments?: readonly string[];
  generation?: number;
  /** Stable timestamp bound to this corpus generation, never request time. */
  evaluationTime?: string;
}

export interface ServiceCredentialBinding {
  /** Secret bearer material. It is retained only by the host credential store. */
  token: string;
  identity: ServiceCredentialIdentity;
}

export interface ServiceCorpusChange {
  generation: number;
  changedPaths: readonly string[];
}

/**
 * Transport-neutral corpus boundary. Implementations own filesystem/Obsidian
 * lifecycle; the shared service owns neither parsing nor graph semantics.
 */
export interface CorpusProvider {
  snapshot(): ServiceCorpusSnapshot | Promise<ServiceCorpusSnapshot>;
  content(relativePath: string): string | undefined | Promise<string | undefined>;
  authorizationConfiguration():
    | ServiceAuthorizationConfiguration
    | Promise<ServiceAuthorizationConfiguration>;
  subscribe(listener: (change: ServiceCorpusChange) => void): () => void;
}

export interface ServiceTraversalEvent {
  schema_version: 1;
  session_id: string;
  sequence: number;
  offset_ms: number;
  operation_id: string;
  agent_id: string;
  agent_label: string;
  tool: string;
  paths: string[];
  status: "completed" | "failed" | "denied";
  cost_units: number | null;
}

export interface ServiceFeatureStatus {
  available: boolean;
  configured: boolean;
  authorized: boolean;
  enabled: boolean;
  reason_codes: string[];
}

export interface ServiceCapabilitiesDocument {
  schema_version: 1;
  protocol: typeof GKOS_LOCAL_SERVICE_PROTOCOL;
  features: {
    graph: ServiceFeatureStatus;
    notes: ServiceFeatureStatus;
    graphiti_episodes: ServiceFeatureStatus;
    mcp: ServiceFeatureStatus;
    events: ServiceFeatureStatus;
    proposal_ingress: ServiceFeatureStatus;
    navigation: ServiceFeatureStatus;
    navigation_effects: ServiceFeatureStatus;
  };
}
