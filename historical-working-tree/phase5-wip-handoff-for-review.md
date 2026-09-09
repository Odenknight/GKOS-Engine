# GKOS functional uplift — Phase 5 WIP handoff

Status date: 2026-08-24 (America/New_York). This is a work-in-progress handoff,
not completion or publication evidence.

## Coordinates and completed boundary

- Full is on `codex/phase-5-watcher-recovery` at the signed+DCO Slice-A evidence
  base `6e9346c7e749b5288ff3680766b34a038e816d18`. Slice B is an authorized,
  uncommitted exact 46-path worktree. Its pre-handoff content-manifest digest is
  `sha256:590f6d8deb183e008c65476cce4eb421dbc3c303d532d8d94cdb82cce6a0a68f`.
  This review copy is held outside Full at
  `[LOCAL_PATH]
  Its intended later repository path is
  `evidence/2026-08-24-functional-uplift-phase-5-wip-handoff.md`, but adding it
  before the code freeze is committed would create a forty-seventh path and
  correctly fail the exact-inventory gate.
- Full Phase 4 qualified base is
  `98f4faf227320852006f5e1e9e01eb41f5fdff7b`. Phases 0–4 are complete and
  Phase 5 Slice A is complete; Phase 5 as a whole is not complete.
- Lite's last terminally verified hosted/remote Phase 5 Slice-A state is branch
  `codex/phase-5-watcher-recovery`, implementation
  `0bce4db2ed4dfd7b6ae825cb624637470a9c7ed4`, and evidence/head
  `9dafbec38d95d9a4daad7901a023e681a8778b31`. Draft PR #20 is reported
  OPEN/CLEAN/MERGEABLE and unmerged; hosted run `32651791727` passed 8/8 with
  exact-zero artifacts. Its pack is still the older Full Slice-A pack at
  `sha256:c08520c1392d6be04c71159050c0d60f5bf03afeeb915ae44920e758e35cb49a`
  and must be repinned after Full Slice B.
- Lite's qualified Phase 4 base is
  `d1c0d5d60e5380d4c1cb9fb1562585852307e657`. The authoritative local Lite
  checkout is
  `[LOCAL_PATH] clean on
  `codex/phase-5-watcher-recovery` at
  `9dafbec38d95d9a4daad7901a023e681a8778b31`. A different checkout at
  `[LOCAL_PATH] was observed stale
  at `41912fd` on `codex/phase-3-ingest-validation`; it is non-authoritative,
  was not changed, and is not evidence for the hosted coordinates above.

## Remaining work

- Phase 5 Slice B: preserve the exact implementation freeze, obtain Lite's
  reciprocal read-only approval, then create signed+DCO Full implementation and
  later evidence/docs commits. The implementation commit must contain exactly
  the reviewed 46 paths and must be tested while this handoff remains outside
  Full. Only after approval may the existing branch/PR be pushed;
  hosted Linux Node 22/23/24, forced Windows alias/8.3, artifact, and clean-tree
  lanes must finish terminally before Phase 5 can close. Lite must then repin and
  independently qualify the final Full pack.

### Phase 6–11 action boundary

The controlling 2026-08-20 Functional Uplift Build Instructions were supplied
in the active owner thread/session (recovered user line 9, 1,615 lines). They are
not stored as a repository file, and no SHA-256 is available. The
provider-neutral clarification is user line 272 in that same session. Therefore,
before any Phase 6 byte is written, root must export and pin the exact packet and
the table below into a governed repository artifact, or the owner must explicitly
re-ratify that exact packet/table. Without one of those actions, stop after Phase
5. This handoff is a planning extraction, not a replacement authority.

| Phase | Objective | Entry dependency | Completion gate | Evidence/publication boundary | Explicit owner approval |
| --- | --- | --- | --- | --- | --- |
| 6 | Identity + MCP | Phase 5 terminal in Full and Lite; controlling packet exported/pinned or exactly re-ratified | Frozen identity/MCP contracts, provider-neutral implementation, negative/security cases, full and reciprocal cross-runtime qualification | Signed+DCO implementation/evidence coordinates and reciprocal review; no main merge, tag, release, deploy, or publish | Required before Phase 6 bytes and again before any external publication |
| 7 | Graph | Qualified Phase 6 | Graph storage/tools, migrations, deterministic projection, recovery, and protected-contract gates pass in both repos | Phase-local signed evidence and reciprocal review only; graph authority must not be back-claimed by Phase 5 | Required before Phase 7 bytes and before advancing |
| 8 | UI | Qualified Phase 7 | UI exercises only qualified engine capabilities; functional, security, deterministic-state, and cross-platform UI gates pass | Phase-local signed evidence and reciprocal review; no distribution or release | Required before Phase 8 bytes and before advancing |
| 9 | Static packaging | Qualified Phase 8 | Static/archive composition, clean-machine behavior, complete transitive link/load inspection, standalone watcher, and approved older-CPU qualification pass | Signed packaging/CPU evidence; no tag, package publication, release, or deployment yet | Required before Phase 9 bytes and before any packaging publication |
| 10 | Docs | Qualified Phase 9 | User/developer docs, examples, claims, license/nomenclature, metadata, and reproducible commands match qualified behavior | Docs/evidence commits remain phase-local; no unsupported compatibility or release claim | Required before Phase 10 bytes and before advancing |
| 11 | Integration + handoff | Qualified Phase 10 and terminal evidence for both repos | End-to-end Full/Lite integration, protected histories, signatures/DCO, CI/artifacts, clean trees, and final handoff inventory all pass | Only the owner may authorize final main merges, version/tag, release, deploy, or publication after terminal evidence | Required before Phase 11 bytes and separately for every final external action |

## Reproducible gate commands

Keep this handoff outside Full and run from the Full repository root:

```text
npm run typecheck
npm run build
node --test test/watcher-recovery-contracts.test.mjs test/watcher-coordinator.test.mjs test/watcher-index-validation.test.mjs test/watcher-journal-host.test.mjs test/watcher-observation-qualification.test.mjs test/watcher-pointer-host.test.mjs test/watcher-service-cli.test.mjs test/watcher-source-scan.test.mjs
npm test
npm run test:navigation
npm run test:intelligence
npm run check:license
npm run check:nomenclature
npm run pack:check
git diff --check
git status --short
git diff --cached --exit-code
```

For the local Windows cross-runtime watcher gate, substitute the first word of
the focused command with `npx --yes node@22.23.0` and then
`npx --yes node@23.11.1`; the ordinary `node` command is Node 24.18.0. Before
commit, `git status --porcelain=v1 -z` must contain exactly the reviewed 46
entries and no staged entry. Stage only those reviewed paths, create one
ED25519-signed+DCO implementation commit, and verify its direct diff from
`6e9346c7e749b5288ff3680766b34a038e816d18` is the same exact inventory.

Only after that implementation commit and its exact-scope tests are complete may
this document be copied to its intended `evidence/` path and considered for a
separate docs/evidence commit. The current protected test intentionally treats
the source head as the exact 46-path implementation, so do not add or push the
later document until its source-head/CI handling is separately reviewed and
ratified. A docs commit must never be used to weaken or broaden the 46-path
implementation inventory.

The manifest digest above uses this literal preimage: preserve the NUL-delimited
entry order emitted by `git status --porcelain=v1 -z`; for each no-rename entry,
emit `XY<TAB>path<TAB>decimal_raw_byte_length<TAB>lowercase_raw_sha256`; join
rows with LF and append one terminal LF; hash those UTF-8 bytes without a BOM
using SHA-256. `XY` is the exact two-character porcelain status, including its
space. This external handoff path is excluded by exact path equality.

The 2026-08-24 local Windows results before this documentation-only path were:
Node 22.23.0 focused watcher 182/182; Node 23.11.1 focused watcher 182/182;
Node 24.18.0 focused watcher 182/182 and full suite 761/761; typecheck/build,
Navigation 44/44, intelligence 4/4, Apache-2.0, nomenclature, package contents
(382 files, 2,948,133 bytes), generator-byte reproducibility, Phase 0–4
protected inputs, and exact Slice-B inventory PASS. The resealed watcher pack is
18 files / 8,906,738 governed bytes /
`sha256:faa71240c64f64b4329d64a36ea774e8b95a738594a444f87b5f35ad3cb5e39b`.
Hosted Linux and forced-Windows artifact gates remain pending until reciprocal
approval permits publication.

## Findings carried forward

- A prior Phase 4 qualifier rejected an authorized watcher leaf; the solution
  was an exact protected-inventory correction, never a broad waiver. Linux
  index-only drift was covered by checking `git diff --cached` as well as the
  ordinary worktree.
- Slice B now proves a reset HostLock owner dead before partial Plan/Bridge
  cleanup, with live-owner A/B cases proving zero mutation.
- The scanner uses one exact-five rejection projection. Fatal UTF-8 remains
  unstable; deterministic oversize rejection publishes the exact N-1 topology.
- Observation qualification requires child stderr to be exactly empty. An
  apparent four-test failure during takeover was solely the managed sandbox
  denying esbuild access to the Full checkout; the identical permission-correct
  run passed 182/182.
- Windows Node 23.11.1 reports the `lstat` device as zero while `fstat` on the
  same inode reports the real device. The archive audit now uses the repository's
  existing Windows zero-device equivalence while continuing to bind inode, mode,
  link count, size, and timestamps; the isolated 2/2 and full 182/182 Node 23
  reruns passed.

## No-merge boundary

Do not copy this handoff into Full, commit, or push Full Slice B until Lite
approves the exact freeze. Do not merge, tag, release, deploy, package-publish,
or push `main` from this handoff.
