import assert from "node:assert/strict";
import test from "node:test";

import {
  ENGINE_NAME,
  ENGINE_VERSION,
  GKX23_PROFILE,
  GkxIndex,
  buildGkx23Projection,
  createGkosEngineAdapter,
  makeGkxUuidV7,
  parseGkx,
} from "../dist/gkos-engine.mjs";
import { createGkosEngineAdapter as createAdapterFromSubpath } from "gkos-engine/adapter";
import { GKX23_PROFILE as gkxProfileFromSubpath } from "gkos-engine/gkx";
import { buildGraphitiEpisodes as graphitiFromSubpath } from "gkos-engine/graphiti";
import {
  NAVIGATION_CAPABILITIES as navigationCapabilitiesFromSubpath,
  discoverNavigation as discoverNavigationFromSubpath,
  generateNavigationCandidates as generateNavigationCandidatesFromSubpath,
} from "gkos-engine/navigation";
import {
  InMemoryGovernanceStore as GovernanceStoreFromSubpath,
  buildStateChangeReceipt as buildStateChangeReceiptFromSubpath,
} from "gkos-engine/governance";

test("canonical GKX API is available from the engine and package subpaths", () => {
  assert.equal(GKX23_PROFILE, "gkx-2.3-validating-projection");
  assert.equal(typeof parseGkx, "function");
  assert.equal(typeof buildGkx23Projection, "function");
  assert.equal(typeof makeGkxUuidV7, "function");
  assert.equal(typeof GkxIndex, "function");
  assert.equal(createAdapterFromSubpath().name, ENGINE_NAME);
  assert.equal(gkxProfileFromSubpath, GKX23_PROFILE);
  assert.equal(typeof graphitiFromSubpath, "function");
  assert.equal(typeof discoverNavigationFromSubpath, "function");
  assert.equal(typeof generateNavigationCandidatesFromSubpath, "function");
  assert.equal(navigationCapabilitiesFromSubpath.navigation.source_content_write, false);
  assert.equal(typeof GovernanceStoreFromSubpath, "function");
  assert.equal(typeof buildStateChangeReceiptFromSubpath, "function");
});

test("downstream adapter is immutable, policy-bound, and product-neutral", () => {
  const adapter = createGkosEngineAdapter({ projection: { defaultSensitivity: "internal" } });
  assert.equal(adapter.name, ENGINE_NAME);
  assert.equal(adapter.version, ENGINE_VERSION);
  assert.equal(Object.isFrozen(adapter), true);

  const file = {
    relativePath: "evidence.md",
    content: "---\ngkx_version: 2.3\nuid: 123e4567-e89b-42d3-a456-426614174000\ntype: evidence\ntitle: Evidence\nepistemic_state: hypothesis\n---\nBody",
  };
  const graph = adapter.buildGraph([file]);
  assert.equal(graph.nodes.find((node) => node.path === "evidence.md")?.gkx?.projection?.effective.sensitivity, "internal");

  const index = adapter.createIndex();
  assert.ok(index instanceof GkxIndex);
});
