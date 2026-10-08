import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import {GkxIndex} from '../dist/gkos-engine.mjs';
import {buildVaultNavigationConfig} from '../dist/navigation.mjs';
import {createLocalServiceServer,defaultMcpAgentBinding,ServiceCredentialRegistry,MCP_PROTOCOL_VERSION} from '../dist/service-node.mjs';
const AT='2026-08-30T12:00:00.000Z';
const TOKEN='content-test.'+'a'.repeat(52);
const HIDDEN='CONTENT-SECRET-CANARY-b953';
const BODY='bodyonlyneedle';
const LARGE='😀é漢字'.repeat(20000);
const note=(uid,title,sensitivity,body)=>'---\ngkx_version: "2.3"\nuid: "'+uid+'"\ntitle: "'+title+'"\ntype: note\ncreated_at: '+AT+'\nepistemic_state: observation\nsensitivity: '+sensitivity+'\n---\n'+body;
async function fixture({discoverFirst=true}={}) {
 let generation=1;
 const sources=[
  {relativePath:'index.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449101','Index','public','[[Measurement]]')},
  {relativePath:'Measurement.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449102','Measurement','public',BODY+' '+LARGE)},
  {relativePath:'Second.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449103','Second','public',BODY+' second result')},
  {relativePath:'Hidden-'+HIDDEN+'.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449199',HIDDEN,'secret',HIDDEN+' '+BODY)}
 ];
 const config=await buildVaultNavigationConfig({configId:'018f47a3-7b5e-7c9d-8a1b-123456789abf',version:1,vaultId:'vault:content-test',promotedMocNames:[],createdAt:AT,createdBy:'system:test',policy:{id:'policy:test',version:'1.0.0',digest:'sha256:'+'b'.repeat(64)}});
 const credentials=new ServiceCredentialRegistry([defaultMcpAgentBinding(TOKEN,{credentialId:'credential:content',agentId:'018f47a3-7b5e-7c9d-8a1b-123456789abe',agentLabel:'Content test',sensitivityCeiling:'public',revoked:false,limits:{concurrentRequests:4,bucketCapacity:100,refillMs:10}})]);
 const server=createLocalServiceServer({credentials,navigationConfig:config,vaultId:'vault:content-test',status:()=>({state:'serving'}),authorization:async snapshot=>({configured:true,generation:snapshot.generation,policyDigest:'sha256:'+'b'.repeat(64)}),snapshot:async()=>{
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
 return {call,url,session,credentials,ref,scope,sources,advance(){generation++;},async close(){server.close();await once(server,'close');}};
}

test('capabilities explain bounded discovery without host configuration or corpus counts',async()=>{
 const f=await fixture({discoverFirst:false});
 try {
  const response=await f.call('gkos_capabilities',{});
  const d=response.structuredContent.discovery;
  assert.equal(d.version,'observatory.discovery/1');
  assert.equal(d.limits.navigation_page,100);
  assert.equal(d.limits.note_page_bytes,16384);
  assert.match(d.availability,/does_not_imply_scope_coherent/);
  assert.match(d.catalog_digest,/same artifact kind/);
  assert.equal(d.recovery_tool,'gkos_record_resolve');
  assert.doesNotMatch(JSON.stringify(d),/CONTENT-SECRET|token_path|total_records|host_path/);
 } finally {await f.close();}
});

test('compact name/path discovery stays inside the admitted catalog and preserves full defaults',async()=>{
 const f=await fixture();
 try {
  f.sources.push(
   {relativePath:'Game_Dev/Status.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449111','Orion project','public','recorded status')},
   {relativePath:'Game_Dev/Design/Plan.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449112','Orion plan','public','design')},
   {relativePath:'Game_Development/Other.md',kind:'note',content:note('550e8400-e29b-41d4-a716-446655449113','Other project','public','other')});
  f.advance();
  const call=args=>f.call('gkos_navigation_discover',{cursor:null,limit:100,...args});
  const full=await call({}),compact=await call({detail:'compact'});
  assert.equal(full.isError,false);assert.equal(compact.isError,false);
  const a=full.structuredContent,b=compact.structuredContent;
  assert.equal(a.artifact_digest,b.artifact_digest);assert.deepEqual(a.items.map(x=>x.canonical_path),b.items.map(x=>x.canonical_path));
  assert.ok(a.items.every(x=>'evidence_codes' in x));assert.ok(b.items.every(x=>Object.keys(x).sort().join()==='canonical_path,record_ref'));
  assert.ok(Buffer.byteLength(JSON.stringify(b.items))<Buffer.byteLength(JSON.stringify(a.items))*.5);
  const named=await call({detail:'compact',name_query:'ORION project',path_prefix:'Game_Dev/'});
  assert.deepEqual(named.structuredContent.items.map(x=>x.canonical_path),['Game_Dev/Status.md']);
  const scoped=await call({detail:'compact',path_prefix:'Game_Dev'});
  assert.equal(scoped.structuredContent.items.length,2);
  const exact=await call({path_prefix:'Game_Dev/Status.md'});assert.equal(exact.structuredContent.items.length,1);
  for(const name_query of [BODY,HIDDEN])assert.deepEqual((await call({name_query})).structuredContent.items,[]);
  assert.deepEqual((await call({path_prefix:'Hidden-'+HIDDEN+'.md'})).structuredContent.items,[]);
  for(const path_prefix of ['/','../Game_Dev','Game_Dev//','C:/Game_Dev','Game_Dev\\Design']){
   const bad=await call({path_prefix});assert.equal(bad.isError,true);assert.deepEqual(bad.structuredContent.parameter_issues,[{field:'path_prefix',code:'INVALID_PATH'}]);
  }
  for(const name_query of [' ','a b c d e f g h i','bad\nvalue','\ud800'])assert.equal((await call({name_query})).isError,true);
 } finally {await f.close();}
});

