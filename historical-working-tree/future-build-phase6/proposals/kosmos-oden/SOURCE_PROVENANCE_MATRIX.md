# Kosmos-Oden source and provenance matrix

Date: 2026-08-25 (America/New_York)  
Purpose: evidence for the GKOS Phase-6 D0 interface proposal; not product authority  
Status: proposal evidence only; no Phase-6 implementation is authorized by this file

## Coordinates and selection

| ID | Repository / source | Exact coordinate | Local state observed | Use in this assessment |
| --- | --- | --- | --- | --- |
| KO-FULL | `Odenknight/Kosmos-Oden` | commit `a7113c0ca3be8dd230a9549940e2f387d4cb2a96`, `main`, 2026-08-18, subject `update Kosmos-Oden for Engine 2.1.1 (#31)` | clean at inspection at `[LOCAL_PATH] remote `https://github.com/Odenknight/Kosmos-Oden.git`; describe `0.7.0-17-ga7113c0` | Primary Kosmos-Oden evidence. This is the newest authoritative-repository checkout found locally. |
| KO-OLDER | `Odenknight/Kosmos-Oden` | commit `04b099a851d4eb5d2daa706eb2f562c7e0e12892`, `main`, 2026-08-16, subject `Release Kosmos-Oden 0.8.0 with Engine 2.1 Navigation (#30)` | clean; same GitHub remote; describe `0.7.0-16-g04b099a` | Corroboration only; superseded locally by KO-FULL. |
| KO-LITE | `Odenknight/Kosmos-Oden-Lite` | commit `dcb6c98c7d04c865a3edc6877462f258c4c900da`, `main`, 2026-07-19, subject `fix: port upstream bug fixes ... (1.0.2)` | pre-existing modified `package-lock.json`; remote `https://github.com/Odenknight/Kosmos-Oden-Lite.git`; describe `1.0.2-dirty` | Corroboration only. Dirty state prevents treating working-tree bytes as a release pin. |
| GKOS-P6-BASE | `Odenknight/GKOS-Engine` | owner-selected Phase-6 Full base `808d875b557f4cfd2bb0addccba44d70c9748f35` | commit object present locally; owner reports hosted qualification run `32881187799` | Qualified capability boundary for the proposal. Kosmos-Oden's dependency pin is older and does not itself qualify Phase-5 effects. |
| D0-PLAN | local Phase-6 plan | `future-build-phase6/PHASE6_MINIMUM_WORK_PACKAGE_PLAN_2026-08-25.md`; inspected SHA-256 `c22d0e1b99a1865c7a66f96e20778b5e991c8f0bf040b2d43bca4243ce542d36` | planning file in shared workspace | Scope constraint and question list only; evidence, not owner authority.

Canonical commit links:

- KO-FULL: <https://github.com/Odenknight/Kosmos-Oden/tree/a7113c0ca3be8dd230a9549940e2f387d4cb2a96>
- KO-LITE: <https://github.com/Odenknight/Kosmos-Oden-Lite/tree/dcb6c98c7d04c865a3edc6877462f258c4c900da>
- GKOS-P6-BASE: <https://github.com/Odenknight/GKOS-Engine/tree/808d875b557f4cfd2bb0addccba44d70c9748f35>

No unverified claim about a newer remote Kosmos head is made. Permanent commit
URLs and locally present Git objects are the Kosmos capability boundary. The
official MCP repository was separately read at the exact commit recorded below.

## Primary files

All Kosmos-Oden paths below are under KO-FULL. SHA-256 values describe the exact
local bytes inspected at that commit checkout.

