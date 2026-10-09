import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {decodeCanonicalCbor} from '../dist/canonical-cbor.mjs';

test('both CBOR decoders reject nontext map keys before interpreting their contents',()=>{
 for(const hex of ['a1f97e00f6','a1f98000f6','a18161fff6','a1816365cc81f6']){
  let code;try{decodeCanonicalCbor(new Uint8Array(Buffer.from(hex,'hex')));}catch(error){code=error.code;}
  assert.equal(code,'GKOS-GATE-L6-001');
  const result=spawnSync(process.env.PYTHON||'python',['scripts/verify-canonical-cbor.py','--hex',hex],{encoding:'utf8',timeout:5000});
  assert.equal(result.error,undefined);const refusal=JSON.parse(result.stdout);assert.equal(refusal.verified,false);assert.equal(refusal.code,code,hex);
 }
});
