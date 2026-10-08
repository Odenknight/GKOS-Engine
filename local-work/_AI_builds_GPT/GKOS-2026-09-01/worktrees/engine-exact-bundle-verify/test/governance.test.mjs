import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryGovernanceStore,
  buildGovernedRecord,
  buildStateChangeReceipt,
  validateStateChangeReceiptRole,
} from "../dist/governance.mjs";

const OP1 = "018f0000-0000-7000-8000-000000000010";
const OP2 = "018f0000-0000-7000-8000-000000000020";
const RECEIPT1 = "018f0000-0000-7000-8000-000000000011";
const RECEIPT2 = "018f0000-0000-7000-8000-000000000021";

function proposed(operationId = OP1, receiptId = RECEIPT1) {
  return buildStateChangeReceipt({
    receiptId,
    operationId,
    actor: { id: "human:owner", class: "human" },
    operation: "navigation.config.moc-name.promote",
    targets: [{ id: "config:next", beforeDigest: "sha256:before", afterDigest: "sha256:after" }],
    authorityRef: "decision:promotion",
    policy: { id: "policy:navigation", version: "1" },
    nondeterministicEscalated: false,
    occurredAt: "2026-08-15T20:00:00Z",
  });
}

function record(payload = { promotedMocNames: ["overview"] }, operationId = OP1, receiptId = RECEIPT1) {
  return buildGovernedRecord({ recordId: `record:${operationId}`, recordType: "vault-navigation-config", payload, receiptRole: proposed(operationId, receiptId) });
}

test("State-Change Receipt is a role embedded in the governed record", () => {
  const value = record();
  assert.equal(value.stateChange.outcome, "proposed");
  assert.equal(value.recordType, "vault-navigation-config");
  assert.equal(Object.hasOwn(value.payload, "receipt"), false);
  assert.deepEqual(validateStateChangeReceiptRole(value.stateChange), []);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.stateChange.targets), true);
});

test("receipt unavailable means no governed effect or successful claim", async () => {
  const store = new InMemoryGovernanceStore({ receiptAvailable: () => false });
  const before = store.snapshot();
  const result = await store.append(record(), { idempotencyKey: "idem:one", expectedDigest: before.digest });
  assert.equal(result.committed, false);
  assert.equal(result.reason, "receipt-unavailable");
  assert.equal(store.snapshot().records.length, 0);
  assert.equal((await store.verifyBinding(OP1)).durable, false);
});

test("invalid receipt-role fields fail closed", async () => {
  const store = new InMemoryGovernanceStore();
  const invalid = { ...record(), stateChange: { ...proposed(), receiptId: "not-a-uuid", outcome: "committed" } };
  const result = await store.append(invalid, { idempotencyKey: "idem:invalid" });
  assert.equal(result.committed, false);
  assert.equal(result.reason, "invalid-receipt-role");
  assert.equal(store.snapshot().records.length, 0);
});

test("durability failure never publishes state or committed receipt outcome", async () => {
  const store = new InMemoryGovernanceStore({ durabilityAvailable: () => false });
  const input = record();
  const result = await store.append(input, { idempotencyKey: "idem:durability", expectedDigest: store.snapshot().digest });
  assert.equal(result.committed, false);
  assert.equal(result.reason, "durability-failed");
  assert.equal(input.stateChange.outcome, "proposed");
  assert.equal(store.snapshot().records.length, 0);
});

test("commit transitions outcome only at the transactional publication boundary", async () => {
  const store = new InMemoryGovernanceStore();
  const input = record();
  const result = await store.append(input, { idempotencyKey: "idem:commit", expectedDigest: store.snapshot().digest });
  assert.equal(result.committed, true);
  assert.equal(result.atomicity, "transactional");
  assert.equal(result.bindingMechanism, "in-memory-test-adapter");
  assert.equal(input.stateChange.outcome, "proposed");
  assert.equal(result.record.stateChange.outcome, "committed");
  assert.ok(result.record.stateChange.transactionBinding);
  assert.match(result.digest, /^sha256:[0-9a-f]{64}$/);
  const verification = await store.verifyBinding(OP1);
  assert.equal(verification.durable, true);
  assert.equal(verification.transactionBinding, result.record.stateChange.transactionBinding);
  assert.deepEqual(await store.read({ operationId: OP1 }), result.record);
});

test("duplicate operation replay is exactly-once and conflicting replay is rejected", async () => {
  const store = new InMemoryGovernanceStore();
  const input = record();
  const options = { idempotencyKey: "idem:replay", expectedDigest: store.snapshot().digest };
  const first = await store.append(input, options);
  const replay = await store.append(input, options);
  assert.equal(first.committed, true);
  assert.equal(replay.committed, true);
  assert.equal(replay.replayed, true);
  assert.equal(store.snapshot().records.length, 1);
  const conflict = await store.append(record({ promotedMocNames: ["different"] }), options);
  assert.equal(conflict.committed, false);
  assert.equal(conflict.reason, "operation-conflict");
  const secondOperation = await store.append(record({ x: 2 }, OP2, RECEIPT2), { idempotencyKey: "idem:replay" });
  assert.equal(secondOperation.committed, false);
  assert.equal(secondOperation.reason, "idempotency-conflict");
});

test("optimistic head and digest preconditions are enforced", async () => {
  const store = new InMemoryGovernanceStore();
  const bad = await store.append(record(), { idempotencyKey: "idem:bad", expectedDigest: "sha256:stale" });
  assert.equal(bad.committed, false);
  assert.equal(bad.reason, "precondition-failed");
  const first = await store.append(record(), { idempotencyKey: "idem:first", expectedDigest: store.snapshot().digest });
  assert.equal(first.committed, true);
  const staleHead = await store.append(record({ x: 2 }, OP2, RECEIPT2), { idempotencyKey: "idem:second", expectedHead: "record:stale" });
  assert.equal(staleHead.committed, false);
  assert.equal(staleHead.reason, "precondition-failed");
});
