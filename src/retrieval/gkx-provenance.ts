import { isValidGkxAuthoredUid, type Gkx23ProjectionOptions } from "../gkx23";
import { GkxIndex } from "../incremental";
import {
  cancelGkxIndexCandidateValidation,
  installGkxIndexCandidateValidation,
} from "../watcher/index-validation-hook";
import { canonicalCandidateKeys, canonicalCandidateSourceDescriptor } from "../canonical-candidates";
import {
  gkxCanonicalCandidateLedger,
  gkxLineageDeclarationReceipts,
  type GkxCanonicalCandidateDeclarationReceipt,
  type GkxCanonicalCandidateRecordReceipt,
  type GkxLineageDeclarationReceipt,
} from "../lineage-receipts";
import { basenameWithoutExtension, normalizeVaultRelative } from "../paths";
import { isValidGkxTimestamp } from "../timestamps";
import { computeTemporalState } from "../temporal";
import type { GkxGraph, GraphDelta, GkxNode, LineageModel, SourceFile } from "../types";
import { types as utilTypes } from "node:util";
import { isValidRetrievalSourcePath } from "./chunker";
import { retrievalCodeUnitCompare, retrievalSha256 } from "./digest";
import { sealGkxRetrievalCandidateSource, type GkxRetrievalCandidateDeclaration, type GkxRetrievalCandidateSource } from "./candidate-types";
import { gkxCandidateValidationReceipt } from "../validation-receipts";
import type {
  ChunkMarkdownInput,
  GkxRetrievalStoredSourceProvenance,
  GkxRetrievalValidityOrigin,
  RetrievalChunkMetadata,
} from "./types";

const CONTROL_RE = /[\u0000-\u001f\u007f]/u;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_DATE_MS = 8_640_000_000_000_000;
const SOURCE_FILE_FIELDS = new Set(["relativePath", "name", "extension", "size", "modifiedTime", "createdTime", "content", "kind"]);

export interface GkxRetrievalProjectionOptions {
  projection_options?: Gkx23ProjectionOptions;
  /** Explicit governed snapshot/reference time required whenever source created/modified stats are both absent, including when GKX authored time exists. */
  projection_reference_time?: string;
}

export interface GkxRetrievalProjectedSource {
  /** Opaque physical key; never a public source identity. */
  record_key: string;
  chunk_input: ChunkMarkdownInput;
  candidate_source: GkxRetrievalCandidateSource;
}

export interface GkxRetrievalProjectionRejection {
  source_path: string;
  source_id: string | null;
  reason_codes: string[];
}

// Phase-3 owner validation must associate a source-local rejection with the
// exact physical candidate, including duplicate portable paths.  Keep that
// authority package-private and non-enumerable so frozen Phase-2 projection
// bytes and trusted-host return shapes remain unchanged.
const PROJECTION_REJECTION_RECORD_KEYS = new WeakMap<GkxRetrievalProjectionRejection, string>();
export interface GkxRetrievalInvalidDeclarationLocation {
  category: "lineage" | "relationship" | "link";
  field: string;
  declaration_index: number;
  indexed: boolean;
  source_line: number | null;
}
const PROJECTION_REJECTION_DECLARATION_LOCATIONS = new WeakMap<
  GkxRetrievalProjectionRejection,
  readonly GkxRetrievalInvalidDeclarationLocation[]
>();

function bindProjectionRejectionRecordKey(
  rejection: GkxRetrievalProjectionRejection,
  recordKey: string,
  invalidDeclarationLocations: readonly GkxRetrievalInvalidDeclarationLocation[] = [],
): GkxRetrievalProjectionRejection {
  PROJECTION_REJECTION_RECORD_KEYS.set(rejection, recordKey);
  PROJECTION_REJECTION_DECLARATION_LOCATIONS.set(rejection, Object.freeze(invalidDeclarationLocations.map((item) => Object.freeze({ ...item }))));
  return rejection;
}

export function gkxRetrievalProjectionRejectionRecordKey(
  rejection: GkxRetrievalProjectionRejection,
): string | null {
  return PROJECTION_REJECTION_RECORD_KEYS.get(rejection) ?? null;
}

/** Phase-3 owner-only parser receipt coordinates; raw references remain sealed. */
export function gkxRetrievalProjectionRejectionInvalidDeclarationLocations(
  rejection: GkxRetrievalProjectionRejection,
): readonly GkxRetrievalInvalidDeclarationLocation[] {
  return PROJECTION_REJECTION_DECLARATION_LOCATIONS.get(rejection) ?? Object.freeze([]);
}

