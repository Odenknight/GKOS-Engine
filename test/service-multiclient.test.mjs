import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {GkxIndex} from '../dist/gkos-engine.mjs';
import {createLocalServiceServer,defaultMcpAgentBinding,ServiceCredentialRegistry,MCP_PROTOCOL_VERSION} from '../dist/service-node.mjs';
const A='a'.repeat(64),B='b'.repeat(64);
async function fixture(limits={concurrentRequests:1,bucketCapacity:100,refillMs:10}){
 const bindings=[A,B].map((token,i)=>defaultMcpAgentBinding(token,{credentialId:'credential:lane'+i,agentId:'018f47a3-7b5e-7c9d-8a1b-123456789ab'+(i+1),agentLabel:'Lane '+i,sensitivityCeiling:'internal',revoked:false,limits}));
 bindings[0].identity.capabilities.push('events.read');
 const credentials=new ServiceCredentialRegistry(bindings);
 const index=new GkxIndex();index.setFiles([],[]);
 const server=createLocalServiceServer({credentials,snapshot:()=>({graph:index.graph,generation:1,sourceRecords:[]}),authorization:()=>({configured:true,generation:1,policyDigest:'sha256:'+'a'.repeat(64)}),status:()=>({state:'serving'}),streamHeartbeatMs:30});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=server.address().port;
 const clients=[];
 const call=(token,body,session,method='POST',path='/mcp')=>new Promise((resolve,reject)=>{
  const data=body===undefined?null:JSON.stringify(body);
  const req=http.request({host:'127.0.0.1',port,path,method,headers:{authorization:'Bearer '+token,...(data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{}),...(session?{'mcp-session-id':session,'mcp-protocol-version':MCP_PROTOCOL_VERSION}:{})}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:text?JSON.parse(text):null}));});req.on('error',reject);req.end(data);
 });
 const open=(token,session,path='/mcp')=>new Promise((resolve,reject)=>{
  const req=http.get({host:'127.0.0.1',port,path,headers:{authorization:'Bearer '+token,...(session?{'mcp-session-id':session}:{})}},res=>{clients.push(res);res.on('error',()=>{});res.resume();resolve(res);});req.on('error',reject);clients.push(req);
 });
 const init=async token=>{const reply=await call(token,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL_VERSION,capabilities:{},clientInfo:{name:'lane',version:'1'}}});assert.equal(reply.status,200);const id=reply.headers['mcp-session-id'];assert.ok(id);await call(token,{jsonrpc:'2.0',method:'notifications/initialized'},id);return id;};
 return{server,credentials,call,open,init,port,async close(){for(const c of clients)c.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
const listed={jsonrpc:'2.0',id:2,method:'tools/list'};
test('same-token lanes retain persistent SSE without consuming request slots; deletion and disconnect free stream capacity',async()=>{
 const f=await fixture();try{
  const one=await f.init(A),two=await f.init(A),other=await f.init(B);
  const streams=[];for(let i=0;i<8;i++)streams.push(await f.open(A,i%2?two:one));
  assert.ok(streams.every(s=>s.statusCode===200));
  await once(streams[0],'data');await once(streams[0],'data');assert.equal(streams[0].readableEnded,false);
  assert.equal((await f.call(A,listed,one)).status,200);assert.equal((await f.call(A,listed,two)).status,200);
  const limited=await f.call(A,undefined,one,'GET');assert.equal(limited.status,429);assert.equal(limited.body.reason,'stream_capacity');assert.equal(limited.headers['retry-after'],'1');
  const separate=await f.open(B,other);assert.equal(separate.statusCode,200);
  const foreign=await f.call(B,undefined,one,'GET');assert.equal(foreign.status,404);
  const ended=once(streams[0],'end');assert.equal((await f.call(A,undefined,one,'DELETE')).status,204);await ended;
  const replacement=await f.open(A,two);assert.equal(replacement.statusCode,200);
  replacement.destroy();await once(replacement,'close');
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal((await f.open(A,two)).statusCode,200);
 }finally{await f.close();}
});
test('event streams share separate capped stream budget and revocation/shutdown close idle streams',async()=>{
 const f=await fixture();try{
  const session=await f.init(A);const event=await f.open(A,null,'/events');assert.equal(event.statusCode,200);
  const mcp=await f.open(A,session);assert.equal((await f.call(A,listed,session)).status,200);
  const ends=[once(event,'end'),once(mcp,'end')];f.credentials.setRevoked('credential:lane0',true);await Promise.all(ends);
  f.credentials.setRevoked('credential:lane0',false);const stream=await f.open(A,session);const end=once(stream,'end');f.server.close();await end;
 }finally{await f.close();}
});
test('ingress concurrency is separate from persisted work limits and carries Retry-After',async()=>{
 const f=await fixture({concurrentRequests:1,bucketCapacity:1,refillMs:1000});const held=[];try{
  for(let i=0;i<16;i++){const req=http.request({host:'127.0.0.1',port:f.port,path:'/mcp',method:'POST',headers:{authorization:'Bearer '+A,'content-type':'application/json','content-length':'100'}});req.on('error',()=>{});req.write('{');held.push(req);}
  await new Promise(resolve=>setTimeout(resolve,40));
  const concurrent=await f.call(A,listed);assert.equal(concurrent.status,429);assert.equal(concurrent.body.reason,'request_concurrency');assert.equal(concurrent.headers['retry-after'],'1');
  assert.notEqual((await f.call(B,listed)).status,429);
  for(const req of held)req.destroy();await new Promise(resolve=>setTimeout(resolve,25));
  assert.notEqual((await f.call(A,listed)).status,429);
 }finally{for(const req of held)req.destroy();await f.close();}
});


test('two same-token clients initialize and list tools in parallel',async()=>{
 const f=await fixture({concurrentRequests:4,bucketCapacity:40,refillMs:1000});try{
  const sessions=await Promise.all([f.init(A),f.init(A)]);assert.notEqual(sessions[0],sessions[1]);
  const streams=await Promise.all(sessions.map(id=>f.open(A,id)));assert.ok(streams.every(stream=>stream.statusCode===200));
  const results=await Promise.all(sessions.map(id=>f.call(A,listed,id)));assert.ok(results.every(result=>result.status===200&&Array.isArray(result.body.result.tools)));
 }finally{await f.close();}
});

test('session existence checks expire idle sessions without a subsequent POST sweep',async()=>{
 const {ServiceMcpRuntime}=await import('../dist/service-node.mjs');
 const {ServiceTraversalEventRing}=await import('../dist/service.mjs');
 let clock=1000;const runtime=new ServiceMcpRuntime(new ServiceTraversalEventRing(),8,1000,()=>clock);
 const identity=defaultMcpAgentBinding(A,{credentialId:'credential:ttl',agentId:'018f47a3-7b5e-7c9d-8a1b-123456789ab1',agentLabel:'TTL',sensitivityCeiling:'internal',revoked:false}).identity;
 const reply=await runtime.handle({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL_VERSION,capabilities:{},clientInfo:{name:'ttl',version:'1'}}},null,{identity,view:{credential_id:identity.credentialId,agent_id:identity.agentId,sensitivity_ceiling:identity.sensitivityCeiling},generation:1,policyDecisionId:'018f47a3-7b5e-7c9d-8a1b-123456789ab2',vaultId:'ttl'});
 assert.ok(reply.sessionId);assert.equal(runtime.has(reply.sessionId,identity),true);clock=2001;assert.equal(runtime.has(reply.sessionId,identity),false);
});
