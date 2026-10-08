# GKOS-Engine → gkos-standard reconciliation record v0.2

**Status:** Accepted reconciliation record; not itself a normative amendment
**Prepared:** 2026-08-05
**Standard release:** GKOS v0.77 authorized developmental publication —
non-consensus; published under signed tag `v0.77`
**Controlling corrected standard commit:** `6e6abaf300b9e05a36aff9d9e042d9fa0e963e59`
**Checkout statement:** this worktree is not represented as that commit; it
implements the owner-designated corrected content locally.
**Controlling decision:**
`decisions/R13_Conformance_Honesty_and_Alignment_Development_Decision_Record.md`

## Authority and source lineage

The standard defines requirements; the Engine supplies implementation evidence.
Engine-private `OKF-*` diagnostics are observations in a non-normative adapter
map, never the requirements themselves.

This v0.2 record supersedes the v0.1 reconciliation for current-facing
guidance. Its drafting source is
`C:\Users\FAC\Downloads\GKOS-ENGINE-TO-STANDARD-RECONCILIATION-v0.1.md`.
Scratch commit `f9ec96a9fca6e20905532297ab351c579df793ff` is inaccessible but
preserved as amended source lineage; it was **not pushed unchanged**. The
corrected v0.2 record and the requirement registry replace its current-facing
claims without erasing the source record.

R13-101 is the sole controlling R13 identity-and-lineage decision. R13-102 was
never allocated, is not reused, and does not renumber any record. The original
R13 proposal remains superseded history; the accepted R13 decision record is
primary.

## Accepted v0.77 development allocations

| Allocation | Controlling rule | Current evidence boundary |
| --- | --- | --- |
| `GKOS-CONFORMANCE-001..003` | Required unexecuted checks are `UNEVALUATED`; incomplete evidence blocks profile claims; fixtures cite GKOS IDs while diagnostics remain adapter observations. | Catalog 0.1.1 remains non-qualifying. |
| `GKOS-IDENTITY-001..004` | New authored GKX 2.3 IDs are lowercase UUIDv7; legacy lowercase UUIDv4 persists; migrations do not rewrite historical identity; UUID order creates no authority. | Authored-note schema split enforces the accepted reader/writer boundary. |
| `GKOS-LINEAGE-001..003` | Preserve valid direct-successor branches; only earliest temporally valid successor time may derive `invalid_at`; no ordering selects an authoritative winner. | The starter lineage fixture maps only `001` and `003`; `002` is not yet executed there. |

The authoritative text, status, source, and replacement mappings are in
[`../../requirements/REGISTRY.md`](../../requirements/REGISTRY.md). The
non-normative Engine observations are in
[`../../conformance/adapters/gkos-engine.requirements.json`](../../conformance/adapters/gkos-engine.requirements.json).

## Fixture and adapter disposition

Each fixture now cites permanent GKOS requirement IDs. Existing expectations
using `OKF-SCHEMA-004`, `OKF-EPISTEMIC-002`, `OKF-TEMPORAL-*`,
`OKF-SENSITIVITY-001`, `OKF-RELATIONSHIP-001`, `OKF-LINEAGE-003`, and
`OKF-EPISTEMIC-004` remain implementation observations. Their appearance does
not allocate a new requirement or prove a profile claim.

The runner truthfully reports unexecuted pair/graph expectations as
`UNEVALUATED`, emits no profile claim for catalog 0.1.1, and exits non-zero.
This is remediation evidence, not GCP qualification.

## Preserved open graph and temporal topics

The following are not settled by the allocations above and remain `OPEN`,
`CANDIDATE AMENDMENT`, `AMBIGUITY`, or `ENGINE DIVERGENCE` until a separate,
implementation-neutral decision is accepted:

- canonical edge direction and duplicate-declaration handling;
- cycle validity, effectiveness, and temporal consequences;
- UID/path/title resolver precedence and ambiguity behavior;
- derived `HEAD` eligibility, scope, and cycle behavior;
- temporal boundary, trusted-time, fallback, precision, and replay rules;
- inverse relationship vocabulary, cardinality, symmetry, and antisymmetry;
- canonical serialization, Unicode, sorting, line-ending, hashing, and volatile
  field rules.

In particular, no document may infer a resolver tiebreak, `HEAD` rule,
timestamp fallback hierarchy, canonical lineage direction, or universal cycle
treatment from current Engine behavior.

## Evidence limits and publication boundary

The historical released Engine 1.2 baseline is
`d73e86816df1b800dd9286459722f047266f1cc2` (173/173 reported). Mounted
post-1.2 development evidence is
`050740a029b599f01ce2df721880ea147f2b061b` (175/175 reported). A reported
180/180 run remains non-durable until its exact SHA and raw output are supplied.

Neither the Engine development metadata nor this reconciliation creates a tag,
push, or hosting-provider release object. GKOS v0.77 remains developmental and
non-consensus; the published v0.76 package remains immutable.
