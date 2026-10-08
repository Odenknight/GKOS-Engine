# GKX adapter limits

**Document version:** 0.1.0  
**Status:** proposed development rule — requires Shaun’s acceptance before discovery results are evaluated  
**Authoring agent/model:** Terra / ChatGPT Work  
**Date:** 2026-08-03  
**Evidence classification:** proposed policy  
**Disposition:** P1.4 proposed; no adapter is authorized

## Allowed adapter scope

An adapter may normalize transport encoding, field spelling, deterministic serialization, documented legacy labels, and explicit one-to-one syntax aliases. It must be separately versioned, deterministic, testable, reversible where applicable, and unable to add, discard, infer, promote, authorize, validate, or alter semantic meaning.

## Prohibited adapter scope

An adapter must not synthesize required objects, invent provenance or authority, repair missing evidence, upgrade epistemic state, create decisions or receipts, bypass mandatory controls, hide divergence, call the Engine as an oracle, or map materially different lifecycle/governance semantics.

## Size and responsibility limit

The adapter must be a narrow translation boundary, not a shadow implementation: its code and tests must be independently reviewable, operate only at import/export boundaries, and have no persistence side effects. Each mapping needs a clause citation, source/target schema evidence, and declared losslessness status.

## Result rule

A candidate that needs semantic transformation is not native conformance. It may only be considered rule-qualified mappable compatibility after this rule is accepted before execution, the matrix identifies every delta, and the frozen full profile passes.

## Change control

No change to this rule may be used to reinterpret an already-observed candidate result. Changes require a new dated operator decision and a new fixture/profile run.
