# GKOS Phase 6 D0 core-spec proposal

Proposal date: 2026-08-25 (America/New_York)

Status: **CORRECTED PROPOSAL — OWNER RATIFICATION AND INDEPENDENT RE-REVIEW REQUIRED — NO PRODUCT CODE AUTHORIZED**

Scope: D0 questions 2, 3, 4, 5, 6, 10, 11, 12, 13, and 15 for
GKOS-Engine Full. D0 questions 7, 8, 9, and 14 remain separate decisions. This
document coordinates the proposed transport, operation/tool catalog, and
delivery-governance artifacts, but does not ratify them, start F1, authorize
product work, or change either repository.

## 0. Correction-wave controlling rules

This section is the controlling correction to the proposal. If an older
paragraph below conflicts with this section, that paragraph is superseded and
must not be copied into F1. Before ratification, the editor must mechanically
prove that no conflicting machine artifact remains.

### 0.1 Normative ownership and coordinated interface instances

Core is normative for identity, credential, session and lifecycle records;
global limits; the sole error envelope and 53-code registry;
migration/restore; cross-store authority/effects ordering; platform and
qualification rules; and stop authority. The interface proposal may define
tool semantics only by referencing these core values.

The exact interface product leaves coordinated for F1 are
`operation-inventory.json`, `transport.json`, `tool-registry.schema.json`,
`tool-registry.json`, and `mcp-conformance-fixture.json` under the pack root.
The independently maintained registry source has 7 required tools, 16 deferred
surfaces, no optional/incomplete entries, and 67 official-provenance MCP 2025-11-25
conformance vectors. The registry schema is self-contained and closed; every
input/result reference resolves inside that single schema. There is no
`phase6://` reference and no nonexistent per-tool URI leaf. Deferred entries
are not advertised.

The exact D0-7 core source is
`PHASE6_D0_CORE_OPERATION_INVENTORY_PROPOSAL_2026-08-25.json` in this proposal
directory. It freezes 32 operations: 7 `PUBLIC_AUTHENTICATED`, 1
`LOCAL_BOOTSTRAP`, and 24 `OWNER_ONLY`, with an exact request and result schema
reference for every entry. It deterministically generates the already-allowed
`operation-inventory.schema.json` and `operation-inventory.json` leaves; it
does not add a pack leaf or expand the 40-path ceiling.

This core register freezes only those paths/layout/counts, not a duplicate of
the independently authored interface bytes or their proposal hashes. The
interface register will bind this core register's final hashes; a later
independent cross-register attestation will hash both frozen sets. This
one-way-then-attest order avoids mutual/self-referential manifests.

### 0.2 One envelope, exact protocol projection, and non-enumeration

The only domain-error envelope has exactly these fields:

`contract_version`, `error_code`, `request_id`, `retryable`,
`retry_after_ms`, `error_digest`.

The core registry is the only public registry. The projection table is exact:

| Boundary | Projection |
| --- | --- |
| CLI | One canonical envelope plus LF on stderr; registry `cli_exit`; empty secret-bearing stdout. |
| HTTP before JSON-RPC dispatch | Exact first-failure order is peer, Host, Origin, method, Content-Type, protocol version, Accept, session, authentication. Each failure uses its registry code/status and exactly the canonical JSON envelope; no later check runs. |
| JSON-RPC framing/protocol | Standard `-32700`, `-32600`, `-32601`, `-32602`, or `-32603`; `data` is the same envelope when a request ID exists. |
| MCP `tools/call` domain failure | JSON-RPC success whose `CallToolResult.isError=true`; `structuredContent.error` is exactly the envelope; content contains only the closed code. |
| MCP cancellation notification | No response. A cancellation that wins records the closed cancellation outcome in authority activity only. |
| Notification accepted by Streamable HTTP | HTTP 202 with empty body and no JSON-RPC response. |

`MCP_NOT_INITIALIZED` maps to `GKOS_P6_INVALID_REQUEST`; an unknown JSON-RPC
method maps uniquely to `GKOS_P6_JSONRPC_METHOD_NOT_FOUND`, HTTP 200, and
standard `-32601`, while an unknown name inside a well-formed
`tools/call` maps to `GKOS_P6_UNKNOWN_OPERATION` and JSON-RPC `-32602`.
Malformed JSON-RPC requests map to `GKOS_P6_INVALID_REQUEST`/`-32600`;
malformed `CallToolRequest` parameters map to
`GKOS_P6_INVALID_PARAMS`/`-32602`; and a well-formed call whose tool arguments
fail the advertised input schema is an MCP tool-execution result with
`isError=true`, never a protocol error. Invalid/expired cursors map to
`GKOS_P6_INVALID_PARAMS` or `GKOS_P6_REQUEST_STALE_AUTHORITY` respectively;
and forbidden forwarding maps to `GKOS_P6_POLICY_DENIED`. These are aliases at
the interface seam, not new codes. Malformed, missing, unknown, disabled,
revoked, expired, and selector-mismatched credential presentations expose only
`GKOS_P6_AUTH_FAILED`. Tool lists, identity existence, credential IDs, and
lifecycle detail are never revealed before successful authentication.

A non-loopback or invalid peer maps to `GKOS_P6_PEER_FORBIDDEN`/403; invalid
Host maps to `GKOS_P6_HOST_FORBIDDEN`/403; and invalid Origin maps to
`GKOS_P6_ORIGIN_FORBIDDEN`/403. After those pass, stage 4 accepts only exact
uppercase ASCII `POST` or `DELETE`. Every other method -- recognized standard,
valid extension token, lowercase/mixed case, malformed, empty, over-32-byte,
non-ASCII/control/whitespace, or parser-unavailable -- maps to the same
`GKOS_P6_METHOD_NOT_ALLOWED`/405 envelope with `Allow: POST, DELETE` and no
method detail. The controlled adapter has exactly four internal categories:
`POST`, `DELETE`, `OTHER_TOKEN`, and `INVALID_OR_UNAVAILABLE`.

At stage 5, a POST with missing, malformed, or unsupported Content-Type
coalesces to `GKOS_P6_UNSUPPORTED_MEDIA_TYPE`/415. DELETE requires a zero-byte
body, absent Transfer-Encoding, absent or single canonical `Content-Length: 0`,
and absent Content-Type. A DELETE with a body, chunked/ambiguous/noncanonical
framing, any Content-Type, or any combination coalesces to the identical
`GKOS_P6_DELETE_INVALID`/400 envelope. After stage 5, a presented
`MCP-Protocol-Version` must be exactly `2025-11-25`; any request presenting
`MCP-Session-Id` must present that version. Missing-with-session, malformed,
and unsupported versions coalesce to `GKOS_P6_PROTOCOL_VERSION_INVALID`/400.
Version absence is permitted only for a session-establishing `initialize`
request with no session header; any other absent-session/version request later
closes as `MCP_NOT_INITIALIZED`/`GKOS_P6_INVALID_REQUEST`. An admitted request missing the
required dual MCP `Accept` values maps to
`GKOS_P6_NOT_ACCEPTABLE` and HTTP 406. A presented unknown, expired, closed, or
terminated `MCP-Session-Id` maps to the same content-free
`GKOS_P6_SESSION_UNKNOWN` envelope and HTTP 404; no response distinguishes
whether the session once existed. A required-but-missing session header maps
to `GKOS_P6_INVALID_REQUEST` and HTTP 400. These transport projections do not
change credential non-enumeration: authentication failure remains the generic
HTTP 401 `GKOS_P6_AUTH_FAILED` response.

The pre-dispatch order is normative and removes compound-request ambiguity:
peer, Host, Origin, method, Content-Type, protocol version, Accept, session,
then credential authentication. No rejection falls through. Failures through
authentication have `request_id=null`, including session and authentication
failures after bounded admission allocated an internal identifier. That
identifier remains internal; no caller-derived or server-assigned request ID
is projected by any stage 1--9 rejection. A valid JSON-RPC unknown method is a JSON-RPC error response
with HTTP 200, the caller's JSON-RPC ID echoed, and canonical envelope data;
it is never the HTTP 405 code and never the unknown-tool code.

### 0.3 Acyclic generation, qualification, and attestation

No generated byte may contain the SHA or hosted run that will later qualify
that byte. The three stages are:

1. **Input commit `C_in`.** From approved entry `808d875...`, generate the
   deterministic 34-leaf pack and commit it with signed+DCO metadata. The pack
   manifest records `source_base_commit=808d875...` and a canonical
   `generation_input_digest`; it does not contain `C_in`, a run ID, a future
   attestation SHA, or a clock-derived timestamp.
2. **Qualification run `R_q`.** Hosted qualification checks exactly `C_in` and
   emits immutable artifacts that bind `C_in`, `R_q`, job, runner, commands,
   pack digest, and predecessor artifact digests. No job edits the repository.
3. **Closeout attestation commit `C_att`.** After terminal audit, a distinct
   signed+DCO evidence-only commit, parented directly on `C_in`, records
   `C_in`, `R_q`, artifact IDs/hashes, reviewer verdict coordinate/hash, and
   conclusions. The qualified contract coordinate remains `C_in`. `C_att` is
   an attestation, not a newly qualified pack. If it edits any contract,
   product, workflow, fixture, generator, or expected outcome, the cycle is
   invalid and a new `C_in`/`R_q` is required.

The independent verdict is uploaded by its own review run as artifact
`phase6-review-f1-<40-hex-C_in>` with 90-day hosted retention. To prevent that
retention window from erasing review evidence, `C_att` stores its artifact/run
coordinates, byte length, SHA-256, and canonical verdict bytes as unpadded
base64url in the fixed F1 evidence Markdown. Decoding must reproduce the named
canonical JSON artifact byte-for-byte. This durable copy is in `C_att`, never
in `C_in`, so the reviewer remains detached from the result it reviews and the
cycle remains acyclic.

The deterministic tar mtime is fixed to `0` (Unix epoch), not a commit
timestamp. Generated JSON contains no `generated_at`; qualification timestamps
exist only in receipts. A detached review verdict is outside the result SHA it
reviews and is later referenced by `C_att`, so it is not self-referential.

### 0.4 Realizable authority/effects order and durable bridge

There are two persistent leases: authority lease `A` and the already-qualified
Navigation Effects vault lease `E`. Every path that needs both acquires
`A -> E`; `E -> A` is forbidden and fails closed. A SQLite transaction is
never held while waiting for `E` or during filesystem mutation. The persistent
authority lease `A`, not a SQLite transaction, is the authoritative
cross-process synchronization domain. SQLite `BEGIN IMMEDIATE` transactions
are short mutation transactions opened only while `A` is held; they commit or
roll back before Effects work or other filesystem work begins.

An irreversible dispatch follows this exact protocol:

1. acquire `A`; create and fsync the exact anchor intent described in section
   0.5; then in a short `BEGIN IMMEDIATE`, reauthorize and append immutable
   outbox event `PREPARED` to the one global authority-event chain, binding
   authority instance/restore epoch/generation, agent epoch, transport,
   request, policy, input, plan, effect ID, attempt, and expected Effects
   recovery-gate digest; commit/checkpoint and commit the anchor coordinate;
2. while retaining `A`, acquire `E`; validate the persistent effects startup
   gate and the bound plan; execute through the qualified Effects executor;
3. after the qualified Effects executor exposes an immutable terminal, verify
   its receipt/journal/archive bytes under `E`; prepare the next anchor intent;
   then in a new short authority transaction append bridge event
   `EFFECT_TERMINAL_OBSERVED`, binding all terminal digests, and commit the
   anchor. Prepare one further anchor intent and append content-free activity
   plus bridge event `AUDIT_PUBLISHED` in one short authority transaction;
   commit that anchor coordinate;
4. release `E`, then `A`; only `AUDIT_PUBLISHED` may release success.

Outbox/bridge events are append-only members of the same global event chain as
identity, retention, bootstrap, and restore receipts. They are unique by
`(vault_id,authority_instance_id,effect_id,attempt,bridge_state)` and never
overwritten. On crash,
recovery takes `A -> E`, reconciles every nonterminal authority outbox entry
against immutable Effects evidence, publishes the missing audit exactly once,
and appends `RECOVERED` as a new globally sequenced event. A
missing/tampered/ambiguous effect terminal, failed
audit publication, or reversed lock attempt keeps the vault write-disabled and
returns `GKOS_P6_AUDIT_WRITE_FAILED` or `GKOS_P6_AUTHORITY_CORRUPT`. The
protocol claims linearizable admission/audit publication, not atomicity across
SQLite and the filesystem.

Lifecycle mutations also require `A`. Therefore a disable/revoke that acquires
`A` first prevents later effect admission, while an effect already holding
`A` reaches its qualified terminal/audit before the lifecycle mutation. This
is the frozen race winner; it does not depend on timing inside SQLite.

### 0.5 Restore rollback defense and threat boundary

Every authority has random `authority_instance_id`, monotonically increasing
`restore_epoch`, and global `authority_generation`. Credentials, mappings,
sessions, requests, activities, policy decisions, cursors, snapshots, audit
receipts, outbox events, restore events, and backup manifests bind all three;
agent-scoped records also bind the applicable `auth_epoch`.

There is exactly one canonical authority-event chain per vault. Its sequence
interleaves bootstrap genesis, identity lifecycle receipts, retention receipts,
effect outbox/bridge states, and restore receipts. Every event has unique
`global_event_seq`, `event_id`, `event_kind`, instance/restore/generation
before-and-after coordinates, nullable agent/auth-epoch before-and-after,
`transport`, `occurred_at`, `predecessor_event_digest`, and `event_digest`.
Append requires
`global_event_seq=authority_meta.global_event_seq+1` and predecessor equality
with `authority_meta.global_event_head_digest`; the same transaction inserts
the event and advances both meta fields. Sequence zero has the SHA-256
empty-string predecessor. Only the migration/bootstrap genesis may consume it.
Startup reads all event tables as one ordered set, rejects a duplicate sequence,
duplicate event ID, gap inside the active segment, digest fork,
alternate/case/Unicode alias, or event outside the declared kind table, and
recomputes the active chain segment. Ordinarily its floor is genesis. An
explicit restore sets `event_history_floor_seq=old_anchor.global_event_seq+1`
and `event_history_floor_predecessor_digest=old_anchor.global_event_head_digest`;
the restore event occupies that floor and is the only permitted checkpoint
over event bytes absent from an older backup. Sequence numbers never reset,
and the external predecessor remains in the restore receipt and anchor.

