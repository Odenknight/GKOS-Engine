import { readFileSync, writeFileSync } from "node:fs";
import * as retrieval from "../dist/retrieval.mjs";
import * as retrievalHost from "../dist/retrieval-host.mjs";
import * as evaluationHost from "../dist/retrieval-evaluation-host.mjs";

const PACK = new URL("../contracts/retrieval/gkos-retrieval-evaluation-1.0.0-draft.1/", import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(new URL(name, PACK), "utf8"));
const writeJson = (name, value) => writeFileSync(new URL(name, PACK), `${JSON.stringify(value, null, 2)}\n`, "utf8");
const clone = structuredClone;
const digest = retrieval.retrievalCanonicalDigest;
const sha = retrieval.retrievalSha256;
const SOURCE_CORPUS_VERSION = "gkos-retrieval-evaluation-source-corpus/1.0.0-draft.1";
const SOURCE_SNAPSHOT_VERSION = "gkos-retrieval-evaluation-source-snapshot/1.0.0-draft.1";
const RUNTIME_POLICY_VERSION = "gkos-retrieval-evaluation-runtime-policy-inputs/1.0.0-draft.1";
const PROVIDER_MATRIX_VERSION = "gkos-retrieval-evaluation-provider-occurrence-matrix/1.0.0-draft.1";
const PROVIDER_REQUEST_VERSION = "gkos-retrieval-evaluation-provider-request/1.0.0-draft.1";
const QUERY_SET_VERSION = "gkos-retrieval-evaluation-query-metrics-set/1.0.0-draft.1";
const METRIC_VERSION = "gkos-retrieval-evaluation-metrics/1.0.0-draft.1";
const EVALUATION_COORDINATE_VERSION = "gkos-retrieval-evaluation-evaluation-coordinate/1.0.0-draft.1";

function reseal(record, field) {
  const material = { ...record };
  delete material[field];
  return { ...material, [field]: digest(material) };
}

function note(uid, title, createdAt, sensitivity, body, extraFrontmatter = "") {
  return `---\ngkx_version: "2.3"\nuid: "${uid}"\ntitle: "${title}"\ntype: "policy"\ncreated_at: "${createdAt}"\nepistemic_state: "reported"\nsensitivity: "${sensitivity}"\n${extraFrontmatter}---\n# ${title}\n${body}\n`;
}

const sourceSpecs = [
  {
    vault_fixture: "retrieval-basic-v1",
    source_id: "019b2d14-4230-7db7-87d4-7d81cfaec932",
    source_path: "policy/agent-writing.md",
    created_at: "2026-07-01T00:00:00Z",
    discoverable: true,
    content: note(
      "019b2d14-4230-7db7-87d4-7d81cfaec932",
      "Agent Writing Policy",
      "2026-07-01T00:00:00Z",
      "public",
      "Agent-created notes require governed authorization, human review, exact source integrity, fresh citations, conflict handling, lineage checks, and a bounded publication decision. Hidden material must never influence an authorized result.",
    ),
  },
  {
    vault_fixture: "retrieval-basic-v1",
    source_id: "019b2d14-4230-7db7-87d4-7d81cfaec999",
    source_path: "private/hidden-secret.md",
    created_at: "2026-07-01T00:00:00Z",
    discoverable: false,
    content: note(
      "019b2d14-4230-7db7-87d4-7d81cfaec999",
      "Hidden Secret Fixture",
      "2026-07-01T00:00:00Z",
      "secret",
      "HIDDEN_SECRET_FIXTURE_TOKEN. This sealed source is intentionally forbidden and must never appear in public results, provider candidate inputs, citations, counts, confidence, or ranking signals.",
    ),
  },
  {
    vault_fixture: "retrieval-temporal-v1",
    source_id: "019b2d14-4230-7db7-87d4-7d81cfaec933",
    source_path: "policy/historical.md",
    created_at: "2026-07-01T00:00:00Z",
    discoverable: true,
    content: note(
      "019b2d14-4230-7db7-87d4-7d81cfaec933",
      "Historical Policy",
      "2026-07-01T00:00:00Z",
      "public",
      "At the 2026-08-01 cutoff this historical policy is the authorized active version. Point-in-time selection uses half-open validity, excludes future and unknown-validity versions, and keeps citation, predecessor, successor, temporal-coverage, and freshness evidence exact.",
    ),
  },
  {
    vault_fixture: "retrieval-temporal-v1",
    source_id: "019b2d14-4230-7db7-87d4-7d81cfaec934",
    source_path: "policy/successor.markdown",
    created_at: "2026-09-01T00:00:00Z",
    discoverable: true,
    content: note(
      "019b2d14-4230-7db7-87d4-7d81cfaec934",
      "Successor Policy",
      "2026-09-01T00:00:00Z",
      "public",
      "At and after the 2026-09-01 half-open boundary this successor policy is the authorized active version. Before that instant it is future material and cannot enter query candidates, reranking, results, citations, confidence, or query-scoped counters.",
      "supersedes:\n  - \"019b2d14-4230-7db7-87d4-7d81cfaec933\"\n",
    ),
  },
];

