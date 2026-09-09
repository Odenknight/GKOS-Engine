# GKOS Phase 6 minimum work-package plan

Plan date: 2026-08-25 (America/New_York)

Status: **PLANNED, NOT EXECUTABLE AS PHASE 6**

Entry decision: **NO-GO**. Only admission closeout and owner/schema decision
closure may proceed. Product implementation packages F1-F5 and all Lite Phase
6 packages remain ineligible until the entry audit is fully green.

Companion audit:
`future-build-phase6/PHASE6_ENTRY_AUDIT_2026-08-25.md`.

## 1. Dependency spine

```text
A0 Full admission closeout -----+
                                +--> D0 authority decisions --> F1 Full contracts --> F1R independent freeze review
A1 Lite admission closeout -----+                                      |
                                                                       +--> F2 Full authority engine --+
                                                                       +--> F3 MCP façades ------------+--> F5 Full platform/evidence
                                                                       +--> F4 security fixtures ------+          |
                                                                                                                  v
                                                                                                       hosted-green signed Full pin
                                                                                                                  |
                                                                                                                  v
                                                                                                     L1 Lite repin/private verifier
                                                                                                                  |
                                                                                               +------------------+------------------+
                                                                                               v                                     v
                                                                                     L2 wrapper conformance                L3 adversarial fixtures
                                                                                               +------------------+------------------+
                                                                                                                  v
                                                                                                       L4 Lite platform/evidence
                                                                                                                  |
                                                                                                                  v
                                                                                                       reciprocal review + closeout
```

Full TypeScript is the only semantic authority. Lite Rust/wrappers conform to
the exact hosted-green Full pin, reproduce denials and public errors, and may
not add semantics or weaken a denial.

## 2. Ready-now work versus blocked work

| Package | May proceed now? | Owner/role | Exact purpose | Completion gate |
| --- | --- | --- | --- | --- |
| A0 Full admission closeout | YES, already in progress; not Phase 6 | Current Full Sol lane `/root/compare_engine`; independent gate owner must be named by Orchestrator | Finish defects-before-Phase-6 repairs from Full `7b5262b...`, test, review, produce exact clean signed+DCO continuation and hosted evidence. | All agreed defect gates pass; exact diff/path inventory; no Phase 6 surface; clean tree; independent findings resolved; hosted-green exact head. |
| A1 Lite admission closeout | YES, already in progress; not Phase 6 | Current Lite Sol lane `/root/compare_engine_lite`; independent Full-side reviewer must be named | Finish verifier-only/desktop truthfulness repairs from Lite `a39f14d...`; preserve no-runtime-authority. | Green Node/desktop/Rust matrices or explicit resolved platform blocker; exact diff/path inventory; clean signed+DCO continuation; hosted green; no Phase 6 surface. |
| D0 Phase 6 authority decision register | YES, Q&A/documentation only | Product owner answers; Orchestrator records; independent auditor verifies closure | Resolve every question in section 5 as exact normative values. No product code. | No `TBD`, ambiguous alternative, open schema field, unbounded input, or unnamed role remains. |
| F1 Full contract pack | NO | Sol implementer + different Sol reviewer, both to be named after D0 | Mechanically generate/freeze all Full identity/MCP schemas, fixtures, vocabulary, state machines, path protections, manifest, and evidence contracts. | F1 focused generation/schema/semantic/security tests and independent review pass; exact pack manifest and protected inventory freeze. |
| F2 Full authority engine | NO | Named Full Sol + non-overlapping reviewer | Implement identity, credentials, sessions, per-operation authorization, revocation generations, activity, migration, replay/idempotency, CLI/service operations exactly from F1. | Focused authority/concurrency/recovery/security tests and review pass; no contract drift. |
| F3 Full MCP façades | NO | Different named Full Sol + different reviewer | Implement only the frozen transport façades and bounded tools over qualified Full capabilities. | Transport/tool/cancellation/closed-error/redaction tests pass; no second semantic implementation. |
| F4 Full adversarial fixtures | NO | Independent Sol test owner; must not author F2/F3 behavior | Execute the frozen collision, stale, cross-agent, leak, replay, race, migration, crash, bounds, cancellation, and regression corpus. | Every case consumed exactly once; no skipped required negative; secret scans clean. |
| F5 Full platform/evidence | NO | Independent evidence Sol | Run exact local/hosted matrix and inspect all-and-only artifacts. | Signed+DCO exact Full head, hosted-green jobs, artifact digests/inventory, clean tree, reciprocal review, zero unresolved blocker/HIGH/MEDIUM. |
| L1 Lite repin/private verifier | NO; waits for F5 | Named Lite Sol + Full reviewer | Copy frozen Full pack byte-for-byte, create exact `FULL-PIN`, and privately verify schema/semantic fixture parity. | Zero pin/hash/name mismatch; verifier private/inert; exact Full hosted pin; no ordinary dependency change unless separately authorized. |
| L2 Lite wrapper conformance | NO; waits for L1 | Named Lite wrapper Sol + independent reviewer | Expose only required wrapper behavior and identical public states/errors over Full authority. | No Rust semantic fork, service authority, filesystem writer, provider authority, or weakened denial; wrapper tests pass. |
| L3 Lite adversarial fixtures | NO; waits for L1 | Independent Sol, not L1/L2 author | Reproduce Full negatives, error/state behavior, redaction, races, migration, and exact pin failures. | All frozen public behavior matches Full and cross-language vectors are byte/digest exact. |
| L4 Lite platform/evidence | NO; waits for L2/L3 | Independent evidence Sol | Run frozen Rust/Node/desktop/platform/linkage/package matrices and audit artifacts. | Signed+DCO exact Lite commits, hosted green, exact artifact inventory, clean tree, Full reciprocal approval, zero unresolved blocker/HIGH/MEDIUM. |

