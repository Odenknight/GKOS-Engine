import { join } from "node:path";
import { buildGkxRetrievalAuthorizedCandidateView, type GkxRetrievalAuthorizedCandidateView } from "./authorized-view";
import {
  coordinatorFromRetrievalEvaluationDatabase,
  gkxRetrievalLineageResultCoordinate,
  type RetrievalEvaluationCoordinatorObserver,
} from "./coordinator";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, retrievalSha256, stableJson } from "./digest";
import {
  buildRetrievalEvaluationMetricsSetForHost,
  buildRetrievalEvaluationTuneCandidateForHost,
  assertRetrievalEvaluationTuneBaselineForHost,
  compareRetrievalEvaluationBaseline,
  computeRetrievalEvaluationQueryMetricsForHost,
  RETRIEVAL_EVALUATION_NDCG_TABLE,
  RETRIEVAL_EVALUATION_QUERY_VIEW_AUDIT_ORACLE_VERSION,
  retrievalEvaluationCandidateConfigMaterial,
  retrievalEvaluationExecutionBaseConfigurationForHost,
  retrievalEvaluationEligibleTuningAxesForHost,
  sealRetrievalEvaluationBaseline,
  selectRetrievalEvaluationTuneCandidate,
  type NormalizedRetrievalEvaluationQuery,
  type RetrievalEvaluationBaseline,
  type RetrievalEvaluationComparison,
  type RetrievalEvaluationMetricsSet,
  type RetrievalEvaluationQueryInput,
  type RetrievalEvaluationExpectedTemporal,
  type RetrievalEvaluationQueryMetrics,
  type RetrievalEvaluationTuneSelection,
  type RetrievalEvaluationTuningAxesCoordinate,
} from "./evaluation";
import {
  RETRIEVAL_EVALUATION_FIXED_PROVIDER_REQUEST_VERSION,
  deriveRetrievalEvaluationProviderIndexReceipts,
  deriveRetrievalEvaluationExecutableEnvironmentBundle,
  type RetrievalEvaluationExecutableEnvironmentDerivation,
  type RetrievalEvaluationFixedEmbeddingQueryTemplate,
  type RetrievalEvaluationFixedProviderCounters,
  type RetrievalEvaluationFixedProviderScenario,
  type RetrievalEvaluationFixedProviderSchedule,
  type RetrievalEvaluationFixedProviderTranscript,
  type RetrievalEvaluationFixedRerankQueryOracle,
  type RetrievalEvaluationEnvironmentBundle,
} from "./evaluation-fixtures";
import {
  RETRIEVAL_EVALUATION_QUERY_ATTEMPT_COUNTERS_VERSION,
  RETRIEVAL_EVALUATION_PUBLIC_VIEW_VERSION,
  RETRIEVAL_EVALUATION_PROJECTION_MANIFEST_SET_VERSION,
  sealRetrievalEvaluationExecutableReviewedBundle,
  type RetrievalEvaluationMetricComputationFixture,
  type RetrievalEvaluationQueryAttemptCounters,
  type RetrievalEvaluationReviewedBundle,
} from "./evaluation-reviewed-bundle";
import { bindGkxRetrievalCandidateChunks } from "./candidate-types";
import { chunkMarkdown } from "./chunker";
import { projectAuthoredGkxRetrievalCorpus } from "./gkx-provenance";
import { buildGkxRetrievalGenerationUnactivated, deriveGkxRetrievalProjectionManifest } from "./sqlite-store";
import type {
  GkxRetrievalSearchResult,
  RerankProvider,
  RetrievalSearchRequest,
  VectorProvider,
} from "./types";

export interface RetrievalEvaluationExecutableInput {
  environment_bundle: RetrievalEvaluationEnvironmentBundle;
  baseline: RetrievalEvaluationBaseline;
  metric_computation_fixture: RetrievalEvaluationMetricComputationFixture;
  reviewed_bundle: RetrievalEvaluationReviewedBundle | null;
  execution_authority: RetrievalEvaluationExecutionAuthority;
}

export const RETRIEVAL_EVALUATION_EXECUTION_AUTHORITY_VERSION =
  "gkx-retrieval-evaluation-execution-authority/1.0.0-draft.1" as const;

export interface RetrievalEvaluationExecutionAuthority {
  contract_version: typeof RETRIEVAL_EVALUATION_EXECUTION_AUTHORITY_VERSION;
  golden_toml_digest: string;
  normalized_golden_digest: string;
  conformance_fixture_digest: string;
  environment_set_digest: string;
  baseline_digest: string;
  fixture_catalog_digest: string;
  source_corpus_digest: string;
  fixed_provider_digest: string | null;
  metric_computation_fixture_digest: string;
  tune_priority_fixture_digest: string;
  ndcg_table_digest: string;
  projection_manifest_set_digest: string;
  reviewed_bundle_digest: string | null;
  execution_authority_digest: string;
}

export interface RetrievalEvaluationExecutedQueryAttempt {
  query_id: string;
  result: GkxRetrievalSearchResult;
  metrics: RetrievalEvaluationQueryMetrics;
  counters: RetrievalEvaluationQueryAttemptCounters;
}

export interface RetrievalEvaluationEvalExecution {
  comparison: RetrievalEvaluationComparison;
  metrics_set: RetrievalEvaluationMetricsSet;
  query_attempts: RetrievalEvaluationExecutedQueryAttempt[];
  reviewed_absent_query_attempts: RetrievalEvaluationExecutedQueryAttempt[];
}

export interface RetrievalEvaluationTuneExecution {
  selection: RetrievalEvaluationTuneSelection;
  candidate_config: ReturnType<typeof retrievalEvaluationCandidateConfigMaterial> | null;
}

interface MutableProviderCounters extends RetrievalEvaluationFixedProviderCounters {}

interface AttemptEvidence {
  source_read_count: number;
  retrieval_sql_stage_count: number;
  ranking_call_count: number;
  confidence_call_count: number;
  search_citation_verification_count: number;
  evaluator_citation_verification_count: number;
}

interface OperationStore {
  derivation: RetrievalEvaluationExecutableEnvironmentDerivation;
  replay: ProviderReplay;
  coordinator: ReturnType<typeof coordinatorFromRetrievalEvaluationDatabase>;
  set_attempt(value: AttemptEvidence | null): void;
}

interface ProviderReplay {
  readonly vector_provider: VectorProvider | undefined;
  readonly rerank_provider: RerankProvider | undefined;
  replay_index(candidateTextByDigest: ReadonlyMap<string, string>): Promise<ReadonlyMap<string, Float32Array>>;
  begin_occurrence(index: number, axes: RetrievalEvaluationTuningAxesCoordinate): void;
  end_occurrence(): MutableProviderCounters;
  assert_terminal(): void;
}

interface FixedProviderReplaySchedule {
  operation: "eval" | "tune";
  query_count: number;
  query_partition: RetrievalEvaluationFixedProviderSchedule["query_partition"];
  occurrence_matrix: RetrievalEvaluationFixedProviderSchedule["occurrence_matrix"];
  expected_provider_counters: RetrievalEvaluationFixedProviderCounters;
  evaluation_axes?: RetrievalEvaluationTuningAxesCoordinate;
  eligible_tuning_axes?: RetrievalEvaluationTuningAxesCoordinate[];
}

interface FixedProviderReplayMaterial {
  embedding_role: "active" | "disabled";
  reranker_role: "active" | "disabled";
  embedding_index_templates: RetrievalEvaluationFixedProviderScenario["embedding_index_templates"];
  embedding_query_templates: RetrievalEvaluationFixedProviderScenario["embedding_query_templates"];
  reranker_query_oracles: RetrievalEvaluationFixedProviderScenario["reranker_query_oracles"];
  schedule: FixedProviderReplaySchedule;
}

