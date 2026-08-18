import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  CANONICAL_MOC_NAMES,
  InMemoryGovernanceStore,
  NAVIGATION_CAPABILITIES,
  acceptMocNamePromotion,
  applyNavigationIndexChanges,
  auditNavigation,
  buildGovernedRecord,
  buildMocRunManifest,
  buildVaultNavigationConfig,
  classifyNavigation,
  compileNavigationContext,
  createNavigationIndex,
  diffNavigation,
  diffNavigationArtifact,
  discoverNavigation,
  evaluateRetentionHold,
  evaluateSupersession,
  generateNavigationCandidates,
  getNavigationCapabilities,
  inferSupersession,
  planMocNamePromotion,
  planReentry,
  shouldIgnoreNavigationArchivePath,
} from "../dist/gkos-engine.mjs";

const ID = {
  config1: "018f0000-0000-7000-8000-000000000101",
  config2: "018f0000-0000-7000-8000-000000000102",
  proposal: "018f0000-0000-7000-8000-000000000103",
  promotionOp: "018f0000-0000-7000-8000-000000000104",
  promotionReceipt: "018f0000-0000-7000-8000-000000000105",
  run1: "018f0000-0000-7000-8000-000000000106",
  run2: "018f0000-0000-7000-8000-000000000107",
  supersessionOp: "018f0000-0000-7000-8000-000000000108",
  supersessionReceipt: "018f0000-0000-7000-8000-000000000109",
  review: "018f0000-0000-7000-8000-00000000010a",
  exceptionReceipt: "018f0000-0000-7000-8000-00000000010b",
  exceptionOp: "018f0000-0000-7000-8000-00000000010c",
};
const POLICY = { id: "policy:navigation", version: "1", digest: "sha256:policy" };
const human = { id: "human:owner", class: "human" };
const agent = { id: "agent:navigator", class: "agent", contractRef: "contract:navigator:1" };

const source = (relativePath, content = "", stableId, extra = {}) => ({ relativePath, content, ...(stableId ? { stableId } : {}), ...extra });
const snapshot = (sources, directories = []) => ({ vaultId: "vault:test", sources, directories });

async function config(promotedMocNames = [], version = 1, priorConfigDigest) {
  return buildVaultNavigationConfig({
    configId: version === 1 ? ID.config1 : ID.config2,
    version,
    vaultId: "vault:test",
    promotedMocNames,
    createdAt: version === 1 ? "2026-08-15T00:00:00Z" : "2026-08-15T01:00:00Z",
    createdBy: "human:owner",
    ...(priorConfigDigest ? { priorConfigDigest } : {}),
    policy: POLICY,
  });
}

test("archive-ignore excludes exactly _archive/moc-runs/** across separators", () => {
  for (const path of ["_archive/moc-runs", "_archive/moc-runs/run.json", "_archive\\moc-runs\\x\\candidate.md", "./_archive/moc-runs/a"]) assert.equal(shouldIgnoreNavigationArchivePath(path), true, path);
  for (const path of ["_archive", "_archive/index.md", "_archive/history/moc-runs/a", "moc-runs/index.md", "x/_archive/moc-runs/a", "_archive/moc-runs-old/a", "_archiveX/moc-runs/a"]) assert.equal(shouldIgnoreNavigationArchivePath(path), false, path);
});

