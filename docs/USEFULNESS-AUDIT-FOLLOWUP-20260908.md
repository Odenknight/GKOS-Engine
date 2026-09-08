# Usefulness audit follow-up — September 8, 2026

Baseline: Engine `650eab4a6752227cae336d7556a57826c22a0d5a`.

## Verified defect and bounded repair

Scheduled observation failed September 7 and 8. September 8 run:
https://github.com/Odenknight/GKOS-Engine/actions/runs/34206749198
Artifact 10048073691 reports `OBS_INDEX_FAILED`. Build, package and frozen
immutability gates passed. This is not sufficient evidence of a performance
regression.

Local reproduction on Linux / Node 24.19.0 exposed
`GKX_EVAL_OBSERVATION_INDEX_RECEIPT_MISMATCH`. Provider counts match (313 calls,
10,000 items), request-sequence digest matches, and vector stage is active.
The frozen generator binds Engine 2.1.2; the current manifest binds 2.2.0.
Expected initial projection: `retrieval:1f7d014b0dd57096f6437e1c`.
Actual initial projection: `retrieval:6d9db8b375561241723576b4`.

This change prints the existing allowlisted failure code to stderr so CI is
no longer silent. It does not print caught exceptions, source text, paths,
provider data or query results, and preserves receipt and exit behavior.
README now explains full-history cloning for historical fixture tests.
The observation qualification test file passes all 12 tests locally.
The full observation remains failing; no current performance qualification
is claimed.

## Coding-agent next step: observation qualification

Preserve the existing 2.1.2 fixture and its digests. Add a separately versioned
2.2 observation fixture and runner path with independently checked expected
projection identities. Keep a named historical replay against an exact 2.1.2
source commit. Do not make the frozen test pass by overriding the production
engine version, accepting arbitrary generated digests, removing checks, or
relaxing latency thresholds. Current and historical receipts must name the
actual executed revision and fixture. Update workflow-contract tests for the
new lanes. Require real FTS5 10k indexing, one-item incremental reuse,
clean-rebuild equivalence, query determinism, and the existing p95 budget.
Then run hosted qualification against the exact candidate.

## Basic remaining instructions

1. Engine: complete the observation successor above and issue #44 release
   qualification (durable no-op receipts, Linux/Windows evidence, performance,
   recovery, 24-hour soak and exact-artifact consumer checks).
2. Owner: approve the exact immutable Engine release only after its evidence
   passes. `npm view gkos-engine version` returned 2.0.1 today. Publish the
   approved artifact through the npm owner account, then install that registry
   version in a clean consumer project and smoke-test it. Do not publish
   development main merely to close the version gap; tags trigger publication.
3. Kosmos: qualify the exact distributable with its pinned Engine; check the
   manifest, release assets and installation in a fresh Obsidian vault. Owner
   signs into https://community.obsidian.md, links GitHub, and submits the
   repository using https://docs.obsidian.md/plugins/releasing/submit-plugin.
   Release assets must include main.js, manifest.json and styles.css if used.
   Verify desktop/mobile claims against actual supported environments.
4. Standard: recruit an independent implementer for one narrow, published
   profile and share versioned fixtures, positive cases and deliberate failure
   cases. Record limitations and independently produced evidence. A second
   wrapper around this Engine is not an independent implementation.
5. Lite projects: retain their declared scopes. Complete native qualification
   for Engine-Lite; accept maintenance/security fixes for frozen Kosmos-Lite.
6. Adoption: run a small external pilot, record task completion and failures,
   and improve onboarding from those results. Stars, forks and release asset
   counts do not establish zero users. Distribution improves access but does
   not by itself prove utility or ecosystem adoption.

No package, release or community-directory submission is made by this change.
