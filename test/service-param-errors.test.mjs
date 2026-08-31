import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import {SERVICE_MCP_TOOLS,PARAM_ERROR_LIMIT} from '../dist/service-node.mjs';
import {paramFixture,compatibilitySnapshot,SECRET,BODY} from './support/param-fixture.mjs';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>'sha256:'+createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const reasons=['missing','malformed','out_of_range','unknown_param'];
const envelopeSchema=JSON.parse(readFileSync(new URL('../docs/mcp-invalid-params-draft3.schema.json',import.meta.url)));
const validateEnvelope=new Ajv2020({strict:true}).compile(envelopeSchema);
function invalid(result) {
  assert.equal(result.isError,true);
  const data=result.structuredContent;
  assert.equal(validateEnvelope(data),true,JSON.stringify(validateEnvelope.errors));
  assert.equal(data.error_code,'GKOS_P6_INVALID_PARAMS');
  assert.equal(data.contract_version,'1.0.0-draft.3');
  assert.equal(data.retryable,false);
  assert.deepEqual(JSON.parse(result.content[0].text),data);
  assert.ok(Array.isArray(data.param_errors)&&data.param_errors.length<=PARAM_ERROR_LIMIT);
  for(const item of data.param_errors){
    assert.deepEqual(Object.keys(item).sort(),['expected','hint','param','reason']);
    assert.ok(reasons.includes(item.reason));
    assert.ok(item.expected.length>0&&item.expected.length<=256);
    assert.ok(item.hint.length>0&&item.hint.length<=256);
  }
  const {error_digest,...unsigned}=data;assert.equal(error_digest,digest(unsigned));
  for(const marker of [SECRET,BODY])assert.equal(JSON.stringify(result).includes(marker),false);
  return data.param_errors;
}

