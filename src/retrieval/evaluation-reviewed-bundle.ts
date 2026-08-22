import { Buffer } from "node:buffer";
import {
  RETRIEVAL_EVALUATION_SOURCE_CORPUS_VERSION,
  deriveRetrievalEvaluationProviderIndexReceipts,
  deriveRetrievalEvaluationExecutableEnvironmentBundle,
  sealRetrievalEvaluationEnvironmentBundle,
  sealRetrievalEvaluationSourceCorpus,
  type RetrievalEvaluationEnvironmentBundle,
  type RetrievalEvaluationSourceCorpus,
} from "./evaluation-fixtures";
import {
  computeRetrievalEvaluationQueryMetrics,
  isValidRetrievalEvaluationSourcePath,
  sealRetrievalEvaluationBaseline,
  type NormalizedRetrievalEvaluationQuery,
  type RetrievalEvaluationBaseline,
  type RetrievalEvaluationQueryInput,
  type RetrievalEvaluationQueryMetrics,
} from "./evaluation";
import { isValidGkxAuthoredUid } from "../gkx23";
import { deriveRetrievalEvaluationReviewedResult } from "./evaluation-reviewed-result";
import { retrievalCanonicalDigest, retrievalCodeUnitCompare, retrievalSha256, stableJson } from "./digest";
import { projectAuthoredGkxRetrievalCorpus } from "./gkx-provenance";
import { chunkMarkdown } from "./chunker";
import { bindGkxRetrievalCandidateChunks } from "./candidate-types";
import { deriveGkxRetrievalProjectionManifest } from "./sqlite-store";
import { buildGkxRetrievalAuthorizedCandidateView, type GkxRetrievalAuthorizedCandidateView } from "./authorized-view";
import { gkxRetrievalLineageResultCoordinate } from "./coordinator";

export const RETRIEVAL_EVALUATION_REVIEWED_BUNDLE_VERSION = "gkos-retrieval-evaluation-reviewed-bundle/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_PROJECTION_MANIFEST_SET_VERSION = "gkos-retrieval-evaluation-projection-manifest-set/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_RESULT_ORIGIN_VERSION = "gkos-retrieval-evaluation-result-origin/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_RESULT_ORIGIN_SET_VERSION = "gkos-retrieval-evaluation-result-origin-set/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_QUERY_ATTEMPT_COUNTERS_VERSION = "gkos-retrieval-evaluation-query-attempt-counters/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_TEMPORAL_ABSENT_CORPUS_VERSION = "gkos-retrieval-evaluation-temporal-absent-corpus/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_PUBLIC_VIEW_VERSION = "gkos-retrieval-evaluation-public-view/1.0.0-draft.1" as const;
export const RETRIEVAL_EVALUATION_TEMPORAL_NONINTERFERENCE_PAIR_VERSION = "gkos-retrieval-evaluation-temporal-noninterference-pair/1.0.0-draft.1" as const;

const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const TOP_KEYS = [
  "contract_version", "conformance_file", "golden_toml_file", "source_corpus_file", "fixture_catalog_file",
  "fixed_provider_file", "metric_computation_file", "normalized_golden_digest", "source_corpus_digest",
  "fixture_catalog_digest", "fixed_provider_digest", "environment_set_digest", "baseline_digest",
  "metric_computation_fixture_digest", "projection_manifest_set_digest", "result_origins",
  "result_origin_set_digest", "temporal_absent_corpora", "temporal_noninterference_pairs", "reviewed_bundle_digest",
] as const;
const COUNTER_KEYS = [
  "contract_version", "authority_input_snapshot_count", "source_read_count", "retrieval_sql_stage_count",
  "vector_provider_call_count", "vector_provider_item_count", "rerank_provider_call_count", "rerank_provider_item_count",
  "ranking_call_count", "confidence_call_count", "citation_verification_count", "metric_computation_count", "counter_digest",
] as const;
const ORIGIN_KEYS = [
  "contract_version", "query_id", "golden_query_digest", "metric_case_id", "metric_case_digest", "vault_fixture",
  "environment_digest", "environment_member_digest", "catalog_entry_digest", "corpus_fixture_digest",
  "manifest_projection_id", "manifest_projection_digest", "result_projection_id", "result_projection_digest",
  "lexical_backend", "provider_scenario_digest", "eval_schedule_digest", "eval_occurrence_ordinal",
  "embedding_query_template_digest", "reranker_query_oracle_digest", "reranker_request_digest",
  "query_attempt_counters", "public_result_digest", "query_metrics_digest", "origin_digest",
] as const;
const ABSENT_CORPUS_KEYS = [
  "contract_version", "vault_fixture", "present_corpus_fixture_digest", "removed_source_id", "removed_source_path",
  "removed_source_digest", "source_files", "absent_corpus_fixture_digest",
] as const;
const TEMPORAL_PAIR_KEYS = [
  "contract_version", "pair_id", "present_metric_case_id", "absent_metric_case_id", "query_id", "as_of",
  "temporal_absent_corpus_fixture_digest", "public_view_digest", "query_metrics_digest", "query_counter_digest", "pair_digest",
] as const;
const PROJECTION_ID_RE = /^retrieval:[0-9a-f]{24}$/u;

export interface RetrievalEvaluationQueryAttemptCounters {
  contract_version: typeof RETRIEVAL_EVALUATION_QUERY_ATTEMPT_COUNTERS_VERSION;
  authority_input_snapshot_count: number;
  source_read_count: number;
  retrieval_sql_stage_count: number;
  vector_provider_call_count: number;
  vector_provider_item_count: number;
  rerank_provider_call_count: number;
  rerank_provider_item_count: number;
  ranking_call_count: number;
  confidence_call_count: number;
  citation_verification_count: number;
  metric_computation_count: number;
  counter_digest: string;
}

export interface RetrievalEvaluationResultOrigin {
  contract_version: typeof RETRIEVAL_EVALUATION_RESULT_ORIGIN_VERSION;
  query_id: string;
  golden_query_digest: string;
  metric_case_id: string;
  metric_case_digest: string;
  vault_fixture: string;
  environment_digest: string;
  environment_member_digest: string;
  catalog_entry_digest: string;
  corpus_fixture_digest: string;
  manifest_projection_id: string;
  manifest_projection_digest: string;
  result_projection_id: string;
  result_projection_digest: string;
  lexical_backend: "sqlite_fts5" | "sqlite_lexical_scan";
  provider_scenario_digest: string;
  eval_schedule_digest: string;
  eval_occurrence_ordinal: number;
  embedding_query_template_digest: string;
  reranker_query_oracle_digest: string;
  reranker_request_digest: string;
  query_attempt_counters: RetrievalEvaluationQueryAttemptCounters;
  public_result_digest: string;
  query_metrics_digest: string;
  origin_digest: string;
}

