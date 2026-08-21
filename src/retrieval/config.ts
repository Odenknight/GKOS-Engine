import { access, lstat, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createRerankProvider, createVectorProvider, type ProviderAdapterDependencies } from "./providers";
import { retrievalCanonicalDigest, stableJson } from "./digest";
import type { RerankProvider, RerankProviderConfig, VectorProvider, VectorProviderConfig } from "./types";

export const GKOS_HOST_CONFIG_VERSION = 1 as const;
export type TrustedConfigProvenance = "explicit" | "trusted_cwd" | "workspace_root" | "user";
export type ParsedGkosToml = Record<string, Record<string, string | number | boolean | string[]>>;

export interface TrustedConfigDiscoveryOptions {
  explicit_config?: string;
  trust_cwd?: boolean;
  cwd?: string;
  workspace_root?: string;
  vault_root?: string;
  user_config_path?: string;
}

export interface TrustedGkosConfig {
  path: string;
  provenance: TrustedConfigProvenance;
  document: ParsedGkosToml;
  configuration_digest: string;
}

const PROVIDER_KINDS = ["openai_compatible", "local_onnx", "mcp"] as const;

function nonEmptyConfigString(value: unknown, coordinate: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`GKOS_CONFIG_VALUE_INVALID:${coordinate}`);
  return value;
}

function validateProviderSection(sectionName: "vectors" | "reranker", section: Record<string, string | number | boolean | string[]> | undefined): void {
  if (!section) return;
  if (typeof section.enabled !== "boolean") throw new Error(`GKOS_CONFIG_VALUE_INVALID:${sectionName}.enabled`);
  if (!section.enabled) {
    if (Object.keys(section).some((key) => key !== "enabled")) throw new Error(`GKOS_CONFIG_PROVIDER_DISABLED_KEY_INVALID:${sectionName}`);
    return;
  }
  const provider = nonEmptyConfigString(section.provider, `${sectionName}.provider`);
  if (!(PROVIDER_KINDS as readonly string[]).includes(provider)) throw new Error(`GKOS_CONFIG_PROVIDER_INVALID:${sectionName}.provider`);
  nonEmptyConfigString(section.provider_id, `${sectionName}.provider_id`);
  nonEmptyConfigString(section.model_id, `${sectionName}.model_id`);
  if (sectionName === "vectors" && (!Number.isSafeInteger(section.dimensions) || Number(section.dimensions) < 1 || Number(section.dimensions) > 1_000_000)) {
    throw new Error("GKOS_CONFIG_VALUE_INVALID:vectors.dimensions");
  }
  if (section.timeout_ms !== undefined && (!Number.isSafeInteger(section.timeout_ms) || Number(section.timeout_ms) < 1 || Number(section.timeout_ms) > 300_000)) {
    throw new Error(`GKOS_CONFIG_VALUE_INVALID:${sectionName}.timeout_ms`);
  }
  const commonKeys = ["enabled", "provider", "provider_id", "model_id", "timeout_ms", ...(sectionName === "vectors" ? ["dimensions"] : [])];
  const familyKeys = provider === "openai_compatible" ? ["endpoint", "token_env"] : provider === "local_onnx" ? ["model_path"] : ["server", "tool"];
  const allowed = new Set([...commonKeys, ...familyKeys]);
  for (const key of Object.keys(section)) if (!allowed.has(key)) throw new Error(`GKOS_CONFIG_PROVIDER_KEY_INVALID:${sectionName}.${key}`);
  if (provider === "openai_compatible") {
    const endpoint = nonEmptyConfigString(section.endpoint, `${sectionName}.endpoint`);
    const endpointInvalid = () => new Error(`GKOS_CONFIG_VALUE_INVALID:${sectionName}.endpoint`);
    if (!/^https?:\/\//u.test(endpoint) || /[\\\s\u0000-\u001f\u007f]/u.test(endpoint)) throw endpointInvalid();
    const authority = endpoint.slice(endpoint.indexOf("//") + 2).split(/[/?#]/u, 1)[0];
    if (!authority || authority.includes("@")) throw endpointInvalid();
    let parsed: URL;
    try { parsed = new URL(endpoint); } catch { throw endpointInvalid(); }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) throw endpointInvalid();
    if (section.token_env !== undefined) nonEmptyConfigString(section.token_env, `${sectionName}.token_env`);
  } else if (provider === "local_onnx") {
    nonEmptyConfigString(section.model_path, `${sectionName}.model_path`);
  } else {
    nonEmptyConfigString(section.server, `${sectionName}.server`);
    nonEmptyConfigString(section.tool, `${sectionName}.tool`);
  }
}

function stripComment(line: string): string {
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    let slashes = 0;
    for (let prior = index - 1; prior >= 0 && line[prior] === "\\"; prior--) slashes++;
    if (quote === null && (char === "'" || char === '"')) quote = char;
    else if (quote === "'" && char === "'") quote = null;
    else if (quote === '"' && char === '"' && slashes % 2 === 0) quote = null;
    if (char === "#" && quote === null) return line.slice(0, index);
  }
  return line;
}

function assertTomlStringCharacters(value: string): void {
  // stableJson supplies the shared cross-language well-formed UTF-16 gate.
  try { stableJson(value); }
  catch { throw new Error("GKOS_CONFIG_UNICODE_STRING_INVALID"); }
}

function parseBasicString(raw: string): string {
  if (raw.length < 2 || raw[0] !== '"' || raw.at(-1) !== '"') throw new Error("GKOS_CONFIG_BASIC_STRING_INVALID");
  let output = "";
  for (let index = 1; index < raw.length - 1; index++) {
    const char = raw[index];
    if (char === '"') throw new Error("GKOS_CONFIG_BASIC_STRING_INVALID");
    if (char !== "\\") {
      if (/[\u0000-\u0008\u000a-\u001f\u007f]/u.test(char)) throw new Error("GKOS_CONFIG_STRING_CONTROL_INVALID");
      output += char;
      continue;
    }
    const escape = raw[++index];
    if (escape === undefined || index >= raw.length - 1) throw new Error("GKOS_CONFIG_BASIC_STRING_ESCAPE_INVALID");
    const simple: Record<string, string> = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };
    if (Object.hasOwn(simple, escape)) { output += simple[escape]; continue; }
    if (escape !== "u" && escape !== "U") throw new Error("GKOS_CONFIG_BASIC_STRING_ESCAPE_INVALID");
    const width = escape === "u" ? 4 : 8;
    const digits = raw.slice(index + 1, index + 1 + width);
    if (digits.length !== width || !/^[0-9A-Fa-f]+$/u.test(digits)) throw new Error("GKOS_CONFIG_UNICODE_ESCAPE_INVALID");
    const codePoint = Number.parseInt(digits, 16);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) throw new Error("GKOS_CONFIG_UNICODE_ESCAPE_INVALID");
    output += String.fromCodePoint(codePoint);
    index += width;
  }
  assertTomlStringCharacters(output);
  return output;
}

