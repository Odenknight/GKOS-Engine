# Governed Knowledge Operations Standard (GKOS)

<!-- markdownlint-disable MD013 -->

> A public pre-standard for keeping evidence, claims, authority, context, and
> agent actions distinguishable and auditable.

- **Current release:** GKOS-2026-08-05 v0.78 — authorized developmental
  publication under signed tag `v0.78`
- **Maturity:** public pre-standard; testing and concept refinement
- **Technical exchange model:** GKX — Governed Knowledge Exchange
- **Canonical repository:** `Odenknight/gkos-standard`
- **Last orientation review:** 2026-08-04

GKOS defines how knowledge should move from source evidence to consequential
use without silently turning model output, retrieval rank, confidence, or tool
access into authority.

It does **not** decide absolute truth. It makes the path from evidence to action
explicit enough to inspect, reproduce, challenge, correct, and govern.

For implementation detail, read [TECHNICAL_README.md](TECHNICAL_README.md).
The [master standard](standard/00_GKOS_Master_Standard.md) and adopted
[development decisions](decisions/GKOS_Decision_Register.md) remain
authoritative when an overview differs from normative text.

## The problem in plain language

Agentic systems can retrieve thousands of documents, combine them, propose
changes, call tools, and act faster than a person can review each intermediate
step. Conventional knowledge systems often preserve the final answer but lose
the distinctions that matter:

- What was the original evidence?
- What did a person or agent infer from it?
- Which deterministic checks actually ran?
- Who had authority to accept the proposal?
- What exact context was shown to the acting agent?
- What action occurred, under which permission, and with what result?

When those questions collapse into one opaque “trusted” status, confidence can
be mistaken for authority, old context can be presented as current, and an
agent can act from a conclusion that nobody actually approved.

GKOS keeps those steps separate and links them with reviewable records.

## A 90-second walkthrough

Suppose an agent proposes changing a production retention policy.

1. **Preserve the source.** Store the policy, ticket, regulation, and their
   acquisition history without silently rewriting them.
2. **Give each object stable identity.** A filename or database path may change;
   the governed identity and version history do not.
3. **Record claims and lineage.** The agent's interpretation is an assertion
   linked to evidence, time, scope, and actor—not a newly created fact.
4. **Run deterministic controls.** Schema, sensitivity, permission, conflict,
   and policy checks produce diagnostics and receipts. Mandatory failures block
   promotion.
5. **Record an authorized decision.** A reviewer accepts, rejects, limits,
   defers, or withdraws the proposal in an append-only Decision Record.
6. **Compile purpose-bound context.** The acting agent receives the accepted
   assertions, evidence anchors, contradictions, restrictions, versions, and
   expiry that apply to this task.
7. **Authorize and receipt the use.** The system records the actor, action,
   authority, context, dependencies, outcome, and compensation or recovery
   route.

If the result later becomes evidence, it re-enters as a new source. It does not
rewrite the history that produced it.

## Five rules to remember

1. **Evidence is not automatically truth.** Preserve what was received and
   separately record what an actor claims it means.
2. **Capability is not authority.** An agent may be able to analyze or act
   without being authorized to approve or execute.
3. **Confidence is not authority.** Model confidence, similarity, retrieval
   rank, graph centrality, and claimed expertise never authorize promotion.
4. **Restrictions only tighten without authority.** Lower-precedence inputs
   cannot widen a higher-precedence safety, security, or governance boundary.
5. **Consequential use leaves a receipt.** The action remains linked to the
   exact context and authority under which it occurred.

## Names and technical boundary

These names refer to different things.

| Name | Meaning | Current status |
| --- | --- | --- |
| **GKOS** | The governance standard: responsibilities, authority, lifecycle, controls, and conformance | Current |
| **GKX** | The technical exchange model: governed objects, schemas, identities, relationships, diagnostics, receipts, and protocols | GKX 2.0 current machine namespace |

[R14](decisions/R14_GKX_2_0_Breaking_Machine_Namespace_Development_Decision_Record.md)
adopts the breaking GKX 2.0 machine namespace: `gkx_version`, `.gkx/`,
`GKX-*`, and `gkx`. Prior release directories remain historical evidence and
are not inputs to current GKX 2.0 conformance claims.