export interface RetrievalEvaluationTemporalAbsentCorpus {
  contract_version: typeof RETRIEVAL_EVALUATION_TEMPORAL_ABSENT_CORPUS_VERSION;
  vault_fixture: string;
  present_corpus_fixture_digest: string;
  removed_source_id: string;
  removed_source_path: string;
  removed_source_digest: string;
  source_files: RetrievalEvaluationSourceCorpus["corpora"][number]["source_files"];
  absent_corpus_fixture_digest: string;
}

export interface RetrievalEvaluationTemporalNoninterferencePair {
  contract_version: typeof RETRIEVAL_EVALUATION_TEMPORAL_NONINTERFERENCE_PAIR_VERSION;
  pair_id: string;
  present_metric_case_id: string;
  absent_metric_case_id: string;
  query_id: string;
  as_of: string;
  temporal_absent_corpus_fixture_digest: string;
  public_view_digest: string;
  query_metrics_digest: string;
  query_counter_digest: string;
  pair_digest: string;
}

export interface RetrievalEvaluationReviewedBundle {
  contract_version: typeof RETRIEVAL_EVALUATION_REVIEWED_BUNDLE_VERSION;
  conformance_file: "conformance-fixture.json";
  golden_toml_file: "golden-fixture.toml";
  source_corpus_file: "source-corpus.json";
  fixture_catalog_file: "fixture-catalog.json";
  fixed_provider_file: "fixed-provider.json";
  metric_computation_file: "metric-computation-fixture.json";
  normalized_golden_digest: string;
  source_corpus_digest: string;
  fixture_catalog_digest: string;
  fixed_provider_digest: string;
  environment_set_digest: string;
  baseline_digest: string;
  metric_computation_fixture_digest: string;
  projection_manifest_set_digest: string;
  result_origins: RetrievalEvaluationResultOrigin[];
  result_origin_set_digest: string;
  temporal_absent_corpora: RetrievalEvaluationTemporalAbsentCorpus[];
  temporal_noninterference_pairs: RetrievalEvaluationTemporalNoninterferencePair[];
  reviewed_bundle_digest: string;
}

interface MetricFixtureCase {
  case_id: string;
  coverage: string[];
  parity_group: string | null;
  input_schema_valid: boolean;
  expected_status: "metrics" | "error";
  input: RetrievalEvaluationQueryInput;
  expected_metrics: RetrievalEvaluationQueryMetrics | null;
  expected_code: string | null;
  case_digest: string;
}

export interface RetrievalEvaluationMetricComputationFixture {
  contract_version: "gkos-retrieval-evaluation-metric-computation-fixture/1.0.0-draft.1";
  cases: MetricFixtureCase[];
  fixture_digest: string;
}

export interface RetrievalEvaluationReviewedBundleBuildInput {
  environment_bundle: RetrievalEvaluationEnvironmentBundle;
  baseline: RetrievalEvaluationBaseline;
  metric_computation_fixture: RetrievalEvaluationMetricComputationFixture;
}

function failure(code: string): never { throw new TypeError(code); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[], code: string): void {
  if (stableJson(Object.keys(value).sort(retrievalCodeUnitCompare)) !== stableJson([...keys].sort(retrievalCodeUnitCompare))) failure(code);
}
function digestExcluding(value: Record<string, unknown>, key: string): string {
  const material = { ...value };
  delete material[key];
  return retrievalCanonicalDigest(material);
}
function sealed<T extends Record<string, unknown>, K extends string>(material: T, key: K): T & Record<K, string> {
  return { ...material, [key]: retrievalCanonicalDigest(material) } as T & Record<K, string>;
}

function validReviewedId(value: unknown): value is string {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") >= 1 && Buffer.byteLength(value, "utf8") <= 128 && ID_RE.test(value);
}

function sealReviewedCounters(value: unknown): RetrievalEvaluationQueryAttemptCounters {
  const item = value as Record<string, unknown>;
  exactKeys(item, COUNTER_KEYS, "GKX_EVAL_REVIEWED_COUNTER_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_QUERY_ATTEMPT_COUNTERS_VERSION) {
    failure("GKX_EVAL_REVIEWED_COUNTER_COORDINATE_INVALID");
  }
  for (const field of COUNTER_KEYS.slice(1, -1)) {
    const count = item[field];
    if (!Number.isSafeInteger(count) || (count as number) < 0) failure("GKX_EVAL_REVIEWED_COUNTER_COORDINATE_INVALID");
  }
  if (item.authority_input_snapshot_count !== 1 || item.ranking_call_count !== 1 || item.confidence_call_count !== 1 ||
      item.metric_computation_count !== 1 || (item.vector_provider_call_count === 0) !== (item.vector_provider_item_count === 0) ||
      item.rerank_provider_call_count === 0 && item.rerank_provider_item_count !== 0 ||
      (item.rerank_provider_item_count as number) > 160 || (item.citation_verification_count as number) > 512 ||
      item.counter_digest !== digestExcluding(item, "counter_digest")) {
    failure("GKX_EVAL_REVIEWED_COUNTER_RELATION_INVALID");
  }
  return item as unknown as RetrievalEvaluationQueryAttemptCounters;
}

