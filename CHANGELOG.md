# Changelog

## 1.1.3

- Reissued the intended 1.1.2 maintenance contents as 1.1.3 because the
  v1.1.2 tag and release had already been consumed by unrelated parallel work.
- Synchronized package.json, package-lock.json, and ENGINE_VERSION at 1.1.3.
- Canonical release commit: `72c4a3268c9db132f2f9dd5aaa7eb7075e6bab2a`.

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
