import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { canonicalBytes, sha256 } from "./canonical";
import { fault } from "./errors";

const NOFOLLOW = (constants as Record<string, number>).O_NOFOLLOW ?? 0;

export function requireQualifiedPosixRoot(root: string): string {
  if (process.platform === "win32") fault("GKOS_P6_PLATFORM_UNAVAILABLE");
  const absolute = resolve(root);
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  const info = lstatSync(absolute);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) fault("GKOS_P6_STORAGE_PERMISSION_INVALID");
  return absolute;
}

export function assertPrivateRegular(path: string): void {
  const link = lstatSync(path);
  if (!link.isFile() || link.isSymbolicLink() || link.uid !== process.getuid?.() || (link.mode & 0o077) !== 0) fault("GKOS_P6_STORAGE_PERMISSION_INVALID");
  const fd = openSync(path, constants.O_RDONLY | NOFOLLOW);
  try { const opened = fstatSync(fd); if (opened.dev !== link.dev || opened.ino !== link.ino) fault("GKOS_P6_STORAGE_PERMISSION_INVALID"); }
  finally { closeSync(fd); }
}

export function readPrivate(path: string, maximum = 16 * 1024 * 1024): Buffer {
  assertPrivateRegular(path);
  const bytes = readFileSync(path);
  if (bytes.length > maximum) fault("GKOS_P6_PAYLOAD_TOO_LARGE");
  return bytes;
}

export function durableCreateNoReplace(path: string, bytes: Uint8Array): void {
  const parent = requireQualifiedPosixRoot(dirname(path));
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  fsyncDirectory(parent);
}

export function durableReplace(path: string, bytes: Uint8Array): void {
  const parent = requireQualifiedPosixRoot(dirname(path));
  const temp = join(parent, `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  durableCreateNoReplace(temp, bytes);
  try { renameSync(temp, path); fsyncDirectory(parent); } finally { if (existsSync(temp)) unlinkSync(temp); }
  assertPrivateRegular(path);
}

export function removePrivateExact(path: string): "deleted_exact" | "absent" {
  if (!existsSync(path)) return "absent";
  assertPrivateRegular(path); unlinkSync(path); fsyncDirectory(dirname(path)); return "deleted_exact";
}

export function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export interface AuthorityLease { path: string; release(): void; }
export function acquireAuthorityLease(root: string, authorityInstanceId: string): AuthorityLease {
  const path = join(requireQualifiedPosixRoot(root), "authority.lock");
  const record = { authority_instance_id: authorityInstanceId, acquired_at_ms: Date.now(), pid: process.pid, version: 1 };
  try { durableCreateNoReplace(path, canonicalBytes(record)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;let stale=false;try{const existing=JSON.parse(readPrivate(path,4096).toString("utf8"));if(!Number.isInteger(existing.pid)||existing.pid<=0||existing.version!==1||typeof existing.authority_instance_id!=="string")fault("GKOS_P6_AUTHORITY_CORRUPT");try{process.kill(existing.pid,0);}catch(signalError){if((signalError as NodeJS.ErrnoException).code==="ESRCH")stale=true;else fault("GKOS_P6_CONCURRENCY_LIMIT");}}catch(parseError){if(parseError instanceof Error&&parseError.name==="AuthorityFault")throw parseError;fault("GKOS_P6_AUTHORITY_CORRUPT");}if(!stale)fault("GKOS_P6_CONCURRENCY_LIMIT");removePrivateExact(path);durableCreateNoReplace(path,canonicalBytes(record)); }
  const identity = statSync(path);
  let held = true;
  return { path, release() { if (!held) return; const current = lstatSync(path); if (current.dev !== identity.dev || current.ino !== identity.ino || current.isSymbolicLink()) fault("GKOS_P6_AUTHORITY_CORRUPT"); unlinkSync(path); fsyncDirectory(dirname(path)); held = false; } };
}

export function qualifiedLegacySource(root: string): { state: "absent" | "desktop_agent_token"; digest: string | null; path: string } {
  const path = join(requireQualifiedPosixRoot(root), "desktop-agent.token");
  if (!existsSync(path)) return { state: "absent", digest: null, path };
  const bytes = readPrivate(path, 4096);
  const text = bytes.toString("utf8");
  if (!/^[0-9a-f]{64}$/u.test(text)) fault("GKOS_P6_MIGRATION_MALFORMED");
  return { state: "desktop_agent_token", digest: sha256(bytes), path };
}
