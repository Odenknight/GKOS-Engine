# GKOS-Engine current capabilities

Status date: 2026-08-27

This inventory describes the repository state incorporated by `main` merge
commit `77b5cacd0e01da99fbb4237eac8358f6303e0e74`. It separates implemented
product behavior from integration-only contracts, optional components, and
explicitly deferred authority.

## Capability matrix

| Capability | User or integration surface | Standing | Authority and effects boundary |
| --- | --- | --- | --- |
| GKX parsing and canonical projection | `gkos-engine`, `gkos-engine/gkx`, `gkx validate`, `gkx assess` | Implemented and packaged | Reads source records; diagnostics and projections do not approve or rewrite notes. |
| Lineage, temporal projection, and canonical graph | Library APIs and `gkx graph` | Implemented and packaged | Graphs are deterministic derived state; the named output file is the only graph-command write. |
| Graphiti projection | `gkos-engine/graphiti`, `gkx export graphiti` | Implemented and packaged | Projection only; GKX remains canonical. |
| Ingest validation and generation publication | `gkx index` and repository host integration | Implemented | May write governed derived state below `.gkx/`; never rewrites source notes. Strict mode blocks rejected publication; non-strict mode records exclusions. |
| Retrieval and verified citations | `gkos-engine/retrieval`, `gkx search` | Implemented | Public-only CLI policy, lexical baseline, optional trusted provider configuration, temporal `--as-of`, and citation verification against current source bytes. |
| Watcher host and crash recovery | Packaged desktop-agent host and repository-private modules | Implemented host runtime | Owns derived generations, journal/status state, and recovery. It is not a public package subpath or source-authoring authority. |
| Navigation 1.0 | `gkos-engine/navigation`, `gkx nav scan|audit|render|context` | Implemented and source-content read-only | Discovers and renders MOC candidates, audits, context, and re-entry plans. It cannot apply candidates to notes. |
| Authenticated local service | `gkos-desktop-agent`, loopback port 4814 | Implemented under an integration-only draft contract | Literal loopback binding, separate viewer/MCP credentials, authorized-view filtering before serialization, and operator-owned status/shutdown routes. |
| Traversal events | Authenticated `/events` SSE route | Implemented | Events are derived from the same credential-bound authorized view; hidden nodes, edges, paths, and counts are not serialized. |
| MCP read-only runtime | `/mcp` and packaged `gkos-mcp-stdio` bridge | Seven tools implemented for Draft.2 integration qualification | Credential-bound and read-only. Sixteen contract surfaces remain deferred. This is not a production conformance declaration. |
| Governance contracts | `gkos-engine/governance` | Implemented types and explicit store contracts | Receipts and append-only roles describe evidence and responsibility; they do not create an approval authority by themselves. |
| Admission-policy provider | `gkos-engine/admission-policy` | Implemented and packaged | Pure, deterministic, hash-bound request evaluation and replay verification. No I/O, approval, activation, or materialization authority. |
| Optional intelligence | `services/gkos-intelligence/` plus engine response validation | Optional | Produces proposal-only suggestions. A separate authorized review path is required; normal engine operation needs no model or network. |
| Scientific trace evaluation | `experimentalScience` namespace | Experimental and opt-in | Structural evaluation of a provisional research-trace draft; it does not execute research, decide truth, or grant authority. |
| Distribution and platform lanes | npm package, CLI commands, current CI on Node 22/24/26 | Implemented package/build lanes | Node 22 and 24 are blocking; Node 26 is informative until LTS. Frozen historical evidence retains its original coordinates. SEA configuration covers unsigned Windows x64 and macOS arm64/x64 pre-release binaries, not Linux SEA. |

## Explicitly absent or deferred

- Navigation Effects and any source-note mutation executor.
- Proposal ingress, agent approval routes, or source-write routes.
- Production conformance for the local-service and identity/MCP Draft.2
  contracts.
- The sixteen deferred identity/MCP surfaces beyond the seven qualified tools.
- A configurable remote bind, tunnel, or bearer-token-in-URL mode.
- Automatic sensitivity lowering, self-approval, or autonomous Decision-A
  authority.
- A Linux SEA release artifact.

## Public package subpaths

- `gkos-engine`
- `gkos-engine/adapter`
- `gkos-engine/gkx`
- `gkos-engine/graphiti`
- `gkos-engine/navigation`
- `gkos-engine/governance`
- `gkos-engine/retrieval`
- `gkos-engine/admission-policy`

The service, watcher, ingest-host, evaluation-host, and filesystem-authority
modules are deliberately not public package subpaths.

## Verification coordinate

PR #34 merged at `77b5cacd0e01da99fbb4237eac8358f6303e0e74` after the
Node 22/23/24 build, Linux/Windows watcher, retrieval-path-security, Draft.1,
Draft.2, typecheck, build, manifest, and protected-diff gates passed. The
automatic post-merge `main` run `33065334394` completed successfully.
