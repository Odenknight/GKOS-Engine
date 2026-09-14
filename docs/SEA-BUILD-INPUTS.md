# SEA build-input inventory

`node scripts/build-sea.mjs` writes a sibling `<executable>.build-inputs.json`
after the executable is built. The sidecar workflow collects both files.
An existing inventory causes refusal before generated SEA files are changed;
run the normal JavaScript build to prepare a fresh `dist` directory.

The schema-1 record binds observed lengths and SHA-256 values for the final
executable, the base Node binary before signature removal, the pre-injection
binary, CJS entry, SEA configuration/blob, JavaScript bundle inventory,
embedded native assets and manifest, build scripts, package/lock files,
postject CLI/package metadata, and the host Node executable. It distinguishes
the host blob-generator version from the target Node version. Downloaded Node
records include the checksum comparison actually performed; host Node records
do not claim upstream download provenance.

Stable inputs are captured before use and rechecked before publication.
The admitted native asset map must retain its keys and paths. The final
executable is rehashed before the inventory is exclusively created.
These are observations in an owned build workspace, not an atomic filesystem
snapshot or protection against an adversary changing and restoring inputs
between observations. Intermediate binary hashes are observed at their named
build phases; the intermediate binary copies are not retained.

Logical names avoid absolute host paths and the record has no timestamp.
Hashes still cover actual configuration bytes, which contain build paths;
this is not a claim of reproducibility across directories or toolchains.
Hash binding does not authenticate source identity, release admission, or
signature provenance. The record is not an execution qualification receipt.

`completeSbom` remains false. Node-internal components, component relationships,
license evidence and complete SPDX generation remain separate work. A portable
consumer must independently bind the inventory to its admitted executable;
consumer-side ingestion and validation are not provided by this producer change.