test('navigation cursors bind filters, row shape, authorized source bytes and generation',async()=>{
 const f=await fixture();
 try {
  const args={cursor:null,limit:1,detail:'compact',name_query:'md'};
  const first=await f.call('gkos_navigation_discover',args);assert.equal(first.isError,false);const data=first.structuredContent;
  assert.ok(data.page.next_cursor);
  const next={...args,cursor:data.page.next_cursor};
  for(const scope_ref of [undefined,null,data.scope_ref]){
   const result=await f.call('gkos_navigation_discover',{...next,...(scope_ref!==undefined?{scope_ref}:{})});
   assert.equal(result.isError,false);assert.equal(result.structuredContent.page.snapshot_id,data.page.snapshot_id);
   assert.notEqual(result.structuredContent.items[0].canonical_path,data.items[0].canonical_path);
  }
  for(const changes of [{detail:'full'},{name_query:'Measurement'},{path_prefix:'Second.md'}])assert.equal((await f.call('gkos_navigation_discover',{...next,...changes})).structuredContent.error_code,'GKOS_P6_REFERENCE_UNKNOWN');
  f.sources[1].content+='changed without a generation roll';
  assert.equal((await f.call('gkos_navigation_discover',next)).structuredContent.error_code,'GKOS_P6_REFERENCE_UNKNOWN');
  const fresh=await f.call('gkos_navigation_discover',args);assert.equal(fresh.isError,false);
  f.advance();assert.equal((await f.call('gkos_navigation_discover',{...args,cursor:fresh.structuredContent.page.next_cursor})).structuredContent.error_code,'GKOS_P6_REFERENCE_UNKNOWN');
 } finally {await f.close();}
});

