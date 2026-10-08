# Annex — Layer-to-artifact mapping (informative)

Illustrates one conforming realization of each layer artifact required by §6. Informative only; conformance binds to the artifact's required properties, not to this or any other serialization.

| Layer | Governing artifact | Illustrative realization |
| --- | --- | --- |
| 1 Original Sources | Source Record | Provenance fields, content fingerprint, revision store keyed by content hash |
| 2 Structure and Identity | Structured Knowledge Object | Stable UID, type, schema version, canonical representation, metadata |
| 3 Relationships and Lineage | Assertion and lineage records | Typed relationship fields with per-field origin and temporal-validity metadata |
| 4 Validation and Control | Diagnostics and control receipts | Deterministic diagnostic codes plus reproducible, policy-hashed assessment output |
| 5 Review and Workflow | Decision Record | Immutable, chained records covering acceptance, rejection, deferral, withdrawal, expiry, supersession |
| 6 Context Presentation | Context Manifest | Purpose-bound, versioned bundle of accepted assertions, evidence anchors, contradictions, warnings |
| 7 Authorized Use | Authorized Use Record | Action, context, authority basis, actor, purpose, and outcome linkage |

Does not itself satisfy any fixture-catalog requirement; it identifies where a fixture corpus would attach to each layer contract.
