# Standard fail-closed hardening candidate — 2026-08-31

Candidate for independent root review, not a release or conformance approval. Priority: Stability > Reliability > Fidelity. Sol performed this implementation and its self-tests; it is not independently verified merely because another agent subsequently reviews it, and no different-model-family R18 adjudication is claimed.

## Exact source and isolation

- Audited source: `orchestration/2026-08-31/standard-audit/gkos-standard-r18`, commit `aa9a05315a9a767bd672aa2bb5179c963d9d66ca`, tree `f85b2653e6324e5d7252508bcb5e7e4ac599966c`.
- Candidate: `orchestration/upgrades/standard-r18`, local `git clone --no-hardlinks --no-checkout` followed by detached checkout of that exact commit. No commits, tags, pushes, merges or releases performed. Candidate changes are uncommitted and identified by [per-file SHA256](evidence/standard-candidate-files.json), not mislabeled as the baseline commit.
- Original R18 audit checkout remains clean. Standard main's existing untracked `conformance/runner/gcp6-replay-evidence/` is retained; no source/evidence cleanup was performed. Hindsight snapshot and top-level source checkout were not edited.
- Hindsight baseline is the previously audited immutable snapshot of `59af4d1080efb0eae147d2aec0c0b1b75461b761`; its synthetic local index is not represented as original Git history.

## Changes and contract basis

1. `conformance/runner/canonical-time.mjs` supplies one typed Gregorian calendar validator to canonical encoding, predicate evaluation and authority-window evaluation. Canonical Serialization §6 and R17 require exact UTC microseconds, valid calendar dates, no leap seconds and half-open authority validity. Impossible dates, trailing newline, wrong types, missing endpoints and invalid windows refuse. No ambient clock or precision truncation is used.
2. `gate-evaluator.mjs` validates required fields before comparing them. Known fixture kinds return their stable registered refusal code for missing/malformed evidence instead of opening through `undefined === undefined`, coercion, falsey booleans or array-method exceptions. Agent-specific fields are checked conditionally for agent reviewers. HOLD input invalidity uses L4-001 before the separate L4-002 conflict predicate. Unknown/missing fixture kinds throw one deterministic TypeError because there is no registered normative code for an unknown fixture kind; they never return the open sentinel.
3. `canonical.mjs` rejects lone UTF-16 surrogates in values and keys before UTF-8 encoding, and rejects sparse arrays instead of silently encoding absent elements as undefined. Invalid UTF-8 decoder errors receive L6-005; other malformed CBOR decode errors receive L6-001. Existing positive NFC strings, surrogate pairs, U+FFFD itself, leap dates, and canonical replay bytes remain unchanged. This follows Canonical Serialization §§4, 6, 7 and 12; no normalization or evidence rewriting is introduced.
4. `authority-window.mjs` shares the validator and returns its existing structured refusal for absent/mistyped direct inputs. Its success and refusal object schemas are unchanged.
5. `track-a-evidence.mjs` and `registry-lint.mjs` execute the Track-A baseline/mutation twins bound by catalog file/case ID, reject missing/duplicate/mismatched bindings, and require executed coverage in strict mode. Added report fields explicitly say `portable-predicate-twins-only; not cumulative profile qualification`. Existing declared coverage remains separately visible. A declared code alone can no longer satisfy strict predicate coverage.
6. Tests: `test/fail-closed-inputs.test.mjs`, `test/track-a-evidence.test.mjs`, and `test/canonical-replay.test.mjs`. The replay test now compares to the committed 1,338-byte artifact, not merely two outputs of the same implementation.

The gate records are still synthetic predicate inputs, **not** full authority or artifact schemas. Their `sha256:a` labels remain opaque nonempty fixture references. The effect-dimension fixture interface recognizes its supported `bounded`/`reversible` observations and refuses unsupported labels; this is not a new universal effect-scope vocabulary. No normative Markdown, catalog qualifying-profile declaration, requirement allocation or dependency lock changed.

