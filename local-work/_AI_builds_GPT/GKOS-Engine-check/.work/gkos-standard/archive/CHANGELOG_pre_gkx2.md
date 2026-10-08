# Changelog

## GKOS-2026-08-05 v0.78

- Adopted R14: GKX 2.0 is the breaking current machine namespace. Current
  schemas, fixtures, adapters, examples, and operational guidance use
  `gkx_version`, `.gkx/`, `GKX-*`, and `gkx`.
- Superseded the prior machine-identifier preservation policy without altering
  immutable historical release directories.
- Added GKX 2.0 shared definitions and record-frontmatter schemas.

## GKOS-2026-08-05 v0.77

**Authorized developmental publication; non-consensus.** The intended tag is
`v0.77`; this local worktree does not create that tag, push it, or create a
hosting-provider release object.

- Accept R13: honest `UNEVALUATED` reporting, non-qualifying catalog 0.1.1,
  clause-stable `GKOS-<AREA>-<NNN>` requirement IDs, controlled
  implementation comparison, and GKX compatibility terminology.
- Adopt lowercase UUIDv7 for newly created identities while permanently
  retaining valid lowercase UUIDv4 identities and branch-preserving lineage.
- Preserve the published v0.76 release package without amendment.

## Unreleased — conformance-honesty remediation (implemented evidence)

- Mark unexecuted pair and graph expectations `UNEVALUATED`, block profile
  claims, disclose limitations, and return a non-qualifying exit status.
- Declare fixture catalog 0.1.1 a non-qualifying starter slice and permit an
  evidence manifest to carry an empty `profiles_claimed` array.
- Add a runner regression test and CI job.
- Publish the Engine/standard drift assessment, naming policy, and controlled
  documentation/engineering alignment proposal.
- Preserve unresolved requirement-ID, graph, UID-profile, and product-name
  questions instead of deriving their answers from implementation behavior.

## GKOS-2026-07-20 v0.76

Concept-refinement and documentation-clarification release. This is a developmental adoption under the v0.x governance model, not a consensus ratification or independent certification.

- Defined the v0.x testing-and-refinement governance posture and deferred formal consensus governance to the v1.0 gate.
- Froze the twelve-state GKOS epistemic vocabulary while citing OKF+ 2.3 informatively (R9-076).
- Added full mechanical definitions for consequential use, blast radius, materially equivalent proposals, and defect-badge-or-refuse behavior (R9-077).
- Published an informative layer-to-artifact mapping annex (R9-078).
- Clarified implementation, technical-specification, and GKOS version relationships (R9-079).
- Added full progressive-disclosure requirements to the Viewer/Projection Profile (R9-080).
- Expanded the provisional, non-normative authority-receipt field list (R9-081).
- Added a dedicated v0.76 Development Decision Record.
- Added standalone informative references for the GKOS Engine v1.0 build and OKF+ 2.3 Specialist Reviewer role.
- Updated release identity, citation, notice, roadmap, governance, and release package metadata.

## GKOS-2026-07-17 v0.75

Initial public pre-standard and implementation-draft release.

- Established the canonical seven-layer reference model.
- Separated GKOS governance, OKF+ technical specification, and Kosmos-Oden implementation.
- Recorded authority, epistemic, layer-contract, conformance, Specialized Agent, security, publication, licensing, DCO, and canonical-repository decisions R1-001 through R8-075.
- Published provisional GCP-1 through GCP-7 and Viewer/Projection requirements.
- Adopted the provisional working logo and modernized OSI comparison.
