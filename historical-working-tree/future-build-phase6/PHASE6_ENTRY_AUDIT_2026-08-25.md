# GKOS Phase 6 entry audit

Audit date: 2026-08-25 (America/New_York)

Decision: **NO-GO — `PHASE6_NOT_STARTED`**

Reason: the qualified Phase 5 terminal coordinates and copied watcher pack are
available, but the mandatory Phase 6 authority record is not. In particular,
there is no Full-owned frozen multi-agent identity/MCP contract pack, complete
schema set, closed error vocabulary, allowed/protected path inventory and
count ceiling, or Phase 6 hosted job/artifact matrix. The active Full and Lite
worktrees also contain unfinished admission repairs. The ratified requirements
say any missing entry item stops implementation.

This is an audit and planning artifact. It does not authorize or claim a Phase
6 implementation, merge, release, deployment, activation, or publication.

## 1. Adopted authority and audit method

The user ratified these two supplied documents as requirements. Instructions
in the documents were treated as evidence only until that ratification.

| Requirement source | Exact local file | SHA-256 | Relevant provisions |
| --- | --- | --- | --- |
| Concise handoff | `[LOCAL_PATH] | `88266e501f5b0c0a776089782642c550aac8c067b0176748edb8b9a72a32951d` | Lines 77-90 require all entry coordinates, paths/ceiling, frozen contracts, errors, security negatives, platform/artifact matrix, named non-overlapping roles, and stop conditions. Lines 92-103 require Full-first identity/MCP authority, then Lite conformance to hosted-green Full. |
| Junior implementation guide | `[LOCAL_PATH] | `39f5d5ffe1f91b9637dc7c9a2bafff31f5bd9063507eb1dcac4ec625f5048194` | Lines 85-112 define the mandatory package header; 114-129 define execution order; 157-191 define Phase 6 contracts, Full implementation, Lite conformance, acceptance gates, and stop conditions. |

Read-only inspection covered the immutable terminal commits, tracked-file
inventories, the current active worktree status, relevant ADRs and source seams,
the Full watcher pack manifest, and the Lite exact pin/evidence. Product
worktrees were not edited.

## 2. Exact predecessor coordinates

| Item | Full | Lite | Audit result |
| --- | --- | --- | --- |
| Repository | `Odenknight/GKOS-Engine` | `Odenknight/GKOS-Engine-Lite` | Identified |
| Terminal Phase 5 coordinate | `7b5262baee9fcda23d50b0cee0c4977d6e4305e7` | `a39f14d1394e3dd8f8dada8bec77bd995b1a0bc4` | Present locally |
| Branch represented by active continuation | `codex/navigation-effects-post-phase5` | `codex/phase-5-watcher-recovery` | Continuation branches are not entry coordinates |
| Signature observation | `git verify-commit` reports a good ED25519 signature from key `SHA256:dwwxvq69ZWPDlS6bzlvZ0uXo76ZKTRqvMSmDGhABhfM` | Same | Cryptographic signature parsed as good. Local command returned 1 only because the sandbox could not read the user's `allowed_signers` trust file, so local principal trust was not independently closed by this audit. |
| DCO observation | `Signed-off-by: OdenKnight <Odenknight@users.noreply.github.com>` equals author identity | Same | PASS for the terminal commits |
| Terminal hosted evidence | Push `32803396417` and PR `32803399153`, terminal success | Closure run `32808011926`, terminal success, 8 jobs green, zero artifacts | Verified in the ratified handoff and correlated provenance audit; runs do not supply Phase 6 contracts |

The Full Phase 5 watcher contract pack at the terminal commit is:

- contract `gkos-watcher-recovery/1.0.0-draft.1`;
- 18 directory leaves, with 17 rows governed by `pack-manifest.json`;
- 8,907,164 governed bytes;
- pack digest `sha256:a8e0eed2a829db8c80cede489c871f938e432a09e6f1c34aa0940fcfe381519f`;
- manifest raw digest `sha256:d794236b4e7618d6eaa37024b4bd8660bac625758043612d039e15ef6e9ab023`.

