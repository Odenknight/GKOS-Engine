# Synthetic reviewer development contract v1

This bounded implementation contract is exported from `gkos-engine/governance`
and the Engine root. It does not qualify a GKOS profile. Its context is labeled
`engine.reviewer-context`, not a normative GKOS Context Manifest. Canonical JSON
is labeled `engine-reviewer-exact-json-v1`; private canonical CBOR remains a separate
byte primitive and is not silently substituted for this contract.

## Public API

`buildReviewerContext(input)` captures pinned corpus identity, policy identity,
exact UTF-8 source digests, source revisions, ordered selected source IDs and a
validity interval. Corpus entries sort by source ID; selection order remains
significant. Empty, duplicate and missing selections, duplicate source IDs,
invalid intervals and malformed source Unicode are rejected. Source content
line endings remain significant. `verifyReviewerContext(context)` checks the
contract shape and its self digest, not the authenticity of the corpus owner.

`reviewerCanonicalBytes(value)` returns exact-string canonical JSON;
`reviewerCanonicalDigest(value)` returns its SHA-256 with `sha256:` prefix.
CR/LF remain significant in every string. Object keys sort by UTF-16 code units;
arrays preserve order. Only safe integers (not negative zero), booleans, null,
well-formed strings, arrays and plain objects are supported. Undefined values,
sparse/cyclic arrays, nonfinite/floating numbers and lone surrogates are rejected.
Identity fields reject newlines. Hostile keys including `__proto__` are retained.
Legacy Engine `canonicalJson` keeps its established newline normalization.

`evaluateReviewerAdmission(request)` binds the exact context to run, corpus,
policy, authenticated executor, proposal, completed approving review, current
authority revision, validity intervals, operation, target, intended result,
expected target digest and receipt availability. Proposer, reviewer, authorizer
and executor identities must differ in this bounded pilot policy. Authority
operation and target lists use exact equality: wildcards have no special meaning.
Expiry is exclusive. It returns `{admitted,reasonCodes,bindingDigest}`. Reason
codes are implementation diagnostics, not allocated GKOS normative codes.
`reviewer-diagnostic-map-v1.json` maps their related requirements and registered
gates as implementation evidence; a map does not make a product receipt normative.

Admission also verifies supplied authoritative source revisions and exact raw
bytes against the captured inventory; authoritative required source IDs and
warning codes must be present in selection/closure. Captured warnings remain
visible without claiming user acknowledgement. Context construction performs
no retrieval or semantic contradiction inference: the host's pinned fixture
rules supply required closure. Missing required inputs close the gate.

Human reviews require a bound reviewer authority reference, sealed evidence digest
and unexpired review. Agent reviews additionally require distinct identified
proposer/reviewer model families. Mandatory escalation requires an explicit
resolved human escalation. The host must prove the supplied authority and
escalation resolution from append-only records; IDs/booleans alone are not proof.
Execution must be `ready`; open, needs-evidence or upheld challenges hold use.
Effect purpose, audience, environment, sensitivity, operation and target must
match both actor and authority scope; a positive safe-integer affected count
cannot exceed either bound. Unknown/incomparable dimensions close the gate.

`request.controls` is captured authoritative policy evidence: `predicate`
identifies version/digest/evidence refs and `pass`, `major` or `indeterminate`
outcome; `checker` identifies version/digest and deterministic/nondeterministic
kind with preserve/relax/escalate recommendation; `recovery` explicitly declares
correction, compensation, rollback and escalation availability. This pilot
requires all four recovery routes. A predicate result other than pass always
refuses use. A nondeterministic recommendation to relax it additionally records
refusal and cannot remove the deterministic gate. Checker escalation requires
resolved human escalation. The host selects and records these controls from
frozen policy/fixture rules; guest input cannot replace them. Engine evaluation
does not manufacture referenced control records or prove route availability.

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

The private CBOR codec (`src/canonical-cbor.ts`), vectors
(`test/canonical-cbor-vectors.json`), Python verifier and cross-language script
(`scripts/verify-canonical-cbor.py` and
`scripts/verify-canonical-cbor-cross-language.mjs`) are byte-identical to Carson
commit `6842051ff697dd65a8fc0072c078dc81bc8a9bd9`. The imported runtime test
was subsequently adapted in its title and expected package exports for the
`./governance/artifacts` subpath. Carson is a partial author of the reused CBOR
slice and cannot be its sole non-author reviewer; different-family technical
counter-review does not establish organizational independence.
No upstream historical execution logs are copied or counted as this build's tests.
Actual runtime Unicode 17 capability and the official normalization corpus are
required for the full development lane. The pinned corpus SHA-256 is
`5019ffd530751a741900c849c0e010332f142a3612234639bd200b82138a87db`.

The pinned standard registry and normative authority/canonical annexes were read
from git object `b308ff7137bdbb109c31f0ace7e6c49b8988e0d5` (origin/main), rather
than the older working checkout. This contract does not complete all their
requirements: canonical JSON/context timestamps are bounded implementation
evidence, and the typed effect scope omits broader layer/reversibility/delegation
dimensions outside this single-cell operation. The gateway's requirement map
must pin the intended standard edition and keep unexecuted broader obligations
explicit. Host compromise, organizational independence, human outcomes,
production qualification and full normative Context Manifest/authority schemas
remain outside this implementation's demonstrated scope.
