import { gkx23RelationTargets } from "./gkx23";
import type { NoteRecord } from "./graph";
import { parsedLinkDocumentLine, parsedLinkFrontmatterField } from "./markdown-receipts";
import type { GkxOrigin } from "./types";
import { gkxRecordValidationReceipt } from "./validation-receipts";

export interface CanonicalSourceDeclaration {
  category: "lineage" | "relationship" | "link";
  field: string;
  target: string;
  origin: GkxOrigin;
  declaration_index: number;
  /** Parser-owned document line for this exact declaration, when frontmatter-authored. */
  source_line: number | null;
  /** Exact authored array slot; null when the declaration was scalar/body-authored. */
  source_declaration_index: number | null;
}

function pointerSegment(value: string): string {
  return value.replace(/~/gu, "~0").replace(/\//gu, "~1");
}

function authoredDeclarationLine(record: NoteRecord, pointers: readonly string[]): number | null {
  const lines = gkxRecordValidationReceipt(record)?.field_lines;
  if (!lines) return null;
  for (const pointer of pointers) {
    const line = lines[pointer];
    if (typeof line === "number" && Number.isSafeInteger(line) && line > 0) return line;
  }
  return null;
}

function indexedPointers(base: string, value: unknown, index: number): string[] {
  return Array.isArray(value) ? [`${base}/${index}`, base] : [base];
}

/** Source-local extraction shared by the graph and candidate ledger. */
export function canonicalSourceDeclarations(record: NoteRecord): readonly CanonicalSourceDeclaration[] {
  const output: CanonicalSourceDeclaration[] = [];
  if (record.gkx) {
    const raw = record.gkx.projection?.rawFrontmatter ?? {};
    const relationships = raw.relationships && typeof raw.relationships === "object" && !Array.isArray(raw.relationships)
      ? raw.relationships as Record<string, unknown> : {};
    const usedRelationIndices = new Map<string, Set<number>>();
    const relationLocation = (type: string, relationRaw: unknown): { line: number | null; index: number | null } => {
      const topLevel = Object.hasOwn(raw, type);
      const value = topLevel ? raw[type] : relationships[type];
      const base = topLevel ? `/${pointerSegment(type)}` : `/relationships/${pointerSegment(type)}`;
      if (value === undefined) return { line: null, index: null };
      if (!Array.isArray(value)) return { line: authoredDeclarationLine(record, [base]), index: null };
      const used = usedRelationIndices.get(base) ?? new Set<number>();
      let index = value.findIndex((item, candidate) => !used.has(candidate) && JSON.stringify(item) === JSON.stringify(relationRaw));
      if (index < 0) index = value.findIndex((_item, candidate) => !used.has(candidate));
      if (index < 0) return { line: authoredDeclarationLine(record, [base]), index: null };
      used.add(index);
      usedRelationIndices.set(base, used);
      return { line: authoredDeclarationLine(record, indexedPointers(base, value, index)), index };
    };
    const projected = record.gkx.projection ? gkx23RelationTargets(record.gkx.projection) : [];
    const canonicalV23 = record.gkx.projection?.sourceVersion === "2.3";
    const lineageBlock = record.gkx.projection?.authored.lineage as Record<string, unknown> | undefined;
    const predecessor = typeof lineageBlock?.predecessor_uid === "string" ? [lineageBlock.predecessor_uid] : [];
    const successor = typeof lineageBlock?.successor_uid === "string" ? [lineageBlock.successor_uid] : [];
    const supersedes = canonicalV23
      ? projected.filter((relation) => relation.type === "supersedes" && relation.origin !== "proposed")
        .map((relation) => ({ ...relation, ...(() => {
          const location = relationLocation("supersedes", relation.raw);
          return { source_line: location.line, source_declaration_index: location.index };
        })() }))
      : record.gkx.supersedes.map((target, index) => ({ target, origin: "authored" as GkxOrigin,
        source_line: authoredDeclarationLine(record, indexedPointers("/supersedes", raw.supersedes, index)),
        source_declaration_index: Array.isArray(raw.supersedes) ? index : null }));
    const supersededBy = canonicalV23
      ? projected.filter((relation) => relation.type === "superseded_by" && relation.origin !== "proposed")
        .map((relation) => ({ ...relation, ...(() => {
          const location = relationLocation("superseded_by", relation.raw);
          return { source_line: location.line, source_declaration_index: location.index };
        })() }))
      : record.gkx.supersededBy.map((target, index) => ({ target, origin: "authored" as GkxOrigin,
        source_line: authoredDeclarationLine(record, indexedPointers("/superseded_by", raw.superseded_by, index)),
        source_declaration_index: Array.isArray(raw.superseded_by) ? index : null }));
    const older = [...supersedes, ...predecessor.map((target) => ({ target, origin: "authored" as GkxOrigin,
      source_line: authoredDeclarationLine(record, ["/lineage/predecessor_uid", "/lineage"]), source_declaration_index: null }))];
    const newer = [...supersededBy, ...successor.map((target) => ({ target, origin: "authored" as GkxOrigin,
      source_line: authoredDeclarationLine(record, ["/lineage/successor_uid", "/lineage"]), source_declaration_index: null }))];
    for (const [declaration_index, relation] of older.entries()) {
      output.push({ category: "lineage", field: "supersedes", target: relation.target, origin: relation.origin, declaration_index,
        source_line: relation.source_line, source_declaration_index: relation.source_declaration_index });
    }
    for (const [declaration_index, relation] of newer.entries()) {
      output.push({ category: "lineage", field: "superseded_by", target: relation.target, origin: relation.origin, declaration_index,
        source_line: relation.source_line, source_declaration_index: relation.source_declaration_index });
    }
    for (const [declaration_index, relation] of projected
      .filter((item) => item.origin !== "proposed" && item.type !== "supersedes" && item.type !== "superseded_by")
      .entries()) {
      const location = relationLocation(relation.type, relation.raw);
      output.push({
        category: "relationship",
        field: `relationships.${relation.type}`,
        target: relation.target,
        origin: relation.origin,
        declaration_index,
        source_line: location.line,
        source_declaration_index: location.index,
      });
    }
  }
  for (const [declaration_index, link] of record.parsed.links.entries()) {
    const frontmatterField = parsedLinkFrontmatterField(link);
    output.push({
      category: "link",
      field: `links.${link.kind}`,
      target: link.target,
      origin: "authored",
      declaration_index,
      source_line: parsedLinkDocumentLine(link) ?? (frontmatterField === null
        ? null
        : authoredDeclarationLine(record, [`/${pointerSegment(frontmatterField)}`])),
      source_declaration_index: null,
    });
  }
  return output;
}
