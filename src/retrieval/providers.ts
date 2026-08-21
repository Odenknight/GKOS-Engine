import { randomUUID } from "node:crypto";
import type {
  LocalOnnxProviderConfig,
  McpProviderConfig,
  OpenAiCompatibleProviderConfig,
  RerankProviderConfig,
  RerankInput,
  RerankProvider,
  RerankScore,
  VectorProvider,
  VectorProviderConfig,
} from "./types";

export interface EmbeddingAdapterResponse {
  request_id: string;
  model_id: string;
  dimensions: number;
  vectors: readonly (readonly number[])[];
}

export interface RerankAdapterResponse {
  request_id: string;
  model_id: string;
  scores: readonly { index: number; score: number }[];
}

export interface ProviderAdapterDependencies {
  fetch?: typeof globalThis.fetch;
  local_embedding_executor?: (request: {
    request_id: string; model_path: string; model_id: string; dimensions: number; texts: readonly string[]; signal: AbortSignal;
  }) => Promise<EmbeddingAdapterResponse>;
  local_rerank_executor?: (request: {
    request_id: string; model_path: string; model_id: string; query: string; inputs: readonly RerankInput[]; signal: AbortSignal;
  }) => Promise<RerankAdapterResponse>;
  mcp_tool_caller?: (request: {
    request_id: string; server: string; tool: string; arguments: Record<string, unknown>; signal: AbortSignal;
  }) => Promise<unknown>;
}

function forwardAbort(external: AbortSignal | undefined, controller: AbortController): () => void {
  if (!external) return () => {};
  const abort = () => controller.abort(external.reason);
  if (external.aborted) abort();
  else external.addEventListener("abort", abort, { once: true });
  return () => external.removeEventListener("abort", abort);
}

async function bounded<T>(invoke: (signal: AbortSignal) => Promise<T>, timeoutMs: number, code: string, external?: AbortSignal): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new RangeError("Provider timeout must be from 1 through 300000 ms.");
  const controller = new AbortController();
  const unlink = forwardAbort(external, controller);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      invoke(controller.signal),
      new Promise<T>((_, reject) => { timer = setTimeout(() => { controller.abort(code); reject(new Error(code)); }, timeoutMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); unlink(); }
}

function requestId(context?: { request_id?: string }): string {
  const value = context?.request_id ?? randomUUID();
  if (!value.trim() || Buffer.byteLength(value, "utf8") > 256) throw new TypeError("Provider request_id must contain from 1 through 256 UTF-8 bytes.");
  return value;
}

function validateEmbeddingResponse(
  response: EmbeddingAdapterResponse,
  expected: { request_id: string; model_id: string; dimensions: number; count: number },
  allowMissingCorrelation = false,
): readonly Float32Array[] {
  if ((!response.request_id && !allowMissingCorrelation) || (response.request_id && response.request_id !== expected.request_id)) throw new Error("EMBEDDING_RESPONSE_CORRELATION_MISMATCH");
  if (response.model_id !== expected.model_id) throw new Error("EMBEDDING_RESPONSE_MODEL_MISMATCH");
  if (response.dimensions !== expected.dimensions) throw new Error("EMBEDDING_RESPONSE_DIMENSION_MISMATCH");
  if (!Array.isArray(response.vectors) || response.vectors.length !== expected.count) throw new Error("EMBEDDING_RESPONSE_ITEM_COUNT_MISMATCH");
  return response.vectors.map((vector) => {
    if (!Array.isArray(vector) && !(vector instanceof Float32Array)) throw new Error("EMBEDDING_RESPONSE_VECTOR_INVALID");
    if (vector.length !== expected.dimensions) throw new Error("EMBEDDING_RESPONSE_DIMENSION_MISMATCH");
    const result = Float32Array.from(vector);
    if ([...result].some((value) => !Number.isFinite(value))) throw new Error("EMBEDDING_RESPONSE_NONFINITE");
    return result;
  });
}

function validateRerankResponse(
  response: RerankAdapterResponse,
  expected: { request_id: string; model_id: string; inputs: readonly RerankInput[] },
  allowMissingCorrelation = false,
): readonly RerankScore[] {
  if ((!response.request_id && !allowMissingCorrelation) || (response.request_id && response.request_id !== expected.request_id)) throw new Error("RERANK_RESPONSE_CORRELATION_MISMATCH");
  if (response.model_id !== expected.model_id) throw new Error("RERANK_RESPONSE_MODEL_MISMATCH");
  if (!Array.isArray(response.scores) || response.scores.length !== expected.inputs.length) throw new Error("RERANK_RESPONSE_ITEM_COUNT_MISMATCH");
  const seen = new Set<number>();
  const out: RerankScore[] = [];
  for (const item of response.scores) {
    if (!Number.isSafeInteger(item.index) || item.index < 0 || item.index >= expected.inputs.length || seen.has(item.index)) throw new Error("RERANK_RESPONSE_INDEX_INVALID");
    if (typeof item.score !== "number" || !Number.isFinite(item.score)) throw new Error("RERANK_RESPONSE_NONFINITE");
    seen.add(item.index);
    out.push({ chunk_id: expected.inputs[item.index].chunk_id, score: item.score });
  }
  return out;
}

