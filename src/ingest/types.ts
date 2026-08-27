import type {
  GkxRetrievalCandidateChunk,
  GkxRetrievalCandidateDeclaration,
  GkxRetrievalCandidateSource,
} from "../retrieval/candidate-types";
import type { GkxRetrievalProjectedSource } from "../retrieval/gkx-provenance";
import type { AnyRetrievalProjectionManifest, GkxRetrievalProjectionManifest } from "../retrieval/types";
import type { SqliteLexicalBackend } from "../retrieval/types";
import type { IngestFindingCode } from "./contracts";

export type IngestFindingSeverity = "info" | "warning" | "error" | "critical";
export type IngestFindingClassification = "intrinsic" | "cross_record_report_only";
export type IngestFindingScope = "file" | "frontmatter" | "field" | "corpus";
export type IngestCoordinateBasis = "file_observation" | "document_line" | "frontmatter_field" | "missing_field" | "corpus";

export interface IngestProfileCoordinate {
  contract_version: "gkos-frontmatter-profile-coordinate/1.0.0-draft.1";
  selector_id: "gkos:frontmatter-profile/current" | "operator-overlay";
  profile_id: string;
  standard_commit: string;
  standard_frontmatter_schema_sha256: string;
  standard_common_defs_sha256: string;
  standard_diagnostics_sha256: string;
  engine_projection_profile: "gkx-2.3-validating-projection";
  engine_policy_id: string;
  engine_policy_hash: string;
  overlay_sha256: string | null;
  effective_profile_digest: string;
}

export interface IngestNormalizedProfileEnvelope {
  contract_version: "gkos-frontmatter-profile-effective/1.0.0-draft.1";
  profile_id: string;
  standard_commit: string;
  standard_frontmatter_schema_sha256: string;
  standard_common_defs_sha256: string;
  standard_diagnostics_sha256: string;
  engine_projection_profile: "gkx-2.3-validating-projection";
  engine_policy_id: string;
  engine_policy_hash: string;
  required_fields: readonly string[];
  unknown_fields: "allow" | "warn" | "reject";
  minimum_sensitivity: "public" | "internal" | "restricted" | "confidential" | "regulated" | "phi" | "secret";
  identity_rules: {
    stable_authored_uid_required: true;
    uid_syntax_authority: "canonical_gkx_parser";
    path_is_identity: false;
    duplicate_uid_or_path: "cross_record_report_only";
    identity_mutation_or_defaulting: false;
  };
  relationship_rules: {
    declaration_syntax_authority: "canonical_gkx_parser_receipts";
    malformed_authored_reference: "intrinsic";
    endpoint_resolution_and_topology: "cross_record_report_only";
    ordinary_markdown_or_wikilink_unresolved: "non_conflicting";
    second_resolution_pass: false;
  };
  severity: readonly {
    code: string;
    severity: IngestFindingSeverity;
  }[];
  fields: readonly {
    field: string;
    type: "string" | "boolean" | "integer" | "array<string>";
    required: boolean;
    min_length: number | null;
    max_length: number | null;
    integer_minimum: number | null;
    integer_maximum: number | null;
    array_max_items: number | null;
    array_item_max_length: number | null;
    enum: readonly string[] | null;
    extension: boolean;
  }[];
}

export interface IngestFinding {
  contract_version: "gkos-ingest-finding/1.0.0-draft.1";
  finding_id: string;
  code: IngestFindingCode;
  severity: IngestFindingSeverity;
  classification: IngestFindingClassification;
  scope: IngestFindingScope;
  coordinate_basis: IngestCoordinateBasis;
  source_path: string | null;
  /** Unique zero-based occurrence within source_path; null only for corpus findings. */
  source_observation_ordinal: number | null;
  line: number | null;
  field: string | null;
  deterministic: true;
}

export interface IngestRejection {
  contract_version: "gkos-ingest-rejection/1.0.0-draft.1";
  /** Zero-based occurrence in the complete physical observation set for source_path. */
  source_observation_ordinal: number;
  source_path: string;
  source_digest: string | null;
  source_size_bytes: number | null;
  canonical_assertion_time: string | null;
  canonical_valid_from: string | null;
  effective_sensitivity: "secret";
  findings: readonly IngestFinding[];
  profile: IngestProfileCoordinate;
  rejection_digest: string;
}

