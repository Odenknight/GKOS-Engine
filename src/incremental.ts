/**
 * Gkx Core — incremental index (§10).
 *
 * Maintains `path -> parsed note` / `path -> content hash` / `path -> file
 * metadata` caches so that a single-note change costs ONE parse:
 *
 *   Filesystem snapshot → source diff → changed-note parsing → resolver
 *   update → edge reconciliation → lineage projection → temporal projection
 *   → graph diff → renderer update
 *
 * Parsing (regex-heavy) is the expensive stage and is strictly limited to
 * changed content; assembly from cached records is cheap and keeps the
 * resolver, lineage, temporal and semantic passes globally consistent.
 *
 * Structural threshold (§10.2, documented): when one update removes or
 * changes more than max(500, 25% of the vault), the index performs — and
 * reports — a full rebuild, because bulk imports/deletes/renames invalidate
 * enough of the cache that diffing costs more than rebuilding.
 */
import { assembleGraphWithCanonicalCandidates, parseSourceFile, type NoteRecord } from "./graph";
import {
  bindCanonicalCandidateRecord,
  canonicalCandidateKeys,
  canonicalCandidateRecordDescriptor,
  canonicalCandidateRecordKey,
  canonicalCandidateRecordParserSignature,
  canonicalCandidateSourceDescriptor,
  canonicalCandidateSourceParserSignature,
  canonicalCandidateSourceSnapshot,
  cloneCanonicalCandidateRecord,
  rebindRenamedCanonicalCandidateRecords,
  validateCanonicalCandidateRecordKeys,
} from "./canonical-candidates";
import type { Gkx23ProjectionOptions } from "./gkx23";
import { extensionFromPath, normalizeVaultRelative } from "./paths";
import type { GraphDelta, GkxDiagnostics, GkxGraph, SourceFile } from "./types";

export interface IndexChanges {
  changed?: SourceFile[];
  removed?: string[];
  renames?: Array<{ from: string; to: string }>;
  /** Full folder list when folder topology changed; omit to keep the previous list. */
  folders?: string[];
  /** Full attachment path list; omit to keep the previous list. */
  attachments?: string[];
  label?: string;
}

export interface IndexUpdate {
  graph: GkxGraph;
  delta: GraphDelta;
}

export const STRUCTURAL_REBUILD_MIN = 500;
export const STRUCTURAL_REBUILD_FRACTION = 0.25;

interface GraphSignature {
  nodes: Set<string>;
  links: Set<string>;
}

function signatureOf(graph: GkxGraph): GraphSignature {
  const nodes = new Set<string>();
  for (const n of graph.nodes) nodes.add(n.id);
  const links = new Set<string>();
  for (const l of graph.links) links.add(`${l.source}${l.target}${l.kind}`);
  return { nodes, links };
}

function setsDiffer(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return true;
  for (const x of a) if (!b.has(x)) return true;
  return false;
}

function cloneCompatibilityRecord(record: NoteRecord): NoteRecord {
  return {
    ...record,
    parsed: JSON.parse(JSON.stringify(record.parsed)),
    gkx: record.gkx === null ? null : JSON.parse(JSON.stringify(record.gkx)),
  };
}

export class GkxIndex {
  private records = new Map<string, NoteRecord>();
  /** Complete parser-input multiset, including equal normalized paths. */
  private candidateRecords = new Map<string, NoteRecord>();
  private folders: string[] = [];
  private attachments: string[] = [];
  private prevSig: GraphSignature | null = null;
  private prevNodeMeta = new Map<string, string>();
  graph: GkxGraph | null = null;
  /** Cumulative number of parseSourceFile calls (test/benchmark observability). */
  parseCount = 0;
  /** Deterministic projection options (e.g. the fail-closed defaultSensitivity)
   *  threaded to every parseSourceFile call so incrementally-reparsed notes
   *  resolve missing sensitivity to the SAME configured default as a full build. */
  private readonly projectionOptions: Gkx23ProjectionOptions;

  constructor(projectionOptions: Gkx23ProjectionOptions = {}) {
    this.projectionOptions = projectionOptions;
  }

  get noteCount(): number {
    return this.records.size;
  }

  getAttachments(): string[] {
    return this.attachments.slice();
  }

  getFolders(): string[] {
    return this.folders.slice();
  }

  /** Raw note contents are NOT retained; expose cached records for exporters. */
  getRecords(): Map<string, NoteRecord> {
    return this.records;
  }

