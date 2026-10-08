import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const runner = resolve("run.mjs");
const adapter = resolve("test/fixtures/fake-adapter.mjs");

test("unexecuted graph expectations block fixture and profile PASS", () => {
  const out = join(mkdtempSync(join(tmpdir(), "gkos-runner-")), "claim.json");
  let status = 0;
  try {
    execFileSync(process.execPath, [runner, "--adapter", adapter, "--out", out], { stdio: "pipe" });
  } catch (error) {
    status = error.status;
  }

  assert.equal(status, 1, "UNEVALUATED expectations must produce a non-qualifying exit status");
  const claim = JSON.parse(readFileSync(out, "utf8"));
  assert.deepEqual(claim.profiles_claimed, []);
  assert.equal(claim.fixtures.unevaluated, 2);
  assert.equal(claim.fixtures.fully_evaluated, 6);
  assert.equal(claim.fixtures.results.find((r) => r.fixture_id === "GCP1-N03").divergence_ref, undefined);
  assert.equal(claim.fixtures.results.find((r) => r.fixture_id === "GCP3-C01").outcome, "unevaluated");
  assert.equal(claim.fixtures.results.find((r) => r.fixture_id === "GCP3-L01").outcome, "unevaluated");
  assert.ok(claim.limitations.some((item) => item.includes("projection.graph_expect")));
});
