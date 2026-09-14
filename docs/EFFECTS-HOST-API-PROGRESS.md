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

## Remaining API work

The current `executeSerial` persists PREPARED and then applies the effect in one call.
It does not expose a separate prepared handle that a host can execute later.
Implement the split against that existing transaction and recovery machinery.
Do not create a second journal format or bypass the existing preconditions.
Prepared handles must bind exact bytes and current authority to their executor instance.
Execution must recheck preconditions and preserve external changes.
Recovery inspection must remain separate from an authorized recovery action.
Shutdown must honor the host deadline without claiming unfinished work is durable.
Directory durability and the platform threat model still need explicit qualification.

The complete Node executor test file passed 67 tests with no failures or skips on Windows.
The package build and candidate inventory check also passed.
This is component evidence. The full candidate qualification remains separate.
The read-only test does not close these gaps or enable source writes.