## Executed verification

Environment: Windows x64, Node 24.18.0, npm 10.9.4, ICU 78.3 / Unicode 17.0; [exact runtime versions](evidence/standard-environment.json). Dependencies installed using the candidate's unchanged lock with `npm ci --ignore-scripts`; cache was moved outside the candidate to `reports/evidence/standard-npm-cache`. No install scripts were run.

| Check | Result | Evidence |
| --- | --- | --- |
| Exact final regression suite against unchanged audited R18 modules | Exit 1; 35 tests, 6 pass, 29 fail | [Final red log](evidence/standard-red-final-suite.txt) |
| Candidate `npm test` including registry integrity | Exit 0; 80 tests pass, 0 fail/cancel/skip/todo | [Final green log](evidence/standard-green-final.txt) |
| Strict mutation lint | Exit 0; 62 registered requirements, 28 gates, all 28 catalog-bound predicate twins executed | [JSON](evidence/standard-strict-lint.json), [raw log](evidence/standard-strict-lint.txt) |
| Starter runner with fake test adapter | Expected exit 1; 8 fixtures, 6 pass, 2 UNEVALUATED; no profiles/tiers/requirements claimed; generated claim schema validation passes | [Claim](evidence/standard-starter-claim.json), [log](evidence/standard-starter-run.txt) |
| GCP6 captured-input replay | Exit 0; preserved 1,338 bytes and hash `03d9507b12bb07d3d0224359881c0f6b6f7c2eb79346e31ca25925365dc2667b` | [Result](evidence/standard-replay/result.json), [log](evidence/standard-replay.txt) |
| SRTP draft graph suite | Exit 0; 22/22 pass, profiles empty, explicitly provisional/non-normative | [JSON](evidence/standard-srtp.json), [log](evidence/standard-srtp.txt) |
| Candidate `git diff --check` | Exit 0 | Executed locally; no whitespace findings |

The new regression suite mutates every field of each of the 28 baseline records with missing/null/wrong-type evidence, repeats refusals, and separately checks invalid calendar values, surrogate values/keys, decoder UTF-8, valid leap-year/Unicode bytes, authority endpoints and direct absent input, sparse arrays and invalid fixture kinds. The lint tests demonstrate that changing a rejecting mutation to the positive input, duplicating/removing cases, altering expected codes or using an unknown kind cannot preserve coverage.

Reproduce red without modifying audit evidence (PowerShell from workspace root):

```powershell
$env:GKOS_TEST_BASELINE=(Resolve-Path orchestration/2026-08-31/standard-audit/gkos-standard-r18).Path
node --test orchestration/upgrades/standard-r18/conformance/runner/test/fail-closed-inputs.test.mjs
Remove-Item Env:GKOS_TEST_BASELINE
```

Then from candidate `conformance/runner`: `npm test` and `node registry-lint.mjs --require-mutation-coverage`. The original eight-observation audit probe remains unchanged and intentionally refuses changed modules; the separately identified regression suite tests the candidate instead. Earlier `standard-red.txt`/`standard-green.txt` logs are development observations, not final receipts; final-named files above supersede their counts.

## Markdown review inventory and findings

[Explicit inventory of all 291 Markdown paths](evidence/standard-markdown-inventory.json) records path, byte length, SHA256, identical-content representative and review depth. Excluded: `.git`, `node_modules`, virtual environments and dependency/cache directories. There are 172 unique SHA256 contents / 771,889 unique bytes (1,125,240 bytes across all paths). Identical contents were reviewed once, with duplicate paths explicitly retained.

Every unique document was screened through its headings and extracted status/authority/decision clauses, preserved in [screening evidence](evidence/standard-markdown-screen.json). This is not a claim of a line-by-line audit of every document. Full-text reads and their exact-hash duplicates account for 67 paths; 224 are labeled screened. Full-text reads covered the controlling Canonical Serialization, Authority/Refusal, Governed State Change, Conformance Profiles and Diagnostic Code annexes; R17 and R18; v0.81 baseline; R18 applicability and conformance README; Hindsight adjudication, canonical JSON, owner intake and root README; and short documents without screenable status clauses.

