import { GKX23_POLICY, GKX23_PROFILE } from "../gkx23";

export const INGEST_VALIDATION_CONTRACT_VERSION = "gkos-ingest-validation/1.0.0-draft.1" as const;
export const INGEST_FINDING_CONTRACT_VERSION = "gkos-ingest-finding/1.0.0-draft.1" as const;
export const INGEST_REJECTION_CONTRACT_VERSION = "gkos-ingest-rejection/1.0.0-draft.1" as const;
export const INGEST_SOURCE_OBSERVATION_CONTRACT_VERSION = "gkos-ingest-source-observation/1.0.0-draft.1" as const;
export const INGEST_PROFILE_CONTRACT_VERSION = "gkos-frontmatter-profile/1.0.0-draft.1" as const;
export const INGEST_NORMALIZED_PROFILE_CONTRACT_VERSION = "gkos-frontmatter-profile-effective/1.0.0-draft.1" as const;
export const INGEST_CURRENT_PROFILE_SELECTOR = "gkos:frontmatter-profile/current" as const;
export const INGEST_BUILTIN_EFFECTIVE_PROFILE_DIGEST = "sha256:9ab3b07da4cdfb584c2766762a32dc71653dffd87537ad0a4c9190e3a69015c5" as const;
export const INGEST_STANDARD_COMMIT = "a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6" as const;
export const INGEST_STANDARD_FRONTMATTER_SCHEMA_SHA256 = "sha256:eb25f75b4864a9130b2e27bdba2627e561fc79ab3a2537397bf5df024aab5ca3" as const;
export const INGEST_STANDARD_COMMON_DEFS_SHA256 = "sha256:5b58edd93a53f6b821bfc03e2e4e3955da394bfaccb72e3ff194b45115c44c98" as const;
export const INGEST_STANDARD_DIAGNOSTICS_SHA256 = "sha256:178e4801d1274da60fe029d3f326b9adbdbf0e2a2033469928022fa107427403" as const;
export const INGEST_PROFILE_MAX_BYTES = 65_536;
export const INGEST_PROFILE_MAX_LINES = 2_048;
export const INGEST_PROFILE_MAX_LINE_CODE_UNITS = 4_096;
export const INGEST_PROFILE_MAX_ASSIGNMENTS = 512;
export const INGEST_PROFILE_MAX_ARRAY_ITEMS = 256;
export const INGEST_PROFILE_MAX_STRING_CODE_UNITS = 1_024;

export const INGEST_REJECTION_JOURNAL_CONTRACT_VERSION = "gkos-ingest-rejection-journal/1.0.0-draft.1" as const;
export const INGEST_OWNER_GENERATION_CONTRACT_VERSION = "gkos-ingest-generation/1.0.0-draft.1" as const;
export const INGEST_ACTIVE_POINTER_CONTRACT_VERSION = "gkos-ingest-active-pointer/1.0.0-draft.1" as const;
export const INGEST_ATTEMPT_STATUS_CONTRACT_VERSION = "gkos-ingest-attempt-status/1.0.0-draft.1" as const;
export const INGEST_MIGRATION_CONTRACT_VERSION = "gkos-ingest-migration/1.0.0-draft.1" as const;
export const INGEST_LEGACY_TOMBSTONE_CONTRACT_VERSION = "gkos-ingest-legacy-pointer-tombstone/1.0.0-draft.1" as const;
export const INGEST_AUTHORITY_WITNESS_CONTRACT_VERSION = "gkos-ingest-authority-witness/1.0.0-draft.1" as const;
export const INGEST_AUTHORITY_LOCK_CONTRACT_VERSION = "gkos-ingest-authority-lock/1.0.0-draft.1" as const;
export const INGEST_ACTIVATION_ROOT_CONTRACT_VERSION = "gkos-ingest-activation-root/1.0.0-draft.1" as const;
export const INGEST_INDEX_RESULT_CONTRACT_VERSION = "gkos-ingest-index-result/1.0.0-draft.1" as const;

export const INGEST_AUTHORITY_COORDINATES = Object.freeze({
  standard_commit: INGEST_STANDARD_COMMIT,
  standard_frontmatter_schema: "gkx-frontmatter-2.0.schema.json",
  standard_frontmatter_schema_sha256: INGEST_STANDARD_FRONTMATTER_SCHEMA_SHA256,
  standard_common_defs: "gkx-common.defs.json",
  standard_common_defs_sha256: INGEST_STANDARD_COMMON_DEFS_SHA256,
  standard_diagnostics_sha256: INGEST_STANDARD_DIAGNOSTICS_SHA256,
  engine_projection_profile: GKX23_PROFILE,
  engine_policy_id: GKX23_POLICY.id,
  engine_policy_hash: GKX23_POLICY.hash,
});

