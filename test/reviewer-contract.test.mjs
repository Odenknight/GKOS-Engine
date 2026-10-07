import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewerContext, verifyReviewerContext, evaluateReviewerAdmission, evaluateReviewerCorrection,
  reviewerCanonicalDigest, reviewerCanonicalBytes, InMemoryGovernanceStore, buildStateChangeReceipt, buildGovernedRecord } from '../dist/governance.mjs';

const hash = async value => reviewerCanonicalDigest(value);
const at = '2026-10-06T12:00:00Z', expiresAt = '2026-10-07T12:00:00Z';
const policy = { id: 'synthetic-policy', version: '1', digest: await hash('policy') };
const contextInput = { runId: 'run-1', corpusRevision: 'corpus-1', policy,
  sources: [{ id: 'b', revision: '1', content: 'beta\r\n' }, { id: 'a', revision: '1', content: 'alpha' }],
  selectedSourceIds: ['b', 'a'], assembledAt: at, expiresAt };
const context = await buildReviewerContext(contextInput);
const intendedResultDigest = await hash('effect'), proposalDigest = await hash('proposal'), targetDigest = await hash('before');
const request = { context, expectedContextDigest: context.contextDigest, runId: 'run-1', corpusRevision: 'corpus-1', policy,
  actor: { id: 'executor', class: 'service' },
  authority: { id: 'grant-1', actorId: 'executor', authorizerId: 'authorizer', runId: 'run-1', revision: 1, status: 'active',
    validFrom: at, validUntil: expiresAt, contextDigest: context.contextDigest, proposalDigest, intendedResultDigest,
    operations: ['result:publish'], targetIds: ['result-1'] }, expectedAuthorityRevision: 1,
  proposal: { id: 'proposal-1', digest: proposalDigest, proposerId: 'proposer', contextDigest: context.contextDigest, intendedResultDigest },
  review: { id: 'review-1', reviewerId: 'reviewer', proposalDigest, contextDigest: context.contextDigest, disposition: 'approved' },
  operation: 'result:publish', targetId: 'result-1', at, receiptAvailable: true, targetDigest, expectedTargetDigest: targetDigest, intendedResultDigest };
const clone = value => structuredClone(value);

test('context captures exact source bytes, deterministic corpus order and ordered selection closure', async () => {
  assert.equal(await verifyReviewerContext(context), true);
  assert.deepEqual(context.sources.map(s => s.id), ['a', 'b']);
  assert.equal((await buildReviewerContext({ ...contextInput, sources: [...contextInput.sources].reverse() })).contextDigest, context.contextDigest);
  assert.notEqual((await buildReviewerContext({ ...contextInput, selectedSourceIds: ['a', 'b'] })).contextDigest, context.contextDigest);
  const changed = clone(contextInput); changed.sources[0].content = 'beta\n';
  assert.notEqual((await buildReviewerContext(changed)).contextDigest, context.contextDigest);
  for (const selectedSourceIds of [[], ['a', 'a'], ['missing']]) await assert.rejects(buildReviewerContext({ ...contextInput, selectedSourceIds }));
  await assert.rejects(buildReviewerContext({ ...contextInput, expiresAt: '2026-02-31T12:00:00Z' }));
  await assert.rejects(buildReviewerContext({ ...contextInput, sources: [{ id: 'a', revision: '1', content: '\ud800' }] }));
  const tampered = clone(context); tampered.sources[0].digest = intendedResultDigest;
  assert.equal(await verifyReviewerContext(tampered), false);
});

