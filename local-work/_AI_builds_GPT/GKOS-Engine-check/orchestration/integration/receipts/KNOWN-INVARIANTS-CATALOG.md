# Known invariant catalog

**Review date:** 2026-09-01  
**Scope:** every Markdown occurrence of the whole word `invariant` or `invariants`
under `orchestration/`, plus the machine-readable invariant declarations to which
those Markdown sources point.  
**Disposition:** source catalog complete; the owner prospectively resolved
`Q-INTENT` through the unpublished R19 follow-up candidate. The exact eight-item
gate is defined but has not been executed or published.

This catalog separates adopted GKOS controls from proposals, candidate contracts,
implementation assurance policies, and tests. Repeating the same words in a copied
audit tree, upgrade candidate, integration worktree, or receipt does not create a
new invariant or raise its authority.

The machine index
[`known-invariant-source-index.json`](known-invariant-source-index.json) records all
205 matching Markdown paths, 85 unique byte sequences, SHA-256 values, line numbers,
and duplicate-content groups. The generated catalog itself is excluded to prevent a
circular self-index; all other matching Markdown, including prior receipts, remains
in scope. Earlier embedded 200-path/79-content and 201-path/80-content statements
record their respective pre-R19 index states and are superseded by this regenerated
index. The R19 decision, adoption receipt, advisory re-review, and prospective
orchestration updates remain distinct sources even when they describe the same
decision. Dependency documentation is indexed but does not become a GKOS source.
The catalog below reconciles the substantive declarations.

## 1. R4 documentation-intent gate

The preserved R4 source contains one relevant sentence and no item-level list:

> “Run the eight-invariant documentation intent gate …”

Source: `orchestration/2026-08-31/sources/GKOS-RUST-UPLIFT-R4-2026-08-27.md`,
Phase 12, line 450. R4 therefore supplies a cardinality of eight, but no recoverable
wording for any of the eight positions.

Before R19, the only local exact documentation-intent checklist was
`orchestration/integration/standard-r18/docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md`,
§4. At reviewed base `9f47ecf8fefb87810cd44bd03fa8e82eb321fd4a`, its
status was **“Proposed; non-normative until adopted through `GOVERNANCE.md`”**
and it contained seven rows. R19 candidate commit
`04a164792c0957f5ce8acc9ba6853597ec0660dd` prospectively adopts that table and
supplies an eighth row.

| # | Exact checklist wording | Stated controlling source | Authority and executable mapping |
| --- | --- | --- | --- |
| D1 | Authority derives from receipts/grants, not authored fields or model signals | R2; master standard §4 | R19-adopted synthesis of adopted R2. Current atomic support includes `GKOS-AUTHUSE-003..005`, `GKOS-AUTHUSE-007`, `GKOS-REVIEW-003`, and `GKOS-PROFILE-007`; registered negative gates include `GKOS-GATE-L5-005`, `L7-001`, `L7-005`, and `L7-007`. No single test qualifies the whole row. |
| D2 | Contradiction and history remain visible and reconstructable | R3; master standard §5 | R19-adopted synthesis of adopted R3. `GKOS-CONTEXT-004` and `GKOS-REVIEW-004` map to `GKOS-GATE-L6-009` and `L5-006`. Starter fixture `GCP3-C01` targets contradiction behavior but is currently `UNEVALUATED`; Track-A mutation evidence covers the later atomic gates. |
| D3 | Mandatory controls and conformance evidence are deterministic and disclosed | R5; master standard §8 | R19-adopted synthesis of adopted R5. `GKOS-CONFORMANCE-001..003` and `GKOS-PROFILE-004..006` are the current atomic controls. Strict predicate mutation lint covers registered gates, but the starter catalog has no qualifying profile and two `UNEVALUATED` fixtures. |
| D4 | Agent specialization grants capability, not authority | R6; master standard §7 | R19-adopted synthesis of adopted R6. `GKOS-AUTHUSE-004` and `GKOS-REVIEW-003` map to `GKOS-GATE-L5-005`; no model or role label becomes authority merely by specialization. |
| D5 | Missing/invalid sensitivity fails closed | R7; master standard §9 | R19-adopted synthesis of adopted R7. Starter fixture `GCP1-B01` requires `GKX-SENSITIVITY-001` and an effective `restricted-or-stricter` result, but its manifest records `DIV-002` and the active catalog declares sensitivity coverage incomplete. Kosmos has an implementation-local stronger `secret` default described below. |
| D6 | Implementation experience proposes but does not amend | R12-092 | R19-adopted restatement of an accepted R12 direction. `GKOS-CONFORMANCE-003` keeps implementation observations in non-normative adapter maps. This is primarily a governance/process gate; there is no standalone runtime diagnostic for “silent amendment.” |
| D7 | Identity is independent of path/location | R4/GCP-2; master standard §6 | R19-adopted synthesis. Provisional GCP-2 says filenames and paths are not identity; active `GKOS-IDENTITY-001..004` protect UUID identity and prevent ordering from creating authority. The starter catalog has no complete GCP-2 qualification lane. Renderer identity tests below are implementation evidence, not Standard conformance. |
| D8 | Every committed governed state change is durably receipted | R15-104/105; `GKOS-RECEIPT-001`/`003`; directive provenance STD-079 r4 invariants 3–4 | Prospectively supplied and adopted by R19 on 2026-09-01. A governed mutation fails the row if it commits without a durably bound receipt, or receipt-binding failure neither fails closed nor produces verifiable rollback or compensation. This is the previously undefined position; it is not historically recovered R4 text. |

