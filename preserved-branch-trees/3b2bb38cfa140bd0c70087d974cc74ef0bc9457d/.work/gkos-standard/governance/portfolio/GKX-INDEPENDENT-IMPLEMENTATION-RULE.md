# GKX independent-implementation rule

**Document version:** 0.1.0  
**Status:** proposed development rule — requires Shaun’s acceptance before a qualifying result is evaluated  
**Authoring agent/model:** Terra / ChatGPT Work  
**Date:** 2026-08-03  
**Evidence classification:** proposed policy  
**Disposition:** P1.4 proposed; P2/P3 blocked pending ratification

## Qualification

A second implementation qualifies only when it is implementation-independent of GKOS Engine’s implementation path and passes the frozen required profile. Operator attestation is evidence of origin, not code-level independence.

## Independence criteria

| Criterion | Pass evidence | Fail / indeterminate condition |
|---|---|---|
| Separate implementation path | repository history and source audit show no copied Engine implementation | copied shared implementation or inaccessible required history |
| Separate execution and validation paths | candidate does not invoke Engine code, Engine CLI, Engine validators, or generated Engine outputs as its own runtime/validator | any required shared execution/validation path |
| Separate dependencies | lockfiles and manifests do not import Engine implementation packages | undeclared, vendored, or transitive implementation sharing not resolved |
| Distinct provenance | authorship, generated artifacts, and history are auditable | provenance cannot be examined |
| Standards artifacts only | shared use of published normative text, schemas, and frozen public fixtures is documented | private Engine behavior becomes the oracle |

## Evidence procedure

Record commit SHAs, dependency manifests and locks, source-path comparisons, commit-history findings, provenance, generated-output origin, commands, and limitations. Every criterion receives pass, fail, or indeterminate; one indeterminate criterion prevents qualification.

## Closure authority

Shaun may accept a disclosed v0.x development disposition but must not describe it as independent certification or consensus ratification. A qualifying second implementation remains a future v1.0 governance claim.

## What this rule does not permit

It does not count Engine-Lite, allow self-certification, turn analogous governance features into GKX implementation evidence, or authorize modifying KRR.
