# Scientific Research Trace Profile draft schemas

**Status:** provisional draft, informative, non-normative

These JSON Schema 2020-12 documents are an experiment for
`SRTP-DRAFT-0.1`. They add application-profile object types, not an eighth GKOS
layer. Validation means only that a record matches this draft shape. No
conformance claim may cite this directory, and no result is “GKOS scientifically
validated” merely because it validates here.

All record objects intentionally allow unknown properties so implementations
can round-trip extensions. Known nested extension boundaries do the same. The
graph runner separately evaluates rules JSON Schema cannot express, including
raise-only sensitivity, authorization/input digest binding, hash-linked events,
reviewer separation, artifact binding, context validity, and L7-to-L1 re-entry.

The base `research-object` schema accepts lowercase UUIDv7 identities for new
objects and grandfathered lowercase UUIDv4 identities through the current GKX
shared definition. Every scientific record carries explicit origin,
sensitivity, timestamp, and branch lineage. `PASS`, `FAIL`, `PARTIAL`, and
`UNEVALUATED` remain distinct evaluation values.

`reentry-receipt` is an SRTP digest-binding experiment only. It does not fill or
supersede the deferred GKOS authority-receipt, actor-identity, or upward
attestation-chain contracts.
