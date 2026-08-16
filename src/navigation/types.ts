import type { ActorRef, DeferredReviewItem, DurabilityVerification, StateChangeReceiptRole } from "../governance";
import type { GraphDelta } from "../types";

export const NAVIGATION_CONTRACT_VERSION = "1.0.0" as const;

export interface NavigationPolicyRef {
  id: string;
  version: string;
  digest?: string;
}

export interface NavigationRelationship {
  kind: string;
  targetStableId?: string;
  targetPath?: string;
}

export interface NavigationSource {
  relativePath: string;
  content: string;
  stableId?: string;
  version?: string;
  digest?: string;
  title?: string;
  sensitivity?: string;
  relationships?: readonly NavigationRelationship[];
}

export interface NavigationSnapshot {
  vaultId: string;
  sources: readonly NavigationSource[];
  directories?: readonly string[];
}

export interface VaultNavigationConfig {
  configId: string;
  version: number;
  vaultId: string;
  promotedMocNames: string[];
  createdAt: string;
  createdBy: string;
  priorConfigDigest?: string;
  policy: NavigationPolicyRef;
  digest: string;
}

export type VaultNavigationConfigInput = Omit<VaultNavigationConfig, "digest" | "promotedMocNames"> & {
  promotedMocNames: readonly string[];
};

export interface MocPromotionProposal {
  proposalId: string;
  operationId: string;
  vaultId: string;
  observedName: string;
  normalizedName: string;
  observedPaths: string[];
  proposedBy: ActorRef;
  proposedAt: string;
  requiresHumanAcceptance: true;
  sourceContentEffect: "none";
}

export type MocClassification = "directory" | "semantic" | "operational";
export type MocManagement = "managed" | "hybrid" | "unmanaged";
export type MocNameStanding = "built-in" | "promoted" | "noncanonical-like" | "ordinary";

export interface MocEvidence {
  code: string;
  value?: string | number | boolean;
}

export interface NavigationFinding {
  code: string;
  severity: "error" | "warning" | "info";
  path: string;
  message: string;
  observedName?: string;
  action?: "flag" | "review" | "regenerate";
  autoFix: false;
}

export interface NavigationEntry {
  path: string;
  observedFilename: string;
  directory: string;
  basename: string;
  stableId: string | null;
  title: string;
  recognizedMocName: boolean;
  nameStanding: MocNameStanding;
  classification: MocClassification;
  management: MocManagement;
  evidence: MocEvidence[];
}

export interface NavigationDiscovery {
  navigationContract: typeof NAVIGATION_CONTRACT_VERSION;
  vaultId: string;
  configRef: { id: string; version: number; digest: string };
  effectiveMocNames: string[];
  entries: NavigationEntry[];
  findings: NavigationFinding[];
}

export interface NavigationCandidate {
  artifactKind: "engine.moc-candidate";
  candidateId: string;
  directory: string;
  targetPath: string;
  candidateBytes: string;
  digest: string;
  sourceSnapshotDigest: string;
  configRef: { id: string; version: number; digest: string };
  policy: NavigationPolicyRef;
  sourceRefs: Array<{ id?: string; path: string; version?: string; digest: string }>;
}

export interface NavigationCandidateGeneration {
  artifactKind: "engine.navigation-candidate-set";
  navigationContract: typeof NAVIGATION_CONTRACT_VERSION;
  engineVersion: string;
  sourceSnapshotDigest: string;
  configRef: { id: string; version: number; digest: string };
  candidates: NavigationCandidate[];
  classifications: NavigationEntry[];
  findings: NavigationFinding[];
}

export interface MocRunManifest {
  artifactKind: "engine.moc-run-manifest";
  gkosContextManifest: false;
  runId: string;
  startedAt: string;
  completedAt: string;
  engineVersion: string;
  navigationContract: typeof NAVIGATION_CONTRACT_VERSION;
  sourceSnapshotDigest: string;
  vaultNavigationConfig: { id: string; version: number; digest: string; effectivePromotedNames: string[] };
  policies: NavigationPolicyRef[];
  candidateArtifacts: Array<{ candidateId: string; digest: string }>;
  warnings: NavigationFinding[];
  omissions: string[];
  capabilities: NavigationCapabilities;
}