export interface IngestSourceObservation {
  contract_version: "gkos-ingest-source-observation/1.0.0-draft.1";
  source_observation_ordinal: number;
  source_path: string;
  source_digest: string | null;
  source_size_bytes: number | null;
  classification: "accepted" | "rejected";
  finding_ids: readonly string[];
  intrinsic_blocking_finding_ids: readonly string[];
}

export interface IngestValidationResult {
  contract_version: "gkos-ingest-validation/1.0.0-draft.1";
  status: "valid" | "invalid";
  corpus_valid: boolean;
  ingest_intrinsic_valid: boolean;
  profile: IngestProfileCoordinate;
  normalized_profile: IngestNormalizedProfileEnvelope;
  summary: {
    observed_source_count: number;
    valid_source_count: number;
    rejected_source_count: number;
    findings: Record<IngestFindingSeverity, number>;
  };
  findings: readonly IngestFinding[];
  observations: readonly IngestSourceObservation[];
  rejections: readonly IngestRejection[];
}

export interface IngestValidationPlan {
  result: IngestValidationResult;
  accepted_sources: readonly GkxRetrievalProjectedSource[];
  accepted_declarations: readonly GkxRetrievalCandidateDeclaration[];
  observation_snapshot_digest: string;
}

export type IngestIndexMode = "strict" | "non_strict";

export interface IngestChunkingCoordinate {
  chunker_version: "gkos-heading-chunker/1";
  tokenizer_version: "gkos-ascii-whitespace/1";
  max_tokens: number;
  overlap_tokens: number;
}

/** Opaque-capability-backed, accepted-source-only pre-provider handoff. */
export interface PreparedIngestGeneration {
  mode: IngestIndexMode;
  observation_snapshot_digest: string;
  validation_result: IngestValidationResult;
  chunking: IngestChunkingCoordinate;
  candidate_sources: readonly GkxRetrievalCandidateSource[];
  candidate_declarations: readonly GkxRetrievalCandidateDeclaration[];
  candidate_chunks: readonly GkxRetrievalCandidateChunk[];
}

export interface IngestGenerationCoordinateInput {
  state_directory: string;
  vault_id: string;
  configuration_digest: string;
  policy_digest: string;
  embedding_eligible_candidate_chunk_keys: readonly string[];
  lexical_backend: SqliteLexicalBackend;
}

export interface IngestRejectionJournal {
  contract_version: "gkos-ingest-rejection-journal/1.0.0-draft.1";
  observation_snapshot_digest: string;
  profile: IngestProfileCoordinate;
  normalized_profile: IngestNormalizedProfileEnvelope;
  rejection_count: number;
  rejections: readonly IngestRejection[];
  rejection_journal_digest: string;
}

export interface IngestInnerGenerationCoordinate {
  database_file: string;
  manifest: GkxRetrievalProjectionManifest;
  manifest_digest: string;
}

export interface IngestRejectionJournalCoordinate {
  journal_file: string;
  rejection_journal_digest: string;
  rejection_count: number;
}

export interface IngestOwnerGenerationManifest {
  contract_version: "gkos-ingest-generation/1.0.0-draft.1";
  owner_generation_id: string;
  owner_manifest_digest: string;
  mode: IngestIndexMode;
  vault_id: string;
  observation_snapshot_digest: string;
  profile: IngestProfileCoordinate;
  normalized_profile: IngestNormalizedProfileEnvelope;
  configuration_digest: string;
  policy_digest: string;
  chunking: IngestChunkingCoordinate;
  validation_result: IngestValidationResult;
  inner: IngestInnerGenerationCoordinate;
  rejection_journal: IngestRejectionJournalCoordinate;
}

/** Public-safe projection coordinate carried by the sole active pointer. */
export interface IngestActiveProjectionCoordinate {
  database_file: string;
  manifest_digest: string;
  projection_id: string;
  projection_digest: string;
}

export interface IngestActivePointer {
  contract_version: "gkos-ingest-active-pointer/1.0.0-draft.1";
  owner_generation_file: string;
  owner_generation_id: string;
  owner_manifest_digest: string;
  inner: IngestActiveProjectionCoordinate;
}

export interface IngestLegacyPriorActive {
  kind: "legacy";
  projection_id: string;
  projection_digest: string;
  pointer_digest: string;
}

export interface IngestOwnerPriorActive {
  kind: "ingest";
  owner_generation_id: string;
  owner_manifest_digest: string;
  inner: IngestActiveProjectionCoordinate;
  pointer_digest: string;
}

export type IngestPriorActive = IngestLegacyPriorActive | IngestOwnerPriorActive | null;

