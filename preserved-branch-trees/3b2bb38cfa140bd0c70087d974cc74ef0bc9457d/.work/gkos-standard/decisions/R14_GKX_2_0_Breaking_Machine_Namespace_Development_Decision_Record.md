# R14 — GKX 2.0 Breaking Machine Namespace Development Decision Record

**Status:** Accepted developmental decision; non-consensus

**Release target:** GKOS-2026-08-05 v0.78

**Classification:** Breaking technical revision

## Decision

GKX 2.0 is the only current machine namespace governed by GKOS. New and
updated implementations, schemas, fixtures, adapters, examples, and operational
guidance MUST use `gkx_version`, `.gkx/`, `GKX-*` diagnostics, and the `gkx`
command. Public implementation APIs use `Gkx*` names.

No reader, writer, command, diagnostic, profile, schema, path, or API alias is
adopted for the prior machine namespace. A product that needs the 2.0 contract
MUST migrate its stored records and integrations before making a claim against
this release.

## Supersession and preservation

This decision supersedes the machine-identifier preservation policy in R11 and
R12. It does not alter immutable historical release directories, prior signed
artifacts, or their recorded contents. Those materials remain historical
evidence and are not current GKX 2.0 conformance inputs.

## Conformance boundary

This is an owner-authorized v0.x developmental decision. It is not a consensus
ratification, independent certification, qualifying profile result, or claim
that every frozen portfolio repository has migrated. Active consumers migrate
through their own authorized releases; frozen repositories remain preserved.
