Repair the Engine 2.2 qualification lane without modifying frozen 2.1.2 fixtures. The scheduled failures were caused by historical projection identities; the new lane independently derives and pins 2.2 identities, verifies real 10,000-item SQLite FTS5 indexing, one-item reuse, rebuild convergence and deterministic query rounds under the unchanged p95 limit. The historical lane replays the exact last successful 2.1.2 implementation.

Byte-identical managed-MOC operations now retain separately versioned durable NO_CHANGE audit receipts with authority, ownership, source/configuration/policy/plan identity, sequence, resulting state and recovery linkage. Native tests cover exact retries, five process-exit boundaries, corrupt audits, revoked authority and destination-write failure.

Prepare an immutable-tag OIDC-only npm workflow that refuses absent qualification approval, incomplete soak, wrong source/tag/version, existing npm version, or different artifact bytes/inventory. Account for npm 12 pack-report format. No publication is triggered by this PR.

Validation is revision-specific. Candidate 458a23f passed Linux observation, Linux/Windows Node 22/24 focused audit lanes, and the same packed-artifact consumer smoke tests on Windows and native Linux Observatory. Earlier 23301a7 passed 1,078 Windows current-runtime tests. These results do not qualify latest candidate 6e4e937f5bf6b3b49809072e49beafee71c3fcd8; its required CI is running.

Release remains blocked by incomplete final-runtime evidence, comprehensive native durability/performance qualification, the 24-hour soak, exact Kosmos consumer compatibility and owner trusted-publisher/protected-environment setup. Preserve these gates. Do not tag or publish based on this PR's focused test results.

Includes the reviewed exact diagnostic/documentation changes from draft PR #47; historical records remain intact. Controlling release inventory: #44.

Native performance sampling additionally found quadratic full-candidate scans during unchanged source submissions. The repair groups candidates once after rename/removal while retaining identity, duplicate, reuse and validation assertions. Single 50,000-file samples improved from 47.4 to 3.6 seconds on Windows and 50.6 to 3.0 seconds on Linux. Focused tests pass; full exact-candidate gates are rerunning. These samples do not establish repeated end-to-end p95 or soak qualification.
