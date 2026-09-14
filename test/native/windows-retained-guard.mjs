import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { closeSync, copyFileSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

assert.equal(process.platform, 'win32', 'This native qualification requires Windows.');
const root = resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(readFileSync(join(root, 'dist/native/retained-guard.json'), 'utf8'));
assert.match(manifest.filename, /^retained-guard-[0-9a-f]{64}\.node$/);
const binary = join(root, 'dist/native', manifest.filename);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(readFileSync(binary)), manifest.sha256);
assert.equal(sha(readFileSync(join(root, 'native/windows/retained-guard.cpp'))), manifest.sourceSha256);
const guard = createRequire(import.meta.url)(binary);

function fixture(t) {
  const parent = resolve(tmpdir()), directory = mkdtempSync(join(parent, 'gkos-native-guard-'));
  t.after(() => {
    assert.equal(dirname(directory), parent);
    assert.ok(directory.startsWith(join(parent, 'gkos-native-guard-')));
    rmSync(directory, { recursive: true, force: true });
  });
  const file = join(directory, 'retained.txt'); writeFileSync(file, 'sealed\r\n');
  return { directory, file };
}

test('native guards block 200 rename attempts and release after every callback', t => {
  const { directory, file } = fixture(t);
  for (let i = 0; i < 200; i++) {
    assert.equal(guard.withReadGuards([directory, file], () => {
      assert.equal(readFileSync(file, 'utf8'), 'sealed\r\n');
      assert.throws(() => renameSync(file, file + '.held'), error => ['EBUSY', 'EPERM', 'EACCES'].includes(error.code));
      assert.throws(() => writeFileSync(file, 'changed'), error => ['EBUSY', 'EPERM', 'EACCES'].includes(error.code));
      return 42;
    }), 42);
    renameSync(file, file + '.held'); renameSync(file + '.held', file);
  }
  assert.equal(readFileSync(file, 'utf8'), 'sealed\r\n');
});

test('native guard releases every handle on callback exception and partial acquisition failure', t => {
  const { directory, file } = fixture(t);
  const sentinel = new Error('callback failed');
  assert.throws(() => guard.withReadGuards([directory, file], () => { throw sentinel; }), error => error === sentinel);
  renameSync(file, file + '.held'); renameSync(file + '.held', file);
  let called = false;
  assert.throws(() => guard.withReadGuards([directory, file, join(directory, 'missing')], () => { called = true; }), /GUARD_UNAVAILABLE/);
  assert.equal(called, false);
  renameSync(file, file + '.held'); renameSync(file + '.held', file);
});

test('native guard refuses conflicting writers and invalid inputs before callback', t => {
  const { directory, file } = fixture(t);
  const writer = openSync(file, 'r+');
  try { assert.throws(() => guard.withReadGuards([file], () => assert.fail('must not run')), /GUARD_UNAVAILABLE/); }
  finally { closeSync(writer); }
  for (const paths of [[], Array(100002).fill(file), [null], ['relative.txt'], [file + '\0bad'], [file + ':stream']]) {
    assert.throws(() => guard.withReadGuards(paths, () => assert.fail('must not run')), /GUARD_UNAVAILABLE/);
  }
  const child = join(directory, 'child'); mkdirSync(child);
  assert.throws(() => guard.withReadGuards([child + '\\..\\retained.txt'], () => assert.fail('must not run')), /GUARD_UNAVAILABLE/);
  renameSync(file, file + '.held'); renameSync(file + '.held', file);
});

