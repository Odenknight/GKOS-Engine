# Engine MOC plan review — TypeScript and Rust

Reviewed 2026-09-05. Documentation-only deliverable; no repository publication,
code change, runtime activation, release or conformance claim.

## Findings

| Build | GitHub state inspected | Existing coverage | Disposition |
| --- | --- | --- | --- |
| TypeScript | `Odenknight/GKOS-Engine` main `d81f9d1351f1a9228650a840629191a92f2dfb22` | Navigation 1.0, Effects 1.0 contract, ADR, reconciliation order, Node executor and qualification evidence | Existing foundation is useful; add an end-to-end MOC completion plan with measurable gates. |
| Rust main | `Odenknight/GKOS-Engine-Rust` main `19058b21acbf84c1327b4a5291decac181a557ad` | README, LICENSE, THIRD-PARTY-NOTICES only | Do not describe main as an implemented Rust build. |
| Rust planning | Same repo, `integration/m0` at `7ab22b5dccb3992a777f5787072ba9bf617c7860` | Master r5.4, deployment r2.4, registry r4.4 and downstream companion | A Rust plan exists on GitHub. Add a MOC-specific companion subordinate to its M0–M7 order and activation boundary. |
| Rust bootstrap branch | `wp/04-workspace` at `637c32ce75c1e216081658f3da29ede7e58e5bad` | Cargo workspace and planned component crates | Bootstrap presence does not establish MOC implementation or acceptance. |

The search covered default-branch recursive trees, branch inventories, TS
`rust-3.0`, Rust `integration/m0` and `wp/04-workspace`, current plan files and
MOC issue/PR searches. No dedicated end-to-end MOC maintenance plan was found in
those inspected current surfaces. This is not a claim that every historical
branch, discussion or unpublished local file was exhaustively searched.

## Review conclusions

1. **Keep the existing separation.** TS and Rust documents correctly keep
   Navigation read-only and effects separately authorized. Optional models
   should remain host-invoked proposal providers, outside Navigation.
2. **Complete operational gates.** A planner and archive executor do not establish
   automatic maintenance. Durable queue admission, incremental scope mapping,
   ownership advancement, self-event suppression, partial-run recovery,
   shutdown, startup readiness and downstream adapter behavior need explicit
   acceptance cases.
3. **Treat the local assistance work as a candidate.** The prior turn's
   `feature/deterministic-moc-assistance-20260905` changes remain uncommitted
   locally. They were absent from inspected TS main. Their tests do not prove
   Obsidian integration, live-model quality, bounded concurrent admission,
   incremental performance or a released Engine artifact.
4. **Do not move the Rust oracle.** The Rust master freezes TS
   `8207958047b3361ae21ac07c5a2abbd26a42a684`. New Effects behavior belongs to
   a separately pinned new-contract test lane. The downstream companion already
   distinguishes `oracle_capture`, `consumer_capture` and `effects_case`.
5. **Refresh stale status without rewriting history.** Rust r5.4 references
   PR #40 as outstanding input; GitHub reports it merged at
   `6abfc5f4cc4953cf2f0ea51ba1cd1bb81f0c51a1` on 2026-09-05 UTC.
   Add a drift-ledger/status correction, preserving frozen oracle and archived
   plans. TS ROADMAP still centers on 2.0.x and does not serve as the current
   MOC completion schedule. Its prohibition on automatic authoritative approval
   is compatible with separately authorized mechanical MOC maintenance.
6. **Qualify actual guarantees.** TS documents disclose cooperative-vault
   filesystem assumptions and lack of directory-entry fsync guarantees. Rust
   must establish its own handle/path and durability behavior. Language choice
   alone does not remove filesystem races or prove power-loss safety.
7. **Define suggestion semantics and promotion.** Keep authored, derived,
   proposed, approved and effective tags distinct, as the Rust master requires.
   Deterministic extraction is not semantic inference; LLM confidence cannot
   approve links, assign a lineage winner or reduce sensitivity.

No existing plan was replaced. The two new companion plans are proposed
repository documents, ready for review and later registry admission. This
request did not require a GitHub write, so no issue, PR or branch was published.

## Deliverables

- [TypeScript MOC completion plan](ENGINE-TS-MOC-BUILD-PLAN.md)
- [Rust MOC implementation plan](ENGINE-RUST-MOC-BUILD-PLAN.md)

## Evidence links

- [TS Effects contract](https://github.com/Odenknight/GKOS-Engine/blob/d81f9d1351f1a9228650a840629191a92f2dfb22/docs/NAVIGATION-EFFECTS-CONTRACT.md)
- [TS reconciliation plan](https://github.com/Odenknight/GKOS-Engine/blob/d81f9d1351f1a9228650a840629191a92f2dfb22/docs/navigation-effects/RECONCILIATION-20260827.md)
- [TS reconciliation evidence](https://github.com/Odenknight/GKOS-Engine/blob/d81f9d1351f1a9228650a840629191a92f2dfb22/evidence/2026-09-04-navigation-effects-current-main-reconciliation.md)
- [TS roadmap](https://github.com/Odenknight/GKOS-Engine/blob/d81f9d1351f1a9228650a840629191a92f2dfb22/ROADMAP.md)
- [PR #40 merged state](https://github.com/Odenknight/GKOS-Engine/pull/40)
- [Rust main README](https://github.com/Odenknight/GKOS-Engine-Rust/blob/19058b21acbf84c1327b4a5291decac181a557ad/README.md)
- [Rust master r5.4](https://github.com/Odenknight/GKOS-Engine-Rust/blob/7ab22b5dccb3992a777f5787072ba9bf617c7860/docs/plans/GKOS_ENGINE_3.0_RUST_MASTER_BUILD_PLAN_2026-09-05_r5.4.md)
- [Rust planning registry r4.4](https://github.com/Odenknight/GKOS-Engine-Rust/blob/7ab22b5dccb3992a777f5787072ba9bf617c7860/docs/plans/GKOS_ENGINE_RUST_PLAN_REGISTRY_2026-09-05_r4.4.md)
- [Rust downstream companion](https://github.com/Odenknight/GKOS-Engine-Rust/blob/7ab22b5dccb3992a777f5787072ba9bf617c7860/docs/plans/companions/downstream-kosmos/DOWNSTREAM-INTEGRATION-COMPANION-draft2-claude-fable-gkos.md)
