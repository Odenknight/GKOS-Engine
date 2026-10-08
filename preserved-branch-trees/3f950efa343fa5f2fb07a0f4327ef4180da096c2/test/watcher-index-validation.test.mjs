import test from "node:test";
import assert from "node:assert/strict";

import {
  GkxIndex,
  buildIngestValidationPlan,
  loadIngestProfile,
  takeWatcherIndexValidationOutcome,
  watcherIndexValidationOutcomeAvailable,
} from "../dist/watcher-host.mjs";
const CREATED = "2026-08-20T00:00:00Z";

function source(relativePath, content) {
  return {
    relativePath,
    name: relativePath,
    extension: "md",
    size: Buffer.byteLength(content, "utf8"),
    createdTime: Date.parse(CREATED),
    content,
    kind: "note",
  };
}

function validNote() {
  return `---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntitle: "Accepted"\ntype: "policy"\ncreated_at: "${CREATED}"\nepistemic_state: "reported"\nsensitivity: "public"\n---\n# Accepted\nBody.\n`;
}

test("watcher consumes the exact one-pass Phase3 accepted/rejection outcome", async () => {
  const profile = await loadIngestProfile();
  const index = new GkxIndex();
  const plan = buildIngestValidationPlan({
    files: [
      source("accepted.md", validNote()),
      source("rejected.md", "# Deterministically rejected: no governed frontmatter.\n"),
    ],
    folders: [],
    attachments: [],
    scan_rejections: [],
  }, profile, {}, {
    index,
    execution_kind: "set_files",
    changed_paths: [],
    removed_paths: [],
    renames: [],
  });

  assert.equal(watcherIndexValidationOutcomeAvailable(plan), true);
  const outcome = takeWatcherIndexValidationOutcome(plan);
  assert.equal(outcome.status, "deterministic_rejection");
  assert.equal(outcome.plan, plan);
  assert.equal(outcome.parse_count, 2);
  assert.equal(outcome.sources.length, 2);
  const accepted = outcome.sources.find((item) => item.source_path === "accepted.md");
  const rejected = outcome.sources.find((item) => item.source_path === "rejected.md");
  assert.equal(accepted.disposition, "accepted");
  assert.match(accepted.source_id, /^[0-9a-f-]{36}$/u);
  assert.match(accepted.parser_descriptor_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(accepted.rejection_digest, null);
  assert.equal(rejected.disposition, "deterministic_rejection");
  assert.match(rejected.parser_descriptor_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(rejected.rejection_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(rejected.rejection_class, "validation");
  assert.equal(outcome.graph.nodes.some((node) => node.path === "rejected.md"), false);
  assert.equal(index.graph.nodes.some((node) => node.path === "rejected.md"), false);
  assert.equal(watcherIndexValidationOutcomeAvailable(plan), false);
  assert.throws(() => takeWatcherIndexValidationOutcome(plan), /OUTCOME_UNAVAILABLE/u);
});
