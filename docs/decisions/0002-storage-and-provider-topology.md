# ADR-0002: Select a local derived-store default and provider-neutral adapters

Date: 2026-08-20

## Context

No owner-authorized external relational-search schema, vector-store collection,
provider endpoint contract, or production governance ledger is established by
the inspected Full repository. Inventing one would create an unverified
operational dependency. Full and Lite nevertheless need one shared retrieval
contract and a useful local-first path.

The current package has no runtime dependency and builds a Node SEA desktop
sidecar. On the Phase 0 host, Node 24.18.0 exposes SQLite 3.53.1 with FTS5
enabled. CI covers current Node 22, 23, and 24, but the retrieval implementation
must prove the same behavior on that matrix.

## Decision

The default derived retrieval store is a vault-isolated SQLite database beneath
the trusted state directory, normally .gkx/derived. SQLite FTS5 is the default
lexical implementation in Full and Lite.

Full's initial local vector-store adapter uses the same SQLite generation for
vector metadata and Float32 payloads, with deterministic exact similarity
calculation in the TypeScript reference ranking module. Lite's static Rust
adapter implements the same versioned storage and candidate contracts and must
pass the Full-owned conformance fixtures. This avoids making a native vector
extension or remote database mandatory. A later accelerated or remote adapter
may be added behind the same contract after its license, authority, lifecycle,
crash safety, CPU requirements, and packaging are verified. It must produce
conformance-equivalent candidate inputs for the reference fusion behavior.

Embedding and reranking use separate, config-selected provider contracts.
Supported adapter families are openai_compatible, local_onnx, and MCP. The
Engine contains no privileged provider and no vendor, model, or routing
allowlist. Provider configuration comes only from trusted operator
configuration and protected secret sources; an untrusted vault-local file
cannot select endpoints, credentials, executable/model paths, or authorization
policy.

Both products start and remain functional in FTS-only mode. Embedding-provider
startup or request failure sets an explicit degraded state and stable reason
code, and retrieval continues with the coherent lexical projection. Optional
reranker failure skips only reranking and preserves healthy lexical and vector
candidates. Neither case provisions a service or silently switches provider,
model, or embedding space. Provider/model/dimension changes create a distinct
vector projection and cache namespace.

The existing public `isGkxPrivateLanIpLiteral` helper is preserved for export
compatibility, but it is not a provider-routing policy. It must not be used to
reject a trusted operator's configured endpoint or domain. Bearer
authentication, request/resource bounds, trusted-configuration provenance, and
DiscoverabilityPolicy remain required because they protect the service and GKX
content rather than privilege an inference route. A future deprecation or
rename of the legacy helper requires its own additive compatibility treatment.

The reusable boundary is a Full-owned, versioned retrieval contract with a
TypeScript reference export planned as gkos-engine/retrieval. Full consumes that
export directly. Lite pins the exact contract and fixtures and implements them
in its separately governed Rust/static frontend-adapter. ADR-0005 supersedes
only a direct TypeScript runtime dependency for Lite; it does not supersede
Full's semantic ownership or parity requirements.

No production ledger adapter is selected. The existing
InMemoryGovernanceStore remains a test adapter and cannot substantiate durable
ledger anchoring.

## Alternatives rejected

- Presume an external Postgres or vector schema. No verified owner-authorized
  contract was found.
- Require vectors for basic search. That would make provider availability a
  prerequisite for local knowledge retrieval.
- Make a native vector extension mandatory. Its cross-platform and older-CPU
  behavior has not been qualified.
- Put provider selection in code-level allowlists. Provider and route choice is
  trusted configuration, while validation belongs in the adapter contract.
- Let Lite define retrieval behavior independently. The static Rust adapter may
  implement the pinned contract, but a conformance mismatch is BLOCKED rather
  than an accepted divergence.
- Store derived state beside arbitrary source paths or inside notes. Derived
  databases belong in designated state and never in source content.

## Consequences

- Phase 1 can implement and test FTS without external infrastructure.
- Exact local vector search favors portability and determinism over large-scale
  approximate-search performance; performance evidence may justify an additive
  adapter later.
- SQLite schema, WAL behavior, migrations, generation swaps, and SEA behavior
  must pass Node 22/23/24 and target-platform qualification.
- External adapters remain unavailable until their operators provide a verified
  contract and authority. GKOS-Engine does not provision them.
- Lite local ONNX remains opt-in and unqualified until packaging and CPU tests
  pass; its absence does not reduce FTS capability.

## Status

Accepted. SQLite/FTS is the selected default; optional provider and accelerated
store adapters are additive. ADR-0005 supersedes only Lite runtime consumption
of the TypeScript implementation, not this contract or its semantics.

## Evidence

- package.json and package-lock.json at the Full baseline contain no runtime
  database, MCP, vector, or model dependency.
- Node 24.18.0 Phase 0 probe reported SQLite 3.53.1, ENABLE_FTS5, and a successful
  in-memory FTS5 query.
- .github/workflows/ci.yml tests Node 22, 23, and 24.
- No verified external store, durable ledger, or provider contract was found in
  the inspected repository evidence.
- Phase 0 report:
  evidence/2026-08-20-functional-uplift-phase-0.md.
