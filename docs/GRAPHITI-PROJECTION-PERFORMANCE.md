# Episode projection link lookup

September 13, 2026. A Windows CPU profile of the synthetic 2,000-note watcher
identified buildGraphitiEpisodes among the active costs. Its previous code
filtered all graph links once for every file. The replacement builds one
per-call map of semantic target labels by source, preserving first occurrence
order, label deduplication, unknown-target fallback and source separation.
It adds no cross-request cache and changes no authorization or freshness checks.

A five-run isolated comparison used 2,000 files and 22,000 links. Every output
byte matched the previous source. Before times were 392.75, 381.07, 285.34,
283.25 and 271.08 ms; after times were 65.71, 57.60, 56.58, 49.97 and 53.13 ms.
This is a synthetic episode-export comparison, not an end-to-end watcher pass.
The existing native retrieval and watcher activation budget failures remain
open. Live model qualification remains deferred by FAC.

Build and 14 focused Graphiti/compatibility tests passed. The added regression
checks interleaved sources, repeated targets, ordering, nonsemantic exclusion
and unresolved targets. Local evidence: graphiti-projection-comparison.json,
compare-graphiti-projection.mjs, graphiti-projection-performance-tests.log.
The original diagnostic setup failed before measurement because its folder
list was omitted; the corrected comparison passed. Sandbox build traversal was
denied; the successful build used the existing repository-owner context.
