# Scoped lineage inspection

`inspectScopedLineage(graph, sourceNodeId, readableNodeIds)` is a read-only
current-graph adapter for native inspectors. The trusted host supplies its
already-authorized readable node IDs and must recheck that scope and graph
before publishing a result. This API does not authenticate a caller, evaluate
sensitivity, or implement temporal selection.

It uses parser-owned candidate tiers, without reparsing references. Only
readable candidates participate: hidden candidates behave exactly like physical
absence. Results identify each lineage declaration by field, origin, zero-based
declaration index and source line. Status is resolved, unresolved, ambiguous or
self. Resolved node IDs are restricted to the supplied readable set. Raw
references, hidden candidates and internal record keys are never returned.

Unavailable parser receipts, an unreadable source or non-unique source records
return `available: false` and an empty declaration list. An available empty list
means no canonical lineage declarations were recorded. Neither outcome proves
valid source syntax; callers should retain projection diagnostics. A scoped
unresolved result does not assert that the referenced note is absent globally.
Declaration inspection is not approval, a historical audit or an authoritative
decision record. It does not change graph edges or canonical source bytes.

Tests cover resolved/missing/self, unavailable receipts, denied source,
hidden-versus-absent equality and ambiguity with one or two readable candidates.
Kosmos integration and installed-runtime qualification are separate gates.
