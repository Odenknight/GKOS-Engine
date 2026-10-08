# Open publication and governance questions

These questions remain unresolved after R1–R13 and do not override recorded development decisions. Questions 4–6 are explicitly v1.0 governance gates; they are not prerequisites for continued v0.x concept testing and refinement.

1. What dedicated project addresses should be established for conduct, security, licensing, and trademark matters?
2. Should the repository later migrate to a dedicated organization?
3. What informative website should be established?
4. What formal review periods apply by change class for v1.0 and later?
5. How are v1.0 editors and committee members appointed and removed?
6. What voting, quorum, dominance, recusal, complaint, and appeal rules apply for v1.0 and later?
7. Which release-signing and key-custody model will be used?
8. Which archival service will issue a DOI or persistent identifier?
9. What final brand guide will govern the provisional logo?
10. What stable namespace, URI, serialization, and schema strategy will be normative?
11. What fixture set is required for each GCP profile?
12. What qualifies as an independent implementation?
13. Which standards development organization, if any, should be approached after the v1.0 gates are met?
14. Which graph behaviors beyond the existing v0.76 Layer-3 contract become
    normative: inverse normalization, cycle preservation, HEAD derivation,
    unresolved-edge rejection, and the multiple-successor tiebreak?
15. Which public product, if any, may use the abbreviation `KRS` after the
    complete product/repository inventory and upstream naming gates are resolved?

## Resolved after the v0.76 release

- R13 adopts `GKOS-<AREA>-<NNN>` as the clause-stable requirement-ID form and
  prohibits silent identifier reuse.
- R13 adopts lowercase UUIDv7 for newly created identities, preserves legacy
  lowercase UUIDv4 identities permanently, and requires branch-preserving
  lineage for any migration. Reader support remains intentionally broader for
  established historical forms.
