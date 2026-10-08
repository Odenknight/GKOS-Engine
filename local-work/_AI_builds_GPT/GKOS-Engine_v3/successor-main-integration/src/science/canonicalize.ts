import { codeUnitCompare } from "../paths";

/** Canonical JSON value: sorted keys, normalized line endings, no undefined values. */
export function canonicalizeScientificValue(value: unknown, seen = new Set<object>()): unknown {
  if (typeof value === "string") return value.replace(/\r\n?/g, "\n");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Scientific canonicalization rejects non-finite numbers.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Scientific canonicalization rejects cyclic objects.");
    seen.add(value);
    const result = value.map((entry) => canonicalizeScientificValue(entry, seen));
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (seen.has(value)) throw new TypeError("Scientific canonicalization rejects cyclic objects.");
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort(codeUnitCompare)) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) result[key] = canonicalizeScientificValue(entry, seen);
    }
    seen.delete(value);
    return result;
  }
  throw new TypeError(`Scientific canonicalization rejects ${typeof value} values.`);
}

export function canonicalizeScientificRecord(value: unknown): string {
  return JSON.stringify(canonicalizeScientificValue(value));
}

export async function scientificSha256(value: unknown): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error("Web Crypto SHA-256 is unavailable in this runtime.");
  const bytes = new TextEncoder().encode(typeof value === "string" ? value.replace(/\r\n?/g, "\n") : canonicalizeScientificRecord(value));
  const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}
