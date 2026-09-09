// Qualification oracle: builds preimages without importing the indexer, store,
// manifest implementation, or production canonicalizer. Pins live separately.
import { createHash } from 'node:crypto';
import * as historical from './generate-retrieval-observation-fixture.mjs';

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export const digest = value => 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex');

export function observation22Material() {
  const plan = historical.performanceSamplePlan();
  delete plan.sample_plan_digest;
  const fixture = historical.performanceFixtureMaterial();
  fixture.contract_version = 'gkos-retrieval-evaluation-performance-fixture/2.2.0';
  fixture.generator_contract_version = 'gkos-retrieval-evaluation-performance-generator/2.2.0';
  fixture.engine_version = '2.2.0';
  fixture.projection_schema_version = 2;
  plan.contract_version = 'gkos-retrieval-evaluation-performance-sample-plan/2.2.0';
  plan.fixture.fixture_contract_version = fixture.contract_version;
  plan.fixture.generator_contract_version = fixture.generator_contract_version;
  plan.fixture.fixture_digest = digest(fixture);
  plan.indexing.engine_version = '2.2.0';
  plan.indexing.configuration_preimage.engine_version = '2.2.0';
  plan.indexing.configuration_digest = digest(plan.indexing.configuration_preimage);
  const manifests = {};
  for (const updated of [false, true]) {
    const corpus = historical.buildPerformanceCorpus(updated);
    const chunks = [...corpus.chunks].sort((a, b) => a.chunk_id < b.chunk_id ? -1 : a.chunk_id > b.chunk_id ? 1 : 0);
    const base = {
      contract_version: 'gkos-retrieval/1.0.0-draft.1', projection_schema_version: 2,
      engine_version: '2.2.0', vault_id: plan.indexing.vault_id,
      source_snapshot_digest: corpus.source_snapshot_digest,
      configuration_digest: plan.indexing.configuration_digest, policy_digest: plan.indexing.policy_digest,
      chunker_version: 'gkos-heading-chunker/1', tokenizer_version: 'gkos-ascii-whitespace/1',
      lexical_backend: 'sqlite_fts5', embedding_provider_id: 'phase4-observation-local',
      embedding_model_id: 'phase4-observation-constant-v1', embedding_dimensions: 4,
      source_count: 1000, chunk_count: 10000,
    };
    const projection_digest = digest({ ...base, chunks, vectors: chunks.map(chunk => ({ chunk_id: chunk.chunk_id, vector: [1, 0, 0, 0] })) });
    manifests[updated ? 'updated' : 'initial'] = { ...base, projection_id: 'retrieval:' + projection_digest.slice(7, 31), projection_digest };
  }
  for (const phase of ['initial', 'incremental_update', 'clean_rebuild']) {
    const manifest = manifests[phase === 'initial' ? 'initial' : 'updated'];
    plan.indexing[phase].expected_projection_id = manifest.projection_id;
    plan.indexing[phase].expected_projection_digest = manifest.projection_digest;
  }
  plan.indexing.incremental_update.prior_projection_digest = manifests.initial.projection_digest;
  return { fixture, plan, manifests, pins: {
    fixture_digest: digest(fixture), configuration_digest: plan.indexing.configuration_digest,
    sample_plan_digest: digest(plan), initial_projection_digest: manifests.initial.projection_digest,
    updated_projection_digest: manifests.updated.projection_digest,
  } };
}
