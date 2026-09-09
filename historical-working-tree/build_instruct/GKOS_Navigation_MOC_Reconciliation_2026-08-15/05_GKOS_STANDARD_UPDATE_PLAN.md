# GKOS Standard Update Plan and Replacement Text

## Standards decision

GKOS Standard should recognize Navigation Projections as an optional derived-view profile after evidence is complete. It should define semantic boundaries, portability, sensitivity, conformance, and write-authority outcomes. It should not standardize Kosmos UI behavior, filesystem implementation details, or an unproven System Map ontology.

The first proposal requires **no change** to:

- the seven GKOS layers;
- `schemas/gkx-frontmatter-2.0.schema.json`;
- `schemas/gkx-common.defs.json` typed-relation values;
- the GKX public machine namespace `2.0`;
- the meaning of L6 Context Manifests;
- existing evidence, contradiction, provenance, or epistemic semantics.

## Repository changes by stage

### Stage A — hygiene before the proposal

| File | Update |
|---|---|
| `COMPAT.md` | Replace stale Engine/Kosmos coordinates with one generated or CI-checked source of truth. |
| `docs/implementation/VERSION_COMPATIBILITY_MATRIX.md` | Reconcile with `COMPAT.md`; add a machine-readable source if one is not already canonical. |
| `VERSIONING.md` | Clarify how an optional derived-view contract and Engine-Lite’s narrower command surface interact with the one-train policy; distinguish Engine as first-party release anchor from Engine as a prohibited conformance oracle. |

This is corrective maintenance, not a Navigation semantic change.

Recommended `VERSIONING.md` clarification:

> GKOS Engine remains the operational version anchor for first-party GKOS products. This does not make Engine output a normative conformance oracle. A qualification candidate may independently implement a frozen, published standards profile and fixtures; it does not originate GKX semantics, control the ecosystem release train, or authorize first-party consumer divergence.

### Stage B — non-normative proposal and provisional evidence

Add:

```text
decisions/NAV-PROPOSAL-001_Generated_Navigation_Projections.md
schemas/provisional/navigation/
  navigation-policy-v1.draft.schema.json
  navigation-ownership-v1.draft.schema.json
  navigation-plan-v1.draft.schema.json
  navigation-run-v1.draft.schema.json
  navigation-capabilities-v1.draft.schema.json
  navigation-audit-v1.draft.schema.json
  README.md
fixtures/provisional/navigation/
  fixtures.manifest.json
  README.md
  positive/
  adversarial/
  expected/
conformance/provisional-requirements/Navigation-Projection-Profile.md
```

Use the repository’s existing Markdown development-proposal and decision-record process. Do **not** wrap the standards proposal in `schemas/proposal-envelope.schema.json`; that schema is the L5 ingress contract for proposing a governed note patch, not the governance format for changing the standard. A machine-readable decision artifact, if produced, should follow `schemas/decision-record.schema.json`. All new Navigation schema IDs and fixture manifests remain explicitly provisional.

Do **not** name the proposal `GKOS-NAV-001`. R13 reserves `GKOS-<AREA>-<NNN>` for permanent requirement identifiers. `NAV-PROPOSAL-001` is a development handle; adopted requirements receive IDs only through `requirements/REGISTRY.md`.

### Stage C — evidence and decision

- Record Engine’s exact release, schema digests, fixture results, and executor capability evidence.
- Record the clean-room implementation identity, dependency audit, and fixture results.
- Record at least one second host/executor result separately from the independent planner evidence.
- Resolve every discrepancy by changing the written candidate contract or marking a fixture erroneous; do not silently bless Engine output.
- Create a development decision record in `decisions/` and update `decisions/GKOS_Decision_Register.md`.

### Stage D — normative promotion

Only after approval:

- allocate permanent requirement IDs in `requirements/REGISTRY.md`;
- move the approved schema versions from provisional status to the standards schema location;
- add the approved conformance profile to `standard/annexes/Conformance_Profiles.md`;
- add the semantic boundary to `standard/annexes/Layer_Interface_Contracts.md`;
- add sensitivity/retention obligations to `standard/annexes/Security_Privacy_Retention.md`;
- update compatibility matrices, conformance manifests, release notes, and README status language;
- retain rejected/superseded draft artifacts with clear historical status rather than rewriting their evidence trail.

## Replacement proposal text

The following text is suitable as the semantic core of `NAV-PROPOSAL-001_Generated_Navigation_Projections.md`.

---

### Title

Generated Navigation Projections for GKX Corpora

### Status

Development proposal; non-normative until an approved GKOS decision record promotes specified requirements and artifacts.

### Problem

A conforming GKX corpus can be structurally valid yet difficult for a person or authorized agent to traverse. Implementations need portable ways to discover and propose Maps of Content, navigation groupings, and bounded context packs without changing evidence meaning or silently granting write authority.

### Definition

