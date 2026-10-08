# R11 — GKX Naming Transition Development Decision Record

**Status:** Accepted development decision; compatibility migration in progress  
**Date:** 2026-08-02  
**Scope:** GKOS technical exchange model and conforming implementations

## Decision

The technical knowledge representation and exchange model previously named
**OKF+ (Open Knowledge Format Plus)** is renamed **GKX (Governed Knowledge
Exchange)**.

GKOS remains the governance standard. GKX is the technical exchange model used
by GKOS-conforming implementations. The rename clarifies that the model is not
an extension of an unrelated Open Knowledge Format and gives the GKOS ecosystem
a distinct, governable technical identity.

## Compatibility rule

This decision changes the canonical human-facing name immediately. It does not
silently break existing documents or integrations.

- Existing OKF+ 2.2 and 2.3 documents remain valid compatibility inputs.
- Existing machine identifiers, field names, storage paths, command names, and
  protocol identifiers remain supported until a separately versioned schema
  migration defines replacements and deprecation periods.
- Current documentation should say “GKX (formerly OKF+)” on first use when the
  compatibility context matters.
- Historical records retain the terminology in force when they were written.
- New normative artifacts should use GKX as the canonical display name and
  explicitly document any retained OKF+ compatibility identifier.

## Required implementation work

1. Inventory externally observable OKF+ identifiers across the standard,
   engines, products, fixtures, and adapters.
2. Classify each identifier as display-only, compatible alias, deprecated, or
   breaking.
3. Publish versioned GKX schemas and conformance fixtures before changing
   machine-readable identifiers.
4. Require readers to accept the documented legacy aliases during the stated
   compatibility window.
5. Add terminology checks to prevent current-facing documents from presenting
   OKF+ as the canonical name outside an approved compatibility context.

## Non-decision

This record does not select a new schema version, remove an alias, or authorize
an in-place rewrite of user documents. Those are separate compatibility and
release decisions.
