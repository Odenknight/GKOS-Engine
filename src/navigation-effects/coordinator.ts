import { validateVaultRelativePath } from "./path-policy";

export interface MocReconciliationIntent {
  revision: number;
  full: boolean;
  paths: string[];
  firstAt: number;
  lastAt: number;
}
export interface MocCoordinatorHost {
  /** Must persist atomically and durably; .gkx state is excluded from the corpus. */
  loadIntent(): Promise<MocReconciliationIntent | null>;
  saveIntent(intent: MocReconciliationIntent | null): Promise<void>;
  /** Acquire the vault lease and recover all effects. False keeps writes blocked. */
  recover(): Promise<boolean>;
  /** Snapshot, validate, generate affected candidates, plan, execute, index commits.
   * Recheck authority and preconditions for every effect, including recovered work.
   * Resolve only when every scope is reconciled; throw on partial/failed work.
   */
  reconcile(intent: MocReconciliationIntent): Promise<void>;
}

/** Host-driven clock: no timers, filesystem, network or effects on import.
 * Call tick from a host timer; watcher events are durably accepted before return.
 */
export class ManagedMocCoordinator {
  private intent: MocReconciliationIntent | null = null;
  private ready = false;
  private reconciled = false;
  private stopped = false;
  private lastScan = 0;
  private revision = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private active?: Promise<void>;
  private admissions?: { paths: Set<string>; full: boolean; first: number; last: number; done: Promise<void> };
  constructor(private readonly host: MocCoordinatorHost, private readonly options = {
    debounceMs: 750, maxDelayMs: 3000, periodicMs: 300_000, maxPaths: 4096,
  }) {
    if (Object.values(options).some(v => !Number.isSafeInteger(v) || v < 1) || options.maxDelayMs < options.debounceMs) throw new Error("INVALID_COORDINATOR_OPTIONS");
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => {});
    return next;
  }
  private time(now: number) { if (!Number.isSafeInteger(now) || now < 0) throw new Error("INVALID_CLOCK"); }
  private async persist(next: MocReconciliationIntent | null) {
    await this.host.saveIntent(next ? structuredClone(next) : null);
    this.intent = next;
  }
  async start(now: number): Promise<boolean> {
    this.time(now);
    await this.serial(async () => {
      if (this.stopped || this.ready) throw new Error("INVALID_START");
      const saved = await this.host.loadIntent();
      if (saved && (!Number.isSafeInteger(saved.revision) || saved.revision < 0 || saved.revision >= Number.MAX_SAFE_INTEGER || !Array.isArray(saved.paths) || typeof saved.full !== "boolean"
        || !Number.isSafeInteger(saved.firstAt) || saved.firstAt < 0 || !Number.isSafeInteger(saved.lastAt) || saved.lastAt < saved.firstAt
        || saved.paths.some(p => typeof p !== "string" || !validateVaultRelativePath(p).valid)
        || (saved.full && saved.paths.length !== 0))) throw new Error("CORRUPT_RECONCILIATION_INTENT");
      this.revision = saved?.revision ?? 0;
      // Startup always covers the complete vault, including any missed intent.
      await this.persist({ revision: ++this.revision, full: true, paths: [], firstAt: now, lastAt: now });
      if (!await this.host.recover()) return;
      this.ready = true;
    });
    if (this.ready) await this.tick(now, true);
    return this.ready && this.reconciled;
  }
  async notify(path: string, now: number): Promise<void> {
    this.time(now);
    const checked = validateVaultRelativePath(path);
    if (!checked.valid) throw new Error("INVALID_EVENT_PATH");
    const normalized = checked.normalized!;
    if (/^(?:\.gkx(?:\/|$)|_archive\/moc-runs(?:\/|$))/i.test(normalized) || /(?:\.tmp|~)$/.test(normalized)) return;
    await this.enqueue(normalized, now);
  }
  /** Overflow, resume, bulk sync and manual requests force full reconciliation. */
  async requestReconciliation(now: number): Promise<void> { this.time(now); await this.enqueue(null, now); }
  private enqueue(path: string | null, now: number) {
    if (this.stopped) return Promise.reject(new Error("COORDINATOR_STOPPED"));
    if (!this.admissions) {
      const batch = { paths: new Set<string>(), full: false, first: now, last: now, done: null as unknown as Promise<void> };
      this.admissions = batch;
      batch.done = this.serial(async () => {
        this.admissions = undefined;
        const paths = new Set(this.intent?.paths ?? []);
        for (const p of batch.paths) paths.add(p);
        const full = batch.full || this.intent?.full === true || paths.size > this.options.maxPaths;
        if (!Number.isSafeInteger(this.revision + 1)) throw new Error("COORDINATOR_SEQUENCE_EXHAUSTED");
        await this.persist({ revision: ++this.revision, full, paths: full ? [] : [...paths].sort(), firstAt: this.intent?.firstAt ?? batch.first, lastAt: Math.max(this.intent?.lastAt ?? 0, batch.last) });
      });
    }
    const batch = this.admissions;
    batch.last = Math.max(batch.last, now);
    if (path === null) batch.full = true;
    if (path && !batch.full) batch.paths.add(path);
    if (batch.paths.size > this.options.maxPaths) batch.full = true;
    if (batch.full) batch.paths.clear();
    return batch.done;
  }
  async tick(now: number, force = false): Promise<void> {
    this.time(now);
    if (this.active) return this.active;
    const run = async () => {
      const work = await this.serial(async () => {
        if (!this.ready || this.stopped) return null;
        if (!this.intent && now - this.lastScan >= this.options.periodicMs) await this.persist({ revision: ++this.revision, full: true, paths: [], firstAt: now, lastAt: now });
        const pending = this.intent;
        if (!pending || (!force && now - pending.lastAt < this.options.debounceMs && now - pending.firstAt < this.options.maxDelayMs)) return null;
        return structuredClone(pending);
      });
      if (!work) return;
      await this.host.reconcile(work);
      await this.serial(async () => {
        // Events received while executing retain durable work for another pass.
        if (this.intent?.revision === work.revision) await this.persist(null);
        if (work.full) this.lastScan = now;
        if (work.full) this.reconciled = true;
      });
    };
    this.active = run();
    try { await this.active; } finally { this.active = undefined; }
  }
  /** Stop admission; do not erase pending intent or claim a durable clean shutdown. */
  async stop(): Promise<void> { this.stopped = true; await this.serial(async () => { this.ready = false; }); }
  get status() { return { ready: this.ready && this.reconciled && !this.stopped, pending: this.intent !== null, active: !!this.active }; }
}
