# GKOS-Engine 3.0 — Oracle and Protocol Approval

**Date:** 2026-09-04  
**Owner disposition:** APPROVED

## Oracle

```text
Repository: Odenknight/GKOS-Engine
Oracle commit: 8207958047b3361ae21ac07c5a2abbd26a42a684
Reference: oracle/3.0-baseline
```

The signed `v2.1.2` coordinate remains separately preserved as release evidence.

The compatibility oracle does not control future protocol-version selection. External communication protocol targets are independently version-locked and may advance without moving the oracle.

## Protocol amendment

```text
MCP primary:       2026-07-28
MCP compatibility: 2025-11-25

A2A primary:       upstream current released 1.0.0
A2A 1.0.1:         HOLD
```

The `1.0.1` coordinate remains held as erroneous/prospective until either:

1. an actual upstream `1.0.1` release is source-locked; or
2. a documented GKOS Standard disposition controls the coordinate.

Existing Standard development references to A2A `v1.0.1` remain preserved as source evidence and must be reported as a protocol-coordinate divergence until resolved. They must not be silently implemented as though they were a released upstream protocol.

## M0 authority boundary

This approval authorizes:

- the `oracle/3.0-baseline` compatibility reference at the exact approved commit;
- M0 planning/oracle work on the Rust 3.0 development line; and
- protocol locks using the coordinates above.

It does **not** itself authorize:

- merge to `main`;
- a `v3.0.0` tag or release;
- deployment or production credentials;
- a profile/conformance claim;
- writer/effect activation; or
- TypeScript retirement.
