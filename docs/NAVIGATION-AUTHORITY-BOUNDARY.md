# Navigation authority boundary

`src/navigation` analyzes caller-supplied snapshots and emits values. It
contains no filesystem writer, deletion primitive, lock, lease, rollback
executor, generic agent-write API, or inferred supersession path. A transitive
import-graph test enforces this boundary. The CLI scanner reads source files,
but all `gkx nav` outputs are stdout-only; mutation verbs and file-output flags
are rejected.

Governed metadata append is a separate `src/governance` plane. A host must
provide a `GovernanceStore` with an explicit binding mechanism. Its append
contract requires optimistic head/digest preconditions, an idempotency key, and
a State-Change Receipt role in the governed record. A separate duplicate
receipt object is not required. Receipt or durability failure returns
`committed: false`; replay of the same operation/key returns the single prior
effect. Only a store may transition `proposed` to `committed`, after durable
evidence exists.

Bounded delegation is tied to actor contract, scope, predecessor/successor,
policy, deterministic predicate, authority lifetime, expiry, and review terms.
The optional checker is escalation-only. Major or indeterminate classifications
require human disposition. An overdue review freezes only the affected grant
unless a higher-precedence, bounded, unexpired, independently authorized and
durably receipted exception is supplied.

Re-entry creates a new Layer-1 source proposal with exact acquisition
provenance. It cannot inherit predecessor layer, authority, epistemic state,
decision, Context Manifest authorization, or Authorized Use standing. Re-entry
itself never mutates or disposes of the predecessor.

Read permission never implies write permission, and a model, similarity score,
confidence, rank, timestamp, UUID order, lexical order, or graph property never
creates authority. A promotion is a human-governed configuration decision; a
supersession effect is an explicit human declaration or a valid, bounded
delegated operation.
