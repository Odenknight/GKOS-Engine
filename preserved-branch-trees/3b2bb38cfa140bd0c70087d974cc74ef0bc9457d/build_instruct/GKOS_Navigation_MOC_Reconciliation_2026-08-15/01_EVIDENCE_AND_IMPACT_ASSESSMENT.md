# Evidence and Impact Assessment

## Assessment question

Will the proposed GKOS Navigation/MOC work improve GKOS Standard and GKOS Engine, and can it be introduced without weakening evidence semantics, determinism, security, or compatibility?

**Finding:** Yes, if Navigation is treated as a separate, reproducible projection with a deliberately narrow first release. The benefit is high for corpus usability and moderate-to-high for Engine adoption. The unmodified proposal has high write-safety and semantic-feedback risk, so the reconciliations in this packet are release prerequisites rather than optional refinements.

## Local materials assessed

The following inputs were read in full and left unchanged:

- `build_instruct/Fable_assessment.md`
- `build_instruct/Fable_GKOS_NAVIGATION_MOC_PLAN_ASSESSMENT.md`
- `build_instruct/GKOS_Navigation_MOC_Build_Plans_2026-08-15/01_GKOS_ENGINE_NAVIGATION_MOC_BUILD_PLAN.md`
- `build_instruct/GKOS_Navigation_MOC_Build_Plans_2026-08-15/02_DOWNSTREAM_MOC_CASCADE_BUILD_PLAN.md`
- `build_instruct/GKOS_Navigation_MOC_Build_Plans_2026-08-15/03_KOSMOS_ODEN_MOC_INTEGRATION_PLAN.md`
- `build_instruct/GKOS_Navigation_MOC_Build_Plans_2026-08-15/04_GKOS_STANDARD_MOC_IMPLICATIONS_AND_UPGRADE_PLAN.md`

The plan set is coherent on its main architectural point: one deterministic semantic planner, platform-specific application boundaries, explicit preview/diff, managed/hybrid/unmanaged ownership, and no immediate rewrite of the seven GKOS layers. The Fable assessment correctly identified several secondary issues, including GKX coordinate wording, eleven Kosmos manifest names, timestamp contamination, undefined Walk Test semantics, retention/erasure, fixture ownership, and the weak justification for UUIDv7 run IDs.

This review confirms those findings and adds the blocking collisions documented below.

## Repository state and verification

### GKOS Engine

