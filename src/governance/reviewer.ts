import { deepFreeze, sha256Bytes } from "../canonical";
import type { ActorRef } from "./types";

/** Bounded synthetic reviewer contract. This is not a normative GKOS context manifest. */
export const REVIEWER_CONTRACT_VERSION = "1.0.0";
/** Exact strings, UTF-16 key ordering, safe integers only; JSON never repairs evidence. */
export function reviewerCanonicalBytes(value: unknown): string {
  const seen = new Set<object>();
  const encode = (item: unknown): string => {
    if (item === null || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "string") {
      if (!wellFormed(item)) throw new TypeError("Reviewer canonical strings require well-formed Unicode.");
      return JSON.stringify(item);
    }
    if (typeof item === "number" && Number.isSafeInteger(item) && !Object.is(item, -0)) return String(item);
    if (typeof item !== "object" || !item || seen.has(item)) throw new TypeError("Reviewer canonical values require acyclic JSON with safe integers.");
    const proto = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && proto !== Object.prototype && proto !== null) throw new TypeError("Reviewer canonical objects must be plain JSON.");
    seen.add(item);
    let result: string;
    if (Array.isArray(item)) {
      const entries = [];
      for (let i = 0; i < item.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(item, i)) throw new TypeError("Reviewer canonical arrays cannot be sparse.");
        entries.push(encode(item[i]));
      }
      result = `[${entries.join(",")}]`;
    } else {
      result = `{${Object.keys(item).sort().map(key => `${encode(key)}:${encode(item[key])}`).join(",")}}`;
    }
    seen.delete(item);
    return result;
  };
  return encode(value);
}
export async function reviewerCanonicalDigest(value: unknown): Promise<string> { return sha256Bytes(reviewerCanonicalBytes(value)); }
export interface ReviewerPolicy { id: string; version: string; digest: string }
export interface ReviewerSource { id: string; revision: string; content: string }
export interface ReviewerContext {
  artifactKind: "engine.reviewer-context";
  contractVersion: "1.0.0";
  canonicalization: "engine-reviewer-exact-json-v1";
  runId: string;
  corpusRevision: string;
  policy: ReviewerPolicy;
  sources: { id: string; revision: string; digest: string }[];
  selectedSourceIds: string[];
  requiredSourceIds: string[];
  requiredWarningCodes: string[];
  warnings: { code: string; sourceId?: string; message: string }[];
  assembledAt: string;
  expiresAt: string;
  contextDigest: string;
}
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function instant(value: string): number {
  if (typeof value !== "string" || !INSTANT.test(value)) return NaN;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return NaN;
  const normalized = new Date(parsed).toISOString();
  return normalized.slice(0, 19) === value.slice(0, 19) ? parsed : NaN;
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && !/[\r\n\u0000]/.test(value); }
function snapshot<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function wellFormed(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
function policyValid(value: ReviewerPolicy): boolean { return !!value && text(value.id) && text(value.version) && DIGEST.test(value.digest); }
function unique(values: readonly string[]): boolean { return Array.isArray(values) && values.every(text) && new Set(values).size === values.length; }
function contextProblems(context: ReviewerContext): string[] {
  if (!context || typeof context !== "object") return ["CONTEXT_INVALID"];
  const sources = context.sources;
  if (context.artifactKind !== "engine.reviewer-context" || context.contractVersion !== REVIEWER_CONTRACT_VERSION
    || context.canonicalization !== "engine-reviewer-exact-json-v1" || !text(context.runId) || !text(context.corpusRevision)
    || !policyValid(context.policy) || !Array.isArray(sources) || sources.length === 0
    || sources.some(s => !s || !text(s.id) || !text(s.revision) || !DIGEST.test(s.digest))
    || !unique(sources.map(s => s.id)) || !unique(context.selectedSourceIds) || context.selectedSourceIds.length === 0
    || context.selectedSourceIds.some(id => !sources.some(s => s.id === id))
    || !unique(context.requiredSourceIds) || context.requiredSourceIds.some(id => !context.selectedSourceIds.includes(id))
    || !unique(context.requiredWarningCodes) || !Array.isArray(context.warnings)
    || context.warnings.some(w => !w || !text(w.code) || !text(w.message) || (w.sourceId !== undefined && (!text(w.sourceId) || !context.selectedSourceIds.includes(w.sourceId))))
    || context.requiredWarningCodes.some(code => !context.warnings.some(w => w.code === code))
    || !Number.isFinite(instant(context.assembledAt)) || !Number.isFinite(instant(context.expiresAt))
    || instant(context.expiresAt) <= instant(context.assembledAt) || !DIGEST.test(context.contextDigest)) return ["CONTEXT_INVALID"];
  return [];
}
export async function buildReviewerContext(input: {
  runId: string; corpusRevision: string; policy: ReviewerPolicy; sources: readonly ReviewerSource[];
  selectedSourceIds: readonly string[]; assembledAt: string; expiresAt: string;
  requiredSourceIds?: readonly string[]; requiredWarningCodes?: readonly string[];
  warnings?: readonly { code: string; sourceId?: string; message: string }[];
}): Promise<ReviewerContext> {
  input = snapshot(input);
  if (!input || !Array.isArray(input.sources) || input.sources.some(s => !s || typeof s.content !== "string" || !wellFormed(s.content))) throw new TypeError("Reviewer sources require exact well-formed text content.");
  const sources = await Promise.all(input.sources.map(async s => ({ id: s.id, revision: s.revision, digest: await sha256Bytes(s.content) })));
  sources.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const body = { artifactKind: "engine.reviewer-context" as const, contractVersion: REVIEWER_CONTRACT_VERSION as "1.0.0",
    canonicalization: "engine-reviewer-exact-json-v1" as const, runId: input.runId, corpusRevision: input.corpusRevision,
    policy: { ...input.policy }, sources, selectedSourceIds: [...input.selectedSourceIds],
    requiredSourceIds: [...(input.requiredSourceIds ?? [])].sort(), requiredWarningCodes: [...(input.requiredWarningCodes ?? [])].sort(),
    warnings: [...(input.warnings ?? [])].sort((a, b) => `${a.code}\0${a.sourceId ?? ""}\0${a.message}` < `${b.code}\0${b.sourceId ?? ""}\0${b.message}` ? -1 : `${a.code}\0${a.sourceId ?? ""}\0${a.message}` > `${b.code}\0${b.sourceId ?? ""}\0${b.message}` ? 1 : 0),
    assembledAt: input.assembledAt, expiresAt: input.expiresAt };
  const result = { ...body, contextDigest: await reviewerCanonicalDigest(body) };
  if (contextProblems(result).length) throw new TypeError("Invalid reviewer context or incomplete selection closure.");
  return deepFreeze(result);
}
export async function verifyReviewerContext(context: ReviewerContext): Promise<boolean> {
  try {
    context = snapshot(context);
    if (contextProblems(context).length) return false;
    const { contextDigest, ...body } = context;
    return contextDigest === await reviewerCanonicalDigest(body);
  } catch { return false; }
}
export interface ReviewerProposal {
  id: string; digest: string; proposerId: string; contextDigest: string; intendedResultDigest: string;
}
export interface ReviewerReview {
  id: string; reviewerId: string; proposalDigest: string; contextDigest: string;
  disposition: "approved" | "incomplete" | "refused";
  reviewerClass: "human" | "agent";
  reviewerModelFamily?: string; proposerModelFamily?: string;
  reviewAuthorityId: string; sealedEvidenceDigest: string; validUntil: string;
  mandatoryEscalation: boolean; humanEscalationResolved: boolean;
}
export interface ReviewerEffectScope {
  purpose: string; audience: string; environment: string; sensitivity: string;
  operation: string; targetId: string; maxAffected: number;
}
export interface ReviewerAuthority {
  id: string; actorId: string; authorizerId: string; runId: string; revision: number;
  status: "active" | "revoked"; validFrom: string; validUntil: string; contextDigest: string;
  proposalDigest: string; intendedResultDigest: string; operations: string[]; targetIds: string[];
  effectScope: ReviewerEffectScope;
}
export interface ReviewerAdmissionRequest {
  context: ReviewerContext; expectedContextDigest: string; runId: string; corpusRevision: string; policy: ReviewerPolicy;
  actor: ActorRef; authority: ReviewerAuthority; expectedAuthorityRevision: number;
  proposal: ReviewerProposal; review: ReviewerReview; operation: string; targetId: string; at: string;
  receiptAvailable: boolean; targetDigest: string; expectedTargetDigest: string; intendedResultDigest: string;
  authoritativeSources: readonly ReviewerSource[];
  authoritativeClosure: { requiredSourceIds: string[]; requiredWarningCodes: string[] };
  expectedReviewEvidenceDigest: string;
  executionState: "ready" | "hold" | "uncertain" | "recovering";
  challengeDisposition: "none" | "open" | "needs-evidence" | "upheld" | "dismissed";
  requestedEffect: ReviewerEffectScope; actorEffect: ReviewerEffectScope;
}
export interface ReviewerAdmissionDecision { admitted: boolean; reasonCodes: string[]; bindingDigest: string }
/** Run inside the host's serialization boundary using authenticated actor and authoritative state. */
export async function evaluateReviewerAdmission(request: ReviewerAdmissionRequest): Promise<ReviewerAdmissionDecision> {
  request = snapshot(request);
  if (!request || typeof request !== "object") throw new TypeError("Reviewer admission requires a request object.");
  const reasons = new Set<string>();
  const reject = (condition: boolean, code: string) => { if (condition) reasons.add(code); };
  const r = request, c = r?.context, a = r?.authority, p = r?.proposal, v = r?.review;
  reject(!await verifyReviewerContext(c), "CONTEXT_INVALID");
  reject(!DIGEST.test(r?.expectedContextDigest) || c?.contextDigest !== r.expectedContextDigest, "CONTEXT_BINDING_MISMATCH");
  reject(!text(r?.runId) || c?.runId !== r.runId || a?.runId !== r.runId, "RUN_BINDING_MISMATCH");
  reject(!text(r?.corpusRevision) || c?.corpusRevision !== r.corpusRevision, "CORPUS_BINDING_MISMATCH");
  reject(!policyValid(r?.policy) || reviewerCanonicalBytes(c?.policy ?? null) !== reviewerCanonicalBytes(r?.policy ?? null), "POLICY_BINDING_MISMATCH");
  const now = instant(r?.at);
  reject(r.executionState !== "ready", "EXECUTION_HOLD");
  reject(!["none", "dismissed"].includes(r.challengeDisposition), "CHALLENGE_HOLD");
  const closure = r.authoritativeClosure;
  reject(!closure || !unique(closure.requiredSourceIds) || !unique(closure.requiredWarningCodes)
    || closure.requiredSourceIds.some(id => !c?.selectedSourceIds?.includes(id))
    || closure.requiredWarningCodes.some(code => !c?.warnings?.some(w => w.code === code)), "CONTEXT_CLOSURE_INCOMPLETE");
  let authoritative = false;
  try {
    const captured = await buildReviewerContext({ ...c, sources: r.authoritativeSources });
    authoritative = reviewerCanonicalBytes(captured.sources) === reviewerCanonicalBytes(c?.sources);
  } catch { /* Missing or malformed authoritative source bytes close the gate. */ }
  reject(!authoritative, "SOURCE_BINDING_MISMATCH");
  reject(!Number.isFinite(now) || now < instant(c?.assembledAt) || now >= instant(c?.expiresAt), "CONTEXT_TIME_INVALID");
  reject(!a || !text(a.id) || !text(a.actorId) || !text(a.authorizerId) || !Number.isSafeInteger(a.revision) || a.revision < 1
    || !unique(a.operations) || !unique(a.targetIds) || !DIGEST.test(a.contextDigest) || !DIGEST.test(a.proposalDigest) || !DIGEST.test(a.intendedResultDigest), "AUTHORITY_INVALID");
  reject(a?.status !== "active", "AUTHORITY_REVOKED");
  reject(!Number.isSafeInteger(r?.expectedAuthorityRevision) || a?.revision !== r.expectedAuthorityRevision, "AUTHORITY_REVISION_MISMATCH");
  reject(!Number.isFinite(instant(a?.validFrom)) || !Number.isFinite(instant(a?.validUntil)) || !Number.isFinite(now)
    || instant(a?.validUntil) <= instant(a?.validFrom) || now < instant(a?.validFrom) || now >= instant(a?.validUntil), "AUTHORITY_TIME_INVALID");
  reject(!text(r?.actor?.id) || !["human", "agent", "system", "service"].includes(r?.actor?.class) || a?.actorId !== r.actor.id, "ACTOR_BINDING_MISMATCH");
  reject(!text(r?.operation) || !a?.operations?.includes(r.operation) || !text(r?.targetId) || !a?.targetIds?.includes(r.targetId), "EFFECT_SCOPE_DENIED");
  reject(!p || !text(p.id) || !text(p.proposerId) || !DIGEST.test(p.digest) || !DIGEST.test(p.contextDigest) || !DIGEST.test(p.intendedResultDigest), "PROPOSAL_INVALID");
  reject(!v || !text(v.id) || !text(v.reviewerId) || v.disposition !== "approved", "REVIEW_NOT_APPROVED");
  reject(!v || !["human", "agent"].includes(v.reviewerClass) || !text(v.reviewAuthorityId)
    || !DIGEST.test(v.sealedEvidenceDigest) || !DIGEST.test(r.expectedReviewEvidenceDigest) || v.sealedEvidenceDigest !== r.expectedReviewEvidenceDigest, "REVIEW_AUTHORITY_INVALID");
  reject(!Number.isFinite(instant(v?.validUntil)) || !Number.isFinite(now) || now >= instant(v?.validUntil), "REVIEW_EXPIRED");
  reject(v?.reviewerClass === "agent" && (!text(v.reviewerModelFamily) || !text(v.proposerModelFamily) || v.reviewerModelFamily === v.proposerModelFamily), "REVIEW_MODEL_FAMILY_INVALID");
  reject(typeof v?.mandatoryEscalation !== "boolean" || typeof v?.humanEscalationResolved !== "boolean"
    || (v?.mandatoryEscalation === true && v?.humanEscalationResolved !== true), "HUMAN_ESCALATION_REQUIRED");
  const scopeValid = (s: ReviewerEffectScope) => !!s && [s.purpose, s.audience, s.environment, s.sensitivity, s.operation, s.targetId].every(text)
    && Number.isSafeInteger(s.maxAffected) && s.maxAffected > 0;
  const contained = (requested: ReviewerEffectScope, allowed: ReviewerEffectScope) => scopeValid(requested) && scopeValid(allowed)
    && ["purpose", "audience", "environment", "sensitivity", "operation", "targetId"].every(key => requested[key] === allowed[key])
    && requested.maxAffected <= allowed.maxAffected;
  reject(!contained(r.requestedEffect, r.actorEffect) || !contained(r.requestedEffect, a?.effectScope)
    || r.requestedEffect?.operation !== r.operation || r.requestedEffect?.targetId !== r.targetId, "TYPED_EFFECT_SCOPE_DENIED");
  reject(!DIGEST.test(r?.intendedResultDigest) || p?.intendedResultDigest !== r.intendedResultDigest || a?.intendedResultDigest !== r.intendedResultDigest, "RESULT_BINDING_MISMATCH");
  reject(a?.contextDigest !== c?.contextDigest || p?.contextDigest !== c?.contextDigest || v?.contextDigest !== c?.contextDigest
    || a?.proposalDigest !== p?.digest || v?.proposalDigest !== p?.digest, "DECISION_BINDING_MISMATCH");
  const roles = [p?.proposerId, v?.reviewerId, a?.authorizerId, r?.actor?.id];
  reject(!roles.every(text) || new Set(roles).size !== roles.length, "ROLE_SEPARATION_FAILED");
  reject(!DIGEST.test(r?.targetDigest) || !DIGEST.test(r?.expectedTargetDigest) || r.targetDigest !== r.expectedTargetDigest, "TARGET_PRECONDITION_FAILED");
  reject(r?.receiptAvailable !== true, "RECEIPT_UNAVAILABLE");
  const reasonCodes = [...reasons].sort();
  // Bind the complete decision basis; this digest is evidence, never a bearer grant.
  return deepFreeze({ admitted: reasonCodes.length === 0, reasonCodes, bindingDigest: await reviewerCanonicalDigest({ contractVersion: REVIEWER_CONTRACT_VERSION, request, reasonCodes }) });
}

export interface ReviewerCorrectionRequest {
  actor: ActorRef; authorizedReviewerIds: string[]; predecessor: ReviewerContext; replacement: ReviewerContext;
  predecessorDecisionId: string; challengeId: string; rationale: string; at: string;
}
/** A correction proposes new evidence only; it never carries forward review or authority. */
export async function evaluateReviewerCorrection(r: ReviewerCorrectionRequest): Promise<ReviewerAdmissionDecision> {
  r = snapshot(r);
  if (!r || typeof r !== "object") throw new TypeError("Reviewer correction requires a request object.");
  const reasons: string[] = [];
  if (!r?.actor?.id || !unique(r.authorizedReviewerIds) || !r.authorizedReviewerIds.includes(r.actor.id)) reasons.push("CORRECTION_ACTOR_DENIED");
  if (!text(r?.challengeId) || !text(r?.predecessorDecisionId) || !text(r?.rationale)) reasons.push("CORRECTION_EVIDENCE_INCOMPLETE");
  if (!await verifyReviewerContext(r?.predecessor) || !await verifyReviewerContext(r?.replacement)) reasons.push("CONTEXT_INVALID");
  if (r?.predecessor?.runId !== r?.replacement?.runId) reasons.push("RUN_BINDING_MISMATCH");
  if (r?.predecessor?.contextDigest === r?.replacement?.contextDigest) reasons.push("CORRECTION_UNCHANGED");
  const now = instant(r?.at);
  if (!Number.isFinite(now) || now < instant(r?.replacement?.assembledAt) || now >= instant(r?.replacement?.expiresAt)) reasons.push("CONTEXT_TIME_INVALID");
  const reasonCodes = [...new Set(reasons)].sort();
  return deepFreeze({ admitted: reasonCodes.length === 0, reasonCodes, bindingDigest: await reviewerCanonicalDigest({ contractVersion: REVIEWER_CONTRACT_VERSION, request: r, reasonCodes }) });
}
