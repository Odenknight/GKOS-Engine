# GKOS-Engine functional uplift — Phase 4 evidence

Date: 2026-08-22 (America/New_York; hosted closeout completed 2026-08-23 UTC)

Repository: Odenknight/GKOS-Engine

Phase scope: the frozen retrieval-evaluation contract and independent Lite
verifier; private trusted-host execution of reviewed and general fixtures
through the production retrieval coordinator; deterministic nested
`gkx retrieval eval|tune` commands and crash-recoverable no-replace candidate
publication; and the offline hosted temporal/noninterference and bounded
performance qualification of those already-frozen semantics.

Final Phase 4 state: **DONE**. The exact qualified Full implementation head is
signed+DCO commit `67c3670892905681e24d935c6c2c57093d1088fc`. Lite issued
terminal read-only approval for Slice A, Slice B, Slice C, both Slice C
corrections, and the exact manual-Observation bridge with no blocker, high, or
medium finding. The terminal exact-head push, pull-request, and manual
Observation events are green. No merge, tag, release, deployment, package
publication, provider provisioning, service restart, or production activation
is claimed or authorized.

## Exact coordinates and disposition

| Coordinate | Value |
| --- | --- |
| Qualified Phase 3 chain head / Phase 4 base | `5396d46d497ff4ba952039d8aadef3049d767809` |
| Working branch | `codex/phase-4-retrieval-evaluation` |
| Full Slice A implementation | `873baa7726e7872ccaf4e0e35707ee6b79d407f4` (ED25519 signed + DCO; direct child of the Phase 4 base) |
| Full Slice A correction | `cac029a5b570135b26f3585bc86f4c9beb00c36d` (ED25519 signed + DCO; exact seven-path child of `873baa7726e7872ccaf4e0e35707ee6b79d407f4`) |
| Full Slice B implementation | `75548dd81009af2cfc1856c26f96b1611993e524` (ED25519 signed + DCO; exact 16-path child of `cac029a5b570135b26f3585bc86f4c9beb00c36d`) |
| Full Slice B capability correction | `a57b98c00c1913f5b7ed96839b3f8effe5be9c4a` (ED25519 signed + DCO; exact nine-path child of `75548dd81009af2cfc1856c26f96b1611993e524`) |
| Full Slice B evidence head / Slice C base | `ed3a7552b1d4a705c1b1a722b07255e89ec42186` (ED25519 signed + DCO; evidence-only child of `a57b98c00c1913f5b7ed96839b3f8effe5be9c4a`) |
| Full Slice C implementation | `7cf4278b7ca03fccdec63af082118210c058924a` (ED25519 signed + DCO; exact eight-path child of `ed3a7552b1d4a705c1b1a722b07255e89ec42186`) |
| Full Slice C EOL correction | `0a202c61df2ea965c6632998449d31e9c919d707` (ED25519 signed + DCO; exact two-path child of `7cf4278b7ca03fccdec63af082118210c058924a`) |
| Full qualified Phase 4 head | `67c3670892905681e24d935c6c2c57093d1088fc` (ED25519 signed + DCO; exact two-path manual-Observation bridge child of `0a202c61df2ea965c6632998449d31e9c919d707`) |
| Full draft pull request | [#29](https://github.com/Odenknight/GKOS-Engine/pull/29), open/draft/unmerged/CLEAN, exact head `67c3670892905681e24d935c6c2c57093d1088fc`, base `codex/phase-2-lineage-citations` at qualified Phase 3 head `5396d46d497ff4ba952039d8aadef3049d767809` |
| Full reciprocal review | APPROVED by Lite for every published Phase 4 freeze/correction and for this evidence input state |
| Lite Slice B implementation | `af8e3ee28bd5c4618cde694365cc8a2713ce2ca6` (signed + DCO; direct child of Lite Slice A evidence `408701f18e7fdf8caea1555e3b271d7621a53e4e`) |
| Lite qualified Phase 4 head | `d1c0d5d60e5380d4c1cb9fb1562585852307e657` (signed + DCO; Slice B evidence-only child of `af8e3ee28bd5c4618cde694365cc8a2713ce2ca6`) |
| Lite draft pull request | [#19](https://github.com/Odenknight/GKOS-Engine-Lite/pull/19), open/draft/unmerged/CLEAN, exact head `d1c0d5d60e5380d4c1cb9fb1562585852307e657`, base `codex/phase-3-ingest-validation` at `41912fd6db279f1b46e67cb4b88c1f1b4ba86e63` |
| Retrieval-evaluation contract | `gkos-retrieval-evaluation/1.0.0-draft.1` |
| Package | `gkos-engine` 2.1.2 |
| Terminal ordinary Full CI | PASS; [push run 32611399624](https://github.com/Odenknight/GKOS-Engine/actions/runs/32611399624) and [PR run 32611401583](https://github.com/Odenknight/GKOS-Engine/actions/runs/32611401583), exact head `67c3670892905681e24d935c6c2c57093d1088fc` |
| Terminal manual Observation | PASS; [workflow-dispatch run 32611873425](https://github.com/Odenknight/GKOS-Engine/actions/runs/32611873425), exact head/input `67c3670892905681e24d935c6c2c57093d1088fc`, seven jobs |
| Terminal Lite Slice B CI | PASS; [PR run 32602357316](https://github.com/Odenknight/GKOS-Engine-Lite/actions/runs/32602357316), exact head `d1c0d5d60e5380d4c1cb9fb1562585852307e657`, eight jobs |
| Evidence-only head | `UNASSIGNED`; this file cannot bind its own future commit without a self-SHA cycle |
| Worktree disposition at evidence freeze | Qualified clean head plus exactly this one untracked evidence file; staging and package archives are empty |

Local, upstream, origin, and PR #29 head were exact-equal before this evidence
file was created. Local `git verify-commit` and GitHub verification report valid
ED25519 signatures for the three Slice C commits, and every DCO trailer exactly
matches its author. The evidence file is outside the frozen contract pack; its
later signed evidence-only commit and exact-head hosted rerun cannot replace the
qualified implementation or Observation coordinates above.

## Frozen inputs and compatibility boundary

The Slice A retrieval-evaluation pack remains byte-identical to
`cac029a5b570135b26f3585bc86f4c9beb00c36d`: **37 files / 4,948,463 bytes**,
manifest digest
`sha256:6732519a4912714a432680c88219322c80413e4165b5e3f613f23e82cd7ee340`.
The complete file/size/SHA-256 table remains in
`evidence/2026-08-22-functional-uplift-phase-4-slice-b.md` and was rechecked by
the standalone Observation immutability gate before generator, temporary
state, provider, index, or query work.

| Frozen input | Exact coordinate |
| --- | --- |
| CLI conformance fixture | 23,770 bytes; raw `sha256:fce5308d252d9e693244250543f6642af1cc4a7ef9404ac604313f6f37f107be`; sealed `sha256:958c06ed5b2d063e6b9530261ed74fd17bba5e599d6326aafe5bc7f1ac6c0ff6` |
| Normalized golden | `sha256:f3de2536a3a6496aff6b4d6e7afca522cfd5e5b28b7b907a9b9e4d39ac1c8a9f` |
| Source corpus | `sha256:1d99bb7d9c2522d71f7c2e2633517753098be6f2698586b248f18d99affc285d` |
| Fixture catalog | `sha256:45addb4ab8b9634ffd22f2df099bc027a007130c11f109cb03c4e04ca38b5e16` |
| Fixed provider | `sha256:7c28de4be4ad24a116d4f07d9b86ea9b38ab3298700ee1563f3b861026dd5b41` |
| Environment set | `sha256:8269ad9e34b9704eaa724de4628d5667cb9ba4483ad08117a7a7549e202800c1` |
| Baseline | `sha256:0e46a9a83c55563ca33c41e98257455aca0c62ac46adb7b9b35c1abf6f3b9126` |
| Metric fixture | `sha256:6ea3a6b44d50efe60c2215a6bb30db60a5c29133474ddb0458c5ac4517c35e36` |
| Projection-manifest set | `sha256:e7285d07af3027c290151f864b8e46e3b468bc89017b67b74af77970f621dea9` |
| Result-origin set | `sha256:a5d357a9c236c37b86d79f099968724a5dc836db831d5506a1dda07c2877680c` |
| Reviewed bundle | `sha256:2a49075651e2a4b19e813e59a3d4546cc602f0e86c56d1e048f94d917cd6df2a` |

The Observation job additionally proved zero diff from Slice B evidence commit
`ed3a7552b1d4a705c1b1a722b07255e89ec42186` for `src/**`, `bin/**`, package
metadata/lock, the existing retrieval-evaluation CLI test, and its fixture;
zero pack diff from `cac029a5b570135b26f3585bc86f4c9beb00c36d`;
and zero diff from `5396d46d497ff4ba952039d8aadef3049d767809`
for the Phase 0–3 contract/evidence paths. The public JS and declaration-file
closure remains unchanged. No raw catalog, corpus, provider, store, path,
coordinator, output, or tune authority became public in Slice C.

## Slice C implementation and bounded corrections

Slice C adds no retrieval behavior or public API. Its exact eight-path
implementation commit adds:

- a deterministic 10,000-chunk offline fixture and one-section mutation;
- real SQLite FTS5 initial, incremental, and clean-rebuild observation through
  production index/search paths with fixed provider/request ledgers;
- nearest-rank p50/p95/p99 latency qualification with a strict p95 bound below
  500,000 microseconds;
- exact incremental-versus-clean manifest/result convergence and six-round
  per-query determinism checks;
- network/process denial installed before fixture/state/provider/query work and
  owner-private fail-retain temporary capabilities;
- a separate supplementary CLI qualification receipt for the existing
  reviewed temporal pair, 900 tune candidates, 21,600 query evaluations, and
  Windows alias/short-path security lanes; and
- a daily `17 4 * * *` plus manual standalone Observation workflow. The daily
  schedule remains default-branch-only and has not run pre-merge.

The first implementation push/PR runs
[32609992252](https://github.com/Odenknight/GKOS-Engine/actions/runs/32609992252)
and
[32609993898](https://github.com/Odenknight/GKOS-Engine/actions/runs/32609993898)
exposed a Windows-only byte-authority failure before TAP: three governed leaves
without explicit LF attributes were rewritten by `core.autocrlf=true`, so the
pack/CLI raw coordinates correctly failed with `QUAL_PACK_INVALID`. No
Observation was dispatched. Exact two-path correction
`0a202c61df2ea965c6632998449d31e9c919d707` adds only narrow `text eol=lf`
rules and their executable attribute/fresh-clone regression; it does not
renormalize or change a frozen blob. A fresh `core.autocrlf=true` clone proved
37/4,948,463 pack bytes, the 23,770-byte CLI fixture, zero CR in the three
affected leaves, and unchanged Git blobs.

The corrected push
[32610522820](https://github.com/Odenknight/GKOS-Engine/actions/runs/32610522820)
and PR
[32610525563](https://github.com/Odenknight/GKOS-Engine/actions/runs/32610525563)
runs passed all six jobs. Their exact job IDs were respectively
`97122701942`, `97122701912`, `97122701957`, `97122701808`, `97122701978`,
`97122701905` and `97122708617`, `97122708610`, `97122708612`,
`97122708630`, `97122708654`, `97122708499` for Linux Node 22/23/24 then
Windows Node 22/23/24.

GitHub cannot dispatch a branch-only workflow file that is not registered on
the default branch. The attempted standalone dispatch therefore returned HTTP
404 and created no run or artifact. No merge was authorized to register it.
Exact two-path bridge commit
`67c3670892905681e24d935c6c2c57093d1088fc` adds one required no-default
lowercase-40-head input and a `workflow_dispatch`-only Observation job to the
already-registered CI workflow. Before setup or work, the bridge exact-compares
that input with the feature branch ref, trusted `GITHUB_SHA`, and checked-out
HEAD. It structurally mirrors the standalone job, shares its non-cancelling
per-ref concurrency group, and passes the head only to the Observation source
receipt. Push/PR bridge instances are exact skips. The standalone scheduled
workflow remains byte-identical at 2,444 bytes,
SHA-256 `d072360963e0b080bb03495971fc342f567f05b0bf17285830a7418ac3c3f5fa`.

## Terminal ordinary exact-head CI

Both ordinary events at `67c3670892905681e24d935c6c2c57093d1088fc`
passed every applicable job. Their manual Observation bridge job was skipped as
required for non-`workflow_dispatch` events.

| Event | Linux Node 22/23/24 jobs | Windows Node 22/23/24 jobs | Bridge |
| --- | --- | --- | --- |
| [Push 32611399624](https://github.com/Odenknight/GKOS-Engine/actions/runs/32611399624) | `97124972827`, `97124972910`, `97124972988` | `97124972964`, `97124972932`, `97124973030` | `97124973300` skipped |
| [PR 32611401583](https://github.com/Odenknight/GKOS-Engine/actions/runs/32611401583) | `97124977749`, `97124977743`, `97124977756` | `97124977769`, `97124977745`, `97124977683` | `97124978147` skipped |

Each Linux job uploaded its exact 23/23, zero-fail/skip/todo qualification
receipt; each Windows job uploaded its exact 49/49, zero-fail/skip/todo
security receipt. All twelve downloaded receipts independently re-render to
their canonical pretty bytes and recompute their self-digests.

Push receipt provenance has
`checkout_commit == source_head_commit == event_commit ==
67c3670892905681e24d935c6c2c57093d1088fc` and event `push`.

| Push lane | Job | Artifact ID / exact name / archive bytes / API archive digest | Environment | TAP; timing µs | Receipt bytes / raw SHA-256 / self-digest |
| --- | --- | --- | --- | --- | --- |
| Linux Node 22 | `97124972827` | `9485733142`; `phase4-retrieval-qualification-Linux-node-22`; 5,258; `sha256:226e80daaede5269f2d4f28793fc481b4d15bf2cae811f7b78fd2f84cffe700b` | Linux x64; Node 22.23.2; SQLite 3.51.3; FTS5 true | 23/23, other totals 0; reporter 262,535,289; wall 262,573,402; eval 13,254,585; tune 168,288,556 | 5,064; `903e7bef914b78ffc8a6de7c1657506ef58c4a6893bd79c517867e50f26f97b5`; `sha256:b02b504fa950455c89ed1e7ddeeb333dcc7a70746097eb73401a72c73f17d01f` |
| Linux Node 23 | `97124972910` | `9485732487`; `phase4-retrieval-qualification-Linux-node-23`; 5,259; `sha256:37256967c41646d6e93733059ddefdff8ff2d6221b0d97ae060f9a66cfe058e2` | Linux x64; Node 23.11.1; SQLite 3.49.1; FTS5 false | 23/23, other totals 0; reporter 244,164,718; wall 244,197,824; eval 13,104,372; tune 163,231,065 | 5,065; `4c41c6e5ee2376ff6fc560c13bcdfb33cba86e99a1fbbdf2ed891559d7691010`; `sha256:d1d99b0c53023470ecc4f499127eb4f2a57f41f0ec5240d80cf15eb80f4371c1` |
| Linux Node 24 | `97124972988` | `9485706360`; `phase4-retrieval-qualification-Linux-node-24`; 5,258; `sha256:6c86ae9681efb5bc301e40b2b523e83828f5a903974162f7fa2faed56606c478` | Linux x64; Node 24.19.0; SQLite 3.53.3; FTS5 true | 23/23, other totals 0; reporter 202,689,634; wall 202,723,109; eval 10,394,719; tune 129,097,294 | 5,064; `c49d57861f99e973e9005ed8e3f95d7ac94dde8fd79b49348f52edcbb6f49d69`; `sha256:1c517413f5dfea16e41069a4f9e87b9f916198fcb0dd68a969b8506f2ee5b107` |
| Windows Node 22 | `97124972964` | `9485635618`; `phase4-retrieval-qualification-Windows-node-22`; 4,247; `sha256:bfbb7db94c98dcb5bba49fa936ecfd8d916c7316db1ac7dc95fbcf9a94564cc0` | Windows x64; Node 22.23.2; SQLite 3.51.3; FTS5 true | 49/49, other totals 0; reporter 10,343,267; wall 10,393,863 | 4,053; `de76cd5cdfe83eaf44be48411f2e7eb402e1a0bbd22238906bb1ff387bd5b9c6`; `sha256:9e251546de7d08536fb99f9a9b452cee47b2eb21e52236d658325ba598107fe9` |
| Windows Node 23 | `97124972932` | `9485630572`; `phase4-retrieval-qualification-Windows-node-23`; 4,246; `sha256:3b3245215554e6ecb4ad623db1fc7a70163d2549b06e842406abeddfa99f4821` | Windows x64; Node 23.11.1; SQLite 3.49.1; FTS5 false | 49/49, other totals 0; reporter 4,299,561; wall 4,366,443 | 4,052; `a309dc72e67ee058a6f69e70361ce9dd1a2b10c974d64a14b06a05ecc74eb24c`; `sha256:89d1f96d4e73fbc1099edd4c4640b583740b0ff223c6493ecf2a56f8971090b9` |
| Windows Node 24 | `97124973030` | `9485630194`; `phase4-retrieval-qualification-Windows-node-24`; 4,245; `sha256:1478ae159305b8dff3b8fb74191dc71b156c01c4ef5668840e97b4d08ca9f58a` | Windows x64; Node 24.19.0; SQLite 3.53.3; FTS5 true | 49/49, other totals 0; reporter 5,649,570; wall 5,713,831 | 4,051; `edc553d572bb39074bd17a2bef0dc56bc7b881ef7b17c1a3a13c96331b87d990`; `sha256:e6cee8ab76719481a3bb1c40f1c5acf78dd2e27758755d4b5f2409e68f14509f` |

PR receipt provenance correctly distinguishes the synthetic merge checkout and
event commit `f0b55eb92be701945bbb7733ad23e52b2b0ee7db` from exact source head
`67c3670892905681e24d935c6c2c57093d1088fc`; event is `pull_request`.

| PR lane | Job | Artifact ID / exact name / archive bytes / API archive digest | Environment | TAP; timing µs | Receipt bytes / raw SHA-256 / self-digest |
| --- | --- | --- | --- | --- | --- |
| Linux Node 22 | `97124977749` | `9485737280`; `phase4-retrieval-qualification-Linux-node-22`; 5,266; `sha256:ace3de5f2ac80b9bd325fa1db448a5aefbc3da0a2bbc0c9b6d0e3b71991ee8f7` | Linux x64; Node 22.23.2; SQLite 3.51.3; FTS5 true | 23/23, other totals 0; reporter 270,477,451; wall 270,511,812; eval 13,604,162; tune 173,524,902 | 5,072; `74307ead82393485c8c6d61f71c20d237281b3330594797951e0f34a0ba21174`; `sha256:48655e99be777a77380d9f909698f5becf10ba05c1e3e658bd68f24465a767c4` |
| Linux Node 23 | `97124977743` | `9485724333`; `phase4-retrieval-qualification-Linux-node-23`; 5,267; `sha256:ccdf7906f51562ebcd03d692f9c0029b1cf793b9ed78f72129efacaaa67f9a48` | Linux x64; Node 23.11.1; SQLite 3.49.1; FTS5 false | 23/23, other totals 0; reporter 237,162,737; wall 237,191,169; eval 12,581,494; tune 159,510,512 | 5,073; `60edb3a670b2b23db710814c83d4ff1069d5cd1efacc6c6a1f537ba6963802d5`; `sha256:869078b250d40682ec6e9b6bcc882ba6acdc2d80ba9ea848f40d4cf68de9a37e` |
| Linux Node 24 | `97124977756` | `9485733650`; `phase4-retrieval-qualification-Linux-node-24`; 5,266; `sha256:61be8d693614061c33d974c0cb3b42d7bd64851b7e94969d9593749f10ceb02a` | Linux x64; Node 24.19.0; SQLite 3.53.3; FTS5 true | 23/23, other totals 0; reporter 269,273,327; wall 269,309,049; eval 13,606,702; tune 172,764,540 | 5,072; `ec40fe93b654a197ce5cb1bc4dd45afa758b480e211c1c8fe4d07df0b84e1e65`; `sha256:fe6986a8019c0e38e9a8b43f39aac07e7b74b55bef8af6408b8878852aadb301` |
| Windows Node 22 | `97124977769` | `9485632392`; `phase4-retrieval-qualification-Windows-node-22`; 4,253; `sha256:2f491f7fad011ea0de6c36e82d2a3eec52d3177f23e315ccc65936538ef173b2` | Windows x64; Node 22.23.2; SQLite 3.51.3; FTS5 true | 49/49, other totals 0; reporter 7,200,675; wall 7,259,572 | 4,059; `3c1437d48ba0d37d05f7197a48d0851ba0c7d490f967ec5712ef54d2f02a0788`; `sha256:49ecabcfb5c9caa4cff951cd92c3b4f161e7ca00f9a827bae93854596f13d9d0` |
| Windows Node 23 | `97124977745` | `9485637578`; `phase4-retrieval-qualification-Windows-node-23`; 4,256; `sha256:ed76e51441e3fff9307c18e167d1257eadeee17509b2b136f120bf2877aac6f5` | Windows x64; Node 23.11.1; SQLite 3.49.1; FTS5 false | 49/49, other totals 0; reporter 22,339,049; wall 22,416,814 | 4,062; `5da9f60e186ae4c741bfbb7c1e685434307e0f33d575229717b0fb391b8aea32`; `sha256:bbd83478e76e2c1f4f2841215ddcc3f9b8aa3fa390d95c6de879db5cb3942136` |
| Windows Node 24 | `97124977683` | `9485631999`; `phase4-retrieval-qualification-Windows-node-24`; 4,253; `sha256:389a29a5eb19e9672590432469c0466cac87e0dda5425a73ed3dc1f36c09bac8` | Windows x64; Node 24.19.0; SQLite 3.53.3; FTS5 true | 49/49, other totals 0; reporter 6,431,311; wall 6,502,957 | 4,059; `b21f9ab4cf4e61d8c7c2b1b1f84a33f648afbda92bd72e4c5de75d28d9034bcf`; `sha256:5dea25c14db901a7f4f4c39f27837e1e8370754fed65df09524180851133a184` |

## Publication-eligible manual Observation

Registered CI workflow `316331330` was manually dispatched at the exact branch
and required head input. Run
[32611873425](https://github.com/Odenknight/GKOS-Engine/actions/runs/32611873425)
has event `workflow_dispatch`, head
`67c3670892905681e24d935c6c2c57093d1088fc`, and terminal result **SUCCESS
7/7**. Observation job `97126120700` passed the head bind, typecheck/build and
release gates, external private runner bundle, frozen immutability gate,
owner-private artifact root, real FTS5 10k observation, pinned upload, and final
clean-tree check.

The Observation receipt is `status:"pass"`, has no failure code, and is
`publication_eligible:true`. Its source receipt binds
`checkout_commit == source_head_commit == event_commit ==
67c3670892905681e24d935c6c2c57093d1088fc`, event `workflow_dispatch`, clean
committed provenance, and equal checkout/committed runner SHA-256
`c5a3a88b4d4730a301fdd760678f26ed6218d68c34f1d5b32b78c9e31fb42e8f`.
The observed environment is GitHub-hosted Linux x64, Node 24.19.0, SQLite
3.53.3, backend `sqlite_fts5`, with physical FTS5 available.

Artifact `9485752975`, exact name
`phase4-retrieval-observation-32611873425-1`, is a 20,000-byte API archive
with digest
`sha256:b5727c85d47bd0c8d8adb9c1e0ee86644203f26b8fe00fd02bee97d4977efeed`
and contains exactly three files:

| File | Bytes | Raw SHA-256 | Bound internal coordinate |
| --- | ---: | --- | --- |
| `performance-sample-plan.json` | 11,915 | `151536ab669c5401eb8cf470ddd06e1eb2721952f3838e1e70d055e4caa7fc52` | compact eight-key material is 9,449 bytes; `sha256:7852c24bc2eeb057f3ae9ccfaf4b03c72e75b6556609dac7673e5626f238a534` |
| `observation-receipt.json` | 6,752 | `64ffd9cebf6bec96c253039d74be973c0dea95ede37299ee7f432a70d1d2c4ff` | `sha256:be840e1750b69f398467e89b2c8cce2719b1311f20374e832de2706117657d48` |
| `observation-report.json` | 885 | `a83fb67d03c54d4600a40643186650f4b4949c787ed47e78fc27b13d33fed0c5` | `sha256:1d33d0a1acecbc2f5a670ea96ee39b8d6a2e656446ede21f7d518306668eba9f` |

All three are recursively key-sorted pretty JSON with LF-only bytes and one
terminal LF. Independent post-download recomputation verified the receipt,
report, sample-plan, and sample-vector preimages; exact file count/size/raw
hashes; report binding; nearest-rank percentiles; terminal provider/query
ledgers; and convergence.

### Fixture, index, query, and convergence observations

| Observation | Exact result |
| --- | --- |
| Fixture | 1,000 sources × 10 sections = 10,000 chunks; deterministic fixture `sha256:e18741ea37bcaefdc981ab5b5b1b768ca0e1878f32a8f3e31f4324aad4244aa4` |
| Mutation | Global chunk 5,555; source 555 section 5; `revisionalpha` → `revisionomega`; one content digest and ten source chunk records changed |
| Initial index | 313 calls / 10,000 items; request sequence `sha256:972275154f0526defa4afd300d0acfd310a488efe074750b7e08bf7e5d9ef4d5`; projection `sha256:1f7d014b0dd57096f6437e1c446bcabe8a222fee62be984b1e0d4e7dddab5cb2` |
| Incremental update | 1 call / 1 item; 1 reprocessed / 9,999 reused; request sequence `sha256:531d5ad686a8ce5b49b2884a9b0f5ed500de4a6a72f5493759f65a5bc4967965`; projection `sha256:a65e3710f614da0a33a2913e909c682d8485619f72f0954c86395b501202f5f8` |
| Clean rebuild | 313 calls / 10,000 items; request sequence `sha256:d76bfae77f73bace73bde6d305b6103479093145d8283528721b5929cb32fcbb`; projection `sha256:a65e3710f614da0a33a2913e909c682d8485619f72f0954c86395b501202f5f8` |
| Index/update time | 2,948,447 / 4,556,431 microseconds; not contractual limits |
| Incremental query work | 60 attempts, 60 embedding calls/items, 60 real FTS query stages, 0 rerank, 0 query-cache hits, 60 stage assertions / 0 mismatch; attempt set `sha256:38719d802bb4e5f0294dae4d4b76ceac3ec6452a2db431abace9ca0aed9cfd03` |
| Clean comparison work | 10 attempts, 10 embedding calls/items, 10 real FTS query stages, 0 rerank, 0 query-cache hits, 10 stage assertions / 0 mismatch; attempt set `sha256:02a8a8d8f0d854689ce4f34b0967e02b2a8b7d1fc30c3b8ebddcdac2d15f06f1` |
| Latency samples | 10 warmups + 50 measured; sample vector `sha256:16baa41cb6b41518f6c6c1aabf398b1fae10be3af4e0f99ab20e117bdd84d671` |
| Nearest-rank percentiles | p50 150,969 µs; p95 165,707 µs; p99 172,256 µs; strict p95 `< 500,000` µs PASS |
| Convergence | Incremental and clean manifests byte-equal; projection digest equal; final result-set digest both `sha256:902c129e05397952edf3a34edeb2e2e70a394d6415038717bc002ab0cbfce92e`; all six incremental occurrences/query identical |
| Offline/cache | Network/process denial families all zero; external cache reads zero; query cache hits zero |

## Manual-run ancillary qualification artifacts

The same exact-head dispatch completed all six ancillary jobs. Each downloaded
receipt was independently re-rendered and digest-checked after the run. Every
receipt is `status:"pass"`, has no failure code, and binds checkout, source
head, and event commit to `67c3670892905681e24d935c6c2c57093d1088fc`.

| Lane | Job; artifact ID / exact name / archive bytes / API archive digest | Environment | Exact TAP result | Wall / named work (µs) | Receipt digest | Raw receipt bytes / SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| Linux Node 22.23.2 | `97126120636`; `9485828145` / `phase4-retrieval-qualification-Linux-node-22` / 5,270 / `sha256:0d527b8c45e1197d574ac7c0833a1e3bf338eda02ae7c1c51cc37635415a2e9f` | Linux x64; SQLite 3.51.3; FTS5 true | 23/23; fail/cancel/skip/todo 0 | 189,520,836; eval 9,903,172; tune 119,546,533 | `sha256:9209f6a19714cd9f5af666f6fee0bcc7c9002237adc3e8e75a7b0d0a84b1171e` | 5,076 / `720c15fece73a7e600ebb9778aa8af6dd6ece6f2ccc7caf870a9976fc4bf8aa4` |
| Linux Node 23.11.1 | `97126120518`; `9485829642` / `phase4-retrieval-qualification-Linux-node-23` / 5,272 / `sha256:1d18a87ca04b4bd78fcc01621cffc29a490d2a1a500161c2343587a9bc627d9f` | Linux x64; SQLite 3.49.1; FTS5 false | 23/23; fail/cancel/skip/todo 0 | 198,745,139; eval 10,310,115; tune 133,867,735 | `sha256:47651b3e2e8b9b3a719b13af5e875efa91c1524345694bdb9b3d4eca8a10c229` | 5,078 / `2ab348fcc95795f7184987fcbb02221954dab58182a3c0415f62072bfb75ff48` |
| Linux Node 24.19.0 | `97126120625`; `9485834944` / `phase4-retrieval-qualification-Linux-node-24` / 5,271 / `sha256:a76a06469fbf2cfd13736c54aed7fb12d195d03b2bdde5e890c87be0e5aaef13` | Linux x64; SQLite 3.53.3; FTS5 true | 23/23; fail/cancel/skip/todo 0 | 210,602,338; eval 10,436,441; tune 135,960,649 | `sha256:03da12dbd3345fda0ee16c231993523fabde03ce1ebf927c96ef250f7bfe4f08` | 5,077 / `d24014ad7a0e9e399ed51fe232390b13de1101b1bf86203333115cc4418177da` |
| Windows Node 22.23.2 | `97126120623`; `9485754752` / `phase4-retrieval-qualification-Windows-node-22` / 4,258 / `sha256:3a51fb947248e42a0fac76b86010ccdef7c3a08f1a45f7c8ae220b43a58098b9` | Windows x64; SQLite 3.51.3; FTS5 true | 49/49; fail/cancel/skip/todo 0 | 5,452,856 | `sha256:d3c12d1bbfb8a97ba9725f599d0ab717cfa01c4d0949b449dad39646c170b040` | 4,064 / `3889a55f94f966cfe8df04956b25c1205c87b58b070836ffedab7bc36d8f2392` |
| Windows Node 23.11.1 | `97126120603`; `9485756789` / `phase4-retrieval-qualification-Windows-node-23` / 4,259 / `sha256:0406f3c04894fd9939b5abe89e9953804a130fe98fca644b7d57951141d4be17` | Windows x64; SQLite 3.49.1; FTS5 false | 49/49; fail/cancel/skip/todo 0 | 6,080,253 | `sha256:55ba1342d9cf980cd57c8014b46710c8f7d268bb6a984133ae23a53966050d4f` | 4,065 / `8856e65a0d683e277ae82d9f5090a992f1ac8bcc81bbb847e2611cd2add50eec` |
| Windows Node 24.19.0 | `97126120660`; `9485756358` / `phase4-retrieval-qualification-Windows-node-24` / 4,260 / `sha256:dd996160986b2aebc1962c727a7d63861c22326100a235008414d09287b5ae99` | Windows x64; SQLite 3.53.3; FTS5 true | 49/49; fail/cancel/skip/todo 0 | 10,190,514 | `sha256:34bb86be74f0aaaf56d4bfed6acfc35305cd1408396ac45803e76eaafc0cde5e` | 4,066 / `ecd5f86f955bad2e6cd3c7d7e0b1f4035caf4d1d01797f0ac23cf4942cd1eece` |

All six receipts bind supplementary sample-plan digest
`sha256:b37749ee2302fa5086769aa81234f89a4b180e7f2569a18d19c86178da8fb83d`.
Each Linux receipt additionally binds the one physical-absence pair digest
`sha256:3939b4d906b0b358cb41cade641b9407e0e014b2288cfe275e79853e120e732e`,
comparison digest
`sha256:44333a25dc9c40a10e09316a3da2183fd2cb28b19736f269d410727fe1f5f3ae`,
and tune-selection digest
`sha256:7dc97fbdfe7c0d489622f17f1b1e0ed7b629c5d562f05a5c9b35ed6dd7a2d0e4`.

Linux Node 22 and 24 physically reported FTS5 available; Node 23 physically
reported it unavailable. All three still execute the exact scan-backend
reviewed fixture with its separately sealed deterministic presentation
coordinate. Only the authoritative Observation job uses real `sqlite_fts5`,
and it ran on FTS-capable Linux/x64 Node 24. Windows receipts require and prove
both the distinct alias and short-path fixtures; there is no skipped or waived
49th case.

## Lite hosted qualification and reciprocal review

Lite's final Slice B evidence head
`d1c0d5d60e5380d4c1cb9fb1562585852307e657` is the exact head of draft PR #19.
Exact-head run
[32602357316](https://github.com/Odenknight/GKOS-Engine-Lite/actions/runs/32602357316)
passed all eight jobs: Rust MSRV `97102477273`, Windows MSVC `97102477292`,
desktop `97102477302`, Node 22 `97102477321`, Rust latest `97102477358`,
desktop-native `97102477364`, Node 24 `97102477403`, and Node 23
`97102477431`.

Lite then remained read-only while reviewing Full Slice C. It independently
reconstructed the 9,449-byte SamplePlan digest, checked the Observation receipt
and terminal work algebra, replayed the focused fixture/generator/workflow
tests, verified the EOL correction in a fresh `core.autocrlf=true` checkout,
and structurally projected the manual bridge against the unchanged standalone
job. It issued terminal approval before each Full publication action and did
not edit, stage, commit, or push Full bytes.

## Final local and hosted gates

| Gate | Exact result |
| --- | --- |
| Slice C focused tests at bridge freeze | PASS; 12/12, 0 fail/skip/todo |
| YAML and bridge structural projection | PASS; exact required input/job/bind/concurrency/upload; standalone job equality after only ratified bridge deltas |
| TypeScript no-emit and deterministic build | PASS |
| Dry package | PASS; 337 files; 1,523,625 packed bytes; 11,102,406 unpacked bytes; SHA-1 `6a13426457ad358d1dbda7064bd4c01f033b58fe`; integrity `sha512-iobInxFltc9zvtYqdzqzcAtYq1Gj70N7MYslWzGhNzDtzRZ33vQZoSyodwajfZNfvioP3iIRJ/WGXC/L+U7gEw==` |
| License and nomenclature | PASS; Apache-2.0 consistent; zero unapproved legacy matches |
| Slice A pack | PASS; 37 files / 4,948,463 bytes; zero diff from `cac029a5b570135b26f3585bc86f4c9beb00c36d` |
| Slice B/public protected paths | PASS; zero diff from `ed3a7552b1d4a705c1b1a722b07255e89ec42186` |
| Phase 0–3 contract/evidence paths | PASS; zero diff from `5396d46d497ff4ba952039d8aadef3049d767809` |
| Exact-head ordinary hosted matrix | PASS; push and PR each six applicable jobs; Linux 23/23 and Windows 49/49 receipts |
| Exact-head manual hosted matrix | PASS; seven jobs; six qualification receipts plus publication-eligible Observation artifact |
| Hygiene | PASS; clean qualified head before this file, staged diff empty, package archives/task-temp residue absent, `git diff --check` clean |
| Evidence closeout scope | PASS; exactly this one untracked file |

## Final authority and publication disposition

Phase 4 qualification did not activate a retrieval generation, change source
bytes, modify live configuration/state, read credentials, use a network
provider, publish a cache, or expose private host authority. The 10k corpus,
provider vectors, SQLite databases, query results, and temporary roots were not
uploaded. Only bounded canonical receipts/report/sample-plan artifacts were
retained by GitHub Actions.

The standalone daily Observation workflow remains unchanged and becomes a
default-branch scheduled authority only after a separately reviewed merge. The
pre-merge bridge proves the same job at the exact signed feature head but does
not authorize merge. This DONE closeout authorizes no tag, release, deployment,
npm/package publication, service restart, provider provisioning, or production
activation. None occurred.