At the 2026-08-25 snapshot, A0 reports Full typecheck, build, focused
Navigation/Effects 109/109, focused Phase 0 compatibility 4/4, pinned Phase 4/5
inventory 1/1, intelligence 4/4, license, and nomenclature green. The first
full suite was 848 total / 841 pass / 2 integration-lock failures / 5 platform
skips; both narrow reconciliations pass focused reruns, while the final full
suite and pack check remain pending. A0 therefore has no terminal commit or
hosted claim.

At the 2026-08-25 snapshot, A1 reports Node 47/47, metadata/lock/Engine
compatibility guards, focused root 24/24, desktop typecheck/build and 15/15,
plus Rust 1.98 GNU `cargo check --tests --locked` green. Rust test linking is
not yet an admissible gate: GNU `ld` reports `export ordinal too large: 115881`,
MSVC `link.exe` is unavailable, and pre-existing `lib.rs` format drift prevents
a clean whole-workspace format claim. This must be resolved or supplied by the
ratified hosted platform gate before A1 closes.

## 3. Mandatory header that must be frozen for every implementation package

The Orchestrator must copy and complete this block separately for F1, F2, F3,
F4, F5, L1, L2, L3, and L4. A placeholder makes that package ineligible.

```text
Phase and work-package ID: P6-<ID>
Authority: ratified handoff + ratified guide + exact D0 decision record + exact frozen F1 pack
Qualified entry commits (Full/Lite): <post-admission exact SHAs>
Predecessor outputs required: <exact commits/packs/evidence>
Repository and branch: <exact repository and codex/* branch>
Implementing Sol subAgent: <canonical task name>
Independent reviewer: <different canonical task name>
Allowed paths and maximum path count: <terminal-LF list, raw SHA-256, integer ceiling>
Forbidden paths and operations: <exact protected inventory and mutation prohibitions>
Frozen input schemas and exact field constraints: <pack paths + hashes>
Frozen output schemas and exact field constraints: <pack paths + hashes>
State machine, transitions, retry/idempotency rules: <contract paths + hashes>
Public/private APIs and closed error domain: <contract paths + hashes>
Security negatives and forbidden claims: <fixture IDs + expected errors>
Dependency, platform, CPU, and linkage matrix: <exact versions and availability semantics>
Required local commands and expected results: <commands + exact pass/skip policy>
Required hosted jobs and exact artifact inventory: <job names + artifact names/counts/schemas>
Full/Lite ownership split and pinning rule: Full TypeScript authority; Lite exact-pin conformance only
Evidence output paths and digest rules: <exact paths + generated manifest/self-digest rules>
Stop and escalation conditions: <owner and closed condition for every guide-line-191 class>
```

