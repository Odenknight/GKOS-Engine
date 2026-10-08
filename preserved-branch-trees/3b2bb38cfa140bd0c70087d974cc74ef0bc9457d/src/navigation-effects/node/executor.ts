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
  private readonly preparedRunPlans = new Map<string, readonly NavigationEffectPlan[]>();

  constructor(options: NodeEffectsExecutorOptions) {
    if (!isAbsolute(options.vaultRoot)) throw new Error("Vault root must be absolute.");
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
    await this.writeCheckpoint(true);
    await this.releaseVaultLease();
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
    const safeId = plan.effectId.replace(/[^0-9A-Za-z._-]/g, "_");
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
    await this.writeDurable(resolve(this.stateRoot, "recovery", `${plan.effectId.replace(/[^0-9A-Za-z._-]/g, "_")}.lock-cleanup.json`), `${canonicalJson({ artifactKind: "engine.effect-recovery-cleanup-receipt", effectId: plan.effectId, operation: "remove-verified-stale-target-lock", lockDigest: digest, occurredAt: this.clock(), sourceContentIncluded: false })}\n`);
  }

  private async archiveBefore(plan: NavigationEffectPlan, currentBytes: string | null): Promise<string> {
    if (!plan.archiveRunPath || !/^_archive\/moc-runs\/\d{4}-\d{2}-\d{2}\/[0-9a-z][0-9a-z._-]{0,127}$/.test(plan.archiveRunPath)) throw new Error("ARCHIVE_PATH_REQUIRED");
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
    const plans = this.preparedRunPlans.get(plan.archiveRunPath) ?? [plan];
    const effects = [];
    for (const item of [...plans].sort((a, b) => codeUnitCompare(a.targetPath, b.targetPath))) effects.push({
      effectId: item.effectId,
      planDigest: await canonicalSha256(item),
      targetPath: normalizeVaultRelative(item.targetPath),
      beforeDigest: item.precondition.priorDigest ?? null,
      proposedDigest: item.proposedDigest,
      sourceSnapshotDigest: item.sourceSnapshotDigest,
      corpusDigest: item.corpusDigest,
      configDigest: item.configDigest,
      policyDigest: item.policyRef.digest,
      authorityDigest: item.precondition.authorityDigest,
    });
    const manifest = {
      artifactKind: "engine.moc-effect-archive-manifest",
      effectsContract: "1.0.0",
      effects,
    };
    const bytes = `${canonicalJson(manifest)}\n`;
    const manifestPath = resolve(runRoot, "manifest.json");
    if (await exists(manifestPath)) {
      const existing = await readFile(manifestPath, "utf8");
      if (existing !== bytes) {
        let parsed: { effects?: Record<string, unknown>[] };
        try { parsed = JSON.parse(existing); } catch { throw new Error("ARCHIVE_RUN_CONFLICT"); }
        const expected = effects.find((effect) => effect.effectId === plan.effectId)!;
        const bound = parsed.effects?.find((effect) => effect.effectId === plan.effectId);
        if (!bound || canonicalJson(bound) !== canonicalJson(expected)) throw new Error("ARCHIVE_RUN_CONFLICT");
        return canonicalSha256(parsed);
      }
    } else await this.writeDurable(manifestPath, bytes);
    return canonicalSha256(manifest);
  }

  private async writeArchiveAfter(plan: NavigationEffectPlan, before: string | null, after: string): Promise<void> {
    const runRoot = await this.safeAbsolute(plan.archiveRunPath!, true);
    const targetParts = normalizeVaultRelative(plan.targetPath).split("/");
    await this.writeDurable(resolve(runRoot, "after", ...targetParts), after);
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
    try { items = (JSON.parse(await readFile(diffPath, "utf8")) as { items?: Record<string, unknown>[] }).items ?? []; } catch {}
    items = [...items.filter((item) => item.effectId !== plan.effectId), diffItem].sort((a, b) => codeUnitCompare(String(a.targetPath), String(b.targetPath)));
    await this.writeDurable(diffPath, `${canonicalJson({ artifactKind: "engine.navigation-effect-byte-diff", items })}\n`);
    const resultPath = resolve(runRoot, "result.json");
    let results: Record<string, unknown>[] = [];
    try { results = (JSON.parse(await readFile(resultPath, "utf8")) as { results?: Record<string, unknown>[] }).results ?? []; } catch {}
    results = [...results.filter((item) => item.effectId !== plan.effectId), { effectId: plan.effectId, status: "verified", targetPath: plan.targetPath, afterDigest: plan.proposedDigest }]
      .sort((a, b) => codeUnitCompare(String(a.targetPath), String(b.targetPath)));
    await this.writeDurable(resultPath, `${canonicalJson({ artifactKind: "engine.navigation-effect-run-result", results })}\n`);
  }

  private async writeReceipt(plan: NavigationEffectPlan, planDigest: string, status: EffectReceipt["status"], beforeDigest: string | undefined, archiveManifestDigest: string | undefined, reasonCodes: string[] = []): Promise<EffectReceipt> {
    const latest = (await this.journal.load()).at(-1);
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
    const bytes = `${canonicalJson(receipt)}\n`;
    await this.writeDurable(resolve(this.stateRoot, "receipts", `${plan.effectId.replace(/[^0-9A-Za-z._-]/g, "_")}.json`), bytes);
    if (plan.archiveRunPath) {
      const runRoot = await this.safeAbsolute(plan.archiveRunPath, true);
      await this.writeDurable(resolve(runRoot, "receipts", `${plan.effectId.replace(/[^0-9A-Za-z._-]/g, "_")}.json`), bytes);
    }
    return receipt;
  }

  private receiptPath(effectId: string): string {
    return resolve(this.stateRoot, "receipts", `${effectId.replace(/[^0-9A-Za-z._-]/g, "_")}.json`);
  }

  private async readReceipt(effectId: string): Promise<EffectReceipt | null> {
    try { return JSON.parse(await readFile(this.receiptPath(effectId), "utf8")) as EffectReceipt; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }

  private async archivedBeforeDigest(plan: NavigationEffectPlan): Promise<string | undefined> {
    if (plan.precondition.target === "absent") return undefined;
    if (!plan.archiveRunPath) return undefined;
    const runRoot = await this.safeAbsolute(plan.archiveRunPath, true);
    const path = resolve(runRoot, "before", ...normalizeVaultRelative(plan.targetPath).split("/"));
    const bytes = await this.readTarget(path);
    return bytes === null ? undefined : sha256Bytes(bytes);
  }

  private async validateArchiveBinding(plan: NavigationEffectPlan): Promise<{ valid: boolean; beforeDigest?: string; manifestDigest?: string }> {
    if (!plan.archiveRunPath) return { valid: false };
    const runRoot = await this.safeAbsolute(plan.archiveRunPath, true);
    let manifest: Record<string, unknown>;
    try { manifest = JSON.parse(await readFile(resolve(runRoot, "manifest.json"), "utf8")); }
    catch { return { valid: false } }
    const beforeDigest = await this.archivedBeforeDigest(plan);
    const expectedBefore = plan.precondition.target === "present" ? plan.precondition.priorDigest : undefined;
    const effects = Array.isArray(manifest.effects) ? manifest.effects as Record<string, unknown>[] : [];
    const binding = effects.find((item) => item.effectId === plan.effectId);
    const valid = manifest.artifactKind === "engine.moc-effect-archive-manifest"
      && binding?.planDigest === await canonicalSha256(plan)
      && binding?.targetPath === normalizeVaultRelative(plan.targetPath)
      && binding?.proposedDigest === plan.proposedDigest
      && binding?.beforeDigest === (expectedBefore ?? null)
      && beforeDigest === expectedBefore;
    return { valid, ...(beforeDigest ? { beforeDigest } : {}), manifestDigest: await canonicalSha256(manifest) };
  }

  private async validateCommittedOperation(entries: readonly Awaited<ReturnType<DurableEffectJournal["load"]>>[number][]): Promise<void> {
    const plan = entries.find((entry) => entry.plan)?.plan;
    if (!plan) throw new Error("JOURNAL_CORRUPT:committed-plan-missing");
    const receipt = await this.readReceipt(plan.effectId);
    if (!receipt || receipt.effectId !== plan.effectId || receipt.planDigest !== await canonicalSha256(plan) || receipt.sourceContentIncluded !== false) throw new Error(`RECEIPT_CORRUPT:${plan.effectId}`);
    if (["moc:replace", "moc:rollback"].includes(plan.operation)) {
      const archive = await this.validateArchiveBinding(plan);
      if (!archive.valid || receipt.archiveManifestDigest !== archive.manifestDigest) throw new Error(`ARCHIVE_CORRUPT:${plan.effectId}`);
    }
  }

  async execute(request: EffectExecutionRequest): Promise<EffectExecutionResult> {
    if (!this.acceptingWrites) return { status: "denied", effectId: request.plan.effectId, reasonCodes: ["EXECUTOR_SHUTTING_DOWN"] };
    await this.acquireVaultLease();
    await this.validateStateRoot();
    const { plan, proposedBytes } = request;
    const planDigest = await canonicalSha256(plan);
    if (await sha256Bytes(proposedBytes) !== plan.proposedDigest) return { status: "denied", effectId: plan.effectId, reasonCodes: ["PROPOSED_DIGEST_MISMATCH"] };
    if (!this.preconditionValidator) return { status: "denied", effectId: plan.effectId, reasonCodes: ["PRECONDITION_PROVIDER_MISSING"] };
    const priorEntries = (await this.journal.load()).filter((entry) => entry.effectId === plan.effectId);
    if (priorEntries.length) {
      if (priorEntries.some((entry) => entry.planDigest !== planDigest)) return { status: "conflict", effectId: plan.effectId, reasonCodes: ["EFFECT_ID_CONFLICT"] };
      const latest = priorEntries.at(-1)!;
      if (latest.state === "COMMITTED") {
        const receipt = await this.readReceipt(plan.effectId);
        if (!receipt) return { status: "recovery-required", effectId: plan.effectId, reasonCodes: ["COMMITTED_RECEIPT_MISSING"] };
        return { status: receipt.status === "no-op" ? "no-op" : "committed", effectId: plan.effectId, receipt, reasonCodes: ["IDEMPOTENT_REPLAY"] };
      }
      if (latest.state === "STALE") return { status: "stale", effectId: plan.effectId, receipt: await this.readReceipt(plan.effectId) ?? undefined, reasonCodes: ["IDEMPOTENT_STALE_REPLAY"] };
      if (latest.state === "ABORTED") return { status: "denied", effectId: plan.effectId, receipt: await this.readReceipt(plan.effectId) ?? undefined, reasonCodes: ["IDEMPOTENT_ABORTED_REPLAY"] };
      if (latest.state !== "RECOVERY_REQUIRED") return { status: "recovery-required", effectId: plan.effectId, reasonCodes: ["NONTERMINAL_OPERATION_EXISTS"] };
    }
    await this.journal.append(plan.effectId, "RECEIVED", planDigest, { plan });
    await this.fault("after-received", plan.effectId);
    await this.journal.append(plan.effectId, "PLANNED", planDigest);
    await this.fault("after-planned", plan.effectId);
    await this.journal.append(plan.effectId, "PREPARED", planDigest);
    await this.fault("after-prepared", plan.effectId);

    let lock: Awaited<ReturnType<NodeNavigationEffectsExecutor["acquireTargetLock"]>> | null = null;
    try {
      lock = await this.acquireTargetLock(plan);
      const validationReasons = [...await this.preconditionValidator(plan)].sort(codeUnitCompare);
      if (validationReasons.length) {
        await this.journal.append(plan.effectId, "ABORTED", planDigest, { reasonCode: validationReasons.join(",") });
        const receipt = await this.writeReceipt(plan, planDigest, "denied", undefined, undefined, validationReasons);
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
        return { status: "stale", effectId: plan.effectId, receipt, reasonCodes: ["TARGET_PRECONDITION_MISMATCH"] };
      }
      if (beforeDigest === plan.proposedDigest) {
        const receipt = await this.writeReceipt(plan, planDigest, "no-op", beforeDigest, undefined, ["BYTE_IDENTICAL"]);
        await this.journal.append(plan.effectId, "COMMITTED", planDigest, { reasonCode: "BYTE_IDENTICAL" });
        return { status: "no-op", effectId: plan.effectId, receipt, reasonCodes: ["BYTE_IDENTICAL"] };
      }

      await this.ioFaultInjector?.("archive", plan.effectId);
      const archiveManifestDigest = await this.archiveBefore(plan, before);
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
      await this.journal.append(plan.effectId, "COMMITTED", planDigest);
      await this.writeCheckpoint(false);
      return { status: "committed", effectId: plan.effectId, receipt, reasonCodes: [] };
    } catch (error) {
      if (error instanceof SimulatedEffectCrash) throw error;
      const message = error instanceof Error ? error.message : "EXECUTION_FAILURE";
      if (message.startsWith("PATH_DENIED:")) {
        const reason = message.slice("PATH_DENIED:".length) || "PATH_DENIED";
        await this.journal.append(plan.effectId, "ABORTED", planDigest, { reasonCode: reason });
        const receipt = await this.writeReceipt(plan, planDigest, "denied", plan.precondition.priorDigest, undefined, [reason]);
        return { status: "denied", effectId: plan.effectId, receipt, reasonCodes: [reason] };
      }
      await this.journal.append(plan.effectId, "RECOVERY_REQUIRED", planDigest, { reasonCode: "EXECUTION_FAILURE" });
      const receipt = await this.writeReceipt(plan, planDigest, "recovery-required", plan.precondition.priorDigest, undefined, ["EXECUTION_FAILURE"]);
      return { status: "recovery-required", effectId: plan.effectId, receipt, reasonCodes: ["EXECUTION_FAILURE"] };
    } finally {
      await lock?.release();
    }
  }

  async executeMany(requests: readonly EffectExecutionRequest[]): Promise<EffectExecutionResult[]> {
    const sorted = [...requests].sort((a, b) => codeUnitCompare(a.plan.targetPath, b.plan.targetPath));
    if (new Set(sorted.map((request) => request.plan.targetPath)).size !== sorted.length) throw new Error("DUPLICATE_BATCH_TARGET");
    const groups = new Map<string, NavigationEffectPlan[]>();
    for (const request of sorted) {
      if (!request.plan.archiveRunPath) continue;
      groups.set(request.plan.archiveRunPath, [...(groups.get(request.plan.archiveRunPath) ?? []), request.plan]);
    }
    for (const [runPath, plans] of groups) this.preparedRunPlans.set(runPath, plans);
    const results: EffectExecutionResult[] = [];
    try {
      for (const request of sorted) results.push(await this.execute(request));
      return results;
    } finally {
      for (const runPath of groups.keys()) this.preparedRunPlans.delete(runPath);
    }
  }

  async rollback(input: { effectId: string; authority: EffectAuthorityBinding; archiveDate: string; runId: string }): Promise<EffectExecutionResult> {
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
    return this.execute({ plan: rollbackPlan, proposedBytes: before });
  }

  async recoverStartup(): Promise<RecoverySummary> {
    await this.acquireVaultLease();
    await this.validateCheckpoint();
    const entries = [...await this.journal.load()];
    const byEffect = new Map<string, typeof entries>();
    for (const entry of entries) byEffect.set(entry.effectId, [...(byEffect.get(entry.effectId) ?? []), entry]);
    const results: RecoveryResult[] = [];
    for (const effectId of [...byEffect.keys()].sort(codeUnitCompare)) {
      const operationEntries = byEffect.get(effectId)!;
      const latest = operationEntries.at(-1)!;
      if (latest.state === "COMMITTED") { await this.validateCommittedOperation(operationEntries); continue; }
      const plan = operationEntries.find((entry) => entry.plan)?.plan;
      if (!plan) throw new Error(`JOURNAL_CORRUPT:missing-plan:${effectId}`);
      await this.cleanupStaleTargetLock(plan);
      const planDigest = await canonicalSha256(plan);
      if (latest.state === "STALE") {
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
            await this.writeDurable(resolve(this.stateRoot, "recovery", `${effectId.replace(/[^0-9A-Za-z._-]/g, "_")}.cleanup.json`), `${canonicalJson({ artifactKind: "engine.effect-recovery-cleanup-receipt", effectId, operation: "remove-verified-stale-temporary", temporaryDigest: staleDigest, occurredAt: this.clock(), sourceContentIncluded: false })}\n`);
            results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "conflicting-external-bytes", writeCapabilityMayEnable: true, reasonCodes: ["VERIFIED_STALE_TEMP_REMOVED"], observed: { temporaryDigest: staleDigest, proposedDigest: plan.proposedDigest } });
          }
        }
        continue;
      }
      if (latest.state === "ABORTED") continue;
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
          results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "ambiguous-or-corrupt", writeCapabilityMayEnable: false, reasonCodes: ["ARCHIVE_BEFORE_INVALID"], observed });
          continue;
        }
        if (latest.state !== "VERIFIED") await this.journal.append(effectId, "VERIFIED", planDigest, { reasonCode: "RECOVERY_VERIFIED_AFTER_IMAGE" });
        await this.writeArchiveAfter(plan, plan.precondition.target === "present" ? await readFile(resolve(await this.safeAbsolute(plan.archiveRunPath!, true), "before", ...normalizeVaultRelative(plan.targetPath).split("/")), "utf8") : null, target!);
        await this.writeReceipt(plan, planDigest, "committed", plan.precondition.priorDigest, archive.manifestDigest, ["RECOVERY_FINISHED_COMMIT"]);
        await this.journal.append(effectId, "COMMITTED", planDigest, { reasonCode: "RECOVERY_FINISHED_COMMIT" });
        if (temporary !== null) await rm(temporaryPath, { force: true });
        results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "effect-present-verified", writeCapabilityMayEnable: true, reasonCodes: ["RECOVERY_FINISHED_COMMIT"], observed });
        continue;
      }
      if (targetIsExpected && temporaryDigest === plan.proposedDigest) {
        if (!archiveValid) {
          await this.journal.append(effectId, "RECOVERY_REQUIRED", planDigest, { reasonCode: "ARCHIVE_BEFORE_INVALID" });
          results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "ambiguous-or-corrupt", writeCapabilityMayEnable: false, reasonCodes: ["ARCHIVE_BEFORE_INVALID"], observed });
          continue;
        }
        await rename(temporaryPath, targetPath);
        const verified = await this.readTarget(targetPath);
        if (verified === null || await sha256Bytes(verified) !== plan.proposedDigest) throw new Error(`RECOVERY_AMBIGUOUS:${effectId}`);
        await this.journal.append(effectId, "VERIFIED", planDigest, { reasonCode: "RECOVERY_APPLIED_PREPARED_TEMP" });
        const recoveredBefore = plan.precondition.target === "present" ? await readFile(resolve(await this.safeAbsolute(plan.archiveRunPath!, true), "before", ...normalizeVaultRelative(plan.targetPath).split("/")), "utf8") : null;
        await this.writeArchiveAfter(plan, recoveredBefore, verified);
        await this.writeReceipt(plan, planDigest, "committed", plan.precondition.priorDigest, archive.manifestDigest, ["RECOVERY_APPLIED_PREPARED_TEMP"]);
        await this.journal.append(effectId, "COMMITTED", planDigest, { reasonCode: "RECOVERY_APPLIED_PREPARED_TEMP" });
        results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "effect-present-verified", writeCapabilityMayEnable: true, reasonCodes: ["RECOVERY_APPLIED_PREPARED_TEMP"], observed });
        continue;
      }
      if (targetIsExpected && temporary === null) {
        if (latest.state !== "RECOVERY_REQUIRED") await this.journal.append(effectId, "RECOVERY_REQUIRED", planDigest, { reasonCode: "REPLAN_REQUIRED" });
        results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "effect-absent-retryable", writeCapabilityMayEnable: false, reasonCodes: ["REPLAN_REQUIRED"], observed });
        continue;
      }
      await this.journal.append(effectId, "STALE", planDigest, { reasonCode: "CONFLICTING_EXTERNAL_BYTES" });
      results.push({ artifactKind: "engine.navigation-effect-recovery-result", effectsContract: "1.0.0", effectId, classification: "conflicting-external-bytes", writeCapabilityMayEnable: true, reasonCodes: ["CONFLICTING_EXTERNAL_BYTES"], observed });
    }
    const safeToEnableWrites = results.every((result) => result.writeCapabilityMayEnable);
    await this.writeCheckpoint(false);
    return { safeToEnableWrites, results };
  }
}
