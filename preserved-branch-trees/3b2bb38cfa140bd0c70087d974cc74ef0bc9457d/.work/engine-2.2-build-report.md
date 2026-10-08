# GKOS-Engine 2.2.0 build report

Date: 2026-09-06. Standing: development candidate, not a published release.

## Delivered

TypeScript implementation commit:
`a4ed15d8de20222919f2aad43cbbea83f01d219e` on
`feature/engine-2.2-managed-mocs`, based on main
`d81f9d1351f1a9228650a840629191a92f2dfb22`.

[Engine implementation and plans — PR #43](https://github.com/Odenknight/GKOS-Engine/pull/43)

[Rust companion plans — PR #1](https://github.com/Odenknight/GKOS-Engine-Rust/pull/1)
contains documentation commit `20a85e940d1975f6904a1abe0e1ed7ebe856d2f6`,
targeting `integration/m0`. Rust runtime code was not built or reversioned;
its accepted 3.0/M0–M7 roadmap and fixed TS oracle remain unchanged.

## What the TypeScript build does

The package/runtime identity is now 2.2.0. Navigation 1.0 remains pure and
source-content read-only. The separate opt-in Effects plane now has a
deterministic managed-MOC batch planner, host-driven durable coordinator, and
Node watcher/runtime composition. It reuses the existing guarded transaction,
archive, journal, receipt, rollback and startup-recovery primitives.

The coordinator coalesces events, defaults to 750 ms debounce with a 3-second
maximum delay, retains events arriving during work, and turns overflow into a
durable full-reconciliation request. Startup reconciles before readiness;
periodic/manual reconciliation catches missed events. The host maintains
checksummed ownership state and repairs a crash between an effect commit and
ownership advancement. Existing human regions are preserved; external edits,
ambiguous ownership and corrupt recovery state block automatic application.

Deterministic assistance extracts explicit tags and unambiguous links and
renders tag-grouped MOC proposals. Optional LLM assistance is disabled by
default, requires separate data-egress approval, and returns bounded structured
proposals for review. Provider failure leaves the deterministic result intact.
The model does not receive write authority or automatically alter source tags,
links, lineage, sensitivity or MOC ownership. No live-model quality claim is made.

The 2.2 upgrade explicitly accepts unchanged qualified 2.1.2 retrieval producer
records. Historical evaluation projections can be restored only after complete
binding verification into unactivated immutable evaluation databases. Ordinary
generation still emits 2.2.0. Original fixture bytes are preserved, with separate
explicit expectations for new-version physical generation/result digests.

## Verification

Local platform: Windows, Node 24.18.0. Full-suite and hosted results below
refer to `03f4328d117e9cdd8507dd04e31353f1b951c2ee`, before the narrowly scoped
watch-root repair `a4ed15d8de20222919f2aad43cbbea83f01d219e`. The repair passes
local build, typecheck and the complete 156/156 Navigation/Effects suite
(including all seven host tests); its hosted checks are running.

- Typecheck and build: pass.
- Navigation/Effects suite: 156/156 pass.
- Complete retrieval evaluation CLI and provenance suites: 41/41 pass,
  including exhaustive tuning and exact replay.
- Focused upgrade/assistance suite: 20/20 pass.
- Python sidecar: 6/6 pass.
- License and nomenclature checks: pass.
- Package check: 588 files, 6,665,174 bytes.
- Dependency audit: zero reported vulnerabilities.
- Isolated full current suite at `03f4328`: 1,067/1,067 pass,
  zero failures, cancellations or skips (Windows, Node 24.18.0).
- Hosted CI workflow: PASS, including Node 22/24/26 build lanes, Linux/Windows
  watcher lanes, Windows path-security lanes and watcher artifact audit. The
  explicitly manual observation job was not requested and remained skipped.
- Historical replay: 9/9 hosted jobs pass.
- Ubuntu current-runtime receipts: 1,077/1,077 pass on Node 22.23.2, 24.20.0
  and 26.8.1; zero failures or skips. Node 26 is the informative lane.
- Windows Node 22/26: 1,067/1,067 pass. Windows Node 24.19: native libuv watcher
  abort, 1,065 reported / 1,064 pass / 1 fail. Qualification is not complete.
  A follow-up canonical-watch-root repair passes build and seven local host
  tests; hosted validation remains required. See repository evidence history.

Commands include `npm run typecheck`, `npm run test:navigation`,
`node --test test/retrieval-evaluation-cli.test.mjs test/retrieval-provenance.test.mjs`,
`npm run test:intelligence`, `npm run pack:check`, `npm audit --json`, and `npm test`.

Earlier failures remain documented in the repository evidence report and PR
history. A package dry-run unexpectedly invoked a rebuild during one local
diagnostic; that run is not claimed as isolated qualification. Packaging was
completed before the new isolated full run.

Earlier planning smoke samples covered 100, 2,000, 10,000 and 50,000 notes with
one target scope. They are not end-to-end P95 convergence, memory-ceiling or
24-hour soak evidence.

Evidence coordinates:

- [Completed CI workflow](https://github.com/Odenknight/GKOS-Engine/actions/runs/34014878652).
- [Historical/current qualification workflow](https://github.com/Odenknight/GKOS-Engine/actions/runs/34014878641).
- PR qualification source: merge commit
  `8224095d50ec0787137b46d32a2de5076a5b6ff4`; its tree
  `2e9c555895919b6c6eeadadfaa091e01178b97f6` exactly matches the implementation
  commit's tree. Receipts explicitly retain `release_qualified: false`.
- Current source-inventory digest:
  `e29f945f9e86a2973be078b47c4151ce3d395c333f3e3c9b202f741f34b66c13`.
- Local isolated test log SHA-256:
  `32b3bad8ef2322da37dcb7059b913b0e42343d5a67038b82a886fcdbcb12b53f`.

## Trying the candidate

In the development worktree, after tests have finished:

```powershell
Set-Location C:\Users\FAC\Documents\_AI_builds_GPT\GKOS-Engine-check\.work\engine-2.2
npm run example:moc
```

This creates a new synthetic temporary vault, generates its managed MOC and
retains its evidence. It does not enable writes in an owner vault. The example
authority stub is not a production identity registry.

Integrators use `gkos-engine/navigation-effects` for pure planning/assistance
and `gkos-engine/navigation-effects/node` for the explicit Node host/runtime.
The host requires a validated current snapshot/index and live authority,
configuration, sensitivity and retention checks. It is not a replacement for
the Kosmos Obsidian adapter, settings/adoption UI, secrets or incremental index.

## Remaining gates and boundaries

No merge, tag, release, deployment, owner-vault activation, or new GKOS
conformance claim is made. The Node adapter retains its cooperative-vault
threat model and does not claim directory-entry durability across power loss.

Remaining acceptance includes final Windows hosted receipts, measured end-to-end
convergence and parsing counts, the 24-hour soak, native durability qualification
for each claimed platform, and downstream Kosmos integration using an authorized
immutable released artifact. Optional live-provider quality evaluation is
separate from offline deterministic operation. Multi-agent credential/UI/tool
delivery and Rust runtime parity remain separate tracks.

The GitHub pull requests remain drafts until their applicable gates are met.
