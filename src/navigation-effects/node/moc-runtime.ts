import { watch, realpathSync, type FSWatcher } from "node:fs";
import { normalize } from "node:path";
import { performance } from "node:perf_hooks";
import { sha256Bytes } from "../../canonical";
import { NodeManagedMocHost, type NodeManagedMocHostOptions } from "./moc-host";

/** Explicit timer/watcher composition. Only start() opens resources. */
export class NodeManagedMocRuntime {
  readonly host: NodeManagedMocHost;
  private watcher?: FSWatcher;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private tickActive = false;
  private eventPending = false;
  private selfWrites = new Map<string, { digest: string; effectId: string }>();
  private errorCode: string | null = null;
  constructor(private readonly options: NodeManagedMocHostOptions) {
    this.host = new NodeManagedMocHost({ ...options, onCommitted: async (path, digest, effectId) => {
      await options.onCommitted?.(path, digest, effectId);
      if (this.selfWrites.size >= 4096) this.selfWrites.delete(this.selfWrites.keys().next().value!);
      this.selfWrites.set(path, { digest, effectId });
    } });
  }
  private now() { return Math.floor(performance.now()); }
  async start(): Promise<boolean> {
    if (this.running) throw new Error("MOC_RUNTIME_ALREADY_STARTED");
    if (!await this.host.start(this.now())) return false;
    this.running = true;
    try {
      // libuv's Windows watcher compares native event paths with the watch root.
      // Expand 8.3 aliases and use native separators: a lexical mismatch can
      // abort the process in affected runtimes, bypassing JavaScript catch.
      // This is only a signal source; executor path/authority checks still own
      // every read and effect, and reconciliation remains authoritative.
      const watchRoot = normalize(realpathSync.native(this.options.vaultRoot));
      this.watcher = watch(watchRoot, { recursive: true }, (_event, filename) => {
        if (!this.running) return;
        const path = filename?.toString().replace(/\\/g, "/");
        if (path && /^(?:\.gkx(?:\/|$)|_archive\/moc-runs(?:\/|$))/i.test(path)) return;
        // Bound async reads during storms: collapse overlapping signals into a
        // durable full scan rather than starting an unbounded stat/read queue.
        if (this.eventPending) { void this.host.coordinator.requestReconciliation(this.now()).catch(() => { this.errorCode = "EVENT_PERSIST_FAILED"; }); return; }
        this.eventPending = true;
        void (async () => {
          try {
            const own = path ? this.selfWrites.get(path) : undefined;
            if (path && own) {
              const bytes = await this.host.executor.readSource(path);
              this.selfWrites.delete(path);
              if (bytes !== null && await sha256Bytes(bytes) === own.digest && /^effect:[0-9a-f]{32}$/.test(own.effectId)) return;
            }
            // Rename signals lack a portable old/new pair. Full reconciliation
            // preserves correctness for deletions and renames across directories.
            if (!path || _event === "rename") await this.host.coordinator.requestReconciliation(this.now());
            else await this.host.coordinator.notify(path, this.now());
          } catch { this.errorCode = "EVENT_PERSIST_FAILED"; }
          finally { this.eventPending = false; }
        })();
      });
      this.watcher.on("error", () => { this.errorCode = "WATCHER_FAILED"; void this.host.coordinator.requestReconciliation(this.now()).catch(() => {}); });
    } catch {
      // Passive reconciliation remains useful on hosts without recursive watch.
      this.errorCode = "WATCHER_UNAVAILABLE";
      await this.host.coordinator.requestReconciliation(this.now());
    }
    this.timer = setInterval(() => {
      if (this.tickActive || !this.running) return;
      this.tickActive = true;
      void this.host.coordinator.tick(this.now()).catch(() => { this.errorCode = "RECONCILIATION_FAILED"; }).finally(() => { this.tickActive = false; });
    }, 100);
    return true;
  }
  async reconcileNow(): Promise<void> {
    await this.host.coordinator.requestReconciliation(this.now());
    await this.host.coordinator.tick(this.now(), true);
  }
  async shutdown(budgetMs = 5000): Promise<{ clean: boolean }> {
    if (!Number.isFinite(budgetMs) || budgetMs < 1 || budgetMs > 60_000) throw new Error("INVALID_SHUTDOWN_BUDGET");
    this.running = false;
    this.watcher?.close();
    this.watcher = undefined;
    if (this.timer) clearInterval(this.timer);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          if (this.eventPending) await this.host.coordinator.requestReconciliation(this.now());
          await this.host.shutdown();
          return { clean: true };
        })().catch(() => ({ clean: false })),
        new Promise<{ clean: boolean }>(resolve => { timeout = setTimeout(() => resolve({ clean: false }), budgetMs); }),
      ]);
    } finally { if (timeout) clearTimeout(timeout); }
  }
  get status() { return { ...this.host.coordinator.status, running: this.running, watcherActive: !!this.watcher, errorCode: this.errorCode }; }
}