test("canonical five are exact; case anomalies and old heuristic names are flags, not aliases", async () => {
  assert.deepEqual(CANONICAL_MOC_NAMES, ["index", "_index", "readme", "moc", "contents"]);
  const cfg = await config();
  const discovery = discoverNavigation(snapshot([
    source("a/INDEX.md"), source("a/ index.md"), source("b/readme.txt"), source("_archive/index.md"), source("_archive/moc-runs/ignored.md"),
    ...["home", "map", "overview", "dashboard", "start", "toc"].map((name) => source(`flags/${name}.md`)),
  ]), cfg);
  assert.equal(discovery.entries.find((entry) => entry.path === "a/INDEX.md").recognizedMocName, true);
  assert.ok(discovery.findings.some((finding) => finding.code === "MOC_NAME_CASE_ANOMALY"));
  assert.equal(discovery.entries.find((entry) => entry.path === "a/ index.md").recognizedMocName, false);
  assert.ok(discovery.findings.some((finding) => finding.path === "a/ index.md" && finding.code === "MOC_NAME_NORMALIZATION_ANOMALY"));
  assert.equal(discovery.entries.find((entry) => entry.path === "b/readme.txt").recognizedMocName, false);
  assert.equal(discovery.entries.some((entry) => entry.path === "_archive/index.md"), true);
  assert.equal(discovery.entries.some((entry) => entry.path.includes("_archive/moc-runs")), false);
  for (const name of ["home", "map", "overview", "dashboard", "start", "toc"]) {
    const entry = discovery.entries.find((candidate) => candidate.basename === name);
    assert.equal(entry.nameStanding, "noncanonical-like");
    assert.equal(entry.recognizedMocName, false);
  }
});

test("classification and management always carry deterministic reason evidence", async () => {
  const cfg = await config();
  const entries = classifyNavigation(snapshot([
    source("directory/index.md", "<!-- gkos-navigation:managed:start -->\n- [[A]]\n<!-- gkos-navigation:managed:end -->"),
    source("semantic/map-note.md", "[[A]] [[B]]"),
    source("ops/runbook.md", "---\ntype: operational\n---\nsteps"),
    source("bad/moc.md", "<!-- gkos-navigation:managed:start -->\nbroken"),
  ]), cfg);
  assert.equal(entries.find((entry) => entry.path === "directory/index.md").classification, "directory");
  assert.equal(entries.find((entry) => entry.path === "directory/index.md").management, "managed");
  assert.equal(entries.find((entry) => entry.path === "semantic/map-note.md").classification, "semantic");
  assert.equal(entries.find((entry) => entry.path === "ops/runbook.md").classification, "operational");
  for (const entry of entries) assert.ok(entry.evidence.length >= 3);
  const findings = discoverNavigation(snapshot([source("bad/moc.md", "<!-- gkos-navigation:managed:start -->\nbroken")]), cfg).findings;
  assert.ok(findings.some((finding) => finding.code === "MOC_MANAGED_MARKERS_AMBIGUOUS"));
});

test("promoted names have canonical downstream parity and promotion is versioned/receipted", async () => {
  const base = await config();
  const proposal = planMocNamePromotion({
    proposalId: ID.proposal,
    operationId: ID.promotionOp,
    vaultId: "vault:test",
    observedName: "Guide",
    observedPaths: ["topic/Guide.md"],
    proposedBy: agent,
    proposedAt: "2026-08-15T00:30:00Z",
  });
  assert.equal(proposal.requiresHumanAcceptance, true);
  await assert.rejects(acceptMocNamePromotion({ priorConfig: base, proposal, acceptedBy: agent, authorityRef: "authority:owner", nextConfigId: ID.config2, receiptId: ID.promotionReceipt, occurredAt: "2026-08-15T01:00:00Z" }), /human decision/i);
  const accepted = await acceptMocNamePromotion({ priorConfig: base, proposal, acceptedBy: human, authorityRef: "authority:owner", nextConfigId: ID.config2, receiptId: ID.promotionReceipt, occurredAt: "2026-08-15T01:00:00Z" });
  assert.equal(accepted.config.version, 2);
  assert.equal(accepted.config.priorConfigDigest, base.digest);
  assert.deepEqual(accepted.config.promotedMocNames, ["guide"]);
  assert.equal(accepted.receiptRole.outcome, "proposed");

  const canonicalSnapshot = snapshot([source("topic/index.md", "human header", "moc:id"), source("topic/A.md", "A", "a:id", { title: "A" })]);
  const promotedSnapshot = snapshot([source("topic/guide.md", "human header", "moc:id"), source("topic/A.md", "A", "a:id", { title: "A" })]);
  const canonicalEntry = discoverNavigation(canonicalSnapshot, base).entries.find((entry) => entry.stableId === "moc:id");
  const promotedEntry = discoverNavigation(promotedSnapshot, accepted.config).entries.find((entry) => entry.stableId === "moc:id");
  assert.deepEqual(
    { recognized: canonicalEntry.recognizedMocName, classification: canonicalEntry.classification, management: canonicalEntry.management },
    { recognized: promotedEntry.recognizedMocName, classification: promotedEntry.classification, management: promotedEntry.management },
  );
  const [canonicalGeneration, promotedGeneration] = await Promise.all([
    generateNavigationCandidates(canonicalSnapshot, base), generateNavigationCandidates(promotedSnapshot, accepted.config),
  ]);
  assert.equal(canonicalGeneration.candidates[0].candidateBytes, promotedGeneration.candidates[0].candidateBytes);

  const store = new InMemoryGovernanceStore();
  const record = buildGovernedRecord({ recordId: accepted.config.configId, recordType: "vault-navigation-config", payload: accepted.config, receiptRole: accepted.receiptRole });
  const committed = await store.append(record, { idempotencyKey: ID.promotionOp, expectedDigest: store.snapshot().digest });
  assert.equal(committed.committed, true);
  assert.equal((await store.verifyBinding(ID.promotionOp)).durable, true);
});