The older review
`docs/reviews/2026-08-04_ENGINE_GRAPH_DRIFT_ASSESSMENT.md`, lines 73–88, calls
six items “ratified intent invariants”: D1 through D6. Pre-R19 DOCSTD added D7.
Neither historical source provided an eighth item. DOCSTD also points to numbered master-standard
sections that are not present in the current compact v0.80 master file; the
decision register and normative annexes are the usable local anchors.

### Eight-versus-seven resolution

The 2026-08-31 source review correctly found that no then-existing local text
supported selecting an eighth item, splitting one of D1–D7, or silently changing
“eight” to “seven.” It identified two owner routes:

1. supply and adopt an exact eight-item checklist with provenance for item eight; or
2. formally amend R4's cardinality/reference and separately adopt an exact checklist.

The owner chose route 1 on 2026-09-01. R19 prospectively supplies D8 and adopts
only the eight-position DOCSTD §4 table as an unpublished v0.x development
procedure. The rest of DOCSTD remains proposed and non-normative. R4 remains
unchanged historical/advisory evidence; R19 does not claim D8 always occupied its
missing position. This resolves checklist definition, not execution: the R4-12
gate has not run, and no Standard publication, profile qualification, release, or
Rust cutover follows. `Q-INTENT-RESOLUTION.md` remains the valid pre-decision
finding; `Q-INTENT-R19-ADOPTION.md` records the prospective resolution.
`Q-INTENT-R19-HOSTED-CI.md` binds the later five-workflow hosted PASS to the
exact R19 SHA without claiming that the eight-check gate itself ran.

## 2. Owner-approved Standard development invariants

`orchestration/integration/standard-r18/docs/directives/GKOS-DIRECTIVE-STD-079-r4.md`
is an owner-approved development directive controlled by R15. Its §0, lines 8–19,
defines ten controlling invariants:

| # | Exact wording | Atomic/gate mapping |
| --- | --- | --- |
| S1 | Capability is not authority. | R2/R6 family; `GKOS-AUTHUSE-003..004`, `GKOS-REVIEW-003`; `L5-005`, `L7-001`. |
| S2 | Confidence, similarity, retrieval rank, model agreement, timestamps, UUID order, lexical order, and graph position do not create authority. | `GKOS-IDENTITY-004`, `GKOS-LINEAGE-003`; adapter observations exist, but no one registered gate covers the complete list. |
| S3 | Every committed governed state change is durably receipted through a governed record satisfying the State-Change Receipt role. | `GKOS-RECEIPT-001..002`; cross-cutting mutation requirement. |
| S4 | Receipt-binding failure fails closed or is verifiably rolled back/compensated. | `GKOS-RECEIPT-003`; `GKOS-GATE-L7-005`. |
| S5 | Contradiction, correction, supersession, withdrawal, rejection, deletion, and erasure remain distinct. | R3 plus `GKOS-REVIEW-004`; history-rewrite gate `L5-006`. The complete vocabulary separation is broader than that one gate. |
| S6 | Re-entry begins as a new Layer-1 source and inherits no prior standing. | `GKOS-REENTRY-001..003`, especially cross-cutting `GKOS-REENTRY-002`; `GKOS-GATE-L1-001`. |
| S7 | Bounded delegation attenuates authority and cannot become general write authority. | `GKOS-DELEGATION-001`, `005`; scope gates `L7-002..003`; no single gate proves every attenuation dimension. |
| S8 | Non-deterministic checking may only increase restrictiveness. | `GKOS-DELEGATION-003`; `GKOS-GATE-L4-004`, Track-A `TA-L4-004`. |
| S9 | Standard fixtures, provisional profile fixtures, and implementation tests remain distinct evidence classes. | `GKOS-CONFORMANCE-003`; fixture manifests and claim schema. Process/evidence classification, not one runtime gate. |
| S10 | Implementation behavior proposes; it does not amend GKOS. | R12-092 and `GKOS-CONFORMANCE-003`; governance/process enforcement. |

