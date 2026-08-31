import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import {GkxIndex} from '../dist/gkos-engine.mjs';
import {buildVaultNavigationConfig} from '../dist/navigation.mjs';
import {createLocalServiceServer,defaultMcpAgentBinding,ServiceCredentialRegistry,MCP_PROTOCOL_VERSION} from '../dist/service-node.mjs';
import {ServiceMcpRuntime} from '../dist/service-node.mjs';
import {buildAuthorizedView,ServiceTraversalEventRing} from '../dist/service.mjs';
const AT='2026-08-30T12:00:00.000Z';
const TOKEN='content-test.'+'a'.repeat(52);
const HIDDEN='CONTENT-SECRET-CANARY-b953';
const BODY='bodyonlyneedle';
const LARGE='😀é漢字'.repeat(20000);
const note=(uid,title,sensitivity,body)=>'---\ngkx_version: "2.3"\nuid: "'+uid+'"\ntitle: "'+title+'"\ntype: note\ncreated_at: '+AT+'\nepistemic_state: observation\nsensitivity: '+sensitivity+'\n---\n'+body;
async function fixture({discoverFirst=true}={}) {
 let generation=1, policyDigest="sha256:"+"b".repeat(64);
 const sources=[
  {relativePath:'index.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449101','Index','public','[[Measurement]]')},
  {relativePath:'Measurement.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449102','Measurement','public',BODY+' '+LARGE)},
  {relativePath:'Second.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449103','Second','public',BODY+' second result')},
  {relativePath:'Hidden-'+HIDDEN+'.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449199',HIDDEN,'secret',HIDDEN+' '+BODY)}
 ];
 const config=await buildVaultNavigationConfig({configId:'018f47a3-7b5e-7c9d-8a1b-123456789abf',version:1,vaultId:'vault:content-test',promotedMocNames:[],createdAt:AT,createdBy:'system:test',policy:{id:'policy:test',version:'1.0.0',digest:'sha256:'+'b'.repeat(64)}});
 const credentials=new ServiceCredentialRegistry([defaultMcpAgentBinding(TOKEN,{credentialId:'credential:content',agentId:'018f47a3-7b5e-7c9d-8a1b-123456789abe',agentLabel:'Content test',sensitivityCeiling:'public',revoked:false,limits:{concurrentRequests:4,bucketCapacity:100,refillMs:10}})]);
 const server=createLocalServiceServer({credentials,navigationConfig:config,vaultId:'vault:content-test',status:()=>({state:'serving'}),authorization:async snapshot=>({configured:true,generation:snapshot.generation,policyDigest}),snapshot:async()=>{
  const index=new GkxIndex({defaultSensitivity:'secret'});index.setFiles(sources,[]);index.graph.stats.indexedAt=AT;
  return {graph:structuredClone(index.graph),sourceRecords:structuredClone(sources),generation,evaluationTime:AT};
 }});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port+'/mcp';
 let session,id=0;
 async function rpc(method,params,notification=false) {
  const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+TOKEN,'content-type':'application/json',...(session?{'mcp-session-id':session,'mcp-protocol-version':MCP_PROTOCOL_VERSION}:{})},body:JSON.stringify({jsonrpc:'2.0',...(!notification?{id:++id}:{}),method,...(params?{params}:{})})});
  assert.equal(response.status,notification?202:200);
  if(notification)return;
  const raw=await response.text();
  if(params?.arguments?.query!==HIDDEN) assert.equal(raw.includes(HIDDEN),false,'secret never appears in raw MCP response');
  const body=JSON.parse(raw);assert.equal(body.error,undefined);
  if(method==='initialize')session=response.headers.get('mcp-session-id');
  return body.result;
 }
 await rpc('initialize',{protocolVersion:MCP_PROTOCOL_VERSION,capabilities:{},clientInfo:{name:'content-test',version:'1'}});
 await rpc('notifications/initialized',undefined,true);
 const call=(name,args)=>rpc('tools/call',{name,arguments:args});
 let ref,scope;
 if(discoverFirst) {
 const discover=await call('gkos_navigation_discover',{scope_ref:null,cursor:null,limit:100});
 assert.equal(discover.isError,false);
 const graph=await call('gkos_graph_at_time',{scope_ref:discover.structuredContent.scope_ref,at:AT,state:'all',cursor:null,limit:100});
 assert.equal(graph.isError,false);
 ref=graph.structuredContent.items.find(x=>x.canonical_path==='Measurement.md').record_ref;
 scope=discover.structuredContent.scope_ref;
 }
 return {call,url,session,credentials,ref,scope,sources,changePolicy(){policyDigest="sha256:"+"c".repeat(64);},advance(){generation++;},async close(){server.close();await once(server,'close');}};
}

