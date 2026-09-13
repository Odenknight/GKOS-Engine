import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildGraph} from '../dist/gkos-engine.mjs';
import {buildServiceGraphitiManifest,buildServiceGraphitiQueryContext} from '../dist/service-node.mjs';
const at='2026-09-13T00:00:00.000Z';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
function fixture(){
  const sourceRecords=['public','secret'].map((level,i)=>({relativePath:level+'.md',content:
    `---\r\ngkx_version: "2.3"\r\nuid: "550e8400-e29b-41d4-a716-44665544910${i}"\r\ntitle: ${level}\r\ntype: note\r\ncreated_at: ${at}\r\nepistemic_state: observation\r\nsensitivity: ${level}\r\n---\r\n${level} café 🌌`}));
  const input={identity:{credentialId:'test',agentId:'test-agent',agentLabel:'Test',sensitivityCeiling:'public',capabilities:['graphiti.read'],revoked:false},
    corpus:{graph:buildGraph(sourceRecords,[]),sourceRecords,generation:1,evaluationTime:at},
    authorization:{configured:true,generation:1,policyDigest:'sha256:'+'a'.repeat(64)},evaluationTime:at};
  return {input,bytes:new Map(sourceRecords.map(s=>[s.relativePath,Buffer.from(s.content)]))};
}
test('service ingestion derives the entire permitted export with exact original source bytes',async()=>{
  const f=fixture(), reads=[];
  const result=await buildServiceGraphitiManifest(f.input,{get(path){reads.push(path);return f.bytes.get(path);}});
  assert.deepEqual(reads,['public.md']);
  assert.equal(result.manifest.length,1);
  assert.equal(result.manifest[0].source_digest,hash(f.bytes.get('public.md')));
  assert.equal(result.episodes.length,1);
  assert.equal(JSON.stringify(result).includes('secret'),false);
  const body=JSON.parse(result.episodes[0].episode_body);
  assert.match(body.content,/public café 🌌/);
  assert.equal(body.content.includes('gkx_version'),false);
});
test('service ingestion refuses stale, missing, invalid bytes and ambiguous source identities',async()=>{
  for(const mutate of [
    f=>f.bytes.set('public.md',Buffer.from('changed')),
    f=>f.bytes.delete('public.md'),
    f=>f.bytes.set('public.md',Buffer.from([255])),
    f=>f.input.corpus.sourceRecords.push({...f.input.corpus.sourceRecords[0]}),
    f=>{f.input.corpus.graph.nodes.find(n=>n.path==='secret.md').gkx.uid=f.input.corpus.graph.nodes.find(n=>n.path==='public.md').gkx.uid;},
    f=>{f.input.identity.revoked=true;},
    f=>{f.input.identity.capabilities=[];},
  ]){
    const f=fixture();mutate(f);
    await assert.rejects(buildServiceGraphitiManifest(f.input,f.bytes),{code:'GKOS_SERVICE_ACCESS_DENIED'});
  }
});
test('source bytes and export envelopes are captured before asynchronous hashing',async()=>{
  const f=fixture();
  const expected=await buildServiceGraphitiManifest(f.input,f.bytes);
  const pending=buildServiceGraphitiManifest(f.input,f.bytes);
  f.bytes.get('public.md').fill(0);
  f.input.corpus.sourceRecords[0].content='changed';
  assert.deepEqual(await pending,expected);
});

async function publishedFixture(){
  const f=fixture();
  const prepared=await buildServiceGraphitiManifest(f.input,f.bytes);
  const authority={corpus_id:'synthetic-service',scope_digest:'sha256:'+'b'.repeat(64),configuration_digest:'sha256:'+'c'.repeat(64)};
  const binding={...authority,policy_digest:f.input.authorization.policyDigest,source_snapshot_digest:prepared.source_snapshot_digest};
  const run=spawnSync('python',['-X','utf8','-c',`
import sys,json,tempfile
from ledger import Ledger,digest
data=json.load(sys.stdin)
with tempfile.TemporaryDirectory() as directory:
 ledger=Ledger(directory,create=True)
 binding,manifest=data['binding'],data['manifest']
 job=ledger.enqueue(binding,manifest)
 lease=ledger.claim(job,binding)
 mappings=[dict(source_id=item['source_id'],source_digest=item['source_digest'],projection_episode_id='episode:'+str(i)) for i,item in enumerate(manifest)]
 receipt=dict(binding=binding,projection_id=lease['projection_id'],mappings=mappings,milestone='persistence-verified',searchability='unverified')
 ledger.observe(job,lease['token'],binding,mappings,digest(receipt))
 ledger.publish(job,binding)
 print(json.dumps(ledger.read(job,binding)))
 ledger.close()
`],{cwd:new URL('../services/gkos-graphiti/',import.meta.url),input:JSON.stringify({binding,manifest:prepared.manifest}),encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  return {...f,authority,publication:JSON.parse(run.stdout)};
}
test('published Python ledger reconciles with the current authorized service manifest',async()=>{
  const f=await publishedFixture();
  const context=await buildServiceGraphitiQueryContext(f.input,f.bytes,f.authority,f.publication);
  assert.equal(context?.complete_dependency_scope,true);
  assert.equal(context.status.searchable,true);
  assert.equal(context.authorized_episodes.size,1);
  assert.equal(context.authorized_episodes.get('episode:0').source_digest,hash(f.bytes.get('public.md')));
});
test('published service reconciliation rejects changed authority, incomplete mappings and forged receipts',async()=>{
  const base=await publishedFixture();
  for(const mutate of [
    f=>{f.authority.configuration_digest='sha256:'+'d'.repeat(64);},
    f=>{f.input.authorization.policyDigest='sha256:'+'d'.repeat(64);},
    f=>{f.publication.mappings=[];},
    f=>{f.publication.observation='sha256:'+'d'.repeat(64);},
    f=>{f.publication.mappings[0].source_id='other';},
    f=>{f.publication.binding.source_snapshot_digest='sha256:'+'d'.repeat(64);},
    f=>{f.bytes.set('public.md',Buffer.from('stale'));},
    f=>{f.input.identity.revoked=true;},
  ]){
    const f=structuredClone(base);mutate(f);
    assert.equal(await buildServiceGraphitiQueryContext(f.input,f.bytes,f.authority,f.publication),null);
  }
});
