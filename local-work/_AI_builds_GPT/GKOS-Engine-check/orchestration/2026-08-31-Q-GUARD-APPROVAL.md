# Owner decision: historical and current-runtime CI separation

Date: 2026-08-31.

Decision ID in the roadmap: Q-GUARD.

The owner answered "2. Yes." to: "May I preserve frozen historical CI and add a separately versioned current-runtime qualification gate?"

Status: approved design direction; CI implementation and qualification are not yet complete.

## Authorized direction

- Preserve the frozen historical contract/qualification lane and its exact bound source coordinates.
- Add a separately versioned current-runtime qualification gate, with explicit source identity, change inventory, required tests and genuine qualification receipts.
- Do not delete historical assertions, move historical tags or reset a frozen baseline to HEAD merely to make CI green.
- A passing historical replay is not proof that the current runtime passes; each lane records its own evidence and failures.

This decision does not select the final TypeScript oracle, settle the TypeScript-versus-Rust feature boundary, waive mandatory tests or authorize releases, production effects, cutover or TypeScript retirement.

The already published roadmap/evidence bundle at commit 553627924ef527650b59f49b767caaf404e0e2b2 remains immutable. This local addendum records the later owner decision; it has not yet been published or folded into a successor roadmap revision.
