/** Repository-private, bounded development codec. Not artifact/authority validation. */
import { versions } from 'node:process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

const MAX_BYTES = 1_048_576;
const MAX_DEPTH = 64;
const MAX_NODES = 10_000;
/** Frozen adapter contract; integers and floats remain distinct even when integral.
 * Source: gkos-standard@b308ff7137bdbb109c31f0ace7e6c49b8988e0d5,
 * Canonical_Serialization.md and Diagnostic_Code_Registry.md.
 * Tags, non-text keys and undeclared set semantics are deliberately unsupported.
 */
export type CanonicalNode =
  | { kind: 'null' }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'integer'; value: bigint }
  | { kind: 'float'; value: number }
  | { kind: 'text'; value: string }
  | { kind: 'bytes'; value: Uint8Array }
  | { kind: 'array'; items: CanonicalNode[] }
  | { kind: 'map'; entries: [string, CanonicalNode][] };

/** Registered diagnostic mapping only; this Error is not a persisted Refusal Receipt. */
export class CanonicalCborError extends Error {
  readonly code: string;
  readonly requirementId: string;
  constructor(number: 1 | 2 | 3 | 4 | 5, readonly reason: string) {
    super(reason);
    this.name = 'CanonicalCborError';
    this.code = `GKOS-GATE-L6-00${number}`;
    this.requirementId = `GKOS-CANON-00${number}`;
  }
}
function fail(number: 1 | 2 | 3 | 4 | 5, reason: string): never {
  throw new CanonicalCborError(number, reason);
}