test('handoff 1: one response identifies both missing note_read fields with static guidance',async()=>{
  const f=await paramFixture();
  assert.deepEqual(invalid(await f.call('gkos_note_read',{record_ref:f.ref})),[
    {param:'cursor',reason:'missing',expected:'string | null',hint:'Pass null explicitly for the first page.'},
    {param:'limit_bytes',reason:'missing',expected:'integer 4–16384',hint:'Pass an integer from 4 through 16384.'},
  ]);
});
test('handoff 2: discovery missing cursor names only cursor',async()=>{
  const f=await paramFixture();
  assert.deepEqual(invalid(await f.call('gkos_navigation_discover',{limit:100})).map(x=>[x.param,x.reason]),[['cursor','missing']]);
});
test('handoff 3: byte limit gives the exact bound',async()=>{
  const f=await paramFixture();
  const errors=invalid(await f.call('gkos_note_read',{record_ref:f.ref,cursor:null,limit_bytes:3}));
  assert.deepEqual(errors.map(x=>[x.param,x.reason,x.expected]),[['limit_bytes','out_of_range','integer 4–16384']]);
});
test('handoff 4: timestamp without fraction succeeds; bad timestamp aggregates with other failures',async()=>{
  const f=await paramFixture();
  assert.equal((await f.call('gkos_graph_at_time',{...f.valid.gkos_graph_at_time,at:'2026-08-24T00:00:00Z'})).isError,false);
  const errors=invalid(await f.call('gkos_graph_at_time',{scope_ref:f.scope,at:'2026-02-30T00:00:00Z',state:'wrong',limit:0}));
  assert.deepEqual(errors.map(x=>[x.param,x.reason]),[['at','malformed'],['state','malformed'],['cursor','missing'],['limit','out_of_range']]);
  assert.match(errors[0].expected,/2026-08-24T00:00:00\.000Z/);
});
test('handoff 5: successful operation bytes and digests match pre-change PR37; capability metadata is the explicit version exception',async()=>{
  const expected=JSON.parse(readFileSync(new URL('./fixtures/param-errors-before.json',import.meta.url)));
  const actual=await compatibilitySnapshot();
  for(const [name,body] of Object.entries(actual)){
    const data=body.result.structuredContent;
    if(!body.result.isError){const {result_digest,...unsigned}=data;assert.equal(result_digest,digest(unsigned));assert.equal('param_errors' in data,false);}
    if(name==='gkos_capabilities'){
      assert.equal(data.discovery.invalid_params_contract.contract_version,'1.0.0-draft.3');
      delete data.discovery.invalid_params_contract;
      const {result_digest,...unsigned}=data;data.result_digest=digest(unsigned);
      body.result.content[0].text=JSON.stringify(data);
    }
    assert.equal(JSON.stringify(body),JSON.stringify(expected[name]),name);
  }
});
test('handoff 6: bad refs, cursors, unknown keys and canary contents never enter diagnostics or events',async()=>{
  const f=await paramFixture();
  const submitted='gkrec1_'+SECRET;
  const result=await f.raw('gkos_note_read',{record_ref:submitted,cursor:{token:SECRET},limit_bytes:3,[SECRET]:BODY});
  const errors=invalid(result.body.result);
  assert.deepEqual(errors.map(x=>[x.param,x.reason]),[['$','unknown_param'],['record_ref','malformed'],['cursor','malformed'],['limit_bytes','out_of_range']]);
  assert.equal(JSON.stringify(result).includes(submitted),false);
  assert.equal(JSON.stringify(result).includes(SECRET),false);
  assert.equal(JSON.stringify(result).includes(BODY),false);
  assert.deepEqual(result.event.paths,[]);
  const knownShape=await f.call('gkos_note_read',{record_ref:'gkrec1_'+'A'.repeat(22),cursor:null,limit_bytes:600});
  assert.equal(knownShape.structuredContent.error_code,'GKOS_P6_REFERENCE_UNKNOWN');
  assert.equal('param_errors' in knownShape.structuredContent,false);
});
test('handoff 7: every advertised tool uses the same bounded error shape, including the tenth tool',async()=>{
  const f=await paramFixture();let keys;
  assert.equal(SERVICE_MCP_TOOLS.length,10);
  for(const tool of SERVICE_MCP_TOOLS){
    const result=await f.call(tool.name,{...f.valid[tool.name],[SECRET]:SECRET});
    assert.deepEqual(invalid(result).map(x=>[x.param,x.reason]),[['$','unknown_param']]);
    const current=Object.keys(result.structuredContent).sort();if(keys)assert.deepEqual(current,keys);keys=current;
    assert.ok(Object.keys(tool.inputSchema.properties).length+1<=PARAM_ERROR_LIMIT);
    for(const [field,schema] of Object.entries(tool.inputSchema.properties)){
      const help=schema['x-gkos-param-help'];assert.ok(help.expected&&help.hint,`${tool.name}.${field}`);
      const bad={...f.valid[tool.name],[field]:{[SECRET]:SECRET}};
      const errors=invalid(await f.call(tool.name,bad));
      assert.ok(errors.some(x=>x.param===field&&x.reason==='malformed'));
      assert.deepEqual(errors.find(x=>x.param===field),{param:field,reason:'malformed',...help});
    }
  }
});
test('all semantic failures aggregate without source access after the existing identity gate',async()=>{
  const f=await paramFixture();
  f.context.view=new Proxy(f.context.view,{get(target,key){
    if(['credential_id','agent_id','sensitivity_ceiling'].includes(key))return target[key];
    throw new Error('Diagnostics accessed view data: '+String(key));
  }});
  for(const field of ['sourceRecords','navigationConfig'])Object.defineProperty(f.context,field,{get(){throw new Error('Diagnostics accessed '+field);}});
  for(const [tool,args,names] of [
    ['gkos_navigation_discover',{path_prefix:'../'+SECRET,name_query:' ',detail:'wrong',limit:0},['detail','path_prefix','name_query','cursor','limit']],
    ['gkos_search',{query:'"unclosed',path_include:['../'+SECRET],limit:0},['path_include','query','cursor','limit']],
    ['gkos_record_resolve',{canonical_path:'../'+SECRET,expected_uid:[]},['canonical_path','expected_uid']],
  ])assert.deepEqual(invalid(await f.call(tool,args)).map(x=>x.param),names);
  const unavailableScope={...f.valid.gkos_navigation_audit,scope_ref:'gkscp1_'+'A'.repeat(22)};
  // Preserve this legacy error code without falsely claiming a schema failure
  // or turning the new diagnostics into an authorization/existence oracle.
  assert.deepEqual(invalid(await f.call('gkos_navigation_audit',unavailableScope)),[]);
});
test('unknown keys are aggregated, never echoed, and cannot crowd out known failures',async()=>{
  const f=await paramFixture();
  const input=Object.fromEntries(Array.from({length:2000},(_,i)=>[SECRET+i,SECRET]));
  const errors=invalid(await f.call('gkos_graph_at_time',input));
  assert.equal(errors.length,6);
  assert.equal(errors[0].reason,'unknown_param');
  assert.deepEqual(errors.slice(1).map(x=>x.param),['scope_ref','at','state','cursor','limit']);
});
test('published numeric/length bounds agree with static guidance; envelopes reject unknown reason and extra fields',async()=>{
  const f=await paramFixture();
  for(const tool of SERVICE_MCP_TOOLS){
    assert.deepEqual(tool.inputSchema['x-gkos-param-help'],{expected:'object containing published parameters only',hint:'Pass an object and remove fields not listed in the tool schema.'});
    for(const [field,schema] of Object.entries(tool.inputSchema.properties)){
      if(schema.type==='integer'){
        assert.equal(schema['x-gkos-param-help'].expected,`integer ${schema.minimum}–${schema.maximum}`);
        for(const value of [schema.minimum-1,schema.maximum+1]){
          const errors=invalid(await f.call(tool.name,{...f.valid[tool.name],[field]:value}));
          assert.ok(errors.some(x=>x.param===field&&x.reason==='out_of_range'));
        }
      }
    }
  }
  const result=await f.call('gkos_navigation_discover',[]);invalid(result);
  for(const path_include of [[],Array(17).fill('a'),['a'.repeat(513)]]){
    const errors=invalid(await f.call('gkos_search',{...f.valid.gkos_search,path_include}));
    assert.deepEqual(errors.map(x=>[x.param,x.reason]),[['path_include','out_of_range']]);
  }
  const bad=structuredClone(result.structuredContent);bad.param_errors[0].reason='unauthorized';
  assert.equal(validateEnvelope(bad),false);
  bad.param_errors[0].reason='malformed';bad.param_errors[0].submitted_value=SECRET;
  assert.equal(validateEnvelope(bad),false);
});