export interface GkxRetrievalCorpusProjection {
  graph: GkxGraph;
  delta: GraphDelta;
  sources: GkxRetrievalProjectedSource[];
  declarations: GkxRetrievalCandidateDeclaration[];
  rejections: GkxRetrievalProjectionRejection[];
  parse_count: number;
}

const PROJECTION_PARSER_DESCRIPTORS = new WeakMap<GkxRetrievalCorpusProjection, ReadonlyMap<string, string>>();
const PROJECTION_VALIDATION_GRAPHS = new WeakMap<GkxRetrievalCorpusProjection, GkxGraph>();

/** Phase-5 private receipt: exact parser descriptor used by the one parse. */
export function gkxRetrievalProjectionParserDescriptor(
  projection: GkxRetrievalCorpusProjection,
  recordKey: string,
): string | null {
  return PROJECTION_PARSER_DESCRIPTORS.get(projection)?.get(recordKey) ?? null;
}

/** Private pre-commit candidate graph; ordinary projections return graph. */
export function gkxRetrievalProjectionValidationGraph(projection: GkxRetrievalCorpusProjection): GkxGraph {
  return PROJECTION_VALIDATION_GRAPHS.get(projection) ?? projection.graph;
}

interface SourceAuthority {
  file: SourceFile;
  node: GkxNode;
  source_id: string;
  assertion_time: string | null;
  validity_origin: GkxRetrievalValidityOrigin;
  valid_from: string | null;
  valid_to: string | null;
  rejected: boolean;
  rejection_reasons: string[];
  lineage_incomplete: boolean;
  authored_supersedes: string[];
  authored_superseded_by: string[];
  authored_receipts: readonly GkxLineageDeclarationReceipt[];
  effective_receipts: readonly GkxLineageDeclarationReceipt[];
}

function finiteTime(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_DATE_MS ? value : null;
}

function exactUtc(value: string): string {
  return new Date(Date.parse(value)).toISOString();
}

function expectedValidityAuthority(file: SourceFile, authoredCreatedAt: unknown, referenceTime: string | null): {
  origin: GkxRetrievalValidityOrigin;
  expected_valid_from: string;
} {
  if (typeof authoredCreatedAt === "string" && isValidGkxTimestamp(authoredCreatedAt)) {
    return { origin: "gkx_authored_timestamp", expected_valid_from: exactUtc(authoredCreatedAt) };
  }
  const created = finiteTime(file.createdTime);
  if (created !== null) return { origin: "source_created_time", expected_valid_from: new Date(created).toISOString() };
  const modified = finiteTime(file.modifiedTime);
  if (modified !== null) return { origin: "source_modified_time", expected_valid_from: new Date(modified).toISOString() };
  if (referenceTime !== null) return { origin: "projection_reference_time", expected_valid_from: referenceTime };
  throw new Error("GKX_RETRIEVAL_PROJECTION_REFERENCE_TIME_REQUIRED");
}

function assertDensePlainArray(value: unknown, code: string): asserts value is unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) throw new TypeError(code);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key))) || Object.keys(value).length !== value.length) throw new TypeError(code);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError(code);
  }
}

