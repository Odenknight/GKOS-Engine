import { canonicalJson, canonicalSha256, deepFreeze } from "../canonical";
import { validateStateChangeReceiptRole } from "./state-change-receipt";
import type {
  DurabilityVerification,
  GovernedRecord,
  GovernanceAppendOptions,
  GovernanceAppendResult,
  GovernanceRef,
  GovernanceStore,
} from "./types";

export interface InMemoryGovernanceStoreOptions {
  receiptAvailable?: (record: GovernedRecord) => boolean;
  durabilityAvailable?: (record: GovernedRecord) => boolean;
}

interface StoredOperation {
  idempotencyKey: string;
  proposalDigest: string;
  result: Extract<GovernanceAppendResult, { committed: true }>;
}

function clone<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

/** Append-only test adapter. It is not a vault or source-content writer. */
export class InMemoryGovernanceStore implements GovernanceStore {
  readonly atomicity = "transactional" as const;
  readonly bindingMechanism = "in-memory-test-adapter" as const;
  private records: GovernedRecord[] = [];
  private operations = new Map<string, StoredOperation>();
  private idempotency = new Map<string, string>();
  private version = 0;
  private head: string | undefined;
  private digest = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  constructor(private readonly options: InMemoryGovernanceStoreOptions = {}) {}

  snapshot(): Readonly<{ version: number; head?: string; digest: string; records: readonly GovernedRecord[] }> {
    return deepFreeze({ version: this.version, ...(this.head ? { head: this.head } : {}), digest: this.digest, records: clone(this.records) });
  }

  async read<T = unknown>(ref: GovernanceRef): Promise<GovernedRecord<T> | null> {
    if (!!ref.recordId === !!ref.operationId) throw new Error("GovernanceRef requires exactly one of recordId or operationId.");
    const record = this.records.find((candidate) => ref.recordId ? candidate.recordId === ref.recordId : candidate.operationId === ref.operationId);
    return record ? deepFreeze(clone(record as GovernedRecord<T>)) : null;
  }

  async append<T>(record: GovernedRecord<T>, options: GovernanceAppendOptions): Promise<GovernanceAppendResult<T>> {
    const failure = (reason: Extract<GovernanceAppendResult, { committed: false }>["reason"]): GovernanceAppendResult<T> => deepFreeze({
      committed: false,
      reason,
      version: this.version,
      ...(this.head ? { head: this.head } : {}),
      digest: this.digest,
      atomicity: this.atomicity,
      bindingMechanism: this.bindingMechanism,
    });
    if (!options?.idempotencyKey) return failure("idempotency-conflict");
    const validation = validateStateChangeReceiptRole(record?.stateChange, record?.operationId);
    if (validation.length || record.stateChange.outcome !== "proposed") return failure("invalid-receipt-role");
    if (this.options.receiptAvailable?.(record) === false) return failure("receipt-unavailable");

    const proposalDigest = await canonicalSha256(record);
    const prior = this.operations.get(record.operationId);
    if (prior) {
      if (prior.idempotencyKey !== options.idempotencyKey || prior.proposalDigest !== proposalDigest) return failure("operation-conflict");
      return deepFreeze({ ...(clone(prior.result) as Extract<GovernanceAppendResult<T>, { committed: true }>), replayed: true });
    }
    const keyOwner = this.idempotency.get(options.idempotencyKey);
    if (keyOwner && keyOwner !== record.operationId) return failure("idempotency-conflict");
    if (options.expectedHead !== undefined && options.expectedHead !== this.head) return failure("precondition-failed");
    if (options.expectedDigest !== undefined && options.expectedDigest !== this.digest) return failure("precondition-failed");
    if (this.options.durabilityAvailable?.(record) === false) return failure("durability-failed");

    const nextVersion = this.version + 1;
    const transactionBinding = `in-memory:${nextVersion}:${record.operationId}:${proposalDigest.slice(7, 23)}`;
    const committedRecord: GovernedRecord<T> = deepFreeze(clone({
      ...record,
      stateChange: {
        ...record.stateChange,
        outcome: "committed",
        transactionBinding,
        durability: { mechanism: this.bindingMechanism, evidence: transactionBinding },
      },
    }));
    const nextRecords = [...this.records, committedRecord];
    const nextDigest = await canonicalSha256(nextRecords);
    const result: Extract<GovernanceAppendResult<T>, { committed: true }> = deepFreeze({
      committed: true,
      replayed: false,
      version: nextVersion,
      head: committedRecord.recordId,
      digest: nextDigest,
      atomicity: this.atomicity,
      bindingMechanism: this.bindingMechanism,
      record: clone(committedRecord),
    });

    // Publish record, receipt-role outcome, binding evidence and ledger head together.
    this.records = nextRecords;
    this.version = nextVersion;
    this.head = committedRecord.recordId;
    this.digest = nextDigest;
    this.operations.set(record.operationId, { idempotencyKey: options.idempotencyKey, proposalDigest, result: clone(result) });
    this.idempotency.set(options.idempotencyKey, record.operationId);
    return result;
  }

  async verifyBinding(operationId: string): Promise<DurabilityVerification> {
    const stored = this.operations.get(operationId)?.result;
    if (!stored) return deepFreeze({ operationId, durable: false, mechanism: this.bindingMechanism });
    const stillPresent = this.records.some((record) => record.operationId === operationId && record.recordId === stored.record.recordId);
    return deepFreeze({
      operationId,
      durable: stillPresent && stored.record.stateChange.outcome === "committed" && !!stored.record.stateChange.transactionBinding,
      recordId: stored.record.recordId,
      digest: stored.digest,
      transactionBinding: stored.record.stateChange.transactionBinding,
      mechanism: this.bindingMechanism,
    });
  }
}
