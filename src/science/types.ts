import type { GkxDiagnostic, GkxOrigin, GkxSensitivity } from "../types";

/** Draft identifier. It is an Engine capability label, not an adopted GKOS profile. */
export const EXPERIMENTAL_SRTP_PROFILE = "SRTP-DRAFT-0.1" as const;

export type ScientificRecordKind =
  | "scientific_research_object"
  | "dataset_snapshot"
  | "environment_snapshot"
  | "execution_request"
  | "execution_event"
  | "execution_manifest"
  | "artifact_record"
  | "reviewer_finding"
  | "scientific_result"
  | "negative_result"
  | "rerun_comparison"
  | "reentry_receipt";

export interface ScientificRecordBase {
  id: string;
  kind: ScientificRecordKind;
  profile: typeof EXPERIMENTAL_SRTP_PROFILE;
  schemaVersion: "experimental";
  createdAt: string;
  updatedAt?: string;
  sensitivity: GkxSensitivity;
  origin: GkxOrigin;
  /** Unknown provider fields are retained here and never acquire authority. */
  extensions: Record<string, unknown>;
}

export interface ScientificResearchObject extends ScientificRecordBase {
  kind: "scientific_research_object";
  title?: string;
  sourceRefs: string[];
  codeRefs: string[];
  datasetRefs: string[];
  contextRef?: string;
  authorizationRef?: string;
}

export interface DatasetSnapshot extends ScientificRecordBase {
  kind: "dataset_snapshot";
  digest: string;
  sourceRef?: string;
  mediaType?: string;
}

export interface EnvironmentSnapshot extends ScientificRecordBase {
  kind: "environment_snapshot";
  digest: string;
  lockfileRefs: string[];
}

export interface ExecutionRequest extends ScientificRecordBase {
  kind: "execution_request";
  inputRefs: string[];
  codeRefs: string[];
  environmentRef?: string;
  parameters?: Record<string, unknown>;
  parametersDigest?: string;
  seed?: string | number | null;
  contextRef?: string;
  authorizationRef?: string;
}

export type ExecutionEventType = "opened" | "started" | "progress" | "artifact" | "completed" | "failed" | "closed";

export interface ExecutionEvent extends ScientificRecordBase {
  kind: "execution_event";
  runId: string;
  requestRef: string;
  sequence: number;
  eventType: ExecutionEventType;
  timestamp: string;
  previousDigest?: string | null;
  digest: string;
  artifactRefs: string[];
  artifactDigests?: Record<string, string>;
}

export interface ExecutionManifest extends ScientificRecordBase {
  kind: "execution_manifest";
  /** Digest of the persisted manifest bytes, used by re-entry binding. */
  digest: string;
  requestRef: string;
  eventRefs: string[];
  inputRefs: string[];
  codeRefs: string[];
  inputDigests?: Record<string, string>;
  codeDigests?: Record<string, string>;
  environmentRef?: string;
  environmentDigest?: string;
  parameters?: Record<string, unknown>;
  seed?: string | number | null;
  rootEventDigest?: string;
  finalEventDigest?: string;
  status: "open" | "completed" | "failed" | "closed";
  artifactRefs: string[];
  artifactDigests?: Record<string, string>;
  contextRef?: string;
  authorizationRef?: string;
}

export interface ArtifactRecord extends ScientificRecordBase {
  kind: "artifact_record";
  digest: string;
  producingEventRef?: string;
  runRef?: string;
  codeRefs: string[];
  inputRefs: string[];
  environmentRef?: string;
  codeDigests?: Record<string, string>;
  inputDigests?: Record<string, string>;
  environmentDigest?: string;
  mediaType?: string;
  bytesAvailable?: boolean;
}

export interface ReviewerFinding extends ScientificRecordBase {
  kind: "reviewer_finding";
  targetRef: string;
  reviewerRef: string;
  finding: string;
  disposition?: "open" | "accepted" | "rejected" | "resolved";
  decidedByRef?: string;
}

export interface ScientificResult extends ScientificRecordBase {
  kind: "scientific_result";
  runRef: string;
  artifactRefs: string[];
  sourceRefs: string[];
  citationRefs: string[];
  numericTraceRefs: string[];
  reviewRefs: string[];
  conclusion?: string;
}

export interface NegativeResult extends ScientificRecordBase {
  kind: "negative_result";
  runRef: string;
  artifactRefs: string[];
  sourceRefs: string[];
  reviewRefs: string[];
  reason?: string;
  preserved: boolean;
}

export type ScientificAssessmentStatus = "PASS" | "FAIL" | "UNEVALUATED" | "NOT_APPLICABLE" | "INDETERMINATE";

