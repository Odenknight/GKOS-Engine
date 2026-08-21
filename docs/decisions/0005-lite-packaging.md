# ADR-0005: Build Lite as a separately governed static Rust frontend-adapter

Date: 2026-08-20

## Context

GKOS-Engine-Lite is a JavaScript wrapper and Tauri presentation shell over a
pinned Full engine, not an independent Rust retrieval implementation. Full
already builds a Node SEA sidecar.

The inspected release workflows currently cover Windows x86_64 and macOS
arm64/x86_64 sidecars or Tauri bundles. They do not qualify Linux x86_64 or
Linux aarch64. Native vector/model assets, old x86_64 CPU behavior, clean-machine
installation, signing, and reproducibility are also not established.

Calling an archive “static” or “single executable” would be inaccurate when it
requires adjacent native libraries, runtime assets, or model files. The owner
subsequently made “Engine-Lite builds as one statically linked binary” an
explicit requirement, resolving the earlier architecture choice.

## Decision

Lite will use a separately governed Rust frontend-adapter to produce one
statically linked binary. The Rust program is an adapter to Full-owned,
versioned GKOS retrieval, citation, filtering, confidence, evaluation,
projection, and access contracts. It is never an independent GKX parser,
lineage resolver, governance authority, or schema authority.

The static binary may implement contract-required parsing and projection code
locally, but that implementation is derivative, pin-bound, and
conformance-gated. It cannot define divergent GKX fields, validity, lineage,
policy, or deterministic behavior.

This decision supersedes only ADR-0001 and ADR-0002 language that could require
Lite to import or execute Full's TypeScript runtime. Full's contracts,
TypeScript reference implementation, canonical fixtures, authority boundaries,
and exact parity requirements remain controlling.

Before the Rust implementation can be treated as conformant, a cross-language
contract and fixture suite must be ratified. For identical canonical inputs and
fixed provider outputs, it must prove exact or contract-defined equivalence for
deterministic GKX envelopes, chunk identities, ranking, temporal selection,
citations, policy outcomes, projection digests, and MCP result contracts. A
parity mismatch is BLOCKED, not a Lite divergence.

The existing Node SEA remains useful as Full's reference sidecar and development
surface, but it is not the selected Lite release artifact. No current Node SEA
archive is relabeled as static.

FTS-only is the mandatory static-binary baseline. local_onnx vectors are opt-in
and are not included or claimed until model licensing, binary embedding,
checksums, supported targets, startup behavior, CPU feature fallback, and
archive composition pass Phase 9. An optional capability that requires an
adjacent dynamic asset cannot be advertised as part of the one-binary artifact.
Provider routing remains neutral; packaging does not privilege a provider.

Required Phase 9 qualification remains:

- Linux x86_64 and aarch64;
- macOS arm64;
- Windows x86_64;
- clean-machine install and doctor/index/search/MCP/graph tests;
- Sandy Bridge/Ivy Bridge-class AVX execution without mandatory AVX2 or FMA;
- checksums and all notices in each bundle; and
- honest signed, unsigned, and notarized status.

“Statically linked” and “one binary” remain qualification claims, not facts
established by this ADR. Phase 9 must inspect the complete transitive link and
runtime asset set on every target and must fail rather than publish an archive
that needs an undisclosed adjacent library or model.

## Alternatives rejected

- Claim the current archive is a true-static binary. This is rejected because
  current evidence does not support the statement.
- Select Node SEA plus adjacent runtime/native/model assets as the Lite release
  format. That does not satisfy the owner's one-statically-linked-binary
  requirement.
- Port deterministic and retrieval semantics to Rust without a separately
  ratified contract and cross-language conformance program. That would create
  an uncontrolled second authority.
- Ship optional native/vector/model assets without target and CPU
  qualification. That risks missing libraries or illegal instructions.
- Treat existing macOS/Windows workflows as Linux evidence. No Linux release
  leg exists.

## Consequences

- Full remains the contract and reference-semantics owner. The Rust adapter adds
  a substantial conformance burden but does not gain authority to amend GKX.
- Lite cannot claim release parity until the cross-language suite passes for the
  exact Full contract pin.
- Linux and older-CPU support are explicit qualification work, not inferred
  claims.
- Any native vector, tokenizer, database, TLS, or model dependency must be
  evaluated for static-link feasibility, licensing, and CPU requirements.

## Status

Accepted. The owner's explicit one-statically-linked-binary requirement
ratifies the separately governed Rust/static frontend-adapter architecture.
This status accepts the architecture decision only. Linux targets, static-link
closure, optional local models, native acceleration, signing, reproducibility,
clean-machine behavior, and older-CPU claims remain unqualified until Phase 9
evidence exists.

## Evidence

- Full SEA sources:
  scripts/build.mjs, scripts/build-sea.mjs, scripts/sea-target.mjs, and
  .github/workflows/sidecar-release.yml at Full baseline
  2fbd4ec68ec825b09e5194c9878a7ae90a281392.
- Full sidecar workflow targets Windows x86_64 and macOS arm64/x86_64; its Linux
  helper path is explicitly not a shipped target.
- Lite desktop-build workflow evidence reports only macOS arm64/x86_64 and
  Windows x86_64 with dmg/nsis installers; Linux is absent and the current
  installer state is stale/unqualified.
- Owner ratification: “Engine-Lite builds as one statically linked binary.”
- Phase 0 report:
  evidence/2026-08-20-functional-uplift-phase-0.md.
