import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateReviewerAdmission} from '../dist/governance.mjs';
import {request} from './fixtures/reviewer-v2.mjs';

test('role separation rejects noncanonical identities and equivalent model-family labels', async()=>{
 for(const change of [r=>r.proposal.proposerId='reviewer ',r=>{r.proposal.proposerId='José';r.review.reviewerId='Jose\u0301';},r=>r.review.reviewerId='rev\u2028iewer',r=>{r.review.reviewerClass='agent';r.review.proposerModelFamily='GPT';r.review.reviewerModelFamily='gpt';}]){
  const r=structuredClone(request);change(r);assert.equal((await evaluateReviewerAdmission(r)).admitted,false);
 }
 assert.equal((await evaluateReviewerAdmission(request)).admitted,true);
});

test('unrepresentable admission input rejects before any repaired-input digest can be produced',async()=>{
 for(const value of [NaN,Infinity,-0,0.5,'\ud800']){
  const r=structuredClone(request);r.extra=value;
  await assert.rejects(evaluateReviewerAdmission(r),TypeError);
 }
});
