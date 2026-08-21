import { createHash } from "node:crypto";

export function retrievalSha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function retrievalCodeUnitCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertWellFormedUtf16(value: string): void {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError("Retrieval canonical JSON rejects unpaired UTF-16 surrogates.");
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("Retrieval canonical JSON rejects unpaired UTF-16 surrogates.");
    }
  }
}

function stableJsonValue(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    assertWellFormedUtf16(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Retrieval canonical JSON rejects non-finite numbers.");
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new TypeError("Retrieval canonical JSON rejects unsafe integer-valued numbers.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("Retrieval canonical JSON rejects cycles.");
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key))) ||
        Object.keys(value).length !== value.length) throw new TypeError("Retrieval canonical JSON rejects sparse or extended arrays.");
    ancestors.add(value);
    try {
      const items: string[] = [];
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError("Retrieval canonical JSON rejects accessor or non-enumerable array items.");
        items.push(stableJsonValue(descriptor.value, ancestors));
      }
      return `[${items.join(",")}]`;
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Retrieval canonical JSON rejects exotic objects.");
    if (ancestors.has(value)) throw new TypeError("Retrieval canonical JSON rejects cycles.");
    const record = value as Record<string, unknown>;
    const keys = Reflect.ownKeys(record);
    if (keys.some((key) => typeof key !== "string")) throw new TypeError("Retrieval canonical JSON rejects symbol keys.");
    const entries = (keys as string[]).sort(retrievalCodeUnitCompare);
    ancestors.add(value);
    try {
      return `{${entries.map((key) => {
        assertWellFormedUtf16(key);
        const descriptor = Object.getOwnPropertyDescriptor(record, key);
        if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError("Retrieval canonical JSON rejects accessor or non-enumerable object properties.");
        return `${JSON.stringify(key)}:${stableJsonValue(descriptor.value, ancestors)}`;
      }).join(",")}}`;
    } finally {
      ancestors.delete(value);
    }
  }
  throw new TypeError(`Retrieval canonical JSON rejects ${typeof value}.`);
}

export function stableJson(value: unknown): string {
  return stableJsonValue(value, new Set<object>());
}

export function retrievalCanonicalDigest(value: unknown): string {
  return retrievalSha256(stableJson(value));
}

export function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
  return value;
}
