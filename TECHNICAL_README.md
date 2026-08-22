# GKOS-Engine 2.1.2 technical guide

This document describes the Engine Navigation 1.0 implementation for library,
platform, security, and governance integrators. The public package version is
`2.1.2`; the Engine-owned Navigation integration contract is `1.0.0`.

## Scope and effect boundary

The release has two implemented planes and one reserved future plane:

| Plane | Responsibilities | Effects |
| --- | --- | --- |
| NavigationCore (`src/navigation`) | Snapshot discovery, classification, candidates, diffs, audits, context, invalidation, re-entry plans, policy evaluation | Pure with respect to filesystem state; returns values only |
| Governance (`src/governance`) | Receipt-role validation and an explicit append-only store contract | Governed metadata append through a host adapter; never source-content mutation |
| 2.2 write executor | Candidate application, archival, locks, stale-plan checks, rollback | Not present in 2.1.2 |

NavigationCore cannot transitively import `node:fs`, `node:fs/promises`, or
`node:child_process`. A release-blocking test walks its complete local import
graph and also proves that the test rejects a synthetic hidden writer.

The CLI may read a directory to construct a caller-equivalent snapshot. Its
Navigation commands only emit analysis or plans. It rejects mutation verbs,
output-file flags, and watch mode for Navigation.

## Capability discovery

```js
import { getNavigationCapabilities } from "gkos-engine/navigation";

console.log(getNavigationCapabilities());
```

The default response is:

```json
{
  "navigation_contract": "1.0.0",
  "navigation": {
    "discover": true,
    "classify": true,
    "candidate": true,
    "diff": true,
    "audit": true,
    "context": true,
    "reentry_plan": true,
    "bounded_supersession_evaluation": true,
    "governance_store_adapter": true,
    "apply_moc": false,
    "source_content_write": false,
    "archive_delete": false,
    "reentry_write": false,
    "rollback_execution": false,
    "reentry_record": false
  }
}
```

`reentry_record` becomes true only when the caller states both that a
Governance Store is configured and that a valid authority path is active. It
does not mean the Engine has gained source-write authority.

## Public entry points

The package exports `gkos-engine/navigation` and `gkos-engine/governance`.
Stable Navigation functions include:

| Function | Result |
| --- | --- |
| `discoverNavigation(snapshot, config)` | Entries, evidence, effective names, findings |
| `classifyNavigation(snapshot, config)` | Deterministically classified entries |
| `generateNavigationCandidates(snapshot, config)` | Candidate bytes and digest bindings |
| `buildMocRunManifest(input)` | Run-scoped provenance separate from candidates |
| `diffNavigation(before, after)` | Structured reasons and rendered text |
| `diffNavigationArtifact(before, after)` | Candidate policy/config/region/order reasons |
| `auditNavigation(snapshot, config, options?)` | Deterministic, non-fixing findings |
| `compileNavigationContext(snapshot, request, policy)` | Pre-filtered, budgeted context artifact |
| `applyNavigationIndexChanges(index, changes, snapshot, config)` | `GkxIndex.applyChanges()` delta and affected scopes |
| `invalidateNavigation(previousState, delta)` | Affected scope derivation from a `GraphDelta` |
| `planReentry(predecessor, incoming, policy, options?)` | New Layer-1 proposal; no mutation |
| `evaluateSupersession(proposal, grant, predicate, options)` | Fail-closed authorization evaluation |
| `evaluateRetentionHold(input, policy)` | Evaluation-only hold decision |
| `shouldIgnoreNavigationArchivePath(path)` | Exact `_archive/moc-runs/**` predicate |
| `getNavigationCapabilities(options?)` | Truthful effect advertisement |

Governance exports `GovernanceStore`, `GovernedRecord`,
`StateChangeReceiptRole`, `buildStateChangeReceipt`, `buildGovernedRecord`,
`validateStateChangeReceiptRole`, `InMemoryGovernanceStore`, and deferred-review
types/helpers. There is no public `applyMoc` or generic write function.

## Deterministic inputs and outputs

A `NavigationSnapshot` contains a vault ID plus source values. A source carries
its relative path, exact content, and optional stable identity, version, digest,
title, sensitivity, and relationships. Callers, not NavigationCore, acquire the
snapshot.

A `VaultNavigationConfig` binds a UUIDv7 config ID, monotonically increasing
version, vault, promoted names, creation provenance, prior digest where
applicable, and a versioned policy reference. `buildVaultNavigationConfig()`
canonicalizes promoted names and calculates the SHA-256 digest.

