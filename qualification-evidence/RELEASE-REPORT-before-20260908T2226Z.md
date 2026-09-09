
## September 8, 21:14 UTC — diagnostic complete; latency cause remains unresolved

Profiler session55084 completed PILOT_PASS11cycles, 550queries, all3planned restarts and receipt convergence. Highest per-cycle p95: 315.188399999999 ms. See soak-latency-diagnosis-ea05531.json and soak-ea05531-windows-profile-1. Native secure reader invoked128times per query, timed separately; no checks removed and no production change. This follow-up does NOT cancel the prior534.4491ms qualification failure. No real24hsoak currently running; source ea05531 remains clean. Do not relabel failed qualification or start publication. Next: capture sustained native host/query timing with bounded chronological stage/resource samples and reproduce tail cause before a narrowly justified code/environment correction. Do not disable security scanning or alter500ms gate to force a pass.

## September 8, 21:12 UTC — prior soak status superseded; Windows latency blocks release

Candidate remains ea055319a50d93e0f1b181e478731b437a152f17. Exact CI34272999039/runtime34272999095/observation34272999086/nativeaudit34272999480 PASS. All11 local Windows commands PASS20:54:17Z, verified runtime-ea05531-verified.json. Kosmos35644f1 npmtest327PASS against current f047 artifact; latest browser rerun remains pending.

Both original REAL24h runs FAILED at cycle14/revision10 around20:49UTC. No real24h soak is running. Preserve both failed directories. Length-based fixture vectors did not encode topic relevance; query lexical hit still existed at rank2. Archived original harness and read-only ranking diagnostic. Separately versioned onehot128/2 fixture independently checks topic relevance across digit boundaries; startsrevision8. See SOAK-VECTOR-FIXTURE-V2.md.

Linux revised50-sample pilot PASSED12cycles/restarts; Windows revised50-sample pilot FAILED cycle8 p95534.4491ms against unchanged strict500ms. Seven of50 values exceed500ms; do not dismiss as single outlier or claim qualification. Raw query-samples-00008.json preserved. Five-sample prior pilot failure also retained; SOAK-SAMPLE-COUNT-CORRECTION.md documents use of established50sample nearest-rank measurement. Current native-soak.mjs SHAab503a60745ca575ca0430736bdf18420e8ecd31a6364e1fd08de35742d4e970.

Separate diagnostic session55084 is running native-soak-profile.mjs with soak-profile-windows.json, output soak-ea05531-windows-profile-1. It wraps the real secure reader with per-query time/call counters, retains all thresholds and does not modify source/artifact/failed runs. Initial2cycles average235-237ms, secure128reads163-165ms. Await complete profile; no root cause for tail established yet. Do not launch real24h until unresolved latency failure diagnosed/remediated and pilots pass.

Isolated OD02 worktree GKOS-Engine-documentation-verifier branch feature/documentation-digest-verifier-od02 exists at main650eab4. No implementation yet. Scope is owner-approved exact-byte documentation verifier and pinned v0.81 receipt-schema validation; no changes to current qualified candidate or standard. Delegating thread01a081fc-c8f8-7a42-95a0-4284fad8666f. Details in owner OD02 mailbox decision and annex; preserve Supersedes:none. Do not confuse NO_ELIGIBLE_RESULTS with a refusal receipt.

No merge/tag/publication. Remaining mandatory native/performance/24h/consumer/ownerOIDC gates stay open. Original dirty checkout untouched.
# GKOS-Engine 2.2.0 — interim release report

## September 8, 20:25 UTC — graph repair ea05531; REAL 24h soaks running

CURRENT SOURCE: ea055319a50d93e0f1b181e478731b437a152f17, clean NEXT worktree, signed commit pushed to draft PR48. No merge/tag/publication. Previous aa2e10d full native matrix and local gates completedPASS19:45:43Z, but subsequent pilot exposed graph convergence defect. Preserve prior passes as prior-source evidence only.

