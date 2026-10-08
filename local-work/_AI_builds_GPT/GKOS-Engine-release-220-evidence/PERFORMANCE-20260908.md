# Native performance samples and scaling repair

## Repeated 2000-note samples on6e4e937

Twenty independent process trials on each native host passed, all sharing the same fixture and tarball digests. The same direct-library workload and100-note MOC target were retained. P95 uses the nearest-rank19th of20 sorted samples.

| Measurement p95 | Windows24 | Linux22 |
| --- | ---: | ---: |
| One-file parse/graph + MOC completion | 254.873ms | 135.685ms |
| Fifty-file parse/graph + MOC completion | 495.083ms | 183.428ms |
| Durable no-op MOC execution | 104.993ms | 50.141ms |
| Managed host restart/recovery | 164.283ms | 57.654ms |

These scoped samples satisfy the2s single-edit and5s fifty-edit bounds. They do not include native filesystem discovery/watcher notification latency and do not establish a24-hour resource-growth result. Raw20trialreceipts and digest-bound summaries are in repeated-performance-{windows,linux}-6e4e937. Command on each host: node repeated-performance.mjs PATH_TO_EXACT_TARBALL; generatedworker retains the original operations and restricts the tier to2000notes. No source change was made for these measurements.

Baseline Engine234560673d67047e31ad886b65df62a50f467009 and repaired candidate6e4e937f5bf6b3b49809072e49beafee71c3fcd8 were installed from exact local tarballs. The harness verifies SHA256 and installed lock integrity before work. Each deterministic corpus has100/2000/10000/50000 source records, fixed file timestamps, and one managed MOC scope containing100notes. All records participate in parsing/graph assembly and the MOC snapshot.

| Native host | 50000 unchanged, baseline | 50000 unchanged, repaired |
| --- | ---: | ---: |
| Windows11 NTFS, Node24.18.0 | 47.361s | 3.646s |
| Observatory Debian13 ZFS, Node22.23.2 | 50.607s | 2.967s |

The previous applyChanges loop scanned every canonical candidate for every submitted path. The repair builds path groups once after rename/removal processing. Descriptor comparisons, duplicate identities, parser reuse, validation, rollback and convergence checks remain unchanged. Typecheck/build and35focused incremental/canonical-ledger/determinism/watcher tests pass. PR48 includes the repair.

All four tiers passed on both hosts, before and after the repair: unchanged reparse count zero, one-file count one, fifty-file count50, exact graph nodes/links digest convergence against a clean rebuild, durable no-op artifact creation, and managed host restart/recovery. At2000notes, repaired combined update/MOC samples were Windows226.9ms(single)/441.3ms(50), Linux130.0ms(single)/185.1ms(50).

These are single samples, not p95 estimates or a completed performance release gate. Initial parse/graph, initial MOC, unchanged graph, no-op MOC, one/50-file update, clean graph rebuild, recovery and memory samples are in performance-{windows,linux}-{2345606,6e4e937}.json. The workload supplies source records to the public library, rather than measuring native file discovery or the full watcher path. Retrieval latency/embedding reuse has a separate10000chunk observation lane. Full repeated end-to-end qualification and24hoursoak remain incomplete.

Windows command: node performance-sample.mjs PATH_TO_EXACT_TARBALL. Linux command: node --max-old-space-size=1024 performance-sample.mjs ./gkos-engine-2.2.0.tgz. Linux used the isolated qualification directory, leaving the deployed Observatory unchanged. Windows peak-at-sample RSS for the repaired50000tier was1453391872bytes; Linux753762304bytes. These are process snapshots, not proof of bounded long-term growth.

The first harness attempt lacked fixed file times and failed graph convergence on timestamp fields. That evidence is preserved in performance-first-failure.json/log and performance-timestamp-diagnosis.json. Fixed metadata resolved the fixture issue without deleting graph assertions. Baseline harness copy:performance-sample-2345606.mjs, SHA2563d85eaea2f7421ae7c196f3f35e3628ef33b133e1b105396af2034e1eb655c0f.

New tarball:artifact-6e4e937/gkos-engine-2.2.0.tgz; SHA256f5075e0c63f795f7996482640073e9b4bdb3d69b55ac6268313080d08e04d48a. Full exact-candidate runtime gates are rerunning. Earlier2345606release evidence cannot qualify the changed revision.
