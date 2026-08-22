# GKOS-Engine functional uplift — Phase 4 Slice B evidence

Date: 2026-08-22

Repository: Odenknight/GKOS-Engine

Phase scope: the frozen Phase 4 retrieval-evaluation contract and pure verifier,
followed by private trusted-host execution of the reviewed and general fixture
authorities through the actual production retrieval coordinator, exact attempt
counters, deterministic `eval`/`tune` presentation, and crash-recoverable
no-replace candidate publication.

Final Phase 4 Slice B state: **DONE**. The exact Full implementation chain ends
at signed+DCO commit `a57b98c00c1913f5b7ed96839b3f8effe5be9c4a`.
Lite independently approved the Slice A verifier/contract freeze, the Slice B
executor freeze, and the exact Node 23 SQLite-capability correction with no
blocker, high, or medium finding. Both final Full hosted events are green. No
merge, tag, release, deployment, package publication, provider provisioning,
service restart, or production activation is claimed.

## Exact coordinates and disposition

| Coordinate | Value |
| --- | --- |
| Qualified Phase 3 chain head / Phase 4 base | `5396d46d497ff4ba952039d8aadef3049d767809` |
| Working branch | `codex/phase-4-retrieval-evaluation` |
| Full Slice A implementation | `873baa7726e7872ccaf4e0e35707ee6b79d407f4` (ED25519 signed + DCO; direct parent is the Phase 4 base; 57 paths) |
| Full Slice A correction / Slice B base | `cac029a5b570135b26f3585bc86f4c9beb00c36d` (ED25519 signed + DCO; direct parent `873baa7726e7872ccaf4e0e35707ee6b79d407f4`; 7 paths) |
| Full Slice B implementation | `75548dd81009af2cfc1856c26f96b1611993e524` (ED25519 signed + DCO; direct parent `cac029a5b570135b26f3585bc86f4c9beb00c36d`; 16 paths) |
| Full qualified Slice B head | `a57b98c00c1913f5b7ed96839b3f8effe5be9c4a` (ED25519 signed + DCO; direct parent `75548dd81009af2cfc1856c26f96b1611993e524`; exact 9-path correction) |
| Full draft pull request | [#29](https://github.com/Odenknight/GKOS-Engine/pull/29), open/draft/unmerged/CLEAN, head `codex/phase-4-retrieval-evaluation`, base `codex/phase-2-lineage-citations` at exact qualified Phase 3 chain head `5396d46d497ff4ba952039d8aadef3049d767809` |
| Full reciprocal review | APPROVED by Lite for the exact Slice A freeze/correction, the 16-path Slice B freeze, and the 9-path Node 23 correction |
| Lite Slice A implementation | `d0e593939e36d660173c8f32d56dc9f9cb8cb764` (signed + DCO; pinned to Full `cac029a5b570135b26f3585bc86f4c9beb00c36d`) |
| Lite Slice A evidence head | `408701f18e7fdf8caea1555e3b271d7621a53e4e` (signed + DCO) |
| Lite draft pull request | [#19](https://github.com/Odenknight/GKOS-Engine-Lite/pull/19), open/draft/unmerged/CLEAN, head `408701f18e7fdf8caea1555e3b271d7621a53e4e`, base `41912fd6db279f1b46e67cb4b88c1f1b4ba86e63` |
| Retrieval-evaluation contract | `gkos-retrieval-evaluation/1.0.0-draft.1` |
| Package | `gkos-engine` 2.1.2 |
| Final Full hosted CI | PASS; [push run 32599149137](https://github.com/Odenknight/GKOS-Engine/actions/runs/32599149137) and [PR run 32599150783](https://github.com/Odenknight/GKOS-Engine/actions/runs/32599150783) |
| Final Lite hosted CI | PASS; [PR run 32587639121](https://github.com/Odenknight/GKOS-Engine-Lite/actions/runs/32587639121), eight jobs |
| Evidence-only head | `UNASSIGNED`; this file cannot name its own future commit without a self-SHA cycle |
| Worktree disposition at evidence freeze | Qualified clean head plus exactly this one untracked evidence file; staging and package archives are empty |

The evidence file is outside the frozen evaluation pack. Its later signed
evidence-only commit and exact-head hosted rerun do not replace the immutable
implementation qualification coordinate above.

## Frozen 37-file retrieval-evaluation pack

The exact pack remains byte-identical from Full Slice A correction
`cac029a5b570135b26f3585bc86f4c9beb00c36d` through the qualified Slice B head.
All files are UTF-8 without BOM or CR and have exactly one terminal LF. Total:
**37 files / 4,948,463 bytes**.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `aggregate-metrics.schema.json` | 2757 | `41bbc1d277767be2d22d2da7992aa69383c8494c5380acdf2a108e6d60afdda4` |
| `base-configuration.schema.json` | 652 | `a2eea6c16ff09fc731168e4021a254b13de1d56f703d7e967af8b6c4d6f31edd` |
| `baseline.schema.json` | 2950 | `a31f07aa6975e1cd820d392b9499cbdcf623b22903a4f9a7f00a2ceca2a6dd54` |
| `common.schema.json` | 3751 | `8cf0ec965958ff4763c962d385c5df4791d336a4a4e9d10c027ce6a5e29cb823` |
| `comparison.schema.json` | 1363 | `a7c7ddabae2770fdc878bb0c7da9b70dbf490bbcfa9ffd91e500dc232142c4f6` |
| `conformance-fixture.json` | 180488 | `adbdd4e5083d2311a7666320602a621c9984b6ea41fb71940d36fd3a858a5268` |
| `contract.json` | 7547 | `59ec3f95d9aed590bf1fe5e2594ae261173d1a9d8d3240c9d5f057e24775217d` |
| `environment-set.schema.json` | 1680 | `b103bc7c45f3667a75e11abe006965dcd58bf9dc45eaa30d56b379f48a9bd121` |
| `environment.schema.json` | 6315 | `5f95fba66973b23a725ef258ae707f46813d2f85b4483792de1c4563509a4686` |
| `evaluation-input.schema.json` | 3271 | `2c6cbf8c0aa9bc7d8472bd19595840148aa369f1cfbcd1d9994b12e0f4969237` |
| `fixed-provider.json` | 3829125 | `ca9b3627830f985a80b428544c6794df0cd81673744ea2e34c5e8730fa4cf3ce` |
| `fixed-provider.schema.json` | 19480 | `c166e464c83b7bcb8e28f44726f1831f2adcec18b0f0804a5f9c449a95c3e67b` |
| `fixture-catalog.json` | 6686 | `3bc74a716aabfad5c51768841e1d9799ff81c2f075f7aacf7a9fbf8469349c8c` |
| `fixture-catalog.schema.json` | 5368 | `5fb847fa500773b415b8cfc94d5ca105cd747a6299dc9983a2e813d670a3ea8e` |
| `generate-ndcg-discount.py` | 1035 | `80d6bb5aada6d63b1b999515091e776bf29b4fdd4977fe27bf394448952f9bb5` |
| `golden-fixture.toml` | 10001 | `f479ef3e9228466facc4ba030ff00bf90e89f28774efc345597d84ac84575205` |
| `metric-computation-fixture.json` | 699823 | `c02b120cd8bf4674773f3173bd25240180e9808328690ee0217daa8f17da6c20` |
| `metric-computation-fixture.schema.json` | 2557 | `320521c6f0cf979f8cc69b34f59c636c1aba7385b0205bc80fab5541782050ba` |
| `metrics-set.schema.json` | 2396 | `aaa3016bf773b81b338eb0550765d22b3182deb90bb83dd2de8e1ea03f720b7c` |
| `ndcg-discount-table.json` | 2231 | `ee3ba599227fb1d287b3caaa7f53ff87141adc255a4900490d6b703344d890c1` |
| `ndcg-discount-table.schema.json` | 1193 | `0ec33e523bcbb006dd41ae8cb5ee857b1720e56603dd908785d3b5a1e2b364f6` |
| `normalized-golden.schema.json` | 2111 | `eb53e895897a15160fb8d5d8833c3bbbc150a4416075f3967d1932a2e03aeb01` |
| `observation-report.schema.json` | 2722 | `d951278577ea973631d64eec902a09a90919fbec1881216f2f232e90629b3a1d` |
| `query-metrics.schema.json` | 3369 | `c8a86937fe471862890e39c8ee0c2ea59dead4a114e8123ceaf8e3d47bc95dca` |
| `README.md` | 14561 | `3ba1c22db835c657161d1dab6dbc3c2d7218f666ae6b981d561a7c360ad8cc20` |
| `reviewed-bundle.json` | 72449 | `1b0170aeb3b381b089b528d98355d111d5dcf4b75cc781d39209aa866008cca2` |
| `reviewed-bundle.schema.json` | 9437 | `1864aad28ade036ee520531e2abb16a451501f8d5593aa26cee755b9c9cd736b` |
| `scenario-comparison.schema.json` | 945 | `9cd1b63c5b752c6a2e35d76ef9d4635a1c2afc7903177a793650aac2460d88b5` |
| `scenario-conformance-fixture.json` | 8287 | `cfb6daca7443f2872ef71969d1c27387934554252e8f729df9ec573313749a59` |
| `scenario-outcome.schema.json` | 10417 | `09f1571d0a314abc1a335a21abb80d0b4756dc0fe87aa274bb9dea2b801f00ba` |
| `source-corpus.json` | 4215 | `95def0401759ce328789778e88489e9b02a2d58f8051b9ac048e4bb5d976dbe9` |
| `source-corpus.schema.json` | 1783 | `4fd82a66f78918e8d48777939ba06a76296395d631449e2da85983c2d087a14f` |
| `tune-priority-fixture.json` | 19088 | `e7d3f50e573c966669338326ffda40e2f9a5d82275b2cbf0d840df82bdccb31e` |
| `tune-priority-fixture.schema.json` | 3657 | `c749f3fa9b81bb1150cb12ba76f21680c41dcca2c8cf9142e1238ddbb7666b07` |
| `tune-selection.schema.json` | 2650 | `ce635e7e779824bdf9dc2f079af614bf2c6a97a0f4c9058990696fb8626171a1` |
| `tuning-axes.schema.json` | 1052 | `bfc5361726126e05d42c92e6b20736b56593a077fd358cd79ef45937efd5d1ad` |
| `tuning-grid.schema.json` | 1051 | `5877659ba90d99fe9b650403aa24b0c09183560bc6b2a80e6c64c88e43a21f64` |

## Implemented Slice A and Slice B scope

- the authored golden remains the human fixture entry point; exact fixed
  siblings are opened under one owner-private capability, with optional
  reviewed-bundle presence sealed as an exact authority coordinate rather than
  a fallback;
- normalized golden, environments, source corpus, catalog, projection
  manifests, provider transcript, reviewed result origins, metric fixtures,
  baseline, comparison, and tune priority are independently sealed and
  cross-bound before state, provider, or output work;
- the 24-query reviewed bundle binds two 12-query environment partitions, one
  physical-absence temporal pair, real predecessor/successor validity, exact
  public-result origins, complete eleven-counter attempt envelopes, and a
  21,600-query-evaluation tune matrix;
- general sealed fixtures retain the ratified 1..256 eval surface and tune
  limit of 30, including all four independent embedding/reranker role
  combinations and fixed query/reranker failure degradation;
- actual execution builds private unactivated schema-3 generations under a
  sealed 0700 temporary capability, opens the production raw-store coordinator,
  replays exact fixed offline provider occurrences, and never reads or changes
  an active/legacy pointer, live configuration, shared cache, credential, or
  network route;
- reviewed evaluation executes both present and physically absent corpora
  through the actual coordinator, independently verifies index receipts and
  terminal provider ledgers, and exact-compares public views, metrics, and all
  query-attempt counters;
- the 17-key private ExecutionAuthority digest binds every semantic and raw
  input coordinate plus the versioned deterministic scan-presentation literal;
  scan manifests/schema/SQL remain lexical scan on every host, while a real
  `sqlite_fts5` fixture must pass the complete EnvironmentSet physical probe
  before temporary state, output, index, or provider work;
- `gkx retrieval eval --fixture <golden-toml> [--json]` and
  `gkx retrieval tune --fixture <golden-toml> --output <candidate-config>` have
  exact finite argument, fixture, operational, comparison, and selection exits
  with path-free deterministic text or pretty canonical JSON;
- tune publication uses a fixed-name staged guard, hard-link no-replace commit,
  exact four-state candidate recovery, guard-last cleanup, parent fsyncs,
  evidence retention on ambiguity, and a minimal strict-roundtripped candidate
  TOML outside all protected roots; and
- raw catalogs, source corpus, fixed providers, reviewed authority, paths,
  stores, coordinator seams, tune selectors, and output authority remain
  package-private. The public `/retrieval` surface contains only verifier-safe
  normalized seals and pure metric/comparison math.

## Final local qualification

All times below are observed wall-clock durations and are qualification
evidence, not runtime promises.

| Runtime / gate | Exact result |
| --- | --- |
| Node 22.23.2 focused Slice B CLI | PASS; 23/23, 0 skipped; exhaustive 21,600 tune evaluations in 178.955 s |
| Node 23.11.1 focused Slice B CLI | PASS; 23/23, 0 skipped; actual no-FTS branch consumed; exhaustive tune in 157.802 s |
| Node 24.18.0 focused Slice B CLI | PASS; 23/23, 0 skipped; exhaustive tune in 143.837 s |
| Node 24.18.0 full repository suite | PASS; 567/567, 0 skipped |
| Frozen proportional retrieval/public/authority suite | PASS; 106/106 |
| TypeScript no-emit and deterministic build | PASS |
| Package contents gate | PASS; 337 files / 1,521,930 Windows working-tree bytes |
| Dry package | PASS; 337 entries; 1,521,930 packed bytes; 11,098,060 unpacked bytes; SHA-1 `2ed884ca416f279d2a6f81c85036f9c19f89b422`; SHA-512 `GrqWks0JT8E0a0hg1g34KobiI9hIaW6HHMmDNeKbcrXNv3nENNuJTZ9EFtmLmm1zMIDJGxc4jsyJCxMnXYe9mQ==` |
| CLI conformance fixture | PASS; 23,770 raw bytes; SHA-256 `fce5308d252d9e693244250543f6642af1cc4a7ef9404ac604313f6f37f107be`; sealed fixture digest `sha256:958c06ed5b2d063e6b9530261ed74fd17bba5e599d6326aafe5bc7f1ac6c0ff6` |
| Slice A pack immutability | PASS; zero byte diff from `cac029a5b570135b26f3585bc86f4c9beb00c36d` |
| Phase 0–3 protected contract/evidence diff | PASS; zero changes in the Slice B implementation/correction commits |
| Public/export closure | PASS; no raw fixture, provider, path, store, output, reviewed, or tuning authority exported |
| License and nomenclature | PASS; Apache-2.0 consistent; zero unapproved legacy matches |
| Hygiene | PASS; `git diff --check`; no staged path, package archive, task temp, merge marker, or protected-pack drift |
| Evidence closeout scope | PASS; exactly this one untracked file |

The physical SQLite capability matrix is always consumed. On FTS-capable
runtimes, a selected `sqlite_fts5` fixture executes its full disabled-provider
result. On Node 23 without bundled FTS5, the same fixture returns the exact
operational exit 3 with empty stdout and zero persistent state/output before
provider work. Lexical-scan reviewed output is byte-identical across all three
runtimes and still uses scan SQL.

## Hosted correction and terminal Full CI

The first Slice B push and PR runs at
`75548dd81009af2cfc1856c26f96b1611993e524`,
[32596795897](https://github.com/Odenknight/GKOS-Engine/actions/runs/32596795897)
and
[32596797885](https://github.com/Odenknight/GKOS-Engine/actions/runs/32596797885),
failed only the Linux Node 23 build jobs `97088963176` and `97088968325`.
Node 22, Node 24, and all six Windows path-security jobs passed. The Node 23
bundled SQLite lacked FTS5; the executor attempted the reviewed scan fixture
with physical capability reason bytes and the FTS-only general fixture before
a whole-set physical preflight.

The exact nine-path corrective commit
`a57b98c00c1913f5b7ed96839b3f8effe5be9c4a` adds only the private versioned
scan-presentation coordinate, complete EnvironmentSet FTS preflight, scan-only
private presentation override, structural FTS manifest fixture derivation,
cross-runtime tests, and corresponding documentation. It leaves all frozen
Slice A pack bytes and ordinary production coordinator semantics unchanged.

Both corrected exact-head events passed all six jobs:

- push run
  [32599149137](https://github.com/Odenknight/GKOS-Engine/actions/runs/32599149137):
  build Node 22 `97094684897`, Node 23 `97094684767`, Node 24 `97094684913`;
  Windows path-security Node 22 `97094684946`, Node 23 `97094684879`, Node 24
  `97094684857`; and
- pull-request run
  [32599150783](https://github.com/Odenknight/GKOS-Engine/actions/runs/32599150783):
  build Node 22 `97094690011`, Node 23 `97094690160`, Node 24 `97094690186`;
  Windows path-security Node 22 `97094690201`, Node 23 `97094690162`, Node 24
  `97094690157`.

Each Linux build job passed typecheck, build, license, nomenclature,
Navigation, **567 discovered / 564 passed / 0 failed / 3 documented
platform/catalog skips**, four intelligence tests, package, CLI smoke, and
clean-tree gates. Each hosted Linux package gate reported 337 files / 1,515,685
LF-checkout bytes. Each Windows job passed the mandatory distinct-8.3,
junction, hard-link, and retrieval regression suite at **49/49, 0 skipped**.
Local, upstream, origin, and PR head all equal the qualified SHA; local Git and
GitHub both report the ED25519 signature valid, and the DCO sign-off matches
the author.

## Lite verifier qualification and reciprocal review

Lite copied the exact signed 37-file pack and independently implemented the
pure normalized verifier without adding TOML, raw corpus, filesystem, SQLite,
provider, search, tune, output, or host authority. Its qualified implementation
and evidence commits are recorded above. Exact-head Lite run
[32587639121](https://github.com/Odenknight/GKOS-Engine-Lite/actions/runs/32587639121)
passed all eight jobs: desktop `97066347465`, Rust MSRV `97066347491`, Node 23
`97066347507`, Node 24 `97066347512`, Node 22 `97066347514`, Rust latest
`97066347526`, desktop-native `97066347530`, and Windows MSVC
`97066347597`.

Lite then acted only as a read-only reciprocal reviewer for Full Slice B. It
independently replayed the exact private executor, provider-role/failure,
reviewed physical-absence, capability, path, recovery, public-closure, package,
and proportional gates and issued terminal approval before each Full
implementation/correction commit. Neither repository's review changed or
staged the other repository's bytes.

## Compatibility and remaining work

Phase 0–3 public/help/contract behavior and the frozen Phase 4 Slice A pack are
unchanged. Evaluation does not activate a generation, alter source bytes,
provision a provider, read credentials, perform network I/O, publish a cache,
or modify live configuration. Candidate TOML publication is local, explicit,
no-clobber, and outside every sealed input/state root.

Slice C is not part of this DONE claim and remains a separate bounded design
and implementation tranche. This closeout does not authorize merge, tag,
release, deployment, npm/package or artifact publication, service restart, or
production activation; none occurred.