test("candidate bytes are SHA-256-bound and independent of run metadata", async () => {
  const cfg = await config();
  const inputA = snapshot([source("topic/B.md", "B", "b", { title: "B" }), source("topic/A.md", "A", "a", { title: "A" })], ["topic"]);
  const inputB = snapshot([...inputA.sources].reverse(), ["topic"]);
  const [a, b] = await Promise.all([generateNavigationCandidates(inputA, cfg), generateNavigationCandidates(inputB, cfg)]);
  assert.deepEqual(a, b);
  assert.equal(Object.isFrozen(a), true);
  assert.equal(Object.isFrozen(a.candidates), true);
  assert.equal(Object.isFrozen(a.candidates[0].sourceRefs), true);
  assert.throws(() => { a.candidates[0].targetPath = "mutated.md"; }, TypeError);
  for (const candidate of a.candidates) assert.match(candidate.digest, /^sha256:[0-9a-f]{64}$/);
  const manifestA = buildMocRunManifest({ generation: a, config: cfg, runId: ID.run1, startedAt: "2026-08-15T10:00:00Z", completedAt: "2026-08-15T10:00:01Z" });
  const manifestB = buildMocRunManifest({ generation: b, config: cfg, runId: ID.run2, startedAt: "2027-01-01T01:02:03Z", completedAt: "2027-01-01T01:02:05Z" });
  assert.deepEqual(a.candidates.map((candidate) => candidate.candidateBytes), b.candidates.map((candidate) => candidate.candidateBytes));
  for (const candidate of a.candidates) {
    assert.equal(candidate.candidateBytes.includes(manifestA.runId), false);
    assert.equal(candidate.candidateBytes.includes(manifestA.startedAt), false);
    assert.equal(candidate.candidateBytes.includes(manifestB.runId), false);
    assert.equal(candidate.candidateBytes.includes(manifestB.startedAt), false);
  }
  assert.equal(manifestA.gkosContextManifest, false);
});

test("dual diff preserves stable-ID moves and labels exact-content moves as observations", async () => {
  const stable = await diffNavigation(snapshot([source("old.md", "same", "id:1")]), snapshot([source("new.md", "same", "id:1")]));
  assert.equal(stable.items[0].reason, "MOVE_STABLE_ID");
  assert.equal(stable.items[0].identityEvidence, "stable-id");
  const exact = await diffNavigation(snapshot([source("old.md", "same")]), snapshot([source("new.md", "same")]));
  assert.equal(exact.items[0].reason, "MOVE_EXACT_CONTENT");
  assert.equal(exact.items[0].identityEvidence, "exact-content-observation");
  const similar = await diffNavigation(snapshot([source("old.md", "alpha")]), snapshot([source("new.md", "alpha-ish")]));
  assert.deepEqual(similar.items.map((item) => item.reason), ["ADDED", "REMOVED"]);
});