const consumers = [
 ['gkos_note_read',{cursor:null,limit_bytes:100}],
 ['gkos_record_validate',{}], ['gkos_record_assess',{}],
 ['gkos_lineage_get',{cursor:null,limit:100}],
];
const mutations = {
 content:f=>{f.sources[1].content+='changed bytes';},
 title:f=>{f.sources[1].content=f.sources[1].content.replace('title: "Measurement"','title: "Changed"');},
 deletion:f=>{f.sources.splice(1,1);},
 rename:f=>{f.sources[1].relativePath='Renamed.md';},
 uid:f=>{f.sources[1].content=f.sources[1].content.replace('446655449102','446655449112');},
 hidden:f=>{f.sources[1].content=f.sources[1].content.replace('sensitivity: public','sensitivity: secret');},
 policy:f=>f.changePolicy(),
 generation:f=>f.advance(),
};
function refused(result) {
 assert.equal(result.isError,true);
 assert.equal(result.structuredContent.error_code,'GKOS_P6_REFERENCE_UNKNOWN');
 assert.doesNotMatch(JSON.stringify(result),/Measurement|Renamed|Second|CONTENT-SECRET|changed bytes/);
}
for(const [mutation,change] of Object.entries(mutations)) test(`all record consumers refuse stale ${mutation} references`,async()=>{
 const f=await fixture();
 try {
  for(const [tool,args] of consumers) assert.equal((await f.call(tool,{record_ref:f.ref,...args})).isError,false,tool);
  change(f);
  for(const [tool,args] of consumers) refused(await f.call(tool,{record_ref:f.ref,...args}));
  if(['content','title','uid','policy','generation'].includes(mutation)) {
   const fresh=await f.call('gkos_record_resolve',{canonical_path:'Measurement.md'});
   assert.equal(fresh.isError,false);
   assert.notEqual(fresh.structuredContent.record_ref,f.ref);
   for(const [tool,args] of consumers) assert.equal((await f.call(tool,{record_ref:fresh.structuredContent.record_ref,...args})).isError,false,tool);
   for(const [tool,args] of consumers) refused(await f.call(tool,{record_ref:f.ref,...args}));
  }
 } finally {await f.close();}
});
const temporalArgs=f=>({scope_ref:f.scope,at:AT,state:'all',cursor:null,limit:1});
const cursorMutations={
 content:f=>{f.sources[2].content+='changed bytes';},
 deletion:f=>{f.sources.splice(f.sources.findIndex(s=>s.relativePath==='Measurement.md'),1);},
 insertion:f=>{f.sources.push({relativePath:'Added.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449120','Added','public','new')});},
 rename:f=>{f.sources[2].relativePath='AAA.md';},
 uid:f=>{f.sources[2].content=f.sources[2].content.replace('446655449103','446655449113');},
 hidden:f=>{f.sources[2].content=f.sources[2].content.replace('sensitivity: public','sensitivity: secret');},
 policy:f=>f.changePolicy(), generation:f=>f.advance(),
};
for(const [mutation,change] of Object.entries(cursorMutations)) test(`temporal continuation refuses changed ${mutation} snapshot`,async()=>{
 const f=await fixture();
 try {
  const args=temporalArgs(f),first=await f.call('gkos_graph_at_time',args);
  assert.equal(first.isError,false);assert.ok(first.structuredContent.page.next_cursor);
  change(f);
  refused(await f.call('gkos_graph_at_time',{...args,cursor:first.structuredContent.page.next_cursor,limit:100}));
  assert.equal((await f.call('gkos_graph_at_time',{...args,limit:100})).isError,false);
 } finally {await f.close();}
});

