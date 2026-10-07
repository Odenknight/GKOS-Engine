import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {native} from '../test/fixtures/reviewer-artifact-basis.mjs';
import {buildReviewerUseRecordV2,buildReviewerRefusalRecordV2} from '../dist/governance-artifacts.mjs';
const python=process.env.GKOS_CANONICAL_PYTHON;
if(!python)throw Error('GKOS_CANONICAL_PYTHON required; no skipped qualification');
const b=native(),at=b.request.at;
const packets=[...Object.values(b.artifacts),buildReviewerUseRecordV2(b,{id:'observed-use',at,outcome:'completed',recoveryKind:'correction'}),buildReviewerRefusalRecordV2(b,{id:'observed-refusal',at,diagnostic:{code:'GKOS-GATE-L6-006',requirementId:'GKOS-CANON-006',reason:'reference-mismatch'},predicateId:'canonical-boundary',predicateVersion:'2'})];
const directory=await mkdtemp(join(tmpdir(),'reviewer-artifacts-python-'));
const results=[];
try {
  for(const packet of packets) {
    const path=join(directory,packet.document.artifact_type+'.json');
    await writeFile(path,JSON.stringify(packet.rendering));
    const run=spawnSync(python,['scripts/verify-canonical-cbor.py','--render',path],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr+run.stdout);
    const checked=JSON.parse(run.stdout);
    assert.equal(checked.canonical_hex,packet.canonicalHex);
    assert.equal(checked.digest,packet.digest.value);
    const wrong=structuredClone(packet.rendering);wrong.digest='0'.repeat(64);
    await writeFile(path,JSON.stringify(wrong));
    const denied=spawnSync(python,['scripts/verify-canonical-cbor.py','--render',path],{encoding:'utf8'});
    assert.equal(denied.status,1);
    assert.equal(JSON.parse(denied.stdout).code,'GKOS-GATE-L6-007');
    results.push({role:packet.document.artifact_type,digest:packet.digest.value,canonical_bytes:packet.canonicalHex.length/2,rendering_roundtrip:'PASS',displayed_hash_tamper:'REFUSED'});
  }
  console.log(JSON.stringify({status:'PASS',scope:'five canonical-byte/rendering roles; not independent authority or full schema replay',results},null,2));
} finally {await rm(directory,{recursive:true,force:true});}
