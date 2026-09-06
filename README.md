# GKOS-Engine

Turn a folder of Markdown into a dependable knowledge map—locally,
deterministically, and with the privacy boundary kept in view.

**GKOS-Engine 2.2.0** (development candidate) parses and validates GKX records, builds canonical graphs,
projects Graphiti episodes, indexes and retrieves knowledge, analyzes navigation
pages, and can serve an authenticated live view to local applications and named
MCP agents. The core is TypeScript, has no Obsidian or browser dependency, and
does not need an LLM. A separate admission-policy subpath can replay bounded,
hash-pinned policies and emit deterministic receipts without granting approval
or materialization authority.

GKOS-Engine is designed to be the quiet machinery underneath products such as
Kosmos-Oden: one interpretation of GKX, reusable from a library, CLI, headless
service, or desktop sidecar.

A **map of content (MOC)** is a note that links to other notes, like a table of
contents. **GKX** is the structured record format the engine interprets. An
**effect** changes stored state. Generating a suggestion and having permission
to apply it are different things.

Start with the read-only commands below. Developers can then explore the
explicit managed-MOC host. See [current capabilities](docs/CURRENT_CAPABILITIES.md)
for the complete inventory and the [roadmap](ROADMAP.md) for future work.

## Source, tags and releases

The `main` branch contains the **2.2.0 development candidate**, including the
experimental managed-MOC host. It is not an installed-product or release claim.
As checked on September 6, 2026, the newest Git version tag is `v2.1.2`, while
GitHub marks **2.1.1** as its latest published release. Those older snapshots do
not include the current 2.2 MOC implementation.

Read [release status and verification evidence](docs/RELEASE-STATUS.md) before
choosing a dependency. GitHub topic tags describe the project; they do not
certify a feature, authorize writes, or identify a released artifact.

## What is here

| Area | What it does | Current standing |
| --- | --- | --- |
| GKX core | Parse, canonicalize, validate, assess, resolve lineage, project time, and build graphs | Implemented and retained in 2.2 |
| Graphiti adapter | Produce deterministic, bounded episode projections | Implemented |
| Ingest and retrieval | Validate a corpus, publish derived SQLite generations, search lexically or through configured providers, and verify citations | Implemented; provider connectors remain host choices |
| Watcher host | Keep one coherent graph/retrieval generation current and recover durable derived state after interruption | Implemented as a repository-private host runtime |
| Navigation 1.0 | Discover MOCs, build candidates, diff, audit, assemble filtered context, and plan re-entry | Implemented and source-content read-only |
| Navigation Effects 1.0 | Managed-MOC planning, generated-region preservation, Node transactions, durable event coordination, archives and recovery | Implemented experimental integration; explicit host configuration and authority required |
| MOC assistance | Deterministic explicit tags/links and tag-grouped proposals; optional bounded LLM suggestions | Model-free baseline; optional provider off by default, separate data-access approval, review-only output |
| Local service | Serve authorized graph, notes, Graphiti episodes, capabilities, MCP, and traversal events on loopback port 4814 | Implemented under an integration-only draft contract |
| MCP | Ten credential-bound read-only tools over Streamable HTTP, plus a packaged stdio compatibility bridge | Seven original Draft.2 tools plus three Observatory extensions; no source-write tools |
| Optional intelligence | Validate proposal-only responses from a separate Python AI sidecar | Optional; never approval authority |
| Scientific trace evaluation | Deterministic checks for a provisional research-trace draft | Experimental and opt-in |
| Admission-policy provider | Evaluate pinned, bounded admission requests and emit deterministic, hash-bound receipts | Implemented in 2.1.2; no approval, activation, or materialization authority |

Three boundaries are especially important:

- **Navigation 1.0 is still read-only.** Its import graph cannot reach the
  separate Effects executor, and its capability document still reports source
  writes unavailable.
- **Managed writes require explicit integration.** The separate planner, Node
  executor and managed host are implemented, but importing them grants no
  authority, creates no files, and does not turn on automatic writes.
- **Proposal ingress is not active.** The local service reports it as disabled;
  no agent proposal, approval, or source-write route is available.

## A five-minute start

Use Node.js 24 for the documented development baseline. The package accepts
lines with `>=22 <23 || >=24 <25 || >=26 <27`; Node 26 remains an informative
compatibility lane until it reaches LTS. Node 23 and 25 are unsupported. npm
`>=10` is required.

```sh
git clone https://github.com/Odenknight/GKOS-Engine.git
cd GKOS-Engine
npm ci
npm run build

node bin/gkx.mjs validate ./my-notes
node bin/gkx.mjs assess ./my-notes
node bin/gkx.mjs graph ./my-notes -o graph.json
```

