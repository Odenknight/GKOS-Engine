# Generic admission-policy provider v1 implementation report

Date: 2026-08-26

Original base: `Odenknight/GKOS-Engine` at `2fbd4ec68ec825b09e5194c9878a7ae90a281392` (`2.1.2`)

Reconciled base: current main at `c0eac9351b73bfa4b93b2c0cb752fd55c0b88933` on 2026-08-27

Branch: `agent/admission-policy-provider-v1`
Status: implementation evidence only; unratified, untagged, and unreleased

## Implemented surface

- Strict draft-2020-12 policy, request, and decision-receipt JSON Schemas.
- Closed contract reason-code registry.
- Policy-owned, disjoint closed trigger lanes; requests report detections and
  cannot pre-classify or downgrade a priority trigger.
- Synthetic policy and four replay vectors with exact request and receipt hashes.
- Product-neutral TypeScript types, strict validators, deterministic evaluator,
  receipt verifier, and configuration error.
- Isolated `gkos-engine/admission-policy` package export; the frozen root export
  remains unchanged.
- Build, declaration, pack, public API, replay, precedence, fail-closed,
  tamper, dependency, and purity coverage.
- Authority-boundary and safe pinning/vendoring documentation.

## Authority and effect limits

The evaluator is contract-only. It performs no I/O, network access, clock read,
randomness, model invocation, storage mutation, or materialization. It contains
no downstream product name. It records reviewer recommendations without using
them to select a lane. Every decision receipt sets `authorityState` to `NONE`
and `materializationAuthorized` to `false`.

No package version, tag, release, policy activation, or authority pin was
created. The synthetic vector Engine commit and provider digests are fixture
values and must not be interpreted as release identities.

## Major issues and decisions

1. The previously inspected 2.0.1 Engine pin contained no admission-policy
   provider contract. This change is based on current 2.1.2 main and therefore
   requires a separately reviewed owner ratification and exact new commit pin
   before any consumer can freeze it as upstream authority.
2. The contract deliberately supplies no materialization callback or storage
   adapter. Adding either would cross the bounded provider authority boundary.
3. Invalid policy configuration and non-canonical input fail without a
   disposition because a trustworthy receipt cannot be formed without valid
   provider/policy bindings. Canonicalizable request failures use
   `REVIEW_INVALID` and remain pre-adjudication.
4. Runtime validation uses the shipped Draft 2020-12 schemas plus the mandatory,
   hash-pinned language-neutral semantic rules for cross-item uniqueness and
   trigger-lane disjointness that JSON Schema cannot express. Ajv executes the
   real schemas against positive and adversarial vectors. A future contract
   change must change its pins and vectors rather than weakening validation.
5. This proposal does not amend the GKOS Standard. Upstream governance must
   either attach the corresponding Standard proposal/decision or explicitly
   ratify the bounded Engine contract exception before release.
6. Root review found and corrected two pre-handoff semantic defects: reviewer
   recommendations originally reused disposition vocabulary, and requests
   originally pre-classified triggers by lane. The final contract uses the
   candidate-only reviewer vocabulary and policy-owned closed trigger lanes;
   adversarial tests prevent either regression.
7. A subsequent independent strictness review found that a caller could
   recompute a valid receipt self-hash after mixing reason codes from incompatible
   lanes. Runtime validation and the distributed receipt schema now enforce the
   same closed, outcome-specific reason sets and substantive trigger/diagnostic
   relations. Adversarial tests repin each mutation before requiring rejection.
8. Current-main reconciliation made the old receipt verifier's scope explicit:
   it checks only shape, pins, and a self-hash. The new context verifier replays
   the exact request and policy and rejects self-consistent receipts from any
   different context.

## Code rewrites

No existing algorithm was rewritten. Changes are isolated to a new
`src/admission-policy/` module, subpath export/build/package wiring, two test
files, new contract artifacts, and documentation/evidence. The package remains
version `2.1.2` as instructed.

## Verification record

Executed on the handoff worktree:

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; core, admission-policy subpath, declarations, and existing bundles built |
| `node --test test/admission-policy.test.mjs test/public-api.test.mjs` | PASS; 12/12 |
| `npm test` | PASS; 254 passed, 1 externally gated SRTP fixture skipped, 0 failed |
| `npm run check:license` | PASS; Apache-2.0 metadata consistent |
| `npm run check:nomenclature` | PASS; zero unapproved matches |
| `npm run pack:check` | PASS; 172 files, 425,407 bytes |

The one full-suite skip predates this change and declares its unavailable
external `gkos-standard` science fixture catalog. It is not admission-policy
coverage and was not converted to a pass.
