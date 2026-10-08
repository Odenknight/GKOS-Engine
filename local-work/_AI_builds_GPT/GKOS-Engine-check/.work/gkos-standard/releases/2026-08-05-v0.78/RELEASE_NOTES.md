# Release notes — GKOS-2026-08-05 v0.78

## Breaking change

R14 adopts GKX 2.0 as the complete current machine namespace. The active
standard surface uses `gkx_version`, `.gkx/`, `GKX-*` diagnostics, and `gkx`.
The current schema and conformance adapter surface no longer adopts aliases for
the prior namespace.

The reference implementation is `gkos-engine` 2.0.1 at commit
`7c742436d50b34f6dda66976212a672fb51f7c21`.

## Status and boundary

This is an owner-authorized developmental v0.x release. It is non-consensus,
not independently certified, and does not certify an implementation or migrate
frozen repositories. Active consumers must migrate through their own authorized
releases. Prior release packages are immutable historical evidence.