Nothing in those first two commands edits the notes. The graph command writes
only the output file you name.

For a guided introduction to GKX records, continue with
[BEGINNERS_GUIDE.md](BEGINNERS_GUIDE.md). For API and operational detail, see
[TECHNICAL_README.md](TECHNICAL_README.md).

## Useful local workflows

### Validate and index a corpus

The folder-oriented commands use the same parser and projection logic as the
library:

```sh
node bin/gkx.mjs validate --kb-path ./my-notes --format text
node bin/gkx.mjs index --kb-path ./my-notes --strict
```

Strict indexing blocks activation when governed validation rejects a source.
Non-strict indexing can publish the accepted subset together with an explicit
rejection ledger. Derived retrieval state lives under `.gkx/`; it is not
canonical knowledge.

### Search with verified citations

```sh
node bin/gkx.mjs search "torpedo guidance" \
  --kb-path ./my-notes --limit 5
```

The CLI search policy is intentionally public-only. It filters source and chunk
eligibility before scoring, verifies returned citations against current source
bytes, and can accept `--as-of <GKX-timestamp>` for a temporal view. Optional
embedding and reranking providers are selected only through trusted host
configuration; the deterministic lexical path works without them.

### Explore Navigation without changing notes

```sh
node bin/gkx.mjs nav scan ./my-notes
node bin/gkx.mjs nav audit ./my-notes
node bin/gkx.mjs nav render ./my-notes --stdout
node bin/gkx.mjs nav context ./my-notes \
  --recipient alice --purpose research --stdout
```

Navigation recognizes exactly five built-in MOC basenames: `index`, `_index`,
`readme`, `moc`, and `contents`. Other MOC-like names are findings for review,
not silent aliases. `render` emits deterministic candidate data to stdout; it
does not write a MOC.

### Export a Graphiti projection

```sh
node bin/gkx.mjs export graphiti ./my-notes \
  --episodes episodes.json --group-id my-vault
```

Graphiti is a projection of GKX, not a second source of truth. Stable IDs,
bounded content, and canonical attributes make repeated exports comparable.

## Run the local service

The desktop agent watches a corpus, maintains a coherent derived generation,
and serves authenticated local clients. It always binds to `127.0.0.1`; there
is no `--host` option.

```sh
npm run build
node dist/gkos-desktop-agent.mjs \
  --notes /absolute/path/to/my-notes \
  --status-file /absolute/path/to/private-state/desktop-agent.status.json \
  --port 4814
```

On first start it creates separate owner-private credential files for:

- the local viewer, which may read REST projections and traversal events; and
- the default MCP agent, which may use MCP but cannot reuse viewer authority.

The console and status document report credential **paths**, never credential
values. Supply the appropriate file to a trusted client and send bearer values
only in the `Authorization` header. Tokens are not accepted in query strings.

The service provides:

- `/health`, `/capabilities`, `/notes`, `/graph`, and
  `/graphiti/episodes` for authorized reads;
- `/events` for authenticated traversal events over fetch-compatible SSE;
- `/mcp` for the bounded read-only MCP lifecycle; and
- watcher-owned `/status` and `/control/shutdown` operator routes.

Every returned note, node, link, episode, count, MCP result, and event path is
derived from a credential-bound authorized view. Hidden endpoints disappear
with their edges and derived counts. Missing or invalid sensitivity fails
closed to `secret`.

### MCP from a stdio-only client

Installed packages include `gkos-mcp-stdio`, a small compatibility bridge to
the same loopback service. Configure it with the path to the MCP credential:

```text
GKOS_MCP_TOKEN_FILE=/private/state/desktop-agent.mcp.token
GKOS_MCP_URL=http://127.0.0.1:4814/mcp
```

The URL override is optional and must remain a literal loopback HTTP `/mcp`
endpoint. The bridge rejects raw-token environment variables, URL credentials,
query parameters, and non-loopback hosts. It is not a second MCP authority and
does not claim native-stdio conformance.

The ten available tools cover capabilities, validation, assessment, lineage,
graph-at-time, Navigation discovery/audit, note reading, known-path resolution
and search. The last three are separately versioned Observatory extensions;
the frozen Draft.2 contract retains its seven original tools and sixteen
deferred contract surfaces. Availability does not guarantee source permission
or a ready retrieval generation. No agent-note writer is exposed.

## Use it as a library

