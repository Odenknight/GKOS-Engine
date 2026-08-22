import type { GkxGraph, GkxOrigin } from "./types";
import type { CanonicalCandidateSourceSnapshot } from "./canonical-candidates";
import type { CanonicalResolutionBasis } from "./resolver-internal";

/**
 * Internal-only receipt for one declaration consumed by canonical lineage
 * normalization. Raw authored references remain in this ephemeral sidecar and
 * are never attached to, serialized with, or exported from a graph/result.
 */
export interface GkxLineageDeclarationReceipt {
  source_node_id: string;
  field: "supersedes" | "superseded_by";
  origin: GkxOrigin;
  raw_reference: string;
  resolved_node_id: string | null;
  status: "resolved" | "unresolved" | "ambiguous" | "self";
  duplicate: boolean;
}

const RECEIPTS = new WeakMap<GkxGraph, readonly GkxLineageDeclarationReceipt[]>();

export type GkxCanonicalResolutionBasis = "uid_exact" | CanonicalResolutionBasis;

export interface GkxCanonicalResolutionTierReceipt {
  basis: GkxCanonicalResolutionBasis;
  candidate_record_keys: readonly string[];
}

export interface GkxCanonicalCandidateRecordReceipt {
  record_key: string;
  source_path: string;
  canonical_node_id: string;
  source_uid: string | null;
  valid_at: string | null;
  parser_content_fingerprint: string;
  source_digest: string;
  intrinsic_diagnostics: readonly {
    code: string;
    severity: "info" | "warning" | "error" | "critical";
    field: string | null;
  }[];
  /** Deep immutable source-local parser snapshot captured before graph mutation. */
  snapshot: CanonicalCandidateSourceSnapshot;
}

export interface GkxCanonicalCandidateDeclarationReceipt {
  source_record_key: string;
  category: "lineage" | "relationship" | "link";
  field: string;
  origin: GkxOrigin;
  declaration_index: number;
  source_line: number | null;
  source_declaration_index: number | null;
  raw_reference: string;
  resolution_tiers: readonly GkxCanonicalResolutionTierReceipt[];
  global_status: "resolved" | "unresolved" | "ambiguous" | "self";
  global_resolved_record_key: string | null;
  global_duplicate: boolean;
}

export interface GkxCanonicalCandidateLedger {
  records: readonly GkxCanonicalCandidateRecordReceipt[];
  declarations: readonly GkxCanonicalCandidateDeclarationReceipt[];
}

const CANDIDATE_LEDGERS = new WeakMap<GkxGraph, GkxCanonicalCandidateLedger>();

export function bindGkxLineageDeclarationReceipts(
  graph: GkxGraph,
  receipts: readonly GkxLineageDeclarationReceipt[],
): void {
  const sealed = receipts.map((receipt) => Object.freeze({ ...receipt }));
  RECEIPTS.set(graph, Object.freeze(sealed));
}

/** Narrow internal getter used only by canonical derived adapters. */
export function gkxLineageDeclarationReceipts(
  graph: GkxGraph,
): readonly GkxLineageDeclarationReceipt[] {
  return RECEIPTS.get(graph) ?? Object.freeze([]);
}

export function bindGkxCanonicalCandidateLedger(
  graph: GkxGraph,
  ledger: GkxCanonicalCandidateLedger,
): void {
  const records = ledger.records.map((record) => Object.freeze({ ...record }));
  const declarations = ledger.declarations.map((receipt) => Object.freeze({
    ...receipt,
    resolution_tiers: Object.freeze(receipt.resolution_tiers.map((tier) => Object.freeze({
      basis: tier.basis,
      candidate_record_keys: Object.freeze([...tier.candidate_record_keys]),
    }))),
  }));
  CANDIDATE_LEDGERS.set(graph, Object.freeze({
    records: Object.freeze(records),
    declarations: Object.freeze(declarations),
  }));
}

/** Narrow package-private getter used only by the canonical retrieval adapter. */
export function gkxCanonicalCandidateLedger(graph: GkxGraph): GkxCanonicalCandidateLedger {
  return CANDIDATE_LEDGERS.get(graph) ?? Object.freeze({ records: Object.freeze([]), declarations: Object.freeze([]) });
}