// Capture the actual Node capability; there is no caller-selected profile override.
const runtimeUnicode = versions.unicode;
const textEncoder = new TextEncoder();
// ignoreBOM=true means treat U+FEFF as content, rather than consume it.
const textDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
function validateText(value: string): void {
  if (typeof value !== 'string') fail(5, 'invalid_text');
  if (value.length > MAX_BYTES) fail(1, 'byte_limit');
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail(5, 'unpaired_surrogate');
    } else if (unit >= 0xdc00 && unit <= 0xdfff) fail(5, 'unpaired_surrogate');
  }
  if ((runtimeUnicode !== '17.0' && runtimeUnicode !== '17.0.0') || typeof String.prototype.normalize !== 'function') fail(5, 'unicode_profile_unavailable');
  let normalized: string;
  try { normalized = value.normalize('NFC'); } catch { fail(5, 'unicode_profile_unavailable'); }
  if (normalized !== value) fail(5, 'non_nfc');
}
function halfValue(bits: number): number {
  const exponent = (bits >>> 10) & 31, fraction = bits & 1023;
  const magnitude = exponent === 0 ? fraction * 2 ** -24 : exponent === 31 ? (fraction ? NaN : Infinity) : (1024 + fraction) * 2 ** (exponent - 25);
  return bits & 0x8000 ? -magnitude : magnitude;
}
function floatBytes(value: number): Uint8Array {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) fail(3, 'invalid_float');
  const data = new DataView(new ArrayBuffer(8));
  data.setFloat32(0, value, false);
  if (Object.is(data.getFloat32(0, false), value)) {
    const bits = data.getUint32(0, false), sign = (bits >>> 16) & 0x8000;
    const exponent = ((bits >>> 23) & 255) - 112, fraction = bits & 0x7fffff;
    let candidate: number | undefined;
    if (value === 0) candidate = 0;
    else if (exponent >= 1 && exponent <= 30 && (fraction & 8191) === 0) candidate = sign | (exponent << 10) | (fraction >>> 13);
    else if (exponent <= 0 && exponent >= -10) {
      const scaled = (0x800000 | fraction) / 2 ** (14 - exponent);
      if (Number.isInteger(scaled)) candidate = sign | scaled;
    }
    if (candidate !== undefined && Object.is(halfValue(candidate), value)) return Uint8Array.of(0xf9, candidate >>> 8, candidate & 255);
    return Uint8Array.of(0xfa, ...new Uint8Array(data.buffer, 0, 4));
  }
  data.setFloat64(0, value, false);
  return Uint8Array.of(0xfb, ...new Uint8Array(data.buffer));
}
function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}
function join(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
const UINT64_MAX = (1n << 64n) - 1n;
function head(major: number, value: bigint): Uint8Array {
  if (value < 24n) return Uint8Array.of((major << 5) | Number(value));
  const size = value <= 0xffn ? 1 : value <= 0xffffn ? 2 : value <= 0xffffffffn ? 4 : 8;
  const output = new Uint8Array(1 + size);
  output[0] = (major << 5) | ({ 1: 24, 2: 25, 4: 26, 8: 27 }[size]);
  for (let i = size; i > 0; i--) { output[i] = Number(value & 255n); value >>= 8n; }
  return output;
}
export function encodeCanonicalCbor(node: CanonicalNode): Uint8Array {
  const parts: Uint8Array[] = [];
  const active = new Set<CanonicalNode>();
  let total = 0, nodes = 0;
  function reserve(length: number): void {
    if (length > MAX_BYTES - total) fail(1, 'byte_limit');
    total += length;
  }
  function emit(part: Uint8Array): void { reserve(part.length); parts.push(part); }
  function textBytes(value: string): Uint8Array {
    validateText(value);
    const length = Buffer.byteLength(value, 'utf8'), prefix = head(3, BigInt(length));
    reserve(prefix.length + length); // before UTF8 allocation, also for retained map keys
    return join([prefix, textEncoder.encode(value)]);
  }
  function write(value: CanonicalNode, depth = 0): void {
    if (depth > MAX_DEPTH) fail(1, 'depth_limit');
    if (++nodes > MAX_NODES) fail(1, 'node_limit');
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(1, 'invalid_node');
    if (active.has(value)) fail(1, 'cyclic_input');
    active.add(value);
    try {
      switch (value.kind) {
        case 'null': emit(Uint8Array.of(0xf6)); return;
        case 'boolean':
          if (typeof value.value !== 'boolean') fail(1, 'invalid_boolean');
          emit(Uint8Array.of(value.value ? 0xf5 : 0xf4)); return;
        case 'integer': {
          const integer = value.value;
          if (typeof integer !== 'bigint' || integer < -1n - UINT64_MAX || integer > UINT64_MAX) fail(3, 'invalid_integer');
          emit(integer >= 0n ? head(0, integer) : head(1, -1n - integer)); return;
        }
        case 'float': emit(floatBytes(value.value)); return;
        case 'bytes':
          if (!(value.value instanceof Uint8Array)) fail(1, 'invalid_bytes');
          emit(head(2, BigInt(value.value.length))); emit(value.value); return;
        case 'text': parts.push(textBytes(value.value)); return;
        case 'array':
          if (!Array.isArray(value.items)) fail(1, 'invalid_array');
          if (value.items.length > MAX_NODES - nodes) fail(1, 'node_limit');
          emit(head(4, BigInt(value.items.length)));
          for (const item of value.items) write(item, depth + 1);
          return;
        case 'map': {
          if (!Array.isArray(value.entries)) fail(1, 'invalid_map');
          if (value.entries.length > Math.floor((MAX_NODES - nodes) / 2)) fail(1, 'node_limit');
          emit(head(5, BigInt(value.entries.length)));
          const keys = new Set<string>();
          const entries: { key: Uint8Array; value: CanonicalNode }[] = [];
          for (const entry of value.entries) {
            if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') fail(1, 'invalid_map_entry');
            if (depth + 1 > MAX_DEPTH) fail(1, 'depth_limit');
            if (++nodes > MAX_NODES) fail(1, 'node_limit');
            const key = textBytes(entry[0]);
            if (keys.has(entry[0])) fail(2, 'duplicate_map_key');
            keys.add(entry[0]);
            entries.push({ key, value: entry[1] });
          }
          entries.sort((a, b) => compareBytes(a.key, b.key));
          for (const entry of entries) { parts.push(entry.key); write(entry.value, depth + 1); }
          return;
        }
        default: fail(1, 'unsupported_node');
      }
    } finally { active.delete(value); }
  }
  write(node);
  return join(parts);
}

/** Validates canonical bytes first. This does not validate an artifact schema. */
export function digestCanonicalCbor(bytes: Uint8Array): {
  algorithm: 'sha-256'; canonical_profile: 'GKX-CBOR-1'; digest: string;
} {
  if (!(bytes instanceof Uint8Array)) fail(1, 'invalid_binary_boundary');
  if (bytes.length > MAX_BYTES) fail(1, 'byte_limit');
  // Hash the very same snapshot that was validated, even if caller bytes change.
  const snapshot = new Uint8Array(bytes);
  decodeCanonicalCbor(snapshot);
  return { algorithm: 'sha-256', canonical_profile: 'GKX-CBOR-1', digest: createHash('sha256').update(snapshot).digest('hex') };
}

/** Explicit schema gate; ordinary text is not interpreted as a timestamp. */
export function validateCanonicalTimestamp(text: string): void {
  if (typeof text !== 'string' || text.length !== 27) fail(4, 'invalid_timestamp');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/.exec(text);
  if (!match) fail(4, 'invalid_timestamp');
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year === 0 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) fail(4, 'invalid_timestamp');
}