Each report must bind entry SHA, resulting diff paths, tests and exact results,
artifacts, findings, unresolved risks, and one status from `DONE`, `BLOCKED`, or
`NEEDS_OWNER`. No package may mark `DONE` from local tests alone when hosted or
reciprocal gates are required.

## 4. Smallest package content after D0 closes

### P6-F1 — Full contract freeze

No runtime behavior. Generate a versioned Full-owned pack containing, at
minimum:

- strict agent identity, credential, external mapping, session, request,
  activity, disable, rotate, revocation-generation, bootstrap/migration, audit
  receipt, MCP initialization, tool request/result, and error envelopes;
- exhaustive state-transition, concurrency-winner, replay/idempotency,
  cancellation, recovery, retention, and migration relations;
- a closed error registry and exact CLI/HTTP/MCP projections;
- exact public/private operation inventory and bounded tool registry;
- canonical security fixtures and schema-negative fixtures;
- exact transport/platform/runtime/dependency matrix;
- phase allowed-path and protected-path manifests;
- hosted job/artifact/receipt schemas and all-and-only inventory;
- a mechanically generated non-self-listing manifest with raw hashes, byte
  counts, leaf counts, aggregate digest, and Full source coordinate.

The pack layout, version, filenames, generated source paths, and maximum path
count are deliberately not proposed here; they are D0 owner decisions and must
be frozen before F1 assignment.

F1 acceptance is independent regeneration plus schema closure, exact fixture
consumption, canonical-byte replay, pack manifest recomputation, protected
baseline checks, secret scan, and an independent review finding no unresolved
blocker/HIGH/MEDIUM.

### P6-F2 — Full authority engine

Implement exactly the F1 state and API contracts. Required behavior includes
per-operation authentication and authorization, stable local identity,
credential lifecycle, revocation-generation checks on active sessions,
activity privacy/retention, crash-safe bootstrap migration, deterministic race
winners, replay/idempotency, and additive owner operations. Reuse existing
bearer/SQLite/governance seams only where they satisfy F1; do not preserve an
old behavior merely because code exists.

F2 must not alter the pack, add a new error, infer a missing transition, expose
secrets/content, claim telemetry as a governance receipt, or start an MCP
transport.

### P6-F3 — Full MCP transport façades

Implement only the F1-supported transport(s), initialization/session lifecycle,
bounded tool catalog, cancellation, and exact error projection. Tools delegate
to qualified Full capabilities and policy; they do not implement independent
retrieval, graph, navigation, watcher, governance, or identity semantics.

F3 must not expose arbitrary SQL/graph queries, all-notes bypasses, source
mutation, effect execution beyond an already-qualified capability, raw errors,
unbounded payloads, caller-selected identity, or unredacted logs.

### P6-F4 — independent security and conformance

Use frozen fixtures to test identity collision, malformed/caller-supplied
identity, credential guessing/leakage, stale credentials/generations,
cross-agent/session confusion, unauthorized tools, closed unknown-tool/error
behavior, replay, cancellation, rate/body/field bounds, disable/rotate/
reconnect races, migration ambiguity, rollback/crash recovery, concurrency,
log/artifact privacy, and Phases 0-5 regression. The fixture owner must not fix
failures by weakening expected outcomes.

### P6-F5 — Full integration and publication qualification

