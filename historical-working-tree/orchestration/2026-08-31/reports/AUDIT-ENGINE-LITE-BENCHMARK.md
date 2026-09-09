# Engine / Lite / benchmark audit — 2026-08-31

## Decision summary

**Do not declare TypeScript complete or begin authoritative Rust replacement.** Current Full has two reproduced reference/snapshot correctness defects and failing main CI. Substantial effects code exists unmerged and is worth reconciling, not rewriting blindly. Lite has genuinely executable Rust retrieval code, but it is a pinned downstream implementation with sealed authority boundaries, not a complete Rust engine. The requested independent benchmark repository could not be accessed; no benchmark completion or comparative-performance claim is justified.

Priority order: Stability > Reliability > Fidelity. This audit made no remote writes, commits, PR changes, or source changes. Local isolated clones/build products, one synthetic probe, and these reports were created. Existing worktrees were not modified. No applicable AGENTS.md was found in the workspace ancestor chain or either cloned repository. No live vaults or live model/provider calls were used.

**Oracle/release coordinate blocker:** root's ratified R18 coordinate identifies Full2.1.2 at `0584a5d3e70384ef65e9069fbe1d6fd1d80cfc04`; actual current v2.1.2 tag resolves to `7bf14b481e78c5ae9d1e14661602be4f24559d0e`, while current main is `8207958047b3361ae21ac07c5a2abbd26a42a684` and still declares package2.1.2. These are three different coordinates, not interchangeable oracle identities. The R18 interpretation is root-supplied authority context; tag/main/package values were independently read here. Reconcile the approved oracle SHA, published package artifact and release version explicitly before pin migration or parity acceptance. **Do not silently move/retag v2.1.2** or treat a package version string as an immutable source pin.

## Immutable source inventory

Last REST recapture: **2026-08-31T17:46:40Z**. Complete open-PR head/base SHAs, branch names, titles, and update dates are in `engine-lite-source-test-ledger.json` beside this report.

| Repository | Current default branch | Relevant tags / releases |
|---|---|---|
| Odenknight/GKOS-Engine | main `8207958047b3361ae21ac07c5a2abbd26a42a684` | v2.1.2 tag `7bf14b481e78c5ae9d1e14661602be4f24559d0e`; v2.1.1 `f4dfda16eac746c667cf042f908a918d9acc6713` (release published Aug 18); package on main still 2.1.2. v2.1.2 was not in the retrieved release collection. |
| Odenknight/GKOS-Engine-Lite | main `4027bfc4499ad0a2f3e753401f1320468e283823` | v2.1.2 tag equals current main; desktop-v0.2.0 `5554894339cd4ca680ec0f02fdf32bf265a4b269`, prerelease July 26. CLI package 2.1.2, desktop package 0.2.0. |
| mariusTalpos/gkos-engine-benchmark | **Not verified** | Exact REST URL and GitHub connector both returned 404; GitHub repository-name search returned no results; web open failed/cache miss. This does not prove deletion or nonexistence. No code, SHA, PR list, tags, tests, or metrics obtained. |

