import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = process.argv[2] ?? '[LOCAL_PATH]';
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 128e6 });
const manifestPath = root + '/contracts/runtime-qualification/v1/change-inventory.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const prior = new Map(manifest.candidate_changes.map(row => [row.path, row]));
const reasons = {
  "test/service-stdio-package.test.mjs": "Make package setup abort-aware with bounded phase diagnostics, one explicit build, ordered cleanup and safe npm report parsing; retain real authenticated installed-package assertions and unchanged deadlines.",
  "src/retrieval/coordinator.ts": "Bound only Engine-native, unique-path eligible source reads to four after policy/filter/time admission; preserve custom/repeated-path serial semantics, every freshness check and deterministic result processing.",
  "src/retrieval/native-read.ts": "Internal four-worker ordered read primitive; retain failed-read refusal values and drain all admitted work before returning; not a public API.",
  "test/retrieval-native-read.test.mjs": "Test exact four-read bound, ordered completion, failure draining, duplicate helper refusal, serial custom callbacks and native/custom stale-source result equality.",
  "docs/NATIVE-RETRIEVAL-READ-REMEDIATION.md": "Record bounded native-read diagnostics and isolated repair limits without dismissing the old latency failure or claiming new candidate qualification.",
  "test/determinism.test.mjs": "Regress edited and permuted source traversal: exact full ordered node/link equality and link identities must converge with a clean rebuild while parsing only changed content.",
  "docs/GRAPH-CONVERGENCE-REMEDIATION-20260908.md": "Record the soak-pilot ordering defect, independently reproduced link-ID drift, canonical assembly repair and pending new-candidate qualification; preserve failed evidence.",
  "src/ingest/source-scan.ts": "Bound independent secure watcher file probes to four; retain serial public Phase3 scanning, every capability/TOCTOU check, both complete snapshots and deterministic ordering; drain work before descent or failure.",
  "test/watcher-source-scan.test.mjs": "Assert bounded concurrent opens across nested directories, exact stable scan evidence and no pending file work after refusal.",
  "test/watcher-large-restart.test.mjs": "Retain the unchanged large graph, hardlink refusal, same-parent shutdown retry and pointer assertions; emit bounded shutdown duration for CI diagnosis.",
  "docs/WINDOWS-QUALIFICATION-REMEDIATION-20260908.md": "Record exact failed candidate evidence, measured secure scan bottleneck, bounded implementation repair and remaining exact-head qualification gates without relaxing limits.",
  "src/incremental.ts": "Group candidates once to avoid quadratic unchanged scans; sort representative source paths before assembly so incremental history cannot alter link order or generated IDs; preserve all candidate, reuse and validation checks.",
  "docs/CURRENT_CAPABILITIES.md": "Describe implemented separate durable no-op audit while preserving unqualified scale/soak and filesystem limitations.",
  "docs/RELEASE-STATUS.md": "Record exact candidate focused evidence without claiming publication or completion of remaining mandatory gates.",
  '.github/workflows/npm-release-2.2.yml': 'Add immutable exact-tag OIDC-only release workflow that refuses absent approval/evidence and mismatched source or tarball; no release triggered.',
  '.github/workflows/sidecar-release.yml': 'Preserve binary builds and artifacts; prevent v2.2.0 sidecar uploads from prematurely creating or rewriting official stable release notes.',
  'scripts/release-220-preflight.mjs': 'Fail closed on any missing mandatory exact-commit gate, incomplete soak, missing evidence binding, wrong tag or inspected tarball digest/inventory.',
  'test/release-220-preflight.test.mjs': 'Negative and positive preflight tests for mandatory gates, source identity, soak length, archive digests and package inventory.',
  'docs/NPM-2.2-OWNER-ACTIONS.md': 'Provide exact npm trusted-publisher and protected GitHub environment setup; preserve absent owner-account and final qualification blockers.',
  '.github/workflows/managed-moc-audit-2.2.yml': 'Run native no-change process-exit, failure and receipt tests on mandatory Linux/Windows Node22/24 with bounded environment/test evidence.',
  'src/navigation-effects/planner.ts': 'Add explicit opt-in durable no-change plan with reconciliation identity while preserving default pure no-op behavior.',
  'src/navigation-effects/moc-batch.ts': 'Forward explicit no-change audit planning option for the managed Node host.',
  'src/navigation-effects/node/moc-host.ts': 'Execute byte-identical managed plans through durable executor; bind reconciliation identity and suppress false source-change callbacks.',
  'src/navigation-effects/node/executor.ts': 'Persist separate versioned NO_CHANGE audits before terminal completion; verify on replay, revalidate interrupted no-ops, retain exact failure/refusal semantics.',
  'test/navigation-effects-host.test.mjs': 'Assert original journal prefix and exact new no-change terminal sequence rather than expecting absent audits.',
  'test/managed-moc-no-change.test.mjs': 'Native no-change receipts, idempotency, five process-exit recovery phases, corrupt-audit refusal and actual destination write failure.',
  'docs/MANAGED-MOC-NO-CHANGE-AUDIT.md': 'Specify separate no-change audit artifact and truthful file-sync/recovery guarantees and remaining durability gates.',
  'README.md': 'Retain current capability documentation and add reviewed full-history verification instructions from PR #47.',
  'docs/USEFULNESS-AUDIT-FOLLOWUP-20260908.md': 'Preserve PR #47 exact bounded failure diagnosis and follow-up record.',
  'scripts/run-retrieval-observation-qualification.mjs': 'Retain existing current qualification adaptation; add only PR #47 allowlisted diagnostic output.',
  '.github/workflows/phase4-retrieval-observation.yml': 'Name historical Engine 2.1.2 lane and execute the exact last successful historical source with full history.',
  '.github/workflows/observation-2.2.yml': 'Add a distinct fail-closed Linux 2.2 observation workflow with bounded artifact upload.',
  'scripts/observation-2.2-material.mjs': 'Independently construct 2.2 projection preimages without production indexing or canonicalization.',
  'scripts/generate-retrieval-observation-fixture-2.2.mjs': 'Bind separately versioned 2.2 fixture to reviewed fixed expected digests; preserve historical bytes.',
  'scripts/run-retrieval-observation-qualification-2.2.mjs': 'Separate 2.2 runner with strict source binding, complete manifest checks and native vector reuse verification; preserve workload and p95.',
  'test/retrieval-observation-2.2.test.mjs': 'Test fixed pins, fail-closed oracle substitution, workflow separation, and actual native 10k SQLite convergence/reuse.',
  'test/retrieval-observation-qualification.test.mjs': 'Retain exact historical workflow hash via immutable Git object; successor workflow contract is tested separately.',
  'docs/OBSERVATION-2.2-QUALIFICATION.md': 'Document distinct historical/current identities, workload, digest derivation and limitations.',
  'evidence/2026-09-08-release-220-starting-state.md': 'Record exact reconciled release starting coordinates, open work, environment and unmet gates.',
};
const audited = new Map(git('ls-tree','-r','-z',manifest.audited).toString().split('\0').filter(Boolean).map(row => {const [meta,path] = row.split('\t'); return [path,meta.split(' ')[2]];}));
const files = new Set([...audited.keys(), ...git('ls-files','-z','--cached','--others','--exclude-standard').toString().split('\0').filter(Boolean)]);
const changes = [];
for (const path of [...files].sort()) {
  if (path === 'contracts/runtime-qualification/v1/change-inventory.json') continue;
  const bytes = existsSync(root+'/'+path) ? readFileSync(root+'/'+path) : null;
  const blob = bytes && createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if ((audited.get(path) ?? null) === blob) continue;
  const after = bytes && createHash('sha256').update(bytes).digest('hex');
  const previous = prior.get(path);
  const rationale = reasons[path] ?? (previous?.after === after ? previous.rationale : null);
  if (!rationale) throw new Error('Unreviewed changed path: '+path);
  changes.push({ path, before: audited.get(path) ?? null, after, rationale });
}
manifest.candidate_changes = changes;
writeFileSync(manifestPath, JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({ candidate_changes: changes.length }));

