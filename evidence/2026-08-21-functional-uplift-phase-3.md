# GKOS-Engine functional uplift — Phase 3 local-freeze evidence

Date: 2026-08-21

Repository: Odenknight/GKOS-Engine

Phase scope: one-pass canonical ingest validation, bounded profile overlays,
sealed owner storage and crash recovery, the sole outer active pointer, and the
Phase 3 validate/index/search orchestration layered additively on the qualified
Phase 2 retrieval implementation.

Local Full state: **FROZEN_LOCAL**. This is an unstaged working-tree freeze, not
a commit or publication coordinate. Final reciprocal review is `UNASSIGNED`.
Hosted CI is `UNASSIGNED`. No merge, tag, release, deployment, package
publication, provider provisioning, service restart, or production activation
is claimed.

## Exact coordinates and disposition

| Coordinate | Value |
| --- | --- |
| Phase 2 base / evidence head | `63ae89ce699187326419b45d3d92f93ff5836f1e` |
| Working branch | `codex/phase-3-ingest-validation` |
| Full implementation qualification commit | `UNASSIGNED` |
| Full draft pull request | `UNASSIGNED` |
| Lite implementation pin / reciprocal final review | `UNASSIGNED` |
| Hosted Full CI | `UNASSIGNED` |
| Hosted Lite CI | `UNASSIGNED` |
| Package | `gkos-engine` 2.1.2 |
| Ingest contract | `gkos-ingest-validation/1.0.0-draft.1` |
| Built-in profile selector | `gkos:frontmatter-profile/current` |
| Standard study commit | `a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6` |
| Projection profile | `gkx-2.3-validating-projection` |
| Local platform | Windows `win32` x64 |
| Local runtimes | Node 22.23.2, 23.11.1, and 24.18.0 |
| Worktree disposition | Exact frozen implementation plus this unstaged evidence; staging is empty |

The evidence file is outside the ingest pack. Its future commit SHA cannot be a
prerequisite for the local qualification it records, avoiding a self-SHA and
self-hash dependency. A later signed implementation commit, draft PR, hosted
run, reciprocal review, or Lite pin must replace the corresponding
`UNASSIGNED` evidence before any terminal cross-repository claim.

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

The final exact worktree passed TypeScript no-emit, build, the full repository
suite, and the combined Windows retrieval/config/store/ingest CLI/storage lane
on all three supported Node majors:

| Runtime / gate | Exact result |
| --- | --- |
| Node 22.23.2 typecheck and build | PASS |
| Node 22.23.2 full suite | PASS; 522 passed, 0 failed, 0 skipped |
| Node 22.23.2 Windows alias/authority focus | PASS; 140 passed, 0 failed, 0 skipped |
| Node 23.11.1 typecheck and build | PASS |
| Node 23.11.1 full suite | PASS; 522 passed, 0 failed, 0 skipped |
| Node 23.11.1 Windows alias/authority focus | PASS; 140 passed, 0 failed, 0 skipped |
| Node 24.18.0 typecheck and build | PASS |
| Node 24.18.0 full suite | PASS; 522 passed, 0 failed, 0 skipped |
| Node 24.18.0 Windows alias/authority focus | PASS; 140 passed, 0 failed, 0 skipped |
| Frozen parser/profile/validator focus | PASS; 19 passed, 0 failed, 0 skipped |
| Frozen outer storage/state-machine focus | PASS; 77 passed, 0 failed, 0 skipped |
| Frozen CLI/orchestration focus | PASS; 14 passed, 0 failed, 0 skipped |
| Navigation/governance/public-API focus | PASS; 44 passed, 0 failed, 0 skipped |
| Intelligence service contracts | PASS; 4 passed, 0 failed |
| Nomenclature and Apache-2.0 license gates | PASS; zero unapproved nomenclature matches; Apache-2.0 metadata consistent |
| Package contents / dry package | PASS; 275 files; 1,004,222 packed bytes; 4,510,433 unpacked bytes; SHA-1 `f0ff0802bcbd83e6e2a13cd114f29f03641693bb` |
| Phase 0–2 contract byte diff | PASS; byte-identical to `63ae89ce699187326419b45d3d92f93ff5836f1e` |
| Static forbidden-boundary scans | PASS; zero forbidden provider, cross-layer Navigation import, or merge-marker matches |
| `git diff --check` / staged diff | PASS; no whitespace errors; 0 staged paths |
| Frozen local worktree scope | PASS; exactly 55 modified or untracked paths |

Node 22 emits an experimental warning when `node:sqlite` is first imported.
The CLI now suppresses only Node's exact SQLite `ExperimentalWarning` during
its lazy runtime preparation; all other process warnings remain untouched.
Exact fixture-driven stdout/stderr tests pass on Node 22, 23, and 24.

One initial Node 23 parallel full-suite run encountered a transient Windows
`EPERM` during an atomic witness replacement. The isolated 14-test CLI replay,
the immediate complete 522-test replay, and the subsequent 140-test Windows
authority replay all passed. Hosted Windows repetition remains `UNASSIGNED`.

This local volume does not expose a distinct 8.3 short-name spelling. The
ordinary path and mandatory alias/junction/hard-link lanes pass locally; the
deliberately forced short-name capability assertion correctly reports the
missing host capability and is not recorded as a pass. The hosted
`GKOS_REQUIRE_SHORT_PATH_FIXTURE=1` qualification remains `UNASSIGNED`.

## Compatibility and authority boundaries

The Phase 0 public/export/help golden, Phase 1 draft.1 retrieval pack, Phase 2
draft.2 retrieval pack, Navigation contract pack, and Phase 1–2 evidence bytes
remain unchanged from `63ae89ce699187326419b45d3d92f93ff5836f1e`.
Phase 3 adds no public package export for its owner-plane host seams. It adds no
second parser/profile authority, provider/model/domain allowlist, source-note
write, autofix, merge, network schema discovery, durable ledger claim, or
production activation.

## Pending publication qualification

Final reciprocal Full/Lite review, an exact implementation commit and Lite pin,
draft pull requests, Linux Node 22/23/24 jobs, hosted Windows alias/8.3 jobs,
Lite Rust latest/MSRV/Windows and desktop lanes, and all publication coordinates
remain `UNASSIGNED`. Until those gates are recorded, this evidence supports only
the exact local Full freeze above. No stage, commit, push, publish, merge, tag,
release, or deploy occurred in this local freeze.
