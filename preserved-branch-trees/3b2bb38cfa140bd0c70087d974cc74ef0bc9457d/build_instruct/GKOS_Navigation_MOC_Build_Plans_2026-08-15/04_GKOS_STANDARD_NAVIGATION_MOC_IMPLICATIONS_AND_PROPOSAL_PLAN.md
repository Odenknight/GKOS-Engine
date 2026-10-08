# GKOS-standard Implications and Proposal Plan for Generated Navigation, ICM-Style Routing, and MOC Lifecycles

**Status:** Standards-impact assessment and development proposal plan  
**Target:** `Odenknight/gkos-standard`  
**Observed baseline:** GKOS-2026-08-05 v0.78, repository main observed at `dbbbccef6571137274e56c40f45a87dbdc6dc762`  
**Prepared:** 2026-08-15  
**Recommendation:** Implement first in GKOS-Engine as an additive, non-conformance Navigation feature; pursue a narrow informative/provisional GKOS navigation profile only after implementation evidence exists.

---

## 1. Executive conclusion

The proposed Navigation/MOC subsystem has **real GKOS implications**, but it does **not require an immediate breaking change to the seven-layer GKOS model or GKX 2.0 machine namespace**.

Most requirements are already supported by existing GKOS principles:

- stable identity is separate from filename/location;
- derived/proposed/approved origins remain distinct;
- lineage and temporal state are explicit;
- restrictions cannot be silently weakened;
- consequential use should leave a receipt;
- Context Presentation is purpose-bound and reproducible; and
- upper-layer results that re-enter the corpus must re-enter as new source evidence rather than rewriting history.

The main standards gap is terminological/contractual:

> GKOS currently does not define a first-class **persistent generated navigation projection** such as a MOC, its archive chain, its semantic diff, or its relationship to general-purpose Context Manifests.

That gap should initially be handled as an implementation-defined **Navigation Projection** and later, if evidence supports it, as an informative/provisional profile. Do not force MOCs into the wrong existing layer artifact merely to obtain a label.

---

## 2. MOC is NOT automatically a Layer-6 Context Manifest

GKOS Layer 6 answers:

> What exact purpose-bound context was presented for this use?

Its governing artifact is a Context Manifest.

A persistent MOC answers something different:

> How should a human or agent navigate this workspace/domain at this point in time?

A MOC may *contribute to* a Layer-6 context presentation, but the MOC itself is generally:

- reusable across many purposes;
- persistent in the workspace;
- navigation-oriented rather than a receipt of one presentation;
- potentially human-edited; and
- not a complete record of exactly what an acting agent saw.

Therefore:

**DO NOT rename a MOC run manifest to `Context Manifest` or claim it satisfies Layer 6 by default.**

Use implementation terms such as:

- `Navigation Projection`
- `Generated Navigation Artifact`
- `MOC Run Manifest`
- `Navigation Context Pack`

until a standards decision explicitly maps them.

---

## 3. Relationship to the Viewer/Projection Profile

The current provisional Viewer/Projection Profile states that a read-only viewer must not modify governed state and must display origin, epistemic state, incompleteness, contradictions, warnings, restrictions, and conformance limitations when relevant.

Generated navigation is conceptually closest to a **projection/view surface**, especially when it is read-only or preview-only.

Recommended standards posture:

1. use the Viewer/Projection Profile as the conceptual precedent;
2. do not silently expand that profile's conformance meaning in the implementation;
3. collect implementation evidence from Engine/Kosmos; then
4. propose a distinct Navigation Projection extension/profile if needed.

A write-capable MOC lifecycle goes beyond a pure viewer because it materializes a derived projection back into the workspace. That re-entry must remain governed.

---

## 4. Re-entry rule is the most important existing implication

The Layer Interface Contracts already state:

> Upper-layer results returning to the corpus MUST enter as new Layer-1 sources.

A generated MOC is derived from the corpus/graph. If it is written back into the same vault and then parsed as part of that vault, it is a re-entered derived artifact.

Therefore one of two explicit modes is required.

### Mode A — Navigation-only materialization

The MOC is visible to humans/tools but excluded from evidentiary/governed claim evaluation where appropriate. Its derivation is recorded in the MOC run manifest. It does not become evidence merely because it exists as Markdown.

### Mode B — Governed re-entry

If the MOC is intentionally admitted into the governed corpus, it must retain/receive:

- source/derivation provenance;
- origin classification consistent with generated/derived content;
- stable identity/version history as applicable;
- sensitivity;
- temporal validity;
- restrictions; and
- no implied authority beyond what was actually reviewed.

The Engine implementation should support Mode A first because it is simpler and safer. Mode B should be explicit.

---

## 5. Authority implications

A generated MOC is a navigation assertion, not approval of the claims it links.

The standard/proposal must state:

- inclusion in a MOC does not make a source true;
- ordering or prominence does not grant authority;
- graph centrality does not grant authority;
- an LLM-generated category does not become an approved ontology merely because it appears in a MOC preview;
- a reviewer approving the MOC layout is not necessarily approving every linked claim; and
- a MOC generator cannot lower restrictions or override a higher-precedence governance rule.

This is consistent with GKOS's existing distinction between evidence, claims, confidence, and authority and should be reinforced, not reinvented.

---

## 6. Origin implications

GKOS/GKX already distinguishes authored, derived, proposed, and approved origin domains.

Use those semantics rather than introducing an ambiguous `AI-generated = true` authority flag.

Recommended implementation mapping:

- deterministic MOC structure generated from graph: **derived navigation projection**;
- LLM-suggested semantic grouping not yet accepted: **proposed**;
- human acceptance of the grouping: approved for the navigation purpose only, not global epistemic truth;
- human prose outside managed regions: authored.

A hybrid MOC can therefore contain more than one origin at the conceptual level. Do not flatten the entire file to one misleading origin if future schema work models regions/sections.

In Engine v1, preserve this in run metadata/managed-region metadata without requiring a GKX frontmatter schema break.

---

## 7. Sensitivity and privacy implications

This is the most important area where a future standard profile may add real value.

A MOC can leak protected information merely by exposing:

- a confidential document title;
- a project/folder name;
- the existence of a relationship;
- the fact that a person is connected to a restricted subject; or
- historical items in the archive.

A Navigation Projection should therefore inherit the standard's restriction-tightening rule.

Proposed requirement principle:

> A navigation projection MUST NOT reveal an object, identifier, title, path, relationship, warning, or historical entry to a recipient who is not authorized to discover that information.

Possible implementation strategies:

1. filter ineligible nodes/edges before rendering; or
2. raise the entire MOC's sensitivity to a level permitted for the complete included set.

Filtering is generally better for purpose-bound views. A general private/internal MOC may use raised sensitivity.

Semantic diffs and archived MOCs are also sensitive artifacts; their protection cannot be weaker than the information they expose.

---

## 8. Temporal implications

MOCs are snapshots of navigation state.

A future profile should require:

- generated-at time;
- source/corpus/navigation digest;
- policy/generator version;
- optional workspace revision;
- explicit stale detection; and
- distinction between current, historical, and superseded navigation.

A stale MOC must never override the current graph merely because it is easier for an agent to read.

Historical MOCs are valuable audit evidence but must remain temporally scoped.

---

## 9. Identity implications

The existing standard principle that filename/location is not identity directly improves MOC diffing.

A semantic MOC diff should use stable identity to distinguish:

```text
deleted + added
```

from:

```text
same object moved/renamed
```

No new GKOS identity primitive is needed.

However, MOC **run identity** should be separately versioned. A MOC file's stable object identity and a generation run's identity are different concepts.

Recommended:

- MOC object: existing GKX UID when governed as an object;
- MOC run: UUIDv7 run ID;
- content versions: SHA-256 digests + timestamps/revision metadata.

---

## 10. Archive implications

The requested archive behavior is highly aligned with GKOS provenance principles:

```text
old live MOC
   -> exact archived bytes + SHA-256
   -> semantic/text diff
   -> replacement
   -> run receipt
```

Standards implications to consider:

- archival copy is historical evidence of previous navigation state;
- archive location is not identity;
- old bytes must not be rewritten to “clean them up” during archive;
- archive retention may be policy-bound rather than infinite;
- deletion/retention decisions should be explicit and auditable where consequential; and
- archive history must not be mistaken for current knowledge.

The standard does not need to mandate `_archive/moc-runs` as a path. That is an implementation convention, not a governance principle.

---

## 11. Text diff vs semantic diff

A future Navigation profile should distinguish:

- **content diff** — what bytes/text changed; and
- **semantic navigation diff** — what indexed objects, identities, relationships, sections, or statuses changed.

Both are valuable and neither substitutes for the other.

The semantic diff itself is a derived assertion and must identify:

- algorithm/profile version;
- source identities;
- source revisions/digests;
- reason codes; and
- uncertainty/limitations if any non-deterministic proposal was involved.

