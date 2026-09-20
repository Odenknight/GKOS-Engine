#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

// Keep the no-argument lane a short smoke; larger tiers and soak are explicit.
const DEFAULT_TIERS = [100, 2000];

function integer(value, name, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Invalid ${name}`);
  return parsed;
}

export function parseManagedMocQualificationArgs(argv) {
  const options = { tiers: DEFAULT_TIERS, samples: 1, soakSeconds: 0, restartEvery: 0, timeoutMs: 30000, output: null };
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`Missing value for ${argv[i]}`);
    if (argv[i] === '--tiers') {
      options.tiers = value.split(',').map(item => integer(item, 'tier', 1, 50000));
      if (!options.tiers.length || options.tiers.length > 8 || new Set(options.tiers).size !== options.tiers.length) throw new Error('Invalid tiers');
    } else if (argv[i] === '--samples') options.samples = integer(value, 'samples', 1, 10000);
    else if (argv[i] === '--soak-seconds') options.soakSeconds = integer(value, 'soak duration', 0, 86400);
    else if (argv[i] === '--restart-every') options.restartEvery = integer(value, 'restart interval', 0, 10000);
    else if (argv[i] === '--timeout-ms') options.timeoutMs = integer(value, 'timeout', 1, 120000);
    else if (argv[i] === '--output') options.output = resolve(value);
    else throw new Error(`Unknown argument ${argv[i]}`);
  }
  return options;
}

export function qualificationStatus(soakSeconds, completed, expected, observationSeconds = 0) {
  if (completed !== expected) return 'FAIL';
  if (soakSeconds === 0) return 'OBSERVED_SCALE_SAMPLES';
  return soakSeconds === 86400 && observationSeconds >= 86400 ? 'OBSERVED_24H_SYNTHETIC' : 'OBSERVED_SHORT_SOAK';
}

function percentile(values, fraction) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}

function note(index, revision = 0) {
  return `# Synthetic note ${index}\n\nRevision ${revision}.\n`;
}

