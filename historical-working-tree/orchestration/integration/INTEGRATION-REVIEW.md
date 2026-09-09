# GKOS local integration review

Date: 2026-08-31; Q-INTENT owner-decision update 2026-09-01

Status: **REVIEW_BRANCHES_PUBLISHED_WITH_ENGINE_HOSTED_FAILURES; Q_INTENT_R19_HOSTED_CI_PASS**

This review supersedes `orchestration/upgrades/UPGRADE-ASSEMBLY.md` and the pre-integration Engine coordinates in `Q-GUARD-REVIEW.md` for branch, seal, inventory, and test-receipt coordinates. Those earlier documents remain preserved as historical evidence.

Five isolated review branches now exist locally and at their exact GitHub review refs. Four are direct exact-base commits. Observatory is a content-verified reconstruction because source coordinate `8da1d2239a9ce0af5570fe1bfa264934d8aabbe4` is not available as a local Git object. The five review refs were pushed solely for hosted CI. Nothing was merged, released, deployed, tagged, granted production authority, connected to production credentials, or permitted to write Effects or vault data.

## Integrity result

- The original final Sol audit read 712 tracked/current review Markdown files. The refreshed literal recursive filesystem scan after R19 hosted CI and preservation of the superseded Engine worktree covers all 1,649 Markdown paths under `orchestration` (10,623,274 bytes, 583 unique content hashes); every file decodes as UTF-8. The larger count includes duplicated documentation inside integration and superseded worktrees plus the prospective R19 decision, review, and hosted-CI records.
- The original 659 Markdown files remain byte-for-byte unchanged.
- The atomic deliverable verifier passes for five repositories and 42 manifested files.
- The integration verifier passes for all five clean local branches, and every sealed patch matches its branch content. Independent `git ls-remote` verification binds all five GitHub review refs to the exact reviewed commits.
- Final deliverables manifest SHA-256: `10a70209862bea2549edef8006d66a4d140e9a1ac250d29c53eaccfea819f706`.

## Review coordinates

| Repository | Local branch | Base or reconstruction | Review commit | Sealed patch SHA-256 |
| --- | --- | --- | --- | --- |
| Engine | `codex/integrate-engine-stability-20260831` | direct base `8207958047b3361ae21ac07c5a2abbd26a42a684` | `1c59a992bafd6815ae9837bb3910084d4aea9972` | `1f06667fea932638b0136e56ecb3a9b546579dece660ef07ffda65a632a64cef` |
| Standard R18 | `codex/integrate-standard-r18-20260831` | direct base `aa9a05315a9a767bd672aa2bb5179c963d9d66ca` | `9f47ecf8fefb87810cd44bd03fa8e82eb321fd4a` | `b4ce3f17ef88bb51647577c2d693730e98c96ed8d8a97c602d77b64e7354dcdd` |
| Kosmos | `codex/integrate-kosmos-identity-20260831` | direct base `6486035dfc2e42173b1158b8007c9bab35aa7dc9` | `52b843c50a9e810bf8ad7ac7de8e4505a44b6baa` | `b52b9df81756d3876e90f3d46d24e8dc75df2c58aca63dc5ea145d7a195bbfee` |
| Observatory | `codex/integrate-observatory-identity-20260831` | local base `2a7b66fc6a33076fdcf29574cf2e31082c1b6e2a`, reconstruction `07ffb58859c8e0622a746d88df9016d7b520c6d3` | `2c01d9ea1263db2e4d7f438c2955cbc481c69f6e` | `bd454ba7801dd95c16be0f9d53373aee805955a4f591fa74243244467890d508` |
| Lite | `codex/integrate-lite-quick-connect-20260831` | direct base `4027bfc4499ad0a2f3e753401f1320468e283823` | `f5b06b4a4ea5020d62824ceffc51622269a52f19` | `8bea6d258452552086ea410ec831c9afcdcbc8465728ecec5c76e523f8606d97` |

The five original review coordinates above are unchanged. The owner supplied
the missing Q-INTENT decision afterward on isolated Standard branch
`codex/adopt-q-intent-r19-20260901`, based on the exact reviewed Standard commit
`9f47ecf8fefb87810cd44bd03fa8e82eb321fd4a`. Its local R19 candidate is
`04a164792c0957f5ce8acc9ba6853597ec0660dd` (tree
`534d518cf091578b8f0a6e06629e1f0e5cb017c6`). Under a later exact authorization,
that commit was pushed solely for hosted CI and passed all five triggered
workflows. This follow-up is not part of the five-patch seal and has not been
merged, published, tagged, released, or deployed.

## Executed checks

