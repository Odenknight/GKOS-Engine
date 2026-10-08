import { readFileSync, writeFileSync } from "node:fs";
import * as evaluationHost from "../dist/retrieval-evaluation-host.mjs";

const PACK = new URL("../contracts/retrieval/gkos-retrieval-evaluation-1.0.0-draft.1/", import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(new URL(name, PACK), "utf8"));
const conformance = readJson("conformance-fixture.json");
const reviewed = evaluationHost.buildRetrievalEvaluationReviewedBundle({
  environment_bundle: {
    environment_set: conformance.valid_envelopes.environment_set,
    normalized_golden: conformance.golden.expected_normalized,
    fixture_catalog: readJson("fixture-catalog.json"),
    source_corpus: readJson("source-corpus.json"),
    fixed_provider_transcript: readJson("fixed-provider.json"),
    projection_manifests: conformance.valid_envelopes.projection_manifests,
  },
  baseline: conformance.valid_envelopes.baseline,
  metric_computation_fixture: readJson("metric-computation-fixture.json"),
});
const bytes = `${JSON.stringify(reviewed, null, 2)}\n`;
if (process.argv.includes("--write")) {
  writeFileSync(new URL("reviewed-bundle.json", PACK), bytes, "utf8");
  conformance.fixture_files.reviewed_bundle = { file: "reviewed-bundle.json", digest: reviewed.reviewed_bundle_digest };
  writeFileSync(new URL("conformance-fixture.json", PACK), `${JSON.stringify(conformance, null, 2)}\n`, "utf8");
} else process.stdout.write(bytes);
