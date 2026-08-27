#!/usr/bin/env node
/**
 * Engine-owned compatibility bridge. It forwards stdio MCP messages to the
 * authenticated loopback service and does not claim native-stdio conformance.
 */
const bridgeUrl = new URL("../dist/service-stdio.mjs", import.meta.url);
let bridge;
try { bridge = await import(bridgeUrl.href); }
catch {
  process.stderr.write("gkos-mcp-stdio: bridge build unavailable\n");
  process.exitCode = 3;
}
if (bridge) process.exitCode = await bridge.runStdioBridge();
