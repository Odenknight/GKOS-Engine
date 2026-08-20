# Provider-neutral ingestion contract

GKOS-Engine 2.1.2 owns a deterministic envelope for content acquired and
converted by an external provider adapter. Provider-specific connectors remain
separate packages. They must not add SDKs, credentials, network calls, or
provider nondeterminism to the Engine core.

`IngestionEnvelope` preserves:

- provider and authoritative source identity;
- authoritative source version;
- acquisition time, actor, and method;
- digest of the authoritative original;
- converted content and its distinct digest;
- converter identity, version, and explicit provenance;
- `current`, `stale`, or `indeterminate` freshness; and
- an explicit connector-failure code and retryability when applicable.

Converted text is a derived representation and is never presented as the
authoritative original. `acceptIngestionEnvelope()` validates bindings and
digests and returns a frozen value. It performs no network access and accepts no
provider credentials.

This release does not ship Google Docs, Notion, SharePoint, or Confluence
connectors and does not expose an MCP server. Future adapters must live outside
the deterministic Engine core and supply this envelope at the boundary.
