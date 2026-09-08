# Engine 2.2.0 qualification starting state

Owner authorization: release 2.2.0 only after all mandatory qualification,
review and exact-commit checks pass. No tag or publication is authorized by
a partial result. Starting main: `650eab4a6752227cae336d7556a57826c22a0d5a`.

Local original checkout: `2fbd4ec68ec825b09e5194c9878a7ae90a281392`, branch
`feature/navigation-effects-contract-v1`, substantial unrelated tracked and
untracked work. Preserved. Qualification uses a separate full clone.
Host: native Windows 11 Pro, 10.0.26200, x64; Node v24.18.0, npm 10.9.4.
GitHub CLI 2.97.0. Git reports `is-shallow-repository=false`.
The fresh clone initially inherited CRLF conversion; before qualification,
unchanged files were restored to exact committed bytes and local
`core.autocrlf=false` was configured. Frozen fixture assertions caught this
environment defect; their byte comparisons were retained.

Open PR inventory on September 8:

| PR | State and disposition |
| --- | --- |
| #47 | Draft, head `2c10df669233aff7353557de4c5931b8682cb951`; exact three-file diff reviewed and incorporated in the qualification branch. Original PR stays open until green integration. Missing resealed candidate inventory caused current-runtime/CI failure; historical replay passed. |
| #46 | EU AI evidence planning; conflicting, outside release repair scope; left open. |
| #38 | Older hosted CI/current-runtime repair draft; left open pending exact supersession assessment. |
| #30 | Watcher recovery historical work; left open; historical evidence must not be rewritten. |
| #29 | Retrieval evaluation historical work; left open. |
| #27 | Lineage citations/temporal search historical work; left open. |
| #26 | Hybrid retrieval historical work; left open. |

Open issues: #44 controls release qualification and remains open; #36 tracks
settings/discovery runtime ownership and remains open. #44 comments confirm
PR #43 merged and retain explicit gaps in durable no-op receipts, performance,
native durability, soak and consumer acceptance. Existing source passes are
not release qualification.

Latest successful main CI: 34063066179; runtime qualification: 34063066239,
both at starting main on September 6. Last successful Phase 4 observation:
34022421978 at `d81f9d1351f1a9228650a840629191a92f2dfb22`.
Scheduled failures: 34105302635 (September 7), 34206749198 (September 8),
both at starting main. Latest PR #47 CI failure: 34231007132; runtime failure:
34231007131. Failure evidence is retained; no performance regression follows
from a projection identity mismatch.

Remote newest version tag: v2.1.2 resolves to
`7bf14b481e78c5ae9d1e14661602be4f24559d0e`. GitHub latest release: v2.1.1.
No v2.2.0 tag/release exists. npm public registry reports versions 1.3.0,
2.0.0 and 2.0.1; latest=2.0.1; maintainer `odenknight`; repository correct.
`npm whoami --registry https://registry.npmjs.org` failed E401. This does not
prove local account ownership or trusted-publisher configuration.
GitHub environment list and ruleset list are empty; classic main protection
returns 404 (branch not protected). Publication remains blocked until the
approved publishing mechanism and owner controls are established.

Observatory exists as a private repository and local integration checkout.
No production vault or Observatory deployment has been changed.
Raw starting PR, issue, run, tag, release and npm snapshots are retained in the
external local qualification evidence directory, outside the package checkout.

Initial `npm ci` succeeded (13 installed packages, zero audit findings).
Qualification commands and receipts are recorded separately for each actual
candidate. No released SHA, release tarball, signature, registry verification,
24-hour soak or Kosmos integration pass is claimed by this starting record.
