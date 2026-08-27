/** Frozen Phase 1 coordinates remain the default public retrieval surface. */
export const RETRIEVAL_CONTRACT_VERSION = "gkos-retrieval/1.0.0-draft.1" as const;
export const RETRIEVAL_RESULT_SCHEMA_ID = "gkos-retrieval-result/1.0.0-draft.1" as const;
export const RETRIEVAL_PROJECTION_SCHEMA_VERSION = 2 as const;

/** Additive Phase 2 lineage/citation coordinates. */
export const RETRIEVAL_LINEAGE_CONTRACT_VERSION = "gkos-retrieval/1.0.0-draft.2" as const;
export const RETRIEVAL_LINEAGE_RESULT_SCHEMA_ID = "gkos-retrieval-result/1.0.0-draft.2" as const;
export const RETRIEVAL_PROVENANCE_CONTRACT_VERSION = "gkos-retrieval-provenance/1.0.0-draft.1" as const;
export const RETRIEVAL_LINEAGE_PROJECTION_SCHEMA_VERSION = 3 as const;
export const RETRIEVAL_GKX_STANDARD_COMMIT = "a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6" as const;
export const RETRIEVAL_GKX_PROJECTION_PROFILE = "gkx-2.3-validating-projection" as const;
export const RETRIEVAL_CHUNKER_VERSION = "gkos-heading-chunker/1" as const;
export const RETRIEVAL_TOKENIZER_VERSION = "gkos-ascii-whitespace/1" as const;
export const RETRIEVAL_RRF_DEFAULT_K = 60 as const;
export const RETRIEVAL_MMR_DEFAULT_LAMBDA = 0.7 as const;
export const RETRIEVAL_MAX_CHUNK_BYTES = 16_384 as const;
export const RETRIEVAL_MAX_RESULT_BYTES = 131_072 as const;
export const RETRIEVAL_PARENT_EXPANSION_MAX_CHILD_TOKENS = 80 as const;

export const RETRIEVAL_CONTRACT_COORDINATES = Object.freeze({
  contract_version: RETRIEVAL_CONTRACT_VERSION,
  result_schema: RETRIEVAL_RESULT_SCHEMA_ID,
  projection_schema_version: RETRIEVAL_PROJECTION_SCHEMA_VERSION,
  chunker_version: RETRIEVAL_CHUNKER_VERSION,
  tokenizer_version: RETRIEVAL_TOKENIZER_VERSION,
  parent_expansion_max_child_tokens: RETRIEVAL_PARENT_EXPANSION_MAX_CHILD_TOKENS,
});

export const RETRIEVAL_LINEAGE_CONTRACT_COORDINATES = Object.freeze({
  contract_version: RETRIEVAL_LINEAGE_CONTRACT_VERSION,
  result_schema: RETRIEVAL_LINEAGE_RESULT_SCHEMA_ID,
  provenance_contract: RETRIEVAL_PROVENANCE_CONTRACT_VERSION,
  projection_schema_version: RETRIEVAL_LINEAGE_PROJECTION_SCHEMA_VERSION,
  gkx_standard_commit: RETRIEVAL_GKX_STANDARD_COMMIT,
  gkx_projection_profile: RETRIEVAL_GKX_PROJECTION_PROFILE,
  chunker_version: RETRIEVAL_CHUNKER_VERSION,
  tokenizer_version: RETRIEVAL_TOKENIZER_VERSION,
  parent_expansion_max_child_tokens: RETRIEVAL_PARENT_EXPANSION_MAX_CHILD_TOKENS,
});
