# Kosmos-Oden integration with GKOS-Engine and its services

**Prepared:** 2026-09-05  
**Audience:** Kosmos-Oden implementation team  
**Priority:** stability, reliability, fidelity  
**GKOS-Engine integration coordinate:** `d81f9d1351f1a9228650a840629191a92f2dfb22` (`origin/main`, Engine 2.1.2)  
**Kosmos-Oden starting coordinate:** `fbec1f9daeb4c3cc258ddec0d046adc2dac3483d` (`feature/kosmos-standalone-v0.85`, product 0.8.1)

## Objective

Make GKOS-Engine the single semantic engine and local-service runtime used by Kosmos-Oden. Preserve Kosmos as the browser, Obsidian, visualization, review, synchronization, and desktop product layer. Do not duplicate Engine algorithms or silently enable write authority.

The result must support the existing offline viewer while adding a qualified live connection to an actual Engine service. It must keep all source-note mutation disabled until the separate Navigation Effects host plane is complete and explicitly authorized.

## Current state

Kosmos currently pins an older Engine development commit:

```json
"gkos-engine": "github:Odenknight/GKOS-Engine#41172b91970aac869c161f4842e3526a62fd1fd9"
```

Kosmos also declares Node `>=22 <25`. Current Engine main declares:

```json
"node": ">=22 <23 || >=24 <25 || >=26 <27",
"npm": ">=10"
```

Engine Node 22 and 24 lanes are blocking. Node 26 is qualified as an informative pre-LTS lane. Kosmos's built browser artifact remains usable without Node; Node is required for development, testing, the CLI, the Obsidian desktop HTTP service, and the desktop Engine sidecar.

The Kosmos offline viewer and shared renderer are working. Browser, plugin-mock, visual, and Rust source tests have passed at the recorded Kosmos coordinate. Real Obsidian lifecycle, live unified Engine-service operation, packaged sidecars, installers, signing, notarization, and managed Navigation Effects writes have not been fully qualified.

## Ownership boundary

### GKOS-Engine owns

- Canonical GKX parsing, validation, assessment, projection, lineage, temporal behavior, and graph semantics.
- Graphiti projection semantics.
- Retrieval, verified citations, and derived indexes.
- Navigation discovery, audit, rendering, context, and re-entry planning.
- Versioned Navigation Effects plans, receipts, markers, grants, path policy, deterministic planning, Node executor, journal, archive integrity, leases, rollback, and recovery.
- Deterministic admission-policy evaluation and receipt replay.
- Watcher generations and crash recovery for Engine-owned derived state.
- Local-service authentication, authorization projection, REST/MCP/SSE contracts, credential separation, event sequencing, and bounded transport behavior.
- Portable contract fixes needed by every consumer.

### Kosmos-Oden owns

- The exact Engine dependency pin, lockfile, dependency allowlist, and pin-invariant checks.
- Browser directory access, folder-handle persistence, monitoring, source switching, and downloads.
- Three.js rendering, camera modes, filters, minimap, temporal presentation, tours, traversal animation, heatmap, and replay controls.
- Obsidian plugin lifecycle, vault events, settings, commands, views, note opening, and folder reveal.
- Product authorization, operator confirmation, adoption UI, proposal review, and credential UX.
- Obsidian and native Navigation Effects adapters, vault coordination, self-write suppression, and readiness reporting.
- Nextcloud synchronization and all provider credentials.
- Tauri process lifecycle, credential IPC, diagnostics, packaging, installers, signing, updates, and release evidence.

### Boundary rules

1. Do not copy Engine parser, graph, lineage, migration, enrichment, Graphiti, Navigation, policy, executor, or service logic into Kosmos.
2. Do not import repository-private Engine bundles such as `dist/service.mjs` or `dist/service-node.mjs`. There is intentionally no `gkos-engine/service` package export.
3. Launch and supervise the packaged Engine desktop-agent/service executable as a sidecar, or use an explicitly supplied compatible service binary during development.
4. Treat the Engine service and the Kosmos Obsidian Agent API as separate services. The Engine service normally uses loopback port 4814. The Obsidian API normally uses port 4816 and exposes a broader compatibility contract.
5. Never infer write authority from service health, package availability, an admission receipt, or a visible UI control.
6. Keep the browser-folder path source-content read-only.

## Engine package integration

Update `package.json` to the exact Engine main coordinate:

```json
"gkos-engine": "github:Odenknight/GKOS-Engine#d81f9d1351f1a9228650a840629191a92f2dfb22"
```

Then regenerate `package-lock.json` through a clean supported Node/npm environment. Update every exact-SHA assertion, lockfile check, dependency allowlist entry, build provenance field, and documentation coordinate that still names `41172b91970aac869c161f4842e3526a62fd1fd9`.

