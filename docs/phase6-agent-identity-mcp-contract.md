# Phase 6 F1 identity/MCP contract

This document is the product-side index for the F1 contract-only implementation. The generated pack is at `contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1/`.

## Frozen contents

- exactly 34 leaves; `pack-manifest.json` hashes the other 33;
- exactly 32 core operations: seven public authenticated, one local bootstrap, and 24 owner-only;
- exactly 54 definitions and 14 lowercase public request/result references in the core operation inventory;
- seven required read-only MCP tools and 16 deferred surfaces;
- 53 closed errors and 34 interface aliases;
- 67 MCP/interface conformance vectors and eight core bootstrap/credential result vectors;
- native stdio and loopback-only Streamable HTTP as contract-only transports;
- deterministic tar evidence with normalized names, modes, owners, and epoch-zero modification times.

## Use

Run `node scripts/generate-agent-identity-mcp-contract.mjs --check` to compare checked-in leaves to deterministic output. Run `node --test test/agent-identity-mcp-contract.test.mjs` for schema, canonicalization, manifest, inventory, protected-path, reproducibility, archive, and secret-scan gates.

The generator also supports `--output-root <fresh-directory>` and `--archive <tar-path>`. Generated output is repository-root relative below the frozen contract path.

## Non-claims

F1 does not activate or publish identity authority, credentials, sessions, migrations, MCP transport, record discovery, or effects behavior. Platform entries prove contract portability only. No schema or fixture is evidence of runtime enforcement.
