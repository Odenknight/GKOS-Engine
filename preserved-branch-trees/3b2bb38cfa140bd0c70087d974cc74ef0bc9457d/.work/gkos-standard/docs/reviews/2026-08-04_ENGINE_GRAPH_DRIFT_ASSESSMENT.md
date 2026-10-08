# Independent assessment — Engine graph semantics and standard drift

**Date:** 2026-08-04  
**Change class:** Conformance defect review plus corrective implementation  
**Status:** Technical assessment; corrections in the accompanying pull request
remain proposed until adopted through `GOVERNANCE.md`  
**Standard baseline:** `gkos-standard` `89d7de02c7e34880c53cbf5c377d9c9a2dc3223f`  
**Engine baseline:** `GKOS-Engine` `d73e86816df1b800dd9286459722f047266f1cc2` (`1.2.0`)  
**Kosmos-Oden baseline:** `f52ee9e7730f292619e5cc5220e19be87d98973b`

## Executive disposition

The critique's central finding is verified: the Engine has a more operationally
complete lineage implementation than the current normative text, while the
standard's fixture catalog uses Engine-owned `OKF-*` diagnostics and the starter
runner previously converted incomplete execution into profile claims. That is a
conformance-design defect, not proof that the graph semantics themselves are
wrong.

The corrective direction is therefore two-track:

1. stop false conformance claims immediately; and
2. derive clause-stable graph requirements from normative sources before
   comparing them with the Engine.

Engine behavior may propose an amendment under R12-092, but cannot silently
become the standard. Engine-Lite and products sharing the same Engine path
cannot supply implementation independence under R12-090, R12-091, and R12-095.

## Finding-by-finding assessment

| ID | Disposition | Evidence and consequence | Remediation |
| --- | --- | --- | --- |
| D-01 | **Verify; broaden** | `fixtures/fixtures.manifest.json` binds most projection expectations—not only two graph cases—to `OKF-*` codes assigned by the Engine. R10 review finding 5 and R10-088 call the runner adapter-neutral, but the catalog vocabulary crosses that boundary. | Adopt GKOS-owned requirement IDs, then resolve them through implementation adapter maps. Do not mechanically rename codes before the requirement registry exists. |
| D-02 | **Conditionally support** | v0.76 does contain a normative Layer-3 contract in `standard/00_GKOS_Master_Standard.md` §6 and independent minimum graph cases in `TECHNICAL_README.md` §12. What is missing is operational, clause-stable semantics sufficient for executable evaluation. | Use the controlled derivation protocol below; classify every Engine comparison as MATCH, SPEC-GAP, ENGINE-DIV, or AMBIGUOUS. |
| D-03 | **Verify; critical** | The pre-fix runner ignored `pair` and `graph_expect`; its schema could not represent `unevaluated`; `profiles_claimed` was derived from labels present in the manifest. It could therefore claim GCP-3 with no graph evaluation. | Catalog 0.1.1 declares no qualifying profile; the runner emits `unevaluated`, an empty profile list, limitations, and non-zero exit status. A regression test enforces this boundary. |
| D-04 | **Oppose as stated; clarify exact pin** | Kosmos-Oden does not claim to consume current Engine 1.2. Its `package.json` and lockfile pin `gkos-engine` `v1.1.2` at commit `b2a342161aad8944c7ff09caf9345d0dd7c19818`; “v1.1 implementation line” is directionally accurate. | Downstream documentation should state the exact generated pin. Upgrade the dependency only through an ordinary compatibility change, never a README-only edit. |
| D-05 | **Oppose behavioral inconsistency; support boundary clarification** | Engine's unlabeled-object projection default (`secret`) and Kosmos-Oden's ordinary Agent API read ceiling (`internal`) are different controls. Kosmos-Oden already explains that the default is projected before the read filter. | `TECHNICAL_README.md` now states the composition: classification and ceiling both apply; the ceiling cannot reclassify or weaken the object. |
| D-06 | **Verify conflict; reject the binary framing** | `okf-common.defs.json` accepts UUID versions 1–8 or namespaced IDs and describes v7 as preferred; the Engine 2.2 migration code requires lowercase UUIDv4; `OKF-IDENTITY-001` recommends UUIDv7. The standard is internally broader than the alleged “v4 normative reference.” | Do not add UID-version fixtures. Resolve profile-specific identity, migration, and reader compatibility through an owner decision recorded in `OPEN_QUESTIONS.md`. |
| D-07 | **Verify** | Engine lineage comments cite internal Kosmos sections, not stable GKOS requirements. No bidirectional requirement/source/test trace exists. | Add code trace comments and generated traceability only after GKOS requirement IDs are adopted; otherwise comments would manufacture authority. |
| D-08 | **Verify collision; reject the supplied inventory as decision-ready** | Public documents use `KRS`, but the draft also conflates Kosmos-Oden-Lite, KRS Lite, and the separately evaluated `Kosmos_Research_Studio_Lite`/KRR candidate. Choosing a winner from that inventory risks another rename. | Current docs use repository/full names. Complete the product inventory and resolve the open naming question before assigning `KRS`. |
| D-09 | **Mostly remediated; oppose indefinite machine freeze** | R11/R12 and the post-release note already make GKX current while preserving historical text and compatibility identifiers. The proposal to freeze machine identifiers “indefinitely” exceeds R11, which permits a separately versioned migration. | `docs/NAMING.md` records the current vocabulary and preserves the governed migration route. No archive rewrite or permanent freeze is adopted. |
| D-10 | **Verify** | GCP1-N02 duplicated the DIV-003 question in manifest prose and `DIVERGENCES.md`. | Catalog 0.1.1 retains only `open_question_ref: "DIV-003"`; the register remains the single narrative home. |

