# GKOS classifier module: Rust and TypeScript build instructions

21 September 2026 • Repository-informed implementation plan • Commands inspected, not executed in this review.

## Repository handoff update — 21 September 2026

This repository is the **TypeScript implementation lane**. The joint plan is retained
in full so both implementations share the same contracts, sequencing and parity
expectations. Start with §§2 and 6 for TypeScript, or §§3 and 7 for Rust; §§4–5
and §§8–11 apply across both implementations.

Read [the context summary](README.md) before implementation. The Standard work
now exists as [draft PR #56](https://github.com/Odenknight/gkos-standard/pull/56),
with [candidate contract](https://github.com/Odenknight/gkos-standard/blob/efa2f87a9774455f8dd717c302b0978d60990b5e/docs/v082/CLASSIFIER_DISPOSITION_CONTRACT_DRAFT.md)
and [initial wire schema](https://github.com/Odenknight/gkos-standard/blob/efa2f87a9774455f8dd717c302b0978d60990b5e/schemas/provisional/classifier/classifier-record.draft.schema.json).
These remain proposed, not adopted or deployment-activating.

The TypeScript domain example in §5 predates that schema and is **not its wire
representation**. The draft schema uses version/digest-bound references and
optional calibrated integer-millionth scores. Implement an explicit mapping;
do not send the illustrative camelCase object as a validated wire payload.
Other score formats require a separately versioned contract extension. The
initial schema covers preset/evaluation shape only; request, applicability,
matrix-result and patch bindings still need completion. Reference resolution,
calendar validity, task-label membership, normalization and authority need
semantic validation beyond the JSON schema.

Current drafting choices are unique-match rules, HOLD for zero/multiple matches,
managed tags plus routine dispositions, retained reviewer independence, and
holds limited to dependent operations. The last three are unresolved owner
policy choices, not approvals. Preserve them as pending in implementation work.

The repository baselines and Rust PR #18 head below were rechecked for this
handoff and remain unchanged. No Engine build, model benchmark or deployment
was performed while publishing these instructions. Standard test results must
not be reported as Engine or model qualification.

## 1. Baselines and readiness

| Repository | Inspected baseline | Meaning |
| --- | --- | --- |
| [GKOS Standard](https://github.com/Odenknight/GKOS-standard) | `2d62b1d3b6d19aeb45477045c1fb5e2be842e76b` | Basis for the authority/layer analysis. New classifier grants remain proposals. |
| [TypeScript Engine](https://github.com/Odenknight/GKOS-Engine) | `0a39e3420085c9e4e1f833ee905945b23eb15736` | Current main inspected; package source version 2.2.0. This is not a claim about the current npm release. |
| [Rust Engine main](https://github.com/Odenknight/GKOS-Engine-Rust) | `0c4f454590297ae49b5bf58e5bb0097e6cb14f9d` | Default-branch bootstrap state; do not advertise it as an implemented classifier engine. |
| [Rust draft PR #18](https://github.com/Odenknight/GKOS-Engine-Rust/pull/18) | `e8b6bb4f9fd620e8e0c69af29bd6bc2fa826cb73` | Development workspace under `rust/`; qualification pending and not merged when checked. |

Use pinned detached checkouts to reproduce this review. Create an implementation branch only after the baseline is established. Updated heads require checking current instructions and requalification. Follow repository AGENTS.md and owner decisions in the checkout before editing.

## 2. Build the existing TypeScript baseline

The package permits Node 22, 24, or 26 major ranges as declared in `engines`; Node 24 is the documented development choice. Use npm 10 or newer, the checked-in lockfile, and a clean checkout. [Pinned package.json](https://github.com/Odenknight/GKOS-Engine/blob/0a39e3420085c9e4e1f833ee905945b23eb15736/package.json)

```bash
git clone https://github.com/Odenknight/GKOS-Engine.git gkos-engine-ts
cd gkos-engine-ts
git checkout --detach 0a39e3420085c9e4e1f833ee905945b23eb15736
node --version
npm --version
npm ci
npm run build
npm run typecheck
npm test
```

Existing read/assessment CLI examples, after a successful build:

```bash
node bin/gkx.mjs validate /absolute/path/to/copied-notes
node bin/gkx.mjs assess /absolute/path/to/copied-notes
node bin/gkx.mjs graph /absolute/path/to/copied-notes -o graph.json
node bin/gkx.mjs index --kb-path /absolute/path/to/copied-notes --strict
```

Use a fixture vault or copied notes for implementation work. These commands do not install the proposed classifier or activate a writer. Consult the [README](https://github.com/Odenknight/GKOS-Engine/blob/0a39e3420085c9e4e1f833ee905945b23eb15736/README.md) for the baseline command surface.

For changes touching the existing intelligence and navigation boundaries, run the relevant existing suites:

```bash
npm run test:intelligence
npm run test:navigation
```

At the repository's qualification/release gate, use the existing scripts and declared environment:

```bash
npm run qualify:current
npm run pack:check
```

Do not interpret a local unit-test pass as Standard conformance or release authority.

## 3. Build the Rust development baseline

These instructions target the inspected **draft PR**, not a released Rust engine. The workspace uses edition 2024, a declared minimum Rust version of 1.85, and a checked-in toolchain pin of **1.98.0**. Use the pin, not merely the minimum. The workspace Cargo.toml is in `rust/`. [Workspace manifest](https://github.com/Odenknight/GKOS-Engine-Rust/blob/e8b6bb4f9fd620e8e0c69af29bd6bc2fa826cb73/rust/Cargo.toml), [toolchain](https://github.com/Odenknight/GKOS-Engine-Rust/blob/e8b6bb4f9fd620e8e0c69af29bd6bc2fa826cb73/rust/rust-toolchain.toml)

```bash
git clone https://github.com/Odenknight/GKOS-Engine-Rust.git gkos-engine-rust
cd gkos-engine-rust
git fetch origin refs/pull/18/head:refs/remotes/origin/review-pr-18
git checkout --detach e8b6bb4f9fd620e8e0c69af29bd6bc2fa826cb73
cd rust
rustup toolchain install 1.98.0 --profile minimal --component rustfmt --component clippy
rustc --version
cargo build --workspace --locked
cargo test --workspace --locked
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
```

If the pinned compiler or dependencies cannot be obtained, record the blocker; do not silently update pins to make the build pass. Commands above are the expected workspace build sequence; this review did not execute them or establish that the draft PR passes them.

The inspected walking-skeleton decision documents directory validation and differential testing:

```bash
cargo run -p gkx-cli -- validate /absolute/path/to/fixture-directory
cargo xtask differential --surface validate --fixture minimal
```

The differential harness requires its declared oracle/dependency setup. Preserve its pinned TypeScript oracle, `8207958047b3361ae21ac07c5a2abbd26a42a684`, rather than replacing it with current main. Follow the checkout's owner instructions for provisioning. Capture raw stdout, stderr and exit status without normalization. A classifier extension needs a separately versioned fixture catalog; it must not redefine the existing parity oracle. [Walking-skeleton decision](https://github.com/Odenknight/GKOS-Engine-Rust/blob/e8b6bb4f9fd620e8e0c69af29bd6bc2fa826cb73/docs/decisions/0013-walking-skeleton-directory.md)

## 4. Existing integration points—extend, do not bypass

TypeScript already includes an optional Python/DSPy proposal-only intelligence sidecar. Its documented contract is `gkos.intelligence.v1`, with `GET /health` and `POST /v1/proposals`. It does not write notes and is not imported into the deterministic Engine. Authentication configuration currently includes an optional `GKOS_INTELLIGENCE_TOKEN`; protected deployments of the proposed worker should require authenticated, authorized processing. [Sidecar README](https://github.com/Odenknight/GKOS-Engine/blob/0a39e3420085c9e4e1f833ee905945b23eb15736/services/gkos-intelligence/README.md)

The current `src/intelligence.ts` validates proposal types and safe patch fields. Generic `tags` are not an allowed patch field. The proposal shape requires a rationale and numeric confidence; authority-looking fields are rejected. Validation is not acceptance. Thus a new model cannot simply send frontmatter tags or an approved disposition through v1 and expect support. [Existing validator](https://github.com/Odenknight/GKOS-Engine/blob/0a39e3420085c9e4e1f833ee905945b23eb15736/src/intelligence.ts)

Keep v1 unchanged and regression-tested. Add a distinct experimental evaluation contract, adapter, and fixtures. Do not force a model with no calibrated probability to fabricate a confidence value just to satisfy v1. A deterministic explanation template can describe the task, evidence and mapping without inventing a model rationale.

The Engine also exposes governance, retrieval, admission-policy, Graphiti, navigation, and experimental navigation-effects entry points. Navigation remains read-only; managed effects have explicit boundaries. Existing managed-MOC write machinery provides useful patterns but is not evidence that an arbitrary protected frontmatter writer is authorized or complete. [Package exports](https://github.com/Odenknight/GKOS-Engine/blob/0a39e3420085c9e4e1f833ee905945b23eb15736/package.json)

## 5. Shared contract first

Before implementation, define a local draft namespace, for example `org.oden.gkos.classifier.experimental.v1`. This string is illustrative, not an allocated GKX standard identifier. Negotiate extension support; reject unknown authority/effect semantics. Keep native GKX object and receipt bindings in the adapter, rather than claiming the draft payload is already a standard GKX record.

### Required logical records

| Record | Required content | Authority meaning |
| --- | --- | --- |
| EvaluationRequest | Request/task IDs, tenant/purpose, object ID/revision, exact input and relevant metadata digests, authorized evidence refs, option schema, template/configuration digest, limits. | Permission to process only the specified inputs, under a separate processing authorization. |
| EvaluationRecord | Request binding, model/tokenizer/adapter/runtime identity, configuration and qualification ref, execution status, typed output, evidence refs, raw score semantics if present, observed timestamp. | Attributable evidence, not an acceptance. |
| MatrixEvaluation | Evaluation ref, matrix and gate-set digests, matching rule IDs/hit policy, proposed outcome, failed/unknown predicates. | Deterministic evaluation result, not a self-issued grant. |
| DecisionRecord binding | Proposal/evidence/manifest refs, authorized reviewer and grant/lease, independence proof where required, evaluated/effective disposition, escalation. | Existing L5 role only when all applicable requirements pass. |
| PatchProposal | Exact target revision, permitted field operations, expected prior values/digests, evaluation and decision references. | Request for a scoped mutation. |
| EffectReceipt binding | Admission result, current authority and context, pre/post digests, actual operations, outcome, journal/recovery reference. | Evidence of an admitted effect or refusal. |

Keep time, request IDs and record IDs explicit in deterministic test inputs. Never require two fresh independent runs to generate the same wall-clock timestamp or random ID.

Illustrative TypeScript domain type—not a drop-in existing Engine API:

```ts
type EvaluationStatus =
  | "ok" | "abstain" | "invalid" | "unavailable" | "stale";

type CapturedEvaluation = {
  contract: "org.oden.gkos.classifier.experimental.v1";
  evaluationId: string;
  requestDigest: string;
  objectId: string;
  objectRevision: string;
  evidenceDigest: string;
  taskSchemaDigest: string;
  qualifiedConfigurationDigest: string;
  status: EvaluationStatus;
  output?: { label: string; evidenceRefs: string[] };
  scores?: {
    semantics: "option_softmax" | "calibrated_probability" | "other";
    byLabel: Record<string, number>;
    calibrationRef?: string;
  };
};
```

Require schema validation at the boundary; compile-time types alone do not validate network JSON. Reject nonfinite numbers, out-of-schema labels, duplicate keys where the parser can otherwise obscure ambiguity, unsupported versions, missing mandatory evidence, and score vectors incompatible with their declared semantics. If normalized probabilities are required, specify a shared numeric tolerance and canonical representation.

### Frontmatter projection

Illustrative extension fields, not current native GKX keys:

```yaml
x_oden_classifier:
  schema: experimental-v1
  managed_tags:
    - document/invoice
  evaluation_ref: eval-000123
  decision_ref: decision-000456
  projection_state: accepted
```

Only emit `accepted` after the authorized decision exists. Pending suggestions should live in the sidecar/proposal store unless the policy explicitly permits a clearly marked pending projection. Do not create a second authoritative `disposition` field that can disagree with the Decision Record. Retain the normal identity and human-authored fields using the existing schema.

## 6. Proposed TypeScript implementation layout

These paths are **new proposals**, not files confirmed to exist:

```text
src/classifier/contracts.ts       # schema-facing domain types
src/classifier/validate.ts        # strict boundary validation
src/classifier/matrix.ts          # pure deterministic rule evaluation
src/classifier/reuse.ts           # dependency/freshness predicates
src/classifier/patch.ts           # minimal patch proposal, no I/O
src/classifier/index.ts          # pure public surface if approved
src/classifier-node/worker.ts     # authenticated worker transport
src/classifier-node/store.ts      # immutable evaluations and dependency index
src/classifier-node/writer.ts     # separately admitted managed effect
```

Implementation sequence:

1. Define shared JSON schemas and fixtures in a contract package/catalog with an explicit owner. Mark them experimental and non-qualifying until approved.
2. Implement pure evaluation validation and matrix evaluation. Inputs include captured evidence, policy and controlled time; output contains rule matches and non-accepting reasons as well as proposed outcomes.
3. Add a proposal-only adapter for one classifier. Restrict input size, task IDs, timeout, allowed endpoint, model revision and processing boundary. Do not allow note text to select tools, policies or endpoints.
4. Implement durable evaluation storage and a dependency index. Reuse checks must include tenant/purpose and access boundaries, not just content hashes.
5. Integrate with the existing authorized review/admission abstractions. Represent unsupported general disposition capability as unavailable, not as permissive defaults.
6. Add a separately authorized frontmatter writer only after its contract is activated. Keep Node I/O out of the pure entry point and preserve read-only navigation/MCP behavior.
7. Add an explicit operator-facing preview showing proposed field changes, evidence, matrix rule and decision/effect state. Do not expose implementation secrets or sensitive content in logs.

Proposed commands such as `gkx classify` or `gkx apply-classification` are intentionally not presented as executable commands. Design and approve the CLI surface after the contracts exist.

## 7. Proposed Rust implementation ownership

Use the development workspace's separation of responsibilities rather than embedding model runtime dependencies throughout the core. A new crate is optional; choose it only if the existing package ownership rules permit it.

| Concern | Suggested ownership in inspected workspace | Constraint |
| --- | --- | --- |
| Exchange parsing and typed validation | `gkx-core` plus approved extension module | No model invocation during parsing. |
| Canonical digests | `gkos-canonical` | Match the declared shared serialization and number rules. |
| Matrix, authority and reuse predicates | `gkos-govern` | Pure captured-input evaluation; no authority minting. |
| Worker protocol/transport | `gkos-protocols` / `gkos-service` | Bounded authenticated processing; isolate effects. |
| Evaluations and dependency index | `gkos-store` | Preserve revisions and tenant/purpose isolation. |
| Decision/effect evidence | `gkos-receipts` | Append-only and exact-bound; no invented acceptance. |
| Selection evidence | `gkos-retrieval` | Enforce restrictions before presentation. |
| Portable fixtures | `gkos-conformance` and existing `xtask` harness | New extension catalog, preserving the baseline oracle. |
| CLI integration | `gkx-cli` | Explicit capability preflight and dry-run/proposal mode. |

These are recommended ownership assignments, not claims that each crate already implements the proposed behavior. Inspect crate contracts and owner decisions before changing interfaces.

Use Serde types plus runtime schema/semantic validation. Prefer enums for status and outcome. Do not treat an unknown enum value as `ok`. Keep authority, evaluation and effect types distinct so an EvaluationRecord cannot accidentally satisfy a function expecting admitted authority. Follow workspace unsafe-code prohibition and lint policy.

The worker can be shared by Rust and TypeScript over the same captured-message contract. Both engines should be able to replay fixtures without downloading model weights. A native inference integration is optional and must preserve the same boundary.

## 8. Conditional matrix execution algorithm

1. Verify request scope, authorized processing and all input bindings.
2. Check evaluation status, schema, evidence completeness and qualified configuration.
3. Run mandatory deterministic gates; preserve registered refusal semantics.
4. Evaluate the versioned matrix with its explicit hit policy. No match or ambiguous match becomes HOLD.
5. Check whether the proposed result is an assertion, metadata proposal, or a disposition requiring the activated review capability.
6. For an automated review, verify the independent reviewer, current grant/lease, sealed packet and mandatory escalation triggers. Different model names are not sufficient evidence of different model families.
7. Append the decision through the existing role contract; record evaluated versus effective outcome.
8. For a mutation, recheck admission at effect time, including current target revision, restrictions, authority, and decision/context bindings.
9. Apply only the admitted patch, journal/recover, and append outcome or refusal.

Do not silently collapse steps 6–9 into an `if confidence >= threshold` assignment.

## 9. Reuse and mutation mechanics

Maintain two different revision concepts: an exact file revision/hash for safe writes, and a semantic-input digest excluding only explicitly managed generated fields. Relevant human metadata, sensitivity, evidence and task configuration remain dependencies. Watchers should recognize their own committed patch and avoid scheduling redundant work; external edits always get a fresh revision check.

For accepted patching, preflight the exact allowed fields and operations, compare-and-swap the expected revision, write through the approved managed-effect mechanism, and journal intent/outcome. On crash recovery, reconcile the journal and file state before retrying. Do not assume filesystem rename alone supplies multi-file transactional semantics. Bound symlink/path handling and trust the object identity resolver, not user-provided arbitrary paths.

An unchanged note can reuse a valid evaluation. A new export, payment, analysis run or external send still requires a new current effect-admission check. Historical dispositions stay append-only even when superseded or no longer reusable.

## 10. Meaningful qualification fixtures

| Fixture family | Positive case | Negative case / expected protection |
| --- | --- | --- |
| Schema | Valid captured label/evidence packet | Unknown label, malformed score, unsupported contract → reject. |
| Policy | One valid rule match | No match or conflicting rules → HOLD. |
| Authority | Exact active grant/lease | Expired, revoked, wrong scope or wrong issuer → refuse. |
| Independence | Qualified distinct-family reviewer | Same-family proposer/reviewer or unknown lineage → human escalation. |
| Evidence | Exact revision and authorized references | Changed source, missing spans, stale manifest → no application. |
| Sensitivity | Authorized restriction tightening | Low risk score attempting access expansion → block. |
| Reuse | Unchanged eligible dependencies | Different tenant/purpose or changed policy/evidence → invalidation/refusal. |
| Writer | Admitted minimal managed-field patch | Concurrent human edit, protected field, path escape → no overwrite. |
| Recovery | Completed journal matches output | Interrupted write → reconcile without duplicate effect. |
| Disclosure | Authorized internal processing | Sensitive result in unauthorized logs/metrics/context → fail boundary test. |
| Model outage | Explicit abstention/timeout | No permissive default or fabricated label. |
| Parity | Identical captured inputs and fixed receipt metadata | Canonical outputs/exit behavior differ → parity failure. |

Model qualification is separate: use operator-labeled held-out notes, including difficult negatives and unsupported inputs, stratified by task/language/source type. Evaluate precision and recall for each consequence, calibration where used, abstention coverage, false acceptance, restriction misses, and reviewer overrides. Select thresholds from this evidence and the permitted error budget; do not choose arbitrary 0.85/0.15 bands as a universal standard.

Fresh-inference tests report variability rather than pretending universal bitwise identity. Pin model weights, tokenizer, option encoding, adapter, prompt/template, precision, runtime, hardware and relevant kernels. Test truncation explicitly; a long-context claim does not guarantee that required evidence was retained.

## 11. Delivery stages and completion gates

| Stage | Deliverable | Exit condition |
| --- | --- | --- |
| 0: contract | Extension schemas, matrix schema, ownership, authority decision draft | Standard/Engine owners identify exact supported capability and exclusions. |
| 1: replay | Pure TS/Rust validators and matrix evaluators | Shared positive/negative fixtures agree on controlled inputs. |
| 2: shadow | One local classifier worker, immutable evaluations, no writes | Task quality and processing boundary meet declared pilot requirements. |
| 3: reuse | Dependency index and selective reassessment | Stale/cross-scope reuse fails; repeated checks demonstrably reduced. |
| 4: managed tags | Preview, authorized decision path, bounded writer on copies | Field ownership, CAS, refusal and recovery fixtures pass. |
| 5: bounded disposition | Activated grant and independent review lane | Required contracts, portable evidence, escalation and activation complete. |
| 6: integrations | Business/legal/science adapters | Each external effect separately admitted and evidenced. |

Use normal repository review and release gates. This document does not authorize merging, publishing, deploying, or claiming conformance. It supplies the concrete build and implementation plan requested.

## Disposition Sidecar draft assessment incorporated

The later user-supplied Disposition Sidecar proposal is assessed in [GKOS-Disposition-Sidecar-Upgrade-Assessment.md](GKOS-Disposition-Sidecar-Upgrade-Assessment.md). Its corrected authority attribution, preset semantics, non-overlapping bands, anti-replay and request-isolation requirements, per-record disposition, and managed-effect boundaries are part of this upgrade plan. The supplied GKX 2.3 header and fleet placement are not treated as validated.
