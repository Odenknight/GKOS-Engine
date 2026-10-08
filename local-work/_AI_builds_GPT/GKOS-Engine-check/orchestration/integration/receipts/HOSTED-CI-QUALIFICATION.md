# GKOS hosted CI qualification receipt

Generated: 2026-09-01T02:51:16.7739757Z

Status: **COMPLETE_WITH_ENGINE_FAILURES_AND_UNTRIGGERED_REPOSITORIES**

The five exact review commits were pushed to their matching GitHub review branches under the user's narrow hosted-CI authorization. Final `ls-remote` verification binds all five remote branch heads to the locally reviewed commits, and all five local integration repositories remained clean. No PR, merge, tag, release, deployment, production credential use, Effects write, vault mutation, oracle selection, or Rust cutover occurred.

The first elevated push attempt changed nothing: Git refused every repository because the elevated Windows identity considered the sandbox-owned paths dubious. The corrected attempt used process-local `safe.directory` values and exact commit-to-ref refspecs. It did not change global Git configuration or any integration remote.

## Exact remote branches

| Repository | Review branch | Exact remote head | Push result |
| --- | --- | --- | --- |
| Engine | `codex/integrate-engine-stability-20260831` | `1c59a992bafd6815ae9837bb3910084d4aea9972` | PASS |
| Standard R18 | `codex/integrate-standard-r18-20260831` | `9f47ecf8fefb87810cd44bd03fa8e82eb321fd4a` | PASS |
| Kosmos | `codex/integrate-kosmos-identity-20260831` | `52b843c50a9e810bf8ad7ac7de8e4505a44b6baa` | PASS with server rule-bypass warning |
| Observatory | `codex/integrate-observatory-identity-20260831` | `2c01d9ea1263db2e4d7f438c2955cbc481c69f6e` | PASS |
| Lite | `codex/integrate-lite-quick-connect-20260831` | `f5b06b4a4ea5020d62824ceffc51622269a52f19` | PASS |

For Kosmos, GitHub reported that repository rules were bypassed because the branch history contains existing merge commit `6486035...` and review commit `52b843c...` is not verified-signed. The exact reviewed history was preserved; it was not rewritten to suppress that warning.

## Hosted results

| Repository | Hosted result | Evidence |
| --- | --- | --- |
| Engine | **FAIL** | [CI](https://github.com/Odenknight/GKOS-Engine/actions/runs/33463234367) and [Historical and current runtime qualification](https://github.com/Odenknight/GKOS-Engine/actions/runs/33463234430) both completed with failure |
| Standard R18 | **PASS** | Five of five push workflows succeeded |
| Kosmos | **PASS** | CI and Browser succeeded |
| Observatory | **NOT RUN** | The review commit has no `.github/workflows` directory |
| Lite | **NOT RUN** | CI accepts push only on `main`; the exact review SHA produced zero runs |

### Engine

The Engine CI run completed with 10 successful, 2 failed, and 2 skipped jobs.

- `build (22)` and `build (24)` succeeded. `build (23)` failed in `Tests`; the dependent Phase 4 artifact upload also reported that its expected receipt did not exist.
- All three Linux watcher jobs succeeded.
- Windows watcher Node 23 and 24 succeeded. Windows watcher Node 22 failed in `Exact watcher observation qualification`; its expected observation measurement did not exist for upload.
- All three Windows retrieval-path-security jobs succeeded.
- The event-inapplicable manual observation job and the watcher artifact audit dependent on the failed matrix were skipped.

The runtime-qualification run completed with nine successful and three failed jobs.

- Historical replay passed on the complete nine-leg matrix: Ubuntu 24.04, Windows, and macOS 14, each on Node 22, 23, and 24.
- Current runtime failed on all three Ubuntu 24.04 legs, Node 22, 23, and 24, in `Current runtime qualification (source inventory and executed tests)`.
- Each failed current-runtime leg successfully uploaded its evidence artifact.

The public Actions API exposed the run, job, step, annotation, and artifact metadata. GitHub rejected unauthenticated job-log download with HTTP 403 and artifact download with HTTP 401. Therefore this receipt does not infer root causes beyond the exact failed steps and annotations. The failed jobs are linked in the machine-readable receipt.

### Standard R18

All push-triggered workflows succeeded: [Markdown lint](https://github.com/Odenknight/gkos-standard/actions/runs/33463236743), [Release checksums](https://github.com/Odenknight/gkos-standard/actions/runs/33463236777), [Release validation](https://github.com/Odenknight/gkos-standard/actions/runs/33463236783), [Conformance runner](https://github.com/Odenknight/gkos-standard/actions/runs/33463236720), and [Link check](https://github.com/Odenknight/gkos-standard/actions/runs/33463236873).

This does not remove the earlier qualification boundary: the starter still has two UNEVALUATED fixtures and cannot support a Standard v0.81 or complete GCP4/5 claim.

### Kosmos

[CI](https://github.com/Odenknight/Kosmos-Oden/actions/runs/33463237973) and [Browser](https://github.com/Odenknight/Kosmos-Oden/actions/runs/33463238032) both succeeded at the exact review SHA.

This is hosted component and synthetic-browser evidence. It does not establish the complete live Engine-to-renderer path.

### Observatory and Lite

Observatory contains no hosted workflow at its review commit. Lite's `CI` workflow is limited to pushes to `main`, while its other workflows require a tag or manual dispatch. Its review-branch push produced zero runs. No PR, tag, default-branch update, or workflow modification was created to manufacture a result.

## Qualification conclusion

The authorized branch publication operation is complete, but overall hosted qualification is **not passed**. Engine has reproducible hosted failures that require diagnosis from the uploaded runtime artifacts and full logs under authenticated repository access. Observatory needs a repository-owned hosted workflow if hosted qualification is required. Lite needs an authorized review-branch trigger or separately authorized PR/manual-dispatch path.

This receipt is paired with `hosted-ci-qualification.json`, which records exact run and job identifiers.
