# GKOS-Engine TypeScript — deterministic MOC maintenance build plan

Date: 2026-09-05. Status: proposed completion companion to existing Effects 1.0.
Repository: `Odenknight/GKOS-Engine`.
Reviewed main: `d81f9d1351f1a9228650a840629191a92f2dfb22`.
Intended repository location: `docs/navigation-effects/MOC-BUILD-PLAN.md`.
Release target: existing 2.2.0 feature intent; no version bump or release implied.

## Outcome and scope

Deliver a deterministic, offline-capable Engine MOC maintenance workflow.
Relevant edits converge through durable event intent and reconciliation.
Optional LLM tagging, cross-linking and MOC organization produce separately
reviewable suggestions. The deterministic workflow must complete without a
model, API credential, Python service or network access.

Reuse Navigation 1.0 and Effects 1.0. Navigation stays source-content read-only;
no filesystem, model, transport or effect-executor dependency may enter its
transitive import graph. Existing read-only APIs and MCP tools retain their
semantics. Multi-agent note tools are a separate delivery track; this plan
only defines their committed-note invalidation interface.

Engine owns planning, deterministic artifact bytes, host contracts, execution
and recovery primitives. Kosmos owns Obsidian events, adoption/settings/recovery
UI, secrets, provider transport and vault adapter. Engine completion and Kosmos
integration completion must be reported separately.

## Baseline to reuse

Existing main includes MOC discovery/classification/candidates/diffs/audit,
GkxIndex deltas, versioned ownership markers, effect planning and a Node
executor with journal, archives, receipts and recovery. These are experimental
and require an explicit host and authority provider.

Review the local assistance/coordinator/batch-planner candidate before porting
it onto current main. Preserve unrelated dirty work. Its explicit-link lookup,
full-snapshot generation and promise queue are starting points, not evidence
of semantic linking, incremental performance or bounded event admission.

## TS-MOC-0 — freeze contracts and acceptance fixtures

1. Record current head, released artifact, Effects schema digests, policy and
   configuration versions. Do not equate package 2.1.2 with an Engine 2.2 release.
2. Define host interfaces for durable intent, recovery readiness, validated
   snapshots, target ownership, current authority, execution, ownership
   advancement and committed graph deltas. Distinguish infrastructure readiness
   from permission for an individual write.
3. Specify canonical assistance artifacts: schema version, source/proposal
   digests, source class, source UIDs, sensitivity policy binding, reason codes,
   validation results and review disposition. No new normative GKX fields.
4. Add fixtures before implementation: unmanaged, fully managed, region-managed,
   absent target, malformed markers, zero remaining sources, ambiguous MOC
   targets, duplicate IDs/YAML keys, ambiguous links, archives and sensitivity.

Gate: existing compatibility/purity tests pass; fixtures have explicit expected
bytes and statuses. Plans and suggestion values create no files on import.

## TS-MOC-1 — deterministic content and batch planning

- Generate MOCs from validated, policy-eligible sources in canonical order.
  Use explicit authored metadata, stable identity, resolved links, folder and
  tag membership. Pin normalization and comparison rules. Do not use timestamps,
  similarity or confidence to choose a lineage winner.
- Keep authored tags, derived keys, proposed tags, reviewed approvals and
  effective tags separate. Use the existing Markdown/frontmatter parser;
  distinguish body hashtags from headings, code fences, URLs and frontmatter.
  Preserve authored spelling and content outside approved transformations.
- Cross-links from exact unambiguous references are deterministic observations.
  Shared-tag/topic links are proposals with explicit reasons; no implicit
  promotion to a governed relationship. Reject unsafe link target/label markup.
- Keep complete current target bytes separate from the visibility-filtered
  corpus. A hidden or omitted target must not be mistaken for an absent file.
- Require explicit ownership/adoption for every target. Preserve exact human
  prefix/suffix bytes and validate region placement/configuration bindings.
- Define empty-scope behavior: an adopted managed region can become empty only
  through an authorized plan; otherwise return review-required. Never silently
  delete a MOC or leave a scope permanently unreconciled without status.
- Advance ownership digest/region bindings after a verified committed effect,
  with restart recovery for a crash between file commit and registry update.

Gate: identical inputs and reordered enumeration yield identical candidate,
diff, plan and proposal bytes. A second maintenance pass is a no-op. External
edits cause conflict/review rather than adoption or overwrite.

## TS-MOC-2 — durable coordinator and incremental reconciliation

- Event acceptance returns success only after durable intent exists. Persist
  create/modify/delete and both rename endpoints. Stable IDs assist invalidation
  but do not substitute for current path checks.
- Debounce 750 ms after the last event; cap continuous activity delay at 3 s.
  Use an injected monotonic clock for scheduling and explicit wall timestamps
  for receipts. Test clock rollback and restart.
- Bound both distinct pending paths and concurrent admission. Coalesce excess
  work into one durable full-reconcile flag. Do not accumulate unbounded promises
  or drop an acknowledged event. Keep events arriving during a run pending.
