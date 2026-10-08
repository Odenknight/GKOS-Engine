# Observatory and Fable evidence reconciliation

Date: 2026-08-31. Assessor: root orchestrator. Priority: Stability > Reliability > Fidelity.

This is source inspection and isolated synthetic verification, not a production deployment, live-vault audit, fresh Claude acceptance run, or authorization to repair source records.

## Source coordinates and method

- Observatory main: 8da1d2239a9ce0af5570fe1bfa264934d8aabbe4.
- PR #1 is merged, at 2026-08-31T17:09:12Z. Final head: 916ecc1c36fd687abaae145ba3c46364b75a96ac. Original assessment head: 2a7b66fc6a33076fdcf29574cf2e31082c1b6e2a.
- No open Observatory PRs were returned. The remaining fix/mcp-workload-scheduling branch is seven commits behind main with no unique commits. The settings-handoff branch is the merged PR head.
- The private repository was accessible through the GitHub connector. Direct sandbox clone lacked credentials. An isolated clone of the previously verified 2a7b66 source was used; the five files changed between that source and main were fetched at the exact main SHA and replaced only in that isolated clone. Each Git blob matched GitHub. This is verified source-content reconstruction, not a claim that the clone's Git HEAD is the new merge commit.
- The five verified blobs: build-engine.sh 04246380190aa5defea7aa5988db8bd7f46833af; SHA256SUMS ca383bdb5417ffc7177fe498a2083feef5384ef2; engine-content.patch 9d4a394264d15ca219b4a8a2a59381d1fb3073b8; engine-param-errors-pr37.patch 8e858fd943e7f570871efd5f3c7732e6a562aff4; INVALID-PARAMS-BUILD.md 3889e0b350e8e390b0cd70d7b513889567c21511.
- No applicable AGENTS.md was found. The existing dirty Observatory worktree was not changed.
- Fable's complete r3 supplement is preserved in [the source appendix](../sources/FABLE-OBSERVATORY-CLIENT-EVIDENCE-SUPPLEMENT-R3-2026-08-31.md). Original attachment SHA-256: 41888f09570331367efe4b445006c44f87de685741da9057d20a6f27befada3a. Preserved LF-normalized Markdown SHA-256: 87aac6524cba34058d4f59555c158e53101dc0138a524b630242e18be6850ccc. Text and evidence labels are retained; line endings/trailing newlines are normalized.

## Actual implemented behavior

The static server loads verified, startup-snapshotted public artifacts. The six public replays are synthetic build-time policy fixtures, explicitly unsigned and integrity-only; their engine_build_digest is null. They do not execute GKOS Engine and are not Engine conformance certificates. The receipt verifier correctly distinguishes integrity from origin, truth, and authorization.

The separate live client uses authenticated Engine routes, fixed-origin bearer headers, no URL/browser-storage credentials, bounded responses, a bounded in-memory event archive, and explicit connection/disconnection. The current watchAgentEvents implementation has bounded automatic reconnect, session-bound Last-Event-ID resume, deduplication, gap handling, stop/abort behavior, and idle limits. That implementation supersedes the supplement's earlier no-auto-reconnect observation for current source; deployed behavior was not rechecked.

The live viewer vendors Kosmos commit 50ebc3c168cf4e34137faf47e0b297b00db1a753 with a verified renderer bundle SHA-256 c656bfe86a59c0bdc5f9c13b55d6fbda5a7f19cc2ef863880306b777dcb8b86c. That is the unmerged v0.85 branch coordinate, not current Kosmos main. Provenance verification proves bytes, not compatibility with a later product release.

Deployment uses pinned Engine 0584a5d3e70384ef65e9069fbe1d6fd1d80cfc04 plus a checksum-pinned cumulative patch. Engine main now already incorporates PR #37. These are alternative representations: never apply the cumulative patch again on current Engine main. The installer verifies the source/patch/dist hashes, waits for one healthy service invocation and restores the previous environment on startup failure. Its initial unauthenticated health response is not a substitute for authenticated post-install smoke tests.

## Fable r3: what survives current-code verification

| Evidence or interpretation | Current disposition | Required follow-through |
| --- | --- | --- |
| Repeated search AUTHORIZED_VIEW_CONFLICT | Firsthand historical refusal, not successful search or proof of hidden/missing records | One approved coherent control, one conflicting control, safe explanation and next action; no identical deterministic retry loop |
| Six-page, 584-record traversal; source-byte pagination | Historical firsthand client success in generation B, not current release qualification | Preserve positive fixtures; targeted product tasks must not require a catalog sweep |
| Audit omitted stableId, creating false identity warnings and digest mismatch | Historical operator reproduction, now fixed in current Engine shared authorizedNavigationSnapshot; root's current 46-test run includes its regression | Never repair vault UIDs from the historical false warnings; re-audit only after qualified deployment |
| Standalone head:false | Expected semantics, not a record defect | Document resolved-lineage terminal semantics and direct-neighbor scope; no HEAD repair |
| Duplicate-UID/conflicting-content codes | Investigation leads, not permission for mechanical repair | Exact canary manifest, source evidence, owner identity decisions, reviewed dry run |
| Missing parameter hints, required-nullable fields, timestamp confusion | Current Engine has draft.3 invalid-parameter diagnostics and ten passing dedicated tests; no-fraction timestamps and not_yet_created are accepted in current tests | Preserve old successful bytes with the explicit capabilities exception; verify actual deployed client refresh |
| Star-chart bypass hypothesis | Withdrawn by Fable; shared event path and viewer authorization filtering are the correct model | Correlate one actual known request through append, delivery and rendering; do not infer bypass from fading pulses |
| No replay/reconnect | Historical deployed observation; current source includes bounded reconnect/resume | Real deployed four-minute watch, gap/replay/Stop/denial checks still required |
| About 90 seconds for a 584-record sweep | Client-observed page-cycle duration including bridge transit | Instrument queue/auth/snapshot/tool/serialization/event/viewer stages; no Engine bottleneck or Rust-speedup claim from this number |
| About 130k tokens / 5-8x savings / row-size target | Explicit estimates or requested budgets, not measured current performance | Measure uncompressed complete MCP payload and client transcript overhead separately |
| Existing validate/assess/audit tools are useful | Supported by actual source and current tests | Extend existing envelopes where safe; scores measure support/documentation quality, not relevance, truth, or project progress |
| Successful coherent control / fresh-context acceptance / visual correlation | Pending in Fable's seat; not supplied by the supplement | Operator-approved scope, genuinely fresh model context, authorized observer/client coordination |