function parseLiteralString(raw: string): string {
  if (raw.length < 2 || raw[0] !== "'" || raw.at(-1) !== "'" || raw.slice(1, -1).includes("'")) throw new Error("GKOS_CONFIG_LITERAL_STRING_INVALID");
  const output = raw.slice(1, -1);
  if (/[\u0000-\u0008\u000a-\u001f\u007f]/u.test(output)) throw new Error("GKOS_CONFIG_STRING_CONTROL_INVALID");
  assertTomlStringCharacters(output);
  return output;
}

function findArrayStringEnd(value: string, offset: number): number {
  const quote = value[offset];
  for (let index = offset + 1; index < value.length; index++) {
    if (quote === "'" && value[index] === "'") return index;
    if (quote === '"' && value[index] === '"') {
      let slashes = 0;
      for (let prior = index - 1; prior > offset && value[prior] === "\\"; prior--) slashes++;
      if (slashes % 2 === 0) return index;
    }
  }
  return -1;
}

function parseValue(raw: string): string | number | boolean | string[] {
  const value = raw.trim();
  if (value.startsWith('"')) return parseBasicString(value);
  if (value.startsWith("'")) return parseLiteralString(value);
  if (value === "true" || value === "false") return value === "true";
  if (/^[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || (Number.isInteger(numeric) && !Number.isSafeInteger(numeric))) throw new Error("GKOS_CONFIG_NUMBER_INVALID");
    return numeric;
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    const out: string[] = [];
    let offset = 0;
    while (offset < inner.length) {
      while (/\s/u.test(inner[offset] ?? "")) offset++;
      const quote = inner[offset];
      if (quote !== '"' && quote !== "'") throw new Error("GKOS_CONFIG_ARRAY_INVALID");
      const end = findArrayStringEnd(inner, offset);
      if (end < 0) throw new Error("GKOS_CONFIG_ARRAY_INVALID");
      out.push(quote === '"' ? parseBasicString(inner.slice(offset, end + 1)) : parseLiteralString(inner.slice(offset, end + 1)));
      offset = end + 1;
      while (/\s/u.test(inner[offset] ?? "")) offset++;
      if (offset === inner.length) break;
      if (inner[offset] !== ",") throw new Error("GKOS_CONFIG_ARRAY_INVALID");
      offset++;
      if (!inner.slice(offset).trim()) throw new Error("GKOS_CONFIG_ARRAY_TRAILING_COMMA_UNSUPPORTED");
    }
    return out;
  }
  throw new Error("GKOS_CONFIG_VALUE_UNSUPPORTED");
}

