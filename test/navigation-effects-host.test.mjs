import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeManagedMocHost, NodeManagedMocRuntime } from '../dist/navigation-effects-node.mjs';
import { buildVaultNavigationConfig } from '../dist/navigation.mjs';
import { sha256Bytes } from '../dist/gkos-engine.mjs';
import { renderGeneratedMocRegion, parseGeneratedMocRegion } from '../dist/navigation-effects.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'gkos-moc-host-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'topics'));
  const policyRef = { id: 'policy', version: '1', digest: `sha256:${'b'.repeat(64)}` };
  const config = await buildVaultNavigationConfig({ configId: '01990ac0-0000-7000-8000-000000000001', version: 1, vaultId: 'vault', promotedMocNames: [], createdAt: '2026-09-06T12:00:00Z', createdBy: 'owner', policy: policyRef });
  const context = { snapshot: { vaultId: 'vault', sources: [{ relativePath: 'topics/a.md', content: 'A', title: 'A', sensitivity: 'public' }] }, config, policyRef, allowedSensitivities: ['public'], targets: [{ path: 'topics/index.md', ownership: { targetPath: 'topics/index.md', ownership: 'fully-managed', creationAuthorized: true }, authority: { actor: { actorId: 'owner', actorType: 'human' }, grantId: 'grant', allowedRoot: 'topics', capability: 'moc:apply', sensitivityCeiling: 'public', policyRef } }] };
  const options = { vaultRoot: root, pathThreatModel: 'cooperative-vault', snapshot: async () => context, validatePreconditions: () => [], clock: () => '2026-09-06T12:00:00Z' };
  return { root, context, options };
}

