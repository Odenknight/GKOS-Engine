# Native durability evidence — ea05531

Exact source: ea055319a50d93e0f1b181e478731b437a152f17.
Artifact SHA-256: f04705280acac74deab823683193a81a7c4dbf333791b33f6189226b709d593b.

All four mandatory native hosted lanes (Linux/Windows, Node22/24) pass the
86-test managed audit suite in run34272999480. Exact full runtime run34272999095
also passes, including watcher journal/pointer recovery tests. Machine-readable
source/runtime and TAP hashes: native-audit-ea05531-verified.json and
runtime-ea05531-verified.json. Earlier candidate reports retain their original SHAs.

Coverage includes successful atomic persistence/idempotency, eight native SIGKILL
commit boundaries, five native NO_CHANGE process-exit boundaries, stale temporary
artifacts, partial journal persistence, interrupted fixed-pointer publication,
prior-generation reads while a guard exists, recovery finalization, reconciliation,
corrupt audit/checkpoint/archive refusal and native ENOTDIR/EEXIST write refusal.
ENOSPC/EACCES branches are fault injected; no physical disk exhaustion or physical
power-loss claim is made. Injected failures are distinguished from native process
termination and actual filesystem write failures in DURABILITY-20260908.md.

Additional exact installed-artifact checks:

- Four NO_CHANGE binding/idempotency/missing/truncated/corrupt audit checks pass
  on local Windows24.18 and Observatory Linux22.23.2. See artifact-ea05531/
  windows-no-change-gaps.tap and linux-no-change-gaps.tap.
- Four pointer checks now pass on both hosts. Actual deletion of the outer
  current pointer refuses with GKX_WATCHER_AUTHORITY_MISMATCH. Actual deletion
  of the journal current pointer refuses with GKX_WATCHER_GLOBAL_GENESIS_INVALID.
  Replacing either with canonical empty JSON refuses with structured code
  GKX_WATCHER_CONTRACT_VERSION_INVALID. Original immutable pointer/coherent
  artifacts and authored source bytes remain unchanged. No new canonical
  pointer/coherent artifact is promoted, and the damaged current pointer is
  not silently reconstructed from an arbitrary generation.

Pointer evidence: pointer-gaps-ea05531-windows-2/receipt.json,
pointer-gaps-ea05531-windows-2.log, pointer-gaps-ea05531-linux.json and
pointer-gaps-ea05531-linux.tap. The harness validates the tarball and every installed
file against the inspected595-file inventory before testing. Native filesystems:
local Windows11 NTFS; Observatory Debian13 LXC on ZFS. The packaged internal watcher
host is exercised directly; this is not a claim that it is a documented public export.

Commands (run in the isolated evidence/consumer locations):

```
node qualify-pointer-gaps.mjs <windows-consumer> artifact-ea05531 pointer-gaps-ea05531-windows-2
node qualify-pointer-gaps.mjs "$PWD" "$PWD" ../pointer-gaps-linux-1
```

The first Windows harness run preserved two passing deletion cases and two
harness failures: it inspected error.message but ignored the contract error's
structured error.code. qualify-pointer-gaps-message-only-v1.mjs and the first
run remain intact. The corrected harness pins all four expected codes from
production source; it does not relax them to arbitrary errors. It then reran
all four native cases successfully on both hosts.

These results close the direct missing-current-pointer coverage gap. They do
not complete the overall release: the Windows soak latency failure, successful
24-hour soak, remaining performance/consumer matrix and final release gates
remain open. Bounded qualification refusal records are not GKOS standard receipts.