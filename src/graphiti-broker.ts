import { ServiceWorkScheduler } from "./service/work-scheduler";
import { acceptGraphitiQueryResult, prepareGraphitiQueryRequest } from "./graphiti-query-contract";
import type { GraphitiQueryContext, GraphitiQueryRequest, GraphitiQueryResult } from "./graphiti-query-contract";

export interface GraphitiBrokerHost {
  /** Recompute from authenticated source authority and the published ledger. */
  current(): GraphitiQueryContext;
  /** Read-only transport; bound download bytes to 128 KiB before decoding. */
  query(request: GraphitiQueryRequest, signal: AbortSignal): Promise<string>;
}

/** Private host integration; no wire caller can provide host callbacks. */
export class GraphitiQueryBroker {
  // Separate admission from ingestion: interactive queries never queue behind
  // model extraction. Reuse the service's bounded/fair scheduler and leases.
  private scheduler = new ServiceWorkScheduler();
  private stopped = false;
  private active = new Set<AbortController>();

  close(): void {
    this.stopped = true;
    this.scheduler.close();
    for (const controller of this.active) controller.abort();
  }

  async search(host: GraphitiBrokerHost, input: {
    credential: string; session: string; requestId: string; query: string;
    limit: number; signal: AbortSignal; deadlineMs?: number;
  }): Promise<GraphitiQueryResult | null> {
    const deadline = input.deadlineMs ?? 5000;
    if (this.stopped || input.signal.aborted || !Number.isSafeInteger(deadline) || deadline < 1 || deadline > 60000) return null;
    const controller = new AbortController();
    const abort = () => controller.abort();
    input.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, deadline);
    this.active.add(controller);
    let release: (() => void) | undefined;
    let pending: Promise<string> | undefined;
    let abortListener: (() => void) | undefined;
    try {
      const valid = () => {
        try {
          return !this.stopped && !controller.signal.aborted &&
            prepareGraphitiQueryRequest(input.query, input.limit, input.requestId, host.current()) !== null;
        } catch { return false; }
      };
      release = await this.scheduler.acquire(input.credential, input.session, valid, controller.signal);
      if (!valid()) return null;
      const request = prepareGraphitiQueryRequest(input.query, input.limit, input.requestId, host.current());
      if (!request) return null;
      // Provider receives a distinct immutable copy; it cannot rewrite the
      // privately retained request used for the post-await authorization check.
      const outbound = Object.freeze({ ...request, binding: Object.freeze({ ...request.binding }) });
      pending = Promise.resolve().then(() => controller.signal.aborted ? "" : host.query(outbound, controller.signal));
      const response = await Promise.race([
        pending,
        new Promise<null>(resolve => {
          abortListener = () => resolve(null);
          controller.signal.addEventListener("abort", abortListener, { once: true });
          if (controller.signal.aborted) resolve(null);
        }),
      ]);
      if (response === null || controller.signal.aborted || this.stopped) return null;
      // No await after current authority is reloaded and the result accepted.
      return acceptGraphitiQueryResult(request, response, host.current());
    } catch {
      // Native fallback remains available; never forward backend diagnostics.
      return null;
    } finally {
      clearTimeout(timer);
      input.signal.removeEventListener("abort", abort);
      if (abortListener) controller.signal.removeEventListener("abort", abortListener);
      this.active.delete(controller);
      // A transport ignoring cancellation still occupies its physical slot.
      // Releasing on timeout would permit unbounded detached backend work.
      if (pending) pending.then(() => release?.(), () => release?.());
      else release?.();
    }
  }
}
