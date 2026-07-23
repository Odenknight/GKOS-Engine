# GKOS Engine

The canonical deterministic engine implementing **OKF+ 2.3** — parse, validate,
project, assess, graph, and export — under **GKOS** governance.

This repository is the single source of truth for the engine. It is
**Obsidian-free, DOM-free, platform-neutral** TypeScript: a reusable core that
downstream products consume rather than re-vendor.

- **Kosmos-Oden** (the Obsidian plugin) consumes this package.
- **GKOS-Engine-Lite** consumes this package.

This is an *implementation*, not the GKOS standard itself. The standard lives at
[github.com/Odenknight/gkos-standard](https://github.com/Odenknight/gkos-standard).

## OKF+ 2.3 dialects

Both OKF+ 2.3 dialects are supported:

- **Agent-Ready (flat 2.3)** — flat, human/agent-editable frontmatter.
- **Machine Dialect (nested 2.3)** — the nested machine projection.

The engine parses either, produces a validating OKF+ 2.3 projection, and derives
diagnostics and documentation-quality assessments deterministically.

## Install / build

No system Node assumptions beyond `node >=22 <25`.

```sh
npm install       # installs devDependencies (esbuild, typescript)
npm run build     # bundles src/ -> dist/kosmos-core.mjs (ESM)
npm run typecheck # tsc --noEmit
npm test          # node --test (rebuilds the bundle via pretest)
```

The build bundles `src/index.ts` (and its siblings) into a single fully-inlined
ESM module, `dist/kosmos-core.mjs`, which is the package's `main`/`exports`
entry and the module the CLI and tests import.

## Library usage

```js
import { buildGraph, buildOkf23Projection, ENGINE_VERSION } from "gkos-engine";
```

Everything re-exported from `src/index.ts` is public surface.

### Projection options

`buildOkf23Projection(raw, sourcePath, contentHash, legacy, options?)` accepts an
optional `Okf23ProjectionOptions`:

- **`defaultSensitivity`** — effective sensitivity applied when a note declares
  no `sensitivity` field. The engine **fails closed**: out of the box a missing
  sensitivity resolves to `secret` (`FAIL_CLOSED_SENSITIVITY_DEFAULT`), per
  GKOS §11, and `OKF-SENSITIVITY-001` fires so the defaulting is always visible
  in diagnostics. Downstream plugins may surface this as a user-facing setting.
  The value is validated against the seven-level vocabulary; an unrecognized
  value falls back to `secret`. An **authored** classification (including a
  legitimately open one) is respected as-is — the default only governs the
  missing case.

  ```js
  buildOkf23Projection(raw, path, hash, null, { defaultSensitivity: "internal" });
  ```

  The same `Okf23ProjectionOptions` now threads through the indexing path so
  deployments can configure the projection default end-to-end, not just on a
  direct `buildOkf23Projection` call. `parseSourceFile(f, options?)` and
  `buildGraph(files, folders, now?, options?)` forward the options, and
  `new KosmosIndex(options?)` applies them to **every** internal projection —
  including incrementally re-parsed notes via `applyChanges`, so an incremental
  update honors the same default as a full `setFiles` build:

  ```js
  const index = new KosmosIndex({ defaultSensitivity: "internal" });
  index.setFiles(files, folders);   // full build honors the default
  index.applyChanges({ changed });  // incremental reparse honors it too
  ```

  Omitting the parameter anywhere in this path keeps the fail-closed `secret`
  default (backward compatible).

  The engine ships **no PII/sensitive-content detection**. If a deployment adds
  detection it may only **raise** effective sensitivity (per the exported
  `SENSITIVITY_RANK` ladder), never lower it.

### Effective-state contracts

- **Epistemic state** — an `epistemic_state` outside the frozen twelve-state
  vocabulary raises `OKF-EPISTEMIC-002` (error) and projects `effective.epistemicState`
  to the null-weight fallback `unknown`, with a machine-detectable
  `effective.epistemicStateDefaulted: true`. The invalid value is retained on
  `authored.epistemicState` and echoed in the diagnostic for repair; an
  `upgrade-all` migration run rewrites it to the conservative default.
- **Temporal** — a naive wall-clock timestamp (no `Z`, no numeric ±HH:MM offset)
  in `created_at`/`updated_at` raises `OKF-TEMPORAL-001` (warning), matching the
  schema and the stamper. The projection, stamper (`isValidOkfTimestamp`), and
  schema share one validator so they cannot drift.

## CLI: `okf`

The `okf` binary runs the engine over any folder of Markdown notes — no Obsidian
required. It imports the built `dist/kosmos-core.mjs`, so run `npm run build`
once first.

Every command embeds a deterministic `build:` block on its output:

```json
{ "engine_version": "0.6.5",
  "policy_hash": "sha256:…",
  "corpus_hash": "…",
  "generated_at": "2026-07-19T…Z" }
```

The scan uses the shared ignore rules (`DEFAULT_IGNORED_DIRS`): `.okf`,
`.obsidian`, `.git`, `node_modules`, `.trash`.

### `okf validate <dir>`

Runs the deterministic parser/projection/validation over every note, prints a
summary and per-note diagnostics. **Exits non-zero if any `error` or `critical`
diagnostics exist**, `0` otherwise.

```sh
node bin/okf.mjs validate ./my-notes
```

### `okf assess <dir> [--json]`

Runs the assessment engine over every note and prints per-note
documentation-quality scores and labels. `--json` emits a stable-key-ordered
JSON array instead of the human table.

```sh
node bin/okf.mjs assess ./my-notes
node bin/okf.mjs assess ./my-notes --json > assessments.json
```

### `okf graph <dir> -o <graph.json> [--watch]`

Builds the canonical Kosmos graph (nodes, links, stats, diagnostics) with stable
serialization. `--watch` rebuilds on change.

```sh
node bin/okf.mjs graph ./my-notes -o graph.json
```

### `okf export graphiti <dir> --episodes <out.json> [--group-id <ns>]`

Exports Graphiti episodes for the corpus.

```sh
node bin/okf.mjs export graphiti ./my-notes --episodes episodes.json --group-id my-vault
```

### Deprecated positional alias

The pre-CLI positional form still works unchanged for backward compatibility and
is equivalent to `okf graph` (plus `export graphiti` when `--episodes` is given):

```sh
node bin/okf.mjs <vault-dir> [graph.json] [--episodes <out.json>] [--group-id <ns>] [--watch]
```

## Desktop agent

`src/desktop-agent.ts` (built to `dist/kosmos-desktop-agent.mjs`, compiled
per-platform into a Node SEA single binary `kosmos-agent`) is the headless
sidecar for **GKOS Engine Desktop**. It points the engine at a notes folder,
watches for changes, and serves a **loopback-only** read-only agent API for
local agents (Claude Desktop, Cursor, …).

```sh
npm run build           # emits dist/kosmos-desktop-agent.{mjs,cjs}
node dist/kosmos-desktop-agent.mjs \
  --notes /path/to/notes --default-sensitivity internal --port 4814 \
  --status-file /path/to/desktop-agent.status.json

node scripts/build-sea.mjs   # compiles the SEA binary for the current OS
```

### Flags

| Flag | Required | Default | Notes |
| --- | --- | --- | --- |
| `--notes <dir>` | yes | — | Notes folder to index and watch. |
| `--default-sensitivity <level>` | no | `secret` | One of the seven levels (`public`, `internal`, `restricted`, `confidential`, `regulated`, `phi`, `secret`). Invalid/missing **fails closed to `secret`**. Governs UNLABELED notes only; **raise-only** — it can never lower an authored classification. |
| `--port <n>` | no | `4814` | Loopback port. Invalid values fall back to the default. |
| `--status-file <path>` | no | `<notes>/.okf/desktop-agent.status.json` | Where the shell reads health/state. |

There is **no `--host` option**: the server binds `127.0.0.1` only (GKOS §11.4
local-only default; no cloud/LAN access). Passing `--host` is a hard error.

### Bearer token

Generated on first run (`crypto.randomBytes(32)` hex) and persisted to
`desktop-agent.token` alongside the status file (written `0600`; advisory on
Windows). **Every request requires it** (`Authorization: Bearer <token>`);
missing/invalid → `401`. The `token_path` is published in the status file so the
shell can render quick-connect snippets.

### Status file schema

```json
{
  "pid": 30880,
  "port": 4814,
  "url": "http://127.0.0.1:4814/",
  "token_path": "…/desktop-agent.token",
  "notes_dir": "…/notes",
  "default_sensitivity": "internal",
  "notes_indexed": 3,
  "state": "indexing | serving | error",
  "last_scan_iso": "2026-07-23T07:07:05.017Z"
}
```

### Endpoints (all GET, all token-gated)

- `GET /` · `GET /health` — the status document above.
- `GET /notes` — `{ notes: [{ id, path, label, type, sensitivity }], count }`
  where `sensitivity` is the effective (post-projection) level.
- `GET /graph` — the current `KosmosGraph`.
- `GET /graphiti/episodes` — Graphiti projection episodes for the current graph.

The engine surface stays read-only; the raise-only invariant and fail-closed
sensitivity default are unchanged — no new governance surface is added.

## License

MIT. See [LICENSE](./LICENSE).
