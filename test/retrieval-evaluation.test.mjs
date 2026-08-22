import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import * as core from "../dist/gkos-engine.mjs";
import * as retrieval from "../dist/retrieval.mjs";
import * as evaluationHost from "../dist/retrieval-evaluation-host.mjs";
import * as retrievalHost from "../dist/retrieval-host.mjs";

const RETRIEVAL_FIXTURE = JSON.parse(readFileSync(
  new URL("../contracts/retrieval/gkos-retrieval-1.0.0-draft.2/conformance-fixture.json", import.meta.url),
  "utf8",
));

const PHASE4_PACK = new URL("../contracts/retrieval/gkos-retrieval-evaluation-1.0.0-draft.1/", import.meta.url);
const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));
const PHASE4_CONFORMANCE = readJson(new URL("conformance-fixture.json", PHASE4_PACK));
const PHASE4_SCENARIO_CONFORMANCE = readJson(new URL("scenario-conformance-fixture.json", PHASE4_PACK));
const PHASE4_FIXED_PROVIDER = readJson(new URL("fixed-provider.json", PHASE4_PACK));
const PHASE4_FIXTURE_CATALOG = readJson(new URL("fixture-catalog.json", PHASE4_PACK));
const PHASE4_SOURCE_CORPUS = readJson(new URL("source-corpus.json", PHASE4_PACK));
const PHASE4_METRIC_COMPUTATION = readJson(new URL("metric-computation-fixture.json", PHASE4_PACK));
const PHASE4_TUNE_PRIORITY = readJson(new URL("tune-priority-fixture.json", PHASE4_PACK));
const PHASE4_REVIEWED_BUNDLE = readJson(new URL("reviewed-bundle.json", PHASE4_PACK));
const RETRIEVAL_CONTRACT = readJson(new URL("../contracts/retrieval/gkos-retrieval-1.0.0-draft.2/contract.json", import.meta.url));

function decodeFixtureScalar(row) {
  if (row.encoding === "literal") return row.value;
  if (row.encoding === "repeat_code_point") {
    return `${row.prefix ?? ""}${String.fromCodePoint(row.code_point).repeat(row.count)}${row.suffix ?? ""}`;
  }
  if (row.encoding === "utf16_code_units") return String.fromCharCode(...row.code_units);
  if (row.encoding === undefined && typeof row.value === "string") return row.value;
  throw new Error(`unknown fixture scalar encoding: ${row.encoding}`);
}

function phase4Ajv() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  const phase2Pack = new URL("../contracts/retrieval/gkos-retrieval-1.0.0-draft.2/", import.meta.url);
  for (const directory of [phase2Pack, PHASE4_PACK]) {
    for (const name of readdirSync(fileURLToPath(directory)).filter((entry) => entry.endsWith(".schema.json")).sort()) {
      ajv.addSchema(readJson(new URL(name, directory)));
    }
  }
  return ajv;
}

let cachedPhase4Ajv;
function assertPhase4SchemaValue(name, value) {
  cachedPhase4Ajv ??= phase4Ajv();
  const schema = readJson(new URL(name, PHASE4_PACK));
  const validate = cachedPhase4Ajv.getSchema(schema.$id);
  assert.ok(validate, `schema ${name} was registered`);
  assert.equal(validate(value), true, `${name}: ${JSON.stringify(validate.errors)}`);
}

function clone(value) {
  return structuredClone(value);
}

function reseal(record, digestField) {
  const material = { ...record };
  delete material[digestField];
  return { ...material, [digestField]: retrieval.retrievalCanonicalDigest(material) };
}

function resealEnvironmentBundleAuditMutation(baseBundle, vaultFixture, mutateOracle) {
  const bundle = clone(baseBundle);
  const targetEntry = bundle.fixture_catalog.entries.find((entry) => entry.vault_fixture === vaultFixture);
  assert.ok(targetEntry, vaultFixture);
  mutateOracle(targetEntry.evaluation_audit_oracle, targetEntry);
  targetEntry.evaluation_audit_oracle = reseal(targetEntry.evaluation_audit_oracle, "evaluation_audit_oracle_digest");
  const auditDigest = targetEntry.evaluation_audit_oracle.evaluation_audit_oracle_digest;

  for (let index = 0; index < bundle.fixed_provider_transcript.scenarios.length; index++) {
    let scenario = bundle.fixed_provider_transcript.scenarios[index];
    if (scenario.environment_scope.vault_fixture === vaultFixture) {
      scenario.environment_scope.evaluation_audit_oracle_digest = auditDigest;
      scenario.environment_scope = reseal(scenario.environment_scope, "environment_scope_digest");
      scenario = reseal(scenario, "scenario_digest");
      bundle.fixed_provider_transcript.scenarios[index] = scenario;
    }
  }
  bundle.fixed_provider_transcript.scenarios.sort((left, right) =>
    left.environment_scope.environment_scope_digest < right.environment_scope.environment_scope_digest ? -1 :
      left.environment_scope.environment_scope_digest > right.environment_scope.environment_scope_digest ? 1 : 0);
  bundle.fixed_provider_transcript = reseal(bundle.fixed_provider_transcript, "provider_fixture_digest");

  for (let index = 0; index < bundle.fixture_catalog.entries.length; index++) {
    const entry = bundle.fixture_catalog.entries[index];
    entry.fixed_provider_transcript_digest = bundle.fixed_provider_transcript.provider_fixture_digest;
    bundle.fixture_catalog.entries[index] = reseal(entry, "entry_digest");
  }
  bundle.fixture_catalog = reseal(bundle.fixture_catalog, "catalog_digest");

  for (let index = 0; index < bundle.environment_set.members.length; index++) {
    let member = bundle.environment_set.members[index];
    let environment = member.environment;
    environment.fixture_catalog_digest = bundle.fixture_catalog.catalog_digest;
    if (environment.vault_fixture === vaultFixture) environment.evaluation_audit_oracle_digest = auditDigest;
    if (environment.embedding_role.state === "active") {
      environment.embedding_role.fixed_provider_transcript_digest = bundle.fixed_provider_transcript.provider_fixture_digest;
    }
    if (environment.reranker_role.state === "active") {
      environment.reranker_role.fixed_provider_transcript_digest = bundle.fixed_provider_transcript.provider_fixture_digest;
    }
    environment = reseal(environment, "environment_digest");
    member.environment = environment;
    member = reseal(member, "member_digest");
    bundle.environment_set.members[index] = member;
  }
  bundle.environment_set.members.sort((left, right) =>
    left.environment.environment_digest < right.environment.environment_digest ? -1 :
      left.environment.environment_digest > right.environment.environment_digest ? 1 : 0);
  bundle.environment_set = reseal(bundle.environment_set, "environment_set_digest");
  return bundle;
}

function resealReviewedOriginSet(bundle) {
  bundle.result_origin_set_digest = retrieval.retrievalCanonicalDigest({
    contract_version: "gkos-retrieval-evaluation-result-origin-set/1.0.0-draft.1",
    normalized_golden_digest: bundle.normalized_golden_digest,
    environment_set_digest: bundle.environment_set_digest,
    metric_computation_fixture_digest: bundle.metric_computation_fixture_digest,
    origin_count: bundle.result_origins.length,
    result_origin_digests: bundle.result_origins.map((origin) => origin.origin_digest),
  });
  return reseal(bundle, "reviewed_bundle_digest");
}

function resealMetricFixture(fixture, caseId, mutateCase) {
  const updated = clone(fixture);
  const index = updated.cases.findIndex((row) => row.case_id === caseId);
  assert.notEqual(index, -1, caseId);
  mutateCase(updated.cases[index], updated);
  updated.cases[index] = reseal(updated.cases[index], "case_digest");
  return reseal(updated, "fixture_digest");
}

function baselineWithSelectedRrf(base, rrfK) {
  const baseline = clone(base);
  const axesMaterial = { ...baseline.selected_axes, rrf_k: rrfK };
  delete axesMaterial.tuning_axes_digest;
  baseline.selected_axes = reseal(axesMaterial, "tuning_axes_digest");
  baseline.tuning_axes_digest = baseline.selected_axes.tuning_axes_digest;
  baseline.candidate_config_digest = retrieval.retrievalCanonicalDigest({
    base_configuration_digest: baseline.base_configuration_digest,
    candidate_config: evaluationHost.retrievalEvaluationCandidateConfigMaterial(baseline.selected_axes),
  });
  baseline.baseline_evaluation_digest = retrieval.retrievalCanonicalDigest({
    contract_version: "gkos-retrieval-evaluation-evaluation-coordinate/1.0.0-draft.1",
    environment_set_digest: baseline.environment_set_digest,
    normalized_golden_digest: baseline.normalized_golden_digest,
    base_configuration_digest: baseline.base_configuration_digest,
    tuning_grid_digest: baseline.tuning_grid_digest,
    tuning_axes_digest: baseline.tuning_axes_digest,
    candidate_config_digest: baseline.candidate_config_digest,
    query_metrics_set_digest: baseline.query_metrics_set_digest,
    aggregate_metrics_digest: baseline.aggregate_metrics_digest,
    metrics_set_digest: baseline.metrics_set_digest,
    relative_ndcg_budget: baseline.relative_ndcg_budget,
    metric_contract_version: baseline.metric_contract_version,
    ndcg_discount_table_digest: baseline.ndcg_discount_table_digest,
    metric_scale: baseline.metric_scale,
    query_count: baseline.query_count,
    maximum_expected_top_k: baseline.maximum_expected_top_k,
  });
  return reseal(baseline, "baseline_digest");
}

function sealQuery(material) {
  return { ...material, query_digest: retrieval.retrievalCanonicalDigest(material) };
}

function sealOracle(material) {
  return { ...material, oracle_digest: retrieval.retrievalCanonicalDigest(material) };
}

function aggregateMetrics(queryCount = 24, ndcg = 1_000_000) {
  const material = {
    contract_version: "gkos-retrieval-evaluation-aggregate/1.0.0-draft.1",
    query_count: queryCount,
    recall_at_k_micros: 1_000_000,
    mrr_micros: 1_000_000,
    ndcg_at_k_micros: ndcg,
    citation: { applicability: "required", checked: queryCount, passed: queryCount, mismatch: 0, stale: 0, correctness_micros: 1_000_000 },
    policy: { policy_identity_field_count: queryCount, policy_leak_count: 0, policy_leak_rate_micros: 0 },
    confidence_mismatch_count: 0,
    temporal_mismatch_count: 0,
    stale_citation_query_count: 0,
    stale_citation_query_rate_micros: 0,
    stale_projection_query_count: 0,
    unverified_projection_query_count: 0,
    unverified_projection_rate_micros: 0,
  };
  return { ...material, aggregate_metrics_digest: retrieval.retrievalCanonicalDigest(material) };
}

function queryMetricsRow(queryId, expectedTopK, relevantReturned = true) {
  const material = {
    contract_version: "gkos-retrieval-evaluation-query-metrics/1.0.0-draft.1",
    query_id: queryId,
    expected_top_k: expectedTopK,
    relevant_source_count: 1,
    returned_unique_source_count: 1,
    relevant_returned_source_count: relevantReturned ? 1 : 0,
    relevant_source_ranks: relevantReturned ? [1] : [],
    first_relevant_rank: relevantReturned ? 1 : null,
    recall_at_k_micros: relevantReturned ? 1_000_000 : 0,
    mrr_micros: relevantReturned ? 1_000_000 : 0,
    ndcg_at_k_micros: relevantReturned ? 1_000_000 : 0,
    citation: { applicability: "required", checked: 1, passed: 1, mismatch: 0, stale: 0, correctness_micros: 1_000_000 },
    policy: { policy_identity_field_count: 8, policy_leak_count: 0, policy_leak_rate_micros: 0 },
    confidence_mismatch_count: 0,
    temporal_mismatch_count: 0,
    stale_citation_query_count: 0,
    stale_projection_query_count: 0,
    unverified_projection_query_count: 0,
  };
  return { ...material, query_metrics_digest: retrieval.retrievalCanonicalDigest(material) };
}

function zeroHitQueryMetricsRow(queryId, expectedTopK) {
  const material = {
    ...queryMetricsRow(queryId, expectedTopK, false),
    returned_unique_source_count: 0,
    citation: { applicability: "not_applicable", checked: 0, passed: 0, mismatch: 0, stale: 0, correctness_micros: null },
    policy: { policy_identity_field_count: 2, policy_leak_count: 0, policy_leak_rate_micros: 0 },
  };
  delete material.query_metrics_digest;
  return { ...material, query_metrics_digest: retrieval.retrievalCanonicalDigest(material) };
}

function normalizedGoldenForIds(ids, maximumExpectedTopK) {
  const queries = ids.map((id, index) => {
    const material = {
      id,
      text: `fixed offline query ${index + 1}`,
      vault_fixture: "evaluation-tune-v1",
      expected_files: [],
      expected_source_ids: ["018f0000-0000-7000-8000-000000000301"],
      expected_lineage_ids: [],
      forbidden_source_ids: [],
      forbidden_lineage_ids: [],
      expected_top_k: maximumExpectedTopK,
      expected_confidence: "high",
      as_of: null,
    };
    return { ...material, query_digest: retrieval.retrievalCanonicalDigest(material) };
  });
  const material = { contract_version: "gkos-retrieval-evaluation-golden/1.0.0-draft.1", queries };
  return { ...material, golden_digest: retrieval.retrievalCanonicalDigest(material) };
}

function normalizedGolden(queryCount, maximumExpectedTopK) {
  return normalizedGoldenForIds(Array.from({ length: queryCount }, (_, index) => `tune-query-${String(index + 1).padStart(3, "0")}`), maximumExpectedTopK);
}

function tuningAxesCoordinate(axes) {
  const material = {
    contract_version: "gkos-retrieval-evaluation-tuning-axes/1.0.0-draft.1",
    ...axes,
  };
  return { ...material, tuning_axes_digest: retrieval.retrievalCanonicalDigest(material) };
}

function baseConfigurationCoordinate(label = "fixed-offline-v1") {
  const material = {
    contract_version: "gkos-retrieval-evaluation-base-configuration/1.0.0-draft.1",
    effective_non_tunable_configuration_digest: retrieval.retrievalCanonicalDigest({ effective_non_tunable_configuration: label }),
  };
  return { ...material, base_configuration_digest: retrieval.retrievalCanonicalDigest(material) };
}

function evaluationCoordinateMaterial({ environmentSet, golden, baseConfiguration, tuningGrid, axes, candidateConfigDigest, metricsSet, budget }) {
  return {
    contract_version: "gkos-retrieval-evaluation-evaluation-coordinate/1.0.0-draft.1",
    environment_set_digest: environmentSet.environment_set_digest,
    normalized_golden_digest: golden.golden_digest,
    base_configuration_digest: baseConfiguration.base_configuration_digest,
    tuning_grid_digest: tuningGrid.tuning_grid_digest,
    tuning_axes_digest: axes.tuning_axes_digest,
    candidate_config_digest: candidateConfigDigest,
    query_metrics_set_digest: metricsSet.query_metrics_set_digest,
    aggregate_metrics_digest: metricsSet.aggregate_metrics.aggregate_metrics_digest,
    metrics_set_digest: metricsSet.metrics_set_digest,
    relative_ndcg_budget: budget,
    metric_contract_version: "gkos-retrieval-evaluation-metrics/1.0.0-draft.1",
    ndcg_discount_table_digest: retrieval.RETRIEVAL_EVALUATION_NDCG_TABLE.table_digest,
    metric_scale: 1_000_000,
    query_count: golden.queries.length,
    maximum_expected_top_k: Math.max(...golden.queries.map((query) => query.expected_top_k)),
  };
}

function baselineEnvelope({ environmentSet, golden, baseConfiguration, tuningGrid, axes, metricsSet, budget = { numerator: 2, denominator: 100 } }) {
  const candidateConfigDigest = retrieval.retrievalCanonicalDigest({
    base_configuration_digest: baseConfiguration.base_configuration_digest,
    candidate_config: evaluationHost.retrievalEvaluationCandidateConfigMaterial(axes),
  });
  const baselineEvaluationDigest = retrieval.retrievalCanonicalDigest(evaluationCoordinateMaterial({
    environmentSet, golden, baseConfiguration, tuningGrid, axes, candidateConfigDigest, metricsSet, budget,
  }));
  const material = {
    contract_version: "gkos-retrieval-evaluation-baseline/1.0.0-draft.1",
    environment_set: environmentSet,
    normalized_golden: golden,
    base_configuration: baseConfiguration,
    tuning_grid: tuningGrid,
    selected_axes: axes,
    candidate_config_digest: candidateConfigDigest,
    metrics_set: metricsSet,
    relative_ndcg_budget: budget,
    metric_contract_version: "gkos-retrieval-evaluation-metrics/1.0.0-draft.1",
    ndcg_discount_table_digest: retrieval.RETRIEVAL_EVALUATION_NDCG_TABLE.table_digest,
    metric_scale: 1_000_000,
    query_count: golden.queries.length,
    maximum_expected_top_k: Math.max(...golden.queries.map((query) => query.expected_top_k)),
    normalized_golden_digest: golden.golden_digest,
    environment_set_digest: environmentSet.environment_set_digest,
    base_configuration_digest: baseConfiguration.base_configuration_digest,
    tuning_grid_digest: tuningGrid.tuning_grid_digest,
    tuning_axes_digest: axes.tuning_axes_digest,
    query_metrics_set_digest: metricsSet.query_metrics_set_digest,
    aggregate_metrics_digest: metricsSet.aggregate_metrics.aggregate_metrics_digest,
    metrics_set_digest: metricsSet.metrics_set_digest,
    baseline_evaluation_digest: baselineEvaluationDigest,
  };
  return { ...material, baseline_digest: retrieval.retrievalCanonicalDigest(material) };
}

function environmentCoordinate(golden, label = "fixed-offline-v1", vaultFixture = "evaluation-tune-v1", lexicalBackend = "sqlite_lexical_scan") {
  const projection_digest = retrieval.retrievalCanonicalDigest({ projection: label });
  const backendToken = lexicalBackend === "sqlite_fts5" ? "sqlite-fts5" : "sqlite-lexical-scan";
  const material = {
    contract_version: "gkos-retrieval-evaluation-environment/1.0.0-draft.1",
    scenario_id: `${vaultFixture}--${backendToken}--vector-disabled--reranker-disabled`,
    vault_fixture: vaultFixture,
    retrieval_contract_version: "gkos-retrieval/1.0.0-draft.2",
    evaluation_contract_version: "gkos-retrieval-evaluation/1.0.0-draft.1",
    golden_contract_version: "gkos-retrieval-evaluation-golden/1.0.0-draft.1",
    metric_contract_version: "gkos-retrieval-evaluation-metrics/1.0.0-draft.1",
    engine_version: "2.1.2",
    gkx_standard_commit: "a2a2a6ca5c4dac32c6d9dc985ed7460f5f4350c6",
    gkx_projection_profile: "gkx-2.3-validating-projection",
    projection_schema_version: 3,
    chunker_version: "gkos-heading-chunker/1",
    tokenizer_version: "gkos-ascii-whitespace/1",
    lexical_backend: lexicalBackend,
    normalized_golden_digest: golden.golden_digest,
    fixture_catalog_digest: retrieval.retrievalCanonicalDigest({ fixture_catalog: label }),
    corpus_fixture_digest: retrieval.retrievalCanonicalDigest({ corpus_fixture: label }),
    source_snapshot_digest: retrieval.retrievalCanonicalDigest({ source_snapshot: label }),
    runtime_policy_inputs_digest: retrieval.retrievalCanonicalDigest({ runtime_policy_inputs: label }),
    evaluation_audit_oracle_digest: retrieval.retrievalCanonicalDigest({ evaluation_audit_oracle: label }),
    projection_id: `retrieval:${projection_digest.slice(7, 31)}`,
    projection_digest,
    embedding_role: {
      state: "disabled", provider_scenario_id: "disabled", provider_kind: null, provider_id: null, model_id: null,
      dimensions: null, fixed_provider_transcript_digest: null,
    },
    reranker_role: {
      state: "disabled", provider_scenario_id: "disabled", provider_kind: null, provider_id: null, model_id: null,
      fixed_provider_transcript_digest: null,
    },
    ndcg_discount_table_digest: retrieval.RETRIEVAL_EVALUATION_NDCG_TABLE.table_digest,
    metric_scale: 1_000_000,
  };
  return { ...material, environment_digest: retrieval.retrievalCanonicalDigest(material) };
}

function environmentSetCoordinate(golden, label = "fixed-offline-v1", backendByVault = new Map()) {
  const vaults = [...new Set(golden.queries.map((query) => query.vault_fixture))];
  const members = vaults.map((vault) => {
    const environment = environmentCoordinate(golden, `${label}-${vault}`, vault, backendByVault.get(vault) ?? "sqlite_lexical_scan");
    const query_partition = golden.queries.filter((query) => query.vault_fixture === vault)
      .map((query) => ({ query_id: query.id, query_digest: query.query_digest }));
    const material = { environment, query_partition, query_count: query_partition.length };
    return { ...material, member_digest: retrieval.retrievalCanonicalDigest(material) };
  }).sort((left, right) => retrieval.retrievalCodeUnitCompare(left.environment.environment_digest, right.environment.environment_digest));
  const material = {
    contract_version: "gkos-retrieval-evaluation-environment-set/1.0.0-draft.1",
    normalized_golden_digest: golden.golden_digest,
    query_count: golden.queries.length,
    members,
  };
  return { ...material, environment_set_digest: retrieval.retrievalCanonicalDigest(material) };
}

