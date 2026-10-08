import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expected = {
  main: '71b899473473f47172b181973027f3eb7da25104',
  r18: 'aa9a05315a9a767bd672aa2bb5179c963d9d66ca',
};
const usage = `Usage: node standard-boundary-probes.mjs --main-checkout <directory> --r18-checkout <directory>

Supply repository-root paths for Standard main ${expected.main}
and R18 ${expected.r18}; relative paths resolve from the current directory.
Install main's conformance/runner dependencies with npm ci --ignore-scripts first.
The script can be copied anywhere when both checkout options are supplied.

With no arguments only, defaults use the original local audit layout:
  ../../standard-audit/gkos-standard
  ../../standard-audit/gkos-standard-r18
relative to this script. These directories are not part of a published report bundle.
Use --help for this text. Output is diagnostic JSON: exit 0 means probes ran,
not that the observed behavior passed. Missing options, wrong commits, or changed
probe-target source files fail before execution. See standard-boundary-probes-USAGE.md.
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(usage);
    return;
  }
  const paths = {};
  if (!args.length) {
    paths.main = fileURLToPath(new URL('../../standard-audit/gkos-standard/', import.meta.url));
    paths.r18 = fileURLToPath(new URL('../../standard-audit/gkos-standard-r18/', import.meta.url));
  } else {
    for (let i = 0; i < args.length; i += 2) {
      const option = args[i];
      const key = option === '--main-checkout' ? 'main' : option === '--r18-checkout' ? 'r18' : null;
      if (!key || !args[i + 1] || args[i + 1].startsWith('--') || paths[key]) {
        throw new Error(`Invalid or duplicate option: ${option}. Supply both checkout options; use --help.`);
      }
      paths[key] = resolve(args[i + 1]);
    }
    if (!paths.main || !paths.r18) throw new Error('Both --main-checkout and --r18-checkout are required; use --help.');
  }
  const modules = {
    main: 'conformance/runner/canonical.mjs',
    r18: 'conformance/runner/gate-evaluator.mjs',
  };
  const source = {};
  for (const key of ['main', 'r18']) {
    source[key] = execFileSync('git', ['-C', paths[key], 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (source[key] !== expected[key]) throw new Error(`${key} checkout must be ${expected[key]}; observed ${source[key]}.`);
    execFileSync('git', ['-C', paths[key], 'diff', '--quiet', 'HEAD', '--', modules[key]], { stdio: ['ignore', 'pipe', 'pipe'] });
  }
  const { evaluateGate } = await import(pathToFileURL(resolve(paths.r18, modules.r18)).href);
  const { canonicalEncode } = await import(pathToFileURL(resolve(paths.main, modules.main)).href);
const inputs = [
  { kind: 'authority', valid: true, evaluation_time: '2026-08-31T00:00:00.000000Z' },
  { kind: 'context-binding' },
  { kind: 'digest-binding' },
  { kind: 'restrictiveness' },
  { kind: 'canonical-time', value: '2026-99-99T99:99:99.000000Z' },
  { kind: 'authorization-manifest' },
];
console.log(JSON.stringify({
  source,
  checkout_mode: args.length ? 'explicit' : 'original-local-audit-defaults',
  gate_probes: inputs.map(input => ({ input, expected: 'refusal for missing or malformed mandatory evidence', observed: evaluateGate(input) })),
  canonical_probes: [{ compiled_at: '2026-99-99T12:00:00.000000Z' }, { text: '\ud800' }].map(input => {
    try { return { input, expected: 'refuse malformed time or lone surrogate', observed: 'ACCEPTED', hex: canonicalEncode(input).toString('hex') }; }
    catch (error) { return { input, observed: 'REFUSED', message: error.message }; }
  }),
}, null, 2));
}

main().catch(error => {
  process.stderr.write(`Probe setup failed: ${error.message}\n`);
  process.exitCode = 2;
});
