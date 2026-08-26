# ADR 0007: Activate the identity/MCP Draft.2 integration contract

Status: accepted for integration qualification; not a production or conformance declaration

Draft.2 preserves the Draft.1 contract pack byte-for-byte and versions the runtime evidence separately. It records the seven implemented read-only tools and the authenticated loopback HTTP service. A packaged `gkos-mcp-stdio` compatibility bridge delegates to that same service using a private token file. The bridge is not a second authority, does not implement write tools, and does not claim native-stdio conformance.

The remaining sixteen tool surfaces stay deferred. Navigation Effects, proposal ingress, release promotion, and write authority remain outside this decision.
