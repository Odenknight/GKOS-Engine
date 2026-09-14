# Windows retained-handle guard

This is an explicit native build component. The watcher does not yet load it.
It does not close the failed full qualification at `ab38572`.

On Windows x64 with the supported Visual C++ build tools, run:

```text
node scripts/build-windows-retained-guard.mjs
node --test test/native/windows-retained-guard.mjs
```

The build verifies the existing pinned Node 22.22.1 header hashes and retains
their original license and source URLs. It emits a content-addressed Node-API 8
module and a manifest binding its bytes and C++ source. The manifest is not
a signature or independent build attestation. No module loads on import.
The native test is an explicit Windows lane, outside the general test runner.

`withReadGuards(paths, callback)` opens all requested paths before calling the
synchronous callback. Files permit read sharing and deny conflicting data-write
and delete access while the handles remain held. Directories also share write
access, allowing child transitions while denying deletion of the directory
itself. The opened handle's kind must match the kind used to choose sharing
flags. It checks the resolved names
and refuses reparse targets, nonlocal paths, missing paths, and more than 4,096
handles. Partial acquisition failure closes handles already acquired.
Return and callback exceptions also release the handles.

The first native qualification passed three tests. The main test performed 200
guarded rename/write refusals and successful rename operations after release.
Other tests cover conflicting writers, callback exceptions, partial acquisition,
input limits, and malformed paths. Synthetic file bytes remain unchanged.

A subsequent five-test run adds a separate Node process. With the parent,
a retained subdirectory, and two retained files guarded, all 800 attempted writes and file or parent-directory renames
were refused. The caller could still create, write, rename, and remove its
unguarded output leaf. The original retained bytes stayed unchanged.

The earlier read-sharing-only directory guard blocked authorized child renames.
That observation remains in Git history at `1c351ac`. Directory write sharing
corrects this restriction. A dedicated regression now permits child creation,
promotion, and removal, but refuses renaming the empty guarded directory.
The tests do not establish coverage for every ancestor topology or unguarded
descendants. Retained files need their own guards; directory sharing does not
make the contents of a directory immutable.

This implements the [CreateFileW sharing rules](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew).
Those rules do not block every metadata-only operation. The caller still needs
the existing authority snapshots and exact identity checks. Unlisted ancestors
and descendants are not protected merely because one path is guarded.

Remaining integration must select the complete retained path set, bind it to
the existing inspected identities, revalidate while handles are held, and
release only after the authorized transition is checked. It also needs an
admitted production loader and packaged native artifacts. The callback must
remain synchronous; a returned Promise is refused. This component is not a
general execution authorization mechanism or a complete filesystem sandbox.

Rerun the original swap-and-restore regression, adversarial transitions,
native resource-cleanup checks, and full Engine qualification after integration.
