import { sha256Bytes } from "../canonical";
import type { Digest, MocGeneratedRegion, MocMarkerFailureCode } from "./types";

const START_PREFIX = "<!-- gkos:moc generated:start";
const END_MARKER = "<!-- gkos:moc generated:end -->";
const START_RE = /^<!-- gkos:moc generated:start version=1 config=(sha256:[0-9a-f]{64}) -->$/;
const LEGACY_START = "<!-- gkos-navigation:managed:start -->";
const LEGACY_END = "<!-- gkos-navigation:managed:end -->";

export interface ParsedGeneratedRegion {
  ok: true;
  region: MocGeneratedRegion;
  prefix: string;
  body: string;
  suffix: string;
  startMarker: string;
  endMarker: typeof END_MARKER;
}

export interface GeneratedRegionFailure {
  ok: false;
  reasonCodes: MocMarkerFailureCode[];
}

function occurrences(value: string, token: string): number[] {
  const indexes: number[] = [];
  for (let offset = 0; ; offset += token.length) {
    const index = value.indexOf(token, offset);
    if (index < 0) return indexes;
    indexes.push(index);
    offset = index;
  }
}

export async function parseGeneratedMocRegion(bytes: string): Promise<ParsedGeneratedRegion | GeneratedRegionFailure> {
  const startIndexes = occurrences(bytes, START_PREFIX);
  const endIndexes = occurrences(bytes, END_MARKER);
  if (startIndexes.length === 0 || endIndexes.length === 0) return { ok: false, reasonCodes: ["MARKER_MISSING"] };
  if (startIndexes.length > 1 || endIndexes.length > 1) {
    const nested = startIndexes.length > 1 && startIndexes[1] < endIndexes[0];
    return { ok: false, reasonCodes: [nested ? "MARKER_NESTED" : "MARKER_DUPLICATED"] };
  }
  const startOffset = startIndexes[0];
  const startLineEnd = bytes.indexOf("\n", startOffset);
  if (startLineEnd < 0 || endIndexes[0] <= startOffset) return { ok: false, reasonCodes: ["MARKER_MALFORMED"] };
  const startMarker = bytes.slice(startOffset, startLineEnd).replace(/\r$/, "");
  const match = START_RE.exec(startMarker);
  if (!match) return { ok: false, reasonCodes: ["MARKER_MALFORMED"] };
  const bodyStart = startLineEnd + 1;
  let bodyEnd = endIndexes[0];
  if (bodyEnd > bodyStart && bytes[bodyEnd - 1] === "\n") bodyEnd -= 1;
  if (bodyEnd > bodyStart && bytes[bodyEnd - 1] === "\r") bodyEnd -= 1;
  const body = bytes.slice(bodyStart, bodyEnd);
  const endOffset = endIndexes[0] + END_MARKER.length;
  return {
    ok: true,
    region: {
      markerVersion: "1",
      configDigest: match[1] as Digest,
      startOffset,
      endOffset,
      bodyDigest: await sha256Bytes(body),
    },
    prefix: bytes.slice(0, startOffset),
    body,
    suffix: bytes.slice(endOffset),
    startMarker,
    endMarker: END_MARKER,
  };
}

export function extractNavigationCandidateBody(candidateBytes: string): string {
  const starts = occurrences(candidateBytes, LEGACY_START);
  const ends = occurrences(candidateBytes, LEGACY_END);
  if (starts.length !== 1 || ends.length !== 1 || ends[0] <= starts[0]) throw new Error("Candidate managed region is missing or ambiguous.");
  let start = starts[0] + LEGACY_START.length;
  let end = ends[0];
  if (candidateBytes[start] === "\r" && candidateBytes[start + 1] === "\n") start += 2;
  else if (candidateBytes[start] === "\n") start += 1;
  if (end > start && candidateBytes[end - 1] === "\n") end -= 1;
  if (end > start && candidateBytes[end - 1] === "\r") end -= 1;
  return candidateBytes.slice(start, end).replace(/\r\n?/g, "\n");
}

export function renderGeneratedMocRegion(body: string, configDigest: Digest): string {
  const canonicalBody = body.replace(/\r\n?/g, "\n");
  return `<!-- gkos:moc generated:start version=1 config=${configDigest} -->\n${canonicalBody}\n${END_MARKER}`;
}

export async function mergeGeneratedMocRegion(input: {
  currentBytes: string;
  generatedBody: string;
  currentBinding: MocGeneratedRegion;
  nextConfigDigest: Digest;
}): Promise<{ ok: true; bytes: string; prefix: string; suffix: string } | GeneratedRegionFailure> {
  const parsed = await parseGeneratedMocRegion(input.currentBytes);
  if (parsed.ok === false) return parsed;
  if (parsed.region.configDigest !== input.currentBinding.configDigest) return { ok: false, reasonCodes: ["MARKER_CONFIG_MISMATCH"] };
  if (parsed.region.bodyDigest !== input.currentBinding.bodyDigest) return { ok: false, reasonCodes: ["GENERATED_REGION_CHANGED"] };
  if (parsed.region.startOffset !== input.currentBinding.startOffset || parsed.region.endOffset !== input.currentBinding.endOffset) return { ok: false, reasonCodes: ["MARKER_MOVED"] };
  return {
    ok: true,
    bytes: parsed.prefix + renderGeneratedMocRegion(input.generatedBody, input.nextConfigDigest) + parsed.suffix,
    prefix: parsed.prefix,
    suffix: parsed.suffix,
  };
}
