# Evidence Traceability and Verification Record

## Evidence cutoff

This assessment records repository state observed on **2026-08-15**. Commit-pinned links are authoritative for what was reviewed; branch heads may move later.

## Source baseline

| Repository/input | Exact baseline | Public reference |
|---|---|---|
| Local `GKOS-Engine-check` checkout | `c2994723774d05f6ef3723227e06178940851c93`, package 1.0.4 | Local migration constraint; not treated as current upstream. |
| GKOS Engine main | `ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c` | [Commit](https://github.com/Odenknight/GKOS-Engine/commit/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c) |
| GKOS Engine latest tag used | `v2.0.1`, commit `7c742436…` | [Tag tree](https://github.com/Odenknight/GKOS-Engine/tree/v2.0.1) |
| GKOS Standard main | `dbbbccef6571137274e56c40f45a87dbdc6dc762` | [Commit](https://github.com/Odenknight/gkos-standard/commit/dbbbccef6571137274e56c40f45a87dbdc6dc762) |
| Kosmos-Oden main | `8147ea10a4525ed1bf80ad7e6ea7f51c13c28f2c` | [Commit](https://github.com/Odenknight/Kosmos-Oden/commit/8147ea10a4525ed1bf80ad7e6ea7f51c13c28f2c) |
| Engine-Lite main | `2ebbf77583af3e83032054f1256188dc56376907`, package 1.1.3 | [Commit](https://github.com/Odenknight/GKOS-Engine-Lite/commit/2ebbf77583af3e83032054f1256188dc56376907) |
| Kosmos-Oden-Lite main | `ebe8d319adb8a48d1f8be71974a416a7fc03f1e4`, public frozen 1.0.6 line | [Commit](https://github.com/Odenknight/Kosmos-Oden-Lite/commit/ebe8d319adb8a48d1f8be71974a416a7fc03f1e4) |

The two upstream repositories explicitly requested by the user were reviewed at current remote state, not only through the older workspace checkout: [GKOS Engine](https://github.com/Odenknight/GKOS-Engine) and [GKOS Standard](https://github.com/Odenknight/gkos-standard).

## Local proposal evidence

| Input | Main contribution to assessment |
|---|---|
| `Fable_assessment.md` | Short external review and initial issue list. |
| `Fable_GKOS_NAVIGATION_MOC_PLAN_ASSESSMENT.md` | Architectural verdict, phase recommendations, and seven identified refinements. |
| `01_GKOS_ENGINE_NAVIGATION_MOC_BUILD_PLAN.md` | Core policy, discovery/generation/diff/audit, CLI, archive, lock, rollback, phases. |
| `02_DOWNSTREAM_MOC_CASCADE_BUILD_PLAN.md` | One semantic implementation, consumer capabilities, contract fixtures, cascade order. |
| `03_KOSMOS_ODEN_MOC_INTEGRATION_PLAN.md` | Plugin/standalone/agent behavior and Kosmos write path. |
| `04_GKOS_STANDARD_MOC_IMPLICATIONS_AND_UPGRADE_PLAN.md` | No-layer-change rationale, Navigation-only/governed modes, proposal and schema path. |

All six inputs were read in full. No input file was rewritten by this assessment.

## Engine code evidence

| Observation | Primary source |
|---|---|
| Package is still 2.0.1 and exports root/adapter/GKX/Graphiti surfaces | [`package.json`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/package.json) |
| Public GKX namespace and validating projection are distinct coordinates | [`src/version.ts`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/src/version.ts) |
| Platform-neutral adapter boundary | [`src/adapter.ts`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/src/adapter.ts) |
| Default ignores and FNV-style convenience hash | [`src/paths.ts`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/src/paths.ts) |
| Path-based file node identity and graph construction | [`src/graph.ts`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/src/graph.ts) and [`src/types.ts`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/src/types.ts) |
| Rename event is accepted but delta/cache behavior is insufficient for Navigation | [`src/incremental.ts`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/src/incremental.ts) |
| Existing CLI includes output-writing graph/export behavior | [`bin/gkx.mjs`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/bin/gkx.mjs) |
| Scientific digest canonicalizes content and is not a raw-byte archive proof | [`src/science/canonicalize.ts`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/src/science/canonicalize.ts) |
| Existing migration utilities contain SHA-256/run concepts but not the proposed Navigation protocol | [`src/gkx-migration.ts`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/src/gkx-migration.ts) |
| Contract changes should be proposed before implementation; no automatic authoritative writes | [`ROADMAP.md`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/ROADMAP.md) |
| Current source/tag/version policy reference | [`VERSIONING.md`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/VERSIONING.md) |
| Traceability still names an older standard target | [`TRACEABILITY.md`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/TRACEABILITY.md) |
| Requirement-adapter document still identifies Engine 2.0.0 | [`docs/GKOS-REQUIREMENT-ADAPTER.md`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/docs/GKOS-REQUIREMENT-ADAPTER.md) |
| Adding a public subpath requires build/package-list updates | [`scripts/build.mjs`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/scripts/build.mjs) and [`scripts/check-pack.mjs`](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/scripts/check-pack.mjs) |

The remote main versus `v2.0.1` comparison covered 19 changed files and approximately 1,692 added lines, principally the experimental scientific-research surface. That is the basis for the release-baseline warning.

## Standard evidence

| Observation | Primary source |
|---|---|
| Seven-layer model and derived-result re-entry boundary | [`standard/00_GKOS_Master_Standard.md`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/standard/00_GKOS_Master_Standard.md) and [`standard/annexes/Layer_Interface_Contracts.md`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/standard/annexes/Layer_Interface_Contracts.md) |
| Sensitivity, audit/provenance inheritance, retention, legal hold, and governed erasure | [`standard/annexes/Security_Privacy_Retention.md`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/standard/annexes/Security_Privacy_Retention.md) |
| Engine-rooted release train and projection-observable versioning | [`VERSIONING.md`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/VERSIONING.md) |
| Compatibility narrative has older coordinates | [`COMPAT.md`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/COMPAT.md) |
| Newer implementation compatibility matrix | [`docs/implementation/VERSION_COMPATIBILITY_MATRIX.md`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/docs/implementation/VERSION_COMPATIBILITY_MATRIX.md) |
| Independent implementation must not invoke/import Engine or use it as oracle | [`governance/portfolio/GKX-INDEPENDENT-IMPLEMENTATION-RULE.md`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/governance/portfolio/GKX-INDEPENDENT-IMPLEMENTATION-RULE.md) |
| Adapter must not have persistence side effects | [`governance/portfolio/GKX-ADAPTER-LIMITS.md`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/governance/portfolio/GKX-ADAPTER-LIMITS.md) |
| Permanent requirement-ID governance | [`requirements/REGISTRY.md`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/requirements/REGISTRY.md) and [`decisions/R13_Conformance_Honesty_and_Alignment_Proposal.md`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/decisions/R13_Conformance_Honesty_and_Alignment_Proposal.md) |
| L5 note-patch proposal envelope is distinct from a standards governance proposal | [`schemas/proposal-envelope.schema.json`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/schemas/proposal-envelope.schema.json) and [`schemas/decision-record.schema.json`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/schemas/decision-record.schema.json) |
| Provisional schemas require evidence before promotion | [`schemas/provisional/README.md`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/schemas/provisional/README.md) |
| Diagnostic code structural constraint | [`schemas/diagnostics-sidecar.schema.json`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/schemas/diagnostics-sidecar.schema.json) |
| Current frontmatter contract remains GKX 2.0 | [`schemas/gkx-frontmatter-2.0.schema.json`](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/schemas/gkx-frontmatter-2.0.schema.json) |

## Kosmos evidence

| Observation | Primary source |
|---|---|
| Application version and Engine pin | [`package.json`](https://github.com/Odenknight/Kosmos-Oden/blob/8147ea10a4525ed1bf80ad7e6ea7f51c13c28f2c/package.json) |
| Eleven manifest-name heuristics and folder-name priority | [`src/renderer/cosmology.ts`](https://github.com/Odenknight/Kosmos-Oden/blob/8147ea10a4525ed1bf80ad7e6ea7f51c13c28f2c/src/renderer/cosmology.ts) |
| Existing preview/backup/write migration boundary | [`src/plugin/gkx-migration.ts`](https://github.com/Odenknight/Kosmos-Oden/blob/8147ea10a4525ed1bf80ad7e6ea7f51c13c28f2c/src/plugin/gkx-migration.ts) |
| Standalone basename ignore behavior | [`src/standalone/directory-source.ts`](https://github.com/Odenknight/Kosmos-Oden/blob/8147ea10a4525ed1bf80ad7e6ea7f51c13c28f2c/src/standalone/directory-source.ts) |
| Plugin vault source behavior | [`src/plugin/vault-provider.ts`](https://github.com/Odenknight/Kosmos-Oden/blob/8147ea10a4525ed1bf80ad7e6ea7f51c13c28f2c/src/plugin/vault-provider.ts) |
| Nextcloud sync behavior and conditional-write integration point | [`src/plugin/nextcloud-sync-core.ts`](https://github.com/Odenknight/Kosmos-Oden/blob/8147ea10a4525ed1bf80ad7e6ea7f51c13c28f2c/src/plugin/nextcloud-sync-core.ts) |

## Verification record

Clean temporary copies were used so dependency installs and generated reports did not alter the user’s source checkout.

### GKOS Engine at `ea7c326`

```text
npm ci                    PASS
npm run typecheck         PASS
npm test                  PASS — 199 tests; 198 pass, 1 skip, 0 fail
package-content check     PASS — 91 files; 284,010 bytes
license check             PASS — Apache-2.0
```

### GKOS Standard at `dbbbccef`

```text
npm test                  PASS — 6/6
npm run srtp:draft        PASS — 6 positive and 16 adversarial fixtures
```

No Navigation/MOC implementation PR or issue was found in the public repositories at the evidence cutoff. The assessment therefore evaluates proposed work against current released/main contracts rather than reviewing an existing Navigation patch.

## Claim-to-evidence map

| Claim | Evidence |
|---|---|
| Navigation can be additive without a layer/schema rewrite | Current master standard/layer contracts plus the proposal’s projection boundary; no required frontmatter/relation field identified. |
| Generated output would self-feed without masking | Engine scans live Markdown and graph construction consumes links; proposed live MOCs are Markdown with generated links. This is a direct architectural inference from the cited Engine sources. |
| Exact bytes are a new requirement | Engine records omit source bytes; hybrid preservation/archive checks require them. |
| Current graph delta is insufficient for affected scopes | Incremental input supports renames, returned delta omits them, and fingerprints omit Navigation-relevant fields. |
| Kosmos cannot be the independent implementation | It pins and calls Engine; the independent rule forbids that dependency/oracle relationship. |
| Release-anchor and clean-room policies need reconciliation | Ratified `VERSIONING.md` gives Engine sole first-party semantic/version anchoring, while the proposed independent rule requires a standards-only implementation path. The assessment distinguishes product release authority from conformance evidence. |
| “Write adapter” is a naming/contract collision | The adapter-limit rule prohibits persistence side effects. |
| Current 2.1.0 allocation is occupied by baseline work | Main is materially past `v2.0.1` while its version remains unchanged. |
| A synchronized lock is not a distributed transaction | Nextcloud is an external concurrent source and the current plan has no distributed lease service; local lease plus conditional writes is the bounded guarantee. This is an engineering inference, to be confirmed in integration tests. |
| Archive exclusion must be cross-host | Engine and Kosmos providers currently enumerate/ignore paths differently. |

## Limitations and assumptions

- Public repository state may change after the pinned commits.
- Private or inaccessible GKOS-related repositories were not inspected; no claims about their internal behavior are made.
- No live Obsidian or Nextcloud deployment was mutated. Sync conclusions are code/contract analysis pending integration testing.
- No production corpus was benchmarked; the upgrade plan requires empirical performance baselines.
- The schema rewrite in this packet is a design deliverable, not generated JSON Schema files or production code.
- Retention/legal-hold analysis expresses technical contract needs and is not jurisdiction-specific legal advice.
- The local `build_instruct` tree was already untracked in the workspace. This assessment adds only the Markdown output directory and does not stage or commit it.

## Reproduction notes

To revalidate later, use the pinned commits, perform clean dependency installations, run the same repository-native checks, and compare current branch heads/tags/compatibility declarations with this record. Any changed public contract should produce a dated superseding assessment rather than silently editing these conclusions.
