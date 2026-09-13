import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('product adoption checks the installed adapter and refuses stale or substituted pins', () => {
  const root = mkdtempSync(join(tmpdir(), 'gkos-product-adoption-'));
  const commit = 'a'.repeat(40), spec = `github:Odenknight/GKOS-Engine#${commit}`;
  const installed = join(root, 'node_modules/gkos-engine');
  mkdirSync(join(installed, 'dist'), { recursive: true });
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
  writeFileSync(join(installed, 'package.json'), JSON.stringify({ name: 'gkos-engine', version, type: 'module', exports: { './adapter': './dist/adapter.mjs' } }));
  writeFileSync(join(installed, 'dist/adapter.mjs'), readFileSync(new URL('../dist/adapter.mjs', import.meta.url)));
  const manifest = { name: 'synthetic-consumer', dependencies: { 'gkos-engine': spec } };
  const lock = { packages: { '': { dependencies: { 'gkos-engine': spec } }, 'node_modules/gkos-engine': {
    version, resolved: `git+ssh://git@github.com/Odenknight/GKOS-Engine.git#${commit}` } } };
  const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('../examples/check-product-engine.mjs', import.meta.url)),
    '--product', root, '--commit', commit], { encoding: 'utf8' });
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock));
    const passed = run(); assert.equal(passed.status, 0, passed.stderr);
    assert.equal(JSON.parse(passed.stdout).full_product_qualified, false);
    for (const replacement of [`git+ssh://git@github.com/other/engine.git#${commit}`,
      'git+ssh://git@github.com/Odenknight/GKOS-Engine.git#main',
      `git+ssh://git@github.com/Odenknight/GKOS-Engine.git#${'b'.repeat(40)}`]) {
      lock.packages['node_modules/gkos-engine'].resolved = replacement;
      writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock));
      assert.notEqual(run().status, 0);
    }
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir())));
    assert.ok(root.includes('gkos-product-adoption-'));
    rmSync(root, { recursive: true, force: true });
  }
});
