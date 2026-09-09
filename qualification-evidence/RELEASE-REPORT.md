## Package timeout repair checkpoint

New isolated PR49 head: bc1e6c35fa25c75a1e0dffc11771e85b61bcc70f, signed and pushed; worktree clean. Parent f7d80e6 exact runtime 34293967667 FAILED Windows24: packed MCP test exceeded180s, then outer30min expired. Other lanes passed. Exact F7 observation34294117971 and native audit34294120157 passed; do not transfer passes to BC1.

Repair: asynchronous abort-aware setup, one explicit build, phase diagnostics, safe npm JSON report parsing, ordered teardown. Four tests passed Windows24.18 (19.84s) and22.23.2 (14.18s); inventory and diff checks pass. Direct-child cancellation tested; descendant process-tree cancellation not proven. Original stalled phase remains unknown and failure retained.

BC1 exact observation34298117224 and audit34298118637 dispatched; push CI/runtime pending. No merge/tag/publication. EA release candidate and existing Linux soak untouched; last observed76 cycles RUNNING, not re-polled in this continuation. New-source artifact, native consumer matrix and24h soak remain required before adoption/release. Logs: package-test-cancellable-node24.log, package-test-cancellable-node22.log, runtime-f7d80e6-failure.log, exact-runtime-f7d80e6-attempt1-windows24.

