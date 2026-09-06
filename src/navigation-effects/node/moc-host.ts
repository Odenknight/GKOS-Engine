import { lstat, mkdir, open, readFile, realpath, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, relative, isAbsolute } from "node:path";
import { canonicalJson, canonicalSha256, sha256Bytes } from "../../canonical";
import type { NavigationSnapshot, VaultNavigationConfig } from "../../navigation";
import { ManagedMocCoordinator, type MocReconciliationIntent } from "../coordinator";
import { planManagedMocBatch } from "../moc-batch";
import { parseGeneratedMocRegion } from "../markers";
import { validateVaultRelativePath } from "../path-policy";
import type { EffectAuthorityBinding, EffectsPolicyRef, MocOwnershipBinding, NavigationEffectPlan } from "../types";
import { NodeNavigationEffectsExecutor, type NodeEffectsExecutorOptions } from "./executor";

export interface ManagedMocHostSnapshot {
  snapshot: NavigationSnapshot;
  config: VaultNavigationConfig;
  policyRef: EffectsPolicyRef;
  allowedSensitivities: readonly string[];
  targets: readonly { path: string; ownership: MocOwnershipBinding; authority: EffectAuthorityBinding }[];
}
interface HostState {
  version: "managed-moc-host/1";
  revision: number;
  intent: MocReconciliationIntent | null;
  ownership: Record<string, MocOwnershipBinding>;
  pending: { path: string; effectId: string; proposedDigest: string; ownership: MocOwnershipBinding } | null;
}
export interface NodeManagedMocHostOptions {
  vaultRoot: string;
  pathThreatModel: "cooperative-vault";
  /** Validated current graph/index snapshot. No authority is inferred from content. */
  snapshot: (intent: MocReconciliationIntent) => Promise<ManagedMocHostSnapshot>;
  /** Mandatory live grant/config/policy/sensitivity/retention validation. */
  validatePreconditions: NonNullable<NodeEffectsExecutorOptions["preconditionValidator"]>;
  /** Publish committed deltas; rejection retains reconciliation intent for retry. */
  onCommitted?: (path: string, digest: string, effectId: string) => Promise<void>;
  clock?: () => string;
  faultInjector?: (point: "after-effect-before-ownership") => void | Promise<void>;
}

/** One explicit cooperative-vault host. Construction performs no I/O.
 * Host clocks/watchers call notify/tick; start performs recovery before writes.
 */
