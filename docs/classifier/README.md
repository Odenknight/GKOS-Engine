# Classifier module: TypeScript build handoff and discussion context

Date: 2026-09-21. Status: implementation plan and assessed proposal, not an
implemented feature, adopted Standard amendment or deployment grant.

## Read this package

- [Joint Rust/TypeScript build instructions](GKOS-Classifier-Rust-TypeScript-Build-Plan.md)
- [Disposition Sidecar upgrade assessment](GKOS-Disposition-Sidecar-Upgrade-Assessment.md)
- [Standard draft PR #56](https://github.com/Odenknight/gkos-standard/pull/56)
- [Pinned proposed contract](https://github.com/Odenknight/gkos-standard/blob/efa2f87a9774455f8dd717c302b0978d60990b5e/docs/v082/CLASSIFIER_DISPOSITION_CONTRACT_DRAFT.md)
- [Pinned owner questions and decision draft](https://github.com/Odenknight/gkos-standard/blob/efa2f87a9774455f8dd717c302b0978d60990b5e/decisions/proposals/Classifier_Assisted_Disposition_and_Reuse.md)
- [Pinned semantic fixture backlog](https://github.com/Odenknight/gkos-standard/blob/efa2f87a9774455f8dd717c302b0978d60990b5e/fixtures/provisional/classifier/README.md)

## Why this upgrade exists

The owner wants small classifier models alongside GKOS Engine to reduce repeated
LLM review, classify notes, maintain governed frontmatter and support accurate,
bounded dispositions through GKX. The largest efficiency gain is reusing an
assessment when its evidence and applicability remain valid, then calling a
qualified evaluator only when necessary.

The working name is Disposition Sidecar. It evaluates an authorized, versioned
snapshot and returns typed evidence/proposals. Deterministic Engine code checks
the envelope, model qualification, matrix and authority, then recomputes the
rule outcome. A permitted disposition and an admitted write are separate steps.
The inference worker has no direct note/graph write credentials.

## What the discussion established

| Concern | Design requirement |
| --- | --- |
| Preset authority | A human approves a bounded policy/grant, not every future note personally. |
| Per-note outcome | Record the actual evaluator, reviewer/decider, authorizer and executor with exact evidence. |
| Confidence | A score supplies evidence; it cannot create or expand authority. |
| Review | Preserve R18 role separation and mandatory escalation; reuse a still-applicable independent review. |
| Semantic edges | Claimed relationships do not automatically create effective supersession or accepted facts. |
| Protected information | Authorize processing first; low sensitivity scores do not authorize disclosure or lower restrictions. |
| Reuse | Bind tenant, purpose, evidence, task/options, relevant policy, qualification, restrictions and freshness. |
| Invalidation | Reassess affected dependencies; unrelated edits need not trigger another model call. |
| Patching | Preserve field ownership, compare-and-swap the exact revision, prevent loops and durably receipt changes. |
| Replay | Compare captured-input policy/record replay across engines; measure fresh-inference variability separately. |
| Compromised worker | Signatures do not prove honest scores; qualification, budgets, monitoring and suspension remain necessary. |
| Training feedback | Export attributable L1 snapshots without inherited standing; prevent train/evaluation leakage. |

## Repository-specific starting point

The implemented TypeScript baseline is `0a39e3420085c9e4e1f833ee905945b23eb15736`.
It already has a proposal-only Python/DSPy sidecar using `gkos.intelligence.v1`.
Preserve that contract. Generic tags and new disposition semantics need an
explicit new contract and adapter; they must not silently enter the v1 allowlist.
Start with build-plan §§2 and 6. Keep pure validation/matrix/reuse logic separate
from Node transport, stores and the separately admitted writer.

Keep core policy evaluation model-free. The outer adapter may invoke a worker.
Neither model installation nor a successful schema check activates disposition
or mutation authority. Frontmatter should hold compact references and managed
metadata; full evaluation, decision and effect evidence belongs in governed
records. Do not introduce a second authoritative disposition field.

## Standard amendment and unresolved choices

Standard PR #56 publishes ten files on branch
`work/classifier-disposition-contract-20260921`, commit `efa2f87a9774455f8dd717c302b0978d60990b5e`.
It supplies a proposed decision, candidate contract, initial schemas, schema
cases, and adoption work packet. Its schema uses the experimental contract
`org.oden.gkos.classifier.experimental.v1`; GKX itself remains 2.0.

The owner authorized preparing and publishing the Standard draft and adding
these Engine instructions. The following policy recommendations remain
**unresolved**, and publishing documentation does not answer them:

1. Cover managed tags and selected routine acceptance/rejection dispositions;
   defer effective semantic supersession from the initial capability.
2. Retain independent review, while allowing reuse of applicable prior review.
3. Hold affected operations and dependent effects when classification fails;
   allow unrelated authorized work to continue.

Do not allocate permanent Standard requirement/gate IDs from local CAD labels.
Do not treat illustrative probability thresholds or a named model/GPU placement
as a qualified production choice. The Standard draft's optional score encoding
is calibrated integer millionths; conversion and calibration are bound artifacts.

## Build sequence and completion evidence

1. Complete shared request/evaluation/matrix/applicability/patch bindings and
   compatibility rules against a pinned Standard candidate.
2. Implement pure schema and semantic validation plus deterministic matrix rules.
3. Replay shared positive/negative fixtures in both Engines with fixed time/IDs.
4. Add an authorized worker in a shadow lane; measure held-out task quality,
   abstention, truncation, injection resistance and request isolation.
5. Add dependency-indexed reuse and evidence of correct selective invalidation.
6. Integrate per-record review, then an admitted managed-tag writer on copies.
7. Activate only explicitly qualified scopes with grants, leases, budgets,
   current admission checks, durable receipts and a tested suspension route.

Business example: classify an invoice and propose bookkeeping tags; payment
remains a separate effect. Legal example: restrict and route a potential
privilege issue; classification does not authorize external disclosure.
Scientific example: classify an experiment note and assess required evidence;
a reported success does not establish actual experimental success.

## Evidence and limitations

The Standard candidate's author-run suite passed 141 tests, including 18 draft
schema tests. Those establish neither Engine parity nor model accuracy. Its
semantic fixture backlog is explicitly UNEVALUATED. This documentation handoff
does not modify implementation code, toolchain pins, dependency locks or active
runtime permissions. The original build commands were inspected, not executed
for this handoff. Future implementation must record actual pass/fail/unsupported
results and qualify each deployment separately.
