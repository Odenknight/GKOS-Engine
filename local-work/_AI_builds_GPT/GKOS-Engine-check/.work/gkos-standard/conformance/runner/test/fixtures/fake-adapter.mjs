export const implementation = {
  name: "runner-honesty-test-adapter",
  version: "0.0.0-test",
};

export function project(_content, path) {
  const diagnostics = [];
  if (path.includes("gcp1-n01")) {
    diagnostics.push(
      { code: "GKX-SCHEMA-004", severity: "error" },
      { code: "GKX-SCHEMA-004", severity: "error" },
      { code: "GKX-SCHEMA-004", severity: "error" },
    );
  }
  if (path.includes("gcp1-n02")) diagnostics.push({ code: "GKX-EPISTEMIC-002", severity: "error" });
  if (path.includes("gcp1-n03")) diagnostics.push({ code: "GKX-TEMPORAL-001", severity: "error" });
  if (path.includes("gcp1-b01")) diagnostics.push({ code: "GKX-SENSITIVITY-001", severity: "warning" });
  if (path.includes("gcp3-l02")) diagnostics.push({ code: "GKX-EPISTEMIC-004", severity: "warning" });
  return { diagnostics, effective: { sensitivity: "secret", epistemicState: "unknown" } };
}