function metricsSetCoordinate(golden, environmentSet, rows) {
  const environmentByQuery = new Map(environmentSet.members.flatMap((member) => member.query_partition
    .map((query) => [query.query_id, member.environment.environment_digest])));
  const query_evaluations = rows.map((row, index) => ({
    environment_digest: environmentByQuery.get(golden.queries[index].id),
    golden_query_digest: golden.queries[index].query_digest,
    query_metrics: row,
  }));
  const query_metrics_set_digest = retrieval.retrievalCanonicalDigest({
    contract_version: "gkos-retrieval-evaluation-query-metrics-set/1.0.0-draft.1",
    environment_set_digest: environmentSet.environment_set_digest,
    query_count: query_evaluations.length,
    query_evaluations: query_evaluations.map((entry) => ({
      environment_digest: entry.environment_digest,
      golden_query_digest: entry.golden_query_digest,
      query_metrics_digest: entry.query_metrics.query_metrics_digest,
    })),
  });
  const environment_aggregates = environmentSet.members.map((member) => {
    const memberRows = query_evaluations.filter((entry) => entry.environment_digest === member.environment.environment_digest);
    const scopedDigest = retrieval.retrievalCanonicalDigest({
      contract_version: "gkos-retrieval-evaluation-query-metrics-set/1.0.0-draft.1",
      environment_digest: member.environment.environment_digest,
      query_count: memberRows.length,
      query_evaluations: memberRows.map((entry) => ({
        golden_query_digest: entry.golden_query_digest,
        query_metrics_digest: entry.query_metrics.query_metrics_digest,
      })),
    });
    const material = {
      environment_digest: member.environment.environment_digest,
      query_count: memberRows.length,
      query_metrics_set_digest: scopedDigest,
      aggregate_metrics: retrieval.aggregateRetrievalEvaluationMetrics(memberRows.map((entry) => entry.query_metrics)),
    };
    return { ...material, environment_aggregate_digest: retrieval.retrievalCanonicalDigest(material) };
  });
  const material = {
    contract_version: "gkos-retrieval-evaluation-metrics-set/1.0.0-draft.1",
    environment_set_digest: environmentSet.environment_set_digest,
    normalized_golden_digest: golden.golden_digest,
    query_count: rows.length,
    query_evaluations,
    query_metrics_set_digest,
    environment_aggregates,
    aggregate_metrics: retrieval.aggregateRetrievalEvaluationMetrics(rows),
  };
  return { ...material, metrics_set_digest: retrieval.retrievalCanonicalDigest(material) };
}

function allTuneAxes() {
  const result = [];
  for (const rrf_k of evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID.rrf_k) {
    for (const mmr of evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID.mmr) {
      for (const semantic_top_k of evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID.semantic_top_k) {
        for (const lexical_top_k of evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID.lexical_top_k) {
          result.push({ rrf_k, mmr: mmr.enabled, mmr_lambda_micros: mmr.lambda_micros, semantic_top_k, lexical_top_k });
        }
      }
    }
  }
  return result;
}

function fixedProviderTranscriptFixture({
  queryCount = 1,
  maximumExpectedTopK = 100,
  rerankerItemCount = 1,
  providerId = "fixed-offline",
  embeddingModelId = "embedding-v1",
  rerankerModelId = "reranker-v1",
  embeddingRole = "active",
  rerankerRole = "active",
  embeddingOutcome = "success",
  rerankerOutcome = "success",
  lexicalBackend = "sqlite_lexical_scan",
  normalizedGoldenOverride = null,
  vaultFixture = "evaluation-tune-v1",
  artifactCoordinates = null,
} = {}) {
  const golden = normalizedGoldenOverride ?? normalizedGolden(queryCount, maximumExpectedTopK);
  const scopedQueries = golden.queries.filter((query) => query.vault_fixture === vaultFixture);
  if (scopedQueries.length === 0) throw new Error("TEST_PROVIDER_SCOPE_EMPTY");
  const queryPartition = scopedQueries.map((query) => ({ query_id: query.id, query_digest: query.query_digest }));
  const actualMaximumExpectedTopK = Math.max(...golden.queries.map((query) => query.expected_top_k));
  const projectionDigest = artifactCoordinates?.projection_digest ??
    retrieval.retrievalCanonicalDigest({ projection: `provider-${golden.queries.length}-${vaultFixture}-${actualMaximumExpectedTopK}-${rerankerItemCount}` });
  const sourceSnapshotDigest = artifactCoordinates?.source_snapshot_digest ?? retrieval.retrievalCanonicalDigest({ source_snapshot: `fixed-provider-${vaultFixture}` });
  const policyDigest = artifactCoordinates?.runtime_policy_inputs_digest ?? retrieval.retrievalCanonicalDigest({ runtime_policy: `fixed-provider-${vaultFixture}` });
  const oracleDigest = artifactCoordinates?.evaluation_audit_oracle_digest ?? retrieval.retrievalCanonicalDigest({ audit_oracle: `fixed-provider-${vaultFixture}` });
  const corpusDigest = artifactCoordinates?.corpus_fixture_digest ?? retrieval.retrievalCanonicalDigest({ corpus: `fixed-provider-${vaultFixture}` });
  const candidateUniverse = Array.from({ length: rerankerItemCount }, (_, index) => ({
    candidate_chunk_id: retrieval.retrievalSha256(`candidate:${index}`),
    input_digest: retrieval.retrievalSha256(`candidate-input:${index}`),
    score_micros: 1_000_000 - index,
  })).sort((left, right) => retrieval.retrievalCodeUnitCompare(left.candidate_chunk_id, right.candidate_chunk_id));
  const indexCandidate = candidateUniverse[0] ?? {
    candidate_chunk_id: retrieval.retrievalSha256("index-only-candidate"),
    input_digest: retrieval.retrievalSha256("index-only-input"),
    score_micros: 0,
  };
  const indexMaterial = {
    template_id: "embedding-index-main",
    phase: "index",
    embedding_call_ordinal: 1,
    batch_offset: 0,
    request_id: retrieval.retrievalSha256(`index\0${0}\0${indexCandidate.input_digest}`),
    chunk_inputs: [{ accepted_chunk_id: indexCandidate.candidate_chunk_id, input_digest: indexCandidate.input_digest }],
    item_count: 1,
    outcome: "success",
    responses: [{ input_digest: indexCandidate.input_digest, accepted_chunk_id: indexCandidate.candidate_chunk_id, values_micros: [1_000_000, 0] }],
    error_code: null,
    expected_vector_stage: { state: "active", reason_codes: [] },
  };
  const indexTemplates = embeddingRole === "active"
    ? [{ ...indexMaterial, template_digest: retrieval.retrievalCanonicalDigest(indexMaterial) }]
    : [];
  const embeddingTemplates = embeddingRole === "active" ? scopedQueries.map((query, index) => {
    const effective_query_text = retrieval.retrievalEvaluationEffectiveQueryText(query.text);
    const query_input_digest = retrieval.retrievalSha256(effective_query_text);
    const material = {
      template_id: `embedding-query-${String(index + 1).padStart(3, "0")}`,
      phase: "evaluation",
      query_id: query.id,
      query_digest: query.query_digest,
      effective_query_text,
      query_input_digest,
      request_id: query_input_digest,
      item_count: 1,
      outcome: embeddingOutcome,
      responses: embeddingOutcome === "success" ? [{ input_digest: query_input_digest, accepted_chunk_id: null, values_micros: [0, 1_000_000] }] : [],
      error_code: embeddingOutcome === "success" ? null : "FIXED_EMBEDDING_FAILURE",
      expected_vector_stage: embeddingOutcome === "success"
        ? { state: "active", reason_codes: [] }
        : { state: "degraded", reason_codes: ["VECTOR_UNAVAILABLE"] },
    };
    return { ...material, template_digest: retrieval.retrievalCanonicalDigest(material) };
  }) : [];
  const rerankOracles = rerankerRole === "active" ? scopedQueries.map((query, index) => {
    const effective_query_text = retrieval.retrievalEvaluationEffectiveQueryText(query.text);
    const material = {
      template_id: `reranker-query-${String(index + 1).padStart(3, "0")}`,
      phase: "evaluation",
      query_id: query.id,
      query_digest: query.query_digest,
      effective_query_text,
      query_input_digest: retrieval.retrievalSha256(effective_query_text),
      request_id: retrieval.retrievalSha256(`rerank\0${effective_query_text}`),
      candidate_score_universe: candidateUniverse,
      outcome: rerankerOutcome,
      error_code: rerankerOutcome === "success" ? null : "FIXED_RERANKER_FAILURE",
      expected_reranker_stage: rerankerOutcome === "success"
        ? { state: "active", reason_codes: [] }
        : { state: "degraded", reason_codes: ["RERANKER_UNAVAILABLE"] },
    };
    return { ...material, template_digest: retrieval.retrievalCanonicalDigest(material) };
  }) : [];
  const scopeMaterial = {
    contract_version: "gkos-retrieval-evaluation-provider-scope/1.0.0-draft.1",
    vault_fixture: vaultFixture,
    lexical_backend: lexicalBackend,
    normalized_golden_digest: golden.golden_digest,
    normalized_golden_query_count: golden.queries.length,
    corpus_fixture_digest: corpusDigest,
    source_snapshot_digest: sourceSnapshotDigest,
    runtime_policy_inputs_digest: policyDigest,
    evaluation_audit_oracle_digest: oracleDigest,
    projection_id: `retrieval:${projectionDigest.slice(7, 31)}`,
    projection_digest: projectionDigest,
    embedding_role: embeddingRole === "active"
      ? { state: "active", provider_scenario_id: "embedding-success", provider_kind: "local_onnx", provider_id: providerId, model_id: embeddingModelId, dimensions: 2 }
      : { state: "disabled", provider_scenario_id: "disabled", provider_kind: null, provider_id: null, model_id: null, dimensions: null },
    reranker_role: rerankerRole === "active"
      ? { state: "active", provider_scenario_id: "reranker-success", provider_kind: "local_onnx", provider_id: providerId, model_id: rerankerModelId }
      : { state: "disabled", provider_scenario_id: "disabled", provider_kind: null, provider_id: null, model_id: null },
  };
  const environment_scope = { ...scopeMaterial, environment_scope_digest: retrieval.retrievalCanonicalDigest(scopeMaterial) };
  const evalAxes = tuningAxesCoordinate({ rrf_k: 5, mmr: false, mmr_lambda_micros: null,
    semantic_top_k: actualMaximumExpectedTopK > 80 ? 80 : Math.max(5, actualMaximumExpectedTopK),
    lexical_top_k: actualMaximumExpectedTopK > 80 ? 80 : Math.max(5, actualMaximumExpectedTopK) });
  const orderedInputs = candidateUniverse.map((candidate) => ({ candidate_chunk_id: candidate.candidate_chunk_id, input_digest: candidate.input_digest }));
  const requestDigestByQuery = queryPartition.map((_, index) => {
    const oracle = rerankOracles[index];
    return oracle ? retrieval.retrievalCanonicalDigest({
      contract_version: "gkos-retrieval-evaluation-provider-request/1.0.0-draft.1",
      call_kind: "reranker_query",
      request_id: oracle.request_id,
      query_id: oracle.query_id,
      query_digest: oracle.query_digest,
      query_text: oracle.effective_query_text,
      ordered_inputs: orderedInputs,
    }) : null;
  });
  const makeSchedule = (operation, axes) => {
    const matrix = axes.flatMap(() => queryPartition.map((_, queryIndex) => [
      embeddingRole === "active" ? 1 : 0,
      requestDigestByQuery[queryIndex],
      rerankerRole === "active" ? rerankerItemCount : null,
    ]));
    const matrixMaterial = {
      contract_version: "gkos-retrieval-evaluation-provider-occurrence-matrix/1.0.0-draft.1",
      operation,
      query_partition: queryPartition,
      tuning_axes_digests: axes.map((candidate) => candidate.tuning_axes_digest),
      embedding_query_template_digests: queryPartition.map((_, index) => embeddingTemplates[index]?.template_digest ?? null),
      reranker_query_oracle_digests: queryPartition.map((_, index) => rerankOracles[index]?.template_digest ?? null),
      occurrence_matrix: matrix,
    };
    const template_occurrences = [
      ...indexTemplates.map((template) => ({ template_id: template.template_id, occurrence_count: 1 })),
      ...embeddingTemplates.map((template) => ({ template_id: template.template_id, occurrence_count: axes.length })),
      ...rerankOracles.map((oracle) => ({ template_id: oracle.template_id, occurrence_count: axes.length })),
    ].sort((left, right) => retrieval.retrievalCodeUnitCompare(left.template_id, right.template_id));
    const common = {
      contract_version: "gkos-retrieval-evaluation-fixed-provider-schedule/1.0.0-draft.1",
      operation,
      normalized_golden_digest: golden.golden_digest,
      query_partition: queryPartition,
      query_count: queryPartition.length,
      query_evaluation_count: matrix.length,
      occurrence_encoding: "implicit_axes_outer_query_inner_v1",
      occurrence_matrix: matrix,
      occurrence_matrix_digest: retrieval.retrievalCanonicalDigest(matrixMaterial),
      template_occurrences,
      reranker_oracle_coverage: rerankOracles.map((oracle) => ({
        reranker_query_oracle_id: oracle.template_id,
        used_candidate_chunk_ids: axes.length ? candidateUniverse.map((candidate) => candidate.candidate_chunk_id) : [],
      })),
      expected_provider_counters: {
        vector_provider_call_count: indexTemplates.length + matrix.filter((cell) => cell[0] === 1).length,
        vector_provider_item_count: indexTemplates.reduce((sum, template) => sum + template.item_count, 0) + matrix.filter((cell) => cell[0] === 1).length,
        rerank_provider_call_count: matrix.filter((cell) => cell[1] !== null).length,
        rerank_provider_item_count: matrix.reduce((sum, cell) => sum + (cell[2] ?? 0), 0),
      },
    };
    const material = operation === "eval" ? { ...common, evaluation_axes: axes[0] } : {
      ...common,
      tuning_grid: clone(evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID_COORDINATE),
      maximum_expected_top_k: actualMaximumExpectedTopK,
      eligible_tuning_axes: axes,
      evaluated_candidate_count: axes.length,
      excluded_candidate_count: 900 - axes.length,
    };
    return { ...material, schedule_digest: retrieval.retrievalCanonicalDigest(material) };
  };
  const tuneAxes = allTuneAxes().filter((axes) => axes.semantic_top_k >= actualMaximumExpectedTopK && axes.lexical_top_k >= actualMaximumExpectedTopK)
    .map(tuningAxesCoordinate);
  const scenarioMaterial = {
    embedding_provider_scenario_id: embeddingRole === "active" ? "embedding-success" : "disabled",
    reranker_provider_scenario_id: rerankerRole === "active" ? "reranker-success" : "disabled",
    environment_scope,
    embedding_role: embeddingRole,
    reranker_role: rerankerRole,
    embedding_index_templates: indexTemplates,
    embedding_query_templates: embeddingTemplates,
    reranker_query_oracles: rerankOracles,
    eval_schedule: makeSchedule("eval", [evalAxes]),
    tune_schedule: golden.queries.length <= 30 ? makeSchedule("tune", tuneAxes) : null,
    disabled_vector_stage: embeddingRole === "active" ? null : { state: "disabled", reason_codes: ["VECTOR_DISABLED"] },
    disabled_reranker_stage: rerankerRole === "active" ? null : { state: "skipped", reason_codes: ["RERANKER_NOT_CONFIGURED"] },
  };
  const scenario = { ...scenarioMaterial, scenario_digest: retrieval.retrievalCanonicalDigest(scenarioMaterial) };
  const material = {
    contract_version: "gkos-retrieval-evaluation-fixed-provider/1.0.0-draft.1",
    provider_fixture_id: "fixed-provider-v1",
    adapter_backend: "fixed_offline",
    embedding_provider: { provider_kind: "local_onnx", provider_id: providerId, model_id: embeddingModelId, dimensions: 2 },
    reranker_provider: { provider_kind: "local_onnx", provider_id: providerId, model_id: rerankerModelId },
    scenarios: [scenario],
    network: false,
    secrets: false,
  };
  return { golden, transcript: { ...material, provider_fixture_digest: retrieval.retrievalCanonicalDigest(material) }, orderedInputs };
}

function tuneInput(maximumExpectedTopK = 5) {
  const golden = normalizedGolden(24, maximumExpectedTopK);
  const environment_set = environmentSetCoordinate(golden);
  const base_configuration = baseConfigurationCoordinate();
  const tuning_grid = clone(evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID_COORDINATE);
  const query_metrics = golden.queries.map((query) => queryMetricsRow(query.id, query.expected_top_k));
  const metrics_set = metricsSetCoordinate(golden, environment_set, query_metrics);
  const budget = { numerator: 2, denominator: 100 };
  const candidates = allTuneAxes()
    .filter((axes) => axes.semantic_top_k >= maximumExpectedTopK && axes.lexical_top_k >= maximumExpectedTopK)
    .map((rawAxes) => {
      const axes = tuningAxesCoordinate(rawAxes);
      const candidate_config_digest = retrieval.retrievalCanonicalDigest({
        base_configuration_digest: base_configuration.base_configuration_digest,
    candidate_config: evaluationHost.retrievalEvaluationCandidateConfigMaterial(axes),
      });
      const material = {
        ...evaluationCoordinateMaterial({
          environmentSet: environment_set,
          golden,
          baseConfiguration: base_configuration,
          tuningGrid: tuning_grid,
          axes,
          candidateConfigDigest: candidate_config_digest,
          metricsSet: metrics_set,
          budget,
        }),
      };
      return { candidate_config_digest, axes, metrics_set, candidate_evaluation_digest: retrieval.retrievalCanonicalDigest(material) };
    });
  const selectedTopK = [5, 10, 20, 40, 80].find((value) => value >= maximumExpectedTopK) ?? 80;
  const baseline_axes = tuningAxesCoordinate({
    rrf_k: 5, mmr: false, mmr_lambda_micros: null, semantic_top_k: selectedTopK, lexical_top_k: selectedTopK,
  });
  return {
    baseline: baselineEnvelope({
      environmentSet: environment_set,
      golden,
      baseConfiguration: base_configuration,
      tuningGrid: tuning_grid,
      axes: baseline_axes,
      metricsSet: metrics_set,
      budget,
    }),
    candidates,
  };
}

function tuneInputFromBaseline(baselineInput) {
  const baseline = clone(baselineInput);
  const candidates = allTuneAxes()
    .filter((axes) => axes.semantic_top_k >= baseline.maximum_expected_top_k && axes.lexical_top_k >= baseline.maximum_expected_top_k)
    .map((rawAxes) => {
      const axes = tuningAxesCoordinate(rawAxes);
      const candidate_config_digest = retrieval.retrievalCanonicalDigest({
        base_configuration_digest: baseline.base_configuration_digest,
        candidate_config: evaluationHost.retrievalEvaluationCandidateConfigMaterial(axes),
      });
      const material = evaluationCoordinateMaterial({
        environmentSet: baseline.environment_set,
        golden: baseline.normalized_golden,
        baseConfiguration: baseline.base_configuration,
        tuningGrid: baseline.tuning_grid,
        axes,
        candidateConfigDigest: candidate_config_digest,
        metricsSet: baseline.metrics_set,
        budget: baseline.relative_ndcg_budget,
      });
      return {
        candidate_config_digest,
        axes,
        metrics_set: baseline.metrics_set,
        candidate_evaluation_digest: retrieval.retrievalCanonicalDigest(material),
      };
    });
  return { baseline, candidates };
}

function scenarioOutcome(overrides = {}) {
  const { outcome_digest: _ignoredOutcomeDigest, ...safeOverrides } = overrides;
  const material = {
    contract_version: "gkos-retrieval-evaluation-scenario-outcome/1.0.0-draft.1",
    scenario_id: "ordinary-result",
    kind: "result",
    public_result_digest: retrieval.retrievalCanonicalDigest({ result: "ordinary" }),
    coverage: "not_requested",
    confidence: "high",
    reason_code: null,
    message: null,
    ordered_hit_projections: [{
      source_id: "018f0000-0000-7000-8000-000000000301",
      temporal_state: "unknown",
      valid_from: null,
      valid_to: null,
      supersedes: [],
      superseded_by: [],
    }],
    citation_applicability: "required",
    host_classification: null,
    exit_code: 0,
    work_counters: {
      authority_input_snapshot_count: 1,
      source_read_count: 1,
      retrieval_sql_stage_count: 1,
      vector_provider_call_count: 0,
      vector_provider_item_count: 0,
      rerank_provider_call_count: 0,
      rerank_provider_item_count: 0,
      ranking_call_count: 1,
      confidence_call_count: 1,
      citation_verification_count: 1,
      metric_computation_count: 1,
    },
    effects: { public_result_emitted: true, output_artifact_written: false, state_mutated: false },
    ...safeOverrides,
  };
  return { ...material, outcome_digest: retrieval.retrievalCanonicalDigest(material) };
}

function provenanceFor(chunk, asOf = null) {
  const reasonCodes = [
    "ASSERTION_TIME_UNAVAILABLE",
    "LEDGER_BINDING_UNAVAILABLE",
    "LINEAGE_ID_UNAVAILABLE",
    chunk.supersedes.length || chunk.superseded_by.length ? "LINEAGE_PARTICIPANT" : "LINEAGE_NEUTRAL",
    "LINEAGE_VIEW_AUTHORIZED_ONLY",
    ...(asOf === null ? [] : ["TEMPORAL_SELECTION_AS_OF"]),
    "VALIDITY_UNKNOWN",
  ].sort();
  const material = {
    contract_version: "gkos-retrieval-provenance/1.0.0-draft.1",
    source_id: chunk.source_id,
    source_path: chunk.source_path,
    source_digest: chunk.source_digest,
    assertion_time: null,
    assertion_origin: null,
    valid_from: null,
    valid_to: null,
    validity_origin: "unknown",
    lineage_id: null,
    supersedes: [...chunk.supersedes],
    superseded_by: [...chunk.superseded_by],
    temporal_state: "unknown",
    ledger_binding_verified: false,
    lineage_neutral: chunk.supersedes.length === 0 && chunk.superseded_by.length === 0,
    reason_codes: reasonCodes,
    assertion: { chunk_id: chunk.chunk_id, content_digest: chunk.content_digest },
    interval_semantics: "[valid_from,valid_to)",
  };
  return { ...material, provenance_digest: retrieval.retrievalCanonicalDigest(material) };
}

function citationFor(chunk, matchedSpans = []) {
  return {
    source_id: chunk.source_id,
    path: chunk.source_path,
    source_digest: chunk.source_digest,
    heading_path: [...chunk.heading_path],
    start_byte: chunk.start_byte,
    end_byte: chunk.end_byte,
    start_line: chunk.start_line,
    end_line: chunk.end_line,
    verified: true,
    stale: false,
    matched_spans: matchedSpans,
  };
}