function embeddingResponseFromUnknown(value: unknown): EmbeddingAdapterResponse {
  if (!value || typeof value !== "object") throw new Error("EMBEDDING_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  return {
    request_id: String(record.request_id ?? ""),
    model_id: String(record.model_id ?? record.model ?? ""),
    dimensions: Number(record.dimensions),
    vectors: record.vectors as readonly (readonly number[])[],
  };
}

function rerankResponseFromUnknown(value: unknown): RerankAdapterResponse {
  if (!value || typeof value !== "object") throw new Error("RERANK_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  return {
    request_id: String(record.request_id ?? ""),
    model_id: String(record.model_id ?? record.model ?? ""),
    scores: record.scores as readonly { index: number; score: number }[],
  };
}

class OpenAiCompatibleVectorProvider implements VectorProvider {
  readonly #config: OpenAiCompatibleProviderConfig;
  readonly #fetcher: typeof globalThis.fetch;
  readonly kind = "openai_compatible" as const;
  readonly provider_id: string;
  readonly model_id: string;
  readonly dimensions: number;
  readonly timeout_ms: number;
  constructor(config: OpenAiCompatibleProviderConfig, fetcher: typeof globalThis.fetch) {
    this.#config = { ...config };
    this.#fetcher = fetcher;
    this.provider_id = config.provider_id;
    this.model_id = config.model_id;
    this.dimensions = config.dimensions;
    this.timeout_ms = config.timeout_ms ?? 15_000;
  }
  async embed(texts: readonly string[], context?: { request_id?: string; signal?: AbortSignal }): Promise<readonly Float32Array[]> {
    const correlation = requestId(context);
    return bounded(async (signal) => {
      const response = await this.#fetcher(this.#config.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gkos-request-id": correlation,
          ...(this.#config.token ? { authorization: `Bearer ${this.#config.token}` } : {}),
        },
        body: JSON.stringify({ model: this.model_id, input: texts, request_id: correlation }),
        signal,
      });
      if (!response.ok) throw new Error(`EMBEDDING_PROVIDER_HTTP_${response.status}`);
      const raw = await response.json() as Record<string, unknown>;
      const data = Array.isArray(raw.data) ? raw.data as Array<Record<string, unknown>> : null;
      if (data) {
        const seen = new Set<number>();
        for (const item of data) {
          const index = Number(item.index);
          if (!Number.isSafeInteger(index) || index < 0 || index >= texts.length || seen.has(index)) throw new Error("EMBEDDING_RESPONSE_INDEX_INVALID");
          seen.add(index);
        }
      }
      const dimensions = Number(raw.dimensions ?? (data?.[0] && Array.isArray(data[0].embedding) ? data[0].embedding.length : NaN));
      const vectors = data
        ? [...data].sort((a, b) => Number(a.index) - Number(b.index)).map((item) => item.embedding as readonly number[])
        : raw.vectors as readonly (readonly number[])[];
      return validateEmbeddingResponse({
        request_id: String(raw.request_id ?? response.headers.get("x-gkos-request-id") ?? ""),
        model_id: String(raw.model_id ?? raw.model ?? ""),
        dimensions,
        vectors,
      }, { request_id: correlation, model_id: this.model_id, dimensions: this.dimensions, count: texts.length }, true);
    }, this.timeout_ms, "OPENAI_COMPATIBLE_EMBEDDING_TIMEOUT", context?.signal);
  }
}

class LocalOnnxVectorProvider implements VectorProvider {
  readonly kind = "local_onnx" as const;
  readonly provider_id: string;
  readonly model_id: string;
  readonly dimensions: number;
  readonly timeout_ms: number;
  constructor(private readonly config: LocalOnnxProviderConfig, private readonly execute: NonNullable<ProviderAdapterDependencies["local_embedding_executor"]>) {
    this.provider_id = config.provider_id;
    this.model_id = config.model_id;
    this.dimensions = config.dimensions;
    this.timeout_ms = config.timeout_ms ?? 15_000;
  }
  async embed(texts: readonly string[], context?: { request_id?: string; signal?: AbortSignal }): Promise<readonly Float32Array[]> {
    const correlation = requestId(context);
    const response = await bounded((signal) => this.execute({ request_id: correlation, model_path: this.config.model_path, model_id: this.model_id, dimensions: this.dimensions, texts, signal }), this.timeout_ms, "LOCAL_EMBEDDING_TIMEOUT", context?.signal);
    return validateEmbeddingResponse(response, { request_id: correlation, model_id: this.model_id, dimensions: this.dimensions, count: texts.length });
  }
}

