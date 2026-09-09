# Phase 6 D0 corrected core proposal validation

Validation date: 2026-08-25

Status: `READY_FOR_INDEPENDENT_CORE_AND_CROSS_REGISTER_REVIEW`, not owner
ratification, Phase-6 implementation, or qualification.

## Coordinates incorporated

- Full admission: `808d875b557f4cfd2bb0addccba44d70c9748f35`, hosted run
  `32881187799`, terminal `SUCCESS`.
- Lite admission: `ce8095515d2a1a7b23a10c01bd8f22e2dc5917e2`, predecessor
  `a39f14d`, draft PR #21, hosted run `32888245801`, `SUCCESS` 8/8.
- Corrected D0-14 governance matrix:
  `future-build-phase6/proposals/governance/PHASE6_SOL_ASSIGNMENT_AND_ACCEPTANCE_MATRIX.md`,
  revision `governance-correction.3`, 417 lines, 31,178 bytes, raw SHA-256
  `6bbbe8c4c20df32598777909619ddd003af46cdcda7c732060df0f0a9e8dda4f`.

## Cross-check inputs

- Ratified handoff:
  `sha256:88266e501f5b0c0a776089782642c550aac8c067b0176748edb8b9a72a32951d`.
- Ratified junior implementation guide:
  `sha256:39f5d5ffe1f91b9637dc7c9a2bafff31f5bd9063507eb1dcac4ec625f5048194`.
- Accepted Full ADR-0003:
  `sha256:ecc99b94e7f531d587f80705a126543cd5d15b262d28c26f5e0f717bcc5831f0`.
- Accepted Full ADR-0005:
  `sha256:355e887f4fd73b45ddef4ff4905413343faf0cd6b02f7a10443901cc18eaca0d`.
- GitHub's maintained runner-image catalog was checked on 2026-08-25. It
  identifies `macos-15` as a named arm64 image and announces macOS 14
  deprecation; the proposal therefore forbids `macos-latest` and requires a
  named-image availability check at ratification.
- Current Full canonicalization, desktop-token, SQLite,
  navigation-effects-recovery, and governance-receipt seams were used only as
  capability boundaries. No proposal claim promotes them to Phase-6 product
  qualification.

## Stable interface layout bound without a hash cycle

Core freezes these five product leaves under the exact pack root:

1. `operation-inventory.json`;
2. `transport.json`;
3. `tool-registry.schema.json`;
4. `tool-registry.json`; and
5. `mcp-conformance-fixture.json`.

The coordinated interface shape is 7 required tools, 0 optional/incomplete
tools, 16 deferred surfaces, and 67 official-provenance MCP 2025-11-25 vectors. Core does
not embed interface proposal byte hashes. The interface register binds the
core hashes below, and a later independent cross-register attestation binds
both final sets. This order is intentionally acyclic.

## Finding-by-finding correction closure

