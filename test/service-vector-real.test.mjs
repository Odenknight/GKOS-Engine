// Opt-in: actual local model inference, never canned vectors or live-vault content.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {GkxIndex} from '../dist/gkos-engine.mjs';
import {RetrievalCoordinator,chunkMarkdown,retrievalCanonicalDigest,detectSqliteLexicalCapability} from '../dist/retrieval.mjs';
import {bindGkxRetrievalCandidateChunks,projectGkxRetrievalCorpus,indexGkxRetrievalGeneration} from '../dist/retrieval-host.mjs';
import {createLocalServiceServer,defaultMcpAgentBinding,ServiceCredentialRegistry,MCP_PROTOCOL_VERSION,loadLocalEmbeddingProvider,isTrustedLocalEmbeddingProvider} from '../dist/service-node.mjs';
const enabled=!!process.env.GKOS_TEST_LOCAL_EMBEDDING_CONFIG;
const AT='2026-08-30T12:00:00.000Z',SECRET='REALVECTORSECRETCANARY91FA';
const POLICY=retrievalCanonicalDigest({fixture:'real-vector',embedding_ceiling:'secret',query_ceiling:'per-agent'});
const note=(uid,title,sensitivity,text)=>'---\ngkx_version: "2.3"\nuid: "'+uid+'"\ntitle: "'+title+'"\ntype: note\ncreated_at: '+AT+'\nepistemic_state: observation\nsensitivity: '+sensitivity+'\n---\n# '+title+'\n'+text;
test('actual in-process ONNX model indexes authorized secret vectors while MCP enforces each agent ceiling',{skip:!enabled},async()=>{
 const loaded=await loadLocalEmbeddingProvider(process.env.GKOS_TEST_LOCAL_EMBEDDING_CONFIG);
 assert.ok(loaded&&loaded.provider.kind==='local_onnx');
 assert.equal(loaded.indexingCeiling,'secret','this test requires the explicitly authorized local secret-index configuration');
 assert.equal(isTrustedLocalEmbeddingProvider(loaded.provider),true);
 assert.equal(isTrustedLocalEmbeddingProvider({kind:'local_onnx'}),false,'a caller-supplied kind string is not trusted local inference');
 const actual=loaded.provider,model=actual.model_id,dimensions=actual.dimensions;
 assert.equal(dimensions,384);
 assert.equal(detectSqliteLexicalCapability().fts5_available,true);
 const root=await mkdtemp(join(tmpdir(),'gkos-real-vector-'));
 const sent=[];
 const provider={kind:actual.kind,provider_id:actual.provider_id,model_id:model,dimensions,timeout_ms:actual.timeout_ms,
  embed:async(texts,context)=>{sent.push(...texts);return actual.embed(texts,context);}
 };
 const sources=[
  {relativePath:'Companion.md',kind:'note',extension:'md',createdTime:Date.parse(AT),content:note('550e8400-e29b-41d4-a716-446655449501','Companion','internal','A friendly dog enjoys playing fetch, walking with its owner, and offering loyal friendship.')},
  {relativePath:'Geology.md',kind:'note',extension:'md',createdTime:Date.parse(AT),content:note('550e8400-e29b-41d4-a716-446655449502','Geology','public','Volcanic basalt forms when molten rock cools into a dark mineral stone.')},
  {relativePath:SECRET+'.md',kind:'note',extension:'md',createdTime:Date.parse(AT),content:note('550e8400-e29b-41d4-a716-446655449599',SECRET,'secret',SECRET+' A friendly dog enjoys playing fetch and loyal friendship.')}
 ];
 let server,coordinator;
 try {
  const projection=projectGkxRetrievalCorpus(sources);assert.deepEqual(projection.rejections,[]);
  const chunks=projection.sources.flatMap(s=>bindGkxRetrievalCandidateChunks(s.record_key,chunkMarkdown(s.chunk_input)));
  const eligible=chunks; // Owner-authorized local indexing ceiling is secret; query ceilings remain separate.
  const indexed=await indexGkxRetrievalGeneration({
   state_directory:join(root,'state'),vault_id:'real-vector-test',source_snapshot_digest:retrievalCanonicalDigest(sources),configuration_digest:retrievalCanonicalDigest({model,dimensions}),policy_digest:POLICY,lexical_backend:'sqlite_fts5',
   candidate_sources:projection.sources.map(s=>s.candidate_source),candidate_declarations:projection.declarations,candidate_chunks:chunks,embedding_eligible_candidate_chunk_keys:eligible.map(c=>c.candidate_chunk_key)
  },provider);
  assert.equal(indexed.vector_stage.state,'active','actual model indexing must succeed, no lexical-only fallback accepted');
  assert.ok(sent.some(t=>t.includes('friendly dog'))&&sent.some(t=>t.includes('Volcanic basalt')));
  assert.equal(sent.some(t=>t.includes(SECRET)),true,'owner-authorized local indexing includes the synthetic secret vector');
  const graph=new GkxIndex({defaultSensitivity:'secret'});graph.setFiles(sources,[]);graph.graph.stats.indexedAt=AT;
  const tokens={internal:'real-vector-internal.'+'a'.repeat(42),public:'real-vector-public.'+'b'.repeat(44)};
  const credentials=new ServiceCredentialRegistry(Object.entries(tokens).map(([ceiling,token],i)=>defaultMcpAgentBinding(token,{credentialId:'credential:'+ceiling,agentId:i?'018f47a3-7b5e-7c9d-8a1b-123456789abf':'018f47a3-7b5e-7c9d-8a1b-123456789abe',agentLabel:ceiling,sensitivityCeiling:ceiling,revoked:false,limits:{concurrentRequests:4,bucketCapacity:100,refillMs:10}})));
  server=createLocalServiceServer({credentials,vaultId:'real-vector-test',status:()=>({state:'serving'}),authorization:async()=>({configured:true,generation:1,policyDigest:POLICY}),snapshot:async()=>({graph:structuredClone(graph.graph),sourceRecords:structuredClone(sources),generation:1,evaluationTime:AT}),
   retrievalSearch:async(request,guards)=>{coordinator=new RetrievalCoordinator(indexed.generation.database_path,{...guards,vector_provider:provider,runtime_policy_digest:POLICY,lineage_view_freshness:'fresh',max_result_bytes:307200});try{return await coordinator.search(request);}finally{coordinator.close();coordinator=null;}}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port+'/mcp',query='canine companionship';
  async function search(token) {
   let session;
   async function rpc(method,params,notification=false){
    const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',...(session?{'mcp-session-id':session,'mcp-protocol-version':MCP_PROTOCOL_VERSION}:{})},body:JSON.stringify({jsonrpc:'2.0',...(!notification?{id:1}:{}),method,...(params?{params}:{})})});
    assert.equal(response.status,notification?202:200);if(notification)return;
    const value=await response.json();assert.equal(value.error,undefined);
    assert.equal(JSON.stringify(value).includes(SECRET),false);
    if(method==='initialize')session=response.headers.get('mcp-session-id');return value.result;
   }
   await rpc('initialize',{protocolVersion:MCP_PROTOCOL_VERSION,capabilities:{},clientInfo:{name:'real-vector-test',version:'1'}});
   await rpc('notifications/initialized',undefined,true);
   return rpc('tools/call',{name:'gkos_search',arguments:{query,cursor:null,limit:10}});
  }
  sent.length=0;
  const internal=await search(tokens.internal);assert.equal(internal.isError,false);
  const result=internal.structuredContent;
  assert.equal(result.retrieval.stages.vector.state,'active');
  assert.equal(result.retrieval.stages.vector.model_id,model);
  assert.equal(result.items[0].canonical_path,'Companion.md','semantic synonym must rank relevant internal dog note first');
  assert.equal(result.items[0].stage_scores.lexical_rank,null,'query has no literal overlap: vector retrieval is necessary');
  assert.ok(Number.isFinite(result.items[0].stage_scores.semantic_score));
  assert.equal(result.items[0].citation.verified,true);
  assert.equal(result.retrieval.eligible_result_count,2);
  const publicResult=await search(tokens.public);assert.equal(publicResult.isError,false);
  assert.equal(publicResult.structuredContent.retrieval.stages.vector.state,'active');
  assert.equal(publicResult.structuredContent.retrieval.eligible_result_count,1);
  assert.ok(publicResult.structuredContent.items.every(i=>i.canonical_path==='Geology.md'));
  assert.deepEqual(sent,[query,query],'query provider receives only the queries, never unauthorized source chunks');
 } finally {
  coordinator?.close();
  if(server){server.close();await once(server,'close');}
  assert.ok(resolve(root).startsWith(resolve(tmpdir())+'/gkos-real-vector-')||resolve(root).startsWith(resolve(tmpdir())+'\\gkos-real-vector-'));
  await rm(root,{recursive:true,force:true});
 }
});
