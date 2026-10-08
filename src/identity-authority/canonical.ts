import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PHASE6_CONTRACT_VERSION, type AuthorityClock, type AuthorityRandom } from "./types";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TIMESTAMP = /^(?:19[7-9][0-9]|2[0-9]{3})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u, CONTROL = /[\u0000-\u001f\u007f-\u009f]/u, BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
export const systemClock: AuthorityClock = { now: () => new Date(), monotonicMs: () => Number(process.hrtime.bigint()) / 1e6 };
export const systemRandom: AuthorityRandom = { bytes: (length) => randomBytes(length) };

export function canonicalJson(value: unknown): string {
  const visit = (current: unknown): string => {
    if (current === null) return "null";
    if (typeof current === "boolean") return current ? "true" : "false";
    if (typeof current === "string") return JSON.stringify(normalizeHumanString(current, Number.MAX_SAFE_INTEGER, true));
    if (typeof current === "number") { if (!Number.isSafeInteger(current) || Object.is(current, -0)) throw new TypeError("noncanonical number"); return String(current); }
    if (Array.isArray(current)) return `[${current.map(visit).join(",")}]`;
    if (typeof current === "object") { const object = current as Record<string, unknown>, keys = Object.keys(object).sort(codeUnitCompare); if (keys.some((key) => object[key] === undefined)) throw new TypeError("undefined is not canonical JSON"); return `{${keys.map((key) => `${JSON.stringify(key)}:${visit(object[key])}`).join(",")}}`; }
    throw new TypeError("unsupported canonical JSON value");
  }; return visit(value);
}
export function canonicalBytes(value: unknown): Buffer { return Buffer.from(canonicalJson(value), "utf8"); }
export function sha256Bytes(value: Uint8Array | string): Buffer { return createHash("sha256").update(value).digest(); }
export function sha256(value: Uint8Array | string): string { return `sha256:${sha256Bytes(value).toString("hex")}`; }
export function recordDigest(record: Record<string, unknown>, field = "record_digest"): string { const copy = { ...record }; delete copy[field]; return sha256(canonicalBytes(copy)); }
export function resultDigest(result: Record<string, unknown>): string { const copy = { ...result }; delete copy.result_digest; return sha256(canonicalBytes(copy)); }
export function constantTimeDigestEqual(left: string, right: string): boolean { if (!DIGEST.test(left) || !DIGEST.test(right)) return false; return timingSafeEqual(Buffer.from(left.slice(7), "hex"), Buffer.from(right.slice(7), "hex")); }
export function codeUnitCompare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
export function normalizeHumanString(value: string, maximumBytes: number, allowWhitespace = false): string { if (typeof value !== "string" || value !== value.normalize("NFC") || CONTROL.test(value)) throw new TypeError("invalid string"); if (!allowWhitespace && value.trim() !== value) throw new TypeError("invalid string boundary"); if (Buffer.byteLength(value, "utf8") > maximumBytes) throw new TypeError("string too large"); return value; }
export function assertUuidV7(value: string): string { if (!UUID_V7.test(value)) throw new TypeError("invalid UUIDv7"); return value; }
export function assertDigest(value: string): string { if (!DIGEST.test(value)) throw new TypeError("invalid digest"); return value; }
export function timestamp(date: Date): string { const value = date.toISOString(); if (!TIMESTAMP.test(value) || Number.isNaN(date.getTime())) throw new TypeError("invalid timestamp"); return value; }
export function assertTimestamp(value: string): string { if (!TIMESTAMP.test(value)) throw new TypeError("invalid timestamp"); const parsed = new Date(value); if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) throw new TypeError("impossible timestamp"); return value; }
export function uuidV7(clock: AuthorityClock, random: AuthorityRandom): string {
  const ms = clock.now().getTime(); if (!Number.isSafeInteger(ms) || ms < 0 || ms > 253402300799999) throw new TypeError("invalid service clock");
  const bytes = Buffer.from(random.bytes(16)); if (bytes.length !== 16) throw new TypeError("random source length mismatch");
  let time = BigInt(ms); for (let index = 5; index >= 0; index--) { bytes[index] = Number(time & 0xffn); time >>= 8n; } bytes[6] = (bytes[6] & 0x0f) | 0x70; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex"); return assertUuidV7(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`);
}
export function base32LowerFirst130Bits(bytes: Uint8Array): string { if (bytes.length < 17) throw new TypeError("insufficient digest bytes"); let bits = 0n; for (const byte of bytes.subarray(0, 17)) bits = (bits << 8n) | BigInt(byte); bits >>= 6n; let output = ""; for (let index = 25; index >= 0; index--) output += BASE32[Number((bits >> BigInt(index * 5)) & 31n)]; return output; }
export function domainDigest(domain: string, ...values: (string | Uint8Array)[]): string { const hash = createHash("sha256").update(Buffer.from(domain, "utf8")); for (const value of values) hash.update(Buffer.from([0])).update(value); return `sha256:${hash.digest("hex")}`; }
export function bindResult<T extends Record<string, unknown>>(result: T): T & { contract_version: typeof PHASE6_CONTRACT_VERSION; result_digest: string } { const value = { contract_version: PHASE6_CONTRACT_VERSION, ...result, result_digest: "" } as T & { contract_version: typeof PHASE6_CONTRACT_VERSION; result_digest: string }; value.result_digest = resultDigest(value); return value; }
