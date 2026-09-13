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

This is a private SDK/database transport qualification. Actual semantic search,
fresh host ledger/citation authorization, authenticated service wiring, response
bounds, SDK peak-memory qualification, outage integration and product acceptance
remain open. Returned edges are untrusted; this module creates no searchability
or source-authority grant and enables no product endpoint.
