import test from "node:test";
import assert from "node:assert/strict";

import {
  GkosServiceDeniedError,
  buildAuthorizedView,
} from "../dist/service.mjs";

const AT = "2026-08-26T12:00:00.000Z";
const CANARY = "TOPSECRET-CANARY-9f6e";

const stats = {
  indexedAt: AT, durationMs: 33, files: 3, folders: 2, unresolved: 0,
  links: 5, wikilinks: 1, markdownLinks: 0, propertyLinks: 0, orphans: 0,
};

function node(id, path, label, sensitivity, extra = {}) {
  return {
    id, kind: "file", path, label, area: path.split("/")[0], depth: 1,
    tags: [], aliases: [], color: "#123456", outgoing: 0, incoming: 0,
    type: "note", content: extra.content,
    gkx: {
      uid: extra.uid ?? `${id}-uid`, type: "note", title: label,
      sensitivity, supersedes: [], supersededBy: [], forkedFrom: [], forkedTo: [], related: [], relations: {},
    },
  };
}

function fixtureGraph() {
  return {
    nodes: [
      { id: "folder-visible", kind: "folder", path: "Visible", label: "Visible", area: "Visible", depth: 0, tags: [], aliases: [], color: "#111111", outgoing: 2, incoming: 0 },
      { id: "folder-secret", kind: "folder", path: "Secrets", label: "Secrets", area: "Secrets", depth: 0, tags: [], aliases: [], color: "#111111", outgoing: 1, incoming: 0 },
      node("public", "Visible/Public.md", "Public", "public"),
      node("internal", "Visible/Internal.md", "Internal", "internal"),
      node("secret", `Secrets/${CANARY}.md`, CANARY, "secret", { uid: `${CANARY}-uid`, content: `body-${CANARY}` }),
    ],
    links: [
      { id: "contains-public", source: "folder-visible", target: "public", kind: "contains" },
      { id: "contains-internal", source: "folder-visible", target: "internal", kind: "contains" },
      { id: "contains-secret", source: "folder-secret", target: "secret", kind: "contains" },
      { id: "internal-public", source: "internal", target: "public", kind: "wikilink", sourcePath: `Secrets/${CANARY}.md` },
      { id: "public-secret", source: "public", target: "secret", kind: "semantic", label: CANARY },
    ],
    stats,
    areas: ["Secrets", "Visible"], tags: [], statuses: [], types: ["note"],
    diagnostics: { notes: 3, folders: 2, attachments: 4, unresolvedLinks: 0, ambiguousLinks: 0, lineageEdges: 0, lineageCycles: 0, lineageWarnings: [CANARY], residualCollisions: 0 },
  };
}

const identity = {
  credentialId: "gkc1_fixture",
  agentId: "agent-alpha",
  agentLabel: "Alpha",
  sensitivityCeiling: "internal",
  capabilities: ["graph.read"],
  revoked: false,
};

function build(overrides = {}) {
  return buildAuthorizedView({
    identity,
    sensitivityCeiling: "internal",
    corpus: { graph: fixtureGraph(), attachments: [`Secrets/${CANARY}.bin`] },
    authorization: { configured: true, generation: 7, policyDigest: `sha256:${"a".repeat(64)}` },
    operation: "graph",
    evaluationTime: AT,
    vaultName: "fixture",
    ...overrides,
  });
}

test("authorized view removes hidden nodes, endpoints, attachments, diagnostics, and counts", () => {
  const view = build();
  const bytes = JSON.stringify(view);
  assert.equal(bytes.includes(CANARY), false);
  assert.deepEqual(view.notes.map((item) => item.path), ["Visible/Internal.md", "Visible/Public.md"]);
  assert.deepEqual(view.graph.nodes.map((item) => item.id), ["folder-visible", "internal", "public"]);
  assert.deepEqual(view.graph.links.map((item) => item.id), ["contains-internal", "contains-public", "internal-public"]);
  assert.equal("sourcePath" in view.graph.links.find((item) => item.id === "internal-public"), false);
  assert.equal(view.graph.diagnostics.attachments, 0);
  assert.deepEqual(view.visible_counts, { notes: 2, folders: 1, links: 3, episodes: 2 });
  assert.equal(view.graphiti_episodes.some((episode) => episode.name === CANARY), false);
});

