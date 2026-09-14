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
This does not implement deadline cancellation or the authorized recovery interface.

## Evidence and remaining work

The Windows build and all 120 Navigation Effects tests passed with no failures or skips.
The broader test run caught a CRLF-normalizing copy regression before commit.
The corrected copy preserves exact source strings.
Tests cover caller mutation, handle copying and reuse, cross-instance refusal,
changed source bytes, revoked authority, pending shutdown and existing crash recovery.
The current full candidate qualification is separate from this component result.

The Kosmos host adapter is not yet wired to this API.
It still needs authorized snapshot and path-safety receipts, recovery inspection,
authorized recovery actions, and deadline shutdown behavior.
Directory durability and the platform threat model still need qualification.
This change does not enable source writes in Kosmos or establish release readiness.