  private rebuildDeterministicRepresentatives(): void {
    this.records.clear();
    const representatives = new Map<string, { key: string; record: NoteRecord }>();
    for (const [key, record] of this.candidateRecords) {
      const prior = representatives.get(record.relativePath);
      if (!prior || key < prior.key) representatives.set(record.relativePath, { key, record });
    }
    for (const { record } of representatives.values()) {
      this.records.set(record.relativePath, cloneCompatibilityRecord(record));
    }
  }

  /**
   * Publish staged compatibility records without replacing the historically
   * live Map returned by getRecords(). All fallible parsing, validation, and
   * graph assembly has completed before this method is called.
   */
  private commitCompatibilityRecords(publicRecords: Map<string, NoteRecord>): void {
    if (this.records === publicRecords) return;
    const stagedRecords = this.records;
    publicRecords.clear();
    for (const [path, record] of stagedRecords) publicRecords.set(path, record);
    this.records = publicRecords;
  }

  private validateActiveCandidateContentBindings(): void {
    validateCanonicalCandidateRecordKeys([...this.candidateRecords.values()]);
    const parserFingerprintByDigest = new Map<string, string>();
    for (const record of this.candidateRecords.values()) {
      const snapshot = canonicalCandidateSourceSnapshot(record);
      const priorParserFingerprint = parserFingerprintByDigest.get(snapshot.source_digest);
      if (priorParserFingerprint !== undefined && priorParserFingerprint !== snapshot.parser_content_fingerprint) {
        throw new Error("GKX_CANONICAL_SOURCE_DIGEST_COLLISION");
      }
      parserFingerprintByDigest.set(snapshot.source_digest, snapshot.parser_content_fingerprint);
    }
  }

  /** Full load: parse everything, assemble, remember signature. */
  setFiles(files: SourceFile[], folders: string[] = [], attachments: string[] = []): IndexUpdate {
    const t0 = Date.now();
    const priorState = {
      candidateRecords: this.candidateRecords,
      records: this.records,
      folders: this.folders,
      attachments: this.attachments,
      prevSig: this.prevSig,
      prevNodeMeta: this.prevNodeMeta,
      graph: this.graph,
      parseCount: this.parseCount,
    };
    try {
      const candidateKeys = canonicalCandidateKeys(files);
      this.records = new Map();
      this.candidateRecords = new Map();
      for (const [index, f] of files.entries()) {
        const rec = parseSourceFile(f, this.projectionOptions);
        bindCanonicalCandidateRecord(rec, candidateKeys[index], f);
        this.parseCount++;
        if (this.candidateRecords.has(candidateKeys[index])) throw new Error("GKX_CANONICAL_RECORD_KEY_DUPLICATE");
        this.candidateRecords.set(candidateKeys[index], rec);
      }
      this.validateActiveCandidateContentBindings();
      this.rebuildDeterministicRepresentatives();
      this.folders = folders.slice();
      this.attachments = attachments.slice();
      const graph = this.assemble();
      graph.diagnostics.lastFullBuildMs = Date.now() - t0;
      this.prevSig = signatureOf(graph);
      this.prevNodeMeta = this.metaOf(graph);
      const delta: GraphDelta = {
        addedNodes: graph.nodes.map((n) => n.id),
        removedNodes: [],
        changedNodes: [],
        topologyChanged: true,
        reparsed: files.length,
        fullRebuild: true,
      };
      this.commitCompatibilityRecords(priorState.records);
      return { graph, delta };
    } catch (error) {
      this.candidateRecords = priorState.candidateRecords;
      this.records = priorState.records;
      this.folders = priorState.folders;
      this.attachments = priorState.attachments;
      this.prevSig = priorState.prevSig;
      this.prevNodeMeta = priorState.prevNodeMeta;
      this.graph = priorState.graph;
      this.parseCount = priorState.parseCount;
      throw error;
    }
  }

