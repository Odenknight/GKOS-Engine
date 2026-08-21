# GKOS-Engine functional uplift — Phase 1 qualification evidence

Date: 2026-08-21

Repository: Odenknight/GKOS-Engine

Phase scope: Full TypeScript reference retrieval implementation and the
machine-readable contract consumed by GKOS-Engine-Lite

Final Phase 1 terminal state: **DONE**. The Full and Lite implementation
commits are published to their focused draft pull-request branches, reciprocal
review is complete, and every required hosted Phase 1 qualification job is
green. This state closes implementation qualification only; neither repository
has been merged, tagged, released, deployed, or activated in production.

## Exact implementation coordinates

| Coordinate | Value |
| --- | --- |
| Original inspected Full baseline | 2fbd4ec68ec825b09e5194c9878a7ae90a281392 |
| Phase 1 branch | codex/phase-1-retrieval-core |
| Phase 1 base | ba918e6617ece6bb1392f6768b69d4913818035d |
| Final Full implementation qualification commit / draft PR #26 head | bbc2ea874f4dde37e6376e46c080cb1c69ab1bb3 |
| Final Lite implementation qualification commit / draft PR #16 head | 08233ffa08822a4568f89082a0fae26bdf3b01d3 |
| Evidence-only closeout head | Not yet assigned. This file is the sole uncommitted evidence delta on top of the qualified implementation commit; any later evidence-only commit records this outcome and is not an implementation prerequisite. |
| Worktree disposition | Qualified implementation at bbc2ea874f4dde37e6376e46c080cb1c69ab1bb3 plus this unstaged evidence-only closeout |
| Full package | gkos-engine 2.1.2 |
| Node / npm | v24.18.0 / 11.16.0 |
| Local platform | win32 x64 |
| Standard pin inherited from Phase 0 | a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6, current publication v0.79 |
| GrooveSeek study pin inherited from Phase 0 | 313514b793d12ea5c3b8eedc32fd213212e38d75 |

The implementation qualification coordinate is permanently the Full commit
shown above, even after a later evidence-only commit advances the branch. This
separation avoids making the evidence commit's own unknown SHA a prerequisite
for the qualification it records. Draft PR #26 remains open and unmerged. No
force-push, amend, tag, release, deployment, or production publication occurred.

## Frozen contract coordinates and hashes

The Full repository is the TypeScript reference implementation. The
owner-ratified static Lite path is a pin-bound Rust adapter that must conform to
these semantics and must never become a second GKX authority.

| Coordinate | Value |
| --- | --- |
| Retrieval contract | gkos-retrieval/1.0.0-draft.1 |
| Result schema | gkos-retrieval-result/1.0.0-draft.1 |
| Heading chunker | gkos-heading-chunker/1 |
| Tokenizer | gkos-ascii-whitespace/1 |
| Projection schema | 2 |
| Preferred lexical backend | sqlite_fts5, selected only after a real virtual-table probe |
| Compatibility lexical backend | sqlite_lexical_scan / gkos-unicode61-subset-scan/1, explicitly degraded |
| Host configuration version | 1 |
| Trusted TOML lexical profile | gkos-toml-subset/1 |
| Default RRF k | 60 |
| Default MMR lambda | 0.7 |
| Default parent-expansion child threshold | 80 tokens |
| Maximum chunk content | 16384 UTF-8 bytes |
| Default returned text budget | 131072 UTF-8 bytes |

The final nine-file pack was byte-hashed after the final fixes and reciprocal
review:

| File | SHA-256 |
| --- | --- |
| README.md | 2028882032f2292bd0bbc937016a128449babf5f9adc395824029ee0047cc942 |
| canonical-fixture.json | f30dd5c3e71407e6544b9c727ff5597c4809936dbbd14a5fdca87dcb99031db2 |
| chunk.schema.json | 2474a40e8abc930cbc6e713aa8966be41f0fba87c5b38c5868b42403e8f3f721 |
| conformance-fixture.json | 462de9f327585ec2eed019a4b728403b6c0bbfa3ade158ed618cafd214a4b009 |
| contract.json | 418fffcf3954c634453c3f3e8dd756dd2636ee0030d9ecf6c4ccb5147b8d0c6e |
| gkos-config.schema.json | e42fe89d102ec602b0738aa01a3c8f98cc8fb55d9edc25265f6feb168a0ca8d6 |
| gkos-toml-lexical-fixture.json | abdb26527fd5c047db96801c22ebf30efca544fe306744c666b858ba57bd039b |
| projection.schema.json | 99f7eb70530dd44866c8c28b71f97d9d76af2e00b8ea399dc4f2e5f3e6467fa3 |
| result.schema.json | b9bb7e360fa04ee1e0b75984d313cd63488ef698149ff0b3f29b3c003126faa3 |

