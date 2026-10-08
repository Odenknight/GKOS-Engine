# GKOS remaining phases — junior implementation and debugging guide

Audience: a junior developer or a less-capable coding agent taking over after Phase 5. Read the concise handoff first. This guide explains the execution discipline, remaining phases, recurring failures, and safe debugging process.

This is an execution guide, not missing design authority. A junior may implement bounded tickets only after the owner/senior security lead converts the governed instruction packet into exact schemas, state machines, APIs, path budgets, platform matrices, artifacts, and acceptance tests. The junior must not invent those decisions. A senior must continuously own identity/authorization, filesystem and recovery authority, graph semantics, packaging policy, and adjudication of security/race findings.

## 1. Mission and non-negotiable architecture

The goal is a functional, provider-neutral Full/Lite system that keeps one semantic authority:

- GKOS-Engine (Full) owns GKX parsing, identity, temporal lineage, sensitivity, discoverability, governance, deterministic contracts, and reference behavior.
- GKOS-Engine-Lite consumes exact Full contracts. Its Rust and wrapper layers may implement storage, transport, presentation, and packaging, but must never invent or fork GKX semantics.
- Model/provider integrations are adapters selected by trusted configuration. No vendor, private route, or model receives governance authority.
- A phase is not complete merely because local tests pass. It needs reciprocal review, exact signed+DCO commits, hosted cross-runtime/cross-platform qualification, artifact inspection, clean-tree proof, and phase evidence.

Do not merge to `main`, tag, release, deploy, or publish packages unless the owner separately authorizes that exact action after the final audit.

## 2. Mandatory entry check before Phase 6

The original 2026-08-20 Functional Uplift Build Instructions existed only in the active owner session and were not committed or SHA-pinned. Before writing Phase 6 code:

1. Export the exact instruction packet without summarizing it.
2. Record its byte length and lowercase SHA-256.
3. Put the exact packet and a phase authority table in a governed evidence location, or obtain explicit owner re-ratification of the exact extracted table.
4. Have both reciprocal reviewers confirm the authority coordinate.

If this cannot be done, stop after Phase 5. Planning notes are not replacement authority.

## 3. Standard workflow for every phase

1. Start from the prior qualified phase head, never an arbitrary `main` checkout.
2. Confirm `git status --short` is empty. Preserve unrelated user changes if any exist.
3. Extract the phase requirements into an exact checklist: inputs, outputs, allowed paths, forbidden claims, security negatives, platforms, artifacts, and owner approvals.
4. Implement Full contracts/reference behavior first where Full owns the semantic boundary.
5. Ask the Lite reviewer to adversarially inspect Full before freeze. Fix all blocker/HIGH/MEDIUM findings.
6. Freeze exact paths and raw hashes. Generate contract packs mechanically; never hand-edit generated digests.
7. Run local gates. Create a signed+DCO commit only after the exact diff is approved.
8. Push the phase branch/draft PR and wait for every hosted job. Inspect artifacts, not just green check marks.
9. Repin/implement Lite against the exact hosted-green Full coordinate. Have Full reciprocally review Lite.
10. Create phase evidence in a separate reviewed commit when protected implementation inventories require it.
11. Do not advance until both products have terminal evidence.

Before assigning any phase ticket to a junior, the senior authority owner must fill this ticket header. If a field is unknown, the ticket is not ready:

```text
Authority packet SHA-256:
Qualified entry commits (Full/Lite):
Allowed paths and maximum path count:
Frozen input/output schemas and exact field constraints:
State machine, transitions, retry/idempotency rules:
Public/private APIs and closed error domain:
Security negatives and forbidden claims:
Dependency, platform, CPU, and linkage matrix:
Required local commands and expected counts:
Required hosted jobs and exact artifact inventory:
Full/Lite ownership split and pinning rule:
Reviewer(s) and explicit stop/escalation conditions:
```

The per-phase sections below become executable only when paired with that completed, governed header and the phase-specific contracts. They deliberately do not guess missing authority.

Useful Full commands:

```text
npm ci
npm run typecheck
npm run build
npm test
npm run test:navigation
npm run test:intelligence
npm run check:license
npm run check:nomenclature
npm run pack:check
git diff --check
git status --short
```

Useful Git checks:

```text
git rev-parse HEAD
git diff --name-status <qualified-base> HEAD
git diff --cached --exit-code
git status --porcelain=v1 --untracked-files=all
git verify-commit HEAD
```

## 4. Phase 5 terminal baseline

Phase 5 is complete. Treat these as immutable entry coordinates for later phases; do not repeat or rewrite Phase 5 merely to simplify a later test.

- Full head `7b5262baee9fcda23d50b0cee0c4977d6e4305e7`; push run `32803396417`; PR run `32803399153`; both terminal `SUCCESS`.
- Full pack: 18 files, 17 governed leaves, 8,907,164 bytes, `sha256:a8e0eed2a829db8c80cede489c871f938e432a09e6f1c34aa0940fcfe381519f`.
- Full artifact inventory: exact six, Linux/Windows × Node 22/23/24. Node 23 records governed FTS5 unavailability rather than pretending qualification.
- Lite implementation `6d94e40dc11e1bb43693b225e32ec6110d4e03b1`; run `32807434279`; 8/8 success; exact-zero artifacts.
- Lite evidence head `a39f14d1394e3dd8f8dada8bec77bd995b1a0bc4`; closure run `32808011926`; 8/8 success; exact-zero artifacts.
- Both PRs remain draft and unmerged. No release or publication is implied.

Before a later phase uses a Phase 5 contract, verify the exact commit, raw pack digest, Full/Lite byte equality, and hosted evidence. Never substitute a branch name for a commit SHA.

## 5. Phase 6 — identity and MCP

Goal: stable multi-agent identity/authentication plus bounded MCP operations without leaking credentials or creating governance authority.

Implementation order:

1. Freeze identity, session, credential, request, activity, disable, rotate, and migration contracts in Full.
2. Define trust boundaries: caller identity, transport identity, authorization policy, revocation generation, and audit receipt.
3. Implement additive Full CLI/service operations. Existing clients require an explicit bootstrap migration path.
4. Implement MCP adapters as transport-only façades over qualified Full capabilities. Tool schemas must be closed and size-bounded.
5. Add concurrency tests for provision/disable/rotate/reconnect, replay/idempotency, stale credentials, cross-agent confusion, request cancellation, secret redaction, and log privacy.
6. Implement Lite conformance without adding identity semantics.

Debug order: verify the exact identity generation and request/session coordinate first; then authorization; then storage; then transport. If two agents appear to share authority, stop immediately and inspect cache keys, migration defaults, and stale token generations.

Junior stop conditions: any unspecified credential format, revocation rule, bootstrap default, identity collision behavior, MCP error, logging/redaction field, concurrency winner, or migration transition. Escalate these; do not choose a convenient behavior.

## 6. Phase 7 — graph storage and tools

Goal: durable graph projections and bounded graph queries while Full's canonical graph remains the only authority.

Implementation order:

1. Freeze `GraphProjectionSink`, projection manifest, migration, query, and recovery contracts in Full.
2. Build SQLite as the dependency-light default. Optional Graphiti is a sink over existing episodes, not a semantic authority.
3. Bind every projection to vault, engine/contract versions, source snapshot, canonical graph digest, policy/config digests, schema/sink versions, counts, and completion digest.
4. Prove clean rebuild and equivalent incremental replay converge byte-for-byte where designated.
5. Add crash-cut recovery, corrupt/missing projection, stale manifest, duplicate identity, hidden/future source, and policy-change tests.
6. Add bounded agent graph tools that return citations/provenance and cannot mutate GKX sources.

Debug rule: compare canonical graph digest before looking at the sink. If canonical digests differ, the bug is upstream. If they match but projection digests differ, inspect ordering, transaction boundaries, migration version, and platform normalization.

Junior stop conditions: any unspecified canonical node/edge identity, conflict rule, projection ordering, deletion/tombstone behavior, query visibility rule, or migration recovery state.

## 7. Phase 8 — UI

Goal: expose only qualified capabilities through clear Full/Lite interfaces.