export interface IngestBlockedAttemptStatus {
  contract_version: "gkos-ingest-attempt-status/1.0.0-draft.1";
  state: "blocked";
  availability: "stale" | "unavailable";
  prior_active: IngestPriorActive;
  attempt_digest: string;
  effective_profile_digest: string;
  observation_snapshot_digest: string;
  status_digest: string;
}

export interface IngestIndexSummary {
  observed_source_count: number;
  valid_source_count: number;
  rejected_source_count: number;
  findings: Record<IngestFindingSeverity, number>;
}

export interface IngestIndexBlockedAttemptCoordinate {
  attempt_digest: string;
  status_digest: string;
}

/** Path-free authoritative machine outcome for the later CLI adapter. */
export interface IngestIndexResult {
  contract_version: "gkos-ingest-index-result/1.0.0-draft.1";
  status: "published" | "published_with_rejections" | "blocked_strict" | "operational_failure";
  mode: IngestIndexMode;
  summary: IngestIndexSummary | null;
  active: IngestPriorActive;
  blocked_attempt: IngestIndexBlockedAttemptCoordinate | null;
}

export interface IngestMigrationRecord {
  contract_version: "gkos-ingest-migration/1.0.0-draft.1";
  target_owner_generation_id: string;
  target_owner_manifest_digest: string;
  legacy_pointer: { database_file: string; manifest: AnyRetrievalProjectionManifest } | null;
  legacy_pointer_digest: string | null;
  migration_digest: string;
}

export interface IngestLegacyPointerTombstone {
  contract_version: "gkos-ingest-legacy-pointer-tombstone/1.0.0-draft.1";
  target_owner_generation_id: string;
  target_owner_manifest_digest: string;
  migration_file: string;
  migration_digest: string;
  tombstone_digest: string;
}

export interface IngestAuthorityWitness {
  contract_version: "gkos-ingest-authority-witness/1.0.0-draft.1";
  state: "activating" | "active";
  first_owner_generation_id: string;
  first_owner_manifest_digest: string;
  first_inner: IngestActiveProjectionCoordinate;
  migration_file: string;
  migration_digest: string;
  legacy_pointer_digest: string | null;
  tombstone_digest: string;
  active_pointer_digest: string;
  authority_lock_digest: string;
  activation_root_digest: string;
  witness_digest: string;
}

export interface IngestActivationRoot {
  contract_version: "gkos-ingest-activation-root/1.0.0-draft.1";
  first_owner_generation_id: string;
  first_owner_manifest_digest: string;
  first_inner: IngestActiveProjectionCoordinate;
  migration_file: string;
  migration_digest: string;
  legacy_pointer_digest: string | null;
  tombstone_digest: string;
  active_pointer_digest: string;
  authority_lock_digest: string;
  activation_root_digest: string;
}

export interface IngestAuthorityLock {
  contract_version: "gkos-ingest-authority-lock/1.0.0-draft.1";
  lock_id: string;
  process_id: number;
  prior_active: IngestPriorActive;
  prior_authority_digest: string;
  operation: "preflight" | "activation" | "blocked";
  target: {
    kind: "activation";
    owner_generation_id: string;
    owner_manifest_digest: string;
    inner: IngestActiveProjectionCoordinate;
    pointer_digest: string;
  } | {
    kind: "blocked";
    status_digest: string;
  } | null;
  lock_digest: string;
}

export interface IngestOpenedGeneration {
  source: "legacy" | "ingest";
  database_path: string;
  active: Exclude<IngestPriorActive, null>;
  owner_manifest: IngestOwnerGenerationManifest | null;
  blocked_attempt: {
    status: IngestBlockedAttemptStatus;
    applicable: boolean;
  } | null;
}

export interface IngestOwnerState {
  active_generation: IngestOpenedGeneration | null;
  blocked_attempt: {
    status: IngestBlockedAttemptStatus;
    applicable: boolean;
  } | null;
}

export interface IngestScanRejectionInput {
  source_path: string;
  source_digest: string | null;
  size: number | null;
  classification: "rejected";
  reason_codes: readonly string[];
}

export interface IngestValidationInput {
  files: readonly {
    relativePath: string;
    name?: string;
    extension?: string;
    /** Exact observed UTF-8 byte length; never inferred from UTF-16 length. */
    size: number;
    modifiedTime?: number;
    createdTime?: number;
    content: string;
    kind?: "note";
  }[];
  folders?: readonly string[];
  attachments?: readonly string[];
  scan_rejections?: readonly IngestScanRejectionInput[];
}
