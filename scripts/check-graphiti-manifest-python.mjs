import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {managedEpisodeJson,buildManagedGraphitiManifest} from '../dist/graphiti-broker.mjs';

const texts=['é😀雪','a\r\nb\rc\n','\u007f\u0080\u2028\u2029','"\\/\b\f\t','e\u0301'];
const episodes=texts.map(name=>({name,episode_body:JSON.stringify({text:name}),source_description:name,reference_time:'2026-09-13T00:00:00Z'}));
const python=`import sys,json,hashlib
sys.path.insert(0,'services/gkos-graphiti')
from ledger import canonical,digest
items=json.load(sys.stdin)
manifest=[{'source_id':str(i),'source_digest':'sha256:'+hashlib.sha256(bytes([i,255,13,10])).hexdigest(),'episode_digest':digest(e)} for i,e in enumerate(items)]
print(json.dumps({'canonical':[canonical(e) for e in items],'manifest':manifest,'source_snapshot_digest':digest(manifest)}))`;
const expected=JSON.parse(execFileSync(process.env.PYTHON ?? 'python',['-X','utf8','-c',python],{
  cwd:fileURLToPath(new URL('../',import.meta.url)), input:JSON.stringify(episodes),encoding:'utf8',windowsHide:true,
}));
assert.deepEqual(episodes.map(managedEpisodeJson),expected.canonical);
assert.deepEqual(await buildManagedGraphitiManifest(episodes.map((episode,i)=>({source_id:String(i),raw:Uint8Array.of(i,255,13,10),episode}))),{
  manifest:expected.manifest,source_snapshot_digest:expected.source_snapshot_digest,
});
console.log('PASS: five Unicode/control/line-ending vectors and ordered raw-byte manifest match Python ledger canonical/digest functions.');
