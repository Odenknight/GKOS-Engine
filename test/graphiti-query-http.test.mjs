import test from 'node:test';
import assert from 'node:assert/strict';
import { graphitiHttpQuery } from '../dist/graphiti-adapter.mjs';
const signal = () => new AbortController().signal;
const request = {query:'synthetic'};
test('fixed query transport refuses redirects and sends bounded JSON contract', async () => {
  const query=graphitiHttpQuery('http://127.0.0.1/query',{},async(url,options)=>{
    assert.equal(url,'http://127.0.0.1/query'); assert.equal(options.redirect,'error');
    assert.equal(options.cache,'no-store'); assert.equal(options.body,JSON.stringify(request));
    return new Response('{"hits":[]}',{headers:{'Content-Type':'application/json; charset=utf-8'}});
  });
  assert.equal(await query(request,signal()),'{"hits":[]}');
  for(const url of ['file:///tmp/query','https://user:pass@example.test/query','https://example.test/query#fragment'])
    assert.throws(()=>graphitiHttpQuery(url));
});
test('stream without content-length is cancelled at the byte budget', async () => {
  let cancelled=false;
  const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(65537));},cancel(){cancelled=true;}});
  const query=graphitiHttpQuery('http://127.0.0.1/query',{},async()=>new Response(body,{headers:{'Content-Type':'application/json'}}));
  await assert.rejects(query(request,signal()),/byte budget/); assert.ok(cancelled);
});
test('transport rejects malformed UTF-8, non-JSON, HTTP failures and oversized announced body',async()=>{
  for(const response of [new Response(new Uint8Array([255]),{headers:{'Content-Type':'application/json'}}),
    new Response('private',{status:500}),new Response('<html>'),
    new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':'131073'}})]) {
    await assert.rejects(graphitiHttpQuery('http://127.0.0.1/query',{},async()=>response)(request,signal()));
  }
});
