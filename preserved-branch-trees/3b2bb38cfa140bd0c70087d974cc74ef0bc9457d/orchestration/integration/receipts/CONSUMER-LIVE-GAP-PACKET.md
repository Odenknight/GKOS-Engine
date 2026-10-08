# Consumer live gap packet

## Answer to Q-LIVE and request-to-render

The local integration proves stable renderer identity and adapter plumbing. It does **not** close Q-LIVE. No authorized observer was connected before an actual client request, no real Engine event was correlated to that request, and no production-like watch or canary was run. A rendered synthetic traversal is evidence of request-shaped data reaching the actual renderer, not evidence that a live request produced it.

| Required demonstration | Existing evidence | Missing live evidence |
| --- | --- | --- |
| Coherent | Engine and Observatory native tests exercise coherent authorized views; Observatory's native live-graph test rejects fixture substitution. Local browser fixtures render an internally coherent synthetic graph/event pair. | Fresh-session read from one explicit Engine generation/snapshot, with graph, traversal event and response all bound to the same authorized view and observed before/after identifiers recorded. |
| Stale/conflicting fail-closed | The corrected Engine candidate rejects the previously reproduced same-generation stale-reference and temporal-continuation counterexamples, including metadata-only source drift. Other unit fixtures reject malformed identity, resume-session drift, invalid metadata, denials and oversized responses. These are component tests, not an integrated live acceptance pass. | An isolated service built from the reviewed candidate must reject stale references and `AUTHORIZED_VIEW_CONFLICT` without rendering a success marker, retaining protected content, or silently switching snapshots. The repair is tested locally; correlated staging evidence is still absent. |
| Request-to-render | Kosmos actual Chromium desktop/mobile tests cover live, replay and buffered-live adapters. Observatory actual Chromium/WebGL receives two synthetic SSE events with equal labels/different IDs and maintains two heads. | One authorized non-production client call whose operation/session/sequence and stable agent identity are observed in the response/event stream, consumed by a viewer connected beforehand, and correlated to renderer diagnostics plus an operator-visible marker. |

## Required identity and correlation data

Every accepted traversal event must carry the current strict fields: `schema_version`, `session_id`, monotonically valid `sequence`, `operation_id`, opaque nonblank `agent_id`, display-only `agent_label`, `tool`, authorized relative `paths`, `status`, `cost_units`, and `offset_ms`. Renderer identity must use `agent_id`; labels never grant authority or merge explicit IDs. The live demonstration must additionally bind the initiating request to `operation_id` (or a separately specified immutable request correlation ID), the authorized view generation/snapshot, and the SSE event ID/resume position. If any binding is absent, duplicated inconsistently, stale, malformed, or conflicts with the fresh graph, the viewer must fail closed and must not show a successful traversal.

## Transport gates

Before a live claim, bound bytes **before accumulation** for SSE undecimited data, stdio lines and upstream response bodies. Add per-event/per-line/body limits, abort/cancel readers on violation, bound retry attempts and total elapsed retry time, preserve session/reset semantics, and test adversarial chunk boundaries. Current renderer bounds (25 retained steps, six displayed markers, 64 color keys, 640 desktop particles) limit rendered state but do not bound transport memory. A successful connection must not reset an unlimited retry budget into an endless loop.

## Preconditions

- isolated, non-production Engine and viewer builds pinned by exact commit/tree/artifact digests;
- synthetic notes only, with no production vault, live repair, write authority, or Marshal implementation;
- least-privilege read-only test credential delivered in an authorization header, held in memory, short expiry, revocable, never logged or placed in URLs/storage;
- named owner approval for the isolated canary, explicit stop/rollback commands, port/process ownership, and cleanup verification;
- monitoring for request/event correlation, authorization denials, view conflicts, reconnect/reset counts, dropped/oversized events, memory, frame/draw progression and disconnect cleanup, with identity values hashed or redacted in retained logs;
- success thresholds and a fixed observation window chosen before execution. Any stale/conflict acceptance, correlation gap, unexpected reconnect, bound breach, credential exposure, or protected-field appearance is a stop condition.

## Executable no-production plan

1. Build the exact local Engine and both consumer commits; verify recorded trees and seals. Start Engine on loopback with a newly created temporary synthetic corpus, ephemeral port, short-lived read-only token and bounded transport candidate enabled.
2. Start the Observatory/Kosmos local viewer first. Confirm an authenticated graph at generation `G`, empty traversal diagnostics, stable session ID and advancing frames. Capture only redacted counters and exact build coordinates.
3. Issue one deterministic read request as agent ID `agent-a` with display label `Analyst`; retain its operation ID. Require exactly one matching traversal event and one renderer identity. Repeat with `agent-b` and the same label; require two identities. Rename `agent-a`; require one unchanged identity with refreshed label.
4. Replay the retained bounded session offline and exercise buffered-live return. Require the same ID cardinality, sequence order and bounds, with no network request during replay.
5. In a second disposable instance, mutate/remove the synthetic source under the documented stale/conflict precondition. Submit the old reference/continuation. Expected result after Engine repair: explicit refusal, no success traversal event/marker, no source bytes retained, and a redacted negative receipt bound to `G` and the attempted operation.
6. Send oversized, undecimited and adversarially chunked SSE/stdio/body inputs through local fault fixtures. Require early cancellation, bounded memory, reader cleanup, bounded retries and a visible disconnected/error state.
7. Revoke the token, stop both processes, delete only the verified temporary subtree, confirm no listener or credential remains, and hash the redacted receipts. Do not proceed to production from this packet; production acceptance requires separate authority and canary approval.

The current branches can execute steps 2–4 with synthetic browser transport. Steps 1, 3 and 5 require the repaired, exact Engine integration and an approved isolated credential fixture. Step 6 requires the deferred transport-bounds implementation. Therefore the three-demonstration live gate remains open.
