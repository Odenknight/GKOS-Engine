import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, readdirSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.length !== 6 || args[0] !== '--engine' || args[2] !== '--seconds' || args[4] !== '--output') {
  throw new Error('Usage: --engine EXACT_CHECKOUT --seconds 86400 --output NEW_DIRECTORY');
}
const engine = resolve(args[1]), duration = Number(args[3]), output = resolve(args[5]);
if (!Number.isSafeInteger(duration) || duration < 1 || duration > 86400) throw new Error('Invalid duration');
mkdirSync(output, { recursive: false });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const artifact = join(engine, 'dist/watcher-host.mjs');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: engine, encoding: 'utf8' }).trim();
if (execFileSync('git', ['status', '--porcelain'], { cwd: engine, encoding: 'utf8' }).trim()) throw new Error('Engine must be clean');
const { startWatcherHost } = await import(pathToFileURL(artifact).href);
const root = mkdtempSync(join(tmpdir(), 'gkos-watcher-soak-'));
chmodSync(root, 0o700);
const vault = join(root, 'vault'), statusDirectory = join(root, 'status');
mkdirSync(vault, { mode: 0o700 }); mkdirSync(statusDirectory, { mode: 0o700 });
writeFileSync(join(statusDirectory, 'desktop-agent.token'), 'isolated-soak-fixture-only\n', { mode: 0o600 });
const count = 2000;
function note(index, revision) {
  return `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-${String(index).padStart(12, '0')}"\ntitle: "Soak ${index}"\ntype: "note"\ncreated_at: "2026-09-13T00:00:00Z"\nepistemic_state: "reported"\nsensitivity: "public"\n---\nSynthetic watcher revision ${revision}.\n`;
}
for (let i = 0; i < count; i++) writeFileSync(join(vault, `note-${i}.md`), note(i, 0), { mode: 0o600 });
const digest = 'sha256:' + 'a'.repeat(64);
const execution = [];
let activationListener = null;
const options = { vault_root: vault, status_file: join(statusDirectory, 'status.json'), vault_id: 'synthetic-watcher-soak',
  configuration_digest: digest, policy_digest: digest, periodic_reconciliation_ms: 60000,
  on_index_execution: value => execution.push(value),
  on_status_change: status => activationListener?.(status),
  coordinator_options: { discoverability_policy: () => 'allow', source_discoverability_policy: () => 'allow' } };
const receipt = { version: 'gkos-watcher-soak/1', started_at: new Date().toISOString(), requested_seconds: duration,
  engine_commit: head, artifact_sha256: sha(readFileSync(artifact)), runner_sha256: sha(readFileSync(fileURLToPath(import.meta.url))),
  node: process.version, platform: process.platform, fixture_directory: root, documents: count,
  budgets: { max_rss_mib: 1536, max_state_bytes: 4 * 1024 ** 3, max_active_resources: 256, single_edit_p95_ms: 2000 },
  cycles: 0, restarts: 0, status: 'RUNNING', error: null };