function failure(code: string): never { throw new Error(code); }

const EXECUTION_SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const EXECUTION_AUTHORITY_KEYS = [
  "contract_version", "golden_toml_digest", "normalized_golden_digest", "conformance_fixture_digest",
  "environment_set_digest", "baseline_digest", "fixture_catalog_digest", "source_corpus_digest",
  "fixed_provider_digest", "metric_computation_fixture_digest", "tune_priority_fixture_digest",
  "ndcg_table_digest", "projection_manifest_set_digest", "reviewed_bundle_digest",
  "execution_authority_digest",
] as const;

export function sealRetrievalEvaluationExecutionAuthority(value: unknown): RetrievalEvaluationExecutionAuthority {
  if (!value || typeof value !== "object" || Array.isArray(value)) failure("GKX_EVAL_EXECUTION_AUTHORITY_INVALID");
  let item: RetrievalEvaluationExecutionAuthority;
  try { item = JSON.parse(stableJson(value)) as RetrievalEvaluationExecutionAuthority; }
  catch { return failure("GKX_EVAL_EXECUTION_AUTHORITY_INVALID"); }
  const keys = Object.keys(item).sort();
  if (stableJson(keys) !== stableJson([...EXECUTION_AUTHORITY_KEYS].sort()) ||
      item.contract_version !== RETRIEVAL_EVALUATION_EXECUTION_AUTHORITY_VERSION) {
    failure("GKX_EVAL_EXECUTION_AUTHORITY_INVALID");
  }
  for (const field of EXECUTION_AUTHORITY_KEYS.slice(1, -1)) {
    const coordinate = item[field];
    if ((field === "fixed_provider_digest" || field === "reviewed_bundle_digest") && coordinate === null) continue;
    if (typeof coordinate !== "string" || !EXECUTION_SHA256_RE.test(coordinate)) {
      failure("GKX_EVAL_EXECUTION_AUTHORITY_INVALID");
    }
  }
  const { execution_authority_digest: digest, ...material } = item;
  if (!EXECUTION_SHA256_RE.test(digest) || retrievalCanonicalDigest(material) !== digest) {
    failure("GKX_EVAL_EXECUTION_AUTHORITY_DIGEST_INVALID");
  }
  return item;
}

function firstDifference(left: unknown, right: unknown, path = "$ "): string {
  if (Object.is(left, right)) return "";
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return path.trimEnd();
  if (Array.isArray(left) !== Array.isArray(right)) return path.trimEnd();
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
  for (const key of keys) {
    if (!Object.hasOwn(leftRecord, key) || !Object.hasOwn(rightRecord, key)) return `${path}${key}`;
    const nested = firstDifference(leftRecord[key], rightRecord[key], `${path}${key}.`);
    if (nested) return nested;
  }
  return "";
}

function same(left: unknown, right: unknown, code: string): void {
  if (stableJson(left) !== stableJson(right)) failure(`${code}:${firstDifference(left, right)}`);
}

function counterDelta(after: MutableProviderCounters, before: MutableProviderCounters): MutableProviderCounters {
  return {
    vector_provider_call_count: after.vector_provider_call_count - before.vector_provider_call_count,
    vector_provider_item_count: after.vector_provider_item_count - before.vector_provider_item_count,
    rerank_provider_call_count: after.rerank_provider_call_count - before.rerank_provider_call_count,
    rerank_provider_item_count: after.rerank_provider_item_count - before.rerank_provider_item_count,
  };
}

function cloneProviderCounters(value: MutableProviderCounters): MutableProviderCounters {
  return { ...value };
}