function validateReviewedAbsentCorpus(value: unknown): RetrievalEvaluationTemporalAbsentCorpus {
  const item = value as Record<string, unknown>;
  exactKeys(item, ABSENT_CORPUS_KEYS, "GKX_EVAL_REVIEWED_ABSENT_CORPUS_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_TEMPORAL_ABSENT_CORPUS_VERSION || !validReviewedId(item.vault_fixture) ||
      !isValidGkxAuthoredUid(item.removed_source_id) || typeof item.removed_source_path !== "string" ||
      !isValidRetrievalEvaluationSourcePath(item.removed_source_path) || !SHA256_RE.test(item.present_corpus_fixture_digest as string) ||
      !SHA256_RE.test(item.removed_source_digest as string) || !Array.isArray(item.source_files) || item.source_files.length < 1 ||
      item.source_files.length > 4_096 || item.absent_corpus_fixture_digest !== digestExcluding(item, "absent_corpus_fixture_digest")) {
    failure("GKX_EVAL_REVIEWED_ABSENT_CORPUS_INVALID");
  }
  const sourceFiles = item.source_files as RetrievalEvaluationTemporalAbsentCorpus["source_files"];
  const corpusDigestMaterial = {
    contract_version: RETRIEVAL_EVALUATION_SOURCE_CORPUS_VERSION,
    vault_fixture: item.vault_fixture,
    source_files: sourceFiles,
  };
  const corpusEntry = {
    vault_fixture: item.vault_fixture,
    source_files: sourceFiles,
    corpus_fixture_digest: retrievalCanonicalDigest(corpusDigestMaterial),
  };
  const sourceCorpusMaterial = { contract_version: RETRIEVAL_EVALUATION_SOURCE_CORPUS_VERSION, corpora: [corpusEntry] };
  sealRetrievalEvaluationSourceCorpus({ ...sourceCorpusMaterial, source_corpus_digest: retrievalCanonicalDigest(sourceCorpusMaterial) });
  if (sourceFiles.some((source) => source.source_id === item.removed_source_id || source.source_path === item.removed_source_path)) {
    failure("GKX_EVAL_REVIEWED_ABSENT_CORPUS_INVALID");
  }
  return item as unknown as RetrievalEvaluationTemporalAbsentCorpus;
}

function countersFor(
  sourceReadCount: number,
  lexicalBackend: "sqlite_fts5" | "sqlite_lexical_scan",
  vectorCall: 0 | 1,
  rerankerRequestDigest: string | null,
  rerankerItemCount: number | null,
  citationCount: number,
): RetrievalEvaluationQueryAttemptCounters {
  const material = {
    contract_version: RETRIEVAL_EVALUATION_QUERY_ATTEMPT_COUNTERS_VERSION,
    authority_input_snapshot_count: 1,
    source_read_count: sourceReadCount,
    retrieval_sql_stage_count: 1 + vectorCall,
    vector_provider_call_count: vectorCall,
    vector_provider_item_count: vectorCall,
    rerank_provider_call_count: rerankerRequestDigest === null ? 0 : 1,
    rerank_provider_item_count: rerankerItemCount ?? 0,
    ranking_call_count: 1,
    confidence_call_count: 1,
    citation_verification_count: citationCount,
    metric_computation_count: 1,
  };
  void lexicalBackend;
  return sealed(material, "counter_digest") as RetrievalEvaluationQueryAttemptCounters;
}

