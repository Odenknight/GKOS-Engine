# Bounded native retrieval reads

This isolated repair is based on ea05531. It is not yet the qualified release
candidate. The live ea05531 Linux soak and its installed artifact are unchanged.

The Windows corrected soak pilot failed p95534.4491ms against the unchanged500ms
limit. Subsequent diagnostics did not reproduce that tail, so its exact cause
remains unresolved. They measured128 serial secure filesystem reads per query.
A static all-public fixture experiment, with all reads inside the query timer,
measured serial p95189–201ms versus94ms with four concurrent reads and identical
full hit digests across200queries. The implemented native path independently
measured94–97ms versus182–196ms for its serial fallback across200more queries.
These observations identify avoidable serialized read cost, not proof that the
old failing run was invalid or that every Windows environment meets the limit.

Only readers produced by Engine's own vaultSourceReader factory in the same
module instance are eligible. A private WeakSet marks those functions; caller
callbacks and cross-bundle wrappers retain serial invocation. Repeated source
paths also retain the original serial path and retry/cache semantics.

Source/chunk policy, filters and temporal eligibility are evaluated before any
batch starts. At most four already-admitted source reads are active. Every
existing canonical-path, containment, symlink, file-kind and hard-link check in
vaultSourceReader remains. Results retain input order; failed reads remain
stale-source refusals. All reads drain before digest, byte-span and line checks,
ranking and provider calls proceed. No vector/index identities, query limit,
latency threshold, public exports or frozen qualification files change.

New deterministic tests cover the four-read bound, out-of-order completion,
failure draining, duplicate-path refusal in the internal helper, native/custom
result equality, serial custom callbacks and stale-source behavior. The broader
retrieval, temporal, authorized-view, provenance, Windows path-security and
service retrieval suite passes87tests on each of Windows Node22 and Node24. Exact results are
recorded in the external evidence ledger. Typecheck/build pass.
The initial new integration fixture used an invalid authored UID and was corrected
to a canonical UUID; its failed test log is preserved separately.

Evidence: secure-read-concurrency-ea05531-1/receipt.json and
secure-read-implementation-ea05531-1/receipt.json in the external release evidence
directory. The latter records exact changed-source hashes, since it executed
before this commit existed. native-read-regressions*.log retains test results.
The experiment is all-public and unfiltered; broader policy behavior is covered
by the tests and must remain part of review. No qualification pass is inferred
for a newly packed artifact. Adoption requires exact-commit native matrix,
observation, package/consumer checks and new24-hour soak evidence. Preserve every
old failure and old-source pass with its original binding.