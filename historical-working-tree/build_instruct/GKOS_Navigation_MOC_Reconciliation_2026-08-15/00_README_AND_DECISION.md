# GKOS Navigation/MOC Reconciliation — Decision and Reading Guide

**Assessment date:** 2026-08-15  
**Decision status:** Proceed in stages after contract and safety reconciliation  
**Scope:** The six local `build_instruct` assessments/plans, current `GKOS-Engine` main, current `gkos-standard` main, and the public consumers whose behavior materially constrains the design.

## Executive decision

The Navigation/MOC proposal should proceed. It can materially improve GKOS usability by making large corpora easier to enter, traverse, audit, and package for bounded context, while giving GKOS Engine a useful projection capability that remains downstream of the evidence graph.

It should **not** be implemented exactly as currently written. The proposal is directionally sound, but four blocking boundaries must be made explicit first:

1. Generated navigation must not feed back into the evidence graph in Navigation-only mode.
2. Markers must not, by themselves, authorize overwriting a file; an ownership registry must grant that authority.
3. Any write-capable implementation needs raw-byte digests, a write-ahead recovery journal, stale-plan checks, and per-file atomic replacement.
4. A consumer that calls GKOS Engine is not an independent standards implementation, and a write-capable component must not be called a GKX adapter under the proposed adapter-limit rule.

With those reconciliations, the proposal improves both projects without changing the seven GKOS layers, the GKX 2.0 public machine namespace, the frontmatter schema, or the typed-relation vocabulary.

## Baseline used for this assessment

| Surface | Baseline inspected | Consequence |
|---|---|---|
| Local Engine checkout | `c2994723774d05f6ef3723227e06178940851c93` / package `1.0.4` | Useful as a migration constraint only; it is not the current implementation baseline. |
| [GKOS Engine main](https://github.com/Odenknight/GKOS-Engine/commit/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c) | `ea7c326`, two commits beyond tag `v2.0.1` | Current main contains unreleased scientific-research additions while still identifying as `2.0.1`; release hygiene must be repaired before Navigation is versioned. |
| [GKOS Engine v2.0.1](https://github.com/Odenknight/GKOS-Engine/tree/v2.0.1) | `7c742436` | Last tagged Engine baseline. |
| [GKOS Standard main](https://github.com/Odenknight/gkos-standard/commit/dbbbccef6571137274e56c40f45a87dbdc6dc762) | `dbbbccef`, release family `GKOS-2026-08-05`, `v0.78` | The current governance and compatibility rules are the standards baseline. |
| [Kosmos-Oden main](https://github.com/Odenknight/Kosmos-Oden/commit/8147ea10a4525ed1bf80ad7e6ea7f51c13c28f2c) | `8147ea1`, application `0.7.0`, Engine pin `v2.0.1` | It already has a write-capable migration workflow, eleven MOC-name heuristics, and separate plugin/standalone/Nextcloud source paths that Navigation must reconcile. |
| [Engine-Lite main](https://github.com/Odenknight/GKOS-Engine-Lite/commit/2ebbf77583af3e83032054f1256188dc56376907) | `2ebbf775`, package `1.1.3` | It should remain a thin command-surface wrapper and does not need Navigation write commands; its version relationship is already behind the standard policy. |
| [Kosmos-Oden-Lite main](https://github.com/Odenknight/Kosmos-Oden-Lite/commit/ebe8d319adb8a48d1f8be71974a416a7fc03f1e4) | `ebe8d319`, public frozen line `1.0.6` | No Navigation feature backport; only a narrowly scoped archive-ignore compatibility patch is appropriate if shared vaults require it. |

Repository observations are pinned to the commits above so that later repository changes do not silently alter this assessment.

## Outcome by concern

| Concern | Decision |
|---|---|
| Seven-layer model | No change. Navigation is a projection over GKX/evidence state. |
| GKX namespace | Keep public namespace `2.0`; keep the Engine validating projection coordinate distinct (`gkx-2.3-validating-projection`). |
| New frontmatter fields or relation kinds | None in the first release. |
| Navigation-only mode | Ship first. Generated regions are excluded from evidence semantics but retained in a navigation registry. |
| Governed re-entry mode | Defer until the standard adopts explicit authorship, provenance, sensitivity, and evidence requirements. |
| Pure planning core | Approve after the schema rewrite in this packet. |
| Filesystem mutation | Ship later behind an explicit apply command and a recoverable executor protocol. |
| Kosmos-Oden integration | Make Engine classification primary and the existing local heuristic a fallback; reuse a shared host execution layer. |
| Independent standards evidence | Require a clean-room implementation that consumes only the proposal, schemas, and fixtures—not Engine code or output as an oracle. |
| System Map | Defer its richer state model until `live`, `leftover`, and `ghost` have deterministic definitions. |
| LLM-assisted grouping | Accept only an explicit approved-grouping input in the initial contract; direct model calls remain proposal-only. |

## Release recommendation

The original plan assigned read-only Navigation to Engine `2.1.0`. That number is no longer clean because Engine main already contains substantial post-`v2.0.1` behavior under the unchanged `2.0.1` version.

The preferred release train is:

1. **Engine 2.1.0 — baseline repair:** version and tag the already-landed post-2.0.1 work, repair compatibility/traceability drift, and fix incremental rename metadata before Navigation depends on it.
2. **Engine 2.2.0 — Navigation core:** discovery, deterministic planning, diff, audit, context-pack assembly, schemas, fixtures, and source-corpus-preserving CLI commands.
3. **Engine 2.3.0 — reference Node executor:** explicit apply, rollback, history, raw-byte archives, write-ahead recovery, and capability reporting.
4. **Later minor release:** affected-scope optimization, richer System Map semantics, and approved intelligence integration only after their contracts are proven.

An alternative is to remove the unreleased post-tag work from the release line and reclaim `2.1.0` for Navigation, but that is a repository-history/release decision and is not assumed here.

## Required implementation gates

- No source mutation until ownership, raw-byte, stale-plan, recovery, and rollback tests pass.
- No standards promotion until a clean-room implementation passes the same conformance fixtures.
- No Kosmos writer rollout until plugin, standalone, and Nextcloud path-ignore behavior is unified.
- No archive pruning without retention, legal-hold, sensitivity, and governed-erasure rules.
- No deterministic-token-budget claim unless a tokenizer identity and version are part of the input contract.
- No assertion of batch atomicity; the contract guarantees per-file atomic replacement and batch recoverability.

## Deliverables

1. [Evidence and impact assessment](01_EVIDENCE_AND_IMPACT_ASSESSMENT.md)
2. [Collision register and reconciliation plan](02_COLLISION_AND_RECONCILIATION_PLAN.md)
3. [Final Navigation contract and schema rewrite](03_FINAL_ENGINE_NAVIGATION_SCHEMA_REWRITE.md)
4. [Software upgrade and release plan](04_SOFTWARE_UPGRADE_AND_RELEASE_PLAN.md)
5. [GKOS Standard update plan and replacement text](05_GKOS_STANDARD_UPDATE_PLAN.md)
6. [Cross-ecosystem impact analysis](06_ECOSYSTEM_IMPACT_ANALYSIS.md)
7. [Evidence traceability and verification record](07_EVIDENCE_TRACEABILITY.md)

## Interpretation

“Read-only” in the source plans is replaced throughout this packet with **source-corpus-preserving**. Existing Engine commands can write reports and exports, so “read-only” is otherwise ambiguous. “Write adapter” is replaced with **executor** or **storage backend**. “MOC” is retained as the user-facing artifact name, while **Navigation Projection** is the contract term.