These ten overlap D1–D6 but are not the missing R4 checklist: they come from a
different directive, have ten members, and R4 does not reference STD-079 §0 as its
eight-item source.

## 3. Seven blocking layer invariants

The current normative surface identifies
`standard/annexes/Layer_Interface_Contracts.md`; its table at lines 7–15 supplies
seven blocking invariants:

| Layer | Blocking invariant | Principal requirement/gate mapping |
| --- | --- | --- |
| L1 | Received revision, provenance, custody, sensitivity, and retention evidence preserved. | GCP-1; re-entry `L1-001`; starter GCP-1 fixtures are non-qualifying. |
| L2 | Stable identity and version; filename and path are not identity. | GCP-2; `GKOS-IDENTITY-001..004`; no complete active GCP-2 fixture lane. |
| L3 | Typed, sourced, temporal, scoped, attributable relationships. | GCP-3; `GKOS-LINEAGE-001..003`; starter `GCP3-C01` and `GCP3-L01` remain `UNEVALUATED`. |
| L4 | Every mandatory failure blocks, refuses, rolls back, or freezes as specified. | `GKOS-PROFILE-005`; registered `L4-001..004` mutation twins. |
| L5 | Authorized append-only disposition; Context Manifest identity/hash bound when used for review. | `GKOS-CONTEXT-005`, `GKOS-REVIEW-001..004`; `L5-002..006`. |
| L6 | Non-deterministic selection captured; assembly deterministic, purpose-bound, restriction-aware, and replayable. | `GKOS-CONTEXT-001..004`, `GKOS-CANON-001..008`; `L6-001..009`. |
| L7 | Exact context, valid authority, distinct actors, delegation, effect scope, outcome, and recovery route bound. | `GKOS-AUTHUSE-001..007`, `GKOS-EFFECT-001..003`; `L7-001..007`. |

The same annex, lines 25–30, adds two cross-layer rules: every normative closure
emits its registered gate code and Refusal Receipt role; upper-layer returns enter
as new L1 sources without inherited standing.

## 4. Atomic Standard control source

The authoritative atomic source is
`orchestration/integration/standard-r18/requirements/REGISTRY.md`, lines 14–82.
It has 62 allocated requirement records: 56 published allocations through v0.80,
one accepted unpublished R17 allocation, and five accepted v0.81 development-line
allocations. `GKOS-DELEGATION-004` remains in the append-only ledger but is
superseded on the v0.81 line by `GKOS-REVIEW-001..003`.

The exact invariant-bearing families are:

| IDs | Concise faithful formulation | Lines | Gate/test binding |
| --- | --- | --- | --- |
| `GKOS-CONFORMANCE-001..003` | Unevaluated is not PASS; incomplete required checks block a profile claim; implementation observations cannot define requirements. | 16–18 | Starter runner and registry lint; no qualifying profile. |
| `GKOS-IDENTITY-001..004` | New UUIDv7 form, permanent legacy UUIDv4, no identity rewrite, and no authority from UUID/time/order. | 19–22 | Adapter observations; no complete GCP-2 lane. |
| `GKOS-LINEAGE-001..003` | Preserve every valid branch, derive time without choosing authority, and never select authoritative succession by tiebreak. | 23–25 | GCP-3 fixtures; two graph expectations remain `UNEVALUATED`. |
| `GKOS-RECEIPT-001..003` | Durable state-change receipt with actor/predicate binding; binding failure fails closed or compensates. | 26–28 | `GKOS-GATE-L7-005` for failure; mutation evidence in Track A. |
| `GKOS-POLICY-001` | Required deployment policy has explicit identity/version and is not silently replaced. | 29 | No dedicated registered gate; participates in digest-bound tests. |
| `GKOS-RETENTION-001..003` | Consult and receipt the hold predicate; unavailable/conflicting mandatory disposition evaluation fails closed. | 30–32 | `L4-001`, `L4-002`. |
| `GKOS-REENTRY-001..004` | New L1 source, no inherited standing, no predecessor mutation, explicit authorized supersession only. | 33–36 | `L1-001`, `L3-001`; `REENTRY-002` is explicitly designated the cross-cutting standing invariant at line 105. |
| `GKOS-DELEGATION-001..006` | Explicit attenuated expiring delegation; deterministic routine classification; non-determinism raises restriction only; receipted review; no general write power; overdue review freezes the grant. | 37–42 | `L4-003..004`, `L5-001`; `DELEGATION-004` superseded as noted. |
| `GKOS-PROFILE-001..007` | Cumulative Core/Advanced tiers, read-only Context extension, exact claim binding, executable negative gates, no mandatory exclusion, honest Viewer standing. | 43–49 | Registry lint and Track-A twins; not cumulative profile qualification. |
| `GKOS-CANON-001..008` | Deterministic GKX-CBOR-1; ordered unique keys; typed finite numbers; exact UTC timestamps; UTF-8/NFC; distinct absent/null/empty; digest-bound hashes; rendering round trip. | 50–57 | `L6-001..008`. |
| `GKOS-CONTEXT-001..005` | Capture and hash selection; deterministic assembly from sealed inputs; identical inputs yield identical bytes; complete contradiction/restriction closure; decision binds manifest. | 58–62 | `L6-009`, `L5-002`; GCP-6 replay evidence is separate from full qualification. |
| `GKOS-AUTHUSE-001..006` | Bind exact manifest/policy, reject stale hash, validate action-time authority, preserve actor roles, receipt refusal, bind outcome/recovery. | 63–68 | `L5-005`, `L7-001`, `L7-004..006`. |
| `GKOS-EFFECT-001..003` | Typed effect scope; requested scope contained by authority/delegation; unknown dimensions fail closed. | 69–71 | `L7-002..003`. |
| `GKOS-AUTHUSE-007` | Use captured canonical time and half-open authority validity; missing or out-of-window evidence fails closed. | 77 | Accepted unpublished R17; `L7-001`, authority-window tests. |
| `GKOS-REVIEW-001..004` | Required review lifecycle and append-only decision; independent role/model/authority constraints; immutable disposition history. | 78–81 | Accepted v0.81 line; `L5-003..006`. |
| `GKOS-DISCLOSURE-001` | Authorization precedes protected disclosure; denied information is noninterfering outside the authorized boundary. | 82 | Accepted v0.81 line; `L7-007`. |

The corresponding registry of 28 stable negative gate codes is
`standard/annexes/Diagnostic_Code_Registry.md`, lines 26–53. The final local
Standard integration ran 80/80 tests and strict mutation lint over 62 records and
28 gate codes with zero uncovered codes. That evidence is explicitly
`portable-predicate-twins-only`; it is not cumulative GCP qualification.

## 5. Provisional Standard-profile invariants

`docs/proposals/SRTP_DRAFT_TRACEABILITY.md` is proposal-only and says no handle is
allocated in the permanent registry. It explicitly names two invariants:

| Invariant | Exact content | Fixture mapping | Authority |
| --- | --- | --- | --- |
| Raise-only sensitivity | `sensitivity`, `derived_sensitivity`, and context/use/receipt propagation may raise but not lower sensitivity. | Positive `SRTP-P01`; negative `SRTP-N09`. | Provisional, informative, non-qualifying. |
| Purpose-bound context | Context identity/digest, purpose, recipient, versions, warnings, omissions, and expiry remain bound. | Positive `SRTP-P01`; negative `SRTP-N10`. | Provisional, informative, non-qualifying. |

The same table has proposal handles for preservation, execution, artifacts,
review, explicit negative/null results, rerun comparison, re-entry, branch-preserving
lineage, and version coordinates. They are candidate requirements, not additional
ratified “intent gate” rows.

## 6. Hindsight governance invariants

### Ratified build-specification prose

`orchestration/2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/contracts/governance/GKOS-Hindsight-Dream-Governance-Demonstrator.md`
is marked **Ratified build specification** at line 5. Its §3.2, lines 60–71, has ten
non-negotiable invariants:

1. Hindsight relevance is not evidence strength.
2. Hindsight opinion confidence is not verification confidence.
3. A proof count is not proof of truth; it counts supporting memories.
4. A generated observation remains a derived artifact even when grounded.
5. Producer and semantic reviewer have distinct identities and execution records.
6. No model, including the reviewer, approves its own artifact.
7. Auto-admission cannot activate code, policy, permissions, credentials, external actions, or canonical factual claims.
8. Every auto-admitted item is reversible and reconstructable from retained source material.
9. Invalid review experiments are quarantined before substantive disposition.
10. Missing provenance, policy version, model identity, or content hash fails closed.

These are Hindsight bridge controls. They do not appoint Hindsight, Effects, Marshal,
or a model as GKOS authority.

### Seventeen named failure-matrix invariants

`fixtures/adversarial/r2-contracts/failure-matrix-v1.json`, array lines 66–83,
expands the prose into 17 named machine-readable statements. The file itself says
`DRAFT_UNEVALUATED`, `authority_state: NONE`, `executable_policy: false`, and
`runtime_authority: false`; its 111 cases are a declared oracle, not proof of
runtime behavior.

| ID | Exact statement |
| --- | --- |
| `INV-AUTHORITY-NON-ESCALATION` | Scores, memory types, model outputs, receipts, and signatures do not create authority. |
| `INV-INVALID-QUARANTINE` | A Stage 0 failure produces REVIEW_INVALID and quarantine before substantive disposition. |
| `INV-MONOTONIC-RISK` | A prohibition cannot be cancelled by positive signals or a weighted score. |
| `INV-COMPLETE-PROVENANCE` | Every governed item resolves to exact source, transformation, identity, pin, and receipt evidence. |
| `INV-SEPARATE-IDENTITIES` | Producer and semantic reviewer have distinct identities and execution records. |
| `INV-REVIEWER-NO-MATERIALIZE` | The read-only reviewer cannot approve, write canonical truth, or materialize. |
| `INV-RATIFIED-POLICY-ONLY` | Only a human or a deterministic engine exercising exact ratified policy authority issues approval. |
| `INV-REVERSIBLE-RECONSTRUCTABLE` | Auto-admitted derived memory is reversible and reconstructable from retained sources. |
| `INV-LEDGER-FIRST-DUAL-WRITE` | Activation follows canonical ledger intent and independently verified success at both projections. |
| `INV-RECALL-SCOPE` | Quarantined, sensitive, stale-disallowed, and cross-scope items cannot enter ordinary context. |
| `INV-IDEMPOTENT-ORDERING` | Retries, duplicate webhooks, and reordering cannot duplicate or rewrite governed history. |
| `INV-REVOCATION-DOMINATES` | Any revocation intent prevents activation until governed reconciliation completes. |
| `INV-CHECKPOINT-CONTINUITY` | Only independently verified contiguous canonical ledger ranges may be checkpointed or anchored. |
| `INV-RETENTION-RECEIPT` | Expiry removes governed confidential content while preserving permanent hashes and receipts. |
| `INV-QUALIFICATION-RESET` | Failures and relevant policy, model, source, dependency, or distribution changes reset the applicable qualification state. |
| `INV-CLEAN-ROOM-PARITY` | Python and Rust decisions match exactly; mismatch classification is evidence-led and language-neutral. |
| `INV-FAIL-CLOSED-UNKNOWN` | Unknown identity, scope, pin, dependency, state, operation, or comparison remains inactive and unevaluated. |

The ten ratified prose items overlap this 17-item draft matrix; the matrix adds
ledger dual-write, recall scope, idempotency, revocation, checkpoint, retention,
qualification-reset, and clean-room parity detail. It does not replace the ten-item
ratified source while its authority state is `NONE`.

### Draft operation and database invariant sets

`contracts/hindsight/v1/HINDSIGHT-OPERATION-COMPATIBILITY.md`, lines 70–109, is
`DRAFT_UNEVALUATED`, authority `NONE`. Its semantic invariants are: one source may
produce any number of memories; item count is not memory count; only three current
fact types are accepted; legacy opinion stays subjective; truncated/absent source
facts require inspection or quarantine; tags are filters rather than authorization;
the gateway independently applies scope/policy; source bytes/digests are gateway-owned;
Hindsight ranks, counts, labels, and confidence are non-authoritative; webhook
identity includes deployment, bank, event, operation and nullable document; byte
hash mismatch under the same identity is quarantined; signatures and exact event
headers precede parse; ambiguous duplicate IDs fail closed; only declared completion
events advance reconciliation; canonical receipts outlive upstream pruning.