function strictSourceFile(value: unknown): SourceFile {
  if (value === null || Array.isArray(value) || typeof value !== "object" || utilTypes.isProxy(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError("GKX_RETRIEVAL_SOURCE_FILE_ENVELOPE_INVALID");
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !SOURCE_FILE_FIELDS.has(key))) throw new TypeError("GKX_RETRIEVAL_SOURCE_FILE_FIELDS_INVALID");
  const fields = new Map<string, unknown>();
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor) || descriptor.value === undefined) throw new TypeError("GKX_RETRIEVAL_SOURCE_FILE_DESCRIPTOR_INVALID");
    fields.set(key, descriptor.value);
  }
  const relativePath = fields.get("relativePath");
  const content = fields.get("content");
  if (typeof relativePath !== "string" || !relativePath || relativePath.length > 4096 || typeof content !== "string" || Buffer.byteLength(content, "utf8") > MAX_SOURCE_BYTES) {
    throw new TypeError("GKX_RETRIEVAL_SOURCE_FILE_CONTENT_INVALID");
  }
  for (const field of ["name", "extension"] as const) {
    const item = fields.get(field);
    if (item !== undefined && (typeof item !== "string" || item.length > 512 || CONTROL_RE.test(item))) throw new TypeError("GKX_RETRIEVAL_SOURCE_FILE_STRING_INVALID");
  }
  const size = fields.get("size");
  if (size !== undefined && (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0)) throw new TypeError("GKX_RETRIEVAL_SOURCE_FILE_SIZE_INVALID");
  for (const field of ["createdTime", "modifiedTime"] as const) {
    const item = fields.get(field);
    if (item !== undefined && (typeof item !== "number" || finiteTime(item) === null)) throw new TypeError("GKX_RETRIEVAL_SOURCE_FILE_TIME_INVALID");
  }
  const kind = fields.get("kind");
  if (kind !== undefined && kind !== "note") throw new TypeError("GKX_RETRIEVAL_SOURCE_FILE_KIND_INVALID");
  const baseName = relativePath.replace(/\\/gu, "/").split("/").at(-1)!;
  const dot = baseName.lastIndexOf(".");
  const expectedExtension = dot < 0 ? "" : baseName.slice(dot + 1);
  if (fields.has("name") && fields.get("name") !== baseName) throw new TypeError("GKX_RETRIEVAL_SOURCE_FILE_NAME_MISMATCH");
  if (fields.has("extension") && fields.get("extension") !== expectedExtension) throw new TypeError("GKX_RETRIEVAL_SOURCE_FILE_EXTENSION_MISMATCH");
  if (fields.has("size") && size !== Buffer.byteLength(content, "utf8")) throw new TypeError("GKX_RETRIEVAL_SOURCE_FILE_SIZE_MISMATCH");
  return {
    relativePath,
    content,
    ...(fields.has("name") ? { name: fields.get("name") as string } : {}),
    ...(fields.has("extension") ? { extension: fields.get("extension") as string } : {}),
    ...(fields.has("size") ? { size: size as number } : {}),
    ...(fields.has("createdTime") ? { createdTime: fields.get("createdTime") as number } : {}),
    ...(fields.has("modifiedTime") ? { modifiedTime: fields.get("modifiedTime") as number } : {}),
    ...(fields.has("kind") ? { kind: kind as "note" | "attachment" } : {}),
  };
}

function strictCanonicalPathList(value: unknown, code: string): string[] {
  assertDensePlainArray(value, code);
  return value.map((item) => {
    if (typeof item !== "string" || !item || item.length > 4096 || CONTROL_RE.test(item)) throw new TypeError(code);
    const normalized = normalizeVaultRelative(item);
    if (normalized !== item || !isValidRetrievalSourcePath(item)) throw new TypeError(code);
    return item;
  });
}

function validatedAuthoredReferences(values: readonly string[]): string[] {
  const output: string[] = [];
  for (const reference of values) {
    if (typeof reference !== "string" || !reference || reference.length > 512 || CONTROL_RE.test(reference)) {
      throw new TypeError("GKX_RETRIEVAL_AUTHORED_LINEAGE_REFERENCE_INVALID");
    }
    output.push(reference);
  }
  return [...new Set(output)].sort(retrievalCodeUnitCompare);
}

interface CanonicalEffectiveEdge { newer: string; older: string }

function acceptedEffectiveEdges(
  authorityByNodeId: ReadonlyMap<string, SourceAuthority>,
  receipts: readonly GkxLineageDeclarationReceipt[],
): CanonicalEffectiveEdge[] {
  const keys = new Set<string>();
  const edges: CanonicalEffectiveEdge[] = [];
  for (const receipt of receipts) {
    // These receipts are produced from the exact canonical GkxIndex input,
    // which already excludes proposed relations and includes authored,
    // derived, and approved effective origins.
    if (receipt.status !== "resolved" || receipt.resolved_node_id === null) continue;
    if (authorityByNodeId.get(receipt.source_node_id)?.rejected !== false || authorityByNodeId.get(receipt.resolved_node_id)?.rejected !== false) continue;
    const newer = receipt.field === "supersedes" ? receipt.source_node_id : receipt.resolved_node_id;
    const older = receipt.field === "supersedes" ? receipt.resolved_node_id : receipt.source_node_id;
    const key = `${newer}\u0001${older}`;
    if (keys.has(key)) continue;
    keys.add(key);
    edges.push({ newer, older });
  }
  return edges.sort((left, right) => retrievalCodeUnitCompare(`${left.newer}\u0001${left.older}`, `${right.newer}\u0001${right.older}`));
}

