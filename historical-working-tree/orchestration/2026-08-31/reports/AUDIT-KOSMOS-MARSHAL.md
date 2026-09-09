# Kosmos-Oden and Marshal Core Rust: source and unmerged-work audit

Audit date: 2026-08-31. Snapshot metadata was recaptured at 17:46:30Z–17:46:35Z.
Priority order: Stability > Reliability > Fidelity.
Standing: read-only repository assessment plus isolated local builds and synthetic tests. No remote branch, commit, PR, comment, deployment, provider enrollment, source-vault access, or writer activation was performed.

## Executive determination

**Do not treat theMarshal-Core-Rust as a Rust implementation of GKOS-Engine.** It is a distinct, private, non-authoritative Marshal Core upstream: strict MARSHAL-CBOR-1 canonicalization, EVD-002 validation, separate lifecycle state machines, durable-continuity pure decisions, read-only verification, and a PyO3 Python ABI. It has no GKOS parser/index, TS/Node bridge, browser/WASM bridge, product runtime, database writer, or appointed execution authority.

Kosmos-Oden is already a substantial TypeScript product consumer with a shared exact-pinned GKOS Engine. Current main passes the audit's complete ordinary verification suite (283/283) and the selected Chromium browser suite (13/13). Navigation Effects are an integration foundation, not a functional writer: both host adapters fail closed, adoption persistence is in-memory/reference-only, the modal is not wired into the production plugin, and automatic maintenance/creation remain unavailable.

The largest recoverable unmerged Kosmos work is the v0.85 branch. Some of its observability already reached main through other commits; its unique Tauri/proposal/coordinator code must be reconciled selectively. Blanket merging would collide with substantially stronger current Effects contracts and revive obsolete pins/claims. Marshal's unmerged G1 branch is contracts/docs only, with unresolved provider/identity choices and explicitly disclosed evidence-quality limitations.

## 1. Scope, instructions, preservation, and immutable inventory

Isolated clones:

- `orchestration/2026-08-31/product-audit/Kosmos-Oden`
- `orchestration/2026-08-31/product-audit/theMarshal-Core-Rust`

No AGENTS.md was found in either clone using `rg --files -g AGENTS.md`; no ancestor AGENTS.md existed at the checked drive/users/FAC/Documents/_AI_builds_GPT/workspace levels. Repository contribution/security/governance documents were inspected. Historical work packets describe their own authorization and do not authorize this audit to mutate upstream or activate anything.

The user's root worktree was already dirty; it was not altered. Local audit clones retain build products. Kosmos tracked and untracked status was clean after tests (generated products are ignored). Marshal retained only test-generated `tests/python/__pycache__/` as untracked; no source changes.

Complete branches, tags, releases, and all open PR coordinates are in [AUDIT-KOSMOS-MARSHAL-LEDGER.json](AUDIT-KOSMOS-MARSHAL-LEDGER.json). REST returned fewer than 100 entries for every list, so no pagination remained.

| Repository | Default branch and audited SHA | Visibility | Version / release standing |
| --- | --- | --- | --- |
| Kosmos-Oden | main, `6486035dfc2e42173b1158b8007c9bab35aa7dc9` | Public | package/manifest 0.8.0; latest public release 0.7.0, published 2026-07-27 |
| theMarshal-Core-Rust | main, `a5f1d0d6975e25748d72d073cfb61858bc93297a` | Private | workspace 0.0.1; zero tags and zero GitHub releases |

Kosmos has eight tags and seven releases. The release 0.7.0 tag is recorded in the JSON ledger with its resolved commit. No 0.8.0 release exists. Exact pins are not themselves release qualification.

