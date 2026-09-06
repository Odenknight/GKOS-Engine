import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import esbuild from "esbuild";
import { deriveGkxRetrievalProjectionManifest } from "../dist/retrieval-host.mjs";
import { buildGkxRetrievalGenerationUnactivated, restoreGkxRetrievalGenerationForEvaluation } from "../dist/retrieval-evaluation-host.mjs";

const built = await esbuild.build({ entryPoints: [fileURLToPath(new URL("../src/retrieval/manifest.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
const { assertRetrievalProjectionManifest } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const fixture = JSON.parse(readFileSync(new URL("../contracts/watcher/gkos-watcher-recovery-1.0.0-draft.1/watcher-conformance-fixture.json", import.meta.url)));
const manifest = fixture.semantic_cases.find(r => r.case_id === "journal-reset-reconciliation-adoption-valid").input.arguments[0].current_owner_manifest.inner.manifest;

test("2.2 reads unchanged qualified 2.1.2 producer manifests without rewriting provenance", () => {
  const before = JSON.stringify(manifest);
  assert.equal(manifest.engine_version, "2.1.2");
  assertRetrievalProjectionManifest(manifest);
  assert.equal(JSON.stringify(manifest), before);
  assertRetrievalProjectionManifest({ ...manifest, engine_version: "2.2.0" });
});

test("manifest compatibility does not admit unqualified versions or weaken schema checks", () => {
  for (const version of ["2.1.1", "2.2.1", "3.0.0", "2.1.2-unknown", "", null, 2.2]) {
    assert.throws(() => assertRetrievalProjectionManifest({ ...manifest, engine_version: version }), /RETRIEVAL_MANIFEST_IDENTITY_INVALID/u);
  }
  assert.throws(() => assertRetrievalProjectionManifest({ ...manifest, candidate_source_count: -1 }), /RETRIEVAL_MANIFEST_COUNT_INVALID/u);
  assert.throws(() => assertRetrievalProjectionManifest({ ...manifest, unexpected: true }), /RETRIEVAL_MANIFEST_FIELDS_INVALID/u);
});

test("new derivation emits 2.2 while explicit no-I/O replay retains qualified historical digests", () => {
  const input = { vault_id: "test", source_snapshot_digest: `sha256:${"a".repeat(64)}`, configuration_digest: `sha256:${"b".repeat(64)}`, policy_digest: `sha256:${"c".repeat(64)}`, candidate_sources: [], candidate_declarations: [], candidate_chunks: [], embedding_eligible_candidate_chunk_keys: [], vectors: [] };
  const current = deriveGkxRetrievalProjectionManifest(input, "sqlite_lexical_scan");
  const historical = deriveGkxRetrievalProjectionManifest(input, "sqlite_lexical_scan", "2.1.2");
  assert.equal(current.engine_version, "2.2.0");
  assert.equal(historical.engine_version, "2.1.2");
  assert.notEqual(current.projection_digest, historical.projection_digest);
  assert.equal(current.projection_digest, "sha256:721804ac2b935ab5dffdf0a9dc4e488d641bb0b5b22e7f79467b234febaa6540");
  assert.equal(historical.projection_digest, "sha256:0b86d2cfe73171324f9e419ab7bc61408b306ea4b42ebf51c95c1d521a544aa9");
  assert.throws(() => deriveGkxRetrievalProjectionManifest(input, "sqlite_lexical_scan", "3.0.0"), /RETRIEVAL_MANIFEST_DERIVATION_INPUT_INVALID/u);
});

test("historical evaluation restoration is exact, unactivated and separate from new generation", t => {
  const root = mkdtempSync(join(tmpdir(), "gkos-producer-replay-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = { state_directory: join(root, "replay"), vault_id: "test", source_snapshot_digest: `sha256:${"a".repeat(64)}`, configuration_digest: `sha256:${"b".repeat(64)}`, policy_digest: `sha256:${"c".repeat(64)}`, candidate_sources: [], candidate_declarations: [], candidate_chunks: [], embedding_eligible_candidate_chunk_keys: [], vectors: [], lexical_backend: "sqlite_lexical_scan" };
  const historical = deriveGkxRetrievalProjectionManifest(input, input.lexical_backend, "2.1.2");
  const replay = restoreGkxRetrievalGenerationForEvaluation(input, historical);
  assert.deepEqual(replay.manifest, historical);
  assert.equal(existsSync(join(input.state_directory, "active-retrieval.json")), false);
  const fresh = buildGkxRetrievalGenerationUnactivated({ ...input, state_directory: join(root, "new") });
  assert.equal(fresh.manifest.engine_version, "2.2.0");
  assert.notEqual(fresh.manifest.projection_digest, historical.projection_digest);
  assert.throws(() => buildGkxRetrievalGenerationUnactivated({ ...input, engine_version: "2.1.2" }), /RETRIEVAL_GENERATION_INPUT_FIELDS_INVALID/);
  const deniedInput = { ...input, state_directory: join(root, "denied") };
  assert.throws(() => restoreGkxRetrievalGenerationForEvaluation(deniedInput, { ...historical, source_snapshot_digest: `sha256:${"d".repeat(64)}` }), /RETRIEVAL_EVALUATION_REPLAY_MANIFEST_MISMATCH/);
  assert.throws(() => restoreGkxRetrievalGenerationForEvaluation(deniedInput, { ...historical, engine_version: "3.0.0" }), /RETRIEVAL_MANIFEST_IDENTITY_INVALID/);
  let invoked = false;
  const accessor = { ...historical, get engine_version() { invoked = true; return "2.1.2"; } };
  assert.throws(() => restoreGkxRetrievalGenerationForEvaluation(deniedInput, accessor), /RETRIEVAL_EVALUATION_REPLAY_MANIFEST_INVALID/);
  assert.equal(invoked, false);
  assert.equal(existsSync(deniedInput.state_directory), false);
});