The hashes above supersede the earlier nine-file manifest. Lite independently
verified all nine exact bytes and their single terminal LF after Full review.
The revised cross-language fixtures cover
chunk bytes and identities, canonical JSON, normalized paths, timestamps,
lexical scoring, preferred/fallback lexical stages, a fixed FTS5-versus-scan
differential corpus, strict query grammar, RRF, duplicate collapse, MMR
including negative cosine handling, rerank-to-MMR ordering, overlap citation
de-duplication, Unicode glob behavior, parent expansion, and citation
normalization.

## Implemented Phase 1 scope

The implementation is additive and remains outside src/navigation:

- a dedicated `gkos-engine/retrieval` package subpath, declaration surface, and
  Node-platform bundle, without adding Node SQLite or filesystem imports to the
  platform-neutral root bundle;
- a deterministic Markdown heading chunker with stable canonical-UID-based
  chunk identities, configurable token limit and overlap, exact UTF-8 byte and
  LF/CRLF line coordinates, fenced-code handling, deterministic paragraph
  splitting, and a hard per-chunk byte bound;
- strict plain-data source and chunk envelope validation before derived-state
  creation, including rejection of coercive arrays/strings, accessors, symbols,
  exotic prototypes, unknown top-level source fields, unsafe numbers, malformed
  known metadata, and noncanonical JSON values;
- an owner-protected SQLite derived store with explicit schema version,
  feature-probed `sqlite_fts5` preference, and a dependency-free
  `sqlite_lexical_scan` compatibility backend for bundled runtimes without
  FTS5; the actual backend binds the manifest, projection digest, generation
  filename, physical schema, stage status, and configuration digest;
- complete manifest and projection verification, foreign-key and integrity
  checks, exact lexical-row verification for both schemas, all-or-none vectors,
  read-only published generations, WAL/SHM quarantine,
  hard-link/symlink/parent-alias rejection, bounded active pointers, atomic
  replacement, and verified prior-generation embedding reuse;
- exact structural parent binding: a child may reference only the first chunk
  of its nearest actual structural ancestor; sibling, distant-ancestor,
  non-first-part, missing, and extra parent bindings fail before state creation;
- lexical-only retrieval as a complete default path, typed pre-ranking filters,
  source-record-atomic policy handling, deterministic RRF and MMR, duplicate
  collapse, reranker-aware relevance, bounded parent expansion, stage scores,
  reason-coded confidence, and deterministic result-text limits;
- exact live citation verification before scoring, including source digest,
  byte slice, absolute lines, Unicode/combining-mark mapping, stale-source
  suppression, and overlap-span de-duplication;
- strict result redaction for unresolved relationship identifiers, unknown
  metadata, and agent/MOC identifiers; the corresponding identifier filters
  remain unavailable until an authorized endpoint resolver exists;
- trusted `gkos.toml` discovery with explicit-path, explicitly trusted CWD,
  external workspace, then user/XDG precedence; untrusted vault configuration
  cannot redirect credentials, providers, endpoints, model/executable paths,
  service binding, or policy;
- an additive `gkx search` command with `--kb-path` and `--limit`, lexical-only
  operation, whole-record rejection, safe source-alias handling, and lazy
  loading of the retrieval bundle so legacy CLI startup remains unchanged; and
- compatibility and architecture tests that retain every existing package
  export, CLI route, deterministic artifact, REST shape, and Navigation
  authority boundary while recognizing the explicitly additive search help.

No source-content write, automatic relationship inference, MOC application,
identity assignment, or supersession inference was added.

## Provider-neutral routing status

