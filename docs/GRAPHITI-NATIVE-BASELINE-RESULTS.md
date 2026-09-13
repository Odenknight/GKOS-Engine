# Initial native diagnostic results

Measured on Windows, Node 24.18.0, September 13, 2026, against Engine source
98c12f74306bd7afb7feea6053680cc2ada6bdb4. These are failed development gates,
not release qualification. Live model qualification remains deferred by FAC
while the existing GPU workloads continue.

The frozen draft1 native plan completed 300 queries at 1,000 notes across five
runs and concurrency 1, 4 and 16. Recall@10 and nDCG@10 were both 1, with zero
query errors. Per-concurrency p95 latency was 517.52, 1323.69 and 4929.92 ms,
respectively. Concurrency 16 exceeded the unchanged 2,000 ms budget. The runner
stopped before the 10,000- and 50,000-note tiers. Those tiers remain unmeasured.

A separate instrumented diagnostic on the retained synthetic corpus counted
160,000 lstat calls, 16,000 realpath calls, 16,000 stat calls and 16,000 reads
for 16 concurrent searches. Its elapsed time was 4,232 ms. This implicates
repeated secure source verification; it does not authorize removing policy,
freshness, alias, hard-link or containment checks, or sharing stale source bytes
between requests. No performance repair is claimed yet.

The 2,000-note watcher smoke completed one edit with a changed source snapshot
and clean shutdown, but took 27,241 ms and reported 2,000 reparsed sources.
RSS was 655.20 MiB and persisted state approximately 55.9 MB. This exceeds its
unchanged 2,000 ms latency budget. The original runner incorrectly returned
SHORT_SMOKE_ONLY despite that failure; the subsequent fix applies the latency
gate to short runs too. The original receipt is retained unchanged and must
be interpreted as a latency failure. This run is not a 24-hour soak.

Raw synthetic receipts and profiling code remain in the task workspace:
graphiti-native-baseline/native-1000.json, profile-native-retrieval.mjs,
profile-native-retrieval.log, and graphiti-watcher-smoke/{receipt.json,samples.jsonl}.
The public report intentionally contains aggregate measurements only.