export type NavigationDiffReason =
  | "MOVE_STABLE_ID"
  | "MOVE_EXACT_CONTENT"
  | "CONTENT_CHANGED"
  | "RELATIONSHIP_CHANGED"
  | "ORDER_CHANGED"
  | "MANAGED_REGION_CHANGED"
  | "HUMAN_REGION_CHANGED"
  | "ADDED"
  | "REMOVED"
  | "POLICY_CHANGED"
  | "CONFIG_CHANGED";

export interface NavigationDiffItem {
  reason: NavigationDiffReason;
  identityEvidence: "stable-id" | "exact-content-observation" | "none";
  stableId?: string;
  fromPath?: string;
  toPath?: string;
  beforeDigest?: string;
  afterDigest?: string;
}

export interface NavigationDiff {
  artifactKind: "engine.navigation-diff";
  items: NavigationDiffItem[];
  text: string;
}

export interface DiscoverableObjectRef {
  id: string;
  path: string;
  sensitivity: string;
  kind: "source";
}

export interface DiscoverabilityPolicy {
  id: string;
  version: string;
  canDiscover(input: { recipient: ActorRef; purpose: string; object: DiscoverableObjectRef }): "allow" | "deny" | "indeterminate";
}

export interface NavigationContextRequest {
  recipient: ActorRef;
  purpose: string;
  itemBudget: number;
  tokenBudget: number;
  generationPolicy: NavigationPolicyRef;
}

export interface NavigationContextEntry {
  id: string;
  path: string;
  version?: string;
  digest: string;
  title: string;
  content: string;
  sensitivity: string;
  relationships: NavigationRelationship[];
}

export interface NavigationContextPack {
  artifact_kind: "engine.navigation-context-pack";
  gkos_context_manifest: false;
  navigation_contract: typeof NAVIGATION_CONTRACT_VERSION;
  engine_version: string;
  recipient: ActorRef;
  purpose: string;
  generation_policy: NavigationPolicyRef;
  budget: { items: number; tokens: number; usedItems: number; usedTokens: number };
  entries: NavigationContextEntry[];
  omissions: Array<{ id: string; reason: "item-budget" | "token-budget" }>;
  warnings: string[];
  canonicalBytes: string;
  digest: string;
}

export interface ReentryPredecessorRef {
  stableId: string;
  version: string;
  digest: string;
  path?: string;
}

export interface ReentryIncomingArtifact {
  bytes: string;
  sourceId: string;
  sourceVersion: string;
  path: string;
  acquiredAt: string;
  acquiredBy: ActorRef;
  acquisitionMethod: string;
}

export interface ReentryPolicy {
  id: string;
  version: string;
  digest?: string;
}

export interface ExplicitSupersessionRequest {
  requested: true;
  declarationId: string;
  declaredBy: ActorRef;
  authorityRef?: string;
  delegationRef?: string;
}

export interface ReentryUnsafeRequests {
  mergeIntoPredecessor?: boolean;
  mutatePredecessor?: boolean;
  inheritStanding?: boolean;
  inferSupersession?: boolean;
  disposePredecessor?: boolean;
}

export interface ReentryPlan {
  artifactKind: "engine.reentry-plan";
  status: "planned" | "rejected";
  policy: ReentryPolicy;
  predecessorRef: ReentryPredecessorRef;
  sourceProposal: null | {
    layer: "L1";
    stableId: string;
    version: string;
    digest: string;
    path: string;
    bytes: string;
    provenance: { acquiredAt: string; acquiredBy: ActorRef; acquisitionMethod: string };
    inheritedStanding: false;
  };
  supersessionProposal: null | {
    semanticEffect: "explicit-proposal-only";
    predecessorRef: ReentryPredecessorRef;
    successorRef: { stableId: string; version: string; digest: string };
    declarationId: string;
    declaredBy: ActorRef;
    authorityRef?: string;
    delegationRef?: string;
  };
  predecessorMutation: false;
  predecessorDisposition: null;
  diagnostics: string[];
}