const derivedByVault = new Map();
const projectionByVault = new Map();
for (const vault of [...new Set(sourceSpecs.map((source) => source.vault_fixture))]) {
  const scoped = sourceSpecs.filter((source) => source.vault_fixture === vault);
  const projection = evaluationHost.projectAuthoredGkxRetrievalCorpus(scoped.map((source) => ({
    relativePath: source.source_path,
    content: source.content,
    kind: "note",
  })));
  if (projection.rejections.length !== 0 || projection.sources.length !== scoped.length) {
    throw new Error(`${vault}: canonical projection rejected source corpus: ${JSON.stringify(projection.rejections)}`);
  }
  const sourceRows = projection.sources.map((projected) => {
    const spec = scoped.find((candidate) => candidate.source_path === projected.chunk_input.source_path);
    if (!spec || projected.chunk_input.source_id !== spec.source_id || projected.chunk_input.text !== spec.content) {
      throw new Error(`${vault}: canonical projection source binding mismatch`);
    }
    const chunks = retrieval.chunkMarkdown(projected.chunk_input);
    if (chunks.length < 1) throw new Error(`${vault}: source produced no chunks`);
    return { spec, projected, chunks };
  });
  derivedByVault.set(vault, sourceRows);
  projectionByVault.set(vault, projection);
}

const corpora = [...derivedByVault].map(([vault_fixture, rows]) => {
  const source_files = rows.map(({ spec }) => ({
    source_id: spec.source_id,
    source_path: spec.source_path,
    source_digest: sha(Buffer.from(spec.content, "utf8")),
    source_bytes_base64: Buffer.from(spec.content, "utf8").toString("base64"),
  })).sort((left, right) => retrieval.retrievalCodeUnitCompare(`${left.source_id}\0${left.source_path}`, `${right.source_id}\0${right.source_path}`));
  const material = { contract_version: SOURCE_CORPUS_VERSION, vault_fixture, source_files };
  return { vault_fixture, source_files, corpus_fixture_digest: digest(material) };
}).sort((left, right) => retrieval.retrievalCodeUnitCompare(left.vault_fixture, right.vault_fixture));
const sourceCorpusMaterial = { contract_version: SOURCE_CORPUS_VERSION, corpora };
const sourceCorpus = { ...sourceCorpusMaterial, source_corpus_digest: digest(sourceCorpusMaterial) };

const conformance = readJson("conformance-fixture.json");
const provider = readJson("fixed-provider.json");
const catalog = readJson("fixture-catalog.json");
const metricFixture = readJson("metric-computation-fixture.json");
const tunePriority = readJson("tune-priority-fixture.json");
provider.embedding_provider.provider_kind = "local_onnx";
provider.reranker_provider.provider_kind = "local_onnx";
for (const scenario of provider.scenarios) {
  scenario.environment_scope.embedding_role.provider_kind = scenario.environment_scope.embedding_role.state === "active" ? "local_onnx" : null;
  scenario.environment_scope.reranker_role.provider_kind = scenario.environment_scope.reranker_role.state === "active" ? "local_onnx" : null;
}
const golden = evaluationHost.parseRetrievalEvaluationGoldenToml(readFileSync(new URL("golden-fixture.toml", PACK), "utf8"));
conformance.golden.expected_normalized = golden;
const manifestByVault = new Map(conformance.valid_envelopes.projection_manifests.map((manifest) => [manifest.vault_id, manifest]));

