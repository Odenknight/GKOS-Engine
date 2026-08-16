import assert from "node:assert/strict";
import test from "node:test";

import {
  auditNavigation,
  buildVaultNavigationConfig,
  compileNavigationContext,
  diffNavigation,
  discoverNavigation,
  evaluateSupersession,
  generateNavigationCandidates,
} from "../dist/navigation.mjs";

const human = { id: "human:reader", class: "human" };
const agent = { id: "agent:nav", class: "agent", contractRef: "contract:nav" };

async function config() {
  return buildVaultNavigationConfig({
    configId: "018f0000-0000-7000-8000-000000000301",
    version: 1,
    vaultId: "vault:determinism",
    promotedMocNames: [],
    createdAt: "2026-08-15T00:00:00Z",
    createdBy: "human:owner",
    policy: { id: "policy:navigation", version: "1" },
  });
}

test("all deterministic Navigation outputs are byte-identical under reordered enumeration", async () => {
  const cfg = await config();
  const sources = [
    { relativePath: "z/B.md", content: "B [[A]]", stableId: "id:b", sensitivity: "public", relationships: [{ kind: "related_to", targetStableId: "id:a" }] },
    { relativePath: "z/A.md", content: "A", stableId: "id:a", sensitivity: "public" },
    { relativePath: "z/overview.md", content: "[[A]] [[B]]", stableId: "id:o", sensitivity: "internal" },
  ];
  const a = { vaultId: "vault:determinism", sources, directories: ["z"] };
  const b = { vaultId: "vault:determinism", sources: [...sources].reverse(), directories: ["z"] };
  assert.deepEqual(discoverNavigation(a, cfg), discoverNavigation(b, cfg));
  assert.deepEqual(await generateNavigationCandidates(a, cfg), await generateNavigationCandidates(b, cfg));
  assert.deepEqual(await auditNavigation(a, cfg), await auditNavigation(b, cfg));
  assert.deepEqual(await diffNavigation(a, { ...a, sources: sources.map((source) => ({ ...source })) }), await diffNavigation(b, { ...b, sources: [...sources].reverse() }));
  const request = { recipient: human, purpose: "determinism", itemBudget: 10, tokenBudget: 10000, generationPolicy: { id: "context", version: "1" } };
  const policy = { id: "discover", version: "1", canDiscover: ({ object }) => object.sensitivity === "public" ? "allow" : "deny" };
  assert.equal((await compileNavigationContext(a, request, policy)).canonicalBytes, (await compileNavigationContext(b, request, policy)).canonicalBytes);

  const proposal = { operationId: "018f0000-0000-7000-8000-000000000302", explicitDeclaration: true, actor: agent, vaultId: "vault:determinism", objectClass: "note", predecessor: { id: "old", version: "1", digest: "sha256:old" }, successor: { id: "new", version: "1", digest: "sha256:new" } };
  const grant = { delegationId: "grant:d", version: 1, issuer: { id: "human:owner", class: "human" }, subject: agent, actorContractRef: "contract:nav", provenanceRef: "grant-source", operation: "lineage.supersession.record", vaultScope: "vault:determinism", objectClassScope: ["note"], issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-12-31T00:00:00Z", majorPredicate: { id: "predicate", version: "1" }, reviewPolicy: { id: "review", version: "1", dueWithinSeconds: 60 }, revocationRef: "revocations", originatingAuthority: { authorityRef: "authority", operation: "lineage.supersession.record", vaultScope: "vault:determinism", objectClassScope: ["note"], expiresAt: "2027-01-01T00:00:00Z" } };
  const predicate = { id: "predicate", version: "1", evaluate: () => "routine" };
  const options = { at: "2026-06-01T00:00:00Z", receipt: { receiptId: "018f0000-0000-7000-8000-000000000303", occurredAt: "2026-06-01T00:00:00Z" }, review: { reviewId: "018f0000-0000-7000-8000-000000000304", queuedAt: "2026-06-01T00:00:00Z" } };
  assert.deepEqual(evaluateSupersession(proposal, grant, predicate, options), evaluateSupersession({ ...proposal }, { ...grant, objectClassScope: [...grant.objectClassScope] }, predicate, { ...options }));
});
