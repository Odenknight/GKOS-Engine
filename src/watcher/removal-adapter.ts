import { randomBytes } from "node:crypto";

import {
  sealWatcherAdapterReceiptBundle,
  sealWatcherAdapterVerificationBundle,
  sealWatcherRecoveryRecord,
} from "./contracts";
import { watcherCanonicalBytes, watcherDigest, watcherTimestamp, watcherUuid7 } from "./fs-authority";
import {
  readWatcherSourceRemovalEventSetBundle,
  watcherJournalTransaction,
  type WatcherJournalHandle,
} from "./journal";
import { stableJson } from "../retrieval/digest";

type JsonRecord = Record<string, unknown>;
const CAPABILITIES = Object.freeze([
  "durable_idempotent_source_removal_projection",
  "lookup_by_occurrence_digest",
]);

export interface WatcherSourceRemovalAdapter {
  readonly adapter_kind: "governance_store" | "durable_ledger";
  readonly adapter_id: string;
  readonly adapter_contract_version: string;
  readonly authority_namespace: string;
  prove(input: Readonly<JsonRecord>): Promise<Readonly<JsonRecord>> | Readonly<JsonRecord>;
  lookup_by_occurrence_digest(occurrenceDigest: string): Promise<string | null> | string | null;
  project_source_removal(request: Readonly<JsonRecord>): Promise<string> | string;
}

export interface WatcherRemovalAdapterCapability {
  readonly binding_digest: string;
  readonly verification_receipt_digest: string;
}

const VERIFIED = new WeakMap<WatcherRemovalAdapterCapability, {
  adapter: WatcherSourceRemovalAdapter;
  binding: Readonly<JsonRecord>;
  verification: Readonly<JsonRecord>;
  nonce: Buffer;
}>();

function fail(code: string): never { throw new Error(code); }

function sealed(base: JsonRecord, digest: string): Readonly<JsonRecord> {
  return sealWatcherRecoveryRecord({ ...base, [digest]: watcherDigest(base) });
}

export async function createWatcherRemovalAdapterCapability(input: {
  readonly trusted_configuration: true;
  readonly adapter: WatcherSourceRemovalAdapter;
  readonly vault_id: string;
  readonly configuration_digest: string;
  readonly policy_digest: string;
}): Promise<WatcherRemovalAdapterCapability> {
  if (input.trusted_configuration !== true || input.adapter === null || typeof input.adapter !== "object" ||
      typeof input.adapter.prove !== "function" || typeof input.adapter.lookup_by_occurrence_digest !== "function" ||
      typeof input.adapter.project_source_removal !== "function") fail("GKX_WATCHER_REMOVAL_ADAPTER_CAPABILITY_INVALID");
  const scope = sealed({
    contract_version: "gkos-watcher-source-removal-authorization-scope/1.0.0-draft.1",
    adapter_kind: input.adapter.adapter_kind,
    adapter_id: input.adapter.adapter_id,
    adapter_contract_version: input.adapter.adapter_contract_version,
    vault_id: input.vault_id,
    authority_namespace: input.adapter.authority_namespace,
    authorized_operation: "retrieval.source_removed/projection",
    configuration_digest: input.configuration_digest,
    policy_digest: input.policy_digest,
  }, "authorization_binding_digest");
  const binding = sealed({
    contract_version: "gkos-watcher-source-removal-adapter-binding/1.0.0-draft.1",
    adapter_kind: input.adapter.adapter_kind,
    adapter_id: input.adapter.adapter_id,
    adapter_contract_version: input.adapter.adapter_contract_version,
    vault_id: input.vault_id,
    authority_namespace: input.adapter.authority_namespace,
    authorization_binding_digest: scope.authorization_binding_digest,
    configuration_digest: input.configuration_digest,
    policy_digest: input.policy_digest,
    capabilities: CAPABILITIES,
  }, "binding_digest");
  const rawNonce = randomBytes(16);
  const challenge = sealed({
    contract_version: "gkos-watcher-source-removal-adapter-challenge/1.0.0-draft.1",
    vault_id: input.vault_id,
    configuration_digest: input.configuration_digest,
    policy_digest: input.policy_digest,
    nonce: rawNonce.toString("hex"),
    required_capabilities: CAPABILITIES,
  }, "challenge_digest");
  const proofInput = await input.adapter.prove(Object.freeze({ challenge, binding }));
  const proof = sealWatcherRecoveryRecord(proofInput);
  const verification = sealed({
    contract_version: "gkos-watcher-source-removal-adapter-verification/1.0.0-draft.1",
    binding_digest: binding.binding_digest,
    challenge_digest: challenge.challenge_digest,
    proof_digest: proof.proof_digest,
    process_instance_id: watcherUuid7(),
    verified_at: watcherTimestamp(),
    capability_nonce_digest: watcherDigest({ nonce: rawNonce.toString("hex") }),
  }, "verification_receipt_digest");
  sealWatcherAdapterVerificationBundle({ scope, binding, challenge, proof, verification });
  const capability = Object.freeze({
    binding_digest: String(binding.binding_digest),
    verification_receipt_digest: String(verification.verification_receipt_digest),
  });
  VERIFIED.set(capability, { adapter: input.adapter, binding, verification, nonce: rawNonce });
  return capability;
}

