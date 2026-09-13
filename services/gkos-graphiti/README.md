# Managed Graphiti host components

Private experimental host implementation, outside the deterministic Engine and
public package exports. Python uses its standard-library SQLite; Graphiti is
imported only by the explicit backend. No HTTP listener or mutation MCP tool is
introduced. Run checks with:

```sh
python -m unittest discover -s services/gkos-graphiti -p 'test_*.py' -v
```

`Ledger` requires an existing canonical private directory on a local filesystem.
The operating account must exclusively control its directory, SQLite database
and journal files. Provision OS permissions before opening it. A writable ledger
is trusted host authority, not a cryptographically authenticated remote input;
do not expose it through shared writable storage. Network filesystems are
unsupported. SQLite FULL synchronous transactions do not establish physical
power-loss qualification of a particular filesystem or device.

The host derives current authorization from the same source policy used by
native retrieval. Each binding identifies corpus, complete authorized scope,
policy, source manifest and exact backend/model configuration. Manifest digests
use sorted compact ASCII JSON; episode digests cover the complete canonical
episode input, while source digests identify original bytes. This internal
manifest format is distinct from legacy export receipts. Neither client request
fields nor provider-selected citations may create the trusted binding.

`Worker.run` validates input bindings, claims a secret lease, uses a unique
projection and rechecks current authorized inputs around each external await.
`GraphitiBackend` targets Graphiti 0.30.2, accepts a host-configured factory,
calls the public JSON ingestion API and performs bounded GRAPH.RO_QUERY readback.
The host factory must bind that exact projection and the configuration digest,
with no fallback credentials or models. Successful work becomes `observed`,
not searchable or automatically published. Host publication follows independent
configuration/search qualification. Complete source mappings are mandatory.

Publication atomically revokes the previous generation of the same corpus and
scope. Fresh bindings deny stale policy, source or configuration immediately.
Whole-corpus revocation quarantines all its derivative influence; no cross-scope
community or summary reuse is supported. Physical purge requires independent
writer-stop evidence and exact graph absence. An expired lease alone does not
prove that a model request stopped. Revoked/purged generations cannot be revived.

Ambiguous attempts remain quarantined and cannot be automatically reclaimed.
After a crash, expiry reconciliation fences publication; an operator establishes
writer quiescence and purges the isolated graph before planning a new authorized
generation. This increment does not promise exactly-once extraction or implement
automatic retry. It retains metadata/audit history; queue capacity is bounded,
and 100,000 total jobs requires explicit retention maintenance rather than
silent evidence deletion.

The private TypeScript `GraphitiQueryBroker` reuses the frozen draft query checks
and existing fair scheduler (two active slots and bounded queues). It checks
fresh authority before and after provider execution and returns null for native
fallback on error, cancellation, timeout or stale evidence. Uncooperative
cancelled work retains its slot until it settles. The transport must bound
download bytes before decoding and prove read-only behavior. No product semantic
endpoint is activated by these components.

`qualify_live.py` runs only in the existing Hive lab. It uses one synthetic
projection, tests real ingestion/readback, ledger reopen, stale-policy denial,
revocation and physical cleanup. Its receipt is integration-smoke evidence;
performance budgets, model-artifact binding, crash/power-loss matrices and full
Kosmos/Hermes acceptance remain separate gates.
