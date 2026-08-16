export type GovernanceActorClass = "human" | "agent" | "system" | "service";

export interface ActorRef {
  id: string;
  class: GovernanceActorClass;
  contractRef?: string;
}

export type GovernanceAtomicity = "atomic" | "transactional" | "best-effort-with-compensation";
export type GovernanceBindingMechanism =
  | "atomic-transaction"
  | "journaled-two-phase"
  | "deterministic-compensation"
  | "in-memory-test-adapter";

export interface StateChangeTarget {
  id: string;
  beforeDigest?: string;
  afterDigest?: string;
}

/**
 * Fields which make a governed record satisfy the State-Change Receipt role.
 * They may be embedded in another governed record; a duplicate receipt object
 * is neither required nor implied.
 */
export interface StateChangeReceiptRole {
  receiptId: string;
  operationId: string;
  actor: ActorRef;
  operation: string;
  targets: StateChangeTarget[];
  authorityRef: string;
  delegationRef?: string;
  policy: { id: string; version: string; digest?: string };
  predicate?: { id: string; version: string; result: "routine" | "major" | "indeterminate" };
  nondeterministicEscalated: boolean;
  outcome: "proposed" | "committed" | "blocked" | "aborted" | "rolled-back" | "compensated";
  occurredAt: string;
  transactionBinding?: string;
  durability?: {
    mechanism: GovernanceBindingMechanism;
    evidence: string;
  };
}

export interface GovernedRecord<T = unknown> {
  recordId: string;
  recordType: string;
  operationId: string;
  payload: T;
  /** The containing record itself satisfies the receipt role. */
  stateChange: StateChangeReceiptRole;
}

export interface GovernanceRef {
  recordId?: string;
  operationId?: string;
}

export interface GovernanceAppendOptions {
  idempotencyKey: string;
  expectedHead?: string;
  expectedDigest?: string;
}

export type GovernanceAppendFailureReason =
  | "receipt-unavailable"
  | "invalid-receipt-role"
  | "precondition-failed"
  | "operation-conflict"
  | "idempotency-conflict"
  | "durability-failed";

export type GovernanceAppendResult<T = unknown> =
  | {
      committed: true;
      replayed: boolean;
      version: number;
      head: string;
      digest: string;
      atomicity: GovernanceAtomicity;
      bindingMechanism: GovernanceBindingMechanism;
      record: GovernedRecord<T>;
    }
  | {
      committed: false;
      reason: GovernanceAppendFailureReason;
      version: number;
      head?: string;
      digest: string;
      atomicity: GovernanceAtomicity;
      bindingMechanism: GovernanceBindingMechanism;
    };

export interface DurabilityVerification {
  operationId: string;
  durable: boolean;
  recordId?: string;
  digest?: string;
  transactionBinding?: string;
  mechanism: GovernanceBindingMechanism;
}

export interface GovernanceStore {
  readonly atomicity: GovernanceAtomicity;
  readonly bindingMechanism: GovernanceBindingMechanism;
  read<T = unknown>(ref: GovernanceRef): Promise<GovernedRecord<T> | null>;
  append<T>(record: GovernedRecord<T>, options: GovernanceAppendOptions): Promise<GovernanceAppendResult<T>>;
  verifyBinding(operationId: string): Promise<DurabilityVerification>;
}

export type AppendResult<T = unknown> = GovernanceAppendResult<T>;
