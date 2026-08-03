import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTELLIGENCE_CONTRACT_VERSION,
  validateIntelligenceProposal,
  validateIntelligenceResponse,
} from "../dist/kosmos-core.mjs";

function proposal(overrides = {}) {
  return {
    contractVersion: INTELLIGENCE_CONTRACT_VERSION,
    proposalId: "proposal:test-001",
    proposalType: "classification_raise",
    targetId: "note:alpha",
    proposedPatch: { sensitivity: "regulated" },
    rationale: "The note contains regulated financial identifiers.",
    confidence: 0.9,
    evidenceRefs: ["note:alpha#account"],
    generator: { system: "gkos-intelligence", programVersion: "1.0.0", model: "test" },
    ...overrides,
  };
}

test("accepts a raise-only classification proposal", () => {
  const result = validateIntelligenceProposal(proposal(), {
    targetId: "note:alpha",
    effectiveSensitivity: "confidential",
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.diagnostics, []);
});

test("rejects sensitivity lowering", () => {
  const result = validateIntelligenceProposal(
    proposal({ proposedPatch: { sensitivity: "public" } }),
    { targetId: "note:alpha", effectiveSensitivity: "secret" },
  );
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((d) => d.code === "GKOS-INTELLIGENCE-014"));
});

test("metadata repair cannot bypass raise-only sensitivity", () => {
  const result = validateIntelligenceProposal(
    proposal({
      proposalType: "metadata_repair",
      proposedPatch: { sensitivity: "internal" },
    }),
    { targetId: "note:alpha", effectiveSensitivity: "regulated" },
  );
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((d) => d.code === "GKOS-INTELLIGENCE-014"));
});

test("rejects authoritative and out-of-scope patch fields", () => {
  const result = validateIntelligenceProposal(
    proposal({
      proposalType: "metadata_repair",
      proposedPatch: { approved: true, title: "Candidate title" },
    }),
    { targetId: "note:alpha" },
  );
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((d) => d.code === "GKOS-INTELLIGENCE-011"));
});

test("response validation drops unsafe proposals", () => {
  const request = {
    contractVersion: INTELLIGENCE_CONTRACT_VERSION,
    requestId: "request:test-001",
    task: "classification_raise",
    targetId: "note:alpha",
    effectiveSensitivity: "secret",
  };
  const response = {
    contractVersion: INTELLIGENCE_CONTRACT_VERSION,
    requestId: request.requestId,
    proposals: [
      proposal({ proposedPatch: { sensitivity: "public" } }),
      proposal({ proposalId: "proposal:test-002", proposedPatch: { sensitivity: "secret" } }),
    ],
  };
  const result = validateIntelligenceResponse(response, request);
  assert.equal(result.valid, false);
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].proposalId, "proposal:test-002");
});


test("response accepts proposal matching the requested task", () => {
  const request = {
    contractVersion: INTELLIGENCE_CONTRACT_VERSION,
    requestId: "request:test-match",
    task: "classification_raise",
    targetId: "note:alpha",
    effectiveSensitivity: "confidential",
  };
  const result = validateIntelligenceResponse({
    contractVersion: INTELLIGENCE_CONTRACT_VERSION,
    requestId: request.requestId,
    proposals: [proposal()],
  }, request);
  assert.equal(result.valid, true);
  assert.equal(result.proposals.length, 1);
});

test("response rejects a safe proposal type not authorized by the requested task", () => {
  const request = {
    contractVersion: INTELLIGENCE_CONTRACT_VERSION,
    requestId: "request:test-mismatch",
    task: "diagnostic_explanation",
    targetId: "note:alpha",
  };
  const result = validateIntelligenceResponse({
    contractVersion: INTELLIGENCE_CONTRACT_VERSION,
    requestId: request.requestId,
    proposals: [proposal({ proposalType: "metadata_repair", proposedPatch: { title: "Candidate" } })],
  }, request);
  assert.equal(result.valid, false);
  assert.equal(result.proposals.length, 0);
  assert.ok(result.diagnostics.some((d) => d.code === "GKOS-INTELLIGENCE-021"));
});
