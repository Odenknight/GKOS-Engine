# GKOS requirement adapter

**Implementation:** GKOS-Engine 2.0.0

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

## Boundary

The standard owns requirement interpretation, release status, catalog results,
and conformance decisions. The Engine owns implementation behavior and testable
evidence only.
