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

## License

MIT. See [LICENSE](./LICENSE).
