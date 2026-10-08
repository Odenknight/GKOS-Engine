import { lstat as lstatAsync, realpath as realpathAsync } from "node:fs/promises";
import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, parse, resolve } from "node:path";

export interface CanonicalPathOptions {
  /** Permit a missing tail after the nearest verified existing ancestor. */
  allow_missing?: boolean;
  /** Stable caller-owned error code for a symlink/junction component. */
  alias_error: string;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function componentsBelowRoot(absolute: string): readonly string[] {
  const root = parse(absolute).root;
  return absolute.slice(root.length).split(/[\\/]+/u).filter(Boolean);
}

function aliasError(code: string): Error {
  return new Error(code);
}

async function assertNoAliasComponents(absolute: string, errorCode: string, allowMissing: boolean): Promise<void> {
  let candidate = parse(absolute).root;
  for (const component of componentsBelowRoot(absolute)) {
    candidate = join(candidate, component);
    try {
      const metadata = await lstatAsync(candidate);
      // On Windows, Node reports both symbolic-link and directory-junction
      // reparse points through lstat().isSymbolicLink(). Check components
      // before realpath so canonicalization is never the alias policy gate.
      if (metadata.isSymbolicLink()) throw aliasError(errorCode);
    } catch (error) {
      if (allowMissing && isMissing(error)) return;
      throw error;
    }
  }
}

function assertNoAliasComponentsSync(absolute: string, errorCode: string, allowMissing: boolean): void {
  let candidate = parse(absolute).root;
  for (const component of componentsBelowRoot(absolute)) {
    candidate = join(candidate, component);
    try {
      const metadata = lstatSync(candidate);
      if (metadata.isSymbolicLink()) throw aliasError(errorCode);
    } catch (error) {
      if (allowMissing && isMissing(error)) return;
      throw error;
    }
  }
}

async function nearestExisting(absolute: string, allowMissing: boolean): Promise<{ existing: string; tail: string[] }> {
  if (!allowMissing) {
    await lstatAsync(absolute);
    return { existing: absolute, tail: [] };
  }
  let existing = absolute;
  const tail: string[] = [];
  while (true) {
    try {
      await lstatAsync(existing);
      return { existing, tail };
    } catch (error) {
      if (!isMissing(error)) throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      tail.unshift(basename(existing));
      existing = parent;
    }
  }
}

function nearestExistingSync(absolute: string, allowMissing: boolean): { existing: string; tail: string[] } {
  if (!allowMissing) {
    lstatSync(absolute);
    return { existing: absolute, tail: [] };
  }
  let existing = absolute;
  const tail: string[] = [];
  while (true) {
    try {
      lstatSync(existing);
      return { existing, tail };
    } catch (error) {
      if (!isMissing(error)) throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      tail.unshift(basename(existing));
      existing = parent;
    }
  }
}

/**
 * Resolve an existing path, or a missing tail below its nearest existing
 * ancestor, after rejecting every existing symlink/junction component.
 *
 * Windows realpath is then allowed to expand ordinary 8.3 names, normalize
 * case, and remove an extended-length prefix. Those spelling changes are not
 * aliases because the component walk has already enforced the alias rule.
 */
export async function canonicalPath(path: string, options: CanonicalPathOptions): Promise<string> {
  if (!path || path.includes("\0")) throw new TypeError("path is invalid.");
  const absolute = resolve(path);
  const { existing, tail } = await nearestExisting(absolute, options.allow_missing === true);
  await assertNoAliasComponents(absolute, options.alias_error, options.allow_missing === true);
  const canonicalExisting = await realpathAsync(existing);
  return tail.reduce((parent, component) => join(parent, component), canonicalExisting);
}

/** Synchronous counterpart for the SQLite/state host boundary. */
export function canonicalPathSync(path: string, options: CanonicalPathOptions): string {
  if (!path || path.includes("\0")) throw new TypeError("path is invalid.");
  const absolute = resolve(path);
  const { existing, tail } = nearestExistingSync(absolute, options.allow_missing === true);
  assertNoAliasComponentsSync(absolute, options.alias_error, options.allow_missing === true);
  // The native Windows implementation expands 8.3 components; the legacy JS
  // implementation can preserve them and recreate the original false reject.
  const canonicalExisting = process.platform === "win32"
    ? realpathSync.native(existing)
    : realpathSync(existing);
  return tail.reduce((parent, component) => join(parent, component), canonicalExisting);
}

function windowsPathKey(path: string): string {
  let value = resolve(path).replaceAll("/", "\\");
  if (value.startsWith("\\\\?\\UNC\\")) value = `\\\\${value.slice("\\\\?\\UNC\\".length)}`;
  else if (value.startsWith("\\\\?\\")) value = value.slice("\\\\?\\".length);
  return value.replace(/[\\]+$/u, "").toLowerCase();
}

/** Compare paths only after the caller has canonicalized them. */
export function sameCanonicalPath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? windowsPathKey(left) === windowsPathKey(right)
    : left === right;
}

/** Component-bounded containment for already canonical paths. */
export function canonicalPathContains(root: string, candidate: string): boolean {
  if (process.platform !== "win32") {
    const rootPath = resolve(root);
    const candidatePath = resolve(candidate);
    const prefix = rootPath.endsWith("/") ? rootPath : `${rootPath}/`;
    return candidatePath === rootPath || candidatePath.startsWith(prefix);
  }
  const rootKey = windowsPathKey(root);
  const candidateKey = windowsPathKey(candidate);
  return candidateKey === rootKey || candidateKey.startsWith(`${rootKey}\\`);
}
