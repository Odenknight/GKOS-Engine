import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const BASE='808d875b557f4cfd2bb0addccba44d70c9748f35';
const PACK='contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1';
const GENERATOR='scripts/generate-agent-identity-mcp-contract-draft1.mjs';
const DIR=join(ROOT,PACK);
const sha=(b)=>createHash('sha256').update(b).digest('hex');
const json=async(name)=>JSON.parse(await readFile(join(DIR,name),'utf8'));
const canonical=(v)=>JSON.stringify(Array.isArray(v)?v.map((x)=>JSON.parse(canonical(x))):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map((k)=>[k,JSON.parse(canonical(v[k]))])):v);

test('generator check and exact manifest closure',async()=>{
  execFileSync(process.execPath,[GENERATOR,'--check'],{cwd:ROOT,stdio:'pipe'});
  const names=(await readdir(DIR)).sort();assert.equal(names.length,34);assert.ok(names.includes('pack-manifest.json'));
  const manifest=await json('pack-manifest.json');assert.equal(manifest.leaf_count,33);assert.equal(manifest.leaves.length,33);assert.equal(new Set(manifest.leaves.map((x)=>x.path)).size,33);assert.ok(!manifest.leaves.some((x)=>x.path==='pack-manifest.json'));
  for(const leaf of manifest.leaves){const bytes=await readFile(join(DIR,leaf.path));assert.equal(bytes.length,leaf.size,leaf.path);assert.equal(sha(bytes),leaf.sha256,leaf.path);assert.ok(!bytes.includes(Buffer.from('\r\n')),leaf.path);}
  assert.equal(manifest.aggregate_digest,`sha256:${sha(canonical(manifest.leaves))}`);assert.equal(manifest.source_base_commit,BASE);
  assert.equal(manifest.generation_input_digest,'sha256:ec3ece84c71114b0d97cfa23376d37d35fde2f4e6105815d5c5e967ff886cc18');
  assert.equal(manifest.generator_digest,`sha256:${sha(await readFile(join(ROOT,GENERATOR)) )}`);
});

