import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryEffectAdapter,
  canonicalMocArchiveRunPath,
  extractNavigationCandidateBody,
  mergeGeneratedMocRegion,
  parseGeneratedMocRegion,
  planMocApply,
  renderGeneratedMocRegion,
  resolveAgentNotePath,
  validateAgentGrant,
  validateVaultRelativePath,
} from "gkos-engine/navigation-effects";
import { sha256Bytes } from "../dist/gkos-engine.mjs";

const H = {
  config: `sha256:${"a".repeat(64)}`,
  policy: `sha256:${"b".repeat(64)}`,
  corpus: `sha256:${"c".repeat(64)}`,
  source: `sha256:${"d".repeat(64)}`,
};

function candidate(targetPath = "topics/index.md") {
  const candidateBytes = "# Topics\n\n<!-- gkos-navigation:managed:start -->\n- [[topics/A|A]]\n<!-- gkos-navigation:managed:end -->\n";
  return {
    artifactKind: "engine.moc-candidate",
    candidateId: "moc-candidate:test",
    directory: "topics",
    targetPath,
    candidateBytes,
    digest: "unused-by-planner",
    sourceSnapshotDigest: H.source,
    configRef: { id: "nav-config", version: 1, digest: H.config },
    policy: { id: "effects-policy", version: "1", digest: H.policy },
    sourceRefs: [],
  };
}

function authority(root = "topics") {
  return {
    actor: { actorId: "human:oden", actorType: "human", displayName: "Oden" },
    grantId: "grant:moc",
    allowedRoot: root,
    capability: "moc:apply",
    sensitivityCeiling: "secret",
    policyRef: { id: "effects-policy", version: "1", digest: H.policy },
  };
}

async function regionBinding(currentBytes) {
  const parsed = await parseGeneratedMocRegion(currentBytes);
  assert.equal(parsed.ok, true);
  return {
    targetPath: "topics/index.md",
    ownership: "region-managed",
    adoptedDigest: await sha256Bytes(currentBytes),
    generatedRegion: parsed.region,
    adoptedBy: { actorId: "human:oden", actorType: "human" },
    adoptedAt: "2026-08-20T12:00:00Z",
    adoptionReceiptId: "receipt:adoption",
  };
}

test("region parser and renderer are exact and reject malformed nesting", async () => {
  const rendered = renderGeneratedMocRegion("- [[A]]", H.config);
  const bytes = `Human prefix\r\n${rendered}\r\nHuman suffix\r\n`;
  const parsed = await parseGeneratedMocRegion(bytes);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.prefix, "Human prefix\r\n");
  assert.equal(parsed.body, "- [[A]]");
  assert.equal(parsed.suffix, "\r\nHuman suffix\r\n");
  assert.equal(parsed.region.configDigest, H.config);

  const nested = `${rendered}\n${rendered}`;
  assert.deepEqual(await parseGeneratedMocRegion(nested), { ok: false, reasonCodes: ["MARKER_DUPLICATED"] });
});

test("region merge preserves surrounding human bytes exactly", async () => {
  const current = `# Human title\r\n\r\n${renderGeneratedMocRegion("old", H.config)}\r\n\r\nHuman footer\r\n`;
  const parsed = await parseGeneratedMocRegion(current);
  assert.equal(parsed.ok, true);
  const merged = await mergeGeneratedMocRegion({ currentBytes: current, generatedBody: "new\nbody", currentBinding: parsed.region, nextConfigDigest: H.config });
  assert.equal(merged.ok, true);
  assert.equal(merged.prefix, "# Human title\r\n\r\n");
  assert.equal(merged.suffix, "\r\n\r\nHuman footer\r\n");
  assert.equal(merged.bytes, merged.prefix + renderGeneratedMocRegion("new\nbody", H.config) + merged.suffix);
});

