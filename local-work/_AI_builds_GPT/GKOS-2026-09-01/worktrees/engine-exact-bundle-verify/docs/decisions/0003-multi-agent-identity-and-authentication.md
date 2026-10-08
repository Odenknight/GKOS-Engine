# ADR-0003: Issue GKOS agent identities bound to provisioned credentials

Date: 2026-08-20

## Context

The current desktop service has one owner-protected bearer token. It authenticates
local requests but does not distinguish agents, sessions, or operations. The
uplift requires stable agent attribution, concurrent MCP sessions, immediate
disable/rotation behavior, and activity records that do not retain source
content or secrets.

Kosmos-Oden at inspected commit
a7113c0ca3be8dd230a9549940e2f387d4cb2a96 has MCP session lifecycle and derives a
best-effort display identity from clientInfo.name or User-Agent. It does not
provide an authenticated stable external subject contract suitable as GKOS's
primary identity.

## Decision

GKOS-Engine issues its own lowercase UUIDv7 agent_id for each provisioned
credential. The identifier is stable across reconnects. Every successful MCP
initialization receives a new UUIDv7 session_id, and every operation receives a
new UUIDv7 request_id. None is derived from display name, client name, network
address, User-Agent, process ID, or caller-supplied identity header.

Credential secrets are generated from at least 256 random bits, shown exactly
once, stored only as a strong digest plus nonsecret credential_id, protected for
the owner, and compared in constant time. The existing desktop bearer token is
migrated to one legacy/bootstrap AgentIdentity rather than invalidated.

Identity, external mappings, sessions, and append-only operational activity are
stored in a vault-isolated SQLite service database. Activity contains canonical
input/result digests and bounded operational metadata, not query text, note
bodies, snippets, raw MCP payloads, bearer tokens, or source content. Default
retention is 90 days unless trusted operator policy chooses another bounded
period.

Authorization is evaluated on every operation. Disabling an agent or rotating
its credential takes effect for new requests, including requests on an
already-open session. Deny, indeterminate, and policy errors fail closed.

An external identity may map idempotently to one local agent_id only when a
future adapter proves an authenticated stable namespace and subject. Raw
external identifiers never become GKOS primary keys. Until such a contract is
verified, Kosmos-Oden and every other client use GKOS-issued credentials.

Agent access telemetry is operational evidence. It is not automatically a GKOS
State-Change Receipt and does not gain governance standing by sharing a storage
interface.

## Alternatives rejected

- Reuse one bearer token for every client. It cannot provide attributable
  multi-agent activity.
- Treat clientInfo.name, User-Agent, IP address, or a caller header as identity.
  Those values are unstable and caller-controlled.
- Reuse an external subject as agent_id. Internal identity must remain stable
  when an external namespace changes.
- Author activity into source notes. The uplift is source-content read-only.
- Describe local append-only SQLite activity as a production governance ledger.
  Operational durability and governed-state authority are different contracts.

## Consequences

- Operators must provision and protect one credential per agent when attribution
  matters.
- Legacy clients can continue with the migrated bootstrap credential, but their
  activity is intentionally attributed to the same legacy identity until they
  migrate.
- Session and activity storage requires explicit schema migrations, retention,
  and backup/rollback documentation.
- A future Kosmos-Oden mapping is additive and must prove authentication before
  activation.

## Status

Accepted.

## Evidence

- Existing token generation and constant-time comparison:
  src/desktop-agent.ts at Full baseline
  2fbd4ec68ec825b09e5194c9878a7ae90a281392.
- Existing governance distinction:
  src/governance/types.ts and src/governance/store.ts at the same baseline.
- Kosmos-Oden identity/session inspection:
  commit a7113c0ca3be8dd230a9549940e2f387d4cb2a96,
  src/plugin/agent-server.ts and AGENT-API.md.
- Phase 0 report:
  evidence/2026-08-20-functional-uplift-phase-0.md.
