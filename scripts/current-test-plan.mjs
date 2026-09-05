export const HISTORICAL_TEST = "agent-identity-mcp-contract.test.mjs";

// These integration oracles carry strict elapsed-time or shutdown deadlines.
// Run them before the exhaustive suite has accumulated filesystem/process load;
// their assertions and limits remain unchanged.
export const STABILITY_PRIORITY_TESTS = Object.freeze([
  "watcher-observation-qualification.test.mjs",
  "watcher-large-restart.test.mjs",
  "service-stdio-package.test.mjs",
]);

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
  const priority = new Set(STABILITY_PRIORITY_TESTS);
  const ordered = [
    ...STABILITY_PRIORITY_TESTS.filter((name) => files.includes(name)),
    ...files.filter((name) => !priority.has(name)),
  ];
  return Object.freeze({ files: Object.freeze(ordered), exemptions: Object.freeze(exemptions) });
}
