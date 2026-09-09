# Source and release status

Checked September 9, 2026. Current main implements Engine **2.2.0**. This source
version is distinct from the artifacts already published to npm and GitHub.

| Surface | Verified status |
| --- | --- |
| Implementation baseline | [`dee4a53ab8eade0e49c726d34cdc86f46e05c253`](https://github.com/Odenknight/GKOS-Engine/commit/dee4a53ab8eade0e49c726d34cdc86f46e05c253), incorporating PRs #48, #49 and #50 |
| Package, lockfile and runtime version | **2.2.0**, current source; not a published 2.2.0 artifact |
| Public npm latest | [gkos-engine 2.0.1](https://www.npmjs.com/package/gkos-engine/v/2.0.1) |
| Newest Git version tag | `v2.1.2`, resolving to `7bf14b481e78c5ae9d1e14661602be4f24559d0e` |
| GitHub latest published release | [2.1.1](https://github.com/Odenknight/GKOS-Engine/releases/tag/v2.1.1) |
| Managed MOC writes | Implemented experimental Node host; explicit ownership and authority required; durable no-change audit receipts implemented |
| MCP | Ten credential-filtered read-only tools; no agent source-write endpoints |

## Main verification

The exact baseline above passed:

- [CI](https://github.com/Odenknight/GKOS-Engine/actions/runs/34303985235).
- [Historical and current runtime qualification](https://github.com/Odenknight/GKOS-Engine/actions/runs/34303985155), including mandatory native Linux/Windows Node 22 and 24. Node 26 remains informational.
- [Engine 2.2 retrieval observation](https://github.com/Odenknight/GKOS-Engine/actions/runs/34303985108).
- [Managed-MOC native audit qualification](https://github.com/Odenknight/GKOS-Engine/actions/runs/34303985163).

These results bind that revision. Documentation updates and subsequent source
changes have their own checks; earlier results do not certify a new artifact,
consumer installation, physical power-loss safety or a completed 24-hour soak.

## Implemented and remaining

Main now includes the separate [2.2 observation lane](OBSERVATION-2.2-QUALIFICATION.md),
[durable no-change audits](MANAGED-MOC-NO-CHANGE-AUDIT.md), deterministic graph
convergence, bounded native retrieval reads, and the
[documentation verifier](DOCUMENTATION-DIGEST-VERIFIER.md). Historical 2.1.2
fixtures and replay remain separate. See [current capabilities](CURRENT_CAPABILITIES.md).

An official 2.2.0 release still requires the exact final candidate and tarball,
complete native durability/performance and consumer evidence, a full 24-hour
soak, exact Kosmos integration, and owner trusted-publisher/protected-environment
setup. [Issue #44](https://github.com/Odenknight/GKOS-Engine/issues/44) controls the
remaining inventory. The prepared OIDC workflow refuses incomplete approval or
mismatched source/artifact identity.

Developers using main should record an exact commit. Consumers selecting a
published package should use an immutable version and integrity pin. Existing
tags and releases remain historical; this documentation does not create or move
a tag, publish a package, grant write authority or establish GKOS conformance.