test('all schemas compile strictly and product instances validate',async()=>{
  const names=(await readdir(DIR)).filter((x)=>x.endsWith('.schema.json')).sort();assert.equal(names.length,18);
  const ajv=new Ajv2020({strict:true,allErrors:true,allowUnionTypes:true});addFormats(ajv);
  for(const name of names)ajv.addSchema(await json(name),name);
  for(const name of names)assert.doesNotThrow(()=>ajv.getSchema(name),name);
  for(const [instance,schemaName] of [['operation-inventory.json','operation-inventory.schema.json'],['tool-registry.json','tool-registry.schema.json'],['transport.json','transport.schema.json'],['platform-matrix.json','platform-matrix.schema.json']]){const valid=ajv.validate(schemaName,await json(instance));assert.equal(valid,true,`${instance}: ${ajv.errorsText(ajv.errors)}`);}
  const walk=(node,path='$')=>{if(!node||typeof node!=='object')return;if(node.type==='object'&&node.properties){if(node.additionalProperties!==undefined)assert.equal(node.additionalProperties,false,`open object path ${path}`);else assert.match(path,/\/(?:allOf|anyOf|oneOf)\//,`unclosed direct object path ${path}`);}for(const [key,value]of Object.entries(node))walk(value,`${path}/${key}`);};for(const name of names)walk(await json(name),name);
});

test('operation, schema-ref, tool, error and vector inventories are exact',async()=>{
  const op=await json('operation-inventory.json'),opSchema=await json('operation-inventory.schema.json'),tools=await json('tool-registry.json'),toolSchema=await json('tool-registry.schema.json'),errors=await json('error-fixture.json'),mcp=await json('mcp-conformance-fixture.json'),migration=await json('migration-fixture.json'),security=await json('security-fixture.json');
  assert.equal(op.operations.length,32);assert.deepEqual(op.authority_class_counts,{LOCAL_BOOTSTRAP:1,OWNER_ONLY:24,PUBLIC_AUTHENTICATED:7});assert.equal(Object.keys(opSchema.$defs).length,54);
  const publicRefs=op.operations.filter((x)=>x.authority==='PUBLIC_AUTHENTICATED').flatMap((x)=>[x.request_schema_ref,x.result_schema_ref]);assert.equal(publicRefs.length,14);assert.ok(publicRefs.every((x)=>x.startsWith('tool-registry.schema.json#/$defs/')));
  assert.equal(tools.required_tools.length,7);assert.equal(tools.deferred_tools.length,16);assert.equal(Object.keys(toolSchema.$defs).length,58);assert.equal(new Set(tools.required_tools.map((x)=>x.name)).size,7);
  assert.equal(errors.error_count,53);assert.equal(errors.errors.length,53);assert.equal(errors.alias_count,34);assert.equal(Object.keys(errors.interface_aliases).length,34);assert.equal(new Set(errors.errors.map((x)=>x.code)).size,53);
  assert.equal(mcp.vectors.length,67);assert.equal(new Set(mcp.vectors.map((x)=>x.id)).size,67);assert.equal(migration.vectors.length+security.vectors.length,8);
});

test('canonical identifiers, cursors, bootstrap and secret results fail closed',async()=>{
  const opSchema=await json('operation-inventory.schema.json'),toolSchema=await json('tool-registry.schema.json');
  const ajv=new Ajv2020({strict:true,allErrors:true,allowUnionTypes:true});addFormats(ajv);ajv.addSchema(opSchema,'operation-inventory.schema.json');ajv.addSchema(await json('error.schema.json'),'error.schema.json');ajv.addSchema(toolSchema,'tool-registry.schema.json');
  const bootstrap=ajv.getSchema('operation-inventory.schema.json#/$defs/bootstrap_request');assert.equal(bootstrap({challenge_response:'a'.repeat(32),owner_display_name:'Owner'}),false);assert.equal(bootstrap({challenge_response:'a'.repeat(32),owner_display_name:'Owner',legacy_source:'absent'}),true);
  const credentialResult=ajv.getSchema('operation-inventory.schema.json#/$defs/credential_mutation_result');const ok={contract_version:'1.0.0-draft.1',request_id:'018f0c9a-7b3d-7a40-8c11-102030405060',authority_generation:1,target_type:'credential',target_id:`gkc1_${'a'.repeat(26)}`,status:'active',receipt_event_id:'018f0c9a-7b3d-7a40-8c11-102030405061',secret_revealed:false,result_digest:`sha256:${'a'.repeat(64)}`};assert.equal(credentialResult(ok),true);assert.equal(credentialResult({...ok,credential:'gkos1_forbidden'}),false);
  const cursorSchema=toolSchema.$defs.cursor;const cursorRe=new RegExp(cursorSchema.pattern);assert.equal(cursorRe.test(`gkcur1_${'A'.repeat(42)}E`),true);assert.equal(cursorRe.test(`gkcur1_${'A'.repeat(42)}B`),false);assert.equal(cursorRe.test(`gkcur1_${'A'.repeat(42)}D`),false);
  const graph=ajv.getSchema('tool-registry.schema.json#/$defs/input_graph_at_time');assert.equal(graph({at:'2026-08-25T00:00:00.000Z',state:'active',cursor:null,limit:10}),false);
  const fixture=await json('canonical-fixture.json');const bytes=Buffer.from(JSON.stringify({a:'é',b:1}));assert.equal(bytes.toString('hex'),fixture.positive.canonical_utf8_hex);assert.equal(`sha256:${sha(bytes)}`,fixture.positive.digest);assert.ok(fixture.vectors.filter((x)=>x.expect==='reject').length>=16);
});

test('two fresh roots, execution-backed receipts, and deterministic tar are valid',async(t)=>{
  const a=await mkdtemp(join(tmpdir(),'gkos-f1-a-')),b=await mkdtemp(join(tmpdir(),'gkos-f1-b-'));t.after(async()=>{await rm(a,{recursive:true,force:true});await rm(b,{recursive:true,force:true});});
  const ta=join(a,'pack.tar'),tb=join(b,'pack.tar'),receipt=join(a,'qualification-receipt.json'),evidence=join(a,'qualification-evidence.json'),record=join(a,'command-record.json');
  execFileSync(process.execPath,[GENERATOR,'--record-command',record,'--command','node --version'],{cwd:ROOT,stdio:'pipe'});
  for(const [root,tar]of [[a,ta],[b,tb]])execFileSync(process.execPath,[GENERATOR,'--output-root',root,'--archive',tar,...(root===a?['--receipt',receipt,'--receipt-evidence',evidence,'--job','local-reproducibility','--receipt-command-record',record,'--receipt-input',join(a,PACK,'pack-manifest.json'),'--receipt-input',join(a,PACK,'qualification-receipt.schema.json'),'--receipt-output',ta]:[])],{cwd:ROOT,stdio:'pipe'});
  assert.equal(sha(await readFile(ta)),sha(await readFile(tb)));assert.equal((await stat(ta)).size%512,0);
  const ma=await readFile(join(a,PACK,'pack-manifest.json')),mb=await readFile(join(b,PACK,'pack-manifest.json'));assert.deepEqual(ma,mb);
  const ajv=new Ajv2020({strict:true,allErrors:true,allowUnionTypes:true});addFormats(ajv);const schema=await json('qualification-receipt.schema.json'),value=JSON.parse(await readFile(receipt,'utf8')),validate=ajv.compile(schema);assert.equal(validate(value),true,ajv.errorsText(validate.errors));
  const semanticValid=async(candidate,name)=>{const p=join(a,`${name}.json`);await writeFile(p,JSON.stringify(candidate));try{execFileSync(process.execPath,[GENERATOR,'--output-root',a,'--validate-receipt',p],{cwd:ROOT,stdio:'pipe'});return true;}catch{return false;}};
  assert.ok(value.cpu.length>0);assert.deepEqual(Object.keys(value.tool_versions).sort(),['ajv','ajv_formats','node','npm','sqlite','typescript']);assert.equal(value.commands.length,1);assert.equal(value.commands[0].command,'node --version');assert.ok(value.commands[0].duration_ms>0);assert.ok(Date.parse(value.commands[0].ended_at)>Date.parse(value.commands[0].started_at));assert.ok(Date.parse(value.started_at)<=Date.parse(value.commands[0].started_at));assert.ok(Date.parse(value.ended_at)>=Date.parse(value.commands[0].ended_at));assert.ok(value.commands.every((x)=>x.test_count===x.pass_count+x.fail_count+x.skip_count));assert.ok(value.input_artifact_digests.length>0);assert.ok(value.output_artifact_digests.length>0);assert.equal(await semanticValid(value,'valid'),true);
  for(const mutation of [(x)=>{delete x.cpu},(x)=>{x.tool_versions.npm='10'},(x)=>{x.tool_versions.sqlite='contract-only'},(x)=>{delete x.commands[0].duration_ms},(x)=>{x.commands[0].exit_code=7},(x)=>{x.commands[0].test_count=1},(x)=>{x.input_artifact_digests=[]},(x)=>{x.output_artifact_digests=[]}]){const candidate=structuredClone(value);mutation(candidate);assert.equal(validate(candidate),false,JSON.stringify(candidate));}
  const impossible=structuredClone(value);impossible.ended_at=impossible.started_at;assert.equal(validate(impossible),true);assert.equal(await semanticValid(impossible,'impossible-interval'),false);
  const free=structuredClone(value);free.commands[0].command='synthetic free assertion';assert.equal(validate(free),true);assert.equal(await semanticValid(free,'free-command'),false);
  const failed=structuredClone(value);failed.result='FAIL';failed.secret_scan='FAIL';failed.commands[0].result='FAIL';failed.commands[0].exit_code=7;assert.equal(validate(failed),true,ajv.errorsText(validate.errors));assert.equal(await semanticValid(failed,'valid-failure'),true);
  const falseFailure=structuredClone(value);falseFailure.result='FAIL';falseFailure.secret_scan='FAIL';falseFailure.commands[0].result='FAIL';assert.equal(validate(falseFailure),false);
  const failScript=join(a,'fail.mjs'),failRecord=join(a,'fail-record.json');await writeFile(failScript,'process.exit(7);\n');assert.throws(()=>execFileSync(process.execPath,[GENERATOR,'--record-command',failRecord,'--command',`node "${failScript}"`],{cwd:ROOT,stdio:'pipe'}));const actualFailure=JSON.parse(await readFile(failRecord));assert.equal(actualFailure.result,'FAIL');assert.ok(actualFailure.exit_code>0);assert.ok(actualFailure.duration_ms>0);
  const badScript=join(a,'synthetic.mjs'),badLog=join(a,'synthetic.tap'),badRecord=join(a,'synthetic-record.json');await writeFile(badScript,"console.log('TAP version 13\\n# tests 2\\n# pass 1\\n# fail 0\\n# skipped 0\\n# duration_ms 1');\\n");assert.throws(()=>execFileSync(process.execPath,[GENERATOR,'--record-command',badRecord,'--command',`node "${badScript}"`,'--test-log',badLog],{cwd:ROOT,stdio:'pipe'}));
  assert.throws(()=>execFileSync(process.execPath,[GENERATOR,'--output-root',a,'--check','--receipt',receipt,'--job','local-reproducibility','--receipt-command','synthetic free assertion','--receipt-input',join(a,PACK,'pack-manifest.json'),'--receipt-output',ta],{cwd:ROOT,stdio:'pipe'}));
  const tar=await readFile(ta),entries=[];for(let off=0;off<tar.length;){const header=tar.subarray(off,off+512);if(header.every((x)=>x===0))break;const read=(start,len)=>header.subarray(start,start+len).toString('ascii').replace(/\0.*$/,'').trim();const size=parseInt(read(124,12),8);entries.push({name:read(0,100),mode:read(100,8),uid:read(108,8),gid:read(116,8),mtime:read(136,12)});off+=512+Math.ceil(size/512)*512;}assert.equal(entries.length,34);assert.deepEqual(entries.map((x)=>x.name),[...entries.map((x)=>x.name)].sort());for(const e of entries){assert.equal(e.mode,'0000644');assert.equal(e.uid,'0000000');assert.equal(e.gid,'0000000');assert.equal(e.mtime,'00000000000');assert.ok(e.name.startsWith('GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1/'));}
});

test('Draft.1 allowed/protected inventories and generator remain byte-frozen',async()=>{
  const allowed=new Set((await readFile(join(DIR,'allowed-paths.txt'),'utf8')).trim().split('\n'));assert.equal(allowed.size,40);
  const protectedPaths=(await readFile(join(DIR,'protected-paths.txt'),'utf8')).trim().split('\n');assert.equal(protectedPaths.length,22);
  assert.equal(sha(await readFile(join(DIR,'allowed-paths.txt'))),'7e75c1b8cbd96aa80405f981995e3691e3b073c4929d0c0cb84db615ed694fce');
  assert.equal(sha(await readFile(join(DIR,'protected-paths.txt'))),'f920a006015ac77920dcbb611fd1a2c19e711d9002eb778a056137f50b2cc948');
  assert.equal(sha(await readFile(join(ROOT,GENERATOR))),'95fcdb91814ecf683461a791f4a4dc99ede9d279abba87ee59a9d08cce23ba68');
});

test('generated and qualification inputs contain no secret material',async()=>{
  const forbidden=[/gkos1_[A-Za-z0-9_-]{43}/,/-----BEGIN (?:OPENSSH|PRIVATE) KEY-----/,/"(?:secret|token|private_key|credential)"\s*:\s*"[^"\n]+"/i];
  for(const name of await readdir(DIR)){const bytes=await readFile(join(DIR,name));const text=bytes.toString('utf8');for(const pattern of forbidden)assert.equal(pattern.test(text),false,`${name}: ${pattern}`);}
});

test('hosted workflow freezes all-and-only 11 jobs and artifacts',async()=>{
  const workflow=await readFile(join(ROOT,'.github/workflows/phase6-identity-contract.yml'),'utf8'),generator=await readFile(join(ROOT,GENERATOR),'utf8');assert.match(workflow,/^name: GKOS Phase 6 identity contract qualification$/m);
  const jobs=['p6-f1-contract-linux-node22','p6-f1-contract-linux-node23','p6-f1-contract-linux-node24','p6-f1-contract-windows-node22','p6-f1-contract-windows-node23','p6-f1-contract-windows-node24','p6-f1-contract-macos-node22','p6-f1-schema-adversarial','p6-f1-pack-reproducibility','p6-f1-secret-scan','p6-f1-artifact-audit'];for(const job of jobs)assert.match(workflow,new RegExp(`^  ${job}:`,'m'));assert.equal((workflow.match(/^  p6-f1-[a-z0-9-]+:/gm)||[]).length,11);
  const inventory=await json('hosted-artifact-inventory.json');assert.equal(inventory.artifacts.length,11);for(const artifact of inventory.artifacts)assert.match(workflow,new RegExp(`name: ${artifact}(?:[,}]|$)`,'m'));
  assert.equal((workflow.match(/--qualification-job p6-f1-/g)||[]).length,11);assert.equal((workflow.match(/--receipt-evidence qualification-evidence\.json/g)||[]).length,10);assert.doesNotMatch(workflow,/--receipt-command(?:\s|=)|--receipt-test-log/);
  const packBlock=workflow.match(/name: gkos-p6-f1-contract-pack[\s\S]*?retention-days: 90/)?.[0]||'';assert.match(packBlock,/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1\.0\.0-draft\.1\.tar\n/);assert.match(packBlock,/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1\.0\.0-draft\.1\.tar\.sha256\n/);assert.match(packBlock,/qualification-receipt\.json\n/);assert.doesNotMatch(packBlock,/qualification-evidence\.json/);assert.equal((packBlock.match(/^\s{12}\S.*$/gm)||[]).filter((x)=>!x.includes('retention-days')).length,3);
  assert.match(generator,/pack exact three-file inventory mismatch/);assert.match(generator,/assertQualificationReceiptSemantics/);assert.match(generator,/fs\.realpathSync\(tmpdir\(\)\)/);assert.match(generator,/manifest\.leaves\.length!==33/);assert.match(generator,/incoherent command counts/);assert.doesNotMatch(workflow,/sqlite:'contract-only'|npm:'10'|input_artifact_digests:\[\]|output_artifact_digests:\[\]/);
});
