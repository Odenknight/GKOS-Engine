import { normalizeVaultRelative } from "../paths";

/** Excludes exactly the Navigation run archive, not the rest of `_archive`. */
export function shouldIgnoreNavigationArchivePath(relativePath: string): boolean {
  const normalized = normalizeVaultRelative(relativePath);
  return normalized === "_archive/moc-runs" || normalized.startsWith("_archive/moc-runs/");
}
