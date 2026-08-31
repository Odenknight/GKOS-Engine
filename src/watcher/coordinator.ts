import { lstatSync } from "node:fs";
import { join } from "node:path";

import {
  deriveWatcherGraphitiProjection,
  normalizeWatcherCanonicalGkxGraph,
  normalizeWatcherGraphDelta,
  sealWatcherCoherentActivationBundle,
  sealWatcherFailureRetryBundle,
  sealWatcherFailureRetryNoopBundle,
  sealWatcherJournalResetReconciliationAdoptionBundle,
  sealWatcherRecoveryRecord,
  watcherArtifactCoordinate,
} from "./contracts";
import {
  createWatcherPublicationFile,
  ensureWatcherPublicationFile,
  hardlinkWatcherPublicationFile,
  hardlinkWatcherLeafNoReplace,
  parseCanonicalWatcherJson,
  readWatcherFile,
  readWatcherPublicationEntryFile,
  replaceWatcherPublicationFile,
  syncWatcherDirectory,
  unlinkWatcherPublicationFile,
  unlinkWatcherLeaf,
  watcherPublicationEntryLeaves,
  watcherCanonicalBytes,
  watcherDigest,
  watcherLeafExists,
  watcherRawDigest,
  withAuthorizedWatcherPublication,
  writeNewWatcherFile,
  type WatcherDirectoryCapability,
  type WatcherPublicationOperation,
} from "./fs-authority";
import {
  finalizeWatcherJournalActivation,
  finalizeWatcherJournalTarget,
  prepareWatcherJournalActivation,
  readWatcherJournalActivationIntent,
  readWatcherJournalActive,
  watcherJournalIsAnchoredResetPendingReconciliation,
  type WatcherJournalHandle,
} from "./journal";
import {
  prepareWatcherPointerGuard,
  publishWatcherPointer,
  readWatcherPointer,
  recoverWatcherPointer,
  watcherPointerArtifact,
  WATCHER_JOURNAL_POINTER_NAMES,
  WATCHER_OUTER_POINTER_NAMES,
  type WatcherPointerArtifact,
} from "./pointer";
import { retrievalCodeUnitCompare, stableJson } from "../retrieval/digest";
import type { IngestOwnerGenerationManifest, IngestValidationPlan } from "../ingest/types";
import { sealIngestOwnerGenerationManifestEnvelope } from "../ingest/storage";
import { RetrievalCoordinator, vaultSourceReader, type RetrievalCoordinatorOptions } from "../retrieval/coordinator";
import type { RetrievalSearchRequest, RetrievalSearchResult } from "../retrieval/types";
import type { GkxGraph, GkxLink, GkxNode } from "../types";
import type { WatcherIndexValidationOutcome } from "./index-validation-hook";
import {
  secureWatcherSourceScan,
  watcherScanMatchesTopology,
  type WatcherSourceScan,
} from "../ingest/source-scan";

type JsonRecord = Record<string, unknown>;

export const WATCHER_AUTHORITY_FILE = "watcher-authority.json";
export const WATCHER_AUTHORITY_TEMP_FILE = ".watcher-authority.json.gkos-watcher.tmp";

export interface WatcherCoherentActivationResult {
  readonly active: Readonly<JsonRecord>;
  readonly manifest: Readonly<JsonRecord>;
  readonly pointer: Readonly<JsonRecord>;
  readonly pointer_artifact: WatcherPointerArtifact;
}

export interface WatcherActivationDerivationInput {
  readonly vault_id: string;
  readonly configuration_digest: string;
  readonly policy_digest: string;
  readonly effective_profile_digest: string;
  readonly scan: WatcherSourceScan;
  readonly validation_plan: IngestValidationPlan;
  readonly validation_outcome: WatcherIndexValidationOutcome;
  readonly staged_owner_manifest: IngestOwnerGenerationManifest;
  readonly vector_provider_kind?: "openai_compatible" | "local_onnx" | "mcp" | null;
  readonly prior_pointer: Readonly<JsonRecord> | null;
  readonly prior_manifest: Readonly<JsonRecord> | null;
  readonly prior_topology: Readonly<JsonRecord> | null;
  readonly batch_kind: "event" | "startup_reconciliation" | "shutdown_flush" | "failure_reconciliation";
  readonly execution_kind: "apply_changes" | "set_files";
  readonly retry_of_batch_id?: string | null;
  readonly observed_paths?: readonly string[];
  readonly unscoped: boolean;
  readonly overflow: boolean;
  readonly batch_id: string;
  readonly recorded_at: string;
  readonly source_removal_adapter_binding?: Readonly<JsonRecord> | null;
}

export interface WatcherCoherentSearchOptions {
  /** Trusted immutable reader; filesystem freshness/root checks still run. */
  readonly source_reader?: RetrievalCoordinatorOptions["source_reader"];
  readonly watcher_directory: WatcherDirectoryCapability;
  readonly retrieval_directory: WatcherDirectoryCapability;
  readonly vault_root: string;
  readonly configuration_digest: string;
  readonly policy_digest: string;
  readonly effective_profile_digest: string;
  readonly request: RetrievalSearchRequest;
  readonly coordinator_options: Omit<RetrievalCoordinatorOptions, "source_reader" | "runtime_policy_digest" | "lineage_view_freshness">;
  /** Test-only narrowing; production waits through two retained 2s reconciliation intervals. */
  readonly freshness_wait_ms?: number;
}

export interface WatcherResetReconciliationDerivationInput {
  readonly vault_id: string;
  readonly configuration_digest: string;
  readonly policy_digest: string;
  readonly effective_profile_digest: string;
  readonly scan: WatcherSourceScan;
  readonly validation_plan: IngestValidationPlan;
  readonly validation_outcome: WatcherIndexValidationOutcome;
  readonly current_owner_manifest: IngestOwnerGenerationManifest;
  readonly current_pointer: Readonly<JsonRecord>;
  readonly current_manifest: Readonly<JsonRecord>;
  readonly current_topology: Readonly<JsonRecord>;
  readonly current_raw_graph: Readonly<JsonRecord>;
  readonly journal_authority: Readonly<JsonRecord>;
  readonly batch_id: string;
  readonly recorded_at: string;
}

export interface WatcherFailureAuthorityDerivationInput {
  readonly vault_id: string;
  readonly configuration_digest: string;
  readonly policy_digest: string;
  readonly effective_profile_digest: string;
  readonly prior_pointer: Readonly<JsonRecord> | null;
  readonly prior_manifest: Readonly<JsonRecord> | null;
  readonly prior_topology: Readonly<JsonRecord> | null;
  readonly batch_kind: "event" | "startup_reconciliation" | "shutdown_flush" | "failure_reconciliation";
  readonly execution_kind: "apply_changes" | "set_files";
  readonly retry_of_batch_id?: string | null;
  readonly observed_paths?: readonly string[];
  readonly unscoped: boolean;
  readonly overflow: boolean;
  readonly batch_id: string;
  readonly started_at: string;
  readonly failed_at: string;
}

export interface WatcherFailureRetryNoopDerivationInput {
  readonly failure_retry_bundle: Readonly<JsonRecord>;
  readonly vault_id: string;
  readonly configuration_digest: string;
  readonly policy_digest: string;
  readonly effective_profile_digest: string;
  readonly scan: WatcherSourceScan;
  readonly validation_plan: IngestValidationPlan;
  readonly validation_outcome: WatcherIndexValidationOutcome;
  readonly current_owner_manifest: IngestOwnerGenerationManifest;
  readonly current_pointer: Readonly<JsonRecord>;
  readonly current_manifest: Readonly<JsonRecord>;
  readonly current_topology: Readonly<JsonRecord>;
  readonly current_raw_graph: Readonly<JsonRecord>;
  readonly current_activation_intent: Readonly<JsonRecord>;
  readonly current_activation_outcome: Readonly<JsonRecord>;
  readonly current_active: Readonly<JsonRecord>;
  readonly completed_at: string;
}

function fail(code: string): never {
  throw new Error(code);
}

function record(value: unknown, code: string): Readonly<JsonRecord> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as Readonly<JsonRecord>;
}

function sealWithDigest(base: JsonRecord, digestField: string): Readonly<JsonRecord> {
  return sealWatcherRecoveryRecord({ ...base, [digestField]: watcherDigest(base) });
}

function sortedStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(retrievalCodeUnitCompare);
}

function acceptedGraph(
  source: GkxGraph,
  acceptedPaths: ReadonlySet<string>,
  attachmentCount: number,
): GkxGraph {
  const cloned = JSON.parse(JSON.stringify(source)) as GkxGraph;
  const baseNodes = cloned.nodes.filter((node) => node.kind !== "file" || acceptedPaths.has(node.path));
  const admittedIds = new Set(baseNodes.map((node) => node.id));
  for (const link of cloned.links) {
    if (admittedIds.has(link.source) && link.target.startsWith("unresolved:")) admittedIds.add(link.target);
  }
  const nodes = baseNodes.filter((node) => admittedIds.has(node.id));
  const links = cloned.links.filter((link) => admittedIds.has(link.source) && admittedIds.has(link.target));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const link of links) {
    outgoing.set(link.source, (outgoing.get(link.source) ?? 0) + 1);
    incoming.set(link.target, (incoming.get(link.target) ?? 0) + 1);
  }
  for (const node of nodes) {
    node.outgoing = outgoing.get(node.id) ?? 0;
    node.incoming = incoming.get(node.id) ?? 0;
  }
  const acceptedUids = new Set(nodes.flatMap((node) => typeof node.gkx?.uid === "string" ? [node.gkx.uid] : []));
  const byUid = Object.fromEntries(Object.entries(cloned.gkxUidIndex as Record<string, unknown>)
    .filter(([uid, nodeId]) => acceptedUids.has(uid) && typeof nodeId === "string" && admittedIds.has(nodeId)));
  const sourceBound = (value: unknown): boolean => {
    if (value === null || typeof value !== "object") return true;
    const item = value as JsonRecord;
    const path = item.sourcePath ?? item.source_path;
    const target = item.targetUid ?? item.target_uid;
    return (typeof path !== "string" || acceptedPaths.has(path)) && (typeof target !== "string" || acceptedUids.has(target));
  };
  const fileNodes = nodes.filter((node) => node.kind === "file");
  const folderNodes = nodes.filter((node) => node.kind === "folder");
  const unresolvedNodes = nodes.filter((node) => node.kind === "unresolved");
  const ordinaryLinks = links.filter((link) => link.kind !== "contains");
  const result: GkxGraph = {
    nodes,
    links,
    stats: {
      ...cloned.stats,
      files: fileNodes.length,
      folders: folderNodes.length,
      unresolved: unresolvedNodes.length,
      links: links.length,
      wikilinks: links.filter((link) => link.kind === "wikilink").length,
      markdownLinks: links.filter((link) => link.kind === "markdown").length,
      propertyLinks: links.filter((link) => link.kind === "property").length,
      orphans: fileNodes.filter((node) => !ordinaryLinks.some((link) => link.source === node.id || link.target === node.id)).length,
    },
    areas: sortedStrings(nodes.map((node) => node.area)),
    tags: sortedStrings(fileNodes.flatMap((node) => node.tags)),
    statuses: sortedStrings(fileNodes.flatMap((node) => typeof node.status === "string" ? [node.status] : [])),
    types: sortedStrings(fileNodes.flatMap((node) => typeof node.type === "string" ? [node.type] : [])),
    diagnostics: {
      ...cloned.diagnostics,
      notes: fileNodes.length,
      folders: folderNodes.length,
      attachments: attachmentCount,
      unresolvedLinks: unresolvedNodes.length,
      lineageEdges: links.filter((link) => link.kind === "lineage").length,
    },
    __timeSpan: cloned.__timeSpan,
    gkxProfile: cloned.gkxProfile,
    gkxUidIndex: byUid,
    gkxAssessments: Array.isArray(cloned.gkxAssessments) ? cloned.gkxAssessments.filter(sourceBound) : [],
    gkxDiagnostics: Array.isArray(cloned.gkxDiagnostics) ? cloned.gkxDiagnostics.filter(sourceBound) : [],
  };
  return result;
}

