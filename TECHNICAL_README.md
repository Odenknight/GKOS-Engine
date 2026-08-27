# GKOS-Engine 2.1.2 technical guide

This guide describes the library, CLI, ingestion, retrieval, watcher, local
service, identity/MCP, Graphiti, Navigation, governance, and optional
intelligence surfaces present in GKOS-Engine `2.1.2` at this repository state.

The package version, exchange namespace, projection profile, and integration
contracts are distinct coordinates:

| Coordinate | Value | Standing |
| --- | --- | --- |
| Engine package | `2.1.2` | Current package identity |
| Public exchange namespace | GKX `2.0` | Breaking public naming generation |
| Validating projection identifier | `gkx-2.3-validating-projection` | Retained Engine projection identity |
| Navigation contract | `1.0.0` | Integration-only; source-content read-only |
| Local service protocol | `1.0.0-draft.1` | Integration-only |
| Agent identity/MCP contract | `1.0.0-draft.2` | Integration-qualified runtime; not production compatibility or conformance |
| Watcher recovery contract | `1.0.0-draft.1` | Repository-private host contract |

GKOS-Engine is downstream of `gkos-standard`. Engine behavior and repository
tests cannot amend the standard or independently establish GKOS conformance.

## Architecture and authority boundaries

```text
Markdown/GKX bytes
        |
        v
parse -> validate -> canonical projection -> lineage/time -> canonical graph
        |                                      |                |
        |                                      |                +-> Graphiti projection
        |                                      +-> Navigation 1.0 values/plans
        +-> accepted/rejected ingest projection -> retrieval generation
                                                   |
                                                   v
                                      coherent watcher ServiceGeneration
                                                   |
                                                   v
                                  credential-bound authorized local service
```

The main ownership rules are:

- the GKX core owns parsing, validation, assessment, canonicalization, lineage,
  temporal projection, and graph meaning;
- ingestion and retrieval own derived validation/index/search state, never a
  second interpretation of GKX;
- the watcher owns filesystem observation, coherent derived generations,
  durable host recovery, and service lifecycle;
- the local service owns authentication, authorization projection, REST/MCP/SSE
  transport, limits, and redaction;
- Navigation 1.0 owns deterministic discovery and plans, not source effects;
- governance interfaces can append explicitly governed metadata through a host
  adapter, but do not create source-write authority; and
- Graphiti, indexes, episodes, context packs, candidates, and traversal events
  are projections. GKX source records remain canonical.

Navigation Effects, managed-MOC execution, proposal ingress, approval
authority, and a production identity administration plane are absent from this
branch.

## Package and build topology

`package.json` exposes these supported library entry points:

| Package import | Runtime | Content |
| --- | --- | --- |
| `gkos-engine` | Platform-neutral ESM | Public core, graph, lineage, incremental index, migration/enrichment planning, intelligence validation, Navigation/governance re-exports, experimental science namespace |
| `gkos-engine/adapter` | Platform-neutral ESM | Immutable downstream adapter over public core functions |
| `gkos-engine/gkx` | Platform-neutral ESM | Focused GKX parsing/projection/index surface |
| `gkos-engine/graphiti` | Platform-neutral ESM | Graphiti adapter |
| `gkos-engine/navigation` | Platform-neutral ESM | Pure Navigation 1.0 |
| `gkos-engine/governance` | Platform-neutral ESM | Receipt roles, store interfaces, and deferred-review helpers |
| `gkos-engine/retrieval` | Node ESM | SQLite-backed retrieval reference implementation |

The package installs three commands:

- `gkx` — corpus validation, indexing, search, graph, Graphiti, Navigation, and
  repository evaluation commands;
- `gkos` — watcher status and preconditioned journal reset; and
- `gkos-mcp-stdio` — a bounded stdio-to-loopback MCP compatibility bridge.

The build also emits repository-private bundles for the local service host,
stdio bridge, retrieval host, retrieval evaluation host, ingest host/source
scanner, watcher contracts/host, and desktop agent. In particular,
`dist/service.mjs` and `dist/service-node.mjs` are built for integration, but no
`gkos-engine/service` package export is declared. Consumers must not import
unexported `dist` paths as a stable public API.

`npm run build` recreates `dist/`, bundles with esbuild, and emits TypeScript
declarations. The framework-neutral root and Navigation bundles do not acquire
Node filesystem authority through the host bundles.

## GKX core

The root library provides:

- bounded GKX frontmatter parsing and canonical JSON;
- authoring-form and machine-projection validation;
- fail-closed sensitivity and epistemic-state handling;
- deterministic documentation-quality assessment;
- canonical identity, relationship resolution, lineage receipts, and temporal
  state;
- `buildGraph()` and the incremental `GkxIndex`;
- timestamp validation and stamping helpers;
- migration and enrichment plan construction with digest verification;
- exclusion and loopback/private-network helpers; and
- an opt-in `experimentalScience` namespace.

Missing or invalid sensitivity resolves to `secret` and produces a diagnostic.
The seven-level order is `public`, `internal`, `restricted`, `confidential`,
`regulated`, `phi`, `secret`. A detector or deployment policy may raise an
effective classification but must not lower an authored one.

The parser boundary is the leading frontmatter block only. YAML-like examples
inside fenced code or body text do not become authority-bearing metadata.

For fixed inputs, canonical projections, graph ordering, assessment values,
diagnostic codes, and content digests are deterministic. Wall-clock values are
accepted only where they are explicit inputs or host evidence.

### Migration, enrichment, and intelligence proposals

`createGkxMigrationPlan()` and `createGkxEnrichmentApplyPlan()` bind source
digests, reviewed decisions, proposed updates, and verification material. They
produce plans; they are not an implicit filesystem writer. Blocked-review and
LLM-response validators accept only bounded, typed fields.

`validateIntelligenceResponse()` enforces the separate
`gkos.intelligence.v1` proposal contract. Proposal types cannot set approval or
effective authority, and sensitivity suggestions are raise-only. Applying an
accepted proposal remains a separate, authorized host workflow.

## Graph and Graphiti

`buildGraph()` parses files through the canonical projection, resolves links
and lineage, calculates temporal state, and produces stable node/link ordering.
`GkxIndex.applyChanges()` is the incremental update boundary and emits a
`GraphDelta` without introducing an alternate graph model.

The Graphiti adapter declares core version `0.29.0` and adapter schema
`gkx-graphiti/2.3.0`. It supplies deterministic UUIDs, bounded attributes and
content, extraction metrics, episode projection, and optional content
attachment. A Graphiti episode is derived state and never authority over its
GKX source.

Local-service Graphiti episodes are built only from nodes already admitted to
the credential's authorized view.

## Ingestion and derived storage

The provider-neutral ingestion boundary is documented in
[`docs/INGESTION-CONTRACT.md`](docs/INGESTION-CONTRACT.md). Provider connectors
remain separate packages; this repository does not ship Google Docs, Notion,
SharePoint, or Confluence connectors.

The Phase 3 host supports:

- one-pass corpus scanning with bounded path, UTF-8, size, and namespace rules;
- explicit profile selection;
- strict and non-strict validation/indexing;
- deterministic accepted and rejected source envelopes;
- content-addressed SQLite retrieval generations;
- an owner generation, immutable activation evidence, and one active pointer;
- no-replace publication and crash recovery; and
- separation of owner-plane validation/rejection evidence from search output.

Strict mode blocks activation on governed rejection. Non-strict mode can
activate the accepted subset with an exact rejection ledger. `.gkx/**` is
derived/operational state and is excluded from ordinary corpus projection.

The frozen `gkos-ingest-validation-1.0.0-draft.1` pack and its checked-in
fixtures define the host contract evidence. Passing those gates does not turn
derived storage into canonical knowledge.

## Retrieval

`gkos-engine/retrieval` provides chunking, typed filters, lexical/vector
fusion, MMR, confidence, configured provider identities, citation/provenance
verification, SQLite generation construction, and `RetrievalCoordinator`.

Authorization precedes scoring and serialization:

1. source and chunk policy gates determine the eligible ID set;
2. temporal projection is applied for a validated `as_of`, when supplied;
3. lexical and optional vector candidates are restricted to eligible IDs;
4. optional reranking and diversity operate on that restricted set;
5. live source bytes and citation spans are rechecked; and
6. bounded results are serialized with provenance.

Rejected or hidden source bytes do not reach embedding or reranking providers.
A provider failure may degrade to the governed lexical path; verified store,
pointer, or post-open corruption propagates as an operational failure rather
than becoming a fallback.

The `gkx search` command uses a named public-only policy. Trusted TOML can
select configured embedding and reranker providers, but caller-selected raw
provider paths are not public authority. The CLI can read either the active
ingest generation or the watcher's coherent generation; it does not create a
competing pointer writer when one of those authorities is active.

