# Phase 6 successor-F1 identity/MCP contract

This document indexes the local, uncommitted successor-F1 contract correction at `contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1/`. Its first and second generated fixture embodiments were independently rejected. The frozen current remediation passed the complete 35-test local V15 suite and independent audit accepted it as local validation. No commit, push, merge, hosted qualification, release, or activation is claimed.

## Ratified target surface

- 32 core operations: seven public authenticated, one local bootstrap, and 24 owner-only;
- seven required read-only MCP tools and 16 deferred public tool surfaces;
- 53 exact registered error codes and 67 unchanged official MCP vectors;
- 468 canonical non-MCP fixture cases, 12 non-counting aliases, and 16 families;
- canonical-case allocation of 67 canonical, 89 migration, 107 race, and 205 security cases;
- 44 exact cross-table global-event matrix cases plus four same-table collision cases;
- 20 exact observed-output sink-by-sensitive-class cases;
- exact Q17 protected-locator prepublication failure and Q18 two-process `agent.disable` serialization cases;
- Q24's closed `bootstrap_initialize_result` union: terminal `bootstrap_result` or the exact 12-field `bootstrap_handoff_result` for delivered/ambiguous locator handoff coordinates;
- the exact RSR-001 stale-cursor response and Q23 rational rate-refill examples, including restart carry;
- native stdio and loopback-only Streamable HTTP descriptions as contract-only transports.

The required Q21 fixture embodiment is a deterministic oracle. Synthetic identifiers, clocks, request/result/error bytes, content-free credential evidence, ledgers, mutation diffs, retry samples, RSR-001, and poststate digests exist only to make contract cases executable and reproducible. The rejected first embodiment did not prove all required request, transition, diff, and digest semantics. Fixture algorithms do not define production entropy and must not become runtime digest algorithms.

## Coordinates and validation

The accepted predecessor commit is `e29e04bdad1cd192a25eba2d682a4c46774def28`. It is immutable historical accepted-F1 evidence and is the base for this successor correction. The manifest's `source_base_commit` remains the independent proposal-entry coordinate `808d875b557f4cfd2bb0addccba44d70c9748f35`; it is not replaced with the predecessor and no predecessor-result coordinate is embedded in generated pack bytes.

Run `node scripts/generate-agent-identity-mcp-contract-draft1.mjs --check` to compare checked-in Draft.1 leaves with deterministic output. Run `node --test test/agent-identity-mcp-contract.test.mjs` for strict-schema, fixture closure, manifest integrity, reproducibility, archive, scope, protected-path, and secret-material checks. The generator's `--output-root <fresh-directory>` mode supports isolated-root reproducibility checks.

The accepted Registry and source-coordinate hashes retain their historical predecessor spelling. On current `main`, operational commands use the renamed Draft.1 generator path above because the original filename belongs to Draft.2; this path adaptation does not rewrite the ratified historical authority coordinate.

The second rejected remediation passed its 15-test focused suite, but that result is superseded as closure evidence. The suite did not yet prove every exact V15 FX tag/preimage, complete typed abstract rows, request/activity byte-digest bindings, the exact session and RATE boundary cases, or process B's exact Q18 request/retry bytes. A new local result may be recorded only against a stable corrected regeneration after those gaps are independently tested.

The strengthened independent gates also require product-row, physical-object, event, effect, session, retry-wire, bootstrap-state, source-shape, and rename embodiment; proof labels or counters alone are insufficient. They validate Q24 handoff responses against the closed union, recompute `result_digest` from canonical result bytes with that field omitted, and require lost/replayed handoffs to rehydrate one durable nonsecret result with zero second write or reveal. The one current replay request and response both retain the durable original `request_id` and set `retry_of` to that same original identifier; the historical delivery and acknowledgement loss remain durable prestate rather than a second wire pair. On the frozen current pair, the complete local command passed 35 of 35 tests with zero failures. Independent audit accepted the repaired external-effect joins, selective manifest binding, zero-outbox idempotency semantics, strengthened CREDENTIAL22 and BOOTSTRAP39 gates, and the exact 468-canonical/12-alias census with no missing, extra, source, ordinal, raw, or primary-key failures.

Q23 represents exactly one token per six seconds using `refill_microtokens_numerator=1000000`, `refill_interval_ms=6000`, and persisted `refill_remainder_numerator` in `0..5999`. Integer quotient credit and carried remainder must survive restarts without rounding drift.

## Availability boundary

This successor-F1 work grants no runtime authority and starts no MCP listener. It does not make `/mcp` or `hosted-green` available and does not make an Engine-Lite identity/MCP surface available. It neither activates nor publishes identity authority, credentials, sessions, migrations, record discovery, transports, or effects behavior.

Full F2 through F5 and Lite L1 through L4 remain unavailable and deferred to their separately authorized and qualified phases. Accepted local validation does not constitute runtime enforcement, hosted-green qualification, activation, publication, release, or qualification of those later phases.
