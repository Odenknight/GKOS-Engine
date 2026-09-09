# Standard / Hindsight repository audit

Audit date: 2026-08-31. Scope: source, machine contracts, fixtures, unmerged work, bounded local execution, and current remote metadata. This is self-attested audit evidence, not an independent conformance certificate or release/cutover authorization.

## Outcome

Standard v0.81 is **not implementation-complete**, despite the R18 branch passing its existing synthetic tests. Main remains published v0.80 plus accepted unpublished R17. The unmerged R18 branch adds five requirements and five gates, but does not integrate a complete GCP-4/GCP-5 conformance executor or release closure. Missing-input gates incorrectly open, and canonical encoding accepts invalid inputs.

Hindsight has a substantial contract/SQL foundation, **not a working governance gateway**. Its Python and Rust lanes contain only inert scaffold assertions. Its current component locks still block admission-provider, receipt-contract, runtime, and model identity closure. Upstream Engine PR31 has since merged, so “provider PR still open” is stale; adoption/pinning remains missing locally.

The owner confirmed in the current parent task: **“Aug 29 changes are ratified.”** This resolves the initially observed Aug27/Aug29 authority conflict. Aug29 controls: DDCV is non-gating for Standard v0.81, and one-release automatic publication is authorized only after exact-bound mandatory green closure. It does not authorize Engine/Lite release or Rust authority cutover. The source branch is nevertheless unmerged, and ratification does not make its incomplete executor sufficient.

## 1. Immutable coordinates and unmerged inventory

| Repository / ref | Exact source | Standing |
|---|---|---|
| Standard main | `71b899473473f47172b181973027f3eb7da25104` | Current remote main; zero open PRs |
| Standard v0.80 | Commit `d04011ec296c4e2ee24224a2e4a8f2e0e29f3dbe`; annotated tag object `9ef9507f0d1760d2bf63be6444df7da579cf11e0` | Latest observed release tag |
| Standard R18 | `aa9a05315a9a767bd672aa2bb5179c963d9d66ca`, branch `work/v081-track-a-r18`, base `6a7ad71fc027894cd4e2bbb71c3bbadda06cd12f` | One preparation commit; no PR |
| Hindsight main | `59af4d1080efb0eae147d2aec0c0b1b75461b761` | Private; zero open PRs and no tags |
| Hindsight WP1 | PR1 head `63858ea542e031ebec37de721b09dcd9977c132e`, base `5a74df3f2038944757e1ad207e37c23c7337ecd6` | Merged into current main on Aug27; retained branch is not unmerged functionality |

Standard tags also observed: v0.79 `9380f5e1b9a4cbad2c252ce214b65628124e9386`, v0.78 `b1dcfcc80968b41277b707af000b8ff7ff3845ed`, v0.77 `2001ad16132113127198178214e5d0a87d1bc4fe`. There is no v0.81 tag.

All 26 Standard PRs and Hindsight's one PR were inventoried, including head/base/state/merge status, in [the machine ledger](AUDIT-STANDARD-HINDSIGHT.ledger.json). Relevant closed-unmerged Standard work:

- PR11 / `agent/p2-p3-evidence-gates`, head `4e710a381b8c97d27460f14f3f38c974a8f8e712`: four historical blocked KRR/fixture governance documents, not current executor code. They must not replace subsequent R16/R17/R18 decisions.
- PR9 / `agent/gkx-compatibility-r12-20260803`, head `14021ff9448b88a0fd4fac3cd535356dd825c3cb`: R12 decision content is already substantially present in main; the inspected decision-record comparison differs only in quotation punctuation. Do not reapply its broad older README patch.
- Other remote heads generally correspond to merged/squashed PRs. Git ancestry alone would incorrectly classify many as new work.

