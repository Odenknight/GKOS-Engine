// Auto-selected DEVELOPMENT regression: test the actual host, never claim
// Unicode17 conformance on an unavailable host. Full corpus is an explicit lane:
// node --test test/canonical-cbor-unicode17.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as codec from '../dist/canonical-cbor.mjs';

const { encodeCanonicalCbor: encode, decodeCanonicalCbor: decode, digestCanonicalCbor: digest } = codec;
const bytes = value => Uint8Array.from(Buffer.from(value, 'hex'));
const hex = value => Buffer.from(value).toString('hex');
const refuses = (action, gate, reason) => assert.throws(action, error => {
  assert.ok(error instanceof codec.CanonicalCborError);
  assert.equal(error.code, `GKOS-GATE-L6-00${gate}`);
  assert.equal(error.requirementId, `GKOS-CANON-00${gate}`);
  if (reason) assert.equal(error.reason, reason);
  return true;
});
let unicode17Available = ['17.0', '17.0.0'].includes(process.versions.unicode)
  && typeof String.prototype.normalize === 'function';
if (unicode17Available) {
  try { unicode17Available = 'e\u0301'.normalize('NFC') === 'é'; }
  catch { unicode17Available = false; }
}

test('actual runtime text capability either validates Unicode17 or refuses closed without skips', t => {
  t.diagnostic(JSON.stringify({ node: process.versions.node, unicode: process.versions.unicode ?? null,
    text_expectation: unicode17Available ? 'Unicode17 validation' : 'unicode_profile_unavailable refusal' }));
  for (const [value, canonical] of [['', '60'], ['a', '6161'], ['é', '62c3a9'], ['\ufeff', '63efbbbf'], ['😀', '64f09f9880']]) {
    const node = { kind: 'text', value };
    const operations = [() => encode(node), () => decode(bytes(canonical)), () => digest(bytes(canonical)),
      () => encode(node, { unicodeVersion: '17.0' })]; // caller option cannot override real host
    if (unicode17Available) {
      assert.equal(hex(operations[0]()), canonical);
      assert.deepEqual(operations[1](), node);
      assert.equal(operations[2]().digest, createHash('sha256').update(bytes(canonical)).digest('hex'));
      assert.equal(hex(operations[3]()), canonical);
    } else {
      for (const operation of operations) refuses(operation, 5, 'unicode_profile_unavailable');
    }
  }
  const nested = { kind: 'array', items: [{ kind: 'text', value: 'a' }] };
  const map = { kind: 'map', entries: [['a', { kind: 'integer', value: 1n }]] };
  for (const [node, canonical] of [[nested, '816161'], [map, 'a1616101']]) {
    if (unicode17Available) assert.deepEqual(decode(encode(node)), node);
    else for (const operation of [() => encode(node), () => decode(bytes(canonical)), () => digest(bytes(canonical))]) {
      refuses(operation, 5, 'unicode_profile_unavailable');
    }
  }
});

test('actual runtime refuses decomposed text and malformed text without normalization repair', () => {
  const reason = unicode17Available ? 'non_nfc' : 'unicode_profile_unavailable';
  refuses(() => encode({ kind: 'text', value: 'e\u0301' }), 5, reason);
  refuses(() => decode(bytes('6365cc81')), 5, reason);
  refuses(() => digest(bytes('6365cc81')), 5, reason);
  for (const value of ['\ud800', '\udc00']) refuses(() => encode({ kind: 'text', value }), 5);
  for (const canonical of ['61ff', '62c080', '63eda080', '64f4908080']) refuses(() => decode(bytes(canonical)), 5);
});