Use only documented public exports:

- `gkos-engine`
- `gkos-engine/adapter`
- `gkos-engine/gkx`
- `gkos-engine/graphiti`
- `gkos-engine/navigation`
- `gkos-engine/governance`
- `gkos-engine/retrieval`
- `gkos-engine/admission-policy`
- `gkos-engine/navigation-effects`
- `gkos-engine/navigation-effects/node` in Node/native code only

The browser and Obsidian renderer bundles must never include `gkos-engine/navigation-effects/node`, Node built-ins, watcher internals, service internals, or filesystem authority.

Align Kosmos's development policy to the current Engine expression when its own dependency graph passes those lanes:

```json
"node": ">=22 <23 || >=24 <25 || >=26 <27"
```

Keep Node 22 and 24 blocking. Keep Node 26 informative until it reaches the project's selected LTS policy. Do not broaden the range to unsupported odd releases.

## Engine service contract to integrate

The current Engine local-service protocol is `1.0.0-draft.1`, integration-only. It is loopback-only and bearer-authenticated. Kosmos must negotiate capabilities before enabling each live feature.

Supported routes are:

| Method | Route | Kosmos use |
|---|---|---|
| `GET` | `/` or `/health` | Process state and authorized visible counts |
| `GET` | `/capabilities` | Availability, configuration, authorization, and enablement per feature |
| `GET` | `/notes` | Authorized note summaries |
| `GET` | `/graph` | Authorized canonical graph projection |
| `GET` | `/graphiti/episodes` | Authorized Graphiti episodes |
| `GET` | `/events` | Authenticated traversal-event SSE |
| `GET`, `POST`, `DELETE` | `/mcp` | Draft.2 Streamable HTTP MCP lifecycle |
| `GET` | `/status` | Watcher-owned operational status |
| `POST` | `/control/shutdown` | Watcher-owned shared shutdown path |

All non-preflight requests require `Authorization: Bearer <credential>`. Do not place credentials in URLs, query parameters, logs, exported diagnostics, local-storage values, or renderer messages. Reject redirects. Restrict the endpoint to literal loopback. Use no-cache behavior for authenticated state.

The desktop agent creates separate viewer and MCP identities. The viewer credential can receive its authorized health, capabilities, notes, graph, Graphiti, and events view, but does not inherit `mcp.read`. The MCP credential must not inherit viewer REST or event access. Kosmos must preserve that separation.

The desktop shell should receive the credential through native IPC only after the sidecar is ready. Pass the secret directly to the privileged service client. Renderer-visible status may contain sanitized identity and credential-file metadata, but never token bytes.

## Capability negotiation and graph acceptance

Implement the connection sequence in this order:

1. Validate a literal loopback base URL and remove any query or fragment.
2. Receive the viewer credential through the authorized product path.
3. Fetch `/health` without following redirects.
4. Fetch `/capabilities` using the same credential.
5. Enable graph, Graphiti, notes, and events independently from their effective capability entries.
6. Fetch `/graph` and validate protocol version, schema, generation identity, and bounds before replacing the active graph.
7. Preserve the last valid graph if a refresh fails; show a truthful stale/disconnected state.
8. Start `/events` only when events are configured, enabled, and authorized.
9. On revocation or authorization failure, stop privileged activity, clear the in-memory credential, and require a new credential handoff.

A healthy process does not prove graph, events, MCP, Navigation, or Effects availability. Do not collapse these states into one `connected` boolean.

## Traversal events

Use authenticated fetch-compatible SSE so the authorization header can be sent. Preserve the Engine event envelope and stable agent identity; display labels are not identity keys.

For reconnection:

- Retain both the last accepted event ID and current `GKOS-Event-Session` value.
- Resume only with both values.
- Apply events in sequence and deduplicate already accepted IDs.
- Treat session changes, malformed sequence values, retention gaps, or explicit reset-required responses as a full refresh condition.
- Bound live buffering while replay is active.
- Never render hidden nodes, paths, edges, counts, prompts, note bodies, raw errors, credentials, or tokens from local client state.

Kosmos may retain its 5,000-event/2 MB recording limit and replay UI. Engine owns live event authorization and sequence semantics; Kosmos owns recording files and presentation.

## MCP integration

Engine Draft.2 accepts protocol version `2025-11-25` and exposes exactly seven read-only tools:

- `gkos_capabilities`
- `gkos_record_validate`
- `gkos_record_assess`
- `gkos_lineage_get`
- `gkos_graph_at_time`
- `gkos_navigation_discover`
- `gkos_navigation_audit`