Implementation order:

1. Create a capability matrix mapping every screen/action to an already qualified API.
2. Keep analysis/read operations separate from mutation plans and committed effects.
3. Show identity, active policy/profile, freshness, degraded state, citations, and receipt status honestly.
4. Test keyboard/accessibility, cancellation, restart/recovery, stale state, denied actions, secret redaction, and deterministic state transitions on supported platforms.
5. Never claim a backend/provider is available when the qualified adapter is absent.

Debug rule: record the API request, response, capability coordinate, and UI state transition. Do not patch UI text to hide a backend error.

Junior stop conditions: a screen or action without a signed-off capability-matrix row, any destructive action without a plan/confirm/receipt contract, or any UI wording that would imply unavailable authority.

## 8. Phase 9 — static packaging

Goal: produce the ratified Lite static artifact and qualified Full distribution without hidden runtime dependencies.

Implementation order:

1. Freeze the exact target matrix, CPU baseline, linkage rules, bundle inventory, and reproducible build inputs.
2. Build on clean machines from lockfiles.
3. Inspect all transitive dynamic links/load commands/imports. A file being named “static” is not proof.
4. Exercise first run, migration, watcher, retrieval, graph, identity/MCP, UI, update/uninstall, and recovery without developer tools installed.
5. Qualify older supported CPUs and explicitly detect/reject unsupported instruction sets.
6. Generate checksums/SBOM/license inventory and prove no private test authority ships.

Recurring issue: native SQLite, TLS, compression, model runtimes, and GUI frameworks often reintroduce dynamic libraries. Inspect the actual artifact on every target.

Junior stop conditions: an unspecified CPU baseline, supported OS, linkage exception, installer/updater behavior, signing requirement, SBOM format, or shipped private test asset.

## 9. Phase 10 — documentation

Goal: make claims match qualified behavior and make reproduction possible for a junior developer.

Required content:

- installation and first-run guides;
- configuration/provider-neutral adapter examples;
- identity/MCP security and rotation;
- watcher/recovery and degraded-state operations;
- graph semantics and non-authoritative sink explanation;
- UI workflows;
- packaging/CPU/platform limitations;
- troubleshooting and evidence reproduction;
- exact versions, commits, checksums, licenses, and support boundaries.

Run nomenclature, license, link, example, command-output, and clean-install tests. Never copy an old version number or claim into new evidence without rerunning it.

Junior stop conditions: a claim without a terminal evidence coordinate, an example that depends on developer-only state, or a version/support statement not present in the governed matrix.

## 10. Phase 11 — integration and handoff

Goal: prove the complete Full/Lite system and prepare owner-controlled integration.

Acceptance checklist:

- every phase evidence file points to exact signed+DCO commits and terminal hosted runs;
- Full/Lite pins and copied contract hashes match;
- clean end-to-end install, migration, identity/MCP, watcher, retrieval, graph, UI, shutdown, and recovery pass;
- protected histories and prior packs remain immutable;
- artifacts have exact inventories, checksums, SBOM/license evidence, and supported-platform results;
- both repositories are clean and draft PRs are mergeable;
- no unresolved blocker/HIGH/MEDIUM reciprocal finding remains;
- final concise handoff and this detailed guide are updated with terminal coordinates.

Only after this audit may the owner separately authorize main merges, version changes, tags, releases, deployment, or package publication.

The Phase 11 endpoint in this guide is terminal, review-approved draft-PR evidence ready for owner-controlled integration. It does not include a merge, tag, release, deployment, service activation, or package publication.

## 11. Recurring failures and proven solutions

### Protected inventory mismatch

Symptom: qualification reports immutability/inventory invalid.

Solution: compare exact name-status rows from the qualified base, including index-only changes and untracked files. Update an allowlist only when the new path is explicitly in reviewed scope. Never add a broad wildcard.

### Clean hosted checkout cannot create a fixture commit

Symptom: `git commit` fails because the synthetic overlay has no staged changes.

Solution: branch on `git diff --cached --quiet`. The empty path is allowed only when source and clone are clean, both point to the expected head, the expected committed inventory is present, and the protected verifier passes.

