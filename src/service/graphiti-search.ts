import type { GraphitiQueryResult } from "../graphiti-query-contract";
import type { GkxSensitivity } from "../types";

export interface ServiceGraphitiSource {
  source_id: string;
  source_digest: `sha256:${string}`;
  canonical_path: string;
}

export interface ServiceGraphitiAuthority {
  identity: Readonly<{ credentialId: string; agentId: string; sensitivityCeiling: GkxSensitivity }>;
  corpusId: string;
  generation: number;
  policyDigest: `sha256:${string}`;
  /** SHA-256 of JSON.stringify([clearance, sorted [source_id, source_digest] pairs]). */
  authorizedScopeDigest: `sha256:${string}`;
  sources: readonly Readonly<ServiceGraphitiSource>[];
}

export interface ServiceGraphitiSearchInput {
  requestId: string;
  query: string;
  limit: number;
  signal: AbortSignal;
  authority: Readonly<ServiceGraphitiAuthority>;
}

/** Trusted host callback. Callers never supply authority, scope or backend coordinates. */
export type ServiceGraphitiSearch = (input: Readonly<ServiceGraphitiSearchInput>) => Promise<GraphitiQueryResult | null>;

export interface ServiceGraphitiExecutionRequest { requestId: string; query: string; limit: number }
export type ServiceGraphitiExecutionSearch = (request: Readonly<ServiceGraphitiExecutionRequest>) => Promise<GraphitiQueryResult | null>;