function publicViewMaterial(result: RetrievalEvaluationQueryInput["result"]): Record<string, unknown> {
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

function assertMetricFixture(fixture: RetrievalEvaluationMetricComputationFixture): void {
  if (fixture.contract_version !== "gkos-retrieval-evaluation-metric-computation-fixture/1.0.0-draft.1" ||
      fixture.fixture_digest !== digestExcluding(fixture as unknown as Record<string, unknown>, "fixture_digest") ||
      fixture.cases.length < 1 || fixture.cases.length > 256) failure("GKX_EVAL_REVIEWED_METRIC_FIXTURE_INVALID");
  for (const row of fixture.cases) {
    if (row.case_digest !== digestExcluding(row as unknown as Record<string, unknown>, "case_digest")) {
      failure("GKX_EVAL_REVIEWED_METRIC_CASE_DIGEST_INVALID");
    }
  }
}

function expectedTemporalFromAuditView(
  result: RetrievalEvaluationQueryInput["result"],
  view: GkxRetrievalAuthorizedCandidateView,
): RetrievalEvaluationQueryInput["expected_temporal"] {
  const temporalBySource = new Map(view.temporal_sources.map((source) => [source.source_id, source]));
  return {
    coverage: result.temporal.coverage,
    hits: result.hits.map((hit) => {
      const temporal = temporalBySource.get(hit.chunk.source_id) ?? failure("GKX_EVAL_REVIEWED_EXPECTED_TEMPORAL_INVALID");
      if (!(["current", "historical", "unknown"] as string[]).includes(temporal.temporal_state)) {
        failure("GKX_EVAL_REVIEWED_EXPECTED_TEMPORAL_INVALID");
      }
      return {
        source_id: temporal.source_id,
        temporal_state: temporal.temporal_state as "current" | "historical" | "unknown",
        valid_from: temporal.valid_from,
        valid_to: temporal.valid_to,
        supersedes: [...temporal.supersedes],
        superseded_by: [...temporal.superseded_by],
      };
    }),
  };
}

export function buildRetrievalEvaluationReviewedBundle(
  input: RetrievalEvaluationReviewedBundleBuildInput,
): RetrievalEvaluationReviewedBundle {
  const derivedBundle = deriveRetrievalEvaluationExecutableEnvironmentBundle(input.environment_bundle);
  const bundle = derivedBundle.bundle;
  const baseline = sealRetrievalEvaluationBaseline(input.baseline);
  assertMetricFixture(input.metric_computation_fixture);
  if (stableJson(baseline.environment_set) !== stableJson(bundle.environment_set) ||
      stableJson(baseline.normalized_golden) !== stableJson(bundle.normalized_golden) ||
      baseline.normalized_golden_digest !== bundle.normalized_golden.golden_digest ||
      baseline.environment_set_digest !== bundle.environment_set.environment_set_digest ||
      baseline.metrics_set.query_count !== bundle.normalized_golden.queries.length || bundle.normalized_golden.queries.length !== 24) {
    failure("GKX_EVAL_REVIEWED_BASELINE_COORDINATE_INVALID");
  }
  const provider = bundle.fixed_provider_transcript;
  if (!provider) failure("GKX_EVAL_REVIEWED_PROVIDER_REQUIRED");
  const derivationByVault = new Map(derivedBundle.derivations.map((item) => [item.vault_fixture, item]));
  const baselineMetricByQuery = new Map(baseline.metrics_set.query_evaluations.map((row) => [row.query_metrics.query_id, row]));
  const reviewedCases = input.metric_computation_fixture.cases
    .filter((row) => row.parity_group === "reviewed-24-query-set" && row.expected_status === "metrics");
  if (reviewedCases.length !== 24 || stableJson(reviewedCases.map((row) => row.input.query.id)) !==
      stableJson(bundle.normalized_golden.queries.map((query) => query.id)) || reviewedCases.some((row, index) =>
        row.case_id !== `reviewed-${bundle.normalized_golden.queries[index].id}`)) {
    failure("GKX_EVAL_REVIEWED_METRIC_CASE_SET_INVALID");
  }
  const reviewedCaseByQuery = new Map(reviewedCases.map((row) => [row.input.query.id, row]));

  const origins: RetrievalEvaluationResultOrigin[] = [];
  const counterByQuery = new Map<string, RetrievalEvaluationQueryAttemptCounters>();
  for (const query of bundle.normalized_golden.queries) {
    const derivation = derivationByVault.get(query.vault_fixture);
    const row = reviewedCaseByQuery.get(query.id);
    const baselineRow = baselineMetricByQuery.get(query.id);
    const scenario = derivation?.provider_scenario;
    if (!derivation || !row || !row.expected_metrics || !baselineRow || !scenario ||
        scenario.embedding_role !== "active" || scenario.reranker_role !== "active" ||
        derivation.environment_member.environment.embedding_role.state !== "active" ||
        derivation.environment_member.environment.reranker_role.state !== "active" ||
        derivation.environment_member.environment.embedding_role.provider_kind !== "local_onnx" ||
        derivation.environment_member.environment.reranker_role.provider_kind !== "local_onnx") {
      failure("GKX_EVAL_REVIEWED_ORIGIN_COORDINATE_INVALID");
    }
    if (stableJson(row.input.query) !== stableJson(query)) failure("GKX_EVAL_REVIEWED_QUERY_BINDING_INVALID");
    const queryIndex = derivation.environment_member.query_partition.findIndex((coordinate) =>
      coordinate.query_id === query.id && coordinate.query_digest === query.query_digest);
    if (queryIndex < 0 || stableJson(scenario.eval_schedule.evaluation_axes) !== stableJson(baseline.selected_axes) ||
        scenario.tune_schedule === null || stableJson(scenario.tune_schedule.tuning_grid) !== stableJson(baseline.tuning_grid)) {
      failure("GKX_EVAL_REVIEWED_SCHEDULE_BINDING_INVALID");
    }
    const embeddingTemplate = scenario.embedding_query_templates[queryIndex];
    const rerankerOracle = scenario.reranker_query_oracles[queryIndex];
    const cell = scenario.eval_schedule.occurrence_matrix[queryIndex];
    if (!embeddingTemplate || !rerankerOracle || !cell || cell[0] !== 1 || cell[1] === null || cell[2] === null) {
      failure("GKX_EVAL_REVIEWED_PROVIDER_OCCURRENCE_INVALID");
    }
    const reviewed = deriveRetrievalEvaluationReviewedResult({
      query,
      manifest: derivation.manifest,
      environment: derivation.environment_member.environment,
      selected_axes: baseline.selected_axes,
      candidate_sources: derivation.policy_candidate_sources,
      candidate_declarations: derivation.policy_candidate_declarations,
      candidate_chunks: derivation.policy_candidate_chunks,
      source_bytes_by_path: derivation.source_bytes_by_path,
      embedding_index_templates: scenario.embedding_index_templates,
      embedding_query_template: embeddingTemplate,
      reranker_query_oracle: rerankerOracle,
    });
    const auditAuthorizedIds = new Set(derivation.catalog_entry.evaluation_audit_oracle.authorized_source_ids);
    const auditAuthorizedPaths = new Set(derivation.catalog_entry.evaluation_audit_oracle.authorized_source_paths);
    const auditRecordKeys = new Set(derivation.projection.sources.filter((source) =>
      auditAuthorizedIds.has(source.candidate_source.source_id) && auditAuthorizedPaths.has(source.candidate_source.source_path))
      .map((source) => source.record_key));
    const auditSources = derivation.projection.sources.filter((source) => auditRecordKeys.has(source.record_key))
      .map((source) => source.candidate_source);
    const auditDeclarations = derivation.projection.declarations.filter((declaration) => auditRecordKeys.has(declaration.source_record_key));
    const auditChunks = derivation.candidate_chunks.filter((candidate) => auditRecordKeys.has(candidate.record_key));
    const auditView = buildGkxRetrievalAuthorizedCandidateView(auditSources, auditDeclarations, auditChunks, query.as_of);
    const auditCoordinate = gkxRetrievalLineageResultCoordinate(derivation.manifest, auditView.sources, auditView.temporal_sources);
    if (reviewed.result_projection_id !== auditCoordinate.projection_id || reviewed.result_projection_digest !== auditCoordinate.projection_digest) {
      failure("GKX_EVAL_REVIEWED_QUERY_VIEW_RESULT_COORDINATE_INVALID");
    }
    if (stableJson(reviewed.result) !== stableJson(row.input.result)) failure("GKX_EVAL_REVIEWED_PUBLIC_RESULT_INVALID");
    const expectedObservations = derivation.corpus.source_files.map(({ source_id, source_path, source_digest, source_bytes_base64 }) =>
      ({ source_id, source_path, source_digest, source_bytes_base64 }));
    if (stableJson(row.input.source_observations) !== stableJson(expectedObservations) ||
        stableJson(row.input.expected_temporal) !== stableJson(expectedTemporalFromAuditView(reviewed.result, auditView))) {
      failure("GKX_EVAL_REVIEWED_METRIC_INPUT_INVALID");
    }
    const catalogOracle = derivation.catalog_entry.evaluation_audit_oracle;
    const expectedOracle = {
      contract_version: "gkos-retrieval-evaluation-query-view-audit-oracle/1.0.0-draft.1",
      authorized_source_ids: catalogOracle.authorized_source_ids,
      authorized_source_paths: catalogOracle.authorized_source_paths,
      forbidden_source_ids: catalogOracle.forbidden_source_ids,
      forbidden_source_paths: catalogOracle.forbidden_source_paths,
      authorized_endpoint_ids: catalogOracle.authorized_endpoint_ids,
      forbidden_endpoint_ids: catalogOracle.forbidden_endpoint_ids,
      expected_public_result_projection_id: auditCoordinate.projection_id,
      expected_public_result_projection_digest: auditCoordinate.projection_digest,
    };
    const sealedOracle = sealed(expectedOracle, "oracle_digest");
    if (stableJson(row.input.audit_oracle) !== stableJson(sealedOracle)) failure("GKX_EVAL_REVIEWED_QUERY_VIEW_ORACLE_INVALID");
    const metrics = computeRetrievalEvaluationQueryMetrics(row.input);
    if (stableJson(metrics) !== stableJson(row.expected_metrics) || stableJson(metrics) !== stableJson(baselineRow.query_metrics) ||
        baselineRow.environment_digest !== derivation.environment_member.environment.environment_digest ||
        baselineRow.golden_query_digest !== query.query_digest) {
      failure("GKX_EVAL_REVIEWED_QUERY_METRICS_INVALID");
    }
    if (reviewed.reranker_request_digest !== cell[1] || reviewed.reranker_item_count !== cell[2]) {
      failure("GKX_EVAL_REVIEWED_RERANK_REQUEST_INVALID");
    }
    const exactCounters = countersFor(
      new Set(reviewed.authorized_view.sources.map((source) => source.source_path)).size,
      derivation.environment_member.environment.lexical_backend,
      cell[0], cell[1], cell[2], reviewed.total_citation_verification_count,
    );
    counterByQuery.set(query.id, exactCounters);
    const originMaterial = {
      contract_version: RETRIEVAL_EVALUATION_RESULT_ORIGIN_VERSION,
      query_id: query.id,
      golden_query_digest: query.query_digest,
      metric_case_id: row.case_id,
      metric_case_digest: row.case_digest,
      vault_fixture: query.vault_fixture,
      environment_digest: derivation.environment_member.environment.environment_digest,
      environment_member_digest: derivation.environment_member.member_digest,
      catalog_entry_digest: derivation.catalog_entry.entry_digest,
      corpus_fixture_digest: derivation.corpus.corpus_fixture_digest,
      manifest_projection_id: derivation.manifest.projection_id,
      manifest_projection_digest: derivation.manifest.projection_digest,
      result_projection_id: reviewed.result_projection_id,
      result_projection_digest: reviewed.result_projection_digest,
      lexical_backend: derivation.environment_member.environment.lexical_backend,
      provider_scenario_digest: scenario.scenario_digest,
      eval_schedule_digest: scenario.eval_schedule.schedule_digest,
      eval_occurrence_ordinal: queryIndex + 1,
      embedding_query_template_digest: embeddingTemplate.template_digest,
      reranker_query_oracle_digest: rerankerOracle.template_digest,
      reranker_request_digest: reviewed.reranker_request_digest,
      query_attempt_counters: exactCounters,
      public_result_digest: retrievalCanonicalDigest(reviewed.result),
      query_metrics_digest: metrics.query_metrics_digest,
    };
    origins.push(sealed(originMaterial, "origin_digest") as RetrievalEvaluationResultOrigin);
  }

  const projectionManifestSetMaterial = {
    contract_version: RETRIEVAL_EVALUATION_PROJECTION_MANIFEST_SET_VERSION,
    manifests: bundle.environment_set.members.map((member) => {
      const derivation = derivationByVault.get(member.environment.vault_fixture)!;
      return { vault_fixture: derivation.vault_fixture, projection_id: derivation.manifest.projection_id,
        projection_digest: derivation.manifest.projection_digest };
    }),
  };
  const resultOriginSetMaterial = {
    contract_version: RETRIEVAL_EVALUATION_RESULT_ORIGIN_SET_VERSION,
    normalized_golden_digest: bundle.normalized_golden.golden_digest,
    environment_set_digest: bundle.environment_set.environment_set_digest,
    metric_computation_fixture_digest: input.metric_computation_fixture.fixture_digest,
    origin_count: origins.length,
    result_origin_digests: origins.map((origin) => origin.origin_digest),
  };

  const presentCase = input.metric_computation_fixture.cases.find((row) => row.case_id === "reviewed-temporal-future-exclusion");
  const absentCase = input.metric_computation_fixture.cases.find((row) => row.case_id === "reviewed-temporal-future-absent");
  if (!presentCase?.expected_metrics || !absentCase?.expected_metrics || presentCase.expected_status !== "metrics" ||
      absentCase.expected_status !== "metrics" || stableJson(presentCase.input.query) !== stableJson(absentCase.input.query)) {
    failure("GKX_EVAL_REVIEWED_TEMPORAL_PAIR_CASE_INVALID");
  }
  const temporalDerivation = derivationByVault.get(presentCase.input.query.vault_fixture);
  if (!temporalDerivation) failure("GKX_EVAL_REVIEWED_TEMPORAL_PAIR_SCOPE_INVALID");
  const presentFiles = temporalDerivation.corpus.source_files;
  const absentObservationIds = new Set(absentCase.input.source_observations.map((item) => item.source_id));
  const removed = presentFiles.filter((source) => !absentObservationIds.has(source.source_id));
  const absentFiles = absentCase.input.source_observations.map((source) => ({
    source_id: source.source_id,
    source_path: source.source_path,
    source_digest: source.source_digest,
    source_bytes_base64: source.source_bytes_base64,
  }));
  if (removed.length !== 1 || absentFiles.length + 1 !== presentFiles.length ||
      stableJson(absentFiles) !== stableJson(presentFiles.filter((source) => source.source_id !== removed[0].source_id))) {
    failure("GKX_EVAL_REVIEWED_TEMPORAL_ABSENCE_INVALID");
  }
  const removedProjected = temporalDerivation.projection.sources.find((source) =>
    source.candidate_source.source_id === removed[0].source_id && source.candidate_source.source_path === removed[0].source_path);
  const removedIsFutureSuccessor = removedProjected && typeof removedProjected.candidate_source.valid_from === "string" &&
    Date.parse(removedProjected.candidate_source.valid_from) > Date.parse(presentCase.input.query.as_of!) &&
    temporalDerivation.projection.declarations.some((declaration) =>
      declaration.source_record_key === removedProjected.record_key && declaration.category === "lineage" &&
      declaration.field === "supersedes" && presentCase.input.query.expected_source_ids.includes(declaration.raw_reference));
  if (!removedIsFutureSuccessor) failure("GKX_EVAL_REVIEWED_TEMPORAL_REMOVED_SUCCESSOR_INVALID");
  const absentCorpusMaterial = {
    contract_version: RETRIEVAL_EVALUATION_TEMPORAL_ABSENT_CORPUS_VERSION,
    vault_fixture: temporalDerivation.vault_fixture,
    present_corpus_fixture_digest: temporalDerivation.corpus.corpus_fixture_digest,
    removed_source_id: removed[0].source_id,
    removed_source_path: removed[0].source_path,
    removed_source_digest: removed[0].source_digest,
    source_files: absentFiles,
  };
  const absentCorpus = sealed(absentCorpusMaterial, "absent_corpus_fixture_digest") as RetrievalEvaluationTemporalAbsentCorpus;

  // Independently reproject the exact present-minus-one corpus and recompute
  // its manifest/result coordinate.  The public view must remain invariant.
  const absentProjection = projectAuthoredGkxRetrievalCorpus(absentFiles.map((source) => ({
    relativePath: source.source_path,
    content: Buffer.from(source.source_bytes_base64, "base64").toString("utf8"),
    kind: "note" as const,
  })));
  if (absentProjection.rejections.length !== 0 || absentProjection.sources.length !== absentFiles.length) {
    failure("GKX_EVAL_REVIEWED_TEMPORAL_ABSENT_PROJECTION_INVALID");
  }
  const absentChunks = absentProjection.sources.flatMap((source) =>
    bindGkxRetrievalCandidateChunks(source.record_key, chunkMarkdown(source.chunk_input)));
  const sourceSnapshotMaterial = {
    contract_version: "gkos-retrieval-evaluation-source-snapshot/1.0.0-draft.1",
    source_observations: absentFiles.map(({ source_id, source_path, source_digest }) => ({ source_id, source_path, source_digest })),
  };
  const policyMaterial = {
    contract_version: "gkos-retrieval-evaluation-runtime-policy-inputs/1.0.0-draft.1",
    source_discoverability: absentFiles.map(({ source_id, source_path }) => ({ source_id, source_path, discoverable: true })),
    chunk_discoverability: absentChunks.map((candidate) => ({ chunk_id: candidate.chunk.chunk_id,
      source_id: candidate.chunk.source_id, discoverable: true }))
      .sort((left, right) => retrievalCodeUnitCompare(stableJson(left), stableJson(right))),
  };
  const scenario = temporalDerivation.provider_scenario!;
  // Re-derive the physically absent corpus's complete index receipt stream
  // independently.  The present transcript supplies only the fixed response
  // oracle; content deduplication, representative choice, sort order,
  // batching, offsets, request IDs, calls, and item totals all come from the
  // absent corpus itself.
  const absentIndexTemplates = deriveRetrievalEvaluationProviderIndexReceipts(
    absentChunks,
    scenario.embedding_index_templates,
  );
  const presentIndexItemCount = scenario.embedding_index_templates.reduce((sum, template) => sum + template.item_count, 0);
  const absentIndexItemCount = absentIndexTemplates.reduce((sum, template) => sum + template.item_count, 0);
  const indexReceiptMaterial = (templates: typeof scenario.embedding_index_templates) => templates.map((template) => ({
    embedding_call_ordinal: template.embedding_call_ordinal,
    batch_offset: template.batch_offset,
    request_id: template.request_id,
    chunk_inputs: template.chunk_inputs,
    item_count: template.item_count,
  }));
  if (absentIndexItemCount >= presentIndexItemCount ||
      stableJson(indexReceiptMaterial(absentIndexTemplates)) === stableJson(indexReceiptMaterial(scenario.embedding_index_templates))) {
    failure("GKX_EVAL_REVIEWED_TEMPORAL_ABSENT_INDEX_RECEIPT_INVALID");
  }
  const responseByDigest = new Map(absentIndexTemplates.flatMap((template) => template.responses)
    .map((response) => [response.input_digest, response]));
  const absentManifest = deriveGkxRetrievalProjectionManifest({
    vault_id: temporalDerivation.manifest.vault_id,
    source_snapshot_digest: retrievalCanonicalDigest(sourceSnapshotMaterial),
    configuration_digest: temporalDerivation.manifest.configuration_digest,
    policy_digest: retrievalCanonicalDigest(policyMaterial),
    candidate_sources: absentProjection.sources.map((source) => source.candidate_source),
    candidate_declarations: absentProjection.declarations,
    candidate_chunks: absentChunks,
    embedding_eligible_candidate_chunk_keys: absentChunks.map((candidate) => candidate.candidate_chunk_key),
    vectors: absentChunks.map((candidate) => {
      const response = responseByDigest.get(candidate.chunk.content_digest);
      if (!response) failure("GKX_EVAL_REVIEWED_TEMPORAL_ABSENT_VECTOR_INVALID");
      return { candidate_chunk_key: candidate.candidate_chunk_key,
        vector: Array.from(Float32Array.from(response.values_micros, (part) => part / 1_000_000)) };
    }),
    embedding_provider_id: temporalDerivation.manifest.embedding_provider_id,
    embedding_model_id: temporalDerivation.manifest.embedding_model_id,
    embedding_dimensions: temporalDerivation.manifest.embedding_dimensions,
  }, temporalDerivation.manifest.lexical_backend);
  const absentQuery = absentCase.input.query as NormalizedRetrievalEvaluationQuery;
  const absentQueryIndex = scenario.eval_schedule.query_partition.findIndex((coordinate) => coordinate.query_id === absentQuery.id);
  const absentReviewed = deriveRetrievalEvaluationReviewedResult({
    query: absentQuery,
    manifest: absentManifest,
    environment: temporalDerivation.environment_member.environment,
    selected_axes: baseline.selected_axes,
    candidate_sources: absentProjection.sources.map((source) => source.candidate_source),
    candidate_declarations: absentProjection.declarations,
    candidate_chunks: absentChunks,
    source_bytes_by_path: new Map(absentFiles.map((source) => [source.source_path, Buffer.from(source.source_bytes_base64, "base64")])),
    embedding_index_templates: absentIndexTemplates,
    embedding_query_template: scenario.embedding_query_templates[absentQueryIndex],
    reranker_query_oracle: scenario.reranker_query_oracles[absentQueryIndex],
  });
  const absentAuditView = buildGkxRetrievalAuthorizedCandidateView(
    absentProjection.sources.map((source) => source.candidate_source), absentProjection.declarations, absentChunks, absentQuery.as_of,
  );
  const absentAuditCoordinate = gkxRetrievalLineageResultCoordinate(absentManifest, absentAuditView.sources, absentAuditView.temporal_sources);
  const absentOracle = absentCase.input.audit_oracle;
  const absentEndpointIds = [...new Set(absentAuditView.temporal_sources.flatMap((source) =>
    [...source.supersedes, ...source.superseded_by]))].sort(retrievalCodeUnitCompare);
  const expectedAbsentOracleMaterial = {
    contract_version: "gkos-retrieval-evaluation-query-view-audit-oracle/1.0.0-draft.1",
    authorized_source_ids: absentFiles.map((source) => source.source_id).sort(retrievalCodeUnitCompare),
    authorized_source_paths: absentFiles.map((source) => source.source_path).sort(retrievalCodeUnitCompare),
    forbidden_source_ids: [] as string[],
    forbidden_source_paths: [] as string[],
    authorized_endpoint_ids: absentEndpointIds,
    forbidden_endpoint_ids: [] as string[],
    expected_public_result_projection_id: absentAuditCoordinate.projection_id,
    expected_public_result_projection_digest: absentAuditCoordinate.projection_digest,
  };
  const expectedAbsentOracle = sealed(expectedAbsentOracleMaterial, "oracle_digest");
  if (stableJson(absentReviewed.result) !== stableJson(absentCase.input.result) ||
      stableJson(computeRetrievalEvaluationQueryMetrics(absentCase.input)) !== stableJson(absentCase.expected_metrics) ||
      stableJson(absentCase.input.expected_temporal) !== stableJson(expectedTemporalFromAuditView(absentReviewed.result, absentAuditView)) ||
      stableJson(absentOracle) !== stableJson(expectedAbsentOracle) ||
      absentReviewed.reranker_request_digest !== scenario.eval_schedule.occurrence_matrix[absentQueryIndex][1] ||
      absentReviewed.reranker_item_count !== scenario.eval_schedule.occurrence_matrix[absentQueryIndex][2] ||
      presentCase.input.result.projection_digest === absentCase.input.result.projection_digest) {
    failure("GKX_EVAL_REVIEWED_TEMPORAL_ABSENT_RESULT_INVALID");
  }
  const presentView = publicViewMaterial(presentCase.input.result);
  const absentView = publicViewMaterial(absentCase.input.result);
  const presentCounters = counterByQuery.get(presentCase.input.query.id)!;
  const absentCell = scenario.eval_schedule.occurrence_matrix[absentQueryIndex];
  const absentCounters = countersFor(
    new Set(absentReviewed.authorized_view.sources.map((source) => source.source_path)).size,
    temporalDerivation.environment_member.environment.lexical_backend,
    absentCell[0], absentCell[1], absentCell[2], absentReviewed.total_citation_verification_count,
  );
  if (stableJson(presentView) !== stableJson(absentView) || stableJson(presentCase.expected_metrics) !== stableJson(absentCase.expected_metrics) ||
      stableJson(presentCounters) !== stableJson(absentCounters)) failure("GKX_EVAL_REVIEWED_TEMPORAL_NONINTERFERENCE_INVALID");
  const pairMaterial = {
    contract_version: RETRIEVAL_EVALUATION_TEMPORAL_NONINTERFERENCE_PAIR_VERSION,
    pair_id: "temporal-future-present-absent",
    present_metric_case_id: presentCase.case_id,
    absent_metric_case_id: absentCase.case_id,
    query_id: presentCase.input.query.id,
    as_of: presentCase.input.query.as_of!,
    temporal_absent_corpus_fixture_digest: absentCorpus.absent_corpus_fixture_digest,
    public_view_digest: retrievalCanonicalDigest(presentView),
    query_metrics_digest: presentCase.expected_metrics.query_metrics_digest,
    query_counter_digest: presentCounters.counter_digest,
  };
  const pair = sealed(pairMaterial, "pair_digest") as RetrievalEvaluationTemporalNoninterferencePair;

  const material = {
    contract_version: RETRIEVAL_EVALUATION_REVIEWED_BUNDLE_VERSION,
    conformance_file: "conformance-fixture.json" as const,
    golden_toml_file: "golden-fixture.toml" as const,
    source_corpus_file: "source-corpus.json" as const,
    fixture_catalog_file: "fixture-catalog.json" as const,
    fixed_provider_file: "fixed-provider.json" as const,
    metric_computation_file: "metric-computation-fixture.json" as const,
    normalized_golden_digest: bundle.normalized_golden.golden_digest,
    source_corpus_digest: bundle.source_corpus.source_corpus_digest,
    fixture_catalog_digest: bundle.fixture_catalog.catalog_digest,
    fixed_provider_digest: provider.provider_fixture_digest,
    environment_set_digest: bundle.environment_set.environment_set_digest,
    baseline_digest: baseline.baseline_digest,
    metric_computation_fixture_digest: input.metric_computation_fixture.fixture_digest,
    projection_manifest_set_digest: retrievalCanonicalDigest(projectionManifestSetMaterial),
    result_origins: origins,
    result_origin_set_digest: retrievalCanonicalDigest(resultOriginSetMaterial),
    temporal_absent_corpora: [absentCorpus],
    temporal_noninterference_pairs: [pair],
  };
  return sealed(material, "reviewed_bundle_digest") as RetrievalEvaluationReviewedBundle;
}

export function sealRetrievalEvaluationReviewedBundle(value: unknown): RetrievalEvaluationReviewedBundle {
  const item = JSON.parse(stableJson(value)) as Record<string, unknown>;
  exactKeys(item, TOP_KEYS, "GKX_EVAL_REVIEWED_BUNDLE_FIELDS_INVALID");
  if (item.contract_version !== RETRIEVAL_EVALUATION_REVIEWED_BUNDLE_VERSION ||
      item.conformance_file !== "conformance-fixture.json" || item.golden_toml_file !== "golden-fixture.toml" ||
      item.source_corpus_file !== "source-corpus.json" || item.fixture_catalog_file !== "fixture-catalog.json" ||
      item.fixed_provider_file !== "fixed-provider.json" || item.metric_computation_file !== "metric-computation-fixture.json" ||
      !Array.isArray(item.result_origins) || item.result_origins.length !== 24 ||
      !Array.isArray(item.temporal_absent_corpora) || item.temporal_absent_corpora.length !== 1 ||
      !Array.isArray(item.temporal_noninterference_pairs) || item.temporal_noninterference_pairs.length !== 1) {
    failure("GKX_EVAL_REVIEWED_BUNDLE_COORDINATE_INVALID");
  }
  for (const field of ["normalized_golden_digest", "source_corpus_digest", "fixture_catalog_digest", "fixed_provider_digest",
    "environment_set_digest", "baseline_digest", "metric_computation_fixture_digest", "projection_manifest_set_digest",
    "result_origin_set_digest", "reviewed_bundle_digest"] as const) {
    if (typeof item[field] !== "string" || !SHA256_RE.test(item[field] as string)) failure("GKX_EVAL_REVIEWED_BUNDLE_DIGEST_INVALID");
  }
  const origins = item.result_origins as Array<Record<string, unknown>>;
  for (const origin of origins) {
    exactKeys(origin, ORIGIN_KEYS, "GKX_EVAL_REVIEWED_RESULT_ORIGIN_FIELDS_INVALID");
    if (origin.contract_version !== RETRIEVAL_EVALUATION_RESULT_ORIGIN_VERSION || !validReviewedId(origin.query_id) ||
        origin.metric_case_id !== `reviewed-${origin.query_id}` || !validReviewedId(origin.vault_fixture) ||
        !["sqlite_fts5", "sqlite_lexical_scan"].includes(origin.lexical_backend as string) ||
        !PROJECTION_ID_RE.test(origin.manifest_projection_id as string) || !PROJECTION_ID_RE.test(origin.result_projection_id as string) ||
        !Number.isSafeInteger(origin.eval_occurrence_ordinal) || (origin.eval_occurrence_ordinal as number) < 1 ||
        (origin.eval_occurrence_ordinal as number) > 256) {
      failure("GKX_EVAL_REVIEWED_RESULT_ORIGIN_INVALID");
    }
    for (const field of [
      "golden_query_digest", "metric_case_digest", "environment_digest", "environment_member_digest", "catalog_entry_digest",
      "corpus_fixture_digest", "manifest_projection_digest", "result_projection_digest", "provider_scenario_digest",
      "eval_schedule_digest", "embedding_query_template_digest", "reranker_query_oracle_digest", "reranker_request_digest",
      "public_result_digest", "query_metrics_digest", "origin_digest",
    ] as const) {
      if (typeof origin[field] !== "string" || !SHA256_RE.test(origin[field] as string)) {
        failure("GKX_EVAL_REVIEWED_RESULT_ORIGIN_DIGEST_INVALID");
      }
    }
    origin.query_attempt_counters = sealReviewedCounters(origin.query_attempt_counters);
    if (origin.origin_digest !== digestExcluding(origin, "origin_digest")) failure("GKX_EVAL_REVIEWED_RESULT_ORIGIN_DIGEST_MISMATCH");
  }
  const originIds = origins.map((origin) => origin.query_id as string);
  if (new Set(originIds).size !== origins.length || stableJson(originIds) !== stableJson([...originIds].sort(retrievalCodeUnitCompare))) {
    failure("GKX_EVAL_REVIEWED_RESULT_ORIGIN_INVALID");
  }
  const expectedOriginSetDigest = retrievalCanonicalDigest({
    contract_version: RETRIEVAL_EVALUATION_RESULT_ORIGIN_SET_VERSION,
    normalized_golden_digest: item.normalized_golden_digest,
    environment_set_digest: item.environment_set_digest,
    metric_computation_fixture_digest: item.metric_computation_fixture_digest,
    origin_count: origins.length,
    result_origin_digests: origins.map((origin) => origin.origin_digest),
  });
  if (item.result_origin_set_digest !== expectedOriginSetDigest) failure("GKX_EVAL_REVIEWED_RESULT_ORIGIN_SET_DIGEST_MISMATCH");
  const absent = validateReviewedAbsentCorpus((item.temporal_absent_corpora as unknown[])[0]);
  const pair = (item.temporal_noninterference_pairs as Array<Record<string, unknown>>)[0];
  exactKeys(pair, TEMPORAL_PAIR_KEYS, "GKX_EVAL_REVIEWED_TEMPORAL_PAIR_FIELDS_INVALID");
  if (pair.contract_version !== RETRIEVAL_EVALUATION_TEMPORAL_NONINTERFERENCE_PAIR_VERSION || !validReviewedId(pair.pair_id) ||
      !validReviewedId(pair.present_metric_case_id) || !validReviewedId(pair.absent_metric_case_id) || !validReviewedId(pair.query_id) ||
      typeof pair.as_of !== "string" || pair.temporal_absent_corpus_fixture_digest !== absent.absent_corpus_fixture_digest ||
      !origins.some((origin) => origin.query_id === pair.query_id && origin.query_metrics_digest === pair.query_metrics_digest &&
        (origin.query_attempt_counters as RetrievalEvaluationQueryAttemptCounters).counter_digest === pair.query_counter_digest) ||
      ["public_view_digest", "query_metrics_digest", "query_counter_digest", "pair_digest"].some((field) =>
        typeof pair[field] !== "string" || !SHA256_RE.test(pair[field] as string)) ||
      pair.pair_digest !== digestExcluding(pair, "pair_digest") || item.reviewed_bundle_digest !== digestExcluding(item, "reviewed_bundle_digest")) {
    failure("GKX_EVAL_REVIEWED_BUNDLE_DIGEST_MISMATCH");
  }
  return item as unknown as RetrievalEvaluationReviewedBundle;
}

export function sealRetrievalEvaluationExecutableReviewedBundle(input: {
  reviewed_bundle: unknown;
  environment_bundle: RetrievalEvaluationEnvironmentBundle;
  baseline: RetrievalEvaluationBaseline;
  metric_computation_fixture: RetrievalEvaluationMetricComputationFixture;
}): RetrievalEvaluationReviewedBundle {
  const reviewed = sealRetrievalEvaluationReviewedBundle(input.reviewed_bundle);
  const expected = buildRetrievalEvaluationReviewedBundle(input);
  if (stableJson(reviewed) !== stableJson(expected)) failure("GKX_EVAL_REVIEWED_BUNDLE_RELATION_INVALID");
  return reviewed;
}