| ID | Path and permanent URL | SHA-256 / bytes | Observed evidence |
| --- | --- | --- | --- |
| KO-API-GUIDE | [`AGENT-API.md`](https://github.com/Odenknight/Kosmos-Oden/blob/a7113c0ca3be8dd230a9549940e2f387d4cb2a96/AGENT-API.md) | `d4b4d3feb411b7f950c80f5958650c90e43fa7dedc4e65f72f31bc9c5868a3f3` / 5,602 | Read-only localhost-first MCP Streamable HTTP endpoint; stdio adapter; supported tool descriptions; 20/100 Graphiti pagination; session/protocol headers; REST mirrors; security/error summary. Header still says `v0.6.5-alpha.8` although package metadata is `0.8.0`; treat prose version as stale. |
| KO-SERVER | [`src/plugin/agent-server.ts`](https://github.com/Odenknight/Kosmos-Oden/blob/a7113c0ca3be8dd230a9549940e2f387d4cb2a96/src/plugin/agent-server.ts) | `bf0a97e7c6acd884a989491a1c95e2578ef1014a065fbfdceb72147c278bf80f` / 71,465 | Executable source for auth, filtering, MCP negotiation/session lifecycle, REST, tool definitions, query behavior, error handling, and bounds. This outranks descriptive prose when they differ. |
| KO-STDIO | [`kosmos-mcp-stdio.mjs`](https://github.com/Odenknight/Kosmos-Oden/blob/a7113c0ca3be8dd230a9549940e2f387d4cb2a96/kosmos-mcp-stdio.mjs) | `b768aa5ff8f14b60bef1e3be42d0cf80e87bac7e4193cf885c1fb33b95353fec` / 3,309 | Newline-delimited stdio-to-HTTP adapter, 65-second HTTP timeout, session/version header preservation, DELETE on EOF. It awaits each forwarded request serially and contains no cancellation routing. |
| KO-SETTINGS | [`src/plugin/settings.ts`](https://github.com/Odenknight/Kosmos-Oden/blob/a7113c0ca3be8dd230a9549940e2f387d4cb2a96/src/plugin/settings.ts) | `367fee0fa51aea8b9b480260dd115c65d75e4903f3041c80b17c4cfe50ae6113` / 43,714 | User-visible security posture, connector configuration, sensitivity controls, Graphiti positioning, and explicit write-workflow separation. |
| KO-KGCP | [`docs/KOSMOS-GOVERNED-CONTEXT-PROJECTION.md`](https://github.com/Odenknight/Kosmos-Oden/blob/a7113c0ca3be8dd230a9549940e2f387d4cb2a96/docs/KOSMOS-GOVERNED-CONTEXT-PROJECTION.md) | `9d966521d254b6b4f31b99940cd9b73f24b0c565614416d8d0d33d5a65abf84f` / 2,680 | KGCP is a deterministic projection; source notes remain authoritative; Graphiti is optional and inferred output may only return as derived/proposed sidecars. |
| KO-TEST-API | [`test/agent-api.test.mjs`](https://github.com/Odenknight/Kosmos-Oden/blob/a7113c0ca3be8dd230a9549940e2f387d4cb2a96/test/agent-api.test.mjs) | `2fed020624414e56082a0abb75ff9e74ddbad1d980f3f165d1a3decf271513c6` / 31,558 | Tests auth, no-store, host/origin rejection, 4 MiB body cap, read-only routes, MCP initialization, tools, sessions, fairness, sensitivity filtering, and output truncation. |
| KO-TEST-STDIO | [`test/stdio-bridge.test.mjs`](https://github.com/Odenknight/Kosmos-Oden/blob/a7113c0ca3be8dd230a9549940e2f387d4cb2a96/test/stdio-bridge.test.mjs) | `6e361b1200b540fb4852891369979945f8c9acfc503700baba66e7f3868ac015` / 2,988 | Confirms initialize, initialized notification, tool listing, and session forwarding through the adapter. It does not test cancellation or parallel request handling. |
| KO-PACKAGE | [`package.json`](https://github.com/Odenknight/Kosmos-Oden/blob/a7113c0ca3be8dd230a9549940e2f387d4cb2a96/package.json) | `9540fd9df3e4c4b0195db035249afbeaca726a18c901d14c62a9b9588c611e84` / 2,543 | Product `0.8.0`, Node `>=22 <25`, TypeScript `5.9.3`, dependency `gkos-engine#v2.1.1` / allowed exact engine commit `f4dfda16...`. |

GKOS-P6-BASE files are cited by commit and Git blob because the shared root
working tree contains unrelated earlier material:

| Path | Git blob at `808d875...` | Evidence used |
| --- | --- | --- |
| [`TECHNICAL_README.md`](https://github.com/Odenknight/GKOS-Engine/blob/808d875b557f4cfd2bb0addccba44d70c9748f35/TECHNICAL_README.md) | `4afae92889b04c55af1f6d81b4ddb1ae104a00bb` | Pure Navigation operations, discoverability policy, deterministic ordering, governance boundary, deferred MCP writes, and separate effects plane. |
| [`README.md`](https://github.com/Odenknight/GKOS-Engine/blob/808d875b557f4cfd2bb0addccba44d70c9748f35/README.md) | `a3a388e240edbcf59bc6b578083d4c70a01a1e4f` | Validation/projection/assessment/graph and Navigation capability overview. |
| [`src/gkx23.ts`](https://github.com/Odenknight/GKOS-Engine/blob/808d875b557f4cfd2bb0addccba44d70c9748f35/src/gkx23.ts) | Git blob `368fa9bb5e5d4a8a32bccd8ceb9058932b33f387` | `isValidGkxAuthoredUid` uses a case-insensitive UUID pattern whose version nibble is 1–8; this is the exact lossless `record_summary.uid` source contract and is distinct from Phase-6 agent UUIDv7. |
| [`src/paths.ts`](https://github.com/Odenknight/GKOS-Engine/blob/808d875b557f4cfd2bb0addccba44d70c9748f35/src/paths.ts) | Git blob `9ed8868e40ed9d343394476a4d4051cc7e9dad61` | Exact `normalizeVaultRelative` and code-unit ordering seam; the interface additionally freezes strict pre-I/O identity, scalar, control, NFC, and 512-byte checks rather than treating normalization as validation. |
| [`package.json`](https://github.com/Odenknight/GKOS-Engine/blob/808d875b557f4cfd2bb0addccba44d70c9748f35/package.json) | `25ca136b08dd1a16689151d88512614627efc6f7` | Public exports for core, Graphiti adapter, Navigation, Navigation Effects, Node effects, and Governance. |
| [`contracts/navigation-effects/ENGINE-NAV-EFFECTS-CONTRACT-1.0.0/manifest.json`](https://github.com/Odenknight/GKOS-Engine/blob/808d875b557f4cfd2bb0addccba44d70c9748f35/contracts/navigation-effects/ENGINE-NAV-EFFECTS-CONTRACT-1.0.0/manifest.json) | `d7bde01469c28bac74b300ee10194ea056e9a3fc` | Evidence that effect planning/execution has its own qualified contract and must not be collapsed into read/query semantics. |

## Official MCP 2025-11-25 sources

These files were fetched read-only from the official
`modelcontextprotocol/modelcontextprotocol` repository at commit
`c4c367f9f58296a7053f5c78a52fd02bfbb56a49` (2026-07-27). Raw SHA-256 is over
the downloaded UTF-8 bytes, not rendered GitHub HTML.

| Path and permanent URL | Raw SHA-256 / bytes | Normative evidence used |
| --- | --- | --- |
| [`schema/2025-11-25/schema.json`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/c4c367f9f58296a7053f5c78a52fd02bfbb56a49/schema/2025-11-25/schema.json) | `268a5f82ba70fd7e4b6dc4aa1e64f116f74b4d0edcb69dc046829c79dd4e97e7` / 174,323 | Standard request/result shapes, Implementation fields, `_meta`, Tool, annotations, CallToolResult |
| [`docs/specification/2025-11-25/basic/lifecycle.mdx`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/c4c367f9f58296a7053f5c78a52fd02bfbb56a49/docs/specification/2025-11-25/basic/lifecycle.mdx) | `45a6e8b7fb8c96e7b9ba1b0a3c727e8451c1e55bf56bb62f3ab63fddc365b919` / 9,442 | Initialize-first lifecycle, required server information, version negotiation, ping/logging exceptions, transport shutdown |
| [`docs/specification/2025-11-25/basic/transports.mdx`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/c4c367f9f58296a7053f5c78a52fd02bfbb56a49/docs/specification/2025-11-25/basic/transports.mdx) | `a247fdbb3cc25c805ef43124db18d9b60a56669b3e65bd163dffb76f4129dfc0` / 15,986 | Newline stdio, Streamable HTTP Accept rules, 202 empty notification/response, JSON-or-SSE request response, Origin/session/version/GET rules |
| [`docs/specification/2025-11-25/basic/utilities/cancellation.mdx`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/c4c367f9f58296a7053f5c78a52fd02bfbb56a49/docs/specification/2025-11-25/basic/utilities/cancellation.mdx) | `9bd2a4422cf22b003621b0da0b812cb7b85c00e2feee1e6847a9d2f4837343d4` / 2,722 | Same-direction in-flight cancellation, initialize prohibition, best-effort stop/free/no-response, malformed/unknown/completed ignore |
| [`docs/specification/2025-11-25/server/tools.mdx`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/c4c367f9f58296a7053f5c78a52fd02bfbb56a49/docs/specification/2025-11-25/server/tools.mdx) | `39e56ad4f3d1ff1cb28ee62283e02947cd97db8aa6190782d629f4562a0f354c` / 13,629 | Valid input/output schemas, structured content, standard Tool fields/annotations, protocol versus execution errors |

The 67 machine-readable positive/negative vectors in
`MCP_2025_11_25_CONFORMANCE_VECTORS.proposal.json` pin these five official MCP
sources and separately pin Full `src/gkx23.ts` for authored UID cases. The
vector file is a proposal test source, not evidence that an implementation has
passed.

## Stable core dependencies

These are one-way dependencies: the corrected interface binds core bytes; core
binds only the five interface product leaf names/layout/counts and does not hash
the independently authored interface proposal.

| Core artifact | Raw SHA-256 / count |
| --- | --- |
| `future-build-phase6/proposals/core/GKOS_PHASE6_D0_CORE_SPEC_PROPOSAL_2026-08-25.md` | `168d686594952786c55e255483847ce29d5c6e712d792a6534d1e78d8010163c`; 117,722 bytes |
| `future-build-phase6/proposals/core/PHASE6_D0_CORE_DECISION_RECORD_PROPOSAL_2026-08-25.json` | `29f49ac280f87311841deb21dc5c0e07d6c126d6840c41875ee0053b2600c5c5`; 28,582 bytes; contains the immutable operation-inventory/request-result coordinate |
| `future-build-phase6/proposals/core/PHASE6_D0_CORE_OPERATION_INVENTORY_PROPOSAL_2026-08-25.json` | `d84f2e6ee6e3f7de0a6956d868fc0b2f1ae0ff7809f05ab85d52a0490bc69b87`; 45,471 bytes; 32 operations / 54 embedded definitions / 14 lowercase public tool refs / authority split 7 public, 1 bootstrap, 24 owner-only; fixes product `operation-inventory.schema.json` and `operation-inventory.json` paths |
| `future-build-phase6/proposals/core/PHASE6_D0_CLOSED_ERROR_REGISTRY_1.0.0-draft.1.json` | `5dd45eaa90dee7a03b29e36131740e9480131307a6266d5f61eeeb0a5245e9a5`; 17,606 bytes; 53 codes / 34 aliases; freezes generic invalid-method, invalid-DELETE, nine-stage order, all-null request-ID, and unique pre-dispatch projections |
| `future-build-phase6/proposals/core/P6_F1_ALLOWED_PATHS_PROPOSAL.txt` | `7e75c1b8cbd96aa80405f981995e3691e3b073c4929d0c0cb84db615ed694fce`; 40 paths / 3,312 bytes |
| `future-build-phase6/proposals/core/P6_F1_PROTECTED_PATHS_PROPOSAL.txt` | `f920a006015ac77920dcbb611fd1a2c19e711d9002eb778a056137f50b2cc948`; 22 paths / 515 bytes |
| `future-build-phase6/proposals/core/PROPOSAL_VALIDATION_2026-08-25.md` | `4f31f73833344b0d771775beb869f32da3404c6ef49b1c53f365e2407cd3b6b8`; 21,204 bytes |
| `future-build-phase6/proposals/governance/PHASE6_SOL_ASSIGNMENT_AND_ACCEPTANCE_MATRIX.md` | `6bbbe8c4c20df32598777909619ddd003af46cdcda7c732060df0f0a9e8dda4f`; 31,178 bytes / 417 lines |

## Corrected proposal artifacts

| Artifact | Purpose | SHA-256 / bytes / count |
| --- | --- | --- |
| `PHASE6_D0_INTERFACE_PROPOSAL.md` | Corrected D0 interface decision proposal, 38-finding closure, and V6 object-closure rule | `476e839fb81f2f936785a38278846d33c7a680a84069607b1188c5ca2609e427`; 43,542 bytes |
| `MCP_TOOL_REGISTRY.schema.json` | Strict self-contained Draft 2020-12 registry schema and exact tool input/result `$defs` | `5c043dc5570c4c52ad13425925711e672ec198d5910ab5c9e8c1438cb5ed8004`; 49,408 bytes; 58 definitions; 7 required schema branches; 16 deferred branches |
| `MCP_INITIAL_TOOL_CATALOG.proposal.json` | Separate registry instance | `c0ed2b963dcaef8a8bd08a427687d493bb7e85f1e26076a88a04f68b2117de7e`; 12,920 bytes; 7 required tools; 16 deferred surfaces |
| `MCP_2025_11_25_CONFORMANCE_VECTORS.proposal.json` | Exact MCP lifecycle/transport/tool/schema conformance cases | `23f48e01f890b746012d3713b8ece8331b113927ca15ab72e9955cf03830387c`; 51,108 bytes; 67 vectors; 5 pinned official sources; 7 materialized Tool objects checked against official `#/$defs/Tool` and CallToolResult |
| `PROPOSAL_VALIDATION_2026-08-25.md` | Strict Ajv/ref/runtime-negative/object-closure/official-Tool/CallToolResult/hash receipt | `7f2171bc98112a529f05b9324be20475484ec55e4ac392829109e6f94121daef`; 11,655 bytes |

## Observed capability matrix

`Observed` means executable source plus tests or executable source plus matching
documentation were found. `Inference` means a Phase-6 design conclusion, not a
claim about current Kosmos-Oden.

| Capability | Evidence | Classification |
| --- | --- | --- |
| Read-only REST and MCP over one sensitivity-filtered graph | KO-SERVER lines 20-21, 502-951, 1188-1282; KO-TEST-API | Observed |
| Streamable HTTP at `/mcp`, one JSON-RPC message per POST, session and protocol headers, DELETE termination | KO-SERVER lines 954-1246; KO-API-GUIDE | Observed |
| Stdio compatibility | KO-STDIO; KO-TEST-STDIO | Observed as an adapter to HTTP, not as an independent native server |
| Protocol versions `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05` | KO-SERVER lines 30-33 | Observed |
| Auth token, host/origin checks, loopback default, LAN opt-in | KO-SERVER lines 95-126, 330-468; KO-TEST-API | Observed |
| Authenticated multi-agent identity | No evidence. `clientInfo.name` is cleaned and stored as a display/fairness label (KO-SERVER lines 282-322). | Not observed; explicitly insufficient for Phase-6 identity |
| Query tools for overview/search/note/lineage/related/time graph/GKX projections/assessment/diagnostics/evidence/relationships/policy | KO-SERVER lines 648-853, 956-1053 | Observed |
| Graphiti episode export/status | KO-SERVER lines 874-938; KO-KGCP | Observed as a non-authoritative adapter projection |
| Source or governance writes through MCP | KO-SERVER lines 20-21 and tool list | Not present |
| Cooperative cancellation | No handler or in-flight request registry found; stdio adapter serializes requests | Not observed |
| Closed application error registry | Query functions return ad hoc `{error}` objects; output schemas allow arbitrary properties; internal messages can pass through | Not observed |
| Snapshot-stable pagination | Graphiti cursor is a mutable integer offset | Not observed |
| Native stdio and HTTP sharing one authority service | Current stdio is HTTP forwarding | Phase-6 inference/recommendation |
| Native stdio, multi-agent core identity, stateful snapshot cursor, closed `GKOS_P6_*` errors, and seven-tool Phase-6 registry | Corrected interface/core proposals | Proposed, not observed in Kosmos and not implemented by these artifacts |

## Provenance cautions

1. Kosmos-Oden is a product integration and evidence source, not the Phase-6
   semantic authority. The owner-selected Full Engine pin and the future frozen
   F1 pack must govern implementation.
2. KO-FULL calls itself `0.8.0` in `package.json`, while `AGENT-API.md` retains
   an older alpha heading. Capability claims were therefore checked against
   source and tests.
3. KO-FULL depends on Engine 2.1.1. It does not prove the later Phase-5
   Navigation Effects contract at `808d875...`; that capability is considered
   only through the qualified Engine coordinate.
4. No result from retrieval, graph traversal, Graphiti, an assessment score, or
   an agent display label is identity, authorization, authored truth, accepted
   governance, or a state-change receipt.