test('parent and retained guards allow an authorized leaf transition and block another process', t => {
  const { directory, file } = fixture(t);
  const retainedDirectory = join(directory, 'retained-directory'); mkdirSync(retainedDirectory);
  const descendant = join(retainedDirectory, 'descendant.txt'); writeFileSync(descendant, 'descendant');
  const target = join(directory, 'authorized.txt');
  const childSource = `
    const fs = require('node:fs');
    const [directory, file, descendant] = process.argv.slice(1);
    const refused = operation => {
      try { operation(); throw new Error('mutation unexpectedly accepted'); }
      catch (error) { if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error; }
    };
    for (let i = 0; i < 200; i++) {
      refused(() => fs.renameSync(file, file + '.held'));
      refused(() => fs.writeFileSync(file, 'changed'));
      refused(() => fs.renameSync(descendant, descendant + '.held'));
      refused(() => fs.renameSync(directory, directory + '.held'));
    }
    process.stdout.write('800 mutations refused');
  `;
  guard.withReadGuards([directory, file, retainedDirectory, descendant], () => {
    // The affected leaf is excluded from guards. Its existing writer must not
    // prevent retaining the unaffected files.
    const writer = openSync(target, 'wx');
    try {
      const child = spawnSync(process.execPath, ['-e', childSource, directory, file, descendant], {
        encoding: 'utf8', timeout: 30000, windowsHide: true,
      });
      assert.ifError(child.error); assert.equal(child.status, 0, child.stderr);
      assert.equal(child.stdout, '800 mutations refused');
      writeFileSync(writer, 'authorized');
    } finally { closeSync(writer); }
    assert.equal(readFileSync(target, 'utf8'), 'authorized');
    renameSync(target, target + '.promoted'); unlinkSync(target + '.promoted');
    assert.equal(readFileSync(file, 'utf8'), 'sealed\r\n');
    assert.equal(readFileSync(descendant, 'utf8'), 'descendant');
  });
  renameSync(directory, directory + '.held'); renameSync(directory + '.held', directory);
});

test('directory guards permit child promotion but block empty-directory replacement', t => {
  const { directory } = fixture(t);
  const target = join(directory, 'authorized.txt');
  guard.withReadGuards([directory], () => {
    writeFileSync(target, 'authorized', { flag: 'wx' });
    assert.equal(readFileSync(target, 'utf8'), 'authorized');
    renameSync(target, target + '.promoted'); unlinkSync(target + '.promoted');
    // Also covers an empty directory, where no retained file anchors the parent.
    assert.throws(() => renameSync(directory, directory + '.held'), error => ['EBUSY', 'EPERM', 'EACCES'].includes(error.code));
  });
  renameSync(directory, directory + '.held'); renameSync(directory + '.held', directory);
});

test('watcher loader refuses missing or altered build-bound native bytes before creating a leaf', t => {
  const { directory } = fixture(t);
  for (const mode of ['missing', 'altered', 'valid']) {
    const installation = join(directory, mode); mkdirSync(installation);
    copyFileSync(join(root, 'dist/watcher-host.mjs'), join(installation, 'watcher-host.mjs'));
    const native = join(installation, 'native'); mkdirSync(native);
    if (mode !== 'missing') copyFileSync(binary, join(native, manifest.filename));
    if (mode === 'altered') writeFileSync(join(native, manifest.filename), 'not the admitted executable');
    const vault = join(installation, 'vault'); mkdirSync(vault);
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { existsSync, readFileSync } from 'node:fs';
      import { join } from 'node:path';
      import { pathToFileURL } from 'node:url';
      const [installation, vault, mode] = process.argv.slice(1);
      const api = await import(pathToFileURL(join(installation, 'watcher-host.mjs')));
      const directory = api.openWatcherDirectory(vault);
      const write = () => api.writeNewWatcherFile(directory, 'created.txt', Buffer.from('authorized'));
      if (mode === 'valid') {
        write(); assert.equal(readFileSync(join(vault, 'created.txt'), 'utf8'), 'authorized');
      } else {
        assert.throws(write, { message: 'GKX_WATCHER_NATIVE_GUARD_UNAVAILABLE' });
        assert.equal(existsSync(join(vault, 'created.txt')), false);
      }
    `, installation, vault, mode], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.ifError(run.error); assert.equal(run.status, 0, run.stderr);
  }
});
