# R10 Schema, Fixture, and Conformance-Runner Development Decision Record

**Record ID:** GKOS-DR-2026-07-23-R10
**Release:** GKOS-2026-07-20 v0.76 (in-series ecosystem improvement; no version bump)
**Status:** Developmental adoption — not consensus ratification
**Authorizing editor:** Shaun “Oden” Marshall, Founder and Initial Editor
**Technical reviewer:** Claude Fable 5 (Anthropic), advisory review only — grounded in execution against gkos-engine v1.0.5 (122/122 engine tests passing; fixture catalog executed end-to-end on 2026-07-22)
**Decision date:** 2026-07-23

## Governance status

This record, if adopted, governs a pre-v1.0 developmental adoption per R9-082:
an ecosystem improvement within the v0.76 series, not a consensus ratification,
certification, or claim that the standard's schema program is complete. Per
§16.3, this draft proposes text and artifacts; nothing binds the standard until
the amendment path completes, and no author of this draft may self-approve it
per §5 and §16.4.

## Evidence reviewed

- GKOS-2026-07-20 v0.76 master documentation, §21/§26/§27 (fixture and schema programs), §10 (GCP profiles), §4.1 (version relationships).
- gkos-engine v1.0.5 source (`src/okf23.ts`, `src/types.ts`) — the enumerations, required-field set, diagnostic vocabulary, and assessment shape the schemas are grounded in.
- GKOS Engine Definitions sheet (proposal envelope, decision record, single-actor waiver, fail-closed sensitivity, three-plane architecture).
- SIDECAR-FORMAT.md (reserved sidecar locations and write constraints).
- Executed fixture run: catalog 0.1.0 against gkos-engine v1.0.5 (6 pass, 0 fail, 2 known divergences), with the emitted claim validating against the proposed conformance-manifest schema.

## Review findings

1. §27's statement that v0.76 "does not yet declare a complete normative serialization" was accurate; a first schema slice can now be published without claiming completeness, because every proposed normative-candidate schema has a demonstrated realization or executed fixture behind it.
2. The frozen v0.76 enumerations (twelve epistemic states, seven sensitivity levels, four-way origin separation) transfer directly into machine-readable form with no semantic change.
3. Executing the first fixture catalog against the reference implementation surfaced three standard/implementation divergences (naive-timestamp projection silence; missing-sensitivity default of `internal` vs the documented restricted fail-closed default; invalid epistemic state flowing into effective state). Recording these openly, rather than authoring fixtures around them, is the fixture program working as designed.
4. Layer artifacts with no shipped realization (L1 Source Record store, L6 Context Manifest, L7 Authorized Use Record) belong in a clearly-marked provisional directory, matching the Annex C posture; the authority-receipt schema, actor-identity model, and upward-receipt chain remain v0.8 gates and are deliberately absent.
5. An adapter-neutral runner keeps GKOS-TS from binding the standard to gkos-engine: the standard ships the runner and catalog; implementations ship adapters.

## Dispositions (proposed)

| Decision | Disposition | Classification | Notes |
| --- | --- | --- | --- |
| R10-084 | Adopt | Normative compatible | Publish the shared-definitions schema and seven normative-candidate schemas (L2 note profiles, L4 assessment/diagnostics, L5 proposal/decision, conformance manifest) under `schemas/`. |
| R10-085 | Adopt | Informative | Publish L1/L6/L7 drafts under `schemas/provisional/` with the no-conformance-claim rule. |
| R10-086 | Adopt | Normative compatible | Publish fixture catalog 0.1.0 (nine fixtures, GCP-1/GCP-3 classes) with engine-generated golden outputs and mask rules. |
| R10-087 | Adopt | Governance clarification | Publish `fixtures/DIVERGENCES.md` as the recorded register of standard/implementation disagreements; disposition of each divergence is a separate engine or standard decision. |
| R10-088 | Adopt | Release administration | Publish the GKOS-TS starter runner and informative gkos-engine adapter under `conformance/runner/`. |
| R10-089 | Adopt | Release administration | Retire stale current-state v0.75 self-references (SECURITY, LICENSE attribution, TRADEMARKS period wording, Known Limitations annex, and the three program READMEs), leaving historical records untouched. |

## Compatibility statement

No existing v0.75 or v0.76 implementation is required to change serialization.
"Normative-candidate" status means published for review under development-phase
governance; promotion to normative is a later recorded decision. The Agent-Ready
(flat 2.3) schema cites a draft technical specification and discloses OKF+ 2.2
as the last ratified baseline per §4.1.

## Supersession and correction

If any schema or fixture proves harmful or ambiguous, a later development
decision may supersede it while preserving this record. Golden outputs are
regenerated, never hand-edited; a golden change requires an engine-version or
catalog-version bump.