Provider selection is trusted-configuration-only and supports three equal
families: `openai_compatible`, `local_onnx`, and `mcp`. The ranking code has no
provider preference, domain allowlist, vendor allowlist, route allowlist, model
allowlist, or silent fallback across embedding spaces. Arbitrary
operator-selected endpoints, models, local paths, and MCP tools remain possible
when supplied through trusted configuration.

Every configured or injected embedding and rerank call has an effective
bounded deadline. Response count, correlation where required, model identity,
dimensions, unique indexes/IDs, and finite values are validated before use.
Operational embedding failure reports lexical-only degradation; an absent or
failed optional reranker reports a skipped/degraded stage. Provider, model, or
dimension mismatch is a hard controlled-rebuild error. Persisted vector-store
read or corruption errors also remain hard errors and are never relabeled as
provider unavailability.

There is no provider-specific adapter, restriction, route, fallback, or other
privileged behavior in the implementation, contracts, CLI, tests, or build
surface. A final case-insensitive scan for removed provider-specific language
returned zero matches. No provider service was provisioned, restarted, or
mutated.

Resolved credentials are never returned by the public configuration API and
are retained only in runtime-private provider state. Sentinel tests prove that
provider instances, public exports, inspection, JSON serialization, ordinary
stringification, and error paths do not reveal a resolved token. Query text,
note content, snippets, routes, and credentials are absent from ordinary
provider debug output.

## Reciprocal review and debugging evidence

Full and Lite owners reviewed one another's complete Phase 1 deltas. The
review loop found and corrected material issues before this evidence record:

- portable path segment validation and cross-language Unicode glob semantics;
- invalid sensitivity/filter shapes, vault binding, canonical timestamps, and
  hidden identifier filter oracles;
- provider response correlation, dimensions, indexes, nonfinite values,
  deadlines, cancellation, configuration identity, secret handling, and hard
  embedding-space mismatch behavior;
- immediate parent foreign-key ordering, source-ID conflicts, orphan/partial
  vectors, incomplete projection digests, FTS tampering, manifest duplication,
  integrity checks, immutable read-only generations, SQLite sidecars,
  permissions, aliases, and bounded pointer reads;
- policy-before-retrieval behavior, source-record atomicity, parent
  authorization, rerank-to-MMR ordering, eligible counts, stale-citation
  refill, returned-content bounds, overlap de-duplication, normalized Unicode
  citation spans, and exact absolute line verification;
- trusted configuration provenance, strict dependency-light TOML parsing,
  endpoint and token hygiene, provider-only-by-config selection, and rejection
  of vault-local workspace privilege escalation;
- canonical JSON collisions, unsafe integers, invalid Unicode, sparse arrays,
  undefined/accessor/symbol/exotic values, and strict nested chunk shapes;
- public raw SQLite/search/citation bypasses and relationship-bearing result
  metadata leakage;
- a CLI default-limit defect, source hard-link pre-publication rejection, and
  accidental filesystem-derived temporal aliases; and
- final late findings where provider errors had swallowed vector-store
  corruption, `chunkMarkdown` had coercively accepted malformed source
  envelopes, and parent IDs were not bound to the nearest structural
  ancestor's first chunk; and
- PR #26's Node-23-only failure, where the actual bundled SQLite lacked FTS5.
  The correction feature-probes a real FTS5 virtual table, binds the selected
  backend to projection identity, and provides a policy-pruned ordinary-SQLite
  scan that reports degraded state rather than making a false FTS5 claim.

Each pre-PR finding received a focused regression before the full gates were
rerun. The Lite owner performed the prior narrow reciprocal review,
independently ran the retrieval core/store command at 35 passed and 0 failed,
and returned APPROVED with no remaining blocking, high, or medium finding. The
same owner then reviewed the final Node-23 compatibility correction, verified
all nine revised contract hashes, TypeScript no-emit, current-runtime CLI and
compatibility suites, and Node 23.11.1 focused retrieval/CLI at 43 passed and 0
failed, and again returned APPROVED with no blocking, high, or medium finding.

