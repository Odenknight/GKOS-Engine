import { types as utilTypes } from "node:util";
import { canonicalCandidateSourceDescriptor } from "../canonical-candidates";
import { isValidGkxAuthoredUid } from "../gkx23";
import { buildGraphitiEpisodes } from "../graphiti";
import { isValidRetrievalSourcePath } from "../retrieval/chunker";
import type { GkxGraph, GraphDelta, SourceFile } from "../types";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, retrievalSha256, stableJson } from "../retrieval/digest";

export const WATCHER_RECOVERY_PACK_VERSION = "gkos-watcher-recovery/1.0.0-draft.1" as const;
export const WATCHER_RECOVERY_PACK_MANIFEST_VERSION = "gkos-watcher-recovery-pack-manifest/1.0.0-draft.1" as const;
const WATCHER_RECOVERY_SCHEMA_ROOT = "https://gkos.example/contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1/";
export const WATCHER_CONVERGENCE_SAMPLE_PLAN_VERSION = "gkos-watcher-convergence-sample-plan/1.0.0-draft.1" as const;
export const WATCHER_CONVERGENCE_SAMPLE_PLAN_DIGEST = "sha256:6ab764aad47cbb072469f19760b772df90b2138acaf6a9f022041d38094bb695" as const;
export const WATCHER_RECOVERY_PACK_FILES = Object.freeze([
  "README.md", "TECHNICAL_README.md", "authority.schema.json", "batch.schema.json", "coherent-manifest.schema.json",
  "conformance.schema.json", "journal.schema.json", "sample-plan.schema.json", "source-removal.schema.json", "status.schema.json",
  "topology.schema.json", "transition.schema.json", "watcher-cli-fixture.json", "watcher-conformance-fixture.json",
  "watcher-recovery-fixture.json", "watcher-sample-plan.json", "watcher-storage-fixture.json",
] as const);

export const WATCHER_NORMAL_STATES = [
  "observed",
  "normalized",
  "gkx_applied",
  "retrieval_applied",
  "graph_applied",
  "activation_prepared",
  "complete",
] as const;

export const WATCHER_EXCEPTIONAL_STATES = ["failed", "superseded"] as const;

export const WATCHER_STATUS_REASON_CODES = [
  "WATCHER_EVENT_OVERFLOW",
  "WATCHER_GRAPH_ARTIFACT_LIMIT_EXCEEDED",
  "WATCHER_GRAPH_DEGRADED",
  "WATCHER_JOURNAL_CAP_EXCEEDED",
  "WATCHER_JOURNAL_RECOVERY_REQUIRED",
  "WATCHER_LEDGER_ADAPTER_FAILED",
  "WATCHER_LEDGER_ADAPTER_UNAVAILABLE",
  "WATCHER_NO_COHERENT_GENERATION",
  "WATCHER_OBSERVATION_ARTIFACT_LIMIT_EXCEEDED",
  "WATCHER_PLAN_ARTIFACT_LIMIT_EXCEEDED",
  "WATCHER_POINTER_RECOVERY_REQUIRED",
  "WATCHER_REBUILD_IN_PROGRESS",
  "WATCHER_RETRIEVAL_DEGRADED",
  "WATCHER_SHUTDOWN_DRAINING",
  "WATCHER_SOURCE_CAPABILITY_UNSTABLE",
  "WATCHER_SOURCE_REJECTED",
  "WATCHER_STARTUP_RECONCILIATION",
  "WATCHER_TOPOLOGY_ARTIFACT_LIMIT_EXCEEDED",
] as const;

export const WATCHER_TRANSITION_REASON_CODES = [
  "WATCHER_ACTIVATION_FAILED",
  "WATCHER_CONFIGURATION_CHANGED",
  "WATCHER_EVENT_OVERFLOW",
  "WATCHER_GRAPH_ARTIFACT_LIMIT_EXCEEDED",
  "WATCHER_GRAPH_BUILD_FAILED",
  "WATCHER_GKX_APPLY_FAILED",
  "WATCHER_JOURNAL_CAP_EXCEEDED",
  "WATCHER_JOURNAL_INVALID",
  "WATCHER_LAST_COHERENT_STALE",
  "WATCHER_PLAN_ARTIFACT_LIMIT_EXCEEDED",
  "WATCHER_POLICY_CHANGED",
  "WATCHER_RECOVERY_SUPERSEDED",
  "WATCHER_REMOVAL_ADAPTER_FAILED",
  "WATCHER_REMOVAL_ADAPTER_UNAVAILABLE",
  "WATCHER_RETRIEVAL_BUILD_FAILED",
  "WATCHER_SHUTDOWN_CHECKPOINTED",
  "WATCHER_SHUTDOWN_TIMEOUT",
  "WATCHER_SOURCE_SNAPSHOT_CHANGED",
  "WATCHER_SOURCE_UNSTABLE",
  "WATCHER_STARTUP_RECONCILIATION",
  "WATCHER_TOPOLOGY_ARTIFACT_LIMIT_EXCEEDED",
  "WATCHER_VALIDATION_REJECTED",
] as const;

export type WatcherRecoveryContractErrorCode =
  | "GKX_WATCHER_CONTRACT_CLI_INVALID"
  | "GKX_WATCHER_CONTRACT_DIGEST_INVALID"
  | "GKX_WATCHER_CONTRACT_GRAPH_INVALID"
  | "GKX_WATCHER_CONTRACT_KEYS_INVALID"
  | "GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID"
  | "GKX_WATCHER_CONTRACT_PACK_INVALID"
  | "GKX_WATCHER_CONTRACT_PATH_INVALID"
  | "GKX_WATCHER_CONTRACT_POINTER_INVALID"
  | "GKX_WATCHER_CONTRACT_RECORD_INVALID"
  | "GKX_WATCHER_CONTRACT_RELATION_INVALID"
  | "GKX_WATCHER_CONTRACT_RESET_INVALID"
  | "GKX_WATCHER_CONTRACT_RETRY_INVALID"
  | "GKX_WATCHER_CONTRACT_SAMPLE_PLAN_INVALID"
  | "GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID"
  | "GKX_WATCHER_CONTRACT_SQL_INVALID"
  | "GKX_WATCHER_CONTRACT_TRANSITION_INVALID"
  | "GKX_WATCHER_CONTRACT_VERSION_INVALID"
  ;

export class WatcherRecoveryContractError extends Error {
  readonly code: WatcherRecoveryContractErrorCode;

  constructor(code: WatcherRecoveryContractErrorCode, message: string) {
    super(message);
    this.name = "WatcherRecoveryContractError";
    this.code = code;
  }
}

type JsonRecord = Record<string, unknown>;

interface RecordDescriptor {
  readonly keys: readonly string[];
  readonly digest: string | null;
}

const DESCRIPTORS: Readonly<Record<string, RecordDescriptor>> = Object.freeze({
  "gkos-watcher-observation/1.0.0-draft.1": descriptor([
    "contract_version", "batch_id", "batch_kind", "observed_paths", "unscoped", "overflow", "started_at", "observation_digest",
  ], "observation_digest"),
  "gkos-watcher-observation-authority/1.0.0-draft.1": descriptor([
    "contract_version", "batch_id", "observation_digest", "observation_artifact_file", "observation_raw_sha256", "observation_byte_size", "pre_scan_state_digest", "started_at", "authority_digest",
  ], "authority_digest"),
  "gkos-watcher-batch-record/1.0.0-draft.1": descriptor([
    "contract_version", "batch_id", "batch_kind", "observation_authority_digest", "started_at", "execution_kind", "retry_of_batch_id", "batch_record_digest",
  ], "batch_record_digest"),
  "gkos-watcher-pre-scan-state/1.0.0-draft.1": descriptor([
    "contract_version", "vault_id", "active_pointer_digest", "active_coherent_manifest_digest", "topology_snapshot_digest", "configuration_digest", "policy_digest", "effective_profile_digest",
  ], null),
  "gkos-watcher-batch-plan/1.0.0-draft.1": descriptor([
    "contract_version", "batch_id", "observation_digest", "topology_snapshot_digest", "effective_profile_digest", "validation_result_digest", "rejection_journal_digest", "intended_source_mutations", "folder_set_changed", "attachment_set_changed", "mutation_set_digest", "plan_digest",
  ], "plan_digest"),
  "gkos-watcher-plan-authority/1.0.0-draft.1": descriptor([
    "contract_version", "batch_id", "observation_digest", "plan_digest", "plan_artifact_file", "plan_raw_sha256", "plan_byte_size", "target_topology_snapshot_digest", "source_removal_event_count", "source_removal_event_set_digest", "authority_digest",
  ], "authority_digest"),
  "gkos-watcher-topology-snapshot/1.0.0-draft.1": descriptor([
    "contract_version", "vault_id", "source_observation_snapshot_digest", "validation_result_digest", "rejection_journal_digest", "accepted_sources", "rejected_sources", "folder_paths", "attachment_paths", "accepted_source_set_digest", "rejected_source_set_digest", "folder_set_digest", "attachment_set_digest", "topology_snapshot_digest",
  ], "topology_snapshot_digest"),
  "gkos-watcher-transition/1.0.0-draft.1": descriptor([
    "contract_version", "batch_id", "transition_ordinal", "state", "last_reached_state", "terminal_state", "observation_digest", "plan_digest", "prior_transition_digest", "gkx_delta_digest", "gkx_snapshot_digest", "retrieval_projection_state", "graph_projection_state", "reason_codes", "recorded_at", "completed_at", "transition_digest",
  ], "transition_digest"),
  "gkos-watcher-normalized-graph-delta/1.0.0-draft.1": descriptor([
    "contract_version", "delta",
  ], null),
  "gkos-watcher-canonical-gkx-graph/1.0.0-draft.1": descriptor([
    "contract_version", "normalized_graph",
  ], null),
  "gkos-watcher-graphiti-projection/1.0.0-draft.1": descriptor([
    "contract_version", "processing_time", "episodes",
  ], null),
  "gkos-watcher-raw-graph-artifact/1.0.0-draft.1": descriptor([
    "contract_version", "service_generation_id", "topology_snapshot_digest", "graph", "graph_artifact_digest",
  ], "graph_artifact_digest"),
  "gkos-watcher-coherent-manifest/1.0.0-draft.1": descriptor([
    "contract_version", "service_generation_id", "vault_id", "completed_batch_id", "completed_transition_digest", "topology_snapshot_digest", "topology_artifact_file", "topology_artifact_raw_sha256", "source_observation_snapshot_digest", "effective_profile_digest", "validation_result_digest", "rejection_journal_digest", "configuration_digest", "policy_digest", "gkx_snapshot_digest", "retrieval_projection_state", "graph_projection_state", "source_removal_event_count", "source_removal_event_set_digest", "created_at", "coherent_manifest_digest",
  ], "coherent_manifest_digest"),
  "gkos-watcher-active-pointer/1.0.0-draft.1": descriptor([
    "contract_version", "kind", "service_generation_id", "coherent_manifest_file", "coherent_manifest_digest", "prior_pointer_digest", "pointer_digest",
  ], "pointer_digest"),
  "gkos-watcher-journal-meta/1.0.0-draft.1": descriptor([
    "contract_version", "journal_instance_id", "vault_id", "configuration_digest", "policy_digest", "effective_profile_digest", "anchor_coherent_manifest_digest", "created_at", "meta_digest",
  ], "meta_digest"),
  "gkos-watcher-activation-intent/1.0.0-draft.1": descriptor([
    "contract_version", "prepared_transition_digest", "coherent_manifest_digest", "prior_pointer_digest", "target_pointer", "target_complete_transition", "prepared_at", "intent_digest",
  ], "intent_digest"),
  "gkos-watcher-activation-outcome/1.0.0-draft.1": descriptor([
    "contract_version", "intent_digest", "coherent_manifest_digest", "outcome", "pointer_digest", "reason_codes", "recorded_at", "outcome_digest",
  ], "outcome_digest"),
  "gkos-watcher-active-coherent/1.0.0-draft.1": descriptor([
    "contract_version", "service_generation_id", "coherent_manifest_digest", "pointer_digest", "intent_digest", "activated_at", "active_digest",
  ], "active_digest"),
  "gkos-watcher-authority/1.0.0-draft.1": descriptor([
    "contract_version", "kind", "vault_id", "configuration_digest", "policy_digest", "effective_profile_digest", "first_service_generation_id", "first_coherent_manifest_digest", "first_pointer_digest", "authority_digest",
  ], "authority_digest"),
  "gkos-watcher-journal-generation/1.0.0-draft.1": descriptor([
    "contract_version", "journal_instance_id", "directory_leaf", "database_file", "meta_digest", "anchor_coherent_manifest_digest", "created_at", "journal_generation_digest",
  ], "journal_generation_digest"),
  "gkos-watcher-journal-active-pointer/1.0.0-draft.1": descriptor([
    "contract_version", "kind", "journal_generation_file", "journal_generation_digest", "prior_pointer_digest", "pointer_digest",
  ], "pointer_digest"),
  "gkos-watcher-journal-file-identity/1.0.0-draft.1": descriptor([
    "contract_version", "role", "leaf", "device", "inode", "mode", "byte_size", "raw_sha256", "identity_digest",
  ], "identity_digest"),
  "gkos-watcher-journal-archive/1.0.0-draft.1": descriptor([
    "contract_version", "journal_instance_id", "directory_leaf", "directory_device", "directory_inode", "directory_mode", "database_identity", "wal_identity", "shm_identity", "outer_coherent_manifest_digest", "archived_at", "archive_manifest_digest",
  ], "archive_manifest_digest"),
  "gkos-watcher-journal-reset/1.0.0-draft.1": descriptor([
    "contract_version", "reset_id", "prior_journal_generation_digest", "archive_manifest_digest", "new_journal_meta_digest", "new_journal_generation_digest", "target_journal_pointer_digest", "outer_coherent_manifest_digest", "ready_event_count", "reset_carry_event_set_digest", "reset_carry_activation_digest", "reset_at", "reset_digest",
  ], "reset_digest"),
  "gkos-watcher-journal-reset-guard/1.0.0-draft.1": descriptor([
    "contract_version", "operation", "owner_nonce", "parent_device", "parent_inode", "parent_mode", "guard_basename", "guard_stage_basename", "old_journal_pointer_digest", "old_journal_generation_digest", "outer_coherent_manifest_digest", "archive_manifest_digest", "new_journal_instance_id", "new_journal_directory_leaf", "new_journal_meta_digest", "new_journal_generation_digest", "reset_digest", "target_journal_pointer_digest", "ready_event_count", "reset_carry_event_set_digest", "reset_carry_activation_digest", "guard_digest",
  ], "guard_digest"),
  "gkos-watcher-pointer-replace-guard/1.0.0-draft.1": descriptor([
    "contract_version", "operation", "owner_nonce", "parent_device", "parent_inode", "parent_mode", "final_basename", "guard_basename", "guard_stage_basename", "temp_basename", "old_pointer_file", "old_pointer_digest", "old_pointer_raw_sha256", "old_pointer_byte_size", "old_final_device", "old_final_inode", "new_pointer_file", "new_pointer_digest", "new_pointer_raw_sha256", "new_pointer_byte_size", "operation_intent_digest", "target_commit_digest", "guard_digest",
  ], "guard_digest"),
  "gkos-watcher-pointer-recovery-decision/1.0.0-draft.1": descriptor([
    "contract_version", "selected_action", "reader_authority", "reader_pointer_digest", "evidence_disposition", "decision_digest",
  ], "decision_digest"),
  "gkos-watcher-source-removal-authorization-scope/1.0.0-draft.1": descriptor([
    "contract_version", "adapter_kind", "adapter_id", "adapter_contract_version", "vault_id", "authority_namespace", "authorized_operation", "configuration_digest", "policy_digest", "authorization_binding_digest",
  ], "authorization_binding_digest"),
  "gkos-watcher-source-removal-adapter-binding/1.0.0-draft.1": descriptor([
    "contract_version", "adapter_kind", "adapter_id", "adapter_contract_version", "vault_id", "authority_namespace", "authorization_binding_digest", "configuration_digest", "policy_digest", "capabilities", "binding_digest",
  ], "binding_digest"),
  "gkos-watcher-source-removal-adapter-challenge/1.0.0-draft.1": descriptor([
    "contract_version", "vault_id", "configuration_digest", "policy_digest", "nonce", "required_capabilities", "challenge_digest",
  ], "challenge_digest"),
  "gkos-watcher-source-removal-adapter-proof/1.0.0-draft.1": descriptor([
    "contract_version", "challenge_digest", "binding_digest", "adapter_kind", "adapter_id", "adapter_contract_version", "authority_namespace", "authorization_binding_digest", "capabilities", "proof_digest",
  ], "proof_digest"),
  "gkos-watcher-source-removal-adapter-verification/1.0.0-draft.1": descriptor([
    "contract_version", "binding_digest", "challenge_digest", "proof_digest", "process_instance_id", "verified_at", "capability_nonce_digest", "verification_receipt_digest",
  ], "verification_receipt_digest"),
  "gkos-watcher-source-removal-occurrence/1.0.0-draft.1": descriptor([
    "contract_version", "vault_id", "prior_coherent_manifest_digest", "prior_topology_snapshot_digest", "source_id", "source_path", "source_digest", "cause", "occurrence_digest",
  ], "occurrence_digest"),
  "gkos-watcher-source-removal-event/1.0.0-draft.1": descriptor([
    "contract_version", "occurrence_digest", "adapter_binding_digest", "delivery_mode", "event_digest",
  ], "event_digest"),
  "gkos-watcher-source-removal-event-membership/1.0.0-draft.1": descriptor([
    "contract_version", "event_ordinal", "event_digest", "causal_batch_id", "target_topology_snapshot_digest", "prepared_at", "original_membership_digest", "membership_digest",
  ], "membership_digest"),
  "gkos-watcher-source-removal-event-set/1.0.0-draft.1": descriptor([
    "contract_version", "set_kind", "origin_id", "target_topology_snapshot_digest", "event_count", "membership_digest_sequence_digest", "prepared_at", "event_set_digest",
  ], "event_set_digest"),
  "gkos-watcher-source-removal-membership-sequence/1.0.0-draft.1": descriptor([
    "contract_version", "membership_digests",
  ], null),
  "gkos-watcher-source-removal-event-set-activation/1.0.0-draft.1": descriptor([
    "contract_version", "event_set_digest", "coherent_manifest_digest", "activated_at", "activation_digest",
  ], "activation_digest"),
  "gkos-watcher-source-removal-adapter-request/1.0.0-draft.1": descriptor([
    "contract_version", "binding_digest", "occurrence_digest", "idempotency_key", "source_id", "source_path", "source_digest", "prior_coherent_manifest_digest", "target_topology_snapshot_digest", "observed_at", "request_digest",
  ], "request_digest"),
  "gkos-watcher-source-removal-adapter-response/1.0.0-draft.1": descriptor([
    "contract_version", "binding_digest", "occurrence_digest", "status", "adapter_event_id", "adapter_result_digest", "response_digest",
  ], "response_digest"),
  "gkos-watcher-source-removal-receipt/1.0.0-draft.1": descriptor([
    "contract_version", "event_digest", "occurrence_digest", "adapter_binding_digest", "adapter_response_digest", "adapter_result_digest", "adapter_event_id", "status", "recorded_at", "receipt_digest",
  ], "receipt_digest"),
  "gkos-watcher-service-locator/1.0.0-draft.1": descriptor([
    "contract_version", "service_instance_id", "pid", "loopback_host", "port", "status_route", "control_route", "started_at", "locator_digest",
  ], "locator_digest"),
  "gkos-watcher-status/1.0.0-draft.1": descriptor([
    "contract_version", "service_instance_id", "watcher_state", "freshness", "reason_codes", "document_count", "chunk_count", "embedding_model", "last_sync", "uptime_ms", "pid", "source_snapshot_digest", "coherent_manifest_digest", "configuration_digest", "policy_digest", "status_digest",
  ], "status_digest"),
  "gkos-watcher-journal-reset-result/1.0.0-draft.1": descriptor([
    "contract_version", "status", "prior_journal_generation_digest", "archive_manifest_digest", "new_journal_generation_digest", "outer_coherent_manifest_digest", "reset_digest", "requires_reconciliation", "result_digest",
  ], "result_digest"),
  "gkos-watcher-fts-qualification-outcome/1.0.0-draft.1": descriptor([
    "contract_version", "lane_kind", "runtime_version", "os", "arch", "physical_fts5_available", "status", "index_generation_count", "query_count", "provider_call_count", "outcome_digest",
  ], "outcome_digest"),
  "gkos-watcher-observation-environment/1.0.0-draft.1": descriptor([
    "contract_version", "runtime", "runtime_version", "os", "arch", "sqlite_version", "physical_fts5_available", "runner_class", "environment_digest",
  ], "environment_digest"),
  "gkos-watcher-observation-convergence/1.0.0-draft.1": descriptor([
    "contract_version", "incremental_canonical_gkx_digest", "clean_canonical_gkx_digest", "incremental_retrieval_manifest_digest", "clean_retrieval_manifest_digest", "incremental_canonical_graph_digest", "clean_canonical_graph_digest", "incremental_graphiti_digest", "clean_graphiti_digest", "all_equal", "convergence_digest",
  ], "convergence_digest"),
  "gkos-watcher-observation-measurement/1.0.0-draft.1": descriptor([
    "contract_version", "status", "failure_codes", "sample_plan_digest", "environment", "fts_qualification", "edit_latency_micros", "percentiles_micros", "source_work", "embedding_work", "convergence", "measurement_digest",
  ], "measurement_digest"),
  "gkos-watcher-recovery-pack-manifest/1.0.0-draft.1": descriptor([
    "contract_version", "pack_contract_version", "files", "file_count", "total_bytes", "pack_digest",
  ], "pack_digest"),
});

function descriptor(keys: readonly string[], digest: string | null): RecordDescriptor {
  return Object.freeze({ keys: Object.freeze(keys.slice()), digest });
}

