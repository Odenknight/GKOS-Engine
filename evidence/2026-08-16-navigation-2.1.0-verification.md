# GKOS-Engine 2.1.0 Navigation verification

**Date:** 2026-08-16

**Authorized baseline:** `ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c`

**Release branch:** `agent/navigation-2.1.0-r4`

**Release target:** `v2.1.0`

**Engine Navigation contract:** `ENGINE-NAV-CONTRACT-1.0.0`
**Pinned GKOS Standard traceability commit:**
`f3a3a1695263f162d2660b0f7b37116bba7db12e`

This is Engine implementation and integration evidence. It is not a GKOS/GCP
qualification result, does not promote provisional SRTP fixtures, and does not
claim that the Engine defines GKOS Navigation conformance.

## Environment

| Component | Version |
| --- | --- |
| Operating system | Windows |
| Node.js | `v24.18.0` |
| npm | `11.16.0` |
| Python | `3.14.2` |
| pytest | `9.1.1` |
| Git | `2.55.0.windows.2` |

## Baseline evidence

The unmodified authorized baseline was verified before implementation:

| Gate | Baseline result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 198 passed, 1 skipped, 0 failed |
| `npm run pack:check` | PASS — 91 files, 284010 bytes |
| `npm run check:license` | PASS — Apache-2.0 metadata consistent |
| Python intelligence-sidecar tests | PASS — 4 passed |

## Final release gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — root, adapter, GKX, Graphiti, Navigation, Governance, desktop ESM/CJS, and declarations built |
| `npm run test:navigation` | PASS — 37 passed, 0 failed |
| `npm test` | PASS — 233 passed, 1 skipped, 0 failed |
| `npm run check:license` | PASS — Apache-2.0 metadata consistent |
| Python `pytest services/gkos-intelligence` | PASS — 4 passed |
| `npm run pack:check` | PASS — 148 files, 386471 bytes |
| `git diff --check` | PASS |

The one skipped test is the pre-existing optional mirror of the provisional
standard SRTP catalog when that separate checkout is unavailable to the test
process. It remains unevaluated and does not become an implied pass.

## Architecture and source-content read-only proof

`test/navigation-architecture.test.mjs` resolves every local import reachable
from `src/navigation/index.ts`. The gate fails if that graph reaches
`node:fs`, `node:fs/promises`, `node:child_process`, or a listed mutation call.
The same test constructs a synthetic transitive hidden writer and proves the
gate rejects it. The production Navigation graph passes.

`test/navigation-cli.test.mjs` records exact source-tree bytes before each
analysis command, reruns the tree comparison afterward, and verifies byte
identity. It also verifies rejection of `write`, `apply`, `delete`, `record`,
`archive-delete`, `rollback`, `moc-apply`, output-file flags, and Navigation
watch mode.

The capability test requires `apply_moc`, `source_content_write`,
`archive_delete`, `reentry_write`, and `rollback_execution` to remain false.
`reentry_record` remains false unless both a store and valid authority path are
explicitly active.

## Determinism evidence

| Property | Evidence |
| --- | --- |
| Enumeration independence | Reversed source enumeration produces identical discovery, classifications, candidate sets, audit findings, diffs, and context canonical bytes |
| Run-metadata separation | Different UUIDv7 run IDs and timestamps produce byte-identical candidates |
| Adversarial scan | Candidate bytes contain neither tested run ID nor tested run timestamp |
| Cryptographic binding | Candidate, config, snapshot, context, and governance ledger bindings use SHA-256 |
| Exact re-entry bytes | Re-entry digest equals SHA-256 of the exact UTF-8 incoming bytes, including CRLF |
| Stable ordering | NavigationCore uses locale-independent code-unit ordering and path normalization |
| Hidden input gate | Navigation source contains no wall clock, `Math.random`, random UUID, `localeCompare`, retrieval rank, or model-decision source |
| Runtime immutability | Candidate sets, nested candidate references, plans, findings, receipt roles, and governed records are recursively frozen |

## Required negative evidence

| Negative case | Result |
| --- | --- |
| Receipt unavailable or durability unavailable | No record, committed outcome, or durable binding is published |
| Duplicate operation/key replay | Exactly one governed effect; identical replay returns it, conflicting replay is rejected |
| Optimistic head/digest mismatch | Rejected before append |
| Noncanonical and normalization-anomalous MOC name | Flagged; never auto-fixed or silently recognized |
| Archive overreach | Only `_archive/moc-runs/**` is ignored; other archive content remains live |
| Missing/indeterminate discoverability | Denied before projection aggregation with no path/title/content/count/relationship leak |
| Context artifact relabeled Layer 6 | Audit/type boundary rejects the claim |
| Re-entry merge, predecessor mutation/disposition, or inherited standing | Rejected with no source proposal |
| Heuristic/model/rank/time/UUID/lexical supersession | No inference API; explicit declaration is required |
| Expired, revoked, wrong-subject, wrong-vault/class, widened, or non-lineage grant | Rejected |
| Missing/invalid predicate | Effective result is indeterminate and authorization fails |
| Deterministic major or indeterminate plus checker | Cannot become routine |
| Checker replacement-classification field | Structurally unavailable; runtime extra field fails closed |
| Overdue deferred review | Only the affected grant is frozen |
| Invalid review exception | Fails unless separate higher-precedence authority, bounded lifetime, receipt ID, and durability verification are bound |
| Hold/indeterminate/unavailable retention predicate | Disposition is blocked and human review is requested; no deletion executes |
| Unsupported capability advertised | Exact capability object test fails |

## Governance Store evidence

The included `InMemoryGovernanceStore` is append-only and test-only. It accepts
an embedded State-Change Receipt role, a unique idempotency key, and optional
expected head/digest. It publishes record, committed receipt outcome,
transaction binding, durability evidence, ledger version/head/digest, and
operation/idempotency ownership together.

The adapter reports `transactional` atomicity and
`in-memory-test-adapter` binding. `verifyBinding(operationId)` returns durable
only while the committed record and transaction binding are present. Receipt
or durability failure leaves the version, head, digest, and record population
unchanged. Production adapters must declare and test their own atomic,
transactional, or deterministic-compensation mechanism.

## Compatibility assessment

Existing root, adapter, GKX, Graphiti, desktop-agent, and proposal-only
intelligence surfaces remain available. Navigation is additive when disabled.
When enabled, replacing an eleven-name consumer heuristic with the canonical
five can be projection-observable and requires the consumer's normal
MINOR/BREAKING process.

## Limitations and deferred work

- NAV-001 remains informative/non-qualifying and NAV-002 is not implemented.
- The Walk Test is undefined and deliberately not fabricated.
- Source application, managed-region writes, archive deletion, locks/leases,
  stale-plan enforcement, rollback/compensation execution, retention
  disposition, and sync-concurrency mutation tests are deferred to 2.2 or later.
- The in-memory Governance Store is not durable across process termination and
  is not a production vault adapter.
- Current `supersedes`/`superseded_by` serialization remains disclosed Engine
  implementation behavior; R15 does not settle universal edge direction or
  inverse vocabulary.
- Kosmos-Oden/KRS and other consumer pin/integration changes remain work in
  their own repositories.

## Verdict

The finalized Engine tree satisfies the 2.1.0 source-content-read-only
Navigation/governance release gates. Engine contract standing remains
integration-only and separate from any GKOS conformance decision.
