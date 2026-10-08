# GKOS ecosystem roadmap

<!-- markdownlint-disable MD013 -->

This roadmap governs ecosystem sequencing. It is informative: normative changes
still require the amendment and decision-record process in the GKOS standard.

## Repository responsibilities

| Repository | Lifecycle | Sole roadmap responsibility |
| --- | --- | --- |
| `gkos-standard` | Active, canonical | Normative governance, GKX exchange specification, conformance gates, schemas, fixtures, and ecosystem policy |
| `GKOS-Engine` | Active | Canonical deterministic, platform-neutral implementation of GKX under GKOS |
| `GKOS-Engine-Lite` | Active, thin distribution | CLI and desktop distribution of GKOS-Engine; no independent governance semantics |
| `Kosmos-Oden` | Active | Reference end-user application and Obsidian integration consuming GKOS-Engine |
| `Kosmos-Oden-Lite` | Frozen | Stable 1.0.x maintenance line; compatibility, security, data-integrity, and documentation fixes only |

Dependency direction is one-way: **GKOS/GKX specification → GKOS-Engine →
distributions and applications**. Implementations may supply evidence and
proposals, but cannot redefine the standard. `Kosmos-Oden-Lite` is not an upstream
dependency and is not expected to track current-engine parity.

Private product repositories are excluded from public conformance or adoption
evidence unless a separate disclosure decision authorizes a specific artifact.

See [Ecosystem organization](docs/ECOSYSTEM-ORGANIZATION.md) for decision rights,
cross-repository change rules, and release coordination.

## Phase A — Ecosystem cohesion

The July/August 2026 rebranding, attribution, and compatibility decisions
establish GKX as the current technical name while retaining versioned OKF+
identifiers where compatibility requires them.

- Publish the same repository map and lifecycle language across the family.
- Route normative and exchange-model changes to `gkos-standard`.
- Keep shared deterministic behavior in `GKOS-Engine`; prohibit re-vendoring in
  active downstream products.
- Keep Engine-Lite thin and `Kosmos-Oden` product-specific.
- Enforce the `Kosmos-Oden-Lite` frozen-core boundary and document selective backports.
- Use linked issues or PRs for changes spanning ownership boundaries; merge
  upstream before downstream adoption.
- Enforce current-facing terminology: GKOS for governance, GKX for exchange,
  OKF+ only for historical/compatibility references, and Google Cloud OKF only
  for the version-scoped external interoperability profile.

## Phase B0 — Credible entry conformance

This is the highest-priority technical gate before broad external outreach.

- Select and adopt the first required external-run GCP target.
- Add stable clause/requirement identifiers and requirement-to-fixture traces.
- Make graph-level GCP-3 expectations executable, including inverse
  consistency, antisymmetric cycles, history-preserving supersession, complete
  lineage fields, similarity-not-authority, and path-not-identity.
- Freeze the source-derived fixture version and expected results before each
  candidate run.
- Emit PASS, FAIL, PARTIAL, and UNEVALUATED distinctly; only complete PASS may
  support a profile claim.
- Publish raw results, artifact hashes, environment/tool versions, divergences,
  and limitations.
- Require maintained public implementations to publish version-pinned
  `CONFORMANCE_STATUS.md` files only after live execution.

## Phase B1 — Core standard engineering, v0.8–v0.9

- Complete stable requirement identifiers and normative/informative separation.
- Complete machine-readable layer artifacts, GKX schemas, and stable namespaces.
- Build executable GKOS-TS fixtures for GCP-4 through GCP-7 and trace them to
  requirements.
- Define authority receipts, actor identity, attestation chains, Decision Record
  integrity, and single-actor waiver behavior.
- Add governed signing/anchoring profiles for public-transparency, enterprise,
  and offline deployments.
- Add signed release manifests, SBOMs where applicable, and persistent archival
  identifiers.
- Conduct legal, security, privacy, records-management, and independent
  implementer review.

