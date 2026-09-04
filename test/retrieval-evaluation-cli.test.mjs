import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmod, copyFile, link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, unlink, utimes, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import * as retrieval from "../dist/retrieval.mjs";
import * as host from "../dist/retrieval-evaluation-host.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "bin", "gkx.mjs");
const PACK = join(ROOT, "contracts", "retrieval", "gkos-retrieval-evaluation-1.0.0-draft.1");
const CLI_FIXTURE = JSON.parse(await readFile(
  new URL("./fixtures/retrieval-evaluation-cli-phase4.json", import.meta.url),
  "utf8",
));
const CONFORMANCE = JSON.parse(await readFile(join(PACK, "conformance-fixture.json"), "utf8"));
const REVIEWED = JSON.parse(await readFile(join(PACK, "reviewed-bundle.json"), "utf8"));
const EXECUTION_AUTHORITY_DIGEST = REVIEWED.reviewed_bundle_digest;
const BASELINE = CONFORMANCE.valid_envelopes.baseline;
const TUNE_ROW = CONFORMANCE.tune_matrix.find((row) => row.case_id === "shipped-24-query-grid");
const PHYSICAL_FTS5_AVAILABLE = host.detectSqliteLexicalCapability().fts5_available;
const REQUIRED_SIBLINGS = [
  "golden-fixture.toml",
  "conformance-fixture.json",
  "fixed-provider.json",
  "fixture-catalog.json",
  "source-corpus.json",
  "metric-computation-fixture.json",
  "tune-priority-fixture.json",
  "reviewed-bundle.json",
  "ndcg-discount-table.json",
];

const CONSUMED = Object.fromEntries([
  "argv_matrix", "help_matrix", "local_path_reject_matrix", "error_matrix", "recovery_state_matrix",
  "guard_mutation_matrix", "candidate_toml_matrix", "general_execution_matrix", "optional_companion_matrix",
].map((name) => [name, new Set()]));

function row(section, caseId) {
  const value = CLI_FIXTURE[section].find((candidate) => candidate.case_id === caseId);
  assert.ok(value, `${section}:${caseId}`);
  CONSUMED[section].add(caseId);
  return value;
}

test.after(() => {
  for (const [section, consumed] of Object.entries(CONSUMED)) {
    const ids = CLI_FIXTURE[section].map((item) => item.case_id);
    assert.equal(new Set(ids).size, ids.length, `${section}: duplicate case IDs`);
    assert.deepEqual([...consumed].sort(), [...ids].sort(), `${section}: unconsumed rows`);
  }
});

