# Phase-6 D0 interface proposal informed by Kosmos-Oden

Date: 2026-08-25 (America/New_York)  
Revision: `interface-correction.9`  
Scope: D0-7, D0-8, D0-9 and interface-facing parts of D0-10/D0-11  
Status: **proposal only; no Phase-6 implementation, publication, or product change is authorized**

Kosmos-Oden is integration evidence, not an authority. Full GKOS-Engine commit
`808d875b557f4cfd2bb0addccba44d70c9748f35` is the only product-capability
boundary used here. Identity, credential, lifecycle, limits, audit records,
error projection, and retention remain owned by the revised core proposal and
its machine registers.

## 1. Normative dependency rule and current recommendation

This interface adds no second identity vocabulary, credential lifecycle,
global-limit table, error registry, error envelope, or projection table. At F1,
the generated interface pack must bind the exact paths and SHA-256 values in
the table below. A changed byte is a new review input, not a compatible update.

| Core-owned dependency | Exact path | SHA-256 |
| --- | --- | --- |
| Core prose, authority model, coordinated interface layout/counts | `future-build-phase6/proposals/core/GKOS_PHASE6_D0_CORE_SPEC_PROPOSAL_2026-08-25.md` | `168d686594952786c55e255483847ce29d5c6e712d792a6534d1e78d8010163c` |
| Core decision register and immutable operation-inventory/request-result coordinate | `future-build-phase6/proposals/core/PHASE6_D0_CORE_DECISION_RECORD_PROPOSAL_2026-08-25.json` | `29f49ac280f87311841deb21dc5c0e07d6c126d6840c41875ee0053b2600c5c5` |
| Immutable operation inventory (32 operations, 54 definitions, 14 lowercase public refs; product schema/instance paths fixed within) | `future-build-phase6/proposals/core/PHASE6_D0_CORE_OPERATION_INVENTORY_PROPOSAL_2026-08-25.json` | `d84f2e6ee6e3f7de0a6956d868fc0b2f1ae0ff7809f05ab85d52a0490bc69b87` |
| Sole closed error registry/envelope/projection (53 codes, 34 aliases) | `future-build-phase6/proposals/core/PHASE6_D0_CLOSED_ERROR_REGISTRY_1.0.0-draft.1.json` | `5dd45eaa90dee7a03b29e36131740e9480131307a6266d5f61eeeb0a5245e9a5` |
| F1 allowed paths (40), including five interface product leaves | `future-build-phase6/proposals/core/P6_F1_ALLOWED_PATHS_PROPOSAL.txt` | `7e75c1b8cbd96aa80405f981995e3691e3b073c4929d0c0cb84db615ed694fce` |
| F1 protected paths (22) | `future-build-phase6/proposals/core/P6_F1_PROTECTED_PATHS_PROPOSAL.txt` | `f920a006015ac77920dcbb611fd1a2c19e711d9002eb778a056137f50b2cc948` |
| Core strict/hash/count validation receipt | `future-build-phase6/proposals/core/PROPOSAL_VALIDATION_2026-08-25.md` | `4f31f73833344b0d771775beb869f32da3404c6ef49b1c53f365e2407cd3b6b8` |
| Independent assignment/acceptance governance `.3` | `future-build-phase6/proposals/governance/PHASE6_SOL_ASSIGNMENT_AND_ACCEPTANCE_MATRIX.md` | `6bbbe8c4c20df32598777909619ddd003af46cdcda7c732060df0f0a9e8dda4f` |

Verdict: **CORRECTION_REVIEW_READY / F1_NO_GO**. Freeze D0-7/D0-8/D0-9 only
after an independent zero-finding cross-register review and owner ratification.
The proposed surface is native stdio,
loopback-only Streamable HTTP, and the seven-tool read/compute-only catalog.
Effects execution and administration stay local owner CLI only.

## 2. Incorporate now, optional adapter, defer, reject

| Disposition | Surface | Phase-6 rule |
| --- | --- | --- |
| Incorporate now | Native stdio; loopback-only Streamable HTTP; the seven catalog operations only where each exact operation/request/result binding exists in the immutable core inventory and each listed adapter exists at Full `808d875...` or is a bounded F1-private resolver | One core authority path, strict schemas, policy before discovery and before publication, no mutation or capability inference |
| Optional adapter, but not active in initial registry | Kosmos lexical search/related traversal; Graphiti export/status; provider retrieval/reranking | May be reconsidered only after provider-independent closed contracts and qualification; never identity, authorization, truth, governance, or effect authority |
| Defer | Content-returning record get, policy view, context pack, diff, re-entry, effect planning, Graphiti/retrieval tools, prompts/resources, tasks, server requests, SSE resumability, remote TLS/LAN | Current output/resolver/authority contract is incomplete or capability is optional |
| Keep owner CLI only | Identity/credential/mapping/session/retention/migration administration, governance append, Navigation effect execution | Never exposed through MCP or HTTP in the Phase-6 minimum |
| Reject | Anonymous data/tool access; caller-selected `agent_id`, `session_id`, `request_id`, role, idempotency key, raw path, alias, title, blob, snapshot bytes, or authority coordinate; arbitrary SQL/filesystem/graph query; secret in argv/environment/protocol/logs; combined plan-and-execute tool; retrieval/graph-derived truth | Violates authority, boundedness, non-enumeration, or governed-effect separation |

