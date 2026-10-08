# GKOS-Engine Navigation, ICM, and MOC Lifecycle Build Plan

**Status:** Implementation directive  
**Target:** `Odenknight/GKOS-Engine`  
**Prepared:** 2026-08-15  
**Primary baseline:** GKOS-Engine 2.0.1 release (`7c742436d50b34f6dda66976212a672fb51f7c21`) with current main observed at `ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c`  
**Design lineage:** GKOS/GKX + Interpretable Context Methodology (ICM) concepts + governed MOC lifecycle  
**Change class:** Additive Engine capability; avoid GKX schema break in the first implementation release

---

## 1. Mission

Extend GKOS-Engine from a deterministic knowledge graph/projection engine into a deterministic **knowledge navigation engine** without turning it into a filesystem-specific application, an Obsidian plugin, or an LLM memory database.

The new subsystem must let any GKOS-Engine consumer:

1. orient an agent or human within a large workspace;
2. derive compact, auditable navigation catalogs from the governed graph;
3. generate, update, validate, compare, archive, and restore Maps of Content (MOCs);
4. support ICM-style routing, layered context loading, and System Map concepts;
5. preserve human-authored material;
6. provide deterministic change/provenance records explaining why a MOC changed;
7. expose the same semantics to Node CLI, Obsidian, Kosmos-Oden, AgentOS, and future consumers; and
8. remain compatible with existing GKOS authority, origin, provenance, temporal, and sensitivity boundaries.

The design MUST preserve the central architecture rule:

> **GKOS-Engine owns deterministic navigation semantics and plans. The consuming surface owns filesystem/UI writes through an explicit adapter.**

The Engine must not acquire direct Obsidian dependencies, browser APIs, or unconditional Node filesystem writes in its framework-neutral core.

---

## 2. Existing architecture that MUST be preserved

The implementation shall preserve these existing Engine characteristics:

- `src/index.ts` is the public, framework-neutral import surface.
- Vault paths are normalized deterministically through `src/paths.ts`.
- Markdown parsing is pure and shared across Node/plugin/standalone surfaces.
- `GkxIndex` performs incremental updates and already emits graph deltas for added, removed, changed, and topologically changed nodes.
- quick `contentHash()` is a non-cryptographic change detector only and MUST NOT be used as archival-integrity proof.
- attachments are recognized across PDF, Office, spreadsheet, presentation, media, JSON/CSV, and other file formats even though current semantic note parsing is Markdown-oriented.
- authored, derived, proposed, and approved origins remain distinguishable.
- intelligence/LLM enrichment is proposal-only and cannot silently become authoritative state.
- current read-only surfaces remain read-only unless a separate write authority is deliberately added.

This capability is an extension of the existing graph/projection contract, not a replacement.

---

## 3. Architectural position

Add a new public subsystem called **Navigation**.

```text
Sources / Vault / Adapters
          |
          v
   Existing GKOS-Engine
 parse -> resolve -> lineage -> temporal -> graph
          |
          v
+-------------------------------------------+
| NEW: Navigation Core                      |
|                                           |
| inventory                                 |
| route/catalog projection                  |
| MOC discovery                             |
| MOC candidate generation                  |
| managed-region preservation               |
| semantic + text diff                      |
| navigation audit                          |
| context-pack construction                 |
| MOC transaction planning                  |
+--------------------+----------------------+
                     |
                     v
            MocTransactionPlan
                     |
         +-----------+------------+
         |                        |
         v                        v
     Node CLI adapter        Consumer adapter
     explicit writes         e.g. Obsidian Vault API
```

The Navigation Core MUST be pure or side-effect-free wherever practical. It produces **plans and artifacts**, not unreviewed mutations.

---

## 4. ICM concepts to adopt — and what NOT to copy literally

Adopt these Interpretable Context Methodology principles as Engine behavior:

- small catalogs route to content rather than carrying the content;
- one conceptual home per fact, with links instead of copies;
- hierarchical context loading instead of indiscriminate context stuffing;
- folder/workspace contracts can explain purpose, inputs, outputs, and human gates;
- System Maps distinguish durable objects, actual processes, and change impact;
- generated indexes are regenerated, not hand-maintained as competing truth;
- a cold-agent **Walk Test** can validate navigation quality;
- human review gates precede consequential restructuring or replacement.

