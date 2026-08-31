# Engine settings and discovery audit

Audit date: 2026-08-31. Base: `0584a5d3e70384ef65e9069fbe1d6fd1d80cfc04` (2.1.2), with the Observatory extension. This document describes executable wiring, not a new governance contract. An accepted setting, a discovered tool, a passing fixture, and a healthy production provider are four different claims.

## Start here

```sh
node bin/gkx.mjs settings --runtime desktop --json
node bin/gkx.mjs settings --runtime cli-search --config /operator/config/gkos.toml --json
node bin/gkx.mjs settings --runtime cli-index --config /operator/config/gkos.toml --json
node dist/gkos-desktop-agent.mjs --help
```

The settings command inventories every accepted TOML coordinate; a test compares it against the shipped schema so new keys cannot be silently omitted. `--config` is explicit-only inspection: no ambient discovery, vault traversal, provider construction, secret resolution or source writes. It emits names/status/defaults, never configured values or paths. Exit 0 means recognized wiring, **not runtime readiness**; exit 1 identifies configured inactive/metadata-only keys; exit 2 means invalid input/configuration. `runtime_readiness` remains `NOT_PROBED`.

`WIRED` means consumed by that command; `PROVIDER_DEPENDENT` needs a working adapter; `METADATA_ONLY` affects generation configuration metadata but not that indexing operation; `IGNORED` is parsed but not applied; `NOT_LOADED` means that executable does not load TOML at all. CLI search and the additive explicit-config/trusted-CWD index route emit stable `GKOS_SETTING_IGNORED` / `GKOS_SETTING_METADATA_ONLY` warnings with schema-owned coordinate names, never values. Legacy index stderr remains frozen; use the inspector to diagnose its automatically discovered config. These are operator CLI diagnostics, not disclosures to MCP consumers.

## TOML discovery and ownership

`gkos.toml` is a trusted CLI/SDK configuration, **not the desktop service configuration**. `gkx search` and `gkx index` accept `--config` and `--trust-cwd-config`. Explicit config wins, followed by explicitly trusted working-directory config, trusted workspace-root config, then user config. No merging: first existing candidate wins. Missing explicit config is an error, not fallback. User config is `$XDG_CONFIG_HOME/gkos/gkos.toml`, or Windows `%APPDATA%/GKOS/gkos.toml`, otherwise the home `.config/gkos/gkos.toml`.

Automatic Git-root discovery must not promote a vault-local provider/service config into trusted operator configuration. Safe vault-local retrieval keys may pass the safety check; that does **not** mean an unselected file is merged or takes effect. Aliased/symlink/hardlinked or over-1MiB config files are rejected. Provider secrets are referenced by environment-variable name, never literal TOML tokens.

The complete per-key table is [SETTINGS-TOML.md](SETTINGS-TOML.md), generated from `bin/settings-inventory.mjs`. Important gaps:

- `service.*`, `agents.*`, `graph.*`, `watcher.*`: accepted by the schema but not consumed by these executables. Do not use them to configure a bind address, disable authentication, set retention, disable reconciliation, or enable a graph projection.
- `retrieval.mode`: ignored by the CLI; effective mode is derived from vector configuration. It does not force semantic-only operation.
- Retrieval ranking/filter/expansion keys are search-time controls. Indexing stores these in configuration metadata; only chunk size/overlap and the vector provider drive the index build itself.
- SDK providers support OpenAI-compatible HTTP, local ONNX and MCP adapters. CLI local/MCP adapters need injected runtime dependencies; a model path/server/tool setting alone does not install them. CLI reranking is search-only. Remote providers require explicit operator credentials/network authorization. No remote inference is performed by inspection/tests claiming only mocked coverage.
- Source admission, identity coherence, and authorization remain independent gates. No setting repairs duplicate UIDs or authorizes otherwise restricted notes.

## Desktop helper: active settings

| Setting | Default / accepted values | Effect and verification |
| --- | --- | --- |
| `--notes <folder>` | Required | Canonical note root; source read-only. Argument and integration tests. |
| `--default-sensitivity` | `secret`; public, internal, restricted, confidential, regulated, phi, secret | Invalid/missing falls back to secret. Does not override explicit source sensitivity. |
| `--port` | 4814; integer decimal 1..65535 | Invalid falls back to 4814 for compatibility. Numeric prefixes such as `5000junk` no longer accepted. |
| `--status-file` | `<notes>/.gkx/desktop-agent.status.json` | Status namespace/credential directory is validated; not an arbitrary source-write bypass. |
| `--help`, `-h` | Off | Prints help without starting the service. |
| `--host` | Forbidden | Listener is always 127.0.0.1. Unknown/duplicate flags and extra positionals now fail. |
| `GKOS_CODEX_MCP_ENABLED` | Unset or `0`: off; exactly `1`: on | Separate persisted MCP credential identity; invalid values fail. Never print token contents. |
| `GKOS_MCP_CONTENT_LIMITS` | JSON shown below | Startup content-resource budget, not admission or caller-visible corpus size. Restart required. |
| `GKOS_LOCAL_EMBEDDING_CONFIG` | Unset: disabled | Protected Linux-only local model config, below. Restart required. |

