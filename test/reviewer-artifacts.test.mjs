import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {gkosArtifactEncode,gkosArtifactValidate,gkosCapturedInputDigest,buildReviewerArtifactsV2,buildReviewerContextArtifactsV2,evaluateReviewerAdmissionV2,buildReviewerUseRecordV2,buildReviewerRefusalRecordV2,evaluateReviewerRetention} from '../dist/governance-artifacts.mjs';
import {encodeCanonicalCbor,decodeCanonicalCbor} from '../dist/canonical-cbor.mjs';
import {reviewerCanonicalDigest,buildReviewerContext} from '../dist/governance.mjs';
import {request,contextInput,at,expiresAt} from './fixtures/reviewer-v2.mjs';
const clone=structuredClone;
import {basis,retention,native} from './fixtures/reviewer-artifact-basis.mjs';
// Unsupported actual hosts execute a fail-closed test; they do not qualify positive artifacts.
if(!['17.0','17.0.0'].includes(process.versions.unicode)) {
  test('actual unsupported Unicode profile cannot establish canonical reviewer authority',async()=>{
    assert.throws(()=>gkosArtifactEncode({artifact_type:'context-manifest'}),e=>e.code==='GKOS-GATE-L6-005');
    const decision=await evaluateReviewerAdmissionV2({...clone(basis),artifacts:{selection:{canonicalHex:'f6'},context:{canonicalHex:'f6'},authority:{canonicalHex:'f6'}}});
    assert.equal(decision.admitted,false);assert.equal(decision.bindingDigest,null);assert.ok(decision.diagnostics.some(d=>d.code==='GKOS-GATE-L6-005'));
  });
} else {
test('five adopted artifact roles have exact CBOR identity and complete readable packets',async()=>{
  const b=native(),decision=await evaluateReviewerAdmissionV2(b);assert.equal(decision.admitted,true,JSON.stringify(decision));
  for(const artifact of Object.values(b.artifacts)) {
    assert.deepEqual(gkosArtifactValidate(artifact),artifact);
    assert.equal(createHash('sha256').update(Buffer.from(artifact.canonicalHex,'hex')).digest('hex'),artifact.digest.value);
  }
  const use=buildReviewerUseRecordV2(b,{id:'use1',at,outcome:'completed',recoveryKind:'correction'});
  assert.equal(use.document.artifact_type,'authorized-use-record');assert.deepEqual(use.document.context_manifest_ref,b.artifacts.context.reference);
  const refusal=buildReviewerRefusalRecordV2(b,{id:'refused1',at,diagnostic:{code:'GKOS-GATE-L6-006',requirementId:'GKOS-CANON-006',reason:'bad-link'},predicateId:'artifact-link',predicateVersion:'2'});
  assert.equal(gkosArtifactValidate(refusal).document.result,'refused');
  assert.throws(()=>buildReviewerRefusalRecordV2(b,{id:'bad',at,diagnostic:{code:'GKOS-GATE-L6-999',requirementId:'GKOS-CANON-006',reason:'bad'},predicateId:'p',predicateVersion:'1'}));
});
test('context exists before proposal and exact reviewed bytes survive action-time and revocation changes',async()=>{
  const b=native(),r=b.request;
  const early=buildReviewerContextArtifactsV2({...r,purpose:r.requestedEffect.purpose,recipientId:r.actor.id,selectedById:r.proposal.proposerId,compilerRef:b.compilerRef});
  assert.deepEqual(early.context,b.artifacts.context);
  r.at='2026-10-06T13:00:00Z';b.retention.at=r.at;
  assert.deepEqual(buildReviewerArtifactsV2(b),b.artifacts);
  assert.equal((await evaluateReviewerAdmissionV2(b)).admitted,true);
  r.authority.status='revoked';assert.deepEqual(buildReviewerArtifactsV2(b),b.artifacts);
  const denied=await evaluateReviewerAdmissionV2(b);assert.ok(denied.reasonCodes.includes('AUTHORITY_REVOKED'));assert.ok(!denied.reasonCodes.includes('CANONICAL_ARTIFACT_BINDING_MISMATCH'));
});
test('actual context selector and proposing actor retain distinct identities and classes',async()=>{
  const b=clone(basis);b.selectedById=b.request.review.reviewerId;b.selectedByClass='human';b.proposingActorClass='human';
  b.artifacts=buildReviewerArtifactsV2(b);
  assert.deepEqual(b.artifacts.selection.document.selected_by,{actor_id:b.request.review.reviewerId,actor_class:'human'});
  assert.equal((await evaluateReviewerAdmissionV2(b)).admitted,true);
  const use=buildReviewerUseRecordV2(b,{id:'human-proposed',at:'2026-10-06T12:00:00.000001Z',outcome:'completed',recoveryKind:'correction'});
  assert.deepEqual(use.document.proposing_actor,{actor_id:b.request.proposal.proposerId,actor_class:'human'});
  assert.equal(use.document.acted_at,'2026-10-06T12:00:00.000001Z');
});
test('V2 refuses canonical artifact substitution, private JSON alternate path, unimplemented required recovery and stale escalation',async()=>{
  for(const mutate of [b=>delete b.artifacts,b=>b.artifacts.context=b.artifacts.selection,b=>b.request.authoritativeSources[0].revision='2',b=>b.compilerRef.component_version='new',b=>b.requiredRecoveryKinds.push('compensation'),b=>delete b.retention]) {
    const b=native();mutate(b);assert.equal((await evaluateReviewerAdmissionV2(b)).admitted,false);
  }
  const b=native();b.request.review.mandatoryEscalation=true;b.request.review.humanEscalationResolved=true;
  assert.equal((await evaluateReviewerAdmissionV2(b)).admitted,false);
  b.escalation={required:true,resolution:'resolved',resolverId:'reviewer',resolutionRecordId:'resolution1',resolverClass:'human',evidenceDigest:b.request.expectedReviewEvidenceDigest,proposalId:b.request.proposal.id,contextDigest:b.request.context.contextDigest,policyDigest:b.request.policy.digest,validUntil:expiresAt};
  assert.equal((await evaluateReviewerAdmissionV2(b)).admitted,true);
  b.escalation.proposalId='old';assert.equal((await evaluateReviewerAdmissionV2(b)).admitted,false);
});
test('V2 product readiness holds retain refusal evidence without fabricating supersession diagnostics',async()=>{
  for(const field of ['executionState','challengeDisposition']) {
    const b=native();b.request[field]=field==='executionState'?'uncertain':'open';
    const decision=await evaluateReviewerAdmissionV2(b);
    assert.equal(decision.admitted,false);
    assert.equal(decision.diagnostics.length,0);
    assert.equal(decision.productRefusals.length,1);
    assert.ok(decision.readinessPredicates.some(p=>p.outcome==='held'));
  }
});
test('generic control failures remain restrictive product evidence without claiming supersession applicability',async()=>{
  for(const mutate of [b=>b.request.controls.predicate.outcome='major',b=>b.request.controls.predicate.version='',b=>{b.request.controls.predicate.outcome='indeterminate';b.request.controls.checker.kind='nondeterministic';b.request.controls.checker.recommendation='relax';}]) {
    const b=native();mutate(b);const gate=await evaluateReviewerAdmissionV2(b);
    assert.equal(gate.admitted,false);assert.equal(gate.diagnostics.length,0);
    assert.ok(gate.productRefusals.length>0);assert.match(gate.productRefusals[0].scope,/supersession applicability not established/);
    assert.ok(gate.bindingDigest);
  }
});
test('N19 malformed wire variants fail canonical gates before establishing an artifact',async()=>{
  const cases=[['bf616101ff','GKOS-GATE-L6-001'],['a2616101616102','GKOS-GATE-L6-002'],['a2616201616102','GKOS-GATE-L6-002'],['f97e00','GKOS-GATE-L6-003'],['f97c00','GKOS-GATE-L6-003'],['f98000','GKOS-GATE-L6-003'],['61ff','GKOS-GATE-L6-005'],['6365cc81','GKOS-GATE-L6-005'],['1817','GKOS-GATE-L6-001']];
  for(const [canonicalHex,code] of cases) {
    assert.throws(()=>gkosArtifactValidate({canonicalHex}),e=>e.code===code);
    const b=native();b.artifacts.context={canonicalHex};const gate=await evaluateReviewerAdmissionV2(b);assert.equal(gate.admitted,false);assert.ok(gate.diagnostics.some(d=>d.code===code));
  }
});
test('N19 schema integers, declared sets, timestamps, null/absent fields, hashes and full rendering are enforced',()=>{
  const packet=native().artifacts.authority;
  const node=decodeCanonicalCbor(Buffer.from(packet.canonicalHex,'hex'));
  const scope=node.entries.find(([k])=>k==='effect_scope')[1];
  scope.entries.find(([k])=>k==='maximum_affected_count')[1]={kind:'float',value:1};
  assert.throws(()=>gkosArtifactValidate({canonicalHex:Buffer.from(encodeCanonicalCbor(node)).toString('hex')}),e=>e.code==='GKOS-GATE-L6-003');
  for(const mutate of [d=>d.valid_from='2026-02-30T12:00:00.000000Z',d=>d.authority_source_ref=null,d=>delete d.authority_source_ref,d=>d.unexpected=true,d=>d.permitted_action_classes.push(d.permitted_action_classes[0])]) {
    const document=clone(packet.document);mutate(document);assert.throws(()=>gkosArtifactEncode(document));
  }
  let p=clone(packet);p.rendering.node.entries.pop();assert.throws(()=>gkosArtifactValidate(p),e=>e.code==='GKOS-GATE-L6-008');
  p=clone(packet);p.rendering.digest='0'.repeat(64);assert.throws(()=>gkosArtifactValidate(p),e=>e.code==='GKOS-GATE-L6-007');
  p=clone(packet);p.reference.artifact_id='wrong';assert.throws(()=>gkosArtifactValidate(p),e=>e.code==='GKOS-GATE-L6-006');
  const selection=clone(native().artifacts.selection.document);selection.members[0].score_type='float';selection.members[0].score=.5;assert.equal(gkosArtifactEncode(selection).document.members[0].score,.5);
});
test('opaque captured source bytes preserve non-NFC and CRLF, without silently repairing surrogate evidence',async()=>{
  assert.notDeepEqual(gkosCapturedInputDigest('e\u0301'),gkosCapturedInputDigest('\u00e9'));
  assert.notDeepEqual(gkosCapturedInputDigest('x\r\n'),gkosCapturedInputDigest('x\n'));
  assert.throws(()=>gkosCapturedInputDigest('\ud800'));
  const b=clone(basis),sources=clone(contextInput.sources);sources[0].content='e\u0301\r\n';b.request.context=await buildReviewerContext({...contextInput,sources});
  b.request.authoritativeSources=sources;assert.doesNotThrow(()=>buildReviewerArtifactsV2(b));
});
test('mandatory retention evidence, conflicts, expiry and authorized disposition fail closed',async()=>{
  assert.equal((await evaluateReviewerRetention(retention)).admitted,true);
  for(const mutate of [r=>r.policy.requiredEvidenceIds={},r=>r.policy.requiredEvidenceIds=[null],r=>r.evaluation.evidence=[null],r=>r.manualHold=true,r=>r.evaluation.state='conflict',r=>r.evaluation.state='unavailable',r=>r.evaluation.evidence=[],r=>r.evaluation.evidence[0].content+='tamper',r=>r.at=expiresAt,r=>r.evaluation.policyDigest='wrong',r=>r.evaluation.dispositionId='release']) {
    const r=clone(retention);mutate(r);assert.equal((await evaluateReviewerRetention(r)).admitted,false);
  }
  const r=clone(retention);r.evaluation.predecessorId='conflicted';r.evaluation.dispositionId='release';
  r.disposition={id:'release',evaluationId:'conflicted',policyDigest:r.policy.digest,evidenceDigest:await reviewerCanonicalDigest(r.evaluation.evidence),actorId:'reviewer',actorClass:'human',decision:'release',at};
  assert.equal((await evaluateReviewerRetention(r)).admitted,true);
  r.evaluation.state='held';assert.equal((await evaluateReviewerRetention(r)).admitted,false);
  r.evaluation.state='clear';r.disposition.actorClass='agent';assert.equal((await evaluateReviewerRetention(r)).admitted,false);
});
}
