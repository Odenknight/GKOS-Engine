# GKOS-Engine

Operator settings: [complete settings reference](docs/SETTINGS.md) and [all TOML coordinates](docs/SETTINGS-TOML.md). Run `gkx settings --runtime desktop --json` to distinguish configuration wiring from runtime readiness. Integration/remaining-work tracker: [#36](https://github.com/Odenknight/GKOS-Engine/issues/36).

Turn a folder of Markdown into a dependable knowledge map—locally,
deterministically, and with the privacy boundary kept in view.

**GKOS-Engine 2.1.2** parses and validates GKX records, builds canonical graphs,
projects Graphiti episodes, indexes and retrieves knowledge, analyzes navigation
pages, and can serve an authenticated live view to local applications and named
MCP agents. The core is TypeScript, has no Obsidian or browser dependency, and
does not need an LLM. A separate admission-policy subpath can replay bounded,
hash-pinned policies and emit deterministic receipts without granting approval
or materialization authority.

GKOS-Engine is designed to be the quiet machinery underneath products such as
Kosmos-Oden: one interpretation of GKX, reusable from a library, CLI, headless
service, or desktop sidecar.

## What is here

| Area | What it does | Current standing |
| --- | --- | --- |
| GKX core | Parse, canonicalize, validate, assess, resolve lineage, project time, and build graphs | Implemented in 2.1.2 |
| Graphiti adapter | Produce deterministic, bounded episode projections | Implemented |
| Ingest and retrieval | Validate a corpus, publish derived SQLite generations, search lexically or through configured providers, and verify citations | Implemented; provider connectors remain host choices |
| Watcher host | Keep one coherent graph/retrieval generation current and recover durable derived state after interruption | Implemented as a repository-private host runtime |
| Navigation 1.0 | Discover MOCs, build candidates, diff, audit, assemble filtered context, and plan re-entry | Implemented and source-content read-only |
| Local service | Serve authorized graph, notes, Graphiti episodes, capabilities, MCP, and traversal events on loopback port 4814 | Implemented under an integration-only draft contract |
| MCP | Seven credential-bound, read-only tools over Streamable HTTP, plus a packaged stdio compatibility bridge | Implemented for integration qualification; not a production conformance claim |
| Optional intelligence | Validate proposal-only responses from a separate Python AI sidecar | Optional; never approval authority |
| Scientific trace evaluation | Deterministic checks for a provisional research-trace draft | Experimental and opt-in |
| Admission-policy provider | Evaluate pinned, bounded admission requests and emit deterministic, hash-bound receipts | Implemented in 2.1.2; no approval, activation, or materialization authority |

Two boundaries are especially important:

- **Navigation Effects is not present on this branch.** Navigation can generate
  and compare MOC candidates, but it cannot apply them to source notes.
- **Proposal ingress is not active.** The local service reports it as disabled;
  no agent proposal, approval, or source-write route is available.

## A five-minute start

You need Node.js `>=22 <25` and npm `>=10`.

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

The seven available tools are capabilities, record validation, record
assessment, lineage, graph-at-time, Navigation discovery, and Navigation
audit. Sixteen additional contract surfaces remain deferred.

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
| `gkos-engine` | Framework-neutral parser, validation, assessment, graph, lineage, migration/enrichment planning, intelligence validation, and experimental namespace |
| `gkos-engine/adapter` | Small dependency-injection adapter for downstream products |
| `gkos-engine/gkx` | Focused GKX types, parser, projection, and incremental index |
| `gkos-engine/graphiti` | Graphiti projection API |
| `gkos-engine/navigation` | Pure, source-content-read-only Navigation 1.0 API |
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
- **Navigation reads source content.** It returns values and plans; it has no
  source-write executor in 2.1.2.
- **Derived-state writes are explicit.** Indexing, watcher journals, status,
  tokens, graph exports, and requested output files are effects, but none is a
  silent source-note rewrite.
- **Local means loopback.** The service does not expose a configurable network
  bind and does not accept bearer tokens in URLs.

## Versions and standing

The npm package is `2.1.2`. The public exchange namespace remains GKX `2.0`,
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

Governed contract lanes cover Node 22, 23, and 24 on Linux and Windows, plus a
macOS Node 22 lane. The existing SEA release workflow is configured to build
unsigned pre-release `gkos-agent` binaries for Windows x64 and macOS arm64/x64;
it does not define a Linux SEA artifact.

## Optional and experimental components

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

## More documentation

- [Technical guide](TECHNICAL_README.md)
- [Compatibility notes](COMPAT.md)
- [Ingestion contract](docs/INGESTION-CONTRACT.md)
- [Navigation contract](docs/NAVIGATION-CONTRACT.md)
- [Navigation authority boundary](docs/NAVIGATION-AUTHORITY-BOUNDARY.md)
- [Watcher host](docs/phase5-watcher-host.md)
- [Identity and MCP Draft.2](docs/phase6-agent-identity-mcp-draft2.md)
- [Version/profile compatibility](docs/VERSION-PROFILE-COMPATIBILITY.md)

## License

First-party software is Apache-2.0. Documentation and original graphics are
CC BY 4.0 as described in [LICENSE](LICENSE). See [NOTICE](NOTICE),
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), and
[TRADEMARKS.md](TRADEMARKS.md).