function resultFor(query, chunks, fixtureName, parentContext = null) {
  const projectionDigest = retrieval.retrievalCanonicalDigest({ fixture: fixtureName });
  const claimedSpans = new Set();
  const acceptedIntervals = [];
  const hits = [];
  for (const [index, chunk] of chunks.entries()) {
    const matchedSpans = retrieval.lexicalCitationSpans(chunk.text, query).map((span) => ({
      start_byte: chunk.start_byte + span.start_byte,
      end_byte: chunk.start_byte + span.end_byte,
      text: span.text,
    }));
    const evidence = evaluationHost.gkxRetrievalDeduplicateOverlapEvidence(
      citationFor(chunk, matchedSpans), chunk, claimedSpans, acceptedIntervals,
    );
    if (!evidence) continue;
    hits.push({
      chunk,
      citation: evidence.citation,
      provenance: provenanceFor(chunk),
      stage_scores: {
        lexical_score: 1 / (index + 1), semantic_score: null, fusion_score: 1 / (61 + index), reranker_score: null,
        mmr_score: null, lexical_rank: index + 1, semantic_rank: null, fused_rank: index + 1, reranker_rank: null,
        final_rank: hits.length + 1,
      },
      ...(index === chunks.length - 1 && parentContext ? { parent_context: parentContext } : {}),
    });
    for (const key of evidence.span_keys) claimedSpans.add(key);
    acceptedIntervals.push({ source_id: chunk.source_id, start_byte: chunk.start_byte, end_byte: chunk.end_byte });
  }
  return {
    contract_version: "gkos-retrieval/1.0.0-draft.2",
    query_digest: retrieval.retrievalCanonicalDigest({ as_of: null, query }),
    projection_id: `retrieval:${projectionDigest.slice(7, 31)}`,
    projection_digest: projectionDigest,
    projection_freshness: "fresh",
    hits,
    confidence: {
      level: "high",
      low_confidence: false,
      reason_codes: [],
      lexical_signal: 1,
      semantic_signal: null,
      reranker_signal: null,
      coverage_signal: 1,
    },
    temporal: { as_of: null, coverage: "not_requested", reason_codes: [] },
    applied_filters: [],
    eligible_result_count: chunks.length,
    stages: {
      lexical: { kind: "sqlite_fts5", state: "active", reason_codes: [] },
      vector: { kind: "none", state: "disabled", reason_codes: ["VECTOR_DISABLED"] },
      reranker: { kind: "none", state: "skipped", reason_codes: ["RERANKER_NOT_CONFIGURED"] },
    },
  };
}

function queryInputFor({ queryText, queryId, result, sources, expectedSourceIds, expectedFiles = [], forbiddenSourceIds = [] }) {
  const observations = sources.map(({ source_id, source_path, text }) => ({
    source_id,
    source_path,
    source_digest: retrieval.retrievalSha256(Buffer.from(text, "utf8")),
    source_bytes_base64: Buffer.from(text, "utf8").toString("base64"),
  }));
  const query = sealQuery({
    id: queryId,
    text: queryText,
    vault_fixture: "evaluation-unit-v1",
    expected_files: [...expectedFiles].sort(),
    expected_source_ids: [...expectedSourceIds].sort(),
    expected_lineage_ids: [],
    forbidden_source_ids: [...forbiddenSourceIds].sort(),
    forbidden_lineage_ids: [],
    expected_top_k: result.hits.length,
    expected_confidence: "high",
    as_of: null,
  });
  const forbiddenIdSet = new Set(forbiddenSourceIds);
  const authorizedIds = new Set(observations.filter((item) => !forbiddenIdSet.has(item.source_id)).map((item) => item.source_id));
  const authorizedPaths = new Set(observations.filter((item) => !forbiddenIdSet.has(item.source_id)).map((item) => item.source_path));
  const forbiddenIds = new Set(observations.filter((item) => forbiddenIdSet.has(item.source_id)).map((item) => item.source_id));
  const forbiddenPaths = new Set(observations.filter((item) => forbiddenIdSet.has(item.source_id)).map((item) => item.source_path));
  const authorizedEndpointIds = new Set();
  for (const hit of result.hits) {
    hit.provenance.supersedes.forEach((id) => authorizedEndpointIds.add(id));
    hit.provenance.superseded_by.forEach((id) => authorizedEndpointIds.add(id));
  }
  const oracle = sealOracle({
    contract_version: "gkos-retrieval-evaluation-query-view-audit-oracle/1.0.0-draft.1",
    authorized_source_ids: [...authorizedIds].sort(),
    authorized_source_paths: [...authorizedPaths].sort(),
    forbidden_source_ids: [...forbiddenIds].sort(),
    forbidden_source_paths: [...forbiddenPaths].sort(),
    authorized_endpoint_ids: [...authorizedEndpointIds].sort(),
    forbidden_endpoint_ids: [],
    expected_public_result_projection_id: result.projection_id,
    expected_public_result_projection_digest: result.projection_digest,
  });
  return {
    query,
    result,
    source_observations: observations,
    audit_oracle: oracle,
    expected_temporal: {
      coverage: result.temporal.coverage,
      hits: result.hits.map(({ provenance }) => ({
        source_id: provenance.source_id,
        temporal_state: provenance.temporal_state,
        valid_from: provenance.valid_from,
        valid_to: provenance.valid_to,
        supersedes: provenance.supersedes,
        superseded_by: provenance.superseded_by,
      })),
    },
  };
}

test("Phase-4 golden TOML parser is strict, canonical, and host-private", () => {
  const lf = `contract_version = "gkos-retrieval-evaluation-golden/1.0.0-draft.1"

[[query]]
id = "beta-query"
text = "  preserved query  "
vault_fixture = "retrieval-basic-v1"
expected_files = ['z.md', "a.md"]
expected_source_ids = ["018f0000-0000-7000-8000-000000000302"]
expected_lineage_ids = []
forbidden_source_ids = []
forbidden_lineage_ids = []
expected_top_k = 5
expected_confidence = "medium"

[[query]] # normalized order is by id
id = "alpha-query"
text = "What governs policy?"
vault_fixture = "retrieval-basic-v1"
expected_files = []
expected_source_ids = ["018f0000-0000-7000-8000-000000000301"]
expected_lineage_ids = []
forbidden_source_ids = ["018f0000-0000-7000-8000-000000000399"]
forbidden_lineage_ids = []
expected_top_k = 10
expected_confidence = "high"
as_of = "2026-08-01T00:00Z"
`;
  const parsed = evaluationHost.parseRetrievalEvaluationGoldenToml(lf);
  assert.deepEqual(parsed.queries.map((query) => query.id), ["alpha-query", "beta-query"]);
  assert.equal(parsed.queries[0].as_of, "2026-08-01T00:00:00.000Z");
  assert.equal(parsed.queries[1].text, "  preserved query  ");
  assert.deepEqual(parsed.queries[1].expected_files, ["a.md", "z.md"]);
  assert.deepEqual(evaluationHost.parseRetrievalEvaluationGoldenToml(lf.replaceAll("\n", "\r\n")), parsed);
  const unicode = evaluationHost.parseRetrievalEvaluationGoldenToml(lf
    .replace("text = \"What governs policy?\"", "text = \"astral 𐐀 and separators   \"")
    .replace("expected_files = []", "expected_files = ['.md', '😀.md']"));
  assert.equal(unicode.queries[0].text, "astral 𐐀 and separators   ");
  assert.deepEqual(unicode.queries[0].expected_files, ["😀.md", ".md"]);
  assert.deepEqual(evaluationHost.parseRetrievalEvaluationGoldenToml(lf
    .replace("text = \"What governs policy?\"", "text = \"astral 𐐀 and separators   \"")
    .replace("expected_files = []", "expected_files = ['.md', '😀.md']")
    .replaceAll("\n", "\r\n")), unicode);
  assert.equal("parseRetrievalEvaluationGoldenToml" in retrieval, false);
  assert.equal("parseRetrievalEvaluationGoldenToml" in core, false);

  const invalid = new Map([
    ["\uFEFF" + lf, "GKX_EVAL_GOLDEN_TOML_BOM_INVALID"],
    [lf.replace("\n\n", "\r\n\r"), "GKX_EVAL_GOLDEN_TOML_NEWLINE_INVALID"],
    [lf.replace("expected_top_k = 5", "expected_top_k = +5"), "GKX_EVAL_GOLDEN_TOML_INTEGER_INVALID"],
    [lf.replace("expected_files = ['z.md', \"a.md\"]", "expected_files = ['z.md',]"), "GKX_EVAL_GOLDEN_TOML_ARRAY_TRAILING_COMMA_INVALID"],
    [lf.replace("expected_lineage_ids = []", "expected_lineage_ids = ['018f0000-0000-7000-8000-000000000301']"), "GKX_EVAL_LINEAGE_ID_UNAVAILABLE"],
    [lf.replace("expected_confidence = \"medium\"", "expected_confidence = \"insufficient\""), "GKX_EVAL_CONFIDENCE_INVALID"],
    [lf.replace("id = \"beta-query\"", "unknown = \"x\""), "GKX_EVAL_GOLDEN_TOML_QUERY_KEY_UNKNOWN"],
    [lf.replace("text = \"What governs policy?\"", "text = \"bad\\uD800\""), "GKX_EVAL_GOLDEN_TOML_UNICODE_ESCAPE_INVALID"],
  ]);
  for (const [raw, code] of invalid) assert.throws(() => evaluationHost.parseRetrievalEvaluationGoldenToml(raw), { message: code });
  for (const raw of [
    `# invalid\u0000\n${lf}`,
    `# invalid\u007f\r\n${lf.replaceAll("\n", "\r\n")}`,
    lf.replace("[[query]] # normalized order is by id", "[[query]] # invalid\u0001"),
    lf.replace("text = \"What governs policy?\"", "text = \"hash # invalid\u0002\""),
  ]) assert.throws(() => evaluationHost.parseRetrievalEvaluationGoldenToml(raw), /GKX_EVAL_GOLDEN_TOML_LINE_\d+_INVALID/u);

  const withText = (assignment) => lf.replace("text = \"What governs policy?\"", assignment);
  assert.throws(() => evaluationHost.parseRetrievalEvaluationGoldenToml(withText("text = '!!!'")), /GKX_EVAL_QUERY_LEXICAL_INVALID/u);
  assert.throws(() => evaluationHost.parseRetrievalEvaluationGoldenToml(withText("text = '\"unterminated'")), /GKX_EVAL_QUERY_LEXICAL_INVALID/u);
  assert.throws(() => evaluationHost.parseRetrievalEvaluationGoldenToml(withText(`text = '${Array.from({ length: 65 }, (_, index) => `q${index}`).join(" ")}'`)),
    /GKX_EVAL_QUERY_LEXICAL_CLAUSE_COUNT_INVALID/u);
  assert.throws(() => evaluationHost.parseRetrievalEvaluationGoldenToml(withText(`text = '${"a".repeat(257)}'`)),
    /GKX_EVAL_QUERY_LEXICAL_CLAUSE_SIZE_INVALID/u);
  assert.throws(() => evaluationHost.parseRetrievalEvaluationGoldenToml(withText("text = '\u00a0\u2000\u3000'")),
    /GKX_EVAL_QUERY_EFFECTIVE_TEXT_INVALID/u);
  assert.equal(evaluationHost.parseRetrievalEvaluationGoldenToml(withText(`text = '${Array.from({ length: 64 }, (_, index) => `q${index}`).join(" ")}'`))
    .queries[0].id, "alpha-query");
  assert.equal(evaluationHost.parseRetrievalEvaluationGoldenToml(withText(`text = '\"${"a".repeat(256)}\"'`)).queries[0].id, "alpha-query");
  const effectiveBoundary = evaluationHost.parseRetrievalEvaluationGoldenToml(withText("text = \"\\uFEFF  alpha\u00a0beta  \\uFEFF\""));
  assert.equal(retrieval.retrievalEvaluationEffectiveQueryText(effectiveBoundary.queries[0].text), "alpha\u00a0beta");
  const rawFeffBoundary = evaluationHost.parseRetrievalEvaluationGoldenToml(withText("text = \"\uFEFF  alpha\u00a0beta  \uFEFF\""));
  assert.deepEqual(rawFeffBoundary, effectiveBoundary);
  assert.deepEqual(evaluationHost.parseRetrievalEvaluationGoldenToml(
    lf.replace("[[query]] # normalized order is by id", "[[query]] # embedded \uFEFF is inert in comments"),
  ), parsed);
  for (const nonTrim of ["\u0085", "\u180e", "\u200b"]) {
    const value = `alpha${nonTrim}beta`;
    assert.equal(retrieval.retrievalEvaluationEffectiveQueryText(value), value);
  }
});

test("raw Phase-4 fixture and provider authority stays outside public exports", () => {
  const forbidden = [
    "parseRetrievalEvaluationGoldenToml",
    "sealRetrievalEvaluationFixedProviderTranscript",
    "verifyRetrievalEvaluationFixedProviderOccurrenceRequest",
    "sealRetrievalEvaluationFixtureCatalog",
    "sealRetrievalEvaluationSourceCorpus",
    "sealRetrievalEvaluationEnvironmentBundle",
    "sealRetrievalEvaluationExecutableEnvironmentBundle",
    "selectRetrievalEvaluationTuneCandidate",
    "retrievalEvaluationCandidateConfigMaterial",
    "RETRIEVAL_EVALUATION_TUNING_GRID",
    "RETRIEVAL_EVALUATION_TUNING_GRID_COORDINATE",
    "RETRIEVAL_EVALUATION_FIXED_PROVIDER_VERSION",
    "RETRIEVAL_EVALUATION_FIXTURE_CATALOG_VERSION",
  ];
  for (const name of forbidden) {
    assert.equal(name in retrieval, false, `${name} leaked through /retrieval`);
    assert.equal(name in core, false, `${name} leaked through the root bundle`);
  }
  assert.equal(typeof evaluationHost.parseRetrievalEvaluationGoldenToml, "function");
  assert.equal(typeof evaluationHost.sealRetrievalEvaluationFixedProviderTranscript, "function");
  const publicDeclarations = readFileSync(new URL("../dist/retrieval/index.d.ts", import.meta.url), "utf8");
  for (const fragment of [
    "evaluation-fixtures",
    "FixedProviderTranscript",
    "FixtureCatalog",
    "EnvironmentBundle",
    "OccurrenceRequest",
    "selectRetrievalEvaluationTuneCandidate",
    "retrievalEvaluationCandidateConfigMaterial",
    "RetrievalEvaluationTuneCandidate",
    "RetrievalEvaluationTuneSelection",
  ]) assert.equal(publicDeclarations.includes(fragment), false, `${fragment} leaked through public declarations`);
  assert.equal(typeof evaluationHost.selectRetrievalEvaluationTuneCandidate, "function");
  assert.equal(typeof evaluationHost.retrievalEvaluationCandidateConfigMaterial, "function");
});

test("Phase-4 discount table and tune grid are exact integer coordinates", () => {
  const table = retrieval.RETRIEVAL_EVALUATION_NDCG_TABLE;
  const declared = PHASE4_CONFORMANCE.ndcg;
  assert.equal(table.ndcg_discount_scale, 1_000_000_000_000);
  assert.equal(table.rank_count, 100);
  assert.equal(table.ndcg_discount_scaled.length, 100);
  assert.deepEqual(table.ndcg_discount_scaled.slice(0, 3), [1_000_000_000_000, 630_929_753_571, 500_000_000_000]);
  assert.ok(table.ndcg_discount_scaled.every((value, index, values) => value > 0 && (index === 0 || value < values[index - 1])));
  assert.equal(table.table_digest, retrieval.retrievalCanonicalDigest({
    contract_version: table.contract_version,
    ndcg_discount_scale: table.ndcg_discount_scale,
    rank_count: table.rank_count,
    ndcg_discount_scaled: table.ndcg_discount_scaled,
    generator: table.generator,
  }));
  assert.equal(retrieval.RETRIEVAL_EVALUATION_COORDINATES.ndcg_discount_table_digest, table.table_digest);
  assert.equal(declared.table_digest, table.table_digest);
  assert.deepEqual(declared.anchors, table.ndcg_discount_scaled.slice(0, 3));
  assert.equal(declared.rank_count, table.rank_count);
  assert.equal(declared.strictly_decreasing_positive, true);
  assert.equal(evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID.rrf_k.length *
    evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID.mmr.length *
    evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID.semantic_top_k.length *
    evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID.lexical_top_k.length, 900);
  const encodedLength = 4 * Math.ceil(retrieval.RETRIEVAL_EVALUATION_MAX_SOURCE_BYTES / 3);
  assert.equal(evaluationHost.retrievalEvaluationDecodedBase64Length(encodedLength, 2), retrieval.RETRIEVAL_EVALUATION_MAX_SOURCE_BYTES);
  assert.equal(evaluationHost.retrievalEvaluationDecodedBase64Length(encodedLength, 1), retrieval.RETRIEVAL_EVALUATION_MAX_SOURCE_BYTES + 1);

  const python = process.env.GKOS_PYTHON311 || "python";
  const version = spawnSync(python, ["--version"], { encoding: "utf8" });
  assert.equal(version.status, 0, `qualified Python unavailable: ${version.stderr || version.stdout}`);
  if (process.env.GKOS_REQUIRE_PYTHON311 === "1") assert.match(`${version.stdout}${version.stderr}`, /^Python 3\.11\./u);
  const generated = spawnSync(python, [fileURLToPath(new URL(
    declared.generator_file,
    PHASE4_PACK,
  ))], { encoding: null });
  assert.equal(generated.status, 0, generated.stderr?.toString("utf8"));
  const checkedTableBytes = readFileSync(new URL(
    declared.table_file,
    PHASE4_PACK,
  ));
  assert.deepEqual(JSON.parse(checkedTableBytes), table);
  assert.deepEqual(generated.stdout, checkedTableBytes);
});

test("provisional Phase-4 schemas compile and every checked fixture validates", () => {
  const ajv = phase4Ajv();
  const assertSchema = (name, value) => {
    const schema = readJson(new URL(name, PHASE4_PACK));
    const validate = ajv.getSchema(schema.$id);
    assert.ok(validate, `schema ${name} was registered`);
    assert.equal(validate(value), true, `${name}: ${JSON.stringify(validate.errors)}`);
  };
  assertSchema("normalized-golden.schema.json", PHASE4_CONFORMANCE.golden.expected_normalized);
  assertSchema("query-metrics.schema.json", PHASE4_CONFORMANCE.valid_envelopes.query_metrics);
  assertSchema("aggregate-metrics.schema.json", PHASE4_CONFORMANCE.valid_envelopes.aggregate_metrics);
  assertSchema("environment-set.schema.json", PHASE4_CONFORMANCE.valid_envelopes.environment_set);
  for (const member of PHASE4_CONFORMANCE.valid_envelopes.environment_set.members) {
    assertSchema("environment.schema.json", member.environment);
  }
  assertSchema("metrics-set.schema.json", PHASE4_CONFORMANCE.valid_envelopes.metrics_set);
  assertSchema("baseline.schema.json", PHASE4_CONFORMANCE.valid_envelopes.baseline);
  assertSchema("base-configuration.schema.json", PHASE4_CONFORMANCE.valid_envelopes.baseline.base_configuration);
  assertSchema("tuning-axes.schema.json", PHASE4_CONFORMANCE.valid_envelopes.baseline.selected_axes);
  assertSchema("tuning-grid.schema.json", PHASE4_CONFORMANCE.valid_envelopes.baseline.tuning_grid);
  assertSchema("observation-report.schema.json", PHASE4_CONFORMANCE.valid_envelopes.observation_report);
  assertSchema("fixed-provider.schema.json", PHASE4_FIXED_PROVIDER);
  assertSchema("fixture-catalog.schema.json", PHASE4_FIXTURE_CATALOG);
  assertSchema("source-corpus.schema.json", PHASE4_SOURCE_CORPUS);
  assertSchema("metric-computation-fixture.schema.json", PHASE4_METRIC_COMPUTATION);
  assertSchema("tune-priority-fixture.schema.json", PHASE4_TUNE_PRIORITY);
  assertSchema("reviewed-bundle.schema.json", PHASE4_REVIEWED_BUNDLE);
  for (const outcome of PHASE4_SCENARIO_CONFORMANCE.outcomes) assertSchema("scenario-outcome.schema.json", outcome);
  assertSchema("ndcg-discount-table.schema.json", readJson(new URL("ndcg-discount-table.json", PHASE4_PACK)));
});

