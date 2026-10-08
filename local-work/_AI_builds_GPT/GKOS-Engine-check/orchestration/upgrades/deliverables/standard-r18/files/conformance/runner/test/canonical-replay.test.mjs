import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseDiagnosticJson } from "../canonical.mjs";

test("clean-process replay produces identical canonical bytes and hash", () => {
  const first = mkdtempSync(join(tmpdir(), "gkos-replay-a-"));
  const second = mkdtempSync(join(tmpdir(), "gkos-replay-b-"));
  const cli = resolve("replay-fixture.mjs");
  execFileSync(process.execPath, [cli, "--out-dir", first]);
  execFileSync(process.execPath, [cli, "--out-dir", second]);
  const firstBytes = readFileSync(join(first, "context-manifest.cbor"));
  const secondBytes = readFileSync(join(second, "context-manifest.cbor"));
  assert.deepEqual(firstBytes, secondBytes);
  assert.deepEqual(firstBytes, readFileSync(new URL("../../evidence/gcp6-replay-v0.1/context-manifest.cbor", import.meta.url)), "preserved baseline canonical bytes must not change");
  assert.deepEqual(JSON.parse(readFileSync(join(first, "result.json"))), JSON.parse(readFileSync(join(second, "result.json"))));
  assert.deepEqual(parseDiagnosticJson(readFileSync(join(first, "context-manifest.rendering.json"), "utf8")), firstBytes);
  const result = JSON.parse(readFileSync(join(first, "result.json"), "utf8"));
  assert.equal(result.evidence_status, "mechanism_demonstrated");
  assert.deepEqual(result.qualifying_profiles, []);
  assert.equal(result.core_tier_claimed, false);
});
