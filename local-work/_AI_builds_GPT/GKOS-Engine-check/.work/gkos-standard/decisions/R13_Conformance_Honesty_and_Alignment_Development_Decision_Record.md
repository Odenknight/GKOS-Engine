# R13 — Conformance honesty and alignment development decision

**Status:** Accepted development decision; v0.x non-consensus authority
**Date:** 2026-08-05
**Authorizing editor:** Founder and Initial Editor
**Release disposition:** Included in the authorized GKOS-2026-08-05 v0.77
developmental, non-consensus publication under signed tag `v0.77`

## Decision

The Founder and Initial Editor accepts the following v0.x development
decisions. This record is not a consensus ratification, independent
certification, accredited standards decision, or authorization to publish a
release.

| ID | Disposition | Decision |
| --- | --- | --- |
| R13-097 | Accept | A fixture with any unexecuted required expectation is `UNEVALUATED`, not PASS. A run containing such an expectation exits non-zero. Only a catalog-declared complete profile with every required fixture passing may appear in `profiles_claimed`; evidence-only runs may claim no profile. |
| R13-098 | Accept | Clause-stable requirements use `GKOS-<AREA>-<NNN>`, where `AREA` is an uppercase GKOS responsibility area and `NNN` is a zero-padded three-digit sequence. IDs bind to GKOS clauses and are never silently reused. Fixtures cite those IDs; adapters map implementation diagnostics and observations without making either normative. |
| R13-099 | Accept | Testable clauses are derived first from a frozen normative-only corpus, sealed before implementation comparison, then classified as MATCH, SPEC-GAP, ENGINE-DIV, or AMBIGUOUS. Implementation behavior cannot amend GKOS automatically. |
| R13-100 | Accept | GKX remains the current public technical-model name under R11. Historical and machine identifiers remain governed compatibility identifiers. This decision does not adopt or ratify the draft portfolio registry or any product-name inventory. |
| R13-101 | Accept | Sole controlling identity-and-lineage decision: new authored GKX note identities use lowercase UUIDv7; valid lowercase UUIDv4 identities remain permanent legacy identities; migrations never rewrite or substitute historical identities and preserve every predecessor, successor, and fork as explicit lineage. Only the earliest temporally valid direct-successor time may derive `invalid_at`; that derivation does not choose an authoritative successor. UUID, timestamp, and lexical ordering carry no authority, and no implementation tiebreak selects an authoritative successor. The permanent allocations are maintained in `requirements/REGISTRY.md`. |

## Identity and lineage decision control

R13-101 is the sole controlling R13 decision for identity and lineage. The
identifier `R13-102` is retired and unallocated: it conveys no decision, MUST
NOT be reused, and does not renumber any R13 record. The authoritative
requirement allocations are `GKOS-IDENTITY-001` through `004` and
`GKOS-LINEAGE-001` through `003`; their text, status, source, and replacement
mappings are maintained append-only in `requirements/REGISTRY.md`.

## Conformance and catalog boundary

Fixture catalog 0.1.1 is a starter, non-qualifying catalog. It declares no
qualifying profiles. Its runner result may provide remediation evidence, but it
cannot support a GCP qualification claim until clause-traceable requirements,
adapter mappings, complete required fixtures, and executable pair/graph
expectations exist.

## Evidence and implementation boundary

This decision considers the runner-remediation branch, catalog 0.1.1, the
Engine/standard drift assessment, and the original R13 proposal. The accepted
decision validates reporting boundaries and forward identity policy; it does
not make the reference Engine an oracle, qualify any implementation, or close
the independent-implementation gate.

## Compatibility and preservation

Readers continue to accept legacy lowercase UUIDv4 and other previously valid
forms permitted by the shared reader grammar. Writer policy is forward-only.
Historical releases, including the published v0.76 package, remain immutable.
Any later revision requires a recorded supersession and explicit mappings; no
identifier, requirement, or lineage branch may be silently rewritten.

## Publication boundary

The associated v0.77 material is authorized for developmental publication under
`GOVERNANCE.md`. This record does not itself create a tag, push, or hosting-
provider release object, and it remains neither consensus ratification nor
independent certification.