test("provisional Phase-4 fixture matrices are exhaustively consumed by semantic sealers", () => {
  assert.deepEqual(Object.keys(PHASE4_CONFORMANCE).sort(), [
    "comparison_matrix", "contract_version", "environment_endpoint_partition_matrix", "fixture_files", "golden", "metric_semantic_negative_matrix", "ndcg",
    "observation_version_matrix", "opaque_identity_matrix", "oracle_partition_matrix", "portable_scalar_matrix", "provider_semantic_matrix", "reviewed_bundle_negative_matrix", "tune_matrix",
    "valid_envelopes",
  ]);
  const expectedCaseSets = {
    parser: ["bare-cr", "bom", "duplicate-key", "insufficient-ordinary", "nonempty-lineage", "surrogate-escape", "trailing-comma", "unknown-key"],
    metric: ["aggregate-failures-over-query-count", "forged-citation-rate", "query-id-overlong", "returned-zero-with-citation", "top-k-zero", "unknown-field"],
    comparison: ["environment-change", "exact-two-percent-boundary", "over-budget", "zero-baseline", "zero-hit-current"],
    tune: ["max-top-k-100", "max-top-k-80", "shipped-24-query-grid"],
    portable: ["invalid-version-uid", "path-absolute", "path-ads", "path-double-slash", "path-parent", "path-reserved", "path-trailing-dot", "path-trailing-slash", "path-trailing-space", "path-utf8-1024-bytes", "path-utf8-1025-bytes", "uppercase-valid-uid"],
    opaqueIdentity: ["all-ecmascript-trim", "astral-512-utf16", "astral-514-utf16", "c0-control", "del-control", "internal-spaces", "lone-surrogate", "url-looking-unicode"],
    observationVersion: ["ascii-32", "ascii-33", "del", "non-ascii", "single-ascii", "space", "vendor-label"],
    providerSemantic: ["all-excluded-tune-index-replay", "disabled-embedding-retains-template", "disabled-reranker-retains-oracle", "embedding-failure-with-response", "embedding-failure-wrong-stage", "embedding-query-failure-degrades", "embedding-template-permutation", "eval-query-count-256", "eval-query-count-257", "eval-query-count-30", "eval-query-count-31", "fts-only-disabled-provider-roles", "hybrid-without-reranker", "reranker-failure-degrades", "reranker-failure-wrong-error", "reranker-items-0", "reranker-items-100", "reranker-items-101", "reranker-items-160", "reranker-items-161", "reranker-template-permutation"],
    oracle: ["authorized-endpoint", "cross-role-explicit-classification", "endpoint-authorization-overlap", "endpoint-only-in-source-class", "forbidden-endpoint-occurrences", "malformed-endpoint-scalar", "null-lineage-and-absent-parent-zero", "source-only-in-endpoint-class", "unknown-endpoint"],
    environmentEndpoint: ["bundle-endpoint-class-substitution", "bundle-endpoint-extra-uid", "bundle-endpoint-source-only-omission", "bundle-source-endpoint-only"],
    reviewedBundle: ["reviewed-absent-endpoint-extra", "reviewed-absent-index-input-order", "reviewed-absent-index-request-substitution", "reviewed-absent-index-response-omission", "reviewed-absent-source-class-substitution", "reviewed-baseline-axes-substitution", "reviewed-baseline-grid-substitution", "reviewed-companion-digest-splice", "reviewed-future-result-splice", "reviewed-hidden-result-splice", "reviewed-origin-counter-splice", "reviewed-origin-duplicate", "reviewed-origin-omission", "reviewed-origin-order", "reviewed-origin-provider-splice", "reviewed-origin-public-result-splice", "reviewed-origin-request-splice", "reviewed-origin-schedule-splice", "reviewed-pair-public-view-splice"],
    scenarioSemantic: ["conflict-downstream-work", "operational-after-snapshot", "rerank-items-without-call", "scenario-id-overlong", "sufficient-unknown-hit", "vector-items-without-call"],
    scenarioComparison: ["kind-transition", "same-outcome"],
    scenarioPrecedence: ["known-conflict-over-unknown-coverage"],
  };
  const assertCaseSet = (rows, expected) => {
    const ids = rows.map((row) => row.case_id);
    assert.equal(new Set(ids).size, ids.length, "fixture case IDs must be unique");
    assert.deepEqual([...ids].sort(), expected);
  };
  assertCaseSet(PHASE4_CONFORMANCE.golden.parser_negative_matrix, expectedCaseSets.parser);
  assertCaseSet(PHASE4_CONFORMANCE.metric_semantic_negative_matrix, expectedCaseSets.metric);
  assertCaseSet(PHASE4_CONFORMANCE.comparison_matrix, expectedCaseSets.comparison);
  assertCaseSet(PHASE4_CONFORMANCE.tune_matrix, expectedCaseSets.tune);
  assertCaseSet(PHASE4_CONFORMANCE.portable_scalar_matrix, expectedCaseSets.portable);
  assertCaseSet(PHASE4_CONFORMANCE.opaque_identity_matrix, expectedCaseSets.opaqueIdentity);
  assertCaseSet(PHASE4_CONFORMANCE.observation_version_matrix, expectedCaseSets.observationVersion);
  assertCaseSet(PHASE4_CONFORMANCE.provider_semantic_matrix, expectedCaseSets.providerSemantic);
  assertCaseSet(PHASE4_CONFORMANCE.oracle_partition_matrix, expectedCaseSets.oracle);
  assertCaseSet(PHASE4_CONFORMANCE.environment_endpoint_partition_matrix, expectedCaseSets.environmentEndpoint);
  assertCaseSet(PHASE4_CONFORMANCE.reviewed_bundle_negative_matrix, expectedCaseSets.reviewedBundle);
  assertCaseSet(PHASE4_SCENARIO_CONFORMANCE.semantic_negative_matrix, expectedCaseSets.scenarioSemantic);
  assertCaseSet(PHASE4_SCENARIO_CONFORMANCE.comparison_matrix, expectedCaseSets.scenarioComparison);
  assertCaseSet(PHASE4_SCENARIO_CONFORMANCE.precedence_matrix, expectedCaseSets.scenarioPrecedence);

  const goldenText = readFileSync(new URL(PHASE4_CONFORMANCE.golden.toml_file, PHASE4_PACK), "utf8");
  const normalized = evaluationHost.parseRetrievalEvaluationGoldenToml(goldenText);
  assert.deepEqual(normalized, PHASE4_CONFORMANCE.golden.expected_normalized);
  const goldenMutations = {
    prepend_bom: (text) => `\uFEFF${text}`,
    replace_first_lf_with_bare_cr: (text) => text.replace("\n[[query]]", "\r[[query]]"),
    replace_first_query_id_key_with_unknown: (text) => text.replace("id = ", "unknown = "),
    duplicate_first_query_id: (text) => text.replace(/^(id = [^\n]+)$/mu, "$1\n$1"),
    add_first_array_trailing_comma: (text) => text.replace(/^(expected_files = \[[^\n]+)(\])$/mu, "$1,$2"),
    set_first_expected_lineage_nonempty: (text) => text.replace("expected_lineage_ids = []", "expected_lineage_ids = [\"019b2d14-4230-7db7-87d4-7d81cfaec932\"]"),
    set_first_confidence_insufficient: (text) => text.replace("expected_confidence = \"high\"", "expected_confidence = \"insufficient\""),
    set_first_text_lone_surrogate_escape: (text) => text.replace(/^(text = ).+$/mu, "$1\"bad\\uD800\""),
  };
  for (const row of PHASE4_CONFORMANCE.golden.parser_negative_matrix) {
    assert.equal(typeof goldenMutations[row.mutation], "function", `unknown parser mutation ${row.mutation}`);
    assert.throws(() => evaluationHost.parseRetrievalEvaluationGoldenToml(goldenMutations[row.mutation](goldenText)), { message: row.expected_code });
  }

  assert.equal(PHASE4_CONFORMANCE.fixture_files.fixed_provider.digest, PHASE4_FIXED_PROVIDER.provider_fixture_digest);
  assert.equal(PHASE4_CONFORMANCE.fixture_files.fixture_catalog.digest, PHASE4_FIXTURE_CATALOG.catalog_digest);
  assert.equal(PHASE4_CONFORMANCE.fixture_files.source_corpus.digest, PHASE4_SOURCE_CORPUS.source_corpus_digest);
  assert.equal(PHASE4_CONFORMANCE.fixture_files.metric_computation.digest, PHASE4_METRIC_COMPUTATION.fixture_digest);
  assert.equal(PHASE4_CONFORMANCE.fixture_files.tune_priority.digest, PHASE4_TUNE_PRIORITY.fixture_digest);
  assert.equal(PHASE4_CONFORMANCE.fixture_files.reviewed_bundle.digest, PHASE4_REVIEWED_BUNDLE.reviewed_bundle_digest);
  assert.deepEqual(evaluationHost.sealRetrievalEvaluationFixedProviderTranscript(PHASE4_FIXED_PROVIDER), PHASE4_FIXED_PROVIDER);
  assert.deepEqual(evaluationHost.sealRetrievalEvaluationFixtureCatalog(PHASE4_FIXTURE_CATALOG), PHASE4_FIXTURE_CATALOG);
  assert.deepEqual(evaluationHost.sealRetrievalEvaluationSourceCorpus(PHASE4_SOURCE_CORPUS), PHASE4_SOURCE_CORPUS);
  assert.equal(PHASE4_FIXED_PROVIDER.scenarios.reduce((sum, scenario) => sum + scenario.eval_schedule.query_count, 0), 24);
  assert.equal(PHASE4_FIXED_PROVIDER.scenarios.reduce((sum, scenario) => sum + scenario.tune_schedule.query_evaluation_count, 0), 21_600);
  assert.ok(Buffer.byteLength(readFileSync(new URL(PHASE4_CONFORMANCE.fixture_files.fixed_provider.file, PHASE4_PACK))) <= 8 * 1024 * 1024);
  const environmentBundle = {
    environment_set: PHASE4_CONFORMANCE.valid_envelopes.environment_set,
    normalized_golden: normalized,
    fixture_catalog: PHASE4_FIXTURE_CATALOG,
    source_corpus: PHASE4_SOURCE_CORPUS,
    fixed_provider_transcript: PHASE4_FIXED_PROVIDER,
    projection_manifests: PHASE4_CONFORMANCE.valid_envelopes.projection_manifests,
  };
  assert.deepEqual(evaluationHost.sealRetrievalEvaluationEnvironmentBundle(environmentBundle), environmentBundle);
  assert.deepEqual(evaluationHost.sealRetrievalEvaluationExecutableEnvironmentBundle(environmentBundle), environmentBundle);
  const endpointMutations = {
    omit_canonical_endpoint: (oracle) => {
      oracle.authorized_endpoint_ids = oracle.authorized_endpoint_ids.slice(0, -1);
    },
    add_extra_authorized_endpoint: (oracle) => {
      oracle.authorized_endpoint_ids.push("019b2d14-4230-7db7-87d4-7d81cfaec935");
      oracle.authorized_endpoint_ids.sort();
    },
    move_authorized_endpoint_to_forbidden: (oracle) => {
      const endpoint = oracle.authorized_endpoint_ids.at(-1);
      oracle.authorized_endpoint_ids = oracle.authorized_endpoint_ids.filter((value) => value !== endpoint);
      oracle.forbidden_endpoint_ids = [endpoint];
    },
    remove_source_class_keep_endpoint: (oracle, entry) => {
      const sourceId = oracle.authorized_endpoint_ids.at(-1);
      const source = entry.source_snapshot.source_observations.find((candidate) => candidate.source_id === sourceId);
      assert.ok(source);
      oracle.authorized_source_ids = oracle.authorized_source_ids.filter((value) => value !== sourceId);
      oracle.authorized_source_paths = oracle.authorized_source_paths.filter((value) => value !== source.source_path);
    },
  };
  for (const row of PHASE4_CONFORMANCE.environment_endpoint_partition_matrix) {
    assert.equal(typeof endpointMutations[row.mutation], "function", row.case_id);
    const mutatedBundle = resealEnvironmentBundleAuditMutation(
      environmentBundle,
      "retrieval-temporal-v1",
      endpointMutations[row.mutation],
    );
    assert.throws(() => evaluationHost.sealRetrievalEvaluationExecutableEnvironmentBundle(mutatedBundle),
      { message: row.expected_code }, row.case_id);
  }
  assert.deepEqual(retrieval.sealRetrievalEvaluationMetricsSet(
    PHASE4_CONFORMANCE.valid_envelopes.metrics_set,
    PHASE4_CONFORMANCE.valid_envelopes.environment_set,
    normalized,
  ), PHASE4_CONFORMANCE.valid_envelopes.metrics_set);
  assert.deepEqual(retrieval.sealRetrievalEvaluationBaseline(PHASE4_CONFORMANCE.valid_envelopes.baseline), PHASE4_CONFORMANCE.valid_envelopes.baseline);
  assert.deepEqual(retrieval.sealRetrievalEvaluationObservationReport(PHASE4_CONFORMANCE.valid_envelopes.observation_report),
    PHASE4_CONFORMANCE.valid_envelopes.observation_report);

  const queryBase = PHASE4_CONFORMANCE.valid_envelopes.query_metrics;
  const aggregateBase = PHASE4_CONFORMANCE.valid_envelopes.aggregate_metrics;
  const metricMutations = {
    query_id_129_ascii: () => reseal({ ...queryBase, query_id: "a".repeat(129) }, "query_metrics_digest"),
    expected_top_k_zero: () => reseal({ ...queryBase, expected_top_k: 0 }, "query_metrics_digest"),
    returned_unique_source_count_zero: () => reseal({
      ...queryBase,
      returned_unique_source_count: 0,
      relevant_returned_source_count: 0,
      relevant_source_ranks: [],
      first_relevant_rank: null,
      recall_at_k_micros: 0,
      mrr_micros: 0,
      ndcg_at_k_micros: 0,
      policy: { ...queryBase.policy, policy_identity_field_count: 2 },
    }, "query_metrics_digest"),
    citation_correctness_zero: () => reseal({ ...queryBase, citation: { ...queryBase.citation, correctness_micros: 0 } }, "query_metrics_digest"),
    temporal_mismatch_count_over_query_count: () => reseal({ ...aggregateBase, temporal_mismatch_count: aggregateBase.query_count + 1 }, "aggregate_metrics_digest"),
    add_unknown_field: () => ({ ...queryBase, unknown_field: true }),
  };
  for (const row of PHASE4_CONFORMANCE.metric_semantic_negative_matrix) {
    assert.equal(typeof metricMutations[row.mutation], "function", `unknown metric mutation ${row.mutation}`);
    const sealer = row.target === "query_metrics" ? retrieval.sealRetrievalEvaluationQueryMetrics : retrieval.sealRetrievalEvaluationAggregateMetrics;
    assert.throws(() => sealer(metricMutations[row.mutation]()), { message: row.expected_code });
  }

  const ajv = phase4Ajv();
  const commonId = readJson(new URL("common.schema.json", PHASE4_PACK)).$id;
  const uidSchema = ajv.getSchema(`${commonId}#/$defs/uid`);
  const pathSchema = ajv.getSchema(`${commonId}#/$defs/sourcePath`);
  assert.ok(uidSchema && pathSchema);
  for (const row of PHASE4_CONFORMANCE.portable_scalar_matrix) {
    const value = decodeFixtureScalar(row);
    const schemaValid = row.kind === "uid" ? uidSchema(value) : pathSchema(value);
    const runtimeValid = row.kind === "uid" ? core.isValidGkxAuthoredUid(value) : retrieval.isValidRetrievalEvaluationSourcePath(value);
    assert.equal(schemaValid, row.schema_valid, `${row.case_id} schema result`);
    assert.equal(runtimeValid, row.runtime_valid, `${row.case_id} runtime result`);
    if (row.case_id === "path-utf8-1024-bytes") assert.equal(Buffer.byteLength(value, "utf8"), 1024);
    if (row.case_id === "path-utf8-1025-bytes") assert.equal(Buffer.byteLength(value, "utf8"), 1025);
  }

  const outcomeById = new Map(PHASE4_SCENARIO_CONFORMANCE.outcomes.map((outcome) => [outcome.scenario_id, outcome]));
  assert.deepEqual([...new Set(PHASE4_SCENARIO_CONFORMANCE.outcomes.map((outcome) => outcome.kind))].sort(),
    PHASE4_SCENARIO_CONFORMANCE.expected_kind_set);
  assert.deepEqual(PHASE4_SCENARIO_CONFORMANCE.outcomes.filter((outcome) => outcome.kind === "result").map((outcome) =>
    outcome.ordered_hit_projections.length === 0 ? "canonical-empty-authorized" : "ordinary-nonempty").sort(),
  PHASE4_SCENARIO_CONFORMANCE.expected_result_branch_set);
  for (const outcome of PHASE4_SCENARIO_CONFORMANCE.outcomes) assert.deepEqual(retrieval.sealRetrievalEvaluationScenarioOutcome(outcome), outcome);
  const scenarioMutations = {
    vector_provider_item_count_one: (base) => ({ ...base, work_counters: { ...base.work_counters, vector_provider_item_count: 1 } }),
    rerank_provider_item_count_one: (base) => ({ ...base, work_counters: { ...base.work_counters, rerank_provider_item_count: 1 } }),
    coverage_sufficient_keep_unknown_hit: (base) => ({ ...base, coverage: "sufficient" }),
    retrieval_sql_stage_count_one: (base) => ({ ...base, work_counters: { ...base.work_counters, retrieval_sql_stage_count: 1 } }),
    authority_input_snapshot_count_one: (base) => ({ ...base, work_counters: { ...base.work_counters, authority_input_snapshot_count: 1 } }),
    scenario_id_129_ascii: (base) => ({ ...base, scenario_id: "a".repeat(129) }),
  };
  for (const row of PHASE4_SCENARIO_CONFORMANCE.semantic_negative_matrix) {
    const base = outcomeById.get(row.base_scenario_id);
    assert.ok(base && scenarioMutations[row.mutation], `scenario mutation ${row.mutation}`);
    const { outcome_digest: _prior, ...material } = scenarioMutations[row.mutation](base);
    const mutated = { ...material, outcome_digest: retrieval.retrievalCanonicalDigest(material) };
    assert.throws(() => retrieval.sealRetrievalEvaluationScenarioOutcome(mutated), { message: row.expected_code });
  }
  for (const row of PHASE4_SCENARIO_CONFORMANCE.comparison_matrix) {
    const expected = outcomeById.get(row.expected_scenario_id);
    let observed = outcomeById.get(row.observed_scenario_id);
    if (row.observed_mutation === "authorized_conflict_same_scenario_id") {
      const conflict = outcomeById.get("authorized-conflict");
      const { outcome_digest: _prior, ...material } = { ...conflict, scenario_id: expected.scenario_id };
      observed = { ...material, outcome_digest: retrieval.retrievalCanonicalDigest(material) };
    }
    assert.ok(expected && observed, row.case_id);
    const comparison = retrieval.compareRetrievalEvaluationScenarioOutcome(expected, observed);
    assertPhase4SchemaValue("scenario-comparison.schema.json", comparison);
    assert.equal(comparison.status, row.expected_status);
    assert.deepEqual(comparison.reasons, row.expected_reasons);
  }
  for (const row of PHASE4_SCENARIO_CONFORMANCE.precedence_matrix) {
    assert.equal(row.known_conflict && row.unknown_coverage, true);
    assert.equal(row.phase2_contract_reference, "contract.json#/as_of/conflict_precedence");
    assert.equal(RETRIEVAL_CONTRACT.as_of.conflict_precedence,
      "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT wins over TEMPORAL_COVERAGE_INSUFFICIENT when a known-created authorized conflict coexists with unknown coverage");
    const selected = outcomeById.get(row.expected_outcome_reference.split("=").at(-1));
    const competingBase = outcomeById.get(row.competing_outcome_reference.split("=").at(-1));
    assert.ok(selected && competingBase, row.case_id);
    assert.equal(selected.kind, "authorized_view_conflict");
    const { outcome_digest: _prior, ...competingMaterial } = { ...competingBase, scenario_id: selected.scenario_id };
    const competing = { ...competingMaterial, outcome_digest: retrieval.retrievalCanonicalDigest(competingMaterial) };
    const comparison = retrieval.compareRetrievalEvaluationScenarioOutcome(selected, competing);
    assertPhase4SchemaValue("scenario-comparison.schema.json", comparison);
    assert.equal(comparison.status, row.expected_comparison_status);
    assert.deepEqual(comparison.reasons, row.expected_comparison_reasons);
  }
});