Full [PR #37](https://github.com/Odenknight/GKOS-Engine/pull/37) merged at 17:09:34Z into the current main. Its final head was `0dffe3b71b36bd1011418ea24b38ae1d0c6493d3`, base `0584a5d3e70384ef65e9069fbe1d6fd1d80cfc04`. It was **not** still at prior-reviewed `433fd01e5e49772b80da784e72dc8cbce1459c16`. The last increment added parameter-error contracts/help, tests and fixtures; it did not repair the two defects below.

### Every currently open PR

All are drafts. REST says `mergeable=true, mergeable_state=clean` for Full #26/#27/#29/#30 and Lite #16–#21 **against their own stacked bases**, not current main. Lite #9/#13/#14 returned unknown mergeability. Branch protection reads returned 401; actual required-review/status rules could not be verified. No approval is implied.

| Repo/PR | Exact title | Head prefix | Base ref | Relationship to current main |
|---|---|---|---|---|
| Full #26 | feat: add deterministic hybrid retrieval core | 0164f3d | codex/phase-0-recon-adrs | Head already ancestor of main |
| Full #27 | feat(retrieval): add lineage citations and temporal search | 5396d46 | codex/phase-1-retrieval-core | Already ancestor |
| Full #29 | feat(retrieval): add and execute sealed Phase 4 evaluation | 98f4faf | codex/phase-2-lineage-citations | Already ancestor |
| Full #30 | Phase 5 Slice A: freeze watcher recovery contracts | 7b5262b | codex/phase-4-retrieval-evaluation | Already ancestor |
| Lite #9 | Harden engine pin resolution workflow | d17b25d | main | Old divergent packaging branch |
| Lite #13 | Define Engine-Lite compatibility contract | 46c82b3 | main | Old divergent compatibility/docs branch |
| Lite #14 | Clarify GKX and product naming | 6fe38fc | main | Old divergent naming/docs branch |
| Lite #16 | feat: add pin-bound Lite retrieval core | eda2e21 | codex/phase-0-recon-adrs | Already ancestor |
| Lite #17 | feat: add Phase 2 lineage citations | 45bfc3c | codex/phase-1-retrieval-core | Already ancestor |
| Lite #18 | Phase 3: add fail-closed ingest validation | 41912fd | codex/phase-2-lineage-citations | Already ancestor |
| Lite #19 | Phase 4: retrieval evaluation parity | d1c0d5d | codex/phase-3-ingest-validation | 4 commits unique; main 3 commits ahead of common ancestor |
| Lite #20 | Phase 5 Slice A: watcher recovery contracts | a39f14d | codex/phase-4-retrieval-evaluation | 8 unique commits including #19 |
| Lite #21 | Post-Phase 5: admission and desktop boundary fixes | ce80955 | codex/phase-5-watcher-recovery | 10 unique commits including #19/#20 |

An ancestor PR is administrative unfinished work, not evidence its feature is missing. Do not merge or close any of these without root/user authority and final head recapture. Full's phase-5 remote branch tip is now beyond the original PR #30 head; the PR metadata and branch-tip evidence must remain distinct.

## Current Full findings

### P1 — same-generation record references change meaning across tools

Evidence scope: a **synthetic same-generation host-mutation freshness gap**, independently repeated by root. It is not a demonstrated live-vault incident, and this audit has not established when it was introduced. Priority reflects the shared reference contract under this explicit precondition.

Reproduced against `8207958` using `../engine-audit/review-probes.mjs`. Its fixture is extracted from the repository's synthetic HTTP test, with imports redirected to the freshly built audited dist; source remains unmodified. After a title/content mutation without a generation increment, `gkos_note_read` returns `GKOS_P6_REFERENCE_UNKNOWN`, but `gkos_record_validate`, `gkos_record_assess`, and `gkos_lineage_get` all accept the old ref. Assessment evidence digest changes; lineage returns a different root reference.

Cause: common `recordNode` checks generation and current node presence but not bound source digest; only note-read adds the digest check. [Current resolution code](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/src/service/mcp.ts#L570), [validate/assess/lineage consumers](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/src/service/mcp.ts#L650).

Bounded repair: one shared current-source reference validator, used by every record-ref consumer; distinguish absent source adapters honestly; identical non-disclosing refusal for stale/hidden/deleted/foreign refs. Add mutation, rename, path reuse, changed UID, same-generation admission change, and fresh-resolution tests across all record tools. Preserve success bytes where inputs are genuinely unchanged.

### P1 — temporal cursor skips a row after same-generation removal

Evidence scope: a **synthetic same-generation host-mutation freshness gap**, independently repeated by root; no live incident or newly introduced regression is claimed. Production hosts that always advance generation may mask the precondition, but the current service fixture supports and tests other same-generation mutation behavior, so consistent fail-closed binding still needs qualification.

Reproduced: request one temporal row, remove that earlier source, then continue with the returned cursor and unchanged generation. Continuation succeeds and retains its snapshot ID, yielding `["index.md"]`; a fresh query yields `["Second.md","index.md"]`. `Second.md` is silently skipped.

Cause: pagination binds generation/query/scope but slices a newly reconstructed candidate list by stored offset, without binding its actual snapshot. [Pagination helper](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/src/service/mcp.ts#L268), [temporal query](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/src/service/mcp.ts#L678).

Bounded repair: bind canonical authorized candidate/order/source fingerprints or retain a truly immutable bounded snapshot. Apply equivalent tests to lineage and navigation-audit continuations, whose current code also uses generation/offset; only temporal skipping was directly reproduced. Test insertions, removals, reorder, policy changes, changed content, multiple pages, and stable-state determinism. Never expose hidden membership in invalidation diagnostics.

### P1 release gate — current main CI is red, not an unmerged historical warning

[Run 33418044551](https://github.com/Odenknight/GKOS-Engine/actions/runs/33418044551), current SHA: all Linux build jobs Node22/23/24 fail Tests, then artifact upload fails because the downstream qualification receipt was not produced. Windows path-security and all watcher Linux/Windows jobs and watcher artifact audit succeed. The inspected [Node22 job](https://github.com/Odenknight/GKOS-Engine/actions/runs/33418044551/job/99573337429) completed **940 tests: 935 passed, 1 failed, 4 skipped**, duration 443,972.629ms.

Sole test failure: `test/agent-identity-mcp-contract.test.mjs:805`, assertion at line812, expecting zero changes in protected paths versus its historical baseline. Actual paths: README.md, bin/gkx.mjs, src/desktop-agent.ts, src/ingest/storage.ts, src/watcher/coordinator.ts, src/watcher/host.ts, src/watcher/journal.ts. [Gate](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/test/agent-identity-mcp-contract.test.mjs#L805).

Repair requires an explicit decision on how the frozen historical contract qualification relates to ongoing main evolution. Preserve original frozen bytes/receipts, establish an approved post-baseline change inventory and current runtime regressions, then make the gate evaluate the correct scope. Do not delete the assertion or broadly whitelist paths to obtain green. No current full-suite pass is claimed.

### Settings, graph, effects, ingress, identity and adapters: actual state

| Surface | Implemented and inspected | Remaining qualification / integration boundary |
|---|---|---|
| Settings | `gkx settings`, explicit config validation, key ownership/status inventory, inactive-setting warnings, content-size bounds | Desktop loads no gkos.toml keys; service/agents/graph/watcher TOML coordinates remain ignored in these executables; CLI retrieval.mode is ignored/derived. Some index keys are metadata-only. Presence in schema is not wiring. [Inventory](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/bin/settings-inventory.mjs#L1) |
| Graph | Canonical TS graph/projection, authorized REST graph and Graphiti episode read/export surfaces, visibility filtering, temporal code | Temporal cursor defect above; no proof of a graph.sqlite_projection or similarity_projection runtime toggle. Graphiti adapter is an export/projection module, not an authoritative external graph writeback service. [Adapter](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/src/graphiti-adapter.ts#L1) |
| Navigation effects | Main capability model distinguishes planner/config/authority/journal/policy/recovery/enablement | Actual `src/navigation-effects` implementation is absent from main. Availability flags do not supply an executor. Unmerged implementation detailed below. |
| Proposal ingress | TS intelligence validates untrusted proposal types/patches, rejects authoritative-field changes, retains proposal-only output; Lite assist invokes optional local sidecar | No `/proposals` route or proposal application endpoint was found in current service server. It refuses other non-GET operations except explicit MCP/SSE handling. Capability status is not durable proposal ingestion/application. [Validation](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/src/intelligence.ts#L112), [capability truth](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/src/service/capabilities.ts#L49) |
| Identity/MCP | In-memory credential registry, scoped/revocable read bindings, authorization projections, bounded sessions/cursors/events and MCP runtime; large generated contract fixture packs | Generated fixture evidence does not implement every durable identity operation. Registry explicitly defers local administration, effect execution, governance append and adapter capabilities; external mapping schema says authenticated adapters are deferred. Need explicit runtime/fixture/proposed matrix, not a claim of complete durable identity. [Registry](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.2/tool-registry.json#L14), [credential implementation](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/src/service/auth.ts#L37) |
| Providers | TS OpenAI-compatible vector adapter with request/model/dimension/count validation, timeout/cancellation; injected local ONNX/MCP adapter seams; current service retrieval executes real native FTS5 and verified citations | Service `gkos_search` advertises only operator-configured local ONNX, remote providers/reranking disabled. Runtime assets, injected adapter availability and provider conformance remain separate. No live-provider interoperability tested here. [Adapters](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/src/retrieval/providers.ts#L125), [service search contract](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/src/service/mcp.ts#L99) |

## Important unmerged implementation, not just PR titles

### Full effects candidates

`codex/navigation-effects-post-phase5` = `808d875b557f4cfd2bb0addccba44d70c9748f35`, four unique commits, main 43 commits ahead of common ancestor. Newer `integration/navigation-effects-reconciliation-20260827` = **`e4f00b3a9289c1d35d1a02e50dcdc266945fe015`**, four unique commits, main 18 ahead. The latter adds ~4,072 lines across 54 files relative to merge base; hosted [CI 33050317062](https://github.com/Odenknight/GKOS-Engine/actions/runs/33050317062) is successful **at that old exact SHA**, not current-main integration.

Inspected actual [planner](https://github.com/Odenknight/GKOS-Engine/blob/e4f00b3a9289c1d35d1a02e50dcdc266945fe015/src/navigation-effects/planner.ts#L49), [Node executor](https://github.com/Odenknight/GKOS-Engine/blob/e4f00b3a9289c1d35d1a02e50dcdc266945fe015/src/navigation-effects/node/executor.ts#L41), and reconciliation test. Planner checks ownership, authority capability/root/policy/expiry, adopted digests, generated-region preservation, no-op/stale/review-required distinctions, archive paths and deterministic effect identity. Executor implements vault/target locks, archive-before, temporary write/replace, journal, immutable receipts, recovery latch, rollback, and injected fault cuts. This is meaningful reusable TS work.

Limits are explicit in code: caller must acknowledge **cooperative-vault** (no hostile concurrent ancestor replacement); directory flush is false and sudden-power-loss directory-entry durability is not proven. Main service's disabled effects flags are not automatically wired to this executor. The reconciliation test proves import purity, not product write authorization. Broad import/merge would alter public exports, package/build output and frozen-baseline tests. Required next slice is replay/reconcile onto current main, retain old read-only behavior, and rerun crash-cut/alias/concurrency/revocation/archive/rollback tests across supported OSes before any application is enabled. Owner authorization for MOC ownership, allowed root, grants, retention and recovery remains mandatory; MCP execute remains deferred.

`integration/kosmos-standalone-20260826` = `d88c639d155e0ec291f6c2bb18cbec3f9e672553` and `codex/phase6-f1-contract-pack` = `e29e04bdad1cd192a25eba2d682a4c46774def28` have unique old ancestry combining effects, F1 packs and local-service work. Much later equivalent service/contract functionality is already on main. Commit uniqueness is not proof of missing functionality; use semantic diffs/cherry-pick review, not wholesale merge. Older science, license/naming and Phase3 branches also diverge; this bounded audit did not requalify every historical patch.

### Lite actual gaps and valuable draft #21

Main [package](https://github.com/Odenknight/GKOS-Engine-Lite/blob/4027bfc4499ad0a2f3e753401f1320468e283823/package.json#L1) pins Full **`e7cc0dd478af3d0bda216c5258dec5f77932def7`**, not current Full. Main CLI is a whitelist pass-through (validate/index/assess/search/graph/export graphiti) plus proposal-only assist. Desktop settings are a five-field TS schema mirrored in Rust; no full shared Engine settings editor exists. [Settings](https://github.com/Odenknight/GKOS-Engine-Lite/blob/4027bfc4499ad0a2f3e753401f1320468e283823/desktop/src/settings-schema.ts#L1).

**Confirmed compatibility defect:** main desktop generates `/mcp` quick-connect commands, while its pinned Engine desktop server is GET-only health/notes/graph/Graphiti and has no MCP route. The native CI compile asset is even separately pinned to Engine v1.1.3; npm and native-sidecar pins are distinct. [Current snippets](https://github.com/Odenknight/GKOS-Engine-Lite/blob/4027bfc4499ad0a2f3e753401f1320468e283823/desktop/src/snippets.ts#L20), [exact pinned server](https://github.com/Odenknight/GKOS-Engine/blob/e7cc0dd478af3d0bda216c5258dec5f77932def7/src/desktop-agent.ts#L393). Current green tests do not establish real quick-connect interoperability.

Draft #21 at `ce8095515d2a1a7b23a10c01bd8f22e2dc5917e2` replaces misleading MCP snippets with exact REST routes (Windows curl.exe handling), adds installed Engine compatibility checks, strengthens local assist/command boundaries and desktop settings handling. [Corrected snippets](https://github.com/Odenknight/GKOS-Engine-Lite/blob/ce8095515d2a1a7b23a10c01bd8f22e2dc5917e2/desktop/src/snippets.ts#L1), [compatibility validator](https://github.com/Odenknight/GKOS-Engine-Lite/blob/ce8095515d2a1a7b23a10c01bd8f22e2dc5917e2/scripts/check-engine-compat.mjs#L1). It includes #19/#20; hosted [CI 32888245801](https://github.com/Odenknight/GKOS-Engine-Lite/actions/runs/32888245801) passes at the draft SHA, not merged current main. Choose whether to qualify the pinned REST product or upgrade to a qualified current MCP engine; do not simply advertise MCP because Full main now has it.

## Rust reuse and safe parallel preparation

No Rust directory is tracked on current Full main. Lite current main has `rust/crates/gkos-retrieval`: chunker, deterministic/JCS digests, confidence, RRF/MMR, filters/config, parent expansion, SQLite/FTS5, provider traits, source/citation checks, temporal coordinator, authorized views, ingest envelope verification, writer/path guards. [Library surface](https://github.com/Odenknight/GKOS-Engine-Lite/blob/4027bfc4499ad0a2f3e753401f1320468e283823/rust/crates/gkos-retrieval/src/lib.rs#L1). It consumes Full-produced envelopes and deliberately does not own a second GKX parser, identity/lineage authority or staging/activation authority. Three compile-fail doc tests enforce sealed seams.

Rust draft.2 frozen pack references Full `6e2df27d33ede62ee0d2e3cb7610df478a7d66ce`, a separate pin from Lite npm; manifest claims are not an up-to-date Full-main parity certificate. [Pin](https://github.com/Odenknight/GKOS-Engine-Lite/blob/4027bfc4499ad0a2f3e753401f1320468e283823/rust/contracts/gkos-retrieval-1.0.0-draft.2/FULL-PIN.json#L1). Current conformance test explicitly includes draft.1 fixtures and verifies frozen-byte hashes. No entire TS-engine parity is proven.

Unmerged Lite #19 adds a ~5,619-line Rust evaluation module and frozen evaluation packs plus CLI conformance. #20 adds a ~7,956-line watcher module and a very large generated watcher/recovery pack. Those modules were identified by actual diffs; their full semantics and current-main integration were not locally rerun. They are not missing code, but neither is their existence permission to make Rust authoritative.

Safe parallel packets, after preserving Full ownership: inventory those modules and dependency/license/toolchain pins; create differential fixture runners against explicit TS SHAs; extend Unicode/numeric/ordering/error-envelope golden corpora; fuzz parser-independent envelopes, path guards and storage recovery; build non-authoritative throughput/memory instrumentation; design a private adapter boundary and migration/rollback manifests. Keep Full TS the oracle, freeze only explicitly approved contracts, and avoid divergent Rust authority or production writes. Moving repository ownership or changing packaging requires the program's explicit integration decision.

## Test and command ledger

All local commands run in isolated audit clones. Local Node v24.18.0; Cargo1.98.0; Windows. Passing commands listed independently of compound-shell exit codes.

| Evidence | Result and limitation |
|---|---|
| `npm ci --ignore-scripts` (Full) | Pass; 13 packages installed, zero npm-reported vulnerabilities. No implication of exhaustive supply-chain audit. |
| `npm run typecheck` (Full) | Pass. |
| `npm run build` (Full) | First failed due sandbox esbuild ancestor-directory access, not TypeScript; scoped escalated retry passed all bundles/declarations. |
| Six focused Full files: settings-inventory, service-contracts, service-content, service-authorized-view, service-param-errors, service-retrieval | **46/46 pass, 0 skips**, 3,638.0063ms, normal sandbox after build. Includes native SQLite FTS5 fixtures, no model download/live provider. |
| `node ../review-probes.mjs` from Full (or `node review-probes.mjs` from audit root) | Both correctness defects reproduced, exit0. Assertions intentionally confirm faulty behavior for audit, not correctness. |
| Expanded eight-file run including both identity contract suites | Environment-contaminated: three git-using tests hit cross-account dubious ownership; do not count this as a clean contract run. Other fixture work executed but no complete pass claimed. |
| Targeted retry for the three git-related cases in normal sandbox | Draft.1 frozen-byte test passes; historical protected-path failure reproduced exactly; generator test hits partial-clone schannel lazy-fetch error. Two attempts recorded; no further blanket rerun or completion claim. Use invocation-scoped `GIT_CONFIG_COUNT/GIT_CONFIG_KEY_0=http.sslBackend/GIT_CONFIG_VALUE_0=openssl` for child Git, and exact safe.directory only if changing account. Root independently verifies. |
| Lite `cargo test --manifest-path rust/Cargo.toml --workspace --all-targets --locked --offline` | Pass: **155 unit + 11 conformance**. Initial compilation55.92s. Bundled FTS5 and synthetic filesystem fixtures, no external providers. |
| Lite `cargo test --manifest-path rust/Cargo.toml --workspace --doc --locked --offline` | Pass: **3 compile-fail sealing tests**,0.85s test time. |
| Lite metadata + lockfile SHA guards | Both pass: exact Full dependency SHA and package/license consistency. Not runtime interoperability. |
| Lite main hosted CI33071886635 | All eight jobs success: Node22/23/24, frontend, Windows native, Rust MSRV/latest/Windows. Native tests acquire digest-pinned binaries; current audit did not download/run the GUI or sidecar. |

Full clone `git status --porcelain` was clean after tests; Lite Rust/build outputs are ignored. No source patch was applied. Clone TLS schannel initially failed; `git -c http.sslBackend=openssl clone --filter=blob:none ...` succeeded with certificate verification retained. GitHub logs via gh returned403; read-only connector retrieved the current Node22 logs. Protection reads401 and benchmark404 are access limits, not product failures.

## Benchmarks and completion criteria

### Client Evidence Supplement r3 reconciliation

Read the owner-supplied `[LOCAL_PATH] (dated Aug31, Cowork-client firsthand ledger with separately labelled operator corrections and estimates). It is deployment/client evidence, not a statement that the current audited main has the same defects. Current-main reconciliation:

- The historical audit `stableId` omission/digest mismatch is **fixed in current main and covered by a passing focused test**. Both discovery and audit call `authorizedNavigationSnapshot`, which now supplies admitted UID as stableId; the test checks equal artifact digests and absence of spurious NAV_STABLE_ID_MISSING before/after generation change. [Shared adapter](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/src/service/mcp.ts#L245), [regression](https://github.com/Odenknight/GKOS-Engine/blob/8207958047b3361ae21ac07c5a2abbd26a42a684/test/service-content.test.mjs#L196). Do not repair vault stable IDs from warnings produced by the older faulty adapter. Deployment of this exact fix was not verified by this audit.
- The historical opaque INVALID_PARAMS gap is **implemented and tested on current main** by PR37's final parameter-hint increment. Ten field-error tests passed in the46-test focused run; current runtime advertises draft.3 invalid-param contract metadata. This does not prove every client/deployed process has restarted with the new build.
- `head:false` for standalone records is expected, not a vault repair target. Current `gkos_lineage_get` description explicitly states direct authorized neighbors, not transitive history; standalone can have head false. The stale-reference finding in this audit is distinct and still reproduced.
- The supplement's approximately90s six-page/584-row traversal measures client-observed page-cycle wall time, including bridge transit. Per-page latency, token counts and compact-response savings cannot be promoted to Engine-only or independent benchmarks. No new traversal was initiated.
- Search AUTHORIZED_VIEW_CONFLICT is a coherent-search refusal, not proof of a broken search engine or authorization to rewrite duplicate IDs. Source filenames/mirrors are investigation leads, not mechanical repair instructions. An operator-approved coherent search control and genuinely fresh-session client acceptance remain separate pending evidence.
- Root owns the Observatory event-to-render verification packet. The supplement's retained trail/pulse limits and paused sweeps do not authorize telemetry-state changes, live enumeration or a new client session from this audit.

The inaccessible independent repository is a concrete blocker to auditing that project's claims, tests or branches. Ask for its accessible canonical URL, access, or a pinned archive. Do not replace it silently with Engine's own evaluation and label that independent.

Credible **non-independent** substitute: Engine contains retrieval evaluation/executor/qualification scripts and a successful scheduled Phase4 observation at old Full `0584a5d` on Aug31 (run33384149325), plus successful current watcher/security jobs. Re-run only a separately approved sealed synthetic corpus matrix at the exact candidate SHA; record fixture/config/provider/runtime hashes, cold/warm runs, repetitions, sample exclusions, memory/latency, recall/citation exactness, admission noninterference and failures. No new performance metric was measured here; test duration is not a product benchmark. Current full CI failure means its downstream qualification receipt cannot be presumed.

## Bounded work packets and acceptance gates

1. **TS-01 / Stability — ref and pagination correctness.** Repair shared reference freshness and snapshot binding; add the two current reproductions as red-then-green tests and equivalent consumer matrices. No new API authority. Root repeats exact regressions and focused+full supported-node suites.
2. **TS-02 / Stability — reconcile historical qualification gate.** Decision record for frozen contract vs current-main inventory, preserve historical evidence, update only justified scope, rerun all tests and receipt production on Node22/23/24 and Windows security/watchers. No waiver represented as a pass.
3. **LITE-01 / Reliability — truthful pinned product.** Extract/reconcile #21's REST/snippet/settings/compatibility corrections with explicit npm/native pin matrix; repeat command-boundary, frontend/native, packaging, real synthetic sidecar route tests. Draft stack and ownership of the intended UI capability need resolution before merge.
4. **TS-03 / Reliability — settings contract.** Decide each accepted key: wire and prove effect, or reject/deprecate/unambiguously label inactive. Cross-surface schema/defaults/secret handling/restart semantics; strict no ambient vault configuration authority. Operator selections, not schema presence, control enabling.
5. **TS-04 / Stability — effects reconciliation, default disabled.** Rebase/reconcile e4f00b3 logic onto TS-01/02 candidate; execute ownership/path/crash/revocation/rollback matrix and retain cooperative-vault/durability limits. Authority, write scope and required OS durability are decision blockers, not implementation assumptions. No MCP write endpoint by inference.
6. **TS-05 / Reliability — proposal/identity integration matrix.** Separate abstract fixture operations from real API/storage surfaces, close durable proposal validation/idempotency/receipt/apply contracts, qualified identity lifecycle and revocation behavior. Owner-admin, mapping adapters and secrets stay within ratified boundaries. A proposal-only AI suggestion never grants permission.
7. **TS-06 / Fidelity — graph/provider/evaluation qualification.** Version canonical graph+Graphiti+temporal/citation fixtures; qualify adapter failure behavior and policy noninterference before performance tuning. Restore independent benchmark access and distinguish self-tests from independent evidence.
8. **RUST-PREP / parallel, non-authoritative.** Reuse actual Lite retrieval/evaluation/watcher work as candidate modules, generate a Full-owned exact feature/parity matrix and differential harness. Rust ownership consolidation follows stable TS contracts; engine cutover waits for all required TS packets, approved benchmark/compatibility gates, end-to-end parity and rollback evidence.

Merge blockers now: two observed TS defects, current red CI, unqualified integration against current main, all open PRs draft, unknown protection/approval requirements, Lite product pin/UI mismatch, benchmark access, and unratified write/identity/provider authority decisions. No merge, approval, deployment, cutover or completion is recommended by this audit alone. Root should replace/reassign a packet after two failed implementation attempts, retaining commands/results and adversarial fixtures; environmental audit retries above are separately labelled and never erased.
