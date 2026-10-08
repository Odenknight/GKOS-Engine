# Hosted GitHub audit for `c6c7cf8`

Audited candidate: `c6c7cf828246c1a010fc3238a6ec803b42fdc068` in `Odenknight/GKOS-Engine`.

## Verified facts

All four completed runs report the exact candidate as `head_sha`:

| Event | Workflow | Run | Result | Jobs | Artifacts |
|---|---|---|---|---:|---:|
| pull request | CI | [33931879281](https://github.com/Odenknight/GKOS-Engine/actions/runs/33931879281) | success | 13 success, 1 skipped | 12, none expired |
| pull request | Historical and current runtime qualification | [33931879330](https://github.com/Odenknight/GKOS-Engine/actions/runs/33931879330) | success | 13 success, 2 failure | 15, none expired |
| push | CI | [33931876258](https://github.com/Odenknight/GKOS-Engine/actions/runs/33931876258) | success | 13 success, 1 skipped | 12, none expired |
| push | Historical and current runtime qualification | [33931876347](https://github.com/Odenknight/GKOS-Engine/actions/runs/33931876347) | success | 13 success, 2 failure | 15, none expired |

The skipped CI job in each event is the manual-only `phase4-retrieval-observation-manual` job. The two failed jobs in each runtime run are `current-runtime (ubuntu-24.04, 23)` and `current-runtime (windows-latest, 23)`. The workflow marks Node 23 matrix jobs with `continue-on-error`, and `docs/CURRENT-RUNTIME-QUALIFICATION.md` defines Node 22 and 24 as blocking while Node 23 remains informative. Historical replay passed on Ubuntu, Windows, and macOS for Node 22, 23, and 24. Current-runtime qualification passed on Ubuntu and Windows for the blocking Node 22 and 24 lanes. Receipt artifacts exist for every runtime lane, including the failed Node 23 lanes.

[PR #40](https://github.com/Odenknight/GKOS-Engine/pull/40) is open and draft. Its head is the audited candidate and its base was `18c53b8d553d75f03c52310f06e3c60f20f6068b` at inspection. GitHub reported `mergeable: true` and `mergeable_state: unstable`. The PR had no reviews, review comments, issue comments, requested reviewers, or requested teams. Its API `merge_commit_sha`, `8387c9c75c97b492b30dbf00773d2f5ec2fe70ba`, is GitHub's synthetic PR merge candidate and is distinct from the authoritative pushed head.

The commit exposed 58 check runs across the paired push and pull-request executions: four informative Node 23 failures, two manual-job skips, and 52 successes. The legacy combined-status endpoint reported `pending` with no legacy status contexts.

## Interpretation and access limits

The visible failed Node 23 check runs are a plausible cause of `mergeable_state: unstable`, but the REST response does not establish that causal link. The unstable reason is therefore inferred, not verified.

Anonymous REST access did not permit reading branch-protection configuration, job logs, or artifact archive contents. This audit verifies run/job conclusions and artifact metadata, but not receipt contents or hashes. It makes no claim about unobserved branch-protection or review requirements.
