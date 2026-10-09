import test from 'node:test';
import assert from 'node:assert/strict';
import {InMemoryGovernanceStore,buildGovernedRecord,buildStateChangeReceipt} from '../dist/governance.mjs';

function record(){return buildGovernedRecord({recordId:'record:callback',recordType:'test',payload:{value:'reviewed'},receiptRole:buildStateChangeReceipt({receiptId:'018f0000-0000-7000-8000-000000000011',operationId:'018f0000-0000-7000-8000-000000000010',actor:{id:'human:owner',class:'human'},operation:'test',targets:[{id:'target',beforeDigest:'sha256:before'}],authorityRef:'decision:test',policy:{id:'policy:test',version:'1'},nondeterministicEscalated:false,occurredAt:'2026-08-15T20:00:00Z'})});}

test('store availability callbacks cannot mutate the captured validated record',async()=>{
 let calls=0;
 const mutate=r=>{calls++;Reflect.set(r.payload,'value','substituted');Reflect.set(r.stateChange,'operation','different-effect');return true;};
 const store=new InMemoryGovernanceStore({receiptAvailable:mutate,durabilityAvailable:mutate});
 const result=await store.append(record(),{idempotencyKey:'callback-1'});
 assert.equal(result.committed,true);assert.equal(calls,2);
 assert.equal(result.record.payload.value,'reviewed');assert.equal(result.record.stateChange.operation,'test');
 const retry=await store.append(record(),{idempotencyKey:'callback-1'});assert.equal(retry.committed,true);assert.equal(retry.replayed,true);
 assert.equal(store.snapshot().records.length,1);
});

test('callback errors preserve rejection identity without publishing or poisoning the append queue',async()=>{
 const failure=new Error('provider unavailable');let fail=true;
 const store=new InMemoryGovernanceStore({durabilityAvailable:()=>{if(fail)throw failure;return true;}});
 await assert.rejects(store.append(record(),{idempotencyKey:'callback-error'}),error=>error===failure);
 assert.equal(store.snapshot().records.length,0);fail=false;
 assert.equal((await store.append(record(),{idempotencyKey:'callback-error'})).committed,true);
});
