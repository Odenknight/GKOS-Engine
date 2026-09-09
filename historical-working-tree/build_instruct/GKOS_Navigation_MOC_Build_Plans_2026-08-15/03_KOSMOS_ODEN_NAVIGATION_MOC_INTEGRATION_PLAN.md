# Kosmos-Oden Navigation and MOC Lifecycle Integration Plan

**Status:** Product integration directive  
**Target:** `Odenknight/Kosmos-Oden` / Kosmos Research Studio (KRS)  
**Observed baseline:** v0.7.0, GKOS-Engine v2.0.1 dependency, repository main observed at `8147bda5da14306710103d0490ebcae11b8e42fc`  
**Prepared:** 2026-08-15

---

## 1. Product objective

Make Kosmos-Oden the primary human-visible Obsidian/Kosmos surface for the new GKOS-Engine Navigation/MOC capability while preserving its existing architectural promise:

> Plugin, standalone, Agent API, CLI/build, and visual renderer must derive the same semantic graph rather than creating independent interpretations.

Kosmos-Oden must NOT fork MOC semantics from GKOS-Engine.

The plugin may become a safe write-capable MOC client. The standalone viewer must remain read-only unless a future explicit product decision changes its documented security model.

---

## 2. Why this integrates naturally

Kosmos-Oden already treats a folder manifest note named `index`, `README`, `MOC`, or the folder's own name as a galaxy center. Therefore MOC quality directly affects:

- which note becomes a galactic focal point;
- human navigation in Obsidian;
- agent navigation through the Agent API/MCP;
- graph topology presentation;
- chronology/history views; and
- current-vs-superseded knowledge orientation.

The new Engine capability should replace ad hoc local classification where it overlaps, while preserving a fallback for vaults that do not use the new Navigation contract.

---

## 3. Dependency upgrade

After GKOS-Engine Navigation is released:

1. update `package.json` from the current exact GitHub v2.0.1 pin to the approved new Engine release (provisionally v2.1.0);
2. regenerate lockfile;
3. run all current typecheck/build/test/browser/invariant checks;
4. add Navigation contract version to `versions.json` / invariant checks where appropriate; and
5. fail build when product code expects a different Navigation contract than the pinned Engine provides.

Do not point production builds at Engine `main`.

---

## 4. Shared semantic ownership

The following behaviors MUST come from Engine imports:

- MOC discovery;
- MOC kind/ownership classification;
- candidate generation;
- managed-region parsing;
- text + semantic diff;
- stale-plan preconditions;
- navigation diagnostics;
- archive relative-path planning;
- semantic reason codes;
- affected-scope calculation;
- context-pack construction; and
- System Map/navigation projection.

Kosmos-Oden owns:

- Obsidian Vault API reads/writes;
- settings and UX;
- diff preview UI;
- user approval collection;
- local execution/rollback adapter;
- status notices;
- visual rendering; and
- product-specific API capability exposure.

---

## 5. Obsidian write adapter

Add a dedicated adapter, recommended location:

```text
src/plugin/navigation/
├── moc-executor.ts
├── moc-ui.ts
├── moc-commands.ts
├── moc-history.ts
└── navigation-capabilities.ts
```

Do not bury MOC write logic inside `main.ts` or `settings.ts`.

The executor must use Obsidian APIs where available, not undocumented filesystem assumptions.

Responsibilities:

- verify plan preconditions;
- acquire a vault-local run lease;
- create archive directories;
- preserve original relative path under the run root;
- compute/verify SHA-256;
- write candidate to temporary/safe path;
- replace live file using the safest Obsidian-supported operation;
- verify result;
- persist run manifest/diffs;
- update/refresh vault index;
- support rollback.

If true atomic replacement is not available through the platform, record the actual guarantee in the run manifest and use the safest recoverable sequence. Do not label it atomic if it is not.

---

## 6. UI and commands

Add commands such as:

```text
GKOS: Audit Navigation / MOCs
GKOS: Preview MOC Updates
GKOS: Apply Reviewed MOC Updates
GKOS: Create MOC for Current Folder
GKOS: MOC History
GKOS: Restore MOC from Run
```

### Preview screen

Show per MOC:

- path/scope;
- kind;
- ownership;
- outcome;
- text diff;
- semantic change summary;
- source-trigger/reason summary;
- validation warnings;
- sensitivity warning;
- archive destination; and
- checkbox for approval where multiple MOCs are in one run.

No MOC is modified from the preview screen until the user explicitly applies the reviewed plan.

---

## 7. Settings

Add a **Navigation & MOCs** section. It can be a new tab or a subsection of the existing GKOS note-formatting area, whichever produces the least mobile UI clutter.

