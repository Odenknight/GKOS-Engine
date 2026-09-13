# Private Graphiti read-only driver qualification

The installed Graphiti 0.30.2 FalkorDriver constructor schedules index creation.
Its normal execute_query uses the write-capable GRAPH.QUERY command, and its
convenience Graphiti.search changes a shared search recipe's limit. A product
read-only claim cannot rely on those defaults.

The private managed-host adapter now wraps one exact published projection with
GRAPH.RO_QUERY only, a 30-second query deadline and a ten-second client-close
deadline. Other graph names and driver clones are refused. Constructor index
creation is suppressed; ingestion/publication must establish index readiness.
The adapter preserves query result conversion without the SDK logger that
includes query text and parameters on errors. Advanced search_ receives a
detached edge-RRF configuration per request, preserving concurrent limits.

All 27 managed-host unit tests passed locally. New cases cover no constructor
commands, exact readback, cross-graph refusal, independent concurrent recipes,
input bounds, and unsupported SDK versions.

At 2026-09-13T11:08:26.317643Z, the exact public source at
e93b6eb40ca05ffbe0506b2bc2a9c5094a4fafdf passed seven checks against the existing
Hive/FalkorDB lab: constructor issued no commands; real read-only readback;
database refusal of a CREATE query; unchanged fixture after refusal; cross-graph
selection refusal; cross-graph clone refusal; and verified fixture deletion.
The probe recorded exactly three GRAPH.RO_QUERY commands and no query-driver
write command. Fixture setup and cleanup used separate, explicit test authority.
No model calls or changes to existing graphs were needed.

The local receipt graphiti-readonly-live-20260913T110824Z/receipt.json is bound
to all three executed source hashes. The dispatcher initially missed JSON at
the start of stdout; the original output was parsed and its hashes verified
without repeating effects. The runtime inventory check passed.

At 2026-09-13T11:14:56.614932Z, the opt-in semantic probe also passed all eleven
checks at source 4a0173c. It reused the trusted host's configured model clients,
performed actual edge-RRF search through the read-only driver, and required
nonempty fixture facts whose group and every cited episode matched the published
synthetic ledger. The original stale-policy, duplicate, reopen, revocation,
purge and cleanup checks also passed. All six executed source hashes match the
local receipt graphiti-readonly-search-live-20260913T111449Z/receipt.json.
The default managed smoke still runs its original nine checks; this additional
lane is selected by running qualify_readonly_search.py explicitly.

At 2026-09-13T11:25:00.343501Z, source
519aca8cf7c81672c4a40fe3b8ad5dd7ee6ed5af passed thirteen live checks through
the new host-only `query_published` boundary. It checks the published ledger and
fresh host binding before search, after the await, and after response conversion;
maps all citations through ledger-owned mappings; refuses revoked generations;
redacts backend errors; and caps encoded responses at 128 KiB. All six executed
source hashes matched the dispatch. Cleanup passed. The default smoke remains
nine checks; the opt-in semantic lane now runs thirteen.

The managed-host suite passed 34 tests. A separate interoperability check fed
the actual Python response into the existing TypeScript
`acceptGraphitiQueryResult`: acceptance passed, and missing citation authority,
stale policy and incomplete scope were each refused. The live receipt SHA-256
is `0ccb2b3fa92497ac90011f0f3d8b10a425796cac28060f7576a838c3f6f1a7a4`;
the checked TypeScript source SHA-256 is
`497b49a78c364a64ec34a5f1c4af3e28e8e450212ec5df1afe6e06fbeeb55595`.

This is a private SDK/database and synthetic semantic-path qualification.
The caller still owns authentication and complete source-scope authorization;
`current` must derive fresh trusted host authority, never request fields.
Authenticated product wiring, SDK peak-memory qualification, outage integration
and product acceptance remain open. This module creates no searchability or
source-authority grant and enables no product endpoint.

The outage sweep reproduced a late-result bug: `asyncio.wait_for` alone can
return after its deadline when a provider blocks the event loop or suppresses
cancellation. Query, database read and close awaits now also check monotonic
elapsed time and reject late success. They keep awaiting physical cleanup;
this does not impose a hard process-termination deadline. The local Python
3.14 suite passes 39 tests, including the previously failing blocked-loop
case, cancellation suppression, caller cancellation, outage redaction, unchanged
published state and successful explicit retry. No automatic retry was added.
