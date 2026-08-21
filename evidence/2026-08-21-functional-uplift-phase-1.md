# GKOS-Engine functional uplift — Phase 1 local verification

Date: 2026-08-21

Repository: Odenknight/GKOS-Engine

Phase scope: Full TypeScript reference retrieval implementation and the
machine-readable contract consumed by GKOS-Engine-Lite

Final Phase 1 terminal state: NOT ASSIGNED. The local implementation and
reciprocal-review gates are green, but the required focused pull request and
its CI have not yet run. This record does not claim DONE, BLOCKED, or
NEEDS_HUMAN before that publication gate.

## Exact implementation coordinates

| Coordinate | Value |
| --- | --- |
| Original inspected Full baseline | 2fbd4ec68ec825b09e5194c9878a7ae90a281392 |
| Phase 1 branch | codex/phase-1-retrieval-core |
| Phase 1 base and current HEAD during this record | ba918e6617ece6bb1392f6768b69d4913818035d |
| Worktree disposition | Phase 1 changes are uncommitted and unstaged on top of the exact HEAD above |
| Full package | gkos-engine 2.1.2 |
| Node / npm | v24.18.0 / 11.16.0 |
| Local platform | win32 x64 |
| Standard pin inherited from Phase 0 | a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6, current publication v0.79 |
| GrooveSeek study pin inherited from Phase 0 | 313514b793d12ea5c3b8eedc32fd213212e38d75 |

There is no Phase 1 final commit SHA yet. No branch was pushed, no pull request
was opened, and no merge, tag, release, deployment, or publication occurred as
part of this local implementation pass.

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
| Projection schema | 1 |
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
| README.md | c70ce6b479835664b9f23bf65166deecc652e4a78f23b9fa92017d3aa34f470d |
| canonical-fixture.json | f30dd5c3e71407e6544b9c727ff5597c4809936dbbd14a5fdca87dcb99031db2 |
| chunk.schema.json | 2474a40e8abc930cbc6e713aa8966be41f0fba87c5b38c5868b42403e8f3f721 |
| conformance-fixture.json | 36844dab9de9ef6c7e690cf142bd08e102383cf2f73e5f683dcae9ce173f32b5 |
| contract.json | d8281cac8529862b1c898b80eb2a4d51ecf4f629642da68fd39bf394b1233a1e |
| gkos-config.schema.json | e42fe89d102ec602b0738aa01a3c8f98cc8fb55d9edc25265f6feb168a0ca8d6 |
| gkos-toml-lexical-fixture.json | abdb26527fd5c047db96801c22ebf30efca544fe306744c666b858ba57bd039b |
| projection.schema.json | ecd92dfcb638e4b81a87fbf8b31eb98f93b567dff79241cddd7e45d42bb01d18 |
| result.schema.json | f171720bc64a7256b946adfd3590172ee76c7f7d72f0099dc463f5baa9aeec2f |

Lite's final frozen copy matched all nine hashes exactly. The cross-language
fixtures cover chunk bytes and identities, canonical JSON, normalized paths,
timestamps, lexical scoring, RRF, duplicate collapse, MMR including negative
cosine handling, rerank-to-MMR ordering, overlap citation de-duplication,
Unicode glob behavior, parent expansion, and citation normalization.

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
- an owner-protected SQLite FTS5 derived store with explicit schema version,
  complete manifest and projection digests, foreign-key and integrity checks,
  exact FTS row verification, all-or-none vectors, read-only published
  generations, WAL/SHM quarantine, hard-link/symlink/parent-alias rejection,
  bounded active pointers, atomic replacement, and verified prior-generation
  embedding reuse;
- exact structural parent binding: a child may reference only the first chunk
  of its nearest actual structural ancestor; sibling, distant-ancestor,
  non-first-part, missing, and extra parent bindings fail before state creation;