export function decodeCanonicalCbor(bytes: Uint8Array): CanonicalNode {
  if (!(bytes instanceof Uint8Array)) fail(1, 'invalid_binary_boundary');
  if (bytes.length > MAX_BYTES) fail(1, 'byte_limit');
  let offset = 0, nodes = 0;
  function take(length: number): Uint8Array {
    if (offset + length > bytes.length) fail(1, 'truncated');
    const part = bytes.subarray(offset, offset + length);
    offset += length;
    return part;
  }
  function argument(ai: number): bigint {
    if (ai < 24) return BigInt(ai);
    const size = ({ 24: 1, 25: 2, 26: 4, 27: 8 }[ai]);
    if (!size) fail(1, 'indefinite_or_reserved_head');
    let value = 0n;
    for (const byte of take(size)) value = (value << 8n) | BigInt(byte);
    const minimum = ({ 1: 24n, 2: 256n, 4: 65536n, 8: 4294967296n }[size]);
    if (value < minimum) fail(1, 'nonshortest_head');
    return value;
  }
  function read(depth = 0): CanonicalNode {
    if (depth > MAX_DEPTH) fail(1, 'depth_limit');
    if (++nodes > MAX_NODES) fail(1, 'node_limit');
    const initial = take(1)[0], major = initial >> 5, ai = initial & 31;
    if (major === 0 || major === 1) {
      const value = argument(ai);
      return { kind: 'integer', value: major === 0 ? value : -1n - value };
    }
    if (major === 2 || major === 3) {
      const length = argument(ai);
      if (length > BigInt(bytes.length - offset)) fail(1, 'truncated');
      const payload = take(Number(length));
      if (major === 2) return { kind: 'bytes', value: new Uint8Array(payload) };
      let value: string;
      try { value = textDecoder.decode(payload); } catch { fail(5, 'invalid_utf8'); }
      validateText(value);
      return { kind: 'text', value };
    }
    if (major === 4) {
      const length = argument(ai);
      if (length > BigInt(MAX_NODES - nodes)) fail(1, 'node_limit');
      if (length > BigInt(bytes.length - offset)) fail(1, 'truncated');
      const items: CanonicalNode[] = [];
      for (let i = 0; i < Number(length); i++) items.push(read(depth + 1));
      return { kind: 'array', items };
    }
    if (major === 5) {
      const length = argument(ai);
      if (length > BigInt(Math.floor((MAX_NODES - nodes) / 2))) fail(1, 'node_limit');
      if (length > BigInt(Math.floor((bytes.length - offset) / 2))) fail(1, 'truncated');
      const entries: [string, CanonicalNode][] = [];
      let previous: Uint8Array | undefined;
      for (let i = 0; i < Number(length); i++) {
        const start = offset;
        if ((bytes[offset] >> 5) !== 3) fail(1, 'nontext_map_key');
        const key = read(depth + 1);
        if (key.kind !== 'text') fail(1, 'nontext_map_key');
        const encoded = bytes.subarray(start, offset);
        if (previous && compareBytes(previous, encoded) >= 0) fail(2, 'duplicate_or_unordered_map_key');
        previous = encoded;
        entries.push([key.value, read(depth + 1)]);
      }
      return { kind: 'map', entries };
    }
    if (initial === 0xf9 || initial === 0xfa || initial === 0xfb) {
      const size = initial === 0xf9 ? 2 : initial === 0xfa ? 4 : 8;
      const part = take(size), data = new DataView(part.buffer, part.byteOffset, part.byteLength);
      const value = size === 2 ? halfValue(data.getUint16(0, false)) : size === 4 ? data.getFloat32(0, false) : data.getFloat64(0, false);
      if (floatBytes(value).length !== size + 1) fail(3, 'nonshortest_float');
      return { kind: 'float', value };
    }
    if (initial === 0xf6) return { kind: 'null' };
    if (initial === 0xf4 || initial === 0xf5) return { kind: 'boolean', value: initial === 0xf5 };
    fail(1, 'unsupported_bytes');
  }
  const node = read();
  if (offset !== bytes.length) fail(1, 'trailing_bytes');
  return node;
}
