# Changelog

## Unreleased

- Current-runtime qualification retries one isolated watcher observation in a
  fresh process only after the exact Windows latency-ceiling failure; all other
  failures and a repeated latency failure remain terminal.
- Qualified maintained even-numbered Node.js releases: Node 22 and Node 24 are
  blocking CI lanes, while Node 26 is an informative current-release lane until
  it reaches LTS. Node 23 and Node 25 are unsupported.
- Moved sidecar SEA release builds to Node 24 and pinned the release workflow
  actions to their reviewed v5 commits.
- Added the separately versioned, opt-in Navigation Effects 1.0 contract,
  deterministic MOC apply planner, generated-region merger, path/grant
  validation, and fault-injectable in-memory adapter.
- Added an optional Node executor with a single-writer lease, hash-chained
  journal, scoped locks, exact MOC archives, flushed temporary writes,
  same-volume replacement, after-read verification, receipts, rollback,
  checkpoints, and startup recovery.
- Navigation 1.0 remains source-content read-only. This unreleased work makes no
  release, deployment, or GKOS conformance claim.

## 2.1.2

- Added the generic, deterministic `gkos.admission-policy.v1` provider contract
  with strict schemas, canonical replay vectors, hash-bound non-authoritative
  receipts, and no I/O, approval, activation, or materialization capability.
- Added private Phase 4 `gkx retrieval eval` and `gkx retrieval tune` host
  execution over sealed general offline fixtures and the optional strict
  24-query reviewed overlay, including actual coordinator/counter replay,
  disabled and degraded provider paths, deterministic presentation, unactivated
  temporary state, and guarded no-clobber candidate-TOML publication. No raw
  fixture, provider, tuner, filesystem, or output authority was added to the
  public `gkos-engine/retrieval` surface.
- Added the Phase 4 closeout qualification lanes: bounded Node 22/23/24 and
  Windows CLI/security receipts plus a daily/manual offline Node 24 Observation
  workflow over the deterministic 10,000-chunk real-FTS5 corpus. The lane
  records exact index/update/rebuild and query-work ledgers, enforces a strict
  500,000-microsecond p95 bound, and proves incremental/clean convergence without
  adding a public API, network/provider authority, or mutable production state.
- Added a shared fail-closed validation-to-context gate. Discoverable sources
  with error/critical diagnostics or duplicate canonical identities now reject
  the whole pack with stable reason codes; CLI rejection exits with code 3 and
  discloses no source metadata.
- Documented the exact Navigation, graph/export, desktop, governance,
  authorization, authentication, dependency, platform, connector, and MCP
  boundaries.
- Added the provider-neutral ingestion envelope while keeping provider SDKs,
  credentials, and network behavior outside the deterministic core.
- Added release-matrix coverage, desktop authentication recovery checks, and a
  tracked-content legacy-nomenclature gate.

## 2.1.1

- Fixed `gkx nav context` and `compileNavigationContext()` to
  exclude exactly `_archive/moc-runs/**`, matching Navigation scan, candidate,
  and contract behavior. The defect was discovered during external demo testing
  in a live environment: Engine 2.1.0 could incorrectly serve an allowed
  archived note as current context; affected context packs now omit it.

## 2.1.0

- Added deterministic, source-content-read-only Navigation 1.0 discovery, classification,
  candidates/manifests, semantic and text diff, audit, authorized context packs,
  incremental invalidation, re-entry planning, and bounded supersession evaluation.
- Added explicit append-only, optimistic, idempotent, receipt-bound Governance Store
  interfaces and an in-memory test adapter.
- Added `./navigation` and `./governance` exports and non-mutating `gkx nav`
  commands. Source writes, applies, deletes, and records are rejected.
- Declared the integration-only, non-qualifying Navigation evidence boundary.
- Changed the Navigation-enabled MOC convention to the canonical five only:
  `index`, `_index`, `readme`, `moc`, and `contents`. The former heuristic names
  `home`, `map`, `overview`, `dashboard`, `start`, and `toc` are now flagged and
  require human-governed promotion. This can be projection-observable for
  consumers that enable Navigation; non-Navigation behavior is unchanged.
- Added bounded, attenuated, expiring supersession evaluation with a
  three-state deterministic predicate, escalation-only checker, append-only
  deferred review, and affected-grant overdue freeze.
- Deferred NAV-002, the undefined Walk Test, and all source-content mutation to
  a separately reviewed future write executor.

## 2.0.1

- Excluded generated Python bytecode and cache directories from the npm
  package after 2.0.0 exposed them during publication-time sidecar testing.
- No runtime or GKX contract changes from 2.0.0.

## 2.0.0

- **Breaking rebrand:** the schema and runtime surface use the GKX namespace.
  Documents use `gkx_version`; runtime state uses `.gkx/`; diagnostics use
  `GKX-*`; the command is `gkx`; and public schema APIs use `Gkx*` names.
- **Breaking package surface:** the canonical module is
  `dist/gkos-engine.mjs`. The removed historical module path, command, field,
  path, diagnostic, and API aliases are not supported in 2.0.0.
- Updated source paths, examples, CI smoke tests, build comments, traceability,
  verification evidence, and operational documentation to the GKX 2.0 contract.
- Retained the deterministic, platform-neutral architecture and the
  implementation-evidence boundary against the GKOS standard.

## 1.3.0

- Established the current GKOS-Engine product boundary and documented the
  downstream adapter, graph, projection, assessment, identity, and lineage
  evidence surfaces.

## 1.2.0

- Added complete relation projection for `refines`, `blocks`, and `documents`.
- Made the epistemic-state migration mapping conservative.
- Added optional intelligence contract test coverage.

## 1.1.x

- Added cross-architecture SEA build verification and deterministic optional
  intelligence proposal handling.