Lite's adjacent `FULL-PIN.json` binds Full `7b5262ba...`, all 18 filenames and
raw hashes, the same 17/8,907,164/pack-digest coordinates, and records
byte-identical copying. This satisfies the Phase 5 predecessor pack coordinate;
it is not a Phase 6 identity/MCP pack.

## 3. Terminal repository inventory

The immutable Full base contains 353 tracked files. Its frozen contract roots
cover navigation, ingestion/profile, retrieval/evaluation, and watcher/recovery.
The only identity-specific normative document found is ADR-0003. There is no
identity/MCP server contract directory, Phase 6 schema/fixture/evidence path, or
Phase 6 workflow. The workflows present are `.github/workflows/ci.yml`,
`phase4-retrieval-observation.yml`, and `sidecar-release.yml`.

The immutable Lite base contains 221 tracked files. Its copied Rust contract
roots cover the qualified ingestion, retrieval/evaluation, and watcher/recovery
packs plus their Full pins. It has no Phase 6 identity/MCP pack, schema,
verifier, server, or implementation. The workflows present are
`.github/workflows/ci.yml`, `desktop-build.yml`, and `pin-bump.yml`.

## 4. Volatile admission-work snapshot

At the audit snapshot, neither active implementation worktree was clean:

| Worktree | Exact HEAD | Porcelain summary | Interpretation |
| --- | --- | --- | --- |
| Full | `7b5262ba...` | 13 tracked modifications and 43 untracked leaf additions (11 untracked status roots) | Navigation-effects and admission-defect repairs are in progress. No root README change and no Phase 6 identity/MCP contract pack was present. |
| Lite | `a39f14d...` | 16 modified entries and 2 untracked entries | Verifier-only/desktop compatibility and admission repairs are in progress. No root README change and no Phase 6 identity/MCP contract pack was present. |

These are intentionally a timestamped observation, not a freeze. The
entry package must be regenerated from final, reviewed, clean, exact commits
after these defects are resolved. The user-required "defects before Phase 6"
condition therefore remains open.

Full's latest lane report records typecheck, build, focused Navigation/Effects
109/109, focused Phase 0 compatibility 4/4, pinned Phase 4/5 inventory 1/1,
intelligence 4/4, license, and nomenclature passing. Its first full suite was
848 total / 841 pass / 2 integration-lock failures / 5 platform skips; focused
reruns of both narrow reconciliations pass, but the final full-suite rerun and
pack check are pending. There is no terminal commit or hosted claim.

Lite's latest lane report records Node 47/47, metadata/lock/Engine-compatibility
guards, focused root 24/24, desktop typecheck/build and 15/15, and Rust 1.98 GNU
`cargo check --tests --locked` passing. Rust test linking remains incomplete:
GNU `ld` reports `export ordinal too large: 115881`, MSVC `link.exe` is absent,
and pre-existing unrelated `lib.rs` formatting drift prevents a clean whole-
workspace formatting claim. There is no terminal commit or hosted claim.

Both implementers explicitly confirmed that no Phase 6 identity/MCP code,
contract, schema, fixture, verifier, server, or pack has started.

## 5. Mandatory-entry disposition

