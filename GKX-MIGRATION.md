# GKX naming and compatibility migration

GKX (Governed Knowledge Exchange) is the current name for the technical model
formerly published as OKF+. This engine adopts GKX in current-facing prose
without breaking the existing executable contract.

For the current release line:

- OKF+ 2.2 and 2.3 documents remain accepted inputs.
- `okf`-named modules, types, commands, fields, adapters, and paths remain stable
  compatibility identifiers.
- Consumers should display GKX as the canonical name and identify OKF+ as the
  legacy/compatibility name where needed.
- Historical changelog entries and versioned fixtures retain their original
  terminology.

Machine-facing renames require a later versioned schema and deprecation plan.
They must not be inferred from this display-name transition.