## Phase B2 — Interoperability by reuse

- Publish a W3C PROV export profile for Layers 1–3 with explicit semantic-loss
  markers and round-trip expectations.
- Publish in-toto statement predicates for selected fixture, validation, and
  release evidence.
- Apply SLSA source/build tracks to released implementations.
- Define C2PA evidence-intake behavior for applicable media.
- Bind MCP authorization evidence to Context Manifest and Authorized Use Record
  hashes without treating protocol access as epistemic authority.
- Publish the Google Cloud OKF 0.2 subset profile and fixtures required by R12;
  prohibit claims about later versions until separately adopted.

## Phase B3 — External validation and adoption

- Publish one open, synthetic, end-to-end demonstrator with replayable receipts.
- Directly invite at least three external reviewers and publish filled/open
  reviewer seats.
- Obtain at least one unaffiliated implementation or adapter-free consumer of
  the frozen entry profile.
- Execute the same frozen fixtures in at least three independent environments.
- Publish implementation burden, ambiguities, failures, negative results,
  corrective actions, and cost—not only successful demonstrations.
- Begin with lower-risk research, document, and enterprise workflows before
  safety-critical or regulated deployment claims.

## Phase B4 — Governance continuity

- Publish continuity and succession rules covering editor unavailability,
  interim maintenance, release/signing authority, archive continuity, and
  transfer of governance records.
- Publish the designated non-Founder normative reviewer process.
- Establish a 3–5 person Technical Steering Group before v1.0.
- Define appointments, removal, quorum, voting, abstention, recusal, dominance
  safeguards, appeals, complaints, interpretations, and conflict disclosures.
- Track stakeholder/reviewer recruitment as a measurable public pipeline.

## Phase C — v1.0 gates

- A qualifying second independent implementation using only public standard
  artifacts as authority.
- Demonstrated exchange and diagnostic interoperability.
- Complete conformance suite for every normative v1.0 claim.
- Formal amendment authority and multi-stakeholder governance.
- Voting, quorum, recusal, appeals, interpretations, succession, and dominance
  safeguards.
- Trademark/name administration and final brand guide.
- Canonical signed publication and persistent archival identifier.

No implementation release, including `Kosmos-Oden` or either Lite product, satisfies
these gates on behalf of the standard. No private product may be used as public
gate evidence without an explicit disclosure record.

## Evidence dashboard

| Gate | Current state | Required closure evidence |
| --- | --- | --- |
| Current public name/lineage | In progress | Repository-wide current-facing terminology check and preserved compatibility map |
| Graph-level entry conformance | Blocked | Executable, clause-traceable GCP-3 graph fixtures and raw runner results |
| Upper-layer conformance | Blocked | Frozen GCP-4..7 requirements, fixtures, runner coverage, and result reports |
| Google Cloud OKF 0.2 interoperability | Proposed/partial | Versioned field mapping, loss policy, fixtures, and round-trip evidence |
| Independent implementation | Blocked | Candidate passes all predeclared independence criteria and frozen required profile |
| External reviewer pipeline | Open | Named/consenting reviewers and published dispositions |
| Governance continuity | Open | Adopted succession and interim-maintenance mechanism |
| Technical Steering Group | Open | 3–5 members under adopted charter |
| Signed archival publication | Open | Adopted trust profile, signed artifacts, reproducible verification, persistent archive |

## Coordination gates

1. A normative or GKX contract change lands in `gkos-standard` first.
2. GKOS-Engine adopts the versioned contract and publishes compatibility evidence.
3. Engine-Lite and `Kosmos-Oden` adopt the Engine release without duplicating its core.
4. `Kosmos-Oden-Lite` receives a backport only when its maintenance policy permits it;
   otherwise the difference is recorded as intentional.
5. Each repository maintains its own release notes and tests. Ecosystem status is
   reported here without turning product milestones into normative claims.
6. Experimental implementation behavior remains labeled experimental until an
   adopted standard decision and transition window exist.
