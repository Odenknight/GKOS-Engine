# GKOS development decision register

## R12 — Ecosystem compatibility and provenance

- **Date:** 2026-08-03
- **Status:** Accepted development decision
- **Decision:** Preserve one deterministic semantics authority; define
  Engine-Lite equivalence and bounded drift; govern experimental field-test
  evidence; continue GKX 2.3 from the OKF+ 2.2/2.3 line; limit Google Cloud OKF
  interoperability to a versioned 0.2 subset; and correct unsupported
  independence/priority language.
- **Record:** [R12_Ecosystem_Compatibility_Development_Decision_Record.md](R12_Ecosystem_Compatibility_Development_Decision_Record.md)

## R11 — GKX naming transition

- **Date:** 2026-08-02
- **Status:** Accepted development decision; compatibility migration in progress
- **Decision:** Rename the technical exchange model from OKF+ to GKX (Governed
  Knowledge Exchange), retain legacy identifiers as compatibility aliases, and
  require a separately versioned migration before machine-facing removals.
- **Record:** [R11_GKX_Naming_Transition_Development_Decision_Record.md](R11_GKX_Naming_Transition_Development_Decision_Record.md)

## R13 — Conformance honesty and alignment

- **Date:** 2026-08-05
- **Status:** Accepted development decision; v0.x non-consensus authority
- **Decision:** Require honest non-qualifying runner output; reserve
  `GKOS-<AREA>-<NNN>` for clause-stable requirements; keep implementation
  diagnostics behind adapter mappings; adopt controlled clause derivation;
  retain GKX naming compatibility; and make R13-101 the sole identity-and-
  lineage decision, with permanent lowercase UUIDv7/legacy lowercase UUIDv4,
  branch-preservation, earliest-valid-successor `invalid_at`, and
  no-authoritative-tiebreak allocations in `requirements/REGISTRY.md`.
- **Record:** [R13_Conformance_Honesty_and_Alignment_Development_Decision_Record.md](R13_Conformance_Honesty_and_Alignment_Development_Decision_Record.md)

## Status of v0.x records

R1 through R12 are development decisions from the pre-v1.0 testing and refinement phase. They record the evolving design and the Founder and Initial Editor's dispositions. They are not formal consensus ratifications, independent certifications, accredited standards decisions, or regulator approvals.

## Round 1 — Identity and publication

R1-001 through R1-008 establish the canonical name, dated release identity, one normative master standard with annexes, GKOS/OKF+/Kosmos-Oden separation, deprecated historical names, core trust thesis, domain neutrality, and MUST/SHOULD/MAY language.

## Round 2 — Authority

R2-009 through R2-016 establish receipt-and-grant authority, no inherent agent authority, bounded deterministic policy automation, retained human authority for consequential semantics unless delegated, governed delegation, restrictive security powers, non-self-approval, and authority precedence.

## Round 3 — Epistemic governance

R3-017 through R3-026 establish immutable source revisions subject to lawful governed erasure, sources as evidence rather than guaranteed truth, provenance-bearing assertions, agent proposals, authorized projections rather than absolute truth, visible contradictions, distinct supersession, immutable rejection history, and governed epistemic promotion.

## Round 4 — Layer contracts

R4-027 through R4-036 establish cumulative layer responsibilities and the Source Record, Structured Knowledge Object, assertion/lineage records, diagnostics/control receipts, Decision Record, Context Manifest, Authorized Use Record, Layer-1 re-entry, and incomplete-object restrictions.

## Round 5 — Conformance and interoperability

R5-037 through R5-045 establish GCP-1 through GCP-7, cumulative conformance, Viewer/Projection requirements, evidence-backed claims, provisional GKOS-TS and OKP-CH status, independent implementation as a v1.0 gate, normative event semantics where used, and separation of authored, derived, proposed, and governed state.

## Round 6 — Specialized Agents

R6-046 through R6-057 establish the Specialized Agent definition and contract, layer placement, non-authoritative domain expertise, Governance Coordinator terminology, proposal status of extraction, temporary restrictive security powers, neutral review assistance, Context Compiler duties, authorized Operational Agents, bounded orchestration, and constrained subdelegation.

## Round 7 — Security, publication, and maturity

