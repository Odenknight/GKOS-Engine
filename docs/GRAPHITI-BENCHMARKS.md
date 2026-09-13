# Predeclared native diagnostic baseline

The [plan](../contracts/graphiti/benchmark-draft1/plan.json) fixes sizes, repetitions,
concurrency and numeric limits before measurement. Keep its commit and byte digest
with results; changes to a failed budget create a new plan, never rewrite the old
result. The runner uses actual Engine chunking, SQLite generation construction,
retrieval coordination and source citation reads, not a substitute search loop.

```sh
node scripts/benchmark-graphiti-native.mjs --engine /absolute/clean/engine-checkout --scale 1000 --output /outside/checkout/native-1000.json
```

Repeat with 10000 and 50000. Each invocation performs five fresh index builds and
20 queries at each concurrency 1, 4 and 16 per build. Receipts retain every query,
including errors, p50/p95/p99, per-concurrency p95, database size, process peak RSS,
hardware/runtime, source manifest, exact Engine commit, built artifact, plan and
runner digests. Fixtures remain in the recorded temporary directory for inspection;
the script does not recursively delete them. Do not run alongside a competing
benchmark or heavy test suite when establishing a comparable baseline.

Exact-identifier queries have one known relevant source. Their Recall@10 and
nDCG@10 are diagnostic checks, not evidence of semantic value. First-query-after-open
is recorded separately from subsequent queries; this does not flush the OS page
cache or constitute a machine-cold benchmark. Report that distinction when comparing.

Paid-model calls are absent in the native runner. The synthetic baseline does not
measure forbidden disclosure, Obsidian frame timing, model extraction, physical
durability or a 24-hour soak. Those plan criteria require separate fixtures. Live
semantic execution is explicitly deferred by the owner while existing GPU workloads
remain active. A reviewed semantic relevance set and exact model configuration are
required before evaluating the semantic gain/overhead thresholds.
