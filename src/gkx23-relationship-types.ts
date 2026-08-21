/**
 * Package-private canonical GKX 2.3 relationship vocabulary.
 *
 * The producer and trusted retrieval receipt validator share this exact list
 * without widening the qualified Phase-0 public API.
 */
export const GKX23_RELATION_TYPES = [
  "supports", "contradicts", "depends_on", "derived_from", "derives_from", "cites",
  "quotes", "interprets", "tests", "replicates", "fails_to_replicate", "extends",
  "narrows", "generalizes", "implements", "governed_by", "reviewed_by", "approved_by",
  "supersedes", "superseded_by", "related_to", "part_of", "has_part",
  "refines", "blocks", "documents",
] as const;

const GKX23_RELATION_TYPE_SET: ReadonlySet<string> = new Set(GKX23_RELATION_TYPES);

export function isGkx23RelationType(value: unknown): value is typeof GKX23_RELATION_TYPES[number] {
  return typeof value === "string" && GKX23_RELATION_TYPE_SET.has(value);
}
