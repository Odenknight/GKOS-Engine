# Phase 6 Sol assignment and acceptance matrix

Decision item: **D0-14 — named implementer and independent reviewer assignments**

Prepared: 2026-08-25 (America/New_York)

Revision: **governance-correction.3**

Status: **PROPOSED ASSIGNMENT FREEZE — `PHASE6_NOT_STARTED`**

This is a delivery-governance proposal. It assigns accountable Sol roles,
independent acceptance authorities, scheduling waves, and immutable handoff
rules. It does not authorize Phase 6 product code, create a Phase 6 branch,
freeze a schema, dispatch an agent, merge, release, deploy, activate, or
publish anything.

## 1. Authority and decision state

This matrix is subordinate to:

- `future-build-phase6/PHASE6_MINIMUM_WORK_PACKAGE_PLAN_2026-08-25.md`;
- `future-build-phase6/PHASE6_ENTRY_AUDIT_2026-08-25.md`;
- the ratified functional-uplift handoff and implementation guide cited by the
  entry audit; and
- the final owner-ratified D0 record and its independently accepted hashes.

The binding delivery invariants are:

1. Full TypeScript is the sole Phase 6 semantic authority.
2. Lite is exact-pin conformance only. It may neither add semantics nor weaken
   a Full state, error, denial, race winner, bound, or authority boundary.
3. Every package has a non-author acceptance authority. A Sol may never accept
   its own bytes, expected outcomes, implementation decisions, or evidence.
4. An upstream author is not reused as an allegedly independent downstream
   evidence author or final evidence reviewer.
5. Full completes through independently accepted F5 before L1 starts. Lite
   consumes the exact signed, hosted-green F5 Full SHA and exact pack bytes.
6. `/root` is the Orchestrator and coordinate ledger. It is only a bounded
   technical reviewer for F4 and L3. It is never F5/L4 evidence author, final
   evidence reviewer, or semantic waiver authority.
7. Local success is insufficient wherever the frozen work package requires a
   hosted, reciprocal, artifact, signature, or platform gate.

### 1.1 Closed D0-1 coordinates

D0-1 is closed:

- Full: `808d875b557f4cfd2bb0addccba44d70c9748f35`; hosted run
  `32881187799`, terminal `SUCCESS`.
- Lite: `ce8095515d2a1a7b23a10c01bd8f22e2dc5917e2`; draft PR `#21`;
  hosted run `32888245801`, terminal `SUCCESS`, `8/8` jobs successful.

These are admission coordinates, not a Phase 6 Full-to-Lite pin.

### 1.2 Revision-pending decisions

D0-2 through D0-13 and D0-15 are **revision-pending cross-review**, not absent
inputs. Their current proposal values have no implementation authority. F1
remains blocked until the owner ratifies one internally coherent D0 record and
every assigned independent D0 reviewer accepts the regenerated artifacts and
hashes with no unresolved blocker, HIGH, or MEDIUM finding.

This file completes the corrected assignment design for D0-14. It becomes an
executable assignment freeze only after its independent governance review and
owner ratification. Reserved task names below do not create or dispatch tasks.

## 2. Named Sol roster and fixed limits