A protected external anchor outside the vault stores vault ID, current
authority instance, restore epoch, last generation, global event sequence and
head digest, database header digest, state, candidate event/database digests,
and predecessor anchor digest.

Anchor roots are `%LOCALAPPDATA%\GKOS\authority-anchors\` on Windows,
`~/Library/Application Support/GKOS/authority-anchors/` on macOS, and
`${XDG_STATE_HOME:-~/.local/state}/gkos/authority-anchors/` on Linux. They use
the same verified owner ACL rules as credential locators. Startup requires one
valid anchor/DB pair. A missing, older, mismatched, duplicated, or ambiguous
anchor blocks all authority and effects work.

The canonical filename is `gka1_<payload>.json`, where `payload` is lowercase
unpadded RFC 4648 base32 of the first 130 bits of
`SHA-256(UTF8("GKOS-AUTHORITY-ANCHOR-NAME-V1") || NUL || UTF8(vault_id))`.
The root contains at most 256 committed `.json` anchors and at most one
`.intent` sibling per committed filename; no other entry is accepted. Before
opening a vault, the implementation enumerates the physical root, rejects
duplicate decoded vault IDs, case/Unicode aliases, noncanonical names,
hard-link identity reuse, symlinks/reparse points, extra files, and a 257th
anchor. Anchor and intent are regular no-follow owner-only files, maximum
16,384 canonical bytes each.

Every security-relevant authority mutation uses this exact three-durable-point
protocol under `A`: (1) write the canonical proposed event and database-header
digests to `<anchor>.intent` with state `MUTATION_INTENT`, expected committed
anchor digest, old event head, and proposed next event head; fsync the new file
and root; (2) commit exactly one SQLite transaction containing that event and
the matching `authority_meta` head, checkpoint, and flush; (3) write/fsync a
new committed anchor to a no-replace temporary, atomically replace the old
committed anchor, fsync the root, then unlink the verified intent and fsync the
root again. The committed anchor's `predecessor_anchor_digest` is the raw digest
of the prior committed anchor.

At startup, old DB + old anchor + matching intent safely removes only that
intent; new DB + old anchor + matching intent completes point (3); new DB +
new anchor + matching lingering intent removes it; old DB behind a new anchor,
more than one event of drift, an intent without an exact old/new pair, or any
digest/identity mismatch blocks. No code chooses the numerically lower
coordinate, synthesizes an anchor, or repairs a fork.

Standard `authority.restore` is initiated by an owner authenticated against the
current pre-restore authority; OS-owner proof is not a substitute. The request
records the old owner agent, credential, request, instance, restore epoch,
generation, and auth epoch. A missing/corrupt current authority requires the
separate owner recovery procedure and cannot enter this standard operation.

Under `A`, standard restore performs these exact steps:

1. validate the backup into a new no-follow owner-only candidate and require
   exactly one restored owner identity;
2. create a new authority instance, set
   `restore_epoch=anchor.restore_epoch+1` and
   `authority_generation=max(anchor.last_generation,backup_generation)+1`,
   increment every restored agent epoch, and generate one fresh D0-3 `gkos1`
   credential with `credential_role=owner_admin` for the restored owner;
3. atomically create and fsync an owner-protected, no-replace temporary locator
   containing exactly the 81 credential bytes plus LF and capture its physical
   identity. Then fsync a nonsecret `RESTORE_PLAN_STAGED` record binding the
   plan ID, new credential ID/digest, new authority coordinates, intended
   default locator identity, exact temporary path/physical identity/content
   digest/protection-descriptor digest, backup, candidate, and prior anchor.
   Atomically rename that exact temporary to the absent default locator with
   no-replace semantics, fsync the parent, erase plaintext from server memory,
   then durably advance the plan to `RESTORE_OWNER_LOCATOR_STAGED`. The final
   locator publication is the one reveal; no API or retry may return the
   credential;
4. build the candidate database so every restored credential, including the
   initiating credential if present in the backup, is revoked; every restored
   session is closed; every cursor/idempotency result is invalidated; and only
   the staged replacement owner credential is active. Append the restore event
   at the protected history floor;
5. fsync the anchor `RESTORE_INTENT`, atomically swap the validated database,
   fsync the database parent, and atomically advance the anchor to `COMMITTED`.

The restore receipt has `actor=local_owner_recovery`,
`action=authority_restore`, `target_type=authority_instance`,
`target_id=<new authority_instance_id>`, and the prior committed event-head
digest as predecessor; it is never genesis and never uses the empty
predecessor. In addition to the existing before/after aggregates, it contains
the pre-restore actor agent/credential/request and authority coordinates,
`replacement_owner_agent_id`, `replacement_owner_credential_id`,
`replacement_owner_auth_epoch`, and
`replacement_locator_binding_digest`. The locator binding is a
domain-separated digest of platform, vault ID, new credential ID, physical
file identity, protection descriptor digest, and credential-content digest; it
contains no raw path or secret. The after digest binds all these fields, the
revoked credential set, closed session set, invalidated state sets, restored
database digest, and new event head.

A crash before `RESTORE_PLAN_STAGED` is durable leaves the old authority active
and may remove only an exact, safe, implementation-owned temporary that no
durable plan references. Once `RESTORE_PLAN_STAGED` is durable, a referenced
temporary is never treated as disposable. Startup opens it through its
verified parent with no-follow semantics and requires the exact planned path,
physical identity, credential-content digest, protection descriptor/ACL, owner,
regular-file type, and non-alias status. If all fields match and the final
locator is absent, startup resumes only the planned no-replace atomic rename,
fsyncs the parent, and advances to `RESTORE_OWNER_LOCATOR_STAGED`; it never
generates or reveals another credential. If the referenced temporary is
missing, corrupt, linked, aliased, misowned, misprotected, or identity-mismatched,
startup returns `GKOS_P6_AUTHORITY_CORRUPT`, leaves writes disabled, and deletes
nothing.

Because database and anchor publication have not begun at
`RESTORE_PLAN_STAGED`, the owner credential that authenticated the pre-restore
authority may invoke the local owner-only `authority.restore.abort` operation.
Under `A`, abort reauthenticates that owner, proves the old authority remains
current, proves neither the candidate database nor restore anchor was
published, and writes a durable `RESTORE_ABORT_INTENT`. It deletes a temporary
only when the same exact path, physical identity, content digest, ACL/protection,
owner, regular-file, and no-link checks all pass; a missing temporary is left
absent and a corrupt or aliased temporary is preserved. Recovery completes an
interrupted abort from that intent without broad cleanup. Abort then appends
one globally sequenced closed receipt and tombstones the plan as `ABORTED`
before a new restore plan or secret is permitted. It never regenerates a
credential under the old plan and never reveals that plan's credential.

The abort receipt has `action=authority_restore_abort`,
`target_type=restore_plan`, `target_id=<restore_plan_id>`, and the current
pre-restore event head as predecessor. It binds the authenticated actor
agent/credential/request and old authority coordinates, plan and backup/candidate
digests, proposed new authority coordinates, abandoned credential ID/digest,
expected temporary locator identity/digests/protection, observed disposition
`deleted_exact|absent|preserved_unsafe`, `replacement_credential_active=false`,
`database_publication_started=false`, `anchor_publication_started=false`, the
abort-intent/tombstone digests, and the new event head. Missing or unsafe temp
startup uses `GKOS_P6_AUTHORITY_CORRUPT`; abort outside this exact uncommitted
state uses `GKOS_P6_STATE_CONFLICT`. Ordinary authentication failures retain
their existing closed codes.

This abort receipt is a discriminated `restore_event` row in the existing
sixteenth table, not an `identity_audit_receipt` and not a new table. Its
`actor=local_owner_recovery`, action and target select the abort variant;
before/after authority instance and restore epoch remain the old values. The
row itself is the permanent plan tombstone. The external plan is then marked
`ABORTED` with that event ID/digest; startup requires both bytes to agree and
never treats an external tombstone without its globally sequenced row as
closed.

A crash after durable locator staging but before candidate publication remains
`RESTORE_OWNER_LOCATOR_STAGED`; retry must reopen the exact no-replace locator,
revalidate identity/protections/content-to-credential binding, and reuse it.
It never creates a second credential, overwrites the locator, regresses to
`RESTORE_PLAN_STAGED`, or re-reveals plaintext. A conflicting/missing/changed
staged locator blocks without deletion. Crashes from `RESTORE_INTENT` onward
use only the exact anchor/candidate recovery cases above. After commit, every
old credential fails and only the replacement owner credential can authorize
owner administration.

F1 freezes vectors `RESTORE-OWNER-001` through `RESTORE-OWNER-005` for normal
replacement success, old-credential denial/new-credential success, crash after
locator staging, no-replace locator conflict, and crash after candidate/intent.
`RESTORE-OWNER-006` crashes after the plan fsync but before rename and requires
exact temporary validation, resumed no-replace rename, parent fsync, and no
second reveal. `RESTORE-OWNER-007` removes the referenced temporary before
startup, requires `GKOS_P6_AUTHORITY_CORRUPT`, and proves authenticated abort
records `absent` before a new plan. `RESTORE-OWNER-008` corrupts or aliases the
temporary, requires the same fail-closed startup, and proves abort preserves
the unsafe object, tombstones the abandoned credential, and permits only a
new plan with a new unique temporary and secret.
`RESTORE-OWNER-009` commits abort and crashes between the globally sequenced
`restore_event` row and external `ABORTED` plan update; restart must reconcile
only the exact event ID/digest pair, prove the replacement credential was never
active, and must neither append a second row nor treat an unpaired external
tombstone as closed.
It also freezes `BOOTSTRAP-LOCATOR-ROLLBACK-001`: rollback of the bootstrap DB
transaction after durable locator staging stays `OWNER_LOCATOR_STAGED` and
retries with the exact locator.

This detects rollback of the vault database when the external anchor remains
current and makes every explicit restore revoke old authority. It does **not**
claim protection from an administrator or malicious same-OS-user process able
to replace both database and anchor, inspect process memory, or subvert the
kernel. Such compromise requires out-of-band owner recovery and credential
rotation.

### 0.6 First bootstrap owner proof and credential handoff

The pre-authority bootstrap exception is local CLI only. It requires an
exclusive authority lease, absent authority/anchor, a physically resolved
owner-controlled vault, an interactive nonredirected terminal, effective UID
or Windows token SID equal to the verified vault owner, and re-entry of a
displayed random 128-bit challenge bound to the vault-path digest. No listener
is started and no credential is needed, avoiding an authentication deadlock.
The threat claim is same-user accidental isolation, not resistance to a
malicious process running as that user.

Unattended bootstrap is unavailable in 1.0.0. A legacy token may seed the
legacy identity only after the same OS-owner proof; its possession alone is not
owner authorization.

Bootstrap creates exactly one service-generated owner identity and one
`gkos1` owner credential in the authority transaction. The bootstrap owner
credential must be handed off by atomic creation of its default client
credential locator; a pipe-only handoff is forbidden because post-bootstrap
administration must remain authenticated. Later non-bootstrap issue/rotate
operations may choose either (a) an already-open inherited anonymous pipe or
Windows anonymous-pipe handle verified not to be a regular file/socket, or (b)
atomic creation of a new client credential locator outside the server
authority root. Locator directories are `0700`, files `0600`, owned by the
effective UID on POSIX. Windows uses the protected DACL
`O:{OWNER_SID}G:SYD:P(A;;FA;;;{OWNER_SID})(A;;FA;;;SY)` and rejects inheritance
or any additional ACE. The server stores only the domain-separated digest and
credential ID. Plaintext is forbidden in server SQLite/WAL/SHM, logs, argv,
environment, protocol traces, receipts, fixtures, artifacts, and every server
API re-reveal. The owner-controlled locator intentionally persists the client
copy; this is client state, not server storage.
If locator creation or pipe delivery fails after commit, the secret is erased
from memory and never repeated; the owner rotates.

For non-bootstrap `credential.issue` and `credential.rotate`, the closed JSON
result contains mutation coordinates and `secret_revealed`, never credential
bytes. The first completed request returns `secret_revealed=true` only after
the selected inherited handle or protected locator has completed the one-time
handoff. An exact idempotent replay returns the same target credential and
receipt with `secret_revealed=false`; it never repeats the handoff. A handoff
failure after commit returns the committed mutation coordinates with
`secret_revealed=false`, leaves the credential unrecoverable, and requires a
new rotation request; replay remains false.

The default locator is
`%LOCALAPPDATA%\GKOS\credentials\<vault_id>\<credential_id>.cred` on Windows,
`~/Library/Application Support/GKOS/credentials/<vault_id>/<credential_id>.cred`
on macOS, and
`${XDG_STATE_HOME:-~/.local/state}/gkos/credentials/<vault_id>/<credential_id>.cred`
on Linux. It is created no-replace through a verified parent and contains
exactly the 81 ASCII credential bytes plus LF. The locator path is persistent
client-side state and is never persisted by the authority. Every
post-bootstrap owner administration command authenticates using
`--owner-credential-file` (defaulting to this locator); OS-owner proof alone is
not repeat administration authority. `--owner-credential-file` and the
non-owner `--credential-file` accept only a physically resolved regular
non-link file with the exact protections, read it once per client invocation
through a no-follow handle, and reject extra bytes, aliases,
changed-under-read identity, or a locator inside the vault/authority tree.

F2 must implement and verify POSIX ownership/mode with no-follow handle checks.
On Windows, support remains `GKOS_P6_PLATFORM_UNAVAILABLE` until a reviewed
Win32 adapter using `GetNamedSecurityInfoW`/`SetNamedSecurityInfoW` can apply
and compare the exact security descriptor. Node mode bits, `icacls` text
parsing, and best effort are not qualification evidence.

### 0.7 Legacy identifier, genesis, and atomic migration

The migrated selector is exactly:

```text
legacy_credential_id = "gkc0_" || base32lower(first 130 bits of legacy_digest)
```

Credential schemas accept `^gkc(?:0|1)_[a-z2-7]{26}$`; `gkc0_` is valid only
with `format=legacy-hex-v0`, and `gkc1_` only with `format=gkos1`. The first
migration/bootstrap event has `global_event_seq=1`, `actor=system_bootstrap`,
`action=bootstrap_owner`, `target_type=authority`, and
`predecessor_event_digest=sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
Its `after_digest` covers canonical digests of meta, the owner identity and
owner credential, any optional legacy agent/credential, migration plan, and
anchor proposal. No other event may use the empty-chain predecessor.