test('known locators resolve without enumeration; stale bytes, renames and path reuse require fresh resolution',async()=>{
 const f=await fixture({discoverFirst:false});
 try {
  const resolve=(canonical_path,extra={})=>f.call('gkos_record_resolve',{canonical_path,...extra});
  const first=await resolve('Measurement.md');assert.equal(first.isError,false);const original=first.structuredContent;
  assert.equal(original.uid,'550e8400-e29b-41d4-a716-446655449102');assert.equal(original.head,false);
  assert.equal((await resolve('Measurement.md',{expected_uid:original.uid})).isError,false);
  f.sources[1].content+='new source bytes';
  assert.equal((await f.call('gkos_note_read',{record_ref:original.record_ref,cursor:null,limit_bytes:100})).structuredContent.error_code,'GKOS_P6_REFERENCE_UNKNOWN');
  const second=await resolve('Measurement.md');assert.equal(second.isError,false);assert.notEqual(second.structuredContent.record_ref,original.record_ref);
  assert.equal((await f.call('gkos_note_read',{record_ref:second.structuredContent.record_ref,cursor:null,limit_bytes:100})).isError,false);
  f.advance();const third=await resolve('Measurement.md');assert.notEqual(third.structuredContent.record_ref,second.structuredContent.record_ref);
  f.sources[1].relativePath='Renamed.md';f.advance();
  assert.equal((await resolve('Measurement.md')).isError,true);assert.equal((await resolve('Renamed.md',{expected_uid:original.uid})).isError,false);
  f.sources[1].relativePath='Measurement.md';f.sources[1].content=f.sources[1].content.replace(original.uid,'550e8400-e29b-41d4-a716-446655449188');f.advance();
  assert.equal((await resolve('Measurement.md')).isError,false);
  const errors=[];
  for(const [path,extra] of [['Measurement.md',{expected_uid:original.uid}],['Absent.md',{}],['Hidden-'+HIDDEN+'.md',{}]]){
   const result=await resolve(path,extra);assert.equal(result.isError,true);
   const {request_id,error_digest,...error}=result.structuredContent;errors.push(error);
   assert.equal(error.error_code,'GKOS_P6_REFERENCE_UNKNOWN');assert.equal(error.recovery.code,'RESOLVE_KNOWN_PATH_OR_REDISCOVER');
  }
  assert.deepEqual(errors[0],errors[1]);assert.deepEqual(errors[1],errors[2]);
  for(const path of ['../Measurement.md','/Measurement.md','a/./b.md','C:\\Measurement.md','a//b.md','a\u0000.md','\ud800']){
   const result=await resolve(path);assert.equal(result.isError,true);assert.deepEqual(result.structuredContent.parameter_issues,[{field:'canonical_path',code:'INVALID_PATH'}]);
  }
  const caps=await f.call('gkos_capabilities',{});assert.ok(caps.structuredContent.capabilities.some(x=>x.capability_name==='record.locator.resolve'));
 } finally {await f.close();}
});
async function slowRead(f,record_ref,change) {
 const body=JSON.stringify({jsonrpc:'2.0',id:'slow',method:'tools/call',params:{name:'gkos_note_read',arguments:{record_ref,cursor:null,limit_bytes:16384}}});
 const response=new Promise((resolve,reject)=>{
  const request=http.request(f.url,{method:'POST',headers:{authorization:'Bearer '+TOKEN,'content-type':'application/json','content-length':Buffer.byteLength(body),'mcp-session-id':f.session,'mcp-protocol-version':MCP_PROTOCOL_VERSION}},res=>{
   let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,text}));
  });
  request.on('error',reject);request.write(body.slice(0,20));
  setTimeout(()=>{change();request.end(body.slice(20));},100);
 });
 return response;
}

test('parameter diagnostics distinguish missing nullable fields and invalid values without reflecting input',async()=>{
 const f=await fixture();
 try {
  for(const [name,args,issue] of [
   ['gkos_note_read',{record_ref:f.ref,limit_bytes:100},{field:'cursor',code:'MISSING_REQUIRED_FIELD'}],
   ['gkos_navigation_discover',{limit:100},{field:'cursor',code:'MISSING_REQUIRED_FIELD'}],
   ['gkos_navigation_discover',{cursor:12,limit:100},{field:'cursor',code:'INVALID_TYPE'}],
   ['gkos_navigation_discover',{cursor:null,limit:101},{field:'limit',code:'OUT_OF_RANGE'}],
   ['gkos_graph_at_time',{scope_ref:f.scope,at:AT,state:'imaginary',cursor:null,limit:1},{field:'state',code:'INVALID_ENUM'}],
   ['gkos_capabilities',{[HIDDEN]:HIDDEN},{field:'$',code:'UNEXPECTED_FIELD'}]
  ]) {
   const result=await f.call(name,args);assert.equal(result.isError,true);
   assert.equal(result.structuredContent.error_code,'GKOS_P6_INVALID_PARAMS');
   assert.deepEqual(result.structuredContent.parameter_issues,[issue]);
   assert.match(result.structuredContent.error_digest,/^sha256:[a-f0-9]{64}$/);
  }
  assert.equal((await f.call('gkos_note_read',{record_ref:f.ref,cursor:null,limit_bytes:100})).isError,false);
 } finally {await f.close();}
});

