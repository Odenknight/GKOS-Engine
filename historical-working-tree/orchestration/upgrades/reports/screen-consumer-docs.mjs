import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const intake=JSON.parse(readFileSync(resolve(import.meta.dirname,'markdown-intake.json'))).files.filter(f=>f.classification==='project_document'&&/^2026-08-31\/(product-audit|observatory-audit)\//.test(f.path));
const old=readFileSync(resolve(import.meta.dirname,'consumer-reviewed-markdown-inventory.txt'),'utf8').split(/\r?\n/).map(p=>p.replaceAll('\\','/').replace(/^orchestration\//,''));
console.log('Intake',intake.length,'missing',intake.filter(f=>!old.includes(f.path)).map(f=>f.path));
const seen=new Map();
const out=intake.map(f=>{
 const duplicate=seen.get(f.sha256);seen.set(f.sha256,f.path);
 const lines=readFileSync(resolve(root,f.path),'utf8').split(/\r?\n/);
 return {...f,review:'headings/status/decision-clause screen; detailed relevant-contract reads separately recorded',duplicate_of:duplicate||null,screen:duplicate?[]:lines.flatMap((s,i)=>/^#{1,6}\s|\b(status|decision|must|shall|never|requires?|approval|authorization|bounded|identity|agent_id|agent.label|replay|renderer|provenance)\b/i.test(s)?[`${i+1}: ${s}`]:[])};
});
writeFileSync(resolve(import.meta.dirname,'consumer-markdown-screen.json'),JSON.stringify(out,null,2)+'\n');
for(let part=0;part<5;part++)writeFileSync(resolve(import.meta.dirname,`consumer-screen-${part}.txt`),out.slice(part*26,(part+1)*26).map(f=>`\n${f.path}${f.duplicate_of?' DUPLICATE '+f.duplicate_of:''}\n${f.screen.join('\n')}`).join('\n'));
