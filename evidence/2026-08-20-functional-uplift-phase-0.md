# GKOS-Engine functional uplift — Phase 0 verification

Date: 2026-08-20

Repository: Odenknight/GKOS-Engine

Phase scope: Full repository only

Final Phase 0 state: DONE

## Exact coordinates

| Coordinate | Value |
| --- | --- |
| Full base and current HEAD | 2fbd4ec68ec825b09e5194c9878a7ae90a281392 |
| Full package | gkos-engine 2.1.2 |
| Full branch | codex/phase-0-recon-adrs |
| Standard study commit | a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6 |
| Standard publication at that commit | GKOS-2026-08-16 v0.79 |
| GrooveSeek study commit | 313514b793d12ea5c3b8eedc32fd213212e38d75 |
| GrooveSeek description | v0.27.0-15-g313514b |
| Kosmos-Oden identity study commit | a7113c0ca3be8dd230a9549940e2f387d4cb2a96 |
| Inspected Lite baseline supplied by the build packet | 2ebbf77583af3e83032054f1256188dc56376907, package 1.1.3 |

No commit was created for Phase 0. The final implementation SHA is therefore
not yet defined; the working tree remains based on the Full baseline above.

## Untouched environment and baseline

The worktree was clean before npm ci. No tracked file changed during the
baseline run.

| Item | Exact observation |
| --- | --- |
| Node | v24.18.0 |
| npm | 11.16.0 |
| Platform | win32 x64 |
| Operating system | Microsoft Windows 11 Home 10.0.26200, build 26200, 64-bit |
| CPU | 11th Gen Intel Core i7-11800H, 8 cores / 16 logical processors |
| V8 | 13.6.233.17-node.50 |
| Node module ABI | 137 |

Untouched commands were executed in the requested order:

| Command | Result |
| --- | --- |
| npm ci | PASS; 7 packages added, 8 audited, 0 vulnerabilities |
| npm run typecheck | PASS |
| npm test | PASS; 245 passed, 0 failed, 0 skipped |
| npm run test:navigation | PASS; 44 passed, 0 failed, 0 skipped |
| npm run test:intelligence | PASS; 4 passed, 0 failed |
| npm run check:nomenclature | PASS; zero unapproved legacy matches |
| npm run check:license | PASS; Apache-2.0 metadata consistent |
| npm run pack:check | PASS; 152 files, 394610 bytes |

npm 11.16.0 emitted an allow-scripts advisory for the esbuild postinstall.
It did not skip installation, fail the build, modify tracked files, or report a
vulnerability. This is a baseline observation, not a normalized exception.

## Post-change verification

Every available Full gate was rerun after adding the ADRs, evidence, and
compatibility safety net.

| Command | Result |
| --- | --- |
| npm run build followed by node --test test/compatibility-baseline.test.mjs | PASS; 4 passed, 0 failed, including deliberate-perturbation detection |
| npm ci | PASS; 7 packages added, 8 audited, 0 vulnerabilities; same esbuild allow-scripts advisory |
| npm run typecheck | PASS |
| npm test | PASS; 249 passed, 0 failed, 0 skipped |
| npm run test:navigation | PASS; 44 passed, 0 failed, 0 skipped |
| npm run test:intelligence | PASS; 4 passed, 0 failed |
| npm run check:nomenclature | PASS; zero unapproved legacy matches |
| npm run check:license | PASS; Apache-2.0 metadata consistent |
| npm run pack:check | PASS; 158 files, 405728 bytes |

The test-count increase from 245 to 249 is exactly the four compatibility tests.
No required Full test was skipped, mocked, or substituted.

## Full repository inventory

### Public package and exports

package.json exposes:

- the root gkos-engine surface;
- gkos-engine/adapter;
- gkos-engine/gkx;
- gkos-engine/graphiti;
- gkos-engine/navigation;
- gkos-engine/governance; and
- the gkx executable.

