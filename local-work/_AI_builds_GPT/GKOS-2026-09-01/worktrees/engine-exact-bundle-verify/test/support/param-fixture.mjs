import crypto from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {GkxIndex} from '../../dist/gkos-engine.mjs';
import {buildVaultNavigationConfig} from '../../dist/navigation.mjs';
import {buildAuthorizedView,ServiceTraversalEventRing} from '../../dist/service.mjs';
import {ServiceMcpRuntime,MCP_PROTOCOL_VERSION} from '../../dist/service-node.mjs';

export const AT='2026-08-24T00:00:00.000Z';
export const SECRET='PRIVATE-CANARY-param-errors-638a';
export const BODY='PUBLIC-BODY-CANARY-param-errors-638a';
export async function paramFixture(Runtime=ServiceMcpRuntime) {
  const identity={credentialId:'credential:params',agentId:'018f47a3-7b5e-7c9d-8a1b-123456789abe',agentLabel:'Synthetic params test',sensitivityCeiling:'public',capabilities:['mcp.read'],revoked:false};
  const note=(uid,sensitivity,body)=>`---\ngkx_version: "2.3"\nuid: "${uid}"\ntitle: "Synthetic"\ntype: note\ncreated_at: ${AT}\nepistemic_state: observation\nsensitivity: ${sensitivity}\n---\n${body}`;
  const sources=[
    {relativePath:'index.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449201','public',BODY+' [[Other]]')},
    {relativePath:'Other.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449202','public',BODY)},
    {relativePath:SECRET+'.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449203','secret',SECRET)},
  ];
  const index=new GkxIndex({defaultSensitivity:'secret'});index.setFiles(sources,[]);index.graph.stats.indexedAt=AT;
  const authorization={configured:true,generation:1,policyDigest:'sha256:'+'b'.repeat(64)};
  const view=buildAuthorizedView({identity,sensitivityCeiling:'public',corpus:{graph:structuredClone(index.graph),sourceRecords:sources,generation:1},authorization,operation:'mcp',evaluationTime:AT});
  const navigationConfig=await buildVaultNavigationConfig({configId:'018f47a3-7b5e-7c9d-8a1b-123456789abf',version:1,vaultId:'vault:params',promotedMocNames:[],createdAt:AT,createdBy:'system:test',policy:{id:'policy:test',version:'1.0.0',digest:authorization.policyDigest}});
  const context={identity,view,generation:1,policyDecisionId:'018f47a3-7b5e-7c9d-8a1b-123456789abd',sourceRecords:sources,navigationConfig,vaultId:'vault:params',retrievalSearch:async()=>({projection_freshness:'fresh',hits:[]})};
  const events=new ServiceTraversalEventRing(2048,0,2097152,()=>0);
  const runtime=new Runtime(events);
  let id=0;
  const init=await runtime.handle({jsonrpc:'2.0',id:++id,method:'initialize',params:{protocolVersion:MCP_PROTOCOL_VERSION,capabilities:{},clientInfo:{name:'params',version:'1'}}},null,context);
  const session=init.sessionId;
  await runtime.handle({jsonrpc:'2.0',method:'notifications/initialized'},session,context);
  const raw=(name,args)=>runtime.handle({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:args}},session,context);
  const call=async(name,args)=>(await raw(name,args)).body.result;
  const discovery=await call('gkos_navigation_discover',{cursor:null,limit:100});
  const scope=discovery.structuredContent.scope_ref,ref=discovery.structuredContent.items[0].record_ref;
  const valid={
    gkos_capabilities:{},gkos_record_validate:{record_ref:ref},gkos_record_assess:{record_ref:ref},
    gkos_lineage_get:{record_ref:ref,cursor:null,limit:100},
    gkos_graph_at_time:{scope_ref:scope,at:AT,state:'all',cursor:null,limit:100},
    gkos_navigation_discover:{cursor:null,limit:100},
    gkos_navigation_audit:{scope_ref:scope,severity_at_least:'info',cursor:null,limit:100},
    gkos_note_read:{record_ref:ref,cursor:null,limit_bytes:600},
    gkos_record_resolve:{canonical_path:'index.md'},
    gkos_search:{query:'Synthetic',cursor:null,limit:10},
  };
  return {call,raw,ref,scope,valid,context,events};
}

// Freeze only test-process nondeterminism; production runtime code is unchanged.
export async function compatibilitySnapshot(Runtime=ServiceMcpRuntime) {
  const randomBytes=crypto.randomBytes,now=Date.now;
  let sequence=0;
  crypto.randomBytes=size=>crypto.createHash('sha256').update(`params-fixture-${++sequence}`).digest().subarray(0,size);
  Date.now=()=>Date.parse(AT);syncBuiltinESMExports();
  try {
    const f=await paramFixture(Runtime),responses={};
    for(const [name,args] of Object.entries(f.valid))responses[name]=(await f.raw(name,args)).body;
    responses.unknown_ref=(await f.raw('gkos_note_read',{record_ref:'gkrec1_'+'A'.repeat(22),cursor:null,limit_bytes:100})).body;
    responses.unknown_cursor=(await f.raw('gkos_note_read',{record_ref:f.ref,cursor:'gkcur1_unavailable',limit_bytes:100})).body;
    f.context.retrievalSearch=async()=>{throw new Error('RETRIEVAL_AUTHORIZED_VIEW_CONFLICT');};
    responses.conflict=(await f.raw('gkos_search',f.valid.gkos_search)).body;
    f.context.policyDecisionId='invalid';
    responses.auth_failed=(await f.raw('gkos_note_read',{})).body;
    return responses;
  } finally {crypto.randomBytes=randomBytes;Date.now=now;syncBuiltinESMExports();}
}
