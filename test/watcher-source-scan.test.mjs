import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, linkSync, mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  normalizeWatcherHint,
  projectPhase3ScanRejections,
  scanPhase3Corpus,
  secureWatcherSourceScan,
} from "../dist/watcher-host.mjs";
import { buildIngestValidationPlan, loadIngestProfile } from "../dist/ingest-host.mjs";

function vault(t) {
  const root = mkdtempSync(join(tmpdir(), "gkos-watcher-scan-"));
  if (process.platform !== "win32") chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function put(root, relative, value) {
  const target = join(root, ...relative.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
}

test("secure scan retains ordinary archives and excludes only exact automatic namespaces", async (t) => {
  const root = vault(t);
  put(root, "A.md", "# A\n");
  put(root, "archive/kept.md", "# kept\n");
  put(root, "_archive/ordinary/kept.md", "# ordinary\n");
  put(root, "_archive/moc-runs/run.md", "# ignored\n");
  put(root, ".gkx/internal.md", "# ignored\n");
  put(root, "asset.png", Buffer.from([1, 2, 3]));
  put(root, "ordinary.json", "{}\n");
  put(root, "ordinary.txt", "plain\n");
  const phase3 = await scanPhase3Corpus(root, { ingest: true, extra_exclusions: ["_archive/moc-runs"] });
  const scan = await secureWatcherSourceScan(root);
  assert.deepEqual(scan.files.map((file) => file.relativePath), ["A.md", "_archive/ordinary/kept.md", "archive/kept.md"]);
  assert.deepEqual(scan.attachments, ["asset.png", "ordinary.json"]);
  assert.deepEqual(scan.files, phase3.files);
  assert.deepEqual(scan.folders, phase3.folders);
  assert.deepEqual(scan.attachments, phase3.attachments);
  assert.equal(scan.identities.length, 5);
  assert.match(scan.namespace_digest, /^sha256:[0-9a-f]{64}$/u);
});

test("secure scan keeps fatal UTF-8 unstable and projects deterministic size rejection into exact Phase3 rows", async (t) => {
  const badUtf8 = vault(t);
  put(badUtf8, "bad.md", Buffer.from([0xc3, 0x28]));
  await assert.rejects(secureWatcherSourceScan(badUtf8), /WATCHER_SOURCE_CAPABILITY_UNSTABLE/u);

  const oversized = vault(t);
  put(oversized, "large.md", "");
  truncateSync(join(oversized, "large.md"), 64 * 1024 * 1024 + 1);
  const rejected = await secureWatcherSourceScan(oversized);
  const projected = projectPhase3ScanRejections(rejected.scan_rejections);
  assert.deepEqual(projected, [{
    source_path: "large.md",
    source_digest: null,
    size: 64 * 1024 * 1024 + 1,
    classification: "rejected",
    reason_codes: ["SOURCE_SIZE_LIMIT_EXCEEDED"],
  }]);
  assert.deepEqual(Object.keys(projected[0]), [
    "source_path", "source_digest", "size", "classification", "reason_codes",
  ]);
  const profile = await loadIngestProfile(null);
  const plan = buildIngestValidationPlan({
    files: rejected.files,
    folders: rejected.folders,
    attachments: rejected.attachments,
    scan_rejections: projected,
  }, profile);
  assert.equal(plan.result.rejections.length, 1);
  assert.deepEqual(plan.result.rejections[0].findings.map((row) => row.code), ["SOURCE_SIZE_LIMIT_EXCEEDED"]);

  const hardlinks = vault(t);
  put(hardlinks, "a.md", "# a\n");
  linkSync(join(hardlinks, "a.md"), join(hardlinks, "b.md"));
  await assert.rejects(secureWatcherSourceScan(hardlinks), /WATCHER_SOURCE_CAPABILITY_UNSTABLE/u);

  const changing = vault(t);
  put(changing, "a.md", "# a\n");
  await assert.rejects(secureWatcherSourceScan(changing, {
    on_after_file_open(sourcePath) {
      if (sourcePath === "a.md") writeFileSync(join(changing, "a.md"), "# changed\n");
    },
  }), /WATCHER_SOURCE_CAPABILITY_UNSTABLE/u);
});

test("watch hints are advisory and unsafe names force unscoped reconciliation", () => {
  assert.equal(normalizeWatcherHint("notes\\A.md"), "notes/A.md");
  assert.equal(normalizeWatcherHint("_archive/moc-runs/run.md"), "");
  assert.equal(normalizeWatcherHint("../escape.md"), null);
  assert.equal(normalizeWatcherHint("note.md:ads"), null);
  assert.equal(normalizeWatcherHint(""), null);
  assert.equal(normalizeWatcherHint("bad\ud800.md"), null);
});


test("secure scans bound concurrent opens across nested directories and preserve ordered evidence", { timeout: 10000 }, async (t) => {
  const root = vault(t);
  for (let i = 0; i < 12; i++) put(root, `note-${String(i).padStart(2, "0")}.md`, `# Note ${i}\n`);
  for (let i = 0; i < 8; i++) put(root, `nested/note-${i}.md`, `# Nested ${i}\n`);
  const expected = await secureWatcherSourceScan(root);
  let active = 0, peak = 0, completed = 0, arrived = 0;
  let releaseFirst;
  const firstBatch = new Promise(resolve => { releaseFirst = resolve; });
  const actual = await secureWatcherSourceScan(root, {
    async on_after_file_open(path) {
      active++; peak = Math.max(peak, active);
      if (++arrived === 4) releaseFirst();
      await firstBatch;
      await new Promise(resolve => setTimeout(resolve, path.endsWith("0.md") ? 8 : 1));
      active--; completed++;
    },
  });
  assert.equal(completed, 20);
  assert.equal(active, 0);
  assert.equal(peak, 4, "the global scan bound is four even across directory descent");
  assert.deepEqual(actual, expected, "completion order cannot change files, identities or namespace digest");
});

test("a failed concurrent secure scan drains file work before returning refusal", async (t) => {
  const root = vault(t);
  for (let i = 0; i < 8; i++) put(root, `note-${i}.md`, `# Note ${i}\n`);
  let active = 0, completed = 0;
  await assert.rejects(secureWatcherSourceScan(root, {
    async on_after_file_open(path) {
      active++;
      try {
        await new Promise(resolve => setTimeout(resolve, path === "note-0.md" ? 1 : 8));
        if (path === "note-0.md") throw new Error("fixture read failure");
      } finally { active--; completed++; }
    },
  }), /WATCHER_SOURCE_CAPABILITY_UNSTABLE/u);
  assert.equal(active, 0, "no pending open hook may race recovery after refusal");
  assert.equal(completed, 8);
});
