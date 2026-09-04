# Navigation Effects reconciliation — 2026-08-27

Status: draft integration evidence; no release, merge, deployment, write
authority, or production compatibility is implied.

## Coordinates

| Item | Coordinate | Decision |
| --- | --- | --- |
| Current integration base | `main@c0eac9351b73bfa4b93b2c0cb752fd55c0b88933` | Keep as the compatibility and service baseline |
| Committed Effects implementation | `9ed79aef` from `codex/navigation-effects-post-phase5` | Reconcile onto current main |
| Frontmatter correction | `95b104e5` | Skip: current main already contains equivalent isolated commit `ea0aa960` |
| Historical Effects CI/evidence | `389a354`, `808d875` | Do not replay mechanically; current main has newer qualification-closure and workflow logic |
| Dirty Effects worktree | `feature/navigation-effects-contract-v1` | Preserve untouched; its tracked integration wiring and untracked Effects tree overlap the committed Effects line |
| Successor-F1 dirty worktree | `codex/phase6-successor-f1-correction` | Reject for this integration: it identifies its generated embodiments as uncommitted/rejected and rewrites frozen Draft.1 bytes |
| F2 identity authority dirty worktree | `codex/phase6-f2-authority-engine` | Preserve as experimental reference only; it is uncommitted, Draft.1-bound, host-private, and not qualified against current Draft.2/main |
| Admission-policy branch | `agent/admission-policy-provider-v1@4ee4ad7` | Do not consume as write authority; it is unratified and every receipt states `authorityState: NONE` and `materializationAuthorized: false` |

The selected Effects implementation is separately versioned and remains
integration-only. Its package version stays `2.1.2`; the contract manifest's
Engine release target remains unreleased `2.2.0` work.

## Reusable mechanisms

- deterministic MOC planning and exact generated-region parsing;
- fail-closed ownership, marker, path, grant, and digest preconditions;
- framework-neutral planner and in-memory fault adapter;
- optional Node executor with a vault lease and deterministic target locks;
- hash-chained journal entries and checkpoints;
- exact before/after archives, diffs, results, and immutable receipts;
- same-directory temporary writes and after-read verification;
- rollback as a new authorized, digest-preconditioned effect; and
- startup recovery classification and corruption blocking.

These mechanisms do not supply a Kosmos coordinator, an Obsidian adapter,
authority, policy ratification, ownership adoption UI, reconciliation, or
automatic enablement.

## Read-only compatibility audit

The reconciliation must continuously prove:

1. `gkos-engine/navigation` retains its exact read-only capability document.
2. Navigation's import graph cannot reach Effects or filesystem mutation.
3. The framework-neutral Effects import cannot reach the Node executor.
4. Importing root, Navigation, Effects, and Effects/Node creates no files,
   settings, prompts, credentials, leases, or runtime authority.
5. Default Effects capabilities advertise planning only; every write remains
   false without explicit adapter, authority, journal, and policy inputs.
6. The local service continues to report Effects unavailable/disabled unless
   planner availability and every stricter runtime safety input are supplied.
7. Existing read-only REST, MCP, event, viewer, Graphiti, and retrieval outputs
   remain governed by the current authorized view.

## Integration order

1. Reconcile the committed framework-neutral contract and Node executor.
2. Re-run current-main build, public API, package, Navigation, service, and
   compatibility gates.
3. Add fresh current-head CI rather than replaying historical workflow edits.
4. Pin the exact integration commit in Kosmos as development-only.
5. Implement versioned, fail-closed Kosmos settings and truthful status.
6. Add ownership/adoption before any source-effect adapter is callable.
7. Add host adapters, journal/recovery wiring, coordinator, and reconciliation
   in separately reviewable packets.
8. Keep all automatic settings false until cross-packet qualification is green.

## Stop conditions

Stop if reconciliation requires changing Navigation 1.0 output bytes, weakening
authorization or qualification gates, treating a token as write authority,
rewriting a frozen Draft.1/Draft.2 pack, enabling a write by default, or
describing the experimental dependency as a released Engine 2.2 artifact.
