# Managed-MOC durable no-change audit (2.2)

The Node managed-MOC host explicitly requests audit execution for byte-identical
plans. Pure planning callers retain their existing no-op return by default.
`recordNoChange: true` requires a 64-hex reconciliation run ID. The host derives
that ID from its durable reconciliation intent and host revision. Each operation
binds the exact source snapshot, corpus, policy, configuration, authority and
ownership. Retries of the same execution request retain the same effect ID,
receipt bytes and journal sequence.

The existing executor performs live authority and target-byte checks under its
target lock. An unchanged operation creates no source replacement, before-image
archive or consumer source-change notification. It persists a separate versioned
`engine.managed-moc-no-change-receipt` beneath `.gkx/effects/no-change/`, then the
existing Effects receipt, then a terminal journal entry binding the Effects
receipt digest. The frozen Effects contract files are unchanged.

The new receipt contains actor, authority, ownership, source/corpus/configuration
and policy coordinates, exact evaluated-plan digest, `NO_CHANGE` disposition,
timestamp and sequence, resulting source-state digest, reconciliation linkage,
and the storage protocol/result. Its canonical digest seals all fields. Full
source content is excluded. The receipt is authoritative only together with the
matching terminal journal entry and verified plan/Effects receipt; a partial
audit file alone is not durable completion.

No-op timestamps use the durable journal anchor, so restart does not invent a
different timestamp or rewrite an existing audit. Native process exit is tested
after RECEIVED, PLANNED, PREPARED, audit persistence and Effects receipt
persistence. Recovery revalidates authority and current bytes before completing
an interrupted no-op. Missing/corrupt committed audits refuse startup. Actual
filesystem destination failures retain a recovery-required receipt and never
append COMMITTED for the failed no-op.

The storage guarantee is exclusive file creation, file sync and readback, with
terminal journal binding. It does not claim directory-entry fsync, hostile
ancestor-swap protection or physical power-loss durability. Partial/corrupt
artifacts are retained for explicit reconciliation; they are not silently
recreated. General executor and host state durability limitations remain in
effect. Comprehensive platform durability and the 24-hour release soak remain
mandatory separate gates.

Native focused verification:

```text
npm ci
npm run typecheck
npm run build
node --test test/managed-moc-no-change.test.mjs test/navigation-effects-host.test.mjs test/navigation-effects-node.test.mjs
```
