# Pilot latency measurement correction

The first Windows ea05531 pilot applied a newly added500ms assertion to the
entire watcher.search route. This includes complete filesystem freshness scans
and immutable authority reopening. That was not the measurement used by the
established 2.2 observation gate: scripts/run-retrieval-observation-qualification-2.2.mjs
starts its timer immediately around coordinator.search and enforces p95<500ms.
The historical watcher observation separately measures edit latency at<=5s;
it does not establish a500ms whole-watcher search SLA.

The corrected pilot retains the strict500ms coordinator bound and performs both
queries against the same active generation, comparing complete hit digests.
Whole-watcher search latency is recorded separately and remains within the
existing30second pilot cycle bound. No claim that whole-watcher search meets
500ms is made. The original failed pilot and exact harness are preserved.
No production code, frozen observation fixture or established threshold changes
as part of this correction. The full10,000-chunk2.2 observation still passes on
ea055319a50d93e0f1b181e478731b437a152f17 in run34272999086.
