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

// ---------------------------------------------------------------------------
// J2: Graphiti input validation must be pre-dispatch and use the established
// invalid-params envelope. Every assertion here drives the real HTTP tool path.
// ---------------------------------------------------------------------------
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
const envelopeSchema=JSON.parse(readFileSync(new URL('../docs/mcp-invalid-params-draft3.schema.json',import.meta.url)));
const validateEnvelope=new Ajv2020({strict:true}).compile(envelopeSchema);
const REASONS=['missing','malformed','out_of_range','unknown_param'];

function expectInvalid(result){
  assert.equal(result.isError,true);
  const data=result.structuredContent;
  assert.equal(validateEnvelope(data),true,JSON.stringify(validateEnvelope.errors));
  assert.equal(data.error_code,'GKOS_P6_INVALID_PARAMS');
  assert.equal(data.retryable,false);
  assert.ok(Array.isArray(data.param_errors)&&data.param_errors.length>0&&data.param_errors.length<=16);
  for(const item of data.param_errors){
    assert.deepEqual(Object.keys(item).sort(),['expected','hint','param','reason']);
    assert.ok(REASONS.includes(item.reason));
    assert.ok(item.expected.length>0&&item.expected.length<=256);
    assert.ok(item.hint.length>0&&item.hint.length<=256);
  }
  return data.param_errors;
}
async function probe(args,ceiling='internal'){
  let calls=0;
  const f=await fixture(ceiling,async input=>{calls++;return result(input);});
  try{const raw=await f.callRaw(args);return {result:raw.result??raw.error,backendCalls:calls,list:(await f.list())};}
  finally{await f.close();}
}

const VALID=[
  ['7 terms',{query:'alpha beta gamma delta epsilon zeta eta',limit:5}],
  ['8 terms',{query:'alpha beta gamma delta epsilon zeta eta theta',limit:5}],
  ['8 terms with a double-quoted phrase',{query:'alpha beta gamma delta epsilon zeta "quoted phrase"',limit:5}],
  ['bare quoted phrase',{query:'"quoted phrase" other',limit:1}],
];
test('J2: valid 7- and 8-term queries still execute and reach the backend exactly once',async()=>{
  for(const [label,args] of VALID){
    const {result,backendCalls}=await probe(args);
    assert.equal(result.isError,false,label);
    assert.equal(backendCalls,1,label);
    assert.equal(result.structuredContent.extension_version,'observatory.mcp-graphiti.v0',label);
  }
});

const INVALID=[
  ['nine whitespace-separated terms',{query:'alpha beta gamma delta epsilon zeta eta theta iota',limit:5},'query','malformed'],
  ['unmatched double quote',{query:'alpha "unclosed phrase',limit:5},'query','malformed'],
  ['quote followed by a non-space character',{query:'alpha "quoted"x beta',limit:5},'query','malformed'],
  ['bare double quote',{query:'"',limit:5},'query','malformed'],
  ['control character',{query:'alpha\u0001beta',limit:5},'query','malformed'],
  ['blank query',{query:'   ',limit:5},'query','malformed'],
  ['query longer than 256 characters',{query:'a'.repeat(257),limit:5},'query','out_of_range'],
  ['query over 1024 UTF-8 bytes',{query:'\u00e9'.repeat(600),limit:5},'query','out_of_range'],
  ['limit above the published maximum',{query:'alpha beta',limit:51},'limit','out_of_range'],
  ['limit below the published minimum',{query:'alpha beta',limit:0},'limit','out_of_range'],
  ['unexpected field',{query:'alpha beta',limit:5,extra:1},'$','unknown_param'],
  ['missing limit',{query:'alpha beta'},'limit','missing'],
  ['non-string query',{query:5,limit:5},'query','malformed'],
];
test('J2: invalid Graphiti input is refused before dispatch with the established invalid-params envelope',async()=>{
  for(const [label,args,param,reason] of INVALID){
    const {result,backendCalls}=await probe(args);
    const errors=expectInvalid(result);
    const matched=errors.find(item=>item.param===param);
    assert.ok(matched,label+' -> '+JSON.stringify(errors));
    assert.equal(matched.reason,reason,label);
    assert.equal(backendCalls,0,label+' must not dispatch to the backend');
  }
});
test('J2: the published Graphiti schema carries the same lexical contract and bounded hints',async()=>{
  const {list}=await probe({query:'alpha',limit:1});
  const tool=list.find(item=>item.name==='gkos_graphiti_search');
  assert.ok(tool,'gkos_graphiti_search must be advertised when a trusted callback is configured');
  assert.equal(tool.inputSchema.properties.query.maxLength,256);
  assert.ok(tool.inputSchema.properties.query['x-gkos-param-help'],'query hints must be published');
  assert.match(tool.inputSchema.properties.query['x-gkos-param-help'].expected,/8 whitespace-separated terms/u);
  assert.match(tool.inputSchema.properties.query['x-gkos-param-help'].hint,/quoted phrase/u);
});
test('J2: a genuine backend fault stays opaque, separate from input errors, and never becomes a parameter error',async()=>{
  const f=await fixture('internal',async()=>{throw new Error('backend exploded');});
  try{
    const raw=await f.callRaw({query:'alpha beta',limit:5});
    const result=raw.result??raw.error;
    assert.equal(result.isError,true);
    assert.equal(result.structuredContent.error_code,'GKOS_P6_OPERATION_FAILED');
    assert.equal('param_errors' in result.structuredContent,false);
    assert.equal(JSON.stringify(result).includes('backend exploded'),false);
  }finally{await f.close();}
});
test('J2: an authorization denial stays opaque and separate from input errors',async()=>{
  const denied=await fixture('public',async input=>result(input,{source_id:ids.internal,source_digest:sha(sources[1].content)}));
  try{
    const raw=await denied.callRaw({query:'alpha beta',limit:5});
    const result=raw.result??raw.error;
    assert.equal(result.isError,true);
    assert.equal(result.structuredContent.error_code,'GKOS_P6_CAPABILITY_UNAVAILABLE');
    assert.equal('param_errors' in result.structuredContent,false);
  }finally{await denied.close();}
});
