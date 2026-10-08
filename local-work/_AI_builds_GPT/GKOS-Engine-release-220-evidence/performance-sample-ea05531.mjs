import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, mkdir, rm, readdir, statfs } from 'node:fs/promises';
import { tmpdir, release, cpus } from 'node:os';
import { join } from 'node:path';
import { GkxIndex, ENGINE_VERSION, canonicalSha256 } from 'gkos-engine';
import { buildVaultNavigationConfig } from 'gkos-engine/navigation';
import { NodeManagedMocHost } from 'gkos-engine/navigation-effects/node';

const expectedFixtures={"100":"sha256:1f5cf6f384256ad7166f13dee88837abc38107ddd521d89b369c9ea24470afe0","10000":"sha256:d5589706f08fbe0d946b176af73807c49af65c2909c34f169d1e21ee38035b9c","2000":"sha256:312589959226fbab6c85e71775cb4a14bf2693793afa0a3a43a54d6b563c7445","50000":"sha256:27dd367344c3d7c68d4577bbb71e67e2fac435439a0cb225da39c329c628b5b9"};
const commit='ea055319a50d93e0f1b181e478731b437a152f17';
const expected='f04705280acac74deab823683193a81a7c4dbf333791b33f6189226b709d593b';
const bytes=await readFile(process.argv[2]);
assert.equal(createHash('sha256').update(bytes).digest('hex'),expected);
const installed=JSON.parse(await readFile('node_modules/.package-lock.json','utf8')).packages['node_modules/gkos-engine'];
assert.equal(installed.integrity,'sha512-'+createHash('sha512').update(bytes).digest('base64'));
assert.equal(ENGINE_VERSION,'2.2.0');for(const row of JSON.parse(await readFile(process.argv[3],'utf8'))){assert.equal(createHash('sha256').update(await readFile(join('node_modules/gkos-engine',row.path))).digest('hex'),row.sha256);}
const out={schema:'gkos-native-performance-sample/1',sourceCommit:commit,tarballSha256:expected,platform:process.platform,osRelease:release(),node:process.version,cpu:cpus()[0]?.model,startedAt:new Date().toISOString(),status:'RUNNING',releaseQualified:false,rows:[],limitations:['One scoped MOC target includes 100 notes; full corpus is supplied to snapshot and graph indexing.','Single samples per tier do not establish end-to-end p95 or soak qualification.','Retrieval p50/p95 and embedding reuse are qualified separately by the separately versioned current 10000-chunk observation workload.']};
const save=()=>writeFile('performance-result-ea05531.json',JSON.stringify(out,null,2)+'\n');
const timed=async f=>{const t=performance.now();const value=await f();return {ms:performance.now()-t,value};};
const cold=performance.now();execFileSync(process.execPath,['--input-type=module','-e','await import("gkos-engine")'],{stdio:'pipe'});out.coldImportProcessMs=performance.now()-cold;
const policyRef={id:'benchmark',version:'1',digest:'sha256:'+'b'.repeat(64)};
const config=await buildVaultNavigationConfig({configId:'01990ac0-0000-7000-8000-000000000001',version:1,vaultId:'benchmark',promotedMocNames:[],createdAt:'2026-09-08T00:00:00Z',createdBy:'benchmark',policy:policyRef});
await save();
for(const count of [100,2000,10000,50000]){
 const root=await mkdtemp(join(tmpdir(),'gkos-perf-220-'));let host;
 const row={notes:count,targetCount:1,targetScopeNotes:100,status:'RUNNING'};out.rows.push(row);
 try{
  row.filesystemType=(await statfs(root)).type;
  await mkdir(join(root,'notes','000'),{recursive:true});
  const files=Array.from({length:count},(_,i)=>({relativePath:`notes/${String(Math.floor(i/100)).padStart(3,'0')}/n${i}.md`,kind:'note',createdTime:1788825600000,modifiedTime:1788825600000,title:`Note ${i}`,sensitivity:'public',content:`---\ntitle: Note ${i}\nsensitivity: public\n---\n# Note ${i}\nDeterministic performance fixture.\n`}));
  row.fixtureDigest=await canonicalSha256(files);assert.equal(row.fixtureDigest,expectedFixtures[count]);
  const index=new GkxIndex({defaultSensitivity:'secret'});
  row.initialParseGraphMs=(await timed(()=>index.setFiles(files,[]))).ms;assert.equal(index.parseCount,count);
  const context={snapshot:{vaultId:'benchmark',sources:files},config,policyRef,allowedSensitivities:['public'],targets:[{path:'notes/000/index.md',ownership:{targetPath:'notes/000/index.md',ownership:'fully-managed',creationAuthorized:true},authority:{actor:{actorId:'benchmark',actorType:'system'},grantId:'benchmark',allowedRoot:'notes',capability:'moc:apply',sensitivityCeiling:'public',policyRef}}]};
  const options={vaultRoot:root,pathThreatModel:'cooperative-vault',snapshot:async()=>context,validatePreconditions:()=>[]};
  host=new NodeManagedMocHost(options);row.initialMocMs=(await timed(async()=>assert.equal(await host.start(Date.now()),true))).ms;
  let before=index.parseCount;
  row.unchangedParseMs=(await timed(()=>index.applyChanges({changed:files}))).ms;assert.equal(index.parseCount,before);
  row.noopMocMs=(await timed(async()=>{await host.coordinator.requestReconciliation(Date.now());await host.coordinator.tick(Date.now(),true);})).ms;
  assert.equal((await readdir(join(root,'.gkx/effects/no-change'))).length,1);
  for(const changedCount of [1,50]){
   const start=performance.now();const changed=files.slice(0,changedCount).map((f,i)=>({...f,title:`Updated ${changedCount} ${i}`,content:f.content+`Revision ${changedCount}.\n`}));
   for(let i=0;i<changedCount;i++)files[i]=changed[i];
   before=index.parseCount;const parsed=await timed(()=>index.applyChanges({changed}));assert.equal(index.parseCount-before,changedCount);
   for(const f of changed)await host.coordinator.notify(f.relativePath,Date.now());
   await host.coordinator.tick(Date.now(),true);
   row[changedCount===1?'oneFile':'fiftyFiles']={reparsed:changedCount,parseGraphMs:parsed.ms,endToEndMocMs:performance.now()-start};
  }
  const fresh=new GkxIndex({defaultSensitivity:'secret'});row.cleanGraphRebuildMs=(await timed(()=>fresh.setFiles(files,[]))).ms;
  row.graphDigest=await canonicalSha256({nodes:index.graph.nodes,links:index.graph.links});
  if(row.graphDigest!==await canonicalSha256({nodes:fresh.graph.nodes,links:fresh.graph.links})){
   const differences=[];
   for(const kind of ['nodes','links'])for(const a of index.graph[kind]){const b=fresh.graph[kind].find(x=>x.id===a.id);if(!b){differences.push({kind,missing:true});continue;}for(const key of new Set([...Object.keys(a),...Object.keys(b)]))if(JSON.stringify(a[key])!==JSON.stringify(b[key]))differences.push({kind,key});}
   row.graphDifferenceFields=differences.slice(0,20);
   row.orderOnly= differences.length===0;
  }
  assert.equal(row.graphDigest,await canonicalSha256({nodes:fresh.graph.nodes,links:fresh.graph.links}));
  await host.shutdown();host=new NodeManagedMocHost(options);row.restartRecoveryMs=(await timed(async()=>assert.equal(await host.start(Date.now()),true))).ms;
  row.memory=process.memoryUsage();row.status='PASS';
 }catch(e){row.status='FAIL';row.failureCode='PERFORMANCE_SAMPLE_ASSERTION_FAILED';out.status='FAIL';await save();throw e;}
 finally{await host?.shutdown();await rm(root,{recursive:true,force:true});await save();}
}
out.status='PASS';out.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify(out));