- FTS-only retrieval as a complete default path, typed pre-ranking filters,
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
- an additive `gkx search` command with `--kb-path` and `--limit`, FTS-only
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
Operational embedding failure reports FTS-only degradation; an absent or
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
  ancestor's first chunk.

Each finding received a focused regression before the full gates were rerun.
The Lite owner performed the final narrow reciprocal review, independently ran
the retrieval core/store command at 35 passed and 0 failed, confirmed all nine
contract hashes remained unchanged, and returned APPROVED with no remaining
blocking, high, or medium finding.

The Full owner also completed a read-only reciprocal review of Lite's final
Rust delta. That review confirmed exact contract bytes, strict TOML and trusted
configuration behavior, live byte/line citation sealing, hidden-ID rejection,
secret-safe Debug surfaces, coordinator-only store access, provider-neutral
selection and deadlines, immutable action pins, MSRV/current CI jobs, and the
mandatory hosted Windows alias fixture. The local Full review shell did not
have Cargo or a Windows linker; Lite recorded green GNU Rust 1.98 and MSRV 1.85
runs, while the focused Lite pull request must supply the hosted Windows result.

## Final local verification

The following commands were run against the final unstaged worktree. No
required local test was skipped or replaced with a mock.

| Command | Exact final result |
| --- | --- |
| `npm run build` | PASS; all existing bundles plus `dist/retrieval.mjs` and declarations built |
| `node --test test/retrieval-core.test.mjs test/retrieval-store.test.mjs` | PASS; 35 passed, 0 failed, 0 skipped |
| `npm run typecheck` | PASS |
| `npm test` | PASS; 302 passed, 0 failed, 0 skipped |
| `npm run test:navigation` | PASS; 44 passed, 0 failed, 0 skipped |
| `npm run test:intelligence` | PASS; 4 passed, 0 failed |
| `npm run check:nomenclature` | PASS; zero unapproved legacy matches |
| `npm run check:license` | PASS; Apache-2.0 metadata consistent |
| `npm run pack:check` | PASS; 194 files, 496942 bytes |
| `git diff --check` | PASS; no whitespace errors; Git emitted only existing line-ending conversion warnings for tracked files |
| recursive SHA-256 scan of `contracts/retrieval` | PASS; all nine hashes exactly matched the table above |
| case-insensitive removed-provider scan over retrieval implementation/contracts/CLI/tests/build paths | PASS; zero implementation or contract matches |
| retrieval-import scan under `src/navigation` | PASS; zero matches |

The full test count increased from the Phase 0 post-change 249 to 302 because
of the additive retrieval, CLI, configuration, store, provider, compatibility,
and architecture tests. The final focused count includes adversarial malformed
source envelopes, exact parent binding, vector-store corruption propagation,
provider degradation, policy eligibility, citation integrity, resource bounds,
and sealed public-surface tests.

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

## Known limitations and remaining gate

- Phase 1 does not implement `as_of`, durable ledger binding, MCP transport,
  watcher recovery, agent identity/activity, graph projection tools, or the
  operator UI. Those remain assigned to later phases.
- Retrieval `valid_from` and `valid_to` remain nullable canonical-envelope
  fields. The CLI deliberately supplies null and does not project filesystem
  time or derived `GkxNode.validAt`/`invalidAt`. Phase 2 must ratify the current
  Standard mapping before any temporal retrieval behavior is enabled.
- FTS-only is the qualified local mode. Provider adapters are contract-tested,
  but no external endpoint, local model runtime, MCP provider, production
  vector service, or cross-platform release artifact is claimed active or
  qualified by this phase.
- The Lite static distribution, Linux targets, Windows/macOS release status,
  and Sandy Bridge/Ivy Bridge/R720 CPU qualification remain Phase 9 work.
- No focused Phase 1 pull request or hosted CI result exists yet. The phase
  terminal state must be assigned only after both focused repository PRs have
  coherent pins and all required CI jobs pass.

Accordingly, this is a local verification draft, not a release, merge, or
deployment record.
