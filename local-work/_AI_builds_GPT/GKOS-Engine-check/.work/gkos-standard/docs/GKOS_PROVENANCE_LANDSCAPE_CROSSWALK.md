# GKOS and the Provenance Landscape: A Claim-Limited Crosswalk

<!-- markdownlint-disable MD013 -->

**Document:** GKOS-XW-001 v0.2-draft  
**Applies to:** GKOS-2026-07-20 v0.76 and adopted decisions through R12  
**Status:** informative; mappings are proposed interoperability directions, not
implemented-conformance claims  
**Reviewed external baselines:** W3C PROV Recommendation; in-toto specification
and Attestation Framework v1.0; SLSA v1.2; C2PA 2.4; current Sigstore
documentation; MCP 2026-07-28 authorization

## 1. Short answer

W3C PROV, in-toto, SLSA, Sigstore, C2PA, and MCP solve important parts of the
larger trust problem. GKOS should reuse them where their scopes fit.

GKOS's intended differentiator is the combined governance of epistemic state,
review disposition, purpose-bound context, restrictions, and consequential use.
The reviewed specifications do not directly standardize that complete lifecycle
as one knowledge-governance contract. This is a bounded comparison, not a claim
that no other framework addresses any similar concern.

## 2. Scope comparison

| Specification | Primary scope | Strong overlap with GKOS | Responsibility GKOS still needs |
| --- | --- | --- | --- |
| [W3C PROV](https://www.w3.org/TR/prov-o/) | Provenance interchange using entities, activities, agents, and qualified relations | Source identity, derivation, revision, invalidation, actors | Epistemic vocabulary, promotion authority, review disposition, Context Manifest, use authorization |
| [in-toto](https://in-toto.io/docs/specs/) | Integrity of software supply-chain steps and signed attestations | Statement envelopes, subjects/digests, step evidence, test/release attestations | Knowledge semantics, contradictions, review and promotion, purpose-bound context |
| [SLSA 1.2](https://slsa.dev/spec/v1.2/) | Incremental source/build software supply-chain assurance | Level/track adoption pattern; source/build provenance around implementations | Runtime knowledge governance and authorized agent use |
| [Sigstore](https://docs.sigstore.dev/cosign/signing/overview/) | Identity-bound artifact signing and transparency | Public release/attestation signing and auditable signing events | Authority semantics, confidential/offline trust profiles, knowledge lifecycle |
| [C2PA 2.4](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html) | Content credentials, assertions, asset binding, validation, and media provenance | Media-source evidence, asset identity, action history, signature validation | Accepted-knowledge promotion, organizational decision authority, purpose-bound use |
| [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) | Authorization protocol for MCP resources and operations | Authenticated access to tools/resources; OAuth-based authorization boundaries | Evidence/assertion separation, epistemic state, governance review, Context Manifest, Authorized Use Record |

## 3. Layer mapping

| GKOS layer | Nearest reusable concepts | Mapping classification | Required limitation |
| --- | --- | --- | --- |
| L1 Original Sources | PROV Entity; C2PA asset/manifest; in-toto subject/material | Strong overlap | A source format or valid signature is evidence, not automatic truth or authority |
| L2 Structure and Identity | PROV Entity; C2PA identifiers/bindings; in-toto ResourceDescriptor | Strong overlap plus GKOS stable-identity rules | Paths and filenames cannot substitute for governed identity |
| L3 Relationships and Lineage | PROV derivation/revision/invalidation; C2PA ingredient/action history | Strong overlap with extensions | Direction, scope, epistemic state, evidence anchors, and authority must survive or be marked lost |
| L4 Validation and Control | in-toto test statements; Sigstore verification; SLSA verification; policy-engine decision logs | Complementary | External verification results are inputs; GKOS still determines applicable policy and blocking behavior |
| L5 Review and Workflow | PROV Activity/Agent; audit records | Partial overlap | A provenance event does not prove an authorized disposition or separation of duties |
| L6 Context Presentation | No direct equivalent in the reviewed baselines | GKOS-specific contract | Projection must retain restrictions, contradictions, omissions, versions, recipient, purpose, and expiry |
| L7 Authorized Use | MCP/OAuth access decision; policy logs; PROV Activity | Partial overlap | Access authorization alone does not bind exact knowledge context, outcome, and compensation route |

## 4. Proposed interoperability work

These items are proposals until versioned schemas, fixtures, and executable
tests are published.

### XW-P1 — PROV export profile

Define a lossy-but-auditable projection for Layers 1–3:

- Source Record / Structured Knowledge Object → `prov:Entity`;
- actor → `prov:Agent` with role qualification;
- ingestion, validation, review, and conversion → `prov:Activity` where
  appropriate;
- derivation and revision → qualified PROV relations; and
- supersession → revision/invalidation semantics plus GKOS extension data.

The export must declare every GKOS field or invariant that cannot be represented.
It must not imply that a PROV-valid graph is therefore GKOS-conformant.

### XW-P2 — in-toto statement envelope

Define versioned predicate types for selected GKOS evidence, such as validation
results, fixture runs, and release manifests. Use in-toto Statement v1 subjects
and digests rather than inventing a competing generic attestation envelope.

The predicate remains GKOS-specific. An envelope signature proves origin and
integrity under its trust model; it does not prove that the predicate is true or
that the signer had GKOS authority.

### XW-P3 — governed signing profiles

Do not mandate one trust service for every deployment. Define at least:

- a public-transparency profile that may use Sigstore;
- an enterprise profile using declared PKI/KMS and audit controls; and
- an offline profile with pinned trust roots and reproducible verification.

Each profile must state identity proofing, key/root distribution, revocation,
timestamping, archival, privacy leakage, availability, and verification rules.

### XW-P4 — C2PA evidence intake

For applicable media, preserve the C2PA manifest and validation result as part
of the Layer-1 evidence package. Map asset/action history into Layer-3 lineage
without converting a valid Content Credential into an accepted epistemic state.

### XW-P5 — MCP authorization binding

Where agents use MCP, bind the authenticated principal, protected resource,
scope/grant, tool request, GKOS Context Manifest hash, and resulting Authorized
Use Record. Token possession must not create knowledge-promotion authority, and
token passthrough or audience confusion must remain prohibited by the MCP/OAuth
security boundary.

## 5. Claims that must not be made yet

Until executable profiles and evidence exist, the project must not claim:

- W3C PROV, in-toto, SLSA, Sigstore, C2PA, or MCP conformance based on this
  crosswalk;
- lossless PROV export;
- that Sigstore is mandatory or suitable for confidential records by default;
- that a C2PA-valid asset is epistemically accepted;
- that MCP authorization is equivalent to GKOS authority;
- that the reviewed standards have no governance capabilities; or
- that GKOS is categorically superior to or endorsed by any named project.

## 6. Verification requirements for each mapping

Every implemented projection must publish:

1. exact source and target specification versions;
2. normative field-by-field mapping;
3. declared losslessness and synthesized/defaulted values;
4. unsupported constructs and failure behavior;
5. canonicalization and serialization rules;
6. round-trip expectations;
7. fixtures with positive, negative, and lossy cases;
8. conversion provenance and tool version;
9. security/privacy analysis; and
10. a conformance statement limited to the tested profile.

## 7. Evaluation conclusion

The responsible positioning is not “GKOS replaces provenance.” It is:

> GKOS governs how evidence, claims, decisions, context, authority, and use fit
> together, while reusing established provenance, attestation, signing,
> content-credential, and authorization standards where their scopes apply.

That claim can survive industry scrutiny only after the proposed mappings are
implemented and tested. This document establishes the boundary; it does not
pretend the evidence already exists.
