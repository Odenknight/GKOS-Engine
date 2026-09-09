# Engine 2.2 observation qualification

The 2.1.2 generator remains byte-identical to main at
`650eab4a6752227cae336d7556a57826c22a0d5a`. Its fixtures and earlier failures
remain historical evidence. The named historical workflow checks out
`d81f9d1351f1a9228650a840629191a92f2dfb22`, the exact Engine 2.1.2 implementation
from successful observation run 34022421978. Its event commit remains the actual
workflow event commit; a historical replay cannot certify a current candidate.

The separate `observation-2.2.yml` workflow executes the current checkout with
`fetch-depth: 0`. The runner rejects shallow, dirty, mismatched-version and
mismatched-source checkouts. Receipts bind actual source commit, Engine 2.2.0,
retrieval contract, schema 2, fixture version and fixed fixture/sample-plan
digests. Nothing overrides the production Engine identity.

`observation-2.2-material.mjs` builds expected projection preimages without the
production indexer, SQLite store, manifest builder or canonicalizer. It uses
the byte-checked historical corpus and a separate canonical serializer.
`generate-retrieval-observation-fixture-2.2.mjs` checks fixed pins before any
index operation; generated actual manifests cannot choose their expected
digests. Changes to those pins require source review, never runtime acceptance.
The configuration digest changes because it now truthfully binds Engine 2.2.0.

The current runner checks complete expected manifests, 313 calls/10,000 items,
32-item batching, exact request sequence, active local embedding, one changed
content item and 9,999 reused vectors read back from SQLite. Ten source-bound
chunk records change because the modified source contains ten sections.
Incremental and clean rebuild manifests and query results must converge.
All five measured rounds must be deterministic. The original 50 samples,
10 warmups and strict p95 below 500,000 microseconds remain unchanged.
The deterministic provider is an in-process constant-vector local provider;
this lane does not establish real ONNX model quality or inference performance.

The established performance qualification remains Linux x64 only. Native
Windows tests additionally execute the actual 10k SQLite indexing, reuse and
manifest-convergence path, without claiming the Linux performance receipt.
All retained observation artifacts are bounded JSON; source, database, query,
provider and result bytes remain outside the uploaded evidence directory.
Failure logs use allowlisted codes. An unwritable evidence directory remains
a failed run and cannot produce a successful receipt.

Run from a clean full clone, with dependencies installed, and bundle outside
the checkout:

```sh
npm ci
./node_modules/.bin/esbuild scripts/run-retrieval-observation-qualification-2.2.mjs --bundle --platform=node --format=esm --target=node24 --outfile=/tmp/observation-2.2.mjs
mkdir -m 700 /tmp/observation-2.2-receipts
node /tmp/observation-2.2.mjs --mode observation --artifact-root /tmp/observation-2.2-receipts
```

This lane is one gate in issue #44. It does not qualify managed-MOC durable
no-op receipts, native crash recovery, 24-hour soak, downstream compatibility,
or publication. External implementation/review responses remain pending and
are not endorsements or conformance evidence.