Content limits require exactly three positive safe-integer fields. Defaults: `{"files":2000,"per_file_bytes":1048576,"total_bytes":8388608}`. Maxima: 20000 files, 67108864 bytes/file, 268435456 total bytes. Empty environment uses defaults. Every lower/upper bound and malformed JSON is tested. Failure is now the stable `GKOS_MCP_CONTENT_LIMITS_INVALID` without reflecting JSON parser input. These budgets do not enlarge request/result or page limits.

Local embedding JSON fields: `runtime_module`, `model_path`, `model_id`, `model_manifest`, `dimensions`, optional `indexing_ceiling` (default public; seven sensitivity levels). Exactly 384 dimensions; model ID `Xenova/all-MiniLM-L6-v2@<40-hex-commit>`; pinned Transformers.js 3.7.6; CPU q8 mean pooling/normalization, 2 intra-op/1 inter-op threads. Manifest must bind model/tokenizer/config and `onnx/model_quantized.onnx` to SHA-256 values. Paths and ancestors must be root-owned, non-symlink, not group/world writable; JSON <=16384 bytes; 1..32 manifest entries, <=128MiB/file. Remote downloads are disabled. Runtime timeout 120000ms, maximum 32 texts/262144 UTF-8 bytes, fewer than 8 pending batches. This profile is distinct from generic TOML providers. File integrity/configuration tests do not substitute for an actual inference smoke test.

## Other executables and optional service

| Surface | Settings | Meaning / defaults |
| --- | --- | --- |
| `gkx validate` | `<dir>` or `--kb-path`, `--schema`, `--format text\|json` | Schema/identity diagnostics; selected profile. `--strict` belongs to index, not validate. |
| `gkx index` | `--kb-path`, `--schema`, `--strict`, `--config`, `--trust-cwd-config` | Strict publication optional; explicit trusted config now reaches the existing index runtime. Writes derived state, not source notes. |
| `gkx search` | query, `--kb-path`, `--limit`, `--as-of`, `--config`, `--trust-cwd-config` | Limit default 5, 1..100. `as-of` uses canonical GKX source timestamp grammar (distinct from lenient MCP query instants). Public-only CLI policy. |
| `gkx assess` | `<dir>`, `--json` | Documentation-quality scores, never truth authority. |
| `gkx graph` | `<dir>`, `-o` / `--out`, `--watch` | Explicit graph artifact output and optional watch. |
| `gkx export graphiti` | `<dir>`, `--episodes`, `--group-id` | Explicit Graphiti artifact export, not a TOML background switch. |
| `gkx nav scan/audit/render/diff` | input dir(s), `--json`, render `--stdout` | Source-content read-only. Render does not accept output files. |
| `gkx nav context` | `--recipient`, `--recipient-class`, `--purpose`, `--item-budget`, `--token-budget`, `--stdout` | Class default agent; human/agent/system/service. Budgets default 50 items, 12000 tokens. |
| `gkx nav reentry-plan` | `--predecessor` / `--predecessor-id`, `--predecessor-version`, `--predecessor-digest`, `--input`, `--new-source-id`, `--new-source-version`, `--new-source-path`, `--acquired-at`, `--actor` | Proposal coordinates; no source mutation. New-source path defaults to input. |
| `gkx nav promotion-plan` | `--proposal-id`, `--operation-id`, `--vault-id`, `--name`, `--actor`, `--proposed-at` | Explicit proposal identity/time. Source write/apply/delete/record operations remain rejected. |
| `gkx retrieval eval/tune` | `--fixture`, eval `--json`, tune `--output` | Fixture-based offline evaluation/proposal output; no live authority promotion. |
| CLI help | `--help`, `-h` where advertised | Command-local validation remains authoritative; flags are not interchangeable across commands. |
| `gkos status` | `--state`, optional `--json` | Reads protected state capability and authenticated loopback status; exits 0 fresh/serving, 1 not fresh, 2 bad capability, 3 operational failure. |
| `gkos watcher journal-reset` | `--state`, `--expected-journal-generation-digest`, `--expected-coherent-manifest-digest`, optional `--json` | Destructive recovery workflow with expected-coordinate checks; never run as a settings probe. |
| `gkos-mcp-stdio` | `GKOS_MCP_URL`, `GKOS_MCP_TOKEN_FILE` | URL default `http://127.0.0.1:4814/mcp`; only HTTP/127.0.0.1/exact `/mcp`, no URL credentials/query/fragment. Protected absolute token file required. |
| stdio forbidden env | `GKOS_MCP_TOKEN` | Raw token environment input rejected; use token file. |
| Python proposal sidecar | `--host`, `--port` | Default 127.0.0.1:8765; loopback only. IPv6 `::1` now selects AF_INET6; port 1..65535. |
| proposal model | `DSPY_MODEL` | No default; DSPy dependency plus model required; `/health` otherwise says needs_configuration. Proposal-only, not authoritative. |
| proposal auth/logging | `GKOS_INTELLIGENCE_TOKEN`, `GKOS_INTELLIGENCE_LOG` | Token optional: when unset, proposals are unauthenticated on loopback. Logging only exactly `1`. Do not expose this sidecar publicly; remote inference not verified here. |

