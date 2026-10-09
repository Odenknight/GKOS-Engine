import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildReviewerArtifactsV2,buildReviewerProposalBasisV1,evaluateReviewerAdmissionV2} from '../dist/governance-artifacts.mjs';
import {reviewerCanonicalBytes,buildReviewerContext,evaluateReviewerCorrection} from '../dist/governance.mjs';
import {contextInput} from './fixtures/reviewer-v2.mjs';
import {native} from './fixtures/reviewer-artifact-basis.mjs';
const hash=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const rebind=b=>{const p=b.proposalBasis.record,r=b.request;p.intended_result_digest=hash(p.markdown);r.intendedResultDigest=r.proposal.intendedResultDigest=r.authority.intendedResultDigest=p.intended_result_digest;r.proposal.digest=r.review.proposalDigest=r.authority.proposalDigest=hash(reviewerCanonicalBytes(p));};
test('complete producer fields bind the authority source, not a projected digest',()=>{
 const original=native();
 for(const mutate of [p=>p.sequence++,p=>p.created_at='2026-10-06T12:00:01Z',p=>p.context_id='other',p=>p.expected_outcome='other',p=>p.base_target.version++,p=>p.markdown+='\r\n',p=>p.stimulus_metadata={markdown:'captured',confidence_percent:99,kind:'fixed-synthetic-automation-bias-stimulus'}]) {
  const b=structuredClone(original);mutate(b.proposalBasis.record);assert.throws(()=>buildReviewerArtifactsV2(b));rebind(b);const changed=buildReviewerArtifactsV2(b);assert.notDeepEqual(changed.authority.document.authority_source_ref,original.artifacts.authority.document.authority_source_ref);
 }
 const b=structuredClone(original);b.proposalBasis.record.markdown='e\u0301\r\n';rebind(b);const packet=buildReviewerProposalBasisV1(b.proposalBasis,b.request,b.artifacts.context);assert.equal(new TextDecoder().decode(packet.document.record_bytes),reviewerCanonicalBytes(b.proposalBasis.record));
});
test('new authority rejects missing, unknown, downgraded, and malformed full basis',async()=>{
 for(const mutate of [b=>delete b.proposalBasis,b=>b.proposalBasis.profile='opaque-legacy',b=>b.proposalBasis.schemaVersion='0',b=>b.proposalBasis.record.proposal_digest=b.request.proposal.digest,b=>b.proposalBasis.record.extra='unregistered',b=>b.proposalBasis.record.base_target.version=true,b=>b.proposalBasis.record.intended_result_digest=hash('wrong')]) {
  const b=native();mutate(b);const decision=await evaluateReviewerAdmissionV2(b);assert.equal(decision.admitted,false);assert.ok(decision.reasonCodes.includes('PROPOSAL_BASIS_INVALID'));
 }
});
test('admission snapshots the complete basis before asynchronous hashing',async()=>{
 const b=native(),expected=await evaluateReviewerAdmissionV2(structuredClone(b));const pending=evaluateReviewerAdmissionV2(b);b.proposalBasis.record.markdown='tampered after call';b.proposalBasis.record.base_target.version=999;const actual=await pending;assert.equal(actual.admitted,true);assert.equal(actual.bindingDigest,expected.bindingDigest);
});
test('correction standing is independently recomputed before authority use',async()=>{
 const b=native(),p=b.proposalBasis.record,c=structuredClone(b.request.context);
 const sources=structuredClone(contextInput.sources);sources[0].content+=' predecessor';const predecessor=await buildReviewerContext({...contextInput,sources});
 p.kind='correction';p.challenge_id='challenge';p.parent_proposal_id='predecessor';p.correction_request={actor:{id:p.actor_id,class:'agent'},authorizedReviewerIds:[p.actor_id],predecessor,replacement:c,predecessorDecisionId:'decision',challengeId:'challenge',rationale:'captured correction',at:p.created_at};
 p.correction_evaluation=structuredClone(await evaluateReviewerCorrection(p.correction_request));assert.equal(p.correction_evaluation.admitted,true);rebind(b);b.artifacts=buildReviewerArtifactsV2(b);assert.equal((await evaluateReviewerAdmissionV2(b)).admitted,true);
 p.correction_evaluation.bindingDigest=hash('forged evaluation');rebind(b);b.artifacts=buildReviewerArtifactsV2(b);const denied=await evaluateReviewerAdmissionV2(b);assert.equal(denied.admitted,false);assert.ok(denied.reasonCodes.includes('PROPOSAL_BASIS_INVALID'));assert.ok(!denied.diagnostics.some(v=>v.reason==='PROPOSAL_BASIS_INVALID'));
 p.correction_evaluation.admitted=false;assert.throws(()=>buildReviewerArtifactsV2(b));
});

test('nonrepresentable full basis rejects before any decision or invented digest',async()=>{
 for(const value of [NaN,Infinity,-0,.5,'\ud800',new Date()]) {
  const b=native();b.proposalBasis.record.extra=value;await assert.rejects(evaluateReviewerAdmissionV2(b),TypeError);
 }
});
