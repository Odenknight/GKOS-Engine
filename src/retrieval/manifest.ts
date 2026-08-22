import { ENGINE_VERSION } from "../version";
import {
  RETRIEVAL_CHUNKER_VERSION,
  RETRIEVAL_CONTRACT_VERSION,
  RETRIEVAL_GKX_PROJECTION_PROFILE,
  RETRIEVAL_GKX_STANDARD_COMMIT,
  RETRIEVAL_LINEAGE_CONTRACT_VERSION,
  RETRIEVAL_LINEAGE_PROJECTION_SCHEMA_VERSION,
  RETRIEVAL_PROJECTION_SCHEMA_VERSION,
  RETRIEVAL_PROVENANCE_CONTRACT_VERSION,
  RETRIEVAL_TOKENIZER_VERSION,
} from "./contracts";
import { retrievalCodeUnitCompare } from "./digest";
import type { AnyRetrievalProjectionManifest, GkxRetrievalProjectionManifest } from "./types";

export function isGkxRetrievalProjectionManifest(
  value: AnyRetrievalProjectionManifest,
): value is GkxRetrievalProjectionManifest {
  return value.contract_version === RETRIEVAL_LINEAGE_CONTRACT_VERSION &&
    value.projection_schema_version === RETRIEVAL_LINEAGE_PROJECTION_SCHEMA_VERSION;
}

/** Exact schema-2/schema-3 manifest semantic gate shared by every pointer writer. */
export function assertRetrievalProjectionManifest(value: AnyRetrievalProjectionManifest): void {
  if (!value || typeof value !== "object") throw new Error("RETRIEVAL_MANIFEST_INVALID");
  const phase2 = isGkxRetrievalProjectionManifest(value);
  const keys = phase2
    ? [
      "candidate_chunk_count", "candidate_declaration_count", "candidate_source_count", "chunker_version", "configuration_digest", "contract_version", "embedding_dimensions",
      "embedding_eligible_candidate_chunk_count", "embedding_model_id", "embedding_provider_id", "engine_version", "gkx_projection_profile", "gkx_standard_commit", "lexical_backend", "policy_digest", "projection_digest",
      "projection_id", "projection_schema_version", "provenance_contract_version", "represented_candidate_source_count", "source_snapshot_digest", "tokenizer_version", "vault_id",
    ]
    : [
      "chunk_count", "chunker_version", "configuration_digest", "contract_version", "embedding_dimensions",
      "embedding_model_id", "embedding_provider_id", "engine_version", "lexical_backend", "policy_digest", "projection_digest",
      "projection_id", "projection_schema_version", "source_count", "source_snapshot_digest", "tokenizer_version", "vault_id",
    ];
  if (Object.keys(value).sort(retrievalCodeUnitCompare).join("\0") !== keys.sort(retrievalCodeUnitCompare).join("\0")) {
    throw new Error("RETRIEVAL_MANIFEST_FIELDS_INVALID");
  }
  if (phase2) {
    if (value.provenance_contract_version !== RETRIEVAL_PROVENANCE_CONTRACT_VERSION) {
      throw new Error("RETRIEVAL_PROVENANCE_CONTRACT_MISMATCH");
    }
    if (value.gkx_standard_commit !== RETRIEVAL_GKX_STANDARD_COMMIT ||
        value.gkx_projection_profile !== RETRIEVAL_GKX_PROJECTION_PROFILE) {
      throw new Error("RETRIEVAL_GKX_AUTHORITY_COORDINATE_MISMATCH");
    }
  } else if (value.contract_version !== RETRIEVAL_CONTRACT_VERSION ||
      value.projection_schema_version !== RETRIEVAL_PROJECTION_SCHEMA_VERSION) {
    throw new Error("RETRIEVAL_CONTRACT_MISMATCH");
  }
  if (value.chunker_version !== RETRIEVAL_CHUNKER_VERSION || value.tokenizer_version !== RETRIEVAL_TOKENIZER_VERSION) {
    throw new Error("RETRIEVAL_CHUNKER_MISMATCH");
  }
  if (value.lexical_backend !== "sqlite_fts5" && value.lexical_backend !== "sqlite_lexical_scan") {
    throw new Error("RETRIEVAL_LEXICAL_BACKEND_INVALID");
  }
  if (value.engine_version !== ENGINE_VERSION || typeof value.vault_id !== "string" || !value.vault_id || value.vault_id.length > 512) {
    throw new Error("RETRIEVAL_MANIFEST_IDENTITY_INVALID");
  }
  for (const digest of [value.source_snapshot_digest, value.configuration_digest, value.policy_digest, value.projection_digest]) {
    if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) throw new Error("RETRIEVAL_MANIFEST_DIGEST_INVALID");
  }
  if (phase2) {
    if (!Number.isSafeInteger(value.candidate_source_count) || value.candidate_source_count < 0 ||
        !Number.isSafeInteger(value.candidate_declaration_count) || value.candidate_declaration_count < 0 ||
        !Number.isSafeInteger(value.represented_candidate_source_count) || value.represented_candidate_source_count < 0 ||
        value.represented_candidate_source_count > value.candidate_source_count ||
        !Number.isSafeInteger(value.candidate_chunk_count) || value.candidate_chunk_count < 0 ||
        !Number.isSafeInteger(value.embedding_eligible_candidate_chunk_count) || value.embedding_eligible_candidate_chunk_count < 0 ||
        value.embedding_eligible_candidate_chunk_count > value.candidate_chunk_count) {
      throw new Error("RETRIEVAL_MANIFEST_COUNT_INVALID");
    }
  } else if (!Number.isSafeInteger(value.source_count) || value.source_count < 0 ||
      !Number.isSafeInteger(value.chunk_count) || value.chunk_count < 0) {
    throw new Error("RETRIEVAL_MANIFEST_COUNT_INVALID");
  }
  const hasVectorIdentity = value.embedding_provider_id !== null || value.embedding_model_id !== null ||
    value.embedding_dimensions !== null;
  if ((value.embedding_provider_id !== null && typeof value.embedding_provider_id !== "string") ||
      (value.embedding_model_id !== null && typeof value.embedding_model_id !== "string")) {
    throw new Error("VECTOR_MANIFEST_IDENTITY_INVALID");
  }
  if (hasVectorIdentity && (!value.embedding_provider_id || !value.embedding_model_id ||
      !Number.isSafeInteger(value.embedding_dimensions) || value.embedding_dimensions! <= 0)) {
    throw new Error("VECTOR_MANIFEST_IDENTITY_INVALID");
  }
  if (value.projection_id !== `retrieval:${value.projection_digest.slice("sha256:".length, "sha256:".length + 24)}`) {
    throw new Error("RETRIEVAL_PROJECTION_ID_INVALID");
  }
}