| Named role | Reserved canonical task identity | Permitted responsibility | Non-negotiable limit |
| --- | --- | --- | --- |
| Peirce — Full specialist | `/root/phase6_peirce_full` | F1/F2 implementation and L3 implementation; supplies immutable accepted F1 coordinates to L1 | Cannot accept F1, F2, L1, L3, or any artifact whose expected outcomes or bytes Peirce authored. |
| Beauvoir — Lite/cross-platform specialist | `/root/phase6_beauvoir_lite` | F1/F2 independent review, F4 implementation, L1/L2 implementation, and bounded lifecycle/concurrency or cross-platform concurrence when independent | Cannot accept F4, L1, L2, or any artifact Beauvoir authored. |
| Kosmos-Oden capability Sol | `/root/phase6_kosmos_oden_capability` | F3 implementation only | Cannot review or accept F3 and cannot serve as final evidence author/reviewer. |
| Independent MCP reviewer | `/root/phase6_mcp_reviewer` | F3 and L2 independent transport/tool/conformance review | Must contribute no implementation bytes, expected outcomes, or semantic choices to the package reviewed. |
| Independent Full-conformance reviewer | `/root/phase6_full_conformance_reviewer` | L1 byte-exact Full-pack, accepted-F5-pin and semantic-identity review | Must have no F1, F2 or L1 contribution; Peirce may supply immutable coordinates but may not direct or accept the review. |
| Independent migration reviewer | `/root/phase6_migration_reviewer` | Bootstrap concurrence and migration concurrence required by D0-15 | Must have no contribution to the affected bootstrap/migration bytes, state machine, expected outcomes or reviewed package. |
| Independent security reviewer | `/root/phase6_security_reviewer` | Credential, collision, redaction, secret-exposure and migration-security concurrence required by D0-15 | Must have no contribution to the affected security rule, bytes, expected outcomes or reviewed package. |
| Independent Full contract steward | `/root/phase6_full_contract_steward` | Full-side MCP/CLI/HTTP protocol, catalog and closed-error resolution concurrence | Must have no contribution to the affected Full package, registry, catalog, protocol rule or expected outcome. |
| Independent Lite-conformance reviewer | `/root/phase6_lite_conformance_reviewer` | Lite-side protocol/catalog/error parity resolution concurrence | Must have no contribution to the affected Lite package or the Full rule against which conformance is judged. |
| Full evidence implementer | `/root/phase6_full_evidence` | F5 qualification execution and Full evidence assembly | Must not have authored or reviewed F1-F4 product packages and cannot accept F5. |
| Lite evidence implementer | `/root/phase6_lite_evidence` | L4 qualification execution and Lite evidence assembly | Must not have authored or reviewed L1-L3 product packages and cannot accept L4. |
| Independent evidence reviewer | `/root/phase6_evidence_reviewer` | F5 and L4 independent evidence/artifact acceptance; evidence-mismatch determination | Must contribute no product/evidence bytes or expected results and cannot repair evidence it reviews. |
| Orchestrator | `/root` | Dependency gates, slot scheduling, exact-coordinate and verdict-digest ledger, escalation; bounded F4/L3 review | Never authors or accepts F5/L4; never converts a rejection to acceptance; never decides an unfrozen semantic value. |

An assigned reviewer loses independence by editing package bytes, writing or
weakening expected outcomes, choosing an unfrozen semantic rule, directing the
implementation design, repairing evidence, or preparing the reviewed handoff.
Reporting a finding and citing the frozen rule it violates does not destroy
independence.

## 3. Package ownership and acceptance matrix

| Package | Implementing Sol | Independent reviewer / acceptance authority | Package boundary | Acceptance dependency |
| --- | --- | --- | --- | --- |
| **F1 Full contract pack** | **Peirce** | **Beauvoir** | Full-owned schemas, registries, fixtures, canonical vectors, state/race tables, allowed/protected inventories, manifest and evidence contracts only; no runtime authority | Beauvoir independently regenerates and validates the exact pack and emits the hashed F1 verdict. |
| **F2 Full authority engine** | **Peirce** | **Beauvoir** | Identity, credentials, sessions, authorization, revocation, activity, migration, replay/idempotency and owner CLI/service semantics, exactly implementing accepted F1 | Accepted F1 SHA and verdict digest; Beauvoir independently tests security, concurrency, recovery and no-contract-drift. |
| **F3 Full MCP façades** | **Kosmos-Oden capability Sol** | **Independent MCP reviewer** `/root/phase6_mcp_reviewer` | Frozen transports and bounded tools delegating to accepted F2 capabilities; no second identity/policy/effects implementation | Accepted exact F1 and F2 SHAs and verdict digests; independent MCP reviewer validates protocol, delegation, cancellation, redaction and closed errors. |
| **F4 Full adversarial fixtures** | **Beauvoir** | **Orchestrator `/root`** | Independent executable negatives for accepted F2/F3 plus Phase 0-5 regression; F4 never repairs production code or changes expectations | Draft harness may be prepared after F1, but authoritative execution and acceptance start only after exact F2 and F3 SHAs are independently accepted. `/root` emits the hashed bounded F4 verdict. |
| **F5 Full platform/evidence** | **Full evidence implementer** `/root/phase6_full_evidence` | **Independent evidence reviewer** `/root/phase6_evidence_reviewer` | Frozen Full integration qualification, local/hosted platform execution, all-and-only artifact audit, signed+DCO evidence, reciprocal Lite handoff | Accepted exact F2/F3/F4 SHAs and verdict digests. Neither `/root` nor any F1-F4 author/reviewer may author or accept F5. |
| **L1 Lite repin/private verifier** | **Beauvoir** | **Independent Full-conformance reviewer** `/root/phase6_full_conformance_reviewer` | Byte-exact F1 pack copy, exact F5 Full pin, crate-private inert verifier; no runtime authority | Accepted F5 SHA, run, artifact ledger and verdict digest. The reviewer has no F1/F2/L1 contribution and independently verifies source bytes, exact pin and semantic identity. Peirce supplies immutable F1 coordinates only and cannot accept L1. |
| **L2 Lite wrapper conformance** | **Beauvoir** | **Independent MCP reviewer** `/root/phase6_mcp_reviewer` | Required wrapper behavior only, matching Full public states/errors/denials; no Rust semantic fork, service, writer, provider or effects authority | Accepted L1 SHA/verdict. MCP reviewer independently compares Full/Lite behavior and emits the hashed L2 verdict. |
| **L3 Lite adversarial fixtures** | **Peirce** | **Orchestrator `/root`** | Independent replay of Full negatives, races, redaction, migration, bounds and pin failures | Accepted L1 SHA/verdict; `/root` performs bounded parity review and emits the hashed L3 verdict. |
| **L4 Lite platform/evidence** | **Lite evidence implementer** `/root/phase6_lite_evidence` | **Independent evidence reviewer** `/root/phase6_evidence_reviewer` | Frozen Lite Rust/Node/desktop/platform/linkage/package qualification, all-and-only artifacts, signed+DCO closeout and reciprocal Full review | Accepted exact L2/L3 SHAs and verdict digests. Neither `/root` nor any L1-L3 author/reviewer may author or accept L4. |

