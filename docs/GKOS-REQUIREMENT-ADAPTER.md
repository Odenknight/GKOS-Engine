# GKOS requirement adapter

**Status:** Informative, non-normative implementation mapping  
**Implementation:** GKOS-Engine post-1.2 unreleased development work  
**Standard target:** GKOS-2026-08-05 v0.77 accepted development target — **UNPUBLISHED**

This document maps permanent GKOS requirements to GKOS-Engine observations and
tests. It does not define, narrow, replace, or prove a GKOS requirement. The
authoritative allocations are in the standard's append-only
`requirements/REGISTRY.md`; the standard-owned mapping is
`conformance/adapters/gkos-engine.requirements.json`.

Engine-private `OKF-*` codes remain compatibility diagnostics. They are not
GKOS requirement identifiers, and their presence alone is not conformance
evidence.

## Mapping

| Permanent requirement | Engine or runner observation | Engine evidence | Coverage boundary |
| --- | --- | --- | --- |
| `GKOS-CONFORMANCE-001` | The standard runner reports declared but unexecuted pair/graph expectations as `UNEVALUATED`. No Engine diagnostic implements this rule. | External standard runner; no Engine source binding | Runner behavior, not an Engine claim |
| `GKOS-CONFORMANCE-002` | The standard runner emits an empty `profiles_claimed` list and exits non-zero for the non-qualifying catalog. | External standard runner; no Engine source binding | Catalog remains non-qualifying |
| `GKOS-CONFORMANCE-003` | Current fixture observations include `OKF-SCHEMA-004`, `OKF-EPISTEMIC-002`, `OKF-TEMPORAL-*`, `OKF-SENSITIVITY-001`, `OKF-RELATIONSHIP-001`, `OKF-LINEAGE-003`, and `OKF-EPISTEMIC-004`. | `src/okf23.ts`, `src/graph.ts`; standard-owned adapter map | Partial observation inventory; codes are not requirements |
| `GKOS-IDENTITY-001` | Newly generated note identities use lowercase UUIDv7. Missing identity emits `OKF-IDENTITY-001`. | `makeGkxUuidV7` and the default migration writer in `src/okf-migration.ts`; `test/okf-migration.test.mjs` | Implementation evidence only |
| `GKOS-IDENTITY-002` | Valid lowercase UUIDv4 remains accepted and is preserved. No diagnostic is required for valid input. | `VALID_AUTHORED_UID` in `src/okf-migration.ts`; `test/okf-migration.test.mjs` | Reader/writer compatibility evidence |
| `GKOS-IDENTITY-003` | Valid historical UUIDv4 and UUIDv7 values are retained rather than regenerated during conversion. | `migrationUid`, `proposedOkf`, and `proposedNativeOkf23`; `test/okf-migration.test.mjs` | Migration evidence only |
| `GKOS-IDENTITY-004` | UUID version or ordering is not consulted when deriving authority or lineage preference. | Identity validation plus branch tests in `test/lineage.test.mjs` | Policy has no dedicated Engine diagnostic |
| `GKOS-LINEAGE-001` | All valid direct-successor edges remain in the graph; multiple branches are not collapsed. | `src/lineage.ts`; branch-preservation assertions in `test/lineage.test.mjs` | Starter graph fixture remains `UNEVALUATED` |
| `GKOS-LINEAGE-002` | `invalid_at` uses the earliest direct-successor time that is not earlier than the predecessor. No successor is marked authoritative. | `src/temporal.ts`; valid/invalid successor tests in `test/lineage.test.mjs` | Not covered by the starter lineage fixture |
| `GKOS-LINEAGE-003` | No timestamp, UUID, lexical order, or tiebreak selects an authoritative successor. `OKF-LINEAGE-003` remains an unresolved-target diagnostic, not this requirement. | `src/lineage.ts`, `src/temporal.ts`, `test/lineage.test.mjs`; standard-owned adapter map | Starter graph expectation remains `UNEVALUATED` |

## Unresolved graph topics

The permanent registry deliberately leaves these topics open:

- canonical edge direction;
- duplicate handling;
- cycle treatment;
- resolver precedence;
- derived `HEAD`;
- temporal fallback order;
- inverse-relationship vocabulary; and
- serialization determinism.

Current Engine behavior for these topics is implementation evidence, not a
settled standard clause. It must not be presented as GKOS conformance.

## Compatibility boundary

The serialized projection field `conformanceClaim` remains unchanged for
compatibility. In Engine types and source it is explicitly scoped to the
Engine's reader/assessor capability; it is not a GKOS GCP claim or independent
qualification result.

