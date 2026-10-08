# Coding-agent handoff: Rust deterministic MOC parity and Effects companion

Owner-requested repository-specific implementation handoff, 2026-09-06. Scope: **Odenknight/GKOS-Engine-Rust only**. Inspect repository instructions, current heads and dirty state before work. This is a staged implementation ticket, not a claim that Rust MOC code is built.

## Authoritative starting point

- Main inspected: `19058b21acbf84c1327b4a5291decac181a557ad`; planning integration `integration/m0@7ab22b5dccb3992a777f5787072ba9bf617c7860`.
- MOC companion docs: draft PR #1 targeting `integration/m0`, commit `20a85e940d1975f6904a1abe0e1ed7ebe856d2f6`.
- [Rust MOC companion plan](https://github.com/Odenknight/GKOS-Engine-Rust/blob/20a85e940d1975f6904a1abe0e1ed7ebe856d2f6/docs/moc-build-review-2026-09-05/ENGINE-RUST-MOC-BUILD-PLAN.md), with adjacent review and execution report.
- Existing controlling documents: `docs/plans/GKOS_ENGINE_3.0_RUST_MASTER_BUILD_PLAN_2026-09-05_r5.4.md`, deployment/release plan r2.4, `compat/plan-registry.json`, oracle manifest and drift manifest. Revalidate current accepted revisions before editing.
- Preserve the frozen TypeScript oracle **`8207958047b3361ae21ac07c5a2abbd26a42a684`**. TS Effects/MOC candidate `a4ed15d8de20222919f2aad43cbbea83f01d219e` in Odenknight/GKOS-Engine#43 is post-oracle development evidence, not a replacement oracle or released dependency.

The owner's next-2.X implementation is the TS 2.2.0 lane. Rust already has an accepted 3.0/M0-M7 program. Do not silently reversion Rust or create a competing Rust 2.2 line; an owner decision is required before changing that established version/program scope. MOC intake and permitted work can proceed under existing program gates.

## Ordered work packets

- [ ] **R-MOC-0 / M0 intake:** admit the companion through the existing registry/checksum process without overwriting accepted or archived plans. Inventory MOC surfaces and owners in the program's WP-16 process. Keep `oracle_capture`, `new_required`/`new_contract`, and `consumer_capture` distinct. Complete M0 acceptance before gated feature work.
- [ ] **R-MOC-1 / M1-M2 pure semantics:** port legacy discovery, canonical-name promotion, classification, candidate rendering, exact/semantic diffs, audit, context and affected-scope invalidation against executed frozen-oracle fixtures. Preserve TS-required UTF-16 ordering, pinned Unicode/JSON/number rules, BOM and line-ending semantics. Do not replace these with HashMap iteration or default serde output.
- [ ] **Deterministic assistance:** retain authored, derived, proposed, approved and effective tags as distinct layers. Parse Markdown structure; ignore code/comments/frontmatter as body hashtags. Resolve stable UID and explicit unambiguous links; inferred relatedness is only a proposal. Fail closed on duplicate identity and ambiguous lineage.
- [ ] **R-MOC-2 / M2 coordinator:** host-owned durable bounded event queue, 750 ms debounce / 3 s maximum delay, injected monotonic clock, self-event effect-ID/digest suppression, incremental scope invalidation and durable full-scan fallback. Reconcile startup/resume/overflow/bulk sync and shutdown safely. M2 uses synthetic/dry-run execution, not a real source writer.
- [ ] **R-MOC-3 / M4 ownership and effects:** unmanaged/region/full management, explicit hash-bound adoption, exact preservation outside generated regions, CAS/absence preconditions, policy/configuration/corpus/authority bindings, receipt/recovery fixtures. Start with SyntheticExecutor, DryRunExecutor and ReceiptOnlyExecutor. A simulated receipt must not imply a filesystem effect occurred.
- [ ] **R-MOC-4 optional assistance:** host-only provider trait, off by default, separate data-egress approval, pre-payload sensitivity filtering, bounded request/response/timeout/cancellation, strict proposal schema and evidence references. Offline deterministic output always remains usable. Review binds proposal/source/policy/config digests before any candidate promotion; a model cannot mint a permit.
- [ ] **R-MOC-5 / M4-M6 native executor:** only after its program gates, implement disabled-by-default real adapter, lease/ordered locks, durable intent, before archive, temp/flush/replace, after verification, receipt commit and startup recovery. Re-prove Windows path/reparse/alias security and other claimed platforms; do not inherit TS cooperative-vault assumptions as stronger native guarantees.
- [ ] **R-MOC-6 / M6-M7 qualification:** native Windows and Debian requirements per selected lifecycle profile, process-kill and cancellation matrices, exact parity/new-contract fixtures, 100/2,000/10,000/50,000-note tiers and 24-hour soak. Record comparable measurements, not unsupported Rust speed or power-loss claims.

## Module ownership and consumer contracts

Follow the accepted workspace/kernel design: pure Navigation with core/graph semantics, host composition in the service role, effect authority in governance, durable state in store, receipt primitives in receipts. These are ownership roles, not permission to invent public crates. Full owns authority; Lite remains a projection/read profile and cannot gain writes via a feature flag or deserialized permit.

TS owns its Effects encoding. Either freeze compatible Rust bytes or obtain review for a separately versioned mapping with shared vectors; do not silently substitute Rust receipts. Record original raw inputs/outputs, fixture hashes, exit codes, toolchain/OS and exact commits. Never rewrite historical oracle evidence to match new behavior.

Kosmos receives an adapter contract and an authorized immutable artifact only when qualified/released. Preserve Kosmos's browser/offline TS route; no Rust-WASM mandate or replacement consumer is created by this ticket.

## Non-negotiable boundaries and acceptance

No I/O/network/model dependency in pure Navigation. No automatic human-MOC adoption, deletion, cross-root authority, sensitivity lowering, or lineage winner by confidence. Exclude `.gkx/**` and exact `_archive/moc-runs/**` before Navigation/agent/provider context. Preserve exact archived before bytes and generated-region human bytes. Fail closed on corruption/conflicts; capability availability is not authority or safe startup.

Initial completion is **pure parity + accepted new-contract planning/assistance + dry-run recovery**, with real writes truthfully disabled. Activated-write completion additionally requires native transaction/recovery, lifecycle, soak, consumer and explicit activation evidence. The companion is not yet registry-admitted merely because PR #1 exists. This issue does not authorize bypassing M0, altering Standard locks, merging/releasing/publishing/deploying, or claiming conformance.

Return an exact-head implementation report with changed surfaces, executed commands (not invented Cargo targets), counts, fixture/receipt links, limitations and next gate. Use the full companion plan above for detailed adversarial cases.
