# Sol independent repair report: admission-policy provider PR #31

Date: 2026-08-27

Status: implementation and verification evidence only. Authority state: `NONE`.
This report does not merge PR #31, ratify or release a contract, change the
package version, activate a policy, authorize materialization, or grant runtime
authority.

## Immutable inputs and reconciliation

- Repository: `Odenknight/GKOS-Engine`
- Pull request: `#31`, branch `agent/admission-policy-provider-v1`
- Reviewed PR head: `4ee4ad7ca742b2eb16a158bea0d20d8682a9c30d`
- Reviewed PR tree: `cd21d15d803fa1a4086afca79e3b7f6062da6148`
- Original merge base: `2fbd4ec68ec825b09e5194c9878a7ae90a281392`
- Reconciled current main: `c0eac9351b73bfa4b93b2c0cb752fd55c0b88933`

The current-main merge produced exactly four conflicts:

1. `.gitattributes` (add/add): retained every current-main LF rule and added
   the admission-policy contract subtree.
2. `README.md`: retained current-main documentation and added one explicitly
   unreleased, non-authoritative provider row.
3. `package.json`: retained current-main exports/binaries/dependencies and added
   only the isolated admission-policy subpath, generator command, and bounded
   evidence package entries.
4. `scripts/check-pack.mjs`: retained the full current-main inventory and added
   the provider bundle, declarations, contract artifacts, vectors, docs, and
   evidence.

The repaired commit and tree are the Git commit containing this report. They
are intentionally not embedded in the report body because a file cannot
self-bind the Git tree or commit that contains its own bytes without a digest
cycle. The PR head and tree, once pushed, are the immutable external identity.

## Corrective implementation

- Preserved the frozen root package export and exposed the proposal only at
  `gkos-engine/admission-policy`.
- Added exact policy and receipt binding to
  `semantic-validation-rules.json`. The artifact defines the four mandatory
  cross-item rules that portable Draft 2020-12 JSON Schema cannot express:
  dependency `(id, version)` uniqueness, disjoint priority/ordinary trigger
  lanes, request input-name uniqueness, and detected-trigger-code uniqueness.
- Added every structurally expressible uniqueness rule to the schemas and
  executed the schemas with Ajv's real Draft 2020-12 implementation.
- Added adversarial vectors that distinguish structural schema rejection from
  mandatory post-schema semantic rejection.
- Made receipt verification scopes explicit:
  `verifyAdmissionDecisionReceiptSelfHash()` and the backward-compatible
  `verifyAdmissionDecisionReceipt()` establish only closed shape, pins, and
  self-consistency. `verifyAdmissionDecisionReceiptContext()` deterministically
  replays the exact request and policy and compares the complete receipt.
- Regenerated the schema pins, policy digest, request bindings, receipt hashes,
  vector manifest, byte lengths, and exact raw artifact digests with
  `scripts/generate-admission-policy-v1.mjs`.
- Preserved `authorityState: NONE` and
  `materializationAuthorized: false` for every receipt. No I/O,
  materialization, storage, model, network, time, or randomness capability was
  added to the provider.

## Verification boundary

The focused provider/public API suite passed 14 of 14 tests after the repair.
The complete current-main Node 24 Windows suite was also executed before the
merge commit existed. Its provider tests passed; two ancestry tests correctly
failed because an in-progress merge still had the old PR head as `HEAD`, and
two compatibility/package tests identified required reconciliation work. The
root export was restored to its frozen surface and the package evidence entries
were restored in response. Those exact gates are rerun after the merge commit.

The committed-head local verification result is:

| Check | Result |
| --- | --- |
| `npm ci` | PASS; 13 packages, zero audit vulnerabilities |
| `npm run check:license` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run check:nomenclature` | PASS |
| `npm run test:navigation` | PASS; 45/45 |
| `npm test` | PASS; 842 passed, 6 platform/external-fixture skips, 0 failed, 848 total |
| `npm run test:intelligence` | PASS; 4/4 |
| `npm run pack:check` | PASS; 507 files, 3,235,130 bytes before this report-only update |
| CLI help and repository assessment smoke checks | PASS |
| tracked and untracked clean-tree checks | PASS |

The six skips are pre-existing platform/external-fixture gates: three POSIX
filesystem tests, one Linux native-watcher regression, one coherent-publication
POSIX permission test, and the unavailable external Standard SRTP catalog. None
is admission-policy coverage and none was converted to a pass.

The authoritative cross-platform result is the GitHub Actions check set on the
new PR head. At report time, Engine CI runs `33049924995` (push) and
`33049927714` (pull request) have started real hosted jobs and remain pending;
several setup, install, build, and focused gate steps are already successful,
but neither run has a terminal conclusion. They are therefore `UNEVALUATED`,
not a pass or failure. Any downstream target-repository billing block is a
separate infrastructure limitation and is not evidence about Engine PR #31.
Local Windows Node 24 execution does not substitute for the repository's Node
22/23/24 Linux and Windows matrices or their uploaded qualification artifacts.

## Residual authority and release limits

- PR #31 still requires repository-owner review and merge authority.
- This proposal remains unratified, untagged, unreleased, and package-version
  neutral.
- A downstream consumer must pin the final upstream commit/tree and the exact
  contract artifacts. Vendoring bytes does not vendor authority.
- Self-hash verification is not contextual verification, and contextual
  verification is not approval or permission to materialize.
