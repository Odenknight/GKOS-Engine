#!/usr/bin/env node

const hostUrl = new URL("../dist/watcher-host.mjs", import.meta.url);
let host;
try { host = await import(hostUrl.href); }
catch {
  process.stderr.write("gkos status: operational failure\n");
  process.exitCode = 3;
}

if (host) {
  const result = await host.runGkosCli(process.argv.slice(2), {
    reset_journal: host.resetWatcherJournalState,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exit_code;
}