Defect: representative-record Map reinsertion changed containment-link array order; separate wikilink regression proved generated IDs also drift with traversal. Fixed private GkxIndex assembly to sort records by canonical source-path keys. New test compares full ordered nodes/links including IDs across repeated edits and reverse-input clean rebuilds; no normalization of failing output. Beforefixfails, afterfix69testsPASS plus typecheck/build. docs/GRAPH-CONVERGENCE-REMEDIATION-20260908.md. Failed pilots and graph-convergence diagnostics retained. Exact original firstpilot harness reconstructed and SHAchecked b68756a0...; archives native-soak-aa2e10d-pilot-1-original.mjs, native-soak-aa2e10d-pilot.mjs and native-soak-ea05531-pilot-1.mjs.

CURRENT LIVE JOBS — DO NOT DUPLICATE:
- Windows full command runner session37109, gates-ea05531/commands.json, ci/typecheck/buildPASS; full suite/remainingcommands running. Prior session61185 closedPASS.
- Push runtime34272999095: Linux22/24PASS (26informationalPASS), mandatoryWindows22/24stillrunning at20:25. Push CI34272999039 lastinprogress. PRsyntheticmerge receipts notsubstitutes.
- Push observation34272999086PASS, downloaded exact-observation-ea05531. Nativeaudit34272999480PASS86tests each4nativeplatform/runtime lanes; exact-native-audit-ea05531 downloaded/sourcechecked, native-audit-ea05531-verified.json.

CURRENT ARTIFACT: artifact-ea05531/gkos-engine-2.2.0.tgz; SHA256f04705280acac74deab823683193a81a7c4dbf333791b33f6189226b709d593b; integrity sha512-nLcN76J69KYDBWY/N9eW44TMur2zWY/swopWgxDSnvreFf59SaBos+bx8UEvERfYRiQI+GJSDtW/D107fl3N6A==. Packed once using npm12.0.2 --ignore-scripts after exactclean install/typecheck/build; no packaging lifecycle rebuild alongside tests. InspectionPASS595files/63563396bytes; SBOMgenerated. Nativeconsumer20smokes +4explicitno-changeauditchecks PASS onboth Windows24.18 and Linux22.23.2. All595installed filehashes and lockintegrity match. Receipts in artifact-ea05531. NewWindowsconsumer ../gkos-engine-220-consumer-ea05531-windows; Linux ~/gkos-engine-220-qualification/ea05531/consumer. Do not alter installed package bytes while soaks use them.

REAL 24-HOUR SOAKS:
- Windows: session74310, output ../GKOS-Engine-release-220-evidence/soak-ea05531-windows-24h-1. Started2026-09-08T20:20:44.935Z; earliestfinish2026-09-09T20:20:44.935Z. Temporary process-scoped SetThreadExecutionState sleep inhibitor wraps the run and clears on exit; no global power-policy change.
- Linux: background parent PID3899 on pinned Observatoryhost, output ~/gkos-engine-220-qualification/ea05531/soak-linux-24h-1, supervisorlog sibling soak-supervisor-24h-1.log. Started2026-09-08T20:21:24.152Z; earliestfinish2026-09-09T20:21:24.152Z. Launchednohup; survivesSSHdisconnect. NativeDebian13LXC/ZFS (131072byteblocks,105601available atstart); Windows11Pro10.0.26200/NTFS free43.7GB. Configs soak-qualification-ea05531-{windows,linux}.json bind environment.
- Both use EXACT SAME native-soak.mjs SHA2568bc1c82ce43aa51756bc126798d29439263e385623c8d148118a7d810fa3dba6. DO NOT EDIT IT while live; each child restart validatesitsdigest. Plans/configs/source/artifact immutable; any newsourceorartifact requires affected gates/newsoak, not relabeling thisrun.
- Both final3minute pilots PASSED12cycles, graceful/hard/graceful restarts, recovery and complete receiptchain. Windows pilot2local; Linux pilot2summary downloaded. Sessions84250failedearlierwrong-scopepilot;71480/36188finalpilotsclosedPASS;6556earlierLinuxpilotPASS. FullrunscurrentlyRUNNING, Windowscheckpointcycle3atlastread, nofailuresreported. They are NOT qualified24hevidence yet.
- Soakscope128physicalGKXnotes, persistentnativewatcher+realSQLiteFTS5, deterministic local fixture vector provider(active codepath, not actualONNXinference), independentmanagedMOCvault, unchanged/1/8itemupdates, publicGkxIndex exactparsecounts and cleanfullgraphconvergence, queryhitdigests, durableMOCjournal sequencing. 120s cycle; plannedrestarts6hgraceful/12hSIGKILL/18hgraceful. Hashchainedboundedcycles, fullreceiptinventoryverification/min716cycles/24hwall+monotonic atfinish. Resourcecaps768MiBRSS,192MiBgrowth,64handlegrowth,2GiBstate,zerochildprocessesatrest,30scycle. Parent refuseseveryunexpectedexit. No failures maybedismissed.
- Latencyscope correction documented SOAK-PILOT-LATENCY-SCOPE.md: firstWindows ea05531 pilot wronglyapplied500ms directcoordinator threshold to entirewatcherroute. Preservefailedreceipt; originalwatcher501ms vsdirect180ms. Correctedharnessretains strictp95<500ms around coordinator.search exactlyasestablished2.2observation, separatelyrecords fullwatcherSearchMs, and comparescompletehitdigestsbetweenroutes. Does NOTclaimwholewatcher500msSLA. 10kqualificationfixture andthreshold unchanged, newobservationPASS. No productioncodechange forscopecorrection.

