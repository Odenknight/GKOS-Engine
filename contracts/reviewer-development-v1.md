# Synthetic reviewer development contract v1

This bounded implementation contract is exported from `gkos-engine/governance`
and the Engine root. It does not qualify a GKOS profile. Its context is labeled
`engine.reviewer-context`, not a normative GKOS Context Manifest. Canonical JSON
is labeled `engine-canonical-json-v1`; private canonical CBOR remains a separate
byte primitive and is not silently substituted for this contract.

## Public API

`buildReviewerContext(input)` captures pinned corpus identity, policy identity,
exact UTF-8 source digests, source revisions, ordered selected source IDs and a
validity interval. Corpus entries sort by source ID; selection order remains
significant. Empty, duplicate and missing selections, duplicate source IDs,
invalid intervals and malformed source Unicode are rejected. Source content
line endings remain significant. `verifyReviewerContext(context)` checks the
contract shape and its self digest, not the authenticity of the corpus owner.

`reviewerCanonicalBytes(value)` returns the existing Engine canonical JSON
string; `reviewerCanonicalDigest(value)` returns its SHA-256 with `sha256:`
prefix. JSON canonicalization normalizes CR/LF in string fields; source content
is separately hashed before that normalization. Identity fields reject newlines.
These helpers retain hostile JSON keys including `__proto__`.

`evaluateReviewerAdmission(request)` binds the exact context to run, corpus,
policy, authenticated executor, proposal, completed approving review, current
authority revision, validity intervals, operation, target, intended result,
expected target digest and receipt availability. Proposer, reviewer, authorizer
and executor identities must differ in this bounded pilot policy. Authority
operation and target lists use exact equality: wildcards have no special meaning.
Expiry is exclusive. It returns `{admitted,reasonCodes,bindingDigest}`. Reason
codes are implementation diagnostics, not allocated GKOS normative codes.

`evaluateReviewerCorrection(request)` checks the authenticated correcting
reviewer against the host's authoritative reviewer list, predecessor and new
context integrity, same run, challenge/decision references, rationale and the
replacement interval. It admits a new evidence proposal only. A changed context
invalidates previous proposal/review/authority bindings; fresh decisions are
required. Earlier records remain append-only in host storage.

Exact TypeScript fields are in `src/governance/reviewer.ts`, shipped declarations
in `dist/governance/reviewer.d.ts`. Evaluations defensively capture arguments
before asynchronous hashing. Invalid typed fields fail closed; non-JSON input
can throw and must be treated as a refusal by the transport.

## Host responsibilities and boundary

The host authenticates actor identity, owns trusted role/authority records and
supplies authoritative proposal/review/context/state. It invokes admission inside
the same serialization boundary as revocation, effect publication, record append
and authority consumption. No returned digest grants bearer authority. The
Engine evaluator cannot prove durable receipt availability or prevent another
filesystem/database writer; those are host properties requiring executed tests.
The host stores request, decision, observed effect state and transaction binding.
It consumes single-use authority and enforces idempotency in its transaction.
The in-memory governance store is only a test adapter, now serialized to prevent
concurrent loss or stale optimistic preconditions; it provides no disk durability.

## Inventory and source standing

Origin baseline: `45fc25f`. Existing `compileNavigationContext` is deterministic
but explicitly declares `gkos_context_manifest:false`. Existing substantive
admission-policy evaluates note admission, not consequential operation authority.
State-change receipt/store and deferred review freeze checks are reused as
existing independent primitives. This reviewer contract supplies the bounded
missing decision gate without changing those APIs or claiming broader standing.

The private CBOR codec, vector tests and separate Python verifier are reused
verbatim from Carson commit `6842051ff697dd65a8fc0072c078dc81bc8a9bd9`.
No upstream historical execution logs are copied or counted as this build's tests.
Actual runtime Unicode 17 capability and the official normalization corpus are
required for the full development lane. The pinned corpus SHA-256 is
`5019ffd530751a741900c849c0e010332f142a3612234639bd200b82138a87db`.

The pinned standard registry and normative authority/canonical annexes were read
from git object `b308ff7137bdbb109c31f0ace7e6c49b8988e0d5` (origin/main), rather
than the older working checkout. This contract does not complete all their
requirements: canonical JSON/context timestamps are bounded implementation
evidence, and typed operation/target lists are not the full normative effect
vocabulary. The gateway's requirement map
must pin the intended standard edition and keep unexecuted broader obligations
explicit. Host compromise, organizational independence, human outcomes,
production qualification and full normative Context Manifest/authority schemas
remain outside this implementation's demonstrated scope.
