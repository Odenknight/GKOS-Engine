# Windows retained-handle guard

The shared direct-leaf watcher transition now loads this native component on
Windows. Integration tests pass; full qualification must still be rerun.
The failed full qualification at `ab38572` remains a historical failure.

On Windows x64 with the supported Visual C++ build tools, run:

```text
node scripts/build.mjs
node --test test/native/windows-retained-guard.mjs
```

The build verifies the existing pinned Node 22.22.1 header hashes and retains
their original license and source URLs. It emits a content-addressed Node-API 8
module and a manifest binding its bytes and C++ source. The manifest is not
a signature or independent build attestation. No module loads on import.
The current-runtime test runner includes the native lane on Windows.

`withReadGuards(paths, callback)` opens all requested paths before calling the
synchronous callback. Files permit read sharing and deny conflicting data-write
and delete access while the handles remain held. Directories also share write
access, allowing child transitions while denying deletion of the directory
itself. The opened handle's kind must match the kind used to choose sharing
flags. It checks the resolved names
and refuses reparse targets, nonlocal paths, missing paths, and more than 100,001
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

The integration guards the transition directory and every retained direct child.
It revalidates the original snapshot after acquisition, before mutation, and
keeps the guards through intermediate checks and the final seal refresh.
Affected leaves remain governed by the existing exact transition proof.
This is the existing direct-child authority scope, not recursive source-tree
immutability. Other filesystem APIs and publication-session paths still need
their own review; this change does not qualify every watcher operation.

The Windows build requires Visual C++ and embeds the compiled module's SHA-256
in the JavaScript bundles. The lazy loader accepts only the matching regular,
canonical, single-link file in the bundle's adjacent `native` directory.
Missing or changed bytes refuse the transition before creating its leaf.
There is no environment override. The package excludes compiler intermediate
files and retains the content-addressed module and Node header license.
Rebundling hosts and standalone installers must preserve that adjacent layout
or provide a separately reviewed integration. Cross-platform package builds
do not produce Windows native code. Runtime deployment acceptance remains open.

The installation is trusted host code. Hash validation is not a protection
against an attacker able to replace the installation during module loading.
The callback must remain synchronous; a returned Promise is refused. This is
not a general execution authorization mechanism or a filesystem sandbox.

The integrated pointer suite passed all 12 tests. A 200-iteration rerun of the
original reserved-derivation attack accepted none and rejected all 200.
Six native tests passed, including missing, altered, and valid package-layout
cases in fresh processes. These results do not replace full qualification.

Rerun the original swap-and-restore regression, adversarial transitions,
native resource-cleanup checks, and full Engine qualification after integration.

## Qualification runner packaging

Full Windows qualification at `6f1486f` passed 1,168 of 1,169 tests, with
no skips. The original reserved-derivation regression passed. The remaining
failure was a separately bundled observation runner missing its compiled
native digest. Its receipt and both command-log hashes were verified.

Tests and all three CI runner-build sites now use
`scripts/build-watcher-observation-runner.mjs OUTPUT`. It verifies the current
native manifest, source hash, and binary hash; embeds the binding; and stages
the matching native module adjacent to the runner. Existing output is never
overwritten. A changed existing native module refuses packaging.

The measurement test runs in a child process so Windows releases its mapped
DLL before package cleanup. Measurement thresholds and authority checks remain
unchanged. The corrected measurement/audit pair and packaging regression passed.
Full combined qualification is still required.
