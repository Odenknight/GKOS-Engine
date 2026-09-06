import { performance } from 'node:perf_hooks';
import { buildVaultNavigationConfig } from '../dist/navigation.mjs';
import { planManagedMocBatch } from '../dist/navigation-effects.mjs';
const policyRef = { id: 'benchmark', version: '1', digest: `sha256:${'b'.repeat(64)}` };
const config = await buildVaultNavigationConfig({ configId: '01990ac0-0000-7000-8000-000000000001', version: 1, vaultId: 'benchmark', promotedMocNames: [], createdAt: '2026-09-06T12:00:00Z', createdBy: 'benchmark', policy: policyRef });
const rows = [];
for (const count of [100, 2000, 10000, 50000]) {
  const sources = Array.from({ length: count }, (_, i) => ({ relativePath: `notes/${String(Math.floor(i / 100)).padStart(3, '0')}/n${i}.md`, content: `# Note ${i}\n\nDeterministic fixture content.\n`, title: `Note ${i}`, sensitivity: 'public' }));
  const started = performance.now();
  const result = await planManagedMocBatch({ snapshot: { vaultId: 'benchmark', sources }, config, allowedSensitivities: ['public'], policyRef, authorityEvaluatedAt: '2026-09-06T12:00:00Z', archiveDate: '2026-09-06', runId: 'benchmark', targets: [{ path: 'notes/000/index.md', currentBytes: null, ownership: { targetPath: 'notes/000/index.md', ownership: 'fully-managed', creationAuthorized: true }, authority: { actor: { actorId: 'benchmark', actorType: 'system' }, grantId: 'benchmark', allowedRoot: 'notes', capability: 'moc:apply', sensitivityCeiling: 'public', policyRef } }] });
  if (result.results[0]?.status !== 'planned') throw new Error('Benchmark did not exercise a planned effect');
  rows.push({ notes: count, targetScopes: 1, planningMs: Math.round((performance.now() - started) * 1000) / 1000, proposedDigest: result.results[0].plan.proposedDigest, rssBytes: process.memoryUsage().rss });
}
console.log(JSON.stringify({ kind: 'planning-smoke-benchmark/1', node: process.version, platform: process.platform, endToEndLatencyClaim: false, rows }, null, 2));