async function runTier({ count, samples, soakSeconds, restartEvery, timeoutMs }, api) {
  const vaultRoot = await mkdtemp(join(tmpdir(), `gkos-managed-moc-${count}-`));
  const topics = join(vaultRoot, 'topics');
  await mkdir(topics);
  const paths = [];
  for (let i = 0; i < count; i++) {
    const path = `topics/n${String(i).padStart(8, '0')}.md`;
    paths.push(path);
    await writeFile(join(vaultRoot, path), note(i));
  }
  const policyRef = { id: 'synthetic-qualification', version: '1', digest: `sha256:${'b'.repeat(64)}` };
  const config = await api.buildVaultNavigationConfig({ configId: '01990ac0-0000-7000-8000-000000000001', version: 1, vaultId: `synthetic-${count}`, promotedMocNames: [], createdAt: '2026-09-20T00:00:00Z', createdBy: 'qualification', policy: policyRef });
  let sourceReads = 0, sourceBytes = 0, snapshotCalls = 0, commits = 0, runtime, committedDigest = null;
  const queue = { samples: 0, pendingSamples: 0, activeSamples: 0, maxOutstanding: 0, activeResourcesPeak: 0 };
  const latencies = [], memory = { samples: 0, rssInitialBytes: process.memoryUsage().rss, rssPeakBytes: process.memoryUsage().rss };
  const target = { path: 'topics/index.md', ownership: { targetPath: 'topics/index.md', ownership: 'fully-managed', creationAuthorized: true }, authority: { actor: { actorId: 'qualification', actorType: 'system' }, grantId: 'synthetic', allowedRoot: 'topics', capability: 'moc:apply', sensitivityCeiling: 'public', policyRef } };
  const options = {
    vaultRoot, pathThreatModel: 'cooperative-vault',
    snapshot: async () => {
      snapshotCalls++;
      const sources = [];
      for (let offset = 0; offset < paths.length; offset += 64) {
        sources.push(...await Promise.all(paths.slice(offset, offset + 64).map(async relativePath => {
          const content = await readFile(join(vaultRoot, relativePath), 'utf8');
          sourceReads++; sourceBytes += Buffer.byteLength(content);
          return { relativePath, content, title: content.slice(2, content.indexOf('\n')), sensitivity: 'public' };
        })));
      }
      return { snapshot: { vaultId: `synthetic-${count}`, sources }, config, policyRef, allowedSensitivities: ['public'], targets: [target] };
    },
    validatePreconditions: () => [],
    onCommitted: async (_path, digest) => { committedDigest = digest; commits++; },
  };
  const observe = setInterval(() => {
    if (!runtime) return;
    const status = runtime.status;
    queue.samples++;
    if (status.pending) queue.pendingSamples++;
    if (status.active) queue.activeSamples++;
    queue.maxOutstanding = Math.max(queue.maxOutstanding, Number(status.pending) + Number(status.active));
    queue.activeResourcesPeak = Math.max(queue.activeResourcesPeak, process.getActiveResourcesInfo().length);
    const rss = process.memoryUsage().rss;
    memory.samples++;
    memory.rssPeakBytes = Math.max(memory.rssPeakBytes, rss);
  }, 10);
  let restarts = 0, completed = 0, succeeded = false;
  const startRuntime = async () => {
    runtime = new api.NodeManagedMocRuntime(options);
    if (!await runtime.start()) throw new Error('Managed MOC recovery did not become ready');
  };
  try {
    await startRuntime();
    const deadline = performance.now() + soakSeconds * 1000;
    const expectedMinimum = samples;
    while (completed < expectedMinimum || (soakSeconds > 0 && performance.now() < deadline)) {
      const ordinal = completed % count;
      const relativePath = paths[ordinal];
      const expectedTitle = `Synthetic changed ${completed + 1}`;
      const before = commits;
      const started = performance.now();
      await writeFile(join(vaultRoot, relativePath), `# ${expectedTitle}\n\nRevision ${completed + 1}.\n`);
      while (commits === before) {
        if (performance.now() - started > timeoutMs) throw new Error(`Event ${completed + 1} did not converge within ${timeoutMs}ms`);
        if (runtime.status.errorCode) throw new Error(runtime.status.errorCode);
        await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
      }
      const convergenceMs = performance.now() - started;
      while (runtime.status.active || runtime.status.pending) {
        if (performance.now() - started > timeoutMs) throw new Error(`Event ${completed + 1} committed but coordinator did not settle within ${timeoutMs}ms`);
        await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
      }
      const moc = await readFile(join(vaultRoot, 'topics/index.md'));
      const actualDigest = `sha256:${createHash('sha256').update(moc).digest('hex')}`;
      const state = JSON.parse(await readFile(join(vaultRoot, '.gkx/effects/moc-host.json'), 'utf8')).state;
      const context = await options.snapshot();
      const planned = await api.planManagedMocBatch({ ...context, targets: [{ ...target, ownership: state.ownership[target.path], currentBytes: moc.toString('utf8') }], authorityEvaluatedAt: new Date().toISOString(), archiveDate: new Date().toISOString().slice(0, 10), runId: 'qualification-check', recordNoChange: false });
      if (actualDigest !== committedDigest) throw new Error(`Event ${completed + 1} target digest did not match committed digest`);
      if (!moc.includes(Buffer.from(expectedTitle))) throw new Error(`Event ${completed + 1} target omitted expected title`);
      if (planned.results[0]?.status !== 'no-op') throw new Error(`Event ${completed + 1} independent plan status was ${planned.results[0]?.status ?? 'missing'}`);
      if (planned.results[0].proposedDigest !== actualDigest) throw new Error(`Event ${completed + 1} independent proposed digest did not match target digest`);
      if (latencies.length < 10000) latencies.push(convergenceMs);
      completed++;
      if (restartEvery > 0 && completed % restartEvery === 0 && (completed < expectedMinimum || performance.now() < deadline)) {
        const shutdown = await runtime.shutdown();
        if (!shutdown.clean) throw new Error('Managed MOC restart shutdown was not clean');
        runtime = null;
        await startRuntime();
        restarts++;
      }
    }
    const observationSeconds = soakSeconds > 0 ? Math.max(0, (performance.now() - (deadline - soakSeconds * 1000)) / 1000) : 0;
    const status = qualificationStatus(soakSeconds, completed, completed >= expectedMinimum ? completed : expectedMinimum, observationSeconds);
    const row = { notes: count, status, requested_samples: samples, completed_samples: completed, requested_soak_seconds: soakSeconds,
      observation_seconds: observationSeconds,
      restarts, event_to_convergence_ms: { total_count: completed, retained_first_count: latencies.length, retained_first_samples: latencies, retained_first_p50: percentile(latencies, .5), retained_first_p95: percentile(latencies, .95), retained_first_max: latencies.length ? Math.max(...latencies) : null },
      source_scanning: { snapshot_calls: snapshotCalls, source_reads: sourceReads, source_bytes: sourceBytes, parser_qualified: false, incremental_scanning_qualified: false }, coordinator_queue: queue,
      memory: { samples: memory.samples, rss_initial_bytes: memory.rssInitialBytes, rss_peak_bytes: memory.rssPeakBytes },
      final_runtime_status: runtime.status };
    succeeded = true;
    return row;
  } catch (error) {
    error.fixtureDirectory = vaultRoot;
    throw error;
  } finally {
    clearInterval(observe);
    let clean = true;
    if (runtime) clean = (await runtime.shutdown()).clean;
    const temporaryRoot = await realpath(tmpdir());
    const fixtureRoot = await realpath(vaultRoot);
    if (!fixtureRoot.startsWith(`${temporaryRoot}${process.platform === 'win32' ? '\\' : '/'}`)) throw new Error('Refusing fixture cleanup outside temporary root');
    if (clean && succeeded) await rm(fixtureRoot, { recursive: true });
    else if (succeeded) throw new Error(`Managed MOC shutdown was not clean; fixture retained at ${fixtureRoot}`);
  }
}

