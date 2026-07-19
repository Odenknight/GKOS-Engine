import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function run(bin, args, cwd) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [bin, ...args], cwd ? { cwd } : undefined);
    return { stdout, code: 0 };
  } catch (e) {
    return { stdout: e.stdout ?? "", code: e.code ?? 1 };
  }
}

// A minimal flat OKF+ 2.3 note so `validate` produces stable, non-trivial output.
const NOTE = `---
okf_version: "2.3"
uid: "019b2d14-4230-7db7-87d4-7d81cfaec9c0"
title: "Symlink fixture"
type: "semantic"
created_at: "2026-07-01T00:00:00Z"
updated_at: "2026-07-02T00:00:00Z"
epistemic_state: "fact"
sensitivity: "restricted"
authorship_origin: "authored"
tags:
- alpha
- beta
---
Body.`;

// Reproduces the invocation-through-a-symlinked-package-dir scenario that broke
// the naive `pathToFileURL(argv[1]).href === import.meta.url` guard. On Windows,
// plain symlinks require elevation, so we use a directory "junction" (no
// privileges needed) pointing at the package root. The bin is then invoked via
// the junction path; Node resolves import.meta.url to the REAL path while
// argv[1] keeps the junction path, exercising the exact mismatch that made the
// unfixed guard false — causing a silent exit-0 no-op.
test("okf invoked through a symlinked/junctioned package dir still runs", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "gkos-symlink-"));
  const linkRoot = join(tmp, "linked-pkg");
  const notesDir = join(tmp, "notes");
  mkdirSync(notesDir, { recursive: true });
  writeFileSync(join(notesDir, "note.md"), NOTE);

  let linked = false;
  try {
    try {
      symlinkSync(root, linkRoot, "junction");
      linked = true;
    } catch {
      try {
        symlinkSync(root, linkRoot, "dir");
        linked = true;
      } catch {
        linked = false;
      }
    }

    if (!linked) {
      // Symlink/junction creation genuinely unavailable. Fall back to driving
      // the module with a spoofed argv[1] that differs from the real path and
      // assert it does NOT falsely auto-run (guard stays import-safe).
      const bin = join(root, "bin/okf.mjs");
      const spoofed = join(root, "some", "other", "invoked", "path.mjs");
      const { stdout } = await execFileAsync(
        process.execPath,
        ["-e", `process.argv[1] = ${JSON.stringify(spoofed)}; await import(${JSON.stringify(bin)});`],
        { cwd: root }
      );
      assert.equal(stdout, "", "import with mismatched argv[1] must stay side-effect-free");
      return;
    }

    const linkedBin = join(linkRoot, "bin/okf.mjs");
    const directBin = join(root, "bin/okf.mjs");

    // --help through the junctioned path: must exit 0 with non-empty stdout.
    const help = await run(linkedBin, ["--help"]);
    assert.equal(help.code, 0, "exit 0 through junctioned path");
    assert.ok(help.stdout.length > 0, "non-empty stdout through junctioned path");

    // validate through the junction must be byte-identical to the direct path.
    const viaLink = await run(linkedBin, ["validate", notesDir]);
    const viaDirect = await run(directBin, ["validate", notesDir]);
    assert.equal(viaLink.code, viaDirect.code, "same exit code junction vs direct");
    assert.equal(viaLink.stdout, viaDirect.stdout, "byte-identical validate output junction vs direct");
    assert.ok(viaLink.stdout.length > 0, "validate produced output through junction");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
