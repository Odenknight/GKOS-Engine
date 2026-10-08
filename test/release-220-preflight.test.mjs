import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { REQUIRED_GATES, validateApproval, verifyArtifact, parsePackReport } from '../scripts/release-220-preflight.mjs';
const commit = 'a'.repeat(40), hash = 'b'.repeat(64);
test('pack report accepts npm 12 and legacy single-package reports and rejects ambiguity', () => {
  const report = { name:'gkos-engine', version:'2.2.0' };
  assert.deepEqual(parsePackReport(JSON.stringify({'gkos-engine':report})), report);
  assert.deepEqual(parsePackReport(JSON.stringify([report])), report);
  for (const value of [null, {}, [], [report, report], {other:report}, {'gkos-engine':report, other:report}, {'gkos-engine':{...report,version:'2.2.1'}}]) assert.throws(()=>parsePackReport(JSON.stringify(value)));
});
function approval() {
  return { schema:'gkos-engine-release-approval/2.2.0',package:'gkos-engine',version:'2.2.0',tag:'v2.2.0',sourceCommit:commit,tarballSha256:hash,tarballIntegrity:'sha512-'+'A'.repeat(86)+'==',fileInventorySha256:hash,evidenceBundleSha256:hash,evidenceArtifactId:123,ownerNpmLogin:'odenknight',gates:REQUIRED_GATES.map(name=>({name,status:'PASS',sourceCommit:commit,receiptSha256:hash,evidenceUrl:'https://github.com/Odenknight/GKOS-Engine/actions/runs/123',...(name==='soak-24h'?{durationSeconds:86400,unexplainedFailures:0}:{})}))};
}
test('release approval rejects omitted/failed/duplicate gates, short soak, different commit or artifact', () => {
  assert.equal(validateApproval(approval(),commit).sourceCommit,commit);
  for (const mutate of [
    r=>r.gates.pop(), r=>r.gates.push(r.gates[0]), r=>r.gates[0].status='FAIL',
    r=>r.gates[0].sourceCommit='c'.repeat(40), r=>r.gates.find(x=>x.name==='soak-24h').durationSeconds=86399,
    r=>r.gates.find(x=>x.name==='soak-24h').unexplainedFailures=1,
    r=>r.version='2.2.1', r=>r.ownerNpmLogin='other', r=>r.evidenceArtifactId=0,
  ]) { const record=approval(); mutate(record); assert.throws(()=>validateApproval(record,commit)); }
  assert.throws(()=>validateApproval(approval(),'c'.repeat(40)));
  assert.throws(()=>validateApproval(null,commit));
  assert.throws(()=>verifyArtifact(approval(),Buffer.from('different'),{}));
});
test('artifact verification binds both digests and exact bounded inventory', () => {
  const bytes=Buffer.from('synthetic archive fixture'), files=[{path:'package.json',size:20,mode:420}];
  const record=approval();
  record.tarballSha256=createHash('sha256').update(bytes).digest('hex');
  record.tarballIntegrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
  record.fileInventorySha256=createHash('sha256').update(JSON.stringify(files)).digest('hex');
  const report={name:'gkos-engine',version:'2.2.0',filename:'gkos-engine-2.2.0.tgz',size:bytes.length,unpackedSize:20,files};
  assert.equal(verifyArtifact(record,bytes,report).fileCount,1);
  assert.throws(()=>verifyArtifact(record,bytes,{...report,files:[...files,...files]}));
  for(const path of ['.npmrc','src/.env','../escape','private/key.pem','state.sqlite']) {
    assert.throws(()=>verifyArtifact(record,bytes,{...report,files:[{path,size:20,mode:420}]}));
  }
});
