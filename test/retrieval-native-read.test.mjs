import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { transformSync } from 'esbuild';
import { buildRetrievalGeneration, chunkMarkdown, RetrievalCoordinator, retrievalCanonicalDigest, vaultSourceReader } from '../dist/retrieval.mjs';
const code = transformSync(readFileSync(new URL('../src/retrieval/native-read.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' }).code;
const { readNativeSourcesBounded } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

test('native batch starts at most four reads and preserves input order despite out-of-order completion', async () => {
  const gates = new Map(); const starts = []; let active = 0, maximum = 0;
  const pending = readNativeSourcesBounded(['a', 'b', 'c', 'd', 'e', 'f'], async p => {
    starts.push(p); active++; maximum = Math.max(maximum, active);
    try { await new Promise(r => gates.set(p, r)); return Buffer.from(p); } finally { active--; }
  });
  assert.deepEqual(starts, ['a', 'b', 'c', 'd']);
  gates.get('d')(); await new Promise(setImmediate);
  assert.deepEqual(starts, ['a', 'b', 'c', 'd', 'e']);
  gates.get('b')(); await new Promise(setImmediate);
  assert.deepEqual(starts, ['a', 'b', 'c', 'd', 'e', 'f']);
  for (const p of ['f', 'e', 'c', 'a']) gates.get(p)();
  const result = await pending;
  assert.equal(maximum, 4); assert.equal(active, 0);
  assert.deepEqual([...result].map(([p, b]) => [p, b.toString()]), ['a','b','c','d','e','f'].map(p => [p,p]));
});
test('failed native reads remain refusal values and outstanding work drains before completion', async () => {
  let finish; let completed = false;
  const pending = readNativeSourcesBounded(['bad', 'slow'], async p => {
    if (p === 'bad') throw Error('native read failure');
    await new Promise(r => finish = r); return Buffer.from('verified');
  }).then(r => { completed = true; return r; });
  await new Promise(setImmediate); assert.equal(completed, false);
  finish(); const result = await pending;
  assert.equal(result.get('bad'), null); assert.equal(result.get('slow').toString(), 'verified');
  assert.deepEqual([...await readNativeSourcesBounded([], () => { throw Error('unexpected'); })], []);
  await assert.rejects(readNativeSourcesBounded(['same', 'same'], () => { throw Error('must not read'); }), { message: 'RETRIEVAL_NATIVE_READ_DUPLICATE_PATH' });
});
test('native and custom readers preserve exact search results; custom callbacks remain serial', async t => {
  const root = mkdtempSync(join(tmpdir(), 'gkos-native-read-'));
  let custom, native;
  t.after(() => { custom?.close(); native?.close(); assert.ok(resolve(root).startsWith(resolve(tmpdir()))); rmSync(root, { recursive: true, force: true }); });
  const chunks = [];
  for (let i = 0; i < 6; i++) {
    const text = '# Note '+i+'\nreaderneedle'+i+' public evidence.\n';
    writeFileSync(join(root, 'n'+i+'.md'), text);
    chunks.push(...chunkMarkdown({ source_id: '550e8400-e29b-41d4-a716-'+String(i).padStart(12,'0'), source_path: 'n'+i+'.md', text, metadata: { sensitivity: 'public' } }));
  }
  const generation = buildRetrievalGeneration({ state_directory: join(root,'index'), vault_id:'native-read', source_snapshot_digest:retrievalCanonicalDigest(chunks), configuration_digest:retrievalCanonicalDigest({}), policy_digest:retrievalCanonicalDigest({}), chunks, lexical_backend:'sqlite_fts5' });
  let active=0, maximum=0, calls=0; const reader=vaultSourceReader(root);
  custom = new RetrievalCoordinator(generation.database_path,{ discoverability_policy:()=> 'allow', source_reader:async p=>{active++;calls++;maximum=Math.max(maximum,active);try{await new Promise(setImmediate);return await reader(p);}finally{active--;}} });
  native = new RetrievalCoordinator(generation.database_path,{ discoverability_policy:()=> 'allow', source_reader:vaultSourceReader(root) });

  const request={query:'readerneedle0',limit:1};
  const expected=await custom.search(request); const actual=await native.search(request);
  assert.equal(expected.hits.length,1);assert.deepEqual(actual,expected);assert.equal(calls,6);assert.equal(maximum,1);assert.equal(active,0);
  // A stale authorized file must not become an eligible citation on either path.
  writeFileSync(join(root,'n0.md'),'changed source');
  assert.deepEqual(await native.search(request),await custom.search(request));
});