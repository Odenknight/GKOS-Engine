import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { verifyDocumentationArtifact, readDocumentationFiles, MANIFEST_FORMAT, sha256 } from "../scripts/verify-documentation-artifact.mjs";
import { validateClaimedRefusalReceipt, SCHEMA_PIN, assertPinnedRefusalSchema } from "../scripts/validate-refusal-receipt-v081.mjs";
const fixture = new URL("./fixtures/documentation-verifier/", import.meta.url);
const artifact = JSON.parse(readFileSync(new URL("artifact.json", fixture)));
const files = () => new Map(artifact.digest_method.files.map((p) => [p, readFileSync(new URL("v2.1.1/" + p, fixture))]));
test("exact six historical raw blobs reproduce independently pinned annex manifest", () => {
  const result = verifyDocumentationArtifact(artifact, files());
  assert.equal(result.status, "MATCH");
  assert.equal(result.manifest.actual, "1d2ae51f89ce52714e318ff5a0246cc885442c87d985de2752aec00031edd754");
  assert.equal(result.refusalReceipt, false);
  assert.ok(result.files.every((x) => x.matches));
  assert.equal(artifact.supersedes, "none");
});
test("one deliberate byte alteration matches independent annex negative digests", () => {
  const input = files();
  const bytes = input.get("README.md");
  assert.equal(bytes[2], 71);
  bytes[2] = 72;
  const r = verifyDocumentationArtifact(artifact, input);
  assert.equal(r.status, "MISMATCH");
  assert.equal(r.files[1].actual, "ba33b0c99d163ae81531bbe5de82474e35e5b4279cdf4d5e32344738dd016d0e");
  assert.equal(r.manifest.actual, "e8ac5777da6585367292bf1e621b73f8a75c2152179fee5f2836ba79df6e5b8a");
  assert.equal(r.files.filter((x) => !x.matches).length, 1);
  assert.equal(r.refusalReceipt, false);
});
test("newline conversion is an alteration; inputs are never normalized", () => {
  const input = files();
  input.set("README.md", Buffer.from(input.get("README.md").toString("utf8").replaceAll("\n", "\r\n")));
  assert.equal(verifyDocumentationArtifact(artifact, input).status, "MISMATCH");
});
test("reject missing, substituted, string-valued and oversized byte inputs", () => {
  for (const mutate of [(m) => m.delete("README.md"), (m) => {
    m.delete("README.md");
    m.set("extra", Buffer.from("x"));
  }, (m) => m.set("README.md", "text"), (m) => m.set("README.md", new Uint8Array(16 * 1024 * 1024 + 1))]) {
    const m = files();
    mutate(m);
    assert.throws(() => verifyDocumentationArtifact(artifact, m), /DOCUMENTATION_INPUT/);
  }
});
test("invalid declarations fail before reads, including traversal and self-inconsistent manifest", () => {
  for (const mutate of [(a) => a.digest_method.files.push("README.md"), (a) => a.digest_method.files[0] = "../private", (a) => a.digest_method.algorithm = "sha1", (a) => a.digest_method.manifest_format = "arbitrary", (a) => a.digest_method.per_file_sha256.extra = "0".repeat(64), (a) => a.digest_method.manifest_sha256 = "0".repeat(64)]) {
    const a = structuredClone(artifact);
    mutate(a);
    assert.throws(() => verifyDocumentationArtifact(a, files()), /DOCUMENTATION_DECLAR/);
  }
});
test("CLI returns bounded match/mismatch/error JSON and correct exit codes", () => {
  const script = new URL("../scripts/verify-documentation-artifact.mjs", import.meta.url);
  const root = mkdtempSync(join(tmpdir(), "gkos-documentation-cli-"));
  const artifacts = join(root, "artifact.json");
  writeFileSync(artifacts, JSON.stringify(artifact));
  const docs = join(root, "docs");
  mkdirSync(docs);
  for (const [p, b] of files()) writeFileSync(join(docs, p), b);
  const run = () => spawnSync(process.execPath, [fileURLToPath(script), artifacts, docs], { encoding: "utf8" });
  let r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).status, "MATCH");
  const changed = readFileSync(join(docs, "README.md"));
  changed[2] = 72;
  writeFileSync(join(docs, "README.md"), changed);
  r = run();
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).status, "MISMATCH");
  writeFileSync(artifacts, "invalid");
  r = run();
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).status, "REFUSED");
  assert.ok(!r.stdout.includes(root));
});
test("file loader rejects hard-linked source bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "gkos-documentation-hardlink-"));
  const p = join(root, "file");
  writeFileSync(p, "x");
  linkSync(p, join(root, "alias"));
  const digest2 = sha256(Buffer.from("x"));
  const a = { digest_method: { algorithm: "sha256", manifest_format: MANIFEST_FORMAT, files: ["file"], per_file_sha256: { file: digest2 }, manifest_sha256: sha256(Buffer.from(digest2 + "  file\n")) } };
  assert.throws(() => readDocumentationFiles(a, root), /DOCUMENTATION_INPUT_INVALID/);
});
const digest = { algorithm: "sha-256", canonical_profile: "GKX-CBOR-1", value: "0".repeat(64) };
const receipt = () => ({ canonical_profile: "GKX-CBOR-1", artifact_type: "refusal-receipt", schema_version: "1.0.0", receipt_id: "synthetic-schema-only", gate_code: "GKOS-GATE-L1-999", requirement_id: "GKOS-TEST-999", predicate_ref: { component_id: "synthetic", component_version: "0", digest }, result: "refused", input_refs: [{ artifact_id: "synthetic", artifact_version: "0", digest }], evaluated_at: "2026-09-08T00:00:00.000000Z", actor_context: [{ actor_id: "synthetic", actor_class: "tool" }], policy_ref: { component_id: "synthetic", component_version: "0", digest } });
test("synthetic receipt validates only against exact pinned v0.81 schema", () => {
  const r = validateClaimedRefusalReceipt(receipt());
  assert.equal(r.status, "SCHEMA_VALID");
  assert.equal(r.schemaPin.standardCommit, "8f2a158c6d4b8cabd907d98765766d281aec1247");
  for (const [p, h] of Object.entries(SCHEMA_PIN.files)) assert.equal(sha256(readFileSync(new URL("../contracts/documentation-verifier/v0.81/" + p, import.meta.url))), h);
  assert.match(r.scope, /not gate registration/);
});
test("confidence NO_ELIGIBLE_RESULTS is not a RefusalReceipt", () => {
  assert.equal(validateClaimedRefusalReceipt({ confidence: { reason_codes: ["NO_ELIGIBLE_RESULTS"] } }).status, "SCHEMA_INVALID");
  assert.equal(validateClaimedRefusalReceipt("NO_ELIGIBLE_RESULTS").status, "SCHEMA_INVALID");
});
test("reject annex draft structural errors and each missing required receipt field", () => {
  const valid = receipt();
  for (const key of Object.keys(valid)) {
    const r = structuredClone(valid);
    delete r[key];
    assert.equal(validateClaimedRefusalReceipt(r).status, "SCHEMA_INVALID", key);
  }
  for (const mutate of [(r) => r.actor_context = { actor_id: "x", actor_class: "tool" }, (r) => r.diagnostic = { code: "x" }, (r) => r.input_refs[0].ref = "x", (r) => r.evaluated_at = "2026-09-08T00:00:00Z", (r) => r.input_refs[0].digest.value = "wrong", (r) => r.result = "allowed"]) {
    const r = structuredClone(valid);
    mutate(r);
    assert.equal(validateClaimedRefusalReceipt(r).status, "SCHEMA_INVALID");
  }
});
test("schema pin rejects altered bytes and unknown schema names before compilation", () => {
  for (const name of Object.keys(SCHEMA_PIN.files)) {
    const bytes = readFileSync(new URL("../contracts/documentation-verifier/v0.81/" + name, import.meta.url));
    assert.doesNotThrow(() => assertPinnedRefusalSchema(name, bytes));
    bytes[0] ^= 1;
    assert.throws(() => assertPinnedRefusalSchema(name, bytes), { code: "REFUSAL_SCHEMA_PIN_MISMATCH" });
  }
  assert.throws(() => assertPinnedRefusalSchema("unregistered", Buffer.from("{}")), { code: "REFUSAL_SCHEMA_PIN_MISMATCH" });
});
