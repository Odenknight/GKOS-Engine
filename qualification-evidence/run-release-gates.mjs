import { spawn, execFileSync } from 'node:child_process';
import { openSync, closeSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const root=process.argv[2] ?? '[LOCAL_PATH]';
const npm='C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js';
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const head=git('rev-parse','HEAD');
const out=join('[LOCAL_PATH]','gates-'+head.slice(0,7)); mkdirSync(out,{recursive:true});
if(git('status','--porcelain')||git('rev-parse','--is-shallow-repository')!=='false')throw Error('SOURCE_NOT_CLEAN_FULL_CLONE');
const commands=[['ci'],['run','typecheck'],['run','build'],['test'],['run','test:navigation'],['run','test:intelligence'],['run','pack:check'],['run','check:license'],['run','check:nomenclature'],['audit','--json'],['run','qualify:current','--','--output',join(out,'current-runtime')]];
const receipt={sourceCommit:head,node:process.version,npm:execFileSync(process.execPath,[npm,'--version'],{encoding:'utf8'}).trim(),os:process.platform,arch:process.arch,startedAt:new Date().toISOString(),status:'RUNNING',commands:[],releaseQualified:false};
const save=()=>writeFileSync(join(out,'commands.json'),JSON.stringify(receipt,null,2)+'\n');save();
for(const [i,args]of commands.entries()){
 const path=join(out,`${String(i+1).padStart(2,'0')}-${args.filter(x=>!x.includes('/')&&!x.includes('\\')).join('-').replaceAll(':','-')}.log`);
 const fd=openSync(path,'w'),started=Date.now();
 const child=spawn(process.execPath,[npm,...args],{cwd:root,stdio:['ignore',fd,fd]});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)});closeSync(fd);
 const row={command:'npm '+args.join(' '),exitCode:code,durationMs:Date.now()-started,log:path,logSha256:createHash('sha256').update(readFileSync(path)).digest('hex'),trackedChanges:git('diff','--name-only')};
 receipt.commands.push(row);save();console.log(JSON.stringify(row));
 if(code!==0||row.trackedChanges||git('rev-parse','HEAD')!==head){receipt.status='FAIL';save();process.exitCode=1;break;}
}
if(receipt.status==='RUNNING')receipt.status='PASS';receipt.finishedAt=new Date().toISOString();save();
