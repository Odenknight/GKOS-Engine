import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {fork,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {join,resolve,dirname} from 'node:path';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync,openSync,fsyncSync,closeSync,renameSync,existsSync} from 'node:fs';
import {release} from 'node:os';
const self=fileURLToPath(import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
const configPath=resolve(process.argv[2]);
const config=JSON.parse(readFileSync(configPath,'utf8'));
const worker=process.argv[3]==='worker';
const root=resolve(config.output);
const atomic=(path,value)=>{const tmp=path+'.tmp';const fd=openSync(tmp,'w',0o600);try{writeFileSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd);}finally{closeSync(fd);}renameSync(tmp,path);};
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const commandEnvironment={node:process.version,platform:process.platform,osRelease:release()};
assert.equal(config.sourceCommit,'aa2e10d16983b6cbd4107464f376d87d3c546db3');
assert.equal(config.tarballSha256,'8b4cc0eb16be7c07b61f66d684e4b50810f94dd4a766b7a82195d48baed6c48a');
assert.equal(hash(readFileSync(config.tarball)),config.tarballSha256);
assert.ok(['pilot','qualification'].includes(config.mode));
assert.equal(config.durationMs,config.mode==='qualification'?86400000:180000);
assert.equal(config.intervalMs,config.mode==='qualification'?120000:15000);
const installed=read(join(config.consumer,'node_modules/.package-lock.json')).packages['node_modules/gkos-engine'];
assert.equal(installed.integrity,'sha512-'+createHash('sha512').update(readFileSync(config.tarball)).digest('base64'));
const inventory=read(config.inventory);
for(const row of inventory)assert.equal(hash(readFileSync(join(config.consumer,'node_modules/gkos-engine',row.path))),row.sha256);
const harnessSha256=hash(readFileSync(self));
if(!worker){
 assert.ok(!existsSync(root),'A soak run directory is immutable and cannot be resumed or overwritten');mkdirSync(root,{recursive:true,mode:0o700});
 const started=Date.now();
 const plan={schema:'gkos-native-soak-plan/1',...config,harnessSha256,environment:commandEnvironment,startedAt:new Date(started).toISOString(),startedMs:started,endMs:started+config.durationMs,restarts:[.25,.5,.75].map((f,i)=>({at:started+config.durationMs*f,kind:i===1?'hard':'graceful'})),corpusNotes:128,mocTargets:1,queryRoundsPerCycle:5,limits:{rssBytes:768*1024*1024,diskBytes:2*1024**3,handleGrowth:64,rssGrowthBytes:192*1024*1024,queryP95Ms:500,cycleMs:30000},scope:'Persistent native watcher with real SQLite FTS5 and deterministic local fixture vectors; independent managed-MOC vault; public incremental parser and clean graph convergence. No real ONNX inference claim.'};
 atomic(join(root,'plan.json'),plan);
 const summary={schema:'gkos-native-soak-summary/1',sourceCommit:config.sourceCommit,tarballSha256:config.tarballSha256,harnessSha256,status:'RUNNING',mode:config.mode,startedAt:plan.startedAt,events:[],releaseQualified:false};
 const save=()=>atomic(join(root,'summary.json'),summary);save();
 let segment=0;
 try{
  while(Date.now()<plan.endMs){
   const next=plan.restarts[segment]??{at:plan.endMs,kind:'complete'};
   let requested=null;const log=openSync(join(root,`worker-${segment}.log`),'wx',0o600);
   const child=fork(self,[configPath,'worker',String(segment)],{stdio:['ignore',log,log,'ipc'],windowsHide:true});
   child.on('message',message=>{if(message?.type==='planned-restart'){assert.equal(message.kind,next.kind);requested=message.kind;if(requested==='hard')child.kill('SIGKILL');}});
   const watchdog=setInterval(()=>{if(Date.now()>next.at+90000)child.kill('SIGKILL');},1000);
   const exit=await new Promise((res,rej)=>{child.once('error',rej);child.once('exit',(code,signal)=>res({code,signal}));});clearInterval(watchdog);closeSync(log);
   summary.events.push({segment,requested,...exit,at:new Date().toISOString()});save();
   if(requested==='hard'){assert.ok(exit.signal==='SIGKILL'||exit.code!==0);assert.ok(Date.now()>=next.at);}
   else {assert.equal(exit.code,0);assert.equal(requested,next.kind);}
   segment++;
  }
  const checkpoint=read(join(root,'checkpoint.json'));
  assert.ok(checkpoint.cycle>=Math.floor(config.durationMs/config.intervalMs)*.9);
  assert.equal(summary.events.length,4);assert.ok(Date.now()-started>=config.durationMs);
  summary.status=config.mode==='qualification'?'PASS':'PILOT_PASS';summary.cycles=checkpoint.cycle;
 }catch(error){summary.status='FAIL';summary.failureCode='SOAK_FAILED';summary.failureDetail=String(error.message).slice(0,240);process.exitCode=1;}
 summary.finishedAt=new Date().toISOString();save();console.log(JSON.stringify(summary));
}else{
 const plan=read(join(root,'plan.json'));assert.equal(plan.harnessSha256,harnessSha256);
 const segment=Number(process.argv[4]);const next=plan.restarts[segment]??{at:plan.endMs,kind:'complete'};
 const require=createRequire(join(config.consumer,'package.json'));
 const engine=await import(pathToFileURL(require.resolve('gkos-engine')).href);
 const nav=await import(pathToFileURL(require.resolve('gkos-engine/navigation')).href);
 const {NodeManagedMocHost}=await import(pathToFileURL(require.resolve('gkos-engine/navigation-effects/node')).href);
 const watcher=await import(pathToFileURL(join(config.consumer,'node_modules/gkos-engine/dist/watcher-host.mjs')).href);
 assert.equal(engine.ENGINE_VERSION,'2.2.0');
 const vault=join(root,'vault'),mocVault=join(root,'moc-vault'),status=join(root,'status');
 for(const p of [vault,mocVault,status,join(mocVault,'notes'),join(root,'cycles')])mkdirSync(p,{recursive:true,mode:0o700});
 if(!existsSync(join(status,'desktop-agent.token')))writeFileSync(join(status,'desktop-agent.token'),randomBytes(32).toString('hex')+'\n',{mode:0o600,flag:'wx'});
 const checkpointPath=join(root,'checkpoint.json');const prior=existsSync(checkpointPath)?read(checkpointPath):null;
 let cycle=prior?.cycle??0;const revisions=prior?.revisions??Array(128).fill(0);
 const path=i=>`note-${String(i).padStart(3,'0')}.md`;
 const text=(i,r)=>`---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-${String(i).padStart(12,'0')}"\ntitle: "Soak ${i} revision ${r}"\ntype: "note"\ncreated_at: "2026-09-08T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Soak ${i}\nsoakneedle${String(i).padStart(3,'0')} deterministic revision ${r}.\n`;
 const files=revisions.map((r,i)=>({relativePath:path(i),name:path(i),kind:'note',createdTime:1788825600000,modifiedTime:1788825600000,title:`Soak ${i} revision ${r}`,sensitivity:'public',content:text(i,r)}));
 for(let i=0;i<files.length;i++){const p=join(vault,path(i));if(!prior)writeFileSync(p,files[i].content,{mode:0o600,flag:'wx'});else assert.equal(readFileSync(p,'utf8'),files[i].content);}
 const fixtureDigest=await engine.canonicalSha256(files);
 const index=new engine.GkxIndex({defaultSensitivity:'secret'});index.setFiles(files,[]);assert.equal(index.parseCount,128);
 let providerItems=0,providerCalls=0,indexExecutions=[];
 const digest='sha256:'+'a'.repeat(64);
 let getSnapshot;
 const started=performance.now();
 const host=await watcher.startWatcherHost({vault_root:vault,status_file:join(status,'status.json'),vault_id:'soak',configuration_digest:digest,policy_digest:digest,periodic_reconciliation_ms:60000,on_index_execution:r=>{indexExecutions.push(r);if(indexExecutions.length>1024)throw Error('EXECUTION_EVENT_GROWTH');},create_compatibility_request_handler:context=>{getSnapshot=context.get_snapshot;return async()=>false;},coordinator_options:{discoverability_policy:()=> 'allow',source_discoverability_policy:()=> 'allow',vector_provider:{kind:'local_onnx',provider_id:'soak.deterministic-fixture',model_id:'fixture-2d-v1',dimensions:2,timeout_ms:5000,async embed(texts){providerCalls++;providerItems+=texts.length;return texts.map(t=>Float32Array.from([t.length,t.charCodeAt(0)||1]));}}}});
 host.closed.catch(()=>{});
 assert.equal(host.status().document_count,128);
 const policyRef={id:'soak',version:'1',digest:'sha256:'+'b'.repeat(64)};
 const configNav=await nav.buildVaultNavigationConfig({configId:'01990ac0-0000-7000-8000-000000000001',version:1,vaultId:'soak',promotedMocNames:[],createdAt:'2026-09-08T00:00:00Z',createdBy:'soak',policy:policyRef});
 const context={snapshot:{vaultId:'soak',sources:files.map(f=>({...f,relativePath:'notes/'+f.relativePath}))},config:configNav,policyRef,allowedSensitivities:['public'],targets:[{path:'notes/index.md',ownership:{targetPath:'notes/index.md',ownership:'fully-managed',creationAuthorized:true},authority:{actor:{actorId:'soak',actorType:'system'},grantId:'soak',allowedRoot:'notes',capability:'moc:apply',sensitivityCeiling:'public',policyRef}}]};
 const moc=new NodeManagedMocHost({vaultRoot:mocVault,pathThreatModel:'cooperative-vault',snapshot:async()=>context,validatePreconditions:()=>[]});assert.equal(await moc.start(Date.now()),true);
 const recoveryMs=performance.now()-started;
 let previousJournal=(await moc.executor.journal.load()).at(-1).sequence;
 let baseline=null;
 function disk(p){let bytes=0,count=0;for(const item of readdirSync(p,{withFileTypes:true})){const target=join(p,item.name);if(item.isDirectory()){const nested=disk(target);bytes+=nested.bytes;count+=nested.count;}else{bytes+=statSync(target).size;count++;}}return {bytes,count};}
 function resources(){
  if(process.platform==='win32')return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${process.pid};$c=@(Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${process.pid}' | Where-Object { $_.ProcessId -ne $PID });@{handles=$p.HandleCount;children=$c.Count}|ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true,timeout:15000}));
  const children=readFileSync(`/proc/${process.pid}/task/${process.pid}/children`,'utf8').trim();return {handles:readdirSync(`/proc/${process.pid}/fd`).length,children:children?children.split(/\s+/).length:0};
 }
 try{
  while(Date.now()<next.at){
   const tick=performance.now();const changedCount=cycle%3===0?0:cycle%3===1?1:8;
   providerItems=0;providerCalls=0;indexExecutions=[];
   const changed=[];for(let i=0;i<changedCount;i++){revisions[i]++;files[i]={...files[i],title:`Soak ${i} revision ${revisions[i]}`,content:text(i,revisions[i])};writeFileSync(join(vault,path(i)),files[i].content);changed.push(files[i]);}
   const beforeParse=index.parseCount;index.applyChanges({changed:changedCount?changed:files});assert.equal(index.parseCount-beforeParse,changedCount);
   await host.reconcile('event');assert.equal(host.status().document_count,128);
   const embedding={items:providerItems,calls:providerCalls};assert.equal(embedding.items,changedCount,'only changed chunks may be embedded');
   const fresh=new engine.GkxIndex({defaultSensitivity:'secret'});fresh.setFiles(files,[]);
   const graphDigest=await engine.canonicalSha256({nodes:index.graph.nodes,links:index.graph.links});assert.equal(graphDigest,await engine.canonicalSha256({nodes:fresh.graph.nodes,links:fresh.graph.links}));
   const indexMs=performance.now()-tick;
   const latencies=[];let resultDigest=null;
   for(let q=0;q<5;q++){const start=performance.now();const result=await host.search({query:'soakneedle000',limit:1});latencies.push(performance.now()-start);assert.equal(result.hits.length,1);assert.ok(result.hits[0].citation.matched_spans.some(s=>s.text==='soakneedle000'));const d=await engine.canonicalSha256(result.hits);if(resultDigest)assert.equal(d,resultDigest);resultDigest=d;}
   const p95=latencies.sort((a,b)=>a-b)[4];assert.ok(p95<plan.limits.queryP95Ms,'query p95 exceeded');
   context.snapshot.sources=files.map(f=>({...f,relativePath:'notes/'+f.relativePath}));
   const mocStarted=performance.now();await moc.coordinator.requestReconciliation(Date.now());await moc.coordinator.tick(Date.now(),true);
   const journal=await moc.executor.journal.load();assert.ok(journal.at(-1).sequence>previousJournal);previousJournal=journal.at(-1).sequence;
   assert.equal(journal.at(-1).state,'COMMITTED');const mocMs=performance.now()-mocStarted;
   const mem=process.memoryUsage();const os=resources();const storage=disk(root);assert.equal(os.children,0);assert.ok(mem.rss<plan.limits.rssBytes);assert.ok(storage.bytes<plan.limits.diskBytes);
   if(!baseline&&cycle%100000>=3)baseline={handles:os.handles,rss:mem.rss};
   if(baseline){assert.ok(os.handles<=baseline.handles+plan.limits.handleGrowth,'handle growth');assert.ok(mem.rss<=baseline.rss+plan.limits.rssGrowthBytes,'memory growth');}
   assert.ok(performance.now()-tick<plan.limits.cycleMs,'cycle latency');
   const receipt={schema:'gkos-native-soak-cycle/1',sourceCommit:config.sourceCommit,tarballSha256:config.tarballSha256,segment,cycle:cycle+1,at:new Date().toISOString(),changedCount,parseCountDelta:index.parseCount-beforeParse,embedding,indexExecutions,indexMs,mocMs,queryP50Ms:latencies[2],queryP95Ms:p95,resultDigest,graphDigest,fixtureDigest:await engine.canonicalSha256(files),journalSequence:previousJournal,resources:{...os,...mem,diskBytes:storage.bytes,diskFiles:storage.count},recoveryMs:cycle===(prior?.cycle??0)?recoveryMs:null,status:'PASS'};
   atomic(join(root,'cycles',String(cycle+1).padStart(5,'0')+'.json'),receipt);cycle++;
   atomic(checkpointPath,{cycle,revisions,graphDigest,resultDigest,journalSequence:previousJournal});
   await delay(Math.max(0,Math.min(config.intervalMs-(performance.now()-tick),next.at-Date.now())));
  }
  if(next.kind!=='hard'){await host.shutdown();await host.closed;await moc.shutdown();}
  process.send({type:'planned-restart',kind:next.kind});
  if(next.kind==='hard')await new Promise(()=>{});else process.exit(0);
 }catch(error){atomic(join(root,`failure-${segment}.json`),{status:'FAIL',code:'SOAK_OPERATION_FAILED',message:String(error.message).slice(0,240),cycle,at:new Date().toISOString()});try{await host.shutdown();await moc.shutdown();}catch{}throw error;}
}
