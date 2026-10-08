import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { AUDITED, MANIFEST, treeEntries } = await import(pathToFileURL(resolve('scripts/runtime-qualification.mjs')));
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const tree = treeEntries(process.cwd(), AUDITED);
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).toString().split('\0').filter(Boolean);
const known = new Map(manifest.candidate_changes.map(row => [row.path, row]));
const rows = [...new Set([...tree.keys(), ...files])].sort().filter(p => p !== MANIFEST).flatMap(path => {
  const bytes = existsSync(path) ? readFileSync(path) : null;
  const blob = bytes ? createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') : null;
  if ((tree.get(path) ?? null) === blob) return [];
  const after = bytes ? createHash('sha256').update(bytes).digest('hex') : null;
  const previous = known.get(path);
  return [{ path, before: tree.get(path) ?? null, after, rationale: previous?.after === after ? previous.rationale : 'Engine 2.2 MOC implementation: reviewed host/recovery, assistance, tests, version, docs and development dependency repair; frozen evidence unchanged.' }];
});
const oldSection = JSON.stringify(manifest.candidate_changes, null, 2).split('\n').map(l => '  ' + l);
const newSection = JSON.stringify(rows, null, 2).split('\n').map(l => '  ' + l);
oldSection[0] = '  "candidate_changes": [';
newSection[0] = '  "candidate_changes": [';
console.log(JSON.stringify({ patch: '*** Begin Patch\n*** Update File: ' + resolve(MANIFEST).replaceAll('\\', '/') + '\n@@\n' + oldSection.map(l => '-' + l).join('\n') + '\n' + newSection.map(l => '+' + l).join('\n') + '\n*** End Patch', count: rows.length }));
process.exit(0);
const format = row => JSON.stringify(row, null, 2).split('\n').map(l => '    ' + l);
let patch = '*** Begin Patch\n*** Update File: ' + resolve(MANIFEST).replaceAll('\\', '/') + '\n';
for (const row of rows) {
  const prev = known.get(row.path);
  if (prev && JSON.stringify(prev) !== JSON.stringify(row)) {
    const before = format(prev), after = format(row);
    if (row.path !== manifest.candidate_changes.at(-1).path) { before[before.length - 1] += ','; after[after.length - 1] += ','; }
    patch += '@@\n' + before.map(l => '-' + l).join('\n') + '\n' + after.map(l => '+' + l).join('\n') + '\n';
  }
}
let additions = [];
for (const row of rows) {
  if (!known.has(row.path)) additions.push(row);
  else if (additions.length) {
    patch += '@@\n' + additions.flatMap(r => { const lines = format(r); lines[lines.length - 1] += ','; return lines; }).map(l => '+' + l).join('\n') + '\n     {\n       "path": ' + JSON.stringify(row.path) + ',\n';
    additions = [];
  }
}
if (additions.length) throw Error('Unexpected terminal additions: ' + additions.map(r => r.path));
patch += '*** End Patch';
console.log(JSON.stringify({ patch, count: rows.length }));
