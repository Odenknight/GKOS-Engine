import assert from 'node:assert/strict';
import test from 'node:test';
import { observeDossierSnapshot } from '../examples/eu-ai-evidence/p1-observer.mjs';

const uid1 = '719823a1-5299-48ba-89e0-6771f6fbbba1';
const uid2 = '719823a1-5299-48ba-89e0-6771f6fbbba2';
const source = (uid, path, at, predecessor) => Object.freeze({
  relativePath: path,
  createdTime: Date.parse(at), modifiedTime: Date.parse(at),
  content: `---\ngkx_version: "2.0"\nuid: "${uid}"\ntitle: "${path}"\ntype: semantic\ncreated_at: "${at}"\ntimestamp: "${at}"\nepistemic_state: reported\nsensitivity: public\nauthorship_origin: authored\n${predecessor ? `supersedes:\n  - "${predecessor}"\n` : ''}---\nFictional observer test.\n`,
});

test('P1 observer exposes actual UID resolution and one-sided lineage without changing input', () => {
  const at = '2026-08-02T10:00:00.000Z';
  const records = Object.freeze([
    source(uid1, 'one.md', '2026-08-01T10:00:00.000Z'),
    source(uid2, 'two.md', at, uid1),
  ]);
  const before = JSON.stringify(records);
  const result = observeDossierSnapshot({ records, now: Date.parse('2026-08-03T12:00:00Z') });
  const first = result.graph.nodes.find(n => n.id === result.graph.gkxUidIndex[uid1]);
  const second = result.graph.nodes.find(n => n.id === result.graph.gkxUidIndex[uid2]);
  assert.deepEqual(first.gkx.supersededByIds, [second.id]);
  assert.deepEqual(second.gkx.supersedesIds, [first.id]);
  assert.equal(first.gkx.invalidAt, at);
  assert.equal(first.gkx.head, false);
  assert.equal(second.gkx.head, true);
  assert.equal(first.gkx.projection.authored.uid, uid1);
  assert.equal(JSON.stringify(records), before);
  assert.equal('pass' in result, false);
  assert.equal('selection' in result, false);
});

test('P1 observer rejects unavailable input instead of fabricating an observation', () => {
  assert.throws(() => observeDossierSnapshot({ records: null, now: 1 }), TypeError);
  assert.throws(() => observeDossierSnapshot({ records: [], now: NaN }), TypeError);
  assert.throws(() => observeDossierSnapshot({ records: [{ relativePath: 'missing.md' }], now: 1 }), TypeError);
});
