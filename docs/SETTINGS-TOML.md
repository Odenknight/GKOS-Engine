# Complete TOML setting inventory

Generated from `bin/settings-inventory.mjs`. See [SETTINGS.md](SETTINGS.md) for precedence, bounds and verification caveats. Desktop status is NOT_LOADED for every row. No configured values are disclosed.

| Coordinate | Default / omission | CLI search | CLI index | Meaning |
| --- | --- | --- | --- | --- |
| `config_version` | 1 | VALIDATED | VALIDATED | Schema version, not a runtime toggle |
| `service.transport` | unbound | IGNORED | IGNORED | Not consumed by the desktop helper or gkx |
| `service.host` | unbound | IGNORED | IGNORED | Desktop always binds 127.0.0.1; use no host override |
| `service.port` | unbound | IGNORED | IGNORED | Desktop uses --port, not this key |
| `service.legacy_rest` | unbound | IGNORED | IGNORED | Desktop routes are code/credential controlled |
| `agents.multi_agent` | unbound | IGNORED | IGNORED | Credential registry controls identities |
| `agents.require_authentication` | unbound | IGNORED | IGNORED | Desktop authentication cannot be disabled |
| `agents.activity_retention_days` | unbound | IGNORED | IGNORED | Service event ring is bounded in memory, not day-based |
| `retrieval.mode` | derived | IGNORED | IGNORED | CLI derives fts/hybrid from configured vector identity; this key is ignored |
| `retrieval.max_tokens` | 400 | WIRED | WIRED | Chunk size: integer 16..4096 |
| `retrieval.overlap_tokens` | 0 | WIRED | WIRED | Integer 0..max_tokens-1 |
| `retrieval.parent_expansion` | true | WIRED | METADATA_ONLY | Search-time parent expansion |
| `retrieval.parent_expansion_max_child_tokens` | 80 | WIRED | METADATA_ONLY | Expansion threshold: integer 1..4096 |
| `retrieval.mmr` | false | WIRED | METADATA_ONLY | Search diversity stage |
| `retrieval.mmr_lambda` | 0.7 | WIRED | METADATA_ONLY | Diversity/relevance balance: 0..1 |
| `retrieval.rrf_k` | 60 | WIRED | METADATA_ONLY | Fusion constant: positive safe integer |
| `retrieval.lexical_top_k` | max(20, limit*4) | WIRED | METADATA_ONLY | Lexical candidate window; integer limit..10000 |
| `retrieval.semantic_top_k` | max(20, limit*4) | WIRED | METADATA_ONLY | Semantic candidate window; integer limit..10000; requires vector runtime |
| `retrieval.path_include` | no extra include filter | WIRED | METADATA_ONLY | Search-time portable glob list; not an admission override |
| `retrieval.path_exclude` | no extra exclude filter | WIRED | METADATA_ONLY | Search-time portable glob list; not a vault repair |
| `vectors.enabled` | false / section omitted | PROVIDER_DEPENDENT | PROVIDER_DEPENDENT | If section exists, enabled is required; disabled permits no other keys |
| `vectors.provider` | required when enabled | PROVIDER_DEPENDENT | PROVIDER_DEPENDENT | openai_compatible, local_onnx or mcp; adapter availability is separate |
| `vectors.provider_id` | required when enabled | PROVIDER_DEPENDENT | PROVIDER_DEPENDENT | Operator-selected identity; not proof of runtime readiness |
| `vectors.model_id` | required when enabled | PROVIDER_DEPENDENT | PROVIDER_DEPENDENT | Provider model identity |
| `vectors.dimensions` | required when enabled | PROVIDER_DEPENDENT | PROVIDER_DEPENDENT | Integer 1..1000000; must match returned vectors |
| `vectors.timeout_ms` | 15000 | PROVIDER_DEPENDENT | PROVIDER_DEPENDENT | Integer 1..300000 |
| `vectors.endpoint` | required for openai_compatible | PROVIDER_DEPENDENT | PROVIDER_DEPENDENT | HTTP(S), no userinfo; never included in inspector output |
| `vectors.token_env` | optional for openai_compatible | PROVIDER_DEPENDENT | PROVIDER_DEPENDENT | Environment variable NAME; if named, a nonempty secret must exist at execution |
| `vectors.model_path` | required for local_onnx | PROVIDER_DEPENDENT | PROVIDER_DEPENDENT | Needs an injected local adapter; a path does not install a runtime |
| `vectors.server` | required for mcp | PROVIDER_DEPENDENT | PROVIDER_DEPENDENT | Needs an injected MCP adapter |
| `vectors.tool` | required for mcp | PROVIDER_DEPENDENT | PROVIDER_DEPENDENT | Needs an injected MCP adapter |
| `reranker.enabled` | false / section omitted | PROVIDER_DEPENDENT | IGNORED | If section exists, enabled is required; disabled permits no other keys |
| `reranker.provider` | required when enabled | PROVIDER_DEPENDENT | IGNORED | openai_compatible, local_onnx or mcp; adapter availability is separate |
| `reranker.provider_id` | required when enabled | PROVIDER_DEPENDENT | IGNORED | Operator-selected identity; not proof of runtime readiness |
| `reranker.model_id` | required when enabled | PROVIDER_DEPENDENT | IGNORED | Provider model identity |
| `reranker.timeout_ms` | 15000 | PROVIDER_DEPENDENT | IGNORED | Integer 1..300000 |
| `reranker.endpoint` | required for openai_compatible | PROVIDER_DEPENDENT | IGNORED | HTTP(S), no userinfo; never included in inspector output |
| `reranker.token_env` | optional for openai_compatible | PROVIDER_DEPENDENT | IGNORED | Environment variable NAME; if named, a nonempty secret must exist at execution |
| `reranker.model_path` | required for local_onnx | PROVIDER_DEPENDENT | IGNORED | Needs an injected local adapter; a path does not install a runtime |
| `reranker.server` | required for mcp | PROVIDER_DEPENDENT | IGNORED | Needs an injected MCP adapter |
| `reranker.tool` | required for mcp | PROVIDER_DEPENDENT | IGNORED | Needs an injected MCP adapter |
| `graph.sqlite_projection` | unbound | IGNORED | IGNORED | No TOML consumer in these executables |
| `graph.graphiti_projection` | unbound | IGNORED | IGNORED | Graphiti export is an explicit CLI operation |
| `graph.similarity_projection` | unbound | IGNORED | IGNORED | No TOML consumer in these executables |
| `watcher.enabled` | unbound | IGNORED | IGNORED | Desktop watcher lifecycle is host controlled |
| `watcher.debounce_ms` | unbound | IGNORED | IGNORED | Desktop uses fixed 500ms debounce |
| `watcher.startup_reconciliation` | unbound | IGNORED | IGNORED | Desktop startup reconciliation is mandatory |
