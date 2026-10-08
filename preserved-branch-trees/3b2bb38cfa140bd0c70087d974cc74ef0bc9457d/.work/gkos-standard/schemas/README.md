# GKOS schemas

v0.76 introduced the first machine-readable schema slice (JSON Schema
2020-12). The twelve-state epistemic vocabulary is frozen directly in the
master standard. The seven-level sensitivity ladder, four-way origin
separation, typed relation set, and serialization details are
**normative-candidate** artifacts adopted under R10 with disclosed
reference-implementation evidence; they are not all independently enumerated by
v0.76 normative prose. They require clause traceability and complete fixtures
before they can support a qualifying profile claim.

| Schema | Layer | Status |
| --- | --- | --- |
| `gkx-common.defs.json` | shared | normative-candidate |
| `gkx-frontmatter-2.0.schema.json` | L2 | normative-candidate (GKX 2.0 breaking profile) |
| `assessment.schema.json` | L4 | normative-candidate |
| `diagnostics-sidecar.schema.json` | L4 | normative-candidate |
| `proposal-envelope.schema.json` | L5 | normative-candidate |
| `decision-record.schema.json` | L5 | normative-candidate |
| `conformance-manifest.schema.json` | claims | normative-candidate |
| `provisional/source-record.draft.schema.json` | L1 | provisional, informative only |
| `provisional/context-manifest.draft.schema.json` | L6 | provisional, informative only |
| `provisional/authorized-use-record.draft.schema.json` | L7 | provisional, informative only |
| `provisional/science/*.draft.schema.json` | cross-layer SRTP application profile | provisional draft, informative and non-qualifying |

Deliberately absent, per the v0.76 deferral list: the authority-receipt schema
(v0.8 gate; Annex C carries the provisional field list), the actor-identity
model, and the upward-receipt attestation chain. "Normative-candidate" means
published for review under the development-phase governance in the repository
README; promotion to normative requires a recorded development decision.
Schema proposals must preserve the master standard's authority, provenance,
temporal, sensitivity, and identity invariants. R13 separates the two identity
contracts: authored GKX note `uid` fields accept lowercase UUIDv7 for new notes
and valid lowercase UUIDv4 for permanent legacy notes; relationship fields use
the broader `relationshipTarget` grammar (UUID or policy-permitted namespaced
target, or a whole-value quoted wikilink). This preserves historical and
cross-system references without permitting a new authored note to take a
namespaced or non-lowercase UUID identity.
