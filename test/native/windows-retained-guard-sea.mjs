import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

assert.equal(process.platform, 'win32');
const root = resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(readFileSync(join(root, 'dist/native/retained-guard.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const binary = readFileSync(join(root, 'dist/native', manifest.filename));
assert.equal(sha(binary), manifest.sha256);

test('actual Windows SEA loads its embedded guard without adjacent native files', { timeout: 120000 }, async t => {
  const parent = resolve(tmpdir()), fixture = mkdtempSync(join(parent, 'gkos-guard-sea-'));
  t.after(() => {
    assert.equal(dirname(fixture), parent);
    assert.ok(fixture.startsWith(join(parent, 'gkos-guard-sea-')));
    // Windows can briefly retain an exited executable; persistent locks still fail.
    rmSync(fixture, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  for (const folder of ['scripts', 'dist/native', 'native/windows', 'runtime', 'runtime/temp']) mkdirSync(join(fixture, folder), { recursive: true });
  for (const name of ['build-sea.mjs', 'sea-target.mjs', 'sea-native-assets.mjs', 'sea-build-inputs.mjs']) copyFileSync(join(root, 'scripts', name), join(fixture, 'scripts', name));
  for (const name of ['package.json', 'package-lock.json']) copyFileSync(join(root, name), join(fixture, name));
  copyFileSync(join(root, 'native/windows/retained-guard.cpp'), join(fixture, 'native/windows/retained-guard.cpp'));
  writeFileSync(join(fixture, 'dist/native', manifest.filename), binary);
  writeFileSync(join(fixture, 'dist/native/retained-guard.json'), JSON.stringify(manifest));
  const source = `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const path = require('node:path');
    const { withWindowsRetainedGuards } = require(${JSON.stringify(join(root, 'src/watcher/windows-retained-guard.ts'))});
    const file = path.join(__dirname, 'source.txt');
    fs.writeFileSync(file, 'preserved');
    for (let i = 0; i < 100; i++) {
      withWindowsRetainedGuards([file], () => {
        assert.throws(() => fs.renameSync(file, file + '.moved'));
        assert.throws(() => fs.writeFileSync(file, 'changed'));
      });
      fs.renameSync(file, file + '.moved'); fs.renameSync(file + '.moved', file);
    }
    assert.equal(fs.readFileSync(file, 'utf8'), 'preserved');
    console.log(JSON.stringify({ guarded: 100, sourcePreserved: true }));
  `;
  const compiled = await build({ stdin: { contents: source, resolveDir: root }, bundle: true,
    platform: 'node', format: 'cjs', target: 'node22', write: false,
    define: { GKOS_RETAINED_GUARD_SHA256: JSON.stringify(manifest.sha256) } });
  const entry = compiled.outputFiles[0].contents;
  writeFileSync(join(fixture, 'dist/gkos-desktop-agent.cjs'), entry);
  writeFileSync(join(fixture, 'dist/bundle-inputs.json'), JSON.stringify({ schemaVersion: 1,
    retainedGuardSha256: manifest.sha256, artifacts: [{ path: 'dist/gkos-desktop-agent.cjs', sha256: sha(entry), bytes: entry.length }] }));
  const built = spawnSync(process.execPath, [join(fixture, 'scripts/build-sea.mjs')], {
    cwd: fixture, env: { ...process.env, NODE_PATH: join(root, 'node_modules') }, encoding: 'utf8', timeout: 90000, windowsHide: true });
  assert.ifError(built.error); assert.equal(built.status, 0, built.stdout + built.stderr);
  const executable = readdirSync(join(fixture, 'dist')).find(name => name.startsWith('gkos-agent-') && name.endsWith('.exe'));
  assert.ok(executable);
  const destination = join(fixture, 'runtime', executable);
  copyFileSync(join(fixture, 'dist', executable), destination);
  assert.equal(readdirSync(join(fixture, 'runtime')).includes('native'), false);
  const child = spawnSync(destination, [], { cwd: join(fixture, 'runtime'), encoding: 'utf8', timeout: 15000, windowsHide: true,
    env: { ...process.env, TEMP: join(fixture, 'runtime/temp'), TMP: join(fixture, 'runtime/temp') } });
  assert.ifError(child.error); assert.equal(child.status, 0, child.stdout + child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { guarded: 100, sourcePreserved: true });
  const extracted = readdirSync(join(fixture, 'runtime/temp'));
  assert.equal(extracted.length, 1, 'one native package per process, not per callback');
  assert.equal(sha(readFileSync(join(fixture, 'runtime/temp', extracted[0], manifest.filename))), manifest.sha256);

  // Fault-inject only the isolated builder's asset selector. Production
  // packaging rejects these inputs; runtime must also refuse a bad container.
  for (const mode of ['missing', 'altered']) {
    // Preserve each prior inventory before constructing a different container.
    renameSync(join(fixture, 'dist', executable + '.build-inputs.json'),
      join(fixture, 'dist', mode + '.previous-build-inputs.json'));
    const badAsset = join(fixture, 'dist/native', manifest.filename);
    if (mode === 'altered') writeFileSync(badAsset, 'altered native bytes');
    const assets = mode === 'missing' ? {} : { [manifest.filename]: badAsset };
    writeFileSync(join(fixture, 'scripts/sea-native-assets.mjs'),
      `export function retainedGuardSeaAssets() { return ${JSON.stringify(assets)}; }`);
    const failedBuild = spawnSync(process.execPath, [join(fixture, 'scripts/build-sea.mjs')], {
      cwd: fixture, env: { ...process.env, NODE_PATH: join(root, 'node_modules') }, encoding: 'utf8', timeout: 90000, windowsHide: true });
    assert.ifError(failedBuild.error); assert.equal(failedBuild.status, 0, failedBuild.stdout + failedBuild.stderr);
    const badExecutable = join(fixture, 'runtime', `${mode}.exe`);
    copyFileSync(join(fixture, 'dist', executable), badExecutable);
    const temporary = join(fixture, 'runtime', mode); mkdirSync(temporary);
    const refused = spawnSync(badExecutable, [], { cwd: join(fixture, 'runtime'), encoding: 'utf8', timeout: 15000, windowsHide: true,
      env: { ...process.env, TEMP: temporary, TMP: temporary } });
    assert.ifError(refused.error); assert.equal(refused.status, 1);
    assert.match(refused.stderr, /GKX_WATCHER_NATIVE_GUARD_UNAVAILABLE/);
    assert.deepEqual(readdirSync(temporary), [], 'reject embedded bytes before extracting code');
    assert.equal(readFileSync(join(fixture, 'runtime/source.txt'), 'utf8'), 'preserved');
  }
});
