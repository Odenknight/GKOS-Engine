# Source and release status

Checked September 14, 2026. Current main implements Engine **2.2.0**. This source
version is distinct from the artifacts already published to npm and GitHub.

| Surface | Verified status |
| --- | --- |
| Implementation baseline | [`91433b158b4b9bc30bd4d43b7dd8f61363647960`](https://github.com/Odenknight/GKOS-Engine/commit/91433b158b4b9bc30bd4d43b7dd8f61363647960), incorporating merged work through PR #71 |
| Package, lockfile and runtime version | **2.2.0**, current source; not a published 2.2.0 artifact |
| Public npm latest | [gkos-engine 2.0.1](https://www.npmjs.com/package/gkos-engine/v/2.0.1) |
| Newest Git version tag | `v2.1.2`, resolving to `7bf14b481e78c5ae9d1e14661602be4f24559d0e` |
| GitHub latest published release | [2.1.1](https://github.com/Odenknight/GKOS-Engine/releases/tag/v2.1.1) |
| Managed MOC writes | Implemented experimental Node host; explicit ownership and authority required; durable no-change audit receipts implemented |
| MCP | Ten credential-filtered read-only tools; no agent source-write endpoints |

## Main verification

The exact baseline above passed:

- [CI](https://github.com/Odenknight/GKOS-Engine/actions/runs/34755540462).
- [Historical and current runtime qualification](https://github.com/Odenknight/GKOS-Engine/actions/runs/34755540436), including mandatory native Linux/Windows Node 22 and 24. Node 26 remains informational.
- [Engine 2.2 retrieval observation](https://github.com/Odenknight/GKOS-Engine/actions/runs/34755540476).
- [Managed-MOC native audit qualification](https://github.com/Odenknight/GKOS-Engine/actions/runs/34755540429).

These results bind that revision. Documentation updates and subsequent source
changes have their own checks; earlier results do not certify a new artifact,
consumer installation, physical power-loss safety or a completed 24-hour soak.

## September 14 assessment

The September 11 red runtime finding is closed for the exact baseline above:
all required current Linux/Windows Node 22/24 jobs passed. Earlier failed
observations remain historical evidence. These results do not certify later
PR heads or this documentation successor.

The [2,000-note watcher measurement](WATCHER-GRAPH-COMPARISON.md) remains a
performance blocker: 12,648.90 ms against the unchanged 2,000 ms budget.
A full 24-hour qualification remains open. PRs #72–#75 contain separate
lineage, Graphiti binding, Effects host and standalone-native packaging work;
their candidate evidence is not evidence for main or a released artifact.
See the [PR disposition ledger](PR-DISPOSITION-20260914.md).

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