test('temporal query accepts equivalent explicit instants, including not_yet_created, and rejects impossible dates',async()=>{
 const f=await fixture();
 try {
  const variants=[AT,'2026-08-30T12:00:00Z','2026-08-30T08:00:00-04:00','2026-08-30T12:00:00.0Z'];
  for(const state of ['all','valid','superseded','not_yet_created']) {
   let items;
   for(const at of variants){const result=await f.call('gkos_graph_at_time',{scope_ref:f.scope,at,state,cursor:null,limit:100});assert.equal(result.isError,false);if(items)assert.deepEqual(result.structuredContent.items,items);items=result.structuredContent.items;}
  }
  const first=await f.call('gkos_graph_at_time',{scope_ref:f.scope,at:variants[1],state:'all',cursor:null,limit:1});
  const second=await f.call('gkos_graph_at_time',{scope_ref:f.scope,at:AT,state:'all',cursor:first.structuredContent.page.next_cursor,limit:1});assert.equal(second.isError,false);
  for(const at of ['2026-02-30T00:00:00Z','2026-08-30T24:00:00Z','2026-08-30T12:00:60Z','2026-08-30T12:00:00','2026-08-30T12:00:00+25:00','2026-08-30T12:00:00.0001Z']){
   const result=await f.call('gkos_graph_at_time',{scope_ref:f.scope,at,state:'all',cursor:null,limit:1});assert.equal(result.isError,true);assert.deepEqual(result.structuredContent.parameter_issues,[{field:'at',code:'INVALID_TIMESTAMP'}]);
  }
 } finally {await f.close();}
});

