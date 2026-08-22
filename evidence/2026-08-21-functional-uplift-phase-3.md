# GKOS-Engine functional uplift — Phase 3 local-freeze evidence

Local freeze date: 2026-08-21; hosted closeout prepared 2026-08-22

Repository: Odenknight/GKOS-Engine

Phase scope: one-pass canonical ingest validation, bounded profile overlays,
sealed owner storage and crash recovery, the sole outer active pointer, and the
Phase 3 validate/index/search orchestration layered additively on the qualified
Phase 2 retrieval implementation.

Full implementation state: **DRAFT_PUBLISHED_HOSTED_GREEN**. The exact Full
implementation and its Linux correction are signed commits on a draft pull
request. This evidence-only hosted closeout is one unstaged file pending
reciprocal review; it is not yet a commit. No merge, tag, release, deployment,
package publication, provider provisioning, service restart, or production
activation is claimed.

## Exact coordinates and disposition

| Coordinate | Value |
| --- | --- |
| Phase 2 base / evidence head | `63ae89ce699187326419b45d3d92f93ff5836f1e` |
| Working branch | `codex/phase-3-ingest-validation` |
| Full implementation freeze commit | `27d29039e00298b0081af629214aec3b39c26bc6` (signed; direct parent is the Phase 2 base) |
| Full corrective / published head | `e7cc0dd478af3d0bda216c5258dec5f77932def7` (signed + DCO; direct parent `27d29039e00298b0081af629214aec3b39c26bc6`) |
| Full draft pull request | [#28](https://github.com/Odenknight/GKOS-Engine/pull/28), head `codex/phase-3-ingest-validation`, base `codex/phase-2-lineage-citations` |
| Full reciprocal review | APPROVED by Lite for the 55-path implementation freeze and the exact two-file Linux correction |
| Lite implementation pin | `UNASSIGNED` |
| Hosted Full CI | PASS; [push run 32552881178](https://github.com/Odenknight/GKOS-Engine/actions/runs/32552881178) and [PR run 32552883201](https://github.com/Odenknight/GKOS-Engine/actions/runs/32552883201) |
| Hosted Lite CI | `UNASSIGNED` |
| Package | `gkos-engine` 2.1.2 |
| Ingest contract | `gkos-ingest-validation/1.0.0-draft.1` |
| Built-in profile selector | `gkos:frontmatter-profile/current` |
| Standard study commit | `a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6` |
| Projection profile | `gkx-2.3-validating-projection` |
| Local platforms | Windows `win32` x64 and WSL2 Debian Linux x64 |
| Local runtimes | Node 22.23.2, 23.11.1, and 24.18.0 on both platforms |
| Worktree disposition | Clean published head plus this one unstaged evidence closeout; staging is empty |

The evidence file is outside the ingest pack. Its future commit SHA cannot be a
prerequisite for the local or hosted qualification it records, avoiding a
self-SHA and self-hash dependency. Reciprocal approval and a later signed
evidence-only commit must precede treating this closeout as durable. The Lite
implementation pin and hosted Lite qualification remain separately
`UNASSIGNED`.

## Frozen 21-file ingest pack

The contract, three executable fixtures, and every schema declare or inherit
the final frozen contract state. `contract.json` has `status:"frozen"`,
`frozen:true`, and `hash_manifest_issued:true`; all three fixtures have
`status:"frozen"` and `frozen:true`. Every file is UTF-8 without BOM or CR and
has exactly one terminal LF. Total exact pack bytes: **248079**.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `README.md` | 17680 | `c3acdf6b0870694ca9bd63a25da0fbe1bccd757ee76521284f048888f302ac5b` |
| `activation-root.schema.json` | 1607 | `59383a035ad0edc25e087ac5a94f1a5564002d849e1d6116ec814c1322608bfe` |
| `active-pointer.schema.json` | 884 | `7f877c9dc3827356b097a7635965b63a64349ffb4331efa3be720629f9347a7d` |
| `attempt-status.schema.json` | 1391 | `d474ba6e10f8636334ea6c63fccb8ea06708cbd947ee20934c38e716e2c80b26` |
| `authority-lock.schema.json` | 2725 | `1f8505291e2be7abb5e59b301beb410dd4f903d010623de461ba84da9ed58603` |
| `authority-witness.schema.json` | 1762 | `372f25fbe7c83fce7be5185c40e43866d8e667406bb8afafdc39ad5a45876962` |
| `cli-conformance-fixture.json` | 14150 | `567f7d3371ddfe33ec314b05959f90b90080d55519e1a1a2618ce74798d6e680` |
| `conformance-fixture.json` | 33037 | `920ae8bdd54a633e490a6e6efa34f73adfd55bb6786562da08655797931e26c8` |
| `contract.json` | 29295 | `ee62ad7f1b0d2ae9a626680bbdca20feca443a52d7ba0d09b58b07979c3e0061` |
| `finding.schema.json` | 15817 | `8aee60ee2a2906081a244421664da564867a7c8fa71d8aebe775968d359756f1` |
| `index-result.schema.json` | 3788 | `ccd3361cec041be4d220ab6e10833ee48d7b46255a3463341d9e553454627bae` |
| `legacy-tombstone.schema.json` | 1046 | `c7bff930b5fa0fa174cd13f47ac9d9f1b19b7f1adadb2fa5c1292ff32924256e` |
| `migration.schema.json` | 1486 | `680d3f9d87bcbd637c772886333f7870e6f0b2b7bd76d0a047c77060e7314fcf` |
| `normalized-profile.schema.json` | 17631 | `016e3673f7db116ef53f0ce32e4faeb572eb1f5505c016ccd1b26e407e93c9c4` |
| `owner-generation.schema.json` | 2738 | `4c70f4a84240ad712c0ef943801332c5339e9021dd65c561563e03f173bd1ea8` |
| `profile-coordinate.schema.json` | 2498 | `1a4c2f7102c957aa6e1a9afdc6ab935ff1c5d942f1557272f9a151becef3b3db` |
| `rejection-journal.schema.json` | 1124 | `abf8e836ab7f2a4ec968c8c19ceef250265020c53e10ec84684a57edc006ca37` |
| `rejection.schema.json` | 2780 | `0d318333b02b8fdf1654ffff52f75fa3aa67640ee7d692f4e759a67ec00432c5` |
| `result.schema.json` | 5030 | `0a4ce21898d14a1cbaef3cf4f37b963cd361e547d2c68395578c241e9d0c50ed` |
| `state-common.schema.json` | 3331 | `6cccb19ede2357782af5a330e07745954da4b4bed2881470a6a04371bdf6a58e` |
| `storage-conformance-fixture.json` | 88279 | `35a91dd23354fe0d5b2ad5a1d6f68019a84c1070f1d3cb45910d939927eb03e0` |

## Implemented final scope

- the existing canonical GKX parser remains the sole YAML/frontmatter
  authority and emits parser-owned line and finite safe-field receipts;
- bounded local strict-TOML overlays can only narrow the built-in normalized
  profile; Lite verifies normalized envelopes and never parses YAML or TOML;
- intrinsic source failures become multiplicity-preserving sealed rejections,
  while ratified Decision-A cross-record conflicts remain report-only and do
  not discard physical candidates or block strict publication;
- strict failure records only the exact owner attempt status, and non-strict
  publication includes N-1 or all-invalid corpora without exposing owner-plane
  paths or findings in the six-field IndexResult;
- content-addressed schema-3 inner DB, rejection journal, owner manifest,
  activation root, witness, legacy tombstone, and sole active-ingest pointer
  follow the frozen crash-recoverable no-downgrade protocol under one shared
  writer authority;
- accepted-only deterministic chunk preparation is sealed before cache/provider
  work, and rejected source bytes cannot cross an indexing, query, or rerank
  provider boundary;
- ordinary search holds the verified legacy or public-safe inner store before
  config/credential/provider discovery and never loads owner manifest, journal,
  profile, validation result, or attempt-status bytes; and
- Phase 3 CLI forms have exact pre-I/O argument/path/profile classification,
  deterministic text/JSON bytes, path-free operational errors, and exit codes
  0/1/2/3 while the legacy positional validate behavior remains byte-compatible.

## Final local qualification

The exact published implementation passed TypeScript no-emit, build, the full
repository suite, and the Phase 3 and Windows authority lanes on all three
supported Node majors. Linux qualification used a clean WSL2 Debian clone at
the published head with a fresh lockfile install per runtime; its three skips
are the two Windows-only path tests and the optional
`science-standard-fixtures` catalog absent from a clean clone.

| Runtime / gate | Exact result |
| --- | --- |
| Node 22.23.2 Windows typecheck and build | PASS |
| Node 22.23.2 Windows full suite | PASS; 523 passed, 0 failed, 0 skipped |
| Node 22.23.2 Windows alias/authority focus | PASS; 141 passed, 0 failed, 0 skipped |
| Node 22.23.2 Linux typecheck and build | PASS |
| Node 22.23.2 Linux full suite | PASS; 520 passed, 0 failed, 3 documented skips |
| Node 23.11.1 Windows typecheck and build | PASS |
| Node 23.11.1 Windows full suite | PASS; 523 passed, 0 failed, 0 skipped |
| Node 23.11.1 Windows alias/authority focus | PASS; 141 passed, 0 failed, 0 skipped |
| Node 23.11.1 Linux typecheck and build | PASS |
| Node 23.11.1 Linux full suite | PASS; 520 passed, 0 failed, 3 documented skips |
| Node 24.18.0 Windows typecheck and build | PASS |
| Node 24.18.0 Windows full suite | PASS; 523 passed, 0 failed, 0 skipped |
| Node 24.18.0 Windows alias/authority focus | PASS; 141 passed, 0 failed, 0 skipped |
| Node 24.18.0 Linux typecheck and build | PASS |
| Node 24.18.0 Linux full suite | PASS; 520 passed, 0 failed, 3 documented skips |
| Phase 3 combined focus on every local runtime | PASS; 111 passed, 0 failed, 0 skipped |
| Frozen parser/profile/validator focus | PASS; 19 passed, 0 failed, 0 skipped |
| Frozen outer storage/state-machine focus | PASS; 78 passed, 0 failed, 0 skipped |
| Frozen CLI/orchestration focus | PASS; 14 passed, 0 failed, 0 skipped |
| Navigation/governance/public-API focus | PASS; 44 passed, 0 failed, 0 skipped |
| Intelligence service contracts | PASS; 4 passed, 0 failed |
| Nomenclature and Apache-2.0 license gates | PASS; zero unapproved nomenclature matches; Apache-2.0 metadata consistent |
| Package contents / dry package | PASS; 275 files; 1,005,272 packed bytes; 4,516,072 unpacked bytes; SHA-1 `1e2a8bf8312393f3709ac5e1903c0889fb41c174`; SHA-512 `FGHNRyqb4Qr6T9/Be1VeiZmfg8oXZCV5fvlSGabygchh2XqHUzaQJEn1mvSyg5OT74bY2O55itLsClseSCCx4w==` |
| Phase 0–2 contract byte diff | PASS; byte-identical to `63ae89ce699187326419b45d3d92f93ff5836f1e` |
| Static forbidden-boundary scans | PASS; zero forbidden provider, cross-layer Navigation import, or merge-marker matches |
| `git diff --check` / staged diff | PASS; no whitespace errors; 0 staged paths |
| Published implementation scope | PASS; 55-path Phase 3 freeze plus one exact two-file Linux corrective commit |
| Evidence closeout scope | PASS; exactly this one unstaged file; 0 other modified or untracked paths |

Node 22 emits an experimental warning when `node:sqlite` is first imported.
The CLI now suppresses only Node's exact SQLite `ExperimentalWarning` during
its lazy runtime preparation; all other process warnings remain untouched.
Exact fixture-driven stdout/stderr tests pass on Node 22, 23, and 24.

One pre-publication Node 23 parallel full-suite run encountered a transient
Windows `EPERM` during an atomic witness replacement. The isolated CLI replay,
the immediate complete replay, the local three-runtime matrix, and both hosted
Windows event matrices all passed.

This local volume does not expose a distinct 8.3 short-name spelling. The
ordinary path and mandatory alias/junction/hard-link lanes pass locally; the
deliberately forced short-name capability assertion correctly reports the
missing local host capability and is not recorded as a local pass. Both hosted
events ran `GKOS_REQUIRE_ALIAS_FIXTURE=1` and
`GKOS_REQUIRE_SHORT_PATH_FIXTURE=1`; Node 22, 23, and 24 each passed 49/49 with
the distinct `RUNNER~1` spelling and zero skips.

## Hosted correction and terminal Full CI

The first implementation push/PR runs
[32550700619](https://github.com/Odenknight/GKOS-Engine/actions/runs/32550700619)
and
[32550720500](https://github.com/Odenknight/GKOS-Engine/actions/runs/32550720500)
failed only in the Ubuntu full-suite step: 522 tests were discovered, 508
passed, 11 failed, and 3 were skipped. The failures were classified as POSIX
fixture modes masking the intended branches plus raw initial missing-file
errors. Reciprocal review found the adjacent post-snapshot DB-disappearance
normalization before the correction was published. The two-file corrective
commit
`e7cc0dd478af3d0bda216c5258dec5f77932def7` changes only those fixtures and
finite error mappings; all 21 frozen ingest-pack bytes and hashes remain
unchanged.

The terminal push run
[32552881178](https://github.com/Odenknight/GKOS-Engine/actions/runs/32552881178)
and PR run
[32552883201](https://github.com/Odenknight/GKOS-Engine/actions/runs/32552883201)
both passed. Each event completed build jobs for Node 22, 23, and 24 with
typecheck, build, license, nomenclature, Navigation, 520/523 full-suite tests
with the same three documented platform/catalog skips, intelligence, package,
CLI smoke, and clean-tree gates. Each event also completed mandatory Windows
alias/distinct-8.3 jobs for Node 22, 23, and 24 at 49/49 with zero skips. Local,
upstream, remote branch, and draft PR head all equal
`e7cc0dd478af3d0bda216c5258dec5f77932def7`; GitHub and local verification both
report its ED25519 signature valid.

## Compatibility and authority boundaries

The Phase 0 public/export/help golden, Phase 1 draft.1 retrieval pack, Phase 2
draft.2 retrieval pack, Navigation contract pack, and Phase 1–2 evidence bytes
remain unchanged from `63ae89ce699187326419b45d3d92f93ff5836f1e`.
Phase 3 adds no public package export for its owner-plane host seams. It adds no
second parser/profile authority, provider/model/domain allowlist, source-note
write, autofix, merge, network schema discovery, durable ledger claim, or
production activation.

## Remaining cross-repository qualification

This one-file evidence closeout requires reciprocal Lite review and a separately
authorized signed evidence-only commit. The Lite implementation pin, Lite draft
pull request, Lite Rust latest/MSRV/Windows and desktop lanes, and hosted Lite CI
remain `UNASSIGNED`. Draft publication of the Full branch and PR does not
authorize or claim merge, tag, release, deployment, npm/package publication, or
artifact publication; none occurred.
