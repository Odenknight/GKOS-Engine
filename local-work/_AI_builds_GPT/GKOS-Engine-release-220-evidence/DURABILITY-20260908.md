# Native durability coverage at aa2e10d

Update: the four additional installed-artifact audit checks now PASS on native
Windows24.18.0 and Linux22.23.2. Both installations match all594 inspected file
hashes and tarball integrity. See durability-aa2e10d.json for exact receipts.
The preparation status below records the original coverage review.

Exact push audit run34265283649 passed86 tests on each Linux22, Linux24,
Windows22 and Windows24 lane. Environment and hashed TAP references are in
durability-aa2e10d.json. Windows statfs returns0, so these hosted receipts do
not identify the filesystem. The local Windows host was independently observed
as Windows11Pro10.0.26200 on NTFS; its full current-source suite is still running.

| Requirement | Concrete coverage | Evidence state |
| --- | --- | --- |
| Atomic persistence and idempotency | navigation-effects-node:67,230; managed-moc-no-change:35 | Four native audit lanes pass |
| Hard restart during effect commit | navigation-effects-node:401, eight SIGKILL boundaries | Four native audit lanes pass |
| No-change restart phases | managed-moc-no-change:64, five native process.exit boundaries | Four native audit lanes pass |
| Stale temporary artifacts | navigation-effects-node:167, verified cleanup and receipt | Four native audit lanes pass |
| Partial journal writes and restart | watcher-journal-host:491,528, native child exits during stage/file/fsync/pointer cuts | Exact full runtime pending |
| Guard-bound prior generation | watcher-pointer-host:375, failure after fixed pointer then recovery | Exact full runtime pending; thrown fault, not hard kill |
| Corrupt receipts/checkpoint/archive | navigation-effects-node:459,474,611,620; managed-moc-no-change:85 | Four native audit lanes pass |
| Missing/truncated no-change audit | Existing test title includes missing but implementation only writes corrupt JSON | Prepared external installed-artifact gap check; not yet run |
| Native write refusal / no promotion | managed-moc-no-change:106 uses actual ENOTDIR/EEXIST | Four native audit lanes pass |
| Disk-full branches | navigation-effects-node:435 injects ENOSPC/EACCES | Simulated; actual native write failure above is separate |
| Missing current-state pointer | Recovery fixtures contain missing-object cases, but direct native recovery/refusal mapping incomplete | Open coverage review |
| Exact no-change identity/time/storage fields | Production fields present; original test binds many fields but not every requested field explicitly | Prepared external installed-artifact assertions |

No claim of complete durability qualification follows from this inventory.
Process exit, forced termination and file-sync evidence do not demonstrate
physical power-loss or storage-controller failure safety. The new external
qualify-no-change-gaps.test.mjs must run in clean Linux/Windows consumers of
the next inspected tarball with GKOS_CONSUMER_ROOT, GKOS_TARBALL_PATH and
GKOS_TARBALL_SHA256. It requires a verified artifact digest and public package
exports, and does not mutate release source. It is prepared, not executed.
