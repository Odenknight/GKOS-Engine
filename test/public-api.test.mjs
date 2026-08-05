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
import * as compatibilityEntry from "../dist/kosmos-core.mjs";
import { createGkosEngineAdapter as createAdapterFromSubpath } from "gkos-engine/adapter";
import { GKX23_PROFILE as gkxProfileFromSubpath } from "gkos-engine/gkx";
import { buildGraphitiEpisodes as graphitiFromSubpath } from "gkos-engine/graphiti";

test("canonical GKX API aliases preserve compatibility behavior", () => {
  assert.equal(GKX23_PROFILE, "okf-plus-2.3-validating-projection");
  assert.equal(typeof parseGkx, "function");
  assert.equal(typeof buildGkx23Projection, "function");
  assert.equal(typeof makeGkxUuidV7, "function");
  assert.equal(GkxIndex, compatibilityEntry.KosmosIndex);
  assert.equal(compatibilityEntry.createGkosEngineAdapter, createGkosEngineAdapter);
  assert.equal(createAdapterFromSubpath().name, ENGINE_NAME);
  assert.equal(gkxProfileFromSubpath, GKX23_PROFILE);
  assert.equal(typeof graphitiFromSubpath, "function");
});

test("downstream adapter is immutable, policy-bound, and product-neutral", () => {
  const adapter = createGkosEngineAdapter({ projection: { defaultSensitivity: "internal" } });
  assert.equal(adapter.name, ENGINE_NAME);
  assert.equal(adapter.version, ENGINE_VERSION);
  assert.equal(Object.isFrozen(adapter), true);

  const file = {
    relativePath: "evidence.md",
    content: "---\nokf_version: 2.3\nuid: 123e4567-e89b-42d3-a456-426614174000\ntype: evidence\ntitle: Evidence\nepistemic_state: hypothesis\n---\nBody",
  };
  const graph = adapter.buildGraph([file]);
  assert.equal(graph.nodes.find((node) => node.path === "evidence.md")?.okf?.projection?.effective.sensitivity, "internal");

  const index = adapter.createIndex();
  assert.ok(index instanceof GkxIndex);
});
