import test from 'node:test';
import assert from 'node:assert/strict';

// Missing private bundle is an assertion failure on the first RED run.
const codec = await import('../dist/canonical-cbor.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const { encodeCanonicalCbor: encode, decodeCanonicalCbor: decode } = codec;
const bytes = hex => Uint8Array.from(Buffer.from(hex, 'hex'));
const hex = value => Buffer.from(value).toString('hex');

test('null has the fixed canonical bytes and decodes as a typed node', () => {
  assert.equal(typeof encode, 'function', 'private canonical-CBOR encoder missing');
  assert.equal(hex(encode({kind:'null'})), 'f6');
  assert.deepEqual(decode(bytes('f6')), {kind:'null'});
});

const refuses = (action, number, reason) => assert.throws(action, error => {
  assert.ok(error instanceof codec.CanonicalCborError);
  assert.equal(error.code, `GKOS-GATE-L6-00${number}`);
  assert.equal(error.requirementId, `GKOS-CANON-00${number}`);
  assert.equal(typeof error.reason, 'string');
  if (reason) assert.equal(error.reason, reason);
  return true;
});
test('boolean values preserve their distinct canonical encodings', () => {
  for (const [value, expected] of [[false,'f4'],[true,'f5']]) {
    assert.equal(hex(encode({kind:'boolean',value})),expected);
    assert.deepEqual(decode(bytes(expected)),{kind:'boolean',value});
  }
  refuses(() => encode({kind:'boolean',value:1}),1);
});
test('bigint integers cover shortest heads and the unsigned64 domain', () => {
  const cases = [[0n,'00'],[23n,'17'],[24n,'1818'],[255n,'18ff'],[256n,'190100'],[65535n,'19ffff'],[65536n,'1a00010000'],[4294967295n,'1affffffff'],[4294967296n,'1b0000000100000000'],[18446744073709551615n,'1bffffffffffffffff'],[-1n,'20'],[-24n,'37'],[-25n,'3818'],[-18446744073709551616n,'3bffffffffffffffff']];
  for (const [value, expected] of cases) {
    assert.equal(hex(encode({kind:'integer',value})),expected);
    assert.deepEqual(decode(bytes(expected)),{kind:'integer',value});
  }
  for (const value of [0, '1', 18446744073709551616n, -18446744073709551617n]) refuses(() => encode({kind:'integer',value}),3);
  for (const input of ['1800','190018','1a0000ffff','1b00000000ffffffff','3800']) refuses(() => decode(bytes(input)),1);
});
test('floats retain their type and use shortest exact half single or double bytes', () => {
  const cases = [[0,'f90000'],[1,'f93c00'],[-2,'f9c000'],[1.5,'f93e00'],[65504,'f97bff'],[2**-24,'f90001'],[2**-14,'f90400'],[100000,'fa47c35000'],[2**-25,'fa33000000'],[1.1,'fb3ff199999999999a'],[Number.MIN_VALUE,'fb0000000000000001'],[Number.MAX_VALUE,'fb7fefffffffffffff']];
  for (const [value,expected] of cases) {
    assert.equal(hex(encode({kind:'float',value})),expected);
    assert.deepEqual(decode(bytes(expected)),{kind:'float',value});
  }
  for (const value of [-0, NaN, Infinity, -Infinity, 1n, '1']) refuses(() => encode({kind:'float',value}),3);
  for (const input of ['f98000','f97e00','f97c00','f9fc00','fa3f800000','fb3ff0000000000000','fb40f86a0000000000']) refuses(() => decode(bytes(input)),3);
});
test('byte strings preserve source bytes separately from text', () => {
  for (const [value,expected] of [[new Uint8Array(),'40'],[bytes('deadbeef'),'44deadbeef'],[new Uint8Array(24),'5818'+'00'.repeat(24)]]) {
    assert.equal(hex(encode({kind:'bytes',value})),expected);
    const decoded = decode(bytes(expected));
    assert.deepEqual(decoded,{kind:'bytes',value});
    if (decoded.value.length) { const input = bytes(expected); const copy = decode(input); input.fill(0); assert.deepEqual(copy.value,value); }
  }
  refuses(() => encode({kind:'bytes',value:[1,2]}),1);
  for (const input of ['5800','5a00000001ff','4300','5f40ff']) refuses(() => decode(bytes(input)),1);
});
test('text validates strict UTF8 NFC and well-formed UTF16 without stripping BOM', () => {
  for (const [value,expected] of [['','60'],['é','62c3a9'],['\ufeff','63efbbbf'],['😀','64f09f9880']]) {
    assert.equal(hex(encode({kind:'text',value})),expected);
    assert.deepEqual(decode(bytes(expected)),{kind:'text',value});
  }
  for (const value of ['e\u0301','\ud800','\udc00','x\ud800y',1]) refuses(() => encode({kind:'text',value}),5);
  for (const input of ['61ff','62c080','63eda080','64f4908080','63e28241','6365cc81','61c2','63efbb']) {
    refuses(() => decode(bytes(input)),input === '63efbb' ? 1 : 5);
  }
});
test('text fails closed when the actual runtime Unicode17 capability is unavailable', async () => {
  const { spawnSync } = await import('node:child_process');
  // Isolated process simulates an unavailable host capability, not a caller option.
  for (const setup of ["Object.defineProperty(process.versions,'unicode',{value:'16.0'})", "Object.defineProperty(process.versions,'unicode',{value:undefined})", "String.prototype.normalize=undefined", "String.prototype.normalize=()=>{throw Error('ICU unavailable')}"]) {
    const script = `${setup}; const c=await import(${JSON.stringify(new URL('../dist/canonical-cbor.mjs',import.meta.url).href)}); for(const op of [()=>c.encodeCanonicalCbor({kind:'text',value:'a'}, {unicodeVersion:'17.0'}),()=>c.decodeCanonicalCbor(Uint8Array.of(0x61,0x61))]){try{op();process.exit(2)}catch(e){if(e.code!=='GKOS-GATE-L6-005'||e.reason!=='unicode_profile_unavailable')throw e}}`;
    const result = spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
    assert.equal(result.status,0,result.stdout+result.stderr);
  }
});
test('arrays preserve order and distinguish empty null and integral float', () => {
  for (const [node,expected] of [[{kind:'array',items:[]},'80'],[{kind:'array',items:[{kind:'integer',value:1n},{kind:'float',value:1},{kind:'null'},{kind:'text',value:''},{kind:'bytes',value:new Uint8Array()}]},'8501f93c00f66040'],[{kind:'array',items:[{kind:'array',items:[{kind:'boolean',value:false}]}]},'8181f4']]) {
    assert.equal(hex(encode(node)),expected);
    assert.deepEqual(decode(bytes(expected)),node);
  }
  refuses(() => encode({kind:'array',items:{}}),1);
  for(const input of ['9800','8100f6','81','9fff']) refuses(() => decode(bytes(input)),1);
});
test('maps sort encoded text-key bytes without mutating entries and refuse duplicates or disorder', () => {
  const entries = [['b',{kind:'integer',value:1n}],['a',{kind:'integer',value:2n}]];
  assert.equal(hex(encode({kind:'map',entries})), 'a2616102616201');
  assert.deepEqual(entries.map(([key])=>key),['b','a']);
  assert.deepEqual(decode(bytes('a2616102616201')),{kind:'map',entries:[entries[1],entries[0]]});
  assert.equal(hex(encode({kind:'map',entries:[]})),'a0');
  assert.deepEqual(decode(bytes('a0')),{kind:'map',entries:[]});
  // UTF8 key encoding, including CBOR heads, controls sorting: neither JS text nor insertion order.
  const keys = ['aa','é','b','', '\ufeff'];
  const result = decode(encode({kind:'map',entries:keys.map(key=>[key,{kind:'null'}])}));
  assert.deepEqual(result.entries.map(([key])=>key),['','b','aa','é','\ufeff']);
  for (const key of ['__proto__','constructor']) assert.equal(decode(encode({kind:'map',entries:[[key,{kind:'null'}]]})).entries[0][0],key);
  refuses(()=>encode({kind:'map',entries:[['a',{kind:'null'}],['a',{kind:'null'}]]}),2);
  for(const input of ['a2616101616102','a2616201616102']) refuses(()=>decode(bytes(input)),2);
  for(const input of ['a10000','b800','a16161']) refuses(()=>decode(bytes(input)),1);
  for(const entries of [{}, [[1,{kind:'null'}]], [['a']], [null]]) refuses(()=>encode({kind:'map',entries}),1);
  refuses(()=>encode({kind:'map',entries:[['e\u0301',{kind:'null'}]]}),5);
});
test('binary and typed boundaries reject malformed unsupported values', () => {
  for(const input of [null,undefined,[],{},'f6',new ArrayBuffer(1),new Uint16Array([246])]) refuses(()=>decode(input),1);
  for(const input of [null,undefined,1,[],{}, {kind:'undefined'}, {kind:'tag',value:1n}, {kind:'boolean',value:'true'}]) refuses(()=>encode(input),1);
  for(const input of ['', 'f7','f8ff','fc','fd','fe','ff','c0f6','d9ffff00','9fff','7f60ff','bf6161f6ff','1c','1d','1e','1f','1817','1900ff','1a00000100','f9','fa0000','fb00000000','0001','f6f6']) refuses(()=>decode(bytes(input)),1);
});
test('encoded-byte hard limit is enforced before allocating oversized payloads', () => {
  const limit=1048576;
  const node={kind:'bytes',value:new Uint8Array(limit-5)};
  const accepted=encode(node);
  assert.equal(accepted.length,limit);
  assert.equal(decode(accepted).value.length,limit-5);
  refuses(()=>encode({kind:'bytes',value:new Uint8Array(limit-4)}),1);
  refuses(()=>encode({kind:'text',value:'a'.repeat(limit)}),1);
  refuses(()=>decode(new Uint8Array(limit+1)),1);
  for(const input of ['5bffffffffffffffff','7bffffffffffffffff','9bffffffffffffffff','bbffffffffffffffff']) refuses(()=>decode(bytes(input)),1);
  const many={kind:'array',items:Array.from({length:3},()=>({kind:'bytes',value:new Uint8Array(400000)}))};
  refuses(()=>encode(many),1);
});
test('nesting depth is bounded with root depth zero', () => {
  let node={kind:'null'};
  for(let i=0;i<64;i++) node={kind:'array',items:[node]};
  const canonical=encode(node);
  assert.deepEqual(decode(canonical),node);
  refuses(()=>encode({kind:'array',items:[node]}),1);
  refuses(()=>decode(bytes('81'.repeat(65)+'f6')),1);
  // Keys are child value nodes too, even at an empty-key map near the boundary.
  let map={kind:'map',entries:[['a',{kind:'null'}]]};
  for(let i=0;i<63;i++) map={kind:'array',items:[map]};
  assert.deepEqual(decode(encode(map)),map);
  refuses(()=>encode({kind:'array',items:[map]}),1);
});
test('total value-node budget includes map keys and preflights declared lengths', () => {
  const nulls=count=>Array.from({length:count},()=>({kind:'null'}));
  const accepted={kind:'array',items:nulls(9999)};
  assert.deepEqual(decode(encode(accepted)),accepted);
  refuses(()=>encode({kind:'array',items:nulls(10000)}),1,'node_limit');
  refuses(()=>decode(bytes('992710'+'f6'.repeat(10000))),1,'node_limit');
  const entries=count=>Array.from({length:count},(_,i)=>[String(i).padStart(4,'0'),{kind:'null'}]);
  const map={kind:'map',entries:entries(4999)};
  assert.deepEqual(decode(encode(map)),map);
  refuses(()=>encode({kind:'map',entries:entries(5000)}),1,'node_limit');
  const nested={kind:'array',items:[{kind:'array',items:nulls(9998)}]};
  assert.deepEqual(decode(encode(nested)),nested);
  refuses(()=>encode({kind:'array',items:[accepted]}),1,'node_limit');
  for(const input of ['9bffffffffffffffff','bbffffffffffffffff']) refuses(()=>decode(bytes(input)),1,'node_limit');
});
test('cyclic inputs are refused explicitly while shared acyclic subtrees are allowed', () => {
  const array={kind:'array',items:[]}; array.items.push(array);
  refuses(()=>encode(array),1,'cyclic_input');
  const map={kind:'map',entries:[]}; map.entries.push(['self',map]);
  refuses(()=>encode(map),1,'cyclic_input');
  const left={kind:'array',items:[]}, right={kind:'array',items:[left]}; left.items.push(right);
  refuses(()=>encode(left),1,'cyclic_input');
  const shared={kind:'array',items:[{kind:'null'}]};
  assert.equal(hex(encode({kind:'array',items:[shared,shared]})),'8281f681f6');
});
test('explicit canonical timestamps enforce Gregorian dates and exact UTC microsecond grammar', () => {
  const validate=codec.validateCanonicalTimestamp;
  assert.equal(typeof validate,'function');
  for(const text of ['2024-02-29T23:59:59.000001Z','2000-02-29T00:00:00.999999Z','0001-01-01T00:00:00.000000Z','9999-12-31T23:59:59.999999Z','2026-04-30T12:34:56.123456Z']) assert.equal(validate(text),undefined);
  for(const text of ['1900-02-29T00:00:00.000000Z','2100-02-29T00:00:00.000000Z','2025-02-29T00:00:00.000000Z','2026-04-31T00:00:00.000000Z','2026-00-01T00:00:00.000000Z','2026-13-01T00:00:00.000000Z','2026-01-00T00:00:00.000000Z','2026-01-32T00:00:00.000000Z','2026-01-01T24:00:00.000000Z','2026-01-01T00:60:00.000000Z','2026-01-01T00:00:60.000000Z','2026-01-01T00:00:00.00000Z','2026-01-01T00:00:00.0000000Z','2026-01-01T00:00:00.000000z','2026-01-01t00:00:00.000000Z','2026-01-01T00:00:00.000000+00:00','0000-01-01T00:00:00.000000Z','2026-01-01T00:00:00.000000Z\n',null,1]) refuses(()=>validate(text),4);
  // Timestamp interpretation is schema-explicit, not a generic text gate.
  const value='2026-02-30T00:00:00.000000Z';
  assert.deepEqual(decode(encode({kind:'text',value})),{kind:'text',value});
});
test('digest hashes only verified canonical bytes and labels the bounded profile', async () => {
  const digest=codec.digestCanonicalCbor;
  assert.equal(typeof digest,'function');
  const {createHash}=await import('node:crypto');
  for(const input of ['f6','8301f93c00f6','a2616102616201','63efbbbf']) {
    const canonical=bytes(input);
    assert.deepEqual(digest(canonical),{algorithm:'sha-256',canonical_profile:'GKX-CBOR-1',digest:createHash('sha256').update(canonical).digest('hex')});
  }
  for(const [input,code] of [['1800',1],['a2616101616102',2],['fa3f800000',3],['6365cc81',5],['61ff',5]]) refuses(()=>digest(bytes(input)),code);
  refuses(()=>digest('f6'),1);
});
const {readFileSync}=await import('node:fs');
const vectors=JSON.parse(readFileSync(new URL('./canonical-cbor-vectors.json',import.meta.url),'utf8'));
function typedNode(node) {
  if(node.kind==='integer') return {...node,value:BigInt(node.value)};
  if(node.kind==='bytes') return {...node,value:bytes(node.value)};
  if(node.kind==='array') return {...node,items:node.items.map(typedNode)};
  if(node.kind==='map') return {...node,entries:node.entries.map(([key,value])=>[key,typedNode(value)])};
  return node;
}
for(const vector of vectors.positive) test(`shared positive: ${vector.label}`,()=>{
  const node=typedNode(vector.node);
  assert.equal(hex(encode(node)),vector.hex);
  assert.deepEqual(decode(bytes(vector.hex)),node);
});
for(const vector of vectors.negative) test(`shared refusal: ${vector.label}`,()=>{
  refuses(()=>decode(bytes(vector.hex)),Number(vector.code.slice(-1)));
  refuses(()=>codec.digestCanonicalCbor(bytes(vector.hex)),Number(vector.code.slice(-1)));
});

test('all binary16 patterns preserve exact finite float bits or refuse prohibited values',t=>{
  let accepted=0, refused=0;
  for(let bits=0;bits<65536;bits++) {
    const input=Uint8Array.of(0xf9,bits>>>8,bits&255);
    if((bits&0x7c00)===0x7c00 || bits===0x8000) { refuses(()=>decode(input),3); refused++; }
    else { const node=decode(input); assert.equal(node.kind,'float'); assert.equal(hex(encode(node)),hex(input)); accepted++; }
  }
  assert.equal(accepted+refused,65536);
  t.diagnostic(JSON.stringify({binary16_patterns:65536,accepted,refused}));
});

test('official pinned Unicode17 normalization vectors execute through both text boundaries', {skip:!process.env.GKOS_NORMALIZATION_TEST_PATH && 'GKOS_NORMALIZATION_TEST_PATH absent: official Unicode17 vectors unavailable'}, async t=>{
  const {createHash}=await import('node:crypto');
  const file=readFileSync(process.env.GKOS_NORMALIZATION_TEST_PATH);
  assert.equal(createHash('sha256').update(file).digest('hex'),'5019ffd530751a741900c849c0e010332f142a3612234639bd200b82138a87db');
  assert.match(file.toString('utf8'),/^# NormalizationTest-17\.0\.0\.txt/);
  let rows=0, accepted=0, refused=0, invariants=0;
  for(const line of file.toString('utf8').split(/\r?\n/)) {
    const data=line.split('#')[0].trim();
    if(!data || data.startsWith('@')) continue;
    const columns=data.split(';').slice(0,5).map(field=>String.fromCodePoint(...field.trim().split(/\s+/).map(code=>parseInt(code,16))));
    assert.equal(columns.length,5);
    rows++;
    for(const [index,value] of columns.entries()) {
      const nfc=columns[index<3 ? 1 : 3];
      for(const [form,expected] of [['NFC',nfc],['NFD',columns[index<3 ? 2 : 4]],['NFKC',columns[3]],['NFKD',columns[4]]]) {
        assert.equal(value.normalize(form),expected,`row ${rows} column ${index+1} ${form}`); invariants++;
      }
      // Independent CBOR text head: do not normalize/reencode before testing decoder refusal.
      const utf8=Buffer.from(value,'utf8');
      const prefix=utf8.length<24 ? Buffer.from([0x60+utf8.length]) : utf8.length<256 ? Buffer.from([0x78,utf8.length]) : Buffer.from([0x79,utf8.length>>>8,utf8.length&255]);
      const raw=Uint8Array.from(Buffer.concat([prefix,utf8]));
      if(value===nfc) {
        assert.deepEqual(decode(raw),{kind:'text',value});
        assert.equal(hex(encode({kind:'text',value})),hex(raw)); accepted++;
      } else {
        refuses(()=>encode({kind:'text',value}),5,'non_nfc');
        refuses(()=>decode(raw),5,'non_nfc'); refused++;
      }
    }
  }
  assert.ok(rows>19000,'normalization corpus must not be silently empty or truncated');
  t.diagnostic(JSON.stringify({unicode:process.versions.unicode,normalization_rows:rows,normalization_invariants:invariants,codec_text_cases:accepted+refused,accepted,refused}));
});
test('sparse map-entry arrays cannot bypass structured malformed-input refusal', () => {
  refuses(()=>encode({kind:'map',entries:new Array(1)}),1);
  const sparse=[['a',{kind:'null'}],,['b',{kind:'null'}]];
  refuses(()=>encode({kind:'map',entries:sparse}),1);
  refuses(()=>encode({kind:'array',items:new Array(1)}),1);
});
test('digest validates and hashes one defensive snapshot rather than mutable caller bytes', async () => {
  const {createHash}=await import('node:crypto');
  const input=bytes('6161'), expected=createHash('sha256').update(input).digest('hex');
  const normalize=String.prototype.normalize;
  try {
    // The validation callback changes the caller buffer after UTF8 decoding.
    String.prototype.normalize=function(form){ input.fill(0xff); return normalize.call(this,form); };
    assert.equal(codec.digestCanonicalCbor(input).digest,expected);
  } finally { String.prototype.normalize=normalize; }
  assert.equal(hex(input),'ffff');
});
test('deterministic binary32 and binary64 bit inputs choose exact width without numeric type coercion', t => {
  // Reference set derives binary16 values directly from IEEE sign/exponent/fraction.
  const half=new Map();
  for(let bits=0;bits<65536;bits++) {
    const exponent=(bits>>>10)&31, fraction=bits&1023;
    if(exponent===31 || bits===0x8000) continue;
    const value=(bits&0x8000 ? -1 : 1)*(exponent===0 ? fraction/16777216 : (1+fraction/1024)*2**(exponent-15));
    half.set(value,bits);
  }
  let state=0x12345678, checked=0, prohibited=0;
  const next=()=>state=(Math.imul(state,1664525)+0x3c6ef35f)>>>0;
  for(const size of [4,8]) for(let i=0;i<10000;i++) {
    const raw=new Uint8Array(size), data=new DataView(raw.buffer);
    data.setUint32(0,next()); if(size===8) data.setUint32(4,next());
    const value=size===4 ? data.getFloat32(0) : data.getFloat64(0);
    const input=Uint8Array.of(size===4 ? 0xfa : 0xfb,...raw);
    if(!Number.isFinite(value)||Object.is(value,-0)) { refuses(()=>decode(input),3); prohibited++; continue; }
    const width=half.has(value) ? 3 : Object.is(Math.fround(value),value) ? 5 : 9;
    const encoded=encode({kind:'float',value});
    assert.equal(encoded.length,width);
    assert.deepEqual(decode(encoded),{kind:'float',value});
    if(width===size+1) assert.equal(hex(encoded),hex(input));
    else refuses(()=>decode(input),3,'nonshortest_float');
    checked++;
  }
  t.diagnostic(JSON.stringify({float_bit_patterns:20000,checked,prohibited}));
});

test('deterministic arbitrary CBOR bytes either reencode identically or produce registered refusal', t => {
  let state=0x6a09e667, accepted=0, refused=0;
  const next=()=>state=(Math.imul(state,1103515245)+12345)>>>0;
  for(let i=0;i<2000;i++) {
    const raw=Uint8Array.from({length:next()%64},()=>next()>>>24);
    let decoded;
    try { decoded=decode(raw); }
    catch(error) { assert.ok(error instanceof codec.CanonicalCborError); assert.match(error.code,/^GKOS-GATE-L6-00[1235]$/); refused++; continue; }
    assert.equal(hex(encode(decoded)),hex(raw)); accepted++;
  }
  t.diagnostic(JSON.stringify({arbitrary_cbor_cases:2000,accepted,refused}));
});

test('canonical assembly is repeatable and cannot conflate absent empty and null entries', () => {
  const entries=[['missing-is-not-in-this-map',{kind:'null'}],['empty-text',{kind:'text',value:''}],['empty-bytes',{kind:'bytes',value:new Uint8Array()}],['empty-array',{kind:'array',items:[]}],['empty-map',{kind:'map',entries:[]}]];
  const original={kind:'map',entries};
  const canonical=encode(original), digest=codec.digestCanonicalCbor(canonical);
  for(let rotation=0;rotation<entries.length;rotation++) {
    const permuted={kind:'map',entries:[...entries.slice(rotation),...entries.slice(0,rotation)]};
    assert.equal(hex(encode(permuted)),hex(canonical));
    assert.deepEqual(codec.digestCanonicalCbor(encode(permuted)),digest);
  }
  assert.equal(decode(canonical).entries.length,5);
  assert.notEqual(hex(encode({kind:'map',entries:entries.slice(1)})),hex(canonical));
  assert.deepEqual(entries.map(([key])=>key),['missing-is-not-in-this-map','empty-text','empty-bytes','empty-array','empty-map']);
});
test('the development codec is additive and does not alter public exports or legacy canonical JSON', async () => {
  const root=await import('../dist/gkos-engine.mjs');
  for(const name of ['CanonicalCborError','encodeCanonicalCbor','decodeCanonicalCbor','digestCanonicalCbor','validateCanonicalTimestamp']) assert.equal(name in root,false);
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(Object.keys(pkg.exports).some(key=>key.includes('canonical-cbor')),false);
  assert.equal(root.canonicalJson({text:'a\r\nb',zero:-0}),JSON.stringify({text:'a\nb',zero:0}));
});