function connectedToIncompleteAcceptedSources(
  authorityByNodeId: ReadonlyMap<string, SourceAuthority>,
  edges: readonly CanonicalEffectiveEdge[],
): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  const connect = (left: string, right: string): void => {
    (adjacency.get(left) ?? (adjacency.set(left, new Set()), adjacency.get(left)!)).add(right);
    (adjacency.get(right) ?? (adjacency.set(right, new Set()), adjacency.get(right)!)).add(left);
  };
  for (const edge of edges) connect(edge.newer, edge.older);
  const tainted = new Set<string>();
  const pending = [...authorityByNodeId.entries()]
    .filter(([, source]) => !source.rejected && (source.validity_origin === "unknown" || source.lineage_incomplete))
    .map(([nodeId]) => nodeId);
  while (pending.length) {
    const nodeId = pending.pop()!;
    if (tainted.has(nodeId)) continue;
    tainted.add(nodeId);
    for (const adjacent of adjacency.get(nodeId) ?? []) pending.push(adjacent);
  }
  return tainted;
}

function acceptedTemporalInvalidAt(
  authorityByNodeId: ReadonlyMap<string, SourceAuthority>,
  effectiveEdges: readonly CanonicalEffectiveEdge[],
): Map<string, number | null> {
  const accepted = [...authorityByNodeId.entries()].filter(([, source]) => !source.rejected && source.valid_from !== null);
  const acceptedIds = new Set(accepted.map(([nodeId]) => nodeId));
  const supersedes = new Map<string, string[]>();
  const supersededBy = new Map<string, string[]>();
  const edges: Array<{ newer: string; older: string }> = [];
  for (const edge of effectiveEdges) {
    if (!acceptedIds.has(edge.newer) || !acceptedIds.has(edge.older)) continue;
    edges.push(edge);
    supersedes.set(edge.newer, [...(supersedes.get(edge.newer) ?? []), edge.older]);
    supersededBy.set(edge.older, [...(supersededBy.get(edge.older) ?? []), edge.newer]);
  }
  const lineage: LineageModel = {
    edges,
    supersedes,
    supersededBy,
    warnings: [],
    members: new Set(edges.flatMap((edge) => [edge.newer, edge.older])),
    cycles: 0,
  };
  return computeTemporalState(accepted.map(([nodeId, source]) => ({ id: nodeId, validAtMs: Date.parse(source.valid_from!) })), lineage).invalidAt;
}

function sourceMetadata(node: GkxNode, assertionTime: string | null): RetrievalChunkMetadata {
  const projection = node.gkx?.projection;
  const metadata: RetrievalChunkMetadata = {
    title: typeof projection?.authored.title === "string" ? projection.authored.title : node.label,
    tags: [...node.tags],
    sensitivity: projection?.effective.sensitivity ?? node.gkx?.sensitivity ?? "secret",
    authoritative: true,
  };
  if (typeof node.gkx?.type === "string") metadata.gkx_type = node.gkx.type;
  if (typeof node.gkx?.epistemicState === "string") metadata.epistemic_state = node.gkx.epistemicState;
  if (assertionTime !== null) metadata.authored_at = assertionTime;
  return metadata;
}

function candidateSourceMetadata(
  sourcePath: string,
  snapshot: ReturnType<typeof gkxCanonicalCandidateLedger>["records"][number]["snapshot"],
  assertionTime: string | null,
): RetrievalChunkMetadata {
  const projection = snapshot.gkx?.projection;
  const metadata: RetrievalChunkMetadata = {
    title: typeof projection?.authored.title === "string" ? projection.authored.title : basenameWithoutExtension(sourcePath),
    tags: [...snapshot.tags],
    sensitivity: projection?.effective.sensitivity ?? snapshot.gkx?.sensitivity ?? "secret",
    authoritative: true,
  };
  if (typeof snapshot.gkx?.type === "string") metadata.gkx_type = snapshot.gkx.type;
  if (typeof snapshot.gkx?.epistemicState === "string") metadata.epistemic_state = snapshot.gkx.epistemicState;
  if (assertionTime !== null) metadata.authored_at = assertionTime;
  return metadata;
}

