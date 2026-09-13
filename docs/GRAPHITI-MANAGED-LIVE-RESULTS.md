# Managed Graphiti live integration result

At 2026-09-13T09:25:03.885530Z the existing Hive lab passed all nine managed
synthetic integration checks against Engine main source
1a06e0a8e29dc2656ddcf95f6fe71100a09f335d. FAC reopened live qualification;
the util4 endpoint reported healthy and the test reached it from the Hive
container. No existing workload was stopped or model configuration changed.

Verified checks: actual ingestion and read-only readback; no automatic
publication; exact source mapping publication; stale-policy denial; duplicate
refusal before backend invocation; durable ledger reopen; revocation denial
before purge; physical purge; and fixture graph absence after cleanup.

The receipt records Python 3.12.14, graphiti-core 0.30.2, falkordb 1.7.1 and
redis 8.1.0. All four executed Python source hashes were independently matched
to the local main-source binding. The process exited successfully. The local
receipt is graphiti-managed-live-20260913T092455Z/receipt.json, alongside raw
stdout/stderr and the source binding. The dispatcher initially missed the
pretty-printed JSON receipt; extraction was corrected and the original output
validated without repeating ingestion.

This closes the previously deferred managed synthetic smoke only. It does not
establish semantic search quality, model artifact identity, performance budgets,
crash/power-loss qualification, product transport or production readiness.
Existing failed native retrieval and watcher timing receipts remain applicable.

The smoke passed again at 2026-09-13T10:41:10.543503Z against integration source
0c36379f9379d790f93a5d4e4963c5884c368685, including explicit ledger initialization.
All nine checks passed and the synthetic graph was removed. The four executed
source hashes matched the dispatch binding; local receipt:
graphiti-managed-live-20260913T104102Z/receipt.json. The package versions above
were unchanged. This repeat has the same limited integration-smoke scope.

The combined integration separately passed 23 managed Python tests, including
transaction-crash and corpus-revocation coverage, and 16 focused Node tests for
the broker, bounded HTTP transport and query contract. The watcher candidate
2b85179 passed the full current Node suite with 1,127 passed, zero failed and
zero skipped. That full count belongs to the watcher candidate, before the
separately tested private Graphiti hardening was combined; it is not an exact
full-suite count for 0c36379. The owner-supplied ONNX observation remains excluded
by the existing qualification harness.
