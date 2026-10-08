# GKOS ecosystem: TypeScript completion and single-engine Rust roadmap

Date: 2026-08-31. Owner: OdenKnight. Coordinator: Codex orchestrator, with Sol implementation/audit agents.

Priority order: **Stability, then Reliability, then Fidelity.**

Status: evidence-backed execution roadmap and initial qualification audit. This document is not a claim that TypeScript completion, Standard v0.81 publication, Rust implementation, deployment, or Engine 3.0 cutover has occurred.

## 1. Outcome and immediate direction

Finish the approved, incomplete TypeScript product and operational commitments first. Turn them into executable acceptance evidence. Preserve that qualified behavior as the migration oracle. In parallel, perform non-authoritative Rust contract, fixture, module-reuse, tooling and shadow work that cannot change production authority. Then build one Full-owned Rust Engine through all cumulative r4 phases; derive Lite from the same crates and accepted source coordinate.

The destination of this roadmap is theMarshal-Core-Rust because the owner requested it as the preservation/reference location. **GKOS Engine implementation ownership remains in GKOS-Engine. Marshal Core, GKOS Engine, and the Kosmos Tauri shell are three different Rust concerns.** Storing this plan here does not merge their semantics, canonicalization, licensing, versions, or writer authority.

The initial work has already produced repository audits, exact source/PR ledgers, independent local checks, reproduced defects and a Rust parity inventory. No application source fixes, remote merges, release tags, production deployments or source-vault repairs are represented as completed by those audits.

### Decisions already confirmed by the owner in this task

| Decision | Controlling interpretation |
| --- | --- |
| TypeScript first; safe Rust work may run in parallel | Complete the approved TS commitments and their tests before authoritative migration; parallel Rust remains non-authoritative until the gates below |
| Sol agents, orchestrator verification, replacement after two failed attempts | Apply the workforce and verification protocol in section 5; passing self-tests alone do not close a packet |
| Aug 29 changes are ratified | The Aug 29 Standard R18 baseline supersedes conflicting Aug 27 release-governance wording: DDCV is non-gating for Standard v0.81, and one-release automatic merge/tag/publication is authorized only after every exact-bound mandatory gate passes |
| Publish this detailed Markdown plan in theMarshal-Core-Rust | Publish on a separate codex/ documentation branch, preserving application source, normative contracts and main |
| DCO identity authorized for this documentation commit | Use OdenKnight <Odenknight@users.noreply.github.com>; this does not waive CLA requirements for accepting a third-party PR or authorize unrelated signatures |
| Include Fable's Observatory r3 supplement | Preserve its full text and labels; reconcile historical, operator-reported, estimated and currently reproduced evidence separately |

Engine/Lite releases, production effects, real-vault repair, Rust 3.0 cutover and TypeScript retirement retain their own approval gates. Standard's conditional v0.81 publication authority cannot be reused for those actions.

### Open decisions that affect implementation

These are gates on the affected packets, not reasons to stop unrelated read-only or fixture work.

| ID | Question / recommended working assumption | Affected work |
| --- | --- | --- |
| Q-SCOPE | Confirm the TS completion manifest. Working scope is all approved existing Engine/Observatory commitments plus incomplete governed navigation/effects, proposal and consumer integrations. Which entirely new r4 capabilities must also be implemented in TS before migration? Do not silently defer an approved concept because Rust is planned. | TS definition of done; schedule; new provider/context capabilities |
| Q-ORACLE | Reconcile the ratified reference 0584a5d, actual v2.1.2 tag 7bf14b4, and current main 8207958/package 2.1.2. Preserve all three historical identities and select a new exact qualified TS oracle after accepted corrections; do not move an existing tag. | Historical CI, release identity, differential fixtures, Standard closure |
| Q-GUARD | Approve the relationship between frozen historical contract qualification and ongoing implementation. Recommended: replay the frozen contract at its bound historical coordinate, and add a separately versioned current-runtime/change-inventory gate. Never remove the old assertion or reset its baseline to HEAD just to obtain green. | Current Engine CI is blocked until this is resolved |
| Q-EFFECTS | Select the first production host/threat/durability profile, exact generated-content ownership model, grant issuer and approved roots. Existing Node candidate assumes a cooperative vault and does not prove sudden-power-loss directory-entry durability. Keep unqualified hosts unavailable. | Engine/Kosmos effects and adoption |
| Q-PROVIDERS | Ratify supported TS provider/reranker modes and credential/endpoint policy; identify the first qualified optional local model/runtime pack and hardware. Do not wire every parsed setting or enable a downloader by inference. | Settings completion; provider interoperability; Rust r4 phase 4 |
| Q-BENCH | Supply access, a corrected URL or an exact archive for mariusTalpos/gkos-engine-benchmark. Both available GitHub access routes returned not found. | Audit of that repository and any independent benchmark claims |
| Q-MARSHAL | Separately resolve G1 provider/adapter/enrollment/source-identity and candidate-contract adoption. The GKOS migration does not appoint Marshal as a writer or select Kosmos/GrooveSeek as its provider. | Marshal G1 and downstream admission |
| Q-INTENT | Reconcile r4's eight-invariant intent-gate reference with the seven-row, still-proposed GKOS-DOCSTD-001 checklist found at current Standard main. Confirm the intended exact checklist/eighth item or amend the reference; do not fabricate an eighth invariant or report eight checks passed. | R4-0 source closure; R4-12 documentation gate |
| Q-LIVE | Provide approved coherent test scope, intentional canary manifest, credential-specific client/observer participation and staging window when live acceptance is ready. | E02/E07 live evidence, deployment and repair |

The owner was asked Q-SCOPE and Q-BENCH during assessment; their answers were not available when this roadmap was drafted. Decisions must be recorded with scope and exact source coordinates, not inferred from silence.

## 2. Evidence basis and authority boundaries

This roadmap uses actual source modules, tests, build scripts, manifests, pins and unmerged diffs—not README descriptions alone. Repository snapshots were collected on 2026-08-31, primarily around 17:46 UTC; later verification retained those immutable coordinates. Recheck remote heads before implementation or publication.

