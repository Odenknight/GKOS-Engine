import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeManagedMocHost, NodeNavigationEffectsExecutor } from '../dist/navigation-effects-node.mjs';
import { planManagedMocBatch } from '../dist/navigation-effects.mjs';
import { buildVaultNavigationConfig } from '../dist/navigation.mjs';
import { canonicalSha256 } from '../dist/gkos-engine.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'gkos-no-change-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'topics'));
  const policyRef = { id: 'policy', version: '1', digest: 'sha256:'+'b'.repeat(64) };
  const config = await buildVaultNavigationConfig({ configId: '01990ac0-0000-7000-8000-000000000001', version: 1, vaultId: 'vault', promotedMocNames: [], createdAt: '2026-09-06T12:00:00Z', createdBy: 'owner', policy: policyRef });
  const context = { snapshot: { vaultId: 'vault', sources: [{ relativePath: 'topics/a.md', content: 'A', title: 'A', sensitivity: 'public' }] }, config, policyRef, allowedSensitivities: ['public'], targets: [{ path: 'topics/index.md', ownership: { targetPath: 'topics/index.md', ownership: 'fully-managed', creationAuthorized: true }, authority: { actor: { actorId: 'owner', actorType: 'human' }, grantId: 'grant', allowedRoot: 'topics', capability: 'moc:apply', sensitivityCeiling: 'public', policyRef } }] };
  const options = { vaultRoot: root, pathThreatModel: 'cooperative-vault', snapshot: async () => context, validatePreconditions: () => [], clock: () => '2026-09-08T12:00:00Z' };
  const host = new NodeManagedMocHost(options);
  await host.start(0); await host.shutdown();
  const state = JSON.parse(await readFile(join(root, '.gkx/effects/moc-host.json'), 'utf8'));
  context.targets[0].ownership = state.state.ownership['topics/index.md'];
  context.targets[0].currentBytes = await readFile(join(root, 'topics/index.md'), 'utf8');
  const batch = await planManagedMocBatch({ ...context, recordNoChange: true, authorityEvaluatedAt: '2026-09-08T12:00:00Z', archiveDate: '2026-09-08', runId: 'a'.repeat(64) });
  assert.equal(batch.results[0].status, 'planned');
  const planned = batch.results[0];
  assert.equal(planned.plan.precondition.priorDigest, planned.plan.proposedDigest);
  assert.equal(planned.plan.archiveRunPath, undefined);
  return { root, context, options, request: { plan: planned.plan, proposedBytes: planned.proposedBytes } };
}
const executor = root => new NodeNavigationEffectsExecutor({ vaultRoot: root, pathThreatModel: 'cooperative-vault', preconditionValidator: () => [] });
const auditPath = (root, id) => join(root, '.gkx/effects/no-change', id.replaceAll(':','_')+'.json');

test('unchanged execution stores fully bound NO_CHANGE and exact retries preserve receipt/sequence/source bytes', async t => {
  const { root, request } = await fixture(t);
  const target = join(root, 'topics/index.md'), before = await stat(target);
  const e = executor(root); t.after(() => e.shutdown());
  const result = await e.execute(request);
  assert.equal(result.status, 'no-op');
  const auditBytes = await readFile(auditPath(root, request.plan.effectId), 'utf8');
  const audit = JSON.parse(auditBytes), { receiptDigest, ...material } = audit;
  assert.equal(receiptDigest, await canonicalSha256(material));
  assert.equal(audit.disposition, 'NO_CHANGE');
  assert.deepEqual(audit.actor, request.plan.authority.actor);
  assert.deepEqual(audit.authority, request.plan.authority);
  assert.equal(await canonicalSha256(audit.ownership), await canonicalSha256(request.plan.ownership));
  assert.equal(audit.sourceDigest, request.plan.sourceSnapshotDigest);
  assert.equal(audit.configurationDigest, request.plan.configDigest);
  assert.deepEqual(audit.policyRef, request.plan.policyRef);
  assert.equal(audit.evaluatedPlanDigest, await canonicalSha256(request.plan));
  assert.equal(audit.resultingStateDigest, request.plan.proposedDigest);
  assert.equal(audit.reconciliationDigest, 'sha256:'+'a'.repeat(64));
  const journal = await e.journal.load();
  assert.equal(journal.at(-1).receiptDigest, audit.effectReceiptDigest);
  assert.equal(journal.at(-2).sequence, audit.sequence);
  const retry = await e.execute(request);
  assert.deepEqual(retry.reasonCodes, ['IDEMPOTENT_REPLAY']);
  assert.deepEqual(await e.journal.load(), journal);
  assert.equal(await readFile(auditPath(root, request.plan.effectId), 'utf8'), auditBytes);
  assert.equal((await stat(target)).mtimeMs, before.mtimeMs);
  assert.equal(await readFile(target, 'utf8'), request.proposedBytes);
});

