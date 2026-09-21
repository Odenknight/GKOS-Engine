import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {GkxIndex} from '../dist/gkos-engine.mjs';
import {createLocalServiceServer,defaultMcpAgentBinding,ServiceCredentialRegistry,MCP_PROTOCOL_VERSION} from '../dist/service-node.mjs';

const AT='2026-09-20T00:00:00.000Z',POLICY='sha256:'+createHash('sha256').update('graphiti-policy').digest('hex');
const ids={public:'550e8400-e29b-41d4-a716-446655449501',internal:'550e8400-e29b-41d4-a716-446655449502'};
const note=(uid,title,sensitivity,body)=>`---\ngkx_version: "2.3"\nuid: "${uid}"\ntitle: "${title}"\ntype: note\ncreated_at: ${AT}\nepistemic_state: observation\nsensitivity: ${sensitivity}\n---\n${body}`;
const sources=[
 {relativePath:'Public.md',extension:'md',kind:'note',createdTime:Date.parse(AT),content:note(ids.public,'Public','public','PUBLIC-CANARY')},
 {relativePath:'Internal.md',extension:'md',kind:'note',createdTime:Date.parse(AT),content:note(ids.internal,'Internal','internal','INTERNAL-CANARY')},
];
function snapshot(){const index=new GkxIndex({defaultSensitivity:'secret'});index.setFiles(structuredClone(sources),[]);index.graph.stats.indexedAt=AT;return {graph:index.graph,sourceRecords:structuredClone(sources),generation:1,evaluationTime:AT};}
const sha=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
function result(input,source=input.authority.sources[0],overrides={}){return {contract_version:'gkos-graphiti-query/1.0.0-draft.1',request_id:input.requestId,binding:{corpus_id:input.authority.corpusId,scope_digest:input.authority.authorizedScopeDigest,policy_digest:input.authority.policyDigest,source_snapshot_digest:sha('manifest'),projection_id:'gkos_0123456789abcdef0123456789abcdef',configuration_digest:sha('configuration'),...overrides.binding},hits:[{fact:'authorized graph fact',semantic_support:'unverified',citations:[{projection_episode_id:'episode-1',source_id:source.source_id,source_digest:source.source_digest}]}],...overrides};}
async function fixture(ceiling='internal',graphitiSearch){
 let generation=1;
 const token=`graphiti-${ceiling}.`+'a'.repeat(48),credentialId=`credential:${ceiling}`;
 const credentials=new ServiceCredentialRegistry([defaultMcpAgentBinding(token,{credentialId,agentId:'018f47a3-7b5e-7c9d-8a1b-123456789abe',agentLabel:'Graphiti fixture',sensitivityCeiling:ceiling,revoked:false,limits:{concurrentRequests:4,bucketCapacity:100,refillMs:10}})]);
 const server=createLocalServiceServer({credentials,vaultId:'vault:observatory-demo',status:()=>({state:'serving'}),snapshot:()=>({...snapshot(),generation}),authorization:snapshot=>({configured:true,generation:snapshot.generation,policyDigest:POLICY}),...(graphitiSearch?{graphitiSearch}:{})});
 server.listen(0,'127.0.0.1');await once(server,'listening');let session,id=0;const url=`http://127.0.0.1:${server.address().port}/mcp`;
 async function rpc(method,params,notification=false){const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(session?{'mcp-session-id':session,'mcp-protocol-version':MCP_PROTOCOL_VERSION}:{})},body:JSON.stringify({jsonrpc:'2.0',...(!notification?{id:++id}:{}),method,...(params?{params}:{})})});if(notification){assert.equal(response.status,202);return;}const json=await response.json();if(method==='initialize')session=response.headers.get('mcp-session-id');return json;}
 await rpc('initialize',{protocolVersion:MCP_PROTOCOL_VERSION,capabilities:{},clientInfo:{name:'graphiti-test',version:'1'}});await rpc('notifications/initialized',undefined,true);
 return {credentials,credentialId,advance:()=>generation++,list:async()=>(await rpc('tools/list')).result.tools,call:async(args)=>(await rpc('tools/call',{name:'gkos_graphiti_search',arguments:args})).result,callRaw:async(args)=>rpc('tools/call',{name:'gkos_graphiti_search',arguments:args}),close:async()=>{server.close();await once(server,'close');}};
}

test('Graphiti tool is advertised only when a trusted callback is configured',async()=>{for(const enabled of [false,true]){const f=await fixture('internal',enabled?async input=>result(input):undefined);try{assert.equal((await f.list()).some(tool=>tool.name==='gkos_graphiti_search'),enabled);}finally{await f.close();}}});

test('Graphiti search binds the complete clearance scope and rejects cross-clearance citations',async()=>{
 let authority;const publicFixture=await fixture('public',async input=>{authority=input.authority;return result(input,{source_id:ids.internal,source_digest:sha(sources[1].content)});});
 try{const denied=await publicFixture.call({query:'canary',limit:5});assert.equal(denied.isError,true);assert.equal(denied.structuredContent.error_code,'GKOS_P6_CAPABILITY_UNAVAILABLE');assert.deepEqual(authority.sources.map(source=>source.source_id),[ids.public]);assert.equal(JSON.stringify(denied).includes('INTERNAL-CANARY'),false);}finally{await publicFixture.close();}
 const internalFixture=await fixture('internal',async input=>{assert.deepEqual(new Set(input.authority.sources.map(source=>source.source_id)),new Set([ids.public,ids.internal]));return result(input,input.authority.sources.find(source=>source.source_id===ids.internal));});
 try{const allowed=await internalFixture.call({query:'canary',limit:5});assert.equal(allowed.isError,false);assert.equal(allowed.structuredContent.extension_version,'observatory.mcp-graphiti.v0');assert.equal(allowed.structuredContent.items[0].citations[0].source_id,ids.internal);assert.equal(allowed.structuredContent.semantic_support,'unverified');}finally{await internalFixture.close();}
});

test('delayed revocation and provider binding/citation tampering fail closed without backend diagnostics',async()=>{
 let release,entered;const waiting=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);let fixtureRef;
 const delayed=await fixture('internal',async input=>{entered();await gate;return result(input);});fixtureRef=delayed;
 try{const pending=delayed.callRaw({query:'delayed',limit:5});await waiting;delayed.credentials.setRevoked(delayed.credentialId,true);release();const denied=await pending;assert.equal(denied.result,undefined);assert.equal(JSON.stringify(denied).includes('authorized graph fact'),false);}finally{release();await delayed.close();}
 for(const mutate of [input=>result(input,undefined,{binding:{scope_digest:sha('wrong')}}),input=>result(input,{...input.authority.sources[0],source_digest:sha('wrong')})]){const f=await fixture('internal',mutate);try{const denied=await f.call({query:'tamper',limit:5});assert.equal(denied.isError,true);assert.equal(denied.structuredContent.error_code,'GKOS_P6_CAPABILITY_UNAVAILABLE');}finally{await f.close();}}
});

test('unchanged authorized bytes cannot mask a generation change during Graphiti work',async()=>{
 let f;f=await fixture('internal',async input=>{f.advance();return result(input);});
 try{const denied=await f.call({query:'generation',limit:5});assert.equal(denied.isError,true);assert.equal(denied.structuredContent.error_code,'GKOS_P6_CAPABILITY_UNAVAILABLE');}finally{await f.close();}
});
