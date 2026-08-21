/**
 * Gkx Core — graph construction.
 *
 * The build is split in two phases so the incremental index (§10) can cache
 * the expensive one:
 *
 *   parseSourceFile()  — regex-heavy Markdown/GKX parsing of ONE file.
 *   assembleGraph()    — cheap assembly of nodes/links/lineage/temporal state
 *                        from already-parsed records.
 *
 * `buildGraph(files, folders)` is the convenience full build used by the CLI,
 * the Agent API and full loads. All surfaces flow through this module, which
 * is what keeps the plugin, standalone page, Agent API, Graphiti exporter and
 * gkos-build CLI semantically identical (§2.2, §39).
 */
import { colorForArea } from "./colors";
import { parseMarkdownFile, type ParsedMarkdown } from "./markdown";
import { parseGkx, parseGkxTimestamp } from "./gkx-parser";
import { buildGkx23Projection, isValidGkxAuthoredUid, gkx23Inverse, gkx23RelationTargets, refreshGkx23Assessment, type Gkx23ProjectionOptions } from "./gkx23";
import {
  areaFromFilePath,
  areaFromPath,
  codeUnitCompare,
  contentHash,
  extensionFromPath,
  normalizeVaultRelative,
  posixBasename,
  posixDirname,
  vaultDepth,
} from "./paths";
import {
  addFileToResolver,
  createResolver,
  resolveLinkTarget,
  resolveTitleRef,
  unresolvedId,
  type Resolver,
} from "./resolver";
import { normalizeLineage, type LineageInput } from "./lineage";
import {
  bindGkxCanonicalCandidateLedger,
  bindGkxLineageDeclarationReceipts,
  type GkxCanonicalCandidateDeclarationReceipt,
  type GkxCanonicalCandidateLedger,
  type GkxCanonicalCandidateRecordReceipt,
  type GkxCanonicalResolutionTierReceipt,
  type GkxLineageDeclarationReceipt,
} from "./lineage-receipts";
import {
  bindCanonicalCandidateRecord,
  canonicalCandidateKeys,
  canonicalCandidateRecordKey,
  canonicalCandidateSourceSnapshot,
} from "./canonical-candidates";
import { canonicalSourceDeclarations } from "./canonical-declarations";
import {
  addCanonicalResolverCandidate,
  canonicalLinkResolutionTiers,
  canonicalTitleResolutionTiers,
  createCanonicalResolverCandidateIndex,
} from "./resolver-internal";
import { computeTemporalState, resolveValidAt } from "./temporal";
import type {
  GkxDiagnostics,
  GkxGraph,
  GkxLink,
  GkxNode,
  GkxData,
  GkxOrigin,
  SourceFile,
} from "./types";

export const fileNodeId = (rel: string): string => `file:${normalizeVaultRelative(rel)}`;
export const folderNodeId = (rel: string): string => {
  const n = normalizeVaultRelative(rel);
  return n ? `folder:${n}` : "folder:.";
};

/** Extensions parsed as Markdown notes by the graph builder. */
const PARSEABLE = new Set(["md", "markdown", "base"]);

/** Cached parse result for one source file. */
export interface NoteRecord {
  relativePath: string;
  ext?: string;
  size: number;
  mtimeMs?: number;
  btimeMs?: number;
  /** When this content first entered the index — the stable time fallback for
   *  sources that provide no file times (e.g. plugin postMessage snapshots),
   *  so re-assembly never invents phantom metadata changes. */
  firstSeenMs: number;
  hash: string;
  parsed: ParsedMarkdown;
  gkx: GkxData | null;
}

/** Parse ONE file into a cacheable record (the expensive step). The optional
 *  projection options (e.g. the fail-closed {@link Gkx23ProjectionOptions.defaultSensitivity})
 *  are forwarded to buildGkx23Projection so deployments can configure the
 *  projection default end-to-end; omitting them preserves the fail-closed
 *  "secret" default. */
