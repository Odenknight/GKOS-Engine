# Graphiti query contract draft 1

Coordinate: `gkos-graphiti-query/1.0.0-draft.1`.
Normative types and validation: [`src/graphiti-query-contract.ts`](../../../src/graphiti-query-contract.ts).
Portable, synthetic consumer fixture: [`fixture.json`](fixture.json).

This additive optional `gkos-engine/graphiti` API is a **contract validation
boundary**, not a broker, policy authority, generation publisher or Graphiti
client. It opens no network connection and imports no host-plane runtime.
Neither the native retrieval contract nor the export schema changes.

## Host obligations

Use the existing source/chunk discoverability authority. Before any provider
invocation, independently resolve the authenticated principal and every source
dependency of the scoped projection. Build `GraphitiQueryContext` only from
that trusted decision, current publication state and verified episode ledger.
Never accept this context, its `allow` decision or its dependency-completeness
flag from a request or backend response. A Graphiti group ID is not permission.

The ledger maps each derived episode to its canonical source ID and exact
source-byte `sha256:<64 lowercase hex>` revision. `complete_dependency_scope`
must remain false unless **all** dependencies of generated facts, summaries,
communities and embeddings are authorized. Merely checking the citations a
provider chooses to return is insufficient. Mixed or unknown dependencies must
be quarantined/rebuilt. This draft does not implement that ledger or proof.

`prepareGraphitiQueryRequest(query, limit, requestId, context)` returns null
unless the host allows access, dependency scope is complete and the exact
contract is searchable in query-only or managed mode. Native-only, unavailable,
deny, indeterminate and error states refuse preparation. Retain the original
request privately; send a serialized copy to the backend. Generate a unique
request ID for each invocation; reuse across queries is not supported.

After awaiting the provider, obtain a **fresh** authorization/publication
context, then call `acceptGraphitiQueryResult(originalRequest, responseJson,
freshContext)`. Publish its result synchronously, or repeat this check after
any further await. Null means discard the entire response; it contains no
partial facts or provider diagnostics. The host decides whether to offer its
separately authorized native fallback. There is no implicit query retry.

## Bindings and result claims

All six binding coordinates must match the request, response and current host:

| Coordinate | Meaning |
|---|---|
| corpus_id | Stable corpus identity |
| scope_digest | Digest of the host-resolved principal/permission scope |
| policy_digest | Existing policy configuration/revision digest |
| source_snapshot_digest | Complete immutable authorized source manifest digest |
| projection_id | Published generation identity; never a mutable alias |
| configuration_digest | Exact adapter/backend/model configuration digest |

Configuration must include adapter and backend versions/artifacts, extraction
model artifact digest/settings, embedding model artifact digest/dimensions and
reranking implementation/model digest/settings. An endpoint or model name is
not an immutable artifact identity. Hosts own canonicalization and digest
verification; these helpers validate coordinates, not their truth. Changing any
coordinate invalidates an in-flight response, even if its individual citations
still exist. These names follow the existing retrieval manifest's digest and
projection conventions; they do not create a second policy vocabulary.

Each hit must cite at least one episode, and every episode/source/revision tuple
must exactly match the freshly authorized host ledger. Duplicate citations,
unknown fields, unsupported versions and excessive results reject the whole
response. Facts always carry `semantic_support: "unverified"`: neither a
matching digest nor a matching episode proves entailment or citation accuracy.
No source passage, temporal-history or verified-byte claim is introduced.

Bounds: query/fact 4,096 UTF-8 bytes, opaque IDs 128 bytes, limit 1–50, 1–16
citations per hit, response 128 KiB UTF-8 before JSON parsing. Text fields are
nonblank single-line strings without control characters. Hosts must separately
bound transport bytes, concurrency, timeouts and cancellation; this string
validator cannot bound an earlier download or allocation.

## Qualification and roadmap

Build then run `node --test test/graphiti-query-contract.test.mjs`. The fixture
uses invented digests and no vault data. Tests cover refusal before a simulated
provider call, pending-query policy/episode revocation, each stale coordinate,
cross-scope exchange, invalid provenance, unsupported claims and byte limits.
These are deterministic contract tests, not live backend isolation evidence.

This advances G2. G2 still needs cross-repository consumer adoption and actual
model artifact coordinates. G3 ledger/recovery/publication/revocation, G4
baseline/budgets/scale quality, G5 managed broker/admission/cancellation and G6
consumer/Hermes acceptance remain open. No native plugin pin changes here and
no production `searchable=true` status is enabled. Rollback is removal of this
unused additive surface; existing native and export operations are unaffected.