test('admission binds authoritative roles, state, exact context, time, review and typed scope before effects', async () => {
  assert.equal((await evaluateReviewerAdmission(request)).admitted, true);
  const cases = [
    ['AUTHORITY_REVOKED', r => r.authority.status = 'revoked'],
    ['AUTHORITY_REVISION_MISMATCH', r => r.expectedAuthorityRevision = 2],
    ['AUTHORITY_TIME_INVALID', r => r.authority.validUntil = at],
    ['CONTEXT_TIME_INVALID', r => r.at = expiresAt],
    ['CONTEXT_TIME_INVALID', r => r.at = 'bad-clock'],
    ['ACTOR_BINDING_MISMATCH', r => r.actor.id = 'intruder'],
    ['ROLE_SEPARATION_FAILED', r => r.review.reviewerId = r.proposal.proposerId],
    ['REVIEW_NOT_APPROVED', r => r.review.disposition = 'incomplete'],
    ['DECISION_BINDING_MISMATCH', r => r.review.contextDigest = intendedResultDigest],
    ['CONTEXT_BINDING_MISMATCH', r => r.expectedContextDigest = intendedResultDigest],
    ['RUN_BINDING_MISMATCH', r => r.runId = 'another-run'],
    ['CORPUS_BINDING_MISMATCH', r => r.corpusRevision = 'new-corpus'],
    ['POLICY_BINDING_MISMATCH', r => r.policy.version = '2'],
    ['EFFECT_SCOPE_DENIED', r => r.targetId = '../escape'],
    ['EFFECT_SCOPE_DENIED', r => r.operation = '*'],
    ['RESULT_BINDING_MISMATCH', r => r.intendedResultDigest = targetDigest],
    ['TARGET_PRECONDITION_FAILED', r => r.expectedTargetDigest = intendedResultDigest],
    ['RECEIPT_UNAVAILABLE', r => r.receiptAvailable = false],
    ['AUTHORITY_INVALID', r => r.authority.operations = '*'],
  ];
  for (const [reason, mutate] of cases) {
    const input = clone(request); mutate(input); const result = await evaluateReviewerAdmission(input);
    assert.equal(result.admitted, false, reason); assert.ok(result.reasonCodes.includes(reason), JSON.stringify(result));
    assert.notEqual(result.bindingDigest, (await evaluateReviewerAdmission(request)).bindingDigest);
  }
  const input = clone(request); const pending = evaluateReviewerAdmission(input); input.authority.status = 'revoked';
  assert.equal((await pending).admitted, true, 'evaluation captures the supplied serialized state before asynchronous hashing');
});

test('authorized correction creates fresh evidence and requires fresh review and authority', async () => {
  const replacement = await buildReviewerContext({ ...contextInput, corpusRevision: 'corpus-2', sources: [{ id: 'a', revision: '2', content: 'corrected' }], selectedSourceIds: ['a'] });
  const correction = { actor: { id: 'reviewer', class: 'human' }, authorizedReviewerIds: ['reviewer'], predecessor: context,
    replacement, predecessorDecisionId: 'decision-1', challengeId: 'challenge-1', rationale: 'Correct flawed source', at };
  assert.equal((await evaluateReviewerCorrection(correction)).admitted, true);
  assert.equal((await evaluateReviewerCorrection({ ...correction, replacement: context })).admitted, false);
  assert.equal((await evaluateReviewerCorrection({ ...correction, actor: { id: 'intruder', class: 'human' } })).admitted, false);
  const stale = clone(request); stale.context = replacement; stale.expectedContextDigest = replacement.contextDigest; stale.corpusRevision = 'corpus-2';
  assert.ok((await evaluateReviewerAdmission(stale)).reasonCodes.includes('DECISION_BINDING_MISMATCH'));
});

test('canonical evidence retains hostile JSON keys', () => {
  assert.equal(reviewerCanonicalBytes(JSON.parse('{"__proto__":{"x":1},"a":2}')), '{"__proto__":{"x":1},"a":2}');
});

test('governance adapter serializes concurrent append and rejects duplicate record identities', async () => {
  const store = new InMemoryGovernanceStore();
  const record = (n, id = `record-${n}`) => buildGovernedRecord({ recordId: id, recordType: 'test', payload: { n },
    receiptRole: buildStateChangeReceipt({ receiptId: `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`,
      operationId: `01900000-0000-7000-8001-${String(n).padStart(12, '0')}`, actor: { id: 'actor', class: 'human' },
      operation: 'test', targets: [{ id: 'target', beforeDigest: targetDigest }], authorityRef: 'authority', policy,
      nondeterministicEscalated: false, occurredAt: at }) });
  const results = await Promise.all(Array.from({ length: 12 }, (_, n) => store.append(record(n + 1), { idempotencyKey: `key-${n}` })));
  assert.ok(results.every(r => r.committed)); assert.equal(store.snapshot().records.length, 12); assert.equal(store.snapshot().version, 12);
  assert.equal((await store.append(record(20, 'record-1'), { idempotencyKey: 'duplicate' })).committed, false);
  const race = new InMemoryGovernanceStore(); const expectedDigest = race.snapshot().digest;
  const guarded = await Promise.all([1, 2].map(n => race.append(record(n), { idempotencyKey: `key-${n}`, expectedDigest })));
  assert.equal(guarded.filter(r => r.committed).length, 1);
});
