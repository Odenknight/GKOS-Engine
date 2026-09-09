# GKOS functional uplift handoff

Status date: 2026-08-25. This file is external to both repositories so it does not alter a protected phase inventory.

## Executive status

Phase 5 is implementation-complete and publication-qualified on the existing draft branches. Full and Lite are pushed, signed with ED25519, DCO-compliant, clean, and hosted-green. No merge, tag, release, deployment, service activation, or package/artifact publication was performed or authorized.

Phase 6 has not started. It is blocked by an intentional authority gate: the exact 2026-08-20 Functional Uplift instruction packet is not committed and SHA-256 pinned. Do not write Phase 6 bytes until that exact packet is exported and governed, or the owner explicitly re-ratifies the exact phase table and constraints.

## Overall goal

Complete the provider-neutral GKOS-Engine and GKOS-Engine-Lite uplift without creating a second GKX authority, weakening governance, or publishing unsupported claims. Full owns contracts and deterministic semantics. Lite consumes exact Full pins and proves Rust/wrapper conformance. Every phase requires reciprocal adversarial review, signed+DCO coordinates, clean trees, hosted qualification, exact artifact inspection, and phase-local evidence before advancement.

## Terminal Phase 5 coordinates

### Full

- Repository: `[LOCAL_PATH]
- Branch / draft PR: `codex/phase-5-watcher-recovery` / `https://github.com/Odenknight/GKOS-Engine/pull/30`
- Final head: `7b5262baee9fcda23d50b0cee0c4977d6e4305e7`
- Remote/local relation: exact match; worktree clean.
- Hosted push run: `32803396417`, terminal `SUCCESS`.
- Hosted PR run: `32803399153`, terminal `SUCCESS`.
- Both runs passed every build, Linux watcher, Windows watcher, Windows path-security Node 22/23/24 lane, and terminal artifact audit.
- Phase 5 pack: 18 files, 17 governed leaves, 8,907,164 governed bytes, `sha256:a8e0eed2a829db8c80cede489c871f938e432a09e6f1c34aa0940fcfe381519f`.
- Package audit: 382 files, 3,004,599 bytes.

Definitive push-run artifacts were downloaded to `[LOCAL_PATH] The repository-private auditor proved the exact all-and-only six-artifact inventory:

| Platform / Node | Bytes | Raw SHA-256 | Result |
| --- | ---: | --- | --- |
| Linux 22 | 3,000 | `549942d8c12f20a1390169eff157fdbecb3b6a8329297a5e95ffe40612034fab` | qualified; p95 888,760 µs; max 889,335 µs; all equal |
| Linux 23 | 1,359 | `0481f4c33fde8c1593e989b52acc06335dd07033afa158ee33bf30d1d8af32d0` | governed unavailable; runtime has no physical FTS5 |
| Linux 24 | 3,010 | `c4d4e2cdea77127b7cf561302d3d087717c663fdd9c103bc63e201cb98c65a48` | qualified; p95 1,132,199 µs; max 1,186,347 µs; all equal |
| Windows 22 | 3,028 | `c6b7ecfde4ab27b844a0581cb6c11dd6c04d95d252ce508d1a8c7602c8c5e8d0` | qualified; p95 1,716,235 µs; max 1,757,692 µs; all equal |
| Windows 23 | 1,363 | `84483c4f697077eeef7abe9f4c049e9127793038155de8bdfaa7918c8fa58776` | governed unavailable; runtime has no physical FTS5 |
| Windows 24 | 3,031 | `00dd63320e417d898bcdc0ac9800a34250ab3cec040813c70c1fc6a922bb04ec` | qualified; p95 1,653,135 µs; max 1,688,554 µs; all equal |

### Lite

- Repository: `[LOCAL_PATH]
- Branch / draft PR: `codex/phase-5-watcher-recovery` / `https://github.com/Odenknight/GKOS-Engine-Lite/pull/20`
- Qualified implementation commit: `6d94e40dc11e1bb43693b225e32ec6110d4e03b1`.
- Implementation hosted run: `32807434279`, terminal `SUCCESS`, all 8 jobs green, exact-zero artifacts.
- Evidence closure commit: `a39f14d1394e3dd8f8dada8bec77bd995b1a0bc4`, signed+DCO and pushed.
- Evidence closure hosted run: `32808011926`, exact head `a39f14d1394e3dd8f8dada8bec77bd995b1a0bc4`, terminal `SUCCESS`, all 8 jobs green, exact-zero artifacts.
- Pack verification: all 18 Full files byte-identical; zero pin mismatches.
- Private verifier: 9/9. Rust latest and MSRV: 175 library plus 11 conformance tests each. Semantic: 401. Schema: 99. Node: 43/43. Package: 5 files / 9,821 packed bytes.
- The separately qualified Phase 4 ordinary runtime dependency remains `a57b98c00c1913f5b7ed96839b3f8effe5be9c4a`; the private Phase 5 pin does not silently replace it.

