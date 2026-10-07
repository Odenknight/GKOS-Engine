import {buildReviewerContext,reviewerCanonicalDigest} from '../../dist/governance.mjs';
const hash = async value => reviewerCanonicalDigest(value);
const at = '2026-10-06T12:00:00Z', expiresAt = '2026-10-07T12:00:00Z';
const policy = { id: 'synthetic-policy', version: '1', digest: await hash('policy') };
const contextInput = { runId: 'run-1', corpusRevision: 'corpus-1', policy,
  sources: [{ id: 'b', revision: '1', content: 'beta\r\n' }, { id: 'a', revision: '1', content: 'alpha' }],
  selectedSourceIds: ['b', 'a'], assembledAt: at, expiresAt };
const context = await buildReviewerContext(contextInput);
const intendedResultDigest = await hash('effect'), proposalDigest = await hash('proposal'), targetDigest = await hash('before');
const effectScope = { purpose: 'synthetic-review', audience: 'run:run-1', environment: 'isolated-reviewer-cell', sensitivity: 'public', operation: 'result:publish', targetId: 'result-1', maxAffected: 1 };
const request = { context, expectedContextDigest: context.contextDigest, runId: 'run-1', corpusRevision: 'corpus-1', policy,
  actor: { id: 'executor', class: 'service' },
  authority: { id: 'grant-1', actorId: 'executor', authorizerId: 'authorizer', runId: 'run-1', revision: 1, status: 'active',
    validFrom: at, validUntil: expiresAt, contextDigest: context.contextDigest, proposalDigest, intendedResultDigest,
    operations: ['result:publish'], targetIds: ['result-1'], effectScope: { ...effectScope } }, expectedAuthorityRevision: 1,
  proposal: { id: 'proposal-1', digest: proposalDigest, proposerId: 'proposer', contextDigest: context.contextDigest, intendedResultDigest },
  review: { id: 'review-1', reviewerId: 'reviewer', proposalDigest, contextDigest: context.contextDigest, disposition: 'approved',
    reviewerClass: 'human', reviewAuthorityId: 'review-authority', sealedEvidenceDigest: context.contextDigest, validUntil: expiresAt, mandatoryEscalation: false, humanEscalationResolved: false },
  operation: 'result:publish', targetId: 'result-1', at, receiptAvailable: true, targetDigest, expectedTargetDigest: targetDigest, intendedResultDigest,
  authoritativeSources: contextInput.sources, authoritativeClosure: { requiredSourceIds: [], requiredWarningCodes: [] }, expectedReviewEvidenceDigest: context.contextDigest,
  executionState: 'ready', challengeDisposition: 'none', requestedEffect: { ...effectScope }, actorEffect: { ...effectScope },
  controls: { predicate: { id: 'synthetic-result-policy', version: '1', digest: policy.digest, outcome: 'pass', evidenceRefs: ['synthetic-fixture:1'] },
    checker: { id: 'fixture-checker', version: '1', digest: policy.digest, kind: 'deterministic', recommendation: 'preserve' },
    recovery: { correction: true, compensation: true, rollback: true, escalation: true } } };
export {request,contextInput,context,at,expiresAt};
