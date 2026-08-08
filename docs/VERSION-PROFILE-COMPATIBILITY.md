# Version and profile compatibility

These values name different layers. They are intentionally not synchronized,
and the Engine never rewrites stored data merely to make their numbers match.

| Machine value | Category | Meaning | Compatibility disposition |
| --- | --- | --- | --- |
| `gkos-engine` `2.0.1` | Package version | Current npm/Engine release identity. | Must match `ENGINE_VERSION` and `package.json`; no future release is preassigned. |
| GKX `2.0` | Public exchange namespace | Breaking 2.x public naming generation (`gkx_version`, `.gkx/`, `GKX-*`, `Gkx*`). | Remains the public namespace; it is not a record-schema declaration. |
| `gkx-2.0-validating-projection` | Current draft-suite projection coordinate | Projection coordinate named by `SRTP-DRAFT-0.1` in the provisional standard matrix. | Used only for draft-suite compatibility evaluation; it does not rewrite the existing Engine API. |
| `gkx-2.3-validating-projection` | Historical Engine projection identifier | Existing serialized origin-preserving validation/assessment projection. | `GKX23_PROFILE` and stored evidence retain it; it is not silently rewritten. |
| `buildGkx23Projection` | Public API identifier | Existing builder for that projection. | Retained without aliasing or silent migration. |
| `2.2` in type/parser comments and migration code | Historical record version | Legacy flat GKX record compatibility, not the Engine/package version. | Read/migration behavior remains supported and source-preserving; comments label it explicitly as legacy. |
| `SRTP-DRAFT-0.1` | Provisional application-profile handle | Non-normative Scientific Research Trace Profile workspace draft reviewed over standard base commit `351330ce34ac6bf9f48ac340e3c259ea30e74715`. | Available only through `experimentalScience`; fixture catalog `SRTP-DRAFT-FIXTURES-0.1.1` (manifest SHA-256 `ed9cc63b50ecf332b96c576af9139370a1c708b6145224d881cafefdde8aa651`) is non-qualifying. |

The SRTP identifier is deliberately dated and marked experimental. Standard
adoption, a normative profile identifier, and a package release version remain
separate release decisions.
