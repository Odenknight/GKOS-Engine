# Changelog

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
