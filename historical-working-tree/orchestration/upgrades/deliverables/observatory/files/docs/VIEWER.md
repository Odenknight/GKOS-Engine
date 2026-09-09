# Kosmos-Oden Observatory viewer

**Local candidate addendum (2026-08-31):** this candidate patches stable agent
identity separately from display labels. The upstream coordinate below remains
historical; the render core is now explicitly marked modified in PROVENANCE.json.
See `web/vendor/kosmos-oden/LOCAL-PATCH.md`. Historical untouched-renderer statements
below describe the original import, not this candidate's current source.

**Scope update:** the following renderer/replay evidence describes the static
exhibit. The separately added `/live.html` uses the same pinned render core with
authenticated native Engine projections; it does not turn canonical replay
fixtures into live events. See [LIVE-ENGINE.md](LIVE-ENGINE.md) and current
[deployment status](../DEPLOYMENT.md) for the administrator-only viewer token,
actual Engine service, and live browser checks. Historical statements below
that no live API is enabled are scoped to the initial replay release.

This is the actual Kosmos-Oden WebGL2 render core, not an invented replacement. Upstream repository: https://github.com/Odenknight/Kosmos-Oden at commit `50ebc3c168cf4e34137faf47e0b297b00db1a753`. Source was imported from the local checkout; only README/untracked upstream files were dirty, and none were used. `web/vendor/kosmos-oden/PROVENANCE.json` hashes the untouched renderer inputs and compiled ESM bundle. The inherited Three.js and GKOS Engine code runs only as bundled browser rendering dependencies; this does not constitute live Engine execution.

`web/adapter.mjs` projects already-public supplied records into the existing graph shape. Kind becomes a display folder/galaxy; links are a display projection of supplied relationships, not newly asserted GKX semantics. A fixed folder node labels the visual center Meridian Station. Cataloged protected records remain in the text catalog but are excluded from 3D nodes and all graph links. There is no hidden-object graph or fetch path.

Replay and scrub both call the same `clearTraversalObservability` / `notifyAgentTraversal` adapter. Event type, role, decision and reason remain the exact supplied fixture values in the accessible text timeline. The renderer does not adjudicate policy, confer authority, or synthesize event decisions. Effects are simulated. The initial deployment is static replay with unsigned integrity-only receipts; no SSE, private sessions, user prompts, tools, live Engine API or arbitrary URLs are enabled.

The renderer is hosted in `/frame.html` so its unmodified resize handler receives the actual remaining viewport size. That handler changes renderer dimensions and camera aspect/projection only. The shell never rebuilds the graph on sheet detent changes and never moves the orbit target then. A one-time initial framing uses native wheel input; later inspection/resize does not reframe. Pointer selection goes through the upstream context-menu pick path (which has no camera flight), then reads the public inspector path into the shell. Orbit gestures remain native. The catalog buttons provide an accessible equivalent without any camera control.

The sheet supports peek (15vh), half (50vh), full (85vh), a drag handle, keyboard Up/Down/Home/End, Escape and explicit close. Receipt downloads use the canonical API bundle; pasted verification is limited to 1 MiB and goes to the same-origin verifier. The UI distinguishes integrity from origin and truth. WebGL2 failure preserves scenario selection, complete timeline, catalog, and verification.

## Build and verify

`node scripts/build-web.mjs` requires Node only, verifies the pinned renderer bundle and copies local assets into `web/dist`. No CDN or network build dependency is used. `viewer-build.json` records hashes of shell/adapter assets and the renderer commit. All vendor source inputs and notices must remain checked in, including the nested `source/node_modules` files (these are provenance artifacts, not installed dependencies).

`node --test tests/viewer.test.mjs` checks protected projection exclusion, all six replay mappings, immutability, and every vendored input hash. The optional browser gate is `node tests/viewer-browser.mjs <absolute-path-to-playwright-package>`; it starts and stops its own loopback server. Chromium passes actual WebGL2 frame/draw checks, all six scenario choices, missing-authority reason, receipt verification, sheet detents and mobile width with no console/page errors. Captures are `web/viewer-desktop.png` and `web/viewer-mobile.png`. Firefox, Safari/WebKit, actual touch-device picking and an unfamiliar tester comprehension gate still need independent release testing.

`web/vendor/build-upstream.mjs <checkout>` is a maintainer-only vendor import utility using the upstream checkout's esbuild installation. Normal builds do not invoke it. Review and update its commit pin before deliberately importing another baseline. Project software is Apache-2.0; inherited software retains MIT/other upstream notices. See vendor LICENSE, THIRD-PARTY-NOTICES.md, dependency license copies and PROVENANCE.json. These licenses do not grant trademark, certification or endorsement rights.

## Security headers

All scripts and style sheets are local files. The upstream core sets CSS properties at runtime, but needs no inline script, eval, CDN, or remote connection. The top-level page denies framing. Only `/frame.html` permits same-origin ancestors, with `frame-src 'self'`. No source corpus, vendor source tree, source attachment, or filesystem route is served. The runtime serves only allowlisted built public files. Direct internet exposure and external 80/443 verification belong to the deployment gate, not this local viewer test.

## Separate authenticated live viewer

`/live.html` is a separate, opt-in live surface added after explicit authorization for actual Engine access. It does not reuse fixture data. It passes the actual Engine `/graph` GkxGraph directly to the unmodified renderer in `/live-frame.html`. The latter requires the same narrowly scoped frame-ancestors exception as `/frame.html`.

The operator must provide same-origin HTTPS reverse proxy routes `/engine/graph`, `/engine/notes`, and optionally `/engine/events` to the actual credential-gated Engine. The browser accepts no configurable remote address, URL credential, or storage credential. It sends a manually entered bearer token only in an Authorization header, disables redirects, omits cookies, and clears the input immediately. Disconnect aborts pending reads and SSE, clears displayed data, and reloads the renderer. Reload/back-forward restoration requires reconnecting. Non-loopback HTTP is rejected before credential transmission.

The inspected Engine service has no `/note` route or raw note-content MCP tool. Its `/notes` route returns authorized `{id,path,label,uid,type,sensitivity}` summaries only. Selecting or refetching a note makes a fresh `/notes` request and displays only that summary, accurately labeled. The viewer must not claim to read source bodies. Graph refresh is explicit; event watching is optional authenticated streaming fetch, bounded to 200 visible events and 64 KiB per pending event block. Responses are bounded to 8 MiB; graph and note counts are bounded. Engine events are shown with their actual `completed`, `failed`, or `denied` statuses, never translated into authorization facts. Disconnected/static service availability does not imply live Engine readiness.

`tests/viewer-live.test.mjs` covers semantic preservation, note-summary boundaries, denied/oversized responses, event parsing and credential transport constraints. The deployment owner separately verifies real Engine, agent and reverse-proxy operation; client tests alone do not establish that gate.
