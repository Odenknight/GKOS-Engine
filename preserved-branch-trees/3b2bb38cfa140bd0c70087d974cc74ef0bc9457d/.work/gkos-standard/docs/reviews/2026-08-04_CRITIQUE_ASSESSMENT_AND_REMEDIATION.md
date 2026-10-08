# GKOS Critique Assessment and Remediation Record

<!-- markdownlint-disable MD013 -->

**Date:** 2026-08-04  
**Repository baseline:** `Odenknight/gkos-standard` main at
`f9375427de7ac5a5bc0bd0b785a28383f8950c98`  
**Reviewed inputs:** Qwen3.8 assessment, Fable5 assessment, draft conformance
profiles, draft provenance crosswalk, draft KRS-Lite independence attestation,
current repository files and PRs, and primary adjacent-specification sources  
**Status:** advisory standards-committee assessment; not independent
certification or consensus ratification

## 1. Executive disposition

The critiques identify the correct central risk: GKOS has a coherent and
unusually candid architecture, but its public evidence, independent adoption,
governance continuity, positioning, and executable conformance remain below the
level needed for a credible v1.0 standard.

The conclusion is not that the seven-layer scope should be discarded. It is
that claims must be narrowed to what is executable today, adoption must become
an explicit workstream, and the project must reuse adjacent standards where
they are already stronger.

The immediate public-documentation corrections are accepted. Claims that KRS or
KRR already satisfies the technical second-implementation gate are rejected as
unsupported. A public case study based on a private agent platform is also
rejected for the current phase; public evidence must come from public artifacts
or a separately authorized disclosure.

## 2. Claim-by-claim assessment

| Critique | Disposition | Reason and evidence |
| --- | --- | --- |
| “Rigorous specification with near-zero gravity” | **Conditionally support** | The architecture and documentation are substantial, while repository adoption indicators remain minimal: the connected GitHub view shows no issues and the observed PR activity is founder-originated. Exact counts in the critiques are stale: main now includes later commits and merged PR #10 at the baseline above. Low visibility is not evidence of rejection, but it is evidence that adoption has not yet been demonstrated. |
| “The honesty is exceptional” | **Support** | README/GOVERNANCE disclaim accreditation and consensus; conformance distinguishes self-attestation; `DIVERGENCES.md` publishes defects instead of hiding them. Candor improves credibility but does not mitigate missing independent evidence. |
| “The seven-layer model is sound” | **Conditionally support** | The responsibilities and re-entry rule are coherent and useful. “Sound” as an implementation claim is premature until an unaffiliated implementer can build and pass frozen, clause-traceable fixtures—especially graph-level GCP-3 and upper-layer controls. Use “coherent” or “plausible” today; reserve “validated” for evidence. |
| “Governance is a monarchy in procedural clothing” | **Verify the structure; oppose the rhetoric as formal terminology** | `GOVERNANCE.md` explicitly assigns v0.x authority to the Founder and Initial Editor and bars consensus/certification claims. That is a disclosed founder-led development process, not multi-stakeholder governance. The material risks are single-person amendment authority, continuity, succession, dominance, and bus factor; those should be stated directly. |
| “Naming churn is a real cost” | **Support with correction** | OKF+ → GKX is one governed technical-model rename, not GKX → GKOS; GKOS and GKX are separate layers. R11 adopted GKX as current while retaining compatibility identifiers. Public material still contains transitional OKF+ text, so the criticism remains actionable. A further public rename absent legal necessity would be damaging. |
| “Conformance suite is thin” | **Verify** | `conformance/README.md` states catalog 0.1.0 covers an early GCP-1/GCP-3 slice and that `graph_expect` is not evaluated. This is the highest technical credibility gap because lineage is a claimed differentiator. |
| “Surface area is too large” | **Conditionally oppose the proposed remedy** | Seven separable layer contracts are defensible; deleting layers would remove the authorized-use differentiator. The adoption burden is real. The near-term remedy is executable incremental GCP claims and implementation bundles, not new untested profile brands or a reduced validator. |
| “Crowded space, weak positioning” | **Verify** | W3C PROV, in-toto, SLSA, Sigstore, C2PA, and MCP cover adjacent provenance, supply-chain, signing, media, and authorization responsibilities. GKOS must map and reuse them, then limit its differentiator to the combined governance of epistemic state, decision, context, authority, and use. |
| “Current trajectory ends as a document nobody uses” | **Conditionally support** | The risk follows from absent external runs, external implementation, and a concrete stakeholder pipeline. The specific two-year forecast is speculative and should not be repeated as fact. The remedy is an outward evidence/adoption program with measurable gates. |
| “Publish a Marshal case study” | **Conditionally oppose for the current phase** | A receipted public case study is valuable, but private agent platforms are outside the authorized public evidence boundary. Use a public reference implementation, synthetic demonstrator, or separately approved disclosure. Private code and deployment claims must not leak into the standard repository. |

