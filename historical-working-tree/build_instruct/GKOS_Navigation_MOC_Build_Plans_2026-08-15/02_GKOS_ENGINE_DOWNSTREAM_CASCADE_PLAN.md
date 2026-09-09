# GKOS-Engine Navigation Capability — Downstream Cascade and Compatibility Plan

**Status:** Ecosystem integration directive  
**Primary dependency:** GKOS-Engine Navigation/MOC capability  
**Prepared:** 2026-08-15  
**Goal:** Make Navigation/MOC behavior an Engine-owned reusable contract that reaches Kosmos-Oden and every GKOS-Engine consumer without semantic forks.

---

## 1. Purpose

The Navigation and MOC lifecycle capability must **cascade through dependency boundaries**, not be independently reimplemented in each product.

The governing rule is:

> **One Engine semantic implementation; many platform adapters and user experiences.**

Consumers may decide *whether* they can write, how they present a preview, and what authority gate they require. They may not redefine what counts as an MOC change, how semantic diffing works, how source identity is resolved, or how an archive path is derived.

---

## 2. Known current consumers / related products

At the observed repository baseline:

- `Odenknight/Kosmos-Oden` directly pins `gkos-engine` at GKOS-Engine v2.0.1.
- GKOS-Engine documentation identifies Kosmos Research Studio and GKOS-Engine-Lite as consumers/reference surfaces.
- Kosmos-Oden has plugin, standalone, CLI/build, REST/MCP Agent API, Graphiti export, and synchronization surfaces that must continue sharing one semantic interpretation.

The implementation team MUST perform a fresh dependency search before release to find every repository/package that references any of:

```text
gkos-engine
Odenknight/GKOS-Engine
GKOS-Engine#
from "gkos-engine"
require("gkos-engine")
```

Do not assume the above known list is exhaustive.

Produce a machine-readable `consumer-matrix.json` during the release campaign.

---

## 3. New Engine capability contract

Publish an additive Navigation namespace, provisionally:

```ts
import { navigation } from "gkos-engine";
```

The consumer-facing API should expose pure semantics such as:

```ts
navigation.discoverMocs(...)
navigation.planMocRun(...)
navigation.diffMoc(...)
navigation.validateMoc(...)
navigation.audit(...)
navigation.buildContextPack(...)
navigation.getAffectedScopes(...)
```

It should NOT force a filesystem implementation.

Consumers receive a `MocTransactionPlan` containing declarative operations and preconditions. A consumer chooses an executor appropriate to its platform.

---

## 4. Capability advertisement

Consumers and APIs should advertise capability, not assume it.

Recommended model:

```json
{
  "navigation": {
    "version": 1,
    "read": true,
    "moc_plan": true,
    "moc_diff": true,
    "moc_apply": false,
    "moc_rollback": false,
    "system_map": true
  }
}
```

Examples:

- standalone browser viewer: read/plan/diff may be true; apply false;
- Obsidian plugin: read/plan/diff true; apply/rollback true only after explicit user opt-in;
- read-only Agent API: apply false;
- Node CLI: apply/rollback available only with explicit `--write`;
- AgentOS integration: plan true; apply only through a separately authorized write tool.

This prevents a downstream product from accidentally converting a read-only promise into a mutation path simply because the Engine gained a planner.

---

## 5. Write adapter contract

Create or document a platform adapter interface. The exact API may change during implementation, but responsibilities must remain explicit.

Example:

```ts
export interface MocExecutionAdapter {
  platformId: string;
  capabilities(): MocExecutionCapabilities;
  read(path: string): Promise<Uint8Array | string>;
  sha256(pathOrBytes: ...): Promise<string>;
  mkdirp(path: string): Promise<void>;
  writeTemp(path: string, content: string): Promise<string>;
  archiveCopy(from: string, to: string): Promise<void>;
  atomicReplace(temp: string, live: string): Promise<void>;
  removeTemp(path: string): Promise<void>;
  acquireLease(scope: string, runId: string): Promise<Lease>;
}
```