test("artifact diff reason-codes policy/config/managed/human/order changes", async () => {
  const cfg = await config();
  const generated = await generateNavigationCandidates(snapshot([source("A.md", "A", "a")]), cfg);
  const before = generated.candidates[0];
  const after = { ...before, candidateBytes: before.candidateBytes.replace("- [[A|A]]", "- [[B|B]]"), digest: "sha256:changed", policy: { id: "other", version: "2" }, configRef: { ...before.configRef, digest: "sha256:other" } };
  const reasons = (await diffNavigationArtifact(before, after)).items.map((item) => item.reason);
  assert.ok(reasons.includes("POLICY_CHANGED"));
  assert.ok(reasons.includes("CONFIG_CHANGED"));
  assert.ok(reasons.includes("MANAGED_REGION_CHANGED"));
});

test("context pack excludes Navigation archives before aggregation, fails closed, obeys budget, and cannot claim Layer 6", async () => {
  const input = snapshot([
    source("public.md", "public body", "public:id", { sensitivity: "public", relationships: [{ kind: "related_to", targetStableId: "secret:id" }] }),
    source("_archive/moc-runs/demo/planted.md", "ARCHIVED-LIVE-CONTEXT-BUG", "archive:id", { sensitivity: "public", title: "ARCHIVED-TITLE" }),
    source("SECRET-PATH.md", "SECRET-BODY", "secret:id", { sensitivity: "secret", title: "SECRET-TITLE" }),
    source("missing.md", "MISSING-SENSITIVITY", "missing:id"),
  ]);
  const request = { recipient: human, purpose: "read", itemBudget: 1, tokenBudget: 1000, generationPolicy: POLICY };
  const policy = { id: "discoverability", version: "1", canDiscover: ({ object }) => object.sensitivity === "public" ? "allow" : object.sensitivity === "secret" ? "indeterminate" : "deny" };
  const pack = await compileNavigationContext(input, request, policy);
  assert.equal(pack.artifact_kind, "engine.navigation-context-pack");
  assert.equal(pack.gkos_context_manifest, false);
  assert.equal(pack.entries.length, 1);
  assert.deepEqual(pack.entries[0].relationships, []);
  for (const marker of ["ARCHIVED-LIVE-CONTEXT-BUG", "ARCHIVED-TITLE", "archive:id", "SECRET-PATH", "SECRET-BODY", "SECRET-TITLE", "secret:id", "MISSING-SENSITIVITY", "missing:id"]) assert.equal(pack.canonicalBytes.includes(marker), false, marker);
  assert.equal(pack.omissions.length, 0); // denied existence is not represented as an omission
  assert.match(pack.digest, /^sha256:[0-9a-f]{64}$/);
  const reversed = await compileNavigationContext(snapshot([...input.sources].reverse()), request, policy);
  assert.equal(reversed.canonicalBytes, pack.canonicalBytes);
});

