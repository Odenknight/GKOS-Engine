# Managed-MOC synthetic observations

This runner observes the Node managed-MOC runtime, including filesystem signals,
debounce, snapshot reads, deterministic planning, source replacement and the
commit callback. It uses a temporary synthetic vault, never an owner vault.
It is not the separate derived-state retrieval/graph watcher benchmark.

Build first, then run serially with other benchmarks:

```text
npm run build
node scripts/qualify-managed-moc.mjs
node scripts/qualify-managed-moc.mjs --tiers 100,2000,10000,50000 --samples 3 --timeout-ms 120000 --output ../moc-scale.json
node scripts/qualify-managed-moc.mjs --tiers 2000 --samples 3 --soak-seconds 30 --restart-every 3 --output ../moc-restart.json
```

Use a new output filename outside the checkout; existing files are not
overwritten. Do not edit source or rebuild during an observation. Receipts bind
the commit, dirty working content and executable module hashes before/after the
run. Source changes fail the observation and retain the original evidence.
Failed fixtures are retained for diagnosis. Successful fixtures are removed only
after clean shutdown and temporary-directory boundary validation.

The fixture stays at its selected source-note count. Each sequential edit changes
one title. After the commit callback, the runner waits for coordinator settlement,
reads the written MOC, and independently replans against current sources and
adopted ownership. The proposed digest must match the written bytes. Replanning
is outside the latency sample. Source-read counters include verification reads;
they are not parser invocations or incremental-index measurements.

The receipt records raw latencies, sampled RSS/active resources and coordinator
pending/active observations. These booleans are not exact queue-depth telemetry.
At most the first 10,000 latencies are retained; statistics are explicitly labeled
for that retained prefix. There are no release acceptance budgets in this runner.

An explicit `--soak-seconds 86400` observes the final selected tier for at least
24 hours. Even then the result is only `OBSERVED_24H_SYNTHETIC`:
`release_qualified` remains false. This sequential workload does not certify
burst/rename/delete behavior, journal retention, bounded long-term resources,
physical power loss, production authorization or downstream integration.

See the [September 20 results](../evidence/2026-09-20-moc-observation-review.md)
and [remaining-work ledger](../evidence/2026-09-20-moc-remaining-work-review.md).