test("same managed MOC inputs produce identical plans and proposed bytes", async () => {
  const current = `Human\r\n${renderGeneratedMocRegion("old", H.config)}\r\nTail`;
  const input = {
    candidate: candidate(), currentBytes: current, ownership: await regionBinding(current),
    vaultId: "vault:test", corpusDigest: H.corpus,
    policyRef: { id: "effects-policy", version: "1", digest: H.policy },
    authority: authority(), authorityEvaluatedAt: "2026-08-20T12:00:00Z", archiveDate: "2026-08-20", runId: "run-001",
  };
  const first = await planMocApply(input);
  const second = await planMocApply(structuredClone(input));
  assert.deepEqual(second, first);
  assert.equal(first.status, "planned");
  assert.equal(first.plan.operation, "moc:replace");
  assert.equal(first.plan.archiveRunPath, "_archive/moc-runs/2026-08-20/run-001");
  assert.equal(first.preservedHumanPrefix, "Human\r\n");
  assert.equal(first.preservedHumanSuffix, "\r\nTail");
  assert.equal(await sha256Bytes(first.proposedBytes), first.plan.proposedDigest);
  assert.equal(extractNavigationCandidateBody(candidate().candidateBytes), "- [[topics/A|A]]");
});

test("planner fails closed for unmanaged, stale adoption, moved markers, and policy mismatch", async () => {
  const current = renderGeneratedMocRegion("old", H.config);
  const binding = await regionBinding(current);
  const base = {
    candidate: candidate(), currentBytes: current, ownership: binding,
    vaultId: "vault:test", corpusDigest: H.corpus,
    policyRef: { id: "effects-policy", version: "1", digest: H.policy },
    authority: authority(), authorityEvaluatedAt: "2026-08-20T12:00:00Z", archiveDate: "2026-08-20", runId: "run-001",
  };
  assert.equal((await planMocApply({ ...base, ownership: { targetPath: "topics/index.md", ownership: "unmanaged" } })).status, "denied");
  assert.equal((await planMocApply({ ...base, authority: authority("other") })).status, "denied");
  const expired = await planMocApply({ ...base, authority: { ...authority(), expiresAt: "2026-08-20T11:59:59Z" } });
  assert.equal(expired.status, "denied");
  assert.deepEqual(expired.reasonCodes, ["AUTHORITY_EXPIRED"]);
  assert.equal((await planMocApply({ ...base, policyRef: { ...base.policyRef, digest: H.corpus } })).status, "denied");
  const edited = current.replace("old", "human edit");
  const changed = await planMocApply({ ...base, currentBytes: edited });
  assert.equal(changed.status, "review-required");
  assert.deepEqual(changed.reasonCodes, ["GENERATED_REGION_CHANGED"]);
});

test("fully managed create requires explicit creation authorization", async () => {
  const base = {
    candidate: candidate(), currentBytes: null,
    vaultId: "vault:test", corpusDigest: H.corpus,
    policyRef: { id: "effects-policy", version: "1", digest: H.policy },
    authority: authority(), authorityEvaluatedAt: "2026-08-20T12:00:00Z", archiveDate: "2026-08-20", runId: "run-create",
  };
  const denied = await planMocApply({ ...base, ownership: { targetPath: "topics/index.md", ownership: "fully-managed" } });
  assert.equal(denied.status, "denied");
  const planned = await planMocApply({ ...base, ownership: { targetPath: "topics/index.md", ownership: "fully-managed", creationAuthorized: true } });
  assert.equal(planned.status, "planned");
  assert.equal(planned.plan.operation, "moc:create");
});

