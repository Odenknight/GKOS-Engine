# Observatory and Engine handoff — 2026-10-09

## Current goal
Complete the GKOS Observatory and GKOS-Engine against the supplied reviewer testbed documents, orchestrating Sol 6.1 subagents; implement easy admin-created guest bearer-token connections with broad MCP version compatibility; independently review and correct, validate end-to-end, and push separated changes to the appropriate repositories.

## User direction and operating state
The user stopped all automated checks on 2026-10-09 and requested repository reconciliation and this handoff. The finish-observatory-soak-review automation was deleted. Do not restart automatic polling, CI retries, timed campaigns, or agents after handoff without a new instruction. No merge or deployment is authorized. Final qualification belongs to the user after peer assessment. The goal is blocked, not complete.

## Executive state
Implementation and the reviewed publication are pushed to separate draft PRs. Administrators can create guest bearer-token connections with copyable configuration. Bounded tests cover five MCP revisions and legacy SSE; this does not prove every external client works. Runtime corrections cover proposal/target binding, challenge holds, capacity/idempotency behavior, transport/session lifecycle, and replay integrity. The remaining C4 independent human resolution path is intentionally fail-closed pending policy.

Observatory: https://github.com/Odenknight/GKOS-Observatory/pull/33
Audited implementation/publication source: 800de472ad215c7e4f0d0c2ee86c98945451540d. The later handoff-only commit, if present, is not separately runtime-qualified. Reviewed publication: 4,947 effective Git files; provenance, 382 relative links, bounded privacy screen and scoped package guard checked. Guard receipt SHA256 556b1a21f1afb4fe24048f3f5cda3fc5c3ebde0c861a336d1380a575bd199c10.

Engine: https://github.com/Odenknight/GKOS-Engine/pull/97
Audited implementation source: cd340b4f8955d1e7c0c83aaea17f8d6a38ac5954. Current Observatory pin adopts 190 Engine files. Historical c611 timed-run bytes remain unchanged. Engine hosted results: 61 successful jobs and two conditional manual skips across 63 jobs; 12 runtime lanes, original artifacts/logs and source bindings independently audited. Release qualification is not claimed.

## Current validation and its limits
Observatory 800 hosted results: 16 successful jobs, one cancelled, three skipped across four workflows. Both native workflows and ordinary push succeeded. Ordinary PR run 37967744278 Ubuntu/Node22 job 113946260230 exceeded its unchanged 15-minute limit while downloading browser dependencies. Its package-comparison job was skipped. The current PR matrix is incomplete; do not call it a full PASS. No retry or timeout change was made. Root checked 297 captured originals, 22 exact-ID artifact ZIP digests/CRCs/extracted payloads, eight native reports each with 112 contracts and eight controls plus browser stages, seven ordinary 257-test suites, and seven equal 66-file release maps. Actual PR execution 5c6b938e2c29c6b67e2890de06b8ef473257290e and pushed 800 have equal tree eb184756cf7b6db3f03ce81fed322940ed1f45b9.

The N19 test-only expansion covers 15 malformed families through real HTTP/MCP routes against absent/existing targets: 60 refusal cases and 30 positive controls. Root complete touched V2 suite: 28 PASS, zero failures/skips. Historical c1f60fe hosted matrix was complete (18 success/two auxiliary skips); do not transfer that source-bound result to later source.

Original ee8 campaign: fresh 30-minute run passed its original 45 assertions. User intentionally stopped the planned 12-hour run after nine hours (32,400,380 ms). Original report remains RUNNING/incomplete and supervisor FAILED from intentional SIGTERM. Last report: 42,129/42,129 requests, 539 effects, 48 denials; separate private post-stop SQLite snapshot: 540 operations. Eight packets sealed and independently replayed; ninth unsealed. Both external monitors ended with 4,321 samples, disclosed startup gaps and post-stop read failures. No long-phase 45-assertion PASS, final sealing, or corrected-source timed qualification exists.

## What is needed to finish
1. Obtain the user's C4 policy: who may independently adjudicate a reviewer-origin challenge, how distinct human identity is established, and who independently reviews the resulting correction. Operator credentials alone are not proof of a distinct human. Then implement that authorized path and verify conflict-of-interest, authority, correction and replay invariants. Existing guards must stay fail-closed until then.
2. Obtain direction on the incomplete current CI matrix. Preserve the cancelled run. Any retry or CI provisioning change must follow the user's next instruction; do not increase limits or silently substitute a narrower suite. Audit actual original results and source identity for any successor.
3. Reconcile any new JEFFREY/Fable findings against current source. Both original reviews were received, corrections were dispositioned, and terminal progress was delivered to both. No new completed review of 800 was verified as of handoff.
4. Complete the requirement-by-requirement audit against supplied plans/testbed documents. Full normative profile, external assessment, human studies, manual accessibility/adviser acceptance and later second-implementation claims remain unevaluated or separately scoped; green technical tests do not prove them. Do not invent policy or human results.
5. Let the user determine final qualification. No new long campaign, merge, deployment or production corpus change is implied by this handoff.

## Resume locations and evidence
Primary shared root: R:/_Agents; fallback \\192.168.5.18\shared\Oden\_Agents. O is a read-only mirror only when primary is unreachable.
Assigned identity: Astra-Oden.
Authoritative task: R:/_Agents/Astra-Oden/projects/gkos-ecosystem/tasks/2026-10-07-observatory-v2-qualification-r720.md
Observatory integration: C:/Users/FAC/.codex/worktrees/observatory-completion-20261006/GKOS-Observatory
Active metadata: integration/.local/qualification/active-v2-run.json
Final hosted originals: integration/.local/qualification/observatory-hosted-800de47
Capture receipt SHA256: 4ed21fed2f74e01428af00d5a3c447dc7ffc195dc2aed729abf7e60abccf3be1
Capture index SHA256: 45b37bbfa2d77634e9dc230994fe782ac1cf000bd2c85c405f35e4a78df1a6fd
Engine checkout: C:/Users/FAC/.codex/worktrees/engine-init-disconnect-20261009
Engine current original evidence: integration/.local/qualification/engine-hosted-cd340b4
Shared peer delivery receipts: Astra-Oden/projects/gkos-ecosystem/tasks/evidence/2026-10-08-nine-hour-review/terminal-800de47-progress-{identity}.json
JEFFREY review: JEFFREY/projects/gkos-observatory/reviews/20261008-70066ac/REVIEW.md
Fable reviews: Fable-FAC/projects/gkos-observatory-demo/reports/NINE-HOUR-REVIEW-20261008.md and REVIEW-PR33-E96-20261007.md

## Preservation and publication boundary
Repository publication contains selected safe evidence and code/docs. Private keys, bearer credentials, private SQLite snapshots, operator payloads and local raw evidence are not blanket-published. Private campaign state remains on Linux. Preserve all failed, cancelled, partial and unavailable observations. Do not recreate missing historical files or infer their cause. No cache cleanup, WSL restart, global policy changes or credential rotation is part of this handoff.