Do **not** make GKOS-Engine require a specific `CLAUDE.md` vendor file, force every workspace into numbered folders, or assume all source knowledge must be Markdown. The Engine must provide model-agnostic navigation primitives and allow consumer policy to render `AGENTS.md`, `CONTEXT.md`, MOCs, or other catalog forms.

---

## 5. New source modules

Create a cohesive namespace under `src/navigation/`.

Recommended structure:

```text
src/navigation/
├── index.ts
├── types.ts
├── policy.ts
├── inventory.ts
├── routes.ts
├── context-pack.ts
├── walk-test.ts
├── audit.ts
├── system-map.ts
├── moc-discovery.ts
├── moc-regions.ts
├── moc-render.ts
├── moc-diff.ts
├── moc-validate.ts
├── moc-plan.ts
├── moc-history.ts
└── canonical.ts
```

`src/navigation/index.ts` shall export the supported stable Navigation API. `src/index.ts` shall re-export either the namespace or the stable public symbols after the API is frozen.

Prefer a namespace export initially if this reduces accidental API commitment:

```ts
export * as navigation from "./navigation/index";
```

Do not expose private helper internals merely because they exist.

---

## 6. Core public types

At minimum define the following contracts.

### 6.1 Navigation policy

```ts
export interface NavigationPolicy {
  version: string;
  archiveRoot: string;                 // default: _archive/moc-runs
  managedMarkerNamespace: string;      // default: GKOS:MOC
  mocNames: string[];                  // MOC.md, index.md, etc.
  createMode: "off" | "proposal" | "automatic-plan";
  retirementMode: "proposal" | "disabled";
  archiveUnchanged: boolean;           // default false
  includeAttachments: boolean;
  includeSuperseded: boolean;
  maxContextTokens?: number;
  ignoredPathPrefixes: string[];
  minimumCreateSignals?: MocCreateSignals;
  sensitivityMode: "filter" | "raise-output-sensitivity";
  humanGateRequired: boolean;
}
```

The Engine MUST ship a deterministic default policy whose hash is included in every run plan.

### 6.2 MOC classification

```ts
export type MocKind = "directory" | "semantic" | "operational";
export type MocOwnership = "managed" | "hybrid" | "unmanaged";
export type MocOutcome = "unchanged" | "updated" | "created" | "retirement-proposed";
```

Definitions:

- **Directory MOC:** primarily explains what physically exists in a directory scope.
- **Semantic MOC:** groups knowledge by meaning/relationship even when the objects live elsewhere.
- **Operational MOC:** routes an agent/human to current state, evidence, workflows, and relevant authoritative objects.
- **Managed:** generator owns the entire MOC body.
- **Hybrid:** generator owns only marked regions; all unmarked bytes are human-owned.
- **Unmanaged:** may be analyzed, but the Engine must not plan a rewrite unless explicitly converted by policy/owner action.

### 6.3 MOC run and changes

Define canonical serializable records:

```ts
export interface MocRunManifest { ... }
export interface MocChange { ... }
export interface MocSemanticDiff { ... }
export interface MocTransactionPlan { ... }
export interface MocFileOperation { ... }
export interface MocValidationResult { ... }
export interface NavigationAuditResult { ... }
```

All serialized arrays MUST have deterministic ordering using the Engine's locale-independent comparator.

---

## 7. MOC discovery

Implement deterministic MOC discovery against the graph and source inventory.

Discovery should recognize, under policy control:

- `MOC.md`
- `index.md`
- `README.md`
- `<Folder Name>.md`
- explicit frontmatter/extension declaration
- consumer-provided aliases

Discovery MUST distinguish:

1. existing MOC candidates;
2. known human-authored index notes that must remain unmanaged;
3. directories/scopes where policy suggests a new MOC;
4. MOCs whose scope no longer exists or no longer meets policy, yielding **retirement-proposed**, never silent deletion.

