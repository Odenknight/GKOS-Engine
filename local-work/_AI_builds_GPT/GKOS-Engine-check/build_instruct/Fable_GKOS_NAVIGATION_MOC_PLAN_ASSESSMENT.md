# Assessment: Navigation / ICM / MOC Lifecycle Plan Set

**Assessed:** 2026-08-15
**Inputs:** Four plan documents (01 Engine build plan, 02 downstream cascade plan, 03 Kosmos-Oden integration plan, 04 GKOS-standard implications plan), verified against the live repositories `Odenknight/GKOS-Engine`, `Odenknight/gkos-standard`, and `Odenknight/Kosmos-Oden` as of this date.

---

## 1. Verification of the plans against the live repositories

Before assessing impact, every checkable factual claim in the four plans was verified against freshly cloned copies of the repositories. The plans are accurate and current — every stated baseline matches the live HEAD exactly.

| Claim in plans | Live repository state | Result |
|---|---|---|
| Engine main at `ea7c3262a8dc...` | `git ls-remote` HEAD = `ea7c3262a8dcc939b1b0006a2678ae99c1a09e3c` | Match |
| Engine baseline v2.0.1 | `package.json` version `2.0.1`, CHANGELOG confirms 2.0.1 as latest | Match |
| gkos-standard main at `dbbbccef6571...` | HEAD = `dbbbccef6571137274e56c40f45a87dbdc6dc762` | Match |
| Standard at GKOS-2026-08-05 v0.78 | README: "Current release: GKOS-2026-08-05 v0.78" | Match |
| Kosmos-Oden main at `8147bda5da14...`, v0.7.0, pinned to Engine v2.0.1 | HEAD matches; `package.json` v0.7.0 with `"gkos-engine": "github:Odenknight/GKOS-Engine#v2.0.1"` | Match |
| `contentHash()` is a non-cryptographic change detector | `src/paths.ts:120` — "Fast non-cryptographic content hash for change detection (never for auth)" | Match |
| Origins authored/derived/proposed/approved | `src/types.ts` — `GkxOrigin = "authored" \| "derived" \| "proposed" \| "approved"` | Match |
| `GkxIndex.applyChanges()` exists as delta surface | `src/incremental.ts:63,125` | Match |
| Existing `gkx` CLI is read-only (validate/assess/graph/export) | `bin/gkx.mjs` confirms; no write commands | Match |
| No navigation/MOC code exists in Engine today | grep of `src/` finds none | Match |
| Viewer/Projection Profile wording | `conformance/provisional-requirements/Viewer-Projection-Profile.md` — quoted essentially verbatim in plan 04 | Match |
| Layer-1 re-entry rule | `standard/annexes/Layer_Interface_Contracts.md:15` — "Upper-layer results returning to the corpus MUST enter as new Layer-1 sources" — verbatim | Match |
| GCP-1..GCP-7 cumulative profiles | `standard/annexes/Conformance_Profiles.md` | Match |
| Kosmos-Oden treats manifest notes as galaxy centers | `src/renderer/cosmology.ts:19` — `MANIFEST_NAMES = ["index","home","readme","_index","moc","map","overview","dashboard","start","contents","toc"]` | Match (actual heuristic is broader than the plan states — see §5) |
| Standalone viewer promises read-only, no filesystem writes | Kosmos-Oden README, explicit and detailed | Match |
| `docs/proposals/` exists in the standard repo for GKOS-NAV-001 | Present (contains GKOS-DOCSTD-001, SRTP drafts) | Match |

This level of grounding is unusual and materially raises confidence: the plans were written against the actual current code, not an imagined version of it.

Two minor wording drifts were found, neither of which affects the design (detailed in §5).

## 2. Impact on GKOS-Engine — will this improve Engine functionality?

**Yes, substantially.** This is the largest capability addition since the GKX 2.0 rebrand, and it fills a real gap rather than duplicating anything that exists.