export function watcherRemovalAdapterBinding(capability: WatcherRemovalAdapterCapability): Readonly<JsonRecord> {
  const held = VERIFIED.get(capability);
  if (held === undefined || held.binding.binding_digest !== capability.binding_digest || held.nonce.byteLength !== 16) {
    throw new TypeError("GKX_WATCHER_REMOVAL_ADAPTER_CAPABILITY_INVALID");
  }
  return held.binding;
}

export function releaseWatcherRemovalAdapterCapability(capability: WatcherRemovalAdapterCapability): void {
  if (!VERIFIED.delete(capability)) throw new TypeError("GKX_WATCHER_REMOVAL_ADAPTER_CAPABILITY_INVALID");
}

function body(row: { body?: Uint8Array } | undefined, code: string): Readonly<JsonRecord> {
  if (!(row?.body instanceof Uint8Array)) fail(code);
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(row.body).toString("utf8")); } catch { fail(code); }
  const record = sealWatcherRecoveryRecord(parsed);
  if (!Buffer.from(row.body).equals(Buffer.from(stableJson(record), "utf8"))) fail(code);
  return record;
}

/** Delivers all-and-only active adapter events and atomically stores Response+Receipt. */
export async function deliverWatcherSourceRemovals(
  handle: WatcherJournalHandle,
  capability: WatcherRemovalAdapterCapability,
): Promise<number> {
  const held = VERIFIED.get(capability);
  const binding = watcherRemovalAdapterBinding(capability);
  if (held === undefined) throw new TypeError("GKX_WATCHER_REMOVAL_ADAPTER_CAPABILITY_INVALID");
  const active = body(handle.database.prepare("SELECT body FROM active_coherent WHERE singleton=1;").get() as { body?: Uint8Array } | undefined, "GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
  const rows = handle.database.prepare(`
    SELECT m.event_set_digest,m.event_ordinal,e.event_digest
    FROM source_removal_event_set_members m
    JOIN source_removal_events e ON e.event_digest=m.event_digest
    JOIN activated_source_removal_event_sets a ON a.event_set_digest=m.event_set_digest
    LEFT JOIN source_removal_receipts r ON r.event_digest=e.event_digest
    WHERE e.delivery_mode='adapter' AND e.adapter_binding_digest=? AND a.coherent_manifest_digest=? AND r.receipt_digest IS NULL
    ORDER BY e.event_digest;
  `).all(String(binding.binding_digest), String(active.coherent_manifest_digest)) as Array<{ event_set_digest?: string; event_ordinal?: number; event_digest?: string }>;
  let delivered = 0;
  for (const row of rows) {
    const current = VERIFIED.get(capability);
    if (current !== held || watcherRemovalAdapterBinding(capability).binding_digest !== binding.binding_digest) {
      fail("GKX_WATCHER_REMOVAL_ADAPTER_CAPABILITY_CHANGED");
    }
    const bundle = readWatcherSourceRemovalEventSetBundle(handle, String(row.event_set_digest));
    const index = Number(row.event_ordinal) - 1;
    const event = (bundle.events as readonly Readonly<JsonRecord>[])[index];
    const occurrence = (bundle.occurrences as readonly Readonly<JsonRecord>[])[index];
    const membership = (bundle.memberships as readonly Readonly<JsonRecord>[])[index];
    const activation = body(handle.database.prepare("SELECT body FROM activated_source_removal_event_sets WHERE event_set_digest=?;").get(String(row.event_set_digest)) as { body?: Uint8Array } | undefined, "GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    if (event.event_digest !== row.event_digest || event.adapter_binding_digest !== binding.binding_digest) fail("GKX_WATCHER_JOURNAL_OUTBOX_UNREADABLE");
    const request = sealed({
      contract_version: "gkos-watcher-source-removal-adapter-request/1.0.0-draft.1",
      binding_digest: binding.binding_digest,
      occurrence_digest: occurrence.occurrence_digest,
      idempotency_key: occurrence.occurrence_digest,
      source_id: occurrence.source_id,
      source_path: occurrence.source_path,
      source_digest: occurrence.source_digest,
      prior_coherent_manifest_digest: occurrence.prior_coherent_manifest_digest,
      target_topology_snapshot_digest: membership.target_topology_snapshot_digest,
      observed_at: membership.prepared_at,
    }, "request_digest");
    let adapterEventId = await held.adapter.lookup_by_occurrence_digest(String(occurrence.occurrence_digest));
    let status: "accepted" | "already_applied" = "already_applied";
    if (adapterEventId === null) {
      adapterEventId = await held.adapter.project_source_removal(request);
      status = "accepted";
    }
    const resultDigest = watcherDigest({
      contract_version: "gkos-watcher-source-removal-adapter-result/1.0.0-draft.1",
      binding_digest: binding.binding_digest,
      occurrence_digest: occurrence.occurrence_digest,
      adapter_event_id: adapterEventId,
    });
    const response = sealed({
      contract_version: "gkos-watcher-source-removal-adapter-response/1.0.0-draft.1",
      binding_digest: binding.binding_digest,
      occurrence_digest: occurrence.occurrence_digest,
      status,
      adapter_event_id: adapterEventId,
      adapter_result_digest: resultDigest,
    }, "response_digest");
    const receipt = sealed({
      contract_version: "gkos-watcher-source-removal-receipt/1.0.0-draft.1",
      event_digest: event.event_digest,
      occurrence_digest: occurrence.occurrence_digest,
      adapter_binding_digest: binding.binding_digest,
      adapter_response_digest: response.response_digest,
      adapter_result_digest: response.adapter_result_digest,
      adapter_event_id: response.adapter_event_id,
      status: response.status,
      recorded_at: watcherTimestamp(),
    }, "receipt_digest");
    sealWatcherAdapterReceiptBundle({
      binding, event_set_bundle: bundle, activation, selected_event_ordinal: row.event_ordinal,
      request, response, receipt,
    });
    const responseBytes = Buffer.from(stableJson(response), "utf8");
    const receiptBytes = Buffer.from(stableJson(receipt), "utf8");
    watcherJournalTransaction(handle, {
      blob_bytes: responseBytes.byteLength + receiptBytes.byteLength,
      mutated_rows: 2,
      run(database) {
        database.prepare("INSERT INTO source_removal_adapter_responses(response_digest,binding_digest,occurrence_digest,status,adapter_event_id,adapter_result_digest,body) VALUES(?,?,?,?,?,?,?);")
          .run(String(response.response_digest), String(response.binding_digest), String(response.occurrence_digest), String(response.status),
            String(response.adapter_event_id), String(response.adapter_result_digest), responseBytes);
        database.prepare("INSERT INTO source_removal_receipts(receipt_digest,event_digest,occurrence_digest,adapter_binding_digest,adapter_response_digest,adapter_result_digest,adapter_event_id,status,body) VALUES(?,?,?,?,?,?,?,?,?);")
          .run(String(receipt.receipt_digest), String(receipt.event_digest), String(receipt.occurrence_digest), String(receipt.adapter_binding_digest),
            String(receipt.adapter_response_digest), String(receipt.adapter_result_digest), String(receipt.adapter_event_id), String(receipt.status), receiptBytes);
      },
    });
    delivered += 1;
  }
  return delivered;
}
