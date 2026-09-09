# Consumer stable identity — isolated candidate, 2026-08-31

Status: implementation and local synthetic/browser checks PASS; root review pending. No merge, publication, production deployment, credential use, vault repair, Marshal implementation copy, authority activation, or all-platform qualification occurred. Stability > Reliability > Fidelity.

## Baselines and preservation

- Kosmos candidate: `orchestration/upgrades/kosmos`, cloned from audited `6486035dfc2e42173b1158b8007c9bab35aa7dc9`. Existing development Engine pin remains `41172b91970aac869c161f4842e3526a62fd1fd9`.
- Observatory candidate: `orchestration/upgrades/observatory`, copied from audited source contents corresponding to `8da1d2239a9ce0af5570fe1bfa264934d8aabbe4`. Its Git HEAD remains **2a7b66fc6a33076fdcf29574cf2e31082c1b6e2a**, not that later commit. The five reconstruction blobs below were independently rehashed unchanged. Those Git differences are baseline reconstruction, not new changes from this packet.
- Historical audit directories and published bundle are unchanged. Candidate dependency reuse uses a Kosmos `node_modules` junction; no install or dependency mutation was needed. Observatory's four originally vendored dependency input files are copied with their original SHA-256 verification, not upgraded.
- The actual renderer source was identical in current Kosmos and the older Observatory vendor: original SHA-256 `f451426c51cbe19653a58ac476f9f618fa324f591b81270f53636cf9a86cc4ca`. Both now contain the identical patched source, SHA-256 `838de450b4e1ae1004027c8e1afbbf99975d09129fbd3c0446b983369cb8d91a`.
- Observatory vendor upstream remains `50ebc3c168cf4e34137faf47e0b297b00db1a753`. Original bundle `c656bfe86a59c0bdc5f9c13b55d6fbda5a7f19cc2ef863880306b777dcb8b86c`; local candidate bundle `1773879574377fbda32a95612aba2783c54cf30955776fe94294043a9dadfbc9`. PROVENANCE explicitly says `renderer_core_modified: true`, preserves original input hashes/bundle and describes an uncommitted local patch. No new upstream commit is invented.

| Observatory reconstructed file | Verified Git blob |
| --- | --- |
| deploy/live/build-engine.sh | 04246380190aa5defea7aa5988db8bd7f46833af |
| deploy/live/patches/SHA256SUMS | ca383bdb5417ffc7177fe498a2083feef5384ef2 |
| deploy/live/patches/engine-content.patch | 9d4a394264d15ca219b4a8a2a59381d1fb3073b8 |
| deploy/live/patches/engine-param-errors-pr37.patch | 8e858fd943e7f570871efd5f3c7732e6a562aff4 |
| docs/INVALID-PARAMS-BUILD.md | 3889e0b350e8e390b0cd70d7b513889567c21511 |

[Exact changed-file before/after SHA-256 ledger](consumer-source-ledger.json) compares with audited source contents, rather than misclassifying Observatory's older Git metadata. The audit-only `tests/audit-marker-probe.mjs` remains a historical probe, not a passing identity regression.

## Repair and compatibility

`notifyAgentTraversal(paths, tool, agentLabel?, replay?, agentId?)` now uses an optional opaque stable ID for identity and keeps the label for text. Namespaced tuple keys prevent a legacy label from aliasing an explicit ID. A changed label on the same ID refreshes the head and displayed label without creating a second identity. All four Kosmos standalone live/replay/seek/buffer-return call sites pass `event.agent_id`; Observatory live-frame passes the delivered ID.

Existing Obsidian and label-only callers retain their grouping behavior. Observatory's synthetic receipt schema has `actor_role`, not stable agent identity; its static adapter intentionally remains a label-only caller. It does not manufacture IDs or change canonical receipts. The ID is a visualization key, never an authority grant.

Step retention remains 25, displayed marker pool six, particle pool 640 desktop/192 mobile. The previously unbounded deterministic color cache is capped at 64 with insertion-order eviction; colors recompute deterministically after eviction. Renderer diagnostics add counts, not raw identity exports. Same-coordinate agents can still visually overlap; separate identity does not imply spatial separation or unique RGB colors for every possible ID.

## Red/green and checks

Windows, Node 24.18.0; existing pinned dependencies. Browser skill was read; existing repository Playwright/Chromium fixtures used actual WebGL2 with SwiftShader, not a mocked renderer.