### Windows CRLF changes frozen bytes

Symptom: pack hashes differ only on Windows.

Solution: add narrow `.gitattributes` `text eol=lf` rules for the exact governed directory; assert both attributes with `git check-attr`; bind raw byte length/SHA for every leaf. Do not renormalize unrelated files.

### POSIX parent changes after authorized `mkdir`/`rmdir`

Symptom: a directory capability invalidates itself after an allowed child transition.

Solution: model the transition explicitly. POSIX parent `nlink` changes by +1/-1; Windows remains unchanged. Bind parent device/inode/mode/owner, exact sole-name delta, all retained sibling metadata/content, and target identity through two validation seams before refreshing the seal.

### Post-`rmdir` directory descriptor reports link count zero

Symptom: live identity validation rejects an open descriptor after removal.

Solution: use a removal-aware descriptor proof: directory kind plus exact pre-remove device/inode/mode/owner, POSIX `nlink == 0`, and absent pathname. Do not run a live-path identity helper that requires `nlink >= 1`.

### Windows lstat/fstat device mismatch

Symptom: Node 23 reports lstat device zero and fstat a real device.

Solution: use the existing Windows zero-device equivalence only on Windows while continuing to bind inode, mode, link count, size, and timestamps.

### Windows 8.3 false alias rejection

Symptom: native realpath safely expands a short spelling, then code compares canonical path to raw input and rejects it.

Solution: component-wise alias validation and canonicalization happen first; compare only canonical coordinates afterward. `sameCanonicalPath` expects canonical inputs.

### Node 24.19 Windows recursive fs.watch native assertion

Symptom: process aborts in `src/win/fs-event.c` with `_wcsnicmp(filename, dir, dirlen)`.

Solution: do not use native recursive `fs.watch` on Windows. Use one bounded polling scheduler: admit at most 2,000 leaves, process 256 leaves per 250 ms tick, and retain the governed 60-second secure scan for overflow. Keep Linux/macOS native behavior unchanged. Refresh only after successful reconciliation; status changes are hints, never authority.

### Windows polling baseline absorbs a mutation

Symptom: a replacement between secure scan and poll refresh disappears from the live baseline, so no reconciliation occurs.

Solution: keep scan authority and live poll identity separate. Compare the live BigInt snapshot to the exact secure-scan coordinate before updating the baseline. Never let a refresh silently redefine the authoritative scan result.

### Windows numeric metadata loses identity precision

Symptom: Node reports apparently equal numeric `Stats`, but hosted Node 24 intermittently misses an exact metadata change or times out.

Solution: on the secure watcher path only, retain module-local bigint values for `dev`, `ino`, `mode`, `nlink`, `size`, `mtimeNs`, `ctimeNs`, and `birthtimeNs`. Keep this sidecar non-enumerable so the frozen ordinary Phase 3 scanner and its public bytes do not change. Compare exact sidecars across secure scans and exact BigInt poll identities in the live scheduler.

### Polling qualification starves the event loop

Symptom: the watcher works in focused use, but the 22-edit hosted measurement times out while repeatedly reopening the pointer every few milliseconds.

Solution: snapshot an in-memory event epoch before durable replacement, wait on an event latch, and securely reopen only after a wake. Require a changed digest and keep the original deadline. The event is only a wake-up hint; the secure reopen remains authoritative.

### Duplicate authoritative measurement contaminates hosted timing

Symptom: a real 22-edit measurement passes alone but becomes intermittent when the broad suite executes the same measurement again in the same hosted lane.

Solution: execute exactly one authoritative measurement per OS/runtime lane. Run the broad functional suite separately, and test archive/schema auditing with a dedicated audit-only fixture. Audit the uploaded all-and-only artifact inventory afterward.

### Per-leaf polling exhausts scheduler capacity

Symptom: timer count and `stat` volume grow linearly toward the million-leaf recovery ceiling.

Solution: never install one timer per leaf. Use one bounded timer, a fixed admitted set, a fixed batch size, and the governed periodic secure scan for overflow. Test scheduler ceilings and cleanup explicitly.

### Sandbox-only EPERM/esbuild failures

