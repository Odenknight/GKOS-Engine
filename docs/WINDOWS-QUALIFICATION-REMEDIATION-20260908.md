# Windows qualification remediation, September 8, 2026

Candidate 6e4e937f5bf6b3b49809072e49beafee71c3fcd8 remains unqualified.
Runtime workflow 34254132747 attempt 1 exceeded the mandatory Windows Node 22
30-minute test-command limit. Attempt 2 completed 1,090 tests with one failure:
the large restart fixture raised GKX_WATCHER_SHUTDOWN_UNSAFE. Its topology was
1,552,042 bytes and graph 30,764,374 bytes. The informational Node 26 retry passed.
Neither another successful lane nor a synthetic PR merge qualifies this source.

An isolated diagnostic retaining the large-restart assertions on native Windows
Node 22.23.2 measured the shutdown retry scan at 6,178.9 ms, followed by about
615 ms of failure artifact/journal persistence. Its secure startup scan took
15,633.4 ms for two snapshots. Local completion alone did not reproduce the
hosted deadline failure; these measurements identify the serial scan as the
largest measured contributor, not proof of the hosted runner's exact timing.

The shared scanner now supports internally bounded file probes. The watcher
uses four; the public Phase3 scan remains serial. Directory descent drains
pending work, so nesting cannot multiply the bound. All probes settle before
an error returns. Results retain canonical ordering. All original alias,
containment, handle/path identity, byte-count, UTF-8, root recheck, and two-snapshot
namespace comparisons remain. No cached capability or partial scan is accepted.

The 10-second shutdown deadline, fresh same-parent failure reconciliation,
durable failure tail, pointer convergence, observation latency thresholds and
30-minute qualification command limit are unchanged. The large-restart test
now emits a bounded phase duration even if shutdown rejects. No private paths
or source contents are added to the diagnostic.

Type checking and build passed. Initial focused native Windows Node 22.23.2
execution passed six tests: the original large restart plus five secure-scan
checks, including new concurrency/evidence and drain-before-refusal regressions.
A second native Windows Node 22.23.2 run passed all 47 shutdown, ingestion,
path-security and qualification regressions in 212.7 seconds. The complete
failed-reconciliation shutdown took 3,040.0 ms, with its deadline unchanged.
The deterministic barrier version of the five secure-scan tests also passed.
Full mandatory Linux/Windows Node 22/24 qualification must pass on the resulting
commit. The initial timeout is not considered resolved until that matrix passes.
The 24-hour soak and remaining release gates remain mandatory; no release or
publication is authorized by these focused results alone.