Use the packaged `gkos-mcp-stdio` bridge when a client requires stdio. Configure it through `GKOS_MCP_TOKEN_FILE` and an optional literal-loopback `GKOS_MCP_URL`; never provide a raw token or URL credential.

Kosmos's existing 18-tool Obsidian API is a separate downstream compatibility interface. Do not claim that Engine implements those tools and do not proxy them into Engine without a new versioned, authorized-view contract. Maintain explicit names and UI labels so operators can tell which service they are configuring.

## Navigation Effects integration

The Engine package now provides experimental framework-neutral and Node filesystem surfaces. The current Engine REST service does not activate Effects and `/proposals` remains reserved without enabled behavior.

Kosmos may import `gkos-engine/navigation-effects` for types, validation, capability reporting, planning, and test adapters. Native Node code may delegate filesystem execution to `gkos-engine/navigation-effects/node`. Browser code must not import the Node surface.

Keep Effects disabled until all of these gates are independently true:

- Explicit operator enablement.
- Durable ownership adoption bound to exact bytes and digest.
- Current authenticated authority and valid grant.
- Policy acceptance for the exact plan.
- Available host adapter for every requested operation.
- Durable journal and archive location.
- Exclusive lease.
- Startup recovery and rollback path.
- Affected-scope reconciliation.
- Self-write suppression and external-change handling.
- Immutable plan, receipt, and decision evidence.

An Engine admission-policy receipt is evidence of deterministic evaluation. It is not operator approval, activation authority, or permission to modify notes.

Kosmos source currently includes adoption and coordination helpers, but its wired-capability inventory says the complete coordinator, executable adapters, durable adoption store, and integrated journal/recovery path are not product-wired. Preserve that truthful status until real entry points and end-to-end tests exist.

## Candidate improvements for Engine

Do not block initial service integration on these. Propose them upstream as separate Engine changes with portable contracts and adversarial tests:

1. A canonical Navigation Effects adoption record, preview digest binding, validation/replay rules, and storage interface. Kosmos keeps storage implementation and UI.
2. Deterministic event-debounce, affected-scope reconciliation, and self-write-suppression state machines after Kosmos proves them through a working coordinator.
3. A small versioned, DOM-free traversal recording envelope if more than one consumer needs interoperable recordings.

Do not upstream Three.js rendering, browser directory APIs, Obsidian lifecycle code, Nextcloud, Tauri UI, replay controls, model-key configuration, or product approval workflows.

## Required implementation sequence

### Phase 1: dependency and compatibility

1. Create a Kosmos integration branch from `fbec1f9daeb4c3cc258ddec0d046adc2dac3483d`.
2. Replace the Engine pin with `d81f9d1351f1a9228650a840629191a92f2dfb22`.
3. Regenerate the lockfile and update exact-pin/invariant checks.
4. Audit changed Engine exports and remove any duplicated or private imports.
5. Run a clean build and all existing unit, browser, visual, and Rust source tests.

### Phase 2: live service

1. Supply a real Engine desktop-agent binary outside the browser bundle.
2. Bind the exact sidecar platform, architecture, Engine SHA, filename, and checksum. Engine release assets use target-qualified names while the current Tauri discovery path expects `gkos-agent` or `gkos-agent.exe`; make the rename/copy explicit during packaging and reject mismatches.
3. Implement supervised launch, readiness, credential IPC, restart, shutdown, and sanitized diagnostics. Use authenticated `/control/shutdown` and wait for watcher drain/checkpoint before a bounded kill fallback; do not report a forced process termination as graceful shutdown.
4. Connect the standalone viewer to `/health`, `/capabilities`, `/graph`, and `/events` using a real viewer credential.
5. Test graph generation changes, reconnect, event resume, retention reset, revocation, process crash, and restart.
6. Keep offline folder and snapshot operation available when no service is present.

### Phase 3: Obsidian

1. Run the built plugin in a real disposable vault.
2. Verify startup, unload, view reopen, incremental vault changes, settings migration, Secret Storage, and credential rotation.
3. Clearly distinguish the Engine service from the Obsidian Agent API in settings and documentation. Replace Quick Connect examples that emit or persist a raw `KOSMOS_MCP_TOKEN`; generate token-file-based Engine MCP configuration where Engine is selected.
4. Exercise optional Nextcloud behavior separately; it must not affect Engine qualification.

### Phase 4: Navigation Effects

1. Complete host adapters and return unavailable for unsupported operations.
2. Add durable adoption, coordinator, reconciliation, lease, journal, archive, recovery, rollback, and audit UX.
3. Run crash, conflict, stale-plan, digest-mismatch, unauthorized, partial-operation, and external-edit tests.
4. Enable only after every readiness gate is visible and passing.

### Phase 5: desktop distribution

