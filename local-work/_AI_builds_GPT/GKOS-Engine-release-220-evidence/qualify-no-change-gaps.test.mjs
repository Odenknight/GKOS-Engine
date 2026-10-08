import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
if (!process.env.GKOS_CONSUMER_ROOT || !process.env.GKOS_TARBALL_PATH || !/^[a-f0-9]{64}$/.test(process.env.GKOS_TARBALL_SHA256 ?? '')) throw new Error('QUALIFICATION_BINDING_REQUIRED');
const consumerRequire = createRequire(join(process.env.GKOS_CONSUMER_ROOT, 'package.json'));
const artifactDigest = createHash('sha256').update(await readFile(process.env.GKOS_TARBALL_PATH)).digest('hex');
assert.equal(artifactDigest, process.env.GKOS_TARBALL_SHA256, 'qualified tarball digest');
console.log('# artifact-sha256 '+artifactDigest+' node '+process.version+' platform '+process.platform);
const { NodeManagedMocHost, NodeNavigationEffectsExecutor } = await import(pathToFileURL(consumerRequire.resolve('gkos-engine/navigation-effects/node')).href);
const { planManagedMocBatch } = await import(pathToFileURL(consumerRequire.resolve('gkos-engine/navigation-effects')).href);
const { buildVaultNavigationConfig } = await import(pathToFileURL(consumerRequire.resolve('gkos-engine/navigation')).href);
const { canonicalSha256 } = await import(pathToFileURL(consumerRequire.resolve('gkos-engine')).href);

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
  assert.equal(audit.operationIdentity, request.plan.effectId);
  assert.equal(audit.idempotencyKey, request.plan.idempotencyKey);
  assert.equal(audit.storageProtocol, 'exclusive-file-sync-readback-with-terminal-journal-binding');
  assert.equal(audit.durableStorageResult, 'FILE_SYNCED_READBACK_VERIFIED');
  assert.equal(audit.sourceContentIncluded, false);
  assert.ok(Number.isSafeInteger(audit.sequence) && audit.sequence > 0);
  assert.ok(Number.isFinite(Date.parse(audit.occurredAt)));
  assert.equal(audit.policyRef.digest, request.plan.policyRef.digest);
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


for (const damage of ['missing','truncated','corrupt']) test('sealed NO_CHANGE '+damage+' audit refuses restart without rewriting evidence', async t => {
 const {root,request}=await fixture(t);const original=executor(root);
 await original.execute(request);await original.shutdown();
 const path=auditPath(root,request.plan.effectId);
 if(damage==='missing')await rm(path);else await writeFile(path,damage==='truncated'?'{"artifactKind":':'{}\n');
 const before=damage==='missing'?null:await readFile(path,'utf8');
 const reopened=executor(root);
 try { await assert.rejects(reopened.recoverStartup(), error=> damage==='missing'?error.code==='ENOENT':/NO_CHANGE_AUDIT_CORRUPT/.test(error.message)); }
 finally { await reopened.releaseVaultLease(); }
 if(damage==='missing')await assert.rejects(readFile(path),error=>error.code==='ENOENT');
 else assert.equal(await readFile(path,'utf8'),before);
});
