import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { runIngestIndex } from '../../bin/gkx.mjs';

const root = await mkdtemp(join(tmpdir(), 'gkos-ingest-rename-fault-'));
const state = join(root, '.gkx', 'derived', 'retrieval');
await writeFile(join(root, 'note.md'), `---
gkx_version: "2.3"
uid: "018f0000-0000-7000-8000-000000000699"
title: "Rename retry"
type: "policy"
created_at: "2026-08-01T00:00:00Z"
epistemic_state: "reported"
sensitivity: "public"
---
# Rename retry
visible
`, 'utf8');

let result = null;
let error = null;
try { result = await runIngestIndex(root); }
catch (caught) { error = { code: caught?.code ?? null, message: caught?.message ?? String(caught) }; }

const entries = await readdir(state).catch(() => []);
const authority = await readFile(join(state, 'ingest-authority.json'), 'utf8').catch(() => null);
process.stdout.write(`${JSON.stringify({
  scenario: process.env.GKOS_TEST_AUTHORITY_RENAME_FAULT,
  attempts: globalThis.__gkosAuthorityRenameAttempts,
  wait_mutations: globalThis.__gkosAuthorityWaitMutations,
  result_status: result?.status ?? null,
  error,
  entries: entries.sort(),
  authority,
})}\n`);
const resolvedRoot = resolve(root);
if (dirname(resolvedRoot) !== resolve(tmpdir()) || !basename(resolvedRoot).startsWith('gkos-ingest-rename-fault-')) {
  throw new Error('refusing cleanup outside owned temporary fixture');
}
await rm(root, { recursive: true, force: true });
