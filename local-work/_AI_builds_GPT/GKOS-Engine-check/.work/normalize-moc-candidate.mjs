import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const paths = execFileSync('git', ['diff', '--name-only', '-z', 'd81f9d1351f1a9228650a840629191a92f2dfb22', 'HEAD']).toString().split('\0').filter(Boolean);
let count = 0;
for (const path of paths) {
  const old = readFileSync(path, 'utf8');
  const next = old.replace(/\r\n/g, '\n');
  if (old !== next) { writeFileSync(path, next, 'utf8'); count++; }
}
console.log(JSON.stringify({ normalizedCandidateFiles: count }));
