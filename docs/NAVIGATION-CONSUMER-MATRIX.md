# Navigation consumer matrix

| Consumer | Supported 2.1 surface | Effect boundary |
| --- | --- | --- |
| Library consumers | `gkos-engine/navigation` discovery, candidates/manifest, diff, audit, context, invalidation, plans | Pure/in-memory; no source mutation |
| Governance hosts | `gkos-engine/governance` interfaces and test adapter | Append-only metadata only with durable receipt binding |
| CLI users | `gkx nav scan`, `audit`, `render --stdout`, `diff`, `context --stdout`, `reentry-plan`, `promotion-plan` | Reads source snapshots; stdout only |
| Future write executor | Not shipped | Reserved for 2.2 |
| Conformance runners | Integration manifest and implementation tests | `gkos_conformance: false`; no qualification |

## Product integration status

| Consumer | 2.1.1 status | Remaining work |
| --- | --- | --- |
| Existing Engine API users | Backward-compatible when Navigation is not enabled | Update exact pin and rerun existing tests |
| Kosmos-Oden / KRS | Engine capability is available; product repository is not changed by this release | Pin 2.1.1; route changes through Engine deltas; replace eleven-name heuristic only behind Navigation; add promotion UX and release note |
| GKOS-Engine-Lite and other consumers | No polyfill is supplied | Pin 2.1.1 directly before enabling Navigation |

Every enabling consumer must publish the exact Engine and contract versions,
capabilities, Governance Store configuration state, unavailable write effects,
Engine contract-suite result, and any separate GKOS conformance status.
