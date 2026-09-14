import esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** Build the actual qualification runner with the same required native guard. */
export async function buildWatcherObservationRunner(output) {
  const destination = resolve(output);
  let digest = '', native;
  if (process.platform === 'win32') {
    const manifest = JSON.parse(readFileSync(join(root, 'dist/native/retained-guard.json'), 'utf8'));
    if (manifest.platform !== 'win32' || manifest.arch !== process.arch || manifest.nodeApiVersion !== 8 ||
        !/^[0-9a-f]{64}$/.test(manifest.sha256) || manifest.filename !== `retained-guard-${manifest.sha256}.node` ||
        manifest.sourceSha256 !== sha(readFileSync(join(root, 'native/windows/retained-guard.cpp')))) {
      throw new Error('WATCHER_RUNNER_NATIVE_BUILD_INVALID');
    }
    native = { filename: manifest.filename, bytes: readFileSync(join(root, 'dist/native', manifest.filename)) };
    if (sha(native.bytes) !== manifest.sha256) throw new Error('WATCHER_RUNNER_NATIVE_BUILD_INVALID');
    digest = manifest.sha256;
  }
  const compiled = await esbuild.build({ entryPoints: [join(root, 'scripts/run-watcher-observation-qualification.mjs')],
    bundle: true, platform: 'node', format: 'esm', target: 'node22', write: false, logLevel: 'silent',
    define: { GKOS_RETAINED_GUARD_SHA256: JSON.stringify(digest) } });
  mkdirSync(dirname(destination), { recursive: true });
  if (native) {
    const directory = join(dirname(destination), 'native'); mkdirSync(directory, { recursive: true });
    const target = join(directory, native.filename);
    try { writeFileSync(target, native.bytes, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST' || sha(readFileSync(target)) !== digest) throw error; }
  }
  writeFileSync(destination, compiled.outputFiles[0].contents, { flag: 'wx' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/build-watcher-observation-runner.mjs OUTPUT');
  await buildWatcherObservationRunner(process.argv[2]);
}
