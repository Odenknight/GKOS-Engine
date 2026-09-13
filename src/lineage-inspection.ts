import type { GkxGraph, GkxOrigin } from "./types";
import { gkxCanonicalCandidateLedger } from "./lineage-receipts";
import { resolveGkxScopedCandidateDeclaration } from "./candidate-view";

export interface ScopedLineageDeclaration {
  field: string;
  origin: GkxOrigin;
  declarationIndex: number;
  sourceLine: number | null;
  status: "resolved" | "unresolved" | "ambiguous" | "self";
  resolvedNodeId: string | null;
}

/** Host supplies its already-authorized current node set. This is not an
 * authorization provider or temporal query. Parser-private references and
 * candidate identities never leave the Engine. Hidden targets act absent.
 */
export function inspectScopedLineage(graph: GkxGraph, sourceNodeId: string, readableNodeIds: ReadonlySet<string>): {
  available: boolean; declarations: ScopedLineageDeclaration[];
} {
  const ledger = gkxCanonicalCandidateLedger(graph);
  const sources = ledger.records.filter(record => record.canonical_node_id === sourceNodeId);
  if (!readableNodeIds.has(sourceNodeId) || sources.length !== 1) return { available: false, declarations: [] };
  const readable = new Map(ledger.records.filter(record => readableNodeIds.has(record.canonical_node_id)).map(record => [record.record_key, record]));
  const availability = { known_created: new Set(readable.keys()), future: new Set<string>(), unknown: new Set<string>() };
  const declarations = ledger.declarations.filter(item => item.source_record_key === sources[0].record_key && item.category === "lineage").map(item => {
    const resolution = resolveGkxScopedCandidateDeclaration(item, availability);
    const status = resolution.status === "suppressed_future" || resolution.status === "suppressed_unknown" ? "unresolved" : resolution.status;
    return {
      field: item.field, origin: item.origin, declarationIndex: item.declaration_index, sourceLine: item.source_line,
      status, resolvedNodeId: "record_key" in resolution ? readable.get(resolution.record_key)?.canonical_node_id ?? null : null,
    };
  });
  return { available: true, declarations };
}
