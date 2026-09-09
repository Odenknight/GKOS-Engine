# Kosmos-Oden interface proposal validation receipt

Date: 2026-08-25 (America/New_York)  
Revision: `interface-correction.9`  
Status: proposal validation only; no product, transport, or Lite implementation was tested

## Validator profile

- Node: `24.18.0` (validation host only; not a proposed product pin)
- Ajv: exactly `8.20.0`
- ajv-formats: exactly `3.0.1`
- Draft: 2020-12 via `ajv/dist/2020`
- Options: `strict:true`, `allErrors:true`, `validateFormats:true`,
  `allowUnionTypes:false`
- Dependencies were installed with scripts/audit/funding disabled into the
  workspace-local temporary validation directory; no product dependency or
  lockfile was changed.

## Results

| Check | Result |
| --- | --- |
| Parse all three JSON proposal artifacts | PASS |
| Strict-compile `MCP_TOOL_REGISTRY.schema.json` | PASS |
| Validate `MCP_INITIAL_TOOL_CATALOG.proposal.json` | PASS |
| Strict-compile every embedded `$defs` target | PASS: 58 of 58 |
| Draft 2020-12 object-closure traversal | PASS: all 58 definitions traversed; 59 object-constraint nodes classified as 27 direct closed objects, 7 composed result roots, 23 `allOf` narrowing overlays backed by a closed base, and 2 conditionals over an already-closed parent; zero open accepting paths and zero unnecessary `unevaluatedProperties:false` uses |
| Closure negative injections | PASS: 27 direct-object, 23 composed-`allOf` root, and 14 result-branch mutations rejected; all 7 materialized Tool input schemas plus 14 success/error output branches rejected injected properties while all 7 Tool wrappers remained valid against the pinned official schema |
| Resolve/materialize all catalog input/output refs | PASS: 14 of 14 refs, 13 distinct definitions |
| Pinned official MCP Tool/result schemas | PASS: official `schema/2025-11-25/schema.json` is 174,323 bytes with SHA-256 `268a5f82ba70fd7e4b6dc4aa1e64f116f74b4d0edcb69dc046829c79dd4e97e7`; all seven standard Tool objects and seven error CallToolResult objects validate against official `#/$defs/Tool` and `#/$defs/CallToolResult` |
| Registry counts | PASS: exactly 7 required tools and 16 deferred surfaces |
| Core hash bindings | PASS: all seven core artifacts match the exact frozen SHA-256 coordinates in the interface proposal |
| Core operation inventory | PASS: strict-compiled embedded inventory schema validates the generated instance; exactly 32 operations, 54 definitions, 14 public refs, and 7/1/24 authority split |
| Catalog/inventory identity | PASS: all seven catalog tools match the inventory's exact `mcp_tool`, operation, lowercase product-relative request/result refs, and private-dependency arrays byte-for-byte; `capability.list_effective` is included and issues no references |
| Case-sensitive public refs | PASS: all 14 refs equal exact `tool-registry.schema.json#/$defs/<name>` core strings under a case-sensitive simulation; uppercase proposal filenames never enter product refs |
| Vector/provenance counts | PASS: exactly 67 unique vectors, 5 pinned official MCP sources, and Full authored-UID/path source pins |
| Advertised output error branch | PASS: all seven output schemas accept exactly the closed `{error:<envelope>}` branch used with `isError:true` |
| Advertised output root | PASS: all seven result definitions have root `type:"object"`, retain their two-branch success/error `oneOf`, strict-compile when materialized, and satisfy official Tool `outputSchema` |
| Tool error projection split | PASS: unknown tool `-32602`; malformed CallToolRequest `-32602`; invalid named-tool arguments and reached domain failure use JSON-RPC success with `isError:true` |
| Core-only HTTP/JSON-RPC projection | PASS: all 34 aliases resolve through the 53-code core registry; the nine-stage peer→Host→Origin→method→Content-Type/body-framing→protocol→Accept→session→auth order, exact status/MCP tuples, canonical envelopes, first-failure behavior, and stage 1–9 null request IDs are covered; every grouped method/DELETE/session/auth response remains byte-identical |
| Bodyless DELETE admission | PASS: the exact success vector supplies verified loopback peer metadata, bound Host/Origin, protocol, Accept, live session, and valid bearer; stage 5 verifies no body, framing, or `Content-Type`, and stages 1–9 pass before only the named session closes |
| Generic method/invalid DELETE closure | PASS: GET, valid extension, and malformed/unavailable method categories coalesce to 405/-32600 with `Allow: POST, DELETE`; DELETE body, Content-Type, or combined/framing defects coalesce at stage 5 to 400/-32600 before later stages |
| Effective capability projection | PASS: seven safe public names only; `available:true`, `reason_code:null`, at most seven unique items, and runtime `capability_name ASC`; hidden, unavailable, duplicate, and out-of-order cases fail before publication |
| Output-minting dependency closure | PASS: lineage, graph, Navigation discovery, and Navigation audit dependency arrays equal the immutable inventory and include exact record discovery/issuance seams where applicable |
| HTTP cancellation admission | PASS: `MCP-CANCEL-002` is a complete admitted POST with nested cancellation notification, stages 1–9 passed, and 202 empty response |
| Exact vector consistency | PASS: accepted notification/response vectors include complete admission context; every HTTP method named by a precondition matches its exact input, including the GET Origin/method/auth collision |
| Temporal graph scope | PASS: input requires exact non-null `scope_ref,at,state,cursor,limit`; the catalog dependencies equal the inventory row; live scope succeeds while missing/null, stale/expired, and cross-session/cross-agent scope cases fail before projection or reference issuance |
| Authority taxonomy | PASS: the inventory remains exactly 7 public-authenticated, 1 local-bootstrap, and 24 owner-only; no interface operation or catalog row uses a `PRIVATE` authority class, and `private_authority` is described only as an internal transport for selected owner-only rows |
| Timestamp domain | PASS: exact `.sssZ`, calendar-valid, years 1970–9999; four required negative cases rejected |
| Authored UID domain | PASS: lowercase UUIDv4 and uppercase UUIDv8 accepted for authored records; the UUIDv4 value is rejected by agent/session/request UUIDv7 |
| Navigation ordering | PASS: legacy ordering is absent; exact `classification:asc` is frozen in schema and catalog |
| Cursor canonicality | PASS: exact `^gkcur1_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$`; runtime strict 32-byte decode/re-encode accepts canonical final `E` outside AQgw and rejects padding plus alias finals `B`/`D` |
| Reference canonicality | PASS: both 16-byte reference suffixes use exact `[A-Za-z0-9_-]{21}[AQgw]`; strict 16-byte decode/re-encode accepts canonical final `A` and rejects same-length final `E` before lookup for both record and scope refs |
| Canonical path domain | PASS: schema rejects C0/C1 and lexical aliases; runtime rejects non-NFC, invalid scalars, normalization changes, and NFC UTF-8 values above 512 bytes |
| Navigation scope issuance | PASS: `navigation.discover` null/null is the only initial issuance path; same-session reuse and cross-binding/no-oracle cases are frozen; capability listing issues no refs |

