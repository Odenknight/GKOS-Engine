# Governed Knowledge Operations Standard

**Identifier:** GKOS-2026-07-20 v0.76
**Status:** Public pre-standard and concept-refinement release
**Normative terms:** MUST, MUST NOT, SHOULD, SHOULD NOT, MAY

> **Post-release naming note (informative):**
> [R11](../decisions/R11_GKX_Naming_Transition_Development_Decision_Record.md)
> renamed the technical exchange model from OKF+ to **GKX (Governed Knowledge
> Exchange)** while preserving historical and machine-facing compatibility
> identifiers.
> [R12](../decisions/R12_Ecosystem_Compatibility_Development_Decision_Record.md)
> limits Google Cloud OKF interoperability to a declared, version-scoped 0.2
> subset and corrects unsupported independence/priority language. The retained
> OKF+ wording below records the v0.76 release terminology; it is read as GKX for
> current-facing use unless a compatibility identifier is expressly preserved.

## 0. Development status

GKOS v0.76 remains in the pre-v1.0 testing and refinement phase. Changes recorded during the v0.x series are developmental adoptions by the Founder and Initial Editor after documented technical review. They are not consensus ratifications, independent certifications, accredited standards decisions, or claims that the complete future governance body has been seated.

External reviewers are being assembled. Formal multi-stakeholder amendment authority, voting, quorum, appeal, and consensus procedures are v1.0 gates. Until then, development records MUST identify their review basis, authorizing editor, limitations, and non-consensus status.

## 1. Purpose

GKOS defines a domain-neutral governance model for preserving evidence, structuring identity, recording semantic assertions and lineage, enforcing deterministic controls, governing review, compiling reproducible context, and authorizing consequential use.

## 2. Core thesis

Knowledge becomes trustworthy through accumulated, governed operations over preserved evidence, explicit assertions, recorded decisions, and reproducible context.

GKOS does not declare absolute truth. It distinguishes evidence, assertions, proposals, validation results, decisions, accepted knowledge, projections, and authorized uses.

## 3. Architecture and version relationships

GKOS defines governance. OKF+ defines technical objects and protocols. Kosmos-Oden and the GKOS Engine are implementations and cannot redefine the standard by themselves.

An implementation's version number, including an internal "Engine v1.0," does not imply that GKOS has reached v1.0. The GKOS v1.0 gates are satisfied only by a recorded future governance decision under the v1.0 governance model.

A conformance claim citing a draft technical specification MUST disclose that status and identify the last ratified baseline. OKF+ 2.3 is presently a draft technical specification; OKF+ 2.2 remains the last ratified baseline. GKOS v0.76 freezes the epistemic vocabulary below directly, so conformance does not depend on the continuing contents of the OKF+ 2.3 draft.

## 4. Authority

Authority comes only from authenticated authority receipts and explicit governance grants. Agents possess no inherent authority. Confidence, prompts, role names, graph position, retrieval rank, similarity, model identity, tool access, and claimed expertise do not create authority.

Deterministic policy MAY automatically approve an operation only when explicitly authorized, bounded, reproducible, and recorded. No actor may approve, review, validate the authority of, authorize, or certify its own work under a profile that claims separation of duties.

A v0.x developmental adoption by the Founder and Initial Editor MUST be identified as such and MUST NOT be represented as independent review, consensus ratification, or certification.

Authority precedence is:

1. Constitution.
2. Safety and applicable law.
3. Security restrictions.
4. Authority receipts.
5. Accepted governance.
6. Deterministic policy.
7. Human assertions.
8. Agent proposals.
9. Similarity and retrieval.

A lower-precedence item MUST NOT widen a higher-precedence restriction.

## 5. Epistemic model

Retained source revisions are immutable except through governed deletion, redaction, tombstoning, or crypto-shredding required by law, policy, retention, privacy, or legal hold. Sources are evidence, not guaranteed truth.