test("audit detects stale/digest/config/archive/manifest/context and discoverability failures deterministically", async () => {
  const cfg = await config();
  const input = snapshot([source("topic/index.md", "human", "moc"), source("topic/A.md", "LEAK", "a", { sensitivity: "secret" })]);
  const generation = await generateNavigationCandidates(input, cfg);
  const corrupt = { ...generation.candidates[0], sourceSnapshotDigest: "sha256:stale", digest: "sha256:bad", configRef: { ...generation.candidates[0].configRef, version: 99 } };
  const manifest = structuredClone(buildMocRunManifest({ generation, config: cfg, runId: ID.run1, startedAt: "2026-08-15T10:00:00Z", completedAt: "2026-08-15T10:00:01Z" }));
  manifest.candidateArtifacts[0].digest = "sha256:wrong";
  const policy = { id: "deny", version: "1", canDiscover: () => "deny" };
  const request = { recipient: human, purpose: "audit", itemBudget: 10, tokenBudget: 1000, generationPolicy: POLICY };
  const findings = await auditNavigation(input, cfg, {
    candidates: [corrupt], runManifest: manifest, liveGraphPaths: ["_archive/moc-runs/run/candidate.md"],
    discoverabilityProbe: { request, policy, forbiddenMarkers: ["LEAK"] },
  });
  const codes = findings.map((finding) => finding.code);
  for (const code of ["NAV_ARCHIVE_IN_LIVE_GRAPH", "NAV_CANDIDATE_STALE", "NAV_CANDIDATE_DIGEST_MISMATCH", "NAV_CANDIDATE_CONFIG_MISMATCH", "NAV_RUN_MANIFEST_CANDIDATE_MISMATCH"]) assert.ok(codes.includes(code), code);
  assert.deepEqual(findings, [...findings].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || a.message.localeCompare(b.message)));
});

test("re-entry always plans a distinct L1 source, preserves predecessor, and never infers supersession", async () => {
  const predecessor = { stableId: "old", version: "4", digest: "sha256:old" };
  const incoming = { bytes: "new bytes\r\n", sourceId: "new", sourceVersion: "1", path: "incoming.md", acquiredAt: "2026-08-15T12:00:00Z", acquiredBy: human, acquisitionMethod: "upload" };
  const planned = await planReentry(predecessor, incoming, { id: "reentry", version: "1" });
  assert.equal(planned.status, "planned");
  assert.equal(planned.sourceProposal.layer, "L1");
  assert.equal(planned.sourceProposal.inheritedStanding, false);
  assert.equal(planned.sourceProposal.bytes, incoming.bytes);
  assert.equal(planned.sourceProposal.digest, `sha256:${createHash("sha256").update(incoming.bytes, "utf8").digest("hex")}`);
  assert.equal(planned.predecessorMutation, false);
  assert.equal(planned.predecessorDisposition, null);
  assert.equal(planned.supersessionProposal, null);
  const rejected = await planReentry(predecessor, incoming, { id: "reentry", version: "1" }, { unsafeRequests: { mergeIntoPredecessor: true, mutatePredecessor: true, inheritStanding: true, inferSupersession: true, disposePredecessor: true } });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.sourceProposal, null);
  assert.equal(rejected.diagnostics.length, 5);
  assert.equal((await planReentry(predecessor, { ...incoming, acquiredAt: "2026-08-15 12:00:00" }, { id: "reentry", version: "1" })).status, "rejected");
  assert.throws(() => inferSupersession({ similarity: 1, rank: 1, time: 1, uuid: "x", lexical: "x" }), /explicit/i);
});

function grant(overrides = {}) {
  return {
    delegationId: "grant:1", version: 1, issuer: human, subject: agent, actorContractRef: "contract:navigator:1", provenanceRef: "grant-source:1",
    operation: "lineage.supersession.record", vaultScope: "vault:test", objectClassScope: ["note"], issuedAt: "2026-01-01T00:00:00Z",
    notBefore: "2026-01-01T00:00:00Z", expiresAt: "2026-12-31T00:00:00Z",
    majorPredicate: { id: "predicate:major", version: "1" }, reviewPolicy: { id: "review:policy", version: "1", dueWithinSeconds: 3600 }, revocationRef: "revocations:v1",
    originatingAuthority: { authorityRef: "authority:owner", operation: "lineage.supersession.record", vaultScope: "vault:test", objectClassScope: ["note", "report"], expiresAt: "2027-01-01T00:00:00Z" },
    ...overrides,
  };
}
function proposal(overrides = {}) {
  return { operationId: ID.supersessionOp, explicitDeclaration: true, actor: agent, vaultId: "vault:test", objectClass: "note", predecessor: { id: "old", version: "1", digest: "sha256:old" }, successor: { id: "new", version: "1", digest: "sha256:new" }, ...overrides };
}
const routine = { id: "predicate:major", version: "1", evaluate: () => "routine" };
const evaluationOptions = { at: "2026-06-01T00:00:00Z", receipt: { receiptId: ID.supersessionReceipt, occurredAt: "2026-06-01T00:00:00Z" }, review: { reviewId: ID.review, queuedAt: "2026-06-01T00:00:00Z" } };