for (const point of ['after-received', 'after-planned', 'after-prepared', 'after-no-change-audit', 'after-receipt']) {
  test(`native process exit during no-change ${point} recovers one verified receipt`, async t => {
    const { root, request } = await fixture(t);
    const input = join(root, 'request.json'); await writeFile(input, JSON.stringify(request));
    const moduleUrl = new URL('../dist/navigation-effects-node.mjs', import.meta.url).href;
    const script = `import {readFileSync} from 'node:fs'; import {NodeNavigationEffectsExecutor} from ${JSON.stringify(moduleUrl)}; const e=new NodeNavigationEffectsExecutor({vaultRoot:process.argv[1],pathThreatModel:'cooperative-vault',preconditionValidator:()=>[],faultInjector:p=>{if(p===process.argv[3])process.exit(86)}}); await e.execute(JSON.parse(readFileSync(process.argv[2],'utf8'))); process.exit(87);`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, root, input, point], { encoding: 'utf8', timeout: 30000 });
    assert.equal(child.status, 86, child.stderr);
    const recovered = executor(root); t.after(() => recovered.shutdown());
    const recovery = await recovered.recoverStartup();
    assert.equal(recovery.safeToEnableWrites, true);
    const result = await recovered.execute(request);
    assert.equal(result.status, 'no-op');
    const entries = (await recovered.journal.load()).filter(row => row.effectId === request.plan.effectId);
    assert.equal(entries.filter(row => row.state === 'COMMITTED').length, 1);
    assert.equal((await readdir(join(root, '.gkx/effects/no-change'))).length, 1);
    assert.equal(JSON.parse(await readFile(auditPath(root, request.plan.effectId), 'utf8')).disposition, 'NO_CHANGE');
  });
}

test('missing or corrupt no-change audit blocks startup rather than reconstructing historical success', async t => {
  const { root, request } = await fixture(t);
  const e = executor(root); await e.execute(request); await e.shutdown();
  await writeFile(auditPath(root, request.plan.effectId), '{}\n');
  const restarted = executor(root);
  await assert.rejects(restarted.recoverStartup(), /NO_CHANGE_AUDIT_CORRUPT/);
  await restarted.releaseVaultLease();
});

test('unchanged managed MOC still revalidates live authority and retains unresolved intent on refusal', async t => {
  const { root, options } = await fixture(t);
  const host = new NodeManagedMocHost({ ...options, validatePreconditions: () => ['REVOKED'] });
  t.after(() => host.shutdown());
  await assert.rejects(host.start(1), /MOC_EFFECT_NOT_COMMITTED/);
  const state = JSON.parse(await readFile(join(root, '.gkx/effects/moc-host.json'), 'utf8'));
  assert.ok(state.state.intent);
  const entries = await host.executor.journal.load();
  assert.equal(entries.at(-1).state, 'ABORTED');
  assert.equal(entries.at(-1).reasonCode, 'REVOKED');
});

test('native audit destination write failure cannot seal NO_CHANGE or promote an operation', async t => {
  const { root, request } = await fixture(t);
  // Safely provoke an actual filesystem ENOTDIR/EEXIST without filling a disk.
  await writeFile(join(root, '.gkx/effects/no-change'), 'blocked audit destination');
  const e = executor(root); t.after(() => e.shutdown());
  const result = await e.execute(request);
  assert.equal(result.status, 'recovery-required');
  assert.deepEqual(result.reasonCodes, ['EXECUTION_FAILURE']);
  const entries = (await e.journal.load()).filter(row => row.effectId === request.plan.effectId);
  assert.equal(entries.some(row => row.state === 'COMMITTED'), false);
  assert.equal(entries.at(-1).state, 'RECOVERY_REQUIRED');
  assert.equal(await readFile(join(root, 'topics/index.md'), 'utf8'), request.proposedBytes);
});
