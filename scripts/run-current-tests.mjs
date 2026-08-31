import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
// Q-GUARD: the unchanged historical test executes at its fixed checkout in
// the separate historical lane. Current integrity is tested by qualification.
const historical = 'agent-identity-mcp-contract.test.mjs';
const files = readdirSync(join(root, 'test')).filter(name => name.endsWith('.test.mjs') && name !== historical).sort();
if (!files.length) throw new Error('Current test inventory is empty');
const result = spawnSync(process.execPath, ['--test', ...files.map(name => join(root, 'test', name))], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
