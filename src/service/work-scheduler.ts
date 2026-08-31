export class WorkScheduleError extends Error {
  constructor(readonly reason: string) { super(reason); }
}
interface Job { credential: string; session: string; valid: () => boolean; signal: AbortSignal; resolve: (release: () => void) => void; reject: (error: Error) => void; cleanup: () => void }
/** Bounded two-level round robin. Active leases are never cancelled early. */
export class ServiceWorkScheduler {
  private queue: Job[] = [];
  private credentials: string[] = [];
  private sessions = new Map<string, string[]>();
  private active = new Map<string, Set<string>>();
  private stopped = false;
  private caps = new Map<string, number>();
  private sweep: ReturnType<typeof setInterval>;
  constructor(private waitMs = 60000) {
    if (!Number.isSafeInteger(waitMs) || waitMs < 20 || waitMs > 60000) throw new TypeError("GKOS_WORK_QUEUE_WAIT_INVALID");
    this.sweep = setInterval(() => { for (const job of [...this.queue]) if (!job.valid()) this.remove(job, "work_authorization_changed"); this.pump(); }, Math.min(250, waitMs));
    this.sweep.unref();
  }
  acquire(credential: string, session: string, valid: () => boolean, signal: AbortSignal, concurrency = 2): Promise<() => void> {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 2 || (this.caps.has(credential) && this.caps.get(credential) !== concurrency)) return Promise.reject(new WorkScheduleError("work_configuration_invalid"));
    this.caps.set(credential, concurrency);
    if (this.stopped) return Promise.reject(new WorkScheduleError("work_shutdown"));
    if (signal.aborted) return Promise.reject(new WorkScheduleError("work_cancelled"));
    if (!valid()) return Promise.reject(new WorkScheduleError("work_authorization_changed"));
    if (this.queue.length >= 16) return Promise.reject(new WorkScheduleError("work_queue_capacity"));
    if (this.queue.filter(job => job.credential === credential).length >= 8) return Promise.reject(new WorkScheduleError("credential_queue_capacity"));
    if (this.queue.filter(job => job.credential === credential && job.session === session).length >= 2) return Promise.reject(new WorkScheduleError("session_queue_capacity"));
    return new Promise((resolve, reject) => {
      const job: Job = { credential, session, valid, signal, resolve, reject, cleanup: () => undefined };
      const abort = () => { this.remove(job, "work_cancelled"); this.pump(); };
      const timer = setTimeout(() => { this.remove(job, "work_queue_timeout"); this.pump(); }, this.waitMs);
      timer.unref();
      job.cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
      signal.addEventListener("abort", abort, { once: true });
      this.queue.push(job);
      if (!this.credentials.includes(credential)) this.credentials.push(credential);
      const turns = this.sessions.get(credential) ?? [];
      if (!turns.includes(session)) turns.push(session);
      this.sessions.set(credential, turns);
      this.pump();
    });
  }
  cancelSession(credential: string, session: string): void {
    for (const job of [...this.queue]) if (job.credential === credential && job.session === session) this.remove(job, "work_session_closed");
    this.pump();
  }
  close(): void { this.stopped = true; clearInterval(this.sweep); for (const job of [...this.queue]) this.remove(job, "work_shutdown"); }
  private remove(job: Job, reason?: string): void {
    const index = this.queue.indexOf(job); if (index < 0) return;
    this.queue.splice(index, 1); job.cleanup();
    if (!this.queue.some(item => item.credential === job.credential && item.session === job.session)) this.sessions.set(job.credential, (this.sessions.get(job.credential) ?? []).filter(id => id !== job.session));
    if (!this.queue.some(item => item.credential === job.credential)) { this.credentials = this.credentials.filter(id => id !== job.credential); this.sessions.delete(job.credential); }
    if (reason) job.reject(new WorkScheduleError(reason));
  }
  private pump(): void {
    if (this.stopped) return;
    while ([...this.active.values()].reduce((sum, set) => sum + set.size, 0) < 2) {
      let selected: Job | undefined;
      for (let i = 0, count = this.credentials.length; i < count && !selected; i++) {
        const credential = this.credentials.shift()!; this.credentials.push(credential);
        const active = this.active.get(credential) ?? new Set<string>();
        if (active.size >= (this.caps.get(credential) ?? 2)) continue;
        const turns = this.sessions.get(credential) ?? [];
        for (let j = 0, size = turns.length; j < size; j++) {
          const session = turns.shift()!; turns.push(session);
          if (!active.has(session)) { selected = this.queue.find(job => job.credential === credential && job.session === session); if (selected) break; }
        }
      }
      if (!selected) return;
      if (selected.signal.aborted || !selected.valid()) { this.remove(selected, "work_authorization_changed"); continue; }
      this.remove(selected);
      const job = selected;
      const active = this.active.get(job.credential) ?? new Set<string>(); active.add(job.session); this.active.set(job.credential, active);
      let released = false;
      job.resolve(() => { if (released) return; released = true; active.delete(job.session); if (!active.size) this.active.delete(job.credential); this.pump(); });
    }
  }
}
