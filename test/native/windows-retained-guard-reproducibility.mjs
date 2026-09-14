import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('Windows retained-guard build is repeatable across fresh roots', {
  skip: process.platform === 'win32' ? false : 'Windows MSVC build host required; repeatability not qualified',
}, async t => {
  const proof = mkdtempSync(join(tmpdir(), 'gkos-native-repro-'));
  t.after(() => rmSync(proof, { recursive: true, force: true }));
  const inputs = [
    'scripts/build-windows-retained-guard.mjs',
    'native/windows/retained-guard.cpp',
    'native/windows/node-api-v22.22.1',
  ];
  const build = name => {
    const candidate = join(proof, name);
    for (const input of inputs) {
      const source = join(root, input), target = join(candidate, input);
      mkdirSync(resolve(target, '..'), { recursive: true });
      cpSync(source, target, { recursive: true });
    }
    const run = spawnSync(process.execPath, [join(candidate, inputs[0])], {
      encoding: 'utf8', timeout: 120000, windowsHide: true,
    });
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr);
    const manifest = JSON.parse(readFileSync(join(candidate, 'dist/native/retained-guard.json'), 'utf8'));
    const binary = readFileSync(join(candidate, 'dist/native/retained-guard.node'));
    assert.equal(sha(binary), manifest.sha256);
    assert.equal(manifest.sourceSha256, sha(readFileSync(join(root, inputs[1]))));
    return { binary, manifest };
  };
  const first = build('first');
  await new Promise(resolveDelay => setTimeout(resolveDelay, 1100));
  const second = build('second');
  assert.deepEqual(second.binary, first.binary);
  assert.equal(second.manifest.sha256, first.manifest.sha256);
});
