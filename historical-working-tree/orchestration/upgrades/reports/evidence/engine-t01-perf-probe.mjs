import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import {GkxIndex} from '../../engine/dist/gkos-engine.mjs';
import {buildVaultNavigationConfig} from '../../engine/dist/navigation.mjs';
import {createLocalServiceServer,defaultMcpAgentBinding,ServiceCredentialRegistry,MCP_PROTOCOL_VERSION} from '../../engine/dist/service-node.mjs';
import {ServiceMcpRuntime} from '../../engine/dist/service-node.mjs';
import {buildAuthorizedView,ServiceTraversalEventRing} from '../../engine/dist/service.mjs';
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

const f=await directFixture(),baseNode=f.context.view.graph.nodes[0],baseNote=f.context.view.notes[0];
f.context.view.graph.nodes=Array.from({length:8000},(_,i)=>({...structuredClone(baseNode),id:'node:'+i,path:'n'+String(i).padStart(5,'0')+'.md'}));
f.context.view.notes=f.context.view.graph.nodes.map(n=>({...baseNote,id:n.id,path:n.path}));
f.context.sourceRecords=f.context.view.graph.nodes.map(n=>({relativePath:n.path,kind:'note',content:'Synthetic bounded content.'}));
const timings=[];for(let i=0;i<5;i++){const start=performance.now();const result=await f.call('gkos_graph_at_time',{scope_ref:f.scope,at:AT,state:'all',cursor:null,limit:1});assert.equal(result.isError,false);timings.push(performance.now()-start);}
console.log(JSON.stringify({nodes:8000,page_limit:1,repetitions:5,milliseconds:timings,node:process.version,platform:process.platform,scope:'synthetic direct runtime, not independent benchmark'}));