| Repository | Result | Qualification boundary |
| --- | --- | --- |
| Engine | Inventory PASS; integrity gate 6/6; current runtime 944 passed, 0 failed, 7 skipped of 951; historical replay 35/35 | `INCOMPLETE_PLATFORM_COVERAGE`; Windows Node v24 evidence only; `release_qualified=false` |
| Standard R18 | 80/80 tests; default and strict mutation lint PASS | Starter runner correctly remains nonqualifying: 6 passed and 2 UNEVALUATED; no Standard v0.81 or profile claim |
| Kosmos | 283/283; Chromium identity tests 2/2 | Component and browser evidence; no live Engine connection |
| Observatory | Build PASS; 38 passed, 0 failed, 1 Windows Bash skip; actual Chromium/WebGL identity check PASS | Event source was synthetic mocked SSE; source history is reconstructed |
| Lite | 17/17; typecheck and build PASS; offline Cargo 2/2 | Windows only; Linux and macOS not executed; `release_qualified=false` |

The R19 follow-up passed 82/82 Standard-native tests and strict mutation lint
with 62 requirements, 28 gate codes, and zero uncovered gates. Its starter
runner remains honestly nonqualifying: six PASS, two `UNEVALUATED`, and no
profile or tier claim. Markdownlint was unavailable locally and was therefore
exercised as a hosted check. The exact R19 SHA subsequently passed hosted Conformance runner,
Markdown lint, Link check, Release validation, and Release checksums workflows.
The earlier five-workflow PASS at Standard commit `9f47ecf8...` remains bound to
that earlier SHA rather than being rebound.

One pre-existing documentation limitation remains visible: six of the first
seven DOCSTD source cells cite numbered sections that do not exist in the
current compact v0.80 master file. The decision records, registry, and normative
annexes remain the usable local anchors. R19 did not silently rewrite those
source cells; citation cleanup requires a separately reviewed correction.

The Engine 8,000-node timing remains a local synthetic microbenchmark. It is not independent benchmark evidence.

## Defects found during integration

Real application of the first seal exposed Windows line-ending defects that the earlier packaging check had missed. The packaging and verification scripts were hardened to stage with repository-style normalization, verify exact staged blobs, run normalized diff checks, reverse-check patches, reject symlink or unmanifested payloads, and replace the final bundle only after a complete successful verification.

A final Engine preflight then found one mixed-CRLF/LF test whose raw candidate digest differed from its Git-normalized sealed bytes. The test was normalized to LF, the integrity gate gained an adversarial CRLF rewrite check without increasing its six-test count, and the inventory generator now emits UTF-8/LF deterministically. The corrected Engine inventory SHA-256 is `55b3cd9a861b99a5be893425cf1914445364dda4942fced1a07863b665476812`. The candidate was resealed and rebuilt non-destructively from the exact base. Failed and superseded evidence remains under `orchestration/integration/receipts/rejected-seal/`.

The original Engine subagent accumulated two failed attempts, including overlapping qualification activity. It was removed under the requested workforce rule and replaced by a new Sol reviewer. The replacement found the mixed-line-ending defect before the final suite and completed the corrected qualification with one non-overlapping run.

## Implied decision questions

| Question | Disposition | Required decision or evidence |
| --- | --- | --- |
| Q-ORACLE | **OPEN** | Engine `1c59a992...` is a review candidate only. Final selection still requires the applicable G-TS, Standard, platform, dependency, artifact, and source gates. Preserve the distinct historical/reference coordinates and publish a new coordinate when authorized; do not move a tag. |
| Q-EFFECTS | **PARTIALLY RESOLVED** | KnightsAI CT210 is the concrete Node/Linux host for NL-E0 writes-disabled assessment only. It is Debian 13.6 with Node 22.23.2 and an existing unprivileged `gkos-engine` identity, but it is a privileged LXC sharing the active Observatory host and a live owner-data bind mount. Exact synthetic data root, unit boundary, grant issuer, retention, recovery, and durability profile remain owner/operator decisions. |
| Q-PROVIDERS | **OPEN** | Local ONNX, neutral HTTP embed/rerank, and outbound MCP adapter families are scoped. Endpoint allowlists, credential lifecycle, supported failure modes, and the first local model/runtime/hardware/license pack are unselected. |
| Q-BENCH | **OPEN** | No independent benchmark archive, access path, or verified SHA is available. Local Kosmos data and the Engine microbenchmark do not close this question. |
| Q-INTENT | **OWNER DECISION RECORDED; EXACT-SHA HOSTED CI PASS** | R19 prospectively supplies and adopts the previously undefined eighth position: “Every committed governed state change is durably receipted.” The decision traces normative provenance to R15-104/105 and `GKOS-RECEIPT-001`/`003`, with STD-079 r4 invariants 3–4 as directive provenance. It adopts only the eight-row DOCSTD §4 procedure and does not rewrite R4 history. Checklist definition and hosted validation are resolved; pull-request integration, the actual eight-check gate execution, publication, and release qualification remain pending. |
| Q-LIVE | **OPEN** | Synthetic browser checks prove identity separation at component level. No correlated staging credentials, canary scope, monitoring window, transport-bound closure, or complete Engine request-to-render demonstration exists. |

