# Engine service and Kosmos integration build plan

Planning date: September 6, 2026. This plan follows the request to use current repository capabilities; earlier task pins and procedural gates are superseded. Runtime authorization and data protection remain product behavior. Implementation is staged; planned tools are not advertised as available.

## Baseline and ownership

Engine main inspected: f1a95f8f3933f834eb4030f0f0d143051e6eecc2, 2.2.0 candidate. Kosmos main: 3aab1e337a8442d6bc2463cab43cb9b4191291a2; reviewed 0.8.1 branch: fbec1f9daeb4c3cc258ddec0d046adc2dac3483d. Recheck heads at implementation and record selected coordinates; these are evidence, not permanent pins.

Engine owns interpretation, authorized projections, query contracts, proposal validation, receipts, retrieval, event emission and managed MOC coordination. Kosmos owns Obsidian screens and file adapters, browser permissions, Nextcloud and host automation. Rust can consume the resulting fixtures; this plan does not port code to Rust.

Companion: Kosmos-Oden docs/plans/2026-09-06-engine-service-uplift.md on codex/engine-service-uplift-20260906.

## E0: Composition audit and contract inventory

Source evidence: src/service/mcp.ts, src/service/authorized-view.ts; Kosmos src/plugin/agent-server.ts qEffectiveLabels, qEvidence, qRelationships, qPolicy and qAssessVault.

| Requested result | Existing composition | Decision |
| --- | --- | --- |
| Single record assessment | gkos_record_assess returns scores_basis_points, exclusions and diagnostic codes | Reuse; document scale conversion, nulls and rounding |
| Evidence | gkos_note_read supplies raw authored Markdown, not canonical origin separated evidence | Add authorized structured projection; never parse again in the client |
| Effective labels | Raw note or search results do not establish authored/derived/proposed/approved/effective labels | Add origin separated projection |
| Relationships | gkos_lineage_get supplies direct lineage only; graph edges do not preserve all relationship origins | Reuse lineage for lineage queries; add structured relationship projection |
| Policy | gkos_capabilities reports effective availability, not the bundled assessment policy | Add bounded public policy description and digest; never serialize private deployment policy |
| Aggregate assessment | Repeated record assessment can summarize a known set, but navigation discovery is not complete corpus enumeration | Add authorized scope aggregate with explicit denominator, coverage and generation |

Confirm by executing existing tools on a fixture with non-MOC records, hidden records, empty scores, multiple origins and unresolved relationships. Record exact payloads and why each composition is sufficient or insufficient. Exit: no new tool duplicates a sufficient existing result.

## E1: Additive read contracts

Proposed extension tools: gkos_record_projection with a closed sections enum (evidence, labels, relationships); gkos_assessment_policy; gkos_scope_assess. Final names are frozen in this phase before consumer implementation. Use existing MCP transport and issued references. Do not add parallel REST routes unless a documented consumer needs them. Preserve the original ten tools and historical fixtures.

Specify schemas, version, feature discovery, scope issuance, errors, pagination, source and generation digests, result bounds and examples. Scope issuance must reach the full authorized corpus, not only navigation pages. Aggregate only eligible records in one committed generation; include total eligible, assessed, missing, returned, truncation and per-score denominators. Use integer basis points and deterministic rounding. Bound execution and cancellation; do not average a truncated page as a corpus total.

Construct projections inside Engine's authorization boundary. Filter related and evidence targets before returning paths, counts or digests; opaque or unavailable targets must not become existence oracles. Separate each origin and never promote proposed fields. Public assessment policy is distinct from secret operator access rules. Reject stale scope, foreign session, revocation and unknown sections with bounded nonreflective errors.

Exit: schema tests and live MCP tests pass for visible/hidden pairs, empty corpus, limits, stale generations, foreign references and revoked credentials; existing tool payloads remain compatible.

## E2: Proposal and receipt contract improvements

Inventory existing migration, enrichment, governance, admission and Effects contracts before adding types. Define a versioned host neutral review envelope binding proposal ID, source digest, target identity, operation, origin, policy digest and author. Define immutable review decisions binding reviewer identity, proposal digest, timestamp, decision and edited replacement proposal. Accepted is not applied. Application receipts bind before/after digests, operation ID, decision reference and verified outcome; failures and retries cannot claim success.

Engine validates plans and receipts without opening Obsidian files. Hosts obtain reviewer identity and perform authorized file operations. Handle stale source, duplicate delivery, concurrent review, rejected/deferred decisions and rollback evidence. Keep MOC grants distinct from enrichment decisions. Add no agent approval or write endpoint as an incidental part of this read extension.

Exit: fixtures replay identically, tampered bindings fail, duplicate accepted operations are idempotent, and Kosmos can consume the contract without duplicating semantics.

## E3: Event compatibility pack

Publish synthetic fixtures and a process harness for connect, fragmented SSE, reconnect with Last-Event-ID plus session, retained replay, ring overflow/reset, server restart, source generation change and credential revocation during a stream. Include multiple agents and hidden target paths. Event session and corpus generation are different coordinates: do not infer generation from sequence. Freeze reset and duplicate handling explicitly.

Use Kosmos recorder limits and replay scenarios as consumer cases. Fixtures contain no real tokens or private corpus bytes. Exported recordings are historical observations, never authority to refetch data after revocation. Exercise actual HTTP service with temporary credentials and clean shutdown. Exit: Engine producer and Kosmos consumer pass the same fixture manifest; no missing interval is silently called complete.

## E4: Retrieval and MOC integration seam

Retain gkos_search for retrieval; document authorized scope, citation offsets, provider status, bounds and stale reference recovery. Library provider support does not imply every provider is enabled in service search.

Use existing NodeManagedMocHost/Runtime, not another coordinator. Publish supported snapshot, grant, ownership, publication callback and shutdown contracts with generated region and recovery fixtures. Node executor remains host specific; Obsidian adapter must implement its own file semantics. Make duplicate publication callbacks idempotent. Explain absent durable no-op receipts and unqualified durability separately from implemented behavior.

Exit: a synthetic consumer indexes a corpus, searches, supplies an explicit managed target, verifies preserved human bytes, restarts and reconciles without duplicate effects.

## E5: Qualification and delivery

Run typecheck, build, current tests, navigation and intelligence tests, package checks and new live integration suites on Node 22/24; record informative Node 26. Check browser import graphs for neutral exports. Produce test commands, commit/tree, lock digest, platform/toolchain, skips, workflow/job IDs and artifact digests. Bind packaged sidecars separately from npm source. Windows/macOS packaging and Debian service coverage are distinct evidence.

Publish compatibility fixtures before Kosmos consumes new tools. Document changes in CURRENT_CAPABILITIES, technical guide and changelog. Rollback uses prior package/service artifact and retains source notes; archive or migrate derived state only under an explicit versioned protocol. Revoke temporary test credentials. Do not claim tests passed on an untested platform.

## Sequence and completion

E0 precedes E1; E2 and E3 are independent after inventory; E4 uses existing APIs and freezes their consumer seam; E5 qualifies their integrated result. Kosmos K1 may proceed before E1. K3 consumes E1/E4; K4 consumes E2; K5 consumes E4. Complete when the exact consumer and producer revisions pass shared scenarios and publish honest capability inventories. No Nextcloud implementation, browser permission logic or Obsidian event automation moves into Engine.
