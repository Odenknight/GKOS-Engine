## Purpose

Reconcile the preserved experimental Navigation Effects plane onto the exact post-PR #39 Engine `main`, then correct successive-target startup recovery without granting activation, release, writer, or Standard authority.

## Coordinates

- accepted base: `18c53b8d553d75f03c52310f06e3c60f20f6068b`
- preserved Effects source: `e4f00b3a9289c1d35d1a02e50dcdc266945fe015`
- rebased Effects replay: `5a4df27ee1892b29ba4461b786723f60e5756db7`
- first hosted-qualified head: `c6c7cf828246c1a010fc3238a6ec803b42fdc068`
- recovery correction: `de9ea0b909ba4d7e48e365470ad51443e371c9b6`
- final evidence-binding head: `d19ccfee1d971f1e282f886562a3809924a8a8a2`
- evidence: `evidence/2026-09-04-navigation-effects-current-main-reconciliation.md`

## Recovery correction

Review found that startup compared live target bytes with every historical committed effect. A valid later effect or rollback on the same target therefore caused a false `COMMITTED_TARGET_CORRUPT` result for its predecessor.

The correction validates all historical receipt/archive evidence, checks live bytes against the newest committed target head, recovers later interrupted transactions, and preserves fail-closed detection for latest-target tampering and stale/aborted successor masking. Regression coverage includes successive writes, interrupted replacement, rollback restart, superseded replay, and target tampering.

## Local qualification

- current-runtime inventory check: PASS
- focused Navigation/Effects/public/compatibility suite: **133/133 pass**, zero fail/skip
- typecheck and build: PASS
- license and nomenclature: PASS
- package contents: PASS — 572 files, 6,606,089 bytes
- serialized current suite: **1,036/1,037 pass**; the unchanged load-sensitive `watcher-large-restart` shutdown deadline failed and also failed once in isolation on Windows Node 24

The local watcher failure is preserved rather than waived. Fresh hosted blocking Ubuntu/Windows Node 22 and 24 qualification must pass at exact final head `d19ccfe` before merge. Node 23 remains informative.

## Authority boundary

This remains an experimental, additive, default-disabled library/Node-adapter plane. Draft.2 MCP remains seven-tool and read-only. The structural `AgentGrant` is not bound to the authority database, authentication epoch, live session, or current credential status. Merge does not authorize activation, release, tag, deployment, owner-data writes, writer activation, automatic MOC application, Standard conformance, or TypeScript retirement.