Do not infer that every folder needs a MOC. Creation is policy-driven and should be conservative.

---

## 8. Managed-region preservation

Add managed-region parsing independent of ordinary Markdown/frontmatter parsing.

Canonical marker shape:

```markdown
<!-- GKOS:MOC:BEGIN current-research -->
... generated bytes ...
<!-- GKOS:MOC:END current-research -->
```

Requirements:

- markers must be paired and non-overlapping;
- nested managed regions are rejected in v1;
- region IDs are unique per file;
- malformed markers fail closed;
- content outside managed regions is preserved **byte-for-byte** whenever possible;
- a hybrid MOC with no recognized region is treated as unmanaged until explicitly initialized;
- an initialization plan shows the exact markers/content to be inserted before write approval.

Add adversarial tests for CRLF/LF, BOM, duplicate IDs, marker text in code blocks, malformed comments, and malicious path/content injection.

---

## 9. Candidate generation

Candidate generation MUST be deterministic for the same:

- source graph;
- source inventory;
- NavigationPolicy;
- MOC template/profile; and
- Engine version.

The base deterministic generator should use:

- path/folder structure;
- resolved links;
- GKX stable identity;
- typed relationships;
- lineage and HEAD state;
- temporal state;
- node type/status/tags;
- sensitivity/visibility eligibility;
- attachments when enabled; and
- consumer-approved semantic group proposals.

An LLM MAY propose semantic grouping, titles, or descriptions through the existing intelligence/proposal boundary, but its output cannot directly rewrite a MOC. The accepted proposal becomes an explicit deterministic input to candidate generation.

Never let vector similarity, LLM confidence, or graph centrality grant authority or silently decide claim truth.

---

## 10. MOC rendering rules

Every generated MOC should be compact and navigational. It MUST NOT become a second copy of the knowledge base.

Recommended generated section forms:

```markdown
## Current
- [[...]]

## Evidence and Sources
- [[...]]

## Related Work
- [[...]]

## Superseded / Historical
- [[...]]
```

The exact headings are profile-specific. The canonical representation should preserve stable sorting and avoid embedding long summaries unless a profile explicitly permits them.

A generated MOC entry should be traceable internally to one or more source node IDs even if the user-facing Markdown only shows a normal wikilink.

---

## 11. Text diff AND semantic diff

Implement two independent comparison layers.

### 11.1 Text diff

Produce a normal unified diff over old vs candidate content.

This is the byte/textual truth of what would change.

### 11.2 Semantic diff

Produce a structured diff such as:

```json
{
  "added": [],
  "removed": [],
  "renamed_or_moved": [],
  "relationship_changes": [],
  "section_moves": [],
  "status_changes": [],
  "unchanged_count": 0,
  "reasons": []
}
```

Use stable GKX UID/node identity so a path rename is reported as a move/rename where identity proves continuity, not as an artificial delete+add.

Each semantic change MUST carry a reason code and triggering source IDs where possible, for example:

```json
{
  "action": "added",
  "target_uid": "...",
  "reason": "active-head-entered-scope",
  "trigger_uids": ["..."]
}
```

Do not let a generated summary be the only record of change. Preserve the machine-readable semantic diff.

---

## 12. Archive contract

Default archive layout:

```text
<workspace>/
└── _archive/
    └── moc-runs/
        └── YYYY-MM-DD_HHMMSS_<run-id-short>/
            ├── <original relative paths of replaced MOCs>
            └── _run/
                ├── manifest.json
                ├── inventory-before.json
                ├── inventory-after.json
                ├── changes.json
                ├── summary.md
                └── diffs/
                    └── <original relative path>.diff
```

If the live file was:

```text
Research/LDD/MOC.md
```

its pre-replacement archive MUST be:

```text
_archive/moc-runs/<run>/Research/LDD/MOC.md
```

The path under the run root MUST preserve the original relative tree exactly.

### Critical indexing requirement

`_archive/moc-runs/**` MUST be excluded from the live knowledge/navigation scan by default, otherwise archived MOCs will appear as duplicate live knowledge and corrupt graph/navigation semantics.

