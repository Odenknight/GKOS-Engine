# GKOS ecosystem versioning policy — "one train, four cars"

Ratified by operator: 2026-07-23

## Purpose

This document is the single cross-repository versioning policy for the GKOS
ecosystem. It governs how GKOS-Engine, GKOS-Engine-Lite, Kosmos-Oden, and
Kosmos-Oden-Lite version themselves relative to one another, and how
downstream consumers should pin to them. It does not amend `standard/`,
`releases/`, or `decisions/`, and it does not itself constitute a governance
or Development Decision Record — it records an operational policy adopted
during the v0.x development period.

## The model: one train, four cars

There is exactly one version anchor for GKX 2.0 semantics: **GKOS-Engine**.
Everything else is a car on that train — it either adopts the engine's
version directly, or tracks the engine's version and derives its own from
it. No other repository is permitted to define GKX-observable semantics
independently of the engine.

## SemVer, sharpened

All four repositories use SemVer (`MAJOR.MINOR.PATCH`), with one
ecosystem-specific sharpening of the normal rule:

> **Any behavior change observable in projections is at least a MINOR bump,
> and MUST carry a `BREAKING:` changelog marker.**

"Observable in projections" means: a viewer, projector, or downstream
consumer processing the same input document can obtain a different result
after the change. The canonical example is the v1.0.6 fail-closed
sensitivity default flip (`internal` → `secret`) — this changed no schema
and no API surface, but it changed what a viewer produces for the same
input, so it was MINOR with a `BREAKING:` marker, not a patch.

**Patch** is reserved for changes with *identical* observable behavior:
performance, refactors, internal logging, comments, build tooling,
non-observable bug fixes that only correct behavior already specified but
never actually reachable.

If there is any doubt whether a change is observable, treat it as MINOR.

## HEAD and tagging discipline

- `HEAD` on `main` MUST equal the newest tag, except during an active,
  in-progress release (tag-repair, pin-bump, or cut in flight).
- Every version-bump commit MUST be tagged the same day it is merged. A
  version bump without a same-day tag is a policy violation and blocks the
  next release until corrected.
- Tags are the source of truth for "what shipped." A pin, changelog entry,
  or README claim that disagrees with the tag graph is wrong by definition.

## CI gates

Every release-bearing PR/CI run MUST enforce:

1. **Changelog entry required per release** — no version bump merges
   without a corresponding dated changelog entry (and a `BREAKING:` marker
   if applicable).
2. **README version current** — the version string surfaced in each
   repository's README MUST match its newest tag before merge.

## Per-repository rules

### GKOS-Engine-Lite (CLI)

Adopts the engine version **verbatim**. A CLI release is a same-day
pin-bump to the new engine version plus a matching `vX.Y.Z` tag — the CLI
never carries its own MAJOR.MINOR.PATCH distinct from the engine it wraps.

The **desktop app** is a separate product with its own namespace,
`desktop-vA.B.C`, and does not inherit this verbatim rule; it tracks the
CLI/engine pin it bundles but versions its own packaging independently.

### Kosmos-Oden

Bumps **MINOR** whenever its engine pin moves to a new engine MINOR (or
higher). Bumps **PATCH** for product-only fixes that do not move the engine
pin. Kosmos-Oden retains its own tag convention — exact manifest version,
no `v` prefix — per its `docs/RELEASE-PROCESS.md`; this policy governs the
version *number*, not the tag string format.

### Kosmos-Oden-Lite

**Patches-only, forever, on the 1.0.x line.** Kosmos-Oden-Lite never adopts
an engine MINOR or feature. When an engine PATCH-grade fix is worth having,
it is manually backported into Lite's vendored `src/core`, tracked against
an explicit **intentional-delta allowlist**, and verified by a CI
**drift-check** that fails if vendored core diverges from the allowlist.
Engine minors and features are never backported, by design — Lite's
contract is behavioral stability, not feature parity.

## Downstream consumers

- **Kosmos_Research_Suite** pins to the engine as its keymap authority
  (frontmatter-keymap re-pin). A Suite re-pin follows the same
  changelog/README CI gates as any other version-bump commit.
- **Kosmos_Research_Studio_Lite** must pin any future GKOS conformance claim to
  an exact standard, requirement, fixture, runner, and evidence baseline. Its
  current independent-implementation audit is blocked/indeterminate, so no GCP
  qualification is established. A later claim change requires an explicit
  product release record even if its own version only moves PATCH.

## Precedence

If any per-repository release process document conflicts with this
policy on version *semantics* (what triggers MINOR vs. PATCH, or the
projection-observability rule), this document controls. Repository-local
process documents remain authoritative for tag string format, release
mechanics, and ceremony.
