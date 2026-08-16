import { buildStateChangeReceipt, isDelegationFrozenByReview, UUID_V7_RE, type DeferredReviewItem } from "../governance";
import { deepFreeze } from "../canonical";
import { codeUnitCompare } from "../paths";
import type {
  CheckerEscalation,
  MajorDecision,
  MajorPredicate,
  RetentionHoldEvaluation,
  RetentionHoldPolicy,
  ReviewFreezeException,
  SupersessionDelegation,
  SupersessionEvaluation,
  SupersessionEvaluationOptions,
  SupersessionProposal,
} from "./types";

function instant(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function subset(child: readonly string[], parent: readonly string[]): boolean {
  return child.every((value) => parent.includes(value));
}

function grantProblems(grant: SupersessionDelegation, at: number): string[] {
  const problems: string[] = [];
  const issued = instant(grant.issuedAt), start = instant(grant.notBefore ?? grant.issuedAt), end = instant(grant.expiresAt);
  const originStart = instant(grant.originatingAuthority?.notBefore ?? grant.issuedAt), originEnd = instant(grant.originatingAuthority?.expiresAt);
  if ([issued, start, end, originStart, originEnd].some((value) => value === null)) problems.push("GRANT_TIME_INVALID");
  else {
    if (at < start!) problems.push("GRANT_NOT_YET_VALID");
    if (at >= end!) problems.push("GRANT_EXPIRED");
    if (start! < originStart! || end! > originEnd!) problems.push("GRANT_TIME_WIDENED");
    if (issued! > start!) problems.push("GRANT_ISSUED_AFTER_START");
  }
  if (grant.operation !== "lineage.supersession.record" || grant.originatingAuthority?.operation !== grant.operation) problems.push("GRANT_OPERATION_INVALID");
  if (grant.issuer?.class !== "human" && !grant.parentGrant) problems.push("GRANT_ISSUER_NOT_HUMAN");
  if (grant.subject?.class !== "agent") problems.push("GRANT_SUBJECT_NOT_AGENT");
  if (!grant.delegationId || !Number.isInteger(grant.version) || grant.version < 1 || !grant.actorContractRef || grant.subject?.contractRef !== grant.actorContractRef) problems.push("GRANT_ACTOR_CONTRACT_UNBOUND");
  if (!grant.provenanceRef || !grant.revocationRef || !grant.originatingAuthority?.authorityRef) problems.push("GRANT_PROVENANCE_OR_AUTHORITY_MISSING");
  if (!grant.majorPredicate?.id || !grant.majorPredicate.version || !grant.reviewPolicy?.id || !grant.reviewPolicy.version || !Number.isInteger(grant.reviewPolicy.dueWithinSeconds) || grant.reviewPolicy.dueWithinSeconds <= 0) problems.push("GRANT_POLICY_BINDING_INCOMPLETE");
  if (grant.vaultScope !== grant.originatingAuthority?.vaultScope || !subset(grant.objectClassScope, grant.originatingAuthority?.objectClassScope ?? [])) problems.push("GRANT_SCOPE_WIDENED");
  if (grant.parentGrant) {
    const parent = grant.parentGrant, parentStart = instant(parent.notBefore ?? parent.issuedAt), parentEnd = instant(parent.expiresAt);
    if (grant.issuer.id !== parent.subject.id || grant.operation !== parent.operation || grant.vaultScope !== parent.vaultScope) problems.push("CHILD_GRANT_AUTHORITY_WIDENED");
    if (!subset(grant.objectClassScope, parent.objectClassScope)) problems.push("CHILD_GRANT_SCOPE_WIDENED");
    if (start === null || end === null || parentStart === null || parentEnd === null || start < parentStart || end > parentEnd) problems.push("CHILD_GRANT_TIME_WIDENED");
  }
  return [...new Set(problems)].sort(codeUnitCompare);
}

function checkerProblems(checker: CheckerEscalation | undefined): string[] {
  if (!checker) return [];
  const keys = Object.keys(checker as object);
  if (keys.some((key) => !["escalateToMajor", "reasonCodes", "modelRef"].includes(key))) return ["CHECKER_INVALID_SHAPE"];
  if (typeof checker.escalateToMajor !== "boolean" || !Array.isArray(checker.reasonCodes) || checker.reasonCodes.some((code) => typeof code !== "string")) return ["CHECKER_INVALID_SHAPE"];
  return [];
}

function validReviewException(exception: ReviewFreezeException | undefined, grant: SupersessionDelegation, at: number): boolean {
  if (!exception
    || exception.delegationId !== grant.delegationId
    || exception.authorizedBy.class !== "human"
    || exception.authorizedBy.id === grant.subject.id
    || !exception.authorityRef
    || exception.authorityRef === grant.originatingAuthority.authorityRef
    || exception.higherPrecedenceThan !== grant.originatingAuthority.authorityRef
    || !UUID_V7_RE.test(exception.operationId)
    || !UUID_V7_RE.test(exception.receiptId)
    || exception.durabilityVerification?.durable !== true
    || exception.durabilityVerification.operationId !== exception.operationId
    || !exception.durabilityVerification.recordId
    || !exception.durabilityVerification.digest
    || !exception.durabilityVerification.transactionBinding) return false;
  const start = instant(exception.notBefore), end = instant(exception.expiresAt), grantEnd = instant(grant.expiresAt);
  return start !== null && end !== null && grantEnd !== null && at >= start && at < end && end <= grantEnd;
}

export function evaluateSupersession(
  proposal: SupersessionProposal,
  grant: SupersessionDelegation,
  predicate: MajorPredicate | null,
  options: SupersessionEvaluationOptions,
): SupersessionEvaluation {
  const at = instant(options.at);
  const reasons = at === null ? ["EVALUATION_TIME_INVALID"] : grantProblems(grant, at);
  if (!proposal?.explicitDeclaration) reasons.push("SUPERSESSION_NOT_EXPLICIT");
  if (proposal?.actor?.id !== grant.subject.id || proposal?.actor?.contractRef !== grant.actorContractRef) reasons.push("SUBJECT_OR_CONTRACT_OUT_OF_SCOPE");
  if (proposal?.vaultId !== grant.vaultScope || !grant.objectClassScope.includes(proposal?.objectClass)) reasons.push("OBJECT_SCOPE_OUT_OF_SCOPE");
  if (!proposal?.predecessor?.id || !proposal.predecessor.version || !proposal.predecessor.digest || !proposal?.successor?.id || !proposal.successor.version || !proposal.successor.digest || proposal.predecessor.id === proposal.successor.id) reasons.push("LINEAGE_BINDING_INVALID");
  if (options.revokedDelegationIds?.includes(grant.delegationId)) reasons.push("GRANT_REVOKED");
  if (!predicate || predicate.id !== grant.majorPredicate.id || predicate.version !== grant.majorPredicate.version || (grant.majorPredicate.digest && predicate.digest !== grant.majorPredicate.digest)) reasons.push("PREDICATE_MISSING_OR_MISMATCHED");

  let deterministicDecision: MajorDecision = "indeterminate";
  if (predicate && !reasons.includes("PREDICATE_MISSING_OR_MISMATCHED")) {
    try {
      const evaluated = predicate.evaluate(proposal);
      deterministicDecision = ["routine", "major", "indeterminate"].includes(evaluated) ? evaluated : "indeterminate";
      if (deterministicDecision === "indeterminate" && evaluated !== "indeterminate") reasons.push("PREDICATE_RESULT_INVALID");
    } catch { reasons.push("PREDICATE_UNAVAILABLE"); deterministicDecision = "indeterminate"; }
  }
  reasons.push(...checkerProblems(options.checker));
  const checkerEscalated = deterministicDecision === "routine" && options.checker?.escalateToMajor === true && !reasons.includes("CHECKER_INVALID_SHAPE");
  const effectiveDecision: MajorDecision = checkerEscalated ? "major" : deterministicDecision;
  if (effectiveDecision !== "routine") reasons.push(effectiveDecision === "major" ? "HUMAN_DISPOSITION_MAJOR" : "HUMAN_DISPOSITION_INDETERMINATE");

  if (at !== null && isDelegationFrozenByReview(grant.delegationId, options.deferredReviews ?? [], options.at) && !validReviewException(options.reviewException, grant, at)) reasons.push("GRANT_FROZEN_OVERDUE_REVIEW");
  if (!options.receipt?.receiptId || !options.receipt.occurredAt) reasons.push("RECEIPT_BINDING_INPUT_MISSING");
  if (!options.review?.reviewId || !options.review.queuedAt) reasons.push("DEFERRED_REVIEW_BINDING_INPUT_MISSING");
  const reasonCodes = [...new Set(reasons)].sort(codeUnitCompare);
  let proposedReceipt = null, deferredReview: DeferredReviewItem | null = null;
  const authorized = reasonCodes.length === 0 && effectiveDecision === "routine";
  if (authorized) {
    try {
      proposedReceipt = buildStateChangeReceipt({
        receiptId: options.receipt!.receiptId,
        operationId: proposal.operationId,
        actor: proposal.actor,
        operation: "lineage.supersession.record",
        targets: [
          { id: proposal.predecessor.id, beforeDigest: proposal.predecessor.digest },
          { id: proposal.successor.id, afterDigest: proposal.successor.digest },
        ],
        authorityRef: grant.originatingAuthority.authorityRef,
        delegationRef: grant.delegationId,
        policy: { id: grant.majorPredicate.id, version: grant.majorPredicate.version, ...(grant.majorPredicate.digest ? { digest: grant.majorPredicate.digest } : {}) },
        predicate: { id: predicate!.id, version: predicate!.version, result: deterministicDecision },
        nondeterministicEscalated: false,
        occurredAt: options.receipt!.occurredAt,
      });
      const dueAt = new Date(Date.parse(options.review!.queuedAt) + grant.reviewPolicy.dueWithinSeconds * 1000).toISOString();
      deferredReview = {
        reviewId: options.review!.reviewId,
        delegationId: grant.delegationId,
        actionOperationId: proposal.operationId,
        actionReceiptId: options.receipt!.receiptId,
        newSourceRef: { id: proposal.successor.id, digest: proposal.successor.digest },
        predecessorRef: { id: proposal.predecessor.id, digest: proposal.predecessor.digest },
        predicate: { id: predicate!.id, version: predicate!.version, decision: "routine" },
        checkerEscalated: false,
        queuedAt: options.review!.queuedAt,
        dueAt,
        reviewPolicy: { id: grant.reviewPolicy.id, version: grant.reviewPolicy.version },
        status: "pending",
        queuedBy: { ...proposal.actor },
      };
    } catch { reasonCodes.push("RECEIPT_OR_REVIEW_BINDING_INVALID"); proposedReceipt = null; deferredReview = null; }
  }
  const finalReasons = [...new Set(reasonCodes)].sort(codeUnitCompare);
  return deepFreeze({
    artifactKind: "engine.supersession-evaluation",
    authorized: authorized && finalReasons.length === 0 && !!proposedReceipt && !!deferredReview,
    effectiveDecision,
    deterministicDecision,
    checkerEscalated,
    reasonCodes: finalReasons,
    proposedReceipt,
    deferredReview,
    sourceContentWriteAuthorized: false,
  });
}

export const evaluateSupersessionDelegation = evaluateSupersession;

export function evaluateRetentionHold(input: { artifactId: string; digest: string }, policy: RetentionHoldPolicy): RetentionHoldEvaluation {
  let decision: ReturnType<RetentionHoldPolicy["evaluate"]> = "unavailable";
  try { decision = policy.evaluate(input); } catch { decision = "unavailable"; }
  if (!["clear", "hold", "indeterminate", "unavailable"].includes(decision)) decision = "indeterminate";
  return deepFreeze({
    decision,
    dispositionMayBePlanned: decision === "clear",
    dispositionExecuted: false,
    routeHumanReview: decision !== "clear",
    policy: { id: policy.id, version: policy.version },
  });
}