Migration uses open-handle/no-follow reads with file identity and size checked
before and after hashing. The controlling durable sequence is
`UNINITIALIZED -> OWNER_PROVED -> PLAN_STAGED -> OWNER_LOCATOR_STAGED ->
DB_COMMITTED -> ANCHOR_COMMITTED -> OWNER_ACTIVE`; from `OWNER_ACTIVE`, the
exact no-legacy branch is `OWNER_ACTIVE -> COMPLETE`, while the branch already
bound to a valid legacy source is `OWNER_ACTIVE -> LEGACY_ACTIVE ->
LEGACY_REVOKED -> COMPLETE`. Fail-closed `BLOCKED` is reachable from every
nonterminal contradiction. No sequence may skip `OWNER_LOCATOR_STAGED` or
`OWNER_ACTIVE`. Every transition writes
a new temporary record, fsyncs it, atomically replaces/no-replace renames as
specified, and fsyncs the parent; SQLite commit is followed by checked WAL
checkpoint and database/parent flush. Windows uses `FlushFileBuffers` on file
and opened directory handles. Recovery accepts only the unique next state
whose plan, DB, anchor, receipt predecessor, file identity, and digest all
match. Deletion/reset/adoption is never recovery.

### 0.8 Canonical vectors

F1 fixtures include all of these outcomes: UTF-8 BOM, overlong encodings,
invalid continuation bytes, encoded surrogate values, NUL, unpaired UTF-16
surrogates, duplicate JSON keys, `-0`, `1.0`, `1e0`, NaN/Infinity spellings,
and integers above 9,007,199,254,740,991 are rejected. CRLF contract bytes are
rejected. Human strings normalize NFC before validation; therefore
`"e\u0301"` and `"\u00e9"` produce the same canonical scalar, while ASCII
protocol IDs are never Unicode-normalized into acceptance. Object keys sort by
UTF-16 code unit; arrays preserve order unless their schema explicitly declares
set semantics. Canonical output uses shortest safe base-10 integers, no BOM,
no whitespace, and strict UTF-8.

The positive vector `{ "b": 1, "a": "é" }` canonicalizes to UTF-8 bytes for
`{"a":"é","b":1}`: hex
`7b2261223a22c3a9222c2262223a317d`, digest
`sha256:aa58fba8483623bed37c1b02edfccbdd9a53123837c20bfa4cb4049993a2872e`.
Strict parsing occurs before ordinary
`JSON.parse` can erase duplicate-key or numeric lexical evidence.

### 0.9 Bounded snapshots and cursors

A cursor is exactly `gkcur1_` plus 43 canonical unpadded base64url characters
decoding to 32 random bytes. Its exact grammar is
`^gkcur1_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$`: the final character carries
four data bits and two zero pad bits. The implementation must strictly decode
exactly 32 bytes and re-encode to byte-identical unpadded base64url before use;
decoder aliases with nonzero pad bits are invalid even if a permissive decoder
would produce the same bytes. `CURSOR-CANONICAL-001` uses final `E`, proving a
valid canonical final outside the obsolete `[AQgw]` subset;
`CURSOR-ALIAS-001` and `CURSOR-ALIAS-002` replace canonical final `A` with `B`
and `D` and must fail before lookup. Only its domain-separated SHA-256 is stored. It
binds authority instance/generation, agent/auth epoch, session, operation,
canonical filter digest, snapshot ID, page offset, page limit, order version,
and expiry. It is reusable only for the same page during its 15-minute life;
mutation of any authority binding returns stale. Cross-identity/filter/tool
use returns the same invalid-cursor projection without revealing the binding.

Page snapshots materialize already-authorized redacted summary bytes, not
source content. Limits are 2,000 entries and 524,288 canonical bytes per
snapshot, 8 active snapshots per agent, 128 per vault, and 15 minutes. A page
is at most 100 entries/1,048,576 bytes. Narrowing is required when creation
would exceed a cap; no partial shifting page is returned. Snapshot rows and
cursors are deleted only by receipted retention after expiry.

Navigation diff snapshot artifacts are distinct: maximum 8 active per vault,
16,777,216 bytes each, 15-minute default life, stored under the protected
Navigation derived-state root. The authority database stores only their ID,
digest, size, expiry, scope/policy/config digests, and agent epoch. The tool is
unavailable unless the qualified Navigation adapter proves immutable bytes and
these bindings.

### 0.10 Platform maintenance and stage-accurate claims

The macOS required lane uses a named maintained arm64 GitHub-hosted image,
never `macos-latest`. The proposed initial label is `macos-15`; the D0 owner
must verify availability at ratification. The owner reviews runner deprecation
quarterly and after any GitHub retirement notice. Changing the label requires
a signed matrix amendment and fresh platform evidence; prior evidence remains
valid only for its exact run image. A silent label substitution is evidence
mismatch.

Proposal review proves only document/schema coherence. F1 qualifies contract
bytes at `C_in`; it does not qualify an authority engine, transport, active MCP
service, Lite parity, effect execution, deployment, or release. F2 may qualify
authority semantics, F3 façades, F4 independent adversarial coverage, F5 Full
platform/evidence, and L1-L4 Lite conformance only after their independently
accepted predecessor coordinates. D0-1 admission-green coordinates are not a
Phase-6 Full-to-Lite pin.

### 0.11 Governance coordinate and D0-15 roles

D0-14 is represented by
`future-build-phase6/proposals/governance/PHASE6_SOL_ASSIGNMENT_AND_ACCEPTANCE_MATRIX.md`,
raw SHA-256
`6bbbe8c4c20df32598777909619ddd003af46cdcda7c732060df0f0a9e8dda4f`
(417 lines, 31,178 bytes), revision `governance-correction.3`. It remains
proposed until independent governance review and owner ratification.

Package roles are: F1/F2 Peirce author and Beauvoir reviewer; F3 Kosmos-Oden
author and reserved `/root/phase6_mcp_reviewer`; F4 Beauvoir author and `/root`
bounded reviewer; F5 reserved `/root/phase6_full_evidence` author and
`/root/phase6_evidence_reviewer`; L1 Beauvoir author and fresh reserved
`/root/phase6_full_conformance_reviewer`; L2 Beauvoir/MCP reviewer; L3
Peirce/`/root`; L4 reserved `/root/phase6_lite_evidence`/evidence reviewer.
Reviewers author no package bytes or expected outcomes.

Credential, collision, redaction, and secret stops require fresh reserved
`/root/phase6_security_reviewer`; bootstrap requires
`/root/phase6_migration_reviewer`; migration requires both. Protocol/catalog/
closed-error stops require fresh `/root/phase6_full_contract_steward` and
`/root/phase6_lite_conformance_reviewer`. L1 acceptance belongs only to the
fresh Full-conformance reviewer above, never Peirce. Evidence mismatches route
solely to `/root/phase6_evidence_reviewer`. Any contributor recuses. `/root`
dispatches a fresh same-specialty replacement for a recused/unavailable role
and records contribution history; no upstream author, package author, or
expected-outcome author may become acceptance authority. `/root` coordinates
stop/resume but never supplies a semantic waiver or accepts F5/L4.

## 1. Authority, entry coordinate, and repository fit

