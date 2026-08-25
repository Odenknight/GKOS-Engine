import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { resolveAgentNotePath } from "gkos-engine/navigation-effects";

const grant = {
  agentId: "018f22c8-4b63-7a12-9f45-8d91c734beef",
  displayName: "Scale Fixture",
  credentialId: "credential:scale",
  allowedRoot: "_kosmos/agent-notes/scale",
  capabilities: ["note:create"],
  sensitivityCeiling: "internal",
  maxNoteBytes: 1048576,
  maxWritesPerMinute: 100000,
  enabled: true,
  policyRef: { id: "scale-policy", version: "1", digest: `sha256:${"a".repeat(64)}` },
};

for (const size of [100, 2_000, 10_000, 50_000]) test(`path/grant scale fixture records ${size.toLocaleString("en-US")} validations without a latency claim`, (t) => {
  const started = performance.now();
  let accepted = 0;
  for (let index = 0; index < size; index += 1) {
    const result = resolveAgentNotePath({ grant, capability: "note:create", noteName: `batch/note-${String(index).padStart(5, "0")}.md`, at: "2026-08-20T12:00:00Z" });
    if (result.valid) accepted += 1;
  }
  const elapsedMs = performance.now() - started;
  assert.equal(accepted, size);
  t.diagnostic(JSON.stringify({ fixture: "agent-path-validation", size, elapsedMs: Number(elapsedMs.toFixed(3)), unsupportedPerformanceClaim: false }));
});