test("pack-owned tune priority cases independently exercise every ordered comparator key and zero gate", () => {
  assert.deepEqual(evaluationHost.sealRetrievalEvaluationTunePriorityFixture(PHASE4_TUNE_PRIORITY), PHASE4_TUNE_PRIORITY);
  assert.equal(PHASE4_TUNE_PRIORITY.contract_version,
    "gkos-retrieval-evaluation-tune-priority-fixture/1.0.0-draft.1");
  const { fixture_digest: fixtureDigest, ...fixtureMaterial } = PHASE4_TUNE_PRIORITY;
  assert.equal(fixtureDigest, retrieval.retrievalCanonicalDigest(fixtureMaterial));
  const expectedCaseIds = [
    "priority-01-ndcg", "priority-02-recall", "priority-03-mrr", "priority-04-changed-axis-count",
    "priority-05-top-k-sum", "priority-06-rrf-distance", "priority-07-disabled-mmr",
    "priority-08-lambda-distance", "priority-09-canonical-config", "priority-10-zero-gates",
    "priority-11-no-conforming",
  ];
  assert.deepEqual(PHASE4_TUNE_PRIORITY.cases.map((row) => row.case_id), expectedCaseIds);
  const expectedWinners = {
    "priority-01-ndcg": "higher-ndcg",
    "priority-02-recall": "higher-recall",
    "priority-03-mrr": "higher-mrr",
    "priority-04-changed-axis-count": "fewer-changes",
    "priority-05-top-k-sum": "smaller-top-k",
    "priority-06-rrf-distance": "nearer-rrf",
    "priority-07-disabled-mmr": "disabled-mmr",
    "priority-08-lambda-distance": "nearer-lambda",
    "priority-09-canonical-config": "rrf-one-hundred",
    "priority-10-zero-gates": "clean",
    "priority-11-no-conforming": null,
  };
  const coveredFailures = new Set();
  for (const row of PHASE4_TUNE_PRIORITY.cases) {
    const { case_digest: caseDigest, ...caseMaterial } = row;
    assert.equal(caseDigest, retrieval.retrievalCanonicalDigest(caseMaterial), row.case_id);
    assert.equal(row.expected_selected_candidate_id, expectedWinners[row.case_id], row.case_id);
    for (const candidate of row.candidates) {
      assert.deepEqual(candidate.zero_gate_failures, [...new Set(candidate.zero_gate_failures)].sort(), candidate.candidate_id);
      for (const failure of candidate.zero_gate_failures) coveredFailures.add(failure);
    }
  }
  assert.deepEqual([...coveredFailures].sort(), [
    "CITATION_COVERAGE", "CITATION_MISMATCH", "CONFIDENCE_MISMATCH", "POLICY_LEAK",
    "STALE_CITATION", "STALE_PROJECTION", "TEMPORAL_MISMATCH", "UNVERIFIED_PROJECTION",
  ]);

  const duplicate = clone(PHASE4_TUNE_PRIORITY);
  duplicate.cases[0].candidates[1].axes = clone(duplicate.cases[0].candidates[0].axes);
  duplicate.cases[0] = reseal(duplicate.cases[0], "case_digest");
  const duplicateMaterial = { contract_version: duplicate.contract_version, cases: duplicate.cases };
  duplicate.fixture_digest = retrieval.retrievalCanonicalDigest(duplicateMaterial);
  assert.throws(() => evaluationHost.sealRetrievalEvaluationTunePriorityFixture(duplicate), {
    message: "GKX_EVAL_TUNE_PRIORITY_DUPLICATE_AXES_INVALID",
  });

  const generated = spawnSync(process.execPath, [fileURLToPath(new URL(
    "../scripts/generate-retrieval-evaluation-tune-priority-fixture.mjs",
    import.meta.url,
  ))], { encoding: null, maxBuffer: 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr?.toString("utf8"));
  assert.deepEqual(generated.stdout, readFileSync(new URL(PHASE4_CONFORMANCE.fixture_files.tune_priority.file, PHASE4_PACK)));
});

test("pack-owned metric computation cases replay exact public results and reviewed corpus bytes", () => {
  assert.equal(PHASE4_METRIC_COMPUTATION.contract_version,
    "gkos-retrieval-evaluation-metric-computation-fixture/1.0.0-draft.1");
  const { fixture_digest: fixtureDigest, ...fixtureMaterial } = PHASE4_METRIC_COMPUTATION;
  assert.equal(fixtureDigest, retrieval.retrievalCanonicalDigest(fixtureMaterial));
  const caseIds = PHASE4_METRIC_COMPUTATION.cases.map((row) => row.case_id);
  assert.equal(new Set(caseIds).size, caseIds.length);
  assert.deepEqual(caseIds, [...caseIds].sort());
  const reviewedIds = PHASE4_CONFORMANCE.golden.expected_normalized.queries.map((query) => `reviewed-${query.id}`).sort();
  const syntheticIds = [
    "child-citation-mismatch", "child-citation-pass-lf", "child-citation-stale", "citation-extra-span",
    "citation-missing-span", "citation-overlap-production", "citation-reordered-spans", "citation-split-utf8",
    "citation-unrelated-span",
    "confidence-mismatch", "endpoint-no-source-fallback", "expected-source-unresolved", "file-only-relevance",
    "file-source-overlap-union", "first-physical-hit-no-backfill", "forbidden-endpoint-leak", "forbidden-source-leak",
    "forbidden-source-unresolved", "invalid-source-utf8", "malformed-audited-endpoint", "matched-span-split-utf8",
    "null-lineage-absence", "parent-child-citation-pass", "parent-citation-mismatch", "parent-citation-stale",
    "reviewed-temporal-future-absent",
    "source-only-relevance", "stale-projection", "temporal-mismatch", "temporal-sufficient", "unicode-citation-crlf",
    "unicode-citation-lf", "unverified-projection", "zero-hit-unverified",
  ].sort();
  assert.deepEqual(caseIds, [...syntheticIds, ...reviewedIds].sort());

  const ajv = phase4Ajv();
  const evaluationInputSchema = readJson(new URL("evaluation-input.schema.json", PHASE4_PACK));
  const validateInput = ajv.getSchema(evaluationInputSchema.$id);
  assert.ok(validateInput);
  let consumed = 0;
  for (const row of PHASE4_METRIC_COMPUTATION.cases) {
    consumed++;
    const { case_digest: caseDigest, ...caseMaterial } = row;
    assert.equal(caseDigest, retrieval.retrievalCanonicalDigest(caseMaterial), row.case_id);
    assert.deepEqual(row.coverage, [...new Set(row.coverage)].sort(), `${row.case_id} coverage`);
    assert.equal(validateInput(row.input), row.input_schema_valid, `${row.case_id}: ${JSON.stringify(validateInput.errors)}`);
    if (row.expected_status === "metrics") {
      assert.equal(row.expected_code, null, row.case_id);
      assert.deepEqual(retrieval.computeRetrievalEvaluationQueryMetrics(row.input), row.expected_metrics, row.case_id);
      assertPhase4SchemaValue("query-metrics.schema.json", row.expected_metrics);
    } else {
      assert.equal(row.expected_metrics, null, row.case_id);
      assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics(row.input), { message: row.expected_code });
    }
  }
  assert.equal(consumed, PHASE4_METRIC_COMPUTATION.cases.length);

  const coverage = new Set(PHASE4_METRIC_COMPUTATION.cases.flatMap((row) => row.coverage));
  for (const required of [
    "relevance-file", "relevance-source", "relevance-dedupe", "first-physical-rank", "source-dedupe",
    "citation-child", "citation-parent", "citation-pass", "citation-mismatch", "citation-stale", "citation-completeness",
    "citation-overlap-dedup", "citation-zero-span-overlap",
    "line-ending-lf", "line-ending-crlf", "utf8-boundary", "utf8-split-boundary", "endpoint-audit",
    "role-no-fallback", "policy-leak", "null-lineage", "temporal-match", "temporal-mismatch",
    "confidence-match", "confidence-mismatch", "projection-stale", "projection-unverified", "zero-hit",
    "canonical-corpus-bytes", "reviewed-24-query",
  ]) assert.equal(coverage.has(required), true, required);

  const split = PHASE4_METRIC_COMPUTATION.cases.find((row) => row.case_id === "matched-span-split-utf8");
  assert.ok(split);
  assert.deepEqual({ passed: split.expected_metrics.citation.passed, mismatch: split.expected_metrics.citation.mismatch }, { passed: 0, mismatch: 1 });
  const unicodeRows = PHASE4_METRIC_COMPUTATION.cases.filter((row) => row.parity_group === "unicode-line-ending-parity");
  assert.equal(unicodeRows.length, 2);
  for (const field of ["recall_at_k_micros", "mrr_micros", "ndcg_at_k_micros", "confidence_mismatch_count", "temporal_mismatch_count"]) {
    assert.equal(unicodeRows[0].expected_metrics[field], unicodeRows[1].expected_metrics[field], field);
  }
  assert.deepEqual(unicodeRows[0].expected_metrics.citation, unicodeRows[1].expected_metrics.citation);
  const overlap = PHASE4_METRIC_COMPUTATION.cases.find((row) => row.case_id === "citation-overlap-production");
  assert.ok(overlap);
  assert.deepEqual(overlap.input.result.hits.map((hit) => hit.citation.matched_spans.length), [1, 1, 1, 0]);
  assert.deepEqual({ checked: overlap.expected_metrics.citation.checked, passed: overlap.expected_metrics.citation.passed,
    mismatch: overlap.expected_metrics.citation.mismatch }, { checked: 4, passed: 4, mismatch: 0 });
  for (const id of ["citation-extra-span", "citation-missing-span", "citation-reordered-spans", "citation-unrelated-span"]) {
    const row = PHASE4_METRIC_COMPUTATION.cases.find((candidate) => candidate.case_id === id);
    assert.ok(row, id);
    assert.equal(row.expected_metrics.citation.mismatch, 1, id);
  }

  const corpusByVault = new Map(PHASE4_SOURCE_CORPUS.corpora.map((corpus) => [corpus.vault_fixture, corpus]));
  const reviewedRows = PHASE4_METRIC_COMPUTATION.cases.filter((row) => row.parity_group === "reviewed-24-query-set");
  assert.equal(reviewedRows.length, 24);
  for (const row of reviewedRows) {
    const query = PHASE4_CONFORMANCE.golden.expected_normalized.queries.find((candidate) => candidate.id === row.input.query.id);
    const corpus = corpusByVault.get(query?.vault_fixture);
    assert.ok(query && corpus, row.case_id);
    assert.deepEqual(row.input.query, query, row.case_id);
    assert.deepEqual(row.input.source_observations, corpus.source_files.map(({ source_id, source_path, source_digest, source_bytes_base64 }) =>
      ({ source_id, source_path, source_digest, source_bytes_base64 })), row.case_id);
    assert.equal(row.expected_metrics.recall_at_k_micros, 1_000_000, row.case_id);
    assert.equal(row.expected_metrics.ndcg_at_k_micros, 1_000_000, row.case_id);
    assert.equal(row.expected_metrics.policy.policy_leak_count, 0, row.case_id);
    assert.equal(row.input.result.hits.some((hit) => hit.chunk.source_id === "019b2d14-4230-7db7-87d4-7d81cfaec999"), false, row.case_id);
  }

  const presentFuture = PHASE4_METRIC_COMPUTATION.cases.find((row) => row.case_id === "reviewed-temporal-future-exclusion");
  const absentFuture = PHASE4_METRIC_COMPUTATION.cases.find((row) => row.case_id === "reviewed-temporal-future-absent");
  assert.ok(presentFuture && absentFuture);
  assert.notEqual(presentFuture.input.result.projection_digest, absentFuture.input.result.projection_digest);
  const publicView = (result) => ({
    contract_version: result.contract_version,
    query_digest: result.query_digest,
    projection_freshness: result.projection_freshness,
    hits: result.hits,
    confidence: result.confidence,
    temporal: result.temporal,
    applied_filters: result.applied_filters,
    eligible_result_count: result.eligible_result_count,
    stages: result.stages,
  });
  assert.deepEqual(publicView(presentFuture.input.result), publicView(absentFuture.input.result));
  assert.deepEqual(presentFuture.expected_metrics, absentFuture.expected_metrics);

  const generated = spawnSync(process.execPath, [fileURLToPath(new URL(
    "../scripts/generate-retrieval-evaluation-metric-fixture.mjs",
    import.meta.url,
  ))], { encoding: null, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr?.toString("utf8"));
  assert.deepEqual(generated.stdout, readFileSync(new URL(PHASE4_CONFORMANCE.fixture_files.metric_computation.file, PHASE4_PACK)));
});

test("reviewed bundle recomputes all 24 origins and the physical-absence temporal pair", () => {
  const environmentBundle = {
    environment_set: PHASE4_CONFORMANCE.valid_envelopes.environment_set,
    normalized_golden: PHASE4_CONFORMANCE.golden.expected_normalized,
    fixture_catalog: PHASE4_FIXTURE_CATALOG,
    source_corpus: PHASE4_SOURCE_CORPUS,
    fixed_provider_transcript: PHASE4_FIXED_PROVIDER,
    projection_manifests: PHASE4_CONFORMANCE.valid_envelopes.projection_manifests,
  };
  const input = {
    environment_bundle: environmentBundle,
    baseline: PHASE4_CONFORMANCE.valid_envelopes.baseline,
    metric_computation_fixture: PHASE4_METRIC_COMPUTATION,
  };
  assert.deepEqual(evaluationHost.sealRetrievalEvaluationReviewedBundle(PHASE4_REVIEWED_BUNDLE), PHASE4_REVIEWED_BUNDLE);
  assert.deepEqual(evaluationHost.sealRetrievalEvaluationExecutableReviewedBundle({
    reviewed_bundle: PHASE4_REVIEWED_BUNDLE,
    ...input,
  }), PHASE4_REVIEWED_BUNDLE);
  assert.equal(PHASE4_REVIEWED_BUNDLE.result_origins.length, 24);
  assert.deepEqual(PHASE4_REVIEWED_BUNDLE.result_origins.map((origin) => origin.query_id),
    PHASE4_CONFORMANCE.golden.expected_normalized.queries.map((query) => query.id));
  for (const origin of PHASE4_REVIEWED_BUNDLE.result_origins) {
    assert.equal(origin.manifest_projection_digest === origin.result_projection_digest, false, origin.query_id);
    assert.equal(origin.query_attempt_counters.authority_input_snapshot_count, 1, origin.query_id);
    assert.equal(origin.query_attempt_counters.metric_computation_count, 1, origin.query_id);
    assert.equal(origin.query_attempt_counters.vector_provider_call_count, 1, origin.query_id);
    assert.equal(origin.query_attempt_counters.rerank_provider_call_count, 1, origin.query_id);
  }
  assert.equal(PHASE4_REVIEWED_BUNDLE.temporal_absent_corpora.length, 1);
  assert.equal(PHASE4_REVIEWED_BUNDLE.temporal_noninterference_pairs.length, 1);
  const pair = PHASE4_REVIEWED_BUNDLE.temporal_noninterference_pairs[0];
  assert.equal(pair.present_metric_case_id, "reviewed-temporal-future-exclusion");
  assert.equal(pair.absent_metric_case_id, "reviewed-temporal-future-absent");

  const changedDigest = `sha256:${"a".repeat(64)}`;
  const executableEnvironment = evaluationHost.deriveRetrievalEvaluationExecutableEnvironmentBundle(environmentBundle);
  const absentCorpus = PHASE4_REVIEWED_BUNDLE.temporal_absent_corpora[0];
  const temporalDerivation = executableEnvironment.derivations.find((derivation) =>
    derivation.vault_fixture === absentCorpus.vault_fixture);
  assert.ok(temporalDerivation?.provider_scenario, absentCorpus.vault_fixture);
  const presentIndexCandidates = temporalDerivation.policy_candidate_chunks;
  const absentIndexCandidates = presentIndexCandidates.filter((candidate) =>
    candidate.chunk.source_id !== absentCorpus.removed_source_id);
  const presentIndexTemplates = temporalDerivation.provider_scenario.embedding_index_templates;
  const absentIndexTemplates = evaluationHost.deriveRetrievalEvaluationProviderIndexReceipts(
    absentIndexCandidates,
    presentIndexTemplates,
  );
  const itemCount = (templates) => templates.reduce((sum, template) => sum + template.item_count, 0);
  const receiptMaterial = (templates) => templates.map((template) => ({
    embedding_call_ordinal: template.embedding_call_ordinal,
    batch_offset: template.batch_offset,
    request_id: template.request_id,
    chunk_inputs: template.chunk_inputs,
    item_count: template.item_count,
  }));
  assert.equal(itemCount(presentIndexTemplates), 2, "present corpus indexes predecessor and future successor");
  assert.equal(itemCount(absentIndexTemplates), 1, "physical absence removes the future successor index item");
  assert.notDeepEqual(receiptMaterial(absentIndexTemplates), receiptMaterial(presentIndexTemplates),
    "physical absence changes the independently derived index receipt");
  assert.deepEqual(
    evaluationHost.verifyRetrievalEvaluationProviderIndexReceipts(absentIndexCandidates, absentIndexTemplates),
    absentIndexTemplates,
  );
  const verifyIndexReceiptMutation = (mutation) => {
    let candidates;
    let templates;
    if (mutation === "reverse_present_inputs") {
      candidates = presentIndexCandidates;
      templates = clone(presentIndexTemplates);
      assert.ok(templates.some((template) => template.chunk_inputs.length > 1));
      const target = templates.find((template) => template.chunk_inputs.length > 1);
      target.chunk_inputs.reverse();
      Object.assign(target, reseal(target, "template_digest"));
    } else {
      candidates = absentIndexCandidates;
      templates = clone(absentIndexTemplates);
      assert.equal(templates.length, 1);
      if (mutation === "replace_request_id") templates[0].request_id = changedDigest;
      else if (mutation === "omit_response") templates[0].responses = [];
      else assert.fail(`unknown absent index receipt mutation ${mutation}`);
      templates[0] = reseal(templates[0], "template_digest");
    }
    return evaluationHost.verifyRetrievalEvaluationProviderIndexReceipts(candidates, templates);
  };
  const reviewedMutation = (mutation) => {
    let bundle = clone(PHASE4_REVIEWED_BUNDLE);
    const mutateOrigin = (callback) => {
      callback(bundle.result_origins[0]);
      bundle.result_origins[0] = reseal(bundle.result_origins[0], "origin_digest");
      bundle = resealReviewedOriginSet(bundle);
    };
    if (mutation === "top_source_corpus_digest") {
      bundle.source_corpus_digest = changedDigest;
      return reseal(bundle, "reviewed_bundle_digest");
    }
    if (mutation === "origin_public_result_digest") mutateOrigin((origin) => { origin.public_result_digest = changedDigest; });
    else if (mutation === "origin_provider_scenario_digest") mutateOrigin((origin) => { origin.provider_scenario_digest = changedDigest; });
    else if (mutation === "origin_reranker_request_digest") mutateOrigin((origin) => { origin.reranker_request_digest = changedDigest; });
    else if (mutation === "origin_eval_schedule_digest") mutateOrigin((origin) => { origin.eval_schedule_digest = changedDigest; });
    else if (mutation === "origin_source_read_count") mutateOrigin((origin) => {
      origin.query_attempt_counters.source_read_count++;
      origin.query_attempt_counters = reseal(origin.query_attempt_counters, "counter_digest");
    });
    else if (mutation === "omit_origin") {
      bundle.result_origins.pop();
      bundle = resealReviewedOriginSet(bundle);
    } else if (mutation === "duplicate_origin") {
      bundle.result_origins[1] = clone(bundle.result_origins[0]);
      bundle = resealReviewedOriginSet(bundle);
    } else if (mutation === "reverse_origins") {
      bundle.result_origins.reverse();
      bundle = resealReviewedOriginSet(bundle);
    } else if (mutation === "pair_public_view_digest") {
      bundle.temporal_noninterference_pairs[0].public_view_digest = changedDigest;
      bundle.temporal_noninterference_pairs[0] = reseal(bundle.temporal_noninterference_pairs[0], "pair_digest");
      bundle = reseal(bundle, "reviewed_bundle_digest");
    } else assert.fail(`unknown reviewed mutation ${mutation}`);
    return bundle;
  };
  const metricFixtureMutation = (mutation) => {
    if (mutation === "replace_reviewed_result_with_forbidden_result") {
      const donor = PHASE4_METRIC_COMPUTATION.cases.find((candidate) => candidate.case_id === "forbidden-source-leak");
      return resealMetricFixture(PHASE4_METRIC_COMPUTATION, "reviewed-agent-note-authority", (target) => {
        target.input.result = clone(donor.input.result);
        target.input.result.query_digest = PHASE4_METRIC_COMPUTATION.cases
          .find((candidate) => candidate.case_id === "reviewed-agent-note-authority").input.result.query_digest;
      });
    }
    if (mutation === "replace_preboundary_result_with_successor_result") {
      const donor = PHASE4_METRIC_COMPUTATION.cases.find((candidate) => candidate.case_id === "reviewed-temporal-current-boundary");
      return resealMetricFixture(PHASE4_METRIC_COMPUTATION, "reviewed-temporal-future-exclusion", (target) => {
        target.input.result = clone(donor.input.result);
        target.input.result.query_digest = PHASE4_METRIC_COMPUTATION.cases
          .find((candidate) => candidate.case_id === "reviewed-temporal-future-exclusion").input.result.query_digest;
      });
    }
    if (mutation === "move_absent_source_to_forbidden") {
      return resealMetricFixture(PHASE4_METRIC_COMPUTATION, "reviewed-temporal-future-absent", (target) => {
        const sourceId = target.input.audit_oracle.authorized_source_ids[0];
        const sourcePath = target.input.audit_oracle.authorized_source_paths[0];
        target.input.audit_oracle.authorized_source_ids = [];
        target.input.audit_oracle.authorized_source_paths = [];
        target.input.audit_oracle.forbidden_source_ids = [sourceId];
        target.input.audit_oracle.forbidden_source_paths = [sourcePath];
        target.input.audit_oracle = reseal(target.input.audit_oracle, "oracle_digest");
      });
    }
    if (mutation === "add_absent_endpoint") {
      return resealMetricFixture(PHASE4_METRIC_COMPUTATION, "reviewed-temporal-future-absent", (target) => {
        target.input.audit_oracle.authorized_endpoint_ids.push("019b2d14-4230-7db7-87d4-7d81cfaec935");
        target.input.audit_oracle.authorized_endpoint_ids.sort();
        target.input.audit_oracle = reseal(target.input.audit_oracle, "oracle_digest");
      });
    }
    assert.fail(`unknown metric fixture mutation ${mutation}`);
  };
  for (const row of PHASE4_CONFORMANCE.reviewed_bundle_negative_matrix) {
    if (row.target === "absent_index_receipt") {
      assert.equal(row.stage, "host_receipt", row.case_id);
      assert.throws(() => verifyIndexReceiptMutation(row.mutation), { message: row.expected_code }, row.case_id);
      continue;
    }
    let candidateInput = { reviewed_bundle: PHASE4_REVIEWED_BUNDLE, ...input };
    if (row.target === "reviewed_bundle") candidateInput = { ...candidateInput, reviewed_bundle: reviewedMutation(row.mutation) };
    else if (row.target === "metric_fixture") candidateInput = {
      ...candidateInput,
      metric_computation_fixture: metricFixtureMutation(row.mutation),
    };
    else if (row.target === "baseline" && row.mutation === "selected_axes_rrf_30") candidateInput = {
      ...candidateInput,
      baseline: baselineWithSelectedRrf(input.baseline, 30),
    };
    else if (row.target === "baseline" && row.mutation === "reverse_grid_rrf") {
      const baseline = clone(input.baseline);
      baseline.tuning_grid.rrf_k.reverse();
      baseline.tuning_grid = reseal(baseline.tuning_grid, "tuning_grid_digest");
      baseline.tuning_grid_digest = baseline.tuning_grid.tuning_grid_digest;
      candidateInput = { ...candidateInput, baseline: reseal(baseline, "baseline_digest") };
    } else assert.fail(`unknown reviewed target ${row.target}:${row.mutation}`);
    if (row.stage === "shallow") {
      assert.throws(() => evaluationHost.sealRetrievalEvaluationReviewedBundle(candidateInput.reviewed_bundle),
        { message: row.expected_code }, row.case_id);
      continue;
    }
    if (row.target === "reviewed_bundle") {
      assert.deepEqual(evaluationHost.sealRetrievalEvaluationReviewedBundle(candidateInput.reviewed_bundle), candidateInput.reviewed_bundle, row.case_id);
    }
    assert.throws(() => evaluationHost.sealRetrievalEvaluationExecutableReviewedBundle(candidateInput),
      { message: row.expected_code }, row.case_id);
  }

  const generated = spawnSync(process.execPath, [fileURLToPath(new URL(
    "../scripts/generate-retrieval-evaluation-reviewed-bundle.mjs",
    import.meta.url,
  ))], { encoding: null, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr?.toString("utf8"));
  assert.deepEqual(generated.stdout, readFileSync(new URL(PHASE4_CONFORMANCE.fixture_files.reviewed_bundle.file, PHASE4_PACK)));
});

test("scenario precedence executes known conflict over unknown coverage through the Phase-2 coordinator", async (t) => {
  const row = PHASE4_SCENARIO_CONFORMANCE.precedence_matrix.find((item) => item.case_id === "known-conflict-over-unknown-coverage");
  assert.ok(row);
  const oldId = "018f0000-0000-7000-8000-000000000851";
  const newA = "018f0000-0000-7000-8000-000000000852";
  const newB = "018f0000-0000-7000-8000-000000000853";
  const unknownId = "018f0000-0000-7000-8000-000000000854";
  const note = (uid, title, createdAt, extra = "") =>
    `---\ngkx_version: "2.3"\nuid: "${uid}"\ntitle: "${title}"\ntype: "policy"\ncreated_at: "${createdAt}"\nepistemic_state: "reported"\nsensitivity: "public"\n${extra}---\n# ${title}\nNeedle ${title}.\n`;
  const files = [
    { relativePath: "old.md", extension: "md", content: note(oldId, "Old", "2026-07-01T00:00:00Z"), createdTime: Date.parse("2026-07-01T00:00:00Z") },
    { relativePath: "new-a.md", extension: "md", content: note(newA, "New A", "2026-08-01T00:00:00Z", `supersedes:\n  - "${oldId}"\n`), createdTime: Date.parse("2026-08-01T00:00:00Z") },
    { relativePath: "new-b.md", extension: "md", content: note(newB, "New B", "2026-09-01T00:00:00Z", `supersedes:\n  - "${oldId}"\n`), createdTime: Date.parse("2026-09-01T00:00:00Z") },
    { relativePath: "unknown.md", extension: "md", content: note(unknownId, "Unknown Coverage", "2026-06-01T00:00:00Z"), createdTime: Date.parse("2026-06-01T00:00:00Z") },
  ];
  const projected = retrievalHost.projectGkxRetrievalCorpus(files);
  assert.deepEqual(projected.rejections, []);
  const candidateChunks = projected.sources.flatMap((item) => retrievalHost.bindGkxRetrievalCandidateChunks(
    item.record_key,
    retrieval.chunkMarkdown(item.chunk_input),
  ));
  const unknownCandidate = projected.sources.find((item) => item.candidate_source.source_metadata.title === "Unknown Coverage").candidate_source;
  unknownCandidate.valid_from = null;
  unknownCandidate.validity_origin = "unknown";
  unknownCandidate.reason_codes = unknownCandidate.reason_codes.filter((code) => !code.startsWith("VALIDITY_FROM_"))
    .concat("VALIDITY_UNKNOWN").sort();
  const { candidate_digest: _oldDigest, ...unknownMaterial } = unknownCandidate;
  unknownCandidate.candidate_digest = retrieval.retrievalCanonicalDigest(unknownMaterial);
  for (const candidate of candidateChunks.filter((item) => item.record_key === unknownCandidate.record_key)) candidate.chunk.valid_from = null;

  const temporaryRoot = await mkdtemp(join(tmpdir(), "gkos-eval-precedence-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const generation = retrievalHost.buildGkxRetrievalGeneration({
    state_directory: join(temporaryRoot, "state"),
    vault_id: "evaluation-precedence-v1",
    source_snapshot_digest: retrieval.retrievalCanonicalDigest(files.map((file) => [file.relativePath, file.content])),
    configuration_digest: retrieval.retrievalCanonicalDigest({ configuration: "evaluation-precedence-v1" }),
    policy_digest: retrieval.retrievalCanonicalDigest({ policy: "evaluation-precedence-v1" }),
    lexical_backend: "sqlite_lexical_scan",
    candidate_sources: projected.sources.map((item) => item.candidate_source),
    candidate_declarations: projected.declarations,
    candidate_chunks: candidateChunks,
    embedding_eligible_candidate_chunk_keys: candidateChunks.map((item) => item.candidate_chunk_key),
  });
  const contents = new Map(files.map((file) => [file.relativePath, Buffer.from(file.content, "utf8")]));
  const counters = { source_reads: 0, vector_calls: 0, rerank_calls: 0 };
  const coordinator = new retrieval.RetrievalCoordinator(generation.database_path, {
    source_discoverability_policy: () => "allow",
    discoverability_policy: () => "allow",
    runtime_policy_digest: retrieval.retrievalCanonicalDigest({ policy: "evaluation-precedence-v1" }),
    lineage_view_freshness: "fresh",
    source_reader: async (path) => { counters.source_reads++; return contents.get(path); },
    vector_provider: {
      kind: "mcp", provider_id: "fixed-offline", model_id: "embedding-v1", dimensions: 2, timeout_ms: 100,
      async embed() { counters.vector_calls++; return [Float32Array.of(1, 0)]; },
    },
    rerank_provider: {
      kind: "mcp", provider_id: "fixed-offline", model_id: "reranker-v1", timeout_ms: 100,
      async rerank() { counters.rerank_calls++; return []; },
    },
  });
  try {
    await assert.rejects(coordinator.search({ query: "Needle", as_of: "2026-10-01T00:00Z" }),
      (error) => error instanceof Error && error.message === "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT");
  } finally {
    coordinator.close();
  }
  assert.deepEqual(counters, { source_reads: 0, vector_calls: 0, rerank_calls: 0 });
  assert.equal(unknownCandidate.valid_from, null, "mixed input contains explicit unknown coverage");
  const selected = PHASE4_SCENARIO_CONFORMANCE.outcomes.find((outcome) =>
    row.expected_outcome_reference.endsWith(`=${outcome.scenario_id}`));
  assert.ok(selected);
  assert.deepEqual(retrieval.sealRetrievalEvaluationScenarioOutcome(selected), selected);
  assert.equal(selected.kind, "authorized_view_conflict");
  assert.equal(selected.reason_code, "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT");
  assert.equal(selected.message, "Authorized retrieval view conflict.");
  assert.equal(selected.work_counters.authority_input_snapshot_count, 1);
  assert.deepEqual(Object.fromEntries(Object.entries(selected.work_counters).filter(([key]) => key !== "authority_input_snapshot_count")),
    Object.fromEntries(Object.keys(selected.work_counters).filter((key) => key !== "authority_input_snapshot_count").map((key) => [key, 0])));
});

test("observation reports keep bounded inert runtime and SQLite version labels", () => {
  const material = {
    contract_version: "gkos-retrieval-evaluation-observation/1.0.0-draft.1",
    evaluation_digest: retrieval.retrievalCanonicalDigest({ evaluation: "observation" }),
    fixed_sample_plan_digest: retrieval.retrievalCanonicalDigest({ sample_plan: "fixed-v1" }),
    environment: {
      runtime: "node",
      runtime_version: "24.18.0-vendor",
      os: "windows",
      arch: "x64",
      sqlite_version: "sqlite-v3_50-custom",
      lexical_backend: "sqlite_lexical_scan",
      fts5_available: false,
      runner_class: "local",
    },
    warmup_count: 1,
    sample_count: 3,
    query_latency_micros: { p50: 100, p95: 200, p99: 300 },
    index_time_micros: 400,
    update_time_micros: 500,
    chunks_reprocessed: 1,
    chunks_reused: 2,
  };
  const report = reseal(material, "observation_digest");
  assert.equal(retrieval.sealRetrievalEvaluationObservationReport(report).environment.sqlite_version, "sqlite-v3_50-custom");
  for (const row of PHASE4_CONFORMANCE.observation_version_matrix) {
    const value = decodeFixtureScalar(row);
    for (const field of ["runtime_version", "sqlite_version"]) {
      const candidate = reseal({ ...report, environment: { ...report.environment, [field]: value } }, "observation_digest");
      if (row.expected_valid) {
        assert.equal(retrieval.sealRetrievalEvaluationObservationReport(candidate).environment[field], value, `${row.case_id}:${field}`);
      } else {
        assert.throws(() => retrieval.sealRetrievalEvaluationObservationReport(candidate),
          { message: "GKX_EVAL_OBSERVATION_ENVIRONMENT_INVALID" }, `${row.case_id}:${field}`);
      }
    }
  }
  const fts5Unavailable = reseal({
    ...report,
    environment: { ...report.environment, lexical_backend: "sqlite_fts5", fts5_available: false },
  }, "observation_digest");
  const observationAjv = phase4Ajv();
  const observationSchema = readJson(new URL("observation-report.schema.json", PHASE4_PACK));
  const validateObservation = observationAjv.getSchema(observationSchema.$id);
  assert.ok(validateObservation);
  assert.equal(validateObservation(fts5Unavailable), false, "FTS5 structurally requires an available FTS5 capability");
  assert.throws(() => retrieval.sealRetrievalEvaluationObservationReport(fts5Unavailable),
    { message: "GKX_EVAL_OBSERVATION_ENVIRONMENT_INVALID" });
});

test("environment and metrics sets bind a complete ordered multi-vault partition", () => {
  let golden = normalizedGoldenForIds(["multi-vault-a", "multi-vault-b"], 5);
  golden.queries[1] = reseal({ ...golden.queries[1], vault_fixture: "evaluation-temporal-v1" }, "query_digest");
  golden = reseal(golden, "golden_digest");
  const environmentSet = environmentSetCoordinate(golden, "multi-vault");
  assert.equal(retrieval.sealRetrievalEvaluationEnvironmentSet(environmentSet, golden).members.length, 2);
  const rows = golden.queries.map((query) => queryMetricsRow(query.id, query.expected_top_k));
  const metricsSet = metricsSetCoordinate(golden, environmentSet, rows);
  assert.equal(retrieval.sealRetrievalEvaluationMetricsSet(metricsSet, environmentSet, golden).aggregate_metrics.query_count, 2);

  const reorderedMembers = clone(environmentSet);
  reorderedMembers.members.reverse();
  reorderedMembers.environment_set_digest = retrieval.retrievalCanonicalDigest(Object.fromEntries(
    Object.entries(reorderedMembers).filter(([key]) => key !== "environment_set_digest"),
  ));
  assert.throws(() => retrieval.sealRetrievalEvaluationEnvironmentSet(reorderedMembers, golden), /GKX_EVAL_ENVIRONMENT_SET_PARTITION_INVALID/u);
  const duplicatedPartition = clone(environmentSet);
  duplicatedPartition.members[1].query_partition = clone(duplicatedPartition.members[0].query_partition);
  duplicatedPartition.members[1].query_count = 1;
  duplicatedPartition.members[1] = reseal(duplicatedPartition.members[1], "member_digest");
  duplicatedPartition.environment_set_digest = retrieval.retrievalCanonicalDigest(Object.fromEntries(
    Object.entries(duplicatedPartition).filter(([key]) => key !== "environment_set_digest"),
  ));
  assert.throws(() => retrieval.sealRetrievalEvaluationEnvironmentSet(duplicatedPartition, golden), /GKX_EVAL_ENVIRONMENT_SET_QUERY_BINDING_INVALID/u);
  const reorderedQueries = clone(metricsSet);
  reorderedQueries.query_evaluations.reverse();
  reorderedQueries.query_metrics_set_digest = retrieval.retrievalCanonicalDigest({
    contract_version: "gkos-retrieval-evaluation-query-metrics-set/1.0.0-draft.1",
    environment_set_digest: environmentSet.environment_set_digest,
    query_count: 2,
    query_evaluations: reorderedQueries.query_evaluations.map((entry) => ({
      environment_digest: entry.environment_digest,
      golden_query_digest: entry.golden_query_digest,
      query_metrics_digest: entry.query_metrics.query_metrics_digest,
    })),
  });
  reorderedQueries.metrics_set_digest = retrieval.retrievalCanonicalDigest(Object.fromEntries(
    Object.entries(reorderedQueries).filter(([key]) => key !== "metrics_set_digest"),
  ));
  assert.throws(() => retrieval.sealRetrievalEvaluationMetricsSet(reorderedQueries, environmentSet, golden), /GKX_EVAL_METRICS_SET_QUERY_BINDING_INVALID/u);

  const component = "a".repeat(128);
  const longGolden = normalizedGoldenForIds(["long-environment"], 5);
  longGolden.queries[0] = reseal({ ...longGolden.queries[0], vault_fixture: component }, "query_digest");
  const sealedLongGolden = reseal(longGolden, "golden_digest");
  const longEnvironment = environmentCoordinate(sealedLongGolden, "long-environment", component);
  const transcriptDigest = retrieval.retrievalCanonicalDigest({ transcript: "long-environment" });
  longEnvironment.embedding_role = {
    state: "active", provider_scenario_id: component, provider_kind: "local_onnx", provider_id: "fixed", model_id: "embedding", dimensions: 2,
    fixed_provider_transcript_digest: transcriptDigest,
  };
  longEnvironment.reranker_role = {
    state: "active", provider_scenario_id: component, provider_kind: "local_onnx", provider_id: "fixed", model_id: "reranker",
    fixed_provider_transcript_digest: transcriptDigest,
  };
  longEnvironment.scenario_id = `${component}--sqlite-lexical-scan--vector-${component}--reranker-${component}`;
  const sealedLongEnvironment = reseal(longEnvironment, "environment_digest");
  assert.ok(Buffer.byteLength(sealedLongEnvironment.scenario_id, "utf8") > 128);
  assert.equal(retrieval.sealRetrievalEvaluationEnvironmentCoordinate(sealedLongEnvironment).scenario_id, sealedLongEnvironment.scenario_id);
  const oversizedScenario = reseal({ ...sealedLongEnvironment, scenario_id: "a".repeat(513) }, "environment_digest");
  assert.throws(() => retrieval.sealRetrievalEvaluationEnvironmentCoordinate(oversizedScenario), /GKX_EVAL_ENVIRONMENT_SCENARIO_INVALID/u);

  const opaqueIdentityCases = new Map();
  const identityAjv = phase4Ajv();
  const environmentIdentitySchema = readJson(new URL("environment.schema.json", PHASE4_PACK));
  const fixedProviderIdentitySchema = readJson(new URL("fixed-provider.schema.json", PHASE4_PACK));
  const environmentIdentity = identityAjv.getSchema(`${environmentIdentitySchema.$id}#/$defs/identity`);
  const fixedProviderIdentity = identityAjv.getSchema(`${fixedProviderIdentitySchema.$id}#/$defs/identity`);
  assert.ok(environmentIdentity && fixedProviderIdentity);
  for (const row of PHASE4_CONFORMANCE.opaque_identity_matrix) {
    const identity = decodeFixtureScalar(row);
    opaqueIdentityCases.set(row.case_id, identity);
    assert.equal(environmentIdentity(identity), row.schema_valid, `${row.case_id}:environment-schema`);
    assert.equal(fixedProviderIdentity(identity), row.schema_valid, `${row.case_id}:fixed-provider-schema`);
    assert.equal(retrieval.isValidRetrievalEvaluationOpaqueIdentity(identity), row.semantic_valid, `${row.case_id}:semantic`);
  }
  const unicodeEnvironment = clone(sealedLongEnvironment);
  unicodeEnvironment.embedding_role.provider_id = opaqueIdentityCases.get("url-looking-unicode");
  unicodeEnvironment.embedding_role.model_id = opaqueIdentityCases.get("astral-512-utf16");
  unicodeEnvironment.reranker_role.provider_id = opaqueIdentityCases.get("internal-spaces");
  unicodeEnvironment.reranker_role.model_id = "モデル/route:opaque";
  const sealedUnicodeEnvironment = reseal(unicodeEnvironment, "environment_digest");
  assert.equal(
    retrieval.sealRetrievalEvaluationEnvironmentCoordinate(sealedUnicodeEnvironment).embedding_role.provider_id,
    opaqueIdentityCases.get("url-looking-unicode"),
  );
});

test("fixed provider transcript seals compact schedules and exact occurrence requests", () => {
  const opaqueProvider = " https://provider.invalid/路径 model ";
  const astralModel = "😀".repeat(256);
  const opaqueTranscript = fixedProviderTranscriptFixture({
    providerId: opaqueProvider,
    embeddingModelId: astralModel,
    rerankerModelId: "reranker モデル/1",
  }).transcript;
  const sealedOpaqueTranscript = evaluationHost.sealRetrievalEvaluationFixedProviderTranscript(opaqueTranscript);
  assert.equal(sealedOpaqueTranscript.embedding_provider.provider_id, opaqueProvider);
  assert.equal(sealedOpaqueTranscript.embedding_provider.model_id, astralModel);
  const overlongIdentity = fixedProviderTranscriptFixture({ embeddingModelId: "😀".repeat(257) }).transcript;
  assert.throws(() => evaluationHost.sealRetrievalEvaluationFixedProviderTranscript(overlongIdentity), /GKX_EVAL_FIXED_EMBEDDING_PROVIDER_INVALID/u);

  const conditionalFixture = (row) => fixedProviderTranscriptFixture({
    lexicalBackend: row.lexical_backend,
    embeddingRole: row.embedding_role,
    rerankerRole: row.reranker_role,
    embeddingOutcome: row.embedding_outcome,
    rerankerOutcome: row.reranker_outcome,
  }).transcript;

  for (const row of PHASE4_CONFORMANCE.provider_semantic_matrix) {
    if (row.kind === "reranker_item_boundary") {
      if (row.expected_valid) {
        const fixture = fixedProviderTranscriptFixture({ rerankerItemCount: row.item_count });
        const sealed = evaluationHost.sealRetrievalEvaluationFixedProviderTranscript(fixture.transcript);
        const scenario = sealed.scenarios[0];
        assert.equal(scenario.tune_schedule.expected_provider_counters.vector_provider_call_count, 1, row.case_id);
        assert.equal(scenario.tune_schedule.expected_provider_counters.vector_provider_item_count, 1, row.case_id);
        assert.equal(scenario.tune_schedule.expected_provider_counters.rerank_provider_call_count, 0, row.case_id);
        assert.equal(scenario.tune_schedule.template_occurrences
          .find((entry) => entry.template_id === "embedding-index-main").occurrence_count, 1, row.case_id);
        const oracle = scenario.reranker_query_oracles[0];
        const request = {
          contract_version: "gkos-retrieval-evaluation-provider-request/1.0.0-draft.1",
          call_kind: "reranker_query",
          request_id: oracle.request_id,
          query_id: oracle.query_id,
          query_digest: oracle.query_digest,
          query_text: oracle.effective_query_text,
          ordered_inputs: fixture.orderedInputs,
        };
        const verified = evaluationHost.verifyRetrievalEvaluationFixedProviderOccurrenceRequest(sealed, {
          environment_scope_digest: scenario.environment_scope.environment_scope_digest,
          operation: "eval",
          evaluation_occurrence_ordinal: 1,
          request,
        });
        assert.equal(verified.provider_call_ordinal, 1, row.case_id);
        assert.equal(verified.responses.length, row.item_count, row.case_id);
        const substituted = clone(request);
        substituted.query_text = `${request.query_text} changed`;
        assert.throws(() => evaluationHost.verifyRetrievalEvaluationFixedProviderOccurrenceRequest(sealed, {
          environment_scope_digest: scenario.environment_scope.environment_scope_digest,
          operation: "eval",
          evaluation_occurrence_ordinal: 1,
          request: substituted,
        }), /GKX_EVAL_FIXED_PROVIDER_REQUEST_MISMATCH|GKX_EVAL_FIXED_PROVIDER_REQUEST_QUERY_INVALID/u, row.case_id);
      } else {
        const over = fixedProviderTranscriptFixture({ rerankerItemCount: 160 }).transcript;
        const schedule = over.scenarios[0].eval_schedule;
        schedule.occurrence_matrix[0][2] = row.item_count;
        schedule.occurrence_matrix_digest = retrieval.retrievalCanonicalDigest({
          contract_version: "gkos-retrieval-evaluation-provider-occurrence-matrix/1.0.0-draft.1",
          operation: schedule.operation,
          query_partition: schedule.query_partition,
          tuning_axes_digests: [schedule.evaluation_axes.tuning_axes_digest],
          embedding_query_template_digests: over.scenarios[0].embedding_query_templates.map((template) => template.template_digest),
          reranker_query_oracle_digests: over.scenarios[0].reranker_query_oracles.map((oracle) => oracle.template_digest),
          occurrence_matrix: schedule.occurrence_matrix,
        });
        over.scenarios[0].eval_schedule = reseal(schedule, "schedule_digest");
        over.scenarios[0] = reseal(over.scenarios[0], "scenario_digest");
        const overTranscript = reseal(over, "provider_fixture_digest");
        assert.throws(() => evaluationHost.sealRetrievalEvaluationFixedProviderTranscript(overTranscript),
          { message: row.expected_code }, row.case_id);
      }
      continue;
    }
    if (row.kind === "query_count_boundary") {
      const fixture = fixedProviderTranscriptFixture({ queryCount: row.query_count });
      if (row.expected_valid) {
        const scenario = evaluationHost.sealRetrievalEvaluationFixedProviderTranscript(fixture.transcript).scenarios[0];
        assert.equal(scenario.eval_schedule.query_count, row.query_count, row.case_id);
        assert.equal(scenario.tune_schedule !== null, row.expected_tune_applicable, row.case_id);
      } else {
        assert.throws(() => evaluationHost.sealRetrievalEvaluationFixedProviderTranscript(fixture.transcript),
          { message: row.expected_code }, row.case_id);
      }
      continue;
    }
    if (row.kind === "template_permutation") {
      const permuted = fixedProviderTranscriptFixture({ queryCount: row.query_count }).transcript;
      if (row.template_role === "embedding") permuted.scenarios[0].embedding_query_templates.reverse();
      else permuted.scenarios[0].reranker_query_oracles.reverse();
      permuted.scenarios[0] = reseal(permuted.scenarios[0], "scenario_digest");
      assert.throws(() => evaluationHost.sealRetrievalEvaluationFixedProviderTranscript(reseal(permuted, "provider_fixture_digest")),
        { message: row.expected_code }, row.case_id);
      continue;
    }
    if (row.kind === "all_excluded_tune") {
      const fixture = fixedProviderTranscriptFixture({ queryCount: row.query_count, maximumExpectedTopK: row.maximum_expected_top_k });
      const tune = evaluationHost.sealRetrievalEvaluationFixedProviderTranscript(fixture.transcript).scenarios[0].tune_schedule;
      assert.equal(tune.query_evaluation_count, row.expected_query_evaluation_count, row.case_id);
      assert.equal(tune.expected_provider_counters.vector_provider_call_count, row.expected_vector_provider_call_count, row.case_id);
      assert.equal(tune.expected_provider_counters.vector_provider_item_count, row.expected_vector_provider_item_count, row.case_id);
      continue;
    }
    if (row.kind === "provider_role_conditional") {
      const transcript = conditionalFixture(row);
      const sealed = evaluationHost.sealRetrievalEvaluationFixedProviderTranscript(transcript);
      assertPhase4SchemaValue("fixed-provider.schema.json", sealed);
      const scenario = sealed.scenarios[0];
      if ("expected_eval_vector_call_count" in row) {
        assert.equal(scenario.eval_schedule.expected_provider_counters.vector_provider_call_count,
          row.expected_eval_vector_call_count, row.case_id);
      }
      if ("expected_eval_rerank_call_count" in row) {
        assert.equal(scenario.eval_schedule.expected_provider_counters.rerank_provider_call_count,
          row.expected_eval_rerank_call_count, row.case_id);
      }
      if (row.expected_vector_stage) assert.deepEqual(scenario.embedding_query_templates[0].expected_vector_stage, row.expected_vector_stage, row.case_id);
      if (row.expected_reranker_stage) assert.deepEqual(scenario.reranker_query_oracles[0].expected_reranker_stage, row.expected_reranker_stage, row.case_id);
      continue;
    }
    if (row.kind === "provider_conditional_negative") {
      const baseRow = PHASE4_CONFORMANCE.provider_semantic_matrix.find((candidate) => candidate.case_id === row.base_case);
      assert.ok(baseRow, row.case_id);
      const transcript = conditionalFixture(baseRow);
      const scenario = transcript.scenarios[0];
      if (row.mutation === "embedding_failure_stage_active") {
        scenario.embedding_query_templates[0].expected_vector_stage = { state: "active", reason_codes: [] };
        scenario.embedding_query_templates[0] = reseal(scenario.embedding_query_templates[0], "template_digest");
      } else if (row.mutation === "embedding_failure_add_response") {
        scenario.embedding_query_templates[0].responses = clone(fixedProviderTranscriptFixture().transcript.scenarios[0].embedding_query_templates[0].responses);
        scenario.embedding_query_templates[0] = reseal(scenario.embedding_query_templates[0], "template_digest");
      } else if (row.mutation === "reranker_failure_clear_error") {
        scenario.reranker_query_oracles[0].error_code = null;
        scenario.reranker_query_oracles[0] = reseal(scenario.reranker_query_oracles[0], "template_digest");
      } else if (row.mutation === "disabled_embedding_add_template") {
        scenario.embedding_query_templates = clone(fixedProviderTranscriptFixture().transcript.scenarios[0].embedding_query_templates);
      } else if (row.mutation === "disabled_reranker_add_oracle") {
        scenario.reranker_query_oracles = clone(fixedProviderTranscriptFixture().transcript.scenarios[0].reranker_query_oracles);
      } else {
        assert.fail(`unknown provider conditional mutation: ${row.mutation}`);
      }
      transcript.scenarios[0] = reseal(scenario, "scenario_digest");
      const mutated = reseal(transcript, "provider_fixture_digest");
      assert.throws(() => evaluationHost.sealRetrievalEvaluationFixedProviderTranscript(mutated),
        { message: row.expected_code }, row.case_id);
      continue;
    }
    assert.fail(`unknown provider semantic row kind: ${row.kind}`);
  }

  const worst = fixedProviderTranscriptFixture({ queryCount: 30, maximumExpectedTopK: 5 });
  assert.equal(worst.transcript.scenarios[0].tune_schedule.query_evaluation_count, 27_000);
  assert.ok(Buffer.byteLength(JSON.stringify(worst.transcript), "utf8") <= 8 * 1024 * 1024);
  assert.ok(Buffer.byteLength(`${JSON.stringify(worst.transcript, null, 2)}\n`, "utf8") <= 8 * 1024 * 1024);
  assert.equal(evaluationHost.sealRetrievalEvaluationFixedProviderTranscript(worst.transcript).scenarios[0].tune_schedule.query_evaluation_count, 27_000);
});

test("query metrics use physical hit ranks and independently verify citations", () => {
  const sourceA = {
    source_id: "018f0000-0000-7000-8000-000000000301",
    source_path: "a.md",
    text: "# A\none two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen\n\n## A2\nnineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty thirtyone thirtytwo thirtythree thirtyfour thirtyfive thirtysix\n",
  };
  const sourceB = {
    source_id: "018f0000-0000-7000-8000-000000000302",
    source_path: "b.md",
    text: "# B\nrelevant target passage one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen\n",
  };
  const chunksA = retrieval.chunkMarkdown({ ...sourceA, metadata: { title: "A", sensitivity: "public", authoritative: true, tags: [] } }, { max_tokens: 16, overlap_tokens: 0 });
  const chunksB = retrieval.chunkMarkdown({ ...sourceB, metadata: { title: "B", sensitivity: "public", authoritative: true, tags: [] } }, { max_tokens: 16, overlap_tokens: 0 });
  const sourceBBytes = Buffer.from(sourceB.text, "utf8");
  const paddedSourceB = Buffer.concat([Buffer.from("ignored-prefix"), sourceBBytes, Buffer.from("ignored-suffix")]);
  const sourceBView = new Uint8Array(
    paddedSourceB.buffer,
    paddedSourceB.byteOffset + Buffer.byteLength("ignored-prefix"),
    sourceBBytes.length,
  );
  assert.deepEqual(
    evaluationHost.gkxRetrievalVerifiedCitation(chunksB[0], "target", sourceBView).matched_spans.map((span) => span.text),
    ["target"],
    "citation extraction snapshots exactly the supplied Uint8Array view",
  );
  const result = resultFor("target", [chunksA[0], chunksA[1], chunksB[0]], "duplicate-rank");
  const input = queryInputFor({
    queryText: "target",
    queryId: "duplicate-rank",
    result,
    sources: [sourceA, sourceB],
    expectedSourceIds: [sourceB.source_id],
  });
  assertPhase4SchemaValue("evaluation-input.schema.json", input);
  const metrics = retrieval.computeRetrievalEvaluationQueryMetrics(input);
  assert.deepEqual(metrics.relevant_source_ranks, [3]);
  assert.equal(metrics.returned_unique_source_count, 2);
  assert.equal(metrics.mrr_micros, 333_333);
  assert.equal(metrics.ndcg_at_k_micros, 500_000);
  assert.deepEqual(metrics.citation, { applicability: "required", checked: 3, passed: 3, mismatch: 0, stale: 0, correctness_micros: 1_000_000 });
  assert.equal(metrics.policy.policy_identity_field_count, 20);

  const citationMismatch = clone(input);
  citationMismatch.result.hits[0].citation.source_digest = `sha256:${"1".repeat(64)}`;
  const mismatchMetrics = retrieval.computeRetrievalEvaluationQueryMetrics(citationMismatch);
  assert.equal(mismatchMetrics.citation.mismatch, 1);
  assert.equal(mismatchMetrics.citation.stale, 0);

  const stale = clone(input);
  const staleDigest = `sha256:${"2".repeat(64)}`;
  stale.result.hits[0].chunk.source_digest = staleDigest;
  stale.result.hits[0].citation.source_digest = staleDigest;
  stale.result.hits[0].provenance.source_digest = staleDigest;
  stale.result.hits[0].provenance = reseal(stale.result.hits[0].provenance, "provenance_digest");
  const staleMetrics = retrieval.computeRetrievalEvaluationQueryMetrics(stale);
  assert.equal(staleMetrics.citation.mismatch, 0);
  assert.equal(staleMetrics.citation.stale, 1);
  assert.equal(staleMetrics.stale_citation_query_count, 1);

  const unverified = clone(input);
  unverified.result.projection_freshness = "unverified";
  unverified.result.confidence = {
    ...unverified.result.confidence,
    level: "low",
    low_confidence: true,
    reason_codes: ["PROJECTION_FRESHNESS_UNVERIFIED"],
  };
  const unverifiedMetrics = retrieval.computeRetrievalEvaluationQueryMetrics(unverified);
  assert.equal(unverifiedMetrics.unverified_projection_query_count, 1);
  assert.equal(unverifiedMetrics.stale_projection_query_count, 0);
  const forgedUnverified = clone(unverified);
  forgedUnverified.result.confidence = clone(input.result.confidence);
  assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics(forgedUnverified), /GKX_EVAL_PUBLIC_CONFIDENCE_RELATION_INVALID/u);

  const emptyUnverified = clone(input);
  const { query_digest: _oldQueryDigest, ...emptyQueryMaterial } = emptyUnverified.query;
  emptyQueryMaterial.as_of = "2026-01-01T00:00:00.000Z";
  emptyUnverified.query = sealQuery(emptyQueryMaterial);
  emptyUnverified.result = {
    ...emptyUnverified.result,
    query_digest: retrieval.retrievalCanonicalDigest({ as_of: emptyUnverified.query.as_of, query: emptyUnverified.query.text }),
    projection_freshness: "unverified",
    hits: [],
    confidence: {
      level: "insufficient",
      low_confidence: true,
      reason_codes: ["NO_ELIGIBLE_RESULTS", "PROJECTION_FRESHNESS_UNVERIFIED"],
      lexical_signal: null,
      semantic_signal: null,
      reranker_signal: null,
      coverage_signal: null,
    },
    temporal: { as_of: emptyUnverified.query.as_of, coverage: "not_evaluated", reason_codes: [] },
    eligible_result_count: 0,
    stages: {
      lexical: { kind: "sqlite_fts5", state: "skipped", reason_codes: ["NO_ELIGIBLE_RESULTS"] },
      vector: { kind: "none", state: "disabled", reason_codes: ["VECTOR_DISABLED"] },
      reranker: { kind: "none", state: "skipped", reason_codes: ["RERANKER_NOT_CONFIGURED"] },
    },
  };
  emptyUnverified.expected_temporal = { coverage: "not_evaluated", hits: [] };
  const emptyUnverifiedMetrics = retrieval.computeRetrievalEvaluationQueryMetrics(emptyUnverified);
  assert.equal(emptyUnverifiedMetrics.unverified_projection_query_count, 1);
  assert.equal(emptyUnverifiedMetrics.stale_projection_query_count, 0);
  assert.equal(emptyUnverifiedMetrics.returned_unique_source_count, 0);
  const emptyUnverifiedAggregate = retrieval.aggregateRetrievalEvaluationMetrics([emptyUnverifiedMetrics]);
  assert.equal(emptyUnverifiedAggregate.unverified_projection_query_count, 1);
  assert.equal(emptyUnverifiedAggregate.unverified_projection_rate_micros, 1_000_000);

  const badQuery = clone(input);
  badQuery.result.query_digest = `sha256:${"3".repeat(64)}`;
  assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics(badQuery), /GKX_EVAL_PUBLIC_RESULT_QUERY_DIGEST_MISMATCH/u);
  const badEligible = clone(input);
  badEligible.result.eligible_result_count = 2;
  assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics(badEligible), /GKX_EVAL_PUBLIC_RESULT_ELIGIBLE_COUNT_INVALID/u);

  const forgedConfidence = clone(input);
  forgedConfidence.result.confidence.level = "medium";
  assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics(forgedConfidence), /GKX_EVAL_PUBLIC_CONFIDENCE_RELATION_INVALID/u);
  const forgedStage = clone(input);
  forgedStage.result.stages.lexical = { kind: "sqlite_lexical_scan", state: "active", reason_codes: [] };
  assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics(forgedStage), /GKX_EVAL_PUBLIC_RESULT_STAGE_RELATION_INVALID/u);
});

