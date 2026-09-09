# PR #40 merge-readiness review

Reviewed 2026-09-05 UTC. Priority: stability, reliability, fidelity.

**Final disposition: MERGED after correction and fresh qualification.** Source review identified a startup recovery defect that the original passing tests did not cover. The correction was reviewed, published, qualified at a new exact head, and merged only after the blocking hosted lanes passed.

## Candidate and scope

- Repository: `Odenknight/GKOS-Engine`, [PR #40](https://github.com/Odenknight/GKOS-Engine/pull/40).
- Exact pushed and local starting head: `c6c7cf828246c1a010fc3238a6ec803b42fdc068`.
- Base: `18c53b8d553d75f03c52310f06e3c60f20f6068b`.
- Candidate worktree: `.work/effects-reconcile` (clean before review).
- User selected a merge-readiness deliverable. No merge, push, release, or activation is part of this review.

## Verified original-head results

Three Sol subagents performed hosted auditing, source review, and functional verification, reporting to the orchestrator. The orchestrator independently checked the branch/PR head, check-run exceptions, source defect, and assembled this report.

Windows, Node `v24.18.0`, npm `10.9.4`: typecheck and build passed; the existing 11-file Navigation/Effects/public API suite passed **128/128**, with no failures, cancellations, skips, or todos. The test wrapper's sandboxed pretest build encountered an esbuild filesystem traversal restriction; a successful separately approved build followed by the exact underlying test command produced the passing result.

All four hosted push/PR workflows report success and bind to the exact candidate. Blocking current-runtime Ubuntu/Windows Node 22 and 24 jobs passed. Node 23 current-runtime jobs failed on both platforms in both events and are explicitly informative under the existing workflow policy. Historical replay passed all nine OS/Node combinations per event. See [hosted-audit.md](hosted-audit.md) for run links, counts, and limitations.

Artifact metadata was inspected, but anonymous access did not permit artifact-content or job-log verification. Node 23 failure causes remain undiagnosed. PR #40 remains open/draft with no submitted reviews; GitHub reports `mergeable=true`, `mergeable_state=unstable`. Branch-protection requirements could not be inspected.

## Recovery blocker

At the reviewed head, `recoverStartupSerial()` calls `validateCommittedOperation()` for every historical committed effect. That validator compares the live target digest with the historical effect's proposed digest. A later legitimate write or rollback changes the live target, causing startup to reject the predecessor as `COMMITTED_TARGET_CORRUPT` and latch writes.

Required correction: validate all historical receipt/archive evidence, but assess live bytes against the applicable latest target state and properly recover interrupted successors. Keep latest-target tampering, corrupt historical evidence, and unresolved recovery fail-closed.

## Completed local correction

Sol reproduced the original-head failure with a new two-successive-writes/restart regression: startup threw `COMMITTED_TARGET_CORRUPT` for the valid predecessor. The uncommitted correction validates historical receipts/archives independently of live bytes, selects the latest committed target by journal sequence, and delegates a later interrupted operation to recovery. Aborted/stale successors cannot suppress committed-head corruption checks. Replaying a superseded effect also validates the newest committed head.

New coverage exercises successive writes and restart, historical replay with live-target tampering, an interrupted successor after replacement, stale/aborted successor masking, and rollback followed by restart. The second Sol agent independently reviewed the final diff and found no remaining actionable issue. The orchestrator reviewed the source changes and inventory diff and verified the exported patch against the working tree.

Final local checks on the modified worktree:

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| Existing 11-file `test:navigation` command, run directly after build | **133/133 PASS**, zero failures/cancellations/skips/todos |
| `npm run qualify:current -- --check` | PASS; changed source/test hashes refreshed |
| `git diff --check` | PASS |
| Exported patch reverse-application check | PASS; patch matches current changes |

Deliverables: [recovery-correction.patch](recovery-correction.patch) and [local-inventory-receipt.json](local-inventory-receipt.json). The patch contains exactly three paths: executor, regression tests, and qualification inventory. It is already applied in `.work/effects-reconcile`; do not apply it there again. The receipt records the uncommitted working-tree bytes; its `head` field remains the original commit and does not imply that GitHub tested the correction. Source snapshot SHA-256: `febd5041efa98c5600c7b8076258c133c5e7726e4cf64c9a1278cf3152fe1d60`.

No commit, push, PR update, or merge was performed. No agent required replacement; the finding was reproduced and the correction passed independent review.

## Remaining merge gates

1. Run full current-runtime qualification and package checks on the correction; the completed local checks above are focused verification, not a full-suite claim.
2. Publish an approved corrected commit and require fresh hosted blocking Ubuntu/Windows Node 22/24 qualification at that exact new head. The original-head green runs do not qualify modified code. Update the PR evidence to bind the new head and preserve the original failure history.
3. Resolve the draft/review decision and inspect applicable GitHub protection requirements before any authorized merge. Node 23 failure internals and inaccessible artifact contents remain explicitly unverified.

Effects remain experimental and default-disabled. Structural grants do not supply live authority; this review grants no writer, owner-data, release, deployment, or Standard-conformance authority.

## GitHub completion

- corrected final PR head: `d19ccfee1d971f1e282f886562a3809924a8a8a2`
- fresh push and PR CI workflows: PASS
- fresh push and PR runtime workflows: PASS overall
- blocking current-runtime Ubuntu/Windows Node 22 and 24: PASS in both events
- informative current-runtime Node 23: failure on Ubuntu and Windows in both events
- PR #40 merged at `2026-09-05T03:10:01Z`
- merge commit and verified `main` head: `6abfc5f4cc4953cf2f0ea51ba1cd1bb81f0c51a1`
- source branch preserved
