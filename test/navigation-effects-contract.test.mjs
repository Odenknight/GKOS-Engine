import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  NAVIGATION_EFFECTS_CAPABILITIES,
  NAVIGATION_EFFECTS_CONTRACT_VERSION,
  getNavigationEffectsCapabilities,
} from "gkos-engine/navigation-effects";
import { getNavigationCapabilities } from "gkos-engine/navigation";

const contractRoot = resolve("contracts/navigation-effects/ENGINE-NAV-EFFECTS-CONTRACT-1.0.0");

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("Navigation Effects is separately versioned and default capability discovery is fail-closed", () => {
  assert.equal(NAVIGATION_EFFECTS_CONTRACT_VERSION, "1.0.0");
  assert.equal(NAVIGATION_EFFECTS_CAPABILITIES.navigation_effects.plan_moc_apply, true);
  for (const key of [
    "apply_managed_moc", "archive_previous_moc", "atomic_replace",
    "startup_recovery", "rollback_execution", "agent_note_create",
    "agent_note_update", "agent_note_archive", "arbitrary_source_write",
    "agent_note_delete",
  ]) assert.equal(NAVIGATION_EFFECTS_CAPABILITIES.navigation_effects[key], false, key);
  assert.deepEqual(NAVIGATION_EFFECTS_CAPABILITIES.configured, {
    adapter: false,
    authority_provider: false,
    durable_journal: false,
    policy: false,
  });
  assert.equal(Object.isFrozen(NAVIGATION_EFFECTS_CAPABILITIES), true);
  assert.equal(Object.isFrozen(NAVIGATION_EFFECTS_CAPABILITIES.navigation_effects), true);
});

test("effect capability dependencies are reported independently and deletion remains disabled", () => {
  const adapterOnly = getNavigationEffectsCapabilities({ adapterConfigured: true });
  assert.equal(adapterOnly.navigation_effects.atomic_replace, true);
  assert.equal(adapterOnly.navigation_effects.archive_previous_moc, false);
  assert.equal(adapterOnly.navigation_effects.apply_managed_moc, false);

  const durableAdapter = getNavigationEffectsCapabilities({
    adapterConfigured: true,
    durableJournalConfigured: true,
  });
  assert.equal(durableAdapter.navigation_effects.archive_previous_moc, false);
  assert.equal(durableAdapter.navigation_effects.startup_recovery, false);
  assert.equal(durableAdapter.navigation_effects.apply_managed_moc, false);

  const policyBoundDurableAdapter = getNavigationEffectsCapabilities({
    adapterConfigured: true,
    durableJournalConfigured: true,
    policyConfigured: true,
  });
  assert.equal(policyBoundDurableAdapter.navigation_effects.archive_previous_moc, true);
  assert.equal(policyBoundDurableAdapter.navigation_effects.startup_recovery, true);
  assert.equal(policyBoundDurableAdapter.navigation_effects.apply_managed_moc, false);

  const configured = getNavigationEffectsCapabilities({
    adapterConfigured: true,
    authorityProviderConfigured: true,
    durableJournalConfigured: true,
    policyConfigured: true,
  });
  assert.equal(configured.navigation_effects.apply_managed_moc, true);
  assert.equal(configured.navigation_effects.agent_note_create, true);
  assert.equal(configured.navigation_effects.agent_note_update, true);
  assert.equal(configured.navigation_effects.agent_note_archive, true);
  assert.equal(configured.navigation_effects.arbitrary_source_write, false);
  assert.equal(configured.navigation_effects.agent_note_delete, false);
});

test("Navigation 1.0 capability truth remains unchanged", () => {
  const navigation = getNavigationCapabilities({
    governanceStoreConfigured: true,
    validAuthorityPathActive: true,
  });
  assert.equal(navigation.navigation_contract, "1.0.0");
  assert.equal(navigation.navigation.apply_moc, false);
  assert.equal(navigation.navigation.source_content_write, false);
  assert.equal(navigation.navigation.rollback_execution, false);
  assert.equal("navigation_effects" in navigation, false);
});