Settings should include:

- enable Navigation/MOC analysis;
- MOC filename preferences;
- MOC kinds enabled;
- automatic proposal of new MOCs;
- managed vs hybrid default;
- archive root;
- whether unchanged MOCs are included in run reports;
- inclusion of attachments;
- sensitivity/visibility target;
- retirement proposals on/off;
- run-history retention policy;
- archive sync preference; and
- optional accepted semantic-group proposal provider.

Dangerous write options must be explicit and off by default for existing users during the migration release.

---

## 8. Standalone viewer remains read-only

The existing standalone product explicitly promises read-only scanning and no file modification.

Therefore:

- it may discover MOCs;
- it may render MOC health/status;
- it may compute candidates/diffs in memory;
- it may display historical changes if archive files are part of an imported snapshot; and
- it may expose Navigation context data to the in-page UI.

It MUST NOT:

- request write access;
- execute an Engine MOC transaction plan;
- archive/replace files;
- imply that a preview has changed the source folder.

Do not opportunistically use browser File System Access write APIs in this release merely because Chromium supports them.

---

## 9. Galaxy-center behavior

Move manifest/MOC recognition toward Engine Navigation classification.

Preferred behavior:

1. If Engine Navigation identifies an active MOC/manifest for a top-level folder, use that object as the galactic center.
2. If several candidates exist, use deterministic Engine ranking/policy and surface an ambiguity diagnostic if unresolved.
3. Archived MOCs under the Engine MOC run root are never eligible.
4. Retired/superseded MOCs are not current centers unless time-travel projection explicitly asks for that historical state.
5. If no Navigation capability is present, retain current legacy filename heuristic as compatibility fallback.

This gives the visual cosmos and the agent navigation system the same interpretation of what the folder's map is.

---

## 10. Chrono / historical navigation

Kosmos-Oden's timeline can gain a valuable optional layer: **MOC history**.

When a valid MOC run archive is available, allow the user to inspect:

- the MOC active at a selected historical time;
- semantic changes between two runs;
- newly introduced/removed navigation nodes; and
- rename/move history based on stable GKX identity.

Historical MOCs must remain historical projections, not duplicate current graph nodes.

A useful UI treatment is a separate “Navigation history” overlay rather than injecting all old MOC files into the starfield.

---

## 11. Incremental refresh integration

Kosmos-Oden already performs incremental note refresh and avoids full re-parsing for ordinary single-note edits.

Use Engine `getAffectedNavigationScopes(...)` against the graph delta:

```text
note change
   -> Kosmos existing incremental graph update
   -> Engine Navigation affected-scope calculation
   -> mark only relevant MOC previews dirty
   -> optionally show “MOC update available” badge
```

Do not auto-apply on every keystroke.

Recommended UX:

- silently recompute/mark **dirty** after a debounce;
- provide a nonintrusive badge/count;
- build full diff when user opens preview;
- apply only after explicit approval.

This keeps editing responsive and prevents a feedback loop in which generated MOC writes constantly retrigger themselves.

---

## 12. Feedback-loop prevention

A generated MOC update will itself create a vault file event.

The plugin must distinguish:

- user edit;
- synchronization change;
- Navigation transaction write;
- rollback write.

Use run ID/write provenance in the adapter's short-lived transaction state so its own committed MOC update does not immediately schedule a redundant regeneration.

After the write, perform one authoritative rescan of changed live MOCs and affected graph scopes.

---

## 13. Nextcloud synchronization interaction

MOC history adds a new sync consideration.

### Live MOCs

Treat live MOCs as ordinary user knowledge files for synchronization.

### Run archive

Default `_archive/moc-runs/**` contains potentially large, sensitive, historical material. Add an explicit policy:

- sync run archive: on/off;
- retention window/count;
- conflict handling.

Do not silently exclude the archive without telling the user if they expect full history portability; do not silently sync it if it would expose sensitive historical navigation.

### Safe sequencing

For a user-invoked MOC run when Nextcloud sync is enabled:

1. ensure no local sync mutation is currently active;
2. verify the plan against current local state;
3. execute local MOC transaction;
4. let normal sync upload the committed state/archive according to policy.

If both local MOC and remote version changed, use existing conflict preservation behavior rather than overwriting either version.

Where available, record the pre-run remote ETag/sync revision in the run manifest as implementation metadata.

---

## 14. Agent API / MCP

Expose read-only Navigation operations first.

Recommended capabilities:

```text
navigation.capabilities
navigation.list_scopes
navigation.get_moc_status
navigation.plan_moc
navigation.diff_moc
navigation.audit
navigation.context_pack
navigation.history
```

