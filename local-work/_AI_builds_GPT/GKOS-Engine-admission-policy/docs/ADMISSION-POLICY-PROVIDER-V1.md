# Generic admission-policy provider contract v1

Status: upstream contract proposal; no release, runtime authority, or activation is implied.

## Purpose

`gkos.admission-policy.v1` is a product-neutral boundary for replaying a
ratified, bounded admission policy. It distinguishes deterministic policy
evaluation from storage, execution, approval, and materialization. The contract
contains no product names and does not grant a provider permission to act.

The public TypeScript surface is available from both `gkos-engine` and
`gkos-engine/admission-policy`. Language-neutral artifacts are under
`contracts/admission-policy/1.0.0/`.

## Outcomes and precedence

The only substantive dispositions are:

1. `AUTO_ADMIT_DERIVED`
2. `HUMAN_REVIEW`
3. `PRIORITY_HUMAN_REVIEW`

`REVIEW_INVALID` is only a pre-adjudication quarantine outcome. It is not a
fourth substantive disposition.

Evaluation is monotonic. The policy bundle owns disjoint, closed
`priorityTriggerCodes` and `humanReviewTriggerCodes` vocabularies. A request
reports only detected trigger codes and evidence hashes; it cannot select their
lanes. An unknown code fails closed to `REVIEW_INVALID`. A policy-owned priority
trigger produces priority human review. In its absence, any ordinary-review trigger, non-allowlisted artifact type,
reviewer-independence failure, reviewer/check conflict, unsupported claim,
contradiction, scope mismatch, irreversibility, or reconstruction failure
produces ordinary human review. Only an explicitly allowlisted type that passes
every gate produces `AUTO_ADMIT_DERIVED`. No weighted score can offset a
prohibition.

The reviewer recommendation is hash-bound evidence and is copied into the
receipt, but it is never consulted when choosing an outcome. The reviewer may
return only `AUTO_ADMIT_CANDIDATE`, `HUMAN_REVIEW`, or
`PRIORITY_HUMAN_REVIEW`; it cannot issue `AUTO_ADMIT_DERIVED` or the validity
gate's `REVIEW_INVALID` outcome.

## Deterministic boundary

`evaluateAdmissionPolicy(request, policy)` performs no filesystem access,
network access, model call, clock read, randomness, state mutation, write, or
materialization. Its only platform primitive is deterministic Web Crypto
SHA-256 through the Engine canonicalization module.

A valid policy bundle binds:

- provider identifier, version, and digest;
- Engine name, version, and source commit;
- policy identifier, version, and canonical digest;
- exact request, policy, decision-receipt, and reason-code artifact hashes;
- the complete declared dependency closure; and
- an explicit artifact-type allowlist.
- disjoint closed priority and ordinary trigger vocabularies.

The decision receipt additionally binds the canonical request hash, named input
hashes, validity and deterministic-check inputs through that request, reviewer
assessment hash, dependency-closure hash, outcome, reasons, and its own hash.
Receipt validation enforces closed lane semantics even when a caller recomputes
the self-hash: auto-admission and priority receipts have one exact reason;
ordinary-review and invalid receipts accept only their lane's reason vocabulary;
substantive receipts cannot carry validation diagnostics; auto-admission cannot
carry triggers; and priority review must identify at least one trigger.
Canonical JSON uses the Engine `canonicalJson` rules. Contract files are forced
to LF by `.gitattributes` so raw schema pins are stable across checkouts.

Malformed but canonicalizable requests produce a hash-bound `REVIEW_INVALID`
receipt. A malformed policy bundle, cyclic input, non-finite number, or other
non-canonical input fails closed without producing any disposition.

## Authority limit

Every receipt contains:

```json
{
  "authorityState": "NONE",
  "materializationAuthorized": false
}
```

The provider does not approve an artifact, change canonical knowledge, write a
ledger, activate code or policy, issue credentials, or call a materialization
endpoint. `AUTO_ADMIT_DERIVED` is decision evidence that a separately ratified
consumer may use only within its own independently enforced capability and
transaction boundaries.

Unknown request and policy fields fail validation. Extensions cannot grant
authority. Consumers must verify the exact provider, Engine, policy, schema,
reason-code, dependency, request, input, and receipt pins before relying on a
decision.

## Pinning and vendoring

This proposal does not change the package version and has no tag. A consumer
must not cite it as a released contract until the repository owner ratifies and
publishes an exact upstream commit or release.

After ratification, a language-neutral consumer may vendor only the exact
schema, reason-code, and vector bytes with:

- upstream repository and commit;
- raw SHA-256 and byte length per file;
- contract version;
- Apache-2.0 `LICENSE` and `NOTICE`; and
- a verifier that rejects any mismatch.

JavaScript consumers should additionally pin the package tarball integrity and
the same Git commit. Vendoring these artifacts does not vendor authority and
does not permit a product-specific adapter to redefine the dispositions or
precedence.

## Verification

Run:

```text
npm run typecheck
npm run build
node --test test/admission-policy.test.mjs test/public-api.test.mjs
npm test
npm run check:license
npm run check:nomenclature
npm run pack:check
```

The vector manifest records exact canonical request and receipt hashes for all
four outcomes, including a case where priority and ordinary triggers coexist
and cases where reviewer recommendations disagree with the deterministic lane.