Human assertions carry provenance and only their author's authority unless separately governed. Agent outputs remain proposals or projections until governed promotion. Contradictions remain visible. Supersession, contradiction, correction, withdrawal, rejection, deletion, and governed erasure are distinct operations. Confidence alone cannot promote epistemic state.

### 5.1 Epistemic state vocabulary

GKOS v0.76 defines the following twelve-state vocabulary, informed by the OKF+ 2.3 draft but frozen here as self-contained GKOS normative text:

`unknown → observation → reported → inferred → hypothesis → modeled → supported → contested → refuted → retracted → accepted → superseded`

A conforming Layer 3 implementation MUST record epistemic state as one of these values or provide a documented, deterministic mapping from an equivalent enumeration.

Promotion to `accepted` requires a corroborating Decision Record. Confidence, retrieval rank, similarity, model identity, and assessment score are insufficient by themselves.

Epistemic state, object class, review disposition, and temporal validity are four separate dimensions and MUST NOT be collapsed into one field or one state machine.

## 6. Seven layer contracts

1. **Original Sources** produce a Source Record with revision identity, fingerprint, provenance, media type, custody, retention and sensitivity defaults, locators, and ingestion receipt.
2. **Structure and Identity** produce a Structured Knowledge Object with stable UID, type, schema version, canonical representation, metadata, and locators. Filenames are not identity.
3. **Relationships and Lineage** produce typed assertion and lineage records with direction, provenance, evidence anchors, temporal validity, epistemic state, actor, scope, and version. Similarity is non-authoritative unless governed.
4. **Validation and Control** produce deterministic diagnostics and control receipts. Failed mandatory controls block promotion.
5. **Review and Workflow** produce an append-only Decision Record.
6. **Context Presentation** produces a reproducible, purpose-bound Context Manifest containing accepted assertions, evidence anchors, contradictions, warnings, restrictions, omissions, versions, recipient, and expiry.
7. **Authorized Use** produces an Authorized Use Record linking action, context, authority, actor, dependencies, outcome, and compensation route.

Layers are cumulative responsibilities, not a mandatory synchronous pipeline. Upper-layer results re-entering the corpus begin a new lifecycle at Layer 1. Incomplete objects MUST declare missing contracts and MUST NOT claim unsupported conformance.

### 6.1 Mechanical definitions

The following definitions are normative. A deployment MAY use an at-least-as-strict substitute documented in its conformance manifest.

**Consequential use.** An action is consequential when it performs any of these operation classes:

- external disclosure outside the governed deployment boundary;
- a sensitivity-level change;
- promotion to the `accepted` epistemic state;
- deletion, tombstoning, or governed erasure of a governed record.

A deployment MAY extend this list but MUST NOT narrow it.

**Blast radius.** Blast radius is the set of governed objects reachable from the proposed operation's target through the typed relationship and lineage graph, calculated at proposal time within a deployment-declared bounded hop count. Limits MUST be expressed as a maximum reachable-object count, a maximum corpus fraction, or a stricter profile-specific measure.

**Materially equivalent.** A resubmitted proposal is materially equivalent to a previously rejected proposal only when both are true:

- the evidence-set hash is identical; and
- the proposed state transition is identical, including target identity, patch shape, and input-hash lineage.

A materially equivalent proposal inherits the prior rejection's traceability requirements and MUST NOT be treated as novel without new evidence that breaks equivalence.

**Defect-badge-or-refuse.** When a Viewer/Projection Profile lacks required information, it MUST either:

- render a visible defect badge from a published taxonomy; or
- refuse to render the affected element and disclose the refusal condition.

The minimum badge taxonomy is:

- `missing-provenance`;
- `unresolved-contradiction`;
- `stale-context`;
- `unverified-sensitivity`;
- `incomplete-lineage`.

Silent omission is non-conforming.

## 7. Specialized Agents

A Specialized Agent is a governed computational actor with declared competency, accountable owner, layer scope, permitted inputs and writes, prohibited operations, evidence duties, model/prompt/tool/policy versions, risk limits, delegation, evaluation, suspension, and revocation terms.

