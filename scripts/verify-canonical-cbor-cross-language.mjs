// Development cross-language gate. Missing Python/Unicode prerequisites fail,
// rather than silently skip; this is not the governed reviewer-case suite.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {encodeCanonicalCbor,decodeCanonicalCbor,digestCanonicalCbor} from '../dist/canonical-cbor.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const python=process.env.GKOS_CANONICAL_PYTHON;
assert.ok(python,'GKOS_CANONICAL_PYTHON must name the reviewed Python environment; no skip fallback');
const vectors=JSON.parse(await readFile(new URL('../test/canonical-cbor-vectors.json',import.meta.url),'utf8'));
const ast=node=>node.kind==='integer'?{...node,value:BigInt(node.value)}:node.kind==='bytes'?{...node,value:new Uint8Array(Buffer.from(node.value,'hex'))}:node.kind==='array'?{...node,items:node.items.map(ast)}:node.kind==='map'?{...node,entries:node.entries.map(([k,v])=>[k,ast(v)])}:node;
const view=node=>node.kind==='integer'?{...node,value:node.value.toString()}:node.kind==='bytes'?{...node,value:Buffer.from(node.value).toString('hex')}:node.kind==='array'?{...node,items:node.items.map(view)}:node.kind==='map'?{...node,entries:node.entries.map(([k,v])=>[k,view(v)])}:node;
const invoke=args=>{
 const result=spawnSync(python,[join(root,'scripts','verify-canonical-cbor.py'),...args],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:30000});
 assert.ifError(result.error);
 assert.equal(result.signal,null,'verifier did not finish');
 let record;try{record=JSON.parse(result.stdout);}catch{assert.fail('verifier emitted non-JSON: '+result.stderr.slice(0,300));}
 return {status:result.status,record};
};
const work=await mkdtemp(join(tmpdir(),'cbor-x-'));
let positive=0,negative=0,roundtrips=0,pairedValues=0;
try{
 for(const item of vectors.positive){
  const bytes=new Uint8Array(Buffer.from(item.hex,'hex'));
  assert.equal(Buffer.from(encodeCanonicalCbor(ast(item.node))).toString('hex'),item.hex,item.label);
  const check=invoke(['--hex',item.hex]);assert.equal(check.status,0,item.label+': '+JSON.stringify(check.record));
  assert.equal(check.record.rendering_format,'gkos.cbor.typed-json.v1');assert.equal(check.record.algorithm,'sha-256');assert.equal(check.record.canonical_profile,'GKX-CBOR-1');
  assert.deepEqual(check.record.node,view(decodeCanonicalCbor(bytes)),item.label);
  assert.equal(check.record.digest,createHash('sha256').update(bytes).digest('hex'));assert.equal(check.record.digest,digestCanonicalCbor(bytes).digest);
  const file=join(work,'render.json');await writeFile(file,JSON.stringify(check.record));const replay=invoke(['--render',file]);assert.equal(replay.status,0);assert.equal(replay.record.canonical_hex,item.hex);positive++;roundtrips++;
 }
 for(const item of vectors.negative){
  assert.throws(()=>decodeCanonicalCbor(new Uint8Array(Buffer.from(item.hex,'hex'))),error=>error.code===item.code,item.label);
  const check=invoke(['--hex',item.hex]);assert.equal(check.status,1,item.label);assert.equal(check.record.verified,false);assert.equal(check.record.code,item.code);negative++;
 }
 // Deterministic independently observed number/type corpus; no random seed,
 // mutable runtime lookup or live model output participates in canonical bytes.
 const numbers=[0,1,-1,1.5,-4,65504,2**-24,2**-14,100000,Math.PI,Number.MIN_VALUE,Number.MAX_VALUE,1+2**-52];
 for(let n=1;n<=48;n++)numbers.push(n/7,-n/13,n*2**-20);
 const mixed={kind:'array',items:[...numbers.map(value=>({kind:'float',value})),...[-18446744073709551616n,-1n,0n,23n,24n,255n,256n,18446744073709551615n].map(value=>({kind:'integer',value}))]};
 const data=encodeCanonicalCbor(mixed);const check=invoke(['--hex',Buffer.from(data).toString('hex')]);assert.equal(check.status,0);assert.deepEqual(check.record.node,view(decodeCanonicalCbor(data)));pairedValues=mixed.items.length;
 const file=join(work,'mixed.json');await writeFile(file,JSON.stringify(check.record));const replay=invoke(['--render',file]);assert.equal(replay.status,0);assert.equal(replay.record.canonical_hex,Buffer.from(data).toString('hex'));roundtrips++;
 const tampered={...check.record,digest:'0'.repeat(64)};await writeFile(file,JSON.stringify(tampered));const refuse=invoke(['--render',file]);assert.equal(refuse.status,1);assert.equal(refuse.record.code,'GKOS-GATE-L6-007');negative++;
 console.log(JSON.stringify({scope:'canonical-byte development adapter; no profile or pilot disposition',positive_vectors:positive,negative_vectors_and_tamper:negative,rendering_roundtrips:roundtrips,paired_numeric_values:pairedValues,node:process.versions.node,node_unicode:process.versions.unicode}));
}finally{await rm(work,{recursive:true,force:true});}