Only the named acceptance authority may return the package verdict. `/root`
records that exact verdict and digest but cannot substitute an Orchestrator
judgment.

## 4. Mandatory handoff and review-verdict artifacts

### 4.1 Implementer handoff

Every implementer handoff contains:

1. package ID, repository, branch, entry SHA and proposed result SHA;
2. every accepted predecessor SHA and review-verdict digest;
3. exact changed paths, allowed list, ceiling and raw path-inventory digest;
4. exact protected paths and zero-diff proof;
5. schema/registry/fixture versions, paths and raw hashes;
6. public/private surface and complete closed-error inventory;
7. applicable transition, race, replay, recovery and cancellation evidence;
8. exact local commands with exit, test/pass/fail/skip counts and output hashes;
9. exact hosted run/job IDs, conclusions and annotations;
10. artifact names, counts, bytes, inner hashes, schema results, retention and
    all-and-only audit, including explicit zero where zero is expected;
11. signature, signer, DCO, clean-tree and local/remote/PR-head equality;
12. secret/content/redaction scans and every unresolved finding;
13. forbidden work explicitly confirmed absent; and
14. exactly one state: `READY_FOR_REVIEW`, `BLOCKED`, or `NEEDS_OWNER`.

An omitted item returns the package without review.

### 4.2 Hashed independent review verdict

Every acceptance decision is a detached, immutable canonical JSON artifact
named:

```text
phase6-review-<lower-package-id>-<40-hex-result-sha>.json
```

It is not committed into the product result SHA it reviews. D0-13 must freeze
its durable hosted/ledger location and retention before F1. The Orchestrator
ledger records its raw byte size, immutable coordinate and SHA-256.

The artifact has exactly these required logical fields; the final strict schema
and canonicalization are supplied by the accepted D0/F1 pack:

```text
schema_version
package_id
repository
entry_sha
result_sha
input_shas
predecessor_shas
predecessor_verdict_digests
diff_path_digest
allowed_path_digest
protected_path_digest
commands[] { command_id, command_digest, exit, pass, fail, skip, output_digest }
hosted_runs[] { run_id, job_set_digest, conclusion, artifact_set_digest }
findings[] { finding_id, severity, file, line_or_key, state, evidence_digest }
verdict
reviewer_name
reviewer_task
reviewed_at
no_contribution_attestation
record_digest
```

`record_digest` is SHA-256 of canonical artifact bytes with `record_digest`
omitted. `no_contribution_attestation` must affirm that the reviewer authored
no package bytes, expected outcomes, implementation decisions or handoff
evidence. A false, missing or unverifiable attestation is `REJECT`.