| Review finding / required correction | Corrected rule | Proposal state |
| --- | --- | --- |
| Core/interface normative ownership was ambiguous | Core now exclusively owns identity/credential/session/lifecycle records, global limits, errors, migration/restore, cross-store ordering, platform/qualification, and stop authority. | `CLOSED_FOR_REVIEW` |
| Interface duplicated errors/envelopes | One 53-code core registry, one six-field envelope, one exact CLI/HTTP/JSON-RPC/MCP projection table, and unauthenticated coalescing are frozen. | `CLOSED_FOR_REVIEW` |
| Tool catalog depended on nonexistent URI leaves | F1 has one self-contained strict registry schema, one registry instance, and no per-tool URI leaves; unsupported/incomplete tools are deferred. | `CLOSED_FOR_REVIEW` |
| Catalog overclaimed unavailable Full capabilities | Coordinated count is 7 required / 16 deferred / 0 optional; every required entry must bind an exact Full `808d875...` capability. | `CLOSED_FOR_REVIEW` |
| MCP assumptions lacked executable provenance | `mcp-conformance-fixture.json` is an exact product leaf with 67 official-provenance vectors. | `CLOSED_FOR_REVIEW` |
| F1 generation/evidence was self-referential | Signed input `C_in`, hosted run `R_q`, and evidence-only signed `C_att` are separate; pack bytes contain no resulting SHA/run/time; tar mtime is 0. | `CLOSED_FOR_REVIEW` |
| Reviewer verdict durability/recursion was unclear | Detached verdict reviews `C_in`; 90-day artifact plus byte-exact base64url copy in `C_att` preserves it without entering the reviewed SHA. | `CLOSED_FOR_REVIEW` |
| Authority/effects locking was unrealizable | One lock order `A -> E`, no SQLite transaction across filesystem work, and an append-only PREPARED/EFFECT_TERMINAL_OBSERVED/AUDIT_PUBLISHED bridge are explicit. | `CLOSED_FOR_REVIEW` |
| Irreversible effect/audit crash gap was open | Restart reconciliation under `A -> E` proves immutable Effects evidence and publishes audit exactly once; unresolved/tampered state remains write-disabled. | `CLOSED_FOR_REVIEW` |
| Restore could roll authority back | External owner-protected anchor, new authority instance/epoch, generation advance, global credential revoke/session+cursor invalidation, and crash-safe intent/commit restore are frozen. | `CLOSED_FOR_REVIEW` |
| Same-user threat was overclaimed | Protection is explicitly limited to accidental/offline DB rollback while the anchor remains current; malicious same-user/admin/kernel compromise is out of claim. | `CLOSED_FOR_REVIEW` |
| First bootstrap had an authentication deadlock | Local nonredirected OS-owner proof and vault-bound random challenge are the sole pre-authority exception; no listener/unattended bootstrap. | `CLOSED_FOR_REVIEW` |
| Credential reveal/storage was underspecified | Exact anonymous pipe/handle or no-replace client locator paths, bytes, POSIX modes, Windows SDDL, no-follow checks, and digest-only server storage are frozen. | `CLOSED_FOR_REVIEW` |
| Legacy selector/genesis were incomplete | Exact `gkc0_` derivation/prefix coupling and the one empty-chain genesis predecessor plus aggregate after-digest are specified. | `CLOSED_FOR_REVIEW` |
| Migration durability was incomplete | Owner-proof/plan/DB/anchor/active states, file+directory fsync/FlushFileBuffers, handle identity checks, and exact crash recovery are specified. | `CLOSED_FOR_REVIEW` |
| Canonical JSON/Unicode/number/UTF-8 vectors were incomplete | Duplicate keys, lexical numeric aliases, invalid UTF-8/BOM/surrogates, NFC behavior, and a byte+digest positive vector are explicit. | `CLOSED_FOR_REVIEW` |
| Cursor/snapshot state was unbounded | Exact 50-byte cursors with strict 32-byte canonical decode/re-encode and final-character pad-bit grammar, authority/session/filter bindings, TTL, entry/byte/global caps, stable page materialization, and distinct Navigation snapshot caps are frozen. | `CLOSED_FOR_REVIEW` |
| Windows ACL boundary was best effort | Exact protected SDDL is frozen; Windows remains unavailable until a reviewed Win32 descriptor adapter applies and verifies it. | `CLOSED_FOR_REVIEW` |
| macOS runner would age out silently | Named `macos-15` arm64 proposal, ratification-time verification, quarterly/retirement review, and no silent/latest substitution are explicit. | `CLOSED_FOR_REVIEW` |
| Qualification claims blurred stages | D0 proposal, F1 contract, F2 authority, F3 façade, F4 adversarial, F5 Full evidence, and L1-L4 Lite claims are separated. | `CLOSED_FOR_REVIEW` |
| D0-1/governance status was stale | Both admission coordinates are hosted green; corrected D0-14 hash/roles/waves are bound but still require independent review and owner ratification. | `CLOSED_FOR_REVIEW` |
| D0-15 roles were generic/overlapping | Stop classes map to named/reserved Sol roles with contribution-history recusal and fresh-specialist replacement; `/root` cannot waive semantics or accept F5/L4. | `CLOSED_FOR_REVIEW` |
| Beauvoir P1-1: D0-4 did not define every normalized store | Exactly 16 named tables plus the external anchor and backup manifest now have closed field/binding contracts; the decision record lists the same 16. | `CLOSED_FOR_REVIEW` |
| Beauvoir P1-2: restore receipt was indistinguishable from genesis | Restore is `local_owner_recovery/authority_restore`, targets the new authority instance, continues the prior event head, and may never use the empty predecessor. | `CLOSED_FOR_REVIEW` |
| Beauvoir P1-3: audit/outbox ordering was not one global chain | Bootstrap, identity, retention, bridge/outbox, and restore events share one global sequence/head; startup rejects active-segment gaps, forks, duplicates, and aliases, with only the protected restore checkpoint permitted. | `CLOSED_FOR_REVIEW` |
| Beauvoir P1-4: anchor mutation/recovery was not exact | Derived per-vault filename, 256-file root cap, intent+DB+committed-anchor durable points, flushes, and every recoverable/blocking crash combination are explicit. | `CLOSED_FOR_REVIEW` |
| Beauvoir P1-5: bootstrap owner could not authenticate repeat administration | Secure bootstrap creates one owner identity and `gkos1` credential, stages the persistent protected client locator, and requires it for every repeat owner command. | `CLOSED_FOR_REVIEW` |
| Beauvoir P1-6: restore/backups and irreversible effects lacked complete authority coordinates | Backup manifest and affected rows bind instance/restore/global/auth coordinates; A-to-E bridge events bind transport and immutable Effects evidence without a cross-store SQLite transaction. | `CLOSED_FOR_REVIEW` |
| Beauvoir P2-1: governance retained conflicted L1/protocol/migration/security reviewers | Governance correction.3 and D0-15 use fresh Full-conformance, migration, security, Full-contract-steward, and Lite-conformance reserved roles with recusal replacement. | `CLOSED_FOR_REVIEW` |
| Beauvoir P2-2: F1 claimed F2/F4/F5 runtime/platform proof | F1 is contract-only; F2 authority, F4 adversarial runtime, and F5 platform/evidence scopes and first-claim boundaries are separately frozen. | `CLOSED_FOR_REVIEW` |
| Beauvoir P2-3: Lite coordinate and old transaction wording were stale | Full Lite SHA is complete; every effect race now refers to the A-to-E bridge/Effects terminal and explicitly disclaims a cross-store SQLite/result transaction. | `CLOSED_FOR_REVIEW` |
| Beauvoir P2-4: credential locator and session non-enumeration were ambiguous | Client locator is persistent client state and may be reread by the client, never re-revealed by the server; unknown/terminated session IDs share a content-free 404. | `CLOSED_FOR_REVIEW` |
| Beauvoir P2-5: interface consumption could collapse timestamp/source UID domains | Core retains exact millisecond UTC 1970..9999 timestamps and distinguishes UUIDv7 authority IDs from Full-authored UUID versions 1..8 including legacy UUIDv4. | `CLOSED_FOR_REVIEW` |
| Peirce interface: Accept/session/unknown-tool projections were impossible or nonconformant | Registry adds closed 406 Accept rejection, moves unknown/expired session projection to non-enumerating 404, and maps unknown tools/malformed call parameters to `-32602`; tool input validation remains `isError=true`. | `CLOSED_FOR_REVIEW` |
| Beauvoir final-1: authenticated standard restore revoked its only usable owner credential | Pre-restore owner authentication now stages one new owner-admin credential and protected no-replace client locator bound to the new authority; the restore event records both actor and replacement coordinates, and only the replacement works after commit. | `CLOSED_FOR_REVIEW` |
| Beauvoir final-2: bootstrap DB rollback regressed behind a durable locator | Rollback after locator durability remains `OWNER_LOCATOR_STAGED`, revalidates/reuses the exact locator, and may neither regress to `PLAN_STAGED` nor regenerate/reveal. | `CLOSED_FOR_REVIEW` |
| Beauvoir final-3: SQLite transaction/lease wording conflated synchronization layers | Persistent authority lease `A` is the cross-process synchronization domain; SQLite transactions are short mutation transactions under `A` and never span Effects work. | `CLOSED_FOR_REVIEW` |
| Beauvoir final restore-plan P1: crash after plan fsync but before locator rename could delete the only staged credential | A plan-bound exact protected temporary is now resumable by validated no-replace rename; missing/corrupt/aliased state fails closed, and only authenticated receipt-backed `authority.restore.abort` can tombstone the uncommitted plan before a new credential is generated. | `CLOSED_FOR_REVIEW` |
| Fresh A: restore-abort receipt/tombstone had no record in the 16-table model | `restore_events` is now an exact discriminated union: committed restore targets the new authority instance, while abort targets the restore plan in the unchanged old authority. The abort row is the permanent tombstone and is cross-bound to the external `ABORTED` plan; no seventeenth table exists. | `CLOSED_FOR_REVIEW` |
| Fresh B: GET 405, invalid-Origin 403, and unknown-method `-32601` shared ambiguous projections | Three unique registry members and aliases now freeze pre-dispatch precedence and exact pairings: Origin 403, valid-Origin GET 405, and JSON-RPC method-not-found HTTP 200/`-32601`; unknown tool remains `-32602`. | `CLOSED_FOR_REVIEW` |
| Fresh C: D0-7 named an inventory but supplied no exact artifact | A strict proposal source freezes 32 unique operations (7 public, 1 bootstrap, 24 owner), 54 request/result definitions, 14 resolved public tool-schema refs, and exact opaque-reference issuance/lifecycle rules. | `CLOSED_FOR_REVIEW` |
| V3-1: graph-at-time could mint record refs without the sole discovery bootstrap | `graph.temporal.read` now requires a live non-null same-session scope ref, resolves and physically requalifies it before policy/projection, binds the complete scope/filter/snapshot authority tuple, issues only in-scope record refs, and never issues a scope. | `CLOSED_FOR_REVIEW` |
| V3-2: required HTTP admission rejection paths were incomplete/ambiguous | One deterministic nine-stage first-failure order covers peer, Host, Origin, method, media/body validation, protocol version, Accept, session, and authentication with the current closed registry and exact grouped aliases/status/MCP compatibility classes. | `CLOSED_FOR_REVIEW` |
| V4-1: session/auth admission failures conditionally projected a UUID | Every pre-dispatch rejection at stages 1--9 now projects `request_id=null`; any identifier allocated during bounded parsing/authentication remains internal, preserving deterministic grouped response bytes. | `CLOSED_FOR_REVIEW` |
| V4-2: issue/rotate retry semantics named a field rejected by the strict result | Both operations now bind the strict `credential_mutation_result`, whose required boolean is true only after the first completed out-of-band handoff and false on exact replay; no credential bytes are JSON, and rotate retains atomic zero-grace revocation. | `CLOSED_FOR_REVIEW` |
| V4-3: bootstrap could omit or lie about `legacy_source` | The field is required and restricted to two canonical values; acceptance requires an exact match to physically qualified canonical source state, with closed invalid-params, conflict, and malformed outcomes. | `CLOSED_FOR_REVIEW` |
| V5-1: cursor schema accepted noncanonical base64url aliases and excluded valid finals | The exact final set is `[AEIMQUYcgkosw048]`; strict decode produces 32 bytes and re-encode must match. Final `E` is accepted, while pad-bit aliases ending `B` or `D` are rejected before lookup. | `CLOSED_FOR_REVIEW` |
| V5-2: abbreviated bootstrap control flow skipped locator staging/owner activation | The controlling sequence now includes `OWNER_LOCATOR_STAGED` and `OWNER_ACTIVE`, with an exact no-legacy `OWNER_ACTIVE -> COMPLETE` branch matching rollback and the detailed state table. | `CLOSED_FOR_REVIEW` |
| V5-3: method and DELETE admission were not closed | Stage 4 normalizes every method to four finite categories and rejects every non-exact-POST/DELETE value with one 405 envelope; stage 5 groups invalid DELETE body/framing/Content-Type under one new 400 code. | `CLOSED_FOR_REVIEW` |
| V5-4: opaque-reference minting dependencies were incomplete | Every public operation now declares exact resolve/physical/discover/issue/snapshot/cursor dependencies; every new record ref uses `record_ref.issue`, and physical scans use `record_ref.discover` first. | `CLOSED_FOR_REVIEW` |
| V5-5: committed credential with failed handoff lacked an exact vector | `CREDENTIAL-RESULT-004` proves the active target is unrecoverable, first result and exact replay are false with identical mutation/receipt coordinates, no second handoff occurs, and JSON contains no secret. | `CLOSED_FOR_REVIEW` |
| V6 LOW: closure wording required redundant `additionalProperties:false` and `unevaluatedProperties:false` universally | Draft 2020-12 closure is now defined per accepting path: direct objects use `additionalProperties:false`; composed/ref boundaries must close every selected object branch or use enclosing `unevaluatedProperties:false`. Any open accepting path is forbidden. | `CLOSED_FOR_REVIEW` |

