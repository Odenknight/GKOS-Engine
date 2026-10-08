import { canonicalJson, deepFreeze } from "../canonical";
import type { GovernedRecord, StateChangeReceiptRole } from "./types";

export const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

export function validateStateChangeReceiptRole(receipt: StateChangeReceiptRole, expectedOperationId?: string): string[] {
  const problems: string[] = [];
  if (!receipt || typeof receipt !== "object") return ["receipt-role-missing"];
  if (!UUID_V7_RE.test(receipt.receiptId)) problems.push("receipt-id-not-uuidv7");
  if (!UUID_V7_RE.test(receipt.operationId)) problems.push("operation-id-not-uuidv7");
  if (expectedOperationId && receipt.operationId !== expectedOperationId) problems.push("operation-id-mismatch");
  if (!receipt.actor?.id || !receipt.actor.class) problems.push("actor-binding-missing");
  if (!receipt.operation) problems.push("operation-missing");
  if (!receipt.authorityRef) problems.push("authority-binding-missing");
  if (!receipt.policy?.id || !receipt.policy.version) problems.push("policy-binding-missing");
  if (!Array.isArray(receipt.targets) || receipt.targets.length === 0) problems.push("targets-missing");
  else if (receipt.targets.some((target) => !target.id || (!target.beforeDigest && !target.afterDigest))) problems.push("before-after-binding-missing");
  if (receipt.predicate && (!receipt.predicate.id || !receipt.predicate.version || !receipt.predicate.result)) problems.push("predicate-binding-incomplete");
  if (!ISO_INSTANT_RE.test(receipt.occurredAt) || Number.isNaN(Date.parse(receipt.occurredAt))) problems.push("occurred-at-invalid");
  if (receipt.outcome === "committed" && (!receipt.transactionBinding || !receipt.durability?.evidence)) problems.push("committed-without-durability-binding");
  return problems.sort();
}

/** Build a proposed role record. The store alone may transition it to committed. */
export function buildStateChangeReceipt(input: Omit<StateChangeReceiptRole, "outcome" | "transactionBinding" | "durability">): StateChangeReceiptRole {
  const receipt: StateChangeReceiptRole = {
    ...input,
    targets: input.targets.map((target) => ({ ...target })),
    actor: { ...input.actor },
    policy: { ...input.policy },
    ...(input.predicate ? { predicate: { ...input.predicate } } : {}),
    outcome: "proposed",
  };
  const problems = validateStateChangeReceiptRole(receipt);
  if (problems.length) throw new Error(`Invalid State-Change Receipt role: ${problems.join(", ")}`);
  return deepFreeze(receipt);
}

export function buildGovernedRecord<T>(input: {
  recordId: string;
  recordType: string;
  payload: T;
  receiptRole: StateChangeReceiptRole;
}): GovernedRecord<T> {
  if (!input.recordId || !input.recordType) throw new Error("Governed record identity and type are required.");
  if (input.receiptRole.outcome !== "proposed") throw new Error("A new governed append must carry a proposed receipt role.");
  const record: GovernedRecord<T> = {
    recordId: input.recordId,
    recordType: input.recordType,
    operationId: input.receiptRole.operationId,
    payload: input.payload,
    stateChange: input.receiptRole,
  };
  // Prove serializability before a store sees the proposed record.
  canonicalJson(record);
  return deepFreeze(record);
}
