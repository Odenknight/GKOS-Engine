# Q-INTENT read-only resolution

**Review date:** 2026-08-31  
**Disposition:** `OWNER_DECISION_REQUIRED`  
**Scope:** Local preserved R4 source, the controlling roadmap, and the Standard R18 copy of `GKOS-DOCSTD-001`. No historical source, Standard candidate, integration branch, or release artifact was changed for this analysis.

## Source coordinates and authority

1. `orchestration/2026-08-31/sources/GKOS-RUST-UPLIFT-R4-2026-08-27.md` (SHA-256 `e0a82edfd4d1c4845366cf059eb9b951cf5cdc8409a5ab6bfcec2ff45f07bc54`), heading **“Phase 12 — Downstream integration and release cut”**, line 450:

   > “Run the eight-invariant documentation intent gate and update `DIVERGENCES.md`, `TRACEABILITY.md`, stability promises, migration guides, and third-party notices.”

   This is the only eight-invariant wording located in the preserved R4 source. It states a cardinality but does not enumerate or name eight invariants.

2. `orchestration/upgrades/standard-r18/docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md` at audited Standard base `aa9a05315a9a767bd672aa2bb5179c963d9d66ca` (working-file SHA-256 `e3a95224575d5614beed1fa4e958ab4b89e73a0a627e2e15522432edc656c0e6`), heading **“4. Intent review”**, lines 53–68. Its own status is exactly **“Proposed; non-normative until adopted through `GOVERNANCE.md`.”** The heading says an amendment candidate must preserve “all applicable accepted invariants,” then supplies seven table rows:

   1. “Authority derives from receipts/grants, not authored fields or model signals”
   2. “Contradiction and history remain visible and reconstructable”
   3. “Mandatory controls and conformance evidence are deterministic and disclosed”
   4. “Agent specialization grants capability, not authority”
   5. “Missing/invalid sensitivity fails closed”
   6. “Implementation experience proposes but does not amend”
   7. “Identity is independent of path/location”

   The section closes: “Passing intent review makes a behavior eligible for a decision; it does not adopt the behavior.” Thus the document neither supplies an eighth row nor adopts its own checklist.

3. `orchestration/GKOS-ECOSYSTEM-TS-FIRST-RUST-ROADMAP.md` (SHA-256 `cd7e57d93b714f481bcd3f446332abca73d93e0605af0a4351804155ef267670`):

   - heading **“1. Owner decision gates”**, Q-INTENT row at line 43, explicitly requires reconciliation of R4's eight reference with the proposed seven-row checklist and says: “do not fabricate an eighth invariant or report eight checks passed.”
   - heading **“R4-12 — Downstream integration and separately authorized cutover”**, lines 466–468, requires the gate to use an **adopted exact checklist**, repeats the same seven-item synopsis, and directs reconciliation in Q-INTENT/R4-0 while preserving the adoption distinction.

## Exact mapping

R4 provides no item-level list to map. The strongest mapping supported by local text is therefore between the roadmap's seven-item synopsis and the seven exact DOCSTD rows:

| Roadmap synopsis (line 468) | Exact DOCSTD row | Result |
| --- | --- | --- |
| receipt/grant-based authority | Authority derives from receipts/grants, not authored fields or model signals | Direct match |
| preserved contradictions/history | Contradiction and history remain visible and reconstructable | Direct match |
| deterministic disclosed mandatory checks | Mandatory controls and conformance evidence are deterministic and disclosed | Direct match |
| specialization without authority transfer | Agent specialization grants capability, not authority | Direct match |
| fail-closed sensitivity | Missing/invalid sensitivity fails closed | Direct match |
| implementation evidence not automatically amending the Standard | Implementation experience proposes but does not amend | Direct match |
| path-independent identity | Identity is independent of path/location | Direct match |
| No eighth synopsis item | No eighth DOCSTD row | Unspecified |

No two DOCSTD rows can be identified from these sources as a combined version of two R4 items, because R4 never gives the item wording. The discrepancy is therefore an **unnamed/undefined eighth item in the R4 cardinality reference**, rather than a locally demonstrable omission or combination with a recoverable name.

## Resolution boundary

Local authority cannot select an eighth invariant, split one of the seven rows, silently change “eight” to “seven,” or adopt the proposed checklist. Any of those acts would create intent absent from the preserved R4 text and conflict with the roadmap's explicit non-fabrication instruction.

Q-INTENT remains an owner decision with two textually supported resolution routes:

1. identify and adopt the exact eight-item checklist, including authoritative wording and provenance for item eight; or
2. formally amend R4's cardinality/reference and separately adopt an exact checklist through the required governance route.

Until one route is recorded, R4-12's documentation-intent gate is not executable as an eight-check gate and must not be reported as passed. The seven DOCSTD rows may be reviewed as proposal content, but that review is not adoption, eight-check completion, conformance, or release evidence.