Also read outside that inventory: `orchestration/2026-08-31/reports/AUDIT-STANDARD-HINDSIGHT.md`, its `evidence/standard-boundary-probes-USAGE.md`, top-level `2026-08-31-Q-SCOPE-APPROVAL.md` and `2026-08-31-Q-GUARD-APPROVAL.md`; screened the top roadmap's Standard/Hindsight packets and decision references. Relevant source, fixture, schema/runner tests and Hindsight merge-only YAML/dependency lock were read directly. The root explicitly accepted deduplicated screening with deeper controlling-document reads for this review.

Findings carried forward:

- R18/Aug29 governs the development candidate; DDCV remains non-gating and provisional. Old Aug27 or portfolio wording cannot silently override current authority. Archived release documents and proposed portfolio/independence rules remain historical/proposed, not current execution grants.
- Q-SCOPE authorizes TypeScript-first R4-1 through R4-10 while deferring R4-11/12; Q-GUARD preserves historical qualification separately from current-runtime evidence. Neither appoints a production writer, retires TypeScript, or closes the final oracle identity decision.
- Standard's current implementation references still mix historical Engine 2.0.1 material, R18's named 2.1.2 coordinate, and the source audit's later tag/main observations. Reconcile exact coordinates in release work; this candidate did not rewrite them.
- Hindsight owner-intake and old audit statements that PR31/PR1 remain open or cannot merge are historical: the preserved audit and merge-only closure distinguish merged work from still-unratified provider/R2/runtime activation. No Hindsight code, pins or documentation was changed.
- Hindsight's hash-locked test closure still omits PyYAML despite importing it. Exact Ubuntu/Python3.12 wheel closure and fresh testing remain required. No improvised pin or lock fix was made in the read-only lane.
- Hindsight's `marshal-canonical-json/v1` and Standard's `GKX-CBOR-1` remain separate profiles/domains. Shared terminology does not authorize rehashing or merging their semantics.

## Remaining gates and limitations

This is bounded TS-S1 and predicate-evidence hardening, not TS-S1 full environment qualification, TS-S2/3/4 closure, or Standard v0.81 completion. Full GCP4/5 execution still needs schema-owned records, receipt/state/no-effect/recovery/idempotency assertions, complete requirement sets, real seven-condition reviewer grants/leases/models/sealed evidence and escalation behavior, and R17 consolidation parity. String model-family inequality and booleans are insufficient authority evidence.

The canonical helper still is not a schema-directed complete encoder: timestamp recognition uses existing field suffixes, schema float/integer preservation and all permitted CBOR domains are not established by these changes. Duplicate/map-order diagnostic specificity, full artifact schema enforcement, adversarial depth/resource bounds and every malformed-CBOR family require further work. Non-JSON hostile JavaScript proxies/getters are outside the predicate fixture boundary. Unknown-kind exceptions must never be caught and interpreted as approval by a future caller.

Release script/count/metadata closure, Full tag/main/oracle reconciliation, Lite differential dossier, two independently provisioned environments, Node22 and required-capability hosted lanes, exact artifact/dependency/environment closure remain open. Starter-runner claims are schema-valid but still name the historical v0.80 starter catalog alongside development applicability; this is not exact-bound v0.81 qualification.

Hindsight remains contract/scaffold evidence: provider/EVD/PostgreSQL/model/runtime pins, D1-D8 acceptance and R2 freeze, independent Python/Rust implementations, live adapter/reviewer security, durable materialization, concurrency/crash/recovery, shadow qualification and activation remain unresolved. No live service, PostgreSQL, provider write, deployment, release, or Rust authority cutover was executed. Final acceptance requires root's independent review and retest.
