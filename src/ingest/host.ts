/** Trusted owner-plane Phase-3 ingest validation surface; not package-exported. */
export * from "./contracts";
export type * from "./types";
export {
  classifyIngestProfileLoadError,
  loadIngestProfile,
  sealNormalizedIngestProfileEnvelope,
  validateIngestProfileLocalSelector,
} from "./profile";
export {
  sealIngestFindingEnvelope,
  sealIngestProfileCoordinate,
  sealIngestRejectionEnvelope,
  sealIngestValidationResultEnvelope,
} from "./envelopes";
export { assertIngestValidationPlan, buildIngestValidationPlan } from "./validation";
export {
  activateStagedGkxIngestGeneration,
  hasActivatedIngestRetrievalAuthority,
  shouldOpenExistingIngestRetrievalAuthority,
  openActiveIngestGeneration,
  openIngestOwnerState,
  preflightIngestAuthority,
  preflightIngestVaultRoot,
  prepareValidatedGkxIngestGeneration,
  recordBlockedIngestAttempt,
  recoverStaleIngestAuthorityLock,
  releaseIngestAuthorityPreflight,
  sealIngestBlockedAttemptStatusEnvelope,
  sealIngestIndexResultEnvelope,
  sealActivePointer as sealIngestActivePointerEnvelope,
  sealActivationRoot as sealIngestActivationRootEnvelope,
  sealAuthorityLock as sealIngestAuthorityLockEnvelope,
  sealMigrationRecord as sealIngestMigrationRecordEnvelope,
  sealIngestOwnerGenerationManifestEnvelope,
  sealIngestRejectionJournalEnvelope,
  sealTombstone as sealIngestLegacyPointerTombstoneEnvelope,
  sealWitness as sealIngestAuthorityWitnessEnvelope,
  stageValidatedGkxIngestGeneration,
} from "./storage";
export type {
  IngestActivationBoundary,
  IngestActivationOptions,
  IngestAuthorityPreflight,
  IngestAuthorityPreflightOptions,
  IngestBlockedAttemptBoundary,
  IngestBlockedAttemptOptions,
  IngestStaleLockRecoveryOptions,
  IngestVaultRootPreflight,
  StagedIngestGeneration,
} from "./storage";