A **Navigation Projection** is a deterministic, non-authoritative view derived from an explicitly eligible GKX/evidence projection under a versioned policy. It may contain navigation nodes, grouping labels, links, ordering, and mechanical audit results. It is not an additional GKOS layer and does not, by itself, assert truth, provenance, causality, contradiction resolution, or evidentiary weight.

### Modes

1. **Navigation-only mode:** generator-owned content is presentation state and MUST NOT become evidence input. An implementation MAY preserve human-owned content outside a registered generated region as ordinary corpus input.
2. **Governed re-entry mode:** reserved for a later profile. Generated content may enter GKOS processing only as newly authored Layer-1 material with explicit actor/tool provenance, sensitivity, time, authorization, and ordinary validation. No implementation may infer re-entry solely from file presence or a marker.

### Candidate requirements

The following identifiers are proposal-local and are not permanent GKOS requirement IDs.

**NAVP-R001 — Derived status.** A Navigation Projection MUST remain distinguishable from the evidence projection and MUST NOT introduce a new GKOS layer or relation meaning.

**NAVP-R002 — Feedback isolation.** In Navigation-only mode, generator-owned regions MUST be excluded from evidence-semantic derivation. Identical complete inputs MUST produce the same authorizing plan and candidate bytes. Applying a candidate may change the next plan action/base precondition, but MUST NOT change the evidence-derived desired candidate or evidence topology.

**NAVP-R003 — Explicit coordinates.** A portable artifact MUST identify the GKX public namespace, implementation projection profile, Navigation contract, and implementing software version as separate fields.

**NAVP-R004 — Deterministic boundary.** A conforming planner MUST define canonical input selection, ordering, serialization, rendering, and digest rules. Authorizing plan content and candidate bytes MUST exclude clocks, random identifiers, host paths, and other non-input environment state.

**NAVP-R005 — Eligibility and noninterference.** A planner MUST consume a complete host authorization/eligibility decision and fail closed. Denied material MUST NOT be disclosed through generated content, paths, titles, identifiers, counts, diffs, diagnostics, logs, archives, or timing claims presented as conformance evidence.

**NAVP-R006 — Sensitivity inheritance.** Projection artifacts, eligibility evidence, diffs, execution records, and archives MUST carry sensitivity at least as restrictive as the information they reveal. Raising output sensitivity is valid only where the storage surface enforces the resulting access policy.

**NAVP-R007 — Ownership authority.** Discovery, naming convention, file presence, or an embedded marker MUST NOT grant mutation authority. Mutation requires an explicit ownership record and a live-content precondition. Unregistered targets are unmanaged.

**NAVP-R008 — Adapter boundary.** A GKX adapter performs representation or transport translation and MUST NOT acquire persistence side effects. A component that mutates storage is an executor/storage backend and MUST advertise that capability separately.

**NAVP-R009 — Preservation and recovery outcome.** Before replacing existing source bytes, a conforming execution profile MUST preserve and verify the authorized prior bytes, durably record enough pre-operation state to recover an interrupted run, verify the resulting bytes, and refuse stale or ambiguous operations. Multi-target execution MUST state whether it provides global atomicity or per-target atomicity with recovery.

**NAVP-R010 — Rollback safety.** Rollback MUST NOT overwrite content changed after the recorded apply. A conflict preserves the current content, prior archive, and audit trail for explicit reconciliation.

**NAVP-R011 — Retention and erasure.** Projection archives and journals are governed records. Retention, legal hold, sensitivity inheritance, and governed erasure apply; automatic deletion is not the default.

**NAVP-R012 — Mechanical audit.** A conforming Navigation audit MUST define deterministic calculations for eligible reachability, broken/ambiguous navigation links, hop bounds, staleness, and sensitivity leakage. Human or model usability assessments are research evidence, not mechanical conformance results.

**NAVP-R013 — Implementation independence.** Normative promotion requires at least one implementation that neither imports nor invokes GKOS Engine and does not use Engine as its behavioral oracle. A host that calls Engine is portability evidence but not an independent semantic implementation.

**NAVP-R014 — No epistemic collapse.** Navigation grouping or a “preferred home” MUST NOT erase branches, contradictory evidence, distinct provenance, or multiple legitimate locations. Routing preference is not truth deduplication.

**NAVP-R015 — Optional intelligence.** A deterministic planner MAY consume a separately approved, versioned grouping decision. Direct model invocation is outside the planner conformance boundary, and every referenced item must already be eligible.

### Non-goals

- changing the seven-layer model;
- adding frontmatter keys or typed relation kinds;
- treating a MOC as an L6 Context Manifest;
- prescribing a user interface or storage vendor;
- claiming a tokenizer-independent deterministic token budget;
- defining unproven System Map lifecycle states;
- granting an agent write access because it has read access.

### Promotion evidence

Promotion requires schema-valid positive and adversarial fixtures, cross-platform deterministic output, denied-data noninterference tests, feedback-isolation tests, clean-room implementation parity, mutation/recovery evidence for the execution profile, and an approved decision record.

---

## Candidate schema disposition