Do not put this adapter's implementation into the core. A Node executor and an Obsidian executor are separate implementations tested against the same contract fixtures.

---

## 6. Contract test pack

GKOS-Engine should ship or publish a reusable Navigation compatibility fixture set.

Every write-capable consumer must demonstrate the same required behavior:

1. archive old MOC before replacement;
2. preserve old MOC relative path under dated/run archive root;
3. verify old archive SHA-256;
4. fail on stale plan;
5. preserve human-owned regions;
6. reject path traversal;
7. rollback exact content;
8. ignore MOC run archive from live graph;
9. preserve semantic diff classifications; and
10. record actual platform atomicity guarantees.

A consumer cannot claim `navigation.moc_apply=true` until it passes this pack.

---

## 7. Versioning strategy

Assuming the Engine change is additive, target:

```text
GKOS-Engine 2.1.0
Navigation contract 1
```

Consumers should pin an exact release/tag during initial rollout rather than `main`.

Add an Engine capability version independently of package semver so future MOC behavior can be negotiated:

```ts
NAVIGATION_CONTRACT_VERSION = 1
```

A consumer that understands Engine 2.1 but only Navigation contract 1 can reject a future incompatible Navigation v2 rather than guessing.

---

## 8. Cascade release sequence

Use the following order.

### Gate A — Engine core

- merge Navigation read-only core;
- pass existing Engine test suite;
- pass new Navigation fixtures;
- freeze public types;
- document compatibility.

### Gate B — Engine Node executor

- implement explicit CLI write path;
- pass archive/rollback/failure-injection tests;
- verify read-only CLI commands remain read-only.

### Gate C — Kosmos-Oden integration

- update exact Engine dependency;
- consume Engine MOC semantics;
- implement Obsidian write adapter;
- keep standalone read-only;
- pass shared fixture pack plus product UI/browser tests.

### Gate D — other direct consumers

For each discovered consumer:

- update dependency;
- classify surface as read-only vs write-capable;
- add capability advertisement;
- run contract tests appropriate to capability;
- record incompatibilities.

### Gate E — AgentOS / orchestration consumers

Where an AgentOS uses GKOS-Engine:

- expose navigation as read/context tools by default;
- expose MOC plan/diff as non-consequential planning tools;
- expose apply/rollback only behind explicit write authority and receipt/approval controls;
- never let model confidence become write permission.

### Gate F — portfolio release report

Publish:

- Engine release/tag/commit;
- consumer matrix;
- tested version pins;
- capability matrix;
- known divergences;
- deferred integrations.

---

## 9. Consumer matrix template

```markdown
| Consumer | Engine pin | Nav v | Read | Plan | Diff | Apply | Rollback | Adapter | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| Kosmos-Oden plugin | 2.1.0 | 1 | Y | Y | Y | Y | Y | Obsidian | pending |
| Kosmos-Oden standalone | 2.1.0 | 1 | Y | Y | Y | N | N | none | pending |
| GKOS-Engine-Lite | ... | ... | ... | ... | ... | ... | ... | ... | audit |
```

The final table must be generated from actual repositories, not this example.

---

## 10. Read-only consumers

Read-only consumers must still benefit from the new Engine.

They may:

- discover MOCs;
- display MOC health;
- show semantic/text diffs in memory;
- show stale MOC indicators;
- build navigation context packs;
- expose System Map/navigation relationships;
- visualize current vs historical navigation state if archived data is supplied by another source.

They must not:

- request directory write permission solely because the Engine supports it;
- create an implicit apply endpoint;
- pretend a preview changed the workspace.

---

## 11. Write-capable consumers

A write-capable consumer must add four separate user/authority states:

```text
READ
  |
PLAN
  |
REVIEW / APPROVE
  |
APPLY
```

Plan generation is not approval. Approval is not proof the write succeeded. Apply must return a receipt/run manifest.

