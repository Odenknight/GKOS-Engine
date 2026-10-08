# GKOS/GKX implementation version compatibility matrix

**Status:** developmental orientation; informative, not normative

This matrix keeps publication versions, machine namespaces, projection
profiles, package versions, and implementation API symbols separate. Matching
numbers across those coordinates are not implied.

| Coordinate | Current reviewed value | Meaning | Compatibility rule |
| --- | --- | --- | --- |
| GKOS publication | `GKOS-2026-08-05 v0.78` | Developmental standard publication | Governs the current repository guidance |
| GKX namespace | `2.0` | Serialized machine namespace | Current records use `gkx_version: "2.0"` and `.gkx/` |
| standard assessment / SRTP projection coordinate | `gkx-2.0-validating-projection` | Standard schema value and SRTP fixture coordinate | Current SRTP traces use this exact coordinate |
| Engine validating projection profile | `gkx-2.3-validating-projection` | Separately versioned Engine implementation profile | Current Engine public surface; it is not the GKX namespace or an alias for the SRTP coordinate |
| GKOS-Engine package | `2.0.1` | Reference implementation release | Reviewed at commit `7c742436d50b34f6dda66976212a672fb51f7c21` |
| adapter API symbol | `buildGkx23Projection` | Current Engine API symbol retained by the informative adapter | Not a namespace or profile version; its name grants no compatibility |
| SRTP application profile | `SRTP-DRAFT-0.1` | Provisional scientific trace experiment | Requires its explicitly listed compatibility coordinates; never a qualifying profile |
| SRTP fixture catalog | `SRTP-DRAFT-FIXTURES-0.1.1` | Provisional graph-evaluation suite | SHA-256 `ed9cc63b50ecf332b96c576af9139370a1c708b6145224d881cafefdde8aa651` |

The two projection identifiers are intentionally recorded as distinct current
coordinates. Neither may be inferred from the GKX `2.0` namespace, substituted
for the other, or silently rewritten. Persisted identifiers retain their bytes
and provenance; an explicit migration produces a new record while preserving
the historical source.

The machine-readable companion is
[`../../conformance/provisional-requirements/version-compatibility.matrix.json`](../../conformance/provisional-requirements/version-compatibility.matrix.json).
The SRTP draft runner tests every trace against its declared compatible tuple.
