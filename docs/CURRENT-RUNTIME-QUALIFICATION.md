# Historical and current runtime qualification

Owner decision Q-GUARD (2026-08-31) separates historical contract evidence from
current implementation qualification. This v1 gate does not select the final
TypeScript oracle, authorize a release, or certify all platforms.

The original identity contract pack, generator, 35-test file and eleven-job
workflow remain byte-identical. The unchanged historical test runs at commit
`97ae3560a4fa2e771b60fa63d6dc0349d0b4c864`, where the integration assertion was
last changed and the protected paths still match its fixed `7bf14b4` reference.
No original assertion is deleted, skipped within that test, or rebound to HEAD.

`npm test` runs every current test file except that one historical test. Its
replacement current integrity gate checks every original frozen file, the exact
historical-to-audited change inventory, and each reviewed candidate file/hash.
Adding or changing code requires a reviewed update of
`contracts/runtime-qualification/v1/change-inventory.json`; the runtime command
never regenerates that inventory. The source snapshot records every tracked
and unignored untracked source file, its bytes, HEAD and tree. A dirty local
candidate is identified by its full snapshot digest, not mislabeled as HEAD.

After lockfile installation, use:

```text
npm run qualify:current -- --check
npm run qualify:current -- --output /absolute/path/outside-checkout
npm run qualify:current -- --historical-checkout /absolute/path/to/97ae356-checkout --output /absolute/path/outside-checkout
```

The current runner actually builds and executes the current suite. The historical
runner requires an exact clean checkout with its own dependencies. Both record
real command arguments, platform, Node version, durations, counts and log hashes.
Failed commands, changed source or missing/ambiguous test counts cannot pass.
Any skipped test yields `INCOMPLETE_PLATFORM_COVERAGE` and a nonzero exit: this
first gate intentionally cannot manufacture alternate-platform qualification.
Hosted capability evidence and receipt aggregation remain required before full
CI qualification; a local pass is not a substitute. The pre-existing retrieval,
watcher and downstream qualification lanes are retained.

The source-control diff of the manifest itself is an explicit review boundary;
the manifest cannot cryptographically approve itself. Final acceptance must bind
its hash and the full candidate snapshot digest in the orchestrator's external
verification record. This is engineering evidence, not independently enrolled
Standard conformance review.
