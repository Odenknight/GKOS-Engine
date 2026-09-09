# Engine local integration verification

Date: 2026-08-31  
Scope: authorized local integration verification only  
Disposition: **PASS with incomplete platform coverage**  
Release qualified: **no**

The final integration branch is `codex/integrate-engine-stability-20260831` at commit `1c59a992bafd6815ae9837bb3910084d4aea9972`, tree `54f68ff48294c87ac2d528b3464eede3c96facf6`, with exact parent/base `8207958047b3361ae21ac07c5a2abbd26a42a684`. Its binary diff SHA-256 is `1f06667fea932638b0136e56ecb3a9b546579dece660ef07ffda65a632a64cef`, exactly matching `orchestration/upgrades/deliverables/engine.patch`. The branch is clean and no same-named remote branch exists.

## Defect found and repaired before final qualification

The first fresh inventory preflight against superseded commit `e22281550ccde13bb45e73116743cde1c17f227d` failed with `Unreviewed candidate bytes: test/service-reference-freshness.test.mjs`. The audited candidate held 18,060 raw bytes with 52 CRLF sequences and SHA-256 `32fb64252166c099ba6027c4ca7295b4a80496da6cfdc1b5186a769a603ef761`. The isolated-index sealer deliberately normalized the same content to an 18,008-byte LF Git blob with SHA-256 `f4c45d6c1085acd0bc6743a1161c8b0615c0e74507acf0a01c048fcf3c66484c`, while the generated inventory retained the raw candidate digest.

The bounded correction normalized that test to LF, added a CRLF adversarial check inside the existing six-test integrity gate, and changed the inventory generator to emit UTF-8/LF bytes on every platform. The regenerated manifest is 21,173 bytes, 441 LF, zero CRLF, SHA-256 `55b3cd9a861b99a5be893425cf1914445364dda4942fced1a07863b665476812`. The immediate pre-fix regenerated manifest SHA-256 was `126482cea77691d249e1c848872ca4319851c87f3518b70f196d2de0ac2394e0`.

Focused candidate proof passed inventory preflight and all six integrity tests. Atomic resealing then passed for five repositories and 42 files with zero errors. Only Engine's patch changed; the Standard R18, Kosmos, Observatory, and Lite patch hashes remained unchanged. The new Engine patch SHA-256 is `1f06667fea932638b0136e56ecb3a9b546579dece660ef07ffda65a632a64cef`.

The managed reviewer rejected a destructive `git reset --hard` reconstruction. The superseded history was therefore preserved as branch `codex/integrate-engine-stability-superseded-20260831` and worktree `orchestration/integration/engine-superseded-20260831`. A fresh registered worktree was created at the required integration path from the exact base, the sealed patch was applied, and the final commit was created there. Neither superseded commit nor worktree was deleted.

## Final local results

| Gate | Status | Counts / evidence |
| --- | --- | --- |
| Versioned inventory check | PASS | Manifest `55b3cd9a…`; current source snapshot `034f16d4…`, 505 files |
| Runtime-gate integrity file | PASS | 6 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo |
| Current build | PASS | Exit 0; 3,703 ms; log SHA-256 `5118b345…` |
| Current full tests | Executed cleanly | 951 tests: 944 pass, 0 fail, 0 cancelled, 7 skipped, 0 todo; log SHA-256 `8470722d…` |
| Current qualification disposition | INCOMPLETE_PLATFORM_COVERAGE | The driver correctly exits nonzero when any test is skipped; `release_qualified=false` |
| Historical exact replay | PASS | SHA `97ae3560a4fa2e771b60fa63d6dc0349d0b4c864`; 35 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo; `release_qualified=false` |

The current receipt ran from commit `1c59a992bafd6815ae9837bb3910084d4aea9972`, tree `54f68ff48294c87ac2d528b3464eede3c96facf6`, source snapshot SHA-256 `034f16d47b6187f80daf2dbd96d84981dd95225c6e44b4b091b99c63603438f2`. The exact historical checkout remained clean at commit `97ae3560a4fa2e771b60fa63d6dc0349d0b4c864`, tree `8095b0e164239e20b29707277eab84335605dbf8`, source snapshot SHA-256 `7515a55f7a26b908e78b7ddebd8c0aa9772eba66697f255fe0fac64458ac18e3`.

The seven current skips were the unavailable external provisional Standard SRTP fixture catalog, the actual in-process ONNX model case, four POSIX ownership/path-transition cases on Windows, and the Linux native-watcher shutdown/reopen regression. These are platform or external-capability gaps, not executed-test failures.

The local platform was Node `v24.18.0`, npm `10.9.4`, Windows `10.0.26200.0`, x64, PowerShell `7.6.5`. This run does not qualify Node 22 or 23, Linux, macOS, hosted runners, ONNX, the external Standard fixture catalog, POSIX boundaries, or Linux native watcher behavior.

## Workflow and authority boundaries

Legacy `.github/workflows/ci.yml` is byte-identical to the audited base: 19,638 bytes, SHA-256 `de781ef5ea035e1abbeb7624743e0892a32f2fbc291ef3c03dbd5e4e126ecd8b`. The separate `.github/workflows/runtime-qualification.yml` is 2,512 bytes with SHA-256 `abb770b174118a299689b156e6b025c9f30906e516ae6a5d5f41a7ad07ebe01b`.

Review of `NODE-LINUX-EFFECTS-DECISION-PACKET.md` found no factual or authority-boundary defect. Its standing is preserved: Node.js on Linux is selected as the future host family, Stage 0 remains writes-disabled, `effects_mode=off`, durability is unqualified, and this Windows verification does not qualify Linux Effects. The packet grants no writer, vault, MOC adoption, MCP write endpoint, auto-apply authority, Q-ORACLE selection, or release authority.

No push, merge, release, deployment, tag movement, credential use, Q-ORACLE selection, Effects write enablement, or vault access occurred.

## Evidence locations

- Machine receipt: `orchestration/integration/receipts/engine-integration-receipt.json`
- Final run: `orchestration/integration/receipts/engine-final-local-20260831T233500Z/`
- Current receipt: `orchestration/integration/receipts/engine-final-local-20260831T233500Z/current/current-runtime.json`
- Historical receipt: `orchestration/integration/receipts/engine-final-local-20260831T233500Z/historical/historical-contract-replay.json`
- Rejected/aborted evidence: `orchestration/integration/receipts/rejected-seal/engine/`

The rejected evidence directory contains 18 preserved files totaling 379,464 bytes. Its sorted `relative-path<TAB>sha256<TAB>bytes` inventory SHA-256 is `bd79355d832d4c64c3a1332a19d474c17e2e310470b4e95f6b3832d706b5a4c1`. This includes the abandoned overlapping logs, process-tree record, initial failing preflight, and superseded direct-edit preflight. None contributed to the final result.
