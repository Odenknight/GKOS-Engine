# Changelog

## 2.0.1

- Excluded generated Python bytecode and cache directories from the npm
  package after 2.0.0 exposed them during publication-time sidecar testing.
- No runtime or GKX contract changes from 2.0.0.

## 2.0.0

- **Breaking rebrand:** the schema and runtime surface use the GKX namespace.
  Documents use `gkx_version`; runtime state uses `.gkx/`; diagnostics use
  `GKX-*`; the command is `gkx`; and public schema APIs use `Gkx*` names.
- **Breaking package surface:** the canonical module is
  `dist/gkos-engine.mjs`. The removed historical module path, command, field,
  path, diagnostic, and API aliases are not supported in 2.0.0.
- Updated source paths, examples, CI smoke tests, build comments, traceability,
  verification evidence, and operational documentation to the GKX 2.0 contract.
- Retained the deterministic, platform-neutral architecture and the
  implementation-evidence boundary against the GKOS standard.

## 1.3.0

- Established the current GKOS-Engine product boundary and documented the
  downstream adapter, graph, projection, assessment, identity, and lineage
  evidence surfaces.

## 1.2.0

- Added complete relation projection for `refines`, `blocks`, and `documents`.
- Made the epistemic-state migration mapping conservative.
- Added optional intelligence contract test coverage.

## 1.1.x

- Added cross-architecture SEA build verification and deterministic optional
  intelligence proposal handling.
