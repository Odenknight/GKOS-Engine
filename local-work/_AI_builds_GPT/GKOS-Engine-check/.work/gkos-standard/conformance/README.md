# GKOS conformance

GKOS defines cumulative provisional profiles GCP-1 through GCP-7 plus a
Viewer/Projection Profile. A higher profile inherits all applicable lower
requirements.

Claims must include a machine-readable manifest
(`../schemas/conformance-manifest.schema.json`), human-readable report,
standard and test versions, evidence, limitations, and exceptions.
Self-attested and independently verified claims must be distinguished. A claim
citing a draft technical specification must disclose that status and identify
the last ratified baseline (v0.76 §4.1).

v0.76 provides provisional prose requirements (`provisional-requirements/`)
plus the first executable slice of the GKOS-TS suite: `runner/` is an
adapter-neutral runner that executes `../fixtures/fixtures.manifest.json`
against any implementation exposing the small adapter contract documented in
`runner/run.mjs`, and emits a schema-valid conformance claim. An informative
gkos-engine adapter is included. The executable suite remains incomplete:
catalog 0.1.1 covers GCP-1/GCP-3 classes only, and known standard/implementation
divergences are recorded in `../fixtures/DIVERGENCES.md` rather than hidden.
Graph-level expectations (`graph_expect`) declared in the catalog are not yet
evaluated by the starter runner. The runner now reports those fixtures as
`UNEVALUATED`, emits no profile claim, and exits non-zero; it cannot silently
turn partial execution into GCP-3 evidence.

The accepted v0.77 development target adds permanent requirement allocations in
[`../requirements/REGISTRY.md`](../requirements/REGISTRY.md). Fixtures cite
those GKOS IDs, while implementation observations remain in non-normative
adapter maps such as
[`adapters/gkos-engine.requirements.json`](adapters/gkos-engine.requirements.json).
The target is authorized for developmental publication, remains non-consensus,
and does not alter the v0.76 package.

## Provisional SRTP graph runner

`runner/srtp-graph.mjs` evaluates the separate `SRTP-DRAFT-0.1` graph fixtures
under `../fixtures/provisional/science/`. It materializes fixture overlays,
validates the provisional scientific trace schemas, tests version coordinates,
and executes cross-record checks. Its report always contains
`profiles_claimed: []`; even an all-PASS run is draft-suite evidence, not a
GKOS conformance or scientific-validity claim.

```sh
cd conformance/runner
npm run srtp:draft
```

## Current qualification boundary

- Fixture catalog 0.1.1 declares no complete qualifying profile. A run therefore
  emits an empty `profiles_claimed` array even when every executable slice passes.
- Declared graph expectations must become executable before a GCP-3 result can support external qualification.
- PASS, FAIL, PARTIAL, and UNEVALUATED are distinct report states; PARTIAL and
  UNEVALUATED are not profile passes. The starter runner currently emits
  per-fixture PASS, FAIL, KNOWN-DIVERGENCE, SKIP, or UNEVALUATED.
- No current implementation has satisfied the v1.0 second-independent-implementation gate.
- Engine-Lite cannot satisfy that gate because using the pinned Engine's deterministic execution path is its compatibility contract.

A future external run must pin the required GCP target, standard and fixture
commits, runner/adapter rule, candidate source, dependency lock, environment,
commands, and raw outputs before execution. See
[TECHNICAL_README.md](../TECHNICAL_README.md) and the
[2026-08-04 critique remediation](../docs/reviews/2026-08-04_CRITIQUE_ASSESSMENT_AND_REMEDIATION.md).

```sh
cd conformance/runner && npm install
GKOS_ENGINE_DIST=/path/to/GKOS-Engine/dist/kosmos-core.mjs \
  node run.mjs --adapter ./adapters/gkos-engine.mjs --attested-by "Your Name"
```
