import { extensionFromPath, normalizeVaultRelative } from "./paths";
import type { NoteRecord } from "./graph";
import type { GkxData, ParsedLink, SourceFile } from "./types";
import { canonicalSourceDeclarations, type CanonicalSourceDeclaration } from "./canonical-declarations";
import { sha256HexSync } from "./sha256-sync";

/**
 * Package-private identity for one canonical parser input. It is deliberately
 * not a node/source identity and is never exported from a graph or retrieval
 * result. Equal source envelopes retain multiplicity through the final slot.
 */
const RECORD_KEYS = new WeakMap<NoteRecord, string>();
const RECORD_MATERIAL = new WeakMap<NoteRecord, CanonicalCandidateMaterial>();
const RECORD_SNAPSHOTS = new WeakMap<NoteRecord, CanonicalCandidateSourceSnapshot>();

interface CanonicalCandidateMaterial {
  relative_path: string;
  extension: string | null;
  size: number;
  modified_time: number | null;
  created_time: number | null;
  kind: "note" | "attachment" | null;
  content_fingerprint: string;
}

export interface CanonicalCandidateSourceSnapshot {
  relative_path: string;
  extension: string | null;
  size: number;
  modified_time: number | null;
  created_time: number | null;
  parser_content_fingerprint: string;
  source_digest: string;
  tags: readonly string[];
  aliases: readonly string[];
  links: readonly ParsedLink[];
  declarations: readonly CanonicalSourceDeclaration[];
  gkx: GkxData | null;
}

interface CandidateSeed {
  source: SourceFile;
  material: CanonicalCandidateMaterial;
  descriptor: string;
  exact_content: string;
  input_index: number;
}

function materialForSource(source: SourceFile): CanonicalCandidateMaterial {
  const content = source.content ?? "";
  const extension = source.extension?.toLowerCase() ?? extensionFromPath(source.relativePath);
  const size = source.size ?? content.length;
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) throw new TypeError("GKX_CANONICAL_SOURCE_SIZE_INVALID");
  for (const time of [source.modifiedTime, source.createdTime]) {
    if (time !== undefined && (typeof time !== "number" || !Number.isFinite(time))) {
      throw new TypeError("GKX_CANONICAL_SOURCE_TIME_INVALID");
    }
  }
  return {
    relative_path: normalizeVaultRelative(source.relativePath),
    extension: extension || null,
    size,
    modified_time: source.modifiedTime ?? null,
    created_time: source.createdTime ?? null,
    kind: source.kind ?? "note",
    content_fingerprint: sha256HexSync(content),
  };
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  return Object.freeze(value);
}

function inertClone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function rebaseGkxProjectionSourcePath(gkx: GkxData | null, relativePath: string): GkxData | null {
  const clone = inertClone(gkx);
  const projection = clone?.projection;
  if (!projection) return clone;
  projection.sourcePath = relativePath;
  projection.diagnostics = projection.diagnostics.map((diagnostic) => ({
    ...diagnostic,
    ...(diagnostic.sourcePath === undefined ? {} : { sourcePath: relativePath }),
  }));
  projection.assessment = {
    ...projection.assessment,
    diagnostics: projection.assessment.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      ...(diagnostic.sourcePath === undefined ? {} : { sourcePath: relativePath }),
    })),
  };
  return clone;
}

function snapshotOf(record: NoteRecord, material: CanonicalCandidateMaterial): CanonicalCandidateSourceSnapshot {
  return deepFreeze({
    relative_path: record.relativePath,
    extension: record.ext ?? null,
    size: record.size,
    modified_time: record.mtimeMs ?? null,
    created_time: record.btimeMs ?? null,
    parser_content_fingerprint: record.hash,
    source_digest: `sha256:${material.content_fingerprint}`,
    tags: inertClone(record.parsed.tags),
    aliases: inertClone(record.parsed.aliases),
    links: inertClone(record.parsed.links),
    declarations: inertClone(canonicalSourceDeclarations(record)),
    gkx: inertClone(record.gkx),
  });
}

