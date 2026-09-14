import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {GkxIndex} from '../dist/gkos-engine.mjs';
import {createLocalServiceServer,ServiceCredentialRegistry,legacyViewerBinding} from '../dist/service-node.mjs';
import {graphitiHttpQuery} from '../dist/graphiti-broker.mjs';

const child=spawn(process.env.PYTHON ?? 'python',['-X','utf8','services/gkos-graphiti/qualify_http_chain.py'],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:['pipe','pipe','pipe'],windowsHide:true,
});
const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
const exited=once(child,'exit');
let server;
const watchdog=setTimeout(()=>child.kill(),15000);
try {
  const first=await lines.next();
  assert.equal(first.done,false,'Python fixture must announce readiness');
  const fixture=JSON.parse(first.value);
  const token=randomBytes(32).toString('hex');
  const credentials=new ServiceCredentialRegistry([legacyViewerBinding(token,'internal')]);
  const index=new GkxIndex({defaultSensitivity:'internal'});
  index.setFiles([{relativePath:'Synthetic.md',kind:'note',content:'---\ngkx_version: "2.3"\nuid: "550e8400-e29b-41d4-a716-446655440000"\ntitle: Synthetic\ntype: note\nsensitivity: internal\n---\nSynthetic relay connects chamber'}],[]);
  const query=graphitiHttpQuery(`http://127.0.0.1:${fixture.port}/query`,{Authorization:`Bearer ${fixture.token}`});
  server=createLocalServiceServer({credentials,snapshot:()=>({graph:index.graph,generation:1}),
    authorization:()=>({configured:true,generation:1,policyDigest:fixture.binding.policy_digest}),status:()=>({state:'serving'}),
    graphitiHost:({view})=> {
      assert.equal(view.notes.length,1);
      return {query,current:()=>({decision:'allow',complete_dependency_scope:true,
        status:{contract_version:'gkos-graphiti-query/1.0.0-draft.1',mode:'managed',searchable:true,binding:fixture.binding},
        authorized_episodes:new Map([[fixture.mapping.projection_episode_id,fixture.mapping]])})};
    },
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const url=`http://127.0.0.1:${server.address().port}/graphiti/query`;
  const send=()=>fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:'relay',request_id:'chain',limit:5}),signal:AbortSignal.timeout(5000)});
  const response=await send(); assert.equal(response.status,200);
  const result=await response.json();
  assert.deepEqual(result.hits[0].citations,[fixture.mapping]);
  assert.equal(result.hits[0].semantic_support,'unverified');
  child.stdin.write('revoke\n'); assert.equal(JSON.parse((await lines.next()).value).revoked,true);
  const denied=await send(); assert.equal(denied.status,503);
  assert.equal((await denied.text()).includes('Synthetic relay'),false);
  console.log('PASS: Engine authentication -> TypeScript HTTP -> Python adapter -> published ledger citations; revoked ledger yields no result. SDK search is synthetic.');
} finally {
  if(server) await new Promise(resolve=>server.close(resolve));
  child.stdin.end('stop\n');
  await exited;
  clearTimeout(watchdog);
}