class McpVectorProvider implements VectorProvider {
  readonly kind = "mcp" as const;
  readonly provider_id: string;
  readonly model_id: string;
  readonly dimensions: number;
  readonly timeout_ms: number;
  constructor(private readonly config: McpProviderConfig, private readonly call: NonNullable<ProviderAdapterDependencies["mcp_tool_caller"]>) {
    this.provider_id = config.provider_id;
    this.model_id = config.model_id;
    this.dimensions = config.dimensions;
    this.timeout_ms = config.timeout_ms ?? 15_000;
  }
  async embed(texts: readonly string[], context?: { request_id?: string; signal?: AbortSignal }): Promise<readonly Float32Array[]> {
    if (!this.config.embedding_tool) throw new Error("MCP_EMBEDDING_TOOL_UNCONFIGURED");
    const correlation = requestId(context);
    const raw = await bounded((signal) => this.call({ request_id: correlation, server: this.config.server, tool: this.config.embedding_tool!, arguments: { request_id: correlation, model_id: this.model_id, dimensions: this.dimensions, texts }, signal }), this.timeout_ms, "MCP_EMBEDDING_TIMEOUT", context?.signal);
    return validateEmbeddingResponse(embeddingResponseFromUnknown(raw), { request_id: correlation, model_id: this.model_id, dimensions: this.dimensions, count: texts.length });
  }
}

