// Read-only integrity/link checker for this planning bundle; not application qualification.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const main = 'GKOS-ECOSYSTEM-TS-FIRST-RUST-ROADMAP.md';
const manifestName = 'BUNDLE-MANIFEST.json';
const allowed = new Set(['.md', '.json', '.txt', '.mjs']);
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
const slash = value => value.split(sep).join('/');
const paths = [];

function walk(folder) {
  for (const entry of readdirSync(resolve(base, folder), { withFileTypes: true })) {
    const name = folder ? `${folder}/${entry.name}` : entry.name;
    const stat = lstatSync(resolve(base, name));
    assert.ok(!stat.isSymbolicLink(), `Symlink excluded from evidence bundle: ${name}`);
    if (entry.isDirectory()) walk(name);
    else {
      assert.ok(entry.isFile() && allowed.has(extname(name)), `Unexpected bundle file: ${name}`);
      paths.push(name);
    }
  }
}

paths.push(main);
for (const folder of ['reports', 'sources', 'scripts']) walk(folder);
paths.sort();
assert.equal(new Set(paths).size, paths.length, 'Duplicate bundle path');
const files = paths.map(path => {
  const bytes = readFileSync(resolve(base, path));
  assert.ok(bytes.length < 5 * 1024 * 1024, `Unexpectedly large evidence file: ${path}`);
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return {
    path,
    bytes: bytes.length,
    sha256: hash('sha256', bytes),
    git_blob_sha1: hash('sha1', Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])),
  };
});

const manifest = {
  schema: 'roadmap-evidence-bundle/v1',
  audit_date: '2026-08-31',
  standing: 'planning_and_audit_only',
  file_count: files.length,
  total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
  manifest_self_hash_excluded: true,
  files,
};

if (process.argv[2] === '--manifest') {
  process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
} else {
  assert.equal(process.argv.length, 2, 'Usage: node scripts/verify-roadmap.mjs [--manifest]');
  const recorded = JSON.parse(readFileSync(resolve(base, manifestName), 'utf8'));
  assert.deepEqual(recorded, manifest, 'Recorded inventory/hash/byte identity differs from current files');
  const inventory = new Set(paths);
  let localLinks = 0;
  for (const path of paths) {
    const text = readFileSync(resolve(base, path), 'utf8');
    if (path.endsWith('.json')) JSON.parse(text);
    if (!path.endsWith('.md')) continue;
    for (const match of text.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
      let target = match[1].trim();
      if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
      if (/^https?:\/\//i.test(target) || target.startsWith('#')) continue;
      assert.ok(!/^[a-z][a-z0-9+.-]*:/i.test(target), `Nonportable link in ${path}: ${target}`);
      target = decodeURIComponent(target.split('#')[0]);
      if (!target) continue;
      const absolute = resolve(dirname(resolve(base, path)), target);
      const inside = slash(relative(base, absolute));
      assert.ok(inside !== '..' && !inside.startsWith('../') && !/^[a-z]:/i.test(inside), `Escaping link in ${path}: ${target}`);
      assert.ok(inventory.has(inside) || inside === manifestName || paths.some(item => item.startsWith(inside.replace(/\/$/, '') + '/')), `Missing or case-mismatched bundle link in ${path}: ${target}`);
      localLinks++;
    }
  }
  const roadmap = readFileSync(resolve(base, main), 'utf8');
  assert.deepEqual([...roadmap.matchAll(/^### R4-(\d+) — /gm)].map(match => Number(match[1])), Array.from({ length: 13 }, (_, i) => i), 'Missing, duplicate or misordered r4 phase');
  assert.deepEqual([...roadmap.matchAll(/^### T(\d\d)(?: — | \/ )/gm)].map(match => Number(match[1])), Array.from({ length: 13 }, (_, i) => i), 'Missing, duplicate or misordered TS packet');
  for (const repository of ['Odenknight/gkos-standard', 'Odenknight/GKOS-Engine', 'Odenknight/GKOS-Engine-Lite', 'Odenknight/Kosmos-Oden', 'Odenknight/gkos-hindsight-governance', 'Odenknight/GKOS-Observatory', 'mariusTalpos/gkos-engine-benchmark', 'Odenknight/theMarshal-Core-Rust']) {
    assert.ok(roadmap.includes(`https://github.com/${repository}`), `Missing requested repository: ${repository}`);
  }
  process.stdout.write(JSON.stringify({ result: 'PASS', standing: manifest.standing, files: files.length, total_bytes: manifest.total_bytes, local_links_checked: localLinks, r4_phases: 13, ts_packets: 13, repository_references: 8 }) + '\n');
}
