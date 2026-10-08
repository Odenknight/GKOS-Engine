# ADR-0000: Record architecturally significant decisions as ADRs

Date: 2026-08-20

## Context

GKOS-Engine has durable contracts for deterministic GKX processing, Navigation,
governance, Graphiti projection, the command line, package exports, and the
loopback desktop service. The functional uplift adds further decisions whose
effects span stored projections, security boundaries, Full/Lite parity, and
packaging. Those decisions cannot safely live only in implementation comments,
an issue, or a transient execution conversation.

The owner-supplied functional-uplift build packet requires decision records with
Context, Decision, Alternatives rejected, Consequences, Status, and Evidence.
GrooveSeek uses a similar repository-local ADR practice at study commit
313514b793d12ea5c3b8eedc32fd213212e38d75. That project was studied as evidence;
its prose is not adopted as GKOS authority.

## Decision

Architecturally significant GKOS-Engine decisions are recorded under
docs/decisions as consecutively numbered Markdown files.

Each record:

1. states the exact problem and authority boundary;
2. identifies the selected outcome;
3. records meaningful rejected alternatives;
4. names adverse as well as beneficial consequences;
5. has one of Proposed, Accepted, Rejected, Deprecated, or Superseded status;
6. cites reproducible evidence, including exact commits where another
   repository was studied; and
7. is superseded by a new ADR rather than rewritten to conceal a prior
   decision.

An ADR records why a boundary exists. Tests and contracts remain the executable
proof, current documentation describes how the system behaves, and evidence
reports record what was actually run.

## Alternatives rejected

- Keep rationale only in source comments or release notes. This scatters the
  decision and normally omits rejected alternatives.
- Use issue or pull-request discussion as the canonical record. That evidence
  is not guaranteed to be present in an offline source package.
- Edit old ADRs in place when policy changes. That destroys the historical
  decision and makes later behavior appear inevitable.
- Treat an ADR as authority to change GKX. Repository decisions implement the
  pinned Standard and owner direction; they do not amend either.

## Consequences

- Significant design changes add a small documentation cost before code lands.
- Review can distinguish a verified fact, a selected implementation policy, and
  an unavailable dependency.
- Future reversals remain auditable.
- Routine local choices do not require ADRs unless they affect a contract,
  authority boundary, security posture, persisted state, or cross-repository
  compatibility.

## Status

Accepted. The owner-supplied build packet explicitly requires this record and
ADR-0001 through ADR-0005 before implementation of the affected architecture.

## Evidence

- Full baseline:
  2fbd4ec68ec825b09e5194c9878a7ae90a281392.
- GrooveSeek study commit:
  313514b793d12ea5c3b8eedc32fd213212e38d75.
- GrooveSeek ADR practice:
  docs/decisions/0000-record-decisions-as-adrs.md at that commit.
- Full Phase 0 report:
  evidence/2026-08-20-functional-uplift-phase-0.md.