const artifacts = new Map();
for (const entry of catalog.entries) {
  const rows = derivedByVault.get(entry.vault_fixture);
  const corpus = corpora.find((candidate) => candidate.vault_fixture === entry.vault_fixture);
  if (!rows || !corpus) throw new Error(`${entry.vault_fixture}: missing derived corpus`);
  const source_observations = corpus.source_files.map(({ source_id, source_path, source_digest }) => ({ source_id, source_path, source_digest }));
  const sourceSnapshotMaterial = { contract_version: SOURCE_SNAPSHOT_VERSION, source_observations };
  const source_snapshot = { ...sourceSnapshotMaterial, source_snapshot_digest: digest(sourceSnapshotMaterial) };
  const source_discoverability = rows.map(({ spec }) => ({
    source_id: spec.source_id,
    source_path: spec.source_path,
    discoverable: spec.discoverable,
  })).sort((left, right) => retrieval.retrievalCodeUnitCompare(retrieval.stableJson(left), retrieval.stableJson(right)));
  const chunk_discoverability = rows.flatMap(({ spec, chunks }) => chunks.map((chunk) => ({
    chunk_id: chunk.chunk_id,
    source_id: spec.source_id,
    discoverable: spec.discoverable,
  }))).sort((left, right) => retrieval.retrievalCodeUnitCompare(retrieval.stableJson(left), retrieval.stableJson(right)));
  const runtimePolicyMaterial = { contract_version: RUNTIME_POLICY_VERSION, source_discoverability, chunk_discoverability };
  const runtime_policy_inputs = { ...runtimePolicyMaterial, runtime_policy_inputs_digest: digest(runtimePolicyMaterial) };
  const authorizedChunks = rows.filter(({ spec }) => spec.discoverable).flatMap(({ chunks }) => chunks)
    .sort((left, right) => retrieval.retrievalCodeUnitCompare(left.chunk_id, right.chunk_id));
  const candidateChunks = rows.flatMap(({ projected, chunks }) => retrievalHost.bindGkxRetrievalCandidateChunks(projected.record_key, chunks));
  const candidateByPublicId = new Map(candidateChunks.map((candidate) => [candidate.chunk.chunk_id, candidate]));
  const candidateByKey = new Map(candidateChunks.map((candidate) => [candidate.candidate_chunk_key, candidate]));
  artifacts.set(entry.vault_fixture, { corpus, source_snapshot, runtime_policy_inputs, rows, authorizedChunks, candidateChunks, candidateByPublicId,
    candidateByKey, candidateDeclarations: projectionByVault.get(entry.vault_fixture).declarations });
}

function queryEligibleChunks(artifact, query) {
  const discoverableRows = artifact.rows.filter(({ spec }) => spec.discoverable);
  const discoverableKeys = new Set(discoverableRows.map(({ projected }) => projected.record_key));
  const view = evaluationHost.buildGkxRetrievalAuthorizedCandidateView(
    discoverableRows.map(({ projected }) => projected.candidate_source),
    artifact.candidateDeclarations.filter((declaration) => discoverableKeys.has(declaration.source_record_key)),
    artifact.candidateChunks.filter((candidate) => discoverableKeys.has(candidate.record_key)),
    query.as_of,
  );
  return view.eligible_candidate_chunk_keys.map((key) => artifact.candidateByKey.get(key))
    .filter(Boolean)
    .map((candidate) => candidate.chunk)
    .sort((left, right) => retrieval.retrievalCodeUnitCompare(left.chunk_id, right.chunk_id));
}

function rerankerRequestDigest(oracle, ordered_inputs) {
  return digest({
    contract_version: PROVIDER_REQUEST_VERSION,
    call_kind: "reranker_query",
    request_id: oracle.request_id,
    query_id: oracle.query_id,
    query_digest: oracle.query_digest,
    query_text: oracle.effective_query_text,
    ordered_inputs,
  });
}

function updateSchedule(schedule, scenario) {
  const axes = schedule.operation === "eval" ? [schedule.evaluation_axes] : schedule.eligible_tuning_axes;
  const orderedInputsByQuery = scenario.reranker_query_oracles.map((oracle) => oracle.candidate_score_universe.map((row) => ({
    candidate_chunk_id: row.candidate_chunk_id,
    input_digest: row.input_digest,
  })));
  const requestDigests = scenario.reranker_query_oracles.map((oracle, index) => rerankerRequestDigest(oracle, orderedInputsByQuery[index]));
  schedule.occurrence_matrix = axes.flatMap(() => schedule.query_partition.map((_, queryIndex) => [
    scenario.embedding_role === "active" ? 1 : 0,
    scenario.reranker_role === "active" ? requestDigests[queryIndex] : null,
    scenario.reranker_role === "active" ? orderedInputsByQuery[queryIndex].length : null,
  ]));
  const matrixMaterial = {
    contract_version: PROVIDER_MATRIX_VERSION,
    operation: schedule.operation,
    query_partition: schedule.query_partition,
    tuning_axes_digests: axes.map((axis) => axis.tuning_axes_digest),
    embedding_query_template_digests: schedule.query_partition.map((_, index) => scenario.embedding_query_templates[index]?.template_digest ?? null),
    reranker_query_oracle_digests: schedule.query_partition.map((_, index) => scenario.reranker_query_oracles[index]?.template_digest ?? null),
    occurrence_matrix: schedule.occurrence_matrix,
  };
  schedule.occurrence_matrix_digest = digest(matrixMaterial);
  schedule.reranker_oracle_coverage = scenario.reranker_query_oracles.map((oracle) => ({
    reranker_query_oracle_id: oracle.template_id,
    used_candidate_chunk_ids: axes.length === 0 ? [] : oracle.candidate_score_universe.map((row) => row.candidate_chunk_id),
  }));
  schedule.template_occurrences = [
    ...scenario.embedding_index_templates.map((template) => ({ template_id: template.template_id, occurrence_count: 1 })),
    ...scenario.embedding_query_templates.map((template) => ({
      template_id: template.template_id,
      occurrence_count: scenario.embedding_role === "active" ? axes.length : 0,
    })),
    ...scenario.reranker_query_oracles.map((oracle) => ({
      template_id: oracle.template_id,
      occurrence_count: scenario.reranker_role === "active" ? axes.length : 0,
    })),
  ];
  schedule.expected_provider_counters = {
    vector_provider_call_count: scenario.embedding_index_templates.length + schedule.occurrence_matrix.filter((cell) => cell[0] === 1).length,
    vector_provider_item_count: scenario.embedding_index_templates.reduce((sum, template) => sum + template.item_count, 0) +
      schedule.occurrence_matrix.filter((cell) => cell[0] === 1).length,
    rerank_provider_call_count: schedule.occurrence_matrix.filter((cell) => cell[1] !== null).length,
    rerank_provider_item_count: schedule.occurrence_matrix.reduce((sum, cell) => sum + (cell[2] ?? 0), 0),
  };
  return reseal(schedule, "schedule_digest");
}