```js
import {
  ENGINE_VERSION,
  buildGraph,
  buildGkx23Projection,
  GkxIndex,
} from "gkos-engine";

import { buildGraphitiEpisodes } from "gkos-engine/graphiti";
import { discoverNavigation } from "gkos-engine/navigation";
import { RetrievalCoordinator } from "gkos-engine/retrieval";
import { evaluateAdmissionPolicy } from "gkos-engine/admission-policy";
```

Published subpaths are:

| Import | Purpose |
| --- | --- |
| `gkos-engine` | Framework-neutral parser, validation, assessment, graph, lineage, migration/enrichment planning, intelligence validation, Navigation/Effects/governance re-exports, and experimental science namespace |
| `gkos-engine/adapter` | Small dependency-injection adapter for downstream products |
| `gkos-engine/gkx` | Focused GKX types, parser, projection, and incremental index |
| `gkos-engine/graphiti` | Graphiti projection API |
| `gkos-engine/navigation` | Pure, source-content-read-only Navigation 1.0 API |
| `gkos-engine/navigation-effects` | Framework-neutral Effects types, capability reporting, marker/path checks, deterministic batches, durable host-driven coordinator and proposal-only assistance |
| `gkos-engine/navigation-effects/node` | Optional experimental Node executor, journal, managed-MOC host and watcher/runtime composition |
| `gkos-engine/governance` | Receipt roles and explicit append-only governance-store contracts |
| `gkos-engine/retrieval` | Node/SQLite retrieval reference implementation |
| `gkos-engine/admission-policy` | Product-neutral deterministic policy evaluation, receipt validation, and context-bound replay verification |

The local-service, watcher, ingest-host, evaluation-host, and filesystem
authority bundles are deliberately not public package subpaths. Their supported
entry points are the packaged commands and repository host integrations.

## The safety model, in plain language

- **GKX stays canonical.** Graphs, indexes, Graphiti episodes, Navigation
  candidates, and event trails are rebuildable projections.
- **Visibility comes before serialization.** A result is filtered before paths,
  relationships, episodes, counts, or traversal events are constructed.
- **Unclear means private.** Missing or invalid sensitivity resolves to
  `secret`; policy and authorization errors fail closed.
- **Confidence is evidence, not authority.** Assessments and intelligence
  proposals never approve themselves.
- **Admission receipts are evidence, not authority.** The admission-policy
  provider performs no I/O and cannot approve, activate, or materialize an
  artifact; relying consumers must verify the exact request and policy context.
- **Navigation 1.0 reads source content but cannot write it.** Its subpath
  returns values and plans and cannot reach the separate experimental executor.
- **Effects stay asleep unless a host proves readiness.** Package availability
  is not configuration, configuration is not authority, and neither enables an
  automatic write. The experimental Node executor requires explicit host,
  policy, journal, precondition, and authority inputs for an individual effect.
- **Derived-state writes are explicit.** Indexing, watcher journals, status,
  tokens, graph exports, and requested output files are effects, but none is a
  silent source-note rewrite.
- **Local means loopback.** The service does not expose a configurable network
  bind and does not accept bearer tokens in URLs.

## Versions and standing

The candidate npm package is `2.2.0`. The public exchange namespace remains GKX `2.0`,
while the existing validating projection identifier remains
`gkx-2.3-validating-projection`. These names describe different layers and are
not interchangeable; [the compatibility guide](docs/VERSION-PROFILE-COMPATIBILITY.md)
records the distinction.

