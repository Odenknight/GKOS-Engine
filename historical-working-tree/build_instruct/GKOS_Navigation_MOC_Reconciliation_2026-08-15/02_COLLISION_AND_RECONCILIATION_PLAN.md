# Collision Register and Reconciliation Plan

## Decision rules

The following rules resolve ambiguity across the local plans and current repositories:

1. GKOS evidence semantics outrank navigation convenience.
2. A deterministic planner may be shared; persistence authority remains with a host executor.
3. Exact input bytes authorize replacement; parsed semantics alone never do.
4. A consumer of Engine proves portability, not independent implementation.
5. Existing public coordinates are preserved unless a standards change is separately approved.
6. Failure claims must match the actual guarantee: per-file atomicity and batch recovery, not global transactionality.

## Collision register

### Semantic and governance collisions

| ID | Severity | Collision | Required reconciliation | Closure evidence |
|---|---|---|---|---|
| C-01 | Blocker | Generated live MOC links are currently scanned as ordinary Markdown and can feed back into the graph that generates them. | In Navigation-only mode, mask generator-owned regions from evidence parsing while retaining the document in a separate Navigation registry. Hybrid human-owned regions may remain evidence inputs. Governed re-entry is a later explicit mode. | Identical complete snapshots produce the same plan; after apply, the desired candidate digest is unchanged, the next action is `no-op`, and generated links do not change evidence topology. |
| C-02 | High | The plan sometimes treats a MOC as if it were an L6 Context Manifest. | Define MOC as a non-authoritative Navigation Projection. L6 meaning is unchanged. | Standard proposal text and schema use “Navigation Projection”; no layer amendment. |
| C-03 | High | A future “governed” mode is described without authorship/provenance rules. | Defer Mode B. When proposed, generated content must re-enter as new L1 material with actor/tool provenance, sensitivity, timestamps, and ordinary validation. | Separate approved proposal and conformance fixtures. |
| C-04 | High | “One home per fact” can be read as truth deduplication. | Treat it only as a routing preference for navigation presentation. Preserve branches, contradiction, provenance, and multiple evidence locations. | Requirement text explicitly prohibits epistemic collapse. |
| C-05 | High | The proposed identifier `GKOS-NAV-001` uses the namespace reserved for permanent requirement IDs. | Name the development proposal `NAV-PROPOSAL-001_Generated_Navigation_Projections.md`. Allocate `GKOS-NAV-###` only after adoption through the requirements registry. | Proposal filename/handle and registry diff. |
| C-06 | High | “Write adapter” conflicts with the proposed rule that GKX adapters have no persistence side effects. | Reserve **adapter** for representation/transport translation; use **executor**, **storage backend**, or **host driver** for mutation. | API names and documentation lint contain no `write adapter`. |
| C-07 | Blocker | Kosmos consumes Engine, yet was suggested as evidence of a second implementation. | Count Kosmos as a second host/executor. Require a clean-room planner that uses only the proposal, schemas, and fixtures for standards promotion. | Dependency/SBOM inspection plus cross-implementation fixture results. |
| C-08 | High | Public GKX namespace `2.0` and Engine validating projection `2.3` are conflated. | Record both coordinates independently in every plan/run manifest. Navigation gets its own `gkos-engine.navigation/1.0` contract coordinate. | Golden manifest contains all three fields; no “GKX 2.3 namespace” wording. |

### Determinism and data-model collisions