Do NOT expose an apply endpoint using the ordinary read API token in the first release.

If later required, MOC mutation must use:

- explicit write capability setting;
- separate permission/scope;
- explicit plan ID;
- stale-plan verification;
- actor identity where available;
- user-approved or AgentOS-authorized operation; and
- returned run receipt.

“Agent can read my vault” must never imply “agent can rewrite my navigation.”

---

## 15. Human-authored MOCs

Obsidian users often hand-curate MOCs. Protect them.

For an existing unmarked index/MOC:

- classify as unmanaged by default;
- offer **Convert to hybrid managed MOC**;
- preview insertion of managed region markers;
- preserve all existing prose outside managed regions.

For a fully managed MOC:

- display a clear banner/property/metadata indication if the chosen profile allows it;
- allow “detach from generator” by converting it to unmanaged/hybrid without destroying content.

Never assume a file named `MOC.md` is fully generator-owned.

---

## 16. Visual MOC status

Optional visual enhancements should be subtle and derived from Engine state:

- current managed MOC center: normal center treatment;
- MOC with pending diff: small badge/halo in inspector, not alarming global animation;
- stale/invalid MOC: diagnostic icon;
- historical MOC: shown only in history mode;
- unmanaged human MOC: normal note, with management state in inspector only.

Do not change astronomical classifications merely because a MOC is generator-managed.

---

## 17. Security requirements

Add threats/tests for:

- archive path traversal;
- malicious note names that escape archive root;
- symlink/reparse-point escape where platform allows it;
- overwriting an unrelated file through a stale plan;
- unauthorized Agent API apply;
- restricted note title leaked into lower-sensitivity MOC;
- archive synced to a less-restricted remote destination;
- managed markers crafted to capture human sections;
- concurrent Nextcloud sync and MOC apply;
- transaction crash/restart recovery;
- unbounded archive growth.

Update `docs/THREAT-MODEL.md`.

---

## 18. Testing

Add at least:

```text
test/navigation-integration.test.mjs
test/moc-executor.test.mjs
test/moc-settings.test.mjs
test/moc-agent-api.test.mjs
test/moc-nextcloud.test.mjs
```

Browser/UI coverage should test:

- mobile diff screen usability;
- no write from standalone;
- plugin preview/apply flow;
- archive excluded from rendered live cosmos;
- galaxy-center selection uses current Engine Navigation result;
- dirty MOC badge appears after relevant note change only.

Reuse Engine compatibility fixtures rather than rewriting them.

---

## 19. Documentation updates

Update:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/EVOLUTION-AND-SAFEGUARDS.md`
- `AGENT-API.md`
- `docs/THREAT-MODEL.md`
- release notes/changelog

Document clearly:

- Engine is semantic owner;
- plugin can be write-capable only by opt-in;
- standalone remains read-only;
- old MOCs are archived before replacement;
- historical MOCs do not enter current graph;
- human-owned regions are preserved;
- no LLM proposal self-approves.

---

## 20. Phased build

### KOS-NAV-0 — dependency/protocol preparation

- land Engine release;
- pin it;
- capability/version checks;
- no UI change yet.

### KOS-NAV-1 — read-only navigation

- consume discovery/audit/context-pack APIs;
- use Engine MOC classification for galaxy centers;
- add read-only status/preview.

### KOS-NAV-2 — Obsidian MOC write adapter

- archive/verify/replace/run manifest/rollback;
- no Agent API writes;
- explicit local UI approval.

### KOS-NAV-3 — incremental and history UX

- affected-scope dirty tracking;
- history/semantic diff UI;
- Chrono overlay integration.

### KOS-NAV-4 — sync hardening

- archive sync policy;
- conflict tests;
- retention controls.

### KOS-NAV-5 — optional governed agent write path

Only after separate authority/security review.

---

## 21. Acceptance criteria

Kosmos-Oden integration is accepted when:

1. It consumes Engine Navigation rather than duplicating semantics.
2. Existing vaults render compatibly before Navigation is enabled.
3. Engine-classified active MOCs become galaxy centers consistently.
4. Archived MOCs never appear as current celestial bodies.
5. Standalone stays read-only.
6. Plugin preview does not modify files.
7. Apply archives and verifies old MOC before replacement.
8. Archive preserves original relative path under the run folder.
9. Hybrid human content survives unchanged outside managed regions.
10. Rollback restores exact bytes/hash.
11. stale plans and concurrent changes fail closed.
12. Nextcloud conflicts preserve both sides.
13. Agent API cannot mutate MOCs with ordinary read authorization.
14. mobile and desktop flows are usable.
15. full existing Kosmos test/invariant/browser suite remains green.