Do **not** globally ignore all `_archive/**`; users may intentionally keep meaningful archival knowledge there. Add exact/prefix ignore support for the Engine-managed MOC archive root.

---

## 13. Archive integrity and hashing

The existing Engine `contentHash()` is explicitly a fast non-cryptographic change detector. Do not reuse it as archival proof.

For every archived/replaced MOC, the execution adapter MUST compute SHA-256 and bind:

- old live path;
- archive path;
- old SHA-256;
- candidate/new SHA-256;
- policy hash;
- source corpus/navigation digest;
- Engine version;
- generator/profile version;
- run ID and timestamps.

The transaction MUST verify that the archived old copy hashes identically to the pre-write live file before replacement is allowed.

Core code may define the digest fields and canonical serialization. Platform adapters provide the actual cryptographic hash implementation if necessary, or the package may expose an isomorphic WebCrypto/Node-safe SHA-256 helper if it can remain framework-neutral.

---

## 14. Atomic transaction plan

The Engine core emits a plan. A write-capable adapter executes this sequence:

```text
A. acquire MOC-run lock / lease
B. rescan or verify preconditions
C. generate candidate
D. validate candidate
E. compute old/new SHA-256
F. write archived old MOC at preserved relative path
G. re-read archive and verify SHA-256 == old live SHA-256
H. write candidate to temporary sibling path
I. fsync/flush where platform permits
J. atomic replace/rename temp -> live MOC
K. verify final live SHA-256
L. rescan changed live paths
M. write run manifest and diffs
N. release lock
```

If any step before J fails, the live MOC remains untouched.

If a failure occurs after J and before the committed run manifest, the adapter MUST enter a recoverable incomplete state and offer deterministic rollback from the verified archive copy.

Do not claim transactionality on platforms that cannot provide it. Record the platform's actual atomicity capability in the run manifest.

---

## 15. Concurrency and stale-plan protection

A MOC candidate is invalid if the underlying source or old MOC has changed after planning.

Every plan MUST include preconditions:

- old MOC SHA-256 or explicit nonexistence;
- source/corpus digest;
- policy hash;
- scope ID;
- generated-at time;
- optional workspace revision / git commit / sync revision.

Execution must compare preconditions immediately before write and fail with `MOC_PLAN_STALE` when they differ.

Support a lock/lease record such as:

```text
.gkx/navigation/moc.lock
```

or an adapter-native lock. Locks must have owner/run identity, creation time, and safe stale-lock recovery rules.

---

## 16. MOC outcomes

The planner MUST classify each scope as exactly one of:

- `unchanged`
- `updated`
- `created`
- `retirement-proposed`

Rules:

- unchanged MOCs are not archived by default;
- updated MOCs archive the old version before replacement;
- newly created MOCs have no old version but are still represented in the run manifest;
- retirement is proposal-only in v1 and never deletes automatically;
- explicit human rejection/deferment is retained in the run decision record when the consumer supports review history.

---

## 17. Rollback and arbitrary historical comparison

The core shall support deterministic functions for:

- listing MOC run history from manifests;
- comparing current MOC to an archived run;
- comparing run A to run B;
- preparing a rollback plan;
- validating rollback preconditions.

Recommended CLI UX:

```text
gkx moc plan <workspace>
gkx moc diff <workspace> [--run <id>]
gkx moc history <workspace> [--path <moc>]
gkx moc apply <workspace> --plan <plan.json> --write
gkx moc rollback <workspace> --run <id> --write
```

`plan`, `diff`, and `history` are read-only. `apply` and `rollback` require explicit write intent; they must never be the default behavior of a scan.

---

## 18. Navigation audit / GKOS fsck

Build an audit API inspired by ICM's mechanical-first audit method.

Deterministic checks must run before any model judgment:

### Filesystem and routing

- broken wikilinks / Markdown links;
- missing referenced paths;
- orphaned MOC entries;
- unindexed eligible notes;
- duplicate MOC scopes;
- generated archive accidentally entering the live graph;
- routing files containing stale paths;
- managed-region syntax defects.

### GKX identity and lineage