| ID | Severity | Collision | Required reconciliation | Closure evidence |
|---|---|---|---|---|
| C-09 | Blocker | Plan/run timestamps, run IDs, and current graph runtime fields (`indexedAt`, duration, `firstSeen` fallbacks) can contaminate candidate bytes or plan identity. | Hash a deterministic `plan_core` and stable Navigation semantic view; keep planner metadata in a non-authorizing envelope; exclude runtime graph fields; allocate `run_id` only at apply. Candidate bytes contain neither clocks nor run IDs. | Golden output is byte-identical across runs and clocks. |
| C-10 | Blocker | Existing Engine convenience hashes and newline-normalizing hashes do not prove raw archive identity. | Define lowercase `sha256:<64hex>` over exact bytes for preconditions, archives, candidates, and live verification. Keep canonical-JSON digests as a separately labeled basis. | CRLF/LF/BOM fixtures produce the expected distinct raw digests. |
| C-11 | Blocker | `GkxIndex` does not retain raw input bytes, EOL, or BOM state. | Add a `NavigationSnapshotProvider` that pairs the semantic index with exact UTF-8 source bytes and inventory metadata. Reject invalid UTF-8 in v1 rather than silently transcode. | Round-trip fixtures preserve untouched bytes exactly. |
| C-12 | High | Current `GraphDelta` drops rename details and omits changes to sensitivity, UID, and other Navigation-relevant fields. | Derive `NavigationSourceDelta` from the original `IndexChanges` plus before/after snapshots. Use trusted rename events or stable UID; never infer identity from equal content hash alone. | Rename, sensitivity-only, UID-only, and folder-change tests invalidate the right scopes. |
| C-13 | High | Incremental rename currently moves a cached record without updating embedded projection/diagnostic source paths. | Fix and test the rename path before Navigation incremental work ships. | Record, projection, and diagnostic paths all equal the new normalized path. |
| C-14 | High | The proposed discovery policy stores only a flat `mocNames[]`, but Kosmos has eleven ranked names plus folder-name behavior. | Use ordered, typed discovery rules with explicit priority, ASCII case-folding, and folder-name matching. | Fixtures reproduce current Kosmos classifications and tie-breaking. |
| C-15 | Medium | Token limits are called deterministic without a tokenizer contract. | Make `max_items` and `max_utf8_bytes` normative. Token estimates require `estimator_id` and `estimator_version` and are advisory unless both are pinned. | Same inputs produce same inclusion decisions without an external model. |
| C-16 | Medium | The Walk Test combines mechanical checks with subjective navigation quality. | Define a deterministic audit for reachability, broken/ambiguous links, hop bounds, staleness, and leakage. Record human/LLM trials separately as non-conformance research evidence. | Audit fixture results contain no subjective score. |
| C-17 | Medium | System Map states such as `live`, `leftover`, and `ghost` lack exact derivation rules. | Defer rich System Map generation; first release may expose only directly computable inventory categories. | No undefined state appears in a normative schema. |
| C-18 | Medium | Current intelligence contracts have no stable Navigation grouping result. | V1 accepts an explicit `ApprovedNavigationGrouping` with decision reference and digest. Direct LLM calls and proposal-generation integration are deferred. | Core tests run offline and contain no model/provider dependency. |

### Ownership, security, and write-safety collisions