Do not elevate a semantic-diff classification to authoritative factual truth solely because it was computed.

---

## 12. Human-managed regions

Hybrid MOCs create a governance distinction inside one file:

- generator-owned regions;
- human-authored regions.

A future informative profile should define the principle without requiring HTML-comment syntax:

> A materializer that claims to preserve human-owned regions must identify the managed boundaries, validate them before write, and preserve all non-managed content unless separately authorized.

The exact marker representation remains implementation-specific.

This is consistent with GKOS provenance/origin separation and gives independent implementations room to use Markdown comments, AST ranges, structured sidecars, or another safe mechanism.

---

## 13. Consequential-use / receipt implications

Writing a MOC may range from trivial local convenience to consequential workspace mutation.

Do not require a full Layer-7 Authorized Use Record for every private MOC refresh merely because it changes a file. Instead:

- the MOC run manifest is always an implementation provenance/transaction record;
- deployments that classify navigation writes as consequential can bind the write to their normal Layer-5/Layer-7 authorization and receipt machinery;
- an AgentOS applying MOC changes on behalf of a user should be prepared to produce an authorized-use receipt if its governance policy requires it.

The standard should govern the boundary, not mandate a heavyweight workflow for every local note operation.

---

## 14. Do not change the seven-layer model

No evidence currently justifies an eighth “Navigation Layer.”

Navigation is cross-cutting:

```text
L1 sources         -> what exists
L2 identity        -> what objects are
L3 relationships   -> how they connect
L4 validation      -> whether projection is structurally safe
L5 review          -> whether a proposed rewrite is accepted
Projection/MOC     -> navigational materialization
L6 context         -> may use MOC as routing input for a purpose
L7 use             -> may govern an authorized apply/action
```

Keep the seven-layer model intact unless future independent implementation evidence demonstrates a true missing responsibility rather than a convenient implementation feature.

---

## 15. Do not change the typed GKX relation set yet

It may be tempting to add relations such as:

```text
indexes
navigates
routes_to
catalogs
```

Do not expand the normative-candidate relation vocabulary solely for the first MOC implementation.

Initially keep navigation relationships:

- in a Navigation projection sidecar/manifest;
- as ordinary non-authoritative wikilinks where human-facing; or
- in an implementation extension namespace.

After two implementations demonstrate stable semantics and query value, reconsider whether any relation deserves GKX promotion.

---

## 16. Proposed standards work item

Create an informative proposal after the Engine Phase-1/2 implementation is working.

Suggested file:

```text
docs/proposals/GKOS-NAV-001_Generated_Navigation_Projections.md
```

Suggested scope:

1. definitions;
2. relationship to Viewer/Projection Profile;
3. relationship to Layer-6 Context Manifest;
4. origin and authority boundaries;
5. source-set/provenance binding;
6. sensitivity/discoverability;
7. temporal/staleness semantics;
8. managed vs human-owned regions;
9. content + semantic diff;
10. archive/history/rollback evidence;
11. re-entry to governed corpus;
12. implementation conformance limitations.

Status initially: **informative proposal / non-qualifying**.

---

## 17. Possible future provisional schema

Only after implementation evidence and terminology review, consider:

```text
schemas/provisional/navigation/
├── navigation-run-manifest.draft.schema.json
├── navigation-semantic-diff.draft.schema.json
└── navigation-projection.draft.schema.json
```

Do not immediately make these normative-candidate.

The schema should be serialization-neutral in principle and avoid embedding Obsidian-specific concepts as required standard fields.

Possible minimum fields for a run manifest:

- profile/schema version;
- run ID;
- projection type;
- source set/digest;
- generator/policy identity/version/hash;
- generated time;
- output identity/path/digest;
- prior output digest;
- archive reference;
- diff references;
- actor/reviewer where applicable;
- sensitivity;
- warnings/limitations;
- write outcome/rollback state.

---

## 18. Proposed fixtures

Before any conformance promotion, create positive and adversarial fixtures.

### Positive

- deterministic MOC regeneration with identical source set;
- stable UID rename correctly classified;
- hybrid MOC preserves human region;
- old MOC archive matches SHA-256 and original relative path;
- restricted object filtered from lower-sensitivity projection;
- historical MOC marked non-current;
- reviewed semantic grouping applied with origin preserved.

### Negative/adversarial