export function parseSourceFile(f: SourceFile, options: Gkx23ProjectionOptions = {}): NoteRecord {
  const ext = f.extension?.toLowerCase() ?? extensionFromPath(f.relativePath);
  const content = f.content ?? "";
  const parseable = !!ext && PARSEABLE.has(ext);
  const parsed: ParsedMarkdown = parseable
    ? parseMarkdownFile(content)
    : { data: {}, content: "", links: [], tags: [], aliases: [] };
  const hash = contentHash(content);
  const gkx = parseable ? parseGkx(parsed.data, parsed.content) : null;
  const projection = parseable ? buildGkx23Projection(content, normalizeVaultRelative(f.relativePath), hash, gkx, options) : undefined;
  if (gkx && projection) gkx.projection = projection;
  return {
    relativePath: normalizeVaultRelative(f.relativePath),
    ext,
    size: Number(f.size ?? content.length ?? 0),
    mtimeMs: f.modifiedTime,
    btimeMs: f.createdTime,
    firstSeenMs: Date.now(),
    hash,
    parsed,
    gkx,
  };
}

export interface AssembleOptions {
  now?: number;
  /** Callback counting parse work (used by incremental tests/benchmarks). */
  onDiagnostics?: (d: GkxDiagnostics) => void;
}

const asStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const uniq = (a: string[]): string[] => [...new Set(a)].sort(codeUnitCompare);

function addFolder(nodes: Map<string, GkxNode>, rel: string, areaOverride?: string): void {
  const n = normalizeVaultRelative(rel);
  const id = folderNodeId(n);
  const area = areaOverride ?? areaFromPath(n);
  nodes.set(id, {
    id, kind: "folder", path: n, label: n ? posixBasename(n) : "Vault", area,
    depth: vaultDepth(n), tags: [], aliases: [], color: colorForArea(area),
    outgoing: 0, incoming: 0,
  });
}

function makeFileNode(rec: NoteRecord, now: number): GkxNode {
  const area = areaFromFilePath(rec.relativePath);
  const ext = rec.ext;
  const label = posixBasename(ext ? rec.relativePath.slice(0, -(ext.length + 1)) : rec.relativePath);
  const gkxTs = parseGkxTimestamp(rec.gkx);
  const stableNow = rec.firstSeenMs ?? now;
  const validAtMs = resolveValidAt(gkxTs, rec.btimeMs, rec.mtimeMs, stableNow);
  return {
    id: fileNodeId(rec.relativePath), kind: "file", path: rec.relativePath, label, area,
    depth: vaultDepth(rec.relativePath), extension: ext, size: rec.size,
    updatedAt: new Date(rec.mtimeMs ?? stableNow).toISOString(),
    createdAt: new Date(rec.btimeMs ?? rec.mtimeMs ?? stableNow).toISOString(),
    gkx: rec.gkx ? { ...rec.gkx } : null,
    validAt: new Date(validAtMs).toISOString(),
    type: (rec.gkx?.projection?.authored.type as string | null) || asStr(rec.parsed.data.type), status: asStr(rec.parsed.data.status),
    priority: asStr(rec.parsed.data.priority),
    tags: rec.parsed.tags, aliases: rec.parsed.aliases,
    color: colorForArea(area), outgoing: 0, incoming: 0,
  };
}

function makeUnresolved(target: string): GkxNode {
  const label = target.split("/").at(-1) ?? target;
  return {
    id: unresolvedId(target), kind: "unresolved", path: target, label,
    area: "Unresolved", depth: 1, tags: [], aliases: [],
    color: colorForArea("Unresolved"), outgoing: 0, incoming: 0, unresolved: true,
  };
}

function parentOf(rel: string): string {
  const p = posixDirname(normalizeVaultRelative(rel));
  return p === "." ? "" : p;
}