Kosmos [package.json L54](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/package.json#L54) pins `gkos-engine` to `41172b91970aac869c161f4842e3526a62fd1fd9` (installed package version 2.1.2). Its lock guard intentionally identifies this as a development-only Effects commit. `engineReleaseTarget: "2.2.0"` is a target in the adapter, not a shipped Engine version.

## 2. Actual Kosmos functionality and ownership

### Shared engine and ordinary product functions

The build rebundles the external `gkos-engine` package into a shared test/CLI artifact; product code imports that package for graph parsing, GKX projection, lineage, temporal projection, Graphiti preparation, and Navigation. There is not a second current `src/core/` semantic engine in Kosmos.

Implemented product surfaces include:

- Obsidian plugin, offline standalone HTML, shared Three r185/WebGL2 renderer, and one graph interpretation.
- Incremental VaultDataProvider using the external GkxIndex, host event updates, temporal projections, and source-content-read-only Navigation classification.
- Read-only REST and MCP queries with sensitivity filtering, bearer authentication, Host/Origin checks, request/output bounds, session lifecycle, and per-agent fairness.
- First-party stdio-to-HTTP MCP adapter preserving session/version headers.
- Loopback standalone-service capability negotiation and graph fetch, bounded retained traffic recording/replay, authenticated traversal events with session-aware resume.
- Separate opt-in authoring/formatting, reviewed enrichment/conversion, portable timestamps, and Nextcloud WebDAV sync. Those plugin features can write source files; the blanket phrase “Kosmos is read-only” would be false. Ordinary viewing, Agent API, and browser directory scanning remain read-only.
- Nextcloud synchronization is independent of API sensitivity filtering; the settings explicitly warn that all in-scope notes are transmitted irrespective of that read ceiling. No real sync/provider run occurred in this audit.

Source anchors:

- [build and external engine rebundling](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/scripts/build.mjs#L63)
- [read-only Navigation product adapter](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/navigation-integration.ts)
- [Vault index consumer](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/plugin/vault-provider.ts)
- [plugin traversal callback](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/plugin/main.ts#L394)
- [service capability schema and fail-closed negotiation](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/standalone/api-feed.ts#L128)
- [MCP/REST implementation](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/plugin/agent-server.ts#L984)
- [stdio bridge](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/kosmos-mcp-stdio.mjs)

Important protocol separation: the Obsidian embedded Agent API is not automatically the standalone `gkos-local-service/1.0.0-draft.1` service. The standalone requires exactly shaped `/capabilities` and `/graph` responses plus feature flags; the embedded server exposes its own routes and callback-based traversal to iframe views. Do not advertise these as interchangeable endpoints without an explicit adapter/integration test.

MCP `clientInfo.name` and fallback User-Agent drive display/fairness identity, not authenticated effect authority. Engine/Kosmos grant resolution must remain credential-bound separately.

### Navigation Effects: precisely what exists

| Plane | Current source | Actual standing |
| --- | --- | --- |
| Settings migration | strict schema, bounded debounce/reconciliation values, fixed operational roots, false write defaults | Implemented; no automatic runtime |
| Policy/authority | exact policy identity/digest; grant, actor/credential, vault/root, operation/class, sensitivity and expiry checks | Pure integration boundary, not a production grant issuer |
| Engine adapter | framework-neutral experimental capability projection | Hard-coded currentEffectAuthorized=false; automatic flags=false |
| Adoption | digest-bound preview/registry/receipt validation, in-memory atomic generation store | Reference/test implementation, no durable production store |
| Adoption modal | freshness check, phrase confirmation, focus restoration, fail-closed absence/staleness | Implemented and browser-tested but not imported/wired by plugin main/settings |
| Obsidian host | complete unavailable adapter descriptor | All operations return unavailable; filesystem safety/durability primitives unproven |
| Native host | unavailable descriptor, no Engine Node executor import | No prepare/execute/recovery/rollback/shutdown implementation |
| Coordinator/recovery/status/audit UX | qualification plan and some pure helpers | Full host runtime not implemented/qualified on main |

Anchors:

- [Engine adapter authority flags](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/navigation-effects/engine-adapter.ts#L51)
- [credential-bound grant resolution](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/navigation-effects/authority-provider.ts#L276)
- [in-memory reference store](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/navigation-effects/in-memory-adoption-store.ts#L10)
- [unavailable Obsidian adapter](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/navigation-effects/obsidian-effect-adapter.ts#L91)
- [unavailable native adapter](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/navigation-effects/native-effect-adapter.ts#L116)
- [trusted modal boundary](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/ui/moc-adoption-modal.ts#L18)
- [full qualification requirements](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/docs/navigation-effects/QUALIFICATION-PLAN.md)

The Packet C0 working-result document says “working-tree” and the handoff says “feature branch/no merge”; these are historical receipts now contained in merged main. Preserve the historical text and add a dated current status, rather than treating those old labels as proof the code remains unmerged. PR #34 is already in audited main.

## 3. Kosmos unmerged work: disposition, not blanket merge

All four current open PRs are drafts. API base SHA means the PR's reported comparison base, not the current main HEAD.

| PR | Head SHA | Reported base SHA | Meaningful diff / disposition |
| --- | --- | --- | --- |
| #23 Adopt GKOS-Engine v1.1.3 and repair lock integrity | `096b92ad896268ef41cafda2542e4c2280ff70fe` | `8572312bba98b2e6cadef0b71577472570bc49a0` | 34 behind / 5 unique. Old v1.1.3 pin is obsolete; useful lock root/dependency consistency checks already exist on main. Release pre-install checks can be considered independently, not merged with downgrade. |
| #27 Align KRS with GKX ecosystem authority | `a326f7e9b72e278d996ab8276284ff7e10c1f666` | `0d46e88b35fd87897c19538d584e23fbda6d4f77` | 28 behind / 1 unique. Naming edits span now-renamed okf files; compare semantics/copy with main, no blind merge. |
| #28 Clarify GKX naming and exact Engine pin | `eb8486aa4c7c51b0c63869a4139c748c69b63745` | `f52ee9e7730f292619e5cc5220e19be87d98973b` | 21 behind / 1 unique. README/package-description clarification tied to older pin; rewrite only still-correct copy. |
| #29 Standardize all branding on Kosmos-Oden | `1bbbc541f4b38d66fe646f72fee5d50bff60eb43` | `8147bda5da14306710103d0490ebcae11b8e42fc` | 20 behind / 3 unique. 41 files; not branding-only: qNote assessment response is reduced to concise verdict/policy identity and tool copy/test changes. Requires explicit response compatibility decision. |

Open PR URLs are in the ledger; title and head were checked via REST. Meaningful `git diff main...head` code and tests were inspected, not just PR descriptions.

### Highest-value unmerged branch

`feature/kosmos-standalone-v0.85` at [50ebc3c168cf4e34137faf47e0b297b00db1a753](https://github.com/Odenknight/Kosmos-Oden/tree/50ebc3c168cf4e34137faf47e0b297b00db1a753): 18 commits behind / 18 unique, 54 changed files versus merge base. Contains:

- Tauri desktop source and sidecar supervisor (five bounded restart attempts, explicit stop/reconnect/shutdown, private state-root intent), portable staging and checksums.
- Immutable proposal quarantine and human decision records, exact source/proposal hashes, pending status and explicit non-automatic approval.
- Event coalescing, receipt-bound self-write suppression, corrupt-state-blocking reconciliation decisions.
- Traffic heat and replay; portions already present on main, so branch uniqueness is not equivalent to feature absence.
- Historical Windows/Debian qualification ledgers with explicit F1/cross-platform/runtime gaps. These remain historical, not audit reruns.

Examined [proposal types](https://github.com/Odenknight/Kosmos-Oden/blob/50ebc3c168cf4e34137faf47e0b297b00db1a753/src/plugin/gkx-proposals.ts), [sidecar source](https://github.com/Odenknight/Kosmos-Oden/blob/50ebc3c168cf4e34137faf47e0b297b00db1a753/src-tauri/src/sidecar.rs), [self-write matching](https://github.com/Odenknight/Kosmos-Oden/blob/50ebc3c168cf4e34137faf47e0b297b00db1a753/src/navigation-effects/self-write-suppression.ts), [reconciliation](https://github.com/Odenknight/Kosmos-Oden/blob/50ebc3c168cf4e34137faf47e0b297b00db1a753/src/navigation-effects/reconciliation.ts), and [qualification ledger](https://github.com/Odenknight/Kosmos-Oden/blob/50ebc3c168cf4e34137faf47e0b297b00db1a753/docs/standalone/QUALIFICATION.md).

**Collision warning:** its 29-line authority-provider only validates operation/target, actor IDs, digest shape, and optional expiry. Main's newer provider binds policy, credential, vault, approvedBy, root, operation, object class, sensitivity and expiry. Its Effects types/settings must not overwrite main. Reuse coordinator ideas after adapting to current contracts; do not reuse old grant validation as authority.

Tauri Rust is a product shell, not a Rust GKOS semantic migration, and not Marshal Core. The branch's desktop executable/runtime was not tested by this audit. Its documented “Cargo test-build passed” is not executable-runtime qualification.

Other refs:

- `feature/kosmos-standalone-qualified`: 14 behind / 0 unique; already ancestral to main.
- `feature/navigation-effects-reconciliation-20260827`: 1 behind / 0 unique; merged.
- `docs/modernize-readmes-20260826`: 13 behind / 0 unique; merged.
- Old graphics/branding/roadmap branches have unique historical commits; no user-visible active functionality should be inferred without endpoint diff reconciliation. The JSON ledger records their exact heads.

## 4. Marshal Core: authoritative boundaries established from code

### Implemented and tested

- `marshal-core-canonical`: bounded strict canonical CBOR encode/decode/verify, NFC validation with pinned Unicode data, no floats, deterministic ordering, domain-separated EVD digest.
- `marshal-core-contracts`: distinct component and runtime lifecycle types/matrices, revision and refusal invariants; durable-root/state-class/receipt contracts.
- `marshal-core-evidence`: typed EVD-002 metadata/record validation; candidate sealing; chain/predecessor/digest verification. Candidate construction is not authorized persistence.
- `marshal-core-runtime::continuity`: pure decision on caller-supplied normalized paths/root observations. It does not discover the filesystem or execute the operation.
- `marshal-core-verify::continuity`: read-only structural verification of supplied records/bytes.
- `marshal-core-python`: ABI `marshal-core-python/2`, profile `MARSHAL-CBOR-1`, evidence `EVD-002`, continuity `DURABLE-CONTINUITY-v1`, runtime_authority=false, writer_authority=false. Python facade rejects absence/mismatch without semantic fallback.

Anchors: [canonical functions](https://github.com/Odenknight/theMarshal-Core-Rust/blob/a5f1d0d6975e25748d72d073cfb61858bc93297a/crates/marshal-core-canonical/src/lib.rs#L76), [typed EVD validation](https://github.com/Odenknight/theMarshal-Core-Rust/blob/a5f1d0d6975e25748d72d073cfb61858bc93297a/crates/marshal-core-evidence/src/lib.rs#L199), [continuity decision](https://github.com/Odenknight/theMarshal-Core-Rust/blob/a5f1d0d6975e25748d72d073cfb61858bc93297a/crates/marshal-core-runtime/src/continuity.rs#L79), [ABI identity](https://github.com/Odenknight/theMarshal-Core-Rust/blob/a5f1d0d6975e25748d72d073cfb61858bc93297a/crates/marshal-core-python/src/lib.rs#L105), [fail-closed facade](https://github.com/Odenknight/theMarshal-Core-Rust/blob/a5f1d0d6975e25748d72d073cfb61858bc93297a/python/marshal_core_rs/__init__.py#L8).

### Deliberately not implemented or appointed

`require_sole_writer` always returns `NotAppointed`: [authority L49](https://github.com/Odenknight/theMarshal-Core-Rust/blob/a5f1d0d6975e25748d72d073cfb61858bc93297a/crates/marshal-core-authority/src/lib.rs#L49). Runtime dispatch is not implemented. Policy is an Unevaluated/default enum, not a PHI classifier or full policy engine. Secret code only recognizes an opaque reference prefix; it is not a secret vault. SDK code enumerates G-M1..G-M12 strings; it is not conformance completion. No PostgreSQL dependency/writer, lifecycle writer, external checkpoint publication or production cutover exists.

The current continuity work packet explicitly forbids filesystem/process/network/clock/randomness/SQL/effect ownership and says Python retains Platform/runtime and every writer/effect owner. The generic architecture's future sole-Rust authority is prospective, not a contradiction to be “fixed” by enabling authority.

Historical Python/JCS evidence is preserved as non-production reference. The candidate greenfield Rust authority generation is `rust-authority-gen-1`, requiring exact-head owner appointment, with no Python production chain migrated by assumption.

### Protocols must not be conflated

[MARSHAL-CBOR-1](https://github.com/Odenknight/theMarshal-Core-Rust/blob/a5f1d0d6975e25748d72d073cfb61858bc93297a/specifications/MARSHAL-CBOR-1.md) identifies itself as a strict GKX-CBOR-1 subset. Shared ancestry does not imply identical accepted values or digest identity:

- Marshal forbids every float, including finite values. Kosmos proposals contain confidence numbers and product JSON; those are not automatically Marshal canonical records.
- EVD digest preimage is UTF-8 `marshal-core`, `evd-002`, `entry`, `v1`, each followed by one zero byte, then `u64_be(length) || canonical_bytes`; no GKX/Kosmos hash may be substituted.
- Marshal state machines, diagnostics and ABI identities are their own contracts.
- `DURABLE-CONTINUITY-v1` contract and `harness/durable-continuity-envelope/v1` schema are intentionally distinct. New G1 `marshal/.../v0.3.2-candidate.1` identities are additional candidates, not silent renames of the implemented schema.
- Source-authority register still records unavailable exact MSDK-1 source and final qualification blocked pending reconciliation.

The [upstream consumer model](https://github.com/Odenknight/theMarshal-Core-Rust/blob/a5f1d0d6975e25748d72d073cfb61858bc93297a/docs/UPSTREAM-CONSUMER-MODEL.md) requires exact revisions/contracts/license/qualification, disabled integration until qualified, no copied semantics, fail-closed mismatches, and separate owner licensing/consumer decisions. The only registered downstream in [DOWNSTREAM-CONSUMERS.md](https://github.com/Odenknight/theMarshal-Core-Rust/blob/a5f1d0d6975e25748d72d073cfb61858bc93297a/docs/DOWNSTREAM-CONSUMERS.md) is Marshal-008 OS, disabled exact-revision shadow adapter; this audit did not inspect that consumer's pin contents and does not assert its current SHA.

## 5. Marshal unmerged work

### Open PR #7

[docs: document Core capabilities and Rust rationale](https://github.com/Odenknight/theMarshal-Core-Rust/pull/7), not draft; head `bfe491ace8b716529ec19c7ec8c2f9cd54254d68`, reported base `09fda7107223642be895036922d2813a1663fff0`; 3 behind / 2 unique, two files, 330 additions/21 deletions. Connector reported mergeable=false.

The diff is README plus a work-packet YAML, not executable code. It describes pre-continuity Stage 1 (27 Rust tests/ABI-v1) and must be reconciled with current ABI-v2, 40 tests, durable continuity and the upstream consumer model. Old qualification may remain quoted as historical. Do not overwrite new architecture/consumer facts with the old README.

### Unmerged G1 contracts branch

`work/v032-g1-contracts-enrollment-20260829` at [8c7c7184ea3fa215a348c763e2d2680cda7b3a89](https://github.com/Odenknight/theMarshal-Core-Rust/tree/8c7c7184ea3fa215a348c763e2d2680cda7b3a89) is main+10, with no open PR. Five docs/fixture/contract files, 396 added lines; zero Rust/runtime source changes.

Five candidate contracts: continuity envelope, artifact receipt, GKX snapshot reference, storage-authority boundary, governed decision. Only the portable GKX reference is GKX semantics; execution/storage/decision authority stays Marshal-owned. Storage fields are literal Marshal owner, read-only source mount, canonical mutation forbidden. Evaluated authorization, effective authorization, review requirement and workflow disposition stay separate; evaluated ALLOW can reduce to effective DENY, not vice versa.

[Contract registry](https://github.com/Odenknight/theMarshal-Core-Rust/blob/8c7c7184ea3fa215a348c763e2d2680cda7b3a89/specifications/MARSHAL-GKX-G1-CONTRACT-REGISTRY.md) explicitly leaves AP3 identity/nomenclature enrollment, provider choice (Kosmos/grooveseek), adapter, index boundary, exact pins/root identities and owner ratification unresolved. Candidate vectors/CDDL are not executable acceptance tests.

[Session receipt](https://github.com/Odenknight/theMarshal-Core-Rust/blob/8c7c7184ea3fa215a348c763e2d2680cda7b3a89/evidence/g1/CODING_AGENT_A_SESSION_RECEIPT.md) discloses an exact-binary-allowlist deviation before prerequisite inspection. It explicitly disclaims clean G1 gate evidence and requires independent disposition or clean-session reproduction. This does not prove contract content is wrong, but it forbids counting the session as clean acceptance.

All other listed Marshal remote branches are ancestors of main, except stale README and this G1 branch. Preserve exact history; do not restart their already-merged primitive implementation.

## 6. Actual verification commands and results

Host: Windows, Node v24.18.0, npm 10.9.4, Python 3.14.2. Marshal `rust-toolchain.toml` selected Rust/Cargo 1.82.0 (the shell default outside Marshal was 1.98.0; no wrong-toolchain qualification is claimed).

| Command / check | Result |
| --- | --- |
| `git clone https://github.com/Odenknight/Kosmos-Oden.git ...` | First sandbox attempt SEC_E_NO_CREDENTIALS; approved rerun PASS |
| `git clone https://github.com/Odenknight/theMarshal-Core-Rust.git ...` | Approved isolated clone PASS |
| `gh api repos/.../pulls?state=open&per_page=100`, branches/tags/releases | PASS; full machine-readable ledger retained |
| Kosmos `npm ci --ignore-scripts --no-audit --no-fund` | First sandbox attempt EPERM npm cache; approved rerun PASS, 21 packages. No general lifecycle scripts enabled. Installed Engine dist was available. |
| Kosmos `npm run verify` | First sandbox run typecheck PASS, esbuild path read Access denied. Approved exact rerun exit 0: typecheck, full build, 283 tests PASS/0 fail/0 skip, version/lock/artifact/invariant/renderer-provenance checks PASS. |
| Kosmos `npx playwright test --project=chromium test/browser/standalone.spec.ts test/browser/embed.spec.ts test/browser/context-loss.spec.ts test/browser/navigation-effects-adoption.spec.ts` | Exit 0; 13 passed in 22.1s, including actual WebGL context loss/restore and three adoption UI cases. Synthetic fixture server only. |
| Marshal `cargo test --locked --offline --workspace --all-targets` | Exit 0; 40 passed, 0 failed; Rust 1.82.0. |
| Marshal `cargo fmt --all --check` | PASS, no formatting diff |
| Marshal `cargo clippy --locked --offline --workspace --all-targets -- -D warnings` | Exit 0 |
| Marshal `python tools/compare_typed_evd_fixtures.py` | Exit 0; 8 positive and 94 mutation fixtures PASS |
| Marshal `python -m unittest discover -s tests/python -p test_binding_absence.py -v` | Exit 0; 1 pass; native-absence refuses without fallback |
| Both `git diff --check` | PASS |
| Full current native Python binding suite | NOT RERUN; Rust ABI tests and Python absence check passed, historical binding evidence is separate |
| Firefox/WebKit/mobile/visual reference suite | NOT RERUN locally; selected Chromium only |
| Real Obsidian host, source vault, Nextcloud/LLM/provider, desktop runtime, crash/soak matrix | NOT RUN / not authorized by this audit |

Logs were inspected live through tool output; this report records exact commands/results, not fabricated retained raw-log files. Native package rebuilding, release artifacts and additional qualification can be reproduced later at the immutable heads.

Hosted checks read via REST:

- Kosmos exact main CI [33087541550](https://github.com/Odenknight/Kosmos-Oden/actions/runs/33087541550), Browser [33087541234](https://github.com/Odenknight/Kosmos-Oden/actions/runs/33087541234), Security [33392429163](https://github.com/Odenknight/Kosmos-Oden/actions/runs/33392429163): completed success.
- Kosmos full browser matrix [33387927486](https://github.com/Odenknight/Kosmos-Oden/actions/runs/33387927486): completed success at exact main. Workflow conclusion is recorded, not substituted for inspection of every advisory job/skip.
- Marshal exact main CI [33224610536](https://github.com/Odenknight/theMarshal-Core-Rust/actions/runs/33224610536): completed success.
- Marshal README PR head CI [33110230148](https://github.com/Odenknight/theMarshal-Core-Rust/actions/runs/33110230148): completed success at its older content.

Historical Marshal Stage 1 manifest covers ABI-v1/27 tests at `045fea7b92cf27bff70c3ea77cb7f2d8fb4f97c1`; the later continuity evidence records Windows/Linux 1.82 and 40 Rust tests plus 13 Python binding tests on its bound source. Do not combine these into an invented current all-platform release qualification. Current Cargo.lock SHA-256: `f353f4684e75d5f740bd047ae390bca323d0cbb9aa996535456603fb6a43d2ff`.

## 7. Concrete gaps and risk priorities

1. **P1 boundary risk — incompatible Rust destination.** Any plan saying “port GKOS into Marshal Core” needs a separate ownership/contract/license decision. Current Rust code owns Marshal pure semantics only; no automatic upstream substitution is admissible.
2. **P1 release blocker — no functioning Kosmos Effects host.** Packet C0 descriptors and a tested modal are not an end-to-end writer. Preserve unavailable flags until durable host operations, authenticated decisions, startup recovery, reconciliation and selected-platform evidence exist.
3. **P1 integration risk — v0.85 collision.** Use commit/file-specific salvage and contract tests; never replace main Effects authority/settings with historical branch versions.
4. **P2 reliability gap — stream/bridge raw input bounds.** The standalone SSE reader appends raw undecimited bytes to `buffer` without an explicit byte ceiling ([L293](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/standalone/api-feed.ts#L293)). The stdio bridge reads arbitrary lines and `response.text()` before applying error-text truncation ([L63](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/kosmos-mcp-stdio.mjs#L63)). A defective/custom upstream or client can grow memory before validation. This is a code-inspected hardening gap, not a reproduced exploit or evidence ordinary trusted service output exceeds its bounds. Add frame/line/response limits and oversized/incomplete-frame tests before claiming end-to-end boundedness.
5. **P2 documentation drift — source versus release versus candidates.** Kosmos CONTRIBUTING still says local `src/core/` owns semantics and says no visual baselines committed, although Engine is external and baselines exist. Architecture docs mention 2.1.1 while main pin is dev 2.1.2. Historical effects/standalone receipts need current-status annotations. Marshal README PR needs ABI/continuity reconciliation.
6. **P2 verification gap — adoption UI is omitted from ordinary `test:browser:chromium` file list.** The explicit audit command passed it, but the package's ordinary Chromium gate names only standalone/embed/context-loss. Add it to the gate when production wiring is introduced.
7. **P2 downstream decision gap — G1 source identities and provider boundaries unresolved.** The branch makes no provider selection. Treat candidate CDDL as proposal until exact bytes/schema, TS projection mapping, owner scope and cross-language vectors are ratified.
8. **P2 fidelity gap — distinct agents sharing a display label collapse into one renderer identity.** Current main preserves `agent_id` in the normalized event envelope, but standalone live/replay calls pass only `event.agent_label` ([standalone L127](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/standalone/standalone.ts#L127)). The renderer API accepts one `agent?: string`; it uses that trimmed label as `who`, finds a prior head with `agentSteps[i].agent === who`, and appends steps under that same key ([renderer L1603](https://github.com/Odenknight/Kosmos-Oden/blob/6486035dfc2e42173b1158b8007c9bab35aa7dc9/src/renderer/renderer.ts#L1603)). Distinct archived agent IDs with the same label therefore cannot retain separate visual heads/trails/colors. This is current upstream behavior, not merely an obsolete vendored implementation. Add separate stable ID and display-label parameters, preserve label-only backward compatibility explicitly, and test same-label/different-ID live and replay events through the product adapter. This is a visualization-fidelity gap, not an authority bypass. Root separately observed the analogous Observatory adapter call; that consumer was not directly audited here.

These findings do not authorize live effects, fixture use with private notes, or upstream edits.

## 8. Bounded work packets for TS-first completion and parallel safe Rust preparation

| Packet | Scope / prerequisites | Exit evidence | Explicit exclusions |
| --- | --- | --- | --- |
| K0 Current-state reconciliation | Preserve main; inventory PR/branch equivalence; record exact Engine TS interface/pin and release target | No ambiguous “implemented/released”; obsolete PR disposition proposed for owner review; package/lock/contracts aligned | No automatic closure/merge of old PRs |
| K1 Read-plane reliability | MCP/stdout byte bounds, SSE frame/response limits, timeout/cancellation/resume errors, sensitivity and capability parity tests | Adversarial synthetic tests and exact-main ordinary + Chromium checks | No new write endpoint or provider |
| K1-F Identity fidelity | Extend traversal rendering contract with distinct stable agent ID and display label; update live/replay and downstream adapters | Same-label/different-ID fixtures retain independent trails; ordinary label-only callers remain compatible | No use of display names as authorization or credential identity |
| K2 Consumer contract uplift | After Engine TS endpoint/contract stabilization, update Kosmos exact pin and service adapter together; verify embedded API vs standalone-service routes explicitly | Versioned fixture contract, graph/MCP/event parity, clean install/build tests | No floating main/tag pin; no authority inferred from connectivity |
| K3 Selective branch recovery | Reconcile v0.85 proposals, sidecar lifecycle, debouncer, receipt matching and reconciliation into current types; keep stronger main grants | Per-packet focused + full regression; source provenance; no weakened tests | No blanket branch merge; no Tauri-as-semantic-port claim |
| K4 Durable adoption/host adapter | Follow current C0 contract and qualify one explicitly selected host profile; durable registry/receipt transaction; exact-byte containment/path checks; split prepare/execute; authorized recovery/rollback/shutdown | Real-process crash seams, corrupt/external-edit tests, lease/flush evidence, idempotency; all unsupported modes false | No real vault adoption; no unsupported platform “atomic” claim |
| K5 Coordinator and operator UI | Only after host semantics proven: event queue, canonical index reuse, verified receipt suppression, reconciliation, settings/adoption/recovery/audit UI | Queue/parse counters, no-loop tests, UI keyboard/redaction tests, selected-host scale/24h soak receipts | No automatic enablement from settings alone |
| K6 Release qualification | Frozen Engine+Kosmos SHAs/artifact hashes; clean selected-platform builds; reproducibility and release review | Complete truthful matrix, retained license/provenance/checksums, rollback plan | No publishing/signing/deployment inferred from test success |
| R0 Contract-only Rust preparation | Maintain separate GKOS engine and Marshal owners; define TS golden corpus, value normalization, diagnostics/ordering/resource ceilings, explicit ABI candidates | Byte-level cross-language fixtures with reject cases; no runtime hookup | No effect writer, provider, SQL, daemon, source-vault or protocol convergence by naming |
| R1 Marshal candidate intake | Independent review of G1 CDDL/vector/map and session deviation; resolve source identity/provider/adapter and schema coexistence decisions | Owner-reviewed candidate revision + executable fixtures only after ratification | No claim G1 is passed; no silent upgrade of DURABLE-CONTINUITY schema |
| R2 Pure Rust shadow parity | Port only authorized pure semantics in the correct upstream; retain existing Marshal CBOR profile/ABI boundaries; exact revision/fixture/license pin | Differential parity, malformed/unknown input refusal, absence/mismatch checks, Windows/Linux fresh builds | No Rust authority/consumer cutover while TS stabilization incomplete |
| R3 Downstream migration admission | Only after TS completion and owner selection of intended Rust component/interface; test product adapter in disabled shadow mode | Explicit accepted deviations, performance/reliability evidence, rollback and owner-signed exact-build approval | No assumption PyO3 is Node/WASM; no approved migration from “Rust exists” |

For K4–K6, the current Effects qualification plan requires cross-platform filesystem limits, real child-process crashes, 100/2k/10k/50k fixtures, independent recovery/reconciliation safety and 24-hour soak. Those are genuine future blockers, not work to claim completed by 283 unit tests.

## 9. Destination plan publication instructions for orchestrator

Recommended new document: `docs/plans/GKOS-ECOSYSTEM-TS-FIRST-RUST-PREPARATION-2026-08-31.md`, optionally accompanied by a narrowly scoped `governance/WP-2026-GKOS-ECOSYSTEM-PLAN.yaml`. This path is a recommendation, not an existing mandated convention; current repository uses docs/ for cross-product/upstream discussions and governance/ for bounded packets. Avoid overwriting normative specifications or the existing source-authority register.

Authenticated REST checks:

- `gh api repos/Odenknight/theMarshal-Core-Rust/branches/main/protection`: HTTP 404 **Branch not protected**.
- `gh api repos/Odenknight/theMarshal-Core-Rust/rulesets`: `[]`.
- Default branch is main. No observed server-enforced signed-commit requirement; absence of protection is not authorization for direct main writes.
- `CONTRIBUTING.md` requires a DCO sign-off on **all commits**, with CLA before PR acceptance; sign-off is not CLA. It says contributions are not accepted by default and code submissions should first be discussed. User-authorized owner plan publication does not establish a third-party CLA or permit fabricating signer identity.
- Orchestrator subsequently confirmed owner authorization to use the configured OdenKnight noreply DCO identity for the roadmap-document commit only. No CLA or merge was requested. This resolves the document-commit identity choice for root; it does not authorize signing another person's name or accepting a contribution without required terms.
- Repository license is private/source-restricted and has no general reuse/distribution grant. Record license boundaries; do not place private Marshal implementation or code in public Kosmos/GKOS repositories based on source availability.
- Security policy prohibits production authority/PHI usage; keep any security-sensitive findings within the private approved destination.

Publish only on the user's authorized separate branch after root verification. Recheck main SHA immediately before creating the plan branch. Keep documentation claims prospective/non-authoritative; no changes to writer flags, runtime code, work-packet completion, provider selection, license or downstream pins. Do not merge or release from this audit.

## 10. Historical/local references reviewed and supersession

The local `build_instruct/GKOS_Navigation_MOC_Build_Plans_2026-08-15/03_KOSMOS_ODEN_NAVIGATION_MOC_INTEGRATION_PLAN.md` was read completely. Its baseline was Kosmos `8147bda...` and Engine 2.0.1, with proposed 2.1.0 upgrade and future Obsidian MOC writes. Current main has moved beyond that dependency baseline but has not implemented its full writer/history/sync-serialization acceptance. Its recommended path `src/plugin/navigation/` is historical; actual new code is `src/navigation-effects/` and `src/ui/`.

The local `kosmos-docs.patch` was read as an uncommitted prose proposal, not as live product capability evidence. Branch qualification docs and current Packet B/C0 receipts were cross-checked against code. Existing rendered confidence scores, activity trails, registry candidates and passing tests never confer authority, evidence truth, provider enrollment, release readiness or license rights.

### Explicitly disallowed assumptions

- Marshal Rust = GKOS Engine Rust = Tauri Rust shell.
- Same CBOR ancestry = interchangeable bytes, schema, digest or authority.
- Candidate G1 docs/vectors = ratified/executable contract or clean gate evidence.
- Shared API token or MCP display name = authenticated human/write authority.
- Exact development pin = release qualification.
- Passed unit/browser tests = durable crash recovery, all-platform safety or 24-hour stability.
- Historical receipt base = current head qualification.
- Available source/private access = general license or public redistribution permission.
- Unmerged branch has no value, or is safe to merge wholesale.
- Publication of a plan = permission to activate a writer, deploy, sign artifacts, migrate or enroll a provider.