### Evaluation and tuning

`gkx retrieval eval` and `gkx retrieval tune` are repository host commands,
not wider package authority. They execute sealed offline fixtures through the
real coordinator. Provider transcripts are fixed and local. Evaluation creates
an unactivated temporary generation but publishes no persistent result. Tuning
can publish one new candidate TOML only through a guarded no-replace protocol;
it never overwrites an existing target.

Evaluation statuses are `pass`, `regression`, and `needs_human`. Tuning statuses
are `proposed`, `no_candidate`, and `needs_human`. Qualification observations
describe their exact host and fixture; they do not select a production backend
or make a performance claim for other machines.

## Watcher host and recovery

The repository-private watcher host maintains a single coherent
`ServiceGeneration` that binds:

- the accepted/rejected corpus topology;
- the canonical GKX snapshot;
- retrieval projection and active generation;
- canonical graph and Graphiti projection;
- journal transitions and coherent manifest; and
- a service generation ID and outer pointer.

Filesystem notifications are hints. The coordinator coalesces scoped changes,
escalates unsafe/overflow delivery to a secure full reconciliation, and performs
periodic two-snapshot verification. A request captures one committed
generation, so graph, sources, retrieval, and service results do not mix data
from different watcher states.

Fatal UTF-8, alias, link, traversal, namespace, or time-of-check/time-of-use
instability leaves the previous generation active. A deterministic source
rejection may publish the coherent accepted `N-1` topology and its rejection
ledger. Failed batches are durable and retry with bounded, jitter-free backoff.

The journal and pointer protocols use owner-private directory capabilities,
immutable evidence, exact before/current coordinates, SQLite transaction
authority, no-replace publication, and finite recovery classification. Journal
reset is a stopped-service, expected-digest operation that archives the old
generation rather than deleting it.

The watcher writes derived `.gkx` state plus caller-selected status and
credential files. It does not edit source notes. Shutdown stops new work,
persists recoverable state, checkpoints, closes streams and services, removes
only its owned locator, and releases its host lock last.

See [`docs/phase5-watcher-host.md`](docs/phase5-watcher-host.md) for the storage
coordinates and recovery protocol.

## Local service

The desktop agent builds one service snapshot from the watcher's committed
generation. The framework-neutral service contract/view layer is separated from
the Node HTTP transport. The default address is `127.0.0.1:4814`, and `--host`
is rejected.

### Routes

| Method | Route | Function |
| --- | --- | --- |
| `GET` | `/` or `/health` | Process state and authorized visible counts |
| `GET` | `/capabilities` | Per-feature availability, configuration, authorization, and enablement |
| `GET` | `/notes` | Authorized note summaries |
| `GET` | `/graph` | Authorized canonical graph projection |
| `GET` | `/graphiti/episodes` | Authorized Graphiti episodes |
| `GET` | `/events` | Authenticated traversal-event SSE stream |
| `GET`, `POST`, `DELETE` | `/mcp` | Integration-only Streamable HTTP MCP lifecycle |
| `GET` | `/status` | Watcher-owned operational status |
| `POST` | `/control/shutdown` | Watcher-owned shared shutdown path |

`/proposals` is reserved in the draft service contract but has no enabled
runtime route. Capability reporting leaves proposal ingress disabled. There is
no source-write, decision, approval, or Navigation Effects route.

All non-preflight requests require a bearer credential in the
`Authorization` header. Query parameters are rejected on service routes, so a
token cannot be supplied in a URL. Missing, malformed, wrong, or revoked
credentials receive generic denials without a partial payload.

### Credential separation

The default desktop profile persists three owner-private leaves beside the
status file:

```text
desktop-agent.token
desktop-agent.mcp.token
desktop-agent.mcp.identity.json
```

The viewer credential has health, capability, note, graph, Graphiti, and event
read capabilities. It does not have `mcp.read`. The default MCP identity has
only `mcp.read`, a stable persisted UUIDv7 agent ID, label `Local MCP Agent`, an
`internal` sensitivity ceiling, revocation state, and its own limits. It cannot
reuse viewer authority to read REST projections or events.

The status document and startup line expose only credential and identity paths,
never token bytes. Existing credential leaves are reopened with identity,
ownership, mode, size, containment, and no-link checks. Corrupt, aliased, or
externally substituted credentials fail closed rather than being overwritten.