const INTEGER_CONFIG_COORDINATES = new Set([
  "config_version", "service.port", "agents.activity_retention_days", "retrieval.max_tokens",
  "retrieval.overlap_tokens", "retrieval.parent_expansion_max_child_tokens", "retrieval.rrf_k",
  "retrieval.lexical_top_k", "retrieval.semantic_top_k", "vectors.dimensions", "vectors.timeout_ms",
  "reranker.timeout_ms", "watcher.debounce_ms",
]);

/** Dependency-light strict subset sufficient for the versioned host config. */
export function parseGkosToml(text: string): ParsedGkosToml {
  const document: ParsedGkosToml = { "": {} };
  const declaredSections = new Set<string>();
  let section = "";
  for (const [lineIndex, source] of text.replace(/^\uFEFF/u, "").split(/\r?\n/u).entries()) {
    const line = stripComment(source).trim();
    if (!line) continue;
    const heading = /^\[([A-Za-z0-9_.-]+)\]$/u.exec(line);
    if (heading) {
      section = heading[1];
      if (declaredSections.has(section)) throw new Error(`GKOS_CONFIG_DUPLICATE_SECTION:${section}`);
      declaredSections.add(section);
      document[section] ??= {};
      continue;
    }
    const assignment = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/u.exec(line);
    if (!assignment) throw new Error(`GKOS_CONFIG_SYNTAX_ERROR:${lineIndex + 1}`);
    const [, key, raw] = assignment;
    if (Object.hasOwn(document[section], key)) throw new Error(`GKOS_CONFIG_DUPLICATE_KEY:${section}.${key}`);
    const parsed = parseValue(raw);
    const coordinate = section ? `${section}.${key}` : key;
    if (INTEGER_CONFIG_COORDINATES.has(coordinate) && typeof parsed === "number" && !/^[+-]?(?:0|[1-9][0-9]*)$/u.test(raw.trim())) {
      throw new Error(`GKOS_CONFIG_INTEGER_SYNTAX_INVALID:${coordinate}`);
    }
    document[section][key] = parsed;
  }
  if (document[""]?.config_version !== GKOS_HOST_CONFIG_VERSION) throw new Error("GKOS_CONFIG_VERSION_UNSUPPORTED");
  const known: Record<string, Set<string>> = {
    "": new Set(["config_version"]),
    service: new Set(["transport", "host", "port", "legacy_rest"]),
    agents: new Set(["multi_agent", "require_authentication", "activity_retention_days"]),
    retrieval: new Set(["mode", "max_tokens", "overlap_tokens", "parent_expansion", "parent_expansion_max_child_tokens", "mmr", "mmr_lambda", "rrf_k", "lexical_top_k", "semantic_top_k", "path_include", "path_exclude"]),
    vectors: new Set(["enabled", "provider", "provider_id", "model_id", "dimensions", "timeout_ms", "endpoint", "token_env", "model_path", "server", "tool"]),
    reranker: new Set(["enabled", "provider", "provider_id", "model_id", "timeout_ms", "endpoint", "token_env", "model_path", "server", "tool"]),
    graph: new Set(["sqlite_projection", "graphiti_projection", "similarity_projection"]),
    watcher: new Set(["enabled", "debounce_ms", "startup_reconciliation"]),
  };
  for (const [section, values] of Object.entries(document)) {
    if (!known[section]) throw new Error(`GKOS_CONFIG_SECTION_UNKNOWN:${section}`);
    for (const key of Object.keys(values)) if (!known[section].has(key)) throw new Error(`GKOS_CONFIG_KEY_UNKNOWN:${section}.${key}`);
  }
  const booleans = new Set(["service.legacy_rest", "agents.multi_agent", "agents.require_authentication", "retrieval.parent_expansion", "retrieval.mmr", "vectors.enabled", "reranker.enabled", "graph.sqlite_projection", "graph.graphiti_projection", "graph.similarity_projection", "watcher.enabled", "watcher.startup_reconciliation"]);
  const numbers = new Set(["service.port", "agents.activity_retention_days", "retrieval.max_tokens", "retrieval.overlap_tokens", "retrieval.parent_expansion_max_child_tokens", "retrieval.mmr_lambda", "retrieval.rrf_k", "retrieval.lexical_top_k", "retrieval.semantic_top_k", "vectors.dimensions", "vectors.timeout_ms", "reranker.timeout_ms", "watcher.debounce_ms"]);
  const arrays = new Set(["retrieval.path_include", "retrieval.path_exclude"]);
  for (const [section, values] of Object.entries(document)) {
    for (const [key, value] of Object.entries(values)) {
      const coordinate = section ? `${section}.${key}` : key;
      if (coordinate === "config_version") continue;
      if (booleans.has(coordinate) && typeof value !== "boolean") throw new Error(`GKOS_CONFIG_TYPE_INVALID:${coordinate}`);
      if (numbers.has(coordinate) && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`GKOS_CONFIG_TYPE_INVALID:${coordinate}`);
      if (arrays.has(coordinate) && (!Array.isArray(value) || value.some((entry) => typeof entry !== "string"))) throw new Error(`GKOS_CONFIG_TYPE_INVALID:${coordinate}`);
      if (!booleans.has(coordinate) && !numbers.has(coordinate) && !arrays.has(coordinate) && typeof value !== "string") throw new Error(`GKOS_CONFIG_TYPE_INVALID:${coordinate}`);
    }
  }
  validateProviderSection("vectors", document.vectors);
  validateProviderSection("reranker", document.reranker);
  const parentThreshold = document.retrieval?.parent_expansion_max_child_tokens;
  if (parentThreshold !== undefined && (!Number.isSafeInteger(parentThreshold) || Number(parentThreshold) < 1 || Number(parentThreshold) > 4096)) throw new Error("GKOS_CONFIG_VALUE_INVALID:retrieval.parent_expansion_max_child_tokens");
  return document;
}

