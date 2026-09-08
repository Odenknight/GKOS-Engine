import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import esbuild from 'esbuild';
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'gkos-observation22-test-'));
test.after(() => rm(temp, { recursive: true, force: true }));
await esbuild.build({ entryPoints: [join(root, 'scripts/generate-retrieval-observation-fixture-2.2.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: join(temp, 'fixture.mjs'), logLevel: 'silent' });
const fixture = await import(pathToFileURL(join(temp, 'fixture.mjs')));

test('2.2 expected projection preimages reproduce fixed pins and retain workload', () => {
  const plan = fixture.performanceSamplePlan();
  const manifests = fixture.expectedPerformanceManifests();
  assert.equal(plan.indexing.engine_version, '2.2.0');
  assert.equal(plan.indexing.projection_schema_version, 2);
  assert.equal(plan.fixture.chunk_count, 10000);
  assert.equal(plan.indexing.initial.provider_call_count, 313);
  assert.equal(plan.indexing.initial.provider_item_count, 10000);
  assert.equal(plan.indexing.incremental_update.provider_item_count, 1);
  assert.equal(plan.indexing.incremental_update.chunks_reused, 9999);
  assert.equal(plan.percentile.p95_strict_upper_bound_micros, 500000);
  assert.equal(plan.execution.sample_count, 50);
  assert.equal(manifests.initial.projection_digest, fixture.PINS.initial_projection_digest);
  assert.equal(manifests.updated.projection_digest, fixture.PINS.updated_projection_digest);
  assert.equal(plan.indexing.clean_rebuild.expected_projection_digest, manifests.updated.projection_digest);
  const original = execFileSync('git', ['show', '650eab4a6752227cae336d7556a57826c22a0d5a:scripts/generate-retrieval-observation-fixture.mjs'], { cwd: root });
  return readFile(join(root, 'scripts/generate-retrieval-observation-fixture.mjs')).then(bytes => assert.deepEqual(bytes, original));
});

test('2.2 oracle rejects changed chunks instead of adopting an arbitrary digest', async () => {
  // Mutate a bundled in-memory fixture copy, leaving all source files intact.
  const bundle = await readFile(join(temp, 'fixture.mjs'), 'utf8');
  const mutated = bundle.replace('07115aadce8907fbb5829bc7ec6927c458f4a7df0facd6d9f85a711c84c97cec', '0'.repeat(64));
  assert.notEqual(mutated, bundle);
  const module = await import('data:text/javascript;base64,' + Buffer.from(mutated).toString('base64'));
  assert.throws(() => module.performanceSamplePlan(), /OBS_FIXTURE_INVALID/);
});

test('separate full-history historical and current workflow contracts', async () => {
  const historical = await readFile(join(root, '.github/workflows/phase4-retrieval-observation.yml'), 'utf8');
  const current = await readFile(join(root, '.github/workflows/observation-2.2.yml'), 'utf8');
  assert.match(historical, /ref: d81f9d1351f1a9228650a840629191a92f2dfb22/);
  assert.match(historical, /fetch-depth: 0/);
  assert.match(current, /fetch-depth: 0/);
  assert.match(current, /scripts\/run-retrieval-observation-qualification-2\.2\.mjs/);
  assert.match(current, /if: always\(\)/);
  assert.match(current, /observation-receipt\.json/);
  const runner = await readFile(join(root, 'scripts/run-retrieval-observation-qualification-2.2.mjs'), 'utf8');
  assert.match(runner, /stableJson\(indexed.generation.manifest\) !== stableJson\(expectedManifest\)/);
  assert.match(runner, /--is-shallow-repository/);
  assert.match(runner, /OBS_SOURCE_PROVENANCE_INVALID/);
  assert.doesNotMatch(runner, /error\?\.message \?\? "operational failure"/);
});

test('native SQLite initial, one-item reuse, and clean rebuild match independent 2.2 manifests', { timeout: 180000 }, async () => {
  await esbuild.build({ entryPoints: [join(root, 'scripts/run-retrieval-observation-qualification-2.2.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: join(temp, 'runner.mjs'), logLevel: 'silent' });
  const runner = await import(pathToFileURL(join(temp, 'runner.mjs')));
  const provider = new runner.ConstantEmbeddingProvider();
  const plan = fixture.performanceSamplePlan();
  const state = join(temp, 'incremental'), clean = join(temp, 'clean');
  await mkdir(state); await mkdir(clean);
  const initial = await runner.runIndexPhase(provider, 'initial_index', state, fixture.buildPerformanceCorpus(false), plan.indexing.initial);
  const before = runner.readReuseRows(initial.database_path);
  const updated = await runner.runIndexPhase(provider, 'incremental_update', state, fixture.buildPerformanceCorpus(true), plan.indexing.incremental_update);
  const after = runner.readReuseRows(updated.database_path);
  assert.equal(runner.verifyReuseRows(before, after).unchanged_vectors_verified, 9999);
  const corrupt = structuredClone(after); corrupt[0].vector_json = '[0,1,0,0]';
  assert.throws(() => runner.verifyReuseRows(before, corrupt), /OBS_UPDATE_REUSE_INVALID/);
  const rebuilt = await runner.runIndexPhase(provider, 'clean_rebuild', clean, fixture.buildPerformanceCorpus(true), plan.indexing.clean_rebuild);
  assert.deepEqual(rebuilt.manifest, updated.manifest);
});