The optional-adapter category is a design classification, not a tool-registry
state. All incomplete adapter tools are in `deferred_tools` until their exact
schemas, dependencies, error projections, and qualification vectors close.

## 3. D0-7: exact authority surfaces

### 3.1 Authority classes

- `PUBLIC_AUTHENTICATED` means a valid core credential and enabled `agent_id`,
  followed by per-operation policy evaluation. It never means anonymous.
- `OWNER_ONLY` means the local owner CLI after the core owner proof. There is no
  owner HTTP route and no owner MCP tool.
- There is no `PRIVATE` authority class. Non-exported registries, resolvers, and
  projectors are implementation seams, not operations and not principals.
  `private_authority` is only an internal transport used by the selected
  `OWNER_ONLY` inventory rows that name it; it grants no separate authority and
  creates no callable owner or public surface.

The core operation inventory and its exact request/result record names are
authoritative and are incorporated by reference rather than copied here. The
interface adds only the following exposure decisions:

| Class | Exact operation names | Exposure |
| --- | --- | --- |
| Core operation authority | Exactly the 32 entries in the frozen inventory, including `capability.list_effective` | The inventory alone classifies 7 public-authenticated, 1 local-bootstrap, and 24 owner-only operations and freezes their transports; this interface adds no public CLI, REST, or operation by inference |
| Public tool operations | `capability.list_effective`, `record.validate`, `record.assess`, `record.lineage.read`, `graph.temporal.read`, `navigation.discover`, `navigation.audit` | Both MCP transports through `tools/call`; exact inventory request/result schemas govern; no REST mirrors |
| Owner administration | Exact owner-only entries and exact records in the frozen core operation inventory | Local owner CLI is the only external entry; selected inventory rows may traverse the internal `private_authority` transport after owner authorization, but it is neither an authority class nor an exposed service |
| Owner product effects | Qualified Navigation Effects planner/executor and governed receipt publication | Existing owner CLI contract only; separate process/namespace from MCP |
| Internal F1 implementation seams | `cursor.issue`, `physical_path.qualify`, `record_ref.discover`, `record_ref.issue`, `record_ref.resolve`, `scope_ref.issue`, `scope_ref.resolve`, `snapshot.create` | Exact bounded, non-exported dependencies named by the public rows of the core inventory; they are not operation inventory rows or an authority class and cannot add policy, identity standing, transports, or a durable record type |

No anonymous `/healthz` data route is required by this proposal. A later
process-liveness endpoint, if any, must be separately reviewed and may expose
no identity, vault, version, tool, policy, or storage facts.

### 3.2 Identity and credential binding

Session, credential, owner handoff, restore, retention, and audit semantics are
exactly the records and transitions in the frozen core main specification,
decision register, operation inventory, and error projection. This interface
does not duplicate their fields, action names, lifetimes, state transitions,
or recovery rules.

The interface-specific invariants are only these: no tool input may select or
override identity, credential, session, request, policy, authority, handoff,
restore, or audit state; `display_name` and MCP `clientInfo` never establish
authority; and credentials use only the core-approved owner or ordinary-agent
handoff path. No interface retry, reconnect, or adapter adds reveal, expiry,
grace, rollback, recovery, replay, or post-publication undo semantics.

### 3.3 Private reference and physical-path qualification

MCP never accepts a path, UID, title, alias, or blob. `capability.list_effective`
issues no references and returns only the canonically ordered subset of seven
safe public policy-capability names that is currently effective. Every item is
`available:true` with `reason_code:null`; hidden, owner-only, unavailable, and
denial-reason entries are omitted, never represented negatively.
`navigation.discover` with `scope_ref:null` and
`cursor:null` is the only initial issuance path: after current policy and
physical-root qualification it returns the authorized root `scope_ref`,
authorized `record_ref` values, and authorized child `scope_ref` values. Later
pages/calls may reuse only a same-session issued `scope_ref`; null scope with a
continuation cursor is invalid. No call accepts a path or vault selector.

Each `record_ref`/`scope_ref` suffix is canonical unpadded base64url for exactly
16 CSPRNG bytes: 22 characters with final character limited to `A`, `Q`, `g`,
or `w`. Before any registry lookup, runtime must strictly decode to 16 bytes,
re-encode as unpadded base64url, and require byte-for-byte identity; padding,
alternate alphabets, whitespace, and ignored trailing bits fail closed. The
process-memory-only resolver registry binds ref type,
physical no-follow handle identity, canonical locator digest, session_id,
`agent_id`, `auth_epoch`, authority_generation, policy_decision_id, capability,
filter_digest, issued_at, and expires_at. Lifetime is exactly 900,000 ms; limits
are 2,048 live references per session and 32,768 per process/vault. Durable
`page_snapshot` evidence contains only `issued_reference_count` and
`issued_reference_set_digest`; no durable raw-reference registry or extra
record type exists. Unknown/expired/wrong-session/wrong-agent resolves to the
authenticated-redacted core not-found projection; generation/auth-epoch
mismatch resolves to the sole core stale-authority projection. Neither reveals
which binding failed. Issuance is
read/compute-only and creates no identity, policy, source, governance, or effect
standing.

`physical_path.qualify`, frozen as a private F1 resolver, must:

1. Require valid Unicode scalars already in NFC; reject NUL/C0/C1, leading or
   trailing slash, absolute, drive/UNC, backslash, empty segment, `.`/`..`,
   repeated-separator, and every value whose NFC UTF-8 encoding is outside
   1..512 bytes. JSON Schema's 512-character ceiling is only an early lexical
   bound; runtime must compute `Buffer.byteLength(value.normalize("NFC"),
   "utf8")`, require normalization identity, and require
   `normalizeVaultRelative(value) === value` before I/O.
2. Open the owner-qualified physical vault root and resolve every segment with
   no-follow semantics. POSIX symbolic links and Windows reparse points,
   junctions, mount-point escapes, device paths, alternate data streams, and
   final non-regular files fail closed.
3. Prove the opened object remains a descendant of the same physical root;
   read through that handle only; enforce the core input bound; compare
   identity/size/time metadata before and after; and hash the bytes used.
4. Return only the authority reference, canonical vault-relative path, and
   digest allowed by policy. Physical paths and resolver failure detail never
   cross the public boundary.

`record.validate`, `record.assess`, lineage, temporal projection, and
Navigation audit must perform discovery/authorization before computation.
They never compute over an unrestricted vault and filter afterward.

`gkos_graph_at_time` accepts only a non-null, live `scope_ref` previously issued
by the sole `navigation.discover(scope_ref:null,cursor:null)` initial call. It
first performs `scope_ref.resolve`, same-session/agent/auth-epoch/generation
checks, current policy evaluation, and physical-root requalification. Its
filter, order, cursor, and page snapshot bind the scope-reference digest,
session, agent, auth epoch, authority generation, policy decision, physical
identity, temporal `at`/state filter, and canonical order. It may issue
authorized `record_ref` results only inside that resolved scope. A fresh call
without a scope, a null scope, or any path/vault selector is invalid and mints
no reference.

## 4. D0-8: native stdio and loopback Streamable HTTP

Both transports invoke the same internal admission, authorization, tool,
snapshot, error, activity, cancellation, and final-publication gates. The
Kosmos stdio-to-HTTP bridge is observed compatibility evidence only; Phase-6
stdio is native.

### 4.1 MCP negotiation and lifecycle

The selected MCP version is exactly `2025-11-25`. The state sequence is core
`PRE_AUTH -> AUTHENTICATED -> INITIALIZED -> CLOSING -> CLOSED`; the successful
initialize response precedes the client's `notifications/initialized` barrier.

- `initialize` is exactly once and accepts all bounded standard fields in the
  official 2025-11-25 schema: `protocolVersion`, open client `capabilities`,
  permissive `clientInfo` implementation fields, and standard `_meta`.
  Unknown standard-compatible metadata is ignored safely, not rejected merely
  for presence. It cannot select identity, role, policy, rate bucket, or tool.
- If the client offers `2025-11-25`, the server echoes it. Otherwise the server
  returns its sole supported `2025-11-25`; a client that cannot support it
  disconnects. The response always includes `protocolVersion`,
  `capabilities:{tools:{listChanged:false}}`, and
  `serverInfo:{name,version}`. No capability is implied by client offer.
- The `initialize` request is the first interaction. After that request has
  begun and before its response, the standard client `ping` exception is the
  only other request accepted. After that response but before
  `notifications/initialized`, server-originated behavior is limited to the
  official ping/logging exception; this profile advertises no logging and
  originates neither. All early data/tool requests fail as the core
  not-initialized alias without enumeration.
- Reconnect always reauthenticates and initializes a new core/MCP session.
  Session IDs, cursors, snapshots, in-flight requests, and results are never
  adopted or replayed. An unknown/terminated MCP session uses only the exact
  sole core non-enumerating pre-dispatch HTTP projection; its client action is
  a new authenticated initialize sequence. This interface defines no status or
  error alias for that condition.
- `notifications/cancelled` is same-direction, best-effort, fire-and-forget.
  `initialize` cannot be cancelled. Unknown, completed, opposite-direction,
  and malformed targets are ignored without response or oracle. If
  cancellation wins before the final publication gate, processing/resources
  stop under the core cancellation bounds and no response to the original
  request is sent. A late cancellation cannot retract publication or a
  committed owner-only effect.
- MCP defines no shutdown message. Stdio EOF and authenticated HTTP session
  termination enter `CLOSING`; new work uses the core shutting-down projection,
  admitted work settles/cancels within the core shutdown bound, then the
  session closes.

The exact positive/negative vectors are in
`MCP_2025_11_25_CONFORMANCE_VECTORS.proposal.json`.

The F1 product leaf names are frozen as:

- `contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1/tool-registry.schema.json`;
- `contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1/tool-registry.json`;
- `contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1/operation-inventory.json`;
- `contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1/transport.json`; and
- `contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1/mcp-conformance-fixture.json`,
  validated by the pack's `conformance.schema.json`.

These are intended F1 contract leaves, not files created by this proposal.

### 4.2 Native stdio

- One child process has one authenticated identity/session. The credential is
  read once from the protected core locator before initialize; it is not a
  protocol field.
- Each stdin/stdout message is one UTF-8 JSON-RPC object delimited by LF and
  subject to the core transport-body bound. Embedded unescaped newlines and
  batches are rejected. Stdout contains protocol messages only; stderr is
  redacted and bounded by the core error/log projection.