/**
 * Project one canonical GKX snapshot into retrieval source envelopes.
 * Exactly one GkxIndex.setFiles call supplies identity, lineage, and temporal
 * projection; this adapter only binds those canonical results to disposable
 * retrieval records and never writes source content.
 */
export function projectGkxRetrievalCorpus(
  files: readonly SourceFile[],
  folders: readonly string[] = [],
  attachments: readonly string[] = [],
  options: GkxRetrievalProjectionOptions = {},
): GkxRetrievalCorpusProjection {
  return projectGkxRetrievalCorpusInternal(files, folders, attachments, options, false, null);
}

export interface WatcherGkxProjectionExecution {
  readonly index: GkxIndex;
  readonly execution_kind: "set_files" | "apply_changes";
  readonly changed_paths: readonly string[];
  readonly removed_paths: readonly string[];
  readonly renames: readonly { readonly from: string; readonly to: string }[];
  readonly validate_candidates: (input: WatcherGkxCandidateValidationInput) => readonly string[];
}

export interface WatcherGkxCandidateValidationRecord {
  readonly record: GkxCanonicalCandidateRecordReceipt;
  readonly projection_reason_codes: readonly string[];
  readonly invalid_declaration_locations: readonly GkxRetrievalInvalidDeclarationLocation[];
}

export interface WatcherGkxCandidateValidationInput {
  readonly records: readonly WatcherGkxCandidateValidationRecord[];
}

/** Repository-private watcher execution on one long-lived production GkxIndex. */
export function projectWatcherGkxRetrievalCorpus(
  files: readonly SourceFile[],
  folders: readonly string[],
  attachments: readonly string[],
  options: GkxRetrievalProjectionOptions,
  execution: WatcherGkxProjectionExecution,
): GkxRetrievalCorpusProjection {
  return projectGkxRetrievalCorpusInternal(files, folders, attachments, options, false, execution);
}

/**
 * Trusted-host fixture projection for a sealed corpus whose validity authority
 * must be the authored GKX `created_at`.  Unlike the ordinary filesystem
 * adapter, this path neither requires nor fabricates a filesystem timestamp.
 * It still performs exactly one canonical `GkxIndex.setFiles` parse pass and
 * rejects every source that lacks a portable authored validity coordinate.
 *
 * This helper is intentionally not re-exported by the retrieval host/public
 * surfaces; Phase-4's private companion verifier is its sole consumer.
 */
export function projectAuthoredGkxRetrievalCorpus(
  files: readonly SourceFile[],
  folders: readonly string[] = [],
  attachments: readonly string[] = [],
  options: GkxRetrievalProjectionOptions = {},
): GkxRetrievalCorpusProjection {
  return projectGkxRetrievalCorpusInternal(files, folders, attachments, options, true, null);
}

interface ProjectionRecordAssessment {
  readonly authored_created_at: unknown;
  readonly validity: ReturnType<typeof expectedValidityAuthority> | null;
  readonly canonical_valid_from: string | null;
  readonly rejection_reason_codes: readonly string[];
  readonly invalid_declaration_locations: readonly GkxRetrievalInvalidDeclarationLocation[];
}

