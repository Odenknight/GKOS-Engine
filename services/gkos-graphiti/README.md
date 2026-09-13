# Managed Graphiti host components

Private experimental host implementation, outside the deterministic Engine and
public package exports. Python uses its standard-library SQLite; Graphiti is
imported only by the explicit backend. No HTTP listener or mutation MCP tool is
introduced. Run checks with:

```sh
python -m unittest discover -s services/gkos-graphiti -p 'test_*.py' -v
```

`Ledger` requires an existing canonical private directory on a local filesystem.
`Ledger(directory, create=True)` explicitly initializes new state; ordinary
opens refuse missing or empty state so database loss cannot silently permit
re-extraction. Unrelated databases are refused.
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
and a 256 MiB SQLite page cap plus 100,000 total jobs require explicit retention
maintenance rather than silent evidence deletion. SQLite rollback journals need
additional disk headroom. Episode envelopes are bounded incrementally before
copying/aggregate serialization; an oversized export never reaches the backend.

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

`test_crash_recovery.py` now exercises eight real child-process exits: immediately
after an event mutation inside an uncommitted transaction and immediately after
commit, for observation, replacement publication, corpus revocation and purge
metadata. Reopening checks SQLite integrity, rollback of interrupted event/state
updates, durable committed states, atomic replacement of the previous generation,
and denial of unauthorized reads and retries. A separate twelve-generation test
covers corpus revocation across queued, running, observed, published, quarantined
and purged states while preserving an independent corpus; revocation survives
reopen and repeated revocation does not append duplicate events.

On September 13, 2026, all 21 standard-library managed-host tests passed locally
on Windows. These are synthetic local process-crash checks. They do not simulate
device power loss, certify physical backend deletion, or close the complete G3
production recovery gate. That test increment changed no runtime behavior or
automatic retry policy.

The private broker HTTP helper rejects redirects and bounds streamed UTF-8 JSON
to 128 KiB. Monotonic elapsed-time checks reject responses after the deadline
even when synchronous provider work delays the timer callback.

`readonly_query.py` supplies a private Graphiti 0.30.2 query driver for one
already published and indexed projection. Its client exposes only a bounded
`GRAPH.RO_QUERY` route, refuses cross-graph selection/cloning and suppresses the
SDK constructor's automatic index creation. Its query override preserves result
conversion without the SDK's query/parameter exception logger. Search uses a
detached edge-RRF recipe with the advanced public `search_` API because the
convenience `search` method mutates a shared recipe's limit.

The returned SDK edges remain untrusted. `query_published` checks fresh trusted
host bindings against the published ledger and constructs bounded responses
using ledger-owned citation mappings. Authentication, complete principal scope,
SDK peak allocations and product integration remain host responsibilities.

`deadline.py` supplies the shared monotonic deadline check for ingestion and
read-only query operations. Late index creation, extraction, readback or close
success cannot produce an observed generation. The worker quarantines the
ambiguous attempt and closes both clients; it does not retry it automatically.
Awaiting cleanup may exceed the deadline for an uncooperative provider, so a
host still needs process supervision. Forty local tests pass, including all four
late ingestion phase cases and cancellation/outage checks. These local fault
injections do not establish production outage or physical power-loss qualification.