for (const scenario of provider.scenarios) {
  const vault = scenario.environment_scope.vault_fixture;
  const artifact = artifacts.get(vault);
  const entry = catalog.entries.find((candidate) => candidate.vault_fixture === vault);
  const priorManifest = manifestByVault.get(vault);
  if (!artifact || !entry || !priorManifest) throw new Error(`${vault}: provider scope missing corpus`);
  const scopedQueries = golden.queries.filter((query) => query.vault_fixture === vault);
  if (scopedQueries.length < 1 || scenario.embedding_query_templates.length !== scopedQueries.length ||
      scenario.reranker_query_oracles.length !== scopedQueries.length) throw new Error(`${vault}: provider query partition mismatch`);
  scenario.environment_scope.normalized_golden_digest = golden.golden_digest;
  scenario.environment_scope.normalized_golden_query_count = golden.queries.length;
  scenario.environment_scope.corpus_fixture_digest = artifact.corpus.corpus_fixture_digest;
  scenario.environment_scope.source_snapshot_digest = artifact.source_snapshot.source_snapshot_digest;
  scenario.environment_scope.runtime_policy_inputs_digest = artifact.runtime_policy_inputs.runtime_policy_inputs_digest;
  scenario.environment_scope = reseal(scenario.environment_scope, "environment_scope_digest");
  const queryPartition = scopedQueries.map((query) => ({ query_id: query.id, query_digest: query.query_digest }));
  for (const schedule of [scenario.eval_schedule, scenario.tune_schedule].filter(Boolean)) {
    schedule.normalized_golden_digest = golden.golden_digest;
    schedule.query_partition = clone(queryPartition);
    schedule.query_count = queryPartition.length;
    const axisCount = schedule.operation === "eval" ? 1 : schedule.eligible_tuning_axes.length;
    schedule.query_evaluation_count = axisCount * queryPartition.length;
  }
  scenario.embedding_query_templates = scenario.embedding_query_templates.map((template, indexValue) => {
    const query = scopedQueries[indexValue];
    const effective = retrieval.retrievalEvaluationEffectiveQueryText(query.text);
    const inputDigest = sha(effective);
    const priorValues = template.responses[0]?.values_micros ?? (indexValue % 2 === 0 ? [1_000_000, 0] : [0, 1_000_000]);
    return reseal({
      ...template,
      query_id: query.id,
      query_digest: query.query_digest,
      effective_query_text: effective,
      query_input_digest: inputDigest,
      request_id: inputDigest,
      responses: [{ input_digest: inputDigest, accepted_chunk_id: null, values_micros: priorValues }],
    }, "template_digest");
  });
  const eligibleCandidates = artifact.authorizedChunks.map((chunk) => artifact.candidateByPublicId.get(chunk.chunk_id));
  if (eligibleCandidates.some((candidate) => !candidate)) throw new Error(`${vault}: eligible candidate binding missing`);
  const representativeByDigest = new Map();
  for (const candidate of eligibleCandidates) {
    if (!representativeByDigest.has(candidate.chunk.content_digest)) representativeByDigest.set(candidate.chunk.content_digest, candidate);
  }
  const representatives = [...representativeByDigest.values()].sort((left, right) =>
    retrieval.retrievalCodeUnitCompare(left.chunk.content_digest, right.chunk.content_digest));
  const batches = [];
  for (const candidate of representatives) {
    const prior = batches.at(-1);
    const bytes = Buffer.byteLength(candidate.chunk.text, "utf8");
    if (!prior || prior.length >= 32 || prior.bytes + bytes > 262_144) batches.push(Object.assign([candidate], { bytes }));
    else { prior.push(candidate); prior.bytes += bytes; }
  }
  scenario.embedding_index_templates = batches.map((batch, batchIndex) => {
    const inputs = batch.map((candidate) => ({
      accepted_chunk_id: candidate.chunk.chunk_id,
      input_digest: candidate.chunk.content_digest,
    }));
    const material = {
      template_id: `embedding-index-${String(batchIndex + 1).padStart(3, "0")}`,
      phase: "index",
      embedding_call_ordinal: batchIndex + 1,
      batch_offset: batches.slice(0, batchIndex).reduce((sum, prior) => sum + prior.length, 0),
      request_id: sha(`index\0${batches.slice(0, batchIndex).reduce((sum, prior) => sum + prior.length, 0)}\0${inputs.map((input) => input.input_digest).join("\0")}`),
      chunk_inputs: inputs,
      item_count: inputs.length,
      outcome: "success",
      responses: inputs.map((input, responseIndex) => ({
        input_digest: input.input_digest,
        accepted_chunk_id: input.accepted_chunk_id,
        values_micros: (batchIndex + responseIndex) % 2 === 0 ? [1_000_000, 0] : [0, 1_000_000],
      })),
      error_code: null,
      expected_vector_stage: { state: "active", reason_codes: [] },
    };
    return { ...material, template_digest: digest(material) };
  });
  scenario.reranker_query_oracles = scenario.reranker_query_oracles.map((oracle, indexValue) => {
    const query = scopedQueries[indexValue];
    const effective = retrieval.retrievalEvaluationEffectiveQueryText(query.text);
    const inputDigest = sha(effective);
    const universe = queryEligibleChunks(artifact, query).map((chunk, candidateIndex) => ({
      candidate_chunk_id: chunk.chunk_id,
      input_digest: chunk.content_digest,
      score_micros: 1_000_000 - candidateIndex,
    }));
    return reseal({
      ...oracle,
      query_id: query.id,
      query_digest: query.query_digest,
      effective_query_text: effective,
      query_input_digest: inputDigest,
      request_id: sha(`rerank\0${effective}`),
      candidate_score_universe: universe,
    }, "template_digest");
  });
  const responseByDigest = new Map(scenario.embedding_index_templates.flatMap((template) => template.responses)
    .map((response) => [response.input_digest, response]));
  const manifest = retrievalHost.deriveGkxRetrievalProjectionManifest({
    vault_id: vault,
    source_snapshot_digest: artifact.source_snapshot.source_snapshot_digest,
    configuration_digest: priorManifest.configuration_digest,
    policy_digest: artifact.runtime_policy_inputs.runtime_policy_inputs_digest,
    candidate_sources: artifact.rows.map(({ projected }) => projected.candidate_source),
    candidate_declarations: artifact.candidateDeclarations,
    candidate_chunks: artifact.candidateChunks,
    embedding_eligible_candidate_chunk_keys: eligibleCandidates.map((candidate) => candidate.candidate_chunk_key),
    vectors: eligibleCandidates.map((candidate) => ({
      candidate_chunk_key: candidate.candidate_chunk_key,
      vector: Array.from(Float32Array.from(responseByDigest.get(candidate.chunk.content_digest).values_micros, (part) => part / 1_000_000)),
    })),
    embedding_provider_id: provider.embedding_provider.provider_id,
    embedding_model_id: provider.embedding_provider.model_id,
    embedding_dimensions: provider.embedding_provider.dimensions,
  }, priorManifest.lexical_backend);
  artifact.manifest = manifest;
  delete entry.evaluation_audit_oracle.paired_absent_projection_id;
  delete entry.evaluation_audit_oracle.paired_absent_projection_digest;
  entry.evaluation_audit_oracle.authorized_source_ids = artifact.rows.filter(({ spec }) => spec.discoverable)
    .map(({ spec }) => spec.source_id).sort(retrieval.retrievalCodeUnitCompare);
  entry.evaluation_audit_oracle.authorized_source_paths = artifact.rows.filter(({ spec }) => spec.discoverable)
    .map(({ spec }) => spec.source_path).sort(retrieval.retrievalCodeUnitCompare);
  entry.evaluation_audit_oracle.forbidden_source_ids = artifact.rows.filter(({ spec }) => !spec.discoverable)
    .map(({ spec }) => spec.source_id).sort(retrieval.retrievalCodeUnitCompare);
  entry.evaluation_audit_oracle.forbidden_source_paths = artifact.rows.filter(({ spec }) => !spec.discoverable)
    .map(({ spec }) => spec.source_path).sort(retrieval.retrievalCodeUnitCompare);
  const discoverableRows = artifact.rows.filter(({ spec }) => spec.discoverable);
  const discoverableKeys = new Set(discoverableRows.map(({ projected }) => projected.record_key));
  const completeAuthorizedView = evaluationHost.buildGkxRetrievalAuthorizedCandidateView(
    discoverableRows.map(({ projected }) => projected.candidate_source),
    artifact.candidateDeclarations.filter((declaration) => discoverableKeys.has(declaration.source_record_key)),
    artifact.candidateChunks.filter((candidate) => discoverableKeys.has(candidate.record_key)),
    null,
  );
  entry.evaluation_audit_oracle.authorized_endpoint_ids = [...new Set(completeAuthorizedView.temporal_sources.flatMap((source) => [
    ...source.supersedes,
    ...source.superseded_by,
  ]))].sort(retrieval.retrievalCodeUnitCompare);
  entry.evaluation_audit_oracle.forbidden_endpoint_ids = [];
  entry.evaluation_audit_oracle = reseal(entry.evaluation_audit_oracle, "evaluation_audit_oracle_digest");
  scenario.environment_scope.evaluation_audit_oracle_digest = entry.evaluation_audit_oracle.evaluation_audit_oracle_digest;
  scenario.environment_scope.projection_id = manifest.projection_id;
  scenario.environment_scope.projection_digest = manifest.projection_digest;
  scenario.environment_scope = reseal(scenario.environment_scope, "environment_scope_digest");
  scenario.eval_schedule = updateSchedule(scenario.eval_schedule, scenario);
  scenario.tune_schedule = scenario.tune_schedule === null ? null : updateSchedule(scenario.tune_schedule, scenario);
  Object.assign(scenario, reseal(scenario, "scenario_digest"));
}
provider.scenarios.sort((left, right) => retrieval.retrievalCodeUnitCompare(
  left.environment_scope.environment_scope_digest,
  right.environment_scope.environment_scope_digest,
));
const sealedProvider = reseal(provider, "provider_fixture_digest");