NEXT FOLLOW-UP: Inspect currentrunners, newexactmatrix and bothsoaksummary/checkpoint/cycle files; do notduplicate or interrupt healthy soaks. Preserve anyfailures and fixcause, rerunaffected newcandidate qualification. Finish native missing-current-pointer/recovery coverage review; regenerate durability map fornewsourceusing downloaded86test receipts; complete fullfilesystem/watcher performance and exactKosmos candidate tests/integration (stillold6e development substitution in Kosmos-three-way-review). OwnerOIDC/trustedpublisher and finalconsumerselection pending; independentresponses nonblocking absentconcretedefect. Soakdata/token/sourcevaults staylocal; releaseevidencebundle should contain boundedreceipts, not indiscriminate whole-state archives. Current releaseissue44 snapshot stored release-issue-44-current.json; remainsOPEN. Finalrelease/tag/signature/registryprovenance and postpublicationverification allNOTDONE.



## September 8 follow-up — native audit and exact artifact consumers pass

Source remains clean aa2e10d16983b6cbd4107464f376d87d3c546db3, PR48 draft. No source edits this follow-up; no merge/tag/publication. Full local Windows runner61185 still active, gates-aa2e10d/commands.json has ci/typecheck/build PASS and npmtest running. Do not duplicate. Exact runtime34265283849: Linux24 and informationalLinux26 PASS; remaining mandatory Linux22/Windows22/24 still running at latest inspection. CI34265283664 running. Observation34265283840PASS unchanged. Managed native audit34265283649 PASS86tests on each of4mandatory nativeplatform/runtime lanes; exact-native-audit-aa2e10d artifacts downloaded and source verified.

Packed already-built clean source with npm12.0.2 --ignore-scripts (no concurrent rebuild). New artifact-aa2e10d/gkos-engine-2.2.0.tgz SHA2568b4cc0eb16be7c07b61f66d684e4b50810f94dd4a766b7a82195d48baed6c48a; SHA512DAENDXUDfl33QM9uVs52iQy8j+os0aVSzSEquA0tZottmPAuWX1EUeQPWJO9Y9LQaB82QbqSEl8NIm371NCiDQ==. Inspection PASS594files/63559033unpacked bytes, no flagged paths or patterns. Generic native Windows24.18 and ObservatoryLinux22.23.2 consumers PASS20checks each. Independently hashed all594installed files and checked hiddenlockfile integrity against tarball onboth; installed-content-{windows,linux}.json. This is candidate qualification, not released registry smoke.

New clean Windows consumer: ../gkos-engine-220-consumer-aa2e10d-windows. Linux: ~/gkos-engine-220-qualification/aa2e10d/consumer via pinned Observatory SSH config. Consumer scripts/results and tarball retained separately from earlier candidates. No deployed service altered. Sessions44754 and71107 complete; no consumer runner left active.

Durability map DURABILITY-20260908.md / durability-aa2e10d.json distinguishes SIGKILL8boundaries, no-change nativeexit5phases, journal nativepartial-write exits, thrownfaults and injectedENOSPC. Actual ENOTDIR/EEXIST audit refusal passes4native lanes. HostedWindows statfs0 is not a filesystem identity; localWindows11Pro10.0.26200 NTFS independently recorded. Missingcurrentpointer directnativecoverage mapping stillneedsreview. Physicalpowerloss notqualified.

