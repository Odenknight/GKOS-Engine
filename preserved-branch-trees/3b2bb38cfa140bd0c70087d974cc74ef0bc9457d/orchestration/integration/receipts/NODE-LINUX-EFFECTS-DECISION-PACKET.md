# Node/Linux Navigation Effects decision packet

Date: 2026-08-31  
Standing: decision proposal; writes-disabled first stage only  
Selected host: Node.js on Linux

This packet answers Q-EFFECTS far enough to build and qualify a first host without activating source writes. It does not grant a writer, adopt a MOC, enable a route, name a production vault, or establish sudden-power-loss durability.

## Evidence read

- `orchestration/GKOS-ECOSYSTEM-TS-FIRST-RUST-ROADMAP.md`, especially Q-EFFECTS and T09.
- `orchestration/2026-08-31/reports/AUDIT-ENGINE-LITE-BENCHMARK.md`, including the `e4f00b3` planner/executor assessment.
- `orchestration/2026-08-31/reports/AUDIT-KOSMOS-MARSHAL.md` Effects inventory.
- `orchestration/2026-08-31/sources/GKOS-RUST-UPLIFT-R4-2026-08-27.md`, Phase 8 and safe defaults.
- Kosmos Effects `CAPABILITY-MATRIX.md`, `IMPLEMENTATION-HANDOFF.md`, `QUALIFICATION-PLAN.md`, and Packet B/C0 working results.
- Engine watcher host, storage-provider, identity, Governance Store, navigation-authority, and R15 receipt documents.
- The actual `e4f00b3a9289c1d35d1a02e50dcdc266945fe015` Effects types and Node executor/journal source inventory.

## Decisions already made

1. **Host family:** Node.js on Linux. This turn selects it; it does not qualify every Linux filesystem or distribution.
2. Navigation planning/diff/audit remains pure and read-only. Effects is a separate versioned plane.
3. Effects modes remain `off`, `propose` (intended default), and separately authorized `auto_apply`. A model, rank, confidence, token, client label, or timestamp cannot grant authority.
4. Existing MOCs are `unmanaged`. Adoption is an explicit credential-bound human act over exact bytes and ownership mode. Region-managed and fully-managed meanings stay distinct.
5. Every execution binds exact actor/credential, grant, capability, vault/root, object class, sensitivity ceiling, policy ID/version/digest, expiration, ownership, current target digest or required absence, config/source/corpus digests, and retention-clear state.
6. The existing Node candidate is cooperative-vault only. It does not defend against hostile concurrent ancestor replacement and reports `directoryFlush:false`; successful rename tests do not establish sudden-power-loss directory-entry durability.
7. Writes remain unavailable until adapter, authority provider, durable journal, exact policy, lease, startup recovery, reconciliation, ownership, explicit enablement, current authority, and current preconditions are independently true.
8. No MCP write endpoint is authorized. Viewer and current MCP credentials remain read-only. Proposal ingress and application remain separate.
9. Committed effects require an immutable, validated State-Change Receipt role. Receipt or durability failure cannot be reported committed. Existing governed artifacts may fulfill the role only if all required bindings and durability evidence are present.

## Recommended Node/Linux defaults requiring owner approval

These names and paths are recommended deployable defaults, not facts about an existing machine.

