# Canonical-CBOR development adapter

**Development-only prerequisite.** This is not a governed artifact schema, persisted Refusal Receipt, Context Manifest, authority decision, GCP qualification, or an Observatory reviewer-case disposition. The pinned standard is `gkos-standard@b308ff7137bdbb109c31f0ace7e6c49b8988e0d5`; the bounded product contract is `contracts/canonical-cbor-development-v1.md`.

## Components and boundary

- `src/canonical-cbor.ts` builds to the repository-private Node bundle `dist/canonical-cbor.mjs`. It distinguishes bigint integer and number float nodes, validates deterministic bytes before hashing, sorts encoded text map keys, and refuses malformed or noncanonical input.
- `scripts/verify-canonical-cbor.py` is separately authored CBOR, float, SHA-256, and JSON logic. It does not import the Engine/JavaScript evaluator. Its only additional dependency, `unicodedata2==17.0.1`, supplies Unicode 17.0.0 data. Shared vectors and a common normative Unicode dataset are disclosed dependencies, not evidence of assessor independence.
- `scripts/verify-canonical-cbor-cross-language.mjs` compares decoded typed fields, byte identities, digest identities, readable rendering round trips, registered refusals, and tampered displayed hashes.
- Public/root exports and legacy canonical JSON are unchanged. The generated bundle/declarations can be included by the existing package file policy; repository-private means **no public export subpath**, not exclusion from the tarball.

Text validation requires actual Unicode 17.0/17.0.0 capability. Unsupported hosts refuse text with `GKOS-GATE-L6-005`, rather than normalize using a different profile. Numeric, binary, and nontext container primitives remain usable. Runtime tests observe the actual host; deliberate capability fault injection is labeled separately.

## Reproduce the bounded development gates

Use a Node runtime whose actual `process.versions.unicode` is 17.0/17.0.0 and a Python environment with the pinned requirements. The dedicated workflow uses Node24 and Python3.11, both Ubuntu and Windows. Local Python3.14.7 and Python3.11.16 were exercised separately; a local pass does not establish a GitHub runner pass.

```sh
python -m pip install -r scripts/requirements-canonical-cbor.txt
node scripts/build.mjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node --test test/canonical-cbor-runtime.test.mjs
```

Fetch `NormalizationTest.txt` from the official Unicode 17.0.0 UCD, verify SHA-256 `5019ffd530751a741900c849c0e010332f142a3612234639bd200b82138a87db`, and set `GKOS_NORMALIZATION_TEST_PATH` to that verified file. Set `GKOS_CANONICAL_PYTHON` to the **exact** reviewed Python executable (a native `C:/.../python.exe` path on Windows, not an MSYS `/c/...` alias passed to a native process).

```sh
node --test test/canonical-cbor-unicode17.mjs
python -m unittest discover -s test -p test_canonical_cbor_python.py -v
node scripts/verify-canonical-cbor-cross-language.mjs
```

The full Unicode17 corpus is explicit, not automatically included in unsupported hosts' current-runtime inventories. It is mandatory in `.github/workflows/canonical-cbor-development.yml`; a missing/wrong actual Unicode capability or missing/configured-corrupt corpus fails that lane. Standalone tests disclose an unavailable optional corpus with an explicit skip; do not describe that run as executed normalization coverage.

`node scripts/run-current-tests.mjs` exercises the existing current regression inventory plus the actual-runtime codec test. It excludes the repository's pre-existing historical lane and owner-supplied ONNX resource lane according to `scripts/current-test-plan.mjs`; this is not a complete runtime-qualification claim. Invoke package-content checks through `npm run pack:check`, not directly: the unchanged checker expects npm lifecycle `npm_execpath`.

## Readable verifier

```sh
python scripts/verify-canonical-cbor.py --hex f6
python scripts/verify-canonical-cbor.py --render rendering.json
```

The readable format is `gkos.cbor.typed-json.v1`. Integer values render as decimal strings, byte strings as lowercase hex, floats as JSON numbers, and maps as ordered entry arrays. Success emits the algorithm/profile/digest and the complete typed node. Rendering verification reconstructs canonical bytes, compares the displayed digest, and returns `canonical_hex`. Exit1 emits structured refusal JSON without a traceback. An exit0 payload with a profile label validates only this byte primitive, not mandatory artifact identity/reference fields or authority.

## Evidence and outstanding gates

Reuse note (2026-10-07): `src/canonical-cbor.ts`,
`test/canonical-cbor-vectors.json`, `scripts/verify-canonical-cbor.py` and
`scripts/verify-canonical-cbor-cross-language.mjs` are byte-identical to Carson
commit `6842051ff697dd65a8fc0072c078dc81bc8a9bd9`. The imported runtime test
`test/canonical-cbor-runtime.test.mjs` was subsequently adapted in its test title
and expected package exports to include `./governance/artifacts`.

Carson is a partial author of this reused CBOR slice and cannot be its sole
non-author reviewer. A different model family does not remove that authorship
relationship or establish independent assessment. The historical evidence and
review descriptions below refer to the upstream commit, not execution at this
checkout. This checkout's reviewer test evidence is recorded separately; no
upstream qualification is inherited. The upstream development workflow and
historical evidence directory were not copied.

Development evidence is under `evidence/canonical-cbor-development/`, including retained RED/GREEN cycles, integrator execution, normalization source identity, packet-fidelity resolution, and internal developer review. The first same-family review failed closed when tooling masked a nonsecret decimal test constant into invalid-looking syntax. The actual source parsed and the full corpus passed before and after an equivalent hexadecimal test-only refactor; that resolution is preserved, not a fabricated success or removal of the initial finding.

A Kimi K2.6/OpenRouter counter-review is different-model-family **internal developer review**. Neither it nor separately written Python creates organizational independence or external-assessor standing. Full baseline/current regression results and GitHub CI must be recorded from their real completion output before publication can be called regression-clean or CI-green.

At the upstream codec-only stage, the next governed slice still needed schema-declared Selection Envelope/Context Manifest fields and digest-bound applicability, followed by action-time authority, effect/receipt binding, durable evidence, independently observed target state, and correction/recovery. The subsequent [reviewer artifact V2 contract](../contracts/reviewer-artifacts-v2.md) describes the implemented five adopted artifact roles and bounded admission boundary. Durable host effects and replay belong to the consumer implementation. Neither the byte codec nor that later V2 implementation alone establishes full profile qualification or completion of all N00-N19/P01-P10 obligations.