async function privateDirectory(t, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  if (process.platform !== "win32") await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function assertLexicalScanDatabases(stateRoot) {
  const relativePaths = (await readdir(stateRoot, { recursive: true }))
    .filter((entry) => typeof entry === "string" && entry.endsWith(".sqlite"));
  assert.ok(relativePaths.length > 0, "at least one unactivated SQLite generation is required");
  for (const relativePath of relativePaths) {
    const database = new DatabaseSync(join(stateRoot, relativePath), { readOnly: true });
    try {
      const row = database.prepare("SELECT type, sql FROM sqlite_master WHERE name = 'chunk_fts'").get();
      assert.equal(row?.type, "table", relativePath);
      assert.doesNotMatch(String(row?.sql ?? ""), /\bVIRTUAL\s+TABLE\b|\bfts5\b/iu, relativePath);
    } finally { database.close(); }
  }
}

async function fixtureDirectory(t) {
  const root = await privateDirectory(t, "gkx-evaluation-fixture-");
  for (const name of REQUIRED_SIBLINGS) {
    const destination = join(root, name);
    await copyFile(join(PACK, name), destination);
    if (process.platform !== "win32") await chmod(destination, 0o600);
  }
  return root;
}

async function rewriteConformance(root, mutate) {
  const path = join(root, "conformance-fixture.json");
  const value = JSON.parse(await readFile(path, "utf8"));
  mutate(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== "win32") await chmod(path, 0o600);
  return value;
}

async function generalFixtureDirectory(t) {
  const root = await fixtureDirectory(t);
  await rewriteConformance(root, (value) => { value.fixture_files.reviewed_bundle = null; });
  await unlink(join(root, "reviewed-bundle.json"));
  return root;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function reseal(value, digestField) {
  const material = { ...value };
  delete material[digestField];
  return { ...material, [digestField]: retrieval.retrievalCanonicalDigest(material) };
}

async function writeJsonPrivate(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== "win32") await chmod(path, 0o600);
}

function reduceProviderSchedule(scheduleValue, scenario, queryIndex, goldenDigest) {
  const schedule = clone(scheduleValue);
  const oldQueryCount = schedule.query_count;
  const queryPartition = [schedule.query_partition[queryIndex]];
  const embeddingTemplate = scenario.embedding_query_templates[0];
  const rerankerOracle = scenario.reranker_query_oracles[0];
  let matrix = schedule.operation === "eval"
    ? [schedule.occurrence_matrix[queryIndex]]
    : schedule.occurrence_matrix.filter((_, index) => index % oldQueryCount === queryIndex);
  if (!embeddingTemplate) matrix = matrix.map((cell) => [0, cell[1], cell[2]]);
  if (!rerankerOracle) matrix = matrix.map((cell) => [cell[0], null, null]);
  const emptyRerankRequest = embeddingTemplate?.outcome === "failure" && rerankerOracle;
  if (emptyRerankRequest) {
    const emptyRequestDigest = retrieval.retrievalCanonicalDigest({
      contract_version: "gkos-retrieval-evaluation-provider-request/1.0.0-draft.1",
      call_kind: "reranker_query",
      request_id: rerankerOracle.request_id,
      query_id: queryPartition[0].query_id,
      query_digest: queryPartition[0].query_digest,
      query_text: rerankerOracle.effective_query_text,
      ordered_inputs: [],
    });
    matrix = matrix.map((cell) => [cell[0], emptyRequestDigest, 0]);
  } else if (!embeddingTemplate && rerankerOracle) {
    matrix = matrix.map((cell) => {
      const ordered = rerankerOracle.candidate_score_universe.slice(0, cell[2] ?? 0);
      const requestDigest = retrieval.retrievalCanonicalDigest({
        contract_version: "gkos-retrieval-evaluation-provider-request/1.0.0-draft.1",
        call_kind: "reranker_query",
        request_id: rerankerOracle.request_id,
        query_id: queryPartition[0].query_id,
        query_digest: queryPartition[0].query_digest,
        query_text: rerankerOracle.effective_query_text,
        ordered_inputs: ordered.map((candidate) => ({
          candidate_chunk_id: candidate.candidate_chunk_id,
          input_digest: candidate.input_digest,
        })),
      });
      return [cell[0], requestDigest, ordered.length];
    });
  }
  const axes = schedule.operation === "eval" ? [schedule.evaluation_axes] : schedule.eligible_tuning_axes;
  const matrixMaterial = {
    contract_version: "gkos-retrieval-evaluation-provider-occurrence-matrix/1.0.0-draft.1",
    operation: schedule.operation,
    query_partition: queryPartition,
    tuning_axes_digests: axes.map((item) => item.tuning_axes_digest),
    embedding_query_template_digests: [embeddingTemplate?.template_digest ?? null],
    reranker_query_oracle_digests: [rerankerOracle?.template_digest ?? null],
    occurrence_matrix: matrix,
  };
  const templateOccurrences = [
    ...scenario.embedding_index_templates.map((item) => ({ template_id: item.template_id, occurrence_count: 1 })),
    ...(embeddingTemplate ? [{ template_id: embeddingTemplate.template_id,
      occurrence_count: matrix.filter((cell) => cell[0] === 1).length }] : []),
    ...(rerankerOracle ? [{ template_id: rerankerOracle.template_id,
      occurrence_count: matrix.filter((cell) => cell[1] !== null).length }] : []),
  ].sort((left, right) => left.template_id < right.template_id ? -1 : left.template_id > right.template_id ? 1 : 0);
  const coverage = rerankerOracle ? [{
    reranker_query_oracle_id: rerankerOracle.template_id,
    used_candidate_chunk_ids: emptyRerankRequest ? [] :
      schedule.reranker_oracle_coverage[queryIndex].used_candidate_chunk_ids,
  }] : [];
  const indexCalls = scenario.embedding_index_templates.length;
  const embeddingCalls = matrix.filter((cell) => cell[0] === 1).length;
  const rerankCalls = matrix.filter((cell) => cell[1] !== null).length;
  const expectedCounters = {
    vector_provider_call_count: indexCalls + embeddingCalls,
    vector_provider_item_count: scenario.embedding_index_templates.reduce((sum, item) => sum + item.item_count, 0) + embeddingCalls,
    rerank_provider_call_count: rerankCalls,
    rerank_provider_item_count: matrix.reduce((sum, cell) => sum + (cell[2] ?? 0), 0),
  };
  const reduced = {
    ...schedule,
    normalized_golden_digest: goldenDigest,
    query_partition: queryPartition,
    query_count: 1,
    query_evaluation_count: matrix.length,
    occurrence_matrix: matrix,
    occurrence_matrix_digest: retrieval.retrievalCanonicalDigest(matrixMaterial),
    template_occurrences: templateOccurrences,
    reranker_oracle_coverage: coverage,
    expected_provider_counters: expectedCounters,
  };
  return reseal(reduced, "schedule_digest");
}

function oneQueryBaseline(environmentSet, golden, queryMetrics) {
  const metricsSet = host.buildRetrievalEvaluationMetricsSetForHost({
    environment_set: environmentSet,
    normalized_golden: golden,
    query_metrics: [queryMetrics],
  });
  const baseline = {
    ...clone(BASELINE),
    environment_set: environmentSet,
    normalized_golden: golden,
    metrics_set: metricsSet,
    query_count: 1,
    maximum_expected_top_k: golden.queries[0].expected_top_k,
    normalized_golden_digest: golden.golden_digest,
    environment_set_digest: environmentSet.environment_set_digest,
    query_metrics_set_digest: metricsSet.query_metrics_set_digest,
    aggregate_metrics_digest: metricsSet.aggregate_metrics.aggregate_metrics_digest,
    metrics_set_digest: metricsSet.metrics_set_digest,
  };
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
  return retrieval.sealRetrievalEvaluationBaseline(reseal(baseline, "baseline_digest"));
}

function baselineWithNonTunableConfiguration(baselineValue, label) {
  const baseline = clone(baselineValue);
  const baseConfiguration = reseal({
    contract_version: "gkos-retrieval-evaluation-base-configuration/1.0.0-draft.1",
    effective_non_tunable_configuration_digest: retrieval.retrievalCanonicalDigest({
      effective_non_tunable_configuration: label,
    }),
  }, "base_configuration_digest");
  baseline.base_configuration = baseConfiguration;
  baseline.base_configuration_digest = baseConfiguration.base_configuration_digest;
  baseline.candidate_config_digest = retrieval.retrievalCanonicalDigest({
    base_configuration_digest: baseConfiguration.base_configuration_digest,
    candidate_config: host.retrievalEvaluationCandidateConfigMaterial(baseline.selected_axes),
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
  return retrieval.sealRetrievalEvaluationBaseline(reseal(baseline, "baseline_digest"));
}

function oneMemberEnvironmentSet(baseMember, golden, catalogDigest, providerDigest, manifest, roles) {
  const embeddingRole = !roles.embedding_active ? {
    state: "disabled", provider_scenario_id: "disabled", provider_kind: null, provider_id: null, model_id: null,
    dimensions: null, fixed_provider_transcript_digest: null,
  } : { ...baseMember.environment.embedding_role, fixed_provider_transcript_digest: providerDigest };
  const rerankerRole = !roles.reranker_active ? {
    state: "disabled", provider_scenario_id: "disabled", provider_kind: null, provider_id: null, model_id: null,
    fixed_provider_transcript_digest: null,
  } : { ...baseMember.environment.reranker_role, fixed_provider_transcript_digest: providerDigest };
  const backend = roles.lexical_backend;
  const backendScenario = backend === "sqlite_fts5" ? "sqlite-fts5" : "sqlite-lexical-scan";
  const environment = reseal({
    ...baseMember.environment,
    scenario_id: `${baseMember.environment.vault_fixture}--${backendScenario}--vector-${embeddingRole.provider_scenario_id}--reranker-${rerankerRole.provider_scenario_id}`,
    lexical_backend: backend,
    normalized_golden_digest: golden.golden_digest,
    fixture_catalog_digest: catalogDigest,
    projection_id: manifest.projection_id,
    projection_digest: manifest.projection_digest,
    embedding_role: embeddingRole,
    reranker_role: rerankerRole,
  }, "environment_digest");
  const member = reseal({
    environment,
    query_partition: [{ query_id: golden.queries[0].id, query_digest: golden.queries[0].query_digest }],
    query_count: 1,
  }, "member_digest");
  return reseal({
    contract_version: "gkos-retrieval-evaluation-environment-set/1.0.0-draft.1",
    normalized_golden_digest: golden.golden_digest,
    query_count: 1,
    members: [member],
  }, "environment_set_digest");
}

async function generalProviderScenarioFixture(t, kind) {
  const bothDisabled = kind === "disabled";
  const embeddingActive = !bothDisabled && kind !== "reranker_only";
  const rerankerActive = !bothDisabled && kind !== "embedding_only";
  const lexicalBackend = bothDisabled ? "sqlite_fts5" : "sqlite_lexical_scan";
  const root = await fixtureDirectory(t);
  const fullGolden = await readFile(join(root, "golden-fixture.toml"), "utf8");
  const firstQuery = fullGolden.indexOf("[[query]]");
  const secondQuery = fullGolden.indexOf("\n[[query]]", firstQuery + 1);
  let goldenToml = `${fullGolden.slice(0, secondQuery).trimEnd()}\n`;
  if (kind === "disabled" || kind === "reranker_only") {
    goldenToml = goldenToml.replace(
      'text = "What decisions govern agent-created notes?"',
      'text = "authorization"',
    );
  }
  const golden = host.parseRetrievalEvaluationGoldenToml(goldenToml);
  assert.equal(golden.queries.length, 1);
  const query = golden.queries[0];
  const baseSource = JSON.parse(await readFile(join(root, "source-corpus.json"), "utf8"));
  const corpus = baseSource.corpora.find((item) => item.vault_fixture === query.vault_fixture);
  const sourceMaterial = { contract_version: baseSource.contract_version, corpora: [corpus] };
  const sourceCorpus = host.sealRetrievalEvaluationSourceCorpus({
    ...sourceMaterial,
    source_corpus_digest: host.retrievalEvaluationSourceCorpusMaterialDigest(sourceMaterial),
  });
  const conformance = clone(CONFORMANCE);
  const baseMember = conformance.valid_envelopes.environment_set.members.find((item) =>
    item.environment.vault_fixture === query.vault_fixture);
  const baseManifest = conformance.valid_envelopes.projection_manifests.find((item) => item.vault_id === query.vault_fixture);
  const baseMetric = BASELINE.metrics_set.query_evaluations.find((item) => item.query_metrics.query_id === query.id).query_metrics;
  const baseCatalog = JSON.parse(await readFile(join(root, "fixture-catalog.json"), "utf8"));
  let entry = clone(baseCatalog.entries.find((item) => item.vault_fixture === query.vault_fixture));
  let manifest = clone(baseManifest);
  let provider = null;

  if (!embeddingActive) {
    const baseCapability = await host.openRetrievalEvaluationFixtureCapability(join(root, "golden-fixture.toml"), ROOT);
    const derivation = host.deriveRetrievalEvaluationExecutableEnvironmentBundle(baseCapability.input.environment_bundle)
      .derivations.find((item) => item.vault_fixture === query.vault_fixture);
    manifest = host.deriveGkxRetrievalProjectionManifest({
      vault_id: derivation.corpus.vault_fixture,
      source_snapshot_digest: derivation.catalog_entry.source_snapshot.source_snapshot_digest,
      configuration_digest: derivation.manifest.configuration_digest,
      policy_digest: derivation.catalog_entry.runtime_policy_inputs.runtime_policy_inputs_digest,
      candidate_sources: derivation.projection.sources.map((source) => source.candidate_source),
      candidate_declarations: derivation.projection.declarations,
      candidate_chunks: derivation.candidate_chunks,
      embedding_eligible_candidate_chunk_keys:
        derivation.policy_candidate_chunks.map((candidate) => candidate.candidate_chunk_key),
      vectors: [],
      embedding_provider_id: null,
      embedding_model_id: null,
      embedding_dimensions: null,
    }, lexicalBackend);
  }

  if (!bothDisabled) {
    const baseProvider = JSON.parse(await readFile(join(root, "fixed-provider.json"), "utf8"));
    const baseScenario = baseProvider.scenarios.find((item) => item.environment_scope.vault_fixture === query.vault_fixture);
    const queryIndex = baseScenario.eval_schedule.query_partition.findIndex((item) => item.query_id === query.id);
    assert.ok(queryIndex >= 0);
    const scenario = clone(baseScenario);
    scenario.embedding_query_templates = [scenario.embedding_query_templates[queryIndex]];
    scenario.reranker_query_oracles = [scenario.reranker_query_oracles[queryIndex]];
    if (!embeddingActive) {
      scenario.embedding_provider_scenario_id = "disabled";
      scenario.embedding_role = "disabled";
      scenario.embedding_index_templates = [];
      scenario.embedding_query_templates = [];
      scenario.disabled_vector_stage = { state: "disabled", reason_codes: ["VECTOR_DISABLED"] };
      if (rerankerActive) {
        scenario.reranker_query_oracles[0] = reseal({
          ...scenario.reranker_query_oracles[0],
          query_digest: query.query_digest,
          effective_query_text: query.text.trim(),
          query_input_digest: retrieval.retrievalSha256(query.text.trim()),
          request_id: retrieval.retrievalSha256(`rerank\0${query.text.trim()}`),
        }, "template_digest");
      }
    }
    if (!rerankerActive) {
      scenario.reranker_provider_scenario_id = "disabled";
      scenario.reranker_role = "disabled";
      scenario.reranker_query_oracles = [];
      scenario.disabled_reranker_stage = { state: "skipped", reason_codes: ["RERANKER_NOT_CONFIGURED"] };
    }
    if (kind === "embedding_failure") {
      scenario.embedding_query_templates[0] = reseal({
        ...scenario.embedding_query_templates[0], outcome: "failure", responses: [], error_code: "FIXED_EMBEDDING_FAILURE",
        expected_vector_stage: { state: "degraded", reason_codes: ["VECTOR_UNAVAILABLE"] },
      }, "template_digest");
      scenario.reranker_query_oracles[0] = reseal({
        ...scenario.reranker_query_oracles[0], candidate_score_universe: [],
      }, "template_digest");
    }
    if (kind === "reranker_failure") {
      scenario.reranker_query_oracles[0] = reseal({
        ...scenario.reranker_query_oracles[0], outcome: "failure", error_code: "FIXED_RERANKER_FAILURE",
        expected_reranker_stage: { state: "degraded", reason_codes: ["RERANKER_UNAVAILABLE"] },
      }, "template_digest");
    }
    const embeddingScope = embeddingActive ? clone(baseScenario.environment_scope.embedding_role) : {
      state: "disabled", provider_scenario_id: "disabled", provider_kind: null, provider_id: null,
      model_id: null, dimensions: null,
    };
    const rerankerScope = rerankerActive ? clone(baseScenario.environment_scope.reranker_role) : {
      state: "disabled", provider_scenario_id: "disabled", provider_kind: null, provider_id: null, model_id: null,
    };
    scenario.environment_scope = reseal({
      ...scenario.environment_scope,
      lexical_backend: lexicalBackend,
      normalized_golden_digest: golden.golden_digest,
      normalized_golden_query_count: 1,
      projection_id: manifest.projection_id,
      projection_digest: manifest.projection_digest,
      embedding_role: embeddingScope,
      reranker_role: rerankerScope,
    }, "environment_scope_digest");
    const evalSchedule = clone(baseScenario.eval_schedule);
    const tuneSchedule = clone(baseScenario.tune_schedule);
    evalSchedule.query_partition[queryIndex] = { query_id: query.id, query_digest: query.query_digest };
    tuneSchedule.query_partition[queryIndex] = { query_id: query.id, query_digest: query.query_digest };
    if (kind === "eval_axes_mismatch") {
      evalSchedule.evaluation_axes = baseScenario.tune_schedule.eligible_tuning_axes.find((axes) =>
        axes.tuning_axes_digest !== BASELINE.selected_axes.tuning_axes_digest);
      assert.ok(evalSchedule.evaluation_axes);
    }
    scenario.eval_schedule = reduceProviderSchedule(evalSchedule, scenario, queryIndex, golden.golden_digest);
    scenario.tune_schedule = reduceProviderSchedule(tuneSchedule, scenario, queryIndex, golden.golden_digest);
    provider = host.sealRetrievalEvaluationFixedProviderTranscript(reseal({
      ...baseProvider,
      scenarios: [reseal(scenario, "scenario_digest")],
    }, "provider_fixture_digest"));
    entry = reseal({
      ...entry,
      fixed_provider_transcript_digest: provider.provider_fixture_digest,
      embedding_provider_scenario_id: scenario.embedding_provider_scenario_id,
      reranker_provider_scenario_id: scenario.reranker_provider_scenario_id,
      backend: lexicalBackend,
    }, "entry_digest");
  } else {
    entry = reseal({
      ...entry,
      fixed_provider_transcript_digest: null,
      embedding_provider_scenario_id: "disabled",
      reranker_provider_scenario_id: "disabled",
      backend: "sqlite_fts5",
    }, "entry_digest");
  }

  const catalog = host.sealRetrievalEvaluationFixtureCatalog(reseal({
    ...baseCatalog,
    entries: [entry],
  }, "catalog_digest"));
  const environmentSet = retrieval.sealRetrievalEvaluationEnvironmentSet(
    oneMemberEnvironmentSet(baseMember, golden, catalog.catalog_digest, provider?.provider_fixture_digest ?? null, manifest, {
      embedding_active: embeddingActive,
      reranker_active: rerankerActive,
      lexical_backend: lexicalBackend,
    }),
    golden,
  );
  const baseline = oneQueryBaseline(environmentSet, golden, baseMetric);
  conformance.golden.expected_normalized = golden;
  conformance.valid_envelopes.query_metrics = baseMetric;
  conformance.valid_envelopes.aggregate_metrics = baseline.metrics_set.aggregate_metrics;
  conformance.valid_envelopes.environment_set = environmentSet;
  conformance.valid_envelopes.metrics_set = baseline.metrics_set;
  conformance.valid_envelopes.baseline = baseline;
  conformance.valid_envelopes.projection_manifests = [manifest];
  conformance.fixture_files.source_corpus.digest = sourceCorpus.source_corpus_digest;
  conformance.fixture_files.fixture_catalog.digest = catalog.catalog_digest;
  conformance.fixture_files.fixed_provider = provider === null ? null : {
    file: "fixed-provider.json", digest: provider.provider_fixture_digest,
  };
  conformance.fixture_files.reviewed_bundle = null;
  await writeFile(join(root, "golden-fixture.toml"), goldenToml, { mode: 0o600 });
  await writeJsonPrivate(join(root, "source-corpus.json"), sourceCorpus);
  await writeJsonPrivate(join(root, "fixture-catalog.json"), catalog);
  await writeJsonPrivate(join(root, "conformance-fixture.json"), conformance);
  await unlink(join(root, "reviewed-bundle.json"));
  if (provider === null) await unlink(join(root, "fixed-provider.json"));
  else await writeJsonPrivate(join(root, "fixed-provider.json"), provider);
  if (process.platform !== "win32") await chmod(join(root, "golden-fixture.toml"), 0o600);
  if ((bothDisabled && PHYSICAL_FTS5_AVAILABLE) || kind === "reranker_only" || kind === "embedding_only") {
    const preliminaryCapability = await host.openRetrievalEvaluationFixtureCapability(
      join(root, "golden-fixture.toml"), ROOT,
    );
    const preliminaryState = await privateDirectory(t, "gkx-evaluation-disabled-baseline-");
    const preliminary = await host.executeRetrievalEvaluationEval(preliminaryCapability.input, preliminaryState);
    const observedMetric = preliminary.metrics_set.query_evaluations[0].query_metrics;
    const coherentBaseline = oneQueryBaseline(environmentSet, golden, observedMetric);
    conformance.valid_envelopes.query_metrics = observedMetric;
    conformance.valid_envelopes.aggregate_metrics = coherentBaseline.metrics_set.aggregate_metrics;
    conformance.valid_envelopes.metrics_set = coherentBaseline.metrics_set;
    conformance.valid_envelopes.baseline = coherentBaseline;
    await writeJsonPrivate(join(root, "conformance-fixture.json"), conformance);
  }
  return { root, golden, expected_kind: kind };
}

function isolatedTempEnvironment(parent) {
  return { ...process.env, TMP: parent, TEMP: parent, TMPDIR: parent };
}

function runProcess(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT,
      env: options.env ?? process.env,
      windowsHide: true,
      windowsVerbatimArguments: options.windowsVerbatimArguments ?? false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (part) => stdout.push(part));
    child.stderr.on("data", (part) => stderr.push(part));
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => resolvePromise({
      code,
      signal,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
  });
}

function cli(args, options = {}) {
  return runProcess(process.execPath, [CLI, ...args], options);
}

function comparison() {
  return retrieval.compareRetrievalEvaluationBaseline({
    current_environment_set: BASELINE.environment_set,
    current_base_configuration: BASELINE.base_configuration,
    current_tuning_grid: BASELINE.tuning_grid,
    current_tuning_axes: BASELINE.selected_axes,
    current_golden: BASELINE.normalized_golden,
    current_metrics_set: BASELINE.metrics_set,
    current_relative_ndcg_budget: BASELINE.relative_ndcg_budget,
    baseline: BASELINE,
  });
}

function tuneSelection(selected = true) {
  const {
    candidate_config_digest: candidateConfigDigest,
    candidate_evaluation_digest: candidateEvaluationDigest,
    ...coordinates
  } = CLI_FIXTURE.tune_selection;
  const selectedCandidate = selected ? {
    candidate_config_digest: candidateConfigDigest,
    axes: TUNE_ROW.expected_selected_axes,
    metrics_set: BASELINE.metrics_set,
    candidate_evaluation_digest: candidateEvaluationDigest,
  } : null;
  return {
    contract_version: "gkos-retrieval-evaluation-tune-selection/1.0.0-draft.1",
    ...coordinates,
    conforming_candidate_count: selected ? CLI_FIXTURE.tune_selection.conforming_candidate_count : 0,
    selected_candidate: selectedCandidate,
  };
}

function candidateConfig() {
  return host.retrievalEvaluationCandidateConfigMaterial(TUNE_ROW.expected_selected_axes);
}

function decodePathRow(item) {
  if (item.encoding === "literal") return item.value;
  if (item.encoding === "utf16_code_units") return String.fromCharCode(...item.code_units);
  if (item.encoding === "filesystem_root") return parse(resolve(".")).root;
  throw new Error(`unknown path encoding ${item.encoding}`);
}

async function exactGuard(outputParent, outputBasename, overrides = {}) {
  const parent = await stat(outputParent, { bigint: true });
  const selection = tuneSelection(true);
  const candidateBytes = host.renderRetrievalEvaluationCandidateToml(candidateConfig());
  const material = {
    contract_version: host.RETRIEVAL_EVALUATION_OUTPUT_GUARD_VERSION,
    operation: "retrieval_tune_candidate_publication",
    owner_nonce: "ab".repeat(16),
    output_basename: outputBasename,
    output_parent_device: parent.dev.toString(10),
    output_parent_inode: parent.ino.toString(10),
    output_parent_mode: Number(parent.mode),
    execution_authority_digest: EXECUTION_AUTHORITY_DIGEST,
    tune_selection_digest: selection.tune_selection_digest,
    candidate_config_digest: selection.selected_candidate.candidate_config_digest,
    candidate_toml_digest: retrieval.retrievalSha256(candidateBytes),
    candidate_toml_size: candidateBytes.length,
    ...overrides,
  };
  const guard = { ...material, guard_digest: retrieval.retrievalCanonicalDigest(material) };
  return {
    guard,
    guard_bytes: Buffer.from(`${retrieval.stableJson(guard)}\n`, "utf8"),
    candidate_bytes: candidateBytes,
    selection,
  };
}

async function writePrivate(path, bytes) {
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  if (process.platform !== "win32") await chmod(path, 0o600);
}

async function publishInput(capability, selection = tuneSelection(true)) {
  await capability.publish({
    execution_authority_digest: EXECUTION_AUTHORITY_DIGEST,
    selection,
    candidate_config: candidateConfig(),
    revalidate_authority: async () => capability.revalidate(),
  });
}

test("Phase4 CLI fixture freezes exact argv, text, pretty JSON, and status exits", async () => {
  assert.deepEqual(Object.keys(CLI_FIXTURE), [
    "contract_version", "argv_matrix", "help_matrix", "local_path_reject_matrix", "presentation",
    "error_matrix", "general_execution_matrix", "optional_companion_matrix", "tune_selection",
    "recovery_state_matrix", "guard_mutation_matrix",
    "candidate_toml_matrix", "fixture_digest",
  ]);
  assert.equal(CLI_FIXTURE.contract_version, "gkx-retrieval-evaluation-cli-conformance/1.0.0-draft.1");
  const { fixture_digest: fixtureDigest, ...fixtureMaterial } = CLI_FIXTURE;
  assert.equal(retrieval.retrievalCanonicalDigest(fixtureMaterial), fixtureDigest);
  const exactComparison = comparison();
  const text = host.retrievalEvaluationEvalPresentation(exactComparison, false);
  const json = host.retrievalEvaluationEvalPresentation(exactComparison, true);
  assert.deepEqual(text, { stdout: CLI_FIXTURE.presentation.eval_text, exit_code: 0 });
  assert.deepEqual(json, { stdout: CLI_FIXTURE.presentation.eval_json, exit_code: 0 });

  for (const statusRow of [
    CLI_FIXTURE.presentation.eval_regression_status,
    CLI_FIXTURE.presentation.eval_needs_human_status,
  ]) {
    const observed = host.retrievalEvaluationEvalPresentation({ ...exactComparison, status: statusRow.status }, false);
    assert.equal(observed.exit_code, statusRow.exit_code);
    assert.match(observed.stdout, new RegExp(`^gkx retrieval eval\\nstatus: ${statusRow.status}\\n`, "u"));
  }

  assert.deepEqual(host.retrievalEvaluationTunePresentation(tuneSelection(true)), {
    stdout: CLI_FIXTURE.presentation.tune_proposed,
    exit_code: 0,
  });
  assert.deepEqual(host.retrievalEvaluationTunePresentation(tuneSelection(false)), {
    stdout: CLI_FIXTURE.presentation.tune_no_candidate,
    exit_code: 1,
  });
  assert.deepEqual(host.retrievalEvaluationTuneNeedsHumanPresentation(), {
    stdout: CLI_FIXTURE.presentation.tune_needs_human,
    exit_code: 4,
  });
  assert.equal(host.RETRIEVAL_EVALUATION_CLI_USAGE + "\n", CLI_FIXTURE.presentation.usage);
  assert.equal(host.renderRetrievalEvaluationCandidateToml(candidateConfig()).toString("utf8"),
    CLI_FIXTURE.presentation.candidate_toml);
});

test("candidate TOML roundtrips every frozen MMR coordinate without optional-field drift", () => {
  for (const item of CLI_FIXTURE.candidate_toml_matrix) {
    row("candidate_toml_matrix", item.case_id);
    const config = host.retrievalEvaluationCandidateConfigMaterial({
      rrf_k: 60,
      mmr: item.mmr,
      mmr_lambda_micros: item.mmr_lambda_micros,
      semantic_top_k: 5,
      lexical_top_k: 5,
    });
    const rendered = host.renderRetrievalEvaluationCandidateToml(config).toString("utf8");
    assert.equal(rendered, item.expected_toml, item.case_id);
    assert.equal(rendered.includes("mmr_lambda ="), item.mmr, item.case_id);
  }
});

test("nested retrieval argv and help matrices are exact", async () => {
  for (const item of CLI_FIXTURE.argv_matrix) {
    row("argv_matrix", item.case_id);
    if (item.valid) continue;
    const result = await cli(["retrieval", ...item.args]);
    assert.equal(result.code, 2, item.case_id);
    assert.equal(result.signal, null, item.case_id);
    assert.equal(result.stdout, "", item.case_id);
    assert.equal(result.stderr, `gkx retrieval ${item.command}: invalid arguments\n`, item.case_id);
  }
  for (const item of CLI_FIXTURE.help_matrix) {
    row("help_matrix", item.case_id);
    const result = await cli(["retrieval", ...item.args]);
    assert.deepEqual(result, { code: 0, signal: null, stdout: CLI_FIXTURE.presentation.usage, stderr: "" }, item.case_id);
  }
});

test("raw local path grammar rejects every frozen namespace and Unicode form", () => {
  for (const item of CLI_FIXTURE.local_path_reject_matrix) {
    row("local_path_reject_matrix", item.case_id);
    assert.throws(
      () => host.retrievalEvaluationLocalPath(decodePathRow(item), ROOT),
      /GKX_EVAL_CLI_PATH_INVALID/u,
      item.case_id,
    );
  }
  assert.equal(host.retrievalEvaluationLocalPath("relative/golden-fixture.toml", ROOT),
    resolve(ROOT, "relative", "golden-fixture.toml"));
});

test("fixture capability seals all siblings and suppresses a changed root or leaf", async (t) => {
  const root = await fixtureDirectory(t);
  const fixture = join(root, "golden-fixture.toml");
  const capability = await host.openRetrievalEvaluationFixtureCapability(fixture, ROOT);
  assert.equal(capability.input_paths.length, REQUIRED_SIBLINGS.length);
  await capability.revalidate();

  const leaf = join(root, "ndcg-discount-table.json");
  const leafState = await stat(leaf);
  await utimes(leaf, leafState.atime, new Date(leafState.mtimeMs + 2_000));
  await assert.rejects(capability.revalidate(), /GKX_EVAL_CLI_FIXTURE_CHANGED/u);

  const second = await fixtureDirectory(t);
  const secondCapability = await host.openRetrievalEvaluationFixtureCapability(join(second, "golden-fixture.toml"), ROOT);
  const rootState = await stat(second);
  await utimes(second, rootState.atime, new Date(rootState.mtimeMs + 2_000));
  await assert.rejects(secondCapability.revalidate(), /GKX_EVAL_CLI_FIXTURE_CHANGED/u);
});

test("fixture capability rejects mode, hard-link, leaf-case, and alias substitutions", async (t) => {
  if (process.platform !== "win32") {
    const modeRoot = await fixtureDirectory(t);
    await chmod(join(modeRoot, "fixed-provider.json"), 0o644);
    await assert.rejects(
      host.openRetrievalEvaluationFixtureCapability(join(modeRoot, "golden-fixture.toml"), ROOT),
      /GKX_EVAL_CLI_FIXTURE_MODE_INVALID/u,
    );
  }

  const hardRoot = await fixtureDirectory(t);
  const original = join(hardRoot, "ndcg-discount-table.json");
  const alias = join(hardRoot, "ndcg-hardlink.json");
  await link(original, alias);
  await assert.rejects(
    host.openRetrievalEvaluationFixtureCapability(join(hardRoot, "golden-fixture.toml"), ROOT),
    /GKX_EVAL_CLI_FIXTURE_FILE_INVALID/u,
  );

  if (process.platform === "win32") {
    const caseRoot = await fixtureDirectory(t);
    await assert.rejects(
      host.openRetrievalEvaluationFixtureCapability(join(caseRoot, "GOLDEN-FIXTURE.TOML"), ROOT),
      /GKX_EVAL_CLI_GOLDEN_BINDING_INVALID|GKX_EVAL_CLI_FIXTURE_NAME_INVALID/u,
    );

    const shortRoot = await fixtureDirectory(t);
    const longFixture = join(shortRoot, "golden-fixture.toml");
    const shortResult = await runProcess(process.env.ComSpec ?? "cmd.exe", [
      "/d", "/s", "/c", `for %I in ("${longFixture}") do @echo %~sI`,
    ], { windowsVerbatimArguments: true });
    assert.equal(shortResult.code, 0, shortResult.stderr);
    const shortFixture = shortResult.stdout.trim();
    assert.notEqual(shortFixture, longFixture, "qualification volume must expose a distinct 8.3 alias");
    assert.notEqual(shortFixture.toLowerCase(), longFixture.toLowerCase(), "8.3 alias is not a case-only spelling");
    const shortCapability = await host.openRetrievalEvaluationFixtureCapability(shortFixture, ROOT);
    await shortCapability.revalidate();
  }
});

test("source corpus JSON is parsed incrementally across UTF-8 chunks", async (t) => {
  const fixtureRoot = await fixtureDirectory(t);
  const sourcePath = join(fixtureRoot, "source-corpus.json");
  const source = await readFile(sourcePath);
  await writeFile(sourcePath, Buffer.concat([Buffer.alloc(70 * 1024, 0x20), source]));
  if (process.platform !== "win32") await chmod(sourcePath, 0o600);
  const capability = await host.openRetrievalEvaluationFixtureCapability(join(fixtureRoot, "golden-fixture.toml"), ROOT);
  assert.equal(capability.input.environment_bundle.source_corpus.source_corpus_digest,
    CONFORMANCE.fixture_files.source_corpus.digest);
  await capability.revalidate();
});

test("general fixture mode observes reviewed-bundle absence without fallback", async (t) => {
  const generalRow = row("general_execution_matrix", "general-active-eval");
  const generalRoot = await generalFixtureDirectory(t);
  const fixturePath = join(generalRoot, "golden-fixture.toml");
  const capability = await host.openRetrievalEvaluationFixtureCapability(fixturePath, ROOT);
  assert.equal(capability.input.reviewed_bundle, null);
  assert.equal(capability.input.execution_authority.reviewed_bundle_digest, null);
  await capability.revalidate();

  const tempParent = await privateDirectory(t, "gkx-evaluation-general-temp-");
  const result = await cli(["retrieval", "eval", "--fixture", fixturePath], {
    env: isolatedTempEnvironment(tempParent),
  });
  assert.equal(result.code, generalRow.expected_exit_code);
  assert.match(result.stdout, new RegExp(`^gkx retrieval eval\\nstatus: ${generalRow.expected_status}\\n`, "u"));
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "");
  assert.deepEqual(await readdir(tempParent), []);
});

test("optional provider and reviewed companions have exact object/null absence semantics", { timeout: 120_000 }, async (t) => {
  for (const item of CLI_FIXTURE.optional_companion_matrix) {
    row("optional_companion_matrix", item.case_id);
    const isProvider = item.companion === "fixed_provider";
    const root = isProvider && item.locator === "null"
      ? (await generalProviderScenarioFixture(t, "disabled")).root
      : await fixtureDirectory(t);
    const fixturePath = join(root, "golden-fixture.toml");
    const leaf = isProvider ? "fixed-provider.json" : "reviewed-bundle.json";
    const source = join(PACK, leaf);
    const target = join(root, leaf);

    if (item.locator === "object") {
      await unlink(target);
      await assert.rejects(
        host.openRetrievalEvaluationFixtureCapability(fixturePath, ROOT),
        (error) => error.message === item.expected_code,
        item.case_id,
      );
      continue;
    }
    if (!isProvider) {
      await rewriteConformance(root, (value) => { value.fixture_files.reviewed_bundle = null; });
      await unlink(target);
    }
    if (item.filesystem === "present") {
      await copyFile(source, target);
      if (process.platform !== "win32") await chmod(target, 0o600);
      await assert.rejects(
        host.openRetrievalEvaluationFixtureCapability(fixturePath, ROOT),
        (error) => error.message === item.expected_code,
        item.case_id,
      );
      continue;
    }
    const capability = await host.openRetrievalEvaluationFixtureCapability(fixturePath, ROOT);
    await copyFile(source, target);
    if (process.platform !== "win32") await chmod(target, 0o600);
    await assert.rejects(
      capability.revalidate(),
      (error) => error.message === item.expected_code,
      item.case_id,
    );
  }
});

test("general base-configuration mismatch is NEEDS_HUMAN before provider or query work", async (t) => {
  const evalRow = row("general_execution_matrix", "general-base-configuration-mismatch-eval");
  const tuneRow = row("general_execution_matrix", "general-base-configuration-mismatch-tune");
  const root = await generalFixtureDirectory(t);
  await rewriteConformance(root, (value) => {
    value.valid_envelopes.baseline = baselineWithNonTunableConfiguration(
      value.valid_envelopes.baseline,
      "phase4-substituted-offline-v1",
    );
  });
  const fixturePath = join(root, "golden-fixture.toml");
  const capability = await host.openRetrievalEvaluationFixtureCapability(fixturePath, ROOT);
  const stateRoot = await privateDirectory(t, "gkx-evaluation-base-mismatch-state-");
  const execution = await host.executeRetrievalEvaluationEval(capability.input, stateRoot);
  assert.equal(execution.comparison.status, evalRow.expected_status);
  assert.equal(execution.query_attempts.length, evalRow.expected_query_attempt_count);
  assert.deepEqual(await readdir(stateRoot), []);

  const tempParent = await privateDirectory(t, "gkx-evaluation-base-mismatch-temp-");
  const evalResult = await cli(["retrieval", "eval", "--fixture", fixturePath], {
    env: isolatedTempEnvironment(tempParent),
  });
  assert.equal(evalResult.code, evalRow.expected_exit_code);
  assert.match(evalResult.stdout, new RegExp(`^gkx retrieval eval\\nstatus: ${evalRow.expected_status}\\n`, "u"));
  assert.equal(evalResult.stderr, "");
  assert.deepEqual(await readdir(tempParent), []);

  const outputParent = await privateDirectory(t, "gkx-evaluation-base-mismatch-output-");
  const outputPath = join(outputParent, "candidate.toml");
  const tuneResult = await cli(["retrieval", "tune", "--fixture", fixturePath, "--output", outputPath], {
    env: isolatedTempEnvironment(tempParent),
  });
  assert.equal(tuneResult.code, tuneRow.expected_exit_code);
  assert.equal(tuneResult.stdout, CLI_FIXTURE.presentation.tune_needs_human);
  assert.equal(tuneResult.stderr, "");
  assert.deepEqual(await readdir(outputParent), []);
  assert.deepEqual(await readdir(tempParent), []);
});

test("general baseline cannot splice a different sealed environment coordinate", async (t) => {
  const item = row("general_execution_matrix", "general-baseline-environment-splice");
  const target = await generalProviderScenarioFixture(t, "embedding_failure");
  const donor = await generalProviderScenarioFixture(t, "reranker_failure");
  const donorConformance = JSON.parse(await readFile(join(donor.root, "conformance-fixture.json"), "utf8"));
  await rewriteConformance(target.root, (value) => {
    value.valid_envelopes.baseline = donorConformance.valid_envelopes.baseline;
  });
  const fixturePath = join(target.root, "golden-fixture.toml");
  await assert.rejects(
    host.openRetrievalEvaluationFixtureCapability(fixturePath, ROOT),
    (error) => error.message === item.expected_code,
  );
  const result = await cli(["retrieval", "eval", "--fixture", fixturePath]);
  assert.deepEqual(result, {
    code: item.expected_exit_code,
    signal: null,
    stdout: "",
    stderr: "gkx retrieval eval: invalid fixture\n",
  });
});

test("general eval axes must bind baseline before temporary state or provider work", async (t) => {
  const item = row("general_execution_matrix", "general-eval-axes-mismatch");
  const fixture = await generalProviderScenarioFixture(t, "eval_axes_mismatch");
  const fixturePath = join(fixture.root, "golden-fixture.toml");
  await assert.rejects(
    host.openRetrievalEvaluationFixtureCapability(fixturePath, ROOT),
    (error) => error.message === item.expected_code,
  );
  const tempParent = await privateDirectory(t, "gkx-evaluation-axes-mismatch-temp-");
  const result = await cli(["retrieval", "eval", "--fixture", fixturePath], {
    env: isolatedTempEnvironment(tempParent),
  });
  assert.deepEqual(result, {
    code: item.expected_exit_code,
    signal: null,
    stdout: "",
    stderr: "gkx retrieval eval: invalid fixture\n",
  });
  assert.deepEqual(await readdir(tempParent), []);
});

test("temporary capability seals a private child and detects identity replacement", async (t) => {
  const tempParent = await privateDirectory(t, "gkx-evaluation-temp-parent-");
  const saved = { TMP: process.env.TMP, TEMP: process.env.TEMP, TMPDIR: process.env.TMPDIR };
  Object.assign(process.env, { TMP: tempParent, TEMP: tempParent, TMPDIR: tempParent });
  try {
    const capability = await host.createRetrievalEvaluationTemporaryCapability();
    await capability.revalidate();
    assert.equal(dirname(capability.path), await realpath(tempParent));
    assert.match(capability.path, /gkx-retrieval-evaluation-[0-9a-f]{32}$/u);
    const displaced = `${capability.path}-displaced`;
    await rename(capability.path, displaced);
    await mkdir(capability.path, { mode: 0o700 });
    if (process.platform !== "win32") await chmod(capability.path, 0o700);
    await assert.rejects(capability.revalidate(), /GKX_EVAL_TEMP_CHILD_CHANGED/u);
    await rm(capability.path, { recursive: true, force: true });
    await rm(displaced, { recursive: true, force: true });
  } finally {
    for (const key of ["TMP", "TEMP", "TMPDIR"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test("POSIX fixture, temp, and output modes reject every special-bit widening", async (t) => {
  if (process.platform === "win32") return;
  const fixtureRoot = await fixtureDirectory(t);
  await chmod(fixtureRoot, 0o1700);
  await assert.rejects(
    host.openRetrievalEvaluationFixtureCapability(join(fixtureRoot, "golden-fixture.toml"), ROOT),
    /GKX_EVAL_CLI_FIXTURE_ROOT_INVALID/u,
  );

  const outputParent = await privateDirectory(t, "gkx-evaluation-output-mode-");
  await chmod(outputParent, 0o1700);
  await assert.rejects(
    host.openRetrievalEvaluationOutputCapability({
      output_path: join(outputParent, "candidate.toml"),
      current_directory: ROOT,
      protected_paths: [ROOT],
    }),
    /GKX_EVAL_OUTPUT_PARENT_INVALID/u,
  );

  const tempParent = await privateDirectory(t, "gkx-evaluation-temp-mode-");
  await chmod(tempParent, 0o1700);
  const saved = { TMP: process.env.TMP, TEMP: process.env.TEMP, TMPDIR: process.env.TMPDIR };
  Object.assign(process.env, { TMP: tempParent, TEMP: tempParent, TMPDIR: tempParent });
  try {
    await assert.rejects(host.createRetrievalEvaluationTemporaryCapability(), /GKX_EVAL_TEMP_PARENT_INVALID/u);
  } finally {
    for (const key of ["TMP", "TEMP", "TMPDIR"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test("POSIX root-owned sticky 01777 temp parent is accepted only through a sealed 0700 child", async (t) => {
  if (process.platform === "win32") return;
  const parent = resolve(tmpdir());
  const parentState = await lstat(parent, { bigint: true });
  if (parentState.uid !== 0n || Number(parentState.mode & 0o7777n) !== 0o1777) return;
  const saved = { TMP: process.env.TMP, TEMP: process.env.TEMP, TMPDIR: process.env.TMPDIR };
  Object.assign(process.env, { TMP: parent, TEMP: parent, TMPDIR: parent });
  try {
    const capability = await host.createRetrievalEvaluationTemporaryCapability();
    assert.equal(dirname(capability.path), parent);
    assert.equal(Number((await lstat(capability.path, { bigint: true })).mode & 0o7777n), 0o700);
    await capability.cleanup();
  } finally {
    for (const key of ["TMP", "TEMP", "TMPDIR"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test("output capability rejects protected-root containment in both directions", async (t) => {
  const fixtureRoot = await fixtureDirectory(t);
  await assert.rejects(
    host.openRetrievalEvaluationOutputCapability({
      output_path: join(fixtureRoot, "candidate.toml"),
      current_directory: ROOT,
      protected_paths: [fixtureRoot],
    }),
    /GKX_EVAL_OUTPUT_PROTECTED_ROOT_INVALID/u,
  );

  const outputParent = await privateDirectory(t, "gkx-evaluation-output-");
  const nestedProtected = join(outputParent, "protected");
  await mkdir(nestedProtected, { mode: 0o700 });
  if (process.platform !== "win32") await chmod(nestedProtected, 0o700);
  await assert.rejects(
    host.openRetrievalEvaluationOutputCapability({
      output_path: join(outputParent, "candidate.toml"),
      current_directory: ROOT,
      protected_paths: [nestedProtected],
    }),
    /GKX_EVAL_OUTPUT_PROTECTED_ROOT_INVALID/u,
  );
});

test("guarded candidate publication and every finite recovery state are exact", async (t) => {
  for (const item of CLI_FIXTURE.recovery_state_matrix) {
    row("recovery_state_matrix", item.case_id);
    const outputParent = await privateDirectory(t, `gkx-evaluation-recovery-${item.case_id}-`);
    const outputBasename = "candidate.toml";
    const finalPath = join(outputParent, outputBasename);
    const guardPath = join(outputParent, `.${outputBasename}.gkx-retrieval-tune.guard`);
    const guardStagingPath = join(outputParent, `.${outputBasename}.gkx-retrieval-tune.guard-stage`);
    const temporaryPath = join(outputParent, `.${outputBasename}.gkx-retrieval-tune.tmp`);
    const thirdPath = join(outputParent, `.${outputBasename}.third-link`);
    const guardData = await exactGuard(outputParent, outputBasename,
      item.case_id === "guard-coordinate-mismatch" || item.guard_staging === "coordinate_mismatch"
        ? { execution_authority_digest: `sha256:${"0".repeat(64)}` } : {});

    if (item.guard_staging === "partial") await writePrivate(guardStagingPath, Buffer.from('{"contract_version":', "utf8"));
    else if (item.guard_staging === "bad_digest") {
      await writePrivate(guardStagingPath, Buffer.from(`${retrieval.stableJson({
        ...guardData.guard,
        guard_digest: `sha256:${"0".repeat(64)}`,
      })}\n`, "utf8"));
    } else if (item.guard_staging) await writePrivate(guardStagingPath, guardData.guard_bytes);
    if (item.guard && item.guard_staging === "linked") await link(guardStagingPath, guardPath);
    else if (item.guard) await writePrivate(guardPath,
      item.guard_content === "partial" ? Buffer.from("partial\n", "utf8") : guardData.guard_bytes);
    if (item.temporary) await writePrivate(temporaryPath,
      item.temporary_content === "partial" ? Buffer.from("partial\n", "utf8") : guardData.candidate_bytes);
    if (item.final) {
      if (item.temporary) await link(temporaryPath, finalPath);
      else await writePrivate(finalPath, guardData.candidate_bytes);
    }
    if (item.case_id === "third-link") await link(temporaryPath, thirdPath);
    if (item.case_id === "guard-stage-third-link") await link(guardStagingPath, thirdPath);

    let capability;
    if (item.expected === "exists" || item.case_id === "orphan-temporary") {
      await assert.rejects(
        host.openRetrievalEvaluationOutputCapability({
          output_path: finalPath,
          current_directory: ROOT,
          protected_paths: [ROOT],
        }),
        item.expected === "exists" ? /GKX_EVAL_OUTPUT_ALREADY_EXISTS/u : /GKX_EVAL_OUTPUT_RECOVERY_STATE_INVALID/u,
        item.case_id,
      );
      continue;
    }

    capability = await host.openRetrievalEvaluationOutputCapability({
      output_path: finalPath,
      current_directory: ROOT,
      protected_paths: [ROOT],
    });
    if (item.expected === "operational") {
      await assert.rejects(
        publishInput(capability),
        item.expected_code
          ? (error) => error.message === item.expected_code
          : item.case_id === "guard-coordinate-mismatch"
            ? /GKX_EVAL_OUTPUT_GUARD_COORDINATE_MISMATCH/u
          : /GKX_EVAL_OUTPUT_(?:GUARD_INVALID|LINK_PAIR_INVALID|RECOVERY_STATE_INVALID)/u,
        item.case_id,
      );
      const evidencePath = item.guard_staging && !item.guard ? guardStagingPath : guardPath;
      assert.equal((await lstat(evidencePath)).isFile(), true, item.case_id);
      if (["guard-stage-eexist-race", "guard-stage-ambiguous-link-race"].includes(item.case_id)) {
        assert.deepEqual(await readFile(guardPath),
          item.guard_content === "partial" ? Buffer.from("partial\n", "utf8") : guardData.guard_bytes,
          item.case_id);
        assert.deepEqual(await readFile(guardStagingPath), guardData.guard_bytes, item.case_id);
        const guardIdentity = await lstat(guardPath, { bigint: true });
        const stagingIdentity = await lstat(guardStagingPath, { bigint: true });
        assert.notEqual(guardIdentity.ino, stagingIdentity.ino, item.case_id);
        assert.equal(guardIdentity.nlink, 1n, item.case_id);
        assert.equal(stagingIdentity.nlink, 1n, item.case_id);
      }
      continue;
    }

    await publishInput(capability);
    assert.deepEqual(await readFile(finalPath), guardData.candidate_bytes, item.case_id);
    assert.equal((await lstat(finalPath, { bigint: true })).nlink, 1n, item.case_id);
    await assert.rejects(lstat(guardPath), { code: "ENOENT" }, item.case_id);
    await assert.rejects(lstat(guardStagingPath), { code: "ENOENT" }, item.case_id);
    await assert.rejects(lstat(temporaryPath), { code: "ENOENT" }, item.case_id);
  }
});

test("guard and candidate substitutions fail with one exact finite code and retain evidence", async (t) => {
  for (const item of CLI_FIXTURE.guard_mutation_matrix) {
    row("guard_mutation_matrix", item.case_id);
    const outputParent = await privateDirectory(t, `gkx-evaluation-guard-${item.case_id}-`);
    const outputBasename = "candidate.toml";
    const finalPath = join(outputParent, outputBasename);
    const guardPath = join(outputParent, `.${outputBasename}.gkx-retrieval-tune.guard`);
    const temporaryPath = join(outputParent, `.${outputBasename}.gkx-retrieval-tune.tmp`);
    const override = item.mutation === "output_basename" ? { output_basename: "substituted.toml" }
      : item.mutation === "output_parent_inode" ? { output_parent_inode: "0" }
      : item.mutation === "tune_selection_digest" ? { tune_selection_digest: `sha256:${"0".repeat(64)}` }
      : item.mutation === "candidate_toml_digest" ? { candidate_toml_digest: `sha256:${"0".repeat(64)}` }
      : {};
    const data = await exactGuard(outputParent, outputBasename, override);

    if (item.mutation === "owner_nonce") {
      assert.throws(
        () => host.sealRetrievalEvaluationOutputGuard({ ...data.guard, owner_nonce: "bad" }),
        (error) => error.message === item.expected_code,
        item.case_id,
      );
      continue;
    }
    if (item.mutation === "guard_digest") {
      assert.throws(
        () => host.sealRetrievalEvaluationOutputGuard({ ...data.guard, guard_digest: `sha256:${"0".repeat(64)}` }),
        (error) => error.message === item.expected_code,
        item.case_id,
      );
      continue;
    }

    const bytes = item.mutation === "noncanonical_bytes"
      ? Buffer.from(`${JSON.stringify(data.guard, null, 2)}\n`, "utf8")
      : data.guard_bytes;
    await writePrivate(guardPath, bytes);
    if (item.mutation === "final_bytes") await writePrivate(finalPath, Buffer.from("wrong\n", "utf8"));
    else await writePrivate(temporaryPath, item.mutation === "temporary_bytes" ? Buffer.from("wrong\n", "utf8") : data.candidate_bytes);
    const capability = await host.openRetrievalEvaluationOutputCapability({
      output_path: finalPath,
      current_directory: ROOT,
      protected_paths: [ROOT],
    });
    await assert.rejects(
      publishInput(capability),
      (error) => error.message === item.expected_code,
      item.case_id,
    );
    assert.equal((await lstat(guardPath)).isFile(), true, item.case_id);
  }
});

test("CLI error classes emit no stdout and one exact stderr line", async (t) => {
  const fixtureRoot = await fixtureDirectory(t);
  const fixturePath = join(fixtureRoot, "golden-fixture.toml");
  const outputParent = await privateDirectory(t, "gkx-evaluation-errors-output-");
  const tempParent = await privateDirectory(t, "gkx-evaluation-errors-temp-");
  const invalidTemp = join(tempParent, "missing-parent");
  const existingOutput = join(outputParent, "existing.toml");
  await writePrivate(existingOutput, Buffer.from("existing\n", "utf8"));

  const invocations = new Map([
    ["invalid-arguments-eval", { args: ["retrieval", "eval"], env: process.env }],
    ["invalid-arguments-tune", { args: ["retrieval", "tune", "--fixture", fixturePath], env: process.env }],
    ["invalid-fixture", { args: ["retrieval", "eval", "--fixture", join(fixtureRoot, "missing.toml")], env: process.env }],
    ["output-exists", {
      args: ["retrieval", "tune", "--fixture", fixturePath, "--output", existingOutput],
      env: isolatedTempEnvironment(tempParent),
    }],
    ["operational-eval", {
      args: ["retrieval", "eval", "--fixture", fixturePath],
      env: isolatedTempEnvironment(invalidTemp),
    }],
    ["operational-tune", {
      args: ["retrieval", "tune", "--fixture", fixturePath, "--output", join(outputParent, "candidate.toml")],
      env: isolatedTempEnvironment(invalidTemp),
    }],
  ]);
  for (const item of CLI_FIXTURE.error_matrix) {
    row("error_matrix", item.case_id);
    const invocation = invocations.get(item.case_id);
    assert.ok(invocation, item.case_id);
    const result = await cli(invocation.args, { env: invocation.env });
    assert.equal(result.code, item.exit_code, item.case_id);
    assert.equal(result.signal, null, item.case_id);
    assert.equal(result.stdout, "", item.case_id);
    assert.equal(result.stderr, `gkx retrieval ${item.command}: ${item.message}\n`, item.case_id);
  }
});

test("actual coordinator eval replay emits exact text and pretty canonical JSON offline", { timeout: 120_000 }, async (t) => {
  const reviewedRow = row("general_execution_matrix", "reviewed-active-eval");
  const fixtureRoot = await fixtureDirectory(t);
  const fixturePath = join(fixtureRoot, "golden-fixture.toml");
  const tempParent = await privateDirectory(t, "gkx-evaluation-eval-temp-");
  const environment = isolatedTempEnvironment(tempParent);

  const capability = await host.openRetrievalEvaluationFixtureCapability(fixturePath, ROOT);
  assert.equal(Object.keys(capability.input.execution_authority).length, 17);
  assert.equal(capability.input.execution_authority.scan_presentation_contract_version,
    host.RETRIEVAL_EVALUATION_SCAN_PRESENTATION_VERSION);
  assert.equal(capability.input.execution_authority.scan_presentation_fts5_available, true);
  for (const [field, value] of [
    ["scan_presentation_contract_version", "gkos-retrieval-evaluation-scan-presentation/invalid"],
    ["scan_presentation_fts5_available", false],
  ]) {
    const { execution_authority_digest: _digest, ...material } = capability.input.execution_authority;
    material[field] = value;
    assert.throws(() => host.sealRetrievalEvaluationExecutionAuthority({
      ...material,
      execution_authority_digest: retrieval.retrievalCanonicalDigest(material),
    }), /GKX_EVAL_EXECUTION_AUTHORITY_INVALID/u);
  }
  assert.doesNotThrow(() => host.preflightRetrievalEvaluationHostCapabilitiesWithPhysicalForTest(
    capability.input, "eval", false,
  ));
  assert.doesNotThrow(() => host.preflightRetrievalEvaluationHostCapabilitiesWithPhysicalForTest(
    capability.input, "eval", true,
  ));
  const replayState = await privateDirectory(t, "gkx-evaluation-reviewed-replay-");
  const replay = await host.executeRetrievalEvaluationEval(capability.input, replayState);
  for (const attempt of replay.query_attempts) {
    assert.equal(attempt.result.stages.lexical.kind, "sqlite_lexical_scan");
    assert.deepEqual(attempt.result.stages.lexical.reason_codes, [
      "SQLITE_LEXICAL_SCAN_ACTIVE", "SQLITE_LEXICAL_SCAN_APPROXIMATION",
    ]);
  }
  await assertLexicalScanDatabases(replayState);
  assert.equal(replay.reviewed_absent_query_attempts.length, reviewedRow.expected_absent_query_count);
  const absent = replay.reviewed_absent_query_attempts[0];
  assert.equal(absent.query_id, reviewedRow.expected_absent_query_id);
  assert.equal(absent.metrics.query_metrics_digest, reviewedRow.expected_absent_query_metrics_digest);
  assert.equal(absent.counters.counter_digest, reviewedRow.expected_absent_counter_digest);
  const absentPublicView = {
    contract_version: "gkos-retrieval-evaluation-public-view/1.0.0-draft.1",
    query_digest: absent.result.query_digest,
    hits: absent.result.hits,
    confidence: absent.result.confidence,
    temporal: absent.result.temporal,
    applied_filters: absent.result.applied_filters,
    eligible_result_count: absent.result.eligible_result_count,
    stages: absent.result.stages,
  };
  assert.equal(retrieval.retrievalCanonicalDigest(absentPublicView), reviewedRow.expected_absent_public_view_digest);

  const text = await cli(["retrieval", "eval", "--fixture", fixturePath], { env: environment });
  assert.deepEqual(text, {
    code: reviewedRow.expected_exit_code, signal: null, stdout: CLI_FIXTURE.presentation.eval_text, stderr: "",
  });
  assert.deepEqual(await readdir(tempParent), []);

  const json = await cli(["retrieval", "eval", "--fixture", fixturePath, "--json"], { env: environment });
  assert.deepEqual(json, { code: 0, signal: null, stdout: CLI_FIXTURE.presentation.eval_json, stderr: "" });
  assert.deepEqual(await readdir(tempParent), []);
});

test("general provider-role combinations and failures execute actual coordinator stages and counters", { timeout: 240_000 }, async (t) => {
  const cases = new Map([
    ["disabled", "general-disabled-eval"],
    ["reranker_only", "general-reranker-only-eval"],
    ["embedding_only", "general-embedding-only-eval"],
    ["embedding_failure", "general-embedding-query-failure-eval"],
    ["reranker_failure", "general-reranker-failure-eval"],
  ]);
  for (const [kind, caseId] of cases) {
    const expected = row("general_execution_matrix", caseId);
    const fixture = await generalProviderScenarioFixture(t, kind);
    const fixturePath = join(fixture.root, "golden-fixture.toml");
    const capability = await host.openRetrievalEvaluationFixtureCapability(fixturePath, ROOT);
    assert.equal(capability.input.reviewed_bundle, null, kind);
    if (kind === "disabled" && !PHYSICAL_FTS5_AVAILABLE) {
      assert.equal(expected.requires_physical_fts5, true);
      assert.throws(
        () => host.preflightRetrievalEvaluationHostCapabilitiesWithPhysicalForTest(capability.input, "eval", false),
        (error) => error.message === expected.unavailable_expected_code,
      );
      assert.doesNotThrow(() => host.preflightRetrievalEvaluationHostCapabilitiesWithPhysicalForTest(
        capability.input, "eval", true,
      ));
      const stateRoot = await privateDirectory(t, "gkx-evaluation-disabled-unavailable-state-");
      await assert.rejects(
        host.executeRetrievalEvaluationEval(capability.input, stateRoot),
        (error) => error.message === expected.unavailable_expected_code,
      );
      assert.equal((await readdir(stateRoot)).length, expected.unavailable_expected_state_entry_count);
      const tempParent = await privateDirectory(t, "gkx-evaluation-disabled-unavailable-temp-");
      const cliResult = await cli(["retrieval", "eval", "--fixture", fixturePath], {
        env: isolatedTempEnvironment(tempParent),
      });
      assert.deepEqual(cliResult, {
        code: expected.unavailable_expected_exit_code,
        signal: null,
        stdout: expected.unavailable_expected_stdout,
        stderr: expected.unavailable_expected_stderr,
      });
      assert.equal((await readdir(tempParent)).length, expected.unavailable_expected_state_entry_count);
      continue;
    }
    const stateRoot = await privateDirectory(t, `gkx-evaluation-${kind}-state-`);
    const execution = await host.executeRetrievalEvaluationEval(capability.input, stateRoot);
    assert.equal(execution.query_attempts.length, 1, kind);
    const attempt = execution.query_attempts[0];
    assert.equal(capability.input.baseline.query_count, expected.query_count, kind);
    if (expected.authored_query_text !== undefined) {
      assert.equal(capability.input.baseline.normalized_golden.queries[0].text, expected.authored_query_text, kind);
    }
    assert.deepEqual(attempt.result.stages.vector, expected.expected_vector_stage, `${kind}:vector`);
    assert.deepEqual(attempt.result.stages.reranker, expected.expected_reranker_stage, `${kind}:reranker`);
    assert.deepEqual(attempt.counters, expected.expected_counters, `${kind}:counters`);
    if (capability.input.baseline.environment_set.members[0].environment.lexical_backend === "sqlite_lexical_scan") {
      assert.deepEqual(attempt.result.stages.lexical, {
        kind: "sqlite_lexical_scan",
        state: "degraded",
        reason_codes: ["SQLITE_LEXICAL_SCAN_ACTIVE", "SQLITE_LEXICAL_SCAN_APPROXIMATION"],
      }, `${kind}:lexical scan presentation`);
      await assertLexicalScanDatabases(stateRoot);
    }

    const tempParent = await privateDirectory(t, `gkx-evaluation-${kind}-cli-`);
    const cliResult = await cli(["retrieval", "eval", "--fixture", fixturePath], {
      env: isolatedTempEnvironment(tempParent),
    });
    assert.deepEqual(cliResult, {
      code: expected.expected_exit_code,
      signal: null,
      stdout: host.retrievalEvaluationEvalPresentation(execution.comparison, false).stdout,
      stderr: "",
    }, `${kind}:CLI eval`);
    assert.equal(execution.comparison.status, expected.expected_status, `${kind}:comparison`);
  }

  const tuneRow = row("general_execution_matrix", "general-disabled-tune");
  const disabled = await generalProviderScenarioFixture(t, "disabled");
  const fixturePath = join(disabled.root, "golden-fixture.toml");
  const tempParent = await privateDirectory(t, "gkx-evaluation-disabled-tune-temp-");
  const outputParent = await privateDirectory(t, "gkx-evaluation-disabled-tune-output-");
  const outputPath = join(outputParent, "candidate.toml");
  const tune = await cli(["retrieval", "tune", "--fixture", fixturePath, "--output", outputPath], {
    env: isolatedTempEnvironment(tempParent),
  });
  if (!PHYSICAL_FTS5_AVAILABLE) {
    assert.equal(tuneRow.requires_physical_fts5, true);
    const capability = await host.openRetrievalEvaluationFixtureCapability(fixturePath, ROOT);
    assert.throws(
      () => host.preflightRetrievalEvaluationHostCapabilitiesWithPhysicalForTest(capability.input, "tune", false),
      (error) => error.message === tuneRow.unavailable_expected_code,
    );
    assert.doesNotThrow(() => host.preflightRetrievalEvaluationHostCapabilitiesWithPhysicalForTest(
      capability.input, "tune", true,
    ));
    const stateRoot = await privateDirectory(t, "gkx-evaluation-disabled-tune-unavailable-state-");
    await assert.rejects(
      host.executeRetrievalEvaluationTune(capability.input, stateRoot),
      (error) => error.message === tuneRow.unavailable_expected_code,
    );
    assert.equal((await readdir(stateRoot)).length, tuneRow.unavailable_expected_state_entry_count);
    assert.deepEqual(tune, {
      code: tuneRow.unavailable_expected_exit_code,
      signal: null,
      stdout: tuneRow.unavailable_expected_stdout,
      stderr: tuneRow.unavailable_expected_stderr,
    });
    assert.equal((await readdir(outputParent)).length, tuneRow.unavailable_expected_output_entry_count);
    assert.equal((await readdir(tempParent)).length, tuneRow.unavailable_expected_state_entry_count);
  } else {
    assert.equal(tune.code, tuneRow.expected_exit_code);
    assert.match(tune.stdout, new RegExp(`^gkx retrieval tune\\nstatus: ${tuneRow.expected_status}\\n`, "u"));
    assert.match(tune.stdout,
      new RegExp(`evaluated_candidate_count: ${tuneRow.evaluated_candidate_count}\\n`, "u"));
    assert.match(tune.stdout,
      new RegExp(`query_evaluation_count: ${tuneRow.query_evaluation_count}\\n`, "u"));
    assert.equal(tune.stderr, "");
    assert.deepEqual(await readdir(outputParent), ["candidate.toml"]);
    assert.deepEqual(await readdir(tempParent), []);
  }

  const mixedTuneRow = row("general_execution_matrix", "general-reranker-only-tune");
  const mixed = await generalProviderScenarioFixture(t, "reranker_only");
  const mixedTempParent = await privateDirectory(t, "gkx-evaluation-reranker-only-tune-temp-");
  const mixedOutputParent = await privateDirectory(t, "gkx-evaluation-reranker-only-tune-output-");
  const mixedOutputPath = join(mixedOutputParent, "candidate.toml");
  const mixedTune = await cli([
    "retrieval", "tune", "--fixture", join(mixed.root, "golden-fixture.toml"), "--output", mixedOutputPath,
  ], { env: isolatedTempEnvironment(mixedTempParent) });
  assert.equal(mixedTune.code, mixedTuneRow.expected_exit_code);
  assert.match(mixedTune.stdout, new RegExp(`^gkx retrieval tune\\nstatus: ${mixedTuneRow.expected_status}\\n`, "u"));
  assert.match(mixedTune.stdout,
    new RegExp(`evaluated_candidate_count: ${mixedTuneRow.evaluated_candidate_count}\\n`, "u"));
  assert.match(mixedTune.stdout,
    new RegExp(`query_evaluation_count: ${mixedTuneRow.query_evaluation_count}\\n`, "u"));
  assert.equal(mixedTune.stderr, "");
  assert.deepEqual(await readdir(mixedOutputParent), ["candidate.toml"]);
  assert.deepEqual(await readdir(mixedTempParent), []);
});

test("actual exhaustive tune replay publishes one durable exact candidate and no sidecars", { timeout: 360_000 }, async (t) => {
  const reviewedTuneRow = row("general_execution_matrix", "reviewed-active-tune");
  const fixtureRoot = await fixtureDirectory(t);
  const fixturePath = join(fixtureRoot, "golden-fixture.toml");
  const tempParent = await privateDirectory(t, "gkx-evaluation-tune-temp-");
  const outputParent = await privateDirectory(t, "gkx-evaluation-tune-output-");
  const outputPath = join(outputParent, "candidate.toml");
  const result = await cli(
    ["retrieval", "tune", "--fixture", fixturePath, "--output", outputPath],
    { env: isolatedTempEnvironment(tempParent) },
  );
  assert.deepEqual(result, {
    code: reviewedTuneRow.expected_exit_code, signal: null, stdout: CLI_FIXTURE.presentation.tune_proposed, stderr: "",
  });
  assert.match(result.stdout, new RegExp(`evaluated_candidate_count: ${reviewedTuneRow.evaluated_candidate_count}\\n`, "u"));
  assert.match(result.stdout, new RegExp(`query_evaluation_count: ${reviewedTuneRow.query_evaluation_count}\\n`, "u"));
  assert.equal(await readFile(outputPath, "utf8"), CLI_FIXTURE.presentation.candidate_toml);
  assert.deepEqual((await readdir(outputParent)).sort(), ["candidate.toml"]);
  assert.deepEqual(await readdir(tempParent), []);
});

test("public package, runtime subpaths, and declarations remain closed over all Slice-B authority", async (t) => {
  const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  for (const forbidden of [
    "./retrieval-evaluation-host", "./retrieval/evaluation-host", "./retrieval/evaluation-executor",
    "./retrieval/evaluation-capability", "./retrieval/evaluation-output", "./retrieval/evaluation-presentation",
  ]) assert.equal(Object.hasOwn(packageJson.exports, forbidden), false, forbidden);
  for (const name of [
    "executeRetrievalEvaluationEval", "executeRetrievalEvaluationTune", "openRetrievalEvaluationFixtureCapability",
    "createRetrievalEvaluationTemporaryCapability", "openRetrievalEvaluationOutputCapability",
    "renderRetrievalEvaluationCandidateToml", "retrievalEvaluationTunePresentation",
  ]) assert.equal(Object.hasOwn(retrieval, name), false, name);

  await assert.rejects(
    import("gkos-engine/retrieval-evaluation-host"),
    (error) => error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
  );
  const declarations = await readFile(join(ROOT, "dist", "retrieval", "index.d.ts"), "utf8");
  for (const name of [
    "executeRetrievalEvaluationEval", "executeRetrievalEvaluationTune", "openRetrievalEvaluationOutputCapability",
  ]) assert.equal(declarations.includes(name), false, name);

  const compileRoot = await mkdtemp(join(ROOT, ".gkx-evaluation-public-closure-"));
  t.after(() => rm(compileRoot, { recursive: true, force: true }));
  const source = join(compileRoot, "forbidden.ts");
  await writeFile(source, 'import { executeRetrievalEvaluationTune } from "gkos-engine/retrieval-evaluation-host";\nvoid executeRetrievalEvaluationTune;\n');
  const tsc = join(ROOT, "node_modules", "typescript", "bin", "tsc");
  const compile = await runProcess(process.execPath, [
    tsc, "--noEmit", "--skipLibCheck", "--target", "ES2020", "--module", "ESNext",
    "--moduleResolution", "bundler", source,
  ]);
  assert.notEqual(compile.code, 0);
  assert.match(`${compile.stdout}${compile.stderr}`, /TS2307|Cannot find module/u);
});