| Topic | Recommended default | Reason and boundary |
| --- | --- | --- |
| Service owner | Dedicated unprivileged account `gkos-engine`, primary group `gkos-engine`, no login shell, no sudo, no broad vault access | Separates host effects from the interactive user. The account receives DAC access only to explicitly enrolled vault/state roots. Root starts/manages the unit but the process never runs as root. Exact UID/GID and service manager need owner/operator selection. |
| Process manager | A hardened systemd system service per enrolled vault or a template unit keyed by nonsecret vault ID | Provides one lifecycle/stop boundary and can enforce `NoNewPrivileges`, private temp, restrictive umask, syscall/device/network restrictions, and explicit read/write path allowlists. The exact hardening profile must be tested against Node/SQLite/fsync needs. |
| Configuration root | `/etc/gkos-engine/<vault-id>/`, root-owned, `0750 root:gkos-engine`; nonsecret config `0640`; secrets referenced through owner-protected credentials, never embedded in TOML/logs | Ambient vault configuration must not grant listener, identity, or Effects authority. Configuration selects paths/providers only after secure reopen and policy verification. |
| Service state root | `/var/lib/gkos-engine/<vault-id>/`, owned `gkos-engine:gkos-engine`, directories `0700` | Holds service-local identity/status metadata, qualification state, and non-vault operational state. It is not the source vault and must not become a second semantic authority. |
| Runtime root | `/run/gkos-engine/<vault-id>/`, created by the service manager, `0700` | Holds PID/lock/socket/locator style ephemeral state only. Durable journal, receipts, ownership, or recovery truth must never depend on `/run`. |
| Vault root | Explicit absolute, canonical, securely reopened root selected by the operator; suggested deployment convention `/srv/gkos-vaults/<vault-id>/`, not an automatic discovery rule | Actual vault location is unknowable here. The service must reject aliases, links, unstable identity, mounts/reparse escapes it cannot qualify, and any root not explicitly enrolled. |
| Effects state | `<vault>/.gkx/effects/{ownership,journal,checkpoints,receipts,reconciliation,lease}` | This is the documented Effects state topology and is excluded from corpus projection. Direct, owner-only, non-link capability checks are mandatory. No ordinary coordinator cleanup deletes evidence. |
| Prior-version archive | `<vault>/_archive/moc-runs/YYYY-MM-DD/<run-id>/` | Documented archive topology, excluded from live projection. Archive manifests bind effect/plan/target/before/proposed/source/config/policy/authority digests. Retention and purge authority require a separate owner policy. |
| MOC write scope | Only exact adopted Engine-owned targets recorded in the ownership registry; no root-wide wildcard | Unmanaged targets deny. Region mode replaces exactly one valid marker-bound region while preserving every exterior byte; full mode requires adopted digest or explicit authorized absence for creation. |
| Agent-note scope | Default `_kosmos/agent-notes/<agent-slug>/` per credential; create/update/append/archive capabilities separately granted; delete remains unavailable | Preserves cross-agent isolation. The slug is a locator chosen at provisioning, never an identity or authority source. Traversal/link/collision/arbitrary-overwrite refusal is mandatory. |
| Grant issuer | A local human Effects administrator authenticated through a dedicated owner/admin credential and explicit operator command/UI, separate from viewer/MCP credentials and the executing agent | Current documents require a grant/authority provider but do not appoint a concrete issuer. Recommended issuer writes immutable grant/decision records under a durable admin plane; it cannot approve its own AI proposal by inference. Exact human roles and credential provisioning need owner approval. |
| Policy owner | Owner-approved versioned policy artifact with exact lowercase SHA-256, referenced identically by grant, plan, ownership, archive, journal, and receipt | A policy identifier without verified current bytes is insufficient. Policy drift invalidates plans and closes writes. |
| Default effect mode | `off` for Stage 0; `propose` after read-only qualification; `auto_apply` remains unavailable | Matches current safe defaults and lets status/plans be tested without making an effect entry point callable. |

## Durability and receipt persistence profile

Recommended qualification target: one local Linux filesystem where the exact mounted filesystem, kernel, Node version, SQLite build, mount options, rename semantics, file `fsync`, containing-directory `fsync`, locking, and crash/power-loss recovery have been tested. A generic “Linux” label is insufficient.

Before a source replacement, persist and reopen a hash-chained durable journal intent and immutable plan binding. Stage proposed bytes in the same qualified filesystem as the target, validate exact bytes/digest, persist archive-before evidence, flush staged file and required parent directories, atomically replace, flush the containing target directory, reopen and verify target bytes, append/finalize the immutable receipt and checkpoint, flush their files/directories, then report committed. The receipt binds actor/credential, grant/authority digest, policy, ownership, operation/idempotency/effect IDs, before/after/plan/source/config/corpus/archive/journal coordinates, outcome, time, and tested durability profile; it includes no note body.

This is the required target behavior. The recovered Node executor currently reports no directory flush, so it cannot satisfy this profile yet. Until a Node/Linux adapter implements and qualifies directory fsync and crash/power-loss seams, status must say durability unsupported and writes must remain disabled. If the chosen filesystem cannot support the required primitives, it remains an unsupported host rather than receiving a weaker “committed” meaning.

Receipt retention should be immutable and at least as long as the governed effect/archive/rollback period. Automated ordinary cleanup must not remove ownership receipts, nonterminal journals, recovery evidence, or archive bindings. Exact retention duration, authorized purge process, backup target, and external checkpoint policy remain owner decisions.

## Recovery and reconciliation