- Requests may complete out of order and correlate only by JSON-RPC ID. The
  shared core concurrency and rate registers govern admission.
- EOF begins shutdown; no reconnect or persisted stdio session exists.

### 4.3 Loopback-only Streamable HTTP

- Bind separate listeners only to physically verified `127.0.0.1` and/or
  `::1`; never wildcard, LAN, forwarded-client, proxy-trust, or remote TLS.
  Forwarded headers cannot establish or repair peer identity.
- Apply exactly one pre-dispatch order. A rejection stops evaluation, returns
  the canonical core envelope with `request_id:null`, and reveals no later
  stage. This null projection applies at all nine stages, including session
  and authentication rejection even if bounded internal work allocated an
  identifier; no caller- or server-generated request ID crosses this boundary.
  Grouped session or authentication failures therefore remain byte-identical.
  No adapter may reorder, merge, or substitute an interface-local code:

| Stage | Check | Closed behavior |
| --- | --- | --- |
| 1 | Authoritative physical peer is present, parseable, and exactly loopback | Missing, malformed, unverifiable, or non-loopback peer metadata uses `MCP_HTTP_PEER_FORBIDDEN` → `GKOS_P6_PEER_FORBIDDEN`, 403/-32003; forwarded claims are ignored |
| 2 | `Host` is singular, syntactically valid, loopback, and matches a bound listener authority | Failure uses `MCP_HTTP_HOST_FORBIDDEN` → `GKOS_P6_HOST_FORBIDDEN`, 403/-32003 |
| 3 | Every present `Origin` is singular, syntactically valid, and an approved exact loopback origin | Failure uses `MCP_HTTP_ORIGIN_FORBIDDEN` → `GKOS_P6_ORIGIN_FORBIDDEN`, 403/-32003 |
| 4 | Method metadata is available, syntactically valid, and exactly uppercase POST or DELETE; GET is never an SSE channel | GET retains `MCP_HTTP_GET_METHOD_NOT_ALLOWED`; any other valid method uses `MCP_HTTP_METHOD_NOT_ALLOWED`; malformed, unavailable, empty, or non-uppercase method metadata uses `MCP_HTTP_METHOD_INVALID`. All map only to `GKOS_P6_METHOD_NOT_ALLOWED`, 405/-32600, with `Allow: POST, DELETE` |
| 5 | POST has one valid `application/json` Content-Type; DELETE is bodyless, unframed, and has no Content-Type | POST aliases map to `GKOS_P6_UNSUPPORTED_MEDIA_TYPE`, 415/-32600. `MCP_HTTP_DELETE_BODY_FORBIDDEN`, `_CONTENT_TYPE_FORBIDDEN`, and `_FRAMING_INVALID` map only to `GKOS_P6_DELETE_INVALID`, 400/-32600 and the same canonical envelope |
| 6 | When a session header is present, `MCP-Protocol-Version` is singular, syntactically valid, present, and exactly `2025-11-25` | Missing is admitted only for a no-session initialize; the three `MCP_HTTP_PROTOCOL_VERSION_*` aliases resolve only to `GKOS_P6_PROTOCOL_VERSION_INVALID`, 400/-32600; another no-session/no-version message fails after bounded JSON-RPC parse as `MCP_NOT_INITIALIZED` |
| 7 | `Accept` on POST or DELETE advertises both `application/json` and `text/event-stream` | Failure uses `MCP_ACCEPT_NOT_NEGOTIABLE` → `GKOS_P6_NOT_ACCEPTABLE`, 406/-32600 |
| 8 | Required `Mcp-Session-Id` is singular, syntactically valid, and live | `MCP_SESSION_REQUIRED` resolves to `GKOS_P6_INVALID_REQUEST`, 400/-32600; `MCP_SESSION_INVALID`, `_EXPIRED`, `_NOT_FOUND`, and `_TERMINATED` coalesce to `GKOS_P6_SESSION_UNKNOWN`, 404/-32004 |
| 9 | Core bearer authentication succeeds | Missing, malformed, unknown, mismatched, disabled-agent, and revoked-credential presentations coalesce to `GKOS_P6_AUTH_FAILED`, 401/-32001 |

- A request response uses JSON by profile choice; a compliant client still
  advertises/supports both JSON and SSE. An accepted JSON-RPC notification or
  response returns HTTP 202 with an empty body. GET opens no server SSE channel
  and this profile advertises no resumability.
- DELETE is exactly bodyless and carries verified peer metadata, valid bound
  `Host`/approved `Origin`, `MCP-Protocol-Version: 2025-11-25`, an `Accept`
  value advertising both JSON and SSE, a live `Mcp-Session-Id`, and valid
  bearer authentication. It traverses stages 1–9 in order; stage 5 verifies
  the absence of body, transfer framing, and `Content-Type`. It then closes only the
  authenticated named session. `MCP-SHUTDOWN-002` is the exact success case.
  Any DELETE body, transfer framing, or Content-Type fails at stage 5 before
  protocol, Accept, session, or authentication; combined DELETE defects use
  the same byte-identical closed projection.
- There is no credential in a query parameter, cookie, custom identity header,
  forwarded header, or MCP params. All unauthenticated lifecycle distinctions
  coalesce to the core authentication-failed projection.

