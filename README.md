# GKOS-Engine

**GKOS-Engine 2.0.1** is the canonical deterministic engine for **GKX 2.0**.
It parses, validates, projects, assesses, graphs, and exports governed knowledge
records under GKOS governance.

Version 2.0 is a breaking release line. It uses the GKX namespace throughout:
`gkx_version`, `.gkx/`, `GKX-*` diagnostics, `gkx` commands, and `Gkx*` public
APIs. No former command, field, path, diagnostic, or API aliases are supported.

This repository is the single source of truth for the engine. It is
**Obsidian-free, DOM-free, platform-neutral** TypeScript: a reusable core that
downstream products consume rather than re-vendor.

- **Kosmos Research Studio (KRS)** consumes this package.
- **GKOS-Engine-Lite** consumes this package.

This is an implementation, not the GKOS standard itself. The standard lives at
[github.com/Odenknight/gkos-standard](https://github.com/Odenknight/gkos-standard).

## Optional intelligence sidecar

The separately installable Python service under `services/gkos-intelligence/`
provides proposal-only AI assistance. The TypeScript engine remains deterministic,
LLM-independent, and fully functional offline. It neither writes a filesystem nor
automatically applies intelligence-generated proposals.

Its JSON responses use `gkos.intelligence.v1` and must pass
`validateIntelligenceResponse()` before use.

- Proposals cannot set authoritative state.
- Sensitivity proposals are raise-only.
- Mismatched targets, unknown types, malformed responses, and unsafe fields fail
  closed.
- A separate authorized workflow is required before a suggestion becomes authored
  or approved state.

See [the sidecar README](services/gkos-intelligence/README.md) for optional
installation. Normal engine commands require no Python, model, credentials, or
network access.

## GKX 2.0 document forms

GKX 2.0 supports two document forms:

- **Authoring form** — flat, human- and agent-editable frontmatter.
- **Machine projection** — a nested deterministic projection.

The engine parses either form, produces a validating GKX 2.0 projection, and
derives diagnostics and documentation-quality assessments deterministically.

## Install / build

Node.js `>=22 <25` is required.

```sh
npm install
npm run build     # bundles src/ -> dist/gkos-engine.mjs (ESM)
npm run typecheck # tsc --noEmit
npm test          # node --test
```

The build bundles `src/index.ts` and its siblings into the package’s public ESM
module, `dist/gkos-engine.mjs`.

## Library usage

```js
import { buildGraph, buildGkx23Projection, ENGINE_VERSION } from "gkos-engine";
```

Everything re-exported from `src/index.ts` is public surface.

### Experimental scientific trace support

Draft Scientific Research Trace Profile support is available only through the
`experimentalScience` namespace. It is deterministic and offline, validates
trace evidence and bindings, and never executes research, decides scientific
truth, grants authority, or changes the default GKX pipeline.

```js
import { experimentalScience } from "gkos-engine";

const parsed = experimentalScience.parseScientificRecord(providerJson, {
  experimentalScienceProfile: true,
});
const validation = experimentalScience.validateScientificRecord(parsed, {
  experimentalScienceProfile: true,
});
```

`assessScientificTrace()` accepts verifier results under
`policy.verificationEvidence`. Event-chain integrity, artifact traceability,
and re-entry completeness remain `UNEVALUATED` until verifier evidence covers
every corresponding record; field presence alone can never produce `PASS`.

The draft identifier is not a normative GKOS profile. See
[`docs/VERSION-PROFILE-COMPATIBILITY.md`](docs/VERSION-PROFILE-COMPATIBILITY.md)
for the package, namespace, projection and historical-version distinctions.
`SRTP_DRAFT_FIXTURE_BASELINE` records standard base commit `351330ce`, the
workspace-draft catalog's exact SHA-256, catalog `SRTP-DRAFT-FIXTURES-0.1.1`,
and its compatible version coordinates.
The exact catalog test runs when that standard checkout is available; an absent
catalog is skipped and remains unevaluated, never an implied pass.

### Projection options

`buildGkx23Projection(raw, sourcePath, contentHash, document, options?)` accepts
an optional `Gkx23ProjectionOptions`.

- **`defaultSensitivity`** — effective sensitivity when a record has no
  `sensitivity` field. The engine fails closed: a missing value resolves to
  `secret`, and `GKX-SENSITIVITY-001` makes defaulting visible in diagnostics.
  Values are validated against the seven-level vocabulary; an unrecognized value
  also resolves to `secret`.

  ```js
  buildGkx23Projection(raw, path, hash, null, { defaultSensitivity: "internal" });
  ```

  `parseSourceFile(f, options?)`, `buildGraph(files, folders, now?, options?)`,
  and `new GkxIndex(options?)` apply the same option to full and incremental
  builds.

The engine ships no PII or sensitive-content detector. A deployment that adds one
may only raise effective sensitivity; it may never lower an authored value.

### Effective-state contracts

- **Epistemic state** — a value outside the frozen twelve-state vocabulary raises
  `GKX-EPISTEMIC-002` and projects `effective.epistemicState` to `unknown`, with
  `effective.epistemicStateDefaulted: true`.
- **Temporal** — a naive wall-clock timestamp in `created_at` or `updated_at`
  raises `GKX-TEMPORAL-001`. The projection, stamper (`isValidGkxTimestamp`), and
  schema share one validator.

## CLI: `gkx`

The `gkx` binary runs the engine over a folder of Markdown records. Run
`npm run build` first; the command imports `dist/gkos-engine.mjs`.

Every command embeds a deterministic `build:` block in its output:

```json
{ "engine_version": "2.0.1",
  "policy_hash": "sha256:…",
  "corpus_hash": "…",
  "generated_at": "2026-08-05T…Z" }
```

The shared ignore rules (`DEFAULT_IGNORED_DIRS`) include `.gkx`, `.obsidian`,
`.git`, `node_modules`, and `.trash`.

### `gkx validate <dir>`

Runs deterministic parsing, projection, and validation over every record. It exits
non-zero when any `error` or `critical` diagnostic exists.

```sh
node bin/gkx.mjs validate ./my-notes
```

### `gkx assess <dir> [--json]`

Runs the assessment engine and prints per-record documentation-quality scores and
labels. `--json` emits stable-key-ordered JSON.

```sh
node bin/gkx.mjs assess ./my-notes
node bin/gkx.mjs assess ./my-notes --json > assessments.json
```

### `gkx graph <dir> -o <graph.json> [--watch]`

Builds the canonical graph with stable serialization. `--watch` rebuilds on
change.

```sh
node bin/gkx.mjs graph ./my-notes -o graph.json
```

### `gkx export graphiti <dir> --episodes <out.json> [--group-id <ns>]`

Exports Graphiti episodes for the corpus.

```sh
node bin/gkx.mjs export graphiti ./my-notes --episodes episodes.json --group-id my-vault
```

## Desktop agent

`src/desktop-agent.ts` is built to `dist/gkos-desktop-agent.mjs` and compiled
per platform into the `gkos-agent` Node SEA binary. It watches a records folder
and serves a loopback-only read-only agent API.

```sh
npm run build
node dist/gkos-desktop-agent.mjs \
  --notes /path/to/notes --default-sensitivity internal --port 4814 \
  --status-file /path/to/desktop-agent.status.json

node scripts/build-sea.mjs
```

| Flag | Required | Default | Notes |
| --- | --- | --- | --- |
| `--notes <dir>` | yes | — | Records folder to index and watch. |
| `--default-sensitivity <level>` | no | `secret` | One of the seven levels; invalid or missing values fail closed to `secret`. |
| `--port <n>` | no | `4814` | Loopback port. |
| `--status-file <path>` | no | `<notes>/.gkx/desktop-agent.status.json` | Health and state location. |

There is no `--host` option: the server binds `127.0.0.1` only. Every request
requires the bearer token generated on first run.

### Endpoints

- `GET /` and `GET /health` — status document.
- `GET /notes` — indexed records.
- `GET /graph` — current graph.
- `GET /graphiti/episodes` — Graphiti projection episodes.

## License

First-party software is licensed under Apache-2.0. Documentation and original
graphics are licensed under CC BY 4.0 as described in [LICENSE](./LICENSE).
See [NOTICE](NOTICE), [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), and
[TRADEMARKS.md](TRADEMARKS.md).
