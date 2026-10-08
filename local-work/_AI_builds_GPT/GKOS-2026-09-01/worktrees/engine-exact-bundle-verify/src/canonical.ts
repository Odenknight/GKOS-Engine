import { codeUnitCompare } from "./paths";

/** Recursively freezes a plain Engine value without changing its bytes. */
export function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  const object = value as object;
  if (seen.has(object) || Object.isFrozen(object)) return value;
  seen.add(object);
  for (const child of Object.values(object)) deepFreeze(child, seen);
  Object.freeze(object);
  return value;
}

/** Canonical JSON used for digests and byte-stable Engine artifacts. */
export function canonicalizeValue(value: unknown, seen = new Set<object>()): unknown {
  if (typeof value === "string") return value.replace(/\r\n?/g, "\n");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonicalization rejects non-finite numbers.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Canonicalization rejects cyclic arrays.");
    seen.add(value);
    const result = value.map((entry) => canonicalizeValue(entry, seen));
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (seen.has(value as object)) throw new TypeError("Canonicalization rejects cyclic objects.");
    seen.add(value as object);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort(codeUnitCompare)) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) result[key] = canonicalizeValue(entry, seen);
    }
    seen.delete(value as object);
    return result;
  }
  throw new TypeError(`Canonicalization rejects ${typeof value} values.`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

export async function sha256Bytes(value: string | Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto SHA-256 is unavailable in this runtime.");
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await subtle.digest("SHA-256", buffer);
  const hex = [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

export async function canonicalSha256(value: unknown): Promise<string> {
  return sha256Bytes(canonicalJson(value));
}
