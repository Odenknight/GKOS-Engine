# Navigation Effects contract 1.0.0

Navigation Effects is an additive, opt-in contract targeted for the
GKOS-Engine 2.2.0 feature line. It does not change Navigation 1.0, authorize an
effect, or claim GKOS conformance.

## Contract and implementation surface

The framework-neutral `gkos-engine/navigation-effects` export provides contract
types, deterministic MOC planning/region merging, path and grant validation, an
in-memory fault adapter, and `getNavigationEffectsCapabilities()`. The optional
`gkos-engine/navigation-effects/node` export provides the Node filesystem
executor. Neither export changes Navigation 1.0 or activates write capability
by its presence. The default capability report advertises pure MOC apply
planning but no active source write, archive, recovery, rollback, or agent note
capability.

The Node executor requires an absolute vault root and a host precondition
provider. It uses a single-writer lease, hash-chained and flushed JSONL journal,
scoped target locks, exact before/after archives, same-directory temporary
files, same-volume rename, after-read verification, receipts, checkpoints, and
startup recovery. Archive, receipt, journal, or checkpoint corruption blocks
startup. Its durability report explicitly does not claim directory-entry fsync;
on Windows, file flush plus same-volume rename cannot prove persistence across
sudden power loss.

Execution capability depends on configured host services:

| Capability | Required configuration |
| --- | --- |
| `plan_moc_apply` | Contract package only; produces values, not effects |
| `atomic_replace` | Host adapter |
| `archive_previous_moc`, `startup_recovery` | Host adapter, durable journal, and policy |
| `apply_managed_moc`, `rollback_execution` | Adapter, authority provider, journal, and policy |
| `agent_note_create`, `agent_note_update`, `agent_note_archive` | Adapter, authority provider, journal, and policy; per-request grants still required |
| `arbitrary_source_write` | Always false |
| `agent_note_delete` | Always false in contract 1.0 defaults |

Capabilities describe configured infrastructure, not authority for a specific
request. Each future adapter call must still validate the current grant,
expiry, root, operation, sensitivity ceiling, policy, retention hold, and
optimistic preconditions.

## Ownership and paths

MOC ownership is `unmanaged`, `region-managed`, or `fully-managed`. Unmanaged
MOCs may be discovered and diffed but not automatically applied. Adoption is a
reviewed, hash-bound effect. Region-managed MOCs use the exact version-1 marker
grammar in ADR 0001 and preserve every byte outside the generated region.

All effect targets are normalized vault-relative paths resolved inside a
registered root. Absolute paths, drive and UNC paths, traversal, NULs, reserved
device names, trailing dot/space hazards, Unicode or case collisions, and
symlink/junction/reparse-point escapes are invalid. Archives use exactly
`_archive/moc-runs/YYYY-MM-DD/<run-id>/`; Navigation continues to exclude
exactly `_archive/moc-runs/**`.

The default agent root is `_kosmos/agent-notes/<agent-slug>/`. A stable agent
UUID owns the grant; the slug and display name do not transfer authority.

## Transaction and recovery values

An effect plan binds target, operation, prior digest or required absence,
proposed digest, source/configuration/policy/corpus digests, authority, and an
idempotency key. The journal state model is:

```text
RECEIVED -> PLANNED -> PREPARED -> APPLYING -> VERIFIED -> COMMITTED
                                  |             |
                                  v             v
                                STALE         RECOVERY_REQUIRED
```

Any nonterminal state may become `ABORTED` only with a reason and receipt.
Recovery classification is one of `effect-absent-retryable`,
`effect-present-verified`, `conflicting-external-bytes`, or
`ambiguous-or-corrupt`. Only the verified-present case may finish a missing
receipt without repeating the source effect. Conflicting or ambiguous state
blocks write enablement.

Receipts contain digests and reason codes, not note bodies or credentials.
Compare-and-swap conflicts disclose the current digest only when policy permits
it and never disclose unauthorized current content.

## Contract pack

Machine-readable schemas (including bounded MCP agent-write request/result
values) and adversarial fixtures are in
`contracts/navigation-effects/ENGINE-NAV-EFFECTS-CONTRACT-1.0.0`. The fixtures
cover planned success, byte-identical no-op, stale precondition, denied
authority, CAS conflict, verified recovery, malformed markers, path escape,
and ambiguous lineage. In Phase 0 every fixture has `sourceWrite: false`.