function descriptorOf(material: CanonicalCandidateMaterial): string {
  return JSON.stringify([
    material.relative_path,
    material.extension,
    material.size,
    material.modified_time,
    material.created_time,
    material.kind,
    material.content_fingerprint,
  ]);
}

export function canonicalCandidateSourceDescriptor(source: SourceFile): string {
  return descriptorOf(materialForSource(source));
}

export function canonicalCandidateRecordDescriptor(record: NoteRecord): string {
  const material = RECORD_MATERIAL.get(record);
  if (!material) throw new Error("GKX_CANONICAL_RECORD_MATERIAL_MISSING");
  return descriptorOf(material);
}

export function canonicalCandidateSourceParserSignature(source: SourceFile): string {
  const material = materialForSource(source);
  return `${material.extension ?? ""}\u0001${material.content_fingerprint}`;
}

export function canonicalCandidateRecordParserSignature(record: NoteRecord): string {
  const material = RECORD_MATERIAL.get(record);
  if (!material) throw new Error("GKX_CANONICAL_RECORD_MATERIAL_MISSING");
  return `${material.extension ?? ""}\u0001${material.content_fingerprint}`;
}

function baseKey(descriptor: string): string {
  return `gkx-record:${sha256HexSync(descriptor)}`;
}

/**
 * Produce input-order-independent SHA-256-bound opaque keys before parsing.
 * A cryptographic key/content collision fails closed instead of merging
 * candidates; the legacy parser fingerprint is deliberately not authority
 * here and is evaluated only inside an authorized retrieval view.
 */
export function canonicalCandidateKeys(sources: readonly SourceFile[]): string[] {
  const seeds: CandidateSeed[] = sources.map((source, input_index) => {
    const material = materialForSource(source);
    return {
      source,
      material,
      descriptor: descriptorOf(material),
      exact_content: source.content ?? "",
      input_index,
    };
  });
  const descriptorByBase = new Map<string, string>();
  const exactContentByFingerprint = new Map<string, string>();
  for (const seed of seeds) {
    const base = baseKey(seed.descriptor);
    const priorDescriptor = descriptorByBase.get(base);
    if (priorDescriptor !== undefined && priorDescriptor !== seed.descriptor) {
      throw new Error("GKX_CANONICAL_RECORD_KEY_COLLISION");
    }
    descriptorByBase.set(base, seed.descriptor);
    const priorContent = exactContentByFingerprint.get(seed.material.content_fingerprint);
    if (priorContent !== undefined && priorContent !== seed.exact_content) {
      throw new Error("GKX_CANONICAL_SOURCE_CONTENT_HASH_COLLISION");
    }
    exactContentByFingerprint.set(seed.material.content_fingerprint, seed.exact_content);
  }
  const sorted = [...seeds].sort((left, right) =>
    left.descriptor < right.descriptor ? -1 : left.descriptor > right.descriptor ? 1 : 0);
  const occurrence = new Map<string, number>();
  const output = new Array<string>(sources.length);
  for (const seed of sorted) {
    const slot = occurrence.get(seed.descriptor) ?? 0;
    occurrence.set(seed.descriptor, slot + 1);
    output[seed.input_index] = `${baseKey(seed.descriptor)}:${slot}`;
  }
  return output;
}

export function bindCanonicalCandidateRecord(
  record: NoteRecord,
  key: string,
  source: SourceFile,
): void {
  if (!/^gkx-record:[0-9a-f]{64}:[0-9]+$/u.test(key)) {
    throw new Error("GKX_CANONICAL_RECORD_KEY_INVALID");
  }
  const material = Object.freeze(materialForSource(source));
  RECORD_KEYS.set(record, key);
  RECORD_MATERIAL.set(record, material);
  RECORD_SNAPSHOTS.set(record, snapshotOf(record, material));
}

export function canonicalCandidateRecordKey(record: NoteRecord): string {
  const key = RECORD_KEYS.get(record);
  if (!key) throw new Error("GKX_CANONICAL_RECORD_KEY_MISSING");
  return key;
}