`fixtures/database/r2-postgres/database-invariants.json` is also
`DRAFT_UNEVALUATED`, authority `NONE`. Its case array spans lines 5–293 and declares
41 database cases. Their IDs are:
`serializable-required`, `sequence-gap`, `idempotent-retry`,
`idempotency-conflict`, `idempotency-full-event-conflict`,
`idempotency-command-conflict`, `one-sided-materialization`,
`two-receipts-no-activation-event`, `two-receipts-and-activation-event`,
`unpaired-auto-disposition`, `unpaired-materialization-event`,
`unpaired-revoke-request`, `unpaired-revoked-event`, `one-sided-revocation`,
`review-lease`, `retention-expiry`, `checkpoint-anchor`,
`checkpoint-anchor-request-mismatch`, `auto-admit-empty-authority`,
`auto-admit-arbitrary-actor`, `auto-admit-unverified-adjudication`,
`substantive-disposition-wrong-event-type`, `adjudication-event-binding-drift`,
`legacy-adjudication-not-silently-upgraded`,
`adjudication-verifier-implementation-drift`, `unverified-success-receipt`,
`provider-receipt-replay`, `provider-receipt-profile-unratified`,
`checkpoint-invented-tail`, `checkpoint-cross-chain-tail`,
`checkpoint-not-verified`, `checkpoint-fork-or-gap`,
`ledger-event-not-independently-verified`,
`ledger-event-verifier-profile-unratified`,
`revocation-dominates-pending-activation`, `cross-scope-chain-or-command`,
`deployment-scope-profile-unratified`, `human-ballot-alternate-uuid-spelling`,
`human-quorum-unverified`, `caller-future-purge-time`, and
`auditor-sensitive-field-access`. Exact conditions, expected outcomes, and reason
codes remain in that JSON; listing them here does not upgrade their authority.

## 7. Engine implementation and contract invariants

### Current T01 reference/freshness behavior

The integrated Engine candidate establishes implementation behavior, not a selected
TypeScript oracle or Standard amendment:

| Invariant | Source/test mapping | Standing |
| --- | --- | --- |
| Every opaque record reference stays bound to the authorized source snapshot that issued it. | `test/service-reference-freshness.test.mjs`, lines 78–101. | Current-runtime tests PASS; candidate only. |
| Content, deletion, insertion, UID, rename, policy, and configuration changes invalidate affected continuations/references. | Same file, lines 78–193. | Red/green implementation evidence. |
| Temporal continuation refuses changed content, metadata, deletion, insertion, order, policy, or configuration. | Same file, lines 103–147. | Includes the metadata-only and stale-receipt counterexamples found in independent review. |
| Direct lineage and temporal operations bind authorized content/metadata and ordered snapshot state. | Same file, lines 149–156. | Current-runtime evidence. |
| Navigation-audit continuation binds content, deletion, insertion, UID, rename, policy, and configuration state. | Same file, lines 158–194. | Current-runtime evidence. |
| Stable pages reassemble in order; changes hidden from the authorized view and irrelevant raw-source ordering do not invalidate that view. | Same file, lines 196 onward. | Prevents unnecessary invalidation while preserving authorization boundaries. |
| A dirty candidate is identified by the full source snapshot digest rather than mislabeled as HEAD; failed commands, source drift, or ambiguous counts cannot pass. | `docs/CURRENT-RUNTIME-QUALIFICATION.md`, lines 13–35. | Qualification-harness invariant; platform skips keep status incomplete. |

The final local current suite reported 944 PASS, 0 FAIL, seven platform skips;
historical replay reported 35/35. This is `INCOMPLETE_PLATFORM_COVERAGE`, not oracle
selection or full release qualification.

### Draft ingest and retrieval contract invariants

`contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/README.md`, lines 132–148,
requires each rejection to bind all and only the intrinsic findings for its
`(path, ordinal)`, bind field-authoritative codes to the exact safe coordinate,
use `field:null` when no field authority exists, keep the fail-closed unmapped
diagnostic in a fixed redacted shape, and use exact UTF-16 code-unit canonical
ordering. The document calls these cross-row/code-to-field invariants mandatory,
but the contract version remains draft.

