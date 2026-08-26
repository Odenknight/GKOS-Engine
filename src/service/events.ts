import type { ServiceTraversalEvent } from "./types";
import { isServiceVaultRelativePath } from "./paths";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const TOOL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

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
