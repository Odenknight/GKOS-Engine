# Reviewer canonical artifact boundary v2

This host-plane API is exported as `gkos-engine/governance/artifacts` from
`dist/governance-artifacts.mjs`. The browser/root and v1 governance APIs remain
unchanged for compatibility and historical replay. A successor runtime must
require `evaluateReviewerAdmissionV2` for every new grant/effect; a private v1
JSON packet is not an alternative canonical authority path.

## Adopted schema boundary

Exact schema objects from `gkos-standard@b308ff7137bdbb109c31f0ace7e6c49b8988e0d5`
are embedded in `artifact-schemas.ts`: `gkx-common.defs.json`,
`selection-set.schema.json`, `context-manifest.schema.json`,
`authority-receipt.schema.json`, `authorized-use-record.schema.json`, and
`refusal-receipt.schema.json`. They are all adopted role version `1.0.0`.
The unpublished R17 Authorized Use Record candidate is not substituted.
Schema structural validation reuses Ajv2020, already a locked development
dependency; the host bundle includes it and requires no runtime installation.
Canonical checks reuse the existing codec, including actual Unicode17 capability.

`gkosArtifactEncode(document)` produces canonical hex, SHA256 identity,
`reference:{artifact_id,artifact_version,digest}`, full typed rendering and the
decoded document. It sorts schema-declared logical sets. Safe integer JSON
inputs are supported; selection members with `score_type:float` explicitly
encode their numeric score as a float. Only these five roles are supported.

`gkosArtifactValidate({canonicalHex,rendering?,digest?,reference?,document?})`
validates deterministic wire bytes, exact schema, numeric distinctions, declared
set ordering/duplicates, canonical Gregorian timestamps, reference/hash fidelity,
and complete rendering. It never repairs received bytes. Rendering is
`gkos.cbor.typed-json.v1`; integer values are decimal strings. Schema identities
and applicability remain explicit; success is not full GCP qualification.

`gkosCapturedInputDigest(value)` is an opaque-input commitment, not artifact-role
validation. Every string **value** becomes its exact UTF8 CBOR byte string; keys
remain canonical text. This preserves non-NFC source content and CRLF without
normalization or lone-surrogate repair. Booleans/null/safe integers and ordered
arrays/plain keyed values retain their types. The published digest is
`{algorithm:'sha-256',canonical_profile:'GKX-CBOR-1',value:hex}`. It must not be
confused with SHA256 of raw source bytes or private canonical JSON.

## Capture and admission

`buildReviewerContextArtifactsV2({context,runId,corpusRevision,policy,
authoritativeSources,purpose,recipientId,selectedById,selectedByClass?,compilerRef})`
captures the Selection Envelope and Context Manifest **before** proposal,
review or grant. `selectedByClass` defaults to the bounded agent proposer;
human proposers must explicitly supply `human`. `compilerRef` is a schema-valid
component reference whose captured commitment must identify actual implementation
inputs. The host archives and displays these exact packets for review.

Source references commit `{id,revision,content}` using the opaque-input helper.
Eligible snapshot commits the run, opaque corpus revision and sorted permitted
source inventory. Selected sources preserve presentation order; omissions are
eligible-but-not-selected. Required source closure is represented as selection
restrictions, not inferred semantic contradictions. Warning references commit
their recorded fields. Policy references commit the captured policy object.
Context identities use captured context digest, not proposal or action time.

`buildReviewerArtifactsV2(basis)` adds the Authority Receipt. Basis contains:

- `request`: existing authoritative `ReviewerAdmissionRequest`;
- fixed `issuedAt`, `issuer:{actor_id,actor_class}`, `proofMechanism`;
- `compilerRef`, optional `selectedByClass`, `selectedById` (actual context
  selector, default proposer), and `proposingActorClass` (actual proposer, default agent);
- `requiredRecoveryKinds` and `recoveryRoutes:[{kind,procedureRef,evidenceRef,available}]`;
- mandatory `retention`: request described below;
- optional authoritative `escalation` resolution snapshot.

Grant issue/check time is fixed, initial revocation status is recorded as
not-revoked, and receipt version is the expected issued authority revision.
Current revocation/state is separately checked by admission; later revocation
does not rewrite the archived grant. Native typed scope uses exact action,
resource, audience, environment, sensitivity and affected count. This append-only
effect is declared irreversible; later correction preserves history.

`evaluateReviewerAdmissionV2({...basis,artifacts:{selection,context,authority}})`
validates and reproduces all three archived packets, then checks the existing
authority/review/closure/typed-scope gates. Changing a reviewed packet, compiler,
policy, source revision or binding fails closed. Canonical identity does not
authenticate a host; issuer credentials, transaction isolation and records are
host responsibilities. Context assembly times are captured and immutable.

