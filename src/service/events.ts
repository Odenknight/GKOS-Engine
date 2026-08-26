import type { ServiceTraversalEvent } from "./types";
import { isServiceVaultRelativePath } from "./paths";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const TOOL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const jsonByteLength = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;
let streamOrdinal = 0;

/** Validate the bounded, redacted traversal envelope before transport or replay. */
export function isServiceTraversalEvent(value: unknown): value is ServiceTraversalEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<ServiceTraversalEvent>;
  const keys = Object.keys(event).sort();
  const expected = [
    "agent_id", "agent_label", "cost_units", "offset_ms", "operation_id", "paths",
    "schema_version", "sequence", "session_id", "status", "tool",
  ];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  if (event.schema_version !== 1 || !ID.test(event.session_id ?? "") || !ID.test(event.operation_id ?? "")) return false;
  if (!ID.test(event.agent_id ?? "") || typeof event.agent_label !== "string" || event.agent_label.length < 1 || event.agent_label.length > 80) return false;
  if (!TOOL.test(event.tool ?? "") || !Number.isSafeInteger(event.sequence) || Number(event.sequence) < 0) return false;
  if (!Number.isSafeInteger(event.offset_ms) || Number(event.offset_ms) < 0) return false;
  if (!Array.isArray(event.paths) || event.paths.length > 256 || !event.paths.every(isServiceVaultRelativePath)) return false;
  if (!(["completed", "failed", "denied"] as const).includes(event.status as never)) return false;
  return event.cost_units === null || (typeof event.cost_units === "number" && Number.isFinite(event.cost_units) && event.cost_units >= 0);
}

export interface ServiceEventInput {
  session_id: string;
  operation_id: string;
  agent_id: string;
  agent_label: string;
  tool: string;
  paths: readonly string[];
  status: ServiceTraversalEvent["status"];
  cost_units?: number | null;
}

/** Bounded, process-local traversal ring. Persistence remains off by default. */
export class ServiceTraversalEventRing {
  readonly #capacity: number;
  readonly #startedAt: number;
  readonly #maximumBytes: number;
  readonly #clock: () => number;
  readonly sessionId: string;
  #sequence = 0;
  #bytes = 0;
  #events: ServiceTraversalEvent[] = [];
  #listeners = new Set<(event: ServiceTraversalEvent) => void>();

  constructor(capacity = 2048, startedAt?: number, maximumBytes = 2_097_152, clock: () => number = () => performance.now()) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 5000) throw new TypeError("GKOS_SERVICE_EVENT_CAPACITY_INVALID");
    const start = startedAt ?? clock();
    if (!Number.isFinite(start) || start < 0 || !Number.isSafeInteger(Math.trunc(start))) throw new TypeError("GKOS_SERVICE_EVENT_START_INVALID");
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 4_096 || maximumBytes > 16_777_216) throw new TypeError("GKOS_SERVICE_EVENT_BYTES_INVALID");
    this.#capacity = capacity;
    this.#startedAt = Math.trunc(start);
    this.#maximumBytes = maximumBytes;
    this.#clock = clock;
    this.sessionId = `event-stream:${Math.trunc(performance.timeOrigin)}:${++streamOrdinal}`;
  }

  append(input: ServiceEventInput, now = this.#clock()): ServiceTraversalEvent {
    if (!Number.isFinite(now) || now < this.#startedAt) throw new TypeError("GKOS_SERVICE_EVENT_CLOCK_INVALID");
    const event: ServiceTraversalEvent = {
      schema_version: 1,
      session_id: input.session_id,
      sequence: ++this.#sequence,
      offset_ms: Math.max(0, Math.trunc(now - this.#startedAt)),
      operation_id: input.operation_id,
      agent_id: input.agent_id,
      agent_label: input.agent_label,
      tool: input.tool,
      paths: [...new Set(input.paths)].sort(),
      status: input.status,
      cost_units: input.cost_units ?? null,
    };
    if (!isServiceTraversalEvent(event)) throw new TypeError("GKOS_SERVICE_EVENT_INVALID");
    const eventBytes = jsonByteLength(event);
    if (eventBytes > this.#maximumBytes) throw new TypeError("GKOS_SERVICE_EVENT_BYTES_INVALID");
    this.#events.push(event);
    this.#bytes += eventBytes;
    while (this.#events.length > this.#capacity || this.#bytes > this.#maximumBytes) {
      const removed = this.#events.shift();
      if (removed) this.#bytes -= jsonByteLength(removed);
    }
    for (const listener of this.#listeners) {
      try { listener(event); } catch { /* one observer cannot change the committed event or starve peers */ }
    }
    return { ...event, paths: [...event.paths] };
  }

  after(sequence: number): ServiceTraversalEvent[] {
    if (!Number.isSafeInteger(sequence) || sequence < 0) return [];
    return this.#events.filter((event) => event.sequence > sequence).map((event) => ({ ...event, paths: [...event.paths] }));
  }

  resume(sequence: number): { events: ServiceTraversalEvent[]; gap: boolean } {
    if (!Number.isSafeInteger(sequence) || sequence < 0) return { events: [], gap: true };
    const earliest = this.#events[0]?.sequence ?? this.#sequence + 1;
    if (sequence > this.#sequence || sequence < earliest - 1) return { events: [], gap: true };
    return { events: this.after(sequence), gap: false };
  }

  subscribe(listener: (event: ServiceTraversalEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }
}

export function serializeServiceEventSse(event: ServiceTraversalEvent): string {
  if (!isServiceTraversalEvent(event)) throw new TypeError("GKOS_SERVICE_EVENT_INVALID");
  return `id: ${event.sequence}\nevent: traversal\ndata: ${JSON.stringify(event)}\n\n`;
}