  /** Incremental update: parse only genuinely-changed content. */
  applyChanges(changes: IndexChanges): IndexUpdate {
    const t0 = Date.now();
    const changed = changes.changed ?? [];
    const removed = changes.removed ?? [];
    const renames = changes.renames ?? [];
    const normalizedRenameSources = renames.map((rename) => normalizeVaultRelative(rename.from));
    if (new Set(normalizedRenameSources).size !== normalizedRenameSources.length) {
      throw new Error("GKX_INCREMENTAL_RENAME_SOURCE_DUPLICATE");
    }
    for (const rename of renames) {
      const fromExtension = extensionFromPath(normalizeVaultRelative(rename.from)) ?? null;
      const toExtension = extensionFromPath(normalizeVaultRelative(rename.to)) ?? null;
      if (fromExtension !== toExtension) {
        throw new Error("GKX_INCREMENTAL_RENAME_REPARSE_REQUIRED");
      }
    }

    const priorState = {
      candidateRecords: this.candidateRecords,
      records: this.records,
      folders: this.folders,
      attachments: this.attachments,
      prevSig: this.prevSig,
      prevNodeMeta: this.prevNodeMeta,
      graph: this.graph,
      parseCount: this.parseCount,
    };
    this.candidateRecords = new Map([...priorState.candidateRecords].map(([key, record]) => [key, cloneCanonicalCandidateRecord(record)]));
    this.records = new Map(priorState.records);

    try {

    const touched = removed.length + changed.length + renames.length;
    const structural =
      touched > Math.max(STRUCTURAL_REBUILD_MIN, this.records.size * STRUCTURAL_REBUILD_FRACTION);

    let reparsed = 0;

    // Renames move the cached record: content is unchanged, so no re-parse (§10).
    // Two-phase so a batch that swaps paths (e.g. [A->B, B->A]) or otherwise
    // reorders keys can't clobber a source before it's read: snapshot every
    // source record from the PRE-batch state first, then delete all `from`
    // keys, then write all `to` keys. A `to` that names a path outside the
    // batch is treated as replaced — the rename wins, matching filesystem
    // rename semantics (mv overwrites its target).
    const candidateMoves: Array<{ to: string; records: NoteRecord[] }> = [];
    const renameSources = new Set(normalizedRenameSources);
    for (const r of renames) {
      const from = normalizeVaultRelative(r.from);
      const candidates = [...this.candidateRecords.values()].filter((candidate) => candidate.relativePath === from);
      if (candidates.length) candidateMoves.push({ to: normalizeVaultRelative(r.to), records: candidates });
    }
    for (const move of candidateMoves) {
      for (const record of move.records) this.candidateRecords.delete(canonicalCandidateRecordKey(record));
    }
    // A destination outside the rename-source set is replaced before all
    // incoming groups are combined. This mirrors filesystem rename semantics
    // without silently retaining an overwritten candidate.
    for (const destination of new Set(candidateMoves.map((move) => move.to))) {
      if (renameSources.has(destination)) continue;
      for (const record of [...this.candidateRecords.values()]) {
        if (record.relativePath === destination) this.candidateRecords.delete(canonicalCandidateRecordKey(record));
      }
    }
    const movesByDestination = new Map<string, NoteRecord[]>();
    for (const move of candidateMoves) {
      const group = movesByDestination.get(move.to) ?? [];
      group.push(...move.records);
      movesByDestination.set(move.to, group);
    }
    for (const [destination, records] of movesByDestination) {
      for (const record of records) record.relativePath = destination;
      rebindRenamedCanonicalCandidateRecords(records, destination);
      for (const record of records) {
        const key = canonicalCandidateRecordKey(record);
        if (this.candidateRecords.has(key)) throw new Error("GKX_CANONICAL_RECORD_KEY_DUPLICATE");
        this.candidateRecords.set(key, record);
      }
    }
    for (const p of removed) {
      const path = normalizeVaultRelative(p);
      for (const record of [...this.candidateRecords.values()]) {
        if (record.relativePath === path) this.candidateRecords.delete(canonicalCandidateRecordKey(record));
      }
    }
    const changedByPath = new Map<string, SourceFile[]>();
    for (const file of changed) {
      const path = normalizeVaultRelative(file.relativePath);
      const group = changedByPath.get(path) ?? [];
      group.push(file);
      changedByPath.set(path, group);
    }
    for (const [path, group] of changedByPath) {
      const previous = [...this.candidateRecords.values()].filter((record) => record.relativePath === path);
      const incomingDescriptors = group.map(canonicalCandidateSourceDescriptor).sort();
      const previousDescriptors = previous.map(canonicalCandidateRecordDescriptor).sort();
      // The complete canonical parser descriptor, including source times and
      // extension/size, gates reparsing. Content equality alone is not enough
      // because those fields can change canonical validAt and identity bytes.
      if (incomingDescriptors.length === previousDescriptors.length &&
          incomingDescriptors.every((descriptor, index) => descriptor === previousDescriptors[index])) continue;
      for (const record of previous) this.candidateRecords.delete(canonicalCandidateRecordKey(record));
      const keys = canonicalCandidateKeys(group);
      const reusableBySignature = new Map<string, NoteRecord[]>();
      for (const record of previous.sort((left, right) => {
        const leftKey = canonicalCandidateRecordKey(left);
        const rightKey = canonicalCandidateRecordKey(right);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      })) {
        const signature = canonicalCandidateRecordParserSignature(record);
        const candidates = reusableBySignature.get(signature) ?? [];
        candidates.push(record);
        reusableBySignature.set(signature, candidates);
      }
      for (const [index, file] of group.entries()) {
        const signature = canonicalCandidateSourceParserSignature(file);
        const reusable = reusableBySignature.get(signature)?.shift();
        const record = reusable === undefined
          ? parseSourceFile(file, this.projectionOptions)
          : {
              ...reusable,
              relativePath: normalizeVaultRelative(file.relativePath),
              ext: file.extension?.toLowerCase() ?? reusable.ext,
              size: Number(file.size ?? (file.content ?? "").length),
              mtimeMs: file.modifiedTime,
              btimeMs: file.createdTime,
            };
        bindCanonicalCandidateRecord(record, keys[index], file);
        if (reusable === undefined) {
          this.parseCount++;
          reparsed++;
        }
        const key = canonicalCandidateRecordKey(record);
        if (this.candidateRecords.has(key)) throw new Error("GKX_CANONICAL_RECORD_KEY_DUPLICATE");
        this.candidateRecords.set(key, record);
      }
    }
    this.validateActiveCandidateContentBindings();
    this.rebuildDeterministicRepresentatives();
    if (changes.folders) this.folders = changes.folders.slice();
    if (changes.attachments) this.attachments = changes.attachments.slice();

    const graph = this.assemble();
    graph.diagnostics.lastIncrementalUpdateMs = Date.now() - t0;

    // ---- graph diff (drives the renderer's update tiers, §11) ----
    const sig = signatureOf(graph);
    const meta = this.metaOf(graph);
    const prevSig = this.prevSig;
    const addedNodes: string[] = [];
    const removedNodes: string[] = [];
    const changedNodes: string[] = [];
    if (prevSig) {
      for (const id of sig.nodes) if (!prevSig.nodes.has(id)) addedNodes.push(id);
      for (const id of prevSig.nodes) if (!sig.nodes.has(id)) removedNodes.push(id);
      for (const [id, m] of meta) {
        if (prevSig.nodes.has(id) && sig.nodes.has(id) && this.prevNodeMeta.get(id) !== m) {
          changedNodes.push(id);
        }
      }
    }
    const topologyChanged = !prevSig || setsDiffer(prevSig.links, sig.links) || addedNodes.length > 0 || removedNodes.length > 0;
    this.prevSig = sig;
    this.prevNodeMeta = meta;

    const update = {
      graph,
      delta: {
        addedNodes,
        removedNodes,
        changedNodes,
        topologyChanged,
        reparsed,
        fullRebuild: structural,
      },
    };
    this.commitCompatibilityRecords(priorState.records);
    return update;
    } catch (error) {
      this.candidateRecords = priorState.candidateRecords;
      this.records = priorState.records;
      this.folders = priorState.folders;
      this.attachments = priorState.attachments;
      this.prevSig = priorState.prevSig;
      this.prevNodeMeta = priorState.prevNodeMeta;
      this.graph = priorState.graph;
      this.parseCount = priorState.parseCount;
      throw error;
    }
  }

  getDiagnostics(): GkxDiagnostics | null {
    return this.graph?.diagnostics ?? null;
  }

  private metaOf(graph: GkxGraph): Map<string, string> {
    const meta = new Map<string, string>();
    for (const n of graph.nodes) {
      meta.set(
        n.id,
        `${n.label}${n.status ?? ""}${n.type ?? ""}${n.tags.join(",")}${n.aliases.join(",")}${n.validAt ?? ""}${n.gkx?.invalidAt ?? ""}${n.gkx?.head ? 1 : 0}`
      );
    }
    return meta;
  }

  private assemble(): GkxGraph {
    const candidates = [...this.candidateRecords.entries()]
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([, record]) => record);
    const graph = assembleGraphWithCanonicalCandidates([...this.records.values()], candidates, this.folders);
    graph.diagnostics.attachments = this.attachments.length;
    this.graph = graph;
    return graph;
  }
}
