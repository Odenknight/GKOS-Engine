# GKOS-DOCSTD-001 — Documentation and engineering alignment proposal

**Status:** Proposed; non-normative until adopted through `GOVERNANCE.md`  
**Purpose:** Keep specification and implementation synchronized without making
the reference implementation the specification authority.

## 1. Prohibited failure modes

- **Silent harvest:** an implementation behavior becomes normative merely
  because it shipped or has tests.
- **Specification fiction:** shipped divergence remains undisclosed while the
  standard claims a different behavior.

R12-092 supplies the controlling direction: experimental implementation
behavior is evidence for a proposal, not an automatic amendment.

## 2. Requirement identity and adapter boundary

Every executable normative statement should receive an append-only stable ID in
the proposed form `GKOS-<AREA>-<NNN>`. A retired ID is never reused and points to
its successor.

Fixture expectations should reference only GKOS requirement IDs. An
implementation-specific adapter map translates a requirement into observable
codes, fields, exit status, graph structure, or canonical bytes. A diagnostic
code alone is not a requirement and cannot define one.

This namespace and its retirement rules remain an owner decision. Existing
fixture diagnostics must remain visibly non-qualifying until it is adopted;
they must not be mechanically relabeled as GKOS requirements.

## 3. Controlled derivation and comparison

For an under-documented area:

1. freeze and identify the normative-only source corpus;
2. exclude reference implementation material from the drafting phase;
3. anchor every derived clause or mark it `NEW`;
4. seal the draft by commit and content hash;
5. compare separately against source, tests, and executed behavior; and
6. classify the result as MATCH, SPEC-GAP, ENGINE-DIV, or AMBIGUOUS.

| Class | Meaning | Required route |
| --- | --- | --- |
| MATCH | Behavior satisfies an independently derived clause | Map and test |
| SPEC-GAP | Coherent implementation behavior lacks a clause | Intent review, then amendment proposal or implementation divergence |
| ENGINE-DIV | Behavior conflicts with an anchored clause | Divergence record and implementation fix |
| AMBIGUOUS | Normative sources permit multiple readings | Owner decision; no conformance fixture for that point meanwhile |

The source restriction is process evidence, not proof of organizational
independence. Shared authorship must still be disclosed.

## 4. Intent review

An implementation behavior is eligible for amendment review only if it
preserves all applicable accepted invariants:

| Invariant | Controlling source | Failure condition |
| --- | --- | --- |
| Authority derives from receipts/grants, not authored fields or model signals | R2; master standard §4 | Frontmatter, confidence, similarity, rank, or model agreement creates authority |
| Contradiction and history remain visible and reconstructable | R3; master standard §5 | A conflict or losing branch is silently deleted or absorbed |
| Mandatory controls and conformance evidence are deterministic and disclosed | R5; master standard §8 | A required check is skipped, non-reproducible, or reported as PASS |
| Agent specialization grants capability, not authority | R6; master standard §7 | A projector, agent, or convenience surface acquires semantic authority |
| Missing/invalid sensitivity fails closed | R7; master standard §9 | Missing or invalid input widens exposure |
| Implementation experience proposes but does not amend | R12-092 | Shipped behavior is copied into the standard without review and decision |
| Identity is independent of path/location | R4/GCP-2; master standard §6 | Rename or movement changes governed identity |

Passing intent review makes a behavior eligible for a decision; it does not
adopt the behavior.

## 5. Synchronization gates

- Generate consumer version claims from dependency locks or verify them in CI.
- Require every new implementation diagnostic to map to a GKOS requirement or
  declare itself implementation-internal.
- Add `Doc impact: none | README | standard-clause | divergence` to implementation
  pull requests, with a linked standard issue for the latter two values.
- Generate a requirement → adapter observation → source → test trace report.
- Reject a profile claim when any required expectation is failed, partial,
  skipped, divergent, or unevaluated.
- Change normative text only through a decision-record-linked pull request.

## 6. First application

Apply this process to Layer-3 graph semantics. Preserve unresolved decisions for
the multiple-successor tiebreak, HEAD derivation scope, UUID profile rules, and
any other behavior not compelled by the frozen normative corpus.

The first completed artifact should be the sealed normative-source clause draft,
not an Engine-derived adapter map. The adapter map follows only after the clause
identities exist.