export const INGEST_SENSITIVITY_ORDER = Object.freeze([
  "public", "internal", "restricted", "confidential", "regulated", "phi", "secret",
] as const);
export const INGEST_SEVERITY_ORDER = Object.freeze(["info", "warning", "error", "critical"] as const);
export const INGEST_UNKNOWN_FIELD_ORDER = Object.freeze(["allow", "warn", "reject"] as const);

export const INGEST_CANONICAL_FIELDS = Object.freeze([
  "gkx_version", "uid", "title", "type", "created_at", "updated_at", "authorship_origin",
  "epistemic_state", "sensitivity", "authorship", "epistemic", "provenance", "relationships",
  "evidence", "lineage", "review", "assessment", "authorization", "labels", "tags", "aliases",
  "description", "timestamp", "epistemic_state", "scope", "scope_id", "resource", "supersedes",
  "superseded_by", "supersededBy", "forked_from", "forked_to", "forked_by", "depends_on",
  "derives_from", "contradicts", "refines", "implements", "blocks", "documents", "cites", "related_to",
] as const);

export const INGEST_CANONICAL_REQUIRED_FIELDS = Object.freeze([
  "gkx_version", "uid", "title", "type", "created_at", "epistemic_state",
] as const);

export const INGEST_FINDING_CODES = Object.freeze([
  "AUTHORED_LINK_REFERENCE_INVALID",
  "AUTHORED_RELATIONSHIP_REFERENCE_INVALID",
  "CANONICAL_PROJECTION_INVALID",
  "CANONICAL_SOURCE_UID_UNAVAILABLE",
  "CANONICAL_VALIDITY_BINDING_MISMATCH",
  "CANONICAL_VALIDITY_REFERENCE_UNAVAILABLE",
  "CANONICAL_VALIDITY_TIMESTAMP_NONPORTABLE",
  "GKX-AUTHORITY-ROLE-001", "GKX-AUTHORITY-ROLE-002",
  "GKX-EPISTEMIC-002", "GKX-EPISTEMIC-004",
  "GKX-EVIDENCE-002", "GKX-EVIDENCE-003",
  "GKX-IDENTITY-001", "GKX-IDENTITY-002",
  "GKX-PROVENANCE-001", "GKX-PROVENANCE-002",
  "GKX-SCHEMA-002", "GKX-SCHEMA-003", "GKX-SCHEMA-004",
  "GKX-SENSITIVITY-001", "GKX-SENSITIVITY-005", "GKX-TEMPORAL-001",
  "GKX_FRONTMATTER_LINE_LIMIT", "GKX_FRONTMATTER_REQUIRED", "GKX_FRONTMATTER_SIZE_LIMIT",
  "GKX_FRONTMATTER_UNTERMINATED", "GKX_INGEST_CANONICAL_DIAGNOSTIC_UNMAPPED",
  "GKX_INGEST_PROFILE_VERSION_REQUIRED", "GKX_INGEST_UID_REQUIRED",
  "GKX_PROFILE_ENUM_INVALID", "GKX_PROFILE_FIELD_REQUIRED", "GKX_PROFILE_LENGTH_INVALID",
  "GKX_PROFILE_SENSITIVITY_BELOW_MINIMUM", "GKX_PROFILE_TYPE_INVALID", "GKX_PROFILE_UNKNOWN_FIELD",
  "GKX_YAML_DUPLICATE_KEY", "GKX_YAML_FEATURE_UNSUPPORTED", "GKX_YAML_FLOW_INVALID",
  "GKX_YAML_INDENT_TAB", "GKX_YAML_KEY_UNSAFE", "GKX_YAML_LIST_MAPPING_CONTINUATION",
  "GKX_YAML_LIST_SCALAR_CONTINUATION", "GKX_YAML_MAPPING_UNSUPPORTED", "GKX_YAML_NESTING_LIMIT",
  "GKX_YAML_NUMBER_NONFINITE", "GKX_YAML_NUMBER_UNSUPPORTED", "GKX_YAML_QUOTE_INVALID", "GKX_YAML_TOP_LEVEL_INDENT",
  "GKX_YAML_UNPARSED_CONTENT", "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT",
  "SOURCE_FILESYSTEM_ALIAS_REJECTED", "SOURCE_READ_FAILED", "SOURCE_SIZE_LIMIT_EXCEEDED",
  "SOURCE_SNAPSHOT_CHANGED_DURING_SCAN", "SOURCE_UTF8_INVALID",
] as const);