## Mechanical results

- All three core JSON proposal artifacts parse successfully.
- The closed registry contains exactly 53 unique errors and 34 aliases; all interface aliases
  map to an existing code.
- The operation inventory strict-compiles under Ajv 8.20.0 Draft 2020-12 with
  54 local definitions, exactly 32 unique operations in the 7/1/24 authority
  split, 14 resolved public tool-schema refs, and closed top-level/entry/count
  negative mutations rejected.
- Recursive closure traversal of the generated operation-inventory schema plus
  its 54 definitions finds 45 object instance boundaries: all 45 close directly
  with `additionalProperties:false`, none require
  `unevaluatedProperties:false`, and zero accepting object paths are open. The
  two compositions have four scalar/null branches and no object branch; all
  six `$ref` edges targeting object definitions resolve into the 41 directly
  closed object definitions. Injecting an undeclared sentinel at each direct
  object boundary is rejected by its selected schema path.
- D0-4 and its decision register enumerate exactly 16 unique table names plus
  the external anchor and backup manifest; global chain/anchor/restore fields
  agree.
- F1 allowed list contains exactly 40 unique UTF-16-code-unit-sorted, LF-only,
  terminal-LF paths. Maximum changed-path ceiling is 40.
- Pack root contains exactly 34 leaves; `pack-manifest.json` hashes the other
  33 and never itself.
