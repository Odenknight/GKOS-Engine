import { acceptGraphitiQueryResult, prepareGraphitiQueryRequest } from "./graphiti-query-contract";
import type { GraphitiQueryContext, GraphitiQueryRequest, GraphitiQueryResult } from "./graphiti-query-contract";

export type GraphitiBrokerResult =
  | { mode: "semantic"; result: GraphitiQueryResult }
  | { mode: "native"; reason: "unavailable" | "capacity" | "deadline" | "cancelled" | "provider-failed" | "revalidation-failed" };

export interface GraphitiBrokerHost {
  /** Trusted policy host: rederive current scope and complete dependency evidence. */
  authorize(signal: AbortSignal): Promise<GraphitiQueryContext>;
  /** Read-only transport must bound downloaded bytes to 131072 before decoding. */
  query(request: Readonly<GraphitiQueryRequest>, signal: AbortSignal): Promise<string>;
}

/** Optional execution boundary, never an authority provider or ingestion API.
 * A native outcome contains no provider content; the consumer must separately
 * authorize any native fallback. Physical capacity stays held until work settles.
 */
export class GraphitiQueryBroker {
  private active = 0;
  constructor(private readonly maxConcurrent = 4, private readonly timeoutMs = 5000) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 16 ||
        !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error("Invalid broker bounds");
  }
  get outstanding(): number { return this.active; }

  async query(query: string, limit: number, requestId: string, host: GraphitiBrokerHost,
    caller?: AbortSignal): Promise<GraphitiBrokerResult> {
    if (caller?.aborted) return { mode: "native", reason: "cancelled" };
    if (this.active >= this.maxConcurrent) return { mode: "native", reason: "capacity" };
    this.active++;
    const deadline = performance.now() + this.timeoutMs;
    const controller = new AbortController();
    const interrupted = (): GraphitiBrokerResult | null => {
      if (performance.now() >= deadline) { controller.abort(); return { mode: "native", reason: "deadline" }; }
      return controller.signal.aborted ? { mode: "native", reason: "cancelled" } : null;
    };
    let finish!: (result: GraphitiBrokerResult) => void;
    const stopped = new Promise<GraphitiBrokerResult>(resolve => { finish = resolve; });
    const cancel = () => { controller.abort(); finish({ mode: "native", reason: "cancelled" }); };
    caller?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      controller.abort(); finish({ mode: "native", reason: "deadline" });
    }, this.timeoutMs);
    const work = (async (): Promise<GraphitiBrokerResult> => {
      try {
        const context = await host.authorize(controller.signal);
        let stop = interrupted(); if (stop) return stop;
        const request = prepareGraphitiQueryRequest(query, limit, requestId, context);
        if (!request) return { mode: "native", reason: "unavailable" };
        Object.freeze(request.binding); Object.freeze(request);
        const response = await host.query(request, controller.signal);
        stop = interrupted(); if (stop) return stop;
        const current = await host.authorize(controller.signal);
        stop = interrupted(); if (stop) return stop;
        const result = acceptGraphitiQueryResult(request, response, current);
        return result ? { mode: "semantic", result } : { mode: "native", reason: "revalidation-failed" };
      } catch {
        // Provider messages may contain unauthorized content or configuration.
        return { mode: "native", reason: "provider-failed" };
      } finally { this.active--; }
    })();
    try { return await Promise.race([stopped, work]); }
    finally { clearTimeout(timer); caller?.removeEventListener("abort", cancel); }
  }
}
