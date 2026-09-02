import test from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,linkSync,mkdirSync,mkdtempSync,readFileSync,rmSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startWatcherHost,openWatcherDirectory,readWatcherPointer,readWatcherCoherentManifest} from '../dist/watcher-host.mjs';
import {detectSqliteLexicalCapability} from '../dist/retrieval.mjs';

test('restart and unchanged retry reopen coherent topology/graph larger than 1 MiB without changing authority',async(t)=>{
 const sandbox=mkdtempSync(join(tmpdir(),'gkos-large-restart-')),vault=join(sandbox,'vault'),status=join(sandbox,'status');
 chmodSync(sandbox,0o700);mkdirSync(vault,{mode:0o700});mkdirSync(status,{mode:0o700});
 writeFileSync(join(status,'desktop-agent.token'),'fixture-large-restart\n',{mode:0o600});
 const digest='sha256:'+'a'.repeat(64),count=3000;
 for(let i=0;i<count;i++)writeFileSync(join(vault,`note-${String(i).padStart(4,'0')}-${'x'.repeat(130)}.md`),`---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-${String(i).padStart(12,'0')}"\ntitle: "Fixture ${i}"\ntype: "note"\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\nRestart fixture ${i}.\n`,{mode:0o600});
 const options={vault_root:vault,status_file:join(status,'status.json'),vault_id:'vault',configuration_digest:digest,policy_digest:digest,periodic_reconciliation_ms:60000,coordinator_options:{discoverability_policy:()=> 'allow',source_discoverability_policy:()=> 'allow'}};
 let host;
 try{
  host=await startWatcherHost(options);assert.equal(host.status().document_count,count);
  const watcher=join(vault,'.gkx','derived','watcher'),root=openWatcherDirectory(watcher),pointer=readWatcherPointer(root,'outer'),manifest=readWatcherCoherentManifest(root,pointer);
  assert.equal(manifest.retrieval_projection_state.lexical_backend,detectSqliteLexicalCapability().default_backend,
    'watcher binds the runtime-selected concrete lexical backend');
  t.diagnostic(JSON.stringify({topology_bytes:statSync(join(watcher,manifest.topology_artifact_file)).size,graph_bytes:statSync(join(watcher,manifest.graph_projection_state.graph_artifact_file)).size}));
  assert.ok(statSync(join(watcher,manifest.topology_artifact_file)).size>1048576);
  assert.ok(statSync(join(watcher,manifest.graph_projection_state.graph_artifact_file)).size>1048576);
  const before=readFileSync(join(watcher,'watcher-active.json'));
  // A prior failed observation forces restart to reconstruct the historical
  // pre-scan authority; a clean large-vault restart alone misses this branch.
  const unstable=join(vault,'unstable.md'),alias=join(vault,'unstable-alias.md');
  writeFileSync(unstable,'# unstable\n',{mode:0o600});linkSync(unstable,alias);
  await assert.rejects(()=>host.reconcile('event'),/WATCHER_SOURCE_CAPABILITY_UNSTABLE/);
  await host.shutdown();await host.closed;host=null;
  unlinkSync(alias);unlinkSync(unstable);
  host=await startWatcherHost(options);assert.equal(host.status().document_count,count);
  assert.deepEqual(readFileSync(join(watcher,'watcher-active.json')),before);
  await host.reconcile('event');assert.deepEqual(readFileSync(join(watcher,'watcher-active.json')),before);
 }finally{if(host){await host.shutdown();await host.closed;}await new Promise(r=>setImmediate(r));rmSync(sandbox,{recursive:true,force:true});}
});
