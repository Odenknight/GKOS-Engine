/**
 * Repository-private Phase-5 watcher host plane.
 *
 * This entry is bundled only for the `gkos` host CLI and qualification tests.
 * It is intentionally absent from package exports and from the platform-neutral
 * engine surface.
 */
import { watch, type FSWatcher } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { GkxIndex } from "../incremental";
import {
  projectPhase3ScanRejections,
  secureWatcherSourceScan,
  normalizeWatcherHint,
  watcherScanMatchesTopology,
  type WatcherSourceScan,
} from "../ingest/source-scan";
import { buildIngestValidationPlan } from "../ingest/validation";
import { loadIngestProfile, type LoadedIngestProfile } from "../ingest/profile";
import {
  ensureWatcherIngestStateDirectory,
  preflightIngestVaultRoot,
  sealIngestOwnerGenerationManifestEnvelope,
  stageWatcherValidatedGkxIngestGeneration,
  watcherPublicEmbeddingEligibility,
} from "../ingest/storage";
import type { RetrievalCoordinatorOptions } from "../retrieval/coordinator";
import { stableJson } from "../retrieval/digest";
import { assertNoLegacyOrPhase3WriterForWatcher } from "../retrieval/state-writer-lock";
import type { RetrievalSearchRequest, RetrievalSearchResult } from "../retrieval/types";
import type { GkxGraph, SourceFile } from "../types";
import type { Gkx23ProjectionOptions } from "../gkx23";
import {
  assertWatcherHostLock,
  adoptWatcherJournalResetReconciliation,
  bootstrapWatcherJournal,
  closeWatcherJournal,
  commitWatcherFailureRetryNoop,
  openWatcherJournal,
  readWatcherCurrentActivationAuthority,
  readWatcherFailureRetryEpoch,
  readWatcherJournalActive,
  readWatcherJournalResetReconciliationAuthority,
  recoverWatcherHostLock,
  recoverWatcherJournalBootstrap,
  recoverWatcherJournalReset,
  recordWatcherJournalFailure,
  resetWatcherJournal,
  releaseWatcherHostLock,
  acquireWatcherHostLock,
  watcherJournalIsAnchoredResetPendingReconciliation,
  watcherJournalResetRecoveryActive,
  validateWatcherBootstrapTerminalEvidence,
  type WatcherHostLockCapability,
  type WatcherFailureRetryEpoch,
  type WatcherJournalHandle,
} from "./journal";
import {
  createWatcherIngestWriterCapability,
  releaseWatcherIngestWriterCapability,
  takeWatcherIndexValidationOutcome,
} from "./index-validation-hook";
import {
  deriveWatcherCoherentActivation,
  deriveWatcherFailureAuthority,
  deriveWatcherFailureRetryBundle,
  deriveWatcherFailureRetryNoop,
  deriveWatcherResetReconciliationAdoption,
  persistWatcherFailureAuthorityArtifacts,
  persistWatcherFailureRetryNoopArtifacts,
  persistWatcherResetReconciliationArtifacts,
  publishWatcherCoherentActivation,
  readWatcherAuthority,
  readWatcherCoherentManifest,
  readWatcherRawGraph,
  readWatcherTopology,
  recoverWatcherCoherentActivation,
  searchWatcherCoherentGeneration,
} from "./coordinator";
import {
  ensureWatcherDirectory,
  listWatcherLeaves,
  openWatcherDirectory,
  readWatcherFile,
  watcherNamespaceCoordinate,
  watcherLeafExists,
  watcherTimestamp,
  watcherUuid7,
  type WatcherDirectoryCapability,
} from "./fs-authority";
import { readWatcherPointer } from "./pointer";
import {
  startWatcherService,
  watcherStatusRecord,
  type WatcherServiceHandle,
  type WatcherServiceRequestHandler,
} from "./service";
import {
  deliverWatcherSourceRemovals,
  watcherRemovalAdapterBinding,
  type WatcherRemovalAdapterCapability,
} from "./removal-adapter";

export * from "./fs-authority";
export * from "./pointer";
export * from "./journal";
export * from "./coordinator";
export * from "./service";
export * from "./cli";
export * from "./removal-adapter";
export * from "../ingest/source-scan";
export * from "./index-validation-hook";
export { stageWatcherValidatedGkxIngestGeneration } from "../ingest/storage";
export { loadIngestProfile } from "../ingest/profile";
export { buildIngestValidationPlan } from "../ingest/validation";
export { GkxIndex } from "../incremental";

type JsonRecord = Record<string, unknown>;

export interface WatcherHostOptions {
  readonly vault_root: string;
  readonly status_file: string;
  readonly vault_id: string;
  readonly configuration_digest: string;
  readonly policy_digest: string;
  readonly profile_selector?: string | null;
  readonly projection_options?: Gkx23ProjectionOptions;
  readonly port?: number;
  readonly periodic_reconciliation_ms?: number;
  readonly periodic_clock?: {
    readonly set_timeout: (callback: () => void, delay_ms: number) => unknown;
    readonly clear_timeout: (handle: unknown) => void;
  };
  readonly retry_clock?: {
    readonly set_timeout: (callback: () => void, delay_ms: number) => unknown;
    readonly clear_timeout: (handle: unknown) => void;
  };
  readonly removal_adapter?: WatcherRemovalAdapterCapability | null;
  readonly create_compatibility_request_handler?: (context: {
    readonly get_status: () => Readonly<JsonRecord>;
    readonly get_graph: () => GkxGraph | null;
  }) => WatcherServiceRequestHandler;
  readonly on_index_execution?: (receipt: {
    readonly execution_kind: "set_files" | "apply_changes";
    readonly reparsed_source_count: number;
  }) => void;
  readonly on_status_change?: (status: Readonly<JsonRecord>) => void;
  readonly coordinator_options: Omit<RetrievalCoordinatorOptions, "source_reader" | "runtime_policy_digest" | "lineage_view_freshness">;
}

export interface WatcherHostHandle {
  readonly service: WatcherServiceHandle;
  readonly service_instance_id: string;
  readonly watcher_directory: WatcherDirectoryCapability;
  readonly journal_directory: WatcherDirectoryCapability;
  readonly retrieval_directory: WatcherDirectoryCapability;
  readonly reconcile: (kind?: "event" | "startup_reconciliation" | "shutdown_flush" | "failure_reconciliation") => Promise<void>;
  readonly search: (request: RetrievalSearchRequest) => Promise<RetrievalSearchResult>;
  readonly status: () => Readonly<JsonRecord>;
  readonly shutdown: () => Promise<void>;
  readonly closed: Promise<void>;
}

function fail(code: string): never { throw new Error(code); }

export function watcherFailureRetryDelay(failureIndex: number): number {
  if (!Number.isSafeInteger(failureIndex) || failureIndex < 0) fail("GKX_WATCHER_RETRY_AUTHORITY_INVALID");
  return Math.min(500 * (2 ** Math.min(failureIndex, 4)), 5_000);
}

function assertDigest(value: string, code: string): void {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) fail(code);
}

function trueJournalGenesis(
  watcher: WatcherDirectoryCapability,
  journals: WatcherDirectoryCapability,
  lock: WatcherHostLockCapability,
): void {
  const held = assertWatcherHostLock(lock);
  if (held.prior_journal_pointer_digest !== null || readWatcherAuthority(watcher) !== null || readWatcherPointer(watcher, "outer") !== null) {
    fail("GKX_WATCHER_GLOBAL_GENESIS_INVALID");
  }
  const watcherLeaves = listWatcherLeaves(watcher).filter((leaf) => leaf !== "journals" && leaf !== "watcher-authority.lock");
  if (watcherLeaves.length !== 0 || listWatcherLeaves(journals).length !== 0) fail("GKX_WATCHER_GLOBAL_GENESIS_INVALID");
}

