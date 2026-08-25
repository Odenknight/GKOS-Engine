# Navigation Effects post-Phase-5 qualification — 2026-08-25

- Continuation base and current HEAD: `7b5262baee9fcda23d50b0cee0c4977d6e4305e7`
- Branch: `codex/navigation-effects-post-phase5`
- State: qualified uncommitted continuation worktree; no push, merge, release, or publication
- Scope: Navigation Effects port plus pre-Phase-6 admission repairs. Adapter-neutral agent-write request/result contract shapes are included, but Phase 6 identity, credential, connector, and MCP implementation was not started.

## Admission repairs verified

- Grant evaluation requires an explicit deterministic `at` instant. Evaluation and expiry accept only strict RFC 3339 instants and fail closed for date-only values, impossible dates, malformed offsets, omitted evaluation time, and expiry at or before evaluation.
- Canonical archive paths reject impossible calendar dates.
- Planner run IDs must also satisfy the executor's portable path policy, including rejection of Windows-reserved names and trailing-dot aliases.
- Effect IDs are restricted consistently in schemas, planner output, runtime validation, and artifact naming to `effect:<32hex>` or `effect:rollback:<32hex>`; path/metacharacter aliases are rejected before durable I/O.
- CLI navigation context reads only a bounded `---` frontmatter block; body and fenced-code keys cannot grant public projection.
- Recovery, execution, rollback, batch execution, and shutdown use one executor synchronization domain, so recovery cannot report a write-safe state while an in-flight effect commits.
- Each effect has an immutable archive binding that is receipt-bound independently of the appendable aggregate run manifest. Sequential and concurrent shared-run operations preserve every binding without invalidating earlier receipts.
- Startup validates the complete security-relevant archive binding plus exact before, after, diff, result, target, primary-receipt, and archived-receipt bytes. Unknown, duplicate, missing, or mismatched aggregate bindings fail closed.
- Recovery-required receipts are validated before retry and tampered fixed receipts are never overwritten. Recovery conflicts append a sealed `STALE` transition, remain persistently fail-closed, and cannot report write capability safe to enable.
- Every sealed terminal retains immutable primary and archived receipt bytes under its canonical receipt digest. Retry may update only a current alias; startup verifies every historical terminal digest and rejects missing or tampered versions.
- An unsafe or throwing startup recovery closes an executor-local write latch. Later same-effect and different-effect execution fails closed until an explicit later recovery returns safe.
- Every fresh executor automatically completes the serialized recovery preflight under the vault lease before its first write. Persisted unsafe journal/archive state therefore remains blocking across lease release, executor reconstruction, and process restart; a repaired state is re-enabled only by a successful recovery.
- Committed, no-op, stale, denied, and execution-failure receipts are digest-bound to their terminal journal entry and predecessor.
- The agent-write schemas compile with the project-standard strict Ajv 2020 validator. Their titles and documentation accurately classify them as adapter-neutral effect contracts, not Phase-6 MCP implementation.
- The Node executor requires explicit acknowledgement of the `cooperative-vault` path threat model. This does not claim protection from hostile concurrent local filesystem ancestor replacement.
- Phase-0 public-export and Phase-4/5 inventory locks were reconciled without relabeling the post-Phase-5 worktree as a Phase-5 fixture. Continuous Phase-4 qualification now runs the byte-frozen runner from a detached worktree at `7b5262baee9fcda23d50b0cee0c4977d6e4305e7`, while current-checkout build and test jobs still qualify post-Phase-5 changes.

## Local qualification evidence

- `npm run typecheck -- --pretty false`: PASS.
- `npm run build`: PASS.
- `npm run test:navigation`: PASS, 127 tests, 0 failures.
- Focused executor/contract/planner adversarial run: PASS, 77 tests, 0 failures.
- `npm test`: PASS, 866 tests; 861 passed, 0 failed, 5 platform skips; 339760.4228 ms.
- `npm run test:intelligence`: PASS, 4 tests.
- `npm run check:license`: PASS, Apache-2.0.
- `npm run check:nomenclature`: PASS, zero unapproved matches.
- `npm run pack:check`: PASS after the final documentation and evidence update, 430 packaged files and 3,065,439 bytes.
- `git diff --check`: PASS; Git reported only Windows LF-to-CRLF working-copy warnings.

## Remaining external gate

The local workflow-contract and frozen-inventory tests passed, but hosted Linux, Windows, and macOS CI was not run from this local uncommitted branch. No signed checkpoint commit was created.
