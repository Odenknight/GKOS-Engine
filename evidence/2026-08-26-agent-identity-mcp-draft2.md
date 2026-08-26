# Draft.2 identity/MCP qualification evidence

Source base: `56c11c50dde31d4b92d333223507f050ea72d994`

Contract: `GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.2`

Standing: integration-only. The Draft.1 pack remains byte-frozen. Draft.2 records the authenticated loopback runtime and bounded `gkos-mcp-stdio` compatibility bridge. The bridge delegates authority to the loopback service and does not claim native-stdio conformance.

Qualification commands and exact TAP totals are recorded by the Draft.2 workflow receipts. Local execution must include the Draft.1 and Draft.2 closure tests, stdio and secret-canary tests, typecheck, build, package check, license, nomenclature, and `git diff --check`. Platform workflow evidence remains required before release qualification.

Explicitly excluded: Navigation Effects contracts/runtime, Docker, write tools, proposal ingress, deferred MCP tools, release, deployment, and conformance activation.
