// Diagnostic-only: confirms faulty behavior at Engine 8207958047b3361ae21ac07c5a2abbd26a42a684.
// Usage: node engine-reference-probes.mjs <absolute-built-engine-checkout>
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
if (!process.argv[2]) throw new Error('Usage: node engine-reference-probes.mjs <absolute-built-engine-checkout>');
const fixtureUrl = pathToFileURL(resolve(process.argv[2], 'test/service-content.test.mjs'));
let fixtureSource = readFileSync(fixtureUrl, 'utf8').split("test('capabilities explain")[0];
fixtureSource = fixtureSource.replaceAll(/from '(\.\.\/dist\/[^']+)'/g, (_, path) => `from '${new URL(path, fixtureUrl).href}'`);
fixtureSource += '\nexport { fixture, AT };\n';
const { fixture, AT } = await import('data:text/javascript;base64,' + Buffer.from(fixtureSource).toString('base64'));
const f = await fixture();
try {
  const before = await f.call('gkos_record_assess', {record_ref:f.ref});
  f.sources[1].content = f.sources[1].content.replace('title: "Measurement"', 'title: "Changed measurement"');
  const read = await f.call('gkos_note_read', {record_ref:f.ref,cursor:null,limit_bytes:100});
  const validate = await f.call('gkos_record_validate', {record_ref:f.ref});
  const assess = await f.call('gkos_record_assess', {record_ref:f.ref});
  const lineage = await f.call('gkos_lineage_get', {record_ref:f.ref,cursor:null,limit:100});
  const observation = {probe:'source mutation, unchanged generation',readError:read.structuredContent.error_code,
    validateAccepted:!validate.isError,assessAccepted:!assess.isError,lineageAccepted:!lineage.isError,
    assessEvidenceDigestChanged:before.structuredContent.record_digest !== assess.structuredContent.record_digest,
    lineageReturnedDifferentRootReference:lineage.structuredContent.items?.[0]?.record_ref !== f.ref};
  console.log(JSON.stringify(observation,null,2));
  assert.equal(observation.readError,'GKOS_P6_REFERENCE_UNKNOWN');
  assert.equal(observation.assessAccepted,true);
  assert.equal(observation.assessEvidenceDigestChanged,true);
} finally { await f.close(); }
const g = await fixture();
try {
  const first = await g.call('gkos_graph_at_time',{scope_ref:g.scope,at:AT,state:'all',cursor:null,limit:1});
  assert.equal(first.isError,false);
  const cursor = first.structuredContent.page.next_cursor;
  assert.ok(cursor);
  const firstPath = first.structuredContent.items[0].canonical_path;
  const index = g.sources.findIndex(source => source.relativePath === firstPath);
  g.sources.splice(index,1);
  const next = await g.call('gkos_graph_at_time',{scope_ref:g.scope,at:AT,state:'all',cursor,limit:100});
  const fresh = await g.call('gkos_graph_at_time',{scope_ref:g.scope,at:AT,state:'all',cursor:null,limit:100});
  console.log(JSON.stringify({probe:'temporal continuation after same-generation source removal',continuationAccepted:!next.isError,
    snapshotIdUnchanged:first.structuredContent.page.snapshot_id===next.structuredContent.page.snapshot_id,
    continuedPaths:next.structuredContent.items?.map(x=>x.canonical_path),freshPaths:fresh.structuredContent.items?.map(x=>x.canonical_path)},null,2));
  assert.equal(next.isError,false);
  assert.equal(next.structuredContent.items.length,fresh.structuredContent.items.length-1);
} finally { await g.close(); }
