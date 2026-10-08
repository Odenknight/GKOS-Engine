# Historical divergences — fixture catalog 0.1.0 vs gkos-engine v1.0.5

Found by executing this catalog against the reference implementation on
2026-07-22. Each is a fixture doing its job: the standard's expectation and the
implementation's behavior disagree, and the disagreement is recorded instead of
hidden. Disposition of each belongs to the engine repo (fix) or the standard
(relax), via the normal decision path — not to this file.

GKOS-Engine 1.2.0 now contains regression tests for all three cases. This file
preserves the discovery baseline; it is not a claim that the same divergences
remain present in current Engine code. Catalog 0.1.1 references these entries by
identifier only, so the narrative question has one home.

## DIV-001 — Naive wall-clock timestamps pass projection silently

`created_at: 2026-07-20 12:00:00` (no Z, no numeric offset) produces **no
diagnostic** from `buildOkf23Projection`. The engine's own test suite asserts
timestamp validation "rejects naive wall-clock" — that validation lives in the
stamper path (`timestamps.ts`), not the projection. The schema
(`okf-common.defs.json#timestamp`) rejects it; the projection should emit an
`OKF-TEMPORAL-*` diagnostic for parity. **Suggested disposition:** engine fix
(add projection-side temporal diagnostic).

## DIV-002 — Missing sensitivity defaults to `internal`, not a restricted value

`OKF-SENSITIVITY-001` fires correctly, but effective sensitivity resolves to
`internal`. The definitions sheet ("fail-closed sensitivity") documents the
default as `secret`; GKOS §11 requires failing closed "to a restricted
deployment default." `internal` is the second-most-open level of seven.
**Suggested disposition:** either engine fix (default to a restricted level) or
a documented deployment-profile parameter with a restrictive default — but the
current behavior contradicts the project's own written contract.

## DIV-003 — Invalid epistemic state flows into effective state as-authored

With `epistemic_state: gospel`, `OKF-EPISTEMIC-002` fires (error), but the
effective projection still reports `gospel` as the effective epistemic state.
Downstream consumers reading effective state without checking diagnostics see a
value outside the frozen twelve-state vocabulary. **Suggested disposition:**
project invalid states to a defaulted valid state (e.g. `unknown`) with
defaulted-marking, or document that effective state is only meaningful jointly
with diagnostics.
