export interface LexicalSignalFields {
  title?: string;
  heading_path?: string;
  tags?: string;
  topic?: string;
  category?: string;
  text: string;
  token_count: number;
}

export const RETRIEVAL_LEXICAL_FIELD_WEIGHTS = Object.freeze({
  title: 3,
  heading_path: 2,
  tags: 1.5,
  topic: 2,
  category: 2,
  text: 1,
} as const);

export function normalizeLexical(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export interface LexicalCitationSpan {
  start_byte: number;
  end_byte: number;
  text: string;
}

interface NormalizedOriginalMap {
  normalized: string;
  start_bytes: number[];
  end_bytes: number[];
}

const UTF8 = new TextEncoder();
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

/**
 * Normalize one base code point together with its following combining marks.
 * Every normalized UTF-16 code unit maps back to the complete original cluster,
 * so a match for `cafe` cites both precomposed `Café` and decomposed `Café`
 * without dropping the accent bytes or inventing normalized quotation text.
 */
function normalizedOriginalMap(value: string): NormalizedOriginalMap {
  let normalized = "";
  const startBytes: number[] = [];
  const endBytes: number[] = [];
  let codeUnitOffset = 0;
  let byteOffset = 0;
  while (codeUnitOffset < value.length) {
    let clusterEnd = codeUnitOffset;
    const first = String.fromCodePoint(value.codePointAt(clusterEnd)!);
    clusterEnd += first.length;
    while (clusterEnd < value.length) {
      const next = String.fromCodePoint(value.codePointAt(clusterEnd)!);
      if (!/^\p{M}$/u.test(next)) break;
      clusterEnd += next.length;
    }
    const cluster = value.slice(codeUnitOffset, clusterEnd);
    const normalizedCluster = normalizeLexical(cluster);
    const clusterStartByte = byteOffset;
    const clusterEndByte = clusterStartByte + UTF8.encode(cluster).length;
    normalized += normalizedCluster;
    for (let index = 0; index < normalizedCluster.length; index++) {
      startBytes.push(clusterStartByte);
      endBytes.push(clusterEndByte);
    }
    codeUnitOffset = clusterEnd;
    byteOffset = clusterEndByte;
  }
  return { normalized, start_bytes: startBytes, end_bytes: endBytes };
}

/** Exact original UTF-8 slices for normalized lexical query terms/phrases. */
export function lexicalCitationSpans(value: string, query: string): LexicalCitationSpan[] {
  const terms = [...query.matchAll(/"([^"]+)"|([\p{L}\p{N}_-]+)/gu)]
    .map((match) => normalizeLexical(match[1] ?? match[2]))
    .filter(Boolean);
  const mapped = normalizedOriginalMap(value);
  const encodedValue = UTF8.encode(value);
  const candidates: LexicalCitationSpan[] = [];
  let returnedBytes = 0;
  for (const needle of terms) {
    let offset = 0;
    while ((offset = mapped.normalized.indexOf(needle, offset)) >= 0) {
      if (candidates.length >= 16) break;
      const startByte = mapped.start_bytes[offset];
      const endByte = mapped.end_bytes[offset + needle.length - 1];
      if (startByte === undefined || endByte === undefined) break;
      const exactBytes = endByte - startByte;
      if (exactBytes <= 256 && returnedBytes + exactBytes <= 1024) {
        candidates.push({
          start_byte: startByte,
          end_byte: endByte,
          text: UTF8_DECODER.decode(encodedValue.subarray(startByte, endByte)),
        });
        returnedBytes += exactBytes;
      }
      offset += Math.max(1, needle.length);
    }
  }
  const seen = new Set<string>();
  return candidates.sort((a, b) => a.start_byte - b.start_byte || a.end_byte - b.end_byte).filter((item) => {
    const key = `${item.start_byte}:${item.end_byte}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

/** Terms and normalization intentionally mirror SQLite FTS5 unicode61 remove_diacritics=2. */
export function lexicalQueryTerms(query: string): string[] {
  return [...normalizeLexical(query).matchAll(/[\p{L}\p{N}_-]+/gu)].map((match) => match[0]);
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const normalized = normalizeLexical(haystack);
  let count = 0;
  let offset = 0;
  while ((offset = normalized.indexOf(needle, offset)) >= 0) {
    count++;
    offset += Math.max(1, needle.length);
  }
  return count;
}

/** Deterministic lexical stage signal; it is a ranking score, never a probability. */
export function lexicalSignal(fields: Readonly<LexicalSignalFields>, query: string): number {
  if (!Number.isSafeInteger(fields.token_count) || fields.token_count < 0) throw new RangeError("token_count must be a non-negative safe integer.");
  const terms = lexicalQueryTerms(query);
  const weighted = terms.reduce((sum, term) => sum
    + RETRIEVAL_LEXICAL_FIELD_WEIGHTS.title * occurrences(fields.title ?? "", term)
    + RETRIEVAL_LEXICAL_FIELD_WEIGHTS.heading_path * occurrences(fields.heading_path ?? "", term)
    + RETRIEVAL_LEXICAL_FIELD_WEIGHTS.tags * occurrences(fields.tags ?? "", term)
    + RETRIEVAL_LEXICAL_FIELD_WEIGHTS.topic * occurrences(fields.topic ?? "", term)
    + RETRIEVAL_LEXICAL_FIELD_WEIGHTS.category * occurrences(fields.category ?? "", term)
    + RETRIEVAL_LEXICAL_FIELD_WEIGHTS.text * occurrences(fields.text, term), 0);
  return weighted / Math.sqrt(Math.max(1, fields.token_count + 1));
}