test('audit and discovery share stable IDs and source digest, with fresh authorized finding refs',async()=>{
 const f=await fixture();
 try {
  const discover=await f.call('gkos_navigation_discover',{cursor:null,limit:1});
  const audit=await f.call('gkos_navigation_audit',{scope_ref:f.scope,severity_at_least:'info',cursor:null,limit:100});
  assert.equal(audit.isError,false);assert.equal(audit.structuredContent.artifact_digest,discover.structuredContent.artifact_digest);
  assert.equal(audit.structuredContent.items.some(x=>x.code==='NAV_STABLE_ID_MISSING'),false);
  // Duplicate only admitted UIDs; hidden sources remain excluded by fixture's canary.
  f.sources[2].content=f.sources[2].content.replace('446655449103','446655449102');f.advance();
  const next=await f.call('gkos_navigation_audit',{scope_ref:f.scope,severity_at_least:'info',cursor:null,limit:100});assert.equal(next.isError,false);
  const conflict=next.structuredContent.items.find(x=>x.code==='NAV_STABLE_ID_AMBIGUOUS');assert.ok(conflict);assert.ok(conflict.record_ref);
  assert.equal((await f.call('gkos_note_read',{record_ref:conflict.record_ref,cursor:null,limit_bytes:100})).isError,false);
  assert.equal(next.structuredContent.items.some(x=>x.code==='NAV_STABLE_ID_MISSING'),false);
 } finally {await f.close();}
});
test('slow request body cannot retain permission across sensitivity change or credential revocation',async()=>{
 for(const revoked of [false,true]) {
  const f=await fixture();
  try {
  const ref=f.ref;
   const response=await slowRead(f,ref,()=>{
    if(revoked)f.credentials.setRevoked('credential:content',true);
    else {f.sources[1].content=f.sources[1].content.replace('sensitivity: public','sensitivity: secret');f.advance();}
   });
   assert.equal(response.text.includes(BODY),false);
   if(revoked) assert.ok([401,403].includes(response.status));
   else {assert.equal(response.status,200);assert.equal(JSON.parse(response.text).result.isError,true);}
  } finally {await f.close();}
 }
});
test('content changes without generation increment invalidate page cursors and foreign sessions reject refs',async()=>{
 const f=await fixture();
 try {
  const ref=f.ref;
  const read=await f.call('gkos_note_read',{record_ref:ref,cursor:null,limit_bytes:100});
  assert.equal(read.isError,false);
  f.sources[1].content+='changed snapshot bytes';
  for(const [name,args] of [
   ['gkos_note_read',{record_ref:ref,cursor:read.structuredContent.page.next_cursor,limit_bytes:100}]
  ]) {const stale=await f.call(name,args);assert.equal(stale.isError,true);assert.equal(stale.structuredContent.error_code,'GKOS_P6_REFERENCE_UNKNOWN');}
  async function send(body,session) {
   return fetch(f.url,{method:'POST',headers:{authorization:'Bearer '+TOKEN,'content-type':'application/json',...(session?{'mcp-session-id':session,'mcp-protocol-version':MCP_PROTOCOL_VERSION}:{})},body:JSON.stringify(body)});
  }
  const init=await send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL_VERSION,capabilities:{},clientInfo:{name:'other-session',version:'1'}}});
  assert.equal(init.status,200);const session=init.headers.get('mcp-session-id');await init.arrayBuffer();
  const notification=await send({jsonrpc:'2.0',method:'notifications/initialized'},session);assert.equal(notification.status,202);
  const response=await send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'gkos_note_read',arguments:{record_ref:ref,cursor:null,limit_bytes:100}}},session);
  const foreign=await response.json();assert.equal(foreign.result.isError,true);assert.equal(foreign.result.structuredContent.error_code,'GKOS_P6_REFERENCE_UNKNOWN');
 } finally {await f.close();}
});
test('full raw Markdown reassembles across bounded UTF8 pages without broken Unicode',async()=>{
 const f=await fixture();
 try {
  const ref=f.ref;
  let cursor=null,assembled='',offset=0,pages=0;
  do {
   const result=await f.call('gkos_note_read',{record_ref:ref,cursor,limit_bytes:16381});
   assert.equal(result.isError,false);
   const content=result.structuredContent;
   assert.equal(content.offset_bytes,offset);
   assert.equal(content.returned_bytes,Buffer.byteLength(content.content));
   assert.ok(content.returned_bytes<=16381);assert.ok(!content.content.includes('�'));
   offset+=content.returned_bytes;assembled+=content.content;pages++;
   cursor=content.page.next_cursor;
   if(!content.page.has_more){assert.equal(offset,content.total_bytes);assert.equal(cursor,null);}
  } while(cursor);
  assert.ok(pages>2);assert.equal(assembled,f.sources[1].content);
 } finally {await f.close();}
});
test('note-read is target-only and supports notes above the former search scan limit',async()=>{
 const f=await fixture();
 try {
  f.sources[2].content+='unrelated '.repeat(120000);
  const first=await f.call('gkos_note_read',{record_ref:f.ref,cursor:null,limit_bytes:128});
  assert.equal(first.isError,false,'unrelated oversized note must not block target read');
  f.sources[1].content+='large target '.repeat(100000);
  const stale=await f.call('gkos_note_read',{record_ref:f.ref,cursor:null,limit_bytes:128});
  assert.equal(stale.isError,true,'changed source must invalidate the previously issued reference');
  const graph=await f.call('gkos_graph_at_time',{scope_ref:f.scope,at:AT,state:'all',cursor:null,limit:100});
  assert.equal(graph.isError,false);
  const updatedRef=graph.structuredContent.items.find(x=>x.canonical_path==='Measurement.md').record_ref;
  const larger=await f.call('gkos_note_read',{record_ref:updatedRef,cursor:null,limit_bytes:128});
  assert.equal(larger.isError,false);assert.ok(larger.structuredContent.total_bytes>1048576);
  assert.ok(larger.structuredContent.returned_bytes<=128);
 } finally {await f.close();}
});
test('unissued paths/refs refused and sensitivity changes invalidate existing reads and cursors',async()=>{
 const f=await fixture();
 try {
  for(const ref of ['Measurement.md','../Measurement.md','gkrec1_'+'A'.repeat(22)]) {
   const result=await f.call('gkos_note_read',{record_ref:ref,cursor:null,limit_bytes:100});
   assert.equal(result.isError,true);
  }
  const ref=f.ref;
  const read=await f.call('gkos_note_read',{record_ref:ref,cursor:null,limit_bytes:100});
  assert.equal(read.isError,false);
  f.sources[1].content=f.sources[1].content.replace('sensitivity: public','sensitivity: secret');f.advance();
  for(const cursor of [null,read.structuredContent.page.next_cursor]) {
   const stale=await f.call('gkos_note_read',{record_ref:ref,cursor,limit_bytes:100});
   assert.equal(stale.isError,true);assert.equal(stale.structuredContent.error_code,'GKOS_P6_REFERENCE_UNKNOWN');
  }
 } finally {await f.close();}
});
