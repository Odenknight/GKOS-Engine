/** Additive effects contract. Navigation 1.0 remains pure and read-only. */
export const NAVIGATION_EFFECTS_CONTRACT_VERSION = "1.0.0" as const;

export type Digest = string;
export type VaultRelativePath = string;

export interface EffectsPolicyRef {
  id: string;
  version: string;
  digest: Digest;
}

export interface EffectsActorRef {
  actorId: string;
  actorType: "human" | "agent" | "system";
  displayName?: string;
}

export type MocOwnership = "unmanaged" | "region-managed" | "fully-managed";

export interface MocGeneratedRegion {
  markerVersion: "1";
  configDigest: Digest;
  startOffset: number;
  endOffset: number;
  bodyDigest: Digest;
}

export type MocMarkerFailureCode =
  | "MARKER_MISSING"
  | "MARKER_DUPLICATED"
  | "MARKER_NESTED"
  | "MARKER_MALFORMED"
  | "MARKER_MOVED"
  | "MARKER_CONFIG_MISMATCH"
  | "GENERATED_REGION_CHANGED";

export interface MocOwnershipBinding {
  targetPath: VaultRelativePath;
  ownership: MocOwnership;
  adoptedDigest?: Digest;
  generatedRegion?: MocGeneratedRegion;
  adoptedBy?: EffectsActorRef;
  adoptedAt?: string;
  adoptionReceiptId?: string;
  /** Allows a policy-authorized absent target to begin fully managed. */
  creationAuthorized?: true;
}

export type EffectOperation =
  | "moc:create"
  | "moc:replace"
  | "moc:rollback"
  | "agent-note:create"
  | "agent-note:update"
  | "agent-note:append"
  | "agent-note:archive";

export interface EffectAuthorityBinding {
  actor: EffectsActorRef;
  credentialId?: string;
  grantId: string;
  allowedRoot: VaultRelativePath;
  capability: AgentCapability | "moc:apply" | "moc:rollback";
  sensitivityCeiling: string;
  policyRef: EffectsPolicyRef;
  expiresAt?: string;
}

export interface EffectPrecondition {
  target: "absent" | "present";
  priorDigest?: Digest;
  configDigest: Digest;
  authorityDigest: Digest;
  authorityEvaluatedAt: string;
  retentionHold: "clear";
}

export interface NavigationEffectPlan {
  artifactKind: "engine.navigation-effect-plan";
  effectsContract: typeof NAVIGATION_EFFECTS_CONTRACT_VERSION;
  effectId: string;
  idempotencyKey: string;
  operation: EffectOperation;
  vaultId: string;
  targetPath: VaultRelativePath;
  proposedDigest: Digest;
  sourceSnapshotDigest: Digest;
  corpusDigest: Digest;
  configDigest: Digest;
  policyRef: EffectsPolicyRef;
  authority: EffectAuthorityBinding;
  precondition: EffectPrecondition;
  ownership?: MocOwnershipBinding;
  archiveRunPath?: VaultRelativePath;
}

export type JournalState =
  | "RECEIVED"
  | "PLANNED"
  | "PREPARED"
  | "APPLYING"
  | "VERIFIED"
  | "COMMITTED"
  | "STALE"
  | "RECOVERY_REQUIRED"
  | "ABORTED";

export interface EffectJournalEntry {
  artifactKind: "engine.effect-journal-entry";
  effectsContract: typeof NAVIGATION_EFFECTS_CONTRACT_VERSION;
  sequence: number;
  predecessorDigest?: Digest;
  entryDigest: Digest;
  effectId: string;
  state: JournalState;
  planDigest: Digest;
  occurredAt: string;
  reasonCode?: string;
  receiptDigest?: Digest;
  plan?: NavigationEffectPlan;
  temporaryPath?: VaultRelativePath;
}

export interface EffectJournalCheckpoint {
  artifactKind: "engine.effect-journal-checkpoint";
  effectsContract: typeof NAVIGATION_EFFECTS_CONTRACT_VERSION;
  sequence: number;
  entryDigest: Digest | null;
  cleanShutdown: boolean;
  recordedAt: string;
}

export interface MocArchiveEffectBinding {
  effectId: string;
  planDigest: Digest;
  targetPath: VaultRelativePath;
  beforeDigest: Digest | null;
  proposedDigest: Digest;
  sourceSnapshotDigest: Digest;
  corpusDigest: Digest;
  configDigest: Digest;
  policyDigest: Digest;
  authorityDigest: Digest;
}

export interface MocEffectArchiveManifest {
  artifactKind: "engine.moc-effect-archive-manifest";
  effectsContract: typeof NAVIGATION_EFFECTS_CONTRACT_VERSION;
  effects: MocArchiveEffectBinding[];
}

export interface NavigationEffectByteDiffItem {
  effectId: string;
  targetPath: VaultRelativePath;
  beforeDigest: Digest | null;
  afterDigest: Digest;
  beforeByteLength: number;
  afterByteLength: number;
}

