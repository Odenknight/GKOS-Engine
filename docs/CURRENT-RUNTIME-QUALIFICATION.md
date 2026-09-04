# Historical and current runtime qualification

Owner decision Q-GUARD (2026-08-31) separates historical contract evidence from
current implementation qualification. This v1 gate does not select the final
TypeScript oracle, authorize a release, or certify all platforms.

The original identity contract pack, generator, 35-test file and eleven-job
workflow remain byte-identical. The unchanged historical test runs at commit
`97ae3560a4fa2e771b60fa63d6dc0349d0b4c864`, where the integration assertion was
last changed and the protected paths still match its fixed `7bf14b4` reference.
No original assertion is deleted, skipped within that test, or rebound to HEAD.

`npm test` runs every deterministic current test file except that one historical
test. The real-ONNX observation remains explicitly host-resource-exempt unless
`GKOS_TEST_LOCAL_EMBEDDING_CONFIG` names an owner-supplied trusted model pack;
the runner prints that exemption and this gate makes no local-model claim. Its
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
Any skipped selected test yields `INCOMPLETE_PLATFORM_COVERAGE` and a nonzero
exit. Platform-exclusive tests are registered only on their native platform,
and the selected suite runs with file concurrency one so resource pressure
cannot turn durability shutdown bounds into cross-file scheduling failures.
Each qualification command retains a fail-closed 30-minute process deadline;
the serialized Windows oracle is measured near 20 minutes, so the former
20-minute deadline did not provide reliable scheduler and filesystem headroom.
The blocking hosted matrix executes both Ubuntu and Windows on Node 22 and
24; Node 23 remains informative. The workflow also checks out Standard commit
`ad10dfe94a024f464430fd243c5a918d03389041`, the direct fixture-publication
successor to the Engine-bound `351330ce34ac6bf9f48ac340e3c259ea30e74715`
coordinate baseline, so its science catalog test executes instead of skipping.
Before qualification, both checkouts are restored with `core.autocrlf=false`
so the byte-governed LF inventory is identical on Linux and Windows rather
than depending on the runner's global Git configuration. Hosted
capability evidence and receipt aggregation remain required
before full CI qualification; a local pass is not a substitute. The pre-existing
retrieval, watcher and downstream qualification lanes are retained.

The source-control diff of the manifest itself is an explicit review boundary;
the manifest cannot cryptographically approve itself. Final acceptance must bind
its hash and the full candidate snapshot digest in the orchestrator's external
verification record. This is engineering evidence, not independently enrolled
Standard conformance review.