Startup obtains the sole vault lease, blocks write admission, securely reopens policy/config/root/state capabilities, verifies the ownership generation and every journal/checkpoint/receipt chain, and classifies temporary/target/archive bytes for each nonterminal effect. Corrupt, forked, missing, ambiguous, externally changed, or retention-held state latches writes closed and requires an authorized recovery decision. Recovery may finish an already verified replacement, retry an absent effect under still-current authority/preconditions, or record compensation/rollback; it must never guess from timestamps or discard contradictory bytes.

Reconciliation then compares exact source/config/policy/ownership/target/journal/archive state to a secure current snapshot. Filesystem events are hints; overflow/missed events force a full pass. Self-write suppression uses exact effect receipts, never a timing window. Shutdown stops admission, drains to a safe transaction boundary, persists reconciliation intent/checkpoint, reopens authority evidence, and releases the lease last. Forced termination relies on the same startup recovery and cannot turn partial state into success.

## Proposal and application boundaries

- An intelligence/model response is a bounded proposal only. Engine validation permits display; it does not approve, adopt, grant, or apply.
- A deterministic Navigation candidate/effect plan is still not authority. It carries exact bytes/digests and may be previewed while writes are disabled.
- Human adoption records ownership of exact current bytes; adoption alone does not modify the MOC.
- Human decision, grant issuance, policy selection, ownership adoption, plan preparation, execution, recovery, and rollback are separate operations and receipts.
- Proposed ordinary Markdown or generated MOC content re-enters as a new Layer-1 source after application and inherits no higher standing.
- No endpoint is added until a versioned write contract, issuer/administrator lifecycle, durable proposal store/quarantine, and full host qualification are approved. Existing read-only MCP/service success behavior remains unchanged.

## Writes-disabled first stage

Stage NL-E0 may implement only:

1. Node/Linux host capability detection and redacted status for roots, filesystem, adapter, authority provider, journal, policy, lease, recovery, reconciliation, ownership, and durability.
2. Secure read-only reopening/inspection of configured roots and exact source snapshots.
3. Deterministic ownership/adoption **plans**, marker validation, proposal quarantine, diffs, and effect plans over synthetic/test data.
4. Journal/receipt schema verification and recovery **inspection** without applying a recovery action.
5. A synthetic in-memory or disposable-temp adapter that cannot be selected for production, plus fault-injection qualification fixtures.
6. Explicit values: `effects_mode=off`, `writes_enabled=false`, `auto_maintenance=false`, `auto_creation=false`, `mcp_write_surface=false`, `durability_qualified=false`.

NL-E0 must not register a filesystem writer, persist adoption into a real vault, create a grant, enable an executor, expose an apply/rollback API, or treat successful planning as write qualification. Its exit is a reviewed root/profile manifest and red/green refusal evidence. NL-E1 (proposal-only product integration) and any later execution stage require separate owner approval.

## Facts still unknowable or unqualified

- The actual Linux distribution/kernel, service manager, filesystem type/mount options, storage hardware/cache behavior, container/VM boundary, backup system, and power-loss semantics.
- The actual vault path, owner/group/ACL model, multi-user threat model, required MOC and agent-note roots, retention holds, archive duration, and purge authority.
- Who the human grant issuers/reviewers are, how their admin credentials are provisioned/rotated/revoked, and whether separation of duties is required.
- Whether systemd restrictions, Node native SQLite/FTS5, directory fsync, advisory locks, secure path traversal, and cross-device constraints work on the selected production host.
- Whether Obsidian participates. This packet selects standalone Node/Linux; browser-only and Obsidian adapters remain unavailable unless separately selected and qualified.
- Real-process crash cuts, hostile concurrent writers, symlink/hardlink/mount/ancestor substitution, disk-full/read-only remount, journal/archive corruption, rollback, restore, scale, soak, and actual sudden-power-loss evidence.
- Whether `e4f00b3` can be reconciled without further contract/API deltas onto the final Engine integration commit. Historical green CI at that SHA is evidence for that old source only.

## Owner decisions requested before NL-E1 or any writer work

1. Approve or replace the service account/systemd/config/state/runtime path defaults.
2. Name exact enrolled vault and allowed generated-content roots, ownership modes, and whether agent notes are included.
3. Appoint the human grant issuer/admin authority and credential lifecycle; decide separation of duties.
4. Approve policy source/version, retention/archive/purge/backup rules, and required durability target/filesystem.
5. Decide whether directory-fsync plus tested local-filesystem crash recovery is sufficient or an external durable checkpoint is required.
6. Separately authorize NL-E1 proposal/adoption persistence. Do not infer authorization for auto-apply, MCP writes, or real-vault execution.
