import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { experimentalScience as science } from "../dist/gkos-engine.mjs";

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "gkos-standard", "fixtures", "provisional", "science");
const catalogPath = join(fixtureRoot, "fixtures.manifest.json");
const clone = (value) => JSON.parse(JSON.stringify(value));
const decode = (part) => part.replaceAll("~1", "/").replaceAll("~0", "~");

function materialize(file, seen = new Set()) {
  if (seen.has(file)) throw new Error(`fixture cycle: ${file}`);
  seen.add(file);
  const value = JSON.parse(readFileSync(join(fixtureRoot, file), "utf8"));
  if (!value.extends) return value;
  const graph = clone(materialize(value.extends, seen));
  for (const mutation of value.mutations ?? []) {
    const parts = mutation.path.split("/").slice(1).map(decode);
    const leaf = parts.pop();
    let target = graph;
    for (const part of parts) target = target[part];
    if (mutation.op === "set") target[leaf] = clone(mutation.value);
    else if (mutation.op === "add" && leaf === "-") target.push(clone(mutation.value));
    else if (mutation.op === "add") target[leaf] = clone(mutation.value);
    else if (mutation.op === "remove") Array.isArray(target) ? target.splice(Number(leaf), 1) : delete target[leaf];
  }
  return graph;
}

test("mirrors the exact provisional standard SRTP fixture catalog when available", { skip: !existsSync(catalogPath) }, () => {
  const catalogBytes = readFileSync(catalogPath);
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  assert.equal(catalog.profile, science.SRTP_DRAFT_FIXTURE_BASELINE.profile);
  assert.equal(catalog.catalog_version, science.SRTP_DRAFT_FIXTURE_BASELINE.catalogVersion);
  assert.equal(science.SRTP_DRAFT_FIXTURE_BASELINE.standardBaseCommit, "351330ce34ac6bf9f48ac340e3c259ea30e74715");
  assert.equal(createHash("sha256").update(catalogBytes).digest("hex"), science.SRTP_DRAFT_FIXTURE_BASELINE.catalogSha256);
  for (const fixture of catalog.fixtures) {
    const result = science.evaluateSrtpDraftGraph(materialize(fixture.file), { experimentalScienceProfile: true });
    assert.deepEqual([...new Set(result.diagnostics.map((item) => item.code))].sort(), [...fixture.expect.diagnostics].sort(), fixture.fixture_id);
    assert.deepEqual(result.profilesClaimed, [], `${fixture.fixture_id} must remain non-qualifying`);
  }
  const duplicateReceipt = materialize("srtp-p01-complete.json");
  duplicateReceipt.reentry_receipts[0].new_source_digests.push(duplicateReceipt.reentry_receipts[0].new_source_digests[0]);
  assert.ok(science.evaluateSrtpDraftGraph(duplicateReceipt, { experimentalScienceProfile: true }).diagnostics.some((item) => item.code === "SRTP-REENTRY-001"));
  const malformed = science.evaluateSrtpDraftGraph({ profile: "SRTP-DRAFT-0.1" }, { experimentalScienceProfile: true });
  assert.equal(malformed.status, "FAIL");
  assert.ok(malformed.diagnostics.some((item) => item.code === "SRTP-SCHEMA-001"));
});