- duplicate live UID;
- missing/ambiguous identity where required;
- superseded node represented as current without policy reason;
- rename misclassified as delete/add despite stable UID;
- lineage cycles/warnings inherited from Engine diagnostics.

### MOC lifecycle

- live MOC differs from last committed run without a recorded human edit marker/revision;
- archive hash mismatch;
- missing run manifest;
- manifest points to nonexistent archive copy;
- incomplete transaction;
- stale candidate;
- archived old MOC path does not match original relative location.

### Security/governance

- MOC contains an ineligible restricted title/path for its output audience;
- generated navigation attempts to lower sensitivity;
- model proposal presented as approved navigation without review;
- generated content placed outside allowed regions in hybrid mode.

Return diagnostics; do not silently repair during audit.

---

## 19. Context pack / hydration API

Add a deterministic navigation context constructor that can produce a compact orientation pack for an agent.

Example request:

```ts
buildNavigationContext({
  graph,
  scope: "Research/LDD",
  task: "K2-K3 continuity",
  maxItems: 30,
  maxEstimatedTokens: 4000,
  at: "...",
  recipientSensitivity: "internal"
})
```

The base Engine implementation should use structural/graph signals and explicit task selectors, not pretend to provide an LLM-quality semantic search engine. Optional external retrieval providers may supply candidate IDs, after which the Engine performs deterministic filtering, authority/temporal projection, and bounded serialization.

The pack should preserve source pointers, warnings, status/lineage, sensitivity, and omissions.

Do not call this object a GKOS Layer-6 `Context Manifest` unless it actually satisfies the standard's purpose-bound Context Manifest requirements. Use an implementation name such as `NavigationContextPack` until standards work decides otherwise.

---

## 20. System Map support

Implement System Map support as a **projection**, not a second specification.

Phase 1 should expose machine-readable descriptors:

```ts
interface SystemMapObject {
  id: string;
  label: string;
  sourcePaths: string[];
  state: "live" | "leftover" | "ghost";
  connectedTo: string[];
  changeHits: string[];
  changeDoesNotHit?: string[];
}
```

Do not fabricate `changeHits` from weak similarity. Require deterministic evidence or an explicitly reviewed proposal.

Later renderers may materialize ICM-style object/process cards into Markdown, but the authoritative subject remains the source tree/GKX objects.

---

## 21. Multi-format navigation

Do not block the first MOC release on full semantic extraction of every attachment format.

### Phase 1

- Markdown receives full semantic parsing.
- Known attachments remain typed navigable objects using path, extension, size, timestamps, and references from notes.
- MOCs may list these attachments if policy permits.

### Phase 2+

Add an adapter contract for derived representations:

```ts
interface NavigationSourceDescriptor {
  artifactId: string;
  sourcePath: string;
  mimeType: string;
  title?: string;
  abstract?: string;
  anchors?: NavigationAnchor[];
  derivedFromHash?: string;
  parserId?: string;
  parserVersion?: string;
}
```

This lets PDF/DOCX/XLSX/PPTX/media extractors provide **derived navigation representations** while original artifacts remain authoritative.

Never require GKOS-Engine itself to embed heavyweight office/PDF parsers into the deterministic core.

---

## 22. Sensitivity and privacy

MOCs aggregate titles and relationships and can leak sensitive information even when they contain no source text.

Therefore:

1. every navigation projection must be generated for an explicit visibility/sensitivity context or an internal default;
2. restricted objects that the recipient may not discover MUST be omitted, not merely linked with inaccessible content;
3. the MOC/navigation output's effective sensitivity cannot be lower than allowed by the included source set/policy;
4. a lower-precedence MOC rule cannot widen access granted by a higher-precedence GKOS restriction;
5. a semantic diff must not reveal the title/path of a filtered restricted object to an unauthorized viewer; and
6. archives inherit appropriate protection and retention.

Add adversarial privacy fixtures.

---

## 23. Public API release strategy

Target an additive minor release, provisionally **GKOS-Engine 2.1.0**, assuming no existing GKX serialization is broken.

Release conditions:

- existing 2.0.1 public API remains source-compatible;
- Navigation API is additive;
- no GKX 2.0 schema field becomes newly mandatory;
- no existing graph output changes merely because Navigation is installed;
- MOC archives are ignored only when the configured Engine-managed archive root is used;
- read-only commands retain read-only behavior;
- write commands are explicit and new.

If implementation reveals a necessary breaking machine contract, stop and open a standard/Engine versioning decision instead of hiding the break inside 2.1.0.

---

## 24. CLI implementation

Extend `bin/gkx.mjs` without making the existing scan commands mutating.

Add subcommands only after core APIs are tested:

```text
gkx nav audit <dir> [--json]
gkx nav map <dir> [--json]
gkx nav context <dir> --scope <path> [--json]

gkx moc plan <dir> [-o plan.json]
gkx moc diff <dir> [--path <moc>] [--run <id>]
gkx moc history <dir> [--path <moc>]
gkx moc apply <dir> --plan <plan.json> --write
gkx moc rollback <dir> --run <id> --write
```

`moc apply` must display a summary and fail if the plan is stale. A noninteractive `--yes` mode may exist for controlled automation but only together with `--write`, policy permission, and auditable actor/run metadata.

---

## 25. Test plan

Create dedicated navigation fixtures and tests.

### Unit tests

- MOC discovery precedence;
- deterministic ordering;
- hybrid region preservation;
- malformed marker fail-closed behavior;
- unchanged/update/create/retirement classification;
- semantic diff with stable UID rename;
- content-only edit;
- relationship/status change;
- sensitivity filtering;
- archive path construction;
- path traversal rejection (`../`, absolute paths, encoded variants);
- archive root exclusion;
- stale plan detection;
- canonical run manifest serialization;
- context pack bounds;
- Walk Test scoring/checks.

### Integration tests

- plan -> archive -> replace -> verify -> manifest;
- simulated failure before replace leaves live MOC intact;
- simulated failure after replace produces recoverable incomplete run;
- rollback restores exact old SHA-256;
- two simultaneous runs cannot both write the same scope;
- archived MOCs do not become graph nodes;
- CRLF and UTF-8 BOM survive human-owned regions;
- symlink/path escape is rejected by Node executor;
- very large vault incremental delta marks only affected MOC scopes dirty;
- full structural rebuild produces deterministic MOC plan.

### Golden fixtures

Include at least:

1. simple folder MOC;
2. nested semantic MOC;
3. hybrid MOC with human prose;
4. renamed stable-UID note;
5. superseded/head lineage pair;
6. restricted object omitted from public MOC;
7. archive corruption negative fixture;
8. stale plan negative fixture;
9. malformed region negative fixture;
10. retrospective run-to-run diff.

---

## 26. Incremental regeneration

Use `GkxIndex.applyChanges()` as the trigger surface instead of rescanning every MOC on every note edit.

Add a pure impact function:

```ts
getAffectedNavigationScopes(graphBefore, graphAfter, delta, registry): NavigationScopeId[]
```

Rules:

- a note edit dirties MOCs that directly list/reference it and semantic scopes whose qualifying metadata changed;
- a rename dirties old and new containing directory MOCs plus semantic scopes referencing the same stable object;
- a topology change dirties relationship-driven MOCs;
- unrelated scopes are untouched;
- a structural full rebuild may conservatively mark all registered MOC scopes dirty.

This function should be reusable by Kosmos-Oden's existing incremental refresh loop.

---

## 27. Run manifest minimum fields

Define versioned manifest schema at the Engine implementation level first:

```yaml
schema: gkos-engine.navigation.moc-run.v1
run_id: <uuidv7>
started_at: <RFC3339>
completed_at: <RFC3339|null>
status: planned|committed|rolled_back|failed|incomplete
engine_version: 2.x
navigation_version: 1
policy_id: ...
policy_hash: ...
corpus_digest: ...
workspace_revision: ...
actor: ...
platform: ...
atomicity: ...

mocs:
  - scope: Research/LDD
    live_path: Research/LDD/MOC.md
    outcome: updated
    ownership: hybrid
    kind: operational
    old_sha256: ...
    new_sha256: ...
    archive_path: Research/LDD/MOC.md
    text_diff_path: ...
    semantic_diff_path: ...
    trigger_uids: []
    validation: pass
```

