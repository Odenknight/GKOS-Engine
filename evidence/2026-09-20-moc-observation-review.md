# Managed-MOC observation and runtime review — September 20, 2026

Base: `03724fd997fd11b0ebc382e23aa8c21cd0cfb1ec`. Three explicitly requested
Sol subagents audited correctness, developed the observation runner and reviewed
the evidence/docs. The parent reviewed and debugged their changes. Shared agent
storage was unavailable: O: drive absent; UNC shared path not found. No substitute
memory store was created.

## Runtime repair

Failed event admission remains visibly not-ready until an explicit successful
full reconciliation. A no-work timer tick cannot erase that failure. Reconciliation
errors remain not-ready until pending intent clears; failed watchers are closed
and reported inactive while passive reconciliation remains available. Failure to
persist fallback intent during startup closes runtime signals and the host.
Navigation purity, executor authority and no-change receipt encoding are unchanged.

The first integration attempts exposed an ownership-observation race in the
runner and cleanup ordering in new tests. Both were corrected: wait for host
settlement before ownership verification, and shut runtimes down before removing
fixtures even when assertions fail. A later independent review found source-drift
errors lost original bindings/partial rows; a regression now verifies preservation.
These failed draft attempts are not qualification passes.

## Measured synthetic observations

Native Windows, Node v24.18.0, one managed MOC. All observations verified the
written digest against a fresh deterministic plan. These are small smoke samples.

| Source notes | Samples | Slowest observed convergence |
| --- | --- | --- |
| 100 | 3 | 1,062.09 ms |
| 2,000 | 3 | 1,359.44 ms |
| 10,000 | 3 | 3,023.25 ms |
| 50,000 | 3 | 12,664.90 ms |

The [raw scale receipt](2026-09-20-moc-scale-observation.json) binds the exact
dirty candidate and module hashes. Its runner predates the source-drift failure
report repair; the successful observation path is unchanged. The
[restart receipt](2026-09-20-moc-restart-observation.json) uses the repaired runner:
11 edits, three restarts, 32.24 seconds of observation, slowest sample 1,381.44 ms.
Both receipts explicitly retain `release_qualified: false`.

Commands:

```text
node scripts/qualify-managed-moc.mjs --tiers 100,2000,10000,50000 --samples 3 --timeout-ms 120000 --output ../moc-scale-observation-20260920.json
node scripts/qualify-managed-moc.mjs --tiers 2000 --samples 3 --soak-seconds 30 --restart-every 3 --timeout-ms 120000 --output ../moc-restart-observation-20260920.json
```

The baseline no-change/host/executor suite passed 86/86 before changes. After
the repairs, the combined host/runner suite passed 18/18; build and typecheck
passed. Subsequent exact-commit CI is separate evidence, not implied here.

## Limits and remaining work

No qualified P95, 50-note burst, incremental parsing, 24-hour soak, physical
power-loss guarantee, consumer acceptance, immutable release or conformance
claim follows from these results. The synthetic snapshot rereads all fixture
notes. Resource telemetry is sampled without release budgets. The earlier
12,648.90 ms graph-watcher result describes a different path and is not superseded
by this MOC observation. See the [runner guide](../docs/MANAGED-MOC-OBSERVATION.md)
and [remaining-work ledger](2026-09-20-moc-remaining-work-review.md).
