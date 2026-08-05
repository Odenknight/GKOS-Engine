# GKOS-Engine traceability

**Code line:** GKOS-Engine 2.0.1

**Package metadata:** `2.0.1`; intended signed tag `v2.0.1`

**Standard target:** GKOS v0.77 authorized developmental publication;
non-consensus.

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
Runtime validation is completed only against the final 2.0.1 implementation
tree.