export interface ScientificComponentResult {
  status: ScientificAssessmentStatus;
  diagnostics: GkxDiagnostic[];
  evidenceRefs: string[];
}

export interface RerunComponentComparison extends ScientificComponentResult {
  component: string;
  comparison: "exact" | "numeric_tolerance" | "declared_nondeterministic" | "unavailable";
  expected?: unknown;
  actual?: unknown;
  difference?: number;
  tolerance?: number;
}

export interface RerunComparison extends ScientificRecordBase {
  kind: "rerun_comparison";
  origin: "proposed";
  runARef: string;
  runBRef: string;
  policyId: string;
  components: RerunComponentComparison[];
  overall: ScientificAssessmentStatus;
}

export interface DigestBinding {
  id: string;
  digest: string;
}

export interface ReentryReceipt extends ScientificRecordBase {
  kind: "reentry_receipt";
  authorizedUse: DigestBinding;
  contextManifest: DigestBinding;
  executionManifest: DigestBinding;
  outputs: DigestBinding[];
}

export type ScientificRecord =
  | ScientificResearchObject
  | DatasetSnapshot
  | EnvironmentSnapshot
  | ExecutionRequest
  | ExecutionEvent
  | ExecutionManifest
  | ArtifactRecord
  | ReviewerFinding
  | ScientificResult
  | NegativeResult
  | RerunComparison
  | ReentryReceipt;

export interface ScientificTraceNode {
  id: string;
  kind: ScientificRecordKind;
  record: ScientificRecord;
}

export interface ScientificTraceEdge {
  source: string;
  target: string;
  type: string;
  resolved: boolean;
  /** Actor, context, or authorization binding resolved outside this record graph. */
  external?: boolean;
}

export interface ScientificTraceSummary {
  nodeCount: number;
  edgeCount: number;
  unresolvedReferences: number;
  ambiguousIdentities: number;
  negativeResults: number;
}

export interface ScientificTraceManifest {
  profile: typeof EXPERIMENTAL_SRTP_PROFILE;
  traceId: string;
  nodes: ScientificTraceNode[];
  edges: ScientificTraceEdge[];
  diagnostics: GkxDiagnostic[];
  summary: ScientificTraceSummary;
  extensions: Record<string, unknown>;
}

export type ScientificAssessmentComponent =
  | "sourceCompleteness"
  | "reproducibilityBindings"
  | "eventChainIntegrity"
  | "artifactTraceability"
  | "numericCitationTraceability"
  | "reviewDispositionCompleteness"
  | "reentryCompleteness"
  | "negativeResultPreservation"
  | "rerunEvidence"
  | "contextAuthorizationLinkage";

export interface ScientificTraceAssessment {
  profile: typeof EXPERIMENTAL_SRTP_PROFILE;
  traceId: string;
  policyId: string;
  components: Record<ScientificAssessmentComponent, ScientificComponentResult>;
  overall: ScientificAssessmentStatus;
  diagnostics: GkxDiagnostic[];
  interpretation: "trace-completeness-and-binding-not-scientific-truth";
  extensions: Record<string, unknown>;
}

export interface ScientificValidationOptions {
  /** Required on parsing/validation to acknowledge that SRTP is not normative. */
  experimentalScienceProfile: true;
  allowedProfiles?: readonly string[];
}

export interface ScientificValidationResult {
  valid: boolean;
  diagnostics: GkxDiagnostic[];
}

export interface ExecutionEventChainVerification extends ScientificComponentResult {
  manifestId: string;
  verifiedManifestCanonical: string;
  verifiedEventsCanonical: string;
  calculatedRootDigest?: string;
  calculatedFinalDigest?: string;
  orderedEventIds: string[];
}

export interface ArtifactBindingVerification extends ScientificComponentResult {
  artifactId: string;
  traceId: string;
  verifiedArtifactCanonical: string;
  verifiedProducerCanonical?: string;
  verifiedRunCanonical?: string;
  producingEventRef?: string;
  runRef?: string;
}

export interface ReentryVerification extends ScientificComponentResult {
  receiptId: string;
  verifiedReceiptCanonical: string;
  omittedOutputs: string[];
  unexpectedOutputs: string[];
}

export interface ScientificAssessmentPolicy {
  id: string;
  mandatoryComponents?: ScientificAssessmentComponent[];
  /** Explicit verifier results. Presence of fields alone never implies verification. */
  verificationEvidence?: {
    eventChains?: readonly ExecutionEventChainVerification[];
    artifactBindings?: readonly ArtifactBindingVerification[];
    reentryReceipts?: readonly ReentryVerification[];
  };
}

export interface RerunComparisonPolicy {
  id: string;
  numericTolerance?: number | Record<string, number>;
  nondeterministicComponents?: string[];
}