Specialization grants capability, not authority. Common roles include preservation, structural extraction, relationship and lineage, domain analysis, methodology review, security/privacy, validation, review assistance, governance coordination, context compilation, operational action, audit/compensation, projection/indexing, and orchestration.

A Governance Coordinator consolidates proposals, verifies receipts, enforces deterministic policy, detects conflicts, routes review, and requests governed commits. It is not sovereign authority.

Security specialists MAY impose temporary fail-closed restrictions but MUST NOT lower sensitivity or widen access. Operational agents MAY act only from an authorized purpose-bound Context Manifest and valid authority receipt.

The standalone **OKF+ 2.3 Specialist Reviewer Role Definition and Constraints** is informative implementation guidance. It does not itself grant authority or amend this standard.

## 8. Conformance

Profiles are GCP-1 through GCP-7 and are cumulative. A Viewer/Projection Profile provides read-only display with visible origin, provenance, epistemic state, incompleteness, contradictions, warnings, restrictions, and conformance limitations.

A conformance claim requires a machine-readable manifest, human-readable report, exact GKOS release, test-suite version, evidence, limitations, exceptions, and assessment type. Self-attestation and independent verification MUST be distinguished. Executable GKOS-TS and complete OKP-CH semantic-invariant suites remain incomplete in v0.76; claims remain provisional and MUST disclose coverage.

### 8.1 Progressive disclosure

A human-authoring surface MUST NOT expose machine-oriented governance structures in a form likely to be silently corrupted by ordinary editing. Flat scalar-and-list serialization is one possible implementation, not a required format.

A reading or authoring view MAY hide technical metadata such as identifiers, timestamps, schema versions, and defaulted-value markers behind one discoverable reveal affordance. The reveal MUST restore the complete underlying representation without loss. Hiding is a presentation choice only and MUST NOT alter bytes or governed structure.

Warnings, contradictions, restrictions, defects, incompleteness, and epistemic-state information required by the Viewer/Projection Profile are decision-material and MUST remain visible in the default view.

Review, audit, governance-action, and agent-console surfaces MUST show full governance detail, including origin attribution and defaulted-versus-authored status.

## 9. Security, privacy, and retention

Missing or ambiguous sensitivity fails closed to a restricted deployment default. Audit and provenance data inherit or exceed referenced sensitivity. Agent interfaces are local-only by default and require authenticated identity, scoped authorization, purpose declaration, sensitivity filtering, resource limits, audit receipts, and separately authorized writes.

Governed erasure MAY remove payload bytes while preserving a minimal non-sensitive tombstone, decision record, and integrity evidence. Legal holds override routine deletion.

Deployments MUST govern queue capacity, proposal TTL, backlog alerts, per-agent limits, reviewer workload, retrospective sampling, and emergency quarantine.

## 10. Publication and maturity

The canonical v0.76 repository is `Odenknight/gkos-standard`. Documentation and original graphics use CC BY 4.0; software-oriented materials use Apache-2.0. Trademark and certification rights are separate.

GKOS v0.76 is suitable for public review, implementation experiments, fixture development, and independent critique. It is not an accredited standard, certification regime, legal opinion, regulatory compliance assurance, or guarantee of truth or safety.

The standalone **GKOS Engine v1.0 Build Instructions** are informative implementation guidance. The engine version does not imply GKOS v1.0 and the document is outside the normative release scope.

## 11. Deferred mechanisms

The following remain future engineering and governance work:

- normative authority-receipt schema and verification procedure;
- actor-identity and collusion-adjacent self-approval model;
- upward receipt and cross-layer attestation chain;
- decision-record integrity and external anchoring requirements;
- formal single-actor waiver conformance profile;
- complete schemas, namespaces, fixtures, and executable conformance suite;
- v1.0 multi-stakeholder governance and consensus procedures.