test("bounded delegation is attenuated, expiring, exact-scope, receipted, and review-queued", () => {
  const ok = evaluateSupersession(proposal(), grant(), routine, evaluationOptions);
  assert.equal(ok.authorized, true);
  assert.equal(ok.effectiveDecision, "routine");
  assert.equal(ok.proposedReceipt.delegationRef, "grant:1");
  assert.equal(ok.proposedReceipt.predicate.id, "predicate:major");
  assert.equal(ok.proposedReceipt.predicate.version, "1");
  assert.equal(ok.deferredReview.status, "pending");
  assert.equal(ok.sourceContentWriteAuthorized, false);
  assert.equal(evaluateSupersession(proposal(), grant(), routine, { ...evaluationOptions, at: "2028-01-01T00:00:00Z" }).authorized, false);
  assert.equal(evaluateSupersession(proposal({ objectClass: "report" }), grant(), routine, evaluationOptions).authorized, false);
  assert.equal(evaluateSupersession(proposal({ actor: { id: "agent:other", class: "agent", contractRef: "contract:navigator:1" } }), grant(), routine, evaluationOptions).authorized, false);
  assert.equal(evaluateSupersession(proposal(), grant({ operation: "file.write" }), routine, evaluationOptions).authorized, false);
  assert.equal(evaluateSupersession(proposal(), grant(), null, evaluationOptions).effectiveDecision, "indeterminate");
  assert.equal(evaluateSupersession(proposal(), grant({ majorPredicate: { id: "predicate:major", version: "" } }), routine, evaluationOptions).authorized, false);
  const parent = grant({ delegationId: "parent", subject: { id: "agent:parent", class: "agent", contractRef: "contract:parent" }, actorContractRef: "contract:parent", objectClassScope: ["note"], expiresAt: "2026-10-01T00:00:00Z" });
  const widened = grant({ delegationId: "child", issuer: parent.subject, objectClassScope: ["note", "report"], expiresAt: "2026-11-01T00:00:00Z", parentGrant: parent });
  assert.equal(evaluateSupersession(proposal(), widened, routine, evaluationOptions).authorized, false);
});

test("checker API is escalation-only; major and indeterminate cannot become routine", () => {
  const major = { ...routine, evaluate: () => "major" };
  const indeterminate = { ...routine, evaluate: () => "indeterminate" };
  assert.equal(evaluateSupersession(proposal(), grant(), major, { ...evaluationOptions, checker: { escalateToMajor: false, reasonCodes: [] } }).effectiveDecision, "major");
  assert.equal(evaluateSupersession(proposal(), grant(), indeterminate, { ...evaluationOptions, checker: { escalateToMajor: false, reasonCodes: [] } }).effectiveDecision, "indeterminate");
  const escalated = evaluateSupersession(proposal(), grant(), routine, { ...evaluationOptions, checker: { escalateToMajor: true, reasonCodes: ["MODEL_RISK"] } });
  assert.equal(escalated.effectiveDecision, "major");
  assert.equal(escalated.authorized, false);
  const runtimeDowngrade = evaluateSupersession(proposal(), grant(), major, { ...evaluationOptions, checker: { escalateToMajor: false, reasonCodes: [], classification: "routine" } });
  assert.ok(runtimeDowngrade.reasonCodes.includes("CHECKER_INVALID_SHAPE"));
  assert.equal(runtimeDowngrade.authorized, false);
});