The only clean verdict is `ACCEPT`. `ACCEPT_WITH_NOTES` is not a completion
state. Any actionable note is `REJECT`; after repair, the same reviewer or an
eligible replacement repeats the entire review and emits a new artifact for
the new result SHA.

## 5. Serial waves and the three-subagent limit

The root task plus at most three live subagents is a hard scheduler limit. A
reserved role consumes no slot until dispatched. `/root` must not dispatch a
fourth subagent, and a Sol in `waiting`, monitoring, or an unfinished task still
occupies a slot.

### 5.1 Required waves

| Wave | Work admitted | Gate to next wave |
| --- | --- | --- |
| **G0 D0 freeze** | Proposal revision, independent D0 reviews and owner decisions only; no Phase 6 product work | One coherent ratified D0 record, accepted hashes, exact work-package header and accepted D0-14 matrix |
| **F-A** | Peirce implements F1; after handoff and slot release, Beauvoir reviews F1 | Accepted F1 SHA and verdict digest |
| **F-B** | Peirce implements F2; after handoff and slot release, Beauvoir reviews F2 | Accepted F2 SHA and verdict digest |
| **F-C** | Kosmos-Oden implements F3 from accepted F1/F2; after slot release, independent MCP reviewer reviews F3 | Accepted F3 SHA and verdict digest |
| **F-D** | Beauvoir executes F4 authoritatively against the accepted exact F2/F3 SHAs; after slot release, `/root` performs bounded F4 review | Accepted F4 SHA and verdict digest |
| **F-E** | Fresh Full evidence implementer runs F5; after full handoff and slot release, fresh evidence reviewer independently audits F5 | Accepted signed, hosted-green F5 SHA, artifact ledger and verdict digest |
| **L-A** | Beauvoir implements L1 from the exact accepted F5 pin; after slot release, fresh Full-conformance reviewer `/root/phase6_full_conformance_reviewer` reviews L1 | Accepted L1 SHA and verdict digest |
| **L-B** | Beauvoir implements L2 and Peirce implements L3 in disjoint worktrees; reviews occur only after the corresponding implementer releases its slot | Accepted L2 verdict from MCP reviewer and accepted L3 verdict from `/root` |
| **L-C** | Fresh Lite evidence implementer runs L4; after full handoff and slot release, evidence reviewer independently audits L4 | Accepted signed, hosted-green L4 SHA and verdict digest |

### 5.2 Slot-release rule

A package author releases its slot only after it:

1. stops all commands and monitors;
2. writes the complete immutable handoff;
3. reports exact branch/result SHA and dirty-state evidence;
4. declares `READY_FOR_REVIEW`, `BLOCKED`, or `NEEDS_OWNER`; and
5. makes no further package edits unless a rejection is returned through a new
   explicitly scheduled repair turn.

The reviewer sees the frozen snapshot only after release. Any author edit while
review is running invalidates the review. The reviewer stops, records `REJECT:
SNAPSHOT_CHANGED`, releases its slot, and waits for a new result SHA.

No speculative concurrency crosses an acceptance dependency. In particular:

- F3 product implementation waits for accepted F2.
- F4 may prepare a harness after F1, but it may not execute authoritative
  expected outcomes or be accepted until both exact F2 and F3 are accepted.
- F5 waits for F2/F3/F4 acceptance.
- all Lite work waits for accepted F5; L2/L3 wait for L1; L4 waits for L2/L3.
- L2/L3 concurrency is allowed only with disjoint frozen path inventories and
  enough released slots for their independent reviews.

### 5.3 Reserved stop-concurrence mini-waves

Reserved D0-15 specialists are dispatched only after the affected product or
evidence lane is suspended and its author/reviewer slots are released. A stop
never runs concurrently with repair of the affected bytes or expected
outcomes. `/root` may dispatch at most the exact concurrence pair required by
section 6, leaving the root plus no more than two active specialist subagents.

The serial stop mini-waves are:

1. freeze the affected snapshot, preserve redacted evidence, release every
   contributor slot, and obtain the Product Owner's explicit semantic decision;
2. dispatch the named independent concurrence Sol or pair for that stop class;
3. collect separate hashed concurrence verdicts with exact input SHAs,
   commands, findings, identity and no-contribution attestation, then release
   every concurrence slot;
