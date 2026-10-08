# Versioning

The canonical versioning policy for all GKOS repositories lives in
[`gkos-standard/VERSIONING.md`](https://github.com/Odenknight/gkos-standard/blob/main/VERSIONING.md).
This file is a pointer; the standard governs.

## Rule for this repo (GKOS-Engine)

- The engine is the version root. Semver `vX.Y.Z`, annotated git tag per release.
- `package.json` `"version"` and `ENGINE_VERSION` in `src/version.ts` are bumped
  together and must always match; the tag must match both.
- Downstream consumers pin the engine by tag and own their release cadence.
  An Engine release does not itself advance GKOS-Engine-Lite or any other
  frozen consumer's exact Engine pin.