| ID | Severity | Collision | Required reconciliation | Closure evidence |
|---|---|---|---|---|
| C-19 | Blocker | A marker embedded in a file can be mistaken for permission to overwrite it. | Require a sidecar ownership registry binding normalized target path, scope, marker ID, mode, and activation digest. Markers delimit content only after registry opt-in. Default is unmanaged. | A marker-only hostile fixture is refused with `GKX-NAV-002`. |
| C-20 | Blocker | Archive-then-replace is not crash recoverable if the manifest is written only after replacement. | Persist and durably flush a write-ahead journal before the first mutation; transition each operation through explicit states; recover incomplete runs before accepting a new apply. | Crash injection after every transition recovers or safely refuses. |
| C-21 | High | “Atomic batch” over many files is not generally available. | Guarantee atomic replacement per file and recovery for the batch. Expose `partial`/`recovery_required`; do not claim global atomicity. | Capability record and failure tests match the documented guarantee. |
| C-22 | Blocker | A scalar clearance threshold is treated as complete authorization. | Require a host-supplied eligibility decision set/callback, its digest, authorization reference, and fail-closed behavior. A sensitivity ceiling is an additional bound only. | Compartment-denied nodes leave no title, path, ID, count, diff, log, or archive leak. |
| C-23 | High | Raising output sensitivity does not prove that storage enforces it. | V1 defaults to filter-to-output. `raise-output` is allowed only when the executor advertises enforceable storage labeling/access control. | Capability-negative fixture refuses raised output. |
| C-24 | High | Archive retention can conflict with legal hold, erasure, and sensitivity inheritance. | Persist effective sensitivity and retention/legal-hold references. Never auto-prune by default. Governed erasure emits a sensitivity-safe tombstone/audit record. | Retention and legal-hold fixtures; no silent deletion. |
| C-25 | High | Rollback can overwrite edits made after an apply. | Roll back only when the current live digest equals the committed candidate digest; otherwise report `GKX-NAV-012` and preserve both versions. | Post-apply human-edit fixture refuses destructive rollback. |
| C-26 | High | A vault-synchronized lock is not a distributed lock, especially through Nextcloud. | Use a local executor lease plus live digest/ETag preconditions. Describe remote apply as optimistic concurrency, not distributed locking. | Two-client conflict simulation preserves both changes/refuses stale apply. |
| C-27 | High | Path traversal, case, symlink/junction, and Unicode behavior are unspecified. | Normalize relative POSIX-style logical paths; reject absolute/parent traversal/NUL; resolve filesystem targets under the verified workspace root; refuse symlink/reparse escape; declare case-collision behavior per host capability. | Cross-platform adversarial path fixtures. |

### Ecosystem and release collisions

| ID | Severity | Collision | Required reconciliation | Closure evidence |
|---|---|---|---|---|
| C-28 | Blocker | Engine main is two commits beyond `v2.0.1` but still reports version `2.0.1`. | Establish a clean 2.1.0 baseline or remove/rebase the unreleased work before assigning a Navigation version. Preferred: release the current post-tag behavior as 2.1.0. | Tag, package version, `ENGINE_VERSION`, changelog, and compatibility files agree. |
| C-29 | High | Standard `COMPAT.md`, the newer matrix, Engine traceability, and consumer pins are not all synchronized. | Repair compatibility and traceability documents as a baseline workstream, then make version-matrix updates a release gate. | Automated coordinate consistency check passes. |
| C-30 | High | Archive exclusion is not shared across Engine, Kosmos plugin, standalone directory, and Nextcloud paths. | Publish one normalized exclusion predicate/config and apply it at every source boundary. The default archive prefix must be excluded before any writer ships. | Shared fixture corpus yields identical eligible path sets. |
| C-31 | High | Engine-Lite is behind the Engine version relationship described by the standard. | Reconcile its version/pin policy independently of Navigation. Keep its command surface narrow even if it shares a version train. | Version policy decision and release metadata agree. |
| C-32 | Medium | Kosmos-Oden-Lite is frozen, while shared vault archives could alter its scan results. | Do not backport Navigation. Permit only a patch-level default-ignore fix if compatibility tests show contamination. | Frozen-line policy remains intact; scan fixture ignores archive prefix. |
| C-33 | High | Shipping one large Engine release combines semantic core and destructive execution risk. | Split source-corpus-preserving core (2.2.0) from explicit writer (2.3.0). | Separate release gates and capability flags. |
| C-34 | Medium | Private related products are named in cascade plans without current code evidence. | Treat them as unverified consumers. Require contract-test evidence from each owner before enabling writes. | Per-product adoption record; no inference from repository name alone. |
| C-35 | Medium | The standard’s `proposal-envelope` schema can be mistaken for the format of a standards-development proposal. | Keep the Navigation proposal as a governance Markdown record under the existing decision process. The envelope schema remains L5 note-change ingress; use the decision-record schema only for a machine-readable governance decision. | Proposal validates against the correct process/artifact, with no misuse of L5 ingress authority. |
| C-36 | High | Ratified `VERSIONING.md` says Engine is the sole version/semantic anchor and no other repository may define observable semantics independently, while the proposed qualification rule requires an implementation independent of Engine. | Clarify that Engine is the operational release anchor for first-party products, not a hidden conformance oracle. A clean-room candidate implements a frozen standards profile, introduces no new semantics, and does not join/control the product version train. | Accepted policy text permits the independent evidence procedure without weakening Engine-led product versioning. |