async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

const samePath = (left: string, right: string): boolean => process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;

function isAtOrWithinPath(candidate: string, root: string): boolean {
  const relation = relative(resolve(root), resolve(candidate));
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(relation));
}

async function readConfigBytes(path: string): Promise<string> {
  const absolute = resolve(path);
  const link = await lstat(absolute);
  if (!link.isFile() || link.isSymbolicLink() || link.size > 1_048_576 || (await stat(absolute)).nlink > 1) throw new Error("GKOS_CONFIG_ALIAS_OR_SIZE_REJECTED");
  if (!samePath(await realpath(absolute), absolute)) throw new Error("GKOS_CONFIG_ALIAS_REJECTED");
  return readFile(absolute, "utf8");
}

async function readTrusted(path: string, provenance: TrustedConfigProvenance): Promise<TrustedGkosConfig> {
  const absolute = resolve(path);
  const document = parseGkosToml(await readConfigBytes(absolute));
  for (const section of ["vectors", "reranker"]) {
    if (typeof document[section]?.token === "string") throw new Error("GKOS_CONFIG_LITERAL_SECRET_REJECTED");
  }
  return { path: absolute, provenance, document, configuration_digest: retrievalCanonicalDigest(document) };
}

async function findWorkspaceRoot(start: string): Promise<string | undefined> {
  let current = resolve(start);
  while (true) {
    if (await exists(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function defaultUserConfigPath(): string {
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "gkos", "gkos.toml");
  if (process.platform === "win32" && process.env.APPDATA) return join(process.env.APPDATA, "GKOS", "gkos.toml");
  return join(homedir(), ".config", "gkos", "gkos.toml");
}

const SAFE_VAULT_RETRIEVAL_KEYS = new Set(["parent_expansion", "parent_expansion_max_child_tokens", "mmr", "rrf_k", "lexical_top_k", "semantic_top_k", "path_include", "path_exclude"]);

export async function rejectUnsafeVaultConfig(vaultRoot: string, selectedTrustedPath?: string): Promise<void> {
  const candidate = resolve(vaultRoot, "gkos.toml");
  if (!(await exists(candidate)) || (selectedTrustedPath && samePath(candidate, resolve(selectedTrustedPath)))) return;
  const document = parseGkosToml(await readConfigBytes(candidate));
  for (const [section, values] of Object.entries(document)) {
    if (section === "" && Object.keys(values).every((key) => key === "config_version")) continue;
    if (section === "retrieval" && Object.keys(values).every((key) => SAFE_VAULT_RETRIEVAL_KEYS.has(key))) continue;
    throw new Error("UNTRUSTED_VAULT_CONFIG_SHADOWING_REJECTED");
  }
}

/** Ordered trusted discovery; an arbitrary vault-local file is never a provider source. */
export async function discoverTrustedGkosConfig(options: TrustedConfigDiscoveryOptions = {}): Promise<TrustedGkosConfig | null> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const workspace = options.workspace_root ? resolve(options.workspace_root) : await findWorkspaceRoot(cwd);
  const workspaceConfig = workspace ? join(workspace, "gkos.toml") : undefined;
  // A vault may itself be a Git repository. Automatic repository discovery
  // cannot promote its provider/service config into trusted operator config;
  // only an explicitly supplied workspace_root, explicit config, or opted-in
  // trusted CWD may do that.
  const trustedWorkspaceConfig = workspaceConfig && (!options.vault_root || options.workspace_root || !isAtOrWithinPath(workspaceConfig, options.vault_root))
    ? workspaceConfig
    : undefined;
  const candidates: Array<[string | undefined, TrustedConfigProvenance]> = [
    [options.explicit_config, "explicit"],
    [options.trust_cwd ? join(cwd, "gkos.toml") : undefined, "trusted_cwd"],
    [trustedWorkspaceConfig, "workspace_root"],
    [options.user_config_path ?? defaultUserConfigPath(), "user"],
  ];
  if (options.explicit_config && !(await exists(options.explicit_config))) throw new Error("EXPLICIT_GKOS_CONFIG_NOT_FOUND");
  let selected: TrustedGkosConfig | null = null;
  for (const [path, provenance] of candidates) {
    if (path && await exists(path)) { selected = await readTrusted(path, provenance); break; }
  }
  if (options.vault_root) await rejectUnsafeVaultConfig(options.vault_root, selected?.path);
  return selected;
}

function stringValue(section: Record<string, unknown>, key: string, required = true): string | undefined {
  const value = section[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !value) throw new Error(`GKOS_CONFIG_${key.toUpperCase()}_REQUIRED`);
  return value;
}

function numberValue(section: Record<string, unknown>, key: string, fallback?: number): number {
  const value = section[key] ?? fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`GKOS_CONFIG_${key.toUpperCase()}_INVALID`);
  return value;
}

function providerConfigFromTrustedConfig(config: TrustedGkosConfig, sectionName: "vectors"): VectorProviderConfig | undefined;
function providerConfigFromTrustedConfig(config: TrustedGkosConfig, sectionName: "reranker"): RerankProviderConfig | undefined;
function providerConfigFromTrustedConfig(config: TrustedGkosConfig, sectionName: "vectors" | "reranker"): VectorProviderConfig | RerankProviderConfig | undefined {
  const section = config.document[sectionName] ?? {};
  if (section.enabled !== true) return undefined;
  const kind = stringValue(section, "provider") as VectorProviderConfig["kind"];
  if (!(PROVIDER_KINDS as readonly string[]).includes(kind)) throw new Error("GKOS_CONFIG_PROVIDER_INVALID");
  const commonKeys = new Set(["enabled", "provider", "provider_id", "model_id", "timeout_ms", ...(sectionName === "vectors" ? ["dimensions"] : [])]);
  const kindKeys = kind === "openai_compatible" ? ["endpoint", "token_env"] : kind === "local_onnx" ? ["model_path"] : ["server", "tool"];
  const allowedKeys = new Set([...commonKeys, ...kindKeys]);
  for (const key of Object.keys(section)) if (!allowedKeys.has(key)) throw new Error(`GKOS_CONFIG_PROVIDER_KEY_INVALID:${sectionName}.${key}`);
  const common = {
    kind,
    configuration_provenance: "trusted_operator" as const,
    provider_id: stringValue(section, "provider_id")!,
    model_id: stringValue(section, "model_id")!,
    timeout_ms: numberValue(section, "timeout_ms", 15_000),
  };
  const dimensions = sectionName === "vectors" ? { dimensions: numberValue(section, "dimensions") } : {};
  if (kind === "openai_compatible") {
    const tokenEnvironment = stringValue(section, "token_env", false);
    const token = tokenEnvironment ? process.env[tokenEnvironment] : undefined;
    if (tokenEnvironment && (!token || token.trim().length === 0)) throw new Error(`GKOS_CONFIG_SECRET_UNAVAILABLE:${sectionName}.token_env`);
    return { ...common, ...dimensions, kind, endpoint: stringValue(section, "endpoint")!, ...(tokenEnvironment ? { token } : {}) } as VectorProviderConfig | RerankProviderConfig;
  }
  if (kind === "local_onnx") return { ...common, ...dimensions, kind, model_path: stringValue(section, "model_path")! } as VectorProviderConfig | RerankProviderConfig;
  return {
    ...common,
    ...dimensions,
    kind,
    server: stringValue(section, "server")!,
    ...(sectionName === "vectors" ? { embedding_tool: stringValue(section, "tool")! } : { rerank_tool: stringValue(section, "tool")! }),
  } as VectorProviderConfig | RerankProviderConfig;
}

export interface ConfiguredVectorProviderIdentity {
  readonly kind: VectorProvider["kind"];
  readonly provider_id: string;
  readonly model_id: string;
  readonly dimensions: number;
  readonly timeout_ms: number;
}

export interface ConfiguredRerankProviderIdentity {
  readonly kind: RerankProvider["kind"];
  readonly provider_id: string;
  readonly model_id: string;
  readonly timeout_ms: number;
}

/** Secret-free runtime identity for status and explicit degraded-stage reporting. */
export function configuredProviderIdentityFromTrustedConfig(config: TrustedGkosConfig, sectionName: "vectors"): ConfiguredVectorProviderIdentity | undefined;
export function configuredProviderIdentityFromTrustedConfig(config: TrustedGkosConfig, sectionName: "reranker"): ConfiguredRerankProviderIdentity | undefined;
export function configuredProviderIdentityFromTrustedConfig(
  config: TrustedGkosConfig,
  sectionName: "vectors" | "reranker",
): ConfiguredVectorProviderIdentity | ConfiguredRerankProviderIdentity | undefined {
  const provider = sectionName === "vectors"
    ? providerConfigFromTrustedConfig(config, "vectors")
    : providerConfigFromTrustedConfig(config, "reranker");
  if (!provider) return undefined;
  return Object.freeze({
    kind: provider.kind,
    provider_id: provider.provider_id,
    model_id: provider.model_id,
    ...(sectionName === "vectors" ? { dimensions: (provider as VectorProviderConfig).dimensions } : {}),
    timeout_ms: provider.timeout_ms ?? 15_000,
  }) as ConfiguredVectorProviderIdentity | ConfiguredRerankProviderIdentity;
}

export function selectConfiguredVectorProvider(config: TrustedGkosConfig, dependencies: ProviderAdapterDependencies = {}): VectorProvider | undefined {
  const provider = providerConfigFromTrustedConfig(config, "vectors");
  return provider ? createVectorProvider(provider, dependencies) : undefined;
}

export function selectConfiguredRerankProvider(config: TrustedGkosConfig, dependencies: ProviderAdapterDependencies = {}): RerankProvider | undefined {
  const provider = providerConfigFromTrustedConfig(config, "reranker");
  return provider ? createRerankProvider(provider, dependencies) : undefined;
}

export function selectConfiguredProviders(config: TrustedGkosConfig, dependencies: ProviderAdapterDependencies = {}): { vector?: VectorProvider; reranker?: RerankProvider } {
  const vector = selectConfiguredVectorProvider(config, dependencies);
  const reranker = selectConfiguredRerankProvider(config, dependencies);
  return {
    ...(vector ? { vector } : {}),
    ...(reranker ? { reranker } : {}),
  };
}