test("parent citations and provenance are bound to the child relationship", () => {
  const source = {
    source_id: "018f0000-0000-7000-8000-000000000311",
    source_path: "parent.md",
    text: "# Parent\none two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen\n\n## Child\nnineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty thirtyone thirtytwo thirtythree thirtyfour thirtyfive thirtysix\n",
  };
  const chunks = retrieval.chunkMarkdown({ ...source, metadata: { title: "Parent", sensitivity: "public", authoritative: true, tags: [] } }, { max_tokens: 16, overlap_tokens: 0 });
  const parent = chunks[0];
  const child = chunks.find((chunk) => chunk.parent_chunk_id === parent.chunk_id);
  assert.ok(child);
  const parentContext = { chunk_id: parent.chunk_id, text: parent.text, citation: citationFor(parent), provenance: provenanceFor(parent) };
  const result = resultFor("child", [child], "parent-binding", parentContext);
  const input = queryInputFor({ queryText: "child", queryId: "parent-binding", result, sources: [source], expectedSourceIds: [source.source_id] });
  const parentMetrics = retrieval.computeRetrievalEvaluationQueryMetrics(input);
  assert.equal(parentMetrics.citation.passed, 2);
  assert.equal(parentMetrics.policy.policy_identity_field_count, 12);
  const unrelated = clone(input);
  unrelated.result.hits[0].chunk.parent_chunk_id = `sha256:${"4".repeat(64)}`;
  assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics(unrelated), /GKX_EVAL_PUBLIC_PARENT_BINDING_INVALID/u);
});

