# Annex — Layer interface contracts

Each layer contract defines purpose, accepted inputs, required operations, outputs, preserved invariants, authority boundary, prohibited behavior, failure behavior, receipts, and re-entry rules.

| Layer | Output | Blocking invariant |
| --- | --- | --- |
| L1 | Source Record | Revision and provenance preserved |
| L2 | Structured Knowledge Object | Stable identity; filename is not identity |
| L3 | Assertion and lineage records | Typed, sourced, temporal, scoped relationships |
| L4 | Diagnostics and control receipts | Mandatory failures block promotion |
| L5 | Decision Record | Authorized append-only disposition |
| L6 | Context Manifest | Reproducible purpose-bound presentation |
| L7 | Authorized Use Record | Action linked to context and authority |

Upper-layer results returning to the corpus MUST enter as new Layer-1 sources.