Current remote main was inspected at [`ea7c326`](https://github.com/Odenknight/GKOS-Engine/commit/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c), rather than treating the older local checkout as current.

Verification against a clean archive of that commit:

| Check | Result |
|---|---|
| Dependency installation | Pass |
| Type check | Pass |
| Test suite | **199 total: 198 pass, 1 skip, 0 fail** |
| Package-content check | Pass: 91 files, 284,010 bytes |
| License check | Pass: Apache-2.0 |

The current Engine remains a deterministic, platform-neutral GKX implementation at its library boundary, with Node-based CLI behavior. Its public machine namespace is `2.0`, while its validating projection profile is separately identified as `gkx-2.3-validating-projection`. Those are different coordinates and must not be collapsed into “GKX 2.3.” See the current [Engine README](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/README.md) and [version declarations](https://github.com/Odenknight/GKOS-Engine/blob/ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c/src/version.ts).

Important implementation constraints found in the current code:

- File-node identity is path-based; `gkx_uid` is an auxiliary index, not the graph node ID.
- The incremental API accepts renames, but the returned `GraphDelta` does not retain rename information.
- A cached record moved during a rename keeps embedded source/diagnostic paths from the old location.
- Change fingerprints omit several Navigation-relevant fields, including effective sensitivity and UID.
- Indexed records do not retain exact source bytes.
- Graph output contains runtime `indexedAt`/duration values and may derive temporal state from a `firstSeen` wall-clock fallback; Navigation must use a stable semantic-view allowlist rather than hash the graph object wholesale.
- The existing general `contentHash` is FNV-based and is unsuitable for archive integrity or stale-plan authorization.
- Scientific canonical hashing normalizes line endings and is likewise unsuitable for raw-byte archive verification.
- Existing CLI `graph` and `export` commands can write output files, so “read-only CLI” is not a precise safety boundary.
- The default ignored paths include `.gkx`, `.git`, `.obsidian`, `.trash`, and `node_modules`, but not the proposed `_archive/moc-runs` prefix.

### GKOS Standard

Current main was inspected at [`dbbbccef`](https://github.com/Odenknight/gkos-standard/commit/dbbbccef6571137274e56c40f45a87dbdc6dc762), and its validation runners passed:

| Check | Result |
|---|---|
| Main standard test suite | **6/6 pass** |
| SRTP draft positive/adversarial suite | **All 6 positive and 16 adversarial cases pass** |

The current standard supports the proposal’s non-invasive route:

- Derived upper-layer results may re-enter the corpus only as new Layer-1 material with the appropriate provenance; that supports a distinction between Navigation-only output and future governed re-entry.
- The Viewer Profile is read-only and emphasizes provenance, sensitivity, epistemic status, and incomplete/conflicting evidence.
- Audit and provenance data inherit or exceed source sensitivity.
- Agent write authority is explicitly separate from read authority.
- The proposed independent-implementation rule forbids treating Engine itself as the second implementation or oracle.
- The proposed adapter-limit rule forbids persistence side effects in a GKX adapter.

Relevant policies are in [VERSIONING.md](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/VERSIONING.md), [Security, Privacy, and Retention](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/standard/annexes/Security_Privacy_Retention.md), and the [independent implementation rule](https://github.com/Odenknight/gkos-standard/blob/dbbbccef6571137274e56c40f45a87dbdc6dc762/governance/portfolio/GKX-INDEPENDENT-IMPLEMENTATION-RULE.md).

One standards hygiene problem is already visible: `COMPAT.md` contains older Engine/Kosmos coordinates while the newer implementation compatibility matrix reflects Engine 2.0.1 and standard v0.78. That drift should be repaired before Navigation adds another coordinate.

### Kosmos-Oden and lightweight consumers

[Kosmos-Oden main](https://github.com/Odenknight/Kosmos-Oden/commit/8147ea10a4525ed1bf80ad7e6ea7f51c13c28f2c) was inspected because it is the first planned write-capable host.

Material observations:

- It recognizes eleven manifest stems: `index`, `home`, `readme`, `_index`, `moc`, `map`, `overview`, `dashboard`, `start`, `contents`, and `toc`; a folder-name match has its own priority behavior.
- It already has a migration preview/apply workflow with plan files, backups, and live-source comparison. That is the right host boundary to generalize, but it lacks post-write backup-digest verification, a write-ahead per-operation recovery state, rollback, and a lease.
- Plugin, standalone-directory, and Nextcloud inputs do not currently share one normalized path-exclusion predicate.
- Archived MOCs would therefore be able to re-enter some current scans.
- The local MOC heuristic should become a fallback after the Engine Navigation classifier is available.
- The Agent API is intentionally read-only and should not gain an apply endpoint.
- A lock stored in a synced vault cannot be represented as a reliable distributed lock. Local executor leases and remote digest/ETag preconditions are the honest guarantees.

Engine-Lite is deliberately a thin wrapper with a limited command surface, and Kosmos-Oden-Lite is a frozen patch-only line. Neither should become a second Navigation implementation or receive new write features.

Private or inaccessible related repositories were not treated as inspected. They appear in the rollout matrix only as consumers that must prove compatibility before adoption.

## How the proposal improves GKOS Engine

### Functional gain

The Engine currently provides canonical parsing, assessment, graphing, export, migration, and experimental scientific-research facilities. A Navigation Projection fills a real gap between a correct evidence graph and a usable corpus:

- deterministic discovery of existing navigation surfaces;
- proposed MOC generation without immediate mutation;
- stable preview and semantic diff;
- bounded context-pack assembly;
- orphan, reachability, ambiguity, stale-link, and sensitivity-leak audits;
- one reusable semantic contract for CLI, Kosmos, and other hosts.

This turns “the graph exists” into “a user or agent can find a defensible route through it” while keeping navigation subordinate to evidence.

### Architectural gain

The feature forces several valuable core improvements even before writes ship:

- raw SHA-256 utilities distinct from convenience hashes;
- an exact-byte document snapshot boundary;
- a richer change signal for renames and policy-relevant metadata;
- unified path exclusion;
- deterministic plan-core canonicalization;
- explicit host capability reporting;
- recovery-oriented write semantics that can later be shared with migration/enrichment workflows.

### Cost and risk

The core is not merely a new renderer. It introduces a second graph-like product with its own ownership, eligibility, incremental invalidation, canonicalization, and lifecycle. If Navigation links are injected back into the evidence graph, repeated runs can change their own inputs and create unstable centrality and grouping. That feedback loop is the largest semantic risk in the original plan.

## How the proposal improves GKOS Standard

The standard benefits if it defines the boundary and testable obligations—not if it prescribes a UI or immediately expands the ontology.

Useful standards outcomes are:

- a precise definition of a non-authoritative Navigation Projection;
- normative separation of Navigation-only output from governed Layer-1 re-entry;
- sensitivity noninterference requirements for generated views, diffs, logs, and archives;
- portable conformance fixtures for deterministic planners;
- an independent-implementation proof point;
- a clear separation among semantic cores, adapters, executors, and storage backends;
- explicit operational evidence for safe machine-authored projections.

No first-release change is justified for the seven layers, `gkx-frontmatter-2.0`, or typed relation kinds. Keeping those stable is itself an improvement: it demonstrates that the standard can admit useful derived projections without turning every product feature into ontology.

## Proposal disposition

| Proposed element | Disposition | Reason |
|---|---|---|
| Pure discovery/plan/diff/audit core | Retain with rewritten inputs and canonicalization | Strong cross-platform value and testability. |
| Managed/hybrid/unmanaged modes | Retain with ownership registry | Markers alone are not write authorization. |
| Marker-delimited generated regions | Retain for hybrid splicing | Must be subordinate to registry ownership and exact-byte preservation. |
| `_archive/moc-runs` | Retain as a default configurable prefix | Must be ignored everywhere and governed by retention/legal hold. |
| Archive-before-replace | Retain and strengthen | Needs raw-byte SHA-256, durable write-ahead state, and recovery. |
| Incremental generation via `applyChanges()` | Rewrite | Original input changes, not current `GraphDelta`, must drive affected-scope analysis. |
| Clearance threshold | Rewrite | A scalar ceiling is not a complete authorization or compartment decision. |
| Deterministic token budget | Rewrite | Use byte/item limits, or bind a named versioned tokenizer. |
| Walk Test | Split | Deterministic mechanical audit and human/LLM usability study are different evidence classes. |
| System Map in first release | Defer | Core terms such as `live`, `leftover`, and `ghost` are not defined. |
| Direct LLM grouping | Defer | Initial core can consume approved grouping decisions but must not call a model. |
| New GKOS layer/relation/frontmatter | Reject for initial scope | No demonstrated need. |
| `GKOS-NAV-001` proposal identifier | Rename | `GKOS-<AREA>-<NNN>` is reserved for permanent requirement IDs. |
| “Write adapter” | Rename to executor/backend | Prevents collision with adapter side-effect limits. |
| Kosmos as independent implementation | Reject | It consumes Engine and therefore cannot satisfy clean-room independence. |

## Net impact rating

| Dimension | With reconciliation | Without reconciliation |
|---|---:|---:|
| Corpus usability | High positive | High positive initially, unstable over repeated generation |
| Engine reuse/adoption | High positive | Medium positive with duplicated host semantics |
| Standards clarity | Medium-to-high positive | Negative if product behavior is prematurely made normative |
| Determinism | High confidence after fixtures | High risk from timestamps, tokenizers, source feedback, and incomplete deltas |
| Data safety | Acceptable after executor gates | High risk during partial failure or marker spoofing |
| Sensitivity safety | Acceptable with host eligibility decisions | High risk with clearance-only filtering |
| Ecosystem upgrade cost | Moderate and staged | High if all surfaces change at once |

The correct program is therefore **approve the capability, narrow the first release, and make write support a separately gated minor release**.
