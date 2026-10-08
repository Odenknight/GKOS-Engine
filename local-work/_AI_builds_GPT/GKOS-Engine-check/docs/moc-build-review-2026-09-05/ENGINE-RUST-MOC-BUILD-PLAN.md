# GKOS-Engine Rust — deterministic MOC implementation plan

Date: 2026-09-05. Status: proposed MOC companion to master r5.4.
Repository: `Odenknight/GKOS-Engine-Rust`.
Reviewed planning head: `integration/m0@7ab22b5dccb3992a777f5787072ba9bf617c7860`.
Reviewed main: `19058b21acbf84c1327b4a5291decac181a557ad`.
Intended repository location: `docs/plans/companions/ENGINE-RUST-MOC-BUILD-PLAN.md`.

## Program alignment

The published master already plans Navigation host work in M2 and governance/
effects in M4. This companion supplies MOC-specific work and acceptance gates;
it does not start a competing milestone sequence or bypass M0 qualification.

Retain the owner-approved TS oracle
`8207958047b3361ae21ac07c5a2abbd26a42a684`, existing Standard locks, r5.4
precedence rules, Full-owned core and projection-only Lite profile. Rust source
lives in this repository, not the TS `rust-3.0` pointer branch.

Initial effects remain SyntheticExecutor, DryRunExecutor and
ReceiptOnlyExecutor. Real vault writes are a later, separately activated host
capability. The plan includes their implementation/qualification requirements
without declaring activation authorized or the Rust engine implemented.

## R-MOC-0 — register surfaces and provenance under M0

1. Register this companion additively in the current plan manifest/registry and
   checksums through the established intake procedure. Preserve archived plans.
2. Add MOC surfaces to WP-16: discovery, classification, candidates, render,
   diff, audit, context, invalidation, ownership, planning, execution/recovery,
   assistance, settings and refusal outcomes. Assign one owner per surface.
3. Refresh the drift ledger: TS PR #40 is merged; reviewed TS main is
   `d81f9d1351f1a9228650a840629191a92f2dfb22`. This does not move the oracle.
4. Keep three evidence lanes distinct:
   - `oracle_capture`: actually execute the frozen oracle for legacy Navigation.
   - `new_required` / `new_contract`: pin accepted post-oracle Effects and
     assistance specifications and expected outputs; not oracle parity.
   - `consumer_capture`: exact Kosmos/Engine artifact observations; not a new
     semantic oracle merely because a consumer rendered them.
5. Capture raw inputs, stdout/stderr bytes, exit codes, build and fixture
   digests, runtime/OS and expectation disposition. Differences use the master's
   blocking classifier; classification alone never waives a mismatch.

Gate: surface inventory and provenance are complete; M0 acceptance remains
required before feature implementation. Planned commands are not runnable
evidence until their executables exist.

## R-MOC-1 — pure Navigation and tag semantics under M1/M2

Place pure Navigation logic with core/graph types according to the accepted
workspace ownership. Host composition belongs in `gkos-service`; authorized
effects belong with `gkos-govern` and explicit host adapters, durable storage in
`gkos-store`, receipt primitives in `gkos-receipts`. These are ownership roles,
not authorization to create additional public crates or bypass the kernel rule.

Port legacy discovery, canonical names/promotion, classification, candidate
bytes, semantic/text diff, audit, context and affected-scope invalidation from
the oracle. Preserve exact `_archive/moc-runs/**` exclusion and `.gkx` host-state
exclusion. Missing/invalid sensitivity fails closed before serialization.

Use the master's parity primitives: UTF-16 ordering where required by TS
compatibility, pinned Unicode normalization, JS-compatible number/JSON rules,
explicit BOM and line-ending behavior. Do not substitute Rust string ordering,
HashMap iteration, serde defaults or byte-normalizing reads without fixtures.
Preserve exact before-image bytes even when parsing uses normalized text.

