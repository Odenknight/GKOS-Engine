# Engine T01 candidate — reference freshness and snapshot integrity

Status: implementation ready for orchestrator verification; not a release or TypeScript-completion claim. Priority: Stability > Reliability > Fidelity. Source and tests remain local and uncommitted.

## Exact scope and baseline

- Audit source: `orchestration/2026-08-31/engine-audit/engine`, clean HEAD `8207958047b3361ae21ac07c5a2abbd26a42a684` at candidate creation.
- Candidate: `orchestration/upgrades/engine`, created by `git clone --no-hardlinks` from that source. Neither the dirty top-level checkout nor the historical audit sources was edited.
- Owned runtime changes: `src/service/mcp.ts`, and the root-approved one-field policy-digest handoff in `src/service/server.ts`. New runtime regression file: `test/service-reference-freshness.test.mjs`. Root independently owns CI/package/current qualification files in the same candidate.
- Q-SCOPE and Q-GUARD approvals and roadmap T00/T01/T12 were read. The source audit report was read, including the two synthetic reproductions and Lite compatibility limits. No applicable AGENTS.md was found in the project search; prior audit also records none in ancestor/repository scope.
- `ENGINE-T01-doc-inventory.json` enumerates all 93 project-authored Markdown files recursively in the audit tree, with exact SHA-256 and byte size. Dependency `node_modules`, `.git`, and `target` trees are excluded. Review is honestly classified: all files received inventory and heading/status/decision-excerpt screening; controlling/current identity, navigation, parameter, service, and Lite capability documents received detailed reads. Historical evidence bodies were not exhaustively re-audited. Identical vendored contract documents remain separately inventoried rather than counted as independent authority.

## Implementation

Every record-ref consumer (read, validate, assess, lineage) checks one shared binding: issued session, generation, current authorized node/admission identity, policy context, and exact supplied source bytes. Deleted, moved, hidden, malformed, duplicate, foreign, or changed bindings refuse without revealing target metadata. The actual authorization policy digest now enters internal MCP context; the prior fixed decision ID alone could not detect same-generation policy drift. No authorization outcome or route is changed.

Graph-only hosts retain their unchanged record operations. Their binding uses the authorized graph identity, without pretending absent raw source bytes were verified. Content reads remain unavailable when no source adapter exists. Source-backed identity excludes generic reconstructed filesystem `createdAt`/`updatedAt` scan clocks; authored validity/projection identity and exact source bytes remain bound. The host still must supply a coherent authorized snapshot: this is not a filesystem reread or live-vault freshness guarantee.

Temporal and lineage continuations bind the actual authorized ordered candidates and available source fingerprints. Audit continuations bind authorized source artifact, actual config, policy, and ordered findings. Discovery retains its existing source/query binding and adds internal policy/config binding. Cursor state retains only bounded digests; the existing 8,192-reference/cursor limits are preserved. An unavailable or invalid supplied candidate source cannot yield an apparently valid fingerprinted snapshot.

Stable-state success bytes are preserved. Original record/cursor preimages, shapes, capabilities prose, result-digest algorithms, and default calls remain unchanged. New internal fingerprints never appear on the wire. When an original ref preimage already belongs to a different identity/policy, fresh issuance uses an additional identity binding and does not overwrite the old ref. All historical golden fixture/test bytes remain untouched.

## Red / rework / green evidence

All commands ran against synthetic local fixtures on Windows, Node `v24.18.0`; no live vault, provider, model download, remote write, release, tag, or production effect was used. Existing dependency bytes were copied from the audited Engine node_modules; this was not a fresh online install or supply-chain qualification.

| Run | Result | Evidence |
| --- | --- | --- |
| Initial baseline build in sandbox | Environment failure: esbuild could not read an ancestor directory; subsequent tests had no built module | `evidence/engine-t01-baseline-build.log`, `engine-t01-baseline-tests.log` |
| Exact baseline source, scoped escalated build and first 16 new regressions | Build passed; 5 pass / 11 fail / 0 skip. Failures include unchanged-generation content/UID/policy and temporal content/delete/insert/rename/UID/admission/policy continuation | `evidence/engine-t01-baseline-build-retry.log`, `engine-t01-baseline-tests-retry.log` |
| First candidate, expanded test fixture development | 33/40 passed; seven audit setups failed because duplicate IDs generated only one aggregated finding, thus no cursor. Corrected synthetic setup to produce three missing-stable-ID findings | `evidence/engine-t01-expanded-tests.log`, `engine-t01-expanded-tests-retry.log` |
| First substantive focused delivery | 96/97 pass / 0 skip. Existing PR37 successful-byte golden failed. Root rejected this delivery; no golden was changed | `evidence/engine-t01-focused.log` |
| Compatibility rework | 97/97 pass / 0 skip, including unchanged pre-PR37 successful operation bytes and digests | `evidence/engine-t01-rework-build.log`, `engine-t01-rework-focused.log` |
| Final standalone regression file | 46/46 pass / 0 skip | `evidence/engine-t01-final-regressions.log` |
| Request-indexing development check | Eager indexing accessed source state before one semantic refusal, caught by the existing parameter regression (102/103). Indexes were made lazy; this intermediate failure is retained | `evidence/engine-t01-indexed-focused.log` |
| Final nine-file focused suite, lazy request-local indexes | 103/103 pass / 0 skip; direct test command exit 0 | `evidence/engine-t01-lazy-focused.log`, `engine-t01-lazy-command-exits.json` |
| Integration packaging EOF hygiene rework | Removed only the trailing blank CRLF from the new regression file; `git diff --check` clean; rebuilt; focused suite 103/103 and current runtime gate 6/6, both 0 skip | `evidence/engine-t01-eof-rework-build.log`, `engine-t01-eof-rework-focused.log`, `engine-t01-eof-rework-runtime-gate.log` |
| Final TypeScript check | `node node_modules/typescript/bin/tsc --noEmit`, exit 0 | `evidence/engine-t01-lazy-typecheck.log`, `engine-t01-lazy-command-exits.json` |