`contracts/retrieval/gkos-retrieval-1.0.0-draft.2/README.md`, lines 79–95,
defines `LINEAGE_VIEW_AUTHORIZED_ONLY`: only authorized non-future canonical UIDs
may appear in public lineage endpoints; suppression is silent; hidden raw refs do
not affect public reasoning or provenance digests; temporal state is wall-clock-free;
future results are excluded; equal half-open endpoints are ineligible. This is a
draft contract invariant.

The Phase-2 implementation evidence additionally reports candidate/provenance
equality, normalized UTC time, exact counts/canonical JSON, FTS bijection/tokenizer
binding, finite quality values, projection digests, tamper refusal, and a
policy-digest embedding rule under which denied source text never reaches a
provider and policy mismatch fails closed. These are first-party implementation
claims in `evidence/2026-08-21-functional-uplift-phase-2.md`, lines 73–102 and
198–211, not new Standard requirements.

## 8. Kosmos and Observatory implementation invariants

### Machine-readable Kosmos policy

`orchestration/integration/kosmos/kosmos-invariants.yml` says at lines 1–4 that it is
the single machine-readable declaration of what must remain true. Its declared
groups are:

| Group | Declared invariant values | Checker mapping |
| --- | --- | --- |
| Security | Agent API disabled, localhost, and authenticated by default; LAN requires token; query tokens off and forbidden on LAN; ceiling `internal`; unlabeled/invalid sensitivity closes to `secret`; no API write routes; 4 MiB body cap; 32-byte `crypto.getRandomValues` token; Host and Origin validation; MCP revision `2025-11-25`. | Policy lines 10–44; `scripts/check-invariants.mjs` lines 55–89 checks these plus constant-time token comparison and no `Math.random`. |
| Build | `package-lock.json` required; no `latest`; Node engine declared; executable artifacts reproducible. | Policy lines 46–51; checker lines 91–96 check lock, dependency pins, and Node engine. Reproducibility is checked by a separate build/release lane, not this script. |
| Release | Eight required artifact files; `.env`, `data.json`, `*.pem`, and `*.key` forbidden. | Policy lines 53–67; checker lines 127–135 check literal forbidden files; wildcard/package completeness is handled elsewhere. |
| Standalone | No external runtime URLs; offline single file; read-only scanner. | Policy lines 69–73; checker lines 118–125 inspect built script/CSS URLs. Read-only scanner posture is not exhaustively proven by this scalar checker alone. |
| Renderer | Sandboxed iframe; no `allow-same-origin`; versioned validated messages. | Policy lines 75–80; checker lines 98–104. |
| GKX migration | Audit before apply; SHA-256 plan; byte-exact backup; source match before write; body preserved; no LLM; no network dispatch. | Policy lines 82–89; checker lines 106–116. |
| GKX 2.3 projection | `validating-projection`; no full-GKOS claim; no silent source modification; preserve authored/derived/proposed/approved origin classes; proposed values ineffective without approval; scores are not truth; SHA-256 policy hash; remote schema updates disabled. | Policy lines 91–103; checker lines 83–89 check profile, claim, proposal effectiveness, truth disclaimer, hash, and remote updates. Some declaration values depend on other tests/review rather than one scalar check. |

`npm run verify` passed 283 tests and the invariant gate locally, but a checker PASS
means only that its implemented assertions passed; it does not prove every prose
security property or all-platform behavior.

### Renderer identity invariant

`docs/RENDERER-PROTOCOL.md`, lines 110–118, now states the implementation invariant:
opaque stable `agent_id` is the renderer identity and `agent_label` is display-only.
Equal labels with distinct IDs keep distinct heads/colors; changing the label for one
ID does not fork identity; legacy label-only keys use a separate namespace; IDs do
not authenticate or grant effect authority; steps, markers, and color cache remain
bounded. Kosmos live/replay/buffer tests and Observatory's synthetic Chromium/WebGL
test passed. The Observatory evidence is synthetic SSE and does not qualify the live
Engine-to-browser chain.

### Renderer/cosmology fidelity tests

Kosmos change history calls six orbital assertions “orbit invariants.” The actual
tests are `test/cosmology.test.mjs`, lines 179–307: time zero matches the layout;
apoapsis never exceeds the original horizontal radius; eccentricity is bounded
`[0, 0.28]` with cosmetic outer bodies circular; heavier children are more circular;
sibling perturbation is deterministic and at most 0.14 radians; parent mass affects
speed scaling. These are visual-fidelity test invariants, not governance authority.

