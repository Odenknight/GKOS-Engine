import{readFileSync,writeFileSync}from'node:fs';const p='test/service-stdio-package.test.mjs';let s=readFileSync(p,'utf8');s=s.replace('execFileSync, spawn','execFile, spawn').replace('realpathSync, rmSync, writeFileSync','realpathSync, writeFileSync');s='import { promisify } from "node:util";\nimport { rm } from "node:fs/promises";\n'+s;
const marker='test("npm CLI discovery works outside an npm lifecycle",';const helpers=`const execFileAsync = promisify(execFile);
async function setupPhase(t, phase, executable, args, options = {}, onChild) {
  assert.match(phase, /^[a-z_]+$/u);
  const start = performance.now();
  t.diagnostic(JSON.stringify({ phase, status: "START" }));
  try {
    const pending = execFileAsync(executable, args, { ...options, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true, signal: t.signal });
    onChild?.(pending.child);
    const result = await pending;
    t.diagnostic(JSON.stringify({ phase, status: "PASS", elapsed_ms: performance.now() - start }));
    return result.stdout;
  } catch {
    t.diagnostic(JSON.stringify({ phase, status: "FAIL", elapsed_ms: performance.now() - start }));
    throw new Error("PACKAGE_QUALIFICATION_" + phase.toUpperCase() + "_FAILED");
  }
}
function packedFilename(output) {
  const start = output.search(/^[ \\t]*[\\[{]/mu);
  assert.ok(start >= 0, "npm pack did not emit its JSON report");
  const report = JSON.parse(output.slice(start));
  if (Array.isArray(report)) assert.equal(report.length, 1);
  const entry = Array.isArray(report) ? report[0] : report;
  assert.match(entry?.filename ?? "", /^gkos-engine-[0-9][A-Za-z0-9.+-]*\\.tgz$/u);
  return entry.filename;
}
test("package setup cancellation terminates the spawned process", async () => {
  const controller = new AbortController(); let closed;
  const pending = setupPhase({ signal: controller.signal, diagnostic() {} }, "abort_probe", process.execPath,
    ["-e", "setInterval(() => {}, 1000)"], {}, child => {
      closed = new Promise(resolveClose => child.once("close", resolveClose));
      child.once("spawn", () => controller.abort());
    });
  await assert.rejects(pending, { message: "PACKAGE_QUALIFICATION_ABORT_PROBE_FAILED" });
  await closed;
});
test("npm pack JSON accepts one array or object report and refuses unsafe filenames", () => {
  for (const value of [{ filename: "gkos-engine-2.2.0.tgz" }, [{ filename: "gkos-engine-2.2.0.tgz" }]]) {
    assert.equal(packedFilename(JSON.stringify(value)), "gkos-engine-2.2.0.tgz");
  }
  for (const value of [[], [{ filename: "a.tgz" }, { filename: "b.tgz" }], { filename: "../outside.tgz" }]) {
    assert.throws(() => packedFilename(JSON.stringify(value)));
  }
});

`;
if(!s.includes(marker))throw Error('marker missing');s=s.replace(marker,helpers+marker);
s=s.replace('  t.after(() => rmSync(temporary, { recursive: true, force: true }));',`  let server, child, bridgeClosed;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) child.kill();
    if (bridgeClosed) await bridgeClosed;
    if (server) {
      server.closeAllConnections();
      await new Promise(resolveClose => server.close(() => resolveClose()));
    }
    assert.ok(resolve(temporary).startsWith(CANONICAL_TEMPORARY_ROOT + (process.platform === "win32" ? "\\\\" : "/")));
    await rm(temporary, { recursive: true, force: true });
  });`);
const begin=s.indexOf('  // npm pack may run prepare');const end=s.indexOf('  const launcher =',begin);if(begin<0||end<0)throw Error('setup missing');s=s.slice(0,begin)+`  // Build once in an isolated clean clone. Every setup subprocess observes
  // the unchanged test deadline, rather than blocking timeout delivery.
  const source = join(temporary, "source");
  await setupPhase(t, "clone", "git", ["clone", "--quiet", "--shared", ROOT, source]);
  await setupPhase(t, "install_source", process.execPath, [npmCli, "ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: source });
  await setupPhase(t, "build_source", process.execPath, ["scripts/build.mjs"], { cwd: source });
  const packOutput = await setupPhase(t, "pack", process.execPath, [npmCli, "pack", "--ignore-scripts", "--json", "--pack-destination", temporary], { cwd: source });
  const archive = join(temporary, packedFilename(packOutput));
  writeFileSync(join(temporary, "package.json"), '{"private":true}\\n');
  await setupPhase(t, "install_consumer", process.execPath, [npmCli, "install", "--ignore-scripts", "--no-audit", "--no-fund", archive], { cwd: temporary });
`+s.slice(end);
s=s.replace('  const server = http.createServer','  server = http.createServer');s=s.replace('  await once(server, "listening");\n  t.after(() => { if (server.listening) server.close(); });','  await once(server, "listening", { signal: t.signal });');s=s.replace('  const child = spawn','  child = spawn');s=s.replace('    stdio: ["pipe", "pipe", "pipe"],','    stdio: ["pipe", "pipe", "pipe"],\n    signal: t.signal,\n    windowsHide: true,');s=s.replace('  const stdout = [];','  bridgeClosed = new Promise(resolveClose => child.once("close", code => resolveClose(code)));\n  child.on("error", () => {}); // Abort is reported by the unchanged test deadline.\n  const stdout = [];');s=s.replace('  const [code] = await once(child, "close");\n  server.close();\n  await once(server, "close");','  const code = await bridgeClosed;\n  await new Promise(resolveClose => server.close(() => resolveClose()));');writeFileSync(p,s);