export const HISTORICAL_TEST = "agent-identity-mcp-contract.test.mjs";

export const HOST_RESOURCE_TESTS = Object.freeze({
  "service-vector-real.test.mjs": Object.freeze({
    environment: "GKOS_TEST_LOCAL_EMBEDDING_CONFIG",
    reason: "requires an owner-supplied, locally trusted ONNX runtime and model pack",
  }),
});

export function selectCurrentTests(names, environment = process.env) {
  const files = [];
  const exemptions = [];
  for (const name of [...names].sort()) {
    if (!name.endsWith(".test.mjs") || name === HISTORICAL_TEST) continue;
    const hostResource = HOST_RESOURCE_TESTS[name];
    if (hostResource && !environment[hostResource.environment]) {
      exemptions.push(Object.freeze({ name, ...hostResource }));
      continue;
    }
    files.push(name);
  }
  return Object.freeze({ files: Object.freeze(files), exemptions: Object.freeze(exemptions) });
}
