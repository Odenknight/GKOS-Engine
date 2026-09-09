# Independent Q-GUARD implementation review — 2026-08-31

Current disposition after the verified follow-up below: **QG-01 and QG-02 are corrected**. Final manifest-bound full qualification remains for root after Engine rework finishes. The initial review disposition was **rework required for two bounded receipt-integrity defects**; that review and its counterexamples are preserved below. No Engine code, manifest, workflow or runtime was edited by this reviewer.

Reviewed root-authored `scripts/runtime-qualification.mjs`, `scripts/run-current-tests.mjs`, `test/runtime-qualification.test.mjs`, `docs/CURRENT-RUNTIME-QUALIFICATION.md`, the whitespace-insensitive `.github/workflows/ci.yml`/`package.json` diffs, generated `contracts/runtime-qualification/v1/change-inventory.json`, and its external preparation script. Also inspected the unchanged historical test/workflow and `.gitattributes` relevant to exact bytes. Transient inventory/hash changes during Engine rework and root LF normalization were not classified as design defects.

Review coordinates: runtime script SHA256 `9cee7917b2af023601de004e0e4c4d2bb1f3204c2bf03d5da62d2c798183a13f`; test selector `0232a38dfcb04e10e9201abbc09b01439d681d82d1280c9704cb1e2220f6b77c`; focused tests `7983a76901f39bab1f6ffc9aaae5616e65656b472942e72259e10320847ec91d`; workflow `4c88e79d8d37a03356c744c10e173fc40f6aa0480a471748e6762b17dc6aab46`. The changing manifest was observed at `20c9165de3658ba5cb3449a88f4410a816f4b15fcb6fd5f006f86b77df0ed275`; this is an observation, not final acceptance of that inventory.

## QG-01 — P2: preflight failure leaves stale receipt in reused output

At runtime script lines 80–84, `checkInventory`/`sourceSnapshot` and the exact historical-clean check run before receipt initialization and the `try` block. An invalid/missing manifest, missing Git object, unrelated checkout or dirty historical input throws before any FAIL receipt is written. Because `mkdirSync(..., {recursive:true})` accepts an existing directory and receipt names are fixed, an old `current-runtime.json` or historical receipt can remain present with PASS after a new failed attempt. The process correctly fails, but an artifact reader sees stale apparently successful evidence rather than the failed attempt. Reusing the same directory can also overwrite old logs on later attempts.

Concrete safe counterexample: the [disposable probe](evidence/q-guard-review-probes.mjs) creates a synthetic PASS sentinel outside a disposable Git checkout, then calls `executeQualification` with that checkout lacking its manifest. [Observed result](evidence/q-guard-review-probes.json): preflight throws ENOENT and `old_receipt_preserved` is true. The sentinel is explicitly synthetic; no false successful qualification result was submitted.

Fix proposal: allocate an exclusive new per-run output directory (or refuse nonempty outputs) and initialize a FAIL receipt before preflight, capturing preflight failures with an explicit stage. Bind a unique run identity and atomically finalize each receipt. Regression tests should seed a prior PASS, trigger missing/invalid manifest and dirty historical failures, and ensure no new attempt can expose that prior PASS as its result. Fresh CI runner-temp directories limit this particular stale-output scenario, but the documented local command permits reuse today.

## QG-02 — P2: source drift comparison omits Git coordinates

`sourceSnapshot` line 37 returns HEAD and tree but computes its `sha256` only over file inventory. The post-command guard at line 99 compares only that digest; current revalidation at line 100 checks AUDITED ancestry but does not require HEAD to equal the initial HEAD. A commit made during a long local test run can change the Git coordinate without changing the compared file inventory. The result can be PASS with the stale initial HEAD in its receipt. Historical mode also fails to repeat its exact-HEAD/clean check after commands finish.

Concrete counterexample in the same [probe result](evidence/q-guard-review-probes.json): an empty commit in a disposable repository changes HEAD from `793c2826109e0faae2ff4dd2e323553d864e39d0` to `f7fc9de602b9d47e8b131800970a0dc1e6c90290`, while `snapshot_digests_equal` is true. This tests the exact digest comparison used by qualification; it does not run or change the Engine candidate. A staged/new commit preserving the already-read working bytes presents the same issue.

Fix proposal: bind and compare `{head, tree, files}` as one snapshot or compare all three explicitly. Repeat the historical exact commit and clean-worktree guard after execution. Add a controlled empty-commit/source-coordinate mutation test proving the attempt refuses while unchanged bytes and coordinates still pass.

## Passed review checks