## The seven-layer model

The layers are cumulative responsibilities, not a required synchronous
pipeline and not a claim that every product implements all seven.

| Layer | Question | Required output | Core boundary |
| --- | --- | --- | --- |
| **1. Original Sources** | What evidence was received or observed? | Source Record | Preserve revision, provenance, custody, sensitivity, retention, and receipt |
| **2. Structure and Identity** | What object is this? | Structured Knowledge Object | Stable identity; filename and location are not identity |
| **3. Relationships and Lineage** | What supports, contradicts, depends on, or supersedes what? | Assertion and lineage records | Relationships remain typed, sourced, temporal, scoped, and attributable |
| **4. Validation and Control** | Which deterministic rules and restrictions apply? | Diagnostics and control receipts | Mandatory failures block promotion |
| **5. Review and Workflow** | Who accepted, rejected, deferred, or limited the proposal? | Decision Record | Authorized, append-only disposition; no claimed self-approval where separation of duties applies |
| **6. Context Presentation** | What exact context was presented for this purpose? | Context Manifest | Warnings, contradictions, restrictions, omissions, versions, recipient, and expiry remain visible |
| **7. Authorized Use** | May this actor take this action, and what happened? | Authorized Use Record | Action is linked to context, authority, dependencies, outcome, and recovery route |

## Why this matters for agents and AgenticOS

An AgenticOS needs more than model routing, tools, memory, and scheduling. It
also needs a knowledge-control plane that answers:

- which evidence and assertions may enter working context;
- which restrictions follow them;
- which agent may propose, review, approve, or act;
- whether an action is reproducible from the same governed context;
- how contradictions and supersession remain visible; and
- how later review can trace an outcome back to evidence and authority.

GKOS is designed for that control plane. It does not replace an agent runtime,
workflow engine, identity provider, policy engine, database, provenance format,
or cryptographic signing system. It defines the responsibilities and records
that let those components work together without treating intelligence as
authority.

## Relationship to established specifications

GKOS should interoperate with established work where responsibilities overlap.
It should not recreate mature provenance, supply-chain, media-authenticity, or
signing mechanisms.

