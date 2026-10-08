# GKOS ecosystem organization

**Status:** Informative ecosystem policy
**Applies to:** the public repositories listed in the current compatibility matrix
**Authority:** subordinate to the normative GKOS standard and its decision records

## Operating model

The ecosystem is organized by responsibility, not by duplicated capability.

- **Specify:** `gkos-standard` owns GKOS governance and GKX exchange contracts.
- **Implement:** `GKOS-Engine` owns shared deterministic behavior.
- **Distribute:** `GKOS-Engine-Lite` packages a simple, non-Obsidian experience.
- **Present:** `Kosmos-Oden` owns the active reference application.
- **Preserve:** `Kosmos-Oden-Lite` preserves its frozen 1.0.x behavior.

GKX is the current name of the exchange model formerly published as OKF+.
Compatibility identifiers may remain where versioned migration requires them;
new ecosystem prose should use GKX first and describe OKF+ only as a legacy
compatibility name.

## Decision rights

| Decision | Accountable repository | Required consultation |
| --- | --- | --- |
| Normative governance or conformance meaning | `gkos-standard` | Engine and independent implementers |
| GKX schema, identifier, or protocol contract | `gkos-standard` | Engine, `Kosmos-Oden`, Lite distributions |
| Shared deterministic parsing, validation, projection, graph, or export | `GKOS-Engine` | Standard for contract interpretation; downstream consumers |
| CLI/desktop packaging and simplified UX | `GKOS-Engine-Lite` | Engine |
| Obsidian and reference-application behavior | `Kosmos-Oden` | Engine; standard when governance meaning is implicated |
| `Kosmos-Oden-Lite` backport | `Kosmos-Oden-Lite` | Source repository of the fix; `Kosmos-Oden` for migration guidance |

A downstream repository may reject or defer adoption for compatibility reasons.
It may not silently redefine an upstream contract.

## Cross-repository change protocol

1. Classify the change by the table above.
2. Land the authoritative change in the accountable repository.
3. Publish a versioned contract, release, or decision reference.
4. Open linked downstream changes in dependency order.
5. Record intentional divergence, especially for `Kosmos-Oden-Lite`.
6. Do not claim ecosystem-wide completion until every in-scope active consumer
   has adopted the change or documented a deferral.

Security fixes may use coordinated disclosure and reversed merge timing, but the
final public record must still identify the authoritative contract and affected
versions.

## Lifecycle policy

- **Active:** roadmap may include new capability.
- **Thin distribution:** new work must remain packaging, usability, or integration
  of upstream capability; shared semantics return upstream.
- **Frozen:** no feature roadmap. Permitted changes are security, defect,
  data-integrity, compatibility, build/release hygiene, and clarifying
  documentation. Backports are reviewed individually and do not imply parity.

`Kosmos-Oden-Lite` remains maintained but frozen. It must not be used as the second
independent GKOS implementation because it shares lineage and implementation
history with the active product family.

## Documentation minimum

Each repository should state its role, lifecycle, upstream/downstream
relationships, roadmap or maintenance policy, and the distinction between
implementation claims and GKOS conformance. The standard roadmap is the
ecosystem status index; product roadmaps remain local.