Default per-credential transport limits are four concurrent requests, a ten
token bucket, and one-token-per-second refill. Configured limits are bounded by
the registry. Duplicate tokens, duplicate credential IDs, and malformed secret
material are rejected at registry construction.

### One authorized view

`buildAuthorizedView()` is the serialization boundary for REST, MCP, and event
delivery. It binds:

- credential ID, agent ID, capabilities, revocation, and sensitivity ceiling;
- an explicit operation;
- one immutable corpus generation and stable evaluation time; and
- configured authorization generation and policy digest.

It removes notes above the ceiling before constructing output, removes folders
without visible descendants, removes edges with a hidden endpoint, recomputes
lineage/temporal values and visible counts, builds Graphiti only from visible
nodes, omits attachments, and exposes only closed diagnostic/assessment names.
Graph-carried `sourcePath` is not trusted. Invalid paths, identifiers,
sensitivity, policy coordinates, timestamps, diagnostics, or graph structure
fail the operation closed.

For a fixed committed generation and credential, repeated graph, episode, and
capability responses are byte-stable. Successful JSON responses are capped at
8 MiB; an oversized aggregate response fails instead of returning a partial
body.

### Capability reporting

`/capabilities` reports `available`, `configured`, `authorized`, `enabled`, and
stable `reason_codes` separately for graph, notes, Graphiti, MCP, events,
proposal ingress, Navigation, and Navigation Effects. Import or planner
availability never implies authority.

In the current desktop profile:

- graph, notes, and Graphiti are configured when a committed graph exists;
- MCP and events are configured behind the identity runtime;
- each feature's authorization is evaluated for the presented credential;
- Navigation requires the committed source snapshot and MCP authorization;
- proposal ingress is disabled; and
- Navigation Effects is unavailable because no planner or adapter is present.

### Browser boundary

The desktop allowlist is exact:

```text
tauri://localhost
https://tauri.localhost
http://tauri.localhost
null
```

`null` is the opaque origin sent by a viewer opened from `file://`. Other
origins receive no CORS grant. CORS does not replace bearer authentication.
Allowed request headers include authorization, content type, event resume, and
MCP session/protocol headers. Browser-readable response headers expose
`GKOS-Event-Session`, `Mcp-Session-Id`, and `MCP-Protocol-Version`.

## MCP Draft.2 runtime

The runtime accepts MCP protocol version `2025-11-25` and exposes exactly seven
read-only, non-destructive, idempotent, closed-world tools:

| Tool | Result |
| --- | --- |
| `gkos_capabilities` | Effective capabilities for the authenticated identity |
| `gkos_record_validate` | Bounded validation codes for an issued record reference |
| `gkos_record_assess` | Deterministic documentation-quality evidence, not truth authority |
| `gkos_lineage_get` | Authorized lineage summaries with bounded pagination |
| `gkos_graph_at_time` | Authorized temporal graph page within an issued scope |
| `gkos_navigation_discover` | Navigation discovery over the authorized source snapshot |
| `gkos_navigation_audit` | Navigation findings for an issued authorized scope |

Record, scope, and cursor references are opaque and session-bound. Pagination
is generation/snapshot-bound; a foreign, stale, or mismatched cursor fails.
Content-bearing operations use source bytes cloned into the same committed
`ServiceCorpusSnapshot` as the authorized view. They never reread a live note
after authorization.

The runtime caps request bodies at 393,216 bytes and result bodies at 1,048,576
bytes, uses a bounded request deadline, defaults to eight sessions per agent,
and expires idle sessions after 30 minutes. A completed traversal event is
appended only after the corresponding result fits the output cap. Failed
operations produce governed errors and `failed` events without raw exception
details.

Sixteen contract surfaces remain deferred. Draft.2 standing is
`integration_only`; neither the HTTP runtime nor stdio bridge is presented as
production compatibility or GKOS conformance.

### Stdio compatibility bridge

`gkos-mcp-stdio` forwards LF-delimited JSON-RPC messages to the authenticated
loopback `/mcp` endpoint. It accepts `GKOS_MCP_TOKEN_FILE` and an optional
literal loopback `GKOS_MCP_URL`. It rejects raw tokens, URL credentials, query
parameters, fragments, alternate hosts, TLS URLs, and non-`/mcp` paths.