export type MajorDecision = "routine" | "major" | "indeterminate";

export interface SupersessionProposal {
  operationId: string;
  explicitDeclaration: true;
  actor: ActorRef;
  vaultId: string;
  objectClass: string;
  predecessor: { id: string; version: string; digest: string };
  successor: { id: string; version: string; digest: string };
}

export interface SupersessionDelegation {
  delegationId: string;
  version: number;
  issuer: ActorRef;
  subject: ActorRef;
  actorContractRef: string;
  provenanceRef: string;
  operation: "lineage.supersession.record";
  vaultScope: string;
  objectClassScope: string[];
  issuedAt: string;
  notBefore?: string;
  expiresAt: string;
  majorPredicate: { id: string; version: string; digest?: string };
  reviewPolicy: { id: string; version: string; dueWithinSeconds: number };
  revocationRef: string;
  originatingAuthority: {
    authorityRef: string;
    operation: "lineage.supersession.record";
    vaultScope: string;
    objectClassScope: string[];
    notBefore?: string;
    expiresAt: string;
  };
  parentGrant?: SupersessionDelegation;
}

export interface MajorPredicate {
  id: string;
  version: string;
  digest?: string;
  evaluate(proposal: SupersessionProposal): MajorDecision;
}

/** A checker cannot express a replacement classification. */
export interface CheckerEscalation {
  escalateToMajor: boolean;
  reasonCodes: string[];
  modelRef?: string;
}

export interface ReviewFreezeException {
  exceptionId: string;
  operationId: string;
  delegationId: string;
  authorizedBy: ActorRef;
  authorityRef: string;
  higherPrecedenceThan: string;
  notBefore: string;
  expiresAt: string;
  receiptId: string;
  durabilityVerification: DurabilityVerification & {
    durable: true;
    recordId: string;
    digest: string;
    transactionBinding: string;
  };
}

export interface SupersessionEvaluationOptions {
  at: string;
  checker?: CheckerEscalation;
  deferredReviews?: readonly DeferredReviewItem[];
  revokedDelegationIds?: readonly string[];
  reviewException?: ReviewFreezeException;
  receipt?: { receiptId: string; occurredAt: string };
  review?: { reviewId: string; queuedAt: string };
}

export interface SupersessionEvaluation {
  artifactKind: "engine.supersession-evaluation";
  authorized: boolean;
  effectiveDecision: MajorDecision;
  deterministicDecision: MajorDecision;
  checkerEscalated: boolean;
  reasonCodes: string[];
  proposedReceipt: StateChangeReceiptRole | null;
  deferredReview: DeferredReviewItem | null;
  sourceContentWriteAuthorized: false;
}

export type HoldDecision = "clear" | "hold" | "indeterminate" | "unavailable";
export interface RetentionHoldPolicy {
  id: string;
  version: string;
  evaluate(input: { artifactId: string; digest: string }): HoldDecision;
}
export interface RetentionHoldEvaluation {
  decision: HoldDecision;
  dispositionMayBePlanned: boolean;
  dispositionExecuted: false;
  routeHumanReview: boolean;
  policy: NavigationPolicyRef;
}

export interface NavigationInvalidationResult {
  delta: GraphDelta;
  affectedScopes: string[];
  discovery: NavigationDiscovery;
}

export interface NavigationCapabilities {
  navigation_contract: typeof NAVIGATION_CONTRACT_VERSION;
  navigation: {
    discover: true;
    classify: true;
    candidate: true;
    diff: true;
    audit: true;
    context: true;
    reentry_plan: true;
    bounded_supersession_evaluation: true;
    governance_store_adapter: true;
    apply_moc: false;
    source_content_write: false;
    archive_delete: false;
    reentry_write: false;
    rollback_execution: false;
    reentry_record: boolean;
  };
}