One additional drift item was found during execution: current and historical
prose called the starter catalog a nine-fixture set, while the manifest contains
eight fixture objects. Current-facing documentation now reports eight; the R10
historical decision record remains unchanged and this correction note preserves
the discrepancy.

## Executed evidence

The Engine source assertions were not accepted from test names alone. At the
baseline above, `npm ci && npm test` rebuilt the distribution and passed all
173 tests, including all ten lineage tests, locale-independent determinism, two
consecutive byte-identical builds, fail-closed sensitivity, and the three
historical DIV-001 through DIV-003 regression cases.

That green Engine run proves the implementation behaves as tested. It does not
prove GKOS conformance because the qualifying, clause-traceable graph suite does
not yet exist.

The corrected catalog 0.1.1 runner was also executed against that built Engine:
six fixtures fully evaluated as PASS, two graph fixtures reported UNEVALUATED,
zero failed, `profiles_claimed` was empty, and the runner exited `1` as a
non-qualifying result. This is remediation evidence, not a GCP claim.

## Controlled graph-clause derivation

“Clean room” is useful shorthand but is not enough under shared authorship. The
auditable procedure should be:

1. Freeze the allowed normative input set: the v0.76 master text, accepted
   decisions, and the last ratified GKX baseline. Exclude Engine source, tests,
   diagnostics, READMEs, and generated outputs from this phase.
2. Draft each testable clause with a source anchor. Mark any unanchored behavior
   `NEW`, not inferred.
3. Commit and hash that clause draft before opening Engine material.
4. In a separate comparison phase, classify each behavior as MATCH, SPEC-GAP,
   ENGINE-DIV, or AMBIGUOUS and cite source plus executed evidence.
5. Apply the ratified intent invariants: authority separation (R2), visible and
   preserved contradiction/history (R3), deterministic evidence-backed
   conformance (R5), capability-not-authority specialization (R6), fail-closed
   sensitivity (R7), and implementation-evidence-not-amendment (R12-092).
6. Route SPEC-GAP and AMBIGUOUS cases through a decision record. Record
   ENGINE-DIV cases in the divergence register and change the implementation.

The comparison result remains first-party reference-implementation evidence.
It strengthens traceability but does not satisfy the independent-implementation
gate.

## Remaining decision gates

- Requirement ID namespace, retirement, and adapter-map contract.
- Normative graph behavior where v0.76 is ambiguous, especially the
  multiple-successor tiebreak and HEAD participation rule.
- Profile-specific UID contract and migration compatibility.
- Complete product inventory and `KRS` disposition.

Until these gates close, no runner result from catalog 0.1.1 may claim GCP-1 or
GCP-3, even if every currently executable assertion passes.
