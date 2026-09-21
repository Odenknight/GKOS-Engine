# Authorized lexical discovery v1

`gkos_search_lexical_v1` is an explicit, content-only discovery route. It scans every source in the current admitted authorized snapshot with the Engine lexical predicate and pages results in canonical-path code-unit order. A final page sets `complete_within_scope: true`; this means that this lexical predicate was exhausted for that bound snapshot, not that every relevant fact was found.

This route is separate from `gkos_search`. It is never invoked as an automatic fallback. Strict native retrieval continues to reject unresolved, ambiguous, self-referential, branching, reversed, or cyclic declarations with the existing opaque `GKOS_P6_AUTHORIZED_VIEW_CONFLICT` response.

Lexical v1 retains source authorization, unique source identity, exact source digest verification, snapshot and policy binding, and session-bound cursors. Duplicate authorized UIDs still refuse. Because content discovery does not resolve cross-record declarations, each item reports `authored_status: "unknown"`, `visible_lineage_status: "unknown"`, `currentness_basis: "not_evaluated"`, and `resolution_complete_within_scope: false`. Clients must not infer that a source is current or that no hidden or missing successor exists.

The page binding includes the effective identity coordinate, policy digest, authorized source snapshot digest, query digest, and ordering profile. A generation, source-byte, identity, policy, query, or ordering change invalidates a prior cursor.