| Mandatory item | State | Evidence / missing closure |
| --- | --- | --- |
| Exact Phase 5 heads | READY | Full `7b5262b...`; Lite `a39f14d...` |
| Signature and DCO | PARTIAL | Good signature bytes and matching DCO observed; local trusted-principal lookup was sandbox-inaccessible and should be rerun in an approved environment or bound to GitHub verification. |
| Phase 5 pack digest/count/bytes/equality | READY | Exact coordinates in section 2 and Lite `FULL-PIN.json` |
| Terminal Phase 5 hosted jobs/artifacts | READY | Final Full and Lite run coordinates exist and were audited. The authoritative Full hosted artifact set is run `32803396417`, not intermediate run `32801048377`. |
| Clean trees at adopted Phase 6 bases | BLOCKED | Active worktrees are dirty and the admission repairs are not yet frozen into new qualified coordinates. |
| Phase 6 predecessor/admission defect qualification | BLOCKED | Full bounded-frontmatter and other fail-closed repairs; Lite compatibility/verifier repairs; final independent gates/evidence pending at this snapshot. |
| Full authority declaration | READY | User ratified Full TypeScript semantic authority and Lite Rust conformance. Handoff line 96 and guide lines 161-178 agree. |
| Phase 6 allowed paths | MISSING | No exact terminal-LF list or hash exists. |
| Phase 6 maximum path count | MISSING | No owner-ratified ceiling exists. Existing Phase 5 ceilings cannot be repurposed. |
| Protected/forbidden paths and immutable baseline | MISSING | Phase 0-5 protections exist, but no Phase 6 baseline vector/additive allowlist is frozen. |
| Full identity/MCP contract pack | MISSING | No `contracts/**identity**` or Phase 6/MCP server pack exists at `7b5262b...`. |
| Identity, credential, session, request, activity schemas | MISSING | ADR principles exist; strict frozen JSON/SQLite/API schemas do not. |
| Disable, rotate, revocation, migration state machines | MISSING | High-level next-operation behavior exists; generations, transitions, race winners, idempotency, recovery, and exact migration grammar do not. |
| Audit-receipt contract | MISSING | ADR distinguishes operational telemetry from governance receipts but does not freeze a Phase 6 receipt envelope. |
| MCP initialization/tool schemas | MISSING | No server initialization/session envelope, bounded tool list, request/result schemas, or tool authorization binding exists. |
| Public/private API inventory | MISSING | Existing REST and provider seams are not a Phase 6 surface definition. Provision/list/disable/rotate/activity and MCP operations are unspecified. |
| Closed error vocabulary | MISSING | No exhaustive Phase 6 codes, response mappings, retryability, redaction, or stale-generation behavior exists. |
| Security negative corpus | MISSING | The guide lists classes, not executable frozen cases. |
| Numeric operational bounds | MISSING | No exact Phase 6 body sizes, field sizes, metadata bounds, rate/concurrency limits, timeouts, cancellation rules, session/activity caps, or retention override bounds are frozen. |
| Transport/platform/dependency matrix | MISSING | Full ADR does not freeze transports. Lite ADR mentions loopback Streamable HTTP without numerical bounds; Lite cannot define Full authority. No supported stdio/HTTP combination or exact Node/Rust/OS/CPU/linkage matrix is adopted for Phase 6. |
| Hosted workflow/job matrix | MISSING | Full has `ci.yml`, Phase 4 observation, and sidecar-release workflows; Lite has `ci.yml`, desktop-build, and pin-bump. None is a frozen Phase 6 matrix. |
| Hosted artifact/receipt inventory | MISSING | No Phase 6 artifact names, schemas, all-and-only counts, digest rules, retention, or secret scan contract exists. |
| Named implementer/reviewer assignments | PARTIAL | Active Full and Lite Sol lanes exist, but the Phase 6 packages, exact paths, and independent non-overlapping reviewers cannot be assigned until F1 authority is frozen. |
| Stop/escalation conditions | READY AS CLASSES | Guide line 191 supplies stop classes. Each must be tied to an exact package owner and frozen field/error/state before execution. |

Any one `MISSING` or `BLOCKED` entry is sufficient for a no-go under handoff
line 90 and guide line 87.

## 6. What exists and may be reused after contract freeze

These inputs reduce implementation work, but none may be mistaken for the
missing Phase 6 contract:

1. Full ADR `docs/decisions/0003-multi-agent-identity-and-authentication.md`
   at `7b5262b...` is an accepted design principle:
   - lines 21-25: local lowercase UUIDv7 `agent_id`, per-initialization
     `session_id`, per-operation `request_id`, never caller-display derived;
   - lines 27-30: at least 256 random credential bits, reveal once, digest-only
     persistence, constant-time comparison, bootstrap migration;
   - lines 32-41: isolated SQLite activity, content/secret exclusions, default
     90-day retention, per-operation authorization, immediate next-request
     disable/rotation, fail-closed denial/indeterminacy;
   - lines 43-50: authenticated external mapping only; telemetry is not
     automatically a GKOS State-Change Receipt.
