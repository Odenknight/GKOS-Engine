import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { hostname } from "node:os";
import { canonicalJson, canonicalSha256, sha256Bytes } from "../../canonical";
import { codeUnitCompare, normalizeVaultRelative, posixDirname } from "../../paths";
import { shouldIgnoreNavigationArchivePath } from "../../navigation";
import { validateVaultRelativePath } from "../path-policy";
import type {
  EffectExecutionRequest,
  EffectExecutionResult,
  EffectAuthorityBinding,
  EffectReceipt,
  NavigationEffectPlan,
  RecoveryResult,
} from "../types";
import { canonicalMocArchiveRunPath } from "../planner";
import { DurableEffectJournal } from "./journal";

export type NodeEffectFaultPoint =
  | "after-received"
  | "after-planned"
  | "after-prepared"
  | "after-archive"
  | "after-temporary-write"
  | "after-replace"
  | "after-verified"
  | "after-receipt";

export class SimulatedEffectCrash extends Error {
  constructor(readonly point: NodeEffectFaultPoint) {
    super(`SIMULATED_EFFECT_CRASH:${point}`);
  }
}

export interface NodeEffectsExecutorOptions {
  vaultRoot: string;
  /**
   * Required acknowledgement that no untrusted local process may replace vault
   * path ancestors while an effect is executing. Node does not expose portable
   * openat-style traversal needed to defend that threat on every supported OS.
   */
  pathThreatModel: "cooperative-vault";
  stateRoot?: string;
  clock?: () => string;
  faultInjector?: (point: NodeEffectFaultPoint, effectId: string) => void | Promise<void>;
  /** Revalidates current authority, configuration, policy and retention hold under the target lock. */
  preconditionValidator?: (plan: NavigationEffectPlan) => readonly string[] | Promise<readonly string[]>;
  ioFaultInjector?: (operation: "archive" | "temporary-write" | "replace" | "verify" | "receipt", effectId: string) => void | Promise<void>;
}

interface RecoverySummary {
  safeToEnableWrites: boolean;
  results: RecoveryResult[];
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

const CANONICAL_EFFECT_ID = /^effect:(?:[0-9a-f]{32}|rollback:[0-9a-f]{32})$/;

function effectFileStem(effectId: string): string {
  if (!CANONICAL_EFFECT_ID.test(effectId)) throw new Error(`EFFECT_ID_INVALID:${effectId}`);
  return effectId.replaceAll(":", "_");
}

export class NodeNavigationEffectsExecutor {
  readonly vaultRoot: string;
  readonly stateRoot: string;
  readonly journal: DurableEffectJournal;
  readonly durability: { fileFlush: true; atomicRename: true; directoryFlush: false; limitation: string };
  private readonly clock: () => string;
  private readonly faultInjector?: NodeEffectsExecutorOptions["faultInjector"];
  private readonly preconditionValidator?: NodeEffectsExecutorOptions["preconditionValidator"];
  private readonly ioFaultInjector?: NodeEffectsExecutorOptions["ioFaultInjector"];
  private leaseHandle: Awaited<ReturnType<typeof open>> | null = null;
  private vaultRealPath: string | null = null;
  private acceptingWrites = true;
  private recoveryWriteLatched = false;
  private startupRecoveryChecked = false;
  private executionQueue: Promise<unknown> = Promise.resolve();

  constructor(options: NodeEffectsExecutorOptions) {
    if (!isAbsolute(options.vaultRoot)) throw new Error("Vault root must be absolute.");
    if (options.pathThreatModel !== "cooperative-vault") throw new Error("PATH_THREAT_MODEL_ACKNOWLEDGEMENT_REQUIRED");
    this.vaultRoot = resolve(options.vaultRoot);
    this.stateRoot = resolve(options.stateRoot ?? resolve(this.vaultRoot, ".gkx/effects"));
    const stateRelative = relative(this.vaultRoot, this.stateRoot);
    if (stateRelative.startsWith("..") || isAbsolute(stateRelative)) throw new Error("Effects state root must remain inside the vault.");
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.faultInjector = options.faultInjector;
    this.preconditionValidator = options.preconditionValidator;
    this.ioFaultInjector = options.ioFaultInjector;
    this.journal = new DurableEffectJournal(resolve(this.stateRoot, "journal.jsonl"), this.clock);
    this.durability = {
      fileFlush: true,
      atomicRename: true,
      directoryFlush: false,
      limitation: process.platform === "win32"
        ? "Node exposes file flush and same-volume rename, but this executor cannot prove directory-entry persistence across sudden power loss on Windows."
        : "File contents are flushed before same-volume rename; directory fsync is not claimed by this executor.",
    };
  }