## 5. D0-9: initial tool registry

`MCP_TOOL_REGISTRY.schema.json` is the strict, self-contained Draft 2020-12
schema. Its `$defs` contain every exact input/result schema; every `$ref` is
local and resolvable. `MCP_INITIAL_TOOL_CATALOG.proposal.json` is the separate
registry instance. At `tools/list`, F1 materializes the named `$defs` as each
Tool's `inputSchema` and `outputSchema`; it must not use the catalog object as a
JSON Schema.

Each catalog `outputSchema` has root `type:"object"` as required by the pinned
MCP 2025-11-25 `Tool` definition and a closed `oneOf`: the canonical successful
`structuredContent` for that tool, or exactly `{error:<core envelope>}`. Thus a
domain failure remains an MCP `CallToolResult` with `isError:true` while its
`structuredContent` still validates against the advertised `outputSchema`, as
required by the selected MCP profile. Before publication, runtime validates
`error_code` membership and retry coupling against the bound sole core
registry; the interface schema does not become a second error registry.
F1 materializes all seven Tool objects using only standard Tool fields and the
resolved input/output schemas, then validates each object against the pinned
official `schema/2025-11-25/schema.json#/$defs/Tool` before publication.

Object closure is branch-aware rather than keyword-count based. Every direct
simple object has `additionalProperties:false`; each composed result root is
closed by both its success and error accepting branches; each `allOf` overlay
only narrows a separately closed base object; and the two conditional schemas
only constrain an already closed parent. No accepting object path is open.
`unevaluatedProperties:false` is required only if a future composition cannot
be proven closed through its accepting branches; this proposal does not add it
redundantly where `additionalProperties:false` already closes the instance.

There are exactly seven required tools and sixteen deferred surfaces:

| Required tool | Current Full API at `808d875...` | F1-private dependency | Class / deadline |
| --- | --- | --- | --- |
| `gkos_capabilities` | `getNavigationCapabilities` | no private dependency; issues no references | read / 5 s |
| `gkos_record_validate` | `parseGkx`, `parseGkx23Frontmatter` | record-ref resolver; physical qualification | compute / 10 s |
| `gkos_record_assess` | `buildGkx23Projection`, `assessGkx23` | record-ref resolver; physical qualification | compute / 15 s |
| `gkos_lineage_get` | `GkxIndex.getRecords`, `GkxIndex.graph` | record resolver; physical qualification; record-ref issue; core snapshot/cursor | read / 10 s |
| `gkos_graph_at_time` | `projectAtTime` | live scope resolver; physical requalification; scoped record discovery/issue; core snapshot/cursor | compute / 20 s |
| `gkos_navigation_discover` | `discoverNavigation` | scope resolve/issue; physical qualification; record discovery/issue; core snapshot/cursor | compute / 20 s |
| `gkos_navigation_audit` | `auditNavigation` | scope resolver; physical qualification; record discovery/issue; core snapshot/cursor | compute / 30 s |

The registry has no effectful or owner tool. Every Tool annotation is
`readOnlyHint:true`, `destructiveHint:false`, `idempotentHint:true`, and
`openWorldHint:false`, which is correct for local, bounded, authority-filtered
data. Deferred external retrieval must not inherit that hint if later exposed.
Standard Tool/CallToolResult `_meta` is allowed only as namespaced metadata;
it carries no authority. Task execution is absent/forbidden.

### 5.1 Exact request/result behavior

- Input objects require every declared field and reject additional properties.
  Callers supply only an authority-issued `record_ref`/`scope_ref`, a strict UTC
  timestamp/filter, a core cursor or null, and a page limit where applicable.
  They never supply content, paths, identity, request ID, policy coordinate,
  snapshot material, or idempotency.
- `utc_timestamp` is an RFC 3339 calendar-valid UTC instant with exactly three
  fractional digits and `Z`, bounded to years 1970 through 9999. The JSON
  Schema `date-time` assertion is mandatory in addition to the lexical pattern.
  `record_summary.uid` is separately lossless for the authored Full contract:
  case-insensitive UUIDs of versions 1 through 8. It is not the core `uuidv7`
  identity type; agent/session/request identifiers remain strict lowercase v7.
- Success is a JSON-RPC success `CallToolResult` with `isError:false`, one
  canonical JSON `TextContent`, and identical `structuredContent` conforming to
  the tool `outputSchema`. Optional result `_meta` uses standard MCP placement.
- A malformed `CallToolRequest` and a structurally valid call naming an unknown
  tool are distinct JSON-RPC invalid-params (`-32602`) vectors using the sole
  core projection. A valid CallToolRequest whose `arguments` fail the named
  tool's input schema, or any other reached domain failure, is a JSON-RPC success with
  `isError:true`; `structuredContent.error` is exactly the core error envelope
  and validates against the same advertised union `outputSchema`,
  and text content contains only its closed `GKOS_P6_*` code. No interface
  `message`, details, stack, path, alias, candidate, or second error code exists.
- The server generates result authority fields. All numbers are safe JSON
  integers. Assessment floats are deterministically rounded to integer basis
  points by the frozen private projector; null remains null.
- `capability.list_effective` returns only safe public capability names with
  `available:true` and `reason_code:null`, unique and ordered by
  `capability_name ASC`. Schema closes the name set, constants, cardinality,
  and duplicate objects; runtime rejects noncanonical order before publication.
