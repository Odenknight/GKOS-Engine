# Four-slot secure scan scheduling

The secure scanner previously waited for every file in a four-item batch before
starting another file. A slow file therefore idled the other slots. A bounded
worker pool now fills a slot when its file finishes. Directories remain barriers:
all active work drains before descent. Fatal failures stop new scheduling, drain
active work and report the earliest input-order failure among those operations.
The shared Phase3 CLI remains serial; the watcher remains bounded to four.

Every existing per-file check and both ordered snapshots remain unchanged:
canonical paths, aliases/hard links, size, open-handle identity, source digests,
lossless timestamps, root rechecks and final deterministic evidence ordering.
There is no source-content cache or wider file-buffer concurrency.

Build and 23 focused tests passed on Windows Node 24.18.0: scanner/validation,
CLI ingestion and Windows path security. The new straggler regression proves a
fifth file starts while the first is held, alongside the existing global-bound,
ordered-evidence and drain-before-refusal tests.

Three alternating-order comparisons on the same 2,000-note corpus produced
identical complete scan outputs:

| Run | Batches of four ms | Four workers ms |
| --- | ---: | ---: |
| 1 | 2,547.25 | 2,202.58 |
| 2 (candidate first) | 2,506.76 | 2,160.41 |
| 3 | 2,791.63 | 2,219.76 |

A separate width 8/16 experiment was faster but was not adopted because this
repair preserves the existing four-operation resource bound. Raw experiment
receipts are local: secure-scan-width-comparison.json and
scan-scheduling-comparison.json. These are scanner measurements only.

The uninstrumented activation smoke at 4b2c587 took 15,121 ms and still failed the
unchanged 2,000 ms budget. Receipt: watcher-scan-scheduling-smoke/receipt.json.
No end-to-end qualification or 24-hour pass is claimed.

Separately, main 0a1dbfc CI run 34749573881 failed the Windows Node 26 watcher
latency check on both internal attempts; its dependent audit lacked the expected
measurement artifact. Original logs are retained as main-0a1dbfc-ci-failure.log.
A single fresh-runner retry of failed jobs was requested without changing source
or thresholds. That pending retry is not evidence that the failure was invalid.

The retry subsequently completed successfully, including the artifact audit
(verified September 13 at 11:45 UTC). The original failure remains recorded;
this CI result does not qualify the separate 2,000-note activation budget.