test('host creates, advances ownership, archives replacements and restarts as a no-op', async t => {
  const { root, context, options } = await fixture(t);
  const host = new NodeManagedMocHost(options);
  assert.equal(await host.start(0), true);
  await assert.rejects(host.start(1), /HOST_ALREADY_STARTED/);
  const competing = new NodeManagedMocHost(options);
  await assert.rejects(competing.start(1), /VAULT_LEASE_HELD/);
  const before = await readFile(join(root, 'topics/index.md'), 'utf8');
  context.snapshot.sources.push({ relativePath: 'topics/b.md', content: 'B', title: 'B', sensitivity: 'public' });
  await host.coordinator.notify('topics/b.md', 100);
  await host.coordinator.tick(1000);
  const after = await readFile(join(root, 'topics/index.md'), 'utf8');
  assert.match(after, /topics\/b/); assert.notEqual(before, after);
  const runs = await readdir(join(root, '_archive/moc-runs/2026-09-06'));
  assert.equal(runs.length, 2);
  const state = JSON.parse(await readFile(join(root, '.gkx/effects/moc-host.json'), 'utf8'));
  assert.equal(state.state.ownership['topics/index.md'].adoptedDigest, await sha256Bytes(after));
  await host.shutdown();
  const restarted = new NodeManagedMocHost(options);
  assert.equal(await restarted.start(0), true);
  assert.equal((await readdir(join(root, '_archive/moc-runs/2026-09-06'))).length, 2);
  context.snapshot.sources = [];
  await restarted.coordinator.requestReconciliation(10);
  await restarted.coordinator.tick(1000);
  assert.doesNotMatch(await readFile(join(root, 'topics/index.md'), 'utf8'), /\[\[/);
  await restarted.shutdown();
});

test('host recovers an effect committed before ownership metadata persisted', async t => {
  const { root, options } = await fixture(t);
  const interrupted = new NodeManagedMocHost({ ...options, faultInjector: () => { throw new Error('kill boundary'); } });
  await assert.rejects(interrupted.start(0), /kill boundary/);
  const pending = JSON.parse(await readFile(join(root, '.gkx/effects/moc-host.json'), 'utf8'));
  assert.ok(pending.state.pending);
  const restarted = new NodeManagedMocHost(options);
  assert.equal(await restarted.start(0), true);
  const state = JSON.parse(await readFile(join(root, '.gkx/effects/moc-host.json'), 'utf8'));
  assert.equal(state.state.pending, null);
  assert.ok(state.state.ownership['topics/index.md'].adoptedDigest);
  await restarted.shutdown();
});

test('host refuses external edits and current authority revocation', async t => {
  const { root, context, options } = await fixture(t);
  let revoked = false;
  const host = new NodeManagedMocHost({ ...options, validatePreconditions: () => revoked ? ['REVOKED'] : [] });
  await host.start(0);
  context.snapshot.sources[0].title = 'Updated'; revoked = true;
  await host.coordinator.notify('topics/a.md', 1);
  await assert.rejects(host.coordinator.tick(1000), /MOC_EFFECT_NOT_COMMITTED/);
  assert.doesNotMatch(await readFile(join(root, 'topics/index.md'), 'utf8'), /Updated/);
  revoked = false;
  await writeFile(join(root, 'topics/index.md'), 'Human edit');
  await assert.rejects(host.coordinator.tick(2000));
  assert.equal(await readFile(join(root, 'topics/index.md'), 'utf8'), 'Human edit');
  await host.shutdown();
});

test('host state tampering blocks startup and preserves evidence', async t => {
  const { root, options } = await fixture(t);
  const host = new NodeManagedMocHost(options); await host.start(0); await host.shutdown();
  const statePath = join(root, '.gkx/effects/moc-host.json');
  await writeFile(statePath, '{"state":{},"digest":"tampered"}');
  const restarted = new NodeManagedMocHost(options);
  await assert.rejects(restarted.start(0), /HOST_STATE_CORRUPT/);
  assert.equal(await readFile(statePath, 'utf8'), '{"state":{},"digest":"tampered"}');
});

test('runtime observes file edits and closes resources within shutdown budget', async t => {
  const { root, context, options } = await fixture(t);
  // Exercise a non-native spelling too. Windows temp roots can additionally
  // contain 8.3 aliases; production must canonicalize the watch root, not tests.
  const runtime = new NodeManagedMocRuntime({ ...options, vaultRoot: root.replace(/\\/g, '/') + '/', snapshot: async () => {
    try { context.snapshot.sources[0].title = (await readFile(join(root, 'topics/a.md'), 'utf8')).trim(); } catch {}
    return context;
  } });
  try {
    assert.equal(await runtime.start(), true);
    await writeFile(join(root, 'topics/a.md'), 'Watched title');
    const deadline = Date.now() + 6000;
    while (!/Watched title/.test(await readFile(join(root, 'topics/index.md'), 'utf8')) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
    assert.match(await readFile(join(root, 'topics/index.md'), 'utf8'), /Watched title/);
  } finally {
    assert.deepEqual(await runtime.shutdown(), { clean: true });
    assert.equal(runtime.status.running, false);
  }
});

test('host preserves human bytes through successive region-managed updates', async t => {
  const { root, context, options } = await fixture(t);
  const before = 'Human prefix\r\n' + renderGeneratedMocRegion('old links', context.config.digest) + '\r\nHuman suffix\r\n';
  await writeFile(join(root, 'topics/index.md'), before);
  const parsed = await parseGeneratedMocRegion(before);
  context.targets[0].ownership = { targetPath: 'topics/index.md', ownership: 'region-managed', adoptedDigest: await sha256Bytes(before), generatedRegion: parsed.region };
  const host = new NodeManagedMocHost(options);
  await host.start(0);
  context.snapshot.sources[0].title = 'Second pass';
  await host.coordinator.notify('topics/a.md', 1); await host.coordinator.tick(1000);
  const after = await readFile(join(root, 'topics/index.md'), 'utf8');
  assert.ok(after.startsWith('Human prefix\r\n'));
  assert.ok(after.endsWith('\r\nHuman suffix\r\n'));
  assert.match(after, /Second pass/);
  await host.shutdown();
});

test('missing ownership state alongside an existing effect journal fails closed', async t => {
  const { root, options } = await fixture(t);
  const host = new NodeManagedMocHost(options); await host.start(0); await host.shutdown();
  await rm(join(root, '.gkx/effects/moc-host.json'));
  const restarted = new NodeManagedMocHost(options);
  await assert.rejects(restarted.start(0), /HOST_STATE_MISSING_WITH_HISTORY/);
});