- Returned paths are NFC canonical vault-relative paths that already passed
  scalar, C0/C1, exact-normalization, exact Full normalization-identity, and
  1..512 NFC UTF-8 byte checks plus physical qualification. They are never
  accepted as selectors and never expose an absolute path.

### 5.2 Pagination, snapshots, and ordering

This proposal adopts the exact core stateful opaque cursor/snapshot records
unchanged. Token construction, digest storage, bindings, state fields, bounds,
continuity, session termination, restart, restore, eviction, retention, and
audit actions are exclusively those frozen core records; this interface
defines no duplicate field, limit, key, rotation, or invalidation register.
Snapshots may contain only already-authorized redacted canonical summary bytes.

The schema admits only `gkcur1_` plus 43 unpadded base64url characters whose
final sextet matches `[AEIMQUYcgkosw048]`, the complete canonical ending set
for exactly 32 bytes. Runtime must still strictly decode to exactly 32 bytes, reject
padding, whitespace, alternate alphabets, or ignored trailing bits, re-encode
with unpadded base64url, and require byte-for-byte equality before digest
lookup.

First page has `cursor:null`; continuation repeats every non-cursor filter and
limit exactly. Each page returns `page:{limit,has_more,next_cursor,snapshot_id}`.
Malformed input and every cross-binding, absent, terminated, evicted, or stale
condition use only the exact non-enumerating core projection selected by the
core record state. No partial/truncated shifting snapshot is returned.

Canonical sort keys are exact and code-unit compared:

| Tool | Order |
| --- | --- |
| capabilities | `capability_name ASC` |
| validation | `severity DESC`, `code ASC`, `record_ref ASC` |
| assessment | diagnostic `code ASC` |
| lineage | `valid_at ASC` (null last), `record_ref ASC` |
| graph at time | `valid_at ASC` (null last), `record_ref ASC` |
| Navigation discovery | `classification ASC`, `canonical_path ASC`, `record_ref ASC` |
| Navigation audit | severity rank `error,warning,info`, then `code ASC`, `record_ref ASC` (null last) |

## 6. Core-owned errors, limits, retention, and publication

The sole registry is the core `PHASE6_D0_CLOSED_ERROR_REGISTRY_1.0.0-draft.1.json`.
The sole envelope fields are core `contract_version`, `error_code`,
`request_id`, `retryable`, `retry_after_ms`, and `error_digest`. CLI exit,
pre-dispatch HTTP, JSON-RPC protocol, MCP tool-domain, notification, and
cancellation projections are exactly the core projections. Any unmapped
condition is the core internal error. This proposal defines no codes or aliases.
GET method rejection, invalid Origin, and an unknown JSON-RPC method each bind
to its own exact core entry/alias and vectors; none may borrow a policy,
owner-only, or generic operation code.

Likewise, transport/input/output/error bytes, schema string/array limits,
sessions, rate/concurrency, deadlines, cancellation/shutdown, authority
storage, activity, snapshot/cursor, and retention use the core machine values.
Tool deadlines and smaller result ceilings in the catalog are operation-local
subsets, never expansions. The exact core retention records and audit actions
govern interface activity without being restated here; MCP has no prune or
retention operation.

Every call performs admission, authentication, policy, discovery, capability,
computation, result-schema validation, result filtering, authority freshness,
size reservation, and publication gates. Timeout/cancellation can suppress a
not-yet-published result. They cannot imply rollback after publication or after
an owner-only governed effect crosses its qualified commit gate.

## 7. Effects and semantic authority separation

The initial MCP surface reads, computes, or proposes nothing effectful; even
effect planning is deferred until its exact closed schema exists. Navigation
Effects execution, source writes, governance append, identity/credential
mutation, and receipt publication are owner-CLI-only. They use separate
qualified authorities and cannot be reached by a private tool callback.

Retrieval ranking, related traversal, Graphiti episodes, temporal projection,
Navigation classification, and assessments remain projections. They may guide
discovery but cannot establish `agent_id`, policy outcome, authored/effective
truth, governance acceptance, effect precondition, idempotency, or receipt.

## 8. Finding-by-finding closure

