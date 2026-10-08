# Coding-agent handoff: integrate deterministic managed MOCs and bounded agent writes

Owner-requested repository-specific implementation handoff, 2026-09-06. Scope: **Odenknight/Kosmos-Oden only**. Continue the existing Effects work; do not build a second semantic engine or replace the browser/offline path. Inspect repository instructions, current heads, open PRs and dirty state before editing.

## Current baseline and required reading

Main inspected: `3aab1e337a8442d6bc2463cab43cb9b4191291a2`. `package.json` currently pins the development Engine commit `41172b91970aac869c161f4842e3526a62fd1fd9`, not a released Engine 2.2 artifact. Existing product release work is in PR #38; coordinate version/dependency changes rather than overwriting that branch. Do not set the Kosmos product version to 2.2 merely because its Engine dependency targets 2.2.0.

Read `docs/navigation-effects/IMPLEMENTATION-HANDOFF.md`, `DEVELOPMENT-PIN.md`, `QUALIFICATION-PLAN.md`, `CAPABILITY-MATRIX.md`, Packet-B and Packet-C0 working reports against current source. Some matrix descriptions reflect older snapshots; reconcile them with actual code and execution reachability, not with file existence alone.

Existing extension points:

- `src/navigation-effects/engine-adapter.ts`, `policy.ts`, `authority-provider.ts`, `settings.ts`, `status.ts`, `types.ts`.
- `adoption-plan.ts`, `adoption-registry.ts`, `in-memory-adoption-store.ts`, `src/ui/moc-adoption-modal.ts`.
- `effect-adapter.ts`, `obsidian-effect-adapter.ts`, `native-effect-adapter.ts` and corresponding unit/browser tests.
- `src/plugin/main.ts`, `vault-provider.ts`, `settings.ts`, `agent-server.ts` for lifecycle, index, settings and MCP boundaries.

