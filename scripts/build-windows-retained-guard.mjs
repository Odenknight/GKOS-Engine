import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
if(process.platform!=='win32'||process.arch!=='x64')throw Error('The retained-directory guard requires a Windows x64 C++ build host.');
const root=resolve(import.meta.dirname,'..'),output=join(root,'dist/native');mkdirSync(output,{recursive:true});
const vswhere=join(process.env['ProgramFiles(x86)'],'Microsoft Visual Studio/Installer/vswhere.exe');
const vs=execFileSync(vswhere,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8',windowsHide:true}).trim();
if(!vs || /["%!\r\n]/.test(vs))throw Error('A supported Visual C++ build installation is required.');
const vcvars=join(vs,'VC/Auxiliary/Build/vcvars64.bat');
// Capture the compiler environment privately; never print environment values.
const command='""'+vcvars+'" >nul && set"';
const environment=execFileSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',command],{encoding:'utf8',windowsHide:true,windowsVerbatimArguments:true});
const env={...process.env};for(const line of environment.split(/\r?\n/)){const split=line.indexOf('=');if(split>0)env[line.slice(0,split)]=line.slice(split+1);}
const compiler=(env.Path||env.PATH).split(';').map(folder=>join(folder,'cl.exe')).find(existsSync);if(!compiler)throw Error('Visual C++ compiler unavailable.');
const headers=join(root,'native/windows/node-api-v22.22.1');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const provenance=JSON.parse(readFileSync(join(headers,'sources.json'),'utf8'));
for(const item of provenance)if(sha(readFileSync(join(headers,item.file)))!==item.sha256)throw Error('Node-API header provenance mismatch.');
const source=join(root,'native/windows/retained-guard.cpp'),binary=join(output,'retained-guard.node');
execFileSync(compiler,['/nologo','/std:c++17','/O2','/MT','/EHsc','/W4','/WX','/LD',source,'/Fo'+join(output,'retained-guard.obj'),'/Fe'+binary],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
const digest=sha(readFileSync(binary)),filename='retained-guard-'+digest+'.node';
const target=join(output,filename);
if(existsSync(target)){if(sha(readFileSync(target))!==digest)throw Error('Existing content-addressed module changed.');}
else copyFileSync(binary,target);
writeFileSync(join(output,'retained-guard.json'),JSON.stringify({schemaVersion:1,platform:'win32',arch:'x64',filename,sha256:digest,sourceSha256:sha(readFileSync(source)),nodeApiVersion:8,headers:provenance},null,2)+'\n');
console.log('Built Windows retained-handle Node-API guard and artifact manifest.');