Preserve five distinct tag layers: authored, derived keys, proposed, approved
and effective. Body hashtag extraction must understand Markdown structure;
it must not turn headings, fenced examples or URLs into authored metadata.
Use stable UID and exact unambiguous references for deterministic cross-links.
Shared-topic or model-inferred links remain proposals. Duplicate IDs, cycles and
multiple successors never produce a confidence-selected lineage winner.

Gate: legacy Navigation matches oracle bytes/statuses, or carries the master's
reviewed nonblocking disposition. Kernel dependency and source/API canaries
prove no filesystem, network, model or authority execution enters Navigation.
Full and Lite share the same semantic code and results for permitted reads.

## R-MOC-2 — deterministic coordinator under M2

Compose watcher, graph/index and MOC planning in the host. Reuse watcher intent
and recovery mechanisms where ownership is compatible; do not confuse derived
index activation with permission to rewrite source notes.

- Durably acknowledge events, including both rename endpoints; use stable IDs
  and current paths to derive affected scopes and parent/master dependencies.
- Debounce 750 ms, maximum delay 3 s, with injected monotonic scheduling clocks.
- Bound channel capacity, pending path count and queued bytes. Overflow becomes
  a durable full-reconciliation intent; cancellation must not lose admitted work.
- Suppress completed self-events by effect identity and verified digest.
- Reconcile at startup, readiness, abnormal exit, resume, watcher errors,
  overflow, bulk sync, manual request and optional five-minute intervals.
- Preserve events arriving during a run and partial-run state. Use full scans
  only when incremental invalidation cannot be proven sufficient.
- Stop admission, persist work and reach a durable atomic boundary within a
  shutdown budget. Test task cancellation/panic and OS process termination.

Gate: synthetic and dry-run coordination converges after missed events and
restart with bounded queues. M2 introduces no real source writer.

## R-MOC-3 — ownership, plans and receipts under M4

Define unmanaged, region-managed and fully managed ownership. Existing human
MOCs require reviewed hash-bound adoption. Validate versioned marker grammar,
placement/config bindings, duplicate/nested markers and exact human regions.
Explicitly specify empty-scope and multiple-MOC-target outcomes; no silent
deletion, winner selection or automatic adoption.

Plans bind target/operation, prior digest or absence, proposed bytes/digest,
source/corpus/configuration/policy bindings, authority and idempotency identity.
Readiness does not grant authority. Validate credential/grant status, scope,
expiry, sensitivity and retention again at execution, not just deserialization.
Keep capability constructors and authority-bearing values sealed behind the
accepted governance boundary; JSON fields cannot mint a permit.

Synthetic/dry-run/receipt-only executors must faithfully exercise CAS conflict,
no-op, stale, denied and recovery-required results. They must never issue a
receipt that implies a filesystem write occurred.

Use domain-separated receipt chaining and the master's separate integrity,
anchor agreement and completeness results. A self-consistent ledger suffix
does not establish completeness without a trusted independently retained anchor.
Do not silently substitute a Rust receipt format for existing TS Effects 1.0;
freeze a compatible encoding or version a reviewed mapping with test vectors.

Gate: new-contract fixtures cover plans, markers, source bytes, archive paths,
diffs, authority denial and recovery classification. Frozen legacy oracle
fixtures remain unchanged. No real writer is enabled.

## R-MOC-4 — optional model assistance, host only

Provide an optional host trait for bounded structured suggestions. Models are
unnecessary for deterministic tags, explicit links and canonical MOC generation.
Do not add provider dependencies or network paths to Navigation/core crates.

Require explicit provider/destination/data-access configuration. Apply visibility
and sensitivity policy before payload construction, including links, counts,
titles and evidence snippets. Use secret references, endpoint validation, size/
token/call budgets, timeout and cancellation; no vault write tools reach a model.

