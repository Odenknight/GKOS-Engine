# Kosmos three-revision comparison

Reviewed September 8, 2026. No branches merged, pushed or rewritten. Original local checkout and its untracked work remain untouched. Inspection and testing used a separate full clone at `[LOCAL_PATH]

## Relationship

`3aab1e337a8442d6bc2463cab43cb9b4191291a2` → 29 commits → `65e9354f220b19a16c67504ff228e58caf8128ca` → one commit → `35644f103771d1edf3634c160d381370bea883aa`.

Both ancestry checks passed. `git merge-tree --write-tree` produced the exact descendant trees with no conflicts for main→PR41 and PR41→local. These are cumulative revisions, not three competing implementations.

| Revision | Package / Engine pin | Distinguishing content |
| --- | --- | --- |
| Main3aab1e3 | Kosmos0.8.0; Engine2.1.2 at41172b91970aac869c161f4842e3526a62fd1fd9 | Merged baseline with stable agent visual identity, existing local/browser/Obsidian workflows; lacks the later standalone, desktop and Engine2.2 uplift. |
| PR41 65e9354 | Kosmos0.8.1; Engine2.2.0 development source atf1a95f8f3933f834eb4030f0f0d143051e6eecc2 | Includes the0.8.1/PR38 work, standalone event observability/replay, proposal quarantine/immutable decisions, Effects coordination and corrupt-state refusal, operational corpus exclusions, internal-alpha Tauri shell and portable staging, vendored GLib correction, safer loopback origins/redirects and denial handling, Engine2.2 library adoption. |
| Local35644f1 | Same package version and Engine pin asPR41 | Adds standalone MCP retrieval UI/client, separate in-memory MCP credential, verified-citation rendering, explicit trusted Node managed-MOC host, actual Engine service/host tests and browser flows. |

PR41 changes182 files,65,596 insertions and1,032 deletions against main. Excluding vendored GLib:58 files,10,671 insertions and1,032 deletions. Its title understates the accumulated scope. Local adds15 files changed,493 insertions and4 deletions. It is already present remotely on `origin/codex/retrieval-moc-next-update`, but no PR was found for that branch.

## Merge conflicts and blockers

- Whole PR41 into current main: no Git content conflicts. GitHub reports MERGEABLE but BLOCKED, with REVIEW_REQUIRED and no reviews. Reported CI, Chromium, security/CodeQL, provenance/SBOM, reproducibility, dependency review and native backport checks are successful. One dependency review entry belongs to a skipped push lane; the PR lane passed.
- Active ruleset18825227 requires one approving review, code-owner review where applicable, resolved review threads, signed commits and linear history. It also lists code quality/coverage rules. Classic branch-protection404 does not mean the repository lacks protection. Obtain the required review; do not bypass it.
- Whole local branch afterPR41: no content conflicts; one descendant commit. Prefer a separate follow-up PR for that commit.
- Applying only35644f1 directly to old main, omitting its parent uplift: simulated three-way application conflicts in `CHANGELOG.md`, `README.md`, `TECHNICAL_README.md`, `docs/WIRED-CAPABILITIES.md`, `src/standalone/standalone.ts`, and `test/browser/standalone-flows.spec.ts`. The two modify/delete reports reflect files introduced by the skipped parent history, not a deliberate deletion on main. Raw result: kosmos-skip-parent-merge.txt.
- Dependency conflict with the release objective: both newer revisions still pin the older Engine development commitf1a95f8. Their exact dependency guard requires that Git SHA and matching allowScripts entry. Installing the final npm artifact requires a coordinated package/lock/guard/provenance update, not simply changing the version assertion or deleting the guard.
- Original local checkout has no tracked edits, but43 untracked files, including patch/staging/prototype material. They are not part of35644f1 and have not been qualified or proposed for wholesale inclusion.

## Verification performed

Windows11, Node24.18.0/npm10.9.4, clean isolated35644f1 checkout:

- `npm ci`: passed against its committed lockfile.
- `npm run verify`: passed327tests, zero failures/skips, typecheck/build, version/lock checks, artifact checks, invariants and renderer provenance. Log: kosmos-three-verify.log.
- `npm run test:browser:chromium -- --workers=1`:38passed in43.6seconds, desktop/mobile Chromium. Log: kosmos-three-browser.log.
- Then installed the exact new Engine candidate tarball with `npm install --no-save --package-lock=false --ignore-scripts ../GKOS-Engine-release-220-evidence/artifact-2345606/gkos-engine-2.2.0.tgz` without changing committed dependency records. `npm test`:327passed, zero failures/skips, including actual service retrieval and managed-MOC host tests. Log: kosmos-three-engine234-tests.log. Git tracked/untracked status remained clean in the isolated checkout.
- Candidate Engine source234560673d67047e31ad886b65df62a50f467009; tarball SHA256da1525e21b6ca8c47fc1a3da583c5252fdf50ee63aae21779a1674e517bf3def. This controlled substitution is compatibility evidence, not a completed dependency integration or release qualification. Browser tests above used the committed Engine pin, not this substituted tarball.
- Earlier main3aab1e3 with that tarball passed typecheck but282/284tests, with two stale2.1.2 pin/capability expectations failing. The PR41 lineage already updates those expectations properly for its2.2 development baseline.

## Recommendations

1. Use35644f1 as the preferred functional consumer candidate for Engine2.2 qualification: it includes the intended retrieval and explicit MOC integration, and its327tests pass against the exact new Engine tarball. Keep65e9354 as the smaller library-adoption baseline/fallback. Main alone is behind the intended integration.
2. LandPR41 first after the required approving review, with its title/body expanded to the full accumulated scope. Respect signed/linear-history rules and use a repository-approved squash/rebase path. If squashed, replay only the single35644f1 child commit onto the resulting main; do not accidentally replay the29 parent commits.
3. Submit35644f1 as a separate focused PR and run its CI. AfterPR41 merges, PR38's content is already incorporated; resolve it as superseded rather than merging duplicate history.
4. Qualify the final Engine tarball against that consumer on mandatory Node22/24 and native Linux/Windows, including browser/offline/security, cancellation/reconnect/revocation and restart/recovery. The new search/MOC slice explicitly does not complete production Obsidian authority, native credential bridge, installers or supervised sidecar qualification. Keep those limitations visible.
5. Keep MOC execution explicitly enabled through trusted host code. Preserve separate viewer/MCP credentials and Node/browser isolation. Review release packaging deliberately: package.json includes kosmos-moc.mjs, but the existing release artifact list/portable payload does not include this new host. Clarify intended distribution before advertising it in those artifacts.
6. After Engine publication, pin exactlygkos-engine2.2.0 with the verified registry integrity, regenerate the lockfile, replace the development-SHA guard with equivalent release-artifact checks, update provenance and rerun all relevant checks. Neither65e9354 nor35644f1 currently represents that final released-artifact dependency.

No merge approval, release readiness, external endorsement or full platform qualification is inferred from this comparison. The user has not yet confirmed the recommended consumer selection.
