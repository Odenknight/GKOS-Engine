import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base=resolve(import.meta.dirname,'..');
const hash=p=>existsSync(p)?createHash('sha256').update(readFileSync(p)).digest('hex'):null;
const result={};
for(const [name,audit] of [['kosmos','product-audit/Kosmos-Oden'],['observatory','observatory-audit/GKOS-Observatory']]){
 const before=resolve(base,'../2026-08-31',audit),after=resolve(base,name);
 const files=execFileSync('git',['-C',before,'ls-files'],{encoding:'utf8'}).trim().split(/\r?\n/);
 files.push(...(name==='kosmos'?['test/browser/consumer-identity.spec.ts']:['tests/consumer-identity-browser.mjs','web/vendor/kosmos-oden/LOCAL-PATCH.md']));
 result[name]={git_base:execFileSync('git',['-C',after,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),changed:files.map(path=>({path,before:hash(resolve(before,path)),after:hash(resolve(after,path))})).filter(f=>f.before!==f.after)};
}
writeFileSync(resolve(import.meta.dirname,'consumer-source-ledger.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
