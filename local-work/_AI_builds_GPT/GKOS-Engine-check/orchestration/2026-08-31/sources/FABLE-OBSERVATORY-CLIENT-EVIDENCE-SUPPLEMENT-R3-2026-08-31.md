# GKOS Observatory — Client Evidence Supplement (r3)
**Date:** 2026-08-31 · **Client:** Claude, Cowork lane only · **agent_id:** 01a0552a-ff55-7272-8b25-371b6adfdff8 · Companion to Test Report r2. Firsthand observations unless marked [OPERATOR] or [ESTIMATE].
**r3 change:** §2a added — operator/engineering corrections that supersede two of my §2 interpretations (audit digest/warnings, head semantics) and revise the telemetry framing. Original text retained below for the record, marked SUPERSEDED where applicable.

Generations: **A** = 972741866209841 · **B** = 1860037500330502.

## 1. Sanitized call ledger (chronological, all firsthand)

| # | Tool | Key args | Req ID | Gen | Outcome / recovery |
|---|---|---|---|---|---|
| 1 | capabilities | — | 01a05662-7085 | A | 9/9 available |
| 2–4 | search | "LuSaur…" variants; limits 5–15; #4 with path_include ["**/*.md"] | 01a05662-849d, 01a05663-642d, 01a05663-f407 | A | AUTHORIZED_VIEW_CONFLICT ×3 → switched to navigation |
| 5 | search | "R720", limit 10 | 01a05670-1b3a | A | CONFLICT (confirmed deterministic; stopped retrying) |
| 6 | nav_discover | cursor from a prior-turn page | 01a05670-abaa | A | REFERENCE_UNKNOWN → restarted null |
| 7 | nav_discover | null, limit 100 | 01a05670-bf36 | A | 100 items |
| 8 | note_read | R720 ref, 16384 B | 01a05670-d9c5 | A | complete (11,692 B, single page) |
| 9 | nav_discover | null, limit 1 (scope acquisition) | 01a05685-bc23 | A | scope gkscp1_TTrOwApl… issued |
| 10 | graph_at_time | at 2026-08-24T00:00:00Z (no millis), not_yet_created | 01a05685-d319 | A | INVALID_PARAMS — two variables changed on retry; later isolated to timestamp [OPERATOR], confirmed clean at #35 |
| 11–14 | graph_at_time | at …00.000Z, valid; cursor chain 50/50/100/100 | 01a05685-ee2d, 01a05686-1f6b, -499a, -9526 | A | 300 items, one stable snapshot |
| 15 | graph_at_time | cursor cont. after long reply | 01a05694-2e08 | A→? | REFERENCE_UNKNOWN. Next call showed Gen B. Cause not established client-side |
| 16 | nav_discover | null, limit 1 | 01a05694-5515 | B | all record_refs changed vs Gen A; canonical paths unchanged |
| 17–22 | nav_discover | cursor chain, limit 100 ×5 + final | 01a05694-7bd7, -b50e, -d4fe*, -f45f, 01a05695-1c0d, -4deb | B | full traversal, terminating page (*3rd id approximate — transcript retains prefix 01a05694) |
| 23 | note_read | Game_Dev MOC, 8192 B | 01a05695-7d80 | B | complete (590 B) |
| 24 | capabilities | — | 01a0569a-3b8f | B | 9/9 |
| 25–30 | nav_discover | fresh chain ×6, limit 100 | 01a0569a-4f04, -6a72, -9ffb, -d010, -e99a, 01a0569b-0c29 | B | **584 items**, stable snapshot 01a0569a-4f04-7c51…, ordered, no boundary dups, terminated |
| 31–32 | note_read | 58,614-B note, limit_bytes 4096, cursor chain | 01a0569b-810b, -9c4f | B | contiguous offsets 0/4096, stable source_digest |
| 33–34 | search | exact admitted phrase; scoped ["AI_LLM/Specs/GKOS/**"] then unscoped | 01a0569b-bd9d, 01a0569c-4248 | B | CONFLICT ×2 (refusal, per coherence design) |
| 35–37 | note_read ×3 | R720 ref, 64 B | 01a0569d-5ae2, -71a4, -b903 | B | byte-identical; latency not instrumented |
| 38 | graph_at_time | at 2026-07-01T00:00:00.000Z, valid | 01a0569e-1ad2 | B | exactly 3 records (valid_at May–Jun); terminating |
| 39 | capabilities | — | 01a056aa-2c20 | B | unchanged |
| 40 | nav_discover | null, limit 1 | 01a056aa-556d | B | artifact_digest identical to #25 ⇒ catalog unchanged, O(1) check |
| 41 | search | same phrase, unscoped | 01a056aa-7518 | B | CONFLICT (expected; no repair run) |
| 42 | graph_at_time | **clean repro:** at …00.000Z, not_yet_created, limit 10 | 01a056ab-1545 | B | **200 OK, empty items** — enum works; #10 was timestamp-only |
| 43 | record_validate | R720 ref | 01a056af-24fa | B | valid:true; diagnostics [GKX-PROVENANCE-001, warning] |
| 44 | record_assess | R720 ref | 01a056af-4b3d | B | scored (see §2) |
| 45 | lineage_get | R720 ref, limit 20 | 01a056af-6902 | B | 1-item lineage; head:false (expected — see §2a) |
| 46 | navigation_audit | scope, severity≥warning, limit 50 | 01a056af-87a5 | B | 50 warnings, has_more (adapter defect — see §2a) |