function acceptedRows(outcome: WatcherIndexValidationOutcome): JsonRecord[] {
  return outcome.sources.filter((source) => source.disposition === "accepted").map((source) => ({
    source_path: source.source_path,
    source_id: source.source_id,
    source_observation_ordinal: source.source_observation_ordinal,
    source_digest: source.source_digest,
    source_size_bytes: source.source_size_bytes,
    parser_descriptor_digest: source.parser_descriptor_digest,
  })).sort((left, right) => retrievalCodeUnitCompare(
    `${String(left.source_path)}\0${String(left.source_observation_ordinal).padStart(7, "0")}\0${String(left.source_digest)}`,
    `${String(right.source_path)}\0${String(right.source_observation_ordinal).padStart(7, "0")}\0${String(right.source_digest)}`,
  ));
}

function rejectedRows(outcome: WatcherIndexValidationOutcome): JsonRecord[] {
  return outcome.sources.filter((source) => source.disposition === "deterministic_rejection").map((source) => ({
    source_path: source.source_path,
    source_id: source.source_id,
    source_observation_ordinal: source.source_observation_ordinal,
    source_digest: source.source_digest,
    // Topology's nullable rejected-size coordinate is bounded by the admitted
    // source envelope. An exact over-limit observation remains bound through
    // its rejection digest, while its topology size is necessarily null.
    source_size_bytes: typeof source.source_size_bytes === "number"
      && source.source_size_bytes <= 64 * 1024 * 1024 ? source.source_size_bytes : null,
    parser_descriptor_digest: source.parser_descriptor_digest,
    rejection_digest: source.rejection_digest,
    rejection_class: source.rejection_class,
  })).sort((left, right) => retrievalCodeUnitCompare(
    `${String(left.source_path)}\0${String(left.source_observation_ordinal).padStart(7, "0")}\0${String(left.rejection_digest)}`,
    `${String(right.source_path)}\0${String(right.source_observation_ordinal).padStart(7, "0")}\0${String(right.rejection_digest)}`,
  ));
}

function sourceMutations(
  priorTopology: Readonly<JsonRecord> | null,
  accepted: readonly JsonRecord[],
  rejected: readonly JsonRecord[],
): JsonRecord[] {
  const priorAccepted = (priorTopology?.accepted_sources ?? []) as JsonRecord[];
  const priorRejected = (priorTopology?.rejected_sources ?? []) as JsonRecord[];
  const priorByPath = new Map(priorAccepted.map((row) => [String(row.source_path), row]));
  const targetByPath = new Map(accepted.map((row) => [String(row.source_path), row]));
  const targetRejected = new Map(rejected.map((row) => [String(row.source_path), row]));
  const priorRejectedPaths = new Set(priorRejected.map((row) => String(row.source_path)));
  const consumedPriorPaths = new Set<string>();
  const mutations: JsonRecord[] = [];
  for (const target of accepted) {
    const path = String(target.source_path);
    const prior = priorByPath.get(path);
    if (prior !== undefined) {
      consumedPriorPaths.add(path);
      if (prior.source_id !== target.source_id) {
        fail("GKX_WATCHER_SOURCE_IDENTITY_CHANGED");
      }
      if (prior.source_digest !== target.source_digest || prior.parser_descriptor_digest !== target.parser_descriptor_digest) {
        mutations.push({
          kind: "change",
          cause: prior.source_digest === target.source_digest ? "metadata_change" : "content_change",
          from_path: path,
          to_path: path,
          source_id_before: prior.source_id,
          source_id_after: target.source_id,
          source_digest_before: prior.source_digest,
          source_digest_after: target.source_digest,
          parser_descriptor_digest_before: prior.parser_descriptor_digest,
          parser_descriptor_digest_after: target.parser_descriptor_digest,
        });
      }
      continue;
    }
    const renamed = priorAccepted.find((candidate) => !consumedPriorPaths.has(String(candidate.source_path)) &&
      candidate.source_id === target.source_id && candidate.source_digest === target.source_digest &&
      candidate.parser_descriptor_digest === target.parser_descriptor_digest);
    if (renamed !== undefined) {
      consumedPriorPaths.add(String(renamed.source_path));
      mutations.push({
        kind: "rename", cause: "verified_rename", from_path: renamed.source_path, to_path: path,
        source_id_before: renamed.source_id, source_id_after: target.source_id,
        source_digest_before: renamed.source_digest, source_digest_after: target.source_digest,
        parser_descriptor_digest_before: renamed.parser_descriptor_digest,
        parser_descriptor_digest_after: target.parser_descriptor_digest,
      });
    } else {
      mutations.push({
        kind: "add", cause: priorRejectedPaths.has(path) ? "validation_reacceptance" : "physical_appearance",
        from_path: null, to_path: path, source_id_before: null, source_id_after: target.source_id,
        source_digest_before: null, source_digest_after: target.source_digest,
        parser_descriptor_digest_before: null, parser_descriptor_digest_after: target.parser_descriptor_digest,
      });
    }
  }
  for (const prior of priorAccepted) {
    const path = String(prior.source_path);
    if (consumedPriorPaths.has(path) || targetByPath.has(path)) continue;
    const deterministicRejection = targetRejected.has(path);
    mutations.push({
      kind: "delete", cause: deterministicRejection ? "validation_rejection" : "physical_disappearance", from_path: path, to_path: null,
      source_id_before: prior.source_id, source_id_after: null,
      source_digest_before: prior.source_digest, source_digest_after: null,
      parser_descriptor_digest_before: prior.parser_descriptor_digest, parser_descriptor_digest_after: null,
    });
  }
  return mutations.sort((left, right) => retrievalCodeUnitCompare(
    `${String(left.from_path ?? left.to_path)}\0${String(left.to_path ?? "")}\0${String(left.kind)}\0${String(left.cause)}`,
    `${String(right.from_path ?? right.to_path)}\0${String(right.to_path ?? "")}\0${String(right.kind)}\0${String(right.cause)}`,
  ));
}

function sourceRemovalBundle(input: WatcherActivationDerivationInput, mutations: readonly JsonRecord[], targetTopologyDigest: string): {
  bundle: Readonly<JsonRecord> | null;
  event_set_digest: string | null;
  event_count: number;
} {
  const removed = mutations.filter((mutation) => mutation.kind === "delete" && mutation.cause === "physical_disappearance");
  if (removed.length === 0) return { bundle: null, event_set_digest: null, event_count: 0 };
  if (input.prior_manifest === null || input.prior_topology === null) fail("GKX_WATCHER_SOURCE_REMOVAL_PRIOR_AUTHORITY_INVALID");
  const binding = input.source_removal_adapter_binding === null || input.source_removal_adapter_binding === undefined
    ? null : sealWatcherRecoveryRecord(input.source_removal_adapter_binding);
  if (binding !== null && (binding.contract_version !== "gkos-watcher-source-removal-adapter-binding/1.0.0-draft.1" ||
      binding.vault_id !== input.vault_id || binding.configuration_digest !== input.configuration_digest || binding.policy_digest !== input.policy_digest)) {
    fail("GKX_WATCHER_SOURCE_REMOVAL_BINDING_INVALID");
  }
  const rows = removed.map((mutation) => {
    const occurrenceBase = {
      contract_version: "gkos-watcher-source-removal-occurrence/1.0.0-draft.1",
      vault_id: input.vault_id,
      prior_coherent_manifest_digest: input.prior_manifest!.coherent_manifest_digest,
      prior_topology_snapshot_digest: input.prior_topology!.topology_snapshot_digest,
      source_id: mutation.source_id_before,
      source_path: mutation.from_path,
      source_digest: mutation.source_digest_before,
      cause: "physical_disappearance",
    };
    const occurrence = sealWithDigest(occurrenceBase, "occurrence_digest");
    const eventBase = {
      contract_version: "gkos-watcher-source-removal-event/1.0.0-draft.1",
      occurrence_digest: occurrence.occurrence_digest,
      adapter_binding_digest: binding?.binding_digest ?? null,
      delivery_mode: binding === null ? "local_only" : "adapter",
    };
    const event = sealWithDigest(eventBase, "event_digest");
    return { occurrence, event };
  }).sort((left, right) => retrievalCodeUnitCompare(
    `${String(left.occurrence.source_path)}\0${String(left.occurrence.occurrence_digest)}\0`,
    `${String(right.occurrence.source_path)}\0${String(right.occurrence.occurrence_digest)}\0`,
  ));
  const memberships = rows.map((row, index) => sealWithDigest({
    contract_version: "gkos-watcher-source-removal-event-membership/1.0.0-draft.1",
    event_ordinal: index + 1,
    event_digest: row.event.event_digest,
    causal_batch_id: input.batch_id,
    target_topology_snapshot_digest: targetTopologyDigest,
    prepared_at: input.recorded_at,
    original_membership_digest: null,
  }, "membership_digest"));
  const sequenceDigest = watcherDigest({
    contract_version: "gkos-watcher-source-removal-membership-sequence/1.0.0-draft.1",
    membership_digests: memberships.map((membership) => membership.membership_digest),
  });
  const eventSet = sealWithDigest({
    contract_version: "gkos-watcher-source-removal-event-set/1.0.0-draft.1",
    set_kind: "batch",
    origin_id: input.batch_id,
    target_topology_snapshot_digest: targetTopologyDigest,
    event_count: rows.length,
    membership_digest_sequence_digest: sequenceDigest,
    prepared_at: input.recorded_at,
  }, "event_set_digest");
  const bundle = Object.freeze({
    event_set: eventSet,
    memberships,
    prior_memberships: rows.map(() => null),
    events: rows.map((row) => row.event),
    prior_events: rows.map(() => null),
    occurrences: rows.map((row) => row.occurrence),
    prior_occurrences: rows.map(() => null),
  });
  return { bundle, event_set_digest: String(eventSet.event_set_digest), event_count: rows.length };
}

function notStartedRetrievalState(): Readonly<JsonRecord> {
  return Object.freeze({
    state: "not_started", owner_generation_id: null, owner_manifest_digest: null, database_file: null,
    manifest_digest: null, projection_id: null, projection_digest: null, lexical_backend: null,
    vector_stage_state: null, provider_kind: null, provider_id: null, model_id: null, dimensions: null,
    reason_codes: [],
  });
}

function notStartedGraphState(): Readonly<JsonRecord> {
  return Object.freeze({
    state: "not_started", graph_contract_version: null, graph_artifact_file: null, graph_artifact_digest: null,
    canonical_graph_digest: null, gkx_delta_digest: null, graphiti_projection_digest: null,
    sink_state: "not_applicable", sink_receipts: [], reason_codes: [],
  });
}

/**
 * Derives the immutable Slice-A activation envelope from one governed Phase-3
 * validation outcome and one unactivated schema-3 generation. This function
 * performs no I/O and never parses source bytes a second time.
 */