4. only after all required verdicts accept the owner decision, schedule a new
   author repair turn; and
5. after repair, dispatch package acceptance reviewers under their ordinary
   wave. A concurrence verdict is never reused as package acceptance.

Each concurrence verdict uses the detached artifact and canonical field rules
in section 4.2, with the exact affected proposal/package SHA as `result_sha`
and a stop-specific `package_id`. Migration and protocol/catalog pairs emit
two separately signed verdict artifacts; combining two identities into one
artifact or one Sol accepting for both roles is forbidden.

Bootstrap uses the migration reviewer alone. Migration uses the migration and
security reviewers together. Protocol/catalog/error resolution uses the Full
contract steward and Lite-conformance reviewer together. If one member of a
pair recuses or is unavailable, the other may remain only if still independent;
the replacement is dispatched in the released slot and repeats the complete
concurrence review.

## 6. Stop, escalation and exact D0-15 role mapping

Any Sol stops before changing bytes or expected outcomes when a frozen SHA,
hash, schema, path, bound, state, error, race winner, platform result, artifact,
signature or independence attestation is missing, mismatched or ambiguous; when
a secret/content leak occurs; when a required negative is skipped; or when the
work would create contract drift, a weaker denial, an unbounded value or a
second semantic authority.

`/root` suspends the affected lane, preserves evidence and routes semantic
questions to the Product Owner. It never supplies the semantic answer. Until
D0-15 is independently accepted, all mappings below are revision-pending and
every semantic stop remains an owner decision.

| Stop class | Technical concurrence Sol after owner decision | Recusal/replacement rule |
| --- | --- | --- |
| Credential encoding, entropy, digest/KDF, reveal, storage or rotation | Independent security reviewer `/root/phase6_security_reviewer` | The security reviewer recuses from any package or rule it contributed to; dispatch a fresh credential-security reviewer with no affected-package or expected-outcome contribution. |
| Disable, revoke, stale authority or lifecycle race | Beauvoir | For Beauvoir-authored F4/Lite material, use a new independent authority/concurrency reviewer; `/root` may only decide its bounded F4/L3 review verdict. |
| Bootstrap/default identity/legacy-token source | Independent migration reviewer `/root/phase6_migration_reviewer` | The migration reviewer must be independent of the bootstrap bytes, state machine and expected outcomes; replace with a fresh migration specialist, never an upstream author. |
| Migration transition, crash, retry or duplicate | Independent migration reviewer `/root/phase6_migration_reviewer` plus independent security reviewer `/root/phase6_security_reviewer` | Both separately concur and both recuse from affected contributions. Replace only the recused role with a fresh same-specialty Sol; neither verdict substitutes for the other. |
| Identity, credential or mapping collision | Independent security reviewer `/root/phase6_security_reviewer` | A contributing security reviewer is replaced by a fresh security Sol; no retry-to-hide or overwrite waiver exists. |
| MCP/CLI/HTTP protocol, tool catalog or closed-error projection | Independent Full contract steward `/root/phase6_full_contract_steward` plus independent Lite-conformance reviewer `/root/phase6_lite_conformance_reviewer` | Apply recusal per affected package: neither may have contributed to the affected package or expected outcome, and the Lite reviewer may not have contributed to the governing Full rule. Kosmos-Oden, Peirce and Beauvoir may supply immutable facts only; replace a recused role with a fresh same-side specialist. |
| Redaction or content leakage | Independent security reviewer `/root/phase6_security_reviewer` | The reviewer must be independent of the leak-producing rule/package. No suppression or leaked-value baseline is a resolution. |
| Disable/rotate/reconnect/cancel/recovery winner | Beauvoir | On Beauvoir-authored material, dispatch a new concurrency reviewer. Timing-dependent outcomes cannot be accepted. |
| Secret exposure | Independent security reviewer `/root/phase6_security_reviewer` | Immediate global affected-lane halt and out-of-repository containment; a contributing reviewer recuses and is replaced by a fresh security Sol; no waiver. |
| Evidence, job, artifact, signature or digest mismatch | Independent evidence reviewer | Evidence implementers and `/root` cannot overrule or repair the verdict. A new complete terminal-green evidence set is required. |

The Product Owner owns semantic resolution subject to the required independent
concurrence. `/root` owns process stop/resume only. Each resolution must update
the exact D0 decision artifact, regenerate affected hashes/manifests/fixtures,
and invalidate every downstream verdict that consumed the old value.