## Full assessment: what happened

Phase 5 was not a single watcher bug. It was a chain of filesystem-authority, platform, lifecycle, qualification, and CI-evidence failures. Each failure was narrowed into a regression test and a smaller security boundary.

1. The original POSIX directory seal treated authorized child creation as tampering, a clean-checkout fixture attempted an empty commit, and governed ingest files lacked explicit LF attributes. The correction introduced WeakMap-backed capabilities, retained-sibling raw hashes, held descriptors, mutation seams, clean-checkout handling, LF rules, and ratified 1 GiB leaf / 4 GiB aggregate streaming caps.
2. Review exposed target-replacement windows, missing restats, incomplete `lstat`/`fstat` coordinates, post-`rmdir` link-count behavior, inadequate caps, and missing adversarial cases. These were fixed before further publication attempts.
3. Windows 8.3 names were safely canonicalized but then compared against the raw spelling. Comparisons were moved to canonical coordinates.
4. Node 24.19/libuv could abort on native recursive Windows `fs.watch`. Windows moved to one bounded scheduler: at most 2,000 admitted leaves, 256 leaves per 250 ms, one timer, and overflow handled by the governed 60-second secure scan. Linux/macOS native behavior stayed unchanged.
5. Windows numeric `Stats` lost exact large coordinates. The secure watcher path gained a module-local, non-enumerable BigInt sidecar for `dev`, `ino`, `mode`, `nlink`, `size`, `mtimeNs`, `ctimeNs`, and `birthtimeNs` without changing frozen ordinary Phase 3 bytes.
6. Qualification itself reopened the pointer every 5 ms and starved polling/reconciliation. An in-memory event epoch now acts only as a wake hint; every wake still performs an authoritative secure reopen and digest change check under the original deadline.
7. Hosted Linux then found watcher reopen after shutdown and namespace changes invalidating seals. Per-file transition proofs, journal namespace lifecycle handling, host/desktop/CLI integration, staged Phase 3 capability rebind, monotonic retry deadlines, lifecycle guards, and explicit database close were added.
8. Sol review found status symlink/replacement exposure, callback authorization gaps, incomplete close behavior, incorrect caps, Windows zero-device handling, and wall-clock retry use. All blocker/HIGH/MEDIUM issues were corrected.
9. Raw full-file hashing on every operation made Windows too slow. A metadata-keyed cache was considered and rejected as insecure. The owner approved a narrow capability-bound batched filesystem publication authority: a WeakMap token binds the exact affected set and sequence, every entry is hashed, crash prefixes remain authorized, two terminal full rehashes are mandatory, and the journal is unchanged.
10. A later HIGH review found missing owner/0600 requirements and metadata preservation. The implementation now enforces current ownership and mode, exact invariant preservation, ordinary read/cleanup, and explicit chmod/chown test seams.
11. Windows reuses `(dev, ino)` for distinct one-link files, producing false alias detection. One secure source snapshot plus comparison of every stat coordinate replaced the insufficient identity shortcut; real hardlinks and added aliases remain rejected.
12. Hosted qualification needed three corrections: adversarial create tests now prove chmod/chown really occurred and preserve the primary error; Node 23 without physical FTS5 is capability-gated only in qualification while production `sqlite_fts5` remains exact; ExperimentalWarning acceptance is anchored and narrow.
13. PR artifact auditing initially compared GitHub's synthetic merge SHA against the branch head. It now records and checks the event-aware platform payload head while preserving run, event, repository, path, artifact ID, and source-head bindings.
14. Protected Phase 4 tests incorrectly counted every 40-hex string globally, and the Phase 5 immutability inventory omitted one intended test row. The hash check was scoped to the exact Phase 4 job and the inventory was extended by exactly the reviewed Phase 5 row.
15. Lite initially projected incomplete owner semantics and did not fully bind retry/reset state. It was corrected to the truthful compact frozen fixture schema: exact keys/profile/chunking/journal/count/digests, retry/reset state equality, reset ordinal-5 prepared plus target-complete, and fully resealed cascade negatives. Sol then found `engine_version` accepted any nonempty string; it now requires exact `2.1.2` and has an isolated fully resealed attacker-version negative.

