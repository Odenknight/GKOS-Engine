# GKOS-Engine 2.1.2 corrective verification

**Status:** Real local execution evidence; not a GKOS/GCP conformance claim

**Implementation commit:** `0545f92d03ba940d516487b600d8bef3469eae06`

**Implementation tree:** `4af707b97a7d3176e1ec813c0d4e82b4db00604f`

**Baseline commit:** `eda989c4563e6d53cd223b1794a0089d0d86920a`

**Executed:** 2026-08-20, America/New_York

## Runtime

- Windows NT `10.0.26200.0`
- Node.js `v24.18.0`
- npm `11.16.0`
- Python `3.14.2`

Node 22 and 23 were not locally executed in this record. The repository CI
matrix is configured to run the release checks on Linux with Node 22, 23, and
24; its status is separate GitHub-hosted evidence after push.

## Corrective fixture bytes

The CLI duplicate-identity regression wrote these exact UTF-8 bytes (LF line
endings, no BOM):

```text
---
uid: 123e4567-e89b-42d3-a456-426614174777
sensitivity: public
---
ONE-SECRET-BODY
```

- byte length: `86`
- SHA-256: `2dff96e0b232d1270d3bb52e494f39b3d53bf3d5d61d59746c6f9e13e3d45b12`

```text
---
uid: 123e4567-e89b-42d3-a456-426614174777
sensitivity: public
---
TWO-SECRET-BODY
```

- byte length: `86`
- SHA-256: `6d02e6faf44c4ba34a78e8d991377ac8cb2fabeffbf5487ecb92664c07013c3e`

The real execution returned CLI exit code `3`, reason codes
`GKX-IDENTITY-003` and `GKX-IDENTITY-004`, and no fixture path, UID, title, or
body in stdout/stderr. The embedded library returned the same reason codes.

## Commands and results

All commands below were executed against the implementation tree above.

| Command | Exit | Result |
| --- | ---: | --- |
| `npm ci` | 0 | 7 packages installed/audited; 0 vulnerabilities |
| `npm run build` | 0 | core, subpath, desktop, and declaration outputs built |
| `npm run typecheck` | 0 | TypeScript no-emit check passed |
| `npm test` | 0 | 245 tests; 244 pass; 0 fail; 1 explicit external-fixture skip |
| `npm run test:navigation` | 0 | 44 tests; 44 pass; 0 fail; 0 skip |
| `npm run test:intelligence` | 0 | 4 tests; 4 pass |
| `npm run pack:check` | 0 | 151 files; 393,320 bytes before adding this evidence file |
| `npm run check:license` | 0 | Apache-2.0 metadata consistent |
| `npm run check:nomenclature` | 0 | zero unapproved matches in tracked/generated release content |
| `git diff --check` | 0 | no whitespace errors |
| `git diff --exit-code` | 0 | no tracked working-tree changes after implementation commit |

The one Node-suite skip explicitly requires external catalog
`SRTP-DRAFT-FIXTURES-0.1.1` at the path printed by the test. It is not counted
as a pass and is unrelated to the Navigation correction.

## Scope and non-claims

This record uses synthetic fixtures only. It does not assert duplicate UIDs,
lineage defects, schema line errors, or supersession failures in an owner's real
corpus. It does not replace or rewrite the 2.1.1 package, tag, commit, or
evidence. The evidence-bearing commit is a later documentation/package-content
commit; the exact corrective implementation evaluated here is the commit and
tree bound at the top of this record.