for (const entry of catalog.entries) {
  const artifact = artifacts.get(entry.vault_fixture);
  entry.source_corpus_file = "source-corpus.json";
  entry.corpus_fixture_digest = artifact.corpus.corpus_fixture_digest;
  entry.source_snapshot = artifact.source_snapshot;
  entry.runtime_policy_inputs = artifact.runtime_policy_inputs;
  entry.fixed_provider_transcript_digest = sealedProvider.provider_fixture_digest;
  Object.assign(entry, reseal(entry, "entry_digest"));
}
const sealedCatalog = reseal(catalog, "catalog_digest");

for (const [vault, artifact] of artifacts) {
  const index = conformance.valid_envelopes.projection_manifests.findIndex((manifest) => manifest.vault_id === vault);
  conformance.valid_envelopes.projection_manifests[index] = artifact.manifest;
}

const environmentSet = conformance.valid_envelopes.environment_set;
environmentSet.normalized_golden_digest = golden.golden_digest;
environmentSet.query_count = golden.queries.length;
for (const member of environmentSet.members) {
  const environment = member.environment;
  const artifact = artifacts.get(environment.vault_fixture);
  const entry = sealedCatalog.entries.find((candidate) => candidate.vault_fixture === environment.vault_fixture);
  environment.normalized_golden_digest = golden.golden_digest;
  environment.fixture_catalog_digest = sealedCatalog.catalog_digest;
  environment.corpus_fixture_digest = artifact.corpus.corpus_fixture_digest;
  environment.source_snapshot_digest = artifact.source_snapshot.source_snapshot_digest;
  environment.runtime_policy_inputs_digest = artifact.runtime_policy_inputs.runtime_policy_inputs_digest;
  environment.evaluation_audit_oracle_digest = entry.evaluation_audit_oracle.evaluation_audit_oracle_digest;
  environment.projection_id = artifact.manifest.projection_id;
  environment.projection_digest = artifact.manifest.projection_digest;
  environment.embedding_role.provider_kind = environment.embedding_role.state === "active" ? "local_onnx" : null;
  environment.reranker_role.provider_kind = environment.reranker_role.state === "active" ? "local_onnx" : null;
  environment.embedding_role.fixed_provider_transcript_digest = sealedProvider.provider_fixture_digest;
  environment.reranker_role.fixed_provider_transcript_digest = sealedProvider.provider_fixture_digest;
  member.environment = reseal(environment, "environment_digest");
  member.query_partition = golden.queries.filter((query) => query.vault_fixture === environment.vault_fixture)
    .map((query) => ({ query_id: query.id, query_digest: query.query_digest }));
  member.query_count = member.query_partition.length;
  Object.assign(member, reseal(member, "member_digest"));
}
environmentSet.members.sort((left, right) => retrieval.retrievalCodeUnitCompare(left.environment.environment_digest, right.environment.environment_digest));
const sealedEnvironmentSet = reseal(environmentSet, "environment_set_digest");

