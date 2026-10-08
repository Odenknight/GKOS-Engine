import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateTrackATwins } from "../track-a-evidence.mjs";
const read = name => JSON.parse(readFileSync(new URL(`../../../fixtures/track-a/${name}`, import.meta.url)));
test("declared expected codes cannot substitute for an executed rejecting mutation", () => {
  const catalog = read("fixtures.manifest.json");
  const suite = read("cases.json");
  assert.deepEqual(evaluateTrackATwins(catalog, suite).errors, []);
  suite.cases[0].mutation = suite.cases[0].baseline;
  const result = evaluateTrackATwins(catalog, suite);
  assert.equal(result.errors.length, 1);
  assert.equal(result.coverage["GKOS-GATE-L1-001"], undefined);
});
test("missing, duplicate and falsely bound case declarations fail execution coverage", () => {
  for (const mutate of [
    suite => suite.cases.shift(),
    suite => suite.cases.push(suite.cases[0]),
    suite => {suite.cases[0].expected = "GKOS-GATE-L7-007";},
    suite => {suite.cases[0].mutation.kind = "invented";},
  ]) {
    const suite = read("cases.json");
    mutate(suite);
    const result = evaluateTrackATwins(read("fixtures.manifest.json"), suite);
    assert.ok(result.errors.length > 0);
    assert.equal(result.coverage["GKOS-GATE-L1-001"], undefined);
  }
});