The focused command was `node --test test/service-reference-freshness.test.mjs test/service-content.test.mjs test/service-runtime.test.mjs test/service-authorized-view.test.mjs test/service-secret-canary.test.mjs test/service-retrieval.test.mjs test/service-contracts.test.mjs test/service-param-errors.test.mjs test/service-multiclient.test.mjs` after `node scripts/build.mjs`. Counts overlap; do not add them into a coverage total. Early compound shell completion codes were not test exit codes: retained test logs report their failures; final per-command exit codes are explicitly captured.

The 46 new tests cover all four record consumers, raw content/title/UID/rename/delete/admission/policy/generation changes, fresh re-resolution, repeated policy/path reuse without reviving stale refs, exact ordered temporal/lineage continuation, audit source/config/policy changes, foreign/cross-agent/expired sessions, stable page reassembly, hidden-source noninterference, source-order invariance, graph-only hosts, missing/duplicate/malformed sources, safe denial event paths, page bounds, and actual 8,192-record storage exhaustion without eviction of accepted refs. HTTP fixtures use real authorized-view reconstruction. Direct runtime fixtures explicitly supply synthetic authorized lineage topology and malformed adapter states; they are not claims that a live producer creates those states.

## Bounded performance check

Root identified repeated per-candidate `notes.find` and `sourceRecords.filter` scans. A synthetic 8,000-authorized-node temporal query with page limit 1 took 1,111 / 811 / 739 / 708 / 685 ms in five consecutive local runs. Lazy request-local maps reduced those same runs to 214 / 196 / 188 / 196 / 199 ms. Duplicate-source detection is preserved, invalid parameter/refusal paths do not eagerly access sources, and there is no cross-request cache. This is a bounded local overhead comparison, not an independent benchmark, client latency measurement, or distribution performance guarantee. Fixture and raw timings are retained in `evidence/engine-t01-perf-probe.mjs`, `engine-t01-perf-before.log`, and `engine-t01-perf-lazy.log`.

The internal execution context does not declare a global graph/sourceRecords count ceiling; those collections are supplied by the host. The existing content-read/search aggregate limits are distinct (default 2,000 files, 1 MiB per file, 8 MiB total), and a single note read has a 64 MiB guard. This packet does not silently impose the content aggregate ceiling on graph-only temporal/lineage queries. New lookup storage is linear in supplied note/source coordinates for that request; source hashing remains proportional to selected candidate bytes. Full snapshots must be inspected to validate continuation even for a one-row page. No million-record or sustained concurrency qualification is claimed.

## Remaining gates and limits

- Root must independently review the exact changed-file hashes and repeat regression/current qualification. Root owns historical/current CI separation and whole-suite receipt production; this report does not preempt their result.
- Root will normalize candidate working-copy CRLF to repository LF before the final manifest. The implementation ledger records its capture hashes; root's explicit final source manifest supersedes any EOL-only difference. The initial clone inherited system `core.autocrlf=true`; neither source audit nor frozen evidence bytes were rewritten.
- Node 22/23, Linux/macOS, hosted CI, production/native-client behavior, long-running soak, and full supported-platform qualification were not run by this implementation packet. No unsupported lane is labeled passed.
- The underlying audit bugs are synthetic same-generation host-mutation cases, not demonstrated live incidents. Hosts that always advance generation may hide this precondition.
- Source-byte reads remain limited by the existing 67,108,864-byte single-read guard. Invalid supplied source adapters fail closed rather than become verified source snapshots. No new global corpus-size or throughput claim is made.
- Exact final TypeScript oracle/release coordinate and production/cutover authority remain separate decisions. Audit report package/tag/main mismatch is not repaired by this change.

## Next low-risk Lite packet, identified only

Selectively reconcile draft #21's truthful REST quick-connect snippets (including Windows `curl.exe`), installed-Engine compatibility validation, settings/assist command boundaries, and npm/native/Rust pin matrix. Current Lite npm pin is `e7cc0dd478af3d0bda216c5258dec5f77932def7`; native CI asset and Rust contract pins are different coordinates. The pinned GET-only sidecar must not advertise `/mcp`. Preserve projection-only standing and Full resubmission guidance; prove actual packaged routes before claiming interoperability. Do not wholesale merge #19/#20/#21 or mechanically repin to Full main. No Lite code was changed here.

`ENGINE-T01-ledger.json` records runtime file hashes, source tree, reviewed-source inventory digest, commands, failures, limitations, and log hashes. It is an implementation ledger, not a qualification receipt or independent review.

The post-rework regression-file SHA-256 is `32fb64252166c099ba6027c4ca7295b4a80496da6cfdc1b5186a769a603ef761` (18,060 bytes). The regenerated current change-inventory SHA-256 is `a31c3500579499439c24f8c4b5e6e2a16a70d9901a35c1aa7b2cea20e04bb0a8`. The first runtime-gate attempt was refused by Git's Windows ownership safety check under the escalated account; the recorded passing rerun used a process-local `safe.directory` setting and did not alter global or repository configuration.
