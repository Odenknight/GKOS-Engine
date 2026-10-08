# GKOS ecosystem compatibility matrix

Ratified by operator: 2026-07-23 · refreshed 2026-07-27 against the current
ecosystem state.

One-page train status per [VERSIONING.md](VERSIONING.md). This file is a
factual snapshot, not a normative document — it does not amend
`standard/`, `releases/`, or `decisions/`.

Engine-Lite's one-minor allowance is a maximum current-release drift, not the
normal cadence. Its deterministic claims are relative to the exact pinned
Engine and policy. A frozen product baseline is governed separately and does
not inherit that current-release allowance. See
[R12](decisions/R12_Ecosystem_Compatibility_Development_Decision_Record.md).

| Repo | Shipped version | Engine relation | Last verified |
|---|---|---|---|
| GKOS-Engine | v1.2.0 (HEAD tagged) | is the anchor | 2026-07-27 |
| GKOS-Engine-Lite CLI | v1.1.3, pin `#v1.1.3` (SHA-resolved) | lags anchor by one minor (engine now v1.2.0); engine-verbatim bump pending | 2026-07-27 |
| GKOS-Engine-Lite desktop | desktop-v0.2.0 | bundles the CLI/engine pin above; own packaging namespace | 2026-07-27 |
| Kosmos-Oden | 0.7.0 | engine pin `#v1.1.2` (SHA-pinned); lags anchor, aligned opportunistically | 2026-07-27 |
| Kosmos-Oden-Lite | 1.0.6 | vendored `src/core` at engine v1.0.7 parity (drift-checked) | 2026-07-27 |
| Kosmos_Research_Suite | keymap authority v1.1.3 | keymap key-surface unchanged v1.1.3→v1.2.0; refresh pending next sweep | 2026-07-27 |
| Kosmos_Research_Studio_Lite | v0.3.2 | Independent-origin candidate; current GKOS qualification not established (audit blocked/indeterminate) | 2026-08-03 |

**Engine v1.2.0 (2026-07-27)** fixed three diagnosed bugs: added `refines`/
`blocks`/`documents` to the 2.3 projection `RELATION_TYPES` + inverses (was
silently dropping them — `BREAKING` for relation projections); corrected the
12→5 epistemic down-map so unasserted states (`unknown`/`observation`/
`reported`) map to `hypothesis` not `fact` (`BREAKING` for 2.2 migration); and
fixed the `test:intelligence` npm script. Consumers pinned below v1.2.0 are
unaffected until they adopt it.

## How to update this file

One row-edit per release: when a repository ships, update its row — shipped
version, engine relation, and last-verified date — in the same PR as the
release. Do not batch multiple repositories' updates into one edit unless
they released together. If a "→ in progress" note resolves, replace it with
the landed value and refresh the date.