The logical schemas in [03_FINAL_ENGINE_NAVIGATION_SCHEMA_REWRITE.md](03_FINAL_ENGINE_NAVIGATION_SCHEMA_REWRITE.md) should enter the standard as provisional artifacts with these adjustments:

1. Use neutral schema titles such as `gkos-navigation-*` if the standard, rather than Engine, becomes the canonical owner after promotion.
2. Preserve the original Engine contract coordinate in implementation evidence; do not rewrite historical plan/run records.
3. Require explicit `$id`, `$schema`, `additionalProperties: false`, integer bounds, digest patterns, path patterns, and closed enums.
4. Keep raw candidate bytes base64 encoded in JSON artifacts so a parser cannot normalize line endings.
5. Keep the deterministic plan core separate from timestamped envelopes and execution journals.
6. Keep executor capabilities separate so a planning-only implementation can conform without pretending to write safely.

### Canonical ownership transition

Before promotion, Engine owns `gkos-engine.navigation/1.0`; the standard repository stores a pinned proposal copy and its digest. At promotion, the decision record must choose one canonical home:

- **Preferred:** the standard owns the portable schema/fixture contract; Engine packages byte-identical versions and CI verifies their manifest digest.
- **Acceptable transition:** Engine remains canonical for `gkos-engine.navigation/1.x`, while the standard defines a mapped profile and pins an exact compatible schema digest.

Two independently editable “canonical” copies are not acceptable.

## Provisional fixture rewrite

The fixture pack should include at least:

### Positive

- empty eligible corpus;
- unmanaged discovered MOC reported but not mutated;
- new explicitly registered target;
- managed replacement;
- hybrid region with byte-exact human prefix/suffix;
- folder-name discovery and each of the eleven known stems;
- LF, CRLF, mixed-EOL, BOM, and no-terminal-newline inputs;
- eligible sensitivity filtering;
- exact no-op on the second plan;
- complete run, recovered run, and safe rollback records.

### Adversarial

- marker present without registry grant;
- duplicate/nested/mismatched markers;
- stale base, policy, registry, eligibility, and projection digest;
- path traversal, absolute path, case collision, symlink/reparse escape;
- invalid UTF-8;
- denied-node title/path/count leakage;
- raised sensitivity without storage enforcement;
- corrupt archive or candidate;
- crash at each journal state;
- current live content matching neither base nor candidate during recovery;
- rollback after a human edit;
- two synchronized clients with a stale remote ETag;
- generated-link feedback into evidence topology;
- timestamp/run-ID contamination;
- unknown schema/capability value;
- automatic archive pruning under legal hold.

### Fixture manifest requirements

The manifest records raw SHA-256 for every fixed input/expected file, the JCS digest of the portable plan core, candidate raw-byte digests, contract/schema coordinates, canonical ordering, expected diagnostic codes, and which envelope/run fields are intentionally implementation-specific or non-deterministic. It MUST NOT “mask away” a timestamp or implementation value inside authorizing content; such a fixture is invalid. Planner envelopes may truthfully differ by implementation, and run-journal time fields may be pattern-validated because neither is inside the deterministic plan core.

## Independent-implementation protocol

The clean-room implementation team receives only:

- the proposal and approved clarifications;
- provisional JSON Schemas;
- input fixtures and rationale;
- expected results approved through the standards process;
- public GKOS/GKX normative documents.

It does not receive Engine source excerpts, call Engine as a subprocess/library/service, or tune behavior by diffing against undisclosed Engine output. Dependency manifests and build logs are part of the evidence. If expected output is ambiguous, the specification is repaired before either implementation is declared correct.

Kosmos-Oden remains valuable evidence: it proves a different host can transport Engine’s plan and execute it safely. It simply answers a different question from semantic independence.

## Versioning classification

| Change | Classification |
|---|---|
| Non-normative proposal/fixtures | Development artifact; no conformance claim. |
| Optional Navigation Projection profile | Additive standard release after decision; no GKX namespace change. |
| Canonicalization or eligibility behavior change | Projection-observable; at least a minor Engine contract/version change and declared compatibility impact. |
| Governed re-entry profile | Separate future proposal and release decision. |
| New frontmatter/relation/layer | Out of scope; would require its own schema/namespace compatibility analysis. |

The standard should use its next governed release identifier after ratification rather than pre-assigning a number in this assessment.

## Standards acceptance checklist

- [ ] Compatibility drift is repaired.
- [ ] Proposal identifier does not occupy the permanent requirement namespace.
- [ ] All artifacts are clearly provisional.
- [ ] Seven-layer, L6, GKX 2.0, frontmatter, and relation semantics remain unchanged.
- [ ] Engine and clean-room planners pass the same deterministic fixtures.
- [ ] Kosmos or another host passes executor/recovery fixtures.
- [ ] Sensitivity noninterference is demonstrated, not asserted.
- [ ] Adapter and executor roles are consistently named.
- [ ] Canonical schema ownership and digest synchronization are decided.
- [ ] Permanent IDs are allocated only after the development decision.
- [ ] Compatibility and conformance matrices are updated from the approved source of truth.
