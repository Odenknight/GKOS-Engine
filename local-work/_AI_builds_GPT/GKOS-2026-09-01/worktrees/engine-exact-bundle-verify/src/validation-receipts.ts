import type { CanonicalCandidateSourceSnapshot } from "./canonical-candidates";
import type { NoteRecord } from "./graph";
import type { GkxProjection } from "./types";

/**
 * Parser-owned source locations used by the trusted ingest validator.
 *
 * This sidecar is deliberately absent from every public GKX value.  It is
 * populated by the same bounded parser invocation that creates a projection;
 * downstream validation never reparses YAML or extracts locations from prose.
 */
export interface GkxParserIssueReceipt {
  code: string;
  line: number;
}

export interface GkxAuthoredDeclarationIssueReceipt {
  category: "lineage" | "relationship";
  field: string;
  declaration_index: number;
  indexed: boolean;
  line: number;
}

export interface GkxParserLocationReceipt {
  applicable: boolean;
  present: boolean;
  /**
   * RFC 6901 pointer -> one-based physical document line.  The dictionary is
   * null-prototype so attacker-controlled field names cannot reach Object
   * prototype state even inside this trusted-host-only sidecar.
   */
  field_lines: Readonly<Record<string, number>>;
  /** RFC 6901 pointers whose authored numeric token parsed as negative zero. */
  negative_zero_fields: readonly string[];
  issues: readonly GkxParserIssueReceipt[];
  /** Authored declaration slots rejected before effective-origin filtering. */
  invalid_declarations: readonly GkxAuthoredDeclarationIssueReceipt[];
}

const PROJECTION_RECEIPTS = new WeakMap<GkxProjection, GkxParserLocationReceipt>();
const RECORD_RECEIPTS = new WeakMap<NoteRecord, GkxParserLocationReceipt>();
const SNAPSHOT_RECEIPTS = new WeakMap<CanonicalCandidateSourceSnapshot, GkxParserLocationReceipt>();

function sealReceipt(receipt: GkxParserLocationReceipt): GkxParserLocationReceipt {
  const fields = Object.create(null) as Record<string, number>;
  for (const [pointer, line] of Object.entries(receipt.field_lines)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    fields[pointer] = line;
  }
  Object.freeze(fields);
  const negativeZeroFields = Object.freeze([...receipt.negative_zero_fields].sort());
  const issues = Object.freeze(receipt.issues.map((issue) => Object.freeze({ ...issue })));
  const invalidDeclarations = Object.freeze(receipt.invalid_declarations.map((issue) => Object.freeze({ ...issue })));
  return Object.freeze({
    applicable: receipt.applicable,
    present: receipt.present,
    field_lines: fields,
    negative_zero_fields: negativeZeroFields,
    issues,
    invalid_declarations: invalidDeclarations,
  });
}

export function bindGkxProjectionValidationReceipt(
  projection: GkxProjection,
  receipt: GkxParserLocationReceipt,
): void {
  PROJECTION_RECEIPTS.set(projection, sealReceipt(receipt));
}

export function gkxProjectionValidationReceipt(
  projection: GkxProjection | null | undefined,
): GkxParserLocationReceipt | null {
  return projection ? PROJECTION_RECEIPTS.get(projection) ?? null : null;
}

export function copyGkxProjectionValidationReceipt(from: GkxProjection, to: GkxProjection): void {
  const receipt = PROJECTION_RECEIPTS.get(from);
  if (receipt) PROJECTION_RECEIPTS.set(to, receipt);
}

export function bindGkxRecordValidationReceipt(record: NoteRecord, receipt: GkxParserLocationReceipt): void {
  RECORD_RECEIPTS.set(record, sealReceipt(receipt));
}

export function copyGkxRecordValidationReceipt(from: NoteRecord, to: NoteRecord): void {
  const receipt = RECORD_RECEIPTS.get(from);
  if (receipt) RECORD_RECEIPTS.set(to, receipt);
}

export function gkxRecordValidationReceipt(record: NoteRecord): GkxParserLocationReceipt | null {
  return RECORD_RECEIPTS.get(record) ?? null;
}

export function bindGkxCandidateValidationReceipt(
  snapshot: CanonicalCandidateSourceSnapshot,
  receipt: GkxParserLocationReceipt | null,
): void {
  if (receipt) SNAPSHOT_RECEIPTS.set(snapshot, receipt);
}

export function copyGkxCandidateValidationReceipt(
  from: CanonicalCandidateSourceSnapshot,
  to: CanonicalCandidateSourceSnapshot,
): void {
  const receipt = SNAPSHOT_RECEIPTS.get(from);
  if (receipt) SNAPSHOT_RECEIPTS.set(to, receipt);
}

export function gkxCandidateValidationReceipt(
  snapshot: CanonicalCandidateSourceSnapshot,
): GkxParserLocationReceipt | null {
  return SNAPSHOT_RECEIPTS.get(snapshot) ?? null;
}
