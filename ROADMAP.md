# GKOS Engine roadmap

**Ecosystem role:** canonical deterministic, platform-neutral implementation of
GKX under GKOS. Normative meaning and exchange contracts are owned by
[gkos-standard](https://github.com/Odenknight/gkos-standard); downstream
products consume this engine rather than re-vendoring it.

GKOS Engine remains offline-capable. Intelligence features stay optional,
proposal-only, and subordinate to deterministic validation.

## Delivered through 2.1.2

- `gkos.intelligence.v1` request, response, and proposal contract.
- Deterministic validation of proposals and raise-only sensitivity enforcement.
- Optional Python/DSPy loopback service with honest readiness reporting.
- TypeScript, Python, npm, wheel, and SEA deployment checks.
- Windows and macOS SEA release workflow.
- Deterministic ingest and retrieval generations with verified citations.
- Watcher-owned coherent graph/retrieval generations and bounded recovery.
- Navigation 1.0 source-content-read-only discovery, audit, rendering, context,
  and re-entry planning.
- Credential-bound, read-only local REST, SSE, MCP, and stdio-bridge surfaces
  under integration-only draft contracts.
- Hash-bound admission-policy evaluation and replay receipts without approval,
  activation, or materialization authority.

## Current successor qualification

The review branch is `codex/repair-engine-hosted-ci-20260901`. Its implementation
evidence coordinate, `0dcd9e930d117d8edf316d081211f230cc52d24e`, binds watcher
qualification to the runtime-selected retrieval backend and keeps incomplete
platform coverage fail-closed. Later documentation commits require their own
exact-SHA checks. The branch is not merged, released, tagged, deployed, or
selected as the TypeScript oracle.

Local evidence covers Node 22, 23, and 24, including the real SQLite FTS path
on Node 22 and the declared compatibility scan on the tested Node 23 runtime.
The current overlay filesystem rejects the ownership changes required by nine
tests; the same failures reproduce against the unchanged parent. Qualification
therefore still requires:

- hosted Linux and Windows gates on Node 22 and Node 24;
- an ownership-capable POSIX lane for the affected service and watcher tests;
- reconciliation of exact-SHA current and historical receipts; and
- explicit oracle selection only after those gates close.

Node 23 remains informative and cannot substitute for either blocking Node
version.

## Next: 2.1.x hardening

- Build a reviewed adversarial and domain-diverse evaluation set.
- Add offline analyzer/provider comparison reports.
- Add TypeScript/Python contract interoperability fixtures.
- Add signed checksums and software bills of materials to releases.
- Publish traceability from implemented GKX contracts to tests and release
  interoperability evidence.
- Preserve zero-AI deterministic operation.

## Completed or partially completed through 2.1.2

- Reviewer-feedback and enrichment-plan structures are available for explicitly reviewed handling; automatic application is not provided.
- Candidate contradiction, evidence-gap, relationship, classification, and documentation proposals are supported through the v1 intelligence contract.
- Request-level task binding and fail-closed proposal validation are enforced.

## Later

- Offline DSPy optimization with explicit call and cost ceilings.
- Additional domain analyzers behind ordinary product actions.
- Cross-language interoperability fixtures and installed-service integration tests.
- Contract review when the active contract cannot evolve safely.

## Ecosystem gates

- Contract changes are proposed to `gkos-standard` before implementation.
- Engine releases precede coordinated KRS and Engine-Lite adoption.
- KRS-Lite receives no automatic upgrade; eligible fixes are selective backports.
- This engine is an implementation and does not independently confer GKOS
  conformance or satisfy the second-independent-implementation gate.

## Not planned

- Automatic authoritative writes or approvals.
- Bypassing schema, policy, or authorization.
- Automatic sensitivity lowering.
- Mandatory Python, DSPy, model, or network access.
- Product-specific UI or Obsidian behavior.