| Peirce finding | Correction | Closure evidence |
| --- | --- | --- |
| 1. Duplicate identity/credential/lifecycle vocabulary | Removed interface-local names; use `agent_id`, `display_name`, `auth_epoch`, core zero-grace/no-expiry/no-rollback and handoff | Sections 1, 3.2 |
| 2. Duplicate/incompatible errors | Deleted interface registry/envelope/limits; reference sole core registry/projection | Sections 1 and 6 |
| 3. Invalid catalog-as-schema | Added strict self-contained registry schema and separate instance | `MCP_TOOL_REGISTRY.schema.json`; `MCP_INITIAL_TOOL_CATALOG.proposal.json` |
| 4. Unresolved/inexact result schemas | Embedded exact input/result schemas in `$defs`; catalog references only those definitions | Registry schema `$defs`; validation receipt to be generated |
| 5. MCP initialize/lifecycle nonconformance | Permissive standard initialize metadata, required `serverInfo`, ping exception, correct barrier/negotiation/reconnect/shutdown | Section 4.1; vectors `MCP-INIT-*`, `MCP-PING-*`, `MCP-BARRIER-*`, `MCP-SHUTDOWN-*` |
| 6. HTTP/cancellation nonconformance | JSON+SSE Accept, 202 empty notification/response, GET 405, no cancellation response/original response when it wins | Section 4.3; `MCP-HTTP-*`, `MCP-CANCEL-*` |
| 7. Nonstandard `_meta`/wrong annotations | Standard MCP `_meta` placement, namespaced keys, local-tool `openWorldHint:false`, tasks absent | Section 5; `MCP-TOOL-*` |
| 8. Unbounded/unsigned cursor design | Adopt core stateful random opaque digest-only cursor and bounded immutable summary snapshot; no signing key exists to rotate | Section 5.2 |
| 9. Tools not grounded in Full | Reduced required catalog to seven current `808d875...` APIs plus exact bounded F1-private resolvers; moved all incomplete tools to deferred | Section 5 table; catalog instance |
| 10. Caller-selected identity/idempotency/blob/snapshot | Removed every such input; only server-issued references, timestamp/filter, cursor, and limit remain | Registry input `$defs`; sections 3.2, 5.1 |
| 11. Generic IDs/paths/timestamps and leakage | Added domain-specific schemas, physical-path validator, discovery-before-computation, no title/alias/raw-path oracle | Registry `$defs`; section 3.3 |
| 12. Effect/governance boundary blurred | MCP is read/compute only; plan remains deferred; execution/admin/governance are owner CLI only | Sections 2 and 7; deferred catalog |

Second narrow correction closure:

| Finding | Correction | Closure evidence |
| --- | --- | --- |
| 13. Timestamp admitted missing milliseconds, pre-1970/year-0000, or impossible dates | Exact `.sssZ`, year 1970–9999 lexical bound plus mandatory `date-time` calendar assertion | Registry `$defs.utc_timestamp`; vectors `SCHEMA-TIME-001` through `004` |
| 14. Unknown/malformed/invalid-tool-argument failures were conflated | Unknown and malformed CallToolRequest are separate `-32602`; invalid named-tool arguments are `CallToolResult.isError:true` | Vectors `MCP-TOOL-003` through `006`; section 5.1 |
| 15. HTTP 406/404 mappings were interface-local | Removed local statuses/codes and point both conditions to keys resolved only by the sole core projection | Vectors `MCP-HTTP-002`, `MCP-HTTP-007`; sections 4.1, 4.3, 6 |
| 16. Authored UID was incorrectly UUIDv7-only | Added a separate case-insensitive UUID versions 1–8 branch exactly matching Full `808d875...`; kept identity UUIDv7 distinct | `$defs.record_summary.properties.uid`; vectors `SCHEMA-UID-001` through `003` |
| 17. Navigation ordering used `kind` | Replaced with exact `classification:asc` in registry and catalog | Registry/catalog ordering; section 5.2 |
| 18. Core record/session/restore/credential wording was duplicated | Removed copied owner/private inventories, audit actions, and lifecycle details; incorporated exact frozen core records by reference | Sections 1, 3.1, 3.2, 6 |

Third correction closure:

| Finding | Correction | Closure evidence |
| --- | --- | --- |
| 19. Error `structuredContent` violated advertised outputs | Every output is a success/error union; catalog declares both variants; all seven error branches validate | `$defs.error_envelope`, `$defs.tool_error_structured_content`, seven `result_*` definitions; `MCP-TOOL-007` |
| 20. GET/Origin/unknown-method reused or lacked closed entries | Bound the three unique final core entries and deterministic 405/403/-32601 projections | `MCP-HTTP-005`, `MCP-HTTP-008`, `MCP-METHOD-001`; sections 1, 4.3, and 6 |
| 21. Cursor/path lexical schemas overclaimed semantic validation | Canonical cursor final sextet plus mandatory strict decode/re-encode; path C0/C1, lexical canonical form, runtime NFC/scalar/UTF-8-byte/normalization checks | `$defs.cursor`, `$defs.canonical_vault_relative_path`; `SCHEMA-CURSOR-*`, `SCHEMA-PATH-*`; sections 3.3, 5.2 |
| 22. Interface did not bind exact operations/records | Make the immutable core inventory/request-result coordinate normative; add `capability.list_effective`; remove general incorporation claims | Sections 1, 2, 3.1; catalog `core_operation` fields |
| 23. Navigation required an unissuable `scope_ref` | `navigation.discover` null/null is the sole initial issuance call; same-session root/child scope reuse is allowed; null plus a continuation cursor is rejected | Section 3.3; schema/catalog; `MCP-SCOPE-001` through `004` |

Fourth narrow correction closure:

| Finding | Correction | Closure evidence |
| --- | --- | --- |
| 24. Reference suffixes admitted noncanonical trailing bits | Both 16-byte reference types allow only final `[AQgw]`; mandatory strict 16-byte decode/re-encode precedes lookup; canonical and noncanonical cases are frozen | `$defs.record_ref`, `$defs.scope_ref`; `MCP-TOOL-003`, `MCP-TOOL-006`, `MCP-SCOPE-002`, `MCP-SCOPE-004`; section 3.3 |
| 25. Advertised result schemas lacked MCP-required root object type | All seven result definitions now declare root `type:"object"` while retaining success/error `oneOf`; all seven materialized Tool objects validate against the pinned official `#/$defs/Tool` | Seven `result_*` definitions; `MCP-TOOL-001`, `MCP-TOOL-007`; validation receipt |

