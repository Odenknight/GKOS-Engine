# Lite quick-connect truthfulness packet

Date: 2026-08-31  
Candidate: `orchestration/upgrades/lite`  
Disposition: isolated, uncommitted candidate for independent root verification; no remote write, merge, release, or deployment.

## Exact baseline and scope

The candidate is a no-hardlink local clone of audited Lite at `4027bfc4499ad0a2f3e753401f1320468e283823`. The selectively consulted draft reference is Lite #21 commit `ce8095515d2a1a7b23a10c01bd8f22e2dc5917e2`. Only its nine desktop help/snippet/shell/test paths were extracted; its #19/#20 stack, settings expansion, retrieval, evaluation, watcher, Rust-engine and packaging work were not imported.

Existing pins are unchanged:

- npm Full dependency: `e7cc0dd478af3d0bda216c5258dec5f77932def7`; Lite package `2.1.2`.
- native sidecar: Engine `v1.1.3`, local tag `4dcb06337264c021d4378310b39d940f099376ac`; Windows asset SHA-256 `29ab43c9ce79b8c14978594a18523a04e3f7518d87560f1e4c17744da08f12c2`.
- viewer `viewer-v0.6.9-rc1`; asset SHA-256 `11e004a5e500f5bb196ec321eefd0cd7f9dd332715edc4b1b71f286a10e768dd`.
- desktop package `0.2.0`; package manifests, lockfiles, workflows, `Cargo.toml`, and `Cargo.lock` have no candidate diff.

The review covered the audit's Lite #21 table entry and LITE-01 acceptance packet, Lite desktop quickstart and user guide, snippets/strings/main, Rust tray shell, settings schema and tests, phase-0 compatibility fixture, workflows/pins and the packaged sidecar's actual help/runtime. No existing Rust retrieval or contract implementation was edited.

## Repair

The prior desktop UI emitted MCP configuration and `/mcp` examples although the checksum-pinned sidecar is a GET-only bearer REST service. The candidate exposes exact `/health`, `/notes`, `/graph`, and `/graphiti/episodes` commands, uses `curl.exe` on Windows to avoid PowerShell alias ambiguity, and changes the tray action to copy the Agent API health command. Help now states that sensitivity is classification metadata rather than an access filter and that a bearer can read all indexed notes. It does not claim MCP support or built-in remote access.

The runtime regression launches the exact packaged binary on an ephemeral loopback port against a newly created synthetic temporary note directory. It proves unauthenticated `/health` is 401, authenticated GET `/mcp` is 404, POST `/mcp` is 405, and all four generated `curl.exe` commands execute and return the same JSON as direct authenticated GETs. The unlabeled note remains visible while the configured launch default is `secret`; its REST sensitivity projection is actually `null`, which the test preserves rather than inventing filled metadata. The test never reads a user vault and deletes only its own checked temporary subtree.

## Red / green evidence

- RED, historical snippets against the real binary: `node --test desktop/test/packaged-rest-runtime.test.mjs` failed because the advertised route returned 404 (`claudeCode advertises an unavailable packaged route`). Receipt: `orchestration/upgrades/reports/lite-runtime-red.txt`, SHA-256 `715fb61d81e984fd75b36cc5cccc6f247bbae829fd516e5e2ccdef28b41287b3`.
- GREEN: `npm test --prefix orchestration/upgrades/lite/desktop` — 17 passed, 0 failed. Receipt SHA-256 `a57c95d749881e117a6b5c81a71393c3d0f28e5b40a6aa795323cf1481c06738`.
- `npm run typecheck --prefix orchestration/upgrades/lite/desktop` — pass. Receipt SHA-256 `df364fcfb0d733c27a940501cef729f3a7804c8ae342622da51a7ff06c8dfa56`.
- `npm run build --prefix orchestration/upgrades/lite/desktop` — pass. Receipt SHA-256 `dcbff9f1146d06aa0145ac2064c4e6b0a8e56938f7715ba773f34ad0babffbda`.
- `cargo test --manifest-path orchestration/upgrades/lite/desktop/src-tauri/Cargo.toml --locked --offline` — 2 passed, 0 failed; unchanged checksum-pinned viewer resource and lockfile. Receipt SHA-256 `9129af5f0b786ce12acd1496f68ead71892adde18658c9176dc740b36ac2e8f1`.
- `git diff --check` — pass.

## Candidate file hashes

```text
14d6c8bf626994dc5404143e65f5e6ae7bd0e11f3436dad82ee3e71104696817  desktop/docs/QUICKSTART.md
bd5a9809ea3faaa355b0b5d4a7712b08e1a0c6ccaec360c9276ada47a6305c63  desktop/docs/USER-GUIDE.md
3551559a1d809c3eacd9b20cb2e798c850bb857ce244c22115e3a5e8dac1ce28  desktop/src-tauri/src/lib.rs
e1a0b84f01224242218179a981d764336f819fc2abf75305e9b789908dea6dcc  desktop/src/main.ts
64f0488fb102cf6e7b563f5d0f5201169620aa39578c35930d12cbe6e8141f49  desktop/src/snippets.ts
77f87994105a97bba46210f91df8bfff54fa3bb9755fcc53a1fe933e61baeafe  desktop/src/strings.ts
1d455e3d6242d2a3334f86886ce804091c5d37d58494123d44935d0128c1c2d7  desktop/test/phase0-compatibility.test.mjs
32ef36e4b72a84e88fefdaca422dccbff700196d39c0dde0b9a92eadd298aa88  desktop/test/settings.test.mjs
34d78311f080d7c648a2569816600a6ec4268b8428d5f11ebcec454dd0f27e76  desktop/test/snippets.test.mjs
f2dc7cf21896e1137db8167eae3ad1f19e01f70fab719a47ffb6bde9761ab9ba  desktop/test/packaged-rest-runtime.test.mjs
```

The downloaded binary and viewer are ignored compile/test inputs and remain byte-identical to workflow pins; they are not candidate source changes.

## Limits and deferred decisions

This packet makes no MCP endpoint, write capability, filtering, remote relay, or Rust authority. It does not reconcile the #19/#20 stack, upgrade any pin, or represent the draft #21 as merged or approved. A bearer remains sufficient to read every indexed note; sensitivity does not enforce access. The existing viewer connection query still transports its bearer in the window URL, a separate privacy/security packet. The runtime test is Windows-specific because the audited workflow pins a Windows executable; non-Windows runs explicitly skip it. The exact Engine source repository is a partial clone whose missing historical blobs attempted a network fetch and were unavailable in the restricted sandbox; the checksum-verified published executable and its live responses are therefore the primary sidecar evidence.