async function directFixture() {
 const identity=defaultMcpAgentBinding(TOKEN,{credentialId:'credential:direct',agentId:'018f47a3-7b5e-7c9d-8a1b-123456789abe',agentLabel:'Direct',sensitivityCeiling:'public',revoked:false}).identity;
 const sources=['A','B','C'].map((name,i)=>({relativePath:name+'.md',kind:'note',content:note('550e8400-e29b-41d4-a716-44665544910'+i,name,'public','body '+name)}));
 const index=new GkxIndex({defaultSensitivity:'secret'});index.setFiles(sources,[]);
 const view=buildAuthorizedView({identity,sensitivityCeiling:'public',corpus:{graph:index.graph,sourceRecords:sources,generation:1},authorization:{configured:true,generation:1,policyDigest:'sha256:'+'b'.repeat(64)},operation:'mcp',evaluationTime:AT});
 // Explicit synthetic authorized direct-neighbor topology; never inferred from proximity.
 view.graph.links.push({id:'lineage:test',source:view.graph.nodes[0].id,target:view.graph.nodes[1].id,kind:'lineage'});
 const config=await buildVaultNavigationConfig({configId:'018f47a3-7b5e-7c9d-8a1b-123456789abf',version:1,vaultId:'direct',promotedMocNames:[],createdAt:AT,createdBy:'system:test',policy:{id:'policy:test',version:'1.0.0',digest:'sha256:'+'b'.repeat(64)}});
 const context={identity,view,generation:1,policyDecisionId:'018f47a3-7b5e-7c9d-8a1b-123456789abf',policyDigest:'sha256:'+'b'.repeat(64),sourceRecords:sources,navigationConfig:config,vaultId:'direct'};
 const ring=new ServiceTraversalEventRing();let clock=1000,id=0;
 const runtime=new ServiceMcpRuntime(ring,8,1000,()=>clock);
 async function session(ctx=context) {
  const init=await runtime.handle({jsonrpc:'2.0',id:++id,method:'initialize',params:{protocolVersion:MCP_PROTOCOL_VERSION,capabilities:{},clientInfo:{name:'direct',version:'1'}}},null,ctx);
  await runtime.handle({jsonrpc:'2.0',method:'notifications/initialized'},init.sessionId,ctx);
  return init.sessionId;
 }
 const sid=await session();
 const call=async(name,args,sessionId=sid,ctx=context)=>(await runtime.handle({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:args}},sessionId,ctx)).body;
 const discover=(await call('gkos_navigation_discover',{cursor:null,limit:100})).result;
 assert.equal(discover.isError,false);
 const scope=discover.structuredContent.scope_ref;
 const graph=(await call('gkos_graph_at_time',{scope_ref:scope,at:AT,state:'all',cursor:null,limit:100})).result;
 assert.equal(graph.isError,false);
 return {context,ring,call:async(...args)=>(await call(...args)).result,rawCall:call,session,sid,scope,ref:graph.structuredContent.items[0].record_ref,expire(){clock=2001;}};
}