For identical snapshot, Engine version, Navigation contract, config, policy,
and other explicit inputs, the following are byte/reason identical:

- classifications and findings;
- candidate bytes and digests;
- source and config bindings;
- text and semantic diffs;
- audit findings;
- deterministic predicate results; and
- context canonical bytes.

Source enumeration is code-unit sorted. NavigationCore contains no wall clock,
locale comparison, randomness, process state, retrieval rank, model result, or
scheduler-dependent input. Run UUIDs and timestamps belong only in
`MocRunManifest`; differential tests vary them while requiring candidate byte
identity.

## MOC name and promotion policy

The sole built-in set is `index`, `_index`, `readme`, `moc`, and `contents`.
Only `.md` and `.markdown` are recognized document extensions for basename
comparison. Separators are normalized, comparison uses locale-independent
lowercase, and the observed filename is retained. Case differences are
findings, not silent renames.

`home`, `map`, `overview`, `dashboard`, `start`, and `toc` are flag-only names.
MOC-like noncanonical files receive `MOC_NAME_NONCANONICAL` with
`autoFix: false`.

Promotion follows this path:

1. `planMocNamePromotion()` creates a proposal that requires human acceptance.
2. `acceptMocNamePromotion()` accepts only a human actor and returns the next
   config plus a proposed receipt role.
3. The host wraps these values in its governed record and appends them through
   its Governance Store under an optimistic prior-digest precondition.
4. The host verifies durable binding before claiming the config committed.

After config resolution, promoted and canonical names use the same downstream
logic. Only provenance/config evidence differs.

## Candidate, manifest, diff, and audit contracts

Candidate bytes consist of a deterministic heading, managed markers, and sorted
direct-child links. The candidate binds its source snapshot, policy, config, and
per-source SHA-256 references. Generation never applies the bytes.

`MocRunManifest` records run identity/times, Engine/contract versions, config,
policy, candidate digests, warnings, omissions, and capabilities. It is
explicitly not a GKOS Context Manifest.

Diff reasons include stable-ID and exact-content moves, content and relationship
changes, added/removed sources, order changes, managed/human region changes,
and policy/config changes. Exact-content rename is only an observation; it is
not governed identity. Similarity never creates identity or supersession.

Audit checks configuration integrity, stale/orphaned/missing candidates,
candidate and run-manifest bindings, managed markers, archive leakage, stable
identity/lineage warnings supplied by the caller, context kind/budget/digest,
and explicit discoverability leak probes. It proposes findings and never fixes
source content.

## Discoverability and context

`compileNavigationContext()` calls the deployment-supplied
`DiscoverabilityPolicy` for each source. `deny`, `indeterminate`, and policy
errors all suppress the source before relationships, counts, warnings,
omissions, or budget aggregation. Relationships to suppressed objects are also
removed. No hidden-item placeholder or tombstone policy is invented.

After hidden sources disappear, the shared projection eligibility gate rejects
the entire pack if any otherwise discoverable source has an `error` or
`critical` diagnostic. Warnings and informational diagnostics remain
nonblocking. The library throws `NavigationContextRejectedError`, whose
`reasonCodes` and `rejection.reason_codes` contain stable diagnostic codes only;
the CLI prints the same rejection and exits `3`. It does not print diagnostic
prose or source metadata. Duplicate canonical identity is always blocking, and
a successful pack can never contain duplicate entry IDs.

The result declares:

```json
{
  "artifact_kind": "engine.navigation-context-pack",
  "gkos_context_manifest": false
}
```

A host may use this artifact as an input to its own higher-layer process; it
cannot relabel the Engine artifact as a Layer-6 Context Manifest.

## Incremental invalidation

`applyNavigationIndexChanges()` calls the existing `GkxIndex.applyChanges()`
exactly once, consumes its `GraphDelta`, derives affected ancestor scopes, and
discovers against the caller's post-change snapshot. Navigation maintains no
watcher cache or second semantic source of truth. Stable GKX identity therefore
continues to distinguish moves from delete/add churn.

## Re-entry and explicit supersession

`planReentry()` hashes the exact incoming bytes and proposes a distinct Layer-1
source identity/version with acquisition provenance. The predecessor reference
is context only. The plan always declares no predecessor mutation and no
predecessor disposition.