  async acquireVaultLease(): Promise<void> {
    if (this.leaseHandle) return;
    await this.validateStateRoot();
    await mkdir(this.stateRoot, { recursive: true });
    await this.validateStateRoot();
    const leasePath = resolve(this.stateRoot, "vault.lease");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        this.leaseHandle = await open(leasePath, "wx");
        await this.leaseHandle.writeFile(canonicalJson({ pid: process.pid, host: hostname(), acquiredAt: this.clock() }), "utf8");
        await this.leaseHandle.sync();
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let prior: { pid: number; host: string };
        let priorBytes: string;
        try { priorBytes = await readFile(leasePath, "utf8"); prior = JSON.parse(priorBytes); }
        catch { throw new Error("VAULT_LEASE_CORRUPT"); }
        if (prior.host !== hostname() || !Number.isInteger(prior.pid) || this.processIsAlive(prior.pid)) throw new Error("VAULT_LEASE_HELD");
        const digest = await sha256Bytes(priorBytes);
        const quarantine = resolve(this.stateRoot, "recovery", `stale-lease-${digest.slice(7, 23)}.json`);
        await mkdir(dirname(quarantine), { recursive: true });
        try { await rename(leasePath, quarantine); }
        catch (moveError) { if ((moveError as NodeJS.ErrnoException).code === "ENOENT") continue; throw moveError; }
        await this.writeDurable(resolve(this.stateRoot, "recovery", `stale-lease-${digest.slice(7, 23)}.receipt.json`), `${canonicalJson({ artifactKind: "engine.effect-recovery-cleanup-receipt", reason: "STALE_VAULT_LEASE", priorDigest: digest, recoveredAt: this.clock() })}\n`);
      }
    }
    throw new Error("VAULT_LEASE_HELD");
  }

  private async validateStateRoot(): Promise<void> {
    const stateRelative = normalizeVaultRelative(relative(this.vaultRoot, this.stateRoot));
    await this.safeAbsolute(stateRelative, true);
  }

  private processIsAlive(pid: number): boolean {
    try { process.kill(pid, 0); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
  }

  private async writeCheckpoint(cleanShutdown = false): Promise<void> {
    const entries = await this.journal.load();
    const latest = entries.at(-1);
    const checkpoint = {
      artifactKind: "engine.effect-journal-checkpoint",
      effectsContract: "1.0.0",
      sequence: latest?.sequence ?? -1,
      entryDigest: latest?.entryDigest ?? null,
      cleanShutdown,
      recordedAt: this.clock(),
    };
    await this.writeDurable(resolve(this.stateRoot, "checkpoints", "latest.json"), `${canonicalJson(checkpoint)}\n`);
  }

  private async validateCheckpoint(): Promise<void> {
    const path = resolve(this.stateRoot, "checkpoints", "latest.json");
    if (!await exists(path)) return;
    let checkpoint: { sequence: number; entryDigest: string | null };
    try { checkpoint = JSON.parse(await readFile(path, "utf8")); }
    catch { throw new Error("CHECKPOINT_CORRUPT:invalid-json"); }
    const entries = await this.journal.load();
    if (checkpoint.sequence === -1 && checkpoint.entryDigest === null) return;
    const referenced = entries[checkpoint.sequence];
    if (!referenced || referenced.entryDigest !== checkpoint.entryDigest) throw new Error("CHECKPOINT_CORRUPT:binding");
  }

  async releaseVaultLease(): Promise<void> {
    if (!this.leaseHandle) return;
    await this.leaseHandle.close();
    this.leaseHandle = null;
    await rm(resolve(this.stateRoot, "vault.lease"), { force: true });
  }

  async shutdown(): Promise<void> {
    this.acceptingWrites = false;
    await this.enqueue(async () => {
      await this.writeCheckpoint(true);
      await this.releaseVaultLease();
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const scheduled = this.executionQueue.then(operation);
    this.executionQueue = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }

  private async fault(point: NodeEffectFaultPoint, effectId: string): Promise<void> {
    await this.faultInjector?.(point, effectId);
  }

  private async safeAbsolute(relativePath: string, allowInternal = false): Promise<string> {
    const validation = validateVaultRelativePath(relativePath);
    if (!validation.valid || !validation.normalized) throw new Error(`PATH_DENIED:${validation.reasonCodes.join(",")}`);
    const normalized = validation.normalized;
    if (!allowInternal && (normalized === ".gkx" || normalized.startsWith(".gkx/") || shouldIgnoreNavigationArchivePath(normalized))) throw new Error("PATH_DENIED:INTERNAL_EFFECT_TARGET");
    const absolute = resolve(this.vaultRoot, ...normalized.split("/"));
    const rel = relative(this.vaultRoot, absolute);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("PATH_DENIED:ROOT_ESCAPE");
    this.vaultRealPath ??= await realpath(this.vaultRoot);
    let cursor = this.vaultRoot;
    for (const segment of normalized.split("/").slice(0, -1)) {
      cursor = resolve(cursor, segment);
      if (!await exists(cursor)) break;
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new Error("PATH_DENIED:LINK_ESCAPE");
      const actual = await realpath(cursor);
      const actualRelative = relative(this.vaultRealPath, actual);
      if (actualRelative.startsWith("..") || isAbsolute(actualRelative)) throw new Error("PATH_DENIED:REPARSE_ESCAPE");
    }
    if (await exists(absolute)) {
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error("PATH_DENIED:LINK_TARGET");
    }
    return absolute;
  }

  private temporaryRelative(plan: NavigationEffectPlan): string {
    const directory = posixDirname(plan.targetPath);
    const safeId = effectFileStem(plan.effectId);
    return normalizeVaultRelative(`${directory === "." ? "" : `${directory}/`}.gkx-effect-${safeId}.tmp`);
  }

  private async readTarget(path: string): Promise<string | null> {
    try {
      const bytes = await readFile(path);
      const text = bytes.toString("utf8");
      if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error("SOURCE_NOT_VALID_UTF8");
      return text;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private async writeDurable(path: string, bytes: string, exclusive = false): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const handle = await open(path, exclusive ? "wx" : "w");
    try {
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async acquireTargetLock(plan: NavigationEffectPlan): Promise<{ release(): Promise<void> }> {
    const lockPath = await this.targetLockPath(plan);
    await mkdir(dirname(lockPath), { recursive: true });
    let handle;
    try {
      handle = await open(lockPath, "wx");
      await handle.writeFile(canonicalJson({ effectId: plan.effectId, targetPath: plan.targetPath, pid: process.pid, host: hostname() }), "utf8");
      await handle.sync();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("TARGET_LOCK_HELD");
      throw error;
    }
    return { release: async () => { await handle.close(); await rm(lockPath, { force: true }); } };
  }

  private async targetLockPath(plan: NavigationEffectPlan): Promise<string> {
    const lockDigest = await sha256Bytes(plan.targetPath);
    return resolve(this.stateRoot, "locks", `${lockDigest.slice(7)}.lock`);
  }

  private async cleanupStaleTargetLock(plan: NavigationEffectPlan): Promise<void> {
    const lockPath = await this.targetLockPath(plan);
    if (!await exists(lockPath)) return;
    let lock: { effectId?: string; targetPath?: string };
    let bytes: string;
    try { bytes = await readFile(lockPath, "utf8"); lock = JSON.parse(bytes); }
    catch { throw new Error(`TARGET_LOCK_CORRUPT:${plan.effectId}`); }
    if (lock.effectId !== plan.effectId || lock.targetPath !== plan.targetPath) throw new Error(`TARGET_LOCK_CONFLICT:${plan.effectId}`);
    const digest = await sha256Bytes(bytes);
    await rm(lockPath, { force: true });
    await this.writeDurable(resolve(this.stateRoot, "recovery", `${effectFileStem(plan.effectId)}.lock-cleanup.json`), `${canonicalJson({ artifactKind: "engine.effect-recovery-cleanup-receipt", effectId: plan.effectId, operation: "remove-verified-stale-target-lock", lockDigest: digest, occurredAt: this.clock(), sourceContentIncluded: false })}\n`);
  }

  private async archiveBefore(plan: NavigationEffectPlan, currentBytes: string | null): Promise<string> {
    const archiveMatch = plan.archiveRunPath?.match(/^_archive\/moc-runs\/(\d{4}-\d{2}-\d{2})\/([^/]+)$/);
    if (!archiveMatch || canonicalMocArchiveRunPath(archiveMatch[1], archiveMatch[2]) !== plan.archiveRunPath) throw new Error("ARCHIVE_PATH_REQUIRED");
    const runRoot = await this.safeAbsolute(plan.archiveRunPath, true);
    const target = normalizeVaultRelative(plan.targetPath);
    await mkdir(runRoot, { recursive: true });
    if (currentBytes !== null) {
      const beforePath = resolve(runRoot, "before", ...target.split("/"));
      if (await exists(beforePath)) {
        const archived = await this.readTarget(beforePath);
        if (archived === null || await sha256Bytes(archived) !== await sha256Bytes(currentBytes)) throw new Error("ARCHIVE_BEFORE_CONFLICT");
      } else await this.writeDurable(beforePath, currentBytes, true);
    }
    const expected = await this.archiveEffectBinding(plan);
    const bindingBytes = `${canonicalJson(expected)}\n`;
    const bindingPath = resolve(runRoot, "bindings", `${effectFileStem(plan.effectId)}.json`);
    if (await exists(bindingPath)) {
      if (await readFile(bindingPath, "utf8") !== bindingBytes) throw new Error("ARCHIVE_RUN_CONFLICT");
    } else await this.writeDurable(bindingPath, bindingBytes, true);
    let effects: Record<string, unknown>[] = [];
    const manifestPath = resolve(runRoot, "manifest.json");
    if (await exists(manifestPath)) {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(await readFile(manifestPath, "utf8")); } catch { throw new Error("ARCHIVE_RUN_CONFLICT"); }
      effects = this.validatedAggregateManifest(parsed);
      const bound = effects.find((effect) => effect.effectId === plan.effectId);
      if (bound && canonicalJson(bound) !== canonicalJson(expected)) throw new Error("ARCHIVE_RUN_CONFLICT");
      if (!bound && effects.some((effect) => effect.targetPath === expected.targetPath)) throw new Error("ARCHIVE_RUN_CONFLICT");
      if (!bound) effects.push(expected);
    } else effects = [expected];
    effects.sort((a, b) => codeUnitCompare(String(a.targetPath), String(b.targetPath)));
    const manifest = {
      artifactKind: "engine.moc-effect-archive-manifest",
      effectsContract: "1.0.0",
      effects,
    };
    await this.writeDurable(manifestPath, `${canonicalJson(manifest)}\n`);
    return canonicalSha256(expected);
  }

  private async archiveEffectBinding(plan: NavigationEffectPlan): Promise<Record<string, unknown>> {
    return {
      effectId: plan.effectId,
      planDigest: await canonicalSha256(plan),
      targetPath: normalizeVaultRelative(plan.targetPath),
      beforeDigest: plan.precondition.priorDigest ?? null,
      proposedDigest: plan.proposedDigest,
      sourceSnapshotDigest: plan.sourceSnapshotDigest,
      corpusDigest: plan.corpusDigest,
      configDigest: plan.configDigest,
      policyDigest: plan.policyRef.digest,
      authorityDigest: plan.precondition.authorityDigest,
    };
  }

  private validArchiveEffectBinding(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const item = value as Record<string, unknown>;
    const keys = ["authorityDigest", "beforeDigest", "configDigest", "corpusDigest", "effectId", "planDigest", "policyDigest", "proposedDigest", "sourceSnapshotDigest", "targetPath"];
    const digest = (entry: unknown) => typeof entry === "string" && /^sha256:[0-9a-f]{64}$/.test(entry);
    return Object.keys(item).sort().join("\0") === keys.sort().join("\0") && typeof item.effectId === "string" && CANONICAL_EFFECT_ID.test(item.effectId) &&
      typeof item.targetPath === "string" && validateVaultRelativePath(item.targetPath).valid &&
      [item.planDigest, item.proposedDigest, item.sourceSnapshotDigest, item.corpusDigest, item.configDigest, item.policyDigest, item.authorityDigest].every(digest) &&
      (item.beforeDigest === null || digest(item.beforeDigest));
  }

  private validatedAggregateManifest(manifest: Record<string, unknown>): Record<string, unknown>[] {
    if (Object.keys(manifest).sort().join("\0") !== ["artifactKind", "effects", "effectsContract"].sort().join("\0") ||
        manifest.artifactKind !== "engine.moc-effect-archive-manifest" || manifest.effectsContract !== "1.0.0" ||
        !Array.isArray(manifest.effects) || manifest.effects.length === 0 || !manifest.effects.every((item) => this.validArchiveEffectBinding(item))) {
      throw new Error("ARCHIVE_RUN_CONFLICT");
    }
    const effects = manifest.effects as Record<string, unknown>[];
    const ids = effects.map((item) => item.effectId);
    const targets = effects.map((item) => item.targetPath);
    if (new Set(ids).size !== ids.length || new Set(targets).size !== targets.length) throw new Error("ARCHIVE_RUN_CONFLICT");
    return effects;
  }

  private async writeArchiveAfter(plan: NavigationEffectPlan, before: string | null, after: string): Promise<void> {
    const runRoot = await this.safeAbsolute(plan.archiveRunPath!, true);
    const targetParts = normalizeVaultRelative(plan.targetPath).split("/");
    const afterPath = resolve(runRoot, "after", ...targetParts);
    if (await exists(afterPath)) {
      if (await this.readTarget(afterPath) !== after) throw new Error("ARCHIVE_AFTER_CONFLICT");
    } else await this.writeDurable(afterPath, after, true);
    const diffItem = {
      effectId: plan.effectId,
      targetPath: plan.targetPath,
      beforeDigest: before === null ? null : await sha256Bytes(before),
      afterDigest: await sha256Bytes(after),
      beforeByteLength: before === null ? 0 : Buffer.byteLength(before),
      afterByteLength: Buffer.byteLength(after),
    };
    const diffPath = resolve(runRoot, "diff.json");
    let items: Record<string, unknown>[] = [];
    if (await exists(diffPath)) {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(await readFile(diffPath, "utf8")); } catch { throw new Error("ARCHIVE_DIFF_CONFLICT"); }
      if (Object.keys(parsed).sort().join("\0") !== ["artifactKind", "items"].sort().join("\0") || parsed.artifactKind !== "engine.navigation-effect-byte-diff" || !Array.isArray(parsed.items)) throw new Error("ARCHIVE_DIFF_CONFLICT");
      items = parsed.items as Record<string, unknown>[];
    }
    const existingDiff = items.find((item) => item.effectId === plan.effectId);
    if (existingDiff && canonicalJson(existingDiff) !== canonicalJson(diffItem)) throw new Error("ARCHIVE_DIFF_CONFLICT");
    items = [...items.filter((item) => item.effectId !== plan.effectId), diffItem].sort((a, b) => codeUnitCompare(String(a.targetPath), String(b.targetPath)));
    await this.writeDurable(diffPath, `${canonicalJson({ artifactKind: "engine.navigation-effect-byte-diff", items })}\n`);
    const resultPath = resolve(runRoot, "result.json");
    const resultItem = { effectId: plan.effectId, status: "verified", targetPath: plan.targetPath, afterDigest: plan.proposedDigest };
    let results: Record<string, unknown>[] = [];
    if (await exists(resultPath)) {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(await readFile(resultPath, "utf8")); } catch { throw new Error("ARCHIVE_RESULT_CONFLICT"); }
      if (Object.keys(parsed).sort().join("\0") !== ["artifactKind", "results"].sort().join("\0") || parsed.artifactKind !== "engine.navigation-effect-run-result" || !Array.isArray(parsed.results)) throw new Error("ARCHIVE_RESULT_CONFLICT");
      results = parsed.results as Record<string, unknown>[];
    }
    const existingResult = results.find((item) => item.effectId === plan.effectId);
    if (existingResult && canonicalJson(existingResult) !== canonicalJson(resultItem)) throw new Error("ARCHIVE_RESULT_CONFLICT");
    results = [...results.filter((item) => item.effectId !== plan.effectId), resultItem]
      .sort((a, b) => codeUnitCompare(String(a.targetPath), String(b.targetPath)));
    await this.writeDurable(resultPath, `${canonicalJson({ artifactKind: "engine.navigation-effect-run-result", results })}\n`);
  }

  private async writeReceipt(plan: NavigationEffectPlan, planDigest: string, status: EffectReceipt["status"], beforeDigest: string | undefined, archiveManifestDigest: string | undefined, reasonCodes: string[] = []): Promise<EffectReceipt> {
    const journalEntries = await this.journal.load();
    const latest = journalEntries.at(-1);
    const receipt: EffectReceipt = {
      artifactKind: "engine.navigation-effect-receipt",
      effectsContract: "1.0.0",
      receiptId: `receipt:${plan.effectId}`,
      effectId: plan.effectId,
      status,
      operation: plan.operation,
      targetPath: plan.targetPath,
      planDigest,
      ...(beforeDigest ? { beforeDigest } : {}),
      ...(["committed", "no-op"].includes(status) ? { afterDigest: plan.proposedDigest } : {}),
      ...(archiveManifestDigest ? { archiveManifestDigest } : {}),
      journalEntryDigest: latest?.entryDigest ?? planDigest,
      authorityDigest: plan.precondition.authorityDigest,
      policyRef: { ...plan.policyRef },
      occurredAt: this.clock(),
      reasonCodes,
      sourceContentIncluded: false,
    };
    const existing = await this.readReceipt(plan.effectId);
    if (existing) {
      const withoutOccurredAt = (value: EffectReceipt) => { const copy = { ...value }; delete (copy as Partial<EffectReceipt>).occurredAt; return copy; };
      const withoutOccurrenceMetadata = (value: EffectReceipt) => { const copy = withoutOccurredAt(value); delete (copy as Partial<EffectReceipt>).reasonCodes; return copy; };
      const verifyArchivedCopy = async () => {
        if (!plan.archiveRunPath) return;
        const runRoot = await this.safeAbsolute(plan.archiveRunPath, true);
        const archived = await readFile(resolve(runRoot, "receipts", `${effectFileStem(plan.effectId)}.json`), "utf8");
        if (archived !== `${canonicalJson(existing)}\n`) throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`);
      };
      const existingDigest = await canonicalSha256(existing);
      await this.readReceiptVersion(plan, existingDigest);
      if (canonicalJson(withoutOccurredAt(existing)) === canonicalJson(withoutOccurredAt(receipt))) {
        await verifyArchivedCopy();
        return existing;
      }
      const previouslySealed = journalEntries.some((entry) => entry.receiptDigest === existingDigest);
      const validUnsealedPrecommit = existing.status === "committed" && status === "committed" && Array.isArray(existing.reasonCodes) && existing.reasonCodes.length === 0 &&
        typeof existing.occurredAt === "string" && !Number.isNaN(Date.parse(existing.occurredAt)) &&
        canonicalJson(withoutOccurrenceMetadata(existing)) === canonicalJson(withoutOccurrenceMetadata(receipt));
      if (!previouslySealed && !validUnsealedPrecommit) throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`);
      await verifyArchivedCopy();
    }
    const bytes = `${canonicalJson(receipt)}\n`;
    const receiptDigest = await canonicalSha256(receipt);
    await this.writeImmutableReceipt(this.receiptVersionPath(receiptDigest), bytes, plan.effectId);
    await this.writeDurable(this.receiptPath(plan.effectId), bytes);
    if (plan.archiveRunPath) {
      const runRoot = await this.safeAbsolute(plan.archiveRunPath, true);
      await this.writeImmutableReceipt(resolve(runRoot, "receipts", "by-digest", `${receiptDigest.slice(7)}.json`), bytes, plan.effectId);
      await this.writeDurable(resolve(runRoot, "receipts", `${effectFileStem(plan.effectId)}.json`), bytes);
    }
    return receipt;
  }

  private receiptPath(effectId: string): string {
    return resolve(this.stateRoot, "receipts", `${effectFileStem(effectId)}.json`);
  }

  private receiptVersionPath(receiptDigest: string): string {
    if (!/^sha256:[0-9a-f]{64}$/.test(receiptDigest)) throw new Error("RECEIPT_DIGEST_INVALID");
    return resolve(this.stateRoot, "receipts", "by-digest", `${receiptDigest.slice(7)}.json`);
  }

  private async writeImmutableReceipt(path: string, bytes: string, effectId: string): Promise<void> {
    if (await exists(path)) {
      if (await readFile(path, "utf8") !== bytes) throw new Error(`RECEIPT_CORRUPT:${effectId}`);
      return;
    }
    await this.writeDurable(path, bytes, true);
  }

  private async readReceipt(effectId: string): Promise<EffectReceipt | null> {
    try { return JSON.parse(await readFile(this.receiptPath(effectId), "utf8")) as EffectReceipt; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }

  private async readReceiptVersion(plan: NavigationEffectPlan, receiptDigest: string): Promise<EffectReceipt> {
    let bytes: string;
    try { bytes = await readFile(this.receiptVersionPath(receiptDigest), "utf8"); }
    catch { throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`); }
    let receipt: EffectReceipt;
    try { receipt = JSON.parse(bytes) as EffectReceipt; } catch { throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`); }
    if (bytes !== `${canonicalJson(receipt)}\n` || await canonicalSha256(receipt) !== receiptDigest) throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`);
    if (plan.archiveRunPath) {
      const runRoot = await this.safeAbsolute(plan.archiveRunPath, true);
      let archived: string;
      try { archived = await readFile(resolve(runRoot, "receipts", "by-digest", `${receiptDigest.slice(7)}.json`), "utf8"); }
      catch { throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`); }
      if (archived !== bytes) throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`);
    }
    return receipt;
  }

  private async sealTerminalReceipt(plan: NavigationEffectPlan, planDigest: string, state: "STALE" | "ABORTED" | "RECOVERY_REQUIRED", reasonCode: string, receipt: EffectReceipt): Promise<void> {
    await this.journal.append(plan.effectId, state, planDigest, { reasonCode, receiptDigest: await canonicalSha256(receipt) });
  }

  private async validateTerminalReceipt(entries: readonly Awaited<ReturnType<DurableEffectJournal["load"]>>[number][], requireCurrentAlias = true): Promise<EffectReceipt> {
    const plan = entries.find((entry) => entry.plan)?.plan;
    const terminal = entries.at(-1);
    if (!plan || !terminal || !["STALE", "ABORTED", "RECOVERY_REQUIRED"].includes(terminal.state)) throw new Error("JOURNAL_CORRUPT:terminal-receipt-context");
    if (!terminal.receiptDigest) throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`);
    const receipt = await this.readReceiptVersion(plan, terminal.receiptDigest);
    const expectedStatus = terminal.state === "STALE" ? "stale" : terminal.state === "ABORTED" ? "denied" : "recovery-required";
    const allowedKeys = new Set(["artifactKind", "effectsContract", "receiptId", "effectId", "status", "operation", "targetPath", "planDigest",
      "beforeDigest", "archiveManifestDigest", "journalEntryDigest", "authorityDigest", "policyRef", "occurredAt", "reasonCodes", "sourceContentIncluded"]);
    const structurallyValid = Object.keys(receipt).every((key) => allowedKeys.has(key)) && !Object.hasOwn(receipt, "afterDigest") &&
      receipt.artifactKind === "engine.navigation-effect-receipt" && receipt.effectsContract === "1.0.0" &&
      receipt.receiptId === `receipt:${plan.effectId}` && receipt.effectId === plan.effectId && receipt.status === expectedStatus &&
      receipt.operation === plan.operation && receipt.targetPath === plan.targetPath && receipt.planDigest === await canonicalSha256(plan) &&
      receipt.journalEntryDigest === terminal.predecessorDigest && receipt.authorityDigest === plan.precondition.authorityDigest &&
      canonicalJson(receipt.policyRef) === canonicalJson(plan.policyRef) && typeof receipt.occurredAt === "string" && !Number.isNaN(Date.parse(receipt.occurredAt)) &&
      Array.isArray(receipt.reasonCodes) && receipt.reasonCodes.every((reason) => typeof reason === "string") && receipt.reasonCodes.join(",") === terminal.reasonCode &&
      receipt.sourceContentIncluded === false;
    if (!structurallyValid || terminal.receiptDigest !== await canonicalSha256(receipt)) throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`);
    if (requireCurrentAlias) {
      const current = await this.readReceipt(plan.effectId);
      if (!current || canonicalJson(current) !== canonicalJson(receipt)) throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`);
      if (plan.archiveRunPath) {
        const runRoot = await this.safeAbsolute(plan.archiveRunPath, true);
        const archived = await readFile(resolve(runRoot, "receipts", `${effectFileStem(plan.effectId)}.json`), "utf8");
        if (archived !== `${canonicalJson(receipt)}\n`) throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`);
      }
    }
    const archiveRequired = receipt.archiveManifestDigest !== undefined || entries.some((entry) => ["APPLYING", "VERIFIED"].includes(entry.state));
    if (archiveRequired) {
      if (!await this.archiveEvidenceExists(plan)) throw new Error(`ARCHIVE_CORRUPT:${plan.effectId}`);
      const archive = await this.validateArchiveBinding(plan);
      if (!archive.valid || receipt.archiveManifestDigest !== archive.manifestDigest) throw new Error(`ARCHIVE_CORRUPT:${plan.effectId}`);
    }
    return receipt;
  }

  private async validateReceiptHistory(entries: readonly Awaited<ReturnType<DurableEffectJournal["load"]>>[number][]): Promise<void> {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry.receiptDigest) continue;
      if (entry.state === "COMMITTED") continue;
      if (!["STALE", "ABORTED", "RECOVERY_REQUIRED"].includes(entry.state)) throw new Error(`JOURNAL_CORRUPT:receipt-on-nonterminal:${entry.effectId}`);
      await this.validateTerminalReceipt(entries.slice(0, index + 1), index === entries.length - 1);
    }
  }

  private async archiveEvidenceExists(plan: NavigationEffectPlan): Promise<boolean> {
    if (!plan.archiveRunPath) return false;
    const runRoot = await this.safeAbsolute(plan.archiveRunPath, true);
    return exists(resolve(runRoot, "manifest.json"));
  }

  private async archivedBeforeDigest(plan: NavigationEffectPlan): Promise<string | undefined> {
    if (plan.precondition.target === "absent") return undefined;
    if (!plan.archiveRunPath) return undefined;
    const runRoot = await this.safeAbsolute(plan.archiveRunPath, true);
    const path = resolve(runRoot, "before", ...normalizeVaultRelative(plan.targetPath).split("/"));
    const bytes = await this.readTarget(path);
    return bytes === null ? undefined : sha256Bytes(bytes);
  }

  private async validateArchiveBinding(plan: NavigationEffectPlan, complete = false): Promise<{ valid: boolean; beforeDigest?: string; manifestDigest?: string }> {
    if (!plan.archiveRunPath) return { valid: false };
    const runRoot = await this.safeAbsolute(plan.archiveRunPath, true);
    try {
      const manifest = JSON.parse(await readFile(resolve(runRoot, "manifest.json"), "utf8")) as Record<string, unknown>;
      const effects = this.validatedAggregateManifest(manifest);
      const journalPlans = new Map<string, NavigationEffectPlan>();
      for (const entry of await this.journal.load()) if (entry.plan) journalPlans.set(entry.effectId, entry.plan);
      for (const effect of effects) {
        const boundPlan = journalPlans.get(String(effect.effectId));
        if (!boundPlan || boundPlan.archiveRunPath !== plan.archiveRunPath) return { valid: false };
        const expected = await this.archiveEffectBinding(boundPlan);
        if (canonicalJson(effect) !== canonicalJson(expected)) return { valid: false };
        const bytes = await readFile(resolve(runRoot, "bindings", `${effectFileStem(boundPlan.effectId)}.json`), "utf8");
        if (bytes !== `${canonicalJson(expected)}\n`) return { valid: false };
        const boundBefore = await this.readTarget(resolve(runRoot, "before", ...boundPlan.targetPath.split("/")));
        const boundBeforeDigest = boundBefore === null ? null : await sha256Bytes(boundBefore);
        if (boundBeforeDigest !== effect.beforeDigest) return { valid: false };
      }
      const expectedBinding = await this.archiveEffectBinding(plan);
      const binding = effects.find((item) => item.effectId === plan.effectId);
      if (!binding || canonicalJson(binding) !== canonicalJson(expectedBinding)) return { valid: false };
      const bindingBytes = await readFile(resolve(runRoot, "bindings", `${effectFileStem(plan.effectId)}.json`), "utf8");
      if (bindingBytes !== `${canonicalJson(expectedBinding)}\n`) return { valid: false };
      const beforePath = resolve(runRoot, "before", ...normalizeVaultRelative(plan.targetPath).split("/"));
      const before = await this.readTarget(beforePath);
      const expectedBefore = plan.precondition.target === "present" ? plan.precondition.priorDigest : undefined;
      const beforeDigest = before === null ? undefined : await sha256Bytes(before);
      if (beforeDigest !== expectedBefore) return { valid: false };
      const afterPath = resolve(runRoot, "after", ...normalizeVaultRelative(plan.targetPath).split("/"));
      const diffPath = resolve(runRoot, "diff.json");
      const resultPath = resolve(runRoot, "result.json");
      const after = await this.readTarget(afterPath);
      const hasDiff = await exists(diffPath);
      const hasResult = await exists(resultPath);
      const validateCompletedEvidence = complete || after !== null || hasDiff || hasResult;
      if (validateCompletedEvidence) {
        if (!hasDiff || !hasResult) return { valid: false };
        const diff = JSON.parse(await readFile(diffPath, "utf8")) as Record<string, unknown>;
        if (Object.keys(diff).sort().join("\0") !== ["artifactKind", "items"].sort().join("\0") || diff.artifactKind !== "engine.navigation-effect-byte-diff" || !Array.isArray(diff.items)) return { valid: false };
        const diffItems = diff.items as Record<string, unknown>[];
        const validDiffItem = (item: Record<string, unknown>) => Object.keys(item).sort().join("\0") === ["afterByteLength", "afterDigest", "beforeByteLength", "beforeDigest", "effectId", "targetPath"].sort().join("\0") &&
          typeof item.effectId === "string" && CANONICAL_EFFECT_ID.test(item.effectId) && typeof item.targetPath === "string" && validateVaultRelativePath(item.targetPath).valid &&
          (item.beforeDigest === null || typeof item.beforeDigest === "string" && /^sha256:[0-9a-f]{64}$/.test(item.beforeDigest)) &&
          typeof item.afterDigest === "string" && /^sha256:[0-9a-f]{64}$/.test(item.afterDigest) && Number.isInteger(item.beforeByteLength) && Number(item.beforeByteLength) >= 0 && Number.isInteger(item.afterByteLength) && Number(item.afterByteLength) >= 0;
        if (!diffItems.every(validDiffItem) || new Set(diffItems.map((item) => item.effectId)).size !== diffItems.length || new Set(diffItems.map((item) => item.targetPath)).size !== diffItems.length) return { valid: false };
        for (const item of diffItems) {
          const itemBinding = effects.find((effect) => effect.effectId === item.effectId);
          if (!itemBinding || item.targetPath !== itemBinding.targetPath || item.beforeDigest !== itemBinding.beforeDigest || item.afterDigest !== itemBinding.proposedDigest) return { valid: false };
          const itemBefore = await this.readTarget(resolve(runRoot, "before", ...String(item.targetPath).split("/")));
          const itemAfter = await this.readTarget(resolve(runRoot, "after", ...String(item.targetPath).split("/")));
          if ((itemBefore === null ? null : await sha256Bytes(itemBefore)) !== item.beforeDigest || itemAfter === null || await sha256Bytes(itemAfter) !== item.afterDigest ||
              Buffer.byteLength(itemBefore ?? "") !== item.beforeByteLength || Buffer.byteLength(itemAfter) !== item.afterByteLength) return { valid: false };
        }
        const result = JSON.parse(await readFile(resultPath, "utf8")) as Record<string, unknown>;
        if (Object.keys(result).sort().join("\0") !== ["artifactKind", "results"].sort().join("\0") || result.artifactKind !== "engine.navigation-effect-run-result" || !Array.isArray(result.results)) return { valid: false };
        const resultItems = result.results as Record<string, unknown>[];
        const validResultItem = (item: Record<string, unknown>) => Object.keys(item).sort().join("\0") === ["afterDigest", "effectId", "status", "targetPath"].sort().join("\0") &&
          typeof item.effectId === "string" && CANONICAL_EFFECT_ID.test(item.effectId) && item.status === "verified" && typeof item.targetPath === "string" && validateVaultRelativePath(item.targetPath).valid && typeof item.afterDigest === "string" && /^sha256:[0-9a-f]{64}$/.test(item.afterDigest);
        if (!resultItems.every(validResultItem) || new Set(resultItems.map((item) => item.effectId)).size !== resultItems.length || new Set(resultItems.map((item) => item.targetPath)).size !== resultItems.length) return { valid: false };
        if (canonicalJson([...diffItems.map((item) => item.effectId)].sort(codeUnitCompare)) !== canonicalJson([...resultItems.map((item) => item.effectId)].sort(codeUnitCompare))) return { valid: false };
        for (const item of resultItems) {
          const itemBinding = effects.find((effect) => effect.effectId === item.effectId);
          if (!itemBinding || item.targetPath !== itemBinding.targetPath || item.afterDigest !== itemBinding.proposedDigest) return { valid: false };
        }
        if (complete) {
          if (after === null || await sha256Bytes(after) !== plan.proposedDigest) return { valid: false };
          const expectedDiff = { effectId: plan.effectId, targetPath: plan.targetPath, beforeDigest: expectedBefore ?? null, afterDigest: plan.proposedDigest, beforeByteLength: before === null ? 0 : Buffer.byteLength(before), afterByteLength: Buffer.byteLength(after) };
          if (canonicalJson(diffItems.find((item) => item.effectId === plan.effectId)) !== canonicalJson(expectedDiff)) return { valid: false };
          const expectedResult = { effectId: plan.effectId, status: "verified", targetPath: plan.targetPath, afterDigest: plan.proposedDigest };
          if (canonicalJson(resultItems.find((item) => item.effectId === plan.effectId)) !== canonicalJson(expectedResult)) return { valid: false };
        }
      }
      return { valid: true, ...(beforeDigest ? { beforeDigest } : {}), manifestDigest: await canonicalSha256(expectedBinding) };
    } catch { return { valid: false }; }
  }

  private async validateCommittedOperation(entries: readonly Awaited<ReturnType<DurableEffectJournal["load"]>>[number][]): Promise<void> {
    const plan = entries.find((entry) => entry.plan)?.plan;
    if (!plan) throw new Error("JOURNAL_CORRUPT:committed-plan-missing");
    const committed = entries.at(-1);
    if (!committed || committed.state !== "COMMITTED") throw new Error(`JOURNAL_CORRUPT:committed-state:${plan.effectId}`);
    if (!committed.receiptDigest) throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`);
    const receipt = await this.readReceiptVersion(plan, committed.receiptDigest);
    const planDigest = await canonicalSha256(plan);
    const expectedStatus = committed.reasonCode === "BYTE_IDENTICAL" ? "no-op" : "committed";
    const expectedBefore = plan.precondition.target === "present" ? plan.precondition.priorDigest : undefined;
    const expectedReasons = committed.reasonCode ? [committed.reasonCode] : [];
    const requiredKeys = ["artifactKind", "effectsContract", "receiptId", "effectId", "status", "operation", "targetPath",
      "planDigest", "afterDigest", "journalEntryDigest", "authorityDigest", "policyRef", "occurredAt", "reasonCodes", "sourceContentIncluded"];
    if (expectedBefore) requiredKeys.push("beforeDigest");
    if (expectedStatus === "committed") requiredKeys.push("archiveManifestDigest");
    const structurallyValid = Object.keys(receipt).sort().join("\0") === requiredKeys.sort().join("\0") &&
      receipt.artifactKind === "engine.navigation-effect-receipt" && receipt.effectsContract === "1.0.0" &&
      receipt.receiptId === `receipt:${plan.effectId}` && receipt.effectId === plan.effectId && receipt.status === expectedStatus &&
      receipt.operation === plan.operation && receipt.targetPath === plan.targetPath && receipt.planDigest === planDigest &&
      receipt.beforeDigest === expectedBefore && receipt.afterDigest === plan.proposedDigest &&
      receipt.journalEntryDigest === committed.predecessorDigest && receipt.authorityDigest === plan.precondition.authorityDigest &&
      canonicalJson(receipt.policyRef) === canonicalJson(plan.policyRef) && !Number.isNaN(Date.parse(receipt.occurredAt)) &&
      canonicalJson(receipt.reasonCodes) === canonicalJson(expectedReasons) && receipt.sourceContentIncluded === false;
    if (!structurallyValid || committed.receiptDigest !== await canonicalSha256(receipt)) throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`);
    const currentReceipt = await this.readReceipt(plan.effectId);
    if (!currentReceipt || canonicalJson(currentReceipt) !== canonicalJson(receipt)) throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`);
    if (expectedStatus === "committed") {
      const archive = await this.validateArchiveBinding(plan, true);
      if (!archive.valid || receipt.archiveManifestDigest !== archive.manifestDigest) throw new Error(`ARCHIVE_CORRUPT:${plan.effectId}`);
      const runRoot = await this.safeAbsolute(plan.archiveRunPath!, true);
      const archiveReceipt = await readFile(resolve(runRoot, "receipts", `${effectFileStem(plan.effectId)}.json`), "utf8");
      if (archiveReceipt !== `${canonicalJson(receipt)}\n`) throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`);
    }
    const target = await this.readTarget(await this.safeAbsolute(plan.targetPath));
    if (target === null || await sha256Bytes(target) !== plan.proposedDigest) throw new Error(`COMMITTED_TARGET_CORRUPT:${plan.effectId}`);
  }

  execute(request: EffectExecutionRequest): Promise<EffectExecutionResult> {
    return this.enqueue(() => this.executeSerial(request));
  }

  private async executeSerial(request: EffectExecutionRequest): Promise<EffectExecutionResult> {
    const { plan, proposedBytes } = request;
    if (!CANONICAL_EFFECT_ID.test(plan.effectId)) return { status: "denied", effectId: plan.effectId, reasonCodes: ["EFFECT_ID_INVALID"] };
    if (!this.acceptingWrites) return { status: "denied", effectId: plan.effectId, reasonCodes: ["EXECUTOR_SHUTTING_DOWN"] };
    await this.ensureStartupRecovery();
    if (this.recoveryWriteLatched) return { status: "recovery-required", effectId: plan.effectId, reasonCodes: ["RECOVERY_WRITE_LATCHED"] };
    await this.acquireVaultLease();
    await this.validateStateRoot();
    const planDigest = await canonicalSha256(plan);
    if (await sha256Bytes(proposedBytes) !== plan.proposedDigest) return { status: "denied", effectId: plan.effectId, reasonCodes: ["PROPOSED_DIGEST_MISMATCH"] };
    if (!this.preconditionValidator) return { status: "denied", effectId: plan.effectId, reasonCodes: ["PRECONDITION_PROVIDER_MISSING"] };
    const priorEntries = (await this.journal.load()).filter((entry) => entry.effectId === plan.effectId);
    if (priorEntries.length) {
      if (priorEntries.some((entry) => entry.planDigest !== planDigest)) return { status: "conflict", effectId: plan.effectId, reasonCodes: ["EFFECT_ID_CONFLICT"] };
      await this.validateReceiptHistory(priorEntries);
      const latest = priorEntries.at(-1)!;
      if (latest.state === "COMMITTED") {
        await this.validateCommittedOperation(priorEntries);
        const receipt = await this.readReceipt(plan.effectId);
        if (!receipt) return { status: "recovery-required", effectId: plan.effectId, reasonCodes: ["COMMITTED_RECEIPT_MISSING"] };
        return { status: receipt.status === "no-op" ? "no-op" : "committed", effectId: plan.effectId, receipt, reasonCodes: ["IDEMPOTENT_REPLAY"] };
      }
      if (latest.state === "STALE") return { status: "stale", effectId: plan.effectId, receipt: await this.validateTerminalReceipt(priorEntries), reasonCodes: ["IDEMPOTENT_STALE_REPLAY"] };
      if (latest.state === "ABORTED") return { status: "denied", effectId: plan.effectId, receipt: await this.validateTerminalReceipt(priorEntries), reasonCodes: ["IDEMPOTENT_ABORTED_REPLAY"] };
      if (latest.state !== "RECOVERY_REQUIRED") return { status: "recovery-required", effectId: plan.effectId, reasonCodes: ["NONTERMINAL_OPERATION_EXISTS"] };
      await this.validateTerminalReceipt(priorEntries);
    }
    await this.journal.append(plan.effectId, "RECEIVED", planDigest, { plan });
    await this.fault("after-received", plan.effectId);
    await this.journal.append(plan.effectId, "PLANNED", planDigest);
    await this.fault("after-planned", plan.effectId);
    await this.journal.append(plan.effectId, "PREPARED", planDigest);
    await this.fault("after-prepared", plan.effectId);

    let lock: Awaited<ReturnType<NodeNavigationEffectsExecutor["acquireTargetLock"]>> | null = null;
    let archiveManifestDigest: string | undefined;
    try {
      lock = await this.acquireTargetLock(plan);
      const validationReasons = [...await this.preconditionValidator(plan)].sort(codeUnitCompare);
      if (validationReasons.length) {
        await this.journal.append(plan.effectId, "ABORTED", planDigest, { reasonCode: validationReasons.join(",") });
        const receipt = await this.writeReceipt(plan, planDigest, "denied", undefined, undefined, validationReasons);
        await this.sealTerminalReceipt(plan, planDigest, "ABORTED", validationReasons.join(","), receipt);
        return { status: "denied", effectId: plan.effectId, receipt, reasonCodes: validationReasons };
      }
      const targetPath = await this.safeAbsolute(plan.targetPath);
      const before = await this.readTarget(targetPath);
      const beforeDigest = before === null ? undefined : await sha256Bytes(before);
      const preconditionMatches = plan.precondition.target === "absent"
        ? before === null
        : before !== null && beforeDigest === plan.precondition.priorDigest;
      if (!preconditionMatches) {
        await this.journal.append(plan.effectId, "STALE", planDigest, { reasonCode: "TARGET_PRECONDITION_MISMATCH" });
        const receipt = await this.writeReceipt(plan, planDigest, "stale", beforeDigest, undefined, ["TARGET_PRECONDITION_MISMATCH"]);
        await this.sealTerminalReceipt(plan, planDigest, "STALE", "TARGET_PRECONDITION_MISMATCH", receipt);
        return { status: "stale", effectId: plan.effectId, receipt, reasonCodes: ["TARGET_PRECONDITION_MISMATCH"] };
      }
      if (beforeDigest === plan.proposedDigest) {
        const receipt = await this.writeReceipt(plan, planDigest, "no-op", beforeDigest, undefined, ["BYTE_IDENTICAL"]);
        await this.journal.append(plan.effectId, "COMMITTED", planDigest, { reasonCode: "BYTE_IDENTICAL", receiptDigest: await canonicalSha256(receipt) });
        return { status: "no-op", effectId: plan.effectId, receipt, reasonCodes: ["BYTE_IDENTICAL"] };
      }

      await this.ioFaultInjector?.("archive", plan.effectId);
      archiveManifestDigest = await this.archiveBefore(plan, before);
      await this.fault("after-archive", plan.effectId);
      const temporaryRelative = this.temporaryRelative(plan);
      const temporaryPath = await this.safeAbsolute(temporaryRelative);
      await this.journal.append(plan.effectId, "APPLYING", planDigest, { temporaryPath: temporaryRelative });
      await rm(temporaryPath, { force: true });
      await this.safeAbsolute(temporaryRelative);
      await this.ioFaultInjector?.("temporary-write", plan.effectId);
      await this.writeDurable(temporaryPath, proposedBytes, true);
      await this.fault("after-temporary-write", plan.effectId);
      await this.safeAbsolute(plan.targetPath);
      const immediatelyBeforeReplace = await this.readTarget(targetPath);
      const immediateDigest = immediatelyBeforeReplace === null ? undefined : await sha256Bytes(immediatelyBeforeReplace);
      const stillMatches = plan.precondition.target === "absent"
        ? immediatelyBeforeReplace === null
        : immediatelyBeforeReplace !== null && immediateDigest === plan.precondition.priorDigest;
      if (!stillMatches) {
        await this.journal.append(plan.effectId, "STALE", planDigest, { reasonCode: "TARGET_CHANGED_BEFORE_REPLACE", temporaryPath: temporaryRelative });
        const receipt = await this.writeReceipt(plan, planDigest, "stale", immediateDigest, archiveManifestDigest, ["TARGET_CHANGED_BEFORE_REPLACE"]);
        await this.sealTerminalReceipt(plan, planDigest, "STALE", "TARGET_CHANGED_BEFORE_REPLACE", receipt);
        return { status: "stale", effectId: plan.effectId, receipt, reasonCodes: ["TARGET_CHANGED_BEFORE_REPLACE"] };
      }
      await this.ioFaultInjector?.("replace", plan.effectId);
      await rename(temporaryPath, targetPath);
      await this.fault("after-replace", plan.effectId);
      const after = await this.readTarget(targetPath);
      await this.ioFaultInjector?.("verify", plan.effectId);
      if (after === null || await sha256Bytes(after) !== plan.proposedDigest) throw new Error("AFTER_IMAGE_VERIFICATION_FAILED");
      await this.journal.append(plan.effectId, "VERIFIED", planDigest);
      await this.fault("after-verified", plan.effectId);
      await this.writeArchiveAfter(plan, before, after);
      await this.ioFaultInjector?.("receipt", plan.effectId);
      const receipt = await this.writeReceipt(plan, planDigest, "committed", beforeDigest, archiveManifestDigest);
      await this.fault("after-receipt", plan.effectId);
      await this.journal.append(plan.effectId, "COMMITTED", planDigest, { receiptDigest: await canonicalSha256(receipt) });
      await this.writeCheckpoint(false);
      return { status: "committed", effectId: plan.effectId, receipt, reasonCodes: [] };
    } catch (error) {
      if (error instanceof SimulatedEffectCrash) throw error;
      const message = error instanceof Error ? error.message : "EXECUTION_FAILURE";
      if (message.startsWith("PATH_DENIED:")) {
        const reason = message.slice("PATH_DENIED:".length) || "PATH_DENIED";
        await this.journal.append(plan.effectId, "ABORTED", planDigest, { reasonCode: reason });
        const receipt = await this.writeReceipt(plan, planDigest, "denied", plan.precondition.priorDigest, undefined, [reason]);
        await this.sealTerminalReceipt(plan, planDigest, "ABORTED", reason, receipt);
        return { status: "denied", effectId: plan.effectId, receipt, reasonCodes: [reason] };
      }
      await this.journal.append(plan.effectId, "RECOVERY_REQUIRED", planDigest, { reasonCode: "EXECUTION_FAILURE" });
      const receipt = await this.writeReceipt(plan, planDigest, "recovery-required", plan.precondition.priorDigest, archiveManifestDigest, ["EXECUTION_FAILURE"]);
      await this.sealTerminalReceipt(plan, planDigest, "RECOVERY_REQUIRED", "EXECUTION_FAILURE", receipt);
      return { status: "recovery-required", effectId: plan.effectId, receipt, reasonCodes: ["EXECUTION_FAILURE"] };
    } finally {
      await lock?.release();
    }
  }

  async executeMany(requests: readonly EffectExecutionRequest[]): Promise<EffectExecutionResult[]> {
    return this.enqueue(() => this.executeManySerial(requests));
  }

  private async executeManySerial(requests: readonly EffectExecutionRequest[]): Promise<EffectExecutionResult[]> {
    const sorted = [...requests].sort((a, b) => codeUnitCompare(a.plan.targetPath, b.plan.targetPath));
    if (new Set(sorted.map((request) => request.plan.targetPath)).size !== sorted.length) throw new Error("DUPLICATE_BATCH_TARGET");
    const results: EffectExecutionResult[] = [];
    for (const request of sorted) results.push(await this.executeSerial(request));
    return results;
  }

  async rollback(input: { effectId: string; authority: EffectAuthorityBinding; archiveDate: string; runId: string }): Promise<EffectExecutionResult> {
    return this.enqueue(() => this.rollbackSerial(input));
  }

  private async rollbackSerial(input: { effectId: string; authority: EffectAuthorityBinding; archiveDate: string; runId: string }): Promise<EffectExecutionResult> {
    if (input.authority.capability !== "moc:rollback") return { status: "denied", effectId: input.effectId, reasonCodes: ["ROLLBACK_CAPABILITY_DENIED"] };
    const entries = (await this.journal.load()).filter((entry) => entry.effectId === input.effectId);
    const original = entries.find((entry) => entry.plan)?.plan;
    if (!original || entries.at(-1)?.state !== "COMMITTED") return { status: "denied", effectId: input.effectId, reasonCodes: ["ROLLBACK_SOURCE_NOT_COMMITTED"] };
    if (original.precondition.target !== "present" || !original.precondition.priorDigest || !original.archiveRunPath) return { status: "denied", effectId: input.effectId, reasonCodes: ["ROLLBACK_BEFORE_IMAGE_UNAVAILABLE"] };
    const originalRunRoot = await this.safeAbsolute(original.archiveRunPath, true);
    const beforePath = resolve(originalRunRoot, "before", ...normalizeVaultRelative(original.targetPath).split("/"));
    const before = await this.readTarget(beforePath);
    if (before === null || await sha256Bytes(before) !== original.precondition.priorDigest) return { status: "recovery-required", effectId: input.effectId, reasonCodes: ["ROLLBACK_BEFORE_IMAGE_INVALID"] };
    const authorityDigest = await canonicalSha256(input.authority);
    const identity = await canonicalSha256({ originalEffectId: original.effectId, proposedDigest: original.precondition.priorDigest, authorityDigest, archiveDate: input.archiveDate, runId: input.runId });
    const rollbackPlan: NavigationEffectPlan = {
      ...structuredClone(original),
      effectId: `effect:rollback:${identity.slice(7, 39)}`,
      idempotencyKey: `rollback:${identity.slice(7)}`,
      operation: "moc:rollback",
      proposedDigest: original.precondition.priorDigest,
      authority: structuredClone(input.authority),
      precondition: {
        target: "present",
        priorDigest: original.proposedDigest,
        configDigest: original.configDigest,
        authorityDigest,
        authorityEvaluatedAt: this.clock(),
        retentionHold: "clear",
      },
      archiveRunPath: canonicalMocArchiveRunPath(input.archiveDate, input.runId),
    };
    return this.executeSerial({ plan: rollbackPlan, proposedBytes: before });
  }

  recoverStartup(): Promise<RecoverySummary> {
    return this.enqueue(async () => {
      try {
        const summary = await this.recoverStartupSerial();
        this.startupRecoveryChecked = true;
        this.recoveryWriteLatched = !summary.safeToEnableWrites;
        return summary;
      } catch (error) {
        this.startupRecoveryChecked = true;
        this.recoveryWriteLatched = true;
        throw error;
      }
    });
  }

  private async ensureStartupRecovery(): Promise<void> {
    if (this.startupRecoveryChecked) return;
    try {
      const summary = await this.recoverStartupSerial();
      this.startupRecoveryChecked = true;
      this.recoveryWriteLatched = !summary.safeToEnableWrites;
    } catch (error) {
      this.startupRecoveryChecked = true;
      this.recoveryWriteLatched = true;
      throw error;
    }
  }

  private async recoverStartupSerial(): Promise<RecoverySummary> {
    await this.acquireVaultLease();
    await this.validateCheckpoint();
    const entries = [...await this.journal.load()];
    const byEffect = new Map<string, typeof entries>();
    for (const entry of entries) byEffect.set(entry.effectId, [...(byEffect.get(entry.effectId) ?? []), entry]);
    const results: RecoveryResult[] = [];
    for (const effectId of [...byEffect.keys()].sort(codeUnitCompare)) {
      const operationEntries = byEffect.get(effectId)!;
      const latest = operationEntries.at(-1)!;
      const plan = operationEntries.find((entry) => entry.plan)?.plan;
      if (!plan) throw new Error(`JOURNAL_CORRUPT:missing-plan:${effectId}`);
      if (!CANONICAL_EFFECT_ID.test(plan.effectId) || plan.effectId !== effectId) throw new Error(`JOURNAL_CORRUPT:effect-id:${effectId}`);
      await this.validateReceiptHistory(operationEntries);
      if (latest.state === "COMMITTED") { await this.validateCommittedOperation(operationEntries); continue; }
      await this.cleanupStaleTargetLock(plan);
      const planDigest = await canonicalSha256(plan);
      if (latest.state === "STALE") {
        await this.validateTerminalReceipt(operationEntries);
        if (latest.reasonCode === "CONFLICTING_EXTERNAL_BYTES") {
          results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "conflicting-external-bytes", writeCapabilityMayEnable: false, reasonCodes: ["CONFLICTING_EXTERNAL_BYTES"], observed: { proposedDigest: plan.proposedDigest } });
          continue;
        }
        let staleTemporary = operationEntries.map((entry) => entry.temporaryPath).filter(Boolean).at(-1);
        if (staleTemporary) {
          const stalePath = await this.safeAbsolute(staleTemporary);
          const staleBytes = await this.readTarget(stalePath);
          if (staleBytes !== null) {
            const staleDigest = await sha256Bytes(staleBytes);
            if (staleDigest !== plan.proposedDigest) {
              results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "ambiguous-or-corrupt", writeCapabilityMayEnable: false, reasonCodes: ["STALE_TEMP_DIGEST_MISMATCH"], observed: { temporaryDigest: staleDigest, proposedDigest: plan.proposedDigest } });
              continue;
            }
            await rm(stalePath, { force: true });
            await this.writeDurable(resolve(this.stateRoot, "recovery", `${effectFileStem(effectId)}.cleanup.json`), `${canonicalJson({ artifactKind: "engine.effect-recovery-cleanup-receipt", effectId, operation: "remove-verified-stale-temporary", temporaryDigest: staleDigest, occurredAt: this.clock(), sourceContentIncluded: false })}\n`);
            results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "conflicting-external-bytes", writeCapabilityMayEnable: true, reasonCodes: ["VERIFIED_STALE_TEMP_REMOVED"], observed: { temporaryDigest: staleDigest, proposedDigest: plan.proposedDigest } });
          }
        }
        continue;
      }
      if (latest.state === "ABORTED") { await this.validateTerminalReceipt(operationEntries); continue; }
      if (latest.state === "RECOVERY_REQUIRED") await this.validateTerminalReceipt(operationEntries);
      const targetPath = await this.safeAbsolute(plan.targetPath);
      let recordedTemporary: string | undefined;
      for (let index = operationEntries.length - 1; index >= 0; index -= 1) if (operationEntries[index].temporaryPath) { recordedTemporary = operationEntries[index].temporaryPath; break; }
      const temporaryRelative = recordedTemporary ?? this.temporaryRelative(plan);
      const temporaryPath = await this.safeAbsolute(temporaryRelative);
      const target = await this.readTarget(targetPath);
      const temporary = await this.readTarget(temporaryPath);
      const targetDigest = target === null ? undefined : await sha256Bytes(target);
      const temporaryDigest = temporary === null ? undefined : await sha256Bytes(temporary);
      const expectedPresent = plan.precondition.target === "present" ? plan.precondition.priorDigest : undefined;
      const targetIsExpected = plan.precondition.target === "absent" ? target === null : targetDigest === expectedPresent;
      const archive = await this.validateArchiveBinding(plan);
      const archiveBeforeDigest = archive.beforeDigest;
      const archiveValid = archive.valid;
      const observed = {
        ...(targetDigest ? { targetDigest } : {}),
        ...(temporaryDigest ? { temporaryDigest } : {}),
        ...(archiveBeforeDigest ? { archiveBeforeDigest } : {}),
        proposedDigest: plan.proposedDigest,
      };

      if (targetDigest === plan.proposedDigest) {
        if (!archiveValid) {
          await this.journal.append(effectId, "RECOVERY_REQUIRED", planDigest, { reasonCode: "ARCHIVE_BEFORE_INVALID" });
          const receipt = await this.writeReceipt(plan, planDigest, "recovery-required", plan.precondition.priorDigest, undefined, ["ARCHIVE_BEFORE_INVALID"]);
          await this.sealTerminalReceipt(plan, planDigest, "RECOVERY_REQUIRED", "ARCHIVE_BEFORE_INVALID", receipt);
          results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "ambiguous-or-corrupt", writeCapabilityMayEnable: false, reasonCodes: ["ARCHIVE_BEFORE_INVALID"], observed });
          continue;
        }
        if (latest.state !== "VERIFIED") await this.journal.append(effectId, "VERIFIED", planDigest, { reasonCode: "RECOVERY_VERIFIED_AFTER_IMAGE" });
        await this.writeArchiveAfter(plan, plan.precondition.target === "present" ? await readFile(resolve(await this.safeAbsolute(plan.archiveRunPath!, true), "before", ...normalizeVaultRelative(plan.targetPath).split("/")), "utf8") : null, target!);
        const receipt = await this.writeReceipt(plan, planDigest, "committed", plan.precondition.priorDigest, archive.manifestDigest, ["RECOVERY_FINISHED_COMMIT"]);
        await this.journal.append(effectId, "COMMITTED", planDigest, { reasonCode: "RECOVERY_FINISHED_COMMIT", receiptDigest: await canonicalSha256(receipt) });
        if (temporary !== null) await rm(temporaryPath, { force: true });
        results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "effect-present-verified", writeCapabilityMayEnable: true, reasonCodes: ["RECOVERY_FINISHED_COMMIT"], observed });
        continue;
      }
      if (targetIsExpected && temporaryDigest === plan.proposedDigest) {
        if (!archiveValid) {
          await this.journal.append(effectId, "RECOVERY_REQUIRED", planDigest, { reasonCode: "ARCHIVE_BEFORE_INVALID" });
          const receipt = await this.writeReceipt(plan, planDigest, "recovery-required", plan.precondition.priorDigest, undefined, ["ARCHIVE_BEFORE_INVALID"]);
          await this.sealTerminalReceipt(plan, planDigest, "RECOVERY_REQUIRED", "ARCHIVE_BEFORE_INVALID", receipt);
          results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "ambiguous-or-corrupt", writeCapabilityMayEnable: false, reasonCodes: ["ARCHIVE_BEFORE_INVALID"], observed });
          continue;
        }
        await rename(temporaryPath, targetPath);
        const verified = await this.readTarget(targetPath);
        if (verified === null || await sha256Bytes(verified) !== plan.proposedDigest) throw new Error(`RECOVERY_AMBIGUOUS:${effectId}`);
        await this.journal.append(effectId, "VERIFIED", planDigest, { reasonCode: "RECOVERY_APPLIED_PREPARED_TEMP" });
        const recoveredBefore = plan.precondition.target === "present" ? await readFile(resolve(await this.safeAbsolute(plan.archiveRunPath!, true), "before", ...normalizeVaultRelative(plan.targetPath).split("/")), "utf8") : null;
        await this.writeArchiveAfter(plan, recoveredBefore, verified);
        const receipt = await this.writeReceipt(plan, planDigest, "committed", plan.precondition.priorDigest, archive.manifestDigest, ["RECOVERY_APPLIED_PREPARED_TEMP"]);
        await this.journal.append(effectId, "COMMITTED", planDigest, { reasonCode: "RECOVERY_APPLIED_PREPARED_TEMP", receiptDigest: await canonicalSha256(receipt) });
        results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "effect-present-verified", writeCapabilityMayEnable: true, reasonCodes: ["RECOVERY_APPLIED_PREPARED_TEMP"], observed });
        continue;
      }
      if (targetIsExpected && temporary === null) {
        if (latest.state !== "RECOVERY_REQUIRED") {
          await this.journal.append(effectId, "RECOVERY_REQUIRED", planDigest, { reasonCode: "REPLAN_REQUIRED" });
          const receipt = await this.writeReceipt(plan, planDigest, "recovery-required", plan.precondition.priorDigest, undefined, ["REPLAN_REQUIRED"]);
          await this.sealTerminalReceipt(plan, planDigest, "RECOVERY_REQUIRED", "REPLAN_REQUIRED", receipt);
        }
        results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "effect-absent-retryable", writeCapabilityMayEnable: false, reasonCodes: ["REPLAN_REQUIRED"], observed });
        continue;
      }
      await this.journal.append(effectId, "STALE", planDigest, { reasonCode: "CONFLICTING_EXTERNAL_BYTES" });
      const receipt = await this.writeReceipt(plan, planDigest, "stale", targetDigest, archive.manifestDigest, ["CONFLICTING_EXTERNAL_BYTES"]);
      await this.sealTerminalReceipt(plan, planDigest, "STALE", "CONFLICTING_EXTERNAL_BYTES", receipt);
      results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "conflicting-external-bytes", writeCapabilityMayEnable: false, reasonCodes: ["CONFLICTING_EXTERNAL_BYTES"], observed });
    }
    const safeToEnableWrites = results.every((result) => result.writeCapabilityMayEnable);
    await this.writeCheckpoint(false);
    return { safeToEnableWrites, results };
  }
}