const directMutations={
 content:f=>{f.context.sourceRecords[1].content+='different';},
 deletion:f=>{f.context.sourceRecords.splice(1,1);f.context.view.graph.nodes.splice(1,1);f.context.view.notes.splice(1,1);},
 insertion:f=>{const node=structuredClone(f.context.view.graph.nodes[2]);node.id='inserted';node.path='Inserted.md';f.context.view.graph.nodes.push(node);f.context.view.notes.push({...f.context.view.notes[2],id:node.id,path:node.path});f.context.sourceRecords.push({relativePath:node.path,kind:'note',content:'inserted'});f.context.view.graph.links.push({id:'added',source:f.context.view.graph.nodes[0].id,target:node.id,kind:'lineage'});},
 reorder:f=>{f.context.view.graph.nodes.reverse();},
 uid:f=>{f.context.view.graph.nodes[1].gkx.uid='550e8400-e29b-41d4-a716-446655449199';f.context.view.notes[1].uid=f.context.view.graph.nodes[1].gkx.uid;},
 rename:f=>{f.context.sourceRecords[1].relativePath='Renamed.md';f.context.view.graph.nodes[1].path='Renamed.md';f.context.view.notes[1].path='Renamed.md';},
 policy:f=>{f.context.policyDigest='sha256:'+'c'.repeat(64);},
};
for(const tool of ['gkos_lineage_get','gkos_graph_at_time']) for(const [mutation,change] of Object.entries(directMutations)) test(`${tool} binds authorized ${mutation} and ordered snapshot`,async()=>{
 const f=await directFixture();
 const args=tool==='gkos_lineage_get'?{record_ref:f.ref,cursor:null,limit:1}:{scope_ref:f.scope,at:AT,state:'all',cursor:null,limit:1};
 const first=await f.call(tool,args);assert.equal(first.isError,false);assert.ok(first.structuredContent.page.next_cursor);
 const continuation={...args,cursor:first.structuredContent.page.next_cursor};
 assert.equal((await f.call(tool,continuation)).isError,false);
 change(f);refused(await f.call(tool,continuation));
});

for(const mutation of ['content','deletion','insertion','uid','rename','policy','config']) test(`audit continuation binds ${mutation} snapshot`,async()=>{
 const f=await directFixture();
 // Missing admitted stable IDs generate one audit row per source.
 for(const note of f.context.view.notes) note.uid=null;
 const args={scope_ref:f.scope,severity_at_least:'info',cursor:null,limit:1};
 const first=await f.call('gkos_navigation_audit',args);assert.equal(first.isError,false);assert.ok(first.structuredContent.page.next_cursor);
 const next={...args,cursor:first.structuredContent.page.next_cursor};
 assert.equal((await f.call('gkos_navigation_audit',next)).isError,false);
 if(mutation==='config') f.context.navigationConfig={...f.context.navigationConfig,version:2};
 else directMutations[mutation](f);
 refused(await f.call('gkos_navigation_audit',next));
});

test('graph-only hosts retain unchanged record consumers and refuse changed graph identity',async()=>{
 const f=await directFixture();delete f.context.sourceRecords;
 const graph=await f.call('gkos_graph_at_time',{scope_ref:f.scope,at:AT,state:'all',cursor:null,limit:100});
 assert.equal(graph.isError,false);const ref=graph.structuredContent.items[0].record_ref;
 for(const [tool,args] of consumers.slice(1)) assert.equal((await f.call(tool,{record_ref:ref,...args})).isError,false,tool);
 assert.equal((await f.call('gkos_note_read',{record_ref:ref,cursor:null,limit_bytes:100})).structuredContent.error_code,'GKOS_P6_CAPABILITY_UNAVAILABLE');
 f.context.view.graph.nodes[0].gkx.title='Changed';
 for(const [tool,args] of consumers) refused(await f.call(tool,{record_ref:ref,...args}));
});

test('foreign sessions, cross-agent sessions and expired sessions never consume issued records or cursors',async()=>{
 const f=await directFixture();
 const first=await f.call('gkos_graph_at_time',{scope_ref:f.scope,at:AT,state:'all',cursor:null,limit:1});
 const next=first.structuredContent.page.next_cursor;
 for(const foreignAgent of [false,true]) {
  const ctx=structuredClone(f.context);
  if(foreignAgent){ctx.identity.agentId='018f47a3-7b5e-7c9d-8a1b-123456789ab1';ctx.view.agent_id=ctx.identity.agentId;}
  const session=await f.session(ctx);
  for(const [tool,args] of consumers) refused(await f.call(tool,{record_ref:f.ref,...args},session,ctx));
  const discover=await f.call('gkos_navigation_discover',{cursor:null,limit:100},session,ctx);
  refused(await f.call('gkos_graph_at_time',{scope_ref:discover.structuredContent.scope_ref,at:AT,state:'all',cursor:next,limit:1},session,ctx));
 }
 f.expire();assert.ok((await f.rawCall('gkos_record_validate',{record_ref:f.ref})).error);
});