| Repository | Audited main/source coordinate | Established state |
| --- | --- | --- |
| [gkos-standard](https://github.com/Odenknight/gkos-standard) | 71b899473473f47172b181973027f3eb7da25104 | v0.80 released; unmerged R18 work at aa9a05315a9a767bd672aa2bb5179c963d9d66ca; no open PR |
| [GKOS-Engine](https://github.com/Odenknight/GKOS-Engine) | 8207958047b3361ae21ac07c5a2abbd26a42a684 | PR #37 merged; package 2.1.2; current full CI still fails |
| [GKOS-Engine-Lite](https://github.com/Odenknight/GKOS-Engine-Lite) | 4027bfc4499ad0a2f3e753401f1320468e283823 | v2.1.2 tag equals main; pinned TS wrapper/desktop plus genuine Rust retrieval library, not the final standalone Rust Engine |
| [Kosmos-Oden](https://github.com/Odenknight/Kosmos-Oden) | 6486035dfc2e42173b1158b8007c9bab35aa7dc9 | Package 0.8.0, latest release 0.7.0; developed TS consumer; Effects host execution unavailable |
| [gkos-hindsight-governance](https://github.com/Odenknight/gkos-hindsight-governance) | 59af4d1080efb0eae147d2aec0c0b1b75461b761 | Private, static/governance preparation and inert adapter boundaries; not a functioning runtime integration |
| [GKOS-Observatory](https://github.com/Odenknight/GKOS-Observatory) | 8da1d2239a9ce0af5570fe1bfa264934d8aabbe4 | PR #1 merged; static synthetic replays plus separate live client and deployment patches |
| [gkos-engine-benchmark](https://github.com/mariusTalpos/gkos-engine-benchmark) | Unavailable; no verified SHA | Access blocker, not proof the repository does not exist; no results attributed to it |
| [theMarshal-Core-Rust](https://github.com/Odenknight/theMarshal-Core-Rust) | a5f1d0d6975e25748d72d073cfb61858bc93297a | Private Rust 0.0.1 primitives, MARSHAL-CBOR-1/EVD-002, PyO3 ABI v2; no appointed writer or production runtime |

Supporting deliverables:

- [Engine, Lite and benchmark audit](reports/AUDIT-ENGINE-LITE-BENCHMARK.md) and [exact PR/source ledger](reports/engine-lite-source-test-ledger.json).
- [Standard and Hindsight audit](reports/AUDIT-STANDARD-HINDSIGHT.md) and [ledger](reports/AUDIT-STANDARD-HINDSIGHT.ledger.json).
- [Kosmos and Marshal audit](reports/AUDIT-KOSMOS-MARSHAL.md) and [ledger](reports/AUDIT-KOSMOS-MARSHAL-LEDGER.json).
- [Observatory/Fable reconciliation](reports/AUDIT-OBSERVATORY-FABLE.md) and [complete Fable r3 supplement](sources/FABLE-OBSERVATORY-CLIENT-EVIDENCE-SUPPLEMENT-R3-2026-08-31.md).
- [Rust migration parity matrix](reports/RUST-MIGRATION-PARITY-MATRIX.md).
- [Preserved Aug 27 r4 planning source](sources/GKOS-RUST-UPLIFT-R4-2026-08-27.md), with its historical wording retained rather than silently amended.
- [Orchestrator verification and limits](reports/ORCHESTRATOR-VERIFICATION.md).

### Which source controls which question

1. Owner decisions in this task control authorized scope and the confirmed Aug 29 supersession.
2. Ratified Standard decisions, exact contract versions and their source closure control normative semantics. Code that passes a test does not create new normative authority.
3. The Rust Retrieval & Operational Uplift r4 plan dated Aug 27 supplies the cumulative target architecture/phases. Its five OD-12 decisions and the later owner direction must be distinguished from advisory implementation details and stale status prose.
4. Observatory E01-E07 and Fable's evidence supply product/operational acceptance. Their older statements that a rewrite was not justified by client lag do not negate the owner's later explicit Rust program; they still prohibit claiming lag proves a Rust speedup.
5. Source code and executable evidence establish what is implemented. Branch names, manifests, schemas, CLI help, green checks at old heads and README prose cannot substitute for operation of a capability.
6. Marshal's source-authority register, lifecycle/CBOR/EVD contracts and license remain independent. MARSHAL-CBOR-1 is a stricter profile with its own digest domain; it is not interchangeable with GKX-CBOR-1 or JSON proposal hashes.

Older R0-R8 Rust plans are coverage inputs, not an additional migration to run after r4. The file named GKOS-Engine_Rust_Conversion_Checklist describes substantial Marshal-specific PyO3/EVD/lifecycle work; that work belongs on the Marshal lane, not inside the GKOS Engine parser. Optional post-rebuild checklists are reconciled against r4 to avoid duplicate projects.

### Release and dependency identity reconciliation

Record a tuple, never just a version label: repository, commit/tree, contract/fixture digests, package version, tag target, dependency pins, artifact hashes and build environment.

- Ratified R18 references Full 0584a5d3e70384ef65e9069fbe1d6fd1d80cfc04 as its TS compatibility coordinate. The actual Full v2.1.2 tag points to 7bf14b481e78c5ae9d1e14661602be4f24559d0e. Current main is later again. Reconcile this explicitly; neither relabeling main nor moving the tag resolves it.
- Lite npm pins Full e7cc0dd478af3d0bda216c5258dec5f77932def7; its Rust frozen pack and native-sidecar build use additional historical pins. All must be named in a product bill of materials and interoperability test.
- Kosmos pins a development Effects Engine commit, 41172b91970aac869c161f4842e3526a62fd1fd9; its 2.2.0 target is not a released Engine.
- Observatory vendors Kosmos 50ebc3c168cf4e34137faf47e0b297b00db1a753 and builds an older Engine base plus a cumulative patch. Do not pretend these are current upstream release coordinates.
- r4's legacy Lite 1.x wording is stale relative to the actual 2.1.2 tree. Preserve historical tags and decide maintenance/version disposition explicitly; do not rewind or silently rename a product line.

## 3. What is already built, and what is not

### Engine and Lite

Current Full contains the canonical TS parser/graph/lineage, deterministic retrieval and native FTS5, citation verification, ingest/watcher/recovery work, read-only service/MCP, scoped credentials, bounded discovery/reference resolution, parameter diagnostics, and a 47-key settings ownership inventory. It does not mean all 47 settings are operational. Several settings are ignored/derived or metadata-only; capability flags distinguish availability, authority, policy and enablement.

The two reproduced remaining reference/snapshot gaps require same-generation source mutation in the host fixture: note_read rejects the stale ref while validate/assess/lineage accept changed meaning; temporal continuation can skip a row while retaining its snapshot ID. These are repeatable synthetic host-contract gaps, not a proven production incident or necessarily new PR #37 regressions.

Current full CI [33418044551](https://github.com/Odenknight/GKOS-Engine/actions/runs/33418044551) remains red: inspected Node22 full run has 940 tests, 935 pass, one historical protected-path failure and four skips. The missing downstream receipt follows the failed test step. Main being merged does not make it qualified.

Meaningful governed Effects implementation exists unmerged in Full. Main's service has no completed durable proposal/application route merely because proposal validation and authority fixtures exist. Lite has an executable Rust retrieval crate, but remains a pinned downstream adapter and has a desktop quick-connect mismatch: its current snippets advertise MCP while the selected old sidecar is REST-only.

### Kosmos and Observatory

Kosmos has a real Obsidian plugin, standalone renderer, Engine-backed semantics, read-only agent API, proposal/intelligence-related product work, opt-in authoring and sync features, and substantial tests. It is incorrect to call the entire product read-only: selected authoring/sync features write or transmit notes. The new governed Navigation Effects plane is nevertheless incomplete: host adapters unavailable, durable adoption absent, modal unwired, coordinator/recovery runtime unqualified.

Observatory's six public replays are generated synthetic fixtures, unsigned integrity-only, with no Engine execution. The live client is separate. Current reconnect/resume/Stop tests pass, but the real request-to-render and genuinely fresh-context workflows remain unqualified. Root reproduced same-label/different-agent-ID trail conflation in its real-renderer/mocked-transport fixture.

### Standard, Hindsight and Marshal

Standard main has real catalogs, schemas, diagnostics and runner work, but strict mutation coverage fails nineteen gates. R18's unmerged branch improves catalog/lint coverage; green boolean predicate fixtures do not prove real lifecycle, authorization, durable refusal or exact release closure. Missing/malformed inputs can still return gate-open in its evaluator, so those are pre-publication hardening tasks.

Hindsight's static work and recorded WP1 merge do not activate its Python/Rust adapters. Its Engine-provider dependency records are stale relative to upstream merges. Correct pins and ratification/runtime gates are still required.

Marshal has strict canonical/evidence/lifecycle/continuity primitives and tested fail-closed PyO3 identity. It does not implement a GKOS parser/index, Node/WASM bridge, SQL writer, production runtime or appointed effect owner. Its authority function returns NotAppointed. Candidate G1 files do not activate those capabilities.

## 4. Unmerged-work disposition register

No PR is merged, closed or relabeled solely by publishing this register. Recapture its head and compare its effective behavior before an authorized integration.

| Work | Current evidence | Disposition |
| --- | --- | --- |
| Full PRs #26, #27, #29, #30 | Open draft stacks whose captured heads are already ancestors of main | Preserve evidence; propose administrative closure only after owner review; do not implement them again |
| Full Effects integration e4f00b3a9289c1d35d1a02e50dcdc266945fe015 | Real planner/executor/archive/journal/recovery; historical green CI, divergent from current main | Preferred candidate for selective TS reconciliation; retain stronger current read/identity contracts; rerun crash/platform matrix |
| Older Full 808d875 Effects, d88c639 integration and e29e04b F1 branches | Overlapping old implementation/contract history | Feature-by-feature equivalence map; salvage unique behavior, never wholesale merge |
| Lite PRs #16-#18 | Captured heads already ancestral | Reconcile administrative state, not duplicate feature work |
| Lite #19/#20/#21 | Unique evaluation/watcher/admission/desktop work; #21 includes the prior stack | Diff and qualify cumulatively; extract truthful REST/snippet and pin checks; preserve reusable Rust candidate modules |
| Lite #9/#13/#14 | Older pin/compatibility/naming changes | Keep still-correct guards/copy only; no stale pin downgrade |
| Kosmos v0.85 at 50ebc3c168cf4e34137faf47e0b297b00db1a753 | Tauri supervisor, proposals, coalescing/reconciliation, some observability already on main | Salvage selected primitives; old authority provider is weaker than main and must not overwrite it |
| Kosmos #23/#27/#28/#29 | Old pin/naming/branding branches; #29 also changes assessment response shape | Explicit compatibility review, not branding-only approval |
| Standard R18 aa9a05315a9a767bd672aa2bb5179c963d9d66ca | No open PR; owner-ratified decisions but incomplete execution/qualification | Continue Track A on exact source, fixing evaluator/runner/closure gaps before conditional v0.81 publication |
| Hindsight WP1 | Merged; static closure, not runtime activation | Reconcile source/dependency records; retain remaining R2/runtime blocks |
| Observatory #1 / Engine #37 | Both merged Aug 31; historical status text still says unmerged in places | Add dated status reconciliation; preserve original receipts, do not reapply patches |
| Marshal PR #7 at bfe491ace8b716529ec19c7ec8c2f9cd54254d68 | Stale README/packet describing older ABI-v1 and 27-test stage | Rewrite current-state claims around ABI-v2/continuity/40 tests while retaining historical provenance |
| Marshal G1 8c7c7184ea3fa215a348c763e2d2680cda7b3a89 | Five candidate contracts, docs/vectors only; disclosed session-evidence defect | Independent disposition or clean reproduction, exact candidate ratification and provider/enrollment decisions; no runtime activation |
| Independent benchmark repo | Not accessible | Preserve blocker; request source; no substitute labeled independent |

The audit inspected important active implementation branches and every captured open PR, but did not fully requalify every historical divergent patch. Full branch/tag/PR coordinates and limits are in the ledgers.

## 5. Orchestration and verification protocol

### Workforce already used

| Sol agent lane | Bounded responsibility | Root verification |
| --- | --- | --- |
| Engine / Lite / benchmark | Actual code and all open PRs, settings/retrieval/effects/identity/pins, focused tests, Rust reuse, inaccessible benchmark | Read source/report, rerun 46 Engine tests, both defect probes and 169 Lite Rust checks; inspect current hosted failure |
| Standard / Hindsight | Ratified source chain, R18/unmerged work, catalogs/runners/mutations, static/runtime separation | Inspect exact authorities and real runner behavior; rerun bounded evaluator/fixture evidence and qualify environment limitations |
| Kosmos / Marshal | Actual product paths, Effects host limits, unmerged Tauri/G1, Rust authority/license/ABI, destination contribution policy | Rerun 283 Kosmos tests and Marshal 40 Rust tests, 102 comparator cases and binding-absence check; inspect interface/branch gaps |
| Root orchestrator | Observatory, Fable corrections, independent reproduction, source/authority reconciliation, final plan/publication | Build Observatory, run 38 pass/one platform skip, real-renderer synthetic probe, document and remote-blob verification |

Three worker slots plus root are the practical concurrency limit. Keep one integration owner per repository/branch. Rotate agents through the next ready packet rather than letting multiple agents edit the same files or opening redundant user-owned tasks.

### Work packet contract

Every implementation packet must carry:

- An ID, priority, owner, exact approved base SHA and contract/decision inputs.
- Explicit in-scope files/functions and out-of-scope authority/effects.
- A red reproduction or missing-capability test, then focused positive/negative tests.
- Resource/privacy/portability limits, fixture hashes and test environment capabilities.
- Output patch/commit, test command/exit/result ledger, remaining skips/blockers and rollback/disposition.
- An independent root or designated verifier result against the same candidate SHA; a changed head invalidates earlier closure until the relevant checks repeat.

Use states: proposed, ready, in_progress, needs_decision, candidate, verification_failed, verified, integrated, qualified, retired. Passing unit tests can reach candidate; only verified evidence reaches verified. Integration and release remain separate.

On the first substantive failed delivery, root returns the exact unmet criteria and counterexample to the same agent. On the second failed attempt for that packet, root stops assigning it to that agent, preserves both attempts, and replaces the worker with a fresh Sol agent given the evidence and unchanged acceptance criteria. Do not erase failures, change a test to fit faulty behavior, or count environment/tool retries as successful product qualification. Disclose environment failures separately; capability gaps do not excuse false completion claims.

All current audit deliveries are subject to this check. Recommendations refined during review are not a reason to manufacture a worker failure count. No worker is replaced merely for discovering a real blocker.

Sol-to-Sol/root review is useful engineering verification, but it does not by itself satisfy any ratified R18 requirement for independently enrolled reviewers, distinct reviewer families or independently provisioned environments. Obtain the required actual review evidence through the approved process; Fable's client report is not automatically an R18 release approval.

## 6. Program sequence and dependency gates

| Wave | Primary work | Safe parallel work | Exit |
| --- | --- | --- | --- |
| A: reconcile | Exact source/authority/scope manifest; preserve dirty work; branch equivalence; Q-ORACLE/Q-GUARD | Rust module/parity inventory; Standard/Hindsight authority reconciliation | G0: approved coordinates and packet scope |
| B: stabilize TS | Current reference/cursor regressions, historical/current CI separation, truthful settings/pins | E05 instrumentation design; Rust fixture harness; Standard input/runner fixes | G1: qualified TS baseline, not merely merged main |
| C: useful operation | E01-E07: explain refusals, controlled repair planning, evidence/recency, snapshots, measured performance, coherent project workflow | Bounded Rust core/canonical shadow candidates; DDCV informative work | G2: useful operational acceptance with explicit live/not-run split |
| D: complete TS product | Governed Effects, durable proposals/identity/host integration, consumer gaps and agreed remaining concepts | Reusable Rust module qualification; separate Marshal pure-contract work | G-TS: signed-off TS completion manifest and frozen oracle |
| E: single Rust Engine | Cumulative r4 phases 2-10, reusing phase 0/1 preparation | Standard/DDCV and Marshal on separate chains | G-RUST: functionality/parity/recovery/concurrency gates |
| F: distribution | r4 phase 11 plus Full/Lite, Kosmos, Observatory and optional approved consumer qualification | Clean-machine and CPU-floor matrix | G-DIST: exact artifacts, downstream acceptance and rollback |
| G: cutover | r4 phase 12 and separately authorized Engine/Lite 3.0 activation | No second active writer | G-CUTOVER: owner-approved exact accepted source/artifacts |
| H: retirement | Observe accepted operation, replay rollback, disposition TS artifacts and support | Optional adapters/domain profiles after their own gates | G-RETIRE: explicit TypeScript retirement authorization |

Standard v0.81 is not forced to wait for Rust or DDCV. Its own ratified exact-bound release gates control it. Conversely, Standard publication is not proof that a particular Engine/Lite binary or deployment is qualified.

The waves describe dependencies, not fixed dates. Estimate packet effort only after G0, a capable test matrix and the initial bottleneck measurements. A critical-path claim without those inputs would be guesswork.

## 7. TypeScript completion work packages

This is the working completion backlog. Reconcile it against Q-SCOPE and the source ledgers. Any approved item not implemented must remain open or receive an explicit owner disposition; a stub, warning-only inventory entry, skipped test or capability flag is not completion.

### T00 — Source authority, scope and historical CI

Priority: P0. Depends on G0 decisions. Owner: root plus Engine and Standard reviewers.

- Preserve frozen contract bytes, manifests and historical fixtures. Inventory all legitimate current changes outside the old protected-path list and explain their approval basis.
- Establish separate historical replay and current runtime/change qualification without laundering the old gate into a HEAD-relative no-op.
- Reconcile package/tag/reference/dependency identities and the missing downstream receipt. Document accepted semantic deltas from the old TS oracle.
- Refresh merged/draft/source status without overwriting historical receipts. Propose administrative PR cleanup only after verifying ancestry/equivalence.

Exit: explicit decision record, exact candidate manifest, all required current Node/OS checks green, historical replay still reproducible, downstream qualification receipt actually produced and independently checked.

### T01 — Reference freshness and cursor snapshot integrity

Priority: P0 for correctness. Depends on a scoped current Engine candidate; no new authority is needed for fail-closed fixes.

- Unify live source-digest/generation/admission validation for every record-ref consumer. A stale issued ref cannot silently acquire new semantics in validation, assessment or lineage.
- Bind temporal, lineage and audit continuations to the actual authorized candidate/order/source state, or serve a genuinely immutable bounded snapshot. Offset into a rebuilt list is insufficient.
- Add matrices for unchanged-generation mutation, insert/delete/reorder, rename/path reuse, UID/policy change, stale sessions and cross-agent references. Preserve stable-state output and old default call behavior.
- Keep absent, hidden, deleted, stale and foreign unavailability non-disclosing. Do not put membership changes into public error explanations.

Exit: the two current probes become red-then-green correctness tests; all affected consumers pass equivalent tests; canonical output/citation/ref invariants and resource limits are rechecked. Synthetic preconditions and live applicability remain clearly stated.

### T02 — Settings and runtime truthfulness

Priority: P0/P1. Depends on settings ownership/provider decisions.

- Resolve SET-08/09 and every accepted TOML/CLI coordinate as operational, deliberately derived, metadata-only, deprecated or rejected. No accepted-but-ignored switch may imply an operational guarantee.
- Prove each operational value changes the intended runtime. Test precedence, ranges, explicit configuration paths, restart/reload semantics, unknown flags and command-specific options.
- Preserve exact legacy stdout/stderr/help where frozen; version additive behavior explicitly. Retain redacted settings inspection and schema-owned static warnings.
- Do not bind unsafe listener/authentication/identity controls from ambient vault configuration. Desktop/service/agent/graph/watcher ownership must be explicit rather than blindly wiring all keys.

Exit: one settings contract/ownership table matching each executable, tests for actual effect and refusal, no secret/path/value reflection, and supported-platform startup behavior.

### T03 / E01 — Useful, safe refusal diagnostics

Priority: P0. Depends on T01 and a disclosure contract.

- Extend existing validate/assess/audit/error surfaces before adding redundant tools. Return stable code, bounded safe explanation, permitted next action and correlation ID.
- Explain search coherence refusal in the same failing response where safe; at most one additional bounded preflight call. Do not repeatedly retry an identical deterministic failure.
- Keep native admission/identity/relationship/index causes in a protected operator report produced through the same evaluation pipeline. No public hidden-existence oracle, total-corpus denominator, unbounded cause list or alternate writer.
- Add scope-level bounded rollups only after identity/digest correctness is qualified. Assessment remains support/documentation quality, not truth, relevance or project status.

Exit: paired absent/restricted fixtures are indistinguishable, all diagnostics are schema-bounded and value-redacted, the operator report explains the actual refusal, and the client can stop or take an allowed recovery action promptly.

### T04 / E02 — Reviewed repair planning and canaries

Priority: P0 for safety. Real source mutation is separately approved.

- Obtain the exact eleven intentional FAC fixture identities, source hashes and expected code/group outcomes from the owner. No blanket folder exclusion, automatic UID regeneration or test_fixture metadata rewrite.
- Separate source inventory/admission reasons from the admitted-view validation sweep. Report groups and findings without confusing their counts.
- Build a deterministic dry-run plan binding target hashes, exact changes, dependency/relationship closure, identity decisions, backups and expected before/after evidence.
- Any later operator apply needs quiescence/locking, revalidation, journal, rollback, limited filesystem semantics and an explicitly approved exact plan. Unexpected edits or revocation stop the operation.

Exit: canary behavior preserved, every proposed repair traceable and reviewed, dry run reproducible, restore tested. Code qualification does not imply approval to execute that repair on a live vault.

### T05 / E03 — Evidence, citations and honest recency

Priority: P1. Depends on T01/T03.

- Provide bounded excerpt/evidence access without requiring full-note reads or an LLM summary in the core. Candidate contract: 1-8 refs, heading selector, 4,096 bytes per item and 16,384 total; finalize these as explicit versioned limits before shipping.
- Preserve exact UTF-8 source bytes, offsets, source digest, authorized ref and generation. Include frontmatter in raw-byte coordinate rules; never splice pages from different versions.
- Keep per-item unavailability uniform and partial results non-authority-expanding.
- Distinguish authored validity, lineage/head semantics, filesystem modification observations and observation/snapshot time. Unknown mtime is null/unavailable; none of these alone proves active project work.

Exit: citations independently reconstruct exact bytes, bounds/Unicode/stale-source matrices pass, and a project answer is supported by at least two appropriate notes or explicitly remains unsupported.

### T06 / E04 — Catalog identity, caches and bounded diffs

Priority: P1 for useful identity; optional richer history only after its required scope is confirmed.

- Define a canonical ref-free catalog_content_digest separately from response/result digests and per-call snapshot IDs. Include only the agreed authorized semantic projection and bound source/metadata versions.
- Cache only by the full authorization/session/filter/shape context; enforce per-context and global count/byte/TTL limits.
- Start with bounded baselines, proposed two per context with short TTL, and explicit restart/expiry reset behavior. Removed or newly restricted items yield reset_required in the first contract; no named tombstones revealing existence.
- Test same-generation mutation, admission/sensitivity changes, credential revocation, cache eviction, session change, expiry and deterministic content-equivalent comparisons.

Exit: no stale/mixed/foreign-authority results, defined memory bounds, truthful reset semantics, measured usefulness without mandatory catalog enumeration.

### T07 / E05 — Measurement before optimization

Priority: P0 instrumentation; optimization follows measured bottlenecks.

- Carry server correlation/operation IDs through ingress, queue, authorization, snapshot, tool/retrieval work, serialization/response bytes, event append/delivery and viewer receipt/render.
- Use monotonic stage durations and documented clock relationships. Keep client bridge/page-cycle time separate from Engine work and network/UI scheduling.
- Use bounded labels/rings/export sizes and protected operator access. Do not log queries, note bodies, credentials, arbitrary paths or unrestricted private corpus counts.
- Establish reproducible cold/warm/coherent/conflicting/concurrent workloads. Proposed initial sample counts are 30 warm and five cold runs; report every repetition, configuration, hardware, cache/model identity, median/p95/max and exclusions before claiming an SLO.
- Measure peak memory, queue fairness, work amplification, index/update cost, cancellation and event lag as well as elapsed time. Optimize the measured dominant stage; Rust is not a benchmark result.

Exit: a retained, exact-bound benchmark/correlation report with explicit limits. The unavailable independent benchmark is either audited later or remains a named gap; internal evaluation is never relabeled independent.

### T08 / E06-E07 — Operational and release acceptance

Priority: P0. Reuse after every meaningful slice, not only at the end.

- Version every new closed envelope/field/tool. Current draft.3 invalid-parameter diagnostics and compact/resolve behavior already exist and must be preserved, not rebuilt from the older handoff.
- Require a genuinely fresh model/client context for cold discovery. A new MCP session inside a catalog-informed conversation is not cold.
- Demonstrate the coherent project question, exact citations and honest failure case. Target no more than six content/diagnostic calls, separately counting setup, tools/list, notifications, retries and HTTP requests.
- Proposed typical targeted discovery budget: ten rows within 8 KiB of the complete uncompressed MCP body, including any text mirror. It is not a promise for every 100-row page. Preserve hard server bounds.
- Prove a prompted coherent search control and a conflicting control separately. A correct limitation passes safe-failure acceptance but does not pass the successful project-answer milestone.
- Connect the authorized observer first, then perform one known note_read and correlate its request through Engine event to rendered marker. Only then expand the test. Run a healthy watch for at least four minutes with real traffic, then staging interruption/resume/gap/Stop/denial checks.
- Verify immutable build/pin/patch identity, authenticated smoke, served asset hashes, healthy startup invocation and rollback. Never stack the deployment patch on the already merged Engine source.

Exit: synthetic, prompted-live, cold-context and interactive-visual records are separately labeled. Required live acceptance that has not run remains NOT_RUN; a static replay, mocked transport or green unit suite cannot fill it.

### T09 — Governed Engine Effects and durable proposals

Priority: stability-critical, enabled only after authority/host gates. Synthetic reconciliation depends on T00's scoped contract/change inventory, relevant T01 freshness invariants and the specific authority/ownership interfaces in Q-EFFECTS. It does not wait for unrelated provider settings, safe-diagnostic UI or the real FAC canary inventory. Any real-vault application separately requires T04's exact reviewed plan and Q-LIVE approval.

- Reconcile the real e4f00b3 Effects planner/executor onto current TS, retaining exact ownership/digest/grant/root/sensitivity/revocation checks and current read-only defaults.
- Keep Navigation semantic planning separate from host mutation. Implement or finish deterministic proposals, immutable quarantine, exact-source binding, idempotency and human decision records.
- Bind every apply to adopted engine-owned regions or explicitly approved agent-note roots, fresh credential/actor authority and exact preconditions. Human content must never be overwritten or adopted silently.
- Complete prepare/execute/recovery/rollback/shutdown behavior with locks, archive-before, temp-write/replace, journal, immutable effect receipts and startup recovery latch. Do not turn a successful rename into an unqualified sudden-power-loss guarantee.
- Effects off/propose/explicitly authorized auto_apply remain distinct; propose is the intended default. A model suggestion or score never grants authority. Add MCP write surfaces only under an approved, versioned contract.

Exit: real-process crash cuts, revoked/stale grants, concurrent actors, symlink/junction/hardlink/ancestor replacement, external edits, archive failure, partial journal, idempotent recovery and rollback are qualified for each claimed host. Unsupported hosts remain explicitly unavailable.

### T10 — Identity, service lifecycle and integration truth

Priority: P0/P1. Depends on ratified identity/service contracts.

- Separate abstract operation/fixture registries from implemented API, storage and administration. Complete the approved durable proposal/identity lifecycle and revocation behavior; mark unadopted adapters deferred.
- Preserve bearer scope, listener/origin/host restrictions, session expiry, queues, quotas, cancellation, credential separation and closed response schemas.
- Never use MCP display name, shared token label, visualization identity or frontend confirmation as write authority.
- Make capability negotiation describe availability/configuration/authorization/policy/recovery/enablement independently. No endpoint is advertised as useful before a real synthetic end-to-end call through its packaged runtime succeeds.

Exit: missing/wrong/revoked/cross-scope credentials fail closed uniformly; concurrent lanes are isolated and bounded; declared operations have executable implementation or an explicit unimplemented standing.

### T11 — Retrieval, graph, providers and evaluation completion

Priority: P1 after safety. Depends on Q-SCOPE/Q-PROVIDERS and stabilized contracts.

- Finish accepted ordinary-Markdown/GKX handling without fabricating governed identity, admission or lineage for ordinary text. Reuse the sole canonical parser and distinguish operational projection from authoritative current/as-of confirmation.
- Qualify exact citations, temporal semantics, graph/Graphiti export and optional projection toggles; no external graph index becomes a new authority or hidden writeback path.
- Wire or reject approved generic embedding/reranker/local/MCP-provider options with actual transports, timeout/cancellation, model/dimension checks, credential privacy and approved endpoint policy. Injected traits or canned vectors are not real-model interoperability.
- Keep quality metrics separate from admission/citation/noninterference correctness. Stale or corrupt state fails closed; explicitly authorized lexical degradation is reported, never silently substituted.
- Run sealed evaluation with exact corpora and deterministic expected outputs, then measured tuning proposals. Promotion requires acceptance, not simply a higher quality score.

Exit: all in-scope provider/data/graph capabilities operate through the claimed runtime, have negative tests and supported-platform evidence, and preserve governance invariants.

### T12 — Lite and Kosmos completion before the TS freeze

Priority: P1, with write-safety prerequisites.

- Lite: reconcile #21's truthful REST snippets/compatibility/settings fixes and the #19/#20 stack. Align npm/native/Rust pins; prove actual packaged sidecar routes. If the owner chooses an MCP-enabled uplift instead, upgrade and qualify the runtime and snippets together.
- Kosmos: retain the stronger current grants while selectively recovering v0.85's useful proposal, supervisor, coalescing, receipt-suppression and reconciliation primitives.
- Complete the selected durable adoption store and host adapter; wire the reviewed modal/settings/status/recovery/audit UI only after host safety is demonstrated. Test no-loop self-write suppression against exact receipts rather than timing guesses.
- Bound raw SSE frames, stdio lines and upstream bodies before accumulating them. Add timeout/cancellation/gap tests.
- Separate renderer stable agent ID from display label in live and replay adapters, then update Observatory's exact renderer pin/provenance. Preserve existing label-only callers explicitly; test equal-label distinct-ID isolation.
- Qualify selected-host 100/2k/10k/50k fixtures, real child-process crash seams, corrupt/external edits, reconciliation, keyboard/privacy UX and the required 24-hour soak. Unsupported platform/native/Obsidian modes stay false.

Exit: useful workflows operate through the actual selected host/UI/runtime, not just descriptors or unit helpers; clean install, capability, recovery, provenance and packaged-route tests pass.

### G-TS — Definition of TypeScript completion

The migration freeze is allowed only when:

1. The owner-approved completion manifest classifies every concept as required, explicitly deferred or explicitly cancelled; no required ignored key, stub, unavailable host or unwired UI remains hidden.
2. Every required packet has reviewed code, targeted adversarial regressions, supported-capability tests and an independent verifier result at the same SHA.
3. Current full CI, release identity, qualification receipt and all required platform/host/model lanes pass. An unsupported mandatory test needs a capable alternate PASS, not a waiver presented as green.
4. E07 useful success and calibrated failure are qualified, with separately recorded live/client/visual evidence and measured bottlenecks.
5. Required Effects/proposal/consumer behavior has real durability/concurrency/rollback evidence; no new operational authority is activated by the freeze itself.
6. An immutable accepted TS oracle, dependency/artifact/source closure and accepted-delta ledger are recorded. Historical reference artifacts remain available for replay.

Do not retire or stop maintaining TS at G-TS. It remains the operational reference and rollback path throughout Rust qualification.

## 8. Single Rust Engine through r4's cumulative phases

All phases carry forward prior gates. A later feature cannot compensate for a canonicalization, policy, reference, durability or recovery regression. Detailed module/test mappings are in the parity matrix.

### Target ownership and crates

- gkx-core: sole GKX parser, validation, resolution and lineage model; no network, filesystem watcher, database, UI, MCP or model dependency.
- gkx-canon: GKX-CBOR-1 and canonical hashes, with all required negative cases.
- gkx-conformance: adapters to exact Standard requirements/fixtures; no self-created conformance claims.
- gkos-retrieval: deterministic retrieval/store/provider interfaces; depends on core/canon as needed, never on Navigation, CLI, MCP or Effects.
- gkos-nav: host-free Navigation using core, independent of retrieval.
- gkos-context: authorized composition of policy, retrieval and Navigation into canonical context/evidence.
- gkos-effects: separately governed proposal/application/recovery subsystem; no hidden writes in parsing or retrieval.
- gkos-service, gkos-mcp and gkos-cli: host/runtime/protocol composition and executable distribution profiles.
- Full gkx and projection-only gkx-lite derive from the same Full-owned workspace and accepted crate/source versions. gkx-lite-local is a separately qualified offline distribution, not an independent semantics fork.

### R4-0 — Governance, coordinates and migration freeze

Deliver: source/authority/feature manifest; approved architecture boundaries; TS oracle plan and current/past version reconciliation; license/provenance inventory; supported product/host matrix; accepted-delta policy; no-production-change declaration for preparation.

Gate: G0 decisions plus exact initial coordinates. Preparation can start before G-TS, but final oracle freeze waits for G-TS. No Rust 3.0 tag, default writer switch or retirement authorization is implied.

### R4-1 — Extract oracles, contracts and compatibility corpus

Deliver: executable TS-to-Rust differential runner, complete byte/error/order/visibility/time/citation/reference fixtures, canonical negative corpus, corpus/config/toolchain hashes and failure classifier. Salvage actual Lite Rust retrieval plus unique evaluation/watcher candidates, preserving origin SHA, license and sealed contracts until intentionally migrated.

Gate: deterministic repeated TS oracle output; no ambiguous fixture ownership; mismatch categories distinguish defect, accepted semantic correction, allowed operational variation and unsupported capability. No unreviewed normalization may hide a mismatch.

This is the first safe parallel Rust work. Existing Lite Rust tests were rerun during assessment; the parity matrix is a concrete preparation deliverable, not a claim a new Engine binary exists.

### R4-2 — Core and canonical serialization

Deliver: sole Rust parser/projector/resolver/lineage, schema parity and GKX-CBOR-1. Cover duplicate-key refusal, deterministic key order, typed numeric rules, negative zero/NaN/infinity refusal, UTF-8/NFC, timestamp rules and hash-domain identity.

Gate: applicable accepted TS fixtures and all canonical negatives pass; required behavior is not UNEVALUATED; core has no host/runtime imports. Marshal's all-floats-forbidden profile and domain-separated EVD hash must not be substituted.

Pure bounded candidates can run in shadow before G-TS only against explicitly provisional TS coordinates. They must be rerun against the accepted oracle and cannot delay essential TS fixes.

### R4-3 — Retrieval store and deterministic pipeline

Deliver: SQLite/physical FTS5 store, heading-aware byte-safe chunking, query/filter stages, exact lexical/vector ranking, RRF/MMR, parent expansion, confidence and verified citation inputs. Reuse qualified Lite algorithms after resolving Full ownership and authority boundaries.

Gate: exact deterministic parity, Unicode/empty/boundary/tie-order cases, stale/corrupt state refusal, bounded resources, actual physical FTS5 and crash-safe state transitions. Exact-vector scoring is the portable oracle; sqlite-vec is an optional accelerator only after equivalence and target qualification.

### R4-4 — Real provider and model supply-chain adapters

Deliver: implementations and qualification of all three r4 target provider families: neutral HTTP embedding/reranking transport, local ONNX/runtime and outbound MCP provider adapters. Operator activation and model-pack selection remain optional; optional deployment does not waive target adapter implementation/testing. A narrower target needs an explicit recorded scope amendment. Inbound MCP clients and outbound model services are different boundaries. Implement endpoint/credential policy, cancellation/timeouts, dimensions, batches, model identity and explicit failure/degradation contracts.

Deliver separately: pinned model/runtime manifests, artifact/hash/license/SBOM evidence, verification on every model load and offline local bundle installation. Base Full and Lite contain no model, baked vendor endpoint or first-run downloader. Any future downloader needs a separate product decision.

Gate: each required adapter family runs in an appropriate capable environment; wrong/corrupt/incompatible model assets refuse; unsupported CPU/provider state is truthful; lexical-only and approved remote modes function without local ONNX. No silent model/provider substitution. A disabled optional deployment is not recorded as a passed interoperability test.

### R4-5 — Citations, temporal search and canonical context

Deliver: exact-source citation revalidation, as-of/lineage through core, ledger-confirmed Full current/history resolution, bounded authorized context composition and canonical manifests. Preserve E03/E04 reference, time and snapshot distinctions.

Gate: no fabricated authored valid_from/valid_to fields, stale page splicing, hidden topology, unauthorized sources or unsupported authority. Ordinary notes remain ordinary. Missing confirmation yields a truthful result/refusal, not invented standing.

### R4-6 — Two-lane ingest, watcher reconciliation and recovery

Deliver: ordinary Markdown and governed GKX lanes, deterministic parsing/admission, bounded scan/update, verified generation/state pointers, per-root/state ownership, locks/journals/reconcile, restart and doctor diagnostics.

Gate: injected crash/partial write/corrupt state/alias/concurrent scan cases refuse or recover deterministically. Same-generation mutation invariants from T01 apply to the Rust host too. An observed source deletion removes only the reconciled operational projection; it does not prove semantic supersession or authorized disposition.

### R4-7 — Multi-agent MCP and service identity

Deliver: stdio and Streamable HTTP service surfaces, exact identity/scope/revocation lifecycle, bounded sessions/queues/cursors/events, host/origin/listener controls, cancellation and fair concurrent lanes. Carry forward current diagnostic, discovery and event acceptance.

Candidate r4 tool families include search, document access, topics, lineage, validation, rebuild/status/navigation context and proposal tools. Final public names/shapes and any rebuild/write authority require the explicit versioned contract; they are not advertised as already implemented by this plan.

Gate: real protocol/client interoperability, denial/non-disclosure equivalence, cross-agent isolation, reference/snapshot/long-watch behavior and no unbounded input path. Display identity is not authority. Full retains confirmation capabilities; Lite returns its constrained standing.

### R4-8 — Governed MOCs and agent-note effects

Deliver: migrated qualified TS planning/ownership, immutable proposals and grants, off/propose/explicit auto_apply modes, engine-owned generated regions, approved per-agent roots, receipts, concurrency, archive/journal/recovery/rollback and startup latches.

Generated/applied MOCs re-enter as new Layer-1 source and inherit no upper-layer standing. Reconcile r4's abstract transaction ordering with the qualified TS archive-before design through an explicit durability/receipt ADR; never reorder a proven transaction just to match a prose list.

Gate: human-authored content unchanged, every committed effect has a bound receipt, revoked/stale/indeterminate authority fails closed, real crash and target-host durability tests pass. No dual TS/Rust writer experiment against production state. Unsupported authority/host profiles stay disabled.

### R4-9 — Evaluation, tuning and governance correctness

Deliver: quality and governance evaluation tracks, reproducible sealed corpora, exact fixture/provider/environment metrics, regression comparison, bounded tuning proposals and change-control record.

Gate: recall/ranking gains do not weaken admission, identity, source-byte citations, temporal/currentness correctness or hidden-data noninterference. Benchmark methodology distinguishes internal/independent, cold/warm, model/no-model and client/server time. Tuning promotion is reviewed, not automatic semantic authority.

### R4-10 — Everyday Lite user experience

Deliver: gkx-lite from the same workspace, safe folder/state initialization, ordinary/GKX explanation, local-only default, optional watcher/MCP/model-pack selection, discover/read/search, explicit health/doctor/recovery and comprehensible refusal guidance.

Every Lite result exposes at least: standing=projection_only; ledger_confirmation=unavailable; currentness=unconfirmed; authorized_use=not_evaluated. Authoritative current/history and GCP-6/7 requests return structured requires_full_engine with explicit resubmission guidance. No silent automatic forwarding and no unqualified lightweight governance engine.

Gate: fresh-user setup and E07 product tests pass with no mandatory catalog sweep or model download. Thin-client packaging does not fork parser, lineage, policy or canonicalization semantics.

### R4-11 — Packaging, hardware and release qualification

Deliver: exact Full base, Lite base and optional offline gkx-lite-local artifacts; reproducible source/dependency/toolchain manifests, licenses/notices/SBOM, hashes and actual linkage declarations. Node/Python must not be required for the standalone Rust product merely because the development harness uses them; optional dynamic native/model runtime dependencies must be disclosed honestly.

Required target matrix from r4: Linux x86_64/arm64, macOS arm64 and Windows x86_64, with explicit Intel Mac disposition. Mandatory x86_64 paths must not assume AVX2/FMA; runtime-detect accelerators and test the agreed Sandy/Ivy/AVX-era CPU floor on actual suitable hardware or an explicitly accepted equivalent. Do not claim hardware qualification from compilation alone.

Gate: clean-machine install/doctor/smoke, zero model/endpoint/download behavior in base, offline model-pack installation/verification, wrong-architecture/CPU behavior, path/permissions, concurrency, crash recovery and rollback pass per claimed target. Signing/publication use separately authorized identities and release scope.

### R4-12 — Downstream integration and separately authorized cutover

Deliver: exact Full/Lite shared coordinate and product contracts; Kosmos/Observatory adapters and acceptance; any explicitly approved Hindsight/Marshal/other consumers; shadow comparison, accepted deviations, operational migration/rollback and release closure.

Run the documentation-intent gate against the adopted exact checklist and update DIVERGENCES.md, TRACEABILITY.md, stability promises, migration guides and third-party notices. Bind each documented promise and intentional deviation to executable evidence; keep retrieval/index outputs Projection-class derived state.

r4 calls this an eight-invariant gate. Root located [GKOS-DOCSTD-001 at the audited Standard SHA](https://github.com/Odenknight/gkos-standard/blob/71b899473473f47172b181973027f3eb7da25104/docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md), which is marked proposed/non-normative and lists seven rows: receipt/grant-based authority; preserved contradictions/history; deterministic disclosed mandatory checks; specialization without authority transfer; fail-closed sensitivity; implementation evidence not automatically amending the Standard; and path-independent identity. Reconcile that seven/eight and adoption discrepancy in Q-INTENT/R4-0. Preserve the accepted underlying invariants, but do not invent the missing eighth item or claim this proposed checklist is already a ratified normative artifact.

Gate: all previous cumulative and downstream gates pass at the exact artifact tuple; the owner separately authorizes Engine/Lite 3.0 cutover. Only then create v3.0.0 at the accepted release commit and verify the remote tag/merge correspondence that day. Never publish a Rust 2.x release because of stale prose in an older checklist.

TypeScript retirement is a later disposition, not an automatic effect of a passing differential suite, release tag, shadow run or first successful Rust start.

## 9. Standard v0.81 and DDCV: separate dependency chain

### S0 — Reconcile ratified source and release closure

Use the Aug 29 R18 baseline, confirmed by the owner in this task. Preserve v0.80 and historical decision IDs. Reconcile the Standard source coordinate, Engine release identity and Lite pin/tag/main dossier. Owner allocation/collision review is required for new decision IDs; do not preemptively consume the expected R19 number.

### S1 — Finish actual Track A GCP-4/GCP-5 requirements

Consolidate complete Standard-owned requirement sets, R17 applicability/diagnostic overlays, the original nineteen mutation gaps and all R18-added gates. Distinguish normative failures from informative ingestion warnings. A registered code without an exercised failing path is not coverage.

### S2 — Replace synthetic gate confidence with executable refusal evidence

Harden missing/malformed input handling in the R18 evaluator; validate required structures before comparisons or truthy flags. Test validity windows, context/digest bindings, restrictiveness, authorization/action hashes and impossible timestamps. Wire the real runner to the intended Track A catalogs/fixtures; eliminate mandatory UNEVALUATED results with capable execution.

Separately repair Standard's canonical encoder/verifier: valid calendar dates and well-formed Unicode must be checked before encoding. Root reproduced acceptance of an impossible compiled_at date and silent replacement of a lone UTF-16 surrogate with U+FFFD. Reject malformed source text instead of changing its canonical meaning; retain byte parity for all valid inputs and keep these Standard-helper defects distinct from Engine's legacy JSON and retrieval/JCS domains.

Add portable mutations that actually trigger the required decision and durable-refusal semantics, with negative twins and independently checked outputs. Boolean predicate fixtures are useful unit tests, not a proof of real GCP-4/5 lifecycle execution.

### S3 — Independent review, environments and artifact identity

Collect the ratified independently enrolled reviewer/family evidence, exact action/source/context bindings, and acceptance in two independently provisioned environments. Required-capability checks must pass in a capable hosted lane. Preserve guarded HOLD when the Primary Approver is unavailable/recused under the ratified rules; no invented substitute quorum.

Repair current release-script/allocation drift and bind source, dependency, toolchain, environment, fixture, result and artifact digests. Strict lint, catalogs and release-base parity must agree with the actual runner output.

### S4 — Conditional Standard v0.81 publication

The owner has ratified one-release automatic merge/tag/publication once the exact-bound pipeline is fully green. It cannot publish while any mandatory result is failed, skipped, unsupported without capable alternate PASS, blocked, held, unevaluated, waived or unexplained. Root verifies the closure at the final head before invoking that authorization.

This roadmap audit does not satisfy those gates and therefore does not publish Standard v0.81. DDCV, Engine/Lite release, production deployment and Rust cutover are not silently included in the authorization.

### D0-D5 — DDCV informative program, non-gating for v0.81

1. D0: reconcile scope/source/ID allocation and the SRTP overlap map; preserve Layer-1 snapshots and governed ledger authority.
2. D1: draft the provisional informative, non-normative, non-qualifying DDCV decision; qualifying_profiles remains empty until a later ratified qualifying catalog justifies otherwise.
3. D2: prepare DerivationRecord and CurrencyVerificationReceipt schemas, canonicalization row, diagnostics and the fourteen planned fixtures with negative cases; qualify documentation/schema/runner consistency without claiming normative coverage.
4. D3: build the separately bounded code-graph adapter through approved public Engine MCP/CLI contracts, not private SQLite or a second semantic authority.
5. D4: integrate the approved Engine experiment disabled by default, using exact source/contract pins and clear confirmation limits.
6. D5: only if justified and approved, qualify Graphiti/Falkor Mode A as an optional projection. No projection database, provider or language becomes a mandatory Standard dependency.

Each D stage has its own review/integration gate. Completing DDCV does not automatically enable consumers; incomplete DDCV no longer blocks Standard v0.81 under the ratified Aug 29 decision.

### Hindsight follow-through

- Reconcile merged WP1 and merged Engine provider PR #31 against component-lock/decision records; record the exact approved provider contract rather than treating obsolete unmerged labels as present fact.
- Keep static import-fuse/Python/Rust placeholder acceptance separate from a working adapter. Resolve remaining R2 contract/dependency/runtime authorization before activation.
- Correct declared test dependency and fixture-runner reproducibility gaps, then produce real adapter noninterference/refusal and pinned-interface evidence in isolated scope.
- Do not make Hindsight a prerequisite for core TS/Rust delivery unless the owner makes its integration part of the completion manifest.

Hindsight's own complete follow-through remains a separate, decision-gated program. Its contracted independent Python/Rust language lanes must not be silently replaced by a TypeScript gateway because Full is stabilizing in TS.

| Stage | Required deliverable and evidence |
| --- | --- |
| H0 Ratification and reproducible inputs | Resolve R2/D1-D8, provider/EVD/resource/model locks and exact Standard/Engine identities; correct the hash-locked PyYAML dependency gap and rerun the capable clean environment |
| H1 Durable SQL execution | Execute the four migrations in an isolated supported PostgreSQL lane; prove serializable append/head locking, atomic outbox, exact retry binding, default-deny grants and forbidden direct writes, not just SQL-text inspection |
| H2 Gateway and inbox | Implement exact-byte HMAC-before-parse, duplicate-member rejection, document-aware idempotency, conflict quarantine, scope enforcement and retained canonical receipts; malformed/replayed input cannot reach materialization |
| H3 Deterministic adjudication | Implement Stage0 validity/quarantine and Stage1 risk; bind current policy/context/authority evidence to the real runtime; failed/unevaluated checks prevent disposition |
| H4 Independent semantic review | Implement separately enrolled read-only Stage2 reviewer and exact model/prompt/deployment/family pins, claim-level evidence and human escalation; reviewer cannot approve/materialize its own work |
| H5 Monotone decision and review operations | Implement Stage3 priority gates, sealed receipt verification, human queues/ballots/history and narrow derived-admission eligibility; lower-priority scores cannot cancel stronger review requirements |
| H6 Recall and materialization boundaries | Resolve source lineage before release, independently filter recalled scope, capability-check materialization only after ledger/outbox publication and independent effect-receipt verification |
| H7 Recovery and retention | Qualify duplicate delivery, restart/replay, revocation, immutable receipt retention through upstream pruning, checkpoints, authorized purge and reconstruction; no unreviewed dual writer |
| H8 Independent language parity and activation | Run actual Python/Rust differential behavior, crash/concurrency/recovery and supported deployment tests; scaffold-only workflows do not qualify this stage. Activation/materialization require separate exact-build authority |

These stages reuse Full's agreed admission contract without copying a second GKOS authority engine. Hindsight's existing marshal-canonical-json/v1 artifacts, GKX-CBOR-1 and Marshal's EVD domain remain distinct; any translation retains original bytes and explicit lineage rather than silently rehashing stored history.

## 10. Marshal Core's separate Rust lane

Marshal work may progress in parallel because its qualified pure primitives need not mutate GKOS TS behavior. It retains its own owner/authority/license and existing Python runtime/writer boundary.

| Stage | Work | Exit / exclusion |
| --- | --- | --- |
| M0 Source closure | Reconcile the exact CLC/MSDK and lifecycle/evidence authorities, historical JCS standing, ABI v2 and unavailable source entries | Exact source register and scope; no guessed authority |
| M1 Candidate G1 intake | Review five CDDL contracts/vectors/maps, disclosed session deviation, schema coexistence and portable GKX reference mapping | Owner ratification plus independent disposition or clean reproduction; candidate docs are not a passed gate |
| M2 Pure semantic completion | Fill only authorized canonical/evidence/lifecycle/continuity/verification gaps using the existing Rust 1.82 workspace | Unit/negative/property/differential checks, no filesystem/process/network/SQL/effect ownership by inference |
| M3 ABI and shadow qualification | Exact PyO3/maturin binding identity, malformed input/absence/mismatch refusal, read-only shadow parity against the separately approved reference | Full binding tests on required platforms; no Python fallback masking divergence, no writer appointment |
| M4 Provider/consumer admission | Resolve AP3 identity/nomenclature, provider/adapter/index/root/pin choices and license/consumer enrollment | Explicit contract and disabled-then-qualified integration; no PyO3-as-Node/WASM assumption |
| M5 Production authority, only if separately commissioned | Greenfield authority generation, complete scale/continuity/checkpoint evidence and exact-build appointment | Separate owner decision; Python production chain is not migrated by assumption |

Older planning targets such as a 100k chain, 10k shadow cases and 1k clean comparisons are candidate scale gates to reconcile against current authority and data models—not counts already achieved by the current 40-test suite. Do not copy Marshal private implementation into public GKOS/Kosmos repositories without an explicit license/reuse decision.

## 11. Full/Lite artifacts, downstream qualification and cutover

### G-DIST — Artifact and consumer closure

- Full and Lite: exact shared Rust source/contract coordinate, feature/dependency graph and constrained Lite standing proven in actual artifacts.
- Kosmos: select and qualify the real Rust interface (service/native/WASM only if approved), keep shared semantics, host-safe effects and explicit capability negotiation; preserve offline/browser boundaries.
- Observatory: replace development renderer/base-plus-patch ambiguity with an exact approved release representation, carry E01-E07 and Fable-derived regressions forward, verify deployed hashes and request-to-render evidence.
- Hindsight/Marshal: integrate only selected, licensed, explicitly ratified consumer contracts. They are not mandatory just because this document covers their repositories.
- Benchmark: use the recovered independent corpus/tooling if available and appropriate; otherwise record the exact outstanding audit scope and make no independent comparative claims.

Qualification includes old/new data formats, clean install/upgrade, long-running restart, cancellation, revoked identity, stale source, corrupted state, two agents, concurrent readers/writers where allowed, crash recovery, archive/receipt integrity and clean rollback. A successful build is only one input.

### G-CUTOVER — Separate Engine 3.0 authorization

Present the owner with the exact accepted commits/artifacts, remaining limitations, operating profile, measured regression/performance dossier, backup/migration/rollback plan, go/no-go conditions and authority handover procedure. Preserve one writer; shadow outputs are never simultaneously authoritative.

Execute only the authorized bounded cutover. Verify tag/source/artifact/served-runtime identity, required live workflows and recovery. A failed mandatory check returns to the accepted rollback state and remains failed in the ledger; it does not become an accepted exception without a new explicit decision.

### G-RETIRE — TypeScript disposition after successful cutover

Retirement requires successful cutover qualification plus an explicit owner disposition defining observation/support window, rollback retention, artifact archival, CI/replay availability, security maintenance and consumer migration. Keep historical golden corpora and release evidence accessible. Do not delete the TS repository, tags, vault data, caches with evidentiary value or recovery artifacts as a cleanup convenience.

## 12. Optional expansion after justified demand

These remain separate scoped projects, not reasons to expand the immediate TS completion boundary without Q-SCOPE.

- External code-graph, Graphiti/Falkor, enterprise-document or search adapters with exact public interfaces and least authority; retain plain local operation without cloud/database dependencies.
- Tag normalization and human overrides that preserve raw authored tags and provenance; no semantic authority from an enrichment suggestion.
- Engineering, research, policy and regulated-domain profiles built from approved templates/diagnostics/evaluation corpora; explicit scope, privacy, false-positive review and licensing.
- Optional model/runtime packs and accelerators only after resource, CPU, artifact integrity and redistributability qualification. No mandatory vendor endpoint or hidden model fetch.
- Identity/provider mappings only after enrollment and exact trust boundaries; no automatic AI approval, generalized autonomy, protected writes or broader Layer-7 effects from a convenient UI switch.

Every optional profile needs a user problem, independent acceptance criteria, maintenance owner, resource/privacy budget, portability/exit strategy and proof it does not fork the shared Engine semantics.

## 13. Reduce friction without weakening gates

1. Add one source-coordinate manifest and one machine-readable packet/evidence ledger shared by the plan and CI. Generate status tables from recorded results where possible; do not hand-edit completion badges independently.
2. Provide a reproducible development doctor/preflight covering Node/Rust/Python/toolchains, physical FTS5, model capability, path security and required browser/host availability. Missing capabilities report unsupported/blocked, never automatic PASS.
3. Supply one documented qualification entrypoint per repo and a cross-repo wrapper that records exact commands, exit codes, versions, fixture hashes and skips. Separate quick local checks from full platform/model/crash/soak qualification.
4. Preserve immutable historical contract/replay lanes and current runtime lanes. Avoid repeatedly rebasing frozen manifests or requiring developers to discover the protected-path mismatch anew.
5. Provide reusable synthetic coherent/conflicting/secret-canary/temporal/project fixtures and read-only setup defaults. Do not require real vault contents or private credentials for ordinary regression work.
6. Consolidate install/serve/settings/discovery/recovery instructions around the actual shipped endpoint. Eliminate false MCP snippets, duplicate patch application and development-pin/release ambiguity.
7. Add Observatory static/unit/browser and capable Linux installer CI; include production-wired adoption tests in Kosmos's ordinary browser gate when that feature is connected.
8. Publish safe field-level diagnostics, next actions, source/ref recovery and explicit standing. Reduce rediscovery round trips and repeated catalog scans without leaking hidden scope.
9. Capture only bounded redacted traces with an operator export path. A single known request should be traceable across Engine, bridge, event delivery and viewer without searching giant logs.
10. Use small reviewed branch integrations, one owner per file set and explicit dependency order. Administrative stale PR cleanup is a reviewed action, not a prerequisite to rewrite already merged code.
11. Add a release-readiness command that verifies artifacts/receipts against their exact source tuple and reports why a gate is closed. Do not make it a release button until the relevant publication authority applies.
12. Keep a decision queue of only genuinely blocking choices. Supply recommended bounded defaults and evidence, continue independent work, and escalate scope changes before coding them.

## 14. Evidence requirements and stop conditions

Each qualification record includes repository/ref/tree, tested artifact and contract/schema IDs, lockfile/toolchain/environment/hardware identities, fixture/provider/model hashes, command and exit, pass/fail/skip/unsupported counts, mandatory-capability status, timing methodology, privacy/export treatment, verifier, accepted deltas and rollback disposition.

Never sum overlapping focused/full/repeated test counts into a larger fictional coverage number. A skipped Linux installer is not a Windows pass; mocked vectors are not an actual model; a static fixture is not live Engine execution; a browser event row is not a rendered ship; a green branch is not current-main integration; an accepted proposal is not authorized execution.

Stop the affected mutation/release packet on unknown authority, changed input/source, revoked grant, corrupt ledger/state, unsupported required host safety, mismatch of exact pins, hidden-data disclosure, missing capable mandatory result or an unreviewed compatibility change. Continue independent source/fixture/documentation work where safe.

## 15. Next ready execution order

1. Resolve Q-SCOPE/Q-ORACLE/Q-GUARD and record the current TS candidate/source tuple.
2. Implement T01's shared reference and cursor invariants with red-then-green tests; independently verify the exact fixes.
3. Complete the historical/current CI reconciliation and genuine receipt generation; qualify the current Engine baseline.
4. In parallel, implement protected stage instrumentation, truthful Lite quick-connect/pin correction, and the Rust differential/fixture preparation packets.
5. Finish safe refusal/evidence/snapshot UX and prove one coherent project workflow, keeping repair proposals separate from source writes.
6. Reconcile and qualify the approved TS effects/proposal/identity/Kosmos-host backlog, then close G-TS on the exact accepted oracle.
7. Advance R18's real evaluator/runner/mutation/closure work independently; publish Standard v0.81 only under its already ratified all-green condition. Continue DDCV without making it a v0.81 blocker.
8. Continue the cumulative single-Rust build, qualify distributions/downstreams, then seek the separate 3.0 and later TS-retirement decisions.

This order is designed to make the current product useful and trustworthy, preserve proven behavior, reuse unfinished work, and prevent a rewrite from becoming a way to conceal incomplete TypeScript contracts or unresolved authority.