| Existing work | What it does especially well | GKOS relationship |
| --- | --- | --- |
| [W3C PROV](https://www.w3.org/TR/prov-o/) | Interchange of entities, activities, agents, and derivation | Candidate export for Layers 1–3; GKOS-specific epistemic and authority semantics require explicit extensions or loss markers |
| [in-toto](https://in-toto.io/docs/specs/) | Signed statements about software supply-chain steps and subjects | Candidate envelope for GKOS test, validation, and release attestations |
| [SLSA 1.2](https://slsa.dev/spec/v1.2/) | Incremental source/build supply-chain assurance | Adoption pattern and complementary release assurance, not a knowledge-governance substitute |
| [Sigstore](https://docs.sigstore.dev/cosign/signing/overview/) | Identity-bound signing and transparency | Candidate public signing profile; confidential deployments may require a different governed trust profile |
| [C2PA](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html) | Content credentials, asset binding, assertions, and media provenance | A C2PA manifest can be preserved as source evidence; it does not by itself grant GKOS authority |
| [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) | Authorization protocol for MCP resources and operations | Transport/tool authorization can carry or enforce grants; GKOS governs knowledge state, purpose-bound context, promotion, and use records |

The detailed, claim-limited mapping is in
[GKOS and the Provenance Landscape](docs/GKOS_PROVENANCE_LANDSCAPE_CROSSWALK.md).

## Conformance today

GKOS defines cumulative provisional profiles GCP-1 through GCP-7 plus a
Viewer/Projection Profile. Claims must name the exact standard, profile, test
suite, evidence, limitations, exceptions, and whether the result is
self-attested or independently verified.

The executable suite is incomplete. Fixture catalog 0.1.0 covers only an early
GCP-1/GCP-3 slice, and the starter runner does not yet evaluate its declared
graph-level expectations. No implementation may convert “not yet evaluated”
into a pass. No current implementation satisfies the v1.0 second-independent-
implementation gate.

See [Conformance](conformance/README.md), [Fixtures](fixtures/README.md), and
[Known Divergences](fixtures/archive/DIVERGENCES.md).

## Current maturity and claim boundary

GKOS v0.78 is suitable for public review, research, prototypes, controlled
pilots, fixture development, and independent implementation work.

It is **not**:

- an accredited national or international standard;
- a certification or accreditation program;
- proof that a product is truthful, safe, secure, or legally compliant;
- a legal opinion or regulatory authorization;
- a replacement for professional judgment; or
- evidence that the future GKOS v1.0 gates have been met.

The v0.x series is governed by Shaun “Oden” Marshall as Founder and Initial
Editor. Adopted changes are disclosed development decisions, not independent
approval or consensus ratification. Multi-stakeholder authority, complete
conformance, independently demonstrated implementation, appeals, succession,
and signed archival publication remain v1.0 work.

## Start here

| If you are… | Read or do this first |
| --- | --- |
| Evaluating the idea | Read this README, then the [illustrated edition](archive/illustrated/GKOS-v0.76-Illustrated-Edition.md) |
| Implementing GKOS/GKX | Read [TECHNICAL_README.md](TECHNICAL_README.md), the [master standard](standard/00_GKOS_Master_Standard.md), and [layer contracts](standard/annexes/Layer_Interface_Contracts.md) |
| Testing an implementation | Start with [conformance/README.md](conformance/README.md) and [fixtures/README.md](fixtures/README.md) |
| Comparing standards | Read the [provenance landscape crosswalk](docs/GKOS_PROVENANCE_LANDSCAPE_CROSSWALK.md) |
| Proposing a change | Follow [CONTRIBUTING.md](CONTRIBUTING.md) and [GOVERNANCE.md](GOVERNANCE.md) |
| Reviewing current risk | Read the [critique assessment and remediation](docs/reviews/2026-08-04_CRITIQUE_ASSESSMENT_AND_REMEDIATION.md), [Engine/standard drift assessment](docs/reviews/2026-08-04_ENGINE_GRAPH_DRIFT_ASSESSMENT.md), and [roadmap](ROADMAP.md) |

## Repository map

- [Master standard](standard/00_GKOS_Master_Standard.md)
- [Normative and informative annexes](standard/annexes/)
- [Development decision register](decisions/GKOS_Decision_Register.md)
- [Schemas](schemas/README.md)
- [Fixtures and divergences](fixtures/README.md)
- [Conformance runner](conformance/README.md)
- [Examples](examples/README.md)
- [Implementation references](docs/implementation/README.md)
- [GKX 2.0 breaking decision](decisions/R14_GKX_2_0_Breaking_Machine_Namespace_Development_Decision_Record.md)
- [Governance](GOVERNANCE.md)
- [Roadmap](ROADMAP.md)
- [Licensing](LICENSE.md)

## Licensing, attribution, and acknowledgments

Documentation and original graphics are licensed under CC BY 4.0. Schemas,
fixtures, workflows, scripts, and reference code are licensed under
Apache-2.0. Trademark, certification, endorsement, and accreditation rights are
separate. See [LICENSE.md](LICENSE.md), [NOTICE.md](NOTICE.md), and
[TRADEMARKS.md](TRADEMARKS.md).

Suggested citation:

> Shaun “Oden” Marshall. *Governed Knowledge Operations Standard (GKOS),
> GKOS-2026-08-05 v0.78.* CC BY 4.0. Changes, if any, should be identified by
> the modifier.

The project also acknowledges Andrej Karpathy's LLM Wiki as inspiration for
making technical knowledge more approachable and navigable. See
[ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md). This acknowledgment does not imply
code incorporation, affiliation, sponsorship, or endorsement.

## The practical promise

Preserve what happened. Record what was claimed. Show how it was checked.
Identify who accepted responsibility. Compile the context that was actually
used. Retain a receipt for the action that followed.