export class NodeManagedMocHost {
  readonly coordinator: ManagedMocCoordinator;
  readonly executor: NodeNavigationEffectsExecutor;
  private state: HostState | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly stateDirectory: string;
  private closed = false;
  private attemptedStart = false;
  private readonly clock: () => string;
  constructor(private readonly options: NodeManagedMocHostOptions) {
    if (typeof options.snapshot !== "function" || typeof options.validatePreconditions !== "function") throw new Error("MOC_HOST_PROVIDERS_REQUIRED");
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.executor = new NodeNavigationEffectsExecutor({ vaultRoot: options.vaultRoot, pathThreatModel: options.pathThreatModel, clock: this.clock, preconditionValidator: options.validatePreconditions });
    this.stateDirectory = resolve(options.vaultRoot, ".gkx/effects");
    this.coordinator = new ManagedMocCoordinator({
      loadIntent: async () => { await this.initialize(); return structuredClone(this.state!.intent); },
      saveIntent: async intent => { await this.mutate(s => { s.intent = structuredClone(intent); }); },
      recover: async () => {
        const result = await this.executor.recoverStartup();
        if (!result.safeToEnableWrites) return false;
        await this.recoverOwnership();
        return true;
      },
      reconcile: intent => this.reconcile(intent),
    });
  }
  private async checkedStatePath(name: string): Promise<string> {
    if (!/^[a-zA-Z0-9.-]+$/.test(name)) throw new Error("INVALID_HOST_STATE_NAME");
    const root = await realpath(this.options.vaultRoot);
    for (const suffix of [".gkx", ".gkx/effects", `.gkx/effects/${name}`]) {
      const path = resolve(this.options.vaultRoot, suffix);
      try {
        if ((await lstat(path)).isSymbolicLink()) throw new Error("HOST_STATE_LINK");
        const rel = relative(root, await realpath(path));
        if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("HOST_STATE_ESCAPE");
      } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    }
    return resolve(this.stateDirectory, name);
  }
  private async initialize() {
    if (this.state) return;
    await this.executor.acquireVaultLease();
    const path = await this.checkedStatePath("moc-host.json");
    try {
      const envelope = JSON.parse(await readFile(path, "utf8"));
      const s = envelope.state as HostState;
      if (!s || s.version !== "managed-moc-host/1" || !Number.isSafeInteger(s.revision) || s.revision < 0 || !s.ownership || typeof s.ownership !== "object" || Array.isArray(s.ownership) || envelope.digest !== await canonicalSha256(s)) throw new Error("HOST_STATE_CORRUPT");
      for (const [p, o] of Object.entries(s.ownership)) if (!validateVaultRelativePath(p).valid || o.targetPath !== p || !["unmanaged", "fully-managed", "region-managed"].includes(o.ownership)) throw new Error("HOST_OWNERSHIP_CORRUPT");
      if (s.pending && (!validateVaultRelativePath(s.pending.path).valid || !/^effect:[0-9a-f]{32}$/.test(s.pending.effectId) || !/^sha256:[0-9a-f]{64}$/.test(s.pending.proposedDigest) || s.pending.ownership?.targetPath !== s.pending.path)) throw new Error("HOST_PENDING_CORRUPT");
      this.state = s;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      // Missing host metadata alongside an existing effect history is not a fresh vault.
      if ((await this.executor.journal.load()).length) throw new Error("HOST_STATE_MISSING_WITH_HISTORY");
      this.state = { version: "managed-moc-host/1", revision: 0, intent: null, ownership: {}, pending: null };
      await this.mutate(() => {});
    }
  }
  private mutate(update: (state: HostState) => void): Promise<void> {
    const task = this.queue.then(async () => {
      if (!this.state) throw new Error("HOST_NOT_INITIALIZED");
      const next = structuredClone(this.state); update(next); next.revision++;
      if (!Number.isSafeInteger(next.revision)) throw new Error("HOST_SEQUENCE_EXHAUSTED");
      const bytes = canonicalJson({ state: next, digest: await canonicalSha256(next) }) + "\n";
      await this.checkedStatePath("moc-host.json");
      await mkdir(this.stateDirectory, { recursive: true });
      const name = `moc-host-${randomUUID()}.tmp`;
      const temp = await this.checkedStatePath(name);
      const handle = await open(temp, "wx", 0o600);
      try { await handle.writeFile(bytes, "utf8"); await handle.sync(); } finally { await handle.close(); }
      await rename(await this.checkedStatePath(name), await this.checkedStatePath("moc-host.json"));
      this.state = next;
    });
    this.queue = task.catch(() => {});
    return task;
  }
  private async recoverOwnership() {
    const pending = this.state!.pending;
    if (!pending) return;
    const history = await this.executor.journal.load();
    const entries = history.filter(e => e.effectId === pending.effectId);
    const terminal = entries.at(-1);
    if (terminal?.state === "COMMITTED") {
      const bytes = await this.executor.readSource(pending.path);
      if (bytes === null || await sha256Bytes(bytes) !== pending.proposedDigest) throw new Error("HOST_RECOVERY_TARGET_CONFLICT");
      const binding = structuredClone(pending.ownership);
      binding.adoptedDigest = pending.proposedDigest;
      if (binding.ownership === "region-managed") {
        const parsed = await parseGeneratedMocRegion(bytes);
        if (!parsed.ok) throw new Error("HOST_RECOVERY_MARKERS_INVALID");
        binding.generatedRegion = parsed.region;
      }
      await this.options.onCommitted?.(pending.path, pending.proposedDigest, pending.effectId);
      await this.mutate(s => { s.ownership[pending.path] = binding; s.pending = null; });
    } else if (!terminal || terminal.state === "ABORTED" || terminal.state === "STALE") {
      await this.mutate(s => { s.pending = null; });
    } else throw new Error("HOST_EFFECT_RECOVERY_INCOMPLETE");
  }
  private async reconcile(intent: MocReconciliationIntent) {
    await this.recoverOwnership();
    const context = structuredClone(await this.options.snapshot(structuredClone(intent)));
    if (!intent.full) {
      const scopes = new Set<string>([""]);
      for (const path of intent.paths) {
        const parts = path.split("/"); parts.pop();
        while (parts.length) { scopes.add(parts.join("/")); parts.pop(); }
      }
      context.targets = context.targets.filter(t => scopes.has(t.path.includes("/") ? t.path.slice(0, t.path.lastIndexOf("/")) : ""));
    }
    const targets = await Promise.all(context.targets.map(async t => ({ ...t, ownership: t.ownership.ownership === "unmanaged" ? t.ownership : (this.state!.ownership[t.path] ?? t.ownership), currentBytes: await this.executor.readSource(t.path) })));
    const now = this.clock();
    const batch = await planManagedMocBatch({ ...context, targets, authorityEvaluatedAt: now, archiveDate: now.slice(0, 10), runId: randomUUID() });
    // A denied target blocks the batch before any new effect, preserving review state.
    if (batch.results.some(r => r.status !== "planned" && r.status !== "no-op")) throw new Error("MOC_BATCH_REQUIRES_REVIEW");
    for (const result of batch.results) {
      if (result.status !== "planned") continue;
      const t = targets.find(t => t.path === result.plan.targetPath)!;
      await this.mutate(s => { s.pending = { path: t.path, effectId: result.plan.effectId, proposedDigest: result.plan.proposedDigest, ownership: t.ownership }; });
      const applied = await this.executor.execute({ plan: result.plan, proposedBytes: result.proposedBytes });
      if (applied.status !== "committed" && applied.status !== "no-op") throw new Error("MOC_EFFECT_NOT_COMMITTED");
      await this.options.faultInjector?.("after-effect-before-ownership");
      await this.recoverOwnership();
    }
  }
  async start(now: number): Promise<boolean> {
    if (this.closed) throw new Error("HOST_CLOSED");
    if (this.attemptedStart) throw new Error("HOST_ALREADY_STARTED");
    this.attemptedStart = true;
    try { return await this.coordinator.start(now); }
    catch (e) { await this.executor.releaseVaultLease(); throw e; }
  }
  async shutdown(): Promise<void> {
    this.closed = true;
    await this.coordinator.stop();
    await this.coordinator.tick(0); // Await an already-active reconciliation; never starts one after stop.
    await this.queue;
    await this.executor.shutdown();
  }
}
