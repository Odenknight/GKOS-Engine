import { gkx23RelationTargets } from "./gkx23";
import type { NoteRecord } from "./graph";
import type { GkxOrigin } from "./types";

export interface CanonicalSourceDeclaration {
  category: "lineage" | "relationship" | "link";
  field: string;
  target: string;
  origin: GkxOrigin;
  declaration_index: number;
}

/** Source-local extraction shared by the graph and candidate ledger. */
export function canonicalSourceDeclarations(record: NoteRecord): readonly CanonicalSourceDeclaration[] {
  const output: CanonicalSourceDeclaration[] = [];
  if (record.gkx) {
    const projected = record.gkx.projection ? gkx23RelationTargets(record.gkx.projection) : [];
    const canonicalV23 = record.gkx.projection?.sourceVersion === "2.3";
    const lineageBlock = record.gkx.projection?.authored.lineage as Record<string, unknown> | undefined;
    const predecessor = typeof lineageBlock?.predecessor_uid === "string" ? [lineageBlock.predecessor_uid] : [];
    const successor = typeof lineageBlock?.successor_uid === "string" ? [lineageBlock.successor_uid] : [];
    const supersedes = canonicalV23
      ? projected.filter((relation) => relation.type === "supersedes" && relation.origin !== "proposed")
      : record.gkx.supersedes.map((target) => ({ target, origin: "authored" as GkxOrigin }));
    const supersededBy = canonicalV23
      ? projected.filter((relation) => relation.type === "superseded_by" && relation.origin !== "proposed")
      : record.gkx.supersededBy.map((target) => ({ target, origin: "authored" as GkxOrigin }));
    const older = [...supersedes, ...predecessor.map((target) => ({ target, origin: "authored" as GkxOrigin }))];
    const newer = [...supersededBy, ...successor.map((target) => ({ target, origin: "authored" as GkxOrigin }))];
    for (const [declaration_index, relation] of older.entries()) {
      output.push({ category: "lineage", field: "supersedes", target: relation.target, origin: relation.origin, declaration_index });
    }
    for (const [declaration_index, relation] of newer.entries()) {
      output.push({ category: "lineage", field: "superseded_by", target: relation.target, origin: relation.origin, declaration_index });
    }
    for (const [declaration_index, relation] of projected
      .filter((item) => item.origin !== "proposed" && item.type !== "supersedes" && item.type !== "superseded_by")
      .entries()) {
      output.push({
        category: "relationship",
        field: `relationships.${relation.type}`,
        target: relation.target,
        origin: relation.origin,
        declaration_index,
      });
    }
  }
  for (const [declaration_index, link] of record.parsed.links.entries()) {
    output.push({
      category: "link",
      field: `links.${link.kind}`,
      target: link.target,
      origin: "authored",
      declaration_index,
    });
  }
  return output;
}
