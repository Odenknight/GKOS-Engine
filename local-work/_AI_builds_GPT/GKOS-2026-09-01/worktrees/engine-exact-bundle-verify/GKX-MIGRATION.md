# GKX 2.0 breaking change

GKOS-Engine 2.0.0 adopts the GKX 2.0 contract as its only public schema and
runtime surface.

- Use `gkx_version` in documents.
- Use `.gkx/` for engine state.
- Use `GKX-*` diagnostic identifiers.
- Invoke the CLI as `gkx`.
- Use `Gkx*` public APIs and GKX source modules.

The release removes prior naming aliases. Consumers must update their stored
documents, invocation scripts, integrations, and imports before adopting 2.0.0.
