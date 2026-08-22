# Lineage-anchored retrieval citations

Phase 2 adds an authorization-scoped provenance envelope to every returned
retrieval hit without changing the Phase 1 citation seal. The implementation
is pinned to Standard study commit
`a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6` and projection profile
`gkx-2.3-validating-projection`; those coordinates are explicit schema-3
manifest and projection-digest invariants.

## Canonical identity and time

`source_id` is the canonical authored GKX UID. `valid_from` is the resolved
canonical `GkxNode.validAt`; `valid_to` is recomputed from canonical resolved
edges after policy/filter restriction. The interval is half-open:
`[valid_from, valid_to)`. The pinned profile supplies no canonical serialized
`lineage_id`, so results and stored rows use `null`; retrieval never guesses
one from graph membership, paths, titles, ranks, or timestamps.

`gkx search --as-of` accepts the existing Engine/GKX timestamp grammar, then
echoes normalized UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`). Temporal eligibility runs
after source policy, typed filters, and whole-source chunk policy, but before
live reads, lexical/vector access, provider calls, ranking, counts, confidence,
or parent expansion. Unknown intervals are never treated as current or
all-time. A nonempty authorized/filtered corpus that cannot answer the instant
returns `TEMPORAL_COVERAGE_INSUFFICIENT`; an empty authorized/filtered corpus
retains ordinary `NO_ELIGIBLE_RESULTS` behavior.

## What a hit proves

Each hit contains `GkxRetrievalProvenance` with source/assertion digests,
assertion time, scoped validity, authorized canonical relationship UIDs,
temporal state, ledger status, lineage-neutral status, stable reason codes, and
a digest computed only from the redacted public envelope. Raw authored
wikilink/title/path references remain internal. Future or denied endpoints are
suppressed silently. An eligible successor may name an authorized historical
predecessor; a historical predecessor selected before transition never names a
future successor.

No verified durable ledger adapter exists in this phase. Consequently
`ledger_binding_verified` is always `false` and `ledger_entry_sha256` is
absent. Source, chunk, or projection digests are not relabeled as ledger
evidence.

The citation itself remains bound to current source bytes: source digest,
chunk content digest, exact zero-based half-open UTF-8 byte coordinates
`[start_byte, end_byte)`, one-based inclusive LF/CRLF-aware line coordinates,
and exact matched slices are reverified against the live file. Stale or forged
byte/line bindings are suppressed. A content-bearing parent context has its
own citation and provenance assertion bound to the parent chunk/content digest.
The complete serialized result envelope, including provenance and parent
context, is subject to the deterministic result-byte budget.

## Freshness and boundaries

Ordinary draft.2 results expose an authorization/time-scoped projection
coordinate rather than the physical derived-store coordinate. Freshness is
`unverified` unless a trusted host has reconciled the scoped view; the CLI may
report `fresh` immediately after scanning and atomically building that exact
snapshot. Failed live citation verification can only degrade freshness to
`stale`.

Decision A is ratified for all four authorization-dependent cross-record
classes: canonical identity collisions; UID/title/path/wikilink endpoint
resolution; forward/inverse/conflicting declaration reconciliation; and
multiple-successor, cycle, or temporal-order topology. These checks run only
over candidates that survive source policy, typed filters, whole-source chunk
policy, and the explicit-`as_of` known-created partition. Hidden and future
candidates are indistinguishable from physical absence. An all-authorized
conflict returns the one non-content-leaking
`RETRIEVAL_AUTHORIZED_VIEW_CONFLICT` outcome before live reads, query-provider
work, ranking, counts, confidence, or citations. The pack is locally frozen at
the eight hashes in the Phase-2 evidence and remains unpublished pending exact
reciprocal and hosted qualification; that publication state does not weaken the
ratified runtime rule. No source-content writes, REST/MCP transport, durable
ledger fabrication, or provider routing restrictions are introduced by this
phase.