export function deriveWatcherCoherentActivation(input: WatcherActivationDerivationInput): Readonly<JsonRecord> | null {
  if (input.validation_outcome.plan !== input.validation_plan ||
      input.staged_owner_manifest.observation_snapshot_digest !== input.validation_plan.observation_snapshot_digest ||
      input.staged_owner_manifest.vault_id !== input.vault_id ||
      input.staged_owner_manifest.configuration_digest !== input.configuration_digest ||
      input.staged_owner_manifest.policy_digest !== input.policy_digest ||
      input.validation_plan.result.profile.effective_profile_digest !== input.effective_profile_digest) {
    fail("GKX_WATCHER_DERIVATION_AUTHORITY_INVALID");
  }
  const accepted = acceptedRows(input.validation_outcome);
  const rejected = rejectedRows(input.validation_outcome);
  const validationResultDigest = watcherDigest(input.validation_plan.result);
  const rejectionJournalDigest = input.staged_owner_manifest.rejection_journal.rejection_journal_digest;
  const acceptedSetDigest = watcherDigest({ contract_version: "gkos-watcher-accepted-source-set/1.0.0-draft.1", sources: accepted });
  const rejectedSetDigest = watcherDigest({ contract_version: "gkos-watcher-rejected-source-set/1.0.0-draft.1", sources: rejected });
  const folderSetDigest = watcherDigest({ contract_version: "gkos-watcher-folder-set/1.0.0-draft.1", folder_paths: input.scan.folders });
  const attachmentSetDigest = watcherDigest({ contract_version: "gkos-watcher-attachment-set/1.0.0-draft.1", attachment_paths: input.scan.attachments });
  const topologyBase: JsonRecord = {
    contract_version: "gkos-watcher-topology-snapshot/1.0.0-draft.1",
    vault_id: input.vault_id,
    source_observation_snapshot_digest: input.validation_plan.observation_snapshot_digest,
    validation_result_digest: validationResultDigest,
    rejection_journal_digest: rejectionJournalDigest,
    accepted_sources: accepted,
    rejected_sources: rejected,
    folder_paths: [...input.scan.folders],
    attachment_paths: [...input.scan.attachments],
    accepted_source_set_digest: acceptedSetDigest,
    rejected_source_set_digest: rejectedSetDigest,
    folder_set_digest: folderSetDigest,
    attachment_set_digest: attachmentSetDigest,
  };
  const topology = sealWithDigest(topologyBase, "topology_snapshot_digest");
  const mutations = sourceMutations(input.prior_topology, accepted, rejected);
  const priorFolders = (input.prior_topology?.folder_paths ?? []) as readonly unknown[];
  const priorAttachments = (input.prior_topology?.attachment_paths ?? []) as readonly unknown[];
  const folderChanged = watcherDigest(priorFolders) !== watcherDigest(input.scan.folders);
  const attachmentChanged = watcherDigest(priorAttachments) !== watcherDigest(input.scan.attachments);
  if (mutations.length === 0 && !folderChanged && !attachmentChanged &&
      input.prior_topology?.topology_snapshot_digest === topology.topology_snapshot_digest) return null;

  const observationBase: JsonRecord = {
    contract_version: "gkos-watcher-observation/1.0.0-draft.1",
    batch_id: input.batch_id,
    batch_kind: input.batch_kind,
    observed_paths: sortedStrings(input.observed_paths ?? []),
    unscoped: input.unscoped,
    overflow: input.overflow,
    started_at: input.recorded_at,
  };
  const observation = sealWithDigest(observationBase, "observation_digest");
  const preScan = sealWatcherRecoveryRecord({
    contract_version: "gkos-watcher-pre-scan-state/1.0.0-draft.1",
    vault_id: input.vault_id,
    active_pointer_digest: input.prior_pointer?.pointer_digest ?? null,
    active_coherent_manifest_digest: input.prior_manifest?.coherent_manifest_digest ?? null,
    topology_snapshot_digest: input.prior_topology?.topology_snapshot_digest ?? null,
    configuration_digest: input.configuration_digest,
    policy_digest: input.policy_digest,
    effective_profile_digest: input.effective_profile_digest,
  });
  const observationCoordinate = watcherArtifactCoordinate("observation", observation as JsonRecord);
  const observationAuthorityBase: JsonRecord = {
    contract_version: "gkos-watcher-observation-authority/1.0.0-draft.1",
    batch_id: input.batch_id,
    observation_digest: observation.observation_digest,
    observation_artifact_file: observationCoordinate.file,
    observation_raw_sha256: observationCoordinate.raw_sha256,
    observation_byte_size: observationCoordinate.byte_size,
    pre_scan_state_digest: watcherDigest(preScan),
    started_at: input.recorded_at,
  };
  const observationAuthority = sealWithDigest(observationAuthorityBase, "authority_digest");
  const batchBase: JsonRecord = {
    contract_version: "gkos-watcher-batch-record/1.0.0-draft.1",
    batch_id: input.batch_id,
    batch_kind: input.batch_kind,
    observation_authority_digest: observationAuthority.authority_digest,
    started_at: input.recorded_at,
    execution_kind: input.execution_kind,
    retry_of_batch_id: input.retry_of_batch_id ?? null,
  };
  const batch = sealWithDigest(batchBase, "batch_record_digest");
  const mutationSetDigest = watcherDigest({
    contract_version: "gkos-watcher-mutation-set/1.0.0-draft.1",
    pre_scan_state_digest: watcherDigest(preScan),
    topology_snapshot_digest: topology.topology_snapshot_digest,
    intended_source_mutations: mutations,
    folder_set_changed: folderChanged,
    attachment_set_changed: attachmentChanged,
  });
  const planBase: JsonRecord = {
    contract_version: "gkos-watcher-batch-plan/1.0.0-draft.1",
    batch_id: input.batch_id,
    observation_digest: observation.observation_digest,
    topology_snapshot_digest: topology.topology_snapshot_digest,
    effective_profile_digest: input.effective_profile_digest,
    validation_result_digest: validationResultDigest,
    rejection_journal_digest: rejectionJournalDigest,
    intended_source_mutations: mutations,
    folder_set_changed: folderChanged,
    attachment_set_changed: attachmentChanged,
    mutation_set_digest: mutationSetDigest,
  };
  const plan = sealWithDigest(planBase, "plan_digest");
  const removal = sourceRemovalBundle(input, mutations, String(topology.topology_snapshot_digest));
  const planCoordinate = watcherArtifactCoordinate("plan", plan as JsonRecord);
  const planAuthorityBase: JsonRecord = {
    contract_version: "gkos-watcher-plan-authority/1.0.0-draft.1",
    batch_id: input.batch_id,
    observation_digest: observation.observation_digest,
    plan_digest: plan.plan_digest,
    plan_artifact_file: planCoordinate.file,
    plan_raw_sha256: planCoordinate.raw_sha256,
    plan_byte_size: planCoordinate.byte_size,
    target_topology_snapshot_digest: topology.topology_snapshot_digest,
    source_removal_event_count: removal.event_count,
    source_removal_event_set_digest: removal.event_set_digest,
  };
  const planAuthority = sealWithDigest(planAuthorityBase, "authority_digest");

  const acceptedPathSet = new Set(accepted.map((row) => String(row.source_path)));
  const rawGkxGraph = acceptedGraph(input.validation_outcome.graph, acceptedPathSet, input.scan.attachments.length);
  const admittedNodeIds = new Set(rawGkxGraph.nodes.map((node) => node.id));
  const normalizedDelta = normalizeWatcherGraphDelta({
    ...input.validation_outcome.delta,
    addedNodes: input.validation_outcome.delta.addedNodes.filter((id) => admittedNodeIds.has(id)),
    changedNodes: input.validation_outcome.delta.changedNodes.filter((id) => admittedNodeIds.has(id)),
  });
  const serviceGenerationId = `watcher:${input.batch_id}`;
  const rawGraphBase: JsonRecord = {
    contract_version: "gkos-watcher-raw-graph-artifact/1.0.0-draft.1",
    service_generation_id: serviceGenerationId,
    topology_snapshot_digest: topology.topology_snapshot_digest,
    graph: rawGkxGraph,
  };
  const rawGraph = sealWithDigest(rawGraphBase, "graph_artifact_digest");
  const canonicalGraph = normalizeWatcherCanonicalGkxGraph(rawGkxGraph);
  const graphitiProjection = deriveWatcherGraphitiProjection(rawGkxGraph, input.vault_id);
  const canonicalGraphDigest = watcherDigest(canonicalGraph);
  const normalizedDeltaDigest = watcherDigest(normalizedDelta);
  const graphitiDigest = watcherDigest(graphitiProjection);
  const rawGraphCoordinate = watcherArtifactCoordinate("graph", rawGraph as JsonRecord);
  const graphReady: Readonly<JsonRecord> = Object.freeze({
    state: "ready",
    graph_contract_version: "gkos-watcher-canonical-gkx-graph/1.0.0-draft.1",
    graph_artifact_file: rawGraphCoordinate.file,
    graph_artifact_digest: rawGraph.graph_artifact_digest,
    canonical_graph_digest: canonicalGraphDigest,
    gkx_delta_digest: normalizedDeltaDigest,
    graphiti_projection_digest: graphitiDigest,
    sink_state: "not_applicable",
    sink_receipts: [],
    reason_codes: [],
  });
  const inner = input.staged_owner_manifest.inner;
  const vectorComplete = inner.manifest.embedding_provider_id !== null || inner.manifest.embedding_model_id !== null
    || inner.manifest.embedding_dimensions !== null;
  if (vectorComplete && (!(["openai_compatible", "local_onnx", "mcp"] as readonly unknown[]).includes(input.vector_provider_kind)
      || inner.manifest.embedding_provider_id === null || inner.manifest.embedding_model_id === null
      || inner.manifest.embedding_dimensions === null)) fail("GKX_WATCHER_VECTOR_PROVIDER_KIND_REQUIRED");
  if (!vectorComplete && input.vector_provider_kind != null) fail("GKX_WATCHER_VECTOR_PROVIDER_KIND_REQUIRED");
  const retrievalReady: Readonly<JsonRecord> = Object.freeze({
    state: "ready",
    owner_generation_id: input.staged_owner_manifest.owner_generation_id,
    owner_manifest_digest: input.staged_owner_manifest.owner_manifest_digest,
    database_file: inner.database_file,
    manifest_digest: inner.manifest_digest,
    projection_id: inner.manifest.projection_id,
    projection_digest: inner.manifest.projection_digest,
    lexical_backend: inner.manifest.lexical_backend,
    vector_stage_state: vectorComplete ? "complete" : "disabled",
    provider_kind: vectorComplete ? input.vector_provider_kind : null,
    provider_id: inner.manifest.embedding_provider_id,
    model_id: inner.manifest.embedding_model_id,
    dimensions: inner.manifest.embedding_dimensions,
    reason_codes: [],
  });
  const retrievalNone = notStartedRetrievalState();
  const graphNone = notStartedGraphState();
  const stateNames = ["observed", "normalized", "gkx_applied", "retrieval_applied", "graph_applied", "activation_prepared", "complete"] as const;
  const transitions: Readonly<JsonRecord>[] = [];
  for (let ordinal = 0; ordinal < stateNames.length; ordinal += 1) {
    const state = stateNames[ordinal];
    const transitionBase: JsonRecord = {
      contract_version: "gkos-watcher-transition/1.0.0-draft.1",
      batch_id: input.batch_id,
      transition_ordinal: ordinal,
      state,
      last_reached_state: state,
      terminal_state: state === "complete" ? "complete" : "open",
      observation_digest: observation.observation_digest,
      plan_digest: ordinal >= 1 ? plan.plan_digest : null,
      prior_transition_digest: transitions.at(-1)?.transition_digest ?? null,
      gkx_delta_digest: ordinal >= 2 ? normalizedDeltaDigest : null,
      gkx_snapshot_digest: ordinal >= 2 ? canonicalGraphDigest : null,
      retrieval_projection_state: ordinal >= 3 ? retrievalReady : retrievalNone,
      graph_projection_state: ordinal >= 4 ? graphReady : graphNone,
      reason_codes: [],
      recorded_at: input.recorded_at,
      completed_at: state === "complete" ? input.recorded_at : null,
    };
    transitions.push(sealWithDigest(transitionBase, "transition_digest"));
  }
  const topologyCoordinate = watcherArtifactCoordinate("topology", topology as JsonRecord);
  const complete = transitions[6];
  const manifestBase: JsonRecord = {
    contract_version: "gkos-watcher-coherent-manifest/1.0.0-draft.1",
    service_generation_id: serviceGenerationId,
    vault_id: input.vault_id,
    completed_batch_id: input.batch_id,
    completed_transition_digest: complete.transition_digest,
    topology_snapshot_digest: topology.topology_snapshot_digest,
    topology_artifact_file: topologyCoordinate.file,
    topology_artifact_raw_sha256: topologyCoordinate.raw_sha256,
    source_observation_snapshot_digest: input.validation_plan.observation_snapshot_digest,
    effective_profile_digest: input.effective_profile_digest,
    validation_result_digest: validationResultDigest,
    rejection_journal_digest: rejectionJournalDigest,
    configuration_digest: input.configuration_digest,
    policy_digest: input.policy_digest,
    gkx_snapshot_digest: canonicalGraphDigest,
    retrieval_projection_state: retrievalReady,
    graph_projection_state: graphReady,
    source_removal_event_count: removal.event_count,
    source_removal_event_set_digest: removal.event_set_digest,
    created_at: input.recorded_at,
  };
  const manifest = sealWithDigest(manifestBase, "coherent_manifest_digest");
  const removalActivation = removal.bundle === null ? null : sealWithDigest({
    contract_version: "gkos-watcher-source-removal-event-set-activation/1.0.0-draft.1",
    event_set_digest: removal.event_set_digest,
    coherent_manifest_digest: manifest.coherent_manifest_digest,
    activated_at: input.recorded_at,
  }, "activation_digest");
  const pointerBase: JsonRecord = {
    contract_version: "gkos-watcher-active-pointer/1.0.0-draft.1",
    kind: "watcher_coherent",
    service_generation_id: serviceGenerationId,
    coherent_manifest_file: `watcher-coherent-${String(manifest.coherent_manifest_digest).slice(7)}.json`,
    coherent_manifest_digest: manifest.coherent_manifest_digest,
    prior_pointer_digest: input.prior_pointer?.pointer_digest ?? null,
  };
  const pointer = sealWithDigest(pointerBase, "pointer_digest");
  const intentBase: JsonRecord = {
    contract_version: "gkos-watcher-activation-intent/1.0.0-draft.1",
    prepared_transition_digest: transitions[5].transition_digest,
    coherent_manifest_digest: manifest.coherent_manifest_digest,
    prior_pointer_digest: input.prior_pointer?.pointer_digest ?? null,
    target_pointer: pointer,
    target_complete_transition: complete,
    prepared_at: input.recorded_at,
  };
  const intent = sealWithDigest(intentBase, "intent_digest");
  const outcomeBase: JsonRecord = {
    contract_version: "gkos-watcher-activation-outcome/1.0.0-draft.1",
    intent_digest: intent.intent_digest,
    coherent_manifest_digest: manifest.coherent_manifest_digest,
    outcome: "published",
    pointer_digest: pointer.pointer_digest,
    reason_codes: [],
    recorded_at: input.recorded_at,
  };
  const outcomeRecord = sealWithDigest(outcomeBase, "outcome_digest");
  const activeBase: JsonRecord = {
    contract_version: "gkos-watcher-active-coherent/1.0.0-draft.1",
    service_generation_id: serviceGenerationId,
    coherent_manifest_digest: manifest.coherent_manifest_digest,
    pointer_digest: pointer.pointer_digest,
    intent_digest: intent.intent_digest,
    activated_at: input.recorded_at,
  };
  const active = sealWithDigest(activeBase, "active_digest");
  return Object.freeze({
    batch, observation, observation_authority: observationAuthority, pre_scan_state: preScan,
    plan, plan_authority: planAuthority, topology, transitions,
    normalized_graph_delta: normalizedDelta, canonical_graph: canonicalGraph, raw_graph: rawGraph,
    graphiti_projection: graphitiProjection, manifest, pointer, intent, outcome: outcomeRecord, active,
    source_removal_event_set_bundle: removal.bundle, source_removal_activation: removalActivation,
  });
}

