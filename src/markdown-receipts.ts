import type { ParsedLink } from "./types";

// Parser-owned, package-private source coordinates. Keeping these in a
// dedicated module prevents src/index.ts's legacy markdown wildcard from
// widening the Phase-0 public API.
const PARSED_LINK_DOCUMENT_LINES = new WeakMap<ParsedLink, number>();
const PARSED_LINK_FRONTMATTER_FIELDS = new WeakMap<ParsedLink, string>();

export function parsedLinkDocumentLine(link: ParsedLink): number | null {
  return PARSED_LINK_DOCUMENT_LINES.get(link) ?? null;
}

export function parsedLinkFrontmatterField(link: ParsedLink): string | null {
  return PARSED_LINK_FRONTMATTER_FIELDS.get(link) ?? null;
}

export function bindParsedLinkDocumentLine(link: ParsedLink, line: number): ParsedLink {
  PARSED_LINK_DOCUMENT_LINES.set(link, line);
  return link;
}

export function bindParsedLinkFrontmatterField(link: ParsedLink, field: string): ParsedLink {
  PARSED_LINK_FRONTMATTER_FIELDS.set(link, field);
  return link;
}
