# Graphiti 0.30.2 adapter qualification

The optional export profile now targets `graphiti-core==0.30.2`. The existing
KnightsAI hive already used this version; this change does not upgrade or restart
that shared service. Deterministic GKOS operation still requires no Python,
database, model, or network connection.

## Corrected ingestion contract

In 0.30.2, `Graphiti.add_episode(uuid=...)` looks up an **existing** episode.
Passing a new canonical GKX UUID fails with `NodeNotFoundError`. The exported
`GRAPHITI_INGEST_SCRIPT` now creates a new episode without that argument and
records both `canonical_uuid` and returned `projection_uuid`. Canonical source
identity is unchanged. Relationship episodes use structured JSON extraction;
they do not invoke `add_triplet` or claim deterministic assertion insertion.

The runner requires the exact installed version, a nonempty single-corpus export
of at most 64 MiB and 10,000 episodes,
and a new `graphiti-ingestion-report.json`. It creates a unique projection group,
writes a durable in-flight receipt before each model operation, records the
returned UUID before readback, and verifies stored content and group. Successful
completion means `persistence-verified`; searchability remains unverified.
Every receipt records the input manifest SHA-256 and each episode body SHA-256.
These are export-byte digests, not claims about original note bytes.

An existing receipt blocks the run before contacting Graphiti, including for a
changed manifest. This is deliberate fail-closed recovery, not automatic retry,
exactly-once extraction, or a managed queue. Reconcile the recorded group and
episode IDs after a crash; preserve the receipt. To retry as a new generation,
copy the authorized export to a fresh directory and run it there. Do not reuse
an old generation after source authorization changes. Unpublished failed groups
can be removed by an authorized backend operator using the exact receipt group.
No prefix-wide database deletion is part of the runner.

For FalkorDB, set `FALKORDB_HOST`, optionally `FALKORDB_PORT`, `FALKORDB_USER`,
and `FALKORDB_PASSWORD`. A new database named by the receipt's projection group
is used. For Neo4j, set `GRAPHITI_DB=neo4j`, `NEO4J_URI`, `NEO4J_USER`,
`NEO4J_PASSWORD`, and optionally `NEO4J_DATABASE`; data uses a fresh group in that
database. Neo4j execution has not been qualified by this change. Configure the
Graphiti model clients before using real data; the default constructor uses
Graphiti's provider defaults. Qualification injects the existing local model
factory explicitly and does not exercise hosted-provider defaults.

## Independent byte evidence

`attachGraphitiSourceEvidence(episodes, sourceBytes)` accepts a map of authorized
source paths to exact `Uint8Array` revision bytes. It adds a separately versioned
`gkos-source-bytes/1` SHA-256 record to note episodes. Frontmatter, line endings,
and all bytes beyond an exported body truncation participate in the digest.
The helper performs no reads, preserves the existing change keys, and marks
semantic support unverified. Callers are responsible for supplying bytes from
the same authorized revision as the projection. Missing bytes produce no evidence.
Ordinary Kosmos exports do not yet supply raw source bytes, so they do not claim
this stronger evidence automatically.

## Qualification and limits

`scripts/qualify-graphiti.py` runs bounded synthetic ingestion, exact readback,
five provenance-bearing searches, an empty-group negative query, and exact
temporary database cleanup. `scripts/qualify-graphiti-runner.py` exercises the
actual generated runner using an Engine export and the existing local model
factory. `scripts/test-graphiti-runner.py` checks failure/retry behavior without
Graphiti dependencies or model calls. Raw sanitized receipts accompany the
review report.

Receipts and their SHA-256 manifest are in
[`evidence/graphiti-030-20260912`](../evidence/graphiti-030-20260912/SHA256SUMS).
The actual generated runner's live test completed one Engine episode in
68,167.69 ms, verified persistence and duplicate/changed retry refusal, and
cleaned its test database. That run did not perform a search.

The first live fixture failed on the previous UUID usage. The corrected fixture
ingested in 22,967.46 ms, produced three nodes/two edges, and passed five queries
in 20.98–23.36 ms with source-episode provenance. The empty group returned no
results. This is a smoke test, not a comparative benchmark or production gate.

Remaining: managed ingestion/reconciliation, full revocation and derived-data
purge, concurrent multi-scope adversarial fixtures, 1k/10k/50k corpora, native
baseline quality comparison, cost/peak-memory budgets, temporal history, and an
authorized semantic broker. No stock writable Graphiti MCP is exposed to agents.
No new semantic result is returned by the native retrieval pipeline.

Rollback is to the previous Engine pin and native/export-only mode. Existing
source data and the hive database are untouched. The previous 0.29 sample has
no successful ingestion receipt from this qualification and should not be used
to claim working UUID insertion.

Upstream: [0.30.2 release](https://github.com/getzep/graphiti/releases/tag/v0.30.2),
[immutable ingestion implementation](https://github.com/getzep/graphiti/blob/eaa4128681bc53487138a4bbc22d58336ebe70d2/graphiti_core/graphiti.py).