export interface NavigationEffectArchiveDiff {
  artifactKind: "engine.navigation-effect-byte-diff";
  items: NavigationEffectByteDiffItem[];
}

export interface NavigationEffectRunResult {
  artifactKind: "engine.navigation-effect-run-result";
  results: Array<{ effectId: string; status: "verified"; targetPath: VaultRelativePath; afterDigest: Digest }>;
}

export interface EffectReceipt {
  artifactKind: "engine.navigation-effect-receipt";
  effectsContract: typeof NAVIGATION_EFFECTS_CONTRACT_VERSION;
  receiptId: string;
  effectId: string;
  status: "committed" | "no-op" | "stale" | "denied" | "conflict" | "recovery-required" | "aborted";
  operation: EffectOperation;
  targetPath: VaultRelativePath;
  planDigest: Digest;
  beforeDigest?: Digest;
  afterDigest?: Digest;
  archiveManifestDigest?: Digest;
  journalEntryDigest: Digest;
  authorityDigest: Digest;
  policyRef: EffectsPolicyRef;
  occurredAt: string;
  reasonCodes: string[];
  sourceContentIncluded: false;
}

export type RecoveryClassification =
  | "effect-absent-retryable"
  | "effect-present-verified"
  | "conflicting-external-bytes"
  | "ambiguous-or-corrupt";

export interface RecoveryResult {
  artifactKind: "engine.navigation-effect-recovery-result";
  effectsContract: typeof NAVIGATION_EFFECTS_CONTRACT_VERSION;
  effectId: string;
  classification: RecoveryClassification;
  writeCapabilityMayEnable: boolean;
  reasonCodes: string[];
  observed: {
    targetDigest?: Digest;
    temporaryDigest?: Digest;
    archiveBeforeDigest?: Digest;
    proposedDigest: Digest;
  };
}

export type AgentCapability = "note:create" | "note:update" | "note:append" | "note:archive";

export interface AgentGrant {
  agentId: string;
  displayName: string;
  credentialId: string;
  allowedRoot: VaultRelativePath;
  capabilities: AgentCapability[];
  sensitivityCeiling: string;
  maxNoteBytes: number;
  maxWritesPerMinute: number;
  expiresAt?: string;
  enabled: boolean;
  policyRef: EffectsPolicyRef;
}

export interface AgentWriteRequest {
  requestId: string;
  operation: Extract<EffectOperation, `agent-note:${string}`>;
  noteName?: string;
  noteUid?: string;
  expectedDigest?: Digest;
  proposedBytes?: string;
  idempotencyKey: string;
}

export interface AgentWriteConflict {
  artifactKind: "engine.agent-write-conflict";
  requestId: string;
  status: "conflict";
  targetRef: { noteUid?: string; relativeName?: string };
  expectedDigest?: Digest;
  currentDigest?: Digest;
  reasonCodes: string[];
  currentContentIncluded: false;
}

export interface AgentWriteResult {
  artifactKind: "engine.agent-write-result";
  requestId: string;
  status: "planned" | "committed" | "no-op" | "stale" | "denied" | "conflict" | "recovery-required";
  effectId?: string;
  receiptId?: string;
  noteUid?: string;
  targetName?: string;
  currentDigest?: Digest;
  reasonCodes: string[];
  contentIncluded: false;
}

export interface EffectExecutionRequest {
  plan: NavigationEffectPlan;
  proposedBytes: string;
}

export type MocApplyPlanningResult =
  | {
      status: "planned";
      plan: NavigationEffectPlan;
      planDigest: Digest;
      proposedBytes: string;
      preservedHumanPrefix: string;
      preservedHumanSuffix: string;
      reasonCodes: string[];
    }
  | {
      status: "no-op" | "stale" | "denied" | "review-required";
      targetPath: VaultRelativePath;
      currentDigest?: Digest;
      proposedDigest?: Digest;
      reasonCodes: string[];
    };

export interface EffectExecutionResult {
  status: "committed" | "no-op" | "stale" | "denied" | "conflict" | "recovery-required" | "aborted";
  effectId: string;
  receipt?: EffectReceipt;
  reasonCodes: string[];
}

export interface NavigationEffectsCapabilities {
  navigation_effects_contract: typeof NAVIGATION_EFFECTS_CONTRACT_VERSION;
  configured: {
    adapter: boolean;
    authority_provider: boolean;
    durable_journal: boolean;
    policy: boolean;
  };
  navigation_effects: {
    plan_moc_apply: true;
    apply_managed_moc: boolean;
    archive_previous_moc: boolean;
    atomic_replace: boolean;
    startup_recovery: boolean;
    rollback_execution: boolean;
    agent_note_create: boolean;
    agent_note_update: boolean;
    agent_note_archive: boolean;
    arbitrary_source_write: false;
    agent_note_delete: false;
  };
}
