# Agent identity and MCP Draft.2

Draft.2 is an integration-only contract sibling of the frozen Draft.1 pack. It binds the existing credential-scoped loopback service and seven read-only tools to a packaged stdio compatibility bridge.

Clients launch `gkos-mcp-stdio` with `GKOS_MCP_TOKEN_FILE` pointing to the owner-only MCP-agent token path written by the desktop agent. `GKOS_MCP_URL` may override the default only with a literal loopback HTTP `/mcp` URL. Raw tokens, URL credentials, query parameters, non-loopback hosts, and forwarded identity are rejected.

The bridge keeps one HTTP MCP session, bounds input, output, concurrency, and shutdown, and deletes the session on EOF where possible. Its authority remains the local service. Seven tools are implemented; sixteen remain deferred. This does not activate proposal or Navigation Effects writes and is not a production compatibility claim.
