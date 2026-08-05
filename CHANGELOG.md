# Changelog

## 1.3.0

- Established **GKOS-Engine** as the canonical product name and **GKX 2.3** as
  the schema/model name across runtime output, package metadata, documentation,
  and source-facing APIs. Protected compatibility identifiers remain unchanged:
  `okf_version`, `.okf/`, `OKF-*` diagnostic codes, the `okf` binary, and
  existing `Okf*` TypeScript exports.
- Added the canonical `dist/gkos-engine.mjs` package entry point and public
  `gkos-engine/adapter`, `gkos-engine/gkx`, and `gkos-engine/graphiti` subpaths.
  The immutable, framework-neutral `createGkosEngineAdapter()` lets downstream
  products inject parsing, full graph builds, and incremental indexes without
  importing Engine internals. The historical `dist/kosmos-core.mjs` path remains
  as a compatibility entry point.
- Added canonical GKX aliases for supported parser, projection, assessment,
  relation, graph, and incremental-index APIs.
- Newly authored identities now default to lowercase RFC 9562 UUIDv7. Migration
  preserves valid lowercase UUIDv4 and UUIDv7 identities, rejects namespaced
  identifiers as authored note UIDs, and continues to allow namespaced
  relationship and evidence targets.
- Preserved every valid direct-successor lineage branch. A predecessor's
  `invalid_at` now uses the earliest direct-successor timestamp that is not
  earlier than the predecessor, without selecting an authoritative branch.
- Added non-normative traceability from Engine behavior and tests to the
  permanent GKOS conformance, identity, and lineage requirement identifiers.
  This mapping is implementation evidence, not a GCP profile or conformance
  claim; the associated GKOS v0.77 standard target remains unpublished.
- Clarified that downstream consumers own their release cadence and exact pins;
  publishing this Engine version does not advance GKOS-Engine-Lite or another
  frozen consumer.

## 1.2.0

- **BREAKING (projection output):** `refines`, `blocks`, and `documents` are now
  first-class relations in the 2.3 projector. They were valid relations in
  `src/okf.ts` and the `gkos-standard` relationType enum, and were listed in
  `LEGACY_FIELDS`, but were missing from `okf23.ts` `RELATION_TYPES` — so
  `splitRelations()` and the flat editable-Property merge silently DROPPED any
  `refines:`/`blocks:`/`documents:` edge projected from a 2.3 note. They now
  project forward and generate inverse edges `refined_by` / `blocked_by` /
  `documented_by` (following the standard's `_by` inverse convention, mirroring
  `supersedes`→`superseded_by` and `contradicts`→`contradicted_by`). Graphs of
  vaults using these relations gain edges that were previously absent.
- **BREAKING (migration output):** the 12→5 epistemic down-map in
  `editableEpistemicState()` is now epistemically humble. Previously the
  unasserted 2.3 states `unknown`/`observation`/`reported` (and `accepted`) all
  migrated to `fact`, silently promoting unasserted content to fact status. Now
  `unknown`/`observation`/`reported`/`contested` migrate to `hypothesis`,
  `accepted` migrates to `fact`, and `supported` migrates to `verified_inference`.
  A note that used to migrate to `fact` may now migrate to `hypothesis`.
- Fixed the `test:intelligence` npm script: `python -m unittest discover` ignored
  the pytest-only `pythonpath` in `pyproject.toml` and failed out-of-box with
  `ModuleNotFoundError: gkos_intelligence`. It now runs `python -m pytest
  services/gkos-intelligence`, which honors `[tool.pytest.ini_options]
  pythonpath = ["src"]`. (Requires `dspy>=3.0,<4` for the 4 contract tests.)

## 1.1.2

- Documented that `OKF23_POLICY.sensitivityDefault` is a hash-locked mirror of
  the canonical policy JSON and is superseded for the missing-sensitivity path,
  which has failed closed to `secret` since v1.0.6. No behavior change.
- Added a VERSIONING.md pointer to the canonical policy in `gkos-standard`.

## 1.1.1

- Added cross-arch SEA support to `scripts/build-sea.mjs` via
  `--target-arch x64|arm64`: on macOS the arm64 runner can now produce the
  `x86_64-apple-darwin` sidecar. Cross builds download the official
  nodejs.org tarball for the target arch instead of copying the host node.
- Verified every downloaded Node tarball against the sha256 published in the
  same release's `SHASUMS256.txt`; a missing or mismatched entry aborts the
  build — there is no unverified fallback path.
- Handled the Mach-O signature on the downloaded binary: the upstream
  signature is removed before injection and an ad-hoc signature applied after
  (`codesign` is arch-agnostic, so an arm64 host can do both to an x86_64
  binary). Windows Authenticode stripping and host-arch behaviour unchanged.
- Extracted the argument parsing, target/triple resolution, dist URL
  construction and checksum lookup into `scripts/sea-target.mjs` and covered
  them with network-free unit tests.
- Moved the sidecar-release Intel macOS leg off the `macos-13` /
  `macos-15-intel` runner pool onto `macos-latest`, removing the queueing
  dependency that left `kosmos-agent-x86_64-apple-darwin` unpublished in
  v1.0.8 and v1.0.9 (fixes #9).
- Tightened the release smoke test: each leg asserts its exact expected asset
  name, and macOS legs additionally verify the Mach-O arch and the ad-hoc
  signature.

## 1.1.0

- Added the `gkos.intelligence.v1` request, response, and proposal contract.
- Added deterministic proposal validation with restricted patch fields and
  raise-only sensitivity.
- Added an optional loopback Python/DSPy proposal sidecar with no write or
  approval capability.
- Added TypeScript and Python contract tests.
- Preserved offline deterministic operation when the sidecar is absent.
- Added CI coverage for the Python contract, wheel installation, npm package
  contents, and the SEA executable wrapper.
- Added meaningful `kosmos-agent --help` output and made release smoke tests
  reject a silent or non-functional executable.
- Made intelligence health reporting distinguish `ready` from
  `needs_configuration`.
- Updated the build-only esbuild dependency to a patched release; npm audit is
  clean.