It rejects requests to merge into or mutate the predecessor, inherit standing,
infer supersession, or dispose of the predecessor. A supersession proposal is
present only when the caller supplies an explicit human-authority or delegated
declaration request. Layer, authority, epistemic state, decisions, Context
Manifest authorization, and Authorized Use standing never transfer.

The current GKX lineage adapter may serialize a newer-to-older `supersedes`
edge and accept authored `superseded_by` as an inverse. That is disclosed
Engine behavior, not a claim that GKOS R15 settled edge direction or inverse
vocabulary.

## Bounded delegation

A `SupersessionDelegation` is versioned, expiring, actor-contract-bound,
provenance-preserving, exact-operation, vault-scoped, object-class-scoped, and
attenuated from originating authority and any parent grant.

The deployment-supplied predicate returns `routine`, `major`, or
`indeterminate`. Only `routine` can authorize the bounded operation.
`indeterminate`, missing, invalid, or unavailable predicate results fail closed.
The optional checker exposes only `escalateToMajor`; it cannot express a
replacement decision and therefore cannot downgrade `major` or `indeterminate`.

Every authorized delegated routine evaluation produces a proposed receipt role
and a pending deferred-review item. An overdue required review freezes only the
affected grant for new mutations. An exception must be human-authorized,
independently bound, narrower than the grant lifetime, and durably receipted.

## Governance Store and durability

`GovernanceStore` is explicit, append-only, idempotent, optimistic-
preconditioned, and durability-declaring:

```ts
interface GovernanceStore {
  readonly atomicity: "atomic" | "transactional" | "best-effort-with-compensation";
  readonly bindingMechanism: GovernanceBindingMechanism;
  read(ref: GovernanceRef): Promise<GovernedRecord | null>;
  append(record: GovernedRecord, options: {
    idempotencyKey: string;
    expectedHead?: string;
    expectedDigest?: string;
  }): Promise<GovernanceAppendResult>;
  verifyBinding(operationId: string): Promise<DurabilityVerification>;
}
```

A State-Change Receipt is a semantic role. Its fields may be embedded in the
governed record; a duplicate receipt object is not required. The role binds
actor, authority, policy, exact operation, before/after targets, predicate where
applicable, outcome, time, transaction binding, and durability evidence.

Only the store may transition a proposed outcome to `committed`, and only at the
durable publication boundary. Receipt failure, durability failure, failed
optimistic preconditions, or conflicting replay produces no governed effect and
no successful claim. The included `InMemoryGovernanceStore` publishes record,
receipt outcome, durability evidence, ledger head, and idempotency maps as one
in-memory transaction. Production hosts must declare their own binding and
atomicity/compensation mechanism.

## CLI

Phase 4 adds two private-host retrieval-evaluation commands without widening the
public package API:

```text
gkx retrieval eval --fixture <golden-toml> [--json]
gkx retrieval tune --fixture <golden-toml> --output <candidate-config>
```

The CLI seals the golden parent as an owner-private capability, opens only exact
fixed sibling companions, and revalidates every directory/file identity and
namespace coordinate before presentation or publication. Its private 17-field
ExecutionAuthority receipt binds raw golden/conformance hashes, normalized
golden, environment, baseline, catalog, corpus, manifests, metric/tune/table
coordinates, nullable provider/reviewed coordinates, and the versioned literal
scan-presentation coordinate. `scan_presentation_fts5_available = true` controls
only deterministic lexical-scan reason bytes; it is not a host observation and
does not change the scan manifest, schema, or SQL. A true `sqlite_fts5` fixture
still requires the physical SQLite probe across the complete EnvironmentSet
before temporary state, index, or provider work. An object locator
requires the exact sibling; a null locator requires sealed absence, with no
fallback. Execution constructs one unactivated schema-3 SQLite generation per
environment in a sealed 0700 temporary child; it never reads or publishes an
active/legacy pointer. Embedding and reranker roles are independently active or
disabled; active calls come only from the finite offline transcript, while a
fully disabled environment uses no transcript, vectors, identities, or provider
calls. The actual coordinator and evaluator emit the 11-counter attempt receipt.
A present reviewed overlay must exact-match all 24 reviewed results, metrics,
origins, and counters and independently rebuild/replay the physical-absence
temporal pair; its absence enables the general 1..256-query eval surface and tune
through 30 queries without weakening companion sealing.
The executor independently derives the exact `phase4-fixed-offline-v1`
non-tunable base coordinate; a baseline substitution returns `needs_human`
before query/provider work instead of copying the baseline coordinate into the
current side of comparison.