## 3. Assessment of the draft solution documents

### 3.1 Draft conformance profiles

**Disposition: conditionally support the adoption-ramp idea; oppose immediate
normative publication as written.**

Reasons:

- GCP-1 through GCP-7 already provide cumulative conformance. Adding
  `GKOS-Core`, `GKOS-Governed`, and `GKOS-Authorized` creates a second public
  naming layer immediately after a naming-stability problem.
- The proposed `GKOS-Core` includes GCP-3, while graph-level GCP-3 expectations
  are not executable. No credible claim can be issued yet.
- A table containing placeholders must not be publicized as a portfolio result.
- `PARTIAL` is a disclosure outcome, not a conformant profile claim.

Accepted solution:

- keep GCP-1..7 as the normative claim names;
- publish informative adoption bundles only after the runner can evaluate every
  requirement included in a bundle;
- publish PASS/FAIL/PARTIAL/UNEVALUATED per requirement, with only complete PASS
  producing a profile claim; and
- require each maintained public implementation to publish a version-pinned
  `CONFORMANCE_STATUS.md` after live execution, never from placeholders.

### 3.2 Draft provenance landscape crosswalk

**Disposition: conditionally support after material correction.**

Required corrections applied in the replacement crosswalk:

- replace exhaustive “uniquely covers” claims with a bounded comparison of the
  reviewed specifications;
- separate implemented facts from proposed mappings;
- do not say GKOS already “imports” standards without executable profiles;
- do not make Sigstore the only acceptable trust root, because public
  transparency can be unsuitable for confidential deployments;
- distinguish signature/integrity from truth and GKOS authority;
- add C2PA 2.4 and current MCP authorization boundaries; and
- require versioned schemas, loss analysis, fixtures, and round-trip policy for
  every interoperability claim.

### 3.3 Draft KRS-Lite implementation-independence attestation

**Disposition: oppose publication and oppose the proposed gate closure.**

The draft is not merely incomplete; its subject is ambiguous. It identifies
“KRS Lite” as `Kosmos-Oden-Lite`, while the later discovery/audit work evaluates
`Kosmos_Research_Studio_Lite` (KRR) as a different candidate. Those products
cannot share one attestation.