Every catalog ref is local and has the exact form
`tool-registry.schema.json#/$defs/<name>`. No network or unresolved `$ref`
is required to materialize a tool input/output schema.

## Negative validation

All prior mutations and the new domain negatives were rejected:

| Vector | Expected/result |
| --- | --- |
| Add an undeclared top-level registry property | rejected |
| Add an eighth required tool | rejected |
| Replace the first ordered tool with an unknown name | rejected |
| Add caller-selected `agent_id` to record input | rejected |
| Use a raw path as `record_ref` | rejected |
| Use an offset timestamp instead of strict UTC `Z` | rejected |
| Emit integer `9007199254740992` as `auth_epoch` | rejected |
| Omit required timestamp milliseconds | rejected |
| Use a pre-1970 timestamp | rejected |
| Use year 0000 | rejected |
| Use an impossible calendar date (`2026-02-31`) | rejected by mandatory `date-time` assertion |
| Use a legacy UUIDv4 as a core UUIDv7 identity | rejected while accepted losslessly as an authored UID |
| Use a noncanonical 43-character cursor payload ending in an invalid trailing sextet | rejected |
| Use C1 U+0085 in a canonical returned path | rejected |
| Use 257 U+00E9 scalars (514 NFC UTF-8 bytes) as a path | rejected by mandatory runtime byte check |
| Use decomposed non-NFC path text | rejected by mandatory normalization-identity check |
| Combine `scope_ref:null` with a continuation cursor | rejected; no scope is issued |
| Use a same-length 22-character `record_ref` suffix ending in noncanonical `E` | rejected by schema and mandatory strict 16-byte decode/re-encode before lookup |
| Use a same-length 22-character `scope_ref` suffix ending in noncanonical `E` | rejected by schema and mandatory strict 16-byte decode/re-encode before lookup |
| Call `gkos_graph_at_time` with omitted or null `scope_ref` | rejected; no graph scan or reference issuance begins |
| Reuse an expired/stale or cross-session graph scope | rejected through the exact non-enumerating reference projection before temporal projection |
| Combine failures at multiple HTTP stages | only the earliest of the nine frozen stages is evaluated and returned; later-stage details remain undisclosed |
| Use extension, lowercase, empty, malformed, or unavailable method metadata | rejected at stage 4 with the one method-not-allowed envelope and exact `Allow: POST, DELETE` |
| Supply DELETE body, Content-Type, transfer framing, or combined defects | rejected at stage 5 with one byte-identical delete-invalid envelope before protocol/session/auth |
| Emit hidden or unavailable capability items or denial reasons | rejected by the closed item schema; hidden names are never enumerated |
| Emit duplicate or non-ascending effective capabilities | duplicates rejected by schema; noncanonical unique order rejected by mandatory runtime ordering |
| Project any request ID for a stage 1–9 pre-dispatch rejection | rejected; canonical `request_id:null` is mandatory even if internal bounded work allocated an identifier |
| DELETE with a body or without complete loopback/session/auth admission context | cannot reach session close; the success vector is exactly bodyless and passes every ordered stage |

