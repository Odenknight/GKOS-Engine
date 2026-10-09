import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createLocalServiceServer,defaultMcpAgentBinding,ServiceCredentialRegistry,MCP_PROTOCOL_VERSION} from '../dist/service-node.mjs';
import {GkxIndex} from '../dist/gkos-engine.mjs';

test('native initialize disconnected during snapshot does not consume a session slot', {timeout:10000}, async()=>{
 const token='i'.repeat(64),index=new GkxIndex();index.setFiles([],[]);
 const credentials=new ServiceCredentialRegistry([defaultMcpAgentBinding(token,{credentialId:'credential:init-abort',agentId:'018f47a3-7b5e-7c9d-8a1b-123456789ab0',agentLabel:'Init abort',sensitivityCeiling:'internal',revoked:false,limits:{concurrentRequests:4,bucketCapacity:40,refillMs:1000}})]);
 let release,started;const held=new Promise(r=>release=r),entered=new Promise(r=>started=r);let hold=false;
 const server=createLocalServiceServer({credentials,snapshot:async()=>{if(hold){hold=false;started();await held;}return {graph:index.graph,generation:1,sourceRecords:[]};},authorization:()=>({configured:true,generation:1,policyDigest:'sha256:'+'a'.repeat(64)}),status:()=>({state:'serving'})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 function call(message,session){let request;const promise=new Promise((resolve,reject)=>{const body=JSON.stringify(message);request=http.request({host:'127.0.0.1',port,path:'/mcp',method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','content-length':Buffer.byteLength(body),...(session?{'mcp-session-id':session,'mcp-protocol-version':MCP_PROTOCOL_VERSION}:{})}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,session:res.headers['mcp-session-id'],body:text?JSON.parse(text):null}));});request.once('error',reject);request.end(body);});return {promise,abort:()=>request.destroy()};}
 const init=()=>call({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL_VERSION,capabilities:{},clientInfo:{name:'abort-regression',version:'1'}}});
 try{
  const survivor=await init().promise;assert.ok(survivor.session);
  hold=true;let closed;const responseClosed=new Promise(r=>closed=r);server.once('request',(_req,res)=>res.once('close',closed));
  const abandoned=init(),rejected=abandoned.promise.catch(()=>null);await entered;abandoned.abort();await responseClosed;await rejected;release();await new Promise(r=>setImmediate(r));
  // The abandoned request must not occupy the eighth per-agent slot.
  for(let i=0;i<7;i++){const result=await init().promise;assert.equal(result.status,200);assert.ok(result.session,`available slot ${i+2}: ${JSON.stringify(result.body)}`);}
  const full=await init().promise;assert.equal(full.session,undefined);assert.ok(full.body.error,'the existing eight-session ceiling remains enforced');
  assert.equal((await call({jsonrpc:'2.0',method:'notifications/initialized'},survivor.session).promise).status,202);
  assert.equal((await call({jsonrpc:'2.0',id:2,method:'tools/list'},survivor.session).promise).status,200);
 }finally{release();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