test("visible links with invalid identifiers, kinds, or labels fail closed", () => {
  for (const mutation of [
    (link) => { link.id = 7; },
    (link) => { link.id = "bad\nlink"; },
    (link) => { link.kind = "unknown"; },
    (link) => { link.label = "bad\0label"; },
  ]) {
    const graph = fixtureGraph();
    mutation(graph.links.find((item) => item.id === "internal-public"));
    assert.throws(() => build({ corpus: { graph } }), GkosServiceDeniedError);
  }
});

test("encoded and nonportable visible paths fail closed", () => {
  for (const path of ["Visible/%2e%2e/secret.md", "Visible/%ZZ.md", "Visible/CON.md", "Visible/trailing. "]) {
    const graph = fixtureGraph();
    graph.nodes.find((item) => item.id === "internal").path = path;
    assert.throws(() => build({ corpus: { graph } }), GkosServiceDeniedError);
  }
});

test("authorized view is byte deterministic for fixed state and evaluation time", () => {
  assert.equal(JSON.stringify(build()), JSON.stringify(build()));
});

test("invalid, revoked, mismatched, and unauthorized credentials fail with one governed denial", () => {
  for (const changed of [
    { identity: null },
    { identity: { ...identity, revoked: true } },
    { sensitivityCeiling: "public" },
    { identity: { ...identity, capabilities: [] } },
    { authorization: { configured: false, generation: null, policyDigest: null } },
    { authorization: { configured: true, generation: 7, policyDigest: `sha256:${"z".repeat(64)}` } },
    { evaluationTime: "not-a-time" },
  ]) {
    assert.throws(() => build(changed), (error) => {
      assert.ok(error instanceof GkosServiceDeniedError);
      assert.equal(error.message, "GKOS_SERVICE_ACCESS_DENIED");
      assert.equal(JSON.stringify(error).includes(CANARY), false);
      return true;
    });
  }
});

test("missing or invalid note sensitivity fails closed to secret", () => {
  const graph = fixtureGraph();
  graph.nodes.find((item) => item.id === "public").gkx.sensitivity = "invalid";
  graph.nodes.find((item) => item.id === "internal").gkx.sensitivity = undefined;
  const view = build({ corpus: { graph } });
  assert.equal(view.notes.length, 0);
  assert.equal(view.graph.nodes.length, 0);
});

test("untrusted visible-record evidence cannot serialize arbitrary canary identifiers", () => {
  const graph = fixtureGraph();
  graph.nodes.find((item) => item.id === "internal").gkx.projection = {
    contentHash: CANARY,
    effective: { sensitivity: "internal" },
    diagnostics: [{ code: CANARY, severity: "warning" }],
    assessment: {
      scores: { structural_completeness: 0.5, [CANARY]: 1 },
      exclusions: [CANARY],
      diagnostics: [{ code: CANARY }],
    },
  };
  const view = build({ corpus: { graph } });
  assert.equal(JSON.stringify(view).includes(CANARY), false);
  const evidence = view.record_evidence.find((item) => item.node_id === "internal");
  assert.equal(evidence.content_digest, null);
  assert.deepEqual(evidence.diagnostic_codes, []);
  assert.deepEqual(evidence.assessment.exclusions, []);
  assert.deepEqual(evidence.assessment.diagnostic_codes, []);
  assert.deepEqual(Object.keys(evidence.assessment.scores), [
    "structural_completeness", "provenance_quality", "evidence_support", "relationship_integrity",
    "temporal_freshness", "contradiction_status", "review_readiness", "overall",
  ]);
});
