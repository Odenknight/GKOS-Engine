import { sha256Bytes } from "../canonical";
import { normalizeVaultRelative } from "../paths";

export type InMemoryEffectFaultPoint = "read" | "archive" | "temporary-write" | "replace" | "verify" | "receipt";

export interface InMemoryEffectRecord {
  path: string;
  bytes: string;
}

/** Fault-injectable byte adapter for planner/executor tests; never touches a filesystem. */
export class InMemoryEffectAdapter {
  private files = new Map<string, string>();
  private archives = new Map<string, string>();
  private receipts = new Map<string, unknown>();
  private faults = new Map<InMemoryEffectFaultPoint, number>();

  constructor(initial: readonly InMemoryEffectRecord[] = []) {
    for (const entry of initial) this.files.set(normalizeVaultRelative(entry.path), entry.bytes);
  }

  injectFault(point: InMemoryEffectFaultPoint, count = 1): void {
    this.faults.set(point, count);
  }

  private fail(point: InMemoryEffectFaultPoint): void {
    const remaining = this.faults.get(point) ?? 0;
    if (remaining < 1) return;
    this.faults.set(point, remaining - 1);
    throw new Error(`INJECTED_FAULT:${point}`);
  }

  async read(path: string): Promise<string | null> {
    this.fail("read");
    return this.files.get(normalizeVaultRelative(path)) ?? null;
  }

  async archive(path: string, bytes: string): Promise<void> {
    this.fail("archive");
    this.archives.set(normalizeVaultRelative(path), bytes);
  }

  async writeTemporary(path: string, bytes: string): Promise<void> {
    this.fail("temporary-write");
    this.files.set(normalizeVaultRelative(path), bytes);
  }

  async replace(temporaryPath: string, targetPath: string): Promise<void> {
    this.fail("replace");
    const temporary = normalizeVaultRelative(temporaryPath);
    const target = normalizeVaultRelative(targetPath);
    const bytes = this.files.get(temporary);
    if (bytes === undefined) throw new Error("TEMPORARY_FILE_MISSING");
    this.files.set(target, bytes);
    this.files.delete(temporary);
  }

  async verify(path: string, digest: string): Promise<boolean> {
    this.fail("verify");
    const bytes = this.files.get(normalizeVaultRelative(path));
    return bytes !== undefined && await sha256Bytes(bytes) === digest;
  }

  async commitReceipt(receiptId: string, receipt: unknown): Promise<void> {
    this.fail("receipt");
    this.receipts.set(receiptId, receipt);
  }

  snapshot(): { files: InMemoryEffectRecord[]; archives: InMemoryEffectRecord[]; receiptIds: string[] } {
    const rows = (source: Map<string, string>) => [...source].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, bytes]) => ({ path, bytes }));
    return { files: rows(this.files), archives: rows(this.archives), receiptIds: [...this.receipts.keys()].sort() };
  }
}