## Known invariant sources

The exhaustive authority-layered catalog is `orchestration/integration/receipts/KNOWN-INVARIANTS-CATALOG.md`. Its deterministic index covers 205 Markdown paths and 85 unique contents; validation passed 127 exact source/line/text citations, all 17 Hindsight machine invariant statements, and all 41 draft database cases.

The principal sets are: the R19-adopted, unpublished eight-position DOCSTD §4 documentation-intent procedure; ten owner-approved STD-079 r4 controlling invariants; seven normative layer blocking invariants; 62 atomic Standard registry records with 28 stable negative gate mappings; two provisional SRTP invariants; ten ratified Hindsight build-specification invariants; 17 draft Hindsight failure-matrix invariants; 41 draft database cases; current Engine freshness/reference candidate invariants; Kosmos security, renderer, and cosmology implementation invariants; Lite parity/reopen invariants; and candidate-only Marshal concurrency, database, and ownership constraints. Repeated copies and test descriptions do not create additional authority.

## Hosted CI result

All five exact branches were pushed and remotely reverified.

- Standard R18: five of five workflows passed.
- Kosmos: CI and Browser passed.
- Engine: CI failed with 10 successful, 2 failed, and 2 skipped jobs. `build (23)` failed in `Tests`; Windows watcher Node 22 failed in `Exact watcher observation qualification`. The separate runtime-qualification workflow passed all nine historical OS/Node jobs and failed all three Ubuntu current-runtime jobs for Node 22, 23, and 24.
- Observatory: no workflow exists at the review commit.
- Lite: its CI push trigger is restricted to `main`, so the review branch produced no run.

Overall hosted qualification is not passed. Detailed public job outcomes are bound in `orchestration/integration/receipts/HOSTED-CI-QUALIFICATION.md`. GitHub required unavailable repository Actions permission for full failed logs and uploaded artifacts, so no root cause is inferred beyond the exact failed steps and annotations.

The later R19 Standard follow-up is separately bound in
`orchestration/integration/receipts/Q-INTENT-R19-HOSTED-CI.md`. GitHub verified
the exact ref at `04a164792c0957f5ce8acc9ba6853597ec0660dd`; all five triggered
workflows passed: Conformance runner, Markdown lint, Link check, Release
validation, and Release checksums. This closes hosted validation for R19 but
does not change the ecosystem-wide failure status caused by Engine or create a
release qualification.

## Node-on-Linux and CT210 finding

KnightsAI CT210 is the selected concrete Node/Linux machine for **NL-E0 writes-disabled assessment only**. Direct read-only inspection found Proxmox VE 9.2.11 hosting a privileged Debian 13.6 LXC with four cores, 4 GiB memory, Node 22.23.2, npm 10.9.8, and active Engine, Observatory, and Caddy services. It has no GitHub Actions runner and was not used as hosted CI.

The existing `gkos-engine` service identity and private `/var/lib/gkos-engine` state root can support bounded synthetic status evidence, but the current unit lacks explicit systemd path allowlists and several proposed isolation controls. The live `/mnt/data/Oden` bind mount is not enrolled for Effects and was not traversed. ZFS uses `sync=standard` on a single NVMe vdev; the executor still reports `directoryFlush:false`, and no crash, power-loss, directory-fsync, backup, or restore qualification exists. Mandatory values remain `effects_mode=off`, `writes_enabled=false`, `mcp_write_surface=false`, and `durability_qualified=false`.

## Authority boundary and next controlled step

The published branches and receipts are ready for repository review, but they are not merge or release candidates because Engine hosted qualification failed and Observatory/Lite lack exact review-branch hosted results. R19 now has exact-SHA hosted validation, but its push authorization did not authorize a pull request, merge, or publication. Under R18-131, any v0.81 candidate containing R19 still requires the complete exact-bound release route and separate publication authority. The next controlled work is authenticated diagnosis of the five Engine failed jobs and repository review of R19. Observatory needs a repository-owned workflow, and Lite needs an authorized review-branch trigger, PR path, or manual dispatch. Merge, release, deployment, tag movement, production credentials, Effects writes, vault mutation, oracle selection, and Rust cutover remain unauthorized.
