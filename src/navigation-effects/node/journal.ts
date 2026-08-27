import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJson, canonicalSha256, deepFreeze } from "../../canonical";
import type { EffectJournalEntry, JournalState, NavigationEffectPlan } from "../types";

export interface EffectJournalAppendOptions {
  reasonCode?: string;
  receiptDigest?: string;
  plan?: NavigationEffectPlan;
  temporaryPath?: string;
}

export class DurableEffectJournal {
  private entries: EffectJournalEntry[] | null = null;
  private appendQueue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly path: string,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async load(): Promise<readonly EffectJournalEntry[]> {
    if (this.entries) return deepFreeze(this.entries.map((entry) => structuredClone(entry)));
    let text = "";
    try {
      text = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parsed: EffectJournalEntry[] = [];
    let predecessorDigest: string | undefined;
    for (const [index, line] of text.split("\n").entries()) {
      if (!line) continue;
      let entry: EffectJournalEntry;
      try {
        entry = JSON.parse(line) as EffectJournalEntry;
      } catch {
        throw new Error(`JOURNAL_CORRUPT:invalid-json:${index + 1}`);
      }
      if (entry.sequence !== parsed.length) throw new Error(`JOURNAL_CORRUPT:sequence:${index + 1}`);
      if (entry.predecessorDigest !== predecessorDigest) throw new Error(`JOURNAL_CORRUPT:predecessor:${index + 1}`);
      const expected = await canonicalSha256({ ...entry, entryDigest: undefined });
      if (entry.entryDigest !== expected) throw new Error(`JOURNAL_CORRUPT:digest:${index + 1}`);
      parsed.push(entry);
      predecessorDigest = entry.entryDigest;
    }
    this.entries = parsed;
    return deepFreeze(parsed.map((entry) => structuredClone(entry)));
  }

  append(effectId: string, state: JournalState, planDigest: string, options: EffectJournalAppendOptions = {}): Promise<EffectJournalEntry> {
    const operation = this.appendQueue.then(async () => {
      await this.load();
      const entries = this.entries!;
      const withoutDigest = {
        artifactKind: "engine.effect-journal-entry" as const,
        effectsContract: "1.0.0" as const,
        sequence: entries.length,
        ...(entries.length ? { predecessorDigest: entries[entries.length - 1].entryDigest } : {}),
        effectId,
        state,
        planDigest,
        occurredAt: this.clock(),
        ...(options.reasonCode ? { reasonCode: options.reasonCode } : {}),
        ...(options.receiptDigest ? { receiptDigest: options.receiptDigest } : {}),
        ...(options.plan ? { plan: structuredClone(options.plan) } : {}),
        ...(options.temporaryPath ? { temporaryPath: options.temporaryPath } : {}),
      };
      const entry: EffectJournalEntry = { ...withoutDigest, entryDigest: await canonicalSha256(withoutDigest) };
      await mkdir(dirname(this.path), { recursive: true });
      const handle = await open(this.path, "a");
      try {
        await handle.writeFile(`${canonicalJson(entry)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      entries.push(entry);
      return deepFreeze(structuredClone(entry));
    });
    this.appendQueue = operation.catch(() => undefined);
    return operation;
  }
}
