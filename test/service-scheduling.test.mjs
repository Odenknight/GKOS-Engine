import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {ServiceWorkScheduler,createLocalServiceServer,defaultMcpAgentBinding,ServiceCredentialRegistry,MCP_PROTOCOL_VERSION} from '../dist/service-node.mjs';
import {GkxIndex} from '../dist/gkos-engine.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const signal=()=>new AbortController();
const queue=(scheduler,cred,session,controller=signal(),valid=()=>true)=>scheduler.acquire(cred,session,valid,controller.signal);
test('scheduler credential turns precede session turns and enforces one active lease per session',async()=>{
 const s=new ServiceWorkScheduler();const held=[];try{
  held.push(await queue(s,'block','1'),await queue(s,'block','2'));
  const order=[];const a1=queue(s,'A','1').then(release=>{order.push('A1');return release;});const a2=queue(s,'A','2').then(release=>{order.push('A2');return release;});const b=queue(s,'B','1').then(release=>{order.push('B');return release;});
  held.shift()();const ra=await a1;held.shift()();const rb=await b;assert.deepEqual(order,['A1','B']);
  let duplicateAdmitted=false;const duplicate=queue(s,'A','1').then(release=>{duplicateAdmitted=true;return release;});
  rb();const ra2=await a2;await tick();assert.equal(duplicateAdmitted,false);ra();const rd=await duplicate;rd();ra2();
 }finally{for(const release of held)release();s.close();}
});
test('scheduler bounds queues, times out and cancels queued requests without releasing active work',async()=>{
 const keepAlive=setTimeout(()=>{},5000);const s=new ServiceWorkScheduler(1000);const activeAbort=signal();const r1=await queue(s,'A','1',activeAbort),r2=await queue(s,'B','1');
 try{
  const q1=queue(s,'A','1').catch(error=>error.reason),q2=queue(s,'A','1').catch(error=>error.reason);
  await assert.rejects(queue(s,'A','1'),error=>error.reason==='session_queue_capacity');
  activeAbort.abort();let admitted=false;const c=signal();const q3=queue(s,'C','1',c).then(release=>{admitted=true;release();},error=>error.reason);c.abort();assert.equal(await q3,'work_cancelled');await tick();assert.equal(admitted,false);
  assert.equal(await q1,'work_queue_timeout');assert.equal(await q2,'work_queue_timeout');
  const gone=queue(s,'D','1').catch(error=>error.reason);s.cancelSession('D','1');assert.equal(await gone,'work_session_closed');
  let valid=true;const revoked=queue(s,'E','1',signal(),()=>valid).catch(error=>error.reason);valid=false;assert.equal(await revoked,'work_authorization_changed');
  const stop=queue(s,'F','1').catch(error=>error.reason);s.close();assert.equal(await stop,'work_shutdown');await assert.rejects(queue(s,'F','2'),error=>error.reason==='work_shutdown');
 }finally{clearTimeout(keepAlive);r1();r2();s.close();}
});
test('scheduler global and per-credential queue ceilings remain bounded across many sessions',async()=>{
 const s=new ServiceWorkScheduler();const a=await queue(s,'held','1'),b=await queue(s,'held','2');const pending=[];
 try{
  for(let i=0;i<8;i++)pending.push(queue(s,'A','s'+i).catch(error=>error.reason));
  await assert.rejects(queue(s,'A','extra'),error=>error.reason==='credential_queue_capacity');
  for(let i=0;i<8;i++)pending.push(queue(s,'B','s'+i).catch(error=>error.reason));
  await assert.rejects(queue(s,'C','extra'),error=>error.reason==='work_queue_capacity');
  s.close();assert.ok((await Promise.all(pending)).every(reason=>reason==='work_shutdown'));
 }finally{a();b();s.close();}
});
async function serverFixture(){
 const token='s'.repeat(64),other='t'.repeat(64),gates=[],started=[];
 const file={relativePath:'Note.md',extension:'md',createdTime:Date.parse('2026-08-30T00:00:00Z'),content:'---\ngkx_version: "2.3"\nuid: "550e8400-e29b-41d4-a716-446655449555"\ntitle: Note\ntype: note\ncreated_at: 2026-08-30T00:00:00Z\nepistemic_state: observation\nsensitivity: internal\n---\n# Note\nTest body.'};
 const index=new GkxIndex();index.setFiles([file],[]);
 const credentials=new ServiceCredentialRegistry([token,other].map((value,i)=>defaultMcpAgentBinding(value,{credentialId:'credential:scheduler'+i,agentId:'018f47a3-7b5e-7c9d-8a1b-123456789ab'+i,agentLabel:'Scheduler',sensitivityCeiling:'internal',revoked:false,limits:{concurrentRequests:4,bucketCapacity:40,refillMs:1000}})));
 const server=createLocalServiceServer({credentials,snapshot:()=>({graph:index.graph,generation:1,sourceRecords:[file]}),authorization:()=>({configured:true,generation:1,policyDigest:'sha256:'+'a'.repeat(64)}),status:()=>({state:'serving'}),workQueueWaitMs:1000,retrievalSearch:async()=>{started.push(1);await new Promise(resolve=>gates.push(resolve));throw Error('synthetic-work-finished');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
 function call(body,session,credential=token,method='POST') {let request;const promise=new Promise((resolve,reject)=>{const data=body?JSON.stringify(body):'';request=http.request({host:'127.0.0.1',port,path:'/mcp',method,headers:{authorization:'Bearer '+credential,'content-type':'application/json','content-length':Buffer.byteLength(data),...(session?{'mcp-session-id':session,'mcp-protocol-version':MCP_PROTOCOL_VERSION}:{})}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:text?JSON.parse(text):null}));});request.on('error',reject);request.end(data);});return{promise,abort:()=>request.destroy()};}
 const init=async(credential=token)=>{const reply=await call({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL_VERSION,capabilities:{},clientInfo:{name:'scheduler',version:'1'}}},null,credential).promise;const session=reply.headers['mcp-session-id'];assert.ok(session);await call({jsonrpc:'2.0',method:'notifications/initialized'},session,credential).promise;return session;};
 const search=session=>call({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'gkos_search',arguments:{query:'test',cursor:null,limit:1}}},session);
 return{server,call,init,search,token,other,credentials,gates,started,async waitFor(count){for(let i=0;i<100&&started.length<count;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(started.length,count);},async close(){for(const gate of gates)gate();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
test('HTTP setup remains available while work is active; disconnected queue and deleted session cannot execute',async()=>{
 const f=await serverFixture();try{
  const sessions=await Promise.all([f.init(),f.init(),f.init()]);const a=f.search(sessions[0]),b=f.search(sessions[1]);await f.waitFor(2);
  const setup=await f.init();const listed=await f.call({jsonrpc:'2.0',id:3,method:'tools/list'},setup).promise;assert.equal(listed.status,200);
  const queued=f.search(sessions[2]);const aborted=queued.promise.catch(()=>null);queued.abort();await aborted;
  const deleted=f.search(sessions[2]);const deletedPromise=deleted.promise;await tick();assert.equal((await f.call(null,sessions[2],f.token,'DELETE').promise).status,204);const result=await deletedPromise;assert.ok([403,429].includes(result.status));
  assert.equal(f.started.length,2);for(const gate of f.gates)gate();await Promise.all([a.promise,b.promise]);assert.equal(f.started.length,2);
 }finally{await f.close();}
});
test('HTTP queued revocation cannot invoke work after admission becomes possible',async()=>{
 const f=await serverFixture();try{
  const sessions=await Promise.all([f.init(),f.init(),f.init()]);const a=f.search(sessions[0]),b=f.search(sessions[1]);await f.waitFor(2);
  const queued=f.search(sessions[2]);await new Promise(resolve=>setTimeout(resolve,20));f.credentials.setRevoked('credential:scheduler0',true);
  for(const gate of f.gates)gate();const result=await queued.promise;assert.ok([401,403,429].includes(result.status));await Promise.all([a.promise,b.promise]);assert.equal(f.started.length,2);
  assert.ok(await f.init(f.other));
 }finally{await f.close();}
});


test('scheduler respects a credential configured below the global work ceiling',async()=>{
 const s=new ServiceWorkScheduler();const first=await s.acquire('limited','one',()=>true,signal().signal,1);
 try {
  let started=false;const next=s.acquire('limited','two',()=>true,signal().signal,1).then(release=>{started=true;return release;});
  const other=await queue(s,'other','one');await tick();assert.equal(started,false);other();await tick();assert.equal(started,false);first();(await next)();
  await assert.rejects(s.acquire('limited','three',()=>true,signal().signal,2),error=>error.reason==='work_configuration_invalid');
 }finally{first();s.close();}
});