function bootstrapRecoveryNamespace(
  watcher: WatcherDirectoryCapability,
  journals: WatcherDirectoryCapability,
): void {
  if (readWatcherAuthority(watcher) !== null || readWatcherPointer(watcher, "outer") !== null) {
    fail("GKX_WATCHER_GLOBAL_GENESIS_INVALID");
  }
  const watcherAllowed = /^(?:journals|watcher-authority\.lock|watcher-authority\.recovery|watcher-journal-bootstrap-recovery-bridge\.json|\.watcher-journal-bootstrap-recovery-bridge\.json\.gkos-watcher\.stage|watcher-journal-bootstrap-recovery-executor\.json|\.watcher-journal-bootstrap-recovery-executor\.json\.gkos-watcher\.stage|watcher-journal-bootstrap-recovery-executor-[0-9a-f]{64}\.json)$/u;
  const journalAllowed = /^(?:watcher-journal-active\.json|\.watcher-journal-active\.json\.gkos-watcher\.bootstrap-tmp|\.gkos-watcher-journal-bootstrap\.guard|\.gkos-watcher-journal-bootstrap\.guard-stage|watcher-journal-bootstrap-authority\.json|\.watcher-journal-bootstrap-authority\.json\.gkos-watcher\.tmp|watcher-journal-bootstrap-target-selector\.json|\.watcher-journal-bootstrap-target-selector\.(?:0|[1-9][0-9]*)\.[0-9a-f]{32}\.json\.gkos-watcher\.candidate|watcher-journal-bootstrap-planned-target-[0-9a-f]{64}\.json|\.watcher-journal-bootstrap-planned-target-[0-9a-f]{64}\.json\.gkos-watcher\.stage|watcher-journal-bootstrap-host-lock-[0-9a-f]{64}\.json|\.watcher-journal-bootstrap-host-lock-[0-9a-f]{64}\.json\.gkos-watcher\.stage|watcher-journal-generation-[0-9a-f]{64}\.json|watcher-journal-pointer-[0-9a-f]{64}\.json|journal-[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u;
  if (listWatcherLeaves(watcher).some((leaf) => !watcherAllowed.test(leaf))
      || listWatcherLeaves(journals).some((leaf) => !journalAllowed.test(leaf))) {
    fail("GKX_WATCHER_GLOBAL_GENESIS_INVALID");
  }
}

function ownerManifestForStatus(
  retrieval: WatcherDirectoryCapability,
  manifest: Readonly<JsonRecord>,
): ReturnType<typeof sealIngestOwnerGenerationManifestEnvelope> {
  const state = manifest.retrieval_projection_state as JsonRecord;
  const digest = String(state.owner_manifest_digest);
  const file = readWatcherFile(retrieval, `ingest-generation-${digest.slice(7)}.json`, { maximum_bytes: 536_870_912 });
  let parsed: unknown;
  try { parsed = JSON.parse(file.bytes.toString("utf8")); } catch { fail("GKX_WATCHER_RETRIEVAL_STATE_INVALID"); }
  const owner = sealIngestOwnerGenerationManifestEnvelope(parsed);
  if (owner.owner_manifest_digest !== digest) fail("GKX_WATCHER_RETRIEVAL_STATE_INVALID");
  return owner;
}

/**
 * Search-route discriminator. Absence is returned only when the watcher root
 * itself is absent. Once any watcher namespace exists, a missing/corrupt
 * persistent WatcherAuthority is an authority failure and never a signal to
 * fall back to a legacy retrieval writer.
 */
export function watcherCoherentAuthorityPresent(vaultRoot: string): boolean {
  const watcherPath = join(resolve(vaultRoot), ".gkx", "derived", "watcher");
  let watcher: WatcherDirectoryCapability;
  try { watcher = openWatcherDirectory(watcherPath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return false;
    throw error;
  }
  const authority = readWatcherAuthority(watcher);
  if (authority === null) {
    const leaves = listWatcherLeaves(watcher);
    if (leaves.length === 0) return false;
    if (leaves.length === 1 && leaves[0] === "journals") {
      const journals = openWatcherDirectory(join(watcher.path, "journals"));
      if (listWatcherLeaves(journals).length === 0) return false;
    }
    fail("GKX_WATCHER_AUTHORITY_RECOVERY_REQUIRED");
  }
  return true;
}

export function resetWatcherJournalState(input: {
  readonly state_directory: string;
  readonly expected_journal_generation_digest: string;
  readonly expected_coherent_manifest_digest: string;
}): Readonly<JsonRecord> {
  assertDigest(input.expected_journal_generation_digest, "GKX_WATCHER_EXPECTED_COORDINATE_INVALID");
  assertDigest(input.expected_coherent_manifest_digest, "GKX_WATCHER_EXPECTED_COORDINATE_INVALID");
  const watcherDirectory = openWatcherDirectory(resolve(input.state_directory));
  const journalDirectory = openWatcherDirectory(join(watcherDirectory.path, "journals"));
  if (watcherJournalResetRecoveryActive(watcherDirectory, journalDirectory)) {
    const recovered = recoverWatcherJournalReset({
      watcher_root: watcherDirectory,
      journal_root: journalDirectory,
      expected_journal_generation_digest: input.expected_journal_generation_digest,
      expected_coherent_manifest_digest: input.expected_coherent_manifest_digest,
    });
    if (recovered !== null) return recovered;
    if (watcherJournalResetRecoveryActive(watcherDirectory, journalDirectory)) {
      fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
    }
  }
  const outerPointer = readWatcherPointer(watcherDirectory, "outer");
  const journalPointer = readWatcherPointer(journalDirectory, "journal");
  if (outerPointer === null || journalPointer === null) fail("GKX_WATCHER_EXPECTED_COORDINATE_MISMATCH");
  const outerManifest = readWatcherCoherentManifest(watcherDirectory, outerPointer);
  if (journalPointer.journal_generation_digest !== input.expected_journal_generation_digest
      || outerManifest.coherent_manifest_digest !== input.expected_coherent_manifest_digest) {
    fail("GKX_WATCHER_EXPECTED_COORDINATE_MISMATCH");
  }
  const resetLockInput = {
    operation: "journal_reset",
    service_instance_id: null,
    prior_pointer_digest: String(outerPointer.pointer_digest),
    prior_coherent_manifest_digest: String(outerManifest.coherent_manifest_digest),
    prior_journal_pointer_digest: String(journalPointer.pointer_digest),
  } as const;
  const hostLock = watcherLeafExists(watcherDirectory, "watcher-authority.lock")
    ? recoverWatcherHostLock(watcherDirectory, resetLockInput)
    : acquireWatcherHostLock(watcherDirectory, resetLockInput);
  let journal: WatcherJournalHandle | null = null;
  try {
    const currentOuter = readWatcherPointer(watcherDirectory, "outer");
    const currentJournal = readWatcherPointer(journalDirectory, "journal");
    if (currentOuter === null || currentJournal === null || currentOuter.pointer_digest !== outerPointer.pointer_digest
        || currentJournal.pointer_digest !== journalPointer.pointer_digest) fail("GKX_WATCHER_EXPECTED_COORDINATE_MISMATCH");
    const currentManifest = readWatcherCoherentManifest(watcherDirectory, currentOuter);
    journal = openWatcherJournal(journalDirectory);
    if (journal === null) fail("GKX_WATCHER_EXPECTED_COORDINATE_MISMATCH");
    return resetWatcherJournal({
      watcher_directory: watcherDirectory,
      journal,
      host_lock: hostLock,
      outer_pointer: currentOuter,
      outer_manifest: currentManifest,
      expected_journal_generation_digest: input.expected_journal_generation_digest,
      expected_coherent_manifest_digest: input.expected_coherent_manifest_digest,
    });
  } finally {
    try { if (journal !== null && journal.database.isOpen) closeWatcherJournal(journal); } catch { /* reset recovery retains primary state */ }
    try { releaseWatcherHostLock(hostLock); } catch { /* reset terminal cleanup may already have released the capability */ }
  }
}

/**
 * Starts the repository-private watcher host. Every mutation is held beneath
 * one WatcherHostLock; inner retrieval generations remain unactivated and the
 * outer pointer is the sole reader coordinate.
 */
export async function startWatcherHost(options: WatcherHostOptions): Promise<WatcherHostHandle> {
  assertDigest(options.configuration_digest, "GKX_WATCHER_CONFIGURATION_INVALID");
  assertDigest(options.policy_digest, "GKX_WATCHER_POLICY_INVALID");
  const vault = resolve(options.vault_root);
  const vaultCapability = preflightIngestVaultRoot(vault);
  const retrievalPath = ensureWatcherIngestStateDirectory(vaultCapability);
  assertNoLegacyOrPhase3WriterForWatcher(retrievalPath);
  const derived = openWatcherDirectory(join(vault, ".gkx", "derived"));
  const watcherDirectory = ensureWatcherDirectory(join(derived.path, "watcher"), derived);
  const journalDirectory = ensureWatcherDirectory(join(watcherDirectory.path, "journals"), watcherDirectory);
  const retrievalDirectory = openWatcherDirectory(retrievalPath);
  const statusDirectory = openWatcherDirectory(dirname(resolve(options.status_file)));
  const profile = await loadIngestProfile(options.profile_selector);
  const projectionIndex = new GkxIndex(options.projection_options);
  let projectionIndexReady = false;
  let projectionFiles: readonly SourceFile[] = [];
  const serviceInstanceId = watcherUuid7();
  let priorPointer = readWatcherPointer(watcherDirectory, "outer");
  let priorManifest = priorPointer === null ? null : readWatcherCoherentManifest(watcherDirectory, priorPointer);
  let priorJournalPointer = readWatcherPointer(journalDirectory, "journal");
  let hostLock: WatcherHostLockCapability;
  let journal: WatcherJournalHandle | null = null;
  let service: WatcherServiceHandle | null = null;
  let fileWatchers: FSWatcher[] = [];
  let periodicTimer: unknown | null = null;
  let periodicEnabled = false;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let stopping = false;
  let activeReconciliation: Promise<void> | null = null;
  let pendingReconciliation = false;
  let pendingKind: "event" | "startup_reconciliation" | "shutdown_flush" | "failure_reconciliation" = "startup_reconciliation";
  let pendingPaths = new Set<string>();
  let pendingUnscoped = true;
  let pendingOverflow = false;
  let pendingHintCount = 0;
  let firstHintAt: number | null = null;
  let hintEpoch = 0;
  let coverageScan: WatcherSourceScan | null = null;
  let adapterDegraded = false;
  let providerDegraded = false;
  let refreshFileWatchers = (): void => undefined;
  let retryEpoch: WatcherFailureRetryEpoch | null = null;
  let retryTimer: unknown | null = null;
  let retryTimerGeneration = 0;
  const retryWaiters = new Set<{ resolve: () => void; reject: (error: unknown) => void }>();
  const retryClock = options.retry_clock ?? {
    set_timeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> { return setTimeout(callback, delay); },
    clear_timeout(handle: unknown): void { clearTimeout(handle as ReturnType<typeof setTimeout>); },
  };
  const periodicClock = options.periodic_clock ?? {
    set_timeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> { return setTimeout(callback, delay); },
    clear_timeout(handle: unknown): void { clearTimeout(handle as ReturnType<typeof setTimeout>); },
  };
  const startedNs = process.hrtime.bigint();
  let dispatchRetry = (): void => undefined;

  const retryWait = (): Promise<void> => new Promise<void>((resolveWait, rejectWait) => {
    retryWaiters.add({ resolve: resolveWait, reject: rejectWait });
  });
  const settleRetryWaiters = (error: unknown | null): void => {
    const rows = [...retryWaiters]; retryWaiters.clear();
    for (const row of rows) {
      if (error === null) row.resolve(); else row.reject(error);
    }
  };
  const cancelRetryTimer = (): void => {
    retryTimerGeneration += 1;
    if (retryTimer !== null) retryClock.clear_timeout(retryTimer);
    retryTimer = null;
  };
  const scheduleRetry = (): void => {
    if (retryEpoch === null || retryTimer !== null || stopped || stopping) return;
    const generation = ++retryTimerGeneration;
    retryTimer = retryClock.set_timeout(() => {
      if (generation !== retryTimerGeneration || stopped || stopping || retryEpoch === null) return;
      retryTimer = null;
      dispatchRetry();
    }, watcherFailureRetryDelay(retryEpoch.failure_index));
  };
  const completeRetryEpoch = (): void => {
    cancelRetryTimer(); retryEpoch = null; settleRetryWaiters(null);
  };
  const consumePendingRetryAuthority = (scan: WatcherSourceScan, sealedHintEpoch: number): boolean => {
    if (hintEpoch !== sealedHintEpoch) return false;
    if (debounce !== null) clearTimeout(debounce);
    debounce = null;
    firstHintAt = null;
    pendingPaths.clear();
    pendingUnscoped = false;
    pendingOverflow = false;
    pendingHintCount = 0;
    pendingReconciliation = false;
    coverageScan = scan;
    return true;
  };
  const retryableFailure = (error: unknown): boolean => {
    const code = String((error as NodeJS.ErrnoException)?.message ?? error);
    const systemCode = String((error as NodeJS.ErrnoException)?.code ?? "");
    return code.startsWith("WATCHER_SOURCE_") || code.startsWith("GKX_INGEST_")
      || code.startsWith("GKX_WATCHER_INDEX_") || code === "GKX_WATCHER_FAILURE_RECONCILIATION_REQUIRED"
      || code === "GKX_WATCHER_FAILURE_RETRY_CHANGED"
      || ["EIO", "ESTALE", "ENOENT", "EBUSY", "EPERM"].includes(systemCode);
  };

  try {
    if (watcherJournalResetRecoveryActive(watcherDirectory, journalDirectory)) {
      const resetRecovery = recoverWatcherJournalReset({
        watcher_root: watcherDirectory,
        journal_root: journalDirectory,
        revalidate_namespace() { assertNoLegacyOrPhase3WriterForWatcher(retrievalDirectory.path); },
      });
      if (resetRecovery === null) {
        if (watcherJournalResetRecoveryActive(watcherDirectory, journalDirectory)) {
          fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
        }
      } else {
        priorPointer = readWatcherPointer(watcherDirectory, "outer");
        priorManifest = priorPointer === null ? null : readWatcherCoherentManifest(watcherDirectory, priorPointer);
        priorJournalPointer = readWatcherPointer(journalDirectory, "journal");
      }
    }
    const bootstrapRecoveryActive = watcherLeafExists(watcherDirectory, "watcher-authority.recovery")
      || watcherLeafExists(watcherDirectory, "watcher-journal-bootstrap-recovery-executor.json")
      || watcherLeafExists(watcherDirectory, ".watcher-journal-bootstrap-recovery-executor.json.gkos-watcher.stage")
      || priorJournalPointer === null && watcherLeafExists(watcherDirectory, "watcher-authority.lock");
    if (bootstrapRecoveryActive) {
      const recovered = recoverWatcherJournalBootstrap({
        watcher_root: watcherDirectory,
        journal_root: journalDirectory,
        coordinates: {
          vault_id: options.vault_id,
          configuration_digest: options.configuration_digest,
          policy_digest: options.policy_digest,
          effective_profile_digest: profile.coordinate.effective_profile_digest,
          anchor_coherent_manifest_digest: null,
        },
        service_instance_id: serviceInstanceId,
        prior_pointer_digest: priorPointer === null ? null : String(priorPointer.pointer_digest),
        prior_coherent_manifest_digest: priorManifest === null ? null : String(priorManifest.coherent_manifest_digest),
        revalidate_namespace() { bootstrapRecoveryNamespace(watcherDirectory, journalDirectory); },
      });
      hostLock = recovered.host_lock;
      journal = recovered.journal;
      priorJournalPointer = journal.pointer;
    } else {
      validateWatcherBootstrapTerminalEvidence(watcherDirectory, journalDirectory);
      const staleRecoveryNamespace = Object.freeze({
        watcher: watcherNamespaceCoordinate(watcherDirectory, ["watcher-authority.lock", "watcher-authority.recovery"]),
        journal: watcherNamespaceCoordinate(journalDirectory),
        status: watcherNamespaceCoordinate(statusDirectory),
      });
      const revalidateStaleRecoveryNamespace = (): void => {
        assertNoLegacyOrPhase3WriterForWatcher(retrievalDirectory.path);
        if (watcherNamespaceCoordinate(watcherDirectory, ["watcher-authority.lock", "watcher-authority.recovery"]) !== staleRecoveryNamespace.watcher
            || watcherNamespaceCoordinate(journalDirectory) !== staleRecoveryNamespace.journal
            || watcherNamespaceCoordinate(statusDirectory) !== staleRecoveryNamespace.status) {
          fail("GKX_WATCHER_HOST_LOCK_RECOVERY_NAMESPACE_CHANGED");
        }
      };
      const lockInput = {
        operation: "service" as const,
        service_instance_id: serviceInstanceId,
        prior_pointer_digest: priorPointer === null ? null : String(priorPointer.pointer_digest),
        prior_coherent_manifest_digest: priorManifest === null ? null : String(priorManifest.coherent_manifest_digest),
        prior_journal_pointer_digest: priorJournalPointer === null ? null : String(priorJournalPointer.pointer_digest),
      };
      hostLock = watcherLeafExists(watcherDirectory, "watcher-authority.lock")
        ? recoverWatcherHostLock(watcherDirectory, lockInput, { revalidate_namespace: revalidateStaleRecoveryNamespace })
        : acquireWatcherHostLock(watcherDirectory, lockInput);
    }
    assertNoLegacyOrPhase3WriterForWatcher(retrievalDirectory.path);
    if (journal === null && priorJournalPointer === null) {
      trueJournalGenesis(watcherDirectory, journalDirectory, hostLock);
      journal = bootstrapWatcherJournal({
        root: journalDirectory,
        host_lock: hostLock,
        coordinates: {
          vault_id: options.vault_id,
          configuration_digest: options.configuration_digest,
          policy_digest: options.policy_digest,
          effective_profile_digest: profile.coordinate.effective_profile_digest,
          anchor_coherent_manifest_digest: null,
        },
      });
    } else if (journal === null) {
      journal = openWatcherJournal(journalDirectory);
      if (journal === null || journal.pointer.pointer_digest !== priorJournalPointer.pointer_digest) {
        fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
      }
    }
    recoverWatcherCoherentActivation({ directory: watcherDirectory, journal });
    priorPointer = readWatcherPointer(watcherDirectory, "outer");
    priorManifest = priorPointer === null ? null : readWatcherCoherentManifest(watcherDirectory, priorPointer);
    retryEpoch = readWatcherFailureRetryEpoch({
      watcher_directory: watcherDirectory,
      retrieval_directory: retrievalDirectory,
      journal,
      current_outer_pointer: priorPointer,
    });

    const runOne = async (kind: typeof pendingKind): Promise<void> => {
      const batchPaths = [...pendingPaths].sort();
      const batchUnscoped = pendingUnscoped;
      const batchOverflow = pendingOverflow;
      const batchHintCount = pendingHintCount;
      const batchHintEpoch = hintEpoch;
      pendingPaths = new Set();
      pendingUnscoped = false;
      pendingOverflow = false;
      pendingHintCount = 0;
      firstHintAt = null;
      const attemptPointer = readWatcherPointer(watcherDirectory, "outer");
      const attemptManifest = attemptPointer === null ? null : readWatcherCoherentManifest(watcherDirectory, attemptPointer);
      const attemptTopology = attemptManifest === null ? null : readWatcherTopology(watcherDirectory, attemptManifest);
      const isEvent = kind === "event";
      const requestedExecution = kind === "failure_reconciliation" ? "set_files"
        : isEvent && !batchUnscoped && !batchOverflow && batchPaths.length > 0 ? "apply_changes" : "set_files";
      const attemptBatchId = watcherUuid7();
      const attemptStartedAt = watcherTimestamp();
      const retryParent = kind === "failure_reconciliation" ? retryEpoch : null;
      if (kind === "failure_reconciliation" && retryParent === null) fail("GKX_WATCHER_RETRY_AUTHORITY_INVALID");
      const failureRetryBundle = retryParent === null ? null : deriveWatcherFailureRetryBundle({
        failed_authority: retryParent.failed_authority, retry_batch_id: attemptBatchId, retry_started_at: attemptStartedAt,
      });
      try {
        assertWatcherHostLock(hostLock);
        const scan = await secureWatcherSourceScan(vault);
      const selectedProfile: LoadedIngestProfile = await loadIngestProfile(options.profile_selector);
      if (requestedExecution === "apply_changes" && !projectionIndexReady) fail("GKX_WATCHER_FAILURE_RECONCILIATION_REQUIRED");
      const priorFilesByPath = new Map(projectionFiles.map((file) => [file.relativePath, file]));
      const currentFilesByPath = new Map(scan.files.map((file) => [file.relativePath, file]));
      const changedPaths = scan.files.filter((file) => {
        const prior = priorFilesByPath.get(file.relativePath);
        return prior === undefined || stableJson(prior) !== stableJson(file);
      }).map((file) => file.relativePath);
      const removedPaths = projectionFiles.filter((file) => !currentFilesByPath.has(file.relativePath)).map((file) => file.relativePath);
      const validationPlan = buildIngestValidationPlan({
        files: scan.files,
        folders: scan.folders,
        attachments: scan.attachments,
        scan_rejections: projectPhase3ScanRejections(scan.scan_rejections),
      }, selectedProfile, options.projection_options, {
        index: projectionIndex,
        execution_kind: requestedExecution,
        changed_paths: requestedExecution === "apply_changes" ? changedPaths : [],
        removed_paths: requestedExecution === "apply_changes" ? removedPaths : [],
        renames: [],
      });
      const validationOutcome = takeWatcherIndexValidationOutcome(validationPlan);
      options.on_index_execution?.(Object.freeze({
        execution_kind: requestedExecution,
        reparsed_source_count: validationOutcome.parse_count,
      }));
      priorPointer = readWatcherPointer(watcherDirectory, "outer");
      priorManifest = priorPointer === null ? null : readWatcherCoherentManifest(watcherDirectory, priorPointer);
      const priorTopology = priorManifest === null ? null : readWatcherTopology(watcherDirectory, priorManifest);

      if (priorPointer !== null && priorManifest !== null && priorTopology !== null
          && watcherJournalIsAnchoredResetPendingReconciliation(journal!, priorPointer, priorManifest)) {
        if (kind !== "startup_reconciliation" || batchPaths.length !== 0 || !batchUnscoped) {
          fail("GKX_WATCHER_JOURNAL_RECOVERY_REQUIRED");
        }
        const currentOwner = ownerManifestForStatus(retrievalDirectory, priorManifest);
        const currentRawGraph = readWatcherRawGraph(watcherDirectory, priorManifest);
        const journalAuthority = readWatcherJournalResetReconciliationAuthority(journal!, priorPointer, priorManifest);
        let adoption: Readonly<JsonRecord> | null = null;
        try {
          adoption = deriveWatcherResetReconciliationAdoption({
            vault_id: options.vault_id,
            configuration_digest: options.configuration_digest,
            policy_digest: options.policy_digest,
            effective_profile_digest: selectedProfile.coordinate.effective_profile_digest,
            scan,
            validation_plan: validationPlan,
            validation_outcome: validationOutcome,
            current_owner_manifest: currentOwner,
            current_pointer: priorPointer,
            current_manifest: priorManifest,
            current_topology: priorTopology,
            current_raw_graph: currentRawGraph,
            journal_authority: journalAuthority,
            batch_id: watcherUuid7(),
            recorded_at: watcherTimestamp(),
          });
        } catch (error) {
          if (String((error as Error)?.message) !== "GKX_WATCHER_RESET_RECONCILIATION_NOT_UNCHANGED") throw error;
        }
        if (adoption !== null) {
          persistWatcherResetReconciliationArtifacts(watcherDirectory, adoption);

          // The profile/source/outer/journal coordinates are sampled again at
          // the last asynchronous boundary, then synchronously reopened inside
          // the SQLite transaction immediately before its three inserts.
          const commitProfile = await loadIngestProfile(options.profile_selector);
          const commitScan = await secureWatcherSourceScan(vault);
          if (commitProfile.coordinate.effective_profile_digest !== selectedProfile.coordinate.effective_profile_digest
              || commitScan.namespace_digest !== scan.namespace_digest) {
            fail("GKX_WATCHER_RESET_RECONCILIATION_CHANGED");
          }
          adoptWatcherJournalResetReconciliation({
            journal: journal!,
            bundle: adoption,
            revalidate_before_commit() {
              assertWatcherHostLock(hostLock);
              const reopenedPointer = readWatcherPointer(watcherDirectory, "outer");
              if (reopenedPointer === null || stableJson(reopenedPointer) !== stableJson(priorPointer)) {
                fail("GKX_WATCHER_RESET_RECONCILIATION_CHANGED");
              }
              const reopenedManifest = readWatcherCoherentManifest(watcherDirectory, reopenedPointer);
              const reopenedTopology = readWatcherTopology(watcherDirectory, reopenedManifest);
              const reopenedOwner = ownerManifestForStatus(retrievalDirectory, reopenedManifest);
              const reopenedRawGraph = readWatcherRawGraph(watcherDirectory, reopenedManifest);
              const reopenedJournal = readWatcherJournalResetReconciliationAuthority(journal!, reopenedPointer, reopenedManifest);
              if (stableJson(reopenedManifest) !== stableJson(priorManifest)
                  || stableJson(reopenedTopology) !== stableJson(priorTopology)
                  || stableJson(reopenedOwner) !== stableJson(currentOwner)
                  || stableJson(reopenedRawGraph) !== stableJson(currentRawGraph)
                  || stableJson(reopenedJournal) !== stableJson(journalAuthority)) {
                fail("GKX_WATCHER_RESET_RECONCILIATION_CHANGED");
              }
            },
          });
          if (options.removal_adapter != null) {
            try { await deliverWatcherSourceRemovals(journal!, options.removal_adapter); adapterDegraded = false; }
            catch { adapterDegraded = true; }
          }
          coverageScan = hintEpoch === batchHintEpoch ? scan : null;
          projectionFiles = scan.files;
          projectionIndexReady = true;
          options.on_status_change?.(getStatus());
          return;
        }
      }

      if (failureRetryBundle !== null && priorPointer !== null && priorManifest !== null && priorTopology !== null) {
        const currentOwner = ownerManifestForStatus(retrievalDirectory, priorManifest);
        const currentRawGraph = readWatcherRawGraph(watcherDirectory, priorManifest);
        const currentActivation = readWatcherCurrentActivationAuthority(journal!, priorPointer, priorManifest);
        let noop: Readonly<JsonRecord> | null = null;
        try {
          noop = deriveWatcherFailureRetryNoop({
            failure_retry_bundle: failureRetryBundle, vault_id: options.vault_id,
            configuration_digest: options.configuration_digest, policy_digest: options.policy_digest,
            effective_profile_digest: selectedProfile.coordinate.effective_profile_digest,
            scan, validation_plan: validationPlan, validation_outcome: validationOutcome,
            current_owner_manifest: currentOwner, current_pointer: priorPointer, current_manifest: priorManifest,
            current_topology: priorTopology, current_raw_graph: currentRawGraph,
            current_activation_intent: currentActivation.current_activation_intent,
            current_activation_outcome: currentActivation.current_activation_outcome,
            current_active: currentActivation.current_active, completed_at: watcherTimestamp(),
          });
        } catch (error) {
          if (String((error as Error)?.message) !== "GKX_WATCHER_FAILURE_RETRY_NOT_UNCHANGED") throw error;
        }
        if (noop !== null) {
          persistWatcherFailureRetryNoopArtifacts(watcherDirectory, noop);
          const commitProfile = await loadIngestProfile(options.profile_selector);
          // Let already-delivered filesystem notifications enter the sole
          // pending slot, then consume them with the final secure full scan.
          // A notification delivered after this scan remains pending and is
          // reconciled normally; one observed before/during it is covered by
          // the scan's own double-snapshot proof.
          await new Promise<void>((resolveTurn) => setImmediate(resolveTurn));
          const commitScan = await secureWatcherSourceScan(vault);
          const commitHintEpoch = hintEpoch;
          const stableProfile = selectedProfile.coordinate.effective_profile_digest;
          if (commitProfile.coordinate.effective_profile_digest !== stableProfile
              || commitScan.namespace_digest !== scan.namespace_digest) fail("GKX_WATCHER_FAILURE_RETRY_CHANGED");
          const stableNamespace = commitScan.namespace_digest;
          commitWatcherFailureRetryNoop({
            watcher_directory: watcherDirectory, retrieval_directory: retrievalDirectory, journal: journal!, bundle: noop,
            revalidate_before_commit() {
              assertWatcherHostLock(hostLock);
              const pointer = readWatcherPointer(watcherDirectory, "outer");
              if (pointer === null || stableJson(pointer) !== stableJson(priorPointer)) fail("GKX_WATCHER_FAILURE_RETRY_CHANGED");
            },
          });
          completeRetryEpoch();
          if (!consumePendingRetryAuthority(commitScan, commitHintEpoch)) coverageScan = null;
          projectionFiles = commitScan.files;
          projectionIndexReady = true;
          options.on_status_change?.(getStatus());
          return;
        }
      }

      assertNoLegacyOrPhase3WriterForWatcher(retrievalDirectory.path);
      const writer = createWatcherIngestWriterCapability({
        plan: validationPlan,
        state_directory: retrievalDirectory.path,
        host_lock_digest: String(assertWatcherHostLock(hostLock).lock_digest),
        revalidate() {
          assertWatcherHostLock(hostLock);
          assertNoLegacyOrPhase3WriterForWatcher(retrievalDirectory.path);
        },
      });
      let staged;
      try {
        const vectorProvider = options.coordinator_options.vector_provider;
        const eligibleChunkKeys = vectorProvider === undefined ? [] : watcherPublicEmbeddingEligibility(validationPlan);
        const priorRetrieval = priorManifest?.retrieval_projection_state as JsonRecord | undefined;
        const priorDatabasePath = priorRetrieval?.state === "ready"
          ? join(retrievalDirectory.path, String(priorRetrieval.database_file))
          : null;
        staged = await stageWatcherValidatedGkxIngestGeneration(writer, validationPlan, {
          state_directory: retrievalDirectory.path,
          vault_id: options.vault_id,
          configuration_digest: options.configuration_digest,
          policy_digest: options.policy_digest,
          embedding_eligible_candidate_chunk_keys: eligibleChunkKeys,
          lexical_backend: "sqlite_fts5",
        }, undefined, vectorProvider, priorDatabasePath);
        providerDegraded = staged.embedding_work.provider_failed;
      } finally {
        releaseWatcherIngestWriterCapability(writer);
      }
      const observedPaths = kind === "failure_reconciliation" ? [] : batchPaths;
      const bundle = deriveWatcherCoherentActivation({
        vault_id: options.vault_id,
        configuration_digest: options.configuration_digest,
        policy_digest: options.policy_digest,
        effective_profile_digest: selectedProfile.coordinate.effective_profile_digest,
        scan,
        validation_plan: validationPlan,
        validation_outcome: validationOutcome,
        staged_owner_manifest: staged.owner_manifest,
        vector_provider_kind: staged.owner_manifest.inner.manifest.embedding_provider_id === null
          ? null
          : options.coordinator_options.vector_provider?.kind ?? null,
        prior_pointer: priorPointer,
        prior_manifest: priorManifest,
        prior_topology: priorTopology,
        batch_kind: kind,
        execution_kind: requestedExecution,
        observed_paths: observedPaths,
        unscoped: !isEvent || batchUnscoped || observedPaths.length === 0,
        overflow: kind === "failure_reconciliation" ? false : batchOverflow,
        retry_of_batch_id: retryParent === null ? null : String((retryParent.failed_authority.batch as JsonRecord).batch_id),
        batch_id: attemptBatchId,
        recorded_at: attemptStartedAt,
        source_removal_adapter_binding: options.removal_adapter == null ? null : watcherRemovalAdapterBinding(options.removal_adapter),
      });
      if (bundle !== null) {
        if (failureRetryBundle !== null) {
          const sealedRetry = deriveWatcherFailureRetryBundle({
            failed_authority: retryParent!.failed_authority,
            retry_batch_id: String((bundle.batch as JsonRecord).batch_id),
            retry_started_at: String((bundle.batch as JsonRecord).started_at),
          });
          if (stableJson(sealedRetry) !== stableJson(failureRetryBundle)
              || stableJson((bundle.observation as JsonRecord)) !== stableJson(sealedRetry.retry_observation)
              || stableJson((bundle.observation_authority as JsonRecord)) !== stableJson(sealedRetry.retry_observation_authority)
              || stableJson((bundle.pre_scan_state as JsonRecord)) !== stableJson(sealedRetry.retry_pre_scan_state)) {
            fail("GKX_WATCHER_RETRY_AUTHORITY_INVALID");
          }
        }
        publishWatcherCoherentActivation({ directory: watcherDirectory, journal: journal!, bundle });
      }
      if (options.removal_adapter != null) {
        try { await deliverWatcherSourceRemovals(journal!, options.removal_adapter); adapterDegraded = false; }
        catch { adapterDegraded = true; }
      }
        coverageScan = hintEpoch === batchHintEpoch ? scan : null;
        projectionFiles = scan.files;
        projectionIndexReady = true;
        if (kind === "failure_reconciliation") {
          await new Promise<void>((resolveTurn) => setImmediate(resolveTurn));
          const completionScan = await secureWatcherSourceScan(vault);
          const completionHintEpoch = hintEpoch;
          completeRetryEpoch();
          if (completionScan.namespace_digest === scan.namespace_digest) {
            consumePendingRetryAuthority(completionScan, completionHintEpoch);
          }
        }
        options.on_status_change?.(getStatus());
      } catch (error) {
        projectionIndexReady = false;
        projectionFiles = [];
        if (!pendingUnscoped) for (const path of batchPaths) pendingPaths.add(path);
        pendingUnscoped ||= batchUnscoped;
        pendingOverflow ||= batchOverflow;
        pendingHintCount = Math.min(2_001, pendingHintCount + batchHintCount);
        if (retryableFailure(error)) {
          const durableFailure = deriveWatcherFailureAuthority({
            vault_id: options.vault_id, configuration_digest: options.configuration_digest,
            policy_digest: options.policy_digest,
            effective_profile_digest: String(attemptManifest?.effective_profile_digest ?? profile.coordinate.effective_profile_digest),
            prior_pointer: attemptPointer, prior_manifest: attemptManifest, prior_topology: attemptTopology,
            batch_kind: kind, execution_kind: requestedExecution,
            retry_of_batch_id: retryParent === null ? null : String((retryParent.failed_authority.batch as JsonRecord).batch_id),
            observed_paths: kind === "failure_reconciliation" ? [] : batchPaths,
            unscoped: kind === "failure_reconciliation" || !isEvent || batchUnscoped || batchPaths.length === 0,
            overflow: kind === "failure_reconciliation" ? false : batchOverflow,
            batch_id: attemptBatchId, started_at: attemptStartedAt, failed_at: watcherTimestamp(),
          });
          persistWatcherFailureAuthorityArtifacts(watcherDirectory, durableFailure);
          recordWatcherJournalFailure(journal!, {
            batch: durableFailure.batch, observation_authority: durableFailure.observation_authority,
            transitions: durableFailure.transitions as readonly unknown[],
          });
          retryEpoch = Object.freeze({
            failed_authority: durableFailure,
            failure_index: retryParent === null ? 0 : retryParent.failure_index + 1,
          });
          scheduleRetry();
          options.on_status_change?.(getStatus());
        }
        throw error;
      }
    };

    const reconcile = (requestedKind: typeof pendingKind = "event"): Promise<void> => {
      if (stopped || stopping && requestedKind !== "shutdown_flush") return Promise.reject(new Error("GKX_WATCHER_STOPPING"));
      let kind = requestedKind;
      if (retryEpoch !== null && kind === "shutdown_flush") {
        // Shutdown bypasses only the in-process delay, never the durable F1
        // parent. The flush remains a fresh unscoped setFiles retry and either
        // commits a governed success or leaves a new durable failed tail.
        cancelRetryTimer();
        kind = "failure_reconciliation";
        pendingUnscoped = true;
      }
      if (retryEpoch !== null && kind !== "failure_reconciliation") {
        pendingReconciliation = true;
        pendingKind = kind;
        pendingUnscoped = true;
        pendingOverflow ||= kind === "event" && pendingHintCount > 2_000;
        return retryWait();
      }
      if (kind === "failure_reconciliation" && (retryEpoch === null || retryTimer !== null)) {
        return retryEpoch === null ? Promise.reject(new Error("GKX_WATCHER_RETRY_AUTHORITY_INVALID")) : retryWait();
      }
      if (kind === "event" && pendingPaths.size === 0 && !pendingUnscoped && !pendingOverflow) {
        pendingUnscoped = true;
        hintEpoch += 1;
      }
      pendingKind = kind;
      if (activeReconciliation !== null) {
        pendingReconciliation = true;
        return activeReconciliation;
      }
      if (periodicTimer !== null) {
        periodicClock.clear_timeout(periodicTimer);
        periodicTimer = null;
      }
      activeReconciliation = (async () => {
        do {
          pendingReconciliation = false;
          const currentKind = pendingKind;
          await runOne(currentKind);
          refreshFileWatchers();
        } while (pendingReconciliation && !stopped);
      })().finally(() => {
        activeReconciliation = null;
        schedulePeriodicReconciliation();
      });
      return activeReconciliation;
    };

    const periodicMs = options.periodic_reconciliation_ms ?? 2_000;
    if (!Number.isSafeInteger(periodicMs) || periodicMs < 500 || periodicMs > 60_000) {
      fail("GKX_WATCHER_RECONCILIATION_INTERVAL_INVALID");
    }
    const schedulePeriodicReconciliation = (): void => {
      if (!periodicEnabled || stopping || stopped) return;
      if (periodicTimer !== null) periodicClock.clear_timeout(periodicTimer);
      periodicTimer = periodicClock.set_timeout(() => {
        periodicTimer = null;
        hintEpoch += 1;
        coverageScan = null;
        pendingPaths.clear();
        pendingUnscoped = true;
        pendingHintCount = 0;
        pendingReconciliation = true;
        void reconcile("event").catch(() => undefined);
      }, periodicMs);
    };
    dispatchRetry = () => {
      if (activeReconciliation !== null) {
        void activeReconciliation.catch(() => undefined).finally(() => {
          if (retryEpoch !== null && retryTimer === null && !stopped && !stopping) dispatchRetry();
        });
        return;
      }
      // Timer fire owns the sole pending reconciliation slot. Filesystem hints
      // accumulated during backoff are consumed by this fresh unscoped scan;
      // a previously armed debounce callback must not enqueue a second
      // ordinary batch after the exact retry/no-op terminal row commits.
      if (debounce !== null) {
        clearTimeout(debounce);
        debounce = null;
        firstHintAt = null;
      }
      const dispatchedEpoch = retryEpoch;
      void reconcile("failure_reconciliation").catch((error) => {
        // A retryable failure replaces the durable epoch before it arms the
        // next timer.  A test clock (or a very fast real clock) may consume
        // that timer before this rejection observer runs, so timer presence
        // alone cannot distinguish the old failed attempt.  Settle only when
        // the exact dispatched epoch is still current: replacement means all
        // waiters remain joined to the new causal tail.
        if (retryEpoch === dispatchedEpoch && retryTimer === null) settleRetryWaiters(error);
      });
    };

    function getStatus(): Readonly<JsonRecord> {
      // Filesystem hints and the periodic reconciliation invalidate this
      // capability immediately. Request-local search performs its own secure
      // replay below before it may serve a generation.
      const currentCoverage = coverageScan !== null;
      const pointer = readWatcherPointer(watcherDirectory, "outer");
      if (pointer === null) {
        return watcherStatusRecord({
          service_instance_id: serviceInstanceId, watcher_state: "reconciling", freshness: "stale",
          reason_codes: ["WATCHER_NO_COHERENT_GENERATION"], document_count: 0, chunk_count: 0,
          embedding_model: null, last_sync: null, uptime_ms: Number((process.hrtime.bigint() - startedNs + 999_999n) / 1_000_000n),
          pid: process.pid, source_snapshot_digest: null, coherent_manifest_digest: null,
          configuration_digest: null, policy_digest: null,
        });
      }
      const manifest = readWatcherCoherentManifest(watcherDirectory, pointer);
      const topology = readWatcherTopology(watcherDirectory, manifest);
      const active = readWatcherJournalActive(journal!);
      if (active === null || active.pointer_digest !== pointer.pointer_digest) fail("GKX_WATCHER_ACTIVE_COHERENCE_INVALID");
      const owner = ownerManifestForStatus(retrievalDirectory, manifest);
      const rejected = (topology.rejected_sources as readonly unknown[]).length > 0;
      const fresh = currentCoverage && activeReconciliation === null && !pendingReconciliation && retryEpoch === null && !stopping;
      const degraded = rejected || adapterDegraded || providerDegraded || retryEpoch !== null;
      const state = stopping ? "stopping" : fresh || degraded ? "serving" : "reconciling";
      const freshness = stopping ? (degraded ? "degraded" : "stale") : degraded ? "degraded" : fresh ? "fresh" : "stale";
      const reasons = [
        ...(stopping ? ["WATCHER_SHUTDOWN_DRAINING"] : []),
        ...(adapterDegraded ? ["WATCHER_LEDGER_ADAPTER_FAILED"] : []),
        ...(providerDegraded ? ["WATCHER_RETRIEVAL_DEGRADED"] : []),
        ...(retryEpoch !== null ? ["WATCHER_SOURCE_CAPABILITY_UNSTABLE"] : []),
        ...(rejected ? ["WATCHER_SOURCE_REJECTED"] : []),
        ...(!stopping && !degraded && !fresh ? ["WATCHER_REBUILD_IN_PROGRESS"] : []),
      ].sort();
      return watcherStatusRecord({
        service_instance_id: serviceInstanceId,
        watcher_state: state,
        freshness,
        reason_codes: reasons,
        document_count: (topology.accepted_sources as readonly unknown[]).length,
        chunk_count: owner.inner.manifest.candidate_chunk_count,
        embedding_model: (manifest.retrieval_projection_state as JsonRecord).model_id as string | null,
        last_sync: String(active.activated_at),
        uptime_ms: Number((process.hrtime.bigint() - startedNs + 999_999n) / 1_000_000n),
        pid: process.pid,
        source_snapshot_digest: String(manifest.source_observation_snapshot_digest),
        coherent_manifest_digest: String(manifest.coherent_manifest_digest),
        configuration_digest: String(manifest.configuration_digest),
        policy_digest: String(manifest.policy_digest),
      });
    }

    const requestAuthorityIsFresh = async (): Promise<boolean> => {
      if (stopping || stopped || coverageScan === null || retryEpoch !== null || pendingReconciliation) return false;
      const before = readWatcherPointer(watcherDirectory, "outer");
      if (before === null) return false;
      const manifest = readWatcherCoherentManifest(watcherDirectory, before);
      const topology = readWatcherTopology(watcherDirectory, manifest);
      const [scan, currentProfile] = await Promise.all([
        secureWatcherSourceScan(vault),
        loadIngestProfile(options.profile_selector),
      ]);
      const after = readWatcherPointer(watcherDirectory, "outer");
      return after !== null && after.pointer_digest === before.pointer_digest
        && scan.namespace_digest === coverageScan.namespace_digest
        && watcherScanMatchesTopology(scan, topology)
        && manifest.configuration_digest === options.configuration_digest
        && manifest.policy_digest === options.policy_digest
        && manifest.effective_profile_digest === currentProfile.coordinate.effective_profile_digest;
    };

    const requestLocalStatus = async (): Promise<Readonly<JsonRecord>> => {
      if (stopping || stopped) return getStatus();
      let fresh = false;
      try { fresh = await requestAuthorityIsFresh(); }
      catch { fresh = false; }
      if (!fresh) {
        // The request enters the same one-active/one-pending arbitration as
        // hints, periodic reconciliation, startup and retry. A durable retry
        // already represents degraded authority, so status reports it rather
        // than waiting indefinitely for the backoff timer.
        coverageScan = null;
        if (retryEpoch === null) {
          try { await reconcile("event"); }
          catch { /* the resulting status is stale/degraded, never fresh */ }
        }
        try { fresh = await requestAuthorityIsFresh(); }
        catch { fresh = false; }
      }
      if (!fresh) coverageScan = null;
      return getStatus();
    };

    const getGraph = (): GkxGraph | null => {
      const pointer = readWatcherPointer(watcherDirectory, "outer");
      if (pointer === null) return null;
      const manifest = readWatcherCoherentManifest(watcherDirectory, pointer);
      const artifact = readWatcherRawGraph(watcherDirectory, manifest);
      if (artifact.service_generation_id !== manifest.service_generation_id ||
          artifact.topology_snapshot_digest !== manifest.topology_snapshot_digest) {
        fail("GKX_WATCHER_GRAPH_INVALID");
      }
      return artifact.graph as GkxGraph;
    };

    const queueEvent = (name: string | Buffer | null, directoryPrefix = ""): void => {
      if (stopped || stopping) return;
      const rawName = typeof name === "string" ? name : name?.toString("utf8") ?? null;
      const scopedName = rawName === null ? null : directoryPrefix === "" ? rawName : `${directoryPrefix}/${rawName}`;
      const normalized = normalizeWatcherHint(scopedName);
      if (normalized === "") return;
      hintEpoch += 1;
      if (normalized === null) {
        pendingPaths.clear();
        pendingUnscoped = true;
      } else if (!pendingUnscoped) {
        pendingHintCount += 1;
        if (pendingHintCount > 2_000) {
          pendingPaths.clear();
          pendingUnscoped = true;
          pendingOverflow = true;
        } else {
          pendingPaths.add(normalized);
        }
      }
      pendingKind = "event";
      pendingReconciliation = true;
      coverageScan = null;
      const now = Date.now();
      if (firstHintAt === null) firstHintAt = now;
      if (debounce !== null) clearTimeout(debounce);
      const delay = Math.max(0, Math.min(500, firstHintAt + 2_000 - now));
      debounce = setTimeout(() => {
        debounce = null;
        firstHintAt = null;
        void reconcile("event").catch(() => undefined);
      }, delay);
    };

    const watcherError = (): void => {
      hintEpoch += 1;
      coverageScan = null;
      pendingPaths.clear();
      pendingUnscoped = true;
      pendingHintCount = 0;
      pendingReconciliation = true;
      void reconcile("event").catch(() => undefined);
    };
    const installFileWatchers = (): void => {
      for (const held of fileWatchers) held.close();
      fileWatchers = [];
      try {
        const recursive = watch(vault, { recursive: true }, (_event, name) => queueEvent(name));
        recursive.on("error", watcherError);
        fileWatchers.push(recursive);
        return;
      } catch { /* install one exact watcher per securely scanned directory */ }
      const directories = ["", ...(coverageScan?.folders ?? [])];
      for (const relative of directories) {
        const held = watch(relative === "" ? vault : join(vault, relative), (_event, name) => queueEvent(name, relative));
        held.on("error", watcherError);
        fileWatchers.push(held);
      }
    };
    refreshFileWatchers = installFileWatchers;

    if (retryEpoch === null) {
      try { await reconcile("startup_reconciliation"); }
      catch (error) { if (retryEpoch === null) throw error; }
    } else {
      scheduleRetry();
    }
    installFileWatchers();
    periodicEnabled = true;
    schedulePeriodicReconciliation();

    service = await startWatcherService({
      status_directory: statusDirectory,
      service_instance_id: serviceInstanceId,
      host_lock_owner_nonce: String(assertWatcherHostLock(hostLock).owner_nonce),
      get_status: requestLocalStatus,
      revalidate_authority() { assertWatcherHostLock(hostLock); },
      compatibility_request_handler: options.create_compatibility_request_handler?.({
        get_status: getStatus,
        get_graph: getGraph,
      }),
      port: options.port,
      on_stopping: () => {
        if (stopping) return;
        stopping = true;
        cancelRetryTimer();
        options.on_status_change?.(getStatus());
        for (const held of fileWatchers) held.close();
        fileWatchers = [];
        if (debounce !== null) { clearTimeout(debounce); debounce = null; }
        periodicEnabled = false;
        if (periodicTimer !== null) { periodicClock.clear_timeout(periodicTimer); periodicTimer = null; }
      },
      on_shutdown: async ({ signal }) => {
        if (!stopping) fail("GKX_WATCHER_SHUTDOWN_AUTHORITY_INVALID");
        if (activeReconciliation !== null) await activeReconciliation;
        if (signal.aborted) fail("GKX_WATCHER_SHUTDOWN_UNSAFE");
        if (pendingReconciliation || retryEpoch !== null) {
          try { await reconcile("shutdown_flush"); }
          catch (error) {
            // A failed immediate same-parent retry is already a new durable
            // F1 tail. It is safe to stop with that committed authority; any
            // failure outside the governed retry path remains unsafe.
            if (retryEpoch === null) throw error;
          }
        }
        if (signal.aborted) fail("GKX_WATCHER_SHUTDOWN_UNSAFE");
        pendingReconciliation = false;
        settleRetryWaiters(new Error("GKX_WATCHER_STOPPING"));
        closeWatcherJournal(journal!);
        journal = null;
        releaseWatcherHostLock(hostLock);
        stopped = true;
      },
    });

    return Object.freeze({
      service,
      service_instance_id: serviceInstanceId,
      watcher_directory: watcherDirectory,
      journal_directory: journalDirectory,
      retrieval_directory: retrievalDirectory,
      reconcile,
      status: getStatus,
      async search(request: RetrievalSearchRequest): Promise<RetrievalSearchResult> {
        for (;;) {
          let covered = false;
          try { covered = await requestAuthorityIsFresh(); }
          catch { covered = false; }
          if (covered && retryEpoch === null && !pendingReconciliation) break;
          try {
            await reconcile("event");
          } catch (error) {
            // A freshness-triggered reconciliation may itself establish a new
            // durable retry epoch.  In that case this request joins the same
            // coordinator-owned epoch instead of observing a second failure
            // root or escaping the frozen backoff arbitration.
            if (retryEpoch === null || retryTimer === null) throw error;
          }
        }
        const result = await searchWatcherCoherentGeneration({
          watcher_directory: watcherDirectory,
          retrieval_directory: retrievalDirectory,
          vault_root: vault,
          configuration_digest: options.configuration_digest,
          policy_digest: options.policy_digest,
          effective_profile_digest: (await loadIngestProfile(options.profile_selector)).coordinate.effective_profile_digest,
          request,
          coordinator_options: options.coordinator_options,
        });
        return result.result;
      },
      shutdown: service.shutdown,
      closed: service.closed,
    });
  } catch (error) {
    for (const held of fileWatchers) held.close();
    if (debounce !== null) clearTimeout(debounce);
    periodicEnabled = false;
    if (periodicTimer !== null) periodicClock.clear_timeout(periodicTimer);
    cancelRetryTimer();
    settleRetryWaiters(error);
    try { if (journal !== null) closeWatcherJournal(journal); } catch { /* retain primary error */ }
    try { releaseWatcherHostLock(hostLock); } catch { /* retain primary error */ }
    throw error;
  }
}
