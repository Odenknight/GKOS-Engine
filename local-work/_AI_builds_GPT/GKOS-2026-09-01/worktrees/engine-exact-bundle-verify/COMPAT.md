# GKOS-Engine compatibility

This file records package and consumer compatibility through Engine 2.1.2. See
[`VERSIONING.md`](VERSIONING.md) for release policy and
[`docs/VERSION-PROFILE-COMPATIBILITY.md`](docs/VERSION-PROFILE-COMPATIBILITY.md)
for the distinct package, GKX, projection, and experimental-profile coordinates.

## Release-line matrix

| From | To | Compatibility | Required consumer action |
| --- | --- | --- | --- |
| 1.2.x | 1.3.x | Additive Engine surface and governance documentation | Re-run validation and pin the chosen 1.3 release |
| 1.3.x | 2.0.0 | Breaking public namespace migration | Replace former names with `gkx_version`, `.gkx/`, `GKX-*`, `gkx`, and `Gkx*`; no legacy aliases are shipped |
| 2.0.0 | 2.0.1 | Runtime-compatible packaging correction | Update the exact pin; Python caches/bytecode are excluded from the package |
| 2.0.1 | 2.1.0 | Additive for existing GKX consumers; projection-observable when Navigation is enabled | Pin 2.1.0, inspect capabilities, run `ENGINE-NAV-CONTRACT-1.0.0`, and publish enabled effects |
| 2.1.0 | 2.1.1 | Contract-restoring archive-isolation correction | Update the exact pin; archived MOC-run notes can no longer enter current Navigation context |
| 2.1.1 | 2.1.2 | Fail-closed context projection and claim-scope correction | Update the exact pin; context rejects discoverable error/critical diagnostics and duplicate canonical identities |

This closes the earlier 1.2.0-to-2.0.1 documentation gap: 1.3 was additive,
2.0 was the explicit breaking namespace release, and 2.0.1 corrected package
contents without changing the 2.0 runtime contract.

## Navigation 2.1 compatibility

Existing root, adapter, GKX, Graphiti, desktop-agent, and intelligence-sidecar
surfaces remain available. Engine 2.1.0 adds `gkos-engine/navigation`,
`gkos-engine/governance`, declarations for both subpaths, and read-only
`gkx nav` commands. The package and intelligence sidecar versions are aligned
at 2.1.2.

Navigation contract 1.0.0 is source-content read-only. It does not include
candidate application, archive deletion, retention disposition, locks/leases,
stale-plan enforcement, rollback execution, or general writes. Consumers must
not translate a 2.1 candidate or plan into authority.

The built-in MOC-name set is exactly `index`, `_index`, `readme`, `moc`, and
`contents`. The former consumer heuristic names `home`, `map`, `overview`,
`dashboard`, `start`, and `toc` are flag-only. A consumer that replaces an
eleven-name heuristic when Navigation is enabled can produce an observably
different projection and must follow its own MINOR/BREAKING release rule.
Consumers that do not enable Navigation retain their prior behavior.

## Consumer obligations

A 2.1 consumer should publish:

- its exact Engine and Navigation contract versions;
- enabled Navigation capabilities;
- whether a Governance Store and valid authority path are active;
- that MOC apply/source write/archive delete are unavailable in 2.1 core;
- its Engine contract-suite result; and
- any separately established GKOS conformance status without merging the two.

Do not add Navigation polyfills to products pinned below 2.1. Update the Engine
pin and consume the Engine contract directly.

## Known downstream state

The 2.1.2 Engine package is complete independently of a product pilot. The
Kosmos-Oden/KRS pilot, exact pin update, replacement of its eleven-name
heuristic behind the Navigation feature flag, promotion UX, archive-ignore
helper adoption, and product release note remain downstream repository work.
