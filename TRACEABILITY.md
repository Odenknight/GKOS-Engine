# GKOS-Engine traceability

**Code line:** GKOS-Engine 1.3.0 release candidate

**Package metadata:** `1.3.0`; intended signed tag `v1.3.0`

**Standard target:** accepted GKOS v0.77 development target — **UNPUBLISHED**

This record connects the Engine implementation to the permanent requirement
registry without treating Engine behavior as normative. The detailed
non-normative mapping is in
[`docs/GKOS-REQUIREMENT-ADAPTER.md`](docs/GKOS-REQUIREMENT-ADAPTER.md).

## Authority chain

1. Owner-accepted R13 development decision.
2. Standard `requirements/REGISTRY.md`, which owns the permanent identifiers.
3. Standard `conformance/adapters/gkos-engine.requirements.json`, which owns the
   cross-project non-normative observation mapping.
4. This repository's source and tests, which provide implementation evidence.
5. Commit-scoped verification evidence recorded separately after execution.

## Implemented evidence surface

| Area | Permanent IDs represented only through the adapter | Implementation evidence |
| --- | --- | --- |
| Conformance reporting boundary | `GKOS-CONFORMANCE-001..003` | Standard runner behavior and adapter mapping; the Engine makes no qualifying profile claim |
| Identity | `GKOS-IDENTITY-001..004` | UUIDv7 generation, UUIDv4/v7 preservation, authored UID validation, target-identifier separation, and migration tests |
| Lineage | `GKOS-LINEAGE-001..003` | Branch-preserving normalization, temporally valid `invalid_at`, no-winner behavior, and lineage tests |

The trace is evidence of implemented behavior only. It is not independent
verification, a GCP profile result, publication of GKOS v0.77, or proof that
the 1.3.0 GitHub or npm release has been published.

## Open boundary

Canonical edge direction, duplicate handling, cycle treatment, resolver
precedence, derived `HEAD`, temporal fallback order, inverse vocabulary, and
serialization determinism remain unresolved standard topics. Existing code and
tests for them are not promoted to permanent requirements by this record.