- generated MOC claims linked evidence is approved merely due to inclusion;
- lower-sensitivity MOC leaks restricted title;
- old archive bytes differ from old live digest;
- stale plan overwrites newer human MOC edit;
- semantic diff calls rename delete+add despite stable identity;
- generated region consumes human-owned text;
- archive enters current source graph and duplicates evidence;
- LLM proposal writes without review;
- expired/historical MOC is returned as current route;
- MOC run manifest mislabeled as Layer-6 Context Manifest without purpose-bound presentation data.

---

## 19. Conformance implications

### Immediate release

No new GCP claim.

Navigation/MOC support should be described as:

> implementation capability; not a new or expanded GKOS conformance profile.

### Later

If the profile matures, options include:

- an informative extension to the Viewer/Projection Profile; or
- a separate provisional **Navigation Projection Profile**.

Do not make basic GCP-1..GCP-7 conformance depend on MOC generation. A conforming GKOS system should not be required to use MOCs.

---

## 20. Documentation implications now

Even before normative work, the following documentation changes are justified after Engine implementation exists:

- implementation guide: explain generated navigation as a derived projection;
- compatibility matrix: list Engine Navigation capability independently from GCP qualification;
- Viewer/Projection guidance: clarify persistent navigation views do not grant authority;
- security/privacy guidance: mention metadata/title/relationship leakage through indexes/maps;
- known limitations/open issues: track Navigation profile as provisional work.

Do not update the master standard merely to advertise a product feature.

---

## 21. Existing archived Context Manifest draft

The repository currently retains prior draft Context Manifest schema material under archive while the live Layer-6 concept remains defined at the responsibility/artifact level.

Do not revive or modify the archived draft merely to fit MOCs into it.

If active Context Manifest schema work resumes, keep two concepts separate:

```text
Navigation Projection
  = persistent/general routing view

Context Manifest
  = exact purpose-bound context presented for a use
```

A Context Manifest may cite or record that a Navigation Projection influenced routing, but it must still record the actual presented context required by Layer 6.

---

## 22. ICM implications for the standard

ICM itself should not become a normative dependency of GKOS.

GKOS can adopt or document compatible principles without requiring one external organizational methodology:

- explicit routing;
- scoped context loading;
- no silent duplication of truth;
- human-readable edit surfaces;
- cold-agent navigation tests;
- generated indexes with provenance.

A conforming implementation may realize those principles through ICM, a database, a virtual filesystem, an API, or another architecture.

If ICM is acknowledged, keep the distinction clear:

> ICM is an implementation/navigation methodology. GKOS is the governance standard.

---

## 23. Recommended decision sequence

### STD-NAV-0 — implementation evidence first

Do not change normative text. Build Engine Navigation and Kosmos integration under existing GKOS boundaries.

### STD-NAV-1 — publish informative proposal

Add `GKOS-NAV-001` with terminology and boundaries.

### STD-NAV-2 — independent implementation review

Use at least one second consumer/implementation surface beyond Kosmos to test whether the contract is actually portable.

### STD-NAV-3 — provisional schemas/fixtures

Only after terms stabilize.

### STD-NAV-4 — profile decision

Choose whether to:

- keep informative only;
- extend Viewer/Projection guidance; or
- establish provisional Navigation Projection Profile.

### STD-NAV-5 — normative consideration

Only if independently demonstrated value, interoperable semantics, fixtures, and governance review justify it.

---

## 24. Standards acceptance criteria

The standards-impact work is correctly handled when:

1. Engine can ship Navigation without falsely claiming new GKOS conformance.
2. MOC is not mislabeled as Layer-6 Context Manifest.
3. generated navigation does not become authority merely by materialization.
4. re-entry into the governed corpus follows the existing Layer-1 re-entry rule.
5. origin remains distinguishable across generated/proposed/human/approved portions.
6. sensitivity/discoverability rules prevent metadata leakage.
7. historical MOCs remain temporal historical evidence, not current state.
8. stable identity supports semantic rename/move detection.
9. no new normative GKX relation or seven-layer change is forced prematurely.
10. any future standardization begins as an informative/provisional profile backed by implementation evidence and adversarial fixtures.

---

## 25. Bottom-line ruling

**GKOS-standard does not need to be rewritten to support this build.**

The implementation fits the existing standard if MOCs are treated as governed/derived navigation projections with explicit provenance and no implied authority. The standard should eventually gain a narrow proposal clarifying generated navigation projections, re-entry, sensitivity, archival history, and their distinction from Context Manifests—but that should follow implementation evidence rather than precede it.