Upstream TS candidate: [Odenknight/GKOS-Engine#43](https://github.com/Odenknight/GKOS-Engine/pull/43), exact head `a4ed15d8de20222919f2aad43cbbea83f01d219e`, Engine 2.2.0 candidate. Read its [integration guide](https://github.com/Odenknight/GKOS-Engine/blob/a4ed15d8de20222919f2aad43cbbea83f01d219e/docs/DETERMINISTIC-MOC-ASSISTANCE.md) and [TS plan](https://github.com/Odenknight/GKOS-Engine/blob/a4ed15d8de20222919f2aad43cbbea83f01d219e/docs/moc-build-review-2026-09-05/ENGINE-TS-MOC-BUILD-PLAN.md). Hosted CI and historical/current-runtime workflows now pass at this head, including the repaired Windows watcher lane. This is **not a published release or complete soak/native-durability qualification**.

## Packet K0 — integration inventory and dependency seam

- [ ] Record what the current adoption/adapter packets implement versus simulate or leave unreachable. Preserve current fail-closed defaults and existing read-only contracts.
- [ ] Extend the browser-safe Engine adapter to consume `planManagedMocBatch`, `ManagedMocCoordinator`, `buildDeterministicMocAssistance`, and `buildMocAssistance` from `gkos-engine/navigation-effects` when available at the selected exact dependency.
- [ ] Keep Node executor/runtime imports out of browser and Obsidian bundles under the existing profile design. A separate native service may reuse `NodeManagedMocHost` / `NodeManagedMocRuntime`; do not copy their implementation into the viewer or Obsidian adapter.
- [ ] Use mocks/shared fixtures first. A temporary test dependency, if needed, must be exact-commit/artifact-bound and labeled development-only with integrity evidence. Final integration requires an owner-authorized released Engine 2.2 artifact and refreshed lock/integrity checks; no floating branch dependency or invented tag.

## Packet K1 — durable host, adoption and recovery

- [ ] Connect the existing host adapter to durable lease/journal/archive/ownership state. In-memory adoption is not durable production authority. Keep Engine plan/receipt meanings unchanged.
- [ ] Existing MOCs stay unmanaged until a trusted human reviews exact bytes/diff and adopts a hash-bound region or full-file plan. Adoption alone must not apply source changes. Malformed/duplicated/nested/moved markers and intervening human edits require review.
- [ ] Every replacement archives exact before bytes under `_archive/moc-runs/YYYY-MM-DD/<run-id>/`, with before/after digests, exact diff, manifest, result and receipts. Creates require absence. Preserve human bytes outside managed regions exactly.
- [ ] Persist intent before effects; recheck live authority, retention, sensitivity, config/policy and target digest at execution. Temp/atomic replace, after-read verification and durable receipt precede commit/graph publication. Unsupported Obsidian atomicity/path/durability guarantees keep writes unavailable.
- [ ] Resolve all nonterminal operations and ownership-advancement gaps before enabling writes. Conflicting external bytes, corrupt journal/archive/checkpoint or ambiguous lease fail closed. Rollback needs new authority and CAS, not blind restoration.

## Packet K2 — real-time MOC coordinator

- [ ] Supply Engine's durable coordinator host interface using the existing Obsidian lifecycle/index. Apply GkxIndex deltas once, obtain a validated snapshot, derive affected scopes plus parent/master dependencies, plan only registered managed targets, execute guarded effects and publish committed deltas.
- [ ] Ingest create/modify/delete and **both endpoints of rename**. Ignore `.gkx/**`, exact `_archive/moc-runs/**` and verified own effects. Suppress self-events only by committed effect ID plus digest, not elapsed time.
- [ ] Default 750 ms debounce, 3 s maximum delay, optional five-minute reconciliation. Bound pending paths, bytes, upstream rate and concurrency; overflow becomes durable full-reconciliation intent. Preserve events arriving during a run and unresolved partial work.
- [ ] Startup/vault-ready/abnormal-exit/resume/watcher-error/overflow/bulk-sync/manual reconciliation precedes or restores readiness. Missed watcher events must converge. No-op bytes do not rewrite source. A scope becoming empty must update its managed MOC without deleting the file.
- [ ] On unload stop admission, persist queued work, reach a safe atomic boundary and durable checkpoint within a bounded budget. A timer stopping is not evidence of clean shutdown.
- [ ] Wire opt-in settings, independent capability/authority/recovery status, adoption/review UI, recovery/rollback UI and redacted audit export. Installation, migration and recovery do not enable automatic writes.

## Packet K3 — optional tagging/linking/MOC assistance

- [ ] Ship useful deterministic behavior with no model dependency: authored tags/explicit hashtags, unambiguous explicit links, deterministic MOC proposals. Tag/link suggestions are not automatically written into arbitrary source notes.
- [ ] Optional local/cloud provider is off by default and has separate destination/data-egress approval. Filter sensitivity and operational paths before constructing any payload, including titles, links and evidence. Keep secrets in the host's supported secret storage; never in notes, logs, guides or Git.
- [ ] Enforce transport byte limits before parsing, timeout/cancellation and bounded calls; use Engine's structured output validation. Display deterministic and advisory artifacts separately. Record source/config/policy/proposal digests; require reviewed promotion and ordinary write preconditions. Provider failure/malformed output falls back to the deterministic result with redacted status.
- [ ] Model confidence cannot adopt a MOC, lower sensitivity, approve/supersede lineage or grant write authority. No live provider connection or budget is supplied by this ticket.

## Packet K4 — credential-bound multi-agent notes (separate from MOC authority)

- [ ] Extend, do not replace, `src/plugin/agent-server.ts` read-only compatibility. Register stable lowercase UUIDv7 agent IDs, distinct credential bindings, configured vault-relative roots, grants, expiry/disablement, sensitivity ceilings, byte/rate/concurrency quotas and policy digests.
- [ ] Default root `_kosmos/agent-notes/<agent-slug>/`; display-name changes do not move ownership. `clientInfo.name`, session IDs, bearer-token possession and connectivity are not sufficient write authority. User-selected roots must be validated and non-overlapping by default.
- [ ] Add explicit tools `agent_note_create`, `agent_note_update`, `agent_note_append`, optional expressly granted `agent_note_archive`, and `agent_write_status`. Requests use a relative note name or UID resolved inside the authenticated root. Update and append enforce expected current digest/version; competing CAS writes yield one commit and one redacted conflict.
- [ ] Reuse the same guarded effect/receipt protocol. No delete, cross-agent writes, root escape, direct-MOC tool, arbitrary-source tool, policy modification, promotion or sensitivity lowering. Archive only within explicitly authorized policy destinations; it is not a default grant to write outside a root.
- [ ] Validate proposed Markdown/frontmatter (including duplicate YAML keys and identity); use current GKX metadata or namespaced extensions for stable note UID, agent ID/display name, agent-authored provenance, timestamps, sensitivity and receipt reference. Do not invent normative Standard fields.
- [ ] Preserve secure credential comparison, Host/Origin checks, request caps, no-store, session lifecycle and sensitivity policy; add rotation/revocation invalidation, per-agent/global write limits and write-effect approval annotations. Annotations do not substitute for server-side authority. LAN writes stay off by default; explicit risk confirmation and distinct credentials are required.
- [ ] Add per-agent credential/root lifecycle UI and Quick Connect. Successful notes enter normal validation, graph/index updates and MOC invalidation. One vault coordinator serializes conflicts; nonconflicting roots may proceed safely. MCP is not task orchestration.

## Acceptance and return report

- [ ] Existing read-only clients, browser/offline routes, sensitivity defaults and source-purity boundaries remain compatible.
- [ ] Shared Engine/Kosmos fixtures prove exact human-region preservation, archive exclusion from all context, no-op behavior, stale/denied/recovery outcomes, live authority revocation and crash-safe ownership advancement.
- [ ] Test event bursts, rename/delete, missed events, startup/unload/resume, disk/permission/archive failures, corrupt state and external edit races. Test two agents, impersonation, stale CAS, Unicode/case collisions, traversal, drive/UNC/device aliases and symlink/junction/reparse escape on claimed platforms.
- [ ] Run current package scripts (`typecheck`, `verify`, applicable browser/visual suites and lock/artifact checks), synthetic integration/fault tests, 100/2,000/10,000/50,000-note measurements and a 24-hour soak. Report P95 targets as targets until measured: <2 s single edit in a 2,000-note vault, <5 s a 50-note burst.
- [ ] Update stale capability/development-pin docs and produce exact commits, commands, counts/skips, artifact hashes, native/browser results, measured performance, limitations and remaining owner actions. Do not inherit old counts onto a new head.

Issue #39 remains the separate ecosystem/live-qualification Q&A; this ticket does not answer its blank release/platform/provider decisions or authorize real-vault activation. The present handoff authorizes delivery of implementation instructions, not bypassing release, merge, deployment, live-secret, or conformance gates. Do not alter Engine, Rust, Standard or Lite repositories from this issue. No Standard amendment is a prerequisite for experimental extension fields; propose any genuinely normative change separately.