The Engine today is a validate/project/assess/graph/export pipeline. It can tell a consumer what the graph *is*, but it has no orientation capability: nothing answers "where should a human or agent go next in this workspace," and nothing manages the persistent navigation artifacts (MOCs) that Obsidian-style workspaces depend on. The consequence is visible in the ecosystem right now: Kosmos-Oden implements its own filename heuristic (`MANIFEST_NAMES` in `cosmology.ts`) to guess which note anchors a folder. That is precisely the kind of semantic fork the cascade plan (02) exists to eliminate — one Engine implementation, many adapters. The plan set converts an ad hoc consumer heuristic into an Engine-owned, tested, policy-driven contract.

The architectural fit is strong. The design's central rule — the Engine core emits deterministic **plans and artifacts** while a platform adapter owns all writes — is a direct extension of how the Engine already works: the intelligence sidecar is proposal-only, existing CLI surfaces are read-only, and `adapter.ts` already establishes the adapter pattern. Specific decisions that deserve credit:

- Reusing `GkxIndex.applyChanges()` deltas for incremental scope invalidation instead of inventing a second change-detection path.
- Explicitly refusing to reuse the fast `contentHash()` for archival integrity and requiring SHA-256 with archive-verify-before-replace. This anticipates a subtle corruption class most implementations discover the hard way.
- Stale-plan preconditions (`MOC_PLAN_STALE`), lock/lease semantics, and honest recording of actual platform atomicity rather than claiming transactionality everywhere.
- Byte-for-byte preservation of human-owned regions with fail-closed handling of malformed markers, plus adversarial fixtures for CRLF/BOM/injection cases.
- The archive-recursion protection (excluding `_archive/moc-runs/**` from live scans, but *not* all of `_archive/**`) closes the classic self-poisoning loop where generated artifacts re-enter the graph as knowledge.
- Semantic diff keyed to stable GKX identity, so renames report as moves rather than delete+add — this leverages the standard's "filename is not identity" principle for genuine functional benefit.

The additive-2.1.0 release posture is realistic given the current export map, and the explicit stop condition ("if a breaking machine contract becomes necessary, halt and open a versioning decision") is the right discipline.

**Risk profile.** The main risk is scope, not design. Plan 01 specifies roughly sixteen new modules, a transaction executor, seven-plus CLI subcommands, a Walk Test, System Map projection, context packs, and multi-format descriptors. The phase gates already sequence this well, but the v1 acceptance list (15 criteria) covers what is effectively three shippable features. The recommendation in §6 is to treat Phase 1 (read-only core) as the 2.1.0 release by itself and let the write executor, System Map, and context pack ship in subsequent minors. Nothing in the plan prevents this; making it explicit lowers the chance of a long-running unreleasable branch.

A second, smaller risk: run identity and timestamps are inherently nondeterministic, while candidate generation must be deterministic. The plan implicitly handles this by confining run IDs/timestamps to the manifest, but it should state outright that **candidate MOC bytes must contain no run-scoped values** (no run IDs, no generation timestamps in the rendered body), otherwise the `unchanged` outcome classification breaks and every run rewrites every MOC. The project's own earlier tooling (`process my thoughts v2 2.py` — "deterministic: no run timestamps in the body") learned this lesson already; it belongs in the normative text of the plan.

## 3. Impact on gkos-standard — will this improve the standard?

**Yes — and plan 04's central ruling is the most valuable document in the set.** Its conclusion that the standard does *not* need rewriting is correct on the evidence, and the restraint it codifies is itself an improvement:

- **MOC ≠ Layer-6 Context Manifest.** This is the single most important boundary defended. A Context Manifest is a purpose-bound receipt of exactly what was presented for one use; a MOC is a persistent, reusable, possibly human-edited navigation view. Conflating them would corrupt GCP-6's meaning. The plan's insistence on implementation names (`Navigation Projection`, `NavigationContextPack`, `MOC Run Manifest`) until a standards decision maps them is exactly right, and the negative fixture "MOC run manifest mislabeled as Layer-6 Context Manifest" makes the boundary testable.
- **The re-entry rule is applied, not evaded.** A generated MOC written back into the vault is an upper-layer result re-entering the corpus. Mode A (navigation-only materialization, excluded from evidentiary evaluation) and Mode B (explicit governed re-entry with derived origin, provenance, sensitivity) are a clean operationalization of the Layer Interface Contract that already exists. Mode-A-first is the safe default.
- **Evidence before normative text.** The STD-NAV-0→5 sequence (build first, informative proposal, independent second implementation, provisional schemas, then a profile decision) mirrors the standard's own ratified decision that independent implementation is a v1.0 gate. This is how the standard says it wants to evolve; the plan honors it.
- **No premature layer or relation changes.** Rejecting an eighth "Navigation Layer" and refusing to add `indexes`/`routes_to` relations before two implementations demonstrate stable semantics prevents speculative vocabulary from calcifying.

Where the work will *actively improve* the standard rather than merely leave it intact:

1. **The sensitivity/discoverability gap is real.** v0.78 governs restriction tightening and fail-closed sensitivity, but nothing currently addresses **metadata leakage through navigation artifacts** — a MOC leaking a confidential title, a folder name, the existence of a relationship, or a restricted item's history through the archive. Plan 04 §7's proposed principle ("a navigation projection MUST NOT reveal an object, identifier, title, path, relationship, warning, or historical entry to a recipient not authorized to discover it") is a genuine contribution that generalizes beyond MOCs to any index, search result, or graph view. This should be the centerpiece of the eventual GKOS-NAV-001 proposal.
2. **Adversarial fixtures.** The proposed negative fixtures (archive bytes differ from live digest, stale plan overwrites human edit, LLM proposal writes without review, semantic diff misclassifies stable-identity rename) are exactly the fixture style the standard repo already cultivates, and several are reusable beyond navigation.
3. **Implementation evidence for the Viewer/Projection Profile.** Read-only navigation surfaces exercise the provisional viewer profile in a second real context, which is what a provisional profile needs to mature.
4. **Origin granularity below file level.** The hybrid-MOC observation that one file can contain authored, derived, proposed, and approved material simultaneously is a real finding for future schema work — handled correctly for now (run/region metadata, no GKX frontmatter break).

## 4. Impact on the ecosystem (cascade and Kosmos-Oden)

The cascade plan (02) addresses the failure mode that kills multi-consumer contracts: semantic reimplementation drift. Its strongest elements are capability advertisement (a planner in the Engine must not silently become a write path in a viewer), the shared contract test pack as the price of claiming `moc_apply=true`, a Navigation contract version independent of package semver, and the READ→PLAN→REVIEW/APPROVE→APPLY authority ladder. The rule that read authority never implies write authority restates the standard's own agent-interface requirement, applied to a concrete API.

The Kosmos-Oden plan (03) is realistic about the hard operational problems: feedback-loop prevention (a MOC write triggering its own regeneration), Nextcloud sync interaction (the riskiest real-world area — concurrent sync mutation during an apply), archive sync/retention policy, and protection of hand-curated human MOCs (unmanaged by default, opt-in conversion to hybrid). Keeping the standalone viewer read-only — explicitly declining browser File System Access writes — preserves a documented security promise that the product currently advertises in detail.

Migrating galaxy-center selection from the local filename heuristic to Engine Navigation classification, with the legacy heuristic retained as fallback, is the correct convergence path and a concrete near-term user-visible benefit: visual cosmos, human navigation, and agent API navigation will share one interpretation of "what is this folder's map."

## 5. Defects and gaps found

Nothing found rises above minor; all are fixable in the plan text.

