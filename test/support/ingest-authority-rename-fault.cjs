'use strict';

const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const { basename, dirname, join } = require('node:path');

const originalRenameSync = fs.renameSync;
const scenario = process.env.GKOS_TEST_AUTHORITY_RENAME_FAULT;
globalThis.__gkosAuthorityRenameAttempts = 0;
globalThis.__gkosAuthorityWaitMutations = 0;

const originalWait = Atomics.wait;
Atomics.wait = function injectedAuthorityWait() {
  if (scenario === 'pointer-changed-during-wait' && arguments[3] === 25 && globalThis.__gkosAuthorityWaitPointer) {
    fs.writeFileSync(globalThis.__gkosAuthorityWaitPointer, '{}\n');
    globalThis.__gkosAuthorityWaitPointer = null;
    globalThis.__gkosAuthorityWaitMutations += 1;
  }
  return originalWait.apply(this, arguments);
};

fs.renameSync = function injectedAuthorityRename(source, destination) {
  if (basename(destination.toString()) !== 'ingest-authority.json' || !/\.tmp$/u.test(source.toString())) {
    return originalRenameSync.apply(this, arguments);
  }
  globalThis.__gkosAuthorityRenameAttempts += 1;
  const attempt = globalThis.__gkosAuthorityRenameAttempts;
  if (scenario === 'transient' && attempt > 1) return originalRenameSync.apply(this, arguments);
  if (scenario === 'temp-changed' && attempt === 1) fs.appendFileSync(source, 'changed');
  if (scenario === 'witness-changed' && attempt === 1) fs.writeFileSync(destination, '{}\n');
  if (scenario === 'lock-changed' && attempt === 1) {
    fs.writeFileSync(join(dirname(destination.toString()), 'ingest-authority.lock'), '{}\n');
  }
  if (scenario === 'pointer-changed' && attempt === 1) fs.writeFileSync(join(dirname(destination.toString()), 'active-ingest.json'), '{}\n');
  if (scenario === 'pointer-changed-during-wait' && attempt === 1) {
    globalThis.__gkosAuthorityWaitPointer = join(dirname(destination.toString()), 'active-ingest.json');
  }
  if (scenario === 'namespace-changed' && attempt === 1) fs.writeFileSync(join(dirname(destination.toString()), 'ingest-foreign.json'), 'changed');
  const error = new Error(`injected authority rename failure ${attempt}`);
  error.code = scenario === 'nonretryable' ? 'EACCES' : 'EPERM';
  throw error;
};

syncBuiltinESMExports();