Found test title 'missing or corrupt audit' only exercised corruptJSON. Prepared external qualify-no-change-gaps.test.mjs against installed publicexports and ran4checks PASS onbothnativehosts: explicitoperation/idempotency/time/sequence/storage/policydigest fields, and missing/truncated/corrupt audit restartrefusal with no evidence rewrite. Fullartifactbinding subsequently verified byteforbyte. These are external evidence checks; no candidate source changes.

Harness corrections preserved: artifact-aa2e10d/inspection-invalid-source-binding.json had stale2345606 label inherited from oldinspection script; corrected general inspector now reads bound artifact.json and verifies digests before receipt. Linux preparedshell initially had CRLFredirect syntax; normalizedLF, retained linux-harness-initial-failure.json, then actualchecksPASS. Neither changes release source or artifact. Do not cite invalidinspectionasqualification.

Next: inspect exactfullruntime and localgate completion withoutduplication, preserve anyfailures; complete remaining missingpointer/durability mapping; prepare andpilot a persistent24hsoakharness (still NOTSTARTED), fullfilesystem/watcherperformance; update exactcandidateKosmos consumer integration/tests and SBOM fornewartifact. OwnerOIDCsetup/consumerselection stillpending. Existingheartbeatremainsactive.



## September 8, 18:52 UTC — Windows repair pushed, exact qualification running

Latest user request: diagnose and remediate the Windows gate. Completed repair in signed commit aa2e10d16983b6cbd4107464f376d87d3c546db3, pushed to draft PR48. NEXT is clean. Do not reuse 6e4e937 artifact as current. No merge/tag/publication.

Old runtime34254132747 attempt2 completed with one mandatory Windows22 failure (1089/1090): watcher-large-restart GKX_WATCHER_SHUTDOWN_UNSAFE. The old initial 30minute timeout is not independently explained; full new exact runtime must pass. Windows26 attempt2 passed. Failure logs preserved under exact-runtime-6e4e937-attempt2-windows22.

Isolated baseline instrumentation retained assertions and showed 6178.9ms secure scan plus about615ms failure persistence during shutdown. Fixed internal secure watcher scan to four bounded independent probes, serial directory descent with draining, deterministic results and all original secure checks/two snapshots; public Phase3 stays serial. No deadlines/retry authority/latency assertions changed. New barrier-based bound and drain-before-refusal tests. Large restart now logs bounded shutdown duration, measured3039.97ms. Typecheck/build PASS; native Windows22.23.2 five scan tests and47 broad shutdown/ingestion/path-security/qualification regressions PASS. Details docs/WINDOWS-QUALIFICATION-REMEDIATION-20260908.md and windows-scan-remediation.json. Original diagnostic instrumented bundle exists only outside repo in evidence; not release code.

Full Windows command runner session61185 is running against aa2e10d, output gates-aa2e10d/commands.json. Do not duplicate runner or modify source/build while active. Exact push runtime34265283849, CI34265283664, audit34265283649 underway; observation34265283840 already PASS, downloaded exact-observation-aa2e10d. PR counterparts have synthetic-merge source and cannot replace exact push receipts. Inspect and preserve failures; no threshold loosening. Rebuild/repack/consumer verification for new candidate still required after gates; current old6e artifact results do not qualify new source. Native comprehensive durability/performance, real24hsoak, ownerOIDC setup and finalKosmos integration remain outstanding. Existing hourly heartbeat continues. Do not duplicate it.


**17:52UTC follow-up:** local6e4e937gatesPASS, but exact-head hostedWindows22 hit the30minute runner timeout and informationalWindows26 exceeded watcher latency. Original failed receipts retained; failed jobs rerun without loosening limits. MandatoryWindows22 remains unresolved. Newtarball passes both native generic consumers and593-entry inspection. Kosmos35644f1 with this artifact passes327tests and38Chromiumchecks. Twenty scoped2000-note trials pass: one/50-filep95Windows255/495ms, Linux136/183ms. Fullfilesystem/watcherlatency, comprehensive durability mapping,24hsoak and owner publishing setup remain open. No tag/publication.