Update 2026-09-09 00:17:29 UTC: isolated signed repairf7d80e6 is under review in
[PR49](https://github.com/Odenknight/GKOS-Engine/pull/49), targeting PR48's branch.
It halves measured native-read query latency on a static public fixture while
preserving exact results and security checks.87affectedtests pass on each
WindowsNode22/24; exact2.2observation34294117971 passes withp95206.551ms.
FullCI/nativeaudit remaininprogress; a newlypackedartifact andfreshsoaks remain
required before adoption/release. The earlierWindows534msfailure remains
unexplained. CurrentcandidateEA/Linuxsoak areunchanged (56cycles, running).
See native-read-repair-evidence.json and CONTINUE-RELEASE.md. No merge/tag/publication.
Update 2026-09-08 23:00:08 UTC: Linux soak remains running with18completecycles. Fresh Windows
Node22 packed consumer passes20smokes,4durableno-change and4pointer-refusal tests;
all595installedhashesverified. Supportedgkoshelpcommands passNode22/24. See
consumer-windows22-qualification.json. This advances item8; LinuxNode24 packed
consumer remains pending. Unsupportedrootgkos --help invocation and correction
are retained as a harness error. Candidate and all release blockers unchanged.
# Engine 2.2.0 release report — September 8, 22:26 UTC

Not released. The exact candidate is unchanged; Linux soak is running and
Windows soak latency remains an unresolved blocker. No tag or publication occurred.
The prior live report is archived as RELEASE-REPORT-before-20260908T2226Z.md.

1. **Commits:** starting main650eab4a6752227cae336d7556a57826c22a0d5a;
   current candidate ea055319a50d93e0f1b181e478731b437a152f17; released commit: none.
2. **PRs:** [PR48](https://github.com/Odenknight/GKOS-Engine/pull/48) remains draft/open
   at the candidate. PR47's exact diagnostic/documentation diff was reviewed and
   incorporated; its original PR remains open. No PR merged. Other reconciled
   Engine PRs remain as recorded in the starting-state evidence. Kosmos PR41 and
   its child35644f1 have no whole-history content conflict; required review and
   final integration remain pending. See KOSMOS-THREE-WAY-REVIEW.md.
3. **Commands:** all11 exact-source local release commands pass, with exit codes,
   command lines, timings, log hashes and zero tracked changes retained in
   gates-ea05531/commands.json: npmci, typecheck, build, test, test:navigation,
   test:intelligence, pack:check, check:license, check:nomenclature, audit,
   qualify:current. The receipt records Node24.18.0/npm11.16.0. Full history is
   retained. Additional commands/results are listed below; no prior-source
   pass is transferred to this candidate.
4. **Linux/Windows:** mandatory native Node22/24 runtime lanes pass exact push
   [34272999095](https://github.com/Odenknight/GKOS-Engine/actions/runs/34272999095).
   CI34272999039 passes. Node26 is informational. Native-audit34272999480 passes
   86tests per mandatory lane. Verified source and hashes are in
   runtime-ea05531-verified.json and native-audit-ea05531-verified.json.
5. **Observation:** separate2.2 lane passes exact push
   [34272999086](https://github.com/Odenknight/GKOS-Engine/actions/runs/34272999086).
   Fixed expected identities, 10,000-item real FTS5, batching/provider ledger,
   active local vectors, incremental reuse, rebuild convergence and deterministic
   results retain the strict500ms p95 gate. Exact2.1.2 historical replay remains
   separately named and its frozen material unchanged.
6. **Durability/recovery:** native process termination, commit-phase recovery,
   audit persistence and refusal tests pass. Four additional no-change cases
   pass on both installed artifacts. Four missing/corrupt pointer checks also
   pass on Windows/NTFS and Linux/ZFS, with exact refusal codes, no canonical
   promotion and unchanged immutable generations/source bytes. See
   DURABILITY-EA05531.md for command/evidence mapping and injected-vs-native limits.
   No physical power-loss qualification is claimed.
7. **24-hour soak:** NOT COMPLETE. Old v1 runs failed at revision10 due to the
   length-only vector fixture; those failures remain intact. The separately
   versioned onehot fixture fixes its relevance oracle. Windows corrected pilot
   then failed p95534.4491ms, with7/50 values above500ms; cause remains unresolved.
   A subsequent diagnostic passed1,000queries/20cycles/three planned restarts,
   maximum cyclep95339.0654ms. It does not erase the failed run. Fresh Linux
   qualification started2026-09-08T22:24:05.382Z, supervisorPID5575, output
   ~/gkos-engine-220-qualification/ea05531/soak-linux-24h-2. First cycle verified.
   Earliest completion2026-09-09T22:24:05.382Z. Windows24h is not running.
8. **Packed consumer compatibility:** current tarball passes20 native smoke
   checks on Windows24/Linux22, all10exports, CLI, stdioMCP, authenticated loopback,
   validation/graph/index/citation/refusal. Every595installed file hash and lock
   integrity match. Full additional consumer runtime/platform coverage remains
   pending; do not equate repository runtime tests with every consumer check.
9. **Tarball:** artifact-ea05531/gkos-engine-2.2.0.tgz; SHA-256
   f04705280acac74deab823683193a81a7c4dbf333791b33f6189226b709d593b;
   SHA-512 integrity
   sha512-nLcN76J69KYDBWY/N9eW44TMur2zWY/swopWgxDSnvreFf59SaBos+bx8UEvERfYRiQI+GJSDtW/D107fl3N6A==.
   npm12.0.2 produced it once from the built candidate. Inventory, inspection,
   SBOM and hashes are retained; release qualification remains pending.
10. **Tag signature:** v2.2.0 not created, pushed or verified. Signed source
    commits are not a substitute for final annotated tag signature verification.
11. **GitHub release:** no2.2.0 release URL exists. Latest listed release remains
    [v2.1.1](https://github.com/Odenknight/GKOS-Engine/releases/tag/v2.1.1).
12. **npm:** [gkos-engine](https://www.npmjs.com/package/gkos-engine) currently lists
    versions1.3.0/2.0.0/2.0.1 and latest2.0.1;2.2.0 absent. No2.2.0 provenance yet.
    Reconfirmed this follow-up; recheck again immediately before any publication.
13. **Installed registry verification:** not run for2.2.0 because unpublished.
    Local tarball tests are not registry artifact verification.
14. **Kosmos:** isolated35644f103771d1edf3634c160d381370bea883aa passes327tests,
    38desktop/mobileChromium checks and36Firefox/WebKit checks with the current
    exact local tarball. Offline file import/export, redirect refusal and
    credential/rendering flows are included. kosmos-ea05531-validation.json binds
    source/artifact/logs. Committed dependency/lock still use the development pin;
    final released npm pin and native full consumer matrix remain pending.
15. **Owner actions:** confirm package owner/maintainer identity; configure npm
    Trusted Publishing for Odenknight/GKOS-Engine, npm-release-2.2.yml,
    environment gkos-engine-release. Preserve2FA/publishing protection; protect
    v2.2.0 against update/deletion and require appropriate owner approval.
    Supply approved tag signers and the exact approval/evidence record only
    after all gates pass. No long-lived token fallback. Exact instructions:
    candidate docs/NPM-2.2-OWNER-ACTIONS.md. Local owner-account npmwhoami previouslyE401.
16. **External responses:** pending and nonblocking unless a concrete defect is
    identified. No independence, adoption, profile coverage, endorsement or
    consensus-standard claim is made. No peer message sent this follow-up.
17. **Remaining blockers/limits:** unexplained Windows latency failure; successful
    24hsoak on required hosts; complete consumer runtime/platform matrix;
    full filesystem/watcher end-to-end performance and repeated latest-candidate
    samples; final owner setup/review/merge/exact merged-head qualification,
    immutable tag, publication/provenance and registry verification. No thresholds
    weakened, frozen evidence edited or old passes relabeled.

## Additional qualification commands and evidence

- node qualify-pointer-gaps.mjs CONSUMER ARTIFACT OUTPUT:4/4PASS on both native
  hosts. First Windows harness run2PASS/2FAIL because it read message rather
  than structured error.code; original harness/results retained and corrected
  four exact-code cases rerun. DURABILITY-EA05531.md records details.
- npm run test:browser:chromium -- --workers=1:38PASS; npm run test:browser:full
  -- --workers=1:36PASS. Logs kosmos-ea05531-browser*.log.
- node performance-sample-ea05531.mjs TARBALL INVENTORY:4tiersPASS on both hosts,
  100/2,000/10,000/50,000notes. Full graph convergence, exact reparse0/1/50,
  durable MOC/no-op and recovery checks retained. Raw performance-{windows,linux}-ea05531.json.
  Single direct-library samples with one100-note MOC target are not filesystem
  end-to-end p95 or soak claims. Memory after the50k tier is about1.35GB on both
  hosts; no lower universal memory budget is inferred.
- node native-soak-profile-10m.mjs soak-profile-windows-10m.json:DIAGNOSTIC_PASS,
  1,000queries,20cycles; source-read and chronological CPU timing retained in
  soak-ea05531-windows-profile-10m-1. Earlier latency cause unresolved.
- node native-soak.mjs soak-qualification-ea05531-linux-2.json:RUNNING as above.
  Harness SHA-256ab503a60745ca575ca0430736bdf18420e8ecd31a6364e1fd08de35742d4e970.

## Separate OD-02 implementation

Signed isolated commit1733bc1e2fec4b3f661c65dd59502cfc63c4fd3f on
feature/documentation-digest-verifier-od02, based on main650eab4. Unmerged/local;
it does not change ea05531. Eleven tests pass on Windows24 and nativeLinux22;
lockfile install, typecheck, build, package/license/nomenclature and integrity
inventory checks pass. Signature verified. Exact-byte intact/tampered examples,
schema pins and test logs are in od02-evidence-1733bc1/evidence.json.
This is Engine repository tooling and JSON-schema-only validation, not standard
gate registration, a live RefusalReceipt or release/profile qualification.
Supersedes remains none. No standard changes, external submission or peer message.