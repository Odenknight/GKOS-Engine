# JavaScript bundle input inventory

The build emits dist/bundle-inputs.json with the actual esbuild graph for each
JavaScript compilation and the exact bytes/hash of every generated .mjs/.cjs file.
Each artifact lists its matching compilation records. This includes the separate
source scanner and both desktop-agent module formats.

The inventory binds the package manifest, lockfile, build script, and esbuild version.
Paths are relative to the build root. It contains no timestamp or private host path.
The dist directory is included in the npm package, so consumers can inspect this
inventory instead of guessing internal components from the already bundled module.

Run npm run build, then node --test test/bundle-inputs.test.mjs.
The check requires coverage of every emitted JavaScript artifact, validates hashes
and sizes against disk, and checks that every compilation belongs to an artifact.
Package checking also passes with the generated inventory included.

The initial checked build produced 23 bundles. Every bundle hash matched the
pre-inventory build. This changes build evidence, not runtime JavaScript behavior.

Scope is javascript-bundles-only. completeSbom remains false. Type declarations,
native binaries, embedded runtimes, dependency licenses, signatures and source
snapshot attestation require separate evidence. An input graph and matching digest
are not a complete SBOM or release approval. Existing pinned consumers need a
new qualified Engine artifact before they can rely on this inventory.