**New candidate6e4e937f5bf6b3b49809072e49beafee71c3fcd8:** subsequent native performance work found and repaired quadratic candidate scanning.50000unchanged-file samples improved47.4→3.6secondsWindows and50.6→3.0secondsLinux, retaining convergence/reuse assertions. Full qualification is rerunning for the changed revision;2345606PASSresults below are historical. [Performance report](PERFORMANCE-20260908.md). No release tag/publication;24hoursoak remains notstarted.

**September8 follow-up:** the entire local command sequence for2345606 is now PASS, including npmtest, navigation/intelligence, package/license/nomenclature, audit and qualify:current, with no tracked changes. The hosted mandatory nativeLinux/Windows Node22/24 matrix also passes. Exact branch-commit runtime evidence is [run34239874638](https://github.com/Odenknight/GKOS-Engine/actions/runs/34239874638); PR run34239880292 instead checks synthetic mergea687c9 and is retained separately. The earlier RUNNING/Queued entries below describe the prior checkpoint, not current status.

Exact-commit observation [run34239874377](https://github.com/Odenknight/GKOS-Engine/actions/runs/34239874377) passes with p50149.335ms and p95156.238ms under the unchanged strict500ms threshold. PR observation34239880315 belongs to synthetic mergea687c9, not2345606. Package inspection verified all593archive entries against the inventory, with no credential-pattern or private/transient-path findings; per-file hashes and CycloneDXSBOM are retained in artifact-2345606. Pattern scanning has explicit limits and is not universal proof of secret absence. Explicit gkos alias CLIhelp also passed on both native consumers. The release remains blocked by the other mandatory gates below; no tag or publication occurred.

**Not released. Qualification continues; this is not a completed release report.** An hourly follow-up is active in this thread. The 24-hour soak has not started.

1. **Commits:** starting main `650eab4a6752227cae336d7556a57826c22a0d5a`; latest candidate `234560673d67047e31ad886b65df62a50f467009`; released commit: none.
2. **PRs:** [PR48](https://github.com/Odenknight/GKOS-Engine/pull/48) contains the qualification changes and remains draft. PR47's exact diagnostic/documentation changes were reviewed and incorporated. No PR merged. PR46 and38 remain open; PR30/29/27/26 have historical heads already in main and remain open.
3. **Commands:** see the table below and machine-readable command receipts, which retain commands, exit codes, timing, log hashes and source cleanliness. No earlier commit's result qualifies the latest candidate.
4. **Platforms:** latest candidate focused audit passes native Linux/Windows on Node22/24. Full current-runtime/CI matrices remain running. Windows local host is Windows11Pro10.0.26200 x64, Node24.18.0/npm10.9.4. Native Observatory consumer is Debian13 CT210, Node22.23.2/npm10.9.8. Node26 is informational.
5. **Observation:** separate2.2 lane passes on latest candidate: [run34239880315](https://github.com/Odenknight/GKOS-Engine/actions/runs/34239880315). Historical exact2.1.2 replay passes [run34236128505](https://github.com/Odenknight/GKOS-Engine/actions/runs/34236128505). Frozen historical fixtures preserved. Current lane retains fixed independent identities, real10,000-itemFTS5, batching/provider ledger, incremental reuse, rebuild convergence, deterministic query digests and unchanged p95 threshold.
6. **Durability/recovery:** bounded no-op audit and native process-exit checks pass all four mandatory platform/runtime combinations: [run34239874565](https://github.com/Odenknight/GKOS-Engine/actions/runs/34239874565). Comprehensive filesystem durability is incomplete. File-sync/readback and terminal journal binding do not establish physical power-loss safety.
7. **Soak:** not started; no24-hour evidence or qualifying harness yet. Mandatory blocker.
8. **Consumer compatibility:** latest exact tarball passes20 smoke checks on native Linux and Windows, including all ten exports, gkx validation/graph/index/search/refusal, citation verification, authenticated loopback and stdioMCP read-only inventory. Explicit gkos alias check and exactKosmos/browser/offline qualification remain incomplete. Receipts: [Linux](artifact-2345606/consumer-linux.json), [Windows](artifact-2345606/consumer-windows.json).
9. **Candidate tarball:** `artifact-2345606/gkos-engine-2.2.0.tgz`; SHA256 `da1525e21b6ca8c47fc1a3da583c5252fdf50ee63aae21779a1674e517bf3def`; integrity `sha512-GU3Wf8Der/44DnlK+YK/jAMiiMqrvPpAWU2abRwAMzJ9efmS1h2CtfiKprb7mgyhkQ9k8qPpbnCnL+tEAT+fmw==`. Candidate artifact only; final full content inspection/SBOM/approval bundle incomplete.
10. **Tag signature:** not applicable; v2.2.0 has not been created. Signed annotated tag verification remains required.
11. **GitHub release:** no2.2.0 release URL; none created. Latest historical release at initial reconciliation was [v2.1.1](https://github.com/Odenknight/GKOS-Engine/releases/tag/v2.1.1).
12. **npm:** [gkos-engine](https://www.npmjs.com/package/gkos-engine) remained latest2.0.1 at reconciliation;2.2.0 absent. No2.2.0 provenance exists. OIDC-only workflow prepared; no token fallback. Recheck registry immediately before eventual publication.
13. **Installed registry tests:** not run for2.2.0, because it has not been published. Local-packed tests are not registry verification.
14. **Kosmos:** clean main candidate `3aab1e337a8442d6bc2463cab43cb9b4191291a2` with local tarball substitution passes type checking; tests282pass/2fail of284 because its pin/capability expectations still requireEngine2.1.2. Failure retained in kosmos-candidate-tests.log. Intended consumer selection pending; no released-version integration committed or merged.
15. **Owner actions:** configure npm trusted publisher for `Odenknight/GKOS-Engine`, workflow `npm-release-2.2.yml`, protected environment `gkos-engine-release`; preserve2FA/publishing protection, intended tag protection and owner approval. Local npmwhoami failedE401; starting GitHub environment/protection audit found no configured release environment. Allowed tag signers and exact qualified approval record must be supplied only after all mandatory gates pass. Candidate guide: `docs/NPM-2.2-OWNER-ACTIONS.md`.
16. **External responses:** pending. No independent implementation, adoption, profile coverage, endorsement or consensus claim is made. Only a concrete reported defect blocks release.
17. **Limitations/failed gates:** full final runtime matrix incomplete; comprehensive native durability/performance incomplete;24-hour soak not started; Kosmos tests fail; owner publishing configuration incomplete; final artifact inspection/approval, immutable tag, release, provenance and registry verification not performed. No tagging/publication occurred.

## Qualification command ledger

Latest candidate2345606 status at this checkpoint:

| Command | Result |
| --- | --- |
| git rev-parse --is-shallow-repository | false |
| git status --porcelain | clean before gates; tracked changes checked after commands |
| npm ci | PASS |
| npm run typecheck | PASS |
| npm run build | PASS |
| npm test | RUNNING |
| npm run test:navigation | Queued after npm test |
| npm run test:intelligence | Queued |
| npm run pack:check | Queued |
| npm run check:license | Queued |
| npm run check:nomenclature | Queued |
| npm audit --json | Queued |
| npm run qualify:current -- --output …/gates-2345606/current-runtime | Queued |
| node --test test/release-220-preflight.test.mjs test/documentation-capabilities.test.mjs test/runtime-qualification.test.mjs | PASS19/19 |
| npx --yes --registry=https://registry.npmjs.org npm@12.0.2 pack --ignore-scripts --json --pack-destination …/artifact-2345606 | PASS |
| npm install --save-exact --ignore-scripts …/artifact-2345606/gkos-engine-2.2.0.tgz | PASS Windows consumer |
| npm install --ignore-scripts ./gkos-engine-2.2.0.tgz | PASS native Linux consumer |
| node consumer-smoke.mjs TAR_PATH 234560673d67047e31ad886b65df62a50f467009 | PASS both native consumers |

Live exact local command results: [latest candidate](gates-2345606/commands.json), [prior458a23f](gates-458a23f/commands.json). Prior458a23f has completed npmci,typecheck,build,test,navigation,intelligence,packcheck,license,nomenclature,audit successfully and was running qualify:current at checkpoint. Earlier23301a7 qualify:current passed1078tests. These historical results remain bound to their own commits.

Earlier publication preparation ran npmwhoami (E401), npmview versions/dist-tags/maintainers (read successfully), npmpack dry-run and npmpublish exactlocaltarball dry-run (PASS at458a23f). None published a package. Latest artifact requires final repeated dry runs and all release gates.

The full continuation inventory is [CONTINUE-RELEASE.md](CONTINUE-RELEASE.md).