The Full owner also completed read-only reciprocal reviews of Lite's final Rust
delta and its exact Full-pin/Windows-path follow-up. Those reviews confirmed
exact contract bytes, strict TOML and trusted configuration behavior, live
byte/line citation sealing, hidden-ID rejection, secret-safe Debug surfaces,
coordinator-only store access, provider-neutral selection and deadlines,
immutable action pins, MSRV/current CI jobs, the exact Full implementation pin,
8.3-safe path comparison after explicit reparse-point rejection, and the
mandatory hosted Windows alias fixture. Independent Full-side replay passed
Lite root tests on Node 22, 23, and 24 at 30 of 30 each and GNU Rust 1.98 and
1.85 path-security tests at 3 of 3 plus Full conformance at 11 of 11 each. The
Full owner returned APPROVED with no remaining blocking, high, or medium
finding.

After Lite's reciprocal approval, the Full Windows path-security correction
was published as the final implementation qualification commit. The Lite owner
independently replayed the focused config/store/path suite on Node 22, 23, and
24 at 45 of 45 each, verified that all nine contract hashes were unchanged, and
returned APPROVED with no blocking, high, or medium finding. The later Lite
pin/path follow-up was then reviewed against the exact Full coordinate and also
received APPROVED with no blocking, high, or medium finding.

## Hosted qualification and cross-repository closure

Full draft PR #26 remains open at implementation commit
`bbc2ea874f4dde37e6376e46c080cb1c69ab1bb3`. Both workflow events completed
successfully, for 12 green jobs total:

- push run `32463385935`: Linux build jobs for Node 22/23/24
  (`96714784504`, `96714784680`, `96714784586`) and mandatory Windows retrieval
  path-security jobs for Node 22/23/24 (`96714784274`, `96714784560`,
  `96714784536`);
- draft-pull-request run `32463389721`: Linux build jobs for Node 22/23/24
  (`96714795579`, `96714795577`, `96714795549`) and mandatory Windows retrieval
  path-security jobs for Node 22/23/24 (`96714795317`, `96714795600`,
  `96714795500`).

The Windows jobs exercised the mandatory ordinary 8.3-versus-long-path fixture,
junction rejection, retrieval typecheck/build, and focused config/store/path
tests. The results qualify the fix on all three supported Node major versions;
the test did not infer Windows behavior from the local runner.

Lite draft PR #16 remains open at final implementation commit
`08233ffa08822a4568f89082a0fae26bdf3b01d3`. Pull-request run `32464528711`
completed 8 of 8 jobs successfully:

- `desktop-native` (`96718219176`);
- `retrieval-rust-windows-msvc` (`96718219325`);
- `desktop` (`96718219377`);
- Node 22/23/24 wrapper tests (`96718219395`, `96718219452`, `96718219492`);
- current Rust retrieval (`96718219448`); and
- MSRV Rust retrieval (`96718219477`).

Lite pins the exact Full implementation qualification commit, and its copied
nine-file contract pack still matches every SHA-256 value recorded above with
one terminal LF per file. The hosted Windows MSVC job passed the bundled FTS5,
sealed-API, 8.3-path, and junction fixtures. These hosted results resolve the
prior local missing-linker limitation without claiming distribution, installer,
CPU, release, deployment, or production qualification beyond Phase 1.

## Final local verification

The following commands were run against the final unstaged worktree. No
required local test was skipped or replaced with a mock.

| Command | Exact final result |
| --- | --- |
| `npm run build` | PASS on Node 24.18.0; all existing bundles plus `dist/retrieval.mjs` and declarations built |
| `node --test test/retrieval-core.test.mjs test/retrieval-store.test.mjs test/retrieval-cli.test.mjs` | PASS on Node 24.18.0; 43 passed, 0 failed, 0 skipped |
| `npm run typecheck` | PASS on Node 24.18.0 |
| `npm test` | PASS on Node 24.18.0; 305 passed, 0 failed, 0 skipped |
| `npx --yes node@22 node_modules/typescript/bin/tsc --noEmit` | PASS on Node 22.23.2 |
| `npx --yes node@22 scripts/build.mjs` | PASS on Node 22.23.2 |
| `npx --yes node@22 --test "test/*.test.mjs"` | PASS on Node 22.23.2; 305 passed, 0 failed, 0 skipped |
| `npx --yes node@23 node_modules/typescript/bin/tsc --noEmit` | PASS on Node 23.11.1 |
| `npx --yes node@23 scripts/build.mjs` | PASS on Node 23.11.1 |
| `npx --yes node@23 --test "test/*.test.mjs"` | PASS on Node 23.11.1; 305 passed, 0 failed, 0 skipped |
| `npm run test:navigation` | PASS; 44 passed, 0 failed, 0 skipped |
| `npm run test:intelligence` | PASS; 4 passed, 0 failed |
| `npm run check:nomenclature` | PASS; zero unapproved legacy matches |
| `npm run check:license` | PASS; Apache-2.0 metadata consistent |
| `npm run pack:check` | PASS; 194 files, 506218 bytes |
| `git diff --check` | PASS; no whitespace errors; Git emitted only existing line-ending conversion warnings for tracked files |
| recursive SHA-256 scan of `contracts/retrieval` | PASS; all nine hashes exactly matched the table above |
| case-insensitive removed-provider scan over retrieval implementation/contracts/CLI/tests/build paths | PASS; zero implementation or contract matches |
| retrieval-import scan under `src/navigation` | PASS; zero matches |

