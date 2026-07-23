/**
 * KosmosIndex projection-options threading (issue #6).
 *
 * Proves Okf23ProjectionOptions.defaultSensitivity reaches every internal
 * buildOkf23Projection call through the indexing path — full load AND
 * incremental reparse — while an omitted option keeps the fail-closed
 * "secret" default unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { KosmosIndex, buildGraph, parseSourceFile } from "../dist/kosmos-core.mjs";

const N = (path, content) => ({ relativePath: path, content, kind: "note" });
// An OKF+ note with frontmatter present (so a projection is built) but NO
// sensitivity field — the missing-sensitivity case the default governs.
const UNLABELED = "---\nokf_version: \"2.3\"\nuid: \"note:unlabeled\"\ntitle: Unlabeled\ntype: note\ncreated_at: 2026-01-01T00:00:00Z\nepistemic_state: observation\n---\nBody";

const effectiveSensitivity = (idx, path) =>
  idx.graph.nodes.find((n) => n.id === `file:${path}`)?.okf?.projection?.effective.sensitivity;

test("KosmosIndex built with defaultSensitivity=internal yields internal for an unlabeled note", () => {
  const idx = new KosmosIndex({ defaultSensitivity: "internal" });
  idx.setFiles([N("A.md", UNLABELED)], []);
  assert.equal(effectiveSensitivity(idx, "A.md"), "internal");
});

test("omitting options keeps the fail-closed secret default (unchanged behavior)", () => {
  const idx = new KosmosIndex();
  idx.setFiles([N("A.md", UNLABELED)], []);
  assert.equal(effectiveSensitivity(idx, "A.md"), "secret");
});

test("incremental reparse honors the configured default after a file change", () => {
  const idx = new KosmosIndex({ defaultSensitivity: "internal" });
  idx.setFiles([N("A.md", UNLABELED), N("B.md", UNLABELED.replace("note:unlabeled", "note:b"))], []);
  // Change A's body — forces a reparse (new content hash) through applyChanges.
  const { delta } = idx.applyChanges({ changed: [N("A.md", UNLABELED + "\nedited")] });
  assert.equal(delta.reparsed, 1);
  assert.equal(effectiveSensitivity(idx, "A.md"), "internal");
});

test("buildGraph and parseSourceFile forward the option; omitted stays secret", () => {
  const g = buildGraph([N("A.md", UNLABELED)], [], undefined, { defaultSensitivity: "restricted" });
  assert.equal(g.nodes.find((n) => n.id === "file:A.md").okf.projection.effective.sensitivity, "restricted");
  assert.equal(buildGraph([N("A.md", UNLABELED)], []).nodes.find((n) => n.id === "file:A.md").okf.projection.effective.sensitivity, "secret");

  const rec = parseSourceFile(N("A.md", UNLABELED), { defaultSensitivity: "confidential" });
  assert.equal(rec.okf.projection.effective.sensitivity, "confidential");
  assert.equal(parseSourceFile(N("A.md", UNLABELED)).okf.projection.effective.sensitivity, "secret");
});