The exact runtime export names for every current subpath are locked in
test/fixtures/compatibility/full-v2.1.2/public-exports.json. The root export is
assembled by src/index.ts and includes the existing deterministic GKX,
incremental, graph, Graphiti, Navigation, Governance, intelligence, ingestion,
timestamp, temporal, and experimental science surfaces.

### Command line

bin/gkx.mjs recognizes validate, assess, graph, export graphiti, and the
source-content-read-only nav commands. Its exact help text and representative
exit behavior are locked by the Phase 0 compatibility fixture:

- help: exit 0;
- missing command: exit 1;
- unknown command: exit 1; and
- desktop sidecar help: exit 0.

No existing command, flag, output channel, or exit code was changed.

### Navigation authority boundary

src/navigation remains value-in/value-out. The existing architecture test walks
its transitive local imports and rejects node:fs, node:fs/promises,
node:child_process, and mutation calls. The negative fixture proves the gate
detects a hidden transitive writer. Current Navigation capabilities are locked
byte-for-byte as JSON by the Phase 0 fixture.

Retrieval, MCP, credentials, providers, databases, watchers, clocks, and graph
sinks will remain outside src/navigation.

### Governance

src/governance defines GovernanceStore and the State-Change Receipt role.
InMemoryGovernanceStore is explicitly an append-only test adapter with
in-memory-test-adapter binding. No production relational or durable ledger
binding is present, so it cannot verify a production ledger hash.

### Desktop service

src/desktop-agent.ts currently composes:

- a hard-coded 127.0.0.1 bind;
- bearer authentication with a 32-byte random token and constant-time compare;
- port 4814 by default;
- a scoped CORS allowlist;
- directory scanning;
- a 500 ms coalescing watcher;
- one GkxIndex;
- status-file publication; and
- GET /health, /notes, /graph, and /graphiti/episodes.

The watcher currently rescans the directory on a flush, then calls
GkxIndex.applyChanges once for that flush. It has no durable reconciliation
journal. The Phase 0 fixture locks authorization and the four legacy REST
response envelopes, using semantic comparison for the deliberately variable
status/graph timing fields.

### Incremental engine

src/incremental.ts owns GkxIndex. Content hashes gate reparsing, renames can
reuse cached records, and applyChanges returns GraphDelta with added, removed,
changed, topology, reparse, and full-rebuild information. Existing architecture
tests identify GkxIndex.applyChanges as the sole incremental change-detection
call.

### Graph and Graphiti

src/graph.ts owns deterministic parsing and graph assembly. src/graphiti.ts
projects Graphiti 0.29-compatible episodes under adapter schema
gkx-graphiti/2.3.0 and labels them non-authoritative. The public compatibility
surface in src/graphiti-adapter.ts is preserved.

The compatibility fixture byte-locks a normalized representative GkxIndex graph
and fixed-processing-time Graphiti episodes. Only existing wall-clock build
duration and index time are removed before graph byte comparison.

### Build, SEA, tests, and package

scripts/build.mjs bundles the TypeScript core, adapter, GKX, Graphiti,
Navigation, Governance, and desktop ESM/CJS entries with esbuild, then emits
TypeScript declarations. scripts/build-sea.mjs injects the CJS desktop entry
into a matching Node binary and verifies downloaded cross-architecture Node
artifacts before use.

The current Full sidecar workflow builds Windows x86_64 and macOS arm64/x86_64.
Its Linux resolver exists for local use but is documented as not shipped.
Artifacts are unsigned except for the macOS ad-hoc signature used after SEA
injection. No Linux, R720, optional local-model, or true-static qualification is
claimed.

The npm package baseline contained 152 files and excluded platform-specific SEA
binaries and preparation blobs. dist is generated, not tracked.

## Current Standard mapping

The current Standard wins over historical or proposed field names. The pin for
this uplift is commit a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6.

At that commit:

- the current developmental publication is GKOS-2026-08-16 v0.79;
- GKX 2.0 is the serialized public namespace;
- schemas/gkx-frontmatter-2.0.schema.json is normative-candidate and requires
  gkx_version, uid, title, type, created_at, and epistemic_state;
- the Standard does not declare a complete qualifying GCP profile;
- the Engine validating projection coordinate
  gkx-2.3-validating-projection remains distinct from the Standard assessment
  coordinate gkx-2.0-validating-projection; and
- the v0.76 illustrated edition is archived historical material, not the active
  schema version.

Field adjudication:

| Supplied or proposed name | Current disposition |
| --- | --- |
| gkx_id | Not a canonical alias. uid is the authored stable identity. gkx_id does not satisfy uid. |
| created | Not a canonical alias. created_at is the current required Standard field. |
| valid_from | Retrieval-envelope alias for canonical GkxNode.validAt; not a new authored key. |
| valid_to | Retrieval-envelope alias for canonical GkxNode.gkx.invalidAt; not a new authored key. |
| supersedes | Authored newer-to-older declaration accepted by current Engine compatibility forms. |
| superseded_by | Authored inverse declaration; normalizeLineage resolves either side into one canonical newer-to-older edge and derives both projections. |
| source_id | Retrieval-envelope identity equal to a valid canonical authored uid; never synthesized from path, chunk, digest, rank, or timestamp. |
| lineage_id | Null unless a canonical profile or resolved GKX projection supplies it; never guessed or synthesized. |
| v0.76 illustrated standard | Archived illustrated edition. It must not be presented as the active schema. |

The temporal interval is half-open. projectAtTime includes a record when
validAt is at or before the instant and excludes it when invalidAt is at or
before the instant. invalidAt is the earliest temporally valid direct successor
time; it does not choose an authoritative branch.

## GrooveSeek study and license hygiene

The following English documents were read at exact commit
313514b793d12ea5c3b8eedc32fd213212e38d75:

- docs/retrieval-pipeline.md;
- docs/eval.md;
- docs/citations.md;
- docs/mcp-tools.md;
- docs/behavior.md;
- docs/stability.md;
- docs/decisions/0000 through 0010; and
- LICENSE-MIT and LICENSE-APACHE.

Useful concepts recorded for clean-room implementation include FTS/vector
candidate generation, deterministic RRF, optional reranking, MMR, bounded
parent expansion, byte-offset citations, typed filters, golden-query metrics,
bounded MCP resources, derived-state manifests, and watcher reconciliation.

The GKOS implementation must differ where authority and security require it:
DiscoverabilityPolicy applies before scoring or enumeration, GKX supplies
identity/lineage/temporal validity, the loopback service remains authenticated,
invalid records fail closed as complete units, and retrieval cannot create
authority.

No GrooveSeek source code or unusually expressive text was copied in Phase 0.
No GrooveSeek third-party notice entry is required by the present changes. If
later implementation copies any code or expressive text, the exact upstream
file, commit, local destination, and selected MIT or Apache-2.0 license must be
recorded before distribution.

## Storage, provider, identity, and external-contract findings

- SQLite FTS5 is selected as the local lexical default in ADR-0002.
- A Phase 0 runtime probe on Node 24.18.0 reported SQLite 3.53.1 with ENABLE_FTS5
  and completed an in-memory FTS5 query.
- No owner-authorized external relational-search schema, vector collection, or
  production durable-ledger contract was established by the inspected Full
  repository.
- No provider endpoint was configured or invoked. Provider routing is
  config-selected behind openai_compatible, local_onnx, and MCP adapter
  contracts; the Engine has no domain, vendor, model, or route allowlist.
- The current public isGkxPrivateLanIpLiteral helper is compatibility surface,
  not a provider-routing rule. It cannot constrain an endpoint selected through
  trusted operator configuration.