V3 correction closure:

| Finding | Correction | Closure evidence |
| --- | --- | --- |
| 26. Temporal graph projection could begin without an issued scope | Require a non-null live same-session `scope_ref`, resolve/requalify before projection, bind scope/filter/order/snapshot/authority coordinates, and reject initial bypass without minting refs | `$defs.input_graph_at_time`, `result_graph_at_time`; catalog row; section 3.3; `MCP-GRAPH-001` through `003` |
| 27. HTTP pre-dispatch checks were incomplete and ambiguously ordered | Freeze the single nine-stage peer→Host→Origin→method→Content-Type→protocol→Accept→session→auth order, sole registry projections, canonical envelopes, and precedence-collision coverage | Section 4.3; `MCP-HTTP-002`, `005` through `020` |
| 28. Interface invented a `PRIVATE` authority class | Remove the phantom class and operation claims; classify registries/resolvers/projectors only as non-operation implementation seams and `private_authority` only as an internal transport on selected `OWNER_ONLY` rows | Section 3.1; catalog `private_dependencies` |

V4 correction closure:

| Finding | Correction | Closure evidence |
| --- | --- | --- |
| 29. Session/auth rejection request IDs were underspecified | Freeze canonical `request_id:null` for every stage 1–9 rejection, even after internal allocation; grouped session/auth aliases project byte-identical responses | Section 4.3; `MCP-HTTP-007`, `017` through `020` |
| 30. Successful DELETE did not satisfy its own admission profile | Supply exact loopback peer, bound Host/Origin, protocol, Accept, live session, valid bearer, null body, and explicit stage-5 absence checks for body/framing/Content-Type | Section 4.3; `MCP-SHUTDOWN-002` |
| 31. Origin-precedence prose named POST while its exact collision input used GET | Make both precondition and input GET while preserving Origin-before-method/auth first-failure behavior; reconcile other abbreviated accepted/pre-dispatch vector contexts | `MCP-HTTP-003`, `004`, `006`, `008`, `010` |

V5 correction closure:

| Finding | Correction | Closure evidence |
| --- | --- | --- |
| 32. Cursor schema reused the 16-byte reference ending set | Use exact 32-byte final sextets `[AEIMQUYcgkosw048]` plus mandatory strict decode/re-encode; cover canonical `E`, padding, and noncanonical alias finals `B`/`D` | `$defs.cursor`; `SCHEMA-CURSOR-001` through `005`; section 5.2 |
| 33. Catalog refs differed from the lowercase product leaf | Normalize all 14 public request/result refs and their schema constants to exact case-sensitive `tool-registry.schema.json#/$defs/...` strings | Schema/catalog public rows; validation receipt |
| 34. Stage 4 covered GET rather than every invalid method | Admit only exact uppercase POST/DELETE; coalesce GET, arbitrary extension, malformed, unavailable, empty, and lowercase forms to the sole 405/-32600 registry member with `Allow: POST, DELETE` | Section 4.3; `MCP-HTTP-005`, `021`, `022` |
| 35. DELETE body/Content-Type/framing lacked deterministic closure | Reject each or combined defects at stage 5 through `GKOS_P6_DELETE_INVALID`, 400/-32600 and one canonical envelope before later stages | Section 4.3; `MCP-HTTP-023` through `025`; `MCP-SHUTDOWN-002` |
| 36. Capability result could enumerate unavailable or hidden names | Close items to seven safe effective names, `available:true`, `reason_code:null`, unique set and runtime ascending order; add hidden/unavailable/order negatives | `$defs.capability_item`, `result_capabilities`; `MCP-TOOL-002` |
| 37. Output-minting dependency sets were incomplete | Match every public catalog/schema dependency array byte-for-byte to the core inventory and include record discovery/issuance where required | Section 3.1 and required-tool table; schema/catalog rows |
| 38. HTTP cancellation vector omitted admission context | Make `MCP-CANCEL-002` an exact admitted POST with full stage context and nested notification body before the 202-empty response | `MCP-CANCEL-002` |

## 9. F1 freeze gates and uncertainties

Do not assign F1 until all of these are true:

1. The seven revised core paths and the governance matrix in section 1 remain
   byte-identical to their recorded hashes and the independent cross-register
   reviewer confirms consistency.
2. A Draft 2020-12 validator accepts the registry schema; validates the
   catalog; materializes and validates all seven input/output schema refs; and
   rejects added tools, fields, bad refs, caller identity, raw paths, unsafe
   integers, and unbounded values.
3. The private reference registries, physical resolver, and assessment public
   projector are frozen as F1-only bounded contracts without widening Full
   exports or changing the `808d875...` product capability claim.
4. Every one of the 67 conformance/schema vectors is turned into deterministic Full transport tests,
   including cancellation/no-response races and both HTTP message kinds.
5. An independent reviewer confirms no required tool depends on Kosmos-only
   search/Graphiti/provider behavior and no graph/retrieval projection became a
   semantic foundation.

Remaining uncertainty is implementation qualification, not proposal intent:
the private resolver/reference registries do not exist at `808d875...`; native
stdio is not the current Kosmos adapter; and no transport, schema generator,
or Lite parity has been implemented or tested by these proposal artifacts.
