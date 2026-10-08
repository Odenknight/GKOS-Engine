import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,chmodSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {startWatcherHost,readWatcherPointer} from '../dist/watcher-host.mjs';
import {detectSqliteLexicalCapability} from '../dist/retrieval.mjs';
const DIGEST='sha256:'+'a'.repeat(64);
const enabled=detectSqliteLexicalCapability().fts5_available;
const note=(sensitivity,body)=>'---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Fixture"\ntype: policy\ncreated_at: "2026-08-20T00:00:00Z"\nepistemic_state: reported\nsensitivity: '+sensitivity+'\n---\n# Fixture\n'+body+'\n';
function bytes(root,prefix='',excludeSharedMemory=false){
 return readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
  if(excludeSharedMemory&&entry.name.endsWith('.sqlite-shm'))return [];
  const path=join(root,entry.name),name=prefix+entry.name;
  if(entry.isDirectory())return bytes(path,name+'/',excludeSharedMemory);
  assert.ok(entry.isFile());return [[name,createHash('sha256').update(readFileSync(path)).digest('hex')]];
 });
}
async function fixture(){
 const root=mkdtempSync(join(tmpdir(),'gkos-watcher-fast-'));
 if(process.platform!=='win32')chmodSync(root,0o700);
 const vault=join(root,'vault'),status=join(root,'status'),profile=join(root,'profile.toml');
 mkdirSync(join(vault,'.gkx','derived'),{recursive:true,mode:0o700});mkdirSync(status,{mode:0o700});
 writeFileSync(join(status,'desktop-agent.token'),'synthetic-fastpath-token\n',{mode:0o600});
 writeFileSync(join(vault,'Fixture.md'),note('public','initialneedle'),{mode:0o600});
 writeFileSync(profile,'contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"\nprofile_id = "fast-initial"\n',{mode:0o600});
 const executions=[];
 const options={vault_root:vault,status_file:join(status,'desktop-agent-status.json'),vault_id:'vault',configuration_digest:DIGEST,policy_digest:DIGEST,profile_selector:profile,periodic_reconciliation_ms:60000,unchanged_scan_fast_path:true,on_index_execution:e=>executions.push(e),coordinator_options:{
  discoverability_policy:r=>r.metadata.sensitivity==='public'?'allow':'deny',source_discoverability_policy:r=>r.metadata.sensitivity==='public'?'allow':'deny'
 }};
 const host=await startWatcherHost(options);
 return {root,vault,profile,options,executions,host,async close(){await host.shutdown();await host.closed;await new Promise(r=>setImmediate(r));assert.ok(resolve(root).startsWith(resolve(tmpdir())+'/gkos-watcher-fast-')||resolve(root).startsWith(resolve(tmpdir())+'\\gkos-watcher-fast-'));rmSync(root,{recursive:true,force:true});}};
}
test('opt-in unchanged secure scan avoids reparse and preserves pointer, retrieval bytes and durable journal bytes',{skip:!enabled},async()=>{
 const f=await fixture();
 try {
  assert.ok(f.executions.length>0,'startup must perform full validation');
  const count=f.executions.length,pointer=readWatcherPointer(f.host.watcher_directory,'outer'),retrieval=bytes(f.host.retrieval_directory.path);
  // The host owns an exclusive SQLite connection. Synchronously hash the
  // quiescent DB, WAL and authority files without opening a second connection.
  // Matching DB+WAL bytes prove logical rows unchanged; SHM is transient locks.
  const journal=bytes(f.host.journal_directory.path,'',true);
  for(let i=0;i<3;i++)await f.host.reconcile('event');
  assert.equal(f.executions.length,count,'no validation callback on a proven unchanged fast path');
  assert.deepEqual(readWatcherPointer(f.host.watcher_directory,'outer'),pointer);
  assert.deepEqual(bytes(f.host.retrieval_directory.path),retrieval);
  assert.deepEqual(bytes(f.host.journal_directory.path,'',true),journal,'fast path must not change durable journal or activation authority bytes');
 } finally {await f.close();}
});
test('same-size source edits and sensitivity reclassification cannot pass the unchanged gate',{skip:!enabled},async()=>{
 const f=await fixture();
 try {
  const initial=f.executions.length;
  writeFileSync(join(f.vault,'Fixture.md'),note('public','changedneedle'));
  await f.host.reconcile('event');
  assert.ok(f.executions.length>initial);
  const found=await f.host.search({query:'changedneedle',limit:5});assert.equal(found.hits.length,1);
  assert.equal((await f.host.search({query:'initialneedle',limit:5})).hits.length,0);
  const changed=f.executions.length;
  writeFileSync(join(f.vault,'Fixture.md'),note('secret','changedneedle'));
  await f.host.reconcile('event');
  assert.ok(f.executions.length>changed);
  assert.equal((await f.host.search({query:'changedneedle',limit:5})).hits.length,0,'new secret classification is enforced');
 } finally {await f.close();}
});
test('changed effective profile and invalid activation pointer never receive unchanged admission',{skip:!enabled},async()=>{
 const f=await fixture();
 try {
  const count=f.executions.length;
  writeFileSync(f.profile,'contract_version = "gkos-frontmatter-profile/1.0.0-draft.1"\nprofile_id = "fast-changed"\n');
  let rejected=false;try{await f.host.reconcile('event');}catch{rejected=true;}
  assert.ok(rejected||f.executions.length>count,'profile drift must fail or validate, never silently skip');
  const pointerPath=join(f.host.watcher_directory.path,'watcher-active.json');
  const original=readFileSync(pointerPath);
  try {
   writeFileSync(pointerPath,'{"invalid":"synthetic authority tamper"}\n');
   await assert.rejects(f.host.reconcile('event'));
  } finally {writeFileSync(pointerPath,original);}
 } finally {await f.close();}
});