export const INGEST_SCAN_REJECTION_CODES = Object.freeze([
  "SOURCE_FILESYSTEM_ALIAS_REJECTED",
  "SOURCE_READ_FAILED",
  "SOURCE_SIZE_LIMIT_EXCEEDED",
  "SOURCE_SNAPSHOT_CHANGED_DURING_SCAN",
  "SOURCE_UTF8_INVALID",
] as const);

export type IngestFindingCode = typeof INGEST_FINDING_CODES[number];

/** Canonical/base severity for every safe finding code. A normalized profile
 * may raise only the finite GKX diagnostic subset; a sealed result must equal
 * the normalized severity exactly. */
export const INGEST_FINDING_SEVERITY_FLOORS = Object.freeze({
  AUTHORED_LINK_REFERENCE_INVALID: "error",
  AUTHORED_RELATIONSHIP_REFERENCE_INVALID: "error",
  CANONICAL_PROJECTION_INVALID: "error",
  CANONICAL_SOURCE_UID_UNAVAILABLE: "error",
  CANONICAL_VALIDITY_BINDING_MISMATCH: "error",
  CANONICAL_VALIDITY_REFERENCE_UNAVAILABLE: "error",
  CANONICAL_VALIDITY_TIMESTAMP_NONPORTABLE: "error",
  "GKX-AUTHORITY-ROLE-001": "critical",
  "GKX-AUTHORITY-ROLE-002": "error",
  "GKX-EPISTEMIC-002": "error",
  "GKX-EPISTEMIC-004": "warning",
  "GKX-EVIDENCE-002": "error",
  "GKX-EVIDENCE-003": "error",
  "GKX-IDENTITY-001": "warning",
  "GKX-IDENTITY-002": "error",
  "GKX-PROVENANCE-001": "warning",
  "GKX-PROVENANCE-002": "error",
  "GKX-SCHEMA-002": "info",
  "GKX-SCHEMA-003": "warning",
  "GKX-SCHEMA-004": "error",
  "GKX-SENSITIVITY-001": "warning",
  "GKX-SENSITIVITY-005": "error",
  "GKX-TEMPORAL-001": "warning",
  GKX_FRONTMATTER_LINE_LIMIT: "error",
  GKX_FRONTMATTER_REQUIRED: "error",
  GKX_FRONTMATTER_SIZE_LIMIT: "error",
  GKX_FRONTMATTER_UNTERMINATED: "error",
  GKX_INGEST_CANONICAL_DIAGNOSTIC_UNMAPPED: "error",
  GKX_INGEST_PROFILE_VERSION_REQUIRED: "error",
  GKX_INGEST_UID_REQUIRED: "error",
  GKX_PROFILE_ENUM_INVALID: "error",
  GKX_PROFILE_FIELD_REQUIRED: "error",
  GKX_PROFILE_LENGTH_INVALID: "error",
  GKX_PROFILE_SENSITIVITY_BELOW_MINIMUM: "error",
  GKX_PROFILE_TYPE_INVALID: "error",
  GKX_PROFILE_UNKNOWN_FIELD: "warning",
  GKX_YAML_DUPLICATE_KEY: "error",
  GKX_YAML_FEATURE_UNSUPPORTED: "error",
  GKX_YAML_FLOW_INVALID: "error",
  GKX_YAML_INDENT_TAB: "error",
  GKX_YAML_KEY_UNSAFE: "error",
  GKX_YAML_LIST_MAPPING_CONTINUATION: "error",
  GKX_YAML_LIST_SCALAR_CONTINUATION: "error",
  GKX_YAML_MAPPING_UNSUPPORTED: "error",
  GKX_YAML_NESTING_LIMIT: "error",
  GKX_YAML_NUMBER_NONFINITE: "error",
  GKX_YAML_NUMBER_UNSUPPORTED: "error",
  GKX_YAML_QUOTE_INVALID: "error",
  GKX_YAML_TOP_LEVEL_INDENT: "error",
  GKX_YAML_UNPARSED_CONTENT: "error",
  RETRIEVAL_AUTHORIZED_VIEW_CONFLICT: "error",
  SOURCE_FILESYSTEM_ALIAS_REJECTED: "error",
  SOURCE_READ_FAILED: "error",
  SOURCE_SIZE_LIMIT_EXCEEDED: "error",
  SOURCE_SNAPSHOT_CHANGED_DURING_SCAN: "error",
  SOURCE_UTF8_INVALID: "error",
} as const satisfies Record<IngestFindingCode, typeof INGEST_SEVERITY_ORDER[number]>);