[OPERATOR] items not in this ledger: 45-s pause traversal success; 33.38 s / 34.35 s successful scoped searches; 15.01 s concurrent setup; 584/2,051 admission inventory; timestamp isolation; Game_Dev targets exist in source vault. [ESTIMATE] items: ~130k tokens/traversal; 5–8× compact-response saving; both uninstrumented.

## 1a. Filmed star-chart tour addendum (r2, wall-clock instrumented, Gen B throughout)
Timestamps are client-side `date -u` brackets around the calls; they bound end-to-end time including bridge transit, not Engine execution time [per operator: treat all timings here as client-observed page-cycle duration].

**Leg 1 — completion of original enumeration** (snapshot 01a056b6-876f):
- 07:37:14.752Z → page 5 (01a056c0-5936, 100 items) → 07:37:26.862Z → page 6 (01a056c0-8d21, 84 items, has_more:false). Confirms 584 = 5×100 + 84 within one snapshot.

**Leg 2 — landings** (07:37:41.820Z onward): note_read ×14 across all top-level regions (Index_Master_MOC, FAC, Physics, Game_Dev, Leadership quotes, Living_WIKI, KnightTriton, Automotive, Business_Structure, Thoughts, GitHub, MediStatsAI, YouTube_lessons MOC, R720), limit_bytes 512–600, req IDs 01a056c1-b092 … 01a056c3-79b1; each landing opened its own snapshot_id (note_read snapshots are per-call, unlike discover chains). Diagnostics: record_assess Rule_Set_Handbook (01a056c3-a21c — relationship_integrity 0, GKX-IDENTITY-003/004, overall 1833 bp, consistent with prior run), record_validate Index_Vault_Report (01a056c3-bd84 — valid, GKX-PROVENANCE-001), lineage_get quotes (01a056c3-d9c2 — single node, head:false, expected per §2a), navigation_audit (01a056c4-0243 — NAV_STABLE_ID_MISSING and digest dd72477a… ≠ discover 721682b3…; both now attributed to the audit adapter defect, §2a).

