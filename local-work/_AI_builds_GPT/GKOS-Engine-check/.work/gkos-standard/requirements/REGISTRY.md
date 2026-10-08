# GKOS requirement registry

**Authority:** owner-accepted permanent allocation, 2026-08-05
**Controlling decision:** `decisions/R13_Conformance_Honesty_and_Alignment_Development_Decision_Record.md`
**Development release:** GKOS-2026-08-05 v0.77 — authorized developmental
publication; non-consensus; published under signed tag `v0.77`

This registry is authoritative for the allocated GKOS requirement identifiers.
It is append-only: an allocated ID is never deleted, renumbered, or reused.
Later changes add a dated status/source/replacement mapping below; they do not
rewrite an allocation's original text. `R13-102` is never allocated and cannot
be reused.

## Active allocations

| ID | Original requirement text | Status | Source | Replacement mapping |
| --- | --- | --- | --- | --- |
| `GKOS-CONFORMANCE-001` | If a required fixture expectation is not executed, the fixture outcome MUST be `UNEVALUATED`, not PASS. | Active — GKOS v0.77 | R13-097 | None |
| `GKOS-CONFORMANCE-002` | A profile claim MAY appear only for a catalog-declared complete profile whose required fixtures all PASS. Failed, partial, skipped, divergent, or unevaluated required checks block that claim; a non-qualifying run exits non-zero. | Active — GKOS v0.77 | R13-097 | None |
| `GKOS-CONFORMANCE-003` | A fixture MUST cite GKOS requirement IDs. Implementation diagnostics, output observations, and tests belong in non-normative adapter maps and MUST NOT define the requirement. | Active — GKOS v0.77 | R13-098 | None |
| `GKOS-IDENTITY-001` | A newly authored GKX 2.3 note `uid` MUST be a lowercase RFC 9562 UUIDv7. | Active — GKOS v0.77 | R13-101; owner allocation | None |
| `GKOS-IDENTITY-002` | An existing valid lowercase UUIDv4 note `uid` remains valid and permanent legacy identity. | Active — GKOS v0.77 | R13-101; owner allocation | None |
| `GKOS-IDENTITY-003` | A migration MUST NOT rewrite or substitute a historical note identity merely to adopt UUIDv7. | Active — GKOS v0.77 | R13-101; owner allocation | None |
| `GKOS-IDENTITY-004` | UUID version, timestamp, and lexical ordering confer no authority, priority, or succession preference. | Active — GKOS v0.77 | R13-101; owner allocation | None |
| `GKOS-LINEAGE-001` | Lineage processing MUST preserve every valid direct successor as an explicit branch. | Active — GKOS v0.77 | R13-101; owner allocation | None |
| `GKOS-LINEAGE-002` | Only the earliest temporally valid direct-successor time MAY set a predecessor's derived `invalid_at`; this derivation does not select an authoritative successor. | Active — GKOS v0.77 | R13-101; owner allocation | None |
| `GKOS-LINEAGE-003` | No timestamp, UUID order, lexical order, or implementation tiebreak MAY select an authoritative lineage successor. | Active — GKOS v0.77 | R13-101; owner allocation | None |

## Append-only status and replacement ledger

| Date | Affected IDs | Event | Source | Replacement mapping |
| --- | --- | --- | --- |
| 2026-08-05 | `GKOS-CONFORMANCE-001..003`, `GKOS-IDENTITY-001..004`, `GKOS-LINEAGE-001..003` | Initial permanent allocation; all ten IDs active in GKOS v0.77. | Owner acceptance; R13-097, R13-098, R13-101 | None |
| 2026-08-05 | All ten active IDs | Release status advanced from accepted unpublished target to authorized developmental publication. | Owner release authorization | None |

## Allocation boundary

The registry allocates only the ten IDs above. It does not settle canonical
edge direction, duplicate handling, cycle treatment, resolver precedence,
derived `HEAD`, temporal fallback order, inverse-relationship vocabulary, or
serialization determinism. Those topics remain open until separately adopted.
