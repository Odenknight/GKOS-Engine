# GKOS-Engine functional uplift — Phase 5 Slice A evidence

Date: 2026-08-23 (America/New_York)

Repository: Odenknight/GKOS-Engine

Slice scope: the frozen Phase 5 watcher delta-coordination, durable journal,
coherent-publication, startup/shutdown recovery, status/control, source-removal
outbox, and bounded convergence contract pack; strict schemas and exhaustive
fixtures; and crate-private/pure TypeScript sealers and derivations. This slice
does not implement, start, install, deploy, or activate the watcher host.

Final Slice A state: **DONE**. The exact qualified implementation head is
signed+DCO commit `420a9d704f1fd12a6a61e4dd60abeb70757a9b2d`. Lite issued
terminal read-only approval for the contract/sealer freeze and both bounded
Phase 4 qualification-runner compatibility corrections with no blocker, high,
or medium finding. The final exact-head push and pull-request matrices are
green, and all twelve downloaded qualification receipts and GitHub artifact
metadata rows, including each API archive digest, were independently verified.
Phase 5 as a whole is not DONE:
host execution, live journal/pointer I/O, service status/control, and Lite
delegated-host integration remain later reviewed slices.

No merge, tag, release, deployment, package publication, provider
provisioning, service restart, or production activation is claimed or
authorized.

## Exact coordinates and disposition