1. Build real sidecars for every target platform.
2. Qualify GUI launch, first-run corpus selection, permissions, sidecar upgrade, shutdown, crash recovery, and credential secrecy.
3. Produce checksums and provenance.
4. Complete installer, signing, notarization, update, and rollback evidence before changing the internal-alpha designation.

## Validation matrix

Run from a clean checkout with no retained ignored build artifacts.

| Gate | Windows Node 22 | Windows Node 24 | Windows Node 26 | Linux Node 22/24 | macOS Node 22/24 |
|---|---:|---:|---:|---:|---:|
| `npm ci` and pin invariant | Required | Required | Informative | Required | Required |
| Typecheck and production build | Required | Required | Informative | Required | Required |
| Unit/integration verification | Required | Required | Informative | Required | Required |
| Browser Chromium | Required | Required | Informative | Required | Required |
| Firefox/WebKit | Advisory or scheduled | Advisory or scheduled | Advisory | Advisory | Required for WebKit |
| Live Engine service E2E | Required | Required | Informative | Required | Required |
| Tauri/Rust tests | Required | Required | Informative | Required | Required |
| Packaged sidecar smoke test | Required | Required | Informative | Required | Required |

Also run:

- Browser offline folder import with zero HTTP requests and byte-identical source files.
- Redirect rejection and literal-loopback tests.
- Separate viewer/MCP credential authorization tests.
- Graph authorization and sensitivity redaction tests.
- Event order, resume, reset-required, overflow, revocation, and reconnect tests.
- Deterministic consecutive production builds with matching artifact hashes.
- Real Obsidian lifecycle tests in a disposable vault.
- `git diff --check`, lockfile integrity, artifact inventory, provenance, and secret scanning.

The current Engine line has passed its runtime workflow on Windows Node 22, 24, and 26. A broader CI observation still showed a Node 26 navigation-contract job hanging and one Windows Node 22 watcher observation failing without an artifact. Before using that matrix as release evidence, rerun the complete post-merge suite and require bounded timeouts plus artifact emission on every failure.

## Acceptance criteria

The Engine/Kosmos integration is complete only when:

- Kosmos installs the exact Engine SHA and every pin check reports the same coordinate.
- No private Engine module is imported or copied.
- Existing offline viewing remains functional without a running service.
- A real packaged Engine service starts under Kosmos supervision and reports readiness without exposing secrets.
- Capability negotiation controls each feature independently.
- Authorized graph and traversal data render correctly from a real committed Engine generation.
- Reconnect, resume, reset, revocation, crash, and restart behavior is deterministic and tested.
- Viewer and MCP credentials remain separated.
- The Engine and Obsidian services are clearly distinguished.
- Source-note writes remain impossible unless the full Effects readiness gate passes.
- Clean Windows, Linux, and macOS evidence exists for the claimed distribution targets.
- No product documentation claims unwired adoption, Effects, bundled service, installer, signing, update, or provider behavior.

## Deliverables expected from the Kosmos implementation

1. Integration branch and PR based on the stated Kosmos coordinate.
2. Updated package pin, lockfile, invariant tests, Node policy, and provenance.
3. Engine compatibility-change inventory covering every consumed export and protocol field.
4. Real-service E2E tests and redacted logs for health, capabilities, graph, events, credential rotation, revocation, crash, and restart.
5. Real Obsidian disposable-vault test report.
6. Platform qualification report for the actual packaged sidecars.
7. Updated capability inventory separating wired, integration-only, and deferred behavior.
8. A merge-readiness report listing exact commit IDs, workflow URLs, artifact hashes, known limitations, and rollback instructions.

## Stop conditions

Stop the integration and report the exact evidence if any of these occur:

- The Engine pin or installed package coordinate differs from the reviewed SHA.
- A browser or plugin bundle pulls in Node-only code.
- The client follows redirects or accepts a non-loopback service endpoint.
- Credentials appear in a URL, log, export, renderer payload, or committed file.
- A Quick Connect example embeds a raw bearer token instead of referring to its protected credential file.
- The desktop shell can silently launch an arbitrary `PATH` binary, wrong architecture, wrong version, or mismatched Engine SHA.
- Forced sidecar termination is recorded as graceful shutdown without proving checkpoint/drain completion.
- Graph or event content bypasses the credential-bound authorized view.
- Event resume continues across an unknown session or retention gap.
- Engine service health is used as proof of Effects/write authority.
- A source write can occur without adoption, current authority, policy, lease, journal, recovery, reconciliation, and explicit operator enablement.
- Tests depend on pre-existing ignored build output or silently skip a required platform path.

Record the failure, preserve sanitized diagnostics, keep the offline viewer available, and do not weaken the gate to obtain a passing build.