Programmatic trusted-config discovery additionally accepts `cwd`, `workspace_root`, `vault_root`, `user_config_path`, `explicit_config`, `trust_cwd`. These are SDK host options, not interchangeable shell flags. Generic provider dependency injection is SDK-only.

## MCP discovery and fixed controls

Authenticated `tools/list` is the executable argument inventory, including optionality, nullability, enums and bounds. `gkos_capabilities` now adds a versioned, bounded discovery explanation: admitted view only; tool availability does not guarantee coherent search; session/generation/source-bound references; recover known paths through `gkos_record_resolve`; `result_digest` is an envelope hash, not a payload-cache key. Compare artifact digests only for the same artifact kind and authorization context. Do not compare audit and discovery hashes or assume identical hashes authorize reuse under a new credential/session.

| Tool | Required arguments | Optional controls |
| --- | --- | --- |
| capabilities | none | none |
| record_validate / record_assess | `record_ref` | none |
| lineage_get | `record_ref`, `cursor`, `limit` | none; direct neighbors, not transitive history |
| graph_at_time | `scope_ref`, `at`, `state`, `cursor`, `limit` | state valid/superseded/not_yet_created/all; query timestamps explicit zone, optional 1..3 fractional digits |
| navigation_discover | `cursor`, `limit` | `scope_ref` nullable, `detail` full(default)/compact, `name_query` 1..128 chars <=8 terms, `path_prefix` <=4096 canonical chars |
| navigation_audit | `scope_ref`, `severity_at_least`, `cursor`, `limit` | severity info/warning/error |
| note_read | `record_ref`, `cursor`, `limit_bytes` | bytes 4..16384; includes frontmatter, no per-span redaction |
| record_resolve | `canonical_path` | `expected_uid` nullable; path is not identity |
| search | `query`, `cursor`, `limit` | `path_include`: 1..16 portable globs, each <=512 chars; query 1..256 chars |

All paginated cursors are required-nullable except where the explicit schema says otherwise. Start with null; repeat filters/detail; new source/config/query/generation requires restarting pagination. Navigation/lineage/temporal/audit page limit 1..100; search 1..50 over a bounded top-100 window. Missing required fields produce bounded field-level codes, never caller values. Missing/restricted targets share non-disclosing refusal. `head` means terminal lineage participant, not simply newest record; `valid_at` is not filesystem mtime.

Fixed service controls are not TOML switches: MCP request 393216 bytes/result 1048576 bytes; session reference cap 8192; stdio 4 in-flight, 30s request/10s shutdown; event ring defaults 2048 entries/2MiB; per-client SSE queue 256 events/512KiB. Service host injection options include `requestTimeoutMs` default30000 (10..30000), `streamHeartbeatMs` default15000, `workQueueWaitMs` default60000 (20..60000), `eventRing`, `corsAllowlist`, `reservedRoutes`, credential registry, authorization callback, snapshot source, retrieval adapter and navigation config. They are repository-private host APIs, not public npm root exports. Heavy work: 2 active globally, one/session, 16 queued globally/8 per credential/2 per session; credential policy may lower concurrency. CORS desktop allowlist and 500ms watcher debounce are code-controlled.

Build/test-only environment (`GKOS_TEST_LOCAL_EMBEDDING_CONFIG`, alias/short-path fixture gates, phase/source-head CI coordinates, `PYTHONPATH`) is not production configuration. Ambient runtime variables such as HOME/APPDATA/XDG_CONFIG_HOME, PATH, proxy and TLS configuration must be managed by the operator, not copied from vault documents.

## Verification and remaining ownership

New tests: `test/settings-inventory.test.mjs`, desktop argument regression, MCP discovery regression, Python `test_settings.py`. Existing test groups cover config precedence/provider validators, CLI retrieval/indexing, authenticated stdio, authorization, secret canaries, scheduling, watcher restart, and local model inference. Run build before Node tests; see release evidence for actual counts/platforms and skipped tests. Registry completeness is schema coverage, not an assertion that every possible combination was executed.

Upstream decisions remain: implement or formally deprecate unbound TOML sections; decide whether `retrieval.mode` becomes an explicit validated policy; bind optional local/MCP provider executors in the CLI if supported; tighten legacy command-specific flag rejection; ratify the Observatory extension independently of the frozen seven-tool contract. Do not activate network binds, disable authentication or weaken admission simply to make an inert setting appear functional. These items must remain open in tracking until the responsible Engine agent lands and verifies the intended contract.