test('isolated capability loss refuses encode decode digest and map text while numeric values remain usable', () => {
  const url = JSON.stringify(new URL('../dist/canonical-cbor.mjs', import.meta.url).href);
  // These are deliberate negative fault injections, not evidence of a real
  // Node22/26 host's Unicode version. The preceding tests use the actual host.
  for (const setup of ["Object.defineProperty(process.versions,'unicode',{value:'16.0'})",
    "Object.defineProperty(process.versions,'unicode',{value:undefined})",
    'String.prototype.normalize=undefined',
    "String.prototype.normalize=()=>{throw Error('ICU unavailable')}"]) {
    const script = `${setup}; const c=await import(${url});
      for(const op of [()=>c.encodeCanonicalCbor({kind:'text',value:'a'},{unicodeVersion:'17.0'}),
        ()=>c.decodeCanonicalCbor(Uint8Array.of(0x61,0x61)),
        ()=>c.digestCanonicalCbor(Uint8Array.of(0x61,0x61)),
        ()=>c.encodeCanonicalCbor({kind:'map',entries:[['a',{kind:'null'}]]})]) {
        try { op(); process.exit(2); }
        catch(e) { if(e.code!=='GKOS-GATE-L6-005'||e.requirementId!=='GKOS-CANON-005'||e.reason!=='unicode_profile_unavailable')throw e; }
      }
      if(c.decodeCanonicalCbor(c.encodeCanonicalCbor({kind:'integer',value:24n})).value!==24n)process.exit(3);`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
});

test('numeric integer values keep shortest heads bigint type and unsigned64 bounds on any runtime', () => {
  for (const [value, canonical] of [[0n, '00'], [23n, '17'], [24n, '1818'], [255n, '18ff'], [256n, '190100'],
    [65536n, '1a00010000'], [4294967296n, '1b0000000100000000'],
    [18446744073709551615n, '1bffffffffffffffff'], [-1n, '20'], [-25n, '3818'],
    [-18446744073709551616n, '3bffffffffffffffff']]) {
    assert.equal(hex(encode({ kind: 'integer', value })), canonical);
    assert.deepEqual(decode(bytes(canonical)), { kind: 'integer', value });
  }
  for (const value of [0, '1', 18446744073709551616n, -18446744073709551617n]) refuses(() => encode({ kind: 'integer', value }), 3);
  for (const canonical of ['1800', '190018', '1a0000ffff', '1b00000000ffffffff', '3800']) refuses(() => decode(bytes(canonical)), 1);
});

test('numeric float values retain float type shortest exact width and prohibited-value refusal on any runtime', () => {
  for (const [value, canonical] of [[0, 'f90000'], [1, 'f93c00'], [1.5, 'f93e00'], [2 ** -24, 'f90001'],
    [100000, 'fa47c35000'], [1.1, 'fb3ff199999999999a'], [Number.MIN_VALUE, 'fb0000000000000001'],
    [Number.MAX_VALUE, 'fb7fefffffffffffff']]) {
    assert.equal(hex(encode({ kind: 'float', value })), canonical);
    assert.deepEqual(decode(bytes(canonical)), { kind: 'float', value });
  }
  for (const value of [-0, NaN, Infinity, -Infinity, 1n, '1']) refuses(() => encode({ kind: 'float', value }), 3);
  for (const canonical of ['f98000', 'f97e00', 'f97c00', 'f9fc00', 'fa3f800000', 'fb3ff0000000000000']) refuses(() => decode(bytes(canonical)), 3);
});

test('nontext assembly and digest remain canonical without any Unicode requirement', () => {
  const node = { kind: 'array', items: [{ kind: 'integer', value: 1n }, { kind: 'float', value: 1 },
    { kind: 'null' }, { kind: 'boolean', value: false }, { kind: 'bytes', value: bytes('deadbeef') },
    { kind: 'array', items: [] }, { kind: 'map', entries: [] }] };
  const canonical = '8701f93c00f6f444deadbeef80a0';
  assert.equal(hex(encode(node)), canonical);
  assert.deepEqual(decode(bytes(canonical)), node);
  assert.deepEqual(digest(bytes(canonical)), { algorithm: 'sha-256', canonical_profile: 'GKX-CBOR-1',
    digest: createHash('sha256').update(bytes(canonical)).digest('hex') });
  for (const canonical of ['f6f6', '9fff', 'c0f6']) refuses(() => decode(bytes(canonical)), 1);
});

test('private codec stays private alongside the explicit host artifact subpath and legacy JSON', async () => {
  const root = await import('../dist/gkos-engine.mjs');
  const privateNames = ['CanonicalCborError', 'encodeCanonicalCbor', 'decodeCanonicalCbor', 'digestCanonicalCbor', 'validateCanonicalTimestamp'];
  assert.deepEqual(Object.keys(codec).sort(), privateNames.sort());
  for (const name of privateNames) assert.equal(name in root, false);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(pkg.exports), ['.', './adapter', './gkx', './graphiti', './navigation',
    './navigation-effects', './navigation-effects/node', './governance', './governance/artifacts', './retrieval', './admission-policy']);
  assert.equal(root.canonicalJson({ text: 'a\r\nb', zero: -0 }), JSON.stringify({ text: 'a\nb', zero: 0 }));
});