The full test count increased from the Phase 0 post-change 249 to 305 because
of the additive retrieval, CLI, configuration, store, provider, compatibility,
and architecture tests. The final focused count includes adversarial malformed
source envelopes, exact parent binding, vector-store corruption propagation,
provider degradation, policy eligibility, citation integrity, resource bounds,
sealed public-surface tests, actual SQLite capability detection, two physical
lexical schemas, manifest/backend tamper recovery, forced-backend parity, and
Node-23 end-to-end CLI coverage.

The exact Node-23 capability probe was:

```text
npx --yes node@23 -e "const {DatabaseSync}=require('node:sqlite'); ..."
node=v23.11.1 sqlite=3.49.1
fts3=no such module: fts3
fts4=no such module: fts4
fts5=no such module: fts5
```

Node 22.23.2 and the local Node 24.18.0 runtime passed the real FTS5 virtual
table probe. Node 23.11.1 selected `sqlite_lexical_scan`; its complete 305-test
run exercised actual indexing, search, citations, store tamper detection, and
CLI output without skips or mocks.

## Source-byte and Navigation authority evidence

The additive CLI test snapshots every source note before indexing/search and
asserts byte identity afterward. It passed. A separate hard-link test proves an
aliased source record is rejected before any chunk is published. Chunking,
indexing, search, provider routing, and SQLite projection code write only to the
verified derived state directory; they contain no source-note write path.

The Navigation architecture gate passed 44 of 44 tests and still proves that a
synthetic transitive writer is detected. A direct source scan found no
retrieval import anywhere under src/navigation. SQLite, filesystem readers,
trusted configuration, providers, clocks, and derived-store mutation remain in
the host-side retrieval plane. The platform-neutral root bundle remains
separate from the Node-only retrieval bundle.

## Known limitations after qualification

- Phase 1 does not implement `as_of`, durable ledger binding, MCP transport,
  watcher recovery, agent identity/activity, graph projection tools, or the
  operator UI. Those remain assigned to later phases.
- Retrieval `valid_from` and `valid_to` remain nullable canonical-envelope
  fields. The CLI deliberately supplies null and does not project filesystem
  time or derived `GkxNode.validAt`/`invalidAt`. Phase 2 must ratify the current
  Standard mapping before any temporal retrieval behavior is enabled.
- Lexical-only is the qualified local mode. Node 22.23.2 and Node 24.18.0 use
  feature-probed `sqlite_fts5`; Node 23.11.1 uses the manifest-bound
  `sqlite_lexical_scan` and reports degraded approximation reasons. The scan's
  versioned host-Unicode subset is qualified only against the frozen
  differential corpus; exhaustive SQLite Unicode-6.1 `unicode61` equivalence
  is not claimed. Provider adapters are contract-tested, but no external
  endpoint, local model runtime, MCP provider, production vector service, or
  cross-platform release artifact is claimed active or qualified by this
  phase.
- The Lite static distribution, Linux targets, Windows/macOS release status,
  and Sandy Bridge/Ivy Bridge/R720 CPU qualification remain Phase 9 work.
- Phase 1 qualification does not merge either focused draft pull request and
  does not qualify a release artifact, installer, deployment, production
  activation, or remote service. Those actions remain subject to their later
  phase gates and separate owner authorization.

Accordingly, Phase 1 is **DONE** for implementation and cross-repository
qualification at the exact commits recorded above. This is not a merge, tag,
release, deployment, or production-activation record.