## 9. Lite implementation invariants

`orchestration/integration/lite/docs/evidence/phase-1-retrieval-core.md`, lines
102–109, says the exact migration allowlist and semantic tests preserve stable UIDs,
paths, sensitivity, authored/effective lineage, temporal state, scores, source hashes,
Graphiti order, relation targets, and source content. `phase-2-lineage-citations.md`,
lines 68–80, adds immutable reopen checks over exact counts, canonical JSON, digests,
FTS key bijection/tokenizer DDL, vector spaces, and parent/source binding. These are
implementation evidence at pinned Engine coordinates, not an independent Lite schema
authority or all-platform release proof.

## 10. Marshal candidate invariants and ownership boundary

The Marshal sources are private/candidate inputs and grant no GKOS Engine authority.
They must remain separate from the GKOS R4 checklist.

`specifications/MARSHAL-STATE-MACHINE-CANDIDATE.md` is explicitly candidate,
non-authoritative, unratified, and unactivated. Its §Concurrency invariants,
lines 99–105, states:

1. one lifecycle version wins each compare-and-set transition;
2. duplicate idempotent requests return the original receipt;
3. conflicting idempotency-key reuse refuses without altering the original;
4. revocation/kill serialized before final commit prevents that commit; and
5. independent chain domains require no global mutex.

`EVD-002-LOGICAL-RECORD-CANDIDATE.md`, lines 117–123, adds prospective database
correctness conditions: per-chain `SELECT … FOR UPDATE`, no global lock, constraints,
uniqueness, foreign keys, immutable-entry privileges/triggers, byte limits,
sequence/head/count consistency, and idempotency receipts. The PostgreSQL candidate
repeats that per-chain locking plus those database invariants is the minimum and
requires no fork/gap, exactly one applicable winner, stable refusals, and no global
serialization of independent chains. All remain candidate-only until exact-head
ratification, appointment, activation, and cutover.

The RUST migration parity matrix, lines 115–119, adds an orchestration ownership
invariant: Marshal is not the Rust destination; Full owns one canonical semantic
crate/contract copy; Lite compiles the same crates with projection-only policy;
retrieval/navigation do not import Effects; context composes eligibility, rank, and
closure; service owns host state. This is a migration preparation constraint, not a
merged implementation or license grant.

## 11. Historical summaries and non-enumerating mentions

The archived pre-GKX2 technical orientation lists ten informative “conforming design”
invariants: sources remain evidence; assertions remain attributable; agent output is
proposal-only; authority is receipt-based; restrictions are monotonic absent
authorized change; mandatory control failure blocks; contradictions remain visible;
re-entry creates new evidence; consequential use is purpose-bound/receipted; and
unevaluated is not passing. It also contains an older seven-layer table. Its header
says the normative standard and adopted decisions control; the current registry,
annexes, and directives therefore take precedence.

Other indexed Markdown files use “invariant” to refer to one of the sets above,
to require a future proof, or to describe a verification command. They do not
enumerate an additional GKOS invariant set. Examples include release instructions,
threat models, assurance guides, handoffs, receipts, Observatory build plans, and
third-party dependency changelogs. The JSON index preserves every such occurrence
so absence from the semantic tables is reviewable rather than silent.

## 12. Final authority statement

- **Current adopted GKOS sources:** decision register, permanent requirement
  registry, normative annexes, owner-approved directives, and the R19-adopted
  eight-position DOCSTD §4 procedure, with their stated unpublished,
  v0.x/non-consensus boundaries.
- **Proposed:** DOCSTD sections other than §4 and the SRTP invariants.
- **Ratified project-specific build source:** Hindsight ten non-negotiable prose
  invariants, without production authority.
- **Draft/no authority:** Hindsight 17-item machine matrix, 41 database cases,
  operation-compatibility semantics, and Marshal candidates.
- **Implementation evidence:** Engine freshness, Kosmos machine policy and renderer,
  Observatory synthetic renderer, Lite parity/reopen, and cosmology assertions.
- **Resolved definition; pending integration/execution:** the owner prospectively
  supplied D8 through R19. The follow-up commit was pushed solely for hosted CI
  and passed all five workflows, but remains unmerged and unpublished; the
  eight-check R4-12 gate has not been run.