The owner-approved Full Phase-6 entry is
`808d875b557f4cfd2bb0addccba44d70c9748f35`, qualified by hosted run
`32881187799`. D0-1 is also closed for Lite at
`ce8095515d2a1a7b23a10c01bd8f22e2dc5917e2` (admission base `a39f14d`, draft PR #21),
qualified by hosted run `32888245801` with all 8 of 8 jobs successful.

Full TypeScript is the sole schema and semantic authority. Lite's Rust
frontend-adapter may later copy a hosted-green Full pack byte-for-byte and
prove conformance against its exact Full pin. Lite may not define a new state,
error, race winner, default, or denial exception.

This proposal is grounded in these existing capabilities and limits:

| Existing source | Binding carried forward | Limit not overclaimed |
| --- | --- | --- |
| Accepted ADR-0003 at the qualified Full repository | GKOS-issued lowercase UUIDv7 identities; at least 256 random credential bits; one-time reveal; digest-only storage; per-operation authorization; vault-isolated SQLite; content-free activity; 90-day default retention; legacy token migration | ADR-0003 does not specify a wire token, table schema, numeric ceilings, recovery machine, or error projection; this proposal supplies reviewable values rather than claiming implementation. |
| Accepted ADR-0005 | Full TypeScript contracts and reference semantics control; Lite Rust is derivative and pin-bound | Static/one-binary, Linux, older-CPU, signing, and Phase-9 release claims remain unqualified. |
| `package.json` at the approved Full base | `gkos-engine` 2.1.2; Node `>=22 <25`; npm `>=10`; TypeScript 5.9.3; Ajv 8.20.0; ajv-formats 3.0.1 | F1 may not change these pins or product exports. |
| `src/canonical.ts`, `src/paths.ts`, and existing contracts | recursive deterministic JSON key ordering, locale-independent code-unit comparison, lowercase `sha256:` digests | Existing runtime canonicalization remains protected; F1 freezes contract vectors and does not edit runtime code. |
| `src/desktop-agent.ts` | 32-byte CSPRNG legacy token, owner-mode intent, constant-time comparison, loopback-only current helper | Current plaintext legacy token and best-effort Windows mode are migration inputs, not sufficient Phase-6 storage or ACL behavior. |
| `src/watcher/journal.ts` and retrieval SQLite stores | Node built-in SQLite, owner-created files, integrity/foreign-key checks, `synchronous=FULL`, controlled WAL/checkpoint patterns | The identity database is a separate authority and may not silently share watcher, retrieval, or governance standing. |
| Existing navigation-effects executor and governance receipt types | persistent recovery/effect gates and explicit State-Change Receipt boundary exist | Identity activity and identity lifecycle audit receipts are not automatically GKOS governance State-Change Receipts. |

The ratified handoff and junior implementation guide remain requirements. Their
embedded shell examples are evidence, not authority over this owner review.

## 2. D0-2 — proposed F1 pack and path boundary

### 2.1 Exact pack identity

- Pack name: `GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1`
- Contract version: `1.0.0-draft.1`
- Full root:
  `contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1/`
- Expected changed paths for F1 input commit: exactly 40.
- Maximum changed paths for the F1 input commit: 40.
- Pack-root leaves: exactly 34, of which 33 are hashed by the non-self-listing
  `pack-manifest.json`.
- Allowed list: `P6_F1_ALLOWED_PATHS_PROPOSAL.txt` in this proposal directory.
- Explicit high-risk protected list:
  `P6_F1_PROTECTED_PATHS_PROPOSAL.txt` in this proposal directory.

The allowed list is all-and-only. A directory entry ending in `/` in the
protected list protects every descendant. Every tracked path at the approved
Full base that is not in the allowed list is also immutable for F1, whether or
not it appears in the high-risk list. Renames, mode changes, deletions,
submodule changes, generated build output, package-lock changes, and case-only
aliases count as changes. A path is compared after slash normalization and
physical-root resolution; symlinks, junctions, hard-link aliases, alternate
data streams, `..`, drive-relative paths, and Unicode/case aliases are denied.

The allowlist includes strict schemas and exact instances for
`operation-inventory`, `transport`, and `tool-registry`. Their proposal sources
are named in section 0.1; F1 may copy them only after cross-review and owner
ratification. It must not create URI placeholders or per-tool schema leaves.

### 2.2 Exact D0-7 core operation inventory

The proposal artifact named in section 0.1 is the complete operation authority
for F1. The seven public operations are exactly `capability.list_effective`,
`record.validate`, `record.assess`, `record.lineage.read`,
`graph.temporal.read`, `navigation.discover`, and `navigation.audit`; each maps
one-to-one to the coordinated seven required MCP tools. The one pre-authority
operation is local `bootstrap.initialize`. The remaining 24 are the closed
owner surface for authority status; agent, credential, mapping, session,
activity, and retention administration; backup/restore/restore-abort; and
migration inspection/recovery. No unspecified operation is callable.

The inventory's private dependencies are mandatory, not explanatory hints.
Every operation that mints a new `record_ref` declares `record_ref.issue`;
every physical scan additionally declares `record_ref.discover` before issue.
`record.validate` and `record.assess` resolve/requalify and echo only the input
ref. `record.lineage.read` resolves/requalifies its input and issues related
refs from the bound lineage graph without a filesystem discovery scan.
`graph.temporal.read`, `navigation.discover`, and `navigation.audit` all
declare discovery plus issuance; both Navigation operations and graph use the
exact scope/path/snapshot/cursor dependencies applicable to their schemas.
F1 rejects a generated inventory missing any declared resolver or issuer.

`navigation.discover` with both `scope_ref=null` and `cursor=null` is the only
initial scope-reference issuance path. After current policy evaluation and
physical qualification of configured roots, it issues authorized root
`scope_ref`, `record_ref`, and child-scope values. Later pages or calls may
reuse only a same-session issued `scope_ref`; `capability.list_effective`
issues no reference. Each 128-bit opaque reference is bound in
a process-memory resolver to session, agent, auth epoch, authority generation,
policy decision, capability, filter, physical identity, and expiry. It lives
at most 900,000 ms and never survives session closure, authority change,
write-gate closure, or process restart. The existing `page_snapshot` record
persists only the issued-reference count/set digest; no path or resolver entry
is added to SQLite. This is a lifecycle use of the existing 16-record model,
not a seventeenth record.

`graph.temporal.read` can never bootstrap a scope. Its request requires a
non-null canonical live `scope_ref` issued to the same session, plus `at`,
`state`, `cursor`, and `limit`. Canonical decode/re-encode and
`scope_ref.resolve` occur before current policy evaluation and physical
no-follow requalification. Its filter and page snapshot bind the scope-ref
digest, session, agent, auth epoch, authority generation, policy decision,
physical identity, `at`, `state`, and `valid_at:asc,record_ref:asc` ordering.
It may issue only record refs proven inside that resolved scope and returns no
new scope ref. Missing, stale, cross-session, cross-agent, cross-epoch,
cross-generation, policy-mismatched, or physical-identity-mismatched scopes
fail closed before graph projection.

### 2.3 Manifest and generated-source rules

`pack-manifest.json` is generated last and never lists or hashes itself. It
contains exactly:

`contract_name`, `contract_version`, `source_repository`,
`source_base_commit`, `generation_input_digest`, `generator_digest`,
`leaf_count` (33), `leaves`, and `aggregate_digest`. It contains no resulting
commit, timestamp, run, artifact, PR, or attestation coordinate.

Each leaf entry contains normalized relative `path`, raw byte `size`, and raw
`sha256:<64 lowercase hex>`. Leaves are strictly unique and sorted by UTF-16
code-unit path order. `aggregate_digest` is SHA-256 of canonical JSON bytes for
the ordered leaf array, excluding the aggregate field and excluding the
manifest. No absolute path, host name, user name, clock-read timestamp, run ID,
or secret may influence generated pack bytes. Independent generation in two
fresh physical temporary roots must be byte-identical.

Rationale: 40 paths are enough for one generator, one test, one workflow, two
docs, one evidence record, and the closed 34-leaf pack. Making F1 all-and-only
prevents a contract-free runtime implementation from entering with the schema
freeze.

## 3. D0-3 — credential contract

### 3.1 Wire encoding and entropy

The only new credential wire form is:

```text
gkos1.gkc1_<credential-id-payload>.<secret-payload>
```

- Literal version prefix: `gkos1.`
- Literal identifier prefix: `gkc1_`
- Identifier payload: exactly 26 lowercase RFC 4648 base32 characters from
  `[a-z2-7]`, with no padding.
- Secret payload: exactly 43 unpadded base64url characters from
  `[A-Za-z0-9_-]` that canonically decode to exactly 32 bytes.
- Total wire length: exactly 81 ASCII bytes.
- Entropy: exactly 32 bytes (256 bits) from Node `crypto.randomBytes`; partial,
  fallback, time-derived, UUID-derived, user-derived, or deterministic random
  sources are forbidden.
- Decode must reject noncanonical base64url, wrong lengths, ignored whitespace,
  alternate case, percent encoding, Unicode lookalikes, padding, extra
  separators, or trailing bytes.

No conforming fixture contains a syntactically valid secret. Security fixtures
use explicit non-secret placeholders that intentionally fail the credential
schema.

### 3.2 Digest, KDF, and identifier

Let `S` be the decoded 32 secret bytes and let `0x00` be one zero byte:

```text
D = SHA-256(UTF8("GKOS-CREDENTIAL-V1") || 0x00 || S)
credential_id = "gkc1_" || base32lower(first 130 bits of D)
secret_digest = "sha256:" || lowercase_hex(D)
```

The identifier payload in the wire form must match the identifier recomputed
from the secret. The database lookup uses `credential_id`; authentication then
performs a constant-time comparison of all 32 digest bytes. An unknown
identifier performs the same full comparison against a process-random dummy
digest before returning the same public `GKOS_P6_AUTH_FAILED` envelope.

The KDF is exactly `none-random-256`. Password-based credentials are
unsupported. Argon2, scrypt, PBKDF2, reversible encryption, pepper files, and
truncated stored digests are unavailable in contract version 1.0.0. A slow
password KDF adds complexity and native dependencies without materially
improving a uniformly random 256-bit secret; changing this decision requires a
new credential wire version and owner security review.

The 130-bit public identifier is a selector, not an authenticator. A collision
between the selector and a different full digest returns
`GKOS_P6_CREDENTIAL_COLLISION`, performs no mutation, and is a stop-class
event. It may not be resolved by lengthening only one record or by overwriting.

### 3.3 Reveal, storage, and rotation

- A successful local-owner provision or rotate operation hands off the
  credential exactly once through the protected anonymous pipe/handle or
  atomically created client locator in section 0.6. It is never placed in an
  ordinary JSON or protocol response. The database commit occurs before
  handoff.
- The server never persists or reconstructs the raw credential and no API can
  list, print, or re-reveal it. It is never logged, included in activity,
  returned in an error, placed in a fixture, or included in an artifact. The
  protected owner-controlled client locator in section 0.6 is the intentional
  persistent client copy and is reread only by the client command for normal
  authentication.
- If the protected handoff is lost after commit, the credential remains active but is
  unrecoverable. The owner must rotate again. Retry with the same idempotency
  key returns only the existing nonsecret record and `secret_revealed=false`;
  it never repeats the secret.
- The database is
  `.gkx/identity/gkos-agent-authority.sqlite` beneath a physically resolved
  vault. Its parent is owner-only. POSIX requires mode `0700` on the directory
  and `0600` on the database, WAL, SHM, lease, migration plan, and temporary
  files. Windows requires exact SDDL
  `O:{OWNER_SID}G:SYD:P(A;;FA;;;{OWNER_SID})(A;;FA;;;SY)`, with no inherited or
  additional ACE, verified by the native adapter boundary in section 0.6. Failure is
  `GKOS_P6_STORAGE_PERMISSION_INVALID`; best effort is not sufficient.
- All protected files must be regular non-link files; physical paths must stay
  under the resolved `.gkx/identity` root. Alias uncertainty fails closed.
- SQLite uses page size 4096, UTF-8, `foreign_keys=ON`,
  `trusted_schema=OFF`, `locking_mode=EXCLUSIVE`, `synchronous=FULL`,
  `journal_mode=WAL`, `wal_autocheckpoint=0`, `temp_store=MEMORY`, and
  `max_page_count=131072`. Startup validates schema, pragmas,
  `integrity_check`, and `foreign_key_check`; close and evidence capture use a
  checked `wal_checkpoint(TRUNCATE)`.

Rotation is an atomic authority transaction: insert the new active credential,
revoke the old credential, increment global `authority_generation`, increment
the agent `auth_epoch`, append the identity audit receipt, and commit. Grace is
exactly 0 ms. The old credential and every session bound to the prior epoch
fail on their next operation. There is no dual-active overlap. A failure before
commit reveals nothing and changes nothing; a failure after commit follows the
lost-response rule above.

At most four credentials may be active for an agent for separately attributable
clients. Rotation replaces exactly one selected active credential. Disable is
not rotation, and enable never reactivates a revoked credential.

## 4. D0-4 — normalized records and canonicalization

### 4.1 Common canonical rules

Every schema is strict Draft 2020-12 JSON Schema and must compile under Ajv
8.20.0 with strict schema, strict types, strict tuples, all errors, and format
validation enabled. Every object instance boundary must be closed on every
accepting path. A simple or leaf object schema uses
`additionalProperties:false`. A composed `oneOf`/`anyOf`/`allOf`/`$ref`
boundary is closed either because every selectable object branch closes its
complete property set or because the enclosing boundary uses
`unevaluatedProperties:false` where Draft 2020-12 evaluated-property semantics
require it. Redundantly requiring both keywords at every boundary is neither
necessary nor normative. Any composed or referenced path that can accept an
undeclared property is invalid and blocks F1. Optional semantic values are
represented by required nullable fields; omission is not an alternate
canonical form.

- IDs: lowercase RFC 9562 UUIDv7 matching
  `^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`.
  Service-generated IDs use cryptographic random bits. A collision causes no
  retry or overwrite; it is a stop-class `GKOS_P6_IDENTITY_COLLISION`.
- Source GKX authored `uid` values are not authority IDs. At Full
  `808d875...`, `isValidGkxAuthoredUid` accepts canonical UUID versions 1
  through 8 and legacy GKX 2.2 explicitly uses lowercase UUIDv4. Interface
  schemas must preserve that source domain or freeze an explicit redaction
  rule; they may not reuse the authority UUIDv7 scalar and silently map a valid
  authored UUIDv4 to null. Authority, request, event, snapshot, and cursor
  record IDs remain UUIDv7 only.
- Timestamps: real Gregorian instants exactly
  `YYYY-MM-DDTHH:mm:ss.sssZ`, years 1970 through 9999, UTC only. Date-only,
  offset, leap-second, missing-millisecond, impossible-date, normalized-alias,
  and out-of-range values are rejected. The service clock supplies all
  authoritative timestamps.
- Digests: `sha256:<64 lowercase hexadecimal>` only.
- Counters/generations: JSON integers from 0 through
  9,007,199,254,740,991. Fractional, negative, exponent, string, or unsafe
  values are rejected. Exhaustion fails closed.
- Strings: valid Unicode scalar values, NFC normalized, no NUL/C0/C1 control,
  no unpaired surrogate, no leading/trailing whitespace, and bounded by UTF-8
  bytes after normalization. Schema keys and protocol identifiers are ASCII.
- Canonical record bytes: recursively sort object keys by UTF-16 code unit,
  preserve sequence arrays, sort and deduplicate arrays declared as sets,
  emit JSON without insignificant whitespace/BOM/trailing LF, and encode UTF-8.
  This matches the qualified Full canonical JSON seam. Contract files add
  exactly one terminal LF; the LF is not part of a record digest.
- `record_digest`: SHA-256 of canonical record bytes with that record's
  `record_digest` field omitted. An audit receipt's `receipt_digest` follows
  the same rule. Digest mismatch is authority corruption.

The database has exactly these 16 tables: (1) `authority_meta`, (2)
`agent_identities`, (3) `credentials`, (4) `external_mappings`, (5) `sessions`,
(6) `requests`, (7) `activities`, (8) `policy_decisions`, (9)
`identity_audit_receipts`, (10) `retention_batches`, (11) `rate_buckets`, (12)
`bootstrap_migrations`, (13) `page_snapshots`, (14) `page_cursors`, (15)
`effect_outbox_events`, and (16) `restore_events`. No implicit seventeenth
event-index or backup table exists. Cross-table authority-event uniqueness is
verified against `authority_meta` under the exclusive authority lease and on
every startup. The external anchor and authority backup manifest are separate
protected canonical records and are never silently synthesized from the
database.
Foreign keys are enforced. No
table stores note bodies, snippets, queries, raw MCP messages, source paths,
raw external subjects, or credential material.

### 4.2 Exact record fields

All fields shown are required, including nullable fields. Every table record
begins with `contract_version="1.0.0-draft.1"`, `vault_id` UUIDv7,
`authority_instance_id` UUIDv7, and `restore_epoch` integer 1..MAX. An
agent-scoped record also contains `agent_id` and the applicable `auth_epoch`.
Transport is exactly `owner_cli|native_stdio|loopback_streamable_http|
private_authority|effect_bridge|migration_recovery` where listed.

| Record | Remaining fields and exact domain |
| --- | --- |
| `authority_meta` | Singleton key `meta_id="authority"`; `schema_version="1.0.0-draft.1"`; `authority_generation` 1..MAX; `global_event_seq` 1..MAX; `global_event_head_digest`; `event_history_floor_seq`; `event_history_floor_predecessor_digest`; `write_gate` `open|recovery_required|blocked`; `bootstrap_state`; `created_at`, `updated_at`; `record_digest`. Its instance/epoch fields are the current vault authority coordinate. |
| `agent_identity` | `agent_id` UUIDv7 PK; `authority_role` `owner|agent` (exactly one active owner); `display_name` NFC 1..128 bytes; `status` `active|disabled`; `authority_generation`, `auth_epoch` 1..MAX; `created_at`, `updated_at`; nullable `disabled_at`, `disable_reason` NFC 1..256 bytes; `record_digest`. Display names are not unique and never authenticate. |
| `credential` | `credential_id` `^gkc(?:0|1)_[a-z2-7]{26}$` PK with prefix/format coupling; `agent_id` FK; `credential_role` `owner_admin|agent`; `format` `gkos1|legacy-hex-v0`; `digest_algorithm`; `secret_digest`; `status` `active|revoked`; `credential_generation`; `authority_generation_issued`, `auth_epoch_issued`; nullable `authority_generation_revoked`, `auth_epoch_revoked`, `revoked_at`, `revocation_reason`, `replaces_credential_id`; `created_at`; `record_digest`. Full digest and selector uniqueness are enforced. |
| `external_mapping` | `mapping_id` UUIDv7 PK; `namespace`; `subject_digest`; `agent_id`; `authority_generation`, `auth_epoch`, `mapping_generation`; `status` `active|revoked`; `authenticated_by`; `created_at`; nullable `revoked_at`; `record_digest`. Unique active `(namespace,subject_digest)`; raw subject is never stored. |
| `session` | `session_id` UUIDv7 PK; `agent_id`, `auth_epoch`; `credential_id`; `transport`; `authority_generation_at_open`; `status` `open|closed|expired|stale`; `created_at`, `last_activity_at`, `idle_expires_at`, `absolute_expires_at`; nullable `closed_at`, `close_reason`; `record_digest`. New ID per successful initialization. Unknown/terminated public lookup is the same 404 projection. |
| `request` | `request_id` UUIDv7 PK; nullable `session_id`; `agent_id`, `credential_id`; `transport`; `operation`; `authority_generation_admitted`, `auth_epoch_admitted`; nullable `authority_generation_final`, `auth_epoch_final`, `idempotency_key_digest`; `input_digest`, `input_bytes`; `state`; `admitted_at`, `deadline_at`; nullable `completed_at`, `result_digest`, `error_code`; `record_digest`. Caller identity fields are forbidden. |
| `activity` | `activity_id` UUIDv7 PK; `activity_seq` unique per vault; `agent_id`, `auth_epoch`, `credential_id`; nullable `session_id`; `request_id`; `transport`; `authority_generation`; `operation`, `outcome`, `policy_decision_id`, `input_digest`; nullable `result_digest`, `error_code`; `started_at`, `finished_at`, `duration_ms`; bounded `metadata`; `record_digest`. Operational evidence only. |
| `policy_decision` | `policy_decision_id` UUIDv7 PK; `agent_id`, `auth_epoch`; nullable `session_id`; `request_id`; `transport`; `authority_generation`; `capability`, `policy_digest`, `configuration_digest`, `outcome`, sorted unique `reason_codes`, `evaluated_at`; `record_digest`. |
| `identity_audit_receipt` | Event-common fields below; nullable `request_id`, `idempotency_key_digest`, `before_digest`, `after_digest`; `actor` `local_owner|system_bootstrap|system_migration`; `action` `bootstrap_owner|bootstrap_legacy_agent|provision_agent|rename_agent|disable_agent|enable_agent|issue_credential|revoke_credential|rotate_credential|add_mapping|revoke_mapping|close_session|set_retention|migration_recovery`; `target_type` `authority|agent|credential|mapping|session|retention|migration`; `target_id`. It never gains GKOS governance receipt standing. |
| `retention_batch` | Event-common fields; `record_type`, inclusive `first_sequence`, `last_sequence`, `row_count` 1..1000, `ordered_rows_digest`, `retention_policy_digest`, `deleted_at`. Permanent; deletion and receipt occur in one transaction. |
| `rate_bucket` | `bucket_id` digest-derived ASCII PK; nullable `agent_id`, `auth_epoch`; `authority_generation`; `bucket_class`; `tokens_micro`, `capacity_micro`, `refill_micro_per_ms`; `last_refill_wall_at`, `last_refill_monotonic_ms`; `record_digest`. No raw selector/IP. |
| `bootstrap_migration` | `migration_id` UUIDv7 PK; `authority_generation`; nullable legacy `agent_id`, `auth_epoch`, `legacy_credential_id`; `state`; `plan_digest`, `source_digest`, `database_digest`, `anchor_proposal_digest`; `genesis_event_id`; `idempotency_key_digest`; `created_at`, `updated_at`; `record_digest`. |
| `page_snapshot` | `snapshot_id` UUIDv7 PK; `agent_id`, `auth_epoch`; nullable `session_id`; `transport`; `authority_generation`; `operation`, `filter_digest`, `order_version`, `entry_count`, `canonical_bytes`, `snapshot_digest`; `issued_reference_count` 0..2,000 and `issued_reference_set_digest`; `created_at`, `expires_at`; `record_digest`. Contains only authorized redacted summaries and the aggregate digest of session-bound record/scope refs, never resolver paths or entries. |
| `page_cursor` | `cursor_digest` PK; `snapshot_id`; `agent_id`, `auth_epoch`; nullable `session_id`; `transport`; `authority_generation`; `operation`, `filter_digest`, `page_offset`, `page_limit`, `order_version`, `issued_at`, `expires_at`; `record_digest`. Raw cursor is never stored. |
| `effect_outbox_event` | Event-common fields; `agent_id`, `auth_epoch`, `credential_id`, nullable `session_id`; `request_id`; `transport="effect_bridge"`; `policy_decision_id`, `input_digest`, `plan_digest`, `effect_id`, `attempt`; `bridge_state` `PREPARED|EFFECT_TERMINAL_OBSERVED|AUDIT_PUBLISHED|RECOVERED`; `expected_recovery_gate_digest`; nullable Effects receipt/journal/archive digests and `activity_id`. Unique `(vault_id,authority_instance_id,effect_id,attempt,bridge_state)`. |
| `restore_event` | Discriminated event-common row with actor `local_owner_recovery`. `action=authority_restore`, `target_type=authority_instance`, and `target_id=new_authority_instance_id` requires pre-restore actor/request coordinates; backup and old/new instance/epoch/generation/chain coordinates; replacement owner/credential/auth-epoch/locator binding; revoked/closed/invalidated aggregates; and restored DB digest. That variant is the active segment floor, continues the old anchored head, and is never genesis. `action=authority_restore_abort`, `target_type=restore_plan`, and `target_id=restore_plan_id` instead requires equal before/after old authority coordinates, plan/backup/candidate and abandoned credential digests, exact expected temp identity/protection digests, `temporary_disposition=deleted_exact|absent|preserved_unsafe`, false replacement-active/DB-published/anchor-published flags, abort-intent digest and tombstone digest. The abort row is the permanent tombstone in the old global chain. The two variants reject each other's fields. |

Event-common fields are `event_id`, `event_kind`, `global_event_seq`,
`authority_instance_id_before`, `authority_instance_id_after`,
`restore_epoch_before`, `restore_epoch_after`, `authority_generation_before`,
`authority_generation_after`, nullable `agent_id`, `auth_epoch_before`,
`auth_epoch_after`, `transport`, `occurred_at`, `predecessor_event_digest`, and
`event_digest`. Non-restore events have equal before/after instance and restore
epoch. There is no second per-table sequence or receipt chain.

The external `authority_anchor` record contains the exact fields frozen in
section 0.5 plus `anchor_state=MUTATION_INTENT|RESTORE_INTENT|COMMITTED`,
`updated_at`, and `anchor_digest`. The external `authority_backup_manifest`
contains `backup_id`, source vault/instance/restore/generation, global event
sequence/head, schema version, checked SQLite snapshot byte length/digest,
created timestamp, and `manifest_digest`. A backup is created only under `A`
after checked checkpoint using the SQLite backup API into a no-follow
owner-only no-replace file; its manifest and database are fsynced with their
parent. Restore rejects a WAL/SHM, loose database without its manifest,
manifest alias, different vault, stale external-anchor coordinate, or any
record whose embedded instance/epoch/generation disagrees with the manifest.

The closed base activity metadata keys are `input_bytes`, `output_bytes`,
`item_count`, `result_count`, `cache_outcome`, and `side_effect_class`. At most
16 keys and 8192 canonical bytes are allowed; a coordinated tool schema may remove keys or set
lower operation-specific limits but may not add content-bearing values without
reopening D0-4.

The accepted raw idempotency key is ASCII and is never stored. Its stored value
is `SHA-256("GKOS-IDEMPOTENCY-V1" NUL agent_id NUL operation NUL raw_key)`.
An external subject accepted from a future authenticated adapter must be valid
NFC UTF-8 of 1..512 bytes before its domain-separated digest is computed.

### 4.3 Retention and deletion

Agents, credentials, external mappings, lifecycle receipts, bootstrap records,
and retention batch receipts are permanent tombstone history in contract 1.0.0
and have no ordinary delete. Display-name changes append an audit receipt.

Closed sessions, completed requests, policy decisions, and activity records
default to 90 complete UTC days. One vault-wide trusted-owner override is an
integer 7..365 days. A change applies prospectively and emits an audit receipt.
Idempotency replay material remains queryable for exactly 24 hours after
completion even when the retention value is lower; the request's nonsecret
audit record remains for the selected retention period.

Retention deletes only complete expired batches of at most 1000 rows in one
transaction, after writing a permanent `retention_batch` record containing the
record type, inclusive sequence interval, count, ordered aggregate digest,
policy digest, and deletion timestamp. Active/open state is never retention
eligible. A partial, unreceipted, or digest-mismatched batch fails closed as
`GKOS_P6_AUTHORITY_CORRUPT`.

## 5. D0-5 — disable, revoke, epochs, and deterministic races

Disable and revoke are separate operations:

- `disable(agent_id)` changes the agent to `disabled`. It blocks every
  credential, mapping, open session, new session, and new request for that
  agent. Credentials remain individually active/revoked in history so an
  enable operation does not erase lifecycle truth.
- `revoke(credential_id)` changes only one credential to `revoked`; it does not
  disable the agent or revoke another credential.
- `enable(agent_id)` returns the agent to `active`, increments epochs, and does
  not reactivate a revoked credential or old session.
- `rotate(credential_id)` atomically issues one new credential and revokes the
  selected old credential with zero grace.

The authority database has one global `authority_generation`, initialized at
1. Each agent has one `auth_epoch`, initialized at 1. Every committed disable,
enable, credential issue, credential revoke, credential rotation, active
mapping add/revoke, or security-relevant policy binding change increments the
global generation and the affected agent epoch exactly once in the same
transaction. A no-op, rejected, replayed, or rolled-back mutation increments
neither. Generations never wrap or reset, including after migration or restore.

Every session binds `(authority_generation_at_open, auth_epoch_at_open)`. Every
request binds the current global generation and agent epoch at admission. A
request must authenticate and authorize again on every operation, even on an
open session. A generation mismatch never falls back to the session's earlier
allow.

`authority_generation` is the vault-wide total-order/audit coordinate;
`auth_epoch` is the stale-work coordinate. If only the global generation
changed, the final gate rereads the affected agent and credential. Work remains
eligible only when that agent's epoch, credential, policy binding, and recovery
gate are unchanged. An unrelated agent mutation therefore does not
gratuitously stale this agent, while any security-relevant change to this
agent does.

### 5.1 Linearization and race table

Identity recovery, lifecycle mutations, session initialization, operation
admission, final result publication, and any irreversible effect commit share
one vault authority synchronization domain. A process-local mutex alone is
insufficient: persistent authority lease `A` is authoritative across processes,
fresh executors, and restart. SQLite transactions are short mutations under
`A`; they are neither the lease nor a cross-process synchronization substitute
and never span Effects work.

For a read-only operation, the final authorization gate linearizes immediately
before result release. For an existing Navigation Effects operation, it
linearizes under the qualified execution lease immediately before the first
irreversible effect commit. The executor rechecks the bound global generation,
agent epoch, credential state, agent state, session state, policy digest, and
persistent recovery gate. The A-to-E bridge protocol in section 0.4 then
observes immutable Effects terminal evidence and publishes activity before
releasing a success result; there is no cross-store SQLite/result transaction.
F1 does not change the existing effect contract;
it requires the adapter seam to preserve its persistent fail-closed recovery.

| Race | Deterministic winner and loser |
| --- | --- |
| Disable commits before request final gate | Disable wins. No result or effect is published. Request becomes `stale`; public code `GKOS_P6_REQUEST_STALE_AUTHORITY`. The session becomes stale. |
| Qualified Effects terminal is durably committed under `A -> E` before disable can acquire `A` | Bridge recovery must finish exact audit publication before success; disable then governs every later request. No cross-store atomicity or retroactive rollback is claimed. |
| Revoke or rotate commits before old-credential request final gate | Lifecycle wins. Request becomes stale; session returns `GKOS_P6_SESSION_STALE` on its next use. Unauthenticated reconnect with old credential returns only `GKOS_P6_AUTH_FAILED`. |
| Request commits before revoke or rotate | Request completes; old credential fails every later request. |
| Reconnect races disable/rotate | Initialization's authority transaction either commits against the old epoch first, after which lifecycle immediately stales it, or lifecycle commits first and initialization fails. It never yields a session usable under an obsolete epoch. |
| Two lifecycle mutations target one agent | SQLite/lease order is the total order. The later mutation validates the state produced by the first; incompatible preconditions return `GKOS_P6_STATE_CONFLICT`. |
| Same idempotency key and same canonical request | First admitted request owns execution. A concurrent or later replay returns the recorded nonsecret result/error only after completion; it creates no second effect or activity success. |
| Same idempotency key and different input/operation/agent | `GKOS_P6_REQUEST_REPLAY_CONFLICT`; no execution. |
| Cancellation before final gate | Cancellation wins; state `cancelled`, no result/effect, `GKOS_P6_REQUEST_CANCELLED`. |
| Final effect commit before cancellation | Commit wins and the committed result is returned; cancellation cannot relabel committed work or claim rollback. |
| Recovery gate is unsafe | Every current or fresh executor fails before effect admission. Only a successful explicit recovery transaction may clear the persistent gate. |

Queued work that has not crossed its final gate is stale after an epoch change.
Computation may be discarded, but no stale output, cache publication, activity
success, or side effect is allowed. These rules are tested with same-agent,
different-agent, same-session, fresh-session, fresh-executor, restart, and
multi-process adversarial fixtures.

## 6. D0-6 — bootstrap and legacy migration

### 6.1 Source and default

There is no anonymous, display-derived, path-derived, client-derived, or
hard-coded default identity.

On first identity-authority startup there is no automatic authority creation.
After the local OS-owner proof in section 0.6, the only legacy bootstrap source
is the existing `.gkx/desktop-agent.token` when all of these are true:

1. its physical resolved path is beneath the same vault's resolved `.gkx`;
2. it is an owner-protected regular non-link file with no alias ambiguity;
3. after trimming one optional terminal LF only, it is exactly 64 lowercase
   hexadecimal characters and decodes to exactly 32 bytes;
4. there is no existing identity database with a different bootstrap digest;
5. the authority lease is exclusively held and no external anchor exists.

Uppercase, embedded/trailing whitespace, alternate length, empty, link, broad
ACL/mode, duplicated, changed-under-read, or unreadable tokens are malformed;
they are never normalized into acceptance. Before explicit bootstrap, startup
returns owner-only `GKOS_P6_BOOTSTRAP_REQUIRED` and creates no identity,
credential, token, or database. The exact local-owner operation is
`bootstrap.initialize` in the operation inventory. After the section 0.6 proof,
that operation creates the owner authority even when the legacy token is
absent; the token controls only whether a second legacy agent is migrated.
Its strict request always includes canonical `legacy_source` with exactly
`absent` or `desktop_agent_token`; omission is `GKOS_P6_INVALID_PARAMS`.
While holding the authority lease, the server physically qualifies the one
canonical legacy-token locator before accepting the declaration. `absent` is
valid only when that locator is physically absent, and `desktop_agent_token`
is valid only when the exact qualified file is present and passes every
format/protection check above. A declaration/observed-state mismatch is
`GKOS_P6_MIGRATION_CONFLICT`; a declared-present malformed source is
`GKOS_P6_MIGRATION_MALFORMED`. The declaration never selects an alternate
path and never suppresses a present source.

Every bootstrap creates one service-generated `vault_id`, one owner
`agent_id`, and one `gkos1` credential with `credential_role=owner_admin`,
delivered to the persistent protected owner locator. A valid legacy source
additionally creates a distinct service-generated agent identity and one
credential record with `credential_role=agent` and `format=legacy-hex-v0`.
Its wire presentation remains the exact old 64-byte
lowercase hex only at the compatibility authentication seam; it is not
re-encoded as a new `gkos1` secret and is never revealed by migration. It gets
a fixed non-authoritative display name `Legacy desktop agent` and
a new nonsecret `credential_id` derived with the legacy domain separator:

```text
legacy_digest = SHA-256(UTF8("GKOS-LEGACY-CREDENTIAL-V0") || 0x00 || decoded_legacy_bytes)
```

The legacy token file remains owner-protected while that credential is active.
The first owner rotation commits the new `gkos1` credential and revocation of
the legacy credential before attempting token-file removal. A crash that
leaves the old file cannot re-enable it because the database revocation is
authoritative. Removal is retried idempotently; an unexpected changed file is
not deleted and returns `GKOS_P6_MIGRATION_CONFLICT`.

### 6.2 State machine

The durable bootstrap/migration idempotency key is:

```text
SHA-256(canonical_json({
  purpose: "authority-bootstrap-v1",
  vault_id,
  legacy_digest_or_null,
  target_schema_version: 1
}))
```

The migration plan contains owner/optional-legacy IDs, nonsecret credential
IDs/digests, source physical file identity, expected locator/token ACL digests,
schema version, state, and predecessor plan digest. It contains no raw token or
raw owner credential. The unfinished bootstrap recovery path may reread the
exact staged owner locator only to recompute and compare its already-bound
digest before activation; after activation the server never rereads it. The
closed states and transitions are:

| State | Permitted transition | Transaction and result |
| --- | --- | --- |
| `UNINITIALIZED` | local proof -> `OWNER_PROVED` | Verify section 0.6 OS-owner proof under exclusive authority lease; persist only challenge digest/outcome, never the challenge or token. |
| `OWNER_PROVED` | `stage` -> `PLAN_STAGED` | Revalidate the required `legacy_source` declaration against canonical physical token absence or exact bytes/identity; generate IDs and owner secret once in memory; write the nonsecret owner-only plan, fsync file and parent, atomic no-replace rename. No database authority yet. |
| `PLAN_STAGED` | locator create -> `OWNER_LOCATOR_STAGED` | Atomically create/fsync the exact default owner locator with the 81-byte credential plus LF, then erase the in-memory plaintext. Plan binds locator identity, credential ID and digest. A collision or different existing locator blocks. |
| `OWNER_LOCATOR_STAGED` | `publish` -> `DB_COMMITTED` | Revalidate plan, locator digest/identity and optional unchanged legacy token; create/validate owner-only SQLite; one `BEGIN IMMEDIATE` transaction inserts meta, owner identity/credential, optional legacy identity/credential, bootstrap row, and the one global genesis event. Commit and checked checkpoint. |
| `DB_COMMITTED` | anchor publish -> `ANCHOR_COMMITTED` | Write/fsync no-replace external anchor bound to database, migration plan, authority instance/generation, and genesis event; ambiguity blocks. |
| `ANCHOR_COMMITTED` | `activate` -> `OWNER_ACTIVE` | Reopen and validate database, anchor, plan binding, complete global event chain, owner locator digest/ACL, optional token digest/ACL, and schema. Atomically advance state; owner authentication becomes available only after this check. |
| `OWNER_ACTIVE` | no legacy -> `COMPLETE`; legacy present -> `LEGACY_ACTIVE` | Select only the branch already bound in the plan. No identity, credential, event, or generation is added. |
| `LEGACY_ACTIVE` | owner rotate/revoke -> `LEGACY_REVOKED` | Authenticated owner atomically issues a replacement agent credential if requested, revokes legacy credential, increments epochs, and appends the next global event. Old token is unusable after commit. |
| `LEGACY_REVOKED` | cleanup -> `COMPLETE` | Remove only the unchanged expected legacy regular file; fsync parent; record absence/file-identity outcome and complete. |
| `COMPLETE` | verify -> `COMPLETE` | Read-only validation; no new identity or generation. |
| any nonterminal | contradiction -> `BLOCKED` | Persist no guessed repair. Return a closed migration/integrity error; owner decision required. |

`BLOCKED` is not automatically clearable. An owner-authenticated recovery
`migration.recover` operation must prove the exact expected predecessor and
append a resolution receipt. Deleting the database/plan, regenerating IDs, or
adopting changed token bytes is not recovery.

### 6.3 Crash, retry, duplicate, and concurrency outcomes

| Crash/retry point | Required behavior |
| --- | --- |
| Before temporary plan rename | Remove only the implementation-owned verified temporary file. Retry starts at `UNINITIALIZED`. |
| After plan rename, before owner locator creation | Validate and reuse the same plan/IDs/idempotency key; regenerate no ID. If the in-memory secret was lost before a locator existed, mark the plan blocked and restart only through explicit owner recovery; never substitute a new secret under the same plan. |
| After owner locator creation, before DB transaction | Reopen the exact locator through a no-follow handle only as unfinished bootstrap recovery, recompute its credential ID/digest, and reuse it. Any mismatch or alias blocks. |
| During bootstrap SQLite publication after durable owner locator staging | SQLite rollback leaves `OWNER_LOCATOR_STAGED`; retry reopens and revalidates the exact no-replace locator, plan, optional legacy token, and credential binding before repeating DB publication. It never regresses to `PLAN_STAGED`, generates a replacement secret, overwrites the locator, or re-reveals it. |
| After DB commit, before plan state update | Discover the unique bootstrap idempotency key and complete genesis event; verify every field/digest, then advance to `DB_COMMITTED`. Never insert a second owner or legacy agent. |
| After DB commit, before anchor commit | Validate the exact database/genesis/plan/locator tuple and create only the one canonical anchor named by the plan; a conflicting anchor blocks. |
| After anchor commit, before activation | Validate the complete anchor/DB/plan/global-event chain and advance to `ANCHOR_COMMITTED`; no authentication is accepted until activation. |
| After activation | Repeated startup verifies the same owner/optional legacy identities. It does not append a duplicate event or increment an epoch. Repeat administration requires the protected owner credential locator. |
| After legacy revoke, before token removal | Database denial wins. Retry removes only unchanged expected file and advances state. |
| After token removal, before state update | Verified absence plus committed revocation advances to `COMPLETE`. |
| Malformed plan, token, DB, global-event chain, permission, or digest | `GKOS_P6_MIGRATION_MALFORMED` or `GKOS_P6_AUTHORITY_CORRUPT`; no mutation except a safe pre-publication owned-temp cleanup. |
| Same key concurrent startup | One exclusive lease holder progresses; the loser returns `GKOS_P6_CONCURRENCY_LIMIT` with retry-after 100 ms and performs zero mutation. |
| Different key/digest against staged or committed state | `GKOS_P6_MIGRATION_CONFLICT`; no adoption, overwrite, delete, or rollback. |
| Duplicate identity/credential selector | Stop-class collision error; no automatic retry with a new identity because that would hide evidence. |

F1 freezes `BOOTSTRAP-SOURCE-001` through `BOOTSTRAP-SOURCE-004`: omission is
schema-invalid; declared `absent` plus verified physical absence succeeds;
declared `desktop_agent_token` plus the exact valid physical source succeeds;
and either declaration/state mismatch fails as migration conflict without a
plan, identity, credential, or database mutation. A malformed declared-present
source is separately covered by the existing malformed-source fixture.

F1 also freezes `CREDENTIAL-RESULT-001` through `CREDENTIAL-RESULT-004`: first
successful issue after completed handoff returns `secret_revealed=true`; exact
issue replay returns the identical credential/receipt coordinates with
`secret_revealed=false`; and rotate atomically revokes the old credential with
zero grace while the first completed handoff is true and its replay is false.
`CREDENTIAL-RESULT-004` forces a handoff failure after the credential commit:
the target remains active but unrecoverable, the first result and exact replay
both report the same mutation/receipt coordinates with `secret_revealed=false`,
no second handoff occurs, and owner recovery requires a new rotation key.
Every result is schema-checked to contain no raw credential field or bytes.

Rationale: the plan-before-database sequence makes service-generated identity
stable across crashes, while database-first revocation makes legacy file
cleanup safe. The existing token survives migration for compatibility but
gains no authority beyond its single migrated identity.

## 7. D0-10 — exhaustive closed errors

The machine-readable registry is
`PHASE6_D0_CLOSED_ERROR_REGISTRY_1.0.0-draft.1.json` in this proposal
directory. It contains 53 and only 53 public/owner projection codes. F1 must
copy the registry into the pack schema/fixtures without semantic change and
prove that every thrown implementation condition maps to one registry member.

Every error envelope has exactly:

```text
contract_version, error_code, request_id, retryable,
retry_after_ms, error_digest
```

`error_digest` covers canonical public envelope bytes with itself omitted.
There is no free-form `message`, `detail`, path, subject, selector, policy
trace, SQL, exception, or stack field. The sole projections and interface
aliases are those in section 0.2 and the machine registry. MCP tool-domain
failures are successful JSON-RPC `CallToolResult` values with `isError=true`;
only framing/protocol failures use JSON-RPC error objects. A transport may wrap
but not alter the envelope.

The CLI exit classes are exact: 2 invalid input/protocol, 3 authentication/
authorization/state, 4 bounded temporary/time/cancellation, and 5 integrity/
storage/security/internal. Native SQLite/Node/Rust/OS codes never escape.
Unknown or newly thrown conditions become `GKOS_P6_INTERNAL_ERROR` and trigger
a missing-fixture failure; adding a public error requires a new pack version.

Malformed, unknown, selector-mismatch, disabled-agent, and revoked-credential
presentations are intentionally indistinguishable as `GKOS_P6_AUTH_FAILED` at
an unauthenticated boundary. Distinct disabled/revoked state is available only
to an authenticated owner inspection operation. This avoids a credential and
identity oracle.

The registry's CLI/HTTP/MCP projections are normative. In particular, peer,
Host, and Origin have distinct closed 403 codes; every method other than exact
`POST`/`DELETE` shares the closed 405 code and `Allow: POST, DELETE`; invalid
DELETE body/framing/Content-Type variants share the closed 400 code; the three
POST Content-Type failures share the closed 415 code;
the three protocol-version failures share the closed 400 code; Accept
negotiation is the closed 406 code; invalid/expired/unknown/terminated MCP
sessions are the same non-enumerating 404 code; unknown JSON-RPC methods use
the distinct HTTP-200/`-32601` code; unknown
tool names and malformed call parameters use protocol `-32602`; and
schema-valid call framing with invalid tool arguments returns a tool execution
error. The coordinated
transport proposal selects native stdio and loopback Streamable HTTP for F3;
neither is implemented or qualified by this D0 proposal.

F1 freezes 22 exact pre-dispatch vectors: non-loopback peer, invalid peer
metadata, invalid Host, invalid Origin, valid-Origin GET, an arbitrary valid
extension method, invalid/unavailable method metadata, DELETE with body,
DELETE with Content-Type, DELETE with both, POST missing/malformed/unsupported
Content-Type, missing-with-session/malformed/unsupported protocol
version, unacceptable Accept, invalid/expired/unknown-or-terminated session,
and missing/invalid authentication. Every vector asserts the exact canonical
envelope code/status and proves no lower-precedence handler ran. The grouped
method, DELETE, POST media, protocol-version, session, and authentication variants must be
byte-identical within their group. Stage-4 vectors are
`ERROR-HTTP-GET-001`, `ERROR-HTTP-METHOD-EXTENSION-002`, and
`ERROR-HTTP-METHOD-INVALID-003`; stage-5 DELETE vectors are
`ERROR-HTTP-DELETE-BODY-001`, `ERROR-HTTP-DELETE-CONTENT-TYPE-002`, and
`ERROR-HTTP-DELETE-BODY-CONTENT-TYPE-003`. `ERROR-JSONRPC-METHOD-001` separately proves
HTTP 200/`-32601`; `ERROR-JSONRPC-TOOL-001` proves unknown tool remains
`-32602`. Three graph-scope vectors prove missing scope cannot issue a record
ref, live same-session scope binds the complete filter/snapshot tuple, and
stale or cross-bound scope fails before projection. The three cursor vectors
in section 0.9 add one canonical-final acceptance and two pad-bit alias
rejections. Together with the pre-V5 coordinated cases, the interface fixture
count is exactly 67.

## 8. D0-11 — exact bounded limits

All limits are hard ceilings. A lower tool-specific limit may be frozen by the
coordinated tool registry. No caller, configuration file, environment variable, transport header,
or Lite implementation may raise one without a new Full contract version.

### 8.1 Population, concurrency, and rate

| Limit | Exact value | Failure |
| --- | ---: | --- |
| Agents per vault, including disabled | 4,096 | `GKOS_P6_DATABASE_CAPACITY` |
| Credentials per vault, including revoked | 65,536 | `GKOS_P6_DATABASE_CAPACITY` |
| Active credentials per agent | 4 | `GKOS_P6_STATE_CONFLICT` |
| External mappings per agent / per vault | 16 / 65,536 | `GKOS_P6_DATABASE_CAPACITY` |
| Open sessions per agent / per vault | 8 / 256 | `GKOS_P6_CONCURRENCY_LIMIT` |
| Concurrent admitted requests per agent / per vault | 4 / 32 | `GKOS_P6_CONCURRENCY_LIMIT` |
| Concurrent owner lifecycle mutations per vault | 1 | `GKOS_P6_CONCURRENCY_LIMIT` |
| Concurrent irreversible effects per vault | 1, additionally governed by existing effect lease | `GKOS_P6_CONCURRENCY_LIMIT` |
| Committed external anchors per owner anchor root | 256; exactly one canonical filename per vault | `GKOS_P6_DATABASE_CAPACITY` |
| Pending anchor intents per committed anchor | 1 | `GKOS_P6_AUTHORITY_CORRUPT` |
| Per-agent request bucket | capacity 10; refill 1 token per 1,000 ms | `GKOS_P6_RATE_LIMITED` |
| Global request bucket | capacity 100; refill 10 tokens per 1,000 ms | `GKOS_P6_RATE_LIMITED` |
| Per presented credential selector authentication-failure bucket | capacity 3; refill 1 token per 6,000 ms | `GKOS_P6_RATE_LIMITED` |
| Global authentication-failure bucket | capacity 20; refill 2 tokens per 1,000 ms | `GKOS_P6_RATE_LIMITED` |

Rate buckets use integer microtokens, persisted in SQLite. Refill uses
`effective_now=max(stored_last_refill_ms, service_wall_clock_ms)` so a backward
clock move creates no tokens. While a process is live, it compares wall-clock
delta to monotonic-clock delta; an absolute divergence over 300,000 ms returns
`GKOS_P6_CLOCK_INVALID` until owner recovery. Normal suspend advances both and
does not itself trip the gate. Across restart, there is no backward refill.
Unknown credential selectors are bucketed by a domain-separated SHA-256 of the
presented canonical selector; at most 4096 such buckets are retained, while the
global failure bucket remains non-evictable. Rate decisions and retry-after are
made in the authority transaction. `retry_after_ms` is the minimum integer
milliseconds to one token, capped at 60,000.

Rationale: four concurrent requests per agent and 32 per vault permit local
parallelism without making the synchronous SQLite and existing single-writer
effects seams unbounded. Dual per-agent/global buckets contain both one noisy
agent and aggregate credential guessing.

### 8.2 Byte, field, and collection limits

| Item | Exact ceiling |
| --- | ---: |
| Transport request body/envelope | 393,216 bytes |
| Canonical operation input | 262,144 bytes |
| Canonical successful output | 1,048,576 bytes |
| Canonical public error envelope | 4,096 bytes |
| One protocol identifier / operation / capability / namespace | 64 UTF-8 bytes |
| Display name | 128 UTF-8 bytes |
| Owner reason string | 256 UTF-8 bytes |
| General bounded string unless schema is lower | 512 UTF-8 bytes |
| Idempotency key accepted at boundary | 128 ASCII bytes; store digest only |
| Policy reason codes | 16 entries x 64 ASCII bytes |
| Activity metadata | 16 keys, 8,192 canonical bytes |
| One canonical activity record | 16,384 bytes |
| One canonical identity audit receipt | 32,768 bytes |
| One anchor or anchor intent | 16,384 canonical bytes |
| One authority backup manifest | 16,384 canonical bytes |
| One safe structured log event | 4,096 bytes, metadata subset <=2,048 bytes |
| Paginated result page | 100 records and <=1,048,576 bytes |
| Opaque cursor | exactly 50 ASCII bytes; `gkcur1_` plus 42 base64url and final `[AEIMQUYcgkosw048]`; strict 32-byte decode/re-encode |
| Page snapshot | 2,000 entries and 524,288 canonical bytes |
| Active page snapshots | 8 per agent / 128 per vault |
| Live opaque record/scope references | 2,048 per session / 32,768 per process-vault; process memory only |
| Navigation immutable snapshot | 16,777,216 bytes; 8 active per vault |
| Nested JSON depth | 16 object/array levels |
| Object properties / array items unless lower | 128 / 1,024 |

Size is counted after UTF-8 validation and NFC normalization, before
operation execution. Compressed requests are unavailable in 1.0.0; there is no
decompression ratio ambiguity. Logs use an allowlist of identifiers, digests,
closed codes, integer sizes/durations, and coarse outcome. They exclude the
same content and secrets as activity.

### 8.3 Time, session, cancellation, storage, and retention

| Item | Exact value |
| --- | ---: |
| Authentication plus authority lookup deadline | 2,000 ms |
| Owner lifecycle mutation deadline | 10,000 ms |
| Default and maximum core request deadline | 30,000 ms |
| Cancellation acknowledgement deadline | 1,000 ms |
| Cancellation cooperative settle deadline before forced session stale | 5,000 ms |
| Graceful server shutdown deadline | 10,000 ms |
| Session idle lifetime | 900,000 ms (15 min) |
| Session absolute lifetime | 28,800,000 ms (8 h) |
| Idempotency replay window | 86,400,000 ms (24 h) |
| Cursor/page-snapshot lifetime | 900,000 ms (15 min) |
| Navigation snapshot default lifetime | 900,000 ms (15 min) |
| Vault-lease acquisition wait | 5,000 ms; retry-after 100 ms on contention |
| Activity rows | 1,000,000 |
| Completed request rows before retention sweep | 100,000 |
| SQLite page size / max pages / maximum DB bytes | 4,096 / 131,072 / 536,870,912 |
| Retention sweep batch | 1,000 rows |
| Default retained history | 90 complete UTC days |
| Owner retention override | integer 7..365 complete UTC days |

Deadline is the lower of the server ceiling and a valid caller-requested
deadline. A caller cannot extend a deadline. Timeout/cancellation stops result
publication, but cannot claim rollback after a qualified effect has crossed
its existing irreversible commit seam; the race table governs that case.

Before admitting an operation, the service reserves enough database capacity
for request, decision, activity, and any required receipt. At an activity row
or database cap, it performs one eligible retention sweep. If capacity remains
insufficient, it admits no ordinary operation and returns the applicable
capacity error; it never executes work that cannot be recorded. Offline owner
recovery uses the local-only `migration.recover` or `authority.restore`
operation and the rollback rules in section 0.5.

## 9. D0-12 — platform, runtime, dependency, and availability matrix

`required` is stage-scoped. At F1 it requires only contract parsing, strict
schema/meta-schema validation, canonical vectors, deterministic generation,
inventory, and archive checks on the listed language/runtime lane. It does not
prove live SQLite authority, ACL/no-follow behavior, crash recovery, sessions,
transport, or effects. F2 proves reference authority semantics; F4 supplies
independent runtime adversarial fixtures; F5 reruns the accepted F2-F4 product
on every required Full platform and is the first Full platform-support claim.
Lite L4 is the corresponding Lite platform/evidence claim. `optional` means a passing result may be reported
but its absence is not support. `unavailable` means the product must return a
closed unavailable error or not expose the surface; it may not silently fall
back. A skip is legal only for an `optional` or `unavailable` row and must use
the exact receipt grammar `UNAVAILABLE:<matrix-id>:<closed-reason-code>`.

### 9.1 Full authority contract matrix

| Matrix ID | State | Exact combination | Notes |
| --- | --- | --- | --- |
| `FULL-LINUX-N22` | required | `ubuntu-24.04`, x86_64, setup-node selector `22`, npm 10.9.4, TS 5.9.3, Ajv 8.20.0, ajv-formats 3.0.1 | Receipt freezes exact `node --version`, npm, kernel, CPU, and SQLite versions. |
| `FULL-LINUX-N23` | required | same, setup-node selector `23` | Node 23 remains required because current `package.json` explicitly supports `<25`; removing it is a separately reviewed semver/platform change. |
| `FULL-LINUX-N24` | required | same, setup-node selector `24` | Primary adversarial and pack lane. |
| `FULL-WINDOWS-N22` | required | `windows-2025`, x86_64, Node selector `22`, npm 10.9.4 | F1 proves contract portability only; F5 must prove physical path and owner ACL behavior. |
| `FULL-WINDOWS-N23` | required | same, Node selector `23` | No MSYS path substitution in product tests. |
| `FULL-WINDOWS-N24` | required | same, Node selector `24` | F5 must cover fresh process/recovery and partial-lock regressions; F1 makes no such claim. |
| `FULL-MACOS-N22` | required | owner-verified maintained `macos-15`, arm64, Node selector `22`, npm 10.9.4 | F5 must canonicalize `/var` physical aliases without weakening product alias rejection; F1 records the exact image but proves contract portability only. |
| `FULL-MACOS-N23-N24` | optional | same maintained named image, arm64, Node selectors `23` and `24` | Becomes required only by a later owner matrix revision. |
| `FULL-LINUX-AARCH64` | optional | Ubuntu 24.04 aarch64, Node 22 | No Phase-6 support claim from absence. |
| `FULL-MACOS-X64` | optional | maintained named macOS x86_64 image, Node 22 | Existing sidecar packaging evidence does not qualify identity. |
| `FULL-32BIT-BIGENDIAN` | unavailable | every 32-bit or big-endian target | Contract version 1.0.0 has no qualification lane. |
| `FULL-NODE-OUTSIDE-RANGE` | unavailable | Node <22 or >=25 | Must fail before authority database open. |

Node selectors express the supported patch set within the repository's
declared major range; every run receipt makes the exact resolved patch
auditable. F1 is forbidden from narrowing or widening `package.json`.
TypeScript, Ajv, ajv-formats, and npm are exact qualification tool versions as
listed above. Production code may use only current dependencies and Node core;
F1 adds none.

Beginning at F2, Node's built-in SQLite is required and must report SQLite >=3.45.0 with
foreign keys, integrity check, WAL, and required pragmas available. FTS is not
required for identity. An older/missing SQLite or unverifiable filesystem
protection is `GKOS_P6_PLATFORM_UNAVAILABLE`, not an in-memory authority
fallback.

The core identity authority is transport-neutral. Native stdio and loopback
Streamable HTTP are selected only as proposed F3 façades; they remain
unavailable as product claims until F3 and F5 qualify them. Existing loopback
read-only desktop helper behavior is a protected regression surface, not the
new authority transport. Desktop identity activation and Linux desktop are
unavailable until F3/F5 explicitly qualify them.

### 9.2 Lite conformance matrix

The Lite rows become executable only after the exact Full F1/F5 hosted-green
pin and copied pack are recorded. They prove conformance, not Rust authority or
a Phase-9 static release claim.

| Matrix ID | State | Exact combination | Notes |
| --- | --- | --- | --- |
| `LITE-LINUX-MSRV` | required | Ubuntu 24.04 x86_64, Rust 1.85.0, Cargo locked, default target `x86_64-unknown-linux-gnu` | Schema/fixture verifier and wrapper conformance only. |
| `LITE-LINUX-CURRENT` | required | Ubuntu 24.04 x86_64, Rust 1.98.0 | Exact copied Full pin and negative vectors. |
| `LITE-WINDOWS-CURRENT` | required | Windows 2025 x86_64, Rust 1.98.0, `x86_64-pc-windows-msvc`, MSVC linker | Missing linker is hosted failure, not a passing skip. |
| `LITE-MACOS-CURRENT` | required | same owner-verified maintained named arm64 image as Full, Rust 1.98.0, Apple clang linker | Contract/wrapper conformance. |
| `LITE-AARCH64-LINUX` | optional | Ubuntu 24.04 aarch64, Rust 1.98.0 | Does not establish static packaging. |
| `LITE-MACOS-X64` | optional | maintained named macOS x86_64 image, Rust 1.98.0 | No release claim. |
| `LITE-MUSL-STATIC` | unavailable in Phase 6 | Linux musl targets | Reserved for Phase 9 transitive linkage qualification. |
| `LITE-MOBILE-WASM` | unavailable | Android, iOS, WASM | No authority or wrapper contract. |

Phase-6 deterministic code may require only the architecture baseline supplied
by the named Rust targets. It may not require AVX, AVX2, FMA, or an optional
native model. Sandy/Ivy Bridge, one-static-binary, model embedding, archive
composition, signing, notarization, and clean-machine release qualification
remain Phase 9 and are not inferred from these lanes.

## 10. D0-13 — qualification, artifacts, and evidence

### 10.1 Required local F1 sequence

Run from a clean branch created at the approved Full entry, with no generated
credential and no live user vault:

```text
npm ci --ignore-scripts
npm --version                         # exactly 10.9.4 after environment setup
npm run typecheck
npm run build
node scripts/generate-agent-identity-mcp-contract.mjs --check
node --test test/agent-identity-mcp-contract.test.mjs
npm test
npm run test:navigation
npm run test:intelligence
npm run check:license
npm run check:nomenclature
npm run pack:check
git diff --check
git status --short
```

Before the checked generator command, the environment owner installs the exact
npm 10.9.4 tool without changing repository files. The receipt records the
installation command and actual tool hashes. F1's generator runs twice into
two separately created, physically resolved temporary roots. The test compares
all 34 pack leaves byte-for-byte, validates the 33-leaf non-self-listing
manifest, recompiles every schema in strict Ajv, consumes every positive and
negative contract fixture exactly once, checks all 67 MCP/source-domain
conformance vectors as declarative closed data, and proves allowed/protected
inventory. It does not start a server, create authority SQLite, inspect a live
ACL, generate a usable credential, execute a migration, inject a crash, or call
an irreversible effect.

The full suite and every focused suite must have exit 0. Existing explicit
platform skips remain allowed only when they are unchanged from the approved
base and are listed in the qualification receipt. A new skip, TODO, `only`,
filtered test, snapshot rewrite, self-allowlist, warning-as-pass, or weakened
fixture is failure.

The general Full/Navigation/Intelligence suites above are protected Phase 0-5
regression gates only. Their success at F1 does not qualify Phase-6 authority,
transport, recovery, ACL, effect-bridge, or platform behavior.

### 10.2 Full hosted workflow

Workflow path and displayed name:

```text
.github/workflows/phase6-identity-contract.yml
GKOS Phase 6 identity contract qualification
```

It has exactly these 11 jobs, all required:

1. `p6-f1-contract-linux-node22`
2. `p6-f1-contract-linux-node23`
3. `p6-f1-contract-linux-node24`
4. `p6-f1-contract-windows-node22`
5. `p6-f1-contract-windows-node23`
6. `p6-f1-contract-windows-node24`
7. `p6-f1-contract-macos-node22`
8. `p6-f1-schema-adversarial`
9. `p6-f1-pack-reproducibility`
10. `p6-f1-secret-scan`
11. `p6-f1-artifact-audit`

The first seven run the focused contract gate plus typecheck/build and the
existing platform-relevant regression suite without making a Phase-6 runtime
claim. Node 24 Linux additionally runs the full package gates. The F1
schema-adversarial job consumes only malformed schema instances, canonical
byte/Unicode/number/timestamp/UID vectors, duplicate/alias catalog entries,
closed error projections, inventory violations, and manifest/archive
negatives. Credential authentication, stale epoch, replay execution,
concurrent migration, crash injection, live ACL/no-follow behavior, session
lifecycle, and effect-bridge recovery belong to F2/F4/F5 and are forbidden as
F1 acceptance claims. The reproducibility job generates from two
fresh roots and creates the deterministic pack archive. The secret scan checks
source, generated pack, captured command logs, database fixtures, and
artifact payloads for credential wire patterns, forbidden secret-valued keys,
raw legacy-token fixtures, private key blocks, and high-entropy fixture fields.
Any finding is `GKOS_P6_SECRET_EXPOSURE`; no baseline suppression can match a
whole credential or file.

The terminal audit downloads and validates the ten predecessor artifacts,
recomputes inner manifests and deterministic archive digest, checks the GitHub
API all-and-only job conclusion set, verifies base/head/pack coordinates, then
uploads its own receipt. No job may inspect an artifact by trusting only its
name or outer GitHub ZIP metadata.

### 10.3 Exact Full artifact inventory

There are exactly 11 retained workflow artifacts, one per job, with these
names:

```text
gkos-p6-f1-linux-node22-receipt
gkos-p6-f1-linux-node23-receipt
gkos-p6-f1-linux-node24-receipt
gkos-p6-f1-windows-node22-receipt
gkos-p6-f1-windows-node23-receipt
gkos-p6-f1-windows-node24-receipt
gkos-p6-f1-macos-node22-receipt
gkos-p6-f1-adversarial-receipt
gkos-p6-f1-contract-pack
gkos-p6-f1-secret-scan-receipt
gkos-p6-f1-terminal-audit-receipt
```

Each receipt artifact contains exactly one canonical
`qualification-receipt.json`. Its schema requires contract/base/head/workflow/
run/job coordinates, runner image, OS/architecture/CPU, exact tool and SQLite
versions, command list with exit/result/test/pass/fail/skip counts, allowed and
protected list digests, pack aggregate digest, input/output artifact digests,
secret scan result, start/end timestamps, and terminal `PASS|FAIL`. It forbids
environment dumps, paths outside repository-relative coordinates, and secrets.

`gkos-p6-f1-contract-pack` instead contains exactly:

```text
GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1.tar
GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1.tar.sha256
qualification-receipt.json
```

The tar has sorted names, normalized `/` paths, file mode `0644`, directory
mode `0755`, owner/group numeric 0, empty owner/group names, and mtime exactly
Unix epoch 0. Its inner root contains the exact 34 pack
leaves. The `.sha256` file is lowercase raw SHA-256, two spaces, archive
basename, terminal LF. The terminal auditor recomputes raw archive SHA and all
inner leaf/aggregate digests after extraction under a fresh physical root.

GitHub's outer artifact archive is not reproducible evidence and is not the
digest subject. Artifact retention is exactly 90 days; the committed evidence
record keeps coordinates/digests, not artifact content.

### 10.4 Committed evidence and Lite follow-on

The input commit `C_in` carries an evidence plan at
`evidence/2026-08-25-functional-uplift-phase-6-f1.md` with no future run or
result SHA. After qualification and independent review, the evidence-only
closeout commit `C_att` updates that file with the approved entry, `C_in`,
branch/draft PR, workflow/run, exact 11 job conclusions, exact 11 artifact
names and inner digests, pack aggregate, allowed/protected hashes, test counts,
detached reviewer-verdict coordinate/hash, and unresolved risks. Section 0.3
governs the acyclic protocol. It contains no claim of F2 authority, F3 product
transport, active MCP, Lite parity, merge, release, deployment, activation, or
publication.

After Full F5 is hosted green, Lite copies the exact pack and records the full
40-hex Full pin. The proposed Lite workflow name is
`GKOS Phase 6 Full-pin conformance`, with required jobs
`p6-l1-rust-msrv-linux`, `p6-l1-rust-current-linux`,
`p6-l1-rust-current-windows`, `p6-l1-rust-current-macos`,
`p6-l1-cross-language-fixtures`, and `p6-l1-artifact-audit`. Each job emits one
analogously named receipt artifact, for exactly six artifacts. This names the
evidence scheme only; Lite path inventory and execution remain blocked until
Full F5 and their own approved work package.

### 10.5 F2, F4, and F5 runtime/evidence separation

- **F2 authority:** implements the accepted F1 records and runs deterministic
  authority unit/integration tests on the reference Linux lane: bootstrap owner
  authentication, credentials, sessions, generations, global event/anchor
  protocol, migration/restore, SQLite recovery, and the A-to-E bridge. It makes
  no cross-platform support claim.
- **F4 adversarial:** independently authors and executes negatives against the
  accepted F2/F3 SHAs: credential/identity collisions, session
  non-enumeration, stale epochs, replay, concurrent lifecycle/migration,
  anchor/backup rollback, crash at every durable point, alias/reparse races,
  bridge recovery, and closed-error parity. F4 does not repair product bytes or
  change expected outcomes.
- **F5 platform/evidence:** runs the exact accepted F2/F3/F4 product and
  adversarial corpus on every required Full matrix row, including native
  POSIX/Windows ACL, physical-path, SQLite, crash/restart, transport, and
  Effects integration. It audits all-and-only artifacts and is the first
  Full platform-support/evidence claim. F1 receipts cannot be relabeled as F5.

The exact F2/F4/F5 workflow inventories and retained artifacts must be frozen
in their owner-approved work packages after predecessor acceptance; they are
not generated or claimed by the F1 contract workflow.

### 10.6 Archive and digest failure semantics

Missing, extra, duplicate/case-aliased, expired-before-audit, malformed,
wrong-coordinate, wrong-count, wrong-digest, noncanonical, secret-bearing, or
uninspectable artifacts are `GKOS_P6_EVIDENCE_MISMATCH` (or
`GKOS_P6_SECRET_EXPOSURE` when applicable). Re-running and recording a new run
is the only cure; an evidence owner cannot manually relabel a failed/missing
artifact as pass. The terminal job must fail if any predecessor job was
skipped, cancelled, neutral, timed out, or successful without its exact
receipt.

## 11. D0-15 — stop authority and decision record

Anyone reviewing or implementing may declare an immediate stop when a frozen
class is encountered. The Orchestrator owns process suspension and prevents
downstream assignment. It does not own semantic waiver. The Product Owner owns
semantic resolution, subject to the named, contribution-history-independent
concurrence in section 0.11 and governance correction. Generic reviewer labels
in the table below mean those exact named roles, with mandatory fresh
replacement on recusal. Work resumes only when the exact decision and replacement evidence are
committed in the named artifacts.

| Stop class | Immediate stop may be raised by | Resolution authority and mandatory concurrence | Exact resolution artifact / non-waivable rule |
| --- | --- | --- | --- |
| Credential encoding, entropy, digest/KDF, reveal, storage, rotation | any contributor; security reviewer must stop on weakness | Product Owner; fresh `/root/phase6_security_reviewer` concurrence | Amend/ratify ADR-0006 and versioned pack decision. A secret or entropy weakness cannot be grandfathered. |
| Disable/revoke semantics or stale credential | any contributor | Product Owner; independent authority/concurrency reviewer | ADR-0006 plus race fixture and qualification receipt. No grace/default inference. |
| Bootstrap/default identity/legacy token | any contributor | Product Owner; fresh `/root/phase6_migration_reviewer` | ADR-0006 migration section plus crash fixture/receipt. No auto-created anonymous identity. |
| Identity/credential/mapping collision | any contributor | Product Owner; fresh `/root/phase6_security_reviewer` concurrence | Collision decision in ADR-0006 and negative receipt. No overwrite, retry-to-hide, alias, or caller identity. |
| MCP/CLI/HTTP error or unknown condition | contract/transport reviewer | Product Owner; fresh `/root/phase6_full_contract_steward` and `/root/phase6_lite_conformance_reviewer` concur | Versioned closed registry and error fixture. Lite cannot originate resolution. |
| Redaction/content leakage | anyone; security reviewer has mandatory halt authority | Product Owner and fresh `/root/phase6_security_reviewer` jointly | Redaction decision, replacement security fixture, clean secret/content scan receipt. Cannot suppress the leaked value. |
| Disable/rotate/reconnect/cancel/recovery race winner | concurrency reviewer or implementer | Product Owner; independent concurrency reviewer | ADR-0006 linearization decision, deterministic race fixture, all required platform receipts. Timing-dependent pass is not resolution. |
| Migration transition/crash/retry/duplicate | migration reviewer or implementer | Product Owner; fresh `/root/phase6_migration_reviewer` and `/root/phase6_security_reviewer` separately concur | ADR-0006 state-machine amendment and recovery fixture/receipt. Destructive reset is not accepted recovery. |
| Secret exposure | anyone; security reviewer immediately halts every affected lane | Product Owner and fresh `/root/phase6_security_reviewer` jointly; Orchestrator coordinates containment outside evidence | Secret-free incident record, affected credential rotation/revocation evidence outside repo, history scan result, clean replacement run. The secret itself is never recorded. No waiver. |
| Evidence/job/artifact/digest mismatch | evidence auditor or reviewer | Evidence Auditor determines mismatch; Product Owner may change future requirements but cannot turn mismatched evidence into a pass | Corrected evidence record and entirely new terminal-green run/artifact set. No manual hash/count override. |

The review-time decision artifact is
`PHASE6_D0_CORE_DECISION_RECORD_PROPOSAL_2026-08-25.json` in this directory.
On ratification, its adopted values are copied into
`docs/decisions/0006-phase6-agent-identity-mcp-contract.md`. Every stop
resolution adds a section with exactly:

`decision_id` UUIDv7, `stop_class`, `raised_at`, `raised_by_role`,
`affected_full_commit`, nullable `affected_lite_commit`, `observed_code`,
`redacted_evidence_digests`, `options_considered`, `selected_rule`,
`contract_version_before`, `contract_version_after`, `owner_decided_at`,
`owner_decision_digest`, `required_concurrence_roles`,
`concurrence_receipt_digests`, `replacement_fixture_ids`,
`replacement_hosted_run`, `resolution_state=accepted|rejected`, and
`record_digest`.

No field contains the secret, leaked content, raw external subject, absolute
local path, or private identity. A semantic change increments the contract
version. A correction that does not change semantics still requires new
fixture/evidence digests. An unresolved or rejected record keeps the package
stopped.

## 12. Cross-contract invariants and forbidden claims

The following are unconditional across the coordinated interface artifacts:

1. A caller never selects `agent_id`, `session_id`, `request_id`, authority
   generation, policy decision, or activity attribution.
2. Authentication and authorization run for every operation. Deny,
   indeterminate, timeout, corruption, permission uncertainty, stale epoch,
   and unmapped failure are closed.
3. No query, note body, snippet, raw protocol payload, raw subject, credential,
   source content, or unrestricted filesystem path enters identity storage,
   activity, logs, error, receipt, fixture, or artifact.
4. External mapping requires a separately authenticated stable namespace and
   subject contract. Until then it is unavailable.
5. Identity activity and identity audit receipts do not gain GKOS governance
   State-Change Receipt standing by name, database, or shared interface.
6. Identity contracts do not amend qualified navigation, navigation-effects,
   watcher, retrieval, ingestion, governance, or source-content-read-only
   semantics.
7. A fresh process/executor cannot bypass unsafe persistent recovery,
   revocation, disable, rate, or migration state.
8. Lite consumes exact Full canonical bytes and errors. A Rust-friendly alias,
   relaxed parser, extra enum, lower-precision generation, or weaker denial is
   nonconformance.
9. No Phase-6 artifact proves a Phase-9 static binary, old-CPU release,
   signing/notarization, deployment, activation, publication, or merge.

## 13. Remaining owner decisions and conflicts

This corrected proposal coordinates but does not owner-ratify:

- **D0-7:** the exact operation inventory proposal in section 0.1;
- **D0-8:** the exact transport/lifecycle instance in section 0.1;
- **D0-9:** the self-contained strict registry/catalog proposals in section
  0.1; and
- **D0-14:** governance revision `governance-correction.3` at the exact hash in
  section 0.11, pending independent governance re-review.

The Lite entry conflict is closed by the exact D0-1 coordinate above. L1 still
waits for a future hosted-green Full F5 pin; admission-green Lite is not a pin
to a not-yet-created F1/F5 pack.

Interface schemas may lower core limits and use closed metadata fields. They
may not add unbounded inputs, content-bearing activity, caller-selected
identity, a second public error/envelope, or a lifecycle semantic. A conflict
reopens the affected D0 item rather than being resolved in F1.

## 14. Freeze recommendation

Recommendation: **CORRECTION COMPLETE FOR RE-REVIEW / F1 NO-GO**.

The core values in D0-2, 3, 4, 5, 6, 10, 11, 12, 13, and 15 are sufficiently
explicit for owner review and independent adversarial review. Freeze them only
after the Product Owner ratifies or amends every proposed value, the proposal
files are rehashed, and the independent core reviewer reports zero unresolved
blocker/HIGH/MEDIUM.

Do not assign or start F1 until the coordinated D0-7, D0-8, D0-9, and D0-14
artifacts are independently accepted and the Product Owner ratifies one
coherent cross-hashed D0 record.
Do not implement
runtime identity, MCP transport, product schemas, migrations, database tables,
credentials, commits, pushes, releases, or publication from this proposal.