Symptom: local build cannot remove `dist` or esbuild cannot read the repository, but the same command works with proper filesystem authority.

Solution: distinguish sandbox denial from repository failure using the exact error/path. Rerun through the approved filesystem boundary; do not edit product code to accommodate an agent sandbox.

### Hosted artifact missing after test failure

Symptom: upload step reports no measurement file.

Solution: inspect the first failed test/process above the upload error. The missing artifact is downstream evidence, not the root cause. Qualification code must rethrow operational errors before asserting artifact presence; preserve only narrowly ratified platform-unavailable branches.

### Watcher reopens after shutdown

Symptom: hosted Linux reports pointer/status access or database use after the lifecycle should be closed.

Solution: make shutdown monotonic and idempotent. Set the lifecycle guard before releasing resources, cancel scheduled reconciliation, refuse every later reopen/retry callback, and close the database explicitly. Test shutdown racing with a queued callback and a retry deadline.

### Namespace transition invalidates a secure seal

Symptom: an authorized journal or pointer create/replace/remove makes later capability validation fail.

Solution: prove the exact transition per file. Bind the authorized capability, previous identity, expected sole-name delta, exact mutation sequence, retained siblings, and terminal state. Rebind only after every check succeeds. A callback or path string alone is not authority.

### Raw hashing makes Windows publication too slow

Symptom: correctness tests pass but the 22-edit lane exceeds its deadline because every small journal step rehashes the complete affected set.

Solution: do not add a metadata-keyed content cache. Use only the approved capability-bound batch: an unforgeable WeakMap token, exact affected set and operation sequence, hash each entry, authorize every crash prefix, keep the journal unchanged, then perform two terminal full rehashes. Any broader batch or cache is a new security-boundary change and needs direct owner approval.

### Owner or mode changes during publication

Symptom: content is correct but a publication leaf ends with the wrong owner/mode, or cleanup restores bytes without restoring metadata.

Solution: require current owner and mode `0600` where the contract does, bind exact pre/post metadata invariants, and exercise real chmod/chown seams in adversarial tests. Ensure the test proves the mutation took effect before claiming it was rejected.

### Windows distinct files share device and inode

Symptom: a newly created, non-hardlinked file is rejected as an alias because Windows reused the same `(dev, ino)` pair.

Solution: take one secure source snapshot and compare the complete required stat coordinate set. Do not treat `(dev, ino)` alone as globally unique on Windows. Keep separate genuine-hardlink and additional-alias negatives.

### Node runtime lacks physical SQLite FTS5

Symptom: a hosted Node version cannot meet the physical `sqlite_fts5` qualification prerequisite although surrounding lifecycle behavior is valid.

Solution: record the governed lane as unavailable with an exact reason. Capability-gate only the qualification observation; never weaken the production `sqlite_fts5` requirement or report a pass. Accept runtime warnings only with narrow anchored patterns.

### Pull-request artifact head differs from `GITHUB_SHA`

Symptom: the artifact auditor rejects valid PR output because GitHub Actions supplies a synthetic merge SHA.

Solution: bind the event-aware branch/platform payload head for PR runs while retaining run ID, event, repository, artifact ID, path, and source-head checks. Do not skip head verification.

### Lite verifier accepts a plausible but false version

Symptom: a fully resealed attacker fixture passes because `engine_version` is checked only for non-emptiness.

Solution: compare the exact qualified version (`2.1.2` at the Phase 5 baseline) and add a fully resealed wrong-version negative. Apply the same rule to later pins: strings that are signed or hashed can still be semantically wrong.

## 12. Debugging discipline

Always diagnose the first invariant failure, not the largest stack trace. Preserve the failed artifact/log. Reproduce the smallest affected test on the same OS/runtime. Add a negative regression before or with the fix. Ask both reviewers to attack race windows, platform assumptions, caps, owner/identity binding, and test omissions. After a correction, rerun focused tests, protected pack checks, the full relevant suite, and all hosted lanes.

If a fix changes security authority, accepted path inventory, compatibility, packaging, or external behavior beyond the approved phase, stop and obtain explicit owner authorization.