test("path and agent grant validation rejects traversal, absolute, device, expiry, and collisions", () => {
  for (const value of ["../x.md", "%2e%2e%2fprivate.md", "C:\\x.md", "\\\\server\\x.md", "/x.md", "con.md", "x. "]) assert.equal(validateVaultRelativePath(value).valid, false, value);
  const grant = {
    agentId: "018f22c8-4b63-7a12-9f45-8d91c734beef",
    displayName: "Atlas", credentialId: "credential:atlas", allowedRoot: "_kosmos/agent-notes/atlas",
    capabilities: ["note:create", "note:update"], sensitivityCeiling: "internal",
    maxNoteBytes: 1000, maxWritesPerMinute: 10, enabled: true,
    policyRef: { id: "agent-policy", version: "1", digest: H.policy },
    expiresAt: "2026-08-21T00:00:00Z",
  };
  assert.deepEqual(validateAgentGrant(grant, "2026-08-20T12:00:00Z"), []);
  assert.deepEqual(resolveAgentNotePath({ grant, capability: "note:create", noteName: "daily.md", at: "2026-08-20T12:00:00Z" }), { valid: true, normalized: "_kosmos/agent-notes/atlas/daily.md", reasonCodes: [] });
  assert.equal(resolveAgentNotePath({ grant, capability: "note:archive", noteName: "daily.md", at: "2026-08-20T12:00:00Z" }).valid, false);
  assert.equal(resolveAgentNotePath({ grant, capability: "note:create", noteName: "../other/private.md", at: "2026-08-20T12:00:00Z" }).valid, false);
  assert.deepEqual(validateAgentGrant(grant, "2026-08-22T00:00:00Z"), ["GRANT_EXPIRED"]);
  assert.deepEqual(validateAgentGrant({ ...grant, expiresAt: "not-a-date" }, "2026-08-20T12:00:00Z"), ["GRANT_EXPIRY_INVALID"]);
  assert.deepEqual(validateAgentGrant(grant, "not-a-date"), ["GRANT_EVALUATION_TIME_INVALID"]);
  assert.deepEqual(validateAgentGrant(grant), ["GRANT_EVALUATION_TIME_REQUIRED"]);
  assert.deepEqual(resolveAgentNotePath({ grant, capability: "note:create", noteName: "daily.md" }).reasonCodes, ["GRANT_EVALUATION_TIME_REQUIRED"]);
  assert.deepEqual(validateAgentGrant({ ...grant, expiresAt: "2026-02-30T12:00:00Z" }, "2026-02-20T12:00:00Z"), ["GRANT_EXPIRY_INVALID"]);
  assert.deepEqual(validateAgentGrant({ ...grant, expiresAt: "2026-08-21" }, "2026-08-20T12:00:00Z"), ["GRANT_EXPIRY_INVALID"]);
  assert.deepEqual(validateAgentGrant(grant, "2026-08-20"), ["GRANT_EVALUATION_TIME_INVALID"]);
  assert.deepEqual(resolveAgentNotePath({ grant, capability: "note:create", noteName: "Daily.md", at: "2026-08-20T12:00:00Z", existingPaths: ["_kosmos/agent-notes/atlas/daily.md"] }).reasonCodes, ["PATH_CASE_OR_UNICODE_COLLISION"]);
});

test("archive paths are canonical and unsafe run IDs are rejected", () => {
  assert.equal(canonicalMocArchiveRunPath("2026-08-20", "run.001-a"), "_archive/moc-runs/2026-08-20/run.001-a");
  assert.throws(() => canonicalMocArchiveRunPath("2026-8-20", "run"));
  for (const impossible of ["2026-02-29", "2026-02-30", "2026-02-31"]) {
    assert.throws(() => canonicalMocArchiveRunPath(impossible, "run"), /real calendar date/);
  }
  assert.throws(() => canonicalMocArchiveRunPath("2026-08-20", "../run"));
  for (const reserved of ["con", "con.txt", "run."]) assert.throws(() => canonicalMocArchiveRunPath("2026-08-20", reserved));
});

test("in-memory adapter is deterministic and injects bounded faults", async () => {
  const adapter = new InMemoryEffectAdapter([{ path: "a.md", bytes: "before" }]);
  await adapter.archive("archive/a.md", "before");
  await adapter.writeTemporary(".tmp", "after");
  await adapter.replace(".tmp", "a.md");
  assert.equal(await adapter.verify("a.md", await sha256Bytes("after")), true);
  adapter.injectFault("verify");
  await assert.rejects(adapter.verify("a.md", await sha256Bytes("after")), /INJECTED_FAULT:verify/);
  assert.equal(await adapter.verify("a.md", await sha256Bytes("after")), true);
  assert.deepEqual(adapter.snapshot().files, [{ path: "a.md", bytes: "after" }]);
});