| Coordinate | Value |
| --- | --- |
| Qualified Phase 4 head / Phase 5 base | `98f4faf227320852006f5e1e9e01eb41f5fdff7b` |
| Working branch | `codex/phase-5-watcher-recovery` |
| Slice A contract/sealer implementation | `79e7b068c5fc1a8dc536ace1b254db6ac5e282cd` (ED25519 signed + DCO; direct child of the Phase 5 base; 24 paths, 116,922 insertions) |
| Phase 4 input-closure correction | `ef3b9024a2eb9748441457cacb874e380b80f727` (ED25519 signed + DCO; exact two-path child of `79e7b068c5fc1a8dc536ace1b254db6ac5e282cd`; 169 insertions / 8 deletions) |
| Hosted portability correction / qualified Slice A head | `420a9d704f1fd12a6a61e4dd60abeb70757a9b2d` (ED25519 signed + DCO; exact one-path child of `ef3b9024a2eb9748441457cacb874e380b80f727`; one insertion) |
| Signing key | ED25519 `SHA256:dwwxvq69ZWPDlS6bzlvZ0uXo76ZKTRqvMSmDGhABhfM`; local `git verify-commit` and GitHub verification valid for all three commits |
| Full draft pull request | [#30](https://github.com/Odenknight/GKOS-Engine/pull/30), open/draft/unmerged/CLEAN; exact head `420a9d704f1fd12a6a61e4dd60abeb70757a9b2d`; base `codex/phase-4-retrieval-evaluation` at `98f4faf227320852006f5e1e9e01eb41f5fdff7b` |
| Watcher-recovery contract | `gkos-watcher-recovery/1.0.0-draft.1` |
| Frozen pack | 18 directory leaves / 17 manifest rows / 5,860,943 governed bytes; `sha256:c08520c1392d6be04c71159050c0d60f5bf03afeeb915ae44920e758e35cb49a` |
| Frozen convergence SamplePlan | 3,978 compact UTF-8 bytes, no LF; `sha256:6ab764aad47cbb072469f19760b772df90b2138acaf6a9f022041d38094bb695` |
| Terminal ordinary Full CI | PASS; [push 32640342144](https://github.com/Odenknight/GKOS-Engine/actions/runs/32640342144) and [PR 32640344023](https://github.com/Odenknight/GKOS-Engine/actions/runs/32640344023), exact source head `420a9d704f1fd12a6a61e4dd60abeb70757a9b2d` |
| Evidence-only head | `UNASSIGNED`; this file cannot bind its own future commit without a self-SHA cycle |
| Worktree disposition at evidence freeze | Qualified clean head plus exactly this one untracked evidence file; staging and package archives empty |

Local, upstream, origin, and PR #30 head were exact-equal before this evidence
file was created. Every DCO trailer exactly matches the commit author. This
evidence file is outside the frozen pack and cannot replace the qualified
implementation or hosted coordinates above.

## Approved Phase 5 design frozen by Slice A

The owner-ratified Work Package G design is encoded as Full-owned versioned
contracts and pure sealers, not as a second watcher implementation:

- Event hints are private evidence, never rename authority. Paths are portable
  vault-relative values; absolute, drive, URI, UNC/device, ADS, traversal,
  control, alias, symlink/reparse, hard-link, containment, and TOCTOU hazards
  fail closed or force a full reconciliation. The coordinator freezes a 500 ms
  debounce, 2,000 ms maximum coalesce age, and 2,000 normalized-hint cap.
- A scoped `event|shutdown_flush` batch invokes the existing production
  `applyChanges` path once. An unscoped/overflow event and every
  `startup_reconciliation|failure_reconciliation` batch invoke the production
  `setFiles` path once. The fixed effective Phase 3 profile is `non_strict`;
  deterministic invalid content publishes coherent N-1 plus an exact rejection,
  while unstable capability evidence leaves the prior coherent generation stale.
- Full topology snapshots bind the Phase 3 observation, validation, rejection,
  accepted/rejected source sets, folders, and attachments. Production
  `GraphDelta`, canonical GKX, deterministic Graphiti projection, Phase 3
  retrieval state, and a generation-specific raw graph artifact remain distinct
  authorities. Phase 5 graph-sink state is exactly `not_applicable`; Phase 7
  graph storage/tools are not implemented here.
- Journal transitions are the exact normal progression
  `observed0 -> normalized1 -> gkx_applied2 -> retrieval_applied3 ->
  graph_applied4 -> activation_prepared5 -> complete6`, with final
  `failed|superseded` exceptional rows that retain the last reached semantic
  payload. A coherent manifest binds only complete6 material. The outer active
  pointer is published through the sealed stage/guard/temp/fixed protocol, and
  readers select one old or new immutable generation without mixing stores.
- Startup serves only a verified coherent generation, marks it stale while
  reconciling, and never treats watcher registration as freshness. Shutdown
  stops new work, flushes/checkpoints only at safe boundaries, fsyncs/reopens
  durable authority, and has a 10,000 ms Full target; no handler calls
  `process.exit` before safe completion.
- The owner-private SQLite journal freezes 12 ordered creation pragmas, 19
  strict DDL statements, an aggregate DB+WAL+SHM cap of 4,294,967,296 bytes,
  bounded transaction growth, exact reopen/FK/integrity checks, immutable old
  generations, and the three-state journal-reset recovery grammar. Reset never
  moves, deletes, or recursively cleans the old DB/WAL/SHM evidence.
- Only a physical source disappearance can create a source-removal occurrence.
  A null adapter binding is terminal local-only and nondegraded. A configured
  adapter must be trusted, capability-verified per process, durable, idempotent,
  and bound to the stable occurrence; event sets, activations, responses, and
  receipts are journaled and crash/retry/reset-carry exact.
- `gkos status --state ...` and `gkos watcher journal-reset --state ...` are the
  only additive CLI unions. Status binds document/chunk/model/watcher/freshness/
  last-sync/uptime/pid without emitting state paths, tokens, configuration, or
  source content. The owner-authenticated loopback `/status` and
  `/control/shutdown` contract is frozen for a later host slice.
- Provider selection remains solely trusted-operator configuration through the
  existing `openai_compatible|local_onnx|mcp` families. FTS-only qualification
  performs zero provider, rerank, and network work. No vendor, model, route,
  domain, private-LAN preference, content-controlled routing, or silent fallback
  policy was added.

UUIDs and timestamps in receipts are provenance, never mutation ordering or
freshness authority. Source IDs reuse the existing canonical GKX UUID-v1-through-
v8 seam; watcher batch, journal, reset, process, and service instance IDs use
lowercase UUIDv7 as frozen by their own envelopes.

## Contract pack and private implementation bytes

The pack root is
`contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1/`. It contains exactly
two READMEs, ten strict schemas, five executable fixtures, and the non-self-
listing manifest. `pack-manifest.json` is 3,249 bytes / 94 LF / 0 CR, raw
SHA-256 `d3c6808bb33049a2cfc13e71b7de03fdfd477f296de938103503d14ee70ef72a`.
Every one of its 17 rows exact-binds the other leaf's filename, byte size, and
raw SHA-256; their byte sum is 5,860,943.

| Frozen executable authority | Exact result |
| --- | --- |
| Conformance top | `status:"frozen"`, `frozen:true`; 360 semantic cases and 85 schema cases; digest `sha256:dad4941b7966ce54b9a2d0fdc67d9ee2d0b5a7b59de27779f59fbedc7df7db5e` |
| Recovery partition | 24 event, 47 transition, 41 topology, 117 pointer, 38 crash, 45 source-removal, 10 status/control, 23 provider, 14 path/identity, and 1 shutdown case; all 360 semantic IDs consumed once |
| CLI fixture | 7 exact state fixtures and 35 command/help/error cases |
| Storage fixture | 12 pragmas, 19 DDL statements, 18 limit/formula fields, 8 admission boundaries, 24 executable SQLite authority mutations, and 3 reset-recovery states |
| SamplePlan | One source / two stable chunks; 2 warmup + 20 measured external searches; nearest-rank indexes p50=9, p95=18, p99=19; every sample and p95 at most 5,000,000 microseconds |
| Reference outcome | Linux x64 Node 24 and Windows x64 Node 24 real FTS required; exact generation/query/provider counts 23/22/0; other Node lanes return exact qualified or unavailable outcomes without a TAP skip |

The generated 5,130,773-byte conformance fixture has raw SHA-256
`c5b45040b5d21c77af0aad109851a7b381302d812bdce0f1ea0217f692893615`.
The pack and fixtures are regenerated from one source bundle and independently
replayed by the focused test; generated-byte equality cannot substitute for the
semantic negative matrix.

| Private implementation input | Bytes / LF / raw SHA-256 |
| --- | --- |
| `src/watcher/contracts.ts` | 180,002 / 2,567 / `a85548f0354f28840768db25b10fcf57751fe9298eda9a519c53b8de3467de90` |
| `scripts/generate-watcher-recovery-source-bundle.mjs` | 258,212 / 2,983 / `d5237bed718e72d97093920080273c5e7eb6abc988dd00feb477f7b2c94ab07f` |
| `test/watcher-recovery-contracts.test.mjs` | 48,230 / 880 / `9d4eea76e51645cdd0df24a004cb93664b797bdd00ff7e789c4580e4c0346e9f` |
| Final private Phase 4 qualifier | 68,138 / 1,481 / `b2394172139f73c225f3ce72f75ede4fc9fa14ec0edd5939ccc84bb35324b83e` |

All four files are LF-only. The watcher contract bundle is built privately and
is absent from the package export map and ordinary public declaration graph.
It contains pure canonicalization, validation, sealing, relation checks, and
test-only SQLite mutation execution; it contains no filesystem watcher,
server, live journal, pointer publisher, service controller, credential,
provider, process, or deployment implementation.

## Hosted failures and bounded corrections

The first exact-head events at implementation commit `79e7b068c5fc1a8dc536ace1b254db6ac5e282cd`
were [push 32638052307](https://github.com/Odenknight/GKOS-Engine/actions/runs/32638052307)
and [PR 32638069576](https://github.com/Odenknight/GKOS-Engine/actions/runs/32638069576).
All six applicable jobs in each run failed the existing Phase 4 immutable-input
gate before evaluation/security TAP with sole receipt failure
`QUAL_PACK_INVALID`. The frozen runner compared all of `src/**` with Slice B;
the only delta was the authorized additive private leaf
`src/watcher/contracts.ts`. Phase 4 pack, CLI, public, and Phase 0-3 bytes were
unchanged, so no broad waiver was accepted.

Exact two-path correction `ef3b9024a2eb9748441457cacb874e380b80f727`
freezes the Slice B protected inventory at 112 paths with terminal-LF list
digest `sha256:f88846fdaf91e59f3e80780b787340b82e5a7177c474518aa901f63046c9478f`,
and admits all-and-only one tracked addition. Its exact addition preimage is
`src/watcher/contracts.ts\n`, digest
`sha256:d24887eb649f993deda0de31059a879de629906769bc1f4387302e13a662fe1b`.
Missing or changed baseline bytes, modes, or paths and any other tracked
`src|bin` addition fail closed. Temp-clone tests exercise mutation, deletion,
rename, mode drift, package drift, an extra watcher leaf, and an unrelated
source leaf without touching the live checkout.

The replacement [push 32639470090](https://github.com/Odenknight/GKOS-Engine/actions/runs/32639470090)
and [PR 32639472067](https://github.com/Odenknight/GKOS-Engine/actions/runs/32639472067)
proved the Windows 22/23/24 jobs and 49/49 receipts green, but each Linux build
failed one test at `test/watcher-recovery-contracts.test.mjs:500`. On Linux,
`git update-index --chmod=+x` changes the index mode without changing the
physical worktree mode, while the first correction checked only the baseline-
to-worktree view. Each Linux run therefore reported 595 tests, 591 passes, one
failure, and three expected platform skips; its receipt upload then failed
secondarily because the test step stopped before receipt creation.

Exact one-path correction `420a9d704f1fd12a6a61e4dd60abeb70757a9b2d`
adds an independent `git diff --cached --quiet --no-renames` over the identical
baseline/path vector immediately after the existing worktree comparison. Any
nonzero result or command error uses the same fail-closed path. An isolated
`core.fileMode=true` clone proved the original comparison exits 0 while the
cached comparison exits 1 and reports `mode change 100644 => 100755`. No pack,
fixture, schema, source, public, runtime, or receipt byte changed in this final
correction.

## Terminal exact-head CI

Both ordinary events at `420a9d704f1fd12a6a61e4dd60abeb70757a9b2d`
passed every applicable job. The manual Observation job was skipped as required
for non-`workflow_dispatch` events.

| Event | Linux Node 22/23/24 jobs | Windows Node 22/23/24 jobs | Manual Observation |
| --- | --- | --- | --- |
| [Push 32640342144](https://github.com/Odenknight/GKOS-Engine/actions/runs/32640342144) | `97196355939`, `97196356069`, `97196355981` | `97196356088`, `97196356060`, `97196356036` | `97196356452` skipped |
| [PR 32640344023](https://github.com/Odenknight/GKOS-Engine/actions/runs/32640344023) | `97196360734`, `97196360748`, `97196360740` | `97196360643`, `97196360743`, `97196360770` | `97196360991` skipped |

Every Linux full-suite step reported 595 tests / 592 pass / 0 fail / 3
expected platform skips / 0 todo. Each following Phase 4 qualifier reported
23/23 with zero fail/skip/todo. Every Windows security qualifier reported
49/49 with zero fail/skip/todo and required the distinct short-path and alias
fixtures.

Push receipt provenance is
`checkout_commit == event_commit == source_head_commit ==
420a9d704f1fd12a6a61e4dd60abeb70757a9b2d`, event `push`.

| Push lane | Job; artifact ID / exact name | Archive bytes / API digest | TAP; reporter / wall µs | Receipt bytes / raw SHA-256 / self-digest |
| --- | --- | --- | --- | --- |
| Linux Node 22.23.2; FTS5 true | `97196355939`; `9493553861` / `phase4-retrieval-qualification-Linux-node-22` | 5,258 / `sha256:4e04b41988272a7b0ece8f09c3f2f0113fe75858f3c385caa880ce508d1e3e8e` | 23/23; 272,967,418 / 273,008,177 | 5,064 / `sha256:b92e2baf38645e905624a420b0dd6a6542121bc0e6ea9dd2724c10e5047b4a4e` / `sha256:7ebca641bcb497d615a372f2a9ac76a27af056cba4935bba65345346559b71ab` |
| Linux Node 23.11.1; FTS5 false | `97196356069`; `9493543402` / `phase4-retrieval-qualification-Linux-node-23` | 5,259 / `sha256:30577a723030d8767843f404958f65e1610e31d198f6a762c419021fab9daa92` | 23/23; 253,622,943 / 253,658,615 | 5,065 / `sha256:60653267f2331be9e87d84faf8da69f1bee349912ab92ca781deaff3afa63c3b` / `sha256:79a92772907ee273944f90def00f2f30d806c168fa3dd992b8570902b4608ba0` |
| Linux Node 24.19.0; FTS5 true | `97196355981`; `9493543834` / `phase4-retrieval-qualification-Linux-node-24` | 5,258 / `sha256:991756fa91fd7b37fd70de31757b838e9a0dd90454e41eb90f3e38e7f9ca7acd` | 23/23; 259,325,085 / 259,367,352 | 5,064 / `sha256:f6b6ae470e1b416032d0af65f15010deabf5c1695cc013cb6cb4db95928c0215` / `sha256:8e4fa9ac4dcead6597397419976917278b22b6106f8e843b2db231d1cd9ae948` |
| Windows Node 22.23.2; FTS5 true | `97196356088`; `9493434712` / `phase4-retrieval-qualification-Windows-node-22` | 4,245 / `sha256:42c9dedde237a22f0c1935d07037ff6f40ace40bae92b58374d0226eeefeb730` | 49/49; 6,258,924 / 6,329,741 | 4,051 / `sha256:1d6c671b5a15322a2ca394347722e29050c18a17e7dd9e59b7ccb1c24524e80b` / `sha256:8a0d2e18de05d27dbcad197baf8fff0eb501330c98dd79b4f44bf9a955f11562` |
| Windows Node 23.11.1; FTS5 false | `97196356060`; `9493434789` / `phase4-retrieval-qualification-Windows-node-23` | 4,246 / `sha256:0358cc20d1217aaa1bc1d2672cad686ba8c50bec0bb07b0b9c9e1f1470945c85` | 49/49; 6,240,284 / 6,298,412 | 4,052 / `sha256:09f696943451621c02e8cfb04250ba084a6ffd00574fd687dc4663781325cc27` / `sha256:5e6c8695299687afad6d1003ae68205733c1b4265f0fbac8a0e87c076646882d` |
| Windows Node 24.19.0; FTS5 true | `97196356036`; `9493434174` / `phase4-retrieval-qualification-Windows-node-24` | 4,245 / `sha256:66b3b08d28c7328379679ade34a74d4cd127a3abfbb5e6c6def2d6b9b74fb04c` | 49/49; 5,908,022 / 5,979,932 | 4,051 / `sha256:94f91920a0dbf20459fa9ac1f107bcf8ffb0848789a9aff7193323391949e42f` / `sha256:e87b0aa49f94d561fce543169d269da2da0c9a0847cc2039282a0602ec7c93c4` |

PR receipt provenance correctly distinguishes synthetic checkout/event commit
`569dfd33f90e26fa24895eaab7c1795fdc0aeeb7` from exact source head
`420a9d704f1fd12a6a61e4dd60abeb70757a9b2d`; event `pull_request`.

| PR lane | Job; artifact ID / exact name | Archive bytes / API digest | TAP; reporter / wall µs | Receipt bytes / raw SHA-256 / self-digest |
| --- | --- | --- | --- | --- |
| Linux Node 22.23.2; FTS5 true | `97196360734`; `9493521378` / `phase4-retrieval-qualification-Linux-node-22` | 5,266 / `sha256:69a22528bd06f3e5629f5fe855a9891dbfc2c4c6cbb1da12a639e359ca2095f0` | 23/23; 201,168,979 / 201,199,330 | 5,072 / `sha256:6c5b77053e6857618d96a1e38afc4c171ef12bdf57f12776fcdccaf7faa20d16` / `sha256:16e2445a78aac9a887cd5c84c5d2459b95b4b24a737031fbbb50f33602e6c28e` |
| Linux Node 23.11.1; FTS5 false | `97196360748`; `9493544586` / `phase4-retrieval-qualification-Linux-node-23` | 5,267 / `sha256:745d878aabc1765431fbb8b91b702a84c03bf39861911ae5567226c573084ae2` | 23/23; 252,659,341 / 252,689,633 | 5,073 / `sha256:68a23b69d13fb2b072199c735e04dd3f4ace5a32385fcc0d0ff7c01338be305d` / `sha256:69e6429ae9768090004b08468ddbecbe6c2371e81fbd09dbdb28cf0ab93ff238` |
| Linux Node 24.19.0; FTS5 true | `97196360740`; `9493550455` / `phase4-retrieval-qualification-Linux-node-24` | 5,266 / `sha256:7c666862f2a588db227fc22b61921cf135410e3c4b2b17a1579bbac474225dfb` | 23/23; 266,685,142 / 266,723,705 | 5,072 / `sha256:064fe2a111164d40160a2b526365d31cb46ca714c721c245ed9497a6f07077f5` / `sha256:9e4a4fdca7153f17d529aefb457d112b6712a6c42d1ee54908915e1bdc78c13e` |
| Windows Node 22.23.2; FTS5 true | `97196360643`; `9493434445` / `phase4-retrieval-qualification-Windows-node-22` | 4,253 / `sha256:ae38388129d67d466e9139a87d3c8afd57d1cfe0162c2e59ceb88ce8ab31b610` | 49/49; 8,061,305 / 8,149,415 | 4,059 / `sha256:d033844b33d1d1f9f1670054033c2b4ae6002b36fc7f843a8c67f592c6276f8e` / `sha256:7d60d757844ed9d80728b0ae01976869e5c9aa74155a980f4c73e230bd42fa68` |
| Windows Node 23.11.1; FTS5 false | `97196360743`; `9493434539` / `phase4-retrieval-qualification-Windows-node-23` | 4,254 / `sha256:481597914a3756d3fa67df6f80250f0127aa0c482e946fec130cf90aa6e52e3d` | 49/49; 5,083,718 / 5,146,280 | 4,060 / `sha256:83d5343996fb725af7ea0e051a4e28f988eff5ac8434d2575ab91982c86bba0f` / `sha256:7b6ab6cd090fcb4ac7889295f0920c2146d5934c05b0abe796d9d2f737ba753c` |
| Windows Node 24.19.0; FTS5 true | `97196360770`; `9493435604` / `phase4-retrieval-qualification-Windows-node-24` | 4,253 / `sha256:42ecc4f20c3a4e419be77cfac12b6915b8bff7819dc745136d045aee4aa4404a` | 49/49; 8,721,101 / 8,790,656 | 4,059 / `sha256:465e8bccf485751ae203b475087eafc9912d283e826bad8a0a66123bca2b625c` / `sha256:6242436bf0f3f9f0efc0e8d9994f5901fd7f828a7c52af5f693f580b2151dc06` |

All twelve artifacts were downloaded to isolated operating-system temporary
roots. Each contains exactly one `gkos-phase4-retrieval-qualification.json`.
Every receipt is LF-only with one terminal LF, `status:"pass"`, and an empty
failure-code vector; its raw SHA-256 and canonical self-digest above were
independently recomputed. All twelve bind the unchanged Phase 4 pack as 37
files / 4,948,463 bytes / manifest
`sha256:6732519a4912714a432680c88219322c80413e4165b5e3f613f23e82cd7ee340`.

## Final local, fresh-clone, and protected gates

| Gate | Exact result |
| --- | --- |
| Focused watcher suite | PASS Node 22.23.2, 23.11.1, and 24.18.0/24.19-compatible: 16/16 each, zero fail/skip/todo |
| Full local suite | PASS; 595/595, zero fail/skip/todo |
| Executable SQL authority | PASS; all 24 named mutations applied to a fresh canonical in-memory/fd-backed authority and rejected through the expected finite code |
| Generator/schema/conformance replay | PASS; exact 18-leaf pack, ten schemas, 360 semantic cases, 85 schema cases, no unused or duplicate recovery ID |
| TypeScript/build | PASS; `tsc --noEmit` and deterministic private bundle build |
| Intelligence | PASS; 4/4 |
| Fresh detached clone | PASS; exact corrected line applied atop `ef3b9024a2eb9748441457cacb874e380b80f727`; `npm ci`, build, focused 16/16, and externally bundled Phase 4 immutable-input verifier |
| Package dry run | PASS; 358 entries; 2,034,580 packed bytes; 17,350,857 unpacked bytes; SHA-1 `5823ee4c08b6cbda598584d7b5d1ade789072b84`; integrity `sha512-XtVioLjCS9L7jmi0PhoUAs3TkWcbr1MAAYRUyxRg0q0MXvpl3c6ZTKsqnR8Ul3MoTRWim0D6nWHzr9ddRG7Zfg==` |
| License and nomenclature | PASS; Apache-2.0 consistent; zero unapproved legacy matches |
| Phase 5 pack | PASS; 18 leaves / 17 manifest rows / 5,860,943 governed bytes / `sha256:c08520c1392d6be04c71159050c0d60f5bf03afeeb915ae44920e758e35cb49a`; manifest excludes itself |
| Phase 4 pack and CLI | PASS; pack 37 files / 4,948,463 bytes / zero diff from `cac029a5b570135b26f3585bc86f4c9beb00c36d`; CLI 23,770 bytes, raw `sha256:fce5308d252d9e693244250543f6642af1cc4a7ef9404ac604313f6f37f107be`, sealed `sha256:958c06ed5b2d063e6b9530261ed74fd17bba5e599d6326aafe5bc7f1ac6c0ff6` |
| Phase 0-3 protection | PASS; zero diff for the frozen contract/evidence paths from qualified Phase 3 head `5396d46d497ff4ba952039d8aadef3049d767809` |
| Public/runtime closure | PASS; package metadata/lock, existing `bin/**`, public exports, ordinary runtime source, NavigationCore, Phase 0-4 contracts/fixtures/evidence, and existing REST/CLI result shapes unchanged; sole new runtime-source leaf is the exact private `src/watcher/contracts.ts` authority |
| Hygiene | PASS before this file; clean exact head, staged diff empty, package archives absent, and `git diff --check` clean |
| Evidence closeout scope | PASS; exactly this one untracked Markdown file |

The protected Phase 4 verifier now proves the exact 112-path Slice B inventory
plus the exact one-leaf authorized addition, with independent worktree and
index comparisons. It rejects every other tracked `src|bin` addition and any
baseline mutation, deletion, rename, type, or mode change. The Phase 5 change
does not alter source notes, existing retrieval generations, public API
exports, GKX Standard ownership, NavigationCore's value-only/no-I/O boundary,
or the completed Phase 0-4 contract and evidence bytes.

## Reciprocal review and final boundary

Lite remained read-only throughout the Full freeze and corrections. It
independently re-ran focused suites, adversarial sealer probes, schema ownership
and closure checks, SQL mutation execution, pack recomputation, fresh-clone
inventory/mode tests, and the final one-line worktree-versus-index proof. It
issued terminal approval before each publication action and did not edit,
stage, commit, or push Full bytes.

This Slice A closeout freezes contracts and pure validation authority only. It
does not claim that edit-to-search convergence, journal crash recovery,
coherent old/new external reads, graceful shutdown, source-removal delivery, or
status/control behavior has run against a live watcher host. Those are required
acceptance gates for the later host-execution and Lite-delegation slices and
must not be marked complete from these fixtures alone.

No merge, tag, release, deployment, npm/package publication, service
installation, watcher activation, source-note mutation, live-state migration,
credential read, runtime provider invocation, or watcher network operation
occurred in this closeout.