const metricsSet = conformance.valid_envelopes.metrics_set;
metricsSet.normalized_golden_digest = golden.golden_digest;
metricsSet.query_count = golden.queries.length;
const envByVault = new Map(sealedEnvironmentSet.members.map((member) => [member.environment.vault_fixture, member.environment.environment_digest]));
const goldenById = new Map(golden.queries.map((query) => [query.id, query]));
const reviewedMetricByQueryId = new Map(metricFixture.cases.filter((row) => row.parity_group === "reviewed-24-query-set" && row.expected_status === "metrics")
  .map((row) => [row.input.query.id, row.expected_metrics]));
for (const row of metricsSet.query_evaluations) {
  const query = goldenById.get(row.query_metrics.query_id);
  if (!query) throw new Error(`metrics row has no normalized golden query: ${row.query_metrics.query_id}`);
  const reviewedMetrics = reviewedMetricByQueryId.get(query.id);
  if (!reviewedMetrics) throw new Error(`metrics row has no reviewed computation fixture: ${query.id}`);
  row.query_metrics = clone(reviewedMetrics);
  row.golden_query_digest = query.query_digest;
  row.environment_digest = envByVault.get(query.vault_fixture);
}
metricsSet.environment_set_digest = sealedEnvironmentSet.environment_set_digest;
metricsSet.query_metrics_set_digest = digest({
  contract_version: QUERY_SET_VERSION,
  environment_set_digest: sealedEnvironmentSet.environment_set_digest,
  query_count: metricsSet.query_evaluations.length,
  query_evaluations: metricsSet.query_evaluations.map((row) => ({
    environment_digest: row.environment_digest,
    golden_query_digest: row.golden_query_digest,
    query_metrics_digest: row.query_metrics.query_metrics_digest,
  })),
});
metricsSet.environment_aggregates = sealedEnvironmentSet.members.map((member) => {
  const rows = metricsSet.query_evaluations.filter((row) => row.environment_digest === member.environment.environment_digest);
  const query_metrics_set_digest = digest({
    contract_version: QUERY_SET_VERSION,
    environment_digest: member.environment.environment_digest,
    query_count: rows.length,
    query_evaluations: rows.map((row) => ({
      golden_query_digest: row.golden_query_digest,
      query_metrics_digest: row.query_metrics.query_metrics_digest,
    })),
  });
  const material = {
    environment_digest: member.environment.environment_digest,
    query_count: rows.length,
    query_metrics_set_digest,
    aggregate_metrics: retrieval.aggregateRetrievalEvaluationMetrics(rows.map((row) => row.query_metrics)),
  };
  return { ...material, environment_aggregate_digest: digest(material) };
});
metricsSet.aggregate_metrics = retrieval.aggregateRetrievalEvaluationMetrics(metricsSet.query_evaluations.map((row) => row.query_metrics));
const sealedMetricsSet = reseal(metricsSet, "metrics_set_digest");

