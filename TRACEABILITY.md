# GKOS-Engine traceability

**Code line:** GKOS-Engine 2.1.1

**Package metadata:** `2.1.1`; release target `v2.1.1`

**Standard traceability:** active IDs at pinned commit
`f3a3a1695263f162d2660b0f7b37116bba7db12e`; implementation evidence only.

## Navigation 2.1 / R15 mapping

| Active requirement ID | Non-normative Engine evidence |
| --- | --- |
| `GKOS-RECEIPT-001` | `src/governance/types.ts`, `src/governance/state-change-receipt.ts`; receipt-role binding tests |
| `GKOS-RECEIPT-002` | `src/governance/store.ts`; fail-closed durability and optimistic-precondition tests |
| `GKOS-RECEIPT-003` | `src/governance/store.ts`; idempotent replay and conflicting-operation tests |
| `GKOS-POLICY-001` | Versioned Navigation configuration, delegation predicate, review, and retention policy references |
| `GKOS-RETENTION-001` | `src/navigation/delegation.ts`; evaluation-only hold boundary, with no disposition API |
| `GKOS-RETENTION-002` | Mandatory unavailable or indeterminate hold evaluation blocks and routes review |
| `GKOS-RETENTION-003` | Capability and CLI gates make archive deletion unavailable in 2.1.1 |
| `GKOS-REENTRY-001` | `src/navigation/reentry.ts`; every re-entry result is a distinct Layer-1 source proposal |
| `GKOS-REENTRY-002` | Exact predecessor identity/version/digest is context only; no standing is inherited |
| `GKOS-REENTRY-003` | Supersession has an effect only after an explicit declaration request |
| `GKOS-REENTRY-004` | Predecessor mutation, merging, and retention/disposition are rejected by contract and tests |
| `GKOS-DELEGATION-001` | `src/navigation/delegation.ts`; exact actor, operation, vault, and object-class scope |
| `GKOS-DELEGATION-002` | Child grants must be attenuated from an identified parent authority |
| `GKOS-DELEGATION-003` | `notBefore` and expiry are enforced against an explicit evaluation time |
| `GKOS-DELEGATION-004` | Deterministic `routine | major | indeterminate` predicate; only routine may proceed |
| `GKOS-DELEGATION-005` | Checker input is escalation-only and has no major/indeterminate-to-routine path |
| `GKOS-DELEGATION-006` | Append-only deferred review and affected-grant overdue freeze with bounded exception |

The corresponding executable evidence is in `test/governance.test.mjs`,
`test/navigation.test.mjs`, `test/navigation-determinism.test.mjs`, and
`test/navigation-architecture.test.mjs`. Retention support is evaluation-only:
the Engine implements no archive deletion or disposition API in 2.1.1.

This record connects implementation behavior to the permanent GKOS requirement
registry without treating the engine as normative. The detailed non-normative
mapping is in
[`docs/GKOS-REQUIREMENT-ADAPTER.md`](docs/GKOS-REQUIREMENT-ADAPTER.md).

## Authority chain

1. Owner-authorized developmental release direction.
2. Standard `requirements/REGISTRY.md`, which owns the permanent identifiers.
3. Standard `conformance/adapters/gkos-engine.requirements.json`, which owns the
   cross-project observation mapping.
4. This repository's source and tests, which provide implementation evidence.
5. Commit-scoped verification evidence recorded after execution.

## Implemented evidence surface

| Area | Permanent IDs represented through the adapter | Implementation evidence |
| --- | --- | --- |
| Conformance reporting boundary | `GKOS-CONFORMANCE-001..003` | Standard runner behavior and adapter mapping; the engine makes no qualifying profile claim. |
| Identity | `GKOS-IDENTITY-001..004` | UUIDv7 generation, UUIDv4/v7 preservation, authored UID validation, target-identifier separation, and migration tests. |
| Lineage | `GKOS-LINEAGE-001..003` | Branch-preserving normalization, temporally valid `invalid_at`, no-winner behavior, and lineage tests. |

The trace is implementation evidence only. It is not independent verification,
a GCP profile result, or proof of a GitHub or npm publication.

## Open boundary

Canonical edge direction, duplicate handling, and catalog qualification remain
governed by the standard process. The Engine must not present implementation
results as a standard conformance certification.

## Standard authority

The requirement identifiers and adapter coverage are anchored to the companion
GKOS Standard repository:

- Registry: `gkos-standard/requirements/REGISTRY.md`
- Adapter map: `gkos-standard/conformance/adapters/gkos-engine.requirements.json`

The starter graph expectation `GCP3-L01` covers `GKOS-LINEAGE-001` and
`GKOS-LINEAGE-003`; it does not cover `GKOS-LINEAGE-002`, and its catalog status
remains `UNEVALUATED`.

## Verification status

The repository-surface rebrand checks are recorded in
[`evidence/2026-08-05-gkx-2.0-repository-verification.md`](evidence/2026-08-05-gkx-2.0-repository-verification.md).
The original Navigation release validation is recorded against the final 2.1.0
implementation tree in `evidence/2026-08-16-navigation-2.1.0-verification.md`;
2.1.1 adds the archive-isolation regression and release-gate evidence.