## Reconciled terminology

| Use | Meaning | Avoid |
|---|---|---|
| Navigation Projection | Deterministic, non-authoritative view derived from eligible GKX/evidence inputs | Treating a MOC as a GKOS layer |
| Navigation planner | Pure semantic component that emits a plan | Writer, persister |
| Executor / storage backend | Host component authorized to archive and replace files | Write adapter |
| Source-corpus-preserving command | May write an external plan/report but does not mutate source corpus files | Ambiguous “read-only” |
| Navigation-only mode | Generated region is not evidence input | Silent L1 re-entry |
| Governed re-entry | Future explicitly authored/provenanced L1 material | Automatic promotion |
| Plan core | Deterministic, authorizing content | Timestamped run manifest |
| Run journal | Durable state of an apply attempt | Post-hoc log |

## Reconciliation workstreams

### R1 — Baseline and coordinate repair

Close C-28, C-29, and C-31 before Navigation code lands. Add a coordinate-consistency test that compares package version, exported Engine version, release tag, compatibility matrix, and consumer pin declarations where those files are in scope.

### R2 — Pure Navigation contract

Implement the contracts in [03_FINAL_ENGINE_NAVIGATION_SCHEMA_REWRITE.md](03_FINAL_ENGINE_NAVIGATION_SCHEMA_REWRITE.md), including exact-byte inputs, eligibility decisions, ordered discovery, deterministic plan core, ownership registry, and normalized diagnostics. Do not include filesystem APIs.

### R3 — Evidence/non-evidence separation

Create a Navigation registry and an evidence-input masking rule for generator-owned regions. This must be complete before generated live MOCs are used in repeatability tests.

### R4 — Source boundary convergence

Make Engine CLI, Kosmos plugin, standalone directory, and Nextcloud use the same logical-path normalization and exclusion contract. Fix incremental rename metadata and derive affected scopes from source deltas.

### R5 — Recoverable execution

Build a Node reference executor with local leases, raw SHA-256, write-ahead operation states, same-filesystem temporary files, atomic per-file replace where supported, verification, rollback preconditions, and restart recovery.

### R6 — Standards evidence

Land a non-normative proposal and provisional fixtures. A separate clean-room implementation must pass those fixtures without importing or invoking Engine. Only then consider normative requirement IDs and schema promotion.

### R7 — Consumer adoption

Roll out source-corpus-preserving features before mutation. Kosmos adopts Engine classification with heuristic fallback, then later enables its executor. Lightweight/frozen consumers receive only compatible ignore behavior.

## Release gates

| Gate | Required result | Blocks |
|---|---|---|
| G0 Baseline | Version/tag/compatibility consistency; current suites green | All Navigation releases |
| G1 Semantic isolation | Generated regions do not affect evidence topology in Navigation-only mode | Candidate generation |
| G2 Determinism | Cross-run/OS golden plan cores and candidate bytes match | Engine 2.2.0 |
| G3 Sensitivity | Noninterference and fail-closed eligibility fixtures pass | Engine 2.2.0 |
| G4 Ownership | Marker spoof, unmanaged, hybrid-boundary, and registry-digest tests pass | Any apply command |
| G5 Recovery | Crash injection, stale apply, rollback conflict, archive verification, and path escape tests pass | Engine 2.3.0 |
| G6 Host parity | CLI/Kosmos/standalone/Nextcloud eligible-path and plan fixtures agree | Kosmos writer enablement |
| G7 Standards | Clean-room implementation passes portable fixtures; decision record approved | Normative standard promotion |

## Collision closure policy

A collision is closed only by an executable test, schema validation, or approved decision record. Documentation agreement alone is insufficient for blocker/high items. Any implementation PR should reference the collision IDs it closes, and a release must list the satisfied gates.
