# Phase 5 watcher host

This document describes the repository-private Phase 5 watcher host. It is an implementation and qualification surface, not a package export, release, deployment, or service-activation claim. The frozen recovery contract pack remains the semantic authority.

## State roots

For vault `<vault>`, the host securely reopens these distinct capabilities:

- `D = <vault>/.gkx/derived`
- `R = D/retrieval`, the existing Phase 3 retrieval root
- `W = D/watcher`, the watcher authority and coherent-generation root
- `J = W/journals`, the journal pointer, descriptors, and generation parent
- `S = dirname(resolve(statusFile))`, the caller-selected desktop status/token root

New `W`, `J`, and `S` directories are owner-only. Existing roots must already be direct, non-aliased, non-link capabilities with stable identity; the host does not repair or relocate unsafe state. The existing bearer token stays at `S/desktop-agent.token`. It is reused for the legacy desktop routes, `/status`, and `/control/shutdown`; it is never copied into watcher records.

## Coherent generations

One immutable `ServiceGeneration` binds the accepted/rejected topology, canonical GKX snapshot, Phase 3 retrieval projection, canonical graph, deterministic Graphiti projection, journal transitions, coherent manifest, and outer pointer. A request captures one generation. The outer pointer is published only after the complete transition and activation intent are durable, so REST and external `gkx search` readers observe either the old generation or the new generation, never a mixed projection.

Filesystem hints are advisory. The host coalesces scoped hints, escalates unscoped or overflow input to a full reconciliation, and periodically performs a secure two-snapshot scan. Fresh status requires current watcher coverage plus a byte-equal secure scan. Fatal UTF-8, capability, link, traversal, time-of-check/time-of-use, or namespace instability leaves the old generation active. A deterministic Phase 3 rejection instead publishes the coherent accepted `N-1` topology and its exact rejection ledger without inventing a source-removal event.

Configured embedding providers use the existing Phase 3 provider seam and public-only eligibility policy. Exact content-digest cache hits are reused. Provider failure publishes the complete lexical fallback and marks status degraded; no second provider-routing policy exists in the watcher.

An unstable capability/read/TOCTOU attempt is committed as a durable failed batch before one retry timer is armed. Consecutive failure index `n` starts at zero, survives restart, and waits `min(500 * 2^min(n,4), 5000)` milliseconds: 500, 1,000, 2,000, 4,000, then 5,000 without jitter or an attempt cap. Every retry is a fresh unscoped `failure_reconciliation` production `setFiles` batch bound to its immediate failed parent. Filesystem hints, periodic/manual/startup reconciliation, and request-local freshness share one active-plus-one-pending coordinator while backoff is armed. A byte-identical successful retry writes only its Batch, ObservationAuthority, PlanAuthority, and no-op Transition rows; it leaves Active, retrieval, graph, provider, and outer-pointer bytes unchanged and clears the durable epoch. A changed complete activation also clears it. Shutdown cancels the process timer but does not reset durable retry history.

## Journal bootstrap and recovery

The journal database is `J/journal-<journal_instance_id>/watcher-journal.sqlite`. Bootstrap is admitted only at global genesis and is serialized by the service HostLock. The recovery chain retains:

- the original null-journal-pointer HostLock witness;
- the permanent no-replace target selector `watcher-journal-bootstrap-target-selector.json`;
- a content-addressed planned target containing the exact Meta, Generation, and JournalPointer bodies;
- the permanent recovery Bridge under `W`;
- a bounded linear chain of immutable Executor records;
- the bootstrap Authority and stable fixed journal pointer.

The selector and Bridge are permanent tombstones. Late contender candidates are never authority after Bridge publication and are removed only when their exact owner/mode/link/path identity proves them inert. Canonical mismatches, aliases, unexpected links, forks, missing chain members, parent drift, or the executor cap retain evidence and fail closed.

Journal reset is a stopped-service operation under the reset HostLock and SQLite exclusive authority. It archives rather than deletes the old generation, carries the exhaustive activated source-removal outbox, and atomically replaces the journal pointer. The first reset of the immutable genesis journal binds its historical null anchor to the current nonnull outer coherent DAG. Startup then performs exactly one production `setFiles` proof; if every source/configuration/policy/topology/retrieval/graph coordinate is unchanged, one atomic three-row adoption records the current Batch, adoption Transition, and byte-identical Active authority without a provider call, retrieval write, or outer-pointer publication.

## Service and CLI

The desktop host preserves the legacy authenticated routes exactly:

- `GET /`
- `GET /health`
- `GET /notes`
- `GET /graph`
- `GET /graphiti/episodes`

It adds authenticated `GET /status` and `POST /control/shutdown`. There is no desktop `/retrieval` route. Locator publication occurs only after host/journal recovery and loopback listen. Every status operation securely reopens the locator and binds its service instance and PID to the held HostLock.

The repository CLI accepts only:

```text
gkos status --state <state-directory> [--json]
gkos watcher journal-reset --state <state-directory> --expected-journal-generation-digest <sha256> --expected-coherent-manifest-digest <sha256> [--json]
```

For status, `<state-directory>` is `S`. For reset, it is `W`; reset never opens the desktop token. Exit `0` is a fresh status or successful reset, exit `1` is an admitted non-fresh status, exit `2` is an argument/state/expected-coordinate error, and exit `3` is an operational recovery failure.

Signal, control, and repeated shutdown requests share one promise. Shutdown stops new hints and requests, drains or safely stops active work, flushes pending reconciliation, checkpoints and reopens authority, closes services, removes only the owned locator, and releases the HostLock last. The host does not call immediate `process.exit`; an unsafe operation beyond ten seconds remains in stopping/error for external forced termination and subsequent recovery.

## Qualification

The private qualification runner consumes the corrected frozen 4,363-byte SamplePlan draft.2. Its 22 measured reads execute strict production `gkx search` with the frozen `as_of` coordinate and the production configuration, public-only policy, and builtin effective profile. On Linux and Windows Node 24, physical FTS5 is mandatory. Node 22 and 23 emit a governed unavailable measurement with zero work when physical FTS5 is absent; they do not skip semantic/security tests.

An available lane performs one initial generation, two warm-up edits, twenty measured edits, and twenty-two external `gkx search` queries. Every measured latency and p95 must be at most 5,000,000 microseconds. A clean scan of the final source state must equal the incremental canonical GKX, retrieval manifest, canonical graph, and Graphiti digests. The only uploaded leaf is canonical `watcher-observation-measurement.json` in archive `phase5-watcher-recovery-observation-${{ runner.os }}-node-${{ matrix.node }}`.