- No external service was provisioned, restarted, or mutated.
- The Graphiti code is an episode projection surface, not proof of a reachable
  or authorized external ingestion service.
- Kosmos-Oden has bearer-protected MCP sessions but no authenticated stable
  external subject contract. ADR-0003 therefore selects GKOS-issued identity
  and leaves external mapping inactive until verified.

An unavailable embedding adapter does not block Phase 0 or FTS implementation;
it requires an explicit FTS-only degraded state. An unavailable optional
reranker skips that stage without discarding a healthy vector stage. Either
absence blocks any later claim that the corresponding integration is active,
durable, qualified, or production-authorized. No fallback may silently mix or
replace embedding spaces.

## Semantic commit protocol finding

No document named or defining a “Semantic Commit Protocol” was found in the
inspected Full, Lite, Standard, or Kosmos-Oden repositories. Full history
predominantly uses conventional subjects such as docs:, fix:, ci:, and release:
but also contains prose subjects. The Standard CONTRIBUTING.md requires
Developer Certificate of Origin sign-off for Standard contributions; it is not
a Full repository protocol.

Until the owner supplies a stronger Full-specific authority, the conservative
merge convention is an observed type-prefixed imperative subject plus DCO
sign-off. This is an operational convention, not a claim that a formal
repository protocol was verified. No commit was created or staged in Phase 0.

## Compatibility safety net

Added:

- test/compatibility-baseline.test.mjs;
- test/fixtures/compatibility/full-v2.1.2/public-exports.json;
- navigation-capabilities.json;
- cli.json;
- cli-help.txt;
- gkx-index-graph.json; and
- graphiti-episodes.json.

The focused run passed 4 of 4 tests. One test deliberately flips
source_content_write and changes a graph relationship kind, then proves the
fixture comparison rejects both perturbations. This demonstrates that the
safety net fails when a locked interface or deterministic artifact is changed.

The synthetic compatibility corpus uses valid canonical UIDs and explicitly
authored `internal` sensitivity. Its UTF-8 source sizes are calculated from the
exact bytes (271 bytes for Notes/A.md and 259 bytes for Notes/B.md), so the
fixture does not bless an unlabeled-note fallback or retain mismatched size
metadata. Deterministic graph and Graphiti goldens are compared as raw bytes;
narrow `.gitattributes` rules keep those fixture/test files LF-stable across
checkout platforms.

## Safety and mutation statement

- No source note or vault fixture was modified.
- No PHI-adjacent or organization-confidential content was used.
- No source-content write surface was added.
- No service was provisioned.
- No branch was committed, pushed, merged, tagged, released, deployed, or
  published.
- The originating request's eventual push/combine-to-main authority is not
  exercised during Phase 0; it remains conditional on completion of the whole
  cross-repository build and every required review and qualification gate.
- Only Phase 0 documentation, evidence, tests, and compatibility fixtures were
  added.

## Phase 0 gate

**DONE.** Every available Full baseline, focused, architecture, type, test,
nomenclature, license, and package gate passed. Standard coordinates and every
supplied retrieval identity/temporal mapping are pinned, including source_id as
canonical uid and lineage_id as null unless canonically supplied. Optional
external contracts are honestly unavailable, and the compatibility fixture
detects deliberate breakage.

After the initial Phase 0 review, the owner explicitly required that
“Engine-Lite builds as one statically linked binary.” ADR-0005 records that as
ratification of the separately governed Rust/static frontend-adapter, with an
exact cross-language conformance suite and Full remaining the GKX contract and
reference-semantics authority.

This resolves the architecture decision; it does not claim that the binary has
already been implemented or qualified. Linux targets, static-link closure,
optional local models, native acceleration, signing, reproducibility,
clean-machine behavior, and Sandy Bridge/Ivy Bridge-class execution remain
Phase 9 evidence obligations. A conformance mismatch or a mandatory AVX2/FMA
dependency remains a later BLOCKED condition rather than a permitted
divergence.
