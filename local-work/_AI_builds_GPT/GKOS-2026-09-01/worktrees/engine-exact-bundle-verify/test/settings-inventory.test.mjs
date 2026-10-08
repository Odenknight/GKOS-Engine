import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {TOML_SETTINGS, configuredSettings, warnInactiveSettings} from '../bin/settings-inventory.mjs';
import {contentLimits} from '../dist/service-node.mjs';
const root = new URL('../', import.meta.url);
const cli = (...args) => spawnSync(process.execPath, ['bin/gkx.mjs', 'settings', ...args], {cwd: root, encoding: 'utf8'});

test('every schema TOML coordinate has exactly one ownership entry', () => {
 const schema=JSON.parse(readFileSync(new URL('../contracts/retrieval/gkos-retrieval-1.0.0-draft.1/gkos-config.schema.json',import.meta.url)));
 const properties=spec=>spec.$ref?properties(schema.$defs[spec.$ref.split('/').at(-1)]):spec.oneOf?[...new Set(spec.oneOf.flatMap(properties))]:Object.keys(spec.properties??{});
 const keys=Object.entries(schema.properties).flatMap(([section,spec])=>section==='config_version'?[section]:properties(spec).map(key=>`${section}.${key}`)).sort();
 assert.deepEqual(TOML_SETTINGS.map(row=>row.key).sort(),keys);
 assert.equal(new Set(TOML_SETTINGS.map(row=>row.key)).size,keys.length);
});

test('inventory and help work without reading configuration or loading providers',()=>{
 for(const runtime of ['desktop','cli-search','cli-index']) {
  const result=cli('--runtime',runtime,'--json');assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);assert.equal(data.runtime_readiness,'NOT_PROBED');assert.equal(data.explicit_config_checked,false);
  assert.equal(data.settings.length,TOML_SETTINGS.length);
 }
 assert.match(cli('--help').stdout,/Does not scan a vault/);
 for(const args of [['--runtime','other'],['--config'],['--config','--json'],['--unknown'],['--json','--json']]) assert.equal(cli(...args).status,2);
});

test('inspector reports inactive keys but never config values, paths or secrets',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gkos-settings-'));
 try {
  const file=join(dir,'SENSITIVE-PATH.toml');
  writeFileSync(file,'config_version = 1\n[service]\nhost = "SECRET-HOST"\n[vectors]\nenabled = true\nprovider = "openai_compatible"\nprovider_id = "private"\nmodel_id = "private-model"\ndimensions = 384\nendpoint = "https://private.invalid"\ntoken_env = "UNSET_PRIVATE_SECRET"\n');
  const result=cli('--runtime','cli-search','--config',file,'--json');assert.equal(result.status,1,result.stderr);
  assert.doesNotMatch(result.stdout+result.stderr,/SECRET-HOST|SENSITIVE-PATH|private.invalid|UNSET_PRIVATE_SECRET|private-model/);
  assert.ok(JSON.parse(result.stdout).configured.some(row=>row.key==='service.host'&&row.status==='IGNORED'));
  assert.equal(cli('--config',join(dir,'missing'),'--json').status,2);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('execution warnings use schema-owned keys only and distinguish metadata',()=>{
 const document={'':{config_version:1},service:{port:4814},retrieval:{mode:'semantic',max_tokens:32,mmr:true},reranker:{enabled:false}};
 const messages=[];warnInactiveSettings({document},'cli-index',line=>messages.push(line));
 assert.ok(messages.includes('GKOS_SETTING_IGNORED:service.port\n'));
 assert.ok(messages.includes('GKOS_SETTING_METADATA_ONLY:retrieval.mmr\n'));
 assert.ok(messages.every(line=>!line.includes('4814')&&!line.includes('semantic')));
 assert.equal(configuredSettings(document,'desktop').every(row=>row.status==='NOT_LOADED'),true);
});

test('content limit defaults, all lower/upper bounds and malformed inputs',()=>{
 const defaults={files:2000,per_file_bytes:1048576,total_bytes:8388608};
 assert.deepEqual(contentLimits(''),defaults);
 for(const [key,max] of Object.entries({files:20000,per_file_bytes:67108864,total_bytes:268435456})) {
  for(const good of [1,max]) assert.equal(contentLimits(JSON.stringify({...defaults,[key]:good}))[key],good);
  for(const bad of [0,-1,max+1,1.5,'1',null]) assert.throws(()=>contentLimits(JSON.stringify({...defaults,[key]:bad})),/^Error: GKOS_MCP_CONTENT_LIMITS_INVALID$/);
 }
 for(const bad of ['SECRET-JSON-PAYLOAD','null','[]','{}',JSON.stringify({...defaults,extra:1})]) assert.throws(()=>contentLimits(bad),/^Error: GKOS_MCP_CONTENT_LIMITS_INVALID$/);
});

test('index CLI explicit configuration reaches indexing and warns without altering sources',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gkos-settings-index-'));
 try {
  const vault=join(dir,'vault');mkdirSync(vault);
  const note='---\ngkx_version: "2.3"\nuid: "018f0000-0000-7000-8000-000000000601"\ntitle: "Settings fixture"\ntype: "note"\ncreated_at: "2026-08-01T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Settings\n'+('fixture words for deterministic chunking '.repeat(80));
  writeFileSync(join(vault,'fixture.md'),note);
  const config=join(dir,'operator.toml');
  writeFileSync(config,'config_version = 1\n[retrieval]\nmax_tokens = 16\noverlap_tokens = 0\nmode = "fts"\n');
  const args=['bin/gkx.mjs','index','--kb-path',vault,'--config',config];
  const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert.match(result.stderr,/GKOS_SETTING_IGNORED:retrieval.mode/);
  assert.equal(readFileSync(join(vault,'fixture.md'),'utf8'),note);
  const bad=spawnSync(process.execPath,[...args,'--config',config],{cwd:root,encoding:'utf8'});
  assert.equal(bad.status,2);
  // An invalid chunker setting must reach validation, not disappear in CLI parsing.
  writeFileSync(config,'config_version = 1\n[retrieval]\nmax_tokens = 1\n');
  const invalid=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
  assert.notEqual(invalid.status,0);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
