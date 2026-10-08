# Standard R18 local integration receipt

**Result:** Local integration candidate tested; no conformance, v0.81, release, merge, push, or tag claim.

## Bound source and seal

- Branch: `codex/integrate-standard-r18-20260831`
- Exact base: `aa9a05315a9a767bd672aa2bb5179c963d9d66ca`
- Base tree: `f85b2653e6324e5d7252508bcb5e7e4ac599966c`
- Candidate commit: `9f47ecf8fefb87810cd44bd03fa8e82eb321fd4a`
- Candidate tree: `8326360374a7dadbad97e2f92627f5edf578a66f`
- Patch SHA-256: `b4ce3f17ef88bb51647577c2d693730e98c96ed8d8a97c602d77b64e7354dcdd`
- Patch verification: clean forward check PASS; indexed apply PASS; staged `git diff --cached --check` PASS; post-commit reverse check PASS.
- Commit: local, DCO-signed-off, 9 files changed, 239 insertions, 25 deletions.
- Final tracked/untracked porcelain status: empty. Ignored installed dependencies do not alter the source tree.

## Executed checks

| Lane | Exact result | Evidence |
| --- | --- | --- |
| `npm test` | exit 0; 80 tests, 80 passed, 0 failed/cancelled/skipped/todo; default registry lint PASS | `standard-r18-final-npm-test.log` |
| `node registry-lint.mjs --require-mutation-coverage --out …` | exit 0, PASS; 62 requirements, 28 gate codes, zero uncovered and zero executable-uncovered codes | `standard-r18-final-strict-lint.json`, `.log` |
| `node run.mjs --adapter test/fixtures/fake-adapter.mjs --out …` | expected exit 1; 8 executed, 6 fully evaluated and passed, 0 failed/skipped, 2 UNEVALUATED | `standard-r18-final-starter-claim.json`, `.log` |

The two exact UNEVALUATED fixtures are:

- `GCP3-C01` — `unevaluated expectations: pair, projection.graph_expect`
- `GCP3-L01` — `unevaluated expectations: pair, projection.graph_expect`

The starter claim contains no verified requirements, claimed profiles, or tier claims. Its nonzero exit is preserved as required non-qualifying behavior.

## Q-INTENT

Disposition: `OWNER_DECISION_REQUIRED`.

The preserved R4 source, under **“Phase 12 — Downstream integration and release cut,”** says “eight-invariant documentation intent gate” but enumerates no invariant list. Proposed/non-normative `GKOS-DOCSTD-001`, under **“4. Intent review,”** contains exactly seven rows. Each maps directly to the seven-item synopsis in the controlling roadmap, but no local source names an eighth item or demonstrates that one row combines two R4 items.

Local authority therefore cannot invent item eight, split a row, amend “eight” to “seven,” or adopt the proposal. The owner must either supply and adopt the exact eight-item checklist or formally amend the R4 cardinality/reference and separately adopt the exact checklist. Full wording and citations are in `Q-INTENT-RESOLUTION.md`.

## Provenance and limits

The first provisional integration was rejected after a line-ending seal concern. Its commit/tree/status and logs were copied to `rejected-seal/standard-r18/` before that worktree and branch were removed. The branch reported above was recreated from the exact base and contains only the corrected sealed patch commit.

Testing used Node `v24.18.0`, npm `10.9.4`, Microsoft Windows `10.0.26200`, X64. Strict coverage is expressly `portable-predicate-twins-only; not cumulative profile qualification`. The starter runner still has two graph expectations UNEVALUATED. Broader Standard gates and Q-INTENT remain open.

Machine-readable binding and evidence hashes are in `standard-r18-integration-receipt.json`.
