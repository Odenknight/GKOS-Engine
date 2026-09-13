/** npm consumer adoption smoke; full product qualification remains separate. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--product' || args[2] !== '--commit' || !/^[0-9a-f]{40}$/.test(args[3])) {
  throw new Error('Usage: --product PRODUCT_ROOT --commit QUALIFIED_ENGINE_SHA');
}
const root = resolve(args[1]), commit = args[3];
const manifestPath = join(root, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const lockBytes = readFileSync(join(root, 'package-lock.json'));
const lock = JSON.parse(lockBytes);
const declared = manifest.dependencies?.['gkos-engine'];
const repository = /^(?:github:Odenknight\/GKOS-Engine|git\+https:\/\/github\.com\/Odenknight\/GKOS-Engine(?:\.git)?|git\+ssh:\/\/git@github\.com\/Odenknight\/GKOS-Engine(?:\.git)?)#[0-9a-f]{40}$/;
assert.ok(typeof declared === 'string' && repository.test(declared) && declared.endsWith(`#${commit}`), 'Declare the qualified immutable Engine dependency');
assert.equal(lock.packages?.['']?.dependencies?.['gkos-engine'], declared, 'Lock root and manifest disagree');
const entry = lock.packages?.['node_modules/gkos-engine'];
assert.ok(entry && repository.test(entry.resolved) && entry.resolved.endsWith(`#${commit}`), 'Resolved Engine origin/ref differs');
const adapterPath = createRequire(manifestPath).resolve('gkos-engine/adapter');
const installedRoot = join(root, 'node_modules', 'gkos-engine');
assert.equal(realpathSync(adapterPath), realpathSync(join(installedRoot, 'dist', 'adapter.mjs')), 'Adapter resolved outside installed Engine');
const installed = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8'));
assert.equal(installed.name, 'gkos-engine');
assert.equal(installed.version, entry.version);
const { createGkosEngineAdapter } = await import(pathToFileURL(adapterPath).href);
const adapter = createGkosEngineAdapter({ projection: { defaultSensitivity: 'internal' } });
assert.equal(adapter.name, 'gkos-engine');
assert.equal(adapter.version, installed.version);
assert.equal(Object.isFrozen(adapter), true);
const graph = adapter.buildGraph([{ relativePath: 'evidence.md',
  content: '---\ngkx_version: 2.3\nuid: 123e4567-e89b-42d3-a456-426614174000\ntype: evidence\ntitle: Evidence\nepistemic_state: hypothesis\n---\nSynthetic product adapter check.' }]);
assert.equal(graph.nodes.find(node => node.path === 'evidence.md')?.gkx?.projection?.effective.sensitivity, 'internal');
assert.equal(typeof adapter.createIndex().setFiles, 'function');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
console.log(JSON.stringify({ scope: 'pin-and-public-adapter-smoke', product: manifest.name,
  engine_commit: commit, engine_version: installed.version, lock_sha256: sha(lockBytes), adapter_sha256: sha(readFileSync(adapterPath)),
  status: 'PASS', full_product_qualified: false }, null, 2));