1. **GKX version wording.** Plan 01 repeatedly says "GKX 2.0 schema"; the Engine README and `src/gkx23.ts` describe GKX **2.3** dialect support. The intent (don't break the GKX machine namespace introduced at Engine 2.0) is clear, but the plan should name the actual current schema line to avoid a future implementer "protecting" the wrong contract.
2. **Kosmos-Oden manifest heuristic understated.** Plan 03 §2 says the plugin recognizes `index`, `README`, `MOC`, or the folder's own name; the actual list is eleven names including `home`, `_index`, `map`, `overview`, `dashboard`, `start`, `contents`, `toc`. Harmless for design, but the Engine's `NavigationPolicy.mocNames` default and the compatibility fallback should be seeded from the real list, or vaults will see galaxy centers change when Navigation is enabled.
3. **Determinism vs. run-scoped values** should be stated normatively (see §2): candidate bytes must exclude run IDs and generation timestamps or `unchanged` detection breaks.
4. **Walk Test underspecified.** It appears in the mission (§1), the ICM concepts (§4), and the test plan ("Walk Test scoring/checks") but no section defines what it measures or how it's scored. Either specify it in Phase 0/1 docs or explicitly defer it to a later phase.
5. **Archive retention vs. governed erasure.** Plan 03 adds retention settings and plan 04 notes retention "may be policy-bound," but neither ties archive deletion to the standard's existing governed-erasure/legal-hold semantics (`Security_Privacy_Retention.md`). Since archives are historical evidence of navigation state, their deletion should at minimum be auditable and respect any hold semantics a deployment applies.
6. **Contract fixture pack needs a declared home.** Plan 02 requires every write-capable consumer to pass a shared fixture set but doesn't say where it lives or how it versions. Publishing it inside the Engine repo (versioned with the Navigation contract) is the obvious answer and worth stating, since drift between fixture pack and contract version would undermine the conformance claim.
7. **UUIDv7 assumption.** Plan 01 says run IDs "should be UUIDv7 where the ecosystem already uses UUIDv7 for new governed identities" — existing project examples show UUIDv4-style UIDs. Not a problem (run identity is new), but drop the "already uses" justification and just mandate UUIDv7 for run IDs.

Internal consistency across the four documents is otherwise excellent: version targets (Engine 2.1.0, Navigation contract 1), archive layout, reason-coded semantic diffs, proposal-only LLM boundary, and sensitivity rules are stated identically everywhere they appear.

## 6. Verdict and recommendations

**Impact:** High, and well-contained. This is the most significant Engine capability expansion since GKX 2.0, executed as an additive minor with explicit stop conditions.

**Does it improve GKOS-Engine functionality?** Yes. It adds a genuinely missing capability (orientation, governed navigation artifacts, auditable MOC lifecycle, context packs), reuses the Engine's existing primitives rather than duplicating them, and converts a live consumer heuristic fork into an Engine-owned contract.

**Does it improve gkos-standard?** Yes, in the correct way: not by rewriting it, but by (a) demonstrating that the existing seven-layer model, re-entry rule, origin vocabulary, and restriction-tightening rules absorb a substantial new capability without strain — which is itself evidence of the standard's soundness — and (b) surfacing one real gap (metadata leakage through navigation/index artifacts) plus a fixture-backed informative proposal path to close it. Plan 04's refusal to prematurely mint a Layer-6 label, an eighth layer, or new GKX relations protects the standard's integrity.

Recommended execution adjustments, in priority order: ship Phase 1 (read-only Navigation core) alone as 2.1.0 and let the write executor be 2.2.0, keeping each release reviewable; add the "no run-scoped values in candidate bytes" rule to the normative plan text; seed the default MOC name policy from Kosmos-Oden's real `MANIFEST_NAMES` list; fix the GKX 2.0→2.3 wording; declare the contract fixture pack's home and versioning in plan 02; and define or explicitly defer the Walk Test. With those adjustments, the plan set is ready to hand to an implementation agent — and notably, plan 01 §31's implementation-discipline section already anticipates the ways such an agent typically goes wrong.
