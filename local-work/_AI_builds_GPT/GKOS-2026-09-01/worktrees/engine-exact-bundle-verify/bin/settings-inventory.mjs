// Operator-only inventory. No config values, paths, tokens or provider requests are emitted.
export const TOML_SETTINGS = [
  ['config_version', '1', 'Schema version, not a runtime toggle'],
  ['service.transport', 'unbound', 'Not consumed by the desktop helper or gkx'],
  ['service.host', 'unbound', 'Desktop always binds 127.0.0.1; use no host override'],
  ['service.port', 'unbound', 'Desktop uses --port, not this key'],
  ['service.legacy_rest', 'unbound', 'Desktop routes are code/credential controlled'],
  ['agents.multi_agent', 'unbound', 'Credential registry controls identities'],
  ['agents.require_authentication', 'unbound', 'Desktop authentication cannot be disabled'],
  ['agents.activity_retention_days', 'unbound', 'Service event ring is bounded in memory, not day-based'],
  ['retrieval.mode', 'derived', 'CLI derives fts/hybrid from configured vector identity; this key is ignored'],
  ['retrieval.max_tokens', '400', 'Chunk size: integer 16..4096'],
  ['retrieval.overlap_tokens', '0', 'Integer 0..max_tokens-1'],
  ['retrieval.parent_expansion', 'true', 'Search-time parent expansion'],
  ['retrieval.parent_expansion_max_child_tokens', '80', 'Expansion threshold: integer 1..4096'],
  ['retrieval.mmr', 'false', 'Search diversity stage'],
  ['retrieval.mmr_lambda', '0.7', 'Diversity/relevance balance: 0..1'],
  ['retrieval.rrf_k', '60', 'Fusion constant: positive safe integer'],
  ['retrieval.lexical_top_k', 'max(20, limit*4)', 'Lexical candidate window; integer limit..10000'],
  ['retrieval.semantic_top_k', 'max(20, limit*4)', 'Semantic candidate window; integer limit..10000; requires vector runtime'],
  ['retrieval.path_include', 'no extra include filter', 'Search-time portable glob list; not an admission override'],
  ['retrieval.path_exclude', 'no extra exclude filter', 'Search-time portable glob list; not a vault repair'],
  ...['vectors', 'reranker'].flatMap(section => [
    ['enabled', 'false / section omitted', 'If section exists, enabled is required; disabled permits no other keys'],
    ['provider', 'required when enabled', 'openai_compatible, local_onnx or mcp; adapter availability is separate'],
    ['provider_id', 'required when enabled', 'Operator-selected identity; not proof of runtime readiness'],
    ['model_id', 'required when enabled', 'Provider model identity'],
    ...(section === 'vectors' ? [['dimensions', 'required when enabled', 'Integer 1..1000000; must match returned vectors']] : []),
    ['timeout_ms', '15000', 'Integer 1..300000'],
    ['endpoint', 'required for openai_compatible', 'HTTP(S), no userinfo; never included in inspector output'],
    ['token_env', 'optional for openai_compatible', 'Environment variable NAME; if named, a nonempty secret must exist at execution'],
    ['model_path', 'required for local_onnx', 'Needs an injected local adapter; a path does not install a runtime'],
    ['server', 'required for mcp', 'Needs an injected MCP adapter'],
    ['tool', 'required for mcp', 'Needs an injected MCP adapter'],
  ].map(([key, fallback, description]) => [`${section}.${key}`, fallback, description])),
  ['graph.sqlite_projection', 'unbound', 'No TOML consumer in these executables'],
  ['graph.graphiti_projection', 'unbound', 'Graphiti export is an explicit CLI operation'],
  ['graph.similarity_projection', 'unbound', 'No TOML consumer in these executables'],
  ['watcher.enabled', 'unbound', 'Desktop watcher lifecycle is host controlled'],
  ['watcher.debounce_ms', 'unbound', 'Desktop uses fixed 500ms debounce'],
  ['watcher.startup_reconciliation', 'unbound', 'Desktop startup reconciliation is mandatory'],
].map(([key, fallback, description]) => Object.freeze({ key, default: fallback, description }));

