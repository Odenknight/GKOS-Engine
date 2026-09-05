# Node runtime modernization verification — 2026-09-05

Base: `6abfc5f4cc4953cf2f0ea51ba1cd1bb81f0c51a1`

The supported runtime expression is `>=22 <23 || >=24 <25 || >=26 <27`.
Current CI treats Node 22 and Node 24 as blocking maintained lines. Node 26 is
an informative current-release lane until it reaches LTS. Odd-numbered Node 23
and Node 25 are unsupported. The historical qualification matrix remains frozen
at Node 22, Node 23, and Node 24.

Windows Node 26.8.1 was downloaded from nodejs.org. Its archive SHA-256,
`57693d8e93d1b04e7b7de46aca53ecd63e97564e73de36a68428d7ff08d83587`,
matched the published checksum. The following checks passed on Windows:

- clean `npm ci`, TypeScript checking, and all production bundle builds;
- 270 navigation-effects, retrieval, watcher-journal, SEA-target, and public-API
  tests;
- the governed watcher observation qualification, including its real SQLite
  FTS5 requirement;
- junction, hard-link, containment, and retrieval path-security checks.

The default Windows retrieval path-security suite passed 49 of 49 tests. When
the optional strict short-path fixture was forced under Node 26, the local
volume did not expose an alternate 8.3 spelling; 48 of 49 tests passed and that
host-capability precondition failed. The hosted Windows path-security lane
remains the required qualification for the strict fixture.

The final focused policy, retrieval-observation, watcher-observation, SEA, and
public-API suite passed 42 of 42 tests under Node 24.18.0 on Windows. TypeScript,
build, license, nomenclature, inventory, and package-content checks passed; the
package contained 572 files and 6,606,756 bytes. The watcher observation
completed within the governed timeout.