| Check | Result / scope |
| --- | --- |
| New correct assertion against original Observatory bundle | **RED**, exit 1: two archived events / two IDs / one label yielded one renderer hop; `1 !== 2`, frames 21, drawCalls 11. Tool-captured output, not a retained raw log. |
| Same mocked SSE fixture after rebuild | **GREEN**, exit 0: two heads/two agents, frames 23, drawCalls 12; authentic header-only synthetic credential flow, archive and disconnect checks retained. |
| Additional actual-renderer negative/regressions | PASS: stable-ID rename does not fork; replay equal labels separate; label-only compatibility; explicit-ID/legacy-label namespaces separate; 200 distinct IDs retain 25 steps/64 cached colors; clear removes all active identities. |
| Kosmos `npm run verify` | PASS: typecheck, build, 283/283 unit tests, version, lock, artifact, invariant and renderer provenance. [Retained output](consumer-kosmos-verify.txt). |
| Kosmos `npm run test:browser:chromium` | PASS: 20/20 Chromium + mobile Chromium standalone, embed and context-loss tests. Tool-captured output. |
| Kosmos `npx playwright test test/browser/consumer-identity.spec.ts --project=chromium` | PASS: actual standalone live, recorded replay, and buffered-live return adapters all retain two same-label IDs. Tool-captured output. |
| Observatory `npm run build` | PASS; [output](consumer-observatory-build.txt). |
| Observatory `npm test` | 39 total: 38 PASS, 0 FAIL, one explicit Windows Bash installer SKIP. [Output](consumer-observatory-unit.txt). No typecheck script exists. |
| Source whitespace check | Both candidate `git diff --check` PASS. |

The first Kosmos browser regression attempted an incomplete replay metadata fixture and failed; it was corrected to the existing closed session schema, then passed. An initial Observatory provenance test correctly failed its historical `renderer_core_modified=false` expectation; the current candidate test now explicitly requires the local patch, retained upstream coordinate/digest, equal input inventories, and only the renderer source hash changing. Historical tests were not rewritten in the audit copy. Windows sandbox esbuild ancestor reads failed; approved local-only escalation enabled the build. No network was needed.

![Synthetic Observatory flow](consumer-identity-observatory.png)

The screenshot is an actual synthetic browser capture, not a deployed Engine-to-viewer flight or a cross-GPU visual-baseline approval. It shows archived same-label identities; head-count assertions establish distinct renderer state. No four-minute live watch, actual MCP request-to-marker correlation, Firefox/WebKit, physical GPU/mobile, Obsidian host, or release soak is claimed.

Reproduce from the workspace root: run `node orchestration/upgrades/rebuild-consumer-vendor.mjs`; `npm run build --prefix orchestration/upgrades/observatory`; then in the Observatory candidate run `node tests/consumer-identity-browser.mjs ../../kosmos/node_modules/playwright`. In the Kosmos candidate run `npm run verify` and the browser commands above. The rebuild pins original dependency bytes and emits complete input hashes. Candidates are uncommitted and not release artifacts.

## Markdown review coverage and findings

Root clarified review method: deduplicate identical docs, screen every authored Markdown heading/status/decision clause, deeply read relevant current contracts, and distinguish those levels honestly. [Exact screened inventory and line evidence](consumer-markdown-screen.json) covers **130 files**, matching root intake: 40 Observatory and 90 product-audit files (including private Marshal documentation, screened for ownership boundaries only). Duplicates are marked by exact SHA-256. The initial `rg` inventory had 129, not 122; its sole omission was ignored generated `web/dist/vendor/THIRD-PARTY-NOTICES.md`, identical to included vendor notices. That missing file was explicitly included and screened. Dependencies/build caches are excluded from authored review except this root-ledger duplicate. Screening is not a claim of full line-by-line reading of all 130 files.

Detailed reads: both named audit reports; complete Fable r3 supplement; Q-SCOPE and Q-GUARD approvals; roadmap T12; Kosmos CONTRIBUTING, SECURITY, RENDERER-PROTOCOL, RENDERER-MIGRATION-r185; current TECHNICAL_README renderer/standalone/service/observability sections; Observatory CONTRACT, VIEWER, NAVIGATION-AND-TRAVERSALS and ENGINE-RELIABILITY. Other documents received the recorded heading/status/decision-clause screen and targeted relevant clauses.

Findings retained rather than silently repaired:

- Historical `keep render core unchanged` Observatory decision is superseded only for this explicitly requested local identity candidate; original imports and history remain recorded. Candidate VIEWER and LOCAL-PATCH addenda identify changed standing.
- Older Kosmos CONTRIBUTING references local `src/core/`; current architecture/source imports external Engine. Several older feature/renderer documents describe historical releases, not current qualification.
- Kosmos RENDERER-PROTOCOL describes 24 hops/30 seconds while actual source retains 25 steps/60 seconds. The added current interface paragraph states the actual cap; old prose should be reconciled in a separate documentation cleanup.
- Kosmos TECHNICAL_README says reconnect is bounded, but source bounds the delay, not total attempts, and resets attempts immediately on a successful connection. Do not infer Observatory's stronger retry/idle contract applies to Kosmos.
- Marshal docs distinguish strict MARSHAL-CBOR-1/EVD domains, private licensing, candidate contracts and non-appointed authority. Nothing was copied into the Kosmos runtime or used as GKOS Engine semantics.

## Remaining packet

Transport accumulation hardening is **not implemented here**. `src/standalone/api-feed.ts` still concatenates undecimited SSE into an unbounded buffer; `kosmos-mcp-stdio.mjs` still needs pre-accumulation line/upstream-body limits. Correcting those together requires cancellation, reader cleanup, timeout, retry-budget and chunk-boundary tests. This is the next stability/reliability packet, not hidden behind the identity pass. Full T12, G-TS, Effects runtime, durable adoption, Rust migration, production release and live acceptance remain incomplete.
