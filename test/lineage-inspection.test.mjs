import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, inspectScopedLineage } from '../dist/gkos-engine.mjs';

const source = { relativePath: 'New.md', content: '---\nsupersedes: [Old, Missing, New]\n---\nnew' };
const old = { relativePath: 'Old.md', content: 'old' };
test('scoped lineage distinguishes resolved, missing and self without publishing raw references', () => {
  const graph = buildGraph([source, old], []);
  const result = inspectScopedLineage(graph, 'file:New.md', new Set(['file:New.md', 'file:Old.md']));
  assert.equal(result.available, true);
  assert.deepEqual(result.declarations.map(x => x.status), ['resolved', 'unresolved', 'self']);
  assert.deepEqual(result.declarations.map(x => x.declarationIndex), [0, 1, 2]);
  assert.equal(result.declarations[0].resolvedNodeId, 'file:Old.md');
  assert.equal(result.declarations[0].sourceLine, 2);
  assert.equal(JSON.stringify(result).includes('Missing'), false);
  assert.deepEqual(inspectScopedLineage(graph, 'file:New.md', new Set()), { available: false, declarations: [] });
  assert.deepEqual(inspectScopedLineage(structuredClone(graph), 'file:New.md', new Set(['file:New.md'])), { available: false, declarations: [] });
});

test('hidden lineage candidates produce exactly the same result as physical absence', () => {
  const visible = new Set(['file:New.md']);
  assert.deepEqual(inspectScopedLineage(buildGraph([source, old], []), 'file:New.md', visible),
    inspectScopedLineage(buildGraph([source], []), 'file:New.md', visible));
});

test('ambiguity is evaluated only among readable candidates', () => {
  const files = [source, { ...old, relativePath: 'A/Old.md' }, { ...old, relativePath: 'B/Old.md' }];
  const graph = buildGraph(files, []);
  const both = inspectScopedLineage(graph, 'file:New.md', new Set(['file:New.md', 'file:A/Old.md', 'file:B/Old.md']));
  assert.equal(both.declarations[0].status, 'ambiguous');
  assert.equal(both.declarations[0].resolvedNodeId, null);
  const one = inspectScopedLineage(graph, 'file:New.md', new Set(['file:New.md', 'file:A/Old.md']));
  assert.equal(one.declarations[0].status, 'resolved');
  assert.equal(one.declarations[0].resolvedNodeId, 'file:A/Old.md');
  assert.deepEqual(one, inspectScopedLineage(buildGraph(files.slice(0, 2), []), 'file:New.md', new Set(['file:New.md', 'file:A/Old.md'])));
});
