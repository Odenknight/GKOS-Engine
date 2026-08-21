# ADR-0001: Adopt GrooveSeek-style hybrid retrieval and evaluation; GKX and GKOS governance remain canonical

Date: 2026-08-20

## Context

GKOS-Engine 2.1.2 already supplies deterministic parsing, validation, lineage,
temporal projection, graph assembly, incremental changes, Graphiti episode
projection, governance interfaces, a read-only NavigationCore, a command line,
and a bearer-protected loopback desktop service. It does not yet supply a shared
heading-aware retrieval package, lexical/vector fusion, exact retrieval
citations, golden-query evaluation, or a default multi-agent MCP service.

GrooveSeek demonstrates useful retrieval concepts: heading-aware chunking,
SQLite FTS5, optional vector retrieval, Reciprocal Rank Fusion, optional
reranking, MMR diversity, bounded parent expansion, exact citation spans,
typed filters, golden-query metrics, Streamable HTTP MCP, and derived-index
recovery. The inspected upstream is dual-licensed MIT OR Apache-2.0.

Those ideas cannot be imported as an authority model. In GKOS, retrieval rank,
embeddings, similarity, timestamps, graph centrality, and model output cannot
create identity, authority, classification, discoverability, epistemic
standing, MOC membership, or supersession.

## Decision

GKOS-Engine owns the versioned retrieval contract, canonical conformance
fixtures, and reusable TypeScript reference implementation exposed through a
package subpath. Full executes that TypeScript implementation. Under ADR-0005,
Lite implements a pin-bound Rust frontend-adapter so it can satisfy the
one-statically-linked-binary requirement. The Rust adapter must conform exactly
to the Full-owned contracts and fixtures; it is not an independent ranking or
GKX authority.

The retrieval plane will be additive and will:

- derive stable heading-aware chunks from exact source bytes;
- support FTS-only operation as the mandatory baseline;
- permit optional vector retrieval and reranking through config-selected,
  provider-neutral interfaces;
- initially evaluate deterministic RRF with k equal to 60 and optional MMR with
  lambda equal to 0.7, with all effective parameters versioned and reported;
- provide typed filters, calibrated confidence reason codes, bounded parent
  expansion, exact UTF-8 byte/line citations, and golden-query evaluation;
- apply DiscoverabilityPolicy and temporal eligibility before ranking,
  aggregation, counts, facets, confidence, or graph expansion;
- reject a malformed source as a whole for a projection generation; and
- keep every retrieval and graph database disposable and manifest-bound to the
  canonical source snapshot, policy, configuration, engine, and contract
  versions.

Provider choice is an operator configuration decision, not an Engine policy.
The provider seams admit openai_compatible, local_onnx, and MCP embedding and
rerank adapters. No provider is privileged, and GKOS-Engine will not embed a
vendor, model, or routing allowlist. An adapter must still validate its declared
model identity, dimensions, item count, finite values, and request correlation.
An unavailable embedding provider degrades honestly to FTS-only. An unavailable
optional reranker skips only the rerank stage and preserves healthy lexical and
vector candidates. Both cases report the affected stage and never trigger a
silent model substitution, cross-embedding-space fallback, or service
provisioning.

GKX remains canonical:

- source identity comes from the current parser and pinned Standard mapping;
- retrieval source_id equals a valid canonical authored uid; it is never
  synthesized from path, chunk identity, digest, rank, or timestamp;
- canonical lineage comes from normalizeLineage and its resolved edge set;
- retrieval lineage_id remains null unless a canonical profile or resolved GKX
  projection supplies it; it is never guessed or synthesized;
- retrieval valid_from and valid_to are envelope names for the existing
  GkxNode.validAt and GkxNode.gkx.invalidAt projections;
- point-in-time membership follows the existing half-open interval behavior in
  projectAtTime: validAt is included and invalidAt is excluded;
