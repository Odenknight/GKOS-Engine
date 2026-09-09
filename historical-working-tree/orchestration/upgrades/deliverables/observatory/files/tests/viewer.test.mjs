import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {projectRecords,replayToRenderer} from '../web/adapter.mjs';
const manifest=JSON.parse(readFileSync(new URL('../corpus/build/public/manifest.json',import.meta.url)));
test('viewer projection excludes protected content and topology even if given catalog nodes',()=>{
 const graph=projectRecords(manifest.records);const protectedIds=manifest.records.filter(r=>r.visibility!=='public').map(r=>r.id);
 assert.ok(graph.nodes.length>0);for(const id of protectedIds){assert.ok(!graph.nodes.some(n=>n.id===id));assert.ok(!graph.links.some(l=>l.source===id||l.target===id));}
});
test('every canonical replay uses one adapter and does not mutate source or send non-public refs',()=>{
 for(const scenario of manifest.scenarios){
 const bundle=JSON.parse(readFileSync(new URL(`../corpus/build/public/replays/${scenario.id}.json`,import.meta.url)));const before=JSON.stringify(bundle);let clears=0;const calls=[];
 replayToRenderer({clearTraversalObservability(){clears++;},notifyAgentTraversal(...args){calls.push(args);}},bundle.receipt.events,bundle.receipt.events.length,manifest.records);
 assert.equal(clears,1);assert.equal(JSON.stringify(bundle),before);for(const [paths,type,actor,replay] of calls){assert.equal(replay,true);assert.ok(bundle.receipt.events.some(e=>e.event_type===type&&e.actor_role===actor));assert.ok(manifest.records.some(r=>r.visibility==='public'&&paths[0]===`${r.kind}/${r.id}.md`));}
 }
});
test('local identity patch and historical upstream coordinate retain explicit byte integrity',()=>{
 const base=new URL('../web/vendor/kosmos-oden/',import.meta.url);const p=JSON.parse(readFileSync(new URL('PROVENANCE.json',base)));
 assert.equal(createHash('sha256').update(readFileSync(new URL('renderer.mjs',base))).digest('hex'),p.bundle_sha256);
 for(const [path,digest] of Object.entries(p.inputs))assert.equal(createHash('sha256').update(readFileSync(new URL('source/'+path,base))).digest('hex'),digest,path);
 assert.equal(p.renderer_core_modified,true);
 assert.equal(p.commit,'50ebc3c168cf4e34137faf47e0b297b00db1a753');
 assert.equal(p.upstream_bundle_sha256,'c656bfe86a59c0bdc5f9c13b55d6fbda5a7f19cc2ef863880306b777dcb8b86c');
 assert.match(p.local_patch,/consumer-stable-identity-v1/);
 assert.deepEqual(Object.keys(p.inputs).sort(),Object.keys(p.upstream_inputs).sort());
 assert.deepEqual(Object.keys(p.inputs).filter(key=>p.inputs[key]!==p.upstream_inputs[key]),['src/renderer/renderer.ts']);
});
