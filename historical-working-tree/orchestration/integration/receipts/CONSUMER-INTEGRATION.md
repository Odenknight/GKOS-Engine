# Consumer identity local integration receipt

Both corrected deliverable seals were applied to clean, isolated local worktrees. No push, merge, release, deployment, credential use, or production contact occurred.

| Repository | Honest base | Branch | Local result |
| --- | --- | --- | --- |
| Kosmos | `6486035dfc2e42173b1158b8007c9bab35aa7dc9` | `codex/integrate-kosmos-identity-20260831` | commit `52b843c50a9e810bf8ad7ac7de8e4505a44b6baa`, tree `2a3d9a777c7e3ef582c9e5d544acb04f92c2f5fc`, clean |
| Observatory | source coordinate `8da1d2239a9ce0af5570fe1bfa264934d8aabbe4`, unavailable as a local object; Git base `2a7b66fc6a33076fdcf29574cf2e31082c1b6e2a` plus five verified reconstruction blobs | `codex/integrate-observatory-identity-20260831` | reconstruction `07ffb58859c8e0622a746d88df9016d7b520c6d3`, identity commit `2c01d9ea1263db2e4d7f438c2955cbc481c69f6e`, tree `4e9530c9f71348f29763c4e22faafe3572ba8803`, clean |

Kosmos seal SHA-256 is `b52b9df81756d3876e90f3d46d24e8dc75df2c58aca63dc5ea145d7a195bbfee`; Observatory seal SHA-256 is `bd454ba7801dd95c16be0f9d53373aee805955a4f591fa74243244467890d508`. Forward apply and staged whitespace checks passed.

Kosmos `npm run verify` passed typecheck, build, 283 tests and all artifact/version/lock/invariant/provenance gates. The focused actual local browser run passed in Chromium and mobile Chromium, 2/2. Observatory build passed; native tests reported 39 total, 38 pass, zero fail, one explicit Windows Bash installer skip. Its local Chromium/WebGL fixture passed: two equal-label distinct IDs produced two renderer identities and bounded-state checks passed. That browser transport is synthetic SSE, not a deployed Engine.

Raw logs and their hashes are recorded in `consumer-identity-integration.json`. `rejected-seal/provisional-20260831.json` preserves the quarantined pre-test coordinates from the integration hold. The corrected worktrees do not descend from those provisional commits.