[PR #11](https://github.com/Odenknight/gkos-standard/pull/11) records the
selected KRR baseline as non-qualifying:

- no ratified required profile;
- no complete frozen fixture set;
- no fresh conformance run;
- independence criteria blocked/indeterminate;
- standards-artifacts-only criterion failed because Engine behavior was used as
  a mapping authority; and
- prior GKOS alignment means the baseline cannot prove untouched independent
  convergence.

Unchecked evidence boxes cannot be converted into “technical half satisfied.”
The only defensible current state is **OPEN / NOT QUALIFIED**. Future evidence
may change that result, but it requires a correctly identified candidate,
frozen source, dependency lock, source/provenance audit, complete required
profile, frozen fixtures, raw run output, and a predeclared adapter rule.

## 4. Solutions designed for industry scrutiny

### A. Public orientation and stable terminology — immediate

1. Use GKOS for governance and GKX for the exchange model.
2. Use “GKX (formerly OKF+)” on first compatibility-relevant reference.
3. Preserve historical/machine identifiers until a versioned migration.
4. Attribute Google Cloud OKF 0.2 as an external specification that informed and
   is incorporated into a bounded interoperability mapping.
5. Prohibit unqualified “superset,” “fully compatible,” independence, priority,
   sponsorship, or endorsement claims.
6. Freeze public names through v1.0 unless legal/trademark necessity requires a
   recorded exception.

### B. Executable conformance before promotion — P0 technical gate

1. Ratify one required GCP target for the first external run.
2. Add clause-stable requirement identifiers.
3. Implement graph cases for inverse consistency, antisymmetric cycles,
   history-preserving supersession, full lineage field preservation,
   similarity-not-authority, and path-not-identity.
4. Freeze fixtures and expectations before testing candidate implementations.
5. Emit raw machine results plus human report with PASS/FAIL/PARTIAL/UNEVALUATED.
6. Do not advertise the external program until the entry profile is fully
   executable.

### C. Honest implementation evidence — P0 claim gate

1. Publish `CONFORMANCE_STATUS.md` only from live, version-pinned runs.
2. Distinguish self-attested from independently verified visually and in data.
3. Link every failure to a divergence record or issue.
4. Treat inaccessible evidence as indeterminate, not passing.
5. Do not count Engine-Lite as independent; shared semantics are its intended
   contract.

### D. Governance continuity and legitimacy — P0 governance gate

1. Keep the present founder-led v0.x authority explicit.
2. Adopt a continuity/succession clause covering editor unavailability,
   archival continuity, release keys, appointment of an interim maintainer, and
   the irrevocable license/fork rights already granted.
3. Publish the designated non-Founder normative reviewer process.
4. Seat a 3–5 person Technical Steering Group before v1.0 with appointment,
   removal, quorum, voting, recusal, dominance, appeals, and interpretation
   rules.
5. Publish reviewer recruitment as a measurable pipeline rather than a generic
   aspiration.

### E. Interoperability by reuse — P1

1. Build a PROV export profile with explicit semantic-loss markers.
2. Wrap selected test/release evidence in in-toto statements.
3. Apply SLSA to implementation source/build assurance rather than claiming it
   governs knowledge.
4. Preserve C2PA credentials as evidence for applicable media.
5. Bind MCP authorization evidence to Context Manifest and Authorized Use
   Records without treating OAuth scopes as epistemic authority.
6. Define public, enterprise, and offline signing/anchoring profiles.

### F. External validation and adoption — P1

1. Publish one public synthetic or open-source end-to-end demonstrator with
   replayable receipts; do not depend on private platform disclosure.
2. Invite at least three external reviewers and report seats filled/open.
3. Obtain one unaffiliated implementation or adapter-free consumer of the
   frozen entry profile.
4. Run the same frozen fixtures in at least three external environments.
5. Publish burden, ambiguity, failure, and correction data—not only passes.

## 5. Changes enacted by this remediation

- replaced the root README with a plain-language explanation, 90-second
  walkthrough, AgenticOS rationale, accurate naming/provenance, maturity limits,
  standards positioning, and repository guide;
- added `TECHNICAL_README.md` for implementers;
- added a corrected, claim-limited provenance landscape crosswalk;
- corrected the Google Cloud OKF third-party notice;
- preserved R12's accepted compatibility/provenance decisions in the public
  decision path;
- added post-release GKX naming guidance to the v0.76 master without rewriting
  the archived release meaning; and
- expanded the roadmap with conformance-first, governance-continuity, and
  outward-validation gates.

## 6. Remaining decisions requiring explicit governance action

This remediation does not self-adopt:

- a constitutional succession mechanism;
- new named conformance profiles;
- any implementation's conformance or independence;
- a signing/trust profile;
- an external reviewer or steering-group appointment; or
- a v1.0 claim.

Those require their own evidence, decision classification, review, and adopted
record under `GOVERNANCE.md`.
