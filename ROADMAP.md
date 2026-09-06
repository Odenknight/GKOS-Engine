# GKOS-Engine roadmap

Updated 2026-09-06 for the 2.2.0 source line. This is a delivery roadmap, not a release announcement or a promise of dates. See [current capabilities](docs/CURRENT_CAPABILITIES.md) for what the code can do today.

The goal is dependable, local knowledge tooling with one deterministic interpretation of structured notes. Models are optional. Permission to change a note is separate from generating a suggestion.

## Available foundations

- Parse and validate GKX records; build canonical graphs, lineage and time-based views; export Graphiti episodes.
- Index derived state, search with verified citations and maintain coherent graph/retrieval generations through the watcher host.
- Inspect navigation pages through read-only Navigation 1.0.
- Serve credential-filtered local REST/MCP reads and traversal events, including note-reading, path-resolution and retrieval extensions.
- Evaluate bounded admission policies, verify receipts and validate intelligence proposals without granting approval authority.

## Implemented in the 2.2.0 source line

- Separately versioned, opt-in Effects planning and a cooperative-vault Node transaction executor.
- Deterministic managed-MOC batches, generated-region preservation, before-image archives, receipts, rollback and recovery.
- Durable event coordination, startup/passive reconciliation, ownership advancement recovery and an explicit Node host/runtime.
- Model-free tag/link/MOC proposals and bounded optional LLM assistance, off by default and review-only.
- Synthetic host examples, purity/security/recovery tests and cross-platform CI. These do not complete the remaining qualification gates.

## Next: finish 2.2 qualification

| Work | Why it matters | Completion evidence |
| --- | --- | --- |
| Dedicated durable no-op audit receipts | Explain unchanged MOC runs without rewriting source | Bounded idempotent records, replay/corruption tests, no false write claims |
| End-to-end performance and incremental parsing | Measure actual edits, not only planner speed | Raw samples, parsing counts, queue/memory/handle data at 100, 2,000, 10,000 and 50,000 notes |
| 24-hour watcher/reconciliation soak | Find loops, missed work, leaks and journal growth | Reproducible synthetic workload, restart evidence and bounded resources |
| Native durability qualification | State what each filesystem/OS guarantees | File/directory flush and replace evidence, failure matrices, unsupported cases |
| Exact-artifact consumer qualification | Avoid treating a branch name as compatibility evidence | Reviewed immutable artifact, integrity value and consumer fixtures |

Proposed targets: P95 below 2 seconds for a single ordinary edit in a 2,000-note vault and below 5 seconds for a 50-note burst. These remain targets until the full path is measured. Process-kill tests are not physical power-loss tests.

Track Engine work in [issue #44](https://github.com/Odenknight/GKOS-Engine/issues/44) and settings wiring in [issue #36](https://github.com/Odenknight/GKOS-Engine/issues/36). Merging experimental source and publishing a supported release are separate decisions.

## Consumer work: Kosmos-Oden

Kosmos has existing Effects settings, adoption and adapter foundations. Extend them rather than recreate Engine semantics:

1. Durable Obsidian/native adapter and recovery wiring, reviewed adoption and independent status gates.
2. Event/index coordination, missed-event reconciliation, shutdown handling and recovery/audit UI.
3. Optional provider configuration and reviewed proposal presentation, filtering before data leaves the host.
4. Distinct agent credentials and user-selected roots, defaulting to `_kosmos/agent-notes/<agent-slug>/`; bounded create/update/append and expressly granted archive tools with compare-and-swap conflicts.
5. Platform/browser/security/soak acceptance and an exact released Engine pin.

These are **not enabled Engine MCP write tools today**. Deletion, cross-agent writes and direct agent MOC writes remain denied by default. Follow the [Kosmos handoff](https://github.com/Odenknight/Kosmos-Oden/issues/40); no Kosmos product version, release or owner-vault activation is inferred here.

## Rust and interoperability

The [Rust handoff](https://github.com/Odenknight/GKOS-Engine-Rust/issues/2) follows its accepted 3.0/M0-M7 program. Preserve its frozen TypeScript oracle. Post-oracle Effects/assistance fixtures belong to a separately accepted new-contract lane. Begin with pure parity and synthetic/dry-run effects before gated native execution. No Rust parity, browser-WASM replacement or Lite write authority is claimed here.

## Later improvements

- Diverse, reviewed assistance evaluations with accepted/rejected suggestions, erroneous-link measurements and explicit call/cost limits.
- Cross-language and installed-service interoperability evidence.
- Signed checksums, software bills of materials and platform-appropriate signing/notarization where approved.
- Additional host adapters with stronger demonstrated filesystem guarantees.

## Boundaries that do not change

No mandatory model, Python service or network; no self-approval, sensitivity lowering, arbitrary source writes or guessed lineage winners. Navigation stays pure. Product-specific UI stays downstream. Normative changes and conformance claims require separate Standard review; experimental application extensions do not amend the standard. Tags, publication, deployment and real-vault enablement retain explicit authorization gates.