The bridge securely reopens the private credential file, preserves one HTTP
session, limits frames/results to the HTTP bounds, permits at most four
post-initialize requests in flight, applies a 30-second operation deadline, and
uses a bounded ten-second shutdown with best-effort session deletion. Output
backpressure, close, and error are bounded. It emits protocol JSON on stdout
and generic diagnostics on stderr without credential material.

It delegates to the loopback service and is not a second runtime or a
native-stdio conformance claim.

## Traversal events

`/events` uses authenticated fetch-compatible SSE rather than native
`EventSource`, so clients can send an authorization header. Envelopes contain
only:

```json
{
  "schema_version": 1,
  "session_id": "opaque-session-id",
  "sequence": 42,
  "offset_ms": 1832,
  "operation_id": "opaque-operation-id",
  "agent_id": "stable-agent-id",
  "agent_label": "Local MCP Agent",
  "tool": "gkos_navigation_discover",
  "paths": ["Guides/Torpedoes.md"],
  "status": "completed",
  "cost_units": null
}
```

Paths use a closed, NFC, vault-relative filesystem grammar. URL encoding,
absolute/drive/UNC forms, traversal, backslashes, controls, empty segments,
Windows devices, portability hazards, and invalid encodings are rejected.
Events contain no note body, prompt, token, credential, or raw error.

The default process-local ring is bounded to 2,048 events and 2 MiB; supported
constructor limits cannot exceed 5,000 events or 16 MiB. Persistence is off.
Each client queue is bounded to 256 events and 512 KiB. Slow or overflowing
streams close rather than growing without limit.

With no `Last-Event-ID`, a new connection live-tails. Resume requires both
`Last-Event-ID` and the current `GKOS-Event-Session`. A malformed sequence,
retention gap, future sequence, or server-session mismatch fails with an
explicit reset-required response. Delivery is ordered, rechecks credential
revocation and the current authorized view, and holds a concurrency slot until
the stream closes.

`cost_units` remains `null` because the current runtime has no metering source.

## Navigation 1.0

NavigationCore (`src/navigation`) is pure with respect to filesystem state. A
release gate walks its transitive import graph and rejects filesystem or child
process authority.

Stable functions include discovery/classification, deterministic MOC candidate
generation, run manifests, text/semantic diffs, audit, filtered context packs,
incremental invalidation, re-entry planning, bounded supersession evaluation,
retention-hold evaluation, and truthful capability discovery.

The built-in MOC names are exactly `index`, `_index`, `readme`, `moc`, and
`contents` for `.md` and `.markdown` files. `home`, `map`, `overview`,
`dashboard`, `start`, and `toc` are review findings, not aliases. Promotion is
an explicit governed proposal and receipt path.

Candidate bytes bind the source snapshot, policy, configuration, and source
digests. Generation never applies those bytes. Audit reports stale candidates,
marker/configuration problems, lineage, archive leakage, context-budget, and
discoverability problems; it does not fix source content.

Context compilation invokes the caller-supplied discoverability policy before
relationships, counts, diagnostics, or budgets are assembled. Deny,
indeterminate, and policy error all suppress the source. The artifact declares
`engine.navigation-context-pack` and `gkos_context_manifest: false`; it is not a
GKOS Layer-6 Context Manifest.

`getNavigationCapabilities()` truthfully reports `apply_moc: false` and
`source_content_write: false`. The CLI rejects Navigation mutation verbs,
output-file flags, and watch mode. `_archive/moc-runs/**` is an exact Navigation
ignore namespace, but no archive writer or managed-MOC executor exists here.

See [`docs/NAVIGATION-CONTRACT.md`](docs/NAVIGATION-CONTRACT.md) and
[`docs/NAVIGATION-AUTHORITY-BOUNDARY.md`](docs/NAVIGATION-AUTHORITY-BOUNDARY.md).

## Governance

The governance subpath defines an explicit append-only `GovernanceStore`,
governed records, State-Change Receipt roles, idempotency, optimistic head or
digest preconditions, durability verification, and deferred review.

A receipt role binds actor, authority, policy, operation, before/after targets,
outcome, time, transaction, and durability evidence. Only a configured host
store can transition a proposed outcome to committed at its durable publication
boundary. Failed receipt validation, failed durability, a stale precondition,
or conflicting idempotency replay produces no governed effect.

`InMemoryGovernanceStore` is a test/reference adapter. It is not a hidden vault
writer or production durability claim.

## Optional intelligence and experimental science