function assessProjectionRecord(
  record: GkxCanonicalCandidateRecordReceipt,
  original: SourceFile,
  declarations: readonly GkxCanonicalCandidateDeclarationReceipt[],
  authoredValidityRequired: boolean,
  referenceTime: string | null,
): ProjectionRecordAssessment {
  const sourceId = record.source_uid;
  const authoredCreatedAt = record.snapshot.gkx?.projection?.authored.createdAt;
  const rejectionReasons: string[] = [];
  if (!isValidGkxAuthoredUid(sourceId)) rejectionReasons.push("CANONICAL_SOURCE_UID_UNAVAILABLE");
  if (record.intrinsic_diagnostics.some((item) => item.severity === "error" || item.severity === "critical")) {
    rejectionReasons.push("CANONICAL_PROJECTION_INVALID");
  }
  const authoredValidityAvailable = typeof authoredCreatedAt === "string" && isValidGkxTimestamp(authoredCreatedAt);
  if ((typeof authoredCreatedAt === "string" && !authoredValidityAvailable) || (authoredValidityRequired && !authoredValidityAvailable)) {
    rejectionReasons.push("CANONICAL_VALIDITY_TIMESTAMP_NONPORTABLE");
  }
  const validity = authoredValidityRequired && !authoredValidityAvailable
    ? null
    : expectedValidityAuthority(original, authoredCreatedAt, referenceTime);
  const canonicalValidFrom = record.valid_at === null ? null : isValidGkxTimestamp(record.valid_at) ? exactUtc(record.valid_at) : null;
  if (validity === null || canonicalValidFrom === null || canonicalValidFrom !== validity.expected_valid_from) {
    rejectionReasons.push("CANONICAL_VALIDITY_BINDING_MISMATCH");
  }
  const invalidDeclarationLocations: GkxRetrievalInvalidDeclarationLocation[] = [
    ...(gkxCandidateValidationReceipt(record.snapshot)?.invalid_declarations ?? []).map((issue) => ({
      category: issue.category,
      field: issue.field,
      declaration_index: issue.declaration_index,
      indexed: issue.indexed,
      source_line: issue.line,
    })),
  ];
  for (const declaration of declarations.filter((item) => item.source_record_key === record.record_key)) {
    try { validatedAuthoredReferences([declaration.raw_reference]); }
    catch {
      const location = {
        category: declaration.category,
        field: declaration.field,
        declaration_index: declaration.declaration_index,
        indexed: declaration.source_declaration_index !== null,
        source_line: declaration.source_line,
      };
      if (!invalidDeclarationLocations.some((item) => item.category === location.category && item.field === location.field &&
          item.declaration_index === location.declaration_index && item.source_line === location.source_line)) {
        invalidDeclarationLocations.push(location);
      }
    }
  }
  invalidDeclarationLocations.sort((left, right) =>
    (left.source_line ?? Number.MAX_SAFE_INTEGER) - (right.source_line ?? Number.MAX_SAFE_INTEGER) ||
    retrievalCodeUnitCompare(left.category, right.category) || retrievalCodeUnitCompare(left.field, right.field) ||
    left.declaration_index - right.declaration_index || Number(left.indexed) - Number(right.indexed));
  if (invalidDeclarationLocations.length > 0) rejectionReasons.push("AUTHORED_RELATIONSHIP_REFERENCE_INVALID");
  return Object.freeze({
    authored_created_at: authoredCreatedAt,
    validity,
    canonical_valid_from: canonicalValidFrom,
    rejection_reason_codes: Object.freeze([...new Set(rejectionReasons)].sort(retrievalCodeUnitCompare)),
    invalid_declaration_locations: Object.freeze(invalidDeclarationLocations),
  });
}

