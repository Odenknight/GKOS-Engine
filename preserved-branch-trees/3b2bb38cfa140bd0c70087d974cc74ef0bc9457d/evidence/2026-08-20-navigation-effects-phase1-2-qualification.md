# Navigation Effects Phases 1–2 qualification

Date: 2026-08-20  
Standing: implementation evidence; not a release or GKOS conformance claim  
Branch: `feature/navigation-effects-contract-v1`  
Base commit: `2fbd4ec68ec825b09e5194c9878a7ae90a281392`  
Worktree commit: uncommitted pending the authorized integration sequence

## Scope

This report covers the GKOS-Engine Navigation Effects 1.0 contract,
deterministic MOC planner and generated-region merger, path/grant validation,
in-memory fault adapter, and optional Node filesystem executor. It does not
cover the Kosmos Obsidian coordinator, MCP write tools, agent credential UI,
watcher convergence, or a released Engine artifact.

Navigation 1.0 remains source-content read-only. The framework-neutral effects
entry point has a transitive import gate proving it cannot reach the Node
filesystem executor.

## Platforms exercised

| Platform | Runtime | Result |
| --- | --- | --- |
| Windows NT 10.0.26200.0 | Node 24.18.0, npm 11.16.0 | Passed |
| Debian WSL2, Linux 6.18.33.2 x86_64 | Verified official Node 22.23.2 Linux x64 archive | Passed |
| macOS | Node 22 CI leg added | Pending branch CI; no local result claimed |

The Linux qualification script downloads the current official Node 22 Linux
archive, verifies it against the official `SHASUMS256.txt`, copies the worktree
without dependencies or build output into a fresh `/tmp` directory, runs
`npm ci --ignore-scripts`, and executes the gates.

## Commands and results

Windows:

```text
JSON parsing                                      24 files passed
Draft 2020-12 schema meta-validation              13 schemas passed
Contract fixture validation                        9 fixtures passed
git diff --check                                   passed
npm run typecheck                                  passed
npm run test:navigation                           103 passed, 0 failed
npm test                                           303 passed, 1 expected external-fixture skip
npm run test:intelligence                            4 passed
npm run check:license                              passed
npm run check:nomenclature                         passed
npm run pack:check                                 passed; 200 files, 443710 bytes
```

Linux:

```text
bash scripts/qualify-navigation-effects-linux.sh <worktree>
official Node archive SHA-256                      passed
npm ci --ignore-scripts                            passed; 0 vulnerabilities reported
npm run typecheck                                  passed
npm run test:navigation                           103 passed, 0 failed
npm run pack:check                                 passed; 200 files, 443819 bytes
```

The small package-byte difference is generated package metadata across host
platforms; no deterministic candidate or plan byte mismatch was observed.

## Safety and recovery coverage

- Navigation 1.0 transitive filesystem-mutation gate remains passing.
- Framework-neutral Navigation Effects has its own transitive Node-filesystem
  exclusion gate.
- Identical planner inputs produce identical plans, plan digests, and proposed
  bytes.
- Region-managed replacement preserves human prefix/suffix bytes exactly,
  including CRLF.
- Unmanaged MOCs, malformed or moved markers, changed generated regions,
  expired authority, policy mismatch, stale adoption, and target-root mismatch
  fail closed.
- Absolute, drive, UNC, traversal, encoded traversal, NUL, reserved-device,
  trailing-dot/space, case/Unicode collision, symlink, and Windows junction
  cases fail closed.
- A last-moment external edit after the prepared temporary write wins; the
  executor marks the operation stale and never replaces it.
- Exact before/after images, aggregate manifest, byte diff, result, and receipt
  artifacts are produced under `_archive/moc-runs/**`.
- Journal entries are sequence- and predecessor-hash-bound and flushed before
  effects. Checkpoints bind back to the journal.
- A single-writer vault lease and deterministic target-lock ordering are
  enforced. Verifiably dead same-host leases and matching stale target locks are
  quarantined/removed with cleanup receipts.
- Real child processes were forcibly terminated at all eight transition
  boundaries on both Windows and Linux. Recovery preserved the before-image,
  completed verified effects, or required a safe retry as appropriate.
- Injected archive/disk-full, temporary-write/permission, replace, verify, and
  receipt failures retained recoverable intent and did not silently overwrite.
- Journal, checkpoint, receipt, and archive binding corruption block startup.
- Verified stale temporary files are removed only with a redacted cleanup
  receipt.
- Rollback is a separately authorized, preconditioned, archived effect.

## Recorded scale measurements

These are path/grant validation fixture measurements, not event-to-MOC
convergence claims and not service-level objectives.

| Fixture size | Windows Node 24 | Linux Node 22 |
| ---: | ---: | ---: |
| 100 | 3.063 ms | 3.377 ms |
| 2,000 | 12.384 ms | 18.447 ms |
| 10,000 | 46.882 ms | 45.124 ms |
| 50,000 | 191.346 ms | 173.520 ms |

## Known limitations and remaining gates

- macOS execution remains pending the added `macos-latest` Node 22 CI leg.
- File contents and journal records are flushed. Same-volume rename is used,
  but directory-entry fsync is not claimed. The executor reports this
  limitation at runtime, including the weaker Windows power-loss guarantee.
- Hard process termination is tested; physical power-cut durability is not
  claimed.
- The executor accepts UTF-8 Markdown and rejects a target whose bytes cannot
  round-trip as UTF-8.
- The host must revalidate authority, policy/configuration, expiry, and
  retention hold through the precondition provider under the target lock.
- Watchers, startup vault readiness, periodic reconciliation, Obsidian UI,
  MCP writes, quotas, secret storage, sensitivity enforcement, and 24-hour soak
  testing belong to the downstream Kosmos phases.
- Package identity remains 2.1.2 in this worktree. No 2.2 tag, artifact,
  publication, release, deployment, or conformance claim has been made.