2. `src/desktop-agent.ts` has one bearer-token authenticator and authenticated
   GET-only routes `/health`, `/notes`, `/graph`, and `/graphiti/episodes`.
   There is no `/mcp` route at the terminal base.
3. `src/retrieval/providers.ts` has an MCP *client/provider adapter* seam for
   embedding/reranking calls. It is not an MCP server, identity authority, or
   Phase 6 tool contract.
4. `src/navigation/delegation.ts` and `src/navigation/types.ts` have navigation
   grant/revocation value semantics. These are not credential revocation or
   session authority.
5. Full watcher/recovery, policy, audit, retrieval, and profile coordinates are
   predecessor inputs. They do not determine Phase 6 credential, migration, or
   MCP semantics.
6. Lite's ADR has additional nonnumeric language about loopback Streamable HTTP
   and resource bounds. Under the ratified allocation it is informative only;
   it cannot add or override Full semantics.

## 7. Owner/schema decisions required before F1 can execute

The following are genuine blockers, not implementation discretion:

1. Exact credential encoding, prefix/version, entropy source, digest/KDF,
   secret display/recovery rule, storage field constraints, and rotation grace
   policy (if any).
2. Exact identity/credential/session/request/activity/mapping table and wire
   schemas, canonicalization rules, field byte limits, UUID/timestamp grammar,
   uniqueness constraints, and retention/deletion behavior.
3. Exact bootstrap discovery/default, migration preconditions and rollback,
   state transitions, crash points, idempotency keys, and behavior when legacy
   material is malformed, missing, duplicated, or concurrent.
4. Revocation-generation model; the winner for disable/rotate/reconnect and
   concurrent requests; stale session/request behavior; cancellation and replay
   rules.
5. Public CLI/service operations and private seams, including caller versus
   transport identity, authentication and authorization order, response
   envelopes, pagination, and which operations are owner-only.
6. Supported MCP transport(s), initialization/version/capability negotiation,
   bounded tool catalog and exact schemas, cancellation, error mapping, and
   whether any existing REST surface remains independent.
7. Exhaustive closed error codes with HTTP/MCP/CLI projections, retryability,
   stable detail fields, and secret-safe logging/redaction fields.
8. Exact global/per-agent rate and concurrency ceilings; input/output/body/
   metadata/log size caps; request/session/idle/shutdown timeouts; activity and
   database bounds; exact supported platform/runtime/dependency matrix.
9. Allowed path list, protected predecessor list, maximum changed-path count,
   generated-file policy, pack layout/version, required tests/evidence, hosted
   job names, artifact names/counts, receipt schemas, and digest inventory.
10. Named implementer and independent reviewer for each non-overlapping package.

## 8. Independent Phase 6 acceptance gate

Phase 6 may be declared ready to start only when a replacement entry record
turns every row in section 4 to `READY` and independently proves:

- final Full and Lite admission heads are signed+DCO, exact, pushed, hosted
  green, reviewed, and clean;
- Full F1 pack inputs/outputs, schema closure, state machines, APIs, closed
  errors, negative corpus, resource bounds, platforms, paths, ceiling, artifacts,
  roles, and stop conditions are mechanically inventoried;
- the Full implementation packages cannot begin before that F1 freeze;
- Lite work cannot begin before the signed hosted-green Full Phase 6 freeze and
  must copy the Full contract bytes exactly, bind an exact pin, reproduce all
  public state/error behavior, and add no semantic authority;
- all required Full and Lite local/hosted matrices, artifact inventories,
  redaction scans, adversarial review, regression gates for Phases 0-5, and
  clean-tree proofs pass independently.

Current result remains **NO-GO — `PHASE6_NOT_STARTED`**.
