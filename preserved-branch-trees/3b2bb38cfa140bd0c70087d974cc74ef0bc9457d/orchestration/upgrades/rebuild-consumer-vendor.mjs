import esbuild from './kosmos/node_modules/esbuild/lib/main.js';
import {readFileSync,writeFileSync,copyFileSync,mkdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const base=resolve(import.meta.dirname),vendor=resolve(base,'observatory/web/vendor/kosmos-oden'),source=resolve(vendor,'source');
const historical=resolve(base,'../2026-08-31/observatory-audit/GKOS-Observatory/web/vendor/kosmos-oden');
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const provenance=JSON.parse(readFileSync(resolve(historical,'PROVENANCE.json'),'utf8'));
for(const [p,digest] of Object.entries(provenance.inputs))if(p.startsWith('node_modules/')){
 if(sha(resolve(historical,'source',p))!==digest)throw Error('Historical dependency changed: '+p);
 mkdirSync(resolve(source,p,'..'),{recursive:true});copyFileSync(resolve(historical,'source',p),resolve(source,p));
}
const result=await esbuild.build({absWorkingDir:source,entryPoints:['src/renderer/renderer.ts'],bundle:true,format:'esm',platform:'browser',target:'es2020',minify:true,write:false,metafile:true,alias:{'three':resolve(source,'node_modules/three/build/three.module.js'),'gkos-engine/navigation':resolve(source,'node_modules/gkos-engine/dist/navigation.mjs'),'gkos-engine':resolve(source,'node_modules/gkos-engine/dist/gkos-engine.mjs')}});
writeFileSync(resolve(vendor,'renderer.mjs'),result.outputFiles[0].contents);
const inputs=Object.fromEntries(Object.keys(result.metafile.inputs).map(p=>[p,sha(resolve(source,p))]));
writeFileSync(resolve(vendor,'PROVENANCE.json'),JSON.stringify({...provenance,renderer_core_modified:true,upstream_bundle_sha256:provenance.bundle_sha256,upstream_inputs:provenance.inputs,bundle_sha256:sha(resolve(vendor,'renderer.mjs')),local_patch:'consumer-stable-identity-v1 (uncommitted candidate; upstream commit remains historical base)',inputs},null,2)+'\n');
console.log('Rebuilt local patched vendor; no new upstream commit claimed.');
