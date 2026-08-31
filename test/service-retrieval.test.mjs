import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {GkxIndex} from '../dist/gkos-engine.mjs';
import {createLocalServiceServer,defaultMcpAgentBinding,ServiceCredentialRegistry,MCP_PROTOCOL_VERSION} from '../dist/service-node.mjs';
import {RetrievalCoordinator,chunkMarkdown,retrievalCanonicalDigest,detectSqliteLexicalCapability} from '../dist/retrieval.mjs';
import {bindGkxRetrievalCandidateChunks,buildGkxRetrievalGeneration,projectGkxRetrievalCorpus} from '../dist/retrieval-host.mjs';
const AT='2026-08-30T12:00:00.000Z';
const HIDDEN='RETRIEVALHIDDENCANARY9931';
const POLICY=retrievalCanonicalDigest({identity:'test-agent',query_ceiling:'per-authenticated-identity'});
const note=(id,title,sensitivity,body)=>'---\ngkx_version: "2.3"\nuid: "'+id+'"\ntitle: "'+title+'"\ntype: note\ncreated_at: '+AT+'\nepistemic_state: observation\nsensitivity: '+sensitivity+'\n---\n# '+title+'\n'+body;
const files=()=>[
 {relativePath:'Public.md',extension:'md',content:note('550e8400-e29b-41d4-a716-446655449301','Public','public','ceramic resonance calibration evidence is documented here.')},
 {relativePath:'Internal.md',extension:'md',content:note('550e8400-e29b-41d4-a716-446655449302','Internal','internal','ceramic resonance calibration evidence. internalbodyneedle.')},
 {relativePath:HIDDEN+'.md',extension:'md',content:note('550e8400-e29b-41d4-a716-446655449399',HIDDEN,'secret',HIDDEN+' ceramic resonance calibration evidence internalbodyneedle.')}
].map(source=>({...source,createdTime:Date.parse(AT)}));
async function retrievalFixture(sourceFiles=files()) {
 assert.equal(detectSqliteLexicalCapability().fts5_available,true,'physical FTS5 capability is required for this release test');
 const root=await mkdtemp(join(tmpdir(),'gkos-service-retrieval-'));
 const sources=sourceFiles;
 const projected=projectGkxRetrievalCorpus(sources);assert.deepEqual(projected.rejections,[]);
 const chunks=projected.sources.flatMap(s=>bindGkxRetrievalCandidateChunks(s.record_key,chunkMarkdown(s.chunk_input)));
 const generation=buildGkxRetrievalGeneration({
  state_directory:join(root,'state'),vault_id:'service-retrieval-test',
  source_snapshot_digest:retrievalCanonicalDigest(sources.map(s=>[s.relativePath,s.content])),
  configuration_digest:retrievalCanonicalDigest({test:'native-service-retrieval'}),policy_digest:POLICY,
  lexical_backend:'sqlite_fts5',candidate_sources:projected.sources.map(s=>s.candidate_source),candidate_declarations:projected.declarations,candidate_chunks:chunks,
  embedding_eligible_candidate_chunk_keys:chunks.map(c=>c.candidate_chunk_key)
 });
 const reads=[];
 const coordinator=new RetrievalCoordinator(generation.database_path,{
  discoverability_policy:r=>['public','internal'].includes(r.metadata.sensitivity)?'allow':'deny',
  source_discoverability_policy:r=>['public','internal'].includes(r.metadata.sensitivity)?'allow':'deny',
  runtime_policy_digest:POLICY,lineage_view_freshness:'fresh',
  source_reader:async path=>{reads.push(path);const source=sources.find(s=>s.relativePath===path);if(!source)throw Error('missing');return Buffer.from(source.content);}
 });
 return {root,sources,generation,coordinator,reads,async close(){coordinator.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+ '/gkos-service-retrieval-')||resolve(root).startsWith(resolve(tmpdir())+'\\gkos-service-retrieval-'));await rm(root,{recursive:true,force:true});}};
}
test('native RetrievalCoordinator executes real FTS5 ranking and verified byte citations for internal-visible source',async()=>{
 const f=await retrievalFixture();
 try {
  const result=await f.coordinator.search({query:'internalbodyneedle',limit:20});
  assert.equal(result.stages.lexical.kind,'sqlite_fts5');assert.equal(result.stages.lexical.state,'active');
  assert.equal(result.hits.length,1);assert.equal(result.hits[0].chunk.source_path,'Internal.md');
  const hit=result.hits[0];assert.equal(hit.citation.verified,true);assert.equal(hit.citation.stale,false);
  assert.equal(hit.stage_scores.final_rank,1);assert.equal(hit.stage_scores.lexical_rank,1);
  assert.ok(Number.isFinite(hit.stage_scores.fusion_score));
  const bytes=Buffer.from(f.sources.find(s=>s.relativePath==='Internal.md').content);
  assert.ok(hit.citation.matched_spans.some(span=>bytes.subarray(span.start_byte,span.end_byte).toString('utf8')===span.text&&span.text.includes('internalbodyneedle')));
  assert.equal(JSON.stringify(result).includes(HIDDEN),false);
  assert.equal(f.reads.some(path=>path.includes(HIDDEN)),false,'hidden source is excluded before live verification reads');
 } finally {await f.close();}
});
test('native policy excludes hidden-only query from candidates/counts/citations and preserves allowed source relevance',async()=>{
 const f=await retrievalFixture();
 try {
  const hidden=await f.coordinator.search({query:HIDDEN,limit:20});
  assert.deepEqual(hidden.hits,[]);
  assert.equal(hidden.eligible_result_count,2,'native count is authorized verified chunks, not query matches; hidden third chunk excluded');
  assert.equal(JSON.stringify(hidden).includes(HIDDEN),false,'native result carries query digest, not hidden query content');
  const result=await f.coordinator.search({query:'ceramic resonance',limit:20});
  assert.deepEqual(new Set(result.hits.map(h=>h.chunk.source_path)),new Set(['Public.md','Internal.md']));
  assert.equal(result.eligible_result_count,2);
  assert.equal(result.eligible_result_count,hidden.eligible_result_count,'authorized chunk count is query independent');
  assert.ok(result.hits.every(h=>h.citation.verified&&h.citation.matched_spans.length));
  assert.equal(f.reads.some(path=>path.includes(HIDDEN)),false);
 } finally {await f.close();}
});
async function mcpFixture(sourceFiles,sensitivityCeiling='internal') {
 const f=await retrievalFixture(sourceFiles);
 const token='native-retrieval.'+'a'.repeat(48);
 let generation=1,lastNative;
 const credentials=new ServiceCredentialRegistry([defaultMcpAgentBinding(token,{credentialId:'credential:retrieval',agentId:'018f47a3-7b5e-7c9d-8a1b-123456789abe',agentLabel:'Retrieval fixture',sensitivityCeiling,revoked:false,limits:{concurrentRequests:4,bucketCapacity:100,refillMs:10}})]);
 const server=createLocalServiceServer({
  credentials,vaultId:'service-retrieval-test',status:()=>({state:'serving'}),
  authorization:async snapshot=>({configured:true,generation:snapshot.generation,policyDigest:POLICY}),
  snapshot:async()=>{const index=new GkxIndex({defaultSensitivity:'secret'});const sources=f.sources.map(s=>({...s,kind:'note'}));index.setFiles(sources,[]);index.graph.stats.indexedAt=AT;return {graph:structuredClone(index.graph),sourceRecords:structuredClone(sources),generation,evaluationTime:AT};},
  retrievalSearch:async(request,guards)=>{
   const coordinator=new RetrievalCoordinator(f.generation.database_path,{...guards,runtime_policy_digest:POLICY,lineage_view_freshness:'fresh',max_result_bytes:307200});
   try {lastNative=await coordinator.search(request);return lastNative;} finally {coordinator.close();}
  }
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 let session,id=0;
 const url='http://127.0.0.1:'+server.address().port+'/mcp';
 async function rpc(method,params,notification=false){
  const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',...(session?{'mcp-session-id':session,'mcp-protocol-version':MCP_PROTOCOL_VERSION}:{})},body:JSON.stringify({jsonrpc:'2.0',...(!notification?{id:++id}:{}),method,...(params?{params}:{})})});
  assert.equal(response.status,notification?202:200);if(notification)return;
  const json=await response.json();assert.equal(json.error,undefined);
  if(method==='initialize')session=response.headers.get('mcp-session-id');
  if(sensitivityCeiling!=='secret'&&params?.arguments?.query!==HIDDEN)assert.equal(JSON.stringify(json).includes(HIDDEN),false);
  return json.result;
 }
 await rpc('initialize',{protocolVersion:MCP_PROTOCOL_VERSION,capabilities:{},clientInfo:{name:'native-retrieval-test',version:'1'}});
 await rpc('notifications/initialized',undefined,true);
 return {...f,call:(name,args)=>rpc('tools/call',{name,arguments:args}),native:()=>lastNative,advance(){generation++;},async close(){server.close();await once(server,'close');await f.close();}};
}
test('MCP delegates to actual native FTS5 pipeline, preserves ranked verified citations and internal visibility',async()=>{
 const f=await mcpFixture();
 try {
  const response=await f.call('gkos_search',{query:'internalbodyneedle',cursor:null,limit:10});
  assert.equal(response.isError,false);
  const result=response.structuredContent;
  assert.equal(result.extension_version,'observatory.mcp-retrieval.v0');
  assert.equal(result.retrieval.stages.lexical.kind,'sqlite_fts5');
  assert.equal(result.retrieval.stages.lexical.state,'active');
  assert.equal(result.items.length,1);assert.equal(result.items[0].canonical_path,'Internal.md');
  assert.deepEqual(result.items.map(({record_ref,canonical_path,...hit})=>hit),f.native().hits);
  assert.equal(result.retrieval_window.exhaustive,false,'top100 native window is not an exhaustive corpus count');
  const item=result.items[0],bytes=Buffer.from(f.sources[1].content);
  for(const span of item.citation.matched_spans)assert.equal(bytes.subarray(span.start_byte,span.end_byte).toString('utf8'),span.text);
  const read=await f.call('gkos_note_read',{record_ref:item.record_ref,cursor:null,limit_bytes:16384});
  assert.equal(read.isError,false);assert.equal(read.structuredContent.content,f.sources[1].content);
  const hidden=await f.call('gkos_search',{query:HIDDEN,cursor:null,limit:10});
  assert.equal(hidden.isError,false);assert.deepEqual(hidden.structuredContent.items,[]);
  assert.equal(hidden.structuredContent.retrieval.eligible_result_count,2,'only the two authorized verified chunks count');
  assert.equal(hidden.structuredContent.retrieval.eligible_result_count,result.retrieval.eligible_result_count,'hidden-only query does not change the native authorized chunk count');
  assert.equal(JSON.stringify(hidden.structuredContent.retrieval).includes(HIDDEN),false);
 } finally {await f.close();}
});
test('native MCP paging preserves rank and refuses changed-query and changed-source cursors',async()=>{
 const f=await mcpFixture();
 try {
  const first=await f.call('gkos_search',{query:'ceramic resonance',cursor:null,limit:1});
  assert.equal(first.isError,false);assert.equal(first.structuredContent.page.has_more,true);
  const cursor=first.structuredContent.page.next_cursor;
  const next=await f.call('gkos_search',{query:'ceramic resonance',cursor,limit:1});
  assert.equal(next.isError,false);
  assert.notEqual(next.structuredContent.items[0].canonical_path,first.structuredContent.items[0].canonical_path);
  assert.ok(next.structuredContent.items[0].stage_scores.final_rank>first.structuredContent.items[0].stage_scores.final_rank);
  const different=await f.call('gkos_search',{query:'different',cursor,limit:1});assert.equal(different.isError,true);
  f.sources[0].content+=' changed source bytes without generation change';
  const stale=await f.call('gkos_search',{query:'ceramic resonance',cursor,limit:1});
  assert.equal(stale.isError,true);assert.equal(stale.structuredContent.error_code,'GKOS_P6_REFERENCE_UNKNOWN');
 } finally {await f.close();}
});
test('explicit native path scope can avoid authored conflicts without changing whole-vault behavior or exposing hidden sources',async()=>{
 const sourceFiles=files().map(s=>({...s,relativePath:'Healthy/'+s.relativePath}));
 const duplicateUid='550e8400-e29b-41d4-a716-446655449390';
 sourceFiles.push(
  {relativePath:'Conflicts/One.md',extension:'md',createdTime:Date.parse(AT),content:note(duplicateUid,'Conflict One','public','ceramic resonance conflicting identity one.')},
  {relativePath:'Conflicts/Two.md',extension:'md',createdTime:Date.parse(AT),content:note(duplicateUid,'Conflict Two','internal','ceramic resonance conflicting identity two.')}
 );
 const f=await mcpFixture(sourceFiles);
 try {
  await assert.rejects(f.coordinator.search({query:'ceramic resonance',limit:20}),/RETRIEVAL_AUTHORIZED_VIEW_CONFLICT/,'fixture must contain a real native authored identity conflict');
  const unscoped=await f.call('gkos_search',{query:'ceramic resonance',cursor:null,limit:10});
  assert.equal(unscoped.isError,true,'default whole-vault scope must preserve refusal, not silently omit conflicts');
  assert.equal(unscoped.structuredContent.error_code,'GKOS_P6_AUTHORIZED_VIEW_CONFLICT');
  for(const path_include of [[], null, "Healthy/**", ["../outside"], ["/absolute"], ["Healthy\\bad"], Array(17).fill("Healthy/**")]) {
   const invalid=await f.call('gkos_search',{query:'ceramic resonance',cursor:null,limit:10,path_include});
   assert.equal(invalid.isError,true);assert.equal(invalid.structuredContent.error_code,'GKOS_P6_INVALID_PARAMS');
  }
  const scoped=await f.call('gkos_search',{query:'ceramic resonance',cursor:null,limit:1,path_include:['Healthy/**']});
  assert.equal(scoped.isError,false);
  const result=scoped.structuredContent;
  assert.equal(result.retrieval.stages.lexical.kind,'sqlite_fts5');
  assert.equal(result.retrieval.eligible_result_count,2,'only allowed healthy source chunks count; hidden healthy source excluded');
  assert.equal(result.page.has_more,true);assert.ok(result.items.every(x=>x.canonical_path.startsWith('Healthy/')));
  assert.equal(JSON.stringify(result).includes(HIDDEN),false);
  const next=await f.call('gkos_search',{query:'ceramic resonance',cursor:result.page.next_cursor,limit:1,path_include:['Healthy/**']});
  assert.equal(next.isError,false);assert.notEqual(next.structuredContent.items[0].canonical_path,result.items[0].canonical_path);
  // Both globs select the same fixture files, but the cursor still binds the exact explicit scope.
  const changed=await f.call('gkos_search',{query:'ceramic resonance',cursor:result.page.next_cursor,limit:1,path_include:['Healthy/*.md']});
  assert.equal(changed.isError,true);assert.equal(changed.structuredContent.error_code,'GKOS_P6_REFERENCE_UNKNOWN');
  const removed=await f.call('gkos_search',{query:'ceramic resonance',cursor:result.page.next_cursor,limit:1});
  assert.equal(removed.isError,true);
  const wholeAgain=await f.call('gkos_search',{query:'ceramic resonance',cursor:null,limit:10});
  assert.equal(wholeAgain.isError,true,'scoped success does not repair or hide authored conflicts for later unscoped calls');
 } finally {await f.close();}
});
test('explicit secret-ceiling MCP identity can search and read synthetic secret content while internal remains withheld',async()=>{
 const internal=await mcpFixture(),secret=await mcpFixture(undefined,'secret');
 try {
  const withheld=await internal.call('gkos_search',{query:HIDDEN,cursor:null,limit:10});
  assert.equal(withheld.isError,false);assert.deepEqual(withheld.structuredContent.items,[]);
  assert.equal(withheld.structuredContent.retrieval.eligible_result_count,2);
  const allowed=await secret.call('gkos_search',{query:HIDDEN,cursor:null,limit:10});
  assert.equal(allowed.isError,false);assert.equal(allowed.structuredContent.items.length,1);
  assert.equal(allowed.structuredContent.retrieval.eligible_result_count,3);
  const hit=allowed.structuredContent.items[0];assert.equal(hit.canonical_path,HIDDEN+'.md');
  assert.equal(hit.citation.verified,true);
  const read=await secret.call('gkos_note_read',{record_ref:hit.record_ref,cursor:null,limit_bytes:16384});
  assert.equal(read.isError,false);assert.equal(read.structuredContent.content,secret.sources[2].content);
  const guessed=await internal.call('gkos_note_read',{record_ref:HIDDEN+'.md',cursor:null,limit_bytes:16384});
  assert.equal(guessed.isError,true);assert.equal(JSON.stringify(guessed).includes(HIDDEN),false);
  const foreign=await internal.call('gkos_note_read',{record_ref:hit.record_ref,cursor:null,limit_bytes:16384});
  assert.equal(foreign.isError,true);
  const all=await secret.call('gkos_search',{query:'ceramic resonance',cursor:null,limit:10});
  assert.equal(all.isError,false);
  assert.deepEqual(new Set(all.structuredContent.items.map(i=>i.canonical_path)),new Set(['Public.md','Internal.md',HIDDEN+'.md']),'secret is an inclusive ceiling, not exact-only selection');
 } finally {await internal.close();await secret.close();}
});