test('stable pages reassemble in order; hidden and raw-source order changes do not invalidate authorized snapshots',async()=>{
 const f=await directFixture(),args={scope_ref:f.scope,at:AT,state:'all',cursor:null,limit:1};
 const full=await f.call('gkos_graph_at_time',{...args,limit:100});let result=await f.call('gkos_graph_at_time',args),items=[...result.structuredContent.items];
 const snapshot=result.structuredContent.page.snapshot_id;
 f.context.sourceRecords.reverse();f.context.sourceRecords.push({relativePath:'Hidden-'+HIDDEN+'.md',kind:'note',content:HIDDEN});
 while(result.structuredContent.page.next_cursor){result=await f.call('gkos_graph_at_time',{...args,cursor:result.structuredContent.page.next_cursor});assert.equal(result.isError,false);assert.equal(result.structuredContent.page.snapshot_id,snapshot);items.push(...result.structuredContent.items);}
 assert.deepEqual(items,full.structuredContent.items);
 for(const limit of [0,101,1.5])assert.equal((await f.call('gkos_graph_at_time',{...args,limit})).structuredContent.error_code,'GKOS_P6_INVALID_PARAMS');
});

test('path reuse and repeated policy changes issue fresh bindings without reviving older refs',async()=>{
 const f=await directFixture(),old=[f.ref];
 for(let i=0;i<3;i++){
  f.context.policyDigest='sha256:'+String(i+1).repeat(64);
  f.context.view.graph.nodes[0].gkx.uid='550e8400-e29b-41d4-a716-44665544912'+i;
  f.context.view.notes[0].uid=f.context.view.graph.nodes[0].gkx.uid;
  const fresh=await f.call('gkos_record_resolve',{canonical_path:'A.md'});assert.equal(fresh.isError,false);
  assert.ok(!old.includes(fresh.structuredContent.record_ref));
  for(const ref of old)for(const [tool,args] of consumers){refused(await f.call(tool,{record_ref:ref,...args}));assert.deepEqual(f.ring.after(0).at(-1).paths,[]);}
  old.push(fresh.structuredContent.record_ref);
  for(const [tool,args] of consumers)assert.equal((await f.call(tool,{record_ref:old.at(-1),...args})).isError,false);
 }
});

for(const corruption of ['missing','duplicate','malformed_unicode','admission_uid']) test(`all record consumers refuse ${corruption} source/identity binding`,async()=>{
 const f=await directFixture();
 if(corruption==='missing')f.context.sourceRecords.splice(0,1);
 if(corruption==='duplicate')f.context.sourceRecords.push(structuredClone(f.context.sourceRecords[0]));
 if(corruption==='malformed_unicode')f.context.sourceRecords[0].content+='\ud800';
 if(corruption==='admission_uid')f.context.view.notes[0].uid='different';
 for(const [tool,args] of consumers){refused(await f.call(tool,{record_ref:f.ref,...args}));assert.deepEqual(f.ring.after(0).at(-1).paths,[]);}
});

test('binding storage retains the existing session record limit and does not evict accepted refs',async()=>{
 const f=await directFixture();let blocked=false;
 for(let i=0;i<8192;i++) {
  f.context.sourceRecords[2].content='bounded variant '+i;
  const result=await f.call('gkos_record_resolve',{canonical_path:'C.md'});
  if(result.isError){assert.equal(result.structuredContent.error_code,'GKOS_OBS_CONTENT_LIMIT');blocked=true;break;}
 }
 assert.equal(blocked,true);
 assert.equal((await f.call('gkos_record_validate',{record_ref:f.ref})).isError,false);
 assert.deepEqual(f.ring.after(0).at(-2).paths,[]);
});