class AdapterRerankProvider implements RerankProvider {
  readonly #config: RerankProviderConfig;
  readonly #dependencies: ProviderAdapterDependencies;
  readonly kind: "openai_compatible" | "local_onnx" | "mcp";
  readonly provider_id: string;
  readonly model_id: string;
  readonly timeout_ms: number;
  constructor(
    config: RerankProviderConfig,
    dependencies: ProviderAdapterDependencies,
  ) {
    this.#config = { ...config };
    this.#dependencies = { ...dependencies };
    this.kind = config.kind;
    this.provider_id = config.provider_id;
    this.model_id = config.model_id;
    this.timeout_ms = config.timeout_ms ?? 15_000;
  }
  async rerank(query: string, inputs: readonly RerankInput[], context?: { request_id?: string; signal?: AbortSignal }): Promise<readonly RerankScore[]> {
    const correlation = requestId(context);
    let raw: RerankAdapterResponse;
    let allowMissingCorrelation = false;
    if (this.#config.kind === "local_onnx") {
      const config = this.#config;
      if (!this.#dependencies.local_rerank_executor) throw new Error("LOCAL_RERANK_EXECUTOR_UNAVAILABLE");
      raw = await bounded((signal) => this.#dependencies.local_rerank_executor!({ request_id: correlation, model_path: config.model_path, model_id: this.model_id, query, inputs, signal }), this.timeout_ms, "LOCAL_RERANK_TIMEOUT", context?.signal);
    } else if (this.#config.kind === "mcp") {
      const config = this.#config;
      if (!this.#dependencies.mcp_tool_caller || !this.#config.rerank_tool) throw new Error("MCP_RERANK_TOOL_UNCONFIGURED");
      raw = rerankResponseFromUnknown(await bounded((signal) => this.#dependencies.mcp_tool_caller!({ request_id: correlation, server: config.server, tool: config.rerank_tool!, arguments: { request_id: correlation, model_id: this.model_id, query, inputs }, signal }), this.timeout_ms, "MCP_RERANK_TIMEOUT", context?.signal));
    } else {
      allowMissingCorrelation = true;
      const config = this.#config;
      const fetcher = this.#dependencies.fetch ?? globalThis.fetch;
      if (!fetcher) throw new Error("FETCH_UNAVAILABLE");
      raw = await bounded(async (signal) => {
        const response = await fetcher(config.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", "x-gkos-request-id": correlation, ...(config.token ? { authorization: `Bearer ${config.token}` } : {}) },
          body: JSON.stringify({ request_id: correlation, model: this.model_id, query, documents: inputs.map((item) => item.text) }),
          signal,
        });
        if (!response.ok) throw new Error(`RERANK_PROVIDER_HTTP_${response.status}`);
        const body = await response.json() as Record<string, unknown>;
        const results = Array.isArray(body.results) ? body.results as Array<Record<string, unknown>> : body.scores as Array<Record<string, unknown>>;
        return {
          request_id: String(body.request_id ?? response.headers.get("x-gkos-request-id") ?? ""),
          model_id: String(body.model_id ?? body.model ?? ""),
          scores: results?.map((item) => ({ index: Number(item.index), score: Number(item.score ?? item.relevance_score) })) ?? [],
        };
      }, this.timeout_ms, "OPENAI_COMPATIBLE_RERANK_TIMEOUT", context?.signal);
    }
    return validateRerankResponse(raw, { request_id: correlation, model_id: this.model_id, inputs }, allowMissingCorrelation);
  }
}

/** Exactly one explicitly selected adapter; no provider preference or silent fallback. */
export function createVectorProvider(config: VectorProviderConfig, dependencies: ProviderAdapterDependencies = {}): VectorProvider {
  if (!config || !["openai_compatible", "local_onnx", "mcp"].includes((config as { kind?: string }).kind ?? "")) throw new Error("VECTOR_PROVIDER_KIND_INVALID");
  if (config.configuration_provenance !== "trusted_operator") throw new Error("UNTRUSTED_PROVIDER_CONFIGURATION");
  if (!validIdentity(config.provider_id) || !validIdentity(config.model_id) || !Number.isSafeInteger(config.dimensions) || config.dimensions <= 0 || config.dimensions > 1_000_000) throw new TypeError("Vector provider identity and positive dimensions are required.");
  validateTimeout(config.timeout_ms);
  if (config.kind === "openai_compatible") {
    validateHttpEndpoint(config.endpoint);
    const fetcher = dependencies.fetch ?? globalThis.fetch;
    if (!fetcher) throw new Error("FETCH_UNAVAILABLE");
    return new OpenAiCompatibleVectorProvider(config, fetcher);
  }
  if (config.kind === "local_onnx") {
    if (!validIdentity(config.model_path, 4096)) throw new TypeError("Local model_path is required.");
    if (!dependencies.local_embedding_executor) throw new Error("LOCAL_EMBEDDING_EXECUTOR_UNAVAILABLE");
    return new LocalOnnxVectorProvider(config, dependencies.local_embedding_executor);
  }
  if (!validIdentity(config.server) || !validIdentity(config.embedding_tool)) throw new TypeError("MCP server and embedding tool are required.");
  if (!dependencies.mcp_tool_caller) throw new Error("MCP_TOOL_CALLER_UNAVAILABLE");
  return new McpVectorProvider(config, dependencies.mcp_tool_caller);
}

function validIdentity(value: unknown, maxBytes = 512): value is string {
  return typeof value === "string" && value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= maxBytes;
}

function validateTimeout(value: number | undefined): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > 300_000)) throw new RangeError("Provider timeout must be from 1 through 300000 ms.");
}

function validateHttpEndpoint(value: unknown): void {
  if (!validIdentity(value, 4096)) throw new TypeError("Provider endpoint is required.");
  if (!/^https?:\/\//u.test(value)) throw new TypeError("Provider endpoint must begin with lowercase http:// or https://.");
  if (/[\\\s\u0000-\u001f\u007f]/u.test(value)) throw new TypeError("Provider endpoint cannot contain whitespace, control characters, or backslashes.");
  const authority = value.slice(value.indexOf("//") + 2).split(/[/?#]/u, 1)[0];
  if (!authority || authority.includes("@")) throw new TypeError("Provider endpoint must contain a nonempty authority without embedded credentials.");
  let url: URL;
  try { url = new URL(value); } catch { throw new TypeError("Provider endpoint must be an absolute URL."); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) throw new TypeError("Provider endpoint must use HTTP or HTTPS with a nonempty host.");
}

export function createRerankProvider(config: RerankProviderConfig, dependencies: ProviderAdapterDependencies = {}): RerankProvider {
  if (!config || !["openai_compatible", "local_onnx", "mcp"].includes((config as { kind?: string }).kind ?? "")) throw new Error("RERANK_PROVIDER_KIND_INVALID");
  if (config.configuration_provenance !== "trusted_operator") throw new Error("UNTRUSTED_PROVIDER_CONFIGURATION");
  if (!validIdentity(config.provider_id) || !validIdentity(config.model_id)) throw new TypeError("Rerank provider identity is required.");
  validateTimeout(config.timeout_ms);
  if (config.kind === "openai_compatible") validateHttpEndpoint(config.endpoint);
  else if (config.kind === "local_onnx" && !validIdentity(config.model_path, 4096)) throw new TypeError("Local model_path is required.");
  else if (config.kind === "mcp" && (!validIdentity(config.server) || !validIdentity(config.rerank_tool))) throw new TypeError("MCP server and rerank tool are required.");
  return new AdapterRerankProvider(config, dependencies);
}