class FixedProviderReplay implements ProviderReplay {
  readonly #transcript: RetrievalEvaluationFixedProviderTranscript;
  readonly #material: FixedProviderReplayMaterial;
  readonly #schedule: FixedProviderReplaySchedule;
  readonly #counters: MutableProviderCounters = {
    vector_provider_call_count: 0,
    vector_provider_item_count: 0,
    rerank_provider_call_count: 0,
    rerank_provider_item_count: 0,
  };
  #indexCursor = 0;
  #occurrenceIndex: number | null = null;
  #occurrenceStart: MutableProviderCounters | null = null;

  constructor(
    transcript: RetrievalEvaluationFixedProviderTranscript,
    material: FixedProviderReplayMaterial,
  ) {
    this.#transcript = transcript;
    this.#material = material;
    this.#schedule = material.schedule;
  }

  get vector_provider(): VectorProvider | undefined {
    if (this.#material.embedding_role === "disabled") return undefined;
    return {
      kind: this.#transcript.embedding_provider.provider_kind,
      provider_id: this.#transcript.embedding_provider.provider_id,
      model_id: this.#transcript.embedding_provider.model_id,
      dimensions: this.#transcript.embedding_provider.dimensions,
      timeout_ms: 15_000,
      embed: (texts, context) => this.#embed(texts, context),
    };
  }

  get rerank_provider(): RerankProvider | undefined {
    if (this.#material.reranker_role === "disabled") return undefined;
    return {
      kind: this.#transcript.reranker_provider.provider_kind,
      provider_id: this.#transcript.reranker_provider.provider_id,
      model_id: this.#transcript.reranker_provider.model_id,
      timeout_ms: 15_000,
      rerank: (query, inputs, context) => this.#rerank(query, inputs, context),
    };
  }

  snapshot(): MutableProviderCounters { return cloneProviderCounters(this.#counters); }

  begin_occurrence(index: number, axes: RetrievalEvaluationTuningAxesCoordinate): void {
    if (this.#occurrenceIndex !== null || !Number.isSafeInteger(index) || index < 0 || index >= this.#schedule.occurrence_matrix.length) {
      failure("GKX_EVAL_EXECUTOR_PROVIDER_OCCURRENCE_INVALID");
    }
    if (this.#schedule.operation === "eval") same(axes, this.#schedule.evaluation_axes,
      "GKX_EVAL_EXECUTOR_EVAL_AXES_MISMATCH");
    else {
      same(axes, this.#schedule.eligible_tuning_axes?.[Math.floor(index / this.#schedule.query_count)],
        "GKX_EVAL_EXECUTOR_TUNE_AXES_MISMATCH");
    }
    this.#occurrenceIndex = index;
    this.#occurrenceStart = this.snapshot();
  }

  end_occurrence(): MutableProviderCounters {
    if (this.#occurrenceIndex === null || this.#occurrenceStart === null) failure("GKX_EVAL_EXECUTOR_PROVIDER_OCCURRENCE_INVALID");
    const cell = this.#schedule.occurrence_matrix[this.#occurrenceIndex];
    const delta = counterDelta(this.#counters, this.#occurrenceStart);
    const expected = {
      vector_provider_call_count: cell[0],
      vector_provider_item_count: cell[0],
      rerank_provider_call_count: cell[1] === null ? 0 : 1,
      rerank_provider_item_count: cell[2] ?? 0,
    };
    same(delta, expected, "GKX_EVAL_EXECUTOR_PROVIDER_OCCURRENCE_COUNTER_MISMATCH");
    this.#occurrenceIndex = null;
    this.#occurrenceStart = null;
    return delta;
  }

  assert_terminal(): void {
    if (this.#occurrenceIndex !== null || this.#indexCursor !== this.#material.embedding_index_templates.length) {
      failure("GKX_EVAL_EXECUTOR_PROVIDER_TERMINAL_INCOMPLETE");
    }
    same(this.#counters, this.#schedule.expected_provider_counters, "GKX_EVAL_EXECUTOR_PROVIDER_TERMINAL_COUNTER_MISMATCH");
  }

  async replay_index(candidateTextByDigest: ReadonlyMap<string, string>): Promise<ReadonlyMap<string, Float32Array>> {
    const provider = this.vector_provider;
    if (!provider) {
      if (this.#material.embedding_index_templates.length !== 0) failure("GKX_EVAL_EXECUTOR_DISABLED_INDEX_INVALID");
      return new Map();
    }
    const result = new Map<string, Float32Array>();
    for (const template of this.#material.embedding_index_templates) {
      const texts = template.chunk_inputs.map((input) => candidateTextByDigest.get(input.input_digest) ??
        failure("GKX_EVAL_EXECUTOR_INDEX_INPUT_MISSING"));
      const vectors = await provider.embed(texts, { request_id: template.request_id });
      template.chunk_inputs.forEach((input, index) => result.set(input.input_digest, vectors[index]));
    }
    return result;
  }

  async #embed(
    texts: readonly string[],
    context?: { request_id?: string; signal?: AbortSignal },
  ): Promise<readonly Float32Array[]> {
    if (this.#occurrenceIndex === null) {
      const template = this.#material.embedding_index_templates[this.#indexCursor++];
      if (!template || context?.request_id !== template.request_id || texts.length !== template.item_count ||
          stableJson(texts.map((text) => retrievalSha256(text))) !== stableJson(template.chunk_inputs.map((input) => input.input_digest))) {
        failure("GKX_EVAL_EXECUTOR_INDEX_REQUEST_MISMATCH");
      }
      this.#counters.vector_provider_call_count += 1;
      this.#counters.vector_provider_item_count += texts.length;
      return template.responses.map((response) => Float32Array.from(response.values_micros, (part) => part / 1_000_000));
    }
    const queryIndex = this.#occurrenceIndex % this.#schedule.query_count;
    const cell = this.#schedule.occurrence_matrix[this.#occurrenceIndex];
    const template: RetrievalEvaluationFixedEmbeddingQueryTemplate | undefined = this.#material.embedding_query_templates[queryIndex];
    if (cell[0] !== 1 || !template || texts.length !== 1 || texts[0] !== template.effective_query_text ||
        context?.request_id !== template.request_id || retrievalSha256(texts[0]) !== template.query_input_digest) {
      failure("GKX_EVAL_EXECUTOR_EMBEDDING_REQUEST_MISMATCH");
    }
    this.#counters.vector_provider_call_count += 1;
    this.#counters.vector_provider_item_count += 1;
    if (template.outcome === "failure") throw new Error(template.error_code!);
    return template.responses.map((response) => Float32Array.from(response.values_micros, (part) => part / 1_000_000));
  }

  async #rerank(
    query: string,
    inputs: readonly { chunk_id: string; text: string }[],
    context?: { request_id?: string; signal?: AbortSignal },
  ): Promise<readonly { chunk_id: string; score: number }[]> {
    if (this.#occurrenceIndex === null) failure("GKX_EVAL_EXECUTOR_RERANK_OUTSIDE_OCCURRENCE");
    const queryIndex = this.#occurrenceIndex % this.#schedule.query_count;
    const cell = this.#schedule.occurrence_matrix[this.#occurrenceIndex];
    const oracle: RetrievalEvaluationFixedRerankQueryOracle | undefined = this.#material.reranker_query_oracles[queryIndex];
    if (cell[1] === null || cell[2] === null || !oracle || query !== oracle.effective_query_text ||
        context?.request_id !== oracle.request_id || inputs.length !== cell[2]) {
      failure("GKX_EVAL_EXECUTOR_RERANK_REQUEST_MISMATCH");
    }
    const universe = new Map(oracle.candidate_score_universe.map((candidate) => [candidate.candidate_chunk_id, candidate]));
    const ordered = inputs.map((input) => {
      const expected = universe.get(input.chunk_id);
      if (!expected || expected.input_digest !== retrievalSha256(input.text)) failure("GKX_EVAL_EXECUTOR_RERANK_INPUT_MISMATCH");
      return expected;
    });
    const queryCoordinate = this.#schedule.query_partition[queryIndex];
    const request = {
      contract_version: RETRIEVAL_EVALUATION_FIXED_PROVIDER_REQUEST_VERSION,
      call_kind: "reranker_query",
      request_id: oracle.request_id,
      query_id: queryCoordinate.query_id,
      query_digest: queryCoordinate.query_digest,
      query_text: query,
      ordered_inputs: ordered.map((candidate) => ({
        candidate_chunk_id: candidate.candidate_chunk_id,
        input_digest: candidate.input_digest,
      })),
    };
    if (retrievalCanonicalDigest(request) !== cell[1]) failure("GKX_EVAL_EXECUTOR_RERANK_REQUEST_DIGEST_MISMATCH");
    this.#counters.rerank_provider_call_count += 1;
    this.#counters.rerank_provider_item_count += inputs.length;
    if (oracle.outcome === "failure") throw new Error(oracle.error_code!);
    return ordered.map((candidate) => ({ chunk_id: candidate.candidate_chunk_id, score: candidate.score_micros / 1_000_000 }));
  }
}

class DisabledProviderReplay implements ProviderReplay {
  #active = false;
  get vector_provider(): undefined { return undefined; }
  get rerank_provider(): undefined { return undefined; }
  async replay_index(): Promise<ReadonlyMap<string, Float32Array>> { return new Map(); }
  begin_occurrence(index: number): void {
    if (this.#active || !Number.isSafeInteger(index) || index < 0) failure("GKX_EVAL_EXECUTOR_PROVIDER_OCCURRENCE_INVALID");
    this.#active = true;
  }
  end_occurrence(): MutableProviderCounters {
    if (!this.#active) failure("GKX_EVAL_EXECUTOR_PROVIDER_OCCURRENCE_INVALID");
    this.#active = false;
    return { vector_provider_call_count: 0, vector_provider_item_count: 0, rerank_provider_call_count: 0, rerank_provider_item_count: 0 };
  }
  assert_terminal(): void {
    if (this.#active) failure("GKX_EVAL_EXECUTOR_PROVIDER_TERMINAL_INCOMPLETE");
  }
}

function metricCaseByQuery(
  fixture: RetrievalEvaluationMetricComputationFixture,
  queryId: string,
): RetrievalEvaluationMetricComputationFixture["cases"][number] {
  const row = fixture.cases.find((candidate) => candidate.case_id === `reviewed-${queryId}`);
  if (!row || row.expected_status !== "metrics" || row.expected_metrics === null) failure("GKX_EVAL_EXECUTOR_REVIEWED_METRIC_CASE_MISSING");
  return row;
}

function expectedTemporalFromRuntimeView(
  query: NormalizedRetrievalEvaluationQuery,
  result: GkxRetrievalSearchResult,
  view: GkxRetrievalAuthorizedCandidateView,
): RetrievalEvaluationExpectedTemporal {
  const temporalBySource = new Map(view.temporal_sources.map((source) => [source.source_id, source]));
  const coverage = query.as_of === null
    ? "not_requested"
    : view.authorized_source_count === 0
      ? "not_evaluated"
      : view.answerable_source_count !== view.authorized_source_count || view.eligible_record_keys.length === 0
        ? "insufficient"
        : "sufficient";
  return {
    coverage,
    hits: result.hits.map((hit) => {
      const temporal = temporalBySource.get(hit.chunk.source_id) ??
        failure("GKX_EVAL_EXECUTOR_EXPECTED_TEMPORAL_SOURCE_MISSING");
      if (temporal.temporal_state !== "current" && temporal.temporal_state !== "historical" &&
          temporal.temporal_state !== "unknown") {
        failure("GKX_EVAL_EXECUTOR_EXPECTED_TEMPORAL_STATE_INVALID");
      }
      return {
        source_id: temporal.source_id,
        temporal_state: temporal.temporal_state,
        valid_from: temporal.valid_from,
        valid_to: temporal.valid_to,
        supersedes: [...temporal.supersedes],
        superseded_by: [...temporal.superseded_by],
      };
    }),
  };
}

function generalMetricInput(
  derivation: RetrievalEvaluationExecutableEnvironmentDerivation,
  query: NormalizedRetrievalEvaluationQuery,
  result: GkxRetrievalSearchResult,
): RetrievalEvaluationQueryInput {
  // Expected temporal truth follows the exact production runtime-policy,
  // typed-filter, and as_of view used by search.
  const runtimeView = buildGkxRetrievalAuthorizedCandidateView(
    derivation.policy_candidate_sources,
    derivation.policy_candidate_declarations,
    derivation.policy_candidate_chunks,
    query.as_of,
  );

  // The audit coordinate is deliberately derived a second time from the
  // catalog's independently sealed authorized source partition. It is never
  // supplied to the coordinator or runtime policy.
  const catalogOracle = derivation.catalog_entry.evaluation_audit_oracle;
  const authorizedIds = new Set(catalogOracle.authorized_source_ids);
  const authorizedPaths = new Set(catalogOracle.authorized_source_paths);
  const auditRecordKeys = new Set(derivation.projection.sources
    .filter((source) => authorizedIds.has(source.candidate_source.source_id) &&
      authorizedPaths.has(source.candidate_source.source_path))
    .map((source) => source.record_key));
  const auditView = buildGkxRetrievalAuthorizedCandidateView(
    derivation.projection.sources.filter((source) => auditRecordKeys.has(source.record_key))
      .map((source) => source.candidate_source),
    derivation.projection.declarations.filter((declaration) => auditRecordKeys.has(declaration.source_record_key)),
    derivation.candidate_chunks.filter((candidate) => auditRecordKeys.has(candidate.record_key)),
    query.as_of,
  );
  const auditCoordinate = gkxRetrievalLineageResultCoordinate(
    derivation.manifest,
    auditView.sources,
    auditView.temporal_sources,
  );
  const auditMaterial = {
    contract_version: RETRIEVAL_EVALUATION_QUERY_VIEW_AUDIT_ORACLE_VERSION,
    authorized_source_ids: [...catalogOracle.authorized_source_ids],
    authorized_source_paths: [...catalogOracle.authorized_source_paths],
    forbidden_source_ids: [...catalogOracle.forbidden_source_ids],
    forbidden_source_paths: [...catalogOracle.forbidden_source_paths],
    authorized_endpoint_ids: [...catalogOracle.authorized_endpoint_ids],
    forbidden_endpoint_ids: [...catalogOracle.forbidden_endpoint_ids],
    expected_public_result_projection_id: auditCoordinate.projection_id,
    expected_public_result_projection_digest: auditCoordinate.projection_digest,
  };
  return {
    query,
    result,
    source_observations: derivation.corpus.source_files.map((source) => ({
      source_id: source.source_id,
      source_path: source.source_path,
      source_digest: source.source_digest,
      source_bytes_base64: source.source_bytes_base64,
    })),
    audit_oracle: { ...auditMaterial, oracle_digest: retrievalCanonicalDigest(auditMaterial) },
    expected_temporal: expectedTemporalFromRuntimeView(query, result, runtimeView),
  };
}

function searchRequest(query: NormalizedRetrievalEvaluationQuery, axes: RetrievalEvaluationTuningAxesCoordinate): RetrievalSearchRequest {
  return {
    query: query.text,
    limit: query.expected_top_k,
    lexical_top_k: axes.lexical_top_k,
    semantic_top_k: axes.semantic_top_k,
    rrf_k: axes.rrf_k,
    mmr: axes.mmr,
    ...(axes.mmr ? { mmr_lambda: axes.mmr_lambda_micros! / 1_000_000 } : {}),
    ...(query.as_of === null ? {} : { as_of: query.as_of }),
  };
}

function reviewedCounters(
  evidence: AttemptEvidence,
  provider: MutableProviderCounters,
): RetrievalEvaluationQueryAttemptCounters {
  const material = {
    contract_version: RETRIEVAL_EVALUATION_QUERY_ATTEMPT_COUNTERS_VERSION,
    authority_input_snapshot_count: 1,
    source_read_count: evidence.source_read_count,
    retrieval_sql_stage_count: evidence.retrieval_sql_stage_count,
    vector_provider_call_count: provider.vector_provider_call_count,
    vector_provider_item_count: provider.vector_provider_item_count,
    rerank_provider_call_count: provider.rerank_provider_call_count,
    rerank_provider_item_count: provider.rerank_provider_item_count,
    ranking_call_count: evidence.ranking_call_count,
    confidence_call_count: evidence.confidence_call_count,
    citation_verification_count: evidence.search_citation_verification_count + evidence.evaluator_citation_verification_count,
    metric_computation_count: 1,
  };
  return { ...material, counter_digest: retrievalCanonicalDigest(material) };
}

async function createOperationStore(
  derivation: RetrievalEvaluationExecutableEnvironmentDerivation,
  transcript: RetrievalEvaluationFixedProviderTranscript | null,
  operation: "eval" | "tune",
  stateRoot: string,
): Promise<OperationStore> {
  const scenario = derivation.provider_scenario;
  const bothDisabled = derivation.environment_member.environment.embedding_role.state === "disabled" &&
    derivation.environment_member.environment.reranker_role.state === "disabled";
  if (scenario === null ? !bothDisabled : transcript === null) failure("GKX_EVAL_EXECUTOR_PROVIDER_SCENARIO_MISSING");
  const schedule = scenario === null ? null : operation === "eval" ? scenario.eval_schedule : scenario.tune_schedule;
  if (scenario !== null && schedule === null) failure("GKX_EVAL_EXECUTOR_TUNE_SCHEDULE_MISSING");
  const replay: ProviderReplay = scenario === null ? new DisabledProviderReplay() : new FixedProviderReplay(transcript!, {
    embedding_role: scenario.embedding_role,
    reranker_role: scenario.reranker_role,
    embedding_index_templates: scenario.embedding_index_templates,
    embedding_query_templates: scenario.embedding_query_templates,
    reranker_query_oracles: scenario.reranker_query_oracles,
    schedule: schedule!,
  });
  const textByDigest = new Map(derivation.policy_candidate_chunks.map((candidate) => [candidate.chunk.content_digest, candidate.chunk.text]));
  const indexVectors = await replay.replay_index(textByDigest);
  const embeddingActive = derivation.environment_member.environment.embedding_role.state === "active";
  const vectors = !embeddingActive ? [] : derivation.policy_candidate_chunks.map((candidate) => {
      const vector = indexVectors.get(candidate.chunk.content_digest);
      if (!vector) failure("GKX_EVAL_EXECUTOR_INDEX_VECTOR_MISSING");
      return { candidate_chunk_key: candidate.candidate_chunk_key, vector: [...vector] };
    });
  const built = buildGkxRetrievalGenerationUnactivated({
    state_directory: join(stateRoot, derivation.vault_fixture),
    vault_id: derivation.corpus.vault_fixture,
    source_snapshot_digest: derivation.catalog_entry.source_snapshot.source_snapshot_digest,
    configuration_digest: derivation.manifest.configuration_digest,
    policy_digest: derivation.catalog_entry.runtime_policy_inputs.runtime_policy_inputs_digest,
    candidate_sources: derivation.projection.sources.map((source) => source.candidate_source),
    candidate_declarations: derivation.projection.declarations,
    candidate_chunks: derivation.candidate_chunks,
    embedding_eligible_candidate_chunk_keys:
      derivation.policy_candidate_chunks.map((candidate) => candidate.candidate_chunk_key),
    vectors,
    embedding_provider_id: embeddingActive ? transcript!.embedding_provider.provider_id : null,
    embedding_model_id: embeddingActive ? transcript!.embedding_provider.model_id : null,
    embedding_dimensions: embeddingActive ? transcript!.embedding_provider.dimensions : null,
    lexical_backend: derivation.environment_member.environment.lexical_backend,
  });
  same(built.manifest, derivation.manifest, "GKX_EVAL_EXECUTOR_BUILT_MANIFEST_MISMATCH");
  let currentAttempt: AttemptEvidence | null = null;
  const observer: RetrievalEvaluationCoordinatorObserver = {
    sql_stage: () => { if (!currentAttempt) failure("GKX_EVAL_EXECUTOR_OBSERVER_OUTSIDE_ATTEMPT"); currentAttempt.retrieval_sql_stage_count += 1; },
    ranking: () => { if (!currentAttempt) failure("GKX_EVAL_EXECUTOR_OBSERVER_OUTSIDE_ATTEMPT"); currentAttempt.ranking_call_count += 1; },
    confidence: () => { if (!currentAttempt) failure("GKX_EVAL_EXECUTOR_OBSERVER_OUTSIDE_ATTEMPT"); currentAttempt.confidence_call_count += 1; },
    citation: () => { if (!currentAttempt) failure("GKX_EVAL_EXECUTOR_OBSERVER_OUTSIDE_ATTEMPT"); currentAttempt.search_citation_verification_count += 1; },
  };
  const sourcePolicy = new Map(derivation.catalog_entry.runtime_policy_inputs.source_discoverability
    .map((row) => [`${row.source_id}\0${row.source_path}`, row.discoverable]));
  const chunkPolicy = new Map(derivation.catalog_entry.runtime_policy_inputs.chunk_discoverability
    .map((row) => [row.chunk_id, row.discoverable]));
  const coordinator = coordinatorFromRetrievalEvaluationDatabase(built.database_path, {
    source_reader: async (sourcePath) => {
      if (!currentAttempt) failure("GKX_EVAL_EXECUTOR_SOURCE_READ_OUTSIDE_ATTEMPT");
      const bytes = derivation.source_bytes_by_path.get(sourcePath);
      if (!bytes) failure("GKX_EVAL_EXECUTOR_SOURCE_MISSING");
      currentAttempt.source_read_count += 1;
      return Buffer.from(bytes);
    },
    source_discoverability_policy: (source) => sourcePolicy.get(`${source.source_id}\0${source.source_path}`) === true ? "allow" : "deny",
    discoverability_policy: (chunk) => chunkPolicy.get(chunk.chunk_id) === true ? "allow" : "deny",
    vector_provider: replay.vector_provider,
    rerank_provider: replay.rerank_provider,
    lineage_view_freshness: "fresh",
    runtime_policy_digest: derivation.catalog_entry.runtime_policy_inputs.runtime_policy_inputs_digest,
  }, observer);
  return {
    derivation,
    replay,
    coordinator,
    set_attempt(value) { currentAttempt = value; },
  };
}

function reviewedPublicView(result: GkxRetrievalSearchResult): Record<string, unknown> {
  return {
    contract_version: RETRIEVAL_EVALUATION_PUBLIC_VIEW_VERSION,
    query_digest: result.query_digest,
    hits: result.hits,
    confidence: result.confidence,
    temporal: result.temporal,
    applied_filters: result.applied_filters,
    eligible_result_count: result.eligible_result_count,
    stages: result.stages,
  };
}

async function createReviewedAbsentOperationStore(input: {
  derivation: RetrievalEvaluationExecutableEnvironmentDerivation;
  transcript: RetrievalEvaluationFixedProviderTranscript;
  source_files: RetrievalEvaluationReviewedBundle["temporal_absent_corpora"][number]["source_files"];
  query: NormalizedRetrievalEvaluationQuery;
  axes: RetrievalEvaluationTuningAxesCoordinate;
  state_root: string;
}): Promise<OperationStore> {
  const { derivation, transcript, query, axes } = input;
  const scenario = derivation.provider_scenario;
  if (!scenario || scenario.embedding_role !== "active" || scenario.reranker_role !== "active") {
    failure("GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_PROVIDER_INVALID");
  }
  const projection = projectAuthoredGkxRetrievalCorpus(input.source_files.map((source) => ({
    relativePath: source.source_path,
    content: Buffer.from(source.source_bytes_base64, "base64").toString("utf8"),
    kind: "note" as const,
  })));
  if (projection.rejections.length !== 0 || projection.sources.length !== input.source_files.length) {
    failure("GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_PROJECTION_INVALID");
  }
  const chunks = projection.sources.flatMap((source) =>
    bindGkxRetrievalCandidateChunks(source.record_key, chunkMarkdown(source.chunk_input)));
  const sourceSnapshotMaterial = {
    contract_version: "gkos-retrieval-evaluation-source-snapshot/1.0.0-draft.1",
    source_observations: input.source_files.map(({ source_id, source_path, source_digest }) =>
      ({ source_id, source_path, source_digest })),
  };
  const chunkPolicy = chunks.map((candidate) => ({
    chunk_id: candidate.chunk.chunk_id,
    source_id: candidate.chunk.source_id,
    discoverable: true,
  })).sort((left, right) => retrievalCodeUnitCompare(stableJson(left), stableJson(right)));
  const policyMaterial = {
    contract_version: "gkos-retrieval-evaluation-runtime-policy-inputs/1.0.0-draft.1",
    source_discoverability: input.source_files.map(({ source_id, source_path }) =>
      ({ source_id, source_path, discoverable: true })),
    chunk_discoverability: chunkPolicy,
  };
  const indexTemplates = deriveRetrievalEvaluationProviderIndexReceipts(chunks, scenario.embedding_index_templates);
  const responseByDigest = new Map(indexTemplates.flatMap((template) => template.responses)
    .map((response) => [response.input_digest, response]));
  const manifest = deriveGkxRetrievalProjectionManifest({
    vault_id: derivation.vault_fixture,
    source_snapshot_digest: retrievalCanonicalDigest(sourceSnapshotMaterial),
    configuration_digest: derivation.manifest.configuration_digest,
    policy_digest: retrievalCanonicalDigest(policyMaterial),
    candidate_sources: projection.sources.map((source) => source.candidate_source),
    candidate_declarations: projection.declarations,
    candidate_chunks: chunks,
    embedding_eligible_candidate_chunk_keys: chunks.map((candidate) => candidate.candidate_chunk_key),
    vectors: chunks.map((candidate) => {
      const response = responseByDigest.get(candidate.chunk.content_digest) ??
        failure("GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_VECTOR_INVALID");
      return {
        candidate_chunk_key: candidate.candidate_chunk_key,
        vector: Array.from(Float32Array.from(response.values_micros, (part) => part / 1_000_000)),
      };
    }),
    embedding_provider_id: transcript.embedding_provider.provider_id,
    embedding_model_id: transcript.embedding_provider.model_id,
    embedding_dimensions: transcript.embedding_provider.dimensions,
  }, derivation.environment_member.environment.lexical_backend);
  const queryIndex = scenario.eval_schedule.query_partition.findIndex((coordinate) =>
    coordinate.query_id === query.id && coordinate.query_digest === query.query_digest);
  const embeddingTemplate = scenario.embedding_query_templates[queryIndex];
  const rerankerOracle = scenario.reranker_query_oracles[queryIndex];
  const cell = scenario.eval_schedule.occurrence_matrix[queryIndex];
  if (queryIndex < 0 || !embeddingTemplate || !rerankerOracle || !cell || cell[0] !== 1 || cell[1] === null || cell[2] === null) {
    failure("GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_OCCURRENCE_INVALID");
  }
  const replay = new FixedProviderReplay(transcript, {
    embedding_role: "active",
    reranker_role: "active",
    embedding_index_templates: indexTemplates,
    embedding_query_templates: [embeddingTemplate],
    reranker_query_oracles: [rerankerOracle],
    schedule: {
      operation: "eval",
      query_count: 1,
      query_partition: [scenario.eval_schedule.query_partition[queryIndex]],
      occurrence_matrix: [cell],
      evaluation_axes: axes,
      expected_provider_counters: {
        vector_provider_call_count: indexTemplates.length + 1,
        vector_provider_item_count: indexTemplates.reduce((sum, template) => sum + template.item_count, 0) + 1,
        rerank_provider_call_count: 1,
        rerank_provider_item_count: cell[2],
      },
    },
  });
  const textByDigest = new Map(chunks.map((candidate) => [candidate.chunk.content_digest, candidate.chunk.text]));
  const indexVectors = await replay.replay_index(textByDigest);
  const built = buildGkxRetrievalGenerationUnactivated({
    state_directory: join(input.state_root, `${derivation.vault_fixture}-reviewed-absent`),
    vault_id: derivation.vault_fixture,
    source_snapshot_digest: manifest.source_snapshot_digest,
    configuration_digest: manifest.configuration_digest,
    policy_digest: manifest.policy_digest,
    candidate_sources: projection.sources.map((source) => source.candidate_source),
    candidate_declarations: projection.declarations,
    candidate_chunks: chunks,
    embedding_eligible_candidate_chunk_keys: chunks.map((candidate) => candidate.candidate_chunk_key),
    vectors: chunks.map((candidate) => {
      const vector = indexVectors.get(candidate.chunk.content_digest) ??
        failure("GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_INDEX_VECTOR_MISSING");
      return { candidate_chunk_key: candidate.candidate_chunk_key, vector: [...vector] };
    }),
    embedding_provider_id: transcript.embedding_provider.provider_id,
    embedding_model_id: transcript.embedding_provider.model_id,
    embedding_dimensions: transcript.embedding_provider.dimensions,
    lexical_backend: derivation.environment_member.environment.lexical_backend,
  });
  same(built.manifest, manifest, "GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_MANIFEST_MISMATCH");
  let currentAttempt: AttemptEvidence | null = null;
  const observer: RetrievalEvaluationCoordinatorObserver = {
    sql_stage: () => { if (!currentAttempt) failure("GKX_EVAL_EXECUTOR_OBSERVER_OUTSIDE_ATTEMPT"); currentAttempt.retrieval_sql_stage_count += 1; },
    ranking: () => { if (!currentAttempt) failure("GKX_EVAL_EXECUTOR_OBSERVER_OUTSIDE_ATTEMPT"); currentAttempt.ranking_call_count += 1; },
    confidence: () => { if (!currentAttempt) failure("GKX_EVAL_EXECUTOR_OBSERVER_OUTSIDE_ATTEMPT"); currentAttempt.confidence_call_count += 1; },
    citation: () => { if (!currentAttempt) failure("GKX_EVAL_EXECUTOR_OBSERVER_OUTSIDE_ATTEMPT"); currentAttempt.search_citation_verification_count += 1; },
  };
  const sourceBytesByPath = new Map(input.source_files.map((source) =>
    [source.source_path, Buffer.from(source.source_bytes_base64, "base64")]));
  const coordinator = coordinatorFromRetrievalEvaluationDatabase(built.database_path, {
    source_reader: async (sourcePath) => {
      if (!currentAttempt) failure("GKX_EVAL_EXECUTOR_SOURCE_READ_OUTSIDE_ATTEMPT");
      const bytes = sourceBytesByPath.get(sourcePath) ?? failure("GKX_EVAL_EXECUTOR_SOURCE_MISSING");
      currentAttempt.source_read_count += 1;
      return Buffer.from(bytes);
    },
    source_discoverability_policy: () => "allow",
    discoverability_policy: () => "allow",
    vector_provider: replay.vector_provider,
    rerank_provider: replay.rerank_provider,
    lineage_view_freshness: "fresh",
    runtime_policy_digest: manifest.policy_digest,
  }, observer);
  return {
    derivation,
    replay,
    coordinator,
    set_attempt(value) { currentAttempt = value; },
  };
}

async function executeQuery(
  store: OperationStore,
  query: NormalizedRetrievalEvaluationQuery,
  axes: RetrievalEvaluationTuningAxesCoordinate,
  occurrenceIndex: number,
  metricCase: RetrievalEvaluationMetricComputationFixture["cases"][number] | null,
): Promise<{ result: GkxRetrievalSearchResult; metrics: RetrievalEvaluationQueryMetrics; counters: RetrievalEvaluationQueryAttemptCounters }> {
  const evidence: AttemptEvidence = {
    source_read_count: 0,
    retrieval_sql_stage_count: 0,
    ranking_call_count: 0,
    confidence_call_count: 0,
    search_citation_verification_count: 0,
    evaluator_citation_verification_count: 0,
  };
  store.replay.begin_occurrence(occurrenceIndex, axes);
  store.set_attempt(evidence);
  let result: GkxRetrievalSearchResult;
  try { result = await store.coordinator.search(searchRequest(query, axes)) as GkxRetrievalSearchResult; }
  finally { store.set_attempt(null); }
  const providerCounters = store.replay.end_occurrence();
  const input = metricCase === null
    ? generalMetricInput(store.derivation, query, result)
    : { ...(metricCase.input as RetrievalEvaluationQueryInput), result };
  const metrics = computeRetrievalEvaluationQueryMetricsForHost(input, () => {
    evidence.evaluator_citation_verification_count += 1;
  });
  return { result, metrics, counters: reviewedCounters(evidence, providerCounters) };
}

async function executeReviewedAbsentPair(input: {
  reviewed: RetrievalEvaluationReviewedBundle;
  metric_fixture: RetrievalEvaluationMetricComputationFixture;
  baseline: RetrievalEvaluationBaseline;
  stores: ReadonlyMap<string, OperationStore>;
  transcript: RetrievalEvaluationFixedProviderTranscript;
  present_attempts: readonly RetrievalEvaluationExecutedQueryAttempt[];
  present_metrics: ReadonlyMap<string, RetrievalEvaluationQueryMetrics>;
  state_root: string;
}): Promise<RetrievalEvaluationExecutedQueryAttempt[]> {
  const pair = input.reviewed.temporal_noninterference_pairs[0];
  const absentCorpus = input.reviewed.temporal_absent_corpora[0];
  const presentCase = input.metric_fixture.cases.find((row) => row.case_id === pair.present_metric_case_id);
  const absentCase = input.metric_fixture.cases.find((row) => row.case_id === pair.absent_metric_case_id);
  const query = input.baseline.normalized_golden.queries.find((row) => row.id === pair.query_id);
  if (!presentCase?.expected_metrics || !absentCase?.expected_metrics || presentCase.expected_status !== "metrics" ||
      absentCase.expected_status !== "metrics" || !query || query.as_of !== pair.as_of ||
      stableJson(presentCase.input.query) !== stableJson(query) || stableJson(absentCase.input.query) !== stableJson(query) ||
      absentCorpus.vault_fixture !== query.vault_fixture ||
      pair.temporal_absent_corpus_fixture_digest !== absentCorpus.absent_corpus_fixture_digest) {
    failure("GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_COORDINATE_INVALID");
  }
  const presentStore = input.stores.get(query.vault_fixture) ??
    failure("GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_STORE_MISSING");
  if (presentStore.derivation.corpus.corpus_fixture_digest !== absentCorpus.present_corpus_fixture_digest) {
    failure("GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_CORPUS_MISMATCH");
  }
  const absentStore = await createReviewedAbsentOperationStore({
    derivation: presentStore.derivation,
    transcript: input.transcript,
    source_files: absentCorpus.source_files,
    query,
    axes: input.baseline.selected_axes,
    state_root: input.state_root,
  });
  let observed: Awaited<ReturnType<typeof executeQuery>>;
  try {
    observed = await executeQuery(absentStore, query, input.baseline.selected_axes, 0, absentCase);
    absentStore.replay.assert_terminal();
  } finally { try { absentStore.coordinator.close(); } catch { /* preserve primary result */ } }

  const presentAttempt = input.present_attempts.find((attempt) => attempt.query_id === query.id) ??
    failure("GKX_EVAL_EXECUTOR_REVIEWED_PRESENT_ATTEMPT_MISSING");
  const presentMetrics = input.present_metrics.get(query.id) ??
    failure("GKX_EVAL_EXECUTOR_REVIEWED_PRESENT_METRICS_MISSING");
  const origin = input.reviewed.result_origins.find((candidate) => candidate.query_id === query.id) ??
    failure("GKX_EVAL_EXECUTOR_REVIEWED_ORIGIN_MISSING");
  same(observed.result, absentCase.input.result, "GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_RESULT_MISMATCH");
  same(observed.metrics, absentCase.expected_metrics, "GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_METRICS_MISMATCH");
  same(observed.metrics, presentMetrics, "GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_METRIC_NONINTERFERENCE_MISMATCH");
  // The one-time absent index replay is independently terminal-checked above;
  // the ratified query counter envelope intentionally begins after that replay.
  same(observed.counters, presentAttempt.counters, "GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_COUNTER_MISMATCH");
  same(observed.counters, origin.query_attempt_counters, "GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_ORIGIN_COUNTER_MISMATCH");
  const presentView = reviewedPublicView(presentAttempt.result);
  const absentView = reviewedPublicView(observed.result);
  same(absentView, presentView, "GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_PUBLIC_VIEW_MISMATCH");
  if (retrievalCanonicalDigest(absentView) !== pair.public_view_digest ||
      observed.metrics.query_metrics_digest !== pair.query_metrics_digest ||
      observed.counters.counter_digest !== pair.query_counter_digest) {
    failure("GKX_EVAL_EXECUTOR_REVIEWED_ABSENT_PAIR_DIGEST_MISMATCH");
  }
  return [{ query_id: query.id, result: observed.result, metrics: observed.metrics, counters: observed.counters }];
}

async function prepareExecution(
  input: RetrievalEvaluationExecutableInput,
  operation: "eval" | "tune",
  stateRoot: string,
): Promise<{
  baseline: RetrievalEvaluationBaseline;
  reviewed: RetrievalEvaluationReviewedBundle | null;
  stores: Map<string, OperationStore>;
  queries: Map<string, NormalizedRetrievalEvaluationQuery>;
  provider_transcript: RetrievalEvaluationFixedProviderTranscript | null;
  non_comparable: boolean;
}> {
  const derived = deriveRetrievalEvaluationExecutableEnvironmentBundle(input.environment_bundle);
  const baseline = sealRetrievalEvaluationBaseline(input.baseline);
  const authority = sealRetrievalEvaluationExecutionAuthority(input.execution_authority);
  const projectionManifestSetDigest = retrievalCanonicalDigest({
    contract_version: RETRIEVAL_EVALUATION_PROJECTION_MANIFEST_SET_VERSION,
    manifests: derived.bundle.environment_set.members.map((member) => {
      const derivation = derived.derivations.find((item) => item.vault_fixture === member.environment.vault_fixture) ??
        failure("GKX_EVAL_EXECUTION_AUTHORITY_COORDINATE_INVALID");
      return {
        vault_fixture: derivation.vault_fixture,
        projection_id: derivation.manifest.projection_id,
        projection_digest: derivation.manifest.projection_digest,
      };
    }),
  });
  if (authority.normalized_golden_digest !== derived.bundle.normalized_golden.golden_digest ||
      authority.environment_set_digest !== derived.bundle.environment_set.environment_set_digest ||
      authority.baseline_digest !== baseline.baseline_digest ||
      baseline.normalized_golden_digest !== derived.bundle.normalized_golden.golden_digest ||
      baseline.environment_set_digest !== derived.bundle.environment_set.environment_set_digest ||
      authority.fixture_catalog_digest !== derived.bundle.fixture_catalog.catalog_digest ||
      authority.source_corpus_digest !== derived.bundle.source_corpus.source_corpus_digest ||
      authority.fixed_provider_digest !== (derived.bundle.fixed_provider_transcript?.provider_fixture_digest ?? null) ||
      authority.metric_computation_fixture_digest !== input.metric_computation_fixture.fixture_digest ||
      authority.ndcg_table_digest !== RETRIEVAL_EVALUATION_NDCG_TABLE.table_digest ||
      authority.projection_manifest_set_digest !== projectionManifestSetDigest ||
      authority.reviewed_bundle_digest !== (input.reviewed_bundle?.reviewed_bundle_digest ?? null)) {
    failure("GKX_EVAL_EXECUTION_AUTHORITY_COORDINATE_INVALID");
  }
  const reviewed = input.reviewed_bundle === null ? null : sealRetrievalEvaluationExecutableReviewedBundle({
    reviewed_bundle: input.reviewed_bundle,
    environment_bundle: derived.bundle,
    baseline,
    metric_computation_fixture: input.metric_computation_fixture,
  });
  const transcript = derived.bundle.fixed_provider_transcript;
  if (!transcript && derived.derivations.some((derivation) => derivation.provider_scenario !== null)) {
    failure("GKX_EVAL_EXECUTOR_PROVIDER_TRANSCRIPT_MISSING");
  }
  const nonComparable = baseline.base_configuration_digest !==
    retrievalEvaluationExecutionBaseConfigurationForHost().base_configuration_digest;
  if (derived.derivations.some((derivation) => derivation.provider_scenario !== null &&
      stableJson(derivation.provider_scenario.eval_schedule.evaluation_axes) !== stableJson(baseline.selected_axes))) {
    failure("GKX_EVAL_EXECUTOR_EVAL_AXES_MISMATCH");
  }
  if (operation === "eval" && nonComparable) {
    return {
      baseline,
      reviewed,
      stores: new Map(),
      queries: new Map(baseline.normalized_golden.queries.map((query) => [query.id, query])),
      provider_transcript: transcript,
      non_comparable: true,
    };
  }
  const stores = new Map<string, OperationStore>();
  try {
    for (const derivation of derived.derivations) {
      const store = await createOperationStore(derivation, transcript, operation, stateRoot);
      stores.set(derivation.vault_fixture, store);
    }
  } catch (error) {
    closeStores(stores);
    throw error;
  }
  return {
    baseline,
    reviewed,
    stores,
    queries: new Map(baseline.normalized_golden.queries.map((query) => [query.id, query])),
    provider_transcript: transcript,
    non_comparable: false,
  };
}

function closeStores(stores: ReadonlyMap<string, OperationStore>): void {
  for (const store of stores.values()) {
    try { store.coordinator.close(); } catch { /* preserve primary result */ }
  }
}

export async function executeRetrievalEvaluationEval(
  input: RetrievalEvaluationExecutableInput,
  stateRoot: string,
): Promise<RetrievalEvaluationEvalExecution> {
  const prepared = await prepareExecution(input, "eval", stateRoot);
  if (prepared.non_comparable) {
    const comparison = compareRetrievalEvaluationBaseline({
      current_environment_set: prepared.baseline.environment_set,
      current_base_configuration: retrievalEvaluationExecutionBaseConfigurationForHost(),
      current_tuning_grid: prepared.baseline.tuning_grid,
      current_tuning_axes: prepared.baseline.selected_axes,
      current_golden: prepared.baseline.normalized_golden,
      current_metrics_set: prepared.baseline.metrics_set,
      current_relative_ndcg_budget: prepared.baseline.relative_ndcg_budget,
      baseline: prepared.baseline,
    });
    if (comparison.status !== "needs_human") failure("GKX_EVAL_EXECUTOR_COMPARABILITY_INVALID");
    return { comparison, metrics_set: prepared.baseline.metrics_set, query_attempts: [], reviewed_absent_query_attempts: [] };
  }
  const metricsById = new Map<string, RetrievalEvaluationQueryMetrics>();
  const queryAttempts: RetrievalEvaluationExecutedQueryAttempt[] = [];
  try {
    const originById = new Map((prepared.reviewed?.result_origins ?? []).map((origin) => [origin.query_id, origin]));
    for (const query of prepared.baseline.normalized_golden.queries) {
      const store = prepared.stores.get(query.vault_fixture) ?? failure("GKX_EVAL_EXECUTOR_QUERY_STORE_MISSING");
      const partition = store.derivation.provider_scenario?.eval_schedule.query_partition ??
        store.derivation.environment_member.query_partition;
      const localIndex = partition.findIndex((row) => row.query_id === query.id);
      if (localIndex < 0) failure("GKX_EVAL_EXECUTOR_QUERY_PARTITION_MISSING");
      const metricCase = prepared.reviewed === null ? null : metricCaseByQuery(input.metric_computation_fixture, query.id);
      const observed = await executeQuery(store, query, prepared.baseline.selected_axes, localIndex, metricCase);
      if (prepared.reviewed !== null) {
        const origin = originById.get(query.id) ?? failure("GKX_EVAL_EXECUTOR_RESULT_ORIGIN_MISSING");
        same(observed.result, metricCase!.input.result, "GKX_EVAL_EXECUTOR_REVIEWED_RESULT_MISMATCH");
        same(observed.metrics, metricCase!.expected_metrics, "GKX_EVAL_EXECUTOR_REVIEWED_METRICS_MISMATCH");
        same(observed.counters, origin.query_attempt_counters, "GKX_EVAL_EXECUTOR_REVIEWED_COUNTER_MISMATCH");
        if (retrievalCanonicalDigest(observed.result) !== origin.public_result_digest ||
            observed.metrics.query_metrics_digest !== origin.query_metrics_digest) {
          failure("GKX_EVAL_EXECUTOR_REVIEWED_ORIGIN_MISMATCH");
        }
      }
      metricsById.set(query.id, observed.metrics);
      queryAttempts.push({ query_id: query.id, result: observed.result, metrics: observed.metrics, counters: observed.counters });
    }
    for (const store of prepared.stores.values()) store.replay.assert_terminal();
    const reviewedAbsentAttempts = prepared.reviewed === null ? [] : await executeReviewedAbsentPair({
      reviewed: prepared.reviewed,
      metric_fixture: input.metric_computation_fixture,
      baseline: prepared.baseline,
      stores: prepared.stores,
      transcript: prepared.provider_transcript ?? failure("GKX_EVAL_EXECUTOR_REVIEWED_PROVIDER_MISSING"),
      present_attempts: queryAttempts,
      present_metrics: metricsById,
      state_root: stateRoot,
    });
    const metricsSet = buildRetrievalEvaluationMetricsSetForHost({
      environment_set: prepared.baseline.environment_set,
      normalized_golden: prepared.baseline.normalized_golden,
      query_metrics: prepared.baseline.normalized_golden.queries.map((query) => metricsById.get(query.id) ??
        failure("GKX_EVAL_EXECUTOR_QUERY_METRICS_MISSING")),
    });
    if (prepared.reviewed !== null) {
      same(metricsSet, prepared.baseline.metrics_set, "GKX_EVAL_EXECUTOR_REVIEWED_METRICS_SET_MISMATCH");
    }
    const comparison = compareRetrievalEvaluationBaseline({
      current_environment_set: prepared.baseline.environment_set,
      current_base_configuration: retrievalEvaluationExecutionBaseConfigurationForHost(),
      current_tuning_grid: prepared.baseline.tuning_grid,
      current_tuning_axes: prepared.baseline.selected_axes,
      current_golden: prepared.baseline.normalized_golden,
      current_metrics_set: metricsSet,
      current_relative_ndcg_budget: prepared.baseline.relative_ndcg_budget,
      baseline: prepared.baseline,
    });
    return {
      comparison,
      metrics_set: metricsSet,
      query_attempts: queryAttempts,
      reviewed_absent_query_attempts: reviewedAbsentAttempts,
    };
  } finally { closeStores(prepared.stores); }
}

export async function executeRetrievalEvaluationTune(
  input: RetrievalEvaluationExecutableInput,
  stateRoot: string,
): Promise<RetrievalEvaluationTuneExecution> {
  assertRetrievalEvaluationTuneBaselineForHost(input.baseline);
  const prepared = await prepareExecution(input, "tune", stateRoot);
  const axesRows = retrievalEvaluationEligibleTuningAxesForHost(prepared.baseline);
  const candidates = [];
  try {
    for (let axesIndex = 0; axesIndex < axesRows.length; axesIndex += 1) {
      const axes = axesRows[axesIndex];
      const metricsById = new Map<string, RetrievalEvaluationQueryMetrics>();
      for (const query of prepared.baseline.normalized_golden.queries) {
        const store = prepared.stores.get(query.vault_fixture) ?? failure("GKX_EVAL_EXECUTOR_QUERY_STORE_MISSING");
        const schedule = store.derivation.provider_scenario?.tune_schedule ?? null;
        const partition = schedule?.query_partition ?? store.derivation.environment_member.query_partition;
        const localIndex = partition.findIndex((row) => row.query_id === query.id);
        if (localIndex < 0) failure("GKX_EVAL_EXECUTOR_QUERY_PARTITION_MISSING");
        const occurrenceIndex = axesIndex * partition.length + localIndex;
        const observed = await executeQuery(store, query, axes, occurrenceIndex,
          prepared.reviewed === null ? null : metricCaseByQuery(input.metric_computation_fixture, query.id));
        metricsById.set(query.id, observed.metrics);
      }
      const metricsSet = buildRetrievalEvaluationMetricsSetForHost({
        environment_set: prepared.baseline.environment_set,
        normalized_golden: prepared.baseline.normalized_golden,
        query_metrics: prepared.baseline.normalized_golden.queries.map((query) => metricsById.get(query.id) ??
          failure("GKX_EVAL_EXECUTOR_QUERY_METRICS_MISSING")),
      });
      candidates.push(buildRetrievalEvaluationTuneCandidateForHost({ baseline: prepared.baseline, axes, metrics_set: metricsSet }));
    }
    for (const store of prepared.stores.values()) store.replay.assert_terminal();
    const selection = selectRetrievalEvaluationTuneCandidate({ baseline: prepared.baseline, candidates });
    return {
      selection,
      candidate_config: selection.selected_candidate === null ? null :
        retrievalEvaluationCandidateConfigMaterial(selection.selected_candidate.axes),
    };
  } finally { closeStores(prepared.stores); }
}