test("overdue review freezes only the affected grant; exception is bounded and durably receipted", () => {
  const overdue = { reviewId: ID.review, delegationId: "grant:1", actionOperationId: "prior", actionReceiptId: "prior-receipt", newSourceRef: { id: "n", digest: "d" }, predecessorRef: { id: "o", digest: "d" }, predicate: { id: "p", version: "1", decision: "routine" }, checkerEscalated: false, queuedAt: "2026-05-01T00:00:00Z", dueAt: "2026-05-02T00:00:00Z", reviewPolicy: { id: "r", version: "1" }, status: "pending", queuedBy: agent };
  assert.equal(evaluateSupersession(proposal(), grant(), routine, { ...evaluationOptions, deferredReviews: [overdue] }).authorized, false);
  assert.equal(evaluateSupersession(proposal(), grant({ delegationId: "grant:2" }), routine, { ...evaluationOptions, deferredReviews: [overdue] }).reasonCodes.includes("GRANT_FROZEN_OVERDUE_REVIEW"), false);
  const exception = {
    exceptionId: "exception:1", operationId: ID.exceptionOp, delegationId: "grant:1", authorizedBy: human,
    authorityRef: "authority:higher", higherPrecedenceThan: "authority:owner", notBefore: "2026-05-31T00:00:00Z",
    expiresAt: "2026-06-02T00:00:00Z", receiptId: ID.exceptionReceipt,
    durabilityVerification: {
      operationId: ID.exceptionOp, durable: true, recordId: "exception-record:1", digest: "sha256:exception",
      transactionBinding: "transaction:exception", mechanism: "atomic-transaction",
    },
  };
  assert.equal(evaluateSupersession(proposal(), grant(), routine, { ...evaluationOptions, deferredReviews: [overdue], reviewException: exception }).authorized, true);
  assert.equal(evaluateSupersession(proposal(), grant(), routine, { ...evaluationOptions, deferredReviews: [overdue], reviewException: { ...exception, higherPrecedenceThan: "authority:unrelated" } }).authorized, false);
  assert.equal(evaluateSupersession(proposal(), grant(), routine, { ...evaluationOptions, deferredReviews: [overdue], reviewException: { ...exception, durabilityVerification: { ...exception.durabilityVerification, durable: false } } }).authorized, false);
});

test("retention hold evaluation is fail-closed and never deletes", () => {
  const held = evaluateRetentionHold({ artifactId: "a", digest: "d" }, { id: "hold", version: "1", evaluate: () => "indeterminate" });
  assert.equal(held.dispositionMayBePlanned, false);
  assert.equal(held.routeHumanReview, true);
  assert.equal(held.dispositionExecuted, false);
});

test("GkxIndex.applyChanges is the sole incremental change-detection call", async () => {
  const cfg = await config();
  const index = createNavigationIndex();
  index.setFiles([{ relativePath: "A.md", content: "A" }]);
  let calls = 0;
  const original = index.applyChanges.bind(index);
  index.applyChanges = (changes) => { calls++; return original(changes); };
  const result = applyNavigationIndexChanges(index, { changed: [{ relativePath: "sub/A.md", content: "A2" }], removed: ["A.md"] }, snapshot([source("sub/A.md", "A2", "id:a")] ), cfg);
  assert.equal(calls, 1);
  assert.ok(result.affectedScopes.includes("sub"));
  assert.equal(result.discovery.entries[0].stableId, "id:a");
});

test("capability advertisement truthfully exposes every effect boundary", () => {
  assert.deepEqual(NAVIGATION_CAPABILITIES.navigation, {
    discover: true, classify: true, candidate: true, diff: true, audit: true, context: true,
    reentry_plan: true, bounded_supersession_evaluation: true, governance_store_adapter: true,
    apply_moc: false, source_content_write: false, archive_delete: false, reentry_write: false,
    rollback_execution: false, reentry_record: false,
  });
  assert.equal(getNavigationCapabilities({ governanceStoreConfigured: true, validAuthorityPathActive: false }).navigation.reentry_record, false);
  assert.equal(getNavigationCapabilities({ governanceStoreConfigured: true, validAuthorityPathActive: true }).navigation.reentry_record, true);
});
