import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
const cli = resolve("bin/gkx.mjs");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "gkx-nav-cli-"));
  await mkdir(join(root, "topic"));
  await mkdir(join(root, "_archive", "moc-runs", "demo"), { recursive: true });
  await writeFile(join(root, "topic", "Public.md"), "---\nuid: 123e4567-e89b-42d3-a456-426614174000\nsensitivity: public\ntitle: Public\n---\nPUBLIC-BODY\n");
  await writeFile(join(root, "topic", "Secret.md"), "---\nuid: 123e4567-e89b-42d3-a456-426614174001\nsensitivity: secret\ntitle: SECRET-TITLE\n---\nSECRET-BODY\n");
  await writeFile(join(root, "_archive", "moc-runs", "demo", "Planted.md"), "---\nuid: 123e4567-e89b-42d3-a456-426614174002\nsensitivity: public\ntitle: ARCHIVED-TITLE\n---\nARCHIVED-LIVE-CONTEXT-BUG\n");
  return root;
}

async function treeBytes(root) {
  const names = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
    .sort();
  return Promise.all(names.map(async (path) => [relative(root, path).replace(/\\/g, "/"), await readFile(path, "utf8")]));
}

test("all nav analysis commands emit stdout and leave source bytes untouched", async () => {
  const root = await fixture();
  const before = await treeBytes(root);
  const scan = await exec(process.execPath, [cli, "nav", "scan", root]);
  assert.match(scan.stdout, /"navigationContract": "1\.0\.0"/);
  const audit = await exec(process.execPath, [cli, "nav", "audit", root]);
  assert.match(audit.stdout, /^\[/);
  const render = await exec(process.execPath, [cli, "nav", "render", root, "--stdout"]);
  assert.match(render.stdout, /"artifactKind": "engine\.navigation-candidate-set"/);
  const context = await exec(process.execPath, [cli, "nav", "context", root, "--recipient", "human:reader", "--purpose", "review", "--stdout"]);
  assert.match(context.stdout, /engine\.navigation-context-pack/);
  assert.match(context.stdout, /PUBLIC-BODY/);
  assert.doesNotMatch(context.stdout, /SECRET-BODY|SECRET-TITLE/);
  assert.doesNotMatch(context.stdout, /ARCHIVED-LIVE-CONTEXT-BUG|ARCHIVED-TITLE/);
  const diff = await exec(process.execPath, [cli, "nav", "diff", root, root]);
  assert.equal(diff.stdout, "");
  assert.deepEqual(await treeBytes(root), before);
});
test("nav mutation verbs and output/write flags are rejected", async () => {
  const root = await fixture();
  for (const verb of ["write", "apply", "delete", "record", "archive-delete", "rollback", "moc-apply"]) {
    await assert.rejects(exec(process.execPath, [cli, "nav", verb, root]), (error) => error.code === 2 && /read-only/.test(error.stderr));
  }
  for (const args of [
    ["nav", "render", root, "--write"],
    ["nav", "render", root, "--stdout", "--out", "candidate.md"],
    ["nav", "render", root, "--stdout", "--watch"],
  ]) await assert.rejects(exec(process.execPath, [cli, ...args]), (error) => error.code === 2);
  await assert.rejects(exec(process.execPath, [cli, "nav", "render", root]), (error) => error.code === 2 && /--stdout/.test(error.stderr));
  await assert.rejects(exec(process.execPath, [cli, "nav", "context", root, "--stdout"]), (error) => error.code === 2 && /recipient/.test(error.stderr));
});

test("reentry and promotion CLI commands create plans only", async () => {
  const root = await fixture();
  const incoming = join(root, "incoming-copy.md");
  await writeFile(incoming, "incoming exact bytes\r\n");
  const before = await treeBytes(root);
  const reentry = await exec(process.execPath, [cli, "nav", "reentry-plan",
    "--predecessor", "old", "--predecessor-version", "3", "--predecessor-digest", "sha256:old",
    "--input", incoming, "--new-source-id", "new", "--new-source-version", "1", "--new-source-path", "new.md",
    "--acquired-at", "2026-08-15T12:00:00Z", "--actor", "human:owner"]);
  assert.match(reentry.stdout, /"artifactKind": "engine\.reentry-plan"/);
  assert.match(reentry.stdout, /"status": "planned"/);
  const promotion = await exec(process.execPath, [cli, "nav", "promotion-plan",
    "--proposal-id", "018f0000-0000-7000-8000-000000000201",
    "--operation-id", "018f0000-0000-7000-8000-000000000202",
    "--vault-id", "vault:test", "--name", "Overview", "--actor", "human:owner", "--proposed-at", "2026-08-15T12:00:00Z"]);
  assert.match(promotion.stdout, /"requiresHumanAcceptance": true/);
  assert.deepEqual(await treeBytes(root), before);
});