Tune exhaustively evaluates the eligible 900-axis grid (21,600 reviewed query
attempts for the shipped fixture). A selected config is rendered through the
strict parser as minimal TOML. Publication uses a same-parent 0600 guard and
temporary file. The guard is itself atomically published through its fixed 0600
staging leaf, `fsync`, and hard-link no-replace before candidate creation.
Recovery recognizes the exact staging-only, staging/guard-linked, guard-only,
candidate-precommit, candidate/final-linked, and finalization states; every
alias, widened mode, third link, or coordinate mismatch retains evidence and
fails. Candidate cleanup removes the temporary link first and the guard last.
Existing or ambiguous targets are never overwritten. These parser, execution,
tuning, filesystem, and output surfaces exist only in the non-exported
evaluation-host bundle.

```text
gkx nav scan <dir>
gkx nav audit <dir>
gkx nav render <dir> --stdout
gkx nav diff <before-dir> <after-dir>
gkx nav context <dir> --recipient <id> --purpose <purpose> --stdout
gkx nav reentry-plan --predecessor <id> --predecessor-version <v>
  --predecessor-digest <sha256> --input <file> --new-source-id <id>
  --new-source-version <v> --acquired-at <ISO-Z> --actor <id>
gkx nav promotion-plan --proposal-id <uuidv7> --operation-id <uuidv7>
  --vault-id <id> --name <basename> --actor <id> --proposed-at <ISO-Z>
```

The CLI's context command intentionally uses the named `public-only` policy.
Only explicitly public sources are eligible. `--recipient` is recorded in the
artifact but does not authenticate that recipient or grant access; changing it
alone never changes eligibility. Enterprise authorization requires a host policy
adapter supplied to the typed library API.

A policy adapter can combine identity, group/role, purpose, and a sensitivity
ceiling while retaining explicit deny and indeterminate outcomes:

```js
const policy = {
  id: "enterprise:discoverability", version: "1",
  canDiscover({ recipient, purpose, object }) {
    const user = directory.lookup(recipient.id);       // host boundary
    if (!user) return "indeterminate";
    if (user.deniedObjectIds.has(object.id)) return "deny";
    if (!user.roles.includes("researcher") || purpose !== "research") return "deny";
    return sensitivityRank(object.sensitivity) <= sensitivityRank(user.ceiling)
      ? "allow" : "deny";
  },
};
```

The Engine passes the authored/effective sensitivity to the adapter and emits it
unchanged; an adapter decision cannot rewrite or lower the classification.
Thrown adapter errors resolve to indeterminate and are suppressed.

## Runtime, portability, and ingestion boundary

The npm package declares Node `>=22 <25` and npm `>=10`. “No runtime
dependencies” means no third-party entries in the npm `dependencies` field; it
does not mean no platform runtime. The optional Python intelligence service is a
separate Python 3.11+ process with its own installation and operating boundary.
After dependencies are installed and the package is built, deterministic local
validation, graph, Navigation, and package-library operations can run air-gapped.
Installing/building dependencies and any external connector operation may need
a package registry or provider network.

Release CI is configured to qualify Linux on Node 22, 23, and 24. The code and
desktop tests also cover platform-neutral behavior and Windows-specific token
documentation, but no universal portability claim is made beyond published
release evidence.

GKOS-Engine owns the provider-neutral ingestion contract documented in
`docs/INGESTION-CONTRACT.md`. Provider connectors remain separate packages.
This repository ships no direct Google Docs, Notion, SharePoint, or Confluence
connector and no MCP server.

## Verification and evidence standing

Run:

```sh
npm ci
npm run typecheck
npm run build
npm run test:navigation
npm test
npm run test:intelligence
npm run pack:check
npm run check:license
npm run check:nomenclature
```

`contracts/navigation/ENGINE-NAV-CONTRACT-1.0.0` is integration-only and sets
`gkos_conformance: false`. Its non-normative traceability is pinned to standard
commit `f3a3a1695263f162d2660b0f7b37116bba7db12e`. Engine tests do not define a
GKOS requirement, qualify a GCP profile, or substitute for a separately
applicable standard suite.

## Deliberately deferred

NAV-002, the undefined Walk Test, source application, managed-region writes,
archive deletion, locks/leases, stale-plan enforcement, rollback/compensation
execution, retention disposition, and sync-concurrency mutation tests are 2.2
or later work. Their absence must remain visible through capability reporting.
