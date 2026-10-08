export interface LexicalSignalFields {
  title?: string;
  heading_path?: string;
  tags?: string;
  topic?: string;
  category?: string;
  text: string;
  token_count: number;
}

const LEXICAL_FIELD_NAMES = ["title", "heading_path", "tags", "topic", "category", "text"] as const;

export const RETRIEVAL_LEXICAL_FIELD_WEIGHTS = Object.freeze({
  title: 3,
  heading_path: 2,
  tags: 1.5,
  topic: 2,
  category: 2,
  text: 1,
} as const);

export function normalizeLexical(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ς/gu, "σ");
}

export interface LexicalCitationSpan {
  start_byte: number;
  end_byte: number;
  text: string;
}

export interface LexicalQueryClause {
  value: string;
  tokens: string[];
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
  const groups = [...query.matchAll(/"([^"]+)"|([^"\s]+)/gu)].flatMap((match) => {
    if (match[1] !== undefined) {
      const phrase = normalizeLexical(match[1]);
      return phrase ? [{ primary: phrase, fallback: lexicalQueryTerms(match[1]) }] : [];
    }
    return lexicalQueryTerms(match[2] ?? "").map((term) => ({ primary: term, fallback: [] }));
  });
  const mapped = normalizedOriginalMap(value);
  const encodedValue = UTF8.encode(value);
  const candidates: LexicalCitationSpan[] = [];
  let returnedBytes = 0;
  const addNeedle = (needle: string): number => {
    let added = 0;
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
        added++;
      }
      offset += Math.max(1, needle.length);
    }
    return added;
  };
  for (const group of groups) {
    if (addNeedle(group.primary) === 0) {
      for (const fallback of group.fallback) addNeedle(fallback);
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

/** Versioned scoring terms; exact exhaustive unicode61 parity is not claimed. */
export function lexicalQueryTerms(query: string): string[] {
  return [...normalizeLexical(query).matchAll(/[\p{L}\p{N}\p{Co}]+/gu)].map((match) => match[0]);
}

/** Strict shared query-clause grammar for FTS5 and compatibility scan. */
export function lexicalQueryClauses(query: string): LexicalQueryClause[] {
  if (/[\u0000-\u001f\u007f]/u.test(query)) throw new TypeError("RETRIEVAL_QUERY_LEXICAL_INVALID:control");
  const clauses: LexicalQueryClause[] = [];
  let offset = 0;
  while (offset < query.length) {
    while (offset < query.length && /\s/u.test(query[offset])) offset++;
    if (offset >= query.length) break;
    let value: string;
    if (query[offset] === '"') {
      const close = query.indexOf('"', offset + 1);
      if (close < 0) throw new TypeError("RETRIEVAL_QUERY_LEXICAL_INVALID:unmatched_quote");
      value = query.slice(offset + 1, close);
      offset = close + 1;
      if (offset < query.length && !/\s/u.test(query[offset])) throw new TypeError("RETRIEVAL_QUERY_LEXICAL_INVALID:quote_boundary");
    } else {
      const start = offset;
      while (offset < query.length && !/\s/u.test(query[offset])) offset++;
      value = query.slice(start, offset);
      if (value.includes('"')) throw new TypeError("RETRIEVAL_QUERY_LEXICAL_INVALID:quote_boundary");
    }
    const tokens = unicode61SubsetTokens(value);
    if (!value || !tokens.length) throw new TypeError("RETRIEVAL_QUERY_LEXICAL_INVALID:empty_clause");
    clauses.push({ value, tokens });
  }
  if (!clauses.length) throw new TypeError("RETRIEVAL_QUERY_LEXICAL_INVALID:empty_query");
  return clauses;
}

/**
 * Candidate matching used only by the SQLite compatibility scan when the
 * runtime has no FTS5 module. Each whitespace-delimited/quoted query clause is
 * tokenized with the versioned GKOS Phase 1 compatibility subset; every clause must
 * occur as one consecutive token sequence in one indexed field. Different
 * clauses may match different fields, preserving the frozen unqualified-AND
 * structure exercised by the differential FTS5 corpus.
 */
export function lexicalScanMatches(fields: Readonly<LexicalSignalFields>, query: string): boolean {
  const clauses = lexicalQueryClauses(query).map((clause) => clause.tokens);
  const indexedFields = LEXICAL_FIELD_NAMES.map((field) => unicode61SubsetTokens(String(fields[field] ?? "")));
  return clauses.every((clause) => indexedFields.some((tokens) => containsTokenSequence(tokens, clause)));
}

function unicode61SubsetTokens(value: string): string[] {
  // This deliberately degraded compatibility subset follows the host
  // runtime's Unicode property tables; it does not claim a vendored Unicode
  // 6.1 implementation. The frozen differential corpus covers the supported
  // parity surface: letters, numbers, private-use scalars, punctuation
  // separators, and the pinned normalization fixtures.
  return [...normalizeScanCandidate(value).matchAll(/[\p{L}\p{N}\p{Co}]+/gu)].map((match) => match[0]);
}

function normalizeScanCandidate(value: string): string {
  let normalized = "";
  let offset = 0;
  while (offset < value.length) {
    const first = String.fromCodePoint(value.codePointAt(offset)!);
    let end = offset + first.length;
    while (end < value.length) {
      const next = String.fromCodePoint(value.codePointAt(end)!);
      if (!/^\p{M}$/u.test(next)) break;
      end += next.length;
    }
    const cluster = value.slice(offset, end);
    const decomposed = cluster.normalize("NFD");
    const base = String.fromCodePoint(decomposed.codePointAt(0)!);
    const folded = /^\p{Script=Latin}$/u.test(base)
      ? decomposed.replace(/\p{M}/gu, "").toLowerCase()
      : cluster.toLowerCase();
    // unicode61 folds Greek final sigma into the ordinary sigma class.
    normalized += folded.replace(/ς/gu, "σ");
    offset = end;
  }
  return normalized;
}

function containsTokenSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (!needle.length || needle.length > haystack.length) return false;
  outer: for (let start = 0; start <= haystack.length - needle.length; start++) {
    for (let offset = 0; offset < needle.length; offset++) {
      if (haystack[start + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
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