/**
 * Derive the sole unchanged startup path admitted after journal reset. The
 * validation pass has already executed one production setFiles. This function
 * performs no I/O and creates no retrieval or outer generation.
 */
export function deriveWatcherResetReconciliationAdoption(
  input: WatcherResetReconciliationDerivationInput,
): Readonly<JsonRecord> {
  if (input.validation_outcome.plan !== input.validation_plan
      || input.current_owner_manifest.vault_id !== input.vault_id) {
    fail("GKX_WATCHER_DERIVATION_AUTHORITY_INVALID");
  }
  if (input.current_owner_manifest.configuration_digest !== input.configuration_digest
      || input.current_owner_manifest.policy_digest !== input.policy_digest
      || input.validation_plan.result.profile.effective_profile_digest !== input.effective_profile_digest
      || input.current_owner_manifest.observation_snapshot_digest !== input.validation_plan.observation_snapshot_digest) {
    fail("GKX_WATCHER_RESET_RECONCILIATION_NOT_UNCHANGED");
  }
  const currentPointer = sealWatcherRecoveryRecord(input.current_pointer);
  const manifest = sealWatcherRecoveryRecord(input.current_manifest);
  const currentTopology = sealWatcherRecoveryRecord(input.current_topology);
  const currentRawGraph = sealWatcherRecoveryRecord(input.current_raw_graph);
  const owner = sealIngestOwnerGenerationManifestEnvelope(input.current_owner_manifest);
  if (currentPointer.coherent_manifest_digest !== manifest.coherent_manifest_digest
      || currentTopology.topology_snapshot_digest !== manifest.topology_snapshot_digest
      || owner.owner_manifest_digest !== (manifest.retrieval_projection_state as JsonRecord).owner_manifest_digest) {
    fail("GKX_WATCHER_DERIVATION_AUTHORITY_INVALID");
  }

  const accepted = acceptedRows(input.validation_outcome);
  const rejected = rejectedRows(input.validation_outcome);
  const validationResultDigest = watcherDigest(input.validation_plan.result);
  const rejectionJournalDigest = owner.rejection_journal.rejection_journal_digest;
  const topology = sealWithDigest({
    contract_version: "gkos-watcher-topology-snapshot/1.0.0-draft.1",
    vault_id: input.vault_id,
    source_observation_snapshot_digest: input.validation_plan.observation_snapshot_digest,
    validation_result_digest: validationResultDigest,
    rejection_journal_digest: rejectionJournalDigest,
    accepted_sources: accepted,
    rejected_sources: rejected,
    folder_paths: [...input.scan.folders],
    attachment_paths: [...input.scan.attachments],
    accepted_source_set_digest: watcherDigest({ contract_version: "gkos-watcher-accepted-source-set/1.0.0-draft.1", sources: accepted }),
    rejected_source_set_digest: watcherDigest({ contract_version: "gkos-watcher-rejected-source-set/1.0.0-draft.1", sources: rejected }),
    folder_set_digest: watcherDigest({ contract_version: "gkos-watcher-folder-set/1.0.0-draft.1", folder_paths: input.scan.folders }),
    attachment_set_digest: watcherDigest({ contract_version: "gkos-watcher-attachment-set/1.0.0-draft.1", attachment_paths: input.scan.attachments }),
  }, "topology_snapshot_digest");
  const mutations = sourceMutations(currentTopology, accepted, rejected);
  const folderChanged = watcherDigest(currentTopology.folder_paths) !== watcherDigest(input.scan.folders);
  const attachmentChanged = watcherDigest(currentTopology.attachment_paths) !== watcherDigest(input.scan.attachments);
  if (mutations.length !== 0 || folderChanged || attachmentChanged || stableJson(topology) !== stableJson(currentTopology)
      || validationResultDigest !== manifest.validation_result_digest
      || rejectionJournalDigest !== manifest.rejection_journal_digest) {
    fail("GKX_WATCHER_RESET_RECONCILIATION_NOT_UNCHANGED");
  }

  const observation = sealWithDigest({
    contract_version: "gkos-watcher-observation/1.0.0-draft.1",
    batch_id: input.batch_id,
    batch_kind: "startup_reconciliation",
    observed_paths: [],
    unscoped: true,
    overflow: false,
    started_at: input.recorded_at,
  }, "observation_digest");
  const preScan = sealWatcherRecoveryRecord({
    contract_version: "gkos-watcher-pre-scan-state/1.0.0-draft.1",
    vault_id: input.vault_id,
    active_pointer_digest: currentPointer.pointer_digest,
    active_coherent_manifest_digest: manifest.coherent_manifest_digest,
    topology_snapshot_digest: currentTopology.topology_snapshot_digest,
    configuration_digest: input.configuration_digest,
    policy_digest: input.policy_digest,
    effective_profile_digest: input.effective_profile_digest,
  });
  const observationCoordinate = watcherArtifactCoordinate("observation", observation as JsonRecord);
  const observationAuthority = sealWithDigest({
    contract_version: "gkos-watcher-observation-authority/1.0.0-draft.1",
    batch_id: input.batch_id,
    observation_digest: observation.observation_digest,
    observation_artifact_file: observationCoordinate.file,
    observation_raw_sha256: observationCoordinate.raw_sha256,
    observation_byte_size: observationCoordinate.byte_size,
    pre_scan_state_digest: watcherDigest(preScan),
    started_at: input.recorded_at,
  }, "authority_digest");
  const mutationSetDigest = watcherDigest({
    contract_version: "gkos-watcher-mutation-set/1.0.0-draft.1",
    pre_scan_state_digest: watcherDigest(preScan),
    topology_snapshot_digest: topology.topology_snapshot_digest,
    intended_source_mutations: [],
    folder_set_changed: false,
    attachment_set_changed: false,
  });
  const plan = sealWithDigest({
    contract_version: "gkos-watcher-batch-plan/1.0.0-draft.1",
    batch_id: input.batch_id,
    observation_digest: observation.observation_digest,
    topology_snapshot_digest: topology.topology_snapshot_digest,
    effective_profile_digest: input.effective_profile_digest,
    validation_result_digest: validationResultDigest,
    rejection_journal_digest: rejectionJournalDigest,
    intended_source_mutations: [],
    folder_set_changed: false,
    attachment_set_changed: false,
    mutation_set_digest: mutationSetDigest,
  }, "plan_digest");
  const planCoordinate = watcherArtifactCoordinate("plan", plan as JsonRecord);
  const planAuthority = sealWithDigest({
    contract_version: "gkos-watcher-plan-authority/1.0.0-draft.1",
    batch_id: input.batch_id,
    observation_digest: observation.observation_digest,
    plan_digest: plan.plan_digest,
    plan_artifact_file: planCoordinate.file,
    plan_raw_sha256: planCoordinate.raw_sha256,
    plan_byte_size: planCoordinate.byte_size,
    target_topology_snapshot_digest: topology.topology_snapshot_digest,
    source_removal_event_count: 0,
    source_removal_event_set_digest: null,
  }, "authority_digest");

  const acceptedPathSet = new Set(accepted.map((row) => String(row.source_path)));
  const freshRawGraph = acceptedGraph(input.validation_outcome.graph, acceptedPathSet, input.scan.attachments.length);
  if (currentRawGraph.topology_snapshot_digest !== topology.topology_snapshot_digest) {
    fail("GKX_WATCHER_RESET_RECONCILIATION_NOT_UNCHANGED");
  }
  const canonicalGraph = normalizeWatcherCanonicalGkxGraph(freshRawGraph);
  const graphitiProjection = deriveWatcherGraphitiProjection(freshRawGraph, input.vault_id);
  const graphState = record(manifest.graph_projection_state, "GKX_WATCHER_GRAPH_INVALID");
  if (watcherDigest(canonicalGraph) !== manifest.gkx_snapshot_digest
      || watcherDigest(canonicalGraph) !== graphState.canonical_graph_digest
      || watcherDigest(graphitiProjection) !== graphState.graphiti_projection_digest
      || currentRawGraph.graph_artifact_digest !== graphState.graph_artifact_digest) {
    fail("GKX_WATCHER_RESET_RECONCILIATION_NOT_UNCHANGED");
  }

  const authority = record(input.journal_authority, "GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  const reset = record(authority.reset, "GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  const replacementGeneration = record(authority.replacement_generation, "GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  const sourceGeneration = record(authority.source_generation, "GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  const nativeGeneration = record(authority.native_generation, "GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  const nativeIntent = record(authority.native_activation_intent, "GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  const nativeOutcome = record(authority.native_activation_outcome, "GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  const nativeActive = record(authority.native_active, "GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
  const retrievalState = record(manifest.retrieval_projection_state, "GKX_WATCHER_RETRIEVAL_STATE_INVALID");
  const receipt = sealWithDigest({
    contract_version: "gkos-watcher-journal-reset-reconciliation-adoption/1.0.0-draft.1",
    batch_id: input.batch_id,
    batch_kind: "startup_reconciliation",
    execution_kind: "set_files",
    reset_digest: reset.reset_digest,
    replacement_journal_generation_digest: replacementGeneration.journal_generation_digest,
    source_journal_generation_digest: sourceGeneration.journal_generation_digest,
    native_activation_journal_generation_digest: nativeGeneration.journal_generation_digest,
    current_pointer_digest: currentPointer.pointer_digest,
    current_coherent_manifest_digest: manifest.coherent_manifest_digest,
    native_activation_intent_digest: nativeIntent.intent_digest,
    native_activation_outcome_digest: nativeOutcome.outcome_digest,
    prior_active_digest: nativeActive.active_digest,
    observation_digest: observation.observation_digest,
    observation_authority_digest: observationAuthority.authority_digest,
    plan_digest: plan.plan_digest,
    plan_authority_digest: planAuthority.authority_digest,
    topology_snapshot_digest: topology.topology_snapshot_digest,
    source_observation_snapshot_digest: topology.source_observation_snapshot_digest,
    gkx_snapshot_digest: manifest.gkx_snapshot_digest,
    retrieval_projection_digest: retrievalState.projection_digest,
    canonical_graph_digest: graphState.canonical_graph_digest,
    graphiti_projection_digest: graphState.graphiti_projection_digest,
    started_at: input.recorded_at,
  }, "receipt_digest");
  const transition = sealWithDigest({
    contract_version: "gkos-watcher-journal-reset-reconciliation-transition/1.0.0-draft.1",
    batch_id: input.batch_id,
    transition_ordinal: 0,
    state: "reset_reconciliation_adopted",
    terminal_state: "complete",
    receipt_digest: receipt.receipt_digest,
    reset_digest: reset.reset_digest,
    replacement_journal_generation_digest: replacementGeneration.journal_generation_digest,
    current_pointer_digest: currentPointer.pointer_digest,
    current_coherent_manifest_digest: manifest.coherent_manifest_digest,
    topology_snapshot_digest: topology.topology_snapshot_digest,
    prior_active_digest: nativeActive.active_digest,
    adopted_active_digest: nativeActive.active_digest,
    recorded_at: input.recorded_at,
    completed_at: input.recorded_at,
  }, "transition_digest");
  return sealWatcherJournalResetReconciliationAdoptionBundle({
    replacement_meta: authority.replacement_meta,
    replacement_generation: authority.replacement_generation,
    replacement_pointer: authority.replacement_pointer,
    reset: authority.reset,
    source_meta: authority.source_meta,
    source_generation: authority.source_generation,
    source_pointer: authority.source_pointer,
    native_meta: authority.native_meta,
    native_generation: authority.native_generation,
    native_pointer: authority.native_pointer,
    current_outer_pointer: currentPointer,
    current_coherent_manifest: manifest,
    native_transitions: authority.native_transitions,
    native_activation_intent: authority.native_activation_intent,
    native_activation_outcome: authority.native_activation_outcome,
    native_active: authority.native_active,
    source_adoption_receipt: authority.source_adoption_receipt,
    source_adoption_transition: authority.source_adoption_transition,
    source_active: authority.source_active,
    pre_scan_state: preScan,
    observation,
    observation_authority: observationAuthority,
    plan,
    plan_authority: planAuthority,
    topology,
    current_owner_manifest: owner,
    raw_graph: currentRawGraph,
    canonical_graph: canonicalGraph,
    graphiti_projection: graphitiProjection,
    adoption_receipt: receipt,
    adoption_transition: transition,
    adopted_active: nativeActive,
  });
}

/** Build the durable failed root before scheduling its first retry. */
export function deriveWatcherFailureAuthority(
  input: WatcherFailureAuthorityDerivationInput,
): Readonly<JsonRecord> {
  const preScan = sealWatcherRecoveryRecord({
    contract_version: "gkos-watcher-pre-scan-state/1.0.0-draft.1",
    vault_id: input.vault_id,
    active_pointer_digest: input.prior_pointer?.pointer_digest ?? null,
    active_coherent_manifest_digest: input.prior_manifest?.coherent_manifest_digest ?? null,
    topology_snapshot_digest: input.prior_topology?.topology_snapshot_digest ?? null,
    configuration_digest: input.configuration_digest,
    policy_digest: input.policy_digest,
    effective_profile_digest: input.effective_profile_digest,
  });
  const observation = sealWithDigest({
    contract_version: "gkos-watcher-observation/1.0.0-draft.1", batch_id: input.batch_id,
    batch_kind: input.batch_kind, observed_paths: sortedStrings(input.observed_paths ?? []),
    unscoped: input.unscoped, overflow: input.overflow, started_at: input.started_at,
  }, "observation_digest");
  const coordinate = watcherArtifactCoordinate("observation", observation as JsonRecord);
  const observationAuthority = sealWithDigest({
    contract_version: "gkos-watcher-observation-authority/1.0.0-draft.1", batch_id: input.batch_id,
    observation_digest: observation.observation_digest, observation_artifact_file: coordinate.file,
    observation_raw_sha256: coordinate.raw_sha256, observation_byte_size: coordinate.byte_size,
    pre_scan_state_digest: watcherDigest(preScan), started_at: input.started_at,
  }, "authority_digest");
  const batch = sealWithDigest({
    contract_version: "gkos-watcher-batch-record/1.0.0-draft.1", batch_id: input.batch_id,
    batch_kind: input.batch_kind, observation_authority_digest: observationAuthority.authority_digest,
    started_at: input.started_at, execution_kind: input.execution_kind,
    retry_of_batch_id: input.retry_of_batch_id ?? null,
  }, "batch_record_digest");
  const observed = sealWithDigest({
    contract_version: "gkos-watcher-transition/1.0.0-draft.1", batch_id: input.batch_id,
    transition_ordinal: 0, state: "observed", last_reached_state: "observed", terminal_state: "open",
    observation_digest: observation.observation_digest, plan_digest: null, prior_transition_digest: null,
    gkx_delta_digest: null, gkx_snapshot_digest: null, retrieval_projection_state: notStartedRetrievalState(),
    graph_projection_state: notStartedGraphState(), reason_codes: [], recorded_at: input.started_at, completed_at: null,
  }, "transition_digest");
  const failed = sealWithDigest({
    ...Object.fromEntries(Object.entries(observed).filter(([key]) => key !== "transition_digest")),
    transition_ordinal: 1, state: "failed", last_reached_state: "observed", terminal_state: "failed",
    prior_transition_digest: observed.transition_digest, reason_codes: ["WATCHER_SOURCE_UNSTABLE"],
    recorded_at: input.failed_at, completed_at: input.failed_at,
  }, "transition_digest");
  return Object.freeze({ batch, observation, observation_authority: observationAuthority,
    pre_scan_state: preScan, transitions: [observed, failed] });
}

/** Bind a fresh unscoped setFiles retry to the exact immediate failed tail. */
export function deriveWatcherFailureRetryBundle(input: {
  readonly failed_authority: Readonly<JsonRecord>;
  readonly retry_batch_id: string;
  readonly retry_started_at: string;
}): Readonly<JsonRecord> {
  const failed = input.failed_authority;
  const failedBatch = record(failed.batch, "GKX_WATCHER_FAILURE_AUTHORITY_INVALID");
  const preScan = sealWatcherRecoveryRecord(failed.pre_scan_state);
  const observation = sealWithDigest({
    contract_version: "gkos-watcher-observation/1.0.0-draft.1", batch_id: input.retry_batch_id,
    batch_kind: "failure_reconciliation", observed_paths: [], unscoped: true, overflow: false,
    started_at: input.retry_started_at,
  }, "observation_digest");
  const coordinate = watcherArtifactCoordinate("observation", observation as JsonRecord);
  const observationAuthority = sealWithDigest({
    contract_version: "gkos-watcher-observation-authority/1.0.0-draft.1", batch_id: input.retry_batch_id,
    observation_digest: observation.observation_digest, observation_artifact_file: coordinate.file,
    observation_raw_sha256: coordinate.raw_sha256, observation_byte_size: coordinate.byte_size,
    pre_scan_state_digest: watcherDigest(preScan), started_at: input.retry_started_at,
  }, "authority_digest");
  const batch = sealWithDigest({
    contract_version: "gkos-watcher-batch-record/1.0.0-draft.1", batch_id: input.retry_batch_id,
    batch_kind: "failure_reconciliation", observation_authority_digest: observationAuthority.authority_digest,
    started_at: input.retry_started_at, execution_kind: "set_files", retry_of_batch_id: failedBatch.batch_id,
  }, "batch_record_digest");
  return sealWatcherFailureRetryBundle({
    failed_batch: failed.batch, failed_observation: failed.observation,
    failed_observation_authority: failed.observation_authority, failed_pre_scan_state: preScan,
    failed_transitions: failed.transitions, retry_batch: batch, retry_observation: observation,
    retry_observation_authority: observationAuthority, retry_pre_scan_state: preScan,
  });
}

/**
 * Derive the sole no-op terminal authority after one fresh production
 * setFiles proves exact equality to the current coherent generation.
 */
export function deriveWatcherFailureRetryNoop(
  input: WatcherFailureRetryNoopDerivationInput,
): Readonly<JsonRecord> {
  const failureRetry = sealWatcherFailureRetryBundle(input.failure_retry_bundle);
  const retryBatch = record(failureRetry.retry_batch, "GKX_WATCHER_FAILURE_AUTHORITY_INVALID");
  const retryObservation = record(failureRetry.retry_observation, "GKX_WATCHER_FAILURE_AUTHORITY_INVALID");
  const retryPreScan = sealWatcherRecoveryRecord(failureRetry.retry_pre_scan_state);
  const currentPointer = sealWatcherRecoveryRecord(input.current_pointer);
  const manifest = sealWatcherRecoveryRecord(input.current_manifest);
  const currentTopology = sealWatcherRecoveryRecord(input.current_topology);
  const currentRawGraph = sealWatcherRecoveryRecord(input.current_raw_graph);
  const intent = sealWatcherRecoveryRecord(input.current_activation_intent);
  const outcome = sealWatcherRecoveryRecord(input.current_activation_outcome);
  const active = sealWatcherRecoveryRecord(input.current_active);
  const owner = sealIngestOwnerGenerationManifestEnvelope(input.current_owner_manifest);
  if (input.validation_outcome.plan !== input.validation_plan || owner.vault_id !== input.vault_id
      || owner.configuration_digest !== input.configuration_digest || owner.policy_digest !== input.policy_digest
      || input.validation_plan.result.profile.effective_profile_digest !== input.effective_profile_digest
      || currentPointer.coherent_manifest_digest !== manifest.coherent_manifest_digest
      || currentTopology.topology_snapshot_digest !== manifest.topology_snapshot_digest
      || owner.owner_manifest_digest !== (manifest.retrieval_projection_state as JsonRecord).owner_manifest_digest
      || retryPreScan.active_pointer_digest !== currentPointer.pointer_digest
      || retryPreScan.active_coherent_manifest_digest !== manifest.coherent_manifest_digest
      || retryPreScan.topology_snapshot_digest !== currentTopology.topology_snapshot_digest) {
    fail("GKX_WATCHER_FAILURE_RETRY_NOT_UNCHANGED");
  }
  const accepted = acceptedRows(input.validation_outcome);
  const rejected = rejectedRows(input.validation_outcome);
  const validationResultDigest = watcherDigest(input.validation_plan.result);
  const rejectionJournalDigest = owner.rejection_journal.rejection_journal_digest;
  const topology = sealWithDigest({
    contract_version: "gkos-watcher-topology-snapshot/1.0.0-draft.1", vault_id: input.vault_id,
    source_observation_snapshot_digest: input.validation_plan.observation_snapshot_digest,
    validation_result_digest: validationResultDigest, rejection_journal_digest: rejectionJournalDigest,
    accepted_sources: accepted, rejected_sources: rejected, folder_paths: [...input.scan.folders],
    attachment_paths: [...input.scan.attachments],
    accepted_source_set_digest: watcherDigest({ contract_version: "gkos-watcher-accepted-source-set/1.0.0-draft.1", sources: accepted }),
    rejected_source_set_digest: watcherDigest({ contract_version: "gkos-watcher-rejected-source-set/1.0.0-draft.1", sources: rejected }),
    folder_set_digest: watcherDigest({ contract_version: "gkos-watcher-folder-set/1.0.0-draft.1", folder_paths: input.scan.folders }),
    attachment_set_digest: watcherDigest({ contract_version: "gkos-watcher-attachment-set/1.0.0-draft.1", attachment_paths: input.scan.attachments }),
  }, "topology_snapshot_digest");
  if (sourceMutations(currentTopology, accepted, rejected).length !== 0
      || watcherDigest(currentTopology.folder_paths) !== watcherDigest(input.scan.folders)
      || watcherDigest(currentTopology.attachment_paths) !== watcherDigest(input.scan.attachments)
      || stableJson(topology) !== stableJson(currentTopology)
      || validationResultDigest !== manifest.validation_result_digest
      || rejectionJournalDigest !== manifest.rejection_journal_digest) {
    fail("GKX_WATCHER_FAILURE_RETRY_NOT_UNCHANGED");
  }
  const plan = sealWithDigest({
    contract_version: "gkos-watcher-batch-plan/1.0.0-draft.1", batch_id: retryBatch.batch_id,
    observation_digest: retryObservation.observation_digest, topology_snapshot_digest: topology.topology_snapshot_digest,
    effective_profile_digest: input.effective_profile_digest, validation_result_digest: validationResultDigest,
    rejection_journal_digest: rejectionJournalDigest, intended_source_mutations: [], folder_set_changed: false,
    attachment_set_changed: false, mutation_set_digest: watcherDigest({
      contract_version: "gkos-watcher-mutation-set/1.0.0-draft.1", pre_scan_state_digest: watcherDigest(retryPreScan),
      topology_snapshot_digest: topology.topology_snapshot_digest, intended_source_mutations: [],
      folder_set_changed: false, attachment_set_changed: false,
    }),
  }, "plan_digest");
  const planCoordinate = watcherArtifactCoordinate("plan", plan as JsonRecord);
  const planAuthority = sealWithDigest({
    contract_version: "gkos-watcher-plan-authority/1.0.0-draft.1", batch_id: retryBatch.batch_id,
    observation_digest: retryObservation.observation_digest, plan_digest: plan.plan_digest,
    plan_artifact_file: planCoordinate.file, plan_raw_sha256: planCoordinate.raw_sha256,
    plan_byte_size: planCoordinate.byte_size, target_topology_snapshot_digest: topology.topology_snapshot_digest,
    source_removal_event_count: 0, source_removal_event_set_digest: null,
  }, "authority_digest");
  const admittedPaths = new Set(accepted.map((row) => String(row.source_path)));
  const freshRaw = acceptedGraph(input.validation_outcome.graph, admittedPaths, input.scan.attachments.length);
  const canonicalGraph = normalizeWatcherCanonicalGkxGraph(freshRaw);
  const currentCanonicalGraph = normalizeWatcherCanonicalGkxGraph(currentRawGraph.graph as GkxGraph);
  const graphitiProjection = deriveWatcherGraphitiProjection(freshRaw, input.vault_id);
  const currentGraphitiProjection = deriveWatcherGraphitiProjection(currentRawGraph.graph as GkxGraph, input.vault_id);
  const graphState = record(manifest.graph_projection_state, "GKX_WATCHER_GRAPH_INVALID");
  const retrievalState = record(manifest.retrieval_projection_state, "GKX_WATCHER_RETRIEVAL_STATE_INVALID");
  if (stableJson(canonicalGraph) !== stableJson(currentCanonicalGraph)
      || stableJson(graphitiProjection) !== stableJson(currentGraphitiProjection)
      || watcherDigest(canonicalGraph) !== manifest.gkx_snapshot_digest
      || watcherDigest(canonicalGraph) !== graphState.canonical_graph_digest
      || watcherDigest(graphitiProjection) !== graphState.graphiti_projection_digest
      || currentRawGraph.graph_artifact_digest !== graphState.graph_artifact_digest
      || currentRawGraph.topology_snapshot_digest !== topology.topology_snapshot_digest) {
    fail("GKX_WATCHER_FAILURE_RETRY_NOT_UNCHANGED");
  }
  const failedBatch = record(failureRetry.failed_batch, "GKX_WATCHER_FAILURE_AUTHORITY_INVALID");
  const failedTransitions = failureRetry.failed_transitions as readonly Readonly<JsonRecord>[];
  const receipt = sealWithDigest({
    contract_version: "gkos-watcher-failure-retry-noop-receipt/1.0.0-draft.1",
    failed_batch_id: failedBatch.batch_id, failed_terminal_transition_digest: failedTransitions.at(-1)?.transition_digest,
    retry_batch_id: retryBatch.batch_id, retry_observation_digest: retryObservation.observation_digest,
    retry_observation_authority_digest: (failureRetry.retry_observation_authority as JsonRecord).authority_digest,
    retry_pre_scan_state_digest: watcherDigest(retryPreScan), failure_retry_bundle_digest: watcherDigest(failureRetry),
    retry_plan_digest: plan.plan_digest, retry_plan_authority_digest: planAuthority.authority_digest,
    current_active_digest: active.active_digest, current_pointer_digest: currentPointer.pointer_digest,
    current_coherent_manifest_digest: manifest.coherent_manifest_digest, current_intent_digest: intent.intent_digest,
    current_outcome_digest: outcome.outcome_digest, topology_snapshot_digest: currentTopology.topology_snapshot_digest,
    source_observation_snapshot_digest: currentTopology.source_observation_snapshot_digest,
    configuration_digest: manifest.configuration_digest, policy_digest: manifest.policy_digest,
    effective_profile_digest: manifest.effective_profile_digest, gkx_snapshot_digest: manifest.gkx_snapshot_digest,
    retrieval_projection_digest: retrievalState.projection_digest, canonical_graph_digest: graphState.canonical_graph_digest,
    graph_artifact_digest: currentRawGraph.graph_artifact_digest,
    graphiti_projection_digest: graphState.graphiti_projection_digest,
    set_files_call_count: 1, apply_changes_call_count: 0, provider_call_count: 0,
    retrieval_write_count: 0, outer_write_count: 0, completed_at: input.completed_at,
  }, "receipt_digest");
  const transition = sealWithDigest({
    contract_version: "gkos-watcher-failure-retry-noop-transition/1.0.0-draft.1", batch_id: retryBatch.batch_id,
    transition_ordinal: 0, state: "failure_reconciliation_noop_complete", terminal_state: "complete",
    prior_transition_digest: null, receipt, receipt_digest: receipt.receipt_digest,
    recorded_at: input.completed_at, completed_at: input.completed_at,
  }, "transition_digest");
  return sealWatcherFailureRetryNoopBundle({
    failure_retry_bundle: failureRetry, retry_plan: plan, retry_plan_authority: planAuthority,
    retry_topology: topology, retry_canonical_graph: canonicalGraph, current_topology: currentTopology,
    current_outer_pointer: currentPointer, current_coherent_manifest: manifest,
    current_activation_intent: intent, current_activation_outcome: outcome, current_active: active,
    current_owner_manifest: owner, current_canonical_graph: currentCanonicalGraph,
    current_raw_graph: currentRawGraph, current_graphiti_projection: currentGraphitiProjection,
    receipt, transition,
  });
}

export function persistWatcherFailureAuthorityArtifacts(
  directory: WatcherDirectoryCapability,
  authority: Readonly<JsonRecord>,
): void {
  persistCoordinateArtifact(directory, "observation", record(authority.observation, "GKX_WATCHER_OBSERVATION_INVALID"));
}

export function persistWatcherFailureRetryNoopArtifacts(
  directory: WatcherDirectoryCapability,
  bundle: Readonly<JsonRecord>,
): void {
  const retry = record(bundle.failure_retry_bundle, "GKX_WATCHER_FAILURE_AUTHORITY_INVALID");
  persistCoordinateArtifact(directory, "observation", record(retry.retry_observation, "GKX_WATCHER_OBSERVATION_INVALID"));
  persistCoordinateArtifact(directory, "plan", record(bundle.retry_plan, "GKX_WATCHER_PLAN_INVALID"));
}

export function persistWatcherResetReconciliationArtifacts(
  directory: WatcherDirectoryCapability,
  bundle: Readonly<JsonRecord>,
): void {
  persistCoordinateArtifact(directory, "observation", record(bundle.observation, "GKX_WATCHER_OBSERVATION_INVALID"));
  persistCoordinateArtifact(directory, "plan", record(bundle.plan, "GKX_WATCHER_PLAN_INVALID"));
}

function persistExact(
  directory: WatcherDirectoryCapability,
  leaf: string,
  value: unknown,
  maximumBytes = 536_870_912,
): void {
  const bytes = watcherCanonicalBytes(value);
  if (bytes.byteLength < 1 || bytes.byteLength > maximumBytes) fail("GKX_WATCHER_ARTIFACT_LIMIT_EXCEEDED");
  if (!watcherLeafExists(directory, leaf)) writeNewWatcherFile(directory, leaf, bytes, maximumBytes);
  const reopened = readWatcherFile(directory, leaf, { maximum_bytes: maximumBytes });
  if (!reopened.bytes.equals(bytes) || reopened.raw_sha256 !== watcherRawDigest(bytes)) {
    fail("GKX_WATCHER_ARTIFACT_MISMATCH");
  }
}

function persistCoordinateArtifact(
  directory: WatcherDirectoryCapability,
  kind: "observation" | "plan" | "topology" | "graph",
  value: Readonly<JsonRecord>,
): void {
  const coordinate = watcherArtifactCoordinate(kind, value as JsonRecord);
  const maximum = kind === "observation" ? 4_194_304 : 536_870_912;
  const bytes = watcherCanonicalBytes(value);
  if (coordinate.byte_size !== bytes.byteLength || coordinate.raw_sha256 !== watcherRawDigest(bytes)) {
    fail("GKX_WATCHER_ARTIFACT_COORDINATE_INVALID");
  }
  persistExact(directory, String(coordinate.file), value, maximum);
}

function watcherAuthorityFor(bundle: Readonly<JsonRecord>): Readonly<JsonRecord> {
  const manifest = record(bundle.manifest, "GKX_WATCHER_MANIFEST_INVALID");
  const pointer = record(bundle.pointer, "GKX_WATCHER_POINTER_INVALID");
  const base = {
    contract_version: "gkos-watcher-authority/1.0.0-draft.1",
    kind: "watcher_coherent_authority",
    vault_id: manifest.vault_id,
    configuration_digest: manifest.configuration_digest,
    policy_digest: manifest.policy_digest,
    effective_profile_digest: manifest.effective_profile_digest,
    first_service_generation_id: manifest.service_generation_id,
    first_coherent_manifest_digest: manifest.coherent_manifest_digest,
    first_pointer_digest: pointer.pointer_digest,
  };
  return sealWatcherRecoveryRecord({ ...base, authority_digest: watcherDigest(base) });
}

function watcherAuthorityFromManifest(
  manifest: Readonly<JsonRecord>,
  pointer: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  return watcherAuthorityFor({ manifest, pointer });
}

export function readWatcherAuthority(directory: WatcherDirectoryCapability): Readonly<JsonRecord> | null {
  if (!watcherLeafExists(directory, WATCHER_AUTHORITY_FILE)) return null;
  if (watcherLeafExists(directory, WATCHER_AUTHORITY_TEMP_FILE)) fail("GKX_WATCHER_AUTHORITY_RECOVERY_REQUIRED");
  const file = readWatcherFile(directory, WATCHER_AUTHORITY_FILE, { maximum_bytes: 1_048_576 });
  const authority = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(file));
  if (!file.bytes.equals(watcherCanonicalBytes(authority))) fail("GKX_WATCHER_AUTHORITY_MISMATCH");
  return authority;
}

interface WatcherPublicationFileSpec {
  readonly step_id: string;
  readonly leaf: string;
  readonly bytes: Buffer;
  readonly maximum_bytes: number;
}

function watcherCoherentPublicationFiles(bundle: Readonly<JsonRecord>): readonly WatcherPublicationFileSpec[] {
  const coordinate = (
    stepId: string,
    kind: "observation" | "plan" | "topology" | "graph",
    value: Readonly<JsonRecord>,
  ): WatcherPublicationFileSpec => {
    const artifact = watcherArtifactCoordinate(kind, value as JsonRecord);
    const bytes = watcherCanonicalBytes(value);
    if (artifact.byte_size !== bytes.byteLength || artifact.raw_sha256 !== watcherRawDigest(bytes)) {
      fail("GKX_WATCHER_ARTIFACT_COORDINATE_INVALID");
    }
    return Object.freeze({
      step_id: stepId,
      leaf: String(artifact.file),
      bytes,
      maximum_bytes: kind === "observation" ? 4_194_304 : 536_870_912,
    });
  };
  const manifest = sealWatcherRecoveryRecord(bundle.manifest);
  return Object.freeze([
    coordinate("artifact:observation", "observation", record(bundle.observation, "GKX_WATCHER_OBSERVATION_INVALID")),
    coordinate("artifact:plan", "plan", record(bundle.plan, "GKX_WATCHER_PLAN_INVALID")),
    coordinate("artifact:topology", "topology", record(bundle.topology, "GKX_WATCHER_TOPOLOGY_INVALID")),
    coordinate("artifact:graph", "graph", record(bundle.raw_graph, "GKX_WATCHER_GRAPH_INVALID")),
    Object.freeze({
      step_id: "artifact:manifest",
      leaf: `watcher-coherent-${String(manifest.coherent_manifest_digest).slice("sha256:".length)}.json`,
      bytes: watcherCanonicalBytes(manifest),
      maximum_bytes: 536_870_912,
    }),
  ]);
}

function sameWatcherPublicationDevice(left: string, right: string): boolean {
  return left === right || (process.platform === "win32" && (left === "0" || right === "0"));
}

function assertWatcherPublicationEntryNamespace(
  leaves: readonly string[],
  oldPointer: Readonly<JsonRecord> | null,
): void {
  const names = WATCHER_OUTER_POINTER_NAMES;
  const allowedOuter = new Set([names.final, names.guard, names.guard_stage, names.temporary]);
  const controlled = new Set([
    ...allowedOuter,
    WATCHER_JOURNAL_POINTER_NAMES.final,
    WATCHER_JOURNAL_POINTER_NAMES.guard,
    WATCHER_JOURNAL_POINTER_NAMES.guard_stage,
    WATCHER_JOURNAL_POINTER_NAMES.temporary,
  ]);
  for (const leaf of leaves) {
    if ((leaf.startsWith(`.${names.final}.gkos-watcher.`) || controlled.has(leaf)) && !allowedOuter.has(leaf)) {
      fail("GKX_WATCHER_POINTER_RESERVED_LEAF_INVALID");
    }
  }
  if (leaves.includes(names.guard) || leaves.includes(names.guard_stage) || leaves.includes(names.temporary) ||
      leaves.includes(names.final) !== (oldPointer !== null)) fail("GKX_WATCHER_POINTER_RECOVERY_REQUIRED");
}

/**
 * Publishes one already-derived coherent activation. The immutable Slice-A
 * sealer remains the governing DAG authority. In particular, the exact outer
 * pointer guard is computed and cross-sealed before the first journal row or
 * artifact is written.
 */
export function publishWatcherCoherentActivation(options: {
  readonly directory: WatcherDirectoryCapability;
  readonly journal: WatcherJournalHandle;
  readonly bundle: unknown;
  readonly on_boundary?: (boundary: string) => void;
  readonly on_before_seal_refresh?: () => void;
}): WatcherCoherentActivationResult {
  const input = record(options.bundle, "GKX_WATCHER_COHERENT_BUNDLE_INVALID");
  const pointer = sealWatcherRecoveryRecord(input.pointer);
  const intent = sealWatcherRecoveryRecord(input.intent);
  const transitions = input.transitions;
  if (!Array.isArray(transitions) || transitions.length !== 7) fail("GKX_WATCHER_TRANSITION_INVALID");
  const complete = sealWatcherRecoveryRecord(transitions[6]);
  const outcome = sealWatcherRecoveryRecord(input.outcome);
  const active = sealWatcherRecoveryRecord(input.active);
  if (outcome.recorded_at !== intent.prepared_at || active.activated_at !== intent.prepared_at) {
    fail("GKX_WATCHER_RECOVERY_TIME_INVALID");
  }
  const oldPointer = readWatcherPointer(options.directory, "outer");
  const preparedGuard = prepareWatcherPointerGuard({
    namespace: "outer",
    directory: options.directory,
    new_pointer: pointer,
    old_pointer: oldPointer,
    operation_intent_digest: String(intent.intent_digest),
    target_commit_digest: String(complete.transition_digest),
  });
  const bundle = sealWatcherCoherentActivationBundle(input, preparedGuard);
  const preScan = record(bundle.pre_scan_state, "GKX_WATCHER_PRE_SCAN_STATE_INVALID");
  if ((oldPointer === null ? null : oldPointer.pointer_digest) !== preScan.active_pointer_digest) {
    fail("GKX_WATCHER_PRIOR_POINTER_CHANGED");
  }
  const files = watcherCoherentPublicationFiles(bundle);
  const pointerArtifact = watcherPointerArtifact("outer", bundle.pointer);
  const pointerBytes = pointerArtifact.bytes;
  const guardBytes = watcherCanonicalBytes(preparedGuard);
  const guardRawSha256 = watcherRawDigest(guardBytes);
  const authority = watcherAuthorityFor(bundle);
  const authorityBytes = watcherCanonicalBytes(authority);
  const existingAuthority = readWatcherAuthority(options.directory);
  if (watcherLeafExists(options.directory, WATCHER_AUTHORITY_TEMP_FILE)) {
    fail("GKX_WATCHER_AUTHORITY_RECOVERY_REQUIRED");
  }
  if (existingAuthority === null) {
    if (oldPointer !== null) fail("GKX_WATCHER_AUTHORITY_RECOVERY_REQUIRED");
  } else if (oldPointer === null) {
    if (!watcherCanonicalBytes(existingAuthority).equals(authorityBytes)) fail("GKX_WATCHER_AUTHORITY_MISMATCH");
  } else if (existingAuthority.vault_id !== preScan.vault_id ||
      existingAuthority.configuration_digest !== record(bundle.manifest, "GKX_WATCHER_MANIFEST_INVALID").configuration_digest ||
      existingAuthority.policy_digest !== record(bundle.manifest, "GKX_WATCHER_MANIFEST_INVALID").policy_digest ||
      existingAuthority.effective_profile_digest !== record(bundle.manifest, "GKX_WATCHER_MANIFEST_INVALID").effective_profile_digest) {
    fail("GKX_WATCHER_AUTHORITY_MISMATCH");
  }
  const authorityNeedsCreation = existingAuthority === null;
  const operations: WatcherPublicationOperation[] = files.map((file) => Object.freeze({
    step_id: file.step_id,
    operation: "ensure_file" as const,
    leaf: file.leaf,
    raw_sha256: watcherRawDigest(file.bytes),
    byte_size: file.bytes.byteLength,
    maximum_bytes: file.maximum_bytes,
  }));
  operations.push(
    Object.freeze({
      step_id: "pointer:immutable", operation: "ensure_file", leaf: pointerArtifact.file,
      raw_sha256: pointerArtifact.raw_sha256, byte_size: pointerArtifact.byte_size, maximum_bytes: 1_048_576,
    }),
    Object.freeze({
      step_id: "pointer:guard_stage:create", operation: "create_file", leaf: WATCHER_OUTER_POINTER_NAMES.guard_stage,
      raw_sha256: guardRawSha256, byte_size: guardBytes.byteLength, maximum_bytes: 1_048_576,
    }),
    Object.freeze({
      step_id: "pointer:guard:link", operation: "hardlink", source_leaf: WATCHER_OUTER_POINTER_NAMES.guard_stage,
      target_leaf: WATCHER_OUTER_POINTER_NAMES.guard, resulting_links: 2,
    }),
    Object.freeze({
      step_id: "pointer:guard_stage:unlink", operation: "unlink", leaf: WATCHER_OUTER_POINTER_NAMES.guard_stage,
      expected_raw_sha256: guardRawSha256, allowed_links: 2,
      survivor_leaves: Object.freeze([WATCHER_OUTER_POINTER_NAMES.guard]),
    }),
    Object.freeze({
      step_id: "pointer:temporary", operation: "create_file", leaf: WATCHER_OUTER_POINTER_NAMES.temporary,
      raw_sha256: pointerArtifact.raw_sha256, byte_size: pointerArtifact.byte_size, maximum_bytes: 1_048_576,
    }),
  );
  if (authorityNeedsCreation) {
    operations.push(
      Object.freeze({
        step_id: "authority:temporary", operation: "create_file", leaf: WATCHER_AUTHORITY_TEMP_FILE,
        raw_sha256: watcherRawDigest(authorityBytes), byte_size: authorityBytes.byteLength, maximum_bytes: 1_048_576,
      }),
      Object.freeze({
        step_id: "authority:link", operation: "hardlink", source_leaf: WATCHER_AUTHORITY_TEMP_FILE,
        target_leaf: WATCHER_AUTHORITY_FILE, resulting_links: 2,
      }),
      Object.freeze({
        step_id: "authority:temporary:unlink", operation: "unlink", leaf: WATCHER_AUTHORITY_TEMP_FILE,
        expected_raw_sha256: watcherRawDigest(authorityBytes), allowed_links: 2,
        survivor_leaves: Object.freeze([WATCHER_AUTHORITY_FILE]),
      }),
    );
  }
  operations.push(
    Object.freeze({
      step_id: "pointer:fixed", operation: "replace", source_leaf: WATCHER_OUTER_POINTER_NAMES.temporary,
      target_leaf: WATCHER_OUTER_POINTER_NAMES.final, expected_raw_sha256: pointerArtifact.raw_sha256,
    }),
    Object.freeze({
      step_id: "pointer:guard:unlink", operation: "unlink", leaf: WATCHER_OUTER_POINTER_NAMES.guard,
      expected_raw_sha256: guardRawSha256, allowed_links: 1, survivor_leaves: Object.freeze([]),
    }),
  );
  const sealedInputLeaves = [
    ...(existingAuthority === null ? [] : [{ leaf: WATCHER_AUTHORITY_FILE, maximum_bytes: 1_048_576 }]),
    ...(oldPointer === null ? [] : [
      { leaf: watcherPointerArtifact("outer", oldPointer).file, maximum_bytes: 1_048_576 },
      { leaf: WATCHER_OUTER_POINTER_NAMES.final, maximum_bytes: 1_048_576 },
    ]),
  ];
  return withAuthorizedWatcherPublication(options.directory, {
    operations: Object.freeze(operations),
    sealed_input_leaves: Object.freeze(sealedInputLeaves),
  }, (publication) => {
    const entryLeaves = watcherPublicationEntryLeaves(publication);
    assertWatcherPublicationEntryNamespace(entryLeaves, oldPointer);
    if (existingAuthority !== null) {
      const sealedAuthority = readWatcherPublicationEntryFile(publication, WATCHER_AUTHORITY_FILE);
      if (!sealedAuthority.bytes.equals(watcherCanonicalBytes(existingAuthority))) fail("GKX_WATCHER_AUTHORITY_MISMATCH");
    }
    if (oldPointer !== null) {
      const oldArtifact = watcherPointerArtifact("outer", oldPointer);
      const immutableOld = readWatcherPublicationEntryFile(publication, oldArtifact.file);
      const fixedOld = readWatcherPublicationEntryFile(publication, WATCHER_OUTER_POINTER_NAMES.final);
      if (!immutableOld.bytes.equals(oldArtifact.bytes) || !fixedOld.bytes.equals(oldArtifact.bytes) ||
          !sameWatcherPublicationDevice(fixedOld.identity.device, String(preparedGuard.old_final_device)) ||
          fixedOld.identity.inode !== preparedGuard.old_final_inode) fail("GKX_WATCHER_POINTER_GUARD_MISMATCH");
    }
    for (const file of files) ensureWatcherPublicationFile(publication, file.step_id, file.leaf, file.bytes);
    options.on_boundary?.("artifacts");
    prepareWatcherJournalActivation(options.journal, {
      batch: bundle.batch,
      observation_authority: bundle.observation_authority,
      plan_authority: bundle.plan_authority,
      transitions: (bundle.transitions as readonly unknown[]).slice(0, 6),
      intent: bundle.intent,
      source_removal_event_set_bundle: bundle.source_removal_event_set_bundle,
    });
    options.on_boundary?.("prepared_journal");
    ensureWatcherPublicationFile(publication, "pointer:immutable", pointerArtifact.file, pointerBytes);
    options.on_boundary?.("pointer:immutable_pointer");
    createWatcherPublicationFile(publication, "pointer:guard_stage:create", WATCHER_OUTER_POINTER_NAMES.guard_stage, guardBytes);
    options.on_boundary?.("pointer:guard_stage");
    hardlinkWatcherPublicationFile(
      publication, "pointer:guard:link", WATCHER_OUTER_POINTER_NAMES.guard_stage, WATCHER_OUTER_POINTER_NAMES.guard,
    );
    options.on_boundary?.("pointer:guard_linked");
    unlinkWatcherPublicationFile(publication, "pointer:guard_stage:unlink", WATCHER_OUTER_POINTER_NAMES.guard_stage);
    options.on_boundary?.("pointer:guard_stage_removed");
    createWatcherPublicationFile(publication, "pointer:temporary", WATCHER_OUTER_POINTER_NAMES.temporary, pointerBytes);
    options.on_boundary?.("pointer:temporary_pointer");
    if (authorityNeedsCreation) {
      createWatcherPublicationFile(publication, "authority:temporary", WATCHER_AUTHORITY_TEMP_FILE, authorityBytes);
      hardlinkWatcherPublicationFile(publication, "authority:link", WATCHER_AUTHORITY_TEMP_FILE, WATCHER_AUTHORITY_FILE);
      unlinkWatcherPublicationFile(publication, "authority:temporary:unlink", WATCHER_AUTHORITY_TEMP_FILE);
    }
    options.on_boundary?.("authority");
    options.on_boundary?.("pointer:target_prepared");
    replaceWatcherPublicationFile(
      publication, "pointer:fixed", WATCHER_OUTER_POINTER_NAMES.temporary, WATCHER_OUTER_POINTER_NAMES.final,
    );
    options.on_boundary?.("pointer:fixed_pointer");
    finalizeWatcherJournalActivation(options.journal, {
      complete_transition: complete,
      outcome: bundle.outcome,
      active: bundle.active,
      source_removal_activation: bundle.source_removal_activation,
    });
    options.on_boundary?.("complete_journal");
    options.on_boundary?.("pointer:target_finalized");
    unlinkWatcherPublicationFile(publication, "pointer:guard:unlink", WATCHER_OUTER_POINTER_NAMES.guard);
    options.on_boundary?.("pointer:guard_removed");
    return Object.freeze({
      active: sealWatcherRecoveryRecord(bundle.active),
      manifest: sealWatcherRecoveryRecord(bundle.manifest),
      pointer,
      pointer_artifact: pointerArtifact,
    });
  }, { on_before_seal_refresh: options.on_before_seal_refresh });
}


export function readWatcherCoherentManifest(
  directory: WatcherDirectoryCapability,
  pointer: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const expected = `watcher-coherent-${String(pointer.coherent_manifest_digest).slice("sha256:".length)}.json`;
  if (pointer.coherent_manifest_file !== expected) fail("GKX_WATCHER_MANIFEST_INVALID");
  const file = readWatcherFile(directory, expected, { maximum_bytes: 536_870_912 });
  const manifest = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(file));
  if (!file.bytes.equals(watcherCanonicalBytes(manifest)) || manifest.coherent_manifest_digest !== pointer.coherent_manifest_digest ||
      manifest.service_generation_id !== pointer.service_generation_id) fail("GKX_WATCHER_MANIFEST_INVALID");
  return manifest;
}

export function readWatcherTopology(
  directory: WatcherDirectoryCapability,
  manifest: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const file = readWatcherFile(directory, String(manifest.topology_artifact_file), { maximum_bytes: 536_870_912 });
  const topology = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(file));
  const expected = watcherArtifactCoordinate("topology", topology as JsonRecord);
  if (expected.file !== manifest.topology_artifact_file || expected.raw_sha256 !== manifest.topology_artifact_raw_sha256 ||
      topology.topology_snapshot_digest !== manifest.topology_snapshot_digest || !file.bytes.equals(watcherCanonicalBytes(topology))) {
    fail("GKX_WATCHER_TOPOLOGY_INVALID");
  }
  return topology;
}

export function readWatcherRawGraph(
  directory: WatcherDirectoryCapability,
  manifest: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const state = record(manifest.graph_projection_state, "GKX_WATCHER_GRAPH_INVALID");
  const leaf = String(state.graph_artifact_file);
  const file = readWatcherFile(directory, leaf, { maximum_bytes: 536_870_912 });
  const rawGraph = sealWatcherRecoveryRecord(parseCanonicalWatcherJson(file));
  const coordinate = watcherArtifactCoordinate("graph", rawGraph as JsonRecord);
  if (coordinate.file !== leaf || coordinate.raw_sha256 !== file.raw_sha256 || coordinate.byte_size !== file.bytes.byteLength
      || rawGraph.graph_artifact_digest !== state.graph_artifact_digest
      || rawGraph.topology_snapshot_digest !== manifest.topology_snapshot_digest
      || !file.bytes.equals(watcherCanonicalBytes(rawGraph))) fail("GKX_WATCHER_GRAPH_INVALID");
  return rawGraph;
}

async function openWatcherRetrievalCoordinator(options: Omit<WatcherCoherentSearchOptions, "request">): Promise<{
  coordinator: RetrievalCoordinator;
  pointer: Readonly<JsonRecord>;
  manifest: Readonly<JsonRecord>;
}> {
  const pointer = readWatcherPointer(options.watcher_directory, "outer");
  if (pointer === null) fail("GKX_WATCHER_NO_COHERENT_GENERATION");
  const manifest = readWatcherCoherentManifest(options.watcher_directory, pointer);
  const retrieval = record(manifest.retrieval_projection_state, "GKX_WATCHER_RETRIEVAL_STATE_INVALID");
  if (retrieval.state !== "ready") fail("GKX_WATCHER_RETRIEVAL_STATE_INVALID");
  const ownerFile = `ingest-generation-${String(retrieval.owner_manifest_digest).slice("sha256:".length)}.json`;
  const ownerBytes = readWatcherFile(options.retrieval_directory, ownerFile, { maximum_bytes: 536_870_912 });
  let ownerInput: unknown;
  try { ownerInput = JSON.parse(ownerBytes.bytes.toString("utf8")); } catch { fail("GKX_WATCHER_RETRIEVAL_STATE_INVALID"); }
  const owner = sealIngestOwnerGenerationManifestEnvelope(ownerInput);
  if (!ownerBytes.bytes.equals(Buffer.from(`${stableJson(owner)}\n`, "utf8")) || owner.owner_generation_id !== retrieval.owner_generation_id ||
      owner.owner_manifest_digest !== retrieval.owner_manifest_digest || owner.inner.database_file !== retrieval.database_file ||
      owner.inner.manifest_digest !== retrieval.manifest_digest || owner.inner.manifest.projection_id !== retrieval.projection_id ||
      owner.inner.manifest.projection_digest !== retrieval.projection_digest || owner.inner.manifest.lexical_backend !== retrieval.lexical_backend ||
      owner.configuration_digest !== manifest.configuration_digest || owner.policy_digest !== manifest.policy_digest ||
      owner.observation_snapshot_digest !== manifest.source_observation_snapshot_digest) {
    fail("GKX_WATCHER_RETRIEVAL_STATE_INVALID");
  }
  const sourceReader = vaultSourceReader(options.vault_root);
  // Resolve the Phase-3 reader's sealed root promise even for a legitimate
  // zero-hit query. `.gkx` is the already-proven state directory and therefore
  // must classify as a non-source directory without reading any authored byte.
  try { await sourceReader(".gkx"); fail("GKX_WATCHER_VAULT_ROOT_INVALID"); }
  catch (error) {
    const code = String((error as NodeJS.ErrnoException)?.code ?? "");
    const message = String((error as Error)?.message ?? "");
    if (message !== "SOURCE_ALIAS_REJECTED" && !(code === "ENOENT" && lstatSync(options.vault_root).isDirectory())) throw error;
  }
  const coordinator = new RetrievalCoordinator(join(options.retrieval_directory.path, String(retrieval.database_file)), {
    ...options.coordinator_options,
    source_reader: options.source_reader ? async (path) => {
      // Authorize against captured immutable bytes, but retain the sealed live
      // reader's alias checks and close the scan-to-citation freshness gap.
      const expected = await options.source_reader!(path);
      const live = await sourceReader(path);
      if (!Buffer.from(live).equals(Buffer.from(expected))) throw new Error("GKX_WATCHER_SOURCE_SNAPSHOT_MISMATCH");
      return expected;
    } : sourceReader,
    runtime_policy_digest: String(manifest.policy_digest),
    lineage_view_freshness: "fresh",
  });
  return { coordinator, pointer, manifest };
}

/** Every call captures and closes one immutable generation; no request mixes pointers. */
export async function searchWatcherCoherentGeneration(options: WatcherCoherentSearchOptions): Promise<{
  readonly pointer_digest: string;
  readonly coherent_manifest_digest: string;
  readonly result: RetrievalSearchResult;
}> {
  const waitMs = options.freshness_wait_ms ?? 10_000;
  if (!Number.isSafeInteger(waitMs) || waitMs < 0 || waitMs > 60_000) fail("GKX_WATCHER_FRESHNESS_WAIT_INVALID");
  const deadline = Date.now() + waitMs;
  for (;;) {
    const before = readWatcherPointer(options.watcher_directory, "outer");
    if (before === null) fail("GKX_WATCHER_NO_COHERENT_GENERATION");
    const beforeManifest = readWatcherCoherentManifest(options.watcher_directory, before);
    if (beforeManifest.configuration_digest !== options.configuration_digest
        || beforeManifest.policy_digest !== options.policy_digest
        || beforeManifest.effective_profile_digest !== options.effective_profile_digest) {
      fail("GKX_WATCHER_FRESHNESS_AUTHORITY_MISMATCH");
    }
    const beforeTopology = readWatcherTopology(options.watcher_directory, beforeManifest);
    let fresh = false;
    try {
      const scan = await secureWatcherSourceScan(options.vault_root);
      const after = readWatcherPointer(options.watcher_directory, "outer");
      fresh = after !== null && after.pointer_digest === before.pointer_digest
        && watcherScanMatchesTopology(scan, beforeTopology);
    } catch {
      fresh = false;
    }
    if (fresh) {
      const opened = await openWatcherRetrievalCoordinator(options);
      if (opened.pointer.pointer_digest !== before.pointer_digest) {
        opened.coordinator.close();
      } else {
        try {
          const result = await opened.coordinator.search(options.request);
          return Object.freeze({
            pointer_digest: String(opened.pointer.pointer_digest),
            coherent_manifest_digest: String(opened.manifest.coherent_manifest_digest),
            result,
          });
        } finally {
          opened.coordinator.close();
        }
      }
    }
    if (Date.now() >= deadline) fail("GKX_WATCHER_FRESHNESS_RECONCILIATION_REQUIRED");
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, Math.min(100, Math.max(1, deadline - Date.now()))));
  }
}

