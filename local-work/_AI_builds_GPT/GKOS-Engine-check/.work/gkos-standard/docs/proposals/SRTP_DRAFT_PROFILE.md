# Scientific Research Trace Profile (SRTP) draft

**Profile:** `SRTP-DRAFT-0.1`
**Status:** build proposal; provisional, informative, non-normative
**Last adopted baseline:** GKOS-2026-08-05 v0.78 / GKX 2.0

SRTP is a proposed application profile over the existing seven GKOS layer
responsibilities. It demonstrates how research questions, immutable data and
environment snapshots, execution requests, actual run manifests, events,
artifacts, findings, results, reruns, and re-entry receipts can form one
testable trace. It does not add a layer and is not a qualifying GCP profile.

The draft vocabulary is namespaced with `srtp:`. Relations distinguish use,
generation, execution, parameterization, review, comparison, invalidation, and
re-entry rather than collapsing them into `derived_from`. Each relation can
carry a W3C PROV mapping and explicit loss markers when semantics cannot
round-trip.

The draft runner evaluates graph behavior, not just individual documents. It
checks version coordinates, reference resolution, immutable authorization
bindings, environment and code presence, event hash linkage, artifact/source
digest equality, numeric-claim traceability, reviewer independence,
deterministic-finding precedence, raise-only sensitivity, context expiry, and
complete digest-bound L7-to-L1 re-entry.

Permitted claim language is:

> This implementation produced an SRTP draft trace evaluated by fixture suite
> X. The following checks passed, failed, or remain unevaluated.

“GKOS scientifically validated,” “proved true,” and “fully reproducible” are
not supported by this draft. Any future reproducibility statement must name the
profile, suite, evidence, tolerances, exceptions, and verification status.

Promotion requires governance allocation of permanent requirement identifiers,
resolution of provisional L1/L6/L7 and authority dependencies, complete
fixtures, reference plus independent implementations, and scientific-reviewer
workshop evidence.