function evaluationCoordinateMaterial(baseline, axes, candidateConfigDigest, candidateMetricsSet) {
  return {
    contract_version: EVALUATION_COORDINATE_VERSION,
    environment_set_digest: baseline.environment_set_digest,
    normalized_golden_digest: baseline.normalized_golden_digest,
    base_configuration_digest: baseline.base_configuration_digest,
    tuning_grid_digest: baseline.tuning_grid_digest,
    tuning_axes_digest: axes.tuning_axes_digest,
    candidate_config_digest: candidateConfigDigest,
    query_metrics_set_digest: candidateMetricsSet.query_metrics_set_digest,
    aggregate_metrics_digest: candidateMetricsSet.aggregate_metrics.aggregate_metrics_digest,
    metrics_set_digest: candidateMetricsSet.metrics_set_digest,
    relative_ndcg_budget: baseline.relative_ndcg_budget,
    metric_contract_version: METRIC_VERSION,
    ndcg_discount_table_digest: retrieval.RETRIEVAL_EVALUATION_NDCG_TABLE.table_digest,
    metric_scale: 1_000_000,
    query_count: baseline.query_count,
    maximum_expected_top_k: baseline.maximum_expected_top_k,
  };
}

const baseline = conformance.valid_envelopes.baseline;
baseline.environment_set = sealedEnvironmentSet;
baseline.normalized_golden = golden;
baseline.metrics_set = sealedMetricsSet;
baseline.query_count = golden.queries.length;
baseline.maximum_expected_top_k = Math.max(...golden.queries.map((query) => query.expected_top_k));
baseline.normalized_golden_digest = golden.golden_digest;
baseline.environment_set_digest = sealedEnvironmentSet.environment_set_digest;
baseline.query_metrics_set_digest = sealedMetricsSet.query_metrics_set_digest;
baseline.aggregate_metrics_digest = sealedMetricsSet.aggregate_metrics.aggregate_metrics_digest;
baseline.metrics_set_digest = sealedMetricsSet.metrics_set_digest;
baseline.baseline_evaluation_digest = digest(evaluationCoordinateMaterial(baseline, baseline.selected_axes, baseline.candidate_config_digest, sealedMetricsSet));
const sealedBaseline = reseal(baseline, "baseline_digest");

