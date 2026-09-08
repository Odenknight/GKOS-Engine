# Source and release status

Checked September 8, 2026. This page separates implemented code from published
artifacts and enabled product features. For the functional inventory, see
[current capabilities](CURRENT_CAPABILITIES.md); for remaining work, see the
[roadmap](../ROADMAP.md).

| Surface | Verified status |
| --- | --- |
| Merged 2.2 source baseline | `f1a95f8f3933f834eb4030f0f0d143051e6eecc2`, merged through [PR #43](https://github.com/Odenknight/GKOS-Engine/pull/43) |
| Package source version | 2.2.0 development candidate; not a published 2.2 release |
| Newest remote Git version tag | `v2.1.2`, resolving to `7bf14b481e78c5ae9d1e14661602be4f24559d0e` |
| GitHub latest published release | [2.1.1](https://github.com/Odenknight/GKOS-Engine/releases/tag/v2.1.1) |
| Current source MCP tools | Ten credential-filtered read-only tools; no agent source-write endpoints |
| Managed MOC writes | Experimental, separately configured Node host; explicit ownership and authority required |
| Optional model assistance | Off by default; approved data access and reviewed proposals, not autonomous writing |

## Verification evidence

The merged source baseline passed [post-merge CI](https://github.com/Odenknight/GKOS-Engine/actions/runs/34022818430)
and [historical/current runtime qualification](https://github.com/Odenknight/GKOS-Engine/actions/runs/34022818434).
These results belong to that exact revision. They do not certify later commits,
a downstream Obsidian installation, physical power-loss safety, or a 24-hour soak.

The release branch adds separately versioned 2.2 retrieval observation and
durable no-op audit receipts. Native Linux/Windows focused audit checks and
packed consumer smoke checks have passed on candidate
`458a23f3771ae7b303cf03956727d0b0a7eed98a`; these do not qualify later commits.
Remaining qualification includes end-to-end latency and incremental parsing
measurements, the full 24-hour soak, comprehensive native durability evidence,
and exact Kosmos consumer integration. Track
[Engine #44](https://github.com/Odenknight/GKOS-Engine/issues/44).

## Choosing and publishing a version

Developers inspecting 2.2 should record an exact commit and treat it as
experimental source. Final downstream adoption requires an authorized immutable
release artifact, integrity evidence, and consumer compatibility checks. A
floating `main` dependency is not that evidence.

Existing tags and release notes describe historical snapshots and must not be
rewritten to advertise capabilities added later. Creating a `v*` tag triggers
this repository's sidecar release workflow; it is a publication action, not
merely a documentation label. No 2.2 tag or release is created by this update.

GitHub repository topics are discovery labels only. Neither topics, passing CI,
nor a version number grants write authority or establishes GKOS conformance.
