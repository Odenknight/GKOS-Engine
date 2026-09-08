import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_GATES = Object.freeze([
  'source-build-package', 'linux-node22', 'linux-node24',
  'windows-node22', 'windows-node24', 'observation-2.2',
  'historical-observation-2.1.2', 'managed-moc-no-change',
  'native-linux-durability', 'native-windows-durability',
  'performance-all-tiers', 'soak-24h', 'consumer-linux', 'consumer-windows',
  'kosmos-exact-candidate', 'npm-owner-account',
]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
export function validateApproval(record, actualCommit) {
  assert.equal(record?.schema, 'gkos-engine-release-approval/2.2.0');
  assert.equal(record.package, 'gkos-engine');
  assert.equal(record.version, '2.2.0');
  assert.equal(record.tag, 'v2.2.0');
  assert.match(record.sourceCommit, /^[0-9a-f]{40}$/);
  assert.equal(record.sourceCommit, actualCommit);
  assert.ok(hex(record.tarballSha256));
  assert.match(record.tarballIntegrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
  assert.ok(hex(record.fileInventorySha256));
  assert.ok(hex(record.evidenceBundleSha256));
  assert.ok(Number.isSafeInteger(record.evidenceArtifactId) && record.evidenceArtifactId > 0);
  assert.equal(record.ownerNpmLogin, 'odenknight');
  assert.deepEqual(record.gates.map(row => row.name).sort(), [...REQUIRED_GATES].sort());
  for (const gate of record.gates) {
    assert.equal(gate.status, 'PASS', gate.name);
    assert.equal(gate.sourceCommit, record.sourceCommit, gate.name);
    assert.ok(hex(gate.receiptSha256), gate.name);
    assert.match(gate.evidenceUrl, /^https:\/\/github\.com\/Odenknight\//, gate.name);
  }
  const soak = record.gates.find(row => row.name === 'soak-24h');
  assert.ok(Number.isSafeInteger(soak.durationSeconds) && soak.durationSeconds >= 86400);
  assert.equal(soak.unexplainedFailures, 0);
  return record;
}
export function verifyArtifact(record, bytes, packReport) {
  assert.equal(sha256(bytes), record.tarballSha256);
  assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), record.tarballIntegrity);
  assert.equal(packReport.name, 'gkos-engine'); assert.equal(packReport.version, '2.2.0');
  assert.equal(packReport.filename, 'gkos-engine-2.2.0.tgz');
  assert.ok(packReport.size > 0 && packReport.size < 32 * 1024 * 1024);
  assert.ok(packReport.unpackedSize > 0 && packReport.unpackedSize < 128 * 1024 * 1024);
  const files = packReport.files.map(row => ({ path: row.path, size: row.size, mode: row.mode })).sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert.ok(files.length > 0 && files.length < 2048);
  assert.equal(new Set(files.map(row => row.path)).size, files.length);
  for (const row of files) {
    assert.ok(!row.path.startsWith('/') && !row.path.split('/').includes('..'));
    assert.ok(!/(?:^|\/)(?:\.git|\.gkx|\.env(?:\..*)?|\.npmrc|node_modules|__pycache__|\.cache|\.tmp|\.work|private)(?:\/|$)/i.test(row.path));
    assert.ok(!/\.(?:pem|key|sqlite|sqlite3|db|log|pyc|pyo)$/i.test(row.path));
  }
  assert.equal(sha256(JSON.stringify(files)), record.fileInventorySha256);
  return { filename: packReport.filename, sha256: record.tarballSha256, integrity: record.tarballIntegrity, fileCount: files.length, fileInventorySha256: record.fileInventorySha256 };
}
function git(...args) { return execFileSync('git', args, { encoding:'utf8' }).trim(); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const head = git('rev-parse','HEAD');
    const record = validateApproval(JSON.parse(process.env.GKOS_220_APPROVAL_JSON ?? 'null'), head);
    assert.ok(!process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN);
    assert.equal(git('rev-parse','--is-shallow-repository'), 'false');
    assert.equal(git('status','--porcelain','--untracked-files=all'), '');
    assert.equal(process.env.GITHUB_REF, 'refs/tags/v2.2.0');
    assert.equal(process.env.GITHUB_SHA, head);
    assert.equal(git('cat-file','-t','refs/tags/v2.2.0'), 'tag');
    assert.equal(git('rev-parse','refs/tags/v2.2.0^{commit}'), head);
    assert.equal(JSON.parse(readFileSync('package.json','utf8')).version, '2.2.0');
    git('merge-base','--is-ancestor',head,'origin/main');
    if (process.argv[2] === '--artifact') {
      assert.equal(sha256(readFileSync(resolve(process.env.RUNNER_TEMP, 'release-evidence', 'qualified-evidence.zip'))), record.evidenceBundleSha256);
      const reports = JSON.parse(readFileSync(process.argv[4], 'utf8'));
      assert.equal(reports.length, 1);
      console.log(JSON.stringify(verifyArtifact(record, readFileSync(process.argv[3]), reports[0])));
    } else {
      assert.equal(process.argv.length, 2);
      console.log(JSON.stringify({ status:'PASS', sourceCommit:head, approvalSha256:sha256(process.env.GKOS_220_APPROVAL_JSON) }));
    }
  } catch { console.error('RELEASE_220_PREFLIGHT_REFUSED'); process.exitCode=1; }
}