After F2-F4 independent acceptance, freeze exact Full paths/hashes, execute the
frozen local and hosted platform matrix, audit every artifact and receipt, and
produce a signed+DCO exact commit and evidence coordinate on a draft PR. Do not
merge, tag, release, deploy, activate, or publish. Lite remains read-only until
this exact Full state is hosted green.

### P6-L1 through P6-L4 — Lite conformance

L1 copies the exact F1 pack and writes a non-authoritative exact Full pin. Its
Rust verifier is crate-private and inert. L2 adds only required wrapper
conformance to the Full authority; it cannot run a second identity/MCP service
or define errors/state. L3 independently replays Full schemas, semantic cases,
errors, races, redaction, migration, and pin negatives. L4 executes the frozen
Rust/Node/desktop/platform/CPU/linkage/package matrix, audits exact artifacts,
and obtains an adversarial Full-side review before signed+DCO evidence closeout.

## 5. D0 owner Q&A — every answer must be exact

The Orchestrator should ask these questions before assigning F1. Where multiple
choices are shown, they are questions, not recommendations or defaults.

1. Which exact post-admission Full and Lite commits are the Phase 6 bases, and
   which hosted runs independently qualify them?
2. What is the Full pack name/version/root, and what exact allowed path list,
   protected predecessor list, and maximum changed-path count apply to F1?
3. What is the credential wire encoding/version/prefix, exact random byte
   count, digest or KDF and parameters, `credential_id` derivation, reveal-once
   response, file/database protection, and rotation/grace behavior?
4. What are the exact identity, credential, external mapping, session, request,
   activity, policy-decision, and audit-receipt fields, limits, canonical forms,
   uniqueness rules, timestamps, retention bounds, and deletion rules?
5. Is disable distinct from credential revocation? What monotonically ordered
   generation or epoch binds requests, what wins every disable/rotate/
   reconnect race, and what exact error does each stale case return?
6. What is the bootstrap source/default identity, when is it created, what
   happens to the legacy token, and what are every migration transition,
   idempotency key, crash point, resume/rollback rule, and malformed/duplicate/
   concurrent outcome?
7. Which CLI and service operations are public, owner-only, or private; what are
   their exact request/result schemas; and what pagination and ordering rules
   apply to list/activity operations?
8. Which MCP transport(s) are supported in Phase 6—stdio, loopback Streamable
   HTTP, or both—and what protocol/version negotiation, initialization,
   session, reconnect, cancellation, and shutdown behavior is frozen?
9. What is the exact MCP tool catalog? For each tool, what bounded input/output
   schema, capability/policy dependency, identity binding, side-effect class,
   timeout, and closed error projection applies?
10. What is the exhaustive closed error registry, including CLI exit, HTTP
    status/body, MCP code/data, retryability, stable versus redacted fields,
    and unknown/internal error behavior?
11. What exact global and per-agent rate/concurrency ceilings, body/input/output/
    field/log sizes, timeouts, cancellation deadlines, session limits, activity
    cap, database cap, and retention override bounds apply?
12. Which exact Node, npm, TypeScript, Rust/MSRV, OS, architecture, CPU feature,
    linker, SQLite, desktop, and transport combinations are required, optional,
    or explicitly unavailable?
13. What local commands, hosted workflow/job names, skip/unavailable grammar,
    artifact names/counts, receipt schemas, archive digest checks, secret scans,
    and evidence paths are required?
14. Which named Sol implements and which different Sol independently reviews
    F1, F2, F3, F4, F5, L1, L2, L3, and L4? Confirm assignments do not overlap
    in a way that defeats independent acceptance.
15. Who has decision authority for each stop class—credential, revocation,
    bootstrap, collision, MCP error, redaction, race winner, migration, secret
    exposure, or evidence mismatch—and what exact artifact records resolution?

Until D0 and the entry audit close, the correct next state is:

**Continue A0/A1 and owner Q&A; do not start Phase 6 product code.**
