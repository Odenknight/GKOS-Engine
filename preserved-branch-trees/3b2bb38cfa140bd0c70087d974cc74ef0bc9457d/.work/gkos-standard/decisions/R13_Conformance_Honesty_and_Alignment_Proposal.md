# R13 — Conformance honesty and documentation alignment proposal (superseded)

**Status:** Superseded by accepted development decision R13 on 2026-08-05
**Date:** 2026-08-04  
**Authorizing editor:** Founder and Initial Editor
**Review basis:** Source inspection, executed GKOS-Engine 1.2.0 test suite, and
the independent drift assessment linked below

This proposal is retained as the pre-decision record. Its accepted dispositions,
including the UUIDv7 forward policy and requirement-ID format, are recorded in
[R13_Conformance_Honesty_and_Alignment_Development_Decision_Record.md](R13_Conformance_Honesty_and_Alignment_Development_Decision_Record.md).

## Original problem statement

The starter runner can publish profile claims for labels present in an
incomplete catalog while ignoring declared pair and graph expectations. The
catalog also binds expectations directly to reference-implementation diagnostic
codes. Separately, graph behavior is more operationally complete in the Engine
than in clause-stable normative text.

## Original proposed dispositions (superseded)

- **R13-097 — Runner honesty (normative-compatible correction):** a fixture with
  an unexecuted required expectation is `UNEVALUATED`, not PASS; the run exits
  non-zero; only a catalog-declared complete profile whose required fixtures all
  pass may appear in `profiles_claimed`; an evidence run may claim no profile.
- **R13-098 — Requirement/adapter boundary (normative-compatible proposal):**
  fixtures reference GKOS-owned requirement IDs; implementation diagnostics and
  output observations live in adapter maps. The exact namespace remains open.
- **R13-099 — Controlled derivation (governance clarification):** under-documented
  normative clauses are drafted from a frozen normative-only corpus, sealed,
  and then compared with implementation behavior. Shipped behavior never amends
  the standard automatically.
- **R13-100 — Naming interpretation (clarification):** use GKX as the current
  public name; retain machine identifiers under R11's governed migration rule,
  not an indefinite freeze; use unambiguous repository/full product names until
  the `KRS` collision is decided.
- **R13-101 — Identity ambiguity (preservation):** do not test a UID version until
  the 2.2 authoring, 2.3 exchange, internal identity, and migration contracts are
  explicitly reconciled.

## Evidence

- [Engine/standard drift assessment](../docs/reviews/2026-08-04_ENGINE_GRAPH_DRIFT_ASSESSMENT.md)
- [Documentation/engineering alignment proposal](../docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md)
- `conformance/runner/run.mjs` before and after this proposal
- `fixtures/fixtures.manifest.json` catalog 0.1.1
- `GKOS-Engine` 1.2.0: 173/173 tests passed at commit
  `d73e86816df1b800dd9286459722f047266f1cc2`

## Compatibility and security impact

R13-097 is intentionally stricter in reporting: prior runs may have listed a
profile that the suite did not qualify. The corrected runner can emit an empty
profile list and a non-zero exit for incomplete evidence. It does not change an
implementation's data or Engine behavior.

R13-098 and R13-099 prevent a shared reference implementation from becoming the
hidden conformance oracle. R13-101 avoids an incompatible UID migration before
reader and writer behavior is decided.

## Limitations and decision boundary

This proposal is first-party technical review, not independent verification or
consensus. R13-097 has an implementation in the accompanying branch; R13-098
through R13-101 remain policy/procedure proposals or preserved questions. No
GCP profile becomes qualifying through this proposal.

## Rollback or supersession

The runner correction may be superseded only by a later schema-compatible claim
model that preserves the rule that unexecuted required expectations cannot
produce PASS or a profile claim. Requirement IDs and identity behavior must be
superseded through recorded mappings and migration rules, never silent reuse.
