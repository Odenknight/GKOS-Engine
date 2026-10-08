# ADR-0004: Add projection sinks around the canonical GKX graph

Date: 2026-08-20

## Context

GKOS-Engine already assembles one deterministic GkxGraph and produces
non-authoritative Graphiti 0.29-compatible episodes. It has no generic graph
projection lifecycle or dependency-light persistent graph query store.

A graph database can improve bounded navigation, but it must not become a second
semantic interpreter or authority source. Authored, deterministic-derived, and
similarity-derived edges also need explicit separation.

## Decision

Add a GraphProjectionSink contract outside src/navigation. A host-side
projection coordinator feeds every sink from the canonical GkxGraph and
GraphDelta produced by GkxIndex. Sinks may initialize, apply a delta, replace a
snapshot, verify a manifest, and close; they may not reinterpret source
frontmatter or write source notes.

The built-in default sink is a vault-isolated SQLite graph projection with
canonical JSON properties and bounded breadth-first, shortest-path, neighbor,
and relationship queries. Every seed, traversed node, traversed edge, count, and
result passes DiscoverabilityPolicy. An undiscoverable endpoint suppresses the
incident edge; no placeholder reveals it.

The existing buildGraphitiEpisodes and buildGraphitiEpisodesWithContent outputs
remain compatible. A Graphiti sink wraps their delivery and verification but
does not replace them. Graphiti remains optional and non-authoritative, and no
external ingestion endpoint is active without verified trusted configuration.

Similarity edges, when enabled, use a distinct projection or an explicit
similarity-derived origin plus provider/model/projection identity and score.
They never merge with authored or deterministic typed relationships. Combined
views label every origin and default to similarity disabled.

Every sink manifest binds vault, engine and contract versions, source snapshot,
GKX graph, configuration, policy, projection schema, sink identity, counts, and
completion digest. Mixed or stale generations are not advertised as fresh.

## Alternatives rejected

- Replace GkxGraph with a graph database. A database is a rebuildable
  projection, not canonical semantics.
- Let each sink parse notes independently. That creates divergent identity,
  lineage, and relationship rules.
- Treat Graphiti extraction or similarity as authored fact. Both are
  non-authoritative discovery projections.
- Put graph drivers in NavigationCore. Persistence and network dependencies
  violate its transitive authority boundary.
- Expose arbitrary SQL or graph query languages through MCP. Agents receive
  bounded typed tools only.

## Consequences

- Full and Lite gain a dependency-light graph query path without changing
  deterministic graph construction.
- Projection manifests and canonical digest convergence become release gates.
- Optional sinks can fail independently while the last coherent projection is
  served as stale or degraded.
- Similarity exploration is more verbose because origin and authority are
  always disclosed.

## Status

Accepted.

## Evidence

- Canonical graph:
  src/graph.ts and src/incremental.ts at Full baseline
  2fbd4ec68ec825b09e5194c9878a7ae90a281392.
- Existing Graphiti contract:
  src/graphiti.ts, src/graphiti-adapter.ts, and test/graphiti.test.mjs.
- Byte-locked compatibility artifacts:
  test/fixtures/compatibility/full-v2.1.2/gkx-index-graph.json and
  graphiti-episodes.json.
- No verified external Graphiti ingestion contract was present in the inspected
  Full repository.