/** Resume a guard-bound prepared5 activation without re-running GKX/retrieval. */
export function recoverWatcherCoherentActivation(options: {
  readonly directory: WatcherDirectoryCapability;
  readonly journal: WatcherJournalHandle;
  readonly on_boundary?: (boundary: string) => void;
}): Readonly<JsonRecord> | null {
  let finalized: Readonly<JsonRecord> | null = null;
  let preparedTargetDigest: string | null = null;
  const pointer = recoverWatcherPointer({
    namespace: "outer",
    directory: options.directory,
    prepare_target: (targetCommitDigest) => {
      const intent = readWatcherJournalActivationIntent(options.journal, targetCommitDigest);
      if (intent === null) fail("GKX_WATCHER_ACTIVATION_RECOVERY_INVALID");
      const targetPointer = sealWatcherRecoveryRecord(intent.target_pointer);
      const manifest = readWatcherCoherentManifest(options.directory, targetPointer);
      if (readWatcherAuthority(options.directory) === null) {
        if (targetPointer.prior_pointer_digest !== null) fail("GKX_WATCHER_AUTHORITY_RECOVERY_REQUIRED");
        const authority = watcherAuthorityFromManifest(manifest, targetPointer);
        const authorityBytes = watcherCanonicalBytes(authority);
        if (watcherLeafExists(options.directory, WATCHER_AUTHORITY_TEMP_FILE)) {
          const temporary = readWatcherFile(options.directory, WATCHER_AUTHORITY_TEMP_FILE, { maximum_bytes: 1_048_576 });
          if (!temporary.bytes.equals(authorityBytes)) fail("GKX_WATCHER_AUTHORITY_MISMATCH");
        } else {
          writeNewWatcherFile(options.directory, WATCHER_AUTHORITY_TEMP_FILE, authorityBytes, 1_048_576);
        }
        hardlinkWatcherLeafNoReplace(options.directory, WATCHER_AUTHORITY_TEMP_FILE, WATCHER_AUTHORITY_FILE);
        syncWatcherDirectory(options.directory.path);
        unlinkWatcherLeaf(options.directory, WATCHER_AUTHORITY_TEMP_FILE, {
          allowed_links: 2,
          expected_raw_sha256: watcherRawDigest(authorityBytes),
        });
      }
      preparedTargetDigest = targetCommitDigest;
      options.on_boundary?.("authority_prepared");
    },
    finalize_target: (targetCommitDigest) => {
      if (preparedTargetDigest !== targetCommitDigest) {
        fail("GKX_WATCHER_ACTIVATION_RECOVERY_INVALID");
      }
      finalized = finalizeWatcherJournalTarget(options.journal, targetCommitDigest);
      options.on_boundary?.("target_finalized");
    },
    on_boundary: (boundary) => options.on_boundary?.(`pointer:${boundary}`),
  });
  if (pointer === null) return null;
  const active = finalized ?? readWatcherJournalActive(options.journal);
  if (active === null) {
    const manifest = readWatcherCoherentManifest(options.directory, pointer);
    if (watcherJournalIsAnchoredResetPendingReconciliation(options.journal, pointer, manifest)) return null;
    fail("GKX_WATCHER_ACTIVATION_RECOVERY_INVALID");
  }
  if (active.pointer_digest !== pointer.pointer_digest) fail("GKX_WATCHER_ACTIVATION_RECOVERY_INVALID");
  return active;
}
