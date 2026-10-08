## Summary

Engine 2.2.0 source candidate: deterministic managed-MOC batches, durable host coordination, ownership recovery, guarded transactions and optional review-only model assistance. Navigation 1.0 remains pure and read-only; the desktop/MCP service does not expose a source writer.

The README, beginner/technical guides, current capability inventory, version/profile notes and roadmap now distinguish implemented, configured, experimental and future work for a broad audience. Current MCP inventory is ten read-only tools: seven original Draft.2 tools plus three Observatory extensions. MCP initialization reports ENGINE_VERSION instead of stale 2.1.2 metadata. Documentation consistency and runtime regression checks are included.

## Validation

Latest candidate: `fe575cd7f2e5f841256551e73ffb1c09a242aa8d`.

- Local preflight: Navigation/Effects 160/160; service/runtime/content/retrieval 29/29; documentation consistency 3/3; typecheck, build, package contents, license, nomenclature and dependency audit pass.
- Full local Windows Node 24.18 suite: 1,074/1,074, zero failures/cancellations/skips. Python sidecar: 6/6. Final serial package check: 588 files / 6,668,653 bytes; dependency audit: zero vulnerabilities.
- All 56 automated checks passed; two explicitly manual observation jobs were skipped. CI run 34021336441 and historical/current-runtime run 34021336439 succeeded. All six downloaded current-runtime receipt/log bindings were verified against exact head fe575cd and tree d69273397c8e644680d585ee2a8da96fe28c7ea9: Ubuntu Node 22.23.2/24.20.0/26.8.1 each 1,084/1,084; Windows Node 22.23.2/24.19.0/26.8.1 each 1,074/1,074; no failed/cancelled/skipped/todo tests in these receipts. Node 26 remains informative.
- Prior `a4ed15d` baseline passed all six Ubuntu/Windows current-runtime lanes; downloaded receipt log hashes and matching tree are verified in `evidence/2026-09-06-moc-host-lifecycle-qualification.md`. These are baseline evidence, not new-head counts.
- Frozen historical contracts and Rust oracle remain unchanged. The only changed contract-pack path is the current-runtime source inventory.

## Scope and remaining gates

The owner explicitly requested validation and merge to main. This is approval to merge reviewed experimental source, not to tag, publish, deploy or activate owner-vault writes. Dedicated durable no-op audit receipts, end-to-end P95/parsing measurements, 24-hour soak, native power-loss/hostile-path guarantees and final Kosmos integration remain open and are visible in the roadmap.

No production conformance, live-model quality or Rust parity claim. The Node host retains cooperative-vault and directory-durability limitations.

Plans: `docs/moc-build-review-2026-09-05/`. API guide: `docs/DETERMINISTIC-MOC-ASSISTANCE.md`. Current inventory: `docs/CURRENT_CAPABILITIES.md`. Follow-up ownership: Engine #44, Odenknight/Kosmos-Oden#40, Odenknight/GKOS-Engine-Rust#2.