- Explicit protected list contains exactly 22 unique sorted, LF-only,
  terminal-LF paths/prefixes.
- The proposal set contains no stale 13/5/10 catalog duplicate and no embedded
  interface proposal hash.
- F1 contract checks are textually disjoint from F2 authority, F4 adversarial,
  and F5 platform/evidence claims.
- Ten exact restore/bootstrap locator vectors cover replacement credential
  success/denial, durable-locator retry, no-replace conflict, intent recovery,
  plan-fsync/pre-rename resumption, missing/corrupt temporary abort, durable
  restore-event/external-tombstone reconciliation, and bootstrap DB rollback.
- Twenty-two exact pre-dispatch vectors cover every grouped member and the full
  nine-stage first-failure order with `request_id=null` at all nine stages; two JSON-RPC vectors retain unknown-method
  `-32601` versus unknown-tool `-32602`; three graph-scope vectors cover
  missing, live, and stale/cross-bound scope behavior. Three canonical-cursor
  vectors cover final `E` acceptance and final `B`/`D` alias rejection.
  Coordinated total is 67.
- Four bootstrap-source and four credential-result F1 core-operation vectors
  cover required declaration/physical binding and first-delivery/replay result
  semantics; these eight are not additional MCP fixture vectors.
- Core proposal files are LF-only with terminal LF and no trailing whitespace.
- No product source, pack, commit, push, merge, release, deployment,
  activation, or publication was performed.