function fail(code: WatcherRecoveryContractErrorCode, message: string): never {
  throw new WatcherRecoveryContractError(code, message);
}

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value)) {
    return fail("GKX_WATCHER_CONTRACT_RECORD_INVALID", `${label} must be a plain record.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return fail("GKX_WATCHER_CONTRACT_RECORD_INVALID", `${label} must have a plain prototype.`);
  }
  return value as JsonRecord;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalRecord(value: unknown, label: string): JsonRecord {
  try {
    return record(JSON.parse(stableJson(value)), label);
  } catch (error) {
    if (error instanceof WatcherRecoveryContractError) throw error;
    return fail("GKX_WATCHER_CONTRACT_RECORD_INVALID", `${label} is not inert canonical JSON.`);
  }
}

function canonicalArray(value: unknown, label: string): unknown[] {
  try {
    const result = JSON.parse(stableJson(value));
    if (!Array.isArray(result)) return fail("GKX_WATCHER_CONTRACT_RECORD_INVALID", `${label} must be an array.`);
    return result;
  } catch (error) {
    if (error instanceof WatcherRecoveryContractError) throw error;
    return fail("GKX_WATCHER_CONTRACT_RECORD_INVALID", `${label} is not inert canonical JSON.`);
  }
}

function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(retrievalCodeUnitCompare);
  const expected = keys.slice().sort(retrievalCodeUnitCompare);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("GKX_WATCHER_CONTRACT_KEYS_INVALID", `${label} has an invalid exact key set.`);
  }
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function isIso(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isUuid7(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
}

function isWatcherGenerationId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("watcher:") && isUuid7(value.slice("watcher:".length));
}

function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function stringArray(value: unknown, options: { max?: number; sorted?: boolean; unique?: boolean } = {}): value is string[] {
  if (!Array.isArray(value) || value.length > (options.max ?? Number.MAX_SAFE_INTEGER) || value.some((item) => typeof item !== "string")) return false;
  if (options.unique && new Set(value).size !== value.length) return false;
  if (options.sorted && value.some((item, index) => index > 0 && retrievalCodeUnitCompare(value[index - 1], item) >= 0)) return false;
  return true;
}

function digestMaterial(value: JsonRecord, digestField: string): JsonRecord {
  const result: JsonRecord = {};
  for (const key of Object.keys(value)) if (key !== digestField) result[key] = value[key];
  return result;
}

export function sealWatcherRecoveryRecord(value: unknown): Readonly<JsonRecord> {
  const item = canonicalRecord(value, "watcher recovery record");
  if (typeof item.contract_version !== "string") {
    return fail("GKX_WATCHER_CONTRACT_VERSION_INVALID", "watcher recovery record contract_version is invalid.");
  }
  const definition = DESCRIPTORS[item.contract_version];
  if (!definition) return fail("GKX_WATCHER_CONTRACT_VERSION_INVALID", `unsupported watcher recovery contract ${item.contract_version}.`);
  exactKeys(item, definition.keys, item.contract_version);
  if (definition.digest !== null) {
    if (!isDigest(item[definition.digest])) return fail("GKX_WATCHER_CONTRACT_DIGEST_INVALID", `${definition.digest} is invalid.`);
    const expected = retrievalCanonicalDigest(digestMaterial(item, definition.digest));
    if (item[definition.digest] !== expected) return fail("GKX_WATCHER_CONTRACT_DIGEST_INVALID", `${definition.digest} does not match its canonical preimage.`);
  }
  sealCommonRelations(item);
  return deepFreeze(item);
}

function sealCommonRelations(item: JsonRecord): void {
  switch (item.contract_version) {
    case "gkos-watcher-observation/1.0.0-draft.1":
      if (!isUuid7(item.batch_id) || !["event", "startup_reconciliation", "shutdown_flush", "failure_reconciliation"].includes(String(item.batch_kind))
          || !stringArray(item.observed_paths, { max: 2_000, sorted: true, unique: true }) || typeof item.unscoped !== "boolean"
          || typeof item.overflow !== "boolean" || item.overflow === true && item.unscoped !== true || !isIso(item.started_at)) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "WatcherObservation relations are invalid.");
      }
      for (const path of item.observed_paths as string[]) assertSourcePath(path, "observed path");
      break;
    case "gkos-watcher-observation-authority/1.0.0-draft.1":
      if (!isUuid7(item.batch_id) || !isDigest(item.observation_digest)
          || item.observation_artifact_file !== `watcher-observation-${String(item.observation_digest).slice(7)}.json`
          || !isDigest(item.observation_raw_sha256) || !integer(item.observation_byte_size, 1, 4 * 1024 * 1024)
          || !isDigest(item.pre_scan_state_digest) || !isIso(item.started_at)) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "ObservationAuthority relations are invalid.");
      }
      break;
    case "gkos-watcher-batch-record/1.0.0-draft.1":
      sealBatchRecord(item);
      break;
    case "gkos-watcher-batch-plan/1.0.0-draft.1":
      sealPlan(item);
      break;
    case "gkos-watcher-plan-authority/1.0.0-draft.1":
      if (!isUuid7(item.batch_id) || !isDigest(item.observation_digest) || !isDigest(item.plan_digest)
          || item.plan_artifact_file !== `watcher-plan-${String(item.plan_digest).slice(7)}.json`
          || !isDigest(item.plan_raw_sha256) || !integer(item.plan_byte_size, 1, 512 * 1024 * 1024)
          || !isDigest(item.target_topology_snapshot_digest) || !integer(item.source_removal_event_count, 0, 1_000_000)
          || (item.source_removal_event_count === 0) !== (item.source_removal_event_set_digest === null)
          || item.source_removal_event_count > 0 && !isDigest(item.source_removal_event_set_digest)) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "PlanAuthority relations are invalid.");
      }
      break;
    case "gkos-watcher-pre-scan-state/1.0.0-draft.1": {
      const active = [item.active_pointer_digest, item.active_coherent_manifest_digest, item.topology_snapshot_digest];
      if (!validLabel(item.vault_id) || !isDigest(item.configuration_digest) || !isDigest(item.policy_digest)
          || !isDigest(item.effective_profile_digest) || !(active.every((value) => value === null) || active.every(isDigest))) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "PreScanState genesis/active coordinate relation is invalid.");
      }
      break;
    }
    case "gkos-watcher-topology-snapshot/1.0.0-draft.1":
      sealTopology(item);
      break;
    case "gkos-watcher-transition/1.0.0-draft.1":
      sealTransition(item);
      break;
    case "gkos-watcher-normalized-graph-delta/1.0.0-draft.1":
      sealNormalizedGraphDelta(item);
      break;
    case "gkos-watcher-canonical-gkx-graph/1.0.0-draft.1": {
      const graph = record(item.normalized_graph, "canonical GKX graph");
      const resealed = normalizeAlreadyCanonicalGkxGraph(graph);
      if (stableJson(item) !== stableJson(resealed)) {
        fail("GKX_WATCHER_CONTRACT_GRAPH_INVALID", "canonical GKX graph ordering/timing normalization is invalid.");
      }
      break;
    }
    case "gkos-watcher-graphiti-projection/1.0.0-draft.1":
      sealGraphitiProjection(item);
      break;
    case "gkos-watcher-raw-graph-artifact/1.0.0-draft.1":
      if (!isWatcherGenerationId(item.service_generation_id) || !isDigest(item.topology_snapshot_digest)) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "raw graph artifact authority is invalid.");
      }
      assertRawGraphShape(item.graph, false);
      break;
    case "gkos-watcher-coherent-manifest/1.0.0-draft.1":
      sealCoherentManifest(item);
      break;
    case "gkos-watcher-active-pointer/1.0.0-draft.1":
      if (item.kind !== "watcher_coherent" || !isWatcherGenerationId(item.service_generation_id) || !isDigest(item.coherent_manifest_digest)
          || item.coherent_manifest_file !== `watcher-coherent-${String(item.coherent_manifest_digest).slice(7)}.json`
          || item.prior_pointer_digest !== null && !isDigest(item.prior_pointer_digest)) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "watcher pointer relation is invalid.");
      }
      break;
    case "gkos-watcher-journal-meta/1.0.0-draft.1":
      if (!isUuid7(item.journal_instance_id) || !validLabel(item.vault_id) || !isDigest(item.configuration_digest)
          || !isDigest(item.policy_digest) || !isDigest(item.effective_profile_digest)
          || item.anchor_coherent_manifest_digest !== null && !isDigest(item.anchor_coherent_manifest_digest) || !isIso(item.created_at)) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "journal meta authority is invalid.");
      }
      break;
    case "gkos-watcher-activation-intent/1.0.0-draft.1":
      sealActivationIntent(item);
      break;
    case "gkos-watcher-activation-outcome/1.0.0-draft.1":
      sealActivationOutcome(item);
      break;
    case "gkos-watcher-active-coherent/1.0.0-draft.1":
      if (!isWatcherGenerationId(item.service_generation_id) || !isDigest(item.coherent_manifest_digest) || !isDigest(item.pointer_digest)
          || !isDigest(item.intent_digest) || !isIso(item.activated_at)) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "ActiveCoherent relation is invalid.");
      }
      break;
    case "gkos-watcher-authority/1.0.0-draft.1":
      if (item.kind !== "watcher_coherent_authority" || !validLabel(item.vault_id) || !isDigest(item.configuration_digest)
          || !isDigest(item.policy_digest) || !isDigest(item.effective_profile_digest) || !isWatcherGenerationId(item.first_service_generation_id)
          || !isDigest(item.first_coherent_manifest_digest) || !isDigest(item.first_pointer_digest)) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "watcher authority witness is invalid.");
      }
      break;
    case "gkos-watcher-journal-generation/1.0.0-draft.1":
      if (!isUuid7(item.journal_instance_id) || item.directory_leaf !== `journal-${String(item.journal_instance_id)}`
          || item.database_file !== "watcher-journal.sqlite" || !isDigest(item.meta_digest)
          || item.anchor_coherent_manifest_digest !== null && !isDigest(item.anchor_coherent_manifest_digest) || !isIso(item.created_at)) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "journal generation relation is invalid.");
      }
      break;
    case "gkos-watcher-journal-active-pointer/1.0.0-draft.1":
      if (item.kind !== "watcher_journal" || !isDigest(item.journal_generation_digest)
          || item.journal_generation_file !== `watcher-journal-generation-${String(item.journal_generation_digest).slice(7)}.json`
          || item.prior_pointer_digest !== null && !isDigest(item.prior_pointer_digest)) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "journal pointer relation is invalid.");
      }
      break;
    case "gkos-watcher-journal-file-identity/1.0.0-draft.1":
      sealJournalFileIdentity(item);
      break;
    case "gkos-watcher-journal-archive/1.0.0-draft.1":
      sealJournalArchive(item);
      break;
    case "gkos-watcher-journal-reset/1.0.0-draft.1":
      if (!isUuid7(item.reset_id) || !isDigest(item.prior_journal_generation_digest) || !isDigest(item.archive_manifest_digest)
          || !isDigest(item.new_journal_meta_digest) || !isDigest(item.new_journal_generation_digest)
          || !isDigest(item.target_journal_pointer_digest) || !isDigest(item.outer_coherent_manifest_digest)
          || !integer(item.ready_event_count, 0, 1_000_000) || (item.ready_event_count === 0) !== (item.reset_carry_event_set_digest === null)
          || (item.ready_event_count === 0) !== (item.reset_carry_activation_digest === null)
          || item.ready_event_count > 0 && (!isDigest(item.reset_carry_event_set_digest) || !isDigest(item.reset_carry_activation_digest)) || !isIso(item.reset_at)) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "journal reset relation is invalid.");
      }
      break;
    case "gkos-watcher-journal-reset-guard/1.0.0-draft.1":
      sealJournalResetGuard(item);
      break;
    case "gkos-watcher-pointer-replace-guard/1.0.0-draft.1":
      sealPointerGuard(item);
      break;
    case "gkos-watcher-pointer-recovery-decision/1.0.0-draft.1":
      sealPointerRecoveryDecision(item);
      break;
    case "gkos-watcher-source-removal-authorization-scope/1.0.0-draft.1":
      sealAuthorizationScope(item);
      break;
    case "gkos-watcher-source-removal-adapter-binding/1.0.0-draft.1":
      sealAdapterBinding(item);
      break;
    case "gkos-watcher-source-removal-adapter-challenge/1.0.0-draft.1":
      if (!validLabel(item.vault_id) || !isDigest(item.configuration_digest) || !isDigest(item.policy_digest)
          || typeof item.nonce !== "string" || !/^[0-9a-f]{32}$/u.test(item.nonce)
          || stableJson(item.required_capabilities) !== stableJson([
            "durable_idempotent_source_removal_projection",
            "lookup_by_occurrence_digest",
          ])) {
        fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "adapter challenge is invalid.");
      }
      break;
    case "gkos-watcher-source-removal-adapter-proof/1.0.0-draft.1":
      if (!isDigest(item.challenge_digest) || !isDigest(item.binding_digest)
          || !["governance_store", "durable_ledger"].includes(String(item.adapter_kind)) || !validLabel(item.adapter_id)
          || !validLabel(item.adapter_contract_version) || !validLabel(item.authority_namespace)
          || !isDigest(item.authorization_binding_digest)
          || stableJson(item.capabilities) !== stableJson(["durable_idempotent_source_removal_projection", "lookup_by_occurrence_digest"])) {
        fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "adapter proof is invalid.");
      }
      break;
    case "gkos-watcher-source-removal-adapter-verification/1.0.0-draft.1":
      if (!isDigest(item.binding_digest) || !isDigest(item.challenge_digest) || !isDigest(item.proof_digest)
          || !isUuid7(item.process_instance_id) || !isIso(item.verified_at) || !isDigest(item.capability_nonce_digest)) {
        fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "adapter verification receipt is invalid.");
      }
      break;
    case "gkos-watcher-source-removal-occurrence/1.0.0-draft.1":
      if (!validLabel(item.vault_id) || !isDigest(item.prior_coherent_manifest_digest) || !isDigest(item.prior_topology_snapshot_digest)
          || !isValidGkxAuthoredUid(item.source_id) || item.cause !== "physical_disappearance" || !isDigest(item.source_digest)) {
        fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal occurrence cause/source digest is invalid.");
      }
      assertSourcePath(item.source_path, "source-removal source_path");
      break;
    case "gkos-watcher-source-removal-event/1.0.0-draft.1":
      if (!isDigest(item.occurrence_digest)
          || (item.delivery_mode === "local_only" ? item.adapter_binding_digest !== null : item.delivery_mode !== "adapter" || !isDigest(item.adapter_binding_digest))) {
        fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal delivery mode does not match its adapter binding.");
      }
      break;
    case "gkos-watcher-source-removal-event-membership/1.0.0-draft.1":
      if (!integer(item.event_ordinal, 1) || !isDigest(item.event_digest) || !isUuid7(item.causal_batch_id)
          || !isDigest(item.target_topology_snapshot_digest)
          || item.original_membership_digest !== null && !isDigest(item.original_membership_digest) || !isIso(item.prepared_at)) {
        fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal membership is invalid.");
      }
      break;
    case "gkos-watcher-source-removal-event-set/1.0.0-draft.1":
      if (!integer(item.event_count, 1, 1_000_000) || !["batch", "reset_carry"].includes(String(item.set_kind)) || !isUuid7(item.origin_id)
          || !isDigest(item.membership_digest_sequence_digest)
          || item.set_kind === "batch" && !isDigest(item.target_topology_snapshot_digest)
          || item.set_kind === "reset_carry" && item.target_topology_snapshot_digest !== null
          || !isIso(item.prepared_at)) {
        fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal event set is invalid.");
      }
      break;
    case "gkos-watcher-source-removal-membership-sequence/1.0.0-draft.1":
      if (!Array.isArray(item.membership_digests) || item.membership_digests.some((value) => !isDigest(value))) {
        fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal membership sequence is invalid.");
      }
      break;
    case "gkos-watcher-source-removal-event-set-activation/1.0.0-draft.1":
      if (!isDigest(item.event_set_digest) || !isDigest(item.coherent_manifest_digest) || !isIso(item.activated_at)) {
        fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal activation is invalid.");
      }
      break;
    case "gkos-watcher-source-removal-adapter-request/1.0.0-draft.1":
      if (!isDigest(item.binding_digest) || !isDigest(item.occurrence_digest) || item.idempotency_key !== item.occurrence_digest
          || !isValidGkxAuthoredUid(item.source_id) || !isDigest(item.source_digest) || !isDigest(item.prior_coherent_manifest_digest)
          || !isDigest(item.target_topology_snapshot_digest) || !isIso(item.observed_at)) {
        fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "adapter request is invalid.");
      }
      assertSourcePath(item.source_path, "adapter request source_path");
      break;
    case "gkos-watcher-source-removal-adapter-response/1.0.0-draft.1":
      if (!["accepted", "already_applied"].includes(String(item.status)) || !validLabel(item.adapter_event_id)) {
        fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "adapter response is invalid.");
      }
      if (item.adapter_result_digest !== retrievalCanonicalDigest({
        contract_version: "gkos-watcher-source-removal-adapter-result/1.0.0-draft.1",
        binding_digest: item.binding_digest,
        occurrence_digest: item.occurrence_digest,
        adapter_event_id: item.adapter_event_id,
      })) fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "adapter result digest is invalid.");
      break;
    case "gkos-watcher-source-removal-receipt/1.0.0-draft.1":
      if (!["accepted", "already_applied"].includes(String(item.status)) || !isDigest(item.event_digest)
          || !isDigest(item.occurrence_digest) || !isDigest(item.adapter_binding_digest) || !isDigest(item.adapter_response_digest)
          || !isDigest(item.adapter_result_digest) || !validLabel(item.adapter_event_id) || !isIso(item.recorded_at)) {
        fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "adapter receipt is invalid.");
      }
      break;
    case "gkos-watcher-service-locator/1.0.0-draft.1":
      if (!isUuid7(item.service_instance_id) || !integer(item.pid, 1) || item.loopback_host !== "127.0.0.1"
          || !integer(item.port, 1, 65_535) || item.status_route !== "/status" || item.control_route !== "/control/shutdown"
          || !isIso(item.started_at)) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "service locator is invalid.");
      }
      break;
    case "gkos-watcher-status/1.0.0-draft.1":
      sealStatus(item);
      break;
    case "gkos-watcher-journal-reset-result/1.0.0-draft.1":
      if (item.status !== "reset" || item.requires_reconciliation !== true || !isDigest(item.prior_journal_generation_digest)
          || !isDigest(item.archive_manifest_digest) || !isDigest(item.new_journal_generation_digest)
          || !isDigest(item.outer_coherent_manifest_digest) || !isDigest(item.reset_digest)) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "journal reset result is invalid.");
      }
      break;
    case "gkos-watcher-fts-qualification-outcome/1.0.0-draft.1":
      sealFtsOutcome(item);
      break;
    case "gkos-watcher-observation-environment/1.0.0-draft.1":
      if (item.runtime !== "node" || !validOpaqueIdentity(item.runtime_version) || !["linux", "windows"].includes(String(item.os))
          || item.arch !== "x64" || !validOpaqueIdentity(item.sqlite_version) || typeof item.physical_fts5_available !== "boolean"
          || !["local", "github_hosted"].includes(String(item.runner_class))) {
        fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "observation environment is invalid.");
      }
      break;
    case "gkos-watcher-observation-convergence/1.0.0-draft.1":
      sealConvergence(item);
      break;
    case "gkos-watcher-observation-measurement/1.0.0-draft.1":
      sealMeasurement(item);
      break;
    case "gkos-watcher-recovery-pack-manifest/1.0.0-draft.1":
      sealPackManifest(item);
      break;
  }
}

function assertSourcePath(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 1_024 || !isValidRetrievalSourcePath(value)
      || value.includes(":") || /^(?:[a-z][a-z0-9+.-]*:|[a-z]:|\/\/|\\\\|\\\?\\|\\\.\\)/iu.test(value)
      || /[\u007f]/u.test(value) || /[\ud800-\udfff]/u.test(value)) {
    fail("GKX_WATCHER_CONTRACT_PATH_INVALID", `${label} is not a normalized vault-relative path.`);
  }
}

function validLabel(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9](?:[a-z0-9._:-]{0,127})$/u.test(value);
}

function validOpaqueIdentity(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 512
      || value.trim().length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) {
    return false;
  }
  try {
    stableJson(value);
    return true;
  } catch {
    return false;
  }
}

function sealBatchRecord(item: JsonRecord): void {
  const kind = item.batch_kind;
  const execution = item.execution_kind;
  if (!isUuid7(item.batch_id) || !["event", "startup_reconciliation", "shutdown_flush", "failure_reconciliation"].includes(String(kind))
      || !["apply_changes", "set_files"].includes(String(execution)) || !isIso(item.started_at)
      || (kind === "failure_reconciliation") !== isUuid7(item.retry_of_batch_id)) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "BatchRecord kind/execution/retry relation is invalid.");
  }
  if ((kind === "startup_reconciliation" || kind === "failure_reconciliation") && execution !== "set_files") {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "reconciliation batches require set_files.");
  }
}

function sealPlan(item: JsonRecord): void {
  if (!isUuid7(item.batch_id) || !isDigest(item.observation_digest) || !isDigest(item.topology_snapshot_digest)
      || !isDigest(item.effective_profile_digest) || !isDigest(item.validation_result_digest)
      || !isDigest(item.rejection_journal_digest) || !Array.isArray(item.intended_source_mutations)
      || item.intended_source_mutations.length > 1_000_000 || typeof item.folder_set_changed !== "boolean"
      || typeof item.attachment_set_changed !== "boolean" || !isDigest(item.mutation_set_digest)) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "watcher Plan envelope is invalid.");
  }
  let priorMutationKey: string | null = null;
  for (const raw of item.intended_source_mutations as unknown[]) {
    const mutation = record(raw, "source mutation");
    exactKeys(mutation, [
      "kind", "cause", "from_path", "to_path", "source_id_before", "source_id_after", "source_digest_before",
      "source_digest_after", "parser_descriptor_digest_before", "parser_descriptor_digest_after",
    ], "source mutation");
    if (!["add", "change", "delete", "rename"].includes(String(mutation.kind))
        || !["physical_appearance", "physical_disappearance", "content_change", "metadata_change", "verified_rename", "validation_rejection", "validation_reacceptance"].includes(String(mutation.cause))) {
      fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "source mutation fields are invalid.");
    }
    for (const field of ["from_path", "to_path"] as const) if (mutation[field] !== null) assertSourcePath(mutation[field], `mutation ${field}`);
    for (const field of ["source_id_before", "source_id_after"] as const) {
      if (mutation[field] !== null && !isValidGkxAuthoredUid(mutation[field])) fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", `mutation ${field} is invalid.`);
    }
    for (const field of ["source_digest_before", "source_digest_after", "parser_descriptor_digest_before", "parser_descriptor_digest_after"] as const) {
      if (mutation[field] !== null && !isDigest(mutation[field])) fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", `mutation ${field} is invalid.`);
    }
    const before = mutation.from_path !== null && mutation.source_id_before !== null && mutation.source_digest_before !== null && mutation.parser_descriptor_digest_before !== null;
    const after = mutation.to_path !== null && mutation.source_id_after !== null && mutation.source_digest_after !== null && mutation.parser_descriptor_digest_after !== null;
    if (mutation.kind === "add" && (!after || mutation.from_path !== null || mutation.source_id_before !== null || mutation.source_digest_before !== null
          || mutation.parser_descriptor_digest_before !== null || !["physical_appearance", "validation_reacceptance"].includes(String(mutation.cause)))
        || mutation.kind === "delete" && (!before || mutation.to_path !== null || mutation.source_id_after !== null || mutation.source_digest_after !== null
          || mutation.parser_descriptor_digest_after !== null || !["physical_disappearance", "validation_rejection"].includes(String(mutation.cause)))
        || mutation.kind === "change" && (!before || !after || mutation.from_path !== mutation.to_path
          || mutation.source_id_before !== mutation.source_id_after || !["content_change", "metadata_change"].includes(String(mutation.cause)))
        || mutation.kind === "rename" && (!before || !after || mutation.from_path === mutation.to_path
          || mutation.source_id_before !== mutation.source_id_after || mutation.source_digest_before !== mutation.source_digest_after
          || mutation.parser_descriptor_digest_before !== mutation.parser_descriptor_digest_after || mutation.cause !== "verified_rename")) {
      fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", `source mutation ${String(mutation.kind)} relation is invalid.`);
    }
    const key = `${String(mutation.from_path ?? mutation.to_path)}\u0000${String(mutation.to_path ?? "")}\u0000${String(mutation.kind)}\u0000${String(mutation.cause)}`;
    if (priorMutationKey !== null && retrievalCodeUnitCompare(priorMutationKey, key) >= 0) {
      fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "source mutations are not sorted and unique.");
    }
    priorMutationKey = key;
  }
}

function sealPreScanState(value: unknown): Readonly<JsonRecord> {
  const state = sealWatcherRecoveryRecord(value);
  const active = [state.active_pointer_digest, state.active_coherent_manifest_digest, state.topology_snapshot_digest];
  if (!validLabel(state.vault_id) || !isDigest(state.configuration_digest) || !isDigest(state.policy_digest) || !isDigest(state.effective_profile_digest)
      || !(active.every((coordinate) => coordinate === null) || active.every(isDigest))) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "PreScanState genesis/active coordinate relation is invalid.");
  }
  return state;
}

function sealSourceRows(acceptedRaw: unknown[], rejectedRaw: unknown[]): void {
  if (acceptedRaw.length > 1_000_000 || rejectedRaw.length > 1_000_000
      || acceptedRaw.length + rejectedRaw.length > 1_000_000) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "topology source row count exceeds the cap.");
  }
  const observationOrdinals = new Set<number>();
  const paths: string[] = [];
  let priorKey: string | null = null;
  for (const raw of acceptedRaw) {
    const source = record(raw, "accepted source");
    exactKeys(source, ["source_path", "source_id", "source_observation_ordinal", "source_digest", "source_size_bytes", "parser_descriptor_digest"], "accepted source");
    if (!isValidGkxAuthoredUid(source.source_id) || !integer(source.source_observation_ordinal, 0, 999_999)
        || !isDigest(source.source_digest) || !integer(source.source_size_bytes, 0, 64 * 1024 * 1024)
        || !isDigest(source.parser_descriptor_digest)) fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "accepted source is invalid.");
    assertSourcePath(source.source_path, "accepted source_path");
    const key = `${String(source.source_path)}\u0000${String(source.source_observation_ordinal).padStart(7, "0")}\u0000${String(source.source_digest)}`;
    if (priorKey !== null && retrievalCodeUnitCompare(priorKey, key) >= 0) fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "accepted sources are not sorted and unique.");
    priorKey = key;
    paths.push(source.source_path as string);
    if (observationOrdinals.has(source.source_observation_ordinal as number)) fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "source observation ordinal is duplicated.");
    observationOrdinals.add(source.source_observation_ordinal as number);
  }
  priorKey = null;
  for (const raw of rejectedRaw) {
    const source = record(raw, "rejected source");
    exactKeys(source, ["source_path", "source_id", "source_observation_ordinal", "source_digest", "source_size_bytes", "parser_descriptor_digest", "rejection_digest", "rejection_class"], "rejected source");
    if (source.source_id !== null && !isValidGkxAuthoredUid(source.source_id) || !integer(source.source_observation_ordinal, 0, 999_999)
        || source.source_digest !== null && !isDigest(source.source_digest)
        || source.source_size_bytes !== null && !integer(source.source_size_bytes, 0, 64 * 1024 * 1024) || source.parser_descriptor_digest !== null && !isDigest(source.parser_descriptor_digest)
        || !isDigest(source.rejection_digest) || !["validation", "scan_rejection"].includes(String(source.rejection_class))) {
      fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "rejected source is invalid.");
    }
    assertSourcePath(source.source_path, "rejected source_path");
    const key = `${String(source.source_path)}\u0000${String(source.source_observation_ordinal).padStart(7, "0")}\u0000${String(source.source_digest ?? "")}`;
    if (priorKey !== null && retrievalCodeUnitCompare(priorKey, key) >= 0) fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "rejected sources are not sorted and unique.");
    priorKey = key;
    paths.push(source.source_path as string);
    if (observationOrdinals.has(source.source_observation_ordinal as number)) fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "source observation ordinal is duplicated.");
    observationOrdinals.add(source.source_observation_ordinal as number);
  }
  if (new Set(paths).size !== paths.length) fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "accepted/rejected source paths overlap.");
}

function sealTopology(item: JsonRecord): void {
  if (!validLabel(item.vault_id) || !isDigest(item.source_observation_snapshot_digest)
      || !isDigest(item.validation_result_digest) || !isDigest(item.rejection_journal_digest)
      || !Array.isArray(item.accepted_sources) || !Array.isArray(item.rejected_sources)
      || !stringArray(item.folder_paths, { max: 1_000_000, sorted: true, unique: true })
      || !stringArray(item.attachment_paths, { max: 1_000_000, sorted: true, unique: true })) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "TopologySnapshot envelope is invalid.");
  }
  sealSourceRows(item.accepted_sources as unknown[], item.rejected_sources as unknown[]);
  for (const path of [...item.folder_paths as string[], ...item.attachment_paths as string[]]) assertSourcePath(path, "topology path");
  const expectedAccepted = retrievalCanonicalDigest({ contract_version: "gkos-watcher-accepted-source-set/1.0.0-draft.1", sources: item.accepted_sources });
  const expectedRejected = retrievalCanonicalDigest({ contract_version: "gkos-watcher-rejected-source-set/1.0.0-draft.1", sources: item.rejected_sources });
  const expectedFolders = retrievalCanonicalDigest({ contract_version: "gkos-watcher-folder-set/1.0.0-draft.1", folder_paths: item.folder_paths });
  const expectedAttachments = retrievalCanonicalDigest({ contract_version: "gkos-watcher-attachment-set/1.0.0-draft.1", attachment_paths: item.attachment_paths });
  if (item.accepted_source_set_digest !== expectedAccepted || item.rejected_source_set_digest !== expectedRejected
      || item.folder_set_digest !== expectedFolders || item.attachment_set_digest !== expectedAttachments) {
    fail("GKX_WATCHER_CONTRACT_DIGEST_INVALID", "TopologySnapshot child set digest is invalid.");
  }
}

function sealActivationIntent(item: JsonRecord): void {
  const pointer = sealWatcherRecoveryRecord(item.target_pointer);
  const complete = sealWatcherRecoveryRecord(item.target_complete_transition);
  if (complete.state !== "complete" || complete.terminal_state !== "complete" || complete.prior_transition_digest !== item.prepared_transition_digest
      || pointer.coherent_manifest_digest !== item.coherent_manifest_digest || pointer.prior_pointer_digest !== item.prior_pointer_digest
      || !isIso(item.prepared_at)) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "ActivationIntent external DAG relation is invalid.");
  }
}

function sealCoherentManifest(item: JsonRecord): void {
  if (!isWatcherGenerationId(item.service_generation_id) || !isUuid7(item.completed_batch_id)
      || item.service_generation_id !== `watcher:${String(item.completed_batch_id)}` || !validLabel(item.vault_id)
      || !isDigest(item.completed_transition_digest) || !isDigest(item.topology_snapshot_digest)
      || item.topology_artifact_file !== `watcher-topology-${String(item.topology_snapshot_digest).slice(7)}.json`
      || !isDigest(item.topology_artifact_raw_sha256) || !isDigest(item.source_observation_snapshot_digest)
      || !isDigest(item.effective_profile_digest) || !isDigest(item.validation_result_digest)
      || !isDigest(item.rejection_journal_digest) || !isDigest(item.configuration_digest) || !isDigest(item.policy_digest)
      || !isDigest(item.gkx_snapshot_digest) || !integer(item.source_removal_event_count, 0, 1_000_000)
      || (item.source_removal_event_count === 0) !== (item.source_removal_event_set_digest === null)
      || item.source_removal_event_count > 0 && !isDigest(item.source_removal_event_set_digest) || !isIso(item.created_at)) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "CoherentManifest relation is invalid.");
  }
  sealRetrievalProjectionState(item.retrieval_projection_state);
  sealGraphProjectionState(item.graph_projection_state);
}

function sealTransition(item: JsonRecord): void {
  const ordinal = item.transition_ordinal;
  const state = item.state;
  const normalIndex = (WATCHER_NORMAL_STATES as readonly string[]).indexOf(String(state));
  const exceptional = (WATCHER_EXCEPTIONAL_STATES as readonly string[]).includes(String(state));
  if (!isUuid7(item.batch_id) || !integer(ordinal, 0, 6) || (!exceptional && normalIndex !== ordinal)
      || ordinal === 0 && item.prior_transition_digest !== null
      || ordinal > 0 && !isDigest(item.prior_transition_digest)
      || !isDigest(item.observation_digest) || !WATCHER_NORMAL_STATES.includes(item.last_reached_state as never)
      || !["open", "complete", "failed", "superseded"].includes(String(item.terminal_state))
      || !stringArray(item.reason_codes, { max: 16, sorted: true, unique: true }) || !isIso(item.recorded_at)) {
    fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "transition progression is invalid.");
  }
  if (exceptional) {
    if (!integer(ordinal, 1, 6) || item.last_reached_state !== WATCHER_NORMAL_STATES[ordinal - 1]
        || item.terminal_state !== state || !isIso(item.completed_at) || (item.reason_codes as string[]).length < 1) {
      fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "exceptional transition must be final and reasoned.");
    }
  } else if (state === "complete") {
    if (item.last_reached_state !== "complete" || item.terminal_state !== "complete" || !isIso(item.completed_at) || (item.reason_codes as string[]).length !== 0) {
      fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "complete transition terminal fields are invalid.");
    }
  } else if (item.last_reached_state !== state || item.terminal_state !== "open" || item.completed_at !== null || (item.reason_codes as string[]).length !== 0) {
    fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "nonterminal transition fields are invalid.");
  }
  for (const code of item.reason_codes as string[]) {
    if (!(WATCHER_TRANSITION_REASON_CODES as readonly string[]).includes(code)) {
      fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", `unknown transition reason ${code}.`);
    }
  }
  for (const field of ["plan_digest", "gkx_delta_digest", "gkx_snapshot_digest"] as const) {
    if (item[field] !== null && !isDigest(item[field])) {
      fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", `transition ${field} is invalid.`);
    }
  }
  sealRetrievalProjectionState(item.retrieval_projection_state);
  sealGraphProjectionState(item.graph_projection_state);
  if (!exceptional) {
    const required = {
      plan: normalIndex >= 1,
      gkx: normalIndex >= 2,
      retrieval: normalIndex >= 3,
      graph: normalIndex >= 4,
    };
    if (isDigest(item.plan_digest) !== required.plan || isDigest(item.gkx_delta_digest) !== required.gkx
        || isDigest(item.gkx_snapshot_digest) !== required.gkx
        || (item.retrieval_projection_state as JsonRecord).state !== (required.retrieval ? "ready" : "not_started")
        || (item.graph_projection_state as JsonRecord).state !== (required.graph ? "ready" : "not_started")) {
      fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "transition stage payload/nullability relation is invalid.");
    }
  }
}

function sealRetrievalProjectionState(value: unknown): Readonly<JsonRecord> {
  const item = canonicalRecord(value, "retrieval projection state");
  exactKeys(item, ["state", "owner_generation_id", "owner_manifest_digest", "database_file", "manifest_digest", "projection_id", "projection_digest", "lexical_backend", "vector_stage_state", "provider_kind", "provider_id", "model_id", "dimensions", "reason_codes"], "retrieval projection state");
  if (!["not_started", "ready"].includes(String(item.state)) || !stringArray(item.reason_codes, { max: 64, sorted: true, unique: true })) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "retrieval projection state is invalid.");
  }
  const identities = [item.owner_generation_id, item.owner_manifest_digest, item.database_file, item.manifest_digest, item.projection_id, item.projection_digest, item.lexical_backend, item.vector_stage_state];
  if (item.state === "not_started") {
    if (!identities.every((entry) => entry === null) || item.provider_kind !== null || item.provider_id !== null || item.model_id !== null
        || item.dimensions !== null || (item.reason_codes as string[]).length !== 0) fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "not-started retrieval projection has coordinates.");
  } else {
    if (typeof item.owner_generation_id !== "string" || !/^ingest:[0-9a-f]{24}$/u.test(item.owner_generation_id)
        || !isDigest(item.owner_manifest_digest) || typeof item.database_file !== "string" || !isDigest(item.manifest_digest)
        || typeof item.projection_id !== "string" || !isDigest(item.projection_digest)
        || item.owner_generation_id !== `ingest:${String(item.owner_manifest_digest).slice(7, 31)}`
        || item.projection_id !== `retrieval:${String(item.projection_digest).slice(7, 31)}`
        || item.database_file !== `retrieval-${String(item.projection_digest).slice(7)}.sqlite`
        || !["sqlite_fts5", "sqlite_lexical_scan"].includes(String(item.lexical_backend))
        || !["disabled", "complete", "degraded"].includes(String(item.vector_stage_state))) fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "ready retrieval projection is invalid.");
    const disabled = item.vector_stage_state === "disabled";
    if (disabled !== [item.provider_kind, item.provider_id, item.model_id, item.dimensions].every((entry) => entry === null)
        || !disabled && (!(["openai_compatible", "local_onnx", "mcp"] as readonly unknown[]).includes(item.provider_kind)
          || typeof item.provider_id !== "string" || typeof item.model_id !== "string" || !integer(item.dimensions, 1))) {
      fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "retrieval provider identity relation is invalid.");
    }
  }
  return deepFreeze(item);
}

function sealGraphProjectionState(value: unknown): Readonly<JsonRecord> {
  const item = canonicalRecord(value, "graph projection state");
  exactKeys(item, ["state", "graph_contract_version", "graph_artifact_file", "graph_artifact_digest", "canonical_graph_digest", "gkx_delta_digest", "graphiti_projection_digest", "sink_state", "sink_receipts", "reason_codes"], "graph projection state");
  if (!["not_started", "ready"].includes(String(item.state)) || item.sink_state !== "not_applicable"
      || !Array.isArray(item.sink_receipts) || item.sink_receipts.length !== 0 || !stringArray(item.reason_codes, { max: 64, sorted: true, unique: true })) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "graph projection state is invalid.");
  }
  const coordinates = [item.graph_contract_version, item.graph_artifact_file, item.graph_artifact_digest, item.canonical_graph_digest, item.gkx_delta_digest, item.graphiti_projection_digest];
  if (item.state === "not_started" ? !coordinates.every((entry) => entry === null) || (item.reason_codes as string[]).length !== 0
    : item.graph_contract_version !== "gkos-watcher-canonical-gkx-graph/1.0.0-draft.1" || typeof item.graph_artifact_file !== "string"
      || !coordinates.slice(2).every(isDigest)
      || item.graph_artifact_file !== `watcher-graph-${String(item.graph_artifact_digest).slice(7)}.json`
      || (item.reason_codes as string[]).length !== 0) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "graph projection coordinate relation is invalid.");
  }
  return deepFreeze(item);
}

function sealNormalizedGraphDelta(item: JsonRecord): void {
  const delta = record(item.delta, "normalized GraphDelta");
  exactKeys(delta, ["addedNodes", "removedNodes", "changedNodes", "topologyChanged", "reparsed", "fullRebuild"], "normalized GraphDelta");
  if (!stringArray(delta.addedNodes, { sorted: true, unique: true })
      || !stringArray(delta.removedNodes, { sorted: true, unique: true })
      || !stringArray(delta.changedNodes, { sorted: true, unique: true })
      || typeof delta.topologyChanged !== "boolean" || !integer(delta.reparsed) || typeof delta.fullRebuild !== "boolean") {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "normalized GraphDelta relation is invalid.");
  }
}

function sealGraphitiProjection(item: JsonRecord): void {
  if (item.processing_time !== "1970-01-01T00:00:00.000Z" || !Array.isArray(item.episodes) || item.episodes.length > 1_000_000) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "Graphiti projection envelope is invalid.");
  }
  for (const raw of item.episodes) {
    const episode = record(raw, "Graphiti episode");
    const metadata = record(episode.episode_metadata, "Graphiti episode metadata");
    if (metadata.processing_time !== item.processing_time || typeof episode.episode_body !== "string") {
      fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "Graphiti episode processing coordinate is invalid.");
    }
    let body: JsonRecord;
    try {
      body = record(JSON.parse(episode.episode_body), "Graphiti episode body");
    } catch {
      fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "Graphiti episode body is invalid JSON.");
    }
    if (body.processing_time !== item.processing_time || episode.episode_body !== stableJson(body)) {
      fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "Graphiti episode body processing coordinate is invalid.");
    }
  }
}

function sealActivationOutcome(item: JsonRecord): void {
  if (!isDigest(item.intent_digest) || !isDigest(item.coherent_manifest_digest)
      || !["published", "superseded"].includes(String(item.outcome))
      || item.pointer_digest !== null && !isDigest(item.pointer_digest)
      || !stringArray(item.reason_codes, { sorted: true, unique: true }) || !isIso(item.recorded_at)
      || item.outcome === "published" && (!isDigest(item.pointer_digest) || (item.reason_codes as string[]).length !== 0)
      || item.outcome === "superseded" && (item.reason_codes as string[]).length === 0) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "ActivationOutcome relation is invalid.");
  }
}

function decimalIdentity(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value);
}

function sealJournalFileIdentity(item: JsonRecord): void {
  const leaves: Record<string, string> = {
    database: "watcher-journal.sqlite",
    wal: "watcher-journal.sqlite-wal",
    shm: "watcher-journal.sqlite-shm",
  };
  if (!Object.hasOwn(leaves, String(item.role)) || item.leaf !== leaves[String(item.role)]
      || !decimalIdentity(item.device) || !decimalIdentity(item.inode) || item.mode !== 384
      || !integer(item.byte_size, item.role === "database" ? 1 : 0, item.role === "database" ? 2_048_000_000 : Number.MAX_SAFE_INTEGER)
      || !isDigest(item.raw_sha256)) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "journal file identity is invalid.");
  }
}

function sealJournalArchive(item: JsonRecord): void {
  const database = sealWatcherRecoveryRecord(item.database_identity);
  const wal = item.wal_identity === null ? null : sealWatcherRecoveryRecord(item.wal_identity);
  const shm = item.shm_identity === null ? null : sealWatcherRecoveryRecord(item.shm_identity);
  if (!isUuid7(item.journal_instance_id) || item.directory_leaf !== `journal-${String(item.journal_instance_id)}`
      || !decimalIdentity(item.directory_device) || !decimalIdentity(item.directory_inode) || item.directory_mode !== 448
      || database.role !== "database" || wal !== null && wal.role !== "wal" || shm !== null && shm.role !== "shm"
      || !isDigest(item.outer_coherent_manifest_digest) || !isIso(item.archived_at)) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "journal archive relation is invalid.");
  }
}

function sealJournalResetGuard(item: JsonRecord): void {
  if (item.operation !== "watcher_journal_reset" || typeof item.owner_nonce !== "string" || !/^[0-9a-f]{32}$/u.test(item.owner_nonce)
      || !decimalIdentity(item.parent_device) || !decimalIdentity(item.parent_inode) || item.parent_mode !== 448
      || item.guard_basename !== ".gkos-watcher-journal-reset.guard" || item.guard_stage_basename !== ".gkos-watcher-journal-reset.guard-stage"
      || !isDigest(item.old_journal_pointer_digest) || !isDigest(item.old_journal_generation_digest)
      || !isDigest(item.outer_coherent_manifest_digest)
      || !isDigest(item.archive_manifest_digest) || !isUuid7(item.new_journal_instance_id)
      || item.new_journal_directory_leaf !== `journal-${String(item.new_journal_instance_id)}`
      || !isDigest(item.new_journal_meta_digest) || !isDigest(item.new_journal_generation_digest) || !isDigest(item.reset_digest)
      || !isDigest(item.target_journal_pointer_digest)
      || !integer(item.ready_event_count, 0, 1_000_000) || (item.ready_event_count === 0) !== (item.reset_carry_event_set_digest === null)
      || (item.ready_event_count === 0) !== (item.reset_carry_activation_digest === null)
      || item.ready_event_count > 0 && (!isDigest(item.reset_carry_event_set_digest) || !isDigest(item.reset_carry_activation_digest))) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "journal reset guard relation is invalid.");
  }
}

function sealPointerGuard(item: JsonRecord): void {
  const old = [item.old_pointer_file, item.old_pointer_digest, item.old_pointer_raw_sha256, item.old_pointer_byte_size, item.old_final_device, item.old_final_inode];
  const oldAbsent = old.every((value) => value === null);
  const oldPresent = typeof item.old_pointer_file === "string" && isDigest(item.old_pointer_digest) && isDigest(item.old_pointer_raw_sha256)
    && integer(item.old_pointer_byte_size, 1) && decimalIdentity(item.old_final_device) && decimalIdentity(item.old_final_inode);
  const names = [item.final_basename, item.guard_basename, item.guard_stage_basename, item.temp_basename];
  const namesByOperation: Record<string, readonly string[]> = {
    replace_watcher_active_pointer: ["watcher-active.json", ".watcher-active.json.gkos-watcher.guard", ".watcher-active.json.gkos-watcher.guard-stage", ".watcher-active.json.gkos-watcher.tmp"],
    replace_watcher_journal_pointer: ["watcher-journal-active.json", ".watcher-journal-active.json.gkos-watcher.guard", ".watcher-journal-active.json.gkos-watcher.guard-stage", ".watcher-journal-active.json.gkos-watcher.tmp"],
  };
  const pointerFile = (operation: string, digest: unknown): string | null => isDigest(digest)
    ? `${operation === "replace_watcher_active_pointer" ? "watcher-pointer" : "watcher-journal-pointer"}-${digest.slice(7)}.json`
    : null;
  if (!Object.hasOwn(namesByOperation, String(item.operation)) || stableJson(names) !== stableJson(namesByOperation[String(item.operation)])
      || typeof item.owner_nonce !== "string" || !/^[0-9a-f]{32}$/u.test(item.owner_nonce)
      || typeof item.parent_device !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(item.parent_device)
      || typeof item.parent_inode !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(item.parent_inode) || item.parent_mode !== 448
      || names.some((name) => typeof name !== "string" || Buffer.byteLength(name, "utf8") < 1 || Buffer.byteLength(name, "utf8") > 255)
      || new Set(names).size !== names.length || !(oldAbsent || oldPresent)
      || item.operation === "replace_watcher_journal_pointer" && !oldPresent
      || oldPresent && item.old_pointer_file !== pointerFile(String(item.operation), item.old_pointer_digest)
      || !isDigest(item.new_pointer_digest) || item.new_pointer_file !== pointerFile(String(item.operation), item.new_pointer_digest)
      || !isDigest(item.new_pointer_raw_sha256) || !integer(item.new_pointer_byte_size, 1, 1_048_576)
      || oldPresent && !integer(item.old_pointer_byte_size, 1, 1_048_576)
      || !isDigest(item.operation_intent_digest) || !isDigest(item.target_commit_digest)) {
    fail("GKX_WATCHER_CONTRACT_POINTER_INVALID", "pointer replacement guard relation is invalid.");
  }
}

type PointerLeaf = Readonly<JsonRecord> | null;

function sealPointerNamespaceLeaf(value: unknown, expectedBasename: string, label: string): PointerLeaf {
  if (value === null) return null;
  const item = canonicalRecord(value, label);
  exactKeys(item, ["basename", "device", "inode", "mode", "nlink", "body_class", "semantic_digest", "raw_sha256", "byte_size", "capability_state"], label);
  const incomplete = item.body_class === "incomplete_noncanonical";
  if (item.basename !== expectedBasename || !decimalIdentity(item.device) || !decimalIdentity(item.inode)
      || item.mode !== 384 || !integer(item.nlink, 1) || !["canonical_exact", "canonical_mismatch", "incomplete_noncanonical"].includes(String(item.body_class))
      || !["exact_owned_regular_direct_nonalias_stable", "wrong_owner", "non_regular", "symlink_or_reparse", "aliased", "outside_parent", "windows_identity_unstable"].includes(String(item.capability_state))
      || incomplete !== [item.semantic_digest, item.raw_sha256, item.byte_size].every((coordinate) => coordinate === null)
      || !incomplete && (!isDigest(item.semantic_digest) || !isDigest(item.raw_sha256) || !integer(item.byte_size, 1, 1_048_576))) {
    fail("GKX_WATCHER_CONTRACT_POINTER_INVALID", `${label} is invalid.`);
  }
  return deepFreeze(item);
}

function pointerDecision(
  selectedAction: string,
  readerAuthority: string,
  readerPointerDigest: string | null,
  evidenceDisposition: string,
): Readonly<JsonRecord> {
  const material = {
    contract_version: "gkos-watcher-pointer-recovery-decision/1.0.0-draft.1",
    selected_action: selectedAction,
    reader_authority: readerAuthority,
    reader_pointer_digest: readerPointerDigest,
    evidence_disposition: evidenceDisposition,
  };
  return sealWatcherRecoveryRecord({ ...material, decision_digest: retrievalCanonicalDigest(material) });
}

function sealPointerRecoveryDecision(item: JsonRecord): void {
  const action = String(item.selected_action);
  const authority = String(item.reader_authority);
  const disposition = String(item.evidence_disposition);
  const actionAuthorities: Readonly<Record<string, readonly string[]>> = Object.freeze({
    link_stage_to_guard: ["fixed_old", "genesis_none"],
    discard_incomplete_stage: ["fixed_old", "genesis_none"],
    unlink_stage_after_link: ["guard_bound_old", "genesis_none"],
    create_temp: ["guard_bound_old", "genesis_none"],
    replace_temp_to_fixed: ["guard_bound_old", "genesis_none"],
    discard_incomplete_temp: ["guard_bound_old", "genesis_none"],
    finalize_committed_target: ["guard_bound_old", "genesis_none"],
    serve_guard_bound_old: ["fixed_old", "guard_bound_old", "genesis_none"],
    serve_fixed_new: ["fixed_new"],
    retain_and_fail: ["fail_closed"],
  });
  const continueActions = new Set([
    "link_stage_to_guard", "discard_incomplete_stage", "unlink_stage_after_link", "create_temp",
    "replace_temp_to_fixed", "discard_incomplete_temp", "finalize_committed_target",
  ]);
  const expectedDisposition = continueActions.has(action)
    ? "continue"
    : action === "retain_and_fail" ? "retain_and_fail" : "serve";
  const nullDigestAuthority = authority === "genesis_none" || authority === "fail_closed";
  if (!Object.hasOwn(actionAuthorities, action) || !actionAuthorities[action].includes(authority)
      || disposition !== expectedDisposition
      || nullDigestAuthority !== (item.reader_pointer_digest === null)
      || !nullDigestAuthority && !isDigest(item.reader_pointer_digest)) {
    fail("GKX_WATCHER_CONTRACT_POINTER_INVALID", "pointer recovery decision relation is invalid.");
  }
}

export function classifyWatcherPointerRecovery(value: unknown, guardValue: unknown): Readonly<JsonRecord> {
  const recipe = canonicalRecord(value, "pointer recovery recipe");
  exactKeys(recipe, ["namespace_kind", "parent", "stage", "guard", "temp", "fixed", "old_artifact", "new_artifact", "committed_target_state"], "pointer recovery recipe");
  const guard = sealWatcherRecoveryRecord(guardValue);
  if (!["outer", "journal"].includes(String(recipe.namespace_kind))
      || recipe.namespace_kind === "outer" && guard.operation !== "replace_watcher_active_pointer"
      || recipe.namespace_kind === "journal" && guard.operation !== "replace_watcher_journal_pointer"
      || !["old", "prepared", "committed", "ambiguous"].includes(String(recipe.committed_target_state))) {
    fail("GKX_WATCHER_CONTRACT_POINTER_INVALID", "pointer recovery namespace/target state is invalid.");
  }
  const parent = canonicalRecord(recipe.parent, "pointer parent capability");
  exactKeys(parent, ["device", "inode", "mode", "capability_state"], "pointer parent capability");
  if (!decimalIdentity(parent.device) || !decimalIdentity(parent.inode) || !integer(parent.mode)
      || !["exact_owned_directory_nonalias_stable", "wrong_owner", "non_directory", "symlink_or_reparse", "aliased", "windows_identity_unstable"].includes(String(parent.capability_state))) {
    fail("GKX_WATCHER_CONTRACT_POINTER_INVALID", "pointer parent capability is invalid.");
  }
  const stage = sealPointerNamespaceLeaf(recipe.stage, String(guard.guard_stage_basename), "pointer stage leaf");
  const guardLeaf = sealPointerNamespaceLeaf(recipe.guard, String(guard.guard_basename), "pointer guard leaf");
  const temp = sealPointerNamespaceLeaf(recipe.temp, String(guard.temp_basename), "pointer temp leaf");
  const fixed = sealPointerNamespaceLeaf(recipe.fixed, String(guard.final_basename), "pointer fixed leaf");
  const oldArtifact = guard.old_pointer_file === null
    ? recipe.old_artifact === null ? null : fail("GKX_WATCHER_CONTRACT_POINTER_INVALID", "genesis pointer recipe has an old artifact.")
    : sealPointerNamespaceLeaf(recipe.old_artifact, String(guard.old_pointer_file), "old immutable pointer artifact");
  const newArtifact = sealPointerNamespaceLeaf(recipe.new_artifact, String(guard.new_pointer_file), "new immutable pointer artifact");
  if (newArtifact === null) fail("GKX_WATCHER_CONTRACT_POINTER_INVALID", "pointer recovery recipe lacks the new immutable pointer artifact.");
  const exactParent = parent.capability_state === "exact_owned_directory_nonalias_stable" && parent.mode === 448
    && parent.device === guard.parent_device && parent.inode === guard.parent_inode && parent.mode === guard.parent_mode;
  const leafSecure = (leaf: PointerLeaf): boolean => leaf === null || leaf.capability_state === "exact_owned_regular_direct_nonalias_stable";
  const allSecure = [stage, guardLeaf, temp, fixed, oldArtifact, newArtifact].every(leafSecure);
  const fixedRoleLinksSecure = [temp, fixed, oldArtifact, newArtifact].every((leaf) => leaf === null || leaf.nlink === 1);
  const exactBody = (leaf: PointerLeaf, digest: unknown, raw: unknown, size: unknown): boolean => leaf !== null
    && leaf.body_class === "canonical_exact" && leaf.semantic_digest === digest && leaf.raw_sha256 === raw && leaf.byte_size === size;
  const oldExact = guard.old_pointer_digest === null ? fixed === null
    : exactBody(fixed, guard.old_pointer_digest, guard.old_pointer_raw_sha256, guard.old_pointer_byte_size);
  const oldFixedIdentity = guard.old_pointer_digest === null || !oldExact
    || fixed?.device === guard.old_final_device && fixed?.inode === guard.old_final_inode;
  const newExact = exactBody(fixed, guard.new_pointer_digest, guard.new_pointer_raw_sha256, guard.new_pointer_byte_size);
  const guardBytes = canonicalPrettyBytes(guard as JsonRecord);
  const guardExact = exactBody(guardLeaf, guard.guard_digest, retrievalSha256(guardBytes), guardBytes.length);
  const newArtifactExact = exactBody(newArtifact, guard.new_pointer_digest, guard.new_pointer_raw_sha256, guard.new_pointer_byte_size);
  const oldArtifactExact = guard.old_pointer_digest === null ? oldArtifact === null
    : exactBody(oldArtifact, guard.old_pointer_digest, guard.old_pointer_raw_sha256, guard.old_pointer_byte_size);

  let readerAuthority = "fail_closed";
  let readerDigest: string | null = null;
  if (exactParent && allSecure && fixedRoleLinksSecure && oldArtifactExact && newArtifactExact && oldFixedIdentity) {
    if (guardLeaf !== null && guardExact) {
      readerAuthority = guard.old_pointer_digest === null ? "genesis_none" : "guard_bound_old";
      readerDigest = guard.old_pointer_digest as string | null;
    } else if (guardLeaf === null && oldExact) {
      readerAuthority = guard.old_pointer_digest === null ? "genesis_none" : "fixed_old";
      readerDigest = guard.old_pointer_digest as string | null;
    } else if (guardLeaf === null && newExact && recipe.committed_target_state === "committed") {
      readerAuthority = "fixed_new";
      readerDigest = guard.new_pointer_digest as string;
    }
  }
  const retain = (): Readonly<JsonRecord> => pointerDecision("retain_and_fail", "fail_closed", null, "retain_and_fail");
  if (readerAuthority === "fail_closed" || recipe.committed_target_state === "ambiguous") return retain();

  if (guard.old_pointer_digest === null) {
    const target = String(recipe.committed_target_state);
    let targetStateAllowed = false;
    if (guardLeaf === null && fixed === null && temp === null) {
      targetStateAllowed = stage === null ? target === "old" || target === "prepared" : target === "prepared";
    } else if (guardLeaf === null && stage === null && temp === null && newExact) {
      targetStateAllowed = target === "committed";
    } else if (guardLeaf !== null && fixed === null) {
      targetStateAllowed = target === "prepared";
    } else if (guardLeaf !== null && stage === null && temp === null && newExact) {
      targetStateAllowed = target === "prepared" || target === "committed";
    }
    if (!targetStateAllowed) return retain();
  }

  if (guardLeaf === null && stage !== null) {
    if (stage.nlink !== 1) return retain();
    if (stage.body_class === "incomplete_noncanonical") return pointerDecision("discard_incomplete_stage", readerAuthority, readerDigest, "continue");
    if (stage.body_class !== "canonical_exact" || stage.semantic_digest !== guard.guard_digest) return retain();
    return pointerDecision("link_stage_to_guard", readerAuthority, readerDigest, "continue");
  }
  if (guardLeaf !== null && stage !== null) {
    if (!guardExact || stage.body_class !== "canonical_exact" || stage.semantic_digest !== guard.guard_digest
        || stage.device !== guardLeaf.device || stage.inode !== guardLeaf.inode || stage.nlink !== 2 || guardLeaf.nlink !== 2) return retain();
    return pointerDecision("unlink_stage_after_link", readerAuthority, readerDigest, "continue");
  }
  if (guardLeaf !== null) {
    if (!guardExact || stage !== null) return retain();
    if (oldExact && temp === null) return pointerDecision("create_temp", readerAuthority, readerDigest, "continue");
    if (oldExact && temp !== null) {
      if (temp.nlink !== 1) return retain();
      if (temp.body_class === "incomplete_noncanonical") return pointerDecision("discard_incomplete_temp", readerAuthority, readerDigest, "continue");
      if (exactBody(temp, guard.new_pointer_digest, guard.new_pointer_raw_sha256, guard.new_pointer_byte_size)) {
        return pointerDecision("replace_temp_to_fixed", readerAuthority, readerDigest, "continue");
      }
      return retain();
    }
    if (newExact && temp === null && ["prepared", "committed"].includes(String(recipe.committed_target_state))) {
      return pointerDecision("finalize_committed_target", readerAuthority, readerDigest, "continue");
    }
    return retain();
  }
  if (stage !== null || temp !== null) return retain();
  if (readerAuthority === "fixed_new") return pointerDecision("serve_fixed_new", readerAuthority, readerDigest, "serve");
  return pointerDecision("serve_guard_bound_old", readerAuthority, readerDigest, "serve");
}

function sealConvergence(item: JsonRecord): void {
  const digestFields = [
    "incremental_canonical_gkx_digest", "clean_canonical_gkx_digest", "incremental_retrieval_manifest_digest", "clean_retrieval_manifest_digest",
    "incremental_canonical_graph_digest", "clean_canonical_graph_digest", "incremental_graphiti_digest", "clean_graphiti_digest",
  ];
  if (digestFields.some((field) => !isDigest(item[field])) || typeof item.all_equal !== "boolean") {
    fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "convergence envelope is invalid.");
  }
  const equal = item.incremental_canonical_gkx_digest === item.clean_canonical_gkx_digest
    && item.incremental_retrieval_manifest_digest === item.clean_retrieval_manifest_digest
    && item.incremental_canonical_graph_digest === item.clean_canonical_graph_digest
    && item.incremental_graphiti_digest === item.clean_graphiti_digest;
  if (item.all_equal !== equal) fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "convergence equality relation is invalid.");
}

function sealAuthorizationScope(item: JsonRecord): void {
  if (!["governance_store", "durable_ledger"].includes(String(item.adapter_kind))
      || !validLabel(item.adapter_id) || !validLabel(item.adapter_contract_version) || !validLabel(item.vault_id)
      || !validLabel(item.authority_namespace) || item.authorized_operation !== "retrieval.source_removed/projection"
      || !isDigest(item.configuration_digest) || !isDigest(item.policy_digest)) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal authorization scope is invalid.");
  }
}

function sealAdapterBinding(item: JsonRecord): void {
  if (!["governance_store", "durable_ledger"].includes(String(item.adapter_kind))
      || !validLabel(item.adapter_id) || !validLabel(item.adapter_contract_version) || !validLabel(item.vault_id)
      || !validLabel(item.authority_namespace) || !isDigest(item.authorization_binding_digest)
      || !isDigest(item.configuration_digest) || !isDigest(item.policy_digest)
      || !stringArray(item.capabilities, { sorted: true, unique: true })
      || stableJson(item.capabilities) !== stableJson([
        "durable_idempotent_source_removal_projection",
        "lookup_by_occurrence_digest",
      ])) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal adapter binding is invalid.");
  }
}

function sealStatus(item: JsonRecord): void {
  const admitted: Record<string, readonly string[]> = {
    starting: ["stale"],
    reconciling: ["stale"],
    serving: ["fresh", "degraded"],
    stopping: ["fresh", "stale", "degraded"],
    error: ["stale", "degraded"],
  };
  if (!admitted[String(item.watcher_state)]?.includes(String(item.freshness))
      || !stringArray(item.reason_codes, { sorted: true, unique: true })) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "watcher status state/freshness relation is invalid.");
  }
  for (const code of item.reason_codes as string[]) {
    if (!(WATCHER_STATUS_REASON_CODES as readonly string[]).includes(code)) {
      fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", `unknown watcher status reason ${code}.`);
    }
  }
  const coherent = [item.source_snapshot_digest, item.coherent_manifest_digest, item.last_sync];
  const preGenesis = coherent.every((value) => value === null);
  const embeddingModelValid = item.embedding_model === null || validOpaqueIdentity(item.embedding_model);
  const authorityCoordinates = [item.configuration_digest, item.policy_digest];
  if (!isUuid7(item.service_instance_id) || !integer(item.pid, 1) || !integer(item.document_count) || !integer(item.chunk_count)
      || !integer(item.uptime_ms) || !embeddingModelValid
      || !(preGenesis && authorityCoordinates.every((value) => value === null)
        || !preGenesis && authorityCoordinates.every(isDigest) && isDigest(coherent[0]) && isDigest(coherent[1]) && isIso(coherent[2]))
      || preGenesis && (item.document_count !== 0 || item.chunk_count !== 0 || item.embedding_model !== null || item.freshness !== "stale"
        || !["starting", "reconciling", "error"].includes(String(item.watcher_state))
        || !(item.reason_codes as string[]).includes("WATCHER_NO_COHERENT_GENERATION"))
      || item.freshness === "fresh" && ((item.reason_codes as string[]).length !== 0 || preGenesis)
      || item.freshness !== "fresh" && (item.reason_codes as string[]).length === 0) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "watcher status coherent coordinate relation is invalid.");
  }
}

function sealFtsOutcome(item: JsonRecord): void {
  const qualified = item.physical_fts5_available === true && item.status === "qualified"
    && item.index_generation_count === 23 && item.query_count === 22 && item.provider_call_count === 0;
  const unavailable = item.physical_fts5_available === false && item.status === "unavailable"
    && item.index_generation_count === 0 && item.query_count === 0 && item.provider_call_count === 0;
  if (!validOpaqueIdentity(item.runtime_version) || !["linux", "windows"].includes(String(item.os)) || item.arch !== "x64"
      || !["reference", "matrix"].includes(String(item.lane_kind)) || !qualified && !unavailable) {
    fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "FTS qualification outcome is invalid.");
  }
}

function sealMeasurement(item: JsonRecord): void {
  const failureCodeSet = new Set([
    "MEASURE_CONVERGENCE_INVALID", "MEASURE_ENVIRONMENT_INVALID", "MEASURE_FTS_UNAVAILABLE", "MEASURE_GENERATION_INVALID",
    "MEASURE_LATENCY_EXCEEDED", "MEASURE_PLAN_INVALID", "MEASURE_PROVIDER_LEDGER_INVALID", "MEASURE_QUERY_INVALID",
  ]);
  if (item.sample_plan_digest !== WATCHER_CONVERGENCE_SAMPLE_PLAN_DIGEST
      || !["qualified", "unavailable", "failed"].includes(String(item.status))
      || !stringArray(item.failure_codes, { sorted: true, unique: true })
      || (item.failure_codes as string[]).some((code) => !failureCodeSet.has(code))) {
    fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "observation measurement identity is invalid.");
  }
  sealWatcherRecoveryRecord(item.environment);
  sealWatcherRecoveryRecord(item.fts_qualification);
  const environment = item.environment as JsonRecord;
  const fts = item.fts_qualification as JsonRecord;
  if (environment.runtime_version !== fts.runtime_version || environment.os !== fts.os || environment.arch !== fts.arch
      || environment.physical_fts5_available !== fts.physical_fts5_available) {
    fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "measurement environment/FTS coordinates differ.");
  }
  if (item.status === "qualified") {
    if ((item.failure_codes as string[]).length !== 0 || !Array.isArray(item.edit_latency_micros)
        || item.edit_latency_micros.length !== 20 || item.edit_latency_micros.some((value) => !integer(value, 0, 5_000_000))) {
      fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "qualified observation samples are invalid.");
    }
    const sourceWork = record(item.source_work, "measurement source_work");
    const embeddingWork = record(item.embedding_work, "measurement embedding_work");
    const convergence = sealWatcherRecoveryRecord(item.convergence);
    exactKeys(sourceWork, ["initial_generation_count", "mutation_generation_count", "total_generation_count", "query_count", "reparsed_source_count"], "measurement source_work");
    exactKeys(embeddingWork, ["provider_call_count", "provider_item_count", "unchanged_chunk_reembedded_count"], "measurement embedding_work");
    const sorted = (item.edit_latency_micros as number[]).slice().sort((a, b) => a - b);
    const expected = { p50: sorted[9], p95: sorted[18], p99: sorted[19], max: sorted[19] };
    if (stableJson(item.percentiles_micros) !== stableJson(expected) || expected.p95 > 5_000_000) {
      fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "qualified observation percentile algebra is invalid.");
    }
    if (fts.status !== "qualified" || fts.index_generation_count !== 23 || fts.query_count !== 22 || fts.provider_call_count !== 0
        || convergence.all_equal !== true
        || stableJson(sourceWork) !== stableJson({ initial_generation_count: 1, mutation_generation_count: 22, total_generation_count: 23, query_count: 22, reparsed_source_count: 22 })
        || stableJson(embeddingWork) !== stableJson({ provider_call_count: 0, provider_item_count: 0, unchanged_chunk_reembedded_count: 0 })) {
      fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "qualified observation terminal relations are invalid.");
    }
  } else {
    if ([item.edit_latency_micros, item.percentiles_micros, item.source_work, item.embedding_work, item.convergence].some((child) => child !== null)) {
      fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "nonqualified observation must not publish partial children.");
    }
    if (item.status === "unavailable"
      ? stableJson(item.failure_codes) !== stableJson(["MEASURE_FTS_UNAVAILABLE"]) || fts.status !== "unavailable" || fts.lane_kind !== "matrix"
      : (item.failure_codes as string[]).length < 1 || stableJson(item.failure_codes) === stableJson(["MEASURE_FTS_UNAVAILABLE"])) {
      fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "nonqualified observation failure relation is invalid.");
    }
  }
}

function sealPackManifest(item: JsonRecord): void {
  if (item.pack_contract_version !== WATCHER_RECOVERY_PACK_VERSION || !Array.isArray(item.files)
      || item.file_count !== item.files.length || !integer(item.total_bytes)) {
    fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher pack manifest coordinates are invalid.");
  }
  const names: string[] = [];
  let bytes = 0;
  for (const raw of item.files as unknown[]) {
    const row = record(raw, "pack manifest file row");
    exactKeys(row, ["file", "byte_size", "raw_sha256"], "pack manifest file row");
    if (typeof row.file !== "string" || row.file === "pack-manifest.json" || !integer(row.byte_size, 1) || !isDigest(row.raw_sha256)) {
      fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher pack manifest file row is invalid.");
    }
    names.push(row.file);
    bytes += row.byte_size as number;
  }
  if (new Set(names).size !== names.length || names.some((name, index) => index > 0 && retrievalCodeUnitCompare(names[index - 1], name) >= 0)
      || stableJson(names) !== stableJson(WATCHER_RECOVERY_PACK_FILES) || bytes !== item.total_bytes || item.file_count !== 17) {
    fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher pack manifest all-and-only relation is invalid.");
  }
}

export function sealWatcherConvergenceSamplePlan(value: unknown, rawBytes?: Uint8Array): Readonly<JsonRecord> {
  const item = canonicalRecord(value, "watcher convergence sample plan");
  exactKeys(item, ["contract_version", "execution", "fixture", "percentile", "thresholds", "timing", "watcher"], "watcher convergence sample plan");
  if (item.contract_version !== WATCHER_CONVERGENCE_SAMPLE_PLAN_VERSION || retrievalCanonicalDigest(item) !== WATCHER_CONVERGENCE_SAMPLE_PLAN_DIGEST) {
    fail("GKX_WATCHER_CONTRACT_SAMPLE_PLAN_INVALID", "watcher convergence sample plan digest is invalid.");
  }
  if (rawBytes && (rawBytes.byteLength !== 3_978 || retrievalSha256(rawBytes) !== WATCHER_CONVERGENCE_SAMPLE_PLAN_DIGEST
      || new TextDecoder("utf-8", { fatal: true }).decode(rawBytes) !== stableJson(item))) {
    fail("GKX_WATCHER_CONTRACT_SAMPLE_PLAN_INVALID", "watcher convergence sample plan bytes are invalid.");
  }
  const fixture = record(item.fixture, "sample fixture");
  const alpha = record(fixture.alpha, "sample alpha");
  const omega = record(fixture.omega, "sample omega");
  for (const side of [alpha, omega]) {
    if (!integer(side.byte_size, 1) || typeof side.source_bytes_base64 !== "string" || !isDigest(side.source_digest)) {
      fail("GKX_WATCHER_CONTRACT_SAMPLE_PLAN_INVALID", "sample source coordinate is invalid.");
    }
    const bytes = Buffer.from(side.source_bytes_base64 as string, "base64");
    if (bytes.length !== side.byte_size || retrievalSha256(bytes) !== side.source_digest) {
      fail("GKX_WATCHER_CONTRACT_SAMPLE_PLAN_INVALID", "sample source byte binding is invalid.");
    }
  }
  return deepFreeze(item);
}

function sealWatcherTransitionSequence(value: unknown, terminalRequired: boolean): readonly Readonly<JsonRecord>[] {
  const input = canonicalArray(value, "transition chain");
  if (input.length < 1 || input.length > 7) {
    return fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "transition chain length is invalid.");
  }
  const transitions = input.map((item) => sealWatcherRecoveryRecord(item));
  for (let index = 0; index < transitions.length; index++) {
    const current = transitions[index];
    if (current.transition_ordinal !== index || current.prior_transition_digest !== (index === 0 ? null : transitions[index - 1].transition_digest)) {
      fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "transition chain prior/ordinal relation is invalid.");
    }
    if (current.batch_id !== transitions[0].batch_id || current.observation_digest !== transitions[0].observation_digest) {
      fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "transition chain authority coordinates differ.");
    }
    if (index > 0 && !(WATCHER_EXCEPTIONAL_STATES as readonly string[]).includes(String(current.state))) {
      const prior = transitions[index - 1];
      for (const key of ["observation_digest", "plan_digest", "gkx_delta_digest", "gkx_snapshot_digest"] as const) {
        if (prior[key] !== null && current[key] !== prior[key]) fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "normal transition changed an inherited coordinate.");
      }
      if ((prior.retrieval_projection_state as JsonRecord).state === "ready"
          && stableJson(current.retrieval_projection_state) !== stableJson(prior.retrieval_projection_state)
          || (prior.graph_projection_state as JsonRecord).state === "ready"
            && stableJson(current.graph_projection_state) !== stableJson(prior.graph_projection_state)) {
        fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "normal transition changed an inherited projection state.");
      }
    }
    if ((WATCHER_EXCEPTIONAL_STATES as readonly string[]).includes(String(current.state)) && index > 0) {
      const prior = transitions[index - 1];
      for (const key of ["observation_digest", "plan_digest", "gkx_delta_digest", "gkx_snapshot_digest", "retrieval_projection_state", "graph_projection_state"] as const) {
        if (stableJson(current[key]) !== stableJson(prior[key])) {
          fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "exceptional transition invented a stage payload.");
        }
      }
    }
  }
  if (terminalRequired) {
    if (transitions.at(-1)?.terminal_state === "open" || transitions.slice(0, -1).some((item) => item.terminal_state !== "open")) {
      fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "transition chain terminal use is invalid.");
    }
  } else if (transitions.some((item) => item.terminal_state !== "open")
      || transitions.some((item) => (WATCHER_EXCEPTIONAL_STATES as readonly string[]).includes(String(item.state)))) {
    fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "incomplete transition prefix contains a terminal row.");
  }
  return Object.freeze(transitions);
}

export function sealWatcherTransitionChain(value: unknown): readonly Readonly<JsonRecord>[] {
  return sealWatcherTransitionSequence(value, true);
}

export function sealWatcherTransitionPrefix(value: unknown): readonly Readonly<JsonRecord>[] {
  return sealWatcherTransitionSequence(value, false);
}

export function sealWatcherCoherentActivationBundle(value: unknown, outerPointerGuardValue: unknown): Readonly<JsonRecord> {
  const bundle = canonicalRecord(value, "coherent activation bundle");
  exactKeys(bundle, [
    "batch", "observation", "observation_authority", "pre_scan_state", "plan", "plan_authority", "topology", "transitions",
    "normalized_graph_delta", "canonical_graph", "raw_graph", "graphiti_projection",
    "manifest", "pointer", "intent", "outcome", "active", "source_removal_event_set_bundle", "source_removal_activation",
  ], "coherent activation bundle");
  const batch = sealWatcherRecoveryRecord(bundle.batch);
  const observation = sealWatcherRecoveryRecord(bundle.observation);
  const observationAuthority = sealWatcherRecoveryRecord(bundle.observation_authority);
  const preScan = sealPreScanState(bundle.pre_scan_state);
  const plan = sealWatcherRecoveryRecord(bundle.plan);
  const planAuthority = sealWatcherRecoveryRecord(bundle.plan_authority);
  const topology = sealWatcherRecoveryRecord(bundle.topology);
  const transitionInput = canonicalArray(bundle.transitions, "coherent activation transitions");
  const preparedOnly = record(transitionInput.at(-1), "coherent activation final transition").state === "activation_prepared";
  const transitions = preparedOnly ? sealWatcherTransitionPrefix(transitionInput) : sealWatcherTransitionChain(transitionInput);
  if (transitions.length !== (preparedOnly ? 6 : 7)) fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "coherent activation requires prepared5 or complete6 progression.");
  const normalizedGraphDelta = sealWatcherRecoveryRecord(bundle.normalized_graph_delta);
  const canonicalGraph = sealWatcherRecoveryRecord(bundle.canonical_graph);
  const rawGraph = sealWatcherRecoveryRecord(bundle.raw_graph);
  const graphitiProjection = sealWatcherRecoveryRecord(bundle.graphiti_projection);
  const manifest = sealWatcherRecoveryRecord(bundle.manifest);
  const pointer = sealWatcherRecoveryRecord(bundle.pointer);
  const intent = sealWatcherRecoveryRecord(bundle.intent);
  const outcome = preparedOnly ? bundle.outcome === null ? null : fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "prepared activation cannot contain an outcome.")
    : sealWatcherRecoveryRecord(bundle.outcome);
  const active = preparedOnly ? bundle.active === null ? null : fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "prepared activation cannot contain ActiveCoherent.")
    : sealWatcherRecoveryRecord(bundle.active);
  const removalCount = Number(planAuthority.source_removal_event_count);
  const removalBundle = removalCount === 0
    ? bundle.source_removal_event_set_bundle === null ? null
      : fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "zero-removal coherent activation must not carry an outbox bundle.")
    : sealSourceRemovalEventSetBundle(bundle.source_removal_event_set_bundle);
  const removalActivation = preparedOnly || removalCount === 0
    ? bundle.source_removal_activation === null ? null
      : fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "prepared/zero-removal activation must not carry an outbox activation.")
    : sealWatcherRecoveryRecord(bundle.source_removal_activation);
  const outerGuard = sealWatcherRecoveryRecord(outerPointerGuardValue);
  const observationCoordinate = watcherArtifactCoordinate("observation", observation as JsonRecord);
  const planCoordinate = watcherArtifactCoordinate("plan", plan as JsonRecord);
  const topologyCoordinate = watcherArtifactCoordinate("topology", topology as JsonRecord);
  const rawGraphCoordinate = watcherArtifactCoordinate("graph", rawGraph as JsonRecord);
  const preScanDigest = retrievalCanonicalDigest(preScan as JsonRecord);
  const finalTransition = transitions.at(-1)!;
  const completeTransition = preparedOnly ? sealWatcherRecoveryRecord(intent.target_complete_transition) : finalTransition;
  const retrievalState = completeTransition.retrieval_projection_state as JsonRecord;
  const graphState = completeTransition.graph_projection_state as JsonRecord;
  const expectedExecution = observation.batch_kind === "startup_reconciliation" || observation.batch_kind === "failure_reconciliation"
    || observation.unscoped === true || observation.overflow === true ? "set_files" : "apply_changes";
  const mutationSetDigest = retrievalCanonicalDigest({
    contract_version: "gkos-watcher-mutation-set/1.0.0-draft.1",
    pre_scan_state_digest: preScanDigest,
    topology_snapshot_digest: plan.topology_snapshot_digest,
    intended_source_mutations: plan.intended_source_mutations,
    folder_set_changed: plan.folder_set_changed,
    attachment_set_changed: plan.attachment_set_changed,
  });
  if (batch.batch_id !== observation.batch_id || batch.batch_kind !== observation.batch_kind || batch.started_at !== observation.started_at
      || batch.execution_kind !== expectedExecution
      || batch.observation_authority_digest !== observationAuthority.authority_digest
      || observationAuthority.batch_id !== observation.batch_id || observationAuthority.observation_digest !== observation.observation_digest
      || observationAuthority.started_at !== observation.started_at || observationAuthority.observation_artifact_file !== observationCoordinate.file
      || observationAuthority.observation_raw_sha256 !== observationCoordinate.raw_sha256
      || observationAuthority.observation_byte_size !== observationCoordinate.byte_size || observationAuthority.pre_scan_state_digest !== preScanDigest
      || plan.batch_id !== batch.batch_id || plan.observation_digest !== observation.observation_digest
      || plan.mutation_set_digest !== mutationSetDigest || plan.effective_profile_digest !== preScan.effective_profile_digest
      || plan.validation_result_digest !== topology.validation_result_digest || plan.rejection_journal_digest !== topology.rejection_journal_digest
      || planAuthority.batch_id !== batch.batch_id || planAuthority.observation_digest !== observation.observation_digest
      || planAuthority.plan_digest !== plan.plan_digest || planAuthority.plan_artifact_file !== planCoordinate.file
      || planAuthority.plan_raw_sha256 !== planCoordinate.raw_sha256 || planAuthority.plan_byte_size !== planCoordinate.byte_size
      || planAuthority.target_topology_snapshot_digest !== plan.topology_snapshot_digest
      || removalBundle !== null && ((removalBundle.event_set as JsonRecord).event_set_digest !== planAuthority.source_removal_event_set_digest
        || (removalBundle.event_set as JsonRecord).event_count !== removalCount
        || (removalBundle.event_set as JsonRecord).set_kind !== "batch"
        || (removalBundle.event_set as JsonRecord).origin_id !== batch.batch_id
        || (removalBundle.event_set as JsonRecord).target_topology_snapshot_digest !== topology.topology_snapshot_digest)
      || plan.topology_snapshot_digest !== topology.topology_snapshot_digest) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "coherent activation observation/plan/topology authority differs.");
  }
  if (transitions.some((transition) => transition.batch_id !== batch.batch_id || transition.observation_digest !== observation.observation_digest)
      || transitions.slice(1).some((transition) => transition.plan_digest !== plan.plan_digest)
      || transitions.slice(2).some((transition) => transition.gkx_delta_digest !== retrievalCanonicalDigest(normalizedGraphDelta as JsonRecord))) {
    fail("GKX_WATCHER_CONTRACT_TRANSITION_INVALID", "coherent activation transition authority differs.");
  }
  if ((plan.intended_source_mutations as unknown[]).length === 0 && plan.folder_set_changed === false
      && plan.attachment_set_changed === false && topology.topology_snapshot_digest === preScan.topology_snapshot_digest) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "unchanged watcher topology has no semantic batch to activate.");
  }
  const expectedCanonicalGraph = normalizeWatcherCanonicalGkxGraph(rawGraph.graph as GkxGraph);
  const expectedGraphitiProjection = deriveWatcherGraphitiProjection(rawGraph.graph as GkxGraph, String(preScan.vault_id));
  const rawGraphBody = rawGraph.graph as JsonRecord;
  const rawFilePaths = (rawGraphBody.nodes as JsonRecord[]).filter((node) => node.kind === "file").map((node) => node.path);
  const acceptedPaths = (topology.accepted_sources as JsonRecord[]).map((source) => source.source_path);
  const rawStats = rawGraphBody.stats as JsonRecord;
  const rawDiagnostics = rawGraphBody.diagnostics as JsonRecord;
  if (manifest.completed_batch_id !== batch.batch_id || manifest.vault_id !== preScan.vault_id
      || manifest.configuration_digest !== preScan.configuration_digest || manifest.policy_digest !== preScan.policy_digest
      || manifest.effective_profile_digest !== preScan.effective_profile_digest
      || manifest.validation_result_digest !== topology.validation_result_digest || manifest.rejection_journal_digest !== topology.rejection_journal_digest
      || manifest.source_observation_snapshot_digest !== topology.source_observation_snapshot_digest
      || manifest.topology_snapshot_digest !== topology.topology_snapshot_digest
      || manifest.topology_artifact_file !== topologyCoordinate.file || manifest.topology_artifact_raw_sha256 !== topologyCoordinate.raw_sha256
      || manifest.completed_transition_digest !== completeTransition.transition_digest
      || rawGraph.service_generation_id !== manifest.service_generation_id
      || rawGraph.topology_snapshot_digest !== topology.topology_snapshot_digest
      || stableJson(rawFilePaths.slice().sort(retrievalCodeUnitCompare)) !== stableJson(acceptedPaths.slice().sort(retrievalCodeUnitCompare))
      || rawStats.files !== acceptedPaths.length || rawDiagnostics.notes !== acceptedPaths.length
      || rawDiagnostics.attachments !== (topology.attachment_paths as unknown[]).length
      || stableJson(canonicalGraph) !== stableJson(expectedCanonicalGraph)
      || stableJson(graphitiProjection) !== stableJson(expectedGraphitiProjection)
      || graphState.graph_artifact_file !== rawGraphCoordinate.file || graphState.graph_artifact_digest !== rawGraph.graph_artifact_digest
      || graphState.canonical_graph_digest !== retrievalCanonicalDigest(canonicalGraph as JsonRecord)
      || graphState.gkx_delta_digest !== retrievalCanonicalDigest(normalizedGraphDelta as JsonRecord)
      || graphState.graphiti_projection_digest !== retrievalCanonicalDigest(graphitiProjection as JsonRecord)
      || stableJson(manifest.retrieval_projection_state) !== stableJson(retrievalState)
      || stableJson(manifest.graph_projection_state) !== stableJson(graphState)
      || manifest.gkx_snapshot_digest !== completeTransition.gkx_snapshot_digest
      || manifest.source_removal_event_count !== removalCount
      || manifest.source_removal_event_set_digest !== planAuthority.source_removal_event_set_digest
      || pointer.service_generation_id !== manifest.service_generation_id || pointer.coherent_manifest_digest !== manifest.coherent_manifest_digest
      || pointer.prior_pointer_digest !== preScan.active_pointer_digest
      || intent.prepared_transition_digest !== transitions[5]?.transition_digest || intent.coherent_manifest_digest !== manifest.coherent_manifest_digest
      || intent.prior_pointer_digest !== preScan.active_pointer_digest || stableJson(intent.target_pointer) !== stableJson(pointer)
      || stableJson(intent.target_complete_transition) !== stableJson(completeTransition)
      || !preparedOnly && (outcome?.intent_digest !== intent.intent_digest || outcome?.coherent_manifest_digest !== manifest.coherent_manifest_digest
        || outcome?.outcome !== "published" || outcome?.pointer_digest !== pointer.pointer_digest
        || active?.service_generation_id !== manifest.service_generation_id || active?.coherent_manifest_digest !== manifest.coherent_manifest_digest
        || active?.pointer_digest !== pointer.pointer_digest || active?.intent_digest !== intent.intent_digest)
      || removalActivation !== null && (removalActivation.event_set_digest !== planAuthority.source_removal_event_set_digest
        || removalActivation.coherent_manifest_digest !== manifest.coherent_manifest_digest
        || removalActivation.activated_at !== active?.activated_at)
      || outerGuard.operation !== "replace_watcher_active_pointer"
      || outerGuard.operation_intent_digest !== intent.intent_digest || outerGuard.target_commit_digest !== completeTransition.transition_digest
      || outerGuard.new_pointer_file !== `watcher-pointer-${String(pointer.pointer_digest).slice(7)}.json`
      || outerGuard.new_pointer_digest !== pointer.pointer_digest || outerGuard.new_pointer_raw_sha256 !== retrievalSha256(canonicalPrettyBytes(pointer as JsonRecord))
      || outerGuard.new_pointer_byte_size !== canonicalPrettyBytes(pointer as JsonRecord).length
      || (preScan.active_pointer_digest === null ? outerGuard.old_pointer_digest !== null : outerGuard.old_pointer_digest !== preScan.active_pointer_digest)) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "coherent activation manifest/pointer DAG differs.");
  }
  const targetAcceptedByPath = new Map((topology.accepted_sources as JsonRecord[]).map((source) => [String(source.source_path), source]));
  const targetRejectedByPath = new Map((topology.rejected_sources as JsonRecord[]).map((source) => [String(source.source_path), source]));
  const mutations = plan.intended_source_mutations as JsonRecord[];
  for (const mutation of mutations) {
    if (["add", "change", "rename"].includes(String(mutation.kind))) {
      const target = targetAcceptedByPath.get(String(mutation.to_path));
      if (target === undefined || target.source_id !== mutation.source_id_after || target.source_digest !== mutation.source_digest_after
          || target.parser_descriptor_digest !== mutation.parser_descriptor_digest_after) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "watcher mutation target source coordinates differ from topology.");
      }
    }
    if (["delete", "rename"].includes(String(mutation.kind))) {
      const retained = targetAcceptedByPath.get(String(mutation.from_path));
      if (retained?.source_id === mutation.source_id_before) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "watcher removed source remains accepted in target topology.");
      }
    }
    if (mutation.cause === "validation_rejection") {
      const rejected = targetRejectedByPath.get(String(mutation.from_path));
      if (rejected === undefined || rejected.source_id !== null && rejected.source_id !== mutation.source_id_before
          || rejected.source_digest !== null && rejected.source_digest !== mutation.source_digest_before
          || rejected.parser_descriptor_digest !== null && rejected.parser_descriptor_digest !== mutation.parser_descriptor_digest_before) {
        fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "validation rejection differs from target rejection authority.");
      }
    }
  }
  const physicalRemovals = mutations.filter((mutation) => mutation.kind === "delete" && mutation.cause === "physical_disappearance");
  const removalOccurrences = removalBundle === null ? [] : removalBundle.occurrences as JsonRecord[];
  if (physicalRemovals.length !== removalOccurrences.length || physicalRemovals.some((mutation, index) => {
    const occurrence = removalOccurrences[index];
    return occurrence.source_id !== mutation.source_id_before || occurrence.source_path !== mutation.from_path
      || occurrence.source_digest !== mutation.source_digest_before || occurrence.prior_coherent_manifest_digest !== preScan.active_coherent_manifest_digest
      || occurrence.prior_topology_snapshot_digest !== preScan.topology_snapshot_digest;
  })) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "coherent activation physical removal/outbox relation differs.");
  }
  return deepFreeze(bundle);
}

function sealWatcherFailureRetryBundleInner(value: unknown): Readonly<JsonRecord> {
  const bundle = canonicalRecord(value, "watcher failure retry bundle");
  exactKeys(bundle, ["failed_batch", "failed_observation", "failed_observation_authority", "failed_pre_scan_state", "failed_transitions", "retry_batch", "retry_observation", "retry_observation_authority", "retry_pre_scan_state"], "watcher failure retry bundle");
  const failedBatch = sealWatcherRecoveryRecord(bundle.failed_batch);
  const failedObservation = sealWatcherRecoveryRecord(bundle.failed_observation);
  const failedObservationAuthority = sealWatcherRecoveryRecord(bundle.failed_observation_authority);
  const failedPreScan = sealPreScanState(bundle.failed_pre_scan_state);
  const failedTransitions = sealWatcherTransitionChain(bundle.failed_transitions);
  const failedTransition = failedTransitions.at(-1)!;
  const retryBatch = sealWatcherRecoveryRecord(bundle.retry_batch);
  const retryObservation = sealWatcherRecoveryRecord(bundle.retry_observation);
  const retryObservationAuthority = sealWatcherRecoveryRecord(bundle.retry_observation_authority);
  const retryPreScan = sealPreScanState(bundle.retry_pre_scan_state);
  const failedCoordinate = watcherArtifactCoordinate("observation", failedObservation as JsonRecord);
  const retryCoordinate = watcherArtifactCoordinate("observation", retryObservation as JsonRecord);
  if (failedTransition.batch_id !== failedBatch.batch_id || failedTransition.state !== "failed" || failedTransition.terminal_state !== "failed"
      || failedBatch.batch_id !== failedObservation.batch_id || failedBatch.observation_authority_digest !== failedObservationAuthority.authority_digest
      || failedTransition.observation_digest !== failedObservation.observation_digest
      || failedObservationAuthority.observation_digest !== failedObservation.observation_digest
      || failedObservationAuthority.pre_scan_state_digest !== retrievalCanonicalDigest(failedPreScan as JsonRecord)
      || failedObservationAuthority.observation_artifact_file !== failedCoordinate.file || failedObservationAuthority.observation_raw_sha256 !== failedCoordinate.raw_sha256
      || failedObservationAuthority.observation_byte_size !== failedCoordinate.byte_size || failedObservationAuthority.started_at !== failedObservation.started_at
      || retryBatch.batch_kind !== "failure_reconciliation" || retryBatch.execution_kind !== "set_files"
      || retryBatch.retry_of_batch_id !== failedBatch.batch_id || retryBatch.batch_id !== retryObservation.batch_id
      || retryObservation.batch_kind !== "failure_reconciliation" || retryObservation.unscoped !== true
      || retryBatch.observation_authority_digest !== retryObservationAuthority.authority_digest
      || retryObservationAuthority.observation_digest !== retryObservation.observation_digest
      || retryObservationAuthority.pre_scan_state_digest !== retrievalCanonicalDigest(retryPreScan as JsonRecord)
      || retryObservationAuthority.observation_artifact_file !== retryCoordinate.file || retryObservationAuthority.observation_raw_sha256 !== retryCoordinate.raw_sha256
      || retryObservationAuthority.observation_byte_size !== retryCoordinate.byte_size || retryObservationAuthority.started_at !== retryObservation.started_at
      || stableJson(retryPreScan) !== stableJson(failedPreScan)) {
    fail("GKX_WATCHER_CONTRACT_RETRY_INVALID", "failure reconciliation retry authority is invalid.");
  }
  return deepFreeze(bundle);
}

export function sealWatcherFailureRetryBundle(value: unknown): Readonly<JsonRecord> {
  try {
    return sealWatcherFailureRetryBundleInner(value);
  } catch (error) {
    if (error instanceof WatcherRecoveryContractError) {
      fail("GKX_WATCHER_CONTRACT_RETRY_INVALID", "failure reconciliation retry authority is invalid.");
    }
    throw error;
  }
}

export function sealSourceRemovalEventSetBundle(value: unknown): Readonly<JsonRecord> {
  const bundle = canonicalRecord(value, "source-removal event-set bundle");
  const eventSet = sealWatcherRecoveryRecord(bundle.event_set);
  const resetCarry = eventSet.set_kind === "reset_carry";
  exactKeys(bundle, ["event_set", "memberships", "prior_memberships", "events", "prior_events", "occurrences", "prior_occurrences"], "source-removal event-set bundle");
  if (!Array.isArray(bundle.memberships) || !Array.isArray(bundle.events) || !Array.isArray(bundle.occurrences)
      || bundle.memberships.length !== eventSet.event_count || bundle.events.length !== eventSet.event_count
      || bundle.occurrences.length !== eventSet.event_count || !Array.isArray(bundle.prior_memberships)
      || !Array.isArray(bundle.prior_events) || !Array.isArray(bundle.prior_occurrences)
      || bundle.prior_memberships.length !== eventSet.event_count || bundle.prior_events.length !== eventSet.event_count
      || bundle.prior_occurrences.length !== eventSet.event_count) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal bundle cardinality is invalid.");
  }
  if ([...bundle.memberships, ...bundle.events, ...bundle.occurrences].some((item) => item === null)) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal bundle body is absent.");
  }
  const memberships = bundle.memberships.map((item) => sealWatcherRecoveryRecord(item));
  const events = bundle.events.map((item) => sealWatcherRecoveryRecord(item));
  const occurrences = bundle.occurrences.map((item) => sealWatcherRecoveryRecord(item));
  const priorMemberships = resetCarry ? bundle.prior_memberships.map((item) => sealWatcherRecoveryRecord(item)) : bundle.prior_memberships;
  const priorEvents = resetCarry ? bundle.prior_events.map((item) => sealWatcherRecoveryRecord(item)) : bundle.prior_events;
  const priorOccurrences = resetCarry ? bundle.prior_occurrences.map((item) => sealWatcherRecoveryRecord(item)) : bundle.prior_occurrences;
  if (!resetCarry && [...priorMemberships, ...priorEvents, ...priorOccurrences].some((item) => item !== null)) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "batch event-set prior arrays must contain exactly null placeholders.");
  }
  const membershipDigests = memberships.map((item) => item.membership_digest);
  const expectedSequence = retrievalCanonicalDigest({
    contract_version: "gkos-watcher-source-removal-membership-sequence/1.0.0-draft.1",
    membership_digests: membershipDigests,
  });
  if (eventSet.membership_digest_sequence_digest !== expectedSequence) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal membership sequence is invalid.");
  }
  if (eventSet.event_count < 1 || new Set(membershipDigests).size !== membershipDigests.length
      || new Set(events.map((item) => item.event_digest)).size !== events.length
      || new Set(occurrences.map((item) => item.occurrence_digest)).size !== occurrences.length) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal set identity is duplicated or empty.");
  }
  for (let index = 0; index < memberships.length; index++) {
    if (memberships[index].event_ordinal !== index + 1 || memberships[index].event_digest !== events[index].event_digest
        || events[index].occurrence_digest !== occurrences[index].occurrence_digest
        || !resetCarry && memberships[index].prepared_at !== eventSet.prepared_at) {
      fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal bundle cross-binding is invalid.");
    }
    if (eventSet.set_kind === "batch" && (memberships[index].original_membership_digest !== null
        || memberships[index].causal_batch_id !== eventSet.origin_id || memberships[index].target_topology_snapshot_digest !== eventSet.target_topology_snapshot_digest)
        || eventSet.set_kind === "reset_carry" && (!isDigest(memberships[index].original_membership_digest)
          || memberships[index].original_membership_digest !== priorMemberships[index].membership_digest
          || memberships[index].event_digest !== priorMemberships[index].event_digest
          || memberships[index].causal_batch_id !== priorMemberships[index].causal_batch_id
          || memberships[index].target_topology_snapshot_digest !== priorMemberships[index].target_topology_snapshot_digest
          || memberships[index].prepared_at !== priorMemberships[index].prepared_at
          || stableJson(events[index]) !== stableJson(priorEvents[index])
          || stableJson(occurrences[index]) !== stableJson(priorOccurrences[index]))) {
      fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal membership origin relation is invalid.");
    }
  }
  const keys = occurrences.map((occurrence, index) => `${String(occurrence.source_path)}\u0000${String(occurrence.occurrence_digest)}\u0000${String(memberships[index].original_membership_digest ?? "")}`);
  if (keys.some((key, index) => index > 0 && retrievalCodeUnitCompare(keys[index - 1], key) >= 0)) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal membership order is invalid.");
  }
  return deepFreeze(bundle);
}

type ReadyRemovalRow = {
  membership: Readonly<JsonRecord>;
  event: Readonly<JsonRecord>;
  occurrence: Readonly<JsonRecord>;
};

function sealOldJournalReadyAuthority(value: unknown, outerManifestDigest: string): ReadyRemovalRow[] {
  const authority = canonicalRecord(value, "old journal ready-event authority");
  exactKeys(authority, ["activated_event_set_bundles", "responses", "receipts"], "old journal ready-event authority");
  if (!Array.isArray(authority.activated_event_set_bundles) || !Array.isArray(authority.responses) || !Array.isArray(authority.receipts)) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "old journal ready-event authority arrays are invalid.");
  }
  const memberships: Readonly<JsonRecord>[] = [];
  const priorMembershipClaims: ReadyRemovalRow[] = [];
  const activatedSetDigests = new Set<string>();
  const membershipOuterByDigest = new Map<string, string>();
  const eventByDigest = new Map<string, Readonly<JsonRecord>>();
  const eventByOccurrence = new Map<string, Readonly<JsonRecord>>();
  const occurrenceByDigest = new Map<string, Readonly<JsonRecord>>();
  for (const candidate of authority.activated_event_set_bundles) {
    const wrapper = canonicalRecord(candidate, "activated old-journal event set");
    exactKeys(wrapper, ["event_set_bundle", "activation"], "activated old-journal event set");
    const eventBundle = sealSourceRemovalEventSetBundle(wrapper.event_set_bundle);
    const activation = sealWatcherRecoveryRecord(wrapper.activation);
    const eventSet = eventBundle.event_set as JsonRecord;
    if (activation.event_set_digest !== eventSet.event_set_digest) {
      fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "old journal event-set activation differs from its event set.");
    }
    if (activatedSetDigests.has(String(eventSet.event_set_digest))) {
      fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "old journal contains a duplicate activated event set.");
    }
    activatedSetDigests.add(String(eventSet.event_set_digest));
    for (let index = 0; index < (eventBundle.memberships as JsonRecord[]).length; index++) {
      const membership = (eventBundle.memberships as JsonRecord[])[index];
      const event = (eventBundle.events as JsonRecord[])[index];
      const occurrence = (eventBundle.occurrences as JsonRecord[])[index];
      const priorEvent = eventByDigest.get(String(event.event_digest));
      const priorOccurrenceEvent = eventByOccurrence.get(String(event.occurrence_digest));
      const priorOccurrence = occurrenceByDigest.get(String(occurrence.occurrence_digest));
      if (priorEvent !== undefined && stableJson(priorEvent) !== stableJson(event)
          || priorOccurrenceEvent !== undefined && stableJson(priorOccurrenceEvent) !== stableJson(event)
          || priorOccurrence !== undefined && stableJson(priorOccurrence) !== stableJson(occurrence)) {
        fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "immutable old journal event/occurrence bytes differ.");
      }
      eventByDigest.set(String(event.event_digest), event);
      eventByOccurrence.set(String(event.occurrence_digest), event);
      occurrenceByDigest.set(String(occurrence.occurrence_digest), occurrence);
      memberships.push(membership);
      membershipOuterByDigest.set(String(membership.membership_digest), String(activation.coherent_manifest_digest));
    }
    if (eventSet.set_kind === "reset_carry") {
      const priorMemberships = eventBundle.prior_memberships as JsonRecord[];
      const priorEvents = eventBundle.prior_events as JsonRecord[];
      const priorOccurrences = eventBundle.prior_occurrences as JsonRecord[];
      for (let index = 0; index < priorMemberships.length; index++) {
        priorMembershipClaims.push({
          membership: priorMemberships[index],
          event: priorEvents[index],
          occurrence: priorOccurrences[index],
        });
      }
    }
  }
  const membershipByDigest = new Map<string, Readonly<JsonRecord>>();
  for (const membership of memberships) {
    const digest = String(membership.membership_digest);
    if (membershipByDigest.has(digest)) {
      fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "old journal contains a duplicate activated membership.");
    }
    membershipByDigest.set(digest, membership);
  }
  for (const claim of priorMembershipClaims) {
    const membership = membershipByDigest.get(String(claim.membership.membership_digest));
    const event = eventByDigest.get(String(claim.event.event_digest));
    const occurrence = occurrenceByDigest.get(String(claim.occurrence.occurrence_digest));
    if (membership === undefined || event === undefined || occurrence === undefined
        || stableJson(membership) !== stableJson(claim.membership)
        || stableJson(event) !== stableJson(claim.event)
        || stableJson(occurrence) !== stableJson(claim.occurrence)) {
      fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "reset-carry prior authority is not an activated old-journal membership.");
    }
  }
  const responses = authority.responses.map((item) => sealWatcherRecoveryRecord(item));
  const receipts = authority.receipts.map((item) => sealWatcherRecoveryRecord(item));
  const responseByDigest = new Map(responses.map((item) => [String(item.response_digest), item]));
  const receiptedResponses = new Set<string>();
  const deliveredEvents = new Set<string>();
  for (const receipt of receipts) {
    const response = responseByDigest.get(String(receipt.adapter_response_digest));
    const event = eventByDigest.get(String(receipt.event_digest));
    if (response === undefined || event === undefined || receipt.occurrence_digest !== event.occurrence_digest
        || response.occurrence_digest !== event.occurrence_digest || response.binding_digest !== event.adapter_binding_digest
        || receipt.adapter_binding_digest !== event.adapter_binding_digest
        || receipt.adapter_result_digest !== response.adapter_result_digest || receipt.adapter_event_id !== response.adapter_event_id
        || receipt.status !== response.status || receiptedResponses.has(String(response.response_digest))
        || deliveredEvents.has(String(event.event_digest))) {
      fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "old journal response/receipt relation is invalid.");
    }
    receiptedResponses.add(String(response.response_digest));
    deliveredEvents.add(String(event.event_digest));
  }
  if (receiptedResponses.size !== responses.length) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "old journal contains a response without its atomic receipt.");
  }
  const referencedMemberships = new Set(memberships.map((item) => item.original_membership_digest).filter(isDigest));
  const terminalByEvent = new Map<string, Readonly<JsonRecord>>();
  for (const membership of memberships) {
    if (referencedMemberships.has(String(membership.membership_digest))) continue;
    if (terminalByEvent.has(String(membership.event_digest))) {
      fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "old journal event has multiple terminal memberships.");
    }
    terminalByEvent.set(String(membership.event_digest), membership);
  }
  const ready: ReadyRemovalRow[] = [];
  for (const [eventDigest, membership] of terminalByEvent) {
    const event = eventByDigest.get(eventDigest)!;
    if (event.delivery_mode !== "adapter" || deliveredEvents.has(eventDigest)
        || membershipOuterByDigest.get(String(membership.membership_digest)) !== outerManifestDigest) continue;
    const occurrence = occurrenceByDigest.get(String(event.occurrence_digest));
    if (occurrence === undefined) fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "ready event occurrence is absent.");
    ready.push({ membership, event, occurrence });
  }
  ready.sort((left, right) => retrievalCodeUnitCompare(
    `${String(left.occurrence.source_path)}\u0000${String(left.occurrence.occurrence_digest)}\u0000${String(left.membership.membership_digest)}`,
    `${String(right.occurrence.source_path)}\u0000${String(right.occurrence.occurrence_digest)}\u0000${String(right.membership.membership_digest)}`,
  ));
  return ready;
}

function canonicalPrettyBytes(value: JsonRecord): Buffer {
  return Buffer.from(`${JSON.stringify(JSON.parse(stableJson(value)), null, 2)}\n`, "utf8");
}

export function sealWatcherJournalResetBundle(
  value: unknown,
  oldJournalAuthority: unknown,
  journalPointerGuardValue: unknown,
): Readonly<JsonRecord> {
  const bundle = canonicalRecord(value, "watcher journal reset bundle");
  exactKeys(bundle, ["old_meta", "old_generation", "old_pointer", "archive", "reset", "guard", "new_meta", "new_generation", "target_pointer", "reset_carry_bundle"], "watcher journal reset bundle");
  const oldMeta = sealWatcherRecoveryRecord(bundle.old_meta);
  const oldGeneration = sealWatcherRecoveryRecord(bundle.old_generation);
  const oldPointer = sealWatcherRecoveryRecord(bundle.old_pointer);
  const archive = sealWatcherRecoveryRecord(bundle.archive);
  const reset = sealWatcherRecoveryRecord(bundle.reset);
  const guard = sealWatcherRecoveryRecord(bundle.guard);
  const newMeta = sealWatcherRecoveryRecord(bundle.new_meta);
  const newGeneration = sealWatcherRecoveryRecord(bundle.new_generation);
  const targetPointer = sealWatcherRecoveryRecord(bundle.target_pointer);
  const pointerGuard = sealWatcherRecoveryRecord(journalPointerGuardValue);
  const outer = String(reset.outer_coherent_manifest_digest);
  const ready = sealOldJournalReadyAuthority(oldJournalAuthority, outer);
  let carrySet: Readonly<JsonRecord> | null = null;
  let carryActivation: Readonly<JsonRecord> | null = null;
  if (bundle.reset_carry_bundle !== null) {
    const carry = canonicalRecord(bundle.reset_carry_bundle, "reset carry bundle");
    exactKeys(carry, ["event_set_bundle", "activation"], "reset carry bundle");
    const eventBundle = sealSourceRemovalEventSetBundle(carry.event_set_bundle);
    carrySet = eventBundle.event_set as Readonly<JsonRecord>;
    carryActivation = sealWatcherRecoveryRecord(carry.activation);
    const priorMemberships = eventBundle.prior_memberships as JsonRecord[];
    const events = eventBundle.events as JsonRecord[];
    const occurrences = eventBundle.occurrences as JsonRecord[];
    if (ready.length !== priorMemberships.length || ready.some((row, index) =>
      stableJson(row.membership) !== stableJson(priorMemberships[index])
        || stableJson(row.event) !== stableJson(events[index])
        || stableJson(row.occurrence) !== stableJson(occurrences[index]))) {
      fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "reset carry differs from the all-and-only current ready set.");
    }
  } else if (ready.length !== 0) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "ready events require an exact reset carry bundle.");
  }
  const oldPointerBytes = canonicalPrettyBytes(oldPointer as JsonRecord);
  const targetPointerBytes = canonicalPrettyBytes(targetPointer as JsonRecord);
  const carrySetDigest = carrySet === null ? null : carrySet.event_set_digest;
  const carryActivationDigest = carryActivation === null ? null : carryActivation.activation_digest;
  if (oldGeneration.journal_instance_id !== oldMeta.journal_instance_id || oldGeneration.meta_digest !== oldMeta.meta_digest
      || oldGeneration.anchor_coherent_manifest_digest !== outer || oldMeta.anchor_coherent_manifest_digest !== outer
      || oldPointer.journal_generation_digest !== oldGeneration.journal_generation_digest
      || archive.journal_instance_id !== oldGeneration.journal_instance_id || archive.directory_leaf !== oldGeneration.directory_leaf
      || archive.outer_coherent_manifest_digest !== outer
      || newGeneration.journal_instance_id !== newMeta.journal_instance_id || newGeneration.meta_digest !== newMeta.meta_digest
      || newGeneration.anchor_coherent_manifest_digest !== outer || newMeta.anchor_coherent_manifest_digest !== outer
      || newMeta.vault_id !== oldMeta.vault_id || newMeta.configuration_digest !== oldMeta.configuration_digest || newMeta.policy_digest !== oldMeta.policy_digest
      || newMeta.effective_profile_digest !== oldMeta.effective_profile_digest
      || targetPointer.journal_generation_digest !== newGeneration.journal_generation_digest
      || targetPointer.prior_pointer_digest !== oldPointer.pointer_digest
      || reset.prior_journal_generation_digest !== oldGeneration.journal_generation_digest
      || reset.archive_manifest_digest !== archive.archive_manifest_digest || reset.new_journal_meta_digest !== newMeta.meta_digest
      || reset.new_journal_generation_digest !== newGeneration.journal_generation_digest
      || reset.target_journal_pointer_digest !== targetPointer.pointer_digest
      || guard.old_journal_pointer_digest !== oldPointer.pointer_digest || guard.old_journal_generation_digest !== oldGeneration.journal_generation_digest
      || guard.outer_coherent_manifest_digest !== outer || guard.archive_manifest_digest !== archive.archive_manifest_digest
      || guard.new_journal_instance_id !== newGeneration.journal_instance_id || guard.new_journal_directory_leaf !== newGeneration.directory_leaf
      || guard.new_journal_meta_digest !== newMeta.meta_digest || guard.new_journal_generation_digest !== newGeneration.journal_generation_digest
      || guard.reset_digest !== reset.reset_digest || guard.target_journal_pointer_digest !== targetPointer.pointer_digest
      || reset.ready_event_count !== ready.length || guard.ready_event_count !== ready.length
      || reset.reset_carry_event_set_digest !== carrySetDigest
      || guard.reset_carry_event_set_digest !== carrySetDigest
      || reset.reset_carry_activation_digest !== carryActivationDigest
      || guard.reset_carry_activation_digest !== carryActivationDigest
      || carrySet !== null && (carrySet.set_kind !== "reset_carry" || carrySet.origin_id !== reset.reset_id
        || carrySet.event_count !== ready.length || carrySet.target_topology_snapshot_digest !== null
        || carryActivation?.event_set_digest !== carrySet.event_set_digest || carryActivation?.coherent_manifest_digest !== outer)
      || pointerGuard.operation !== "replace_watcher_journal_pointer"
      || pointerGuard.parent_device !== guard.parent_device || pointerGuard.parent_inode !== guard.parent_inode || pointerGuard.parent_mode !== guard.parent_mode
      || pointerGuard.old_pointer_file !== `watcher-journal-pointer-${String(oldPointer.pointer_digest).slice(7)}.json`
      || pointerGuard.old_pointer_digest !== oldPointer.pointer_digest
      || pointerGuard.old_pointer_raw_sha256 !== retrievalSha256(oldPointerBytes) || pointerGuard.old_pointer_byte_size !== oldPointerBytes.length
      || pointerGuard.new_pointer_file !== `watcher-journal-pointer-${String(targetPointer.pointer_digest).slice(7)}.json`
      || pointerGuard.new_pointer_digest !== targetPointer.pointer_digest
      || pointerGuard.new_pointer_raw_sha256 !== retrievalSha256(targetPointerBytes) || pointerGuard.new_pointer_byte_size !== targetPointerBytes.length
      || pointerGuard.operation_intent_digest !== guard.guard_digest || pointerGuard.target_commit_digest !== reset.reset_digest) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "watcher journal reset authority differs.");
  }
  return deepFreeze(bundle);
}

export function sealWatcherAdapterReceiptBundle(value: unknown): Readonly<JsonRecord> {
  const bundle = canonicalRecord(value, "source-removal receipt bundle");
  exactKeys(bundle, ["binding", "event_set_bundle", "activation", "selected_event_ordinal", "request", "response", "receipt"], "source-removal receipt bundle");
  if ([bundle.binding, bundle.event_set_bundle, bundle.activation, bundle.request, bundle.response, bundle.receipt].some((item) => item === null)) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal receipt bundle is missing durable authority.");
  }
  const binding = sealWatcherRecoveryRecord(bundle.binding);
  const eventSetBundle = sealSourceRemovalEventSetBundle(bundle.event_set_bundle);
  if (!integer(bundle.selected_event_ordinal, 1, (eventSetBundle.events as JsonRecord[]).length)) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "receipt event ordinal is invalid.");
  }
  const index = Number(bundle.selected_event_ordinal) - 1;
  const occurrence = (eventSetBundle.occurrences as Readonly<JsonRecord>[])[index];
  const event = (eventSetBundle.events as Readonly<JsonRecord>[])[index];
  const membership = (eventSetBundle.memberships as Readonly<JsonRecord>[])[index];
  const eventSet = eventSetBundle.event_set as Readonly<JsonRecord>;
  const activation = sealWatcherRecoveryRecord(bundle.activation);
  const request = sealWatcherRecoveryRecord(bundle.request);
  const response = sealWatcherRecoveryRecord(bundle.response);
  const receipt = sealWatcherRecoveryRecord(bundle.receipt);
  if (event.occurrence_digest !== occurrence.occurrence_digest || event.adapter_binding_digest !== binding.binding_digest
      || membership.event_digest !== event.event_digest || membership.event_ordinal !== bundle.selected_event_ordinal
      || activation.event_set_digest !== eventSet.event_set_digest
      || request.binding_digest !== binding.binding_digest || request.occurrence_digest !== occurrence.occurrence_digest
      || request.idempotency_key !== occurrence.occurrence_digest || request.source_id !== occurrence.source_id
      || request.source_path !== occurrence.source_path || request.source_digest !== occurrence.source_digest
      || request.prior_coherent_manifest_digest !== occurrence.prior_coherent_manifest_digest
      || request.target_topology_snapshot_digest !== membership.target_topology_snapshot_digest || request.observed_at !== membership.prepared_at
      || response.binding_digest !== binding.binding_digest
      || response.occurrence_digest !== occurrence.occurrence_digest || receipt.event_digest !== event.event_digest
      || receipt.occurrence_digest !== occurrence.occurrence_digest || receipt.adapter_binding_digest !== binding.binding_digest
      || receipt.adapter_response_digest !== response.response_digest || receipt.adapter_result_digest !== response.adapter_result_digest
      || receipt.adapter_event_id !== response.adapter_event_id || receipt.status !== response.status) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "source-removal receipt cross-binding is invalid.");
  }
  return deepFreeze(bundle);
}

export function sealWatcherAdapterVerificationBundle(value: unknown): Readonly<JsonRecord> {
  const bundle = canonicalRecord(value, "source-removal adapter verification bundle");
  exactKeys(bundle, ["scope", "binding", "challenge", "proof", "verification"], "source-removal adapter verification bundle");
  const scope = sealWatcherRecoveryRecord(bundle.scope);
  const binding = sealWatcherRecoveryRecord(bundle.binding);
  const challenge = sealWatcherRecoveryRecord(bundle.challenge);
  const proof = sealWatcherRecoveryRecord(bundle.proof);
  const verification = sealWatcherRecoveryRecord(bundle.verification);
  if (binding.authorization_binding_digest !== scope.authorization_binding_digest || binding.adapter_kind !== scope.adapter_kind
      || binding.adapter_id !== scope.adapter_id || binding.adapter_contract_version !== scope.adapter_contract_version
      || binding.vault_id !== scope.vault_id || binding.authority_namespace !== scope.authority_namespace
      || binding.configuration_digest !== scope.configuration_digest || binding.policy_digest !== scope.policy_digest
      || challenge.vault_id !== binding.vault_id || challenge.configuration_digest !== binding.configuration_digest
      || challenge.policy_digest !== binding.policy_digest || stableJson(challenge.required_capabilities) !== stableJson(binding.capabilities)
      || proof.challenge_digest !== challenge.challenge_digest
      || proof.binding_digest !== binding.binding_digest || proof.adapter_kind !== binding.adapter_kind
      || proof.adapter_id !== binding.adapter_id || proof.adapter_contract_version !== binding.adapter_contract_version
      || proof.authority_namespace !== binding.authority_namespace
      || proof.authorization_binding_digest !== binding.authorization_binding_digest
      || stableJson(proof.capabilities) !== stableJson(binding.capabilities)
      || verification.binding_digest !== binding.binding_digest || verification.challenge_digest !== challenge.challenge_digest
      || verification.proof_digest !== proof.proof_digest) {
    fail("GKX_WATCHER_CONTRACT_SOURCE_REMOVAL_INVALID", "adapter verification authority differs.");
  }
  return deepFreeze(bundle);
}

export function sealWatcherStatusBundle(value: unknown): Readonly<JsonRecord> {
  const bundle = canonicalRecord(value, "watcher status bundle");
  exactKeys(bundle, ["locator", "status", "active", "manifest"], "watcher status bundle");
  const locator = sealWatcherRecoveryRecord(bundle.locator);
  const status = sealWatcherRecoveryRecord(bundle.status);
  if (status.service_instance_id !== locator.service_instance_id || status.pid !== locator.pid) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "watcher status/locator authority differs.");
  }
  if (bundle.active === null || bundle.manifest === null) {
    if (bundle.active !== null || bundle.manifest !== null || status.source_snapshot_digest !== null
        || status.coherent_manifest_digest !== null || status.configuration_digest !== null || status.policy_digest !== null
        || status.last_sync !== null) {
      fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "watcher pre-genesis status authority differs.");
    }
    return deepFreeze(bundle);
  }
  const active = sealWatcherRecoveryRecord(bundle.active);
  const manifest = sealWatcherRecoveryRecord(bundle.manifest);
  if (status.source_snapshot_digest !== manifest.source_observation_snapshot_digest
      || status.coherent_manifest_digest !== manifest.coherent_manifest_digest
      || status.configuration_digest !== manifest.configuration_digest || status.policy_digest !== manifest.policy_digest
      || status.last_sync !== active.activated_at || active.coherent_manifest_digest !== manifest.coherent_manifest_digest
      || active.service_generation_id !== manifest.service_generation_id) {
    fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "watcher status/locator/coherent authority differs.");
  }
  return deepFreeze(bundle);
}

export function validateWatcherSourcePath(value: unknown): null {
  assertSourcePath(value, "watcher source path");
  return null;
}

const WATCHER_SQL_MUTATION_KINDS = new Set([
  "body_scalar", "column", "foreign_key", "identity", "index", "integrity", "outbox", "pragma", "reset", "sqlite_master",
]);
const WATCHER_SQL_MUTATIONS = new Set([
  "affinity_drift", "alias_swap", "body_digest_mismatch", "column_order_drift", "corrupt_database", "extra_object", "foreign_key_drift",
  "hardlink", "integrity_failure", "missing_object", "mode_widened", "noncanonical_body", "notnull_drift", "parent_swap", "pragma_drift",
  "primary_key_drift", "reparse", "sqlite_replacement", "trigger_added", "unknown_reserved_leaf", "view_added", "virtual_table_added",
]);

export function validateWatcherSqlAuthority(value: unknown): null {
  const recipe = canonicalRecord(value, "watcher SQL validation recipe");
  if (["pre_transaction", "post_reopen"].includes(String(recipe.recipe_kind))) {
    exactKeys(recipe, ["recipe_kind", "current_database_bytes", "blob_bytes", "mutated_rows", "wal_bytes", "shm_bytes"], "watcher admission recipe");
    for (const field of ["current_database_bytes", "blob_bytes", "mutated_rows", "wal_bytes", "shm_bytes"] as const) {
      if (!integer(recipe[field])) fail("GKX_WATCHER_CONTRACT_SQL_INVALID", "watcher admission coordinate is invalid.");
    }
    if (recipe.recipe_kind === "pre_transaction") {
      if (recipe.wal_bytes !== 0 || recipe.shm_bytes !== 0 || Number(recipe.blob_bytes) > 33_554_432 || Number(recipe.mutated_rows) > 10_000) {
        fail("GKX_WATCHER_CONTRACT_SQL_INVALID", "watcher pre-transaction admission is invalid.");
      }
      const dirtyPages = Math.ceil(Number(recipe.blob_bytes) / 4_096) + 4 * Number(recipe.mutated_rows) + 4_096;
      const projectedDatabase = Number(recipe.current_database_bytes) + dirtyPages * 4_096;
      const walUpper = 32 + dirtyPages * 4_120;
      if (projectedDatabase > 2_048_000_000 || projectedDatabase + walUpper + 67_108_864 > 4_294_967_296) {
        fail("GKX_WATCHER_CONTRACT_SQL_INVALID", "watcher pre-transaction cap is exceeded.");
      }
      return null;
    }
    if (recipe.blob_bytes !== 0 || recipe.mutated_rows !== 0
        || Number(recipe.current_database_bytes) + Number(recipe.wal_bytes) + Number(recipe.shm_bytes) > 4_294_967_296) {
      fail("GKX_WATCHER_CONTRACT_SQL_INVALID", "watcher post-reopen admission is invalid.");
    }
    return null;
  }
  exactKeys(recipe, ["recipe_kind", "target", "mutation"], "watcher SQLite mutation recipe");
  if (!WATCHER_SQL_MUTATION_KINDS.has(String(recipe.recipe_kind)) || !validLabel(recipe.target) || !WATCHER_SQL_MUTATIONS.has(String(recipe.mutation))) {
    fail("GKX_WATCHER_CONTRACT_SQL_INVALID", "watcher SQLite mutation recipe is invalid.");
  }
  if (recipe.recipe_kind === "outbox") fail("GKX_WATCHER_CONTRACT_RESET_INVALID", "watcher outbox authority is unreadable.");
  if (recipe.recipe_kind === "identity" || recipe.recipe_kind === "reset") {
    fail("GKX_WATCHER_CONTRACT_POINTER_INVALID", "watcher SQLite capability identity is invalid.");
  }
  fail("GKX_WATCHER_CONTRACT_SQL_INVALID", "watcher SQLite authority mutation is invalid.");
}

const WATCHER_CLI_PRESENCE: Readonly<Record<string, readonly [string, ...string[]]>> = Object.freeze({
  "reset-ready": ["active_coherent", "coherent_manifest", "journal_generation", "journal_pointer", "reset_result"],
  "state-invalid": ["none"],
  "state-operational-failure": ["none"],
  "status-pre-genesis": ["locator", "status", "journal_generation", "journal_pointer"],
  "status-reconciling-stale": ["locator", "status", "active_coherent", "coherent_manifest", "journal_generation", "journal_pointer"],
  "status-serving-degraded": ["locator", "status", "active_coherent", "coherent_manifest", "journal_generation", "journal_pointer"],
  "status-serving-fresh": ["locator", "status", "active_coherent", "coherent_manifest", "journal_generation", "journal_pointer"],
});

export function validateWatcherCliFixture(value: unknown): null {
  const fixture = canonicalRecord(value, "watcher CLI fixture");
  exactKeys(fixture, ["contract_version", "state_fixtures", "commands", "fixture_digest"], "watcher CLI fixture");
  if (fixture.contract_version !== "gkos-watcher-cli-fixture/1.0.0-draft.1"
      || fixture.fixture_digest !== retrievalCanonicalDigest(digestMaterial(fixture, "fixture_digest"))
      || !Array.isArray(fixture.state_fixtures) || !Array.isArray(fixture.commands)) {
    fail("GKX_WATCHER_CONTRACT_CLI_INVALID", "watcher CLI fixture envelope is invalid.");
  }
  const fixtureIds: string[] = [];
  const stateById = new Map<string, JsonRecord>();
  for (const candidate of fixture.state_fixtures) {
    const state = canonicalRecord(candidate, "watcher CLI state fixture");
    exactKeys(state, ["fixture_id", "capability_state", "locator", "status", "active_coherent", "coherent_manifest", "journal_generation", "journal_pointer", "reset_result"], "watcher CLI state fixture");
    const expected = WATCHER_CLI_PRESENCE[String(state.fixture_id)];
    if (expected === undefined || !["valid", "invalid", "operational_failure"].includes(String(state.capability_state))) {
      fail("GKX_WATCHER_CONTRACT_CLI_INVALID", "watcher CLI state fixture identity is invalid.");
    }
    fixtureIds.push(String(state.fixture_id));
    stateById.set(String(state.fixture_id), state);
    const governed = ["locator", "status", "active_coherent", "coherent_manifest", "journal_generation", "journal_pointer", "reset_result"];
    for (const field of governed) {
      const present = expected.includes(field);
      if (present !== (state[field] !== null)) fail("GKX_WATCHER_CONTRACT_CLI_INVALID", "watcher CLI state fixture presence is invalid.");
      if (present) sealWatcherRecoveryRecord(state[field]);
    }
  }
  if (fixtureIds.length !== 7 || fixtureIds.some((id, index) => index > 0 && retrievalCodeUnitCompare(fixtureIds[index - 1], id) >= 0)) {
    fail("GKX_WATCHER_CONTRACT_CLI_INVALID", "watcher CLI state catalog is incomplete or unordered.");
  }
  const caseIds: string[] = [];
  for (const candidate of fixture.commands) {
    const command = canonicalRecord(candidate, "watcher CLI command");
    exactKeys(command, ["case_id", "argv_template", "expected_stdout", "expected_stderr", "expected_exit_code", "required_state_fixture"], "watcher CLI command");
    if (!validLabel(command.case_id) || !Array.isArray(command.argv_template) || command.argv_template.length < 1 || command.argv_template.length > 9
        || command.argv_template.some((entry) => typeof entry !== "string") || typeof command.expected_stdout !== "string"
        || typeof command.expected_stderr !== "string" || !integer(command.expected_exit_code, 0, 3)
        || command.required_state_fixture !== null && !fixtureIds.includes(String(command.required_state_fixture))) {
      fail("GKX_WATCHER_CONTRACT_CLI_INVALID", "watcher CLI command is invalid.");
    }
    caseIds.push(String(command.case_id));
  }
  if (caseIds.some((id, index) => index > 0 && retrievalCodeUnitCompare(caseIds[index - 1], id) >= 0)) {
    fail("GKX_WATCHER_CONTRACT_CLI_INVALID", "watcher CLI command catalog is duplicated or unordered.");
  }
  const preGenesis = stateById.get("status-pre-genesis")!;
  const fresh = stateById.get("status-serving-fresh")!;
  const reconciling = stateById.get("status-reconciling-stale")!;
  const degraded = stateById.get("status-serving-degraded")!;
  const resetReady = stateById.get("reset-ready")!;
  for (const state of [preGenesis, fresh, reconciling, degraded]) {
    const locator = state.locator as JsonRecord;
    const status = state.status as JsonRecord;
    if (locator.service_instance_id !== status.service_instance_id || locator.pid !== status.pid) {
      fail("GKX_WATCHER_CONTRACT_CLI_INVALID", "watcher CLI locator/status state differs.");
    }
    sealWatcherStatusBundle({ locator, status, active: state.active_coherent, manifest: state.coherent_manifest });
  }
  if ((fresh.status as JsonRecord).watcher_state !== "serving" || (fresh.status as JsonRecord).freshness !== "fresh"
      || (reconciling.status as JsonRecord).watcher_state !== "reconciling" || (reconciling.status as JsonRecord).freshness !== "stale"
      || (degraded.status as JsonRecord).watcher_state !== "serving" || (degraded.status as JsonRecord).freshness !== "degraded"
      || (preGenesis.status as JsonRecord).source_snapshot_digest !== null) {
    fail("GKX_WATCHER_CONTRACT_CLI_INVALID", "watcher CLI status catalog meaning is invalid.");
  }
  for (const state of [preGenesis, fresh, reconciling, degraded, resetReady]) {
    const generation = state.journal_generation as JsonRecord;
    const pointer = state.journal_pointer as JsonRecord;
    if (pointer.journal_generation_digest !== generation.journal_generation_digest) {
      fail("GKX_WATCHER_CONTRACT_CLI_INVALID", "watcher CLI journal pointer/generation differs.");
    }
  }
  const resetResult = resetReady.reset_result as JsonRecord;
  const resetGeneration = resetReady.journal_generation as JsonRecord;
  const resetManifest = resetReady.coherent_manifest as JsonRecord;
  if (resetResult.prior_journal_generation_digest !== resetGeneration.journal_generation_digest
      || resetResult.outer_coherent_manifest_digest !== resetManifest.coherent_manifest_digest) {
    fail("GKX_WATCHER_CONTRACT_CLI_INVALID", "watcher CLI reset result authority differs.");
  }
  const renderStatus = (status: JsonRecord): string => [
    "gkos status", `documents: ${String(status.document_count)}`, `chunks: ${String(status.chunk_count)}`,
    `embedding_model: ${String(status.embedding_model ?? "null")}`, `watcher_state: ${String(status.watcher_state)}`,
    `freshness: ${String(status.freshness)}`, `last_sync: ${String(status.last_sync ?? "null")}`,
    `uptime_ms: ${String(status.uptime_ms)}`, `pid: ${String(status.pid)}`, `reasons: ${stableJson(status.reason_codes)}`,
  ].join("\n") + "\n";
  const renderReset = (result: JsonRecord): string => [
    "gkos watcher journal-reset", `status: ${String(result.status)}`,
    `prior_journal_generation_digest: ${String(result.prior_journal_generation_digest)}`,
    `archive_manifest_digest: ${String(result.archive_manifest_digest)}`,
    `new_journal_generation_digest: ${String(result.new_journal_generation_digest)}`,
    `outer_coherent_manifest_digest: ${String(result.outer_coherent_manifest_digest)}`,
    `reset_digest: ${String(result.reset_digest)}`, `requires_reconciliation: ${String(result.requires_reconciliation)}`,
    `result_digest: ${String(result.result_digest)}`,
  ].join("\n") + "\n";
  const command = (case_id: string, argv_template: string[], expected_stdout: string, expected_stderr: string, expected_exit_code: number, required_state_fixture: string | null): JsonRecord => (
    { case_id, argv_template, expected_stdout, expected_stderr, expected_exit_code, required_state_fixture }
  );
  const resetArgv = [
    "watcher", "journal-reset", "--state", "<STATE_DIRECTORY>", "--expected-journal-generation-digest",
    String(resetGeneration.journal_generation_digest), "--expected-coherent-manifest-digest", String(resetManifest.coherent_manifest_digest),
  ];
  const mismatchDigest = `sha256:${"f".repeat(64)}`;
  const expectedCommands = [
    command("reset-coherent-coordinate-mismatch", resetArgv.map((value, index) => index === 7 ? mismatchDigest : value), "", "gkos watcher journal-reset: expected coordinate mismatch\n", 2, "reset-ready"),
    command("reset-extra-argument", [...resetArgv, "unexpected"], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
    command("reset-help", ["watcher", "journal-reset", "--help"], "Usage: gkos watcher journal-reset --state <state-directory> --expected-journal-generation-digest <sha256> --expected-coherent-manifest-digest <sha256> [--json]\n", "", 0, null),
    command("reset-invalid-state", resetArgv, "", "gkos watcher journal-reset: invalid state capability\n", 2, "state-invalid"),
    command("reset-journal-coordinate-mismatch", resetArgv.map((value, index) => index === 5 ? mismatchDigest : value), "", "gkos watcher journal-reset: expected coordinate mismatch\n", 2, "reset-ready"),
    command("reset-missing-coherent-coordinate", resetArgv.slice(0, 6), "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
    command("reset-missing-journal-coordinate", ["watcher", "journal-reset", "--state", "<STATE_DIRECTORY>", "--expected-coherent-manifest-digest", String(resetManifest.coherent_manifest_digest)], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
    command("reset-missing-state", ["watcher", "journal-reset", "--expected-journal-generation-digest", String(resetGeneration.journal_generation_digest), "--expected-coherent-manifest-digest", String(resetManifest.coherent_manifest_digest)], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
    command("reset-operational-failure", resetArgv, "", "gkos watcher journal-reset: operational failure\n", 3, "state-operational-failure"),
    command("reset-json-reordered", ["watcher", "journal-reset", "--json", ...resetArgv.slice(2)], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
    command("reset-reordered-flags", ["watcher", "journal-reset", "--expected-journal-generation-digest", String(resetGeneration.journal_generation_digest), "--state", "<STATE_DIRECTORY>", "--expected-coherent-manifest-digest", String(resetManifest.coherent_manifest_digest)], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
    command("reset-repeated-coherent-coordinate", ["watcher", "journal-reset", "--state", "<STATE_DIRECTORY>", "--expected-coherent-manifest-digest", String(resetManifest.coherent_manifest_digest), "--expected-coherent-manifest-digest", String(resetManifest.coherent_manifest_digest)], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
    command("reset-repeated-journal-coordinate", ["watcher", "journal-reset", "--state", "<STATE_DIRECTORY>", "--expected-journal-generation-digest", String(resetGeneration.journal_generation_digest), "--expected-journal-generation-digest", String(resetGeneration.journal_generation_digest)], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
    command("reset-repeated-state", ["watcher", "journal-reset", "--state", "<STATE_DIRECTORY>", "--state", "<STATE_DIRECTORY>"], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
    command("reset-short-help-rejected", ["watcher", "journal-reset", "-h"], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
    command("reset-success-json", [...resetArgv, "--json"], canonicalPrettyBytes(resetResult).toString("utf8"), "", 0, "reset-ready"),
    command("reset-success-text", resetArgv, renderReset(resetResult), "", 0, "reset-ready"),
    command("reset-vault-rejected", ["watcher", "journal-reset", "--vault", "vault"], "", "gkos watcher journal-reset: invalid arguments\n", 2, null),
    command("status-extra-argument", ["status", "--state", "<STATE_DIRECTORY>", "unexpected"], "", "gkos status: invalid arguments\n", 2, null),
    command("status-help", ["status", "--help"], "Usage: gkos status --state <state-directory> [--json]\n", "", 0, null),
    command("status-invalid-state", ["status", "--state", "<STATE_DIRECTORY>"], "", "gkos status: invalid state capability\n", 2, "state-invalid"),
    command("status-json-reordered", ["status", "--json", "--state", "<STATE_DIRECTORY>"], "", "gkos status: invalid arguments\n", 2, null),
    command("status-missing-state", ["status"], "", "gkos status: invalid arguments\n", 2, null),
    command("status-operational-failure", ["status", "--state", "<STATE_DIRECTORY>"], "", "gkos status: operational failure\n", 3, "state-operational-failure"),
    command("status-pre-genesis-json", ["status", "--state", "<STATE_DIRECTORY>", "--json"], canonicalPrettyBytes(preGenesis.status as JsonRecord).toString("utf8"), "", 1, "status-pre-genesis"),
    command("status-pre-genesis-text", ["status", "--state", "<STATE_DIRECTORY>"], renderStatus(preGenesis.status as JsonRecord), "", 1, "status-pre-genesis"),
    command("status-reconciling-json", ["status", "--state", "<STATE_DIRECTORY>", "--json"], canonicalPrettyBytes(reconciling.status as JsonRecord).toString("utf8"), "", 1, "status-reconciling-stale"),
    command("status-reconciling-text", ["status", "--state", "<STATE_DIRECTORY>"], renderStatus(reconciling.status as JsonRecord), "", 1, "status-reconciling-stale"),
    command("status-repeated-state", ["status", "--state", "<STATE_DIRECTORY>", "--state", "<STATE_DIRECTORY>"], "", "gkos status: invalid arguments\n", 2, null),
    command("status-serving-degraded-json", ["status", "--state", "<STATE_DIRECTORY>", "--json"], canonicalPrettyBytes(degraded.status as JsonRecord).toString("utf8"), "", 1, "status-serving-degraded"),
    command("status-serving-degraded-text", ["status", "--state", "<STATE_DIRECTORY>"], renderStatus(degraded.status as JsonRecord), "", 1, "status-serving-degraded"),
    command("status-serving-fresh-json", ["status", "--state", "<STATE_DIRECTORY>", "--json"], canonicalPrettyBytes(fresh.status as JsonRecord).toString("utf8"), "", 0, "status-serving-fresh"),
    command("status-serving-fresh-text", ["status", "--state", "<STATE_DIRECTORY>"], renderStatus(fresh.status as JsonRecord), "", 0, "status-serving-fresh"),
    command("status-short-help-rejected", ["status", "-h"], "", "gkos status: invalid arguments\n", 2, null),
    command("status-vault-rejected", ["status", "--vault", "vault"], "", "gkos status: invalid arguments\n", 2, null),
  ].sort((left, right) => retrievalCodeUnitCompare(String(left.case_id), String(right.case_id)));
  if (stableJson(fixture.commands) !== stableJson(expectedCommands)) {
    fail("GKX_WATCHER_CONTRACT_CLI_INVALID", "watcher CLI command bytes differ from the exact state-derived catalog.");
  }
  return null;
}

export function validateWatcherPackBundle(value: unknown): null {
  const bundle = canonicalRecord(value, "watcher pack validation bundle");
  exactKeys(bundle, ["pack_root_manifest", "files"], "watcher pack validation bundle");
  const manifest = sealWatcherRecoveryRecord(bundle.pack_root_manifest);
  if (!Array.isArray(bundle.files) || bundle.files.length !== 17) {
    fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher pack validation transport is invalid.");
  }
  const decoded = bundle.files.map((raw, index) => {
    const row = canonicalRecord(raw, "watcher pack validation file");
    exactKeys(row, ["file", "bytes_base64"], "watcher pack validation file");
    const manifestRow = (manifest.files as JsonRecord[])[index];
    if (typeof row.file !== "string" || row.file !== manifestRow?.file
        || !(WATCHER_RECOVERY_PACK_FILES as readonly string[]).includes(row.file)
        || typeof row.bytes_base64 !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(row.bytes_base64)) {
      fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher pack validation transport is invalid.");
    }
    const bytes = Buffer.from(row.bytes_base64, "base64");
    if (bytes.length < 1 || bytes.toString("base64") !== row.bytes_base64 || bytes.length !== manifestRow.byte_size
        || retrievalSha256(bytes) !== manifestRow.raw_sha256 || bytes.includes(0x00) || bytes.includes(0x0d)
        || bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
        || (row.file === "watcher-sample-plan.json" ? bytes.at(-1) === 0x0a : bytes.at(-1) !== 0x0a)) {
      fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher pack bytes are noncanonical.");
    }
    return bytes;
  });
  if (decoded.length !== manifest.file_count || decoded.reduce((sum, bytes) => sum + bytes.length, 0) !== manifest.total_bytes) {
    fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher pack aggregate byte relation is invalid.");
  }
  const schemaDefinitionOwners = new Map<string, string>();
  const visitSchema = (value: unknown, schemaFile: string, partialCompositionArm = false): void => {
    if (Array.isArray(value)) {
      for (const child of value) visitSchema(child, schemaFile, partialCompositionArm);
      return;
    }
    if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return;
    const node = value as JsonRecord;
    if (Object.hasOwn(node, "$ref")
        && (typeof node.$ref !== "string" || !node.$ref.startsWith(WATCHER_RECOVERY_SCHEMA_ROOT))) {
      fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher schema reference is not an absolute owned URI.");
    }
    if (!partialCompositionArm && node.type === "object" && Object.hasOwn(node, "properties") && Array.isArray(node.required)
        && (node.additionalProperties !== false || node.unevaluatedProperties !== false)) {
      fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher complete schema object is not closed.");
    }
    for (const [key, child] of Object.entries(node)) {
      visitSchema(child, schemaFile, partialCompositionArm || key === "if" || key === "then");
    }
  };
  for (let index = 0; index < bundle.files.length; index++) {
    const file = String((bundle.files[index] as JsonRecord).file);
    if (!file.endsWith(".json")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded[index].toString("utf8"));
    } catch {
      fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher pack JSON is invalid.");
    }
    const expectedBytes = file === "watcher-sample-plan.json"
      ? Buffer.from(stableJson(parsed), "utf8")
      : canonicalPrettyBytes(parsed as JsonRecord);
    if (!decoded[index].equals(expectedBytes)) {
      fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher pack JSON bytes are not canonical.");
    }
    if (!file.endsWith(".schema.json")) continue;
    const schema = canonicalRecord(parsed, "watcher pack schema");
    if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema"
        || schema.$id !== `${WATCHER_RECOVERY_SCHEMA_ROOT}${file}`) {
      fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher schema identity is invalid.");
    }
    const definitions = canonicalRecord(schema.$defs, "watcher schema definitions");
    for (const definitionName of Object.keys(definitions)) {
      if (schemaDefinitionOwners.has(definitionName)) {
        fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher schema definition ownership is duplicated.");
      }
      schemaDefinitionOwners.set(definitionName, file);
    }
    visitSchema(schema, file);
  }
  if (schemaDefinitionOwners.get("acceptedSource") !== "topology.schema.json"
      || schemaDefinitionOwners.get("rejectedSource") !== "topology.schema.json") {
    fail("GKX_WATCHER_CONTRACT_PACK_INVALID", "watcher source-row schema ownership is invalid.");
  }
  return null;
}

export function watcherParserDescriptorDigest(source: SourceFile): string {
  return retrievalCanonicalDigest({
    contract_version: "gkos-watcher-parser-descriptor/1.0.0-draft.1",
    canonical_candidate_source_descriptor: canonicalCandidateSourceDescriptor(source),
  });
}

const WATCHER_GRAPH_SET_ARRAY_KEYS = new Set([
  "aliases", "areas", "diagnostic_codes", "labels", "lineageWarnings", "statuses", "supersededByIds", "supersedes", "supersedesIds", "tags", "types",
]);

const WATCHER_GKX_GRAPH_KEYS = Object.freeze([
  "nodes", "links", "stats", "areas", "tags", "statuses", "types", "diagnostics", "__timeSpan",
  "gkxProfile", "gkxUidIndex", "gkxAssessments", "gkxDiagnostics",
] as const);
const WATCHER_GKX_STATS_KEYS = Object.freeze([
  "files", "folders", "unresolved", "links", "wikilinks", "markdownLinks", "propertyLinks", "orphans",
] as const);
const WATCHER_GKX_RAW_STATS_KEYS = Object.freeze(["indexedAt", "durationMs", ...WATCHER_GKX_STATS_KEYS] as const);
const WATCHER_GKX_DIAGNOSTICS_KEYS = Object.freeze([
  "notes", "folders", "attachments", "unresolvedLinks", "ambiguousLinks", "lineageEdges", "lineageCycles", "lineageWarnings", "residualCollisions",
] as const);
const WATCHER_GKX_DIAGNOSTIC_TIMING_KEYS = new Set(["lastFullBuildMs", "lastIncrementalUpdateMs"]);

function assertGraphKeys(value: unknown, required: readonly string[], label: string, optional: ReadonlySet<string> = new Set()): JsonRecord {
  const item = record(value, label);
  const actual = Object.keys(item).sort(retrievalCodeUnitCompare);
  const admitted = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(item, key)) || actual.some((key) => !admitted.has(key))) {
    fail("GKX_WATCHER_CONTRACT_GRAPH_INVALID", `${label} has an invalid exact key set.`);
  }
  return item;
}

function assertRawGraphShape(value: unknown, allowNodeById: boolean): JsonRecord {
  const optionalTop = allowNodeById ? new Set(["nodeById"]) : new Set<string>();
  const graph = assertGraphKeys(value, WATCHER_GKX_GRAPH_KEYS, "raw GKX graph", optionalTop);
  assertGraphKeys(graph.stats, WATCHER_GKX_RAW_STATS_KEYS, "raw GKX graph stats");
  assertGraphKeys(graph.diagnostics, WATCHER_GKX_DIAGNOSTICS_KEYS, "raw GKX graph diagnostics", WATCHER_GKX_DIAGNOSTIC_TIMING_KEYS);
  for (const key of ["nodes", "links", "areas", "tags", "statuses", "types", "gkxAssessments", "gkxDiagnostics"] as const) {
    if (!Array.isArray(graph[key])) fail("GKX_WATCHER_CONTRACT_GRAPH_INVALID", `raw GKX graph ${key} must be an array.`);
  }
  return graph;
}

function assertCanonicalGraphShape(value: unknown): JsonRecord {
  const graph = assertGraphKeys(value, WATCHER_GKX_GRAPH_KEYS, "canonical GKX graph");
  assertGraphKeys(graph.stats, WATCHER_GKX_STATS_KEYS, "canonical GKX graph stats");
  assertGraphKeys(graph.diagnostics, WATCHER_GKX_DIAGNOSTICS_KEYS, "canonical GKX graph diagnostics");
  for (const key of ["nodes", "links", "areas", "tags", "statuses", "types", "gkxAssessments", "gkxDiagnostics"] as const) {
    if (!Array.isArray(graph[key])) fail("GKX_WATCHER_CONTRACT_GRAPH_INVALID", `canonical GKX graph ${key} must be an array.`);
  }
  return graph;
}

function canonicalizeGraphValue(value: unknown, key: string | null = null): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map((item) => canonicalizeGraphValue(item));
    if (key !== null && WATCHER_GRAPH_SET_ARRAY_KEYS.has(key) && mapped.every((item) => typeof item === "string")) {
      return [...new Set(mapped as string[])].sort(retrievalCodeUnitCompare);
    }
    return mapped;
  }
  if (value && typeof value === "object") {
    const result: JsonRecord = {};
    for (const childKey of Object.keys(value as JsonRecord).sort(retrievalCodeUnitCompare)) {
      if ((value as JsonRecord)[childKey] === undefined) continue;
      result[childKey] = canonicalizeGraphValue((value as JsonRecord)[childKey], childKey);
    }
    return result;
  }
  return value;
}

export function normalizeWatcherCanonicalGkxGraph(graph: GkxGraph): Readonly<JsonRecord> {
  const source = assertRawGraphShape(graph, true);
  const rawStats = source.stats as JsonRecord;
  const rawDiagnostics = source.diagnostics as JsonRecord;
  const canonicalStats = Object.fromEntries(WATCHER_GKX_STATS_KEYS.map((key) => [key, rawStats[key]]));
  const canonicalDiagnostics = Object.fromEntries(WATCHER_GKX_DIAGNOSTICS_KEYS.map((key) => [key, rawDiagnostics[key]]));
  const nodes = (source.nodes as unknown[]).map((node) => canonicalizeGraphValue(node) as JsonRecord)
    .sort((left, right) => retrievalCodeUnitCompare(`${String(left.id)}\u0000${String(left.path)}`, `${String(right.id)}\u0000${String(right.path)}`));
  const links = (source.links as unknown[]).map((link) => canonicalizeGraphValue(link) as JsonRecord)
    .sort((left, right) => retrievalCodeUnitCompare(
      `${String(left.id)}\u0000${String(left.source)}\u0000${String(left.target)}\u0000${String(left.kind)}`,
      `${String(right.id)}\u0000${String(right.source)}\u0000${String(right.target)}\u0000${String(right.kind)}`,
    ));
  const assessments = Array.isArray(source.gkxAssessments)
    ? source.gkxAssessments.map((item) => canonicalizeGraphValue(item)).sort((left, right) => retrievalCodeUnitCompare(stableJson(left), stableJson(right))) : [];
  const diagnostics = Array.isArray(source.gkxDiagnostics)
    ? source.gkxDiagnostics.map((item) => canonicalizeGraphValue(item)).sort((left, right) => retrievalCodeUnitCompare(stableJson(left), stableJson(right))) : [];
  const normalizedGraph = {
    nodes,
    links,
    stats: canonicalizeGraphValue(canonicalStats, "stats"),
    areas: canonicalizeGraphValue(source.areas, "areas"),
    tags: canonicalizeGraphValue(source.tags, "tags"),
    statuses: canonicalizeGraphValue(source.statuses, "statuses"),
    types: canonicalizeGraphValue(source.types, "types"),
    diagnostics: canonicalizeGraphValue(canonicalDiagnostics, "diagnostics"),
    __timeSpan: canonicalizeGraphValue(source.__timeSpan),
    gkxProfile: canonicalizeGraphValue(source.gkxProfile),
    gkxUidIndex: canonicalizeGraphValue(source.gkxUidIndex),
    gkxAssessments: assessments,
    gkxDiagnostics: diagnostics,
  };
  const material = {
    contract_version: "gkos-watcher-canonical-gkx-graph/1.0.0-draft.1",
    normalized_graph: normalizedGraph,
  };
  return deepFreeze(material);
}

function normalizeAlreadyCanonicalGkxGraph(graph: unknown): Readonly<JsonRecord> {
  const source = assertCanonicalGraphShape(graph);
  const nodes = (source.nodes as unknown[]).map((node) => canonicalizeGraphValue(node) as JsonRecord)
    .sort((left, right) => retrievalCodeUnitCompare(`${String(left.id)}\u0000${String(left.path)}`, `${String(right.id)}\u0000${String(right.path)}`));
  const links = (source.links as unknown[]).map((link) => canonicalizeGraphValue(link) as JsonRecord)
    .sort((left, right) => retrievalCodeUnitCompare(
      `${String(left.id)}\u0000${String(left.source)}\u0000${String(left.target)}\u0000${String(left.kind)}`,
      `${String(right.id)}\u0000${String(right.source)}\u0000${String(right.target)}\u0000${String(right.kind)}`,
    ));
  const assessments = (source.gkxAssessments as unknown[]).map((item) => canonicalizeGraphValue(item))
    .sort((left, right) => retrievalCodeUnitCompare(stableJson(left), stableJson(right)));
  const diagnostics = (source.gkxDiagnostics as unknown[]).map((item) => canonicalizeGraphValue(item))
    .sort((left, right) => retrievalCodeUnitCompare(stableJson(left), stableJson(right)));
  return deepFreeze({
    contract_version: "gkos-watcher-canonical-gkx-graph/1.0.0-draft.1",
    normalized_graph: {
      nodes,
      links,
      stats: canonicalizeGraphValue(source.stats, "stats"),
      areas: canonicalizeGraphValue(source.areas, "areas"),
      tags: canonicalizeGraphValue(source.tags, "tags"),
      statuses: canonicalizeGraphValue(source.statuses, "statuses"),
      types: canonicalizeGraphValue(source.types, "types"),
      diagnostics: canonicalizeGraphValue(source.diagnostics, "diagnostics"),
      __timeSpan: canonicalizeGraphValue(source.__timeSpan),
      gkxProfile: canonicalizeGraphValue(source.gkxProfile),
      gkxUidIndex: canonicalizeGraphValue(source.gkxUidIndex),
      gkxAssessments: assessments,
      gkxDiagnostics: diagnostics,
    },
  });
}

export function normalizeWatcherGraphDelta(delta: GraphDelta): Readonly<JsonRecord> {
  const material = {
    contract_version: "gkos-watcher-normalized-graph-delta/1.0.0-draft.1",
    delta: {
      addedNodes: delta.addedNodes.slice().sort(retrievalCodeUnitCompare),
      removedNodes: delta.removedNodes.slice().sort(retrievalCodeUnitCompare),
      changedNodes: delta.changedNodes.slice().sort(retrievalCodeUnitCompare),
      topologyChanged: delta.topologyChanged,
      reparsed: delta.reparsed,
      fullRebuild: delta.fullRebuild,
    },
  };
  return deepFreeze(material);
}

export function deriveWatcherGraphitiProjection(graph: GkxGraph, vaultId: string): Readonly<JsonRecord> {
  if (!validLabel(vaultId)) fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", "Graphiti vault authority is invalid.");
  const episodes = buildGraphitiEpisodes(graph, {
    vault: vaultId,
    vaultIdentity: vaultId,
    processingTime: "1970-01-01T00:00:00.000Z",
  }).map((episode) => {
    const body = JSON.parse(episode.episode_body) as unknown;
    return { ...episode, episode_body: stableJson(body) };
  });
  const material = {
    contract_version: "gkos-watcher-graphiti-projection/1.0.0-draft.1",
    processing_time: "1970-01-01T00:00:00.000Z",
    episodes,
  };
  return deepFreeze(canonicalRecord(material, "Graphiti projection"));
}

export function watcherArtifactCoordinate(kind: "observation" | "plan" | "topology" | "graph", value: JsonRecord): Readonly<JsonRecord> {
  const digestField = kind === "observation" ? "observation_digest"
    : kind === "plan" ? "plan_digest"
      : kind === "topology" ? "topology_snapshot_digest"
        : "graph_artifact_digest";
  const digest = value[digestField];
  if (!isDigest(digest)) fail("GKX_WATCHER_CONTRACT_DIGEST_INVALID", `${kind} artifact digest is invalid.`);
  const bytes = `${JSON.stringify(JSON.parse(stableJson(value)), null, 2)}\n`;
  const cap = kind === "observation" ? 4 * 1024 * 1024 : 512 * 1024 * 1024;
  const byteSize = Buffer.byteLength(bytes);
  if (byteSize > cap) fail("GKX_WATCHER_CONTRACT_RELATION_INVALID", `${kind} artifact exceeds its byte cap.`);
  return Object.freeze({
    file: `watcher-${kind}-${String(digest).slice("sha256:".length)}.json`,
    byte_size: byteSize,
    raw_sha256: retrievalSha256(bytes),
    bytes,
  });
}

export function watcherCeilMicrosFromNanoseconds(delta: bigint): number {
  if (delta < 0n) fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "duration cannot be negative.");
  const value = (delta + 999n) / 1_000n;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "duration exceeds the safe integer range.");
  return Number(value);
}

export function watcherNearestRank(samples: readonly number[], percentile: 50 | 95 | 99): number {
  if (samples.length < 1 || samples.some((value) => !integer(value))) {
    return fail("GKX_WATCHER_CONTRACT_MEASUREMENT_INVALID", "percentile samples are invalid.");
  }
  const sorted = samples.slice().sort((a, b) => a - b);
  const rank = Math.ceil(percentile * sorted.length / 100);
  return sorted[rank - 1];
}

export function watcherContractVersions(): readonly string[] {
  return Object.freeze(Object.keys(DESCRIPTORS).sort(retrievalCodeUnitCompare));
}