async function sourceBinding() {
  const here = dirname(fileURLToPath(import.meta.url));
  const hash = async path => `sha256:${createHash('sha256').update(await readFile(path)).digest('hex')}`;
  const optionalHash = async path => { try { return await hash(path); } catch { return null; } };
  const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: join(here, '..'), encoding: 'utf8' });
  const names = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: join(here, '..'), encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean).sort();
  const tree = createHash('sha256');
  for (const name of names) { tree.update(`${name}\0`); tree.update(await readFile(join(here, '..', name))); }
  return { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: join(here, '..'), encoding: 'utf8' }).trim(),
    dirty: status.trim() !== '', worktree_status_sha256: `sha256:${createHash('sha256').update(status).digest('hex')}`, worktree_content_sha256: `sha256:${tree.digest('hex')}`,
    runner_sha256: await hash(fileURLToPath(import.meta.url)), navigation_dist_sha256: await optionalHash(join(here, '../dist/navigation.mjs')),
    effects_dist_sha256: await optionalHash(join(here, '../dist/navigation-effects.mjs')), effects_node_dist_sha256: await optionalHash(join(here, '../dist/navigation-effects-node.mjs')) };
}

export function verifyObservationSource(sourceBefore, sourceAfter, rows) {
  if (JSON.stringify(sourceBefore) !== JSON.stringify(sourceAfter)) {
    throw Object.assign(new Error('Qualification source or artifacts changed during observation'), {
      sourceBefore, sourceAfter, partialRows: rows,
    });
  }
}

export async function runManagedMocQualification(options) {
  const sourceBefore = await sourceBinding();
  const [{ NodeManagedMocRuntime }, { buildVaultNavigationConfig }, { planManagedMocBatch }] = await Promise.all([
    import('../dist/navigation-effects-node.mjs'), import('../dist/navigation.mjs'), import('../dist/navigation-effects.mjs'),
  ]);
  const rows = [];
  try {
    for (const [index, count] of options.tiers.entries()) rows.push(await runTier({ count, samples: options.samples, soakSeconds: index === options.tiers.length - 1 ? options.soakSeconds : 0, restartEvery: options.restartEvery, timeoutMs: options.timeoutMs }, { NodeManagedMocRuntime, buildVaultNavigationConfig, planManagedMocBatch }));
  } catch (error) { error.partialRows = rows; error.sourceBefore = sourceBefore; throw error; }
  const sourceAfter = await sourceBinding();
  verifyObservationSource(sourceBefore, sourceAfter, rows);
  return { kind: 'managed-moc-qualification/1', node: process.version, platform: process.platform, generated_at: new Date().toISOString(), release_qualified: false,
    source: sourceBefore,
    limits: { synthetic_fixture_only: true, event_samples_are_sequential: true, latency_samples_retained_maximum: 10000, coordinator_queue_depth_is_status_sampled_not_internal_introspection: true, source_reads_are_not_parser_or_incremental_qualification: true, no_release_acceptance_budgets: true }, rows };
}

export async function main(argv = process.argv.slice(2)) {
  let options, receipt;
  try { options = parseManagedMocQualificationArgs(argv); receipt = await runManagedMocQualification(options); }
  catch (error) { receipt = { kind: 'managed-moc-qualification/1', status: 'FAIL', release_qualified: false, failure_code: 'MOC_QUALIFICATION_FAILED', error: error.message, stack: error.stack ?? null, fixture_directory: error.fixtureDirectory ?? null, partial_rows: error.partialRows ?? [], generated_at: new Date().toISOString(), source_before: error.sourceBefore ?? null, source_after: error.sourceAfter ?? await sourceBinding(), limits: { synthetic_fixture_only: true, no_release_acceptance_budgets: true } }; process.exitCode = 1; }
  receipt.receipt_sha256 = `sha256:${createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}`;
  const bytes = `${JSON.stringify(receipt, null, 2)}\n`;
  if (options?.output) {
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, bytes, { flag: 'wx' });
  }
  process.stdout.write(bytes);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main().catch(error => { process.stderr.write(`managed MOC qualification: ${error.message}\n`); process.exitCode = 1; });
