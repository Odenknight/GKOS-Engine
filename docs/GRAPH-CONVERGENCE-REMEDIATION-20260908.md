# Graph convergence remediation, September 8, 2026

Candidate aa2e10d16983b6cbd4107464f376d87d3c546db3 passed its exact native
Linux/Windows runtime matrix and full local Windows release-command sequence.
A subsequent bounded soak pilot nevertheless found a release-blocking graph
convergence defect. No 24-hour soak, release tag or publication had occurred.

Replacing a canonical source record removes and reinserts its Map entry. Graph
assembly consumed this insertion order. A body-only edit to the first file
therefore moved its containment link to the end of the output array. Parsed
links also incorporate traversal position in their IDs. Independent regression
with wikilinks confirmed that IDs, not only array ordering, could differ from
a clean rebuild of the same final input.

GkxIndex now sorts representative records by normalized source-path keys before
assembly, using locale-independent code-unit comparison. The existing sorted
candidate ledger is unchanged. This preserves graph content, all validation and
identity checks, and exactly one parse for one changed file. It makes traversal
independent of incremental edit history and input record order.

The new regression failed before the repair and passes afterward. It edits
ASCII and non-ASCII paths repeatedly, rebuilds from reversed final inputs,
compares complete ordered node/link arrays including IDs, and verifies zero
parses for an unchanged retry. Type checking, build and 69 focused graph,
lineage, candidate-ledger, incremental and determinism tests pass.

The pilot comparison was not weakened or replaced with sorted result sets.
Failed pilot receipts and the original graph differences are retained outside
the repository in the release evidence bundle. The resulting new source commit
requires new exact runtime, observation, artifact and consumer qualification and
a successful real 24-hour soak. Prior candidate passes do not qualify it.