- valid_from and valid_to are not accepted as new authored frontmatter fields;
- superseded_by is never inferred from timestamp proximity; and
- a durable ledger hash is reported only when an authorized durable binding was
  actually read and verified.

All host, database, watcher, credential, MCP, provider, and projection code stays
outside the transitive import graph of src/navigation. Existing package exports,
CLI behavior, REST routes, sensitivity behavior, GkxIndex semantics, Graphiti
episode identity, and source-content-read-only guarantees remain compatible.

ADR-0005 supersedes only the earlier direct TypeScript-runtime-sharing
interpretation for Lite. It does not supersede Full ownership of the contract,
reference semantics, fixtures, ranking behavior, authority boundaries, or
Full/Lite parity requirements.

### Pinned build-packet reference

This decision implements the owner-issued “GKOS-Engine / GKOS-Engine-Lite
Functional Uplift Build Instructions”, dated 2026-08-20, with these pinned
coordinates:

- Full baseline:
  2fbd4ec68ec825b09e5194c9878a7ae90a281392, package 2.1.2;
- Lite baseline:
  2ebbf77583af3e83032054f1256188dc56376907, package 1.1.3;
- current Standard study commit:
  a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6;
- GrooveSeek study commit:
  313514b793d12ea5c3b8eedc32fd213212e38d75; and
- provider clarification:
  the master build remains in force, but provider-specific restrictions are
  replaced by neutral, config-selected openai_compatible, local_onnx, and MCP
  adapters with no provider/model/routing allowlist.

The full packet is attached to the originating execution request; no immutable
external URL was supplied. These coordinates and the precedence statement are
the permanent repository pin. The originating request authorizes eventual push
and combine-to-main only after the complete cross-repository build, mutual
review, debugging, mock qualification, and all required gates pass. Phase 0
does not exercise that integration authority. The packet does not authorize
tagging, release publication, deployment, production activation,
source-content writes, remote exposure, or self-provisioning.

## Alternatives rejected

- Copy GrooveSeek implementation code. A clean-room TypeScript implementation
  preserves GKOS architecture and minimizes license and cross-language drift.
- Make vector similarity the required or authoritative path. FTS-only operation
  and deterministic authority must survive provider failure.
- Let Lite define retrieval behavior independently. Its Rust implementation is
  a pin-bound conforming adapter to Full-owned contracts, not a semantic fork.
- Put persistence or provider calls inside NavigationCore. That would violate
  its value-in/value-out authority boundary.
- Let retrieval infer identity, lineage, sensitivity, or supersession. Rank is
  evidence for discovery only.
- Hard-code one inference provider, model family, or route. Deployment choice
  belongs behind the versioned provider contract.

## Consequences

- Retrieval can evolve without duplicating Full/Lite semantics.
- Optional vector and rerank deployments require explicit adapter
  qualification. Missing embeddings leave FTS available; missing reranking
  leaves the otherwise healthy retrieval stages available.
- Policy filtering may reduce apparent retrieval quality, but leak prevention
  is not a tunable metric tradeoff.
- Contract, chunker, tokenizer, provider, model, or manifest changes may require
  controlled derived-store rebuilds.
- GrooveSeek concepts are implemented clean-room. If later work copies source
  or unusually expressive text, the exact source file, upstream commit, local
  destination, and selected license must be added to third-party notices.

## Status

Accepted for additive implementation, subject to the phase gates and human
escalations in the pinned build packet.

## Evidence

- Full Phase 0 report:
  evidence/2026-08-20-functional-uplift-phase-0.md.
- Standard schema and profile evidence at
  a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6.
- GrooveSeek retrieval, evaluation, citation, MCP, behavior, stability, and ADR
  documents at
  313514b793d12ea5c3b8eedc32fd213212e38d75.
- Compatibility fixture:
  test/compatibility-baseline.test.mjs and
  test/fixtures/compatibility/full-v2.1.2.