export const SETTINGS_RUNTIMES = ['desktop', 'cli-search', 'cli-index'];
export function settingSupport(key, runtime) {
  if (!SETTINGS_RUNTIMES.includes(runtime)) throw new Error('GKOS_SETTINGS_RUNTIME_INVALID');
  if (runtime === 'desktop') return 'NOT_LOADED';
  if (key === 'config_version') return 'VALIDATED';
  if (key.startsWith('retrieval.') && key !== 'retrieval.mode') {
    if (runtime === 'cli-index' && !['retrieval.max_tokens', 'retrieval.overlap_tokens'].includes(key)) return 'METADATA_ONLY';
    return 'WIRED';
  }
  if (key.startsWith('vectors.')) return 'PROVIDER_DEPENDENT';
  if (key.startsWith('reranker.') && runtime === 'cli-search') return 'PROVIDER_DEPENDENT';
  return 'IGNORED';
}

export function configuredSettings(document, runtime) {
  return TOML_SETTINGS.filter(({key}) => {
    const parts = key.split('.');
    return Object.hasOwn(document[parts.length === 1 ? '' : parts[0]] ?? {}, parts.at(-1));
  }).map(({key}) => ({key, status: settingSupport(key, runtime)}));
}

export function warnInactiveSettings(config, runtime, write = line => process.stderr.write(line)) {
  if (!config) return;
  for (const row of configuredSettings(config.document, runtime)) {
    if (['IGNORED', 'METADATA_ONLY', 'NOT_LOADED'].includes(row.status)) {
      write(`GKOS_SETTING_${row.status}:${row.key}\n`);
    }
  }
}

export const SETTINGS_HELP = `Usage: gkx settings [--runtime desktop|cli-search|cli-index] [--config <trusted-gkos.toml>] [--json]
Lists every accepted TOML coordinate and its runtime ownership (default: desktop).
With --config, validates ONLY that explicit file. Does not scan a vault, discover
ambient configuration, resolve secret values, instantiate providers or prove readiness.
Exit 0: inventory/recognized wiring; 1: configured ignored/not-loaded/metadata-only keys;
2: invalid arguments or configuration. Provider-dependent is NOT an operational pass.
Full flags, environment, deployment and MCP settings: docs/SETTINGS.md.`;

export async function runSettingsCli(argv) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) { console.log(SETTINGS_HELP); return 0; }
  let runtime = 'desktop', explicit;
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (seen.has(flag) || !['--runtime', '--config', '--json'].includes(flag)) { console.error('GKOS_SETTINGS_ARGUMENT_INVALID'); return 2; }
    seen.add(flag);
    if (flag === '--json') continue;
    const value = argv[++i];
    if (!value || value.startsWith('-')) { console.error('GKOS_SETTINGS_ARGUMENT_INVALID'); return 2; }
    if (flag === '--runtime') runtime = value; else explicit = value;
  }
  if (!SETTINGS_RUNTIMES.includes(runtime)) { console.error('GKOS_SETTINGS_RUNTIME_INVALID'); return 2; }
  let configured = [];
  if (explicit) {
    try {
      const {discoverTrustedGkosConfig} = await import('../dist/retrieval.mjs');
      const config = await discoverTrustedGkosConfig({explicit_config: explicit});
      configured = configuredSettings(config.document, runtime);
    } catch { console.error('GKOS_SETTINGS_CONFIG_INVALID'); return 2; }
  }
  const output = {
    schema_version: 'gkos.settings/1', runtime, runtime_readiness: 'NOT_PROBED',
    explicit_config_checked: !!explicit, configured,
    settings: TOML_SETTINGS.map(row => ({...row, status: settingSupport(row.key, runtime)})),
  };
  console.log(seen.has('--json') ? JSON.stringify(output, null, 2) : [SETTINGS_HELP, ...output.settings.map(row => `${row.key}: ${row.status}; default ${row.default}; ${row.description}`)].join('\n'));
  return configured.some(row => ['IGNORED', 'NOT_LOADED', 'METADATA_ONLY'].includes(row.status)) ? 1 : 0;
}