const summaryPath = join(output, 'receipt.json'), samplesPath = join(output, 'samples.jsonl');
writeFileSync(summaryPath, JSON.stringify(receipt, null, 2), { flag: 'wx' });
writeFileSync(samplesPath, '', { flag: 'wx' });
function stateSize(path) {
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const next = join(path, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Unexpected fixture alias');
    total += entry.isDirectory() ? stateSize(next) : lstatSync(next).size;
  }
  return total;
}
let host, stopped = false, observationStart = null;
const latencies = [], begun = performance.now();
process.once('SIGINT', () => { stopped = true; });
process.once('SIGTERM', () => { stopped = true; });
try {
  host = await startWatcherHost(options);
  assert.equal(host.status().document_count, count);
  observationStart = performance.now();
  receipt.observation_started_at = new Date().toISOString();
  while (!stopped && performance.now() - observationStart < duration * 1000) {
    const before = host.status().source_snapshot_digest;
    execution.length = 0;
    const editStart = performance.now();
    // Observe the real platform watcher, including detection/debounce latency.
    // An immediate manual reconcile has no scoped hint and forces set_files.
    await new Promise((resolveActivation, rejectActivation) => {
      const timer = setTimeout(() => {
        activationListener = null;
        rejectActivation(new Error('File event did not activate within 120 seconds'));
      }, 120000);
      activationListener = status => {
        if (status.source_snapshot_digest === before) return;
        clearTimeout(timer); activationListener = null; resolveActivation();
      };
      try {
        writeFileSync(join(vault, `note-${receipt.cycles % count}.md`), note(receipt.cycles % count, receipt.cycles + 1));
      } catch (error) { clearTimeout(timer); activationListener = null; rejectActivation(error); }
    });
    const elapsed = performance.now() - editStart;
    const status = host.status();
    assert.equal(status.document_count, count);
    assert.notEqual(status.source_snapshot_digest, before);
    latencies.push(elapsed);
    receipt.cycles++;
    const sample = { cycle: receipt.cycles, elapsed_ms: elapsed, rss_mib: process.memoryUsage().rss / 1024 ** 2,
      state_bytes: stateSize(join(vault, '.gkx')), active_resources: process.getActiveResourcesInfo().length,
      reparsed_sources: execution.reduce((sum, item) => sum + item.reparsed_source_count, 0),
      execution_kinds: execution.map(item => item.execution_kind),
      source_snapshot_digest: status.source_snapshot_digest };
    appendFileSync(samplesPath, JSON.stringify(sample) + '\n');
    assert.ok(sample.rss_mib <= receipt.budgets.max_rss_mib, 'RSS budget exceeded');
    assert.ok(sample.state_bytes <= receipt.budgets.max_state_bytes, 'State retention budget exceeded');
    assert.ok(sample.active_resources <= receipt.budgets.max_active_resources, 'Active resource budget exceeded');
    if (receipt.cycles % 60 === 0) {
      await host.shutdown(); await host.closed; host = null;
      host = await startWatcherHost(options); receipt.restarts++;
      assert.equal(host.status().source_snapshot_digest, status.source_snapshot_digest);
    }
    writeFileSync(summaryPath, JSON.stringify(receipt, null, 2));
    const remaining = duration * 1000 - (performance.now() - observationStart);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, Math.min(60000, remaining)));
  }
  const ordered = [...latencies].sort((a, b) => a - b);
  receipt.single_edit_p95_ms = ordered[Math.max(0, Math.ceil(ordered.length * .95) - 1)] ?? null;
  receipt.budget_pass = receipt.cycles > 0 && receipt.single_edit_p95_ms !== null &&
    receipt.single_edit_p95_ms <= receipt.budgets.single_edit_p95_ms;
  receipt.status = stopped ? 'INTERRUPTED' : !receipt.budget_pass ? 'FAIL_BUDGET' :
    duration < 86400 ? 'SHORT_SMOKE_ONLY' : receipt.cycles >= 1000 ? 'PASS_24H_WATCHER_SCOPE' : 'FAIL_BUDGET';
} catch (error) { receipt.status = 'FAIL'; receipt.error = error.message; }
finally {
  if (host) {
    try { await host.shutdown(); await host.closed; }
    catch (error) { receipt.status = 'FAIL'; receipt.shutdown_error = error.message; }
  }
  receipt.ended_at = new Date().toISOString(); receipt.elapsed_seconds = (performance.now() - begun) / 1000;
  receipt.observation_seconds = observationStart === null ? 0 : (performance.now() - observationStart) / 1000;
  receipt.samples_sha256 = sha(readFileSync(samplesPath));
  writeFileSync(summaryPath, JSON.stringify(receipt, null, 2) + '\n');
}
console.log(JSON.stringify({ status: receipt.status, cycles: receipt.cycles, elapsed_seconds: receipt.elapsed_seconds }));
process.exitCode = ['PASS_24H_WATCHER_SCOPE', 'SHORT_SMOKE_ONLY'].includes(receipt.status) ? 0 : 1;
