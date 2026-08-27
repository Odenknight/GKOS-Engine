/** Generic, product-neutral admission-policy provider contract. */

export const ADMISSION_POLICY_CONTRACT = "gkos.admission-policy.v1" as const;
export const ADMISSION_POLICY_CONTRACT_VERSION = "1.0.0" as const;

export const SUBSTANTIVE_ADMISSION_DISPOSITIONS = [
  "AUTO_ADMIT_DERIVED",
  "HUMAN_REVIEW",
  "PRIORITY_HUMAN_REVIEW",
] as const;

export const ADMISSION_OUTCOMES = [
  ...SUBSTANTIVE_ADMISSION_DISPOSITIONS,
  "REVIEW_INVALID",
] as const;

export type SubstantiveAdmissionDisposition = typeof SUBSTANTIVE_ADMISSION_DISPOSITIONS[number];
export type AdmissionOutcome = typeof ADMISSION_OUTCOMES[number];
export type AdmissionStage = "PRE_ADJUDICATION" | "ADJUDICATION";
export type ReviewerRecommendedLane = "AUTO_ADMIT_CANDIDATE" | "HUMAN_REVIEW" | "PRIORITY_HUMAN_REVIEW";

export interface AdmissionSchemaHashesV1 {
  request: string;
  policy: string;
  decisionReceipt: string;
}

export interface AdmissionProviderIdentityV1 {
  id: string;
  version: string;
  digest: string;
}

export interface AdmissionEngineIdentityV1 {
  name: string;
  version: string;
  commit: string;
}

export interface AdmissionDependencyV1 {
  id: string;
  version: string;
  digest: string;
}

export interface AdmissionPolicyBundleV1 {
  schema: "gkos.admission-policy.policy.v1";
  contract: typeof ADMISSION_POLICY_CONTRACT;
  contractVersion: typeof ADMISSION_POLICY_CONTRACT_VERSION;
  policyId: string;
  policyVersion: string;
  provider: AdmissionProviderIdentityV1;
  engine: AdmissionEngineIdentityV1;
  schemaHashes: AdmissionSchemaHashesV1;
  reasonCodesHash: string;
  semanticRulesHash: string;
  dependencyClosure: AdmissionDependencyV1[];
  priorityTriggerCodes: string[];
  humanReviewTriggerCodes: string[];
  autoAllowlist: string[];
}

export interface AdmissionHashInputV1 {
  name: string;
  digest: string;
}

export interface AdmissionTriggerV1 {
  code: string;
  evidenceHash: string;
}

export interface AdmissionEvaluationRequestV1 {
  schema: "gkos.admission-policy.request.v1";
  contract: typeof ADMISSION_POLICY_CONTRACT;
  contractVersion: typeof ADMISSION_POLICY_CONTRACT_VERSION;
  requestId: string;
  idempotencyKey: string;
  subject: {
    id: string;
    type: string;
    contentHash: string;
  };
  policyRef: {
    id: string;
    version: string;
    digest: string;
  };
  inputHashes: AdmissionHashInputV1[];
  validity: {
    valid: boolean;
    receiptHash: string;
  };
  artifact: {
    type: string;
    reversible: boolean;
    reconstructable: boolean;
  };
  deterministicChecks: {
    receiptHash: string;
    detectedTriggers: AdmissionTriggerV1[];
  };
  reviewer: {
    assessmentHash: string;
    independent: boolean;
    conflictsWithDeterministicChecks: boolean;
    unsupportedClaimIds: string[];
    contradictionIds: string[];
    scopeMatch: boolean;
    recommendedLane: ReviewerRecommendedLane;
  };
}

export const ADMISSION_DECISION_REASON_CODES = [
  "INVALID_REQUEST_SCHEMA",
  "CONTRACT_BINDING_MISMATCH",
  "POLICY_BINDING_MISMATCH",
  "VALIDITY_GATE_FAILED",
  "UNKNOWN_TRIGGER_CODE",
  "PRIORITY_TRIGGER",
  "HUMAN_REVIEW_TRIGGER",
  "ARTIFACT_TYPE_NOT_ALLOWED",
  "REVIEWER_INDEPENDENCE_FAILED",
  "REVIEWER_CHECK_CONFLICT",
  "UNSUPPORTED_CLAIMS_PRESENT",
  "CONTRADICTION_PRESENT",
  "SCOPE_MISMATCH",
  "NOT_REVERSIBLE",
  "NOT_RECONSTRUCTABLE",
  "AUTO_ALLOWLIST_MATCH",
] as const;

export type AdmissionDecisionReasonCodeV1 = typeof ADMISSION_DECISION_REASON_CODES[number];

export interface AdmissionDecisionReceiptBodyV1 {
  schema: "gkos.admission-policy.decision-receipt.v1";
  contract: typeof ADMISSION_POLICY_CONTRACT;
  contractVersion: typeof ADMISSION_POLICY_CONTRACT_VERSION;
  requestId: string | null;
  idempotencyKey: string | null;
  subjectId: string | null;
  provider: AdmissionProviderIdentityV1;
  engine: AdmissionEngineIdentityV1;
  schemaHashes: AdmissionSchemaHashesV1;
  reasonCodesHash: string;
  semanticRulesHash: string;
  policy: {
    id: string;
    version: string;
    digest: string;
  };
  dependencyClosureHash: string;
  requestHash: string;
  inputHashes: AdmissionHashInputV1[];
  reviewerAssessmentHash: string | null;
  reviewerRecommendedLane: ReviewerRecommendedLane | null;
  stage: AdmissionStage;
  outcome: AdmissionOutcome;
  reasonCodes: AdmissionDecisionReasonCodeV1[];
  triggerCodes: string[];
  validationIssues: string[];
  authorityState: "NONE";
  materializationAuthorized: false;
}

export interface AdmissionDecisionReceiptV1 extends AdmissionDecisionReceiptBodyV1 {
  decisionReceiptHash: string;
}

export interface AdmissionPolicyValidationResult {
  valid: boolean;
  issues: string[];
}

export class AdmissionPolicyConfigurationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid admission-policy configuration: ${issues.join(", ")}`);
    this.name = "AdmissionPolicyConfigurationError";
    this.issues = [...issues];
  }
}