Accept only schema-valid tag, link and MOC section/summary proposals with known
UIDs and evidence bindings. Reject unknown fields, duplicate keys, unauthorized
references, executable markup and sensitivity lowering. Record deterministic
baseline and advisory artifacts separately. Provider error or absence preserves
the baseline and exposes a redacted status.

Review binds source/config/policy/proposal digests. Promotion to a candidate is
a separate host operation that uses normal ownership and effect preconditions.
Approved recorded proposals are replayable; a new LLM invocation is not promised
to match. Use the same accepted assistance fixtures across TS and Rust under
the new-contract lane. Never label local unmerged TS output an approved oracle.

Gate: hostile mocked-provider tests, offline operation and replay pass. Live
provider quality/cost evaluation is optional evidence with explicit scope.
Lite may produce/inspect proposals through allowed host surfaces, but cannot
acquire Full effect authority through a feature flag or serialized permit.

## R-MOC-5 — disabled native executor and qualification under M4/M6

Before real-vault activation, implement and qualify: single-writer vault lease;
deterministic scoped locks; durable journal framing/sequence/hash checks;
exact before-image archive; temp write and flush; atomic replacement;
after-read verification; immutable receipt/commit; ownership advancement;
graph/index publication and crash recovery across each boundary.

Archives are `_archive/moc-runs/YYYY-MM-DD/<run-id>/` with manifest, exact diff,
before/after bytes, result and per-effect receipts. A create records absence.
Recovery validates historical archives/receipts while comparing live bytes with
the correct current committed target head. Later stale/aborted operations must
not conceal target tampering. Corruption and conflicts block enablement.

Re-prove path security on native platforms. Reject traversal, UNC/drive/device
names, Unicode/case collisions, trailing-dot/space aliases and symlink/junction/
reparse escapes. Prefer directory-relative or handle-based operations where
available; specify any remaining cooperative-writer assumptions. No string
canonicalization check alone proves resistance to ancestor-swap races.

Declare per-platform durability: file versus directory flush, rename/replace
behavior, ACL/ownership preservation, open-handle conflicts and weak/network
filesystems. Deny unsupported guarantees. SIGKILL/panic tests are distinct from
physical power-loss testing. Rollback requires fresh authority and CAS.

Gate: native Windows and Debian 13+ acceptance follows the selected lifecycle
profiles; hosted Ubuntu/Windows are coverage, not replacements for required
native receipts. Qualify macOS and other targets only when claimed. Keep the
real executor disabled until its existing separate activation gate is met.

## R-MOC-6 — performance and downstream handoff under M6/M7

Use 100/2,000/10,000/50,000-note corpora and a 24-hour watcher/reconciliation
soak. Test single edits, 50-note bursts, bulk imports, deletes, renames, sync
storms and concurrent committed agent-note events. Record latency distributions,
RSS, parsing counts, queue depth, handles and journal growth. Proposed MOC
objectives: P95 <2 s for one edit in 2,000 notes, <5 s for a 50-note burst.
Apply the master's preregistered benchmark/noise protocol; output digests remain
exact. Do not claim Rust is faster without comparable measurements.

Supply a synthetic-vault executable example, contract adapter and evidence
package. Kosmos receives a pinned released artifact, truthful per-capability
readiness, ownership/recovery interfaces and compatibility fixtures. Preserve
its separately required browser/offline route; this plan adds no Rust WASM
commitment. Full owns effect authority; Lite refuses it explicitly.

Done for the initial Rust delivery means pure MOC parity and new-contract
planning/assistance plus dry-run recovery pass, with real writes truthfully
disabled. Done for activated managed writes additionally requires native
transaction/recovery, lifecycle, scale/soak, downstream integration and separate
activation evidence. Report these as distinct milestones, not one completion
claim. Preserve release signing and authorization gates from deployment r2.4.

## Sources and standing

See [review and pinned GitHub sources](REVIEW.md). This companion is not yet
admitted into the Rust plan registry and does not alter the frozen oracle,
Standard coordinates, accepted master bytes or current M0 execution scope.