export function cloneCanonicalCandidateRecord(record: NoteRecord): NoteRecord {
  const key = canonicalCandidateRecordKey(record);
  const material = RECORD_MATERIAL.get(record);
  const snapshot = RECORD_SNAPSHOTS.get(record);
  if (!material || !snapshot) throw new Error("GKX_CANONICAL_RECORD_BINDING_MISSING");
  const clone = { ...record };
  RECORD_KEYS.set(clone, key);
  RECORD_MATERIAL.set(clone, material);
  RECORD_SNAPSHOTS.set(clone, snapshot);
  return clone;
}

/** Validate compact-key collisions and multiplicity slots over a full snapshot. */
export function validateCanonicalCandidateRecordKeys(records: readonly NoteRecord[]): void {
  const descriptorByBase = new Map<string, string>();
  const recordsByDescriptor = new Map<string, NoteRecord[]>();
  for (const record of records) {
    const descriptor = canonicalCandidateRecordDescriptor(record);
    const base = baseKey(descriptor);
    const prior = descriptorByBase.get(base);
    if (prior !== undefined && prior !== descriptor) throw new Error("GKX_CANONICAL_RECORD_KEY_COLLISION");
    descriptorByBase.set(base, descriptor);
    const group = recordsByDescriptor.get(descriptor) ?? [];
    group.push(record);
    recordsByDescriptor.set(descriptor, group);
  }
  for (const [descriptor, group] of recordsByDescriptor) {
    const actual = group.map(canonicalCandidateRecordKey).sort();
    const expected = group.map((_, slot) => `${baseKey(descriptor)}:${slot}`).sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      throw new Error("GKX_CANONICAL_RECORD_KEY_MULTIPLICITY_INVALID");
    }
  }
}

export function canonicalCandidateSourceSnapshot(record: NoteRecord): CanonicalCandidateSourceSnapshot {
  const snapshot = RECORD_SNAPSHOTS.get(record);
  if (!snapshot) throw new Error("GKX_CANONICAL_SOURCE_SNAPSHOT_MISSING");
  return snapshot;
}

/** Re-key cached records after a canonical path rename without retaining bytes. */
export function rebindRenamedCanonicalCandidateRecords(
  records: readonly NoteRecord[],
  relativePath: string,
): void {
  const seeds = records.map((record) => {
    const prior = RECORD_MATERIAL.get(record);
    if (!prior) throw new Error("GKX_CANONICAL_RECORD_MATERIAL_MISSING");
    const material = { ...prior, relative_path: normalizeVaultRelative(relativePath) };
    return { record, material, descriptor: descriptorOf(material) };
  });
  const descriptorByBase = new Map<string, string>();
  for (const seed of seeds) {
    const base = baseKey(seed.descriptor);
    const prior = descriptorByBase.get(base);
    if (prior !== undefined && prior !== seed.descriptor) throw new Error("GKX_CANONICAL_RECORD_KEY_COLLISION");
    descriptorByBase.set(base, seed.descriptor);
  }
  const sorted = [...seeds].sort((left, right) =>
    left.descriptor < right.descriptor ? -1 : left.descriptor > right.descriptor ? 1 : 0);
  const occurrence = new Map<string, number>();
  for (const seed of sorted) {
    const slot = occurrence.get(seed.descriptor) ?? 0;
    occurrence.set(seed.descriptor, slot + 1);
    RECORD_KEYS.set(seed.record, `${baseKey(seed.descriptor)}:${slot}`);
    RECORD_MATERIAL.set(seed.record, Object.freeze(seed.material));
    const snapshot = RECORD_SNAPSHOTS.get(seed.record);
    if (!snapshot) throw new Error("GKX_CANONICAL_SOURCE_SNAPSHOT_MISSING");
    const rebasedGkx = rebaseGkxProjectionSourcePath(seed.record.gkx, seed.material.relative_path);
    seed.record.gkx = rebasedGkx;
    RECORD_SNAPSHOTS.set(seed.record, deepFreeze({
      ...snapshot,
      relative_path: seed.material.relative_path,
      gkx: inertClone(rebasedGkx),
    }));
  }
}
