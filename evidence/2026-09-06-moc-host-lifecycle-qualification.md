# Engine 2.2 MOC host lifecycle qualification packet

Date: 2026-09-06. Scope: Engine issue #44, next host-integration qualification packet. This is not a release, native power-loss or completed cross-repository qualification claim.

## Completed hosted baseline

Implementation: `a4ed15d8de20222919f2aad43cbbea83f01d219e`.
Downloaded current-runtime receipts from [run 34016540898](https://github.com/Odenknight/GKOS-Engine/actions/runs/34016540898).
Their actual checked-out head is the GitHub merge commit `c4cf3579aca2b998f4c7a0d218b3c123c1d87545`.
Its recorded tree `1bda8c39a08b9758dc791acf73d15effb3fb0f01` matches `git rev-parse 'a4ed15d^{tree}'` exactly.
Every downloaded build/test log SHA-256 was checked against its receipt. All six receipts report PASS, zero failed/cancelled/skipped/todo tests, and `release_qualified: false`.

| Platform | Node | Tests passed | Receipt SHA-256 |
| --- | --- | --- | --- |
| Ubuntu 24.04 | 22.23.2 | 1077/1077 | `b19bf4407a27ea91cf2c812b5520b27e8c838a7eb690bc73b9b513923f6832a2` |
| Ubuntu 24.04 | 24.20.0 | 1077/1077 | `46069fe1259af0cb8858a8239ce5b77609022263c816a547b6b3a01b6341c44e` |
| Ubuntu 24.04 | 26.8.1 | 1077/1077 | `5fd50ec4dea859cb2c615f9e430e1503356b934c0b2ba80355edba0d712cd051` |
| Windows hosted | 22.23.2 | 1067/1067 | `8d18f3a00224e64ca9c03eff65762cca049f2fcf00196deebb70b086e39ddcfa` |
| Windows hosted | 24.19.0 | 1067/1067 | `db77c62127aad6625ba2723df0b20b5be0d6e90a0a809f52645e39293e72ea78` |
| Windows hosted | 26.8.1 | 1067/1067 | `c6e5ec8ad6f10b09e49aa8e2583f9fb565c48d1815264424e3b4bd1d0090c116` |

Node 26 is informative. The workflow also passed its nine historical replay jobs. The separate [CI run 34016540894](https://github.com/Odenknight/GKOS-Engine/actions/runs/34016540894) passed; its explicitly manual observation job was not requested. The prior Windows libuv abort at `03f4328` remains in the earlier evidence document; it is not a failure of this repaired tree.

## New executable lifecycle coverage

Extended `test/navigation-effects-host.test.mjs`, without changing production code:

1. Missed events converge through periodic reconciliation; unchanged full passes add no effect journal entries; startup catches changes made while offline.
2. A consumer-reported cross-folder rename reconciles both endpoint scopes, empties the old managed scope, and adds no effect plan for an unrelated MOC. This exercises supplied snapshot/index changes, not a claim about every OS's raw rename-event delivery.
3. Shutdown waits at an active committed-effect publication boundary, refuses later admission, durably retains the newer already-admitted revision and converges on restart.
4. Failed graph publication leaves recoverable pending ownership; restart republishes the same effect ID/digest, advances ownership and does not rewrite or rearchive the already committed MOC. Consumers must make publication idempotent: callback delivery is at least once, not exactly once.

Tests use owned synthetic temporary vaults, real state/archive/receipt I/O and deterministic supplied snapshots/clocks. They do not activate an owner vault or use an LLM. Local preflight: `node --test test/navigation-effects-host.test.mjs` passed 11/11 on Windows Node 24.18.0. `npm run test:navigation` rebuilt the package and passed 160/160 with zero failures, cancellations or skips. `npm run typecheck`, the source-inventory check and whitespace check passed. New tests must pass the successor commit's hosted checks; baseline counts above must not be copied forward.

## Surface review and remaining gates

| Surface | Disposition |
| --- | --- |
| Pure Navigation, managed batch planner, generated-region preservation | Implemented, existing purity/determinism/adversarial coverage retained |
| Durable host intent, owned-target updates, commit-to-ownership recovery | Implemented; lifecycle coverage extended in this packet |
| Watcher signal composition and startup/manual/passive reconciliation | Implemented; one real watcher test plus deterministic host lifecycle tests, not universal watcher delivery proof |
| Model-free assistance and optional structured provider boundary | Implemented; provider transport, approval UI and live quality evidence are consumer work |
| Byte-identical host pass | No source rewrite or new executor transaction; dedicated durable no-op audit receipts are not emitted by this host and remain a plan gap |
| Incremental parsing and dependency completeness | Consumer snapshot/index responsibility; host scope selection does not prove end-to-end parse counts |
| End-to-end P95, scale and 24-hour soak | Outstanding; earlier planning timings are not these results |
| Native durability / power loss / hostile ancestor-swap protection | Not established; cooperative-vault and documented directory-flush limitations still apply |
| Kosmos adapter/UI/agent-note delivery | Separate owner: Odenknight/Kosmos-Oden#40 |
| Rust parity and program intake | Separate owner: Odenknight/GKOS-Engine-Rust#2; frozen oracle unchanged |
| Immutable release and final consumer pin | Outstanding authorized release gate; candidate stays 2.2.0, unpublished |

No source-write authority, release authority or conformance status is inferred from successful tests. Continue with measured end-to-end/soak qualification and review the durable no-op audit requirement before declaring the whole MOC plan complete.
