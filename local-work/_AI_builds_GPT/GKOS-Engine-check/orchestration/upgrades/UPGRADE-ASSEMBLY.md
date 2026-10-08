# GKOS isolated stability upgrades

Date: 2026-08-31. Orchestrator: Codex root. Implementation: Sol agents. Priority: Stability, Reliability, Fidelity.

## Delivered candidates

These are reviewable local candidates, not commits, merges, releases, deployments, production authority, or a completed R4-1 through R4-10 program. They preserve the dirty top-level checkout and all audited inputs.

| Candidate | Exact base | Upgrade | Standing |
| --- | --- | --- | --- |
| `engine` | `8207958047b3361ae21ac07c5a2abbd26a42a684` | Shared stale-reference validation; snapshot-bound temporal/lineage/audit continuations; separate historical/current-runtime CI evidence | Verified bounded candidate; executed current tests have no failures, while platform/full-oracle gates remain |
| `standard-r18` | `aa9a05315a9a767bd672aa2bb5179c963d9d66ca` | Fail-closed gate inputs; Gregorian time and Unicode/sparse-array canonical refusals; executed catalog-bound predicate twins | Verified bounded TS-S1/predicate candidate; not v0.81 or complete GCP4/5 qualification |
| `kosmos` | `6486035dfc2e42173b1158b8007c9bab35aa7dc9` | Stable renderer agent ID separate from label across live/replay/buffer paths | Verified synthetic/browser candidate; no authority change |
| `observatory` | reconstructed source content at `8da1d2239a9ce0af5570fe1bfa264934d8aabbe4` | Carries the same renderer fix with honest historical-vendor/local-patch provenance | Verified synthetic browser candidate; no production request-to-render evidence |
| `lite` | `4027bfc4499ad0a2f3e753401f1320468e283823` | REST-only quick-connect commands match the checksum-pinned sidecar | Verified Windows candidate; pin reconciliation and other platforms remain |

Source copies and binary-capable patches are under `deliverables/`. `deliverables/MANIFEST.json` binds 42 files and five patch hashes. `scripts/verify-deliverables.py` reports PASS and rejects missing, modified, symlinked, or unmanifested payload files. Reverse `git apply --check` passed for each exact local candidate. The patches are not auto-applied to another checkout: each target must first match its recorded base/content and receive the repository's normal review.

## Orchestrator verification

- Original Markdown intake: 659 files read and hashed, comprising 528 project documents and 131 third-party/dependency documents. Sol agents screened all 514 audit-repository project documents with exact inventories and deeper reads for controlling/current contracts; root read the 14 orchestration/roadmap/report documents. Deduplicated and screened coverage is explicitly distinguished from line-by-line audit. Final preservation check: 659/659 original Markdown files retain their initial SHA-256.
- Engine historical replay: unchanged fixed-commit test, 35 pass / 0 fail / 0 skip. Its pack, generator, test and eleven-job workflow remain byte-identical across all 37 frozen files.
- Engine T01: root rejected the first 96/97 delivery because it changed successful bytes. The same agent reworked it without editing the golden. Final agent-focused suite: 103/103. The resealed current-runtime run executed 951 tests: 944 pass, 0 fail, 7 platform skips; its honest status is `INCOMPLETE_PLATFORM_COVERAGE`. Request-local indexing reduced the synthetic 8,000-node temporal check from about 685-1,111 ms to 188-214 ms without a cross-request cache.
- Engine current-runtime disposition: the first full run had 942 pass, 2 fail and 7 skips. One failure exposed an orchestrator workflow-placement regression; the legacy workflow was restored byte-for-byte and its 12 focused regressions pass. The other was a contended large-restart timeout; the same test passed alone in 118.9 seconds and passed in the resealed full run. Neither failed receipt was overwritten.
- Q-GUARD: independent review found stale-receipt and metadata-only source-drift counterexamples. Root repaired both; the reviewer reran unchanged probes and confirmed both closed. The final six-test gate suite passes. A superseding review also confirms the legacy CI bytes, the separately versioned historical/current workflow, and inventory manifest `c29e539cc685c3260252e42f2f52c53e721071e110c9c302f14c25f72744fdbb`.
- Standard R18: root independently ran 80/80 tests and strict predicate mutation lint; both pass. The preserved starter runner still honestly exits with two UNEVALUATED fixtures. The candidate makes no v0.81 or conformance claim.
- Kosmos: root ran 283/283 unit tests and the actual Chromium stable-identity test (1/1). The full agent run also covered 20 existing Chromium/mobile tests. The candidate's build required the documented Windows ancestor-directory capability.
- Observatory: root ran 38 pass / 0 fail / one explicit Windows installer skip and the real WebGL renderer against mocked SSE. Two IDs sharing one label produce two renderer identities. This is not live Engine traffic or a physical-GPU qualification.
- Lite: root ran 17/17 desktop tests, 2/2 native tests, typecheck, build and diff checks. The packaged-runtime test uses a synthetic temporary note directory and the checksum-pinned binary; it does not read a user vault.

Counts above overlap focused/full/repeated runs and are not added into fictional aggregate coverage.

## Open gates

- Q-ORACLE remains open: historical `0584a5d`, tag `7bf14b4`, audited main `8207958`, and the eventual accepted corrected candidate are distinct coordinates. No tag was moved and no final TypeScript oracle was selected.
- Q-EFFECTS remains open for production host, ownership, roots, grant issuer and actual durability profile. No source write or live-vault repair occurred.
- Q-PROVIDERS remains open for endpoint/credential policy and the first local model/runtime pack. No live provider or model was used.
- Q-BENCH remains open because no exact archive or access to the independent benchmark was supplied.
- Q-INTENT remains open because r4 names eight invariants while the located proposed checklist has seven.
- Q-LIVE remains open for coherent/canary scope, credentials, staging window, live watch and production request-to-render evidence.
- Hindsight dependency/runtime, Marshal appointment/provider, full Effects/proposals, transport accumulation, release packaging and the rest of R4-1 through R4-10 remain incomplete. R4-11 and R4-12 stay owner-deferred.

No production credential, release tag, remote branch, PR, deployment, model download, vault mutation, source repair, Rust cutover, or TypeScript retirement was performed.

## Next execution order

1. Review and integrate the five exact-base candidates in small repository-owned branches; rerun their hosted/capable lanes at the resulting SHAs.
2. Select Q-ORACLE only after the corrected Engine candidate and current/historical receipts close on required Node/OS lanes.
3. Fix the remaining pre-accumulation SSE/stdio/body bounds and then reconcile Effects into one selected host with writes disabled.
4. Qualify coherent/conflicting client flows and one request-to-render chain before staging.
5. Continue the approved TypeScript R4-1 through R4-10 packets; do not label these bounded upgrades G-TS.
6. Carry the accepted TypeScript oracle into the single Full-owned Rust program only after the applicable gates pass.