const observation = conformance.valid_envelopes.observation_report;
observation.evaluation_digest = sealedBaseline.baseline_evaluation_digest;
const sealedObservation = reseal(observation, "observation_digest");

function allTuneAxes() {
  const result = [];
  for (const rrf_k of evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID.rrf_k) for (const mmr of evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID.mmr)
    for (const semantic_top_k of evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID.semantic_top_k) for (const lexical_top_k of evaluationHost.RETRIEVAL_EVALUATION_TUNING_GRID.lexical_top_k) {
      const material = { contract_version: "gkos-retrieval-evaluation-tuning-axes/1.0.0-draft.1", rrf_k, mmr: mmr.enabled,
        mmr_lambda_micros: mmr.lambda_micros, semantic_top_k, lexical_top_k };
      result.push({ ...material, tuning_axes_digest: digest(material) });
    }
  return result;
}
const candidates = allTuneAxes().filter((axes) => axes.semantic_top_k >= sealedBaseline.maximum_expected_top_k && axes.lexical_top_k >= sealedBaseline.maximum_expected_top_k)
  .map((axes) => {
    const candidate_config_digest = digest({
      base_configuration_digest: sealedBaseline.base_configuration_digest,
      candidate_config: evaluationHost.retrievalEvaluationCandidateConfigMaterial(axes),
    });
    return {
      candidate_config_digest,
      axes,
      metrics_set: sealedMetricsSet,
      candidate_evaluation_digest: digest(evaluationCoordinateMaterial(sealedBaseline, axes, candidate_config_digest, sealedMetricsSet)),
    };
  });
const tuneSelection = evaluationHost.selectRetrievalEvaluationTuneCandidate({ baseline: sealedBaseline, candidates });
const shippedTune = conformance.tune_matrix.find((row) => row.case_id === "shipped-24-query-grid");
shippedTune.expected_candidate_evaluation_set_digest = tuneSelection.candidate_evaluation_set_digest;
shippedTune.expected_selected_axes = tuneSelection.selected_candidate.axes;
shippedTune.expected_selected_candidate_config_digest = tuneSelection.selected_candidate.candidate_config_digest;
shippedTune.expected_selected_candidate_evaluation_digest = tuneSelection.selected_candidate.candidate_evaluation_digest;
shippedTune.expected_tune_selection_digest = tuneSelection.tune_selection_digest;

conformance.fixture_files = {
  fixed_provider: { file: "fixed-provider.json", digest: sealedProvider.provider_fixture_digest },
  fixture_catalog: { file: "fixture-catalog.json", digest: sealedCatalog.catalog_digest },
  source_corpus: { file: "source-corpus.json", digest: sourceCorpus.source_corpus_digest },
  metric_computation: { file: "metric-computation-fixture.json", digest: metricFixture.fixture_digest },
  tune_priority: { file: "tune-priority-fixture.json", digest: tunePriority.fixture_digest },
  ...(conformance.fixture_files?.reviewed_bundle ? { reviewed_bundle: conformance.fixture_files.reviewed_bundle } : {}),
};
conformance.valid_envelopes.environment_set = sealedEnvironmentSet;
conformance.valid_envelopes.metrics_set = sealedMetricsSet;
conformance.valid_envelopes.baseline = sealedBaseline;
conformance.valid_envelopes.observation_report = sealedObservation;
conformance.valid_envelopes.projection_manifests = sealedEnvironmentSet.members.map((member) => artifacts.get(member.environment.vault_fixture).manifest);

writeJson("source-corpus.json", sourceCorpus);
writeJson("fixed-provider.json", sealedProvider);
writeJson("fixture-catalog.json", sealedCatalog);
writeJson("conformance-fixture.json", conformance);
console.log(JSON.stringify({
  source_corpus_digest: sourceCorpus.source_corpus_digest,
  provider_digest: sealedProvider.provider_fixture_digest,
  catalog_digest: sealedCatalog.catalog_digest,
  environment_set_digest: sealedEnvironmentSet.environment_set_digest,
  metrics_set_digest: sealedMetricsSet.metrics_set_digest,
  baseline_digest: sealedBaseline.baseline_digest,
  tune_selection_digest: tuneSelection.tune_selection_digest,
  sources: corpora.map((corpus) => ({ vault: corpus.vault_fixture, digest: corpus.corpus_fixture_digest, files: corpus.source_files.length })),
}, null, 2));