No applicable AGENTS.md was found in either repository tree or the checked workspace ancestors. No existing user worktree was modified. Public Standard clones use detached checkouts. Private Hindsight Git transport was unavailable to the shell account; its connected GitHub account delivered all 257 source files, each verified against the remote Git blob SHA1. The commit's actual Git tree is `4ab4e928dd20855925b1e10ef49e1e2f9c58b3bb`, verified through the immutable Git-commit endpoint and that exact tree endpoint; all 257 ledger blob identities match. The source ledger now separates `requested_treeish` (commit) from `actual_tree_sha`; see [tree verification](evidence/hindsight-tree-verification.json). The snapshot has an explicitly authorized **synthetic local staged index, no commit, no remote, and no original history**. It is not represented as a full Git clone. Snapshot transport added one LF, removed mechanically only after checking that removal yielded the exact remote blob hash.

## 2. Standard standing and actual mechanics

[R17](https://github.com/Odenknight/gkos-standard/blob/71b899473473f47172b181973027f3eb7da25104/decisions/R17_Authority_Validity_Interval_Development_Decision_Record.md#L1) remains accepted/unpublished. Its half-open interval is `valid_from <= evaluation_time < valid_until`; absent or malformed required time evidence refuses. Main correctly keeps separate R17 applicability/schema/diagnostic overlays. Main registry lint observes 57 requirements and 23 gates.

[R18](https://github.com/Odenknight/gkos-standard/blob/aa9a05315a9a767bd672aa2bb5179c963d9d66ca/decisions/R18_Track_A_GCP45_and_Authorized_Independent_Review_Development_Decision_Record.md#L117) and [the v0.81 ledger](https://github.com/Odenknight/gkos-standard/blob/aa9a05315a9a767bd672aa2bb5179c963d9d66ca/docs/implementation/V081_RATIFIED_BASELINE.md#L14) are ratified preparation authority per the current owner confirmation. They introduce REVIEW-001..004 and DISCLOSURE-001, bounded independent-agent review, 28 portable gate twins, and R17 consolidation. Branch registry lint sees 62 requirements/28 gates, but this includes the retained superseded DELEGATION-004 registry entry; count alone is not an active-profile completion proof.

No R19 decision or DDCV schema/fixture/runner bundle exists in the inspected main or R18 trees; searching all fetched Standard history found no DDCV/R19 implementation commit. The branch says R19 is expected after collision review, not allocated. DDCV remains provisional, informative, non-normative, non-qualifying and now **non-gating for v0.81**. Historical Aug27 playbook requirements that G1 block publication are superseded for this release by the owner's confirmed Aug29 changes. DDCV implementation/adoption work still needs its own exact packet.

[SRTP](https://github.com/Odenknight/gkos-standard/blob/71b899473473f47172b181973027f3eb7da25104/fixtures/provisional/science/fixtures.manifest.json) is concretely implemented as a separate draft graph evaluator, twelve draft schemas, six positive and sixteen negative fixtures (22 total), with `qualifying_profiles: []`. Tests exercise exact/tolerance rerun conditions, reentry closure, missing code/environment/source/artifact, reviewer self-approval, deterministic/model conflict, sensitivity, context expiry, and incompatible versions. This is draft graph/receipt evidence, not live scientific execution or normative profile qualification.

The [starter runner](https://github.com/Odenknight/gkos-standard/blob/71b899473473f47172b181973027f3eb7da25104/conformance/runner/run.mjs#L30) loads only `fixtures/fixtures.manifest.json`. Its Engine adapter calls `buildGkx23Projection`, not authoritative governed history/currentness. Two pair/graph expectations remain explicitly UNEVALUATED. GCP6 replay and GCP7 authority tests are separate mechanism evidence, not complete cumulative profiles. R18 does not change that runner loading path.

The current main release script fails locally with **“expected 29 R16 allocations, found 30”** after R17 entered the registry. The three v0.80 release-directory checksums match the immutable tag blobs; the published release was not found corrupted. Current CI green does not contradict the script failure: [release-validation.yml](https://github.com/Odenknight/gkos-standard/blob/71b899473473f47172b181973027f3eb7da25104/.github/workflows/release-validation.yml) checks required files/draft paths but never invokes `scripts/check-current-release.sh`.

## 3. Reproduced Standard defects and completion gaps

| ID / priority | Evidence | Required implementation work |
|---|---|---|
| STD-01 / P1 | [R18 gate evaluator](https://github.com/Odenknight/gkos-standard/blob/aa9a05315a9a767bd672aa2bb5179c963d9d66ca/conformance/runner/gate-evaluator.mjs#L3) returns `null` (open) for authority missing both interval endpoints, missing context hashes, missing digest pair, missing restrictiveness levels, missing authorization/action hashes, and an impossible canonical timestamp. All six probes reproduced. | Validate typed inputs first; reject missing/unknown/indeterminate values; use shared full calendar/interval validation; add mutation families, not only one idealized boolean twin. |
| STD-02 / P1 | [Main canonical encoder](https://github.com/Odenknight/gkos-standard/blob/71b899473473f47172b181973027f3eb7da25104/conformance/runner/canonical.mjs#L6) accepts `2026-99-99T12:00:00.000000Z` under `compiled_at`; accepts a lone UTF-16 surrogate and CBOR-encodes replacement character U+FFFD. | Enforce valid calendar timestamps and well-formed Unicode without silent source changes; test encoder and verifier against the canonical annex. These findings concern Standard's helper, not an assertion that Engine shares the bug. |
| STD-03 / P1 | [R18 test](https://github.com/Odenknight/gkos-standard/blob/aa9a05315a9a767bd672aa2bb5179c963d9d66ca/conformance/runner/test/track-a-gates.test.mjs) checks only two calls per synthetic case. [Registry lint](https://github.com/Odenknight/gkos-standard/blob/aa9a05315a9a767bd672aa2bb5179c963d9d66ca/conformance/runner/registry-lint.mjs#L17) counts manifest-declared expected codes without executing them. [Track-A catalog](https://github.com/Odenknight/gkos-standard/blob/aa9a05315a9a767bd672aa2bb5179c963d9d66ca/fixtures/track-a/fixtures.manifest.json) marks only five new requirement sets complete, none for complete GCP4. | Wire actual fixtures through a Standard-owned executor; bind tested inputs/results to catalog entries; require receipt schema, protected pre/post state, no unauthorized effects, and replay/idempotency evidence. Prevent merely listed codes from satisfying strict executable coverage. |
| STD-04 / P1 | R18 reviewer fixture checks model-family string inequality and a handful of booleans. It does not verify grant version/expiry, capability lease, model/version evidence, sealing, forbidden self-review subjects, or all escalation reasons. | Implement and test the full seven-condition review boundary and human escalation set; record evaluated/effective decisions, exact actors/models/policies/gates/evidence/authority/time. Different labels alone are not independence. |
| STD-05 / P2 | Main release checker hard-coded counts disagree with merged R17; R18 still carries Aug29 release-candidate dates while no release exists. Existing CI does not run exact release closure or strict mutation lint. | Make release-candidate metadata internally consistent without rewriting v0.80; check actual publication date, full exact-source/dependency/env/artifact closure, mandatory-capability lanes, and fail on every unexplained skip/held/unevaluated result. |
| STD-06 / P2 | Claim evaluator remains starter-only; R17 consolidation in branch removes overlay consumption but adds no explicit parity test of retained old overlay semantics. | Complete GCP4/5 applicable sets and lifecycle fixtures; reconcile superseded conditional applicability; assert consolidation parity and historical v0.80/R17 compatibility. Preserve empty profile claims until derived eligibility is genuinely satisfied. |

Reproduction is preserved in [standard-boundary-probes.mjs](evidence/standard-boundary-probes.mjs), [portable usage instructions](evidence/standard-boundary-probes-USAGE.md), and [the explicit-checkout rerun](evidence/standard-boundary-probes-portable.txt); [the original output](evidence/standard-boundary-probes.txt) is retained as historical audit evidence. Published-bundle users supply `--main-checkout <repository-root>` and `--r18-checkout <repository-root>` at the exact audited commits; the helper no longer requires the unpublished audit directory layout. No-argument execution retains only the explicitly documented original-local-layout convenience default. Both paths reproduced all eight observations, and the helper verifies checkout HEADs and unchanged probe-target modules before importing them. These probes intentionally report observed bad acceptance; process exit 0 means the diagnostic ran, not that the behavior passed.

## 4. Hindsight gate mechanics: implemented contract, missing runtime

[Adjudication contract](https://github.com/Odenknight/gkos-hindsight-governance/blob/59af4d1080efb0eae147d2aec0c0b1b75461b761/contracts/adjudication/v1/ADJUDICATION-CONTRACT.md#L19):

1. Stage0 deterministic validity produces VALID or REVIEW_INVALID/quarantine. Any failed or unevaluated required check prevents a disposition.
2. Stage1 computes pre-review risk evidence.
3. Stage2 independently creates claim-by-claim semantic assessment evidence; the reviewer cannot approve or materialize.
4. Stage3 verifies the hash-bound receipts/policy and chooses monotonically: priority human review before ordinary human review before the narrow AUTO_ADMIT_DERIVED lane. Lower-priority evidence and scores cannot cancel a higher gate.
5. Materialization is a separately capability-checked operation after canonical ledger/outbox publication and independent effect-receipt verification.

The [Hindsight operation contract](https://github.com/Odenknight/gkos-hindsight-governance/blob/59af4d1080efb0eae147d2aec0c0b1b75461b761/contracts/hindsight/v1/HINDSIGHT-OPERATION-COMPATIBILITY.md) defines retain/recall/inspection/history/curation/operation lifecycle as core; optional features default off. It requires exact source lineage resolution before recall release, independent gateway scope filtering, exact-byte HMAC before JSON parsing, duplicate-member rejection, document-aware idempotency, conflict quarantine, and canonical receipts that outlive upstream pruning. Its synthetic oracles do perform JSON-patch/HMAC/idempotency checks; none calls a live endpoint.

SQL is substantive, not placeholder. Four migrations define append-only ledgers, exact structural receipt binding, serializable append with chain-head locking, atomic outbox insertion, effect/verifier profiles, materialization/revocation closure, review ballots/quorum, confidentiality purge controls and checkpoints. [append_event_with_outbox](https://github.com/Odenknight/gkos-hindsight-governance/blob/59af4d1080efb0eae147d2aec0c0b1b75461b761/migrations/0004_ledger_structural_binding.sql#L273) compares every retry field plus commands before returning an existing receipt sequence; it rejects conflicting retries, sequence gaps, parent drift, and scope mismatch. [Roles/grants](https://github.com/Odenknight/gkos-hindsight-governance/blob/59af4d1080efb0eae147d2aec0c0b1b75461b761/migrations/0003_roles_and_grants.sql#L48) intentionally withhold generic runtime writes; empty/unratified verifier/scope registries are default-deny. Local Python SQL tests inspect contracts and SQL structure; they do not execute PostgreSQL.

Actual language files are [Python's false authority constant](https://github.com/Odenknight/gkos-hindsight-governance/blob/59af4d1080efb0eae147d2aec0c0b1b75461b761/implementations/python/src/gkos_hindsight/__init__.py) and [Rust's false authority constant/test](https://github.com/Odenknight/gkos-hindsight-governance/blob/59af4d1080efb0eae147d2aec0c0b1b75461b761/implementations/rust/src/lib.rs). No gateway, recall filter, webhook consumer, durable worker, adjudicator executable, independent reviewer deployment, review queue/API/UI, shadow metrics, dual-write reconciliation or reconstruction runtime exists. The differential workflow asserts SCAFFOLD_ONLY_UNEVALUATED; it does not compare two implementation results.

### Hindsight remaining defects/dependencies

- **HIN-01 / P1 reproducibility:** three current static-test modules import PyYAML, but `contracts/ci/v1/requirements-test.txt` does not include it. A fresh venv with declared version pins reproduced import errors. Diagnostic-only PyYAML6.0.3 installation allowed further testing; no repository lock was fixed. The hash-locked Ubuntu3.12 lane still requires correction/retest.
- **HIN-02 / P1 pin closure:** [component lock](https://github.com/Odenknight/gkos-hindsight-governance/blob/59af4d1080efb0eae147d2aec0c0b1b75461b761/manifests/component-lock.json) remains Standard v0.79 and Engine v2.0.1, with provider/EVD002/PostgreSQL candidates unresolved. Engine PR31 is now [merged](https://github.com/Odenknight/GKOS-Engine/pull/31), final head `73693ff70b5001056ed81a52c21762d8936af59d`, merge `3ac1e9e55924ff85031a8a54b54a2cb48f605e0c`. Hindsight's historical `4ee4ad7...` candidate must not become the new pin by assumption. Reconcile with root Engine audit and bind the accepted provider contract/digests.
- **HIN-03 / authority:** [merge-only closure](https://github.com/Odenknight/gkos-hindsight-governance/blob/59af4d1080efb0eae147d2aec0c0b1b75461b761/governance/work-packets/WP1-PR1-MERGE-CLOSURE.yaml) superseded WP1's merge:false only for PR1. It expressly preserved technical ratification, model, runtime, activation, materialization and completion blocks. The older completion audit's “PR1 cannot merge” is historical, not current. D1-D8 proposals and proposed ratification files are still not accepted R2 freeze evidence.
- **HIN-04 / identity:** [model lock](https://github.com/Odenknight/gkos-hindsight-governance/blob/59af4d1080efb0eae147d2aec0c0b1b75461b761/manifests/model-lock.json) has no model/config/prompt/toolchain/deployment pins for producer or reviewer. It requires distinct identity, prompt configuration, family, and a separate read-only reviewer deployment. Different GPT product labels or reasoning settings do not prove the required family difference.
- **HIN-05 / functional scope:** source contracts pin a Python/Rust independent clean-room program. The user's TypeScript-first Full-engine plan should put authoritative admission policy in Full and keep Hindsight an adapter. Replacing Hindsight's independently ratified language-lane plan with a TS gateway is a separate scope/authority choice, not a license to duplicate the authority engine or silently activate the inert lanes.
- Resource-limit schemas/vectors now exist, although older intake prose still calls them absent. Exact values, profile digests and execution qualification still require current owner reconciliation; existence is not ratification.
- The old hosted PostgreSQL success at `f63c87f...` is bounded historical default-deny evidence. It is not a live deployment, positive materialization, complete recovery qualification or present audit execution.

## 5. Executed evidence versus historical/hosted evidence

Local environment: Windows x64; Node24.18.0/npm10.9.4; Python3.14.2; Rust/cargo1.98.0. Dependencies installed only under isolated audit directories. Initial npm cache access failed; retry with an audit-local cache succeeded. That setup failure was not counted as a code defect.

| Check | Fresh audit result | Claim limit |
|---|---|---|
| Standard main npm test | 14 passed, 0 failed/skipped | Unit/mechanism evidence |
| Main registry lint / strict lint | Ordinary PASS; strict FAIL, 19 uncovered of23 gates,57 requirements | No full conformance |
| Starter runner, fake test adapter | 8 executed,6 pass,2 UNEVALUATED, exit1 | Exercises runner honesty, not Engine conformance |
| SRTP draft | 22 pass,0 fail/skip | Provisional/non-qualifying |
| GCP6 clean-process replay | PASS;1338 bytes; hash `03d9507b12bb07d3d0224359881c0f6b6f7c2eb79346e31ca25925365dc2667b` | Closed fixture corpus |
| R18 npm test / strict lint | 43 pass,0 fail/skip;28 listed gates covered | Synthetic predicates only; six extra probes expose false-open paths |
| Main canonical probes | 2 invalid inputs accepted | Confirmed defects |
| Main current-release script | FAIL at R16 count30 vs29 | Release assembly defect |
| Immutable v0.80 three-file checksum list | 3/3 match | Does not hash every normative file |
| Hindsight bootstrap / lane/security | PASS;19 immutable bootstrap files;7 language files inspected | Synthetic staged index; static scaffold integrity only |
| Hindsight initial full discovery | 180 total,173 pass,4 errors,3 skip | Missing PyYAML3 import errors + missing snapshot index1 |
| Hindsight diagnostic full discovery | 206 total,201 pass,2 errors,3 skip | 2 historical-Git-object checks unavailable in snapshot;3 Windows symlink skips; not full PASS |
| Hindsight relevant eight-module subset | 126 passed,0 errors/fail/skips | Static/oracle/SQL-text checks only |
| Hindsight Rust scaffold | 1 pass,0 fail;0 doctests | Asserts runtime authority is false |

Raw/command-bound evidence is under [evidence/](evidence/); all counts and external check IDs are in [the ledger](AUDIT-STANDARD-HINDSIGHT.ledger.json). The two final full-discovery errors require `f63c87f...` and `8ea9bb7...` historical Git objects, deliberately not fabricated. The source-file snapshot remains exact.

Current remote Standard main check-runs report six successes, including Node22 and24. These were **observed hosted results**, not executed locally; they belong to main, not final R18 closure. Current Hindsight main reports five failures, one skipped dispatch acknowledgement, and one successful dependency-graph job. Job wrappers expose no steps; annotation retrieval was unavailable. Earlier billing-failure records cannot establish the cause of these current main failures. Do not relabel them PASS or assume all are infrastructure-only.

Not executed: live PostgreSQL, Hindsight, Graphiti, provider writes, production/deployment, local Node22, exact Ubuntu3.12 hash-locked test lane, full runtime crash/concurrency/dual-write/recovery, profile qualification, or Rust cutover.

## 6. Full ownership, reviewer qualification, and safe work packets

[R12 one-authority rule](https://github.com/Odenknight/gkos-standard/blob/71b899473473f47172b181973027f3eb7da25104/decisions/R12_Ecosystem_Compatibility_Development_Decision_Record.md#L87) requires embedding/direct dependence on Engine or a frozen verified baseline with approved differences. Viewer/projection consumers may consume hash-bound canonical output; they cannot invent authority. The [profile annex](https://github.com/Odenknight/gkos-standard/blob/71b899473473f47172b181973027f3eb7da25104/standard/annexes/Conformance_Profiles.md) separates independent read-only Viewer/Projection from Core/Advanced. Hindsight scores, semantic opinions and Graphiti retrieval remain non-authoritative.

For the current program, Full owns canonical membership, governed currentness/history, eligibility, final authority admission and durable receipts. Lite must return structured `requires_full_engine` for authority-required requests, with explicit caller resubmission and no transparent forwarding. This audit verifies these boundaries in Standard/R18 contracts; it does not assert their completion in Engine/Lite code.

R18 review qualification requires all seven conditions: different family from proposer/executor; separately identified bounded/versioned/expiring grant and lease; sealed evidence packet; deterministic non-overridable gates before review; exact append-only decision binding; no review of one's own work/authority/reviewer assignment/gate/policy/autonomy envelope; and mandatory human escalation. Missing authority, uncertain independence, failed/held/blocked/unevaluated mandatory gates, major/indeterminate changes, contradictory evidence, protected/destructive uncertainty and repeated nondeterminism remain human/HOLD cases. Current same-family Sol review of this audit must be labeled a second-agent review, not R18 qualified independent-family adjudication.

### Proposed implementation packets, ordered Stability > Reliability > Fidelity

| Packet | Deliverable / dependencies | Exit gate |
|---|---|---|
| TS-S1 canonical/refusal correctness | Repair Standard helper malformed-time/Unicode refusal; align Full's normative vectors through its own audit; freeze schema-directed number/text/time corpus | Missing/malformed/tampered values all refuse; valid canonical bytes stable across Node22/24 and independent environments |
| TS-S2 real Track-A executor | Typed Standard-owned GCP4 policy/hold/delegation and GCP5 proposal/review/decision/history paths; integrate catalog, receipt/state/no-effect assertions | Every old19 and new5 mandatory gate covered with actual evaluated inputs; full applicable GCP4/5 sets, no declarative-only coverage |
| TS-S3 reviewer/authority closure | Exact grant/lease/model/evidence/policy/gate bindings; full escalation matrix; reusable Full-owned authority mechanisms, not adapter copies | Same-family/self-review/stale/ambiguous/expired cases refuse; sealed packet and append-only receipts; primary unavailable => HOLD |
| TS-S4 v0.81 release instrument | R17/base parity, superseded applicability, release/checksum script, strict CI, two independent environments, capable-lane matrix, exact artifact manifest | No mandatory fail/skip/hold/unevaluated/waiver; then only the ratified one-release automatic publication route |
| TS-H1 provider/lock reconciliation | Root-confirmed accepted Engine admission contract; EVD002 neutral contract decision; exact Standard/runtime/policy/model identities; corrected PyYAML closure | New digest-bound accepted R2 packet, green fresh lock-only static tests; no runtime activation implied |
| TS-H2 non-live adapter preparation | Only after language/scope choice: schema-bound Full provider adapter, canonical source retention, filtered recall, authenticated webhook inbox, idempotent outbox/reconciliation | Inert synthetic endpoint tests; durable negative receipts; restart/replay and duplicate/conflict cases; no direct model approval |
| TS-D1 optional DDCV | Separate draft decision/schema/canonical-row/fixture contract, source/tool/config/coverage identities; no Graphiti in deterministic hashes | Provisional tests and explicit non-qualification; not a v0.81 release blocker |
| RUST-P1 safe preparation now | Inventory ABI/wire profiles, canonical vectors, digest domains, runtime/toolchain/license/dependency closure, fault taxonomy and black-box parity harness | Non-authoritative Rust tests only; no v3 tag, production pin, or transfer of authority |
| RUST-P2 after TypeScript completion | One Full-owned Rust authority candidate against frozen corrected TS oracle; adapters consume same contract | Differential bytes/decisions/refusals/receipts, fuzz/crash/race/recovery/storage/packaging/downstream parity; separately authorized cutover/TS retirement |

Do not combine GKX-CBOR-1 and Hindsight's `marshal-canonical-json/v1` domains or silently rehash stored artifacts during migration. They identify different existing contracts; explicit translation lineage and immutable original bytes are necessary.

## 7. Decisions versus engineering choices

Already resolved by current owner: Aug29 Standard authority, DDCV non-gating, bounded R18 review, one-release automatic v0.81 route. No need to re-ask whether Aug27 blocks that route.

Still needing owner/exact authority intake before the affected action:

- allocate/collision-check R19 and DDCV's own adopted draft scope;
- decide current Hindsight D1-D8/provider/EVD002/runtime/resource/model/R2 freeze inputs against refreshed exact candidates, not stale suggested one-line ratification;
- decide whether/how the TS-first Full program changes Hindsight's existing independent Python/Rust clean-room plan;
- separately authorize Engine/Lite release, runtime deployment/materialization, Rust authority cutover and TypeScript retirement.

Engineering choices within approved packets: typed validator organization, test harness composition, fixture file layout, internal interfaces, database adapter implementation, lexical indexing, and optional graph projection. They do not require inventing new normative requirements or widening authority. Storage products/model providers are not Standard dependencies.
