# Optional Graphiti managed-job ledger

This Python standard-library component is isolated from the deterministic Engine.
It stores identities and persistence observations, not note bodies, credentials,
authorization grants or inferred facts. It never starts a service or a model.

The trusted adapter supplies a previously authorized query binding and job
definition. `enqueue` binds corpus, complete scope, policy, immutable source
snapshot, projection and exact semantic configuration, plus source revision,
event, origin, adapter version and payload digest. Duplicate delivery returns
the existing state; changed inputs receive another identity. Queue capacity
includes ambiguous operations, so failures cannot grow outstanding work forever.

`claim` commits an exclusive in-flight record before any backend write. The
adapter calls `observe` only after exact persistence readback, using its claim
token and matching payload digest. This is not a semantic-search qualification.
A timeout uses `ambiguous`; after process death an in-flight record remains
explicitly unresolved. Neither state permits another claim. The original
read-only reconciliation runner may collect evidence, but this ledger does not
automatically infer absence, retry extraction or publish a generation.

Revocation durably fences the whole generation before late observations can be
accepted. Physical backend purge and complete dependency verification remain
adapter responsibilities. The status API is for the trusted host, not a public
unauthorized lookup surface. Every status reports `searchable: false`.

Open existing state with `Ledger(path)`. Initial creation requires the explicit
`create=True` argument; losing the database must not silently permit replay.
SQLite uses WAL and FULL synchronous commits. Operators supply a private,
locally controlled directory and retain backups. This is not a universal
filesystem/power-loss durability guarantee. Symlink leaves and unrelated or
unsupported databases are refused; stored identity hashes are rechecked.

Run the synthetic tests with:

```sh
python -m unittest discover -s services/gkos-graphiti/tests -v
```

The ledger/worker tests passed on Windows/Python 3.14 and the authorized Observatory
Linux/Python 3.13.5 host, including a child-process crash after durable claim,
two independent connections, revocation, identity corruption and capacity.
The subsequent empty-store guard is covered locally. These fixtures do not qualify macOS, backend ingestion, publication or a soak.

`Worker` bounds concurrent backend operations and marks deadlines ambiguous.
A cancellation-resistant operation retains its physical slot until it settles.
Returned episode identifiers survive late completion for reconciliation; only
exact readback followed by renewed authorization can verify persistence.
