# Managed-MOC remaining-work review — 2026-09-20

Read-only audit of `Odenknight/GKOS-Engine` main at
`03724fd997fd11b0ebc382e23aa8c21cd0cfb1ec`. This record reconciles implemented
source with remaining qualification and consumer work. It is not a test run,
release approval, hardware result or downstream-repository qualification.

## Implemented distinction

Dedicated durable managed-MOC no-change auditing is implemented, not future
work. `src/navigation-effects/node/moc-host.ts` requests `recordNoChange: true`;
`src/navigation-effects/planner.ts` binds the durable reconciliation ID;
`src/navigation-effects/node/executor.ts` creates and readbacks the separate
`engine.managed-moc-no-change-receipt`, binds it to the ordinary receipt/journal,
and verifies it during recovery. `test/managed-moc-no-change.test.mjs` covers
exact retry, five process-exit boundaries, corrupt/missing committed audits and
audit-destination failure. `.github/workflows/managed-moc-audit-2.2.yml` runs the
focused native Linux/Windows lane. The protocol and its explicit limits are in
`docs/MANAGED-MOC-NO-CHANGE-AUDIT.md`.

This capability does not prove directory-entry persistence, physical power-loss
safety, hostile ancestor-swap protection, full-host scale or a consumer release.

## Remaining Engine evidence ledger

| Gate | Evidence present | Missing evidence / closure condition |
| --- | --- | --- |
| End-to-end scale and incremental parsing | Planner-only samples exist at 100, 2,000, 10,000 and 50,000 notes. A related derived-state watcher real-edit smoke at `69fda67` took 12,648.90 ms at 2,000 notes, but it did not exercise managed-MOC convergence. | Run the actual watcher-to-managed-MOC path at all four tiers with raw samples, P95, parsed/reparsed counts, queue depth, RSS, handles, journal/artifact growth and clean restart. The related watcher result failed its 2-second budget but is not a managed-MOC result; planner samples cannot close this gate. No qualifying end-to-end managed-MOC tier result is present. |
| 24-hour watcher/reconciliation soak | Short synthetic, recovery and native process-exit tests exist. | A reproducible 24-hour workload with edits/bursts/rename/delete/empty scopes, missed-event reconciliation, restarts, self-write suppression, bounded resources and retained raw receipts. No completed 24-hour run is claimed in current docs or evidence. |
| Native durability | The no-change path uses exclusive creation, file sync and readback; the executor has process-exit/recovery coverage under a cooperative-vault threat model. | Per-supported-OS/filesystem file and directory flush/replace semantics, before-image preservation and failure matrices, plus an explicit unsupported matrix. Process kill is not physical power loss. Do not infer directory-entry fsync, hostile ancestor-race resistance or power-loss safety. |
| Exact final artifact | Source/package metadata says 2.2.0, while public npm remains 2.0.1 and the latest documented GitHub release is 2.1.1. | Select and review the final commit; produce the exact tarball/binaries, hashes/integrity and exact-head qualification; complete owner trusted-publisher/protected-environment gates. A branch, package version string or prior commit's CI is not release evidence. |
| Consumer release qualification | Engine has interfaces, fixtures and host obligations; no Engine MCP write endpoint is exposed. | Install the immutable released artifact in the consumer, verify its integrity/lock, run shared fixtures and native/browser/security/recovery/soak acceptance, and retain product release/activation approval. |

The related watcher performance result is recorded in
`docs/WATCHER-GRAPH-COMPARISON.md`; release
and artifact boundaries are recorded in `docs/RELEASE-STATUS.md` and
`docs/CURRENT_CAPABILITIES.md`. Issue
[#44](https://github.com/Odenknight/GKOS-Engine/issues/44) remains the Engine
inventory. Issue [#36](https://github.com/Odenknight/GKOS-Engine/issues/36) is a
separate settings/runtime-ownership dependency; parsing or reporting a setting
does not establish operational readiness.

## Open Engine PR dependency/conflict ledger

Open [PR #74](https://github.com/Odenknight/GKOS-Engine/pull/74) already proposes
prepared Effects execution and inspection-bound recovery. It is not based on
current main: it targets PR #73's branch, which targets PR #72; PR #75 and the
later #77-#85 chain build on that line. GitHub currently reports #74 mergeable
but `UNSTABLE`. Its reported exact-head tests are branch evidence and explicitly
retain `release_qualified: false`.

Do not create a duplicate prepared/recovery API from this ledger. First reconcile
the whole open stack against current main, current no-change behavior and current
release gates, then either integrate or retire it through owner review. The same
principle applies to the other open held PRs listed in
`docs/PR-DISPOSITION-20260914.md`; non-ancestor work is neither integrated nor
automatically valid for this head.

## Cross-repository consumer boundaries

### Kosmos-Oden

[Kosmos issue #40](https://github.com/Odenknight/Kosmos-Oden/issues/40) remains
open. Engine owns deterministic planning, Effects encoding and Node host
contracts. Kosmos owns the Obsidian/native adapter, durable adoption and
lifecycle wiring, product UI/status/recovery, secrets/provider transport,
credential-bound agent roots/tools, platform/browser/security acceptance and
the exact released Engine pin. Its historical development commit pin is not a
released 2.2 dependency. Engine completion cannot claim Kosmos integration,
product release or owner-vault activation.

### GKOS-Engine-Rust

[Rust issue #2](https://github.com/Odenknight/GKOS-Engine-Rust/issues/2) remains
open under the accepted 3.0/M0-M7 program. Its frozen TypeScript oracle remains
`8207958047b3361ae21ac07c5a2abbd26a42a684`; post-oracle Effects/no-change and
assistance material requires an accepted, separately versioned new-contract
lane and shared vectors. Initial closure is pure parity plus synthetic/dry-run
effects under Rust program gates. Native execution, scale/soak and consumer
qualification are later gates. No Rust parity, Rust release, browser-WASM
replacement or Lite write authority follows from Engine 2.2 source.

## Audit limits

No builds, tests, benchmarks, soak runs, hardware tests, repository writes
outside this report/roadmap, commits, pushes, merges, releases or downstream
changes were performed. All pending evidence above remains pending.