Signing or concurring with a semantic resolution counts as expected-outcome
contribution for every affected downstream package. That concurrence Sol must
recuse from accepting those packages and, for the independent evidence reviewer,
from F5 or L4 whenever the resolved rule is exercised there. `/root` must then
dispatch a fresh qualified reviewer under section 7; a concurrence receipt may
never be used as evidence of later review independence.

No stop may be cleared by force-push, destructive reset, evidence deletion,
fixture weakening, undocumented skip, signing/DCO weakening, local-only
substitution for a hosted gate, or manual relabeling of mismatched evidence.

## 7. Recusal and replacement rotations

Independence follows contribution history, not task name. Replacing an agent
never erases prior authorship. The ledger records every contributor, reviewed
path, decision, expected-outcome change, recusal, replacement reason and fresh
no-contribution attestation.

Replacement rules:

1. Before any edit, an unavailable implementer may be replaced by a new
   same-specialty Sol; the reviewer may remain only if still independent.
2. After any edit or implementation decision, the replacement inherits the
   author lane. Neither original nor replacement author may review it.
3. An unavailable or recused reviewer is replaced by a new independent Sol
   that repeats review from the beginning.
4. A reviewer who supplies a patch or chooses an expected outcome becomes a
   contributor, immediately recuses and cannot later resume review.
5. No replacement reviewer may be an upstream author whose work is consumed by
   the package. L1 always uses a fresh Full-conformance reviewer with no
   F1/F2/L1 contribution; Peirce supplies immutable F1 coordinates only.
6. If no eligible named Sol exists, `/root` dispatches a fresh specialist with
   a new canonical task name; review is never waived.

| Affected role | Required replacement rotation |
| --- | --- |
| F1/F2 Peirce implementer | Fresh Full contract/authority implementer; Beauvoir remains reviewer only if she supplied no patch or expected outcome. |
| F1/F2 Beauvoir reviewer | Fresh contract-security or authority/concurrency reviewer; do not rotate an upstream or downstream author into acceptance. |
| F3 Kosmos-Oden implementer | Fresh MCP capability implementer, not Peirce or Beauvoir. |
| F3/L2 MCP reviewer | Fresh independent MCP reviewer with no F1-F3 or L1-L2 contribution. |
| L1 Full-conformance reviewer | Fresh Full-conformance reviewer with no F1/F2/L1 contribution; never Peirce or an F1 expected-outcome author. |
| D0-15 migration reviewer | Fresh migration specialist with no affected bootstrap/migration or expected-outcome contribution; repeat the full concurrence review. |
| D0-15 security reviewer | Fresh security specialist with no affected credential/migration/collision/redaction/secret-rule contribution; repeat the full concurrence review. |
| D0-15 Full contract steward | Fresh Full contract specialist with no affected registry/catalog/protocol or package contribution. |
| D0-15 Lite-conformance reviewer | Fresh Lite conformance specialist with no affected Lite contribution and no contribution to the governing Full rule. |
| F4 Beauvoir implementer | Fresh adversarial-fixture implementer who did not author F2/F3. |
| F4/L3 `/root` reviewer | Fresh adversarial/conformance reviewer; `/root` remains ledger coordinator only. |
| F5 Full evidence implementer | Fresh evidence implementer with no F1-F4 authorship or review. |
| L1/L2 Beauvoir implementer | Fresh Lite/cross-platform implementer; assigned reviewer must be rechecked for contribution overlap. |
| L3 Peirce implementer | Fresh cross-language adversarial implementer with no L1/L2 authorship. |
| L4 Lite evidence implementer | Fresh evidence implementer with no L1-L3 authorship or review. |
| F5/L4 evidence reviewer | Fresh independent evidence reviewer with no product/evidence authorship; repeat the complete audit. |

## 8. Final evidence independence and completion

F5 and L4 are evidence packages, not opportunities to repair product code.
Their implementers receive immutable accepted SHAs and verdict digests. If a
test, artifact or platform failure requires any product, fixture, expectation
or workflow semantic change, the evidence lane stops and returns the finding to
the earliest responsible package. Every downstream review and evidence result
affected by the change is invalidated.