Run IDs should be UUIDv7 where the ecosystem already uses UUIDv7 for new governed identities. The archive directory may include a readable timestamp plus a short run ID, but identity must not depend on the filename.

---

## 28. Phased implementation

### Phase 0 — ADR and frozen contracts

Deliver:

- `docs/NAVIGATION-ARCHITECTURE.md`
- `docs/MOC-LIFECYCLE.md`
- `docs/ICM-MAPPING.md`
- `docs/NAVIGATION-SECURITY.md`
- public type proposal
- fixture plan

Gate: architecture review confirms no Obsidian/Node I/O leaks into the core.

### Phase 1 — Deterministic read-only Navigation Core

Implement:

- navigation types/policy;
- MOC discovery;
- managed-region parser;
- candidate rendering;
- text/semantic diff;
- navigation audit;
- context-pack projection;
- archive path planner;
- no filesystem writes.

Gate: deterministic tests and golden fixtures pass.

### Phase 2 — Node CLI transaction executor

Implement explicit `gkx moc apply/rollback --write`, SHA-256 archive verification, stale-plan checks, lock/lease, atomic temp-file replacement, run manifests.

Gate: failure-injection/rollback suite passes.

### Phase 3 — Incremental scope impact

Integrate with `GkxIndex` graph deltas; expose affected MOC scopes.

Gate: single-note edit causes no unrelated MOC regeneration.

### Phase 4 — Consumer cascade

Publish Engine minor release and update Kosmos-Oden and other consumers through the separate cascade plan.

### Phase 5 — System Map + accepted intelligence proposals

Add deterministic System Map projection and optional proposal ingestion for semantic grouping/change-impact claims.

### Phase 6 — Multi-format descriptor adapters

Add external parser/derived-representation contract without bloating core.

---

## 29. Non-goals

The first release MUST NOT:

- replace Graphiti, Qdrant, SQLite, Obsidian, or AgentOS;
- create a competing memory database;
- ingest every Office/PDF format inside the TypeScript core;
- allow an LLM to auto-approve MOC changes;
- automatically delete old/retired MOCs;
- treat generated MOCs as canonical evidence;
- silently rewrite human prose;
- make `CLAUDE.md` the universal authority file;
- index the MOC run archive as current knowledge;
- imply a new GKOS conformance claim.

---

## 30. Acceptance criteria

This initiative is complete for Engine v1 Navigation capability when all are true:

1. A cold consumer can discover registered MOCs and generate a deterministic candidate from a fixed graph.
2. Hybrid MOC human content survives byte-identically outside managed regions.
3. Existing MOCs receive text and semantic diffs before replacement.
4. Old MOCs are archived under a dated/run directory at their original relative path.
5. Archive SHA-256 is verified before live replacement.
6. New MOCs can be proposed/created under policy.
7. Retirement is proposal-only.
8. Run manifests explain every changed MOC and its source triggers.
9. Stale plans fail closed.
10. Rollback restores exact prior content.
11. Engine-managed MOC archives never contaminate the live graph.
12. Navigation output respects sensitivity/visibility restrictions.
13. The Engine core remains platform-neutral and deterministic.
14. Existing consumers that do not use Navigation continue working unchanged.
15. A consumer can implement writes using the public operation/adapter contract without reimplementing MOC semantics.

---

## 31. Required implementation discipline

A lesser coding agent implementing this directive must:

- inspect current repository code before creating modules;
- reuse existing path normalization, canonical ordering, diagnostics, lineage, temporal, and incremental primitives;
- not clone existing functionality under new names;
- keep deterministic logic separate from I/O;
- add tests with each slice, not afterward;
- preserve all existing passing tests;
- document deviations from this plan rather than silently improvising them;
- stop for an authority/version decision if a GKX schema break becomes necessary; and
- deliver a final compatibility/cascade report listing every known consumer and its tested Engine range.