## Core dependency status

Strict schema/catalog/vector/runtime-negative validation and the final one-way
core binding are complete. Product work remains **NO-GO** pending independent
review and owner ratification of this corrected package. This receipt is a
proposal-validation result, not acceptance and not authority to begin F1.

## Final artifact digests

| Artifact | SHA-256 / bytes |
| --- | --- |
| `PHASE6_D0_INTERFACE_PROPOSAL.md` | `476e839fb81f2f936785a38278846d33c7a680a84069607b1188c5ca2609e427`; 43,542 bytes |
| `MCP_TOOL_REGISTRY.schema.json` | `5c043dc5570c4c52ad13425925711e672ec198d5910ab5c9e8c1438cb5ed8004`; 49,408 bytes |
| `MCP_INITIAL_TOOL_CATALOG.proposal.json` | `c0ed2b963dcaef8a8bd08a427687d493bb7e85f1e26076a88a04f68b2117de7e`; 12,920 bytes |
| `MCP_2025_11_25_CONFORMANCE_VECTORS.proposal.json` | `23f48e01f890b746012d3713b8ece8331b113927ca15ab72e9955cf03830387c`; 51,108 bytes |
The receipt and provenance file do not hash each other. Provenance records this
receipt's final raw hash after the four primary hashes above are inserted; the
provenance file's raw hash is reported externally in the parent closeout.