R7-058 through R7-068 establish fail-closed sensitivity, governed erasure, sensitive provenance, secure agent interfaces, workload governance, dual licensing, canonical version-controlled publication, naming-risk disclosure, glossary freeze, limitations register, and public pre-standard maturity.

## Round 8 — Publication administration

- R8-069: Canonical repository is `Odenknight/gkos-standard`; later migration requires a development or governance decision.
- R8-070: Use GitHub Discussions and private vulnerability reporting until dedicated project addresses exist.
- R8-071: Copyright notices identify Shaun “Oden” Marshall.
- R8-072: Adopt the shield-and-governed-network design as provisional working logo.
- R8-073: CC BY 4.0 covers documentation and original graphics; Apache-2.0 covers software-oriented material.
- R8-074: Contributions intended for merge require DCO 1.1 sign-off.
- R8-075: GitHub remains canonical until a separately governed project site exists.

## Round 9 — v0.76 concept-refinement decisions

- **R9-076:** Freeze the twelve-state epistemic vocabulary directly in GKOS v0.76; cite OKF+ 2.3 informatively rather than as a mutable normative dependency.
- **R9-077:** Adopt full mechanical definitions for consequential use, blast radius, materially equivalent proposals, and defect-badge-or-refuse behavior.
- **R9-078:** Publish the layer-to-artifact mapping as an informative annex.
- **R9-079:** Separate GKOS, technical-specification, and implementation version claims.
- **R9-080:** Adopt progressive-disclosure requirements while keeping decision-material warnings visible by default.
- **R9-081:** Publish a provisional authority-receipt field list without claiming a complete receipt mechanism.
- **R9-082:** Treat all v0.x modifications as testing-and-refinement development decisions; formal consensus ratification begins only under the future v1.0 governance model.
- **R9-083:** Publish GKOS-2026-07-20 v0.76 and retain engine and Specialist Reviewer material as standalone informative documents outside the normative scope.

See `R9_V0.76_Development_Decision_Record.md` for evidence, review basis, limitations, and release authorization.

## Round 10 — Schema slice, fixture catalog, and conformance runner

- **R10-084:** Publish the shared-definitions schema and seven normative-candidate schemas (L2 note profiles, L4 assessment/diagnostics, L5 proposal/decision, conformance manifest) under `schemas/`.
- **R10-085:** Publish the L1/L6/L7 drafts under `schemas/provisional/` with the no-conformance-claim rule.
- **R10-086:** Publish fixture catalog 0.1.0 (nine fixtures, GCP-1/GCP-3 classes) with engine-generated golden outputs and mask rules.
- **R10-087:** Publish `fixtures/DIVERGENCES.md` as the recorded register of standard/implementation disagreements; disposition of each divergence is a separate engine or standard decision.
- **R10-088:** Publish the GKOS-TS starter runner and informative gkos-engine adapter under `conformance/runner/`.
- **R10-089:** Retire stale current-state v0.75 self-references (SECURITY, LICENSE attribution, TRADEMARKS period wording, Known Limitations annex, and the three program READMEs), leaving historical records untouched.

See `R10_Schema_Fixture_Conformance_Dev_Decision_Record.md` for evidence, review basis, limitations, and release authorization.

## Round 12 — Ecosystem compatibility and interoperability provenance

- **R12-090:** Engine-Lite uses its pinned Engine's deterministic path for the
  four commands, with normalized byte-equivalence rules and at most one minor
  version of current-release drift.
- **R12-091:** Engine-Lite removes interfaces and workflows, not validation
  semantics; it is not a second validator or permissive subset.
- **R12-092:** Experimental implementations may run ahead behind an explicit
  boundary; implementation evidence can propose but cannot amend the standard.
- **R12-093:** GKX 2.3 continues the OKF+ 2.2/2.3 line under the current name.
- **R12-094:** Google Cloud OKF interoperability is optional, version-scoped to
  a declared 0.2 subset, and requires mappings, loss rules, and fixtures.
- **R12-095:** GKOS-Engine remains the deterministic semantics authority for the
  active product family; frozen or independent implementations require explicit
  evidence and limitations.
- **R12-096:** Remove unsupported “without reference to” provenance language and
  avoid priority, foundation, sponsorship, and endorsement overclaims.

See `R12_Ecosystem_Compatibility_Development_Decision_Record.md` for the exact
decision text, limitations, compatibility impact, and follow-up evidence.
