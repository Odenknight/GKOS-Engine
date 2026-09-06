// Run after npm run build: node examples/managed-moc.mjs
// Creates an isolated synthetic vault; never discovers or changes an owner vault.
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeManagedMocRuntime } from '../dist/navigation-effects-node.mjs';
import { buildVaultNavigationConfig } from '../dist/navigation.mjs';

const vaultRoot = await mkdtemp(join(tmpdir(), 'gkos-moc-example-'));
await mkdir(join(vaultRoot, 'topics'));
await writeFile(join(vaultRoot, 'topics/example.md'), '# Example\n\n#demo\n');
const policyRef = { id: 'synthetic-demo-policy', version: '1', digest: `sha256:${'b'.repeat(64)}` };
const config = await buildVaultNavigationConfig({ configId: '01990ac0-0000-7000-8000-000000000001', version: 1, vaultId: 'synthetic-demo', promotedMocNames: [], createdAt: '2026-09-06T12:00:00Z', createdBy: 'demo-owner', policy: policyRef });
const runtime = new NodeManagedMocRuntime({
  vaultRoot, pathThreatModel: 'cooperative-vault',
  snapshot: async () => ({
    snapshot: { vaultId: 'synthetic-demo', sources: [{ relativePath: 'topics/example.md', title: 'Example', content: await readFile(join(vaultRoot, 'topics/example.md'), 'utf8'), sensitivity: 'public' }] },
    config, policyRef, allowedSensitivities: ['public'],
    targets: [{ path: 'topics/index.md', ownership: { targetPath: 'topics/index.md', ownership: 'fully-managed', creationAuthorized: true }, authority: { actor: { actorId: 'demo-owner', actorType: 'human' }, grantId: 'demo-only', allowedRoot: 'topics', capability: 'moc:apply', sensitivityCeiling: 'public', policyRef } }],
  }),
  // Synthetic-only authority; production hosts must consult live policy/grants,
  // source/config freshness, sensitivity and retention rather than copy this stub.
  validatePreconditions: plan => plan.vaultId === 'synthetic-demo' && plan.targetPath === 'topics/index.md' && plan.policyRef.digest === policyRef.digest ? [] : ['DEMO_SCOPE_DENIED'],
});
try {
  if (!await runtime.start()) throw new Error('Recovery did not establish readiness');
  console.log(JSON.stringify({ vaultRoot, moc: await readFile(join(vaultRoot, 'topics/index.md'), 'utf8'), status: runtime.status }, null, 2));
} finally {
  const result = await runtime.shutdown();
  if (!result.clean) throw new Error('Shutdown remains recoverable but was not clean');
}
// Retain the synthetic vault for inspecting journal/archive/ownership evidence.