The Full/Lite evidence implementers may only execute frozen commands, assemble
frozen receipts/artifacts, verify signatures/DCO/coordinates and write the
explicitly allowed evidence outputs. The evidence reviewer independently:

- reruns critical local commands from clean exact SHAs;
- verifies every hosted job conclusion and annotation;
- downloads and inspects all-and-only artifacts by content, not name alone;
- recomputes inner and outer hashes, schemas, counts and coordinates;
- verifies signature/DCO and local/remote/draft-PR equality;
- checks secret/content scans and forbidden claims; and
- emits the detached hashed review verdict.

`/root` may schedule runs and copy exact coordinates into the ledger. It may not
author F5/L4 evidence, edit the evidence handoff, decide evidence mismatch,
accept a final evidence package, or replace the evidence reviewer's verdict.

A package is `DONE` only when:

- all entry/predecessor SHAs and verdict digests are exact and current;
- the diff is wholly inside the frozen list and ceiling, with protected paths
  unchanged;
- strict schemas and all required fixtures pass exactly once;
- applicable focused, regression, adversarial, concurrency, recovery,
  redaction and platform gates meet frozen expectations without unauthorized
  skip;
- hosted jobs are terminal green and artifacts satisfy the all-and-only
  contract;
- commits are signed and DCO-compliant, trees are clean, and local, remote and
  draft-PR heads agree;
- the independent reviewer emits `ACCEPT` with no unresolved blocker, HIGH or
  MEDIUM finding and a true no-contribution attestation; and
- the Orchestrator ledger records the verdict artifact's immutable coordinate,
  bytes and SHA-256.

F5 additionally produces the exact reciprocal handoff consumed by L1. L4
additionally proves the exact Full pin and obtains the frozen reciprocal Full
approval. Completion never implies merge, ready-for-review, tag, release,
deployment, activation or publication.

## 9. Closure ledger for this governance correction

| Review concern | Correction in this revision | State |
| --- | --- | --- |
| F1 reviewer overlapped the capability lane | F1 is Peirce / Beauvoir | `CLOSED_IN_PROPOSAL` |
| F3 reviewer was an upstream Full author | F3 uses reserved independent MCP reviewer | `CLOSED_IN_PROPOSAL` |
| F4 could execute against draft F2/F3 | Authoritative F4 execution waits for independently accepted exact F2+F3 SHAs | `CLOSED_IN_PROPOSAL` |
| `/root` authored final evidence | Fresh Full/Lite evidence implementers own F5/L4 | `CLOSED_IN_PROPOSAL` |
| Final evidence reviewer had contributor overlap | Fresh independent evidence reviewer owns both final verdicts | `CLOSED_IN_PROPOSAL` |
| `/root` could author and accept evidence | `/root` is ledger/process coordinator and only bounded F4/L3 reviewer | `CLOSED_IN_PROPOSAL` |
| Review verdicts were prose-only | Detached canonical hashed verdict artifacts and mandatory fields are defined | `CLOSED_IN_PROPOSAL` |
| Concurrency exceeded available Sol slots | Explicit serial waves and root-plus-three slot-release rule are defined | `CLOSED_IN_PROPOSAL` |
| Replacement could reuse upstream authors | Contribution-history recusal and fresh-specialist rotations are mandatory | `CLOSED_IN_PROPOSAL` |
| D0-15 concurrence roles were unnamed | Every stop class maps to named Sol roles with recusal replacement | `CLOSED_IN_PROPOSAL` |
| L1 reviewer authored the consumed F1 bytes/outcomes | Fresh reserved Full-conformance reviewer accepts L1; Peirce supplies immutable coordinates only | `CLOSED_IN_PROPOSAL` |
| Bootstrap and migration shared an inexact concurrence row | Bootstrap uses the migration reviewer; migration requires separate migration and security concurrence | `CLOSED_IN_PROPOSAL` |
| Protocol/catalog mismatch reused package contributors | Fresh Full contract steward plus fresh Lite-conformance reviewer concur with package-specific recusal | `CLOSED_IN_PROPOSAL` |
| D0 state language implied missing inputs | D0-1 is closed; D0-2 through D0-13 and D0-15 are revision-pending cross-review | `CLOSED_IN_PROPOSAL` |

The artifact remains a proposal until independently reviewed and owner
ratified. Product execution remains:

**`NO-GO — PHASE6_NOT_STARTED`**
