# Effects host API work

Updated: September 14, 2026.

Kosmos needs a complete host adapter before source Effects can run.
The current Node executor remains an experimental cooperative-vault executor.
It does not satisfy the complete Kosmos host contract.

## Existing source reader

`NodeNavigationEffectsExecutor.readSource` already exists in
`src/navigation-effects/node/executor.ts`.
It uses the executor's path checks and exact UTF-8 reader.
It returns source text or null for an absent target.
The focused native test verifies BOM, CRLF and Unicode preservation.
It also verifies invalid UTF-8, traversal and internal-path rejection.
The test checks that these calls create no journal, lease or other Effects state.

This primitive does not authenticate a caller or grant read authority.
It does not return the required vault, grant, digest and path-safety receipt bindings.
It does not prove safety against hostile concurrent path replacement.
The host must retain its unavailable status until those requirements are met.

## Split preparation and execution

The executor now exposes `prepare(request)` and `executePrepared(handle)`.
Preparation captures the caller's exact request before entering the execution queue.
It checks current preconditions and records RECEIVED, PLANNED and PREPARED.
It does not replace source bytes or create a source archive.
The journal uses its existing file-flush behavior and durability limits.

A prepared result contains a frozen, single-use handle.
The executor keeps the captured request privately in an instance-bound WeakMap.
Copied, reconstructed, cross-instance and consumed handles are rejected.
Handles are not transport credentials and cannot be restored after process restart.
The persisted plan and proposed digest remain available to existing recovery.
A retry after restart still needs fresh planning and authorization.

Execution verifies that the journal still ends in the matching PREPARED state.
It rechecks current authority and source preconditions under the existing target lock.
External source changes produce stale results and are preserved.
Authority changes deny execution.
The normal one-call execute API uses the same preparation and application code.
Single and batch calls capture inputs without normalizing source line endings.

Shutdown retains pending intent and records cleanShutdown=false for nonterminal work.
A shutdown executor rejects later use of its prepared handles.
`shutdownByDeadline(signal)` bounds the wait without interrupting a replacement.
Admission stops immediately. The queued drain continues after a deadline expires.
The lease stays held until the checkpoint has been written, flushed and read back.
The result distinguishes complete, deadline-exceeded and blocked states.
Pending prepared work reports blocked even after its checkpoint is verified.
A failed drain does not claim checkpoint verification or lease release.
Repeated shutdown calls observe the same drain.
New recovery and rollback work is refused after admission stops.
This is a drain deadline, not cancellation of filesystem operations.
The authorized recovery interface remains unfinished.

## Evidence and remaining work

The split-API checkpoint passed all 120 Navigation Effects tests on Windows.
The current deadline extension is checked separately below.
The broader test run caught a CRLF-normalizing copy regression before commit.
The corrected copy preserves exact source strings.
Tests cover caller mutation, handle copying and reuse, cross-instance refusal,
changed source bytes, revoked authority, pending shutdown and existing crash recovery.
The current full candidate qualification is separate from this component result.

The Kosmos host adapter is not yet wired to this API.
It still needs authorized snapshot and path-safety receipts, host mapping of recovery inspection,
authorized recovery actions, and mapping of shutdown results to host receipts.
Directory durability and the platform threat model still need qualification.
This change does not enable source writes in Kosmos or establish release readiness.

## Deadline checks

The deadline extension passed all 123 Navigation Effects tests on Windows, with no failures or skips.
Build, package and candidate inventory checks also passed.
These results do not replace full candidate or native host qualification.

The tests hold an active writer at a temporary-file boundary.
Deadline expiry returns before that writer is released.
A competing executor cannot acquire the lease during the drain.
After release, the writer completes and the checkpoint is verified before lease release.
Other fixtures cover an already-expired deadline, pending intent, checkpoint-write failure,
and refused recovery or rollback after shutdown.
Directory-entry power-loss durability remains outside the current proof.

## Read-only recovery inspection

`inspectRecovery()` now observes the existing recovery classifier without taking a lease.
It does not run cleanup, replace source bytes, write receipts or checkpoints,
or invoke the host's authorization callback.
It reads fresh journal evidence, including through archive and receipt validators.
The report binds journal and checkpoint digests to the observed results.
It always reports writeCapabilityMayEnable=false and sourceContentIncluded=false.
It rejects journal or checkpoint changes detected during the inspection.
This is not an atomic snapshot against another process changing the vault.
The cooperative-vault threat model still applies.

All 134 Navigation Effects tests passed on Windows with no failures or skips.
The package build, package check and candidate inventory check passed.
Tests compare exact file bytes, file modification times and directory entries
before and after inspection at all eight interrupted execution boundaries.
They also cover an empty vault, fresh corruption and newly committed receipts.
The test record does not establish full native-host or release qualification.

A separately authorized recovery action is still required.
The inspection digest is evidence, not a credential or an execution grant.
Kosmos must map it to its host receipt and resolve fresh authority before acting.
The existing direct recovery API is not yet that complete authorized host boundary.