**Leg 3 — second full enumeration on request** ("Again"): fresh chain, snapshot 01a056c4-5bd4, 6 pages (01a056c4-5bd4, -76a7, -9351, -b8d4, -f552, 01a056c5-1f95), started 07:41:26.449Z, terminated has_more:false 07:42:56.587Z — **~90 s wall clock for a full 584-record sweep** (~15 s/page-cycle end-to-end, consistent with the earlier measured 16–19 s). artifact_digest identical to Leg 1 (721682b3…) ⇒ admitted view unchanged across both passes. Operator's star-chart viewer rendered the agent ship on both passes (operator-confirmed visually; second video upload failed client-side, not evidence-bearing).

**New defect observation — INVALID_PARAMS gives no field-level hint.** After idle, calls omitting schema-required-but-nullable params were rejected: note_read without `cursor`/`limit_bytes` (01a056c0-c1f1 at limit_bytes 600, -e24a at 1024, -fd5c bare ref) and nav_discover without `cursor` (01a056c4-3815). All returned only `GKOS_P6_INVALID_PARAMS` + error_digest — no indication of which field or whether the failure was missing-vs-malformed. Cost: 3–4 wasted round trips per rediscovery. Strict required-nullable is defensible contract design; mute rejection is the defect. Full handoff: see `claude/GKOS-Engine-Handoff-INVALID_PARAMS-2026-08-31.md`.

## 2. Existing-tool usefulness (request item 2)
**Much of the "step 1 diagnostic surface" already exists, scattered across three tools.** The gap is narrower than a new interface: it is search-refusal-specific preflight plus reason semantics/disclosure rules.

- **gkos_record_validate** — already matches half the proposed contract: stable code (`GKX-PROVENANCE-001`), severity, correlation IDs, bounded to a record I'm authorized on. Missing: safe explanation text and permitted-next-action. [Per operator: validation stays useful independently of assessment; sampled valid:true results don't make it redundant.]
- **gkos_record_assess** — deterministic per-record scores in basis points across 7 dimensions with explicit exclusions and `truth_authority: false`. R720: structural_completeness 6000, provenance_quality 0, relationship_integrity 10000, review_readiness 2000, overall 4333; excluded: contradiction/evidence/freshness. A bulk/batched form over a scope would let an agent rank candidates without reading content. [Per operator: assess scores describe documentation/support quality, not topic relevance or project status — it complements, but does not replace, a content summary.]
- **gkos_lineage_get** — works; returned single-version lineage. ~~Anomaly: head:false on sole/latest versions vault-wide~~ **SUPERSEDED by §2a**: expected semantics.
- **gkos_navigation_audit** — per-record warning codes over the authorized scope. Observed: `NAV_STABLE_ID_MISSING` (pervasive), `MOC_NAME_NONCANONICAL`, `MOC_NAME_CASE_ANOMALY`; audit artifact_digest dd72477a… ≠ discover 721682b3…. ~~Presumably audit-artifact vs catalog-artifact~~ **SUPERSEDED by §2a**: adapter defect explains both the pervasive stable-ID warnings and the digest mismatch.

Implication (still stands, adjusted): extend validate/audit codes to cover admission/identity/relationship/index-readiness causes; add safe-explanation + next-action fields to existing envelopes; add a scope-level assess/audit rollup for repair before/after — after the audit adapter is fixed, since current audit output is not repair-grade evidence.

## 2a. Operator/engineering corrections (r3) — supersede parts of §2
Source: operator engineering review with local reproduction against Engine source (`src/service/mcp.ts`, `src/temporal.ts`, `src/graph.ts`); releases verified as Engine `pagination1`, viewer `traversals1`, deployed asset hashes matching inspected files. Marked [OPERATOR] — reproduced on their side, not observed through my MCP seat.