The final local Windows 22-edit measurement was p50 1.296 seconds, p95 1.503 seconds, max 1.562 seconds. Additional stress passed 78/78, and the runnable broad hosted-equivalent local set passed 197/197. Full final local exact tests passed 216/216 and targeted tests 38/38. These local results support, but do not replace, the terminal hosted evidence listed above.

## Evidence reconstruction map

- Frozen Full semantics and inventory: Full `contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1/README.md` and `pack-manifest.json` at `7b5262baee9fcda23d50b0cee0c4977d6e4305e7`.
- Full private host behavior: Full `docs/phase5-watcher-host.md` plus the Phase 5 test/qualification files reachable from commits `a49a01a`, `55f3165`, `a9566c4`, `269ea60`, `f93cba1`, and `7b5262b`.
- Full hosted proof: GitHub Actions runs `32803396417` and `32803399153`; definitive downloaded artifact set `hosted-artifacts-32803396417` beside this file.
- Lite pin/conformance proof: Lite implementation `6d94e40dc11e1bb43693b225e32ec6110d4e03b1` and `docs/evidence/phase-5-watcher-recovery-slice-a.md` at evidence head `a39f14d1394e3dd8f8dada8bec77bd995b1a0bc4`.
- Lite hosted proof: runs `32807434279` and `32808011926` and their exact-zero artifact API inventories.

## Completion estimate

The independent reviewer rejected the earlier 35–65 day estimate as too optimistic. The defensible estimate, after the authority gate is closed, is:

- Phases 6–11 through terminal draft-PR evidence: 75–120 engineering days.
- One strong senior engineer: approximately 18–30 calendar weeks including reciprocal reviews and hosted reruns.
- A senior/junior pair, with the senior continuously owning authority and security decisions: approximately 14–22 calendar weeks.
- Add roughly 2–6 weeks for authority/owner/CI queues. A junior working alone has no credible safe bounded estimate.
- “Complete” here means both draft PRs have terminal evidence and are ready for owner-controlled integration. Merge, release, deployment, and package publication are separate, excluded actions requiring explicit authorization.

## Required next action

Do not begin Phase 6 implementation. First export and hash the exact 2026-08-20 authority packet into a governed artifact, or obtain explicit owner re-ratification of the exact Phase 6–11 table and constraints. Then follow the separate junior implementation guide. Preserve both draft PRs and do not merge them without separate authorization.

## Safety boundary

Never resolve a protected-gate mismatch by broadening an allowlist, weakening an identity check, hiding an unavailable capability, or removing a negative test. Diagnose the first failing invariant, make the narrowest authorized correction, obtain reciprocal review, and rerun the affected local and hosted matrices. Security-boundary changes require direct owner authorization.