`gkosArtifactCapabilities()` reports actual profile availability and a registered
refusal when actual Unicode17 text validation is unavailable. Capability depends
on actual Unicode data, not Node major version. Latest Node22 supports Unicode17;
an older host with Unicode16 is unsupported for positive artifact qualification.
The v2 evaluator refuses with `bindingDigest:null` rather than fabricating a
canonical identity. `legacyBasisDigest` is separately labelled private JSON evidence.

Policy-required recovery kinds are separate from capability declarations.
Missing/nonavailable required routes refuse with L7-006/AUTHUSE-006. The v1
all-four-routes rule is not reused as a fabricated assertion that compensation
or rollback exists. The host must supply actual tested route definitions and
evidence references. Engine checks these bindings, not physical availability.

Mandatory escalation requires an authoritative snapshot `{required,resolution,
resolverId,resolverClass:'human',resolutionRecordId,evidenceDigest,proposalId,
contextDigest,policyDigest,validUntil}` bound to the exact current proposal,
context, policy, sealed review evidence and expiry. Host authorization must prove
the resolver's role and append-only resolution. A boolean alone cannot satisfy v2.

## Outcome and refusal

After independent target observation,
`buildReviewerUseRecordV2(basis,{id,at,outcome,recoveryKind})` constructs the
adopted Authorized Use Record. Allowed outcomes are completed/refused/failed/partial.
It binds canonical context/authority, policy/compiler, actor roles, action scope
and an actual available recorded recovery route. Never claim completed before
effect publication. The adopted schema lacks a result-digest field: the host
must separately bind exact observed result bytes, receipt and operation identity
in its signed operation packet rather than adding an undeclared schema field.

`buildReviewerRefusalRecordV2(basis,{id,at,diagnostic:{code,requirementId,reason},
predicateId,predicateVersion,escalationRoute?})` emits a schema-valid refusal.
Code/requirement pairs must exist in the pinned registry. Evaluations return
registered diagnostics for actual mapped conditions; unmapped product holds
remain product reasons, not newly invented registered gates. A durable receipt
still requires host persistence inside its effect/refusal transaction.

V2 also records two product readiness predicates:
`engine:reviewer-v2-execution-state-ready` and
`engine:reviewer-v2-challenge-standing-clear`, version 2.0.0. A non-ready state or
open/needs-evidence/upheld challenge makes the applicable predicate held.
The decision preserves captured input/outcome and predicate identity in
`readinessPredicates` and `productRefusals`; it does not assign a registered gate.
DELEGATION-002 applies specifically to delegated supersession, which this append
operation does not establish. The host must durably retain a product-only refused
operation when no applicable registered condition exists. It must not invent a
canonical Refusal Receipt gate merely to populate the role. Actual canonical,
authority and retention violations produce their applicable registered receipts.

Generic predicate/controls failures and nondeterministic relaxation refusals
also remain product-only in v2. DELEGATION-002/003 belong to the governed
supersession contract; a generic append-effect control does not establish that
applicability. Restrictiveness and refusal behavior are preserved with captured
control input in `productRefusals`. The historical v1 diagnostic support map is
not changed or upgraded into normative satisfaction.

## Retention

`evaluateReviewerRetention({policy,evaluation,disposition,manualHold,operation,at})`
accepts the exact TypeScript contract in `reviewer-v2.ts`. Policy lists mandatory
evidence IDs. Evaluation carries ID, policy digest, state, exact source evidence,
captured validity interval, disposition ID or null and optional predecessor ID.
Every evidence entry carries `{id,revision,content,digest}` where digest is SHA256
of raw UTF8 content with `sha256:` prefix. Missing/tampered/expired evaluation,
unavailable/indeterminate evidence or policy mismatch closes L4-001. Holds,
conflicts or invalid dispositions close L4-002, both RETENTION-003.

A clear evaluation resolving a predecessor requires a matching human release
disposition bound to predecessor ID, current policy and complete evidence digest.
Evidence digest is private exact JSON SHA256 of the ordered evidence list;
it is not a normative artifact identity. A release cannot bypass a current held
state or manual hold. Host must verify resolver authorization and append-only
history. V2 effect admission requires this evaluation at the exact action time;
deletion must independently invoke the gate with `operation:retention-delete`.

This slice is not production deployment, external trust qualification, a full
profile, complete protected-source disclosure analysis, retrieval workload
qualification, human assessment or advisor acceptance.
