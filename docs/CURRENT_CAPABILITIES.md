# Current capabilities: GKOS-Engine 2.2.0

Updated 2026-09-06. This inventory describes implemented source behavior, not a published release or a GKOS conformance claim. The [README](../README.md) is the introduction; the [roadmap](../ROADMAP.md) lists future work.

A capability can exist in code without being configured, authorized, safe after recovery, or enabled by an operator. Qualification is another separate requirement. Installing a package proves none of those later conditions.

## Available surfaces

| Capability | Where to use it | Current boundary |
| --- | --- | --- |
| GKX parsing, validation and assessment | Root/GKX library; validate and assess CLI | Source-content read-only; findings are not approval or truth |
| Graph, lineage and time projections | Library; graph CLI | Deterministic derived views; explicit graph output writes only the named file |
| Graphiti episodes | Graphiti subpath; export CLI | Projection only; GKX stays canonical |
| Ingest/index publication | Index CLI and repository host | Derived state under .gkx; strict rejection or explicit non-strict exclusion ledger |
| Retrieval and verified citations | Retrieval subpath; search CLI | Lexical baseline; trusted optional providers; CLI public-only; current-source citation checks |
| Derived-state watcher | Desktop host and repository-private watcher modules | Coherent graph/retrieval activation and recovery; not source-authoring authority |
| Navigation 1.0 | Navigation subpath; nav scan/audit/render/context | Discovery, candidates, diffs, audit, context and plans; cannot apply MOCs |
| Navigation Effects planning | Effects subpath | Ownership/marker/path/grant checks, deterministic batch plans and fault adapter |
| Managed-MOC coordinator | Effects subpath | Host-driven durable intent; 750 ms debounce, 3 s maximum delay, five-minute periodic default; no built-in I/O |
| Managed-MOC Node host/runtime | Effects/Node subpath | Explicit executor, ownership state, watcher/timer composition and recovery; cooperative-vault only |
| MOC assistance | Effects subpath | Deterministic explicit tags/links and MOC proposals; optional provider off by default and review-only |
| Local REST/SSE service | Loopback desktop service | Authorized notes/graphs/episodes/events, capability/status reads and controlled shutdown |
| MCP HTTP and stdio bridge | /mcp and packaged bridge | Ten read-only tools; no source-note or MOC write tool |
| Governance and admission policy | Governance/admission-policy subpaths | Store/receipt roles, pure bounded evaluation and context-bound verification; no implicit authority |
| Optional Python intelligence | Separate service plus TS validation | Proposal-only; unnecessary for deterministic operation |
| Scientific trace evaluation | experimentalScience namespace | Provisional structural checks, not research execution or truth authority |

## What managed writes do—and do not do

The Node host connects a supplied validated snapshot/index to registered managed targets. Existing human MOCs require reviewed hash-bound adoption. Region-managed writes preserve human bytes outside one valid generated region. Creation requires explicit ownership/absence authorization.

The executor uses a vault lease, scoped locks, durable intent, before-image archive, temporary replacement, after-read verification, receipts and recovery. Changed external bytes win over stale plans. Archives stay below `_archive/moc-runs/YYYY-MM-DD/<run-id>/`; operational state stays below `.gkx/` and both are excluded from knowledge context.

Startup recovery and full reconciliation precede readiness. Overflow and missed events require reconciliation, not faith in watchers. Graph publication can be retried with the same effect ID; consumers must be idempotent. A stopped timer is not a durable clean-shutdown receipt.

The packaged desktop service does not wire this host to a source-write route. Kosmos must complete its own adapter/UI/credential integration. No dedicated durable no-op audit receipt is currently emitted by byte-identical host passes. End-to-end parsing/P95, 24-hour soak, physical power-loss and hostile filesystem-ancestor race protection remain unqualified.

## Exact MCP tool inventory

The executable inventory is `SERVICE_MCP_TOOLS` in `src/service/mcp.ts`. Authenticated `tools/list` filters it for the credential; a listed tool may still refuse a stale, unauthorized or unready request.

