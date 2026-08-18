# GKOS requirement adapter

**Implementation:** GKOS-Engine 2.1.1

**Authority:** The companion GKOS Standard owns requirement semantics and
conformance status. This document is implementation evidence only.

## Purpose

The engine maps its deterministic behavior to the permanent requirement IDs in
the standard-owned adapter map. A mapping is neither a conformance certificate
nor a claim that a fixture or test suite qualifies an implementation profile.

## Requirement evidence

| Requirement | Engine behavior observed | Evidence location | Boundary |
| --- | --- | --- | --- |
| `GKOS-CONFORMANCE-001` | Reports deterministic validation and diagnostic output without claiming qualification. | `src/gkx23.ts`, `src/graph.ts`, runner fixtures | Implementation evidence only. |
| `GKOS-CONFORMANCE-002` | Preserves explicit diagnostic severity and stable result serialization. | `src/gkx23.ts`, `src/graph.ts` | No independent verification. |
| `GKOS-CONFORMANCE-003` | Emits GKX schema, epistemic, temporal, sensitivity, relationship, and lineage diagnostics. | `src/gkx23.ts`, `src/graph.ts`; standard-owned adapter map | Observation inventory only. |
| `GKOS-IDENTITY-001` | Newly generated note identities use lowercase UUIDv7. Missing identity emits `GKX-IDENTITY-001`. | `makeGkxUuidV7`, `src/gkx-migration.ts`, migration tests | Implementation evidence only. |
| `GKOS-IDENTITY-002` | Valid lowercase UUIDv4 remains accepted and preserved. | `VALID_AUTHORED_UID`, `src/gkx-migration.ts`, migration tests | Reader and writer behavior only. |
| `GKOS-IDENTITY-003` | Valid historical UUIDv4 and UUIDv7 values are retained rather than regenerated during conversion. | Migration identity handling and tests | Migration evidence only. |
| `GKOS-IDENTITY-004` | Authored UID and relationship/evidence target identifiers have separate validation roles. | `src/gkx23.ts`, migration tests | No target-identity normalization claim. |
| `GKOS-LINEAGE-001` | Direct-successor branches are retained. | `src/lineage.ts`, lineage tests | Implementation evidence only. |
| `GKOS-LINEAGE-002` | `invalid_at` uses a temporally valid direct-successor timestamp. | `src/lineage.ts`, `src/temporal.ts`, lineage tests | Implementation evidence only. |
| `GKOS-LINEAGE-003` | No timestamp, UUID, lexical order, or tiebreak selects an authoritative successor. `GKX-LINEAGE-003` is an unresolved-target diagnostic, not the requirement itself. | `src/lineage.ts`, `src/temporal.ts`, lineage tests; standard-owned adapter map | Starter graph expectation remains `UNEVALUATED`. |

## Navigation 2.1 implementation observations

These mappings use only active identifiers at pinned standard commit
`f3a3a1695263f162d2660b0f7b37116bba7db12e`. They do not allocate Navigation
requirements or make NAV-001/NAV-002 qualifying.

| Requirement | Engine behavior observed | Evidence location | Boundary |
| --- | --- | --- | --- |
| `GKOS-RECEIPT-001` | A governed record can embed the complete State-Change Receipt semantic role. | `src/governance/types.ts`, `src/governance/state-change-receipt.ts`, governance tests | No duplicate receipt object is forced. |
| `GKOS-RECEIPT-002` | Only the store transitions proposed to committed at durable publication. | `src/governance/store.ts`, receipt/durability negative tests | In-memory adapter is test-only. |
| `GKOS-RECEIPT-003` | Operation and idempotency replay produce exactly one governed effect. | `src/governance/store.ts`, replay tests | Host adapters declare their binding mechanism. |
| `GKOS-POLICY-001` | Config, discovery, context, predicate, review, and hold behavior bind versioned policy references. | `src/navigation/types.ts`, Navigation tests | Deployment owns criteria and thresholds. |
| `GKOS-RETENTION-001` | A deployment hold predicate can be evaluated without deleting. | `src/navigation/delegation.ts`, retention tests | Evaluation-only in 2.1.1. |
| `GKOS-RETENTION-002` | Hold, indeterminate, unavailable, and policy error block disposition and route review. | `evaluateRetentionHold`, negative tests | No retention executor. |
| `GKOS-RETENTION-003` | Capability and CLI gates advertise and enforce no archive deletion. | `src/navigation/capabilities.ts`, CLI/architecture tests | Deletion remains future work. |
| `GKOS-REENTRY-001` | Every accepted re-entry plan creates a distinct Layer-1 source proposal. | `src/navigation/reentry.ts`, re-entry tests | Plan only. |
| `GKOS-REENTRY-002` | Predecessor identity/version/digest are context; standing is not inherited. | `planReentry`, negative tests | No automatic layer advancement. |
| `GKOS-REENTRY-003` | Semantic supersession appears only under an explicit declaration request. | `planReentry`, `evaluateSupersession`, negative tests | Edge direction remains an Engine mapping. |
| `GKOS-REENTRY-004` | Merge, predecessor mutation, inferred supersession, and predecessor disposition are rejected. | `src/navigation/reentry.ts`, negative tests | Later disposition is separately governed. |
| `GKOS-DELEGATION-001` | Supersession grants bind the exact subject/contract, operation, vault, and object class. | `src/navigation/delegation.ts`, scope tests | No general write authority. |
| `GKOS-DELEGATION-002` | Child grants cannot widen source authority scope or lifetime. | attenuation tests | Parent provenance remains explicit. |
| `GKOS-DELEGATION-003` | Not-before, expiry, and revocation are fail-closed. | delegation negative tests | Caller supplies explicit evaluation time. |
| `GKOS-DELEGATION-004` | Deterministic classification is routine, major, or indeterminate; only routine proceeds. | predicate tests | Deployment owns the predicate. |
| `GKOS-DELEGATION-005` | Checker type is escalation-only and cannot downgrade a restriction. | structural and behavior tests | Model output never grants authority. |
| `GKOS-DELEGATION-006` | Routine effects queue append-only review; overdue review freezes the affected grant. | `src/governance/deferred-review.ts`, delegation tests | Exception must be bounded and receipted. |

## Boundary

The standard owns requirement interpretation, release status, catalog results,
and conformance decisions. The Engine owns implementation behavior and testable
evidence only.