/** parent path -> direct child node ids, computed in one O(n) pass. */
function childrenByParent(folders: string[], records: NoteRecord[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (parent: string, id: string) => {
    const arr = map.get(parent);
    if (arr) arr.push(id);
    else map.set(parent, [id]);
  };
  for (const f of folders) add(parentOf(f), folderNodeId(f));
  for (const r of records) add(parentOf(r.relativePath), fileNodeId(r.relativePath));
  return map;
}

function applyCounts(nodes: Map<string, GkxNode>, links: GkxLink[]): void {
  for (const l of links) {
    if (l.kind === "contains") continue;
    const s = nodes.get(l.source);
    const t = nodes.get(l.target);
    if (s) s.outgoing++;
    if (t) t.incoming++;
  }
}

/** Assemble the full graph from parsed records (the cheap step). */
export function assembleGraph(
  records: NoteRecord[],
  folders: string[],
  opts: AssembleOptions = {}
): GkxGraph {
  return assembleGraphCore(records, folders, opts, null);
}

/** Package-private capability path used by GkxIndex/buildGraph only. */
export function assembleGraphWithCanonicalCandidates(
  records: NoteRecord[],
  candidateRecords: readonly NoteRecord[],
  folders: string[],
  opts: AssembleOptions = {},
): GkxGraph {
  return assembleGraphCore(records, folders, opts, candidateRecords);
}

function assembleGraphCore(
  records: NoteRecord[],
  folders: string[],
  opts: AssembleOptions,
  candidateRecords: readonly NoteRecord[] | null,
): GkxGraph {
  const t0 = Date.now();
  const now = opts.now ?? t0;
  // Capture the complete immutable candidate authority before compatibility
  // node/path maps or graph diagnostics can collapse/mutate cross-record data.
  const candidateLedger = candidateRecords === null ? null : buildCanonicalCandidateLedger(candidateRecords, now);
  const nodes = new Map<string, GkxNode>();
  const links: GkxLink[] = [];
  const resolver: Resolver = createResolver();

  addFolder(nodes, "", "Vault");
  for (const f of folders) addFolder(nodes, f);

  for (const rec of records) {
    const node = makeFileNode(rec, now);
    nodes.set(node.id, node);
    addFileToResolver(resolver, rec.relativePath, node.id, rec.parsed.aliases);
  }

  // ---- GKX 2.3 UID index and corpus-level identity diagnostics ----
  const uidCandidates = new Map<string, NoteRecord[]>();
  for (const rec of records) {
    const uid = rec.gkx?.projection?.authored.uid;
    if (!isValidGkxAuthoredUid(uid)) continue;
    const arr = uidCandidates.get(uid);
    if (arr) arr.push(rec); else uidCandidates.set(uid, [rec]);
  }
  const uidIndex = new Map<string, string>();
  const addProjectionDiagnostic = (rec: NoteRecord, code: string, severity: "info" | "warning" | "error" | "critical", message: string, field?: string, targetUid?: string) => {
    const projection = rec.gkx?.projection;
    if (!projection || projection.diagnostics.some((d) => d.code === code && d.field === field && d.targetUid === targetUid)) return;
    projection.diagnostics.push({ code, severity, field, message, deterministic: true, sourcePath: rec.relativePath, targetUid });
  };
  for (const [uid, matches] of uidCandidates) {
    if (matches.length === 1) uidIndex.set(uid, fileNodeId(matches[0].relativePath));
    else {
      const conflicting = new Set(matches.map((rec) => rec.hash)).size > 1;
      for (const rec of matches) {
        addProjectionDiagnostic(rec, "GKX-IDENTITY-003", "error", `UID ${uid} is declared by ${matches.length} notes; it is excluded from canonical UID resolution.`, "uid", uid);
        if (conflicting) addProjectionDiagnostic(rec, "GKX-IDENTITY-004", "error", `UID ${uid} is reused with conflicting source content.`, "uid", uid);
      }
    }
  }

  const children = childrenByParent(folders, records);
  for (const folder of ["", ...folders]) {
    const fid = folderNodeId(folder);
    for (const child of children.get(normalizeVaultRelative(folder)) ?? []) {
      links.push({ id: `contains:${fid}->${child}`, source: fid, target: child, kind: "contains" });
    }
  }

  for (const rec of records) {
    const sourceId = fileNodeId(rec.relativePath);
    for (const pl of rec.parsed.links) {
      const resolved = resolveLinkTarget(resolver, rec.relativePath, pl.target);
      const targetId = resolved ?? unresolvedId(pl.target);
      if (!resolved && !nodes.has(targetId)) nodes.set(targetId, makeUnresolved(pl.target));
      if (sourceId === targetId) continue;
      links.push({
        id: `${pl.kind}:${sourceId}->${targetId}:${links.length}`,
        source: sourceId, target: targetId, kind: pl.kind,
        label: pl.alias ?? pl.heading, sourcePath: rec.relativePath,
      });
    }
  }

  // ---- canonical lineage (§3): normalize BOTH declared directions into one edge set ----
  const lineageInputs: LineageInput[] = [];
  for (const rec of records) {
    if (!rec.gkx) continue;
    const id = fileNodeId(rec.relativePath);
    const node = nodes.get(id);
    if (!node) continue;
    const declarations = canonicalSourceDeclarations(rec).filter((declaration) => declaration.category === "lineage");
    const supersedesRelations = declarations.filter((declaration) => declaration.field === "supersedes");
    const supersededByRelations = declarations.filter((declaration) => declaration.field === "superseded_by");
    lineageInputs.push({
      id,
      label: node.label,
      declaredSupersedes: supersedesRelations.map((relation) => relation.target),
      declaredSupersededBy: supersededByRelations.map((relation) => relation.target),
      declaredSupersedesOrigins: supersedesRelations.map((relation) => relation.origin),
      declaredSupersededByOrigins: supersededByRelations.map((relation) => relation.origin),
      validAtMs: node.validAt ? Date.parse(node.validAt) : null,
    });
  }
  const lineageReceipts: GkxLineageDeclarationReceipt[] = [];
  const lineage = normalizeLineage(
    lineageInputs,
    (ref) => uidIndex.has(ref) ? { id: uidIndex.get(ref), ambiguous: false } : resolveTitleRef(resolver, ref),
    (receipt) => lineageReceipts.push({
      source_node_id: receipt.sourceId,
      field: receipt.field,
      origin: receipt.origin,
      raw_reference: receipt.rawReference,
      resolved_node_id: receipt.resolvedId ?? null,
      status: receipt.status,
      duplicate: receipt.duplicate,
    }),
  );

  // Attach stable lineage diagnostics to the originating v2.3 projection.
  const recordById = new Map(records.map((rec) => [fileNodeId(rec.relativePath), rec]));
  const lineageCodes: Record<string, string> = {
    "self-supersession": "GKX-LINEAGE-001", cycle: "GKX-LINEAGE-002",
    "unresolved-target": "GKX-LINEAGE-003", "multiple-successors": "GKX-LINEAGE-004",
    "successor-before-predecessor": "GKX-LINEAGE-005", "duplicate-declaration": "GKX-LINEAGE-006",
    "ambiguous-resolution": "GKX-LINEAGE-007",
  };
  for (const warning of lineage.warnings) {
    const rec = warning.nodeId ? recordById.get(warning.nodeId) : undefined;
    if (rec) addProjectionDiagnostic(rec, lineageCodes[warning.code] ?? "GKX-LINEAGE-999", warning.code === "duplicate-declaration" ? "warning" : "error", warning.message, "lineage");
  }

  // lineage edges render oldest -> newest (source = OLDER, target = NEWER)
  for (const e of lineage.edges) {
    links.push({
      id: `lineage:${e.older}->${e.newer}:${links.length}`,
      source: e.older, target: e.newer, kind: "lineage",
    });
  }

  // ---- temporal state (§4): one projector input for every surface ----
  const temporalInputs = lineageInputs
    .filter((li) => li.validAtMs != null)
    .map((li) => ({ id: li.id, validAtMs: li.validAtMs as number }));
  const temporal = computeTemporalState(temporalInputs, lineage);

  for (const rec of records) {
    const id = fileNodeId(rec.relativePath);
    const node = nodes.get(id);
    if (!node || !node.gkx) continue;
    // Projections of the canonical lineage graph — NOT the raw declared fields.
    node.gkx.supersedesIds = lineage.supersedes.get(id) ?? [];
    node.gkx.supersededByIds = lineage.supersededBy.get(id) ?? [];
    const inv = temporal.invalidAt.get(id) ?? null;
    node.gkx.invalidAt = inv != null ? new Date(inv).toISOString() : null;
    node.gkx.head = temporal.head.get(id) ?? false;
  }

  // ---- typed v2.3 relationships: UID-first, origin-preserving, ambiguity-safe ----
  const semanticKeys = new Set<string>();
  for (const rec of records) {
    const projection = rec.gkx?.projection;
    if (!projection) continue;
    const sourceId = fileNodeId(rec.relativePath);
    for (const relation of gkx23RelationTargets(projection)) {
      if (relation.origin === "proposed" || relation.type === "supersedes" || relation.type === "superseded_by") continue;
      const resolved = uidIndex.get(relation.target) ? { id: uidIndex.get(relation.target), ambiguous: false } : resolveTitleRef(resolver, relation.target);
      if (resolved.ambiguous) {
        addProjectionDiagnostic(rec, "GKX-RELATIONSHIP-002", "error", `${relation.type} target ${relation.target} is ambiguous; no edge was projected.`, `relationships.${relation.type}`, relation.target);
        continue;
      }
      if (!resolved.id) {
        addProjectionDiagnostic(rec, "GKX-RELATIONSHIP-001", "warning", `${relation.type} target ${relation.target} is unresolved.`, `relationships.${relation.type}`, relation.target);
        continue;
      }
      if (resolved.id === sourceId && relation.type !== "related_to") {
        addProjectionDiagnostic(rec, "GKX-RELATIONSHIP-003", "error", `${relation.type} cannot target the source note itself.`, `relationships.${relation.type}`, relation.target);
        continue;
      }
      const key = `${sourceId}\u0001${relation.type}\u0001${resolved.id}`;
      if (semanticKeys.has(key)) continue;
      semanticKeys.add(key);
      // A flat Obsidian relationship property already produced a property edge.
      // Promote that exact edge instead of adding a duplicate semantic edge.
      const editableEdge = links.find((link) => link.source === sourceId && link.target === resolved.id && (link.kind === "property" || link.kind === "wikilink"));
      if (editableEdge) {
        editableEdge.kind = "semantic";
        editableEdge.label = relation.type;
        editableEdge.sourcePath = rec.relativePath;
      } else {
        links.push({ id: `semantic:${relation.type}:${sourceId}->${resolved.id}`, source: sourceId, target: resolved.id, kind: "semantic", label: relation.type, sourcePath: rec.relativePath });
      }
      const canonicalTarget = graphUid(nodes.get(resolved.id));
      (projection.derived.relationships[relation.type] ??= []).push({ target_uid: canonicalTarget, target_node_id: resolved.id, origin: "derived", projected_from_origin: relation.origin });
      const inverse = gkx23Inverse(relation.type);
      const targetProjection = nodes.get(resolved.id)?.gkx?.projection;
      if (inverse && targetProjection) (targetProjection.derived.relationships[inverse] ??= []).push({ target_uid: graphUid(nodes.get(sourceId)), target_node_id: sourceId, origin: "derived", inverse_of: relation.type });
    }
  }

  for (const rec of records) if (rec.gkx?.projection) refreshGkx23Assessment(rec.gkx.projection);

  // ---- semantic relations: legacy **Related:** + canonical v2.2 related_to ----
  const linksBySource = new Map<string, GkxLink[]>();
  for (const l of links) {
    if (l.kind !== "wikilink" && l.kind !== "property") continue;
    const arr = linksBySource.get(l.source);
    if (arr) arr.push(l);
    else linksBySource.set(l.source, [l]);
  }
  for (const rec of records) {
    if (!rec.gkx || !rec.gkx.related.length) continue;
    const id = fileNodeId(rec.relativePath);
    const relIds = new Set(
      rec.gkx.related.map((t) => resolveLinkTarget(resolver, rec.relativePath, t) ?? unresolvedId(t))
    );
    for (const l of linksBySource.get(id) ?? []) {
      if (relIds.has(l.target) && (l.kind === "wikilink" || l.kind === "property")) {
        l.kind = "semantic";
        relIds.delete(l.target);
      }
    }
  }

  applyCounts(nodes, links);
  const list = [...nodes.values()].sort((a, b) => codeUnitCompare(a.path, b.path));
  // one O(links) pass instead of an O(nodes × links) orphan scan
  const linkedIds = new Set<string>();
  let wikilinks = 0, markdownLinks = 0, propertyLinks = 0;
  for (const l of links) {
    if (l.kind === "contains") continue;
    linkedIds.add(l.source);
    linkedIds.add(l.target);
    if (l.kind === "wikilink") wikilinks++;
    else if (l.kind === "markdown") markdownLinks++;
    else if (l.kind === "property") propertyLinks++;
  }
  const durationMs = Date.now() - t0;

  const diagnostics: GkxDiagnostics = {
    notes: records.length,
    folders: folders.length + 1,
    attachments: 0, // filled by callers that track attachment paths
    unresolvedLinks: list.filter((n) => n.kind === "unresolved").length,
    ambiguousLinks: resolver.ambiguous.size,
    lineageEdges: lineage.edges.length,
    lineageCycles: lineage.cycles,
    lineageWarnings: lineage.warnings.map((w) => `[${w.code}] ${w.message}`),
    residualCollisions: 0, // filled by the layout pass (§12)
    lastFullBuildMs: durationMs,
  };
  opts.onDiagnostics?.(diagnostics);

  const graph: GkxGraph = {
    nodes: list,
    links,
    stats: {
      indexedAt: new Date(now).toISOString(),
      durationMs,
      files: records.length,
      folders: folders.length + 1,
      unresolved: diagnostics.unresolvedLinks,
      links: links.length,
      wikilinks,
      markdownLinks,
      propertyLinks,
      orphans: list.filter((n) => n.kind === "file" && !linkedIds.has(n.id)).length,
    },
    areas: uniq(list.map((n) => n.area)),
    tags: uniq(list.flatMap((n) => n.tags)),
    statuses: uniq(list.map((n) => n.status).filter(Boolean) as string[]),
    types: uniq(list.map((n) => n.type).filter(Boolean) as string[]),
    diagnostics,
    // Core owns temporal semantics; consumers must not depend on a renderer
    // mutation to discover the graph's time range.
    __timeSpan: temporal.timeSpan,
    // The property key remains a compatibility identifier; the display value
    // uses the current model name.
    gkxProfile: "GKX 2.3 Validating Projection Profile",
    gkxUidIndex: Object.fromEntries([...uidIndex.entries()].sort(([a], [b]) => codeUnitCompare(a, b))),
    gkxAssessments: records.flatMap((rec) => rec.gkx?.projection ? [rec.gkx.projection.assessment] : []),
    gkxDiagnostics: records.flatMap((rec) => rec.gkx?.projection?.diagnostics ?? []),
  };
  bindGkxLineageDeclarationReceipts(graph, lineageReceipts);
  if (candidateLedger !== null) bindGkxCanonicalCandidateLedger(graph, candidateLedger);
  return graph;
}

function buildCanonicalCandidateLedger(
  candidateRecords: readonly NoteRecord[],
  now: number,
): GkxCanonicalCandidateLedger {
  const resolver = createCanonicalResolverCandidateIndex();
  const uidCandidates = new Map<string, string[]>();
  const records: GkxCanonicalCandidateRecordReceipt[] = [];
  for (const record of candidateRecords) {
    const recordKey = canonicalCandidateRecordKey(record);
    const snapshot = canonicalCandidateSourceSnapshot(record);
    addCanonicalResolverCandidate(resolver, snapshot.relative_path, recordKey, snapshot.aliases);
    const sourceUid = snapshot.gkx?.projection?.authored.uid;
    if (isValidGkxAuthoredUid(sourceUid)) {
      const candidates = uidCandidates.get(sourceUid) ?? [];
      candidates.push(recordKey);
      uidCandidates.set(sourceUid, candidates);
    }
    const authoredTime = parseGkxTimestamp(snapshot.gkx);
    const validityRecorded = authoredTime !== null || snapshot.created_time !== null || snapshot.modified_time !== null;
    const validAtMs = validityRecorded ? resolveValidAt(
      authoredTime,
      snapshot.created_time ?? undefined,
      snapshot.modified_time ?? undefined,
      0,
    ) : null;
    records.push({
      record_key: recordKey,
      source_path: snapshot.relative_path,
      canonical_node_id: fileNodeId(snapshot.relative_path),
      source_uid: isValidGkxAuthoredUid(sourceUid) ? sourceUid : null,
      valid_at: validAtMs !== null && Number.isFinite(validAtMs) ? new Date(validAtMs).toISOString() : null,
      parser_content_fingerprint: snapshot.parser_content_fingerprint,
      source_digest: snapshot.source_digest,
      intrinsic_diagnostics: Object.freeze((snapshot.gkx?.projection?.diagnostics ?? []).map((diagnostic) => Object.freeze({
        code: diagnostic.code,
        severity: diagnostic.severity,
        field: diagnostic.field ?? null,
      }))),
      snapshot,
    });
  }
  for (const values of uidCandidates.values()) values.sort(codeUnitCompare);
  const declarations: GkxCanonicalCandidateDeclarationReceipt[] = [];
  const seenBySourceField = new Map<string, Set<string>>();
  for (const record of [...records].sort((left, right) => codeUnitCompare(left.record_key, right.record_key))) {
    for (const declaration of record.snapshot.declarations) {
      const titleTiers = declaration.category === "link"
        ? canonicalLinkResolutionTiers(resolver, record.source_path, declaration.target)
        : canonicalTitleResolutionTiers(resolver, declaration.target);
      const tiers: GkxCanonicalResolutionTierReceipt[] = [
        ...(declaration.category === "link" ? [] : [{
          basis: "uid_exact" as const,
          candidate_record_keys: Object.freeze([...(uidCandidates.get(declaration.target) ?? [])]),
        }]),
        ...titleTiers.map((tier) => ({
          basis: tier.basis,
          candidate_record_keys: Object.freeze([...tier.candidate_keys]),
        })),
      ];
      const selectedKeys = (() => {
        for (const tier of tiers) if (tier.candidate_record_keys.length > 0) return tier.candidate_record_keys;
        return Object.freeze([] as string[]);
      })();
      let globalStatus: GkxCanonicalCandidateDeclarationReceipt["global_status"] = "unresolved";
      let resolved: string | null = null;
      if (selectedKeys.length > 1) globalStatus = "ambiguous";
      else if (selectedKeys.length === 1) {
        resolved = selectedKeys[0];
        globalStatus = resolved === record.record_key ? "self" : "resolved";
      }
      const seenKey = `${record.record_key}\u0001${declaration.category}\u0001${declaration.field}`;
      const seen = seenBySourceField.get(seenKey) ?? new Set<string>();
      const duplicate = resolved !== null && seen.has(resolved);
      if (resolved !== null) seen.add(resolved);
      seenBySourceField.set(seenKey, seen);
      declarations.push({
        source_record_key: record.record_key,
        category: declaration.category,
        field: declaration.field,
        origin: declaration.origin,
        declaration_index: declaration.declaration_index,
        raw_reference: declaration.target,
        resolution_tiers: Object.freeze(tiers),
        global_status: globalStatus,
        global_resolved_record_key: resolved,
        global_duplicate: duplicate,
      });
    }
  }
  declarations.sort((left, right) =>
    codeUnitCompare(left.source_record_key, right.source_record_key) ||
    codeUnitCompare(left.category, right.category) ||
    codeUnitCompare(left.field, right.field) ||
    left.declaration_index - right.declaration_index);
  return { records: records.sort((left, right) => codeUnitCompare(left.record_key, right.record_key)), declarations };
}

function graphUid(node: GkxNode | undefined): string | null {
  const uid = node?.gkx?.projection?.authored.uid;
  if (isValidGkxAuthoredUid(uid)) return uid;
  const compatibilityUid = node?.gkx?.uid;
  return isValidGkxAuthoredUid(compatibilityUid) ? compatibilityUid : null;
}

/** Full build convenience: parse every file, then assemble. The optional
 *  projection options thread to every parseSourceFile call so a full build
 *  honors a configured defaultSensitivity; omitting them is fail-closed. */
export function buildGraph(files: SourceFile[], folders: string[], now?: number, options: Gkx23ProjectionOptions = {}): GkxGraph {
  const keys = canonicalCandidateKeys(files);
  const records = files.map((file, index) => {
    const record = parseSourceFile(file, options);
    bindCanonicalCandidateRecord(record, keys[index], file);
    return record;
  });
  const representatives = new Map<string, { key: string; record: NoteRecord }>();
  for (const record of records) {
    const key = canonicalCandidateRecordKey(record);
    const prior = representatives.get(record.relativePath);
    if (!prior || key < prior.key) representatives.set(record.relativePath, { key, record });
  }
  return assembleGraphWithCanonicalCandidates([...representatives.values()].map((item) => item.record), records, folders, { now });
}
