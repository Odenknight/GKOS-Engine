import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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
  for (const paths of [[], Array(4097).fill(file), [null], ['relative.txt'], [file + '\0bad'], [file + ':stream']]) {
    assert.throws(() => guard.withReadGuards(paths, () => assert.fail('must not run')), /GUARD_UNAVAILABLE/);
  }
  const child = join(directory, 'child'); mkdirSync(child);
  assert.throws(() => guard.withReadGuards([child + '\\..\\retained.txt'], () => assert.fail('must not run')), /GUARD_UNAVAILABLE/);
  renameSync(file, file + '.held'); renameSync(file + '.held', file);
});
