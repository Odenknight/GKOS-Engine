#!/usr/bin/env node
/**
 * GKOS-TS starter runner.
 *
 * Usage: node run.mjs --adapter ./adapters/gkos-engine.mjs [--out claim.json]
 *
 * Loads fixtures.manifest.json, validates fixture frontmatter against the
 * schema program (ajv), runs each fixture through the adapter's projection,
 * evaluates diagnostic expectations, and emits a machine-readable conformance
 * claim conforming to schemas/conformance-manifest.schema.json.
 *
 * The adapter contract keeps the standard implementation-neutral:
 *   export const implementation = { name, version, repository? }
 *   export function project(content, path) -> {
 *     diagnostics: [{ code, severity, field? }],
 *     effective: { sensitivity, epistemicState }
 *   }
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");            // gkos-standard repo root
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const adapterPath = arg("--adapter");
if (!adapterPath) { console.error("Required: --adapter <path>"); process.exit(2); }
const outPath = arg("--out", "conformance-claim.json");
const attestedBy = arg("--attested-by", "unattested");

const adapter = await import(pathToFileURL(resolve(adapterPath)).href);
const manifest = JSON.parse(readFileSync(join(root, "fixtures", "fixtures.manifest.json"), "utf8"));

// --- schema registry ---
const ajv = new Ajv2020.default({ strict: false, allErrors: true });
const S = join(root, "schemas");
for (const dir of [S, join(S, "provisional")]) {
  for (const f of readdirSync(dir).filter(x => x.endsWith(".json"))) {
    const sch = JSON.parse(readFileSync(join(dir, f), "utf8"));
    ajv.addSchema(sch, sch.$id); ajv.addSchema(sch, basename(f)); ajv.addSchema(sch, "../" + basename(f));
  }
}

const frontmatter = raw => { const m = /^---\n([\s\S]*?)\n---/.exec(raw); return m ? YAML.parse(m[1]) : {}; };
const codeMatch = (want, got) => want.endsWith("*") ? got.startsWith(want.slice(0, -1)) : got === want;
const SENS_ORDER = ["public", "internal", "restricted", "confidential", "regulated", "phi", "secret"];

const results = [];
let passed = 0, failed = 0, skipped = 0, divergent = 0, unevaluated = 0;
for (const fx of manifest.fixtures) {
  const detail = [];
  let ok = true;
  const raw = readFileSync(join(root, "fixtures", fx.file), "utf8");

  // 1. schema expectation
  if (fx.schema) {
    const v = ajv.getSchema(fx.schema.against);
    const valid = v(frontmatter(raw));
    if (fx.schema.expect === "valid" && !valid) { ok = false; detail.push("schema: expected valid, got invalid: " + JSON.stringify(v.errors?.slice(0, 2))); }
    if (fx.schema.expect === "invalid" && valid) { ok = false; detail.push("schema: expected invalid, got valid"); }
  }

  // 2. projection expectation
  const proj = adapter.project(raw, fx.file);
  const codes = proj.diagnostics.map(d => d.code);
  for (const req of (fx.projection?.require_codes ?? [])) {
    const hits = codes.filter(c => codeMatch(req.code, c)).length;
    if (hits < (req.min_count ?? 1)) { ok = false; detail.push(`projection: required ${req.code} x${req.min_count ?? 1}, found ${hits}`); }
  }
  for (const bad of (fx.projection?.forbid_codes ?? [])) {
    if (codes.some(c => codeMatch(bad, c))) { ok = false; detail.push(`projection: forbidden ${bad} present`); }
  }
  for (const sev of (fx.projection?.forbid_severities ?? [])) {
    const offenders = proj.diagnostics.filter(d => d.severity === sev && !(fx.projection.allow_codes ?? []).includes(d.code));
    if (offenders.length) { ok = false; detail.push(`projection: forbidden severity ${sev}: ${offenders.map(d => d.code).join(",")}`); }
  }
  if (fx.projection?.effective_sensitivity === "restricted-or-stricter") {
    const idx = SENS_ORDER.indexOf(proj.effective?.sensitivity ?? "");
    if (idx < SENS_ORDER.indexOf("restricted")) { ok = false; detail.push(`projection: effective sensitivity '${proj.effective?.sensitivity}' is more open than 'restricted'`); }
  }

  // 3. Explicitly block any expectation this starter runner cannot execute.
  // A partial schema/projection check is not a pass for the whole fixture.
  const unexecuted = [];
  if (fx.pair) unexecuted.push("pair");
  if (fx.projection?.graph_expect) unexecuted.push("projection.graph_expect");
  if (unexecuted.length) {
    detail.push(`unevaluated expectations: ${unexecuted.join(", ")}`);
  }

  // 4. outcome, honoring declared known divergences only after every required
  // expectation has actually been evaluated.
  let outcome;
  if (unexecuted.length) { outcome = "unevaluated"; unevaluated++; }
  else if (ok) { outcome = "pass"; passed++; }
  else if (fx.known_divergence) { outcome = "known-divergence"; divergent++; }
  else { outcome = "fail"; failed++; }
  results.push({ fixture_id: fx.fixture_id, outcome, ...(outcome === "known-divergence" ? { divergence_ref: fx.known_divergence } : {}), ...(detail.length ? { detail: detail.join("; ") } : {}) });
  console.log(`${outcome.toUpperCase().padEnd(17)} ${fx.fixture_id}${detail.length ? "  — " + detail.join("; ") : ""}`);
}

const qualifyingProfiles = new Set(manifest.qualifying_profiles ?? []);
const cumulativeProfiles = ["GCP-1", "GCP-2", "GCP-3", "GCP-4", "GCP-5", "GCP-6", "GCP-7"];
const fixturesForProfile = (profile) => {
  const level = cumulativeProfiles.indexOf(profile);
  if (level < 0) return manifest.fixtures.filter((fixture) => fixture.profile === profile);
  return manifest.fixtures.filter((fixture) => {
    const fixtureLevel = cumulativeProfiles.indexOf(fixture.profile);
    return fixtureLevel >= 0 && fixtureLevel <= level;
  });
};
const profilesClaimed = [...qualifyingProfiles].filter((profile) => {
  const profileFixtures = fixturesForProfile(profile);
  return profileFixtures.length > 0 && profileFixtures.every((fixture) =>
    results.find((result) => result.fixture_id === fixture.fixture_id)?.outcome === "pass"
  );
});
const unevaluatedDetails = results
  .filter((result) => result.outcome === "unevaluated")
  .map((result) => `${result.fixture_id}: ${result.detail}`);
const limitations = [
  "single-actor separation-of-duties waiver (disposition: self-accepted)",
  ...(qualifyingProfiles.size === 0 ? [`catalog ${manifest.catalog_version} is a starter slice and declares no complete qualifying profile`] : []),
  ...(unevaluatedDetails.length ? [`unevaluated expectations — ${unevaluatedDetails.join("; ")}`] : []),
];

const claim = {
  claim_id: `claim-${new Date().toISOString().slice(0, 10)}-${adapter.implementation.name}`,
  implementation: adapter.implementation,
  standard: { gkos_release: manifest.gkos_release, technical_spec: "GKX 2.0", technical_spec_status: "developmental", last_ratified_baseline: "GKX 2.0" },
  profiles_claimed: profilesClaimed,
  attestation: { mode: "self-attested", attested_by: attestedBy },
  fixtures: { catalog_version: manifest.catalog_version, executed: results.length, fully_evaluated: results.length - skipped - unevaluated, passed, failed, skipped, unevaluated, results },
  limitations,
  exceptions: results.filter(r => r.outcome === "known-divergence").map(r => `${r.fixture_id}: ${r.divergence_ref} (see fixtures/DIVERGENCES.md)`),
  generated_at: new Date().toISOString().replace(/(\.\d{3})\d*Z$/, "$1Z"),
};
const vClaim = ajv.getSchema("conformance-manifest.schema.json");
if (!vClaim(claim)) { console.error("Generated claim does not satisfy conformance-manifest.schema.json:", vClaim.errors); process.exit(3); }
writeFileSync(outPath, JSON.stringify(claim, null, 2));
console.log(`\nclaim written: ${outPath}  (passed=${passed} failed=${failed} known-divergences=${divergent} unevaluated=${unevaluated})`);
process.exit(failed > 0 || unevaluated > 0 ? 1 : 0);