| Tool | Purpose | Contract lane |
| --- | --- | --- |
| gkos_capabilities | Effective discovery and capability explanation | Draft.2 original |
| gkos_record_validate | Validate a discovered record | Draft.2 original |
| gkos_record_assess | Documentation-quality assessment | Draft.2 original |
| gkos_lineage_get | Authorized direct lineage neighborhood | Draft.2 original |
| gkos_graph_at_time | Time projection in an issued scope | Draft.2 original |
| gkos_navigation_discover | Discover authorized Navigation entries | Draft.2 original |
| gkos_navigation_audit | Audit an issued Navigation scope | Draft.2 original |
| gkos_note_read | Paginated authorized Markdown, including frontmatter | Observatory content extension |
| gkos_record_resolve | Resolve a known canonical path to a current read reference | Observatory content extension |
| gkos_search | Authorized indexed search with verified citations | Observatory retrieval extension |

References bind session, generation and source bytes; paths are locators, not immutable identity. Read authorization is record-level, not per-span redaction. Service search permits only operator-configured local ONNX embedding; remote providers and reranking stay disabled in that profile. Library provider availability must not be confused with service enablement.

The frozen Draft.2 pack still defines seven original tools and sixteen deferred contract surfaces. Observatory extensions do not rewrite that historical pack or imply production conformance. The stdio bridge forwards to the same loopback authority; it is not a second writer or native-stdio conformance claim.

## Effects capability flags

`getNavigationEffectsCapabilities()` is a pure configuration reporter, not a runtime probe. It accepts `adapterConfigured`, `authorityProviderConfigured`, `durableJournalConfigured` and `policyConfigured`.

| Reported flag | Configuration rule | What remains to prove |
| --- | --- | --- |
| plan_moc_apply | Always true | Valid inputs; no effect is performed |
| atomic_replace | Adapter configured | Actual adapter/platform behavior |
| archive_previous_moc, startup_recovery | Adapter + journal + policy | Verified archive/recovery state |
| apply_managed_moc, rollback_execution | All four inputs true | Current target grant, ownership, lease, safe recovery/reconciliation, enablement and CAS |
| agent_note_create, agent_note_update, agent_note_archive | All four inputs true in the existing Effects 1.0 configuration contract | Host implementation and operation-specific grants; these flags do NOT mean MCP agent-write tools exist |
| arbitrary_source_write, agent_note_delete | Always false | Not provided by this contract |

Missing inputs default false. Do not manufacture ready product UI by passing true booleans: enforce independent runtime conditions and advertise only wired host behavior. The existing configured agent-note flags describe infrastructure, not a completed credential registry, authoring pipeline, or an exposed write endpoint.

Navigation 1.0 capability semantics remain unchanged and read-only. Local-service capability reporting independently separates available, configured, authorized and enabled states with reason codes. Consult [settings/discovery](SETTINGS.md) for the actual profile and accepted settings.

## Package interfaces and distribution

Public imports: `gkos-engine`, `/adapter`, `/gkx`, `/graphiti`, `/navigation`, `/navigation-effects`, `/navigation-effects/node`, `/governance`, `/retrieval`, `/admission-policy`.

The service, watcher, ingest-host, evaluation-host and filesystem-authority bundles are deliberately not public package subpaths. Use packaged commands or repository host integrations. Keep Node modules out of browser bundles.

Current package lanes: Node 22 and 24 blocking, Node 26 informative; npm >=10. Historical replay retains its original coordinates. SEA workflow configuration covers unsigned Windows x64 and macOS arm64/x64 pre-release binaries, not a Linux SEA artifact. Workflow presence is not an assertion that a new binary has been released.

## Not yet delivered or not authorized by default

- Production Kosmos write integration, per-agent credential/root lifecycle and create/update/append/archive MCP tools.
- Dedicated durable no-op host audit receipts; fully qualified scale/soak and native durability guarantees.
- Enabled proposal ingress, agent approval/decision routes, automatic adoption, deletion or cross-root authority.
- LAN/internet service binding, token-in-URL mode, automatic sensitivity lowering or confidence-selected lineage winners.
- Automatic updater/signing/notarization, a published 2.2 artifact, Rust parity or new GKOS conformance.

## Evidence and updates

See [host lifecycle qualification](../evidence/2026-09-06-moc-host-lifecycle-qualification.md) for exact baseline receipt hashes, counts and limitations. Its a4ed15d hosted tree passed Ubuntu and Windows Node 22/24/26 lanes. Later changes require their own qualification; neither a version bump nor documentation transfers an earlier pass to a new commit.

[Engine #44](https://github.com/Odenknight/GKOS-Engine/issues/44), [Kosmos #40](https://github.com/Odenknight/Kosmos-Oden/issues/40) and [Rust #2](https://github.com/Odenknight/GKOS-Engine-Rust/issues/2) separate implementation ownership and remaining gates.
