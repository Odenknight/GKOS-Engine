# Owner decision: TypeScript-first scope through R4-10

Date: 2026-08-31.

Decision ID in the roadmap: Q-SCOPE.

Owner instruction: "R4-1 thru R4-10. Defer R4-11 and R4-12."

Context: the owner was asked which r4 capabilities, including new capabilities, must be completed in TypeScript before migration.

Status: scope approved; implementation and qualification remain incomplete.

## Binding scope

Complete the behavior, contracts and applicable acceptance evidence for R4-1 through R4-10 in the TypeScript product before authoritative Rust migration. This includes new capabilities in those phases, not only capabilities already present in TypeScript. Existing approved unfinished TypeScript commitments also remain in scope.

| Phase | TypeScript-first capability scope |
| --- | --- |
| R4-1 | Exact compatibility contracts, preserved identity/source fixtures, reproducible oracle and differential-test inputs |
| R4-2 | Core parse/validate/project/resolve/lineage/time behavior, canonical serialization and hashing, negative fixtures and Standard adapters |
| R4-3 | Deterministic chunking, lexical/vector retrieval, fusion/reranking/diversity, bounded expansion and manifest-bound recoverable index generations |
| R4-4 | Actual local ONNX, neutral HTTP embedding/reranking and outbound MCP adapters; explicit degradation and model/credential supply-chain controls |
| R4-5 | Exact citations, authoritative Full temporal/currentness confirmation, eligible context composition and canonical manifests, with Lite authority refusals |
| R4-6 | Governed GKX and ordinary-Markdown ingest, fail-closed admission, watching/reconciliation, crash recovery and diagnostics |
| R4-7 | Authenticated multi-agent stdio/Streamable HTTP services, scope/revocation/session identity, bounds, isolation and versioned public operations |
| R4-8 | Governed MOC and agent-note proposals/effects, ownership and grant checks, receipts, scoped writes, durability and recovery |
| R4-9 | Separate retrieval-quality/governance evaluation, reproducible regression gates and reviewed candidate-only tuning |
| R4-10 | Everyday Lite setup/search/navigation/proposal/recovery experience, safe defaults, explicit projection-only standing and Full resubmission guidance |

These entries summarize scope; they do not replace or reduce the detailed requirements in the published roadmap and preserved r4 source.

## Language and sequencing interpretation

- Rust-specific crate/workspace construction, Rust binary production and the Rust half of differential execution remain Rust tasks. The corresponding product behavior and applicable tests enter TypeScript scope now; a TypeScript implementation is not labeled a completed Rust port.
- R4-0 source/authority and architecture prerequisites remain required. Previously authorized safe Rust scaffolding, fixtures and non-authoritative shadow work may proceed in parallel without displacing TypeScript completion.
- After TypeScript qualification, carry its accepted behavior and evidence into the single Full-owned Rust implementation. Neither passing TypeScript tests nor publishing this decision completes the Rust phases.
- R4-10's standalone Rust executable requirement remains a Rust acceptance requirement; current TypeScript UX qualification cannot be represented as proof that such an executable exists.

## Deferred, not waived

- R4-11: final distribution/model-pack packaging and the full release hardware/artifact qualification program.
- R4-12: final downstream release integration, authority cutover and release closure.
- Deferral does not remove platform, provider, crash, concurrency, security or actual-client tests necessary to qualify R4-1 through R4-10. For example, model hash verification and model/runtime manifest requirements remain in R4-4; concurrent-client interoperability remains in R4-7; Lite product workflow testing remains in R4-10.
- Production effects, model/provider provisioning, release publication, Rust cutover and TypeScript retirement retain their separate authority gates. Feature implementation does not activate them by inference.

Q-GUARD was separately approved: preserve frozen historical CI and add a separately versioned current-runtime qualification gate. The final qualified TypeScript oracle, production host/authority profile and other affected implementation decisions remain to be resolved at their respective gates.

The original published bundle at commit 553627924ef527650b59f49b767caaf404e0e2b2 remains immutable. This local addendum records the later decision; it has not yet been published as a successor roadmap revision.
