import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('optional managed ledger passes real-process persistence fixtures', {timeout:35000}, () => {
  const result=spawnSync(process.env.PYTHON || (process.platform==='win32'?'python':'python3'),
    ['-m','unittest','discover','-s','services/gkos-graphiti/tests','-v'],
    {cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:30000,maxBuffer:100000});
  assert.ifError(result.error);
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
});
