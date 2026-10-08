# GKX Rebrand and KRS Reassessment — 2026-08-02

## Finding

The OKF+ → GKX rebrand was not complete across the five public Odenknight
repositories. Before this update, case-insensitive repository scans found the
following numbers of files containing OKF+ terminology versus GKX terminology:

| Repository | OKF+ files | GKX files |
|---|---:|---:|
| `gkos-standard` | 17 | 1 |
| `GKOS-Engine` | 25 | 2 |
| `GKOS-Engine-Lite` | 5 | 2 |
| `Kosmos-Oden` | 42 | 2 |
| `Kosmos-Oden-Lite` | 54 | 2 |

The counts are migration indicators, not conformance scores. They show that
GKX appeared principally in attribution language while current normative,
implementation, and product surfaces continued to present OKF+ as canonical.

## Coordinated update

- `gkos-standard`: records the rename and compatibility boundary in development
  decision R11.
- `GKOS-Engine`: presents GKX as canonical while retaining existing OKF+-named
  executable surfaces as compatibility identifiers.
- `GKOS-Engine-Lite`: applies the same compatibility rule and retains the
  `okf-lite` command.
- `Kosmos-Oden`: adopts **Kosmos Research Studio (KRS)** and GKX in current
  product branding and corrects stale package metadata.
- `Kosmos-Oden-Lite`: adopts **KRS-Lite** and GKX, corrects stale package
  metadata, and fixes the manifest repository URL.

Repository names, package names, plugin IDs, source identifiers, `.okf/` paths,
protocol identifiers, historical changelogs, and versioned fixtures are not
silently renamed. Machine-facing changes require a later versioned migration
with aliases and a deprecation window.

## Reassessment

The ecosystem is a substantial distributed implementation whose main risk is
convergence rather than invention. The incomplete naming contract reduces
cross-repository conformance confidence until the normative schemas, fixtures,
engines, and products agree on versioned GKX terminology.

| Area | Estimated maturity |
|---|---:|
| GKOS conceptual pre-standard | 65–70% |
| Deterministic graph/governance engines | 70–80% |
| KRS / Obsidian experience | 65–75% |
| KRS-Lite | 65–75% |
| Governed NotebookLM replacement | 30–40% |
| End-to-end Research Proof Chain | 20–30% |
| Integrated Kosmos Research Studio | 30–40% |

These are engineering estimates, not formal conformance scores.

## Next required work

1. Inventory every externally observable OKF+ identifier.
2. Classify each as display-only, compatible alias, deprecated, or breaking.
3. Publish versioned GKX schemas and fixtures before machine-facing renames.
4. Update engines together and retain documented legacy readers.
5. Add terminology checks to CI.
