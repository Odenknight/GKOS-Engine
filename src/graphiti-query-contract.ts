import type { DiscoverabilityDecision } from "./retrieval/types";

/** Draft wire contract only: these checks do not authorize or execute a query. */
export const GRAPHITI_QUERY_CONTRACT_VERSION = "gkos-graphiti-query/1.0.0-draft.1" as const;

export interface GraphitiQueryBinding {
  corpus_id: string;
  scope_digest: string;
  policy_digest: string;
  source_snapshot_digest: string;
  projection_id: string;
  /** Digest of the exact adapter, backend, extraction, embedding and reranking configuration. */
  configuration_digest: string;
}

export interface GraphitiQueryRequest {
  contract_version: typeof GRAPHITI_QUERY_CONTRACT_VERSION;
  request_id: string;
  binding: GraphitiQueryBinding;
  query: string;
  limit: number;
}

export interface GraphitiQueryCitation {
  projection_episode_id: string;
  source_id: string;
  source_digest: string;
}

export interface GraphitiQueryResult {
  contract_version: typeof GRAPHITI_QUERY_CONTRACT_VERSION;
  request_id: string;
  binding: GraphitiQueryBinding;
  hits: Array<{
    fact: string;
    semantic_support: "unverified";
    citations: GraphitiQueryCitation[];
  }>;
}

export interface GraphitiQueryStatus {
  contract_version: typeof GRAPHITI_QUERY_CONTRACT_VERSION;
  mode: "native-only" | "query-only" | "managed" | "unavailable";
  searchable: boolean;
  binding: GraphitiQueryBinding | null;
}

/**
 * Trusted host input, never a wire request or provider-supplied status.
 * The existing source/chunk policy authority must derive the decision and
 * complete episode dependency map for this principal and immutable generation.
 * A group ID or this interface is not an authorization capability.
 */
export interface GraphitiQueryContext {
  status: GraphitiQueryStatus;
  decision: DiscoverabilityDecision;
  /** False until the host verifies every dependency in this scoped projection. */
  complete_dependency_scope: boolean;
  authorized_episodes: ReadonlyMap<string, { source_id: string; source_digest: string }>;
}

const bindingKeys = ["corpus_id", "scope_digest", "policy_digest", "source_snapshot_digest", "projection_id", "configuration_digest"] as const;
const digestKeys = ["scope_digest", "policy_digest", "source_snapshot_digest", "configuration_digest"] as const;
const sha256 = /^sha256:[0-9a-f]{64}$/;
const encoder = new TextEncoder();

function record(value: unknown, keys: readonly string[]): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function text(value: unknown, maxBytes: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxBytes &&
    encoder.encode(value).length <= maxBytes && !/[\u0000-\u001f\u007f]/u.test(value);
}

function binding(value: unknown): value is GraphitiQueryBinding {
  return record(value, bindingKeys) && text(value.corpus_id, 128) && text(value.projection_id, 128) &&
    digestKeys.every(key => typeof value[key] === "string" && sha256.test(value[key]));
}

function ready(context: GraphitiQueryContext): boolean {
  const status = context?.status;
  return context?.decision === "allow" && context.complete_dependency_scope === true &&
    status?.contract_version === GRAPHITI_QUERY_CONTRACT_VERSION && status.searchable === true &&
    (status.mode === "query-only" || status.mode === "managed") && binding(status.binding);
}

function requestValid(value: unknown): value is GraphitiQueryRequest {
  return record(value, ["contract_version", "request_id", "binding", "query", "limit"]) &&
    value.contract_version === GRAPHITI_QUERY_CONTRACT_VERSION && text(value.request_id, 128) &&
    text(value.query, 4096) && Number.isInteger(value.limit) && value.limit >= 1 && value.limit <= 50 && binding(value.binding);
}

/** Preflight shape/readiness check. The host must authorize before provider invocation. */
export function prepareGraphitiQueryRequest(
  query: string, limit: number, requestId: string, context: GraphitiQueryContext,
): GraphitiQueryRequest | null {
  if (!ready(context)) return null;
  const request = {
    contract_version: GRAPHITI_QUERY_CONTRACT_VERSION,
    request_id: requestId,
    binding: { ...context.status.binding! },
    query,
    limit,
  };
  return requestValid(request) ? request : null;
}

/**
 * Validate bounded JSON against the original request and freshly reauthorized
 * host context AFTER awaiting the provider. Returns no partial results and no
 * provider diagnostics. Does not verify entailment, bytes, or scope itself.
 * The host must retain its request privately and publish synchronously after
 * this check (or recheck after any further await).
 */
export function acceptGraphitiQueryResult(
  request: GraphitiQueryRequest, responseJson: string, current: GraphitiQueryContext,
): GraphitiQueryResult | null {
  if (!requestValid(request) || !ready(current) ||
      bindingKeys.some(key => request.binding[key] !== current.status.binding![key])) return null;
  // Bound parsing work as well as accepted UTF-8 response bytes. Transport must
  // independently bound streaming/download bytes before creating this string.
  if (typeof responseJson !== "string" || responseJson.length > 131072 || encoder.encode(responseJson).length > 131072) return null;
  let result: unknown;
  try { result = JSON.parse(responseJson); } catch { return null; }
  if (!record(result, ["contract_version", "request_id", "binding", "hits"]) ||
      result.contract_version !== GRAPHITI_QUERY_CONTRACT_VERSION || result.request_id !== request.request_id ||
      !binding(result.binding) || bindingKeys.some(key => result.binding[key] !== request.binding[key]) ||
      !Array.isArray(result.hits) || result.hits.length > request.limit) return null;
  for (const hit of result.hits) {
    if (!record(hit, ["fact", "semantic_support", "citations"]) || !text(hit.fact, 4096) ||
        hit.semantic_support !== "unverified" || !Array.isArray(hit.citations) ||
        hit.citations.length < 1 || hit.citations.length > 16) return null;
    const seen = new Set<string>();
    for (const citation of hit.citations) {
      if (!record(citation, ["projection_episode_id", "source_id", "source_digest"]) ||
          !text(citation.projection_episode_id, 128) || !text(citation.source_id, 128) ||
          typeof citation.source_digest !== "string" || !sha256.test(citation.source_digest) ||
          seen.has(citation.projection_episode_id)) return null;
      seen.add(citation.projection_episode_id);
      const authorized = current.authorized_episodes.get(citation.projection_episode_id);
      if (!authorized || authorized.source_id !== citation.source_id || authorized.source_digest !== citation.source_digest) return null;
    }
  }
  return result as unknown as GraphitiQueryResult;
}