The supplement's client calls, operator-supplied observations, and estimates remain separate. Root's synthetic tests do not convert any historical live report into a newly observed live result.

## New bounded rendering finding

Current Observatory live-frame passes agent_label, not agent_id, into the vendored renderer. The renderer groups previous heads by the label string. Root extended the existing mocked-transport browser fixture only in the isolated audit copy: two different agent IDs with the same display label emitted two archived events but produced one renderer hop. Observed: two distinct IDs, one label, rendererHops=1, frames=21, drawCalls=11. The fixture exited successfully because it asserts and documents the existing faulty identity behavior, not because identity fidelity passed.

The Kosmos agent independently confirmed the same code path on current Kosmos main. Required fix: a backward-compatible renderer event interface separating stable agent identity from display label, updated live/replay/Observatory adapters, and same-label/different-ID regressions. This is a visualization-fidelity issue, not an authorization bypass. It follows stability and reliability work.

The probe also demonstrates mocked SSE delivery reaching the real WebGL renderer. It does not prove actual deployed Engine-to-viewer transport or a human-observed ship. The checked-in browser test asserts event-list delivery, while viewer-live-integration connects and immediately stops the stream; neither correlates a real note_read request ID to a rendered marker.

## Verification performed by root

| Command/check | Result | Limit |
| --- | --- | --- |
| npm run build | PASS | Six synthetic static replays and digest-verified vendored web build |
| npm test | 39 total: 38 PASS, 0 FAIL, 1 SKIP | Linux-only installer skipped on Windows; no full Linux or production claim |
| Existing live-browser fixture plus isolated audit marker assertions | PASS; rendering path observed and same-label conflation reproduced | Mocked Engine transport, real headless Chromium/WebGL; no live credential used |
| Current Engine focused six-file suite | 46 PASS, 0 FAIL, 0 SKIP | Includes stable-ID/digest parity, parameter hints, temporal input, native FTS5 and policy tests; not full CI |
| Current Engine same-generation probes | Both gaps reproduced independently | Conditional host-mutation fixtures, not a demonstrated live incident or proof of a newly introduced regression |
| Deployment, real-vault repair, live coherent control, fresh Claude context, four-minute live watch | NOT RUN | Separate scope, credentials, operator coordination and approval required |

No Observatory workflow directory exists in the inspected source snapshot. A repeatable CI lane for the static/unit/browser/installer suites is therefore a concrete friction-reduction task; hosted qualification must not be inferred from local passes.

## Source anchors

- [Merged Observatory PR #1](https://github.com/Odenknight/GKOS-Observatory/pull/1)
- [Static server and its no-Engine boundary](https://github.com/Odenknight/GKOS-Observatory/blob/8da1d2239a9ce0af5570fe1bfa264934d8aabbe4/server/index.mjs)
- [Synthetic corpus producer](https://github.com/Odenknight/GKOS-Observatory/blob/8da1d2239a9ce0af5570fe1bfa264934d8aabbe4/scripts/build-corpus.mjs)
- [Current reconnect/resume implementation](https://github.com/Odenknight/GKOS-Observatory/blob/8da1d2239a9ce0af5570fe1bfa264934d8aabbe4/web/live-client.mjs)
- [Renderer adapter](https://github.com/Odenknight/GKOS-Observatory/blob/8da1d2239a9ce0af5570fe1bfa264934d8aabbe4/web/live-frame.mjs)
- [Existing mocked browser test](https://github.com/Odenknight/GKOS-Observatory/blob/8da1d2239a9ce0af5570fe1bfa264934d8aabbe4/tests/viewer-live-browser.mjs)
- [Existing deployed integration test](https://github.com/Odenknight/GKOS-Observatory/blob/8da1d2239a9ce0af5570fe1bfa264934d8aabbe4/tests/viewer-live-integration.mjs)
- [E07 operational acceptance contract](https://github.com/Odenknight/GKOS-Observatory/blob/8da1d2239a9ce0af5570fe1bfa264934d8aabbe4/docs/engine-builds/07-acceptance-and-release-gates.md)

## Recommended packets

1. Rebaseline deployment metadata after the two merges; preserve historical receipts and both alternative source/patch routes without stacking them.
2. Finish safe search-refusal explanations, compact/evidence/reference UX and reviewed repair planning using the already available tool surfaces.
3. Add request-to-render correlation hooks and controlled browser assertions; keep server timing separate from page-cycle timing.
4. Fix identity-to-render mapping in shared Kosmos first and update the pinned Observatory consumer with provenance and regression evidence.
5. Run coherent/conflicting controls, genuinely cold project discovery, honest unavailable-view acceptance, and the long-watch/Stop/reconnect matrix.
6. Add a single repeatable local/CI qualification entrypoint with explicit platform capability results. Only then propose separately reviewed staging promotion and rollback acceptance.