## Raw SHA-256 inventory

This is a non-self-listing inventory: validation does not hash itself.

| Core proposal leaf | Bytes | Raw SHA-256 |
| --- | ---: | --- |
| `GKOS_PHASE6_D0_CORE_SPEC_PROPOSAL_2026-08-25.md` | 117,722 | `168d686594952786c55e255483847ce29d5c6e712d792a6534d1e78d8010163c` |
| `PHASE6_D0_CORE_OPERATION_INVENTORY_PROPOSAL_2026-08-25.json` | 45,471 | `d84f2e6ee6e3f7de0a6956d868fc0b2f1ae0ff7809f05ab85d52a0490bc69b87` |
| `P6_F1_ALLOWED_PATHS_PROPOSAL.txt` | 3,312 | `7e75c1b8cbd96aa80405f981995e3691e3b073c4929d0c0cb84db615ed694fce` |
| `P6_F1_PROTECTED_PATHS_PROPOSAL.txt` | 515 | `f920a006015ac77920dcbb611fd1a2c19e711d9002eb778a056137f50b2cc948` |
| `PHASE6_D0_CLOSED_ERROR_REGISTRY_1.0.0-draft.1.json` | 17,606 | `5dd45eaa90dee7a03b29e36131740e9480131307a6266d5f61eeeb0a5245e9a5` |
| `PHASE6_D0_CORE_DECISION_RECORD_PROPOSAL_2026-08-25.json` | 28,582 | `29f49ac280f87311841deb21dc5c0e07d6c126d6840c41875ee0053b2600c5c5` |

## Freeze recommendation and remaining gates

Recommendation: `CORE_CORRECTION_REVIEW_READY / F1_NO_GO`.

The correction wave closes the enumerated design findings in proposal form.
It does not owner-ratify them. F1 remains blocked until:

1. independent core, interface, and governance reviews report no unresolved
   blocker, HIGH, or MEDIUM;
2. the independent cross-register attestation validates both final sets and
   records their hashes without a cycle;
3. the Product Owner ratifies one coherent D0 record and exact work-package
   header; and
4. the Orchestrator records those coordinates and explicitly opens F1.

The Windows native ACL adapter and every runtime/transport behavior remain
future implementation/qualification work, not evidence supplied by this
proposal.
