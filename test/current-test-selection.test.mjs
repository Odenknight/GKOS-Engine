import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {selectCurrentTests} from '../scripts/current-test-plan.mjs';
test('current runtime includes canonical artifacts and V2 admission without profile exemptions',()=>{
 const required=['reviewer-artifacts.test.mjs','canonical-cbor-runtime.test.mjs','reviewer-contract.test.mjs'];
 const selected=selectCurrentTests(readdirSync(new URL('./',import.meta.url)),{});
 for(const name of required)assert.ok(selected.files.includes(name),name);
 assert.ok(!selected.exemptions.some(e=>required.includes(e.name)));
});
