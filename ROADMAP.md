# GKOS Engine roadmap

**Ecosystem role:** canonical deterministic, platform-neutral implementation of
GKX under GKOS. Normative meaning and exchange contracts are owned by
[gkos-standard](https://github.com/Odenknight/gkos-standard); downstream
products consume this engine rather than re-vendoring it.

GKOS Engine remains offline-capable. Intelligence features stay optional,
proposal-only, and subordinate to deterministic validation.

## Delivered through 1.2

- `gkos.intelligence.v1` request, response, and proposal contract.
- Deterministic validation of proposals and raise-only sensitivity enforcement.
- Optional Python/DSPy loopback service with honest readiness reporting.
- TypeScript, Python, npm, wheel, and SEA deployment checks.
- Windows and macOS SEA release workflow.

## Next: 1.2.x hardening

- Build a reviewed adversarial and domain-diverse evaluation set.
- Add offline analyzer/provider comparison reports.
- Add TypeScript/Python contract compatibility fixtures.
- Add signed checksums and software bills of materials to releases.
- Publish traceability from implemented GKX contracts to tests and release
  compatibility evidence.
- Preserve zero-AI deterministic operation.

## Completed or partially completed in 1.2

- Reviewer-feedback and enrichment-plan structures are available for explicitly reviewed handling; automatic application is not provided.
- Candidate contradiction, evidence-gap, relationship, classification, and documentation proposals are supported through the v1 intelligence contract.
- Request-level task binding and fail-closed proposal validation are enforced.

## Later

- Offline DSPy optimization with explicit call and cost ceilings.
- Additional domain analyzers behind ordinary product actions.
- Cross-language compatibility fixtures and installed-service integration tests.
- Contract-v2 review only if v1 cannot evolve compatibly.

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