test("framework-neutral effects source has no filesystem dependency or Node executor primitive", async () => {
  const root = resolve("src/navigation-effects");
  const names = (await readdir(root)).filter((name) => name.endsWith(".ts"));
  assert.deepEqual(names.sort(), ["capabilities.ts", "in-memory-adapter.ts", "index.ts", "markers.ts", "path-policy.ts", "planner.ts", "types.ts"]);
  const source = (await Promise.all(names.map((name) => readFile(join(root, name), "utf8")))).join("\n");
  assert.doesNotMatch(source, /["'](?:node:)?fs(?:\/promises)?["']/);
  assert.doesNotMatch(source, /\b(?:writeFile|appendFile|rename|unlink|mkdir|createWriteStream)\s*\(/);
  assert.doesNotMatch(source, /class\s+Node.*Executor/);
});

test("contract pack is integration-only, effects-separated, and mechanically complete", async () => {
  const manifest = await json(join(contractRoot, "manifest.json"));
  assert.equal(manifest.suite, "ENGINE-NAV-EFFECTS-CONTRACT-1.0.0");
  assert.equal(manifest.navigation_effects_contract, "1.0.0");
  assert.equal(manifest.navigation_contract, "1.0.0");
  assert.equal(manifest.standing, "integration-only");
  assert.equal(manifest.gkos_conformance, false);
  assert.equal(manifest.implementation_phase, "node-executor-experimental");
  assert.equal(manifest.source_content_effect, "explicit-host-adapter-only");
  assert.equal(manifest.effect_execution_included, true);

  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  const schemas = [];
  for (const relative of manifest.schemas) {
    const schema = await json(join(contractRoot, relative));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema", relative);
    assert.match(schema.$id, /\/navigation-effects\/1\.0\.0\//, relative);
    assert.equal(schema.type, "object", relative);
    assert.equal(schema.additionalProperties, false, relative);
    schemas.push([relative, schema]);
  }
  for (const [, schema] of schemas) ajv.addSchema(schema);
  for (const [relative, schema] of schemas) assert.doesNotThrow(() => ajv.getSchema(schema.$id), relative);
  const effectIdPattern = "^effect:(?:[0-9a-f]{32}|rollback:[0-9a-f]{32})$";
  const effectIdSchemas = new Map(schemas.filter(([relative]) => [
    "schemas/agent-write-result.schema.json",
    "schemas/archive-diff.schema.json",
    "schemas/archive-manifest.schema.json",
    "schemas/effect-plan.schema.json",
    "schemas/journal-entry.schema.json",
    "schemas/receipt.schema.json",
    "schemas/recovery-result.schema.json",
  ].includes(relative)));
  for (const [relative, schema] of effectIdSchemas) {
    const effectId = relative === "schemas/archive-manifest.schema.json"
      ? schema.properties.effects.items.properties.effectId
      : relative === "schemas/archive-diff.schema.json"
        ? schema.properties.items.items.properties.effectId
        : schema.properties.effectId;
    assert.equal(effectId.pattern, effectIdPattern, relative);
    const expression = new RegExp(effectId.pattern);
    assert.equal(expression.test("effect:a/b"), false, relative);
    assert.equal(expression.test("effect:a?b"), false, relative);
    assert.equal(expression.test(`effect:${"a".repeat(32)}`), true, relative);
    assert.equal(expression.test(`effect:rollback:${"b".repeat(32)}`), true, relative);
  }
});

test("all required adversarial fixtures are registered and remain effect-free", async () => {
  const fixtureManifest = await json(join(contractRoot, "fixtures.manifest.json"));
  assert.equal(fixtureManifest.standing, "integration-only");
  assert.equal(fixtureManifest.gkos_conformance, false);
  const required = new Map([
    ["effects-managed-moc-success", "planned"],
    ["effects-byte-identical-no-op", "no-op"],
    ["effects-precondition-stale", "stale"],
    ["effects-authority-denied", "denied"],
    ["effects-agent-cas-conflict", "conflict"],
    ["effects-startup-recovery", "effect-present-verified"],
    ["effects-malformed-generated-markers", "review-required"],
    ["effects-path-escape-denied", "denied"],
    ["effects-ambiguous-lineage-preserved", "review-required"],
  ]);
  assert.equal(fixtureManifest.fixtures.length, required.size);

  for (const entry of fixtureManifest.fixtures) {
    assert.equal(required.get(entry.id), entry.expected, entry.id);
    const fixture = await json(join(contractRoot, entry.file));
    assert.equal(fixture.fixtureId, entry.id);
    assert.equal(fixture.expected.outcome, entry.expected);
    assert.equal(fixture.expected.sourceWrite, false);
    assert.ok(Array.isArray(fixture.expected.reasonCodes));
    required.delete(entry.id);
  }
  assert.equal(required.size, 0);
});

test("security and lineage fixtures encode fail-closed outcomes without content disclosure", async () => {
  const pathEscape = await json(join(contractRoot, "fixtures/path-escape.json"));
  assert.equal(pathEscape.input.requestedName, "../other-agent/private.md");
  assert.deepEqual(pathEscape.expected.reasonCodes, ["PATH_TRAVERSAL"]);
  assert.equal(pathEscape.expected.currentContentIncluded, false);

  const conflict = await json(join(contractRoot, "fixtures/conflict.json"));
  assert.equal(conflict.expected.currentContentIncluded, false);
  assert.equal("currentContent" in conflict.expected, false);

  const markers = await json(join(contractRoot, "fixtures/malformed-markers.json"));
  assert.deepEqual(markers.expected.reasonCodes, ["MARKER_NESTED"]);

  const lineage = await json(join(contractRoot, "fixtures/ambiguous-lineage.json"));
  assert.equal(lineage.input.branches.length, 2);
  assert.equal(lineage.expected.preserveBranches, true);
  assert.equal(lineage.expected.sourceWrite, false);
});

test("package export and build products include Navigation Effects without changing release metadata", async () => {
  const pkg = await json(resolve("package.json"));
  assert.equal(pkg.version, "2.1.2");
  assert.equal(pkg.exports["./navigation-effects"].types, "./dist/navigation-effects/index.d.ts");
  assert.equal(pkg.exports["./navigation-effects/node"].types, "./dist/navigation-effects/node/index.d.ts");
  await Promise.all([
    "dist/navigation-effects/index.d.ts",
    "dist/navigation-effects/capabilities.d.ts",
    "dist/navigation-effects/types.d.ts",
    "dist/navigation-effects.mjs",
    "dist/navigation-effects/node/index.d.ts",
    "dist/navigation-effects-node.mjs",
  ].map((path) => readFile(resolve(path))));
});
