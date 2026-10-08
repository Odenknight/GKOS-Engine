# Provisional schemas (informative, not normative)

These drafts cover layer artifacts with **no shipped reference-implementation
realization yet** (L1 Source Record beyond frontmatter provenance fields, L6
Context Manifest, L7 Authorized Use Record). They exist so implementers
experimenting in the interim converge on a common vocabulary — the same posture
as GKOS v0.76 Annex C for authority receipts. No conformance claim may cite
this directory. Promotion to `schemas/` requires a recorded development
decision and at least one implementation exercising the shape.

Deliberately absent, per the v0.76 deferral list: the authority-receipt schema
(v0.8 gate; see Annex C), the actor-identity model, and the upward-receipt
attestation chain.

`science/` contains the separate `SRTP-DRAFT-0.1` application-profile
experiment. Its re-entry receipt is a scientific trace binding, not the
deferred authority receipt or attestation chain. It remains non-normative and
non-qualifying.
