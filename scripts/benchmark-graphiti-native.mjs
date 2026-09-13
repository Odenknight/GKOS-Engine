import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir, cpus, totalmem, release } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptRoot = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 6 || args[0] !== '--engine' || args[2] !== '--scale' || args[4] !== '--output') {
  throw new Error('Usage: --engine EXACT_CHECKOUT --scale 1000|10000|50000 --output NEW_JSON');
}
const engineRoot = resolve(args[1]), size = Number(args[3]), output = resolve(args[5]);
const planBytes = readFileSync(join(scriptRoot, 'contracts/graphiti/benchmark-draft1/plan.json'));
const plan = JSON.parse(planBytes);
if (!plan.scales.includes(size)) throw new Error('Scale outside frozen plan');
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: engineRoot, encoding: 'utf8' }).trim();
if (execFileSync('git', ['status', '--porcelain'], { cwd: engineRoot, encoding: 'utf8' }).trim()) throw new Error('Engine checkout must be clean');
const artifact = join(engineRoot, 'dist/retrieval.mjs');
const artifactHash = sha(readFileSync(artifact));
const { buildRetrievalGeneration, chunkMarkdown, RetrievalCoordinator, retrievalCanonicalDigest, vaultSourceReader } = await import(pathToFileURL(artifact).href);
const root = mkdtempSync(join(tmpdir(), 'gkos-native-benchmark-'));
const vault = join(root, 'vault'); mkdirSync(vault);
const chunks = [], sourceManifest = [];
const id = i => `018f0000-0000-7000-8000-${String(i).padStart(12, '0')}`;
for (let i = 1; i <= size; i++) {
  const code = `relaycode${String(i).padStart(8, '0')}`;
  const name = `relay-${i}.md`;
  const text = `# Relay ${i}\nThe relay ${code} is installed in chamber chambercode${String(i).padStart(8, '0')}.\n`;
  writeFileSync(join(vault, name), text);
  sourceManifest.push({ source_id: id(i), path: name, sha256: sha(text) });
  chunks.push(...chunkMarkdown({ source_id: id(i), source_path: name, text, metadata: { sensitivity: 'public', title: `Relay ${i}` } }));
}
const receipt = { version: 'gkos-native-graphiti-baseline/1', started_at: new Date().toISOString(), plan_sha256: sha(planBytes),
  runner_sha256: sha(readFileSync(fileURLToPath(import.meta.url))),
  engine_commit: sourceHead, engine_artifact_sha256: artifactHash, source_manifest_sha256: sha(JSON.stringify(sourceManifest)),
  scale: size, environment: { node: process.version, os: process.platform, os_release: release(), arch: process.arch,
    cpu: cpus()[0]?.model, logical_cpus: cpus().length, physical_memory_bytes: totalmem() },
  fixture_directory: root, runs: [], status: 'INCOMPLETE', semantic: 'not-executed', interpretation: plan.interpretation };
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] ?? null;
let failed = false;
try {
  for (let repetition = 0; repetition < plan.measured_runs; repetition++) {
    const run = { repetition, build_ms: null, database_bytes: null, queries: [], errors: [] };
    receipt.runs.push(run);
    const start = performance.now();
    let coordinator;
    try {
      const built = buildRetrievalGeneration({ state_directory: join(root, `state-${repetition}`), vault_id: 'synthetic-native-benchmark',
        source_snapshot_digest: retrievalCanonicalDigest(sourceManifest), configuration_digest: retrievalCanonicalDigest({ mode: 'fts', seed: plan.seed }),
        policy_digest: retrievalCanonicalDigest({ sensitivity: 'public' }), chunks });
      run.build_ms = performance.now() - start;
      run.database_bytes = statSync(built.database_path).size;
      coordinator = new RetrievalCoordinator(built.database_path, { discoverability_policy: () => 'allow', source_reader: vaultSourceReader(vault) });
      for (const concurrency of plan.query_concurrency) {
        for (let offset = 0; offset < plan.queries_per_run; offset += concurrency) {
          await Promise.all(Array.from({ length: Math.min(concurrency, plan.queries_per_run - offset) }, async (_, index) => {
            const n = ((plan.seed + offset + index) % size) + 1;
            const query = `relaycode${String(n).padStart(8, '0')}`;
            const begun = performance.now();
            const sample = { concurrency, temperature: concurrency === 1 && offset === 0 ? 'first-query-after-open' : 'warm',
              query_index: offset + index, elapsed_ms: null, recall_at_10: 0, ndcg_at_10: 0, error: null };
            try {
              const result = await coordinator.search({ query, limit: plan.limit });
              const rank = result.hits.findIndex(hit => hit.chunk.source_id === id(n));
              sample.recall_at_10 = rank >= 0 ? 1 : 0;
              sample.ndcg_at_10 = rank >= 0 ? 1 / Math.log2(rank + 2) : 0;
            } catch (error) { sample.error = error.name; failed = true; }
            sample.elapsed_ms = performance.now() - begun;
            run.queries.push(sample);
          }));
        }
      }
    } catch (error) { run.errors.push(error.name); failed = true; }
    finally { coordinator?.close(); }
  }
  const samples = receipt.runs.flatMap(run => run.queries);
  receipt.summary = { query_p50_ms: percentile(samples.map(s => s.elapsed_ms), .50), query_p95_ms: percentile(samples.map(s => s.elapsed_ms), .95),
    query_p99_ms: percentile(samples.map(s => s.elapsed_ms), .99), process_peak_rss_mib: process.resourceUsage().maxRSS / 1024,
    recall_at_10: samples.reduce((sum, s) => sum + s.recall_at_10, 0) / Math.max(1, samples.length),
    ndcg_at_10: samples.reduce((sum, s) => sum + s.ndcg_at_10, 0) / Math.max(1, samples.length), query_errors: samples.filter(s => s.error).length };
  const s = receipt.summary, b = plan.budgets;
  receipt.by_concurrency = plan.query_concurrency.map(concurrency => ({ concurrency,
    p95_ms: percentile(samples.filter(sample => sample.concurrency === concurrency).map(sample => sample.elapsed_ms), .95) }));
  receipt.budget_pass = !failed && samples.length === plan.measured_runs * plan.query_concurrency.length * plan.queries_per_run &&
    receipt.runs.every(run => run.build_ms !== null && run.build_ms <= b.native_build_ms[size]) &&
    receipt.by_concurrency.every(group => group.p95_ms !== null && group.p95_ms <= b.native_query_p95_ms) && s.process_peak_rss_mib <= b.process_peak_rss_mib &&
    s.recall_at_10 >= b.synthetic_exact_recall_at_10 && s.ndcg_at_10 >= b.synthetic_exact_ndcg_at_10 && s.query_errors === 0;
  receipt.status = receipt.budget_pass ? 'PASS_NATIVE_DIAGNOSTIC' : 'FAIL_NATIVE_DIAGNOSTIC';
} finally {
  receipt.ended_at = new Date().toISOString();
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ status: receipt.status, scale: size, summary: receipt.summary }));
process.exitCode = receipt.budget_pass ? 0 : 1;