function projectGkxRetrievalCorpusInternal(
  files: readonly SourceFile[],
  folders: readonly string[],
  attachments: readonly string[],
  options: GkxRetrievalProjectionOptions,
  authoredValidityRequired: boolean,
  watcherExecution: WatcherGkxProjectionExecution | null,
): GkxRetrievalCorpusProjection {
  assertDensePlainArray(files, "GKX_RETRIEVAL_SOURCE_FILES_INVALID");
  const safeFolders = strictCanonicalPathList(folders, "GKX_RETRIEVAL_FOLDERS_INVALID");
  const safeAttachments = strictCanonicalPathList(attachments, "GKX_RETRIEVAL_ATTACHMENTS_INVALID");
  const referenceTime = options.projection_reference_time === undefined
    ? null
    : isValidGkxTimestamp(options.projection_reference_time)
      ? exactUtc(options.projection_reference_time)
      : (() => { throw new TypeError("GKX_RETRIEVAL_PROJECTION_REFERENCE_TIME_INVALID"); })();
  const excluded: GkxRetrievalProjectionRejection[] = [];
  const preflight: Array<{ file: SourceFile; normalized: string; canonical: boolean }> = [];
  for (const rawFile of files) {
    const file = strictSourceFile(rawFile);
    let normalized = "";
    try { normalized = normalizeVaultRelative(file.relativePath); } catch { /* classified below */ }
    preflight.push({ file, normalized, canonical: Boolean(normalized && normalized === file.relativePath && isValidRetrievalSourcePath(normalized)) });
  }
  const eligibleCandidates = preflight.flatMap(({ file, normalized, canonical }) => {
    if (!canonical) {
      excluded.push({ source_path: file.relativePath, source_id: null, reason_codes: ["SOURCE_PATH_INVALID"] });
      return [];
    }
    return [file];
  });
  const projectableCandidates = eligibleCandidates.filter((file) => {
    if (authoredValidityRequired) return true;
    if (referenceTime !== null || finiteTime(file.createdTime) !== null || finiteTime(file.modifiedTime) !== null) return true;
    excluded.push({
      source_path: file.relativePath,
      source_id: null,
      reason_codes: ["CANONICAL_VALIDITY_REFERENCE_UNAVAILABLE"],
    });
    return false;
  });
  const preparedFiles = projectableCandidates.map((file) => {
    if (finiteTime(file.createdTime) !== null || finiteTime(file.modifiedTime) !== null || referenceTime === null) return { ...file };
    return { ...file, createdTime: Date.parse(referenceTime) };
  });
  const keys = canonicalCandidateKeys(preparedFiles);
  const fileByRecordKey = new Map(keys.map((key, index) => [key, {
    original: projectableCandidates[index]!,
    prepared: preparedFiles[index]!,
  }]));
  const index = watcherExecution?.index ?? new GkxIndex(options.projection_options);
  let validationGraph: GkxGraph | null = null;
  let validationCapability: ReturnType<typeof installGkxIndexCandidateValidation> | null = null;
  if (watcherExecution !== null) {
    validationCapability = installGkxIndexCandidateValidation(index, (candidate) => {
      validationGraph = candidate.graph;
      const ledger = gkxCanonicalCandidateLedger(candidate.graph);
      if (ledger.records.length !== preparedFiles.length) throw new Error("GKX_RETRIEVAL_CANDIDATE_LEDGER_INCOMPLETE");
      return watcherExecution.validate_candidates(Object.freeze({
        records: Object.freeze(ledger.records.map((record) => {
          const filesForRecord = fileByRecordKey.get(record.record_key);
          if (!filesForRecord) throw new Error("GKX_RETRIEVAL_CANONICAL_SOURCE_BINDING_MISSING");
          const assessment = assessProjectionRecord(
            record,
            filesForRecord.original,
            ledger.declarations,
            authoredValidityRequired,
            referenceTime,
          );
          return Object.freeze({
            record,
            projection_reason_codes: assessment.rejection_reason_codes,
            invalid_declaration_locations: assessment.invalid_declaration_locations,
          });
        })),
      }));
    });
  }
  let update;
  try {
    if (watcherExecution === null || watcherExecution.execution_kind === "set_files") {
      update = index.setFiles(preparedFiles, safeFolders, safeAttachments);
    } else {
      const changedPaths = strictCanonicalPathList(watcherExecution.changed_paths, "GKX_RETRIEVAL_CHANGED_PATHS_INVALID");
      const removedPaths = strictCanonicalPathList(watcherExecution.removed_paths, "GKX_RETRIEVAL_REMOVED_PATHS_INVALID");
      if (new Set(changedPaths).size !== changedPaths.length || new Set(removedPaths).size !== removedPaths.length ||
          changedPaths.some((path) => removedPaths.includes(path))) {
        throw new TypeError("GKX_RETRIEVAL_INCREMENTAL_CHANGE_SET_INVALID");
      }
      const preparedByPath = new Map(preparedFiles.map((file) => [file.relativePath, file]));
      if (changedPaths.some((path) => !preparedByPath.has(path))) throw new TypeError("GKX_RETRIEVAL_CHANGED_PATHS_INVALID");
      update = index.applyChanges({
        changed: changedPaths.map((path) => preparedByPath.get(path)!),
        removed: removedPaths,
        renames: watcherExecution.renames.map((rename) => ({ from: rename.from, to: rename.to })),
        folders: safeFolders,
        attachments: safeAttachments,
      });
    }
  } finally {
    if (validationCapability !== null) cancelGkxIndexCandidateValidation(validationCapability);
  }
  const graph = update.graph;
  const ledger = gkxCanonicalCandidateLedger(validationGraph ?? graph);
  const acceptedRecordKeys = new Set<string>();
  const sources: GkxRetrievalProjectedSource[] = [];
  const rejections: GkxRetrievalProjectionRejection[] = [...excluded];
  for (const record of ledger.records) {
    const filesForRecord = fileByRecordKey.get(record.record_key);
    if (!filesForRecord) throw new Error("GKX_RETRIEVAL_CANONICAL_SOURCE_BINDING_MISSING");
    const { original } = filesForRecord;
    const sourceId = record.source_uid;
    const assessment = assessProjectionRecord(record, original, ledger.declarations, authoredValidityRequired, referenceTime);
    const authoredCreatedAt = assessment.authored_created_at;
    const validity = assessment.validity;
    const canonicalValidFrom = assessment.canonical_valid_from;
    const rejectionReasons = assessment.rejection_reason_codes;
    const invalidDeclarationLocations = assessment.invalid_declaration_locations;
    if (rejectionReasons.length > 0) {
      rejections.push(bindProjectionRejectionRecordKey({
        source_path: record.source_path,
        source_id: isValidGkxAuthoredUid(sourceId) ? sourceId : null,
        reason_codes: [...new Set(rejectionReasons)].sort(retrievalCodeUnitCompare),
      }, record.record_key, invalidDeclarationLocations));
      continue;
    }
    if (validity === null) throw new Error("GKX_RETRIEVAL_AUTHORED_VALIDITY_BINDING_MISSING");
    acceptedRecordKeys.add(record.record_key);
    const assertionTime = typeof authoredCreatedAt === "string" && isValidGkxTimestamp(authoredCreatedAt)
      ? exactUtc(authoredCreatedAt)
      : null;
    const reasons = new Set<string>(["LEDGER_BINDING_UNAVAILABLE", "LINEAGE_ID_UNAVAILABLE"]);
    if (assertionTime === null) reasons.add("ASSERTION_TIME_UNAVAILABLE");
    reasons.add({
      gkx_authored_timestamp: "VALIDITY_FROM_GKX_AUTHORED_TIMESTAMP",
      source_created_time: "VALIDITY_FROM_SOURCE_CREATED_TIME",
      source_modified_time: "VALIDITY_FROM_SOURCE_MODIFIED_TIME",
      projection_reference_time: "VALIDITY_FROM_PROJECTION_REFERENCE_TIME",
      unknown: "VALIDITY_UNKNOWN",
    }[validity.origin]);
    const metadata = candidateSourceMetadata(record.source_path, record.snapshot, assertionTime);
    const candidateSource = sealGkxRetrievalCandidateSource({
      record_key: record.record_key,
      source_id: sourceId!,
      source_path: record.source_path,
      parser_content_fingerprint: record.snapshot.parser_content_fingerprint,
      source_digest: record.source_digest,
      source_metadata: metadata,
      assertion_time: assertionTime,
      assertion_origin: assertionTime === null ? null : "gkx_created_at",
      valid_from: canonicalValidFrom,
      validity_origin: validity.origin,
      lineage_id: null,
      reason_codes: [...reasons].sort(retrievalCodeUnitCompare),
    });
    sources.push({
      record_key: record.record_key,
      chunk_input: {
        source_id: sourceId!,
        source_path: record.source_path,
        text: original.content ?? "",
        lineage_id: null,
        valid_from: canonicalValidFrom,
        valid_to: null,
        supersedes: [],
        superseded_by: [],
        metadata,
      },
      candidate_source: candidateSource,
    });
  }
  const declarations: GkxRetrievalCandidateDeclaration[] = ledger.declarations
    .filter((item) => acceptedRecordKeys.has(item.source_record_key))
    .map((item) => ({
      source_record_key: item.source_record_key,
      category: item.category,
      field: item.field,
      origin: item.origin,
      declaration_index: item.declaration_index,
      raw_reference: item.raw_reference,
      resolution_tiers: item.resolution_tiers.map((tier) => ({
        basis: tier.basis,
        candidate_record_keys: [...tier.candidate_record_keys],
      })),
    }));
  sources.sort((left, right) => retrievalCodeUnitCompare(left.record_key, right.record_key));
  declarations.sort((left, right) => retrievalCodeUnitCompare(left.source_record_key, right.source_record_key) ||
    retrievalCodeUnitCompare(left.category, right.category) || retrievalCodeUnitCompare(left.field, right.field) ||
    left.declaration_index - right.declaration_index);
  rejections.sort((left, right) => retrievalCodeUnitCompare(left.source_path, right.source_path));
  const result = { graph, delta: update.delta, sources, declarations, rejections, parse_count: update.delta.reparsed };
  if (validationGraph !== null) PROJECTION_VALIDATION_GRAPHS.set(result, validationGraph);
  PROJECTION_PARSER_DESCRIPTORS.set(result, new Map(keys.map((key, index) => [
    key,
    canonicalCandidateSourceDescriptor(preparedFiles[index]),
  ])));
  return result;
}