If the platform cannot archive/replace safely, advertise apply=false and remain preview-only.

---

## 12. MOC archive recursion protection across consumers

Every consumer's scan layer must consume the Engine's shared `shouldIgnore...`/navigation-ignore rules or equivalent public predicate so:

```text
_archive/moc-runs/**
```

is not parsed as current knowledge.

This must be tested in:

- Engine CLI scans;
- Kosmos-Oden plugin vault scans;
- Kosmos-Oden standalone imports;
- Agent API graph builds;
- any Lite implementation; and
- any future file watcher.

A product must not invent a separate archive-ignore pattern that can drift from Engine behavior.

---

## 13. Agent/API integration contract

Expose navigation reads through APIs/MCP in a model-agnostic form.

Recommended logical operations:

```text
navigation.capabilities
navigation.list_scopes
navigation.get_moc
navigation.plan_moc
navigation.diff_moc
navigation.audit
navigation.context_pack
```

Mutation operations, if ever exposed:

```text
navigation.apply_moc_plan
navigation.rollback_moc_run
```

must use a separate explicit authorization path from ordinary graph reads. They should not be enabled simply because an agent has permission to query notes.

The response must include:

- Engine version;
- Navigation contract version;
- policy hash;
- corpus/source digest;
- plan/run ID;
- warnings; and
- write capability state.

---

## 14. Consumer-specific semantic overrides

Consumers may customize presentation and policy, but not core semantics.

Allowed overrides:

- headings/template style;
- which MOC kinds are enabled;
- creation thresholds;
- archive root (subject to safety checks);
- human approval policy;
- visible sensitivity level;
- whether attachments appear;
- UI sort/group preferences that do not alter canonical semantic diff.

Not allowed:

- redefining stable identity;
- weakening sensitivity;
- bypassing stale-plan checks;
- changing `updated` into `unchanged` without same canonical candidate;
- skipping archive integrity for a write-capable conformance claim;
- treating an LLM proposal as approved;
- indexing historical MOC archives as live notes.

---

## 15. Compatibility failure behavior

If a consumer encounters a Navigation contract version it does not support:

- fail closed for writes;
- continue using older read-only Engine surfaces only if safe;
- clearly report the mismatch;
- never reinterpret an unknown operation plan.

If a consumer is pinned to Engine < Navigation capability:

- retain its existing behavior;
- do not polyfill a partial incompatible MOC implementation just to appear current.

---

## 16. Documentation cascade

Every updated consumer should receive a concise local document pointing back to Engine as semantic owner.

Recommended wording:

> Navigation/MOC discovery, candidate generation, semantic diff, validation, archive-plan semantics, and context-pack rules are provided by GKOS-Engine. This product supplies only its platform adapter, presentation, and authority gate.

This prevents later developers from moving Engine logic back into product code.

---

## 17. CI requirements

Add a portfolio-level compatibility job or scripted matrix that can verify:

- dependency pins;
- Navigation contract version;
- shared fixture results;
- archive-ignore behavior;
- package export availability;
- no vendored duplicate Navigation implementation;
- known read/write capability.

Where cross-repo CI is impractical, each consumer publishes a signed/tested compatibility result that the release coordinator collects.

---

## 18. Acceptance criteria

The cascade is complete when:

1. GKOS-Engine is the sole semantic owner of Navigation/MOC rules.
2. Kosmos-Oden consumes the released Engine API rather than copying code.
3. All discovered consumers are listed and classified.
4. Read-only consumers remain read-only by default.
5. Every write-capable adapter passes the shared archive/rollback contract fixtures.
6. MOC archives are excluded consistently from all live graph surfaces.
7. API/MCP capability advertisement is explicit.
8. dependency versions are pinned and documented.
9. no consumer silently weakens GKOS sensitivity or authority behavior.
10. future consumers can implement Navigation by importing the Engine plus a platform adapter contract.
