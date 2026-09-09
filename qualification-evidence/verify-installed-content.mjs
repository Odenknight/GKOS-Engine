import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const [consumer,artifact]=process.argv.slice(2);
const record=JSON.parse(await readFile(join(artifact,'artifact.json'),'utf8'));
const inventory=JSON.parse(await readFile(join(artifact,'content-inventory.json'),'utf8'));
const lock=JSON.parse(await readFile(join(consumer,'node_modules/.package-lock.json'),'utf8'));
if(lock.packages['node_modules/gkos-engine'].integrity!==record.integrity)throw Error('INSTALLED_INTEGRITY_MISMATCH');
for(const row of inventory){const bytes=await readFile(join(consumer,'node_modules/gkos-engine',row.path));if(createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('INSTALLED_CONTENT_MISMATCH');}
const receipt={status:'PASS',sourceCommit:record.sourceCommit,tarballSha256:record.sha256,integrity:record.integrity,checkedFiles:inventory.length,platform:process.platform,node:process.version};
await writeFile(join(consumer,'installed-content-result.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