test("normalized evaluation input rejects aliases, forged semantics, and pre-seal accessors", () => {
  const x = RETRIEVAL_FIXTURE.executable_projection;
  const result = x.expected_result;
  const source = x.input_files.find((item) => item.relative_path === "new.md");
  const query = sealQuery({
    id: "fixture-cafe",
    text: "cafe",
    vault_fixture: "retrieval-basic-v1",
    expected_files: ["new.md"],
    expected_source_ids: [result.hits[0].chunk.source_id],
    expected_lineage_ids: [],
    forbidden_source_ids: [],
    forbidden_lineage_ids: [],
    expected_top_k: 5,
    expected_confidence: "high",
    as_of: "2026-08-01T00:00:00.000Z",
  });
  const oracle = sealOracle({
    contract_version: "gkos-retrieval-evaluation-query-view-audit-oracle/1.0.0-draft.1",
    authorized_source_ids: [result.hits[0].chunk.source_id],
    authorized_source_paths: ["new.md"],
    forbidden_source_ids: [],
    forbidden_source_paths: [],
    authorized_endpoint_ids: [...new Set([...result.hits[0].provenance.supersedes, ...result.hits[0].provenance.superseded_by])].sort(),
    forbidden_endpoint_ids: [],
    expected_public_result_projection_id: result.projection_id,
    expected_public_result_projection_digest: result.projection_digest,
  });
  const provenance = result.hits[0].provenance;
  const input = {
    query,
    result,
    source_observations: [{
      source_id: result.hits[0].chunk.source_id,
      source_path: "new.md",
      source_digest: result.hits[0].chunk.source_digest,
      source_bytes_base64: Buffer.from(source.content, "utf8").toString("base64"),
    }],
    audit_oracle: oracle,
    expected_temporal: { coverage: "sufficient", hits: [{
      source_id: provenance.source_id,
      temporal_state: provenance.temporal_state,
      valid_from: provenance.valid_from,
      valid_to: provenance.valid_to,
      supersedes: provenance.supersedes,
      superseded_by: provenance.superseded_by,
    }] },
  };
  assert.equal(retrieval.computeRetrievalEvaluationQueryMetrics(input).query_id, "fixture-cafe");
  const authoredWhitespace = clone(input);
  delete authoredWhitespace.query.query_digest;
  authoredWhitespace.query.text = "\u00a0  cafe  \u3000";
  authoredWhitespace.query = sealQuery(authoredWhitespace.query);
  assert.equal(retrieval.computeRetrievalEvaluationQueryMetrics(authoredWhitespace).query_id, "fixture-cafe");
  const rawDigestSubstitution = clone(authoredWhitespace);
  rawDigestSubstitution.result.query_digest = retrieval.retrievalCanonicalDigest({ as_of: authoredWhitespace.query.as_of, query: authoredWhitespace.query.text });
  assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics(rawDigestSubstitution), /GKX_EVAL_PUBLIC_RESULT_QUERY_DIGEST_MISMATCH/u);

  const impossibleAsOf = clone(query);
  impossibleAsOf.as_of = "2026-99-99T99:99:99.999Z";
  impossibleAsOf.query_digest = retrieval.retrievalCanonicalDigest(Object.fromEntries(Object.entries(impossibleAsOf).filter(([key]) => key !== "query_digest")));
  assert.throws(() => retrieval.sealNormalizedRetrievalEvaluationQuery(impossibleAsOf), /GKX_EVAL_AS_OF_INVALID/u);

  const badReasons = clone(input);
  badReasons.result.hits[0].provenance.reason_codes.push("SELF_FORGED_REASON");
  badReasons.result.hits[0].provenance.reason_codes.sort();
  badReasons.result.hits[0].provenance = reseal(badReasons.result.hits[0].provenance, "provenance_digest");
  assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics(badReasons), /GKX_EVAL_PUBLIC_PROVENANCE_REASONS_MISMATCH/u);

  const forbiddenExpected = clone(input);
  forbiddenExpected.audit_oracle.forbidden_source_ids = [result.hits[0].chunk.source_id];
  forbiddenExpected.audit_oracle.forbidden_source_paths = ["hidden.md", "new.md"].sort();
  forbiddenExpected.audit_oracle.authorized_source_ids = ["018f0000-0000-7000-8000-000000000201"];
  forbiddenExpected.audit_oracle.authorized_source_paths = [];
  forbiddenExpected.audit_oracle = reseal(forbiddenExpected.audit_oracle, "oracle_digest");
  assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics(forbiddenExpected), /GKX_EVAL_ORACLE_CATALOG_PARTITION_INCOMPLETE/u);

  let getterCalls = 0;
  const accessorArray = [];
  Object.defineProperty(accessorArray, "0", { enumerable: true, get() { getterCalls++; return input.source_observations[0]; } });
  accessorArray.length = 1;
  assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics({ ...input, source_observations: accessorArray }), /GKX_EVAL_SOURCE_OBSERVATION_INVALID/u);
  assert.equal(getterCalls, 0);
  let proxyCalls = 0;
  const proxyArray = new Proxy(input.source_observations, { get(target, key, receiver) { proxyCalls++; return Reflect.get(target, key, receiver); } });
  assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics({ ...input, source_observations: proxyArray }), /GKX_EVAL_SOURCE_OBSERVATION_COUNT_INVALID/u);
  assert.equal(proxyCalls, 0);

  for (const bytes of [
    Buffer.from([0x80]),
    Buffer.from([0xc0, 0xaf]),
    Buffer.from([0xed, 0xa0, 0x80]),
    Buffer.from([0xf4, 0x90, 0x80, 0x80]),
    Buffer.from([0xe2, 0x82]),
  ]) {
    const invalidUtf8 = clone(input);
    invalidUtf8.source_observations[0].source_digest = retrieval.retrievalSha256(bytes);
    invalidUtf8.source_observations[0].source_bytes_base64 = bytes.toString("base64");
    assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics(invalidUtf8), /GKX_EVAL_SOURCE_OBSERVATION_UTF8_INVALID/u);
  }

  const unicodeSource = {
    source_id: "018f0000-0000-7000-8000-000000000399",
    source_path: "unicode.md",
    text: "# Unicode\ncafé one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen\n",
  };
  const unicodeChunk = retrieval.chunkMarkdown({
    ...unicodeSource,
    metadata: { title: "Unicode", sensitivity: "public", authoritative: true, tags: [] },
  }, { max_tokens: 64, overlap_tokens: 0 })[0];
  const unicodeResult = resultFor("café", [unicodeChunk], "unicode-boundary");
  const splitBoundary = queryInputFor({
    queryText: "café", queryId: "unicode-boundary", result: unicodeResult, sources: [unicodeSource], expectedSourceIds: [unicodeSource.source_id],
  });
  const scalarStart = Buffer.from(unicodeSource.text, "utf8").indexOf(Buffer.from("é", "utf8"));
  assert.ok(scalarStart >= unicodeChunk.start_byte && scalarStart + 2 <= unicodeChunk.end_byte);
  splitBoundary.result.hits[0].citation.matched_spans = [{ start_byte: scalarStart + 1, end_byte: scalarStart + 2, text: "�" }];
  assert.equal(retrieval.computeRetrievalEvaluationQueryMetrics(splitBoundary).citation.mismatch, 1);
});

test("tune selection exhaustively binds the eligible 900-row grid and exact work counts", () => {
  const input = tuneInputFromBaseline(PHASE4_CONFORMANCE.valid_envelopes.baseline);
  const selected = evaluationHost.selectRetrievalEvaluationTuneCandidate(input);
  assertPhase4SchemaValue("tune-selection.schema.json", selected);
  assert.equal(selected.evaluated_candidate_count, 900);
  assert.equal(selected.excluded_candidate_count, 0);
  assert.equal(selected.query_count, 24);
  assert.equal(selected.maximum_expected_top_k, 5);
  assert.equal(selected.query_evaluation_count, 21_600);
  assert.deepEqual(selected.selected_candidate.axes,
    PHASE4_CONFORMANCE.tune_matrix.find((row) => row.case_id === "shipped-24-query-grid").expected_selected_axes);

  assert.throws(() => evaluationHost.selectRetrievalEvaluationTuneCandidate({ ...input, candidates: input.candidates.slice(0, -1) }), /GKX_EVAL_TUNE_CANDIDATE_COUNT_INVALID/u);
  const maxTen = tuneInput(10);
  assert.equal(evaluationHost.selectRetrievalEvaluationTuneCandidate(maxTen).excluded_candidate_count, 324);
  const substituted = clone(maxTen);
  const excluded = clone(input.candidates.find((candidate) => candidate.axes.semantic_top_k === 5 && candidate.axes.lexical_top_k === 5));
  excluded.candidate_config_digest = retrieval.retrievalCanonicalDigest({
    base_configuration_digest: maxTen.baseline.base_configuration_digest,
    candidate_config: evaluationHost.retrievalEvaluationCandidateConfigMaterial(excluded.axes),
  });
  excluded.metrics_set = maxTen.baseline.metrics_set;
  excluded.candidate_evaluation_digest = retrieval.retrievalCanonicalDigest(evaluationCoordinateMaterial({
    environmentSet: maxTen.baseline.environment_set,
    golden: maxTen.baseline.normalized_golden,
    baseConfiguration: maxTen.baseline.base_configuration,
    tuningGrid: maxTen.baseline.tuning_grid,
    axes: excluded.axes,
    candidateConfigDigest: excluded.candidate_config_digest,
    metricsSet: excluded.metrics_set,
    budget: maxTen.baseline.relative_ndcg_budget,
  }));
  substituted.candidates[0] = excluded;
  assert.throws(() => evaluationHost.selectRetrievalEvaluationTuneCandidate(substituted), /GKX_EVAL_TUNE_CANDIDATE_SET_INCOMPLETE/u);
  const wrongGrid = clone(input);
  wrongGrid.baseline.tuning_grid.tuning_grid_digest = retrieval.retrievalCanonicalDigest({ grid: "forged" });
  assert.throws(() => evaluationHost.selectRetrievalEvaluationTuneCandidate(wrongGrid), /GKX_EVAL_TUNING_GRID_MISMATCH/u);

  const maxEighty = evaluationHost.selectRetrievalEvaluationTuneCandidate(tuneInput(80));
  assert.equal(maxEighty.evaluated_candidate_count, 36);
  assert.equal(maxEighty.excluded_candidate_count, 864);
  const maxHundred = evaluationHost.selectRetrievalEvaluationTuneCandidate(tuneInput(100));
  assert.equal(maxHundred.evaluated_candidate_count, 0);
  assert.equal(maxHundred.excluded_candidate_count, 900);
  assert.equal(maxHundred.query_evaluation_count, 0);
  assert.equal(maxHundred.selected_candidate, null);
  const fixtureResults = new Map([
    ["shipped-24-query-grid", selected],
    ["max-top-k-80", maxEighty],
    ["max-top-k-100", maxHundred],
  ]);
  for (const row of PHASE4_CONFORMANCE.tune_matrix) {
    const observed = fixtureResults.get(row.case_id);
    assert.ok(observed, row.case_id);
    assert.equal(observed.query_count, row.query_count);
    assert.equal(observed.maximum_expected_top_k, row.maximum_expected_top_k);
    assert.equal(observed.evaluated_candidate_count, row.expected_evaluated_candidate_count);
    assert.equal(observed.excluded_candidate_count, row.expected_excluded_candidate_count);
    assert.equal(observed.query_evaluation_count, row.expected_query_evaluation_count);
    if ("expected_conforming_candidate_count" in row) assert.equal(observed.conforming_candidate_count, row.expected_conforming_candidate_count);
    if ("expected_candidate_evaluation_set_digest" in row) assert.equal(observed.candidate_evaluation_set_digest, row.expected_candidate_evaluation_set_digest);
    if ("expected_selected_axes" in row) assert.deepEqual(observed.selected_candidate?.axes, row.expected_selected_axes);
    if ("expected_selected_candidate_config_digest" in row) assert.equal(observed.selected_candidate?.candidate_config_digest, row.expected_selected_candidate_config_digest);
    if ("expected_selected_candidate_evaluation_digest" in row) assert.equal(observed.selected_candidate?.candidate_evaluation_digest, row.expected_selected_candidate_evaluation_digest);
    if ("expected_tune_selection_digest" in row) assert.equal(observed.tune_selection_digest, row.expected_tune_selection_digest);
  }
  const nondefaultBudget = tuneInput();
  nondefaultBudget.baseline = baselineEnvelope({
    environmentSet: nondefaultBudget.baseline.environment_set,
    golden: nondefaultBudget.baseline.normalized_golden,
    baseConfiguration: nondefaultBudget.baseline.base_configuration,
    tuningGrid: nondefaultBudget.baseline.tuning_grid,
    axes: nondefaultBudget.baseline.selected_axes,
    metricsSet: nondefaultBudget.baseline.metrics_set,
    budget: { numerator: 1, denominator: 50 },
  });
  nondefaultBudget.candidates = [];
  assert.throws(() => evaluationHost.selectRetrievalEvaluationTuneCandidate(nondefaultBudget), /GKX_EVAL_TUNE_BASELINE_NEEDS_HUMAN/u);

  const forgedAggregate = clone(input);
  forgedAggregate.candidates[1].metrics_set.aggregate_metrics = aggregateMetrics(24, 999_999);
  assert.throws(() => evaluationHost.selectRetrievalEvaluationTuneCandidate(forgedAggregate), /GKX_EVAL_METRICS_SET_AGGREGATE_MISMATCH/u);

  let getterCalls = 0;
  const accessorCandidate = { ...input.candidates[0] };
  Object.defineProperty(accessorCandidate, "metrics_set", { enumerable: true, get() { getterCalls++; return input.candidates[0].metrics_set; } });
  assert.throws(() => evaluationHost.selectRetrievalEvaluationTuneCandidate({ ...input, candidates: [accessorCandidate, ...input.candidates.slice(1)] }), /GKX_EVAL_TUNE_CANDIDATE_INVALID/u);
  assert.equal(getterCalls, 0);
  const sparseCandidates = [];
  sparseCandidates.length = 1_000_000;
  assert.throws(() => evaluationHost.selectRetrievalEvaluationTuneCandidate({ ...tuneInput(100), candidates: sparseCandidates }), /GKX_EVAL_TUNE_CANDIDATE_COUNT_INVALID/u);

  const forgedGolden = clone(input);
  forgedGolden.baseline.normalized_golden.queries = forgedGolden.baseline.normalized_golden.queries
    .map((query) => reseal({ ...query, expected_top_k: 1 }, "query_digest"));
  forgedGolden.baseline.normalized_golden = reseal(forgedGolden.baseline.normalized_golden, "golden_digest");
  assert.throws(() => evaluationHost.selectRetrievalEvaluationTuneCandidate(forgedGolden), /GKX_EVAL_ENVIRONMENT_SET_COORDINATE_INVALID/u);
  const nonMaximumBinding = clone(input);
  nonMaximumBinding.baseline.metrics_set.query_evaluations[0].query_metrics.expected_top_k = 4;
  nonMaximumBinding.baseline.metrics_set.query_evaluations[0].query_metrics = reseal(
    nonMaximumBinding.baseline.metrics_set.query_evaluations[0].query_metrics,
    "query_metrics_digest",
  );
  assert.throws(() => evaluationHost.selectRetrievalEvaluationTuneCandidate(nonMaximumBinding), /GKX_EVAL_METRICS_SET_QUERY_BINDING_INVALID/u);
  const forgedCount = clone(input);
  forgedCount.baseline.normalized_golden.queries.pop();
  forgedCount.baseline.normalized_golden = reseal(forgedCount.baseline.normalized_golden, "golden_digest");
  assert.throws(() => evaluationHost.selectRetrievalEvaluationTuneCandidate(forgedCount), /GKX_EVAL_TUNE_QUERY_METRICS_COUNT_INVALID/u);
});

