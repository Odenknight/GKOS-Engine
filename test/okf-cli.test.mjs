/**
 * okf CLI (kosmos-build.mjs) MVP tests.
 *
 * Proves: (1) the `.okf` scan-ignore fix, (2) the deterministic `build:` block,
 * and (3) the conformance property that the CLI path produces diagnostics and
 * scores byte-identical to calling the embedded core (buildGraph /
 * buildOkf23Projection) directly, exactly as test/okf23.test.mjs exercises it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_IGNORED_DIRS,
  buildGraph,
} from "../dist/kosmos-core.mjs";
import {
  scanCorpus,
  runValidate,
  runAssess,
  corpusHash,
} from "../bin/okf.mjs";

// (1) clean flat editable 2.3 note — no error diagnostics expected.
const CLEAN = `---
okf_version: "2.3"
uid: "019b2d14-4230-7db7-87d4-7d81cfaec935"
title: "Flat editable"
type: "semantic"
created_at: "2026-07-01T00:00:00Z"
updated_at: "2026-07-02T00:00:00Z"
epistemic_state: "fact"
sensitivity: "restricted"
authorship_origin: "authored"
tags:
  - "research"
---
Body.`;

// (2) 2.3 note with a diagnostic-triggering issue: a non-UID identity.
const BROKEN = `---
okf_version: "2.3"
uid: "not-a-valid-uid"
title: "Broken identity"
type: "semantic"
created_at: "2026-07-01T00:00:00Z"
epistemic_state: "observation"
sensitivity: "internal"
---
Body.`;

// (3) plain unadorned note — no frontmatter, no OKF+ projection.
const PLAIN = `# Just a note\nNo frontmatter here.`;

async function makeCorpus() {
  const dir = await mkdtemp(join(tmpdir(), "okf-cli-"));
  await writeFile(join(dir, "clean.md"), CLEAN);
  await writeFile(join(dir, "broken.md"), BROKEN);
  await writeFile(join(dir, "plain.md"), PLAIN);
  // A governance artifact that must NOT be indexed as a corpus attachment.
  await mkdir(join(dir, ".okf", "migrations", "x"), { recursive: true });
  await writeFile(join(dir, ".okf", "migrations", "x", "plan.json"), JSON.stringify({ plan: true }));
  return dir;
}

test("DEFAULT_IGNORED_DIRS includes .okf", () => {
  assert.ok(DEFAULT_IGNORED_DIRS.includes(".okf"));
});

test("directory scan skips .okf/ contents (no plan.json attachment)", async () => {
  const dir = await makeCorpus();
  try {
    const { files, attachments } = await scanCorpus(dir);
    assert.equal(files.length, 3);
    assert.deepEqual(attachments, [], ".okf/migrations/x/plan.json must not surface as an attachment");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("okf validate exits non-zero on the broken note and lists per-note diagnostics", async () => {
  const dir = await makeCorpus();
  try {
    const result = await runValidate(dir);
    assert.equal(result.summary.notes_scanned, 3);
    // clean + broken carry projections; plain does not.
    assert.equal(result.summary.notes_with_projection, 2);
    assert.equal(result.ok, false, "error diagnostics must fail the run");
    assert.ok(result.summary.diagnostics.error >= 1);
    const broken = result.notes.find((n) => n.path === "broken.md");
    assert.ok(broken.diagnostics.some((d) => d.code === "OKF-IDENTITY-002" && d.severity === "error"));
    // deterministic build block shape
    assert.equal(typeof result.build.engine_version, "string");
    assert.ok(result.build.policy_hash.startsWith("sha256:"));
    assert.equal(typeof result.build.corpus_hash, "string");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("okf assess reports per-note scores/labels for projected notes only", async () => {
  const dir = await makeCorpus();
  try {
    const result = await runAssess(dir);
    assert.equal(result.summary.notes_assessed, 2);
    const clean = result.notes.find((n) => n.path === "clean.md");
    assert.ok(clean.label.startsWith("assessment:"));
    assert.equal(typeof clean.scores.structural_completeness, "number");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("conformance: CLI path == embedded buildGraph path (identical diagnostics + scores)", async () => {
  const dir = await makeCorpus();
  try {
    // CLI path.
    const validate = await runValidate(dir);
    const assess = await runAssess(dir);

    // Embedded path: rebuild the same SourceFile set the CLI scan produced and
    // call buildGraph directly, as test/okf23.test.mjs does.
    const { files, folders } = await scanCorpus(dir);
    const graph = buildGraph(files, folders);

    for (const cliNote of validate.notes) {
      const node = graph.nodes.find((n) => n.kind === "file" && n.path === cliNote.path);
      const embedded = [...node.okf.projection.diagnostics]
        .map((d) => ({ code: d.code, severity: d.severity, field: d.field ?? null, message: d.message }))
        .sort((a, b) => a.code.localeCompare(b.code) || (a.field ?? "").localeCompare(b.field ?? "") || a.message.localeCompare(b.message));
      assert.deepEqual(cliNote.diagnostics, embedded, `diagnostics for ${cliNote.path} must match embedded core`);
    }

    for (const cliNote of assess.notes) {
      const node = graph.nodes.find((n) => n.kind === "file" && n.path === cliNote.path);
      assert.deepEqual(cliNote.scores, { ...node.okf.projection.assessment.scores }, `scores for ${cliNote.path} must match embedded core`);
      assert.equal(cliNote.overall, node.okf.projection.assessment.scores.overall);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("corpus_hash is stable and order-independent", async () => {
  const dir = await makeCorpus();
  try {
    const { files } = await scanCorpus(dir);
    const a = corpusHash(files);
    const b = corpusHash([...files].reverse());
    assert.equal(a, b);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