The Python 3.11+ intelligence service is a separate process and dependency
boundary. The TypeScript engine remains deterministic, offline-capable, and
LLM-independent. The service emits proposal-only responses; it neither edits
the filesystem nor approves its output.

The `experimentalScience` namespace parses, canonicalizes, validates, checks
event chains and artifacts, compares reruns, assesses supplied verification
evidence, and plans re-entry for the provisional `SRTP-DRAFT-0.1` profile.
Missing verification remains `UNEVALUATED`; field presence alone cannot become
`PASS`. The namespace is non-normative and does not alter default GKX behavior.

## Command effects

| Command | Reads | Writes |
| --- | --- | --- |
| `gkx validate <dir>` / `gkx assess <dir>` | Source corpus | None |
| `gkx validate --kb-path ...` | Source corpus and profile | Validation output only |
| `gkx index --kb-path ...` | Source corpus and profile | Derived `.gkx` generation, rejection, journal, and pointer state |
| `gkx search ...` | Verified active/coherent generation and source citations | No source or index mutation |
| `gkx graph ... -o file` | Source corpus | Named graph output; watch mode rewrites that output |
| `gkx export graphiti ...` | Source corpus | Named graph/episode outputs |
| `gkx nav ...` | Source snapshot and explicit inputs | Stdout values/plans only |
| `gkx retrieval eval` | Sealed fixture set | Private temporary state only; cleaned after evaluation |
| `gkx retrieval tune` | Sealed fixture set | One new, guarded candidate TOML when selected |
| `gkos status` | Owner-private status directory | None |
| `gkos watcher journal-reset` | Stopped watcher state plus exact expected digests | Archived replacement journal authority; no source-note mutation |
| `gkos-mcp-stdio` | Private token file and stdin | Loopback requests and stdout protocol frames |
| `gkos-agent` / desktop entry | Source corpus and private state | Derived watcher/index state, status, credentials, journals, and locator |

The `gkos` syntax is deliberately narrow:

```text
gkos status --state <status-directory> [--json]
gkos watcher journal-reset --state <watcher-directory>
  --expected-journal-generation-digest <sha256>
  --expected-coherent-manifest-digest <sha256> [--json]
```

## Runtime and platform standing

The package declares Node `>=22 <25` and npm `>=10`. There are no third-party
runtime entries in `dependencies`; build and qualification use pinned
development dependencies. Node itself, SQLite support, the filesystem, and any
configured provider remain runtime boundaries.

After installation/build, core parsing, validation, graph, Navigation, and
fixed-offline evaluation can run without a network. Installing dependencies and
external provider connectors can require one.

Governed CI lanes cover Node 22, 23, and 24 on Linux and Windows, plus the
Draft.2 macOS Node 22 integration lane. Host-specific tests distinguish an
unavailable platform primitive from a pass. The current SEA release workflow
is configured to build unsigned Windows x64 and macOS arm64/x64 pre-release
binaries; it has no Linux SEA job.

## Verification

Run the repository gates from a clean tree:

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run test:navigation
npm run test:intelligence
npm run pack:check
npm run check:license
npm run check:nomenclature
git diff --check
```

Important focused contract gates include:

```sh
node --test test/agent-identity-mcp-contract.test.mjs
node --test test/agent-identity-mcp-contract-draft2.test.mjs
node --test test/service-contracts.test.mjs test/service-runtime.test.mjs
node --test test/service-stdio.test.mjs test/service-stdio-package.test.mjs
```

Do not hard-code a historical test total. Qualification means zero failures and
only documented skips at the exact tested SHA. External fixture absence remains
an explicit skip/unevaluated state, never an implied pass.

## Explicit non-claims and deferred work

This branch does not claim or provide:

- Navigation Effects or a source filesystem executor;
- MOC application, managed-region writes, adoption, archive creation/deletion,
  effect locks/leases, rollback, or effect recovery;
- enabled proposal ingress, decisions, approval, or confidence-based authority;
- the sixteen deferred identity/MCP tool surfaces;
- production identity administration or native-stdio conformance;
- a production-compatible, released, or GKOS-conformant Draft.2 service;
- LAN/internet service binding;
- a Linux SEA release artifact;
- automatic updater, signing, notarization, or production distribution; or
- Rust 3.0 parity or cutover.

Capability reporting must continue to distinguish code availability,
configuration, authorization, safety, enablement, integration qualification,
release status, and conformance.