test("metric envelopes bind compact count relations and bounded identifiers", () => {
  const validInput = tuneInput().baseline.metrics_set.aggregate_metrics;
  assert.equal(retrieval.sealRetrievalEvaluationAggregateMetrics(validInput).query_count, 24);
  const badAggregate = reseal({ ...validInput, temporal_mismatch_count: 25 }, "aggregate_metrics_digest");
  assert.throws(() => retrieval.sealRetrievalEvaluationAggregateMetrics(badAggregate), /GKX_EVAL_AGGREGATE_QUERY_FAILURE_COUNT_INVALID/u);

  const queryMaterial = {
    contract_version: "gkos-retrieval-evaluation-query-metrics/1.0.0-draft.1",
    query_id: "bounded-query",
    expected_top_k: 1,
    relevant_source_count: 1,
    returned_unique_source_count: 1,
    relevant_returned_source_count: 1,
    relevant_source_ranks: [1],
    first_relevant_rank: 1,
    recall_at_k_micros: 1_000_000,
    mrr_micros: 1_000_000,
    ndcg_at_k_micros: 1_000_000,
    citation: { applicability: "required", checked: 1, passed: 1, mismatch: 0, stale: 0, correctness_micros: 1_000_000 },
    policy: { policy_identity_field_count: 8, policy_leak_count: 0, policy_leak_rate_micros: 0 },
    confidence_mismatch_count: 0,
    temporal_mismatch_count: 0,
    stale_citation_query_count: 0,
    stale_projection_query_count: 0,
    unverified_projection_query_count: 0,
  };
  const queryMetrics = reseal(queryMaterial, "query_metrics_digest");
  assert.equal(retrieval.sealRetrievalEvaluationQueryMetrics(queryMetrics).query_id, "bounded-query");
  const noReturned = reseal({ ...queryMetrics, returned_unique_source_count: 0 }, "query_metrics_digest");
  assert.throws(() => retrieval.sealRetrievalEvaluationQueryMetrics(noReturned), /GKX_EVAL_QUERY_METRICS_RELATION_INVALID/u);
  const zeroHit = zeroHitQueryMetricsRow("zero-hit-query", 1);
  assert.equal(retrieval.sealRetrievalEvaluationQueryMetrics(zeroHit).citation.correctness_micros, null);
  assert.equal(retrieval.aggregateRetrievalEvaluationMetrics([zeroHit]).citation.checked, 0);
  const forgedCitation = clone(queryMetrics);
  forgedCitation.citation.correctness_micros = 0;
  const resealedCitation = reseal(forgedCitation, "query_metrics_digest");
  assert.throws(() => retrieval.sealRetrievalEvaluationQueryMetrics(resealedCitation), /GKX_EVAL_CITATION_CORRECTNESS_MISMATCH/u);
  const overlong = reseal({ ...queryMetrics, query_id: "a".repeat(129) }, "query_metrics_digest");
  assert.throws(() => retrieval.sealRetrievalEvaluationQueryMetrics(overlong), /GKX_EVAL_QUERY_METRICS_COORDINATE_INVALID/u);
  const staleRow = (id, occurrences) => {
    const row = queryMetricsRow(id, 5);
    row.citation = {
      applicability: "required", checked: occurrences, passed: 0, mismatch: 0, stale: occurrences, correctness_micros: 0,
    };
    row.stale_citation_query_count = 1;
    return reseal(row, "query_metrics_digest");
  };
  const oneStaleQuery = retrieval.aggregateRetrievalEvaluationMetrics([staleRow("stale-a", 2), queryMetricsRow("clean-b", 5)]);
  const twoStaleQueries = retrieval.aggregateRetrievalEvaluationMetrics([staleRow("stale-a", 1), staleRow("stale-b", 1)]);
  assert.equal(oneStaleQuery.citation.stale, 2);
  assert.equal(oneStaleQuery.stale_citation_query_count, 1);
  assert.equal(oneStaleQuery.stale_citation_query_rate_micros, 500_000);
  assert.equal(twoStaleQueries.citation.stale, 2);
  assert.equal(twoStaleQueries.stale_citation_query_count, 2);
  assert.equal(twoStaleQueries.stale_citation_query_rate_micros, 1_000_000);
});

test("baseline comparison recomputes query sets and applies the exact two-percent inequality", () => {
  const ids = Array.from({ length: 50 }, (_, index) => `compare-query-${String(index + 1).padStart(2, "0")}`);
  const baselineRows = ids.map((id) => queryMetricsRow(id, 5));
  const boundaryRows = ids.map((id, index) => queryMetricsRow(id, 5, index < 49));
  const regressionRows = ids.map((id, index) => queryMetricsRow(id, 5, index < 48));
  const golden = normalizedGoldenForIds(ids, 5);
  const environmentSet = environmentSetCoordinate(golden, "comparison-v1");
  const base = baseConfigurationCoordinate("comparison-v1");
  const grid = clone(evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID_COORDINATE);
  const axes = tuningAxesCoordinate({ rrf_k: 5, mmr: false, mmr_lambda_micros: null, semantic_top_k: 5, lexical_top_k: 5 });
  const comparisonInput = (currentRows, baselineRowsInput = baselineRows) => {
    const baselineMetrics = metricsSetCoordinate(golden, environmentSet, baselineRowsInput);
    return {
      current_environment_set: environmentSet,
      current_base_configuration: base,
      current_tuning_grid: grid,
      current_tuning_axes: axes,
      current_golden: golden,
      current_metrics_set: metricsSetCoordinate(golden, environmentSet, currentRows),
      current_relative_ndcg_budget: { numerator: 2, denominator: 100 },
      baseline: baselineEnvelope({
        environmentSet,
        golden,
        baseConfiguration: base,
        tuningGrid: grid,
        axes,
        metricsSet: baselineMetrics,
      }),
    };
  };
  const boundary = retrieval.compareRetrievalEvaluationBaseline(comparisonInput(boundaryRows));
  assertPhase4SchemaValue("comparison.schema.json", boundary);
  assert.equal(boundary.current_ndcg_at_k_micros, 980_000);
  assert.equal(boundary.status, "pass");
  const regression = retrieval.compareRetrievalEvaluationBaseline(comparisonInput(regressionRows));
  assert.equal(regression.status, "regression");
  const zeroRows = ids.map((id) => queryMetricsRow(id, 5, false));
  const zeroBaseline = retrieval.compareRetrievalEvaluationBaseline(comparisonInput(zeroRows, zeroRows));
  assert.equal(zeroBaseline.status, "pass");
  const zeroHitRows = baselineRows.map((row, index) => index === 0 ? zeroHitQueryMetricsRow(row.query_id, 5) : row);
  const zeroHitComparison = retrieval.compareRetrievalEvaluationBaseline(comparisonInput(zeroHitRows));
  assert.equal(zeroHitComparison.status, "pass");
  assert.equal(zeroHitComparison.reasons.includes("CITATION_COVERAGE"), false);
  const twoZeroHitRows = baselineRows.map((row, index) => index < 2 ? zeroHitQueryMetricsRow(row.query_id, 5) : row);
  const twoZeroHitComparison = retrieval.compareRetrievalEvaluationBaseline(comparisonInput(twoZeroHitRows));
  assert.equal(twoZeroHitComparison.status, "regression");
  assert.ok(twoZeroHitComparison.reasons.includes("NDCG_RELATIVE_REGRESSION"));
  const unverifiedRows = baselineRows.map((row, index) => index === 0
    ? reseal({ ...row, unverified_projection_query_count: 1 }, "query_metrics_digest")
    : row);
  const unverifiedComparison = retrieval.compareRetrievalEvaluationBaseline(comparisonInput(unverifiedRows));
  assert.equal(unverifiedComparison.status, "regression");
  assert.ok(unverifiedComparison.reasons.includes("UNVERIFIED_PROJECTION"));
  const changed = comparisonInput(boundaryRows);
  changed.current_environment_set = environmentSetCoordinate(golden, "changed-comparison");
  changed.current_metrics_set = metricsSetCoordinate(golden, changed.current_environment_set, boundaryRows);
  const environmentChange = retrieval.compareRetrievalEvaluationBaseline(changed);
  assert.equal(environmentChange.status, "needs_human");
  const equivalentBudget = comparisonInput(boundaryRows);
  equivalentBudget.current_relative_ndcg_budget = { numerator: 1, denominator: 50 };
  assert.equal(retrieval.compareRetrievalEvaluationBaseline(equivalentBudget).status, "needs_human");
  const nondefaultBaseline = comparisonInput(boundaryRows);
  nondefaultBaseline.baseline = baselineEnvelope({
    environmentSet,
    golden,
    baseConfiguration: base,
    tuningGrid: grid,
    axes,
    metricsSet: nondefaultBaseline.baseline.metrics_set,
    budget: { numerator: 1, denominator: 50 },
  });
  assert.equal(retrieval.compareRetrievalEvaluationBaseline(nondefaultBaseline).status, "needs_human");
  const tamperedBaseline = clone(comparisonInput(boundaryRows));
  tamperedBaseline.baseline.query_count++;
  tamperedBaseline.baseline.baseline_digest = retrieval.retrievalCanonicalDigest(
    Object.fromEntries(Object.entries(tamperedBaseline.baseline).filter(([key]) => key !== "baseline_digest")),
  );
  assert.throws(() => retrieval.compareRetrievalEvaluationBaseline(tamperedBaseline), /GKX_EVAL_BASELINE_REPEATED_COORDINATE_MISMATCH/u);
  const forged = comparisonInput(boundaryRows);
  forged.current_metrics_set.aggregate_metrics = forged.baseline.metrics_set.aggregate_metrics;
  assert.throws(() => retrieval.compareRetrievalEvaluationBaseline(forged), /GKX_EVAL_METRICS_SET_AGGREGATE_MISMATCH/u);

  const fixtureResults = new Map([
    ["exact-two-percent-boundary", { result: boundary, currentRows: boundaryRows, baselineRows }],
    ["over-budget", { result: regression, currentRows: regressionRows, baselineRows }],
    ["zero-baseline", { result: zeroBaseline, currentRows: zeroRows, baselineRows: zeroRows }],
    ["environment-change", { result: environmentChange, currentRows: boundaryRows, baselineRows }],
    ["zero-hit-current", { result: zeroHitComparison, currentRows: zeroHitRows, baselineRows }],
  ]);
  for (const row of PHASE4_CONFORMANCE.comparison_matrix) {
    const observed = fixtureResults.get(row.case_id);
    assert.ok(observed, row.case_id);
    assert.equal(row.query_count, observed.currentRows.length);
    assert.equal(row.baseline_perfect_query_count, observed.baselineRows.filter((item) => item.ndcg_at_k_micros === 1_000_000).length);
    assert.equal(row.current_perfect_query_count, observed.currentRows.filter((item) => item.ndcg_at_k_micros === 1_000_000).length);
    assert.equal(row.current_zero_hit_query_count ?? 0, observed.currentRows.filter((item) => item.returned_unique_source_count === 0).length);
    assert.equal(observed.result.current_ndcg_at_k_micros, row.expected_current_ndcg_at_k_micros);
    assert.equal(observed.result.status, row.expected_status);
    if (row.expected_reason) assert.ok(observed.result.reasons.includes(row.expected_reason));
  }
});

test("scenario outcomes seal all branches, honest counters, and kind regressions", () => {
  const ordinary = scenarioOutcome();
  assert.equal(retrieval.sealRetrievalEvaluationScenarioOutcome(ordinary).kind, "result");
  const sufficient = scenarioOutcome({
    scenario_id: "sufficient-result",
    coverage: "sufficient",
    ordered_hit_projections: [{
      source_id: "018f0000-0000-7000-8000-000000000301",
      temporal_state: "current",
      valid_from: "2026-01-01T00:00:00.000Z",
      valid_to: null,
      supersedes: [],
      superseded_by: [],
    }],
  });
  assert.equal(retrieval.sealRetrievalEvaluationScenarioOutcome(sufficient).coverage, "sufficient");
  const unknownSufficient = scenarioOutcome({ ...sufficient, ordered_hit_projections: ordinary.ordered_hit_projections });
  assert.throws(() => retrieval.sealRetrievalEvaluationScenarioOutcome(unknownSufficient), /GKX_EVAL_SCENARIO_RESULT_RELATION_INVALID/u);

  const insufficient = scenarioOutcome({
    scenario_id: "insufficient",
    kind: "insufficient",
    coverage: "insufficient",
    confidence: "insufficient",
    reason_code: "TEMPORAL_COVERAGE_INSUFFICIENT",
    ordered_hit_projections: [],
    citation_applicability: "not_applicable",
    work_counters: { ...ordinary.work_counters, source_read_count: 0, retrieval_sql_stage_count: 0, ranking_call_count: 0, confidence_call_count: 0, citation_verification_count: 0, metric_computation_count: 0 },
  });
  assert.equal(retrieval.sealRetrievalEvaluationScenarioOutcome(insufficient).kind, "insufficient");
  const conflict = scenarioOutcome({
    scenario_id: "conflict",
    kind: "authorized_view_conflict",
    public_result_digest: null,
    coverage: null,
    confidence: null,
    reason_code: "RETRIEVAL_AUTHORIZED_VIEW_CONFLICT",
    message: "Authorized retrieval view conflict.",
    ordered_hit_projections: [],
    citation_applicability: "not_applicable",
    work_counters: { ...insufficient.work_counters },
    effects: { public_result_emitted: false, output_artifact_written: false, state_mutated: false },
  });
  assert.equal(retrieval.sealRetrievalEvaluationScenarioOutcome(conflict).kind, "authorized_view_conflict");
  const operational = scenarioOutcome({
    scenario_id: "operational",
    kind: "operational_exclusion",
    public_result_digest: null,
    coverage: null,
    confidence: null,
    reason_code: "GKX_RETRIEVAL_EVALUATION_OPERATIONAL_FAILURE",
    message: "Retrieval evaluation failed safely.",
    ordered_hit_projections: [],
    citation_applicability: "not_applicable",
    host_classification: "fixture_authority_failure",
    exit_code: 3,
    work_counters: Object.fromEntries(Object.keys(ordinary.work_counters).map((field) => [field, 0])),
    effects: { public_result_emitted: false, output_artifact_written: false, state_mutated: false },
  });
  assert.equal(retrieval.sealRetrievalEvaluationScenarioOutcome(operational).kind, "operational_exclusion");
  const conflictSameScenario = scenarioOutcome({ ...conflict, scenario_id: ordinary.scenario_id });
  assert.deepEqual(retrieval.compareRetrievalEvaluationScenarioOutcome(ordinary, conflictSameScenario).reasons, ["SCENARIO_KIND_MISMATCH", "SCENARIO_OUTCOME_MISMATCH"]);

  const badItems = reseal({ ...ordinary, work_counters: { ...ordinary.work_counters, vector_provider_item_count: 1 } }, "outcome_digest");
  assert.throws(() => retrieval.sealRetrievalEvaluationScenarioOutcome(badItems), /GKX_EVAL_SCENARIO_PROVIDER_COUNTER_RELATION_INVALID/u);
  const overlongId = reseal({ ...ordinary, scenario_id: "a".repeat(129) }, "outcome_digest");
  assert.throws(() => retrieval.sealRetrievalEvaluationScenarioOutcome(overlongId), /GKX_EVAL_SCENARIO_OUTCOME_COORDINATE_INVALID/u);
});

test("audit oracle partitions identities without treating unknown values as leaks", () => {
  const endpointId = "018f0000-0000-7000-8000-000000000343";
  const sourceA = {
    source_id: "018f0000-0000-7000-8000-000000000341",
    source_path: "public/irrelevant.md",
    text: "# Irrelevant\none two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen\n",
  };
  const sourceB = {
    source_id: "018f0000-0000-7000-8000-000000000342",
    source_path: "public/relevant.md",
    text: "# Relevant\ntarget one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen\n",
  };
  const makeInput = (endpoint) => {
    const chunkA = retrieval.chunkMarkdown({ ...sourceA, metadata: { title: "Irrelevant", sensitivity: "public", authoritative: true, tags: [] } }, { max_tokens: 32, overlap_tokens: 0 })[0];
    const chunkB = retrieval.chunkMarkdown({
      ...sourceB,
      supersedes: [endpoint],
      metadata: { title: "Relevant", sensitivity: "public", authoritative: true, tags: [] },
    }, { max_tokens: 32, overlap_tokens: 0 })[0];
    return queryInputFor({
      queryText: "target",
      queryId: "oracle-partition",
      result: resultFor("target", [chunkA, chunkB], `oracle-partition-${endpoint}`),
      sources: [sourceA, sourceB],
      expectedSourceIds: [sourceB.source_id],
    });
  };
  for (const row of PHASE4_CONFORMANCE.oracle_partition_matrix) {
    const input = makeInput(row.mutation === "use_authorized_source_as_independently_authorized_endpoint" ? sourceA.source_id : endpointId);
    const oracle = input.audit_oracle;
    if (row.mutation === "classify_endpoint_forbidden") {
      oracle.authorized_endpoint_ids = [];
      oracle.forbidden_endpoint_ids = [endpointId];
    } else if (row.mutation === "move_endpoint_to_authorized_source_ids") {
      oracle.authorized_endpoint_ids = [];
      oracle.authorized_source_ids.push(endpointId);
      oracle.authorized_source_ids.sort();
    } else if (row.mutation === "move_source_to_authorized_endpoint_ids") {
      oracle.authorized_source_ids = oracle.authorized_source_ids.filter((id) => id !== sourceA.source_id);
      oracle.authorized_endpoint_ids.push(sourceA.source_id);
      oracle.authorized_endpoint_ids.sort();
    } else if (row.mutation === "remove_endpoint_classification") {
      oracle.authorized_endpoint_ids = [];
    } else if (row.mutation === "duplicate_endpoint_across_classes") {
      oracle.forbidden_endpoint_ids = [endpointId];
    } else if (row.mutation === "replace_endpoint_with_malformed_uid") {
      oracle.authorized_endpoint_ids = ["not-a-uid"];
    }
    input.audit_oracle = reseal(oracle, "oracle_digest");
    if (row.expected_status === "error") {
      assert.throws(() => retrieval.computeRetrievalEvaluationQueryMetrics(input), { message: row.expected_code }, row.case_id);
      continue;
    }
    const metrics = retrieval.computeRetrievalEvaluationQueryMetrics(input);
    assert.equal(metrics.policy.policy_identity_field_count, row.expected_policy_identity_field_count, row.case_id);
    if ("expected_policy_leak_count" in row) assert.equal(metrics.policy.policy_leak_count, row.expected_policy_leak_count, row.case_id);
    if ("expected_policy_leak_rate_micros" in row) assert.equal(metrics.policy.policy_leak_rate_micros, row.expected_policy_leak_rate_micros, row.case_id);
    if (row.case_id === "null-lineage-and-absent-parent-zero") {
      assert.equal(input.result.hits.every((hit) => hit.chunk.lineage_id === null && hit.provenance.lineage_id === null), true);
      assert.equal(input.result.hits.every((hit) => !Object.hasOwn(hit, "parent_context")), true);
      assert.equal(row.expected_null_lineage_occurrences, 0);
      assert.equal(row.expected_absent_parent_occurrences, 0);
    }
  }
});