1. **Audit adapter defect explains two of my findings at once.** Discovery supplies each source's `stableId`; the audit adapter omits it. Hence (a) `NAV_STABLE_ID_MISSING` appears pervasively even where identities exist, and (b) the audit snapshot digest differs from discovery's because identities participate in hashing. Reproduced locally with identical source content. **Consequence: the pervasive stable-ID warnings must not drive vault repairs; fix the adapter, add regressions for identity warnings and digest consistency, then reassess.** My "audit-artifact vs catalog-artifact" hypothesis is withdrawn.
2. **`head:false` is expected for standalone records.** Engine defines HEAD as "participates in a resolved lineage and has no successor," so a standalone current record is head:false by definition (operator-confirmed by synthetic test). Also, lineage_get returns the record plus direct authorized lineage neighbors — not the full historical version population. Documentation gap, not a vault-wide HEAD repair. My §2 anomaly flag is withdrawn.
3. **Identity codes GKX-IDENTITY-003/004** mean duplicate UIDs and conflicting source content. The mirrored FAC/Documents ↔ FAC/Training/Guides filenames and Dropbox sync-copy names are investigation leads, not proof the repair is mechanical — repair remains judgment-bearing and reviewed.
4. **Star-chart bypass hypothesis fully retired.** The MCP runtime emits traversal events through a shared post-execution path (extension tools included); the server filters event paths by the viewer's authorized view, not by agent ID. Behaviors that can produce missing markers without any defect: watching must be explicitly started; no replay of pre-watch events; no auto-reconnect after interruption; renderer retains only 25 traversal steps with an 8-s pulse and 60-s trail; traffic heat off by default. At the measured 15–19 s page cadence, one page's pulse can fade before the next arrives — a full enumeration will never leave all 584 stars lit. Known verification gap: browser tests assert event-list delivery, not that events produce rendered markers.
5. **Timing evidence reclassified:** my wall-clock figures are client-observed page-cycle duration (bridge transit included), not Engine execution time; per-page extrapolations remain estimates.

## 2b. Operator's updated next steps (recorded 2026-08-31)
1. Fix audit snapshot construction; regression tests for identity warnings and digest consistency.
2. Extend existing diagnostics with search-coherence explanations, safe next actions, bounded rollups.
3. Add compact discovery, reference resolution, bounded excerpt access.
4. End-to-end telemetry verification: one known note_read with observer connected first, matching its request ID through event delivery to rendering. (Client seat ready to fire the single note_read on cue once the observer is watching.)
5. Retain the coherent-search control and genuinely fresh-context acceptance test.
Full traversals paused pending the telemetry test — no more constellation sweeps until asked.

## 3. Minimal consumer requirements (request item 4)
To **choose a note**: canonical_path, short title/description, record_ref, classification, valid_at — target ≤150 B/row (observed ~500 B). evidence_codes/management/name_standing: on request only.
To **recover a reference**: generation + artifact_digest on every page (present today); durable locator → fresh authorized ref resolution; on failure a stable code + safe explanation + permitted next action + correlation ID. Resolution must not imply same version — client must compare source_digest and never splice read pages across versions.
To **cite an excerpt**: canonical_path, uid, source_digest, byte offsets, generation (all present today — citation support is already adequate).
To **decide when to stop**: has_more/next_cursor (present); a boolean "your view is bounded" (no denominator); refusal code distinct from empty result.
**Budgets:** targeted question ≤6 calls end-to-end; discovery response ≤8 KB typical; no workflow may require full-catalog enumeration; refusals explained in ≤1 additional call.

## 4. Pending items (cannot be produced from this seat)
- **Telemetry end-to-end test (new, item 4 above):** single note_read on operator cue after observer connect; report request ID for matching.
- **Successful-search control (item 3):** requires an operator-approved known-coherent scope, labeled as prompted control. Ready to execute on receipt of the scope. Will capture result usefulness, citation usability, continuation behavior.
- **Fresh-session acceptance transcripts (item 5):** requires a new session with no prior context; this session is contaminated by full knowledge of the catalog. Also Code-lane registration needs separate client observation.
- Out of client scope, per operator: generation-change causes, missing-note admission reasons, authorization non-disclosure design, server-side timing breakdowns, in-memory event-ring inspection (privileged credential; operator authorization decision).