- Apply GkxIndex deltas; regenerate affected scopes and dependent parent/master
  MOCs. Fall back to full reconciliation when the affected set cannot be proven.
  Do not reparse the whole vault for an ordinary content edit by default.
- Exclude `.gkx/**`, exact `_archive/moc-runs/**` and recognized temporary files.
  Suppress self-events only by committed effect ID plus verified target digest.
- Reconcile at startup, vault readiness, abnormal exit, resume, watcher error/
  overflow, bulk sync, manual request, and every five minutes when enabled.
- Enable writes only after lease acquisition, journal recovery and startup
  reconciliation succeed. Stop admission at shutdown; persist pending scope,
  reach an atomic boundary within a bounded budget, then checkpoint durably.
  A stopped coordinator is not proof of a clean executor shutdown.

Gate: missed/coalesced events, inflight edits, overflow and restart converge;
partial failure retains recoverable intent and truthful status.

## TS-MOC-3 — archive, execution and recovery qualification

Use the existing hash-bound transaction protocol: current authorization and
sensitivity check; exact snapshot; deterministic plan; durable PREPARED intent;
scoped lock; authority/configuration/digest/absence/retention recheck; verified
before-image; same-directory temp write; strongest supported flush/replace;
after-image verification; immutable receipt binding and COMMITTED journal;
ownership/index updates and graph publication.

Archive under `_archive/moc-runs/YYYY-MM-DD/<run-id>/` with exact before/after
bytes, exact diff, manifest, results and immutable per-effect receipts. Record
create-only absence. Replaying a superseded effect must validate current lineage
of committed target effects without confusing old after-images with live bytes.

Revalidate current grants on retry/recovery. Corrupt journals, checkpoints,
archives or receipts block writes. Preserve external conflicts. A stale/aborted
successor must not hide a corrupted committed predecessor. Rollback is a new
authorized CAS effect, not a destructive journal rewind.

Gate: fault injection and process termination at every transaction boundary;
disk full, permissions, invalid UTF-8 policy, link/reparse escape, shared archive
races and successive-target recovery pass. Report cooperative-vault assumptions
and platform durability limitations explicitly; simulated kills do not prove
physical power-loss safety.

## TS-MOC-4 — optional model assistance

Host-injected providers are off by default. Require explicit destination/data
access approval, sensitivity filtering before payload assembly, credential
references, endpoint policy, request/response/token/call budgets, timeout and
cancellation. No tools or source-write credentials reach the model.

Return structured tag proposals, link proposals and MOC section/summary
proposals referencing only allowed UIDs and evidence. Validate schema, lengths,
duplicate keys, unknown fields, source references, markup and sensitivity.
Source documents and provider output are untrusted data.

Preserve a complete deterministic MOC independently. Provider absence, malformed
output, timeouts, unavailable credentials or quota limits leave it usable.
Do not automatically infer better quality from model use. A reviewed proposal
is bound to source/configuration/policy/proposal digests; stale review requires
recomputation. Promotion to a candidate uses the ordinary Effects planner and
current authority checks. Persist approved artifacts for deterministic replay;
fresh model calls are never described as deterministic.

Gate: adversarial mocked-provider suite plus separately labeled optional live
provider evaluation. Measure accepted/rejected suggestions and erroneous links;
LLM availability must not gate offline deterministic qualification.

## TS-MOC-5 — host integration and release evidence

Provide a runnable synthetic-vault host example and contract tests connecting
the coordinator, snapshot/index, planner, executor, ownership registry and
receipts. Kosmos then implements its adapter and UI behind opt-in vault settings.
No browser bundle imports the Node executor. Unsupported platforms remain
write-disabled with an explicit reason.

Required measurements: 100/2,000/10,000/50,000-note fixtures; single edits,
50-note bursts, renames, sync storms and continuous activity. Objectives are
P95 under 2 s for one edit in 2,000 notes and under 5 s for a 50-note burst.
Record parsing counts, queue depth, RSS, handles and raw latency samples.
Run a 24-hour watcher/reconciliation soak before claiming that gate passed.

Run current repository typecheck, build, Navigation/Effects and full runtime
qualification, public API/package checks and required hosted platforms. Bind
results to exact commit, dependency lock, commands, nonzero test counts and
artifacts. Preserve failure history; do not relax thresholds to obtain green CI.

Done means the host example executes and recovers end to end, human bytes and
archives remain protected, default reads remain compatible, deterministic mode
needs no LLM, and qualification evidence is complete for each claimed platform.
Release/publish actions follow their existing authorization gates. Kosmos final
adoption pins an immutable released Engine artifact with integrity evidence.

## Sources and standing

See [review and pinned GitHub sources](REVIEW.md). This companion closes planning
gaps; it does not retroactively qualify local assistance code, enable a writer,
amend the Standard or replace the existing Effects contract.