GKOS-Engine is downstream of
[gkos-standard](https://github.com/Odenknight/gkos-standard). Repository tests
and matching version numbers do not by themselves establish GKOS conformance.
The local-service and identity/MCP Draft.2 contracts are explicitly
integration-only. Draft.2 qualifies the seven implemented tools and transports
for integration; it is not a production compatibility, release, or conformance
declaration.

The Navigation Effects contract is also `1.0.0` and integration-only. Its
manifest names Engine `2.2.0` as a future release target; this repository still
declares candidate package version `2.2.0`; a version bump is not release evidence.

Current qualification uses blocking Node 22 and 24 lanes on Linux and Windows,
with Node 26 informative until LTS. Frozen historical contract replay retains
its original Node 22/23/24 coordinates. The existing SEA release workflow uses
Node 24 LTS to build
unsigned pre-release `gkos-agent` binaries for Windows x64 and macOS arm64/x64;
it does not define a Linux SEA artifact.

## Optional and experimental components

### Managed MOC host in the 2.2.0 candidate

After building, run `npm run example:moc` to create and maintain a MOC in an
isolated synthetic temporary vault. The example retains its journal, ownership
state and archive for inspection. It does not discover or modify your vault.

The explicit `NodeManagedMocRuntime` API combines watcher signals, durable
reconciliation and the existing Effects executor. Supply a validated index
snapshot and a live authority/configuration/sensitivity provider before using
an owner vault. Optional model providers only return reviewable suggestions.
See [the integration guide](docs/DETERMINISTIC-MOC-ASSISTANCE.md).

### Managed MOC writes: implemented, opt-in and still experimental

The framework-neutral Effects planner can validate ownership, markers, paths,
policy/authority bindings, digests, and exact region-preserving MOC candidates.
The optional Node executor adds a cooperative-vault implementation of leases,
target locks, a hash-chained journal, exact archives, temporary replacement,
after-read verification, receipts, checkpoints, rollback, and startup recovery.

That is useful engineering groundwork, but it is deliberately not a magic
“organize my vault” switch. The new explicit Node host supplies durable event
coordination, reconciliation and ownership recovery. Consumers supply validated
index snapshots and live authority checks. Kosmos adoption UI and its Obsidian
adapter remain downstream integrations. Existing MOCs remain outside
any managed workflow until a consumer implements explicit, digest-bound
adoption and all of its own gates pass. The portable Node executor also uses a
documented cooperative-vault threat model; it is not qualified against a
hostile local process racing filesystem ancestors.

The host defaults to 750 ms debounce, a 3-second maximum delay during continuous
activity, and five-minute passive reconciliation. Startup recovery and a full
reconciliation precede readiness. Watchers are hints, not guaranteed delivery.
Failed graph-publication callbacks can replay the same effect ID; consumers
must handle that idempotently. Byte-identical passes avoid rewrites but do not
yet emit dedicated durable no-op audit receipts.

End-to-end P95 targets, the 24-hour soak and native power-loss guarantees remain
qualification work. Neither these building blocks nor successful CI establish
a completed Kosmos integration, Rust parity or a published release.

The Python service in [`services/gkos-intelligence/`](services/gkos-intelligence/README.md)
can produce bounded `gkos.intelligence.v1` suggestions. The TypeScript engine
validates those responses, rejects unsafe fields and sensitivity lowering, and
requires a separate authorized review path before anything becomes authored or
approved state. Normal engine use needs no Python, model, credentials, or
network.

Scientific Research Trace Profile support is available only through the
`experimentalScience` namespace. It checks structural evidence, event chains,
artifacts, reruns, assessment inputs, and re-entry bindings for a provisional,
non-normative draft. It does not execute research, decide truth, or grant
authority.

## Build and verification

Run build and packaging steps separately from running tests: npm preparation
can rebuild `dist/` and invalidate a concurrent test run.

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
```

Pass totals are evidence for the exact commit and environment that produced
them; the gate is zero failures with only documented skips.

## What comes next?

Near-term work includes durable no-op audit records, measured end-to-end
performance and parsing counts, a 24-hour soak, platform durability evidence,
and exact-artifact consumer qualification. Kosmos owns its adapter/UI and
credential-bound agent-note tools; Rust follows its separate implementation
program. These are future deliveries, not enabled Engine MCP write features.
The [roadmap](ROADMAP.md) records owners and acceptance gates without promising
dates or automatic release.

## More documentation

- [Current capabilities](docs/CURRENT_CAPABILITIES.md)
- [Roadmap](ROADMAP.md)
- [Settings](docs/SETTINGS.md) and [TOML coordinates](docs/SETTINGS-TOML.md)
- [MOC host qualification](evidence/2026-09-06-moc-host-lifecycle-qualification.md)

- [Technical guide](TECHNICAL_README.md)
- [Compatibility notes](COMPAT.md)
- [Ingestion contract](docs/INGESTION-CONTRACT.md)
- [Navigation contract](docs/NAVIGATION-CONTRACT.md)
- [Navigation authority boundary](docs/NAVIGATION-AUTHORITY-BOUNDARY.md)
- [Navigation Effects contract](docs/NAVIGATION-EFFECTS-CONTRACT.md)
- [Navigation Effects reconciliation record](docs/navigation-effects/RECONCILIATION-20260827.md)
- [Watcher host](docs/phase5-watcher-host.md)
- [Identity and MCP Draft.2](docs/phase6-agent-identity-mcp-draft2.md)
- [Version/profile compatibility](docs/VERSION-PROFILE-COMPATIBILITY.md)

## License

First-party software is Apache-2.0. Documentation and original graphics are
CC BY 4.0 as described in [LICENSE](LICENSE). See [NOTICE](NOTICE),
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), and
[TRADEMARKS.md](TRADEMARKS.md).