- `node --test test/runtime-qualification.test.mjs` ran on Windows x64 / Node24.18.0: **4 tests passed, 0 failed/skipped/cancelled/todo** (about 10.1 seconds). The tests exercise actual inventory binding, added/edited source refusal, frozen-file/omitted-inventory refusal and count parser failures.
- The runtime fixes historical replay at `97ae3560a4fa2e771b60fa63d6dc0349d0b4c864`, separate from audited `8207958047b3361ae21ac07c5a2abbd26a42a684`. It does not rebind the original protected assertion to current HEAD.
- The complete frozen pack, generator, 35-test file and eleven-job workflow are checked against the fixed historical Git blob bytes and an exact expected path list. The current lane does not regenerate them. The original eleven-job workflow is preserved; the new matrix is supplemental historical replay evidence, not a claim that all original jobs ran.
- Current test selection excludes only `agent-identity-mcp-contract.test.mjs`; the repository's current `.test.mjs` files are top-level and are included otherwise. The new command actually builds and invokes the Node test runner. Exit failures, parser failures, cancellations and TODOs cannot produce PASS, and skipped tests yield `INCOMPLETE_PLATFORM_COVERAGE` with CLI exit1.
- `.github/workflows/ci.yml` retains previous non-test checks and retrieval/watcher/downstream lanes. The new historical matrix is an explicit prerequisite; artifacts are uploaded on failure. No skipped/platform result is converted into an invented alternate-capability PASS.
- Counts require one coherent nonempty summary. The manifest excludes itself from its own candidate-change list but is included in the source snapshot; the external root review must still bind the final manifest and driver bytes, as the documentation explicitly states.

## Capability and evidence limits

I did not rerun the entire current suite or historical 35-test suite, install dependencies, run hosted jobs, or claim Linux/macOS/Node22/23 capability. Root's reported historical 35/35 result is root evidence, not my independent rerun. The two synthetic probe commits exist only in disposable review fixtures, with no Engine Git mutations; local global signing was unavailable, so the synthetic fixture commits explicitly disabled signing and claim no authority.

The selector is top-level like the old npm test glob; a future nested suite would need explicit discovery. The source snapshot records tracked/unignored source and the dependency lock, not a complete attestation of installed `node_modules`, native tools, ambient environment or ignored build outputs. Historical receipts identify the historical source but execute the candidate's driver; final external acceptance should bind the candidate driver hash alongside those receipts. These are qualification limits, not proof of release or platform completeness. Root must rerun after corrections and final candidate/inventory sealing.

## Verified follow-up — 2026-08-31 21:11 UTC

Reviewed corrected runtime script SHA256 `ce02c3ab309ae4e1c4d48b27451c9b90e4b06f202096087b7c670b7a7f119b97` and focused-test SHA256 `7e0b5f32870babe9caf441c8fd77c6643693f41e1556fb2d6bf30b18189c6245`.

- **QG-01 corrected for the reproduced failure path.** Receipt initialization now precedes source/inventory and historical-clean preflight inside the guarded execution block. A caught preflight failure produces FAIL with no executed commands. Finalization writes an exclusively created temporary file and atomically renames it over the lane receipt. The unchanged independent probe, rerun against the corrected module, now records `old_receipt_preserved: false`; direct inspection confirms the replacement has `status: FAIL`, its attempted source coordinate and ENOENT failure, and `commands: []`.
- **QG-02 corrected.** The snapshot digest now hashes the entire `{head, tree, files}` object. The unchanged independent empty-commit probe now records `heads_differ: true` and `snapshot_digests_equal: false`. Post-run historical verification additionally repeats the exact fixed-HEAD and clean-worktree requirements.
- Independent focused execution: `node --test --test-name-pattern='preflight rejection|source identity changes' test/runtime-qualification.test.mjs` passed **2/2**, exit0, zero failures/cancellations/skips/todos on Windows x64 / Node24.18.0. This selected only the two new regression tests; it is **not** represented as execution of all six tests or final current-runtime qualification.
- [Follow-up probe output](evidence/q-guard-review-probes-followup.json) is separate from the original failing [probe output](evidence/q-guard-review-probes.json), preserving red/green evidence. Its disposable fixture retains the actual generated FAIL receipt under `receipts/current-runtime.json`.

No remaining blocker was found in these two corrections. I deliberately did not rerun final inventory-sensitive qualification while root/Engine work can change hashes. Output directories should still be per-run and not concurrently shared: atomic final receipt replacement is not an immutable multi-run log store or a crash/recovery qualification claim. All original broader capability limits remain unchanged.

## Final sealed Q-GUARD verification

Root declared the Engine inventory sealed, after which the reviewer independently executed the two requested read-only checks against the candidate:

- `node scripts/runtime-qualification.mjs --check`: **exit0**. It returned version `gkos-current-runtime-qualification/1`, historical `97ae3560a4fa2e771b60fa63d6dc0349d0b4c864`, audited/HEAD `8207958047b3361ae21ac07c5a2abbd26a42a684`, tree `4be9d9fe494523e9eac876b29c9f56944c692061`, manifest SHA256 `3bf418fb19012df96aebd0844eba9b3612214cfd6707c786b2a3ebef1102b940`, and full source snapshot SHA256 `aa6212f91df4d178a49c6682bb9498a737219b0fdebe4624f84df8be8dfc7b5c`. The exact frozen and candidate inventories passed validation.
- `node --test test/runtime-qualification.test.mjs`: **exit0; 6 tests passed; 0 failed, cancelled, skipped or todo**, duration 11.61 seconds on Windows x64 / Node24.18.0.

Sealed reviewed hashes:

- runtime qualification: `ce02c3ab309ae4e1c4d48b27451c9b90e4b06f202096087b7c670b7a7f119b97`
- runtime qualification tests: `7e0b5f32870babe9caf441c8fd77c6643693f41e1556fb2d6bf30b18189c6245`
- current-test selector: `0232a38dfcb04e10e9201abbc09b01439d681d82d1280c9704cb1e2220f6b77c`
- CI workflow: `e46f55840da78a1631581d77ab7bf506b2c7001fa049503990c3b9673c3fbcbd`
- change inventory: `3bf418fb19012df96aebd0844eba9b3612214cfd6707c786b2a3ebef1102b940`

Final Q-GUARD disposition: **PASS for the sealed inventory check and six focused integrity tests**, with the capability and release limitations above unchanged. This review did not duplicate root's still-running full current-runtime qualification and does not predict or replace its result.

## Final workflow-reseal review

This section **supersedes the earlier manifest, workflow and source-snapshot hashes** recorded above. The historical findings and correction evidence remain valid; the candidate was resealed after restoring legacy CI and moving qualification into its own workflow.

Independent results:

- Legacy `.github/workflows/ci.yml` is byte-identical to HEAD `8207958047b3361ae21ac07c5a2abbd26a42a684`: expected and working Git blob are both `21628eeb780a0103c6c0d8d8e83206991dcd0837`, and `git diff --exit-code -- .github/workflows/ci.yml` returned 0. Its working-file SHA256 is `de781ef5ea035e1abbeb7624743e0892a32f2fbc291ef3c03dbd5e4e126ecd8b`.
- Separate `.github/workflows/runtime-qualification.yml` SHA256 is `abb770b174118a299689b156e6b025c9f30906e516ae6a5d5f41a7ad07ebe01b`. It performs exact historical checkout/replay at `97ae3560a4fa2e771b60fa63d6dc0349d0b4c864` over Ubuntu24.04, Windows latest and macOS14 with Node22/23/24. Historical dependencies install from that checkout's lock with scripts disabled, and evidence uploads even after failure. Only after every historical matrix job succeeds does current qualification run on Ubuntu24.04 with Node22/23/24, lockfile install with scripts disabled, actual build/current tests and per-Node evidence upload. It contains no release, deployment, tag, publication or conformance-claim operation. The current workflow does **not** claim Windows/macOS current-runtime qualification; those OS lanes are historical replay only.
- Resealed inventory `--check`: exit0. Manifest SHA256 `c29e539cc685c3260252e42f2f52c53e721071e110c9c302f14c25f72744fdbb`; source snapshot SHA256 `3c67799b6645ab126c1f8fc55393ced86284de31f73de0592715c525ee6b552d`; source file count 505; HEAD `8207958047b3361ae21ac07c5a2abbd26a42a684`; tree `4be9d9fe494523e9eac876b29c9f56944c692061`.
- All six `test/runtime-qualification.test.mjs` integrity tests: exit0, pass6, fail0, cancelled0, skipped0, todo0; 11.25 seconds on Windows x64 / Node24.18.0.

Final reviewed SHA256 values:

- legacy CI: `de781ef5ea035e1abbeb7624743e0892a32f2fbc291ef3c03dbd5e4e126ecd8b`
- separate runtime workflow: `abb770b174118a299689b156e6b025c9f30906e516ae6a5d5f41a7ad07ebe01b`
- change inventory: `c29e539cc685c3260252e42f2f52c53e721071e110c9c302f14c25f72744fdbb`
- runtime qualification source: `ce02c3ab309ae4e1c4d48b27451c9b90e4b06f202096087b7c670b7a7f119b97`
- runtime qualification tests: `7e0b5f32870babe9caf441c8fd77c6643693f41e1556fb2d6bf30b18189c6245`

Final reseal disposition: **PASS with no new defect found**. This is source/workflow and focused-integrity evidence. Hosted matrix jobs and the complete current-runtime qualification must still produce their own genuine receipts; this local review does not relabel them PASS or authorize release.
