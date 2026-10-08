# R12 — Ecosystem Compatibility Development Decision Record

**Date:** 2026-08-03  
**Status:** Accepted development decision  
**Authority:** Founder and Initial Editor under `GOVERNANCE.md`  
**Classification:** Normative-compatible development policy and implementation coordination

## Status limitation

This record adopts ecosystem policy during the pre-standard v0.x development
period. It is not a consensus ratification, independent certification,
accredited standards decision, or proof of approval by the future GKOS v1.0
governance body.

## Decision

### R12-090 — Engine-Lite compatibility

GKOS-Engine-Lite MUST use the implementation path of its pinned GKOS Engine for
`validate`, `assess`, `graph`, and `export`. Given identical input,
configuration, arguments, Engine version, and policy version, Lite MUST produce
the same validation decisions, diagnostic identifiers and severities,
assessments, graph semantics, and Graphiti projections as that Engine.

Canonical serialized result bodies MUST be byte-identical when the command and
Engine version are identical. Volatile values—including generation timestamps,
host paths, and platform line endings—MUST be normalized or expressly excluded
from a byte-equality claim. Lite MUST read every GKX dialect readable by its
pinned Engine, including the Machine Dialect, but need not expose every Engine
workflow or future command.

The normal release target remains an Engine-verbatim, same-day pin bump. The
maximum permitted lag for a release presented as current Engine-Lite is one
Engine minor version and never a major version. Security, data-integrity,
fail-closed, and schema-authority fixes override that allowance and require
prompt adoption or backport. A build more than one minor behind MUST be labeled
a frozen compatibility release. Each Lite release MUST disclose its exact
Engine version, resolved commit, policy identity/hash where output is produced,
and supported GKX dialects.

### R12-091 — What Lite removes

Engine-Lite contains the full deterministic parsing, projection, validation,
assessment, graph, and export semantics of its pinned Engine while restricting
the commands, workflows, documentation, and operational surfaces presented to
home users. It is neither a second validator nor a permissive subset. Optional
assistance remains proposal-only and non-authoritative.

Engine-Lite MUST NOT independently weaken, replace, or reinterpret canonical
GKX validation requirements.

### R12-092 — Field-test to standard loop

Implementations MAY run ahead only behind an explicit experimental designation
or feature boundary. Products collect fixtures, failure cases, compatibility
effects, and field evidence. A behavior becomes normative only after a proposal,
Decision Record, review, and acceptance through GKOS governance. Once adopted,
claiming implementations conform within the declared transition window.

Shipping code does not amend GKOS or GKX. Implementation experience supplies
evidence; it does not exercise unilateral standards authority.

### R12-093 — GKX version identity

GKX 2.3 is the renamed continuation of the OKF+ 2.2/2.3 technical exchange
line; the naming transition does not restart versioning at GKX 1.0. OKF+ 2.2
identifies the historical human-oriented note format, OKF+ 2.3 identifies the
historical flat and nested exchange dialects, and GKX 2.3 is the current name
on the continued line with the corresponding identifiers retained as
compatibility aliases. A later breaking technical revision is expected to use
GKX 3.0.

### R12-094 — Google OKF 0.2 interoperability

GKX maintains an optional, version-scoped interoperability projection for the
declared supported subset of Google Cloud Open Knowledge Format 0.2. This is
not an obligation to follow later Google releases and does not establish Google
OKF as GKX's normative foundation.

The interoperability profile MUST identify source and target versions,
supported fields, lossless and lossy mappings, synthesized values, unsupported
constructs, import-conflict behavior, round-trip expectations, conversion
provenance, and conformance fixtures. Support for a later Google OKF version
requires a separate compatibility decision, profile version, and fixture set.
Unqualified “superset” claims are prohibited.

### R12-095 — One deterministic semantics authority

A product that parses, validates, assesses, canonicalizes, migrates, or creates
authoritative GKX structures MUST embed or directly depend on GKOS-Engine, or
declare a frozen verified baseline and approved differences. A product that
only visualizes, transports, indexes, or presents hash-bound canonical Engine
output MAY consume that output without embedding the Engine.

Engine-Lite directly pins Engine. Active KRS uses Engine for authoritative GKX
operations while retaining product-specific visualization code. Frozen KRS-Lite
may retain its verified vendored baseline with reviewed backports and
machine-checked differences. That exception does not create a second authority.
An independently reimplemented validator may claim equivalence only as an
intentional independent conforming implementation backed by conformance
evidence.

### R12-096 — Accurate interoperability provenance

Remove the claim that OKF+/GKX was developed “without reference to” Google OKF.
Use provenance language that acknowledges the later interoperability work
without asserting that Google OKF was GKX's original foundation, without making
an unsupported priority claim, and without implying Google sponsorship or
endorsement.

## Compatibility and security impact

This decision preserves stable `okf*` commands, `okf_version`, profile URIs,
diagnostic identifiers, migration values, imported identifiers, and existing
documents. It tightens claims and release labeling; it does not rewrite user
content. Preventing a reduced Lite validator and bounding version drift reduce
the risk that home users receive silently weaker validation.

## Required evidence and follow-up

1. Add cross-repository fixtures comparing Engine and Engine-Lite canonical
   outputs with documented volatile-field masks.
2. Publish the Google OKF 0.2 interoperability profile and fixtures before
   claiming conformance to that projection.
3. Keep exact pins and frozen-baseline differences current in `COMPAT.md`.
4. Classify experimental behavior in product documentation and change records.
5. Reconsider these development decisions through the future v1.0 governance
   process; do not silently promote them to consensus ratification.
